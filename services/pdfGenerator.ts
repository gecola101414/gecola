
import { Article, Category, ProjectInfo, Measurement, PriceAnalysis } from '../types';

// --- HELPER: Number to Text (Italian Simple Implementation) ---
const units = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];
const teens = ['dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const tens = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

const convertGroup = (n: number): string => {
    let output = '';
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;

    if (h > 0) {
        if (h === 1) output += 'cento';
        else output += units[h] + 'cento';
    }

    if (t === 1) {
        output += teens[u];
    } else {
        if (t > 1) {
            let tenStr = tens[t];
            if (u === 1 || u === 8) tenStr = tenStr.substring(0, tenStr.length - 1);
            output += tenStr;
        }
        if (u > 0 && t !== 1) output += units[u];
    }
    return output;
};

const numberToItalianWords = (num: number): string => {
    if (num === 0) return 'zero';
    const integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);
    let words = '';
    
    if (integerPart >= 1000000) return "Valore troppo alto"; 

    if (integerPart >= 1000) {
        const thousands = Math.floor(integerPart / 1000);
        const remainder = integerPart % 1000;
        if (thousands === 1) words += 'mille';
        else words += convertGroup(thousands) + 'mila';
        if (remainder > 0) words += convertGroup(remainder);
    } else {
        words += convertGroup(integerPart);
    }
    words = words.charAt(0).toUpperCase() + words.slice(1);
    return `${words}/${decimalPart.toString().padStart(2, '0')}`;
};

const formatCurrency = (val: number | undefined | null) => {
  if (val === undefined || val === null) return '';
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
};

const formatNumber = (val: number | undefined | null) => {
  if (val === undefined || val === null || val === 0) return '';
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
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

const getLibs = async () => {
    const jsPDFModule = await import('jspdf');
    const jsPDF = (jsPDFModule as any).jsPDF || (jsPDFModule as any).default || jsPDFModule;
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = (autoTableModule as any).default || autoTableModule;
    return { jsPDF, autoTable };
};

const drawHeader = (doc: any, projectInfo: ProjectInfo, title: string, pageNumber: number, grandTotal?: number, isTotalCurrency: boolean = true) => {
    doc.setTextColor(0, 0, 0);
    if (pageNumber === 1) {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(title, 105, 18, { align: 'center' });
        doc.setFontSize(10);
        doc.text(projectInfo.title, 12, 28);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(`Committente: ${projectInfo.client}`, 12, 33);
        doc.text(`Progettista: ${projectInfo.designer}`, 12, 37);
        doc.text(`Listino: ${projectInfo.region} ${projectInfo.year}`, 12, 41);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        doc.line(10, 44, 200, 44);
    } else {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(projectInfo.title, 12, 15);
        if (grandTotal !== undefined) {
            doc.setFontSize(7.5);
            doc.text("RIPORTO PAGINA PRECEDENTE:  ", 160, 22, { align: 'right' });
            doc.text(isTotalCurrency ? formatCurrency(grandTotal) : formatNumber(grandTotal), 198, 22, { align: 'right' });
            doc.setLineWidth(0.1);
            doc.line(130, 23, 200, 23);
        }
    }
};

const drawFooter = (doc: any, pageNumber: number, grandTotal: number | undefined, pageTotal: number | undefined, isTotalCurrency: boolean = true) => {
    const pageHeight = doc.internal.pageSize.height;
    if (grandTotal !== undefined && pageTotal !== undefined) {
        const currentCumulative = grandTotal + pageTotal;
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.text("TOTALE DA RIPORTARE:  ", 160, pageHeight - 20, { align: 'right' });
        doc.text(isTotalCurrency ? formatCurrency(currentCumulative) : formatNumber(currentCumulative), 198, pageHeight - 20, { align: 'right' });
        doc.setLineWidth(0.1);
        doc.line(130, pageHeight - 18.5, 200, pageHeight - 18.5);
    }
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`Pagina ${pageNumber}`, 105, pageHeight - 6, { align: 'center' });
};

// --------------------------------------------------------------------------------
// 1. GENERATORE CORE COMPUTO (Riutilizzato per entrambi i PDF)
// --------------------------------------------------------------------------------
const generateBaseComputoPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[], title: string) => {
  try {
    const { jsPDF, autoTable } = await getLibs();
    const doc = new jsPDF();
    const body: any[] = [];

    categories.forEach((cat) => {
        if (!cat.isEnabled) return;
        const catArticles = articles.filter(a => a.categoryCode === cat.code);
        if (catArticles.length === 0) return;

        body.push([{ content: `${cat.code} - ${cat.name}`, colSpan: 10, styles: { fillColor: [245, 245, 245], fontStyle: 'bold', halign: 'left' } }]);

        catArticles.forEach((art, artIndex) => {
            const wbsNum = cat.code === 'WBS.SIC' ? 'S' : (cat.code.match(/WBS\.(\d+)/)?.[1] || '0');
            const artNum = `${wbsNum}.${artIndex + 1}`;

            body.push([{ content: artNum, styles: { fontStyle: 'bold', halign: 'center' } }, { content: art.code, styles: { fontStyle: 'bold' } }, { content: art.description, styles: { fontStyle: 'normal', halign: 'justify', fontSize: 7.5 } }, '', '', '', '', '', '', '']);

            let runningPartial = 0;
            art.measurements.forEach(m => {
                let val = 0;
                if (m.linkedArticleId) {
                    const linkedArt = articles.find(a => a.id === m.linkedArticleId);
                    if (linkedArt) {
                        const base = m.linkedType === 'amount' ? (linkedArt.quantity * linkedArt.unitPrice) : linkedArt.quantity;
                        val = calculateMeasurementValue(m, base);
                    }
                } else {
                    val = calculateMeasurementValue(m);
                }
                let displayVal = (m.type === 'subtotal') ? runningPartial : val;
                if (m.type === 'subtotal') runningPartial = 0; else runningPartial += val;
                
                body.push(['', '', { content: m.type === 'subtotal' ? 'Sommano parziale' : m.description, styles: { fontStyle: 'bold', halign: m.type === 'subtotal' ? 'right' : 'left', textColor: m.type === 'deduction' ? [200, 0, 0] : [0, 0, 0] } }, formatNumber(m.multiplier), formatNumber(m.length), formatNumber(m.width), formatNumber(m.height), { content: formatNumber(displayVal), styles: { halign: 'right', fontStyle: 'bold' } }, '', '']);
            });

            body.push(['', '', { content: `SOMMANO ${art.unit}`, styles: { fontStyle: 'bold', halign: 'right' } }, '', '', '', '', { content: formatNumber(art.quantity), styles: { fontStyle: 'bold', halign: 'right' } }, { content: formatNumber(art.unitPrice), styles: { halign: 'right' } }, { content: art.quantity * art.unitPrice, styles: { fontStyle: 'bold', halign: 'right', textColor: [0, 0, 120] } }]);
            body.push([{ content: '', colSpan: 10, styles: { cellPadding: 1 } }]);
        });
    });

    let grandTotal = 0; 
    let pageTotal = 0;  

    autoTable(doc, {
        head: [['N.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'par.ug.', 'lung.', 'larg.', 'H/peso', 'Quantità', 'unitario', 'TOTALE']],
        body: body,
        startY: 47,
        margin: { top: 25, bottom: 25, left: 10, right: 10 }, 
        theme: 'plain', 
        styles: { fontSize: 7.5, valign: 'top', cellPadding: 1, lineWidth: 0, overflow: 'linebreak', font: 'helvetica' },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 22 }, 2: { cellWidth: 60 }, 3: { cellWidth: 10, halign: 'center' }, 4: { cellWidth: 12, halign: 'center' }, 5: { cellWidth: 12, halign: 'center' }, 6: { cellWidth: 12, halign: 'center' }, 7: { cellWidth: 18, halign: 'right' }, 8: { cellWidth: 18, halign: 'right' }, 9: { cellWidth: 16, halign: 'right' }  
        },
        headStyles: { fillColor: [245, 245, 245], textColor: [0,0,0], fontStyle: 'bold', halign: 'center', lineWidth: { bottom: 0.2 } },
        didDrawCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 9) {
                const rawVal = data.cell.raw;
                if (typeof rawVal === 'number') pageTotal += rawVal;
            }
        },
        didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 9 && typeof data.cell.raw === 'number') {
                data.cell.text = [formatCurrency(data.cell.raw)];
            }
        },
        didDrawPage: (data: any) => {
            drawHeader(doc, projectInfo, title, data.pageNumber, grandTotal);
            drawFooter(doc, data.pageNumber, grandTotal, pageTotal);
            grandTotal += pageTotal; pageTotal = 0;
        }
    });

    const pdfBlob = doc.output('blob');
    window.open(URL.createObjectURL(pdfBlob), '_blank');
  } catch (error) { console.error(error); alert("Errore PDF."); }
};

// --- Funzioni Pubbliche per Export Separati ---
export const generateComputoMetricPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
    const lavoriCats = categories.filter(c => c.code !== 'WBS.SIC');
    return generateBaseComputoPdf(projectInfo, lavoriCats, articles, "COMPUTO METRICO ESTIMATIVO (LAVORI)");
};

export const generateComputoSicurezzaPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
    const sicurezzaCats = categories.filter(c => c.code === 'WBS.SIC');
    return generateBaseComputoPdf(projectInfo, sicurezzaCats, articles, "COMPUTO ONERI DELLA SICUREZZA (ANALITICI)");
};

export const generateElencoPrezziPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
    try {
        const { jsPDF, autoTable } = await getLibs();
        const doc = new jsPDF();
        const tableBody: any[] = [];
        categories.forEach((cat) => {
            if (!cat.isEnabled) return;
            const catArticles = articles.filter(a => a.categoryCode === cat.code);
            if (catArticles.length === 0) return;
            tableBody.push([{ content: `${cat.code} - ${cat.name}`, colSpan: 5, styles: { fillColor: [230, 230, 230], fontStyle: 'bold' } }]);
            catArticles.forEach((art, artIndex) => {
                const wbsNum = cat.code === 'WBS.SIC' ? 'S' : (cat.code.match(/WBS\.(\d+)/)?.[1] || '0');
                tableBody.push([
                    { content: `${wbsNum}.${artIndex + 1}`, styles: { halign: 'center' } },
                    { content: art.code, styles: { fontStyle: 'bold' } },
                    { content: art.description, styles: { halign: 'justify', fontSize: 8 } },
                    { content: art.unit, styles: { halign: 'center' } },
                    { content: `€ ${formatCurrency(art.unitPrice)}\n(${numberToItalianWords(art.unitPrice)})`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.5 } }
                ]);
            });
        });
        autoTable(doc, {
            head: [['N.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'U.M.', 'PREZZO UNITARIO']],
            body: tableBody,
            startY: 45,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2.5 },
            columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 25 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 15 }, 4: { cellWidth: 45 } },
            headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255] },
            didDrawPage: (data: any) => {
                drawHeaderSimple(doc, projectInfo, "ELENCO PREZZI UNITARI (LAVORI E SICUREZZA)", data.pageNumber);
            }
        });
        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (e) { alert("Errore Elenco Prezzi."); }
};

export const generateManodoperaPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
    try {
        const { jsPDF, autoTable } = await getLibs();
        const doc = new jsPDF();
        const tableBody: any[] = [];
        let totalLaborSum = 0;
        categories.forEach((cat) => {
            if (!cat.isEnabled) return;
            const catArticles = articles.filter(a => a.categoryCode === cat.code);
            if (catArticles.length === 0) return;
            tableBody.push([{ content: `${cat.code} - ${cat.name}`, colSpan: 6, styles: { fillColor: [230, 230, 230], fontStyle: 'bold' } }]);
            catArticles.forEach((art, artIndex) => {
                const wbsNum = cat.code === 'WBS.SIC' ? 'S' : (cat.code.match(/WBS\.(\d+)/)?.[1] || '0');
                const totalItem = art.quantity * art.unitPrice;
                const laborPart = totalItem * (art.laborRate / 100);
                totalLaborSum += laborPart;
                tableBody.push([
                    { content: `${wbsNum}.${artIndex + 1}`, styles: { halign: 'center' } },
                    art.code,
                    { content: art.description, styles: { fontSize: 7, halign: 'justify' } },
                    formatNumber(art.quantity),
                    { content: `${art.laborRate}%`, styles: { halign: 'center' } },
                    { content: formatCurrency(laborPart), styles: { halign: 'right', fontStyle: 'bold' } }
                ]);
            });
        });
        tableBody.push([{ content: 'TOTALE GENERALE INCIDENZA MANODOPERA', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [230, 230, 255] } }, { content: formatCurrency(totalLaborSum), styles: { halign: 'right', fontStyle: 'bold', fillColor: [230, 230, 255] } }]);
        autoTable(doc, {
            head: [['N.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'QUANTITÀ', '% M.O.', 'IMPORTO M.O.']],
            body: tableBody,
            startY: 45,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 25 }, 3: { cellWidth: 20, halign: 'right' }, 4: { cellWidth: 15 }, 5: { cellWidth: 30 } },
            headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255] },
            didDrawPage: (data: any) => {
                drawHeaderSimple(doc, projectInfo, "STIMA INCIDENZA MANODOPERA", data.pageNumber);
            }
        });
        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (e) { alert("Errore Manodopera."); }
};

export const generateAnalisiPrezziPdf = async (projectInfo: ProjectInfo, analyses: PriceAnalysis[]) => {
    try {
        const { jsPDF, autoTable } = await getLibs();
        const doc = new jsPDF();
        if (analyses.length === 0) { alert("Nessuna analisi."); return; }
        analyses.forEach((an, idx) => {
            if (idx > 0) doc.addPage();
            drawHeaderSimple(doc, projectInfo, "ANALISI DEI PREZZI UNITARI", 1);
            doc.setFontSize(11); doc.setFont("helvetica", "bold");
            doc.text(`${an.code} - ${an.description}`, 12, 52);
            doc.setFontSize(8); doc.setFont("helvetica", "normal");
            doc.text(`Analisi riferita a ${an.analysisQuantity} ${an.unit}`, 12, 57);
            const body = an.components.map(c => [c.type.toUpperCase().substring(0,3), c.description, c.unit, formatCurrency(c.unitPrice), formatNumber(c.quantity), formatCurrency(c.unitPrice * c.quantity)]);
            autoTable(doc, {
                startY: 62,
                head: [['TIPO', 'ELEMENTO DI COSTO', 'U.M.', 'PREZZO', 'Q.TÀ', 'IMPORTO']],
                body: body,
                theme: 'striped',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [142, 68, 173] },
                columnStyles: { 3: { halign: 'right' }, 4: { halign: 'center' }, 5: { halign: 'right' } }
            });
            let finalY = (doc as any).lastAutoTable.finalY + 10;
            const drawRow = (label: string, val: number, bold = false) => {
                doc.setFont("helvetica", bold ? "bold" : "normal");
                doc.text(label, 150, finalY, { align: 'right' });
                doc.text(formatCurrency(val), 195, finalY, { align: 'right' });
                finalY += 6;
            };
            drawRow("Costo Tecnico", an.costoTecnico);
            drawRow(`Spese Generali (${an.generalExpensesRate}%)`, an.valoreSpese);
            drawRow(`Utile d'Impresa (${an.profitRate}%)`, an.valoreUtile);
            doc.setLineWidth(0.5); doc.line(130, finalY - 3, 195, finalY - 3);
            drawRow(`TOTALE ANALISI`, an.totalBatchValue, true);
            finalY += 5;
            doc.setFillColor(240, 240, 240); doc.rect(100, finalY, 95, 12, 'F');
            doc.setFontSize(10); doc.setFont("helvetica", "bold");
            doc.text("PREZZO UNITARIO APPLICATO", 105, finalY + 8);
            doc.text(`€ ${formatCurrency(an.totalUnitPrice)}`, 190, finalY + 8, { align: 'right' });
        });
        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (e) { alert("Errore Analisi."); }
};

const drawHeaderSimple = (doc: any, projectInfo: ProjectInfo, title: string, pageNumber: number) => {
    doc.setTextColor(0,0,0);
    if (pageNumber === 1) {
        doc.setFontSize(14); doc.setFont("helvetica", "bold");
        doc.text(title, 105, 18, { align: 'center' });
        doc.setFontSize(10); doc.text(projectInfo.title, 12, 28);
        doc.setFontSize(8); doc.setFont("helvetica", "normal");
        doc.text(`Committente: ${projectInfo.client}`, 12, 33);
        doc.text(`Progettista: ${projectInfo.designer}`, 12, 37);
        doc.line(10, 44, 200, 44);
    } else {
        doc.setFontSize(9); doc.setFont("helvetica", "bold");
        doc.text(projectInfo.title, 12, 15);
        doc.line(10, 18, 200, 18);
    }
};

export const generateProfessionalPdf = generateComputoMetricPdf;
