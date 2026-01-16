
import React, { useState, useEffect } from 'react';
import { X, Save, Edit3, ArrowRightLeft, TestTubes, Award } from 'lucide-react';
import { Article } from '../types';
import { COMMON_UNITS, SOA_CATEGORIES } from '../constants';

interface ArticleEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  article: Article;
  onSave: (id: string, updates: Partial<Article>) => void;
  onConvertToAnalysis?: (article: Article) => void;
}

const ArticleEditModal: React.FC<ArticleEditModalProps> = ({ isOpen, onClose, article, onSave, onConvertToAnalysis }) => {
  const [formData, setFormData] = useState<Partial<Article>>({});
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

              {/* Row 2: Description */}
              <div className="col-span-4">
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Descrizione Completa</label>
                <textarea 
                  value={formData.description || ''}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none h-32 text-sm font-serif leading-relaxed shadow-inner"
                />
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
                  className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none text-right font-mono font-bold text-gray-800"
                />
              </div>

              <div className="col-span-2 bg-gray-50 p-2 rounded border border-gray-200">
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Incidenza Manodopera (%)</label>
                <div className="flex items-center">
                  <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={formData.laborRate || 0} 
                      onChange={(e) => setFormData({...formData, laborRate: parseFloat(e.target.value)})}
                      className="w-full mr-3 accent-blue-600"
                  />
                  <input 
                      type="number" 
                      value={formData.laborRate || 0}
                      onChange={(e) => setFormData({...formData, laborRate: parseFloat(e.target.value)})}
                      className="w-16 border border-gray-300 rounded p-2 text-right text-sm font-mono"
                  />
                </div>
              </div>

            </div>
          </form>
        </div>

        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0">
            {onConvertToAnalysis && !article.linkedAnalysisId ? (
                <button
                    type="button"
                    onClick={handleConvertClick}
                    className="px-3 py-2 text-xs font-bold text-purple-700 bg-white border border-purple-200 rounded hover:bg-purple-50 flex items-center transition-colors shadow-sm"
                    title="Crea una nuova Analisi Prezzi partendo da questa voce"
                >
                    <TestTubes className="w-4 h-4 mr-2" />
                    Converti in Analisi
                </button>
            ) : (
                <div></div>
            )}

            <div className="flex gap-3">
                <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 shadow-sm"
                >
                Annulla
                </button>
                <button
                type="submit"
                form="edit-article-form"
                className="px-4 py-2 text-sm font-bold text-white bg-blue-600 border border-blue-700 rounded hover:bg-blue-700 flex items-center shadow-md transition-transform active:scale-95"
                >
                <Save className="w-4 h-4 mr-2" />
                Applica Modifiche
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ArticleEditModal;
