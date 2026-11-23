import React, { useEffect, useState } from 'react';
import {
  X,
  Save,
  FileJson,
  FileSpreadsheet,
  Calculator,
  Briefcase,
  FolderOpen,
  UploadCloud,
  FolderPlus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { Article, Category, PriceAnalysis, ProjectInfo } from '../types';
import { SavedPlanSheet } from '../utils/planProjectStorage';
import {
  buildComputoExcelXml,
  buildComputoMetricoSubappaltoExcelXml,
} from '../services/excelGenerator';
import {
  fetchSharedFolderListing,
  createSharedSubfolder,
  saveProjectToSharedFolder,
} from '../services/teamCollabService';

interface SaveProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: Article[];
  categories: Category[];
  analyses?: PriceAnalysis[];
  projectInfo: ProjectInfo;
  planSheets?: SavedPlanSheet[];
  activePlanSheetId?: string | null;
  operatorName?: string;
  operatorId?: string;
  chatChannel?: string;
  allowSharedFolder?: boolean;
  onOpenSharedFolder?: () => void;
  onSavedToSharedFolder?: () => void;
}

const SaveProjectModal: React.FC<SaveProjectModalProps> = ({
  isOpen,
  onClose,
  articles,
  categories,
  analyses = [],
  projectInfo,
  planSheets,
  activePlanSheetId,
  operatorName = 'Operatore GeCoLa',
  operatorId,
  chatChannel = 'generale',
  allowSharedFolder = false,
  onOpenSharedFolder,
  onSavedToSharedFolder,
}) => {
  const defaultBaseName = (projectInfo.title || 'Progetto').replace(/\s+/g, '_').replace(/_(CME|CM)$/i, '');
  const [baseFileName, setBaseFileName] = useState(defaultBaseName);

  const [sharedFolders, setSharedFolders] = useState<string[]>([
    'Generale',
    'Gare e Appalti',
    'Cantieri Attivi',
    'Subappalti',
  ]);
  const [selectedSharedFolder, setSelectedSharedFolder] = useState('Generale');
  const [newFolderInput, setNewFolderInput] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [sharedNote, setSharedNote] = useState('');
  const [notifyInChat, setNotifyInChat] = useState(true);
  const [isSavingShared, setIsSavingShared] = useState<'CME' | 'CM' | null>(null);
  const [sharedFeedback, setSharedFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setBaseFileName((projectInfo.title || 'Progetto').replace(/\s+/g, '_').replace(/_(CME|CM)$/i, ''));
    setSharedFeedback(null);
    if (!allowSharedFolder) return;
    fetchSharedFolderListing()
      .then((res) => {
        if (res.folders.length > 0) {
          setSharedFolders(res.folders);
          if (!res.folders.includes(selectedSharedFolder)) {
            setSelectedSharedFolder(res.folders[0]);
          }
        }
      })
      .catch(() => {});
  }, [isOpen, projectInfo.title, allowSharedFolder]);

  if (!isOpen) return null;

  // Calcoliamo la mappa della numerazione originale master progressiva
  const masterIndexMap = new Map<string, number>();
  let masterCount = 1;
  categories.forEach((cat) => {
    if (cat.isSuperCategory) return;
    articles
      .filter((a) => a.categoryCode === cat.code)
      .forEach((art) => {
        masterIndexMap.set(art.id, masterCount++);
      });
  });

  const cleanBase = baseFileName.trim().replace(/\s+/g, '_') || 'Progetto';
  const cmeJsonName = `${cleanBase}_CME.json`;
  const cmeXlsName = `${cleanBase}_CME.xls`;
  const cmJsonName = `${cleanBase}_CM.json`;
  const cmXlsName = `${cleanBase}_CM.xls`;

  const totalAmount = articles.reduce((sum, a) => {
    if (a.isEnabled === false) return sum;
    const cat = categories.find((c) => c.code === a.categoryCode);
    if (cat && cat.isEnabled === false) return sum;
    return sum + (Number(a.quantity) || 0) * (Number(a.unitPrice) || 0);
  }, 0);

  const buildCmeData = () => ({
    gecolaData: {
      projectInfo: {
        ...projectInfo,
        title: cleanBase,
      },
      categories,
      articles,
      analyses,
      planSheets: planSheets || [],
      activePlanSheetId: activePlanSheetId || null,
      version: '12.0',
    },
    exportedAt: new Date().toISOString(),
    tipoDocumento: 'COMPUTO METRICO ESTIMATIVO (CME)',
    app: 'GeCoLa Cloud',
  });

  const buildCmData = () => {
    const activeCategories = categories.filter((c) => c.isEnabled !== false && !c.isSuperCategory);
    const activeArticles = articles
      .filter((a) => {
        const cat = categories.find((c) => c.code === a.categoryCode);
        return a.isEnabled !== false && (!cat || cat.isEnabled !== false);
      })
      .map((art) => {
        const origNum = art.originalGlobalIndex || masterIndexMap.get(art.id) || 1;
        return {
          ...art,
          originalGlobalIndex: origNum,
          unitPrice: 0,
          laborRate: 0,
          priceListSource: undefined,
          linkedAnalysisId: undefined,
        };
      });

    return {
      gecolaData: {
        projectInfo: {
          ...projectInfo,
          title: `${cleanBase} (Solo Computo Metrico)`,
        },
        categories: activeCategories,
        articles: activeArticles,
        isSubcontractorMode: true,
        version: '12.0',
      },
      isSubcontractorMode: true,
      exportedAt: new Date().toISOString(),
      tipoDocumento: 'SOLO COMPUTO METRICO (CM)',
      app: 'GeCoLa Cloud - Solo Computo Metrico',
    };
  };

  // Funzione universale "Salva con Nome" con selezione cartella di destinazione locale
  const saveFileWithPicker = async (
    content: string,
    suggestedName: string,
    mimeType: string,
    extension: string,
    fileDescription: string
  ) => {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: suggestedName,
          types: [
            {
              description: fileDescription,
              accept: { [mimeType]: [`.${extension}`] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        onClose();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return;
        }
        console.warn('showSaveFilePicker fallback:', err);
      }
    }

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

  const handleSaveCmeJson = async () => {
    const jsonString = JSON.stringify(buildCmeData(), null, 2);
    await saveFileWithPicker(
      jsonString,
      cmeJsonName,
      'application/json',
      'json',
      'File GeCoLa Computo Metrico Estimativo (.json)'
    );
  };

  const handleSaveCmeExcel = async () => {
    const xml = buildComputoExcelXml(projectInfo, categories, articles);
    await saveFileWithPicker(
      xml,
      cmeXlsName,
      'application/vnd.ms-excel',
      'xls',
      'Foglio Excel Computo Metrico Estimativo (.xls)'
    );
  };

  const handleSaveCmJson = async () => {
    const jsonString = JSON.stringify(buildCmData(), null, 2);
    await saveFileWithPicker(
      jsonString,
      cmJsonName,
      'application/json',
      'json',
      'File GeCoLa Solo Computo Metrico (.json)'
    );
  };

  const handleSaveCmExcel = async () => {
    const xml = buildComputoMetricoSubappaltoExcelXml(projectInfo, categories, articles);
    await saveFileWithPicker(
      xml,
      cmXlsName,
      'application/vnd.ms-excel',
      'xls',
      'Foglio Excel Solo Computo Metrico (.xls)'
    );
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderInput.trim();
    if (!trimmed) return;
    try {
      const res = await createSharedSubfolder(trimmed);
      setSharedFolders(res.folders);
      setSelectedSharedFolder(res.folder);
      setNewFolderInput('');
      setShowNewFolderInput(false);
    } catch (err: any) {
      setSharedFeedback({ type: 'error', text: err?.message || 'Impossibile creare la cartella.' });
    }
  };

  const handleSaveToSharedFolder = async (docType: 'CME' | 'CM') => {
    setIsSavingShared(docType);
    setSharedFeedback(null);
    try {
      const payload = docType === 'CME' ? buildCmeData() : buildCmData();
      const fileName = docType === 'CME' ? cmeJsonName : cmJsonName;
      await saveProjectToSharedFolder({
        title: cleanBase,
        fileName,
        folder: selectedSharedFolder,
        docType,
        author: operatorName,
        note: sharedNote.trim() || undefined,
        articleCount: docType === 'CME' ? articles.length : activeCount,
        planSheetCount: docType === 'CME' ? (planSheets?.length || 0) : 0,
        totalAmount: docType === 'CME' ? totalAmount : 0,
        payload,
        notifyInChat,
        chatChannel,
        senderId: operatorId,
      });
      setSharedFeedback({
        type: 'success',
        text: `Salvato "${fileName}" nella Cartella Condivisa / ${selectedSharedFolder}${
          notifyInChat ? ' e notificato in Chat.' : '.'
        }`,
      });
      onSavedToSharedFolder?.();
    } catch (err: any) {
      setSharedFeedback({
        type: 'error',
        text: err?.message || 'Errore durante il salvataggio nella cartella condivisa.',
      });
    } finally {
      setIsSavingShared(null);
    }
  };

  const activeCount = articles.filter((a) => {
    const cat = categories.find((c) => c.code === a.categoryCode);
    return a.isEnabled !== false && (!cat || cat.isEnabled !== false);
  }).length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
        {/* HEADER MODALE */}
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-sm">
              <Save className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Salva Progetto</h3>
              <p className="text-slate-400 text-xs">
                {allowSharedFolder
                  ? 'Salva nella Cartella Condivisa del team oppure sul computer locale'
                  : 'Scegli formato e destinazione sul tuo computer (CME / CM)'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* NOME BASE FILE */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Nome File di Base (senza estensione)</span>
              <span className="text-[11px] text-slate-400 font-normal">
                Le sigle _CME e _CM vengono aggiunte in automatico
              </span>
            </label>
            <input
              type="text"
              value={baseFileName}
              onChange={(e) => setBaseFileName(e.target.value)}
              placeholder="Nome_Progetto"
              className="w-full border-2 border-slate-300 rounded-xl p-2.5 font-bold text-slate-800 focus:border-blue-600 focus:ring-0 outline-none text-sm bg-slate-50 focus:bg-white transition-all shadow-xs"
              autoFocus
            />
          </div>

          {/* CARTELLA CONDIVISA (SOLO UTENTI REGISTRATI) */}
          {allowSharedFolder && (
          <div className="bg-sky-50/80 border-2 border-sky-300 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 bg-sky-600 text-white rounded-lg shadow-xs">
                  <UploadCloud className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    Salva nella Cartella Condivisa
                  </h4>
                  <p className="text-xs text-slate-600">
                    Rende il computo (con analisi e tavole PDF) subito accessibile ai colleghi
                  </p>
                </div>
              </div>
              {onOpenSharedFolder && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSharedFolder();
                  }}
                  className="text-xs font-semibold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Sfoglia archivio</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Cartella di destinazione
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedSharedFolder}
                    onChange={(e) => setSelectedSharedFolder(e.target.value)}
                    className="flex-1 bg-white border border-sky-300 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-sky-600"
                  >
                    {sharedFolders.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewFolderInput((v) => !v)}
                    className="p-2 bg-white hover:bg-sky-100 border border-sky-300 rounded-lg text-sky-800 transition-colors cursor-pointer"
                    title="Crea nuova sottocartella condivisa"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Nota revisione (opzionale)
                </label>
                <input
                  type="text"
                  value={sharedNote}
                  onChange={(e) => setSharedNote(e.target.value)}
                  placeholder="Es. Versione gara con misure tav. 2"
                  className="w-full bg-white border border-sky-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            {showNewFolderInput && (
              <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-sky-200">
                <input
                  type="text"
                  value={newFolderInput}
                  onChange={(e) => setNewFolderInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleCreateFolder();
                    }
                  }}
                  placeholder="Nome nuova sottocartella (es. Commessa Milano)..."
                  className="flex-1 text-xs px-2 py-1 focus:outline-none text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => void handleCreateFolder()}
                  className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-semibold cursor-pointer"
                >
                  Crea
                </button>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={notifyInChat}
                onChange={(e) => setNotifyInChat(e.target.checked)}
                className="rounded border-sky-400 text-sky-600 focus:ring-sky-500"
              />
              <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
              <span>Invia automaticamente il link del file nella Chat del team</span>
            </label>

            {sharedFeedback && (
              <div
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 border ${
                  sharedFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {sharedFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{sharedFeedback.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isSavingShared !== null}
                onClick={() => void handleSaveToSharedFolder('CME')}
                className="p-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
              >
                {isSavingShared === 'CME' ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <UploadCloud className="w-4 h-4 shrink-0" />
                )}
                <div className="text-left leading-tight min-w-0">
                  <div className="font-bold">Salva CME in Condivisa</div>
                  <div className="text-[10px] opacity-85 font-mono truncate">
                    /{selectedSharedFolder}/{cmeJsonName}
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={isSavingShared !== null}
                onClick={() => void handleSaveToSharedFolder('CM')}
                className="p-2.5 bg-white hover:bg-emerald-600 hover:text-white disabled:opacity-50 text-emerald-900 border border-emerald-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs group cursor-pointer"
              >
                {isSavingShared === 'CM' ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <UploadCloud className="w-4 h-4 text-emerald-600 group-hover:text-white shrink-0" />
                )}
                <div className="text-left leading-tight min-w-0">
                  <div className="font-bold">Salva Solo CM in Condivisa</div>
                  <div className="text-[10px] opacity-80 font-mono truncate">
                    /{selectedSharedFolder}/{cmJsonName}
                  </div>
                </div>
              </button>
            </div>
          </div>
          )}

          {/* OPZIONE 1: SALVA SUL COMPUTER - COMPUTO METRICO ESTIMATIVO (CME) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-600 text-white rounded-lg shadow-xs">
                  <Calculator className="w-4 h-4" />
                </span>
                <h4 className="font-bold text-sm text-slate-900">
                  1. Salva sul PC · Computo Metrico Estimativo (_CME)
                </h4>
              </div>
              <span className="text-xs text-slate-500 font-mono tabular-nums">{articles.length} voci</span>
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              Include tutte le voci, descrizioni integrali, misurazioni, prezzi unitari, analisi nuove e tavole PDF.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleSaveCmeJson}
                className="p-2.5 bg-white hover:bg-blue-600 hover:text-white text-blue-900 border border-blue-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs group cursor-pointer"
              >
                <FileJson className="w-4 h-4 text-blue-600 group-hover:text-white flex-shrink-0" />
                <div className="text-left leading-tight min-w-0">
                  <div className="font-bold">Formato GeCoLa (.json)</div>
                  <div className="text-[10px] opacity-75 font-mono truncate">{cmeJsonName}</div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleSaveCmeExcel}
                className="p-2.5 bg-white hover:bg-blue-600 hover:text-white text-blue-900 border border-blue-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs group cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-blue-600 group-hover:text-white flex-shrink-0" />
                <div className="text-left leading-tight min-w-0">
                  <div className="font-bold">Formato Excel (.xls)</div>
                  <div className="text-[10px] opacity-75 font-mono truncate">{cmeXlsName}</div>
                </div>
              </button>
            </div>
          </div>

          {/* OPZIONE 2: SALVA SUL COMPUTER - SOLO COMPUTO METRICO (CM) */}
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-emerald-600 text-white rounded-lg shadow-xs">
                  <Briefcase className="w-4 h-4" />
                </span>
                <h4 className="font-bold text-sm text-emerald-950">
                  2. Salva sul PC · Solo Computo Metrico (_CM)
                </h4>
              </div>
              <span className="text-xs text-emerald-800 font-mono tabular-nums">{activeCount} voci accese</span>
            </div>
            <p className="text-xs text-emerald-900 mb-3 leading-relaxed">
              Per <b>preventivi e subappalti</b>: contiene solo le voci accese, <b>senza prezzi e senza riferimenti prezzari</b>, mantenendo la numerazione originale.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleSaveCmJson}
                className="p-2.5 bg-white hover:bg-emerald-600 hover:text-white text-emerald-900 border border-emerald-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs group cursor-pointer"
              >
                <FileJson className="w-4 h-4 text-emerald-600 group-hover:text-white flex-shrink-0" />
                <div className="text-left leading-tight min-w-0">
                  <div className="font-bold">Formato GeCoLa (.json)</div>
                  <div className="text-[10px] opacity-75 font-mono truncate">{cmJsonName}</div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleSaveCmExcel}
                className="p-2.5 bg-white hover:bg-emerald-600 hover:text-white text-emerald-900 border border-emerald-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs group cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 group-hover:text-white flex-shrink-0" />
                <div className="text-left leading-tight min-w-0">
                  <div className="font-bold">Formato Excel (.xls)</div>
                  <div className="text-[10px] opacity-75 font-mono truncate">{cmXlsName}</div>
                </div>
              </button>
            </div>
          </div>

          {/* FOOTER */}
          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-400 font-medium">
              {allowSharedFolder
                ? 'Puoi salvare sia in Cartella Condivisa che in locale sul computer'
                : 'Salvataggio diretto sul tuo computer in formato .json o Excel .xls'}
            </span>
            <button
              type="button"
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

