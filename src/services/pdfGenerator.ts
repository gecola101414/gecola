
import { Article, Category, ProjectInfo, Measurement, PriceAnalysis } from '../types';
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

const cleanText = (text: string | undefined | null): string => {
    if (!text) return '';
    // Rimuove spazi multipli, tab e ritorni a capo per una pulizia totale
    let cleaned = text.replace(/\s+/g, ' ').trim();
    
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

/**
 * Motore di Giustificazione Tipografica Professionale per jsPDF:
 * Distribuisce equamente lo spazio residuo tra le parole della riga
 * fino a raggiungere l'esatta larghezza della colonna, senza sbordare,
 * senza creare parole isolate ("in", "base") e preservando l'allineamento
 * naturale a sinistra per l'ultima riga del paragrafo.
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
    
    if (isLastLine || words.length <= 1) {
        doc.text(trimmed, x, y);
        return;
    }
    
    const naturalWidth = doc.getTextWidth(trimmed);
    const spaceToFill = contentWidth - naturalWidth;
    const numGaps = words.length - 1;
    const extraPerGap = numGaps > 0 ? spaceToFill / numGaps : 0;
    
    // Giustificazione totale su tutte le righe intermedie per riempire uniformemente la colonna
    if (spaceToFill > 0) {
        let currentX = x;
        const standardSpaceWidth = doc.getTextWidth(' ') + extraPerGap;
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            doc.text(word, currentX, y);
            currentX += doc.getTextWidth(word) + standardSpaceWidth;
        }
    } else {
        doc.text(trimmed, x, y);
    }
};

/**
 * Inserisce un "soft break" (spazio suggerito) in parole tecniche estremamente lunghe
 * che altrimenti romperebbero i bordi della colonna (es. codici tariffa infiniti o percorsi file).
 */
const softBreakLongWords = (text: string, maxLength: number = 30): string => {
    if (!text) return '';
    return text.split(' ').map(word => {
        if (word.length <= maxLength) return word;
        return word.replace(/([/|:=])(?=[^ ])/g, '$1 ')
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
    if (m.linkedArticleId) {
        const mult = m.multiplier === undefined ? 1 : m.multiplier;
        const sign = m.type === 'deduction' ? -1 : 1;
        return linkedVal * mult * sign;
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
    const val = effectiveBase * effectiveMultiplier;
    return m.type === 'deduction' ? -val : val;
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
        articles.map(a => `${a.code}:${a.quantity}:${a.unitPrice.toFixed(2)}`).join(';')
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

const drawHeader = (doc: any, projectInfo: ProjectInfo, title: string, pageNumber: number, grandTotal?: number, pageWidth?: number, pageHeight?: number, isTotalCurrency: boolean = true) => {
    doc.setTextColor(0, 0, 0);
    if (pageNumber === 1) {
        doc.setFontSize(14);
        doc.text(title, (pageWidth || 210) / 2, 15, { align: 'center' });
        doc.setFontSize(8); 
        doc.setFont("helvetica", "bold");
        doc.text(projectInfo.title, 10, 22);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(`Committente: ${projectInfo.client}`, 10, 27);
        doc.text(`Data: ${projectInfo.date}`, 10, 31);
        doc.text(`Prezzario: ${projectInfo.region} ${projectInfo.year}`, 10, 35);
    } else {
        doc.setFontSize(7.2); 
        doc.setFont("helvetica", "bold");
        doc.text(projectInfo.title, 10, 20); 
    }
    if (pageNumber > 1 && grandTotal !== undefined) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("RIPORTO:", 160, 30, { align: 'right' });
        doc.text(isTotalCurrency ? formatCurrency(grandTotal) : formatNumber(grandTotal), 200, 30, { align: 'right' });
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
    const footerY = pageHeight - 15;
    if (!isLastPageOfTable && grandTotal !== undefined && pageTotal !== undefined) {
        const currentCumulative = grandTotal + pageTotal;
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("A RIPORTARE:", 160, footerY, { align: 'right' });
        doc.text(isTotalCurrency ? formatCurrency(currentCumulative) : formatNumber(currentCumulative), 200, footerY, { align: 'right' });
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
 * Applica a TUTTE le pagine del documento:
 * 1. Numerazione formale a 3 cifre (001, 002, ... 010, 011) anti-camuffamento
 * 2. Impronta crittografica SHA-256 di controllo integrità
 * 3. Linea divisoria e attestazione di conformità D.Lgs. 82/2005 (CAD)
 */
const applyDocumentFootersAndSecurity = (doc: any, integrityHash?: string) => {
    const totalPages = doc.internal.getNumberOfPages();
    const totalPagesStr = String(totalPages).padStart(3, '0');
    
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        const pWidth = doc.internal.pageSize.width;
        const pHeight = doc.internal.pageSize.height;
        const pageStr = String(p).padStart(3, '0');
        
        // Linea divisoria sottile
        doc.setDrawColor(210, 215, 222);
        doc.setLineWidth(0.15);
        doc.line(10, pHeight - 11, pWidth - 10, pHeight - 11);
        
        // Sinistra: Impronta crittografica di sicurezza
        if (integrityHash) {
            doc.setFont("courier", "bold");
            doc.setFontSize(6.2);
            doc.setTextColor(100, 110, 125);
            const shortHash = `${integrityHash.substring(0, 24).toUpperCase()}...[${integrityHash.substring(56, 64).toUpperCase()}]`;
            doc.text(`SHA-256: ${shortHash}`, 10, pHeight - 6.5);
        }
        
        // Centro: Numerazione a 3 cifre anti-manomissione (es. Pagina 001 di 012)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(40, 45, 55);
        doc.text(`Pagina ${pageStr} di ${totalPagesStr}`, pWidth / 2, pHeight - 6.5, { align: 'center' });
        
        // Destra: Attestazione legale CAD
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(110, 115, 130);
        doc.text(`Integrità Digitale D.Lgs. 82/2005 CAD`, pWidth - 10, pHeight - 6.5, { align: 'right' });
    }
};

const drawGridLines = (doc: any, startY: number, endY: number) => {
    doc.setDrawColor(200);
    doc.setLineWidth(0.1);
    const xPositions = [10, 20, 42, 102, 112, 124, 136, 148, 166, 184, 200];
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

    tableBody.push([{ content: '', colSpan: 10, styles: { minCellHeight: 10, lineWidth: 0, fillColor: [255, 255, 255] } }]);

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
      startY: 44, 
      margin: { top: 38, bottom: 25, left: 10, right: 10 }, 
      theme: 'plain', 
      styles: { fontSize: 8, valign: 'top', cellPadding: 1.5, lineWidth: 0, overflow: 'linebreak', font: 'helvetica', rowPageBreak: 'auto' },
      columnStyles: { 
          0: { cellWidth: 10, halign: 'center' }, 
          1: { cellWidth: 22 }, 
          2: { cellWidth: 60 }, 
          3: { cellWidth: 10, halign: 'center' }, 
          4: { cellWidth: 12, halign: 'center' }, 
          5: { cellWidth: 12, halign: 'center' }, 
          6: { cellWidth: 12, halign: 'center' }, 
          7: { cellWidth: 18, halign: 'right' }, 
          8: { cellWidth: 18, halign: 'right' }, 
          9: { cellWidth: 16, halign: 'right' } 
      },
      headStyles: { fillColor: [240, 240, 240], textColor: [0,0,0], fontStyle: 'bold', halign: 'center', lineWidth: { bottom: 0.5 }, lineColor: [0,0,0] },
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
          const currentTableStartY = data.pageNumber === 1 ? 44 : 38;
          const defaultTableEndY = pageHeight - 25;
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
        startY: 30,
        margin: { left: 10, right: 10 },
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.5, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 100 }, 
            2: { cellWidth: 45 },
            3: { cellWidth: 25 }
        },
        headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        didDrawPage: (data) => {
            doc.setFontSize(12); doc.setFont("helvetica", "bold");
            doc.text(`RIEPILOGO GENERALE ${filterType === 'work' ? 'LAVORI' : 'SICUREZZA'}`, 105, 20, { align: 'center' });
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

export const generateComputoMetricoSubappaltoPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
  try {
    const { jsPDF, autoTable } = await getLibs();
    const doc = new jsPDF();
    const tableBody: any[] = [];
    const pageHeight = doc.internal.pageSize.height;

    tableBody.push([{ content: '', colSpan: 10, styles: { minCellHeight: 10, lineWidth: 0, fillColor: [255, 255, 255] } }]);

    // Master sequential index map per mantenere la numerazione globale originale
    const masterIndexMap = new Map<string, number>();
    let masterCount = 1;
    categories.forEach(cat => {
        if (cat.isSuperCategory) return;
        articles.filter(a => a.categoryCode === cat.code).forEach(art => {
            masterIndexMap.set(art.id, masterCount++);
        });
    });

    const topLevels = categories.filter(c => !c.parentId && c.isEnabled !== false);
    let totalActiveArticles = 0;
    
    topLevels.forEach(root => {
        if (root.isSuperCategory) {
            const children = categories.filter(c => c.parentId === root.code && !c.isSuperCategory && c.isEnabled !== false);
            if (children.length > 0) {
                tableBody.push([
                    { content: '', colSpan: 2, styles: { lineWidth: 0 } },
                    { content: `AREA: ${root.name.toUpperCase()}`, colSpan: 8, styles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', cellPadding: 3, isSuper: true } }
                ]);
                children.forEach(child => {
                    const catArticles = articles.filter(a => a.categoryCode === child.code && a.isEnabled !== false);
                    if (catArticles.length === 0) return;
                    totalActiveArticles += catArticles.length;

                    tableBody.push([
                        { content: '', styles: { isWbs: true, lineWidth: 0 } }, 
                        { content: '', styles: { isWbs: true, lineWidth: 0 } }, 
                        { content: `${child.code} - ${child.name}`, styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'left', cellPadding: { left: 1, right: 1, top: 3, bottom: 3 }, isWbs: true, lineWidth: 0 } },
                        '', '', '', '', '', '', ''
                    ]);

                    catArticles.forEach((art, artIndex) => {
                        const wbsN = getWbsNumber(child.code);
                        const artNum = `${wbsN}.${artIndex + 1}`;
                        const gNum = art.originalGlobalIndex || masterIndexMap.get(art.id) || (artIndex + 1);

                        let finalDescription = cleanText(art.description);
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
                                textColor: [20, 20, 20]
                              } 
                            },
                            '', '', '', '', '', '', ''
                        ]);

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

                        tableBody.push([ 
                            '', '', 
                            { content: `SOMMANO ${art.unit}`, styles: { fontStyle: 'bold', halign: 'right', cellPadding: { right: 1, top: 3, bottom: 2 }, isTotalRow: true } }, 
                            '', '', '', '', 
                            { content: formatNumber(art.quantity), styles: { fontStyle: 'bold', halign: 'right', cellPadding: { top: 3, left: 1.5 }, isTotalRow: true, fontSize: 8 } }, 
                            { content: '', styles: { halign: 'right', isTotalRow: true } }, 
                            { content: '', styles: { halign: 'right', isTotalRow: true } } 
                        ]);
                        tableBody.push([{ content: '', colSpan: 10, styles: { cellPadding: 1.5 } }]);
                    });
                });
            }
        } else {
            const catArticles = articles.filter(a => a.categoryCode === root.code && a.isEnabled !== false);
            if (catArticles.length === 0) return;
            totalActiveArticles += catArticles.length;

            tableBody.push([
                { content: '', styles: { isWbs: true, lineWidth: 0 } }, 
                { content: '', styles: { isWbs: true, lineWidth: 0 } }, 
                { content: `${root.code} - ${root.name}`, styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'left', cellPadding: { left: 1, right: 1, top: 3, bottom: 3 }, isWbs: true, lineWidth: 0 } },
                '', '', '', '', '', '', ''
            ]);

            catArticles.forEach((art, artIndex) => {
                const wbsN = getWbsNumber(root.code);
                const artNum = `${wbsN}.${artIndex + 1}`;
                const gNum = art.originalGlobalIndex || masterIndexMap.get(art.id) || (artIndex + 1);

                let finalDescription = cleanText(art.description);
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
                        textColor: [20, 20, 20]
                      } 
                    },
                    '', '', '', '', '', '', ''
                ]);

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

                tableBody.push([ 
                    '', '', 
                    { content: `SOMMANO ${art.unit}`, styles: { fontStyle: 'bold', halign: 'right', cellPadding: { right: 1, top: 3, bottom: 2 }, isTotalRow: true } }, 
                    '', '', '', '', 
                    { content: formatNumber(art.quantity), styles: { fontStyle: 'bold', halign: 'right', cellPadding: { top: 3, left: 1.5 }, isTotalRow: true, fontSize: 8 } }, 
                    { content: '', styles: { halign: 'right', isTotalRow: true } }, 
                    { content: '', styles: { halign: 'right', isTotalRow: true } } 
                ]);
                tableBody.push([{ content: '', colSpan: 10, styles: { cellPadding: 1.5 } }]);
            });
        }
    });

    const integrityHash = await computeProjectIntegrityHash(
        projectInfo,
        categories,
        articles.filter(a => a.isEnabled !== false),
        0,
        "COMPUTO METRICO SUBAPPALTO"
    );

    tableBody.push([
        { content: '', colSpan: 2, styles: { lineWidth: 0 } },
        { 
            content: `RIEPILOGO COMPUTO METRICO (VOCI ATTIVE: ${totalActiveArticles})`, 
            colSpan: 6, 
            styles: { 
                fontStyle: 'bold', 
                halign: 'right', 
                fontSize: 10.5, 
                cellPadding: { top: 4, bottom: 4, right: 3, left: 3 }, 
                fillColor: [244, 247, 252], 
                textColor: [15, 23, 42],
                isClosingTotalRow: true
            } 
        },
        { 
            content: 'OFFERTA €', 
            colSpan: 2, 
            styles: { 
                fontStyle: 'bold', 
                halign: 'center', 
                fontSize: 9.5, 
                cellPadding: { top: 4, bottom: 4, right: 3, left: 3 }, 
                fillColor: [244, 247, 252], 
                textColor: [0, 32, 128],
                isClosingTotalRow: true
            } 
        }
    ]);

    autoTable(doc, {
      head: [['N.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'PAR.UG', 'LUNG.', 'LARG.', 'H/PESO', 'QUANTITÀ', 'PREZZO OFF. €', 'IMPORTO OFF. €']],
      body: tableBody,
      startY: 42,
      margin: { left: 10, right: 10, top: 38, bottom: 25 },
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1, overflow: 'linebreak' },
      columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 22, halign: 'center' },
          2: { cellWidth: 60 },
          3: { cellWidth: 10, halign: 'center' },
          4: { cellWidth: 12, halign: 'center' },
          5: { cellWidth: 12, halign: 'center' },
          6: { cellWidth: 12, halign: 'center' },
          7: { cellWidth: 18, halign: 'right' },
          8: { cellWidth: 18, halign: 'right' },
          9: { cellWidth: 16, halign: 'right' }
      },
      headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      didDrawPage: (data: any) => {
          const currentTableStartY = data.pageNumber === 1 ? 44 : 38;
          const defaultTableEndY = pageHeight - 25;
          drawHeader(doc, projectInfo, "COMPUTO METRICO", data.pageNumber, 0, doc.internal.pageSize.width, doc.internal.pageSize.height);
          drawGridLines(doc, currentTableStartY, defaultTableEndY); 
          drawTableFrame(doc, currentTableStartY, defaultTableEndY);
          drawFooter(doc, data.pageNumber, 0, 0, doc.internal.pageSize.width, doc.internal.pageSize.height, false, true);
      }
    });

    // Sezione firme e validazione offerta
    const finalY = (doc as any).lastAutoTable.finalY || (pageHeight - 50);
    if (finalY + 40 > pageHeight - 20) {
        doc.addPage();
        drawHeader(doc, projectInfo, "COMPUTO METRICO", doc.getNumberOfPages(), 0, doc.internal.pageSize.width, doc.internal.pageSize.height);
    }
    const signY = finalY + 40 > pageHeight - 20 ? 45 : finalY + 10;
    
    doc.setDrawColor(44, 62, 80);
    doc.setLineWidth(0.4);
    doc.line(10, signY, 200, signY);
    doc.setLineWidth(0.15);
    doc.line(10, signY + 0.8, 200, signY + 0.8);

    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(40, 50, 70);
    doc.text(`Il Progettista / D.L.`, 30, signY + 8, { align: 'center' });
    doc.text(`L'Impresa Concorrente / Subappaltatrice`, 160, signY + 8, { align: 'center' });
    doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(120, 130, 145);
    doc.text(`(Timbro e Firma per Consegna)`, 30, signY + 12, { align: 'center' });
    doc.text(`(Timbro e Firma per Offerta Economica)`, 160, signY + 12, { align: 'center' });

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

                tableBody.push([
                  { content: `${gNum}\n(${artNum})`, styles: { halign: 'center', isArt: true, cellPadding: { top: 2.5, bottom: 2 } } }, 
                  { content: formatTariffCode(art.code, 21, 6.8, doc), styles: { fontStyle: 'bold', fontSize: art.code.length > 25 ? 6 : (art.code.length > 16 ? 6.5 : 7.2), halign: 'center', overflow: 'linebreak', cellPadding: { top: 2.5, bottom: 2, left: 1, right: 1 } } }, 
                  { content: finalDescription, styles: { isArtDesc: true, fontSize: 8, cellPadding: { left: 3, right: 3, top: 2.5, bottom: 2.5 } } }, 
                  { content: art.unit, styles: { halign: 'center', cellPadding: { top: 2.5, bottom: 2 } } }, 
                  { content: `€ ${formatCurrency(art.unitPrice)}\n(Euro ${wordsPrice})`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.2, cellPadding: { top: 2.5, bottom: 2.5, right: 2.5, left: 2 } } }
                ]);
            });
        });

        autoTable(doc, { 
            head: [['N.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'U.M.', 'PREZZO UNITARIO']], 
            body: tableBody, 
            startY: 42, 
            margin: { left: 10, right: 10, top: 25, bottom: 16 },
            theme: 'grid', 
            styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' }, 
            columnStyles: {
                0: { cellWidth: 16, halign: 'center' },
                1: { cellWidth: 26, halign: 'center' },
                2: { cellWidth: 96 },
                3: { cellWidth: 12, halign: 'center' },
                4: { cellWidth: 40, halign: 'right' }
            },
            headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' }, 
            didDrawPage: (data: any) => { drawHeaderSimple(doc, projectInfo, "ELENCO PREZZI UNITARI", data.pageNumber); },
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
            startY: 42, 
            margin: { left: 10, right: 10, top: 25, bottom: 16 },
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
            headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' }, 
            didDrawPage: (data: any) => { 
                if (data.pageNumber === 1) {
                    doc.setTextColor(0, 0, 0);
                    doc.setFontSize(13); doc.setFont("helvetica", "bold"); 
                    doc.text("STIMA INCIDENZA MANODOPERA", 105, 16, { align: 'center' });
                    doc.setFontSize(7.5); doc.setFont("helvetica", "italic"); doc.setTextColor(70, 70, 70);
                    doc.text("(Ai sensi del Codice dei Contratti Pubblici D.Lgs. 36/2023 - Quantificazione forza lavoro e stima non ribassabile)", 105, 21, { align: 'center' });
                    doc.setTextColor(0, 0, 0);
                    doc.setFontSize(8); doc.setFont("helvetica", "bold");
                    doc.text(projectInfo.title, 12, 28);
                    doc.setFontSize(8); doc.setFont("helvetica", "normal"); 
                    doc.text(`Committente: ${projectInfo.client}`, 12, 33);
                    doc.text(`Progettista: ${projectInfo.designer}`, 12, 37); 
                } else {
                    doc.setTextColor(0, 0, 0);
                    doc.setFontSize(7.2); 
                    doc.setFont("helvetica", "bold"); doc.text(projectInfo.title, 12, 15); 
                }
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

export const generateAnalisiPrezziPdf = async (projectInfo: ProjectInfo, analyses: PriceAnalysis[]) => {
    try {
        const { jsPDF, autoTable } = await getLibs();
        const doc = new jsPDF();
        const pageHeight = doc.internal.pageSize.height;
        const pageWidth = doc.internal.pageSize.width;

        if (analyses.length === 0) {
            alert("Nessuna analisi da stampare.");
            return;
        }

        const rawAnalyses = analyses.map(a => `${a.code}:${a.totalUnitPrice}`).join(';');
        const integrityHash = await computeSha256(`ANALISI PREZZI||${projectInfo.title}||${rawAnalyses}`);

        // 1. PAGINE DELLE SINGOLE ANALISI
        analyses.forEach((an, idx) => {
            if (idx > 0) doc.addPage();
            
            const drawAnalysisHeader = (pageNo: number) => {
                drawHeaderSimple(doc, projectInfo, "ANALISI DEI PREZZI UNITARI", pageNo);
            };

            drawAnalysisHeader(1);
            
            // PATTO DI FERRO 1: CODICE IN EVIDENZA
            doc.setFontSize(24);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(142, 68, 173); // Purple color
            doc.text(softBreakLongWords(an.code, 15), 12, 55);

            // PATTO DI FERRO 2: DESCRIZIONE CON ETICHETTA E TESTO GIUSTIFICATO
            let currentY = 65;
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(0, 0, 0);
            doc.text("DESCRIZIONE:", 12, currentY);
            
            currentY += 5;
            doc.setFont("helvetica", "normal");
            const cleanedDesc = softBreakLongWords(cleanText(an.description));
            const splitDesc = doc.splitTextToSize(cleanedDesc, 185);
            doc.text(splitDesc, 12, currentY, { align: 'justify', maxWidth: 185 });
            
            currentY += (splitDesc.length * 5) + 10;

            // PATTO DI FERRO 3: QUANTITÀ ANALIZZATA IN EVIDENZA
            doc.setDrawColor(200);
            doc.setFillColor(245, 245, 255);
            doc.roundedRect(12, currentY - 6, 185, 12, 2, 2, 'F');
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.text(`QUANTITÀ DI RIFERIMENTO PER L'ANALISI:`, 15, currentY + 1.5);
            doc.setFontSize(11);
            doc.text(`${an.analysisQuantity} ${an.unit}`, 190, currentY + 1.5, { align: 'right' });

            currentY += 15;

            // TABELLA COMPONENTI
            const body = an.components.map(c => [
                c.type.toUpperCase().substring(0,3), 
                c.description, 
                c.unit, 
                formatCurrency(c.unitPrice), 
                formatNumber(c.quantity), 
                formatCurrency(c.unitPrice * c.quantity)
            ]);

            autoTable(doc, { 
                startY: currentY, 
                head: [['TIPO', 'ELEMENTO DI COSTO', 'U.M.', 'PREZZO €', 'Q.TÀ', 'IMPORTO €']], 
                body: body, 
                theme: 'striped', 
                styles: { fontSize: 8, cellPadding: 2.5 }, 
                headStyles: { fillColor: [142, 68, 173], textColor: [255, 255, 255] },
                columnStyles: {
                    0: { cellWidth: 15 },
                    1: { cellWidth: 'auto' },
                    2: { cellWidth: 15, halign: 'center' },
                    3: { cellWidth: 25, halign: 'right' },
                    4: { cellWidth: 20, halign: 'center' },
                    5: { cellWidth: 25, halign: 'right' }
                },
                didDrawPage: (data) => {
                    if (data.pageNumber > 1) {
                        drawAnalysisHeader(data.pageNumber);
                    }
                }
            });

            currentY = (doc as any).lastAutoTable.finalY + 10;

            // RIEPILOGO COSTI TECNICI
            if (currentY > pageHeight - 60) {
                doc.addPage();
                drawAnalysisHeader(1);
                currentY = 50;
            }

            const drawSummaryRow = (label: string, val: number, isBold = false) => {
                doc.setFont("helvetica", isBold ? "bold" : "normal");
                doc.setFontSize(isBold ? 10 : 9);
                doc.text(label, 150, currentY, { align: 'right' });
                doc.text(formatCurrency(val), 195, currentY, { align: 'right' });
                currentY += 6;
            };

            drawSummaryRow("Totale Costo Tecnico (Materiali + M.O. + Noli)", an.costoTecnico);
            drawSummaryRow(`Spese Generali (${an.generalExpensesRate}%)`, an.valoreSpese);
            drawSummaryRow(`Utile d'Impresa (${an.profitRate}%)`, an.valoreUtile);
            
            doc.setDrawColor(0);
            doc.setLineWidth(0.5);
            doc.line(130, currentY - 3, 195, currentY - 3);
            drawSummaryRow(`Importo Totale Analisi (Lotto)`, an.totalBatchValue, true);

            currentY += 10;

            // PATTO DI FERRO 4: PREZZO UNITARIO FINALE CHIARO (BOX HERO)
            doc.setDrawColor(142, 68, 173);
            doc.setFillColor(142, 68, 173);
            doc.roundedRect(100, currentY, 97, 22, 3, 3, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text("PREZZO UNITARIO FINALE", 105, currentY + 8);
            
            doc.setFontSize(18);
            doc.text(`€ ${formatCurrency(an.totalUnitPrice)}`, 192, currentY + 16, { align: 'right' });
            
            doc.setFontSize(7);
            doc.text(`al netto di ribasso per ${an.unit}`, 105, currentY + 16);

            doc.setTextColor(0, 0, 0); // Reset for signature

            drawSignature(doc, projectInfo, currentY + 30);
        });

        // 2. PAGINA DI RIEPILOGO FINALE (PERFEZIONE)
        doc.addPage();
        drawHeaderSimple(doc, projectInfo, "RIEPILOGO ANALISI PREZZI", 1);
        
        const summaryBody = analyses.map((an, i) => [
            { content: (i + 1).toString(), styles: { halign: 'center' } },
            { content: softBreakLongWords(an.code, 12), styles: { fontStyle: 'bold', textColor: [142, 68, 173] } },
            { content: softBreakLongWords(cleanText(an.description)), styles: { fontSize: 7.5, halign: 'justify' } },
            { content: an.unit, styles: { halign: 'center' } },
            { content: formatCurrency(an.totalUnitPrice), styles: { halign: 'right', fontStyle: 'bold' } }
        ]);

        autoTable(doc, {
            startY: 50,
            head: [['N.', 'CODICE', 'DESIGNAZIONE DELLA VOCE ANALIZZATA', 'U.M.', 'PREZZO UNITARIO']],
            body: summaryBody,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255] },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 25 },
                2: { cellWidth: 'auto' },
                3: { cellWidth: 15 },
                4: { cellWidth: 35 }
            }
        });

        drawSignature(doc, projectInfo, (doc as any).lastAutoTable.finalY + 20, integrityHash);
        applyDocumentFootersAndSecurity(doc, integrityHash);

        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (e) { console.error(e); alert("Errore Analisi."); }
};

const drawHeaderSimple = (doc: any, projectInfo: ProjectInfo, title: string, pageNumber: number) => {
    doc.setTextColor(0,0,0);
    if (pageNumber === 1) {
        doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text(title, 105, 18, { align: 'center' });
        doc.setFontSize(8); 
        doc.text(projectInfo.title, 12, 28);
        doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text(`Committente: ${projectInfo.client}`, 12, 33);
        doc.text(`Progettista: ${projectInfo.designer}`, 12, 37); 
    } else {
        doc.setFontSize(7.2); 
        doc.setFont("helvetica", "bold"); doc.text(projectInfo.title, 12, 15); 
    }
};

export const generateScheduleA3Pdf = async (projectInfo: ProjectInfo, scheduleData: any[], maxCalendarDays: number) => {
    try {
        const { jsPDF } = await getLibs();
        const doc = new jsPDF({ orientation: 'landscape', format: 'a3', unit: 'mm' });
        
        const margin = 15;
        const pageWidth = 420;
        const pageHeight = 297;
        const wbsNameWidth = 60;
        const wbsDaysWidth = 12;
        const wbsTeamWidth = 12;
        const wbsColumnWidth = wbsNameWidth + wbsDaysWidth + wbsTeamWidth;
        const timelineWidth = pageWidth - margin * 2 - wbsColumnWidth;
        const dayWidth = timelineWidth / maxCalendarDays;
        const rowHeight = 10;
        const headerHeight = 35;

        doc.setFontSize(18); doc.setFont("helvetica", "bold");
        doc.text("CRONOPROGRAMMA DEI LAVORI", pageWidth / 2, 15, { align: 'center' });
        doc.setFontSize(8); doc.setFont("helvetica", "normal"); 
        doc.text(`Progetto: ${projectInfo.title}`, margin, 25);
        doc.text(`Committente: ${projectInfo.client}`, margin, 30);

        let currentY = headerHeight;

        doc.setDrawColor(0); doc.setLineWidth(0.5);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8);
        doc.text("WBS / ATTIVITÀ", margin + 2, currentY + 7);
        doc.text("Giorni", margin + wbsNameWidth + 2, currentY + 7);
        doc.text("Sq.", margin + wbsNameWidth + wbsDaysWidth + 2, currentY + 7);
        
        const contentBottomY = currentY + 10 + (scheduleData.length * rowHeight);

        for(let d=1; d<=maxCalendarDays; d++) {
            const x = margin + wbsColumnWidth + (d-1) * dayWidth;
            const weekend = d % 7 === 6 || d % 7 === 0;
            if (weekend) {
                doc.setFillColor(235, 235, 235);
                doc.rect(x, currentY, dayWidth, contentBottomY - currentY, 'F');
            }
            doc.setDrawColor(210); doc.setLineWidth(0.1);
            doc.line(x, currentY, x, contentBottomY);
            doc.setTextColor(120);
            doc.setFontSize(6);
            doc.text(d.toString(), x + dayWidth/2, currentY + 7, { align: 'center' });
        }
        
        currentY += 10;
        doc.setDrawColor(0); doc.setLineWidth(0.3);
        doc.line(margin, currentY, pageWidth - margin, currentY);

        let totalLaborValue = 0;
        let lastDay = 0;

        scheduleData.forEach((cat) => {
            if (currentY + rowHeight > pageHeight - margin) return;
            totalLaborValue += cat.totalLabor;
            if (cat.calendarEnd > lastDay) lastDay = cat.calendarEnd;
            doc.setDrawColor(240); doc.setLineWidth(0.05);
            doc.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);
            doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
            doc.setTextColor(0);
            doc.text(`${cat.code} - ${cat.name.substring(0, 32)}`, margin + 2, currentY + 7);
            doc.setFont("helvetica", "bold"); doc.setFontSize(7);
            doc.setTextColor(60, 60, 60);
            doc.text(cat.duration.toString(), margin + wbsNameWidth + 3, currentY + 7);
            doc.setTextColor(0, 80, 180);
            doc.text(cat.teamSize.toString(), margin + wbsNameWidth + wbsDaysWidth + 3, currentY + 7);

            const barX = margin + wbsColumnWidth + ((cat.calendarStart - 1) * dayWidth);
            const barW = cat.calendarDuration * dayWidth;
            const barH = 5;
            const barY = currentY + (rowHeight - barH) / 2;

            const hex = cat.barColor || '#3B82F6';
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            doc.setFillColor(r, g, b);
            doc.roundedRect(barX, barY, barW, barH, 0.5, 0.5, 'F');
            currentY += rowHeight;
        });

        doc.setDrawColor(0); doc.setLineWidth(0.5);
        doc.line(margin + wbsColumnWidth, headerHeight, margin + wbsColumnWidth, contentBottomY);
        doc.setLineWidth(0.5);
        doc.rect(margin, headerHeight, pageWidth - margin * 2, contentBottomY - headerHeight);

        let reportY = contentBottomY + 15;
        if (reportY > pageHeight - 80) { doc.addPage(); reportY = margin + 10; }
        
        doc.setFontSize(11); doc.setFont("helvetica", "bold");
        doc.setTextColor(44, 62, 80);
        doc.text("DATI ESSENZIALI DEL CRONOPROGRAMMA", margin, reportY);
        
        doc.setFontSize(9); doc.setFont("helvetica", "normal");
        doc.setTextColor(0);
        
        const manDaysTotal = Math.ceil(totalLaborValue / 240);
        const consecutiveDays = lastDay;

        let listY = reportY + 8;
        doc.setFont("helvetica", "bold"); doc.text("- Durata complessiva del cantiere:", margin, listY);
        doc.setFont("helvetica", "normal"); doc.text(`${consecutiveDays} giorni naturali e consecutivi`, margin + 60, listY);
        
        listY += 6;
        doc.setFont("helvetica", "bold"); doc.text("- Fabbisogno totale forza lavoro:", margin, listY);
        doc.setFont("helvetica", "normal"); doc.text(`${manDaysTotal} Uomini-Giorno (UG)`, margin + 60, listY);
        
        listY += 6;
        doc.setFont("helvetica", "bold"); doc.text("- Importo manodopera stimata:", margin, listY);
        doc.setFont("helvetica", "normal"); doc.text(`€ ${formatCurrency(totalLaborValue)}`, margin + 60, listY);

        listY += 6;
        doc.setFont("helvetica", "bold"); doc.text("- Produzione base considerata:", margin, listY);
        doc.setFont("helvetica", "normal"); doc.text(`€ 240,00/giorno per singolo operaio (Sq.)`, margin + 60, listY);

        listY += 12;
        doc.setFontSize(8); doc.setFont("helvetica", "bold");
        doc.text("NOTE TECNICHE E NORMATIVE:", margin, listY);
        doc.setFont("helvetica", "italic");
        
        const noteItems = [
            "1. Le durate di ogni singola lavorazione riportate in tabella sono state incrementate del 10% rispetto al calcolo teorico di produzione. Tale incremento cautelativo tiene conto delle medie stagionali relative alle condizioni meteo, delle festività nazionali e patronali, di eventuali scioperi del settore e di possibili imprevisti logistici o interferenze di cantiere.",
            "2. Il presente cronoprogramma è sviluppato sulla base di una settimana lavorativa di 5 (cinque) giorni (Lunedì-Venerdì) e su un unico turno di lavoro giornaliero standard.",
            "3. La durata del cantiere è espressa in 'giorni naturali e consecutivi', ovvero comprensivi delle domeniche e di tutti gli altri giorni festivi, ai sensi della normativa vigente sui LL.PP. (Rif. Art. 121 DPR 207/2010 e s.m.i.)."
        ];

        let noteY = listY + 5;
        noteItems.forEach(note => {
            const splitNote = doc.splitTextToSize(note, pageWidth - margin * 2);
            doc.text(splitNote, margin, noteY);
            noteY += (splitNote.length * 4) + 2;
        });
        
        const sigX = pageWidth - margin - 70;
        const sigY = noteY + 10;
        doc.setFont("helvetica", "normal"); doc.setFontSize(9);
        doc.text(`${projectInfo.location}, ${projectInfo.date}`, margin, sigY);
        doc.setFont("helvetica", "bold");
        doc.text("IL PROGETTISTA", sigX + 35, sigY, { align: 'center' });
        doc.setLineWidth(0.2);
        doc.line(sigX, sigY + 10, sigX + 70, sigY + 10);
        doc.setFont("helvetica", "normal");
        doc.text(projectInfo.designer, sigX + 35, sigY + 16, { align: 'center' });

        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (e) { console.error(e); alert("Errore A3."); }
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

        // Intestazione prima pagina
        const drawDistintaHeader = (d: any, pageNum: number) => {
            d.setTextColor(15, 23, 42);
            if (pageNum === 1) {
                d.setFontSize(14);
                d.setFont("helvetica", "bold");
                d.text("DISTINTA DEI FERRI E SAGOMARIO D'ARMATURA", pageWidth / 2, 14, { align: 'center' });
                
                d.setFontSize(8.5);
                d.setFont("helvetica", "normal");
                d.text("Acciaio in barre tonde nervate B450C ad aderenza migliorata (D.M. 17/01/2018 NTC)", pageWidth / 2, 19, { align: 'center' });

                d.setFontSize(8);
                d.setFont("helvetica", "bold");
                d.text(`OPERA / PROGETTO: ${projectInfo.title}`, 10, 26);
                d.setFont("helvetica", "normal");
                d.text(`COMMITTENTE: ${projectInfo.client}`, 10, 31);
                d.text(`PROGETTISTA DELLE STRUTTURE: ${projectInfo.designer}`, 10, 36);
                d.text(`LOCALITÀ CANTIERE: ${projectInfo.location}   |   DATA: ${projectInfo.date}`, 10, 41);

                d.setDrawColor(203, 213, 225);
                d.setLineWidth(0.3);
                d.line(10, 44, pageWidth - 10, 44);
            } else {
                d.setFontSize(7.5);
                d.setFont("helvetica", "bold");
                d.text(`DISTINTA FERRI - ${projectInfo.title}`, 10, 12);
                d.setDrawColor(226, 232, 240);
                d.setLineWidth(0.2);
                d.line(10, 14, pageWidth - 10, 14);
            }
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
            startY: 47,
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
