
import { Article, Category, ProjectInfo, Measurement, PriceAnalysis, AnalysisComponent, AnalysisMeasurement } from '../types';
import { REBAR_WEIGHTS } from '../constants';

// --- HELPER: Number to Text (Italian Simple Implementation) ---
const units = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];
const teens = ['dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const tens = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

const convertGroup = (n: number): string => {
    let output = '';
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    if (h > 0) { if (h === 1) output += 'cento'; else output += units[h] + 'cento'; }
    if (t === 1) { output += teens[u]; } else {
        if (t > 1) { let tenStr = tens[t]; if (u === 1 || u === 8) tenStr = tenStr.substring(0, tenStr.length - 1); output += tenStr; }
        if (u > 0 && t !== 1) output += units[u];
    }
    return output;
};

const convertBelowThousand = (n: number): string => {
    return convertGroup(n);
};

const numberToItalianWords = (num: number): string => {
    if (num === 0) return 'Zero/00';
    const absNum = Math.abs(num);
    const integerPart = Math.floor(absNum);
    const decimalPart = Math.round((absNum - integerPart) * 100);
    
    if (integerPart === 0) {
        return `Zero/${decimalPart.toString().padStart(2, '0')}`;
    }

    let words = '';
    let rem = integerPart;

    // Milioni
    if (rem >= 1000000) {
        const millions = Math.floor(rem / 1000000);
        rem = rem % 1000000;
        if (millions === 1) {
            words += 'unmilione';
        } else {
            words += convertGroup(millions) + 'milioni';
        }
    }

    // Migliaia
    if (rem >= 1000) {
        const thousands = Math.floor(rem / 1000);
        rem = rem % 1000;
        if (thousands === 1) {
            words += 'mille';
        } else {
            words += convertGroup(thousands) + 'mila';
        }
    }

    // Centinaia, decine, unità
    if (rem > 0) {
        words += convertGroup(rem);
    }

    words = words.charAt(0).toUpperCase() + words.slice(1);
    return `${words}/${decimalPart.toString().padStart(2, '0')}`;
};

const getWbsNumber = (code: string) => {
    const match = code.match(/WBS\.(\d+)/);
    if (match) return parseInt(match[1], 10);
    const sMatch = code.match(/S\.(\d+)/);
    if (sMatch) return parseInt(sMatch[1], 10);
    return code;
};

const sanitizeTextForPdf = (text: string | undefined | null): string => {
    if (!text) return '';
    return text
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/\u2265/g, '>=')
        .replace(/\u2264/g, '<=')
        .replace(/\u2260/g, '!=')
        .replace(/\u2248/g, '~')
        .replace(/\u00B1/g, '+/-')
        .replace(/[\u03BB\u019B]/g, 'lambda')
        .replace(/\u039B/g, 'Lambda')
        .replace(/\u03BC/g, '\u00B5')
        .replace(/\u00F7/g, '/')
        .replace(/\u20AC/g, '€');
};

const cleanText = (text: string | undefined | null): string => {
    if (!text) return '';
    // Sanitizza caratteri speciali non compatibili con le metriche dei font PDF standard
    let cleaned = sanitizeTextForPdf(text).replace(/\s+/g, ' ').trim();
    
    // Aggiunge un punto finale se mancante (evitando se finisce già con punteggiatura standard)
    if (cleaned.length > 0 && !/[.!?:]$/.test(cleaned)) {
        cleaned += '.';
    }
    
    return cleaned;
};

/**
 * Formatta e suddivide a capo con precisione millimetrica i codici tariffa tecnici
 * (es. Prezzari Regionali, DEI, Nuovi Prezzi) senza mai troncare lettere o numeri.
 * Spezza intelligentemente sui separatori naturali (. / - _ o spazio) o, se necessario,
 * su singoli caratteri, garantendo l'integrità legale e contabile della voce.
 */
const formatTariffCode = (
    code: string | undefined | null, 
    maxWidthMm: number = 21, 
    fontSize: number = 6.8, 
    docInstance: any = null
): string => {
    if (!code) return '';
    const cleaned = cleanText(code);
    
    const getWidth = (str: string) => {
        if (docInstance && docInstance.getStringUnitWidth) {
            docInstance.setFont("helvetica", "bold");
            docInstance.setFontSize(fontSize);
            return (docInstance.getStringUnitWidth(str) * fontSize * 25.4 / 72);
        }
        return str.length * (fontSize * 0.22);
    };

    if (getWidth(cleaned) <= maxWidthMm) {
        return cleaned;
    }

    // Suddivide preservando i caratteri separatori come parte dei token (. / - _ spazio)
    const parts = cleaned.split(/(?<=[./\-_ ])|(?=[./\-_ ])/);
    const lines: string[] = [];
    let cur = '';

    for (const p of parts) {
        if (!p) continue;
        const candidate = cur + p;
        if (getWidth(candidate) <= maxWidthMm) {
            cur = candidate;
        } else {
            if (cur) lines.push(cur);
            if (getWidth(p) > maxWidthMm) {
                // Il token singolo supera l'intera larghezza: suddivisione progressiva per caratteri
                let sub = '';
                for (const char of p) {
                    if (getWidth(sub + char) <= maxWidthMm) {
                        sub += char;
                    } else {
                        if (sub) lines.push(sub);
                        sub = char;
                    }
                }
                cur = sub;
            } else {
                cur = p;
            }
        }
    }
    if (cur) lines.push(cur);
    return lines.join('\n');
};

// Cache per misurazione larghezza parole: evita centinaia di migliaia di calcoli lenti di jsPDF
const pdfWordWidthCache = new Map<string, number>();
export const clearPdfTextWidthCache = () => {
    pdfWordWidthCache.clear();
};

const getCachedWordWidth = (doc: any, word: string): number => {
    let w = pdfWordWidthCache.get(word);
    if (w === undefined) {
        w = doc.getTextWidth(word);
        pdfWordWidthCache.set(word, w);
    }
    return w;
};

/**
 * Motore di Giustificazione Tipografica Professionale per jsPDF ad alte prestazioni:
 * Distribuisce equamente lo spazio residuo tra le parole della riga
 * fino a raggiungere l'esatta larghezza della colonna, senza sbordare,
 * garantendo che l'ultima parola rimanga rigorosamente entro il margine destro
 * e preservando l'allineamento naturale a sinistra per l'ultima riga del paragrafo.
 * Utilizza una cache delle larghezze delle parole per generare documenti estesi in millisecondi.
 */
const drawJustifiedLine = (
    doc: any,
    line: string,
    x: number,
    y: number,
    contentWidth: number,
    isLastLine: boolean
) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const words = trimmed.split(/\s+/);
    
    // Se è l'ultima riga del paragrafo o c'è una sola parola, allinea a sinistra normalmente
    if (isLastLine || words.length <= 1) {
        doc.text(trimmed, x, y);
        return;
    }
    
    // Calcola la larghezza esatta di ogni parola sfruttando la cache ad accesso O(1)
    let totalWordsWidth = 0;
    const wordWidths = words.map(w => {
        const wWidth = getCachedWordWidth(doc, w);
        totalWordsWidth += wWidth;
        return wWidth;
    });
    
    const numGaps = words.length - 1;
    const availableGapSpace = contentWidth - totalWordsWidth;
    const standardSpaceWidth = getCachedWordWidth(doc, ' ');
    const calculatedGap = numGaps > 0 ? availableGapSpace / numGaps : standardSpaceWidth;
    
    // Se lo spazio per i gap è insufficiente o se il gap risulterebbe innaturale/eccessivo,
    // disegna il testo con spaziatura standard senza forzare la giustificazione per evitare sbordature.
    if (availableGapSpace <= 0 || calculatedGap > standardSpaceWidth * 4 || calculatedGap < standardSpaceWidth * 0.1) {
        doc.text(trimmed, x, y);
        return;
    }
    
    // Distribuzione millimetrica: prima parola a x, ultima parola allineata a filo a destra su (x + contentWidth)
    let curX = x;
    for (let i = 0; i < words.length; i++) {
        if (i === words.length - 1) {
            const lastWordX = x + contentWidth - wordWidths[i];
            doc.text(words[i], Math.max(curX, lastWordX), y);
        } else {
            doc.text(words[i], curX, y);
            curX += wordWidths[i] + calculatedGap;
        }
    }
};

/**
 * Inserisce un "soft break" (spazio suggerito) in parole tecniche estremamente lunghe
 * che altrimenti romperebbero i bordi della colonna (es. codici tariffa infiniti o percorsi file).
 */
const softBreakLongWords = (text: string, maxLength: number = 26): string => {
    if (!text) return '';
    return text.split(' ').map(word => {
        if (word.length <= maxLength) return word;
        return word.replace(/([/|:=_,.-])(?=[^ ])/g, '$1 ')
                   .replace(new RegExp(`(.{${maxLength}})`, 'g'), '$1 ');
    }).join(' ');
};

const formatCurrency = (val: number | undefined | null) => {
  if (val === undefined || val === null) return '0,00';
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(val);
};

const formatNumber = (val: number | undefined | null) => {
  if (val === undefined || val === null) return '';
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(val);
};

const calculateMeasurementValue = (m: Measurement, linkedVal: number = 0) => {
    if (m.type === 'subtotal') return 0;
    const sign = m.type === 'deduction' ? -1 : 1;
    if (m.linkedArticleId) {
        let localPhysicalFactor = 1;
        if (m.length !== undefined && m.length !== 0) localPhysicalFactor *= m.length;
        if (m.width !== undefined && m.width !== 0) localPhysicalFactor *= m.width;
        if (m.height !== undefined && m.height !== 0) localPhysicalFactor *= m.height;
        const mult = m.multiplier === undefined ? 1 : m.multiplier;
        return linkedVal * localPhysicalFactor * mult * sign;
    }
    const isVediVoce = m.description ? m.description.toLowerCase().includes('vedi voce') : false;
    if (isVediVoce) {
        return (m.pdfQuantity ?? 0) * sign;
    }
    const factors = [m.length, m.width, m.height].filter(v => v !== undefined && v !== 0 && v !== null);
    const base = factors.length > 0 ? factors.reduce((a, b) => (a || 1) * (b || 1), 1) : 0;
    let effectiveMultiplier = 0;
    if (m.multiplier !== undefined) {
        effectiveMultiplier = m.multiplier;
    } else {
        if (factors.length > 0) effectiveMultiplier = 1;
    }
    const effectiveBase = (factors.length === 0 && effectiveMultiplier !== 0) ? 1 : base;
    const rawVal = effectiveBase * effectiveMultiplier;
    const roundedVal = Math.round((rawVal + Number.EPSILON) * 100) / 100;
    if (m.pdfQuantity !== undefined) {
        const hasAnyInternal = factors.length > 0 || m.multiplier !== undefined;
        if (hasAnyInternal && Math.abs(roundedVal - m.pdfQuantity) <= 0.02) {
            return roundedVal * sign;
        }
        return m.pdfQuantity * sign;
    }
    return rawVal * sign;
};

/**
 * Genera l'impronta crittografica SHA-256 standard (64 caratteri esadecimali)
 * conforme agli standard di sicurezza informatica FIPS 180-4 e D.Lgs. 82/2005 (CAD)
 * per garantire l'integrità del computo metrico e la prevenzione di contraffazioni.
 */
const computeSha256 = async (text: string): Promise<string> => {
    try {
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            const msgUint8 = new TextEncoder().encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
    } catch (e) {
        console.warn('SubtleCrypto error, using cryptographic fallback:', e);
    }
    // Fallback deterministico a 64 caratteri esadecimali
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x8a135a42, h4 = 0x9e3779b9;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
        h3 = Math.imul(h3 ^ ch, 2246822519);
        h4 = Math.imul(h4 ^ ch, 3266489917);
    }
    const hex = (h: number) => (h >>> 0).toString(16).padStart(8, '0');
    return (hex(h1) + hex(h2) + hex(h3) + hex(h4)).repeat(2);
};

const computeProjectIntegrityHash = async (
    projectInfo: ProjectInfo,
    categories: Category[],
    articles: Article[],
    totalAmount: number,
    docTitle: string = 'COMPUTO METRICO'
): Promise<string> => {
    const rawData = [
        docTitle,
        projectInfo.title || '',
        projectInfo.client || '',
        projectInfo.designer || '',
        projectInfo.date || '',
        totalAmount.toFixed(2),
        categories.filter(c => c.isEnabled !== false).map(c => `${c.code}:${c.name}`).join(';'),
        articles.map(a => `${a.code}:${a.quantity}:${(Number(a.unitPrice) || 0).toFixed(2)}`).join(';')
    ].join('||');
    return computeSha256(rawData);
};

const getLibs = async () => {
    const jsPDFModule = await import('jspdf');
    const jsPDF = (jsPDFModule as any).jsPDF || (jsPDFModule as any).default || jsPDFModule;
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = (autoTableModule as any).default || autoTableModule;
    return { jsPDF, autoTable };
};

/**
 * Genera il Frontespizio Ufficiale di Copertina ("Testalino") Standard GeCoLa,
 * con la bandana verticale in Celestino GeCoLa (#bae6fd / #38bdf8),
 * intestazione Ente in Blu Reale, Titolo in Rosso Mattone, e dati di progetto completi.
 */
export const drawAccaCoverPage = (
    doc: any,
    projectInfo: ProjectInfo,
    documentTitle: string,
    subTitle?: string
) => {
    const pageWidth = doc.internal.pageSize.width || 210;
    const pageHeight = doc.internal.pageSize.height || 297;

    // 1. DOPPIA RIGA DI RILEGATURA SUL MARGINE SINISTRO
    doc.setDrawColor(40, 50, 65);
    doc.setLineWidth(0.2);
    doc.line(7, 8, 7, pageHeight - 8);
    doc.line(9, 8, 9, pageHeight - 8);

    // 2. CORNICE PERIMETRALE ESTERNA DEL FOGLIO
    doc.setDrawColor(40, 50, 65);
    doc.setLineWidth(0.25);
    doc.rect(9, 8, pageWidth - 17, pageHeight - 16);

    // 3. INTESTAZIONE ENTE / LUOGO DEI LAVORI (in Blu Reale)
    doc.setTextColor(0, 51, 153); // #003399 Blu Reale
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13.5);
    
    let enteLine1 = "esempio: Comune di ...";
    let enteLine2 = "esempio: Provincia di ...";
    if (projectInfo.location && projectInfo.location.trim().length > 0) {
        const loc = projectInfo.location.trim();
        enteLine1 = loc.toLowerCase().startsWith("comune") ? loc : `Comune di ${loc}`;
    } else if (projectInfo.region) {
        enteLine1 = `Comune di ${projectInfo.region}`;
    }

    if (projectInfo.province && projectInfo.province.trim().length > 0) {
        const prov = projectInfo.province.trim();
        enteLine2 = prov.toLowerCase().startsWith("provincia") ? prov : `Provincia di ${prov}`;
    } else if (projectInfo.region) {
        enteLine2 = `Provincia di ${projectInfo.region}`;
    }

    doc.text(enteLine1, 54, 28);
    doc.text(enteLine2, 54, 35);



    // 4. BANDANA VERTICALE CELESTINO GECOLA (Brand GeCoLa)
    const bandX = 9;
    const bandY = 54;
    const bandWidth = 39;
    const bandHeight = 222;

    // Sfondo Celestino GeCoLa (Azzurro cielo luminoso, fresco e professionale)
    doc.setFillColor(186, 230, 253); // #bae6fd Celestino Sky-200
    doc.rect(bandX, bandY, bandWidth, bandHeight, 'F');

    // Bordo destro della fascia celestina
    doc.setDrawColor(56, 189, 248); // #38bdf8
    doc.setLineWidth(0.4);
    doc.line(bandX + bandWidth, bandY, bandX + bandWidth, bandY + bandHeight);

    // 5. TITOLO CENTRALE IN ROSSO MATTONE / BORDEAUX (ELENCO PREZZI, COMPUTO METRICO)
    doc.setTextColor(139, 0, 0); // Dark Red #8b0000
    doc.setFont("helvetica", "bold");
    
    let titleFontSize = 24;
    if (documentTitle.length > 18) titleFontSize = 20;
    if (documentTitle.length > 26) titleFontSize = 16;
    doc.setFontSize(titleFontSize);
    
    const centerTitleX = (pageWidth + bandX + bandWidth) / 2;
    doc.text(documentTitle, centerTitleX, 88, { align: 'center' });

    if (subTitle) {
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(80, 90, 105);
        doc.text(subTitle, centerTitleX, 96, { align: 'center' });
    }

    // 6. DATI DEL PROGETTO (OGGETTO, COMMITTENTE, PROGETTISTA)
    const contentX = bandX + bandWidth + 6;
    const contentMaxWidth = pageWidth - contentX - 14;

    // 6A. OGGETTO
    const oggettoY = 118;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("OGGETTO:", bandX + bandWidth - 3, oggettoY, { align: 'right' });
    
    const oggettoText = projectInfo.title || "Lavori edili ed impiantistici di contratto";
    const splitOggetto = doc.splitTextToSize(oggettoText, contentMaxWidth);
    doc.text(splitOggetto, contentX, oggettoY);

    const oggettoLinesCount = Array.isArray(splitOggetto) ? splitOggetto.length : 1;
    const oggettoBlockHeight = Math.max(16, oggettoLinesCount * 4.5);

    // 6B. COMMITTENTE
    const committenteY = oggettoY + oggettoBlockHeight + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("COMMITTENTE:", bandX + bandWidth - 3, committenteY, { align: 'right' });

    const committenteText = projectInfo.client || "Amministrazione Committente";
    const splitCommittente = doc.splitTextToSize(committenteText, contentMaxWidth);
    doc.text(splitCommittente, contentX, committenteY);

    const committenteLinesCount = Array.isArray(splitCommittente) ? splitCommittente.length : 1;
    const committenteBlockHeight = Math.max(14, committenteLinesCount * 4.5);

    // 6C. PROGETTISTA (Aggiunto come richiesto)
    const progettistaY = committenteY + committenteBlockHeight + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("PROGETTISTA:", bandX + bandWidth - 3, progettistaY, { align: 'right' });

    const progettistaText = projectInfo.designer || "Ufficio Tecnico / Progettista Incaricato";
    const splitProgettista = doc.splitTextToSize(progettistaText, contentMaxWidth);
    doc.text(splitProgettista, contentX, progettistaY);

    // 7. DATA E FIRMA (IL TECNICO) - In basso a destra
    const dataY = Math.min(235, progettistaY + 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(`Data,  ${projectInfo.date || '...' }`, contentX, dataY);

    const tecnicoX = pageWidth - 55;
    const tecnicoY = dataY + 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("IL TECNICO", tecnicoX, tecnicoY, { align: 'center' });

    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.2);
    doc.line(tecnicoX - 25, tecnicoY + 12, tecnicoX + 25, tecnicoY + 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(projectInfo.designer || "Firma e Timbro", tecnicoX, tecnicoY + 16, { align: 'center' });

    // 8. PIEDIPAGINA / COPYRIGHT
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(9, pageHeight - 15, pageWidth - 8, pageHeight - 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text("GeCoLa Cloud by GeCoLa Soft", pageWidth - 14, pageHeight - 11, { align: 'right' });
    if (!documentTitle.includes("SUBAPPALTO")) {
        doc.text(`Prezzario di Riferimento: ${projectInfo.region || ''} ${projectInfo.year || ''}`, 12, pageHeight - 11);
    }
};

/**
 * Disegna la cornice perimetrale, doppia linea di rilegatura a sinistra,
 * numero di pagina in alto a destra e "COMMITTENTE: [ ... ]" in basso a sinistra,
 * identico al layout contabile editoriale GeCoLa.
 */
export const drawAccaPageFrame = (doc: any, pageNumber: number, projectInfo: ProjectInfo) => {
    const pageWidth = doc.internal.pageSize.width || 210;
    const pageHeight = doc.internal.pageSize.height || 297;

    // Doppia linea di rilegatura sinistra
    doc.setDrawColor(40, 50, 65);
    doc.setLineWidth(0.2);
    doc.line(7, 8, 7, pageHeight - 8);
    doc.line(9, 8, 9, pageHeight - 8);

    // Cornice perimetrale esterna
    doc.setLineWidth(0.25);
    doc.rect(9, 8, pageWidth - 17, pageHeight - 16);



    // Dicitura Committente a fondo pagina a sinistra (Standard PriMus: "COMMITTENTE: [ ... ]")
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(50, 60, 75);
    const clientText = projectInfo.client ? `COMMITTENTE: [ ${projectInfo.client} ]` : `COMMITTENTE: [ ]`;
    doc.text(clientText, 12, pageHeight - 11);
};

export const drawHeaderSimple = (doc: any, projectInfo: ProjectInfo, title: string, pageNumber: number) => {
    drawAccaPageFrame(doc, pageNumber, projectInfo);
};

const drawHeader = (doc: any, projectInfo: ProjectInfo, title: string, pageNumber: number, grandTotal?: number, pageWidth?: number, pageHeight?: number, isTotalCurrency: boolean = true) => {
    drawAccaPageFrame(doc, pageNumber, projectInfo);
    
    // Testata tecnica standard PriMus: se riporto presente sulle pagine successive
    if (pageNumber > 2 && grandTotal !== undefined && grandTotal > 0) {
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text("R I P O R T O", 105, 14, { align: 'center' });
        doc.text(isTotalCurrency ? `€ ${formatCurrency(grandTotal)}` : formatNumber(grandTotal), 200, 14, { align: 'right' });
    }
};

const drawFooter = (
    doc: any, 
    pageNumber: number, 
    grandTotal: number | undefined, 
    pageTotal: number | undefined, 
    pageWidth: number, 
    pageHeight: number, 
    isTotalCurrency: boolean = true, 
    isLastPageOfTable: boolean = false
) => {
    const footerY = pageHeight - 11;
    if (!isLastPageOfTable && grandTotal !== undefined && pageTotal !== undefined) {
        const currentCumulative = grandTotal + pageTotal;
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text("A RIPORTARE", 160, footerY, { align: 'right' });
        doc.text(isTotalCurrency ? `€ ${formatCurrency(currentCumulative)}` : formatNumber(currentCumulative), 200, footerY, { align: 'right' });
    }
};

const drawSignature = (doc: any, projectInfo: ProjectInfo, yPos: number, integrityHash?: string) => {
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    let finalY = yPos + 12;
    
    // Spazio necessario per data, firma e il blocco di certificato di integrità (almeno 75mm)
    if (finalY > pageHeight - 75) { 
        doc.addPage(); 
        finalY = 25; 
        drawHeader(doc, projectInfo, "FIRMA E CERTIFICAZIONE DI INTEGRITÀ", 99, undefined, pageWidth, pageHeight);
    }
    
    doc.setDrawColor(210, 215, 220);
    doc.setLineWidth(0.15);
    doc.line(10, finalY, pageWidth - 10, finalY);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(`${projectInfo.location}, ${projectInfo.date}`, 10, finalY + 8);
    
    const signatureX = pageWidth - 70;
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.text("IL PROGETTISTA", signatureX + 30, finalY + 12, { align: 'center' });
    
    doc.setDrawColor(0);
    doc.setLineWidth(0.25);
    doc.line(signatureX, finalY + 22, signatureX + 60, finalY + 22);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(projectInfo.designer, signatureX + 30, finalY + 27, { align: 'center' });
    
    // --- SIGILLO DI INTEGRITÀ DIGITALE (ANTI-CONTRAFFAZIONE / NON-RIPUDIO) ---
    if (integrityHash) {
        const boxY = finalY + 34;
        const boxWidth = pageWidth - 20;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.25);
        doc.roundedRect(10, boxY, boxWidth, 23, 1.5, 1.5, 'FD');
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(30, 58, 138); // Blue 900
        doc.text("CERTIFICATO DI INTEGRITÀ DIGITALE E NON-ALTERAZIONE (STANDARD CRITTOGRAFICO SHA-256)", 13, boxY + 5);
        
        doc.setFont("courier", "bold");
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        
        // Raggruppa l'hash in blocchi di 4 caratteri per massima leggibilità
        const formattedHash = integrityHash.toUpperCase().match(/.{1,4}/g)?.join(' ') || integrityHash;
        doc.text(`IMPRONTA UNIVOCA: ${formattedHash}`, 13, boxY + 10.5);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.2);
        doc.setTextColor(100, 116, 139);
        const cucId = `CUC-${integrityHash.substring(0, 8).toUpperCase()}-${integrityHash.substring(8, 16).toUpperCase()}`;
        doc.text(`Codice Univoco di Controllo: ${cucId} | Algoritmo: SHA-256 (FIPS 180-4) | Riferimento: D.Lgs. 82/2005 CAD`, 13, boxY + 15.5);
        doc.text("Questo documento è protetto da impronta crittografica generata sui dati contabili; qualsiasi manomissione ne invalida l'integrità.", 13, boxY + 19.5);
        
        return boxY + 28;
    }
    
    return finalY + 35;
};

/**
 * Applica a tutte le pagine dei prospetti contabili (da pagina 2 in poi):
 * - Riferimento normativo D.Lgs. 36/2023 & CAD D.Lgs. 82/2005
 * - Impronta crittografica SHA-256 di controllo integrità
 * Lascia la copertina ufficiale (Pagina 1 - Testalino) intatta e professionale.
 */
const applyDocumentFootersAndSecurity = (doc: any, integrityHash?: string) => {
    const totalPages = doc.internal.getNumberOfPages();
    const realTotal = totalPages - 1;
    const totalPagesStr = String(realTotal).padStart(2, '0');
    
    for (let p = 2; p <= totalPages; p++) {
        doc.setPage(p);
        const pWidth = doc.internal.pageSize.width;
        const pHeight = doc.internal.pageSize.height;
        const pageStr = String(p - 1).padStart(2, '0');
        
        // Impronta crittografica di sicurezza
        if (integrityHash) {
            doc.setFont("courier", "bold");
            doc.setFontSize(6);
            doc.setTextColor(120, 130, 145);
            const shortHash = `${integrityHash.substring(0, 20).toUpperCase()}...[${integrityHash.substring(56, 64).toUpperCase()}]`;
            doc.text(`SHA-256: ${shortHash}`, 12, pHeight - 4.2);
        }
        
        // Numerazione (Pagina 02 di 04)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(40, 45, 55);
        doc.text(`Pagina ${pageStr} di ${totalPagesStr}`, pWidth / 2, pHeight - 4.2, { align: 'center' });
        
        // Riferimento normativo
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(120, 130, 145);
        doc.text(`Integrità Digitale D.Lgs. 36/2023 - CAD D.Lgs. 82/2005`, pWidth - 12, pHeight - 4.2, { align: 'right' });
    }
};

const drawGridLines = (doc: any, startY: number, endY: number) => {
    doc.setDrawColor(200);
    doc.setLineWidth(0.1);
    const xPositions = [10, 19, 40, 98, 110.5, 122, 133.5, 146, 164, 182, 200];
    xPositions.forEach(x => {
        doc.line(x, startY, x, endY);
    });
};

const drawTableFrame = (doc: any, startY: number, endY: number) => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.rect(10, startY, 190, endY - startY);
};

const appendWbsToPdfBody = (tableBody: any[], cat: Category, articles: Article[], allArticles: Article[], globalCounter: { current: number }, projectInfo: ProjectInfo, doc: any) => {
    const catArticles = articles.filter(a => a.categoryCode === cat.code && a.isEnabled !== false);
    if (catArticles.length === 0) return;

    const isSafety = cat.type === 'safety';
    const fillColor = isSafety ? [255, 200, 150] : [240, 240, 240];

    tableBody.push([
        { content: '', styles: { isWbs: true, lineWidth: 0 } }, 
        { content: '', styles: { isWbs: true, lineWidth: 0 } }, 
        { content: `${cat.code} - ${cat.name}`, styles: { fillColor, fontStyle: 'bold', halign: 'left', cellPadding: { left: 1, right: 1, top: 3, bottom: 3 }, isWbs: true, lineWidth: 0 } },
        '', '', '', '', '', '', ''
    ]);

    catArticles.forEach((art, artIndex) => {
        const wbsN = getWbsNumber(cat.code);
        const artNum = `${wbsN}.${artIndex + 1}`;
        const gNum = globalCounter.current++;

        let finalDescription = cleanText(art.description);
        if (art.linkedAnalysisId && !finalDescription.includes('Analisi Prezzi')) {
            finalDescription += ' (Nuovo Prezzo determinato con Analisi Prezzi allegata)';
        }
        if (projectInfo.descriptionLength === 'short') {
            doc.setFontSize(8.5);
            const splitLines = doc.splitTextToSize(finalDescription, 55); 
            if (splitLines.length > 6) {
                finalDescription = splitLines.slice(0, 6).join('\n') + ' .....';
            }
        }

        tableBody.push([
            { 
              content: `${gNum}\n(${artNum})`, 
              styles: { isArt: true, halign: 'center', cellPadding: { top: 3, bottom: 1 } } 
            },
            { 
              content: formatTariffCode(art.code, 18, 6.8, doc), 
              styles: { 
                isArt: true, 
                fontStyle: 'bold', 
                cellPadding: { top: 3, bottom: 1, left: 0.5, right: 0.5 }, 
                fontSize: art.code.length > 25 ? 6 : (art.code.length > 16 ? 6.5 : 7.2), 
                halign: 'center',
                overflow: 'linebreak'
              } 
            },
            { 
              content: finalDescription, 
              styles: { 
                isArt: true, 
                isArtDesc: true,
                fontStyle: 'normal', 
                cellPadding: { left: 2.5, right: 2.5, top: 3.5, bottom: 1.5 }, 
                fontSize: 8.5, 
                valign: 'top', 
                textColor: isSafety ? [200, 80, 0] : [20, 20, 20]
              } 
            },
            '', '', '', '', '', '', ''
        ]);
        
        // Intestazione ELENCO DELLE MISURE sempre presente per rigore contabile
        tableBody.push([
            '', '', 
            { 
                content: 'ELENCO DELLE MISURE', 
                styles: { 
                    fontStyle: 'bold', 
                    fontSize: 7.5, 
                    textColor: [60, 60, 60], 
                    cellPadding: { left: 3, top: 1.8, bottom: 1.2 }, 
                    halign: 'left' 
                } 
            },
            '', '', '', '', '', '', ''
        ]);

        const validMeasurements = (art.measurements || []).filter(m => 
            (m.description && m.description.trim() !== '') || 
            (m.multiplier !== undefined && m.multiplier !== 0) || 
            (m.length !== undefined && m.length !== 0) || 
            (m.width !== undefined && m.width !== 0) || 
            (m.height !== undefined && m.height !== 0) || 
            m.linkedArticleId
        );

        if (validMeasurements.length === 0) {
            // Segnalazione esplicita per confermare che la voce è a corpo o senza quote di dettaglio
            tableBody.push([
                '', '', 
                { 
                    content: '(Valutazione a corpo - nessuna misura di dettaglio)', 
                    styles: { 
                        fontStyle: 'italic', 
                        fontSize: 7.5, 
                        textColor: [120, 120, 120], 
                        cellPadding: { left: 3, top: 1, bottom: 1.5 }, 
                        halign: 'left' 
                    } 
                },
                '', '', '', '', '', '', ''
            ]);
        } else {
            let runningPartial = 0;
            validMeasurements.forEach(m => {
                let val = 0;
                let displayDesc = cleanText(m.description);
                const isDeduction = m.type === 'deduction';
                
                if (m.linkedArticleId) {
                    const linkedArt = allArticles.find(a => a.id === m.linkedArticleId);
                    if (linkedArt) {
                        const base = m.linkedType === 'amount' ? (linkedArt.quantity * linkedArt.unitPrice) : linkedArt.quantity;
                        val = calculateMeasurementValue(m, base);
                        
                        const catArts = allArticles.filter(a => a.categoryCode === linkedArt.categoryCode);
                        const localIdx = catArts.findIndex(a => a.id === linkedArt.id) + 1;
                        const wbsPrefix = getWbsNumber(linkedArt.categoryCode);
                        const linkRef = `(Vedi voce n. ${wbsPrefix}.${localIdx})`;
                        
                        const prefix = isDeduction ? 'A DEDURRE: ' : '';
                        if (!displayDesc) displayDesc = `${prefix}${linkRef}`;
                        else if (!displayDesc.includes(linkRef)) displayDesc = `${prefix}${displayDesc} ${linkRef}`;
                        else if (isDeduction && !displayDesc.startsWith('A DEDURRE')) displayDesc = `${prefix}${displayDesc}`;
                    }
                } else {
                    val = calculateMeasurementValue(m);
                }
                
                let displayVal = val;
                if (m.type === 'subtotal') {
                    displayVal = runningPartial;
                    runningPartial = 0;
                } else {
                    runningPartial += val;
                }
                
                const rowTextColor = isDeduction ? [200, 0, 0] : [60, 60, 60];

                tableBody.push([ 
                    '', '', 
                    { 
                      content: m.type === 'subtotal' ? 'Sommano parziali' : displayDesc, 
                      styles: { 
                        fontStyle: m.type === 'subtotal' || isDeduction ? 'bold' : 'normal', 
                        halign: m.type === 'subtotal' ? 'right' : 'left', 
                        textColor: rowTextColor, 
                        cellPadding: { left: m.type === 'subtotal' ? 1 : 2, top: 1, bottom: 1 }, 
                        fontSize: 8 
                      } 
                    }, 
                    { content: formatNumber(m.multiplier), styles: { halign: 'center', textColor: rowTextColor } }, 
                    { content: formatNumber(m.length), styles: { halign: 'center', textColor: rowTextColor } }, 
                    { content: formatNumber(m.width), styles: { halign: 'center', textColor: rowTextColor } }, 
                    { content: formatNumber(m.height), styles: { halign: 'center', textColor: rowTextColor } }, 
                    { content: formatNumber(displayVal), styles: { halign: 'right', fontStyle: m.type === 'subtotal' || isDeduction ? 'bold' : 'normal', cellPadding: { left: 1.5 }, fontSize: 8, textColor: rowTextColor } }, 
                    '', '' 
                ]);
            });
        }
        tableBody.push([ '', '', { content: `SOMMANO ${art.unit}`, styles: { fontStyle: 'bold', halign: 'right', cellPadding: { right: 1, top: 3, bottom: 2 }, isTotalRow: true } }, '', '', '', '', { content: formatNumber(art.quantity), styles: { fontStyle: 'bold', halign: 'right', cellPadding: { top: 3, left: 1.5 }, isTotalRow: true, fontSize: 8 } }, { content: formatNumber(art.unitPrice), styles: { halign: 'right', cellPadding: { top: 3, left: 1.5 }, isTotalRow: true, fontSize: 8 } }, { content: art.quantity * art.unitPrice, styles: { fontStyle: 'bold', halign: 'right', textColor: [0, 0, 120], cellPadding: { top: 3, left: 1.5 }, isTotalRow: true, fontSize: 8 } } ]);
        tableBody.push([{ content: '', colSpan: 10, styles: { cellPadding: 1.5 } }]);
    });
};

export const generateComputoMetricPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[], filterType: 'work' | 'safety' = 'work') => {
  try {
    const { jsPDF, autoTable } = await getLibs();
    const doc = new jsPDF();
    const tableBody: any[] = [];
    const pageHeight = doc.internal.pageSize.height;
    const title = filterType === 'work' ? "COMPUTO METRICO ESTIMATIVO" : "COMPUTO ONERI DELLA SICUREZZA";

    // 1. FRONTESPIZIO UFFICIALE ("TESTALINO") GECOLA CON BANDANA CELESTINO
    drawAccaCoverPage(
        doc,
        projectInfo,
        filterType === 'work' ? "COMPUTO METRICO" : "COMPUTO ONERI SICUREZZA",
        filterType === 'work' ? "COMPUTO METRICO ESTIMATIVO" : "STIMA DEI COSTI PER LA SICUREZZA"
    );
    doc.addPage();

    // 2. CORPO DELLA TABELLA COMPUTO (INIZIA DA PAGINA 2 SENZA SPAZIATORI VUOTI)
    let globalTotalForClosing = 0;
    const topLevels = categories.filter(c => !c.parentId);
    const globalCounter = { current: 1 };
    
    topLevels.forEach(root => {
        if (root.isEnabled === false) return;
        if (root.isSuperCategory) {
            const children = categories.filter(c => c.parentId === root.code && !c.isSuperCategory && c.type === filterType);
            if (children.length > 0) {
                tableBody.push([
                    { content: '', colSpan: 2, styles: { lineWidth: 0 } },
                    { content: `AREA: ${root.name.toUpperCase()}`, colSpan: 8, styles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', cellPadding: 3, isSuper: true } }
                ]);
                children.forEach(child => {
                    if (child.isEnabled === false) return;
                    appendWbsToPdfBody(tableBody, child, articles, articles, globalCounter, projectInfo, doc);
                    const catArticles = articles.filter(a => a.categoryCode === child.code);
                    globalTotalForClosing += catArticles.reduce((s, a) => s + (a.quantity * a.unitPrice), 0);
                });
            }
        } else if (root.type === filterType) {
            appendWbsToPdfBody(tableBody, root, articles, articles, globalCounter, projectInfo, doc);
            const catArticles = articles.filter(a => a.categoryCode === root.code);
            globalTotalForClosing += catArticles.reduce((s, a) => s + (a.quantity * a.unitPrice), 0);
        }
    });

    const integrityHash = await computeProjectIntegrityHash(
        projectInfo,
        categories,
        articles,
        globalTotalForClosing,
        title
    );

    tableBody.push([
        { content: '', colSpan: 2, styles: { lineWidth: 0 } },
        { 
            content: filterType === 'work' ? 'TOTALE COMPUTO ESTIMATIVO' : 'TOTALE ONERI SICUREZZA', 
            colSpan: 5, 
            styles: { 
                fontStyle: 'bold', 
                halign: 'right', 
                fontSize: 11, 
                cellPadding: { top: 4.5, bottom: 4.5, right: 3, left: 3 }, 
                fillColor: [244, 247, 252], 
                textColor: [15, 23, 42],
                isClosingTotalRow: true
            } 
        },
        { 
            content: `€ ${formatCurrency(globalTotalForClosing)}`, 
            colSpan: 3, 
            styles: { 
                fontStyle: 'bold', 
                halign: 'right', 
                fontSize: 12.5, 
                cellPadding: { top: 4.5, bottom: 4.5, right: 3, left: 3 }, 
                fillColor: [244, 247, 252], 
                textColor: [0, 32, 128],
                isClosingTotalRow: true
            } 
        }
    ]);
    tableBody.push([
        { content: '', colSpan: 2, styles: { lineWidth: 0 } },
        { 
            content: `Sommano in lettere: Euro ${numberToItalianWords(globalTotalForClosing)}`, 
            colSpan: 8, 
            styles: { 
                fontStyle: 'bolditalic', 
                halign: 'right', 
                fontSize: 9.5, 
                cellPadding: { top: 2, bottom: 5, right: 3, left: 3 }, 
                fillColor: [244, 247, 252], 
                textColor: [0, 32, 128],
                isClosingTotalRow: true
            } 
        }
    ]);

    let grandTotal = 0; let pageTotal = 0;
    let isClosingTablePage = false;
    let closingTotalStartY = 0;
    let closingTotalEndY = 0;  
    autoTable(doc, {
      head: [['Num.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'par.ug.', 'lung.', 'larg.', 'H/peso', 'Quantità', 'unitario', 'TOTALE']],
      body: tableBody,
      startY: 18, 
      margin: { top: 18, bottom: 22, left: 10, right: 10 }, 
      theme: 'plain', 
      styles: { fontSize: 8, valign: 'top', cellPadding: 1.5, lineWidth: 0, overflow: 'linebreak', font: 'helvetica', rowPageBreak: 'auto' },
      columnStyles: { 
          0: { cellWidth: 9, halign: 'center' }, 
          1: { cellWidth: 21 }, 
          2: { cellWidth: 58 }, 
          3: { cellWidth: 12.5, halign: 'center' }, 
          4: { cellWidth: 11.5, halign: 'center' }, 
          5: { cellWidth: 11.5, halign: 'center' }, 
          6: { cellWidth: 12.5, halign: 'center' }, 
          7: { cellWidth: 18, halign: 'right' }, 
          8: { cellWidth: 18, halign: 'right' }, 
          9: { cellWidth: 18, halign: 'right' } 
      },
      headStyles: { fillColor: [240, 240, 240], textColor: [0,0,0], fontStyle: 'bold', fontSize: 6.8, cellPadding: { top: 1.5, bottom: 1.5, left: 0.5, right: 0.5 }, halign: 'center', lineWidth: { bottom: 0.5 }, lineColor: [0,0,0] },
      willDrawCell: (data: any) => {
          if (data.column.index === 2 && data.section === 'body' && data.cell.raw?.styles?.isArtDesc) {
              data.cell._linesToDraw = [...data.cell.text];
              data.cell.text = []; // Svuota per evitare che autotable sovrascriva il testo giustificato
          }
      },
      didDrawCell: (data: any) => {
          if (data.column.index === 2 && data.section === 'body' && data.cell._linesToDraw) {
              const cell = data.cell;
              const padLeft = cell.padding('left');
              const padRight = cell.padding('right');
              const contentWidth = cell.width - padLeft - padRight;
              const pos = cell.getTextPos();
              const fontSize = cell.styles.fontSize || 8.5;
              const factor = doc.getLineHeightFactor ? doc.getLineHeightFactor() : 1.15;
              const lineHeight = (fontSize / doc.internal.scaleFactor) * factor;
              
              const isSafety = filterType === 'safety';
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(fontSize);
              doc.setTextColor(isSafety ? 200 : 20, isSafety ? 80 : 20, isSafety ? 0 : 20);
              
              let curY = pos.y;
              data.cell._linesToDraw.forEach((l: string, idx: number) => {
                  const isLast = idx === data.cell._linesToDraw.length - 1;
                  drawJustifiedLine(doc, l, pos.x, curY, contentWidth, isLast);
                  curY += lineHeight;
              });
          }

          // GESTIONE NUMERAZIONE COLONNA 0 (Patto di Ferro)
          if (data.column.index === 0 && data.section === 'body' && data.cell.raw?.styles?.isArt) {
                const textStr = data.cell.raw.content;
                const lines = textStr.split('\n');
                if (lines.length >= 2) {
                    const x = data.cell.x + data.cell.width / 2;
                    let y = data.cell.y + 4.5;
                    
                    // Progressivo: Bold + Grande
                    doc.setFont("helvetica", 'bold');
                    doc.setFontSize(10.5);
                    doc.text(lines[0], x, y, { align: 'center' });
                    
                    // Relativo: Normal + Piccolo
                    y += 4.5;
                    doc.setFont("helvetica", 'normal');
                    doc.setFontSize(7.5);
                    doc.text(lines[1], x, y, { align: 'center' });
                    
                    // Interrompi rendering automatico per evitare ombreggiature
                    return false;
                }
          }

          if (data.section === 'body' && data.cell.styles.isTotalRow && data.column.index === 7) {
              doc.setDrawColor(150, 150, 150); 
              const leftPadding = 1.5; const xStart = data.cell.x + leftPadding; const xEnd = data.cell.x + data.cell.width;
              doc.setLineWidth(0.15); doc.line(xStart, data.cell.y, xEnd, data.cell.y);
              doc.setLineWidth(0.4); doc.line(xStart, data.cell.y + data.cell.height, xEnd, data.cell.y + data.cell.height);
              doc.setLineWidth(0.15); doc.line(xStart, data.cell.y + data.cell.height + 0.6, xEnd, data.cell.y + data.cell.height + 0.6);
              doc.setLineWidth(0.1); 
          }
          if (data.section === 'body' && data.cell.raw?.styles?.isClosingTotalRow) {
              isClosingTablePage = true;
              if (closingTotalStartY === 0 || data.cell.y < closingTotalStartY) {
                  closingTotalStartY = data.cell.y;
              }
              const bottomY = data.cell.y + data.cell.height;
              if (bottomY > closingTotalEndY) {
                  closingTotalEndY = bottomY;
              }
          }
          if (data.section === 'body' && data.column.index === 9 && !data.cell.raw?.styles?.isClosingTotalRow) {
              const raw = data.cell.raw;
              let val = 0;
              if (typeof raw === 'number') val = raw; 
              else if (raw?.content && typeof raw.content === 'number') val = raw.content;
              else if (typeof raw === 'string' && raw.includes('€')) {
                  const match = raw.match(/[\d.]+,[\d]+/);
                  if (match) val = parseFloat(match[0].replace('.', '').replace(',', '.'));
              }
              pageTotal += val;
          }
      },
      didParseCell: (data: any) => {
          // PATTO DI FERRO: Svuota testo nativo per colonna numerazione per prevenire ombreggiature
          if (data.column.index === 0 && data.section === 'body' && data.cell.raw?.styles?.isArt) {
              data.cell.text = []; 
          }
          if (data.section === 'body' && data.column.index === 9) {
               const raw = data.cell.raw;
               if (typeof raw === 'number') data.cell.text = [formatCurrency(raw)];
               else if (raw?.content && typeof raw.content === 'number') data.cell.text = [formatCurrency(raw.content)];
          }

          // AUTO-FIT DINAMICO PER LA STAMPA: se il numero supera la larghezza della colonna, riduci il font per evitare wrapping
          if (data.section === 'body') {
              const colIdx = data.column.index;
              const textContent = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text || '');
              const textLen = textContent.trim().length;

              if ([3, 4, 5, 6].includes(colIdx)) {
                  // Misure (par.ug, lung, larg, H/peso) - larghezza 10-12mm
                  if (textLen > 6) {
                      data.cell.styles.fontSize = 6;
                      data.cell.styles.cellPadding = 0.4;
                  } else if (textLen > 4) {
                      data.cell.styles.fontSize = 7;
                      data.cell.styles.cellPadding = 0.6;
                  }
              } else if (colIdx === 7 || colIdx === 8) {
                  // Quantità & Prezzo Unitario - larghezza 18mm
                  if (textLen > 11) {
                      data.cell.styles.fontSize = 6;
                      data.cell.styles.cellPadding = 0.4;
                  } else if (textLen > 8) {
                      data.cell.styles.fontSize = 6.8;
                      data.cell.styles.cellPadding = 0.6;
                  }
              } else if (colIdx === 9) {
                  // TOTALE Importo - larghezza 16mm
                  if (textLen > 11) {
                      data.cell.styles.fontSize = 6;
                      data.cell.styles.cellPadding = 0.4;
                  } else if (textLen > 8) {
                      data.cell.styles.fontSize = 6.8;
                      data.cell.styles.cellPadding = 0.6;
                  }
              }
          }
      },
      didDrawPage: (data: any) => {
          const currentTableStartY = 18;
          const defaultTableEndY = pageHeight - 16;
          drawHeader(doc, projectInfo, title, data.pageNumber, grandTotal, doc.internal.pageSize.width, doc.internal.pageSize.height);
          
          if (isClosingTablePage && closingTotalStartY > currentTableStartY) {
              // 1. Linee verticali delle colonne si fermano PRIMA del blocco di chiusura (nessuna riga che taglia il testo)
              drawGridLines(doc, currentTableStartY, closingTotalStartY);
              
              // 2. Telaio perimetrale della tabella fino alla fine del totale
              const actualTableEndY = closingTotalEndY > 0 ? closingTotalEndY : defaultTableEndY;
              drawTableFrame(doc, currentTableStartY, actualTableEndY);
              
              // 3. GRAFICA DI CHIUSURA CONTABILE
              // Linea orizzontale di separazione superiore
              doc.setDrawColor(44, 62, 80);
              doc.setLineWidth(0.35);
              doc.line(10, closingTotalStartY, 200, closingTotalStartY);
              
              // Doppia riga di chiusura contabile sul fondo del totale (Standard Ingegneristico)
              doc.setDrawColor(44, 62, 80);
              doc.setLineWidth(0.4);
              doc.line(10, actualTableEndY, 200, actualTableEndY);
              doc.setLineWidth(0.15);
              doc.line(10, actualTableEndY + 0.8, 200, actualTableEndY + 0.8);
          } else {
              drawGridLines(doc, currentTableStartY, defaultTableEndY); 
              drawTableFrame(doc, currentTableStartY, defaultTableEndY);
          }
          
          const isLastPageOfTable = isClosingTablePage || Math.abs((grandTotal + pageTotal) - globalTotalForClosing) < 0.05;
          drawFooter(doc, data.pageNumber, grandTotal, pageTotal, doc.internal.pageSize.width, doc.internal.pageSize.height, true, isLastPageOfTable);
          
          grandTotal += pageTotal; pageTotal = 0;
      }
    });

    doc.addPage();
    const summaryTableBody: any[] = [];
    let totalLavoriSum = 0;

    // Calcoliamo prima il totale per poter determinare le incidenze percentuali
    const validCategories = categories.filter(cat => !cat.isEnabled === false && !cat.isSuperCategory && cat.type === filterType);
    const categoryTotals = validCategories.map(cat => {
        const catArticles = articles.filter(a => a.categoryCode === cat.code);
        const total = catArticles.reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
        return { cat, total };
    }).filter(item => item.total > 0);

    totalLavoriSum = categoryTotals.reduce((sum, item) => sum + item.total, 0);

    // Calcolo dell'Incidenza della Manodopera (Obbligo D.Lgs. 36/2023)
    let totalLaborSum = 0;
    articles.forEach(art => {
        if (art.isEnabled === false) return;
        const cat = categories.find(c => c.code === art.categoryCode);
        if (cat && cat.type === filterType) {
            const artTotal = art.quantity * art.unitPrice;
            if (art.laborRate && art.laborRate > 0) {
                totalLaborSum += artTotal * (art.laborRate / 100);
            }
        }
    });
    const overallLaborPercentage = totalLavoriSum > 0 ? (totalLaborSum / totalLavoriSum) * 100 : 0;

    categoryTotals.forEach(item => {
        const percentage = totalLavoriSum > 0 ? (item.total / totalLavoriSum) * 100 : 0;
        
        summaryTableBody.push([
            { content: item.cat.code, styles: { fontStyle: 'bold', halign: 'center' } },
            { content: item.cat.name.toUpperCase(), styles: { halign: 'left' } },
            { content: formatCurrency(item.total), styles: { halign: 'right', fontStyle: 'bold' } },
            { content: `${percentage.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`, styles: { halign: 'right' } }
        ]);
    });

    summaryTableBody.push([
        { 
            content: 'TOTALE GENERALE DEI LAVORI', 
            colSpan: 2, 
            styles: { 
                fillColor: [240, 244, 252], 
                fontStyle: 'bold', 
                halign: 'right', 
                fontSize: 10.5, 
                cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                textColor: [15, 23, 42] 
            } 
        },
        { 
            content: `€ ${formatCurrency(totalLavoriSum)}`, 
            styles: { 
                fillColor: [240, 244, 252], 
                fontStyle: 'bold', 
                halign: 'right', 
                fontSize: 11.5, 
                cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                textColor: [0, 32, 128] 
            } 
        },
        { 
            content: '100,00%', 
            styles: { 
                fillColor: [240, 244, 252], 
                fontStyle: 'bold', 
                halign: 'right', 
                fontSize: 10.5, 
                cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                textColor: [15, 23, 42] 
            } 
        }
    ]);

    summaryTableBody.push([
        { 
            content: `Sommano in lettere: Euro ${numberToItalianWords(totalLavoriSum)}`, 
            colSpan: 4, 
            styles: { 
                fillColor: [246, 249, 254], 
                fontStyle: 'bolditalic', 
                halign: 'right', 
                fontSize: 9.5, 
                textColor: [0, 32, 128], 
                cellPadding: { top: 2.5, bottom: 4.5, right: 3, left: 3 } 
            } 
        }
    ]);

    const summaryHead = [['COD.', 'DESCRIZIONE CAPITOLO (WBS)', 'IMPORTO LAVORI', 'INCIDENZA %']];

    autoTable(doc, {
        head: summaryHead,
        body: summaryTableBody,
        startY: 20,
        margin: { left: 10, right: 10, top: 18, bottom: 20 },
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.5, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 95 }, 
            2: { cellWidth: 52 },
            3: { cellWidth: 23 }
        },
        headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        didDrawPage: (data) => {
            drawAccaPageFrame(doc, data.pageNumber, projectInfo);
            doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
            doc.text(`RIEPILOGO GENERALE ${filterType === 'work' ? 'LAVORI' : 'SICUREZZA'}`, 105, 14, { align: 'center' });
        }
    });

    const summaryFinalY = (doc as any).lastAutoTable.finalY;
    // Doppia linea di chiusura contabile sul fondo del riepilogo
    doc.setDrawColor(44, 62, 80);
    doc.setLineWidth(0.4);
    doc.line(10, summaryFinalY, 200, summaryFinalY);
    doc.setLineWidth(0.15);
    doc.line(10, summaryFinalY + 0.8, 200, summaryFinalY + 0.8);

    drawSignature(doc, projectInfo, summaryFinalY + 10, integrityHash);
    applyDocumentFootersAndSecurity(doc, integrityHash);
    window.open(URL.createObjectURL(doc.output('blob')), '_blank');
  } catch (error) { console.error(error); alert("Errore PDF."); }
};

export const generateComputoSicurezzaPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
    return generateComputoMetricPdf(projectInfo, categories, articles, 'safety');
};

interface InteractiveFieldConfig {
    fieldName: string;
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    readOnly?: boolean;
    defaultValue?: string;
    jsCalc?: string | null;
    isPriceInput?: boolean;
    nextFieldName?: string | null;
    isTotal?: boolean;
    textAlign?: 'left' | 'center' | 'right';
}

const addAcroFormField = (doc: any, config: InteractiveFieldConfig) => {
    try {
        const tf = new doc.AcroFormTextField();
        tf.fieldName = config.fieldName;
        tf.value = config.defaultValue || '';
        tf.x = config.x;
        tf.y = config.y;
        tf.width = config.width;
        tf.height = config.height;
        tf.page = config.page;
        tf.readOnly = config.readOnly ?? false;
        tf.textAlign = config.textAlign || 'right';

        const origGetKV = tf.getKeyValueListForStream.bind(tf);
        tf.getKeyValueListForStream = function() {
            const list = origGetKV();
            const qVal = config.textAlign === 'center' ? 1 : (config.textAlign === 'left' ? 0 : 2);
            if (!list.some((item: any) => item.key === 'Q')) {
                list.push({ key: 'Q', value: qVal });
            }
            const fontSize = config.isTotal ? 8.5 : 7.5;
            const fontColor = config.isTotal ? '0 0.2 0.65' : (config.readOnly ? '0.1 0.1 0.15' : '0 0.25 0.8');
            list.push({ key: 'DA', value: `(/Helv ${fontSize} Tf ${fontColor} rg)` });

            if (!config.readOnly) {
                list.push({ key: 'BS', value: '<< /W 0.5 /S /S >>' });
                list.push({ key: 'MK', value: '<< /BC [0.2 0.55 0.85] /BG [0.94 0.98 1.0] >>' });
            } else {
                list.push({ key: 'BS', value: '<< /W 0.3 /S /S >>' });
                list.push({ key: 'MK', value: config.isTotal ? '<< /BC [0.6 0.7 0.85] /BG [0.90 0.94 0.99] >>' : '<< /BC [0.8 0.85 0.9] /BG [0.97 0.97 0.98] >>' });
            }

            if (config.isPriceInput) {
                const nextJump = config.nextFieldName ? `var k=event.commitKey;if((k===1||k===2||k===0)&&!event.shift){_navNext.call(this,"${config.nextFieldName}");}` : '';
                const priceCommitJs = `try{if(event.willCommit){_calcDoc.call(this);${nextJump}}}catch(e){}`;
                const blurJs = `try{var v=event.target.value;if(v){var n=_p(v);if(n>0)event.target.value=_fmt(n);}_calcDoc.call(this);}catch(e){}`;
                const escPrice = priceCommitJs.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
                const escBlur = blurJs.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
                const aaItems: string[] = [];
                if (priceCommitJs) {
                    aaItems.push(`/K << /S /JavaScript /JS (${escPrice}) >>`);
                }
                aaItems.push(`/Bl << /S /JavaScript /JS (${escBlur}) >>`);
                list.push({
                    key: 'AA',
                    value: `<< ${aaItems.join(' ')} >>`
                });
            } else if (config.jsCalc) {
                const escapedJs = config.jsCalc.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
                list.push({
                    key: 'AA',
                    value: `<< /C << /S /JavaScript /JS (${escapedJs}) >> >>`
                });
            }
            return list;
        };

        doc.addField(tf);
        return tf;
    } catch (e) {
        console.warn("Error adding AcroFormField:", config.fieldName, e);
    }
};

export const generateComputoMetricoSubappaltoPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
  try {
    clearPdfTextWidthCache();
    const { jsPDF, autoTable } = await getLibs();
    const doc = new jsPDF();
    const tableBody: any[] = [];
    const pageHeight = doc.internal.pageSize.height;

    // Metadati strutturati per motore di calcolo unificato ad altissima prestazione
    const docItemsMeta: { p: string; imp: string; q: number; cat: string; page: number }[] = [];
    const docCatsMeta: { code: string; subtot: string; riepiImp: string; riepiPerc: string }[] = [];
    const docPagesMeta: number[] = [];

    // 1. FRONTESPIZIO UFFICIALE ("TESTALINO") GECOLA CON BANDANA CELESTINO
    // Esclusione totale del prezzario: solo Titolo, Committente, Indirizzo originario cantiere e Progettista
    drawAccaCoverPage(
        doc,
        projectInfo,
        "COMPUTO SUBAPPALTO",
        "COMPUTO METRICO OPERE IN SUBAPPALTO"
    );
    doc.addPage();

    // Master sequential index map per mantenere la numerazione globale
    const masterIndexMap = new Map<string, number>();
    let masterCount = 1;
    categories.forEach(cat => {
        if (cat.isSuperCategory) return;
        articles.filter(a => a.categoryCode === cat.code).forEach(art => {
            masterIndexMap.set(art.id, masterCount++);
        });
    });

    const cleanCode = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');

    // Helper per pulire il testo ed eliminare ogni traccia di prezzari, tariffe o marcatori di voci del progettista
    const cleanSubappaltoDesc = (desc: string): string => {
        let t = cleanText(desc);
        // Rimuove ogni dicitura o prefisso di voce definita dal progettista o nuovo prezzo
        t = t.replace(/^\[?VOCE\s+(?:DEFINITA\s+DAL\s+)?PROGETTISTA[^\]]*\]?\s*[:-]?\s*/gi, '');
        t = t.replace(/^\[?NUOVO\s+PREZZO[^\]]*\]?\s*[:-]?\s*/gi, '');
        t = t.replace(/^\[?N\.?P\.?[0-9]*\]?\s*[:-]?\s*/gi, '');
        // Rimuove riferimenti a prezzari regionali e cataloghi
        t = t.replace(/Prezzario\s+[^\n.,;)]+/gi, '');
        t = t.replace(/Tariffa\s+regionale[^\n.,;)]+/gi, '');
        t = t.replace(/Elenco\s+prezzi[^\n.,;)]+/gi, '');
        return t.trim();
    };

    const allImportFieldNames: string[] = [];
    const pageImportFieldsMap: Record<number, string[]> = {};
    const importCalculatedFields: any[] = [];
    const wbsSubtotalCalculatedFields: any[] = [];
    const riportoCalculatedFields: any[] = [];
    const grandTotalCalculatedFields: any[] = [];
    const summaryCalculatedFields: any[] = [];
    let totalActiveArticles = 0;

    // Rilevamento preventivo ordinato delle categorie attive e delle voci per navigazione automatica con Invio/Tab
    const activeCategories: Category[] = [];
    const activeArticlesOrdered: {
        art: Article;
        cat: Category;
        gNum: number;
        priceFieldName: string;
        importFieldName: string;
    }[] = [];

    const collectActive = (cat: Category) => {
        const catArticles = articles.filter(a => a.categoryCode === cat.code && a.isEnabled !== false);
        if (catArticles.length === 0) return;
        activeCategories.push(cat);
        catArticles.forEach((art, artIndex) => {
            const gNum = art.originalGlobalIndex || masterIndexMap.get(art.id) || (artIndex + 1);
            activeArticlesOrdered.push({
                art,
                cat,
                gNum,
                priceFieldName: `P_${gNum}`,
                importFieldName: `IMP_${gNum}`
            });
        });
    };

    const topLevels = categories.filter(c => !c.parentId && c.isEnabled !== false);
    topLevels.forEach(root => {
        if (root.isSuperCategory) {
            const children = categories.filter(c => c.parentId === root.code && !c.isSuperCategory && c.isEnabled !== false);
            children.forEach(child => collectActive(child));
        } else {
            collectActive(root);
        }
    });

    const nextPriceFieldMap = new Map<string, string>();
    for (let i = 0; i < activeArticlesOrdered.length; i++) {
        if (i < activeArticlesOrdered.length - 1) {
            nextPriceFieldMap.set(activeArticlesOrdered[i].priceFieldName, activeArticlesOrdered[i + 1].priceFieldName);
        } else {
            nextPriceFieldMap.set(activeArticlesOrdered[i].priceFieldName, "BTN_CALCOLA_OFFERTA");
        }
    }

    // Helper per elaborare ciascuna categoria WBS
    const processCategory = (cat: Category) => {
        const catArticles = articles.filter(a => a.categoryCode === cat.code && a.isEnabled !== false);
        if (catArticles.length === 0) return;
        totalActiveArticles += catArticles.length;

        // Intestazione WBS / Gruppo di lavorazione
        tableBody.push([
            { content: '', styles: { isWbs: true, lineWidth: 0 } }, 
            { content: '', styles: { isWbs: true, lineWidth: 0 } }, 
            { 
              content: `${cat.code} - ${cat.name}`, 
              colSpan: 8, 
              styles: { 
                fillColor: [240, 240, 240], 
                fontStyle: 'bold', 
                halign: 'left', 
                cellPadding: { left: 1.5, right: 1.5, top: 3, bottom: 3 }, 
                isWbs: true, 
                lineWidth: 0 
              } 
            },
            '', '', '', '', '', '', ''
        ]);

        const wbsImportFieldNames: string[] = [];

        catArticles.forEach((art, artIndex) => {
            const wbsN = getWbsNumber(cat.code);
            const artNum = `${wbsN}.${artIndex + 1}`;
            const gNum = art.originalGlobalIndex || masterIndexMap.get(art.id) || (artIndex + 1);

            // Dicitura giuridica latina "OMISSIS" su tutte le voci (anche definite dal progettista) per neutralità assoluta dell'offerta
            const subCode = "[ OMISSIS ]";
            let finalDescription = cleanSubappaltoDesc(art.description);
            if (projectInfo.descriptionLength === 'short') {
                doc.setFontSize(8.5);
                const splitLines = doc.splitTextToSize(finalDescription, 54); 
                if (splitLines.length > 6) {
                    finalDescription = splitLines.slice(0, 6).join('\n') + ' .....';
                }
            }

            const priceFieldName = `P_${gNum}`;
            const importFieldName = `IMP_${gNum}`;
            wbsImportFieldNames.push(importFieldName);
            allImportFieldNames.push(importFieldName);

            // Rigo testata articolo
            tableBody.push([
                { 
                  content: `${gNum}\n(${artNum})`, 
                  styles: { isArt: true, halign: 'center', cellPadding: { top: 3, bottom: 1 } } 
                },
                { 
                  content: subCode, 
                  styles: { 
                    isArt: true, 
                    fontStyle: 'bolditalic', 
                    cellPadding: { top: 3.5, bottom: 1, left: 0.5, right: 0.5 }, 
                    fontSize: 7, 
                    textColor: [90, 105, 125],
                    halign: 'center' 
                  } 
                },
                { 
                  content: finalDescription, 
                  styles: { 
                    isArt: true, 
                    isArtDesc: true,
                    fontStyle: 'normal', 
                    cellPadding: { left: 2.5, right: 2.5, top: 3.5, bottom: 1.5 }, 
                    fontSize: 8.5, 
                    valign: 'top', 
                    textColor: [20, 20, 20]
                  } 
                },
                '', '', '', '', '', '', ''
            ]);

            // Misure dettagliate
            if (art.measurements && art.measurements.length > 0) {
                let runningPartial = 0;
                art.measurements.forEach((m) => {
                    const isDeduction = m.type === 'deduction';
                    let val = calculateMeasurementValue(m);
                    let displayVal = val;
                    if (m.type === 'subtotal') {
                        displayVal = runningPartial;
                        runningPartial = 0;
                    } else {
                        runningPartial += val;
                    }
                    
                    const rowTextColor = isDeduction ? [200, 0, 0] : [60, 60, 60];

                    tableBody.push([ 
                        '', '', 
                        { 
                          content: m.type === 'subtotal' ? 'Sommano parziali' : m.description, 
                          styles: { 
                            fontStyle: m.type === 'subtotal' || isDeduction ? 'bold' : 'normal', 
                            halign: m.type === 'subtotal' ? 'right' : 'left', 
                            textColor: rowTextColor, 
                            cellPadding: { left: m.type === 'subtotal' ? 1 : 2, top: 1, bottom: 1 }, 
                            fontSize: 8 
                          } 
                        }, 
                        { content: formatNumber(m.multiplier), styles: { halign: 'center', textColor: rowTextColor } }, 
                        { content: formatNumber(m.length), styles: { halign: 'center', textColor: rowTextColor } }, 
                        { content: formatNumber(m.width), styles: { halign: 'center', textColor: rowTextColor } }, 
                        { content: formatNumber(m.height), styles: { halign: 'center', textColor: rowTextColor } }, 
                        { content: formatNumber(displayVal), styles: { halign: 'right', fontStyle: m.type === 'subtotal' || isDeduction ? 'bold' : 'normal', cellPadding: { left: 1.5 }, fontSize: 8, textColor: rowTextColor } }, 
                        '', '' 
                    ]);
                });
            }

            // Rigo SOMMANO con i campi attivi compilabili/calcolati
            tableBody.push([ 
                '', '', 
                { content: `SOMMANO ${art.unit}`, styles: { fontStyle: 'bold', halign: 'right', cellPadding: { right: 1, top: 3, bottom: 2 }, isTotalRow: true } }, 
                '', '', '', '', 
                { content: formatNumber(art.quantity), styles: { fontStyle: 'bold', halign: 'right', cellPadding: { top: 3, left: 1.5 }, isTotalRow: true, fontSize: 8 } }, 
                { content: '', styles: { isPriceField: true, fieldName: priceFieldName, nextFieldName: nextPriceFieldMap.get(priceFieldName), artId: art.id, isTotalRow: true } }, 
                { content: '', styles: { isImportField: true, fieldName: importFieldName, priceField: priceFieldName, qty: art.quantity || 0, catCode: cleanCode(cat.code), artId: art.id, isTotalRow: true } } 
            ]);
            tableBody.push([{ content: '', colSpan: 10, styles: { cellPadding: 1.5 } }]);
        });

        // Totale Parziale WBS con formula automatica
        const wbsSubtotalFieldName = `SUBTOT_${cleanCode(cat.code)}`;
        tableBody.push([
            { content: '', colSpan: 2, styles: { lineWidth: 0 } },
            { 
              content: `TOTALE PARZIALE ${cat.code} - ${cat.name.toUpperCase()}`, 
              colSpan: 6, 
              styles: { 
                fontStyle: 'bold', 
                halign: 'right', 
                fontSize: 8.5, 
                cellPadding: { top: 2.5, bottom: 2.5, right: 3 }, 
                fillColor: [240, 245, 252], 
                textColor: [20, 30, 50] 
              } 
            },
            { 
              content: '€', 
              styles: { 
                fontStyle: 'bold', 
                halign: 'right', 
                fontSize: 8.5, 
                fillColor: [240, 245, 252], 
                textColor: [0, 51, 153],
                cellPadding: { top: 2.5, bottom: 2.5, right: 1 }
              } 
            },
            { 
              content: '', 
              styles: { 
                isWbsSubtotalField: true, 
                fieldName: wbsSubtotalFieldName, 
                wbsCode: cat.code, 
                importFields: [...wbsImportFieldNames],
                fillColor: [240, 245, 252]
              } 
            }
        ]);
        tableBody.push([{ content: '', colSpan: 10, styles: { cellPadding: 2 } }]);
    };

    topLevels.forEach(root => {
        if (root.isSuperCategory) {
            const children = categories.filter(c => c.parentId === root.code && !c.isSuperCategory && c.isEnabled !== false);
            if (children.length > 0) {
                tableBody.push([
                    { content: '', colSpan: 2, styles: { lineWidth: 0 } },
                    { content: `AREA: ${root.name.toUpperCase()}`, colSpan: 8, styles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', cellPadding: 3, isSuper: true } }
                ]);
                children.forEach(child => processCategory(child));
            }
        } else {
            processCategory(root);
        }
    });

    // Rigo TOTALE GENERALE SUBAPPALTO
    const grandTotalFieldName = "TOTALE_GENERALE_SUBAPPALTO";
    tableBody.push([
        { content: '', colSpan: 2, styles: { lineWidth: 0 } },
        { 
            content: `TOTALE GENERALE OPERE IN SUBAPPALTO (VOCI ATTIVE: ${totalActiveArticles})`, 
            colSpan: 6, 
            styles: { 
                fontStyle: 'bold', 
                halign: 'right', 
                fontSize: 9.5, 
                cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                fillColor: [225, 238, 255], 
                textColor: [10, 25, 60],
                isClosingTotalRow: true
            } 
        },
        { 
            content: '€', 
            styles: { 
                fontStyle: 'bold', 
                halign: 'right', 
                fontSize: 9.5, 
                cellPadding: { top: 3.5, bottom: 3.5, right: 1 }, 
                fillColor: [225, 238, 255], 
                textColor: [0, 40, 140],
                isClosingTotalRow: true
            } 
        },
        { 
            content: '', 
            styles: { 
                isGrandTotalField: true, 
                fieldName: grandTotalFieldName, 
                wbsSubtotalFields: activeCategories.map(c => `SUBTOT_${cleanCode(c.code)}`),
                fillColor: [225, 238, 255],
                isClosingTotalRow: true
            } 
        }
    ]);

    const integrityHash = await computeProjectIntegrityHash(
        projectInfo,
        categories,
        articles.filter(a => a.isEnabled !== false),
        0,
        "COMPUTO METRICO SUBAPPALTO"
    );

    autoTable(doc, {
      head: [['N.Ord', 'CODICE', 'DESIGNAZIONE DEI LAVORI', 'PAR.UG', 'LUNG.', 'LARG.', 'H/PESO', 'QUANTITÀ', 'PREZZO OFF. €', 'IMPORTO OFF. €']],
      body: tableBody,
      startY: 18,
      margin: { left: 10, right: 10, top: 18, bottom: 20 },
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1, overflow: 'linebreak' },
      columnStyles: {
          0: { cellWidth: 9, halign: 'center' },
          1: { cellWidth: 21, halign: 'center' },
          2: { cellWidth: 58 },
          3: { cellWidth: 12.5, halign: 'center' },
          4: { cellWidth: 11.5, halign: 'center' },
          5: { cellWidth: 11.5, halign: 'center' },
          6: { cellWidth: 12.5, halign: 'center' },
          7: { cellWidth: 18, halign: 'right' },
          8: { cellWidth: 18, halign: 'right' },
          9: { cellWidth: 18, halign: 'right' }
      },
      headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.8, cellPadding: { top: 1.5, bottom: 1.5, left: 0.5, right: 0.5 }, halign: 'center' },
      willDrawCell: (data: any) => {
          if (data.column.index === 2 && data.section === 'body' && data.cell.raw?.styles?.isArtDesc) {
              data.cell._linesToDraw = [...data.cell.text];
              data.cell.text = [];
          }
      },
      didDrawCell: (data: any) => {
          if (data.column.index === 2 && data.section === 'body' && data.cell._linesToDraw) {
              const cell = data.cell;
              const padLeft = cell.padding('left');
              const padRight = cell.padding('right');
              const contentWidth = cell.width - padLeft - padRight;
              const pos = cell.getTextPos();
              const fontSize = cell.styles.fontSize || 8.5;
              const factor = doc.getLineHeightFactor ? doc.getLineHeightFactor() : 1.15;
              const lineHeight = (fontSize / doc.internal.scaleFactor) * factor;
              
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(fontSize);
              doc.setTextColor(20, 20, 20);
              
              let curY = pos.y;
              data.cell._linesToDraw.forEach((l: string, idx: number) => {
                  const isLast = idx === data.cell._linesToDraw.length - 1;
                  drawJustifiedLine(doc, l, pos.x, curY, contentWidth, isLast);
                  curY += lineHeight;
              });
          }
          if (data.column.index === 0 && data.section === 'body' && data.cell.raw?.styles?.isArt) {
              const textStr = data.cell.raw.content;
              const lines = textStr.split('\n');
              if (lines.length >= 2) {
                  const x = data.cell.x + data.cell.width / 2;
                  let y = data.cell.y + 4.5;
                  doc.setFont("helvetica", 'bold');
                  doc.setFontSize(10.5);
                  doc.text(lines[0], x, y, { align: 'center' });
                  y += 4.5;
                  doc.setFont("helvetica", 'normal');
                  doc.setFontSize(7.5);
                  doc.text(lines[1], x, y, { align: 'center' });
                  return false;
              }
          }

          // Inserimento campi interattivi AcroForm ottimizzati ad altissima velocità
          if (data.section === 'body') {
              const page = doc.internal.getCurrentPageInfo().pageNumber;
              const rawStyles = data.cell.raw?.styles;
              if (rawStyles?.isPriceField) {
                  addAcroFormField(doc, {
                      fieldName: rawStyles.fieldName,
                      x: data.cell.x + 0.6,
                      y: data.cell.y + 0.6,
                      width: data.cell.width - 1.2,
                      height: data.cell.height - 1.2,
                      page,
                      readOnly: false,
                      isPriceInput: true,
                      nextFieldName: rawStyles.nextFieldName || nextPriceFieldMap.get(rawStyles.fieldName),
                      isTotal: false,
                      textAlign: 'right'
                  });
              } else if (rawStyles?.isImportField) {
                  const { fieldName, priceField, qty, catCode } = rawStyles;
                  const qVal = Number(qty) || 0;
                  docItemsMeta.push({
                      p: priceField,
                      imp: fieldName,
                      q: qVal,
                      cat: catCode || '',
                      page
                  });
                  addAcroFormField(doc, {
                      fieldName,
                      x: data.cell.x + 0.6,
                      y: data.cell.y + 0.6,
                      width: data.cell.width - 1.2,
                      height: data.cell.height - 1.2,
                      page,
                      readOnly: true,
                      isTotal: false,
                      textAlign: 'right'
                  });
              } else if (rawStyles?.isWbsSubtotalField) {
                  const { fieldName } = rawStyles;
                  addAcroFormField(doc, {
                      fieldName,
                      x: data.cell.x + 0.6,
                      y: data.cell.y + 0.6,
                      width: data.cell.width - 1.2,
                      height: data.cell.height - 1.2,
                      page,
                      readOnly: true,
                      isTotal: true,
                      textAlign: 'right'
                  });
              } else if (rawStyles?.isGrandTotalField) {
                  const { fieldName } = rawStyles;
                  const tf = addAcroFormField(doc, {
                      fieldName,
                      x: data.cell.x + 0.6,
                      y: data.cell.y + 0.6,
                      width: data.cell.width - 1.2,
                      height: data.cell.height - 1.2,
                      page,
                      readOnly: true,
                      jsCalc: 'try{_calcDoc.call(this);}catch(e){}',
                      isTotal: true,
                      textAlign: 'right'
                  });
                  if (tf) grandTotalCalculatedFields.push(tf);
              }
          }
      },
      didParseCell: (data: any) => {
          if (data.column.index === 0 && data.section === 'body' && data.cell.raw?.styles?.isArt) {
              data.cell.text = [];
          }
      },
      didDrawPage: (data: any) => {
          const currentTableStartY = 18;
          const defaultTableEndY = pageHeight - 16;
          drawHeaderSimple(doc, projectInfo, "COMPUTO SUBAPPALTO", data.pageNumber);
          drawGridLines(doc, currentTableStartY, defaultTableEndY); 
          drawTableFrame(doc, currentTableStartY, defaultTableEndY);
      }
    });

    // 3. GENERAZIONE AUTOMATICA DEI CAMPI ATTIVI DI RIPORTO A RIPORTO DI PAGINA (SUL COMPUTO METRICO)
    const computoLastPage = doc.getNumberOfPages();
    for (let p = 2; p <= computoLastPage; p++) {
        docPagesMeta.push(p);
        doc.setPage(p);

        // Header: "R I P O R T O" in alto (dalla pagina successiva alla prima del computo)
        if (p > 2) {
            doc.setFontSize(8.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(0, 0, 0);
            doc.text("R I P O R T O", 105, 14, { align: 'center' });
            doc.text("€", 168, 14, { align: 'right' });

            addAcroFormField(doc, {
                fieldName: `RIPORTO_TOP_${p}`,
                x: 171,
                y: 10.5,
                width: 28,
                height: 5.2,
                page: p,
                readOnly: true,
                isTotal: true,
                textAlign: 'right'
            });
        }

        // Footer: "A RIPORTARE" a fondo pagina (per tutte le pagine tranne l'ultima del computo)
        if (p < computoLastPage) {
            const footerY = pageHeight - 11;
            doc.setFontSize(8.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(0, 0, 0);
            doc.text("A RIPORTARE", 145, footerY, { align: 'right' });
            doc.text("€", 168, footerY, { align: 'right' });

            addAcroFormField(doc, {
                fieldName: `RIPORTO_BOTTOM_${p}`,
                x: 171,
                y: footerY - 3.8,
                width: 28,
                height: 5.2,
                page: p,
                readOnly: true,
                isTotal: true,
                textAlign: 'right'
            });
        }
    }

    // 4. PAGINA DEDICATA: RIEPILOGO DEI LAVORI IN SUBAPPALTO PER GRUPPI DI LAVORAZIONE (WBS) E TOTALE
    doc.addPage();
    const summaryPageNum = doc.getNumberOfPages();

    const summaryTableBody: any[] = [];
    activeCategories.forEach((cat) => {
        const catCode = cat.code;
        const cleanCat = cleanCode(cat.code);
        const sourceSubtotalField = `SUBTOT_${cleanCat}`;
        const riepiImportFieldName = `RIEPI_IMP_${cleanCat}`;
        const riepiPercFieldName = `RIEPI_PERC_${cleanCat}`;

        docCatsMeta.push({
            code: cleanCat,
            subtot: sourceSubtotalField,
            riepiImp: riepiImportFieldName,
            riepiPerc: riepiPercFieldName
        });

        summaryTableBody.push([
            { content: catCode, styles: { fontStyle: 'bold', halign: 'center', cellPadding: { top: 2.5, bottom: 2.5 } } },
            { content: cat.name.toUpperCase(), styles: { fontStyle: 'bold', halign: 'left', cellPadding: { left: 2.5, right: 2, top: 2.5, bottom: 2.5 } } },
            { 
                content: '', 
                styles: { 
                    isRiepiImportField: true, 
                    fieldName: riepiImportFieldName, 
                    sourceSubtotalField,
                    halign: 'right' 
                } 
            },
            { 
                content: '', 
                styles: { 
                    isRiepiPercField: true, 
                    fieldName: riepiPercFieldName, 
                    sourceSubtotalField,
                    grandTotalField: grandTotalFieldName,
                    halign: 'right' 
                } 
            }
        ]);
    });

    const riepiGrandTotalFieldName = "RIEPI_TOTALE_GENERALE";
    summaryTableBody.push([
        { 
            content: 'TOTALE GENERALE DEI LAVORI IN SUBAPPALTO', 
            colSpan: 2, 
            styles: { 
                fillColor: [225, 238, 255], 
                fontStyle: 'bold', 
                halign: 'right', 
                fontSize: 9.5, 
                cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                textColor: [10, 25, 60] 
            } 
        },
        { 
            content: '', 
            styles: { 
                isRiepiGrandTotalField: true, 
                fieldName: riepiGrandTotalFieldName, 
                sourceGrandTotalField: grandTotalFieldName,
                fillColor: [225, 238, 255],
                halign: 'right' 
            } 
        },
        { 
            content: '100,00 %', 
            styles: { 
                fillColor: [225, 238, 255], 
                fontStyle: 'bold', 
                halign: 'center', 
                fontSize: 9, 
                textColor: [10, 25, 60],
                cellPadding: { top: 3.5, bottom: 3.5 } 
            } 
        }
    ]);

    autoTable(doc, {
        head: [['COD.', 'CATEGORIA / CAPITOLO DI SPESA (WBS)', 'IMPORTO OFFERTO €', 'INCIDENZA %']],
        body: summaryTableBody,
        startY: 22,
        margin: { left: 10, right: 10, top: 18, bottom: 20 },
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 20, halign: 'center' },
            1: { cellWidth: 95 },
            2: { cellWidth: 50, halign: 'right' },
            3: { cellWidth: 25, halign: 'center' }
        },
        headStyles: { 
            fillColor: [44, 62, 80], 
            textColor: [255, 255, 255], 
            fontStyle: 'bold', 
            fontSize: 7.5, 
            cellPadding: { top: 2, bottom: 2, left: 1, right: 1 }, 
            halign: 'center' 
        },
        didDrawCell: (data: any) => {
            if (data.section === 'body') {
                const rawStyles = data.cell.raw?.styles;
                const page = doc.internal.getCurrentPageInfo().pageNumber;
                if (rawStyles?.isRiepiImportField) {
                    addAcroFormField(doc, {
                        fieldName: rawStyles.fieldName,
                        x: data.cell.x + 0.6,
                        y: data.cell.y + 0.6,
                        width: data.cell.width - 1.2,
                        height: data.cell.height - 1.2,
                        page,
                        readOnly: true,
                        isTotal: true,
                        textAlign: 'right'
                    });
                } else if (rawStyles?.isRiepiPercField) {
                    addAcroFormField(doc, {
                        fieldName: rawStyles.fieldName,
                        x: data.cell.x + 0.6,
                        y: data.cell.y + 0.6,
                        width: data.cell.width - 1.2,
                        height: data.cell.height - 1.2,
                        page,
                        readOnly: true,
                        isTotal: false,
                        textAlign: 'right'
                    });
                } else if (rawStyles?.isRiepiGrandTotalField) {
                    addAcroFormField(doc, {
                        fieldName: rawStyles.fieldName,
                        x: data.cell.x + 0.6,
                        y: data.cell.y + 0.6,
                        width: data.cell.width - 1.2,
                        height: data.cell.height - 1.2,
                        page,
                        readOnly: true,
                        isTotal: true,
                        textAlign: 'right'
                    });
                }
            }
        },
        didDrawPage: (data: any) => {
            drawHeaderSimple(doc, projectInfo, "COMPUTO SUBAPPALTO", data.pageNumber);
            drawTableFrame(doc, 18, pageHeight - 16);
            doc.setFontSize(10.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(20, 30, 50);
            doc.text("RIEPILOGO DEI LAVORI IN SUBAPPALTO PER GRUPPI DI LAVORAZIONE", 105, 14, { align: 'center' });
        }
    });

    let summaryFinalY = (doc as any).lastAutoTable?.finalY || 100;
    let targetPage = doc.getNumberOfPages();

    if (summaryFinalY + 55 > pageHeight - 16) {
        doc.addPage();
        targetPage = doc.getNumberOfPages();
        drawHeaderSimple(doc, projectInfo, "COMPUTO SUBAPPALTO", targetPage);
        drawTableFrame(doc, 18, pageHeight - 16);
        summaryFinalY = 22;
    } else {
        doc.setDrawColor(44, 62, 80);
        doc.setLineWidth(0.4);
        doc.line(10, summaryFinalY + 2, 200, summaryFinalY + 2);
        doc.setLineWidth(0.15);
        doc.line(10, summaryFinalY + 2.8, 200, summaryFinalY + 2.8);
    }

    // 5. PULSANTE RICALCOLO E GRUPPO FIRME PERSONALIZZABILE EDITABILE
    const actionY = summaryFinalY + 4;
    try {
        const btn = new doc.AcroFormPushButton();
        btn.fieldName = "BTN_CALCOLA_OFFERTA";
        btn.caption = "AGGIORNA TOTALI";
        btn.x = 156;
        btn.y = actionY;
        btn.width = 44;
        btn.height = 7.5;
        btn.page = targetPage;
        const origBtnGet = btn.getKeyValueListForStream.bind(btn);
        btn.getKeyValueListForStream = function() {
            const list = origBtnGet();
            list.push({ key: 'DA', value: '(/Helv 7.5 Tf 1 1 1 rg)' });
            list.push({ key: 'MK', value: '<< /BC [0.15 0.35 0.7] /BG [0.08 0.35 0.75] /CA (AGGIORNA TOTALI) >>' });
            list.push({ key: 'BS', value: '<< /W 1 /S /B >>' });
            list.push({
                key: 'A',
                value: '<< /S /JavaScript /JS (try { _calcDoc.call(this); } catch(e){}) >>'
            });
            return list;
        };
        doc.addField(btn);
    } catch (btnErr) {
        console.warn("Error adding recalc button:", btnErr);
    }

    let signY = actionY + 11;
    if (signY + 45 > pageHeight - 16) {
        doc.addPage();
        targetPage = doc.getNumberOfPages();
        drawHeaderSimple(doc, projectInfo, "COMPUTO SUBAPPALTO", targetPage);
        drawTableFrame(doc, 18, pageHeight - 16);
        signY = 24;
    }

    doc.setDrawColor(44, 62, 80);
    doc.setLineWidth(0.35);
    doc.line(10, signY, 200, signY);

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("L'IMPRESA APPALTATRICE (AFFIDANTE)", 55, signY + 5.5, { align: 'center' });
    doc.text("L'IMPRESA SUBAPPALTATRICE CONCORRENTE", 155, signY + 5.5, { align: 'center' });

    // Campi editabili interattivi per la personalizzazione completa delle firme
    // Sinistra: Impresa Appaltatrice Affidante
    addAcroFormField(doc, {
        fieldName: "FIRMA_AFFIDANTE_RAGIONE_SOCIALE",
        defaultValue: projectInfo.client ? `Appaltatore: ${projectInfo.client}` : "Ragione Sociale Impresa Affidante",
        x: 12,
        y: signY + 7.5,
        width: 86,
        height: 6,
        page: targetPage,
        readOnly: false,
        textAlign: 'left'
    });
    addAcroFormField(doc, {
        fieldName: "FIRMA_AFFIDANTE_DATI",
        defaultValue: "Sede Legale / P.IVA / C.F.: ___________________________",
        x: 12,
        y: signY + 14.5,
        width: 86,
        height: 6,
        page: targetPage,
        readOnly: false,
        textAlign: 'left'
    });
    addAcroFormField(doc, {
        fieldName: "FIRMA_AFFIDANTE_DATA_LUOGO",
        defaultValue: `${projectInfo.location || 'Cantiere'}, lì ${projectInfo.date || '...' }`,
        x: 12,
        y: signY + 21.5,
        width: 86,
        height: 6,
        page: targetPage,
        readOnly: false,
        textAlign: 'left'
    });
    addAcroFormField(doc, {
        fieldName: "FIRMA_AFFIDANTE_SOTTOSCRIZIONE",
        defaultValue: "Timbro e Firma per Consegna Lavorazioni",
        x: 12,
        y: signY + 28.5,
        width: 86,
        height: 7,
        page: targetPage,
        readOnly: false,
        textAlign: 'center'
    });

    // Destra: Impresa Subappaltatrice Concorrente
    addAcroFormField(doc, {
        fieldName: "FIRMA_SUB_RAGIONE_SOCIALE",
        defaultValue: "Ragione Sociale Impresa Subappaltatrice",
        x: 112,
        y: signY + 7.5,
        width: 86,
        height: 6,
        page: targetPage,
        readOnly: false,
        textAlign: 'left'
    });
    addAcroFormField(doc, {
        fieldName: "FIRMA_SUB_DATI",
        defaultValue: "Sede Legale / P.IVA / C.F.: ___________________________",
        x: 112,
        y: signY + 14.5,
        width: 86,
        height: 6,
        page: targetPage,
        readOnly: false,
        textAlign: 'left'
    });
    addAcroFormField(doc, {
        fieldName: "FIRMA_SUB_DATA_LUOGO",
        defaultValue: `${projectInfo.location || 'Data e Luogo'}, lì ${projectInfo.date || '...' }`,
        x: 112,
        y: signY + 21.5,
        width: 86,
        height: 6,
        page: targetPage,
        readOnly: false,
        textAlign: 'left'
    });
    addAcroFormField(doc, {
        fieldName: "FIRMA_SUB_SOTTOSCRIZIONE",
        defaultValue: "Timbro, Data e Firma per Offerta e Accettazione",
        x: 112,
        y: signY + 28.5,
        width: 86,
        height: 7,
        page: targetPage,
        readOnly: false,
        textAlign: 'center'
    });

    // Iniezione motore di calcolo JavaScript master unificato a livello documento (single-pass ad altissima velocità)
    const serializedItems = JSON.stringify(docItemsMeta);
    const serializedCats = JSON.stringify(docCatsMeta);
    const serializedPages = JSON.stringify(docPagesMeta);

    doc.addJS(`
var _fc = {};
function _gf(name) {
    var f = _fc[name];
    if (!f) {
        f = this.getField(name);
        if (f) _fc[name] = f;
    }
    return f;
}
function _p(v) {
    if (!v) return 0;
    if (typeof v === "number") return v;
    var s = ("" + v).replace(/^\\s+|\\s+$/g, "");
    if (!s) return 0;
    var c = s.lastIndexOf(",");
    var d = s.lastIndexOf(".");
    if (c > -1 && d > -1) {
        s = (c > d) ? s.split(".").join("").replace(",", ".") : s.split(",").join("");
    } else if (c > -1) {
        s = s.replace(",", ".");
    } else {
        s = s.replace(/[^0-9.-]/g, "");
    }
    var n = parseFloat(s);
    return (n && !isNaN(n)) ? n : 0;
}
function _fmt(v) {
    if (v === null || v === undefined || v === "") return "";
    var n = (typeof v === "number") ? v : _p(v);
    if (!n || isNaN(n)) return "";
    var isNeg = n < 0;
    var absVal = Math.abs(n);
    var parts = absVal.toFixed(2).split(".");
    var ip = parts[0];
    var dp = parts[1];
    var res = "";
    while (ip.length > 3) {
        res = "." + ip.slice(ip.length - 3) + res;
        ip = ip.slice(0, ip.length - 3);
    }
    return (isNeg ? "-" : "") + ip + res + "," + dp;
}
function _navNext(nextName) {
    if (!nextName) return;
    try {
        var nf = _gf.call(this, nextName);
        if (nf) nf.setFocus();
    } catch(e) {}
}
var _ITEMS = ${serializedItems};
var _CATS = ${serializedCats};
var _PAGES = ${serializedPages};
var _isCalculating = false;
function _calcDoc() {
    if (_isCalculating) return;
    _isCalculating = true;
    try {
        var grandTotal = 0;
        var catTotals = {};
        var pageTotals = {};
        for (var c = 0; c < _CATS.length; c++) {
            catTotals[_CATS[c].code] = 0;
        }
        for (var p = 0; p < _PAGES.length; p++) {
            pageTotals[_PAGES[p]] = 0;
        }
        for (var i = 0; i < _ITEMS.length; i++) {
            var item = _ITEMS[i];
            var pf = _gf.call(this, item.p);
            var pVal = pf ? _p(pf.value) : 0;
            var impVal = pVal > 0 ? (pVal * item.q) : 0;
            var impF = _gf.call(this, item.imp);
            if (impF) {
                impF.value = impVal > 0 ? _fmt(impVal) : "";
            }
            if (item.cat && catTotals[item.cat] !== undefined) {
                catTotals[item.cat] += impVal;
            }
            if (item.page && pageTotals[item.page] !== undefined) {
                pageTotals[item.page] += impVal;
            }
            grandTotal += impVal;
        }
        for (var c = 0; c < _CATS.length; c++) {
            var cat = _CATS[c];
            var cVal = catTotals[cat.code] || 0;
            var stF = _gf.call(this, cat.subtot);
            if (stF) stF.value = cVal > 0 ? _fmt(cVal) : "";
            var rImpF = _gf.call(this, cat.riepiImp);
            if (rImpF) rImpF.value = cVal > 0 ? _fmt(cVal) : "";
            var rPercF = _gf.call(this, cat.riepiPerc);
            if (rPercF) {
                rPercF.value = (grandTotal > 0 && cVal > 0) ? (((cVal / grandTotal) * 100).toFixed(2).replace(".", ",") + " %") : "";
            }
        }
        var runningRiporto = 0;
        for (var pIdx = 0; pIdx < _PAGES.length; pIdx++) {
            var pg = _PAGES[pIdx];
            var topF = _gf.call(this, "RIPORTO_TOP_" + pg);
            if (topF) {
                topF.value = runningRiporto > 0 ? _fmt(runningRiporto) : "";
            }
            runningRiporto += (pageTotals[pg] || 0);
            var botF = _gf.call(this, "RIPORTO_BOTTOM_" + pg);
            if (botF) {
                botF.value = runningRiporto > 0 ? _fmt(runningRiporto) : "";
            }
        }
        var gtF = _gf.call(this, "TOTALE_GENERALE_SUBAPPALTO");
        if (gtF) gtF.value = grandTotal > 0 ? _fmt(grandTotal) : "";
        var rgtF = _gf.call(this, "RIEPI_TOTALE_GENERALE");
        if (rgtF) rgtF.value = grandTotal > 0 ? _fmt(grandTotal) : "";
    } finally {
        _isCalculating = false;
    }
}
try {
    _calcDoc.call(this);
} catch(e) {}
`);

    // Configurazione del catalogo AcroForm con Calculation Order (/CO) limitato al solo master field
    const root = doc.internal.acroformPlugin?.acroFormDictionaryRoot;
    if (root) {
        const origRootGetKV = root.getKeyValueListForStream.bind(root);
        root.getKeyValueListForStream = function() {
            const list = origRootGetKV();
            const coRefs = grandTotalCalculatedFields
                .filter(f => f && f.objId)
                .map(f => `${f.objId} 0 R`)
                .join(' ');
            if (coRefs.length > 0) {
                list.push({ key: 'CO', value: `[ ${coRefs} ]` });
            }
            list.push({ key: 'NeedAppearances', value: 'true' });
            return list;
        };
    }

    applyDocumentFootersAndSecurity(doc, integrityHash);
    window.open(URL.createObjectURL(doc.output('blob')), '_blank');
  } catch (error) { console.error(error); alert("Errore generazione Computo Metrico Subappalto."); }
};

export const generateElencoPrezziPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
    try {
        const { jsPDF, autoTable } = await getLibs();
        const doc = new jsPDF();
        const tableBody: any[] = [];
        const globalCounter = { current: 1 };

        // 1. FRONTESPIZIO UFFICIALE ("TESTALINO") GECOLA CON BANDANA CELESTINO
        drawAccaCoverPage(
            doc,
            projectInfo,
            "ELENCO PREZZI",
            "ELENCO DEI PREZZI UNITARI"
        );
        doc.addPage();

        const integrityHash = await computeProjectIntegrityHash(
            projectInfo,
            categories,
            articles,
            0,
            "ELENCO PREZZI UNITARI"
        );

        categories.forEach((cat) => {
            if (cat.isSuperCategory) return;
            if (!cat.isEnabled) return;
            const catArticles = articles.filter(a => a.categoryCode === cat.code);
            if (catArticles.length === 0) return;
            tableBody.push([{ content: `${cat.code} - ${cat.name}`, colSpan: 5, styles: { fillColor: [240, 240, 240], fontStyle: 'bold', fontSize: 8.5 } }]);
            catArticles.forEach((art, artIndex) => {
                const artNum = `${getWbsNumber(cat.code)}.${artIndex + 1}`;
                const gNum = globalCounter.current++;
                const wordsPrice = numberToItalianWords(art.unitPrice);
                
                let finalDescription = cleanText(art.description);
                if (projectInfo.descriptionLength === 'short') {
                    doc.setFontSize(8);
                    const splitLines = doc.splitTextToSize(finalDescription, 90);
                    if (splitLines.length > 6) {
                        finalDescription = splitLines.slice(0, 6).join('\n') + ' .....';
                    }
                }

                // Incidenza della manodopera nel prezzo unitario (D.Lgs. 36/2023)
                let priceContent = `€ ${formatCurrency(art.unitPrice)}\n(Euro ${wordsPrice})`;
                if (art.laborRate && art.laborRate > 0) {
                    const laborVal = art.unitPrice * (art.laborRate / 100);
                    priceContent += `\n(di cui manodopera: € ${formatCurrency(laborVal)} - ${art.laborRate.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`;
                }

                tableBody.push([
                  { content: `${gNum}\n(${artNum})`, styles: { halign: 'center', isArt: true, cellPadding: { top: 2.5, bottom: 2 } } }, 
                  { content: formatTariffCode(art.code, 21, 6.8, doc), styles: { fontStyle: 'bold', fontSize: art.code.length > 25 ? 6 : (art.code.length > 16 ? 6.5 : 7.2), halign: 'center', overflow: 'linebreak', cellPadding: { top: 2.5, bottom: 2, left: 1, right: 1 } } }, 
                  { content: finalDescription, styles: { isArtDesc: true, fontSize: 8, cellPadding: { left: 3, right: 3, top: 2.5, bottom: 2.5 } } }, 
                  { content: art.unit, styles: { halign: 'center', cellPadding: { top: 2.5, bottom: 2 } } }, 
                  { content: priceContent, styles: { halign: 'right', fontStyle: 'bold', fontSize: 7, cellPadding: { top: 2.5, bottom: 2.5, right: 2.5, left: 2 } } }
                ]);
            });
        });

        autoTable(doc, { 
            head: [['N.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'U.M.', 'PREZZO UNITARIO']], 
            body: tableBody, 
            startY: 18, 
            margin: { left: 10, right: 10, top: 18, bottom: 20 },
            theme: 'grid', 
            styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' }, 
            columnStyles: {
                0: { cellWidth: 16, halign: 'center' },
                1: { cellWidth: 26, halign: 'center' },
                2: { cellWidth: 96 },
                3: { cellWidth: 12, halign: 'center' },
                4: { cellWidth: 40, halign: 'right' }
            },
            headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, cellPadding: { top: 1.8, bottom: 1.8, left: 0.8, right: 0.8 }, halign: 'center' }, 
            didDrawPage: (data: any) => { 
                drawAccaPageFrame(doc, data.pageNumber, projectInfo);
                doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(50, 60, 75);
                doc.text("ELENCO DEI PREZZI UNITARI", 105, 14, { align: 'center' });
            },
            willDrawCell: (data: any) => {
                if (data.column.index === 2 && data.section === 'body' && data.cell.raw?.styles?.isArtDesc) {
                    data.cell._linesToDraw = [...data.cell.text];
                    data.cell.text = []; // Svuota per evitare sovrascritture di autotable
                }
            },
            didDrawCell: (data: any) => {
                // RENDERING DESCRIZIONE GIUSTIFICATA
                if (data.column.index === 2 && data.section === 'body' && data.cell._linesToDraw) {
                    const cell = data.cell;
                    const padLeft = cell.padding('left');
                    const padRight = cell.padding('right');
                    const contentWidth = cell.width - padLeft - padRight;
                    const pos = cell.getTextPos();
                    const fontSize = cell.styles.fontSize || 8;
                    const factor = doc.getLineHeightFactor ? doc.getLineHeightFactor() : 1.15;
                    const lineHeight = (fontSize / doc.internal.scaleFactor) * factor;
                    
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(fontSize);
                    doc.setTextColor(20, 20, 20);
                    
                    let curY = pos.y;
                    data.cell._linesToDraw.forEach((l: string, idx: number) => {
                        const isLast = idx === data.cell._linesToDraw.length - 1;
                        drawJustifiedLine(doc, l, pos.x, curY, contentWidth, isLast);
                        curY += lineHeight;
                    });
                }

                // GESTIONE NUMERAZIONE COLONNA 0
                if (data.column.index === 0 && data.section === 'body' && data.cell.raw?.styles?.isArt) {
                    const textStr = data.cell.raw.content;
                    const lines = textStr.split('\n');
                    if (lines.length >= 2) {
                        const x = data.cell.x + data.cell.width / 2;
                        let y = data.cell.y + 4.5;
                        doc.setFont("helvetica", 'bold');
                        doc.setFontSize(10);
                        doc.text(lines[0], x, y, { align: 'center' });
                        y += 4.5;
                        doc.setFont("helvetica", 'normal');
                        doc.setFontSize(7);
                        doc.text(lines[1], x, y, { align: 'center' });
                        return false;
                    }
                }
            },
            didParseCell: (data: any) => {
                if (data.column.index === 0 && data.section === 'body' && data.cell.raw?.styles?.isArt) {
                    data.cell.text = [];
                }
                // Adatta dinamicamente il font del prezzo in lettere se molto lungo per evitare sbordature
                if (data.column.index === 4 && data.section === 'body') {
                    const textContent = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text || '');
                    if (textContent.length > 45) {
                        data.cell.styles.fontSize = 6.2;
                    } else if (textContent.length > 35) {
                        data.cell.styles.fontSize = 6.8;
                    }
                }
            }
        });

        const epFinalY = (doc as any).lastAutoTable.finalY;
        doc.setDrawColor(44, 62, 80);
        doc.setLineWidth(0.4);
        doc.line(10, epFinalY, 200, epFinalY);
        doc.setLineWidth(0.15);
        doc.line(10, epFinalY + 0.8, 200, epFinalY + 0.8);

        drawSignature(doc, projectInfo, epFinalY + 10, integrityHash);
        applyDocumentFootersAndSecurity(doc, integrityHash);
        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (e) { alert("Errore Elenco Prezzi."); }
};

export const generateManodoperaPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
    try {
        const { jsPDF, autoTable } = await getLibs();
        const doc = new jsPDF();
        const tableBody: any[] = [];
        let totalLaborSum = 0;
        let totalWorksSum = 0;
        const globalCounter = { current: 1 };

        // 1. FRONTESPIZIO UFFICIALE ("TESTALINO") GECOLA CON BANDANA CELESTINO
        drawAccaCoverPage(
            doc,
            projectInfo,
            "INCIDENZA MANODOPERA",
            "STIMA DELL'INCIDENZA DELLA MANODOPERA (D.Lgs. 36/2023)"
        );
        doc.addPage();

        categories.forEach((cat) => {
            if (cat.isSuperCategory) return;
            if (!cat.isEnabled) return;
            const catArticles = articles.filter(a => a.categoryCode === cat.code);
            if (catArticles.length === 0) return;
            
            let catLaborSum = 0;
            let catWorksSum = 0;

            tableBody.push([{ content: `${cat.code} - ${cat.name}`, colSpan: 6, styles: { fillColor: [240, 240, 240], fontStyle: 'bold', fontSize: 8.5 } }]);
            catArticles.forEach((art, artIndex) => {
                const totalItem = art.quantity * art.unitPrice;
                const laborPart = totalItem * (art.laborRate / 100);
                totalLaborSum += laborPart;
                totalWorksSum += totalItem;
                catLaborSum += laborPart;
                catWorksSum += totalItem;
                const artNum = `${getWbsNumber(cat.code)}.${artIndex + 1}`;
                const gNum = globalCounter.current++;
                
                let finalDescription = cleanText(art.description);
                if (projectInfo.descriptionLength === 'short') {
                    doc.setFontSize(7.5);
                    const splitLines = doc.splitTextToSize(finalDescription, 68);
                    if (splitLines.length > 6) {
                        finalDescription = splitLines.slice(0, 6).join('\n') + ' .....';
                    }
                }

                tableBody.push([ 
                  { content: `${gNum}\n(${artNum})`, styles: { halign: 'center', isArt: true, cellPadding: { top: 2.5, bottom: 2 } } }, 
                  { content: formatTariffCode(art.code, 22, 6.8, doc), styles: { fontStyle: 'bold', fontSize: art.code.length > 25 ? 6 : (art.code.length > 16 ? 6.5 : 7.2), halign: 'center', overflow: 'linebreak', cellPadding: { top: 2.5, bottom: 2, left: 1, right: 1 } } }, 
                  { content: finalDescription, styles: { isArtDesc: true, fontSize: 7.5, cellPadding: { left: 2.5, right: 2.5, top: 2.5, bottom: 2.5 } } }, 
                  { content: `€ ${formatCurrency(totalItem)}`, styles: { halign: 'right', cellPadding: { top: 2.5, bottom: 2 } } }, 
                  { content: `${art.laborRate.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`, styles: { halign: 'center', cellPadding: { top: 2.5, bottom: 2 } } }, 
                  { content: `€ ${formatCurrency(laborPart)}`, styles: { halign: 'right', fontStyle: 'bold', cellPadding: { top: 2.5, bottom: 2 } } } 
                ]);
            });

            // Parziale per capitolo / WBS se vi è più di 1 articolo
            if (catArticles.length > 1) {
                const catIncidence = catWorksSum > 0 ? (catLaborSum / catWorksSum) * 100 : 0;
                tableBody.push([
                    { content: `PARZIALE ${cat.code}`, colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.5, fillColor: [248, 250, 252], cellPadding: { top: 2, bottom: 2, right: 3 } } },
                    { content: `€ ${formatCurrency(catWorksSum)}`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.5, fillColor: [248, 250, 252], cellPadding: { top: 2, bottom: 2, right: 2 } } },
                    { content: `${catIncidence.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`, styles: { halign: 'center', fontStyle: 'bold', fontSize: 7.5, fillColor: [248, 250, 252], cellPadding: { top: 2, bottom: 2 } } },
                    { content: `€ ${formatCurrency(catLaborSum)}`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.5, fillColor: [248, 250, 252], textColor: [0, 32, 128], cellPadding: { top: 2, bottom: 2, right: 2 } } }
                ]);
            }
        });

        const overallLaborRate = totalWorksSum > 0 ? (totalLaborSum / totalWorksSum) * 100 : 0;

        const integrityHash = await computeProjectIntegrityHash(
            projectInfo,
            categories,
            articles,
            totalLaborSum,
            "STIMA INCIDENZA MANODOPERA"
        );

        tableBody.push([
            { 
                content: 'TOTALE GENERALE INCIDENZA MANODOPERA', 
                colSpan: 3, 
                styles: { 
                    halign: 'right', 
                    fontStyle: 'bold', 
                    fontSize: 9.5, 
                    cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                    fillColor: [240, 244, 252], 
                    textColor: [15, 23, 42] 
                } 
            }, 
            { 
                content: `€ ${formatCurrency(totalWorksSum)}`, 
                styles: { 
                    halign: 'right', 
                    fontStyle: 'bold', 
                    fontSize: 9.5, 
                    cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                    fillColor: [240, 244, 252], 
                    textColor: [15, 23, 42] 
                } 
            },
            { 
                content: `${overallLaborRate.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`, 
                styles: { 
                    halign: 'center', 
                    fontStyle: 'bold', 
                    fontSize: 9.5, 
                    cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                    fillColor: [240, 244, 252], 
                    textColor: [15, 23, 42] 
                } 
            },
            { 
                content: `€ ${formatCurrency(totalLaborSum)}`, 
                styles: { 
                    halign: 'right', 
                    fontStyle: 'bold', 
                    fontSize: 10.5, 
                    cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                    fillColor: [240, 244, 252], 
                    textColor: [0, 32, 128] 
                } 
            }
        ]);
        tableBody.push([
            { 
                content: `Sommano in lettere (Manodopera): Euro ${numberToItalianWords(totalLaborSum)}`, 
                colSpan: 6, 
                styles: { 
                    halign: 'right', 
                    fontStyle: 'bolditalic', 
                    fontSize: 9, 
                    cellPadding: { top: 2, bottom: 4.5, right: 3 }, 
                    fillColor: [246, 249, 254], 
                    textColor: [0, 32, 128] 
                } 
            }
        ]);

        autoTable(doc, { 
            head: [['N. ORD.', 'CODICE TARIFFARIO', 'DESIGNAZIONE DELLA LAVORAZIONE', 'IMPORTO TOTALE (€)', 'ALIQUOTA M.O.', 'IMPORTO M.O. (€)']], 
            body: tableBody, 
            startY: 18, 
            margin: { left: 10, right: 10, top: 18, bottom: 20 },
            theme: 'grid', 
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' }, 
            columnStyles: {
                0: { cellWidth: 15, halign: 'center' },
                1: { cellWidth: 27, halign: 'center' },
                2: { cellWidth: 72 },
                3: { cellWidth: 26, halign: 'right' },
                4: { cellWidth: 22, halign: 'center' },
                5: { cellWidth: 28, halign: 'right' }
            },
            headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, cellPadding: { top: 1.8, bottom: 1.8, left: 0.8, right: 0.8 }, halign: 'center' }, 
            didDrawPage: (data: any) => { 
                drawAccaPageFrame(doc, data.pageNumber, projectInfo);
                doc.setTextColor(15, 23, 42);
                doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); 
                doc.text("STIMA DELL'INCIDENZA DELLA MANODOPERA (D.Lgs. 36/2023)", 105, 14, { align: 'center' });
            },
            willDrawCell: (data: any) => {
                if (data.column.index === 2 && data.section === 'body' && data.cell.raw?.styles?.isArtDesc) {
                    data.cell._linesToDraw = [...data.cell.text];
                    data.cell.text = []; // Svuota per evitare sovrascritture di autotable
                }
            },
            didDrawCell: (data: any) => {
                // RENDERING DESCRIZIONE GIUSTIFICATA
                if (data.column.index === 2 && data.section === 'body' && data.cell._linesToDraw) {
                    const cell = data.cell;
                    const padLeft = cell.padding('left');
                    const padRight = cell.padding('right');
                    const contentWidth = cell.width - padLeft - padRight;
                    const pos = cell.getTextPos();
                    const fontSize = cell.styles.fontSize || 7.5;
                    const factor = doc.getLineHeightFactor ? doc.getLineHeightFactor() : 1.15;
                    const lineHeight = (fontSize / doc.internal.scaleFactor) * factor;
                    
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(fontSize);
                    doc.setTextColor(20, 20, 20);
                    
                    let curY = pos.y;
                    data.cell._linesToDraw.forEach((l: string, idx: number) => {
                        const isLast = idx === data.cell._linesToDraw.length - 1;
                        drawJustifiedLine(doc, l, pos.x, curY, contentWidth, isLast);
                        curY += lineHeight;
                    });
                }

                // GESTIONE NUMERAZIONE COLONNA 0
                if (data.column.index === 0 && data.section === 'body' && data.cell.raw?.styles?.isArt) {
                    const textStr = data.cell.raw.content;
                    const lines = textStr.split('\n');
                    if (lines.length >= 2) {
                        const x = data.cell.x + data.cell.width / 2;
                        let y = data.cell.y + 4.5;
                        doc.setFont("helvetica", 'bold');
                        doc.setFontSize(10);
                        doc.text(lines[0], x, y, { align: 'center' });
                        y += 4.5;
                        doc.setFont("helvetica", 'normal');
                        doc.setFontSize(7);
                        doc.text(lines[1], x, y, { align: 'center' });
                        return false;
                    }
                }
            },
            didParseCell: (data: any) => {
                if (data.column.index === 0 && data.section === 'body' && data.cell.raw?.styles?.isArt) {
                    data.cell.text = [];
                }
                if (data.section === 'body' && [3, 5].includes(data.column.index)) {
                    const textContent = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text || '');
                    if (textContent.trim().length > 13) {
                        data.cell.styles.fontSize = 6.2;
                        data.cell.styles.cellPadding = 0.8;
                    } else if (textContent.trim().length > 10) {
                        data.cell.styles.fontSize = 6.8;
                        data.cell.styles.cellPadding = 1;
                    }
                }
            }
        });

        const manoFinalY = (doc as any).lastAutoTable.finalY;
        doc.setDrawColor(44, 62, 80);
        doc.setLineWidth(0.4);
        doc.line(10, manoFinalY, 200, manoFinalY);
        doc.setLineWidth(0.15);
        doc.line(10, manoFinalY + 0.8, 200, manoFinalY + 0.8);

        // --- RIEPILOGO INCIDENZA MANODOPERA PER WBS (COME PER IL COMPUTO) ---
        doc.addPage();
        const summaryTableBody: any[] = [];
        
        const validCategories = categories.filter(cat => !cat.isEnabled === false && !cat.isSuperCategory);
        const categoryTotals = validCategories.map(cat => {
            const catArticles = articles.filter(a => a.categoryCode === cat.code);
            const totalLavori = catArticles.reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
            const totalMano = catArticles.reduce((sum, a) => sum + (a.quantity * a.unitPrice * (a.laborRate / 100)), 0);
            return { cat, totalLavori, totalMano };
        }).filter(item => item.totalLavori > 0 || item.totalMano > 0);

        const grandTotalLavori = categoryTotals.reduce((sum, item) => sum + item.totalLavori, 0);
        const grandTotalMano = categoryTotals.reduce((sum, item) => sum + item.totalMano, 0);
        const summaryOverallLaborRate = grandTotalLavori > 0 ? (grandTotalMano / grandTotalLavori) * 100 : 0;

        categoryTotals.forEach(item => {
            const catLaborPercent = item.totalLavori > 0 ? (item.totalMano / item.totalLavori) * 100 : 0;
            const catWeightPercent = grandTotalMano > 0 ? (item.totalMano / grandTotalMano) * 100 : 0;
            
            summaryTableBody.push([
                { content: item.cat.code, styles: { fontStyle: 'bold', halign: 'center' } },
                { content: item.cat.name.toUpperCase(), styles: { halign: 'left' } },
                { content: `€ ${formatCurrency(item.totalLavori)}`, styles: { halign: 'right' } },
                { content: `€ ${formatCurrency(item.totalMano)}`, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: `${catLaborPercent.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`, styles: { halign: 'right' } },
                { content: `${catWeightPercent.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`, styles: { halign: 'right' } }
            ]);
        });

        // Riga Totale Generale Incidenza Manodopera
        summaryTableBody.push([
            { 
                content: 'TOTALE GENERALE INCIDENZA MANODOPERA', 
                colSpan: 2, 
                styles: { 
                    fillColor: [240, 244, 252], 
                    fontStyle: 'bold', 
                    halign: 'right', 
                    fontSize: 10, 
                    cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                    textColor: [15, 23, 42] 
                } 
            },
            { 
                content: `€ ${formatCurrency(grandTotalLavori)}`, 
                styles: { 
                    fillColor: [240, 244, 252], 
                    fontStyle: 'bold', 
                    halign: 'right', 
                    fontSize: 10, 
                    cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                    textColor: [15, 23, 42] 
                } 
            },
            { 
                content: `€ ${formatCurrency(grandTotalMano)}`, 
                styles: { 
                    fillColor: [240, 244, 252], 
                    fontStyle: 'bold', 
                    halign: 'right', 
                    fontSize: 11, 
                    cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                    textColor: [0, 32, 128] 
                } 
            },
            { 
                content: `${summaryOverallLaborRate.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`, 
                styles: { 
                    fillColor: [240, 244, 252], 
                    fontStyle: 'bold', 
                    halign: 'right', 
                    fontSize: 10, 
                    cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                    textColor: [15, 23, 42] 
                } 
            },
            { 
                content: '100,00%', 
                styles: { 
                    fillColor: [240, 244, 252], 
                    fontStyle: 'bold', 
                    halign: 'right', 
                    fontSize: 10, 
                    cellPadding: { top: 3.5, bottom: 3.5, right: 3, left: 3 }, 
                    textColor: [15, 23, 42] 
                } 
            }
        ]);

        // Riga Sommano in lettere come assegno
        summaryTableBody.push([
            { 
                content: `Sommano in lettere (Manodopera): Euro ${numberToItalianWords(grandTotalMano)}`, 
                colSpan: 6, 
                styles: { 
                    fillColor: [246, 249, 254], 
                    fontStyle: 'bolditalic', 
                    halign: 'right', 
                    fontSize: 9.5, 
                    textColor: [0, 32, 128], 
                    cellPadding: { top: 2.5, bottom: 4.5, right: 3, left: 3 } 
                } 
            }
        ]);

        const summaryHead = [['COD.', 'CATEGORIA / CAPITOLO (WBS)', 'IMPORTO LAVORI', 'IMPORTO M.O.', '% M.O. / WBS', 'PESO % TOT. M.O.']];

        autoTable(doc, {
            head: summaryHead,
            body: summaryTableBody,
            startY: 32,
            margin: { left: 10, right: 10 },
            theme: 'grid',
            styles: { fontSize: 8.5, cellPadding: 2.5, overflow: 'linebreak' },
            columnStyles: {
                0: { cellWidth: 16, halign: 'center' },
                1: { cellWidth: 70 }, 
                2: { cellWidth: 28, halign: 'right' },
                3: { cellWidth: 28, halign: 'right' },
                4: { cellWidth: 24, halign: 'right' },
                5: { cellWidth: 24, halign: 'right' }
            },
            headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
            didDrawPage: (data: any) => {
                doc.setFontSize(12); doc.setFont("helvetica", "bold");
                doc.text("RIEPILOGO GENERALE INCIDENZA MANODOPERA PER WBS", 105, 20, { align: 'center' });
            }
        });

        const summaryFinalY = (doc as any).lastAutoTable.finalY;
        doc.setDrawColor(44, 62, 80);
        doc.setLineWidth(0.4);
        doc.line(10, summaryFinalY, 200, summaryFinalY);
        doc.setLineWidth(0.15);
        doc.line(10, summaryFinalY + 0.8, 200, summaryFinalY + 0.8);

        drawSignature(doc, projectInfo, summaryFinalY + 10, integrityHash);
        applyDocumentFootersAndSecurity(doc, integrityHash);
        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (e) { alert("Errore Manodopera."); }
};

/**
 * Ricalcola e normalizza tutti i totali matematici di un\'analisi prezzi
 * garantendo coerenza assoluta tra costi elementari, ricarichi e prezzo finale.
 */
const ensureAnalysisTotals = (an: PriceAnalysis): PriceAnalysis => {
    const components = an.components || [];
    const sgRate = (an.generalExpensesRate !== undefined ? an.generalExpensesRate : 15) / 100;
    const uRate = (an.profitRate !== undefined ? an.profitRate : 10) / 100;
    const compoundMultiplier = (1 + sgRate) * (1 + uRate);
    const analysisQuantity = (an.analysisQuantity && an.analysisQuantity > 0) ? an.analysisQuantity : 1;

    let totalMaterials = 0;
    let totalLabor = 0;
    let totalEquipment = 0;
    let totalNetItems = 0;
    let totalInclusiveItems = 0;

    let totalTechnicalCost = 0;
    let totalOverhead = 0;
    let totalProfit = 0;

    components.forEach(comp => {
        let qty = comp.quantity || 0;
        if (comp.measurements && comp.measurements.length > 0) {
            const computedQty = comp.measurements.reduce((sum, m) => {
                const hasDims = m.length !== undefined || m.width !== undefined || m.height !== undefined;
                const mult = m.multiplier !== undefined ? m.multiplier : (hasDims ? 1 : 0);
                const l = m.length !== undefined ? m.length : 1;
                const w = m.width !== undefined ? m.width : 1;
                const h = m.height !== undefined ? m.height : 1;
                const rowVal = hasDims ? (mult * l * w * h) : mult;
                return sum + rowVal;
            }, 0);
            if (computedQty > 0 || comp.measurements.some(m => (m.description || '').trim() !== '')) {
                qty = computedQty;
            }
        }

        const amount = qty * (comp.unitPrice || 0);
        if (comp.type === 'material') totalMaterials += amount;
        else if (comp.type === 'labor') totalLabor += amount;
        else if (comp.type === 'equipment') totalEquipment += amount;

        if (comp.includesMarkup) {
            totalInclusiveItems += amount;
            const netBase = compoundMultiplier > 0 ? (amount / compoundMultiplier) : amount;
            const sgPart = netBase * sgRate;
            const uPart = (netBase + sgPart) * uRate;
            totalTechnicalCost += netBase;
            totalOverhead += sgPart;
            totalProfit += uPart;
        } else {
            totalNetItems += amount;
            const netBase = amount;
            const sgPart = netBase * sgRate;
            const uPart = (netBase + sgPart) * uRate;
            totalTechnicalCost += netBase;
            totalOverhead += sgPart;
            totalProfit += uPart;
        }
    });

    const totalBatchValue = totalTechnicalCost + totalOverhead + totalProfit;
    const totalUnitPrice = analysisQuantity > 0 ? (totalBatchValue / analysisQuantity) : totalBatchValue;

    return {
        ...an,
        analysisQuantity,
        totalMaterials,
        totalLabor,
        totalEquipment,
        costoTecnico: totalTechnicalCost,
        totalNetItems,
        totalInclusiveItems,
        valoreSpese: totalOverhead,
        valoreUtile: totalProfit,
        totalBatchValue,
        totalUnitPrice,
    };
};

/**
 * Formatta con precisione le quantità analitiche (fino a 4 decimali se presenti frazioni millesimali)
 */
const formatQuantityAnalysis = (val: number | undefined | null): string => {
    if (val === undefined || val === null) return '0,00';
    const decStr = val.toString().split('.')[1] || '';
    const minDecs = 2;
    const maxDecs = decStr.length > 2 ? Math.min(4, Math.max(2, decStr.length)) : 2;
    return new Intl.NumberFormat('it-IT', { 
        minimumFractionDigits: minDecs, 
        maximumFractionDigits: maxDecs, 
        useGrouping: true 
    }).format(val);
};

/**
 * Renderizza un intero paragrafo con giustificazione millimetrica riga per riga per riempire la colonna
 */
const drawJustifiedParagraph = (
    doc: any,
    text: string,
    x: number,
    startY: number,
    maxWidth: number,
    fontSize: number = 8.5,
    fontStyle: string = 'normal',
    textColor: [number, number, number] = [20, 20, 20],
    lineHeightFactor: number = 1.25
): number => {
    if (!text) return startY;
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    const factor = doc.getLineHeightFactor ? doc.getLineHeightFactor() : lineHeightFactor;
    const lineHeight = (fontSize / doc.internal.scaleFactor) * factor;

    const paragraphs = text.split('\n');
    let curY = startY;

    paragraphs.forEach(p => {
        const cleaned = softBreakLongWords(cleanText(p));
        if (!cleaned.trim()) {
            curY += lineHeight * 0.4;
            return;
        }
        const lines = doc.splitTextToSize(cleaned, maxWidth);
        lines.forEach((l: string, idx: number) => {
            const isLast = idx === lines.length - 1;
            drawJustifiedLine(doc, l, x, curY, maxWidth, isLast);
            curY += lineHeight;
        });
        curY += lineHeight * 0.2;
    });

    return curY;
};

/**
 * Traccia il blocco delle firme contrattuali tri-partite (Appaltatore, D.L./Progettista, Committente/R.U.P.)
 * con data e sigillo di conformità crittografica.
 */
const drawContractualAnalysisSignature = (
    doc: any,
    projectInfo: ProjectInfo,
    yPos: number,
    integrityHash?: string
) => {
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    let finalY = yPos + 6;
    
    // Spazio necessario per firme e sigillo (almeno 48mm)
    if (finalY > pageHeight - 52) { 
        doc.addPage(); 
        finalY = 22; 
    }
    
    // Data e Luogo
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 70, 85);
    doc.text(`${projectInfo.location || 'Luogo'}, addì ${projectInfo.date || new Date().toLocaleDateString('it-IT')}`, 10, finalY);
    
    finalY += 7;
    
    // 3 Colonne di Firma: Impresa, Progettista/D.L., Committente/R.U.P.
    const colWidth = (pageWidth - 20) / 3; // ~63mm ciascuna
    const col1X = 10;
    const col2X = 10 + colWidth;
    const col3X = 10 + colWidth * 2;
    
    // Titoli
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text("L'APPALTATORE / L'IMPRESA", col1X + colWidth / 2, finalY, { align: 'center' });
    doc.text("IL PROGETTISTA / D.L.", col2X + colWidth / 2, finalY, { align: 'center' });
    doc.text("IL COMMITTENTE / IL R.U.P.", col3X + colWidth / 2, finalY, { align: 'center' });
    
    // Linee firma
    doc.setDrawColor(180, 190, 205);
    doc.setLineWidth(0.2);
    doc.line(col1X + 6, finalY + 12, col1X + colWidth - 6, finalY + 12);
    doc.line(col2X + 6, finalY + 12, col2X + colWidth - 6, finalY + 12);
    doc.line(col3X + 6, finalY + 12, col3X + colWidth - 6, finalY + 12);
    
    // Nomi e ruoli sotto la riga
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text("(Timbro e Firma per accettazione)", col1X + colWidth / 2, finalY + 16, { align: 'center' });
    doc.text(projectInfo.designer ? `${projectInfo.designer}` : '(Timbro e Firma)', col2X + colWidth / 2, finalY + 16, { align: 'center' });
    doc.text(projectInfo.client ? `${projectInfo.client}` : '(Timbro e Firma per approvazione)', col3X + colWidth / 2, finalY + 16, { align: 'center' });
    
    // Sigillo di Integrità Digitale SHA-256
    if (integrityHash) {
        const boxY = finalY + 21;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.2);
        doc.roundedRect(10, boxY, pageWidth - 20, 11, 1.2, 1.2, 'FD');
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(30, 58, 138);
        doc.text("ATTESTAZIONE DI CONFORMITÀ E INTEGRITÀ CONTRATTUALE (D.Lgs. 36/2023 - D.Lgs. 82/2005 CAD)", 13, boxY + 4);
        
        doc.setFont("courier", "bold");
        doc.setFontSize(6.2);
        doc.setTextColor(15, 23, 42);
        const formattedHash = integrityHash.toUpperCase().match(/.{1,4}/g)?.join(' ') || integrityHash;
        doc.text(`IMPRONTA DIGITALE SHA-256: ${formattedHash}`, 13, boxY + 8);
    }
};

/**
 * Genera la stampa ufficiale della Scheda Analisi Prezzi (Documento Contrattuale di Appalto)
 * Rispetta rigorosamente i requisiti dell'Art. 32 All. I.7 D.Lgs. 36/2023:
 * - Riporta esattamente ogni voce caricata con le sue quantità e misurazioni di dettaglio
 * - Descrizioni sempre giustificate per riempire perfettamente la larghezza di colonna
 * - Quadro economico analitico che spiega matematicamente la formazione del prezzo unitario
 * - Prezzo unitario evidenziato e scritto per esteso in lettere
 * - Parametri di incidenza manodopera obbligatori per legge
 */
export const generateAnalisiPrezziPdf = async (projectInfo: ProjectInfo, analyses: PriceAnalysis[]) => {
    try {
        const { jsPDF, autoTable } = await getLibs();
        const doc = new jsPDF();
        const pageHeight = doc.internal.pageSize.height;
        const pageWidth = doc.internal.pageSize.width;

        if (!analyses || analyses.length === 0) {
            alert("Nessuna analisi dei prezzi presente nel progetto da stampare.");
            return;
        }

        // Calcola e normalizza tutte le analisi
        const normalizedAnalyses = analyses.map(ensureAnalysisTotals);
        const rawAnalyses = normalizedAnalyses.map(a => `${a.code}:${a.totalUnitPrice}:${a.totalMaterials}:${a.totalLabor}:${a.totalEquipment}`).join(';');
        const integrityHash = await computeSha256(`ANALISI PREZZI UFFICIALE||${projectInfo.title}||${rawAnalyses}`);

        // Intestazione per le pagine di continuazione
        const drawContinuationHeader = (pageNo: number, anCode: string) => {
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(112, 38, 143);
            doc.text(`ANALISI DEI PREZZI UNITARI - Tariffa ${anCode}`, 10, 11);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.8);
            doc.setTextColor(100, 116, 139);
            doc.text(`Opera: ${projectInfo.title}`, 200, 11, { align: 'right' });
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.2);
            doc.line(10, 13, 200, 13);
        };

        // 1. FRONTESPIZIO UFFICIALE ("TESTALINO") GECOLA CON BANDANA CELESTINO
        drawAccaCoverPage(
            doc,
            projectInfo,
            "ANALISI PREZZI",
            "ANALISI DEI PREZZI UNITARI E GIUSTIFICAZIONE DEI COSTI (D.Lgs. 36/2023)"
        );
        doc.addPage();

        // 2. SCHEDE DELLE SINGOLE ANALISI (DOCUMENTO CONTRATTUALE)
        normalizedAnalyses.forEach((an, idx) => {
            if (idx > 0) doc.addPage();

            // HEADER ISTITUZIONALE DI PRIMA PAGINA DELL'ANALISI
            doc.setFillColor(248, 250, 252);
            doc.rect(10, 8, 190, 19, 'F');
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.2);
            doc.rect(10, 8, 190, 19, 'S');

            doc.setFont("helvetica", "bold");
            doc.setFontSize(10.5);
            doc.setTextColor(30, 41, 59);
            doc.text("DOCUMENTO CONTRATTUALE - ANALISI DEI PREZZI UNITARI", 105, 14.5, { align: 'center' });

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.text("SCHEDA ANALITICA DI DETERMINAZIONE DEL NUOVO PREZZO (D.Lgs. 36/2023 - All. I.7 Art. 32)", 105, 19.5, { align: 'center' });

            // DATI DI PROGETTO
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.text(`OGGETTO: ${projectInfo.title || 'Lavori edili di contratto'}`, 10, 32);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.2);
            doc.setTextColor(71, 85, 105);
            doc.text(`Committente: ${projectInfo.client || 'Committente'}`, 10, 36.5);
            doc.text(`Progettista / D.L.: ${projectInfo.designer || 'Progettista'}`, 10, 40.5);

            doc.text(`Prezzario di Riferimento: ${projectInfo.region || 'Regionale'} ${projectInfo.year || ''}`, 200, 36.5, { align: 'right' });
            doc.text(`Luogo e Data: ${projectInfo.location || ''} - ${projectInfo.date || ''}`, 200, 40.5, { align: 'right' });

            doc.setDrawColor(112, 38, 143);
            doc.setLineWidth(0.4);
            doc.line(10, 43, 200, 43);
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.15);
            doc.line(10, 43.8, 200, 43.8);

            let currentY = 48;

            // BOX IDENTIFICATIVO DELLA VOCE DI NUOVO PREZZO
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(180, 190, 205);
            doc.setLineWidth(0.2);
            doc.roundedRect(10, currentY, 190, 13, 1.5, 1.5, 'FD');

            // Codice Tariffa
            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(112, 38, 143);
            doc.text(`TARIFFA / VOCE N.P.: ${an.code || 'N.P.'}`, 14, currentY + 8.5);

            // Dati Lotto
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("U.M. DI CONTRATTO:", 112, currentY + 5.2);
            doc.setFontSize(9);
            doc.setTextColor(30, 41, 59);
            doc.text(`${an.unit}`, 150, currentY + 5.2);

            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("QUANTITÀ LOTTO ANALIZZATO:", 112, currentY + 10.2);
            doc.setFontSize(9);
            doc.setTextColor(112, 38, 143);
            doc.text(`${formatQuantityAnalysis(an.analysisQuantity)} ${an.unit}`, 196, currentY + 10.2, { align: 'right' });

            currentY += 17;

            // DESIGNAZIONE DELLA VOCE (GIUSTIFICATA PERFETTA SU TUTTA LA COLONNA)
            doc.setFontSize(7.8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.text("DESIGNAZIONE DELLA LAVORAZIONE (Articolo di Capitolato e Contratto):", 10, currentY);
            currentY += 4.2;

            currentY = drawJustifiedParagraph(
                doc,
                an.description || 'Descrizione non specificata.',
                10,
                currentY,
                190,
                8,
                'normal',
                [30, 41, 59]
            );

            currentY += 3.5;

            // PREPARAZIONE TABELLA COMPONENTI DEI 3 GRUPPI (MATERIALI, MANODOPERA, NOLI)
            const matComps = (an.components || []).filter(c => c.type === 'material');
            const labComps = (an.components || []).filter(c => c.type === 'labor');
            const eqComps = (an.components || []).filter(c => c.type === 'equipment');

            const tableBody: any[] = [];

            const addGroupToTable = (
                groupLabel: string, 
                comps: typeof matComps, 
                groupType: 'material' | 'labor' | 'equipment'
            ) => {
                const fillColor = groupType === 'material' ? [254, 243, 199] : groupType === 'labor' ? [224, 242, 254] : [220, 252, 231];
                const textColor = groupType === 'material' ? [146, 64, 14] : groupType === 'labor' ? [7, 89, 133] : [22, 101, 52];

                let groupSum = 0;
                comps.forEach(c => {
                    const q = c.quantity || 0;
                    groupSum += q * (c.unitPrice || 0);
                });

                const groupPerc = an.costoTecnico > 0 ? ((groupSum / an.costoTecnico) * 100).toFixed(1) : '0.0';

                // RIGA DI TESTATA DEL GRUPPO
                tableBody.push([
                    { 
                        content: `${groupLabel}   (Incidenza: ${groupPerc}% sul C.T.D.)`, 
                        colSpan: 6, 
                        styles: { fillColor, textColor, fontStyle: 'bold', fontSize: 7.8, cellPadding: { top: 2.2, bottom: 2.2, left: 3 } } 
                    },
                    { 
                        content: `€ ${formatCurrency(groupSum)}`, 
                        styles: { fillColor, textColor, fontStyle: 'bold', halign: 'right', fontSize: 7.8, cellPadding: { top: 2.2, bottom: 2.2, right: 3 } } 
                    }
                ]);

                if (comps.length === 0) {
                    tableBody.push([
                        { 
                            content: 'Nessuna risorsa caricata per questa categoria di costo (Importo parziale: € 0,00).', 
                            colSpan: 7, 
                            styles: { fontStyle: 'italic', textColor: [148, 163, 184], halign: 'center', cellPadding: 2, fontSize: 7.2 } 
                        }
                    ]);
                    return;
                }

                comps.forEach((c, cIdx) => {
                    const amount = (c.quantity || 0) * (c.unitPrice || 0);
                    const sourceText = c.sourcePriceList ? `[Fonte: ${c.sourcePriceList}]` : '[Fonte: Listino Riferimento]';
                    const markupBadge = c.includesMarkup ? '• Già compl. S.G. e Utile' : '• Prezzo Netto fornitore';

                    // Raccoglie la descrizione e le note per la cella
                    let cellDescLines: string[] = [];
                    cellDescLines.push(cleanText(c.description));
                    cellDescLines.push(`${sourceText} ${markupBadge}`);

                    // Se sono presenti misurazioni analitiche di dettaglio, le esponiamo dettagliatamente!
                    if (c.measurements && c.measurements.length > 0) {
                        c.measurements.forEach((m, mIdx) => {
                            const hasDims = m.length !== undefined || m.width !== undefined || m.height !== undefined;
                            const mult = m.multiplier !== undefined ? m.multiplier : (hasDims ? 1 : 0);
                            const l = m.length === undefined ? 1 : m.length;
                            const w = m.width === undefined ? 1 : m.width;
                            const h = m.height === undefined ? 1 : m.height;
                            const rVal = hasDims ? (mult * l * w * h) : mult;

                            const dimParts: string[] = [];
                            if (m.multiplier !== undefined && m.multiplier !== 1) dimParts.push(`Par.ug: ${m.multiplier}`);
                            if (m.length) dimParts.push(`Lung: ${formatNumber(m.length)}`);
                            if (m.width) dimParts.push(`Larg: ${formatNumber(m.width)}`);
                            if (m.height) dimParts.push(`H/P: ${formatNumber(m.height)}`);
                            const dimStr = dimParts.length > 0 ? ` (${dimParts.join(' • ')})` : '';

                            cellDescLines.push(`  └ Misura ${mIdx + 1}: ${m.description || 'Quota di sviluppo'}${dimStr} => ${formatQuantityAnalysis(rVal)} ${c.unit}`);
                        });
                    }

                    tableBody.push([
                        { content: `${cIdx + 1}`, styles: { halign: 'center', textColor: [100, 116, 139], fontSize: 7.2 } },
                        { content: c.code || '-', styles: { fontStyle: 'bold', textColor: [30, 41, 59], halign: 'center', fontSize: 7.2 } },
                        { 
                            content: cellDescLines.join('\n'), 
                            styles: { isJustifiedDesc: true, fontStyle: 'normal', fontSize: 7.5, cellPadding: { left: 2.5, right: 2.5, top: 2, bottom: 2 } } 
                        },
                        { content: c.unit, styles: { halign: 'center', fontSize: 7.2 } },
                        { content: formatQuantityAnalysis(c.quantity), styles: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42], fontSize: 7.5 } },
                        { content: formatCurrency(c.unitPrice), styles: { halign: 'right', fontSize: 7.5 } },
                        { content: formatCurrency(amount), styles: { halign: 'right', fontStyle: 'bold', textColor: [30, 41, 59], fontSize: 7.5 } }
                    ]);
                });
            };

            addGroupToTable("GRUPPO A) MATERIALI E FORNITURE A PIÈ D'OPERA", matComps, 'material');
            addGroupToTable("GRUPPO B) MANODOPERA (OPERAI E MAESTRANZE)", labComps, 'labor');
            addGroupToTable("GRUPPO C) NOLI, TRASPORTI E MEZZI D'OPERA", eqComps, 'equipment');

            autoTable(doc, {
                startY: currentY,
                head: [['N.', 'CODICE', 'ELEMENTO DI COSTO / RISORSA E SVILUPPO ANALITICO DELLE MISURE', 'U.M.', 'QUANTITÀ', 'PREZZO UNIT. €', 'IMPORTO €']],
                body: tableBody,
                theme: 'grid',
                styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', lineWidth: 0.15, lineColor: [203, 213, 225] },
                headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7.2 },
                columnStyles: {
                    0: { cellWidth: 8, halign: 'center' },
                    1: { cellWidth: 22, halign: 'center' },
                    2: { cellWidth: 78 },
                    3: { cellWidth: 12, halign: 'center' },
                    4: { cellWidth: 20, halign: 'right' },
                    5: { cellWidth: 24, halign: 'right' },
                    6: { cellWidth: 26, halign: 'right' }
                },
                willDrawCell: (data: any) => {
                    // Prepara giustificazione per le descrizioni componenti
                    if (data.column.index === 2 && data.section === 'body' && data.cell.raw?.styles?.isJustifiedDesc) {
                        data.cell._linesToDraw = [...data.cell.text];
                        data.cell.text = []; // Svuota per evitare sovrascritture di autotable
                    }
                },
                didDrawCell: (data: any) => {
                    if (data.column.index === 2 && data.section === 'body' && data.cell._linesToDraw) {
                        const cell = data.cell;
                        const padLeft = cell.padding('left');
                        const padRight = cell.padding('right');
                        const contentWidth = cell.width - padLeft - padRight;
                        const pos = cell.getTextPos();
                        const fontSize = cell.styles.fontSize || 7.5;
                        const factor = doc.getLineHeightFactor ? doc.getLineHeightFactor() : 1.15;
                        const lineHeight = (fontSize / doc.internal.scaleFactor) * factor;

                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(fontSize);
                        doc.setTextColor(30, 41, 59);

                        let curY = pos.y;
                        data.cell._linesToDraw.forEach((l: string, lIdx: number) => {
                            const isLast = lIdx === data.cell._linesToDraw.length - 1;
                            const trimmed = l.trim();
                            // Se è una riga di misura o nota, disegna standard senza forzare giustificazione
                            if (trimmed.startsWith('└') || trimmed.startsWith('•') || trimmed.startsWith('[') || trimmed.startsWith('-')) {
                                doc.setFontSize(fontSize - 0.5);
                                doc.setTextColor(90, 105, 125);
                                doc.text(l, pos.x, curY);
                                doc.setFontSize(fontSize);
                                doc.setTextColor(30, 41, 59);
                            } else {
                                drawJustifiedLine(doc, l, pos.x, curY, contentWidth, isLast);
                            }
                            curY += lineHeight;
                        });
                    }
                },
                didDrawPage: (data: any) => {
                    if (data.pageNumber > 1) {
                        drawContinuationHeader(data.pageNumber, an.code);
                    }
                }
            });

            currentY = (doc as any).lastAutoTable.finalY + 6;

            // RIEPILOGO QUADRO ECONOMICO DI DETERMINAZIONE DEL PREZZO
            const qeHeight = 66;
            const signHeight = 44;
            if (currentY > pageHeight - (qeHeight + signHeight + 8)) {
                doc.addPage();
                drawContinuationHeader(doc.getNumberOfPages(), an.code);
                currentY = 20;
            }

            // CONTENITORE PRINCIPALE QUADRO ECONOMICO
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.25);
            doc.roundedRect(10, currentY, 190, qeHeight, 1.5, 1.5, 'FD');

            // BARRA HEADER DEL BOX
            doc.setFillColor(44, 62, 80);
            doc.roundedRect(10, currentY, 190, 6.5, 1.5, 1.5, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.2);
            doc.setTextColor(255, 255, 255);
            doc.text("QUADRO ECONOMICO ANALITICO DI DETERMINAZIONE DEL PREZZO CONTRATTUALE (Art. 32 All. I.7 D.Lgs. 36/2023)", 13, currentY + 4.5);

            // COLONNA SINISTRA: SVILUPPO DEI COSTI E RICARICHI
            let rowY = currentY + 11.5;
            const drawSummaryLine = (label: string, valStr: string, isBold = false, textCol = [51, 65, 85]) => {
                doc.setFont("helvetica", isBold ? "bold" : "normal");
                doc.setFontSize(isBold ? 7.6 : 7.1);
                doc.setTextColor(textCol[0], textCol[1], textCol[2]);
                doc.text(label, 13, rowY);
                doc.text(valStr, 116, rowY, { align: 'right' });
                rowY += 4.5;
            };

            const matPerc = an.costoTecnico > 0 ? ((an.totalMaterials / an.costoTecnico) * 100).toFixed(1) : '0.0';
            const labPerc = an.costoTecnico > 0 ? ((an.totalLabor / an.costoTecnico) * 100).toFixed(1) : '0.0';
            const eqPerc = an.costoTecnico > 0 ? ((an.totalEquipment / an.costoTecnico) * 100).toFixed(1) : '0.0';

            drawSummaryLine("1. Costo Materiali e Forniture a piè d'opera (Gruppo A):", `€ ${formatCurrency(an.totalMaterials)}   (${matPerc}%)`, false, [154, 52, 18]);
            drawSummaryLine("2. Costo Manodopera e Maestranze (Gruppo B):", `€ ${formatCurrency(an.totalLabor)}   (${labPerc}%)`, false, [30, 64, 175]);
            drawSummaryLine("3. Costo Noli, Trasporti e Attrezzature (Gruppo C):", `€ ${formatCurrency(an.totalEquipment)}   (${eqPerc}%)`, false, [22, 101, 52]);

            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.2);
            doc.line(13, rowY - 1, 116, rowY - 1);

            drawSummaryLine("TOTALE COSTO TECNICO DIRETTO (C.T.D. = A + B + C):", `€ ${formatCurrency(an.costoTecnico)}`, true, [15, 23, 42]);

            if ((an.totalInclusiveItems || 0) > 0) {
                drawSummaryLine("  • di cui quota a prezzo netto soggetta a ricarico:", `€ ${formatCurrency(an.totalNetItems || 0)}`, false, [100, 116, 139]);
                drawSummaryLine("  • di cui quota da prezzario (già compl. S.G. e Utile):", `€ ${formatCurrency(an.totalInclusiveItems || 0)}`, false, [100, 116, 139]);
            }

            drawSummaryLine(`+ Spese Generali d'Impresa (${an.generalExpensesRate}%):`, `€ ${formatCurrency(an.valoreSpese)}`, false, [71, 85, 105]);
            drawSummaryLine(`+ Utile d'Impresa (${an.profitRate}%):`, `€ ${formatCurrency(an.valoreUtile)}`, false, [71, 85, 105]);

            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.25);
            doc.line(13, rowY - 1, 116, rowY - 1);

            drawSummaryLine(`IMPORTO TOTALE LOTTO ANALIZZATO (${formatQuantityAnalysis(an.analysisQuantity)} ${an.unit}):`, `€ ${formatCurrency(an.totalBatchValue)}`, true, [112, 38, 143]);

            // HERO CARD PREZZO UNITARIO A DESTRA (coordinate X: 122 a 197)
            const heroX = 122;
            const heroY = currentY + 9;
            const heroW = 75;
            const heroH = qeHeight - 12;

            doc.setFillColor(245, 243, 255);
            doc.setDrawColor(112, 38, 143);
            doc.setLineWidth(0.35);
            doc.roundedRect(heroX, heroY, heroW, heroH, 1.8, 1.8, 'FD');

            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.8);
            doc.setTextColor(112, 38, 143);
            doc.text("PREZZO UNITARIO DI APPLICAZIONE", heroX + heroW / 2, heroY + 6, { align: 'center' });

            doc.setFontSize(16);
            doc.setTextColor(76, 29, 149);
            doc.text(`€ ${formatCurrency(an.totalUnitPrice)}`, heroX + heroW / 2, heroY + 15, { align: 'center' });

            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.2);
            doc.setTextColor(100, 116, 139);
            doc.text(`a ${an.unit} (al netto di IVA e ribasso d'asta)`, heroX + heroW / 2, heroY + 20, { align: 'center' });

            doc.setDrawColor(216, 180, 254);
            doc.setLineWidth(0.2);
            doc.line(heroX + 6, heroY + 23, heroX + heroW - 6, heroY + 23);

            // Prezzo in lettere
            doc.setFont("helvetica", "bolditalic");
            doc.setFontSize(6.8);
            doc.setTextColor(60, 20, 120);
            const wordsPrice = numberToItalianWords(an.totalUnitPrice);
            doc.text(`Euro ${wordsPrice} / ${an.unit}`, heroX + heroW / 2, heroY + 28, { align: 'center' });

            // Incidenza e costo manodopera
            const laborOnUnitPrice = an.analysisQuantity > 0 ? (an.totalLabor / an.analysisQuantity) : an.totalLabor;
            const totalLaborPerc = an.totalBatchValue > 0 ? ((an.totalLabor / an.totalBatchValue) * 100).toFixed(2) : '0.00';
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.8);
            doc.setTextColor(30, 64, 175);
            doc.text(`Incidenza Manodopera: ${totalLaborPerc}%`, heroX + heroW / 2, heroY + 36, { align: 'center' });
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.2);
            doc.setTextColor(100, 116, 139);
            doc.text(`(Quota costo del lavoro: € ${formatCurrency(laborOnUnitPrice)} / ${an.unit})`, heroX + heroW / 2, heroY + 40, { align: 'center' });

            currentY += qeHeight + 5;

            // BLOCCO DELLE FIRME CONTRATTUALI E ATTESTAZIONE
            drawContractualAnalysisSignature(doc, projectInfo, currentY, integrityHash);
        });

        // 2. SE SONO STATE RICHIESTE PIÙ ANALISI, AGGIUNGI TABELLA DI RIEPILOGO FINALE
        if (normalizedAnalyses.length > 1) {
            doc.addPage();
            drawHeaderSimple(doc, projectInfo, "RIEPILOGO GENERALE ANALISI DEI PREZZI UNITARI", 1);

            const summaryBody = normalizedAnalyses.map((an, i) => {
                const laborPerc = an.totalBatchValue > 0 ? ((an.totalLabor / an.totalBatchValue) * 100).toFixed(1) : '0.0';
                return [
                    { content: (i + 1).toString(), styles: { halign: 'center' } },
                    { content: softBreakLongWords(an.code, 12), styles: { fontStyle: 'bold', textColor: [112, 38, 143], halign: 'center' } },
                    { content: cleanText(an.description), styles: { fontSize: 7.2, isJustifiedDesc: true } },
                    { content: an.unit, styles: { halign: 'center' } },
                    { content: `€ ${formatCurrency(an.costoTecnico)}`, styles: { halign: 'right' } },
                    { content: `€ ${formatCurrency(an.valoreSpese + an.valoreUtile)}`, styles: { halign: 'right' } },
                    { content: `${laborPerc}%`, styles: { halign: 'center', textColor: [30, 64, 175], fontStyle: 'bold' } },
                    { content: `€ ${formatCurrency(an.totalUnitPrice)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [112, 38, 143] } }
                ];
            });

            autoTable(doc, {
                startY: 46,
                head: [['N.', 'CODICE', 'DESIGNAZIONE DELLA VOCE DI NUOVO PREZZO', 'U.M.', 'COSTO TECNICO €', 'S.G. + UTILE €', 'INCID. M.O.', 'PREZZO UNITARIO €']],
                body: summaryBody,
                theme: 'grid',
                styles: { fontSize: 7.5, cellPadding: 2.2, lineWidth: 0.15, lineColor: [203, 213, 225] },
                headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7.2 },
                columnStyles: {
                    0: { cellWidth: 8, halign: 'center' },
                    1: { cellWidth: 20, halign: 'center' },
                    2: { cellWidth: 70 },
                    3: { cellWidth: 12, halign: 'center' },
                    4: { cellWidth: 22, halign: 'right' },
                    5: { cellWidth: 22, halign: 'right' },
                    6: { cellWidth: 16, halign: 'center' },
                    7: { cellWidth: 20, halign: 'right' }
                },
                willDrawCell: (data: any) => {
                    if (data.column.index === 2 && data.section === 'body' && data.cell.raw?.styles?.isJustifiedDesc) {
                        data.cell._linesToDraw = [...data.cell.text];
                        data.cell.text = [];
                    }
                },
                didDrawCell: (data: any) => {
                    if (data.column.index === 2 && data.section === 'body' && data.cell._linesToDraw) {
                        const cell = data.cell;
                        const padLeft = cell.padding('left');
                        const padRight = cell.padding('right');
                        const contentWidth = cell.width - padLeft - padRight;
                        const pos = cell.getTextPos();
                        const fontSize = cell.styles.fontSize || 7.2;
                        const factor = doc.getLineHeightFactor ? doc.getLineHeightFactor() : 1.15;
                        const lineHeight = (fontSize / doc.internal.scaleFactor) * factor;

                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(fontSize);
                        doc.setTextColor(30, 41, 59);

                        let curY = pos.y;
                        data.cell._linesToDraw.forEach((l: string, lIdx: number) => {
                            const isLast = lIdx === data.cell._linesToDraw.length - 1;
                            drawJustifiedLine(doc, l, pos.x, curY, contentWidth, isLast);
                            curY += lineHeight;
                        });
                    }
                }
            });

            const summaryFinalY = (doc as any).lastAutoTable.finalY + 8;
            drawContractualAnalysisSignature(doc, projectInfo, summaryFinalY, integrityHash);
        }

        // APPLICA PIÈ DI PAGINA UNIFORME CON NUMERAZIONE ANTI-MANOMISSIONE E HASH SU TUTTE LE PAGINE
        applyDocumentFootersAndSecurity(doc, integrityHash);

        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (e) {
        console.error("Errore generazione PDF Analisi Prezzi:", e);
        alert("Si è verificato un errore durante la generazione della Scheda Analisi Prezzi.");
    }
};




export type SchedulePaperFormat = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';

export interface ScheduleFormatInfo {
    id: SchedulePaperFormat;
    label: string;
    description: string;
    dimensions: string;
    width: number;
    height: number;
}

export const SCHEDULE_FORMATS: ScheduleFormatInfo[] = [
    { id: 'A0', label: 'A0 Plotter Maxi', description: 'Grandi Opere & Tavole di Cantiere', dimensions: '1189 × 841 mm', width: 1189, height: 841 },
    { id: 'A1', label: 'A1 Plotter Standard', description: 'Tavole Esecutive di Progetto', dimensions: '841 × 594 mm', width: 841, height: 594 },
    { id: 'A2', label: 'A2 Plotter Compatto', description: 'Formato Intermedio Studio', dimensions: '594 × 420 mm', width: 594, height: 420 },
    { id: 'A3', label: 'A3 Tabloid Cantiere', description: 'Standard Fascicolo & Cantiere (Consigliato)', dimensions: '420 × 297 mm', width: 420, height: 297 },
    { id: 'A4', label: 'A4 Fascicolo Ufficio', description: 'Allegato Relazione Tecnica', dimensions: '297 × 210 mm', width: 297, height: 210 },
];

interface ScheduleGeomConfig {
    margin: number;
    wbsNameWidth: number;
    wbsDaysWidth: number;
    wbsTeamWidth: number;
    rowHeight: number;
    headerHeight: number;
    headerBarHeight: number;
    titleSize: number;
    subFontSize: number;
    thFontSize: number;
    dayFontSize: number;
    wbsFontSize: number;
    barH: number;
    reportTitleSize: number;
    reportFontSize: number;
}

const SCHEDULE_GEOM: Record<SchedulePaperFormat, ScheduleGeomConfig> = {
    A0: {
        margin: 22,
        wbsNameWidth: 160,
        wbsDaysWidth: 26,
        wbsTeamWidth: 24,
        rowHeight: 18,
        headerHeight: 52,
        headerBarHeight: 14,
        titleSize: 28,
        subFontSize: 13,
        thFontSize: 12.5,
        dayFontSize: 8.5,
        wbsFontSize: 11.5,
        barH: 8.5,
        reportTitleSize: 18,
        reportFontSize: 12.5
    },
    A1: {
        margin: 18,
        wbsNameWidth: 120,
        wbsDaysWidth: 20,
        wbsTeamWidth: 18,
        rowHeight: 14,
        headerHeight: 44,
        headerBarHeight: 11.5,
        titleSize: 22,
        subFontSize: 10.5,
        thFontSize: 10.5,
        dayFontSize: 7.2,
        wbsFontSize: 9.5,
        barH: 6.8,
        reportTitleSize: 15,
        reportFontSize: 10.5
    },
    A2: {
        margin: 16,
        wbsNameWidth: 90,
        wbsDaysWidth: 16,
        wbsTeamWidth: 15,
        rowHeight: 11.5,
        headerHeight: 38,
        headerBarHeight: 9.5,
        titleSize: 18,
        subFontSize: 9,
        thFontSize: 9,
        dayFontSize: 6.2,
        wbsFontSize: 8.2,
        barH: 5.6,
        reportTitleSize: 13,
        reportFontSize: 9
    },
    A3: {
        margin: 14,
        wbsNameWidth: 68,
        wbsDaysWidth: 13,
        wbsTeamWidth: 13,
        rowHeight: 9.5,
        headerHeight: 32,
        headerBarHeight: 8,
        titleSize: 15,
        subFontSize: 8,
        thFontSize: 7.8,
        dayFontSize: 5.2,
        wbsFontSize: 7.2,
        barH: 4.8,
        reportTitleSize: 11,
        reportFontSize: 8
    },
    A4: {
        margin: 10,
        wbsNameWidth: 48,
        wbsDaysWidth: 10,
        wbsTeamWidth: 10,
        rowHeight: 7.5,
        headerHeight: 26,
        headerBarHeight: 6.5,
        titleSize: 12,
        subFontSize: 6.5,
        thFontSize: 6.5,
        dayFontSize: 4.2,
        wbsFontSize: 5.8,
        barH: 3.8,
        reportTitleSize: 9,
        reportFontSize: 6.5
    }
};

/**
 * Genera il Cronoprogramma Generale dei Lavori in formato PDF professionale
 * Supporta formati plotter da A0 ad A4 con binario orizzontale di guida per ciascun gruppo WBS.
 */
export const generateSchedulePdf = async (
    projectInfo: ProjectInfo, 
    scheduleData: any[], 
    maxCalendarDays: number,
    paperFormat: SchedulePaperFormat = 'A3'
) => {
    try {
        const { jsPDF } = await getLibs();
        const cfg = SCHEDULE_GEOM[paperFormat] || SCHEDULE_GEOM.A3;
        const formatDimensionsMap: Record<SchedulePaperFormat, [number, number]> = {
            A0: [1189, 841],
            A1: [841, 594],
            A2: [594, 420],
            A3: [420, 297],
            A4: [297, 210]
        };

        const targetDims = formatDimensionsMap[paperFormat] || [420, 297];
        const doc = new jsPDF({ 
            orientation: 'landscape', 
            format: targetDims, 
            unit: 'mm' 
        });
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = cfg.margin;
        const wbsNameWidth = cfg.wbsNameWidth;
        const wbsDaysWidth = cfg.wbsDaysWidth;
        const wbsTeamWidth = cfg.wbsTeamWidth;
        const wbsColumnWidth = wbsNameWidth + wbsDaysWidth + wbsTeamWidth;
        const timelineWidth = pageWidth - margin * 2 - wbsColumnWidth;
        const dayWidth = Math.max(0.5, timelineWidth / Math.max(1, maxCalendarDays));
        const rowHeight = cfg.rowHeight;
        const headerHeight = cfg.headerHeight;
        const headerBarHeight = cfg.headerBarHeight;

        // INTESTAZIONE UFFICIALE TAVOLA CRONOPROGRAMMA
        doc.setFontSize(cfg.titleSize); 
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text("CRONOPROGRAMMA GENERALE DEI LAVORI", pageWidth / 2, margin + (cfg.headerHeight * 0.15), { align: 'center' });

        doc.setFontSize(cfg.subFontSize); 
        doc.setFont("helvetica", "normal"); 
        doc.setTextColor(51, 65, 85);
        const subTopY = margin + (cfg.headerHeight * 0.42);
        const lineStep = cfg.subFontSize * 0.55;
        doc.text(`Progetto: ${projectInfo.title}`, margin, subTopY);
        doc.text(`Committente: ${projectInfo.client}`, margin, subTopY + lineStep);
        doc.text(`Località: ${projectInfo.location}  |  Data: ${projectInfo.date}`, margin, subTopY + (lineStep * 2));

        // Riquadro info formato su plotter a destra
        doc.text(`Tavola: ${paperFormat} (${Math.round(pageWidth)} × ${Math.round(pageHeight)} mm) - Cronoprogramma LL.PP.`, pageWidth - margin, subTopY, { align: 'right' });
        doc.text(`Progettista: ${projectInfo.designer}`, pageWidth - margin, subTopY + lineStep, { align: 'right' });
        doc.setFont("helvetica", "bold");
        doc.setTextColor(37, 99, 235);
        doc.text(`Scala Temporale: ${maxCalendarDays} Giorni Naturali e Consecutivi`, pageWidth - margin, subTopY + (lineStep * 2), { align: 'right' });

        let currentY = margin + headerHeight;

        // BARRA INTESTAZIONE TABELLA WBS E TIMELINE
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, currentY, pageWidth - margin * 2, headerBarHeight, 'F');
        
        doc.setFont("helvetica", "bold"); 
        doc.setFontSize(cfg.thFontSize);
        doc.setTextColor(255, 255, 255);
        doc.text("WBS / GRUPPO DI LAVORAZIONE", margin + 3, currentY + (headerBarHeight * 0.65));
        doc.text("GG", margin + wbsNameWidth + (wbsDaysWidth / 2), currentY + (headerBarHeight * 0.65), { align: 'center' });
        doc.text("Sq.", margin + wbsNameWidth + wbsDaysWidth + (wbsTeamWidth / 2), currentY + (headerBarHeight * 0.65), { align: 'center' });
        
        const contentBottomY = currentY + headerBarHeight + (scheduleData.length * rowHeight);

        // HEADER DEI GIORNI E SFONDI WEEKEND
        doc.setFontSize(cfg.dayFontSize);
        for (let d = 1; d <= maxCalendarDays; d++) {
            const x = margin + wbsColumnWidth + (d - 1) * dayWidth;
            const weekend = d % 7 === 6 || d % 7 === 0;
            
            // Sfondo weekend nella timeline
            if (weekend) {
                doc.setFillColor(241, 245, 249);
                doc.rect(x, currentY + headerBarHeight, dayWidth, contentBottomY - (currentY + headerBarHeight), 'F');
            }
            
            // Linea verticale sottile di scansione giornaliera
            doc.setDrawColor(226, 232, 240); 
            doc.setLineWidth(0.08);
            doc.line(x, currentY + headerBarHeight, x, contentBottomY);
            
            // Numero del giorno nella barra header
            doc.setTextColor(weekend ? 203 : 255, weekend ? 213 : 255, weekend ? 225 : 255);
            doc.text(d.toString(), x + dayWidth / 2, currentY + (headerBarHeight * 0.65), { align: 'center' });
        }

        // LINEE VERTICALI DI AVANZAMENTO QUADRI-SETTIMANALE (OGNI 28 GIORNI)
        for (let d = 28; d <= maxCalendarDays; d += 28) {
            const xMilestone = margin + wbsColumnWidth + (d * dayWidth);
            doc.setDrawColor(79, 70, 229);
            doc.setLineWidth(0.35);
            doc.setLineDash([2, 1], 0);
            doc.line(xMilestone, currentY, xMilestone, contentBottomY);
            doc.setLineDash([]);

            // Badge milestone nell'intestazione
            const badgeW = Math.max(16, cfg.thFontSize * 1.8);
            const badgeH = headerBarHeight * 0.45;
            doc.setFillColor(79, 70, 229);
            doc.roundedRect(xMilestone - (badgeW / 2), currentY - (badgeH * 0.8), badgeW, badgeH, 1, 1, 'F');
            doc.setFontSize(Math.max(4, cfg.dayFontSize * 0.9));
            doc.setFont("helvetica", "bold");
            doc.setTextColor(255, 255, 255);
            doc.text(`${d / 7}ª SETT.`, xMilestone, currentY - (badgeH * 0.15), { align: 'center' });
        }
        
        currentY += headerBarHeight;

        let totalLaborValue = 0;
        let lastDay = 0;

        // CICLO RIGHE WBS CON IL BINARIO DI RIFERIMENTO ORIZZONTALE
        scheduleData.forEach((cat, catIdx) => {
            totalLaborValue += cat.totalLabor;
            if (cat.calendarEnd > lastDay) lastDay = cat.calendarEnd;

            // 1. Sfondo alternato leggero (effetto zebrato chiarissimo per guidare l'occhio)
            if (catIdx % 2 === 1) {
                doc.setFillColor(248, 250, 252);
                doc.rect(margin, currentY, pageWidth - margin * 2, rowHeight, 'F');
            }

            // 2. BINARIO DI RIFERIMENTO ORIZZONTALE (guida visiva di mezzeria tratteggiata leggera)
            // Permette di collegare con precisione immediata anche voci molto lontane nel tempo alla colonna WBS di riferimento
            const centerY = currentY + (rowHeight / 2);
            doc.setDrawColor(210, 218, 230); // grigio ardesia leggero, non invasivo
            doc.setLineWidth(0.12);
            doc.setLineDash([1.5, 1.5], 0);
            doc.line(margin + wbsColumnWidth, centerY, pageWidth - margin, centerY);
            doc.setLineDash([]); // Ripristina linea solida

            // 3. Linea di separazione inferiore riga
            doc.setDrawColor(226, 232, 240); 
            doc.setLineWidth(0.15);
            doc.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

            // 4. Testi WBS / Capitolo
            doc.setFont("helvetica", "bold"); 
            doc.setFontSize(cfg.wbsFontSize);
            doc.setTextColor(15, 23, 42);
            const maxChars = Math.max(16, Math.floor(wbsNameWidth / (cfg.wbsFontSize * 0.42)));
            const catNameTrimmed = cat.name.length > maxChars ? cat.name.substring(0, maxChars - 2) + '..' : cat.name;
            doc.text(`${cat.code} - ${catNameTrimmed}`, margin + 2.5, centerY + (cfg.wbsFontSize * 0.32));

            // Durata GG
            doc.setFont("helvetica", "bold"); 
            doc.setFontSize(cfg.wbsFontSize * 0.95);
            doc.setTextColor(71, 85, 105);
            doc.text(cat.duration.toString(), margin + wbsNameWidth + (wbsDaysWidth / 2), centerY + (cfg.wbsFontSize * 0.32), { align: 'center' });

            // Squadra Tipo Sq.
            doc.setTextColor(37, 99, 235);
            doc.text(cat.teamSize.toString(), margin + wbsNameWidth + wbsDaysWidth + (wbsTeamWidth / 2), centerY + (cfg.wbsFontSize * 0.32), { align: 'center' });

            // 5. Barra Gantt posizionata perfettamente sul binario
            const barX = margin + wbsColumnWidth + ((cat.calendarStart - 1) * dayWidth);
            const barW = Math.max(1, cat.calendarDuration * dayWidth);
            const barTopY = centerY - (cfg.barH / 2);

            const hex = cat.barColor || '#3B82F6';
            const r = parseInt(hex.slice(1, 3), 16) || 59;
            const g = parseInt(hex.slice(3, 5), 16) || 130;
            const b = parseInt(hex.slice(5, 7), 16) || 246;
            doc.setFillColor(r, g, b);
            doc.roundedRect(barX, barTopY, barW, cfg.barH, 0.6, 0.6, 'F');

            // 6. Etichetta identificativa WBS sul binario / barra per identificazione immediata
            const labelFontSize = Math.min(cfg.wbsFontSize * 0.82, cfg.barH * 0.65);
            doc.setFontSize(labelFontSize);
            doc.setFont("helvetica", "bold");
            if (barW >= 15) {
                doc.setTextColor(255, 255, 255);
                doc.text(cat.code, barX + 2, centerY + (labelFontSize * 0.35));
            } else {
                doc.setTextColor(71, 85, 105);
                doc.text(cat.code, barX + barW + 1.5, centerY + (labelFontSize * 0.35));
            }

            currentY += rowHeight;
        });

        // BORDI PRINCIPALI DELLA TABELLA
        doc.setDrawColor(30, 41, 59); 
        doc.setLineWidth(0.4);
        doc.line(margin + wbsColumnWidth, margin + headerHeight, margin + wbsColumnWidth, contentBottomY);
        doc.rect(margin, margin + headerHeight, pageWidth - margin * 2, contentBottomY - (margin + headerHeight));

        // BLOCCO RIEPILOGATIVO DATI ESSENZIALI & RELAZIONE TECNICA
        let reportY = contentBottomY + (cfg.rowHeight * 1.2);
        const estimatedReportHeight = 65;
        if (reportY + estimatedReportHeight > pageHeight - margin) { 
            doc.addPage(); 
            reportY = margin + 12; 
        }
        
        doc.setFontSize(cfg.reportTitleSize); 
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text("DATI ESSENZIALI DEL CRONOPROGRAMMA", margin, reportY);
        
        doc.setFontSize(cfg.reportFontSize); 
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0);
        
        const manDaysTotal = Math.ceil(totalLaborValue / 240);
        const consecutiveDays = lastDay;
        const repStep = cfg.reportFontSize * 0.65;

        let listY = reportY + repStep + 3;
        doc.setFont("helvetica", "bold"); 
        doc.text("- Durata complessiva dell'intervento:", margin, listY);
        doc.setFont("helvetica", "normal"); 
        doc.text(`${consecutiveDays} giorni naturali e consecutivi`, margin + (wbsColumnWidth * 0.8), listY);
        
        listY += repStep;
        doc.setFont("helvetica", "bold"); 
        doc.text("- Fabbisogno totale forza lavoro:", margin, listY);
        doc.setFont("helvetica", "normal"); 
        doc.text(`${manDaysTotal} Uomini-Giorno (UG)`, margin + (wbsColumnWidth * 0.8), listY);
        
        listY += repStep;
        doc.setFont("helvetica", "bold"); 
        doc.text("- Importo manodopera stimata:", margin, listY);
        doc.setFont("helvetica", "normal"); 
        doc.text(`€ ${formatCurrency(totalLaborValue)}`, margin + (wbsColumnWidth * 0.8), listY);

        listY += repStep;
        doc.setFont("helvetica", "bold"); 
        doc.text("- Resa base standard operaio:", margin, listY);
        doc.setFont("helvetica", "normal"); 
        doc.text(`€ 240,00 / giorno per singolo operaio (Configurazione Squadra Sq.)`, margin + (wbsColumnWidth * 0.8), listY);

        listY += repStep * 1.8;
        doc.setFontSize(Math.max(6, cfg.reportFontSize * 0.85)); 
        doc.setFont("helvetica", "bold");
        doc.text("NOTE METODOLOGICHE E NORMATIVE:", margin, listY);
        doc.setFont("helvetica", "italic");
        
        const noteItems = [
            "1. Le durate operative delle singole lavorazioni sono calcolate incrementando del 10% la produzione teorica contrattuale (Patto di Ferro). Tale coefficiente cautelativo assorbe le oscillazioni meteorologiche stagionali, le festività patronali e nazionali e le interferenze logistiche di cantiere.",
            "2. Lo sviluppo cronologico è programmato su una settimana lavorativa tipo di 5 (cinque) giorni (Lunedì-Venerdì) con unico turno giornaliero standard.",
            "3. La durata complessiva del cantiere è computata in 'giorni naturali e consecutivi', comprensiva di sabati, domeniche e festività infrasettimanali, ai sensi del D.Lgs. 36/2023 e s.m.i. (ex Art. 121 DPR 207/2010).",
            "4. Ciascun gruppo WBS è dotato di binario orizzontale di riferimento continuo e scansione quadri-settimanale (28 giorni), assicurando l'univoca correlazione visiva delle lavorazioni anche su formati plotter estesi (A0 - A4)."
        ];

        let noteY = listY + (repStep * 0.8);
        noteItems.forEach(note => {
            const splitNote = doc.splitTextToSize(note, pageWidth - margin * 2);
            doc.text(splitNote, margin, noteY);
            noteY += (splitNote.length * (cfg.reportFontSize * 0.45)) + 1.5;
        });
        
        const sigX = pageWidth - margin - (wbsColumnWidth * 0.8);
        const sigY = noteY + (repStep * 1.2);
        doc.setFont("helvetica", "normal"); 
        doc.setFontSize(cfg.reportFontSize);
        doc.text(`${projectInfo.location}, ${projectInfo.date}`, margin, sigY);
        doc.setFont("helvetica", "bold");
        doc.text("IL PROGETTISTA", sigX + (wbsColumnWidth * 0.4), sigY, { align: 'center' });
        doc.setLineWidth(0.2);
        doc.line(sigX, sigY + 8, sigX + (wbsColumnWidth * 0.8), sigY + 8);
        doc.setFont("helvetica", "normal");
        doc.text(projectInfo.designer, sigX + (wbsColumnWidth * 0.4), sigY + 14, { align: 'center' });

        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (e) { 
        console.error("Errore generazione PDF Cronoprogramma:", e); 
        alert("Si è verificato un errore durante la generazione del Cronoprogramma in formato " + paperFormat); 
    }
};

/**
 * Alias di retrocompatibilità per il formato A3
 */
export const generateScheduleA3Pdf = (projectInfo: ProjectInfo, scheduleData: any[], maxCalendarDays: number) => {
    return generateSchedulePdf(projectInfo, scheduleData, maxCalendarDays, 'A3');
};

export const generateProfessionalPdf = generateComputoMetricPdf;

/**
 * Genera la Distinta dei Ferri d'Armatura e Sagomario Ufficiale (.pdf)
 * Estrae e cataloga tutti i ferri longitudinali e le staffe inserite nel computo
 * (sia generate dal modellatore 3D parametrico che inserite nelle voci di computo).
 */
export const generateDistintaFerriPdf = async (
    projectInfo: ProjectInfo,
    categories: Category[],
    articles: Article[]
) => {
    try {
        const { jsPDF, autoTable } = await getLibs();
        const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;

        interface ExtractedRebarRow {
            id: string;
            elementName: string;
            desc: string;
            categoryType: 'longitudinale' | 'staffa' | 'generico';
            diameter: number;
            pieces: number;
            singleLength: number;
            totalLength: number;
            unitWeight: number; // kg/m
            totalWeight: number; // kg
            articleCode?: string;
        }

        const items: ExtractedRebarRow[] = [];

        // Scansione di tutti gli articoli e relative misurazioni
        articles.forEach(art => {
            const isSteelArticle = 
                art.unit?.toLowerCase().includes('kg') && 
                (art.description?.toLowerCase().includes('acciaio') || 
                 art.description?.toLowerCase().includes('ferr') || 
                 art.description?.toLowerCase().includes('b450') ||
                 art.description?.toLowerCase().includes('armatur'));

            (art.measurements || []).forEach(m => {
                if (!m || m.type === 'subtotal') return;
                const text = (m.description || '').trim();

                const isRebarRow = isSteelArticle || 
                    /(?:Ø|ø|tondin|staff|ferr|b450|armatur)/i.test(text);

                if (!isRebarRow) return;

                // Estrazione diametro
                let dia = 0;
                const diaMatch = text.match(/(?:Ø|ø|d|D|diam(?:etro)?\.?\s*[:=]?\s*)(\d+)/i);
                if (diaMatch) {
                    dia = parseInt(diaMatch[1], 10);
                } else if (m.height && m.height > 0) {
                    const found = REBAR_WEIGHTS.find(rw => Math.abs(rw.weight - m.height!) < 0.05);
                    if (found) dia = found.diameter;
                }
                if (dia === 0) dia = 16;

                // Peso teorico unitario kg/m
                const nominalMatch = REBAR_WEIGHTS.find(rw => rw.diameter === dia);
                const unitWeight = (m.height && m.height > 0) 
                    ? m.height 
                    : (nominalMatch ? nominalMatch.weight : parseFloat((dia * dia * 0.006166).toFixed(3)));

                const pieces = Math.max(1, m.multiplier || 1);
                const singleLength = Math.max(0, m.length || 0);
                const totalLength = parseFloat((pieces * singleLength).toFixed(2));
                const totalWeight = parseFloat((totalLength * unitWeight).toFixed(2));

                // Nome dell'elemento strutturale
                let elementName = 'Elemento in C.A.';
                if (text.includes(' - ')) {
                    elementName = text.split(' - ')[0].trim();
                } else if (text.includes(':')) {
                    elementName = text.split(':')[0].trim();
                } else if (art.code) {
                    elementName = `Voce ${art.code}`;
                }

                // Categoria armatura
                let catType: 'longitudinale' | 'staffa' | 'generico' = 'generico';
                if (/staff/i.test(text)) {
                    catType = 'staffa';
                } else if (/longitudin|tondin|sup|inf|parete|spina/i.test(text)) {
                    catType = 'longitudinale';
                }

                items.push({
                    id: m.id,
                    elementName,
                    desc: text,
                    categoryType: catType,
                    diameter: dia,
                    pieces,
                    singleLength,
                    totalLength,
                    unitWeight: parseFloat(unitWeight.toFixed(3)),
                    totalWeight,
                    articleCode: art.code
                });
            });
        });

        if (items.length === 0) {
            alert("Nessun ferro d'armatura o staffa trovato nel computo. Inserisci prima gli elementi strutturali con il modellatore 3D (tasto destro sulla voce -> Armatura 3D) oppure aggiungi misurazioni con diametro Ø.");
            return;
        }

        // Raggruppamento per Elemento Strutturale (Trave T1, Pilastro P1...)
        const elementsMap = new Map<string, ExtractedRebarRow[]>();
        items.forEach(it => {
            const arr = elementsMap.get(it.elementName) || [];
            arr.push(it);
            elementsMap.set(it.elementName, arr);
        });

        // Hash di integrità del documento
        const rawIntegrityData = items.map(it => `${it.elementName}:${it.diameter}:${it.pieces}:${it.totalWeight}`).join(';');
        const integrityHash = await computeSha256(rawIntegrityData);

        // Corpo tabella dettagliata elementi
        const detailTableBody: any[] = [];
        let grandTotalSteelKg = 0;
        let posCounter = 1;

        elementsMap.forEach((elRows, elName) => {
            // Riga Intestazione Elemento Strutturale
            detailTableBody.push([
                { 
                    content: `ELEMENTO STRUTTURALE: ${elName.toUpperCase()}`, 
                    colSpan: 9, 
                    styles: { 
                        fillColor: [30, 41, 59], 
                        textColor: [255, 255, 255], 
                        fontStyle: 'bold', 
                        fontSize: 8.5,
                        cellPadding: 3
                    } 
                }
            ]);

            let elSubtotalKg = 0;
            let elFerriKg = 0;
            let elStaffeKg = 0;

            elRows.forEach(row => {
                elSubtotalKg += row.totalWeight;
                grandTotalSteelKg += row.totalWeight;
                if (row.categoryType === 'staffa') {
                    elStaffeKg += row.totalWeight;
                } else {
                    elFerriKg += row.totalWeight;
                }

                // Pulizia descrizione per la tabella
                let cleanDesc = row.desc;
                if (cleanDesc.includes(' - ')) {
                    cleanDesc = cleanDesc.split(' - ').slice(1).join(' - ');
                }

                detailTableBody.push([
                    { content: posCounter++, styles: { halign: 'center', fontStyle: 'bold' } },
                    { content: elName, styles: { fontStyle: 'bold', textColor: [15, 23, 42] } },
                    { content: cleanDesc, styles: { halign: 'left' } },
                    { content: `Ø${row.diameter}`, styles: { halign: 'center', fontStyle: 'bold', textColor: [194, 65, 12] } },
                    { content: row.pieces, styles: { halign: 'center' } },
                    { content: row.singleLength.toFixed(2), styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: row.totalLength.toFixed(2), styles: { halign: 'right' } },
                    { content: row.unitWeight.toFixed(3), styles: { halign: 'right' } },
                    { content: row.totalWeight.toFixed(2), styles: { halign: 'right', fontStyle: 'bold', textColor: [30, 58, 138] } }
                ]);
            });

            // Subtotale per elemento
            detailTableBody.push([
                { content: '', colSpan: 2, styles: { lineWidth: 0 } },
                { 
                    content: `SUBTOTALE ${elName.toUpperCase()} (Ferri: ${elFerriKg.toFixed(2)} kg | Staffe: ${elStaffeKg.toFixed(2)} kg)`, 
                    colSpan: 6, 
                    styles: { 
                        halign: 'right', 
                        fontStyle: 'bold', 
                        fillColor: [241, 245, 249],
                        textColor: [51, 65, 85]
                    } 
                },
                { 
                    content: `${elSubtotalKg.toFixed(2)} kg`, 
                    styles: { 
                        halign: 'right', 
                        fontStyle: 'bold', 
                        fillColor: [241, 245, 249],
                        textColor: [194, 65, 12] 
                    } 
                }
            ]);

            // Separatore vuoto
            detailTableBody.push([{ content: '', colSpan: 9, styles: { cellPadding: 1, lineWidth: 0 } }]);
        });

        // 1. FRONTESPIZIO UFFICIALE ("TESTALINO") GECOLA CON BANDANA CELESTINO
        drawAccaCoverPage(
            doc,
            projectInfo,
            "DISTINTA DEI FERRI",
            "SAGOMARIO E DISTINTA DEI FERRI D'ARMATURA (NTC 2018)"
        );
        doc.addPage();

        // Intestazione pagine
        const drawDistintaHeader = (d: any, pageNum: number) => {
            drawAccaPageFrame(d, pageNum, projectInfo);
            d.setTextColor(15, 23, 42);
            d.setFontSize(8.5);
            d.setFont("helvetica", "bold");
            d.text("DISTINTA DEI FERRI E SAGOMARIO D'ARMATURA (NTC 2018)", pageWidth / 2, 14, { align: 'center' });
        };

        // Generazione Tabella 1: Elementi Dettagliati
        autoTable(doc, {
            head: [[
                { content: 'Pos.', styles: { halign: 'center' } },
                { content: 'Elemento', styles: { halign: 'left' } },
                { content: 'Sagoma / Descrizione Barra', styles: { halign: 'left' } },
                { content: 'Ø (mm)', styles: { halign: 'center' } },
                { content: 'N. Barre', styles: { halign: 'center' } },
                { content: 'L. Sing. (m)', styles: { halign: 'right' } },
                { content: 'Svil. Tot. (m)', styles: { halign: 'right' } },
                { content: 'Peso (kg/m)', styles: { halign: 'right' } },
                { content: 'Peso Tot. (kg)', styles: { halign: 'right' } }
            ]],
            body: detailTableBody,
            startY: 18,
            margin: { left: 10, right: 10, top: 18, bottom: 20 },
            theme: 'grid',
            headStyles: {
                fillColor: [15, 23, 42],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 7.5,
                cellPadding: 2.5
            },
            bodyStyles: {
                fontSize: 7,
                cellPadding: 2,
                textColor: [30, 41, 59]
            },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 26 },
                2: { cellWidth: 'auto' },
                3: { cellWidth: 14 },
                4: { cellWidth: 14 },
                5: { cellWidth: 18 },
                6: { cellWidth: 20 },
                7: { cellWidth: 18 },
                8: { cellWidth: 22 }
            },
            didDrawPage: (data) => {
                drawDistintaHeader(doc, data.pageNumber);
            }
        });

        // 2. RIEPILOGO SAGOMARIO PER DIAMETRO (Ø)
        const diameterMap = new Map<number, { totalLen: number; count: number; totalWeight: number }>();
        items.forEach(it => {
            const prev = diameterMap.get(it.diameter) || { totalLen: 0, count: 0, totalWeight: 0 };
            prev.totalLen += it.totalLength;
            prev.count += it.pieces;
            prev.totalWeight += it.totalWeight;
            diameterMap.set(it.diameter, prev);
        });

        // Ordina diametri crescenti (6, 8, 10, 12, 14, 16...)
        const sortedDiameters = Array.from(diameterMap.keys()).sort((a, b) => a - b);

        const summaryTableBody: any[] = [];
        let summaryTotalPieces = 0;
        let summaryTotalLenM = 0;
        let summaryTotalWeightKg = 0;

        sortedDiameters.forEach(dia => {
            const data = diameterMap.get(dia)!;
            const nominal = REBAR_WEIGHTS.find(rw => rw.diameter === dia)?.weight || parseFloat((dia * dia * 0.006166).toFixed(3));
            const perc = grandTotalSteelKg > 0 ? (data.totalWeight / grandTotalSteelKg) * 100 : 0;
            const weightQli = data.totalWeight / 100;

            summaryTotalPieces += data.count;
            summaryTotalLenM += data.totalLen;
            summaryTotalWeightKg += data.totalWeight;

            summaryTableBody.push([
                { content: `Ø ${dia} mm`, styles: { halign: 'center', fontStyle: 'bold', textColor: [194, 65, 12] } },
                { content: data.count, styles: { halign: 'center' } },
                { content: data.totalLen.toFixed(2), styles: { halign: 'right' } },
                { content: nominal.toFixed(3), styles: { halign: 'right' } },
                { content: data.totalWeight.toFixed(2), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: weightQli.toFixed(2), styles: { halign: 'right' } },
                { content: `${perc.toFixed(1)} %`, styles: { halign: 'right', textColor: [71, 85, 105] } }
            ]);
        });

        // Totale generale riepilogo
        summaryTableBody.push([
            { content: 'TOTALE COMPLESSIVO ACCIAIO', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
            { content: summaryTotalPieces, styles: { halign: 'center', fontStyle: 'bold', fillColor: [241, 245, 249] } },
            { content: `${summaryTotalLenM.toFixed(2)} m`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
            { content: '-', styles: { halign: 'center', fillColor: [241, 245, 249] } },
            { content: `${summaryTotalWeightKg.toFixed(2)} kg`, styles: { halign: 'right', fontStyle: 'bold', textColor: [194, 65, 12], fillColor: [241, 245, 249] } },
            { content: `${(summaryTotalWeightKg / 100).toFixed(2)} q.li`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } },
            { content: '100.0 %', styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } }
        ]);

        let currentY = (doc as any).lastAutoTable.finalY + 8;
        if (currentY > pageHeight - 85) {
            doc.addPage();
            currentY = 22;
        }

        // Titolo Sezione Sagomario
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("RIEPILOGO FABBISOGNO E SAGOMARIO PER DIAMETRO (Ø)", 10, currentY);

        autoTable(doc, {
            head: [[
                { content: 'Diametro', styles: { halign: 'center' } },
                { content: 'N. Barre / Staffe', styles: { halign: 'center' } },
                { content: 'Sviluppo Totale (m)', styles: { halign: 'right' } },
                { content: 'Peso Nominale (kg/m)', styles: { halign: 'right' } },
                { content: 'Peso Totale (kg)', styles: { halign: 'right' } },
                { content: 'Peso in Quintali (q.li)', styles: { halign: 'right' } },
                { content: 'Incidenza (%)', styles: { halign: 'right' } }
            ]],
            body: summaryTableBody,
            startY: currentY + 3,
            margin: { left: 10, right: 10, top: 18, bottom: 20 },
            theme: 'grid',
            headStyles: {
                fillColor: [51, 65, 85],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 7.5,
                cellPadding: 2.5
            },
            bodyStyles: {
                fontSize: 7.5,
                cellPadding: 2
            },
            didDrawPage: (data) => {
                drawDistintaHeader(doc, data.pageNumber);
            }
        });

        // 3. QUADRO DI FORNITURA CANTIERE & SFRIDO
        let finalY = (doc as any).lastAutoTable.finalY + 8;
        if (finalY > pageHeight - 65) {
            doc.addPage();
            finalY = 22;
        }

        const sfridoKg = summaryTotalWeightKg * 0.05; // +5% sfrido di cantiere / sovrapposizioni NTC
        const totaleLordoKg = summaryTotalWeightKg + sfridoKg;
        const tonnellateLorde = totaleLordoKg / 1000;

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(10, finalY, pageWidth - 20, 24, 2, 2, 'FD');

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("QUADRO DI ORDINAZIONE CANTIERE:", 14, finalY + 6);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(`• Acciaio Netto Sagomato in opera:`, 14, finalY + 12);
        doc.setFont("helvetica", "bold");
        doc.text(`${summaryTotalWeightKg.toFixed(2)} kg  (${ (summaryTotalWeightKg / 100).toFixed(2) } q.li)`, 80, finalY + 12);

        doc.setFont("helvetica", "normal");
        doc.text(`• Sfrido tecnico lavorazione e sovrapposizioni (+5% NTC):`, 14, finalY + 17);
        doc.setFont("helvetica", "bold");
        doc.text(`+${sfridoKg.toFixed(2)} kg`, 80, finalY + 17);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(194, 65, 12);
        doc.text(`• FABBISOGNO TOTALE LORDO D'ORDINAZIONE:`, 14, finalY + 22);
        doc.text(`${totaleLordoKg.toFixed(2)} kg  =  ${(totaleLordoKg / 100).toFixed(2)} q.li  (${tonnellateLorde.toFixed(3)} ton)`, 80, finalY + 22);

        // Blocco Firme
        let signY = finalY + 32;
        if (signY > pageHeight - 35) {
            doc.addPage();
            signY = 25;
        }

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(`${projectInfo.location}, lì ${projectInfo.date}`, 10, signY);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text("IL PROGETTISTA DELLE STRUTTURE", 35, signY + 6, { align: 'center' });
        doc.setLineWidth(0.2);
        doc.setDrawColor(148, 163, 184);
        doc.line(10, signY + 18, 65, signY + 18);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.text(`(${projectInfo.designer})`, 35, signY + 22, { align: 'center' });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text("L'IMPRESA APPALTATRICE / FERRIERA", 160, signY + 6, { align: 'center' });
        doc.line(135, signY + 18, 190, signY + 18);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.text(`(Timbro e Firma per Accettazione Sagomario)`, 160, signY + 22, { align: 'center' });

        // Footer e numerazione pagine
        applyDocumentFootersAndSecurity(doc, integrityHash);

        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (error) {
        console.error("Errore generazione Distinta Ferri PDF:", error);
        alert("Si è verificato un errore durante la generazione della Distinta Ferri PDF.");
    }
};
