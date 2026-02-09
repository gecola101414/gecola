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
    if (h > 0) { if (h === 1) output += 'cento'; else output += units[h] + 'cento'; }
    if (t === 1) { output += teens[u]; } else {
        if (t > 1) { let tenStr = tens[t]; if (u === 1 || u === 8) tenStr = tenStr.substring(0, tenStr.length - 1); output += tenStr; }
        if (u > 0 && t !== 1) output += units[u];
    }
    return output;
};

const numberToItalianWords = (num: number): string => {
    if (num === 0) return 'zero';
    const integerPart = Math.floor(Math.abs(num));
    const decimalPart = Math.round((Math.abs(num) - integerPart) * 100);
    let words = '';
    if (integerPart >= 1000000) return "Valore troppo alto"; 
    if (integerPart >= 1000) {
        const thousands = Math.floor(integerPart / 1000);
        const remainder = integerPart % 1000;
        if (thousands === 1) words += 'mille'; else words += convertGroup(thousands) + 'mila';
        if (remainder > 0) words += convertGroup(remainder);
    } else { words += convertGroup(integerPart); }
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

// Task 3: Forza sempre l'uso dei separatori di migliaia con it-IT
const formatCurrency = (val: number | undefined | null) => {
  if (val === undefined || val === null) return '';
  return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(val);
};

const formatNumber = (val: number | undefined | null) => {
  if (val === undefined || val === null) return '';
  // Se è esattamente 0 mostriamo 0,00 per coerenza finanziaria se richiesto, altrimenti seguiamo la logica esistente
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

const drawFooter = (doc: any, pageNumber: number, grandTotal: number | undefined, pageTotal: number | undefined, pageWidth: number, pageHeight: number, isTotalCurrency: boolean = true, isLastPageOfTable: boolean = false) => {
    const footerY = pageHeight - 15;
    // Task 2: Elimina "A RIPORTARE" nell'ultima pagina della tabella
    if (!isLastPageOfTable && grandTotal !== undefined && pageTotal !== undefined) {
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

const drawSignature = (doc: any, projectInfo: ProjectInfo, yPos: number) => {
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    let finalY = yPos + 15;
    
    if (finalY > pageHeight - 50) { 
        doc.addPage(); 
        finalY = 25; 
        drawHeader(doc, projectInfo, "FIRMA E CHIUSURA", 99, undefined, pageWidth, pageHeight);
    }
    
    doc.setDrawColor(200);
    doc.setLineWidth(0.1);
    doc.line(10, finalY, pageWidth - 10, finalY);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${projectInfo.location}, ${projectInfo.date}`, 10, finalY + 10);
    
    const signatureX = pageWidth - 70;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("IL PROGETTISTA", signatureX + 30, finalY + 18, { align: 'center' });
    
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(signatureX, finalY + 28, signatureX + 60, finalY + 28);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(projectInfo.designer, signatureX + 30, finalY + 34, { align: 'center' });
    
    return finalY + 40;
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

const appendWbsToPdfBody = (tableBody: any[], cat: Category, articles: Article[]) => {
    const catArticles = articles.filter(a => a.categoryCode === cat.code);
    if (catArticles.length === 0) return;

    const isSafety = cat.type === 'safety';
    const fillColor = isSafety ? [255, 200, 150] : [240, 240, 240];
    const textColor = [0, 0, 0];

    tableBody.push([
        { content: '', styles: { isWbs: true, lineWidth: 0 } }, 
        { content: '', styles: { isWbs: true, lineWidth: 0 } }, 
        { content: `${cat.code} - ${cat.name}`, styles: { fillColor, textColor, fontStyle: 'bold', halign: 'left', cellPadding: { left: 1, right: 1, top: 3, bottom: 3 }, isWbs: true, lineWidth: 0 } },
        { content: '', styles: { isWbs: true, lineWidth: 0 } },
        { content: '', styles: { isWbs: true, lineWidth: 0 } },
        { content: '', styles: { isWbs: true, lineWidth: 0 } },
        { content: '', styles: { isWbs: true, lineWidth: 0 } },
        { content: '', styles: { isWbs: true, lineWidth: 0 } },
        { content: '', styles: { isWbs: true, lineWidth: 0 } },
        { content: '', styles: { isWbs: true, lineWidth: 0 } }
    ]);

    catArticles.forEach((art, artIndex) => {
        const wbsN = getWbsNumber(cat.code);
        const artNum = `${wbsN}.${artIndex + 1}`;
        tableBody.push([
            { content: artNum, styles: { isArt: true, fontStyle: 'bold', halign: 'center', cellPadding: { top: 3, bottom: 1 } } },
            { content: art.code, styles: { isArt: true, fontStyle: 'bold', cellPadding: { top: 3, bottom: 1 } } },
            { content: art.description, styles: { isArt: true, fontStyle: 'normal', halign: 'justify', cellPadding: { left: 1, right: 1, top: 3, bottom: 2 }, fontSize: 8.5, valign: 'top', textColor: isSafety ? [200, 80, 0] : [20, 20, 20] } },
            '', '', '', '', '', '', ''
        ]);
        
        tableBody.push([
            '', '', 
            { content: 'ELENCO DELLE MISURE', styles: { fontStyle: 'bold', fontSize: 7.5, textColor: [40, 40, 40], cellPadding: { left: 3, top: 1, bottom: 1 } } },
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
            tableBody.push([ '', '', { content: m.type === 'subtotal' ? 'Sommano parziali' : m.description, styles: { fontStyle: m.type === 'subtotal' ? 'bold' : 'normal', halign: m.type === 'subtotal' ? 'right' : 'left', textColor: m.type === 'deduction' ? [200, 0, 0] : [60, 60, 60], cellPadding: { left: m.type === 'subtotal' ? 1 : 2, top: 1, bottom: 1 }, fontSize: 8 } }, { content: formatNumber(m.multiplier), styles: { halign: 'center' } }, { content: formatNumber(m.length), styles: { halign: 'center' } }, { content: formatNumber(m.width), styles: { halign: 'center' } }, { content: formatNumber(m.height), styles: { halign: 'center' } }, { content: formatNumber(displayVal), styles: { halign: 'right', fontStyle: 'normal', cellPadding: { left: 1.5 }, fontSize: 8 } }, '', '' ]);
        });
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
                    appendWbsToPdfBody(tableBody, child, articles);
                    const catArticles = articles.filter(a => a.categoryCode === child.code);
                    globalTotalForClosing += catArticles.reduce((s, a) => s + (a.quantity * a.unitPrice), 0);
                });
            }
        } else if (root.type === filterType) {
            appendWbsToPdfBody(tableBody, root, articles);
            const catArticles = articles.filter(a => a.categoryCode === root.code);
            globalTotalForClosing += catArticles.reduce((s, a) => s + (a.quantity * a.unitPrice), 0);
        }
    });

    // Task: Riga di chiusura "TOTALE COMPUTO"
    // Riga 1: Etichetta e Valore numerico (impegna ultime 3 colonne)
    tableBody.push([
        { content: '', colSpan: 2, styles: { lineWidth: 0 } },
        { content: 'TOTALE COMPUTO', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right', fontSize: 10, cellPadding: 4, fillColor: [245, 245, 245] } },
        { 
            content: `€ ${formatCurrency(globalTotalForClosing)}`, 
            colSpan: 3, 
            styles: { fontStyle: 'bold', halign: 'right', fontSize: 10, cellPadding: 4, fillColor: [245, 245, 245], textColor: [0, 0, 150] } 
        }
    ]);
    // Riga 2: Valore in lettere (impegna ultime 5 colonne)
    tableBody.push([
        { content: '', colSpan: 5, styles: { lineWidth: 0 } },
        { 
            content: `(${numberToItalianWords(globalTotalForClosing)})`, 
            colSpan: 5, 
            styles: { fontStyle: 'italic', halign: 'right', fontSize: 8.5, cellPadding: { top: 0, bottom: 4, right: 4 }, fillColor: [245, 245, 245], textColor: [0, 0, 150] } 
        }
    ]);

    let grandTotal = 0; let pageTotal = 0;  
    autoTable(doc, {
      head: [['Num.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'par.ug.', 'lung.', 'larg.', 'H/peso', 'Quantità', 'unitario', 'TOTALE']],
      body: tableBody,
      startY: 44, 
      margin: { top: 38, bottom: 25, left: 10, right: 10 }, 
      theme: 'plain', 
      styles: { fontSize: 8, valign: 'top', cellPadding: 1.2, lineWidth: 0, overflow: 'linebreak', font: 'helvetica' },
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
      didDrawCell: (data: any) => {
          if (data.section === 'body' && data.cell.styles.isTotalRow && data.column.index === 7) {
              doc.setDrawColor(150, 150, 150); 
              const leftPadding = 1.5; const xStart = data.cell.x + leftPadding; const xEnd = data.cell.x + data.cell.width;
              doc.setLineWidth(0.15); doc.line(xStart, data.cell.y, xEnd, data.cell.y);
              doc.setLineWidth(0.4); doc.line(xStart, data.cell.y + data.cell.height, xEnd, data.cell.y + data.cell.height);
              doc.setLineWidth(0.15); doc.line(xStart, data.cell.y + data.cell.height + 0.6, xEnd, data.cell.y + data.cell.height + 0.6);
              doc.setLineWidth(0.1); 
          }
          // Calcolo pageTotal includendo la riga del totale computo (ora inizia a colonna 7 con colSpan 3)
          if (data.section === 'body' && (data.column.index === 9 || (data.column.index === 7 && data.cell.colSpan === 3))) {
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
          if (data.section === 'body' && data.column.index === 9) {
               const raw = data.cell.raw;
               if (typeof raw === 'number') data.cell.text = [formatCurrency(raw)];
               else if (raw?.content && typeof raw.content === 'number') data.cell.text = [formatCurrency(raw.content)];
          }
      },
      didDrawPage: (data: any) => {
          const currentTableStartY = data.pageNumber === 1 ? 44 : 38; const tableEndY = pageHeight - 25;
          drawHeader(doc, projectInfo, title, data.pageNumber, grandTotal, doc.internal.pageSize.width, doc.internal.pageSize.height);
          drawGridLines(doc, currentTableStartY, tableEndY); drawTableFrame(doc, currentTableStartY, tableEndY);
          
          const isLastPageOfTable = Math.abs((grandTotal + pageTotal) - globalTotalForClosing) < 0.05;
          drawFooter(doc, data.pageNumber, grandTotal, pageTotal, doc.internal.pageSize.width, doc.internal.pageSize.height, true, isLastPageOfTable);
          
          grandTotal += pageTotal; pageTotal = 0;
      }
    });

    doc.addPage();
    const summaryTableBody: any[] = [];
    let totalLavoriSum = 0;
    let totalLaborSum = 0;

    categories.forEach(cat => {
        if (cat.isEnabled === false || cat.isSuperCategory || cat.type !== filterType) return;
        const catArticles = articles.filter(a => a.categoryCode === cat.code);
        const catTotal = catArticles.reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
        const catLabor = catArticles.reduce((sum, a) => sum + ((a.quantity * a.unitPrice) * (a.laborRate / 100)), 0);
        
        if (catTotal > 0 || catArticles.length > 0) {
            totalLavoriSum += catTotal;
            totalLaborSum += catLabor;
            summaryTableBody.push([
                { content: cat.code, styles: { fontStyle: 'bold', halign: 'center' } },
                { content: cat.name.toUpperCase(), styles: { halign: 'left' } },
                { content: formatCurrency(catTotal), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: formatCurrency(catLabor), styles: { halign: 'right' } }
            ]);
        }
    });

    summaryTableBody.push([
        { content: 'TOTALE GENERALE', colSpan: 2, styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'right' } },
        { content: formatCurrency(totalLavoriSum), styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'right' } },
        { content: formatCurrency(totalLaborSum), styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'right' } }
    ]);

    autoTable(doc, {
        head: [['COD.', 'DESCRIZIONE CAPITOLO (WBS)', 'IMPORTO LAVORI', 'INCIDENZA M.O.']],
        body: summaryTableBody,
        startY: 30,
        margin: { left: 10, right: 10 },
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 100 }, 
            2: { cellWidth: 35 },
            3: { cellWidth: 35 }
        },
        headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        didDrawPage: (data) => {
            doc.setFontSize(12); doc.setFont("helvetica", "bold");
            doc.text(`RIEPILOGO GENERALE ${filterType === 'work' ? 'LAVORI' : 'SICUREZZA'}`, 105, 20, { align: 'center' });
        }
    });

    drawSignature(doc, projectInfo, (doc as any).lastAutoTable.finalY);
    window.open(URL.createObjectURL(doc.output('blob')), '_blank');
  } catch (error) { console.error(error); alert("Errore PDF."); }
};

export const generateComputoSicurezzaPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
    return generateComputoMetricPdf(projectInfo, categories, articles, 'safety');
};

export const generateElencoPrezziPdf = async (projectInfo: ProjectInfo, categories: Category[], articles: Article[]) => {
    try {
        const { jsPDF, autoTable } = await getLibs();
        const doc = new jsPDF();
        const tableBody: any[] = [];
        categories.forEach((cat) => {
            if (cat.isSuperCategory) return;
            if (!cat.isEnabled) return;
            const catArticles = articles.filter(a => a.categoryCode === cat.code);
            if (catArticles.length === 0) return;
            tableBody.push([{ content: `${cat.code} - ${cat.name}`, colSpan: 5, styles: { fillColor: [230, 230, 230], fontStyle: 'bold' } }]);
            catArticles.forEach((art, artIndex) => {
                tableBody.push([{ content: `${getWbsNumber(cat.code)}.${artIndex + 1}`, styles: { halign: 'center' } }, { content: art.code, styles: { fontStyle: 'bold' } }, { content: art.description, styles: { halign: 'justify', fontSize: 8 } }, { content: art.unit, styles: { halign: 'center' } }, { content: `€ ${formatCurrency(art.unitPrice)}\n(${numberToItalianWords(art.unitPrice)})`, styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.5 } }]);
            });
        });
        autoTable(doc, { head: [['N.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'U.M.', 'PREZZO UNITARIO']], body: tableBody, startY: 40, theme: 'grid', styles: { fontSize: 8, cellPadding: 2.5 }, headStyles: { fillColor: [60, 60, 60] }, didDrawPage: (data: any) => { drawHeaderSimple(doc, projectInfo, "ELENCO PREZZI UNITARI", data.pageNumber); } });
        drawSignature(doc, projectInfo, (doc as any).lastAutoTable.finalY);
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
            if (cat.isSuperCategory) return;
            if (!cat.isEnabled) return;
            const catArticles = articles.filter(a => a.categoryCode === cat.code);
            if (catArticles.length === 0) return;
            tableBody.push([{ content: `${cat.code} - ${cat.name}`, colSpan: 6, styles: { fillColor: [230, 230, 230], fontStyle: 'bold' } }]);
            catArticles.forEach((art, artIndex) => {
                const totalItem = art.quantity * art.unitPrice;
                const laborPart = totalItem * (art.laborRate / 100);
                totalLaborSum += laborPart;
                tableBody.push([ { content: `${getWbsNumber(cat.code)}.${artIndex + 1}`, styles: { halign: 'center' } }, art.code, { content: art.description, styles: { fontSize: 7, halign: 'justify' } }, { content: formatNumber(art.quantity), styles: { halign: 'right' } }, { content: `${art.laborRate}%`, styles: { halign: 'center' } }, { content: formatCurrency(laborPart), styles: { halign: 'right', fontStyle: 'bold' } } ]);
            });
        });
        tableBody.push([{ content: 'TOTALE GENERALE INCIDENZA MANODOPERA', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fillColor: [230, 230, 255] } }, { content: formatCurrency(totalLaborSum), styles: { halign: 'right', fontStyle: 'bold', fillColor: [230, 230, 255] } }]);
        autoTable(doc, { head: [['N.Ord', 'TARIFFA', 'DESIGNAZIONE DEI LAVORI', 'QUANTITÀ', '% M.O.', 'IMPORTO M.O.']], body: tableBody, startY: 40, theme: 'grid', styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [41, 128, 185] }, didDrawPage: (data: any) => { drawHeaderSimple(doc, projectInfo, "STIMA INCIDENZA MANODOPERA", data.pageNumber); } });
        drawSignature(doc, projectInfo, (doc as any).lastAutoTable.finalY);
        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (e) { alert("Errore Manodopera."); }
};

export const generateAnalisiPrezziPdf = async (projectInfo: ProjectInfo, analyses: PriceAnalysis[]) => {
    try {
        const { jsPDF, autoTable } = await getLibs();
        const doc = new jsPDF();
        analyses.forEach((an, idx) => {
            if (idx > 0) doc.addPage();
            drawHeaderSimple(doc, projectInfo, "ANALISI DEI PREZZI UNITARI", 1);
            doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text(`${an.code} - ${an.description}`, 12, 52);
            doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text(`Analisi riferita a ${an.analysisQuantity} ${an.unit}`, 12, 57);
            const body = an.components.map(c => [c.type.toUpperCase().substring(0,3), c.description, c.unit, formatCurrency(c.unitPrice), formatNumber(c.quantity), formatCurrency(c.unitPrice * c.quantity)]);
            autoTable(doc, { startY: 62, head: [['TIPO', 'ELEMENTO DI COSTO', 'U.M.', 'PREZZO', 'Q.TÀ', 'IMPORTO']], body: body, theme: 'striped', styles: { fontSize: 8 }, headStyles: { fillColor: [142, 68, 173] } });
            let finalY = (doc as any).lastAutoTable.finalY + 10;
            const drawRow = (label: string, val: number, bold = false) => {
                doc.setFont("helvetica", bold ? "bold" : "normal"); doc.text(label, 150, finalY, { align: 'right' });
                doc.text(formatCurrency(val), 195, finalY, { align: 'right' }); finalY += 6;
            };
            drawRow("Costo Tecnico", an.costoTecnico); drawRow(`Spese Generali (${an.generalExpensesRate}%)`, an.valoreSpese);
            drawRow(`Utile d'Impresa (${an.profitRate}%)`, an.valoreUtile); doc.line(130, finalY - 3, 195, finalY - 3);
            drawRow(`TOTALE ANALISI`, an.totalBatchValue, true);
            drawSignature(doc, projectInfo, finalY + 10);
        });
        window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    } catch (e) { alert("Errore Analisi."); }
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

        // --- RELAZIONE TECNICA ESSENZIALE (Patto di Ferro) ---
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
        
        // Firma in calce
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