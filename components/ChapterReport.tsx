
import React, { useMemo, useState } from 'react';
import { FundingIDV, WorkOrder, WorkStatus, UserRole, User } from '../types';
import { getChapterColor } from './ChaptersSummary';
// @ts-ignore
import { jsPDF } from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

interface ChapterReportProps {
  chapter: string;
  idvs: FundingIDV[];
  orders: WorkOrder[];
  allIdvs: FundingIDV[];
  onBack: () => void;
  onAddWork: () => void;
  onOrderClick?: (orderId: string) => void;
  userRole?: string;
  currentUser?: User;
}

const ChapterReport: React.FC<ChapterReportProps> = ({ 
  chapter = '---', 
  idvs = [], 
  orders = [], 
  onBack, 
  onAddWork, 
  onOrderClick, 
  userRole, 
  currentUser 
}) => {
  const color = getChapterColor(chapter);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  
  const chapterIdvIds = useMemo(() => (idvs || []).map(i => i.id), [idvs]);

  const canAddWork = useMemo(() => {
    if (userRole === UserRole.ADMIN) return true;
    if (userRole === UserRole.VIEWER) return false;
    if (!idvs || idvs.length === 0) return false;
    return idvs.some(i => i.assignedWorkgroup === currentUser?.workgroup);
  }, [idvs, userRole, currentUser]);

  const linkedOrders = useMemo(() => {
    if (!orders || !chapterIdvIds.length) return [];
    return orders.filter(o => 
      o.linkedIdvIds && o.linkedIdvIds.some(id => chapterIdvIds.includes(id))
    );
  }, [orders, chapterIdvIds]);

  const stats = useMemo(() => {
    const totalBudget = (idvs || []).reduce((a, b) => a + (b.amount || 0), 0);
    let totalPds = 0;
    let totalImpegnato = 0;
    let totalLiquidato = 0;
    
    linkedOrders.forEach(o => {
      // COMANDANTE: Somme separate per fase
      totalPds += (o.estimatedValue || 0);
      totalImpegnato += (o.contractValue || 0);
      totalLiquidato += (o.paidValue || 0);
    });

    return { 
      totalBudget, 
      totalPds, 
      totalImpegnato,
      totalLiquidato,
      totalAvailable: totalBudget - totalPds 
    };
  }, [idvs, linkedOrders]);

  const formatEuro = (val: number) => `€ ${val.toLocaleString('it-IT')}`;

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(`REPORT ANALITICO CAPITOLO ${chapter} - ANALISI FASI`, 105, 15, { align: "center" });

    autoTable(doc, {
      startY: 25,
      head: [['Parametro Strategico', 'Valore']],
      body: [
        ['Budget Totale Allocato', formatEuro(stats.totalBudget)],
        ['Totale PDS (Fase 1)', formatEuro(stats.totalPds)],
        ['Totale Contratti (Fase 2)', formatEuro(stats.totalImpegnato)],
        ['Totale Liquidati (Fase 3)', formatEuro(stats.totalLiquidato)],
        ['Residuo su Budget', formatEuro(stats.totalBudget - stats.totalPds)]
      ],
      theme: 'grid'
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Codice', 'Oggetto', 'PDS Project', 'Affidamento', 'Liquidato']],
      body: linkedOrders.map(o => [o.orderNumber, o.description, formatEuro(o.estimatedValue), formatEuro(o.contractValue || 0), formatEuro(o.paidValue || 0)]),
      theme: 'striped',
      styles: { fontSize: 8 }
    });

    // Fix: Convert URL object to string
    setPdfPreviewUrl(doc.output('bloburl').toString());
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 overflow-hidden">
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm group">
            <svg className="w-5 h-5 text-slate-500 group-hover:text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-${color}-600 text-white flex items-center justify-center text-lg font-black shadow-lg`}>{chapter}</div>
            <div><h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase leading-none italic">Capitolo {chapter}</h2><div className="flex items-center gap-2 mt-1"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Analisi Granulare Avanzamento Fasi</span></div></div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExportPDF} className="px-5 py-3 bg-white border-2 border-slate-200 rounded-2xl text-[10px] font-black uppercase hover:border-indigo-600 hover:text-indigo-600 transition-all shadow-sm">ANTEPRIMA PDF</button>
          {canAddWork && <button onClick={onAddWork} className={`flex items-center gap-3 px-5 py-3 bg-${color}-600 text-white rounded-2xl shadow-lg hover:bg-${color}-700 transition-all group`}><div className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center group-hover:rotate-180 transition-transform"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M12 4v16m8-8H4" /></svg></div><span className="text-[10px] font-black uppercase tracking-widest">Pianifica Intervento</span></button>}
        </div>
      </div>
      <div className="grid grid-cols-5 gap-3 mb-6 flex-shrink-0">
        <div className="bg-slate-900 px-4 py-2.5 rounded-2xl text-white shadow-xl"><p className="text-slate-500 text-[8px] font-black uppercase tracking-widest mb-1 italic leading-none">Budget Capitolo</p><p className="text-sm font-black tracking-tight italic">{formatEuro(stats.totalBudget)}</p></div>
        <div className="bg-white px-4 py-2.5 rounded-2xl border-2 border-slate-100"><p className="text-amber-500 text-[8px] font-black uppercase tracking-widest mb-1 italic leading-none">PDS (Stima)</p><p className="text-sm font-black text-amber-600 tracking-tight italic">{formatEuro(stats.totalPds)}</p></div>
        <div className="bg-white px-4 py-2.5 rounded-2xl border-2 border-slate-100"><p className="text-indigo-500 text-[8px] font-black uppercase tracking-widest mb-1 italic leading-none">Contratti</p><p className="text-sm font-black text-indigo-600 tracking-tight italic">{formatEuro(stats.totalImpegnato)}</p></div>
        <div className="bg-white px-4 py-2.5 rounded-2xl border-2 border-slate-100"><p className="text-emerald-500 text-[8px] font-black uppercase tracking-widest mb-1 italic leading-none">Liquidato</p><p className="text-sm font-black text-emerald-600 tracking-tight italic">{formatEuro(stats.totalLiquidato)}</p></div>
        <div className={`bg-white px-4 py-2.5 rounded-2xl border-2 border-${color}-600 shadow-xl`}><p className="text-slate-400 text-[8px] font-black uppercase tracking-widest mb-1 italic leading-none">Residuo Disponibile</p><p className={`text-base font-black ${stats.totalAvailable < 0 ? 'text-rose-600' : 'text-emerald-800'} tracking-tight italic`}>{formatEuro(stats.totalAvailable)}</p></div>
      </div>
      <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm"><div className="bg-slate-50 px-6 py-4 border-b border-slate-200"><h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 italic">IDV Sorgenti Capitolo</h3></div><div className="flex-1 overflow-y-auto custom-scrollbar"><table className="w-full text-left"><thead><tr className="border-b border-slate-100"><th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Codice IDV</th><th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right italic">Importo</th></tr></thead><tbody className="divide-y divide-slate-50">{idvs.map(idv => (<tr key={idv.id} className="hover:bg-slate-50/50"><td className="px-6 py-4"><p className="text-xs font-black text-slate-900">{idv.idvCode}</p><p className="text-[9px] text-slate-400 font-bold uppercase italic leading-none mt-1">Ufficio: {idv.assignedWorkgroup}</p></td><td className="px-6 py-4 text-right"><p className="text-sm font-black text-slate-900 italic">{formatEuro(idv.amount)}</p></td></tr>))}</tbody></table></div></div>
        <div className="flex-[1.5] flex flex-col bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm"><div className="bg-slate-50 px-6 py-4 border-b border-slate-200"><h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 italic">Cronologia Progetti & Contratti</h3></div><div className="flex-1 overflow-y-auto custom-scrollbar"><table className="w-full text-left"><thead><tr className="border-b border-slate-100 bg-white"><th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Pratica</th><th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right italic">PDS Project</th><th className="px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right italic">Contratto</th></tr></thead><tbody className="divide-y divide-slate-50">{linkedOrders.map(o => (<tr key={o.id} onClick={() => onOrderClick && onOrderClick(o.id)} className="hover:bg-indigo-50/80 transition-all cursor-pointer group"><td className="px-6 py-4"><div className="flex flex-col"><span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded group-hover:bg-indigo-600 group-hover:text-white transition-colors w-fit">{o.orderNumber}</span><p className="text-xs font-bold text-slate-800 truncate max-w-[200px] italic mt-1 uppercase leading-none">{o.description}</p></div></td><td className="px-6 py-4 text-right"><p className="text-xs font-black text-slate-900 italic">{formatEuro(o.estimatedValue)}</p></td><td className="px-6 py-4 text-right"><p className="text-xs font-black text-indigo-600 italic">{formatEuro(o.contractValue || 0)}</p></td></tr>))}</tbody></table></div></div>
      </div>
      {pdfPreviewUrl && <div className="fixed inset-0 z-[200] bg-slate-950/95 flex items-center justify-center p-6 backdrop-blur-sm"><div className="bg-white w-full max-w-6xl h-full rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border border-slate-800"><div className="p-5 flex justify-between items-center bg-slate-900 border-b border-slate-800 flex-shrink-0"><span className="text-[10px] font-black uppercase italic text-indigo-400 tracking-[0.4em]">Operational Summary - PPB 10.1</span><button onClick={() => { URL.revokeObjectURL(pdfPreviewUrl!); setPdfPreviewUrl(null); }} className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-700 transition-all">✕ Chiudi Registro</button></div><iframe src={pdfPreviewUrl} className="flex-1 border-0" /></div></div>}
    </div>
  );
};
export default ChapterReport;
