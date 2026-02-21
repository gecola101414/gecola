import React, { useState } from 'react';
import { X, Sparkles, Loader2, ArrowRight, Globe } from 'lucide-react';
import { Article } from '../types';

interface BulkGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (description: string) => Promise<void>;
  isLoading: boolean;
  region: string;
  year: string;
}

const BulkGeneratorModal: React.FC<BulkGeneratorModalProps> = ({ 
  isOpen, 
  onClose, 
  onGenerate, 
  isLoading,
  region,
  year
}) => {
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onGenerate(description);
    setDescription('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl overflow-hidden border border-gray-300">
        <div className="bg-gradient-to-r from-green-700 to-teal-600 px-6 py-5 flex justify-between items-center border-b border-gray-600">
          <div>
            <h3 className="text-white font-bold text-xl flex items-center gap-2">
              <Globe className="w-5 h-5 text-yellow-300" />
              Wizard Computo (Search Powered)
            </h3>
            <p className="text-green-100 text-xs mt-1">Generazione basata su dati reali trovati su <strong>www.gecola.it</strong></p>
          </div>
          <button 
            onClick={onClose}
            className="text-green-200 hover:text-white transition-colors"
            disabled={isLoading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8">
          <div className="mb-6">
            <label className="block text-sm font-bold uppercase text-gray-700 mb-2">
              Descrivi i lavori da eseguire
            </label>
            <div className="relative">
                <textarea
                  autoFocus
                  className="w-full border border-gray-300 rounded-md p-4 text-base focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none resize-none text-gray-800 bg-slate-50 min-h-[150px] shadow-inner"
                  placeholder={`Esempio: Ristrutturazione bagno completa con demolizione rivestimenti e rifacimento impianti idrici.`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isLoading}
                />
            </div>
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800 flex items-start">
               <span className="font-bold mr-2">NOTA IMPORTANTE:</span>
               Il sistema verificherà ogni singola lavorazione sul database online di <strong>GeCoLa.it</strong> per la regione <strong>{region} {year}</strong>. Le voci non riscontrate sul sito potrebbero essere omesse per garantire l'affidabilità del computo.
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={isLoading}
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isLoading || !description.trim()}
              className="px-6 py-2.5 text-sm font-bold text-white bg-green-700 rounded-lg hover:bg-green-800 flex items-center gap-2 shadow-lg transition-transform active:scale-95 disabled:opacity-70 disabled:active:scale-100"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ricerca su GeCoLa.it in corso...
                </>
              ) : (
                <>
                  Verifica e Genera
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BulkGeneratorModal;