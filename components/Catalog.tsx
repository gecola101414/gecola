
import React, { useMemo, useEffect, useRef, useState } from 'react';
import { WorkOrder, WorkStatus, FundingIDV, UserRole, User } from '../types';
import { getChapterColor } from './ChaptersSummary';
// @ts-ignore
import { jsPDF } from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

interface CatalogProps {
  orders: WorkOrder[];
  idvs: FundingIDV[];
  highlightId?: string | null;
  onStageClick: (order: WorkOrder, stage: number) => void;
  onToggleLock: (orderId: string) => void;
  onDelete: (orderId: string) => void;
  onAdd: () => void;
  onChapterClick: (chapter: string) => void;
  currentUser: User;
  onShowHistory: (id: string) => void;
}

const Catalog: React.FC<CatalogProps> = ({ 
  orders, idvs, highlightId, onStageClick, onToggleLock, onDelete, onAdd, onChapterClick, currentUser, onShowHistory
}) => {
  const sortedOrders = useMemo(() => [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [orders]);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const isAdmin = currentUser.role === UserRole.ADMIN;
  const isViewer = currentUser.role === UserRole.VIEWER;
  const isGarante = isAdmin || isViewer;

  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (highlightId && refs.current[highlightId]) {
      setTimeout(() => refs.current[highlightId]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  }, [highlightId]);

  const exportSingleWorkPDF = (order: WorkOrder) => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text("SCHEDA ANALITICA PRATICA FINANZIARIA", 105, 15, { align: "center" });
    
    const chapter = idvs.find(i => order.linkedIdvIds.includes(i.id))?.capitolo || 'N/D';

    autoTable(doc, {
      startY: 30,
      head: [['Campo', 'Dato Tecnico']],
      body: [
        ['N. Pratica', order.orderNumber],
        ['Oggetto', order.description],
        ['Capitolo', chapter],
        ['Stato Ciclo', order.status],
        ['Ufficio Gestore', order.workgroup],
        ['Ditta (Aggiudicataria)', order.winner || 'IN ATTESA'],
        ['Valore Stima', `€ ${order.estimatedValue.toLocaleString()}`],
        ['Valore Contratto', order.contractValue ? `€ ${order.contractValue.toLocaleString()}` : 'N/D'],
        ['Valore Liquidato', order.paidValue ? `€ ${order.paidValue.toLocaleString()}` : 'N/D'],
        ['Data Creazione', new Date(order.createdAt).toLocaleDateString()]
      ],
      theme: 'grid'
    });
    setPdfPreviewUrl(doc.output('bloburl').toString());
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 pb-20 relative overflow-hidden font-['Inter']">
      <div className="sticky top-0 z-30 bg-slate-50/90 backdrop-blur-sm py-4 mb-4 border-b border-slate-200 flex justify-between items-center px-4">
         <div className="flex flex-col">
           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Archivio Pratiche Amministrative</span>
           <span className="text-xs font-bold text-slate-800 uppercase">{sortedOrders.length} Fascicoli in Registro</span>
         </div>
      </div>

      <div className="grid grid-cols-1 gap-3 overflow-y-auto custom-scrollbar flex-1 pr-2">
        {sortedOrders.map((o, index) => {
          const chapter = idvs.find(i => o.linkedIdvIds.includes(i.id))?.capitolo || 'N/D';
          const color = getChapterColor(chapter);
          const isMyWork = currentUser.workgroup === o.workgroup;
          
          return (
            <div key={o.id} ref={el => { refs.current[o.id] = el; }} className={`bg-white rounded-[1.8rem] p-4 border-2 shadow-sm transition-all flex items-center gap-6 group relative ${o.locked ? 'opacity-80 border-slate-100' : 'border-indigo-50 hover:shadow-lg'} ${highlightId === o.id ? 'border-indigo-500 ring-8 ring-indigo-500/10 scale-[1.01] z-20' : ''}`}>
              <div className="w-8 h-8 flex-shrink-0 bg-slate-800 text-white rounded-lg flex items-center justify-center text-[10px] font-black border-2 border-white shadow-md">{index + 1}</div>
              
              <div className="w-56 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="bg-slate-900 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase">{o.orderNumber}</span>
                  <button onClick={() => onChapterClick(chapter)} className={`px-2 py-0.5 rounded bg-${color}-50 text-${color}-600 border border-${color}-100 text-[8px] font-black uppercase`}>Cap. {chapter}</button>
                </div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight leading-none truncate italic uppercase">{o.description}</h3>
              </div>
              
              <div className="flex-1 flex items-center justify-between px-10 relative h-16">
                {/* LINEA DI COLLEGAMENTO - SEMPRE PRESENTE */}
                <div className="absolute top-1/2 left-10 right-10 h-[2px] -translate-y-1 z-0 bg-slate-100 flex overflow-hidden rounded-full">
                   <div className={`h-full transition-all duration-1000 ${o.status !== WorkStatus.PROGETTO ? 'bg-indigo-500 w-1/2' : 'w-0'}`}></div>
                   <div className={`h-full transition-all duration-1000 ${o.status === WorkStatus.PAGAMENTO ? 'bg-emerald-500 w-1/2' : 'w-0'}`}></div>
                </div>

                <div className="relative z-10 flex flex-col items-center gap-1 w-20">
                  <button onClick={() => !o.locked && isMyWork && !isGarante && onStageClick(o, 1)} className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs border-2 border-white text-white shadow-lg transition-all ${isMyWork && !isGarante ? 'hover:scale-110 bg-amber-400' : 'bg-slate-400 cursor-not-allowed'}`}>1</button>
                  <p className="text-[8px] font-black text-slate-500">€{o.estimatedValue.toLocaleString()}</p>
                </div>
                
                <div className="relative z-10 flex flex-col items-center gap-1 w-20">
                  <button onClick={() => !o.locked && isMyWork && !isGarante && onStageClick(o, 2)} className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs border-2 transition-all shadow-lg ${isMyWork && !isGarante ? 'hover:scale-110' : 'cursor-not-allowed'} ${o.status !== WorkStatus.PROGETTO ? 'bg-indigo-500 border-white text-white' : 'bg-white border-indigo-200 text-indigo-300'}`}>2</button>
                  <p className="text-[8px] font-black text-slate-500">€{(o.contractValue || 0).toLocaleString()}</p>
                </div>
                
                <div className="relative z-10 flex flex-col items-center gap-1 w-20">
                  <button onClick={() => !o.locked && isMyWork && !isGarante && onStageClick(o, 3)} className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs border-2 transition-all shadow-lg ${isMyWork && !isGarante ? 'hover:scale-110' : 'cursor-not-allowed'} ${o.status === WorkStatus.PAGAMENTO ? 'bg-emerald-500 border-white text-white' : 'bg-white border-emerald-100 text-emerald-300'}`}>3</button>
                  <p className="text-[8px] font-black text-slate-500">€{(o.paidValue || 0).toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => onShowHistory(o.id)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-all" title="Storico">📜</button>
                <button onClick={() => exportSingleWorkPDF(o)} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-all" title="Esporta PDF">📄</button>
                {!isGarante && isMyWork && (
                  <>
                    <button onClick={() => onToggleLock(o.id)} className={`p-2 rounded-lg ${o.locked ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-300 hover:bg-indigo-500 hover:text-white'}`}>{o.locked ? '🔒' : '🔓'}</button>
                    {!o.locked && <button onClick={() => { if(confirm("Eliminare fascicolo?")) onDelete(o.id) }} className="p-2 bg-rose-50 text-rose-300 hover:bg-rose-500 hover:text-white rounded-lg transition-all shadow-sm">🗑️</button>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isGarante && <button onClick={onAdd} className="fixed bottom-14 right-8 w-16 h-16 bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-2xl hover:bg-indigo-600 hover:scale-110 active:scale-90 transition-all z-50 border-4 border-white group"><svg className="w-8 h-8 group-hover:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M12 4v16m8-8H4" /></svg></button>}

      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[900] bg-slate-950/95 flex items-center justify-center p-6 backdrop-blur-sm">
           <div className="bg-white w-full max-w-6xl h-full rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border border-slate-800">
             <div className="p-5 flex justify-between items-center bg-slate-900 border-b border-slate-800 flex-shrink-0">
               <span className="text-[10px] font-black uppercase italic text-indigo-400 tracking-[0.4em]">Anteprima Analitica Pratica</span>
               <button onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }} className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">✕ Chiudi</button>
             </div>
             <iframe src={pdfPreviewUrl} className="flex-1 border-0" />
           </div>
        </div>
      )}
    </div>
  );
};
export default Catalog;
