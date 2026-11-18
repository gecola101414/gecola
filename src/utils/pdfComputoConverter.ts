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

function isNumericToken(str: string): boolean {
  if (!str) return false;
  const s = str.trim();
  if (!/\d/.test(s)) return false;
  return /^[+-]?[\d.'´\u00A0]+([.,]\d+)?%?$/.test(s);
}

function cleanText(str: string): string {
  if (!str) return '';
  return str.replace(/\s+/g, ' ').trim();
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
  numOrdMaxX: number;
  tariffMinX: number;
  tariffMaxX: number;
  descMinX: number;
  descMaxX: number;
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
    numOrdMaxX: Math.round(62 * s),
    tariffMinX: Math.round(52 * s),
    tariffMaxX: Math.round(125 * s),
    descMinX: Math.round(115 * s),
    descMaxX: Math.round(282 * s),
    parUgMaxX: Math.round(318 * s),
    lungMaxX: Math.round(355 * s),
    largMaxX: Math.round(390 * s),
    hPesoMaxX: Math.round(428 * s),
    qtyMinX: Math.round(420 * s),
    qtyMaxX: Math.round(480 * s),
    priceMaxX: Math.round(535 * s),
  };
}

function detectColumnLayout(lines: PdfLine[]): ColumnLayout {
  const firstPageWidth = lines[0]?.pageWidth || 595;
  const fallback = getDefaultColumnLayout(firstPageWidth);
  const s = firstPageWidth > 0 ? firstPageWidth / 595 : 1;

  for (const line of lines) {
    const joined = line.items.map((it) => it.str).join(' ').toLowerCase();
    const hasDesignazione = joined.includes('designazione') || joined.includes('descrizione') || joined.includes('lavori');
    const hasTariffa = joined.includes('tariffa') || joined.includes('codice') || joined.includes('num.ord') || joined.includes('n.');
    const hasDims =
      (joined.includes('par') && joined.includes('lung')) ||
      (joined.includes('quantit') && (joined.includes('import') || joined.includes('total') || joined.includes('prezz') || joined.includes('unitar')));

    if (!(hasDesignazione && (hasTariffa || hasDims))) continue;

    const findColItem = (patterns: RegExp[]): PdfTextItem | null => {
      for (const it of line.items) {
        const lower = it.str.toLowerCase();
        if (patterns.some((p) => p.test(lower))) {
          return it;
        }
      }
      return null;
    };

    const numItem = findColItem([/^n\.?$/, /num\.?\s*ord/, /^ord/]);
    const tariffItem = findColItem([/tariffa/, /codice/]);
    const descItem = findColItem([/designazione/, /descrizione/]);
    const parUgItem = findColItem([/par\.?\s*ug/, /parti/]);
    const lungItem = findColItem([/lung/]);
    const largItem = findColItem([/larg/]);
    const hPesoItem = findColItem([/h\/?peso/, /alt/]);
    const qtyItem = findColItem([/quantit/, /^q\.?t[aà]/]);
    const priceItem = findColItem([/unitar/, /prezzo/]);
    const totalItem = findColItem([/totale/, /importo/]);

    const center = (it: PdfTextItem | null): number | null =>
      it ? Math.round(it.x + (it.w > 0 ? it.w / 2 : 12)) : null;

    const midCenter = (a: PdfTextItem | null, b: PdfTextItem | null, def: number): number => {
      const ca = center(a);
      const cb = center(b);
      return ca !== null && cb !== null ? Math.round((ca + cb) / 2) : def;
    };

    if (descItem !== null && (tariffItem !== null || numItem !== null)) {
      const numOrdMaxX =
        numItem && tariffItem
          ? Math.round(Math.min(numItem.x + Math.max(numItem.w, 18) + 8 * s, tariffItem.x - 4 * s))
          : tariffItem
          ? Math.round(tariffItem.x - 6 * s)
          : fallback.numOrdMaxX;

      const tariffMinX = Math.max(0, numOrdMaxX - 6);
      const tariffMaxX = tariffItem
        ? Math.round(Math.min(descItem.x - 4 * s, tariffItem.x + Math.max(tariffItem.w, 26) + 22 * s))
        : Math.round(numOrdMaxX + 65 * s);

      const descMinX = Math.max(0, tariffMaxX - 6);
      const firstDimLeft = parUgItem?.x ?? lungItem?.x ?? largItem?.x ?? hPesoItem?.x ?? qtyItem?.x;
      const descMaxX = firstDimLeft !== undefined ? Math.round(firstDimLeft - 8 * s) : fallback.descMaxX;

      const parUgMaxX = midCenter(parUgItem, lungItem, descMaxX + Math.round(35 * s));
      const lungMaxX = midCenter(lungItem, largItem, parUgMaxX + Math.round(33 * s));
      const largMaxX = midCenter(largItem, hPesoItem, lungMaxX + Math.round(33 * s));
      const hPesoMaxX = midCenter(hPesoItem, qtyItem, largMaxX + Math.round(35 * s));
      const qtyMaxX = midCenter(qtyItem, priceItem, hPesoMaxX + Math.round(50 * s));
      const priceMaxX = midCenter(priceItem, totalItem, qtyMaxX + Math.round(50 * s));

      return {
        detected: true,
        numOrdMaxX,
        tariffMinX,
        tariffMaxX,
        descMinX,
        descMaxX,
        parUgMaxX,
        lungMaxX,
        largMaxX,
        hPesoMaxX,
        qtyMinX: hPesoMaxX - 4,
        qtyMaxX,
        priceMaxX,
      };
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

function looksLikeTariffCode(str: string): boolean {
  const s = str.trim();
  if (!s || s.length < 2 || s.length > 35) return false;
  if (s.includes(' ')) return false;
  // Esempi tipici: A01.001, 01.A01.001, NP.01, NV.002, AP.01, E.01.010,TOS24_01.A01, SAR23_...
  return (
    /^[A-Za-z]{1,6}[._\-/]?\d+[A-Za-z0-9._/\-]*$/.test(s) ||
    /^\d{1,3}[._\-][A-Za-z0-9]{1,8}([._\-][A-Za-z0-9]{1,8})*$/.test(s)
  );
}

function isHeaderOrFooterLine(lineText: string): boolean {
  const lower = lineText.toLowerCase();
  return (
    lineText.includes('D I M E N S I O N I') ||
    lineText.includes('I M P O R T I') ||
    lower.includes('designazione dei lavori') ||
    (lower.includes('par.ug') && lower.includes('h/peso')) ||
    (lower.includes('tariffa') && lower.includes('quantit')) ||
    lineText.includes('R I P O R T O') ||
    lineText.includes('A R I P O R T A R E') ||
    lower.startsWith('committente:') ||
    /^pag\.\s*\d+/i.test(lineText.trim()) ||
    /^pagina\s*\d+/i.test(lineText.trim()) ||
    lower.includes('parziale lavori') ||
    lineText.includes('T O T A L E') ||
    /^[-_=]{4,}$/.test(lineText.trim())
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

    // Estrae categorie WBS dal "Riepilogo CATEGORIE" e individua la riga esatta di inizio riepilogo
    const detectedCategories: Array<{ code: string; name: string; targetTotal?: number }> = [];
    let inCategorieSection = false;
    let summaryStartLineIndex = allLines.length;

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      if (line.page < Math.max(1, numPages - 4)) continue;
      const lineText = line.items.map((it) => it.str).join(' ');
      const lower = lineText.toLowerCase();

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
      if (inCategorieSection && lower.startsWith('totale')) {
        inCategorieSection = false;
        continue;
      }

      if (inCategorieSection) {
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

      for (let i = 0; i < summaryStartLineIndex; i++) {
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
            (it) => it.x >= layout.numOrdMaxX - 15 && it.x < layout.tariffMaxX + 10 && looksLikeTariffCode(it.str)
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

          const tariffItems = line.items.filter(
            (it) =>
              it !== detectedOrder!.sourceItem &&
              it.x >= layout.tariffMinX &&
              it.x < layout.tariffMaxX &&
              !/^\(\d+(?:\.\d+)*\)$/.test(it.str.trim())
          );
          const tariffCode = detectedOrder.trailingTariff || tariffItems.map((t) => t.str).join(' ').trim();
          const descItems = line.items.filter((it) => it.x >= layout.descMinX && it.x < layout.descMaxX);

          currentArticle = {
            order: rawArticles.length + 1,
            displayOrder: orderNum,
            code: tariffCode,
            descriptionLines: descItems.map((d) => d.str),
            measurements: [],
            unit: 'cad',
            quantity: 0,
            unitPrice: 0,
            total: 0,
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

        // Riga SOMMANO / TOTALE VOCE
        const sommanoIdx = nonBadgeItems.findIndex((it) => /\bSOMMANO\b/i.test(it.str));
        if (sommanoIdx !== -1) {
          const sommanoToken = nonBadgeItems[sommanoIdx];
          let u = sommanoToken.str.replace(/.*SOMMANO/i, '').trim();
          if (!u && nonBadgeItems[sommanoIdx + 1] && nonBadgeItems[sommanoIdx + 1].x < layout.qtyMinX && !isNumericToken(nonBadgeItems[sommanoIdx + 1].str)) {
            u = nonBadgeItems[sommanoIdx + 1].str.trim();
          }
          currentArticle.unit = u || currentArticle.unit || 'cad';

          const numItems = nonBadgeItems.filter((it) => it.x >= layout.qtyMinX - 15 && isNumericToken(it.str));
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

        const dimItems = nonBadgeItems.filter((it) => it.x >= layout.descMaxX - 5 && it.x < layout.qtyMaxX + 10 && isNumericToken(it.str));
        const descItems = nonBadgeItems.filter((it) => it.x >= layout.tariffMinX - 5 && it.x < layout.descMaxX);

        // Se non ci sono dimensioni numeriche, può essere continuazione descrizione o tariffa su più righe
        if (dimItems.length === 0) {
          const subTariffItems = nonBadgeItems.filter((it) => it.x >= layout.tariffMinX && it.x < layout.tariffMaxX);
          if (subTariffItems.length > 0 && currentMeasurements.length === 0) {
            const extraTariff = subTariffItems.map((t) => t.str).join(' ').trim();
            if (extraTariff && !currentArticle.code) {
              currentArticle.code = extraTariff;
            }
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
            : 'Prezzario Regionale',
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
        title: fileName ? fileName.replace(/\.pdf$/i, '') : 'Computo Metrico da PDF',
        client: 'Committente da Computo PriMus',
        designer: 'Progettista da Computo PriMus',
        location: 'Cantiere Principale',
        date: new Date().toLocaleDateString('it-IT'),
        priceList: 'Prezzario di Progetto (PriMus ACCA)',
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
