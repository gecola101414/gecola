import React, { useState, useEffect } from 'react';
import { REGIONS, YEARS } from '../constants';
import { Map, ArrowRight, Check, Sparkles, Loader2, BookOpen, ExternalLink, Megaphone } from 'lucide-react';
import { ProjectInfo } from '../types';

interface WelcomeModalProps {
  isOpen: boolean;
  onComplete: (info: ProjectInfo, description?: string) => void;
  isLoading: boolean;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onComplete, isLoading }) => {
  const [step, setStep] = useState(1);
  const [region, setRegion] = useState('');
  const [year, setYear] = useState('');
  const [client, setClient] = useState('');
  const [designer, setDesigner] = useState('Ing. Nome Designer');
  const [title, setTitle] = useState('Ristrutturazione Appartamento');
  const [description, setDescription] = useState('');

  // --- LOGICA BANNER PUBBLICITARIO ---
  const [bannerIdx, setBannerIdx] = useState(0);
  const ads = [
    { 
      name: 'MAPEI', 
      url: 'https://www.mapei.com/it/it/home-page', 
      tagline: 'Sistemi all\'avanguardia per l\'edilizia e l\'architettura.',
      color: 'text-blue-600'
    },
    { 
      name: 'GeCoLa.it', 
      url: 'https://www.gecola.it/', 
      tagline: 'Il portale n.1 per la consultazione dei prezzari regionali.',
      color: 'text-orange-600'
    }
  ];

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setBannerIdx(prev => (prev === 0 ? 1 : 0));
    }, 5000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (region && year) {
      setStep(2);
    }
  };

  const handleFinalSubmit = (skipGeneration: boolean = false) => {
    const info: ProjectInfo = {
      title,
      client,
      designer,
      location: region,
      date: new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
      priceList: '',
      region,
      year,
      vatRate: 10,
      safetyRate: 3
    };
    onComplete(info, skipGeneration ? undefined : description);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-700 flex flex-col">
        
        {/* Header */}
        <div className="bg-[#1e293b] px-6 py-8 text-center border-b border-slate-600">
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">GeCoLa <span className="text-orange-500">Cloud</span></h1>
          <p className="text-slate-400 text-sm font-medium uppercase tracking-widest">Engineering Suite v11.9</p>
        </div>

        <div className="p-8 flex-1">
          
          {/* STEP 1: CONFIGURATION */}
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center mb-6">
                 <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm mr-3">1</div>
                 <h2 className="text-xl font-bold text-gray-800">Dati Generali Progetto</h2>
              </div>
              
              <form onSubmit={handleStep1Submit} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black uppercase text-gray-400 mb-1">Regione Prezzario *</label>
                    <select 
                      required
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full border-2 border-gray-100 rounded-lg p-3 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-bold text-gray-700"
                    >
                      <option value="">Seleziona...</option>
                      {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase text-gray-400 mb-1">Anno Riferimento *</label>
                    <select 
                      required
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full border-2 border-gray-100 rounded-lg p-3 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-bold text-gray-700"
                    >
                       <option value="">Seleziona...</option>
                       {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-black uppercase text-gray-400 mb-1">Titolo Intervento</label>
                        <input 
                        type="text" 
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full border-2 border-gray-100 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        placeholder="Es. Ristrutturazione Bagno"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-black uppercase text-gray-400 mb-1">Committente</label>
                        <input 
                        type="text" 
                        value={client}
                        onChange={(e) => setClient(e.target.value)}
                        className="w-full border-2 border-gray-100 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        placeholder="Es. Mario Rossi"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-black uppercase text-gray-400 mb-1">Tecnico Incaricato</label>
                    <input 
                    type="text" 
                    value={designer}
                    onChange={(e) => setDesigner(e.target.value)}
                    className="w-full border-2 border-gray-100 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="Es. Ing. Mario Rossi"
                    />
                </div>

                <div className="pt-4 flex justify-end">
                   <button 
                     type="submit" 
                     disabled={!region || !year}
                     className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-black uppercase text-xs tracking-widest flex items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-95"
                   >
                     Avanti <ArrowRight className="w-4 h-4 ml-2" />
                   </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 2: DESCRIPTION */}
          {step === 2 && (
             <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center mb-6">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm mr-3">2</div>
                    <h2 className="text-xl font-bold text-gray-800">Descrizione Opere & AI</h2>
                </div>

                <div className="bg-orange-50 border border-orange-100 p-4 rounded-lg mb-4 text-sm text-orange-800">
                   <p className="flex items-start">
                     <BookOpen className="w-5 h-5 mr-2 flex-shrink-0" />
                     Descrivi brevemente i lavori. L'intelligenza artificiale creerà la struttura WBS e caricherà le voci principali per te.
                   </p>
                </div>

                <div className="mb-6">
                    <label className="block text-xs font-black uppercase text-gray-400 mb-2">
                        Dettaglio Lavorazioni
                    </label>
                    <textarea 
                        autoFocus
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Es. Rifacimento bagno: demolizione, massetto, posa tubazioni, sanitari e piastrelle..."
                        className="w-full h-32 border-2 border-gray-100 rounded-lg p-4 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none resize-none text-slate-800 shadow-inner font-medium"
                    />
                </div>

                <div className="flex justify-between items-center pt-2">
                    <button 
                        type="button"
                        onClick={() => handleFinalSubmit(true)}
                        className="text-gray-400 hover:text-gray-600 text-xs font-bold uppercase tracking-tighter underline px-2"
                        disabled={isLoading}
                    >
                        Salta wizard
                    </button>

                    <button 
                        onClick={() => handleFinalSubmit(false)}
                        disabled={!description.trim() || isLoading}
                        className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white px-8 py-3 rounded-lg font-black uppercase text-xs tracking-widest shadow-lg flex items-center transform transition-all active:scale-95 disabled:opacity-70 disabled:scale-100"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Generazione...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5 mr-2" />
                                Genera con Gemini AI
                            </>
                        )}
                    </button>
                </div>
             </div>
          )}

        </div>

        {/* --- BANNER PUBBLICITARIO ROTANTE --- */}
        <div className="bg-slate-50 border-t border-slate-200 px-8 py-4">
           <div className="flex items-center justify-between animate-in fade-in duration-700" key={bannerIdx}>
              <div className="flex items-center gap-3">
                 <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <Megaphone className={`w-4 h-4 ${ads[bannerIdx].color}`} />
                 </div>
                 <div>
                    <div className="flex items-center gap-2">
                       <span className={`text-[10px] font-black uppercase tracking-tighter ${ads[bannerIdx].color}`}>Sponsorizzato</span>
                       <span className="text-[8px] bg-slate-200 text-slate-500 px-1 rounded font-bold uppercase">AD</span>
                    </div>
                    <p className="text-xs font-medium text-slate-600 leading-tight">
                       <span className="font-black text-slate-800">{ads[bannerIdx].name}</span>: {ads[bannerIdx].tagline}
                    </p>
                 </div>
              </div>
              <a 
                href={ads[bannerIdx].url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-700 uppercase hover:bg-slate-100 hover:border-slate-300 transition-all shadow-sm group"
              >
                 Visita Sito
                 <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </a>
           </div>
        </div>

      </div>
    </div>
  );
};

export default WelcomeModal;