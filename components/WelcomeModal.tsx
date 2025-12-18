import React, { useState } from 'react';
import { REGIONS, YEARS } from '../constants';
import { Map, ArrowRight, Check, Sparkles, Loader2, BookOpen } from 'lucide-react';
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
  const [title, setTitle] = useState('Ristrutturazione Appartamento');
  const [description, setDescription] = useState('');

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
      location: region, // Default to region as location initially
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-700">
        
        {/* Header */}
        <div className="bg-[#1e293b] px-6 py-8 text-center border-b border-slate-600">
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">GeCoLa <span className="text-orange-500">Cloud</span></h1>
          <p className="text-slate-400 text-sm">Software Professionale per il Computo Metrico Estimativo</p>
        </div>

        <div className="p-8">
          
          {/* STEP 1: CONFIGURATION */}
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center mb-6">
                 <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm mr-3">1</div>
                 <h2 className="text-xl font-bold text-gray-800">Configurazione Prezzario & Progetto</h2>
              </div>
              
              <form onSubmit={handleStep1Submit} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Regione Prezzario *</label>
                    <select 
                      required
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Seleziona...</option>
                      {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Anno Riferimento *</label>
                    <select 
                      required
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                       <option value="">Seleziona...</option>
                       {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Titolo Progetto</label>
                        <input 
                        type="text" 
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Es. Ristrutturazione Bagno"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Committente</label>
                        <input 
                        type="text" 
                        value={client}
                        onChange={(e) => setClient(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Es. Mario Rossi"
                        />
                    </div>
                </div>

                <div className="pt-4 flex justify-end">
                   <button 
                     type="submit" 
                     disabled={!region || !year}
                     className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <h2 className="text-xl font-bold text-gray-800">Descrizione Opere & Struttura WBS</h2>
                </div>

                <div className="bg-orange-50 border border-orange-100 p-4 rounded-lg mb-4 text-sm text-orange-800">
                   <p className="flex items-start">
                     <BookOpen className="w-5 h-5 mr-2 flex-shrink-0" />
                     Il sistema analizzerà la tua richiesta e creerà <strong>immediatamente</strong> le categorie (WBS) adatte per il tuo progetto, pronte per essere riempite.
                   </p>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        Descrivi sinteticamente i lavori da computare:
                    </label>
                    <textarea 
                        autoFocus
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Es. Rimozione vecchi sanitari e pavimento bagno. Rifacimento impianto idrico per lavabo, bidet, wc e doccia. Posa pavimento e rivestimento in ceramica. Tinteggiatura..."
                        className="w-full h-32 border border-gray-300 rounded-lg p-4 focus:ring-2 focus:ring-orange-500 outline-none resize-none text-slate-800 shadow-inner"
                    />
                </div>

                <div className="flex justify-between items-center pt-2">
                    <button 
                        type="button"
                        onClick={() => handleFinalSubmit(true)}
                        className="text-gray-500 hover:text-gray-700 text-sm underline px-2"
                        disabled={isLoading}
                    >
                        Salta wizard, inizio con computo vuoto
                    </button>

                    <button 
                        onClick={() => handleFinalSubmit(false)}
                        disabled={!description.trim() || isLoading}
                        className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg flex items-center transform transition-all active:scale-95 disabled:opacity-70 disabled:scale-100"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Creazione Struttura...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-5 h-5 mr-2" />
                                Genera Struttura WBS
                            </>
                        )}
                    </button>
                </div>
             </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;