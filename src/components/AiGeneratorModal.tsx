
import React, { useState } from 'react';
import { X, Wand2, Loader2, Bot, Sparkles } from 'lucide-react';

interface AiGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (instruction: string) => void;
  categoryName: string;
  isLoading: boolean;
}

const AiGeneratorModal: React.FC<AiGeneratorModalProps> = ({ 
  isOpen, 
  onClose, 
  onGenerate, 
  categoryName,
  isLoading 
}) => {
  const [instruction, setInstruction] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate(instruction);
    setInstruction('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded shadow-2xl w-full max-w-lg overflow-hidden border border-gray-300">
        <div className="bg-[#2c3e50] px-4 py-3 flex justify-between items-center border-b border-gray-600">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <Bot className="w-4 h-4 text-green-400" />
            Assistente Estimatore IA
          </h3>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            disabled={isLoading}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5">
          <div className="mb-4">
            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">
              Genera voce per <span className="text-slate-800">{categoryName}</span>
            </label>
            <div className="relative">
                <Wand2 className="w-4 h-4 absolute top-3 left-3 text-green-600" />
                <textarea
                autoFocus
                className="w-full border border-gray-300 rounded-sm p-3 pl-9 focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none resize-none text-sm text-gray-800 bg-slate-50"
                rows={3}
                placeholder="Es. Demolizione pavimenti in ceramica..."
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={isLoading}
                />
            </div>
            <div className="text-[10px] text-gray-500 mt-3 p-2 bg-blue-50 border border-blue-100 rounded">
              <p className="flex items-center gap-1 mb-1 text-blue-800 font-bold">
                <Sparkles className="w-3 h-3" />
                MODALITÀ ESPERTO:
              </p>
              L'IA cercherà voci nei prezzari ufficiali. Se non trova una corrispondenza esatta, elaborerà un <strong>Nuovo Prezzo (NP)</strong> basato sulla sua conoscenza professionale di mercato.
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              disabled={isLoading}
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isLoading || !instruction.trim()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-green-700 border border-green-800 rounded hover:bg-green-800 flex items-center gap-2 shadow-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Elaborazione in corso...
                </>
              ) : (
                <>
                  Genera Voce
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AiGeneratorModal;
