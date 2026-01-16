
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Calculator, LayoutDashboard, FolderOpen, Minus, XCircle, ChevronRight, Settings, PlusCircle, MinusCircle, Link as LinkIcon, ExternalLink, Undo2, Redo2, PenLine, MapPin, Lock, Unlock, Lightbulb, LightbulbOff, Edit2, FolderPlus, GripVertical, Mic, Sigma, Save, FileSignature, CheckCircle2, Loader2, Cloud, Share2, FileText, ChevronDown, TestTubes, Search, Coins, ArrowRightLeft, Copy, Move, LogOut, AlertTriangle, ShieldAlert, Award, User, BookOpen, Edit3, Paperclip, MousePointerClick, AlignLeft, Layers, Sparkles, FileJson } from 'lucide-react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { ref, set, onValue, off } from 'firebase/database';
import { auth, db } from './firebase';
import Login from './components/Login';
import { CATEGORIES, INITIAL_ARTICLES, PROJECT_INFO, INITIAL_ANALYSES, SOA_CATEGORIES } from './constants';
import { Article, Totals, ProjectInfo, Measurement, Category, PriceAnalysis, AnalysisComponent } from './types';
import Summary from './components/Summary';
import ProjectSettingsModal from './components/ProjectSettingsModal';
import LinkArticleModal from './components/LinkArticleModal';
import ArticleEditModal from './components/ArticleEditModal';
import CategoryDropGate from './components/CategoryDropGate';
import CategoryEditModal from './components/CategoryEditModal';
import SaveProjectModal from './components/SaveProjectModal';
import AnalysisEditorModal from './components/AnalysisEditorModal';
import ImportAnalysisModal from './components/ImportAnalysisModal';
import { parseDroppedContent, parseVoiceMeasurement } from './services/geminiService';
import { generateComputoMetricPdf } from './services/pdfGenerator';

// --- Helper Functions ---
const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
};

const formatNumber = (val: number | undefined) => {
    if (val === undefined || val === null || val === 0) return '';
    return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getWbsNumber = (code: string) => {
    const match = code.match(/WBS\.(\d+)/);
    return match ? parseInt(match[1], 10) : code;
};

const roundTwoDecimals = (num: number) => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

// --- Core Calculation Engine ---
const calculateRowValue = (m: Measurement, linkedValue: number = 0): number => {
  if (m.type === 'subtotal') return 0;
  if (m.linkedArticleId) {
    const mult = m.multiplier === undefined ? 1 : m.multiplier;
    return (linkedValue || 0) * mult * (m.type === 'deduction' ? -1 : 1);
  }
  const l = m.length;
  const w = m.width;
  const h = m.height;
  const factors = [l, w, h].filter(v => v !== undefined && v !== 0 && v !== null);
  const base = factors.length > 0 ? factors.reduce((a, b) => (a || 1) * (b || 1), 1) : 0;
  let effectiveMultiplier = 0;
  if (m.multiplier !== undefined) {
      effectiveMultiplier = m.multiplier;
  } else {
      if (factors.length > 0) effectiveMultiplier = 1;
      else if (m.length === undefined && m.width === undefined && m.height === undefined) effectiveMultiplier = 0;
  }
  const effectiveBase = (factors.length === 0 && effectiveMultiplier !== 0) ? 1 : base;
  const val = effectiveBase * effectiveMultiplier;
  return m.type === 'deduction' ? -val : val;
};

const resolveArticleQuantity = (
  articleId: string, 
  allArticlesMap: Map<string, Article>, 
  visited: Set<string> = new Set()
): number => {
  if (visited.has(articleId)) return 0;
  visited.add(articleId);
  const article = allArticlesMap.get(articleId);
  if (!article) return 0;
  return article.measurements.reduce((sum, m) => {
    let rowVal = 0;
    if (m.linkedArticleId) {
       const sourceQty = resolveArticleQuantity(m.linkedArticleId, allArticlesMap, new Set(visited));
       let finalSourceVal = sourceQty;
       if (m.linkedType === 'amount') {
         const sourceArt = allArticlesMap.get(m.linkedArticleId);
         if (sourceArt) finalSourceVal = sourceQty * sourceArt.unitPrice;
       }
       rowVal = calculateRowValue(m, finalSourceVal);
    } else {
       rowVal = calculateRowValue(m);
    }
    return sum + rowVal;
  }, 0);
};

const recalculateAllArticles = (articles: Article[]): Article[] => {
  const articleMap = new Map(articles.map(a => [a.id, a]));
  return articles.map(art => {
    const calculatedQty = resolveArticleQuantity(art.id, articleMap);
    return { ...art, quantity: calculatedQty };
  });
};

const TableHeader: React.FC<{ activeColumn: string | null }> = ({ activeColumn }) => (
  <thead className="bg-[#f8f9fa] border-b border-black text-[9px] uppercase font-bold text-gray-800 sticky top-0 z-20 shadow-sm">
    <tr>
      <th className="py-1 px-1 text-center w-[35px] border-r border-gray-300">N.</th>
      <th className="py-1 px-1 text-left w-[100px] border-r border-gray-300">Tariffa</th>
      <th className={`py-1 px-1 text-left min-w-[250px] border-r border-gray-300 ${activeColumn === 'desc' ? 'bg-blue-50 text-blue-900' : ''}`}>Designazione dei Lavori</th>
      <th className={`py-1 px-1 text-center w-[45px] border-r border-gray-300 ${activeColumn === 'mult' ? 'bg-blue-50 text-blue-900' : ''}`}>Par.Ug</th>
      <th className={`py-1 px-1 text-center w-[55px] border-r border-gray-300 ${activeColumn === 'len' ? 'bg-blue-50 text-blue-900' : ''}`}>Lung.</th>
      <th className={`py-1 px-1 text-center w-[55px] border-r border-gray-300 ${activeColumn === 'wid' ? 'bg-blue-50 text-blue-900' : ''}`}>Largh.</th>
      <th className={`py-1 px-1 text-center w-[55px] border-r border-gray-300 ${activeColumn === 'h' ? 'bg-blue-50 text-blue-900' : ''}`}>H/Peso</th>
      <th className="py-1 px-1 text-center w-[70px] border-r border-gray-300 bg-gray-100">Quantità</th>
      <th className="py-1 px-1 text-right w-[80px] border-r border-gray-300">Prezzo €</th>
      <th className="py-1 px-1 text-right w-[90px] border-r border-gray-300">Importo €</th>
      <th className="py-1 px-1 text-right w-[80px] border-r border-gray-300">M.O. €</th>
      <th className="py-1 px-1 text-center w-[50px] print:hidden text-gray-400">Cmd</th>
    </tr>
  </thead>
);

interface ArticleGroupProps {
  article: Article; index: number; allArticles: Article[]; isPrintMode: boolean; isCategoryLocked?: boolean;
  onUpdateArticle: (id: string, field: keyof Article, value: string | number) => void;
  onEditArticleDetails: (article: Article) => void; onDeleteArticle: (id: string) => void;
  onAddMeasurement: (articleId: string) => void; onAddSubtotal: (articleId: string) => void;
  onAddVoiceMeasurement: (articleId: string, data: Partial<Measurement>) => void;
  onUpdateMeasurement: (articleId: string, mId: string, field: keyof Measurement, value: string | number | undefined) => void;
  onDeleteMeasurement: (articleId: string, mId: string) => void;
  onToggleDeduction: (articleId: string, mId: string) => void;
  onOpenLinkModal: (articleId: string, measurementId: string) => void;
  onScrollToArticle: (id: string) => void; onReorderMeasurements: (articleId: string, startIndex: number, endIndex: number) => void;
  onArticleDragStart: (e: React.DragEvent, article: Article) => void;
  onArticleDrop: (e: React.DragEvent, targetArticleId: string, position: 'top' | 'bottom') => void;
  onArticleDragEnd: () => void; lastAddedMeasurementId: string | null; onColumnFocus: (col: string | null) => void;
  onViewAnalysis: (analysisId: string) => void; onInsertExternalArticle: (index: number, text: string) => void;
  onToggleArticleLock: (id: string) => void;
}

const ArticleGroup: React.FC<ArticleGroupProps> = (props) => {
   const { article, index, allArticles, isPrintMode, isCategoryLocked, onUpdateArticle, onEditArticleDetails, onDeleteArticle, onAddMeasurement, onAddSubtotal, onAddVoiceMeasurement, onUpdateMeasurement, onDeleteMeasurement, onToggleDeduction, onOpenLinkModal, onScrollToArticle, onReorderMeasurements, onArticleDragStart, onArticleDrop, onArticleDragEnd, lastAddedMeasurementId, onColumnFocus, onViewAnalysis, onInsertExternalArticle, onToggleArticleLock } = props;
   
   const [isArticleDragOver, setIsArticleDragOver] = useState(false);
   const [articleDropPosition, setArticleDropPosition] = useState<'top' | 'bottom' | null>(null);
   const areControlsDisabled = isCategoryLocked || article.isLocked;

   const hierarchicalNumber = `${getWbsNumber(article.categoryCode)}.${index + 1}`;
   const totalAmount = article.quantity * article.unitPrice;
   const laborValue = totalAmount * (article.laborRate / 100);

   const processedMeasurements = article.measurements.map(m => {
        let val = 0;
        if (m.type !== 'subtotal') {
            if (m.linkedArticleId) {
                const linkedArt = allArticles.find(a => a.id === m.linkedArticleId);
                if (linkedArt) {
                    const baseVal = m.linkedType === 'amount' ? (linkedArt.quantity * linkedArt.unitPrice) : linkedArt.quantity;
                    val = calculateRowValue(m, baseVal);
                }
            } else val = calculateRowValue(m);
        }
        return { ...m, calculatedValue: val };
   });

   return (
      <tbody id={`article-${article.id}`} className={`bg-white border-b border-gray-400 group/article transition-colors relative ${article.isLocked ? 'bg-gray-50' : ''}`}>
         {isArticleDragOver && articleDropPosition === 'top' && (
             <tr className="h-0 p-0 border-none"><td colSpan={12} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-green-500 -top-0.5 z-50 shadow-[0_0_10px_rgba(34,197,94,0.8)]"></div></td></tr>
         )}
         <tr 
            className={`align-top ${!isPrintMode ? 'cursor-move hover:bg-slate-50' : ''}`}
            draggable={!isPrintMode && !areControlsDisabled}
            onDragStart={(e) => onArticleDragStart(e, article)}
            onDragEnd={() => onArticleDragEnd()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsArticleDragOver(true); const rect = e.currentTarget.getBoundingClientRect(); setArticleDropPosition(e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom'); }}
            onDragLeave={() => setIsArticleDragOver(false)}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsArticleDragOver(false); onArticleDrop(e, article.id, articleDropPosition || 'bottom'); }}
         >
            <td className="text-center py-2 text-xs font-bold text-gray-500 border-r border-gray-200 bg-white font-mono">{hierarchicalNumber}</td>
            <td className="p-1 border-r border-gray-200 align-top bg-white">
                <div className="flex flex-col">
                    <span className="font-mono font-bold text-xs text-purple-700">{article.code}</span>
                    {article.soaCategory && <span className="text-[9px] text-gray-400 italic">SOA: {article.soaCategory}</span>}
                </div>
            </td>
            <td className="p-2 border-r border-gray-200 bg-white">
                <p className="text-sm text-gray-900 leading-relaxed font-serif text-justify whitespace-pre-wrap">{article.description}</p>
            </td>
            <td colSpan={8} className="bg-white border-r border-gray-200"></td>
            <td className="text-center pt-2 print:hidden bg-gray-50/30">
                <div className="flex flex-col items-center gap-1 opacity-0 group-hover/article:opacity-100 transition-opacity">
                    <button onClick={() => onToggleArticleLock(article.id)} className="p-1 text-gray-300 hover:text-blue-600">{article.isLocked ? <Lock className="w-3.5 h-3.5 text-red-500" /> : <Unlock className="w-3.5 h-3.5" />}</button>
                    <button onClick={() => onEditArticleDetails(article)} className="p-1 text-gray-300 hover:text-blue-600"><PenLine className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onDeleteArticle(article.id)} className="p-1 text-gray-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
            </td>
         </tr>
         {processedMeasurements.map((m) => (
            <tr key={m.id} className={`text-xs ${m.type === 'subtotal' ? 'bg-yellow-50' : 'bg-white'}`}>
                <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                <td className="pl-6 pr-2 py-1 border-r border-gray-200">
                    <input value={m.description} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'description', e.target.value)} className="w-full bg-transparent border-none p-0 focus:ring-0 text-gray-700" placeholder="Misura..." disabled={areControlsDisabled} />
                </td>
                <td className="border-r border-gray-200 text-center bg-gray-50/50"><input type="number" value={m.multiplier || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'multiplier', parseFloat(e.target.value))} className="w-full bg-transparent text-center border-none p-0" placeholder="1" disabled={areControlsDisabled} /></td>
                <td className="border-r border-gray-200 text-center bg-gray-50/50"><input type="number" value={m.length || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'length', parseFloat(e.target.value))} className="w-full bg-transparent text-center border-none p-0" disabled={areControlsDisabled} /></td>
                <td className="border-r border-gray-200 text-center bg-gray-50/50"><input type="number" value={m.width || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'width', parseFloat(e.target.value))} className="w-full bg-transparent text-center border-none p-0" disabled={areControlsDisabled} /></td>
                <td className="border-r border-gray-200 text-center bg-gray-50/50"><input type="number" value={m.height || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'height', parseFloat(e.target.value))} className="w-full bg-transparent text-center border-none p-0" disabled={areControlsDisabled} /></td>
                <td className="border-r border-gray-200 text-right pr-1 font-mono">{formatNumber(m.calculatedValue)}</td>
                <td colSpan={4} className="bg-gray-50/20"></td>
            </tr>
         ))}
         <tr className="bg-white font-bold text-xs border-t border-gray-300">
             <td colSpan={2} className="border-r border-gray-200"></td>
             <td className="px-2 py-2 text-right border-r border-gray-300 uppercase text-gray-500">Sommano {article.unit}</td>
             <td colSpan={4} className="border-r border-gray-200"></td>
             <td className="text-right pr-1 font-mono border-r border-gray-200">{formatNumber(article.quantity)}</td>
             <td className="text-right pr-1 font-mono border-r border-gray-200">{formatNumber(article.unitPrice)}</td>
             <td className="text-right pr-1 font-mono text-blue-900 border-r border-gray-200">{formatNumber(totalAmount)}</td>
             <td className="text-right pr-1 font-mono text-gray-500 border-r border-gray-200">{formatCurrency(laborValue)}</td>
             <td className="text-center print:hidden bg-gray-50">
                 <button onClick={() => onAddMeasurement(article.id)} className="p-1 text-blue-600 hover:bg-blue-100 rounded-full transition-colors" disabled={areControlsDisabled}><Plus className="w-4 h-4" /></button>
             </td>
         </tr>
         {isArticleDragOver && articleDropPosition === 'bottom' && (
             <tr className="h-0 p-0 border-none"><td colSpan={12} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-green-500 bottom-0 z-50 shadow-[0_0_10px_rgba(34,197,94,0.8)]"></div></td></tr>
         )}
      </tbody>
   );
};

interface Snapshot { articles: Article[]; categories: Category[]; analyses: PriceAnalysis[]; }
type ViewMode = 'COMPUTO' | 'ANALISI';

const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('COMPUTO');
  const [categories, setCategories] = useState<Category[]>(CATEGORIES);
  const [articles, setArticles] = useState<Article[]>(INITIAL_ARTICLES);
  const [analyses, setAnalyses] = useState<PriceAnalysis[]>(INITIAL_ANALYSES);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(PROJECT_INFO);
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>(CATEGORIES[0]?.code || 'WBS.01');
  const [draggedCategoryCode, setDraggedCategoryCode] = useState<string | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [isImportAnalysisModalOpen, setIsImportAnalysisModalOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [wbsDropTarget, setWbsDropTarget] = useState<{ code: string, position: 'top' | 'bottom' } | null>(null);
  const [isProcessingDrop, setIsProcessingDrop] = useState(false);
  const [isAnalysisEditorOpen, setIsAnalysisEditorOpen] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState<PriceAnalysis | null>(null);
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');

  // Autosave & File System Logic
  const [currentFileHandle, setCurrentFileHandle] = useState<any>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
  }, []);

  const getProjectExportData = () => {
      const gecolaData = { projectInfo, categories, articles, analyses, version: "11.2" };
      return JSON.stringify({ gecolaData, exportedAt: new Date().toISOString(), app: "GeCoLa Cloud" }, null, 2);
  };

  const getAccountingExportData = () => {
      const chronosList = categories
        .filter(cat => cat.isEnabled !== false)
        .map(cat => ({
          groupName: `${cat.code} - ${cat.name}`,
          items: articles.filter(a => a.categoryCode === cat.code).map(art => ({
            tariffCode: art.code,
            description: art.description,
            price: art.unitPrice,
            quantity: art.quantity,
            total: art.quantity * art.unitPrice,
            unit: art.unit,
            laborRate: art.laborRate,
            laborAmount: (art.quantity * art.unitPrice) * (art.laborRate / 100)
          }))
        }));
      return JSON.stringify(chronosList, null, 2);
  };

  const handleSaveAsProject = async () => {
    if (!('showSaveFilePicker' in window)) { alert("Browser non supportato per salvataggio diretto."); return; }
    try {
        const handle = await (window as any).showSaveFilePicker({
            suggestedName: `${projectInfo.title || 'Progetto'}.json`,
            types: [{ description: 'GeCoLa Project', accept: { 'application/json': ['.json'] } }],
        });
        setCurrentFileHandle(handle);
        const writable = await handle.createWritable();
        await writable.write(getProjectExportData());
        await writable.close();
        setIsSaveMenuOpen(false);
    } catch (err: any) { if (err.name !== 'AbortError') console.error(err); }
  };

  const handleSaveAsAccounting = async () => {
    if (!('showSaveFilePicker' in window)) { alert("Browser non supportato per salvataggio diretto."); return; }
    try {
        const handle = await (window as any).showSaveFilePicker({
            suggestedName: `Contabilita_${projectInfo.title || 'Progetto'}.json`,
            types: [{ description: 'Accounting JSON (Chronos)', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(getAccountingExportData());
        await writable.close();
        setIsSaveMenuOpen(false);
        alert("File contabilità esportato con successo!");
    } catch (err: any) { if (err.name !== 'AbortError') console.error(err); }
  };

  const handleAutosave = useCallback(async () => {
      if (!currentFileHandle) return;
      try {
          setIsAutoSaving(true);
          const writable = await currentFileHandle.createWritable();
          await writable.write(getProjectExportData());
          await writable.close();
          setTimeout(() => setIsAutoSaving(false), 800);
      } catch (err) { setIsAutoSaving(false); }
  }, [articles, categories, projectInfo, currentFileHandle]);

  useEffect(() => {
    if (!currentFileHandle) return;
    const t = setTimeout(handleAutosave, 3000);
    return () => clearTimeout(t);
  }, [articles, categories, projectInfo, currentFileHandle, handleAutosave]);

  const updateState = (newArticles: Article[], newCats = categories, newAn = analyses, saveHistory = true) => {
      if (saveHistory) {
          setHistory(prev => [...prev, { articles, categories, analyses }].slice(-50));
          setFuture([]);
      }
      setArticles(recalculateAllArticles(newArticles));
      setCategories(newCats);
      setAnalyses(newAn);
  };

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture(f => [{ articles, categories, analyses }, ...f]);
    setHistory(h => h.slice(0, -1));
    setArticles(prev.articles); setCategories(prev.categories); setAnalyses(prev.analyses);
  }, [history, articles, categories, analyses]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(h => [...h, { articles, categories, analyses }]);
    setFuture(f => f.slice(1));
    setArticles(next.articles); setCategories(next.categories); setAnalyses(next.analyses);
  }, [future, articles, categories, analyses]);

  const totals: Totals = useMemo(() => {
    const totalWorks = articles.reduce((acc, a) => acc + (a.quantity * a.unitPrice), 0);
    const safetyCosts = totalWorks * (projectInfo.safetyRate / 100);
    return { totalWorks, safetyCosts, totalTaxable: totalWorks + safetyCosts, vatAmount: (totalWorks + safetyCosts) * (projectInfo.vatRate / 100), grandTotal: (totalWorks + safetyCosts) * (1 + projectInfo.vatRate / 100) };
  }, [articles, projectInfo]);

  const handleWbsDragStart = (e: React.DragEvent, code: string) => {
      setDraggedCategoryCode(code);
      // MIRACOLO: Trick URI list per Cross-Tab Drag & Drop
      const dummyUrl = 'https://gecola.it/transfer/wbs/' + code;
      e.dataTransfer.setData('text/uri-list', dummyUrl);
      e.dataTransfer.setData('URL', dummyUrl);
      const cat = categories.find(c => c.code === code);
      if (cat) {
          const bundle = { type: 'CROSS_TAB_WBS_BUNDLE', category: cat, articles: articles.filter(a => a.categoryCode === code), analyses: analyses.filter(an => articles.some(art => art.categoryCode === code && art.linkedAnalysisId === an.id)) };
          e.dataTransfer.setData('text/plain', JSON.stringify(bundle));
      }
      e.dataTransfer.effectAllowed = 'all';
  };

  const handleWbsDrop = (e: React.DragEvent, targetCode: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      const textData = e.dataTransfer.getData('text/plain');
      const pos = wbsDropTarget?.position || 'bottom';
      setWbsDropTarget(null);
      if (textData) {
          try {
              const payload = JSON.parse(textData);
              if (payload?.type === 'CROSS_TAB_WBS_BUNDLE') {
                  const { category: impCat, articles: impArts } = payload;
                  const newCode = `WBS.${(categories.length + 1).toString().padStart(2, '0')}`;
                  const newCat = { ...impCat, code: newCode, name: impCat.name + " (Copia)" };
                  const newCats = [...categories];
                  const tIdx = targetCode ? newCats.findIndex(c => c.code === targetCode) : newCats.length;
                  newCats.splice(pos === 'bottom' ? tIdx + 1 : tIdx, 0, newCat);
                  const newArts = impArts.map((art: any) => ({ ...art, id: Math.random().toString(36).substr(2, 9), categoryCode: newCode, measurements: art.measurements.map((m: any) => ({ ...m, id: Math.random().toString(36).substr(2, 9) })) }));
                  updateState([...articles, ...newArts], newCats);
                  setSelectedCategoryCode(newCode);
              }
          } catch (err) {}
      }
      setDraggedCategoryCode(null);
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white font-black text-3xl tracking-tighter animate-pulse">GECOLA PRO...</div>;
  if (!user && auth) return <Login />;

  const activeArticles = articles.filter(a => a.categoryCode === selectedCategoryCode);
  const activeCategory = categories.find(c => c.code === selectedCategoryCode);
  const filteredAnalyses = analyses.filter(a => a.code.toLowerCase().includes(analysisSearchTerm.toLowerCase()) || a.description.toLowerCase().includes(analysisSearchTerm.toLowerCase()));

  return (
    <div className="h-screen flex flex-col bg-[#e8eaed] font-sans overflow-hidden text-slate-800" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}>
      <div className="bg-[#2c3e50] shadow-md z-50 h-14 flex items-center justify-between px-6 border-b border-slate-600 flex-shrink-0">
          <div className="flex items-center space-x-3 w-64">
            <div className="bg-orange-500 p-1.5 rounded-lg shadow-lg"><Calculator className="w-5 h-5 text-white" /></div>
            <span className="font-bold text-lg text-white">GeCoLa <span className="font-light opacity-80">v11.2</span></span>
          </div>
          <div className="flex-1 px-6 flex justify-center items-center gap-4">
              <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-1.5 rounded-full border border-slate-700 text-white font-bold text-sm cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => setIsSettingsModalOpen(true)}>
                  <span className="truncate max-w-[250px]">{projectInfo.title}</span>
                  {isAutoSaving && <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)] ml-1" title="Autosave attivo"></span>}
                  <Edit3 className="w-3 h-3 text-slate-400" />
              </div>
              <div className="flex items-center border-l border-slate-700 pl-4 space-x-1">
                <button onClick={handleUndo} disabled={history.length === 0} className="p-1.5 text-slate-300 hover:text-white disabled:opacity-20 transition-all hover:scale-110" title="Annulla"><Undo2 className="w-5 h-5" /></button>
                <button onClick={handleRedo} disabled={future.length === 0} className="p-1.5 text-slate-300 hover:text-white disabled:opacity-20 transition-all hover:scale-110" title="Ripristina"><Redo2 className="w-5 h-5" /></button>
              </div>
          </div>
          <div className="flex items-center space-x-2">
             <div className="relative">
                <button onClick={() => setIsSaveMenuOpen(!isSaveMenuOpen)} className="p-2 text-slate-300 hover:text-blue-400 transition-colors flex items-center gap-1" title="Salva con nome">
                    <Save className="w-5 h-5" />
                    <ChevronDown className={`w-3 h-3 transition-transform ${isSaveMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isSaveMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white shadow-2xl rounded-lg py-2 z-[100] border border-gray-200 overflow-hidden">
                        <button onClick={handleSaveAsProject} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-3">
                            <FileJson className="w-4 h-4 text-blue-600" />
                            <div className="flex flex-col"><span className="font-bold">Computo Metrico (.json)</span><span className="text-[10px] text-gray-400">File completo di progetto</span></div>
                        </button>
                        <div className="border-t border-gray-100"></div>
                        <button onClick={handleSaveAsAccounting} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-orange-50 flex items-center gap-3">
                            <Coins className="w-4 h-4 text-orange-600" />
                            <div className="flex flex-col"><span className="font-bold">Contabilità Lavori (.json)</span><span className="text-[10px] text-gray-400">Export formato Chronos AI</span></div>
                        </button>
                    </div>
                )}
             </div>
             <div className="w-px h-6 bg-slate-600 mx-1"></div>
             <button onClick={() => setIsPrintMenuOpen(!isPrintMenuOpen)} className="p-2 text-slate-300 hover:text-white relative transition-colors"><FileText className="w-5 h-5" />
                {isPrintMenuOpen && (<div className="absolute right-0 top-full mt-2 w-48 bg-white shadow-2xl rounded-lg py-2 z-50 border border-gray-200 overflow-hidden"><button onClick={() => generateComputoMetricPdf(projectInfo, categories, articles)} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 font-medium">Esporta Computo PDF</button></div>)}
             </button>
             <button onClick={() => signOut(auth)} className="p-2 text-red-400 hover:text-white ml-2 transition-colors"><LogOut className="w-5 h-5" /></button>
          </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 bg-white border-r border-slate-300 flex flex-col shadow-lg z-10 flex-shrink-0">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex gap-1">
             <button onClick={() => setViewMode('COMPUTO')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${viewMode === 'COMPUTO' ? 'bg-white text-blue-700 ring-1 ring-blue-200 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>Computo</button>
             <button onClick={() => setViewMode('ANALISI')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${viewMode === 'ANALISI' ? 'bg-white text-purple-700 ring-1 ring-purple-200 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>Analisi</button>
          </div>
          <div className="flex-1 overflow-y-auto" onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={(e) => handleWbsDrop(e, null)}>
              {viewMode === 'COMPUTO' ? (
                <>
                  <div className="p-3 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      <span>Indice Documento</span>
                      <button onClick={() => { setEditingCategory(null); setIsCategoryModalOpen(true); }} className="text-blue-600 hover:scale-110 transition-transform"><PlusCircle className="w-4 h-4" /></button>
                  </div>
                  {categories.map(cat => (
                      <div 
                        key={cat.code} draggable onDragStart={(e) => handleWbsDragStart(e, cat.code)} 
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setWbsDropTarget({code: cat.code, position: e.clientY < r.top + r.height/2 ? 'top' : 'bottom'}); }}
                        onDragLeave={() => setWbsDropTarget(null)} onDrop={(e) => handleWbsDrop(e, cat.code)} 
                        className={`relative p-3 border-l-4 cursor-pointer group transition-all ${selectedCategoryCode === cat.code ? 'bg-blue-50 border-blue-500' : 'border-transparent hover:bg-slate-50'} ${!cat.isEnabled ? 'opacity-50' : ''}`} 
                        onClick={() => setSelectedCategoryCode(cat.code)}
                      >
                          {wbsDropTarget?.code === cat.code && <div className={`absolute ${wbsDropTarget.position === 'top' ? 'top-0' : 'bottom-0'} left-0 right-0 h-1 bg-green-500 z-50 shadow-[0_0_10px_rgba(34,197,94,0.8)]`}></div>}
                          <div className="flex items-center gap-2 mb-0.5"><GripVertical className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100" /><span className="text-[10px] font-mono font-bold bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">{cat.code}</span>{cat.isLocked && <Lock className="w-3 h-3 text-red-400" />}</div>
                          <span className="text-xs font-semibold block truncate leading-snug">{cat.name}</span>
                          <div className="absolute right-1 top-1 flex bg-white/95 shadow-lg rounded border border-gray-200 p-0.5 opacity-0 group-hover:opacity-100 z-20 space-x-0.5 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); setCategories(categories.map(c => c.code === cat.code ? {...c, isEnabled: !c.isEnabled} : c)); }} className={`p-1 rounded ${cat.isEnabled ? 'text-gray-400 hover:text-blue-500' : 'text-orange-500 bg-orange-50'}`} title="Visibilità">{cat.isEnabled ? <Lightbulb className="w-3 h-3" /> : <LightbulbOff className="w-3 h-3" />}</button>
                            <button onClick={(e) => { e.stopPropagation(); setCategories(categories.map(c => c.code === cat.code ? {...c, isLocked: !c.isLocked} : c)); }} className={`p-1 rounded ${cat.isLocked ? 'text-red-500 bg-red-50' : 'text-gray-400 hover:text-orange-500'}`} title="Blocca">{cat.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}</button>
                            <button onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); setIsCategoryModalOpen(true); }} className="p-1 text-gray-400 hover:text-green-500 rounded" title="Rinomina"><Edit2 className="w-3 h-3" /></button>
                            <button onClick={(e) => { e.stopPropagation(); if(window.confirm('Eliminare?')) setCategories(categories.filter(c => c.code !== cat.code)); }} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Elimina"><Trash2 className="w-3 h-3" /></button>
                          </div>
                      </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="p-3 bg-white border-b border-gray-200">
                    <input type="text" placeholder="Cerca Analisi..." value={analysisSearchTerm} onChange={e => setAnalysisSearchTerm(e.target.value)} className="w-full pl-3 pr-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm outline-none focus:ring-1 focus:ring-purple-400" />
                  </div>
                  <div className="p-2 space-y-2">
                    {filteredAnalyses.map(analysis => (
                        <div key={analysis.id} className="bg-white p-3 rounded border border-gray-200 shadow-sm hover:border-purple-300 transition-all cursor-pointer" onClick={() => { setEditingAnalysis(analysis); setIsAnalysisEditorOpen(true); }}>
                            <div className="flex justify-between mb-1"><span className="bg-purple-100 text-purple-700 font-bold font-mono text-[10px] px-1.5 py-0.5 rounded">{analysis.code}</span><span className="font-bold text-gray-800 text-sm">{formatCurrency(analysis.totalUnitPrice)}</span></div>
                            <p className="text-xs text-gray-600 line-clamp-2 leading-snug">{analysis.description}</p>
                        </div>
                    ))}
                  </div>
                </>
              )}
              <div className="mt-auto p-3 border-t bg-slate-100/50 sticky bottom-0" onClick={() => setSelectedCategoryCode('SUMMARY')}><button className={`w-full flex items-center p-2.5 rounded text-xs font-black uppercase tracking-wider transition-colors ${selectedCategoryCode === 'SUMMARY' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-white border border-transparent hover:border-slate-200'}`}><Layers className="w-4 h-4 mr-2" /> Riepilogo Generale</button></div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-[#f0f2f5] flex flex-col gap-4">
           {activeCategory && selectedCategoryCode !== 'SUMMARY' && viewMode === 'COMPUTO' && (
               <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 shadow-sm">
                         {/* LAYOUT RICHIESTO: NOME WBS A SINISTRA */}
                         <div className="flex items-center gap-3">
                             <div className="bg-[#2c3e50] text-white p-2.5 rounded-lg shadow-lg font-black text-xl">{activeCategory.code}</div>
                             <div><h2 className="text-lg font-black text-slate-800 uppercase tracking-tight max-w-[350px] truncate">{activeCategory.name}</h2><span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Capitolo Attivo</span></div>
                         </div>

                         {/* LAYOUT RICHIESTO: GATE E PIU A DESTRA */}
                         <div className="flex items-center gap-3">
                            <div className="w-[350px]">
                                <CategoryDropGate onDropContent={(raw) => {
                                    const p = parseDroppedContent(raw);
                                    if(p) updateState([...articles, {id: Math.random().toString(36).substr(2,9), categoryCode: selectedCategoryCode, code: p.code||'NP.001', description: p.description||'Import', unit: p.unit||'cad', unitPrice: p.unitPrice||0, laborRate: 0, measurements: [{id: Math.random().toString(36).substr(2,9), description: '', type: 'positive'}], quantity: 0}]);
                                }} isLoading={isProcessingDrop} categoryCode={activeCategory.code} />
                            </div>
                            <button onClick={() => setIsImportAnalysisModalOpen(true)} className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xl hover:scale-110 transition-transform hover:bg-blue-700 flex-shrink-0" title="Aggiungi Voce">
                                <Plus className="w-7 h-7" />
                            </button>
                         </div>
                    </div>
               </div>
           )}

           <div className="bg-white rounded-xl shadow-2xl border border-gray-300 min-h-full flex flex-col overflow-hidden">
              {viewMode === 'ANALISI' ? (
                  <div className="flex flex-col items-center justify-center h-full p-10">
                      <div className="text-center max-w-lg">
                          <TestTubes className="w-16 h-16 text-purple-500 mx-auto mb-4" />
                          <h2 className="text-2xl font-bold mb-2">Editor Analisi Prezzi</h2>
                          <p className="text-gray-500 mb-6">Usa il menu laterale per selezionare un'analisi esistente o crearne una nuova.</p>
                          <button onClick={() => { setEditingAnalysis(null); setIsAnalysisEditorOpen(true); }} className="bg-purple-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-purple-700 transition-colors shadow-lg">Inizia Nuova Analisi</button>
                      </div>
                  </div>
              ) : selectedCategoryCode === 'SUMMARY' ? (
                  <div className="p-8"><Summary totals={totals} info={projectInfo} categories={categories} articles={articles} /></div>
              ) : activeCategory ? (
                  <div className="flex flex-col h-full flex-1">
                      <div className="flex-1 overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <TableHeader activeColumn={null} />
                            {activeArticles.length === 0 ? (
                                <tbody><tr><td colSpan={12} className="p-24 text-center text-slate-300 italic font-medium">Trascina una voce nel rettangolo superiore o clicca (+) per iniziare</td></tr></tbody>
                            ) : (
                                activeArticles.map((art, idx) => (
                                    <ArticleGroup key={art.id} article={art} index={idx} allArticles={articles} isPrintMode={false} isCategoryLocked={activeCategory.isLocked} onUpdateArticle={()=>{}} onEditArticleDetails={setEditingArticle} onDeleteArticle={(id)=>updateState(articles.filter(a=>a.id!==id))} onAddMeasurement={(id)=>updateState(articles.map(a=>a.id===id?{...a,measurements:[...a.measurements,{id:Math.random().toString(36).substr(2,9),description:'',type:'positive' as const}]}:a))} onAddSubtotal={()=>{}} onAddVoiceMeasurement={()=>{}} onUpdateMeasurement={(aid,mid,f,v)=>updateState(articles.map(a=>a.id===aid?{...a,measurements:a.measurements.map(m=>m.id===mid?{...m,[f]:v}:m)}:a))} onDeleteMeasurement={(aid,mid)=>updateState(articles.map(a=>a.id===aid?{...a,measurements:a.measurements.filter(m=>m.id!==mid)}:a))} onToggleDeduction={()=>{}} onOpenLinkModal={()=>{}} onScrollToArticle={()=>{}} onReorderMeasurements={()=>{}} onArticleDragStart={(e,art)=>e.dataTransfer.setData('articleId',art.id)} onArticleDrop={()=>{}} onArticleDragEnd={()=>{}} lastAddedMeasurementId={null} onColumnFocus={()=>{}} onViewAnalysis={()=>{}} onInsertExternalArticle={()=>{}} onToggleArticleLock={(id)=>updateState(articles.map(a=>a.id===id?{...a,isLocked:!a.isLocked}:a))} />
                                ))
                            )}
                        </table>
                      </div>
                  </div>
              ) : null}
           </div>
        </div>
      </div>
      
      <ProjectSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} info={projectInfo} onSave={(i)=>setProjectInfo(i)} />
      {editingArticle && <ArticleEditModal isOpen={!!editingArticle} onClose={()=>setEditingArticle(null)} article={editingArticle} onSave={(id,u)=>updateState(articles.map(a=>a.id===id?{...a,...u}:a))} />}
      <CategoryEditModal isOpen={isCategoryModalOpen} onClose={()=>setIsCategoryModalOpen(false)} onSave={(n)=>{ if(editingCategory) setCategories(categories.map(c=>c.code===editingCategory.code?{...c,name:n}:c)); else setCategories([...categories,{code:`WBS.${(categories.length+1).toString().padStart(2,'0')}`,name:n,isEnabled:true,isLocked:false}]); }} initialData={editingCategory} />
      <ImportAnalysisModal isOpen={isImportAnalysisModalOpen} onClose={()=>setIsImportAnalysisModalOpen(false)} analyses={analyses} onImport={(an)=>{ updateState([...articles, {id: Math.random().toString(36).substr(2,9), categoryCode: selectedCategoryCode, code: an.code, description: an.description, unit: an.unit, unitPrice: an.totalUnitPrice, laborRate: 0, measurements: [{id: Math.random().toString(36).substr(2,9), description: '', type: 'positive'}], quantity: 0}]); setIsImportAnalysisModalOpen(false); }} />
      <AnalysisEditorModal isOpen={isAnalysisEditorOpen} onClose={() => setIsAnalysisEditorOpen(false)} analysis={editingAnalysis} onSave={(an) => { let newAnalyses = [...analyses]; const idx = newAnalyses.findIndex(a => a.id === an.id); if (idx !== -1) newAnalyses[idx] = an; else newAnalyses.push(an); setAnalyses(newAnalyses); }} />
    </div>
  );
};

export default App;
