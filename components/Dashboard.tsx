
import React, { useMemo, useState } from 'react';
import { FundingIDV, WorkOrder, WorkStatus, AuditEntry } from '../types';
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
  auditLog: AuditEntry[];
  commandName: string;
  onChapterClick: (chapter: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ idvs, orders, auditLog = [], commandName, onChapterClick }) => {
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
      if (!stats[cap]) stats[cap] = { capitolo: cap, totalBudget: 0, pds: 0, committed: 0, completed: 0 };
      stats[cap].totalBudget += (idv.amount || 0);
    });

    (orders || []).forEach(o => {
      const linkedIdvsForOrder = (idvs || []).filter(i => o.linkedIdvIds?.includes(i.id));
      if (linkedIdvsForOrder.length > 0) {
        const cap = linkedIdvsForOrder[0].capitolo;
        if (stats[cap]) {
          // COMANDANTE: Fasi distinte per evitare sovrascrittura valori
          stats[cap].pds += (o.estimatedValue || 0); 
          stats[cap].committed += (o.contractValue || 0);
          stats[cap].completed += (o.paidValue || 0);
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
    { name: 'CONTRATTI', valore: global.committed, fill: '#e0e7ff', stroke: '#6366f1' },
    { name: 'LIQUIDATO', valore: global.completed, fill: '#dcfce7', stroke: '#10b981' },
  ];

  const formatEuro = (val: number) => `€ ${val.toLocaleString('it-IT')}`;

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(commandName.toUpperCase(), 105, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`RIEPILOGO ANALITICO FLUSSI FINANZIARI - FASI DISTINTE`, 105, 21, { align: "center" });
    
    autoTable(doc, {
      startY: 30,
      head: [['Capitolo', 'Budget', 'PDS (Stima)', 'Contratti', 'Liquidato', 'Disp. Residua']],
      body: statsByChapter.map(c => [
        c.capitolo,
        formatEuro(c.totalBudget),
        formatEuro(c.pds),
        formatEuro(c.committed),
        formatEuro(c.completed),
        formatEuro(c.totalBudget - c.pds)
      ]),
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
      foot: [['TOTALI', formatEuro(global.total), formatEuro(global.pds), formatEuro(global.committed), formatEuro(global.completed), formatEuro(global.total - global.pds)]],
      footStyles: { fillColor: [241, 245, 249], textColor: [0, 0, 0], fontStyle: 'bold' }
    });
    // Fix: Convert URL object to string
    setPdfPreviewUrl(doc.output('bloburl').toString());
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20 bg-[#f8fafc] h-full flex flex-col overflow-x-hidden">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 p-6 bg-white rounded-[2rem] shadow-sm border border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-xl shadow-lg font-black italic">A</div>
           <div><h1 className="text-2xl font-black text-slate-800 tracking-tighter uppercase leading-none italic">Centro Analisi Flussi</h1><p className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] mt-1">Operational Command & Control - {commandName}</p></div>
        </div>
        <div className="flex gap-3">
          <button onClick={handleExportPDF} className="px-6 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-black uppercase text-[9px] shadow-sm hover:border-indigo-600 hover:text-indigo-600 transition-all active:scale-95">ANTEPRIMA PDF</button>
        </div>
      </div>
      <div className="flex flex-col gap-6 p-2 h-full min-h-0">
        <div id="global-overview-section" className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-shrink-0">
          <div className="lg:col-span-3 bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100">
             <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8 italic">Massa Critica Risorse (Delta Progetto/Contratto)</h3>
             <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mainChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 900, fill: '#64748b' }} dy={10} />
                  <YAxis hide domain={[0, global.total * 1.1]} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '10px', fontWeight: 800 }} formatter={(v: number) => [formatEuro(v), '']} />
                  <Bar dataKey="valore" radius={[15, 15, 0, 0]} barSize={80}>
                    {mainChartData.map((entry, index) => ( <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.stroke} strokeWidth={2.5} /> ))}
                    <LabelList dataKey="valore" position="top" formatter={formatEuro} style={{ fontSize: '11px', fontWeight: 900, fill: '#1e293b' }} offset={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 h-full">
            {[
              { label: 'ASSEGNATO', val: global.total, color: 'text-slate-600', bg: 'bg-white' },
              { label: 'PDS (STIMA)', val: global.pds, color: 'text-amber-600', bg: 'bg-amber-50/50' },
              { label: 'CONTRATTI', val: global.committed, color: 'text-indigo-600', bg: 'bg-indigo-50/50' },
              { label: 'LIQUIDATO', val: global.completed, color: 'text-emerald-600', bg: 'bg-emerald-50/50' },
            ].map((item, i) => (
              <div key={i} className={`${item.bg} p-6 rounded-3xl border border-slate-100 flex flex-col justify-center shadow-sm`}>
                <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1 italic leading-none">{item.label}</span>
                <p className={`text-xl font-black ${item.color} italic tracking-tighter`}>{formatEuro(item.val)}</p>
              </div>
            ))}
          </div>
        </div>
        <div id="chapters-table-section" className="flex-1 bg-white rounded-[3rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col min-h-[400px]">
          <div className="bg-slate-900 px-10 py-5 flex justify-between items-center flex-shrink-0"><h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-white italic">Bilancio Dettagliato Analisi Fasi</h3><span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Protocollo PPB 10.1 Active Monitor</span></div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full border-separate border-spacing-0">
              <thead className="sticky top-0 z-[30]"><tr className="bg-slate-100 shadow-sm"><th className="px-10 py-4 text-left border-b border-slate-200 bg-slate-100 text-[10px] font-black text-slate-500 uppercase italic tracking-widest">Capitolo / Codice</th><th className="px-10 py-4 text-right border-b border-slate-200 bg-slate-100 text-[10px] font-black text-slate-500 uppercase italic tracking-widest">Budget</th><th className="px-10 py-4 text-right border-b border-slate-200 bg-slate-100 text-[10px] font-black text-amber-600 uppercase italic tracking-widest">PDS (Stima)</th><th className="px-10 py-4 text-right border-b border-slate-200 bg-slate-100 text-[10px] font-black text-indigo-500 uppercase italic tracking-widest">Contratti</th><th className="px-10 py-4 text-right border-b border-slate-200 bg-slate-100 text-[10px] font-black text-emerald-600 uppercase italic tracking-widest">Liquidato</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {statsByChapter.map((c) => (
                  <tr key={c.capitolo} onClick={() => onChapterClick(c.capitolo)} className="hover:bg-indigo-50/50 cursor-pointer transition-colors group">
                    <td className="px-10 py-5 border-b border-slate-50"><div className="flex items-center gap-5"><div className={`w-10 h-10 rounded-xl bg-${getChapterColor(c.capitolo)}-600 text-white flex items-center justify-center text-xs font-black shadow-md`}>{c.capitolo}</div><span className="text-xs font-black text-slate-800 italic uppercase tracking-tighter">CAPITOLO {c.capitolo}</span></div></td>
                    <td className="px-10 py-5 text-right text-xs font-black text-slate-400 italic">{formatEuro(c.totalBudget)}</td>
                    <td className="px-10 py-5 text-right text-xs font-black text-amber-600 italic">{formatEuro(c.pds)}</td>
                    <td className="px-10 py-5 text-right text-xs font-black text-indigo-500 italic">{formatEuro(c.committed)}</td>
                    <td className="px-10 py-5 text-right text-xs font-black text-emerald-600 italic">{formatEuro(c.completed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {pdfPreviewUrl && <div className="fixed inset-0 z-[200] bg-slate-950/95 flex items-center justify-center p-6 backdrop-blur-sm"><div className="bg-white w-full max-w-6xl h-full rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border border-slate-800"><div className="p-5 flex justify-between items-center bg-slate-900 border-b border-slate-800 flex-shrink-0"><span className="text-[10px] font-black uppercase italic text-indigo-400 tracking-[0.4em]">Official Operational Registry - PPB 10.1</span><button onClick={() => { URL.revokeObjectURL(pdfPreviewUrl!); setPdfPreviewUrl(null); }} className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-700 transition-all">✕ Chiudi Registro</button></div><iframe src={pdfPreviewUrl} className="flex-1 border-0" /></div></div>}
    </div>
  );
};
export default Dashboard;
