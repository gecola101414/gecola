
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

   const handleArticleHeaderDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      if (isCategoryLocked) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const midPoint = rect.top + rect.height / 2;
      const isTop = e.clientY < midPoint;
      setArticleDropPosition(isTop ? 'top' : 'bottom');
      setIsArticleDragOver(true);
   };

   const handleArticleHeaderDragLeave = () => {
       setIsArticleDragOver(false);
       setArticleDropPosition(null);
   };

   const handleArticleHeaderDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isCategoryLocked) {
          setIsArticleDragOver(false);
          setArticleDropPosition(null);
          return;
      }
      const textData = e.dataTransfer.getData('text');
      const isExternal = textData && !e.dataTransfer.getData('type');
      if (isExternal) {
          const insertionIndex = articleDropPosition === 'bottom' ? index + 1 : index;
          onInsertExternalArticle(insertionIndex, textData);
      } else {
          const type = e.dataTransfer.getData('type');
          if (type === 'ARTICLE') {
              onArticleDrop(e, article.id, articleDropPosition || 'bottom');
          }
      }
      setIsArticleDragOver(false);
      setArticleDropPosition(null);
   };

   const startListening = (e: React.SyntheticEvent) => {
      if (areControlsDisabled) return;
      if (e.type === 'mousedown' || e.type === 'touchstart') e.preventDefault();
      if (!('webkitSpeechRecognition' in window)) {
          alert("Il tuo browser non supporta il riconoscimento vocale. Usa Chrome.");
          return;
      }
      if (recognitionRef.current) return;
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.lang = 'it-IT';
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onstart = () => setIsListening(true);
      let finalTranscript = '';
      recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; ++i) {
             if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
          }
      };
      recognition.onend = async () => {
          setIsListening(false);
          recognitionRef.current = null;
          if (finalTranscript.trim()) {
             const parsed = await parseVoiceMeasurement(finalTranscript);
             if (parsed) onAddVoiceMeasurement(article.id, parsed);
          }
      };
      recognitionRef.current = recognition;
      recognition.start();
   };

   const stopListening = (e: React.SyntheticEvent) => {
      e.preventDefault();
      if (recognitionRef.current) recognitionRef.current.stop(); 
   };

   return (
      <tbody id={`article-${article.id}`} className={`bg-white border-b border-gray-400 group/article transition-colors relative ${isArticleLocked ? 'bg-gray-50' : ''}`}>
         {isArticleDragOver && articleDropPosition === 'top' && (
             <tr className="h-0 p-0 border-none"><td colSpan={12} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-green-500 -top-0.5 z-50 shadow-[0_0_8px_rgba(34,197,94,0.8)] pointer-events-none"></div></td></tr>
         )}
         <tr 
            className={`align-top ${!isPrintMode ? 'cursor-move hover:bg-slate-50' : ''} ${isArticleDragOver ? 'bg-green-50/10' : ''}`}
            draggable={!isPrintMode && !areControlsDisabled}
            onDragStart={handleArticleHeaderDragStart}
            onDragEnd={handleArticleHeaderDragEnd}
            onDragOver={handleArticleHeaderDragOver}
            onDragLeave={handleArticleHeaderDragLeave}
            onDrop={handleArticleHeaderDrop}
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
                    className={`w-full min-h-[50px] text-sm text-gray-900 font-serif text-justify border-none focus:ring-0 bg-transparent resize-y p-1 disabled:text-gray-400 cursor-default scrollbar-hide ${isArticleLocked ? 'text-gray-400 italic' : ''}`}
                    placeholder="Descrizione..."
                    disabled={true}
                 />
               )}
               {/* Grounding Citations as required by guidelines */}
               {article.groundingUrls && article.groundingUrls.length > 0 && (
                 <div className="mt-3 px-1 border-t border-gray-100 pt-2 animate-in fade-in slide-in-from-bottom-1 duration-500">
                   <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-tight mb-1">
                     <Search className="w-3 h-3" /> Fonti consultate:
                   </div>
                   <div className="flex flex-wrap gap-2">
                     {article.groundingUrls.map((chunk: any, i: number) => {
                       const source = chunk.web || chunk.maps;
                       if (!source) return null;
                       return (
                         <a 
                           key={i} 
                           href={source.uri} 
                           target="_blank" 
                           rel="noopener noreferrer"
                           className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 hover:bg-blue-100 transition-colors text-[9px] font-medium max-w-[200px]"
                         >
                           <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                           <span className="truncate">{source.title || 'Link'}</span>
                         </a>
                       );
                     })}
                   </div>
                 </div>
               )}
            </td>
            <td colSpan={8} className="border-r border-gray-200 bg-white"></td>
            <td className="print:hidden text-center align-top pt-2 bg-gray-50/30">
                {!isPrintMode && !isCategoryLocked && (
                   <div className="flex flex-col items-center space-y-1">
                      <button onClick={() => onToggleArticleLock(article.id)} className={`transition-colors p-1 rounded ${isArticleLocked ? 'text-red-500 hover:text-red-700 bg-red-50' : 'text-gray-300 hover:text-blue-500'}`} title={isArticleLocked ? "Sblocca Voce" : "Blocca Voce (Lavoro Fatto)"}>
                          {isArticleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                      {!isArticleLocked && (
                          <>
                            <button onClick={() => onDeleteArticle(article.id)} className="text-gray-300 hover:text-red-600 transition-colors" title="Elimina Voce"><Trash2 className="w-4 h-4" /></button>
                            <button onClick={() => onEditArticleDetails(article)} className="text-gray-300 hover:text-blue-600 transition-colors" title="Modifica Dettagli"><PenLine className="w-4 h-4" /></button>
                          </>
                      )}
                   </div>
                )}
                {isCategoryLocked && <Lock className="w-3 h-3 text-gray-300 mx-auto" />}
            </td>
         </tr>
         <tr><td className="border-r border-gray-200 bg-white"></td><td className="border-r border-gray-200 bg-white"></td><td className="px-3 pt-2 text-[10px] font-bold text-gray-500 uppercase border-r border-gray-200 bg-white">Misure</td><td colSpan={9} className="bg-white"></td></tr>
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
                                    <input value={m.description} autoFocus={m.id === lastAddedMeasurementId} onFocus={() => onColumnFocus('desc')} onBlur={() => onColumnFocus(null)} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'description', e.target.value)} className={`w-full bg-transparent border-none p-0 focus:ring-0 ${m.type === 'deduction' ? 'text-red-600 placeholder-red-300' : 'placeholder-gray-300'} disabled:cursor-not-allowed`} placeholder={m.type === 'deduction' ? "A dedurre..." : "Descrizione misura..."} disabled={areControlsDisabled} />
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
                    {m.linkedArticleId || isSubtotal ? <div className="text-center text-gray-300">-</div> : (!isPrintMode ? <input type="number" disabled={areControlsDisabled} onFocus={() => onColumnFocus('h')} onBlur={() => onColumnFocus(null)} className="w-full text-center bg-transparent border-none text-xs focus:bg-white disabled:cursor-not-allowed h-full" value={m.height === undefined ? '' : m.height} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'height', e.target.value === '' ? undefined : parseFloat(e.target.value))} /> : <div className="text-center">{formatNumber(m.height)}</div>)}
                </td>
                <td className={`border-r border-gray-200 text-right font-mono pr-1 ${isSubtotal ? 'bg-yellow-100 text-black border-t border-b border-gray-400' : 'bg-white text-gray-600'} ${m.linkedArticleId ? 'font-bold text-blue-700' : ''}`}>{formatNumber(m.displayValue)}</td>
                <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                <td className="text-center print:hidden bg-gray-50/50">
                    {!isPrintMode && !areControlsDisabled && (
                        <div className="flex justify-center items-center space-x-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                            {!isSubtotal && (
                                <>
                                    <button onClick={() => onOpenLinkModal(article.id, m.id)} className={`rounded p-0.5 transition-colors ${m.linkedArticleId ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-300 hover:text-blue-600 hover:bg-blue-50'}`} title={m.linkedArticleId ? "Modifica Collegamento" : "Vedi Voce (Collega)"}><LinkIcon className="w-3.5 h-3.5" /></button>
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
         <tr className="bg-white font-bold text-xs border-t border-gray-300 border-b-2 border-gray-400">
             <td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td>
             <td className="px-2 py-2 text-right border-r border-gray-300">Sommano {isPrintMode ? article.unit : <input readOnly value={article.unit} className="w-8 bg-transparent border-b border-dotted border-gray-400 text-center outline-none inline-block disabled:cursor-not-allowed cursor-default" disabled={true} />}</td>
             <td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td>
             <td className="text-right pr-1 font-mono text-black border-t-4 border-double border-gray-800">{formatNumber(article.quantity)}</td>
             <td className="border-l border-r border-gray-300 text-right pr-1 font-mono">{isPrintMode ? formatNumber(article.unitPrice) : <input readOnly type="number" value={article.unitPrice} className="w-full text-right bg-transparent border-none focus:ring-0 disabled:cursor-not-allowed cursor-default" disabled={true} />}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-blue-900">{formatNumber(totalAmount)}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-gray-600 font-normal">
                 <div className="flex flex-col items-end leading-none py-1"><span>{formatCurrency(laborValue)}</span><span className="text-[9px] text-gray-400">({article.laborRate}%)</span></div>
             </td>
             <td className="text-center border-gray-300 relative group/add align-middle print:hidden bg-gray-50">
                {!isPrintMode && !areControlsDisabled && (
                   <div className="flex items-center justify-center space-x-1">
                        <button onMouseDown={startListening} onMouseUp={stopListening} onMouseLeave={stopListening} onTouchStart={startListening} onTouchEnd={stopListening} className={`w-5 h-5 rounded-full flex items-center justify-center transition-all border shadow-sm ${isListening ? 'bg-purple-600 text-white animate-pulse border-purple-700' : 'text-purple-400 hover:text-white hover:bg-purple-500 border-purple-200'}`} title="Tieni premuto per parlare (Rilascia per caricare)"><Mic className="w-3 h-3" /></button>
                        <button onClick={() => onAddSubtotal(article.id)} className="w-5 h-5 rounded-full flex items-center justify-center text-orange-400 hover:text-white hover:bg-orange-500 transition-all border border-orange-200 hover:border-orange-500 shadow-sm" title="Inserisci Sommano Parziale"><Sigma className="w-3 h-3" /></button>
                        <button ref={addBtnRef} onClick={() => onAddMeasurement(article.id)} className="w-6 h-6 rounded-full flex items-center justify-center text-gray-500 hover:text-white hover:bg-slate-500 transition-all border border-gray-300 hover:border-slate-500 shadow-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" title="Nuovo Rigo Misura"><Plus className="w-4 h-4" /></button>
                   </div>
                )}
             </td>
         </tr>
         {isArticleDragOver && articleDropPosition === 'bottom' && (
             <tr className="h-0 p-0 border-none"><td colSpan={12} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-green-500 top-2 z-50 shadow-[0_0_8px_rgba(34,197,94,0.8)] pointer-events-none"></div></td></tr>
         )}
         {!isPrintMode && <tr className="bg-white h-4 border-none"><td colSpan={12} className="border-none"></td></tr>}
      </tbody>
   );
};

interface Snapshot {
  articles: Article[];
  categories: Category[];
  analyses: PriceAnalysis[];
}

type ViewMode = 'COMPUTO' | 'ANALISI';

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
    let isMounted = true;
    set(userSessionRef, { sessionId: currentSessionId, lastLogin: new Date().toISOString(), device: navigator.userAgent, platform: navigator.platform }).catch(err => console.error("Session Write Failed:", err));
    const unsubscribeDb = onValue(userSessionRef, (snapshot) => {
        if (!isMounted) return;
        const data = snapshot.val();
        if (data && data.sessionId && data.sessionId !== currentSessionId) {
            setSessionError(true);
            if (auth.currentUser) { signOut(auth).catch(e => console.error("Logout error", e)); }
        }
    });
    return () => { isMounted = false; off(userSessionRef); unsubscribeDb(); };
  }, [user]);

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => { e.preventDefault(); return false; };
    document.addEventListener('contextmenu', handleContextMenu);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I') || (e.ctrlKey && e.shiftKey && e.key === 'J') || (e.ctrlKey && e.key === 'u')) {
        e.preventDefault(); return false;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('contextmenu', handleContextMenu); document.removeEventListener('keydown', handleKeyDown); };
  }, []); 

  useEffect(() => {
      document.title = projectInfo.title ? `${projectInfo.title} - GeCoLa` : 'GeCoLa - Computo Metrico';
  }, [projectInfo.title]);

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

  const categoryTotals = useMemo(() => {
    const lookup: Record<string, number> = {};
    categories.forEach(cat => {
      const catTotal = articles.filter(a => a.categoryCode === cat.code).reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
      lookup[cat.code] = catTotal;
    });
    return lookup;
  }, [articles, categories]);

  const totals: Totals = useMemo(() => {
    const totalWorks = articles.reduce((acc, art) => {
        const cat = categories.find(c => c.code === art.categoryCode);
        if (cat && cat.isEnabled === false) return acc;
        return acc + (art.quantity * art.unitPrice);
    }, 0);
    const safetyCosts = totalWorks * (projectInfo.safetyRate / 100);
    const totalTaxable = totalWorks + safetyCosts;
    const vatAmount = totalTaxable * (projectInfo.vatRate / 100);
    const grandTotal = totalTaxable + vatAmount;
    return { totalWorks, safetyCosts, totalTaxable, vatAmount, grandTotal };
  }, [articles, categories, projectInfo.safetyRate, projectInfo.vatRate]);

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

  const handleSaveAnalysis = (updatedAnalysis: PriceAnalysis) => {
      const roundedAnalysis = { ...updatedAnalysis, totalUnitPrice: roundTwoDecimals(updatedAnalysis.totalUnitPrice), totalBatchValue: roundTwoDecimals(updatedAnalysis.totalBatchValue) };
      let newAnalyses = [...analyses];
      const index = newAnalyses.findIndex(a => a.id === roundedAnalysis.id);
      if (index !== -1) newAnalyses[index] = roundedAnalysis; else newAnalyses.push(roundedAnalysis);
      const newArticles = articles.map(art => {
          if (art.linkedAnalysisId === roundedAnalysis.id) {
             const newLaborRate = roundedAnalysis.totalUnitPrice > 0 ? parseFloat(((roundedAnalysis.totalLabor / roundedAnalysis.totalBatchValue) * 100).toFixed(2)) : 0;
             return { ...art, description: roundedAnalysis.description, unit: roundedAnalysis.unit, unitPrice: roundedAnalysis.totalUnitPrice, laborRate: newLaborRate, code: roundedAnalysis.code, priceListSource: `Da Analisi ${roundedAnalysis.code}` };
          }
          return art;
      });
      updateState(newArticles, categories, newAnalyses);
  };

  const handleDeleteAnalysis = (id: string) => {
      if (window.confirm("Se elimini questa analisi, le voci di computo collegate rimarranno ma perderanno il collegamento dinamico. Continuare?")) {
         const newAnalyses = analyses.filter(a => a.id !== id);
         const newArticles = articles.map(art => { if (art.linkedAnalysisId === id) return { ...art, linkedAnalysisId: undefined }; return art; });
         updateState(newArticles, categories, newAnalyses);
      }
  };

  const handleImportAnalysisToArticle = (analysis: PriceAnalysis) => {
      const targetCode = activeCategoryForAi || (selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode);
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
          measurements: [{ id: Math.random().toString(36).substr(2,9), description: '', type: 'positive', multiplier: undefined }],
          quantity: 0
      };
      updateState([...articles, newArticle], categories, analyses);
      setViewMode('COMPUTO');
      setIsImportAnalysisModalOpen(false); 
  };

  const handleViewLinkedAnalysis = (analysisId: string) => {
      const analysis = analyses.find(a => a.id === analysisId);
      if (analysis) { setEditingAnalysis(analysis); setIsAnalysisEditorOpen(true); } else { alert("Attenzione: L'analisi originale non è stata trovata."); }
  };

  const handleConvertArticleToAnalysis = (article: Article) => {
      const nextAnalysisCode = `AP.${(analyses.length + 1).toString().padStart(2, '0')}`;
      const newAnalysisId = Math.random().toString(36).substr(2, 9);
      const newAnalysis: PriceAnalysis = {
          id: newAnalysisId, code: nextAnalysisCode, description: article.description, unit: article.unit, analysisQuantity: 1, generalExpensesRate: 15, profitRate: 10, totalMaterials: 0, totalLabor: 0, totalEquipment: 0, costoTecnico: 0, valoreSpese: 0, valoreUtile: 0, totalBatchValue: 0, totalUnitPrice: 0,
          components: [{ id: Math.random().toString(36).substr(2, 9), type: 'general', description: 'Materiale/Lavorazione a corpo (Prezzo Base)', unit: 'cad', unitPrice: article.unitPrice, quantity: 1 }]
      };
      const updatedArticles = articles.map(a => { if (a.id === article.id) return { ...a, code: nextAnalysisCode, linkedAnalysisId: newAnalysisId, priceListSource: `Da Analisi ${nextAnalysisCode}` }; return a; });
      setAnalyses(prev => [...prev, newAnalysis]);
      updateState(updatedArticles, categories, [...analyses, newAnalysis]);
      setEditingAnalysis(newAnalysis);
      setViewMode('ANALISI');
      setIsAnalysisEditorOpen(true);
  };

  const handleInsertExternalArticle = (insertIndex: number, rawText: string) => {
      const targetCode = selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode;
      const parsed = parseDroppedContent(rawText);
      if (parsed) {
          const newArticle: Article = {
              id: Math.random().toString(36).substr(2, 9),
              categoryCode: targetCode,
              code: parsed.code || 'NP.001',
              priceListSource: parsed.priceListSource,
              description: parsed.description || 'Voce importata',
              unit: parsed.unit || 'cad',
              unitPrice: parsed.unitPrice || 0,
              laborRate: parsed.laborRate || 0,
              soaCategory: activeSoaCategory,
              measurements: [{ id: Math.random().toString(36).substr(2,9), description: '', type: 'positive', length: undefined, multiplier: undefined }],
              quantity: 0
          };
          updateState([...articles, newArticle]);
      }
  };

  const handleAnalysisDragStart = (e: React.DragEvent, analysis: PriceAnalysis) => { 
      // MIRACOLO: Trick URI list per cambio scheda (Chrome richiede uri-list per switchare tab)
      const dummyUrl = 'https://gecola.it/transfer/analysis/' + analysis.id;
      e.dataTransfer.setData('text/uri-list', dummyUrl);
      e.dataTransfer.setData('URL', dummyUrl);
      e.dataTransfer.setData('text/plain', `GECOLA_DATA::ANALYSIS::${JSON.stringify(analysis)}`); 
      e.dataTransfer.effectAllowed = 'all'; 
  };

  const handleAnalysisDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsAnalysisDragOver(false);
      const textData = e.dataTransfer.getData('text/plain');
      if (textData && textData.startsWith('GECOLA_DATA::ANALYSIS::')) {
          try {
              const jsonStr = textData.replace('GECOLA_DATA::ANALYSIS::', '');
              const analysis = JSON.parse(jsonStr);
              const newAnalysis: PriceAnalysis = { ...analysis, id: Math.random().toString(36).substr(2, 9), code: `AP.${(analyses.length + 1).toString().padStart(2, '0')}`, description: `${analysis.description} (Copia)` };
              setAnalyses(prev => [...prev, newAnalysis]);
          } catch (err) { console.error("Analysis Drop Error", err); }
      }
  };
  
  const handleAddCategory = () => { setEditingCategory(null); setIsCategoryModalOpen(true); };
  const handleEditCategory = (cat: Category) => { setEditingCategory(cat); setIsCategoryModalOpen(true); };
  const handleSaveCategory = (name: string) => {
    if (editingCategory) {
        const newCats = categories.map(c => c.code === editingCategory.code ? { ...c, name } : c);
        updateState(articles, newCats);
    } else {
        const newCode = generateNextWbsCode(categories);
        const newCat: Category = { code: newCode, name, isEnabled: true, isLocked: false };
        const newCats = [...categories, newCat];
        updateState(articles, newCats);
    }
  };
  const handleToggleCategoryLock = (code: string, e: React.MouseEvent) => { e.stopPropagation(); const newCats = categories.map(c => c.code === code ? { ...c, isLocked: !c.isLocked } : c); updateState(articles, newCats); };
  const handleToggleCategoryVisibility = (code: string, e: React.MouseEvent) => { e.stopPropagation(); const newCats = categories.map(c => c.code === code ? { ...c, isEnabled: !c.isEnabled } : c); updateState(articles, newCats); };
  const handleDeleteCategory = (code: string, e: React.MouseEvent) => { e.stopPropagation(); if (window.confirm(`Sei sicuro di voler eliminare la WBS ${code} e tutte le sue voci?`)) { let newCats = categories.filter(c => c.code !== code); let newArts = articles.filter(a => a.categoryCode !== code); const result = renumberCategories(newCats, newArts); updateState(result.newArticles, result.newCategories); } };
  const handleCloneCategory = (code: string, e: React.MouseEvent) => { e.stopPropagation(); const sourceCat = categories.find(c => c.code === code); if (!sourceCat) return; const sourceArticles = articles.filter(a => a.categoryCode === code); const newCategory = { ...sourceCat, name: `${sourceCat.name} (Copia)` }; const tempCode = `TEMP_CLONE_${Date.now()}`; newCategory.code = tempCode; const newArticlesRaw = sourceArticles.map(art => ({ ...art, id: Math.random().toString(36).substr(2, 9), categoryCode: tempCode, measurements: art.measurements.map(m => ({ ...m, id: Math.random().toString(36).substr(2, 9), linkedArticleId: undefined })) })); const sourceIndex = categories.findIndex(c => c.code === code); const newCatsList = [...categories]; newCatsList.splice(sourceIndex + 1, 0, newCategory); const allArticles = [...articles, ...newArticlesRaw]; const result = renumberCategories(newCatsList, allArticles); updateState(result.newArticles, result.newCategories); };
  
  const handleWbsDragStart = (e: React.DragEvent, code: string) => { 
      setDraggedCategoryCode(code); 
      // MIRACOLO: Inseriamo PRIMA la URI list fittizia per ingannare Chrome e forzare il cambio scheda
      const dummyUrl = 'https://gecola.it/transfer/wbs/' + code;
      e.dataTransfer.setData('text/uri-list', dummyUrl);
      e.dataTransfer.setData('URL', dummyUrl);

      const cat = categories.find(c => c.code === code);
      if (cat) {
          const catArticles = articles.filter(a => a.categoryCode === code);
          const relatedAnalysesIds = new Set(catArticles.map(a => a.linkedAnalysisId).filter(Boolean));
          const relatedAnalyses = analyses.filter(an => relatedAnalysesIds.has(an.id));
          const payload = { type: 'CROSS_TAB_WBS_BUNDLE', category: cat, articles: catArticles, analyses: relatedAnalyses };
          const jsonPayload = JSON.stringify(payload);
          e.dataTransfer.setData('text/plain', jsonPayload);
      }
      e.dataTransfer.setData('wbsCode', code); 
      e.dataTransfer.effectAllowed = 'all'; 
  };

  const handleWbsDragOver = (e: React.DragEvent, targetCode: string) => { 
      e.preventDefault(); 
      e.stopPropagation(); 
      e.dataTransfer.dropEffect = 'copy'; // Forza cursore copia (+) e rimuove divieto
      if (isDraggingArticle) {
          if (wbsDropTarget?.code !== targetCode || wbsDropTarget?.position !== 'inside') setWbsDropTarget({ code: targetCode, position: 'inside' });
          return;
      }
      if (draggedCategoryCode) {
          if (draggedCategoryCode === targetCode) { setWbsDropTarget(null); return; }
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const isTop = e.clientY < (rect.top + rect.height / 2);
          setWbsDropTarget({ code: targetCode, position: isTop ? 'top' : 'bottom' });
      }
  };

  const handleWbsDragLeave = (e: React.DragEvent) => { e.preventDefault(); };

  const handleWbsDrop = (e: React.DragEvent, targetCode: string | null) => { 
      e.preventDefault(); 
      e.stopPropagation(); 
      setWbsDropTarget(null);
      const droppedArticleId = e.dataTransfer.getData('articleId');
      if (droppedArticleId && targetCode) {
          const targetCategory = categories.find(c => c.code === targetCode);
          if (targetCategory?.isLocked) { alert("WBS bloccata."); return; }
          const article = articles.find(a => a.id === droppedArticleId);
          if (!article) return;
          if (article.categoryCode === targetCode) return;
          if (e.ctrlKey) {
              const newArticle: Article = { ...article, id: Math.random().toString(36).substr(2, 9), categoryCode: targetCode, measurements: article.measurements.map(m => ({ ...m, id: Math.random().toString(36).substr(2, 9) })) };
              updateState([...articles, newArticle]);
          } else {
              const updatedArticles = articles.map(a => a.id === droppedArticleId ? { ...a, categoryCode: targetCode } : a);
              updateState(updatedArticles);
          }
          setDraggedCategoryCode(null); setIsDraggingArticle(false);
          return;
      }
      const textData = e.dataTransfer.getData('text/plain');
      if (textData && !draggedCategoryCode) {
          try {
              const payload = JSON.parse(textData);
              if (payload && payload.type === 'CROSS_TAB_WBS_BUNDLE') {
                  const { category: importedCat, articles: importedArticles, analyses: importedAnalyses } = payload;
                  if (importedCat && Array.isArray(importedArticles)) {
                      const newCatCode = generateNextWbsCode(categories);
                      const newCategory: Category = { ...importedCat, code: newCatCode, name: importedCat.name + " (Copia)" };
                      const analysisIdMap = new Map<string, string>();
                      const newAnalysesList = [...analyses];
                      if (Array.isArray(importedAnalyses)) {
                          importedAnalyses.forEach((an: PriceAnalysis) => {
                              const newId = Math.random().toString(36).substr(2, 9);
                              let newCode = an.code;
                              if (analyses.some(existing => existing.code === newCode)) { newCode = `AP.${(newAnalysesList.length + 1).toString().padStart(2, '0')}`; }
                              analysisIdMap.set(an.id, newId);
                              const newComponents = an.components.map(comp => ({ ...comp, id: Math.random().toString(36).substr(2, 9) }));
                              newAnalysesList.push({ ...an, id: newId, code: newCode, components: newComponents });
                          });
                      }
                      const processedArticles = importedArticles.map((art: Article) => {
                          const newArticleId = Math.random().toString(36).substr(2, 9);
                          let newLinkedAnalysisId = art.linkedAnalysisId;
                          if (art.linkedAnalysisId && analysisIdMap.has(art.linkedAnalysisId)) { newLinkedAnalysisId = analysisIdMap.get(art.linkedAnalysisId); }
                          return { ...art, id: newArticleId, categoryCode: newCatCode, linkedAnalysisId: newLinkedAnalysisId, measurements: art.measurements.map((m: Measurement) => ({ ...m, id: Math.random().toString(36).substr(2, 9), linkedArticleId: undefined })) };
                      });
                      updateState([...articles, ...processedArticles], [...categories, newCategory], newAnalysesList);
                  }
              }
          } catch (e) { console.error("Import Error", e); }
          return;
      }
      if (draggedCategoryCode) {
          if (!targetCode || draggedCategoryCode === targetCode) { setDraggedCategoryCode(null); return; }
          const sourceIndex = categories.findIndex(c => c.code === draggedCategoryCode); 
          let targetIndex = categories.findIndex(c => c.code === targetCode); 
          if (sourceIndex === -1 || targetIndex === -1) { setDraggedCategoryCode(null); return; }
          const newCatsOrder = [...categories]; 
          const [movedCat] = newCatsOrder.splice(sourceIndex, 1); 
          if (sourceIndex < targetIndex) targetIndex--;
          if (wbsDropTarget?.position === 'bottom') targetIndex++;
          newCatsOrder.splice(targetIndex, 0, movedCat); 
          const result = renumberCategories(newCatsOrder, articles); 
          updateState(result.newArticles, result.newCategories); 
          setDraggedCategoryCode(null);
      }
  };

  const handleUpdateArticle = (id: string, field: keyof Article, value: string | number) => { const updated = articles.map(art => art.id === id ? { ...art, [field]: value } : art); updateState(updated); };
  const handleArticleEditSave = (id: string, updates: Partial<Article>) => { let finalUpdates = { ...updates }; const original = articles.find(a => a.id === id); if (original && original.priceListSource && !original.priceListSource.includes('NP')) { if (updates.unitPrice !== undefined && updates.unitPrice !== original.unitPrice) finalUpdates.priceListSource = 'Analisi NP (Modificato)'; if (updates.description !== undefined && updates.description !== original.description) finalUpdates.priceListSource = 'Analisi NP (Modificato)'; } const updated = articles.map(art => art.id === id ? { ...art, ...finalUpdates } : art); updateState(updated); };
  const handleEditArticleDetails = (article: Article) => { setEditingArticle(article); setIsEditArticleModalOpen(true); };
  const handleDeleteArticle = (id: string) => { if (window.confirm("Sei sicuro di voler eliminare questo articolo?")) { const updated = articles.filter(art => art.id !== id); updateState(updated); } };
  const handleAddMeasurement = (articleId: string) => { const newId = Math.random().toString(36).substr(2, 9); setLastAddedMeasurementId(newId); const updated = articles.map(art => { if (art.id !== articleId) return art; const newM: Measurement = { id: newId, description: '', type: 'positive', length: undefined, width: undefined, height: undefined, multiplier: undefined }; return { ...art, measurements: [...art.measurements, newM] }; }); updateState(updated); };
  const handleAddSubtotal = (articleId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newM: Measurement = { id: Math.random().toString(36).substr(2, 9), description: '', type: 'subtotal' }; return { ...art, measurements: [...art.measurements, newM] }; }); updateState(updated); };
  const handleAddVoiceMeasurement = (articleId: string, data: Partial<Measurement>) => { const newId = Math.random().toString(36).substr(2, 9); setLastAddedMeasurementId(newId); const updated = articles.map(art => { if (art.id !== articleId) return art; const newM: Measurement = { id: newId, description: data.description || '', type: 'positive', length: data.length, width: data.width, height: data.height, multiplier: data.multiplier }; return { ...art, measurements: [...art.measurements, newM] }; }); updateState(updated); };
  const handleToggleDeduction = (articleId: string, mId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newMeasurements = art.measurements.map(m => { if (m.id !== mId) return m; if (m.type === 'subtotal') return m; const newType = m.type === 'positive' ? 'deduction' : 'positive'; let newDescription = m.description; if (newType === 'deduction') { if (!newDescription.toLowerCase().startsWith('a dedurre')) { newDescription = "A dedurre: " + newDescription; } } else { newDescription = newDescription.replace(/^a dedurre:\s*/i, ''); } return { ...m, type: newType, description: newDescription } as Measurement; }); return { ...art, measurements: newMeasurements }; }); updateState(updated); };
  const handleUpdateMeasurement = (articleId: string, mId: string, field: keyof Measurement, value: string | number | undefined) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newMeasurements = art.measurements.map(m => { if (m.id !== mId) return m; return { ...m, [field]: value }; }); return { ...art, measurements: newMeasurements }; }); updateState(updated); };
  const handleDeleteMeasurement = (articleId: string, mId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newMeasurements = art.measurements.filter(m => m.id !== mId); return { ...art, measurements: newMeasurements }; }); updateState(updated); };
  const handleReorderMeasurements = (articleId: string, startIndex: number, endIndex: number) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newMeasurements = [...art.measurements]; const [movedItem] = newMeasurements.splice(startIndex, 1); newMeasurements.splice(endIndex, 0, movedItem); return { ...art, measurements: newMeasurements }; }); updateState(updated); };
  const handleArticleDragStart = (e: React.DragEvent, article: Article) => { 
      setIsDraggingArticle(true); 
      // MIRACOLO URI list per cambio scheda
      const dummyUrl = 'https://gecola.it/transfer/article/' + article.id;
      e.dataTransfer.setData('text/uri-list', dummyUrl);
      e.dataTransfer.setData('URL', dummyUrl);
      e.dataTransfer.setData('type', 'ARTICLE'); 
      e.dataTransfer.setData('articleId', article.id); 
      e.dataTransfer.effectAllowed = 'all'; 
  };
  const handleArticleDragEnd = () => { setIsDraggingArticle(false); setWbsDropTarget(null); };
  const handleArticleDrop = (e: React.DragEvent, targetArticleId: string, position: 'top' | 'bottom' = 'bottom') => { setIsDraggingArticle(false); setWbsDropTarget(null); const type = e.dataTransfer.getData('type'); if (type !== 'ARTICLE') return; const draggingId = e.dataTransfer.getData('articleId'); if (!draggingId) return; const targetArticle = articles.find(a => a.id === targetArticleId); if (!targetArticle) return; const currentCategoryArticles = articles.filter(a => a.categoryCode === targetArticle.categoryCode); const startIndex = currentCategoryArticles.findIndex(a => a.id === draggingId); let targetIndex = currentCategoryArticles.findIndex(a => a.id === targetArticleId); if (startIndex === -1 || targetIndex === -1) return; if (position === 'bottom' && startIndex > targetIndex) targetIndex++; else if (position === 'top' && startIndex < targetIndex) targetIndex--; const otherArticles = articles.filter(a => a.categoryCode !== targetArticle.categoryCode); const newSubset = [...currentCategoryArticles]; const [movedItem] = newSubset.splice(startIndex, 1); newSubset.splice(targetIndex, 0, movedItem); const newGlobalArticles = [...otherArticles, ...newSubset]; updateState(newGlobalArticles); };
  const handleOpenLinkModal = (articleId: string, measurementId: string) => { setLinkTarget({ articleId, measurementId }); setIsLinkModalOpen(true); };
  const handleLinkMeasurement = (sourceArticle: Article, type: 'quantity' | 'amount') => { if (!linkTarget) return; const updated = articles.map(art => { if (art.id !== linkTarget.articleId) return art; const newMeasurements = art.measurements.map(m => { if (m.id !== linkTarget.measurementId) return m; return { ...m, linkedArticleId: sourceArticle.id, linkedType: type, length: undefined, width: undefined, height: undefined, description: '', multiplier: undefined, type: 'positive' as const }; }); return { ...art, measurements: newMeasurements }; }); updateState(updated); setIsLinkModalOpen(false); setLinkTarget(null); };
  const handleScrollToArticle = (id: string) => { const element = document.getElementById(`article-${id}`); if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); element.classList.add('bg-yellow-50'); setTimeout(() => element.classList.remove('bg-yellow-50'), 2000); } };
  
  const handleAddEmptyArticle = (categoryCode: string) => { 
      const newArticleId = Math.random().toString(36).substr(2, 9);
      const nextAnalysisCode = `AP.${(analyses.length + 1).toString().padStart(2, '0')}`;
      const newAnalysis: PriceAnalysis = { id: Math.random().toString(36).substr(2, 9), code: nextAnalysisCode, description: 'Nuova voce da analizzare', unit: 'cad', analysisQuantity: 1, generalExpensesRate: 15, profitRate: 10, totalMaterials: 0, totalLabor: 0, totalEquipment: 0, costoTecnico: 0, valoreSpese: 0, valoreUtile: 0, totalBatchValue: 0, totalUnitPrice: 0, components: [{ id: Math.random().toString(36).substr(2, 9), type: 'general', description: 'Stima a corpo (da dettagliare)', unit: 'cad', unitPrice: 0, quantity: 1 }] };
      const newArticle: Article = { id: newArticleId, categoryCode, code: nextAnalysisCode, description: 'Nuova voce da analizzare', unit: 'cad', unitPrice: 0, laborRate: 0, linkedAnalysisId: newAnalysis.id, priceListSource: `Da Analisi ${nextAnalysisCode}`, soaCategory: activeSoaCategory, measurements: [{ id: Math.random().toString(36).substr(2,9), description: '', type: 'positive', multiplier: undefined }], quantity: 0 }; 
      setAnalyses(prev => [...prev, newAnalysis]);
      updateState([...articles, newArticle], categories, [...analyses, newAnalysis]);
      setEditingAnalysis(newAnalysis);
      setViewMode('ANALISI');
      setIsAnalysisEditorOpen(true);
  };

  const handleToggleArticleLock = (id: string) => { const updated = articles.map(art => art.id === id ? { ...art, isLocked: !art.isLocked } : art); updateState(updated); };
  
  const handleBulkGenerate = async (description: string) => {
    setIsGenerating(true);
    try {
        const generatedItems = await generateBulkItems(description, projectInfo.region, projectInfo.year, categories);
        if (generatedItems && generatedItems.length > 0) {
            const newArticles: Article[] = generatedItems.map(item => {
                const qty = item.quantity || 1;
                return { id: Math.random().toString(36).substr(2, 9), categoryCode: item.categoryCode || 'WBS.01', code: item.code || 'NP.001', priceListSource: item.priceListSource, description: item.description || 'Voce generata', unit: item.unit || 'cad', unitPrice: item.unitPrice || 0, laborRate: item.laborRate || 0, soaCategory: activeSoaCategory, measurements: [{ id: Math.random().toString(36).substr(2,9), description: '', type: 'positive', length: qty, multiplier: 1 }], quantity: qty };
            });
            updateState([...articles, ...newArticles]);
            setIsBulkModalOpen(false);
        } else { alert("Errore generazione."); }
    } catch (e) { console.error(e); alert("Errore generazione."); } finally { setIsGenerating(false); }
  };

  const handleDropContent = (rawText: string) => { 
      const targetCatCode = selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode;
      const currentCat = categories.find(c => c.code === targetCatCode);
      if (currentCat && currentCat.isLocked) { alert("Impossibile importare: Il capitolo è bloccato."); return; }
      if (!rawText) return; 
      setIsProcessingDrop(true); 
      setTimeout(() => { try { const parsed = parseDroppedContent(rawText); if (parsed) { const newArticle: Article = { id: Math.random().toString(36).substr(2, 9), categoryCode: targetCatCode, code: parsed.code || 'NP.001', priceListSource: parsed.priceListSource, description: parsed.description || 'Voce importata', unit: parsed.unit || 'cad', unitPrice: parsed.unitPrice || 0, laborRate: parsed.laborRate || 0, soaCategory: activeSoaCategory, measurements: [{ id: Math.random().toString(36).substr(2,9), description: '', type: 'positive', length: undefined, multiplier: undefined }], quantity: 0 }; 
          updateState([...articles, newArticle]); 
      } else { alert("Struttura dati non riconosciuta."); } } catch (e) { console.error(e); alert("Errore durante l'analisi."); } finally { setIsProcessingDrop(false); } }, 100); 
  };

  // Added comment above fix: implemented missing handleWorkspaceDrop to handle external text drops
  const handleWorkspaceDrop = (e: React.DragEvent) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    const textData = e.dataTransfer.getData('text/plain'); 
    const type = e.dataTransfer.getData('type');
    // If it has text but no internal 'type', it's an external drop (e.g. from GeCoLa.it)
    if (textData && !type) handleDropContent(textData); 
  };

  const getProjectExportData = () => { const gecolaData = { projectInfo, categories, articles, analyses, version: "10.3" }; return JSON.stringify({ gecolaData, exportedAt: new Date().toISOString(), app: "GeCoLa Cloud" }, null, 2); };
  const handleSmartSave = async (silent: boolean = false) => { const jsonString = getProjectExportData(); if ('showSaveFilePicker' in window) { try { let handle = currentFileHandle; if (!handle) { if (silent) return; handle = await (window as any).showSaveFilePicker({ suggestedName: `${projectInfo.title || 'Progetto'}.json`, types: [{ description: 'JSON Project File', accept: { 'application/json': ['.json'] }, }], }); setCurrentFileHandle(handle); } if (silent) setIsAutoSaving(true); const writable = await handle.createWritable(); await writable.write(jsonString); await writable.close(); setLastSaved(new Date()); } catch (err: any) { if (err.name !== 'AbortError' && !silent) { setIsSaveModalOpen(true); } } finally { if (silent) setTimeout(() => setIsAutoSaving(false), 500); } } else { if (!silent) setIsSaveModalOpen(true); } };
  useEffect(() => { if (!currentFileHandle) return; const timeoutId = setTimeout(() => { handleSmartSave(true); }, 2000); return () => clearTimeout(timeoutId); }, [articles, categories, projectInfo, currentFileHandle]);
  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const content = event.target?.result as string; const data = JSON.parse(content); if (data.gecolaData) { setProjectInfo(data.gecolaData.projectInfo); updateState(data.gecolaData.articles, data.gecolaData.categories, data.gecolaData.analyses || []); } else { alert("Formato non valido."); } setCurrentFileHandle(null); } catch (error) { alert("Errore caricamento."); } }; reader.readAsText(file); e.target.value = ''; };
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter') { const target = e.target as HTMLElement; if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') { if (target.tagName === 'TEXTAREA' && e.shiftKey) return; e.preventDefault(); const inputs = Array.from(document.querySelectorAll('input:not([disabled]), textarea:not([disabled])')); const index = inputs.indexOf(target as HTMLInputElement | HTMLTextAreaElement); if (index > -1 && index < inputs.length - 1) (inputs[index + 1] as HTMLElement).focus(); } } };

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-[#2c3e50] text-white">Caricamento...</div>;
  if (!user && auth) return <Login />;

  const activeCategory = categories.find(c => c.code === selectedCategoryCode);
  const activeArticles = articles.filter(a => a.categoryCode === selectedCategoryCode);
  const filteredAnalyses = analyses.filter(a => a.code.toLowerCase().includes(analysisSearchTerm.toLowerCase()) || a.description.toLowerCase().includes(analysisSearchTerm.toLowerCase()));

  return (
    <div 
        className="h-screen flex flex-col bg-[#e8eaed] font-sans overflow-hidden text-slate-800"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} 
        onDragEnter={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
    >
      <input type="file" ref={fileInputRef} onChange={handleLoadProject} className="hidden" accept=".json" />
      <div className="bg-[#2c3e50] shadow-md z-50 print:hidden flex-shrink-0 h-14 flex items-center justify-between px-6 border-b border-slate-600">
          <div className="flex items-center space-x-3 w-64 flex-shrink-0">
            <div className="bg-orange-500 p-1.5 rounded-lg shadow-lg"><Calculator className="w-5 h-5 text-white" /></div>
            <div className="flex flex-col"><span className="font-bold text-lg text-white">GeCoLa <span className="font-light opacity-80 text-xs">v10.9</span></span></div>
          </div>
          <div className="flex-1 px-6 flex justify-center">
              <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-1 rounded-full border border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer" onClick={() => setIsSettingsModalOpen(true)}>
                  <h1 className="text-sm font-bold text-white max-w-[400px] truncate">{projectInfo.title}</h1>
                  <Edit3 className="w-3 h-3 text-slate-400" />
              </div>
          </div>
          <div className="flex items-center space-x-3 w-auto flex-shrink-0 justify-end">
             <button onClick={() => handleSmartSave(false)} className="p-1.5 text-slate-300 hover:text-white hover:bg-blue-600 rounded transition-colors"><Save className="w-5 h-5" /></button>
             <button onClick={() => setIsPrintMenuOpen(!isPrintMenuOpen)} className="p-1.5 text-slate-300 hover:text-white hover:bg-red-600 rounded relative"><FileText className="w-5 h-5" />
                {isPrintMenuOpen && (<div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 text-left"><button onClick={() => generateComputoMetricPdf(projectInfo, categories, articles)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50">Computo Metrico</button></div>)}
             </button>
             <button onClick={() => auth && signOut(auth)} className="p-1.5 text-red-400 hover:text-white hover:bg-red-600 rounded ml-2"><LogOut className="w-5 h-5" /></button>
          </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden print:hidden">
        <div className="w-64 bg-white border-r border-slate-300 flex flex-col flex-shrink-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex gap-1">
             <button onClick={() => setViewMode('COMPUTO')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${viewMode === 'COMPUTO' ? 'bg-white text-blue-700 ring-1 ring-blue-200 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>Computo</button>
             <button onClick={() => setViewMode('ANALISI')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${viewMode === 'ANALISI' ? 'bg-white text-purple-700 ring-1 ring-purple-200 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>Analisi</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50/50" onDrop={(e) => handleWbsDrop(e, null)} onDragOver={(e) => e.preventDefault()}>
            {viewMode === 'COMPUTO' ? (
                <>
                <div className="flex justify-between items-center px-1 mb-2">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Struttura WBS</span>
                    <PlusCircle className="w-4 h-4 text-blue-600 cursor-pointer hover:scale-110 transition-transform" onClick={handleAddCategory} />
                </div>
                <ul className="space-y-1">
                  {categories.map(cat => {
                    const isSelected = selectedCategoryCode === cat.code;
                    return (
                    <li key={cat.code} className="relative" onDragOver={(e) => handleWbsDragOver(e, cat.code)} onDrop={(e) => handleWbsDrop(e, cat.code)}>
                      {wbsDropTarget?.code === cat.code && <div className={`absolute ${wbsDropTarget.position === 'top' ? '-top-1' : '-bottom-1'} left-0 right-0 h-1 bg-green-500 z-50 rounded-full`} />}
                      <div draggable onDragStart={(e) => handleWbsDragStart(e, cat.code)} onDragEnd={() => setDraggedCategoryCode(null)} className={`group relative flex items-center p-2 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-white text-slate-600 shadow-sm border border-transparent hover:border-slate-200'}`} onClick={() => setSelectedCategoryCode(cat.code)}>
                        <GripVertical className={`w-3 h-3 mr-2 opacity-0 group-hover:opacity-30 cursor-move`} />
                        <div className="flex-1 overflow-hidden">
                           <div className="flex items-center gap-1.5">
                               <span className={`text-[10px] font-mono font-bold ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>{cat.code}</span>
                               {cat.isLocked && <Lock className="w-2.5 h-2.5 text-red-400" />}
                           </div>
                           <p className="text-xs font-bold truncate leading-tight uppercase tracking-tight">{cat.name}</p>
                        </div>
                        <div className="hidden group-hover:flex items-center gap-1 ml-1 bg-white/95 rounded-md p-0.5 shadow-sm border border-slate-100">
                           <button onClick={(e) => handleCloneCategory(cat.code, e)} className="p-1 hover:bg-orange-100 text-orange-500 rounded"><Copy className="w-3 h-3" /></button>
                           <button onClick={(e) => handleEditCategory(cat)} className="p-1 hover:bg-blue-100 text-blue-500 rounded"><Edit2 className="w-3 h-3" /></button>
                           <button onClick={(e) => handleDeleteCategory(cat.code, e)} className="p-1 hover:bg-red-100 text-red-500 rounded"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    </li>
                  )})}
                </ul>
                </>
            ) : (
                <div className="space-y-3" onDrop={handleAnalysisDrop} onDragOver={(e) => { e.preventDefault(); setIsAnalysisDragOver(true); }} onDragLeave={() => setIsAnalysisDragOver(false)}>
                    <div className="px-1"><input type="text" placeholder="Cerca analisi..." value={analysisSearchTerm} onChange={e => setAnalysisSearchTerm(e.target.value)} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-md text-xs outline-none focus:ring-1 focus:ring-purple-400" /></div>
                    {filteredAnalyses.map(analysis => (
                        <div key={analysis.id} draggable onDragStart={(e) => handleAnalysisDragStart(e, analysis)} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:border-purple-400 transition-all cursor-grab group">
                            <div className="flex justify-between items-start mb-1"><span className="bg-purple-100 text-purple-700 font-bold font-mono text-[10px] px-1.5 py-0.5 rounded leading-none">{analysis.code}</span><span className="font-bold text-xs text-slate-800">{formatCurrency(analysis.totalUnitPrice)}</span></div>
                            <p className="text-[10px] text-slate-500 line-clamp-2 mb-2 leading-snug">{analysis.description}</p>
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => { setEditingAnalysis(analysis); setIsAnalysisEditorOpen(true); }} className="p-1 hover:bg-purple-50 text-purple-600 rounded"><Edit2 className="w-3 h-3" /></button><button onClick={() => handleDeleteAnalysis(analysis.id)} className="p-1 hover:bg-red-50 text-red-500 rounded"><Trash2 className="w-3 h-3" /></button></div>
                        </div>
                    ))}
                    {isAnalysisDragOver && <div className="p-8 border-2 border-dashed border-purple-400 rounded-xl bg-purple-50 text-center animate-pulse"><Move className="w-6 h-6 mx-auto text-purple-400 mb-2" /><p className="text-[10px] font-black uppercase text-purple-600">Rilascia per importare</p></div>}
                </div>
            )}
          </div>
          
          <div className="p-4 bg-slate-900 text-white border-t border-slate-700">
             <div className="flex justify-between items-center mb-1"><span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Netto Lavori</span><span className="font-bold text-sm font-mono">{formatCurrency(totals.totalWorks)}</span></div>
             <div className="flex justify-between items-center"><span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Totale G.</span><span className="font-black text-lg text-orange-400 font-mono tracking-tighter">{formatCurrency(totals.grandTotal)}</span></div>
          </div>
        </div>

        <div className="flex-1 flex flex-col h-full bg-white relative overflow-hidden" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={handleWorkspaceDrop}>
          {activeCategory && viewMode === 'COMPUTO' ? (
            <>
              <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-b border-slate-200 shadow-sm z-30">
                 <div className="flex items-center gap-4">
                    <div className="bg-blue-600 text-white px-3 py-1 rounded-md font-black font-mono text-lg shadow-inner">{activeCategory.code}</div>
                    <div><h2 className="font-black text-slate-800 uppercase text-sm tracking-tight leading-none">{activeCategory.name}</h2><p className="text-[10px] text-slate-400 mt-1 font-bold">Importo Capitolo: <span className="text-blue-600">{formatCurrency(categoryTotals[activeCategory.code] || 0)}</span></p></div>
                 </div>
                 <div className="flex items-center gap-3">
                    <button onClick={() => { setIsBulkModalOpen(true); setActiveCategoryForAi(activeCategory.code); }} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 shadow-lg shadow-green-100 transition-all active:scale-95"><Sparkles className="w-4 h-4" /> Ricerca Intelligente</button>
                    <button onClick={() => { setIsImportAnalysisModalOpen(true); setActiveCategoryForAi(activeCategory.code); }} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-100 transition-all active:scale-95"><TestTubes className="w-4 h-4" /> Aggiungi da Analisi</button>
                    <div className="w-px h-6 bg-slate-200 mx-2"></div>
                    <button onClick={() => handleAddEmptyArticle(activeCategory.code)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-100 transition-all active:scale-95"><Plus className="w-4 h-4" /> Nuova Voce Libera</button>
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 bg-[#f8fafc] scroll-smooth" onKeyDown={handleInputKeyDown}>
                <table className="w-full text-left border-collapse table-fixed bg-white shadow-xl rounded-xl overflow-hidden border border-slate-200">
                    <TableHeader activeColumn={activeColumn} />
                    {activeArticles.map((article, artIndex) => (
                        <ArticleGroup key={article.id} article={article} index={artIndex} allArticles={articles} isPrintMode={false} isCategoryLocked={activeCategory.isLocked} onUpdateArticle={handleUpdateArticle} onEditArticleDetails={handleEditArticleDetails} onDeleteArticle={handleDeleteArticle} onAddMeasurement={handleAddMeasurement} onAddSubtotal={handleAddSubtotal} onAddVoiceMeasurement={handleAddVoiceMeasurement} onUpdateMeasurement={handleUpdateMeasurement} onDeleteMeasurement={handleDeleteMeasurement} onToggleDeduction={handleToggleDeduction} onOpenLinkModal={handleOpenLinkModal} onScrollToArticle={handleScrollToArticle} onReorderMeasurements={handleReorderMeasurements} onArticleDragStart={handleArticleDragStart} onArticleDrop={handleArticleDrop} onArticleDragEnd={handleArticleDragEnd} lastAddedMeasurementId={lastAddedMeasurementId} onColumnFocus={setActiveColumn} onViewAnalysis={handleViewLinkedAnalysis} onInsertExternalArticle={handleInsertExternalArticle} onToggleArticleLock={handleToggleArticleLock} />
                    ))}
                    {activeArticles.length === 0 && (
                        <tbody><tr><td colSpan={12} className="py-24 px-12"><div className="flex flex-col items-center justify-center border-4 border-dashed border-slate-100 rounded-[3rem] p-12 text-center bg-slate-50/30"><div className="bg-white p-6 rounded-full shadow-inner mb-6 text-blue-200"><MousePointerClick className="w-16 h-16" /></div><h3 className="text-xl font-black uppercase text-slate-400 mb-2">Capitolo Vuoto</h3><p className="text-slate-400 text-sm max-w-xs mx-auto mb-8 font-medium">Usa i pulsanti in alto per caricare le voci o trascinale direttamente dai listini GeCoLa.it</p><CategoryDropGate categoryCode={activeCategory.code} isLoading={isProcessingDrop} onDropContent={handleDropContent} /></div></td></tr></tbody>
                    )}
                </table>
                <div className="h-40"></div>
              </div>
            </>
          ) : viewMode === 'ANALISI' ? (
              <div className="flex-1 overflow-y-auto p-12 bg-[#f8fafc]">
                  <div className="max-w-7xl mx-auto">
                    <div className="flex justify-between items-center mb-10"><div className="flex items-center gap-4"><div className="bg-purple-600 p-3 rounded-2xl shadow-xl"><TestTubes className="w-8 h-8 text-white" /></div><div><h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Archivio Analisi Prezzi</h2><p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Lavorazioni Speciali e Analitiche</p></div></div><button onClick={() => { setEditingAnalysis(null); setIsAnalysisEditorOpen(true); }} className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs shadow-xl shadow-purple-200 flex items-center gap-3 transition-all hover:scale-105 active:scale-95"><Plus className="w-5 h-5" /> Nuova Analisi</button></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                        {analyses.map(analysis => (
                            <div key={analysis.id} className="bg-white rounded-3xl shadow-lg border border-slate-200 transition-all flex flex-col group hover:border-purple-400 hover:shadow-2xl overflow-hidden"><div className="p-6 flex-1"><div className="flex justify-between items-start mb-4"><span className="bg-purple-600 text-white font-black font-mono text-[10px] px-3 py-1 rounded-full shadow-sm">{analysis.code}</span><div className="text-right"><div className="text-2xl font-black text-purple-700 font-mono leading-none">{formatCurrency(analysis.totalUnitPrice)}</div><span className="text-[9px] text-slate-400 uppercase font-bold tracking-widest mt-1 block">per {analysis.unit}</span></div></div><h4 className="font-bold text-slate-800 text-sm leading-snug line-clamp-3 mb-6 min-h-[3em]">{analysis.description}</h4><div className="space-y-2 border-t border-slate-50 pt-5"><div className="flex justify-between text-[10px]"><span className="text-slate-400 font-bold uppercase">Materiali</span><span className="font-mono text-slate-700 font-bold">{formatCurrency(analysis.totalMaterials)}</span></div><div className="flex justify-between text-[10px]"><span className="text-slate-400 font-bold uppercase">Manodopera</span><span className="font-mono text-slate-700 font-bold">{formatCurrency(analysis.totalLabor)}</span></div><div className="flex justify-between text-[10px]"><span className="text-slate-400 font-bold uppercase">Noli/Attrezz.</span><span className="font-mono text-slate-700 font-bold">{formatCurrency(analysis.totalEquipment)}</span></div></div></div><div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center"><div className="flex items-center gap-1"><button onClick={() => { setEditingAnalysis(analysis); setIsAnalysisEditorOpen(true); }} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-white rounded-xl transition-all" title="Modifica"><PenLine className="w-4 h-4" /></button><button onClick={() => handleDeleteAnalysis(analysis.id)} className="p-2 text-slate-400 hover:text-red-600 bg-red-50/0 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button></div><button onClick={() => handleImportAnalysisToArticle(analysis)} className="flex items-center gap-2 bg-white text-purple-700 font-black text-[10px] px-4 py-2 rounded-xl border border-slate-200 hover:bg-purple-600 hover:text-white transition-all shadow-sm uppercase tracking-widest">Usa in Computo <ArrowRightLeft className="w-4 h-4" /></button></div></div>
                        ))}
                    </div>
                  </div>
              </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-6"><LayoutDashboard className="w-32 h-32 opacity-10" /><h2 className="text-3xl font-black uppercase tracking-tighter opacity-20">Benvenuto in GeCoLa</h2><p className="text-sm font-bold opacity-30 tracking-widest uppercase">Seleziona una WBS dal menu laterale per iniziare lo srotolamento</p></div>
          )}
        </div>
      </div>
      
      <ProjectSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} info={projectInfo} onSave={(newInfo) => setProjectInfo(newInfo)} />
      {editingArticle && <ArticleEditModal isOpen={isEditArticleModalOpen} onClose={() => { setIsEditArticleModalOpen(false); setEditingArticle(null); }} article={editingArticle} onSave={handleArticleEditSave} onConvertToAnalysis={handleConvertArticleToAnalysis} />}
      {linkTarget && <LinkArticleModal isOpen={isLinkModalOpen} onClose={() => { setIsLinkModalOpen(false); setLinkTarget(null); }} articles={articles} currentArticleId={linkTarget.articleId} onLink={handleLinkMeasurement} />}
      <CategoryEditModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} onSave={handleSaveCategory} initialData={editingCategory} nextWbsCode={generateNextWbsCode(categories)} />
      <SaveProjectModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} articles={articles} categories={categories} projectInfo={projectInfo} />
      <AnalysisEditorModal isOpen={isAnalysisEditorOpen} onClose={() => setIsAnalysisEditorOpen(false)} analysis={editingAnalysis} onSave={handleSaveAnalysis} nextCode={`AP.${(analyses.length + 1).toString().padStart(2, '0')}`} />
      <ImportAnalysisModal isOpen={isImportAnalysisModalOpen} onClose={() => setIsImportAnalysisModalOpen(false)} analyses={analyses} onImport={handleImportAnalysisToArticle} onCreateNew={() => { setIsImportAnalysisModalOpen(false); handleAddEmptyArticle(activeCategoryForAi || selectedCategoryCode); }} />
      <BulkGeneratorModal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} onGenerate={handleBulkGenerate} isLoading={isGenerating} region={projectInfo.region} year={projectInfo.year} />
    </div>
  );
};

export default App;
