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
    console.warn("Could not set local pdf workerSrc", e);
  }
}

function parseNumber(str: string): number {
  if (!str) return 0;
  const clean = str.replace(/[´' ]/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
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

export async function convertPdfComputo(fileOrBuffer: File | ArrayBuffer | Uint8Array, fileName?: string): Promise<ConvertedComputoResult> {
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
        useSystemFonts: true
      });
      doc = await loadingTask.promise;
    } catch (workerErr: any) {
      console.warn("Retrying with in-thread worker fallback...", workerErr);
      (pdfjsLib as any).GlobalWorkerOptions.workerSrc = '';
      const fallbackTask = (pdfjsLib as any).getDocument({
        data: uint8,
        isEvalSupported: false,
        useSystemFonts: true
      });
      doc = await fallbackTask.promise;
    }

    const numPages = doc.numPages;
    const allLines: Array<{ page: number; y: number; items: Array<{ x: number; str: string }> }> = [];

    for (let p = 1; p <= numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows: Record<number, Array<{ x: number; str: string }>> = {};

      for (const item of content.items as any[]) {
        if (!item.str || !item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 2.5) * 2.5;
        if (!rows[y]) rows[y] = [];
        rows[y].push({ x: Math.round(item.transform[4]), str: item.str.trim() });
      }

      const sortedY = Object.keys(rows).map(Number).sort((a, b) => b - a);
      for (const y of sortedY) {
        const items = rows[y].sort((a, b) => a.x - b.x);
        allLines.push({ page: p, y, items });
      }
    }

    // Extract ONLY single WBS categories under "Riepilogo CATEGORIE"
    const detectedCategories: Array<{ code: string; name: string; targetTotal?: number }> = [];
    let inCategorieSection = false;

    for (const line of allLines) {
      if (line.page < Math.max(1, numPages - 4)) continue;
      const lineText = line.items.map(it => it.str).join(' ');

      if (lineText.toLowerCase().includes('riepilogo super categorie')) {
        inCategorieSection = false;
        continue;
      }
      if (lineText.toLowerCase().includes('riepilogo categorie')) {
        inCategorieSection = true;
        continue;
      }
      if (inCategorieSection && lineText.toLowerCase().startsWith('totale')) {
        inCategorieSection = false;
        continue;
      }

      if (inCategorieSection) {
        const match = lineText.match(/^0*([1-9]\d*)\s+(.+?)\s+([\d´' ,.]+)\s+([\d,]+)%?$/);
        if (match) {
          detectedCategories.push({
            code: `WBS.${String(match[1]).padStart(2, '0')}`,
            name: cleanText(match[2]),
            targetTotal: parseNumber(match[3])
          });
        }
      }
    }

    // Now extract articles
    const rawArticles: any[] = [];
    let currentArticle: any = null;
    let currentMeasurements: any[] = [];
    let pendingMeasDesc: string[] = [];
    let expectedOrder = 1;

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      if (line.page >= numPages - 1 && detectedCategories.length > 0) continue; // skip summary pages

      const firstItem = line.items[0];
      const lineText = line.items.map(it => it.str).join(' ');

      // Header/Footer filter (only skip table header when both par.ug. and H/peso are present)
      if (lineText.includes('D I M E N S I O N I') || lineText.includes('I M P O R T I') || 
          lineText.includes('DESIGNAZIONE DEI LAVORI') || (lineText.includes('par.ug.') && lineText.includes('H/peso')) || 
          lineText.includes('R I P O R T O') || lineText.includes('COMMITTENTE:') || 
          lineText.includes('A R I P O R T A R E') || lineText.startsWith('pag.') ||
          lineText.includes('Parziale LAVORI') || lineText.includes('T O T A L E') || lineText.includes('---')) {
        continue;
      }

      const isNewArticle = firstItem && firstItem.x <= 35 && firstItem.str === String(expectedOrder);

      if (isNewArticle) {
        if (currentArticle) {
          if (pendingMeasDesc.length > 0) {
            if (currentMeasurements.length > 0) {
              currentMeasurements[currentMeasurements.length - 1].description += ' ' + pendingMeasDesc.join(' ');
            } else {
              currentArticle.descriptionLines.push(...pendingMeasDesc);
            }
          }
          currentArticle.measurements = currentMeasurements;
          rawArticles.push(currentArticle);
        }

        currentArticle = {
          order: expectedOrder,
          code: '',
          descriptionLines: [],
          measurements: [],
          unit: 'cad',
          quantity: 0,
          unitPrice: 0,
          total: 0,
          page: line.page
        };
        currentMeasurements = [];
        pendingMeasDesc = [];
        expectedOrder++;

        for (let k = 1; k < line.items.length; k++) {
          const item = line.items[k];
          if (item.x >= 50 && item.x < 285) {
            currentArticle.descriptionLines.push(item.str);
          }
        }
        continue;
      }

      if (!currentArticle) continue;

      if (lineText.toLowerCase().includes('sommano positivi') || lineText.toLowerCase().includes('sommano negativi')) {
        continue;
      }

      const sommanoItem = line.items.find(it => it.str.toUpperCase().startsWith('SOMMANO'));
      if (sommanoItem) {
        const u = sommanoItem.str.replace(/SOMMANO/i, '').trim();
        currentArticle.unit = u || 'cad';
        const numItems = line.items.filter(it => it.x >= 435);
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

      const dimItems = line.items.filter(it => it.x >= 285 && it.x < 480);
      let descItems = line.items.filter(it => it.x >= 50 && it.x < 285);

      if (firstItem && firstItem.x <= 35) {
        const parts = firstItem.str.split(/\s+/);
        const codePart = parts[0];
        const descPart = parts.slice(1).join(' ');

        if (currentArticle.code) {
          currentArticle.code += '.' + codePart;
        } else {
          currentArticle.code = codePart;
        }

        const PeekDesc = [descPart, ...descItems.map(d => d.str)].filter(Boolean).join(' ');
        if (dimItems.length === 0 && !PeekDesc.toLowerCase().includes('vedi voce')) {
          if (descPart) {
            currentArticle.descriptionLines.push(descPart);
          }
          for (const item of descItems) {
            currentArticle.descriptionLines.push(item.str);
          }
          continue;
        } else if (descPart) {
          descItems = [{ x: 65, str: descPart }, ...descItems];
        }
      }

      const descStr = descItems.map(it => it.str).join(' ').trim();
      const isVediVoceLine = descStr.toLowerCase().includes('vedi voce');

      if (dimItems.length > 0 || isVediVoceLine) {
        let parUg: number | undefined = undefined;
        let lung: number | undefined = undefined;
        let larg: number | undefined = undefined;
        let hPeso: number | undefined = undefined;
        let rowQty: number | undefined = undefined;

        for (const it of dimItems) {
          const val = parseNumber(it.str);
          if (it.x >= 285 && it.x < 320) parUg = val;
          else if (it.x >= 320 && it.x < 360) lung = val;
          else if (it.x >= 360 && it.x < 398) larg = val;
          else if (it.x >= 398 && it.x < 435) hPeso = val;
          else if (it.x >= 435 && it.x < 480) rowQty = val;
        }

        if (currentMeasurements.length === 0 && pendingMeasDesc.length === 0 && currentArticle.descriptionLines.length > 1) {
          const lastDescLine = currentArticle.descriptionLines[currentArticle.descriptionLines.length - 1];
          if (lastDescLine.trim().endsWith('*') || descStr.startsWith('(par.ug.=')) {
            pendingMeasDesc.push(currentArticle.descriptionLines.pop()!);
          }
        }

        const fullRowDesc = [...pendingMeasDesc, descStr].filter(Boolean).join(' ').trim();
        pendingMeasDesc = [];

        const isDeduction = fullRowDesc.toLowerCase().includes('a detrarre') || (rowQty !== undefined && rowQty < 0);
        // Se nel PDF la colonna Quantità del rigo è vuota (es. rigo con quantità 0,00), il valore PDF è 0
        const absRowQty = rowQty !== undefined ? Math.abs(rowQty) : 0;

        // Mantieni SEMPRE intatti tutti i valori interni trovati nel PDF (par.ug., lung., larg., H/peso)
        // e salva la quantità letta nella colonna Quantità del PDF in pdfQuantity
        currentMeasurements.push({
          id: `m_${currentArticle.order}_${currentMeasurements.length + 1}`,
          description: fullRowDesc || 'Misurazione',
          multiplier: parUg !== undefined ? Math.abs(parUg) : undefined,
          length: lung !== undefined ? Math.abs(lung) : undefined,
          width: larg !== undefined ? Math.abs(larg) : undefined,
          height: hPeso !== undefined ? Math.abs(hPeso) : undefined,
          pdfQuantity: absRowQty,
          type: isDeduction ? 'deduction' : 'positive'
        });
      } else if (descStr) {
        if (currentMeasurements.length > 0) {
          pendingMeasDesc.push(descStr);
        } else {
          currentArticle.descriptionLines.push(descStr);
        }
      }
    }

    if (currentArticle) {
      if (pendingMeasDesc.length > 0) {
        if (currentMeasurements.length > 0) {
          currentMeasurements[currentMeasurements.length - 1].description += ' ' + pendingMeasDesc.join(' ');
        } else {
          currentArticle.descriptionLines.push(...pendingMeasDesc);
        }
      }
      currentArticle.measurements = currentMeasurements;
      rawArticles.push(currentArticle);
    }

    // Build single WBS categories without any super categories
    if (rawArticles.length > 0) {
      const effectiveCats = detectedCategories.length > 0 
        ? detectedCategories 
        : [{ code: 'WBS.01', name: 'LAVORI A MISURA', targetTotal: 999999999 }];

      const categories: Category[] = effectiveCats.map((cat, c) => ({
        id: `cat_${c + 1}`,
        code: `WBS.${String(c + 1).padStart(2, '0')}`,
        name: cat.name,
        type: 'work' as const,
        isEnabled: true,
        isSuperCategory: false,
        parentId: undefined
      }));

      // Se una voce non ha alcuna riga di misura nel PDF, crea un rigo con la sola pdfQuantity letta dal PDF
      for (const raw of rawArticles) {
        if (raw.measurements.length === 0) {
          raw.measurements = [{
            id: `m_${raw.order}_1`,
            description: 'Misurazione da computo',
            pdfQuantity: Math.abs(raw.quantity || 0),
            type: (raw.quantity || 0) < 0 ? 'deduction' : 'positive'
          }];
        }
      }

      // Assign articles to single WBS work categories based on running sum and category target totals
      let currentCatIdx = 0;
      let runningCatSum = 0;

      const articles: Article[] = rawArticles.map((raw) => {
        let cat = categories[currentCatIdx] || categories[0];
        const target = effectiveCats[currentCatIdx];
        runningCatSum += raw.total || 0;

        const assignedCatCode = cat.code;

        if (target?.targetTotal && 
            Math.round(runningCatSum * 100) >= Math.round(target.targetTotal * 100) - 100 && 
            currentCatIdx < categories.length - 1) {
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
          priceListSource: cleanTariff.startsWith('NV') ? 'Nuovo Prezzo PriMus' : (cleanTariff.startsWith('AP') ? 'Analisi Prezzo' : 'Prezzario Regionale'),
          description: fullDesc,
          unit: raw.unit || 'cad',
          unitPrice: raw.unitPrice || 0,
          laborRate: 35.0,
          measurements: raw.measurements,
          quantity: raw.quantity || 0,
          displayMode: 0
        };
      });

      const totalAmount = articles.reduce((sum, a) => sum + (a.unitPrice * a.quantity), 0);

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
        safetyRate: 2.5
      };

      return {
        projectInfo,
        categories,
        articles,
        totalAmount,
        totalPages: numPages,
        articlesCount: articles.length,
        fileName
      };
    }
    throw new Error("Nessuna voce di computo rilevata nel documento PDF. Assicurati che sia una stampa tabellare di PriMus o software equivalente.");
  } catch (err: any) {
    console.error("Errore decodifica PDF computo:", err);
    throw new Error(err.message || "Errore durante la lettura del PDF.");
  }
}
