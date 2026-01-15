
import React, { useState, useMemo } from 'react';
import { WorkOrder, WorkStatus, FundingIDV, User, UserRole } from '../types';
import { VoiceInput } from './VoiceInput';

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

export const calculateAllResiduals = (idvs: FundingIDV[], orders: WorkOrder[], excludeOrderId?: string) => {
  const currentResiduals: Record<string, number> = {};
  (idvs || []).forEach(idv => { currentResiduals[idv.id] = idv.amount || 0; });

  const sortedOrders = [...(orders || [])]
    .filter(o => o.id !== excludeOrderId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  sortedOrders.forEach(order => {
    let costToCover = 0;
    if (order.status === WorkStatus.PAGAMENTO) costToCover = order.paidValue || 0;
    else if (order.status === WorkStatus.AFFIDAMENTO) costToCover = order.contractValue || 0;
    else costToCover = order.estimatedValue || 0;

    (order.linkedIdvIds || []).forEach(idvId => {
      const available = currentResiduals[idvId] || 0;
      const taken = Math.min(costToCover, available);
      currentResiduals[idvId] -= taken;
      costToCover -= taken;
    });
  });

  return currentResiduals;
};

const WorkForm: React.FC<WorkFormProps> = ({ idvs = [], orders = [], existingChapters = [], currentUser, onSubmit, onCancel, initialData, prefilledChapter }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // PROTOCOLLO 6.0: P.P.B. e ADMIN vedono tutti i fondi, gli altri solo quelli del proprio ufficio
  const myCompetenceIdvs = useMemo(() => {
    if (currentUser.role === UserRole.PPB || currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.COMANDANTE) {
      return idvs;
    }
    return idvs.filter(i => i.assignedWorkgroup === currentUser.workgroup);
  }, [idvs, currentUser]);

  const myChapters = useMemo(() => Array.from(new Set(myCompetenceIdvs.map(i => i.capitolo))), [myCompetenceIdvs]);

  const [selectedChapter, setSelectedChapter] = useState<string>(
    prefilledChapter || (initialData ? (idvs.find(i => initialData.linkedIdvIds?.includes(i.id))?.capitolo || '') : '')
  );
  
  const [formData, setFormData] = useState<Partial<WorkOrder>>(
    initialData || {
      description: '',
      estimatedValue: undefined,
      linkedIdvIds: [],
      status: WorkStatus.PROGETTO
    }
  );

  const idvResiduals = useMemo(() => calculateAllResiduals(idvs, orders, initialData?.id), [idvs, orders, initialData]);

  const filteredIdvs = useMemo(() => {
    return myCompetenceIdvs.filter(i => i.capitolo === selectedChapter);
  }, [myCompetenceIdvs, selectedChapter]);

  const selectedFundsTotal = useMemo(() => {
    return (formData.linkedIdvIds || []).reduce((sum, id) => sum + (idvResiduals[id] || 0), 0);
  }, [formData.linkedIdvIds, idvResiduals]);

  const hasFullCoverage = (formData.estimatedValue || 0) > 0 && selectedFundsTotal >= (formData.estimatedValue || 0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData({ ...formData, projectPdf: { name: file.name, data: event.target?.result as string } });
    };
    reader.readAsDataURL(file);
  };

  const toggleIdv = (id: string) => {
    const current = formData.linkedIdvIds || [];
    if (current.includes(id)) {
      setFormData({ ...formData, linkedIdvIds: current.filter(i => i !== id) });
    } else {
      setFormData({ ...formData, linkedIdvIds: [...current, id] });
    }
  };

  const handleFormSubmit = () => {
    if (isSubmitting || !selectedChapter || !formData.description || !hasFullCoverage) return;
    setIsSubmitting(true);
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300 font-['Inter']">
      <div className="bg-white w-full max-w-[1500px] h-full max-h-[96vh] rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        <div className="px-10 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0 z-50">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-lg">W</div>
             <div>
               <h3 className="text-xl font-black text-slate-950 italic uppercase tracking-tighter">Fascicolo Impegno Automizzato</h3>
               <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[8px] font-black text-rose-500 uppercase tracking-[0.2em]">Operatore: {currentUser.username} [{currentUser.role}]</span>
               </div>
             </div>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={onCancel} disabled={isSubmitting} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-rose-600 transition-all disabled:opacity-50">Annulla</button>
             <button 
                onClick={handleFormSubmit} 
                disabled={!selectedChapter || !formData.description || !hasFullCoverage || isSubmitting}
                className={`px-8 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg transition-all flex items-center gap-2 ${(!selectedChapter || !formData.description || !hasFullCoverage || isSubmitting) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
             >
               {isSubmitting ? <span className="animate-spin text-sm">❂</span> : null}
               {isSubmitting ? 'Salvataggio...' : 'Registra Impegno Autorizzato'}
             </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0 bg-white">
          <div className="w-1/3 p-8 overflow-y-auto custom-scrollbar border-r border-slate-100 space-y-6">
            <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 border-b border-slate-100 pb-2 italic">Perimetro Finanziario</h4>
            
            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-6">
              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-2">Capitolo di Spesa</label>
                <select 
                  value={selectedChapter}
                  disabled={isSubmitting}
                  onChange={(e) => { setSelectedChapter(e.target.value); setFormData({ ...formData, linkedIdvIds: [] }); }}
                  className="w-full bg-white border-2 border-slate-200 px-4 py-3 rounded-xl font-black text-indigo-600 outline-none focus:border-indigo-600"
                >
                  <option value="">Seleziona Capitolo...</option>
                  {myChapters.map(c => <option key={c} value={c}>Capitolo {c}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-2">Valore Stimato (€)</label>
                <VoiceInput
                  type="number"
                  value={formData.estimatedValue || ''}
                  disabled={isSubmitting}
                  onChange={(v) => setFormData({ ...formData, estimatedValue: Number(v) })}
                  placeholder="0.00"
                  className="w-full bg-white border-2 border-slate-200 px-4 py-3 rounded-xl font-black text-xl text-slate-900 outline-none focus:border-indigo-600"
                />
              </div>

              <div className={`p-5 rounded-2xl border-2 flex flex-col justify-center transition-all ${hasFullCoverage ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'}`}>
                <span className="text-[8px] font-black uppercase italic tracking-widest mb-1 leading-none">Copertura Su Fondi Selezionati</span>
                <p className="text-2xl font-black tracking-tighter italic">€{selectedFundsTotal.toLocaleString()} / €{(formData.estimatedValue || 0).toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="w-1/3 p-8 overflow-y-auto custom-scrollbar border-r border-slate-100 space-y-6">
            <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 border-b border-slate-100 pb-2 italic">Specifiche Tecniche</h4>
            <VoiceInput
              type="textarea"
              value={formData.description || ''}
              disabled={isSubmitting}
              onChange={(v) => setFormData({ ...formData, description: v })}
              placeholder="Dettagliare l'oggetto della spesa..."
              className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] text-sm font-medium italic text-slate-700 min-h-[300px] outline-none focus:border-indigo-600"
            />
            <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" id="pdf-upload" />
            <label htmlFor="pdf-upload" className={`w-full p-8 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center cursor-pointer transition-all ${formData.projectPdf ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-indigo-300'}`}>
              <span className="text-2xl mb-2">{formData.projectPdf ? '📄' : '📤'}</span>
              <span className="text-[9px] font-black uppercase tracking-widest text-center truncate w-full px-4">{formData.projectPdf ? formData.projectPdf.name : 'Carica Atto Tecnico (Relazione)'}</span>
            </label>
          </div>

          <div className="w-1/3 p-8 bg-slate-50/30 overflow-y-auto custom-scrollbar space-y-6">
             <div className="flex justify-between items-end border-b border-indigo-200 pb-2">
                <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-600 italic">Disponibilità per Capitolo {selectedChapter || '---'}</h4>
             </div>
             
             {!selectedChapter ? (
               <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-40">
                  <span className="text-5xl mb-4">💳</span>
                  <p className="text-[10px] font-black uppercase tracking-widest text-center">Definire il capitolo per attivare il pool fondi</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 gap-3">
                 {filteredIdvs.map((idv) => {
                   const res = idvResiduals[idv.id] || 0;
                   const isSelected = formData.linkedIdvIds?.includes(idv.id);
                   return (
                     <button 
                       key={idv.id} 
                       type="button" 
                       disabled={(res <= 0 && !isSelected) || isSubmitting} 
                       onClick={() => toggleIdv(idv.id)} 
                       className={`p-6 text-left rounded-[1.8rem] border-2 transition-all flex flex-col justify-between h-32 relative overflow-hidden ${isSelected ? 'border-indigo-600 bg-white shadow-xl scale-[1.02] z-10' : 'border-slate-100 bg-white hover:border-indigo-200'}`}
                     >
                        <div className="flex justify-between items-start">
                           <div className="flex flex-col">
                              <span className="text-[10px] font-black uppercase text-indigo-600 tracking-tighter">{idv.idvCode}</span>
                              <span className="text-[7px] font-black text-slate-400 uppercase italic truncate max-w-[150px]">{idv.motivation}</span>
                           </div>
                           {isSelected && <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">✓</div>}
                        </div>
                        <div className="mt-auto">
                           <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic block leading-none mb-1">Disponibile: €{res.toLocaleString()}</span>
                           <span className="text-[7px] font-black text-emerald-600 uppercase italic">Ufficio: {idv.assignedWorkgroup}</span>
                        </div>
                     </button>
                   );
                 })}
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkForm;
