
// FIX: Added missing imports and ensured all components are present
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

// Strict Rounding Helper (2 decimals)
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
      if (factors.length > 0) {
          effectiveMultiplier = 1;
      } else if (m.length === undefined && m.width === undefined && m.height === undefined) {
          effectiveMultiplier = 0;
      }
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
         if (sourceArt) {
           finalSourceVal = sourceQty * sourceArt.unitPrice;
         }
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

// FIX: Added missing Types and TableHeader component
interface Snapshot {
  articles: Article[];
  categories: Category[];
  analyses: PriceAnalysis[];
}

type ViewMode = 'COMPUTO' | 'ANALISI';

interface TableHeaderProps {
    activeColumn: string | null;
}

const TableHeader: React.FC<TableHeaderProps> = ({ activeColumn }) => (
  <thead className="bg-[#f8f9fa] border-b border-black text-[9px] uppercase font-bold text-gray-800 sticky top-0 z-20 shadow-sm">
    <tr>
      <th className="py-1 px-1 text-center w-[35px] border-r border-gray-300">N..</th>
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
  article: Article;
  index: number;
  allArticles: Article[];
  isPrintMode: boolean;
  isCategoryLocked?: boolean;
  onUpdateArticle: (id: string, field: keyof Article, value: string | number) => void;
  onEditArticleDetails: (article: Article) => void;
  onDeleteArticle: (id: string) => void;
  onAddMeasurement: (articleId: string) => void;
  onAddSubtotal: (articleId: string) => void;
  onAddVoiceMeasurement: (articleId: string, data: Partial<Measurement>) => void;
  onUpdateMeasurement: (articleId: string, mId: string, field: keyof Measurement, value: string | number | undefined) => void;
  onDeleteMeasurement: (articleId: string, mId: string) => void;
  onToggleDeduction: (articleId: string, mId: string) => void;
  onOpenLinkModal: (articleId: string, measurementId: string) => void;
  onScrollToArticle: (id: string) => void;
  onReorderMeasurements: (articleId: string, startIndex: number, endIndex: number) => void;
  onArticleDragStart: (e: React.DragEvent, article: Article) => void;
  onArticleDrop: (e: React.DragEvent, targetArticleId: string, position: 'top' | 'bottom') => void;
  onArticleDragEnd: () => void;
  lastAddedMeasurementId: string | null;
  onColumnFocus: (col: string | null) => void;
  onViewAnalysis: (analysisId: string) => void; 
  onInsertExternalArticle: (index: number, text: string) => void;
  onToggleArticleLock: (id: string) => void;
}

const ArticleGroup: React.FC<ArticleGroupProps> = (props) => {
   const { article, index, allArticles, isPrintMode, isCategoryLocked, onUpdateArticle, onEditArticleDetails, onDeleteArticle, onAddMeasurement, onAddSubtotal, onAddVoiceMeasurement, onUpdateMeasurement, onDeleteMeasurement, onToggleDeduction, onOpenLinkModal, onScrollToArticle, onReorderMeasurements, onArticleDragStart, onArticleDrop, onArticleDragEnd, lastAddedMeasurementId, onColumnFocus, onViewAnalysis, onInsertExternalArticle, onToggleArticleLock } = props;
   
   const [measurementDragOverId, setMeasurementDragOverId] = useState<string | null>(null);
   const [isArticleDragOver, setIsArticleDragOver] = useState(false);
   const [articleDropPosition, setArticleDropPosition] = useState<'top' | 'bottom' | null>(null); 
   const [isListening, setIsListening] = useState(false);
   const addBtnRef = useRef<HTMLButtonElement>(null);
   const recognitionRef = useRef<any>(null);

   const isArticleLocked = article.isLocked || false;
   const areControlsDisabled = isCategoryLocked || isArticleLocked;

   useEffect(() => {
     if (lastAddedMeasurementId === 'ADD_BUTTON_FOCUS' + article.id) {
         addBtnRef.current?.focus();
     }
   }, [lastAddedMeasurementId, article.id]);

   const getLinkedInfo = (m: Measurement) => {
     if (!m.linkedArticleId) return null;
     return allArticles.find(a => a.id === m.linkedArticleId);
   };

   const getLinkedArticleNumber = (linkedArt: Article) => {
       const catArticles = allArticles.filter(a => a.categoryCode === linkedArt.categoryCode);
       const localIndex = catArticles.findIndex(a => a.id === linkedArt.id) + 1;
       const wbsNum = getWbsNumber(linkedArt.categoryCode);
       return `${wbsNum}.${localIndex}`;
   };

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
            } else {
                val = calculateRowValue(m);
            }
        }

        let displayValue = 0;
        if (m.type === 'subtotal') {
            displayValue = runningPartialSum;
            runningPartialSum = 0;
        } else {
            displayValue = val;
            runningPartialSum += val;
        }

        return { ...m, calculatedValue: val, displayValue };
   });

   const totalAmount = article.quantity * article.unitPrice;
   const laborValue = totalAmount * (article.laborRate / 100);
   const hierarchicalNumber = `${getWbsNumber(article.categoryCode)}.${index + 1}`;
   const isAnalysisLinked = !!article.linkedAnalysisId;

   return (
      <tbody id={`article-${article.id}`} className={`bg-white border-b border-gray-400 group/article transition-colors relative ${isArticleLocked ? 'bg-gray-50' : ''}`}>
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
            <td className="text-center py-2 text-xs font-bold text-gray-500 border-r border-gray-200 select-none bg-white font-mono">{hierarchicalNumber}</td>
            <td className="p-1 border-r border-gray-200 align-top bg-white">
                <div className="flex flex-col relative">
                    <textarea readOnly value={article.code} className={`font-mono font-bold text-xs w-full bg-transparent border-none px-1 resize-y overflow-hidden leading-tight disabled:text-gray-400 cursor-default focus:ring-0 ${isAnalysisLinked ? 'text-purple-700' : ''}`} rows={2} disabled={true}/>
                    {article.priceListSource && <div className="text-[9px] text-gray-400 px-1 mt-1 leading-tight truncate max-w-full">{article.priceListSource}</div>}
                    {isAnalysisLinked && <button onClick={() => article.linkedAnalysisId && onViewAnalysis(article.linkedAnalysisId)} className="absolute right-0 top-0 text-purple-500 hover:text-purple-700 hover:bg-purple-100 rounded p-0.5 z-10"><TestTubes className="w-3 h-3" /></button>}
                </div>
            </td>
            <td className="p-2 border-r border-gray-200 bg-white">
                 <textarea readOnly value={article.description} className={`w-full min-h-[50px] text-sm text-gray-900 font-serif text-justify border-none focus:ring-0 bg-transparent resize-y p-1 disabled:text-gray-400 cursor-default scrollbar-hide ${isArticleLocked ? 'text-gray-400 italic' : ''}`} disabled={true} style={{ scrollbarWidth: 'none' }}/>
            </td>
            <td colSpan={8} className="border-r border-gray-200 bg-white"></td>
            <td className="print:hidden text-center align-top pt-2 bg-gray-50/30">
                {!isPrintMode && !isCategoryLocked && (
                   <div className="flex flex-col items-center space-y-1">
                      <button onClick={() => onToggleArticleLock(article.id)} className={`transition-colors p-1 rounded ${isArticleLocked ? 'text-red-500 hover:text-red-700 bg-red-50' : 'text-gray-300 hover:text-blue-500'}`}>{isArticleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}</button>
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
                        <>
                             <div className="absolute left-0 top-1/2 w-4 h-[1px] bg-gray-300"></div>
                             {m.linkedArticleId && getLinkedInfo(m) ? (
                               <button onClick={() => onScrollToArticle(m.linkedArticleId!)} className="text-blue-600 font-bold hover:underline cursor-pointer text-[11px]">Vedi voce n. {getLinkedArticleNumber(getLinkedInfo(m)!)}</button>
                             ) : (
                                <input value={m.description} autoFocus={m.id === lastAddedMeasurementId} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'description', e.target.value)} className="w-full bg-transparent border-none p-0 focus:ring-0" placeholder="Descrizione misura..." disabled={areControlsDisabled} />
                             )}
                        </>
                     )}
                </td>
                <td className="border-r border-gray-200 p-0 bg-gray-50"><input type="number" disabled={areControlsDisabled} className="w-full text-center bg-transparent border-none text-xs" value={m.multiplier || ''} placeholder="1" onChange={(e) => onUpdateMeasurement(article.id, m.id, 'multiplier', e.target.value === '' ? undefined : parseFloat(e.target.value))} /></td>
                <td className="border-r border-gray-200 p-0 bg-gray-50"><input type="number" disabled={areControlsDisabled || !!m.linkedArticleId} className="w-full text-center bg-transparent border-none text-xs" value={m.length || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'length', e.target.value === '' ? undefined : parseFloat(e.target.value))} /></td>
                <td className="border-r border-gray-200 p-0 bg-gray-50"><input type="number" disabled={areControlsDisabled || !!m.linkedArticleId} className="w-full text-center bg-transparent border-none text-xs" value={m.width || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'width', e.target.value === '' ? undefined : parseFloat(e.target.value))} /></td>
                <td className="border-r border-gray-200 p-0 bg-gray-50"><input type="number" disabled={areControlsDisabled || !!m.linkedArticleId} className="w-full text-center bg-transparent border-none text-xs" value={m.height || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'height', e.target.value === '' ? undefined : parseFloat(e.target.value))} /></td>
                <td className={`border-r border-gray-200 text-right font-mono pr-1 ${m.type === 'subtotal' ? 'bg-yellow-100' : 'bg-white'}`}>{formatNumber(m.displayValue)}</td>
                <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                <td className="text-center print:hidden bg-gray-50/50">
                    {!isPrintMode && !areControlsDisabled && (
                        <div className="flex justify-center items-center space-x-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                            {m.type !== 'subtotal' && <><button onClick={() => onOpenLinkModal(article.id, m.id)} className={`rounded p-0.5 ${m.linkedArticleId ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-blue-600'}`}><LinkIcon className="w-3.5 h-3.5" /></button><button onClick={() => onToggleDeduction(article.id, m.id)} className={`p-0.5 ${m.type === 'positive' ? 'text-red-400' : 'text-blue-400'}`}>{m.type === 'positive' ? <MinusCircle className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5" />}</button></>}
                            <button onClick={() => onDeleteMeasurement(article.id, m.id)} className="text-gray-300 hover:text-red-500 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                    )}
                </td>
            </tr>
         ))}
         <tr className="bg-white font-bold text-xs border-t border-gray-300 border-b-2 border-gray-400">
             <td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td>
             <td className="px-2 py-2 text-right border-r border-gray-300">Sommano {article.unit}</td>
             <td className="border-r border-gray-300" colSpan={4}></td>
             <td className="text-right pr-1 font-mono text-black border-t-4 border-double border-gray-800">{formatNumber(article.quantity)}</td>
             <td className="border-l border-r border-gray-300 text-right pr-1 font-mono">{formatNumber(article.unitPrice)}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-blue-900">{formatNumber(totalAmount)}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-gray-600 font-normal">
                 <div className="flex flex-col items-end leading-none py-1"><span>{formatCurrency(laborValue)}</span><span className="text-[9px] text-gray-400">({article.laborRate}%)</span></div>
             </td>
             <td className="text-center border-gray-300 relative group/add align-middle print:hidden bg-gray-50">
                {!isPrintMode && !areControlsDisabled && (
                   <div className="flex items-center justify-center space-x-1">
                        <button onMouseDown={() => {}} className="w-5 h-5 rounded-full flex items-center justify-center text-purple-400 border border-purple-200"><Mic className="w-3 h-3" /></button>
                        <button onClick={() => onAddSubtotal(article.id)} className="w-5 h-5 rounded-full flex items-center justify-center text-orange-400 border border-orange-200"><Sigma className="w-3 h-3" /></button>
                        <button ref={addBtnRef} onClick={() => onAddMeasurement(article.id)} className="w-6 h-6 rounded-full flex items-center justify-center text-gray-500 border border-gray-300 hover:bg-slate-500 hover:text-white"><Plus className="w-4 h-4" /></button>
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

// --- Main App Component ---
const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  
  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => { setUser(currentUser); setAuthLoading(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const currentSessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userSessionRef = ref(db, `sessions/${user.uid}`);
    set(userSessionRef, { sessionId: currentSessionId, lastLogin: new Date().toISOString() });
    const unsubscribeDb = onValue(userSessionRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.sessionId && data.sessionId !== currentSessionId) {
            setSessionError(true);
            if (auth.currentUser) signOut(auth);
        }
    });
    return () => { off(userSessionRef); unsubscribeDb(); };
  }, [user]);

  // Global Drag Over Listener to remove the "prohibited" sign
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };
    window.addEventListener('dragover', handleGlobalDragOver);
    return () => window.removeEventListener('dragover', handleGlobalDragOver);
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
  const [currentFileHandle, setCurrentFileHandle] = useState<any>(null); 
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<{articleId: string, measurementId: string} | null>(null);
  const [isEditArticleModalOpen, setIsEditArticleModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [isProcessingDrop, setIsProcessingDrop] = useState(false);
  const [lastAddedMeasurementId, setLastAddedMeasurementId] = useState<string | null>(null);
  const [draggedCategoryCode, setDraggedCategoryCode] = useState<string | null>(null);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [activeSoaCategory, setActiveSoaCategory] = useState<string>('OG1');
  const [wbsDropTarget, setWbsDropTarget] = useState<{ code: string, position: 'top' | 'bottom' | 'inside' } | null>(null);
  const [isDraggingArticle, setIsDraggingArticle] = useState(false);
  const [isAnalysisEditorOpen, setIsAnalysisEditorOpen] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState<PriceAnalysis | null>(null);
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');
  const [isImportAnalysisModalOpen, setIsImportAnalysisModalOpen] = useState(false);
  const [isAnalysisDragOver, setIsAnalysisDragOver] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeCategoryForAi, setActiveCategoryForAi] = useState<string | null>(null);

  // FIX: Added missing helper functions generateNextWbsCode and renumberCategories
  const generateNextWbsCode = (currentCats: Category[]) => `WBS.${(currentCats.length + 1).toString().padStart(2, '0')}`;
  
  const renumberCategories = (cats: Category[], currentArts: Article[]) => {
      const codeMap: Record<string, string> = {};
      const newCategories = cats.map((cat, index) => {
          const newCode = `WBS.${(index + 1).toString().padStart(2, '0')}`;
          codeMap[cat.code] = newCode;
          return { ...cat, code: newCode };
      });
      const newArticles = currentArts.map(art => {
          if (codeMap[art.categoryCode]) return { ...art, categoryCode: codeMap[art.categoryCode] };
          return art;
      });
      return { newCategories, newArticles, codeMap };
  };

  // FIX: Added handleAnalysisDragStart function
  const handleAnalysisDragStart = (e: React.DragEvent, analysis: PriceAnalysis) => { e.dataTransfer.setData('text/plain', `GECOLA_DATA::ANALYSIS::${JSON.stringify(analysis)}`); e.dataTransfer.effectAllowed = 'copy'; };

  const updateState = (newArticles: Article[], newCategories: Category[] = categories, newAnalyses: PriceAnalysis[] = analyses, saveHistory: boolean = true) => {
      const recomputed = recalculateAllArticles(newArticles);
      if (saveHistory) {
          setHistory(prev => [...prev, { articles, categories, analyses }].slice(-50));
          setFuture([]); 
      }
      setArticles(recomputed);
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

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(h => [...h, { articles, categories, analyses }]);
    setFuture(f => f.slice(1));
    setArticles(next.articles); setCategories(next.categories); setAnalyses(next.analyses);
  }, [future, articles, categories, analyses]);

  const categoryTotals = useMemo(() => {
    const lookup: Record<string, number> = {};
    categories.forEach(cat => {
      lookup[cat.code] = articles.filter(a => a.categoryCode === cat.code).reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
    });
    return lookup;
  }, [articles, categories]);

  const totals: Totals = useMemo(() => {
    const totalWorks = articles.reduce((acc, art) => {
        const cat = categories.find(c => c.code === art.categoryCode);
        return (cat && cat.isEnabled !== false) ? acc + (art.quantity * art.unitPrice) : acc;
    }, 0);
    const safetyCosts = totalWorks * (projectInfo.safetyRate / 100);
    const totalTaxable = totalWorks + safetyCosts;
    const vatAmount = totalTaxable * (projectInfo.vatRate / 100);
    return { totalWorks, safetyCosts, totalTaxable, vatAmount, grandTotal: totalTaxable + vatAmount };
  }, [articles, categories, projectInfo]);

  // FIX: Added derived memo states activeCategory, activeArticles, and filteredAnalyses
  const activeCategory = useMemo(() => categories.find(c => c.code === selectedCategoryCode), [categories, selectedCategoryCode]);
  const activeArticles = useMemo(() => articles.filter(a => a.categoryCode === selectedCategoryCode), [articles, selectedCategoryCode]);
  const filteredAnalyses = useMemo(() => analyses.filter(a => 
    a.code.toLowerCase().includes(analysisSearchTerm.toLowerCase()) || 
    a.description.toLowerCase().includes(analysisSearchTerm.toLowerCase())
  ), [analyses, analysisSearchTerm]);

  const handleSaveAnalysis = (updated: PriceAnalysis) => {
      let newAnalyses = [...analyses];
      const index = newAnalyses.findIndex(a => a.id === updated.id);
      if (index !== -1) newAnalyses[index] = updated; else newAnalyses.push(updated);
      const newArticles = articles.map(art => {
          if (art.linkedAnalysisId === updated.id) {
             return { ...art, description: updated.description, unit: updated.unit, unitPrice: roundTwoDecimals(updated.totalUnitPrice), laborRate: updated.totalBatchValue > 0 ? parseFloat(((updated.totalLabor / updated.totalBatchValue) * 100).toFixed(2)) : 0, code: updated.code };
          }
          return art;
      });
      updateState(newArticles, categories, newAnalyses);
  };

  const handleDeleteAnalysis = (id: string) => {
      if (window.confirm("Scollegare le voci di computo collegate?")) {
         updateState(articles.map(art => art.linkedAnalysisId === id ? { ...art, linkedAnalysisId: undefined } : art), categories, analyses.filter(a => a.id !== id));
      }
  };

  const handleImportAnalysisToArticle = (analysis: PriceAnalysis) => {
      const targetCode = activeCategoryForAi || (selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode);
      const newArticle: Article = {
          id: Math.random().toString(36).substr(2, 9),
          categoryCode: targetCode,
          code: analysis.code,
          description: analysis.description,
          unit: analysis.unit,
          unitPrice: roundTwoDecimals(analysis.totalUnitPrice),
          laborRate: analysis.totalBatchValue > 0 ? parseFloat(((analysis.totalLabor / analysis.totalBatchValue) * 100).toFixed(2)) : 0,
          linkedAnalysisId: analysis.id,
          priceListSource: `Da Analisi ${analysis.code}`,
          soaCategory: activeSoaCategory,
          measurements: [{ id: Math.random().toString(36).substr(2,9), description: '', type: 'positive', multiplier: undefined }],
          quantity: 0
      };
      updateState([...articles, newArticle]);
      setViewMode('COMPUTO'); setIsImportAnalysisModalOpen(false); 
  };

  const handleWbsDragStart = (e: React.DragEvent, code: string) => { 
      e.dataTransfer.effectAllowed = 'all'; 
      e.dataTransfer.setData('text/uri-list', window.location.href); 
      setDraggedCategoryCode(code); 
      
      const cat = categories.find(c => c.code === code);
      if (cat) {
          const catArticles = articles.filter(a => a.categoryCode === code);
          const relatedAnalysesIds = new Set(catArticles.map(a => a.linkedAnalysisId).filter(Boolean));
          const relatedAnalyses = analyses.filter(an => relatedAnalysesIds.has(an.id));
          const bundle = { type: 'CROSS_TAB_WBS_BUNDLE', category: cat, articles: catArticles, analyses: relatedAnalyses };
          e.dataTransfer.setData('text/plain', JSON.stringify(bundle));
      }
  };

  const handleWbsDragOver = (e: React.DragEvent, targetCode: string | null) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    e.dataTransfer.dropEffect = 'copy';
    if (isDraggingArticle && targetCode) { setWbsDropTarget({ code: targetCode, position: 'inside' }); return; } 
    if (draggedCategoryCode && targetCode && draggedCategoryCode !== targetCode) { 
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); 
        setWbsDropTarget({ code: targetCode, position: e.clientY < (rect.top + rect.height/2) ? 'top' : 'bottom' }); 
    } 
  };

  const handleWbsDrop = (e: React.DragEvent, targetCode: string | null) => { 
      e.preventDefault(); e.stopPropagation(); setWbsDropTarget(null); 
      const articleId = e.dataTransfer.getData('articleId'); 
      if (articleId && targetCode) { 
          const targetCategory = categories.find(c => c.code === targetCode); 
          if (targetCategory?.isLocked) { alert("WBS bloccata."); return; } 
          const art = articles.find(a => a.id === articleId);
          if (art && art.categoryCode !== targetCode) {
              updateState(articles.map(a => a.id === articleId ? { ...a, categoryCode: targetCode } : a));
          }
          return;
      } 
      
      const textData = e.dataTransfer.getData('text/plain');
      if (textData) {
          try {
              const payload = JSON.parse(textData);
              if (payload && payload.type === 'CROSS_TAB_WBS_BUNDLE') {
                  const { category: importedCat, articles: importedArticles, analyses: importedAnalyses } = payload;
                  const newCatCode = generateNextWbsCode(categories);
                  const newCategory: Category = { ...importedCat, code: newCatCode, name: importedCat.name + " (Importato)" };
                  const analysisIdMap = new Map<string, string>();
                  const newAnalysesList = [...analyses];
                  if (importedAnalyses) {
                      importedAnalyses.forEach((an: PriceAnalysis) => {
                          const newId = Math.random().toString(36).substr(2, 9);
                          let newCode = an.code;
                          if (analyses.some(ex => ex.code === newCode)) newCode = `AP.${(newAnalysesList.length + 1).toString().padStart(2, '0')}`;
                          analysisIdMap.set(an.id, newId);
                          newAnalysesList.push({ ...an, id: newId, code: newCode, components: an.components.map(c => ({ ...c, id: Math.random().toString(36).substr(2, 9) })) });
                      });
                  }
                  const processedArticles = importedArticles.map((art: Article) => {
                      const newId = Math.random().toString(36).substr(2, 9);
                      let newLid = art.linkedAnalysisId;
                      if (art.linkedAnalysisId && analysisIdMap.has(art.linkedAnalysisId)) newLid = analysisIdMap.get(art.linkedAnalysisId);
                      return { ...art, id: newId, categoryCode: newCatCode, linkedAnalysisId: newLid, measurements: art.measurements.map(m => ({ ...m, id: Math.random().toString(36).substr(2, 9), linkedArticleId: undefined })) };
                  });
                  updateState([...articles, ...processedArticles], [...categories, newCategory], newAnalysesList);
                  setSelectedCategoryCode(newCatCode);
              }
          } catch (e) { /* ignore non-bundle json */ }
      }
      if (draggedCategoryCode && targetCode && draggedCategoryCode !== targetCode) { 
          const sourceIdx = categories.findIndex(c => c.code === draggedCategoryCode); 
          let targetIdx = categories.findIndex(c => c.code === targetCode); 
          const newCats = [...categories]; const [moved] = newCats.splice(sourceIdx, 1);
          if (wbsDropTarget?.position === 'bottom') targetIdx++;
          newCats.splice(targetIdx, 0, moved);
          const res = renumberCategories(newCats, articles); updateState(res.newArticles, res.newCategories);
      }
      setDraggedCategoryCode(null); setIsDraggingArticle(false);
  };

  const handleUpdateArticle = (id: string, field: keyof Article, val: any) => updateState(articles.map(a => a.id === id ? { ...a, [field]: val } : a));
  const handleDeleteArticle = (id: string) => window.confirm("Eliminare l'articolo?") && updateState(articles.filter(a => a.id !== id));
  const handleAddMeasurement = (aid: string) => { const nid = Math.random().toString(36).substr(2, 9); setLastAddedMeasurementId(nid); updateState(articles.map(a => a.id === aid ? { ...a, measurements: [...a.measurements, { id: nid, description: '', type: 'positive' }] } : a)); };
  const handleUpdateMeasurement = (aid: string, mid: string, field: keyof Measurement, val: any) => updateState(articles.map(a => a.id === aid ? { ...a, measurements: a.measurements.map(m => m.id === mid ? { ...m, [field]: val } : m) } : a));
  const handleDeleteMeasurement = (aid: string, mid: string) => updateState(articles.map(a => a.id === aid ? { ...a, measurements: a.measurements.filter(m => m.id !== mid) } : a));
  const handleArticleDragStart = (e: React.DragEvent, art: Article) => { setIsDraggingArticle(true); e.dataTransfer.setData('articleId', art.id); e.dataTransfer.effectAllowed = 'copyMove'; };

  return (
    <div className="h-screen flex flex-col bg-[#e8eaed] font-sans overflow-hidden text-slate-800" onDragOver={(e) => handleWbsDragOver(e, null)} onDrop={(e) => handleWbsDrop(e, null)}>
      <div className="bg-[#2c3e50] shadow-md z-50 h-14 flex items-center justify-between px-6 border-b border-slate-600">
          <div className="flex items-center space-x-3 w-64"><div className="bg-orange-500 p-1.5 rounded-lg shadow-lg"><Calculator className="w-5 h-5 text-white" /></div><div className="flex flex-col"><span className="font-bold text-lg text-white">GeCoLa <span className="font-light opacity-80 text-xs">v10.9</span></span></div></div>
          <div className="flex-1 flex justify-center"><div className="bg-slate-800/50 px-4 py-1 rounded-full border border-slate-700 text-sm font-bold text-white truncate max-w-[400px]">{projectInfo.title}</div></div>
          <div className="flex items-center space-x-3"><button onClick={() => setIsSaveModalOpen(true)} className="p-1.5 text-slate-300 hover:text-white hover:bg-purple-600 rounded"><Share2 className="w-5 h-5" /></button><button onClick={() => setIsPrintMenuOpen(!isPrintMenuOpen)} className="p-1.5 text-slate-300 hover:text-white hover:bg-red-600 rounded relative"><FileText className="w-5 h-5" />{isPrintMenuOpen && (<div className="absolute right-0 top-full mt-2 w-56 bg-white rounded shadow-xl border z-50 text-left"><button onClick={() => { generateComputoMetricPdf(projectInfo, categories, articles); setIsPrintMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50">Computo Metrico</button></div>)}</button><button onClick={() => signOut(auth)} className="p-1.5 text-red-400 hover:text-white hover:bg-red-600 rounded"><LogOut className="w-5 h-5" /></button></div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 bg-white border-r border-slate-300 flex flex-col flex-shrink-0 z-10">
          <div className="p-3 bg-slate-50 border-b flex gap-1"><button onClick={() => setViewMode('COMPUTO')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded ${viewMode === 'COMPUTO' ? 'bg-white text-blue-700 shadow-md' : 'text-slate-500'}`}>Computo</button><button onClick={() => setViewMode('ANALISI')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded ${viewMode === 'ANALISI' ? 'bg-white text-purple-700 shadow-md' : 'text-slate-500'}`}>Analisi</button></div>
          <div className="flex-1 overflow-y-auto" onDragOver={(e) => handleWbsDragOver(e, null)} onDrop={(e) => handleWbsDrop(e, null)}>
              {viewMode === 'COMPUTO' ? (
                <ul className="py-2">{categories.map(cat => (
                  <li key={cat.code} className="relative group/cat" onDragOver={(e) => handleWbsDragOver(e, cat.code)} onDrop={(e) => handleWbsDrop(e, cat.code)}>
                    {wbsDropTarget?.code === cat.code && wbsDropTarget.position === 'top' && <div className="absolute top-0 left-0 right-0 h-1 bg-green-500 z-50" />}
                    <div draggable onDragStart={(e) => handleWbsDragStart(e, cat.code)} onDragEnd={() => setDraggedCategoryCode(null)}>
                      <button onClick={() => setSelectedCategoryCode(cat.code)} className={`w-full text-left pl-3 pr-2 py-2 border-l-4 transition-all ${selectedCategoryCode === cat.code ? 'bg-blue-50 border-blue-500 shadow-sm' : 'border-transparent hover:bg-slate-50'}`}>
                        <div className="flex items-center gap-2"><GripVertical className="w-3 h-3 text-gray-300"/><span className="text-[9px] font-bold font-mono px-1.5 bg-slate-200 rounded">{cat.code}</span></div>
                        <div className="pl-5 text-xs font-medium truncate">{cat.name}</div>
                        <div className="pl-5 text-[10px] font-mono text-blue-600">{formatCurrency(categoryTotals[cat.code] || 0)}</div>
                      </button>
                    </div>
                    {wbsDropTarget?.code === cat.code && wbsDropTarget.position === 'bottom' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-green-500 z-50" />}
                  </li>
                ))}</ul>
              ) : (
                <div className="p-2 space-y-2">{filteredAnalyses.map(an => (
                    <div key={an.id} draggable onDragStart={(e) => handleAnalysisDragStart(e, an)} className="bg-white p-3 rounded border shadow-sm hover:border-purple-300 cursor-grab">
                        <div className="flex justify-between font-bold text-[10px] text-purple-700"><span>{an.code}</span><span>{formatCurrency(an.totalUnitPrice)}</span></div>
                        <p className="text-xs line-clamp-2">{an.description}</p>
                        <button onClick={() => handleImportAnalysisToArticle(an)} className="mt-2 w-full text-[10px] bg-purple-50 text-purple-700 py-1 rounded">Importa</button>
                    </div>
                ))}</div>
              )}
          </div>
        </div>
        <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] p-4">
           <div className="flex-1 overflow-y-auto bg-white shadow-lg border border-gray-300 flex flex-col rounded-xl">
              {viewMode === 'COMPUTO' && activeCategory ? (
                <div className="flex flex-col h-full">
                  <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
                      <div className="flex items-center gap-3"><div className="bg-white border p-2 rounded shadow-sm text-center"><span className="text-xs text-gray-400 block">WBS</span><span className="text-2xl font-black">{activeCategory.code}</span></div><h2 className="text-lg font-bold uppercase truncate max-w-[300px]">{activeCategory.name}</h2></div>
                      <CategoryDropGate onDropContent={(txt) => { const p = parseDroppedContent(txt); if(p) updateState([...articles, { ...p, id: Math.random().toString(36).substr(2,9), categoryCode: activeCategory.code, measurements: [{id: Math.random().toString(36).substr(2,9), description: '', type: 'positive'}] } as Article]) }} isLoading={isProcessingDrop} categoryCode={activeCategory.code} />
                      <button onClick={() => setIsImportAnalysisModalOpen(true)} className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg"><Plus /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto"><table className="w-full text-left border-collapse"><TableHeader activeColumn={activeColumn}/>
                      {activeArticles.map((art, idx) => (
                        <ArticleGroup key={art.id} article={art} index={idx} allArticles={articles} isPrintMode={false} isCategoryLocked={activeCategory.isLocked} onUpdateArticle={handleUpdateArticle} onEditArticleDetails={setEditingArticle} onDeleteArticle={handleDeleteArticle} onAddMeasurement={handleAddMeasurement} onAddSubtotal={() => {}} onAddVoiceMeasurement={() => {}} onUpdateMeasurement={handleUpdateMeasurement} onDeleteMeasurement={handleDeleteMeasurement} onToggleDeduction={() => {}} onOpenLinkModal={() => {}} onScrollToArticle={() => {}} onReorderMeasurements={() => {}} onArticleDragStart={handleArticleDragStart} onArticleDrop={() => {}} onArticleDragEnd={() => {}} lastAddedMeasurementId={lastAddedMeasurementId} onColumnFocus={setActiveColumn} onViewAnalysis={() => {}} onInsertExternalArticle={() => {}} onToggleArticleLock={() => {}} />
                      ))}
                  </table></div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-10">
                    <TestTubes className="w-16 h-16 text-purple-200 mb-4" /><h2 className="text-xl font-bold text-gray-800">Seleziona un capitolo o gestisci le analisi</h2>
                </div>
              )}
           </div>
        </div>
      </div>
      <SaveProjectModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} articles={articles} categories={categories} projectInfo={projectInfo} />
      <AnalysisEditorModal isOpen={isAnalysisEditorOpen} onClose={() => setIsAnalysisEditorOpen(false)} analysis={editingAnalysis} onSave={handleSaveAnalysis} nextCode={`AP.${(analyses.length + 1).toString().padStart(2, '0')}`} />
      <ImportAnalysisModal isOpen={isImportAnalysisModalOpen} onClose={() => setIsImportAnalysisModalOpen(false)} analyses={analyses} onImport={handleImportAnalysisToArticle} onCreateNew={() => { setIsImportAnalysisModalOpen(false); setIsAnalysisEditorOpen(true); setEditingAnalysis(null); }} />
      {editingArticle && <ArticleEditModal isOpen={!!editingArticle} onClose={() => setEditingArticle(null)} article={editingArticle} onSave={(id, up) => updateState(articles.map(a => a.id === id ? {...a, ...up} : a))} onConvertToAnalysis={() => {}} />}
    </div>
  );
};
export default App;
