
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
import { parseDroppedContent, parseVoiceMeasurement, generateBulkItems } from './services/geminiService';
import { generateComputoMetricPdf } from './services/pdfGenerator';

// --- Types ---
// Fix: Added missing ViewMode and Snapshot types (Error on lines 392, 399, 400)
type ViewMode = 'COMPUTO' | 'ANALISI';
interface Snapshot {
  articles: Article[];
  categories: Category[];
  analyses: PriceAnalysis[];
}

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
  displayWbsCode: string;
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
   const { article, index, allArticles, isPrintMode, isCategoryLocked, displayWbsCode, onUpdateArticle, onEditArticleDetails, onDeleteArticle, onAddMeasurement, onAddSubtotal, onAddVoiceMeasurement, onUpdateMeasurement, onDeleteMeasurement, onToggleDeduction, onOpenLinkModal, onScrollToArticle, onReorderMeasurements, onArticleDragStart, onArticleDrop, onArticleDragEnd, lastAddedMeasurementId, onColumnFocus, onViewAnalysis, onInsertExternalArticle, onToggleArticleLock } = props;
   
   const [measurementDragOverId, setMeasurementDragOverId] = useState<string | null>(null);
   const [isArticleDragOver, setIsArticleDragOver] = useState(false);
   const [articleDropPosition, setArticleDropPosition] = useState<'top' | 'bottom' | null>(null);
   const [recordingId, setRecordingId] = useState<string | null>(null);
   const pressTimer = useRef<any>(null);
   const recognitionRef = useRef<any>(null);
   const tbodyRef = useRef<HTMLTableSectionElement>(null);
   // Fix: Added missing addBtnRef (Error on line 372)
   const addBtnRef = useRef<HTMLButtonElement>(null);

   const isArticleLocked = article.isLocked || false;
   const areControlsDisabled = isCategoryLocked || isArticleLocked;

   const handleLongPressStart = (id: string, field: string, initialValue: any, callback: (val: any) => void) => {
     if (areControlsDisabled) return;
     pressTimer.current = setTimeout(() => {
        startVoiceRecognition(id, field, initialValue, callback);
     }, 1500); // 1.5 secondi per essere reattivi
   };

   const handleLongPressEnd = () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
   };

   const startVoiceRecognition = (id: string, field: string, initialValue: any, callback: (val: any) => void) => {
      if (!('webkitSpeechRecognition' in window)) {
        alert("Il tuo browser non supporta il riconoscimento vocale.");
        return;
      }
      setRecordingId(`${id}-${field}`);
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.lang = 'it-IT';
      recognition.continuous = false;
      recognition.onresult = async (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (field === 'description') {
              callback(transcript);
          } else {
              // Prova a parsare come numero o misura complessa via AI
              const parsed = await parseVoiceMeasurement(transcript);
              if (parsed) {
                  if (field === 'measurement') {
                      onAddVoiceMeasurement(article.id, parsed);
                  } else {
                      callback(parsed[field as keyof Partial<Measurement>] || transcript);
                  }
              }
          }
          setRecordingId(null);
      };
      recognition.onerror = () => setRecordingId(null);
      recognition.onend = () => setRecordingId(null);
      recognition.start();
   };

   const getLinkedArticleNumber = (linkedArt: Article) => {
       const catArticles = allArticles.filter(a => a.categoryCode === linkedArt.categoryCode);
       const localIndex = catArticles.findIndex(a => a.id === linkedArt.id) + 1;
       const wbsNum = getWbsNumber(displayWbsCode);
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
   const hierarchicalNumber = `${getWbsNumber(displayWbsCode)}.${index + 1}`;

   return (
      <tbody 
        ref={tbodyRef}
        id={`article-${article.id}`} 
        className={`bg-white border-b border-gray-400 group/article transition-all relative ${isArticleLocked ? 'bg-gray-50/50' : ''}`}
      >
         <tr className={`align-top ${!isPrintMode ? 'cursor-move hover:bg-slate-50' : ''}`} draggable={!isPrintMode && !areControlsDisabled} onDragStart={(e) => onArticleDragStart(e, article)} onDragEnd={onArticleDragEnd}>
            <td className="text-center py-2 text-xs font-bold text-gray-500 border-r border-gray-200 select-none bg-white font-mono">{hierarchicalNumber}</td>
            <td className="p-1 border-r border-gray-200 align-top bg-white">
                <div className="flex flex-col relative">
                    <textarea 
                        readOnly
                        value={article.code}
                        className={`font-mono font-bold text-xs w-full bg-transparent border-none px-1 resize-y overflow-hidden leading-tight disabled:text-gray-400 cursor-default focus:ring-0 ${article.linkedAnalysisId ? 'text-purple-700' : ''}`}
                        rows={2}
                    />
                    {article.priceListSource && <div className="text-[9px] text-gray-400 px-1 mt-1 leading-tight truncate">{article.priceListSource}</div>}
                </div>
            </td>
            <td className="p-2 border-r border-gray-200 bg-white">
               <textarea 
                  readOnly
                  value={article.description}
                  rows={isArticleLocked ? 2 : 4}
                  className={`w-full text-sm text-gray-900 font-serif text-justify border-none focus:ring-0 bg-transparent resize-y p-1 disabled:text-gray-400 cursor-default scrollbar-hide ${isArticleLocked ? 'text-gray-400 italic' : 'min-h-[50px]'}`}
               />
            </td>
            <td colSpan={8} className="border-r border-gray-200 bg-white"></td>
            <td className="print:hidden text-center align-top pt-2 bg-gray-50/30 border-l border-gray-200">
                {!isPrintMode && !isCategoryLocked && (
                   <div className="flex flex-col items-center gap-1 opacity-0 group-hover/article:opacity-100 transition-opacity">
                      <button onClick={() => onToggleArticleLock(article.id)} className={`transition-colors p-1 rounded ${isArticleLocked ? 'text-red-500 hover:text-red-700 bg-red-50' : 'text-gray-400 hover:text-blue-500'}`}>
                          {isArticleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                      {!isArticleLocked && (
                          <>
                            <button onClick={() => onEditArticleDetails(article)} className="text-gray-400 hover:text-blue-600 transition-colors p-1"><PenLine className="w-4 h-4" /></button>
                            <button onClick={() => onDeleteArticle(article.id)} className="text-gray-400 hover:text-red-600 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
                          </>
                      )}
                   </div>
                )}
            </td>
         </tr>
         
         {!isArticleLocked && (
           <>
            <tr className="bg-gray-50/50 border-b border-gray-100">
                <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                <td className="px-3 py-1 text-[9px] font-black text-blue-600 uppercase tracking-widest border-r border-gray-200 bg-white/50">MISURE</td>
                <td colSpan={9} className="border-r border-gray-200"></td>
            </tr>
            {processedMeasurements.map((m, idx) => (
                <tr key={m.id} className={`text-xs group/row cursor-default transition-all ${m.type === 'deduction' ? 'text-red-600' : 'text-gray-800'} ${m.type === 'subtotal' ? 'bg-yellow-50 font-bold' : 'bg-white'}`}>
                    <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                    <td className="pl-6 pr-2 py-1 border-r border-gray-200 relative">
                        {m.type === 'subtotal' ? <div className="italic text-gray-600 text-right pr-2">Sommano parziale</div> : (
                            <div className="flex items-center space-x-2">
                                <div className="absolute left-0 top-1/2 w-4 h-[1px] bg-gray-300"></div>
                                <input 
                                    value={m.description} 
                                    onFocus={() => onColumnFocus('desc')} 
                                    onBlur={() => { onColumnFocus(null); handleLongPressEnd(); }}
                                    onMouseDown={() => handleLongPressStart(m.id, 'description', m.description, (v) => onUpdateMeasurement(article.id, m.id, 'description', v))}
                                    onMouseUp={handleLongPressEnd}
                                    onChange={(e) => onUpdateMeasurement(article.id, m.id, 'description', e.target.value)} 
                                    className={`w-full bg-transparent border rounded px-1 transition-all ${recordingId === `${m.id}-description` ? 'ring-2 ring-red-500 animate-pulse border-red-500' : 'border-transparent focus:ring-0'} ${m.type === 'deduction' ? 'text-red-600 placeholder-red-300' : 'placeholder-gray-300'}`} 
                                    placeholder={m.type === 'deduction' ? "A dedurre..." : "Descrizione misura..."} 
                                    disabled={areControlsDisabled} 
                                />
                            </div>
                        )}
                    </td>
                    <td className="border-r border-gray-200 p-0 bg-gray-50">
                        {m.type !== 'subtotal' && (
                            <input type="number" onMouseDown={() => handleLongPressStart(m.id, 'multiplier', m.multiplier, (v) => onUpdateMeasurement(article.id, m.id, 'multiplier', v))} onMouseUp={handleLongPressEnd} disabled={areControlsDisabled} className={`w-full text-center bg-transparent border-none transition-all ${recordingId === `${m.id}-multiplier` ? 'bg-red-50 ring-1 ring-red-400' : ''}`} value={m.multiplier === undefined ? '' : m.multiplier} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'multiplier', e.target.value === '' ? undefined : parseFloat(e.target.value))} />
                        )}
                    </td>
                    <td className="border-r border-gray-200 p-0 bg-gray-50">
                        {m.type !== 'subtotal' && (
                            <input type="number" onMouseDown={() => handleLongPressStart(m.id, 'length', m.length, (v) => onUpdateMeasurement(article.id, m.id, 'length', v))} onMouseUp={handleLongPressEnd} disabled={areControlsDisabled} className={`w-full text-center bg-transparent border-none transition-all ${recordingId === `${m.id}-length` ? 'bg-red-50 ring-1 ring-red-400' : ''}`} value={m.length === undefined ? '' : m.length} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'length', e.target.value === '' ? undefined : parseFloat(e.target.value))} />
                        )}
                    </td>
                    <td className="border-r border-gray-200 p-0 bg-gray-50">
                        {m.type !== 'subtotal' && (
                            <input type="number" onMouseDown={() => handleLongPressStart(m.id, 'width', m.width, (v) => onUpdateMeasurement(article.id, m.id, 'width', v))} onMouseUp={handleLongPressEnd} disabled={areControlsDisabled} className={`w-full text-center bg-transparent border-none transition-all ${recordingId === `${m.id}-width` ? 'bg-red-50 ring-1 ring-red-400' : ''}`} value={m.width === undefined ? '' : m.width} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'width', e.target.value === '' ? undefined : parseFloat(e.target.value))} />
                        )}
                    </td>
                    <td className="border-r border-gray-200 p-0 bg-gray-50">
                        {m.type !== 'subtotal' && (
                            <input type="number" onMouseDown={() => handleLongPressStart(m.id, 'height', m.height, (v) => onUpdateMeasurement(article.id, m.id, 'height', v))} onMouseUp={handleLongPressEnd} disabled={areControlsDisabled} className={`w-full text-center bg-transparent border-none transition-all ${recordingId === `${m.id}-height` ? 'bg-red-50 ring-1 ring-red-400' : ''}`} value={m.height === undefined ? '' : m.height} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'height', e.target.value === '' ? undefined : parseFloat(e.target.value))} />
                        )}
                    </td>
                    <td className={`border-r border-gray-200 text-right font-mono pr-1 ${m.type === 'subtotal' ? 'bg-yellow-100 font-black' : 'text-gray-600'}`}>{formatNumber(m.displayValue)}</td>
                    <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                    <td className="text-center print:hidden bg-white border-l border-gray-200">
                        {!isPrintMode && !areControlsDisabled && (
                            <div className="flex justify-center items-center space-x-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                {m.type !== 'subtotal' && (
                                    <>
                                        <button onClick={() => onOpenLinkModal(article.id, m.id)} className={`rounded p-0.5 transition-colors ${m.linkedArticleId ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-blue-600'}`}><LinkIcon className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => onToggleDeduction(article.id, m.id)} className={`transition-colors p-0.5 rounded ${m.type === 'positive' ? 'text-red-400' : 'text-blue-400'}`}>{m.type === 'positive' ? <MinusCircle className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5" />}</button>
                                    </>
                                )}
                                <button onClick={() => onDeleteMeasurement(article.id, m.id)} className="text-gray-300 hover:text-red-500 rounded p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                        )}
                    </td>
                </tr>
            ))}
           </>
         )}

         <tr className="bg-white font-bold text-xs border-t border-gray-300 shadow-inner">
             <td className="border-r border-gray-300"></td><td className="border-r border-gray-200"></td>
             <td className="px-2 py-3 text-right border-r border-gray-300 uppercase text-gray-400 text-[10px]">Sommano {article.unit}</td>
             <td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td>
             <td className="text-right pr-1 font-mono border-r border-gray-200 bg-gray-50 font-black">{formatNumber(article.quantity)}</td>
             <td className="border-l border-r border-gray-300 text-right pr-1 font-mono">{formatNumber(article.unitPrice)}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-blue-900 font-black">{formatNumber(totalAmount)}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-gray-500 font-normal text-[10px]">{formatCurrency(laborValue)}</td>
             <td className="text-center print:hidden bg-gray-50 border-l border-gray-200">
                {!isPrintMode && !areControlsDisabled && (
                   <div className="flex items-center justify-center space-x-1">
                        <button onClick={() => onAddSubtotal(article.id)} className="w-5 h-5 rounded-full flex items-center justify-center text-orange-400 border border-orange-200 hover:bg-orange-500 hover:text-white transition-all"><Sigma className="w-3 h-3" /></button>
                        <button ref={addBtnRef} onClick={() => onAddMeasurement(article.id)} className="w-6 h-6 rounded-full flex items-center justify-center text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white transition-all"><Plus className="w-4 h-4" /></button>
                   </div>
                )}
             </td>
         </tr>
         <tr className="h-6 bg-[#f0f2f5] border-none"><td colSpan={12} className="border-none"></td></tr>
      </tbody>
   );
};

const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }
    const unsubscribe = onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
    return () => unsubscribe();
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
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [activeSoaCategory, setActiveSoaCategory] = useState<string>('OG1');
  const [isAnalysisEditorOpen, setIsAnalysisEditorOpen] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState<PriceAnalysis | null>(null);
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');
  const [isImportAnalysisModalOpen, setIsImportAnalysisModalOpen] = useState(false);
  const [isWorkspaceDragOver, setIsWorkspaceDragOver] = useState(false);
  const [activeCategoryForAi, setActiveCategoryForAi] = useState<string | null>(null);

  // Mappa dinamica per la numerazione WBS (ignora i disabilitati)
  const displayWbsCodes = useMemo(() => {
    const map: Record<string, string> = {};
    let count = 1;
    categories.forEach(cat => {
        if (cat.isEnabled !== false) {
            map[cat.code] = `WBS.${count.toString().padStart(2, '0')}`;
            count++;
        }
    });
    return map;
  }, [categories]);

  // Fix: Added missing updateState helper
  const updateState = (newArticles: Article[], newCategories: Category[] = categories, newAnalyses: PriceAnalysis[] = analyses, saveHistory: boolean = true) => {
      const recomputed = recalculateAllArticles(newArticles);
      if (saveHistory) {
          setHistory(prev => [...prev, { articles, categories, analyses }]);
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
    setArticles(next.articles); setCategories(prev.categories); setAnalyses(next.analyses);
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
        if (!cat || cat.isEnabled === false) return acc;
        return acc + (art.quantity * art.unitPrice);
    }, 0);
    const safetyCosts = totalWorks * (projectInfo.safetyRate / 100);
    const totalTaxable = totalWorks + safetyCosts;
    const vatAmount = totalTaxable * (projectInfo.vatRate / 100);
    return { totalWorks, safetyCosts, totalTaxable, vatAmount, grandTotal: totalTaxable + vatAmount };
  }, [articles, categories, projectInfo]);

  // Handler functions to fix compilation errors (Lines 611-642)
  
  const handleUpdateArticle = (id: string, field: keyof Article, value: string | number) => {
      const updated = articles.map(art => art.id === id ? { ...art, [field]: value } : art);
      updateState(updated);
  };

  const handleEditArticleDetails = (article: Article) => {
      setEditingArticle(article);
      setIsEditArticleModalOpen(true);
  };

  const handleArticleEditSave = (id: string, updates: Partial<Article>) => {
      const updated = articles.map(art => art.id === id ? { ...art, ...updates } : art);
      updateState(updated);
  };

  const handleDeleteArticle = (id: string) => {
      if (window.confirm("Sei sicuro di voler eliminare questo articolo?")) {
          const updated = articles.filter(art => art.id !== id);
          updateState(updated);
      }
  };

  const handleAddMeasurement = (articleId: string) => {
      const newId = Math.random().toString(36).substr(2, 9);
      setLastAddedMeasurementId(newId);
      const updated = articles.map(art => {
          if (art.id !== articleId) return art;
          const newM: Measurement = { id: newId, description: '', type: 'positive' };
          return { ...art, measurements: [...art.measurements, newM] };
      });
      updateState(updated);
  };

  const handleAddSubtotal = (articleId: string) => {
      const updated = articles.map(art => {
          if (art.id !== articleId) return art;
          const newM: Measurement = { id: Math.random().toString(36).substr(2, 9), description: '', type: 'subtotal' };
          return { ...art, measurements: [...art.measurements, newM] };
      });
      updateState(updated);
  };

  const handleAddVoiceMeasurement = (articleId: string, data: Partial<Measurement>) => {
      const newId = Math.random().toString(36).substr(2, 9);
      setLastAddedMeasurementId(newId);
      const updated = articles.map(art => {
          if (art.id !== articleId) return art;
          const newM: Measurement = { id: newId, description: data.description || '', type: 'positive', length: data.length, width: data.width, height: data.height, multiplier: data.multiplier };
          return { ...art, measurements: [...art.measurements, newM] };
      });
      updateState(updated);
  };

  const handleUpdateMeasurement = (artId: string, mId: string, field: keyof Measurement, val: any) => {
      const updated = articles.map(art => {
          if (art.id !== artId) return art;
          return { ...art, measurements: art.measurements.map(m => m.id === mId ? { ...m, [field]: val } : m) };
      });
      updateState(updated);
  };

  const handleDeleteMeasurement = (articleId: string, mId: string) => {
      const updated = articles.map(art => {
          if (art.id !== articleId) return art;
          return { ...art, measurements: art.measurements.filter(m => m.id !== mId) };
      });
      updateState(updated);
  };

  const handleToggleDeduction = (articleId: string, mId: string) => {
      const updated = articles.map(art => {
          if (art.id !== articleId) return art;
          return { 
              ...art, 
              measurements: art.measurements.map(m => {
                  if (m.id !== mId) return m;
                  return { ...m, type: m.type === 'positive' ? 'deduction' : 'positive' };
              }) 
          };
      });
      updateState(updated);
  };

  const handleOpenLinkModal = (articleId: string, measurementId: string) => {
      setLinkTarget({ articleId, measurementId });
      setIsLinkModalOpen(true);
  };

  const handleScrollToArticle = (id: string) => {
      const element = document.getElementById(`article-${id}`);
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleReorderMeasurements = (articleId: string, startIndex: number, endIndex: number) => {
      const updated = articles.map(art => {
          if (art.id !== articleId) return art;
          const newM = [...art.measurements];
          const [moved] = newM.splice(startIndex, 1);
          newM.splice(endIndex, 0, moved);
          return { ...art, measurements: newM };
      });
      updateState(updated);
  };

  const handleViewLinkedAnalysis = (analysisId: string) => {
      const analysis = analyses.find(a => a.id === analysisId);
      if (analysis) {
          setEditingAnalysis(analysis);
          setIsAnalysisEditorOpen(true);
      }
  };

  const handleImportAnalysisToArticle = (analysis: PriceAnalysis) => {
      const newArticle: Article = {
          id: Math.random().toString(36).substr(2, 9),
          categoryCode: selectedCategoryCode,
          code: analysis.code,
          description: analysis.description,
          unit: analysis.unit,
          unitPrice: analysis.totalUnitPrice,
          laborRate: analysis.totalLabor > 0 ? (analysis.totalLabor / analysis.totalBatchValue) * 100 : 0,
          linkedAnalysisId: analysis.id,
          measurements: [],
          quantity: 0
      };
      updateState([...articles, newArticle]);
  };

  const handleSmartSave = async (silent: boolean = false) => { 
    const json = JSON.stringify({ gecolaData: { projectInfo, categories, articles, analyses } }, null, 2);
    if ('showSaveFilePicker' in window) { 
        try { 
            let handle = currentFileHandle; 
            if (!handle && !silent) handle = await (window as any).showSaveFilePicker({ suggestedName: `${projectInfo.title}.json`, types: [{ description: 'JSON', accept: {'application/json':['.json']} }] }); 
            if (handle) {
                setCurrentFileHandle(handle); setIsAutoSaving(true);
                const writable = await handle.createWritable(); await writable.write(json); await writable.close(); setLastSaved(new Date());
            }
        } catch (e) {} finally { setTimeout(() => setIsAutoSaving(false), 800); }
    } else if (!silent) setIsSaveModalOpen(true);
  };

  useEffect(() => { 
    if (!currentFileHandle) return;
    const t = setTimeout(() => handleSmartSave(true), 3000);
    return () => clearTimeout(t);
  }, [articles, categories, projectInfo, analyses, currentFileHandle]);

  const handleAddCategory = () => { setEditingCategory(null); setIsCategoryModalOpen(true); };
  const handleSaveCategory = (name: string) => {
    if (editingCategory) {
        setCategories(categories.map(c => c.code === editingCategory.code ? { ...c, name } : c));
    } else {
        const newCode = `WBS.${(categories.length + 1).toString().padStart(2, '0')}`;
        setCategories([...categories, { code: newCode, name, isEnabled: true, isLocked: false }]);
    }
  };

  const handleToggleArticleLock = (id: string) => { setArticles(articles.map(a => a.id === id ? { ...a, isLocked: !a.isLocked } : a)); };

  const activeCategory = categories.find(c => c.code === selectedCategoryCode);
  const activeArticles = articles.filter(a => a.categoryCode === selectedCategoryCode);

  return (
    <div className="h-screen flex flex-col bg-[#e8eaed] font-sans overflow-hidden text-slate-800">
      <div className="bg-[#2c3e50] shadow-md z-50 h-14 flex items-center justify-between px-6 border-b border-slate-600 flex-shrink-0">
          <div className="flex items-center space-x-3 w-64">
            <div className="bg-orange-500 p-1.5 rounded-lg shadow-lg"><Calculator className="w-5 h-5 text-white" /></div>
            <span className="font-bold text-lg text-white">GeCoLa <span className="font-light opacity-80">v12.0</span></span>
          </div>
          <div className="flex-1 px-6 flex justify-center items-center gap-6">
              <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-1.5 rounded-full border border-slate-700 text-white font-bold text-sm cursor-pointer" onClick={() => setIsSettingsModalOpen(true)}>
                  {isAutoSaving && <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse mr-2"></span>}
                  <span className="truncate max-w-[250px]">{projectInfo.title}</span>
              </div>
              <div className="flex items-center bg-slate-800/30 rounded-full px-2 py-1 gap-1">
                <button onClick={handleUndo} disabled={history.length === 0} className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-all"><Undo2 className="w-4 h-4" /></button>
                <button onClick={handleRedo} disabled={future.length === 0} className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-all"><Redo2 className="w-4 h-4" /></button>
              </div>
          </div>
          <div className="flex items-center space-x-2">
             <button onClick={() => setIsSaveMenuOpen(!isSaveMenuOpen)} className="p-2 text-slate-300 hover:text-blue-400 transition-colors"><Save className="w-5 h-5" /></button>
             <button onClick={() => generateComputoMetricPdf(projectInfo, categories, articles)} className="p-2 text-slate-300 hover:text-white transition-colors"><FileText className="w-5 h-5" /></button>
             <button onClick={() => signOut(auth)} className="p-2 text-red-400 hover:text-white ml-2 transition-colors"><LogOut className="w-5 h-5" /></button>
          </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 bg-white border-r border-slate-300 flex flex-col flex-shrink-0 z-10 shadow-lg">
          <div className="flex-1 overflow-y-auto">
              <div className="p-3 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase flex justify-between items-center tracking-widest">
                <span>Indice WBS</span>
                <PlusCircle className="w-4 h-4 text-blue-600 cursor-pointer" onClick={handleAddCategory}/>
              </div>
              <ul>
                  {categories.map(cat => (
                  <li key={cat.code} className={`relative border-b border-gray-100 ${!cat.isEnabled ? 'opacity-40' : ''}`} onClick={() => setSelectedCategoryCode(cat.code)}>
                      <div className={`w-full text-left pl-3 pr-2 py-3 border-l-4 transition-all flex flex-col cursor-pointer ${selectedCategoryCode === cat.code ? 'bg-blue-50 border-blue-500' : 'border-transparent hover:bg-slate-50'}`}>
                          <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${cat.isEnabled ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-600'}`}>
                                {cat.isEnabled ? (displayWbsCodes[cat.code] || '---') : 'OFF'}
                              </span>
                              {cat.isLocked && <Lock className="w-3 h-3 text-red-500" />}
                          </div>
                          <div className="pl-5">
                              <span className="text-xs font-semibold block truncate pr-8">{cat.name}</span>
                              <span className="text-[10px] font-mono text-slate-400 block mt-0.5">{cat.isEnabled ? formatCurrency(categoryTotals[cat.code] || 0) : 'Escluso'}</span>
                          </div>
                      </div>
                      <div className="absolute right-1 top-2 flex flex-row bg-white/95 shadow-md rounded-full border border-gray-200 p-0.5 opacity-0 group-hover:opacity-100 z-20 transition-all hover:opacity-100">
                          <button onClick={(e) => { e.stopPropagation(); setCategories(categories.map(c => c.code === cat.code ? {...c, isEnabled: !c.isEnabled} : c)); }} className="p-1 text-gray-400 hover:text-blue-500">{cat.isEnabled ? <Lightbulb className="w-3.5 h-3.5 text-yellow-500" /> : <LightbulbOff className="w-3.5 h-3.5" />}</button>
                      </div>
                  </li>
                  ))}
              </ul>
          </div>
        </div>

        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f0f2f5] p-5 gap-4">
           {activeCategory && (
               <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-300 shadow-sm animate-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-3">
                         <div className="bg-[#2c3e50] text-white p-2.5 rounded-lg shadow-lg font-black text-xl">{activeCategory.isEnabled ? displayWbsCodes[activeCategory.code] : 'ESCLUSO'}</div>
                         <div>
                            <h2 className="text-lg font-black text-slate-800 uppercase max-w-[400px] truncate tracking-tight">{activeCategory.name}</h2>
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{activeCategory.isEnabled ? formatCurrency(categoryTotals[activeCategory.code] || 0) : 'CONTEGGIO DISATTIVATO'}</span>
                         </div>
                    </div>
                    <button onClick={() => setIsImportAnalysisModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold shadow-md hover:bg-blue-700 flex items-center gap-2 text-xs">
                        <Plus className="w-4 h-4" /> Aggiungi Voce
                    </button>
               </div>
           )}

           <div className="flex-1 overflow-y-auto rounded-xl bg-white shadow-2xl border border-gray-300 flex flex-col relative">
              {viewMode === 'COMPUTO' && activeCategory ? (
                  <table className="w-full text-left border-collapse">
                      <TableHeader activeColumn={activeColumn} />
                      {activeArticles.map((article, artIndex) => (
                          <ArticleGroup 
                            key={article.id} 
                            article={article} 
                            index={artIndex} 
                            allArticles={articles} 
                            displayWbsCode={displayWbsCodes[article.categoryCode] || article.categoryCode}
                            isPrintMode={false} 
                            isCategoryLocked={activeCategory.isLocked} 
                            onUpdateArticle={handleUpdateArticle} 
                            onEditArticleDetails={handleEditArticleDetails} 
                            onDeleteArticle={handleDeleteArticle} 
                            onAddMeasurement={handleAddMeasurement} 
                            onAddSubtotal={handleAddSubtotal} 
                            onAddVoiceMeasurement={handleAddVoiceMeasurement} 
                            onUpdateMeasurement={handleUpdateMeasurement} 
                            onDeleteMeasurement={handleDeleteMeasurement} 
                            onToggleDeduction={handleToggleDeduction} 
                            onOpenLinkModal={handleOpenLinkModal} 
                            onScrollToArticle={handleScrollToArticle} 
                            onReorderMeasurements={handleReorderMeasurements} 
                            onArticleDragStart={() => {}} 
                            onArticleDrop={() => {}} 
                            onArticleDragEnd={() => {}} 
                            lastAddedMeasurementId={lastAddedMeasurementId} 
                            onColumnFocus={setActiveColumn} 
                            onViewAnalysis={handleViewLinkedAnalysis} 
                            onInsertExternalArticle={() => {}} 
                            onToggleArticleLock={handleToggleArticleLock} 
                          />
                      ))}
                  </table>
              ) : <div className="p-20 text-center text-gray-400 uppercase font-black opacity-20 text-3xl">Seleziona un capitolo attivo</div>}
           </div>
        </div>
      </div>
      
      <ProjectSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} info={projectInfo} onSave={(newInfo) => setProjectInfo(newInfo)} />
      {editingArticle && <ArticleEditModal isOpen={isEditArticleModalOpen} onClose={() => setEditingArticle(null)} article={editingArticle} onSave={handleArticleEditSave} />}
      <CategoryEditModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} onSave={handleSaveCategory} initialData={editingCategory} />
      <ImportAnalysisModal isOpen={isImportAnalysisModalOpen} onClose={() => setIsImportAnalysisModalOpen(false)} analyses={analyses} onImport={handleImportAnalysisToArticle} onCreateNew={() => { setIsImportAnalysisModalOpen(false); }} />
      {isLinkModalOpen && linkTarget && (
        <LinkArticleModal 
          isOpen={isLinkModalOpen} 
          onClose={() => { setIsLinkModalOpen(false); setLinkTarget(null); }} 
          articles={articles} 
          currentArticleId={linkTarget.articleId} 
          onLink={(source, type) => {
              const updated = articles.map(art => {
                  if (art.id !== linkTarget.articleId) return art;
                  return {
                      ...art,
                      measurements: art.measurements.map(m => m.id === linkTarget.measurementId ? { ...m, linkedArticleId: source.id, linkedType: type } : m)
                  };
              });
              updateState(updated);
              setIsLinkModalOpen(false);
              setLinkTarget(null);
          }} 
        />
      )}
    </div>
  );
};

export default App;
