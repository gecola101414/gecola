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

// Added missing helper function to extract WBS numerical index
const getWbsNumber = (code: string) => {
    const match = code.match(/WBS\.(\d+)/);
    return match ? parseInt(match[1], 10) : code;
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

// Exact column coordinates (cumulative widths)
const COL_BOUNDARY_X = [
    10,      // Left Frame
    20,      // Num.Ord
    42,      // Tariffa
    102,     // Designazione (Desc)
    112,     // par.ug.
    124,     // lung.
    136,     // larg.
    148,     // H/peso
    166,     // Quantità
    184,     // unitario
    200      // TOTALE / Right Frame
];

const drawGridLines = (doc: any, startY: number, endY: number) => {
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.1);
    for (let i = 1; i < COL_BOUNDARY_X.length - 1; i++) {
        doc.line(COL_BOUNDARY_X[i], startY, COL_BOUNDARY_X[i], endY);
    }
};

const drawTableFrame = (doc: any, startY: number, endY: number) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(10, startY, 10, endY); 
    doc.line(200, startY, 200, endY); 
    doc.line(10, endY, 200, endY); 
    doc.line(10, startY, 200, startY); 
    doc.setLineWidth(0.1);
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
// 1. COMPUTO METRICO ESTIMATIVO (PROFESSIONALE)
// --------------------------------------------------------------------------------
export const generateComputoMetricPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
  try {
    const { jsPDF, autoTable } = await getLibs();
    const doc = new jsPDF();
    const tableBody: any[] = [];
    const pageHeight = doc.internal.pageSize.height;

    categories.forEach((cat) => {
        if (!cat.isEnabled) return;
        const catArticles = articles.filter(a => a.categoryCode === cat.code);
        if (catArticles.length === 0) return;

        // WBS header
        tableBody.push([
            { content: '', styles: { isWbs: true } }, 
            { content: '', styles: { isWbs: true } }, 
            { 
                content: `${cat.code} - ${cat.name}`, 
                styles: { 
                    fillColor: [245, 245, 245], 
                    fontStyle: 'bold', 
                    halign: 'left', 
                    cellPadding: { left: 4, right: 4 },
                    isWbs: true
                } 
            },
            '', '', '', '', '', '', ''
        ]);

        catArticles.forEach((art, artIndex) => {
            const wbsNum = cat.code.match(/WBS\.(\d+)/)?.[1] || cat.code;
            const artNum = `${parseInt(wbsNum, 10)}.${artIndex + 1}`;

            // Article Main Row
            tableBody.push([
                { content: artNum, styles: { isArt: true, fontStyle: 'bold', halign: 'center', cellPadding: { top: 3, bottom: 1 } } },
                { content: art.code, styles: { isArt: true, fontStyle: 'bold', cellPadding: { top: 3, bottom: 1 } } },
                { 
                    content: art.description, 
                    styles: { 
                        isArt: true, 
                        fontStyle: 'normal', 
                        halign: 'justify', 
                        cellPadding: { left: 4, right: 4, top: 3, bottom: 2 }, 
                        fontSize: 7.5,
                        valign: 'top'
                    } 
                },
                '', '', '', '', '', '', ''
            ]);

            // Label for measurements
            tableBody.push([ '', '', { content: 'ELENCO MISURE:', styles: { fontStyle: 'bold', fontSize: 6.5, textColor: [100, 100, 100], cellPadding: { top: 2, bottom: 1, left: 4 } } }, '', '', '', '', '', '', '' ]);

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
                
                tableBody.push([
                    '', '', 
                    { 
                        content: m.type === 'subtotal' ? 'Sommano parziali' : m.description, 
                        styles: { 
                            fontStyle: 'bold',
                            halign: m.type === 'subtotal' ? 'right' : 'left',
                            textColor: m.type === 'deduction' ? [200, 0, 0] : [0, 0, 0],
                            cellPadding: { left: m.type === 'subtotal' ? 4 : 6, top: 1, bottom: 1 } 
                        } 
                    },
                    formatNumber(m.multiplier), formatNumber(m.length), formatNumber(m.width), formatNumber(m.height),
                    { content: formatNumber(displayVal), styles: { halign: 'right', fontStyle: 'bold', cellPadding: { right: 1.5 } } },
                    '', ''
                ]);
            });

            const totalAmount = art.quantity * art.unitPrice;
            tableBody.push([
                '', '', { content: `SOMMANO ${art.unit}`, styles: { fontStyle: 'bold', halign: 'right', cellPadding: { right: 5, top: 3, bottom: 2 }, isTotalRow: true } },
                '', '', '', '',
                { content: formatNumber(art.quantity), styles: { fontStyle: 'bold', halign: 'right', cellPadding: { top: 3, right: 1.5 }, isTotalRow: true } },
                { content: formatNumber(art.unitPrice), styles: { halign: 'right', cellPadding: { top: 3, right: 1.5 }, isTotalRow: true } },
                { content: totalAmount, styles: { fontStyle: 'bold', halign: 'right', textColor: [0, 0, 120], cellPadding: { top: 3, right: 1.5 }, isTotalRow: true } } 
            ]);

            tableBody.push([{ content: '', colSpan: 10, styles: { cellPadding: 1.5 } }]);
        });
    });

    let grandTotal = 0; 
    let pageTotal = 0;  

    autoTable(doc, {
      head: [['Num.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'par.ug.', 'lung.', 'larg.', 'H/peso', 'Quantità', 'unitario', 'TOTALE']],
      body: tableBody,
      startY: 47,
      margin: { top: 25, bottom: 25, left: 10, right: 10 }, 
      theme: 'plain', 
      styles: { fontSize: 7.5, valign: 'top', cellPadding: 1.2, lineWidth: 0, overflow: 'linebreak', font: 'helvetica' },
      columnStyles: {
          0: { cellWidth: 10, halign: 'center' }, 
          1: { cellWidth: 22, halign: 'left' }, 
          2: { cellWidth: 60, halign: 'left' }, 
          3: { cellWidth: 10, halign: 'center' }, 
          4: { cellWidth: 12, halign: 'center' }, 
          5: { cellWidth: 12, halign: 'center' }, 
          6: { cellWidth: 12, halign: 'center' }, 
          7: { cellWidth: 18, halign: 'right', cellPadding: { right: 1.5 } }, 
          8: { cellWidth: 18, halign: 'right', cellPadding: { right: 1.5 } }, 
          9: { cellWidth: 16, halign: 'right', cellPadding: { right: 1.5 } }  
      },
      headStyles: { fillColor: [245, 245, 245], textColor: [0,0,0], fontStyle: 'bold', halign: 'center', lineWidth: { bottom: 0.2 }, lineColor: [0,0,0] },
      didDrawCell: (data: any) => {
          if (data.section === 'body' && data.cell.styles.isTotalRow) {
              if (data.column.index >= 7 && data.column.index <= 9) {
                  const x = data.cell.x; const y = data.cell.y; const w = data.cell.width;
                  doc.setDrawColor(0); doc.setLineWidth(0.3); doc.line(x, y, x + w, y);
                  doc.setLineWidth(0.1); doc.line(x, y + 0.6, x + w, y + 0.6);
                  doc.setLineWidth(0.1);
              }
          }
          if (data.section === 'body' && data.column.index === 9) {
              const rawVal = data.cell.raw;
              if (typeof rawVal === 'number' || (typeof rawVal === 'object' && (rawVal as any).content && typeof (rawVal as any).content === 'number')) {
                  pageTotal += (typeof rawVal === 'number' ? rawVal : (rawVal as any).content);
              }
          }
      },
      didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 9) {
               const rawVal = data.cell.raw;
               if (typeof rawVal === 'object' && typeof (rawVal as any).content === 'number') {
                   data.cell.text = [formatCurrency((rawVal as any).content)];
               }
          }
      },
      didDrawPage: (data: any) => {
          const currentTableStartY = data.pageNumber === 1 ? 47 : 25;
          const tableEndY = pageHeight - 25;
          drawHeader(doc, projectInfo, "COMPUTO METRICO ESTIMATIVO", data.pageNumber, grandTotal);
          drawGridLines(doc, currentTableStartY, tableEndY);
          drawTableFrame(doc, currentTableStartY, tableEndY);
          drawFooter(doc, data.pageNumber, grandTotal, pageTotal);
          grandTotal += pageTotal;
          pageTotal = 0;
      }
    });

    // --- DOCUMENT CLOSURE / SIGNATURE SECTION ---
    let finalY = (doc as any).lastAutoTable.finalY + 15;
    if (finalY > pageHeight - 75) { doc.addPage(); finalY = 30; }

    const descColX = 42; const descColWidth = 60; 
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`${projectInfo.location}, ${projectInfo.date}`, descColX + 4, finalY);
    finalY += 12;
    doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("IL PROGETTISTA", descColX + descColWidth / 2, finalY, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.text(projectInfo.designer, descColX + descColWidth / 2, finalY + 7, { align: 'center' });
    
    doc.setDrawColor(0); doc.setLineWidth(0.1);
    let closingLineY = finalY + 14;
    const lineMargin = 5; 
    while (closingLineY < pageHeight - 25) {
        doc.line(descColX + lineMargin, closingLineY, descColX + descColWidth - lineMargin, closingLineY);
        closingLineY += 4.5; 
    }

    // --- SUMMARY PAGE ---
    doc.addPage();
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("RIEPILOGO GENERALE", 12, 22);
    const summaryRows: any[] = [];
    let totalWorks = 0;
    categories.forEach(cat => {
        if (!cat.isEnabled) return;
        const catTotal = articles.filter(a => a.categoryCode === cat.code).reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
        if (catTotal > 0.01) {
            totalWorks += catTotal;
            summaryRows.push([cat.code, cat.name, formatCurrency(catTotal)]);
        }
    });
    const safetyCosts = totalWorks * (projectInfo.safetyRate / 100);
    summaryRows.push(['', '', '']); 
    summaryRows.push([{ content: 'TOTALE GENERALE (Escluso IVA)', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 230, 230] } }, { content: formatCurrency(totalWorks + safetyCosts), styles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 230, 230], cellPadding: { right: 1.5 } } }]);

    autoTable(doc, {
        head: [['Codice', 'Descrizione Capitolo', 'Importo (€)']],
        body: summaryRows,
        startY: 32,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 45, halign: 'right', cellPadding: { right: 1.5 } } },
        headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255] }
    });

    const pdfBlob = doc.output('blob');
    window.open(URL.createObjectURL(pdfBlob), '_blank');
  } catch (error) { console.error(error); alert("Errore PDF."); }
};

// --------------------------------------------------------------------------------
// 2. ELENCO PREZZI UNITARI
// --------------------------------------------------------------------------------
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
                tableBody.push([
                    { content: `${getWbsNumber(cat.code)}.${artIndex + 1}`, styles: { halign: 'center' } },
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
            startY: 40,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2.5 },
            columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 25 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 15 }, 4: { cellWidth: 45 } },
            headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255] },
            didDrawPage: (data: any) => {
                drawHeaderSimple(doc, projectInfo, "ELENCO PREZZI UNITARI", data.pageNumber);
            }
        });
        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (e) { alert("Errore Elenco Prezzi."); }
};

// --------------------------------------------------------------------------------
// 3. STIMA INCIDENZA MANODOPERA
// --------------------------------------------------------------------------------
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
                const totalItem = art.quantity * art.unitPrice;
                const laborPart = totalItem * (art.laborRate / 100);
                totalLaborSum += laborPart;
                tableBody.push([
                    { content: `${getWbsNumber(cat.code)}.${artIndex + 1}`, styles: { halign: 'center' } },
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
            startY: 40,
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

// --------------------------------------------------------------------------------
// 4. ANALISI DEI PREZZI UNITARI
// --------------------------------------------------------------------------------
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