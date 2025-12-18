import React, { useState } from 'react';
import { X, Link, Coins, Ruler, Search } from 'lucide-react';
import { Article } from '../types';

interface LinkArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: Article[]; // Now receives ALL articles
  currentArticleId: string;
  onLink: (sourceArticle: Article, type: 'quantity' | 'amount') => void;
}

const LinkArticleModal: React.FC<LinkArticleModalProps> = ({ 
  isOpen, 
  onClose, 
  articles, 
  currentArticleId, 
  onLink 
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  // Filter available articles across ALL WBS
  const availableArticles = articles.filter(a => 
    a.id !== currentArticleId && 
    (a.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
     a.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
     a.categoryCode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
  };

  const formatNumber = (val: number) => {
    return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getWbsNumber = (code: string) => {
      const match = code.match(/WBS\.(\d+)/);
      return match ? parseInt(match[1], 10) : code;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl overflow-hidden border border-gray-300 flex flex-col max-h-[90vh]">
        
        {/* Header */}
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

        {/* Search Bar */}
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
        
        {/* List */}
        <div className="overflow-y-auto p-0 flex-1">
          {availableArticles.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>Nessuna voce trovata.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-100 text-xs font-bold text-gray-600 uppercase sticky top-0 z-10">
                <tr>
                  <th className="p-3 border-b border-gray-300 w-16 text-center">WBS</th>
                  <th className="p-3 border-b border-gray-300 w-16 text-center">N.</th>
                  <th className="p-3 border-b border-gray-300 w-32">Codice</th>
                  <th className="p-3 border-b border-gray-300">Descrizione</th>
                  <th className="p-3 border-b border-gray-300 text-right w-24">Quantità</th>
                  <th className="p-3 border-b border-gray-300 text-right w-32">Importo Tot.</th>
                  <th className="p-3 border-b border-gray-300 text-center w-40">Azioni</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {availableArticles.map((article, index) => {
                  const totalAmount = article.quantity * article.unitPrice;
                  
                  // Calculate hierarchical index: find index of this article within its OWN category
                  const categoryArticles = articles.filter(a => a.categoryCode === article.categoryCode);
                  const localIndex = categoryArticles.findIndex(a => a.id === article.id) + 1;
                  const wbsNum = getWbsNumber(article.categoryCode);
                  const hierarchicalNum = `${wbsNum}.${localIndex}`;

                  return (
                    <tr key={article.id} className="hover:bg-blue-50 border-b border-gray-100 group transition-colors">
                      <td className="p-3 text-center text-xs font-bold text-gray-500 bg-gray-50/50 align-top">{article.categoryCode}</td>
                      <td className="p-3 text-center text-gray-700 font-bold align-top">{hierarchicalNum}</td>
                      <td className="p-3 font-mono font-bold text-gray-700 align-top">{article.code}</td>
                      <td className="p-3 text-gray-600 align-top line-clamp-2 text-xs">{article.description.substring(0, 150)}...</td>
                      <td className="p-3 text-right font-mono bg-gray-50 align-middle font-bold">{formatNumber(article.quantity)}</td>
                      <td className="p-3 text-right font-mono text-blue-800 align-middle">{formatCurrency(totalAmount)}</td>
                      <td className="p-2 text-center align-middle">
                         <div className="flex justify-center space-x-2">
                           <button 
                             onClick={() => onLink(article, 'quantity')}
                             className="flex items-center px-2 py-1.5 bg-white border border-gray-300 rounded hover:bg-green-50 hover:text-green-700 hover:border-green-300 transition-all text-xs font-medium shadow-sm"
                             title="Importa Quantità nella Lunghezza"
                           >
                             <Ruler className="w-3 h-3 mr-1" />
                             Q.tà
                           </button>
                           <button 
                             onClick={() => onLink(article, 'amount')}
                             className="flex items-center px-2 py-1.5 bg-white border border-gray-300 rounded hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-all text-xs font-medium shadow-sm"
                             title="Importa Importo Totale nella Lunghezza"
                           >
                             <Coins className="w-3 h-3 mr-1" />
                             €
                           </button>
                         </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-t border-gray-200 bg-gray-50 text-right text-xs text-gray-500">
           {availableArticles.length} voci trovate nel progetto
        </div>
      </div>
    </div>
  );
};

export default LinkArticleModal;