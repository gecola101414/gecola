
import React, { useMemo, useEffect, useRef } from 'react';
import { WorkOrder, WorkStatus, FundingIDV, UserRole, User } from '../types';
import { getChapterColor } from './ChaptersSummary';

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
}

const Catalog: React.FC<CatalogProps> = ({ 
  orders, idvs, highlightId, onStageClick, onToggleLock, onDelete, onAdd, onChapterClick, currentUser
}) => {
  const sortedOrders = useMemo(() => [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [orders]);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const isAdmin = currentUser.role === UserRole.ADMIN;

  useEffect(() => {
    if (highlightId && refs.current[highlightId]) {
      setTimeout(() => {
        refs.current[highlightId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [highlightId]);

  const generateCRE = (order: WorkOrder) => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head><title>CRE - ${order.orderNumber}</title></head>
        <body style="font-family: serif; padding: 40px;">
          <h1 style="text-align:center">Certificato Regolare Esecuzione</h1>
          <p>Pratica: ${order.orderNumber}</p>
          <p>Oggetto: ${order.description}</p>
          <p>Ditta: ${order.winner || '---'}</p>
          <p>Importo: € ${order.paidValue?.toLocaleString()}</p>
          <script>window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleExportPDF = (preview: boolean = false) => {
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = sortedOrders.map((o, i) => {
       const chapter = idvs.find(idv => o.linkedIdvIds.includes(idv.id))?.capitolo || '-';
       return `
        <tr>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${i+1}</td>
          <td style="border: 1px solid #ddd; padding: 6px; font-weight: bold;">${o.orderNumber}</td>
          <td style="border: 1px solid #ddd; padding: 6px;">Cap. ${chapter}</td>
          <td style="border: 1px solid #ddd; padding: 6px;">${o.description}</td>
          <td style="border: 1px solid #ddd; padding: 6px;">${o.status.split(' ')[0]}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">€ ${(o.paidValue || o.contractValue || o.estimatedValue).toLocaleString()}</td>
        </tr>
      `;
    }).join('');

    win.document.write(`
      <html>
        <head>
          <title>Registro Lavori CME LOMB</title>
          <style>
            body { font-family: sans-serif; padding: 30px; }
            h1 { text-align: center; text-transform: uppercase; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background: #eee; border: 1px solid #ddd; padding: 8px; }
          </style>
        </head>
        <body>
          <h1>Registro Generale Pratiche PPB</h1>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Pratica</th>
                <th>Capitolo</th>
                <th>Descrizione</th>
                <th>Stato</th>
                <th>Valore Attuale</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="text-align: right; margin-top: 20px; font-weight: bold;">Generato il: ${new Date().toLocaleString()}</p>
          ${preview ? '' : '<script>window.print();</script>'}
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 pb-20 relative overflow-hidden">
      
      {/* Sticky Header Actions */}
      <div className="sticky top-0 z-30 bg-slate-50/90 backdrop-blur-sm py-4 mb-4 border-b border-slate-200 flex justify-between items-center px-4">
         <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Elenco Pratiche Correnti</span>
            <span className="text-xs font-bold text-slate-800 uppercase">{sortedOrders.length} Lavori in Registro</span>
         </div>
         <div className="flex gap-2">
            <button onClick={() => handleExportPDF(true)} className="px-5 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-[9px] font-black uppercase hover:bg-slate-50 transition-all">Anteprima PDF 👁️</button>
            <button onClick={() => handleExportPDF(false)} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-indigo-700 shadow-lg transition-all">Salva PDF 💾</button>
         </div>
      </div>

      <div className="grid grid-cols-1 gap-3 overflow-y-auto custom-scrollbar flex-1 pr-2">
        {sortedOrders.map((o, index) => {
          const chapter = idvs.find(i => o.linkedIdvIds.includes(i.id))?.capitolo || 'N/D';
          const color = getChapterColor(chapter);
          const isHighlighted = highlightId === o.id;
          const isMyWork = currentUser.workgroup === o.workgroup;

          const isStage2Done = o.status === WorkStatus.AFFIDAMENTO || o.status === WorkStatus.PAGAMENTO;
          const isStage3Done = o.status === WorkStatus.PAGAMENTO;
          const progressWidth = isStage3Done ? '100%' : isStage2Done ? '50%' : '0%';

          return (
            <div 
              key={o.id} 
              ref={el => { refs.current[o.id] = el; }}
              className={`bg-white rounded-[1.8rem] p-4 border-2 shadow-sm transition-all flex items-center gap-6 group relative ${o.locked ? 'opacity-60 grayscale border-slate-100' : 'border-indigo-50 hover:shadow-lg'} ${isHighlighted ? 'border-indigo-500 ring-8 ring-indigo-500/10 scale-[1.01] z-20' : ''}`}
            >
              <div className="w-8 h-8 flex-shrink-0 bg-slate-800 text-white rounded-lg flex items-center justify-center text-[10px] font-black border-2 border-white shadow-md">
                {index + 1}
              </div>

              <div className="w-56 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="bg-slate-900 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase">{o.orderNumber}</span>
                  <button onClick={() => onChapterClick(chapter)} className={`px-2 py-0.5 rounded bg-${color}-50 text-${color}-600 border border-${color}-100 text-[8px] font-black uppercase`}>Cap. {chapter}</button>
                </div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight leading-none truncate italic">{o.description}</h3>
              </div>

              <div className="flex-1 flex items-center justify-between px-6 relative">
                <div className="absolute top-[22px] left-[40px] right-[40px] h-1 bg-slate-50 rounded-full z-0 overflow-hidden">
                   <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: progressWidth }}></div>
                </div>

                <div className="relative z-10 flex flex-col items-center gap-1 w-20">
                  <button onClick={() => !o.locked && isMyWork && !isAdmin && onStageClick(o, 1)} className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs border-2 border-white text-white shadow-lg transition-all ${isMyWork && !isAdmin ? 'hover:scale-110 bg-amber-400' : 'bg-slate-400 cursor-not-allowed'}`}>1</button>
                  <p className="text-[8px] font-black text-slate-500">€{o.estimatedValue.toLocaleString()}</p>
                </div>

                <div className="relative z-10 flex flex-col items-center gap-1 w-20">
                  <button onClick={() => !o.locked && isMyWork && !isAdmin && onStageClick(o, 2)} className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs border-2 transition-all shadow-lg ${isMyWork && !isAdmin ? 'hover:scale-110' : 'cursor-not-allowed'} ${isStage2Done ? 'bg-indigo-500 border-white text-white' : 'bg-white border-indigo-200 text-indigo-300'}`}>2</button>
                  <p className="text-[8px] font-black text-slate-500">€{(o.contractValue || 0).toLocaleString()}</p>
                </div>

                <div className="relative z-10 flex flex-col items-center gap-1 w-20">
                  <button onClick={() => !o.locked && isMyWork && !isAdmin && onStageClick(o, 3)} className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs border-2 transition-all shadow-lg ${isMyWork && !isAdmin ? 'hover:scale-110' : 'cursor-not-allowed'} ${isStage3Done ? 'bg-emerald-500 border-white text-white' : 'bg-white border-emerald-100 text-emerald-300'}`}>3</button>
                  <p className="text-[8px] font-black text-slate-500">€{(o.paidValue || 0).toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {isStage3Done && o.creGenerated && (
                   <button onClick={() => generateCRE(o)} className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-[8px] font-black uppercase shadow-lg hover:bg-emerald-700 transition-all">CRE</button>
                )}
                
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  {isMyWork && !isAdmin && (
                    <>
                      <button onClick={() => onToggleLock(o.id)} className={`p-2 rounded-lg ${o.locked ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-300 hover:bg-indigo-500 hover:text-white'}`}>
                        {o.locked ? '🔒' : '🔓'}
                      </button>
                      {!o.locked && (
                        <button onClick={() => { if(confirm("Eliminare?")) onDelete(o.id) }} className="p-2 bg-rose-50 text-rose-300 hover:bg-rose-500 hover:text-white rounded-lg transition-all shadow-sm">🗑️</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!isAdmin && (
        <button onClick={onAdd} className="fixed bottom-14 right-8 w-16 h-16 bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-2xl hover:bg-indigo-600 hover:scale-110 active:scale-90 transition-all z-50 border-4 border-white group">
          <svg className="w-8 h-8 group-hover:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M12 4v16m8-8H4" /></svg>
        </button>
      )}
    </div>
  );
};
export default Catalog;
