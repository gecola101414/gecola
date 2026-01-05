
import React, { useMemo } from 'react';
import { FundingIDV, WorkOrder, UserRole } from '../types';
import { calculateAllResiduals } from './WorkForm';
import { getChapterColor } from './ChaptersSummary';

interface IdvListProps {
  idvs: FundingIDV[];
  orders: WorkOrder[];
  onChapterClick: (chapter: string) => void;
  onAdd: () => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
  userRole?: string;
}

const IdvList: React.FC<IdvListProps> = ({ idvs, orders, onChapterClick, onAdd, onToggleLock, onDelete, userRole }) => {
  const currentResiduals = calculateAllResiduals(idvs, orders);
  const sortedIdvs = [...idvs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const isAdmin = userRole === UserRole.ADMIN;

  const totalAllocated = idvs.reduce((a, b) => a + b.amount, 0);

  return (
    <div className="h-full flex flex-col relative animate-in fade-in duration-500 overflow-hidden font-['Inter']">
      
      {/* HEADER MINIMALE TATTICO */}
      <div className="sticky top-0 z-[45] bg-slate-50 pb-4 flex items-center justify-between border-b border-slate-200 px-2 flex-shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
               <div className="flex h-3 w-6 rounded-sm overflow-hidden shadow-sm border border-slate-200">
                  <div className="flex-1 bg-emerald-600"></div>
                  <div className="flex-1 bg-white"></div>
                  <div className="flex-1 bg-rose-600"></div>
               </div>
               <h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">Registro Asset Fondiari</h2>
            </div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1 ml-8 italic">Comando Militare Esercito Lombardia - Gestione Finanziaria</p>
          </div>

          {isAdmin && (
            <button onClick={onAdd} className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-black text-lg shadow-lg border-2 border-white group-hover:scale-110 transition-all">+</div>
              <div className="text-left">
                <span className="block text-[7px] font-black text-slate-400 uppercase tracking-widest italic leading-none">Assegna</span>
                <span className="text-[10px] font-black text-emerald-700 uppercase italic leading-none">Nuovo Fondo</span>
              </div>
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
           <div className="bg-white px-5 py-2.5 rounded-xl shadow-sm border border-slate-200 flex flex-col items-end">
             <span className="text-[7px] font-black text-slate-400 uppercase italic tracking-widest mb-1">Massa Totale Autorizzata</span>
             <span className="text-base font-black text-slate-900 italic tracking-tighter">€{totalAllocated.toLocaleString()}</span>
           </div>
           <div className="flex h-10 w-10 bg-slate-900 rounded-xl items-center justify-center border-2 border-white shadow-lg overflow-hidden">
             <span className="text-white text-xl">⭐</span>
           </div>
        </div>
      </div>

      {/* LISTA ASSET - LAYOUT TATTICO */}
      <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden m-2 min-h-0 mt-4">
        <div className="bg-slate-50 px-8 py-3 flex justify-between items-center border-b border-slate-100 flex-shrink-0 z-10">
          <span className="text-[10px] font-black text-slate-500 uppercase italic tracking-widest">Database Risorse Economiche (IDV)</span>
          <div className="flex gap-4">
             <span className="text-[8px] font-black text-slate-300 uppercase italic">Stato: Cifrato AES-256</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3 bg-white min-h-0">
          {sortedIdvs.map((idv, index) => {
            const residual = currentResiduals[idv.id] ?? 0;
            const color = getChapterColor(idv.capitolo);
            const isCritical = residual < (idv.amount * 0.1);

            return (
              <div key={idv.id} className={`group bg-white rounded-2xl p-5 border-2 transition-all flex items-center gap-8 relative hover:shadow-lg cursor-default ${idv.locked ? 'bg-slate-50 border-slate-100' : 'border-slate-50 hover:border-indigo-100'}`}>
                
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex flex-col items-center justify-center font-black text-xs italic border-2 border-white shadow-md flex-shrink-0">
                   <span className="text-[5px] opacity-50 font-black">ASSET</span>
                   <span className="text-sm">{(index + 1).toString().padStart(2, '0')}</span>
                </div>

                <div className="w-48 flex flex-col">
                  <div className="flex items-center gap-2">
                     <button onClick={() => onChapterClick(idv.capitolo)} className={`px-2 py-0.5 rounded bg-${color}-500 text-white text-[9px] font-black uppercase shadow-sm`}>Cap. {idv.capitolo}</button>
                     <span className="text-xs font-black text-slate-800 uppercase italic tracking-tighter">{idv.idvCode}</span>
                  </div>
                  <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1 italic leading-none">
                    Resp: {idv.assignedWorkgroup} <br/>
                    <span className="text-[6px] opacity-60">Caricato: {new Date(idv.createdAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-600 italic leading-tight truncate uppercase pr-4">"{idv.motivation}"</p>
                  <div className="flex gap-3 mt-1.5">
                     <span className="text-[7px] font-black text-indigo-400 uppercase">Impiegato: €{(idv.amount - residual).toLocaleString()}</span>
                  </div>
                </div>

                <div className="text-right flex flex-col min-w-[150px]">
                   <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic mb-1 leading-none">Residuo Operativo</span>
                   <p className={`text-lg font-black tracking-tighter italic ${isCritical ? 'text-rose-600' : 'text-emerald-700'}`}>€{residual.toLocaleString()}</p>
                   <div className="w-full h-1 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                      <div className={`h-full transition-all duration-1000 ${isCritical ? 'bg-rose-500' : 'bg-emerald-600'}`} style={{ width: `${(residual / idv.amount) * 100}%` }}></div>
                   </div>
                </div>

                {isAdmin && (
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all ml-4">
                     <button onClick={() => onToggleLock(idv.id)} className={`p-2.5 rounded-xl transition-all shadow-sm ${idv.locked ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-300 hover:bg-indigo-600 hover:text-white'}`}>{idv.locked ? '🔒' : '🔓'}</button>
                     {!idv.locked && (
                        <button onClick={() => { if(confirm("Confermare eliminazione definitiva asset finanziario?")) onDelete(idv.id) }} className="p-2.5 bg-rose-50 text-rose-300 hover:text-white hover:bg-rose-600 rounded-xl transition-all">🗑️</button>
                     )}
                  </div>
                )}
              </div>
            );
          })}
          
          {sortedIdvs.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-200 py-32">
               <span className="text-6xl mb-6">💰</span>
               <p className="text-[12px] font-black uppercase tracking-[0.4em]">Nessuna risorsa assegnata a sistema</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IdvList;
