
import React, { useState } from 'react';
import { X, Save, Download, FileJson, Share2, Briefcase, FileSpreadsheet, FileText, CheckCircle2 } from 'lucide-react';
import { Article, Category, ProjectInfo } from '../types';
import { generateComputoMetricoSubappaltoExcel } from '../services/excelGenerator';
import { generateComputoMetricoSubappaltoPdf } from '../services/pdfGenerator';

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

  // Calcoliamo la numerazione originale globale per garantire continuità contabile
  const masterIndexMap = new Map<string, number>();
  let masterCount = 1;
  categories.forEach(cat => {
      if (cat.isSuperCategory) return;
      articles.filter(a => a.categoryCode === cat.code).forEach(art => {
          masterIndexMap.set(art.id, masterCount++);
      });
  });

  // 1. Export Standard GeCoLa Backup (Full Data)
  const handleExportBackup = () => {
    const gecolaData = {
      projectInfo,
      categories,
      articles,
      version: "12.0"
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

  // 2. Export Computo Metrico per Subappalto (.json - Solo Voci Attive, Prezzi e Prezzari Azzerati, Numerazione Originale Preservata)
  const handleExportSubappaltoComputo = () => {
    const activeCategories = categories.filter(c => c.isEnabled !== false && !c.isSuperCategory);
    const activeArticles = articles
      .filter(a => {
        const cat = categories.find(c => c.code === a.categoryCode);
        return a.isEnabled !== false && (!cat || cat.isEnabled !== false);
      })
      .map(art => {
        const origNum = art.originalGlobalIndex || masterIndexMap.get(art.id) || 1;
        return {
          ...art,
          originalGlobalIndex: origNum,
          unitPrice: 0,
          laborRate: 0,
          priceListSource: undefined,
          linkedAnalysisId: undefined
        };
      });

    const subappaltoData = {
      projectInfo: {
        ...projectInfo,
        title: `${projectInfo.title} (Computo Metrico Subappalto)`
      },
      categories: activeCategories,
      articles: activeArticles,
      isSubcontractorMode: true,
      version: "12.0"
    };

    const finalExport = {
      gecolaData: subappaltoData,
      isSubcontractorMode: true,
      exportedAt: new Date().toISOString(),
      app: "GeCoLa Cloud - Computo Metrico Subappalto"
    };

    downloadFile(finalExport, `Computo_Metrico_${fileName.replace(/\s+/g, '_')}.json`);
    onClose();
  };

  // 3. Export Specific Chronos List Format
  const handleExportChronosStructure = () => {
    const chronosList = categories
      .filter(cat => cat.isEnabled !== false) // Exclude disabled categories
      .map(cat => {
        const catArticles = articles.filter(a => a.categoryCode === cat.code && a.isEnabled !== false);
        
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

  const handleExportSubappaltoExcel = () => {
    generateComputoMetricoSubappaltoExcel(projectInfo, categories, articles);
    onClose();
  };

  const handleExportSubappaltoPdf = () => {
    generateComputoMetricoSubappaltoPdf(projectInfo, categories, articles);
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

  const activeArticlesCount = articles.filter(a => {
    const cat = categories.find(c => c.code === a.categoryCode);
    return a.isEnabled !== false && (!cat || cat.isEnabled !== false);
  }).length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/30 rounded-xl border border-blue-400/30 text-blue-400">
              <Save className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Salva & Esporta Progetto</h3>
              <p className="text-slate-400 text-xs">Gestione backup e sottocomputi per subappalti</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 max-h-[85vh] overflow-y-auto">
           <div className="mb-5">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">Nome File di Progetto</label>
              <div className="flex items-center">
                <input 
                  type="text" 
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-l-xl p-2.5 font-bold text-slate-800 focus:border-blue-600 focus:ring-0 outline-none text-sm"
                  autoFocus
                />
                <div className="bg-slate-100 border-2 border-l-0 border-slate-200 px-3 py-2.5 text-slate-500 rounded-r-xl text-xs font-mono font-bold">
                  .json / .xls
                </div>
              </div>
           </div>

           {/* Sezione Subappalto in Primo Piano */}
           <div className="mb-5 bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/50 p-4 rounded-2xl border-2 border-emerald-300 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-600 text-white rounded-lg shadow-sm">
                    <Briefcase className="w-4 h-4" />
                  </span>
                  <h4 className="font-black text-sm text-emerald-950 uppercase tracking-tight">Computo Metrico per Subappalti</h4>
                </div>
                <span className="bg-emerald-200 text-emerald-900 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {activeArticlesCount} voci attive
                </span>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed mb-3">
                Esporta il computo contenente <b>esclusivamente le voci accese</b>, preservando la <b>numerazione master originale</b>, azzerando i prezzi unitari e rimuovendo i riferimenti ai prezzari per consentire al subappaltatore di formulare la propria offerta.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={handleExportSubappaltoComputo}
                  className="p-2.5 bg-white hover:bg-emerald-600 hover:text-white text-emerald-900 border border-emerald-300 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-xs group"
                  title="Scarica file JSON del Computo Metrico Subappalto"
                >
                  <FileJson className="w-4 h-4 text-emerald-600 group-hover:text-white" />
                  <span>File .json</span>
                  <span className="text-[9px] opacity-75 font-normal">Per ricaricare o inviare</span>
                </button>

                <button
                  onClick={handleExportSubappaltoExcel}
                  className="p-2.5 bg-white hover:bg-emerald-600 hover:text-white text-emerald-900 border border-emerald-300 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-xs group"
                  title="Scarica foglio Excel con colonna offerta e formule"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 group-hover:text-white" />
                  <span>Excel .xls</span>
                  <span className="text-[9px] opacity-75 font-normal">Con formule offerta</span>
                </button>

                <button
                  onClick={handleExportSubappaltoPdf}
                  className="p-2.5 bg-white hover:bg-emerald-600 hover:text-white text-emerald-900 border border-emerald-300 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 transition-all shadow-xs group"
                  title="Stampa documento PDF non estimativo"
                >
                  <FileText className="w-4 h-4 text-emerald-600 group-hover:text-white" />
                  <span>Stampa PDF</span>
                  <span className="text-[9px] opacity-75 font-normal">Computo senza prezzi</span>
                </button>
              </div>
           </div>

           <div className="grid grid-cols-1 gap-2.5">
               {/* 1. Backup Completo */}
               <button
                onClick={handleExportBackup}
                className="w-full text-left p-3.5 border border-blue-200 bg-blue-50/50 hover:bg-blue-100/80 rounded-xl flex items-center transition-all group shadow-xs hover:shadow"
              >
                <div className="p-2.5 bg-blue-600 text-white rounded-xl mr-3.5 group-hover:bg-blue-700 transition-colors shadow-sm">
                    <Download className="w-5 h-5" />
                </div>
                <div>
                    <span className="block font-black text-sm text-blue-950">Backup Completo GeCoLa (.json)</span>
                    <span className="block text-xs text-blue-700/80 mt-0.5">Salva tutte le voci ({articles.length}), prezzi unitari, analisi nuove e misure.</span>
                </div>
              </button>

              {/* 3. Chronos Export */}
              <button
                onClick={handleExportChronosStructure}
                className="w-full text-left p-3.5 border border-purple-200 bg-purple-50/50 hover:bg-purple-100/80 rounded-xl flex items-center transition-all group shadow-xs hover:shadow"
              >
                <div className="p-2.5 bg-purple-600 text-white rounded-xl mr-3.5 group-hover:bg-purple-700 transition-colors shadow-sm">
                    <Share2 className="w-5 h-5" />
                </div>
                <div>
                    <span className="block font-black text-sm text-purple-950">Esporta per Chronos AI</span>
                    <span className="block text-xs text-purple-700/80 mt-0.5">Genera file strutturato per importazione cronoprogramma WBS.</span>
                </div>
              </button>
           </div>

           <div className="flex justify-end mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={onClose}
                className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
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
