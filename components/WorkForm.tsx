
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
  
  // BLINDATURA PROTOCOLLO 4.8 - FILTRAGGIO FISICO ASSOLUTO
  // Nessuna eccezione per Admin o PPB. L'operatore vede SOLO i fondi del proprio ufficio.
  const myCompetenceIdvs = useMemo(() => {
    return idvs.filter(i => i.assignedWorkgroup === currentUser.workgroup);
  }, [idvs, currentUser]);

  // Capitoli filtrati esclusivamente in base alla competenza dell'operatore
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

  // IDV disponibili per il capitolo selezionato (sempre filtrati per ufficio)
  const filteredIdvs = useMemo(() => {
    return myCompetenceIdvs.filter(i => i.capitolo === selectedChapter);
  }, [myCompetenceIdvs, selectedChapter]);

  // Calcolo copertura finanziaria basato SOLO sui fondi selezionati dell'ufficio
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

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300 font-['Inter']">
      <div className="bg-white w-full max-w-[1500px] h-full max-h-[96vh] rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* BARRA COMANDI STICKY TOP */}
        <div className="px-10 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0 z-50">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-lg">W</div>
             <div>
               <h3 className="text-xl font-black text-slate-950 italic uppercase tracking-tighter">Fascicolo Impegno Automizzato</h3>
               <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex h-2 w-4 rounded-sm overflow-hidden border border-slate-200">
                     <div className="flex-1 bg-emerald-600"></div>
                     <div className="flex-1 bg-white"></div>
                     <div className="flex-1 bg-rose-600"></div>
                  </div>
                  <span className="text-[8px] font-black text-rose-500 uppercase tracking-[0.2em]">Blindatura Totale Ufficio: {currentUser.workgroup}</span>
               </div>
             </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex flex-col items-end pr-6 border-r border-slate-200">
                <span className="text-[7px] font-black text-slate-400 uppercase italic tracking-widest">Protocollo 4.8 Iron Wall</span>
                <span className="text-[10px] font-black text-slate-900 uppercase italic">{currentUser.username} | Competenze Limitate ad Ufficio</span>
             </div>
             <button onClick={onCancel} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-rose-600 transition-all">Annulla</button>
             <button 
                onClick={() => onSubmit(formData)} 
                disabled={!selectedChapter || !formData.description || !hasFullCoverage}
                className={`px-8 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg transition-all ${(!selectedChapter || !formData.description || !hasFullCoverage) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
             >
               Registra Impegno Autorizzato
             </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0 bg-white">
          {/* SINISTRA: DATI ECONOMICI (35%) */}
          <div className="w-1/3 p-8 overflow-y-auto custom-scrollbar border-r border-slate-100 space-y-6">
            <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 border-b border-slate-100 pb-2 italic">Perimetro Finanziario</h4>
            
            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-6">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner">
                <label className="text-[7px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-1">Identificativo Unico</label>
                <p className="text-xs font-black text-indigo-600 italic">AUTO-PROTOCOLLO SYSTEM 4.8</p>
              </div>

              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-2">Capitolo (Autorizzato per {currentUser.workgroup})</label>
                <select 
                  value={selectedChapter}
                  onChange={(e) => { setSelectedChapter(e.target.value); setFormData({ ...formData, linkedIdvIds: [] }); }}
                  className="w-full bg-white border-2 border-slate-200 px-4 py-3 rounded-xl font-black text-indigo-600 outline-none focus:border-indigo-600"
                >
                  <option value="">Seleziona Capitolo di Competenza...</option>
                  {myChapters.map(c => <option key={c} value={c}>Capitolo {c}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-2">Valore Stimato Intervento (€)</label>
                <VoiceInput
                  type="number"
                  value={formData.estimatedValue || ''}
                  onChange={(v) => setFormData({ ...formData, estimatedValue: Number(v) })}
                  placeholder="0.00"
                  className="w-full bg-white border-2 border-slate-200 px-4 py-3 rounded-xl font-black text-xl text-slate-900 outline-none focus:border-indigo-600"
                />
              </div>

              <div className={`p-5 rounded-2xl border-2 flex flex-col justify-center transition-all ${hasFullCoverage ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-rose-50 border-rose-500 text-rose-800'}`}>
                <span className="text-[8px] font-black uppercase italic tracking-widest mb-1 leading-none">Copertura su Fondi {currentUser.workgroup}</span>
                <p className="text-2xl font-black tracking-tighter italic">€{selectedFundsTotal.toLocaleString()} / €{(formData.estimatedValue || 0).toLocaleString()}</p>
                {!hasFullCoverage && (formData.estimatedValue || 0) > 0 && (
                  <span className="text-[7px] font-black uppercase mt-1 animate-pulse italic">Mancano fondi propri dell'ufficio per procedere</span>
                )}
                {hasFullCoverage && (
                  <span className="text-[7px] font-black uppercase mt-1">Copertura Validata Internamente ✓</span>
                )}
              </div>
            </div>

            <div className="p-6 bg-rose-900 rounded-[2rem] text-white">
               <p className="text-[8px] font-black uppercase text-rose-300 tracking-widest mb-2">Divieto di Cross-Office</p>
               <p className="text-[10px] text-slate-300 italic leading-relaxed">
                 Il Protocollo 4.8 inibisce l'uso di fondi non assegnati all'ufficio <span className="text-white font-bold">{currentUser.workgroup}</span>. 
                 Nessuna eccezione è permessa per garantire la sovranità del budget.
               </p>
            </div>
          </div>

          <div className="w-1/3 p-8 overflow-y-auto custom-scrollbar border-r border-slate-100 space-y-6">
            <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 border-b border-slate-100 pb-2 italic">Specifiche Tecniche</h4>
            
            <div className="space-y-4">
              <label className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] block ml-4">Descrizione Intervento</label>
              <VoiceInput
                type="textarea"
                value={formData.description || ''}
                onChange={(v) => setFormData({ ...formData, description: v })}
                placeholder="Dettagliare l'oggetto della spesa..."
                className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] text-sm font-medium italic text-slate-700 min-h-[300px] outline-none focus:border-indigo-600"
              />
            </div>

            <div className="space-y-4">
              <label className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] block ml-4">Relazione Tecnica (PDF)</label>
              <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" id="pdf-upload" />
              <label htmlFor="pdf-upload" className={`w-full p-8 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center cursor-pointer transition-all ${formData.projectPdf ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-indigo-300'}`}>
                <span className="text-2xl mb-2">{formData.projectPdf ? '📄' : '📤'}</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-center truncate w-full px-4">{formData.projectPdf ? formData.projectPdf.name : 'Carica Atto Tecnico'}</span>
              </label>
            </div>
          </div>

          <div className="w-1/3 p-8 bg-slate-50/30 overflow-y-auto custom-scrollbar space-y-6">
             <div className="flex justify-between items-end border-b border-indigo-200 pb-2">
                <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-indigo-600 italic">Disponibilità Ufficio {currentUser.workgroup}</h4>
                <span className="text-[7px] font-black text-rose-500 uppercase italic">Sealed</span>
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
                       disabled={res <= 0 && !isSelected} 
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
                        <div className="mt-auto flex justify-between items-end">
                           <div>
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic block leading-none mb-1">Residuo Ufficio</span>
                              <span className="text-lg font-black text-slate-800 italic tracking-tighter">€{res.toLocaleString()}</span>
                           </div>
                           <span className="text-[7px] font-black text-emerald-600 uppercase italic">Valido</span>
                        </div>
                     </button>
                   );
                 })}
                 {filteredIdvs.length === 0 && (
                   <p className="text-[10px] font-black text-rose-500 uppercase text-center mt-10 italic px-6 leading-relaxed">ATTENZIONE: Nessun fondo assegnato ad ufficio {currentUser.workgroup} per il capitolo {selectedChapter}. Impossibile procedere.</p>
                 )}
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkForm;
