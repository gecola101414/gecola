
import React from 'react';
import { WorkOrder, WorkStatus, User } from '../types';

interface CatalogProps {
  orders: WorkOrder[];
  idvs: any[];
  onStageClick: (order: WorkOrder, stage: number) => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onChapterClick: (chapter: string) => void;
  currentUser: User;
  onShowHistory: (id: string) => void;
}

const Catalog: React.FC<CatalogProps> = ({ orders, onStageClick, onAdd, currentUser }) => {
  return (
    <div className="space-y-4 md:space-y-6 pb-24">
      <div className="flex justify-between items-center px-2">
        <h2 className="text-xl md:text-2xl font-black text-slate-800 uppercase italic tracking-tighter">Registro Lavori</h2>
        <span className="text-[10px] font-black text-slate-400 uppercase">{orders.length} Pratiche</span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {orders.map((o) => (
          <div key={o.id} className="bg-white rounded-[1.8rem] md:rounded-[2.5rem] p-5 md:p-8 border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            <div className="flex-1 min-w-0">
               <div className="flex items-center gap-2 mb-2">
                 <span className="bg-slate-900 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase">{o.orderNumber}</span>
                 <span className="text-[8px] font-black text-slate-400 uppercase">UFFICIO: {o.workgroup}</span>
               </div>
               <h3 className="text-sm md:text-lg font-black text-slate-800 uppercase italic leading-none truncate">{o.description}</h3>
               <p className="text-xs font-black text-indigo-600 mt-1 italic">€ {o.estimatedValue.toLocaleString()}</p>
            </div>

            <div className="flex justify-between md:justify-end items-center gap-4 pt-4 md:pt-0 border-t md:border-t-0 border-slate-50">
               <div className="flex gap-2">
                 {[1, 2, 3].map(stage => (
                   <button 
                     key={stage}
                     onClick={() => currentUser.workgroup === o.workgroup && onStageClick(o, stage)}
                     className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center font-black text-xs shadow-md transition-all ${
                       (stage === 1 && o.status === WorkStatus.PROGETTO) || 
                       (stage === 2 && o.status === WorkStatus.AFFIDAMENTO) || 
                       (stage === 3 && o.status === WorkStatus.PAGAMENTO) 
                       ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                     }`}
                   >
                     {stage}
                   </button>
                 ))}
               </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={onAdd} className="fixed bottom-24 right-6 w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-2xl z-50 md:hidden font-black text-2xl">+</button>
      <button onClick={onAdd} className="hidden md:flex fixed bottom-12 right-12 px-10 py-5 bg-indigo-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl z-50 items-center gap-4 hover:scale-105 active:scale-95 transition-all">Nuovo Impegno +</button>
    </div>
  );
};
export default Catalog;
