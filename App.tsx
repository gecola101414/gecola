
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Calculator, LayoutDashboard, FolderOpen, Minus, XCircle, ChevronRight, Settings, PlusCircle, MinusCircle, Link as LinkIcon, ExternalLink, Undo2, Redo2, PenLine, MapPin, Lock, Unlock, Lightbulb, LightbulbOff, Edit2, FolderPlus, GripVertical, Mic, Sigma, Save, FileSignature, CheckCircle2, Loader2, Cloud, Share2, FileText, ChevronDown, TestTubes, Search, Coins, ArrowRightLeft, Copy, Move, LogOut, AlertTriangle, ShieldAlert, Award, User, BookOpen, Edit3, Paperclip, MousePointerClick, AlignLeft, Layers, Sparkles, FileJson, Download } from 'lucide-react';
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
import WbsImportOptionsModal from './components/WbsImportOptionsModal';
import { parseDroppedContent, parseVoiceMeasurement, generateBulkItems } from './services/geminiService';
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
  <thead className="bg-[#f8f9fa] border-b border-black text-[9px] uppercase font-bold text-gray-800 sticky top-0 z-30 shadow-sm">
    <tr>
      <th className="py-2 px-1 text-center w-[35px] border-r border-gray-300">N.</th>
      <th className="py-2 px-1 text-left w-[100px] border-r border-gray-300">Tariffa</th>
      <th className={`py-2 px-1 text-left min-w-[250px] border-r border-gray-300 ${activeColumn === 'desc' ? 'bg-blue-50 text-blue-900' : ''}`}>Designazione dei Lavori</th>
      <th className={`py-2 px-1 text-center w-[45px] border-r border-gray-300 ${activeColumn === 'mult' ? 'bg-blue-50 text-blue-900' : ''}`}>Par.Ug</th>
      <th className={`py-2 px-1 text-center w-[55px] border-r border-gray-300 ${activeColumn === 'len' ? 'bg-blue-50 text-blue-900' : ''}`}>Lung.</th>
      <th className={`py-2 px-1 text-center w-[55px] border-r border-gray-300 ${activeColumn === 'wid' ? 'bg-blue-50 text-blue-900' : ''}`}>Largh.</th>
      <th className={`py-2 px-1 text-center w-[55px] border-r border-gray-300 ${activeColumn === 'h' ? 'bg-blue-50 text-blue-900' : ''}`}>H/Peso</th>
      <th className="py-2 px-1 text-center w-[70px] border-r border-gray-300 bg-gray-100">Quantità</th>
      <th className="py-2 px-1 text-right w-[80px] border-r border-gray-300">Prezzo €</th>
      <th className="py-2 px-1 text-right w-[90px] border-r border-gray-300">Importo €</th>
      <th className="py-2 px-1 text-right w-[80px] border-r border-gray-300">M.O. €</th>
      <th className="py-2 px-1 text-center w-[50px] print:hidden text-gray-400 font-black">Cmd</th>
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

   const handleLongPressStart = (mId: string) => {
      if (areControlsDisabled) return;
      longPressTimer.current = setTimeout(() => {
        startListeningOnMeas(mId);
      }, 2000);
   };

   const handleLongPressEnd = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (isListening) {
        stopListening();
      }
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
                // If the parsed description is valid, we update the existing row
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
               {article.groundingUrls && article.groundingUrls.length > 0 && !isArticleLocked && (
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
                <td className="px-3 py-1 text-[9px] font-black text-blue-600 uppercase tracking-widest border-r border-gray-200 bg-white/50">MISURE</td>
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
                                          className={`w-full bg-transparent border-none p-0 focus:ring-0 ${m.type === 'deduction' ? 'text-red-600 placeholder-red-300' : 'placeholder-gray-300'} disabled:cursor-not-allowed ${recordingMeasId === m.id ? 'recording-feedback bg-purple-50' : ''}`} 
                                          placeholder={m.type === 'deduction' ? "A dedurre..." : "Descrizione misura..."} 
                                          disabled={areControlsDisabled}
                                          onMouseDown={() => handleLongPressStart(m.id)}
                                          onMouseUp={handleLongPressEnd}
                                          onMouseLeave={handleLongPressEnd}
                                          onTouchStart={() => handleLongPressStart(m.id)}
                                          onTouchEnd={handleLongPressEnd}
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
         {isArticleDragOver && articleDropPosition === 'bottom' && (
             <tr className="h-0 p-0 border-none"><td colSpan={12} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-green-500 top-0 z-50 shadow-[0_0_8px_rgba(34,197,94,0.8)] pointer-events-none"></div></td></tr>
         )}
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
  // States for drag-and-drop feedback
  const [isAnalysisDragOver, setIsAnalysisDragOver] = useState(false);
  const [isWorkspaceDragOver, setIsWorkspaceDragOver] = useState(false);

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
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [activeSoaCategory, setActiveSoaCategory] = useState<string>('OG1');
  const [wbsDropTarget, setWbsDropTarget] = useState<{ code: string, position: 'top' | 'bottom' } | null>(null);
  const [isDraggingArticle, setIsDraggingArticle] = useState(false);
  const [isAnalysisEditorOpen, setIsAnalysisEditorOpen] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState<PriceAnalysis | null>(null);
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');
  const [isImportAnalysisModalOpen, setIsImportAnalysisModalOpen] = useState(false);
  const [activeCategoryForAi, setActiveCategoryForAi] = useState<string | null>(null);
  
  // NEW: State for WBS Import/Duplicate options modal
  const [wbsOptionsContext, setWbsOptionsContext] = useState<{ type: 'import' | 'duplicate', sourceCode?: string, payload?: any, initialName?: string } | null>(null);

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
          setHistory(prev => { const newHist = [...prev, { articles: articles, categories: categories, analyses: analyses }]; return newHist.length > 50 ? newHist.slice(newHist.length - 50) : newHist; });
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
        if (cat && (cat.isEnabled === false)) return acc;
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
          
          const updatedArticles = [...articles];
          const categoryArticles = updatedArticles.filter(a => a.categoryCode === targetCode);
          const otherArticles = updatedArticles.filter(a => a.categoryCode !== targetCode);
          
          categoryArticles.splice(insertIndex, 0, newArticle);
          updateState([...otherArticles, ...categoryArticles]);
      }
  };

  const handleAnalysisDragStart = (e: React.DragEvent, analysis: PriceAnalysis) => { 
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

  const handleDeleteCategory = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Sei sicuro di voler eliminare la WBS ${code} e tutte le sue voci?`)) {
      let newCats = categories.filter(c => c.code !== code);
      let newArts = articles.filter(a => a.categoryCode !== code);
      const result = renumberCategories(newCats, newArts);
      updateState(result.newArticles, result.newCategories);
    }
  };

  const handleWbsDragStart = (e: React.DragEvent, code: string) => { 
      setDraggedCategoryCode(code); 
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
      e.dataTransfer.dropEffect = 'copy'; 
      if (isDraggingArticle) return;
      if (draggedCategoryCode || e.dataTransfer.types.includes('text/plain')) {
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
      const pos = wbsDropTarget?.position || 'bottom';
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
                  const initialName = payload.category?.name || 'Capitolo Importato';
                  setWbsOptionsContext({ type: 'import', payload, initialName });
                  return;
              }
          } catch (e) { console.error("Import Error", e); }
          return;
      }
      if (draggedCategoryCode) {
          if (!targetCode || draggedCategoryCode === targetCode) { setDraggedCategoryCode(null); return; }
          const sIdx = categories.findIndex(c => c.code === draggedCategoryCode); 
          let tIdx = categories.findIndex(c => c.code === targetCode); 
          const newCatsOrder = [...categories]; 
          const [movedCat] = newCatsOrder.splice(sIdx, 1); 
          if (sIdx < tIdx && pos === 'top') tIdx--;
          else if (sIdx > tIdx && pos === 'bottom') tIdx++;
          newCatsOrder.splice(tIdx, 0, movedCat); 
          const result = renumberCategories(newCatsOrder, articles); 
          updateState(result.newArticles, result.newCategories); 
          setDraggedCategoryCode(null);
      }
  };

  // NEW: Refined Duplicate/Import logic that handles the user's choice and name
  const handleWbsActionChoice = (keepMeasurements: boolean, newName: string) => {
    if (!wbsOptionsContext) return;
    const { type, sourceCode, payload } = wbsOptionsContext;
    
    if (type === 'duplicate' && sourceCode) {
      const sourceCat = categories.find(c => c.code === sourceCode); 
      if (!sourceCat) return; 
      const sourceArticles = articles.filter(a => a.categoryCode === sourceCode); 
      const newCategory = { ...sourceCat, name: newName }; 
      const tempCode = `TEMP_CLONE_${Date.now()}`; 
      newCategory.code = tempCode; 
      
      const newArticlesRaw = sourceArticles.map(art => {
        const newArtId = Math.random().toString(36).substr(2, 9);
        return { 
          ...art, 
          id: newArtId, 
          categoryCode: tempCode, 
          measurements: keepMeasurements 
            ? art.measurements.map(m => ({ ...m, id: Math.random().toString(36).substr(2, 9), linkedArticleId: undefined }))
            : [{ id: Math.random().toString(36).substr(2, 9), description: '', type: 'positive' as const }]
        };
      }); 
      
      const sourceIndex = categories.findIndex(c => c.code === sourceCode); 
      const newCatsList = [...categories]; 
      newCatsList.splice(sourceIndex + 1, 0, newCategory); 
      const allArticles = [...articles, ...newArticlesRaw]; 
      const result = renumberCategories(newCatsList, allArticles); 
      updateState(result.newArticles, result.newCategories);
    } 
    else if (type === 'import' && payload) {
      const { category: importedCat, articles: importedArticles, analyses: importedAnalyses } = payload;
      if (importedCat && Array.isArray(importedArticles)) {
          const newCategory: Category = { ...importedCat, name: newName, isImported: true };
          const newAnalysesList = [...analyses];
          const analysisIdMap = new Map<string, string>();
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
          
          const newCatsList = [...categories, newCategory];
          const result = renumberCategories(newCatsList, articles); 
          const newCatCode = result.codeMap[newCategory.code] || newCategory.code;

          const processedArticles = importedArticles.map((art: Article) => {
              const newArticleId = Math.random().toString(36).substr(2, 9);
              let newLinkedAnalysisId = art.linkedAnalysisId;
              if (art.linkedAnalysisId && analysisIdMap.has(art.linkedAnalysisId)) { newLinkedAnalysisId = analysisIdMap.get(art.linkedAnalysisId); }
              return { 
                ...art, 
                id: newArticleId, 
                categoryCode: newCatCode, 
                linkedAnalysisId: newLinkedAnalysisId, 
                measurements: keepMeasurements 
                  ? art.measurements.map((m: Measurement) => ({ ...m, id: Math.random().toString(36).substr(2, 9), linkedArticleId: undefined }))
                  : [{ id: Math.random().toString(36).substr(2, 9), description: '', type: 'positive' as const }]
              };
          });
          updateState([...result.newArticles, ...processedArticles], result.newCategories, newAnalysesList);
      }
    }
    setWbsOptionsContext(null);
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
      const nextAnalysisCode = `AP.${(analyses.length + 1).toString().padStart(2, '0')}`;
      const newAnalysis: PriceAnalysis = { id: Math.random().toString(36).substr(2, 9), code: nextAnalysisCode, description: 'Nuova voce da analizzare', unit: 'cad', analysisQuantity: 1, generalExpensesRate: 15, profitRate: 10, totalMaterials: 0, totalLabor: 0, totalEquipment: 0, costoTecnico: 0, valoreSpese: 0, valoreUtile: 0, totalBatchValue: 0, totalUnitPrice: 0, components: [{ id: Math.random().toString(36).substr(2, 9), type: 'general', description: 'Stima a corpo (da dettagliare)', unit: 'cad', unitPrice: 0, quantity: 1 }] };
      const newArticle: Article = { id: Math.random().toString(36).substr(2, 9), categoryCode, code: nextAnalysisCode, description: 'Nuova voce da analizzare', unit: 'cad', unitPrice: 0, laborRate: 0, linkedAnalysisId: newAnalysis.id, priceListSource: `Da Analisi ${nextAnalysisCode}`, soaCategory: activeSoaCategory, measurements: [{ id: Math.random().toString(36).substr(2,9), description: '', type: 'positive', multiplier: undefined }], quantity: 0 }; 
      setAnalyses(prev => [...prev, newAnalysis]);
      updateState([...articles, newArticle], categories, [...analyses, newAnalysis]);
      setEditingAnalysis(newAnalysis);
      setViewMode('ANALISI');
      setIsAnalysisEditorOpen(true);
  };

  const handleToggleArticleLock = (id: string) => { const updated = articles.map(art => art.id === id ? { ...art, isLocked: !art.isLocked } : art); updateState(updated); };

  const handleDropContent = (rawText: string) => { 
      const targetCatCode = activeCategoryForAi || (selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode);
      const currentCat = categories.find(c => c.code === targetCatCode);
      if (currentCat && currentCat.isLocked) { alert("Impossibile importare: Il capitolo è bloccato."); return; }
      if (!rawText) return; 
      setIsProcessingDrop(true); 
      setTimeout(() => { try { const parsed = parseDroppedContent(rawText); if (parsed) { const newArticle: Article = { id: Math.random().toString(36).substr(2, 9), categoryCode: targetCatCode, code: parsed.code || 'NP.001', priceListSource: parsed.priceListSource, description: parsed.description || 'Voce importata', unit: parsed.unit || 'cad', unitPrice: parsed.unitPrice || 0, laborRate: parsed.laborRate || 0, soaCategory: activeSoaCategory, measurements: [{ id: Math.random().toString(36).substr(2,9), description: '', type: 'positive', length: undefined, multiplier: undefined }], quantity: 0 }; updateState([...articles, newArticle]); } else { alert("Struttura dati non riconosciuta."); } } catch (e) { console.error(e); alert("Errore durante l'analisi."); } finally { setIsProcessingDrop(false); } }, 100); 
  };

  const handleWorkspaceDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isExternalText = e.dataTransfer.types.includes('text/plain');
    const isInternalMove = e.dataTransfer.types.includes('type') && (e.dataTransfer.getData('type') === 'ARTICLE' || e.dataTransfer.getData('type') === 'MEASUREMENT');
    
    if (isExternalText && !isInternalMove) {
      if (selectedCategoryCode !== 'SUMMARY') {
        setIsWorkspaceDragOver(true);
      }
    }
  };

  const handleWorkspaceDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWorkspaceDragOver(false);
    
    const textData = e.dataTransfer.getData('text');
    if (textData) {
      handleDropContent(textData);
    }
  };

  const getFullProjectExportData = () => { return JSON.stringify({ gecolaData: { projectInfo, categories, articles, analyses }, exportedAt: new Date().toISOString(), app: "GeCoLa Cloud" }, null, 2); };
  
  const handleSmartSave = async (silent: boolean = false) => { 
    const jsonString = getFullProjectExportData(); 
    if ('showSaveFilePicker' in window) { 
        try { 
            let handle = currentFileHandle; 
            if (!handle) { 
                if (silent) return; 
                handle = await (window as any).showSaveFilePicker({ suggestedName: `${projectInfo.title || 'Progetto'}.json`, types: [{ description: 'JSON Project File', accept: { 'application/json': ['.json'] }, }], }); 
                setCurrentFileHandle(handle); 
            } 
            setIsAutoSaving(true); 
            const writable = await handle.createWritable(); 
            await writable.write(jsonString); 
            await writable.close(); 
            setLastSaved(new Date()); 
        } catch (err: any) { 
            if (err.name !== 'AbortError' && !silent) { 
                setIsSaveModalOpen(true); 
            } 
        } finally { 
            setTimeout(() => setIsAutoSaving(false), 800); 
        } 
    } else { 
        if (!silent) setIsSaveModalOpen(true); 
    } 
  };
  
  useEffect(() => { 
    if (!currentFileHandle) return; 
    const timeoutId = setTimeout(() => { 
        handleSmartSave(true); 
    }, 3000); 
    return () => clearTimeout(timeoutId); 
  }, [articles, categories, projectInfo, analyses, currentFileHandle]);

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const content = event.target?.result as string; const data = JSON.parse(content); if (data.gecolaData) { setProjectInfo(data.gecolaData.projectInfo); updateState(data.gecolaData.articles, data.gecolaData.categories, data.gecolaData.analyses || []); } else { alert("Formato non valido."); } setCurrentFileHandle(null); } catch (error) { alert("Errore caricamento."); } }; reader.readAsText(file); e.target.value = ''; };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => { 
    if (e.key === 'Enter') { 
        const target = e.target as HTMLElement; 
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') { 
            if (target.tagName === 'TEXTAREA' && e.shiftKey) return; 
            
            const inputs = Array.from(document.querySelectorAll('input:not([disabled]), textarea:not([disabled])')); 
            const index = inputs.indexOf(target as HTMLInputElement | HTMLTextAreaElement); 
            
            // Check if we are in the last editable field of a measurement row
            const isLastMeasField = target.getAttribute('data-last-meas-field') === 'true';
            
            if (isLastMeasField) {
                // Find the parent article ID
                const articleRow = target.closest('tbody');
                if (articleRow) {
                    const articleId = articleRow.id.replace('article-', '');
                    // Add a new row
                    handleAddMeasurement(articleId);
                    // Focusing is handled by autoFocus in the render method of the new input
                    e.preventDefault();
                    return;
                }
            }

            if (index > -1 && index < inputs.length - 1) {
                e.preventDefault();
                (inputs[index + 1] as HTMLElement).focus(); 
            }
        } 
    } 
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-[#2c3e50] text-white font-black text-2xl animate-pulse tracking-widest uppercase">GECOLA PRO CARICAMENTO...</div>;
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
      
      <div className="bg-[#2c3e50] shadow-md z-50 h-14 flex items-center justify-between px-6 border-b border-slate-600 flex-shrink-0">
          <div className="flex items-center space-x-3 w-64">
            <div className="bg-orange-500 p-1.5 rounded-lg shadow-lg"><Calculator className="w-5 h-5 text-white" /></div>
            <span className="font-bold text-lg text-white">GeCoLa <span className="font-light opacity-80">v11.9.1</span></span>
          </div>
          <div className="flex-1 px-6 flex justify-center items-center gap-6">
              <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-1.5 rounded-full border border-slate-700 text-white font-bold text-sm cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => setIsSettingsModalOpen(true)}>
                  {isAutoSaving && <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)] mr-2"></span>}
                  <span className="truncate max-w-[250px]">{projectInfo.title}</span>
                  <Edit3 className="w-3 h-3 text-slate-400 ml-1" />
              </div>
              <div className="flex items-center bg-slate-800/30 rounded-full px-2 py-1 gap-1">
                <button onClick={handleUndo} disabled={history.length === 0} className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-all hover:scale-110" title="Annulla"><Undo2 className="w-4 h-4" /></button>
                <div className="w-px h-4 bg-slate-600"></div>
                <button onClick={handleRedo} disabled={future.length === 0} className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-all hover:scale-110" title="Ripristina"><Redo2 className="w-4 h-4" /></button>
              </div>
          </div>
          <div className="flex items-center space-x-2">
             <div className="relative">
                <button onClick={() => setIsSaveMenuOpen(!isSaveMenuOpen)} className="p-2 text-slate-300 hover:text-blue-400 transition-colors flex items-center gap-1" title="Salva Progetto">
                    <Save className="w-5 h-5" />
                    <ChevronDown className={`w-3 h-3 transition-transform ${isSaveMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isSaveMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white shadow-2xl rounded-lg py-2 z-[100] border border-gray-200 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150">
                        <button onClick={() => { setIsSaveMenuOpen(false); handleSmartSave(false); }} className="w-full px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-3 border-b border-gray-100"><FileJson className="w-4 h-4 text-blue-600" /><b>Computo Metrico (.json)</b></button>
                        <button onClick={() => { setIsSaveMenuOpen(false); setIsSaveModalOpen(true); }} className="w-full px-4 py-3 text-sm text-gray-700 hover:bg-orange-50 flex items-center gap-3"><Coins className="w-4 h-4 text-orange-600" /><b>Esporta Altri Formati</b></button>
                    </div>
                )}
             </div>
             <button onClick={() => generateComputoMetricPdf(projectInfo, categories, articles)} className="p-2 text-slate-300 hover:text-white transition-colors"><FileText className="w-5 h-5" /></button>
             <button onClick={() => signOut(auth)} className="p-2 text-red-400 hover:text-white ml-2 transition-colors"><LogOut className="w-5 h-5" /></button>
          </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden print:hidden">
        <div className="w-64 bg-white border-r border-slate-300 flex flex-col flex-shrink-0 z-10 shadow-lg">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex gap-1">
             <button onClick={() => setViewMode('COMPUTO')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${viewMode === 'COMPUTO' ? 'bg-white text-blue-700 ring-1 ring-blue-200 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>Computo</button>
             <button onClick={() => setViewMode('ANALISI')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${viewMode === 'ANALISI' ? 'bg-white text-purple-700 ring-1 ring-purple-200 shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>Analisi</button>
          </div>

          <div className="flex-1 overflow-y-auto" onDrop={(e) => handleWbsDrop(e, null)}>
              {viewMode === 'COMPUTO' ? (
                <>
                  <div className="p-3 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase flex justify-between items-center tracking-widest">
                    <span>Indice WBS</span>
                    <PlusCircle className="w-4 h-4 text-blue-600 cursor-pointer hover:scale-110 transition-transform" onClick={handleAddCategory}/>
                  </div>
                  <ul className="py-0">
                      {categories.map(cat => (
                      <li 
                          key={cat.code} 
                          className={`relative group/cat border-b border-gray-100 transition-all ${!cat.isEnabled ? 'opacity-40 grayscale' : ''}`} 
                          onDragOver={(e) => handleWbsDragOver(e, cat.code)} 
                          onDragEnter={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                          onDragLeave={handleWbsDragLeave}
                          onDrop={(e) => handleWbsDrop(e, cat.code)}
                      >
                          {wbsDropTarget?.code === cat.code && <div className={`absolute ${wbsDropTarget.position === 'top' ? 'top-0' : 'bottom-0'} left-0 right-0 h-1 bg-green-500 z-50 shadow-[0_0_10px_rgba(34,197,94,0.8)] pointer-events-none`} />}
                          
                          <div draggable onDragStart={(e) => handleWbsDragStart(e, cat.code)} className="cursor-pointer" onClick={() => setSelectedCategoryCode(cat.code)}>
                              <div className={`w-full text-left pl-3 pr-2 py-3 border-l-4 transition-all flex flex-col ${cat.isImported ? 'border-green-500 bg-green-50/20' : (selectedCategoryCode === cat.code ? 'bg-blue-50 border-blue-500 shadow-sm' : 'border-transparent hover:bg-slate-50')}`}>
                                  <div className="flex items-center gap-2 mb-0.5">
                                      <GripVertical className="w-3 h-3 text-slate-300 opacity-0 group-hover/cat:opacity-100" />
                                      <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${selectedCategoryCode === cat.code ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-600'}`}>{cat.code}</span>
                                      {cat.isImported && <span className="text-[8px] font-black bg-green-600 text-white px-1 rounded uppercase tracking-tighter">Import</span>}
                                      {cat.isLocked && <Lock className="w-3 h-3 text-red-500" />}
                                  </div>
                                  <div className="pl-5">
                                      <span className="text-xs font-semibold block truncate pr-8">{cat.name}</span>
                                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">{formatCurrency(categoryTotals[cat.code] || 0)}</span>
                                  </div>
                              </div>
                          </div>

                          <div className="absolute right-1 top-2 flex flex-row bg-white/95 shadow-xl rounded-full border border-gray-200 p-0.5 opacity-0 group-hover/cat:opacity-100 z-20 space-x-0.5 transition-all">
                              <button onClick={(e) => { e.stopPropagation(); const newCats = categories.map(c => c.code === cat.code ? {...c, isEnabled: !c.isEnabled} : c); setCategories(newCats); }} className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full" title="Abilita/Disabilita">{cat.isEnabled ? <Lightbulb className="w-3.5 h-3.5" /> : <LightbulbOff className="w-3.5 h-3.5" />}</button>
                              <button onClick={(e) => { e.stopPropagation(); const newCats = categories.map(c => c.code === cat.code ? {...c, isLocked: !c.isLocked} : c); setCategories(newCats); }} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full" title="Blocca/Sblocca">{cat.isLocked ? <Lock className="w-3.5 h-3.5 text-red-500" /> : <Unlock className="w-3.5 h-3.5" />}</button>
                              {/* NEW: DUPLICATE BUTTON passes initialName */}
                              <button onClick={(e) => { e.stopPropagation(); setWbsOptionsContext({ type: 'duplicate', sourceCode: cat.code, initialName: cat.name }); }} className="p-1 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-full" title="Duplica WBS"><Copy className="w-3.5 h-3.5" /></button>
                              <button onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }} className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-full" title="Rinomina">{cat.isLocked ? <Settings className="w-3.5 h-3.5 opacity-30"/> : <Edit2 className="w-3.5 h-3.5" />}</button>
                              <button onClick={(e) => handleDeleteCategory(cat.code, e)} className="p-1 text-gray-400 hover:text-red-600 rounded-full" title="Elimina">{cat.isLocked ? <XCircle className="w-3.5 h-3.5 opacity-30"/> : <Trash2 className="w-3.5 h-3.5" />}</button>
                          </div>
                      </li>
                      ))}
                  </ul>
                  
                  <div className="mt-auto p-3 border-t border-gray-300 bg-slate-50 sticky bottom-0 z-20">
                      <button 
                          onClick={() => setSelectedCategoryCode('SUMMARY')}
                          className={`w-full flex items-center p-2.5 rounded text-xs font-black uppercase transition-colors ${selectedCategoryCode === 'SUMMARY' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-white border border-transparent hover:border-slate-200'}`}
                      >
                          <Layers className="w-4 h-4 mr-2" />
                          Riepilogo Generale
                      </button>
                      <div className="mt-2 text-right px-2 pb-1">
                          <span className="text-[9px] text-slate-400 uppercase font-bold block">Totale Lavori</span>
                          <span className="font-mono font-black text-sm text-slate-700">{formatCurrency(totals.totalWorks)}</span>
                      </div>
                  </div>
                </>
              ) : (
                <div className="p-2 space-y-2">
                    <div className="p-1 bg-white border-b border-gray-200">
                      <input type="text" placeholder="Cerca Analisi..." value={analysisSearchTerm} onChange={e => setAnalysisSearchTerm(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded text-xs outline-none focus:ring-1 focus:ring-purple-400" />
                    </div>
                    {filteredAnalyses.map(analysis => (
                         <div key={analysis.id} draggable onDragStart={(e) => handleAnalysisDragStart(e, analysis)} className="bg-white p-3 rounded border border-gray-200 shadow-sm hover:border-purple-300 transition-all cursor-grab active:cursor-grabbing">
                             <div className="flex justify-between mb-1"><span className="bg-purple-100 text-purple-700 font-bold font-mono text-[10px] px-1.5 py-0.5 rounded">{analysis.code}</span><span className="font-bold text-gray-800 text-xs">{formatCurrency(analysis.totalUnitPrice)}</span></div>
                             <p className="text-[10px] text-gray-600 line-clamp-2 leading-tight">{analysis.description}</p>
                             <div className="flex justify-between items-center mt-2 border-t pt-2"><span className="text-[10px] text-gray-400 font-bold">{analysis.unit}</span><button onClick={() => handleImportAnalysisToArticle(analysis)} className="p-1 text-purple-400 hover:bg-purple-600 hover:text-white rounded"><ArrowRightLeft className="w-3.5 h-3.5" /></button></div>
                         </div>
                    ))}
                </div>
              )}
          </div>
        </div>

        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f0f2f5] p-5 gap-4">
           {activeCategory && selectedCategoryCode !== 'SUMMARY' && (
               <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-300 shadow-sm animate-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-3">
                         <div className="bg-[#2c3e50] text-white p-2.5 rounded-lg shadow-lg font-black text-xl">{activeCategory.code}</div>
                         <div><h2 className="text-lg font-black text-slate-800 uppercase max-w-[400px] truncate tracking-tight">{activeCategory.name}</h2><span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{formatCurrency(categoryTotals[activeCategory.code] || 0)}</span></div>
                    </div>
                    <div className="flex items-center gap-3">
                       <div className="flex flex-col">
                            <span className="text-[8px] font-black text-purple-600 uppercase mb-0.5 ml-1 flex items-center gap-1">
                                <Award className="w-2.5 h-2.5" /> Preimposta Categoria SOA
                            </span>
                            <select 
                                value={activeSoaCategory}
                                onChange={(e) => setActiveSoaCategory(e.target.value)}
                                className="bg-purple-50 border border-purple-200 text-purple-900 text-xs font-bold rounded-lg px-2 py-2 outline-none focus:ring-1 focus:ring-purple-500 min-w-[200px] shadow-sm hover:border-purple-300 transition-colors"
                            >
                                {SOA_CATEGORIES.map(soa => (
                                    <option key={soa.code} value={soa.code}>{soa.code} - {soa.desc}</option>
                                ))}
                            </select>
                       </div>
                       <button onClick={() => { setActiveCategoryForAi(activeCategory.code); setIsImportAnalysisModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700 transition-all flex items-center gap-2 text-xs h-[38px] mt-3">
                           <Plus className="w-4 h-4" /> Aggiungi Voce
                       </button>
                    </div>
               </div>
           )}

           <div 
             className="flex-1 overflow-y-auto rounded-xl bg-white shadow-2xl border border-gray-300 flex flex-col relative" 
             onKeyDown={handleInputKeyDown}
             onDragOver={handleWorkspaceDragOver}
             onDragLeave={() => setIsWorkspaceDragOver(false)}
             onDrop={handleWorkspaceDrop}
           >
              {/* SMART GATE OVERLAY */}
              {isWorkspaceDragOver && (
                <div className="absolute inset-0 z-[100] bg-blue-600/10 backdrop-blur-[2px] border-4 border-dashed border-blue-500 rounded-xl flex items-center justify-center p-12 pointer-events-none animate-in fade-in duration-200">
                   <div className="bg-white p-10 rounded-3xl shadow-2xl border border-blue-200 flex flex-col items-center text-center max-w-md animate-in zoom-in-95">
                      <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                        <Sparkles className="w-10 h-10 text-blue-600 animate-pulse" />
                      </div>
                      <h3 className="text-2xl font-black text-blue-900 mb-2 uppercase tracking-tight">GeCoLa Smart Gate</h3>
                      <p className="text-gray-600 mb-6 leading-relaxed">Rilascia qui per aggiungere istantaneamente la voce al capitolo:<br/><span className="font-black text-blue-700">{activeCategory?.code} - {activeCategory?.name}</span></p>
                      <div className="flex items-center gap-2 text-xs font-bold text-blue-500 uppercase tracking-widest bg-blue-50 px-4 py-2 rounded-full">
                        <ArrowRightLeft className="w-4 h-4" /> Pronto per l'importazione
                      </div>
                   </div>
                </div>
              )}

              {viewMode === 'COMPUTO' && (
                  selectedCategoryCode === 'SUMMARY' ? (
                      <div className="p-8"><Summary totals={totals} info={projectInfo} categories={categories} articles={articles} /></div>
                  ) : activeCategory ? (
                      <div key={activeCategory.code} className="flex flex-col h-full">
                          <div className="flex-1 overflow-x-auto">
                              <table className="w-full text-left border-collapse">
                                  <TableHeader activeColumn={activeColumn} />
                                  {activeArticles.length === 0 ? (
                                      <tbody><tr><td colSpan={12} className="p-20 text-center text-slate-300 italic font-medium uppercase tracking-widest">Nessun articolo inserito. Trascina voci da GeCoLa.it o usa il tasto "+"</td></tr></tbody>
                                  ) : (
                                      activeArticles.map((article, artIndex) => (
                                          <ArticleGroup key={article.id} article={article} index={artIndex} allArticles={articles} isPrintMode={false} isCategoryLocked={activeCategory.isLocked} onUpdateArticle={handleUpdateArticle} onEditArticleDetails={handleEditArticleDetails} onDeleteArticle={handleDeleteArticle} onAddMeasurement={handleAddMeasurement} onAddSubtotal={handleAddSubtotal} onAddVoiceMeasurement={handleAddVoiceMeasurement} onUpdateMeasurement={handleUpdateMeasurement} onDeleteMeasurement={handleDeleteMeasurement} onToggleDeduction={handleToggleDeduction} onOpenLinkModal={handleOpenLinkModal} onScrollToArticle={handleScrollToArticle} onReorderMeasurements={handleReorderMeasurements} onArticleDragStart={handleArticleDragStart} onArticleDrop={handleArticleDrop} onArticleDragEnd={handleArticleDragEnd} lastAddedMeasurementId={lastAddedMeasurementId} onColumnFocus={setActiveColumn} onViewAnalysis={handleViewLinkedAnalysis} onInsertExternalArticle={handleInsertExternalArticle} onToggleArticleLock={handleToggleArticleLock} />
                                      ))
                                  )}
                              </table>
                          </div>
                      </div>
                  ) : <div className="p-20 text-center text-gray-400 uppercase font-black opacity-20 text-3xl">Seleziona un capitolo</div>
              )}
              {viewMode === 'ANALISI' && <div className="flex flex-col items-center justify-center h-full p-10 bg-white"><div className="bg-white p-10 rounded-2xl shadow-xl border border-purple-100 max-w-2xl text-center"><TestTubes className="w-16 h-16 text-purple-600 mx-auto mb-6" /><h2 className="text-2xl font-bold text-gray-800 mb-2">Gestione Analisi Prezzi</h2><button onClick={() => { setEditingAnalysis(null); setIsAnalysisEditorOpen(true); }} className="bg-purple-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:bg-purple-700 transition-transform hover:scale-105 mt-6 flex items-center gap-2 mx-auto"><Plus className="w-5 h-5" /> Crea Nuova Analisi</button></div></div>}
           </div>
        </div>
      </div>
      
      <ProjectSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} info={projectInfo} onSave={(newInfo) => setProjectInfo(newInfo)} />
      {editingArticle && <ArticleEditModal isOpen={isEditArticleModalOpen} onClose={() => { setIsEditArticleModalOpen(false); setEditingArticle(null); }} article={editingArticle} onSave={handleArticleEditSave} onConvertToAnalysis={handleConvertArticleToAnalysis} />}
      {linkTarget && <LinkArticleModal isOpen={isLinkModalOpen} onClose={() => { setIsLinkModalOpen(false); setLinkTarget(null); }} articles={articles} currentArticleId={linkTarget.articleId} onLink={handleLinkMeasurement} />}
      <CategoryEditModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} onSave={handleSaveCategory} initialData={editingCategory} nextWbsCode={generateNextWbsCode(categories)} />
      <SaveProjectModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} articles={articles} categories={categories} projectInfo={projectInfo} />
      <AnalysisEditorModal isOpen={isAnalysisEditorOpen} onClose={() => setIsAnalysisEditorOpen(false)} analysis={editingAnalysis} onSave={handleSaveAnalysis} nextCode={`AP.${(analyses.length + 1).toString().padStart(2, '0')}`} />
      <ImportAnalysisModal isOpen={isImportAnalysisModalOpen} onClose={() => setIsImportAnalysisModalOpen(false)} analyses={analyses} onImport={handleImportAnalysisToArticle} onCreateNew={() => { setIsImportAnalysisModalOpen(false); handleAddEmptyArticle(activeCategoryForAi || selectedCategoryCode); }} />
      {/* NEW: WBS IMPORT/DUPLICATE OPTIONS MODAL handles newName callback */}
      <WbsImportOptionsModal 
        isOpen={!!wbsOptionsContext} 
        onClose={() => setWbsOptionsContext(null)} 
        onChoice={handleWbsActionChoice} 
        isImport={wbsOptionsContext?.type === 'import'} 
        initialName={wbsOptionsContext?.initialName || ''}
      />
    </div>
  );
};

export default App;
