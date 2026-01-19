
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Calculator, LayoutDashboard, FolderOpen, Minus, XCircle, ChevronRight, Settings, PlusCircle, MinusCircle, Link as LinkIcon, ExternalLink, Undo2, Redo2, PenLine, MapPin, Lock, Unlock, Lightbulb, LightbulbOff, Edit2, FolderPlus, GripVertical, Mic, Sigma, Save, FileSignature, CheckCircle2, Loader2, Cloud, Share2, FileText, ChevronDown, TestTubes, Search, Coins, ArrowRightLeft, Copy, Move, LogOut, AlertTriangle, ShieldAlert, Award, User, BookOpen, Edit3, Paperclip, MousePointerClick, AlignLeft, Layers, Sparkles, FileJson, Download, HelpCircle, FileSpreadsheet, CircleDot, Paintbrush } from 'lucide-react';
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
import CategoryEditModal from './components/CategoryEditModal';
import SaveProjectModal from './components/SaveProjectModal';
import AnalysisEditorModal from './components/AnalysisEditorModal';
import ImportAnalysisModal from './components/ImportAnalysisModal';
import WbsImportOptionsModal, { WbsActionMode } from './components/WbsImportOptionsModal';
import HelpManualModal from './components/HelpManualModal';
import RebarCalculatorModal from './components/RebarCalculatorModal';
import PaintingCalculatorModal from './components/PaintingCalculatorModal';
import { parseDroppedContent, parseVoiceMeasurement, generateBulkItems } from './services/geminiService';
import { generateComputoMetricPdf, generateElencoPrezziPdf, generateManodoperaPdf, generateAnalisiPrezziPdf } from './services/pdfGenerator';
import { generateComputoExcel } from './services/excelGenerator';

// --- Types and Helpers ---
interface Snapshot {
  articles: Article[];
  categories: Category[];
  analyses: PriceAnalysis[];
}

type ViewMode = 'COMPUTO' | 'ANALISI';

const generateNextWbsCode = (currentCats: Category[]) => `WBS.${(currentCats.length + 1).toString().padStart(2, '0')}`;

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

// --- Components ---
interface TableHeaderProps {
    activeColumn: string | null;
}

const TableHeader: React.FC<TableHeaderProps> = ({ activeColumn }) => (
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
  onOpenRebarCalculator: (articleId: string) => void;
  onOpenPaintingCalculator: (articleId: string) => void;
  isPaintingAutomationWaiting: boolean;
  isRebarAutomationWaiting: boolean;
}

const ArticleGroup: React.FC<ArticleGroupProps> = (props) => {
   const { 
     article, index, allArticles, isPrintMode, isCategoryLocked, onUpdateArticle, onEditArticleDetails, 
     onDeleteArticle, onAddMeasurement, onAddSubtotal, onAddVoiceMeasurement, onUpdateMeasurement, 
     onDeleteMeasurement, onToggleDeduction, onOpenLinkModal, onScrollToArticle, onReorderMeasurements, 
     onArticleDragStart, onArticleDrop, onArticleDragEnd, lastAddedMeasurementId, onColumnFocus, 
     onViewAnalysis, onInsertExternalArticle, onToggleArticleLock, onOpenRebarCalculator, onOpenPaintingCalculator,
     isPaintingAutomationWaiting, isRebarAutomationWaiting
   } = props;
   
   const [measurementDragOverId, setMeasurementDragOverId] = useState<string | null>(null);
   const [isArticleDragOver, setIsArticleDragOver] = useState(false);
   const [articleDropPosition, setArticleDropPosition] = useState<'top' | 'bottom' | null>(null);
   const [isListening, setIsListening] = useState(false);
   const [recordingMeasId, setRecordingMeasId] = useState<string | null>(null);
   const addBtnRef = useRef<HTMLButtonElement>(null);
   const recognitionRef = useRef<any>(null);
   const tbodyRef = useRef<HTMLTableSectionElement>(null);
   const longPressTimer = useRef<any>(null);

   const isArticleLocked = article.isLocked || false;
   const areControlsDisabled = isCategoryLocked || isArticleLocked;

   useEffect(() => {
     if (lastAddedMeasurementId === 'ADD_BUTTON_FOCUS' + article.id) {
         addBtnRef.current?.focus();
     }
   }, [lastAddedMeasurementId, article.id]);

   const getLinkedInfo = (m: Measurement) => {
     if (!m.linkedArticleId) return null;
     const linkedArt = allArticles.find(a => a.id === m.linkedArticleId);
     return linkedArt;
   };

   const getLinkedArticleNumber = (linkedArt: Article) => {
       const catArticles = allArticles.filter(a => a.id && a.categoryCode === linkedArt.categoryCode);
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
   const wbsNumber = getWbsNumber(article.categoryCode);
   const hierarchicalNumber = `${wbsNumber}.${index + 1}`;
   const isAnalysisLinked = !!article.linkedAnalysisId;

   const handleMeasDragStart = (e: React.DragEvent, index: number) => {
       e.stopPropagation(); 
       if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
           e.preventDefault();
           return;
       }
       e.dataTransfer.setData('type', 'MEASUREMENT');
       e.dataTransfer.setData('index', index.toString());
       e.dataTransfer.effectAllowed = "move";
   };

   const handleMeasDragOver = (e: React.DragEvent, mId: string) => {
       e.preventDefault(); 
       e.stopPropagation();
       e.dataTransfer.dropEffect = 'move';
       if (measurementDragOverId !== mId) setMeasurementDragOverId(mId);
   };

   const handleMeasDrop = (e: React.DragEvent, dropIndex: number) => {
       e.preventDefault();
       e.stopPropagation();
       setMeasurementDragOverId(null);
       const type = e.dataTransfer.getData('type');
       if (type !== 'MEASUREMENT') return;
       const startIndexStr = e.dataTransfer.getData('index');
       if (!startIndexStr) return;
       const startIndex = parseInt(startIndexStr, 10);
       if (startIndex !== dropIndex) onReorderMeasurements(article.id, startIndex, dropIndex);
   };

   const handleArticleHeaderDragStart = (e: React.DragEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
        e.preventDefault();
        return;
      }
      onArticleDragStart(e, article);
   };

   const handleArticleHeaderDragEnd = (e: React.DragEvent) => {
       onArticleDragEnd();
       setArticleDropPosition(null);
   };

   const handleTbodyDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const type = e.dataTransfer.getData('type');
      const textData = e.dataTransfer.types.includes('text/plain');

      if (type === 'ARTICLE' || textData) {
          e.dataTransfer.dropEffect = 'copy';
          if (isCategoryLocked) return;
          
          const rect = tbodyRef.current?.getBoundingClientRect();
          if (rect) {
            const midPoint = rect.top + rect.height / 2;
            const isTop = e.clientY < midPoint;
            setArticleDropPosition(isTop ? 'top' : 'bottom');
            setIsArticleDragOver(true);
          }
      }
   };

   const handleTbodyDragLeave = (e: React.DragEvent) => {
       const rect = tbodyRef.current?.getBoundingClientRect();
       if (rect) {
         if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
            setIsArticleDragOver(false);
            setArticleDropPosition(null);
         }
       }
   };

   const handleTbodyDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isCategoryLocked) {
          setIsArticleDragOver(false);
          setArticleDropPosition(null);
          return;
      }

      const type = e.dataTransfer.getData('type');
      const textData = e.dataTransfer.getData('text');
      const isExternal = textData && (type !== 'ARTICLE' && type !== 'MEASUREMENT');

      if (isExternal) {
          const insertionIndex = articleDropPosition === 'bottom' ? index + 1 : index;
          onInsertExternalArticle(insertionIndex, textData);
      } else if (type === 'ARTICLE') {
          onArticleDrop(e, article.id, articleDropPosition || 'bottom');
      }

      setIsArticleDragOver(false);
      setArticleDropPosition(null);
   };

   const startListeningOnMeas = (mId: string) => {
      if (!('webkitSpeechRecognition' in window)) {
          alert("Il tuo browser non supporta il riconoscimento vocale. Usa Chrome.");
          return;
      }
      if (recognitionRef.current) return;
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.lang = 'it-IT';
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onstart = () => {
        setIsListening(true);
        setRecordingMeasId(mId);
      };
      let finalTranscript = '';
      recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; ++i) {
             if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
          }
      };
      recognition.onend = async () => {
          setIsListening(false);
          setRecordingMeasId(null);
          recognitionRef.current = null;
          if (finalTranscript.trim()) {
             const parsed = await parseVoiceMeasurement(finalTranscript);
             if (parsed) {
                onUpdateMeasurement(article.id, mId, 'description', parsed.description || finalTranscript);
                if (parsed.length !== undefined) onUpdateMeasurement(article.id, mId, 'length', parsed.length);
                if (parsed.width !== undefined) onUpdateMeasurement(article.id, mId, 'width', parsed.width);
                if (parsed.height !== undefined) onUpdateMeasurement(article.id, mId, 'height', parsed.height);
                if (parsed.multiplier !== undefined) onUpdateMeasurement(article.id, mId, 'multiplier', parsed.multiplier);
             } else {
                onUpdateMeasurement(article.id, mId, 'description', finalTranscript);
             }
          }
      };
      recognitionRef.current = recognition;
      recognition.start();
   };

   const stopListening = () => {
      if (recognitionRef.current) recognitionRef.current.stop(); 
   };

   return (
      <tbody 
        ref={tbodyRef}
        id={`article-${article.id}`} 
        className={`bg-white border-b border-gray-400 group/article transition-all relative ${isArticleLocked ? 'bg-gray-50/50' : ''} ${isArticleDragOver ? 'ring-2 ring-green-400 ring-inset' : ''}`}
        onDragOver={handleTbodyDragOver}
        onDragLeave={handleTbodyDragLeave}
        onDrop={handleTbodyDrop}
      >
         {isArticleDragOver && articleDropPosition === 'top' && (
             <tr className="h-0 p-0 border-none"><td colSpan={12} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-green-500 -top-0.5 z-50 shadow-[0_0_8px_rgba(34,197,94,0.8)] pointer-events-none"></div></td></tr>
         )}
         <tr 
            className={`align-top ${!isPrintMode ? 'cursor-move hover:bg-slate-50' : ''} ${isArticleDragOver ? 'bg-green-50/10' : ''}`}
            draggable={!isPrintMode && !areControlsDisabled}
            onDragStart={handleArticleHeaderDragStart}
            onDragEnd={handleArticleHeaderDragEnd}
         >
            <td className="text-center py-2 text-xs font-bold text-gray-500 border-r border-gray-200 select-none bg-white font-mono">{hierarchicalNumber}</td>
            <td className="p-1 border-r border-gray-200 align-top bg-white">
               {isPrintMode ? (
                   <div className="font-mono font-bold text-xs pt-1 whitespace-pre-wrap">{article.code}</div>
               ) : (
                  <div className="flex flex-col relative">
                    <textarea 
                        readOnly
                        value={article.code}
                        className={`font-mono font-bold text-xs w-full bg-transparent border-none px-1 resize-y overflow-hidden leading-tight disabled:text-gray-400 cursor-default focus:ring-0 ${isAnalysisLinked ? 'text-purple-700' : ''} ${isArticleLocked ? 'text-gray-400' : ''}`}
                        rows={2}
                        placeholder="Codice"
                        disabled={true}
                    />
                    {article.priceListSource && <div className="text-[9px] text-gray-400 px-1 mt-1 leading-tight truncate max-w-full" title={article.priceListSource}>{article.priceListSource}</div>}
                    {article.soaCategory && (
                        <div className="text-[9px] text-gray-400 px-1 italic leading-tight" title={`Categoria SOA: ${article.soaCategory}`}>
                            ({article.soaCategory})
                        </div>
                    )}
                    {isAnalysisLinked && (
                        <button 
                            onClick={() => article.linkedAnalysisId && onViewAnalysis(article.linkedAnalysisId)}
                            className="absolute right-0 top-0 text-purple-500 hover:text-purple-700 hover:bg-purple-100 rounded p-0.5 transition-colors z-10"
                            title="Vedi Analisi Prezzo"
                        >
                            <TestTubes className="w-3 h-3" />
                        </button>
                    )}
                  </div>
               )}
            </td>
            <td className="p-2 border-r border-gray-200 bg-white">
               {isPrintMode ? (
                 <p className="text-sm text-gray-900 leading-relaxed font-serif text-justify px-1 whitespace-pre-wrap">{article.description}</p>
               ) : (
                 <textarea 
                    readOnly
                    value={article.description}
                    rows={isArticleLocked ? 2 : 4}
                    className={`w-full text-sm text-gray-900 font-serif text-justify border-none focus:ring-0 bg-transparent resize-y p-1 disabled:text-gray-400 cursor-default scrollbar-hide ${isArticleLocked ? 'text-gray-400 italic' : 'min-h-[50px]'}`}
                    placeholder="Descrizione..."
                    disabled={true}
                 />
               )}
            </td>
            <td colSpan={8} className="border-r border-gray-200 bg-white"></td>
            <td className="print:hidden text-center align-top pt-2 bg-gray-50/30 border-l border-gray-200">
                {!isPrintMode && !isCategoryLocked && (
                   <div className="flex flex-col items-center gap-1 opacity-0 group-hover/article:opacity-100 transition-opacity">
                      <button onClick={() => onToggleArticleLock(article.id)} className={`transition-colors p-1 rounded ${isArticleLocked ? 'text-red-500 hover:text-red-700 bg-red-50' : 'text-gray-400 hover:text-blue-500'}`} title={isArticleLocked ? "Sblocca Voce" : "Blocca Voce (Lavoro Fatto)"}>
                          {isArticleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                      {!isArticleLocked && (
                          <>
                            <button onClick={() => onEditArticleDetails(article)} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Modifica Dettagli"><PenLine className="w-4 h-4" /></button>
                            <button onClick={() => onDeleteArticle(article.id)} className="text-gray-400 hover:text-red-600 transition-colors p-1" title="Elimina Voce"><Trash2 className="w-4 h-4" /></button>
                          </>
                      )}
                   </div>
                )}
                {isCategoryLocked && <Lock className="w-3 h-3 text-gray-300 mx-auto" />}
            </td>
         </tr>
         
         {!isArticleLocked && (
           <>
            <tr className="bg-gray-50/50 border-b border-gray-100">
                <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                <td className="px-3 py-1 text-[9px] font-black text-blue-600 uppercase tracking-widest border-r border-gray-200 bg-white/50 flex items-center justify-between">
                    <span>MISURE</span>
                    <div className="flex items-center gap-1.5">
                        <style>{`
                          @keyframes pulse-automation {
                            0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
                            50% { transform: scale(1.1); opacity: 0.8; box-shadow: 0 0 0 8px rgba(37, 99, 235, 0); }
                            100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
                          }
                          .automation-active {
                            animation: pulse-automation 1s infinite ease-in-out;
                            background-color: #2563eb !important;
                            color: white !important;
                          }
                        `}</style>
                        <button 
                            onClick={() => onOpenPaintingCalculator(article.id)}
                            className={`bg-blue-100 hover:bg-blue-800 text-blue-600 hover:text-white p-1 rounded-md transition-all flex items-center gap-1 shadow-sm group/paint ${isPaintingAutomationWaiting ? 'automation-active' : ''}`}
                            title="Calcolo Automatico Pitturazioni (Soffitto + Pareti)"
                        >
                            <Paintbrush className="w-2.5 h-2.5" />
                            <span className="text-[7px] font-black group-hover/paint:block hidden uppercase">Pitture</span>
                        </button>
                        <button 
                            onClick={() => onOpenRebarCalculator(article.id)}
                            className={`bg-slate-200 hover:bg-slate-800 text-slate-600 hover:text-white p-1 rounded-md transition-all flex items-center gap-1 shadow-sm group/rebar ${isRebarAutomationWaiting ? 'automation-active' : ''}`}
                            title="Calcolo Ferri d'Armatura"
                        >
                            <CircleDot className="w-2.5 h-2.5" />
                            <span className="text-[7px] font-black group-hover/rebar:block hidden uppercase">Ferri</span>
                        </button>
                    </div>
                </td>
                <td colSpan={9} className="border-r border-gray-200"></td>
            </tr>
            <tr className="h-1"><td colSpan={12} className="border-r border-gray-200 bg-white"></td></tr>
            {processedMeasurements.map((m, idx) => {
                const linkedArt = getLinkedInfo(m);
                const isSubtotal = m.type === 'subtotal';
                return (
                <tr key={m.id} draggable={!isPrintMode && !areControlsDisabled} onDragStart={(e) => handleMeasDragStart(e, idx)} onDragOver={(e) => handleMeasDragOver(e, m.id)} onDragLeave={() => setMeasurementDragOverId(null)} onDrop={(e) => handleMeasDrop(e, idx)} className={`text-xs group/row cursor-default transition-all ${m.type === 'deduction' ? 'text-red-600' : 'text-gray-800'} ${isSubtotal ? 'bg-yellow-50 font-bold' : ''} ${measurementDragOverId === m.id ? 'border-t-2 border-dashed border-green-500 bg-green-50' : (isSubtotal ? 'bg-yellow-50' : 'bg-white')} ${isArticleLocked ? 'opacity-70' : ''}`}>
                    <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                    <td className="pl-6 pr-2 py-1 border-r border-gray-200 relative">
                        {isSubtotal ? <div className="italic text-gray-600 text-right pr-2">Sommano parziale</div> : (
                            <>
                                <div className="absolute left-0 top-1/2 w-4 h-[1px] bg-gray-300"></div>
                                {m.linkedArticleId && linkedArt ? (
                                <div className="flex items-center space-x-2">
                                    <button onClick={() => onScrollToArticle(linkedArt.id)} className="flex items-center space-x-1 px-1 py-0.5 rounded hover:bg-blue-50 group/link transition-colors text-left">
                                        <span className="text-blue-600 font-bold hover:underline cursor-pointer text-[11px]">Vedi voce n. {getLinkedArticleNumber(linkedArt)}</span>
                                        <span className="text-gray-500 text-[10px]">
                                            ({m.linkedType === 'amount' ? formatCurrency(linkedArt.quantity * linkedArt.unitPrice) : `${formatNumber(linkedArt.quantity)} ${linkedArt.unit}`})
                                        </span>
                                        <LinkIcon className="w-3 h-3 text-blue-400 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                                    </button>
                                    </div>
                                ) : (
                                    isPrintMode ? <div className={`truncate ${m.type === 'deduction' ? 'italic' : ''}`}>{m.description}</div> : (
                                        <input 
                                          value={m.description} 
                                          autoFocus={m.id === lastAddedMeasurementId} 
                                          onFocus={() => onColumnFocus('desc')} 
                                          onBlur={() => onColumnFocus(null)} 
                                          onChange={(e) => onUpdateMeasurement(article.id, m.id, 'description', e.target.value)} 
                                          className={`w-full bg-transparent border-none p-0 focus:ring-0 ${m.type === 'deduction' ? 'text-red-600 placeholder-red-300' : 'placeholder-gray-300'} disabled:cursor-not-allowed`} 
                                          placeholder={m.type === 'deduction' ? "A dedurre..." : "Descrizione misura..."} 
                                          disabled={areControlsDisabled}
                                        />
                                    )
                                )}
                            </>
                        )}
                    </td>
                    <td className="border-r border-gray-200 p-0 bg-gray-50">
                        {!isPrintMode && !isSubtotal ? <input type="number" disabled={areControlsDisabled} onFocus={() => onColumnFocus('mult')} onBlur={() => onColumnFocus(null)} className="w-full text-center bg-transparent border-none text-xs focus:bg-white placeholder-gray-300 disabled:cursor-not-allowed h-full" value={m.multiplier === undefined ? '' : m.multiplier} placeholder="1" onChange={(e) => onUpdateMeasurement(article.id, m.id, 'multiplier', e.target.value === '' ? undefined : parseFloat(e.target.value))} /> : (m.multiplier && <div className="text-center">{m.multiplier}</div>)}
                    </td>
                    <td className="border-r border-gray-200 p-0 bg-gray-50">
                        {m.linkedArticleId || isSubtotal ? <div className="text-center text-gray-300">-</div> : (!isPrintMode ? <input type="number" disabled={areControlsDisabled} onFocus={() => onColumnFocus('len')} onBlur={() => onColumnFocus(null)} className="w-full text-center bg-transparent border-none text-xs focus:bg-white disabled:cursor-not-allowed h-full" value={m.length === undefined ? '' : m.length} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'length', e.target.value === '' ? undefined : parseFloat(e.target.value))} /> : <div className="text-center">{formatNumber(m.length)}</div>)}
                    </td>
                    <td className="border-r border-gray-200 p-0 bg-gray-50">
                        {m.linkedArticleId || isSubtotal ? <div className="text-center text-gray-300">-</div> : (!isPrintMode ? <input type="number" disabled={areControlsDisabled} onFocus={() => onColumnFocus('wid')} onBlur={() => onColumnFocus(null)} className="w-full text-center bg-transparent border-none text-xs focus:bg-white disabled:cursor-not-allowed h-full" value={m.width === undefined ? '' : m.width} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'width', e.target.value === '' ? undefined : parseFloat(e.target.value))} /> : <div className="text-center">{formatNumber(m.width)}</div>)}
                    </td>
                    <td className="border-r border-gray-200 p-0 bg-gray-50">
                        {m.linkedArticleId || isSubtotal ? <div className="text-center text-gray-300">-</div> : (!isPrintMode ? <input type="number" data-last-meas-field="true" disabled={areControlsDisabled} onFocus={() => onColumnFocus('h')} onBlur={() => onColumnFocus(null)} className="w-full text-center bg-transparent border-none text-xs focus:bg-white disabled:cursor-not-allowed h-full" value={m.height === undefined ? '' : m.height} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'height', e.target.value === '' ? undefined : parseFloat(e.target.value))} /> : <div className="text-center">{formatNumber(m.height)}</div>)}
                    </td>
                    <td className={`border-r border-gray-200 text-right font-mono pr-1 ${isSubtotal ? 'bg-yellow-100 text-black border-t border-b border-gray-400' : 'bg-white text-gray-600'} ${m.linkedArticleId ? 'font-bold text-blue-700' : ''}`}>{formatNumber(m.displayValue)}</td>
                    <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                    <td className="text-center print:hidden bg-white border-l border-gray-200">
                        {!isPrintMode && !areControlsDisabled && (
                            <div className="flex justify-center items-center space-x-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                {!isSubtotal && (
                                    <>
                                        <button onClick={() => onOpenLinkModal(article.id, m.id)} className={`rounded p-0.5 transition-colors ${m.linkedArticleId ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`} title={m.linkedArticleId ? "Modifica Collegamento" : "Vedi Voce (Collega)"}><LinkIcon className="w-3.5 h-3.5" /></button>
                                        <div className="w-px h-3 bg-gray-300 mx-1"></div>
                                        <button onClick={() => onToggleDeduction(article.id, m.id)} className={`transition-colors p-0.5 rounded ${m.type === 'positive' ? 'text-red-400 hover:text-red-600 hover:bg-red-50' : 'text-blue-400 hover:text-blue-600 hover:bg-blue-50'}`} title={m.type === 'positive' ? "Trasforma in Deduzione" : "Trasforma in Positivo"}>{m.type === 'positive' ? <MinusCircle className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5" />}</button>
                                    </>
                                )}
                                <button onClick={() => onDeleteMeasurement(article.id, m.id)} className="text-gray-300 hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-colors" title="Elimina Rigo"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                        )}
                    </td>
                </tr>
                );})}
           </>
         )}

         <tr className="bg-white font-bold text-xs border-t border-gray-300 shadow-inner">
             <td className="border-r border-gray-300"></td><td className="border-r border-gray-200"></td>
             <td className="px-2 py-3 text-right border-r border-gray-300 uppercase text-gray-400 text-[10px]">Sommano {isPrintMode ? article.unit : <input readOnly value={article.unit} className="w-8 bg-transparent border-b border-dotted border-gray-400 text-center outline-none inline-block disabled:cursor-not-allowed cursor-default" disabled={true} />}</td>
             <td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td>
             <td className="text-right pr-1 font-mono border-r border-gray-200 bg-gray-50 font-black">{formatNumber(article.quantity)}</td>
             <td className="border-l border-r border-gray-300 text-right pr-1 font-mono">{isPrintMode ? formatNumber(article.unitPrice) : <input readOnly type="number" value={article.unitPrice} className="w-full text-right bg-transparent border-none focus:ring-0 disabled:cursor-not-allowed cursor-default" disabled={true} />}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-blue-900 font-black">{formatNumber(totalAmount)}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-gray-500 font-normal">
                 <div className="flex flex-col items-end leading-none py-1"><span>{formatCurrency(laborValue)}</span><span className="text-[9px] text-gray-400">({article.laborRate}%)</span></div>
             </td>
             <td className="text-center print:hidden bg-gray-50 border-l border-gray-200">
                {!isPrintMode && !areControlsDisabled && (
                   <div className="flex items-center justify-center space-x-1">
                        <button onClick={() => onAddSubtotal(article.id)} className="w-5 h-5 rounded-full flex items-center justify-center text-orange-400 hover:text-white hover:bg-orange-500 transition-all border border-orange-200 hover:border-orange-500 shadow-sm" title="Inserisci Sommano Parziale"><Sigma className="w-3 h-3" /></button>
                        <button ref={addBtnRef} onClick={() => onAddMeasurement(article.id)} className="w-6 h-6 rounded-full flex items-center justify-center text-blue-600 hover:text-white hover:bg-blue-600 transition-all border border-blue-200 hover:border-blue-600 shadow-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" title="Aggiungi rigo misura"><Plus className="w-4 h-4" /></button>
                   </div>
                )}
             </td>
         </tr>
         <tr className="h-6 bg-[#f0f2f5] border-none"><td colSpan={12} className="border-none"></td></tr>
      </tbody>
   );
};

const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | 'visitor' | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);

  const [isRebarModalOpen, setIsRebarModalOpen] = useState(false);
  const [rebarTargetArticleId, setRebarTargetArticleId] = useState<string | null>(null);
  const [shouldAutoReopenRebar, setShouldAutoReopenRebar] = useState(false);
  const [isRebarAutomationWaiting, setIsRebarAutomationWaiting] = useState(false);

  const [isPaintingModalOpen, setIsPaintingModalOpen] = useState(false);
  const [paintingTargetArticleId, setPaintingTargetArticleId] = useState<string | null>(null);
  const [shouldAutoReopenPainting, setShouldAutoReopenPainting] = useState(false);
  const [isPaintingAutomationWaiting, setIsPaintingAutomationWaiting] = useState(false);

  // Timer references for automations
  const rebarTimerRef = useRef<any>(null);
  const paintingTimerRef = useRef<any>(null);

  // LOGICA AUTH
  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => { 
        setUser(firebaseUser);
        setAuthLoading(false); 
    });
    return () => unsubscribe();
  }, []);

  const stopAllAutomations = useCallback(() => {
    if (rebarTimerRef.current) clearTimeout(rebarTimerRef.current);
    if (paintingTimerRef.current) clearTimeout(paintingTimerRef.current);
    setShouldAutoReopenRebar(false);
    setShouldAutoReopenPainting(false);
    setIsRebarAutomationWaiting(false);
    setIsPaintingAutomationWaiting(false);
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
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [activeSoaCategory, setActiveSoaCategory] = useState<string>('OG1');
  const [wbsDropTarget, setWbsDropTarget] = useState<{ code: string, position: 'top' | 'bottom' } | null>(null);
  const [isDraggingArticle, setIsDraggingArticle] = useState(false);
  const [isAnalysisEditorOpen, setIsAnalysisEditorOpen] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState<PriceAnalysis | null>(null);
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');
  const [isImportAnalysisModalOpen, setIsImportAnalysisModalOpen] = useState(false);
  const [activeCategoryForAi, setActiveCategoryForAi] = useState<string | null>(null);
  const [wbsOptionsContext, setWbsOptionsContext] = useState<{ type: 'import' | 'duplicate', sourceCode?: string, payload?: any, initialName?: string, targetCode?: string, position?: 'top' | 'bottom' } | null>(null);
  const [showAutoLoginAd, setShowAutoLoginAd] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isVisitor = user === 'visitor';

  const canAddArticle = useCallback((newCountToAdd: number = 1): boolean => {
    if (!isVisitor) return true;
    const currentTotal = articles.length;
    if (currentTotal + newCountToAdd > 10) {
      alert(`VERSIONE DEMO: Limite di 10 voci raggiunto.`);
      return false;
    }
    return true;
  }, [isVisitor, articles.length]);

  const handleVisitorLogin = () => {
    setUser('visitor');
    setShowAutoLoginAd(true);
  };

  const updateState = (newArticles: Article[], newCategories: Category[] = categories, newAnalyses: PriceAnalysis[] = analyses, saveHistory: boolean = true) => {
      const recomputed = recalculateAllArticles(newArticles);
      if (saveHistory) {
          setHistory(prev => { const newHist = [...prev, { articles, categories, analyses }]; return newHist.length > 50 ? newHist.slice(newHist.length - 50) : newHist; });
          setFuture([]); 
      }
      setArticles(recomputed);
      setCategories(newCategories);
      setAnalyses(newAnalyses);
  };

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setFuture(prev => [{ articles, categories, analyses }, ...prev]);
    setHistory(history.slice(0, -1));
    setArticles(previous.articles);
    setCategories(previous.categories);
    setAnalyses(previous.analyses);
  }, [history, articles, categories, analyses]);

  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(prev => [...prev, { articles, categories, analyses }]);
    setFuture(future.slice(1));
    setArticles(next.articles);
    setCategories(next.categories);
    setAnalyses(next.analyses);
  }, [future, articles, categories, analyses]);

  const totals: Totals = useMemo(() => {
    const totalWorks = articles.reduce((acc, art) => {
        const cat = categories.find(c => c.code === art.categoryCode);
        if (cat && (cat.isEnabled === false)) return acc;
        return acc + (art.quantity * art.unitPrice);
    }, 0);
    const safetyCosts = totalWorks * (projectInfo.safetyRate / 100);
    const totalTaxable = totalWorks + safetyCosts;
    const vatAmount = totalTaxable * (projectInfo.vatRate / 100);
    const grandTotal = totalTaxable + vatAmount;
    return { totalWorks, safetyCosts, totalTaxable, vatAmount, grandTotal };
  }, [articles, categories, projectInfo.safetyRate, projectInfo.vatRate]);

  const categoryTotals = useMemo(() => {
    const lookup: Record<string, number> = {};
    categories.forEach(cat => {
      const catTotal = articles.filter(a => a.categoryCode === cat.code).reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
      lookup[cat.code] = catTotal;
    });
    return lookup;
  }, [articles, categories]);

  // MODALS HANDLERS
  const handleOpenRebarCalculator = (articleId: string) => {
    setRebarTargetArticleId(articleId);
    setShouldAutoReopenRebar(true);
    setIsRebarModalOpen(true);
  };

  const handleOpenPaintingCalculator = (articleId: string) => {
    setPaintingTargetArticleId(articleId);
    setShouldAutoReopenPainting(true);
    setIsPaintingModalOpen(true);
  };

  const handleAddRebarMeasurement = (rebarData: { diameter: number; weight: number; multiplier: number; length: number; description: string }) => {
    if (!rebarTargetArticleId) return;
    const newId = Math.random().toString(36).substr(2, 9);
    setLastAddedMeasurementId(newId);
    const updated = articles.map(art => {
      if (art.id !== rebarTargetArticleId) return art;
      const newM: Measurement = { id: newId, description: rebarData.description, type: 'positive', multiplier: rebarData.multiplier, length: rebarData.length, width: undefined, height: rebarData.weight };
      return { ...art, measurements: [...art.measurements, newM] };
    });
    updateState(updated);
    setIsRebarModalOpen(false);
    if (shouldAutoReopenRebar) {
        setIsRebarAutomationWaiting(true);
        if (rebarTimerRef.current) clearTimeout(rebarTimerRef.current);
        rebarTimerRef.current = setTimeout(() => {
            setIsRebarAutomationWaiting(prev => {
                if (prev) setIsRebarModalOpen(true);
                return false;
            });
        }, 5000); 
    }
  };

  const handleAddPaintingMeasurements = (paintRows: Array<{ description: string; multiplier: number; length?: number; width?: number; height?: number; type: 'positive' }>) => {
    if (!paintingTargetArticleId) return;
    const updated = articles.map(art => {
        if (art.id !== paintingTargetArticleId) return art;
        const newMeasures = paintRows.map(row => ({ ...row, id: Math.random().toString(36).substr(2, 9) }));
        return { ...art, measurements: [...art.measurements, ...newMeasures] };
    });
    updateState(updated);
    setIsPaintingModalOpen(false);
    if (shouldAutoReopenPainting) {
        setIsPaintingAutomationWaiting(true);
        if (paintingTimerRef.current) clearTimeout(paintingTimerRef.current);
        paintingTimerRef.current = setTimeout(() => {
            setIsPaintingAutomationWaiting(prev => {
                if (prev) setIsPaintingModalOpen(true);
                return false;
            });
        }, 5000);
    }
  };

  const handleAddVoiceMeasurement = async (articleId: string, data: Partial<Measurement>) => {
    const newId = Math.random().toString(36).substr(2, 9);
    setLastAddedMeasurementId(newId);
    const updated = articles.map(art => {
      if (art.id !== articleId) return art;
      const newM: Measurement = { 
        id: newId, 
        description: data.description || '', 
        type: 'positive', 
        length: data.length, 
        width: data.width, 
        height: data.height, 
        multiplier: data.multiplier 
      };
      return { ...art, measurements: [...art.measurements, newM] };
    });
    updateState(updated);
  };

  const handleViewLinkedAnalysis = (analysisId: string) => {
    const analysis = analyses.find(a => a.id === analysisId);
    if (analysis) { 
      setEditingAnalysis(analysis); 
      setIsAnalysisEditorOpen(true); 
    } else { 
      alert("Attenzione: L'analisi originale non è stata trovata."); 
    }
  };

  const handleImportAnalysisToArticle = (analysis: PriceAnalysis) => {
    if (!canAddArticle()) return;
    const targetCode = activeCategoryForAi || selectedCategoryCode;
    const laborRate = analysis.totalBatchValue > 0 ? parseFloat(((analysis.totalLabor / analysis.totalBatchValue) * 100).toFixed(2)) : 0;
    const newArticle: Article = {
      id: Math.random().toString(36).substr(2, 9),
      categoryCode: targetCode,
      code: analysis.code,
      description: analysis.description,
      unit: analysis.unit,
      unitPrice: roundTwoDecimals(analysis.totalUnitPrice),
      laborRate: laborRate,
      linkedAnalysisId: analysis.id,
      priceListSource: `Da Analisi ${analysis.code}`,
      soaCategory: activeSoaCategory,
      measurements: [{ id: Math.random().toString(36).substr(2, 9), description: '', type: 'positive' }],
      quantity: 0
    };
    updateState([...articles, newArticle]);
    setIsImportAnalysisModalOpen(false);
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => { 
    const file = e.target.files?.[0]; 
    if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = (event) => { 
        try { 
            const content = event.target?.result as string; 
            const data = JSON.parse(content); 
            if (data.gecolaData) { 
                setProjectInfo(data.gecolaData.projectInfo); 
                updateState(data.gecolaData.articles, data.gecolaData.categories, data.gecolaData.analyses || []); 
            } else { alert("Formato non valido."); } 
            setCurrentFileHandle(null); 
        } catch (error) { alert("Errore caricamento."); } 
    }; 
    reader.readAsText(file); 
    e.target.value = ''; 
  };

  const handleUpdateArticle = (id: string, field: keyof Article, value: string | number) => { const updated = articles.map(art => art.id === id ? { ...art, [field]: value } : art); updateState(updated); };
  const handleEditArticleDetails = (article: Article) => { setEditingArticle(article); setIsEditArticleModalOpen(true); };
  
  // Added missing handleArticleEditSave handler
  const handleArticleEditSave = (id: string, updates: Partial<Article>) => {
    const updated = articles.map(art => art.id === id ? { ...art, ...updates } : art);
    updateState(updated);
  };

  const onDeleteArticle = (id: string) => { if (window.confirm("Seleziona Conferma per eliminare?")) { const updated = articles.filter(art => art.id !== id); updateState(updated); } };
  const onAddMeasurement = (articleId: string) => { const newId = Math.random().toString(36).substr(2, 9); setLastAddedMeasurementId(newId); const updated = articles.map(art => { if (art.id !== articleId) return art; const newM: Measurement = { id: newId, description: '', type: 'positive' }; return { ...art, measurements: [...art.measurements, newM] }; }); updateState(updated); };
  const onAddSubtotal = (articleId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newM: Measurement = { id: Math.random().toString(36).substr(2, 9), description: '', type: 'subtotal' }; return { ...art, measurements: [...art.measurements, newM] }; }); updateState(updated); };
  const onUpdateMeasurement = (articleId: string, mId: string, field: keyof Measurement, value: any) => { const updated = articles.map(art => { if (art.id !== articleId) return art; return { ...art, measurements: art.measurements.map(m => m.id === mId ? { ...m, [field]: value } : m) }; }); updateState(updated); };
  const onDeleteMeasurement = (articleId: string, mId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; return { ...art, measurements: art.measurements.filter(m => m.id !== mId) }; }); updateState(updated); };
  const onToggleDeduction = (articleId: string, mId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; return { ...art, measurements: art.measurements.map(m => m.id === mId ? { ...m, type: m.type === 'positive' ? 'deduction' : 'positive' } : m) }; }); updateState(updated); };
  
  // Added missing handleLinkMeasurement handler
  const handleLinkMeasurement = (sourceArticle: Article, type: 'quantity' | 'amount') => {
    if (!linkTarget) return;
    const updated = articles.map(art => {
      if (art.id !== linkTarget.articleId) return art;
      return {
        ...art,
        measurements: art.measurements.map(m => {
          if (m.id !== linkTarget.measurementId) return m;
          return {
            ...m,
            linkedArticleId: sourceArticle.id,
            linkedType: type,
            description: '',
            length: undefined,
            width: undefined,
            height: undefined,
            multiplier: undefined,
            type: 'positive'
          };
        })
      };
    });
    updateState(updated);
    setIsLinkModalOpen(false);
    setLinkTarget(null);
  };

  const onToggleArticleLock = (id: string) => { const updated = articles.map(art => art.id === id ? { ...art, isLocked: !art.isLocked } : art); updateState(updated); };
  const handleWbsDrop = (e: React.DragEvent, targetCode: string | null) => { e.preventDefault(); setWbsDropTarget(null); };
  const handleSaveCategory = (name: string) => { if (editingCategory) { setCategories(categories.map(c => c.code === editingCategory.code ? { ...c, name } : c)); } else { const newCat = { code: generateNextWbsCode(categories), name, isEnabled: true, isLocked: false }; setCategories([...categories, newCat]); } };

  const activeArticles = useMemo(() => articles.filter(a => a.categoryCode === selectedCategoryCode), [articles, selectedCategoryCode]);
  const activeCategory = useMemo(() => categories.find(c => c.code === selectedCategoryCode), [categories, selectedCategoryCode]);

  return (
    <div 
        className="h-screen flex flex-col bg-[#e8eaed] font-sans overflow-hidden text-slate-800"
        onClick={stopAllAutomations}
    >
      <input type="file" ref={fileInputRef} onChange={handleLoadProject} className="hidden" accept=".json" />
      {!user ? <Login onVisitorLogin={handleVisitorLogin} /> : (
        <>
          {showAutoLoginAd && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/95 backdrop-blur-xl animate-in fade-in duration-500">
               <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 flex flex-col h-[80vh]">
                  <div className="bg-[#2c3e50] p-6 flex justify-between items-center text-white border-b border-slate-600">
                      <div className="flex items-center gap-3">
                          <Award className="w-6 h-6 text-orange-400" />
                          <h3 className="font-black uppercase tracking-tighter text-xl">Partner Tecnico del Giorno</h3>
                      </div>
                      <button 
                        onClick={() => setShowAutoLoginAd(false)}
                        className="bg-white/10 hover:bg-orange-600 text-white px-6 py-2 rounded-full font-black uppercase text-xs transition-all shadow-lg active:scale-90 animate-pulse"
                      >
                        Prosegui al Progetto
                      </button>
                  </div>
                  <div className="flex-1 relative bg-slate-50">
                      <iframe 
                        src="https://www.mapei.com/it/it/home-page" 
                        className="w-full h-full border-none"
                        title="Banner Mapei Interstiziale"
                      />
                  </div>
                  <div className="p-4 bg-slate-100 border-t border-slate-200 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Questo spazio pubblicitario sostiene lo sviluppo gratuito di GeCoLa Cloud</p>
                  </div>
               </div>
            </div>
          )}

          <div className="bg-[#2c3e50] shadow-md z-50 h-14 flex items-center justify-between px-6 border-b border-slate-600 flex-shrink-0">
              <div className="flex items-center space-x-3 w-72">
                <div className="bg-orange-500 p-1.5 rounded-lg shadow-lg"><Calculator className="w-5 h-5 text-white" /></div>
                <span className="font-bold text-lg text-white">GeCoLa <span className="font-light opacity-80">v11.9.1</span></span>
                <button onClick={(e) => { e.stopPropagation(); setIsManualOpen(true); }} className="ml-2 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg transition-all hover:scale-110 active:scale-95 group relative">
                    <HelpCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 px-6 flex justify-center items-center gap-6">
                  {isVisitor && (
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 bg-blue-600/20 border border-blue-500/50 px-3 py-1 rounded-full text-blue-200 text-[10px] font-black uppercase tracking-widest">
                            <Sparkles className="w-3 h-3" /> Account Versione Demo
                        </div>
                        <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${articles.length >= 10 ? 'bg-red-600 border-red-500 text-white animate-bounce' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                            Voci Utilizzate: {articles.length} / 10
                        </div>
                      </div>
                  )}
                  {!isVisitor && (
                    <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-1.5 rounded-full border border-slate-700 text-white font-bold text-sm cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => setIsSettingsModalOpen(true)}>
                        <span className="truncate max-w-[250px]">{projectInfo.title}</span>
                        <Edit3 className="w-3 h-3 text-slate-400 ml-1" />
                    </div>
                  )}
                  <div className="flex items-center bg-slate-800/30 rounded-full px-2 py-1 gap-1">
                    <button onClick={handleUndo} disabled={history.length === 0} className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-all"><Undo2 className="w-4 h-4" /></button>
                    <button onClick={handleRedo} disabled={future.length === 0} className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-all"><Redo2 className="w-4 h-4" /></button>
                  </div>
              </div>
              <div className="flex items-center space-x-2">
                 <button onClick={() => setIsSaveMenuOpen(!isSaveMenuOpen)} className="p-2 text-slate-300 hover:text-blue-400"><Download className="w-5 h-5" /></button>
                 <button onClick={() => setIsPrintMenuOpen(!isPrintMenuOpen)} className="p-2 text-slate-300 hover:text-white"><FileText className="w-5 h-5" /></button>
                 <button onClick={() => signOut(auth)} className="p-2 text-red-400 hover:text-white ml-2"><LogOut className="w-5 h-5" /></button>
              </div>
          </div>
          
          <div className="flex flex-1 overflow-hidden print:hidden">
            <div className="w-64 bg-white border-r border-slate-300 flex flex-col flex-shrink-0 z-10 shadow-lg">
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex gap-1">
                 <button onClick={() => setViewMode('COMPUTO')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${viewMode === 'COMPUTO' ? 'bg-white text-blue-700 ring-1 ring-blue-200 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>Computo</button>
                 <button onClick={() => setViewMode('ANALISI')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${viewMode === 'ANALISI' ? 'bg-white text-purple-700 ring-1 ring-purple-200 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>Analisi</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                  {viewMode === 'COMPUTO' ? (
                    <>
                      <div className="p-3 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase flex justify-between items-center tracking-widest">
                        <span>Indice WBS</span>
                        <PlusCircle className="w-4 h-4 text-blue-600 cursor-pointer" onClick={() => { setEditingCategory(null); setIsCategoryModalOpen(true); }}/>
                      </div>
                      <ul>
                          {categories.map(cat => (
                          <li key={cat.code} className="border-b border-gray-100 cursor-pointer" onClick={() => setSelectedCategoryCode(cat.code)}>
                              <div className={`w-full text-left pl-3 pr-2 py-3 border-l-4 transition-all flex flex-col ${selectedCategoryCode === cat.code ? 'bg-blue-50 border-blue-500' : 'border-transparent hover:bg-slate-50'}`}>
                                  <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 w-fit">{cat.code}</span>
                                  <span className="text-xs font-semibold block truncate pr-8 mt-1">{cat.name}</span>
                              </div>
                          </li>
                          ))}
                      </ul>
                      <div className="mt-auto p-3 border-t border-gray-300 bg-slate-50 sticky bottom-0 z-20">
                          <button onClick={() => setSelectedCategoryCode('SUMMARY')} className={`w-full flex items-center p-2.5 rounded text-xs font-black uppercase transition-colors ${selectedCategoryCode === 'SUMMARY' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-white'}`}>
                              <Layers className="w-4 h-4 mr-2" /> Riepilogo Generale
                          </button>
                      </div>
                    </>
                  ) : <div className="p-4 text-center text-xs text-gray-400">Archivio Analisi...</div>}
              </div>
            </div>

            <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f0f2f5] p-5 gap-4">
               {activeCategory && selectedCategoryCode !== 'SUMMARY' && viewMode === 'COMPUTO' && (
                   <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-300 shadow-sm animate-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-3">
                             <div className="bg-[#2c3e50] text-white p-2.5 rounded-lg shadow-lg font-black text-xl">{activeCategory.code}</div>
                             <div><h2 className="text-lg font-black text-slate-800 uppercase max-w-[400px] truncate tracking-tight">{activeCategory.name}</h2><span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{formatCurrency(categoryTotals[activeCategory.code] || 0)}</span></div>
                        </div>
                        <button onClick={() => { setActiveCategoryForAi(activeCategory.code); setIsImportAnalysisModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700 transition-all flex items-center gap-2 text-xs">
                               <Plus className="w-4 h-4" /> Aggiungi Voce
                        </button>
                   </div>
               )}

               <div className="flex-1 overflow-y-auto rounded-xl bg-white shadow-2xl border border-gray-300 flex flex-col relative">
                  {viewMode === 'COMPUTO' && (
                      selectedCategoryCode === 'SUMMARY' ? (
                          <div className="p-8"><Summary totals={totals} info={projectInfo} categories={categories} articles={articles} /></div>
                      ) : activeCategory ? (
                          <div key={activeCategory.code} className="flex flex-col h-full">
                              <div className="flex-1 overflow-x-auto">
                                  <table className="w-full text-left border-collapse">
                                      <TableHeader activeColumn={activeColumn} />
                                      {activeArticles.map((article, artIndex) => (
                                          <ArticleGroup 
                                            key={article.id} 
                                            article={article} 
                                            index={artIndex} 
                                            allArticles={articles} 
                                            isPrintMode={false} 
                                            isCategoryLocked={activeCategory.isLocked} 
                                            onUpdateArticle={handleUpdateArticle} 
                                            onEditArticleDetails={handleEditArticleDetails} 
                                            onDeleteArticle={onDeleteArticle} 
                                            onAddMeasurement={onAddMeasurement} 
                                            onAddSubtotal={onAddSubtotal} 
                                            onAddVoiceMeasurement={handleAddVoiceMeasurement} 
                                            onUpdateMeasurement={onUpdateMeasurement} 
                                            onDeleteMeasurement={onDeleteMeasurement} 
                                            onToggleDeduction={onToggleDeduction} 
                                            onOpenLinkModal={(artId, mId) => { setLinkTarget({ articleId: artId, measurementId: mId }); setIsLinkModalOpen(true); }} 
                                            onScrollToArticle={(id) => { document.getElementById(`article-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} 
                                            onReorderMeasurements={() => {}} 
                                            onArticleDragStart={() => setIsDraggingArticle(true)} 
                                            onArticleDrop={() => {}} 
                                            onArticleDragEnd={() => setIsDraggingArticle(false)} 
                                            lastAddedMeasurementId={lastAddedMeasurementId} 
                                            onColumnFocus={setActiveColumn} 
                                            onViewAnalysis={handleViewLinkedAnalysis} 
                                            onInsertExternalArticle={() => {}} 
                                            onToggleArticleLock={onToggleArticleLock} 
                                            onOpenRebarCalculator={handleOpenRebarCalculator} 
                                            onOpenPaintingCalculator={handleOpenPaintingCalculator} 
                                            isPaintingAutomationWaiting={isPaintingAutomationWaiting && paintingTargetArticleId === article.id}
                                            isRebarAutomationWaiting={isRebarAutomationWaiting && rebarTargetArticleId === article.id}
                                          />
                                      ))}
                                  </table>
                              </div>
                          </div>
                      ) : null
                  )}
               </div>
            </div>
          </div>

          {/* MODALS */}
          <HelpManualModal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
          <ProjectSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} info={projectInfo} onSave={setProjectInfo} />
          <CategoryEditModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} onSave={handleSaveCategory} initialData={editingCategory} nextWbsCode={generateNextWbsCode(categories)} />
          <RebarCalculatorModal isOpen={isRebarModalOpen} onClose={() => { setIsRebarModalOpen(false); stopAllAutomations(); }} onAdd={handleAddRebarMeasurement} />
          <PaintingCalculatorModal isOpen={isPaintingModalOpen} onClose={() => { setIsPaintingModalOpen(false); stopAllAutomations(); }} onAdd={handleAddPaintingMeasurements} />
          <ImportAnalysisModal isOpen={isImportAnalysisModalOpen} onClose={() => setIsImportAnalysisModalOpen(false)} analyses={analyses} onImport={handleImportAnalysisToArticle} onCreateNew={() => {}} />
          {editingArticle && <ArticleEditModal isOpen={isEditArticleModalOpen} onClose={() => setIsEditArticleModalOpen(false)} article={editingArticle} onSave={handleArticleEditSave} />}
          {linkTarget && <LinkArticleModal isOpen={isLinkModalOpen} onClose={() => { setIsLinkModalOpen(false); setLinkTarget(null); }} articles={articles} currentArticleId={linkTarget.articleId} onLink={handleLinkMeasurement} />}
        </>
      )}
    </div>
  );
};

export default App;
