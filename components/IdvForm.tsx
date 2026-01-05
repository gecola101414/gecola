
import React, { useState } from 'react';
import { FundingIDV, User, UserRole } from '../types';
import { VoiceInput } from './VoiceInput';

interface IdvFormProps {
  existingChapters: string[];
  users: User[];
  currentUser: User;
  onSubmit: (idv: Partial<FundingIDV>) => void;
  onCancel: () => void;
}

export const IdvForm: React.FC<IdvFormProps> = ({ existingChapters = [], users = [], currentUser, onSubmit, onCancel }) => {
  const availableWorkgroups = Array.from(new Set(users.map(u => u.workgroup))).sort();

  const [formData, setFormData] = useState<Partial<FundingIDV>>({
    idvCode: '',
    capitolo: '',
    amount: undefined,
    motivation: '',
    assignedWorkgroup: currentUser.workgroup
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      ownerWorkgroup: currentUser.workgroup
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300 font-['Inter']">
      <div className="bg-white w-full max-w-[1200px] h-full max-h-[90vh] rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* HEADER FASCICOLO */}
        <div className="px-10 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-emerald-700 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-lg">€</div>
             <div>
               <h3 className="text-xl font-black text-slate-950 italic uppercase tracking-tighter">Fascicolo Iniezione Fondi</h3>
               <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex h-2 w-4 rounded-sm overflow-hidden border border-slate-200">
                     <div className="flex-1 bg-emerald-600"></div>
                     <div className="flex-1 bg-white"></div>
                     <div className="flex-1 bg-rose-600"></div>
                  </div>
                  <span className="text-[8px] font-black text-emerald-600 uppercase tracking-[0.2em]">Protocollo Tattico 4.0</span>
               </div>
             </div>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={onCancel} className="px-4 py-2 bg-white border border-slate-200 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-rose-600 transition-all">Chiudi Fascicolo</button>
             <button onClick={handleSubmit} className="px-6 py-2 bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-emerald-800 transition-all">Registra Risorsa</button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* SINISTRA: DATI TECNICI (60%) */}
          <div className="flex-[1.2] p-10 overflow-y-auto custom-scrollbar border-r border-slate-100 space-y-8">
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-50 p-6 rounded-[1.5rem] border border-slate-100">
                <label className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-2">Identificativo Asset (IDV)</label>
                <VoiceInput
                  value={formData.idvCode || ''}
                  onChange={(v) => setFormData({...formData, idvCode: v})}
                  placeholder="es. IDV-2026-X"
                  required
                  className="w-full bg-transparent border-b-2 border-slate-200 text-lg font-black text-slate-900 outline-none focus:border-emerald-600 transition-all"
                />
              </div>
              <div className="bg-slate-50 p-6 rounded-[1.5rem] border border-slate-100">
                <label className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-2">Capitolo di Spesa</label>
                <input
                  list="chapters"
                  value={formData.capitolo || ''}
                  onChange={(e) => setFormData({...formData, capitolo: e.target.value})}
                  placeholder="es. 1010"
                  required
                  className="w-full bg-transparent border-b-2 border-slate-200 text-lg font-black text-indigo-700 outline-none focus:border-indigo-600 transition-all"
                />
                <datalist id="chapters">
                  {existingChapters.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-slate-50 p-6 rounded-[1.5rem] border border-slate-100">
                <label className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-2">Importo Nominale (€)</label>
                <VoiceInput
                  type="number"
                  value={formData.amount || ''}
                  onChange={(v) => setFormData({...formData, amount: Number(v)})}
                  placeholder="0.00"
                  required
                  className="w-full bg-transparent border-b-2 border-slate-200 text-2xl font-black text-emerald-700 outline-none focus:border-emerald-600 transition-all"
                />
              </div>
              <div className="bg-indigo-50/50 p-6 rounded-[1.5rem] border border-indigo-100">
                <label className="text-[8px] font-black uppercase text-indigo-500 tracking-[0.2em] block mb-2">Ufficio di Responsabilità</label>
                <select
                  value={formData.assignedWorkgroup}
                  onChange={(e) => setFormData({...formData, assignedWorkgroup: e.target.value})}
                  className="w-full bg-transparent border-b-2 border-indigo-200 text-lg font-black text-indigo-900 outline-none focus:border-indigo-600 transition-all uppercase italic"
                >
                  {availableWorkgroups.map(wg => (
                    <option key={wg} value={wg}>{wg}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] block ml-4">Motivazione Strategica dell'Assegnazione</label>
              <VoiceInput
                type="textarea"
                value={formData.motivation || ''}
                onChange={(v) => setFormData({...formData, motivation: v})}
                placeholder="Dettagliare la finalità della risorsa e gli eventuali vincoli di spesa..."
                required
                className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] text-sm font-medium italic text-slate-700 min-h-[150px] outline-none focus:border-emerald-600 transition-all"
              />
            </div>
          </div>

          {/* DESTRA: INFOGRAFICA E INFO (40%) */}
          <div className="flex-1 bg-slate-50/50 p-10 flex flex-col border-l border-slate-100 space-y-8 relative overflow-hidden">
             <div className="absolute bottom-0 right-0 p-10 opacity-5 font-black text-[12rem] italic select-none pointer-events-none">
                €
             </div>
             
             <div className="relative z-10 space-y-6">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-800 border-b border-emerald-200 pb-2 italic">Parametri di Validità</h4>
                
                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                   <div className="flex items-start gap-4">
                      <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center font-black">1</div>
                      <div className="flex-1">
                         <p className="text-[10px] font-black text-slate-800 uppercase italic">Integrità Transazionale</p>
                         <p className="text-[9px] font-medium text-slate-400 italic">Il fondo sarà associato permanentemente all'ufficio {formData.assignedWorkgroup}.</p>
                      </div>
                   </div>
                   <div className="flex items-start gap-4">
                      <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-black">2</div>
                      <div className="flex-1">
                         <p className="text-[10px] font-black text-slate-800 uppercase italic">Vincolo di Capitolo</p>
                         <p className="text-[9px] font-medium text-slate-400 italic">Le pratiche potranno attingere a questa risorsa solo se corrispondono al capitolo {formData.capitolo || '---'}.</p>
                      </div>
                   </div>
                   <div className="flex items-start gap-4">
                      <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center font-black">3</div>
                      <div className="flex-1">
                         <p className="text-[10px] font-black text-slate-800 uppercase italic">Tracciabilità Operatore</p>
                         <p className="text-[9px] font-medium text-slate-400 italic">Registrato da: {currentUser.username.toUpperCase()} il {new Date().toLocaleDateString()}</p>
                      </div>
                   </div>
                </div>

                <div className="p-8 bg-slate-900 rounded-[2.5rem] border-2 border-emerald-500/30 text-white space-y-4">
                   <div className="flex items-center gap-3">
                      <span className="text-2xl">🛡️</span>
                      <p className="text-[11px] font-black uppercase tracking-widest italic">Sicurezza Asset</p>
                   </div>
                   <p className="text-[10px] text-slate-400 leading-relaxed italic">Ogni iniezione di fondi viene registrata nel Ledger di Audit. La modifica di importi già impegnati richiederà una procedura di sblocco amministrativo.</p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
