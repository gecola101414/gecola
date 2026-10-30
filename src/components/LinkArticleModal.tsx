import { X, Link, Coins, Ruler, Search, ChevronDown, ChevronRight } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { Article, Category } from '../types';

interface LinkArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: Article[]; 
  categories: Category[];
  currentArticleId: string;
  onLink: (sourceArticle: Article, type: 'quantity' | 'amount') => void;
}

const LinkArticleModal: React.FC<LinkArticleModalProps> = ({ 
  isOpen, 
  onClose, 
  articles, 
  categories,
  currentArticleId, 
  onLink 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (catCode: string) => {
    setExpandedCategories(prev => ({ ...prev, [catCode]: !prev[catCode] }));
  };

  const filteredArticles = useMemo(() => {
    return articles.filter(a => 
      a.id !== currentArticleId && 
      (a.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
       a.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
       a.categoryCode.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [articles, currentArticleId, searchTerm]);

  const groupedArticles = useMemo(() => {
    const groups: Record<string, Article[]> = {};
    filteredArticles.forEach(a => {
      if (!groups[a.categoryCode]) groups[a.categoryCode] = [];
      groups[a.categoryCode].push(a);
    });
    return groups;
  }, [filteredArticles]);

  if (!isOpen) return null;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
  };

  const formatNumber = (val: number) => {
    return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl overflow-hidden border border-gray-300 flex flex-col max-h-[90vh]">
        
        <div className="bg-[#2c3e50] px-5 py-4 flex justify-between items-center border-b border-gray-600 flex-shrink-0">
          <div>
            <h3 className="text-white font-semibold text-lg flex items-center gap-2">
              <Link className="w-5 h-5 text-blue-400" />
              Collegamento "Vedi Voce" (Globale)
            </h3>
            <p className="text-slate-300 text-xs mt-1">Cerca e collega una voce da qualsiasi capitolo del progetto.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute top-3 left-3 text-gray-400" />
            <input 
              type="text"
              placeholder="Cerca per WBS, codice o descrizione..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        
        <div className="overflow-y-auto p-0 flex-1">
          {filteredArticles.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>Nessuna voce trovata.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 text-xs font-bold text-gray-600 uppercase sticky top-0 z-10">
                <tr>
                  <th className="p-3 border-b border-gray-300 text-center">WBS / Voce</th>
                  <th className="p-3 border-b border-gray-300 w-32">Codice</th>
                  <th className="p-3 border-b border-gray-300">Descrizione</th>
                  <th className="p-3 border-b border-gray-300 w-16 text-center">U.M.</th>
                  <th className="p-3 border-b border-gray-300 text-right w-24">Quantità</th>
                  <th className="p-3 border-b border-gray-300 text-right w-32">Importo Tot.</th>
                  <th className="p-3 border-b border-gray-300 text-center w-40">Azioni</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {Object.entries(groupedArticles).map(([catCode, catArticles]: [string, Article[]]) => (
                  <React.Fragment key={catCode}>
                    <tr className="bg-slate-100 cursor-pointer hover:bg-slate-200" onClick={() => toggleCategory(catCode)}>
                      <td colSpan={7} className="p-3 border-b border-gray-200">
                        <div className="flex items-center gap-2 mb-1">
                          {expandedCategories[catCode] ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                          <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">{catCode.startsWith('WBS.') ? catCode : `WBS.${catCode}`}</span>
                        </div>
                        <div className="font-bold text-slate-800 text-sm ml-6 uppercase">
                          {(() => {
                            const match = categories?.find(c => c.code === catCode || c.code === `WBS.${catCode}` || catCode.includes(c.code));
                            return match ? match.name : `Capitolo ${catCode}`;
                          })()}
                        </div>
                      </td>
                    </tr>
                    {expandedCategories[catCode] && catArticles.map((article, artIndex) => {
                      const totalAmount = article.quantity * article.unitPrice;
                      const hierarchicalNum = `${catCode}.${artIndex + 1}`;

                      return (
                        <tr key={article.id} className="hover:bg-blue-50 border-b border-gray-100 group transition-colors">
                          <td className="p-3 text-center text-xs font-bold text-gray-500 align-top">{hierarchicalNum}</td>
                          <td className="p-3 font-mono font-bold text-gray-700 align-top w-24">{article.code}</td>
                          <td className="p-3 text-gray-600 align-top text-xs text-justify break-words w-full">{article.description}</td>
                          <td className="p-3 text-center font-black text-slate-500 align-middle uppercase text-[10px]">{article.unit}</td>
                          <td className="p-3 text-right font-mono align-middle font-bold">{formatNumber(article.quantity)}</td>
                          <td className="p-3 text-right font-mono text-blue-800 align-middle">{formatCurrency(totalAmount)}</td>
                          <td className="p-2 text-center align-middle">
                             <div className="flex justify-center space-x-2">
                               <button onClick={() => onLink(article, 'quantity')} className="flex items-center px-2 py-1.5 bg-white border border-gray-300 rounded hover:bg-green-50 hover:text-green-700 hover:border-green-300 transition-all text-xs font-medium shadow-sm" title="Importa Quantità nella Lunghezza"><Ruler className="w-3 h-3 mr-1" />Q.tà</button>
                               <button onClick={() => onLink(article, 'amount')} className="flex items-center px-2 py-1.5 bg-white border border-gray-300 rounded hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-all text-xs font-medium shadow-sm" title="Importa Importo Totale nella Lunghezza"><Coins className="w-3 h-3 mr-1" />€</button>
                             </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-t border-gray-200 bg-gray-50 text-right text-xs text-gray-500">
           {filteredArticles.length} voci trovate nel progetto
        </div>
      </div>
    </div>
  );
};

export default LinkArticleModal;