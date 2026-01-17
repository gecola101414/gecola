
import React, { useState, useEffect } from 'react';
import { X, Copy, LayoutList, Ruler, Sparkles, Edit3, AlignLeft } from 'lucide-react';

export type WbsActionMode = 'full' | 'descriptions' | 'none';

interface WbsImportOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChoice: (mode: WbsActionMode, newName: string) => void;
  initialName: string;
  isImport?: boolean;
}

const WbsImportOptionsModal: React.FC<WbsImportOptionsModalProps> = ({ 
  isOpen, 
  onClose, 
  onChoice, 
  initialName,
  isImport = false 
}) => {
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNewName(isImport ? initialName : `${initialName} (Copia)`);
    }
  }, [isOpen, initialName, isImport]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-300 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-[#2c3e50] px-6 py-4 flex justify-between items-center border-b border-gray-600">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            {isImport ? <Sparkles className="w-5 h-5 text-blue-400" /> : <Copy className="w-5 h-5 text-orange-400" />}
            {isImport ? 'Opzioni Importazione WBS' : 'Opzioni Duplicazione WBS'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8">
          <p className="text-gray-600 mb-6 text-center leading-relaxed">
            {isImport 
              ? "Hai trascinato una WBS da un'altra istanza. Personalizza il nome e scegli come procedere:" 
              : "Personalizza il nome del nuovo capitolo e scegli la modalità di duplicazione:"}
          </p>

          {/* Name Input Field */}
          <div className="mb-8">
            <label className="block text-xs font-black uppercase text-gray-400 mb-2 flex items-center gap-1">
              <Edit3 className="w-3 h-3" /> Nome del nuovo capitolo
            </label>
            <input 
              type="text" 
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-bold text-gray-700 bg-gray-50 transition-all"
              placeholder="Inserisci nome WBS..."
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Option 1: Full Copy */}
            <button 
              onClick={() => onChoice('full', newName)}
              disabled={!newName.trim()}
              className="group flex items-start p-4 bg-white border-2 border-gray-100 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-3 bg-blue-100 rounded-lg text-blue-600 mr-4 group-hover:bg-blue-200 transition-colors">
                <Ruler className="w-6 h-6" />
              </div>
              <div>
                <span className="block font-black text-blue-900 uppercase text-xs tracking-widest mb-1">Copia con Misure</span>
                <span className="text-sm text-gray-500 leading-tight block">
                  Mantieni tutte le voci e i relativi dettagli delle misure (lunghezze, larghezze, etc).
                </span>
              </div>
            </button>

            {/* Option 2: Descriptions Only */}
            <button 
              onClick={() => onChoice('descriptions', newName)}
              disabled={!newName.trim()}
              className="group flex items-start p-4 bg-white border-2 border-gray-100 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-3 bg-indigo-100 rounded-lg text-indigo-600 mr-4 group-hover:bg-indigo-200 transition-colors">
                <AlignLeft className="w-6 h-6" />
              </div>
              <div>
                <span className="block font-black text-indigo-900 uppercase text-xs tracking-widest mb-1">Copia solo Descrizioni Misure</span>
                <span className="text-sm text-gray-500 leading-tight block">
                  Mantieni l'elenco delle descrizioni delle misure, ma azzera tutti i valori numerici (quantità, dimensioni).
                </span>
              </div>
            </button>

            {/* Option 3: Only Items */}
            <button 
              onClick={() => onChoice('none', newName)}
              disabled={!newName.trim()}
              className="group flex items-start p-4 bg-white border-2 border-gray-100 rounded-xl hover:border-orange-500 hover:bg-orange-50 transition-all text-left shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-3 bg-orange-100 rounded-lg text-orange-600 mr-4 group-hover:bg-orange-200 transition-colors">
                <LayoutList className="w-6 h-6" />
              </div>
              <div>
                <span className="block font-black text-orange-900 uppercase text-xs tracking-widest mb-1">Copia solo Voci</span>
                <span className="text-sm text-gray-500 leading-tight block">
                  Copia solo l'elenco dei lavori. Tutte le righe di misura verranno rimosse.
                </span>
              </div>
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
            <button 
              onClick={onClose}
              className="px-6 py-2 text-sm font-bold text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-colors"
            >
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WbsImportOptionsModal;
