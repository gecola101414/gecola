import React, { useState } from 'react';
import { X, Save, FileJson, FileSpreadsheet, Calculator, Briefcase, FolderOpen } from 'lucide-react';
import { Article, Category, ProjectInfo } from '../types';
import { 
  buildComputoExcelXml, 
  buildComputoMetricoSubappaltoExcelXml, 
  generateComputoExcel, 
  generateComputoMetricoSubappaltoExcel 
} from '../services/excelGenerator';

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
  const defaultBaseName = (projectInfo.title || 'Progetto').replace(/\s+/g, '_').replace(/_(CME|CM)$/i, '');
  const [baseFileName, setBaseFileName] = useState(defaultBaseName);

  if (!isOpen) return null;

  // Calcoliamo la mappa della numerazione originale master progressiva
  const masterIndexMap = new Map<string, number>();
  let masterCount = 1;
  categories.forEach(cat => {
    if (cat.isSuperCategory) return;
    articles.filter(a => a.categoryCode === cat.code).forEach(art => {
      masterIndexMap.set(art.id, masterCount++);
    });
  });

  const cleanBase = baseFileName.trim().replace(/\s+/g, '_') || 'Progetto';
  const cmeJsonName = `${cleanBase}_CME.json`;
  const cmeXlsName = `${cleanBase}_CME.xls`;
  const cmJsonName = `${cleanBase}_CM.json`;
  const cmXlsName = `${cleanBase}_CM.xls`;

  // Funzione universale "Salva con Nome" con selezione cartella di destinazione
  const saveFileWithPicker = async (content: string, suggestedName: string, mimeType: string, extension: string, fileDescription: string) => {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: suggestedName,
          types: [{
            description: fileDescription,
            accept: { [mimeType]: [`.${extension}`] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        onClose();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return; // L'utente ha annullato la finestra di dialogo
        }
        console.warn("showSaveFilePicker fallback:", err);
      }
    }

    // Fallback standard download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onClose();
  };

  // 1A. Salva con Nome CME JSON (Computo Metrico Estimativo)
  const handleSaveCmeJson = async () => {
    const fullData = {
      gecolaData: {
        projectInfo: {
          ...projectInfo,
          title: cleanBase
        },
        categories,
        articles,
        version: "12.0"
      },
      exportedAt: new Date().toISOString(),
      tipoDocumento: "COMPUTO METRICO ESTIMATIVO (CME)",
      app: "GeCoLa Cloud"
    };

    const jsonString = JSON.stringify(fullData, null, 2);
    await saveFileWithPicker(jsonString, cmeJsonName, 'application/json', 'json', 'File GeCoLa Computo Metrico Estimativo (.json)');
  };

  // 1B. Salva con Nome CME Excel (Computo Metrico Estimativo)
  const handleSaveCmeExcel = async () => {
    const xml = buildComputoExcelXml(projectInfo, categories, articles);
    await saveFileWithPicker(xml, cmeXlsName, 'application/vnd.ms-excel', 'xls', 'Foglio Excel Computo Metrico Estimativo (.xls)');
  };

  // 2A. Salva con Nome CM JSON (Solo Computo Metrico - No Prezzi, Solo Voci Accese, Numerazione Originale)
  const handleSaveCmJson = async () => {
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

    const cmData = {
      gecolaData: {
        projectInfo: {
          ...projectInfo,
          title: `${cleanBase} (Solo Computo Metrico)`
        },
        categories: activeCategories,
        articles: activeArticles,
        isSubcontractorMode: true,
        version: "12.0"
      },
      isSubcontractorMode: true,
      exportedAt: new Date().toISOString(),
      tipoDocumento: "SOLO COMPUTO METRICO (CM)",
      app: "GeCoLa Cloud - Solo Computo Metrico"
    };

    const jsonString = JSON.stringify(cmData, null, 2);
    await saveFileWithPicker(jsonString, cmJsonName, 'application/json', 'json', 'File GeCoLa Solo Computo Metrico (.json)');
  };

  // 2B. Salva con Nome CM Excel (Solo Computo Metrico - No Prezzi, Colonna Offerta)
  const handleSaveCmExcel = async () => {
    const xml = buildComputoMetricoSubappaltoExcelXml(projectInfo, categories, articles);
    await saveFileWithPicker(xml, cmXlsName, 'application/vnd.ms-excel', 'xls', 'Foglio Excel Solo Computo Metrico (.xls)');
  };

  const activeCount = articles.filter(a => {
    const cat = categories.find(c => c.code === a.categoryCode);
    return a.isEnabled !== false && (!cat || cat.isEnabled !== false);
  }).length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
        
        {/* HEADER MODALE */}
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-sm">
              <Save className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Salva con Nome</h3>
              <p className="text-slate-400 text-xs">Scegli il tipo di computo e la cartella di destinazione</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-5">
           
           {/* NOME BASE FILE */}
           <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1.5 flex items-center justify-between">
                <span>Nome File di Base (senza estensione)</span>
                <span className="text-[10px] text-slate-400 font-semibold normal-case">Le sigle _CME e _CM vengono aggiunte in automatico</span>
              </label>
              <div className="flex items-center">
                <input 
                  type="text" 
                  value={baseFileName}
                  onChange={(e) => setBaseFileName(e.target.value)}
                  placeholder="Nome_Progetto"
                  className="w-full border-2 border-slate-300 rounded-xl p-2.5 font-bold text-slate-800 focus:border-blue-600 focus:ring-0 outline-none text-sm bg-slate-50 focus:bg-white transition-all shadow-xs"
                  autoFocus
                />
              </div>
           </div>

           {/* OPZIONE 1: COMPUTO METRICO ESTIMATIVO (CME) */}
           <div className="bg-slate-50 border-2 border-blue-200 rounded-2xl p-4 transition-all hover:border-blue-400">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-blue-600 text-white rounded-lg shadow-xs">
                    <Calculator className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                      1. Computo Metrico Estimativo
                      <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full font-mono">
                        _CME
                      </span>
                    </h4>
                  </div>
                </div>
                <span className="text-[11px] text-slate-500 font-semibold">Tutte le voci ({articles.length})</span>
              </div>
              <p className="text-xs text-slate-600 mb-3.5 leading-relaxed">
                Include tutte le voci, descrizioni integrali, misurazioni, prezzi unitari, analisi nuove e importi complessivi.
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={handleSaveCmeJson}
                  className="p-2.5 bg-white hover:bg-blue-600 hover:text-white text-blue-900 border border-blue-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs group cursor-pointer"
                  title="Salva file di progetto GeCoLa (.json)"
                >
                  <FileJson className="w-4 h-4 text-blue-600 group-hover:text-white flex-shrink-0" />
                  <div className="text-left leading-tight">
                    <div className="font-bold">Formato GeCoLa (.json)</div>
                    <div className="text-[9px] opacity-75 font-mono truncate">{cmeJsonName}</div>
                  </div>
                </button>

                <button
                  onClick={handleSaveCmeExcel}
                  className="p-2.5 bg-white hover:bg-blue-600 hover:text-white text-blue-900 border border-blue-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs group cursor-pointer"
                  title="Esporta foglio Excel con formule (.xls)"
                >
                  <FileSpreadsheet className="w-4 h-4 text-blue-600 group-hover:text-white flex-shrink-0" />
                  <div className="text-left leading-tight">
                    <div className="font-bold">Formato Excel (.xls)</div>
                    <div className="text-[9px] opacity-75 font-mono truncate">{cmeXlsName}</div>
                  </div>
                </button>
              </div>
           </div>

           {/* OPZIONE 2: SOLO COMPUTO METRICO (CM) */}
           <div className="bg-emerald-50/70 border-2 border-emerald-300 rounded-2xl p-4 transition-all hover:border-emerald-500">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-600 text-white rounded-lg shadow-xs">
                    <Briefcase className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="font-black text-sm text-emerald-950 flex items-center gap-2">
                      2. Solo Computo Metrico
                      <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full font-mono">
                        _CM
                      </span>
                    </h4>
                  </div>
                </div>
                <span className="bg-emerald-200 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  {activeCount} voci accese
                </span>
              </div>
              <p className="text-xs text-emerald-900 mb-3.5 leading-relaxed">
                Per <b>preventivi e subappalti</b>: contiene solo le voci accese, <b>senza prezzi e senza riferimenti prezzari</b>, mantenendo la numerazione originale.
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={handleSaveCmJson}
                  className="p-2.5 bg-white hover:bg-emerald-600 hover:text-white text-emerald-900 border border-emerald-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs group cursor-pointer"
                  title="Salva file di sottocomputo GeCoLa (.json)"
                >
                  <FileJson className="w-4 h-4 text-emerald-600 group-hover:text-white flex-shrink-0" />
                  <div className="text-left leading-tight">
                    <div className="font-bold">Formato GeCoLa (.json)</div>
                    <div className="text-[9px] opacity-75 font-mono truncate">{cmJsonName}</div>
                  </div>
                </button>

                <button
                  onClick={handleSaveCmExcel}
                  className="p-2.5 bg-white hover:bg-emerald-600 hover:text-white text-emerald-900 border border-emerald-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs group cursor-pointer"
                  title="Esporta foglio Excel per offerta subappaltatore (.xls)"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 group-hover:text-white flex-shrink-0" />
                  <div className="text-left leading-tight">
                    <div className="font-bold">Formato Excel (.xls)</div>
                    <div className="text-[9px] opacity-75 font-mono truncate">{cmXlsName}</div>
                  </div>
                </button>
              </div>
           </div>

           {/* FOOTER */}
           <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-400 font-medium">
                Scegli la cartella di destinazione nella finestra di dialogo del computer
              </span>
              <button
                onClick={onClose}
                className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
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
