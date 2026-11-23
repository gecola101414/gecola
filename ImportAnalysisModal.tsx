
import React, { useState } from 'react';
import { X, Search, TestTubes, ArrowRight, CornerDownRight, Plus } from 'lucide-react';
import { PriceAnalysis } from '../types';

interface ImportAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  analyses: PriceAnalysis[];
  onImport: (analysis: PriceAnalysis) => void;
  onCreateNew?: () => void;
}

const ImportAnalysisModal: React.FC<ImportAnalysisModalProps> = ({ isOpen, onClose, analyses, onImport, onCreateNew }) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredAnalyses = analyses.filter(a => 
    a.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden border border-gray-300 flex flex-col max-h-[85vh]">
        
        <div className="bg-[#8e44ad] px-5 py-4 flex justify-between items-center border-b border-gray-600 flex-shrink-0">
          <div>
            <h3 className="text-white font-semibold text-lg flex items-center gap-2">
              <TestTubes className="w-5 h-5 text-purple-200" />
              Scegli o Crea Voce da Analisi
            </h3>
            <p className="text-purple-200 text-xs mt-1">Seleziona un'analisi esistente o creane una nuova per questo capitolo.</p>
          </div>
          <div className="flex items-center gap-3">
              {onCreateNew && (
                  <button 
                    onClick={onCreateNew}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-2 border border-white/20 transition-colors"
                  >
                      <Plus className="w-4 h-4" />
                      CREA NUOVA
                  </button>
              )}
              <button onClick={onClose} className="text-purple-200 hover:text-white transition-colors bg-white/10 p-1.5 rounded-full">
                <X className="w-5 h-5" />
              </button>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute top-3 left-3 text-gray-400" />
            <input 
              type="text"
              placeholder="Cerca analisi per codice o descrizione..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 outline-none text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
            {filteredAnalyses.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <TestTubes className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Nessuna analisi trovata.</p>
                    {onCreateNew && (
                        <button onClick={onCreateNew} className="mt-4 text-purple-600 hover:text-purple-800 font-bold underline text-sm">
                            Crea subito una nuova analisi
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {filteredAnalyses.map(analysis => (
                        <div key={analysis.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:border-purple-400 hover:shadow-md transition-all group flex justify-between items-center cursor-pointer" onClick={() => onImport(analysis)}>
                            <div className="flex-1 pr-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="bg-purple-100 text-purple-800 font-bold font-mono text-xs px-2 py-0.5 rounded border border-purple-200">{analysis.code}</span>
                                    <span className="text-xs text-gray-400 font-mono">U.M: <b>{analysis.unit}</b></span>
                                </div>
                                <div className="font-medium text-gray-800 text-sm line-clamp-2">{analysis.description}</div>
                                <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                                    <CornerDownRight className="w-3 h-3" />
                                    Basata su analisi di {analysis.analysisQuantity} {analysis.unit}
                                </div>
                            </div>
                            <div className="text-right flex flex-col items-end">
                                <span className="block text-lg font-bold font-mono text-purple-700">{formatCurrency(analysis.totalUnitPrice)}</span>
                                <span className="text-[10px] text-gray-400">Prezzo Unitario</span>
                                <button className="mt-2 bg-purple-600 text-white text-xs px-3 py-1.5 rounded hover:bg-purple-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    Importa <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ImportAnalysisModal;
