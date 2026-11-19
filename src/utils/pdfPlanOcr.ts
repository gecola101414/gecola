import { createWorker, PSM, Worker } from 'tesseract.js';
import {
  classifyPlanToken,
  DetectedRoomBlock,
  detectRoomsOnPage,
  PlanBBox,
  PlanToken,
  QuoteUnit,
} from './pdfPlanExtractor';

export interface OcrScanProgress {
  phase: 'prepare' | 'horizontal' | 'vertical' | 'postprocess';
  label: string;
  progress: number; // 0..100
}

export interface OcrScanResult {
  tokens: PlanToken[];
  rooms: DetectedRoomBlock[];
  detectedScaleDenominator?: number;
  detectedHeightM?: number;
  pageTitle?: string;
}

export interface RawOcrWord {
  text: string;
  conf: number;
  x1: number; // PDF viewport scale=1
  y1: number;
  x2: number;
  y2: number;
  orientation: 'horizontal' | 'vertical';
  angleDeg?: number;
}

function getTesseractPaths() {
  if (typeof window !== 'undefined' && /^https?:/.test(window.location?.href || '')) {
    const origin = window.location.origin;
    return {
      workerPath: `${origin}/tesseract/worker.min.js`,
      corePath: `${origin}/tesseract/`,
      langPath: `${origin}/tesseract/`,
      workerBlobURL: false,
    };
  }
  return {
    langPath: './public/tesseract',
    cacheMethod: 'none' as const,
  };
}

// Pool persistente a 2 worker paralleli (orizzontale + verticale) per eliminare il cold-start ad ogni pagina
interface PersistentWorkerPair {
  wHoriz: Worker;
  wVert: Worker;
}

let workerPoolPromise: Promise<PersistentWorkerPair> | null = null;
let workerPoolInstance: PersistentWorkerPair | null = null;

async function initSingleWorker(): Promise<Worker> {
  const paths = getTesseractPaths();
  const w = await createWorker('ita', 1, paths);
  await w.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    user_defined_dpi: '260',
  });
  return w;
}

export function warmupOcrWorkers(): Promise<PersistentWorkerPair> {
  if (workerPoolInstance) return Promise.resolve(workerPoolInstance);
  if (workerPoolPromise) return workerPoolPromise;

  workerPoolPromise = (async () => {
    try {
      const [wHoriz, wVert] = await Promise.all([initSingleWorker(), initSingleWorker()]);
      workerPoolInstance = { wHoriz, wVert };
      return workerPoolInstance;
    } catch (err) {
      workerPoolPromise = null;
      workerPoolInstance = null;
      throw err;
    }
  })();

  return workerPoolPromise;
}

export async function resetOcrWorkers(): Promise<void> {
  const inst = workerPoolInstance;
  workerPoolInstance = null;
  workerPoolPromise = null;
  if (inst) {
    await Promise.allSettled([inst.wHoriz.terminate(), inst.wVert.terminate()]);
  }
}

export function cleanOcrWordText(raw: string): string {
  let s = raw.replace(/[\u2018\u2019`‘’´]/g, "'").trim();
  if (!s) return '';

  // Rimuove barre verticali / apici / punteggiatura spuria ai bordi di parole o numeri
  s = s.replace(/^[|[\]{}'"]+|[|[\]{}'"]+$/g, '').trim();
  if (!s) return '';

  // Rimuove prefissi/suffissi spuri da linee di quota tratteggiate intorno a numeri decimali
  // es. "-8,20--" -> "8,20", "'3,00" -> "3,00", "~4,85." -> "4,85", "1,85;" -> "1,85"
  if (/^[-–—~•·.=:,;'"]*\d{1,4}[.,;:]\d{1,3}[-–—~•·.=:,;'"]*$/.test(s)) {
    const stripped = s
      .replace(/^[-–—~•·.=:,;'"]+/, '')
      .replace(/[-–—~•·.=:,;'"]+$/, '');
    // Converte ":" o ";" in virgola decimale SOLO se non è un rapporto di scala 1:xx / 1:xxx
    if (/^\d{1,4}[:;]\d{2}$/.test(stripped) && !/^1:(?:5|10|20|25|50|75|100|150|200|250|500|1000)$/.test(stripped)) {
      s = stripped.replace(/[:;]/, ',');
    } else if (/^\d{1,4}[.,;]\d{1,3}$/.test(stripped)) {
      s = stripped.replace(';', ',');
    }
  } else if (/^[-+]?\d{1,4}[.,;]\d{1,3}[-–—.:]*$/.test(s)) {
    s = s.replace(/^[-+]/, '').replace(/[-–—.:]+$/, '').replace(';', ',');
  }

  // Normalizza unità "m2", "m?", "mq", "mè", "mo", "m°", "in?" isolati
  if (/^(?:m[2?èéo°]|mq|m²|in\?)$/i.test(s)) {
    return 'm²';
  }

  // Pulisce punto finale su nomi stanza tipo "Ingresso." -> "Ingresso" (ma preserva "Rip.")
  if (/^[A-Za-zÀ-ÿ]{4,}\.$/.test(s)) {
    s = s.slice(0, -1);
  }

  return s;
}

function isLikelyNoiseWord(text: string, conf: number, quoteUnit: QuoteUnit): boolean {
  const s = text.trim();
  if (!s) return true;
  if (s === 'm²') return false;

  const classified = classifyPlanToken(s, quoteUnit);
  if (classified.kind !== 'other') {
    // Esclude singoli interi spuri tipo "8", "3", "7", "5" a bassa confidenza a meno che non siano "1:..."
    if (classified.kind === 'dimension' && !/[.,]/.test(s)) {
      if (s.length <= 1 && conf < 95) return true;
      if (s.length === 2 && conf < 86) return true;
      if (s.length >= 3 && conf < 62) return true;
    }
    return false;
  }

  // Preserva parole tecniche note anche con punteggiatura
  if (/^(?:PIANTA|APPARTAMENTO|SCALA|DISEGNO|ALLEGATO|PIANO|TAVOLA|STATO|PROGETTO|WC|RIP\.?)$/i.test(s)) {
    return false;
  }

  // Scarta simboli isolati e frammenti di 1-2 caratteri senza cifre
  if (s.length <= 2 && !/\d/.test(s)) {
    return true;
  }

  // Scarta stringhe prive di lettere o cifre reali
  if (!/[A-Za-z0-9]/.test(s)) {
    return true;
  }

  // Parole testuali generiche solo se abbastanza lunghe e nitide
  const alphaCount = (s.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (alphaCount >= 4 && conf >= 68) {
    return false;
  }

  return true;
}

function boxIou(a: PlanBBox, b: PlanBBox): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  const areaA = Math.max(1, (a.x2 - a.x1) * (a.y2 - a.y1));
  const areaB = Math.max(1, (b.x2 - b.x1) * (b.y2 - b.y1));
  return inter / Math.min(areaA, areaB);
}

/**
 * Converte la matrice binarizzata/grigia del canvas riducendo i puntini isolati 1px tipici delle scansioni.
 */
function preprocessCanvasInPlace(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const lum = new Uint8Array(w * h);

  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    const gray = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
    lum[i] = gray < 185 ? 0 : 255;
  }

  // Despeckle rapido 1px: rimuove pixel neri completamente isolati (<= 1 vicino nero su 8)
  for (let y = 1; y < h - 1; y++) {
    const rowOff = y * w;
    for (let x = 1; x < w - 1; x++) {
      const idx = rowOff + x;
      let val = lum[idx];
      if (val === 0) {
        let nb = 0;
        if (lum[idx - 1] === 0) nb++;
        if (lum[idx + 1] === 0) nb++;
        if (lum[idx - w] === 0) nb++;
        if (lum[idx + w] === 0) nb++;
        if (lum[idx - w - 1] === 0) nb++;
        if (lum[idx - w + 1] === 0) nb++;
        if (lum[idx + w - 1] === 0) nb++;
        if (lum[idx + w + 1] === 0) nb++;
        if (nb <= 1) {
          val = 255;
        }
      }
      const p = idx * 4;
      d[p] = val;
      d[p + 1] = val;
      d[p + 2] = val;
      d[p + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

function buildRotatedCanvas90CW(srcCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = srcCanvas.height;
  rotCanvas.height = srcCanvas.width;
  const rctx = rotCanvas.getContext('2d');
  if (!rctx) return rotCanvas;

  rctx.fillStyle = '#ffffff';
  rctx.fillRect(0, 0, rotCanvas.width, rotCanvas.height);
  rctx.translate(rotCanvas.width, 0);
  rctx.rotate(Math.PI / 2);
  rctx.drawImage(srcCanvas, 0, 0);
  return rotCanvas;
}

function buildRotatedCanvas90CCW(srcCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = srcCanvas.height;
  rotCanvas.height = srcCanvas.width;
  const rctx = rotCanvas.getContext('2d');
  if (!rctx) return rotCanvas;

  rctx.fillStyle = '#ffffff';
  rctx.fillRect(0, 0, rotCanvas.width, rotCanvas.height);
  rctx.translate(0, rotCanvas.height);
  rctx.rotate(-Math.PI / 2);
  rctx.drawImage(srcCanvas, 0, 0);
  return rotCanvas;
}

/**
 * Unisce parole contigue sulla stessa riga (funziona sia per righe orizzontali sia per righe verticali!)
 */
function mergeLineWords(lines: RawOcrWord[][], axis: 'horizontal' | 'vertical'): RawOcrWord[] {
  const merged: RawOcrWord[] = [];

  for (const rawLine of lines) {
    // Orizzontale: ordina sinistra->destra; Verticale: ordina in base all'andamento lungo Y (basso->alto o alto->basso)
    const sorted =
      axis === 'horizontal'
        ? [...rawLine].sort((a, b) => a.x1 - b.x1)
        : [...rawLine].sort((a, b) => a.y1 - b.y1);

    const lineBuffer: RawOcrWord[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      if (!cur.text) continue;

      const prev = lineBuffer[lineBuffer.length - 1];
      if (prev) {
        const gap = axis === 'horizontal' ? cur.x1 - prev.x2 : cur.y1 - prev.y2;
        const thicknessRef =
          axis === 'horizontal'
            ? Math.max(prev.y2 - prev.y1, cur.y2 - cur.y1, 8)
            : Math.max(prev.x2 - prev.x1, cur.x2 - cur.x1, 8);
        const sameBand =
          axis === 'horizontal'
            ? Math.abs((prev.y1 + prev.y2) / 2 - (cur.y1 + cur.y2) / 2) <= thicknessRef * 0.75
            : Math.abs((prev.x1 + prev.x2) / 2 - (cur.x1 + cur.x2) / 2) <= thicknessRef * 0.75;

        // 1) Unisce frammento decimale spezzato es. "4," + "35" -> "4,35" (o in verticale: "35" + "4," a seconda del verso)
        if (sameBand && gap >= -4 && gap <= thicknessRef * 0.9) {
          const splitA = /^\d{1,3}[.,]$/.test(prev.text) && /^\d{1,3}$/.test(cur.text);
          const splitB = /^\d{1,3}$/.test(prev.text) && /^[.,]\d{1,3}$/.test(cur.text);
          const splitRev = /^\d{1,3}$/.test(prev.text) && /^\d{1,3}[.,]$/.test(cur.text) && axis === 'vertical';
          if (splitA || splitB) {
            prev.text = `${prev.text}${cur.text}`;
            prev.x1 = Math.min(prev.x1, cur.x1);
            prev.y1 = Math.min(prev.y1, cur.y1);
            prev.x2 = Math.max(prev.x2, cur.x2);
            prev.y2 = Math.max(prev.y2, cur.y2);
            prev.conf = Math.round((prev.conf + cur.conf) / 2);
            continue;
          }
          if (splitRev) {
            prev.text = `${cur.text}${prev.text}`;
            prev.x1 = Math.min(prev.x1, cur.x1);
            prev.y1 = Math.min(prev.y1, cur.y1);
            prev.x2 = Math.max(prev.x2, cur.x2);
            prev.y2 = Math.max(prev.y2, cur.y2);
            prev.conf = Math.round((prev.conf + cur.conf) / 2);
            continue;
          }
        }

        // 2) Unisce numero decimale + "m²" -> "57,40 m²"
        if (sameBand && gap <= thicknessRef * 2.2) {
          if (/^\d{1,5}[.,]\d{1,3}$/.test(prev.text) && cur.text === 'm²') {
            prev.text = `${prev.text} m²`;
            prev.x1 = Math.min(prev.x1, cur.x1);
            prev.y1 = Math.min(prev.y1, cur.y1);
            prev.x2 = Math.max(prev.x2, cur.x2);
            prev.y2 = Math.max(prev.y2, cur.y2);
            prev.conf = Math.round((prev.conf + cur.conf) / 2);
            continue;
          }
          if (axis === 'vertical' && prev.text === 'm²' && /^\d{1,5}[.,]\d{1,3}$/.test(cur.text)) {
            prev.text = `${cur.text} m²`;
            prev.x1 = Math.min(prev.x1, cur.x1);
            prev.y1 = Math.min(prev.y1, cur.y1);
            prev.x2 = Math.max(prev.x2, cur.x2);
            prev.y2 = Math.max(prev.y2, cur.y2);
            prev.conf = Math.round((prev.conf + cur.conf) / 2);
            continue;
          }
        }

        // 3) Unisce parole testuali sulla stessa riga (es. "Vano" + "Scale", "PIANTA" + "APPARTAMENTO", "Scala" + "1:100")
        const prevHasAlpha = /[A-Za-zÀ-ÿ]{2,}/.test(prev.text) && !/\d/.test(prev.text) && prev.text !== 'm²';
        const curIsRoomOrScale =
          (/[A-Za-zÀ-ÿ]{2,}/.test(cur.text) || /^1\s*[:/]\s*\d{2,4}$/.test(cur.text)) && cur.text !== 'm²';

        if (sameBand && gap >= -4 && gap <= thicknessRef * 1.9 && prevHasAlpha && curIsRoomOrScale) {
          prev.text = axis === 'vertical' && (prev.angleDeg ?? -90) === -90 ? `${cur.text} ${prev.text}` : `${prev.text} ${cur.text}`;
          prev.x1 = Math.min(prev.x1, cur.x1);
          prev.y1 = Math.min(prev.y1, cur.y1);
          prev.x2 = Math.max(prev.x2, cur.x2);
          prev.y2 = Math.max(prev.y2, cur.y2);
          prev.conf = Math.round((prev.conf + cur.conf) / 2);
          continue;
        }
      }

      lineBuffer.push({ ...cur });
    }

    merged.push(...lineBuffer);
  }

  return merged;
}

function tokenKindPriority(kind: string): number {
  switch (kind) {
    case 'surface':
    case 'dimension':
      return 4;
    case 'room':
    case 'perimeter':
    case 'height':
    case 'scale':
      return 3;
    default:
      return 1;
  }
}

export function postProcessOcrWords(
  horizLines: RawOcrWord[][],
  vertInput: RawOcrWord[] | RawOcrWord[][],
  pageNumber: number,
  quoteUnit: QuoteUnit
): OcrScanResult {
  const mergedHoriz = mergeLineWords(horizLines, 'horizontal');

  // Supporta sia RawOcrWord[][] (linee verticali raggruppate) sia RawOcrWord[] legacy
  const vertLines: RawOcrWord[][] =
    Array.isArray(vertInput) && vertInput.length > 0 && Array.isArray(vertInput[0])
      ? (vertInput as RawOcrWord[][])
      : (vertInput as RawOcrWord[]).map((w) => [w]);
  const mergedVert = mergeLineWords(vertLines, 'vertical');

  // Normalizza eventuale "ip" vicino ad un token superficie ("1,06 m²") in "Rip."
  const prelimSurfaces = [...mergedHoriz, ...mergedVert].filter((w) => /\d+[.,]\d+\s*m²/.test(w.text));
  for (const w of [...mergedHoriz, ...mergedVert]) {
    if (/^r?ip\.?$/i.test(w.text.trim())) {
      const cx = (w.x1 + w.x2) / 2;
      const cy = (w.y1 + w.y2) / 2;
      const nearSurf = prelimSurfaces.some((sf) => Math.hypot((sf.x1 + sf.x2) / 2 - cx, (sf.y1 + sf.y2) / 2 - cy) <= 45);
      if (nearSurf) {
        w.text = 'Rip.';
      }
    }
  }

  // Se sotto un'etichetta Vano priva di token "m²" c'è un numero decimale centrato (es. Letto -> 17,13, Cucina -> 39,78, WC -> 3,98),
  // promuovilo a superficie "m²" (l'apice ² viene spesso perso nella scansione).
  const prelimRooms = mergedHoriz.filter((w) => classifyPlanToken(w.text, quoteUnit).kind === 'room');
  for (const rm of prelimRooms) {
    const rcx = (rm.x1 + rm.x2) / 2;
    const rcy = (rm.y1 + rm.y2) / 2;
    const alreadyHasSurf = prelimSurfaces.some(
      (sf) => Math.hypot((sf.x1 + sf.x2) / 2 - rcx, (sf.y1 + sf.y2) / 2 - rcy) <= 55
    );
    if (alreadyHasSurf) continue;

    for (const w of mergedHoriz) {
      if (!/^\d{1,4}[.,]\d{2}$/.test(w.text.trim())) continue;
      const wcx = (w.x1 + w.x2) / 2;
      const wcy = (w.y1 + w.y2) / 2;
      const dx = Math.abs(wcx - rcx);
      const dy = wcy - rcy;
      if (dx <= 22 && dy > 6 && dy <= 42) {
        w.text = `${w.text.trim()} m²`;
        break;
      }
    }
  }

  const allCandidates: RawOcrWord[] = [];
  for (const w of mergedHoriz) {
    if (!isLikelyNoiseWord(w.text, w.conf, quoteUnit)) {
      allCandidates.push(w);
    }
  }

  // Accetta TUTTI i token verticali validi (quote decimali/intere, m², m, H=, vani e testi leggibili!)
  for (const vw of mergedVert) {
    if (isLikelyNoiseWord(vw.text, vw.conf, quoteUnit)) continue;

    const vwBox: PlanBBox = { x1: vw.x1, y1: vw.y1, x2: vw.x2, y2: vw.y2 };
    const vwClass = classifyPlanToken(vw.text, quoteUnit);
    const vwPrio = tokenKindPriority(vwClass.kind);

    let suppressed = false;
    for (let i = allCandidates.length - 1; i >= 0; i--) {
      const hw = allCandidates[i];
      const hwBox: PlanBBox = { x1: hw.x1, y1: hw.y1, x2: hw.x2, y2: hw.y2 };
      if (boxIou(hwBox, vwBox) > 0.35) {
        const hwClass = classifyPlanToken(hw.text, quoteUnit);
        const hwPrio = tokenKindPriority(hwClass.kind);
        // Se il token verticale è più nitido o è una quota su asse stretto verticalmente, sostituisci il residuo orizzontale
        const hwAspect = (hw.x2 - hw.x1) / Math.max(1, hw.y2 - hw.y1);
        const vwAspect = (vw.y2 - vw.y1) / Math.max(1, vw.x2 - vw.x1);
        const vertLooksStronger =
          vwPrio > hwPrio ||
          (vwPrio === hwPrio && vwAspect > 1.35 && hwAspect < 1.35) ||
          (vwPrio === hwPrio && vw.conf >= hw.conf + 8);

        if (vertLooksStronger) {
          allCandidates.splice(i, 1);
        } else {
          suppressed = true;
          break;
        }
      }
    }

    if (!suppressed) {
      allCandidates.push(vw);
    }
  }

  return buildAnalysisFromRawTokens(allCandidates, pageNumber, quoteUnit);
}

export function buildAnalysisFromRawTokens(
  candidates: Array<{
    id?: string;
    text: string;
    conf?: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    orientation: 'horizontal' | 'vertical' | 'angled';
    angleDeg?: number;
    source?: 'vector' | 'ocr' | 'manual';
  }>,
  pageNumber: number,
  quoteUnit: QuoteUnit
): OcrScanResult {
  const tokens: PlanToken[] = [];
  let detectedScaleDenominator: number | undefined;
  let detectedHeightM: number | undefined;
  let pageTitle: string | undefined;

  candidates.forEach((c, idx) => {
    const str = c.text.trim();
    if (!str) return;
    const classified = classifyPlanToken(str, quoteUnit);

    if (classified.kind === 'scale' && classified.numericValue) {
      detectedScaleDenominator = classified.numericValue;
    }
    if (classified.kind === 'height' && classified.numericValue && !detectedHeightM) {
      detectedHeightM = classified.numericValue;
    }
    if (!pageTitle && /PIANTA|APPARTAMENTO|PLANIMETRIA/i.test(str)) {
      pageTitle = str;
    }

    const w = Math.max(10, c.x2 - c.x1);
    const h = Math.max(8, c.y2 - c.y1);

    tokens.push({
      id: c.id || `ocr_p${pageNumber}_t${idx}`,
      str,
      kind: classified.kind,
      rawValue: classified.rawValue,
      numericValue: classified.numericValue,
      x: c.x1,
      y: c.y1,
      cx: (c.x1 + c.x2) / 2,
      cy: (c.y1 + c.y2) / 2,
      w,
      h,
      angleDeg: c.angleDeg ?? (c.orientation === 'vertical' ? -90 : 0),
      orientation: c.orientation,
      bbox: { x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 },
      source: c.source || 'ocr',
      confidence: c.conf,
    });
  });

  const rooms = detectRoomsOnPage(tokens, detectedHeightM);
  return { tokens, rooms, detectedScaleDenominator, detectedHeightM, pageTitle };
}

export function reclassifyPlanTokens(
  tokens: PlanToken[],
  quoteUnit: QuoteUnit,
  detectedHeightM?: number
): { tokens: PlanToken[]; rooms: DetectedRoomBlock[]; detectedScaleDenominator?: number } {
  let detectedScaleDenominator: number | undefined;
  const updated = tokens.map((tok) => {
    const classified = classifyPlanToken(tok.str, quoteUnit);
    if (classified.kind === 'scale' && classified.numericValue) {
      detectedScaleDenominator = classified.numericValue;
    }
    return {
      ...tok,
      kind: classified.kind,
      rawValue: classified.rawValue,
      numericValue: classified.numericValue,
    };
  });
  const rooms = detectRoomsOnPage(updated, detectedHeightM);
  return { tokens: updated, rooms, detectedScaleDenominator };
}

function extractHorizLinesFromData(data: any, renderScale: number): RawOcrWord[][] {
  const lines: RawOcrWord[][] = [];
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const words: RawOcrWord[] = [];
        for (const w of line.words || []) {
          const text = cleanOcrWordText(w.text || '');
          if (!text || w.confidence < 35) continue;
          words.push({
            text,
            conf: w.confidence,
            x1: w.bbox.x0 / renderScale - 1.5,
            y1: w.bbox.y0 / renderScale - 1.5,
            x2: w.bbox.x1 / renderScale + 1.5,
            y2: w.bbox.y1 / renderScale + 1.5,
            orientation: 'horizontal',
            angleDeg: 0,
          });
        }
        if (words.length > 0) lines.push(words);
      }
    }
  }
  return lines;
}

function extractVertLinesFrom90CW(data: any, renderScale: number, origW: number, origH: number): RawOcrWord[][] {
  const lines: RawOcrWord[][] = [];
  const maxW = origW / renderScale;
  const maxH = origH / renderScale;

  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const words: RawOcrWord[] = [];
        for (const w of line.words || []) {
          const text = cleanOcrWordText(w.text || '');
          if (!text || w.confidence < 32) continue;
          // Inversa da 90° CW (nx = H - y, ny = x) -> (x = ny, y = H - nx)
          const origX1 = w.bbox.y0 / renderScale - 1.5;
          const origX2 = w.bbox.y1 / renderScale + 1.5;
          const origY1 = (origH - w.bbox.x1) / renderScale - 1.5;
          const origY2 = (origH - w.bbox.x0) / renderScale + 1.5;
          if (origX2 <= 0 || origY2 <= 0 || origX1 >= maxW || origY1 >= maxH) continue;
          words.push({
            text,
            conf: w.confidence,
            x1: Math.max(0, origX1),
            y1: Math.max(0, origY1),
            x2: origX2,
            y2: origY2,
            orientation: 'vertical',
            angleDeg: -90,
          });
        }
        if (words.length > 0) lines.push(words);
      }
    }
  }
  return lines;
}

function extractVertLinesFrom90CCW(data: any, renderScale: number, origW: number, origH: number): RawOcrWord[][] {
  const lines: RawOcrWord[][] = [];
  const maxW = origW / renderScale;
  const maxH = origH / renderScale;

  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const words: RawOcrWord[] = [];
        for (const w of line.words || []) {
          const text = cleanOcrWordText(w.text || '');
          if (!text || w.confidence < 35) continue;
          // Inversa da 90° CCW (nx = y, ny = W - x) -> (x = W - ny, y = nx)
          const origX1 = (origW - w.bbox.y1) / renderScale - 1.5;
          const origX2 = (origW - w.bbox.y0) / renderScale + 1.5;
          const origY1 = w.bbox.x0 / renderScale - 1.5;
          const origY2 = w.bbox.x1 / renderScale + 1.5;
          if (origX2 <= 0 || origY2 <= 0 || origX1 >= maxW || origY1 >= maxH) continue;
          words.push({
            text,
            conf: w.confidence,
            x1: Math.max(0, origX1),
            y1: Math.max(0, origY1),
            x2: origX2,
            y2: origY2,
            orientation: 'vertical',
            angleDeg: 90,
          });
        }
        if (words.length > 0) lines.push(words);
      }
    }
  }
  return lines;
}

async function recognizeCanvasParallel(
  procCanvas: HTMLCanvasElement,
  renderScale: number,
  pageNumber: number,
  quoteUnit: QuoteUnit,
  onProgress?: (p: OcrScanProgress) => void,
  signal?: AbortSignal
): Promise<OcrScanResult> {
  if (signal?.aborted) throw new Error('Scansione annullata');

  const rot90Canvas = buildRotatedCanvas90CW(procCanvas);
  const { wHoriz, wVert } = await warmupOcrWorkers();

  if (signal?.aborted) throw new Error('Scansione annullata');

  onProgress?.({
    phase: 'horizontal',
    label: 'OCR parallelo: lettura testi, quote orizzontali e verticali...',
    progress: 35,
  });

  let r0: any;
  let r90: any;
  try {
    [r0, r90] = await Promise.all([
      wHoriz.recognize(procCanvas, {}, { blocks: true }),
      wVert.recognize(rot90Canvas, {}, { blocks: true }),
    ]);
  } catch (err) {
    // Se un worker persistente si corrompe, resetta il pool per la scansione successiva
    await resetOcrWorkers();
    throw err;
  }

  if (signal?.aborted) throw new Error('Scansione annullata');

  const horizLines = extractHorizLinesFromData(r0.data, renderScale);
  let vertLines = extractVertLinesFrom90CW(r90.data, renderScale, procCanvas.width, procCanvas.height);

  // Controlla se abbiamo trovato quote numeriche verticali a 90° CW; se quasi assenti (< 2)
  // e ci sono quote orizzontali, verifica rapidamente l'orientamento opposto (-90° / 270°).
  const vertNumericCount = vertLines
    .flat()
    .filter((w) => /^\d{1,4}(?:[.,]\d{1,3})?$/.test(w.text) && w.conf >= 42).length;
  const horizNumericCount = horizLines
    .flat()
    .filter((w) => /^\d{1,4}(?:[.,]\d{1,3})?$/.test(w.text) && w.conf >= 45).length;

  if (vertNumericCount < 2 && horizNumericCount >= 2) {
    onProgress?.({
      phase: 'vertical',
      label: 'Verifica quote verticali orientate dall’alto verso il basso...',
      progress: 78,
    });
    const rot270Canvas = buildRotatedCanvas90CCW(procCanvas);
    const r270 = await wVert.recognize(rot270Canvas, {}, { blocks: true });
    if (signal?.aborted) throw new Error('Scansione annullata');
    const vert270Lines = extractVertLinesFrom90CCW(r270.data, renderScale, procCanvas.width, procCanvas.height);
    const vert270NumericCount = vert270Lines
      .flat()
      .filter((w) => /^\d{1,4}(?:[.,]\d{1,3})?$/.test(w.text) && w.conf >= 42).length;
    if (vert270NumericCount > vertNumericCount) {
      vertLines = [...vertLines, ...vert270Lines];
    }
  }

  onProgress?.({ phase: 'postprocess', label: 'Ricostruzione vani e campi editabili...', progress: 94 });
  return postProcessOcrWords(horizLines, vertLines, pageNumber, quoteUnit);
}

/**
 * Esegue OCR parallelo riutilizzando direttamente il canvas già renderizzato durante la fase di visualizzazione.
 */
export async function runPlanPageOcrFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  viewportScale1Width: number,
  pageNumber: number,
  quoteUnit: QuoteUnit,
  onProgress?: (p: OcrScanProgress) => void,
  signal?: AbortSignal
): Promise<OcrScanResult> {
  onProgress?.({ phase: 'prepare', label: 'Analisi OCR in rendering...', progress: 12 });

  const targetW = Math.min(2250, Math.max(1750, sourceCanvas.width));
  const scaleFactor = sourceCanvas.width > 2400 || sourceCanvas.width < 1650 ? targetW / sourceCanvas.width : 1;
  const w = Math.round(sourceCanvas.width * scaleFactor);
  const h = Math.round(sourceCanvas.height * scaleFactor);

  const procCanvas = document.createElement('canvas');
  procCanvas.width = w;
  procCanvas.height = h;
  const ctx = procCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Contesto canvas non disponibile per OCR.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(sourceCanvas, 0, 0, w, h);

  preprocessCanvasInPlace(ctx, w, h);

  const effectiveRenderScale = w / Math.max(1, viewportScale1Width);
  return recognizeCanvasParallel(procCanvas, effectiveRenderScale, pageNumber, quoteUnit, onProgress, signal);
}

export async function runPlanPageOcr(
  pdfDoc: any,
  pageNumber: number,
  quoteUnit: QuoteUnit,
  onProgress?: (p: OcrScanProgress) => void,
  signal?: AbortSignal
): Promise<OcrScanResult> {
  onProgress?.({ phase: 'prepare', label: 'Preparazione tavola ad alta risoluzione...', progress: 8 });

  const page = await pdfDoc.getPage(pageNumber);
  const vp1 = page.getViewport({ scale: 1 });
  const targetWidth = 2150;
  const maxDimScale = 3100 / Math.max(vp1.width, vp1.height);
  const renderScale = Math.max(2.0, Math.min(4.0, targetWidth / vp1.width, maxDimScale));
  const vp = page.getViewport({ scale: renderScale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Contesto canvas non disponibile per OCR.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;

  if (signal?.aborted) throw new Error('Scansione annullata');

  preprocessCanvasInPlace(ctx, canvas.width, canvas.height);
  return recognizeCanvasParallel(canvas, renderScale, pageNumber, quoteUnit, onProgress, signal);
}
