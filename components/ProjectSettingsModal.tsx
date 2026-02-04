
import { X, Save, Settings2, Info, User, MapPin, Calendar, Building2, ShieldCheck, UserCheck } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { ProjectInfo } from '../types';
import { REGIONS, YEARS } from '../constants';

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  info: ProjectInfo;
  onSave: (newInfo: ProjectInfo) => void;
}

const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ isOpen, onClose, info, onSave }) => {
  const [formData, setFormData] = useState<ProjectInfo>(info);

  useEffect(() => {
    if (isOpen) {
      setFormData({
          ...info,
          fontSizeTitle: info.fontSizeTitle || 28,
          fontSizeClient: info.fontSizeClient || 15,
          fontSizeTotals: info.fontSizeTotals || 22,
          tariffColumnWidth: info.tariffColumnWidth || 135,
          fontSizeMeasurements: info.fontSizeMeasurements || 12,
          fontSizeWbsSidebar: info.fontSizeWbsSidebar || 14,
      });
    }
  }, [isOpen, info]);

  if (!isOpen) return null;

  const handleChange = (field: keyof ProjectInfo, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[450] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] shadow-[0_25px_80px_rgba(0,0,0,0.6)] w-full max-w-5xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 flex flex-col md:flex-row h-auto max-h-[95vh]">
        
        {/* SIDEBAR DIDATTICA: La Logica del Progetto */}
        <div className="w-full md:w-80 bg-gradient-to-br from-slate-800 to-slate-950 p-8 text-white flex flex-col">
          <div className="mb-10">
             <div className="bg-blue-600/20 p-4 rounded-[1.5rem] w-fit mb-4 shadow-inner ring-1 ring-blue-500/30">
                <Settings2 className="w-10 h-10 text-blue-400" />
             </div>
             <h2 className="text-2xl font-black uppercase tracking-tighter leading-tight italic text-blue-100">Control Room<br/>Progetto</h2>
             <div className="h-1 w-12 bg-blue-500 rounded-full mt-3"></div>
          </div>

          <div className="space-y-6 flex-1">
             <div className="bg-white/5 p-5 rounded-2xl border border-white/5 shadow-inner">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-2 flex items-center gap-2">
                  <Info className="w-3 h-3" /> Metodologia
                </h4>
                <p className="text-[11px] font-medium leading-relaxed opacity-80 italic">
                  "L'anagrafica trasforma un semplice elenco in un documento legale. Definire correttamente Progettista e Committente è la base per la validità contrattuale del Computo."
                </p>
             </div>
             
             <div className="bg-slate-800/40 p-5 rounded-2xl border border-white/5">
                <p className="text-[10px] text-slate-400 leading-relaxed italic">
                    Usa questa sezione per aggiornare i dati di testata che appariranno in tutti i documenti PDF esportati. Le percentuali di IVA e Sicurezza aggiornano il Quadro Economico istantaneamente.
                </p>
             </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 text-[9px] font-black uppercase tracking-widest opacity-40 text-center">
            Engineering Solution v11.9.3
          </div>
        </div>

        {/* AREA FORM: Dati Anagrafici e Tecnici */}
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
          <div className="px-8 py-6 flex justify-between items-center border-b border-slate-100 bg-white shadow-sm">
              <div>
                <h3 className="font-black uppercase text-xs tracking-widest text-slate-400 mb-1">Anagrafica Generale</h3>
                <p className="text-slate-800 text-lg font-black tracking-tighter italic">Variabili di Testata e Calcolo</p>
              </div>
              <button onClick={onClose} className="hover:bg-slate-100 p-2 rounded-2xl transition-all">
                <X className="w-6 h-6 text-slate-400" />
              </button>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2 space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Titolo del Progetto / Opera</label>
                    <div className="relative group">
                        <Building2 className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                        <input type="text" value={formData.title} onChange={e => handleChange('title', e.target.value)} className="w-full border-2 border-slate-100 rounded-2xl pl-12 pr-4 py-4 outline-none focus:border-blue-500 bg-white font-black text-slate-700 shadow-sm transition-all text-sm" placeholder="Es: Ristrutturazione Bagno..." />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Tecnico Progettista</label>
                    <div className="relative group">
                        <UserCheck className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                        <input type="text" value={formData.designer} onChange={e => handleChange('designer', e.target.value)} className="w-full border-2 border-slate-100 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-blue-500 bg-white font-bold text-slate-700 text-sm shadow-sm transition-all" />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Committente</label>
                    <div className="relative group">
                        <User className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                        <input type="text" value={formData.client} onChange={e => handleChange('client', e.target.value)} className="w-full border-2 border-slate-100 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-blue-500 bg-white font-bold text-slate-700 text-sm shadow-sm transition-all" />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Luogo del Cantiere</label>
                    <div className="relative group">
                        <MapPin className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                        <input type="text" value={formData.location} onChange={e => handleChange('location', e.target.value)} className="w-full border-2 border-slate-100 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-blue-500 bg-white font-bold text-slate-700 text-sm shadow-sm transition-all" />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Data del Computo</label>
                    <div className="relative group">
                        <Calendar className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                        <input type="text" value={formData.date} onChange={e => handleChange('date', e.target.value)} className="w-full border-2 border-slate-100 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-blue-500 bg-white font-bold text-slate-700 text-sm shadow-sm transition-all" />
                    </div>
                </div>
            </div>

            {/* Parametri di Calcolo */}
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-500" /> Impostazioni Contabili
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="space-y-1.5">
                        <span className="text-[9px] font-black uppercase text-slate-400 ml-1">Regione</span>
                        <select value={formData.region} onChange={e => handleChange('region', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20">
                            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <span className="text-[9px] font-black uppercase text-slate-400 ml-1">Anno</span>
                        <select value={formData.year} onChange={e => handleChange('year', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20">
                            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <span className="text-[9px] font-black uppercase text-slate-400 ml-1">IVA (%)</span>
                        <input type="number" value={formData.vatRate} onChange={e => handleChange('vatRate', parseFloat(e.target.value))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </div>
                    <div className="space-y-1.5">
                        <span className="text-[9px] font-black uppercase text-slate-400 ml-1">Oneri Sic. (%)</span>
                        <input type="number" value={formData.safetyRate} onChange={e => handleChange('safetyRate', parseFloat(e.target.value))} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </div>
                </div>
            </div>
          </form>

          {/* Footer Azioni */}
          <div className="p-8 bg-white border-t border-slate-100 flex justify-end gap-4 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
            <button
              type="button"
              onClick={onClose}
              className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-colors tracking-[0.2em]"
            >
              Chiudi
            </button>
            <button
              onClick={handleSubmit}
              className="px-12 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl shadow-blue-200 transform transition-all active:scale-95 flex items-center gap-3"
            >
              <Save className="w-5 h-5" />
              Applica Modifiche
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectSettingsModal;
