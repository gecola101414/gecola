
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

// Internal logic to calculate single measurement row value
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

// --- COMMON SETUP (Dynamic Import) ---
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
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(`Committente: ${projectInfo.client}`, 10, 27);
        doc.text(`Data: ${projectInfo.date}`, 10, 31);
        doc.text(`Prezzario: ${projectInfo.region} ${projectInfo.year}`, 10, 35);
    } else {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(projectInfo.title, 10, 20);
    }
    if (pageNumber > 1 && grandTotal !== undefined) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("RIPORTO:", 160, 28, { align: 'right' });
        doc.text(isTotalCurrency ? formatCurrency(grandTotal) : formatNumber(grandTotal), 200, 28, { align: 'right' });
    }
};

const drawFooter = (doc: any, pageNumber: number, grandTotal: number | undefined, pageTotal: number | undefined, pageWidth: number, pageHeight: number, isTotalCurrency: boolean = true) => {
    const footerY = pageHeight - 15;
    if (grandTotal !== undefined && pageTotal !== undefined) {
        const currentCumulative = grandTotal + pageTotal;
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("A RIPORTARE:", 160, footerY, { align: 'right' });
        doc.text(isTotalCurrency ? formatCurrency(currentCumulative) : formatNumber(currentCumulative), 200, footerY, { align: 'right' });
    }
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Pag. ${pageNumber}`, pageWidth / 2, footerY + 5, { align: 'center' });
};

// --------------------------------------------------------------------------------
// 1. COMPUTO METRICO ESTIMATIVO (Standard)
// --------------------------------------------------------------------------------
export const generateComputoMetricPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
  try {
    const { jsPDF, autoTable } = await getLibs();
    const doc = new jsPDF();
    const tableBody: any[] = [];

    categories.forEach((cat) => {
        if (!cat.isEnabled) return;
        const catArticles = articles.filter(a => a.categoryCode === cat.code);
        if (catArticles.length === 0) return;

        tableBody.push([{ content: `${cat.code} - ${cat.name}`, colSpan: 10, styles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0,0,0], halign: 'left' } }]);

        catArticles.forEach((art, artIndex) => {
            const wbsNum = cat.code.match(/WBS\.(\d+)/)?.[1] || cat.code;
            const artNum = `${parseInt(wbsNum, 10)}.${artIndex + 1}`;

            tableBody.push([
                { content: artNum, styles: { fontStyle: 'bold', halign: 'center', valign: 'top' } },
                { content: art.code, styles: { fontStyle: 'bold', valign: 'top' } },
                { content: art.description, styles: { fontStyle: 'normal', halign: 'justify', valign: 'top' } },
                '', '', '', '', '', '', '' 
            ]);

            tableBody.push([ '', '', { content: 'ELENCO DELLE MISURE:', styles: { fontStyle: 'bold', fontSize: 7, textColor: [80, 80, 80], cellPadding: { bottom: 0, top: 1, left: 3 } } }, '', '', '', '', '', '', '' ]);

            let runningPartial = 0;
            art.measurements.forEach(m => {
                let val = 0;
                let linkedDesc = '';
                if (m.linkedArticleId) {
                    const linkedArt = articles.find(a => a.id === m.linkedArticleId);
                    if (linkedArt) {
                        const base = m.linkedType === 'amount' ? (linkedArt.quantity * linkedArt.unitPrice) : linkedArt.quantity;
                        val = calculateMeasurementValue(m, base);
                        linkedDesc = ` (Vedi: ${linkedArt.code})`;
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
                tableBody.push([
                    '', '', 
                    { content: m.type === 'subtotal' ? 'Sommano parziale' : (m.description + linkedDesc), styles: m.type === 'subtotal' ? { fontStyle: 'bold', halign: 'right' } : (m.type === 'deduction' ? { textColor: [200, 0, 0] } : {}) },
                    formatNumber(m.multiplier), formatNumber(m.length), formatNumber(m.width), formatNumber(m.height),
                    { content: formatNumber(displayVal), styles: { halign: 'right', fontStyle: m.type === 'subtotal' ? 'bold' : 'normal', fillColor: m.type === 'subtotal' ? [255, 253, 208] : false } },
                    '', ''
                ]);
            });

            const totalAmount = art.quantity * art.unitPrice;
            tableBody.push([
                '', '', { content: `SOMMANO ${art.unit}`, styles: { fontStyle: 'bold', halign: 'right' } },
                '', '', '', '',
                { content: formatNumber(art.quantity), styles: { fontStyle: 'bold', halign: 'right', lineWidth: { top: 0.1 }, lineColor: [0,0,0] } },
                { content: formatNumber(art.unitPrice), styles: { halign: 'right' } },
                { content: totalAmount, styles: { fontStyle: 'bold', halign: 'right', textColor: [0, 0, 150] } } 
            ]);
        });
    });

    let grandTotal = 0; 
    let pageTotal = 0;  

    autoTable(doc, {
      head: [['Num.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'par.ug.', 'lung.', 'larg.', 'H/peso', 'Quantità', 'unitario', 'TOTALE']],
      body: tableBody,
      startY: 40,
      margin: { top: 35, bottom: 30, left: 10, right: 10 }, 
      theme: 'grid',
      styles: { fontSize: 8, valign: 'top', cellPadding: 1, lineColor: [200,200,200], lineWidth: 0.1, overflow: 'linebreak' },
      columnStyles: {
          0: { cellWidth: 10, halign: 'center' }, 
          1: { cellWidth: 22 }, 
          2: { cellWidth: 'auto', cellPadding: { top: 1, bottom: 1, left: 3, right: 3 } }, 
          3: { cellWidth: 10, halign: 'center' }, 
          4: { cellWidth: 12, halign: 'center' }, 
          5: { cellWidth: 12, halign: 'center' }, 
          6: { cellWidth: 12, halign: 'center' }, 
          7: { cellWidth: 18, halign: 'right' }, 
          8: { cellWidth: 18, halign: 'right' }, 
          9: { cellWidth: 22, halign: 'right' }  
      },
      headStyles: { fillColor: [240, 240, 240], textColor: [0,0,0], lineWidth: 0.1, lineColor: [100,100,100] },
      didDrawCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 9) {
              const rawVal = data.cell.raw;
              if (typeof rawVal === 'number' || (typeof rawVal === 'object' && (rawVal as any).content && typeof (rawVal as any).content === 'number')) {
                  const val = typeof rawVal === 'number' ? rawVal : (rawVal as any).content;
                  pageTotal += val;
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
          drawHeader(doc, projectInfo, "COMPUTO METRICO ESTIMATIVO", data.pageNumber, grandTotal, doc.internal.pageSize.width);
          drawFooter(doc, data.pageNumber, grandTotal, pageTotal, doc.internal.pageSize.width, doc.internal.pageSize.height);
          grandTotal += pageTotal;
          pageTotal = 0;
      }
    });

    // Summary Page
    doc.addPage();
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("RIEPILOGO GENERALE", 10, 20);
    const summaryRows: any[] = [];
    let totalWorks = 0;
    categories.forEach(cat => {
        if (!cat.isEnabled) return;
        const catTotal = articles.filter(a => a.categoryCode === cat.code).reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
        if (catTotal > 0) {
            totalWorks += catTotal;
            summaryRows.push([cat.code, cat.name, formatCurrency(catTotal)]);
        }
    });
    
    const safetyCosts = totalWorks * (projectInfo.safetyRate / 100);
    const totalWithSafety = totalWorks + safetyCosts;

    summaryRows.push(['', '', '']); 
    summaryRows.push([{ content: 'Totale Lavori (a)', colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } }, { content: formatCurrency(totalWorks), styles: { fontStyle: 'bold', halign: 'right' } }]);
    summaryRows.push([{ content: `Oneri Sicurezza (${projectInfo.safetyRate}%) (b)`, colSpan: 2, styles: { halign: 'right' } }, { content: formatCurrency(safetyCosts), styles: { halign: 'right' } }]);
    summaryRows.push([{ content: 'TOTALE GENERALE (Escluso IVA)', colSpan: 2, styles: { fontStyle: 'bold', fontSize: 12, halign: 'center', fillColor: [230, 230, 230] } }, { content: formatCurrency(totalWithSafety), styles: { fontStyle: 'bold', fontSize: 12, halign: 'right', fillColor: [230, 230, 230] } }]);

    autoTable(doc, {
        head: [['Codice', 'Descrizione Capitolato', 'Importo (€)']],
        body: summaryRows,
        startY: 35,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 40, halign: 'right' } },
        headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255], fontStyle: 'bold' }
    });

    doc.save(`${projectInfo.title.replace(/\s+/g, '_')}_Computo.pdf`);
  } catch (error) {
    console.error("PDF Error:", error);
    alert("Errore generazione PDF.");
  }
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

            tableBody.push([{ content: `${cat.code} - ${cat.name}`, colSpan: 5, styles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0,0,0] } }]);

            catArticles.forEach((art, artIndex) => {
                const wbsNum = cat.code.match(/WBS\.(\d+)/)?.[1] || cat.code;
                tableBody.push([
                    { content: `${parseInt(wbsNum, 10)}.${artIndex + 1}`, styles: { halign: 'center' } },
                    { content: art.code, styles: { fontStyle: 'bold' } },
                    { content: art.description, styles: { halign: 'justify', cellPadding: { left: 3, right: 3 } } },
                    { content: art.unit, styles: { halign: 'center' } },
                    { 
                        content: `€ ${formatCurrency(art.unitPrice)}\n(${numberToItalianWords(art.unitPrice)})`, 
                        styles: { halign: 'right', fontStyle: 'bold' } 
                    }
                ]);
            });
        });

        autoTable(doc, {
            head: [['N.Ord', 'Codice', 'Descrizione Articolo', 'U.M.', 'Prezzo Unitario']],
            body: tableBody,
            startY: 40,
            margin: { top: 35 },
            theme: 'grid',
            styles: { fontSize: 9, valign: 'top', cellPadding: 2, lineColor: [200,200,200], lineWidth: 0.1 },
            columnStyles: {
                0: { cellWidth: 15 },
                1: { cellWidth: 25 },
                2: { cellWidth: 'auto' },
                3: { cellWidth: 15 },
                4: { cellWidth: 40 }
            },
            headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255] },
            didDrawPage: (data: any) => {
                drawHeader(doc, projectInfo, "ELENCO PREZZI UNITARI", data.pageNumber);
            }
        });

        doc.save(`${projectInfo.title.replace(/\s+/g, '_')}_ElencoPrezzi.pdf`);
    } catch (e) {
        console.error(e);
        alert("Errore generazione Elenco Prezzi");
    }
};

// --------------------------------------------------------------------------------
// 3. STIMA INCIDENZA MANODOPERA
// --------------------------------------------------------------------------------
export const generateManodoperaPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
    try {
        const { jsPDF, autoTable } = await getLibs();
        const doc = new jsPDF();
        const tableBody: any[] = [];

        categories.forEach((cat) => {
            if (!cat.isEnabled) return;
            const catArticles = articles.filter(a => a.categoryCode === cat.code);
            if (catArticles.length === 0) return;

            // Header Categoria - COLSPAN 7 to match columns
            tableBody.push([{ content: `${cat.code} - ${cat.name}`, colSpan: 7, styles: { fillColor: [230, 230, 230], fontStyle: 'bold', textColor: [0,0,0] } }]);

            catArticles.forEach((art, artIndex) => {
                const wbsNum = cat.code.match(/WBS\.(\d+)/)?.[1] || cat.code;
                const totalAmount = art.quantity * art.unitPrice;
                const laborVal = totalAmount * (art.laborRate / 100);

                tableBody.push([
                    { content: `${parseInt(wbsNum, 10)}.${artIndex + 1}`, styles: { halign: 'center' } }, // 0
                    { content: art.code, styles: { fontStyle: 'bold' } }, // 1
                    { content: art.description, styles: { halign: 'justify', cellPadding: { left: 3, right: 3 } } }, // 2
                    { content: art.unit, styles: { halign: 'center' } }, // 3: U.M.
                    { content: formatNumber(art.quantity), styles: { halign: 'right' } }, // 4: Qty
                    { content: `${art.laborRate}%`, styles: { halign: 'center' } }, // 5: %
                    { content: laborVal, styles: { halign: 'right', fontStyle: 'bold' } } // 6: Amount
                ]);
            });
        });

        let grandTotal = 0;
        let pageTotal = 0;

        autoTable(doc, {
            head: [['N.', 'Codice', 'Descrizione', 'U.M.', 'Quantità', '% M.O.', 'Importo M.O.']],
            body: tableBody,
            startY: 40,
            margin: { top: 35, bottom: 30 },
            theme: 'grid',
            styles: { fontSize: 8, valign: 'top', cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 20 },
                2: { cellWidth: 'auto' },
                3: { cellWidth: 10, halign: 'center' }, // U.M.
                4: { cellWidth: 20, halign: 'right' }, // Qty
                5: { cellWidth: 15, halign: 'center' },
                6: { cellWidth: 25, halign: 'right' }
            },
            headStyles: { fillColor: [100, 100, 150], textColor: [255, 255, 255] },
            didDrawCell: (data: any) => {
                // Check index 6 for Amount (Importo M.O.)
                if (data.section === 'body' && data.column.index === 6) {
                    const rawVal = data.cell.raw;
                    if (typeof rawVal === 'number' || (typeof rawVal === 'object' && (rawVal as any).content && typeof (rawVal as any).content === 'number')) {
                        const val = typeof rawVal === 'number' ? rawVal : (rawVal as any).content;
                        pageTotal += val;
                    }
                }
            },
            didParseCell: (data: any) => {
                if (data.section === 'body' && data.column.index === 6) {
                     const rawVal = data.cell.raw;
                     if (typeof rawVal === 'object' && typeof (rawVal as any).content === 'number') {
                         data.cell.text = [formatCurrency((rawVal as any).content)];
                     } else if (typeof rawVal === 'number') {
                         data.cell.text = [formatCurrency(rawVal)];
                     }
                }
            },
            didDrawPage: (data: any) => {
                drawHeader(doc, projectInfo, "STIMA INCIDENZA MANODOPERA", data.pageNumber, grandTotal, undefined, undefined, true);
                drawFooter(doc, data.pageNumber, grandTotal, pageTotal, doc.internal.pageSize.width, doc.internal.pageSize.height, true);
                grandTotal += pageTotal;
                pageTotal = 0;
            }
        });

        // --- RIEPILOGO FINALE PER WBS ---
        doc.addPage();
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("RIEPILOGO INCIDENZA MANODOPERA PER CATEGORIE", 10, 20);
        
        const summaryRows: any[] = [];
        let totalLaborSum = 0;

        categories.forEach(cat => {
            if (!cat.isEnabled) return;
            const catLaborTotal = articles.filter(a => a.categoryCode === cat.code).reduce((sum, a) => {
                const itemTotal = a.quantity * a.unitPrice;
                const laborPart = itemTotal * (a.laborRate / 100);
                return sum + laborPart;
            }, 0);

            if (catLaborTotal > 0) {
                totalLaborSum += catLaborTotal;
                summaryRows.push([cat.code, cat.name, formatCurrency(catLaborTotal)]);
            }
        });

        summaryRows.push(['', '', '']);
        summaryRows.push([
            { content: 'TOTALE GENERALE MANODOPERA', colSpan: 2, styles: { fontStyle: 'bold', fontSize: 11, halign: 'center', fillColor: [230, 230, 230] } }, 
            { content: formatCurrency(totalLaborSum), styles: { fontStyle: 'bold', fontSize: 11, halign: 'right', fillColor: [230, 230, 230] } }
        ]);

        autoTable(doc, {
            head: [['Codice WBS', 'Descrizione Categoria', 'Importo Manodopera (€)']],
            body: summaryRows,
            startY: 30,
            theme: 'grid',
            styles: { fontSize: 10, cellPadding: 3 },
            columnStyles: { 
                0: { cellWidth: 30 }, 
                1: { cellWidth: 'auto' }, 
                2: { cellWidth: 50, halign: 'right' } 
            },
            headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255], fontStyle: 'bold' }
        });

        doc.save(`${projectInfo.title.replace(/\s+/g, '_')}_Manodopera.pdf`);

    } catch (e) {
        console.error(e);
        alert("Errore generazione Stima Manodopera");
    }
};

// --------------------------------------------------------------------------------
// 4. ANALISI PREZZI PDF
// --------------------------------------------------------------------------------
export const generateAnalisiPrezziPdf = async (projectInfo: ProjectInfo, analyses: PriceAnalysis[]) => {
    try {
        const { jsPDF, autoTable } = await getLibs();
        const doc = new jsPDF();
        
        if (analyses.length === 0) {
            alert("Nessuna analisi da stampare.");
            return;
        }

        analyses.forEach((analysis, index) => {
            if (index > 0) doc.addPage(); // New page for each analysis (professional look)

            drawHeader(doc, projectInfo, "ANALISI DEI NUOVI PREZZI", index + 1, undefined, undefined, undefined, false);

            // Title of Analysis
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(0,0,0);
            doc.text(`${analysis.code} - ${analysis.description}`, 14, 40);
            
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(80,80,80);
            doc.text(`Analisi eseguita per una quantità di: ${analysis.analysisQuantity} ${analysis.unit}`, 14, 45);

            // Components Table
            const body = analysis.components.map(c => {
                let typeStr = "";
                if (c.type === 'material') typeStr = 'Mat.';
                else if (c.type === 'labor') typeStr = 'M.O.';
                else if (c.type === 'equipment') typeStr = 'Noli';
                else typeStr = 'Gen.';

                return [
                    typeStr,
                    c.description,
                    c.unit,
                    formatCurrency(c.unitPrice),
                    formatNumber(c.quantity),
                    formatCurrency(c.unitPrice * c.quantity)
                ];
            });

            // Summary Rows (appended to the table or separate, let's append for layout consistency)
            // But usually summary is at bottom right. AutoTable makes it hard to align right without rows.
            // Let's draw the main table first.
            
            autoTable(doc, {
                startY: 50,
                head: [['Tipo', 'Descrizione Elemento', 'U.M.', 'Pr. Unit.', 'Quantità', 'Importo']],
                body: body,
                theme: 'striped',
                styles: { fontSize: 9, cellPadding: 2 },
                headStyles: { fillColor: [80, 80, 80], textColor: [255, 255, 255] },
                columnStyles: {
                    0: { cellWidth: 15, fontStyle: 'bold' },
                    1: { cellWidth: 'auto' },
                    2: { cellWidth: 15, halign: 'center' },
                    3: { cellWidth: 25, halign: 'right' },
                    4: { cellWidth: 20, halign: 'center' },
                    5: { cellWidth: 25, halign: 'right' }
                },
                foot: [
                    [{ content: 'Totale Costo Tecnico', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatCurrency(analysis.costoTecnico), styles: { halign: 'right', fontStyle: 'bold' } }]
                ]
            });

            // Calculate Summary Block Position
            let finalY = (doc as any).lastAutoTable.finalY + 10;
            
            // Avoid page break for summary if possible
            if (finalY > 250) {
                doc.addPage();
                finalY = 20;
            }

            const rightMargin = 195;
            const labelX = 140;
            const valueX = 195;

            doc.setFontSize(9);
            
            // Spese Generali
            doc.setFont("helvetica", "normal");
            doc.text(`Spese Generali (${analysis.generalExpensesRate}%)`, labelX, finalY, { align: 'right' });
            doc.text(formatCurrency(analysis.valoreSpese), valueX, finalY, { align: 'right' });
            
            finalY += 6;
            // Utile
            doc.text(`Utile d'Impresa (${analysis.profitRate}%)`, labelX, finalY, { align: 'right' });
            doc.text(formatCurrency(analysis.valoreUtile), valueX, finalY, { align: 'right' });

            finalY += 2;
            doc.setDrawColor(0);
            doc.line(labelX - 40, finalY, valueX, finalY);
            
            finalY += 6;
            // Totale Batch
            doc.setFont("helvetica", "bold");
            doc.text(`Totale Analisi (${analysis.analysisQuantity} ${analysis.unit})`, labelX, finalY, { align: 'right' });
            doc.text(formatCurrency(analysis.totalBatchValue), valueX, finalY, { align: 'right' });

            finalY += 10;
            // PREZZO UNITARIO BOX
            doc.setFillColor(230, 230, 230);
            doc.rect(100, finalY - 6, 95, 12, 'F');
            doc.setFontSize(11);
            doc.text("PREZZO UNITARIO APPLICATO", 105, finalY + 2);
            doc.text(`€ ${formatCurrency(analysis.totalUnitPrice)}`, 190, finalY + 2, { align: 'right' });
        });

        doc.save(`${projectInfo.title.replace(/\s+/g, '_')}_AnalisiPrezzi.pdf`);

    } catch (e) {
        console.error(e);
        alert("Errore generazione Analisi Prezzi PDF");
    }
};

// Re-export original name for backward compatibility
export const generateProfessionalPdf = generateComputoMetricPdf;
