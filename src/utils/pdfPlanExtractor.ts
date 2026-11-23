import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

if (typeof window !== 'undefined') {
  try {
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  } catch (e) {
    console.warn('Could not set local pdf workerSrc', e);
  }
}

export type QuoteUnit = 'm' | 'cm' | 'mm';
export type PlanTokenKind = 'dimension' | 'surface' | 'perimeter' | 'height' | 'scale' | 'room' | 'other';
export type MeasureExtractionMode =
  | 'area_lw'        // Superficie in pianta: Lung. x Larg. (o mq diretta)
  | 'walls_perim_h'  // Pareti / Tinteggiatura / Intonaco: Perimetro x H
  | 'linear'         // Sviluppo lineare / Battiscopa / Tubazioni: Lung. o Perimetro
  | 'volume'         // Volume / Demolizione / Massetto: Lung. x Larg. x H
  | 'count';         // Conteggio elementi / Vani (cad)

export interface PlanBBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PlanToken {
  id: string;
  str: string;
  kind: PlanTokenKind;
  numericValue?: number; // sempre convertito in metri / mq rispetto a quoteUnit
  rawValue?: number;
  x: number; // viewport CSS coord (scale 1)
  y: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  angleDeg: number;
  orientation: 'horizontal' | 'vertical' | 'angled';
  bbox: PlanBBox;
  source?: 'vector' | 'ocr' | 'manual';
  confidence?: number;
}

export interface DetectedRoomBlock {
  id: string;
  name: string;
  areaMq?: number;
  perimeterM?: number;
  lengthM?: number;
  widthM?: number;
  heightM?: number;
  bbox: PlanBBox;
  source: 'computed-labels' | 'dimensioned-quotes';
  tokenIds: string[];
}

export interface SnapVertex {
  x: number;
  y: number;
}

export interface PlanPageAnalysis {
  pageNumber: number;
  width: number;
  height: number;
  tokens: PlanToken[];
  rooms: DetectedRoomBlock[];
  snapVertices: SnapVertex[];
  detectedScaleDenominator?: number;
  detectedHeightM?: number;
  pageTitle?: string;
  isLikelyScanned: boolean;
}

export interface QueuedMeasureDraft {
  id: string;
  description: string;
  type: 'positive' | 'deduction' | 'subtotal';
  multiplier?: number;
  length?: number;
  width?: number;
  height?: number;
  sourceNote?: string;
}

const KNOWN_ROOM_KEYWORDS = [
  'SOGGIORNO',
  'SALA DA PRANZO',
  'SALA',
  'PRANZO',
  'CUCINA',
  'ANGOLO COTTURA',
  'TIN',
  'TINELLO',
  'LETTO',
  'CAMERA',
  'MATRIMONIALE',
  'SINGOLA',
  'BAGNO',
  'WC',
  'W.C.',
  'SERVIZIO',
  'ANTI-BAGNO',
  'ANTIBAGNO',
  'LAVANDERIA',
  'RIP.',
  'RIPOSTIGLIO',
  'CORRIDOIO',
  'DISIMPEGNO',
  'INGRESSO',
  'ATRIO',
  'BALCONE',
  'TERRAZZO',
  'TERRAZZA',
  'LOGGIA',
  'VERANDA',
  'PORTICO',
  'STUDIO',
  'UFFICIO',
  'GARAGE',
  'BOX',
  'AUTORIMESSA',
  'CANTINA',
  'TAVERNA',
  'SOFFITTA',
  'SOTTOTETTO',
  'MANSARDA',
  'LOCALE TECNICO',
  'CENTRALE TERMICA',
  'VANO SCALA',
  'SCALA',
  'ASCENSORE',
  'CABINA ARMADIO',
  'GUARDAROBA',
  'DEPOSITO',
  'MAGAZZINO',
  'NEGOZIO',
  'ARCHIVIO',
  'AULA',
  'PALESTRA',
  'CAPPOTTO',
  'FACCIATA',
  'PROSPETTO',
];

function parseItNumber(str: string): number {
  const clean = str.replace(/[€\s\u00A0]/g, '').replace(',', '.');
  const v = parseFloat(clean);
  return Number.isFinite(v) ? v : NaN;
}

function convertQuoteToMeters(raw: number, unit: QuoteUnit): number {
  if (unit === 'cm') return Math.round((raw / 100) * 1000) / 1000;
  if (unit === 'mm') return Math.round((raw / 1000) * 1000) / 1000;
  return Math.round(raw * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeOrientation(angleDeg: number): 'horizontal' | 'vertical' | 'angled' {
  const abs = Math.abs(((angleDeg % 180) + 180) % 180);
  if (abs <= 20 || abs >= 160) return 'horizontal';
  if (abs >= 70 && abs <= 110) return 'vertical';
  return 'angled';
}

export function classifyPlanToken(
  rawStr: string,
  quoteUnit: QuoteUnit
): { kind: PlanTokenKind; rawValue?: number; numericValue?: number } {
  const s = rawStr.replace(/\s+/g, ' ').trim();
  if (!s) return { kind: 'other' };

  // Scala: "Scala 1:100", "1:50"
  const scaleMatch = s.match(/(?:scala\s*)?1\s*[:/]\s*(\d{2,4})\b/i);
  if (scaleMatch) {
    const denom = parseInt(scaleMatch[1], 10);
    if (denom >= 5 && denom <= 5000) {
      return { kind: 'scale', rawValue: denom, numericValue: denom };
    }
  }

  // Altezza: "H = m 3,00", "H=2.70", "h. 3,00 m", "Hm = 3,00"
  const heightMatch = s.match(/^(?:h|hm|h\.?\s*max|h\.?\s*min|altezza)\s*[=:]?\s*(?:m\.?|mt\.?)?\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:m|mt)?$/i);
  if (heightMatch) {
    const val = parseItNumber(heightMatch[1]);
    if (Number.isFinite(val) && val > 0 && val < 100) {
      return { kind: 'height', rawValue: val, numericValue: val };
    }
  }

  // Superficie: "mq 18,45", "18,45 mq", "18.45 m²", "S = 18,45 mq", "Sup. 18,45"
  const surfMatchA = s.match(/^(?:sup\.?|s\.?\s*[=:]|area\s*[=:]?)?\s*(?:mq|m²|m2)\s*[=:]?\s*(\d{1,5}(?:[.,]\d{1,3})?)$/i);
  const surfMatchB = s.match(/^(?:sup\.?|s\.?\s*[=:]|area\s*[=:]?)?\s*(\d{1,5}(?:[.,]\d{1,3})?)\s*(?:mq|m²|m2)$/i);
  const surfMatch = surfMatchA || surfMatchB;
  if (surfMatch) {
    const val = parseItNumber(surfMatch[1]);
    if (Number.isFinite(val) && val > 0) {
      return { kind: 'surface', rawValue: val, numericValue: val };
    }
  }

  // Perimetro / Lunghezza con prefisso "m 17,35", "ml 17,35", "P = 17,35", "perim. 17,35"
  const perimMatchA = s.match(/^(?:p\.?\s*[=:]|perim\.?\s*[=:]?)?\s*(?:ml|m\.?)\s+(\d{1,5}(?:[.,]\d{1,3})?)$/i);
  const perimMatchB = s.match(/^(?:p\.?\s*[=:]|perim\.?\s*[=:]?)?\s*(\d{1,5}(?:[.,]\d{1,3})?)\s*(?:ml|mt|m)$/i);
  const perimMatch = perimMatchA || perimMatchB;
  if (perimMatch) {
    const val = parseItNumber(perimMatch[1]);
    if (Number.isFinite(val) && val > 0) {
      return { kind: 'perimeter', rawValue: val, numericValue: val };
    }
  }

  // Quota numerica pura: "4,50", "10,35", "0,85", "450"
  if (/^\d{1,4}(?:[.,]\d{1,3})?$/.test(s)) {
    const raw = parseItNumber(s);
    if (Number.isFinite(raw) && raw > 0) {
      // Esclude anni tipo 2021..2030 senza virgola se sembra anno
      if (!/[.,]/.test(s) && raw >= 1950 && raw <= 2100) {
        return { kind: 'other' };
      }
      return {
        kind: 'dimension',
        rawValue: raw,
        numericValue: convertQuoteToMeters(raw, quoteUnit),
      };
    }
  }

  // Etichetta Vano / Ambiente
  const upper = s.toUpperCase();
  if (
    upper === 'RIP' ||
    KNOWN_ROOM_KEYWORDS.some((kw) => upper === kw || upper.startsWith(kw + ' ') || upper.endsWith(' ' + kw) || upper.includes(kw))
  ) {
    // Esclude titoli lunghi di tavola o diciture di scala
    if (
      s.length <= 32 &&
      !upper.includes('PLANIMETRIA') &&
      !upper.includes('STATO ATTUALE') &&
      !upper.includes('CALCOLO') &&
      !upper.includes('APPARTAMENTO') &&
      !upper.includes('DISEGNO') &&
      !/^SCALA\b/.test(upper)
    ) {
      return { kind: 'room' };
    }
  }

  // Fallback per sigle brevi tutte maiuscole tipo "VANO 1", "LOCALE A", "ZONA GIORNO"
  if (/^[A-ZÀÈÉÌÒÙ0-9.\s'-]{2,24}$/.test(s) && /[A-Z]{2,}/.test(s) && !upper.includes('SCALA') && !upper.includes('ALLEGATO') && !upper.includes('ING.')) {
    if (/^(?:VANO|LOCALE|ZONA|AREA|STANZA|AMBIENTE|P\.|PIANO)\b/.test(upper)) {
      return { kind: 'room' };
    }
  }

  return { kind: 'other' };
}

function resolvePdfAssetBaseUrl(folder: string): string {
  if (typeof window !== 'undefined' && /^https?:/.test(window.location?.href || '')) {
    return new URL(`/${folder}/`, window.location.origin).href;
  }
  return `./public/${folder}/`;
}

export async function loadPdfPlanDocument(fileOrBuffer: File | ArrayBuffer | Uint8Array): Promise<any> {
  let arrayBuffer: ArrayBuffer;
  if (fileOrBuffer instanceof File) {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  } else if (fileOrBuffer instanceof Uint8Array) {
    const copy = new Uint8Array(fileOrBuffer.length);
    copy.set(fileOrBuffer);
    arrayBuffer = copy.buffer;
  } else {
    arrayBuffer = fileOrBuffer;
  }

  const uint8 = new Uint8Array(arrayBuffer);
  const commonParams = {
    data: uint8,
    isEvalSupported: false,
    useSystemFonts: true,
    wasmUrl: resolvePdfAssetBaseUrl('pdfjs-wasm'),
    cMapUrl: resolvePdfAssetBaseUrl('pdfjs-cmaps'),
    cMapPacked: true,
    standardFontDataUrl: resolvePdfAssetBaseUrl('pdfjs-fonts'),
    iccUrl: resolvePdfAssetBaseUrl('pdfjs-iccs'),
  };

  try {
    const loadingTask = (pdfjsLib as any).getDocument(commonParams);
    return await loadingTask.promise;
  } catch (workerErr) {
    console.warn('Plan PDF retry with in-thread worker fallback...', workerErr);
    if (typeof globalThis !== 'undefined' && !(globalThis as any).pdfjsWorker) {
      (globalThis as any).pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    }
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = '';
    const fallbackTask = (pdfjsLib as any).getDocument({
      ...commonParams,
      data: uint8.slice(),
    });
    return await fallbackTask.promise;
  }
}

function applyMatrix2D(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

async function extractPageSnapVertices(page: any, viewport: any): Promise<SnapVertex[]> {
  try {
    const ops = await page.getOperatorList();
    const OPS = (pdfjsLib as any).OPS;
    const Util = (pdfjsLib as any).Util;
    const stack: number[][] = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const vertices: SnapVertex[] = [];
    const seen = new Set<string>();

    const pushVertex = (sx: number, sy: number) => {
      if (sx < 2 || sy < 2 || sx > viewport.width - 2 || sy > viewport.height - 2) return;
      // Quantizza a 0.5pt per deduplicare vertici sovrapposti
      const qx = Math.round(sx * 2) / 2;
      const qy = Math.round(sy * 2) / 2;
      const key = `${qx}_${qy}`;
      if (!seen.has(key)) {
        seen.add(key);
        vertices.push({ x: sx, y: sy });
      }
    };

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];

      if (fn === OPS.save) {
        stack.push([...ctm]);
      } else if (fn === OPS.restore) {
        ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform && Array.isArray(args)) {
        ctm = Util.transform(ctm, args);
      } else if (fn === OPS.constructPath) {
        const m = Util.transform(viewport.transform, ctm);
        const pathData = args?.[1]?.[0];
        if (!pathData) continue;
        let idx = 0;
        while (idx < pathData.length) {
          const op = pathData[idx++];
          if (op === 0 || op === 1) {
            const x = pathData[idx++];
            const y = pathData[idx++];
            if (x !== undefined && y !== undefined) {
              const [sx, sy] = applyMatrix2D(m, x, y);
              pushVertex(sx, sy);
            }
          } else if (op === 2) {
            idx += 4;
            const x = pathData[idx++];
            const y = pathData[idx++];
            if (x !== undefined && y !== undefined) {
              const [sx, sy] = applyMatrix2D(m, x, y);
              pushVertex(sx, sy);
            }
          } else if (op === 3) {
            idx += 2;
            const x = pathData[idx++];
            const y = pathData[idx++];
            if (x !== undefined && y !== undefined) {
              const [sx, sy] = applyMatrix2D(m, x, y);
              pushVertex(sx, sy);
            }
          }
        }
      }

      if (vertices.length >= 6000) break;
    }

    return vertices;
  } catch (err) {
    console.warn('Could not extract vector snap vertices:', err);
    return [];
  }
}

export function detectRoomsOnPage(tokens: PlanToken[], detectedHeightM?: number): DetectedRoomBlock[] {
  const roomTokens = tokens.filter((t) => t.kind === 'room');
  const surfaceTokens = tokens.filter((t) => t.kind === 'surface' && t.numericValue);
  const perimTokens = tokens.filter((t) => t.kind === 'perimeter' && t.numericValue);
  const dimTokens = tokens.filter((t) => t.kind === 'dimension' && t.numericValue);

  const blocks: DetectedRoomBlock[] = [];

  for (let rIdx = 0; rIdx < roomTokens.length; rIdx++) {
    const rt = roomTokens[rIdx];

    // 1. Prova prima con etichette precalcolate vicine (es. Tavola 3: "mq 18,45", "m 17,35")
    let bestSurf: { token: PlanToken; dist: number } | null = null;
    for (const st of surfaceTokens) {
      const dist = Math.hypot(st.cx - rt.cx, st.cy - rt.cy);
      if (dist <= 65 && (!bestSurf || dist < bestSurf.dist)) {
        bestSurf = { token: st, dist };
      }
    }

    let bestPerim: { token: PlanToken; dist: number } | null = null;
    for (const pt of perimTokens) {
      const dist = Math.hypot(pt.cx - rt.cx, pt.cy - rt.cy);
      if (dist <= 75 && (!bestPerim || dist < bestPerim.dist)) {
        bestPerim = { token: pt, dist };
      }
    }

    if (bestSurf || bestPerim) {
      const group = [rt, bestSurf?.token, bestPerim?.token].filter(Boolean) as PlanToken[];
      const x1 = Math.min(...group.map((g) => g.bbox.x1)) - 4;
      const y1 = Math.min(...group.map((g) => g.bbox.y1)) - 4;
      const x2 = Math.max(...group.map((g) => g.bbox.x2)) + 4;
      const y2 = Math.max(...group.map((g) => g.bbox.y2)) + 4;

      blocks.push({
        id: `room_${rIdx}_${rt.id}`,
        name: rt.str,
        areaMq: bestSurf?.token.numericValue,
        perimeterM: bestPerim?.token.numericValue,
        heightM: detectedHeightM,
        bbox: { x1, y1, x2, y2 },
        source: 'computed-labels',
        tokenIds: group.map((g) => g.id),
      });
      continue;
    }

    // 2. Planimetria quotata (es. Tavola 2): abbina la quota orizzontale e verticale più prossime al vano
    let bestHoriz: { token: PlanToken; score: number } | null = null;
    let bestVert: { token: PlanToken; score: number } | null = null;
    const isExterior = /BALCON|TERRAZZ|LOGGIA|PORTICO/i.test(rt.str);
    const maxDist = isExterior ? 72 : 120;

    for (const dt of dimTokens) {
      const dist = Math.hypot(dt.cx - rt.cx, dt.cy - rt.cy);
      if (dist > maxDist) continue;

      const score = dist;
      if (dt.orientation === 'horizontal') {
        if (!bestHoriz || score < bestHoriz.score) {
          bestHoriz = { token: dt, score };
        }
      } else if (dt.orientation === 'vertical') {
        if (!bestVert || score < bestVert.score) {
          bestVert = { token: dt, score };
        }
      }
    }

    if (bestHoriz || bestVert) {
      const group = [rt, bestHoriz?.token, bestVert?.token].filter(Boolean) as PlanToken[];
      const L = bestHoriz?.token.numericValue;
      const W = bestVert?.token.numericValue;
      const computedArea = L && W ? round2(L * W) : undefined;
      const computedPerim = L && W ? round2(2 * (L + W)) : undefined;

      const x1 = Math.min(...group.map((g) => g.bbox.x1)) - 6;
      const y1 = Math.min(...group.map((g) => g.bbox.y1)) - 6;
      const x2 = Math.max(...group.map((g) => g.bbox.x2)) + 6;
      const y2 = Math.max(...group.map((g) => g.bbox.y2)) + 6;

      blocks.push({
        id: `room_${rIdx}_${rt.id}`,
        name: rt.str,
        lengthM: L,
        widthM: W,
        areaMq: computedArea,
        perimeterM: computedPerim,
        heightM: detectedHeightM,
        bbox: { x1, y1, x2, y2 },
        source: 'dimensioned-quotes',
        tokenIds: group.map((g) => g.id),
      });
    }
  }

  return blocks;
}

export async function extractPageSnapVerticesOnDemand(doc: any, pageNumber: number): Promise<SnapVertex[]> {
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    return await extractPageSnapVertices(page, viewport);
  } catch {
    return [];
  }
}

export async function analyzePdfPlanPage(
  doc: any,
  pageNumber: number,
  quoteUnit: QuoteUnit = 'm'
): Promise<PlanPageAnalysis> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const Util = (pdfjsLib as any).Util;

  const tokens: PlanToken[] = [];
  let detectedScaleDenominator: number | undefined;
  let detectedHeightM: number | undefined;
  let pageTitle: string | undefined;
  let totalRawTextItems = 0;

  let idx = 0;
  for (const it of content.items as any[]) {
    const rawStr = (it.str || '').trim();
    if (!rawStr) continue;
    totalRawTextItems++;

    const classified = classifyPlanToken(rawStr, quoteUnit);

    if (classified.kind === 'scale' && classified.numericValue) {
      detectedScaleDenominator = classified.numericValue;
    }
    if (classified.kind === 'height' && classified.numericValue && !detectedHeightM) {
      detectedHeightM = classified.numericValue;
    }

    // Scarta subito tutti i testi generici ('other') per mantenere solo le misure utili all'auto-calibrazione e i nomi vano
    if (classified.kind === 'other') {
      continue;
    }

    const tx = Util.transform(viewport.transform, it.transform);
    const angleRad = Math.atan2(tx[1], tx[0]);
    const angleDeg = Math.round((angleRad * 180) / Math.PI);
    const orientation = normalizeOrientation(angleDeg);

    const fontHeight = Math.max(6, Math.hypot(tx[2], tx[3]) || it.height || 8);
    const advanceWidth = Math.max(
      8,
      (it.width || rawStr.length * fontHeight * 0.55) *
        (Math.hypot(tx[0], tx[1]) / Math.hypot(it.transform[0], it.transform[1]) || 1)
    );

    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const bx = tx[4];
    const by = tx[5];
    const corners = [
      [bx, by],
      [bx + advanceWidth * cos, by + advanceWidth * sin],
      [bx - fontHeight * sin, by + fontHeight * cos],
      [bx + advanceWidth * cos - fontHeight * sin, by + advanceWidth * sin + fontHeight * cos],
    ];
    const cornersAscent = [
      [bx, by],
      [bx + advanceWidth * cos, by + advanceWidth * sin],
      [bx + fontHeight * sin, by - fontHeight * cos],
      [bx + advanceWidth * cos + fontHeight * sin, by + advanceWidth * sin - fontHeight * cos],
    ];
    const allPts = [...corners.slice(0, 2), ...cornersAscent.slice(2)];
    const xs = allPts.map((p) => p[0]);
    const ys = allPts.map((p) => p[1]);

    const x1 = Math.min(...xs) - 2;
    const y1 = Math.min(...ys) - 2;
    const x2 = Math.max(...xs) + 2;
    const y2 = Math.max(...ys) + 2;
    const w = Math.max(8, x2 - x1);
    const h = Math.max(8, y2 - y1);

    if (!pageTitle && fontHeight >= 11 && rawStr.length >= 6 && !rawStr.toLowerCase().includes('scala')) {
      pageTitle = rawStr;
    }

    tokens.push({
      id: `p${pageNumber}_t${idx++}`,
      str: rawStr,
      kind: classified.kind,
      rawValue: classified.rawValue,
      numericValue: classified.numericValue,
      x: x1,
      y: y1,
      cx: (x1 + x2) / 2,
      cy: (y1 + y2) / 2,
      w,
      h,
      angleDeg,
      orientation,
      bbox: { x1, y1, x2, y2 },
    });
  }

  const rooms = detectRoomsOnPage(tokens, detectedHeightM);

  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    tokens,
    rooms,
    snapVertices: [],
    detectedScaleDenominator,
    detectedHeightM,
    pageTitle,
    isLikelyScanned: totalRawTextItems === 0,
  };
}

function boxesIntersect(a: PlanBBox, b: PlanBBox): boolean {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

export function buildMeasurementsFromRoom(
  roomName: string,
  opts: {
    areaMq?: number;
    perimeterM?: number;
    lengthM?: number;
    widthM?: number;
    heightM?: number;
    mode: MeasureExtractionMode;
    defaultHeightM: number;
    sourceNote?: string;
  }
): QueuedMeasureDraft[] {
  const label = roomName.trim() || 'Vano';
  const h = opts.heightM || opts.defaultHeightM || 3.0;
  const uid = () => Math.random().toString(36).slice(2, 9);

  if (opts.mode === 'count') {
    return [
      {
        id: uid(),
        description: `${label}`,
        type: 'positive',
        multiplier: undefined,
        length: 1,
        sourceNote: opts.sourceNote || 'Conteggio da tavola',
      },
    ];
  }

  if (opts.mode === 'walls_perim_h') {
    if (opts.perimeterM && opts.perimeterM > 0) {
      return [
        {
          id: uid(),
          description: `${label} - Pareti (sviluppo perimetro × H)`,
          type: 'positive',
          multiplier: undefined,
          length: round2(opts.perimeterM),
          height: round2(h),
          sourceNote: opts.sourceNote || `Perim. ${opts.perimeterM.toFixed(2)} m`,
        },
      ];
    }
    if (opts.lengthM && opts.widthM) {
      return [
        {
          id: uid(),
          description: `${label} - Pareti interne (2 × (${opts.lengthM.toFixed(2)} + ${opts.widthM.toFixed(2)}))`,
          type: 'positive',
          multiplier: 2,
          length: round2(opts.lengthM + opts.widthM),
          height: round2(h),
          sourceNote: opts.sourceNote || `${opts.lengthM.toFixed(2)} × ${opts.widthM.toFixed(2)} m`,
        },
      ];
    }
    if (opts.lengthM) {
      return [
        {
          id: uid(),
          description: `${label} - Parete`,
          type: 'positive',
          multiplier: undefined,
          length: round2(opts.lengthM),
          height: round2(h),
          sourceNote: opts.sourceNote,
        },
      ];
    }
  }

  if (opts.mode === 'linear') {
    if (opts.perimeterM && opts.perimeterM > 0) {
      return [
        {
          id: uid(),
          description: `${label} - Sviluppo perimetrale`,
          type: 'positive',
          multiplier: undefined,
          length: round2(opts.perimeterM),
          sourceNote: opts.sourceNote || `Perim. ${opts.perimeterM.toFixed(2)} m`,
        },
      ];
    }
    if (opts.lengthM && opts.widthM) {
      return [
        {
          id: uid(),
          description: `${label} - Sviluppo 2 × (${opts.lengthM.toFixed(2)} + ${opts.widthM.toFixed(2)})`,
          type: 'positive',
          multiplier: 2,
          length: round2(opts.lengthM + opts.widthM),
          sourceNote: opts.sourceNote,
        },
      ];
    }
    if (opts.lengthM || opts.widthM) {
      const val = opts.lengthM || opts.widthM || 0;
      return [
        {
          id: uid(),
          description: `${label} - Sviluppo lineare`,
          type: 'positive',
          multiplier: undefined,
          length: round2(val),
          sourceNote: opts.sourceNote,
        },
      ];
    }
  }

  if (opts.mode === 'volume') {
    if (opts.lengthM && opts.widthM) {
      return [
        {
          id: uid(),
          description: `${label} (${opts.lengthM.toFixed(2)} × ${opts.widthM.toFixed(2)} × ${h.toFixed(2)})`,
          type: 'positive',
          multiplier: undefined,
          length: round2(opts.lengthM),
          width: round2(opts.widthM),
          height: round2(h),
          sourceNote: opts.sourceNote,
        },
      ];
    }
    if (opts.areaMq && opts.areaMq > 0) {
      return [
        {
          id: uid(),
          description: `${label} - Superficie ${opts.areaMq.toFixed(2)} mq × H/Spess.`,
          type: 'positive',
          multiplier: undefined,
          length: round2(opts.areaMq),
          height: round2(h),
          sourceNote: opts.sourceNote,
        },
      ];
    }
  }

  // Default: 'area_lw' (Pavimento / Superficie)
  if (opts.lengthM && opts.widthM) {
    return [
      {
        id: uid(),
        description: `${label}`,
        type: 'positive',
        multiplier: undefined,
        length: round2(opts.lengthM),
        width: round2(opts.widthM),
        sourceNote: opts.sourceNote || `Quote ${opts.lengthM.toFixed(2)} × ${opts.widthM.toFixed(2)} m`,
      },
    ];
  }

  if (opts.areaMq && opts.areaMq > 0) {
    return [
      {
        id: uid(),
        description: `${label} - Superficie da tavola`,
        type: 'positive',
        multiplier: undefined,
        length: round2(opts.areaMq),
        sourceNote: opts.sourceNote || `mq ${opts.areaMq.toFixed(2)}`,
      },
    ];
  }

  if (opts.lengthM || opts.widthM) {
    const val = opts.lengthM || opts.widthM || 0;
    return [
      {
        id: uid(),
        description: `${label}`,
        type: 'positive',
        multiplier: undefined,
        length: round2(val),
        sourceNote: opts.sourceNote,
      },
    ];
  }

  return [];
}

export function analyzeHighlightedRegion(
  box: PlanBBox,
  analysis: PlanPageAnalysis,
  mode: MeasureExtractionMode,
  defaultHeightM: number
): {
  matchedTokens: PlanToken[];
  drafts: QueuedMeasureDraft[];
  summaryText: string;
} {
  const normBox: PlanBBox = {
    x1: Math.min(box.x1, box.x2),
    y1: Math.min(box.y1, box.y2),
    x2: Math.max(box.x1, box.x2),
    y2: Math.max(box.y1, box.y2),
  };

  const matchedTokens = analysis.tokens.filter(
    (t) => t.kind !== 'other' && t.kind !== 'scale' && boxesIntersect(normBox, t.bbox)
  );

  if (matchedTokens.length === 0) {
    return { matchedTokens: [], drafts: [], summaryText: 'Nessuna quota o misura nell’area evidenziata.' };
  }

  const roomsInBox = matchedTokens.filter((t) => t.kind === 'room');
  const surfsInBox = matchedTokens.filter((t) => t.kind === 'surface' && t.numericValue);
  const perimsInBox = matchedTokens.filter((t) => t.kind === 'perimeter' && t.numericValue);
  const heightsInBox = matchedTokens.filter((t) => t.kind === 'height' && t.numericValue);
  const dimsInBox = matchedTokens.filter((t) => t.kind === 'dimension' && t.numericValue);

  const boxCx = (normBox.x1 + normBox.x2) / 2;
  const boxCy = (normBox.y1 + normBox.y2) / 2;

  // Se non c'è il nome del vano dentro al riquadro, cerca il vano più vicino entro 95pt
  let inferredRoomName = roomsInBox.map((r) => r.str).join(' + ');
  if (!inferredRoomName) {
    let nearest: { name: string; d: number } | null = null;
    for (const rt of analysis.tokens) {
      if (rt.kind !== 'room') continue;
      const d = Math.hypot(rt.cx - boxCx, rt.cy - boxCy);
      if (d <= 95 && (!nearest || d < nearest.d)) {
        nearest = { name: rt.str, d };
      }
    }
    if (nearest) inferredRoomName = nearest.name;
  }

  const effectiveHeight = heightsInBox[0]?.numericValue || analysis.detectedHeightM || defaultHeightM;

  // Se l'utente ha evidenziato più vani completi con etichette mq/m (es. selezione di più stanze su Tavola 3)
  if (roomsInBox.length > 1 && (surfsInBox.length > 1 || perimsInBox.length > 1)) {
    const multiDrafts: QueuedMeasureDraft[] = [];
    for (const rToken of roomsInBox) {
      const matchedRoom = analysis.rooms.find((rb) => rb.tokenIds.includes(rToken.id));
      if (matchedRoom) {
        multiDrafts.push(
          ...buildMeasurementsFromRoom(matchedRoom.name, {
            areaMq: matchedRoom.areaMq,
            perimeterM: matchedRoom.perimeterM,
            lengthM: matchedRoom.lengthM,
            widthM: matchedRoom.widthM,
            heightM: effectiveHeight,
            mode,
            defaultHeightM,
            sourceNote: `Evidenziato (${roomsInBox.length} vani)`,
          })
        );
      }
    }
    if (multiDrafts.length > 0) {
      return {
        matchedTokens,
        drafts: multiDrafts,
        summaryText: `Rilevati ${roomsInBox.length} vani nell’area evidenziata`,
      };
    }
  }

  // Caso singolo vano o gruppo di quote evidenziate
  const roomName = inferredRoomName || 'Elemento da tavola';
  const surfVal = surfsInBox.length > 0 ? surfsInBox.reduce((s, t) => s + (t.numericValue || 0), 0) : undefined;
  const perimVal = perimsInBox.length > 0 ? perimsInBox.reduce((s, t) => s + (t.numericValue || 0), 0) : undefined;

  const horizDims = dimsInBox.filter((d) => d.orientation === 'horizontal');
  const vertDims = dimsInBox.filter((d) => d.orientation === 'vertical');
  const angledDims = dimsInBox.filter((d) => d.orientation === 'angled');

  let lengthM: number | undefined;
  let widthM: number | undefined;

  if (horizDims.length > 0 && vertDims.length > 0) {
    // Se ci sono più quote sullo stesso asse, valuta se sommarle o prendere la prima/somma
    lengthM = horizDims.reduce((sum, d) => sum + (d.numericValue || 0), 0);
    widthM = vertDims.reduce((sum, d) => sum + (d.numericValue || 0), 0);
  } else if (horizDims.length >= 2 && vertDims.length === 0) {
    if (mode === 'linear') {
      lengthM = horizDims.reduce((sum, d) => sum + (d.numericValue || 0), 0);
    } else {
      lengthM = horizDims[0].numericValue;
      widthM = horizDims[1].numericValue;
    }
  } else if (vertDims.length >= 2 && horizDims.length === 0) {
    if (mode === 'linear') {
      lengthM = vertDims.reduce((sum, d) => sum + (d.numericValue || 0), 0);
    } else {
      lengthM = vertDims[0].numericValue;
      widthM = vertDims[1].numericValue;
    }
  } else if (dimsInBox.length === 1) {
    lengthM = dimsInBox[0].numericValue;
  } else if (angledDims.length >= 2) {
    lengthM = angledDims[0].numericValue;
    widthM = angledDims[1].numericValue;
  }

  const drafts = buildMeasurementsFromRoom(roomName, {
    areaMq: surfVal,
    perimeterM: perimVal,
    lengthM,
    widthM,
    heightM: effectiveHeight,
    mode,
    defaultHeightM,
    sourceNote: `${matchedTokens.length} elementi evidenziati`,
  });

  return {
    matchedTokens,
    drafts,
    summaryText: `${roomName}: ${matchedTokens.map((t) => t.str).join(' · ')}`,
  };
}

export function inferDefaultModeForArticle(unit?: string, description?: string): MeasureExtractionMode {
  const u = (unit || '').toLowerCase().trim();
  const d = (description || '').toLowerCase();

  if (u === 'cad' || u === 'n' || u === 'n.' || u === 'pz' || u === 'corpo') {
    return 'count';
  }
  if (u === 'm3' || u === 'mc' || u === 'm³') {
    return 'volume';
  }
  if (u === 'm' || u === 'ml' || u === 'mt') {
    return 'linear';
  }
  if (
    u.includes('m2') ||
    u.includes('mq') ||
    u.includes('m²') ||
    !u
  ) {
    if (
      d.includes('tinteggiat') ||
      d.includes('pittur') ||
      d.includes('idropitt') ||
      d.includes('intonac') ||
      d.includes('rasatur') ||
      d.includes('rivestiment') ||
      d.includes('paret') ||
      d.includes('tramezz') ||
      d.includes('cartongesso') ||
      d.includes('muratur')
    ) {
      return 'walls_perim_h';
    }
    return 'area_lw';
  }
  return 'area_lw';
}
