import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { Article, Category, Measurement, ProjectInfo } from '../types';

// Guarantee worker is available in ANY browser environment (including sandboxed iframes and CSP restrictions)
if (typeof globalThis !== 'undefined') {
  (globalThis as any).pdfjsWorker = pdfjsWorker;
}

if (typeof window !== 'undefined') {
  try {
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  } catch (e) {
    console.warn('Could not set local pdf workerSrc', e);
  }
}

function parseNumber(str: string): number {
  if (!str) return 0;
  let clean = str
    .replace(/[´'€\s\u00A0]/g, '')
    .replace(/−/g, '-');
  if (!clean) return 0;

  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');

  if (hasComma && hasDot) {
    // Formato italiano standard: 1.234,56 -> 1234.56
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato US: 1,234.56 -> 1234.56
      clean = clean.replace(/,/g, '');
    }
  } else if (hasComma) {
    clean = clean.replace(',', '.');
  } else if (hasDot) {
    // Se ci sono più punti (es. 1.234.567) sono separatori migliaia
    const parts = clean.split('.');
    if (parts.length > 2) {
      clean = parts.join('');
    }
  }

  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function isNumericToken(str: string, allowCurrency = false): boolean {
  if (!str) return false;
  let s = str.trim();
  if (allowCurrency) {
    s = s.replace(/€/g, '').replace(/\s+/g, '').trim();
  }
  if (!/\d/.test(s)) return false;
  return /^[+-]?[\d.'´\u00A0]+([.,]\d+)?%?$/.test(s);
}

function cleanText(str: string): string {
  if (!str) return '';
  return str.replace(/\uFFFD/g, '').replace(/\s+/g, ' ').trim();
}

export interface ConvertedComputoResult {
  projectInfo: ProjectInfo;
  categories: Category[];
  articles: Article[];
  totalAmount: number;
  totalPages: number;
  articlesCount: number;
  fileName?: string;
}

interface PdfTextItem {
  x: number;
  y: number;
  w: number;
  str: string;
}

interface PdfLine {
  page: number;
  y: number;
  pageWidth: number;
  items: PdfTextItem[];
}

interface ColumnLayout {
  detected: boolean;
  headerEndLineIndex: number;
  hasDimColumns: boolean;
  hasUnitColumn: boolean;
  numOrdMaxX: number;
  tariffMinX: number;
  tariffMaxX: number;
  descMinX: number;
  descMaxX: number;
  umMinX: number;
  umMaxX: number;
  parUgMaxX: number;
  lungMaxX: number;
  largMaxX: number;
  hPesoMaxX: number;
  qtyMinX: number;
  qtyMaxX: number;
  priceMaxX: number;
}

function getDefaultColumnLayout(pageWidth: number): ColumnLayout {
  const s = pageWidth > 0 ? pageWidth / 595 : 1;
  return {
    detected: false,
    headerEndLineIndex: 0,
    hasDimColumns: true,
    hasUnitColumn: false,
    numOrdMaxX: Math.round(62 * s),
    tariffMinX: Math.round(52 * s),
    tariffMaxX: Math.round(125 * s),
    descMinX: Math.round(115 * s),
    descMaxX: Math.round(282 * s),
    umMinX: Math.round(282 * s),
    umMaxX: Math.round(282 * s),
    parUgMaxX: Math.round(318 * s),
    lungMaxX: Math.round(355 * s),
    largMaxX: Math.round(390 * s),
    hPesoMaxX: Math.round(428 * s),
    qtyMinX: Math.round(420 * s),
    qtyMaxX: Math.round(480 * s),
    priceMaxX: Math.round(535 * s),
  };
}

function looksLikeTariffCode(str: string): boolean {
  const s = str.trim();
  if (!s || s.length < 2 || s.length > 40) return false;
  if (s.includes(' ') || s.includes(',') || s.includes('€')) return false;
  // Esclude date tipo 27/04/2026
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return false;
  // Esempi tipici: A01.001, 01.A01.001, NP.01, NV.002, AP.01, LOM261.1C.01.050.0010, TOS24_01.A01
  return (
    /^[A-Za-z]{1,8}\d*[._\-/]?[A-Za-z0-9._/\-]+$/.test(s) && /[A-Za-z]/.test(s) && /\d/.test(s) ||
    /^\d{1,4}[._\-][A-Za-z0-9]{1,10}([._\-][A-Za-z0-9]{1,10})+$/.test(s)
  );
}

function detectColumnLayout(lines: PdfLine[]): ColumnLayout {
  const firstPageWidth = lines[0]?.pageWidth || 595;
  const fallback = getDefaultColumnLayout(firstPageWidth);
  const s = firstPageWidth > 0 ? firstPageWidth / 595 : 1;

  for (let i = 0; i < lines.length; i++) {
    const baseLine = lines[i];

    // Prova sia la singola riga sia una banda di intestazione multi-riga (max 16pt di altezza sulla stessa pagina)
    let bestLayout: { score: number; layout: ColumnLayout } | null = null;

    for (let endIdx = i; endIdx < Math.min(lines.length, i + 4); endIdx++) {
      const candidateEnd = lines[endIdx];
      if (candidateEnd.page !== baseLine.page) break;
      if (baseLine.y - candidateEnd.y > 18) break;

      // Evita di fondere righe di dati (es. tariffa LOM261... o prezzi con €) dentro la banda di intestazione
      if (endIdx > i) {
        const endText = candidateEnd.items.map((it) => it.str).join(' ');
        if (endText.includes('€') || candidateEnd.items.some((it) => looksLikeTariffCode(it.str))) {
          break;
        }
      }

      const bandItems: PdfTextItem[] = [];
      for (let k = i; k <= endIdx; k++) {
        bandItems.push(...lines[k].items);
      }
      bandItems.sort((a, b) => a.x - b.x || b.y - a.y);

      const joined = bandItems.map((it) => it.str).join(' ').toLowerCase();
      const hasDesignazione =
        joined.includes('designazione') || joined.includes('descrizione') || joined.includes('lavori') || joined.includes('lavorazione');
      const hasTariffa =
        joined.includes('tariffa') || joined.includes('codice') || joined.includes('num.ord') || /\bn\.?\b/.test(joined);
      const hasMetrics =
        (joined.includes('par') && joined.includes('lung')) ||
        (joined.includes('quantit') &&
          (joined.includes('import') || joined.includes('total') || joined.includes('prezz') || joined.includes('unit')));

      if (!(hasDesignazione && (hasTariffa || hasMetrics))) continue;

      const findAllColItems = (patterns: RegExp[]): PdfTextItem[] =>
        bandItems.filter((it) => {
          const lower = it.str.toLowerCase().trim();
          return patterns.some((p) => p.test(lower));
        });

      const findColItem = (patterns: RegExp[]): PdfTextItem | null => {
        const matches = findAllColItems(patterns);
        return matches.length > 0 ? matches[0] : null;
      };

      const mergeVerticallyAligned = (items: PdfTextItem[]): PdfTextItem | null => {
        if (items.length === 0) return null;
        if (items.length === 1) return items[0];
        const first = items[0];
        const group = items.filter((it) => Math.abs(it.x - first.x) <= 22 * s);
        const minX = Math.min(...group.map((g) => g.x));
        const maxR = Math.max(...group.map((g) => g.x + Math.max(g.w, 8)));
        return { x: minX, y: first.y, w: maxR - minX, str: group.map((g) => g.str).join(' ') };
      };

      const numItem = mergeVerticallyAligned(findAllColItems([/^n\.?$/, /num\.?\s*ord/, /^n\.?\s*ord/, /^ord\.?$/]));
      const tariffItem = findColItem([/tariffa/, /codice/]);
      const descItem = findColItem([/designazione/, /descrizione/]);
      const umItem = findColItem([/^u\.?\s*m\.?$/, /unit[àa]\s*di\s*misura/, /^mis\.?$/]);
      const parUgItem = findColItem([/par\.?\s*ug/, /parti/]);
      const lungItem = findColItem([/lung/]);
      const largItem = findColItem([/larg/]);
      const hPesoItem = findColItem([/h\/?peso/, /alt/]);
      const qtyItem = findColItem([/quantit/, /^q\.?t[aà]/]);

      const prezzoMatches = findAllColItems([/unitar/, /^unit\.?$/, /prezzo/]);
      let priceItem = findColItem([/unitar/, /^unit\.?$/]);
      if (!priceItem && prezzoMatches.length > 0) {
        priceItem = prezzoMatches[0];
      }
      let totalItem = findColItem([/totale/, /importo/]);
      if (!totalItem && prezzoMatches.length > 1) {
        totalItem = prezzoMatches[prezzoMatches.length - 1];
      }

      if (descItem !== null && (tariffItem !== null || numItem !== null)) {
        const center = (it: PdfTextItem | null): number | null =>
          it ? Math.round(it.x + (it.w > 0 ? it.w / 2 : 12)) : null;

        const midCenter = (a: PdfTextItem | null, b: PdfTextItem | null, def: number): number => {
          const ca = center(a);
          const cb = center(b);
          return ca !== null && cb !== null ? Math.round((ca + cb) / 2) : def;
        };

        const hasDimColumns = Boolean(parUgItem || lungItem || largItem || hPesoItem);
        const hasUnitColumn = Boolean(umItem);

        // Stima iniziale dalle intestazioni (ancorata al margine destro di N. Ord., mai solo alla tariffa centrata)
        let numOrdMaxX = numItem
          ? Math.round(numItem.x + Math.max(numItem.w, 18) + 6 * s)
          : tariffItem
          ? Math.round(Math.max(45 * s, tariffItem.x - 24 * s))
          : fallback.numOrdMaxX;

        if (tariffItem && numOrdMaxX > tariffItem.x + 6 * s) {
          numOrdMaxX = Math.round(Math.max(42 * s, tariffItem.x - 4 * s));
        }

        let tariffMinX = Math.max(0, numOrdMaxX - 2);
        let tariffMaxX = tariffItem
          ? Math.round(Math.min(descItem.x - 4 * s, tariffItem.x + Math.max(tariffItem.w, 26) + 26 * s))
          : Math.round(numOrdMaxX + 65 * s);
        if (tariffMaxX <= tariffMinX + 20 * s) {
          tariffMaxX = Math.round(tariffMinX + 70 * s);
        }

        let descMinX = Math.max(0, tariffMaxX - 4);
        const firstRightColX = hasDimColumns
          ? parUgItem?.x ?? lungItem?.x ?? largItem?.x ?? hPesoItem?.x ?? qtyItem?.x
          : umItem?.x ?? qtyItem?.x;
        let descMaxX = firstRightColX !== undefined ? Math.round(firstRightColX - 6 * s) : fallback.descMaxX;

        // Raffinamento empirico sulle prime righe dati sotto l'intestazione:
        // gestisce intestazioni centrate (es. "Codice Tariffa" a x=86..147 con dati a x=66..167,
        // e "Descrizione Lavorazione" centrata a x=219 con dati a x=176..371)
        const orderRights: number[] = [];
        const tariffLefts: number[] = [];
        const tariffRights: number[] = [];
        const descLefts: number[] = [];
        const descRights: number[] = [];

        const dataScanLimit = Math.min(lines.length, endIdx + 45);
        for (let r = endIdx + 1; r < dataScanLimit; r++) {
          const dLine = lines[r];
          if (dLine.items.length === 0) continue;
          const first = dLine.items[0];
          const ord = parseOrderToken(first.str);

          if (ord && first.x <= numOrdMaxX + 18 * s && ord.orderNum >= 1 && ord.orderNum <= 50) {
            orderRights.push(first.x + Math.max(first.w, 4));

            const middleItems = dLine.items.slice(1).filter((it) => it.x < (firstRightColX ?? 999) - 4);
            if (middleItems.length >= 2) {
              const firstMid = middleItems[0];
              const secondMid = middleItems[1];
              if (looksLikeTariffCode(firstMid.str) || firstMid.x < descItem.x - 15 * s) {
                tariffLefts.push(firstMid.x);
                tariffRights.push(firstMid.x + Math.max(firstMid.w, 8));
                descLefts.push(secondMid.x);
                descRights.push(secondMid.x + Math.max(secondMid.w, 10));
              }
            } else if (middleItems.length === 1 && looksLikeTariffCode(middleItems[0].str)) {
              tariffLefts.push(middleItems[0].x);
              tariffRights.push(middleItems[0].x + Math.max(middleItems[0].w, 8));
            }
          } else {
            // Righe di continuazione descrizione
            const descOnlyItems = dLine.items.filter(
              (it) =>
                it.x >= (tariffRights.length > 0 ? Math.max(...tariffRights) + 2 : descMinX - 40 * s) &&
                it.x < (firstRightColX ?? 999) - 4 &&
                !isNumericToken(it.str, true)
            );
            for (const di of descOnlyItems) {
              if (di.x > (numItem ? numItem.x + numItem.w + 15 * s : 65 * s)) {
                descLefts.push(di.x);
                descRights.push(di.x + Math.max(di.w, 10));
              }
            }
          }
        }

        if (orderRights.length > 0 && tariffLefts.length > 0) {
          const maxOrdR = Math.max(...orderRights);
          const minTarL = Math.min(...tariffLefts);
          if (minTarL > maxOrdR) {
            numOrdMaxX = Math.floor((maxOrdR + minTarL) / 2);
            tariffMinX = numOrdMaxX;
          } else {
            tariffMinX = Math.min(tariffMinX, minTarL - 2);
            numOrdMaxX = Math.min(numOrdMaxX, minTarL - 1);
          }
        }

        if (tariffRights.length > 0 && descLefts.length > 0) {
          const maxTarR = Math.max(...tariffRights);
          const minDescL = Math.min(...descLefts.filter((dx) => dx > maxTarR));
          if (Number.isFinite(minDescL) && minDescL > maxTarR) {
            tariffMaxX = Math.floor((maxTarR + minDescL) / 2);
            descMinX = Math.max(tariffMaxX - 2, minDescL - 8);
          } else if (maxTarR > tariffMaxX) {
            tariffMaxX = maxTarR + 4;
            descMinX = Math.max(tariffMaxX - 2, descMinX);
          }
        }

        if (hasUnitColumn && umItem) {
          const maxDescR = descRights.length > 0 ? Math.max(...descRights.filter((dr) => dr < umItem.x)) : descMaxX;
          if (Number.isFinite(maxDescR) && maxDescR > descMinX && maxDescR < umItem.x) {
            descMaxX = Math.floor((maxDescR + umItem.x) / 2);
          } else {
            descMaxX = Math.round(umItem.x - 5 * s);
          }
        }

        const umMinX = hasUnitColumn && umItem ? Math.min(descMaxX, Math.round(umItem.x - 6 * s)) : descMaxX;
        const umMaxX =
          hasUnitColumn && umItem && qtyItem
            ? Math.round((umItem.x + Math.max(umItem.w, 16) + qtyItem.x) / 2)
            : hasUnitColumn && umItem
            ? Math.round(umItem.x + Math.max(umItem.w, 18) + 8 * s)
            : descMaxX;

        const parUgMaxX = hasDimColumns ? midCenter(parUgItem, lungItem, descMaxX + Math.round(35 * s)) : umMaxX;
        const lungMaxX = hasDimColumns ? midCenter(lungItem, largItem, parUgMaxX + Math.round(33 * s)) : umMaxX;
        const largMaxX = hasDimColumns ? midCenter(largItem, hPesoItem, lungMaxX + Math.round(33 * s)) : umMaxX;
        const hPesoMaxX = hasDimColumns ? midCenter(hPesoItem, qtyItem, largMaxX + Math.round(35 * s)) : umMaxX;

        const qtyMinX = hasDimColumns ? hPesoMaxX - 4 : Math.max(umMaxX - 4, qtyItem ? Math.round(qtyItem.x - 10 * s) : umMaxX);
        const qtyMaxX = midCenter(qtyItem, priceItem, qtyMinX + Math.round(50 * s));
        const priceMaxX = midCenter(priceItem, totalItem, qtyMaxX + Math.round(50 * s));

        const colScore =
          (numItem ? 2 : 0) +
          (tariffItem ? 2 : 0) +
          (descItem ? 2 : 0) +
          (umItem ? 2 : 0) +
          (qtyItem ? 2 : 0) +
          (priceItem ? 2 : 0) +
          (totalItem ? 2 : 0) +
          (parUgItem ? 1 : 0) +
          (lungItem ? 1 : 0);

        const candidateLayout: ColumnLayout = {
          detected: true,
          headerEndLineIndex: endIdx,
          hasDimColumns,
          hasUnitColumn,
          numOrdMaxX,
          tariffMinX,
          tariffMaxX,
          descMinX,
          descMaxX,
          umMinX,
          umMaxX,
          parUgMaxX,
          lungMaxX,
          largMaxX,
          hPesoMaxX,
          qtyMinX,
          qtyMaxX,
          priceMaxX,
        };

        if (!bestLayout || colScore > bestLayout.score) {
          bestLayout = { score: colScore, layout: candidateLayout };
        }
      }
    }

    if (bestLayout) {
      return bestLayout.layout;
    }
  }

  return fallback;
}

function parseOrderToken(str: string): { orderNum: number; trailingTariff?: string } | null {
  const s = str.trim();
  if (!s) return null;

  // Ignora numeri decimali con virgola o numeri con troppe cifre
  if (/,/.test(s)) return null;

  // Es. "1", "01", "1."
  let m = s.match(/^0*([1-9]\d{0,3})\.?$/);
  if (m) {
    return { orderNum: parseInt(m[1], 10) };
  }

  // Es. "1 / 1", "1/12" (formato PriMus)
  m = s.match(/^0*([1-9]\d{0,3})\s*\/\s*\d{1,4}$/);
  if (m) {
    return { orderNum: parseInt(m[1], 10) };
  }

  // Es. "1 NP.01" o "12 A01.02.003" (ordine + tariffa uniti in un unico item)
  m = s.match(/^0*([1-9]\d{0,3})\.?\s+([A-Za-z0-9][A-Za-z0-9._/\-]{1,})$/);
  if (m && !isNumericToken(m[2])) {
    return { orderNum: parseInt(m[1], 10), trailingTariff: m[2] };
  }

  return null;
}

function isHeaderOrFooterLine(lineText: string): boolean {
  const trimmed = lineText.trim();
  const lower = trimmed.toLowerCase();
  return (
    lineText.includes('D I M E N S I O N I') ||
    lineText.includes('I M P O R T I') ||
    lower.includes('designazione dei lavori') ||
    (lower.includes('par.ug') && lower.includes('h/peso')) ||
    (lower.includes('tariffa') && (lower.includes('quantit') || lower.includes('descrizione'))) ||
    (lower.includes('codice') && lower.includes('lavorazion')) ||
    /^(?:n\.?\s*)?(?:prezzo\s*){1,2}$/i.test(trimmed) ||
    /^ord\.?\s+unit\.?\s+totale$/i.test(trimmed) ||
    lineText.includes('R I P O R T O') ||
    lineText.includes('A R I P O R T A R E') ||
    lower.startsWith('committente:') ||
    /^pag\.\s*\d+/i.test(trimmed) ||
    /^pagina\s*\d+/i.test(trimmed) ||
    /\bpagina\s+\d+\s+di\s+\d+\b/i.test(trimmed) ||
    lower.includes('parziale lavori') ||
    lineText.includes('T O T A L E') ||
    /^[-_=]{4,}$/.test(trimmed)
  );
}

export async function convertPdfComputo(
  fileOrBuffer: File | ArrayBuffer | Uint8Array,
  fileName?: string,
  onProgress?: (step: string) => void
): Promise<ConvertedComputoResult> {
  let arrayBuffer: ArrayBuffer;
  if (fileOrBuffer instanceof File) {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
    fileName = fileName || fileOrBuffer.name;
  } else if (fileOrBuffer instanceof Uint8Array) {
    const copy = new Uint8Array(fileOrBuffer.length);
    copy.set(fileOrBuffer);
    arrayBuffer = copy.buffer;
  } else {
    arrayBuffer = fileOrBuffer;
  }

  const uint8 = new Uint8Array(arrayBuffer);

  try {
    let doc: any;
    try {
      const loadingTask = (pdfjsLib as any).getDocument({
        data: uint8,
        isEvalSupported: false,
        useSystemFonts: true,
      });
      doc = await loadingTask.promise;
    } catch (workerErr: any) {
      console.warn('Retrying with in-thread worker fallback...', workerErr);
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc = '';
      const fallbackTask = (pdfjsLib as any).getDocument({
        data: uint8,
        isEvalSupported: false,
        useSystemFonts: true,
      });
      doc = await fallbackTask.promise;
    }

    const numPages = doc.numPages;
    const allLines: PdfLine[] = [];
    let totalExtractedChars = 0;

    for (let p = 1; p <= numPages; p++) {
      if (onProgress && (p === 1 || p % 5 === 0 || p === numPages)) {
        onProgress(`Estrazione testo PDF: pagina ${p} di ${numPages}...`);
      }
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const pageWidth = viewport?.width || 595;
      const content = await page.getTextContent();

      const rawItems: PdfTextItem[] = (content.items as any[])
        .filter((it: any) => it.str && it.str.trim())
        .map((it: any) => {
          const s = it.str.trim();
          totalExtractedChars += s.length;
          return {
            x: Math.round(it.transform[4]),
            y: it.transform[5],
            w: Math.round(it.width || 0),
            str: s,
          };
        })
        .sort((a: PdfTextItem, b: PdfTextItem) => b.y - a.y || a.x - b.x);

      const clusteredRows: Array<{ y: number; items: PdfTextItem[] }> = [];
      for (const item of rawItems) {
        let placed = false;
        for (const row of clusteredRows) {
          if (Math.abs(row.y - item.y) <= 4.2) {
            row.items.push(item);
            row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
            placed = true;
            break;
          }
        }
        if (!placed) {
          clusteredRows.push({ y: item.y, items: [item] });
        }
      }

      clusteredRows.sort((a, b) => b.y - a.y);
      for (const row of clusteredRows) {
        row.items.sort((a, b) => a.x - b.x);
        allLines.push({ page: p, y: row.y, pageWidth, items: row.items });
      }
    }

    if (allLines.length === 0 || totalExtractedChars < 30) {
      throw new Error(
        'Il file PDF selezionato sembra una scansione (immagine priva di testo selezionabile). Esporta il computo come PDF vettoriale da PriMus o GeCoLa, oppure carica il file .DCF / .XPWE.'
      );
    }

    onProgress?.('Riconoscimento colonne tabellari e gruppi WBS...');

    const layout = detectColumnLayout(allLines);

    // Estrae metadati opzionali dalla testata di pagina 1
    let detectedPriceList = 'Prezzario Regionale';
    let detectedTitle = '';
    for (let i = 0; i < Math.min(allLines.length, layout.headerEndLineIndex || 25); i++) {
      const txt = cleanText(allLines[i].items.map((it) => it.str).join(' '));
      const low = txt.toLowerCase();
      if (!detectedTitle && i > 0 && i < 6 && !low.includes('computo metrico') && !low.includes('prezzario') && !low.includes('d.g.r.')) {
        detectedTitle = txt;
      }
      if (low.includes('prezzario') || low.includes('listino di riferimento')) {
        const cleanedPL = txt.replace(/listino di riferimento:?/i, '').trim();
        if (cleanedPL.length > 4 && cleanedPL.length < 100) {
          detectedPriceList = cleanedPL;
        }
      }
    }

    // Estrae categorie WBS dal "Riepilogo CATEGORIE" e individua la riga esatta di inizio riepilogo/totali finali
    const detectedCategories: Array<{ code: string; name: string; targetTotal?: number }> = [];
    let inCategorieSection = false;
    let summaryStartLineIndex = allLines.length;

    for (let i = Math.max(0, layout.headerEndLineIndex + 1); i < allLines.length; i++) {
      const line = allLines[i];
      const lineText = line.items.map((it) => it.str).join(' ');
      const lower = lineText.toLowerCase().trim();

      if (lower.includes('riepilogo super categorie')) {
        if (i < summaryStartLineIndex && line.page > 1) summaryStartLineIndex = i;
        inCategorieSection = false;
        continue;
      }
      if (lower.includes('riepilogo categorie') || (lower.includes('riepilogo') && lower.includes('wbs'))) {
        if (i < summaryStartLineIndex) summaryStartLineIndex = i;
        inCategorieSection = true;
        continue;
      }

      // Interrompe l'analisi delle voci quando iniziano i totali generali finali o le note metodologiche a fine computo
      if (
        !lower.includes('a riportare') &&
        !lower.includes('parziale') &&
        (lower.startsWith('totale lavori') ||
          lower.startsWith('totale imponibile') ||
          lower.startsWith('totale generale') ||
          lower.startsWith('totale computo') ||
          lower.startsWith('note metodologiche') ||
          lower.startsWith('quadro economico'))
      ) {
        if (i < summaryStartLineIndex) {
          summaryStartLineIndex = i;
        }
        break;
      }

      if (inCategorieSection && lower.startsWith('totale')) {
        inCategorieSection = false;
        continue;
      }

      if (inCategorieSection && line.page >= Math.max(1, numPages - 4)) {
        const match = lineText.match(/^(?:WBS\.?|S\.?)?0*([1-9]\d*)\s+(.+?)\s+([\d´' .]+,\d{2})\s*(?:[\d,]+%?)?$/);
        if (match) {
          detectedCategories.push({
            code: `WBS.${String(match[1]).padStart(2, '0')}`,
            name: cleanText(match[2]),
            targetTotal: parseNumber(match[3]),
          });
        }
      }
    }

    onProgress?.('Estrazione voci, descrizioni e misurazioni...');

    const extractInlineNumericValues = (items: PdfTextItem[]) => {
      const numItems = items.filter((it) => it.x >= layout.qtyMinX - 8 && isNumericToken(it.str, true));
      let quantity: number | undefined;
      let unitPrice: number | undefined;
      let total: number | undefined;

      if (numItems.length === 0) return { quantity, unitPrice, total };

      for (const it of numItems) {
        const val = parseNumber(it.str);
        if (it.x < layout.qtyMaxX && quantity === undefined) {
          quantity = val;
        } else if (it.x < layout.priceMaxX && unitPrice === undefined) {
          unitPrice = val;
        } else if (total === undefined) {
          total = val;
        }
      }

      // Fallback posizionale se ci sono esattamente 3 numeri (Quantità, Prezzo Unit., Prezzo Totale)
      if (numItems.length === 3 && (quantity === undefined || unitPrice === undefined || total === undefined)) {
        quantity = parseNumber(numItems[0].str);
        unitPrice = parseNumber(numItems[1].str);
        total = parseNumber(numItems[2].str);
      } else if (numItems.length === 2 && quantity !== undefined && total !== undefined && unitPrice === undefined) {
        unitPrice = quantity !== 0 ? Math.round((total / quantity) * 100) / 100 : 0;
      }

      return { quantity, unitPrice, total };
    };

    const parseRawArticlesFromLines = (mode: 'order' | 'sommano-fallback') => {
      const rawArticles: any[] = [];
      let currentArticle: any = null;
      let currentMeasurements: any[] = [];
      let pendingMeasDesc: string[] = [];
      let lastOrderSeen = 0;

      const flushCurrentArticle = () => {
        if (!currentArticle) return;
        if (pendingMeasDesc.length > 0) {
          if (currentMeasurements.length > 0) {
            currentMeasurements[currentMeasurements.length - 1].description += ' ' + pendingMeasDesc.join(' ');
          } else {
            currentArticle.descriptionLines.push(...pendingMeasDesc);
          }
        }
        currentArticle.measurements = currentMeasurements;
        rawArticles.push(currentArticle);
        currentArticle = null;
        currentMeasurements = [];
        pendingMeasDesc = [];
      };

      const startLineIdx = layout.detected ? layout.headerEndLineIndex + 1 : 0;
      for (let i = startLineIdx; i < summaryStartLineIndex; i++) {
        const line = allLines[i];
        const lineText = line.items.map((it) => it.str).join(' ');
        const lowerLine = lineText.toLowerCase().trim();

        if (isHeaderOrFooterLine(lineText)) {
          continue;
        }

        // Ignora righe di etichetta interne GeCoLa/PriMus
        if (
          lowerLine === 'elenco delle misure' ||
          lowerLine.includes('valutazione a corpo - nessuna misura di dettaglio') ||
          lowerLine.includes('sommano positivi') ||
          lowerLine.includes('sommano negativi')
        ) {
          continue;
        }

        // Riconoscimento intestazione articolo
        let detectedOrder: { orderNum: number; trailingTariff?: string; sourceItem: PdfTextItem } | null = null;

        if (mode === 'order') {
          for (const it of line.items) {
            if (it.x > layout.numOrdMaxX) break;
            // Salta i sotto-badge tipo "(1.2)" generati da GeCoLa sotto al numero d'ordine
            if (/^\(\d+(?:\.\d+)*\)$/.test(it.str.trim())) continue;

            const parsedOrd = parseOrderToken(it.str);
            if (!parsedOrd) continue;

            // Verifica che il numero d'ordine sia plausibile:
            // primo articolo (1 o qualsiasi intero piccolo) oppure consecutivo/incrementale, o riavvio capitolo da 1
            const isPlausibleSequence =
              lastOrderSeen === 0
                ? parsedOrd.orderNum >= 1 && parsedOrd.orderNum <= 50
                : parsedOrd.orderNum === lastOrderSeen + 1 ||
                  parsedOrd.orderNum === 1 ||
                  (parsedOrd.orderNum > lastOrderSeen && parsedOrd.orderNum <= lastOrderSeen + 15);

            if (!isPlausibleSequence) continue;

            // Verifica che la riga abbia almeno un codice tariffa o una descrizione (non sia una riga vuota o solo numero pagina)
            const hasRestContent = line.items.some((other) => other !== it && other.x >= layout.tariffMinX);
            if (hasRestContent || parsedOrd.trailingTariff) {
              detectedOrder = { ...parsedOrd, sourceItem: it };
              break;
            }
          }
        } else {
          // Modalità fallback: riconosce inizio voce quando appare un codice tariffa nella colonna tariffa con testo descrizione
          const tariffCandidate = line.items.find(
            (it) => it.x >= layout.numOrdMaxX - 15 && it.x < layout.tariffMaxX + 20 && looksLikeTariffCode(it.str)
          );
          const hasDesc = line.items.some((it) => it.x >= layout.descMinX && it.x < layout.descMaxX && !isNumericToken(it.str));
          if (tariffCandidate && hasDesc && (!currentArticle || currentArticle.total > 0 || currentMeasurements.length > 0)) {
            detectedOrder = { orderNum: rawArticles.length + (currentArticle ? 2 : 1), sourceItem: tariffCandidate };
          }
        }

        if (detectedOrder) {
          flushCurrentArticle();

          const orderNum = detectedOrder.orderNum > lastOrderSeen ? detectedOrder.orderNum : lastOrderSeen + 1;
          lastOrderSeen = detectedOrder.orderNum;

          // Cattura il codice tariffa integrale nella colonna tariffa (e fallback su token tariffario subito dopo il numero ordine)
          let tariffItems = line.items.filter(
            (it) =>
              it !== detectedOrder!.sourceItem &&
              it.x >= layout.tariffMinX &&
              it.x < layout.tariffMaxX &&
              !/^\(\d+(?:\.\d+)*\)$/.test(it.str.trim())
          );

          if (tariffItems.length === 0 && !detectedOrder.trailingTariff) {
            const explicitTariff = line.items.find(
              (it) =>
                it !== detectedOrder!.sourceItem &&
                it.x > detectedOrder!.sourceItem.x + detectedOrder!.sourceItem.w &&
                it.x < layout.descMaxX &&
                looksLikeTariffCode(it.str)
            );
            if (explicitTariff) {
              tariffItems = [explicitTariff];
            }
          }

          const tariffCode = detectedOrder.trailingTariff || tariffItems.map((t) => t.str).join(' ').trim();
          const tariffItemSet = new Set(tariffItems);
          const descItems = line.items.filter(
            (it) =>
              it !== detectedOrder!.sourceItem &&
              !tariffItemSet.has(it) &&
              it.x >= layout.descMinX &&
              it.x < layout.descMaxX
          );

          // Estrae eventuale U.M., Quantità, Prezzo Unit., Prezzo Totale inline sulla prima riga (computi sintetici 6/7 colonne)
          const inlineUmItems = layout.hasUnitColumn
            ? line.items.filter(
                (it) => it.x >= layout.umMinX && it.x < layout.umMaxX && !isNumericToken(it.str, true)
              )
            : [];
          const inlineUnit = inlineUmItems.map((u) => u.str).join(' ').trim();
          const inlineNums = extractInlineNumericValues(line.items);

          currentArticle = {
            order: rawArticles.length + 1,
            displayOrder: orderNum,
            code: tariffCode,
            descriptionLines: descItems.map((d) => d.str),
            measurements: [],
            unit: inlineUnit || 'cad',
            quantity: inlineNums.quantity ?? 0,
            unitPrice: inlineNums.unitPrice ?? 0,
            total: inlineNums.total ?? 0,
            page: line.page,
          };
          currentMeasurements = [];
          pendingMeasDesc = [];
          continue;
        }

        if (!currentArticle) continue;

        // Ignora righe con il solo badge GeCoLa "(1.2)" nella prima colonna
        const nonBadgeItems = line.items.filter(
          (it) => !(it.x <= layout.numOrdMaxX && /^\(\d+(?:\.\d+)*\)$/.test(it.str.trim()))
        );
        if (nonBadgeItems.length === 0) continue;

        // Riga SOMMANO / TOTALE VOCE (formato analitico PriMus/GeCoLa)
        const sommanoIdx = nonBadgeItems.findIndex((it) => /\bSOMMANO\b/i.test(it.str));
        if (sommanoIdx !== -1) {
          const sommanoToken = nonBadgeItems[sommanoIdx];
          let u = sommanoToken.str.replace(/.*SOMMANO/i, '').trim();
          if (
            !u &&
            nonBadgeItems[sommanoIdx + 1] &&
            nonBadgeItems[sommanoIdx + 1].x < layout.qtyMinX &&
            !isNumericToken(nonBadgeItems[sommanoIdx + 1].str, true)
          ) {
            u = nonBadgeItems[sommanoIdx + 1].str.trim();
          }
          currentArticle.unit = u || currentArticle.unit || 'cad';

          const numItems = nonBadgeItems.filter((it) => it.x >= layout.qtyMinX - 15 && isNumericToken(it.str, true));
          if (numItems.length >= 3) {
            currentArticle.quantity = parseNumber(numItems[0].str);
            currentArticle.unitPrice = parseNumber(numItems[1].str);
            currentArticle.total = parseNumber(numItems[2].str);
          } else if (numItems.length === 2) {
            currentArticle.unitPrice = parseNumber(numItems[0].str);
            currentArticle.total = parseNumber(numItems[1].str);
          } else if (numItems.length === 1) {
            currentArticle.total = parseNumber(numItems[0].str);
          }
          continue;
        }

        const dimItems = layout.hasDimColumns
          ? nonBadgeItems.filter((it) => it.x >= layout.descMaxX - 5 && it.x < layout.qtyMaxX + 10 && isNumericToken(it.str))
          : [];
        const descItems = nonBadgeItems.filter((it) => it.x >= layout.tariffMinX - 5 && it.x < layout.descMaxX);

        // Se non ci sono dimensioni numeriche, può essere continuazione descrizione, tariffa su più righe o riga finale con U.M./totali inline
        if (dimItems.length === 0) {
          const subTariffItems = nonBadgeItems.filter((it) => it.x >= layout.tariffMinX && it.x < layout.tariffMaxX);
          if (subTariffItems.length > 0 && currentMeasurements.length === 0) {
            const extraTariff = subTariffItems.map((t) => t.str).join(' ').trim();
            if (extraTariff && !currentArticle.code) {
              currentArticle.code = extraTariff;
            }
          }

          if (!layout.hasDimColumns && currentArticle.quantity === 0 && currentArticle.unitPrice === 0) {
            const trailingUm = layout.hasUnitColumn
              ? nonBadgeItems
                  .filter((it) => it.x >= layout.umMinX && it.x < layout.umMaxX && !isNumericToken(it.str, true))
                  .map((u) => u.str)
                  .join(' ')
                  .trim()
              : '';
            if (trailingUm) currentArticle.unit = trailingUm;
            const trailingNums = extractInlineNumericValues(nonBadgeItems);
            if (trailingNums.quantity !== undefined) currentArticle.quantity = trailingNums.quantity;
            if (trailingNums.unitPrice !== undefined) currentArticle.unitPrice = trailingNums.unitPrice;
            if (trailingNums.total !== undefined) currentArticle.total = trailingNums.total;
          }

          const realDescItems = nonBadgeItems.filter((it) => it.x >= layout.descMinX - 8 && it.x < layout.descMaxX);
          if (realDescItems.length > 0) {
            const descStr = realDescItems.map((d) => d.str).join(' ').trim();
            if (descStr) {
              if (currentMeasurements.length === 0) {
                currentArticle.descriptionLines.push(descStr);
              } else {
                pendingMeasDesc.push(descStr);
              }
            }
          }
          continue;
        }

        // Riga di misurazione con quote numeriche
        let parUg: number | undefined = undefined;
        let lung: number | undefined = undefined;
        let larg: number | undefined = undefined;
        let hPeso: number | undefined = undefined;
        let rowQty: number | undefined = undefined;

        for (const it of dimItems) {
          const val = parseNumber(it.str);
          if (it.x < layout.parUgMaxX) parUg = val;
          else if (it.x < layout.lungMaxX) lung = val;
          else if (it.x < layout.largMaxX) larg = val;
          else if (it.x < layout.hPesoMaxX) hPeso = val;
          else rowQty = val;
        }

        const descStr = descItems.map((it) => it.str).join(' ').trim();
        const fullRowDesc = [...pendingMeasDesc, descStr].filter(Boolean).join(' ').trim();
        pendingMeasDesc = [];

        const lowerRowDesc = fullRowDesc.toLowerCase();
        const isSubtotal = lowerRowDesc.includes('sommano parzial') || lowerRowDesc.includes('parziale');
        const isDeduction =
          lowerRowDesc.includes('a detrarre') ||
          lowerRowDesc.includes('a dedurre') ||
          (rowQty !== undefined && rowQty < 0);
        const absRowQty = rowQty !== undefined ? Math.abs(rowQty) : 0;

        currentMeasurements.push({
          id: `m_${currentArticle.order}_${currentMeasurements.length + 1}`,
          description: isSubtotal ? '' : fullRowDesc || 'Misurazione',
          multiplier: parUg !== undefined ? Math.abs(parUg) : undefined,
          length: lung !== undefined ? Math.abs(lung) : undefined,
          width: larg !== undefined ? Math.abs(larg) : undefined,
          height: hPeso !== undefined ? Math.abs(hPeso) : undefined,
          pdfQuantity: absRowQty,
          type: isSubtotal ? 'subtotal' : isDeduction ? 'deduction' : 'positive',
        });
      }

      flushCurrentArticle();
      return rawArticles;
    };

    let rawArticles = parseRawArticlesFromLines('order');
    if (rawArticles.length === 0) {
      rawArticles = parseRawArticlesFromLines('sommano-fallback');
    }

    if (rawArticles.length > 0) {
      const effectiveCats =
        detectedCategories.length > 0
          ? detectedCategories
          : [{ code: 'WBS.01', name: 'LAVORI A MISURA', targetTotal: 999999999 }];

      const categories: Category[] = effectiveCats.map((cat, c) => ({
        id: `cat_${c + 1}`,
        code: `WBS.${String(c + 1).padStart(2, '0')}`,
        name: cat.name,
        type: 'work' as const,
        isEnabled: true,
        isSuperCategory: false,
        parentId: undefined,
      }));

      for (const raw of rawArticles) {
        if (raw.quantity === 0 && raw.total > 0 && raw.unitPrice > 0) {
          raw.quantity = Math.round((raw.total / raw.unitPrice) * 100) / 100;
        }
        if (raw.measurements.length === 0) {
          raw.measurements = [
            {
              id: `m_${raw.order}_1`,
              description: 'Misurazione da computo',
              pdfQuantity: Math.abs(raw.quantity || 0),
              type: (raw.quantity || 0) < 0 ? 'deduction' : 'positive',
            },
          ];
        }
      }

      let currentCatIdx = 0;
      let runningCatSum = 0;

      const articles: Article[] = rawArticles.map((raw) => {
        const cat = categories[currentCatIdx] || categories[0];
        const target = effectiveCats[currentCatIdx];
        runningCatSum += raw.total || 0;

        const assignedCatCode = cat.code;

        if (
          target?.targetTotal &&
          Math.round(runningCatSum * 100) >= Math.round(target.targetTotal * 100) - 100 &&
          currentCatIdx < categories.length - 1
        ) {
          currentCatIdx++;
          runningCatSum = 0;
        }

        const fullDesc = cleanText(raw.descriptionLines.join(' ')) || `Voce n. ${raw.order}`;
        const cleanTariff = cleanText(raw.code) || `NP.${String(raw.order).padStart(3, '0')}`;

        return {
          id: `art_conv_${raw.order}`,
          categoryCode: assignedCatCode,
          code: cleanTariff,
          originalGlobalIndex: raw.order,
          priceListSource: cleanTariff.startsWith('NV')
            ? 'Nuovo Prezzo PriMus'
            : cleanTariff.startsWith('AP')
            ? 'Analisi Prezzo'
            : detectedPriceList,
          description: fullDesc,
          unit: raw.unit || 'cad',
          unitPrice: raw.unitPrice || 0,
          laborRate: 35.0,
          measurements: raw.measurements,
          quantity: raw.quantity || 0,
          displayMode: 0,
        };
      });

      const totalAmount = articles.reduce((sum, a) => sum + a.unitPrice * a.quantity, 0);

      const projectInfo: ProjectInfo = {
        title: detectedTitle || (fileName ? fileName.replace(/\.pdf$/i, '') : 'Computo Metrico da PDF'),
        client: 'Committente da Computo PDF',
        designer: 'Progettista da Computo PDF',
        location: 'Cantiere Principale',
        date: new Date().toLocaleDateString('it-IT'),
        priceList: detectedPriceList,
        region: 'Nazionale',
        year: String(new Date().getFullYear()),
        vatRate: 10,
        safetyRate: 2.5,
      };

      return {
        projectInfo,
        categories,
        articles,
        totalAmount,
        totalPages: numPages,
        articlesCount: articles.length,
        fileName,
      };
    }

    throw new Error(
      'Nessuna voce di computo rilevata nel documento PDF. Assicurati che sia un PDF vettoriale (non scansione) con stampa tabellare di PriMus, GeCoLa o software equivalente, oppure usa direttamente il file .DCF / .XPWE.'
    );
  } catch (err: any) {
    console.error('Errore decodifica PDF computo:', err);
    throw new Error(err.message || 'Errore durante la lettura del PDF.');
  }
}
