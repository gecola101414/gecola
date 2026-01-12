
import React, { useState, useMemo } from 'react';
import { WorkOrder, WorkStatus, FundingIDV, User } from '../types';
import { VoiceInput } from './VoiceInput';

/**
 * Funzione per calcolare i residui di ogni IDV basandosi sugli ordini collegati e il loro stato di avanzamento.
 * Esportata per essere utilizzata in IdvList.tsx.
 */
export const calculateAllResiduals = (idvs: FundingIDV[], orders: WorkOrder[]): Record<string, number> => {
  const residuals: Record<string, number> = {};
  
  // Inizializza i residui con l'importo totale di ogni IDV
  idvs.forEach(idv => {
    residuals[idv.id] = idv.amount;
  });

  // Sottrae il valore degli ordini collegati in base al loro stato attuale
  orders.forEach(order => {
    if (order.status === WorkStatus.ANNULLATO) return;
    
    // Determina il valore attuale dell'impegno in base alla fase di avanzamento
    const value = order.status === WorkStatus.PAGAMENTO ? (order.paidValue ?? order.contractValue ?? order.estimatedValue) :
                  order.status === WorkStatus.AFFIDAMENTO ? (order.contractValue ?? order.estimatedValue) :
                  order.estimatedValue;

    if (order.linkedIdvIds && order.linkedIdvIds.length > 0) {
      // Distribuisce l'importo tra gli IDV collegati (ripartizione equa)
      const share = value / order.linkedIdvIds.length;
      order.linkedIdvIds.forEach(id => {
        if (residuals[id] !== undefined) {
          residuals[id] -= share;
        }
      });
    }
  });
  return residuals;
};

interface WorkFormProps {
  idvs: FundingIDV[];
  orders: WorkOrder[];
  existingChapters: string[];
  currentUser: User;
  onSubmit: (order: Partial<WorkOrder>) => void;
  onCancel: () => void;
  initialData?: WorkOrder;
  prefilledChapter?: string;
}

const WorkForm: React.FC<WorkFormProps> = ({ idvs = [], orders = [], currentUser, onSubmit, onCancel, initialData }) => {
  const [formData, setFormData] = useState<Partial<WorkOrder>>(initialData || {
    description: '',
    estimatedValue: undefined,
    linkedIdvIds: [],
    status: WorkStatus.PROGETTO
  });

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950 md:bg-slate-950/90 md:backdrop-blur-xl flex items-center justify-center md:p-4 font-['Inter']">
      <div className="bg-white w-full h-full md:max-w-6xl md:h-[90vh] md:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden">
        
        <div className="px-6 py-4 md:px-10 md:py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
          <h3 className="text-lg md:text-xl font-black text-slate-950 italic uppercase tracking-tighter">Nuova Pratica</h3>
          <button onClick={onCancel} className="p-2 md:px-5 md:py-2 text-slate-400 font-black uppercase text-[10px]">Esci</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-8 custom-scrollbar">
          <div className="space-y-4">
             <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-4">Oggetto della Spesa</label>
             <textarea 
               value={formData.description} 
               onChange={e => setFormData({...formData, description: e.target.value})}
               placeholder="Dettagliare l'intervento..."
               className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl text-sm font-medium italic min-h-[150px] outline-none focus:border-indigo-600"
             />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
               <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-4">Stima Economica (€)</label>
               <input 
                 type="number" 
                 value={formData.estimatedValue || ''} 
                 onChange={e => setFormData({...formData, estimatedValue: Number(e.target.value)})}
                 className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl font-black text-xl outline-none focus:border-indigo-600"
               />
            </div>
            <div className="bg-indigo-50 p-6 rounded-3xl flex flex-col justify-center border border-indigo-100">
               <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-1 italic">Validazione</p>
               <p className="text-[10px] text-indigo-600 font-medium italic leading-tight">I fondi disponibili verranno calcolati in tempo reale dopo il primo salvataggio.</p>
            </div>
          </div>

          <div className="pt-10">
             <button 
                onClick={() => onSubmit(formData)} 
                disabled={!formData.description || !formData.estimatedValue}
                className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase tracking-[0.2em] shadow-xl disabled:opacity-30 active:scale-95 transition-all"
             >
               Crea Fascicolo Tattico
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default WorkForm;
