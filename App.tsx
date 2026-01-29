import { 
  Plus, Trash2, Calculator, FolderOpen, XCircle, ArrowRight, Settings, 
  PlusCircle, MinusCircle, HelpCircle, Sparkles, AlignLeft, Link as LinkIcon, 
  Undo2, Redo2, PenLine, Lock, Unlock, Lightbulb, LightbulbOff, Edit2, 
  GripVertical, Sigma, Save, Loader2, FileText, ChevronDown, TestTubes, 
  Search, Coins, ArrowRightLeft, Copy, LogOut, Award, User, Maximize2, 
  Minimize2, GripHorizontal, ArrowLeft, Headset, CopyPlus, Paintbrush, 
  Grid3X3, MousePointerClick, Layers, ExternalLink, FileSpreadsheet, ShieldAlert, HardHat,
  Zap, CornerRightDown, ListFilter, EyeOff
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { ref, set, onValue, off } from 'firebase/database';
import { auth, db } from './firebase';
import Login from './components/Login';
import { CATEGORIES, INITIAL_ARTICLES, PROJECT_INFO, INITIAL_ANALYSES, SOA_CATEGORIES } from './constants';
import { Article, Totals, ProjectInfo, Measurement, Category, PriceAnalysis } from './types';
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
import { parseDroppedContent, parseVoiceMeasurement } from './services/geminiService';
import { generateComputoMetricPdf, generateElencoPrezziPdf, generateManodoperaPdf, generateAnalisiPrezziPdf } from './services/pdfGenerator';
import { generateComputoExcel } from './services/excelGenerator';

const MIME_ARTICLE = 'application/gecola-article';
const MIME_MEASUREMENT = 'application/gecola-measurement';

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: true }).format(val);
};

const formatNumber = (val: number | undefined) => {
    if (val === undefined || val === null || val === 0) return '';
    return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
};

const getWbsNumber = (code: string) => {
    const match = code.match(/WBS\.(\d+)/);
    if (match) return parseInt(match[1], 10);
    const sMatch = code.match(/S\.(\d+)/);
    if (sMatch) return parseInt(sMatch[1], 10);
    return code;
};

const roundTwoDecimals = (num: number) => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

const playUISound = (type: 'confirm' | 'move' | 'newline') => {
    try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
        masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
        if (type === 'confirm') {
            masterGain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.005);
            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, audioCtx.currentTime); 
            osc.connect(masterGain);
            osc.start();
            masterGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
            osc.stop(audioCtx.currentTime + 0.2);
        } else if (type === 'move') {
            masterGain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + 0.005);
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            osc1.type = 'sine';
            osc2.type = 'sine';
            osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); 
            osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.05); 
            osc1.connect(masterGain);
            osc2.connect(masterGain);
            osc1.start();
            osc2.start(audioCtx.currentTime + 0.05);
            masterGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
            osc1.stop(audioCtx.currentTime + 0.3);
            osc2.stop(audioCtx.currentTime + 0.3);
        } else if (type === 'newline') {
            masterGain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.005);
            const freqs = [523.25, 659.25, 783.99]; 
            freqs.forEach((f, i) => {
                const osc = audioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, audioCtx.currentTime + (i * 0.08));
                osc.connect(masterGain);
                osc.start(audioCtx.currentTime + (i * 0.08));
                osc.stop(audioCtx.currentTime + 0.5);
            });
        }
    } catch (e) {}
};

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

interface TableHeaderProps {
    activeColumn: string | null;
    tariffWidth?: number;
}

const TableHeader: React.FC<TableHeaderProps> = ({ activeColumn, tariffWidth }) => (
  <thead className="bg-[#f8f9fa] border-b-2 border-black text-[9px] uppercase font-black text-gray-800 sticky top-0 z-[70] shadow-md">
    <tr>
      <th className="py-2.5 px-1 text-center w-[30px] border-r border-gray-300">N..</th>
      <th className="py-2.5 px-1 text-left border-r border-gray-300" style={{ width: tariffWidth ? `${tariffWidth}px` : '135px' }}>Tariffa</th>
      <th className={`py-2.5 px-1 text-left min-w-[170px] border-r border-gray-300 ${activeColumn === 'desc' ? 'bg-blue-50 text-blue-900' : ''}`}>Designazione dei Lavori</th>
      <th className={`py-2.5 px-1 text-center w-[40px] border-r border-gray-300 ${activeColumn === 'mult' ? 'bg-blue-50 text-blue-900' : ''}`}>Par.Ug</th>
      <th className={`py-2.5 px-1 text-center w-[50px] border-r border-gray-300 ${activeColumn === 'len' ? 'bg-blue-50 text-blue-900' : ''}`}>Lung.</th>
      <th className={`py-2.5 px-1 text-center w-[50px] border-r border-gray-300 ${activeColumn === 'wid' ? 'bg-blue-50 text-blue-900' : ''}`}>Larg.</th>
      <th className={`py-2.5 px-1 text-center w-[50px] border-r border-gray-300 ${activeColumn === 'h' ? 'bg-blue-50 text-blue-900' : ''}`}>H/Peso</th>
      <th className="py-2.5 px-1 text-center w-[65px] border-r border-gray-300 bg-gray-100">Quantità</th>
      <th className="py-2.5 px-1 text-right w-[75px] border-r border-gray-300">Prezzo €</th>
      <th className="py-2.5 px-1 text-right w-[85px] border-r border-gray-300">Importo €</th>
      <th className="py-2.5 px-1 text-right w-[75px] border-r border-gray-300">M.O. €</th>
    </tr>
  </thead>
);

interface ArticleGroupProps {
  article: Article;
  index: number;
  allArticles: Article[];
  isPrintMode: boolean;
  isCategoryLocked?: boolean;
  isCompactView?: boolean;
  projectSettings: ProjectInfo;
  onUpdateArticle: (id: string, field: keyof Article, value: string | number) => void;
  onEditArticleDetails: (article: Article) => void;
  onUpdateMeasurement: (articleId: string, mId: string, field: keyof Measurement, value: string | number | undefined) => void;
  onDeleteMeasurement: (articleId: string, mId: string) => void;
  onToggleDeduction: (articleId: string, mId: string) => void;
  onOpenLinkModal: (articleId: string, measurementId: string) => void;
  onScrollToArticle: (id: string, fromId?: string) => void;
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
  onToggleVoiceAutomation: (articleId: string) => void;
  onToggleSmartRepeat: (articleId: string) => void;
  voiceAutomationActiveId: string | null;
  smartRepeatActiveId: string | null;
  isPaintingAutomationActive: boolean;
  isRebarAutomationActive: boolean;
  onDeleteArticle: (id: string) => void;
  onAddMeasurement: (articleId: string) => void;
  onAddSubtotal: (articleId: string) => void;
  onAddVoiceMeasurement: (articleId: string, data: Partial<Measurement>) => void;
}

const ArticleGroup: React.FC<ArticleGroupProps> = (props) => {
   const { article, index, allArticles, isPrintMode, isCategoryLocked, isCompactView, projectSettings, onUpdateArticle, onEditArticleDetails, onDeleteArticle, onAddMeasurement, onAddSubtotal, onAddVoiceMeasurement, onUpdateMeasurement, onDeleteMeasurement, onToggleDeduction, onOpenLinkModal, onScrollToArticle, onReorderMeasurements, onArticleDragStart, onArticleDrop, onArticleDragEnd, lastAddedMeasurementId, onColumnFocus, onViewAnalysis, onInsertExternalArticle, onToggleArticleLock, onOpenRebarCalculator, onOpenPaintingCalculator, onToggleVoiceAutomation, onToggleSmartRepeat, voiceAutomationActiveId, smartRepeatActiveId, isPaintingAutomationActive, isRebarAutomationActive } = props;
   
   const [measurementDragOverId, setMeasurementDragOverId] = useState<string | null>(null);
   const [isArticleDragOver, setIsArticleDragOver] = useState(false);
   const [articleDropPosition, setArticleDropPosition] = useState<'top' | 'bottom' | null>(null);
   const [isListening, setIsListening] = useState(false);
   const [recordingMeasId, setRecordingMeasId] = useState<string | null>(null);
   const addBtnRef = useRef<HTMLButtonElement>(null);
   const recognitionRef = useRef<any>(null);
   const silenceTimerRef = useRef<any>(null); 
   const tbodyRef = useRef<HTMLTableSectionElement>(null);
   const longPressTimer = useRef<any>(null);

   const isArticleLocked = article.isLocked || false;
   const areControlsDisabled = isCategoryLocked || isArticleLocked;
   const isVoiceActive = voiceAutomationActiveId === article.id;
   const isSmartRepeatActive = smartRepeatActiveId === article.id;

   const [activeAutomationRowId, setActiveAutomationRowId] = useState<string | null>(null);
   const [activeAutomationFieldIndex, setActiveAutomationFieldIndex] = useState(0); 
   const automationFields = ['description', 'multiplier', 'length', 'width', 'height'];

   const isSafetyCategory = article.categoryCode.startsWith('S.');

   useEffect(() => {
     if (isVoiceActive && !activeAutomationRowId && article.measurements.length > 0) {
        setActiveAutomationRowId(article.measurements[article.measurements.length - 1].id);
     }
   }, [isVoiceActive, article.measurements]);

   useEffect(() => {
     if (lastAddedMeasurementId === 'ADD_BUTTON_FOCUS' + article.id) {
         addBtnRef.current?.focus();
     }
   }, [lastAddedMeasurementId, article.id]);

   const syncAutomationPoint = (rowId: string, fieldName: string) => {
      if (!isVoiceActive) return;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setActiveAutomationRowId(rowId);
      const idx = automationFields.indexOf(fieldName);
      if (idx !== -1) {
          setActiveAutomationFieldIndex(idx);
          playUISound('move'); 
      }
   };

   const handleVoiceData = async (text: string) => {
       const field = automationFields[activeAutomationFieldIndex];
       const targetId = activeAutomationRowId || (article.measurements.length > 0 ? article.measurements[article.measurements.length - 1].id : null);
       if (!targetId) return;
       if (field === 'description') {
           onUpdateMeasurement(article.id, targetId, 'description', text);
       } else {
           const num = parseFloat(text.replace(',', '.').replace(/[^0-9.]/g, ''));
           if (!isNaN(num)) {
               onUpdateMeasurement(article.id, targetId, field as any, num);
           }
       }
   };

   const handleVoiceCommand = (cmd: string) => {
       if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
       if (cmd === 'next') {
           if (activeAutomationFieldIndex < 4) {
               setActiveAutomationFieldIndex(prev => prev + 1);
               playUISound('move'); 
           } else {
               playUISound('newline'); 
               onAddMeasurement(article.id);
               setActiveAutomationFieldIndex(0);
           }
       } else if (cmd === 'prev') {
           if (activeAutomationFieldIndex > 0) {
               setActiveAutomationFieldIndex(prev => prev - 1);
               playUISound('move');
           }
       }
   };

   const startContinuousRecognition = () => {
      if (!('webkitSpeechRecognition' in window)) return;
      if (recognitionRef.current) return;
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.lang = 'it-IT';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = async (event: any) => {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          for (let i = event.resultIndex; i < event.results.length; ++i) {
             if (event.results[i].isFinal) {
                const text = event.results[i][0].transcript.toLowerCase().trim();
                if (text === 'invio' || text === 'prossimo' || text === 'avanti') {
                    handleVoiceCommand('next');
                } else if (text === 'indietro') {
                    handleVoiceCommand('prev');
                } else {
                    handleVoiceData(text);
                    silenceTimerRef.current = setTimeout(() => {
                        handleVoiceCommand('next');
                    }, 1000); 
                }
             }
          }
      };
      recognition.onend = () => {
          if (isVoiceActive) recognition.start();
      };
      recognitionRef.current = recognition;
      recognition.start();
   };

   const stopContinuousRecognition = () => {
       if (recognitionRef.current) {
           recognitionRef.current.onend = null;
           recognitionRef.current.stop();
           recognitionRef.current = null;
       }
       if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
   };

   useEffect(() => {
      if (isVoiceActive && !isPrintMode) {
          startContinuousRecognition();
      } else {
          stopContinuousRecognition();
      }
      return () => stopContinuousRecognition();
   }, [isVoiceActive, activeAutomationFieldIndex, activeAutomationRowId]);

   const handleArrowNavigation = (e: React.KeyboardEvent) => {
       if (!isVoiceActive) return;
       if (e.key === 'ArrowRight') {
           e.preventDefault();
           handleVoiceCommand('next');
       } else if (e.key === 'ArrowLeft') {
           e.preventDefault();
           handleVoiceCommand('prev');
       }
   };

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
       e.dataTransfer.setData(MIME_MEASUREMENT, 'true');
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
      const isInternal = e.dataTransfer.types.includes(MIME_ARTICLE);
      const isExternalText = e.dataTransfer.types.includes('text/plain');
      if (isInternal || isExternalText) {
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
      const isInternal = e.dataTransfer.types.includes(MIME_ARTICLE);
      const articleId = e.dataTransfer.getData('articleId');
      const textData = e.dataTransfer.getData('text/plain');
      if (isInternal && articleId) {
          onArticleDrop(e, article.id, articleDropPosition || 'bottom');
      } else if (textData) {
          const insertionIndex = articleDropPosition === 'bottom' ? index + 1 : index;
          onInsertExternalArticle(insertionIndex, textData);
      }
      setIsArticleDragOver(false);
      setArticleDropPosition(null);
   };

   const handleLongPressStart = (mId: string) => {
      if (areControlsDisabled || isVoiceActive) return;
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

   const mFontSize = (projectSettings.fontSizeMeasurements || 12) * 1.1; // +10% increment
   const numFontSize = 13.5; // +10% approx
   const descFontSize = 15.5; // +10% approx

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
             <tr className="h-0 p-0 border-none"><td colSpan={11} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-green-500 -top-0.5 z-50 shadow-[0_0_8px_rgba(34,197,94,0.8)] pointer-events-none"></div></td></tr>
         )}
         <tr 
            className={`align-top ${!isPrintMode ? 'cursor-move hover:bg-slate-50' : ''} ${isArticleDragOver ? 'bg-green-50/10' : ''}`}
            draggable={!isPrintMode && !areControlsDisabled}
            onDragStart={handleArticleHeaderDragStart}
            onDragEnd={handleArticleHeaderDragEnd}
         >
            <td className="text-center py-2 text-xs font-bold text-gray-500 border-r border-gray-200 select-none bg-white font-mono">{hierarchicalNumber}</td>
            <td className="p-1 border-r border-gray-200 align-top bg-white" style={{ width: projectSettings.tariffColumnWidth ? `${projectSettings.tariffColumnWidth}px` : '135px' }}>
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
            <td className="p-1 border-r border-gray-200 bg-white">
               {isPrintMode || isCompactView ? (
                 <p className={`leading-relaxed font-serif text-justify px-0.5 whitespace-pre-wrap ${isCompactView ? 'line-clamp-2' : ''} ${isSafetyCategory ? 'text-orange-600' : 'text-blue-700'}`} style={{ fontSize: `${descFontSize}px` }}>{article.description}</p>
               ) : (
                 <textarea 
                    readOnly
                    value={article.description}
                    rows={isArticleLocked ? 2 : 4}
                    className={`w-full font-serif text-justify border-none focus:ring-0 bg-transparent resize-y p-0.5 disabled:text-gray-400 cursor-default scrollbar-hide ${isArticleLocked ? 'text-gray-400 italic' : 'min-h-[50px]'} ${isSafetyCategory ? 'text-orange-600' : 'text-blue-700'}`}
                    style={{ fontSize: `${descFontSize}px` }}
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
            <td className="border-r border-gray-200 bg-white p-1 text-center align-top">
                {!isPrintMode && !isCategoryLocked && (
                   <div className="flex flex-col items-center gap-1 opacity-0 group-hover/article:opacity-100 transition-opacity mt-1">
                      <button onClick={() => onToggleArticleLock(article.id)} className={`transition-colors p-0.5 rounded ${isArticleLocked ? 'text-red-500 hover:text-red-700 bg-red-50' : 'text-gray-400 hover:text-blue-500'}`} title={isArticleLocked ? "Sblocca Voce" : "Blocca Voce (Lavoro Fatto)"}>
                          {isArticleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                      {!isArticleLocked && (
                          <>
                            <button onClick={() => onEditArticleDetails(article)} className="text-gray-400 hover:text-blue-600 transition-colors p-0.5" title="Modifica Dettagli"><PenLine className="w-3.5 h-3.5" /></button>
                            <button onClick={() => onDeleteArticle(article.id)} className="text-gray-400 hover:text-red-600 transition-colors p-0.5" title="Elimina Voce"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                      )}
                   </div>
                )}
            </td>
            <td colSpan={7} className="border-r border-gray-200 bg-white"></td>
         </tr>
         {!isArticleLocked && (
           <>
            <tr className="bg-gray-50/50 border-b border-gray-100">
                <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                <td className="px-1.5 py-1 text-[9px] font-black text-blue-600 uppercase tracking-widest border-r border-gray-200 bg-white/50 flex items-center gap-2">
                    <span className="font-black">ELENCO MISURE:</span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => onOpenPaintingCalculator(article.id)} className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors" title="Calcolo Automatico Pitturazioni"><Paintbrush className="w-4 h-4" /></button>
                        <button onClick={() => onOpenRebarCalculator(article.id)} className="text-gray-400 hover:text-orange-600 p-1 rounded transition-colors" title="Calcolo Ferri d'Armatura"><Grid3X3 className="w-4 h-4" /></button>
                        <button onClick={() => onToggleVoiceAutomation(article.id)} className={`p-1 rounded transition-all ${isVoiceActive ? 'bg-purple-600 text-white shadow-lg shadow-purple-200 animate-pulse' : 'text-gray-400 hover:text-purple-600'}`} title="Sostegno Vocale Continuo (Mani Libere)"><Headset className="w-4 h-4" /></button>
                        <button onClick={() => onToggleSmartRepeat(article.id)} className={`p-1 rounded transition-all ${isSmartRepeatActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-gray-400 hover:text-blue-600'}`} title="Smart Repeat (Clona rigo precedente)"><CopyPlus className="w-4 h-4" /></button>
                    </div>
                </td>
                <td colSpan={8} className="border-r border-gray-200"></td>
            </tr>
            <tr className="h-1"><td colSpan={11} className="border-r border-gray-200 bg-white"></td></tr>
            {processedMeasurements.map((m, idx) => {
                const linkedArt = getLinkedInfo(m);
                const isSubtotal = m.type === 'subtotal';
                const isVoiceFocused = isVoiceActive && activeAutomationRowId === m.id;
                return (
                <tr key={m.id} draggable={!isPrintMode && !areControlsDisabled} onDragStart={(e) => handleMeasDragStart(e, idx)} onDragOver={(e) => handleMeasDragOver(e, m.id)} onDragLeave={() => setMeasurementDragOverId(null)} onDrop={(e) => handleMeasDrop(e, idx)} className={`group/row cursor-default transition-all ${m.type === 'deduction' ? 'text-red-600' : 'text-gray-800'} ${isSubtotal ? 'bg-yellow-50 font-bold' : ''} ${measurementDragOverId === m.id ? 'border-t-2 border-dashed border-green-500 bg-green-50' : (isSubtotal ? 'bg-yellow-50' : 'bg-white')} ${isArticleLocked ? 'opacity-70' : ''}`} style={{ fontSize: `${numFontSize}px` }}>
                    <td className="border-r border-gray-200"></td>
                    <td className="p-0 border-r border-gray-200 bg-gray-50/30 text-center relative align-middle">
                        {!isPrintMode && !areControlsDisabled && (
                            <div className="flex justify-center items-center gap-1.5 opacity-0 group-hover/row:opacity-100 transition-opacity px-1 h-full py-1.5">
                                {!isSubtotal ? (
                                    <>
                                        <button onClick={() => onOpenLinkModal(article.id, m.id)} className={`rounded p-0.5 transition-colors ${m.linkedArticleId ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`} title={m.linkedArticleId ? "Modifica Collegamento" : "Vedi Voce (Collega)"}><LinkIcon className="w-4 h-4" /></button>
                                        <button onClick={() => onToggleDeduction(article.id, m.id)} className={`transition-colors p-0.5 rounded ${m.type === 'positive' ? 'text-red-400 hover:text-red-600 hover:bg-red-50' : 'text-blue-400 hover:text-blue-600 hover:bg-blue-50'}`} title={m.type === 'positive' ? "Trasforma in Deduzione" : "Trasforma in Positivo"}>{m.type === 'positive' ? <MinusCircle className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}</button>
                                    </>
                                ) : null}
                                <button onClick={() => onDeleteMeasurement(article.id, m.id)} className="text-gray-300 hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-colors" title="Elimina Rigo"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        )}
                    </td>
                    <td className="pl-3 pr-1 py-1 border-r border-gray-200 relative">
                        {isSubtotal ? <div className="italic text-gray-600 text-right pr-2">Sommano parziale</div> : (
                            <>
                                <div className="absolute left-0 top-1/2 w-4 h-[1px] bg-gray-300"></div>
                                {m.linkedArticleId && linkedArt ? (
                                <div className="flex items-center space-x-2">
                                    <button onClick={() => onScrollToArticle(linkedArt.id, article.id)} className="flex items-center space-x-1 px-1 py-0.5 rounded hover:bg-blue-50 group/link transition-colors text-left">
                                        <span className="text-blue-600 font-bold hover:underline cursor-pointer" style={{ fontSize: `${numFontSize - 1}px` }}>Vedi voce n. {getLinkedArticleNumber(linkedArt)}</span>
                                        <span className="text-gray-500" style={{ fontSize: `${numFontSize - 2}px` }}>
                                            ({m.linkedType === 'amount' ? formatCurrency(linkedArt.quantity * linkedArt.unitPrice) : `${formatNumber(linkedArt.quantity)} ${linkedArt.unit}`})
                                        </span>
                                        <LinkIcon className="w-4 h-4 text-blue-400 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                                    </button>
                                    </div>
                                ) : (
                                    isPrintMode ? <div className={`truncate ${m.type === 'deduction' ? 'italic' : ''}`}>{m.description}</div> : (
                                        <input 
                                          value={m.description} 
                                          autoFocus={m.id === lastAddedMeasurementId} 
                                          onFocus={() => { onColumnFocus('desc'); syncAutomationPoint(m.id, 'description'); }} 
                                          onBlur={() => onColumnFocus(null)} 
                                          onChange={(e) => onUpdateMeasurement(article.id, m.id, 'description', e.target.value)} 
                                          onKeyDown={handleArrowNavigation}
                                          className={`w-full bg-transparent border-none p-0 focus:ring-0 ${m.type === 'deduction' ? 'text-red-600 placeholder-red-300' : 'placeholder-gray-300'} disabled:cursor-not-allowed ${recordingMeasId === m.id || (isVoiceFocused && activeAutomationFieldIndex === 0) ? 'recording-feedback bg-purple-50 ring-2 ring-purple-600' : ''}`} 
                                          style={{ fontSize: `${numFontSize}px` }}
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
                    <td className={`border-r border-gray-200 p-0 transition-colors ${isVoiceFocused && activeAutomationFieldIndex === 1 ? 'bg-purple-100 ring-2 ring-purple-600 shadow-lg' : 'bg-gray-50'}`}>
                        {!isPrintMode && !isSubtotal ? <input type="number" disabled={areControlsDisabled} onFocus={() => { onColumnFocus('mult'); syncAutomationPoint(m.id, 'multiplier'); }} onBlur={() => onColumnFocus(null)} onKeyDown={handleArrowNavigation} className={`w-full text-center bg-transparent border-none focus:bg-white placeholder-gray-300 disabled:cursor-not-allowed h-full ${isVoiceFocused && activeAutomationFieldIndex === 1 ? 'font-black text-purple-900' : ''}`} style={{ fontSize: `${numFontSize}px` }} value={m.multiplier === undefined ? '' : m.multiplier} placeholder="1" onChange={(e) => onUpdateMeasurement(article.id, m.id, 'multiplier', e.target.value === '' ? undefined : parseFloat(e.target.value))} /> : (m.multiplier && <div className="text-center">{m.multiplier}</div>)}
                    </td>
                    <td className={`border-r border-gray-200 p-0 transition-colors ${isVoiceFocused && activeAutomationFieldIndex === 2 ? 'bg-purple-100 ring-2 ring-purple-600 shadow-lg' : 'bg-gray-50'}`}>
                        {m.linkedArticleId || isSubtotal ? <div className="text-center text-gray-300">-</div> : (!isPrintMode ? <input type="number" disabled={areControlsDisabled} onFocus={() => { onColumnFocus('len'); syncAutomationPoint(m.id, 'length'); }} onBlur={() => onColumnFocus(null)} onKeyDown={handleArrowNavigation} className={`w-full text-center bg-transparent border-none focus:bg-white disabled:cursor-not-allowed h-full ${isVoiceFocused && activeAutomationFieldIndex === 2 ? 'font-black text-purple-900' : ''}`} style={{ fontSize: `${numFontSize}px` }} value={m.length === undefined ? '' : m.length} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'length', e.target.value === '' ? undefined : parseFloat(e.target.value))} /> : <div className="text-center">{formatNumber(m.length)}</div>)}
                    </td>
                    <td className={`border-r border-gray-200 p-0 transition-colors ${isVoiceFocused && activeAutomationFieldIndex === 3 ? 'bg-purple-100 ring-2 ring-purple-600 shadow-lg' : 'bg-gray-50'}`}>
                        {m.linkedArticleId || isSubtotal ? <div className="text-center text-gray-300">-</div> : (!isPrintMode ? <input type="number" disabled={areControlsDisabled} onFocus={() => { onColumnFocus('wid'); syncAutomationPoint(m.id, 'width'); }} onBlur={() => onColumnFocus(null)} onKeyDown={handleArrowNavigation} className={`w-full text-center bg-transparent border-none focus:bg-white disabled:cursor-not-allowed h-full ${isVoiceFocused && activeAutomationFieldIndex === 3 ? 'font-black text-purple-900' : ''}`} style={{ fontSize: `${numFontSize}px` }} value={m.width === undefined ? '' : m.width} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'width', e.target.value === '' ? undefined : parseFloat(e.target.value))} /> : <div className="text-center">{formatNumber(m.width)}</div>)}
                    </td>
                    <td className={`border-r border-gray-200 p-0 transition-colors ${isVoiceFocused && activeAutomationFieldIndex === 4 ? 'bg-purple-100 ring-2 ring-purple-600 shadow-lg' : 'bg-gray-50'}`}>
                        {m.linkedArticleId || isSubtotal ? <div className="text-center text-gray-300">-</div> : (!isPrintMode ? <input type="number" data-last-meas-field="true" disabled={areControlsDisabled} onFocus={() => { onColumnFocus('h'); syncAutomationPoint(m.id, 'height'); }} onBlur={() => onColumnFocus(null)} onKeyDown={handleArrowNavigation} className={`w-full text-center bg-transparent border-none focus:bg-white disabled:cursor-not-allowed h-full ${isVoiceFocused && activeAutomationFieldIndex === 4 ? 'font-black text-purple-900' : ''}`} style={{ fontSize: `${numFontSize}px` }} value={m.height === undefined ? '' : m.height} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'height', e.target.value === '' ? undefined : parseFloat(e.target.value))} /> : <div className="text-center">{formatNumber(m.height)}</div>)}
                    </td>
                    <td className={`border-r border-gray-200 text-right font-mono pr-1 ${isSubtotal ? 'bg-yellow-100 text-black border-t border-b border-gray-400' : 'bg-white text-gray-600'} ${m.linkedArticleId ? 'font-bold text-blue-700' : ''}`} style={{ fontSize: `${numFontSize}px` }}>{formatNumber(m.displayValue)}</td>
                    <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                </tr>
                );})}
           </>
         )}
         <tr className="bg-white font-bold text-xs border-t border-gray-300 shadow-inner">
             <td className="border-r border-gray-300"></td><td className="border-r border-gray-200" style={{ width: projectSettings.tariffColumnWidth ? `${projectSettings.tariffColumnWidth}px` : '135px' }}></td>
             <td className="px-2 py-3 text-left border-r border-gray-300 flex items-center gap-3">
                {!isPrintMode && !isArticleLocked && (
                   <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button ref={addBtnRef} onClick={() => onAddMeasurement(article.id)} className="w-6 h-6 rounded-full flex items-center justify-center text-blue-600 hover:text-white hover:bg-blue-600 transition-all border border-blue-200 hover:border-blue-600 shadow-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" title="Aggiungi rigo misura"><Plus className="w-4 h-4" /></button>
                        <button onClick={() => onAddSubtotal(article.id)} className="w-6 h-6 rounded-full flex items-center justify-center text-orange-400 hover:text-white hover:bg-orange-500 transition-all border border-orange-200 hover:border-orange-500 shadow-sm" title="Inserisci Sommano Parziale"><Sigma className="w-3.5 h-3.5" /></button>
                   </div>
                )}
                <span className="uppercase text-gray-400 text-[10px] ml-auto">Sommano {isPrintMode ? article.unit : <input readOnly value={article.unit} className="w-8 bg-transparent border-b border-dotted border-gray-400 text-center outline-none inline-block disabled:cursor-not-allowed cursor-default" disabled={true} />}</span>
             </td>
             <td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td>
             <td className="text-right pr-1 font-mono border-r border-gray-200 bg-gray-50 font-black">{formatNumber(article.quantity)}</td>
             <td className="border-l border-r border-gray-300 text-right pr-1 font-mono">{isPrintMode ? formatNumber(article.unitPrice) : <input readOnly type="number" value={article.unitPrice} className="w-full text-right bg-transparent border-none focus:ring-0 disabled:cursor-not-allowed cursor-default" disabled={true} />}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-blue-900 font-black" style={{ fontSize: `${numFontSize}px` }}>{formatNumber(totalAmount)}</td>
             <td className="border-r border-gray-200 text-right pr-1 font-mono text-gray-500 font-normal">
                 <div className="flex flex-col items-end leading-none py-1"><span>{formatCurrency(laborValue)}</span><span className="text-[9px] text-gray-400">({article.laborRate}%)</span></div>
             </td>
         </tr>
         <tr className="h-6 bg-transparent border-none"><td colSpan={11} className="border-none"></td></tr>
         {isArticleDragOver && articleDropPosition === 'bottom' && (
             <tr className="h-0 p-0 border-none"><td colSpan={11} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-green-500 top-0 z-50 shadow-[0_0_8px_rgba(34,197,94,0.8)] pointer-events-none"></div></td></tr>
         )}
      </tbody>
   );
};

type ViewMode = 'COMPUTO' | 'SICUREZZA' | 'ANALISI'; 
interface Snapshot { articles: Article[]; categories: Category[]; analyses: PriceAnalysis[]; }

const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | 'visitor' | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [isWorkspaceDragOver, setIsWorkspaceDragOver] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false); 
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 50 }); 
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [returnPath, setReturnPath] = useState<string | null>(null); 
  const dragOffset = useRef({ x: 0, y: 0 });
  const [isRebarModalOpen, setIsRebarModalOpen] = useState(false);
  const [rebarTargetArticleId, setRebarTargetArticleId] = useState<string | null>(null);
  const [shouldAutoReopenRebar, setShouldAutoReopenRebar] = useState(false);
  const [isPaintingModalOpen, setIsPaintingModalOpen] = useState(false);
  const [paintingTargetArticleId, setPaintingTargetArticleId] = useState<string | null>(null);
  const [shouldAutoReopenPainting, setShouldAutoReopenPainting] = useState(false);
  const [voiceAutomationActiveId, setVoiceAutomationActiveId] = useState<string | null>(null);
  const [smartRepeatActiveId, setSmartRepeatActiveId] = useState<string | null>(null);
  const rebarTimerRef = useRef<any>(null);
  const paintingTimerRef = useRef<any>(null);
  
  const [isCompactView, setIsCompactView] = useState(false);

  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => { 
        setUser(firebaseUser);
        setAuthLoading(false); 
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || user === 'visitor' || !db) return;
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

  useEffect(() => { setToolbarPos({ x: (window.innerWidth / 2) - 100, y: 30 }); }, []);

  const stopAllAutomations = useCallback(() => {
    if (rebarTimerRef.current) clearTimeout(rebarTimerRef.current);
    if (paintingTimerRef.current) clearTimeout(paintingTimerRef.current);
    setShouldAutoReopenRebar(false);
    setShouldAutoReopenPainting(false);
  }, []);

  const handleVisitorLogin = () => { setUser('visitor'); };
  const handleLogout = async () => { setAuthLoading(true); try { if (user !== 'visitor' && auth) { await signOut(auth); } } catch (err) { console.error("Logout error:", err); } finally { setUser(null); setAuthLoading(false); } };
  const isVisitor = user === 'visitor';

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
  const [wbsDropTarget, setWbsDropTarget] = useState<{ code: string, position: 'top' | 'bottom' | 'inside' } | null>(null);
  const [isDraggingArticle, setIsDraggingArticle] = useState(false);
  const [isAnalysisEditorOpen, setIsAnalysisEditorOpen] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState<PriceAnalysis | null>(null);
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');
  const [isImportAnalysisModalOpen, setIsImportAnalysisModalOpen] = useState(false);
  const [activeCategoryForAi, setActiveCategoryForAi] = useState<string | null>(null);
  const [wbsOptionsContext, setWbsOptionsContext] = useState<{ type: 'import' | 'duplicate', sourceCode?: string, payload?: any, initialName?: string, targetCode?: string, position?: 'top' | 'bottom' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAddArticle = useCallback((newCountToAdd: number = 1): boolean => {
    if (!isVisitor) return true;
    const currentTotal = articles.length;
    if (currentTotal + newCountToAdd > 15) {
      alert(`VERSIONE LITE: Limite di 15 voci raggiunto.\nStai tentando di inserire ${newCountToAdd} voci ma ne mancano ${15 - currentTotal} al limite.`);
      return false;
    }
    return true;
  }, [isVisitor, articles.length]);

  useEffect(() => { document.title = projectInfo.title ? `${projectInfo.title} - GeCoLa` : 'GeCoLa - Computo Metrico'; }, [projectInfo.title]);

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
        if (cat && (cat.isEnabled === false || cat.type === 'safety')) return acc;
        return acc + (art.quantity * art.unitPrice);
    }, 0);

    const totalLabor = articles.reduce((acc, art) => {
        const cat = categories.find(c => c.code === art.categoryCode);
        if (cat && cat.isEnabled === false) return acc;
        return acc + ((art.quantity * art.unitPrice) * (art.laborRate / 100));
    }, 0);

    const totalSafetyProgettuale = articles.reduce((acc, art) => {
        const cat = categories.find(c => c.code === art.categoryCode);
        if (cat && (cat.isEnabled === false || cat.type !== 'safety')) return acc;
        return acc + (art.quantity * art.unitPrice);
    }, 0);

    const safetyCosts = totalWorks * (projectInfo.safetyRate / 100);
    const totalTaxable = totalWorks + safetyCosts + totalSafetyProgettuale;
    const vatAmount = totalTaxable * (projectInfo.vatRate / 100);
    const grandTotal = totalTaxable + vatAmount;
    
    return { totalWorks, totalLabor, safetyCosts, totalSafetyProgettuale, totalTaxable, vatAmount, grandTotal };
  }, [articles, categories, projectInfo.safetyRate, projectInfo.vatRate]);

  const generateNextWbsCode = (currentCats: Category[]) => {
      if (viewMode === 'SICUREZZA') {
          return `S.${(currentCats.filter(c => c.type === 'safety').length + 1).toString().padStart(2, '0')}`;
      }
      return `WBS.${(currentCats.filter(c => c.type !== 'safety').length + 1).toString().padStart(2, '0')}`;
  };
  
  const renumberCategories = (cats: Category[], currentArts: Article[]) => {
      const codeMap: Record<string, string> = {};
      let workCount = 0;
      let safetyCount = 0;
      const newCategories = cats.map((cat) => {
          let newCode = cat.code;
          if (cat.type === 'safety') {
              safetyCount++;
              newCode = `S.${safetyCount.toString().padStart(2, '0')}`;
          } else {
              workCount++;
              newCode = `WBS.${workCount.toString().padStart(2, '0')}`;
          }
          codeMap[cat.code] = newCode;
          return { ...cat, code: newCode };
      });
      const newArticles = currentArts.map(art => {
          if (codeMap[art.categoryCode]) return { ...art, categoryCode: codeMap[art.categoryCode] };
          return art;
      });
      return { newCategories, newArticles, codeMap };
  };

  const handleAddNewAnalysis = () => {
    const nextCode = `AP.${(analyses.length + 1).toString().padStart(2, '0')}`;
    const newAnalysis: PriceAnalysis = {
        id: Math.random().toString(36).substr(2, 9), code: nextCode, description: 'Nuova Analisi Prezzo', unit: 'cad', analysisQuantity: 1, generalExpensesRate: 15, profitRate: 10, totalMaterials: 0, totalLabor: 0, totalEquipment: 0, costoTecnico: 0, valoreSpese: 0, valoreUtile: 0, totalBatchValue: 0, totalUnitPrice: 0, components: []
    };
    const updatedAnalyses = [...analyses, newAnalysis];
    updateState(articles, categories, updatedAnalyses);
    setEditingAnalysis(newAnalysis);
    setIsAnalysisEditorOpen(true);
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

  const handleToggleAnalysisLock = (id: string) => {
      const newAnalyses = analyses.map(an => an.id === id ? { ...an, isLocked: !an.isLocked } : an);
      updateState(articles, categories, newAnalyses);
  };

  const handleDeleteAnalysis = (id: string) => {
      const analysis = analyses.find(a => a.id === id);
      if (analysis?.isLocked) { alert("Analisi bloccata. Sblocca per eliminare."); return; }
      if (window.confirm("Eliminare definitivamente questa analisi? Le voci di computo collegate rimarranno ma diventeranno indipendenti.")) {
          const newAnalyses = analyses.filter(a => a.id !== id);
          const newArticles = articles.map(art => art.linkedAnalysisId === id ? { ...art, linkedAnalysisId: id } : art);
          updateState(newArticles, categories, newAnalyses);
      }
  };

  const handleImportAnalysisToArticle = (analysis: PriceAnalysis) => {
      if (!canAddArticle()) return;
      const targetCode = activeCategoryForAi || (selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode);
      const laborRate = analysis.totalBatchValue > 0 ? parseFloat(((analysis.totalLabor / analysis.totalBatchValue) * 100).toFixed(2)) : 0;
      const newMeasId = Math.random().toString(36).substr(2, 9);
      const newArticle: Article = {
          id: Math.random().toString(36).substr(2, 9), categoryCode: targetCode, code: analysis.code, description: analysis.description, unit: analysis.unit, unitPrice: roundTwoDecimals(analysis.totalUnitPrice), laborRate: laborRate, linkedAnalysisId: analysis.id, priceListSource: `Da Analisi ${analysis.code}`, soaCategory: activeSoaCategory, measurements: [{ id: newMeasId, description: '', type: 'positive', multiplier: undefined }], quantity: 0
      };
      setLastAddedMeasurementId(newMeasId); 
      updateState([...articles, newArticle], categories, analyses);
      if (viewMode === 'ANALISI') setViewMode('COMPUTO');
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
          id: newAnalysisId, code: nextAnalysisCode, description: article.description, unit: article.unit, analysisQuantity: 1, generalExpensesRate: 15, profitRate: 10, totalMaterials: 0, totalLabor: 0, totalEquipment: 0, costoTecnico: 0, valoreSpese: 0, valoreUtile: 0, totalBatchValue: 0, totalUnitPrice: 0, components: [{ id: Math.random().toString(36).substr(2, 9), type: 'general', description: 'Materiale/Lavorazione a corpo (Prezzo Base)', unit: 'cad', unitPrice: article.unitPrice, quantity: 1 }]
      };
      const updatedArticles = articles.map(a => { if (a.id === article.id) return { ...a, code: nextAnalysisCode, linkedAnalysisId: newAnalysisId, priceListSource: `Da Analisi ${nextAnalysisCode}` }; return a; });
      updateState(updatedArticles, categories, [...analyses, newAnalysis]);
      setEditingAnalysis(newAnalysis);
      setViewMode('ANALISI');
      setIsAnalysisEditorOpen(true);
  };

  const handleInsertExternalArticle = (insertIndex: number, rawText: string) => {
      if (!canAddArticle()) return;
      const targetCode = selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode;
      const parsed = parseDroppedContent(rawText);
      if (parsed) {
          const newMeasId = Math.random().toString(36).substr(2, 9);
          const newArticle: Article = {
              id: Math.random().toString(36).substr(2, 9), categoryCode: targetCode, code: parsed.code || 'NP.001', priceListSource: parsed.priceListSource, description: parsed.description || 'Voce importata', unit: parsed.unit || 'cad', unitPrice: parsed.unitPrice || 0, laborRate: parsed.laborRate || 0, soaCategory: activeSoaCategory, measurements: [{ id: newMeasId, description: '', type: 'positive', length: undefined, multiplier: undefined }], quantity: 0
          };
          setLastAddedMeasurementId(newMeasId); 
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

  const handleAddCategory = () => { setEditingCategory(null); setIsCategoryModalOpen(true); };
  const handleEditCategory = (cat: Category) => { setEditingCategory(cat); setIsCategoryModalOpen(true); };
  const handleSaveCategory = (name: string) => {
    if (editingCategory) {
        const newCats = categories.map(c => c.code === editingCategory.code ? { ...c, name } : c);
        updateState(articles, newCats);
    } else {
        const newCode = generateNextWbsCode(categories);
        const newCat: Category = { code: newCode, name, isEnabled: true, isLocked: false, type: viewMode === 'SICUREZZA' ? 'safety' : 'work' };
        const newCats = [...categories, newCat];
        updateState(articles, newCats);
    }
  };

  const handleToggleAllCategories = () => {
    const anyEnabled = categories.some(c => c.isEnabled !== false);
    const newCats = categories.map(c => ({ ...c, isEnabled: !anyEnabled }));
    updateState(articles, newCats);
    playUISound('confirm');
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
      
      if (isDraggingArticle) {
          if (wbsDropTarget?.code !== targetCode || wbsDropTarget?.position !== 'inside') {
              setWbsDropTarget({ code: targetCode, position: 'inside' });
          }
          return;
      }

      if (draggedCategoryCode || e.dataTransfer.types.includes('text/plain')) {
          if (draggedCategoryCode === targetCode) { setWbsDropTarget(null); return; }
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const isTop = e.clientY < (rect.top + rect.height / 2);
          setWbsDropTarget({ code: targetCode, position: isTop ? 'top' : 'bottom' });
      }
  };

  const handleWbsDragLeave = (e: React.DragEvent) => { e.preventDefault(); };

  const handleWbsDrop = (e: React.DragEvent, targetCode: string | null) => { 
      e.preventDefault(); e.stopPropagation(); 
      const pos = wbsDropTarget?.position || 'bottom';
      setWbsDropTarget(null);
      const isInternalArticle = e.dataTransfer.types.includes(MIME_ARTICLE);
      const droppedArticleId = e.dataTransfer.getData('articleId');
      if (isInternalArticle && droppedArticleId && targetCode) {
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
      if (textData && !draggedCategoryCode && !isInternalArticle) {
          try {
              const payload = JSON.parse(textData);
              if (payload && payload.type === 'CROSS_TAB_WBS_BUNDLE') {
                  const initialName = payload.category?.name || 'Capitolo Importato';
                  setWbsOptionsContext({ type: 'import', payload, initialName, targetCode: targetCode || undefined, position: pos as 'top' | 'bottom' });
                  return;
              }
          } catch (e) { updateState(articles); }
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

  const handleWbsActionChoice = (mode: WbsActionMode, newName: string) => {
    if (!wbsOptionsContext) return;
    const { type, sourceCode, payload, targetCode, position } = wbsOptionsContext;
    const articlesToImportCount = (type === 'duplicate' && sourceCode) ? articles.filter(a => a.categoryCode === sourceCode).length : (payload?.articles?.length || 0);
    if (!canAddArticle(articlesToImportCount)) { setWbsOptionsContext(null); return; }
    const processMeasurements = (meases: Measurement[]) => {
      if (mode === 'full') return meases.map(m => ({ ...m, id: Math.random().toString(36).substr(2, 9), linkedArticleId: undefined }));
      if (mode === 'descriptions') return meases.map(m => ({ ...m, id: Math.random().toString(36).substr(2, 9), linkedArticleId: undefined, length: undefined, width: undefined, height: undefined, multiplier: undefined }));
      return [{ id: Math.random().toString(36).substr(2, 9), description: '', type: 'positive' as const }];
    };
    if (type === 'duplicate' && sourceCode) {
      const sourceCat = categories.find(c => c.code === sourceCode); if (!sourceCat) return; 
      const sourceArticles = articles.filter(a => a.categoryCode === sourceCode); 
      const newCategory = { ...sourceCat, name: newName }; 
      const tempCode = `TEMP_CLONE_${Date.now()}`; newCategory.code = tempCode; 
      const newArticlesRaw = sourceArticles.map(art => ({ ...art, id: Math.random().toString(36).substr(2, 9), categoryCode: tempCode, measurements: processMeasurements(art.measurements) })); 
      const sourceIndex = categories.findIndex(c => c.code === sourceCode); 
      const newCatsList = [...categories]; newCatsList.splice(sourceIndex + 1, 0, newCategory); 
      const allArticlesList = [...articles, ...newArticlesRaw]; 
      const result = renumberCategories(newCatsList, allArticlesList); 
      updateState(result.newArticles, result.newCategories);
    } 
    else if (type === 'import' && payload) {
      const { category: importedCat, articles: importedArticles, analyses: importedAnalyses } = payload;
      if (importedCat && Array.isArray(importedArticles)) {
          const uniqueTempId = `IMPORT_TEMP_${Date.now()}`;
          const newCategory: Category = { ...importedCat, name: newName, code: uniqueTempId, isImported: true };
          const newAnalysesList = [...analyses]; const analysisIdMap = new Map<string, string>();
          if (Array.isArray(importedAnalyses)) {
              importedAnalyses.forEach((an: PriceAnalysis) => {
                  const newId = Math.random().toString(36).substr(2, 9);
                  let newCode = an.code; if (analyses.some(existing => existing.code === newCode)) { newCode = `AP.${(newAnalysesList.length + 1).toString().padStart(2, '0')}`; }
                  analysisIdMap.set(an.id, newId); const newComponents = an.components.map(comp => ({ ...comp, id: Math.random().toString(36).substr(2, 9) }));
                  newAnalysesList.push({ ...an, id: newId, code: newCode, components: newComponents });
              });
          }
          let insertionIdx = categories.length; if (targetCode) { insertionIdx = categories.findIndex(c => c.code === targetCode); if (position === 'bottom') insertionIdx++; }
          const newCatsList = [...categories]; newCatsList.splice(insertionIdx, 0, newCategory);
          const processedArticles = importedArticles.map((art: Article) => {
              const newArticleId = Math.random().toString(36).substr(2, 9);
              let newLinkedAnalysisId = art.linkedAnalysisId; if (art.linkedAnalysisId && analysisIdMap.has(art.linkedAnalysisId)) { newLinkedAnalysisId = analysisIdMap.get(art.linkedAnalysisId); }
              return { ...art, id: newArticleId, categoryCode: uniqueTempId, linkedAnalysisId: newLinkedAnalysisId, measurements: processMeasurements(art.measurements) };
          });
          const result = renumberCategories(newCatsList, [...articles, ...processedArticles]); 
          updateState(result.newArticles, result.newCategories, newAnalysesList);
      }
    }
    setWbsOptionsContext(null);
  };

  const handleUpdateArticle = (id: string, field: keyof Article, value: string | number) => { const updated = articles.map(art => art.id === id ? { ...art, [field]: value } : art); updateState(updated); };
  const handleArticleEditSave = (id: string, updates: Partial<Article>) => { let finalUpdates = { ...updates }; const original = articles.find(a => a.id === id); if (original && original.priceListSource && !original.priceListSource.includes('NP')) { if (updates.unitPrice !== undefined && updates.unitPrice !== original.unitPrice) finalUpdates.priceListSource = 'Analisi NP (Modificato)'; if (updates.description !== undefined && updates.description !== original.description) finalUpdates.priceListSource = 'Analisi NP (Modificato)'; } const updated = articles.map(art => id === art.id ? { ...art, ...finalUpdates } : art); updateState(updated); };
  const handleEditArticleDetails = (article: Article) => { setEditingArticle(article); setIsEditArticleModalOpen(true); };
  const handleDeleteArticle = (id: string) => { if (window.confirm("Seleziona Conferma per eliminare questo articolo dal computo?")) { const updated = articles.filter(art => art.id !== id); updateState(updated); } };
  const handleAddMeasurement = (articleId: string) => { 
      const newId = Math.random().toString(36).substr(2, 9); setLastAddedMeasurementId(newId); 
      const updated = articles.map(art => { 
          if (art.id !== articleId) return art; 
          const lastM = art.measurements.length > 0 ? art.measurements[art.measurements.length - 1] : null;
          let newM: Measurement = { id: newId, description: '', type: 'positive', length: undefined, width: undefined, height: undefined, multiplier: undefined }; 
          if (smartRepeatActiveId === articleId && lastM && lastM.type !== 'subtotal') { newM = { ...newM, description: lastM.description, multiplier: lastM.multiplier, length: lastM.length, width: lastM.width, height: lastM.height, type: lastM.type }; }
          return { ...art, measurements: [...art.measurements, newM] }; 
      }); 
      updateState(updated); 
  };
  const handleAddSubtotal = (articleId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newM: Measurement = { id: Math.random().toString(36).substr(2, 9), description: '', type: 'subtotal' }; return { ...art, measurements: [...art.measurements, newM] }; }); updateState(updated); };
  const handleAddVoiceMeasurement = (articleId: string, data: Partial<Measurement>) => { const newId = Math.random().toString(36).substr(2, 9); setLastAddedMeasurementId(newId); const updated = articles.map(art => { if (art.id !== articleId) return art; const newM: Measurement = { id: newId, description: data.description || '', type: 'positive', length: data.length, width: data.width, height: data.height, multiplier: data.multiplier }; return { ...art, measurements: [...art.measurements, newM] }; }); updateState(updated); };
  const handleToggleDeduction = (articleId: string, mId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newMeasurements = art.measurements.map(m => { if (m.id !== mId) return m; if (m.type === 'subtotal') return m; const newType = m.type === 'positive' ? 'deduction' : 'positive'; let newDescription = m.description; if (newType === 'deduction') { if (!newDescription.toLowerCase().startsWith('a dedurre')) { newDescription = "A dedurre: " + newDescription; } } else { newDescription = newDescription.replace(/^a dedurre:\s*/i, ''); } return { ...m, type: newType, description: newDescription } as Measurement; }); return { ...art, measurements: newMeasurements }; }); updateState(updated); };
  const handleUpdateMeasurement = (articleId: string, mId: string, field: keyof Measurement, value: string | number | undefined) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newMeasurements = art.measurements.map(m => { if (m.id !== mId) return m; return { ...m, [field]: value }; }); return { ...art, measurements: newMeasurements }; }); updateState(updated); };
  const handleDeleteMeasurement = (articleId: string, mId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newMeasurements = art.measurements.filter(m => m.id !== mId); return { ...art, measurements: newMeasurements }; }); updateState(updated); };
  const handleReorderMeasurements = (articleId: string, startIndex: number, endIndex: number) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newMeasurements = [...art.measurements]; const [movedItem] = newMeasurements.splice(startIndex, 1); newMeasurements.splice(endIndex, 0, movedItem); return { ...art, measurements: newMeasurements }; }); updateState(updated); };
  const handleArticleDragStart = (e: React.DragEvent, article: Article) => { setIsDraggingArticle(true); e.dataTransfer.setData(MIME_ARTICLE, 'true'); e.dataTransfer.setData('type', 'ARTICLE'); e.dataTransfer.setData('articleId', article.id); e.dataTransfer.effectAllowed = 'all'; };
  const handleArticleDragEnd = () => { setIsDraggingArticle(false); setWbsDropTarget(null); };
  const handleArticleDrop = (e: React.DragEvent, targetArticleId: string, position: 'top' | 'bottom' = 'bottom') => { setIsDraggingArticle(false); setWbsDropTarget(null); const articleId = e.dataTransfer.getData('articleId'); if (!articleId) return; const targetArticle = articles.find(a => a.id === articleId); if (!targetArticle) return; const currentCategoryArticles = articles.filter(a => a.categoryCode === targetArticle.categoryCode); const startIndex = currentCategoryArticles.findIndex(a => a.id === articleId); let targetIndex = currentCategoryArticles.findIndex(a => a.id === targetArticleId); if (startIndex === -1 || targetIndex === -1) return; if (position === 'bottom' && startIndex > targetIndex) targetIndex++; else if (position === 'top' && startIndex < targetIndex) targetIndex--; const otherArticles = articles.filter(a => a.categoryCode !== targetArticle.categoryCode); const newSubset = [...currentCategoryArticles]; const [movedItem] = newSubset.splice(startIndex, 1); newSubset.splice(targetIndex, 0, movedItem); const newGlobalArticles = [...otherArticles, ...newSubset]; updateState(newGlobalArticles); };
  const handleOpenLinkModal = (articleId: string, measurementId: string) => { setLinkTarget({ articleId, measurementId }); setIsLinkModalOpen(true); };
  const handleLinkMeasurement = (sourceArticle: Article, type: 'quantity' | 'amount') => { if (!linkTarget) return; const updated = articles.map(art => { if (art.id !== linkTarget.articleId) return art; const newMeasurements = art.measurements.map(m => { if (m.id !== linkTarget.measurementId) return m; return { ...m, linkedArticleId: sourceArticle.id, linkedType: type, length: undefined, width: undefined, height: undefined, description: '', multiplier: undefined, type: 'positive' as const }; }); return { ...art, measurements: newMeasurements }; }); updateState(updated); setIsLinkModalOpen(false); setLinkTarget(null); };
  const handleScrollToArticle = (id: string, fromId?: string) => { const targetArt = articles.find(a => a.id === id); if (!targetArt) return; if (fromId) setReturnPath(fromId); if (selectedCategoryCode !== targetArt.categoryCode) setSelectedCategoryCode(targetArt.categoryCode); setTimeout(() => { const element = document.getElementById(`article-${id}`); if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); element.classList.add('bg-yellow-50'); setTimeout(() => element.classList.remove('bg-yellow-50'), 2000); } }, 300); };
  const handleReturnToArticle = () => { if (returnPath) { const id = returnPath; setReturnPath(null); handleScrollToArticle(id); } };
  const handleAddEmptyArticle = (categoryCode: string) => { if (!canAddArticle()) return; const nextAnalysisCode = `AP.${(analyses.length + 1).toString().padStart(2, '0')}`; const newMeasId = Math.random().toString(36).substr(2, 9); const newAnalysis: PriceAnalysis = { id: Math.random().toString(36).substr(2, 9), code: nextAnalysisCode, description: 'Nuova voce da analizzare', unit: 'cad', analysisQuantity: 1, generalExpensesRate: 15, profitRate: 10, totalMaterials: 0, totalLabor: 0, totalEquipment: 0, costoTecnico: 0, valoreSpese: 0, valoreUtile: 0, totalBatchValue: 0, totalUnitPrice: 0, components: [{ id: Math.random().toString(36).substr(2, 9), type: 'general', description: 'Stima a corpo (da dettagliare)', unit: 'cad', unitPrice: 0, quantity: 1 }] }; const newArticle: Article = { id: Math.random().toString(36).substr(2, 9), categoryCode, code: nextAnalysisCode, description: 'Nuova voce da analizzare', unit: 'cad', unitPrice: 0, laborRate: 0, linkedAnalysisId: newAnalysis.id, priceListSource: `Da Analisi ${nextAnalysisCode}`, soaCategory: activeSoaCategory, measurements: [{ id: newMeasId, description: '', type: 'positive', multiplier: undefined }], quantity: 0 }; setLastAddedMeasurementId(newMeasId); updateState([...articles, newArticle], categories, [...analyses, newAnalysis]); setEditingAnalysis(newAnalysis); setViewMode('ANALISI'); setIsAnalysisEditorOpen(true); };
  const handleToggleArticleLock = (id: string) => { const updated = articles.map(art => art.id === id ? { ...art, isLocked: !art.isLocked } : art); updateState(updated); };
  const handleOpenRebarCalculator = (articleId: string) => { setRebarTargetArticleId(articleId); setShouldAutoReopenRebar(true); setIsRebarModalOpen(true); };
  const handleOpenPaintingCalculator = (articleId: string) => { setPaintingTargetArticleId(articleId); setShouldAutoReopenPainting(true); setIsPaintingModalOpen(true); };
  const handleToggleVoiceAutomation = (articleId: string) => { if (voiceAutomationActiveId === articleId) setVoiceAutomationActiveId(null); else setVoiceAutomationActiveId(articleId); };
  const handleToggleSmartRepeat = (articleId: string) => { if (smartRepeatActiveId === articleId) setSmartRepeatActiveId(null); else setSmartRepeatActiveId(articleId); };
  
  const handleToggleLockAllInWbs = () => {
    const activeArticlesInWbs = articles.filter(a => a.categoryCode === selectedCategoryCode);
    const anyUnlocked = activeArticlesInWbs.some(a => !a.isLocked);
    const updated = articles.map(art => 
      art.categoryCode === selectedCategoryCode ? { ...art, isLocked: anyUnlocked } : art
    );
    updateState(updated);
    if (anyUnlocked) {
        setIsCompactView(true); 
    }
    playUISound('confirm');
  };

  const handleToggleCompactInWbs = () => {
      setIsCompactView(!isCompactView);
      playUISound('confirm');
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
      if (rebarTimerRef.current) clearTimeout(rebarTimerRef.current); 
      rebarTimerRef.current = setTimeout(() => setIsRebarModalOpen(true), 5000); 
    } 
  };
  
  const handleAddPaintingMeasurements = (paintRows: Array<{ description: string; multiplier: number; length?: number; width?: number; height?: number; type: 'positive' }>) => { 
    if (paintingTargetArticleId) { 
      const updated = articles.map(art => { 
        if (art.id !== paintingTargetArticleId) return art; 
        const newMeasures = paintRows.map(row => ({ ...row, id: Math.random().toString(36).substr(2, 9) })); 
        return { ...art, measurements: [...art.measurements, ...newMeasures] }; 
      }); 
      updateState(updated); 
      setIsPaintingModalOpen(false); 
      if (shouldAutoReopenPainting) { 
        if (paintingTimerRef.current) clearTimeout(paintingTimerRef.current); 
        paintingTimerRef.current = setTimeout(() => setIsPaintingModalOpen(true), 5000); 
      } 
    } 
  };
  
  const handleDropContent = (rawText: string) => { 
    if (!canAddArticle()) return; 
    const targetCatCode = activeCategoryForAi || (selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode); 
    const currentCat = categories.find(c => c.code === targetCatCode); 
    if (currentCat && currentCat.isLocked) { alert("Impossibile importare: Il capitolo è bloccato."); return; } 
    if (!rawText) return; 
    setIsProcessingDrop(true); 
    setTimeout(() => { 
      try { 
        const parsed = parseDroppedContent(rawText); 
        if (parsed) { 
          const newMeasId = Math.random().toString(36).substr(2, 9); 
          const newArticle: Article = { id: Math.random().toString(36).substr(2, 9), categoryCode: targetCatCode, code: parsed.code || 'NP.001', priceListSource: parsed.priceListSource, description: parsed.description || 'Voce importata', unit: parsed.unit || 'cad', unitPrice: parsed.unitPrice || 0, laborRate: parsed.laborRate || 0, soaCategory: activeSoaCategory, measurements: [{ id: newMeasId, description: '', type: 'positive', length: undefined, multiplier: undefined }], quantity: 0 }; 
          setLastAddedMeasurementId(newMeasId); 
          updateState([...articles, newArticle]); 
        } 
      } catch (e) { 
        console.error(e); 
      } finally { 
        setIsProcessingDrop(false); 
      } 
    }, 100); 
  };
  
  const handleWorkspaceDragOver = (e: React.DragEvent) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    const isInternal = e.dataTransfer.types.includes(MIME_ARTICLE) || e.dataTransfer.types.includes(MIME_MEASUREMENT); 
    const isExternalText = e.dataTransfer.types.includes('text/plain'); 
    if (isExternalText && !isInternal) { 
      if (selectedCategoryCode !== 'SUMMARY') { 
        setIsWorkspaceDragOver(true); 
        e.dataTransfer.dropEffect = 'copy'; 
      } 
    } 
  };
  
  const handleWorkspaceDrop = (e: React.DragEvent) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    setIsWorkspaceDragOver(false); 
    const textData = e.dataTransfer.getData('text/plain'); 
    const isInternal = e.dataTransfer.types.includes(MIME_ARTICLE) || e.dataTransfer.types.includes(MIME_MEASUREMENT); 
    if (textData && !isInternal) handleDropContent(textData); 
  };
  
  const handleToolbarMouseDown = (e: React.MouseEvent) => { 
    setIsDraggingToolbar(true); 
    dragOffset.current = { x: e.clientX - toolbarPos.x, y: e.clientY - toolbarPos.y }; 
  };
  
  useEffect(() => { 
    const handleGlobalMouseMove = (e: MouseEvent) => { 
      if (isDraggingToolbar) { 
        const menuWidth = 450; 
        const menuHeight = 60; 
        let nextX = e.clientX - dragOffset.current.x; 
        let nextY = e.clientY - dragOffset.current.y; 
        nextX = Math.max(10, Math.min(nextX, window.innerWidth - menuWidth - 10)); 
        nextY = Math.max(10, Math.min(nextY, window.innerHeight - menuHeight - 10)); 
        setToolbarPos({ x: nextX, y: nextY }); 
      } 
    }; 
    const handleGlobalMouseUp = () => setIsDraggingToolbar(false); 
    if (isDraggingToolbar) { 
      window.addEventListener('mousemove', handleGlobalMouseMove); 
      window.addEventListener('mouseup', handleGlobalMouseUp); 
    } 
    return () => { 
      window.removeEventListener('mousemove', handleGlobalMouseMove); 
      window.removeEventListener('mouseup', handleGlobalMouseUp); 
    }; 
  }, [isDraggingToolbar]);
  
  const getFullProjectExportData = () => { 
    return JSON.stringify({ gecolaData: { projectInfo, categories, articles, analyses }, exportedAt: new Date().toISOString(), app: "GeCoLa Cloud" }, null, 2); 
  };
  
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
    const timeoutId = setTimeout(() => { handleSmartSave(true); }, 3000); 
    return () => clearTimeout(timeoutId); 
  }, [articles, categories, projectInfo, analyses, currentFileHandle]);
  
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
        } else { 
          alert("Formato non valido."); 
        } 
        setCurrentFileHandle(null); 
      } catch (error) { 
        alert("Errore caricamento."); 
      } 
    }; 
    reader.readAsText(file); 
    e.target.value = ''; 
  };
  
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => { 
    if (e.key === 'Enter') { 
      const target = e.target as HTMLElement; 
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') { 
        if (target.tagName === 'TEXTAREA' && e.shiftKey) return; 
        const inputs = Array.from(document.querySelectorAll('input:not([disabled]), textarea:not([disabled])')); 
        const index = inputs.indexOf(target as HTMLInputElement | HTMLTextAreaElement); 
        const isLastMeasField = target.getAttribute('data-last-meas-field') === 'true'; 
        if (isLastMeasField) { 
          const articleRow = target.closest('tbody'); 
          if (articleRow) { 
            const articleId = articleRow.id.replace('article-', ''); 
            handleAddMeasurement(articleId); 
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

  const activeCategory = useMemo(() => categories.find(c => c.code === selectedCategoryCode), [categories, selectedCategoryCode]);
  const activeArticles = useMemo(() => articles.filter(a => a.categoryCode === selectedCategoryCode), [articles, selectedCategoryCode]);
  const filteredAnalyses = useMemo(() => analyses.filter(a => a.code.toLowerCase().includes(analysisSearchTerm.toLowerCase()) || a.description.toLowerCase().includes(analysisSearchTerm.toLowerCase())), [analyses, analysisSearchTerm]);

  const filteredCategories = useMemo(() => {
    if (viewMode === 'SICUREZZA') return categories.filter(c => c.type === 'safety');
    if (viewMode === 'COMPUTO') return categories.filter(c => c.type !== 'safety');
    return categories; 
  }, [categories, viewMode]);

  return (
    <div className="h-screen flex flex-col bg-[#e8eaed] font-sans overflow-hidden text-slate-800" onDragOver={(e) => { e.preventDefault(); }} onDragEnter={(e) => { e.preventDefault(); }} onClick={stopAllAutomations}>
      <input type="file" ref={fileInputRef} onChange={handleLoadProject} className="hidden" accept=".json" />
      {authLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-white">
           <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
           <p className="font-black uppercase tracking-widest text-xs">Caricamento Sistema...</p>
        </div>
      ) : !user ? (
        <Login onVisitorLogin={handleVisitorLogin} />
      ) : (
        <>
          {!isFocusMode && (
            <div className="bg-[#2c3e50] shadow-md z-50 h-14 flex items-center justify-between px-6 border-b border-slate-600 flex-shrink-0">
                <div className="flex items-center space-x-3 w-72">
                    <div className="bg-orange-500 p-1.5 rounded-lg shadow-lg"><Calculator className="w-5 h-5 text-white" /></div>
                    <span className="font-bold text-lg text-white">GeCoLa <span className="font-light opacity-80">v11.9.1</span></span>
                    <button onClick={() => setIsManualOpen(true)} className="ml-2 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg transition-all hover:scale-110 active:scale-95 group relative" title="Apri Manuale d'Uso"><HelpCircle className="w-5 h-5" /><span className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-black uppercase px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Manuale</span></button>
                </div>
                <div className="flex-1 px-6 flex justify-center items-center gap-6">
                    {isVisitor && (
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5 bg-blue-600/20 border border-blue-500/50 px-3 py-1 rounded-full text-blue-200 text-[10px] font-black uppercase tracking-widest animate-pulse"><Sparkles className="w-3 h-3" /> Account Versione Lite</div>
                            <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${articles.length >= 15 ? 'bg-red-600 border-red-500 text-white animate-bounce' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>Voci Utilizzate: {articles.length} / 15</div>
                        </div>
                    )}
                    {!isVisitor && (
                        <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-1 rounded-t-xl border border-slate-700 text-white font-bold text-xs cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => setIsSettingsModalOpen(true)}>
                            {isAutoSaving && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1"></span>}
                            <span className="truncate max-w-[200px]">{projectInfo.title}</span>
                        </div>
                    )}
                    <div className="flex items-center bg-slate-800/30 rounded-full px-2 py-1 gap-1">
                        <button onClick={handleUndo} disabled={history.length === 0} className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-all hover:scale-110" title="Annulla"><Undo2 className="w-4 h-4" /></button>
                        <div className="w-px h-4 bg-slate-600"></div>
                        <button onClick={handleRedo} disabled={future.length === 0} className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-all hover:scale-110" title="Ripristina"><Redo2 className="w-4 h-4" /></button>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <button onClick={() => fileInputRef.current?.click()} className="p-2 transition-colors text-slate-300 hover:text-orange-400" title="Carica Progetto (.json)"><FolderOpen className="w-5 h-5" /></button>
                    <div className="relative">
                        <button onClick={() => setIsSaveMenuOpen(!isSaveMenuOpen)} className="p-2 transition-colors flex items-center gap-1 text-slate-300 hover:text-blue-400" title="Salva con nome / Esporta"><Save className="w-5 h-5" /><ChevronDown className={`w-3 h-3 transition-transform ${isSaveMenuOpen ? 'rotate-180' : ''}`} /></button>
                        {isSaveMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-64 bg-white shadow-2xl rounded-lg py-2 z-[100] border border-gray-200 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150">
                                <button onClick={() => { setIsSaveMenuOpen(false); handleSmartSave(false); }} className="w-full px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-3 border-b border-gray-100"><Coins className="w-4 h-4 text-blue-600" /><b>Salva in JSON (.json)</b></button>
                                <button onClick={() => { setIsSaveMenuOpen(false); generateComputoExcel(projectInfo, categories, articles); }} className="w-full px-4 py-3 text-sm text-gray-700 hover:bg-green-50 flex items-center gap-3 border-b border-gray-100"><FileSpreadsheet className="w-4 h-4 text-green-600" /><b>Esporta in Excel (.xls)</b></button>
                                <button onClick={() => { setIsSaveMenuOpen(false); setIsSaveModalOpen(true); }} className="w-full px-4 py-3 text-sm text-gray-700 hover:bg-orange-50 flex items-center gap-3"><Coins className="w-4 h-4 text-orange-600" /><b>Esporta Altri Formati</b></button>
                            </div>
                        )}
                    </div>
                    <div className="relative">
                        <button onClick={() => setIsPrintMenuOpen(!isPrintMenuOpen)} className="p-2 transition-colors text-slate-300 hover:text-white flex items-center gap-1" title="Stampe Professionali"><FileText className="w-5 h-5" /><ChevronDown className={`w-3 h-3 transition-transform ${isPrintMenuOpen ? 'rotate-180' : ''}`} /></button>
                        {isPrintMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-72 bg-white shadow-2xl rounded-lg py-2 z-[100] border border-gray-200 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150">
                                <div className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Documenti di Progetto</div>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateComputoMetricPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 flex items-center gap-3"><FileText className="w-4 h-4 text-blue-500" /><b>Computo Estimativo</b></button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateElencoPrezziPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 flex items-center gap-3"><AlignLeft className="w-4 h-4 text-slate-500" /><b>Elenco Prezzi Unitari</b></button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateManodoperaPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 flex items-center gap-3"><User className="w-4 h-4 text-cyan-600" /><b>Stima Manodopera</b></button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateAnalisiPrezziPdf(projectInfo, analyses); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 flex items-center gap-3"><TestTubes className="w-4 h-4 text-purple-600" /><b>Analisi Nuovi Prezzi</b></button>
                            </div>
                        )}
                    </div>
                    <button onClick={handleLogout} className="p-2 text-red-400 hover:text-white ml-2 transition-colors" title="Esci"><LogOut className="w-5 h-5" /></button>
                </div>
            </div>
          )}
          <div className={`flex flex-1 overflow-hidden transition-all duration-500 ${isFocusMode ? 'bg-[#1e293b]' : ''}`}>
            {!isFocusMode && (
                <div className="w-[17rem] bg-slate-200 border-r border-slate-300 flex flex-col flex-shrink-0 z-10 shadow-lg">
                <div className="p-3 bg-slate-300/40 border-b border-slate-400 flex gap-1">
                    <button onClick={() => setViewMode('COMPUTO')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'COMPUTO' ? 'bg-blue-600 text-white shadow-lg ring-1 ring-blue-700' : 'text-slate-600 hover:bg-white hover:text-blue-600 shadow-sm border border-slate-300'}`}>
                      <HardHat className="w-3.5 h-3.5" /> Lavori
                    </button>
                    <button onClick={() => setViewMode('SICUREZZA')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'SICUREZZA' ? 'bg-orange-500 text-white shadow-lg ring-1 ring-orange-600' : 'text-slate-600 hover:bg-white hover:text-orange-600 shadow-sm border border-slate-300'}`}>
                      <ShieldAlert className="w-3.5 h-3.5" /> Sicurezza
                    </button>
                    <button onClick={() => setViewMode('ANALISI')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'ANALISI' ? 'bg-purple-600 text-white shadow-lg ring-1 ring-purple-700' : 'text-slate-600 hover:bg-white hover:text-purple-600 shadow-sm border border-slate-300'}`}>
                      <TestTubes className="w-3.5 h-3.5" /> Analisi
                    </button>
                </div>
                <div className={`flex-1 overflow-y-auto transition-colors duration-500 ${viewMode === 'SICUREZZA' ? 'bg-orange-50/20' : 'bg-transparent'}`} onDrop={(e) => handleWbsDrop(e, null)}>
                    {viewMode === 'COMPUTO' || viewMode === 'SICUREZZA' ? (
                        <>
                        <div className={`p-3 border-b text-[9px] font-bold uppercase flex justify-between items-center tracking-widest sticky top-0 z-30 shadow-sm backdrop-blur-md ${viewMode === 'SICUREZZA' ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                            <div className="flex items-center gap-2">
                                <span>Indice {viewMode === 'SICUREZZA' ? 'Sicurezza' : 'WBS'}</span>
                                <button 
                                    onClick={handleToggleAllCategories} 
                                    className={`p-1 rounded-lg transition-all ${categories.some(c => c.isEnabled !== false) ? 'text-yellow-500 hover:bg-yellow-50' : 'text-gray-300 hover:bg-gray-200'}`}
                                    title="Attiva/Disattiva tutto (Master Switch)"
                                >
                                    {categories.some(c => c.isEnabled !== false) ? <Lightbulb className="w-5 h-5" /> : <LightbulbOff className="w-5 h-5" />}
                                </button>
                            </div>
                            <PlusCircle className={`w-6 h-6 cursor-pointer hover:scale-110 transition-transform ${viewMode === 'SICUREZZA' ? 'text-orange-600' : 'text-blue-600'}`} onClick={handleAddCategory}/>
                        </div>
                        
                        <div className="h-[30px] w-full pointer-events-none"></div>

                        <ul className="p-3 space-y-4">
                            {filteredCategories.map(cat => {
                            const isSelected = selectedCategoryCode === cat.code;
                            const isInsideDropTarget = wbsDropTarget?.code === cat.code && wbsDropTarget?.position === 'inside';
                            return (
                            <li key={cat.code} className={`relative transition-all ${!cat.isEnabled ? 'opacity-40 grayscale' : ''}`} onDragOver={(e) => handleWbsDragOver(e, cat.code)} onDragEnter={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDragLeave={handleWbsDragLeave} onDrop={(e) => handleWbsDrop(e, cat.code)}>
                                {wbsDropTarget?.code === cat.code && wbsDropTarget.position !== 'inside' && <div className={`absolute ${wbsDropTarget.position === 'top' ? 'top-0' : 'bottom-0'} left-0 right-0 h-1 bg-green-500 z-50 shadow-[0_0_10px_rgba(34,197,94,0.8)] pointer-events-none`} />}
                                <div draggable onDragStart={(e) => handleWbsDragStart(e, cat.code)} className="cursor-pointer group/wbsrow" onClick={() => setSelectedCategoryCode(cat.code)}>
                                    <div className={`w-full text-left rounded-2xl border transition-all flex flex-col relative overflow-hidden min-h-[110px] shadow-lg ${isInsideDropTarget ? 'border-green-500 ring-4 ring-green-100 bg-green-50 scale-[1.05]' : (isSelected ? (viewMode === 'SICUREZZA' ? 'bg-white border-orange-600 border-l-[8px] shadow-2xl scale-[1.03]' : 'bg-white border-blue-700 border-l-[8px] shadow-2xl scale-[1.03]') : 'bg-slate-50 border-slate-300 hover:bg-white hover:border-slate-400 hover:-translate-y-1')}`}>
                                        <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col items-center justify-center gap-1 opacity-0 group-hover/wbsrow:opacity-100 transition-all duration-200 bg-white/95 border-r border-slate-100 z-[100] shadow-sm">
                                            <button onClick={(e) => { e.stopPropagation(); const newCats = categories.map(c => c.code === cat.code ? {...c, isEnabled: !c.isEnabled} : c); setCategories(newCats); }} className="p-1 text-gray-400 hover:text-blue-500 rounded transition-colors" title="Abilita/Disabilita">{cat.isEnabled ? <Lightbulb className="w-3.5 h-3.5" /> : <LightbulbOff className="w-3.5 h-3.5" />}</button>
                                            <button onClick={(e) => { e.stopPropagation(); const newCats = categories.map(c => c.code === cat.code ? {...c, isLocked: !c.isLocked} : c); setCategories(newCats); }} className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors" title="Blocca/Sblocca">{cat.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}</button>
                                            <button onClick={(e) => { e.stopPropagation(); setWbsOptionsContext({ type: 'duplicate', sourceCode: cat.code, initialName: cat.name }); }} className="p-1 text-gray-400 hover:text-orange-500 rounded transition-colors" title="Duplica">{cat.isLocked ? <Copy className="w-3.5 h-3.5 opacity-30"/> : <Copy className="w-3.5 h-3.5" />}</button>
                                            <button onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }} className="p-1 text-gray-400 hover:text-green-600 rounded transition-colors" title="Rinomina">{cat.isLocked ? <Settings className="w-3.5 h-3.5 opacity-30"/> : <Edit2 className="w-3.5 h-3.5" />}</button>
                                            <button onClick={(e) => handleDeleteCategory(cat.code, e)} className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors" title="Elimina">{cat.isLocked ? <Trash2 className="w-3.5 h-3.5 opacity-30"/> : <Trash2 className="w-3.5 h-3.5" />}</button>
                                        </div>
                                        
                                        <div className="p-4 pl-10 h-full flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded shadow-sm transition-all ${isSelected ? (viewMode === 'SICUREZZA' ? 'bg-orange-600 text-white' : 'bg-blue-700 text-white') : 'bg-slate-300 text-slate-700'}`}>{cat.code}</span>
                                                    {cat.isLocked && <Lock className="w-3.5 h-3.5 text-red-600 animate-pulse" />}
                                                </div>
                                                <span className={`font-black block whitespace-normal uppercase leading-tight tracking-tight text-[12px] ${isSelected ? (viewMode === 'SICUREZZA' ? 'text-orange-900' : 'text-blue-900') : 'text-slate-700'}`}>{cat.name}</span>
                                            </div>
                                            <div className="mt-auto pt-3 border-t border-slate-100/50">
                                                <span className={`font-mono font-black text-lg ${isSelected ? (viewMode === 'SICUREZZA' ? 'text-orange-600' : 'text-blue-700') : 'text-slate-500'}`}>{formatCurrency(categoryTotals[cat.code] || 0)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </li>
                            )})}
                        </ul>
                        <div className="mt-auto p-3 border-t border-slate-400 bg-white/90 backdrop-blur-lg sticky bottom-0 z-20 shadow-[0_-10px_25px_rgba(0,0,0,0.15)]">
                            <button onClick={() => setSelectedCategoryCode('SUMMARY')} className={`w-full flex items-center p-3 rounded-2xl text-[10px] font-black uppercase transition-all mb-3 ${selectedCategoryCode === 'SUMMARY' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-300 shadow-sm'}`}><Layers className="w-4 h-4 mr-2" /> Riepilogo Generale</button>
                            <div className="px-4 py-3 bg-white rounded-2xl border-2 border-indigo-100 text-center shadow-inner"><span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-0.5">Valore Netto Progetto</span><span className="font-mono font-black text-indigo-700 text-xl">{formatCurrency(totals.totalWorks + totals.totalSafetyProgettuale)}</span></div>
                        </div>
                        </>
                    ) : (
                        <div className="p-3 space-y-3">
                            <div className="p-1 bg-white border-b border-gray-200"><input type="text" placeholder="Cerca Analisi..." value={analysisSearchTerm} onChange={e => setAnalysisSearchTerm(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-purple-400" /></div>
                            {filteredAnalyses.map(analysis => (
                                <div key={analysis.id} draggable onDragStart={(e) => handleAnalysisDragStart(e, analysis)} className={`bg-white p-4 rounded-2xl border shadow-sm transition-all group/acard ${analysis.isLocked ? 'border-purple-200 grayscale-[0.3]' : 'border-transparent hover:border-purple-400 hover:shadow-2xl hover:-translate-y-1'}`}>
                                    <div className="flex justify-between mb-1.5"><span className="bg-purple-100 text-purple-700 font-bold font-mono text-[10px] px-2 py-0.5 rounded-lg flex items-center gap-1">{analysis.isLocked && <Lock className="w-2.5 h-2.5" />}{analysis.code}</span><span className="font-black text-gray-800 text-xs">{formatCurrency(analysis.totalUnitPrice)}</span></div>
                                    <p className="text-[10px] text-gray-600 line-clamp-2 leading-tight font-medium">{analysis.description}</p>
                                    <div className="flex justify-between items-center mt-3 border-t border-slate-50 pt-2.5">
                                        <div className="flex items-center gap-1 opacity-0 group-hover/acard:opacity-100 transition-opacity">
                                            <button onClick={() => handleToggleAnalysisLock(analysis.id)} className={`p-1.5 rounded-lg transition-colors ${analysis.isLocked ? 'text-red-500 bg-red-50 hover:bg-red-100' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'}`}>{analysis.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}</button>
                                            <button onClick={() => { setEditingAnalysis(analysis); setIsAnalysisEditorOpen(true); }} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                                            <button onClick={() => handleDeleteAnalysis(analysis.id)} className="p-1.5 text-gray-400 hover:text-red-600 bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                        <button onClick={() => handleImportAnalysisToArticle(analysis)} className="p-1.5 text-purple-400 hover:bg-purple-600 hover:text-white rounded-lg border border-purple-100 shadow-sm transition-all" title="Usa nel computo"><ArrowRightLeft className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                </div>
            )}
            <div className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-500 ${isFocusMode ? 'bg-[#1e293b]' : ''}`}>
               {isFocusMode && (
                  <div style={{ left: toolbarPos.x, top: toolbarPos.y }} className="fixed z-[300] flex items-center gap-3 bg-slate-900/10 hover:bg-slate-900/90 backdrop-blur-sm hover:backdrop-blur-md border border-slate-700/30 hover:border-slate-600 p-2 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] animate-in slide-in-from-top-4 duration-500 group select-none opacity-20 hover:opacity-100 transition-all">
                    <div onMouseDown={handleToolbarMouseDown} className="p-2 cursor-move text-slate-500 hover:text-blue-400 transition-colors" title="Trascina per spostare"><GripHorizontal className="w-5 h-5" /></div>
                    <div className="flex items-center gap-4 pr-3 mr-1 ml-1">
                        <div className="flex items-center gap-2">
                             <div className="flex flex-col">
                                <span className="text-[12px] font-black text-white/90 uppercase tracking-tighter max-w-[250px] whitespace-normal leading-tight mb-1">{activeCategory?.code} - {activeCategory?.name}</span>
                                <span className="text-lg font-black text-orange-400 font-mono tracking-tighter leading-none">{formatCurrency(categoryTotals[activeCategory?.code || ''] || 0)}</span>
                            </div>
                        </div>
                        <div className="h-6 w-[1.5px] bg-slate-700"></div>
                        <button onClick={() => { setActiveCategoryForAi(activeCategory?.code || null); setIsImportAnalysisModalOpen(true); }} className={`px-4 py-2 rounded-xl font-black uppercase text-[10px] flex items-center gap-2 shadow-lg transition-all active:scale-95 ${viewMode === 'SICUREZZA' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'} text-white`}><Plus className="w-4 h-4" /> Aggiungi Voce</button>
                    </div>
                    <button onClick={() => setIsFocusMode(false)} className="bg-slate-800 hover:bg-orange-600 text-white p-2.5 rounded-xl shadow-lg transition-all active:scale-90" title="Esci Schermo Intero"><Minimize2 className="w-4 h-4" /></button>
                  </div>
               )}
               {returnPath && (
                 <button onClick={handleReturnToArticle} className="fixed bottom-12 right-12 z-[250] flex items-center gap-3 bg-blue-600/30 hover:bg-blue-600 backdrop-blur-lg border border-blue-500/40 text-blue-100 px-6 py-4 rounded-[2rem] shadow-2xl transition-all hover:scale-105 active:scale-95 group animate-in slide-in-from-bottom-8 duration-500"><ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /><div className="text-left"><span className="block text-[8px] font-black uppercase tracking-widest opacity-60">Navigazione Circolare</span><span className="block text-xs font-black uppercase">Torna alla voce di lavoro</span></div></button>
               )}
               {activeCategory && selectedCategoryCode !== 'SUMMARY' && (viewMode === 'COMPUTO' || viewMode === 'SICUREZZA') && !isFocusMode && (
                   <div className={`flex items-center justify-between p-5 bg-slate-50 rounded-2xl border-2 shadow-sm animate-in slide-in-from-top-2 duration-300 z-30 transition-all ${viewMode === 'SICUREZZA' ? 'border-orange-600' : 'border-blue-700'}`}>
                        <div className="flex items-center gap-5">
                             <button onClick={() => setIsFocusMode(true)} className="p-3 rounded-xl bg-[#2c3e50] text-white hover:bg-blue-600 shadow-lg transition-all transform active:scale-95 group relative" title="Attiva Focus Mode (Tutto Schermo)"><Maximize2 className="w-5 h-5" /><span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[8px] font-black uppercase px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">Schermo Intero</span></button>
                             <div className="flex flex-col items-center">
                                <div className={`px-4 py-2.5 rounded-xl border-2 font-black text-2xl shadow-inner transition-colors ${viewMode === 'SICUREZZA' ? 'bg-orange-600 text-white border-orange-700' : 'bg-blue-700 text-white border-blue-800'}`}>{activeCategory.code}</div>
                                <div className="mt-2 flex flex-col items-center">
                                  <div className="flex items-center gap-2">
                                      <button 
                                          onClick={handleToggleLockAllInWbs}
                                          className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all shadow-sm group ${articles.filter(a => a.categoryCode === selectedCategoryCode).every(a => a.isLocked) ? 'bg-red-600 text-white border-red-700' : 'bg-gray-50 border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600'}`}
                                          title="Blocca tutto e Compatta"
                                      >
                                          <Lock className="w-3.5 h-3.5 group-hover:scale-110" />
                                      </button>
                                      <button 
                                          onClick={handleToggleCompactInWbs}
                                          className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all shadow-sm ${isCompactView ? 'bg-blue-600 text-white border-blue-700' : 'bg-gray-50 text-slate-500 border-slate-200 hover:bg-blue-50'}`}
                                          title="Schor (Vista Compatta a 2 righe)"
                                      >
                                          <EyeOff className="w-3.5 h-3.5" />
                                      </button>
                                  </div>
                                  <span className="text-[7px] font-black uppercase text-slate-400 mt-1 tracking-widest">CONTROLLI WBS</span>
                                </div>
                             </div>
                             <div className="flex flex-col ml-2">
                                <h2 className={`text-xl font-black uppercase max-w-[500px] whitespace-normal leading-tight tracking-tight ${viewMode === 'SICUREZZA' ? 'text-orange-900' : 'text-blue-900'}`}>{activeCategory.name}</h2>
                                <div className="mt-2 flex items-center gap-4">
                                    <span className={`text-2xl font-mono font-black ${viewMode === 'SICUREZZA' ? 'text-orange-600' : 'text-blue-700'}`}>{formatCurrency(categoryTotals[activeCategory.code] || 0)}</span>
                                </div>
                             </div>
                        </div>
                        <div className="flex items-center gap-4">
                           <div className="flex items-center gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-purple-600 uppercase mb-0.5 ml-1 flex items-center gap-1"><Award className="w-2.5 h-2.5" /> Preimposta SOA</span>
                                    <select value={activeSoaCategory} onChange={(e) => setActiveSoaCategory(e.target.value)} className="bg-purple-50 border border-purple-200 text-purple-900 text-xs font-bold rounded-lg px-2 py-2 min-w-[200px] shadow-sm hover:border-purple-300 transition-colors">{SOA_CATEGORIES.map(soa => (<option key={soa.code} value={soa.code}>{soa.code} - {soa.desc}</option>))}</select>
                                </div>
                                <button onClick={() => { setActiveCategoryForAi(activeCategory.code); setIsImportAnalysisModalOpen(true); }} className={`px-6 py-3 rounded-xl font-black shadow-md transition-all flex items-center gap-2 text-xs mt-3 text-white transform active:scale-95 ${viewMode === 'SICUREZZA' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-700 hover:bg-blue-800'}`}><Plus className="w-5 h-5" /> Aggiungi Voce</button>
                           </div>
                        </div>
                   </div>
               )}
           <div className={`flex-1 overflow-y-auto overflow-x-hidden shadow-[0_35px_60px_-15px_rgba(0,0,0,0.4)] border-x border-gray-400 flex flex-col relative scroll-smooth group/rotolo transition-all duration-500 rounded-xl ${viewMode === 'SICUREZZA' ? 'bg-orange-50/10' : 'bg-white'}`} style={{ backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.015) 0%, transparent 4%, transparent 96%, rgba(0,0,0,0.015) 100%)', backgroundAttachment: 'local' }} onKeyDown={handleInputKeyDown} onDragOver={handleWorkspaceDragOver} onDragLeave={() => setIsWorkspaceDragOver(false)} onDrop={handleWorkspaceDrop}>
              <div className="sticky top-0 left-0 right-0 h-10 bg-gradient-to-b from-white/95 via-white/40 to-transparent z-[100] pointer-events-none transition-opacity"></div>
              <div className="flex-1 flex flex-col min-h-full px-6">
                {(viewMode === 'COMPUTO' || viewMode === 'SICUREZZA') && (
                    selectedCategoryCode === 'SUMMARY' ? (
                        <div className="p-12"><Summary totals={totals} info={projectInfo} categories={categories} articles={articles} /></div>
                    ) : activeCategory ? (
                        <div key={activeCategory.code} className="flex-1 flex flex-col">
                            <table className="w-full text-left border-collapse table-fixed relative">
                                <TableHeader activeColumn={activeColumn} tariffWidth={projectInfo.tariffColumnWidth} />
                                {activeArticles.length === 0 ? (
                                    <tbody>
                                        <tr>
                                            <td colSpan={11} className="p-0">
                                                <div className={`min-h-[70vh] w-full flex flex-col items-center justify-center p-20 transition-all duration-500 ${isWorkspaceDragOver ? 'bg-blue-50/80' : 'bg-white'}`}>
                                                    <div 
                                                        className={`flex flex-col items-center gap-8 max-w-2xl w-full p-12 rounded-[3.5rem] border-4 border-dashed transition-all duration-500 group/dropzone ${isWorkspaceDragOver ? 'border-blue-600 bg-white shadow-2xl scale-105' : 'border-blue-100 hover:border-blue-300 bg-slate-50/30'}`}
                                                    >
                                                        <div className={`p-8 rounded-[2.5rem] shadow-inner transition-all duration-500 ${isWorkspaceDragOver ? 'bg-blue-600 text-white ring-8 ring-blue-100 animate-bounce' : 'bg-white text-blue-200 border border-blue-50'}`}>
                                                            {isWorkspaceDragOver ? <CornerRightDown className="w-16 h-16" /> : <Zap className="w-16 h-16 text-blue-500/40" />}
                                                        </div>
                                                        <div className="text-center space-y-4">
                                                            <h3 className={`text-3xl font-black uppercase tracking-tighter ${isWorkspaceDragOver ? 'text-blue-900' : 'text-slate-400'}`}>
                                                                {isWorkspaceDragOver ? 'Rilascia per agganciare' : 'Aggancio Rapido Attivo'}
                                                            </h3>
                                                            <p className="text-slate-400 font-medium leading-relaxed max-w-md mx-auto">
                                                                Srotola il computo trascinando la prima voce professionale direttamente da 
                                                                <a 
                                                                    href="https://www.gecola.it/home/listini" 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer" 
                                                                    className="inline-flex items-center gap-1.5 ml-2 px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 rounded-full transition-all font-black shadow-lg shadow-blue-600/20 active:scale-95"
                                                                    onClick={e => e.stopPropagation()}
                                                                >
                                                                    gecola.it <ExternalLink className="w-3.5 h-3.5" />
                                                                </a>
                                                            </p>
                                                            <div className={`mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isWorkspaceDragOver ? 'bg-blue-600 text-white animate-pulse' : 'bg-blue-50 text-blue-400'}`}>
                                                                <MousePointerClick className="w-4 h-4" /> Rilevamento automatico parametri tecnici
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                ) : (
                                    activeArticles.map((article, artIndex) => (
                                        <ArticleGroup key={article.id} article={article} index={artIndex} allArticles={articles} isPrintMode={false} isCategoryLocked={activeCategory.isLocked} isCompactView={isCompactView} projectSettings={projectInfo} onUpdateArticle={handleUpdateArticle} onEditArticleDetails={handleEditArticleDetails} onDeleteArticle={handleDeleteArticle} onAddMeasurement={handleAddMeasurement} onAddSubtotal={handleAddSubtotal} onAddVoiceMeasurement={handleAddVoiceMeasurement} onUpdateMeasurement={handleUpdateMeasurement} onDeleteMeasurement={handleDeleteMeasurement} onToggleDeduction={handleToggleDeduction} onOpenLinkModal={handleOpenLinkModal} onScrollToArticle={handleScrollToArticle} onReorderMeasurements={handleReorderMeasurements} onArticleDragStart={handleArticleDragStart} onArticleDrop={handleArticleDrop} onArticleDragEnd={handleArticleDragEnd} lastAddedMeasurementId={lastAddedMeasurementId} onColumnFocus={setActiveColumn} onViewAnalysis={handleViewLinkedAnalysis} onInsertExternalArticle={handleInsertExternalArticle} onToggleArticleLock={handleToggleArticleLock} onOpenRebarCalculator={handleOpenRebarCalculator} onOpenPaintingCalculator={handleOpenPaintingCalculator} onToggleVoiceAutomation={handleToggleVoiceAutomation} onToggleSmartRepeat={handleToggleSmartRepeat} voiceAutomationActiveId={voiceAutomationActiveId} smartRepeatActiveId={smartRepeatActiveId} isPaintingAutomationActive={shouldAutoReopenPainting} isRebarAutomationActive={shouldAutoReopenRebar} />
                                    ))
                                )}
                                <tbody>
                                    <tr className="border-none"><td colSpan={11} className="p-0 border-none"><div className={`min-h-[85vh] w-full flex flex-col items-center justify-start pt-24 border-t-4 border-dashed border-slate-100 transition-all duration-500 ${isWorkspaceDragOver ? 'bg-blue-50/70 border-blue-400 scale-[0.99]' : 'bg-white'}`}><div className={`flex flex-col items-center gap-6 p-12 rounded-[4rem] border-4 border-dashed transition-all duration-500 ${isWorkspaceDragOver ? 'border-blue-500 bg-white shadow-2xl scale-110' : 'border-slate-100 opacity-20'}`}><div className={`p-6 rounded-full transition-colors ${isWorkspaceDragOver ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-50 text-slate-300'}`}>{isWorkspaceDragOver ? <ArrowRightLeft className="w-16 h-16" /> : <PlusCircle className="w-12 h-12" />}</div><div className="text-center"><span className={`block text-2xl font-black uppercase tracking-tighter ${isWorkspaceDragOver ? 'text-blue-900' : 'text-slate-400'}`}>{isWorkspaceDragOver ? 'Rilascia per caricare' : 'Computo in divenire'}</span><span className={`text-xs font-bold uppercase tracking-widest mt-2 block ${isWorkspaceDragOver ? 'text-blue-500' : 'text-slate-300'}`}>Trascina le voci qui per continuare lo srotolamento</span></div></div></div></td></tr>
                                </tbody>
                            </table>
                        </div>
                    ) : <div className="p-20 text-center text-gray-400 uppercase font-black opacity-20 text-3xl">Seleziona un capitolo</div>
                )}
                {viewMode === 'ANALISI' && (
                    <div className="p-12 bg-slate-50 min-h-full">
                        <div className="flex justify-between items-center mb-10"><h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Gestione Analisi Prezzi</h2><button onClick={handleAddNewAnalysis} className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs shadow-xl shadow-purple-600/20 flex items-center gap-3 transition-all hover:scale-105 active:scale-95"><Plus className="w-5 h-5" /> Nuova Analisi</button></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                            {analyses.map(analysis => (
                                <div key={analysis.id} className={`bg-white rounded-3xl shadow-md border-2 transition-all flex flex-col group ${analysis.isLocked ? 'border-purple-200 grayscale-[0.3]' : 'border-transparent hover:border-purple-400 hover:shadow-2xl hover:-translate-y-1'}`}><div className="p-6 flex-1"><div className="flex justify-between items-start mb-4"><div className="flex flex-col"><span className="bg-purple-600 text-white font-black font-mono text-[10px] px-3 py-1 rounded-full w-fit flex items-center gap-1.5 shadow-sm">{analysis.isLocked && <Lock className="w-3 h-3" />}{analysis.code}</span><span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{analysis.unit}</span></div><div className="text-right"><div className="text-2xl font-black text-purple-700 font-mono leading-none">{formatCurrency(analysis.totalUnitPrice)}</div><span className="text-[9px] text-gray-400 uppercase font-bold tracking-widest mt-1 block">Prezzo Unitario</span></div></div><h4 className="font-bold text-gray-800 text-sm leading-snug line-clamp-3 mb-6 min-h-[3em]">{analysis.description}</h4><div className="space-y-2.5 border-t border-slate-100 pt-5"><div className="flex justify-between text-[10px]"><span className="text-gray-400 font-bold uppercase tracking-widest">Materiali</span><span className="font-mono text-gray-700 font-bold">{formatCurrency(analysis.totalMaterials)}</span></div><div className="flex justify-between text-[10px]"><span className="text-gray-400 font-bold uppercase tracking-widest">Manodopera</span><span className="font-mono text-gray-700 font-bold">{formatCurrency(analysis.totalLabor)}</span></div><div className="flex justify-between text-[10px]"><span className="text-gray-400 font-bold uppercase tracking-widest">Noli/Attr.</span><span className="font-mono text-gray-700 font-bold">{formatCurrency(analysis.totalEquipment)}</span></div></div></div><div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center rounded-b-3xl"><div className="flex items-center gap-1"><button onClick={() => handleToggleAnalysisLock(analysis.id)} className={`p-2 rounded-xl transition-all ${analysis.isLocked ? 'text-red-500 bg-red-50 hover:bg-red-100' : 'text-gray-400 hover:text-blue-600 hover:bg-white'}`} title={analysis.isLocked ? "Sblocca" : "Blocca"}>{analysis.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}</button><button onClick={() => { setEditingAnalysis(analysis); setIsAnalysisEditorOpen(true); }} className="p-2 text-gray-400 hover:text-purple-600 hover:bg-white rounded-xl transition-all" title="Modifica"><PenLine className="w-4 h-4" /></button><button onClick={() => handleDeleteAnalysis(analysis.id)} className="p-2 text-gray-400 hover:text-red-600 bg-red-50 rounded-xl"><Trash2 className="w-4 h-4" /></button></div><button onClick={() => handleImportAnalysisToArticle(analysis)} className="flex items-center gap-2 bg-white text-purple-700 font-black text-[10px] px-4 py-2 rounded-xl border border-purple-200 hover:bg-purple-600 hover:text-white transition-all shadow-sm uppercase tracking-widest">Usa <ArrowRight className="w-4 h-4" /></button></div></div>
                            ))}
                        </div>
                    </div>
                )}
              </div>
              <div className="sticky bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white/95 via-white/30 to-transparent z-40 pointer-events-none transition-all"></div>
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
      <WbsImportOptionsModal isOpen={!!wbsOptionsContext} onClose={() => setWbsOptionsContext(null)} onChoice={handleWbsActionChoice} isImport={wbsOptionsContext?.type === 'import'} initialName={wbsOptionsContext?.initialName || ''} />
      <HelpManualModal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
      <RebarCalculatorModal isOpen={isRebarModalOpen} onClose={() => { setIsRebarModalOpen(false); setShouldAutoReopenRebar(false); if(rebarTimerRef.current) clearTimeout(rebarTimerRef.current); }} onAdd={handleAddRebarMeasurement} />
      <PaintingCalculatorModal isOpen={isPaintingModalOpen} onClose={() => { setIsPaintingModalOpen(false); setShouldAutoReopenPainting(false); if(paintingTimerRef.current) clearTimeout(paintingTimerRef.current); }} onAdd={handleAddPaintingMeasurements} />
    </>
      )}
    </div>
  );
};
export default App;