
import React, { useState } from 'react';
import { X, Save, Download, FileJson, Share2 } from 'lucide-react';
import { Article, Category, ProjectInfo } from '../types';

interface SaveProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: Article[];
  categories: Category[];
  projectInfo: ProjectInfo;
}

const SaveProjectModal: React.FC<SaveProjectModalProps> = ({ 
  isOpen, 
  onClose, 
  articles, 
  categories, 
  projectInfo 
}) => {
  const [fileName, setFileName] = useState(projectInfo.title || 'Progetto_GeCoLa');

  if (!isOpen) return null;

  // 1. Export Standard GeCoLa Backup (Full Data)
  const handleExportBackup = () => {
    const gecolaData = {
      projectInfo,
      categories,
      articles,
      version: "10.2"
    };

    // Legacy Chronos Exchange (embedded)
    const chronosExchange = {
      projectTitle: projectInfo.title,
      client: projectInfo.client,
      startDate: new Date().toISOString().split('T')[0],
      phases: categories.map(cat => ({
          id: cat.code,
          name: `${cat.code} - ${cat.name}`,
          isLocked: cat.isLocked,
          activities: articles.filter(a => a.categoryCode === cat.code).map(art => {
             const totalCost = art.quantity * art.unitPrice;
             const laborAmount = totalCost * (art.laborRate / 100);

             return {
               id: art.id,
               code: art.code,
               name: art.description.substring(0, 100), 
               totalCost: totalCost,
               laborRate: art.laborRate,
               laborAmount: laborAmount,
               duration: 1, 
               dependencies: [] 
             };
          })
      }))
    };

    const finalExport = {
      gecolaData,
      chronosExchange,
      exportedAt: new Date().toISOString(),
      app: "GeCoLa Cloud"
    };

    downloadFile(finalExport, `${fileName}.json`);
    onClose();
  };

  // 2. Export Specific Chronos List Format (The one requested)
  const handleExportChronosStructure = () => {
    const chronosList = categories
      .filter(cat => cat.isEnabled !== false) // Exclude disabled categories
      .map(cat => {
        const catArticles = articles.filter(a => a.categoryCode === cat.code);
        
        return {
          groupName: `${cat.code} - ${cat.name}`,
          items: catArticles.map(art => {
            const total = art.quantity * art.unitPrice;
            const laborAmount = total * (art.laborRate / 100);

            return {
              tariffCode: art.code,
              description: art.description,
              price: art.unitPrice,
              quantity: art.quantity,
              total: total,
              unit: art.unit,
              laborRate: art.laborRate,
              laborAmount: laborAmount
            };
          })
        };
      });

    downloadFile(chronosList, `${fileName}_Chronos.json`);
    onClose();
  };

  const downloadFile = (data: any, name: string) => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = href;
    link.download = name.endsWith('.json') ? name : `${name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden border border-gray-300">
        <div className="bg-blue-700 px-5 py-3 flex justify-between items-center border-b border-gray-600">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Save className="w-4 h-4 text-blue-300" />
            Esporta Progetto
          </h3>
          <button onClick={onClose} className="text-blue-200 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
           <div className="mb-6">
              <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Nome File Base</label>
              <div className="flex items-center">
                <input 
                  type="text" 
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-full border border-gray-300 rounded-l p-2 focus:ring-1 focus:ring-blue-500 outline-none"
                  autoFocus
                />
                <div className="bg-gray-100 border border-l-0 border-gray-300 p-2 text-gray-500 rounded-r text-sm font-mono">
                  .json
                </div>
              </div>
           </div>

           <div className="grid grid-cols-1 gap-3">
               <button
                onClick={handleExportBackup}
                className="w-full text-left p-3 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center transition-colors group"
              >
                <div className="p-2 bg-blue-600 text-white rounded mr-3 group-hover:bg-blue-700">
                    <Download className="w-5 h-5" />
                </div>
                <div>
                    <span className="block font-bold text-sm text-blue-900">Backup Completo GeCoLa</span>
                    <span className="block text-xs text-blue-600">Salva progetto, misure e storico per modifiche future.</span>
                </div>
              </button>

              <button
                onClick={handleExportChronosStructure}
                className="w-full text-left p-3 border border-purple-200 bg-purple-50 hover:bg-purple-100 rounded-lg flex items-center transition-colors group"
              >
                <div className="p-2 bg-purple-600 text-white rounded mr-3 group-hover:bg-purple-700">
                    <Share2 className="w-5 h-5" />
                </div>
                <div>
                    <span className="block font-bold text-sm text-purple-900">Esporta per Chronos AI</span>
                    <span className="block text-xs text-purple-600">Genera JSON strutturato per importazione WBS e Voci.</span>
                </div>
              </button>
           </div>

           <div className="flex justify-end mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Chiudi
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default SaveProjectModal;
