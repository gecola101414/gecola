
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Calculator, LayoutDashboard, FolderOpen, Minus, XCircle, ChevronRight, Settings, PlusCircle, MinusCircle, Link as LinkIcon, ExternalLink, Undo2, Redo2, PenLine, MapPin, Lock, Unlock, Lightbulb, LightbulbOff, Edit2, FolderPlus, GripVertical, Mic, Sigma, Save, FileSignature, CheckCircle2, Loader2, Cloud, Share2, FileText, ChevronDown, TestTubes, Search, Coins, ArrowRightLeft, Copy, Move, LogOut, AlertTriangle, ShieldAlert, Award, User, BookOpen, Edit3, Paperclip, MousePointerClick, AlignLeft, Layers, Sparkles } from 'lucide-react';
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
import BulkGeneratorModal from './components/BulkGeneratorModal';
import { parseDroppedContent, parseVoiceMeasurement, generateBulkItems } from './services/geminiService';
import { generateComputoMetricPdf, generateElencoPrezziPdf, generateManodoperaPdf, generateAnalisiPrezziPdf } from './services/pdfGenerator';

// --- Global Helpers ---
type ViewMode = 'COMPUTO' | 'ANALISI';
interface Snapshot { articles: Article[]; categories: Category[]; analyses: PriceAnalysis[]; }

const formatCurrency = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
const formatNumber = (val: number | undefined) => (val === undefined || val === null || val === 0) ? '' : val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const getWbsNumber = (code: string) => { const match = code.match(/WBS\.(\d+)/); return match ? parseInt(match[1], 10) : code; };
const roundTwoDecimals = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

// --- Engine di Calcolo Originale ---
const calculateRowValue = (m: Measurement, linkedValue: number = 0): number => {
  if (m.type === 'subtotal') return 0;
  if (m.linkedArticleId) {
    const mult = m.multiplier === undefined ? 1 : m.multiplier;
    return (linkedValue || 0) * mult * (m.type === 'deduction' ? -1 : 1);
  }
  const factors = [m.length, m.width, m.height].filter(v => v !== undefined && v !== 0 && v !== null);
  const base = factors.length > 0 ? factors.reduce((a, b) => (a || 1) * (b || 1), 1) : 0;
  let mult = (m.multiplier !== undefined) ? m.multiplier : (factors.length > 0 ? 1 : 0);
  const val = ((factors.length === 0 && mult !== 0) ? 1 : base) * mult;
  return m.type === 'deduction' ? -val : val;
};

const resolveArticleQuantity = (id: string, map: Map<string, Article>, visited: Set<string> = new Set()): number => {
  if (visited.has(id)) return 0;
  visited.add(id);
  const art = map.get(id);
  if (!art) return 0;
  return art.measurements.reduce((sum, m) => {
    let rowVal = 0;
    if (m.linkedArticleId) {
       const srcQty = resolveArticleQuantity(m.linkedArticleId, map, new Set(visited));
       let base = srcQty;
       if (m.linkedType === 'amount') { const src = map.get(m.linkedArticleId); if (src) base = srcQty * src.unitPrice; }
       rowVal = calculateRowValue(m, base);
    } else { rowVal = calculateRowValue(m); }
    return sum + rowVal;
  }, 0);
};

const recalculateAllArticles = (articles: Article[]): Article[] => {
  const map = new Map(articles.map(a => [a.id, a]));
  return articles.map(art => ({ ...art, quantity: resolveArticleQuantity(art.id, map) }));
};

// --- Componenti Tabella ---
const TableHeader: React.FC<{ activeColumn: string | null }> = ({ activeColumn }) => (
  <thead className="bg-[#f8f9fa] border-b border-black text-[9px] uppercase font-bold text-gray-800 sticky top-0 z-20 shadow-sm">
    <tr>
      <th className="py-1 px-1 text-center w-[35px] border-r border-gray-300">N.</th>
      <th className="py-1 px-1 text-left w-[100px] border-r border-gray-300">Tariffa</th>
      <th className={`py-1 px-1 text-left min-w-[250px] border-r border-gray-300 ${activeColumn === 'desc' ? 'bg-blue-50' : ''}`}>Designazione dei Lavori</th>
      <th className="py-1 px-1 text-center w-[45px] border-r border-gray-300">Par.Ug</th>
      <th className="py-1 px-1 text-center w-[55px] border-r border-gray-300">Lung.</th>
      <th className="py-1 px-1 text-center w-[55px] border-r border-gray-300">Largh.</th>
      <th className="py-1 px-1 text-center w-[55px] border-r border-gray-300">H/Peso</th>
      <th className="py-1 px-1 text-center w-[70px] border-r border-gray-300 bg-gray-100">Quantità</th>
      <th className="py-1 px-1 text-right w-[80px] border-r border-gray-300">Prezzo €</th>
      <th className="py-1 px-1 text-right w-[90px] border-r border-gray-300">Importo €</th>
      <th className="py-1 px-1 text-right w-[80px] border-r border-gray-300">M.O. €</th>
      <th className="py-1 px-1 text-center w-[50px] print:hidden text-gray-400">Cmd</th>
    </tr>
  </thead>
);

interface ArticleGroupProps {
  article: Article;
  index: number;
  allArticles: Article[];
  isPrintMode: boolean;
  isCategoryLocked?: boolean;
  onUpdateArticle: (id: string, field: keyof Article, value: any) => void;
  onEditArticleDetails: (article: Article) => void;
  onDeleteArticle: (id: string) => void;
  onAddMeasurement: (articleId: string) => void;
  onAddSubtotal: (articleId: string) => void;
  onUpdateMeasurement: (articleId: string, mId: string, field: keyof Measurement, value: any) => void;
  onDeleteMeasurement: (articleId: string, mId: string) => void;
  onToggleDeduction: (articleId: string, mId: string) => void;
  onOpenLinkModal: (articleId: string, measurementId: string) => void;
  onScrollToArticle: (id: string) => void;
  onArticleDragStart: (e: React.DragEvent, article: Article) => void;
  onArticleDrop: (e: React.DragEvent, targetArticleId: string, position: 'top' | 'bottom') => void;
  onArticleDragEnd: () => void;
  lastAddedMeasurementId: string | null;
  onColumnFocus: (col: string | null) => void;
  onViewAnalysis: (analysisId: string) => void;
  onToggleArticleLock: (id: string) => void;
}

const ArticleGroup: React.FC<ArticleGroupProps> = (props) => {
   const { article, index, allArticles, isPrintMode, isCategoryLocked, onUpdateArticle, onEditArticleDetails, onDeleteArticle, onAddMeasurement, onAddSubtotal, onUpdateMeasurement, onDeleteMeasurement, onToggleDeduction, onOpenLinkModal, onScrollToArticle, onArticleDragStart, onArticleDrop, onArticleDragEnd, lastAddedMeasurementId, onColumnFocus, onViewAnalysis, onToggleArticleLock } = props;
   const [isArticleDragOver, setIsArticleDragOver] = useState(false);
   const [articleDropPosition, setArticleDropPosition] = useState<'top' | 'bottom' | null>(null);
   const isArticleLocked = article.isLocked || false;
   const areControlsDisabled = isCategoryLocked || isArticleLocked;

   let runningPartialSum = 0;
   const processedMeasurements = article.measurements.map(m => {
        let val = 0;
        if (m.type !== 'subtotal') {
            if (m.linkedArticleId) {
                const linkedArt = allArticles.find(a => a.id === m.linkedArticleId);
                if (linkedArt) {
                    const baseVal = m.linkedType === 'amount' ? (linkedArt.quantity * linkedArt.unitPrice) : linkedArt.quantity;
                    val = calculateRowValue(m, baseVal);
                }
            } else { val = calculateRowValue(m); }
        }
        let displayValue = 0;
        if (m.type === 'subtotal') { displayValue = runningPartialSum; runningPartialSum = 0; }
        else { displayValue = val; runningPartialSum += val; }
        return { ...m, displayValue };
   });

   const hierarchicalNumber = `${getWbsNumber(article.categoryCode)}.${index + 1}`;
   const isAnalysisLinked = !!article.linkedAnalysisId;

   return (
      <tbody id={`article-${article.id}`} className={`bg-white border-b border-gray-400 relative ${isArticleLocked ? 'bg-gray-50' : ''}`}>
         {isArticleDragOver && articleDropPosition === 'top' && (
             <tr className="h-0 p-0 border-none"><td colSpan={12} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-green-500 -top-0.5 z-50 shadow-[0_0_8px_rgba(34,197,94,0.8)] pointer-events-none"></div></td></tr>
         )}
         <tr 
            className={`align-top ${!isPrintMode ? 'cursor-move hover:bg-slate-50' : ''} ${isArticleDragOver ? 'bg-green-50/10' : ''}`}
            draggable={!isPrintMode && !areControlsDisabled}
            onDragStart={(e) => onArticleDragStart(e, article)}
            onDragEnd={() => { onArticleDragEnd(); setArticleDropPosition(null); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsArticleDragOver(true); const rect = e.currentTarget.getBoundingClientRect(); setArticleDropPosition(e.clientY < (rect.top + rect.height/2) ? 'top' : 'bottom'); }}
            onDragLeave={() => setIsArticleDragOver(false)}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsArticleDragOver(false); onArticleDrop(e, article.id, articleDropPosition || 'bottom'); }}
         >
            <td className="text-center py-2 text-xs font-bold text-gray-500 border-r border-gray-200 font-mono">{hierarchicalNumber}</td>
            <td className="p-1 border-r border-gray-200 align-top">
                <div className="flex flex-col relative">
                    <textarea readOnly value={article.code} className={`font-mono font-bold text-xs w-full bg-transparent border-none px-1 resize-none leading-tight ${isAnalysisLinked ? 'text-purple-700' : ''}`} rows={2} disabled={true}/>
                    {article.priceListSource && <div className="text-[9px] text-gray-400 px-1 truncate">{article.priceListSource}</div>}
                    {isAnalysisLinked && <button onClick={() => article.linkedAnalysisId && onViewAnalysis(article.linkedAnalysisId)} className="absolute right-0 top-0 text-purple-500 hover:text-purple-700 p-0.5"><TestTubes className="w-3 h-3" /></button>}
                </div>
            </td>
            <td className="p-2 border-r border-gray-200">
                 <textarea readOnly value={article.description} className={`w-full min-h-[50px] text-sm text-gray-900 font-serif text-justify border-none focus:ring-0 bg-transparent resize-none p-1 ${isArticleLocked ? 'text-gray-400 italic' : ''}`} disabled={true}/>
            </td>
            <td colSpan={8} className="border-r border-gray-200"></td>
            <td className="print:hidden text-center align-top pt-2">
                {!isPrintMode && !isCategoryLocked && (
                   <div className="flex flex-col items-center space-y-1">
                      <button onClick={() => onToggleArticleLock(article.id)} className={`p-1 rounded ${isArticleLocked ? 'text-red-500 bg-red-50' : 'text-gray-300 hover:text-blue-500'}`}>{isArticleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}</button>
                      {!isArticleLocked && <><button onClick={() => onDeleteArticle(article.id)} className="text-gray-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button><button onClick={() => onEditArticleDetails(article)} className="text-gray-300 hover:text-blue-600"><PenLine className="w-4 h-4" /></button></>}
                   </div>
                )}
            </td>
         </tr>
         {processedMeasurements.map((m, idx) => (
            <tr key={m.id} className={`text-xs group/row cursor-default transition-all ${m.type === 'deduction' ? 'text-red-600' : 'text-gray-800'} ${m.type === 'subtotal' ? 'bg-yellow-50 font-bold' : 'bg-white'}`}>
                <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                <td className="pl-6 pr-2 py-1 border-r border-gray-200 relative">
                     {m.type === 'subtotal' ? <div className="italic text-gray-600 text-right pr-2">Sommano parziale</div> : (
                        <div className="flex items-center">
                             <div className="absolute left-0 top-1/2 w-4 h-[1px] bg-gray-300"></div>
                             {m.linkedArticleId ? (
                               <button onClick={() => onScrollToArticle(m.linkedArticleId!)} className="text-blue-600 font-bold hover:underline text-[11px]">Vedi voce collegata</button>
                             ) : (
                                <input value={m.description} autoFocus={m.id === lastAddedMeasurementId} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'description', e.target.value)} className="w-full bg-transparent border-none p-0 focus:ring-0" placeholder="Descrizione misura..." disabled={areControlsDisabled} />
                             )}
                        </div>
                     )}
                </td>
                <td className="border-r border-gray-200 p-0 bg-gray-50"><input type="number" disabled={areControlsDisabled} className="w-full text-center bg-transparent border-none text-xs" value={m.multiplier || ''} placeholder="1" onChange={(e) => onUpdateMeasurement(article.id, m.id, 'multiplier', e.target.value === '' ? undefined : parseFloat(e.target.value))} /></td>
                <td className="border-r border-gray-200 p-0 bg-gray-50"><input type="number" disabled={areControlsDisabled || !!m.linkedArticleId} className="w-full text-center bg-transparent border-none text-xs" value={m.length || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'length', e.target.value === '' ? undefined : parseFloat(e.target.value))} /></td>
                <td className="border-r border-gray-200 p-0 bg-gray-50"><input type="number" disabled={areControlsDisabled || !!m.linkedArticleId} className="w-full text-center bg-transparent border-none text-xs" value={m.width || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'width', e.target.value === '' ? undefined : parseFloat(e.target.value))} /></td>
                <td className="border-r border-gray-200 p-0 bg-gray-50"><input type="number" disabled={areControlsDisabled || !!m.linkedArticleId} className="w-full text-center bg-transparent border-none text-xs" value={m.height || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'height', e.target.value === '' ? undefined : parseFloat(e.target.value))} /></td>
                <td className={`border-r border-gray-200 text-right font-mono pr-1 ${m.type === 'subtotal' ? 'bg-yellow-100' : 'bg-white'}`}>{formatNumber(m.displayValue)}</td>
                <td colSpan={3} className="border-r border-gray-200"></td>
                <td className="text-center print:hidden bg-gray-50/50">
                    {!isPrintMode && !areControlsDisabled && (
                        <div className="flex justify-center items-center space-x-1 opacity-0 group-hover/row:opacity-100">
                            {m.type !== 'subtotal' && <><button onClick={() => onOpenLinkModal(article.id, m.id)} className={`rounded p-0.5 ${m.linkedArticleId ? 'bg-blue-600 text-white' : 'text-gray-300'}`}><LinkIcon className="w-3.5 h-3.5" /></button><button onClick={() => onToggleDeduction(article.id, m.id)} className={`p-0.5 ${m.type === 'positive' ? 'text-red-400' : 'text-blue-400'}`}>{m.type === 'positive' ? <MinusCircle className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5" />}</button></>}
                            <button onClick={() => onDeleteMeasurement(article.id, m.id)} className="text-gray-300 hover:text-red-500 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                    )}
                </td>
            </tr>
         ))}
         <tr className="bg-white font-bold text-xs border-t border-gray-300 border-b-2 border-gray-400">
             <td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td>
             <td className="px-2 py-2 text-right border-r border-gray-300 uppercase">Sommano {article.unit}</td>
             <td colSpan={4} className="border-r border-gray-200"></td>
             <td className="text-right pr-1 font-mono text-black border-t-4 border-double border-gray-800">{formatNumber(article.quantity)}</td>
             <td className="border-l border-r border-gray-300 text-right pr-1 font-mono">{formatNumber(article.unitPrice)}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-blue-900">{formatNumber(article.quantity * article.unitPrice)}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-gray-400 font-normal text-[9px]">{formatCurrency((article.quantity * article.unitPrice) * (article.laborRate / 100))}</td>
             <td className="text-center print:hidden bg-gray-50 align-middle">
                {!isPrintMode && !areControlsDisabled && (
                   <div className="flex items-center justify-center space-x-1">
                        <button onClick={() => onAddSubtotal(article.id)} className="w-5 h-5 rounded-full text-orange-400 border border-orange-200 flex items-center justify-center"><Sigma className="w-3 h-3" /></button>
                        <button onClick={() => onAddMeasurement(article.id)} className="w-6 h-6 rounded-full text-gray-500 border border-gray-300 hover:bg-slate-500 hover:text-white flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                   </div>
                )}
             </td>
         </tr>
         {isArticleDragOver && articleDropPosition === 'bottom' && (
             <tr className="h-0 p-0 border-none"><td colSpan={12} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-green-500 top-2 z-50 shadow-[0_0_8px_rgba(34,197,94,0.8)] pointer-events-none"></div></td></tr>
         )}
      </tbody>
   );
};

// --- App Principal ---
const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
  }, []);

  // CROSS-TAB DRAG & DROP BYPASS
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault(); 
      if (e.dataTransfer) { e.dataTransfer.dropEffect = 'copy'; }
    };
    const handleGlobalDrop = (e: DragEvent) => { e.preventDefault(); };
    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('drop', handleGlobalDrop);
    return () => { window.removeEventListener('dragover', handleGlobalDragOver); window.removeEventListener('drop', handleGlobalDrop); };
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>('COMPUTO');
  const [categories, setCategories] = useState<Category[]>(CATEGORIES);
  const [articles, setArticles] = useState<Article[]>(INITIAL_ARTICLES);
  const [analyses, setAnalyses] = useState<PriceAnalysis[]>(INITIAL_ANALYSES);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(PROJECT_INFO);
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>(CATEGORIES[0]?.code || 'WBS.01');
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<{articleId: string, measurementId: string} | null>(null);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [draggedCategoryCode, setDraggedCategoryCode] = useState<string | null>(null);
  const [wbsDropTarget, setWbsDropTarget] = useState<{ code: string, position: 'top' | 'bottom' | 'inside' } | null>(null);
  const [isAnalysisEditorOpen, setIsAnalysisEditorOpen] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState<PriceAnalysis | null>(null);
  const [isImportAnalysisModalOpen, setIsImportAnalysisModalOpen] = useState(false);
  const [lastAddedMeasurementId, setLastAddedMeasurementId] = useState<string | null>(null);
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');

  const generateNextWbsCode = (cats: Category[]) => `WBS.${(cats.length + 1).toString().padStart(2, '0')}`;
  const renumberCategories = (cats: Category[], arts: Article[]) => {
      const map: Record<string, string> = {};
      const newCats = cats.map((c, i) => { const n = `WBS.${(i+1).toString().padStart(2, '0')}`; map[c.code] = n; return { ...c, code: n }; });
      const newArts = arts.map(a => map[a.categoryCode] ? { ...a, categoryCode: map[a.categoryCode] } : a);
      return { newCats, newArts };
  };

  const updateState = (newArticles: Article[], newCategories: Category[] = categories, newAnalyses: PriceAnalysis[] = analyses) => {
      setHistory(prev => [...prev, { articles, categories, analyses }].slice(-50));
      setFuture([]);
      setArticles(recalculateAllArticles(newArticles));
      setCategories(newCategories);
      setAnalyses(newAnalyses);
  };

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture(f => [{ articles, categories, analyses }, ...f]);
    setHistory(h => h.slice(0, -1));
    setArticles(prev.articles); setCategories(prev.categories); setAnalyses(prev.analyses);
  }, [history, articles, categories, analyses]);

  const activeCategory = useMemo(() => categories.find(c => c.code === selectedCategoryCode), [categories, selectedCategoryCode]);
  const activeArticles = useMemo(() => articles.filter(a => a.categoryCode === selectedCategoryCode), [articles, selectedCategoryCode]);
  const filteredAnalyses = useMemo(() => analyses.filter(a => a.code.toLowerCase().includes(analysisSearchTerm.toLowerCase()) || a.description.toLowerCase().includes(analysisSearchTerm.toLowerCase())), [analyses, analysisSearchTerm]);
  
  const categoryTotals = useMemo(() => {
    const lookup: Record<string, number> = {};
    categories.forEach(cat => { lookup[cat.code] = articles.filter(a => a.categoryCode === cat.code).reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0); });
    return lookup;
  }, [articles, categories]);

  const totals = useMemo(() => {
    const totalWorks = articles.reduce((acc, art) => { const cat = categories.find(c => c.code === art.categoryCode); return (cat && cat.isEnabled !== false) ? acc + (art.quantity * art.unitPrice) : acc; }, 0);
    const safety = totalWorks * (projectInfo.safetyRate / 100);
    const tax = totalWorks + safety;
    return { totalWorks, safetyCosts: safety, totalTaxable: tax, vatAmount: tax * (projectInfo.vatRate / 100), grandTotal: tax * (1 + projectInfo.vatRate / 100) };
  }, [articles, categories, projectInfo]);

  // LOGICA CROSS-TAB WBS BUNDLE
  const handleWbsDragStart = (e: React.DragEvent, code: string) => { 
      e.dataTransfer.effectAllowed = 'all'; 
      e.dataTransfer.setData('text/uri-list', window.location.href);
      setDraggedCategoryCode(code); 
      const cat = categories.find(c => c.code === code);
      if (cat) {
          const catArticles = articles.filter(a => a.categoryCode === code);
          const relatedAnalyses = analyses.filter(an => catArticles.some(art => art.linkedAnalysisId === an.id));
          const bundle = { type: 'CROSS_TAB_WBS_BUNDLE', category: cat, articles: catArticles, analyses: relatedAnalyses };
          e.dataTransfer.setData('text/plain', JSON.stringify(bundle));
      }
  };

  const handleWbsDragOver = (e: React.DragEvent, targetCode: string | null) => { 
    e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy';
    if (!targetCode) return;
    if (draggedCategoryCode && draggedCategoryCode !== targetCode) { 
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); 
        setWbsDropTarget({ code: targetCode, position: e.clientY < (rect.top + rect.height/2) ? 'top' : 'bottom' }); 
    } else { setWbsDropTarget({ code: targetCode, position: 'inside' }); }
  };

  const handleWbsDrop = (e: React.DragEvent, targetCode: string | null) => { 
      e.preventDefault(); e.stopPropagation(); setWbsDropTarget(null); 
      const artId = e.dataTransfer.getData('articleId');
      if (artId && targetCode) { updateState(articles.map(a => a.id === artId ? { ...a, categoryCode: targetCode } : a)); return; }

      const textData = e.dataTransfer.getData('text/plain');
      if (textData) {
          try {
              const payload = JSON.parse(textData);
              if (payload && payload.type === 'CROSS_TAB_WBS_BUNDLE') {
                  const { category: importedCat, articles: importedArticles, analyses: importedAnalyses } = payload;
                  const newCatCode = generateNextWbsCode(categories);
                  const analysisIdMap = new Map<string, string>();
                  const newAnalysesList = [...analyses];
                  if (importedAnalyses) {
                      importedAnalyses.forEach((an: PriceAnalysis) => {
                          const nid = Math.random().toString(36).substr(2, 9);
                          let nCode = an.code; if (analyses.some(ex => ex.code === nCode)) nCode += "-Clonata";
                          analysisIdMap.set(an.id, nid);
                          newAnalysesList.push({ ...an, id: nid, code: nCode, components: an.components.map(c => ({...c, id: Math.random().toString(36).substr(2,9)})) });
                      });
                  }
                  const newArticles = importedArticles.map((art: Article) => {
                      const nid = Math.random().toString(36).substr(2, 9);
                      let nLid = art.linkedAnalysisId; if (nLid && analysisIdMap.has(nLid)) nLid = analysisIdMap.get(nLid);
                      return { ...art, id: nid, categoryCode: newCatCode, linkedAnalysisId: nLid, measurements: art.measurements.map(m => ({ ...m, id: Math.random().toString(36).substr(2,9), linkedArticleId: undefined })) };
                  });
                  updateState([...articles, ...newArticles], [...categories, { ...importedCat, code: newCatCode, name: importedCat.name + " (Import)" }], newAnalysesList);
                  setSelectedCategoryCode(newCatCode);
                  return;
              }
          } catch (e) { /* non è un bundle */ }
      }
      if (draggedCategoryCode && targetCode && draggedCategoryCode !== targetCode) {
          const sIdx = categories.findIndex(c => c.code === draggedCategoryCode);
          let tIdx = categories.findIndex(c => c.code === targetCode);
          const nCats = [...categories]; const [moved] = nCats.splice(sIdx, 1);
          if (wbsDropTarget?.position === 'bottom') tIdx++;
          nCats.splice(tIdx, 0, moved);
          const res = renumberCategories(nCats, articles); updateState(res.newArts, res.newCats);
      }
      setDraggedCategoryCode(null);
  };

  const handleUpdateArticle = (id: string, field: keyof Article, val: any) => updateState(articles.map(a => a.id === id ? { ...a, [field]: val } : a));
  const handleAddMeasurement = (aid: string) => { 
    if (aid === 'NEW_ARTICLE') {
        const nid = Math.random().toString(36).substr(2,9);
        const nArt: Article = { id: nid, categoryCode: selectedCategoryCode, code: 'NP.000', description: 'Nuova voce di lavoro', unit: 'cad', unitPrice: 0, laborRate: 0, quantity: 0, measurements: [{id: Math.random().toString(36).substr(2,9), description: 'Voce inserita a mano', type: 'positive'}] };
        updateState([...articles, nArt]);
    } else {
        const mid = Math.random().toString(36).substr(2,9); setLastAddedMeasurementId(mid); 
        updateState(articles.map(a => a.id === aid ? { ...a, measurements: [...a.measurements, {id: mid, description: '', type: 'positive'}] } : a)); 
    }
  };

  const handleDeleteArticle = (id: string) => window.confirm("Eliminare?") && updateState(articles.filter(a => a.id !== id));
  const handleDeleteAnalysis = (id: string) => window.confirm("Eliminare analisi?") && updateState(articles.map(a => a.linkedAnalysisId === id ? {...a, linkedAnalysisId: undefined} : a), categories, analyses.filter(an => an.id !== id));

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-slate-800 text-white"><Loader2 className="animate-spin mr-2"/> Caricamento Sistema GeCoLa...</div>;
  if (!user) return <Login />;

  return (
    <div className="h-screen flex flex-col bg-[#e8eaed] font-sans overflow-hidden text-slate-800" onDragOver={(e) => handleWbsDragOver(e, null)} onDrop={(e) => handleWbsDrop(e, null)}>
      {/* Navbar Originale */}
      <div className="bg-[#2c3e50] shadow-md z-50 h-14 flex items-center justify-between px-6 border-b border-slate-600">
          <div className="flex items-center space-x-3 w-64 flex-shrink-0">
              <div className="bg-orange-500 p-1.5 rounded-lg shadow-lg"><Calculator className="text-white w-5 h-5"/></div>
              <span className="font-bold text-white text-lg">GeCoLa <span className="font-light opacity-80 text-xs">v3.0</span></span>
          </div>
          <div className="flex-1 flex justify-center">
              <div className="bg-slate-800/50 px-4 py-1 rounded-full text-white font-bold text-sm truncate max-w-[400px] border border-slate-700 shadow-inner">
                  {projectInfo.title}
              </div>
          </div>
          <div className="flex items-center space-x-3 w-64 justify-end">
              <button onClick={() => setIsSaveModalOpen(true)} className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-all"><Share2 className="w-5 h-5"/></button>
              <button onClick={() => setIsSettingsModalOpen(true)} className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-all"><Settings className="w-5 h-5"/></button>
              <button onClick={() => signOut(auth)} className="p-1.5 text-red-400 hover:text-white hover:bg-red-600 rounded ml-2 transition-all"><LogOut className="w-5 h-5"/></button>
          </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Originale con Drag & Drop abilitato */}
        <div className="w-64 bg-white border-r border-slate-300 flex flex-col z-10 shadow-lg">
          <div className="p-3 bg-slate-50 border-b flex gap-1">
              <button onClick={() => setViewMode('COMPUTO')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${viewMode === 'COMPUTO' ? 'bg-white text-blue-700 shadow-md border border-blue-100' : 'text-slate-500 hover:bg-slate-100'}`}>Computo</button>
              <button onClick={() => setViewMode('ANALISI')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${viewMode === 'ANALISI' ? 'bg-white text-purple-700 shadow-md border border-purple-100' : 'text-slate-500 hover:bg-slate-100'}`}>Analisi</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {viewMode === 'COMPUTO' ? (
                <div className="flex flex-col h-full">
                    <ul className="py-2 flex-1">
                        <li key="summary-link">
                            <button onClick={() => setSelectedCategoryCode('SUMMARY')} className={`w-full text-left pl-3 pr-2 py-3 border-l-4 transition-all flex items-center gap-3 ${selectedCategoryCode === 'SUMMARY' ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
                                <LayoutDashboard className="w-4 h-4" />
                                <span className="text-xs uppercase tracking-wider">Quadro Riepilogo</span>
                            </button>
                        </li>
                        {categories.map(cat => (
                            <li key={cat.code} className="relative group/cat" onDragOver={(e) => handleWbsDragOver(e, cat.code)} onDrop={(e) => handleWbsDrop(e, cat.code)}>
                                {wbsDropTarget?.code === cat.code && wbsDropTarget.position === 'top' && <div className="absolute top-0 left-0 right-0 h-1 bg-green-500 z-50 shadow-[0_0_8px_green]" />}
                                <div draggable onDragStart={(e) => handleWbsDragStart(e, cat.code)} onDragEnd={() => setDraggedCategoryCode(null)} className="cursor-grab active:cursor-grabbing">
                                    <button onClick={() => setSelectedCategoryCode(cat.code)} className={`w-full text-left pl-3 pr-2 py-2 border-l-4 transition-all ${selectedCategoryCode === cat.code ? 'bg-blue-50 border-blue-500' : 'border-transparent hover:bg-slate-50'}`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2"><GripVertical className="w-3 h-3 text-gray-300"/><span className="text-[9px] font-bold font-mono px-1.5 bg-slate-200 rounded text-slate-600">{cat.code}</span></div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover/cat:opacity-100 transition-opacity">
                                                <button onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); setIsCategoryModalOpen(true); }} className="p-1 text-blue-400 hover:text-blue-600"><Edit2 className="w-3 h-3"/></button>
                                                <button onClick={(e) => { e.stopPropagation(); if(window.confirm("Eliminare capitolo?")) { const nCats = categories.filter(c => c.code !== cat.code); const res = renumberCategories(nCats, articles.filter(a => a.categoryCode !== cat.code)); updateState(res.newArts, res.newCats); } }} className="p-1 text-red-300 hover:text-red-500"><Trash2 className="w-3 h-3"/></button>
                                            </div>
                                        </div>
                                        <div className="pl-5 text-xs font-medium truncate text-slate-800">{cat.name}</div>
                                        <div className="pl-5 text-[10px] font-mono text-blue-600">{formatCurrency(categoryTotals[cat.code] || 0)}</div>
                                    </button>
                                </div>
                                {wbsDropTarget?.code === cat.code && wbsDropTarget.position === 'bottom' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-500 z-50 shadow-[0_0_8px_green]" />}
                            </li>
                        ))}
                    </ul>
                    <div className="p-4 border-t bg-slate-50">
                        <button onClick={() => { setEditingCategory(null); setIsCategoryModalOpen(true); }} className="w-full flex items-center justify-center gap-2 bg-white border border-dashed border-slate-300 text-slate-500 py-2 rounded-lg text-xs font-bold hover:border-blue-400 hover:text-blue-600 transition-all"><Plus className="w-4 h-4" /> NUOVA WBS</button>
                    </div>
                </div>
            ) : (
                <div className="p-2 space-y-2">
                    <div className="flex gap-1 mb-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-slate-400" />
                            <input value={analysisSearchTerm} onChange={e => setAnalysisSearchTerm(e.target.value)} placeholder="Cerca analisi..." className="w-full pl-7 pr-2 py-1.5 bg-slate-100 rounded text-xs border-none focus:ring-1 focus:ring-purple-400 outline-none" />
                        </div>
                        <button onClick={() => { setEditingAnalysis(null); setIsAnalysisEditorOpen(true); }} className="bg-purple-600 text-white p-1.5 rounded shadow-sm hover:bg-purple-700 transition-colors"><Plus className="w-4 h-4"/></button>
                    </div>
                    {filteredAnalyses.map(an => (
                        <div key={an.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', `ANALYSIS_BUNDLE::${JSON.stringify(an)}`); e.dataTransfer.effectAllowed = 'copy'; }} className="bg-white p-3 rounded border border-slate-200 shadow-sm hover:border-purple-300 hover:shadow-md transition-all cursor-grab group">
                            <div className="flex justify-between font-bold text-[10px] text-purple-700 mb-1"><span>{an.code}</span><span className="font-mono">{formatCurrency(an.totalUnitPrice)}</span></div>
                            <p className="text-[11px] text-slate-600 line-clamp-2 leading-tight">{an.description}</p>
                            <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setEditingAnalysis(an); setIsAnalysisEditorOpen(true); }} className="flex-1 text-[9px] bg-purple-50 text-purple-700 py-1 rounded font-bold hover:bg-purple-100">MODIFICA</button>
                                <button onClick={() => handleDeleteAnalysis(an.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3 h-3"/></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>

        {/* Content Principale Originale */}
        <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] p-4 relative">
           <div className="flex-1 overflow-y-auto bg-white shadow-xl border border-gray-300 rounded-xl flex flex-col">
              {selectedCategoryCode === 'SUMMARY' ? (
                <div className="p-8 max-w-6xl mx-auto w-full"><Summary totals={totals} info={projectInfo} categories={categories} articles={articles} /></div>
              ) : activeCategory ? (
                <div className="flex flex-col h-full">
                  <div className="p-4 bg-gray-50 border-b flex items-center justify-between sticky top-0 z-30">
                      <div className="flex items-center gap-3">
                          <div className="bg-white border border-slate-200 p-2 rounded shadow-sm text-center min-w-[60px]">
                              <span className="text-[10px] text-slate-400 font-bold block uppercase leading-none mb-1">WBS</span>
                              <span className="text-2xl font-black text-slate-800 leading-none">{activeCategory.code}</span>
                          </div>
                          <div>
                            <h2 className="text-lg font-bold uppercase truncate max-w-[400px] text-slate-800">{activeCategory.name}</h2>
                            <div className="text-xs text-blue-600 font-mono font-bold">{formatCurrency(categoryTotals[activeCategory.code] || 0)}</div>
                          </div>
                      </div>
                      <div className="flex items-center gap-4 w-[450px]">
                          <div className="flex-1"><CategoryDropGate onDropContent={(txt) => { const p = parseDroppedContent(txt); if(p) updateState([...articles, { ...p, id: Math.random().toString(36).substr(2,9), categoryCode: activeCategory.code, measurements: [{id: Math.random().toString(36).substr(2,9), description: '', type: 'positive'}] } as Article]) }} isLoading={false} categoryCode={activeCategory.code} /></div>
                          <div className="flex gap-2">
                             <button onClick={() => setIsImportAnalysisModalOpen(true)} className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg hover:bg-purple-700 transition-all" title="Aggiungi da Analisi"><TestTubes className="w-5 h-5"/></button>
                             <button onClick={() => handleAddMeasurement('NEW_ARTICLE')} className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg hover:bg-blue-700 transition-all" title="Aggiungi Voce Libera"><Plus/></button>
                          </div>
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                      <table className="w-full text-left border-collapse min-w-[1000px]">
                          <TableHeader activeColumn={activeColumn}/>
                          {activeArticles.map((art, idx) => (
                            <ArticleGroup key={art.id} article={art} index={idx} allArticles={articles} isPrintMode={false} isCategoryLocked={activeCategory.isLocked} onUpdateArticle={handleUpdateArticle} onEditArticleDetails={setEditingArticle} onDeleteArticle={handleDeleteArticle} onAddMeasurement={handleAddMeasurement} onAddSubtotal={(aid) => updateState(articles.map(a => a.id === aid ? {...a, measurements: [...a.measurements, {id: Math.random().toString(36).substr(2,9), description: 'Sommano parziale', type: 'subtotal'}]} : a))} onUpdateMeasurement={(aid, mid, f, v) => updateState(articles.map(a => a.id === aid ? {...a, measurements: a.measurements.map(m => m.id === mid ? {...m, [f]: v} : m)} : a))} onDeleteMeasurement={(aid, mid) => updateState(articles.map(a => a.id === aid ? {...a, measurements: a.measurements.filter(m => m.id !== mid)} : a))} onToggleDeduction={(aid, mid) => updateState(articles.map(a => a.id === aid ? {...a, measurements: a.measurements.map(m => m.id === mid ? {...m, type: m.type === 'positive' ? 'deduction' : 'positive'} : m)} : a))} onOpenLinkModal={(aid, mid) => setLinkTarget({articleId: aid, measurementId: mid})} onScrollToArticle={(id) => { const el = document.getElementById(`article-${id}`); if(el) el.scrollIntoView({behavior:'smooth', block: 'center'}); }} onArticleDragStart={(e, a) => { e.dataTransfer.setData('articleId', a.id); e.dataTransfer.effectAllowed = 'copyMove'; }} onArticleDrop={() => {}} onArticleDragEnd={() => {}} lastAddedMeasurementId={lastAddedMeasurementId} onColumnFocus={setActiveColumn} onViewAnalysis={(id) => { const a = analyses.find(x => x.id === id); if(a) {setEditingAnalysis(a); setIsAnalysisEditorOpen(true);}}} onToggleArticleLock={(id) => updateState(articles.map(a => a.id === id ? {...a, isLocked: !a.isLocked} : a))} />
                          ))}
                      </table>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-10 bg-slate-50/50">
                    <FolderOpen className="w-20 h-20 text-blue-100 mb-6" />
                    <h2 className="text-2xl font-bold text-slate-800">Software GeCoLa AI Professional</h2>
                    <p className="text-slate-500 max-w-md mt-2">Seleziona una WBS o visualizza il Quadro Economico Generale.</p>
                </div>
              )}
           </div>
           
           <div className="absolute bottom-8 right-8 flex flex-col gap-3 print:hidden">
                <button onClick={handleUndo} disabled={history.length === 0} className="w-12 h-12 bg-white rounded-full shadow-xl flex items-center justify-center text-slate-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-110"><Undo2 className="w-5 h-5"/></button>
                <button onClick={() => generateComputoMetricPdf(projectInfo, categories, articles)} className="w-12 h-12 bg-red-600 rounded-full shadow-xl flex items-center justify-center text-white hover:bg-red-700 transition-all hover:scale-110" title="Esporta PDF"><FileText className="w-5 h-5"/></button>
           </div>
        </div>
      </div>

      {/* Modali Originali */}
      <ProjectSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} info={projectInfo} onSave={(info) => {setProjectInfo(info); updateState(articles, categories, analyses);}} />
      <CategoryEditModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} onSave={editingCategory ? (name) => updateState(articles, categories.map(c => c.code === editingCategory.code ? {...c, name} : c)) : (name) => { const nCode = generateNextWbsCode(categories); updateState(articles, [...categories, {code: nCode, name, isEnabled: true, isLocked: false}]); setSelectedCategoryCode(nCode); }} initialData={editingCategory} nextWbsCode={generateNextWbsCode(categories)} />
      <SaveProjectModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} articles={articles} categories={categories} projectInfo={projectInfo} />
      <AnalysisEditorModal isOpen={isAnalysisEditorOpen} onClose={() => setIsAnalysisEditorOpen(false)} analysis={editingAnalysis} onSave={(an) => { let list = [...analyses]; const i = list.findIndex(x => x.id === an.id); if(i!==-1) list[i]=an; else list.push(an); setAnalyses(list); updateState(articles.map(a => a.linkedAnalysisId === an.id ? {...a, description: an.description, unitPrice: roundTwoDecimals(an.totalUnitPrice), laborRate: an.totalBatchValue > 0 ? parseFloat(((an.totalLabor / an.totalBatchValue) * 100).toFixed(2)) : 0 } : a), categories, list); }} nextCode={`AP.${(analyses.length + 1).toString().padStart(2, '0')}`} />
      <ImportAnalysisModal isOpen={isImportAnalysisModalOpen} onClose={() => setIsImportAnalysisModalOpen(false)} analyses={analyses} onImport={(an) => { updateState([...articles, {id: Math.random().toString(36).substr(2,9), categoryCode: selectedCategoryCode, code: an.code, description: an.description, unit: an.unit, unitPrice: roundTwoDecimals(an.totalUnitPrice), laborRate: an.totalBatchValue > 0 ? parseFloat(((an.totalLabor / an.totalBatchValue) * 100).toFixed(2)) : 0, measurements: [{id: Math.random().toString(36).substr(2,9), description: '', type: 'positive'}], quantity: 0, linkedAnalysisId: an.id, priceListSource: `Analisi ${an.code}` }]); setIsImportAnalysisModalOpen(false); }} onCreateNew={() => { setIsImportAnalysisModalOpen(false); setEditingAnalysis(null); setIsAnalysisEditorOpen(true); }} />
      {editingArticle && <ArticleEditModal isOpen={!!editingArticle} onClose={() => setEditingArticle(null)} article={editingArticle} onSave={(id, up) => updateState(articles.map(a => a.id === id ? {...a, ...up} : a))} />}
      {linkTarget && <LinkArticleModal isOpen={!!linkTarget} onClose={() => setLinkTarget(null)} articles={articles} currentArticleId={linkTarget.articleId} onLink={(src, type) => { updateState(articles.map(a => a.id === linkTarget.articleId ? {...a, measurements: a.measurements.map(m => m.id === linkTarget.measurementId ? {...m, linkedArticleId: src.id, linkedType: type} : m)} : a)); setLinkTarget(null); }} />}
    </div>
  );
};
export default App;
