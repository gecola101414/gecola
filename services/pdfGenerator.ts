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

// --- FORMATTERS ---
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

const drawHeader = (doc: any, projectInfo: ProjectInfo, title: string, pageNumber: number, grandTotal?: number, pageWidth?: number, pageHeight?: number, isTotalCurrency: boolean = true) => {
    doc.setTextColor(0,0,0);
    if (pageNumber === 1) {
        doc.setFontSize(14);
        doc.text(title, (pageWidth || 210) / 2, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(projectInfo.title, 10, 22);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(`Committente: ${projectInfo.client}`, 10, 27);
        doc.text(`Data: ${projectInfo.date}`, 10, 31);
        doc.text(`Prezzario: ${projectInfo.region} ${projectInfo.year}`, 10, 35);
    } else {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(projectInfo.title, 10, 20);
    }
};

const drawFooter = (doc: any, pageNumber: number, grandTotal: number | undefined, pageTotal: number | undefined, pageWidth: number, pageHeight: number, isTotalCurrency: boolean = true) => {
    const footerY = pageHeight - 15;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Pag. ${pageNumber}`, pageWidth / 2, footerY + 5, { align: 'center' });
};

export const generateComputoMetricPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
  try {
    const { jsPDF, autoTable } = await getLibs();
    const doc = new jsPDF();
    const tableBody: any[] = [];

    // Filtra categorie attive e crea mappa ridenominazione
    const activeCategories = categories.filter(c => c.isEnabled !== false);
    const displayMap: Record<string, string> = {};
    activeCategories.forEach((cat, idx) => {
        displayMap[cat.code] = `WBS.${(idx + 1).toString().padStart(2, '0')}`;
    });

    activeCategories.forEach((cat) => {
        const catArticles = articles.filter(a => a.categoryCode === cat.code);
        if (catArticles.length === 0) return;

        const displayWbsCode = displayMap[cat.code];
        tableBody.push([{ content: `${displayWbsCode} - ${cat.name}`, colSpan: 10, styles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0,0,0], halign: 'left' } }]);

        catArticles.forEach((art, artIndex) => {
            const wbsNum = displayWbsCode.match(/WBS\.(\d+)/)?.[1] || displayWbsCode;
            const artNum = `${parseInt(wbsNum, 10)}.${artIndex + 1}`;

            tableBody.push([
                { content: artNum, styles: { fontStyle: 'bold', halign: 'center', valign: 'top' } },
                { content: art.code, styles: { fontStyle: 'bold', valign: 'top' } },
                { content: art.description, styles: { fontStyle: 'normal', halign: 'justify', valign: 'top', fontSize: 7 } },
                '', '', '', '', '', '', '' 
            ]);

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
                let displayVal = val;
                if (m.type === 'subtotal') {
                    displayVal = runningPartial;
                    runningPartial = 0;
                } else {
                    runningPartial += val;
                }
                if (m.type !== 'subtotal' || displayVal !== 0) {
                   tableBody.push(['', '', { content: m.type === 'subtotal' ? 'Sommano parziale' : m.description, styles: { fontSize: 6.5, fontStyle: m.type === 'subtotal' ? 'bold' : 'normal' } }, formatNumber(m.multiplier), formatNumber(m.length), formatNumber(m.width), formatNumber(m.height), { content: formatNumber(displayVal), styles: { halign: 'right' } }, '', '']);
                }
            });

            tableBody.push([
                '', '', { content: `SOMMANO ${art.unit}`, styles: { fontStyle: 'bold', halign: 'right', fontSize: 7 } },
                '', '', '', '',
                { content: formatNumber(art.quantity), styles: { fontStyle: 'bold', halign: 'right' } },
                { content: formatNumber(art.unitPrice), styles: { halign: 'right' } },
                { content: formatCurrency(art.quantity * art.unitPrice), styles: { fontStyle: 'bold', halign: 'right', textColor: [0, 0, 150] } } 
            ]);
        });
    });

    autoTable(doc, {
      head: [['N.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'p.u.', 'lung.', 'larg.', 'h/p', 'Quantità', 'unitario', 'TOTALE']],
      body: tableBody,
      startY: 40,
      styles: { fontSize: 7, cellPadding: 1 },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 20 }, 2: { cellWidth: 'auto' }, 7: { cellWidth: 15 }, 8: { cellWidth: 15 }, 9: { cellWidth: 20 } },
      didDrawPage: (data: any) => {
          drawHeader(doc, projectInfo, "COMPUTO METRICO ESTIMATIVO", data.pageNumber, 0, doc.internal.pageSize.width);
          drawFooter(doc, data.pageNumber, 0, 0, doc.internal.pageSize.width, doc.internal.pageSize.height);
      }
    });

    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.text("RIEPILOGO GENERALE", 10, 20);
    const summaryRows: any[] = [];
    let totalWorks = 0;
    activeCategories.forEach(cat => {
        const catTotal = articles.filter(a => a.categoryCode === cat.code).reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
        if (catTotal > 0) {
            totalWorks += catTotal;
            summaryRows.push([displayMap[cat.code], cat.name, formatCurrency(catTotal)]);
        }
    });
    
    const safetyCosts = totalWorks * (projectInfo.safetyRate / 100);
    summaryRows.push(['', '', '']);
    summaryRows.push([{ content: 'Totale Lavori', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, formatCurrency(totalWorks)]);
    summaryRows.push([{ content: `Sicurezza (${projectInfo.safetyRate}%)`, colSpan: 2, styles: { halign: 'right' } }, formatCurrency(safetyCosts)]);
    summaryRows.push([{ content: 'TOTALE GENERALE (Escl. IVA)', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [230,230,230] } }, formatCurrency(totalWorks + safetyCosts)]);

    autoTable(doc, { head: [['Codice', 'Descrizione', 'Importo']], body: summaryRows, startY: 30 });
    doc.save(`${projectInfo.title}_Computo.pdf`);
  } catch (e) {}
};

export const generateElencoPrezziPdf = async (p: ProjectInfo, c: Category[], a: Article[]) => {};
export const generateManodoperaPdf = async (p: ProjectInfo, c: Category[], a: Article[]) => {};
export const generateAnalisiPrezziPdf = async (p: ProjectInfo, an: PriceAnalysis[]) => {};
export const generateProfessionalPdf = generateComputoMetricPdf;