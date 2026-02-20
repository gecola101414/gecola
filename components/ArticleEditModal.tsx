
import React, { useState, useEffect } from 'react';
import { X, Save, Edit3, ArrowRightLeft, TestTubes, Award, Sparkles, Download } from 'lucide-react';
import { Article } from '../types';
import { COMMON_UNITS, SOA_CATEGORIES } from '../constants';
import { parseDroppedContent, cleanDescription } from '../services/geminiService';

interface ArticleEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  article: Article;
  onSave: (id: string, updates: Partial<Article>) => void;
  onConvertToAnalysis?: (article: Article) => void;
}

const ArticleEditModal: React.FC<ArticleEditModalProps> = ({ isOpen, onClose, article, onSave, onConvertToAnalysis }) => {
  const [formData, setFormData] = useState<Partial<Article>>({});
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Unique ID for this modal instance's datalist to prevent conflicts
  const datalistId = `units-list-${article.id}`;

  useEffect(() => {
    if (isOpen && article) {
      setFormData({
        code: article.code,
        description: article.description,
        unit: article.unit,
        unitPrice: article.unitPrice,
        laborRate: article.laborRate,
        priceListSource: article.priceListSource,
        soaCategory: article.soaCategory || 'OG1' // Default if missing
      });
    }
  }, [isOpen, article]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(article.id, formData);
    onClose();
  };

  const handleConvertClick = () => {
      if (onConvertToAnalysis && window.confirm("Vuoi trasformare questa voce in una nuova Analisi Prezzi? \n\nLa voce corrente diventerà collegata all'analisi e potrai giustificare il prezzo dettagliatamente.")) {
          const updatedArticle = { ...article, ...formData } as Article;
          onConvertToAnalysis(updatedArticle);
          onClose();
      }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const text = e.dataTransfer.getData('text');
    if (text) {
        const parsed = parseDroppedContent(text);
        if (parsed) {
            // ACQUISIZIONE INTEGRALE: Sovrascriviamo TUTTI i parametri della nuova voce
            // includendo codice, descrizione, unità, prezzo, manodopera e fonte.
            setFormData(prev => ({
                ...prev,
                code: parsed.code !== undefined ? parsed.code : prev.code,
                description: parsed.description !== undefined ? parsed.description : prev.description,
                unit: parsed.unit !== undefined ? parsed.unit : prev.unit,
                unitPrice: parsed.unitPrice !== undefined ? parsed.unitPrice : prev.unitPrice,
                laborRate: parsed.laborRate !== undefined ? parsed.laborRate : prev.laborRate,
                priceListSource: parsed.priceListSource !== undefined ? parsed.priceListSource : prev.priceListSource
            }));
        }
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-300 flex flex-col max-h-[90vh]">
        <div className="bg-slate-700 px-5 py-3 flex justify-between items-center border-b border-gray-600 flex-shrink-0">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-slate-300" />
            Modifica Dettagli Voce
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="overflow-y-auto p-6">
          <form id="edit-article-form" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              
              {/* Row 1: Code, Source, SOA */}
              <div className="col-span-1">
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Codice</label>
                <input 
                  type="text" 
                  value={formData.code || ''}
                  onChange={(e) => setFormData({...formData, code: e.target.value})}
                  className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none font-mono text-sm font-bold"
                />
              </div>

              <div className="col-span-2">
                 <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Fonte Prezzario</label>
                 <input 
                  type="text" 
                  value={formData.priceListSource || ''}
                  onChange={(e) => setFormData({...formData, priceListSource: e.target.value})}
                  className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Es. Prezzario Reg. 2024"
                />
              </div>

              <div className="col-span-1">
                 <label className="block text-xs font-bold uppercase text-gray-500 mb-1 text-purple-700 flex items-center gap-1"><Award className="w-3 h-3"/> Categ. SOA</label>
                 <select 
                    value={formData.soaCategory || ''}
                    onChange={(e) => setFormData({...formData, soaCategory: e.target.value})}
                    className="w-full border border-purple-200 bg-purple-50 rounded p-2 focus:ring-1 focus:ring-purple-500 outline-none text-xs font-bold text-purple-900"
                 >
                    <option value="">Nessuna</option>
                    {SOA_CATEGORIES.map(cat => (
                        <option key={cat.code} value={cat.code}>{cat.code} - {cat.desc.substring(0, 30)}...</option>
                    ))}
                 </select>
              </div>

              {/* Row 2: Description with DROP ZONE */}
              <div className="col-span-4 relative">
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1 flex justify-between">
                    <span>Descrizione Completa</span>
                    <span className="text-[10px] text-blue-500 normal-case font-medium italic">Trascina una voce qui per sostituire TUTTI i parametri</span>
                </label>
                <div 
                    className={`relative rounded-lg transition-all duration-200 ${isDragOver ? 'ring-4 ring-blue-500 ring-offset-2' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <textarea 
                        value={formData.description || ''}
                        onChange={(e) => setFormData({...formData, description: cleanDescription(e.target.value)})}
                        className={`w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none h-32 text-sm font-serif leading-relaxed shadow-inner transition-colors text-justify ${isDragOver ? 'bg-blue-50 border-blue-400' : ''}`}
                    />
                    
                    {isDragOver && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-600/10 backdrop-blur-[1px] pointer-events-none rounded-lg border-2 border-dashed border-blue-500 animate-pulse">
                            <Sparkles className="w-8 h-8 text-blue-600 mb-2" />
                            <span className="text-blue-700 font-black uppercase text-xs tracking-widest">Rilascia per Sostituire Dati</span>
                            <span className="text-[9px] text-blue-500 font-bold mt-1 uppercase">Tutti i parametri tecnici verranno aggiornati</span>
                        </div>
                    )}
                </div>
              </div>

              {/* Row 3: Metrics */}
              <div className="col-span-1">
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">U.M.</label>
                <input 
                  type="text" 
                  list={datalistId}
                  value={formData.unit || ''}
                  onChange={(e) => setFormData({...formData, unit: e.target.value})}
                  className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none text-center font-bold"
                  placeholder="Seleziona..."
                  autoComplete="off"
                />
                <datalist id={datalistId}>
                    {COMMON_UNITS.map((u, i) => (
                        <option key={`${u}-${i}`} value={u} />
                    ))}
                </datalist>
              </div>

              <div className="col-span-1">
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Prezzo Unit. (€)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={formData.unitPrice || 0}
                  onChange={(e) => setFormData({...formData, unitPrice: parseFloat(e.target.value)})}
                  className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none text-right font-mono"
                />
              </div>

              <div className="col-span-1">
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Inc. Manodopera (%)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={formData.laborRate || 0}
                  onChange={(e) => setFormData({...formData, laborRate: parseFloat(e.target.value)})}
                  className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none text-right font-mono"
                />
              </div>
            </div>
          </form>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center flex-shrink-0">
          <div>
            {onConvertToAnalysis && !article.linkedAnalysisId && (
              <button 
                type="button"
                onClick={handleConvertClick}
                className="text-purple-600 hover:text-purple-800 text-xs font-bold flex items-center gap-2 px-3 py-2 rounded hover:bg-purple-50 transition-colors"
              >
                <TestTubes className="w-4 h-4" />
                TRASFORMA IN ANALISI
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              Annulla
            </button>
            <button
              form="edit-article-form"
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-blue-700 rounded hover:bg-blue-700 flex items-center shadow-sm"
            >
              <Save className="w-4 h-4 mr-2" />
              Salva Modifiche
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Fixed missing default export
export default ArticleEditModal;
