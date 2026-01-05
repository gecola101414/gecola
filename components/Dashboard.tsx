
import React, { useMemo, useState } from 'react';
import { FundingIDV, WorkOrder, WorkStatus } from '../types';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList
} from 'recharts';
// @ts-ignore
import pptxgen from 'pptxgenjs';
// @ts-ignore
import { toPng } from 'html-to-image';
// @ts-ignore
import { jsPDF } from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';
import { getChapterColor } from './ChaptersSummary';

interface DashboardProps {
  idvs: FundingIDV[];
  orders: WorkOrder[];
  onChapterClick: (chapter: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ idvs, orders, onChapterClick }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const statsByChapter = useMemo(() => {
    const stats: Record<string, {
      capitolo: string;
      totalBudget: number;
      pds: number;        
      committed: number;  
      completed: number;  
    }> = {};
    
    (idvs || []).forEach(idv => {
      const cap = idv.capitolo || 'N/D';
      if (!stats[cap]) {
        stats[cap] = { capitolo: cap, totalBudget: 0, pds: 0, committed: 0, completed: 0 };
      }
      stats[cap].totalBudget += (idv.amount || 0);
    });

    (orders || []).forEach(o => {
      const linkedIdvsForOrder = (idvs || []).filter(i => o.linkedIdvIds?.includes(i.id));
      if (linkedIdvsForOrder.length > 0) {
        const cap = linkedIdvsForOrder[0].capitolo;
        if (stats[cap]) {
          const val = (o.paidValue || o.contractValue || o.estimatedValue || 0);
          stats[cap].pds += val; 
          if (o.status === WorkStatus.AFFIDAMENTO || o.status === WorkStatus.PAGAMENTO) {
            stats[cap].committed += (o.contractValue || o.estimatedValue || 0);
          }
          if (o.status === WorkStatus.PAGAMENTO) {
            stats[cap].completed += (o.paidValue || o.contractValue || o.estimatedValue || 0);
          }
        }
      }
    });

    return Object.values(stats).sort((a, b) => a.capitolo.localeCompare(b.capitolo));
  }, [idvs, orders]);

  const global = useMemo(() => {
    return statsByChapter.reduce((acc, curr) => ({
      total: acc.total + curr.totalBudget,
      pds: acc.pds + curr.pds,
      committed: acc.committed + curr.committed,
      completed: acc.completed + curr.completed
    }), { total: 0, pds: 0, committed: 0, completed: 0 });
  }, [statsByChapter]);

  const mainChartData = [
    { name: 'ASSEGNATO', valore: global.total, fill: '#f1f5f9', stroke: '#cbd5e1' },
    { name: 'PREVISTO (PDS)', valore: global.pds, fill: '#fef3c7', stroke: '#f59e0b' },
    { name: 'IMPEGNATO', valore: global.committed, fill: '#e0e7ff', stroke: '#6366f1' },
    { name: 'COMPLETATO', valore: global.completed, fill: '#dcfce7', stroke: '#10b981' },
  ];

  const formatEuro = (val: number) => `€ ${val.toLocaleString('it-IT')}`;

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Header Istituzionale
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("COMANDO MILITARE ESERCITO LOMBARDIA", 105, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`RIEPILOGO ANALITICO FLUSSI FINANZIARI - PROTOCOLLO 4.9`, 105, 21, { align: "center" });
    
    const tableData = statsByChapter.map((c) => {
      const residual = c.totalBudget - c.pds;
      return [
        c.capitolo,
        formatEuro(c.totalBudget),
        formatEuro(c.pds),
        formatEuro(c.committed),
        formatEuro(c.completed),
        formatEuro(residual)
      ];
    });

    autoTable(doc, {
      startY: 30,
      head: [['Capitolo', 'Assegnato (Budget)', 'Previsto (PDS)', 'Impegnato', 'Liquidato', 'Residuo Disp.']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], fontSize: 8, halign: 'center' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'center' },
        1: { halign: 'right' },
        2: { halign: 'right', textColor: [245, 158, 11] },
        3: { halign: 'right', textColor: [99, 102, 241] },
        4: { halign: 'right', textColor: [16, 185, 129] },
        5: { halign: 'right', fontStyle: 'bold' }
      },
      foot: [[
        'TOTALI GENERALI',
        formatEuro(global.total),
        formatEuro(global.pds),
        formatEuro(global.committed),
        formatEuro(global.completed),
        formatEuro(global.total - global.pds)
      ]],
      footStyles: { fillColor: [241, 245, 249], textColor: [0, 0, 0], fontSize: 8, fontStyle: 'bold', halign: 'right' }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.text(`Vault V21 MASTER - Security Protocol Sentry Active`, 15, finalY);
    doc.text(`Generato da Terminale Accreditato il ${new Date().toLocaleString()}`, 15, finalY + 4);
    
    // Invece di save, usiamo l'anteprima nativa come richiesto
    setPdfPreviewUrl(doc.output('bloburl'));
  };

  const generatePresentation = async () => {
    setIsExporting(true);
    try {
      const pres = new pptxgen();
      pres.title = "Presentazione Stato PPB - CME Lombardia";

      const globalNode = document.getElementById('global-overview-section');
      if (globalNode) {
        const dataUrl = await toPng(globalNode, { backgroundColor: '#f8fafc' });
        const slide = pres.addSlide();
        slide.background = { color: 'F8FAFC' };
        slide.addImage({ data: dataUrl, x: 0.5, y: 0.5, w: 9, h: 5 });
      }

      const tableNode = document.getElementById('chapters-table-section');
      if (tableNode) {
        const dataUrl = await toPng(tableNode, { backgroundColor: '#f8fafc' });
        const slide = pres.addSlide();
        slide.background = { color: 'F8FAFC' };
        slide.addImage({ data: dataUrl, x: 0.2, y: 0.2, w: 9.6, h: 5.2 });
      }

      await pres.writeFile({ fileName: `PRESENTAZIONE_PPB_${new Date().toISOString().split('T')[0]}.pptx` });
    } catch (err) {
      alert("Impossibile generare la presentazione.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20 bg-[#f8fafc] h-full flex flex-col">
      {/* Header pastello con pulsanti export uniformati */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 p-6 bg-white rounded-[2rem] shadow-sm border border-slate-100 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tighter uppercase leading-none italic">Analisi dei Flussi Master</h1>
          <p className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] mt-1">Convergenza Ciclo Finanziario PPB - Protocollo 4.9 High Command</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-black uppercase text-[9px] shadow-sm hover:border-indigo-600 hover:text-indigo-600 transition-all active:scale-95"
          >
            Anteprima Registro PDF 👁️
          </button>
          <button 
            onClick={generatePresentation}
            disabled={isExporting}
            className={`flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-[9px] shadow-lg hover:bg-indigo-700 transition-all active:scale-95 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isExporting ? (
              <span className="animate-pulse">Elaborazione PPTX...</span>
            ) : (
              <span>Esporta PowerPoint 📊</span>
            )}
          </button>
        </div>
      </div>

      <div id="global-overview-section" className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-4 flex-shrink-0">
        <div className="lg:col-span-3 bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8 italic">Convergenza Cumulativa delle Risorse Economiche</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mainChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 900, fill: '#64748b' }} dy={10} />
                <YAxis hide domain={[0, global.total * 1.1]} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 800 }} formatter={(v: number) => [formatEuro(v), '']} />
                <Bar dataKey="valore" radius={[12, 12, 0, 0]} barSize={80}>
                  {mainChartData.map((entry, index) => ( <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.stroke} strokeWidth={2.5} /> ))}
                  <LabelList dataKey="valore" position="top" formatter={formatEuro} style={{ fontSize: '10px', fontWeight: 900, fill: '#1e293b' }} offset={10} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-3">
          {[
            { label: 'Assegnato (Budget)', val: global.total, color: 'text-slate-600', bg: 'bg-white' },
            { label: 'Previsto (PDS)', val: global.pds, color: 'text-amber-600', bg: 'bg-amber-50/50' },
            { label: 'Impegnato (Affidato)', val: global.committed, color: 'text-indigo-600', bg: 'bg-indigo-50/50' },
            { label: 'Completato (Pagato)', val: global.completed, color: 'text-emerald-600', bg: 'bg-emerald-50/50' },
          ].map((item, i) => (
            <div key={i} className={`${item.bg} p-4 rounded-[1.5rem] border border-slate-100 flex flex-col justify-center h-[85px]`}>
              <span className="text-[7px] font-black uppercase text-slate-400 tracking-widest mb-1 italic">{item.label}</span>
              <p className={`text-lg font-black ${item.color} italic tracking-tighter`}>{formatEuro(item.val)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* MASTER LEDGER: TABELLA SOMMARIO CAPITOLI CON TESTATA BLOCCATA */}
      <div id="chapters-table-section" className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col m-4 min-h-[400px]">
        <div className="bg-slate-900 px-8 py-4 flex justify-between items-center flex-shrink-0 z-20">
           <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white italic">Master Ledger: Sommario Analitico per Capitolo</h3>
           <div className="flex items-center gap-4">
              <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Protocollo Sentry 4.9 Active</span>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          <table className="w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-[30]">
              <tr className="bg-slate-100 shadow-sm">
                <th className="px-6 py-4 text-left border-b border-slate-200 bg-slate-100 text-[9px] font-black text-slate-500 uppercase italic tracking-widest sticky top-0">Capitolo</th>
                <th className="px-6 py-4 text-right border-b border-slate-200 bg-slate-100 text-[9px] font-black text-slate-500 uppercase italic tracking-widest sticky top-0">Assegnato (Budget)</th>
                <th className="px-6 py-4 text-right border-b border-slate-200 bg-slate-100 text-[9px] font-black text-amber-500 uppercase italic tracking-widest sticky top-0">Previsto (PDS)</th>
                <th className="px-6 py-4 text-right border-b border-slate-200 bg-slate-100 text-[9px] font-black text-indigo-500 uppercase italic tracking-widest sticky top-0">Impegnato</th>
                <th className="px-6 py-4 text-right border-b border-slate-200 bg-slate-100 text-[9px] font-black text-emerald-600 uppercase italic tracking-widest sticky top-0">Liquidato</th>
                <th className="px-6 py-4 text-right border-b border-slate-200 bg-slate-100 text-[9px] font-black text-slate-800 uppercase italic tracking-widest sticky top-0">Residuo Disp.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {statsByChapter.map((c) => {
                const color = getChapterColor(c.capitolo);
                const residual = c.totalBudget - c.pds;
                return (
                  <tr 
                    key={c.capitolo} 
                    onClick={() => onChapterClick(c.capitolo)}
                    className="hover:bg-indigo-50/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4 border-b border-slate-50">
                      <div className="flex items-center gap-3">
                         <div className={`w-8 h-8 rounded-lg bg-${color}-600 text-white flex items-center justify-center text-[10px] font-black shadow-md group-hover:scale-110 transition-transform`}>
                           {c.capitolo}
                         </div>
                         <span className="text-xs font-black text-slate-800 italic uppercase">Scheda {c.capitolo}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-xs font-black text-slate-400 italic border-b border-slate-50">{formatEuro(c.totalBudget)}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-amber-600 italic border-b border-slate-50">{formatEuro(c.pds)}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-indigo-600 italic border-b border-slate-50">{formatEuro(c.committed)}</td>
                    <td className="px-6 py-4 text-right text-xs font-black text-emerald-600 italic border-b border-slate-50">{formatEuro(c.completed)}</td>
                    <td className="px-6 py-4 text-right border-b border-slate-50">
                       <span className={`text-sm font-black italic tracking-tighter ${residual < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                         {formatEuro(residual)}
                       </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-[30]">
              <tr className="bg-slate-900 text-white shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
                <td className="px-6 py-4 text-[10px] font-black uppercase italic tracking-widest">TOTALI GENERALI COMANDO</td>
                <td className="px-6 py-4 text-right text-xs font-black italic">{formatEuro(global.total)}</td>
                <td className="px-6 py-4 text-right text-xs font-black text-amber-400 italic">{formatEuro(global.pds)}</td>
                <td className="px-6 py-4 text-right text-xs font-black text-indigo-300 italic">{formatEuro(global.committed)}</td>
                <td className="px-6 py-4 text-right text-xs font-black text-emerald-400 italic">{formatEuro(global.completed)}</td>
                <td className="px-6 py-4 text-right text-sm font-black text-white italic tracking-tighter border-l border-slate-700">{formatEuro(global.total - global.pds)}</td>
              </tr>
            </tfoot>
          </table>
          {statsByChapter.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center opacity-20">
              <span className="text-5xl mb-4">📑</span>
              <p className="text-[10px] font-black uppercase tracking-widest">In attesa di dati contabili capitoli</p>
            </div>
          )}
        </div>
      </div>

      {/* VISORE PDF MODALE (STESSO STILE DI PLANNINGMODULE) */}
      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[200] bg-slate-950/95 flex items-center justify-center p-6 backdrop-blur-sm">
           <div className="bg-white w-full max-w-6xl h-full rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border border-slate-800">
             <div className="p-5 flex justify-between items-center bg-slate-900 border-b border-slate-800 flex-shrink-0">
               <span className="text-[10px] font-black uppercase italic text-indigo-400 tracking-[0.4em]">Official Operational Ledger - CME LOMB Vault</span>
               <button 
                onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }} 
                className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-700 transition-all"
               >
                 ✕ Chiudi Anteprima
               </button>
             </div>
             <iframe src={pdfPreviewUrl} className="flex-1 border-0" />
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
