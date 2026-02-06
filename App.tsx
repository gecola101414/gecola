import { 
  Plus, Trash2, Calculator, FolderOpen, XCircle, ArrowRight, Settings, 
  PlusCircle, MinusCircle, HelpCircle, Sparkles, AlignLeft, Link as LinkIcon, 
  Undo2, Redo2, PenLine, Lock, Unlock, Lightbulb, LightbulbOff, Edit2, 
  GripVertical, Sigma, Save, Loader2, FileText, ChevronDown, TestTubes, 
  Search, Coins, ArrowRightLeft, Copy, LogOut, Award, User, Maximize2, 
  Minimize2, GripHorizontal, ArrowLeft, Headset, CopyPlus, Paintbrush, 
  Grid3X3, MousePointerClick, Layers, ExternalLink, FileSpreadsheet, ShieldAlert, HardHat,
  Zap, CornerRightDown, ListFilter, EyeOff, ChevronRight, Folder, FolderPlus, Tag, AlertTriangle, Link2Off,
  ShieldCheck, RefreshCw, FilePlus2, Magnet, MoreVertical, LayoutList, List, Database, Info, ChevronUp,
  Calendar
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { ref, set, onValue, off } from 'firebase/database';
import { auth, db } from './firebase';
import Login from './components/Login';
import { CATEGORIES, INITIAL_ARTICLES, PROJECT_INFO, INITIAL_ANALYSES, SOA_CATEGORIES, VIVID_COLORS } from './constants';
import { Article, Totals, ProjectInfo, Measurement, Category, PriceAnalysis } from './types';
import Summary from './components/Summary';
import ScheduleView from './components/ScheduleView';
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
import BulkGeneratorModal from './components/BulkGeneratorModal';
import { parseDroppedContent, parseVoiceMeasurement, generateBulkItems } from './services/geminiService';
import { generateComputoMetricPdf, generateComputoSicurezzaPdf, generateElencoPrezziPdf, generateManodoperaPdf, generateAnalisiPrezziPdf } from './services/pdfGenerator';
import { generateComputoExcel } from './services/excelGenerator';

const MIME_ARTICLE = 'application/gecola-article';
const MIME_MEASUREMENT = 'application/gecola-measurement';
const MIME_ANALYSIS_ROW = 'application/gecola-analysis-row';
const MIME_ANALYSIS_DRAG = 'application/gecola-analysis-data';

// --- SISTEMA AUDIO OTTIMIZZATO ---
let globalAudioCtx: AudioContext | null = null;

const playUISound = (type: 'confirm' | 'move' | 'newline' | 'toggle' | 'cycle') => {
    try {
        if (!globalAudioCtx) {
            globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        if (globalAudioCtx.state === 'suspended') {
            globalAudioCtx.resume();
        }

        const masterGain = globalAudioCtx.createGain();
        masterGain.connect(globalAudioCtx.destination);
        masterGain.gain.setValueAtTime(0, globalAudioCtx.currentTime);

        if (type === 'confirm') {
            masterGain.gain.linearRampToValueAtTime(0.08, globalAudioCtx.currentTime + 0.005);
            const osc = globalAudioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, globalAudioCtx.currentTime); 
            osc.connect(masterGain);
            osc.start();
            masterGain.gain.exponentialRampToValueAtTime(0.0001, globalAudioCtx.currentTime + 0.2);
            osc.stop(globalAudioCtx.currentTime + 0.2);
        } else if (type === 'move') {
            masterGain.gain.linearRampToValueAtTime(0.06, globalAudioCtx.currentTime + 0.005);
            const osc = globalAudioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(660, globalAudioCtx.currentTime); 
            osc.connect(masterGain);
            osc.start();
            masterGain.gain.exponentialRampToValueAtTime(0.0001, globalAudioCtx.currentTime + 0.08);
            osc.stop(globalAudioCtx.currentTime + 0.08);
        } else if (type === 'toggle' || type === 'cycle') {
            masterGain.gain.linearRampToValueAtTime(0.05, globalAudioCtx.currentTime + 0.005);
            const osc = globalAudioCtx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(type === 'cycle' ? 660 : 440, globalAudioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(type === 'cycle' ? 990 : 880, globalAudioCtx.currentTime + 0.1);
            osc.connect(masterGain);
            osc.start();
            masterGain.gain.exponentialRampToValueAtTime(0.0001, globalAudioCtx.currentTime + 0.15);
            osc.stop(globalAudioCtx.currentTime + 0.15);
        } else if (type === 'newline') {
            masterGain.gain.linearRampToValueAtTime(0.12, globalAudioCtx.currentTime + 0.005);
            const freqs = [523.25, 659.25, 783.99]; 
            freqs.forEach((f, i) => {
                if (!globalAudioCtx) return;
                const osc = globalAudioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, globalAudioCtx.currentTime + (i * 0.08));
                osc.connect(masterGain);
                osc.start(globalAudioCtx.currentTime + (i * 0.08));
                osc.stop(globalAudioCtx.currentTime + 0.4);
            });
            masterGain.gain.exponentialRampToValueAtTime(0.0001, globalAudioCtx.currentTime + 0.5);
        }
    } catch (e) {
        console.warn("Audio feedback disabled:", e);
    }
};

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: true }).format(val);
};

const formatNumber = (val: number | undefined | null) => {
    if (val === undefined || val === null || val === 0) return '';
    return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
};

const formatResult = (val: number | undefined | null) => {
    const value = val || 0;
    return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
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

const getRank = (unit: string) => {
  const u = unit.toLowerCase().replace(/\s/g, '');
  if (u.includes('m3') || u.includes('mc') || u.includes('m³')) return 3;
  if (u.includes('m2') || u.includes('mq') || u.includes('m²')) return 2;
  if (u === 'm' || u === 'ml' || u.includes('linea') || u.includes('ml.')) return 1;
  return 0;
};

const calculateRowValueWithContext = (m: Measurement, targetUnit: string, linkedValue: number = 0, sourceUnit: string = ''): number => {
  if (m.type === 'subtotal') return 0;
  
  const hasLocalDimensions = m.length !== undefined || m.width !== undefined || m.height !== undefined;
  const hasMultiplier = m.multiplier !== undefined;
  
  if (!hasLocalDimensions && !hasMultiplier && !m.linkedArticleId) return 0;

  const mult = hasMultiplier ? m.multiplier! : (hasLocalDimensions || m.linkedArticleId ? 1 : 0);
  const sign = m.type === 'deduction' ? -1 : 1;

  if (m.linkedArticleId && sourceUnit) {
    const sRank = getRank(sourceUnit);
    let localPhysicalFactor = 1;
    if (sRank < 1) localPhysicalFactor *= (m.length || 1);
    if (sRank < 2) localPhysicalFactor *= (m.width || 1);
    if (sRank < 3) localPhysicalFactor *= (m.height || 1);
    return linkedValue * localPhysicalFactor * mult * sign;
  }

  const l = m.length === undefined ? 1 : m.length;
  const w = m.width === undefined ? 1 : m.width;
  const h = m.height === undefined ? 1 : m.height;
  
  const base = hasLocalDimensions ? (l * w * h) : 0;
  
  const effectiveBase = (!hasLocalDimensions && mult !== 0) ? 1 : base;
  return effectiveBase * mult * sign;
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
       const sourceArt = allArticlesMap.get(m.linkedArticleId);
       let finalSourceVal = sourceQty;
       if (m.linkedType === 'amount' && sourceArt) {
           finalSourceVal = sourceQty * sourceArt.unitPrice;
       }
       rowVal = calculateRowValueWithContext(m, article.unit, finalSourceVal, sourceArt?.unit || '');
    } else {
       rowVal = calculateRowValueWithContext(m, article.unit);
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
  <thead className="bg-[#f8f9fa] border-b-2 border-black text-[9px] uppercase font-black text-gray-800 sticky top-0 z-10 shadow-md">
    <tr>
      <th className="py-2.5 px-1 text-center w-[30px] border-r border-gray-300">N..</th>
      <th className="py-2.5 px-1 text-left border-r border-gray-300" style={{ width: tariffWidth ? `${tariffWidth}px` : '135px' }}>Tariffa</th>
      <th className={`py-2.5 px-1 text-left min-w-[280px] border-r border-gray-300 ${activeColumn === 'desc' ? 'bg-blue-50 text-blue-900' : ''}`}>Designazione dei Lavori</th>
      <th className={`py-2.5 px-1 text-center w-[40px] border-r border-gray-300 ${activeColumn === 'mult' ? 'bg-blue-50 text-blue-900' : ''}`}>Par.Ug</th>
      <th className={`py-2.5 px-1 text-center w-[50px] border-r border-gray-300 ${activeColumn === 'len' ? 'bg-blue-50 text-blue-900' : ''}`}>Lung..</th>
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
  isSurveyorGuardActive: boolean;
  projectSettings: ProjectInfo;
  lastMovedItemId: string | null;
  onUpdateArticle: (id: string, field: keyof Article, value: any) => void;
  onEditArticleDetails: (article: Article) => void;
  onUpdateMeasurement: (articleId: string, mId: string, field: keyof Measurement, value: string | number | undefined) => void;
  onDeleteMeasurement: (articleId: string, mId: string) => void;
  onToggleDeduction: (articleId: string, mId: string) => void;
  onAddMeasurement: (articleId: string) => void;
  onAddSubtotal: (articleId: string) => void;
  onAddVoiceMeasurement: (articleId: string, data: Partial<Measurement>) => void;
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
}

const ArticleGroup: React.FC<ArticleGroupProps> = (props) => {
   const { article, index, allArticles, isPrintMode, isCategoryLocked, isSurveyorGuardActive, projectSettings, lastMovedItemId, onUpdateArticle, onEditArticleDetails, onDeleteArticle, onAddMeasurement, onAddSubtotal, onAddVoiceMeasurement, onUpdateMeasurement, onDeleteMeasurement, onToggleDeduction, onOpenLinkModal, onScrollToArticle, onReorderMeasurements, onArticleDragStart, onArticleDrop, onArticleDragEnd, lastAddedMeasurementId, onColumnFocus, onViewAnalysis, onInsertExternalArticle, onToggleArticleLock, onOpenRebarCalculator, onOpenPaintingCalculator, onToggleVoiceAutomation, onToggleSmartRepeat, voiceAutomationActiveId, smartRepeatActiveId } = props;
   
   const [measurementDragOverId, setMeasurementDragOverId] = useState<string | null>(null);
   const [isArticleDragOver, setIsArticleDragOver] = useState(false);
   const [articleDropPosition, setArticleDropPosition] = useState<'top' | 'bottom' | null>(null);
   const [isListening, setIsListening] = useState(false);
   const [recordingMeasId, setRecordingMeasId] = useState<string | null>(null);
   const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
   const [touchedRowIds, setTouchedRowIds] = useState<Set<string>>(new Set());

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

   const individualDisplayMode = article.displayMode || 0;
   const isIndustrialMode = individualDisplayMode === 2; // Patto d'Acciaio
   const isConciseMode = individualDisplayMode === 1;   // Revisione

   const handleCycleLocal = () => {
       if (isCategoryLocked) return;
       const next = (individualDisplayMode + 1) % 3;
       onUpdateArticle(article.id, 'displayMode', next);
       playUISound('cycle');
   };

   const getSurveyorWarning = (m: Measurement): { msg: string, severity: 'error' | 'warning', isVisible: boolean, isExcess: boolean, missingFields: string[] } | null => {
      if (!isSurveyorGuardActive || m.type === 'subtotal') return null;
      
      const targetRank = getRank(article.unit);
      if (targetRank === 0) return null; 

      const isCurrentlyFocused = focusedRowId === m.id;
      const hasAnyLocalData = (m.description || (m.length !== undefined && m.length !== 0) || (m.width !== undefined && m.width !== 0) || (m.height !== undefined && m.height !== 0) || (m.multiplier !== undefined && m.multiplier !== 0));
      
      let sourceRank = 0;
      if (m.linkedArticleId) {
          const src = allArticles.find(a => a.id === m.linkedArticleId);
          if (src) sourceRank = getRank(src.unit);
      }

      const localFields = ['length', 'width', 'height'];
      const possibleLocalFields = localFields.slice(sourceRank, 3);
      const filledLocalFields = possibleLocalFields.filter(f => (m as any)[f] !== undefined && (m as any)[f] !== 0 && (m as any)[f] !== null);
      
      const totalEffectiveDims = sourceRank + filledLocalFields.length;

      if (totalEffectiveDims > targetRank) {
          return { 
              msg: `COERENZA: Rilevate ${totalEffectiveDims} dimensioni. Per ${article.unit} ne bastano ${targetRank}.`, 
              severity: 'error', 
              isVisible: true,
              isExcess: true,
              missingFields: []
          };
      }
      
      const isLinked = !!m.linkedArticleId;
      const isMissing = totalEffectiveDims < targetRank;
      const isVisibleWarning = isMissing && (isLinked || (!isCurrentlyFocused && hasAnyLocalData && touchedRowIds.has(m.id)));
      
      if (isMissing) {
          const missing = possibleLocalFields.filter(f => !filledLocalFields.includes(f));
          return { 
              msg: `CONTABILITÀ: Mancano ${targetRank - totalEffectiveDims} dimensioni per soddisfare l'unità ${article.unit}.`, 
              severity: 'warning', 
              isVisible: isVisibleWarning,
              isExcess: false,
              missingFields: missing
          };
      }

      return null;
   };

   const getInheritedFields = (m: Measurement): string[] => {
       if (!m.linkedArticleId) return [];
       const src = allArticles.find(a => a.id === m.linkedArticleId);
       if (!src) return [];
       const sourceRank = getRank(src.unit);
       const fields = [];
       if (sourceRank >= 1) fields.push('length');
       if (sourceRank >= 2) fields.push('width');
       if (sourceRank >= 3) fields.push('height');
       return fields;
   };

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
               setActiveAutomationRowId(null); 
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
                    }, 500); 
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

   const handleMeasKeyDown = (e: React.KeyboardEvent, mId: string, currentField: string, isLastRow: boolean) => {
      const fieldList = ['description', 'multiplier', 'length', 'width', 'height'];
      const fieldIdx = fieldList.indexOf(currentField);
      const rowIdx = article.measurements.findIndex(m => m.id === mId);

      if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (isVoiceActive) {
             handleVoiceCommand('next');
          } else {
            if (fieldIdx < fieldList.length - 1) {
                const nextField = fieldList[fieldIdx + 1];
                const target = document.querySelector(`[data-m-id="${mId}"][data-field="${nextField}"]`) as HTMLElement;
                if (target) { target.focus(); playUISound('move'); }
            } else if (isLastRow && currentField === 'height') {
                onAddMeasurement(article.id);
                playUISound('newline');
            }
          }
          return;
      } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (isVoiceActive) {
             handleVoiceCommand('prev');
          } else {
            if (fieldIdx > 0) {
                const prevField = fieldList[fieldIdx - 1];
                const target = document.querySelector(`[data-m-id="${mId}"][data-field="${prevField}"]`) as HTMLElement;
                if (target) { target.focus(); playUISound('move'); }
            }
          }
          return;
      }
      else if (e.key === 'ArrowDown') {
          e.preventDefault(); 
          if (rowIdx < article.measurements.length - 1) {
              const nextRowId = article.measurements[rowIdx + 1].id;
              const target = document.querySelector(`[data-m-id="${nextRowId}"][data-field="${currentField}"]`) as HTMLElement;
              if (target) { target.focus(); playUISound('move'); }
          }
      } else if (e.key === 'ArrowUp') {
          e.preventDefault(); 
          if (rowIdx > 0) {
              const prevRowId = article.measurements[rowIdx - 1].id;
              const target = document.querySelector(`[data-m-id="${prevRowId}"][data-field="${currentField}"]`) as HTMLElement;
              if (target) { target.focus(); playUISound('move'); }
          }
      }

      if (e.key === 'Enter' && isLastRow && currentField === 'height') {
          e.preventDefault();
          onAddMeasurement(article.id);
          playUISound('newline');
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
                    val = calculateRowValueWithContext(m, article.unit, baseVal, linkedArt.unit);
                }
            } else {
                val = calculateRowValueWithContext(m, article.unit);
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
      const isInternal = e.dataTransfer.types.includes(MIME_ARTICLE);
      const isExternalText = e.dataTransfer.types.includes('text/plain');
      const isAnalysisDrag = e.dataTransfer.types.includes(MIME_ANALYSIS_DRAG);
      
      if (isInternal || isExternalText || isAnalysisDrag) {
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
      const isAnalysisDrag = e.dataTransfer.types.includes(MIME_ANALYSIS_DRAG);

      if (isInternal && articleId) {
          onArticleDrop(e, article.id, articleDropPosition || 'bottom');
      } else if (isAnalysisDrag) {
          // Handled by Workspace drop
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

   const handleFocusRow = (mId: string) => {
       setFocusedRowId(mId);
       setTouchedRowIds(prev => new Set(prev).add(mId));
   };

   const numFontSize = 13.5; 
   const descFontSize = 15.5; 

   return (
      <tbody 
        ref={tbodyRef}
        id={`article-${article.id}`} 
        className={`bg-white border-b border-gray-400 group/article transition-all relative ${isArticleLocked ? 'bg-gray-50/50' : ''} ${isArticleDragOver ? 'ring-2 ring-blue-500 ring-inset shadow-[0_0_25px_rgba(59,130,246,0.3)]' : ''} ${lastMovedItemId === article.id ? 'highlight-move' : ''}`}
        onDragOver={handleTbodyDragOver}
        onDragLeave={handleTbodyDragLeave}
        onDrop={handleTbodyDrop}
      >
         {isArticleDragOver && articleDropPosition === 'top' && (
             <tr className="h-0 p-0 border-none"><td colSpan={11} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-blue-500 -top-0.5 z-50 shadow-[0_0_15px_rgba(59,130,246,0.8)] pointer-events-none animate-pulse"></div></td></tr>
         )}
         <tr 
            className={`align-top ${!isPrintMode ? 'cursor-pointer hover:bg-slate-50' : ''} ${isArticleDragOver ? 'bg-blue-50/20' : ''} ${isIndustrialMode ? 'bg-slate-100 border-l-4 border-indigo-600 shadow-sm' : ''} transition-all duration-300`}
            draggable={!isPrintMode && !areControlsDisabled}
            onDragStart={handleArticleHeaderDragStart}
            onDragEnd={handleArticleHeaderDragEnd}
            onClick={handleCycleLocal}
         >
            <td className={`text-center py-2 text-xs font-bold border-r border-gray-200 select-none font-mono ${isIndustrialMode ? 'text-indigo-400 bg-slate-100/50' : 'text-gray-500 bg-white'}`}>{hierarchicalNumber}</td>
            <td className={`p-1 border-r border-gray-200 align-top ${isIndustrialMode ? 'bg-slate-100/50' : 'bg-white'}`} style={{ width: projectSettings.tariffColumnWidth ? `${projectSettings.tariffColumnWidth}px` : '135px' }}>
               <div className="flex flex-col relative">
                <textarea 
                    readOnly
                    value={article.code}
                    className={`font-mono font-bold text-xs w-full bg-transparent border-none px-1 resize-y overflow-hidden leading-tight disabled:text-gray-400 cursor-default focus:ring-0 ${isAnalysisLinked ? 'text-purple-700' : ''} ${isArticleLocked ? 'text-gray-400' : ''} ${isIndustrialMode ? 'text-indigo-800' : ''}`}
                    rows={isIndustrialMode ? 1 : 2}
                    placeholder="Codice"
                    disabled={true}
                />
                {isAnalysisLinked && !isPrintMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); article.linkedAnalysisId && onViewAnalysis(article.linkedAnalysisId); }}
                    className="absolute right-0 top-0 text-purple-600 hover:text-purple-800 hover:bg-purple-50 p-1 rounded transition-colors z-10"
                    title="Apri Analisi Prezzo"
                  >
                    <TestTubes className="w-3.5 h-3.5" />
                  </button>
                )}
                {(individualDisplayMode > 0 || article.priceListSource) && !isIndustrialMode && (
                   <div className="text-[9px] text-gray-400 px-1 mt-1 leading-tight truncate max-w-full" title={article.priceListSource}>{article.priceListSource || 'Prezzario N/D'}</div>
                )}
                {!isIndustrialMode && article.soaCategory && (
                    <div className="text-[9px] text-gray-400 px-1 italic leading-tight" title={`Categoria SOA: ${article.soaCategory}`}>
                        ({article.soaCategory})
                    </div>
                )}
               </div>
            </td>
            <td className={`p-1 border-r border-gray-200 ${isIndustrialMode ? 'bg-slate-100/50' : 'bg-white'}`}>
               {isPrintMode || isConciseMode || isIndustrialMode ? (
                 <p className={`leading-relaxed font-serif text-justify px-0.5 whitespace-pre-wrap ${isIndustrialMode ? 'line-clamp-1 italic font-bold text-slate-600' : isConciseMode ? 'line-clamp-2' : ''} ${!isIndustrialMode && isSafetyCategory ? 'text-orange-600' : !isIndustrialMode ? 'text-blue-700' : ''}`} style={{ fontSize: `${descFontSize}px` }}>{article.description}{isIndustrialMode ? ' ...' : ''}</p>
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
               {/* Grounding Citations as required by guidelines for Search tool usage */}
               {article.groundingUrls && article.groundingUrls.length > 0 && (
                 <div className="mt-2 px-1 border-t border-gray-100 pt-1">
                   <div className="flex items-center gap-1.5 text-[8px] font-bold text-blue-600 uppercase tracking-tight mb-1">
                     <Search className="w-2.5 h-2.5" /> Fonti consultate:
                   </div>
                   <div className="flex wrap gap-1.5">
                     {article.groundingUrls.map((chunk: any, i: number) => {
                       const source = chunk.web || chunk.maps;
                       if (!source) return null;
                       return (
                         <a 
                           key={i} 
                           href={source.uri} 
                           target="_blank" 
                           rel="noopener noreferrer"
                           className="inline-flex items-center gap-1 px-1 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 hover:bg-blue-100 transition-colors text-[8px] font-medium max-w-[150px]"
                         >
                           <ExternalLink className="w-2 h-2 flex-shrink-0" />
                           <span className="truncate">{source.title || 'Link'}</span>
                         </a>
                       );
                     })}
                   </div>
                 </div>
               )}
            </td>
            <td className={`border-r border-gray-200 ${isIndustrialMode ? 'bg-slate-100/50' : 'bg-white'} p-1 text-center align-top`}>
                {!isPrintMode && !isCategoryLocked && (
                   <div className="flex flex-col items-center gap-1 mt-1">
                      <button onClick={(e) => { e.stopPropagation(); onToggleArticleLock(article.id); }} className={`transition-colors p-0.5 rounded ${isArticleLocked ? 'text-red-500 hover:text-red-700 bg-red-50' : 'text-gray-400 hover:text-blue-50'}`} title={isArticleLocked ? "Sblocca Voce" : "Blocca Voce (Lavoro Fatto)"}>
                          {isArticleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                      {!isArticleLocked && individualDisplayMode === 0 && (
                          <div className="opacity-0 group-hover/article:opacity-100 transition-opacity flex flex-col items-center gap-1">
                            <button onClick={(e) => { e.stopPropagation(); onEditArticleDetails(article); }} className="text-gray-400 hover:text-blue-600 transition-colors p-0.5" title="Modifica Dettagli"><PenLine className="w-3.5 h-3.5" /></button>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteArticle(article.id); }} className="text-gray-400 hover:text-red-600 transition-colors p-0.5" title="Elimina Voce"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                      )}
                   </div>
                )}
            </td>
            <td colSpan={7} className={`${isIndustrialMode ? 'bg-slate-100/30 border-r border-slate-200' : 'bg-white border-r border-gray-200'}`}></td>
         </tr>
         {!isArticleLocked && !isIndustrialMode && (
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
                const guard = getSurveyorWarning(m);
                const isError = guard?.severity === 'error';
                const isLastMeasRow = idx === processedMeasurements.length - 1;
                
                const inheritedFields = getInheritedFields(m);
                const missingFields = guard?.isVisible ? guard.missingFields : [];
                const isDeduction = m.type === 'deduction';

                return (
                <tr key={m.id} draggable={!isPrintMode && !areControlsDisabled} onDragStart={(e) => handleMeasDragStart(e, idx)} onDragOver={(e) => handleMeasDragOver(e, m.id)} onDragLeave={() => setMeasurementDragOverId(null)} onDrop={(e) => handleMeasDrop(e, idx)} className={`group/row cursor-default transition-all ${isSubtotal ? 'bg-yellow-50 font-bold' : ''} ${measurementDragOverId === m.id ? 'border-t-2 border-dashed border-green-500 bg-green-50' : (isSubtotal ? 'bg-yellow-50' : 'bg-white')} ${isArticleLocked ? 'opacity-70' : ''}`} style={{ fontSize: `${numFontSize}px` }}>
                    <td className="border-r border-gray-200"></td>
                    <td className="p-0 border-r border-gray-200 bg-gray-50/30 text-center relative align-middle">
                        {!isPrintMode && !areControlsDisabled && (
                            <div className="flex justify-center items-center gap-1.5 opacity-0 group-hover/row:opacity-100 transition-opacity px-1 h-full py-1.5">
                                {!isSubtotal ? (
                                    <>
                                        <button onClick={() => onOpenLinkModal(article.id, m.id)} className={`rounded p-0.5 transition-colors ${m.linkedArticleId ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-300 hover:text-blue-600 hover:bg-blue-50'}`} title={m.linkedArticleId ? "Modifica Collegamento" : "Vedi Voce (Collega)"}><LinkIcon className="w-4 h-4" /></button>
                                        <button onClick={() => onToggleDeduction(article.id, m.id)} className={`transition-colors p-0.5 rounded ${m.type === 'positive' ? 'text-red-400 hover:text-red-600 hover:bg-red-50' : 'text-blue-400 hover:text-blue-600 hover:bg-blue-50'}`} title={m.type === 'positive' ? "Trasforma in Deduzione" : "Trasforma in Positivo"}>{m.type === 'positive' ? <MinusCircle className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}</button>
                                    </>
                                ) : null}
                                <button onClick={() => onDeleteMeasurement(article.id, m.id)} className="text-gray-300 hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-colors" title="Elimina Rigo"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        )}
                    </td>
                    <td className="pl-3 pr-1 py-1 border-r border-gray-200 relative flex items-center gap-2">
                        {isSubtotal ? <div className="italic text-gray-600 text-right pr-2 w-full font-black">Sommano parziale</div> : (
                            <>
                                <div className="absolute left-0 top-1/2 w-4 h-[1px] bg-gray-300"></div>
                                {m.linkedArticleId && linkedArt ? (
                                <div className="flex items-center space-x-2">
                                    <button onClick={() => onScrollToArticle(linkedArt.id, article.id)} className="flex items-center space-x-1 px-1 py-0.5 rounded hover:bg-blue-50 group/link transition-colors text-left">
                                        <span className={`font-bold hover:underline cursor-pointer ${isDeduction ? 'text-red-600' : 'text-blue-600'}`} style={{ fontSize: `${numFontSize - 1}px` }}>
                                            {isDeduction && <span className="text-red-600 font-black mr-1">A dedurre: </span>}
                                            Vedi voce n. {getLinkedArticleNumber(linkedArt)}
                                        </span>
                                        <span className="text-gray-500" style={{ fontSize: `${numFontSize - 2}px` }}>
                                            ({m.linkedType === 'amount' ? formatCurrency(linkedArt.quantity * linkedArt.unitPrice) : `${formatResult(linkedArt.quantity)} ${linkedArt.unit}`})
                                        </span>
                                        <LinkIcon className={`w-4 h-4 opacity-0 group-hover/link:opacity-100 transition-opacity ${isDeduction ? 'text-red-400' : 'text-blue-400'}`} />
                                    </button>
                                    </div>
                                ) : (
                                    isPrintMode ? <div className={`truncate ${isDeduction ? 'italic text-red-600 font-bold' : 'text-gray-800'}`}>{m.description}</div> : (
                                        <div className="flex-1 flex items-center gap-2 relative">
                                            <input 
                                            value={m.description} 
                                            data-m-id={m.id}
                                            data-field="description"
                                            autoFocus={m.id === lastAddedMeasurementId} 
                                            onFocus={() => { onColumnFocus('desc'); syncAutomationPoint(m.id, 'description'); handleFocusRow(m.id); }} 
                                            onBlur={() => { onColumnFocus(null); setFocusedRowId(null); }} 
                                            onChange={(e) => onUpdateMeasurement(article.id, m.id, 'description', e.target.value)} 
                                            onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'description', isLastMeasRow)}
                                            className={`w-full bg-transparent border-none p-0 focus:ring-0 ${isDeduction ? 'text-red-600 font-bold placeholder-red-300' : 'text-gray-800 placeholder-gray-300'} disabled:cursor-not-allowed ${recordingMeasId === m.id || (isVoiceFocused && activeAutomationFieldIndex === 0) ? 'recording-feedback bg-purple-50 ring-2 ring-purple-600' : ''}`} 
                                            style={{ fontSize: `${numFontSize}px` }} 
                                            placeholder={isDeduction ? "A dedurre..." : "Descrizione misura..."} 
                                            disabled={areControlsDisabled}
                                            onMouseDown={() => handleLongPressStart(m.id)}
                                            onMouseUp={handleLongPressEnd}
                                            onMouseLeave={handleLongPressEnd}
                                            onTouchStart={() => handleLongPressStart(m.id)}
                                            onTouchEnd={handleLongPressEnd}
                                            />
                                        </div>
                                    )
                                )}
                                {guard && guard.isVisible && (
                                    <div className="group/warning relative flex-shrink-0 ml-auto">
                                        <HelpCircle className={`w-3.5 h-3.5 ${isError ? 'text-red-600' : 'text-amber-500'} animate-pulse cursor-help`} />
                                        <div className="absolute bottom-full mb-2 right-0 w-72 bg-slate-900 text-white text-[10px] p-3 rounded-xl shadow-2xl opacity-0 group-hover/warning:opacity-100 pointer-events-none transition-all z-[9999] border border-white/10 ring-1 ring-black">
                                            <span className={`font-black uppercase block mb-1 tracking-widest ${isError ? 'text-red-400' : 'text-amber-400'}`}>
                                                {isError ? 'Errore Coerenza' : 'Supporto Coerenza'}
                                            </span>
                                            {guard.msg}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </td>
                    <td className={`border-r border-gray-200 p-0 transition-colors ${isVoiceFocused && activeAutomationRowId === m.id && activeAutomationFieldIndex === 1 ? 'bg-purple-100 ring-2 ring-purple-600 shadow-lg' : 'bg-gray-50'}`}>
                        {!isPrintMode && !isSubtotal ? <input type="number" data-m-id={m.id} data-field="multiplier" disabled={areControlsDisabled} onFocus={() => { onColumnFocus('mult'); syncAutomationPoint(m.id, 'multiplier'); handleFocusRow(m.id); }} onBlur={() => { onColumnFocus(null); setFocusedRowId(null); }} onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'multiplier', isLastMeasRow)} className={`w-full text-center bg-transparent border-none text-xs focus:bg-white placeholder-gray-300 disabled:cursor-not-allowed h-full ${isVoiceFocused && activeAutomationFieldIndex === 1 ? 'font-black text-purple-900' : ''} ${isDeduction ? 'text-red-600 font-black' : ''}`} style={{ fontSize: `${numFontSize}px` }} value={m.multiplier === undefined ? '' : m.multiplier} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'multiplier', e.target.value === '' ? undefined : parseFloat(e.target.value))} /> : (m.multiplier && <div className={`text-center ${isDeduction ? 'text-red-600 font-black' : ''}`}>{m.multiplier}</div>)}
                    </td>
                    <td className={`border-r border-gray-200 p-0 transition-all duration-300 relative 
                        ${isVoiceFocused && activeAutomationRowId === m.id && activeAutomationFieldIndex === 2 ? 'bg-purple-100 ring-2 ring-purple-600 shadow-lg' : 
                          (inheritedFields.includes('length') ? 'bg-slate-100' : 
                          (isSurveyorGuardActive && guard?.isVisible && guard?.isExcess ? 'excess-cell' : 
                          (missingFields.includes('length') ? 'missing-field-glow' : 'bg-gray-50')))}`}>
                        {isSubtotal ? <div className="text-center text-gray-300">-</div> : (
                             !isPrintMode ? <input type="number" data-m-id={m.id} data-field="length" 
                                disabled={areControlsDisabled || inheritedFields.includes('length')} 
                                onFocus={() => { onColumnFocus('len'); syncAutomationPoint(m.id, 'length'); handleFocusRow(m.id); }} 
                                onBlur={() => { onColumnFocus(null); setFocusedRowId(null); }} 
                                onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'length', isLastMeasRow)} 
                                className={`w-full text-center bg-transparent border-none text-xs focus:bg-white disabled:cursor-not-allowed h-full 
                                    ${isVoiceFocused && activeAutomationFieldIndex === 2 ? 'font-black text-purple-900' : ''} 
                                    ${isSurveyorGuardActive && guard?.isVisible && guard?.isExcess && m.length ? 'excess-error' : ''}
                                    ${inheritedFields.includes('length') ? 'text-slate-400 italic font-bold' : ''}
                                    ${missingFields.includes('length') ? 'placeholder:text-blue-300 font-black' : ''}
                                    ${isDeduction ? 'text-red-600 font-black' : ''}`} 
                                style={{ fontSize: `${numFontSize}px` }} 
                                placeholder={missingFields.includes('length') ? "!" : ""}
                                value={m.length === undefined ? '' : m.length} 
                                onChange={(e) => onUpdateMeasurement(article.id, m.id, 'length', e.target.value === '' ? undefined : parseFloat(e.target.value))} 
                             /> : <div className={`text-center ${isDeduction ? 'text-red-600 font-black' : ''}`}>{formatResult(m.length)}</div>
                        )}
                    </td>
                    <td className={`border-r border-gray-200 p-0 transition-all duration-300 relative 
                        ${isVoiceFocused && activeAutomationRowId === m.id && activeAutomationFieldIndex === 3 ? 'bg-purple-100 ring-2 ring-purple-600 shadow-lg' : 
                          (inheritedFields.includes('width') ? 'bg-slate-100' : 
                          (isSurveyorGuardActive && guard?.isVisible && guard?.isExcess ? 'excess-cell' : 
                          (missingFields.includes('width') ? 'missing-field-glow' : 'bg-gray-50')))}`}>
                        {isSubtotal ? <div className="text-center text-gray-300">-</div> : (
                             !isPrintMode ? <input type="number" data-m-id={m.id} data-field="width" 
                                disabled={areControlsDisabled || inheritedFields.includes('width')} 
                                onFocus={() => { onColumnFocus('wid'); syncAutomationPoint(m.id, 'width'); handleFocusRow(m.id); }} 
                                onBlur={() => { onColumnFocus(null); setFocusedRowId(null); }} 
                                onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'width', isLastMeasRow)} 
                                className={`w-full text-center bg-transparent border-none text-xs focus:bg-white disabled:cursor-not-allowed h-full 
                                    ${isVoiceFocused && activeAutomationFieldIndex === 3 ? 'font-black text-purple-900' : ''} 
                                    ${isSurveyorGuardActive && guard?.isVisible && guard?.isExcess && m.width ? 'excess-error' : ''}
                                    ${inheritedFields.includes('width') ? 'text-slate-400 italic font-bold' : ''}
                                    ${missingFields.includes('width') ? 'placeholder:text-blue-300 font-black' : ''}
                                    ${isDeduction ? 'text-red-600 font-black' : ''}`} 
                                style={{ fontSize: `${numFontSize}px` }} 
                                placeholder={missingFields.includes('width') ? "!" : ""}
                                value={m.width === undefined ? '' : m.width} 
                                onChange={(e) => onUpdateMeasurement(article.id, m.id, 'width', e.target.value === '' ? undefined : parseFloat(e.target.value))} 
                             /> : <div className={`text-center ${isDeduction ? 'text-red-600 font-black' : ''}`}>{formatResult(m.width)}</div>
                        )}
                    </td>
                    <td className={`border-r border-gray-200 p-0 transition-all duration-300 relative 
                        ${isVoiceFocused && activeAutomationRowId === m.id && activeAutomationFieldIndex === 4 ? 'bg-purple-100 ring-2 ring-purple-600 shadow-lg' : 
                          (inheritedFields.includes('height') ? 'bg-slate-100' : 
                          (isSurveyorGuardActive && guard?.isVisible && guard?.isExcess ? 'excess-cell' : 
                          (missingFields.includes('height') ? 'missing-field-glow' : 'bg-gray-50')))}`}>
                        {isSubtotal ? <div className="text-center text-gray-300">-</div> : (
                             !isPrintMode ? (
                                    <div className="h-full w-full relative">
                                        <input type="number" data-m-id={m.id} data-field="height" data-last-meas-field="true" 
                                            disabled={areControlsDisabled || inheritedFields.includes('height')} 
                                            onFocus={() => { onColumnFocus('h'); syncAutomationPoint(m.id, 'height'); handleFocusRow(m.id); }} 
                                            onBlur={() => { onColumnFocus(null); setFocusedRowId(null); }} 
                                            onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'height', isLastMeasRow)} 
                                            className={`w-full text-center bg-transparent border-none text-xs focus:bg-white disabled:cursor-not-allowed h-full 
                                                ${isVoiceFocused && activeAutomationFieldIndex === 4 ? 'font-black text-purple-900' : ''} 
                                                ${isSurveyorGuardActive && guard?.isVisible && guard?.isExcess && m.height ? 'excess-error' : ''}
                                                ${inheritedFields.includes('height') ? 'text-slate-400 italic font-bold' : ''}
                                                ${missingFields.includes('height') ? 'placeholder:text-blue-300 font-black' : ''}
                                                ${isDeduction ? 'text-red-600 font-black' : ''}`} 
                                            style={{ fontSize: `${numFontSize}px` }} 
                                            placeholder={missingFields.includes('height') ? "!" : ""}
                                            value={m.height === undefined ? '' : m.height} 
                                            onChange={(e) => onUpdateMeasurement(article.id, m.id, 'height', e.target.value === '' ? undefined : parseFloat(e.target.value))} 
                                        />
                                    </div>
                                ) : <div className={`text-center ${isDeduction ? 'text-red-600 font-black' : ''}`}>{formatResult(m.height)}</div>
                        )}
                    </td>
                    <td className={`border-r border-gray-200 text-right font-mono pr-1 ${isSubtotal ? 'bg-yellow-100 text-black border-t border-b border-gray-400 font-black' : 'bg-white'} ${m.linkedArticleId ? 'font-bold' : ''} ${isDeduction ? 'text-red-600 font-black' : 'text-gray-600'}`} style={{ fontSize: `${numFontSize}px` }}>{formatResult(m.displayValue)}</td>
                    <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                </tr>
                );})}
           </>
         )}

         <tr className={`font-bold text-xs border-t transition-all duration-300 ${isIndustrialMode ? 'bg-slate-100 border-b-2 border-slate-200 text-slate-900' : 'bg-white border-gray-300 shadow-inner'}`}>
             <td className={`border-r ${isIndustrialMode ? 'border-slate-200 bg-slate-100/50' : 'border-gray-300 bg-white'}`}></td><td className={`border-r ${isIndustrialMode ? 'border-slate-200 bg-slate-100/50' : 'border-gray-200 bg-white'}`} style={{ width: projectSettings.tariffColumnWidth ? `${projectSettings.tariffColumnWidth}px` : '135px' }}></td>
             <td className={`px-2 py-3 text-left border-r flex items-center gap-3 ${isIndustrialMode ? 'border-slate-200' : 'border-gray-300'}`}>
                {!isPrintMode && !isIndustrialMode && !isArticleLocked && (
                   <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button ref={addBtnRef} onClick={(e) => { e.stopPropagation(); onAddMeasurement(article.id); }} className="w-6 h-6 rounded-full flex items-center justify-center text-blue-600 hover:text-white hover:bg-blue-600 transition-all border border-blue-200 hover:border-blue-600 shadow-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" title="Aggiungi rigo misura"><Plus className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); onAddSubtotal(article.id); }} className="w-6 h-6 rounded-full flex items-center justify-center text-orange-400 hover:text-white hover:bg-orange-500 transition-all border border-orange-200 hover:border-orange-500 shadow-sm" title="Inserisci Sommano Parziale"><Sigma className="w-3.5 h-3.5" /></button>
                        
                        <div className="group/help relative ml-2">
                             <HelpCircle className="w-3.5 h-3.5 text-orange-300 cursor-help hover:text-orange-500" />
                             <div className="absolute bottom-full left-0 mb-4 w-72 bg-slate-900 text-white p-5 rounded-3xl shadow-2xl opacity-0 group-hover/help:opacity-100 pointer-events-none transition-all z-[9999] border border-white/10 ring-1 ring-black">
                                <h4 className="font-black uppercase text-[10px] tracking-widest text-orange-400 mb-3 flex items-center gap-2"><Layers className="w-4 h-4" /> Comandi di Rigo</h4>
                                <div className="space-y-3">
                                    <p className="text-[10px] leading-relaxed"><span className="text-white font-black">(+) AGGIUNGI:</span> Inserisce un nuovo rigo misura vuoto alla fine dell'elenco.</p>
                                    <p className="text-[10px] leading-relaxed"><span className="text-white font-black">(Σ) PARZIALE:</span> Inserisce un divisore logico che somma tutti i righi precedenti fino al parziale precedente o all'inizio.</p>
                                    <p className="text-[10px] border-t border-white/5 pt-2 italic text-slate-400">Patto d'Acciaio: Ogni nuova voce nasce espansa per facilitare l'inserimento immediato dei dati.</p>
                                </div>
                             </div>
                        </div>
                   </div>
                )}
                <span className={`uppercase text-[10px] ml-auto font-black italic tracking-widest ${isIndustrialMode ? 'text-indigo-600' : 'text-gray-400'}`}>Sommano {isPrintMode ? article.unit : <input readOnly value={article.unit} className="w-8 bg-transparent border-b border-dotted border-gray-400 text-center outline-none inline-block disabled:cursor-not-allowed cursor-default font-black" disabled={true} />}</span>
             </td>
             <td className={`border-r ${isIndustrialMode ? 'border-slate-200' : 'border-gray-300'}`}></td><td className={`border-r ${isIndustrialMode ? 'border-slate-200' : 'border-gray-300'}`}></td><td className={`border-r ${isIndustrialMode ? 'border-slate-200' : 'border-gray-300'}`}></td><td className={`border-r ${isIndustrialMode ? 'border-slate-200' : 'border-gray-300'}`}></td>
             <td className={`text-right pr-1 font-mono border-r font-black ${isIndustrialMode ? 'bg-slate-100/50 border-slate-200' : 'bg-gray-50 border-gray-200'}`}>{formatResult(article.quantity)}</td>
             <td className={`border-l border-r text-right pr-1 font-mono ${isIndustrialMode ? 'border-slate-200' : 'border-gray-300'}`}>{isPrintMode ? formatResult(article.unitPrice) : <input readOnly type="number" value={article.unitPrice} className="w-full text-right bg-transparent border-none focus:ring-0 disabled:cursor-not-allowed cursor-default font-black" disabled={true} />}</td>
             <td className={`border-r text-right pr-1 font-mono font-black ${isIndustrialMode ? 'text-indigo-700 border-slate-200' : 'text-blue-900 border-gray-300'}`} style={{ fontSize: `${numFontSize}px` }}>{formatResult(totalAmount)}</td>
             <td className={`border-r text-right pr-1 font-mono text-gray-500 font-normal ${isIndustrialMode ? 'border-slate-200' : 'border-gray-200'}`}>
                 <div className="flex flex-col items-end leading-none py-1"><span>{formatCurrency(laborValue)}</span><span className="text-[9px] text-gray-400">({article.laborRate}%)</span></div>
             </td>
         </tr>
         <tr className="h-6 bg-transparent border-none"><td colSpan={11} className="border-none"></td></tr>
         {isArticleDragOver && articleDropPosition === 'bottom' && (
             <tr className="h-0 p-0 border-none"><td colSpan={11} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-blue-500 top-0 z-50 shadow-[0_0_15px_rgba(59,130,246,0.8)] pointer-events-none animate-pulse"></div></td></tr>
         )}
      </tbody>
   );
};

type ViewMode = 'COMPUTO' | 'SICUREZZA' | 'ANALISI' | 'SUMMARY' | 'CRONOPROGRAMMA'; 
interface Snapshot { articles: Article[]; categories: Category[]; analyses: PriceAnalysis[]; }

const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | 'visitor' | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [isWorkspaceDragOver, setIsWorkspaceDragOver] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false); 
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 50 }); 
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [returnPath, setReturnPath] = useState<string | null>(null); 
  const dragOffset = useRef({ x: 0, y: 0 });
  const [isRebarModalOpen, setIsRebarModalOpen] = useState(false);
  const [rebarTargetArticleId, setRebarTargetArticleId] = useState<string | null>(null);
  const [isPaintingModalOpen, setIsPaintingModalOpen] = useState(false);
  const [paintingTargetArticleId, setPaintingTargetArticleId] = useState<string | null>(null);
  const [voiceAutomationActiveId, setVoiceAutomationActiveId] = useState<string | null>(null);
  const [smartRepeatActiveId, setSmartRepeatActiveId] = useState<string | null>(null);
  const [wbsDisplayMode, setWbsDisplayMode] = useState(0);
  const [isSurveyorGuardActive, setIsSurveyorGuardActive] = useState(true); 
  const [collapsedSuperCodes, setCollapsedSuperCodes] = useState<Set<string>>(new Set());
  const [creatingForcedIsSuper, setCreatingForcedIsSuper] = useState<boolean | undefined>(undefined);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeCategoryForAi, setActiveCategoryForAi] = useState<string | null>(null);
  const [draggedAnalysisId, setDraggedAnalysisId] = useState<string | null>(null);
  const [isDraggingAnalysis, setIsDraggingAnalysis] = useState(false);
  const [analysisDragOverId, setAnalysisDragOverId] = useState<string | null>(null);
  const [analysisDropPosition, setAnalysisDropPosition] = useState<'top' | 'bottom' | null>(null);
  const [activeWbsContext, setActiveWbsContext] = useState<'work' | 'safety'>('work');

  const [lastMovedItemId, setLastMovedItemId] = useState<string | null>(null);

  // Stato per gli offset del cronoprogramma (giorno di inizio per ogni WBS)
  const [scheduleOffsets, setScheduleOffsets] = useState<Record<string, number>>({});
  // Stato per la composizione delle squadre per ogni WBS (default: 2)
  const [teamSizes, setTeamSizes] = useState<Record<string, number>>({});

  const sidebarRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => { 
        setUser(firebaseUser as FirebaseUser);
        setAuthLoading(false); 
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || user === 'visitor' || !db || !auth) return;
    
    // 1. Recupero l'ID di questo computer dal localStorage
    let idDispositivo = localStorage.getItem('unique_device_id');
    
    // 2. Se è la prima volta che usa questo PC, creo un ID e lo salvo per sempre
    if (!idDispositivo) {
      idDispositivo = Math.random().toString(36).substring(2) + Date.now();
      localStorage.setItem('unique_device_id', idDispositivo);
    }

    const userSessionRef = ref(db, `sessions/${user.uid}`);
    let isMounted = true;
    
    // 3. Comunico a Firebase che questo PC è quello "attivo"
    set(userSessionRef, { 
      sessionId: idDispositivo, 
      lastLogin: new Date().toISOString(), 
      device: navigator.userAgent, 
      platform: navigator.platform 
    }).catch(err => console.error("Session Write Failed:", err));

    // 4. SENTINELLA: Controllo se un ALTRO PC entra
    const unsubscribeDb = onValue(userSessionRef, (snapshot) => {
        if (!isMounted) return;
        const data = snapshot.val();
        
        // Se l'ID sul DB è diverso dal mio ID locale, significa che un ALTRO PC è entrato
        if (data && data.sessionId && data.sessionId !== idDispositivo) {
            alert("Questo account è stato effettuato da un altro computer. Questa sessione verrà chiusa.");
            signOut(auth).then(() => {
              window.location.reload();
            }).catch(e => console.error("Logout error", e));
        }
    });
    
    return () => { isMounted = false; off(userSessionRef); unsubscribeDb(); };
  }, [user]);

  useEffect(() => { setToolbarPos({ x: (window.innerWidth / 2) - 100, y: 30 }); }, []);

  const handleVisitorLogin = () => { setUser('visitor'); };
  const handleLogout = async () => { setAuthLoading(true); try { if (user !== 'visitor' && auth) { await signOut(auth); } } catch (err) { console.error("Logout error:", err); } finally { setUser(null); setAuthLoading(false); } };
  const isVisitor = user === 'visitor';

  // --- LOGICA INIZIALIZZAZIONE ID STABILI ---
  const initializedCategories = useMemo(() => {
      return CATEGORIES.map((c, i) => ({
          ...c,
          id: c.id || `cat_init_${i}` // Se manca l'ID nelle costanti, ne generiamo uno basato sulla posizione iniziale
      }));
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>('COMPUTO');
  const [categories, setCategories] = useState<Category[]>(initializedCategories);
  const [articles, setArticles] = useState<Article[]>(INITIAL_ARTICLES);
  const [analyses, setAnalyses] = useState<PriceAnalysis[]>(INITIAL_ANALYSES);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(PROJECT_INFO);
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>(categories[0]?.code || 'WBS.01');
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
  const [activeSoaCategory, setActiveSoaCategory] = useState<string>('OG1');
  const [wbsDropTarget, setWbsDropTarget] = useState<{ code: string, position: 'top' | 'bottom' | 'inside' } | null>(null);
  const [isDraggingArticle, setIsDraggingArticle] = useState(false);
  const [isAnalysisEditorOpen, setIsAnalysisEditorOpen] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState<PriceAnalysis | null>(null);
  const [analysisSearchTerm, setAnalysisSearchTerm] = useState('');
  const [isImportAnalysisModalOpen, setIsImportAnalysisModalOpen] = useState(false);
  const [wbsOptionsContext, setWbsOptionsContext] = useState<{ type: 'import' | 'clone', sourceCode?: string, payload?: any, initialName?: string, targetCode?: string, position?: 'top' | 'bottom', isSuper?: boolean, proposedColors?: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startScroll = useCallback((speed: number) => {
    if (scrollFrameRef.current) return;
    const scroll = () => {
        if (sidebarRef.current) {
            sidebarRef.current.scrollTop += speed;
            scrollFrameRef.current = requestAnimationFrame(scroll);
        }
    };
    scrollFrameRef.current = requestAnimationFrame(scroll);
  }, []);

  const stopScroll = useCallback(() => {
    if (scrollFrameRef.current) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
    }
  }, []);

  const canAddArticle = useCallback((newCountToAdd: number = 1): boolean => {
    if (!isVisitor) return true;
    const currentTotal = articles.length;
    if (currentTotal + newCountToAdd > 15) {
      alert(`LITE: Limite 15 voci raggiunto.`);
      return false;
    }
    return true;
  }, [isVisitor, articles.length]);

  useEffect(() => { document.title = projectInfo.title ? `${projectInfo.title} - GeCoLa Cloud` : 'GeCoLa - Computo Metrico'; }, [projectInfo.title]);

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
          return `S.${(currentCats.filter(c => c.type === 'safety' && !c.isSuperCategory).length + 1).toString().padStart(2, '0')}`;
      }
      return `WBS.${(currentCats.filter(c => c.type !== 'safety' && !c.isSuperCategory).length + 1).toString().padStart(2, '0')}`;
  };
  
  const renumberCategories = useCallback((cats: Category[], currentArts: Article[]) => {
      const codeMap: Record<string, string> = {};
      const idToCodeMap: Record<string, string> = {};
      let workCount = 0;
      let safetyCount = 0;
      let superCount = 0;
      
      const newCategories = cats.map((cat) => {
          let newCode = cat.code;
          if (cat.isSuperCategory) {
              superCount++;
              newCode = `AREA.${superCount.toString().padStart(2, '0')}`;
          } else if (cat.type === 'safety') {
              safetyCount++;
              newCode = `S.${safetyCount.toString().padStart(2, '0')}`;
          } else {
              workCount++;
              newCode = `WBS.${workCount.toString().padStart(2, '0')}`;
          }
          codeMap[cat.code] = newCode;
          idToCodeMap[cat.id] = newCode;
          return { ...cat, code: newCode };
      });

      const finalCategories = newCategories.map(cat => ({
          ...cat,
          parentId: cat.parentId && codeMap[cat.parentId] ? codeMap[cat.parentId] : cat.parentId
      }));

      const newArticles = currentArts.map(art => {
          if (codeMap[art.categoryCode]) return { ...art, categoryCode: codeMap[art.categoryCode] };
          return art;
      });
      return { newCategories: finalCategories, newArticles, codeMap };
  }, []);

  const renumberAnalyses = (analysesToRenumber: PriceAnalysis[], currentArticles: Article[]) => {
    const codeMap: Record<string, string> = {};
    const newAnalyses = analysesToRenumber.map((an, idx) => {
      const newCode = `AP.${(idx + 1).toString().padStart(2, '0')}`;
      codeMap[an.id] = newCode;
      return { ...an, code: newCode };
    });

    const analysisLookup = new Map(newAnalyses.map(a => [a.id, a]));

    const newArticles = currentArticles.map(art => {
      if (art.linkedAnalysisId && analysisLookup.has(art.linkedAnalysisId)) {
        const matchingAn = analysisLookup.get(art.linkedAnalysisId)!;
        const laborRate = matchingAn.totalBatchValue > 0 ? parseFloat(((matchingAn.totalLabor / matchingAn.totalBatchValue) * 100).toFixed(2)) : 0;
        
        return { 
          ...art, 
          code: matchingAn.code, 
          description: matchingAn.description,
          unit: matchingAn.unit,
          unitPrice: roundTwoDecimals(matchingAn.totalUnitPrice),
          laborRate: laborRate,
          priceListSource: `Da Analisi ${matchingAn.code}` 
        };
      }
      return art;
    });

    return { newAnalyses, newArticles };
  };

  const handleSaveAnalysis = (updatedAnalysis: PriceAnalysis) => {
      const roundedAnalysis = { ...updatedAnalysis, totalUnitPrice: roundTwoDecimals(updatedAnalysis.totalUnitPrice), totalBatchValue: roundTwoDecimals(updatedAnalysis.totalBatchValue) };
      let newAnalyses = [...analyses];
      const index = newAnalyses.findIndex(a => a.id === roundedAnalysis.id);
      if (index !== -1) newAnalyses[index] = roundedAnalysis; else newAnalyses.push(roundedAnalysis);
      
      const { newAnalyses: renumberedAn, newArticles } = renumberAnalyses(newAnalyses, articles);
      updateState(newArticles, categories, renumberedAn);
  };

  const handleDeleteAnalysis = (id: string) => {
      if (window.confirm("Eliminare definitivamente questa analisi?")) {
          const filteredAn = analyses.filter(a => a.id !== id);
          const { newAnalyses: renumberedAn, newArticles } = renumberAnalyses(filteredAn, articles);
          updateState(newArticles, categories, renumberedAn);
      }
  };

  const handleImportAnalysisToArticle = (analysis: PriceAnalysis, targetWbsOverride?: string) => {
      if (!canAddArticle()) return;
      
      // PATTO DI FERRO: Priorità al targetWbsOverride (per il Drag & Drop puntuale)
      const targetCode = targetWbsOverride || activeCategoryForAi || (selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode);
      
      // Fixed: changed matchingAn to analysis
      const laborRate = analysis.totalBatchValue > 0 ? parseFloat(((analysis.totalLabor / analysis.totalBatchValue) * 100).toFixed(2)) : 0;
      const newArticle: Article = {
          id: Math.random().toString(36).substr(2, 9), categoryCode: targetCode, code: analysis.code, description: analysis.description, unit: analysis.unit, unitPrice: roundTwoDecimals(analysis.totalUnitPrice), laborRate: laborRate, linkedAnalysisId: analysis.id, priceListSource: `Da Analisi ${analysis.code}`, soaCategory: activeSoaCategory, measurements: [{ id: Math.random().toString(36).substr(2,9), description: '', type: 'positive', multiplier: undefined }], quantity: 0, displayMode: 0
      };
      updateState([...articles, newArticle], categories, analyses);
      if (viewMode === 'ANALISI') setViewMode('COMPUTO');
      setIsImportAnalysisModalOpen(false); 
  };

  const handleViewLinkedAnalysis = (analysisId: string) => {
      const analysis = analyses.find(a => a.id === analysisId);
      if (analysis) { setEditingAnalysis(analysis); setIsAnalysisEditorOpen(true); } else { alert("Analisi non trovata."); }
  };

  const handleConvertArticleToAnalysis = (article: Article) => {
      const nextAnalysisCode = `AP.${(analyses.length + 1).toString().padStart(2, '0')}`;
      const newAnalysisId = Math.random().toString(36).substr(2, 9);
      const newAnalysis: PriceAnalysis = {
          id: newAnalysisId, code: nextAnalysisCode, description: article.description, unit: article.unit, analysisQuantity: 1, generalExpensesRate: 15, profitRate: 10, totalMaterials: 0, totalLabor: 0, totalEquipment: 0, costoTecnico: 0, valoreSpese: 0, valoreUtile: 0, totalBatchValue: 0, totalUnitPrice: 0, components: [{ id: Math.random().toString(36).substr(2, 9), type: 'general', description: 'Stima a corpo', unit: 'cad', unitPrice: article.unitPrice, quantity: 1 }]
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
          const newArticleId = Math.random().toString(36).substr(2, 9);
          const newArticle: Article = {
              id: newArticleId, categoryCode: targetCode, code: parsed.code || 'NP.001', priceListSource: parsed.priceListSource, description: parsed.description || 'Voce importata', unit: parsed.unit || 'cad', unitPrice: parsed.unitPrice || 0, laborRate: parsed.laborRate || 0, soaCategory: activeSoaCategory, measurements: [{ id: Math.random().toString(36).substr(2,9), description: '', type: 'positive', length: undefined, multiplier: undefined }], quantity: 0, displayMode: 0
          };
          updateState([...articles, newArticle]);
          setLastMovedItemId(newArticleId);
          setTimeout(() => setLastMovedItemId(null), 3000);
      }
  };

  const handleWbsDragStart = (e: React.DragEvent, id: string) => { 
      setDraggedCategoryCode(id); 
      const dummyUrl = 'https://gecola.it/transfer/wbs/' + id;
      e.dataTransfer.setData('text/uri-list', dummyUrl);
      e.dataTransfer.setData('URL', dummyUrl);
      const cat = categories.find(c => c.code === id);
      if (cat) {
          const catArticles = articles.filter(a => a.categoryCode === id);
          const relatedAnalysesIds = new Set(catArticles.map(a => a.linkedAnalysisId).filter(Boolean));
          const relatedAnalyses = analyses.filter(an => relatedAnalysesIds.has(an.id));
          const payload = { type: 'CROSS_TAB_WBS_BUNDLE', category: cat, articles: catArticles, analyses: relatedAnalyses };
          const jsonPayload = JSON.stringify(payload);
          e.dataTransfer.setData('text/plain', jsonPayload);
      }
      e.dataTransfer.setData('wbsCode', id); 
      e.dataTransfer.effectAllowed = 'all'; 
  };

  const handleWbsDragOver = (e: React.DragEvent, targetCode: string) => { 
      e.preventDefault(); 
      e.stopPropagation(); 
      e.dataTransfer.dropEffect = 'copy'; 

      const targetCat = categories.find(c => c.code === targetCode);
      const isExternal = e.dataTransfer.types.includes('text/plain') || 
                         e.dataTransfer.types.includes('text/uri-list') ||
                         e.dataTransfer.types.includes('articleId') ||
                         e.dataTransfer.types.includes(MIME_ANALYSIS_DRAG);
      
      if (isDraggingArticle || isDraggingAnalysis) {
          if (targetCat?.isSuperCategory) { e.dataTransfer.dropEffect = 'none'; setWbsDropTarget(null); return; }
          setWbsDropTarget({ code: targetCode, position: 'inside' });
          return;
      }

      if (draggedCategoryCode || isExternal) {
          if (draggedCategoryCode === targetCode) { setWbsDropTarget(null); return; }
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          
          // PATTO DI FERRO: Logica per la Linea Blu interna ed esterna
          if (targetCat?.isSuperCategory) {
              if (e.clientY < (rect.top + 15)) { 
                  setWbsDropTarget({ code: targetCode, position: 'top' }); 
              } else { 
                  setWbsDropTarget({ code: targetCode, position: 'inside' }); 
              }
          } else {
             // Se è un figlio o una WBS standard
             const midPoint = rect.top + rect.height / 2;
             setWbsDropTarget({ code: targetCode, position: e.clientY < midPoint ? 'top' : 'bottom' });
          }
      }
  };

  const handleWbsDrop = (e: React.DragEvent, targetCode: string | null) => { 
      e.preventDefault(); e.stopPropagation(); 
      const pos = wbsDropTarget?.position || 'bottom';
      setWbsDropTarget(null);

      const analysisId = e.dataTransfer.getData(MIME_ANALYSIS_DRAG);
      if (analysisId && targetCode) {
          const targetCategory = categories.find(c => c.code === targetCode);
          if (targetCategory?.isSuperCategory) {
              setIsDraggingAnalysis(false);
              return;
          }
          const analysis = analyses.find(a => a.id === analysisId);
          if (analysis) {
             // PATTO DI FERRO: Importa nell'attuale targetCode del Drop, non in quello attivo
             handleImportAnalysisToArticle(analysis, targetCode);
             playUISound('confirm');
          }
          setIsDraggingAnalysis(false);
          setDraggedAnalysisId(null);
          return;
      }

      const textData = e.dataTransfer.getData('text/plain');
      if (textData && !draggedCategoryCode) {
          try {
              const payload = JSON.parse(textData);
              if (payload && payload.type === 'CROSS_TAB_WBS_BUNDLE') {
                  setWbsOptionsContext({ 
                      type: 'import', 
                      payload, 
                      initialName: payload.category.name,
                      targetCode: targetCode || undefined,
                      position: pos as any
                  });
                  return;
              }
          } catch (err) {}
      }

      const droppedArticleId = e.dataTransfer.getData('articleId');
      if (droppedArticleId && targetCode) {
          const targetCategory = categories.find(c => c.code === targetCode);
          if (targetCategory?.isSuperCategory) return;
          if (targetCategory?.isLocked) { alert("WBS bloccata."); return; }
          const article = articles.find(a => a.id === droppedArticleId);
          if (!article) return;
          if (article.categoryCode === targetCode) return;
          
          let updatedArticles;
          if (e.ctrlKey) {
              const newId = Math.random().toString(36).substr(2, 9);
              const newArticle: Article = { ...article, id: newId, categoryCode: targetCode, measurements: article.measurements.map(m => ({ ...m, id: Math.random().toString(36).substr(2, 9) })) };
              updatedArticles = [...articles, newArticle];
              setLastMovedItemId(newId);
          } else {
              updatedArticles = articles.map(a => a.id === droppedArticleId ? { ...a, categoryCode: targetCode } : a);
              setLastMovedItemId(droppedArticleId);
          }
          updateState(updatedArticles);
          setTimeout(() => setLastMovedItemId(null), 3000);
          setDraggedCategoryCode(null); setIsDraggingArticle(false);
          return;
      }

      if (draggedCategoryCode) {
          const originalCode = draggedCategoryCode;
          if (!targetCode) {
             const newCats = categories.map(c => c.code === draggedCategoryCode ? { ...c, parentId: undefined } : c);
             updateState(articles, newCats); setLastMovedItemId(originalCode);
             setTimeout(() => setLastMovedItemId(null), 3000);
             setDraggedCategoryCode(null); playUISound('move'); return;
          }
          
          const targetIdx = categories.findIndex(c => c.code === targetCode);
          const targetCat = categories[targetIdx];
          let newCatsOrder = [...categories];
          const sIdx = newCatsOrder.findIndex(c => c.code === draggedCategoryCode);
          const [movedItem] = newCatsOrder.splice(sIdx, 1);
          
          let finalTargetIdx: number;
          let targetParentId: string | undefined = undefined;

          // PATTO DI FERRO: Miracolo della cartella - Posizionamento tassativo indicato dalla linea blu
          if (pos === 'inside' && targetCat?.isSuperCategory) {
              targetParentId = targetCode;
              // Trova l'indice dopo la testata della cartella o dopo l'ultimo figlio
              const lastChildIdx = [...newCatsOrder].reverse().findIndex(c => c.parentId === targetCode);
              if (lastChildIdx !== -1) {
                  finalTargetIdx = newCatsOrder.length - lastChildIdx;
              } else {
                  finalTargetIdx = newCatsOrder.findIndex(c => c.code === targetCode) + 1;
              }
          } else {
              // Segue la linea blu (Sopra o Sotto un rigo esistente, figlio o radice)
              targetParentId = targetCat?.parentId;
              finalTargetIdx = newCatsOrder.findIndex(c => c.code === targetCode);
              if (pos === 'bottom') finalTargetIdx++;
          }

          const updatedMovedItem = { ...movedItem, parentId: targetParentId };
          newCatsOrder.splice(Math.max(0, finalTargetIdx), 0, updatedMovedItem);
          
          const result = renumberCategories(newCatsOrder, articles); 
          const newCode = result.codeMap[originalCode];
          updateState(result.newArticles, result.newCategories); 
          setLastMovedItemId(newCode);
          setTimeout(() => setLastMovedItemId(null), 3000);
          setDraggedCategoryCode(null); 
          playUISound('move');
      }
  };

  const handleAnalysisRowDragStart = (e: React.DragEvent, id: string) => {
    setDraggedAnalysisId(id);
    setIsDraggingAnalysis(true);
    e.dataTransfer.setData(MIME_ANALYSIS_ROW, id);
    const analysis = analyses.find(a => a.id === id);
    if (analysis) e.dataTransfer.setData(MIME_ANALYSIS_DRAG, analysis.id);
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleAnalysisRowDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedAnalysisId === id) { setAnalysisDragOverId(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    setAnalysisDropPosition(e.clientY < midPoint ? 'top' : 'bottom');
    setAnalysisDragOverId(id);
  };

  const handleAnalysisRowDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData(MIME_ANALYSIS_ROW) || draggedAnalysisId;
    setAnalysisDragOverId(null);
    setDraggedAnalysisId(null);
    setIsDraggingAnalysis(false);

    if (!sourceId || sourceId === targetId) return;

    const sIdx = analyses.findIndex(a => a.id === sourceId);
    let tIdx = analyses.findIndex(a => a.id === targetId);
    if (sIdx === -1 || tIdx === -1) return;

    const newAnalyses = [...analyses];
    const [movedItem] = newAnalyses.splice(sIdx, 1);
    if (sIdx < tIdx && analysisDropPosition === 'top') tIdx--;
    if (sIdx > tIdx && analysisDropPosition === 'bottom') tIdx++;
    newAnalyses.splice(Math.max(0, tIdx), 0, movedItem);

    const { newAnalyses: renumberedAn, newArticles } = renumberAnalyses(newAnalyses, articles);
    updateState(newArticles, categories, renumberedAn);
    playUISound('move');
    setLastMovedItemId(sourceId);
    setTimeout(() => setLastMovedItemId(null), 2000);
  };

  const handleWbsActionChoice = (mode: WbsActionMode, newName: string) => {
    if (!wbsOptionsContext) return;
    const { type, sourceCode, payload } = wbsOptionsContext;
    if ((type === 'clone' && sourceCode) || (type === 'import' && payload)) {
      let sourceCat: Category | null = null;
      let sourceArticles: Article[] = [];
      let sourceAnalyses: PriceAnalysis[] = [];
      if (type === 'import' && payload) { sourceCat = payload.category; sourceArticles = payload.articles; sourceAnalyses = payload.analyses || []; } else { sourceCat = categories.find(c => c.code === sourceCode) || null; if (sourceCat) { sourceArticles = articles.filter(a => a.categoryCode === sourceCode); const relatedAnalysesIds = new Set(sourceArticles.map(a => a.linkedAnalysisId).filter(Boolean)); sourceAnalyses = analyses.filter(an => relatedAnalysesIds.has(an.id)); } }
      if (!sourceCat) { setWbsOptionsContext(null); return; }
      const newCatId = `cat_${Date.now()}`;
      const tempCode = `TEMP_${Date.now()}`;
      const newCategory: Category = { ...sourceCat, id: newCatId, name: newName, code: tempCode, isLocked: false };
      const analysisIdMap = new Map<string, string>();
      const newAnalysesList = [...analyses];
      sourceAnalyses.forEach(an => { const newId = Math.random().toString(36).substr(2, 9); analysisIdMap.set(an.id, newId); let newCode = an.code; if (analyses.some(existing => existing.code === newCode)) { newCode = `AP.${(newAnalysesList.length + 1).toString().padStart(2, '0')}`; } const clonedAnalysis: PriceAnalysis = { ...an, id: newId, code: newCode, components: an.components.map(c => ({ ...c, id: Math.random().toString(36).substr(2, 9) })) }; newAnalysesList.push(clonedAnalysis); });
      const newArticlesRaw = sourceArticles.map(art => { const newArtId = Math.random().toString(36).substr(2, 9); let newLinkedAnalysisId = art.linkedAnalysisId; if (newLinkedAnalysisId && analysisIdMap.has(newLinkedAnalysisId)) { newLinkedAnalysisId = analysisIdMap.get(newLinkedAnalysisId)!; } let newMeasurements: Measurement[] = []; if (mode === 'full') { newMeasurements = art.measurements.map(m => ({ ...m, id: Math.random().toString(36).substr(2, 9), linkedArticleId: undefined })); } else if (mode === 'descriptions') { newMeasurements = art.measurements.map(m => ({ ...m, id: Math.random().toString(36).substr(2, 9), linkedArticleId: undefined, length: undefined, width: undefined, height: undefined, multiplier: undefined })); } else { newMeasurements = [{ id: Math.random().toString(36).substr(2, 9), description: '', type: 'positive' }]; } return { ...art, id: newArtId, categoryCode: tempCode, linkedAnalysisId: newLinkedAnalysisId, measurements: newMeasurements } as Article; });
      const newCatsList = [...categories];
      const targetIdx = wbsOptionsContext.targetCode ? categories.findIndex(c => c.code === wbsOptionsContext.targetCode) : -1;
      if (targetIdx !== -1) { const insertIdx = wbsOptionsContext.position === 'bottom' ? targetIdx + 1 : targetIdx; newCatsList.splice(insertIdx, 0, newCategory); } else { newCatsList.push(newCategory); }
      const allArticlesList = [...articles, ...newArticlesRaw];
      const result = renumberCategories(newCatsList, allArticlesList);
      updateState(result.newArticles, result.newCategories, newAnalysesList);
      const assignedCode = result.codeMap[tempCode];
      setLastMovedItemId(assignedCode);
      setTimeout(() => setLastMovedItemId(null), 3000);
      playUISound('confirm');
    }
    setWbsOptionsContext(null);
  };

  const handleUpdateArticle = (id: string, field: keyof Article, value: any) => { const updated = articles.map(art => art.id === id ? { ...art, [field]: value } : art); updateState(updated); };
  const handleArticleEditSave = (id: string, updates: Partial<Article>) => { const updated = articles.map(art => id === art.id ? { ...art, ...updates } : art); updateState(updated); };
  const handleEditArticleDetails = (article: Article) => { setEditingArticle(article); setIsEditArticleModalOpen(true); };
  const handleDeleteArticle = (id: string) => { if (window.confirm("Eliminare la voce?")) { const updated = articles.filter(art => art.id !== id); updateState(updated); } };
  const handleAddMeasurement = (articleId: string) => { 
      const newId = Math.random().toString(36).substr(2, 9); setLastAddedMeasurementId(newId); 
      setArticles(prevArticles => { const updated = prevArticles.map(art => { if (art.id !== articleId) return art; const lastM = art.measurements.length > 0 ? art.measurements[art.measurements.length - 1] : null; let newM: Measurement = { id: newId, description: '', type: 'positive', length: undefined, width: undefined, height: undefined, multiplier: undefined }; if (smartRepeatActiveId === articleId && lastM && lastM.type !== 'subtotal') { newM = { ...newM, description: lastM.description, multiplier: lastM.multiplier, length: lastM.length, width: lastM.width, height: lastM.height, type: lastM.type }; } return { ...art, measurements: [...art.measurements, newM] }; }); return recalculateAllArticles(updated); });
  };
  const handleUpdateMeasurement = (articleId: string, mId: string, field: keyof Measurement, value: string | number | undefined) => { 
      setArticles(prevArticles => { const updated = prevArticles.map(art => { if (art.id !== articleId) return art; const newMeasurements = art.measurements.map(m => { if (m.id !== mId) return m; return { ...m, [field]: value }; }); return { ...art, measurements: newMeasurements }; }); return recalculateAllArticles(updated); });
  };
  const handleAddSubtotal = (articleId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newM: Measurement = { id: Math.random().toString(36).substr(2, 9), description: '', type: 'subtotal' }; return { ...art, measurements: [...art.measurements, newM] }; }); updateState(updated); };
  const handleAddVoiceMeasurement = (articleId: string, data: Partial<Measurement>) => { const newId = Math.random().toString(36).substr(2, 9); setLastAddedMeasurementId(newId); const updated = articles.map(art => { if (art.id !== articleId) return art; const newM: Measurement = { id: newId, description: data.description || '', type: 'positive', length: data.length, width: data.width, height: data.height, multiplier: data.multiplier }; return { ...art, measurements: [...art.measurements, newM] }; }); updateState(recalculateAllArticles(updated)); };
  const handleToggleDeduction = (articleId: string, mId: string) => { setArticles(prevArticles => { const updated = prevArticles.map(art => { if (art.id !== articleId) return art; const newMeasurements = art.measurements.map(m => { if (m.id !== mId) return m; if (m.type === 'subtotal') return m; const isPositive = m.type === 'positive'; const newType = isPositive ? 'deduction' : 'positive'; let newDesc = m.description; if (newType === 'deduction') { if (!newDesc.toLowerCase().startsWith('a dedurre:')) { newDesc = `A dedurre: ${newDesc}`; } } else { newDesc = newDesc.replace(/^a dedurre:\s*/i, ''); } return { ...m, type: newType, description: newDesc } as Measurement; }); return { ...art, measurements: newMeasurements }; }); return recalculateAllArticles(updated); }); };
  const handleDeleteMeasurement = (articleId: string, mId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newMeasurements = art.measurements.filter(m => m.id !== mId); return { ...art, measurements: newMeasurements }; }); updateState(updated); };
  const handleReorderMeasurements = (articleId: string, startIndex: number, endIndex: number) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newMeasurements = [...art.measurements]; const [movedItem] = newMeasurements.splice(startIndex, 1); newMeasurements.splice(endIndex, 0, movedItem); return { ...art, measurements: newMeasurements }; }); updateState(updated); };
  const handleArticleDragStart = (e: React.DragEvent, article: Article) => { setIsDraggingArticle(true); e.dataTransfer.setData(MIME_ARTICLE, 'true'); e.dataTransfer.setData('type', 'ARTICLE'); e.dataTransfer.setData('articleId', article.id); e.dataTransfer.effectAllowed = 'all'; };
  const handleArticleDragEnd = () => { setIsDraggingArticle(false); setIsDraggingAnalysis(false); setWbsDropTarget(null); };
  const handleArticleDrop = (e: React.DragEvent, targetArticleId: string, position: 'top' | 'bottom' = 'bottom') => { setIsDraggingArticle(false); setIsDraggingAnalysis(false); setWbsDropTarget(null); const articleId = e.dataTransfer.getData('articleId'); if (!articleId) return; const targetArticle = articles.find(a => a.id === articleId); if (!targetArticle) return; const currentCategoryArticles = articles.filter(a => a.categoryCode === targetArticle.categoryCode); const startIndex = currentCategoryArticles.findIndex(a => a.id === articleId); let targetIndex = currentCategoryArticles.findIndex(a => a.id === targetArticleId); if (startIndex === -1 || targetIndex === -1) return; if (position === 'bottom' && startIndex > targetIndex) targetIndex++; else if (position === 'top' && startIndex < targetIndex) targetIndex--; const otherArticles = articles.filter(a => a.categoryCode !== targetArticle.categoryCode); const newSubset = [...currentCategoryArticles]; const [movedItem] = newSubset.splice(startIndex, 1); newSubset.splice(targetIndex, 0, movedItem); const newGlobalArticles = [...otherArticles, ...newSubset]; updateState(newGlobalArticles); setLastMovedItemId(articleId); setTimeout(() => setLastMovedItemId(null), 3000); };
  const handleOpenLinkModal = (articleId: string, measurementId: string) => { setLinkTarget({ articleId, measurementId }); setIsLinkModalOpen(true); };
  const handleLinkMeasurement = (sourceArticle: Article, type: 'quantity' | 'amount') => { if (!linkTarget) return; const updated = articles.map(art => { if (art.id !== linkTarget.articleId) return art; const newMeasurements = art.measurements.map(m => { if (m.id !== linkTarget.measurementId) return m; return { ...m, linkedArticleId: sourceArticle.id, linkedType: type, length: undefined, width: undefined, height: undefined, description: '', multiplier: undefined, type: 'positive' as const }; }); return { ...art, measurements: newMeasurements }; }); updateState(updated); setIsLinkModalOpen(false); setLinkTarget(null); };
  const handleScrollToArticle = (id: string, fromId?: string) => { const targetArt = articles.find(a => a.id === id); if (!targetArt) return; if (fromId) setReturnPath(fromId); if (selectedCategoryCode !== targetArt.categoryCode) setSelectedCategoryCode(targetArt.categoryCode); setTimeout(() => { const element = document.getElementById(`article-${id}`); if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); element.classList.add('bg-yellow-50'); setTimeout(() => element.classList.remove('bg-yellow-50'), 2000); } }, 300); };
  const handleReturnToArticle = () => { if (returnPath) { const id = returnPath; setReturnPath(null); handleScrollToArticle(id); } };
  const handleAddEmptyArticle = (categoryCode: string) => { if (!canAddArticle()) return; const nextAnalysisCode = `AP.${(analyses.length + 1).toString().padStart(2, '0')}`; const newArticleId = Math.random().toString(36).substr(2, 9); const newArticle: Article = { id: newArticleId, categoryCode, code: nextAnalysisCode, description: 'Nuova voce', unit: 'cad', unitPrice: 0, laborRate: 0, linkedAnalysisId: undefined, priceListSource: `Da Analisi ${nextAnalysisCode}`, soaCategory: activeSoaCategory, measurements: [{ id: Math.random().toString(36).substr(2,9), description: '', type: 'positive', multiplier: undefined }], quantity: 0, displayMode: 0 }; updateState([...articles, newArticle]); setLastMovedItemId(newArticleId); setTimeout(() => setLastMovedItemId(null), 3000); };
  const handleToggleArticleLock = (id: string) => { const updated = articles.map(art => art.id === id ? { ...art, isLocked: !art.isLocked } : art); updateState(updated); };
  const handleOpenRebarCalculator = (articleId: string) => { setRebarTargetArticleId(articleId); setIsRebarModalOpen(true); };
  const handleOpenPaintingCalculator = (articleId: string) => { setPaintingTargetArticleId(articleId); setIsPaintingModalOpen(true); };
  const handleToggleVoiceAutomation = (articleId: string) => { if (voiceAutomationActiveId === articleId) setVoiceAutomationActiveId(null); else setVoiceAutomationActiveId(articleId); };
  const handleToggleSmartRepeat = (articleId: string) => { if (smartRepeatActiveId === articleId) setSmartRepeatActiveId(null); else setSmartRepeatActiveId(articleId); };
  const handleCycleDisplayMode = () => { const nextMode = (wbsDisplayMode + 1) % 3; setWbsDisplayMode(nextMode); playUISound('cycle'); const updated = articles.map(a => a.categoryCode === selectedCategoryCode ? { ...a, displayMode: nextMode } : a); updateState(updated); };
  const handleToggleSurveyorGuard = () => { setIsSurveyorGuardActive(!isSurveyorGuardActive); playUISound('toggle'); };
  const handleToggleAllCategories = () => { const anyEnabled = categories.some(c => c.isEnabled !== false); const newCats = categories.map(c => ({ ...c, isEnabled: !anyEnabled })); updateState(articles, newCats); playUISound('toggle'); };
  const handleAddWbs = () => { setEditingCategory(null); setCreatingForcedIsSuper(false); setIsCategoryModalOpen(true); };
  const handleAddSuperCategory = () => { setEditingCategory(null); setCreatingForcedIsSuper(true); setIsCategoryModalOpen(true); };
  const handleEditCategory = (cat: Category) => { setEditingCategory(cat); setCreatingForcedIsSuper(undefined); setIsCategoryModalOpen(true); };
  const handleDeleteCategory = (code: string) => { const cat = categories.find(c => c.code === code); if (cat?.isLocked) { alert("WBS bloccata."); return; } if (window.confirm(`Eliminare definitivamente la WBS ${code}?`)) { const isSuper = cat?.isSuperCategory; let newCats = categories.filter(c => c.code !== code); let newArts = articles.filter(a => a.categoryCode !== code); if (isSuper) { newCats = newCats.map(c => c.parentId === code ? { ...c, parentId: undefined } : c); } const result = renumberCategories(newCats, newArts); updateState(result.newArticles, result.newCategories); if (selectedCategoryCode === code) setSelectedCategoryCode(''); } };
  const handleToggleCategoryLock = (code: string) => { const newCats = categories.map(c => c.code === code ? { ...c, isLocked: !c.isLocked } : c); updateState(articles, newCats); playUISound('toggle'); };
  const handleToggleCategoryVisibility = (code: string) => { const newCats = categories.map(c => c.code === code ? { ...c, isEnabled: !c.isEnabled } : c); updateState(articles, newCats); playUISound('toggle'); };
  const handleSaveCategory = (name: string, isSuper: boolean, color: string, soa?: string) => { if (editingCategory) { const newCats = categories.map(c => c.id === editingCategory.id ? { ...c, name, isSuperCategory: isSuper, color, soaCategory: soa } : c); updateState(articles, newCats); } else { const newCode = generateNextWbsCode(categories); const newCat: Category = { id: `cat_${Date.now()}`, code: newCode, name, isEnabled: true, isLocked: false, isSuperCategory: isSuper, type: viewMode === 'SICUREZZA' ? 'safety' : 'work', color: color, soaCategory: soa }; let newCatsList = isSuper ? [newCat, ...categories] : [...categories, newCat]; const result = renumberCategories(newCatsList, articles); updateState(result.newArticles, result.newCategories); setSelectedCategoryCode(newCat.code); const assignedCode = result.codeMap[newCat.code] || newCat.code; setLastMovedItemId(assignedCode); setTimeout(() => setLastMovedItemId(null), 3000); } setIsCategoryModalOpen(false); playUISound('confirm'); };
  const handleResetProject = () => { window.open(window.location.href, '_blank'); playUISound('newline'); };
  
  // FIX: Corrected measurement spreading by removing redundant wrapping array that caused (Measurement | Measurement[])[] type mismatch
  const handleAddRebarMeasurement = (measurements: Array<{ diameter: number; weight: number; multiplier: number; length: number; description: string }>) => { if (!rebarTargetArticleId) return; const updated = articles.map(art => { if (art.id !== rebarTargetArticleId) return art; const newMeasures: Measurement[] = measurements.map(m => ({ id: Math.random().toString(36).substr(2, 9), description: m.description, type: 'positive' as const, multiplier: m.multiplier, length: m.length, width: undefined, height: m.weight })); return { ...art, measurements: [...art.measurements, ...newMeasures] }; }); updateState(updated); setIsRebarModalOpen(false); };
  const handleAddPaintingMeasurements = (paintRows: Array<{ description: string; multiplier: number; length?: number; width?: number; height?: number; type: 'positive' }>) => { if (paintingTargetArticleId) { const updated = articles.map(art => { if (art.id !== paintingTargetArticleId) return art; const newMeasures = paintRows.map(row => ({ ...row, id: Math.random().toString(36).substr(2, 9) })); return { ...art, measurements: [...art.measurements, ...newMeasures] }; }); updateState(updated); setIsPaintingModalOpen(false); } };
  const handleDropContent = (rawText: string) => { if (!canAddArticle()) return; const targetCatCode = activeCategoryForAi || (selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode); const currentCat = categories.find(c => c.code === targetCatCode); if (currentCat && currentCat.isLocked) { alert("Capitolo bloccato."); return; } if (!rawText) return; setIsProcessingDrop(true); setTimeout(() => { try { const parsed = parseDroppedContent(rawText); if (parsed) { const newArtId = Math.random().toString(36).substr(2, 9); const newMeasId = Math.random().toString(36).substr(2, 9); const newArticle: Article = { id: newArtId, categoryCode: targetCatCode, code: parsed.code || 'NP.001', priceListSource: parsed.priceListSource, description: parsed.description || 'Voce importata', unit: parsed.unit || 'cad', unitPrice: parsed.unitPrice || 0, laborRate: parsed.laborRate || 0, soaCategory: activeSoaCategory, measurements: [{ id: newMeasId, description: '', type: 'positive', length: undefined, multiplier: undefined }], quantity: 0, displayMode: 0 }; updateState([...articles, ...[newArticle]]); setLastMovedItemId(newArtId); setTimeout(() => setLastMovedItemId(null), 3000); } } catch (e) { console.error("Drop Parser Error", e); } finally { setIsProcessingDrop(false); } }, 100); };
  const handleBulkGenerateLocal = async (description: string) => { if (!canAddArticle()) return; setIsGenerating(true); try { const generatedItems = await generateBulkItems(description, projectInfo.region, projectInfo.year, categories); if (generatedItems && generatedItems.length > 0) { const newArticles: Article[] = generatedItems.map(item => { const qty = item.quantity || 1; return { id: Math.random().toString(36).substr(2, 9), categoryCode: item.categoryCode || (categories[0]?.code || 'WBS.01'), code: item.code || 'NP.001', priceListSource: item.priceListSource || 'Generato da IA', description: item.description || 'Voce generata', unit: item.unit || 'cad', unitPrice: item.unitPrice || 0, laborRate: item.laborRate || 0, soaCategory: activeSoaCategory, measurements: [{ id: Math.random().toString(36).substr(2, 9), description: 'Voce generata da assistente', type: 'positive', length: qty, multiplier: 1 }], quantity: qty, displayMode: 0, groundingUrls: (item as any).groundingUrls }; }); updateState([...articles, ...newArticles]); setIsBulkModalOpen(false); } } catch (e) { console.error("Bulk Generation Error:", e); alert("Si è verificato un errore durante la generazione delle voci."); } finally { setIsGenerating(false); } };
  const handleWorkspaceDrop = (e: React.DragEvent) => { 
    e.preventDefault(); e.stopPropagation(); 
    if (draggedCategoryCode) { setIsWorkspaceDragOver(false); return; }
    setIsWorkspaceDragOver(false);
    const analysisId = e.dataTransfer.getData(MIME_ANALYSIS_DRAG);
    if (analysisId) {
        // Se droppo nel foglio di lavoro principale, uso la WBS attiva o la prima
        const targetCode = selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode;
        const analysis = analyses.find(a => a.id === analysisId);
        if (analysis) {
            handleImportAnalysisToArticle(analysis, targetCode);
            playUISound('confirm');
        }
        setIsDraggingAnalysis(false); setDraggedAnalysisId(null);
        return;
    }
    const textData = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text'); 
    const isInternal = e.dataTransfer.types.includes(MIME_ARTICLE) || e.dataTransfer.types.includes(MIME_MEASUREMENT) || e.dataTransfer.types.includes('articleId'); 
    if (textData && !isInternal) { try { const payload = JSON.parse(textData); if (payload && payload.type === 'CROSS_TAB_WBS_BUNDLE') { setWbsOptionsContext({ type: 'import', payload, initialName: payload.category.name, position: 'bottom' }); return; } } catch (err) {} handleDropContent(textData); }
  };
  const handleWorkspaceDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (draggedCategoryCode) { e.dataTransfer.dropEffect = 'none'; if (isWorkspaceDragOver) setIsWorkspaceDragOver(false); return; } const isExternal = !e.dataTransfer.types.includes(MIME_ARTICLE) && !e.dataTransfer.types.includes(MIME_MEASUREMENT); if (isExternal && !isWorkspaceDragOver) setIsWorkspaceDragOver(true); e.dataTransfer.dropEffect = 'copy'; };
  const handleToolbarMouseDown = (e: React.MouseEvent) => { setIsDraggingToolbar(true); dragOffset.current = { x: e.clientX - toolbarPos.x, y: e.clientY - toolbarPos.y }; };
  useEffect(() => { const handleGlobalMouseMove = (e: MouseEvent) => { if (isDraggingToolbar) { let nextX = e.clientX - dragOffset.current.x; let nextY = e.clientY - dragOffset.current.y; setToolbarPos({ x: nextX, y: nextY }); } }; const handleGlobalMouseUp = () => setIsDraggingToolbar(false); if (isDraggingToolbar) { window.addEventListener('mousemove', handleGlobalMouseMove); window.addEventListener('mouseup', handleGlobalMouseUp); } return () => { window.removeEventListener('mousemove', handleGlobalMouseMove); window.removeEventListener('mouseup', handleGlobalMouseUp); }; }, [isDraggingToolbar]);
  const getFullProjectExportData = () => { return JSON.stringify({ gecolaData: { projectInfo, categories, articles, analyses }, exportedAt: new Date().toISOString(), app: "GeCoLa Cloud" }, null, 2); };
  const handleSmartSave = async (silent: boolean = false) => { const jsonString = getFullProjectExportData(); if ('showSaveFilePicker' in window) { try { let handle = currentFileHandle; if (!handle) { if (silent) return; handle = await (window as any).showSaveFilePicker({ suggestedName: `${projectInfo.title || 'Progetto'}.json`, types: [{ description: 'JSON Project File', accept: { 'application/json': ['.json'] }, }], }); setCurrentFileHandle(handle); } if (silent) setIsAutoSaving(true); const writable = await handle.createWritable(); await writable.write(jsonString); await writable.close(); } catch (err: any) { if (err.name !== 'AbortError' && !silent) { setIsSaveModalOpen(true); } } finally { if (silent) setTimeout(() => setIsAutoSaving(false), 500); } } else { if (!silent) setIsSaveModalOpen(true); } };
  useEffect(() => { if (!currentFileHandle) return; const timeoutId = setTimeout(() => { handleSmartSave(true); }, 3000); return () => clearTimeout(timeoutId); }, [articles, categories, projectInfo, analyses, currentFileHandle]);
  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const content = event.target?.result as string; const data = JSON.parse(content); if (data.gecolaData) { setProjectInfo(data.gecolaData.projectInfo); updateState(data.gecolaData.articles, data.gecolaData.categories, data.gecolaData.analyses || []); } else { alert("Formato non valido."); } setCurrentFileHandle(null); } catch (error) { alert("Errore caricamento."); } }; reader.readAsText(file); e.target.value = ''; };
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter') { const target = e.target as HTMLElement; if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') { if (target.tagName === 'TEXTAREA' && e.shiftKey) return; e.preventDefault(); const inputs = Array.from(document.querySelectorAll('input:not([disabled]), textarea:not([disabled])')); const index = inputs.indexOf(target as HTMLInputElement | HTMLTextAreaElement); if (index > -1 && index < inputs.length - 1) (inputs[index + 1] as HTMLElement).focus(); } } };
  const toggleSuperCollapse = (code: string) => { playUISound('toggle'); setCollapsedSuperCodes(prev => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; }); };
  const activeCategory = useMemo(() => categories.find(c => c.code === selectedCategoryCode), [categories, selectedCategoryCode]);
  const activeArticles = useMemo(() => articles.filter(a => a.categoryCode === selectedCategoryCode), [articles, selectedCategoryCode]);
  
  // PATTO DI FERRO: Il filtraggio ora dipende da activeWbsContext per persistere in Analisi
  const filteredCategories = useMemo(() => { 
    return activeWbsContext === 'safety' 
      ? categories.filter(c => c.type === 'safety') 
      : categories.filter(c => c.type !== 'safety'); 
  }, [categories, activeWbsContext]);
  
  const topLevelCategories = useMemo(() => filteredCategories.filter(c => !c.parentId), [filteredCategories]);

  return (
    <div className="h-screen flex flex-col bg-[#2c3e50] font-sans overflow-hidden text-slate-800" onDragOver={(e) => { e.preventDefault(); }} onDragEnter={(e) => { e.preventDefault(); }} onClick={() => { if(!globalAudioCtx) globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); globalAudioCtx.resume(); setIsSaveMenuOpen(false); setIsPrintMenuOpen(false); }}>
      <input type="file" ref={fileInputRef} onChange={handleLoadProject} className="hidden" accept=".json" />
      {authLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-white">
           <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
           <p className="font-black uppercase tracking-widest text-xs">Sistema in Avvio...</p>
        </div>
      ) : !user ? (
        <Login onVisitorLogin={handleVisitorLogin} />
      ) : (
        <>
          {!isFocusMode && (
            <div className="bg-[#2c3e50] shadow-md z-[100] h-14 flex items-center justify-between px-6 border-b border-slate-600 flex-shrink-0">
                <div className="flex items-center space-x-3 w-72">
                    <div className="bg-orange-500 p-1.5 rounded-lg shadow-lg"><Calculator className="w-5 h-5 text-white" /></div>
                    <span className="font-bold text-lg text-white">GeCoLa <span className="font-light opacity-80">v12.0.0</span></span>
                    <button onClick={() => setIsManualOpen(true)} className="ml-2 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg transition-all hover:scale-110 active:scale-95 group relative"><HelpCircle className="w-5 h-5" /><span className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-black uppercase px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[9999]">Manuale Operativo</span></button>
                </div>
                <div className="flex-1 px-6 flex justify-center items-center gap-6">
                    {isVisitor && (
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5 bg-blue-600/20 border border-blue-500/50 px-3 py-1 rounded-full text-blue-200 text-[10px] font-black uppercase tracking-widest animate-pulse"><Sparkles className="w-3 h-3" /> Demo Mode</div>
                            <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${articles.length >= 15 ? 'bg-red-600 border-red-500 text-white animate-bounce' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>Voci: {articles.length} / 15</div>
                        </div>
                    )}
                    <div className="flex items-center gap-3 bg-slate-800/50 px-6 py-2 rounded-t-2xl border border-slate-700 text-white font-bold cursor-pointer hover:bg-slate-700 transition-all shadow-inner group" onClick={() => setIsSettingsModalOpen(true)}>
                        {isAutoSaving && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>}
                        <span className="truncate max-w-[320px] text-xl tracking-tight font-black uppercase italic">{projectInfo.title}</span>
                        <Settings className="w-7 h-7 text-slate-400 group-hover:text-blue-400 group-hover:rotate-90 transition-all duration-500" />
                    </div>
                    <div className="group/tophelp relative">
                         <HelpCircle className="w-4 h-4 text-orange-400 hover:text-orange-200 cursor-help transition-colors" />
                         <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 w-80 bg-slate-900 text-white p-6 rounded-3xl shadow-[0_25px_50px_rgba(0,0,0,0.5)] opacity-0 group-hover/tophelp:opacity-100 pointer-events-none transition-all z-[9999] border border-white/10 ring-1 ring-black">
                            <h4 className="font-black uppercase text-[10px] tracking-widest text-orange-400 mb-4 flex items-center gap-2"><Calculator className="w-4 h-4" /> Centrale Operativa</h4>
                            <div className="space-y-4">
                                <p className="text-[10px] leading-relaxed"><span className="text-white font-black">ANAGRAFICA:</span> Clicca sul titolo del progetto per modificare Designer, Committente e Parametri IVA.</p>
                                <p className="text-[10px] leading-relaxed"><span className="text-white font-black">UNDO/REDO:</span> Torna indietro o ripristina le ultime 50 operazioni effettuate.</p>
                                <p className="text-[10px] leading-relaxed"><span className="text-white font-black">SALVATAGGIO:</span> Salva il file sorgente (.json) per modifiche future o esporta in Excel.</p>
                                <p className="text-[10px] leading-relaxed"><span className="text-white font-black">STAMPA:</span> Genera PDF professionali pronti per il cantiere o l'ufficio gare.</p>
                            </div>
                         </div>
                    </div>
                    <div className="flex items-center bg-slate-800/30 rounded-full px-2 py-1 gap-1">
                        <button onClick={handleUndo} disabled={history.length === 0} className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-all hover:scale-110"><Undo2 className="w-4 h-4" /></button>
                        <div className="w-px h-4 bg-slate-600"></div>
                        <button onClick={handleRedo} disabled={future.length === 0} className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-all hover:scale-110"><Redo2 className="w-4 h-4" /></button>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <button onClick={handleResetProject} className="p-2 transition-all text-slate-300 hover:text-emerald-400 hover:scale-110 active:scale-95 group relative" title="Apri Computo Nuovo (in altra pagina)">
                        <FilePlus2 className="w-6 h-6" />
                        <span className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-black uppercase px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-[9999]">Nuovo Progetto</span>
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="p-2 transition-colors text-slate-300 hover:text-orange-400" title="Apri (.json)"><FolderOpen className="w-5 h-5" /></button>
                    <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setIsSaveMenuOpen(!isSaveMenuOpen); setIsPrintMenuOpen(false); }} className="p-2 transition-colors flex items-center gap-1 text-slate-300 hover:text-blue-400"><Save className="w-5 h-5" /><ChevronDown className={`w-3 h-3 transition-transform ${isSaveMenuOpen ? 'rotate-180' : ''}`} /></button>
                        {isSaveMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-64 bg-white shadow-2xl rounded-lg py-2 z-[100] border border-gray-200 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150">
                                <button onClick={() => { setIsSaveMenuOpen(false); handleSmartSave(false); playUISound('confirm'); }} className="w-full px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-3 border-b border-gray-100"><Coins className="w-4 h-4 text-blue-600" /><b>Salva (.json)</b></button>
                                <button onClick={() => { setIsSaveMenuOpen(false); generateComputoExcel(projectInfo, categories, articles); }} className="w-full px-4 py-3 text-sm text-gray-700 hover:bg-green-50 flex items-center gap-3 border-b border-gray-100"><FileSpreadsheet className="w-4 h-4 text-green-600" /><b>Excel (.xls)</b></button>
                            </div>
                        )}
                    </div>
                    <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setIsPrintMenuOpen(!isPrintMenuOpen); setIsSaveMenuOpen(false); }} className="p-2 transition-colors text-slate-300 hover:text-white flex items-center gap-1"><FileText className="w-5 h-5" /><ChevronDown className={`w-3 h-3 transition-transform ${isPrintMenuOpen ? 'rotate-180' : ''}`} /></button>
                        {isPrintMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-72 bg-white shadow-2xl rounded-lg py-2 z-[100] border border-gray-200 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150">
                                <button onClick={() => { setIsPrintMenuOpen(false); generateComputoMetricPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 flex items-center gap-3 font-bold"><FileText className="w-4 h-4 text-blue-500" />Computo Estimativo</button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateComputoSicurezzaPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-orange-50 flex items-center gap-3 font-bold"><ShieldAlert className="w-4 h-4 text-orange-500" />Computo Oneri Sicurezza</button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateElencoPrezziPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 flex items-center gap-3"><AlignLeft className="w-4 h-4 text-slate-500" />Elenco Prezzi Unitari</button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateManodoperaPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 flex items-center gap-3"><User className="w-4 h-4 text-cyan-600" />Stima Manodopera</button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateAnalisiPrezziPdf(projectInfo, analyses); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 flex items-center gap-3"><TestTubes className="w-4 h-4 text-purple-600" />Analisi Nuovi Prezzi</button>
                            </div>
                        )}
                    </div>
                    <button onClick={handleLogout} className="p-2 text-red-400 hover:text-white ml-2 transition-colors"><LogOut className="w-5 h-5" /></button>
                </div>
            </div>
          )}
          <div className={`flex flex-1 overflow-hidden transition-all duration-500 ${isFocusMode ? 'bg-[#1e293b]' : ''}`}>
            {!isFocusMode && (
                <div className="w-[20.4rem] bg-slate-200 border-r border-slate-300 flex flex-col flex-shrink-0 z-40 shadow-lg transition-all duration-300 relative pl-[10px]">
                <div onMouseEnter={() => startScroll(-3)} onMouseLeave={stopScroll} onDragOver={(e) => { e.preventDefault(); startScroll(-3); }} onDragEnter={(e) => { e.preventDefault(); startScroll(-3); }} onDragLeave={stopScroll} className="absolute top-[calc(12rem-10px)] left-0 right-0 h-10 z-[100] cursor-n-resize opacity-0 hover:opacity-100 transition-opacity bg-gradient-to-b from-blue-500/40 to-transparent flex items-center justify-center pointer-events-auto">
                    <ChevronUp className={`text-blue-600 animate-bounce w-6 h-6 ${draggedCategoryCode || isDraggingArticle || isDraggingAnalysis ? 'opacity-50' : 'opacity-100'}`} />
                </div>
                <div onMouseEnter={() => startScroll(3)} onMouseLeave={stopScroll} onDragOver={(e) => { e.preventDefault(); startScroll(3); }} onDragEnter={(e) => { e.preventDefault(); startScroll(3); }} onDragLeave={stopScroll} className="absolute bottom-0 left-0 right-0 h-16 z-[100] cursor-s-resize opacity-0 hover:opacity-100 transition-opacity bg-gradient-to-t from-blue-500/40 to-transparent flex items-center justify-center pointer-events-auto">
                    <ChevronDown className={`text-blue-600 animate-bounce w-8 h-8 ${draggedCategoryCode || isDraggingArticle || isDraggingAnalysis ? 'opacity-50' : 'opacity-100'}`} />
                </div>
                <div className="px-4 py-2.5 bg-slate-300 border-b border-slate-400 flex justify-between items-center shrink-0 shadow-sm">
                    <div className="flex items-baseline gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">TOTALE:</span>
                        <span className="font-mono font-black text-slate-900 text-sm tracking-tighter">{formatCurrency(totals.totalWorks + totals.totalSafetyProgettuale)}</span>
                    </div>
                    <div className="group/wbshelp relative">
                        <HelpCircle className="w-4 h-4 text-slate-400 hover:text-blue-600 cursor-help transition-colors" />
                        <div className="absolute top-0 left-full ml-4 w-72 bg-slate-900 text-white p-5 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.6)] opacity-0 group-hover/wbshelp:opacity-100 pointer-events-none transition-all z-[9999] border border-white/10 ring-1 ring-black">
                        <h4 className="font-black uppercase text-[10px] tracking-widest text-blue-400 mb-3 flex items-center gap-2"><LayoutList className="w-4 h-4" /> Gestione Struttura</h4>
                        <div className="space-y-3">
                            <p className="text-[10px] font-black leading-relaxed italic text-white/80">"AGGANCIO PERFETTO: Trascina una voce da gecola.it o un'analisi tecnica su qualsiasi capitolo per importarla all'istante."</p>
                            <p className="text-[10px] leading-relaxed"><span className="text-white font-black">FISARMONICA:</span> I capitoli inattivi sono compatti. Clicca su uno per espanderlo e vedere il totale.</p>
                        </div>
                        </div>
                    </div>
                </div>
                <div className="p-1 bg-slate-300/40 border-b border-slate-400 grid grid-cols-5 gap-1 shrink-0">
                    <button onClick={() => { setViewMode('COMPUTO'); setActiveWbsContext('work'); }} className={`py-2 text-[8.5px] font-black uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'COMPUTO' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-600 hover:bg-white'}`}><HardHat className="w-3.5 h-3.5" /> Lavori</button>
                    <button onClick={() => { setViewMode('SICUREZZA'); setActiveWbsContext('safety'); }} className={`py-2 text-[8.5px] font-black uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'SICUREZZA' ? 'bg-orange-50/20 text-orange-600 shadow-lg border-orange-200' : 'text-slate-600 hover:bg-white'}`}><ShieldAlert className="w-3.5 h-3.5" /> Sicur.</button>
                    <button onClick={() => setViewMode('ANALISI')} className={`py-2 text-[8.5px] font-black uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'ANALISI' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-600 hover:bg-white'}`}><TestTubes className="w-3.5 h-3.5" /> Analisi</button>
                    <button onClick={() => setViewMode('SUMMARY')} className={`py-2 text-[8.5px] font-black uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'SUMMARY' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-white'}`}><Layers className="w-3.5 h-3.5" /> Riepil.</button>
                    <button onClick={() => setViewMode('CRONOPROGRAMMA')} className={`py-2 text-[8.5px] font-black uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'CRONOPROGRAMMA' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-600 hover:bg-white'}`}><Calendar className="w-3.5 h-3.5" /> Crono</button>
                </div>
                <div className="p-1 bg-slate-300/20 border-b border-slate-400 grid grid-cols-4 gap-1 shrink-0">
                    <button onClick={handleToggleAllCategories} title="ACCENDI/SPEGNI" className="py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all text-slate-400 hover:text-yellow-500 flex flex-col items-center justify-center gap-1">
                        <Lightbulb className="w-3.5 h-3.5" />
                        <span className="text-[6.5px] font-black uppercase text-slate-400">Luci</span>
                    </button>
                    <button onClick={handleAddWbs} title="NUOVA WBS" className="py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all text-slate-400 hover:text-blue-600 flex flex-col items-center justify-center gap-1">
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span className="text-[6.5px] font-black uppercase text-slate-400">WBS</span>
                    </button>
                    <button onClick={handleAddSuperCategory} title="SUPER CATEGORIA" className="py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all text-slate-400 hover:text-orange-600 flex flex-col items-center justify-center gap-1">
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span className="text-[6.5px] font-black uppercase text-slate-400">Super</span>
                    </button>
                    <button onClick={handleToggleSurveyorGuard} title="SENTINELLA ATTIVA" className={`py-1.5 rounded-lg border transition-all flex flex-col items-center justify-center gap-1 ${isSurveyorGuardActive ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-inner' : 'bg-white border-slate-200 text-slate-400 hover:text-emerald-500'}`}>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span className={`text-[6.5px] font-black uppercase ${isSurveyorGuardActive ? 'text-emerald-500 font-black' : 'text-slate-400'}`}>Sentry</span>
                    </button>
                </div>
                <div ref={sidebarRef} className={`flex-1 overflow-y-auto scrollbar-hide overflow-x-visible ${activeWbsContext === 'safety' ? 'bg-orange-50/20' : 'bg-transparent'}`} onDrop={(e) => handleWbsDrop(e, null)}>
                    <ul className="p-3 space-y-2 pb-5">
                        {topLevelCategories.map((cat, idx) => {
                        const isInsideDropTarget = wbsDropTarget?.code === cat.code && wbsDropTarget?.position === 'inside';
                        const childCategories = filteredCategories.filter(c => c.parentId === cat.code);
                        const isChildSelected = childCategories.some(c => c.code === selectedCategoryCode);
                        const isCollapsed = collapsedSuperCodes.has(cat.code);
                        if (cat.isSuperCategory) {
                            return (
                                <li key={cat.id} className={`relative group/super transition-all ${!cat.isEnabled ? 'opacity-40 grayscale' : ''} ${lastMovedItemId === cat.code ? 'highlight-move' : ''}`} onDragOver={(e) => handleWbsDragOver(e, cat.code)} onDrop={(e) => handleWbsDrop(e, cat.code)}>
                                    {wbsDropTarget?.code === cat.code && wbsDropTarget?.position === 'top' && !isDraggingArticle && !isDraggingAnalysis && (<div className="absolute -top-1 left-0 right-0 h-1.5 bg-blue-600 z-[60] shadow-[0_0_12px_rgba(37,99,235,1)] rounded-full animate-pulse"></div>)}
                                    {wbsDropTarget?.code === cat.code && wbsDropTarget?.position === 'inside' && (<div className="absolute inset-0 border-2 border-orange-500 rounded-2xl bg-orange-500/10 pointer-events-none z-50 animate-pulse"><div className="absolute top-8 left-6 right-6 h-1 bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,1)] rounded-full"></div></div>)}
                                    <div className="flex flex-row items-end group" draggable onDragStart={(e) => handleWbsDragStart(e, cat.code)}>
                                        <div onClick={() => toggleSuperCollapse(cat.code)} className={`px-4 py-1.5 rounded-t-xl border-t border-x text-[8px] font-black uppercase tracking-[0.2em] transition-all flex flex-row items-center gap-2 cursor-pointer select-none shadow-sm text-white max-w-[80%] overflow-hidden`} style={{ backgroundColor: isInsideDropTarget ? '#F97316' : (cat.color || '#CBD5E1'), borderColor: isInsideDropTarget ? '#EA580C' : (cat.color || '#94A3B8'), borderLeftWidth: isChildSelected ? '4px' : '1px', borderLeftColor: 'white' }}>
                                          <GripVertical className="w-3 h-3 opacity-30" />
                                          <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isCollapsed ? '-rotate-90' : ''}`} />
                                          <span className="truncate">{cat.name}</span>
                                        </div>
                                        <div className="flex mb-0.5 ml-1 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }} className="p-1.5 bg-white/80 border border-slate-300 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-white shadow-sm transition-all transform active:scale-90"><Settings className="w-3.5 h-3.5" /></button>
                                        </div>
                                    </div>
                                    <div className={`rounded-b-2xl rounded-tr-2xl border transition-all duration-500 relative ${isInsideDropTarget ? 'border-orange-500 bg-orange-50 shadow-2xl scale-[1.01]' : 'bg-white shadow-sm'} ${isCollapsed ? 'p-0 h-[8px] overflow-hidden' : 'p-2 min-h-[40px]'}`} style={{ borderColor: !isInsideDropTarget ? (cat.color || '#CBD5E1') : undefined }}>
                                        {!isCollapsed && (
                                            <div className="animate-in fade-in duration-500">
                                                <div className="flex flex-col gap-1.5">
                                                  {childCategories.map(child => {
                                                    const isSelectedChild = selectedCategoryCode === child.code;
                                                    const isTargeted = wbsDropTarget?.code === child.code;
                                                    return (
                                                    <div 
                                                      key={child.id} draggable 
                                                      onDragStart={(e) => handleWbsDragStart(e, child.code)} 
                                                      onDragOver={(e) => handleWbsDragOver(e, child.code)}
                                                      onDrop={(e) => handleWbsDrop(e, child.code)}
                                                      className={`rounded-xl border-l-4 transition-all duration-300 cursor-pointer flex flex-col group/child relative overflow-visible ${isSelectedChild ? 'bg-amber-50 shadow-lg translate-x-1 border-amber-500 p-3' : 'bg-white border-slate-100 hover:border-slate-300 px-3 py-1.5'} ${lastMovedItemId === child.code ? 'highlight-move' : ''} ${(isDraggingArticle || isDraggingAnalysis) && isTargeted ? 'ring-4 ring-green-500 border-green-600 z-50 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : ''}`}
                                                    >
                                                      {isTargeted && wbsDropTarget?.position === 'top' && !isDraggingArticle && !isDraggingAnalysis && (<div className="absolute -top-1.5 left-0 right-0 h-1.5 bg-blue-600 z-[60] shadow-[0_0_12px_rgba(37,99,235,1)] rounded-full animate-pulse"></div>)}
                                                      <div className="flex justify-between items-center" onClick={() => setSelectedCategoryCode(prev => prev === child.code ? '' : child.code)}>
                                                          <div className="flex flex-col max-w-[65%]">
                                                              <div className="flex items-center gap-2"><span className={`text-[8px] font-black font-mono ${isSelectedChild ? 'text-amber-700' : 'text-slate-400'}`}>{child.code}</span>{child.soaCategory && <span className={`text-[7px] font-black bg-slate-100 px-1 rounded ${isSelectedChild ? 'text-amber-800 bg-amber-200/50' : 'text-slate-50'}`}>{child.soaCategory}</span>}</div>
                                                              <span className={`font-black uppercase leading-none truncate ${isSelectedChild ? 'text-amber-900 text-[10px]' : 'text-slate-600 text-[10px]'}`}>{child.name}</span>
                                                          </div>
                                                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                            <span className={`font-mono font-black text-[10px] ${isSelectedChild ? 'text-amber-700' : 'text-slate-400'}`}>{formatCurrency(categoryTotals[child.code] || 0)}</span>
                                                            <div className="flex items-center gap-1 opacity-0 group-hover/child:opacity-100 transition-opacity">
                                                              <button onClick={(e) => { e.stopPropagation(); handleEditCategory(child); }} className="p-1 text-amber-600 hover:text-blue-600 transition-colors"><Settings className="w-3.3 h-3.3" /></button>
                                                              {child.isLocked && <Lock className="w-3 h-3 text-red-500" />}
                                                            </div>
                                                          </div>
                                                      </div>
                                                      {isTargeted && wbsDropTarget?.position === 'bottom' && !isDraggingArticle && !isDraggingAnalysis && (<div className="absolute -bottom-1.5 left-0 right-0 h-1.5 bg-blue-600 z-[60] shadow-[0_0_12px_rgba(37,99,235,1)] rounded-full animate-pulse"></div>)}
                                                    </div>
                                                  )})}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </li>
                            );
                        }
                        const isSelected = selectedCategoryCode === cat.code;
                        const isTargeted = wbsDropTarget?.code === cat.code;
                        return (
                        <li key={cat.id} className={`relative transition-all group/wbsrow-container ${!cat.isEnabled ? 'opacity-40 grayscale' : ''} ${lastMovedItemId === cat.code ? 'highlight-move' : ''}`} onDragOver={(e) => handleWbsDragOver(e, cat.code)} onDrop={(e) => handleWbsDrop(e, cat.code)}>
                            {isTargeted && wbsDropTarget?.position === 'top' && !isDraggingArticle && !isDraggingAnalysis && (<div className="absolute -top-1 left-0 right-0 h-1.5 bg-blue-600 z-[60] shadow-[0_0_15px_rgba(37,99,235,1)] rounded-full animate-pulse"></div>)}
                            <div draggable onDragStart={(e) => handleWbsDragStart(e, cat.code)} className="cursor-pointer group/wbsrow" onClick={() => setSelectedCategoryCode(prev => prev === cat.code ? '' : cat.code)}>
                                <div className={`w-full text-left rounded-2xl border transition-all duration-300 flex flex-col relative overflow-visible shadow-sm ${isSelected ? 'bg-amber-50 border-l-[8px] border-amber-500 shadow-xl scale-[1.02] py-3.5' : 'bg-slate-50 border-slate-200 hover:bg-white py-1.5'} ${(isDraggingArticle || isDraggingAnalysis) && isTargeted ? 'ring-4 ring-green-500 border-green-600 z-50 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : ''}`} style={{ borderLeftColor: isSelected ? undefined : (cat.color || 'transparent') }}>
                                    <div className="px-3.5 h-full flex flex-col justify-between">
                                        <div className="flex flex-row justify-between items-start">
                                            <div className="flex-1 overflow-hidden">
                                                <div className="flex items-center gap-2 mb-0.5"><span className={`text-[8px] font-black font-mono px-1.5 py-0.5 rounded shadow-sm text-white`} style={{ backgroundColor: isSelected ? '#F59E0B' : (cat.color || '#3B82F6') }}>{cat.code}</span>{cat.soaCategory && <span className={`text-[7px] font-black uppercase px-1 rounded border ${isSelected ? 'border-amber-200 bg-amber-100 text-amber-800' : 'border-slate-200 bg-white text-slate-400'}`}>{cat.soaCategory}</span>}{cat.isLocked && <Lock className="w-2.5 h-2.5 text-red-500" />}</div>
                                                <span className={`font-black block whitespace-normal uppercase leading-tight transition-all ${isSelected ? 'text-amber-900 text-[11px]' : 'text-slate-600 text-[9px] truncate'}`}>{cat.name}</span>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                                                <span className={`font-mono font-black text-[12px] ${isSelected ? 'text-amber-700' : 'text-slate-500'}`}>{formatCurrency(categoryTotals[cat.code] || 0)}</span>
                                                <div className="flex gap-1 opacity-0 group-hover/wbsrow-container:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }} className="p-1.5 bg-white rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-500 hover:text-white transition-all"><Settings className="w-3.3 h-3.3" /></button></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {isTargeted && wbsDropTarget?.position === 'bottom' && !isDraggingArticle && !isDraggingAnalysis && (<div className="absolute -bottom-1 left-0 right-0 h-1.5 bg-blue-600 z-[60] shadow-[0_0_15px_rgba(37,99,235,1)] rounded-full animate-pulse"></div>)}
                        </li>
                        )})}
                        {/* ZONA DI DROP FINALE IN BASSO (PATTO DI FERRO) */}
                        <li 
                            onDragOver={(e) => handleWbsDragOver(e, 'WBS_BOTTOM_TARGET')} 
                            onDrop={(e) => handleWbsDrop(e, null)}
                            className={`h-24 transition-all flex flex-col justify-start pt-2 ${wbsDropTarget?.code === 'WBS_BOTTOM_TARGET' ? 'bg-blue-600/5' : ''}`}
                        >
                            {wbsDropTarget?.code === 'WBS_BOTTOM_TARGET' && (
                                <div className="h-1.5 bg-blue-600 shadow-[0_0_12px_blue] rounded-full animate-pulse mx-4" />
                            )}
                        </li>
                    </ul>
                </div>
                </div>
            )}
            {/* WORKSPACE AREA */}
            <div className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-500 ${isFocusMode ? 'bg-[#1e293b]' : ''} ${draggedCategoryCode ? 'pointer-events-none select-none' : ''}`}>
               {isFocusMode && (
                  <div style={{ left: 15, top: 15 }} className="fixed z-[300] flex items-center gap-3 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-2 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] animate-in slide-in-from-top-4 duration-500 group select-none transition-all">
                    <div onMouseDown={handleToolbarMouseDown} className="p-2 cursor-move text-slate-500 hover:text-blue-400 transition-colors"><GripHorizontal className="w-5 h-5" /></div>
                    <button onClick={() => handleEditCategory(activeCategory!)} className="p-3 rounded-xl bg-white border border-slate-200 text-blue-700 hover:bg-blue-50 transition-all shadow-lg active:scale-95"><Settings className="w-5 h-5" /></button>
                    <div className="flex items-center gap-4 pr-3 mr-1 ml-1"><div className="flex flex-col"><span className="text-[12px] font-black text-white/90 uppercase tracking-tighter max-w-[250px] leading-tight mb-1">{activeCategory?.code} - {activeCategory?.name}</span><span className="text-lg font-black text-orange-400 font-mono tracking-tighter leading-none">{formatCurrency(categoryTotals[activeCategory?.code || ''] || 0)}</span></div><div className="h-6 w-[1.5px] bg-slate-700"></div><button onClick={() => { setActiveCategoryForAi(activeCategory?.code || null); setIsImportAnalysisModalOpen(true); }} className={`px-4 py-2 rounded-xl font-black uppercase text-[10px] flex items-center gap-2 shadow-lg transition-all active:scale-95 ${viewMode === 'SICUREZZA' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'} text-white`}><Plus className="w-4 h-4" /> Voce</button></div>
                    <button onClick={() => setIsFocusMode(false)} className="bg-slate-800 hover:bg-orange-600 text-white p-2.5 rounded-xl transition-all active:scale-90"><Minimize2 className="w-4 h-4" /></button>
                  </div>
               )}
               {returnPath && (<button onClick={handleReturnToArticle} className="fixed bottom-12 right-12 z-[250] flex items-center gap-3 bg-blue-600 hover:bg-blue-700 backdrop-blur-lg border border-blue-50 text-blue-100 px-6 py-4 rounded-[2rem] shadow-2xl animate-in slide-in-from-bottom-8"><ArrowLeft className="w-5 h-5" /><b>Torna alla voce</b></button>)}
               {viewMode === 'SUMMARY' ? (
                   <div className="flex-1 overflow-y-auto p-12 bg-white">
                       <Summary totals={totals} info={projectInfo} categories={categories} articles={articles} />
                   </div>
               ) : viewMode === 'CRONOPROGRAMMA' ? (
                   <div className="flex-1 overflow-hidden">
                       <ScheduleView 
                         categories={categories} 
                         articles={articles} 
                         projectInfo={projectInfo}
                         offsets={scheduleOffsets}
                         teamSizes={teamSizes}
                         onOffsetChange={(id, val) => setScheduleOffsets(prev => ({ ...prev, [id]: val }))}
                         onTeamSizeChange={(id, val) => setTeamSizes(prev => ({ ...prev, [id]: val }))}
                         onReorderCategories={(newCats) => {
                             const result = renumberCategories(newCats, articles);
                             updateState(result.newArticles, result.newCategories);
                         }}
                       />
                   </div>
               ) : (viewMode === 'COMPUTO' || viewMode === 'SICUREZZA' || viewMode === 'ANALISI') && activeCategory ? (
                   <>
                   {viewMode !== 'ANALISI' && !isFocusMode && (
                       <div className={`flex items-center justify-between p-5 bg-slate-50 rounded-t-3xl border-2 border-b-0 shadow-lg animate-in slide-in-from-top-2 duration-300 transition-all z-[60] ${viewMode === 'SICUREZZA' ? 'border-orange-600' : 'border-blue-700'}`}>
                            <div className="flex items-center gap-5">
                                 <div className="flex flex-col items-center">
                                    <div className={`px-4 py-3 rounded-2xl font-black text-2xl shadow-inner text-white w-[145px] text-center mb-4 transition-all duration-500 transform hover:scale-105`} style={{ backgroundColor: activeCategory.color || '#3B82F6' }}>
                                        {activeCategory.code}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => handleEditCategory(activeCategory)} title="Impostazioni Capitolo" className={`p-2 rounded-xl bg-white border shadow-md transition-all transform active:scale-95 group relative ${viewMode === 'SICUREZZA' ? 'border-orange-200 text-orange-600 hover:bg-orange-50' : 'border-blue-200 text-blue-700 hover:bg-blue-50'}`}>
                                            <Settings className="w-4 h-4" />
                                            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[7px] font-black uppercase px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-[9999]">Impostazioni</span>
                                        </button>
                                        <button onClick={() => setIsFocusMode(true)} title="Focus Mode" className="p-2 rounded-xl bg-slate-800 text-white hover:bg-blue-600 shadow-md transition-all transform active:scale-95 group relative">
                                            <Maximize2 className="w-4 h-4" />
                                            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[7px] font-black uppercase px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-[9999]">Full Screen</span>
                                        </button>
                                        <button onClick={handleCycleDisplayMode} className={`p-2 rounded-xl border transition-all shadow-md group/cycle relative transform active:scale-95 ${wbsDisplayMode === 0 ? 'bg-white text-slate-400 border-slate-200 hover:border-blue-400' : wbsDisplayMode === 1 ? 'bg-indigo-600 text-white border-indigo-700' : wbsDisplayMode === 2 ? 'bg-blue-800 text-white border-blue-900 animate-pulse' : ''}`}>
                                          <RefreshCw className={`w-4 h-4 transition-transform duration-700 ${wbsDisplayMode > 0 ? 'rotate-180' : ''}`} />
                                          <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 w-72 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest p-4 rounded-2xl shadow-2xl opacity-0 group-hover/cycle:opacity-100 pointer-events-none transition-all z-[9999] border border-white/10 ring-1 ring-black flex flex-col gap-2 text-center">
                                              <div className={`transition-opacity ${wbsDisplayMode === 0 ? 'text-blue-400' : 'opacity-30'}`}>0 - Tutto Aperto: Visualizzazione totale per editing</div>
                                              <div className={`transition-opacity ${wbsDisplayMode === 1 ? 'text-indigo-400' : 'opacity-30'}`}>1 - Revisione: Testo compatto e misure visibili</div>
                                              <div className={`transition-opacity ${wbsDisplayMode === 2 ? 'text-orange-400' : 'opacity-30'}`}>2 - Patto d'Acciaio: Solo descrizione e totali</div>
                                          </div>
                                        </button>
                                    </div>
                                 </div>
                                 <div className="flex flex-col ml-6">
                                    <div className="flex items-center gap-3">
                                        <h2 className={`text-2xl font-black uppercase max-w-[500px] whitespace-normal leading-none tracking-tight ${viewMode === 'SICUREZZA' ? 'text-orange-900' : 'text-blue-900'}`}>{activeCategory.name}</h2>
                                        <div className="group/fieldhelp relative">
                                             <HelpCircle className="w-4 h-4 text-indigo-400 hover:text-indigo-600 cursor-help transition-colors" />
                                             <div className="absolute top-0 left-full ml-4 w-80 bg-slate-900 text-white p-6 rounded-3xl shadow-[0_25px_50px_rgba(0,0,0,0.5)] opacity-0 group-hover/fieldhelp:opacity-100 pointer-events-none transition-all z-[9999] border border-white/10 ring-1 ring-black">
                                                <h4 className="font-black uppercase text-[10px] tracking-widest text-indigo-400 mb-4 flex items-center gap-2"><Zap className="w-4 h-4" /> Logica di Capitolo</h4>
                                                <div className="space-y-4">
                                                    <p className="text-[10px] leading-relaxed"><span className="text-white font-black">AGGANCIO PERFETTO:</span> La funzione Drag & Drop è stata tarata per importare istantaneamente le voci da gecola.it semplicemente rilasciandole sul foglio.</p>
                                                    <p className="text-[10px] leading-relaxed"><span className="text-white font-black">SOA & WBS:</span> La qualificazione SOA è ora centralizzata nel capitolo. Tutte le voci di questo gruppo erediteranno la categoria scelta.</p>
                                                    <p className="text-[10px] leading-relaxed"><span className="text-white font-black">VISUALIZZAZIONE CICLICA:</span> Il tasto 'Refresh' alterna la visualizzazione. Il livello 2 è il "Patto d'Acciaio": solo descrizione e totali per una revisione rapida.</p>
                                                </div>
                                             </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex items-center gap-4">
                                        <span className={`text-3xl font-mono font-black ${viewMode === 'SICUREZZA' ? 'text-orange-600' : 'text-blue-700'}`}>{formatCurrency(categoryTotals[activeCategory.code] || 0)}</span>
                                        {activeCategory.soaCategory && (
                                            <div className="bg-purple-100 border border-purple-200 px-4 py-1.5 rounded-full flex items-center gap-2 text-purple-700 font-black text-[10px] uppercase shadow-sm">
                                                <Award className="w-3.5 h-3.5" />
                                                Categoria SOA: {activeCategory.soaCategory}
                                            </div>
                                        )}
                                    </div>
                                 </div>
                            </div>
                            <div className="flex items-center">
                                <div className="group/listini relative">
                                    <a href="https://www.gecola.it/home/listini" target="_blank" rel="noopener noreferrer" className="bg-white border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white px-8 py-4 rounded-2xl font-black text-xs uppercase flex items-center gap-3 shadow-xl transform transition-all active:scale-95 group/btn">
                                        <Database className="w-5 h-5 animate-pulse" />
                                        Sorgente Prezzi Ufficiali
                                        <ExternalLink className="w-4 h-4 opacity-50" />
                                    </a>
                                    <div className="absolute top-full right-0 mt-6 w-96 bg-slate-900 text-white p-6 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.5)] opacity-0 group-hover/listini:opacity-100 pointer-events-none transition-all z-[9999] border border-white/10 ring-1 ring-black scale-95 group-hover/listini:scale-100">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="bg-blue-600 p-2 rounded-xl"><MousePointerClick className="w-5 h-5 text-white" /></div>
                                            <h4 className="font-black uppercase text-xs tracking-widest text-blue-400">Sistema Drag & Drop</h4>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex gap-4"><div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-black text-blue-500 border border-slate-700 shrink-0">1</div><p className="text-[11px] font-medium leading-relaxed">Apri i listini su <span className="text-blue-400 font-black">gecola.it</span> e seleziona la voce d'interesse.</p></div>
                                            <div className="flex gap-4"><div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-black text-blue-500 border border-slate-700 shrink-0">2</div><p className="text-[11px] font-medium leading-relaxed">Tieni premuto il tasto sinistro sul testo della voce e <span className="text-blue-400 font-black">trascinalo</span> verso questa scheda.</p></div>
                                            <div className="flex gap-4"><div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-black text-blue-500 border border-slate-700 shrink-0">3</div><p className="text-[11px] font-medium leading-relaxed">Rilascia il contenuto nel <span className="text-blue-400 font-black">"rotolo"</span> qui sotto. GeCoLa caricherà istantaneamente tutti i dati.</p></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                       </div>
                   )}
                   
                   {viewMode === 'ANALISI' ? (
                    <div className="p-10 bg-[#f4f6f8] min-h-full flex-1 overflow-y-auto">
                        <div className="flex justify-between items-end mb-8 border-b-2 border-purple-200 pb-6"><div className="flex items-center gap-6"><div className="bg-purple-600 p-4 rounded-xl shadow-lg ring-4 ring-purple-100"><Database className="w-8 h-8 text-white" /></div><div><h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase italic">Gestionale Analisi Prezzi</h2><p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mt-1">Archivio Giustificazioni Analitiche • Drag & Drop Attivo</p></div></div><button onClick={() => { setEditingAnalysis(null); setIsAnalysisEditorOpen(true); }} className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-xl font-black uppercase text-xs shadow-xl flex items-center gap-3 transition-all transform active:scale-95"><Plus className="w-5 h-5" /> Nuova Analisi</button></div>
                        <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden ring-1 ring-slate-300/50">
                          <table className="w-full text-left border-collapse table-fixed">
                            <thead className="bg-slate-100 border-b-2 border-purple-100 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                                <tr>
                                    <th className="p-4 w-12 text-center border-r border-slate-200">#</th>
                                    <th className="p-4 w-14 text-center border-r border-slate-200">D&D</th>
                                    <th className="p-4 w-28 border-r border-slate-200">Codice</th>
                                    <th className="p-4 border-r border-slate-200">Oggetto dell'Analisi</th>
                                    <th className="p-4 w-24 text-center border-r border-slate-200">U.M.</th>
                                    <th className="p-4 w-36 text-right border-r border-slate-200">Unitario €</th>
                                    <th className="p-4 w-52 text-center bg-slate-50">Gestionale</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {analyses.map((analysis, index) => {
                                  const isCurrentlyDragging = draggedAnalysisId === analysis.id;
                                  const isDragOver = analysisDragOverId === analysis.id;
                                  return (
                                    <tr 
                                      key={analysis.id} draggable onDragStart={(e) => handleAnalysisRowDragStart(e, analysis.id)} onDragOver={(e) => handleAnalysisRowDragOver(e, analysis.id)} onDragLeave={() => setAnalysisDragOverId(null)} onDrop={(e) => handleAnalysisRowDrop(e, analysis.id)}
                                      onDragEnd={() => { setDraggedAnalysisId(null); setIsDraggingAnalysis(false); }}
                                      className={`group transition-all ${isCurrentlyDragging ? 'opacity-30' : 'hover:bg-slate-50/80'} ${isDragOver ? (analysisDropPosition === 'top' ? 'border-t-4 border-t-purple-600' : 'border-b-4 border-b-purple-600') : ''} ${lastMovedItemId === analysis.id ? 'highlight-move' : ''}`}
                                    >
                                        <td className="p-4 text-center font-mono text-[10px] text-slate-400 bg-slate-50/50 border-r border-slate-100">{index + 1}</td>
                                        <td className="p-4 text-center border-r border-slate-100"><GripVertical className="w-5 h-5 mx-auto text-slate-300 group-hover:text-purple-600 cursor-grab active:cursor-grabbing" /></td>
                                        <td className="p-4 border-r border-slate-100"><span className="bg-purple-50 text-purple-700 border border-purple-200 font-black font-mono text-xs px-3 py-1 rounded-lg shadow-sm">{analysis.code}</span></td>
                                        <td className="p-4 border-r border-slate-100"><p className="font-bold text-slate-700 text-xs leading-relaxed line-clamp-2 uppercase tracking-tighter">{analysis.description}</p></td>
                                        <td className="p-4 text-center border-r border-slate-100"><span className="text-[10px] font-black text-slate-500 uppercase px-2 py-1 bg-slate-100 rounded border border-slate-200">{analysis.unit}</span></td>
                                        <td className="p-4 text-right border-r border-slate-100"><span className="text-lg font-black text-purple-800 font-mono tracking-tighter leading-none">{formatCurrency(analysis.totalUnitPrice)}</span></td>
                                        <td className="p-4 text-center bg-slate-50/30">
                                            <div className="flex items-center justify-center gap-1.5 px-2">
                                              <button onClick={() => handleImportAnalysisToArticle(analysis)} className="bg-emerald-600 text-white p-2 rounded-lg shadow-lg hover:bg-emerald-700 transition-all flex items-center gap-2 px-3 transform active:scale-90" title="Importa in Computo"><ArrowRight className="w-3.5 h-3.5" /><span className="text-[9px] font-black uppercase">Importa</span></button>
                                              <button onClick={() => { setEditingAnalysis(analysis); setIsAnalysisEditorOpen(true); }} className="bg-white border border-slate-200 text-slate-600 hover:text-purple-600 hover:border-purple-300 p-2 rounded-lg shadow-sm transition-all transform active:scale-90" title="Modifica"><PenLine className="w-4 h-4" /></button>
                                              <button onClick={() => { const newAnalyses = analyses.map(an => an.id === analysis.id ? { ...an, isLocked: !an.isLocked } : an); updateState(articles, categories, newAnalyses); }} className={`p-2 rounded-lg border transition-all transform active:scale-90 ${analysis.isLocked ? 'text-red-600 bg-red-50 border-red-200' : 'text-slate-400 bg-white border-slate-200 hover:text-blue-600'}`}>{analysis.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}</button>
                                              <button onClick={() => handleDeleteAnalysis(analysis.id)} className="bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 p-2 rounded-lg shadow-sm transition-all transform active:scale-90" title="Elimina"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                  );
                                })}
                                {analyses.length === 0 && (<tr><td colSpan={7} className="p-24 text-center"><div className="flex flex-col items-center gap-4 opacity-30"><Database className="w-20 h-20 text-slate-300" /><p className="uppercase font-black text-xl italic tracking-widest text-slate-400">Archivio Analisi Vuoto</p></div></td></tr>)}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-8 flex items-center gap-4 bg-white/50 border border-slate-200 rounded-xl p-5 shadow-inner"><div className="bg-purple-100 p-3 rounded-full text-purple-600 shadow-sm"><Info className="w-6 h-6" /></div><p className="text-xs text-slate-500 font-bold leading-relaxed"><span className="text-purple-700 font-black uppercase">Consiglio Operativo:</span> Puoi trascinare qualsiasi riga di questa tabella direttamente sulla sidebar sinistra sopra una WBS o nell'area di lavoro per aggiungere la voce al computo. Le analisi bloccate (Lucchetto Rosso) impediscono modifiche accidentali ma possono comunque essere importate.</p></div>
                    </div>
                   ) : (
                   <div className={`flex-1 overflow-y-auto overflow-x-hidden shadow-[inset_0_15px_50px_rgba(0,0,0,0.1),inset_0_-15px_50px_rgba(0,0,0,0.1)] border-x border-gray-400 flex flex-col relative scroll-smooth bg-white ${isWorkspaceDragOver ? 'ring-8 ring-blue-400 ring-inset animate-pulse bg-blue-50/50' : ''}`} onKeyDown={handleInputKeyDown} onDragOver={handleWorkspaceDragOver} onDragLeave={() => setIsWorkspaceDragOver(false)} onDrop={handleWorkspaceDrop}>
                      <div className="flex-1 flex flex-col min-h-full px-6 py-8 relative">
                            <table className="w-full text-left border-collapse table-fixed relative bg-white">
                                <TableHeader activeColumn={activeColumn} tariffWidth={projectInfo.tariffColumnWidth} />
                                {activeArticles.length === 0 ? (
                                    <tbody><tr><td colSpan={11} className="py-24"><div className={`flex flex-col items-center gap-8 max-w-2xl mx-auto p-12 rounded-[3.5rem] border-4 border-dashed border-blue-100 bg-slate-50/30 text-center space-y-4`}><div className={`p-8 rounded-[2.5rem] shadow-inner bg-white text-blue-200 border border-blue-50`}><Zap className="w-16 h-16" /></div><h3 className={`text-3xl font-black uppercase tracking-tighter text-slate-400`}>Capitolo Vuoto</h3><p className="text-slate-400 font-medium italic">"Trascina le voci dai listini o aggiungi da Analisi Prezzi"</p></div></td></tr></tbody>
                                ) : (
                                    activeArticles.map((article, artIndex) => (
                                      <ArticleGroup key={article.id} article={article} index={artIndex} allArticles={articles} isPrintMode={false} isCategoryLocked={activeCategory.isLocked} isSurveyorGuardActive={isSurveyorGuardActive} projectSettings={projectInfo} lastMovedItemId={lastMovedItemId} onUpdateArticle={handleUpdateArticle} onEditArticleDetails={handleEditArticleDetails} onDeleteArticle={handleDeleteArticle} onAddMeasurement={handleAddMeasurement} onAddSubtotal={handleAddSubtotal} onAddVoiceMeasurement={handleAddVoiceMeasurement} onUpdateMeasurement={handleUpdateMeasurement} onDeleteMeasurement={handleDeleteMeasurement} onToggleDeduction={handleToggleDeduction} onOpenLinkModal={handleOpenLinkModal} onScrollToArticle={handleScrollToArticle} onReorderMeasurements={handleReorderMeasurements} onArticleDragStart={handleArticleDragStart} onArticleDrop={handleArticleDrop} onArticleDragEnd={handleArticleDragEnd} lastAddedMeasurementId={lastAddedMeasurementId} onColumnFocus={setActiveColumn} onViewAnalysis={handleViewLinkedAnalysis} onInsertExternalArticle={handleInsertExternalArticle} onToggleArticleLock={handleToggleArticleLock} onOpenRebarCalculator={handleOpenRebarCalculator} onOpenPaintingCalculator={handleOpenPaintingCalculator} onToggleVoiceAutomation={handleToggleVoiceAutomation} onToggleSmartRepeat={handleToggleSmartRepeat} voiceAutomationActiveId={voiceAutomationActiveId} smartRepeatActiveId={smartRepeatActiveId} isPaintingAutomationActive={paintingTargetArticleId === article.id} isRebarAutomationActive={rebarTargetArticleId === article.id} />
                                    ))
                                )}
                            </table>
                            <div className="h-[200vh] w-full flex flex-col items-center justify-start pt-32 pointer-events-none opacity-20"><div className="flex flex-col items-center"><div className="bg-slate-100 p-12 rounded-[4rem] mb-8 shadow-inner border border-slate-200"><Calculator className="w-24 h-24 text-slate-400" /></div><h3 className="text-2xl font-black uppercase tracking-[0.5em] text-slate-500">Fine Rotolo</h3><p className="text-xs font-bold text-slate-400 mt-4 italic">"Scorri liberamente per visualizzare il progetto nel suo insieme"</p></div></div>
                      </div>
                   </div>
                   )}
                   </>
               ) : (<div className="p-20 text-center text-gray-400 uppercase font-black opacity-20 text-3xl">Seleziona una sezione</div>)}
            </div>
          </div>
          <ProjectSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} info={projectInfo} onSave={(newInfo) => setProjectInfo(newInfo)} />
          {editingArticle && <ArticleEditModal isOpen={isEditArticleModalOpen} onClose={() => { setIsEditArticleModalOpen(false); setEditingArticle(null); }} article={editingArticle} onSave={handleArticleEditSave} onConvertToAnalysis={handleConvertArticleToAnalysis} />}
          {linkTarget && <LinkArticleModal isOpen={isLinkModalOpen} onClose={() => { setIsLinkModalOpen(false); setLinkTarget(null); }} articles={articles} currentArticleId={linkTarget.articleId} onLink={handleLinkMeasurement} />}
          <CategoryEditModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} onSave={handleSaveCategory} onDelete={handleDeleteCategory} onToggleLock={handleToggleCategoryLock} onToggleEnabled={handleToggleCategoryVisibility} onDuplicate={(code) => { setWbsOptionsContext({ type: 'clone', sourceCode: code, initialName: categories.find(c => c.code === code)?.name || '' }); }} initialData={editingCategory} nextWbsCode={generateNextWbsCode(categories)} forcedIsSuper={creatingForcedIsSuper} />
          <SaveProjectModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} articles={articles} categories={categories} projectInfo={projectInfo} />
          <AnalysisEditorModal isOpen={isAnalysisEditorOpen} onClose={() => setIsAnalysisEditorOpen(false)} analysis={editingAnalysis} onSave={handleSaveAnalysis} nextCode={`AP.${(analyses.length + 1).toString().padStart(2, '0')}`} />
          {wbsOptionsContext && <WbsImportOptionsModal isOpen={!!wbsOptionsContext} onClose={() => setWbsOptionsContext(null)} onChoice={handleWbsActionChoice} initialName={wbsOptionsContext?.initialName || ''} isImport={wbsOptionsContext?.type === 'import'} />}
          <ImportAnalysisModal isOpen={isImportAnalysisModalOpen} onClose={() => setIsImportAnalysisModalOpen(false)} analyses={analyses} onImport={handleImportAnalysisToArticle} onCreateNew={() => { setIsImportAnalysisModalOpen(false); handleAddEmptyArticle(activeCategoryForAi || selectedCategoryCode); }} />
          <BulkGeneratorModal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} onGenerate={handleBulkGenerateLocal} isLoading={isGenerating} region={projectInfo.region} year={projectInfo.year} />
          <HelpManualModal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
          <RebarCalculatorModal isOpen={isRebarModalOpen} onClose={() => setIsRebarModalOpen(false)} onAdd={handleAddRebarMeasurement} />
          <PaintingCalculatorModal isOpen={isPaintingModalOpen} onClose={() => setIsPaintingModalOpen(false)} onAdd={handleAddPaintingMeasurements} />
        </>
      )}
    </div>
  );
};

export default App;