
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
  Calendar, Minus, Mic, MousePointer2, Power, PowerOff, Briefcase
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
import { ComputoContextMenu } from './components/ComputoContextMenu';
import { parseDroppedContent, parseVoiceMeasurement, generateBulkItems, cleanDescription } from './services/geminiService';
import { generateComputoMetricPdf, generateComputoSicurezzaPdf, generateComputoMetricoSubappaltoPdf, generateElencoPrezziPdf, generateManodoperaPdf, generateAnalisiPrezziPdf, generateDistintaFerriPdf } from './services/pdfGenerator';
import { generateComputoExcel, generateComputoMetricoSubappaltoExcel } from './services/excelGenerator';
import { VoiceField, MEASUREMENT_FIELDS, analyzeVoiceTranscript } from './services/voiceDictationService';

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

/**
 * Auto-Fit Dinamico del Font per Numeri & Importi:
 * Calcola la dimensione del font ottimale in base al numero di caratteri,
 * garantendo che nessun valore superi la larghezza della colonna assegnata
 * né a video né in fase di stampa.
 */
const getDynamicNumberFontSize = (
    val: string | number | undefined | null,
    baseSize: number = 13.5,
    threshold: number = 7,
    minSize: number = 9
): string => {
    if (val === undefined || val === null || val === '') return `${baseSize}px`;
    const str = typeof val === 'number' ? val.toLocaleString('it-IT') : String(val).trim();
    const len = str.length;
    if (len <= threshold) return `${baseSize}px`;
    const excess = len - threshold;
    const computed = Math.max(minSize, baseSize - (excess * 0.85));
    return `${computed.toFixed(1)}px`;
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
    isSafety?: boolean;
}

const TableHeader: React.FC<TableHeaderProps> = ({ activeColumn, tariffWidth, isSafety }) => (
  <thead className="select-none shadow-sm border-b-2 border-slate-300">
    <tr className="text-[10px] uppercase font-bold tracking-wider text-slate-700">
      <th className="bg-slate-100 py-3 px-2 text-center w-[46px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">N.</th>
      <th className="bg-slate-100 py-3 px-2.5 text-left border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]" style={{ width: tariffWidth ? `${tariffWidth}px` : '135px' }}>Tariffa</th>
      <th className={`py-3 px-3 text-left border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1] ${activeColumn === 'desc' ? (isSafety ? 'bg-orange-100 text-orange-950 font-extrabold' : 'bg-blue-100 text-blue-950 font-extrabold') : 'bg-slate-100'}`}>
        <span>Designazione dei Lavori</span>
      </th>
      <th className={`py-3 px-1 text-center w-[44px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1] ${activeColumn === 'mult' ? (isSafety ? 'bg-orange-100 text-orange-950 font-extrabold' : 'bg-blue-100 text-blue-950 font-extrabold') : 'bg-slate-100'}`}>Par.Ug.</th>
      <th className={`py-3 px-1 text-center w-[54px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1] ${activeColumn === 'len' ? (isSafety ? 'bg-orange-100 text-orange-950 font-extrabold' : 'bg-blue-100 text-blue-950 font-extrabold') : 'bg-slate-100'}`}>Lung.</th>
      <th className={`py-3 px-1 text-center w-[54px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1] ${activeColumn === 'wid' ? (isSafety ? 'bg-orange-100 text-orange-950 font-extrabold' : 'bg-blue-100 text-blue-950 font-extrabold') : 'bg-slate-100'}`}>Larg.</th>
      <th className={`py-3 px-1 text-center w-[54px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1] ${activeColumn === 'h' ? (isSafety ? 'bg-orange-100 text-orange-950 font-extrabold' : 'bg-blue-100 text-blue-950 font-extrabold') : 'bg-slate-100'}`}>H/Peso</th>
      <th className="bg-slate-200 py-3 px-2 text-center w-[74px] border-r border-b-2 border-slate-300 font-extrabold text-slate-800 shadow-[inset_0_-2px_0_#94a3b8]">Quantità</th>
      <th className="bg-slate-100 py-3 px-2 text-right w-[84px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">Prezzo €</th>
      <th className="bg-slate-100 py-3 px-2 text-right w-[96px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">Importo €</th>
      <th className="bg-slate-100 py-3 px-2 text-right w-[84px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">M.O. €</th>
    </tr>
  </thead>
);

interface ArticleGroupProps {
  article: Article;
  index: number;
  globalIndex: number;
  allArticles: Article[];
  isPrintMode: boolean;
  isCategoryLocked?: boolean;
  isSurveyorGuardActive: boolean;
  projectSettings: ProjectInfo;
  lastMovedItemId: string | null;
  recordingArticleId: string | null;
  onUpdateArticle: (id: string, field: keyof Article, value: any) => void;
  onEditArticleDetails: (article: Article) => void;
  onUpdateMeasurement: (articleId: string, mId: string, field: keyof Measurement, value: string | number | undefined) => void;
  onDeleteMeasurement: (articleId: string, mId: string) => void;
  onAddMeasurement: (articleId: string) => void;
  onAddSubtotal: (articleId: string) => void;
  onOpenLinkModal: (articleId: string, measurementId: string) => void;
  onScrollToArticle: (id: string, fromId?: string) => void;
  onViewAnalysis: (analysisId: string) => void; 
  onInsertExternalArticle: (index: number, text: string) => void;
  onToggleArticleLock: (id: string) => void;
  onOpenRebarCalculator: (articleId: string) => void;
  onOpenPaintingCalculator: (articleId: string) => void;
  onToggleSmartRepeat: (articleId: string) => void;
  onToggleItemDisplayMode: (articleId: string) => void;
  onStartVoiceDictation: (articleId: string) => void;
  smartRepeatActiveId: string | null;
  onDeleteArticle: (id: string) => void;
  onToggleArticleEnabled?: (id: string) => void;
  onArticleDragStart: (e: React.DragEvent, article: Article) => void;
  onArticleDrop: (e: React.DragEvent, targetArticleId: string, position: 'top' | 'bottom') => void;
  onArticleDragEnd: () => void;
  lastAddedMeasurementId: string | null;
  onColumnFocus: (column: string | null) => void;
  onMeasurementDragStart?: (e: React.DragEvent, articleId: string, measurementId: string) => void;
  onMeasurementDrop?: (sourceArticleId: string, measurementId: string, targetArticleId: string, targetMeasurementId?: string, position?: 'top' | 'bottom') => void;
  voiceActiveRowId?: string | null;
  voiceActiveField?: VoiceField;
  onVoiceCellFocus?: (rowId: string, field: VoiceField) => void;
  onOpenContextMenu?: (e: React.MouseEvent, article: Article, measurement?: Measurement | null) => void;
}

interface FastInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  initialValue: string;
  onCommit: (value: string) => void;
}

const FastInput: React.FC<FastInputProps> = ({ initialValue, onCommit, ...props }) => {
  const [val, setVal] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    setVal(initialValue);
    isDirtyRef.current = false;
  }, [initialValue]);

  useEffect(() => {
    if (props.autoFocus && inputRef.current) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [props.autoFocus]);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (props.onBlur) props.onBlur(e);
    if (isDirtyRef.current && val !== initialValue) {
      isDirtyRef.current = false;
      onCommit(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (props.onKeyDown) props.onKeyDown(e);
    if (e.key === 'Enter') {
      if (isDirtyRef.current && val !== initialValue) {
        isDirtyRef.current = false;
        onCommit(val);
      }
    }
  };

  return (
    <input
      ref={inputRef}
      {...props}
      value={val}
      onChange={(e) => {
        isDirtyRef.current = true;
        setVal(e.target.value);
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

interface FastNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  initialValue: number | undefined;
  onCommit: (value: number | undefined) => void;
}

const FastNumberInput: React.FC<FastNumberInputProps> = ({ initialValue, onCommit, ...props }) => {
  const [val, setVal] = useState(initialValue === undefined ? '' : initialValue.toString());
  const inputRef = useRef<HTMLInputElement>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    setVal(initialValue === undefined ? '' : initialValue.toString());
    isDirtyRef.current = false;
  }, [initialValue]);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (props.onBlur) props.onBlur(e);
    if (isDirtyRef.current) {
      const numVal = val === '' ? undefined : parseFloat(val);
      if (numVal !== initialValue) {
        isDirtyRef.current = false;
        onCommit(numVal);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (props.onKeyDown) props.onKeyDown(e);
    if (e.key === 'Enter') {
      if (isDirtyRef.current) {
        const numVal = val === '' ? undefined : parseFloat(val);
        if (numVal !== initialValue) {
          isDirtyRef.current = false;
          onCommit(numVal);
        }
      }
    }
  };

  const field = (props as any)['data-field'];
  const threshold = field === 'multiplier' ? 4 : 5;
  const dynamicFontSize = getDynamicNumberFontSize(val, 13.5, threshold, 8.5);

  return (
    <input
      ref={inputRef}
      {...props}
      type="number"
      value={val}
      onChange={(e) => {
        isDirtyRef.current = true;
        setVal(e.target.value);
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{
        ...props.style,
        fontSize: dynamicFontSize,
        letterSpacing: val.length > threshold ? '-0.03em' : 'normal',
      }}
      title={val}
    />
  );
};

// Icona Pilastrino 3D con 4 ferri verticali e 3 staffe sagomate
export const RebarCagePillarIcon: React.FC<{ className?: string }> = ({ className = "w-3.5 h-3.5" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    {/* 4 Ferri Longitudinali Angolari Verticali */}
    <line x1="6.5" y1="2" x2="6.5" y2="22" stroke="currentColor" strokeWidth="1.6" className="text-cyan-500" />
    <line x1="17.5" y1="2" x2="17.5" y2="22" stroke="currentColor" strokeWidth="1.6" className="text-cyan-500" />
    <line x1="12" y1="4.5" x2="12" y2="23.5" stroke="currentColor" strokeWidth="1.8" className="text-cyan-600" />
    <line x1="12" y1="0.5" x2="12" y2="19.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.5 1.5" opacity="0.6" className="text-cyan-400" />

    {/* 3 Staffe Orizzontali Sagomate 3D in Prospettiva Assonometrica */}
    {/* Staffa 1 - Alta */}
    <polygon points="6.5,6 12,3.5 17.5,6 12,8.5" stroke="currentColor" strokeWidth="1.5" fill="none" className="text-orange-500" />
    {/* Staffa 2 - Media */}
    <polygon points="6.5,12 12,9.5 17.5,12 12,14.5" stroke="currentColor" strokeWidth="1.5" fill="none" className="text-orange-500" />
    {/* Staffa 3 - Bassa */}
    <polygon points="6.5,18 12,15.5 17.5,18 12,20.5" stroke="currentColor" strokeWidth="1.5" fill="none" className="text-orange-500" />
  </svg>
);

const ArticleGroup: React.FC<ArticleGroupProps> = (props) => {
   const { 
     article, index, globalIndex, allArticles, isPrintMode, isCategoryLocked, 
     isSurveyorGuardActive, projectSettings, lastMovedItemId, recordingArticleId, onUpdateArticle, 
     onEditArticleDetails, onDeleteArticle, onToggleArticleEnabled, onAddMeasurement, onAddSubtotal, 
     onUpdateMeasurement, onDeleteMeasurement, onOpenLinkModal, onScrollToArticle, 
     onInsertExternalArticle, onToggleArticleLock, onOpenRebarCalculator, 
     onOpenPaintingCalculator, onToggleSmartRepeat, onStartVoiceDictation, smartRepeatActiveId, 
     onViewAnalysis, lastAddedMeasurementId, onColumnFocus, onToggleItemDisplayMode,
     onArticleDragStart, onArticleDrop, onArticleDragEnd, onOpenContextMenu,
     onMeasurementDragStart, onMeasurementDrop, voiceActiveRowId, voiceActiveField, onVoiceCellFocus
   } = props;
   
   const [measurementDragOverId, setMeasurementDragOverId] = useState<string | null>(null);
   const [measurementDropPosition, setMeasurementDropPosition] = useState<'top' | 'bottom' | null>(null);
   const [isArticleDragOver, setIsArticleDragOver] = useState(false);
   const [articleDropPosition, setArticleDropPosition] = useState<'top' | 'bottom' | null>(null);
   const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
   const [touchedRowIds, setTouchedRowIds] = useState<Set<string>>(new Set());

   const addBtnRef = useRef<HTMLButtonElement>(null);
   const tbodyRef = useRef<HTMLTableSectionElement>(null);

   const isArticleLocked = article.isLocked || false;
   const isArticleDisabled = article.isEnabled === false;
   const areControlsDisabled = isCategoryLocked || isArticleLocked;

   const individualDisplayMode = article.displayMode || 0;
   const isIndustrialMode = individualDisplayMode === 2; // Patto d'Acciaio
   const isConciseMode = individualDisplayMode === 1;   // Revisione
   const isSafetyCategory = article.categoryCode.startsWith('S.');

   const handleCycleLocal = () => {
       if (isCategoryLocked) return;
       onToggleItemDisplayMode(article.id);
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
      
      const isVisibleWarning = totalEffectiveDims < targetRank && (!!m.linkedArticleId || (!isCurrentlyFocused && hasAnyLocalData && touchedRowIds.has(m.id)));
      
      if (totalEffectiveDims < targetRank) {
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
     if (lastAddedMeasurementId === 'ADD_BUTTON_FOCUS' + article.id) {
         addBtnRef.current?.focus();
     }
   }, [lastAddedMeasurementId, article.id]);

   const handleMeasKeyDown = (e: React.KeyboardEvent, mId: string, currentField: string, isLastRow: boolean) => {
      const fieldList = ['description', 'multiplier', 'length', 'width', 'height'];
      const fieldIdx = fieldList.indexOf(currentField);
      const rowIdx = article.measurements.findIndex(m => m.id === mId);

      if (e.key === 'ArrowDown') {
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

   const handleArticleHeaderDragStart = (e: React.DragEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
        e.preventDefault();
        return;
      }
      onArticleDragStart(e, article);
   };

   const handleTbodyDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const isInternal = e.dataTransfer.types.includes(MIME_ARTICLE);
      const isMeasurementDrag = e.dataTransfer.types.includes(MIME_MEASUREMENT) || e.dataTransfer.types.includes('type');
      const isExternalText = e.dataTransfer.types.includes('text/plain');
      const isAnalysisDrag = e.dataTransfer.types.includes(MIME_ANALYSIS_DRAG);
      
      if (isInternal || isMeasurementDrag || isExternalText || isAnalysisDrag) {
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
      const dragType = e.dataTransfer.getData('type');
      const sourceArtId = e.dataTransfer.getData('sourceArticleId');
      const sourceMeasId = e.dataTransfer.getData('measurementId');
      if (dragType === 'MEASUREMENT' && sourceArtId && sourceMeasId) {
          onMeasurementDrop?.(sourceArtId, sourceMeasId, article.id, undefined, 'bottom');
          setIsArticleDragOver(false);
          setArticleDropPosition(null);
          return;
      }

      const isInternal = e.dataTransfer.types.includes(MIME_ARTICLE);
      const droppedId = e.dataTransfer.getData('articleId');
      const textData = e.dataTransfer.getData('text/plain');

      if (isInternal && droppedId) {
          onArticleDrop(e, article.id, articleDropPosition || 'bottom');
      } else if (textData) {
          const insertionIndex = articleDropPosition === 'bottom' ? index + 1 : index;
          onInsertExternalArticle(insertionIndex, textData);
      }
      setIsArticleDragOver(false);
      setArticleDropPosition(null);
   };

   const handleFocusRow = (mId: string) => {
       setFocusedRowId(mId);
       setTouchedRowIds(prev => new Set(prev).add(mId));
   };

   const handleToggleDeduction = (mId: string) => {
       const m = article.measurements.find(meas => meas.id === mId);
       if (!m) return;
       const newType = m.type === 'deduction' ? 'positive' : 'deduction';
       
       let newDesc = m.description;
       const prefix = 'A dedurre: ';
       if (newType === 'deduction') {
           if (!newDesc.startsWith(prefix)) newDesc = prefix + newDesc;
       } else {
           if (newDesc.startsWith(prefix)) newDesc = newDesc.substring(prefix.length);
       }
       
       onUpdateMeasurement(article.id, mId, 'type', newType);
       onUpdateMeasurement(article.id, mId, 'description', newDesc);
       playUISound('toggle');
   };

   const descFontSize = 15.5; 

   return (
       <tbody 
        ref={tbodyRef}
        id={`article-${article.id}`} 
        style={{ scrollMarginTop: '60px' }}
        className={`article-block group/article transition-all ${isArticleDisabled ? 'opacity-60 grayscale-[20%] bg-amber-50/20' : isArticleLocked ? 'opacity-80' : ''} ${isArticleDragOver ? (isSafetyCategory ? 'ring-2 ring-orange-500 ring-inset' : 'ring-2 ring-blue-500 ring-inset') : ''} ${lastMovedItemId === article.id ? 'highlight-move' : ''}`}
        onDragOver={handleTbodyDragOver}
        onDragLeave={handleTbodyDragLeave}
        onDrop={handleTbodyDrop}
      >


         <tr 
            className={`align-top article-header-row ${!isPrintMode ? 'cursor-pointer' : ''} ${isIndustrialMode ? 'bg-slate-100' : isArticleDisabled ? 'bg-amber-50/50' : (isSafetyCategory ? 'bg-gradient-to-r from-orange-50/50 via-white to-slate-50/40' : 'bg-gradient-to-r from-blue-50/50 via-white to-slate-50/40')} border-t-2 ${isArticleDisabled ? 'border-t-amber-400' : isSafetyCategory ? 'border-t-orange-400' : 'border-t-blue-500'}`}
            draggable={!isPrintMode && !areControlsDisabled}
            onDragStart={handleArticleHeaderDragStart}
            onDragEnd={onArticleDragEnd}
            onClick={handleCycleLocal}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenContextMenu?.(e, article, null);
            }}
         >
            <td className={`text-center py-2 px-1.5 border-r border-slate-200 ${isArticleDisabled ? 'bg-amber-100/60' : 'bg-slate-50/60'}`}>
                <div className="flex flex-col items-center gap-1">
                    {!isPrintMode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleArticleEnabled?.(article.id);
                        }}
                        className={`p-1 rounded-lg transition-all ${
                          isArticleDisabled
                            ? 'bg-amber-500 text-white shadow hover:bg-amber-600 scale-105 ring-2 ring-amber-300'
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={isArticleDisabled ? "Voce SPENTA (Esclusa dal computo subappalto e totali). Clicca per riattivare" : "Voce ATTIVA. Clicca per spegnere ed escludere dal sottocomputo subappalto"}
                      >
                        {isArticleDisabled ? <PowerOff className="w-3.5 h-3.5 text-white" /> : <Power className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <span className={isArticleDisabled ? 'object-id-badge bg-amber-200 text-amber-900 border-amber-300' : (isSafetyCategory ? 'object-id-badge-safety' : 'object-id-badge')}>{globalIndex}</span>
                    <span className="text-[10px] font-bold text-slate-500 font-mono tracking-tight">{hierarchicalNumber}</span>
                    {isArticleDisabled && (
                      <span className="text-[7.5px] font-black uppercase tracking-wider px-1 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-300">
                        OFF
                      </span>
                    )}
                </div>
            </td>
            <td className={`p-1.5 border-r border-slate-200 align-top ${isIndustrialMode ? 'bg-slate-100/50' : 'bg-white'}`} style={{ width: projectSettings.tariffColumnWidth ? `${projectSettings.tariffColumnWidth}px` : '135px' }}>
               <div className="flex flex-col relative">
                <div className="flex items-center">
                  <textarea 
                      readOnly
                      value={article.code}
                      className={`font-mono font-bold text-xs w-full bg-slate-50 rounded border border-slate-200/80 px-1.5 py-0.5 resize-y overflow-hidden leading-tight disabled:text-gray-400 cursor-default focus:ring-0 ${isAnalysisLinked ? 'text-purple-700 bg-purple-50/50 border-purple-200' : 'text-slate-800'} ${isArticleLocked ? 'text-gray-400' : ''} ${isIndustrialMode ? 'text-indigo-800' : ''}`}
                      rows={isIndustrialMode ? 1 : 2}
                      placeholder="Codice"
                      disabled={true}
                  />
                  {isAnalysisLinked && !isPrintMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); article.linkedAnalysisId && onViewAnalysis(article.linkedAnalysisId); }}
                      className="ml-1 text-purple-600 hover:text-purple-800 hover:bg-purple-100 p-1 rounded transition-colors flex-shrink-0"
                      title="Apri Analisi Prezzo"
                    >
                      <TestTubes className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {(individualDisplayMode > 0 || article.priceListSource) && !isIndustrialMode && (
                   <div className="text-[9px] text-slate-400 px-1 mt-1 leading-tight truncate max-w-full font-sans" title={article.priceListSource}>{article.priceListSource || 'Prezzario N/D'}</div>
                )}
                {!isIndustrialMode && article.soaCategory && (
                    <div className="text-[9px] text-slate-500 font-medium px-1 mt-0.5 flex items-center gap-1" title={`Categoria SOA: ${article.soaCategory}`}>
                        <span className="bg-slate-100 border border-slate-200 px-1 py-0.2 rounded text-[8.5px] font-bold">SOA: {article.soaCategory}</span>
                    </div>
                )}
               </div>
            </td>
            <td className={`p-2 border-r border-slate-200 ${isIndustrialMode ? 'bg-slate-100/50' : 'bg-white'}`}>
               {isArticleDisabled && (
                 <div className="mb-1 flex items-center gap-1.5">
                   <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                     <PowerOff className="w-2.5 h-2.5" /> Voce Esclusa da Subappalto / Spenta
                   </span>
                 </div>
               )}
               {isPrintMode || isConciseMode || isIndustrialMode ? (
                 <p className={`leading-relaxed font-sans font-semibold text-justify px-0.5 whitespace-pre-wrap ${isIndustrialMode ? 'line-clamp-1 italic font-bold text-slate-600' : isConciseMode ? 'line-clamp-2' : ''} ${!isIndustrialMode && isSafetyCategory ? 'text-orange-950' : !isIndustrialMode ? 'text-blue-600' : ''}`} style={{ color: !isIndustrialMode && !isSafetyCategory ? '#2563eb' : undefined, fontSize: `${descFontSize}px` }}>{article.description}{isIndustrialMode ? ' ...' : ''}</p>
               ) : (
                 <textarea 
                    readOnly={true}
                    value={article.description}
                    rows={isArticleLocked ? 2 : 4}
                    className={`w-full font-sans font-semibold text-justify border-none focus:ring-0 bg-transparent resize-y p-0.5 cursor-default scrollbar-hide ${isArticleLocked ? 'opacity-60 italic' : 'min-h-[50px]'} ${isSafetyCategory ? 'text-orange-950' : 'text-blue-600'}`}
                    style={{ color: !isSafetyCategory ? '#2563eb' : undefined, WebkitTextFillColor: !isSafetyCategory ? '#2563eb' : undefined, fontSize: `${descFontSize}px` }}
                    placeholder="Descrizione..."
                 />
               )}
            </td>
            <td className={`border-r border-slate-200 ${isIndustrialMode ? 'bg-slate-100/50' : 'bg-slate-50/40'} p-1 text-center align-top`}>
                {!isPrintMode && !isCategoryLocked && (
                   <div className="flex flex-col items-center gap-1 mt-1">
                      <button onClick={(e) => { e.stopPropagation(); onToggleArticleLock(article.id); }} className={`transition-all p-1 rounded-md ${isArticleLocked ? 'text-red-500 hover:text-red-700 bg-red-50 border border-red-200' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100'}`} title={isArticleLocked ? "Sblocca Voce" : "Blocca Voce (Lavoro Fatto)"}>
                          {isArticleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                      {!isArticleLocked && individualDisplayMode === 0 && (
                          <div className="opacity-0 group-hover/article:opacity-100 transition-opacity flex flex-col items-center gap-1">
                            <button onClick={(e) => { e.stopPropagation(); onEditArticleDetails(article); }} className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors p-1 rounded-md" title="Modifica Dettagli"><PenLine className="w-3.5 h-3.5" /></button>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteArticle(article.id); }} className="text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors p-1 rounded-md" title="Elimina Voce"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                      )}
                   </div>
                )}
            </td>
            <td colSpan={7} className={`${isIndustrialMode ? 'bg-slate-100/30 border-r border-slate-200' : 'bg-slate-50/20 border-r border-slate-200'}`}></td>
         </tr>
         {!isArticleLocked && !isIndustrialMode && (
           <>
            <tr 
                className="bg-slate-50/90 border-y border-slate-200"
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenContextMenu?.(e, article, null);
                }}
            >
                <td className="border-r border-slate-200 bg-slate-50/50"></td>
                <td className="border-r border-slate-200 bg-slate-50/50"></td>
                <td className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider border-r border-slate-200 bg-white/70 flex items-center justify-between ${isSafetyCategory ? 'text-orange-700' : 'text-blue-700'}`}>
                    <span className="flex items-center gap-1.5 font-bold">
                        <Layers className="w-3.5 h-3.5 opacity-70" />
                        MISURAZIONI & SVILUPPO:
                    </span>
                    <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/80">
                        {onOpenRebarCalculator && (
                            <button 
                                onClick={() => onOpenRebarCalculator(article.id)} 
                                className={`p-1 rounded transition-all ${isSafetyCategory ? 'hover:text-orange-600 hover:bg-white' : 'hover:text-orange-500 hover:bg-white'} text-slate-500 group relative`} 
                                title="Calcolo Parametrico Armature 3D & Staffe (Pilastrino / Trave)"
                            >
                                <RebarCagePillarIcon className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                            </button>
                        )}
                        <button onClick={() => onOpenPaintingCalculator(article.id)} className={`p-1 rounded transition-colors ${isSafetyCategory ? 'hover:text-orange-600 hover:bg-white' : 'hover:text-blue-600 hover:bg-white'} text-slate-500`} title="Calcolo Automatico Pitturazioni"><Paintbrush className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onToggleSmartRepeat(article.id)} className={`p-1 rounded transition-all ${smartRepeatActiveId === article.id ? (isSafetyCategory ? 'bg-orange-600 text-white shadow' : 'bg-blue-600 text-white shadow') : (isSafetyCategory ? 'text-slate-500 hover:text-orange-600 hover:bg-white' : 'text-slate-500 hover:text-blue-600 hover:bg-white')}`} title="Smart Repeat (Clona rigo precedente)"><CopyPlus className="w-3.5 h-3.5" /></button>
                        <button 
                            onClick={() => onStartVoiceDictation(article.id)} 
                            className={`p-1 rounded transition-all flex items-center gap-1 ${recordingArticleId === article.id ? 'bg-purple-600 text-white animate-pulse shadow-md ring-2 ring-purple-300' : 'text-slate-500 hover:text-purple-600 hover:bg-white'}`} 
                            title={recordingArticleId === article.id ? "Dettatura Vocale ATTIVA. Clicca per disattivare" : "Attiva Dettatura Vocale Continua (Cuffie / Microfono)"}
                        >
                            <Headset className="w-3.5 h-3.5" />
                            {recordingArticleId === article.id && (
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping"></span>
                            )}
                        </button>
                    </div>
                </td>
                <td colSpan={8} className="border-r border-slate-200 bg-slate-50/50"></td>
            </tr>
            {processedMeasurements.map((m, idx) => {
                const linkedArt = getLinkedInfo(m);
                const isSubtotal = m.type === 'subtotal';
                const isDeduction = m.type === 'deduction';
                const guard = getSurveyorWarning(m);
                const isError = guard?.severity === 'error';
                const isLastMeasRow = idx === processedMeasurements.length - 1;
                
                const inheritedFields = getInheritedFields(m);
                const missingFields = guard?.isVisible ? guard.missingFields : [];

                const isRowVoiceActive = recordingArticleId === article.id && voiceActiveRowId === m.id;

                return (
                <tr 
                    key={m.id} 
                    draggable={!isPrintMode && !areControlsDisabled} 
                    onDragStart={(e) => {
                        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
                            e.preventDefault();
                            return;
                        }
                        e.stopPropagation();
                        e.dataTransfer.setData(MIME_MEASUREMENT, 'true');
                        e.dataTransfer.setData('type', 'MEASUREMENT');
                        e.dataTransfer.setData('sourceArticleId', article.id);
                        e.dataTransfer.setData('measurementId', m.id);
                        e.dataTransfer.effectAllowed = 'copyMove';
                        onMeasurementDragStart?.(e, article.id, m.id);
                    }}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const isMeas = e.dataTransfer.types.includes(MIME_MEASUREMENT) || e.dataTransfer.types.includes('type');
                        if (isMeas) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const isTop = e.clientY < rect.top + rect.height / 2;
                            setMeasurementDragOverId(m.id);
                            setMeasurementDropPosition(isTop ? 'top' : 'bottom');
                            e.dataTransfer.dropEffect = 'copy';
                        }
                    }}
                    onDragLeave={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                            setMeasurementDragOverId(null);
                            setMeasurementDropPosition(null);
                        }
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const dragType = e.dataTransfer.getData('type');
                        const sourceArtId = e.dataTransfer.getData('sourceArticleId');
                        const sourceMeasId = e.dataTransfer.getData('measurementId');
                        setMeasurementDragOverId(null);
                        setMeasurementDropPosition(null);
                        if (dragType === 'MEASUREMENT' && sourceArtId && sourceMeasId) {
                            onMeasurementDrop?.(sourceArtId, sourceMeasId, article.id, m.id, measurementDropPosition || 'bottom');
                        }
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenContextMenu?.(e, article, m);
                    }}
                    className={`group/row cursor-default transition-all border-b border-slate-200/70 
                        ${isSubtotal ? 'bg-amber-50/70 font-bold border-y border-amber-200/90' : ''} 
                        ${measurementDragOverId === m.id ? (measurementDropPosition === 'top' ? 'border-t-2 border-emerald-500 bg-emerald-50/90 shadow-sm' : 'border-b-2 border-emerald-500 bg-emerald-50/90 shadow-sm') : (isSubtotal ? 'bg-amber-50/70' : (isDeduction ? 'bg-rose-50/60' : 'bg-white hover:bg-slate-50/50'))} 
                        ${isRowVoiceActive ? 'bg-purple-50/50 ring-1 ring-purple-400' : ''}
                        ${isArticleLocked ? 'opacity-70' : ''}`} 
                    style={{ fontSize: `13.5px` }}
                >
                    <td className="border-r border-slate-200 bg-slate-50/30"></td>
                    <td className="p-0 border-r border-slate-200 bg-slate-50/40 text-center relative align-middle">
                        {!isPrintMode && !areControlsDisabled && (
                            <div className="flex justify-center items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity px-1 h-full py-1.5">
                                <GripVertical className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing flex-shrink-0" title="Trascina rigo: sposta nella voce o copia in altra voce" />
                                {!isSubtotal ? (
                                    <>
                                        <button onClick={() => onOpenLinkModal(article.id, m.id)} className={`rounded p-0.5 transition-colors ${m.linkedArticleId ? (isSafetyCategory ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-blue-600 text-white hover:bg-blue-700') : (isSafetyCategory ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50')}`} title={m.linkedArticleId ? "Modifica Collegamento" : "Vedi Voce (Collega)"}><LinkIcon className="w-4 h-4" /></button>
                                        <button onClick={() => handleToggleDeduction(m.id)} className={`rounded p-0.5 transition-colors ${isDeduction ? 'bg-rose-600 text-white hover:bg-rose-700' : (isSafetyCategory ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50')}`} title={isDeduction ? "Rendi Positivo" : "A Dedurre"}><MinusCircle className="w-4 h-4" /></button>
                                    </>
                                ) : null}
                                <button onClick={() => onDeleteMeasurement(article.id, m.id)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-colors" title="Elimina Rigo"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        )}
                    </td>
                    <td className={`pl-3 pr-1 py-1 border-r border-slate-200 relative flex items-center gap-2 ${isDeduction ? 'text-rose-900 font-bold' : ''}`}>
                        {isSubtotal ? <div className="italic text-amber-900 text-right pr-2 w-full font-bold">Sommano parziale</div> : (
                            <>
                                <div className={`absolute left-0 top-1/2 w-4 h-[1px] ${isDeduction ? 'bg-rose-300' : 'bg-slate-300'}`}></div>
                                {m.linkedArticleId && linkedArt ? (
                                <div className="flex items-center space-x-2">
                                    <button onClick={() => onScrollToArticle(linkedArt.id, article.id)} className={`flex items-center space-x-1 px-1 py-0.5 rounded group/link transition-colors text-left ${isSafetyCategory ? 'hover:bg-orange-50' : 'hover:bg-blue-50'}`}>
                                        <span className={`font-bold hover:underline cursor-pointer ${isDeduction ? 'text-rose-800' : (isSafetyCategory ? 'text-orange-600' : 'text-blue-600')}`} style={{ fontSize: `12.5px` }}>
                                            {isDeduction ? 'A dedurre: ' : ''}Vedi voce n. {getLinkedArticleNumber(linkedArt)}
                                        </span>
                                        <span className={`${isDeduction ? 'text-rose-500/70 font-mono' : 'text-slate-500 font-mono'}`} style={{ fontSize: `11.5px` }}>
                                            ({m.linkedType === 'amount' ? formatCurrency(linkedArt.quantity * linkedArt.unitPrice) : `${formatResult(linkedArt.quantity)} ${linkedArt.unit}`})
                                        </span>
                                        <LinkIcon className={`w-4 h-4 opacity-0 group-hover/link:opacity-100 transition-opacity ${isDeduction ? 'text-rose-400' : (isSafetyCategory ? 'text-orange-400' : 'text-blue-400')}`} />
                                    </button>
                                    </div>
                                ) : (
                                    isPrintMode ? <div className={`truncate ${isDeduction ? 'text-rose-900 font-bold' : 'text-slate-800'}`}>{m.description}</div> : (
                                        <div className="flex-1 flex items-center gap-2 relative">
                                            <FastInput 
                                            initialValue={m.description} 
                                            onCommit={(val) => onUpdateMeasurement(article.id, m.id, 'description', val)}
                                            data-m-id={m.id}
                                            data-field="description"
                                            autoFocus={m.id === lastAddedMeasurementId} 
                                            onFocus={() => { onColumnFocus('desc'); handleFocusRow(m.id); onVoiceCellFocus?.(m.id, 'description'); }} 
                                            onBlur={() => { onColumnFocus(null); setFocusedRowId(null); }} 
                                            onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'description', isLastMeasRow)}
                                            className={`w-full bg-transparent border-none p-0 focus:ring-0 placeholder-slate-300 disabled:cursor-not-allowed ${isRowVoiceActive && voiceActiveField === 'description' ? 'ring-2 ring-purple-500 bg-purple-100/70 rounded px-1 animate-pulse font-bold' : ''} ${isDeduction ? 'text-rose-900 font-bold' : 'text-slate-800'}`} 
                                            style={{ fontSize: `13.5px` }} 
                                            placeholder={"Descrizione misura..."} 
                                            disabled={areControlsDisabled}
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
                    <td className={`border-r border-slate-200 p-0 transition-colors ${isRowVoiceActive && voiceActiveField === 'multiplier' ? 'ring-2 ring-purple-500 bg-purple-100/70 animate-pulse' : (isDeduction ? 'bg-rose-50/60' : 'bg-slate-50/40')}`}>
                        {!isPrintMode && !isSubtotal ? <FastNumberInput data-m-id={m.id} data-field="multiplier" disabled={areControlsDisabled} onFocus={() => { onColumnFocus('mult'); handleFocusRow(m.id); onVoiceCellFocus?.(m.id, 'multiplier'); }} onBlur={() => { onColumnFocus(null); setFocusedRowId(null); }} onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'multiplier', isLastMeasRow)} className={`w-full text-center bg-transparent border-none text-xs focus:bg-white placeholder-slate-300 disabled:cursor-not-allowed h-full font-mono tabular-nums ${isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'}`} style={{ fontSize: `13.5px` }} initialValue={m.multiplier} onCommit={(val) => onUpdateMeasurement(article.id, m.id, 'multiplier', val)} /> : (m.multiplier && <div className={`text-center font-mono tabular-nums whitespace-nowrap overflow-hidden ${isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'}`} style={{ fontSize: getDynamicNumberFontSize(m.multiplier, 13.5, 4, 8.5) }} title={String(m.multiplier)}>{m.multiplier}</div>)}
                    </td>
                    <td className={`border-r border-slate-200 p-0 transition-all duration-300 relative 
                        ${isRowVoiceActive && voiceActiveField === 'length' ? 'ring-2 ring-purple-500 bg-purple-100/70 animate-pulse' : (inheritedFields.includes('length') ? 'bg-slate-100' : 
                          (isSurveyorGuardActive && guard?.isVisible && guard?.isExcess ? 'excess-cell' : 
                          (missingFields.includes('length') ? 'missing-field-glow' : (isDeduction ? 'bg-rose-50/60' : 'bg-slate-50/40'))))}`}>
                        {isSubtotal ? <div className="text-center text-slate-300">-</div> : (
                             !isPrintMode ? <FastNumberInput data-m-id={m.id} data-field="length" 
                                disabled={areControlsDisabled || inheritedFields.includes('length')} 
                                onFocus={() => { onColumnFocus('len'); handleFocusRow(m.id); onVoiceCellFocus?.(m.id, 'length'); }} 
                                onBlur={() => { onColumnFocus(null); setFocusedRowId(null); }} 
                                onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'length', isLastMeasRow)} 
                                className={`w-full text-center bg-transparent border-none text-xs focus:bg-white disabled:cursor-not-allowed h-full font-mono tabular-nums
                                    ${isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'} 
                                    ${isSurveyorGuardActive && guard?.isVisible && guard?.isExcess && m.length ? 'excess-error' : ''}
                                    ${inheritedFields.includes('length') ? 'text-slate-400 italic font-bold' : ''}
                                    ${missingFields.includes('length') ? 'placeholder:text-blue-300 font-black' : ''}`} 
                                style={{ fontSize: `13.5px` }} 
                                placeholder={missingFields.includes('length') ? "!" : ""}
                                initialValue={m.length} 
                                onCommit={(val) => onUpdateMeasurement(article.id, m.id, 'length', val)} 
                             /> : <div className={`text-center font-mono tabular-nums whitespace-nowrap overflow-hidden ${isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'}`} style={{ fontSize: getDynamicNumberFontSize(formatResult(m.length), 13.5, 5, 8.5) }} title={formatResult(m.length)}>{formatResult(m.length)}</div>
                        )}
                    </td>
                    <td className={`border-r border-slate-200 p-0 transition-all duration-300 relative 
                        ${isRowVoiceActive && voiceActiveField === 'width' ? 'ring-2 ring-purple-500 bg-purple-100/70 animate-pulse' : (inheritedFields.includes('width') ? 'bg-slate-100' : 
                          (isSurveyorGuardActive && guard?.isVisible && guard?.isExcess ? 'excess-cell' : 
                          (missingFields.includes('width') ? 'missing-field-glow' : (isDeduction ? 'bg-rose-50/60' : 'bg-slate-50/40'))))}`}>
                        {isSubtotal ? <div className="text-center text-slate-300">-</div> : (
                             !isPrintMode ? <FastNumberInput data-m-id={m.id} data-field="width" 
                                disabled={areControlsDisabled || inheritedFields.includes('width')} 
                                onFocus={() => { onColumnFocus('wid'); handleFocusRow(m.id); onVoiceCellFocus?.(m.id, 'width'); }} 
                                onBlur={() => { onColumnFocus(null); setFocusedRowId(null); }} 
                                onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'width', isLastMeasRow)} 
                                className={`w-full text-center bg-transparent border-none text-xs focus:bg-white disabled:cursor-not-allowed h-full font-mono tabular-nums
                                    ${isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'} 
                                    ${isSurveyorGuardActive && guard?.isVisible && guard?.isExcess && m.width ? 'excess-error' : ''}
                                    ${inheritedFields.includes('width') ? 'text-slate-400 italic font-bold' : ''}
                                    ${missingFields.includes('width') ? 'placeholder:text-blue-300 font-black' : ''}`} 
                                style={{ fontSize: `13.5px` }} 
                                placeholder={missingFields.includes('width') ? "!" : ""}
                                initialValue={m.width} 
                                onCommit={(val) => onUpdateMeasurement(article.id, m.id, 'width', val)} 
                             /> : <div className={`text-center font-mono tabular-nums whitespace-nowrap overflow-hidden ${isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'}`} style={{ fontSize: getDynamicNumberFontSize(formatResult(m.width), 13.5, 5, 8.5) }} title={formatResult(m.width)}>{formatResult(m.width)}</div>
                        )}
                    </td>
                    <td className={`border-r border-slate-200 p-0 transition-all duration-300 relative 
                        ${isRowVoiceActive && voiceActiveField === 'height' ? 'ring-2 ring-purple-500 bg-purple-100/70 animate-pulse' : (inheritedFields.includes('height') ? 'bg-slate-100' : 
                          (isSurveyorGuardActive && guard?.isVisible && guard?.isExcess ? 'excess-cell' : 
                          (missingFields.includes('height') ? 'missing-field-glow' : (isDeduction ? 'bg-rose-50/60' : 'bg-slate-50/40'))))}`}>
                        {isSubtotal ? <div className="text-center text-slate-300">-</div> : (
                             !isPrintMode ? (
                                    <div className="h-full w-full relative">
                                        <FastNumberInput data-m-id={m.id} data-field="height" data-last-meas-field="true" 
                                            disabled={areControlsDisabled || inheritedFields.includes('height')} 
                                            onFocus={() => { onColumnFocus('h'); handleFocusRow(m.id); onVoiceCellFocus?.(m.id, 'height'); }} 
                                            onBlur={() => { onColumnFocus(null); setFocusedRowId(null); }} 
                                            onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'height', isLastMeasRow)} 
                                            className={`w-full text-center bg-transparent border-none text-xs focus:bg-white disabled:cursor-not-allowed h-full font-mono tabular-nums
                                                ${isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'} 
                                                ${isSurveyorGuardActive && guard?.isVisible && guard?.isExcess && m.height ? 'excess-error' : ''}
                                                ${inheritedFields.includes('height') ? 'text-slate-400 italic font-bold' : ''}
                                                ${missingFields.includes('height') ? 'placeholder:text-blue-300 font-black' : ''}`} 
                                            style={{ fontSize: `13.5px` }} 
                                            placeholder={missingFields.includes('height') ? "!" : ""}
                                            initialValue={m.height} 
                                            onCommit={(val) => onUpdateMeasurement(article.id, m.id, 'height', val)} 
                                        />
                                    </div>
                                ) : <div className={`text-center font-mono tabular-nums whitespace-nowrap overflow-hidden ${isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'}`} style={{ fontSize: getDynamicNumberFontSize(formatResult(m.height), 13.5, 5, 8.5) }} title={formatResult(m.height)}>{formatResult(m.height)}</div>
                        )}
                    </td>
                    <td className={`border-r border-slate-200 text-right font-mono tabular-nums pr-2 whitespace-nowrap overflow-hidden ${isSubtotal ? 'bg-amber-100/80 text-amber-950 border-t border-b border-amber-300 font-black' : (isDeduction ? 'bg-rose-100/70 text-rose-950 font-black' : 'bg-white')} ${m.linkedArticleId ? 'font-bold' : ''} text-slate-700`} style={{ fontSize: getDynamicNumberFontSize(formatResult(m.displayValue), 13.5, 6, 8.5), letterSpacing: (formatResult(m.displayValue) || '').length > 6 ? '-0.03em' : 'normal' }} title={formatResult(m.displayValue)}>{formatResult(m.displayValue)}</td>
                    <td className="border-r border-slate-200"></td><td className="border-r border-slate-200"></td><td className="border-r border-slate-200"></td>
                </tr>
                );})}
           </>
         )}

          <tr 
             className={`font-bold text-xs transition-all duration-300 border-b-2 border-slate-300 ${isIndustrialMode ? 'bg-slate-100 text-slate-900' : 'bg-slate-50/90'}`}
             onContextMenu={(e) => {
               e.preventDefault();
               e.stopPropagation();
               onOpenContextMenu?.(e, article, null);
             }}
          >
             <td className="border-r border-slate-200 bg-slate-100/50"></td>
             <td className="border-r border-slate-200 bg-slate-100/50" style={{ width: projectSettings.tariffColumnWidth ? `${projectSettings.tariffColumnWidth}px` : '135px' }}></td>
             <td className={`px-2.5 py-2.5 text-left border-r border-slate-200 flex items-center gap-3 ${isIndustrialMode ? 'border-slate-200' : ''}`}>
                {!isPrintMode && !isIndustrialMode && !isArticleLocked && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button ref={addBtnRef} onClick={(e) => { e.stopPropagation(); onAddMeasurement(article.id); }} className={`h-6 px-2 rounded-md flex items-center gap-1 text-[11px] font-bold transition-all border shadow-xs focus:ring-2 focus:outline-none ${isSafetyCategory ? 'text-orange-700 bg-orange-50 hover:bg-orange-600 hover:text-white border-orange-200 focus:ring-orange-400' : 'text-blue-700 bg-blue-50 hover:bg-blue-600 hover:text-white border-blue-200 focus:ring-blue-400'}`} title="Aggiungi rigo misura">
                          <Plus className="w-3.5 h-3.5" />
                          <span>Rigo</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onAddSubtotal(article.id); }} className="h-6 px-2 rounded-md flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-500 hover:text-white transition-all border border-amber-200 shadow-xs" title="Inserisci Sommano Parziale">
                          <Sigma className="w-3.5 h-3.5" />
                          <span>Parziale</span>
                        </button>
                        
                        <div className="group/help relative ml-1">
                             <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help hover:text-slate-600" />
                             <div className="absolute bottom-full left-0 mb-3 w-72 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl opacity-0 group-hover/help:opacity-100 pointer-events-none transition-all z-[9999] border border-white/10 ring-1 ring-black">
                                <h4 className="font-bold uppercase text-[10px] tracking-wider text-amber-400 mb-2 flex items-center gap-2"><Layers className="w-4 h-4" /> Comandi di Rigo</h4>
                                <div className="space-y-2 text-[10px] text-slate-300">
                                    <p><span className="text-white font-bold">(+) RIGO:</span> Inserisce un nuovo rigo misura vuoto alla fine dell'elenco.</p>
                                    <p><span className="text-white font-bold">(Σ) PARZIALE:</span> Inserisce un divisore logico che somma tutti i righi precedenti.</p>
                                    <p className="border-t border-white/10 pt-1.5 italic text-slate-400">Patto d'Acciaio: Ogni nuova voce nasce pronta per l'inserimento.</p>
                                </div>
                             </div>
                        </div>
                   </div>
                )}
                <span className={`uppercase text-[10px] ml-auto font-black tracking-wider ${isIndustrialMode ? 'text-indigo-600' : 'text-slate-500'}`}>Sommano {isPrintMode ? article.unit : <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">{article.unit}</span>}</span>
             </td>
             <td className={`border-r border-slate-200 ${isIndustrialMode ? 'border-slate-200' : ''}`}></td>
             <td className={`border-r border-slate-200 ${isIndustrialMode ? 'border-slate-200' : ''}`}></td>
             <td className={`border-r border-slate-200 ${isIndustrialMode ? 'border-slate-200' : ''}`}></td>
             <td className={`border-r border-slate-200 ${isIndustrialMode ? 'border-slate-200' : ''}`}></td>
             <td 
                className={`text-right pr-2 font-mono border-r border-slate-200 font-extrabold whitespace-nowrap overflow-hidden ${isIndustrialMode ? 'bg-slate-100/50' : 'bg-slate-100/80'} text-slate-900`}
                style={{ 
                  fontSize: getDynamicNumberFontSize(formatResult(article.quantity), 13.5, 6, 8.5),
                  letterSpacing: (formatResult(article.quantity) || '').length > 6 ? '-0.03em' : 'normal'
                }}
                title={formatResult(article.quantity)}
             >
                {formatResult(article.quantity)}
             </td>
             <td 
                className={`border-r border-slate-200 text-right pr-2 font-mono whitespace-nowrap overflow-hidden ${isIndustrialMode ? 'border-slate-200' : ''}`}
                style={{ 
                  fontSize: getDynamicNumberFontSize(formatResult(article.unitPrice), 13.5, 7, 8.5),
                  letterSpacing: (formatResult(article.unitPrice) || '').length > 7 ? '-0.03em' : 'normal'
                }}
                title={formatResult(article.unitPrice)}
             >
                {isPrintMode ? formatResult(article.unitPrice) : <span className="font-mono font-bold text-slate-800" style={{ fontSize: getDynamicNumberFontSize(formatResult(article.unitPrice), 13.5, 7, 8.5) }}>{formatResult(article.unitPrice)}</span>}
             </td>
             <td 
                className={`border-r border-slate-200 text-right pr-2 font-mono font-black whitespace-nowrap overflow-hidden ${isIndustrialMode ? 'text-indigo-700' : (isSafetyCategory ? 'text-orange-700' : 'text-blue-700')}`} 
                style={{ 
                  fontSize: getDynamicNumberFontSize(formatResult(totalAmount), 14, 7, 9),
                  letterSpacing: (formatResult(totalAmount) || '').length > 7 ? '-0.04em' : 'normal'
                }}
                title={formatResult(totalAmount)}
             >
                {formatResult(totalAmount)}
             </td>
             <td className={`border-r border-slate-200 text-right pr-2 font-mono text-slate-600 font-normal whitespace-nowrap overflow-hidden ${isIndustrialMode ? 'border-slate-200' : ''}`}>
                 <div className="flex flex-col items-end leading-none py-1">
                   <span 
                     className="font-semibold text-slate-700 whitespace-nowrap"
                     style={{ 
                       fontSize: getDynamicNumberFontSize(formatCurrency(laborValue), 13, 7, 8.5),
                       letterSpacing: (formatCurrency(laborValue) || '').length > 7 ? '-0.03em' : 'normal'
                     }}
                     title={formatCurrency(laborValue)}
                   >
                     {formatCurrency(laborValue)}
                   </span>
                   <span className="text-[9px] text-slate-400 font-mono">({article.laborRate}%)</span>
                 </div>
             </td>
          </tr>

          {/* SEPARATORE DI CHIUSURA FISSO IN BASSO A OGNI VOCE */}
          <tr className="article-separator-row select-none pointer-events-none">
            <td colSpan={11} className="article-separator-cell p-0 text-center">
              <div className="h-full flex items-center justify-between px-6">
                <div className="w-full h-0.5 bg-slate-400/50 rounded-full"></div>
              </div>
            </td>
          </tr>

         {isArticleDragOver && articleDropPosition === 'bottom' && (
             <tr className="h-0 p-0 border-none"><td colSpan={11} className="p-0 border-none h-0 relative"><div className={`absolute w-full h-1 top-0 z-50 shadow-[0_0_15px_rgba(59,130,246,0.8)] pointer-events-none animate-pulse ${isSafetyCategory ? 'bg-orange-500 shadow-orange-500/80' : 'bg-blue-500 shadow-blue-500/80'}`}></div></td></tr>
         )}
      </tbody>
   );
};

type ViewMode = 'COMPUTO' | 'SICUREZZA' | 'ANALISI' | 'SUMMARY' | 'CRONOPROGRAMMA'; 
interface Snapshot { articles: Article[]; categories: Category[]; analyses: PriceAnalysis[]; }

const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | 'visitor' | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
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
  const [smartRepeatActiveId, setSmartRepeatActiveId] = useState<string | null>(null);
  const [recordingArticleId, setRecordingArticleId] = useState<string | null>(null);
  const [voiceActiveRowId, setVoiceActiveRowId] = useState<string | null>(null);
  const [voiceActiveField, setVoiceActiveField] = useState<VoiceField>('description');
  const [voiceFeedbackNotice, setVoiceFeedbackNotice] = useState<string | null>(null);
  
  const voiceRecognitionRef = useRef<any>(null);
  const isVoiceRunningRef = useRef(false);
  const voiceStateRef = useRef<{ articleId: string | null; rowId: string | null; field: VoiceField }>({
    articleId: null,
    rowId: null,
    field: 'description'
  });

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
  const [isOnline, setIsOnline] = useState(true);

  const [lastMovedItemId, setLastMovedItemId] = useState<string | null>(null);

  const [scheduleOffsets, setScheduleOffsets] = useState<Record<string, number>>({});
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
    if (!db) return;
    const connectedRef = ref(db, ".info/connected");
    const unsubscribe = onValue(connectedRef, (snap) => {
        setIsOnline(snap.val() === true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || user === 'visitor' || !db || !auth) return;
    let idDispositivo = localStorage.getItem('unique_device_id');
    if (!idDispositivo) {
      idDispositivo = Math.random().toString(36).substring(2) + Date.now();
      localStorage.setItem('unique_device_id', idDispositivo);
    }
    const userSessionRef = ref(db, `sessions/${user.uid}`);
    let isMounted = true;
    set(userSessionRef, { 
      sessionId: idDispositivo, 
      lastLogin: new Date().toISOString(), 
      device: navigator.userAgent, 
      platform: navigator.platform 
    }).catch(err => console.error("Session Write Failed:", err));
    const unsubscribeDb = onValue(userSessionRef, (snapshot) => {
        if (!isMounted) return;
        const data = snapshot.val();
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

  const initializedCategories = useMemo(() => {
      return CATEGORIES.map((c, i) => ({
          ...c,
          id: (c as any).id || `cat_init_${i}` 
      }));
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>('COMPUTO');
  const [categories, setCategories] = useState<Category[]>(initializedCategories);
  const [articles, setArticles] = useState<Article[]>(INITIAL_ARTICLES);
  const articlesRef = useRef(articles);
  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);
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
  const [contextMenuTarget, setContextMenuTarget] = useState<{
    x: number;
    y: number;
    article: Article;
    measurement?: Measurement | null;
  } | null>(null);

  const handleOpenContextMenu = (e: React.MouseEvent, article: Article, measurement?: Measurement | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuTarget({
      x: e.clientX,
      y: e.clientY,
      article,
      measurement
    });
  };

  const handleAddSameMeasure = (articleId: string, sourceMeasurementId?: string) => {
    const newId = Math.random().toString(36).substr(2, 9);
    setLastAddedMeasurementId(newId);
    setArticles(prevArticles => {
      const updated = prevArticles.map(art => {
        if (art.id !== articleId) return art;
        
        let sourceMeas: Measurement | undefined;
        if (sourceMeasurementId) {
          sourceMeas = art.measurements.find(m => m.id === sourceMeasurementId);
        }
        if (!sourceMeas && art.measurements.length > 0) {
          sourceMeas = [...art.measurements].reverse().find(m => m.type !== 'subtotal');
        }

        const newM: Measurement = {
          id: newId,
          description: sourceMeas ? (sourceMeas.description.startsWith('A dedurre:') ? sourceMeas.description : `Stessa misura: ${sourceMeas.description || ''}`.trim()) : 'Stessa misura',
          multiplier: sourceMeas?.multiplier,
          length: sourceMeas?.length,
          width: sourceMeas?.width,
          height: sourceMeas?.height,
          type: sourceMeas ? sourceMeas.type : 'positive',
        };

        return { ...art, measurements: [...art.measurements, newM] };
      });
      return recalculateAllArticles(updated);
    });
    playUISound('confirm');
  };

  const handleSetMeasurementType = (articleId: string, mId: string, type: 'positive' | 'deduction') => {
    const art = articles.find(a => a.id === articleId);
    const m = art?.measurements.find(meas => meas.id === mId);
    if (!m) return;
    let newDesc = m.description;
    const prefix = 'A dedurre: ';
    if (type === 'deduction') {
      if (!newDesc.startsWith(prefix)) newDesc = prefix + newDesc;
    } else {
      if (newDesc.startsWith(prefix)) newDesc = newDesc.substring(prefix.length);
    }
    handleUpdateMeasurement(articleId, mId, 'type', type);
    handleUpdateMeasurement(articleId, mId, 'description', newDesc);
    playUISound('toggle');
  };

  const handleToggleDeductionMeasurement = (mId: string) => {
    if (!contextMenuTarget) return;
    const art = contextMenuTarget.article;
    const m = art.measurements.find(meas => meas.id === mId);
    if (!m) return;
    const newType = m.type === 'deduction' ? 'positive' : 'deduction';
    handleSetMeasurementType(art.id, mId, newType);
  };

  const handleAddMeasurementWithType = (articleId: string, type: 'positive' | 'deduction') => {
    const newId = Math.random().toString(36).substr(2, 9);
    setLastAddedMeasurementId(newId);
    setArticles(prevArticles => {
      const updated = prevArticles.map(art => {
        if (art.id !== articleId) return art;
        const newM: Measurement = {
          id: newId,
          description: type === 'deduction' ? 'A dedurre: ' : '',
          multiplier: undefined,
          length: undefined,
          width: undefined,
          height: undefined,
          type: type,
        };
        return { ...art, measurements: [...art.measurements, newM] };
      });
      return recalculateAllArticles(updated);
    });
    playUISound('confirm');
  };

  const handleViewChange = (view: 'lavori' | 'sicurezza' | 'summary' | 'schedule') => {
    if (view === 'lavori') setViewMode('COMPUTO');
    if (view === 'sicurezza') setViewMode('SICUREZZA');
    if (view === 'summary') setViewMode('SUMMARY');
    if (view === 'schedule') setViewMode('CRONOPROGRAMMA');

    if ((view === 'lavori' || view === 'sicurezza') && view !== (viewMode === 'COMPUTO' ? 'lavori' : 'sicurezza')) {
        const firstCategoryInView = categories.find(c => 
            view === 'lavori' ? !c.code.startsWith('S.') : c.code.startsWith('S.')
        );
        setSelectedCategoryCode(firstCategoryInView ? firstCategoryInView.code : '');
        playUISound('cycle');
    }
  };
  const [draggedCategoryCode, setDraggedCategoryCode] = useState<string | null>(null);
  const [activeSoaCategory, setActiveSoaCategory] = useState<string>('OG1');
  const [wbsDropTarget, setWbsDropTarget] = useState<{ code: string, position: 'top' | 'bottom' | 'inside' } | null>(null);
  const [isDraggingArticle, setIsDraggingArticle] = useState(false);
  const [isAnalysisEditorOpen, setIsAnalysisEditorOpen] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState<PriceAnalysis | null>(null);
  const [isImportAnalysisModalOpen, setIsImportAnalysisModalOpen] = useState(false);
  const [wbsOptionsContext, setWbsOptionsContext] = useState<{ type: 'import' | 'clone', sourceCode?: string, payload?: any, initialName?: string, targetCode?: string, position?: 'top' | 'bottom', isSuper?: boolean, proposedColors?: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  // Mostra sempre la prima voce in alto quando si apre o cambia gruppo di lavorazioni
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [selectedCategoryCode]);

  useEffect(() => {
    const updateScrollbar = () => {
      if (scrollContainerRef.current) {
        const sw = scrollContainerRef.current.offsetWidth - scrollContainerRef.current.clientWidth;
        setScrollbarWidth(sw > 0 ? sw : 0);
      }
    };
    updateScrollbar();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollbar) : null;
    if (scrollContainerRef.current && ro) {
      ro.observe(scrollContainerRef.current);
    }
    window.addEventListener('resize', updateScrollbar);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateScrollbar);
    };
  }, [articles, selectedCategoryCode, viewMode, isFocusMode, projectInfo.tariffColumnWidth]);

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
      const catTotal = articles.filter(a => a.categoryCode === cat.code && a.isEnabled !== false).reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
      lookup[cat.code] = catTotal;
    });
    return lookup;
  }, [articles, categories]);

  // CALCOLO NUMERAZIONE GLOBALE PROGRESSIVA
  const globalArticleIndexMap = useMemo(() => {
      const map = new Map<string, number>();
      let counter = 1;
      const filteredCategoriesForView = activeWbsContext === 'safety' ? categories.filter(c => c.type === 'safety') : categories.filter(c => c.type !== 'safety');
      
      filteredCategoriesForView.forEach(cat => {
          if (cat.isEnabled === false || cat.isSuperCategory) return;
          const catArticles = articles.filter(a => a.categoryCode === cat.code);
          catArticles.forEach(art => {
              map.set(art.id, counter++);
          });
      });
      return map;
  }, [articles, categories, activeWbsContext]);

  const totals: Totals = useMemo(() => {
    const totalWorks = articles.reduce((acc, art) => {
        if (art.isEnabled === false) return acc;
        const cat = categories.find(c => c.code === art.categoryCode);
        if (cat && (cat.isEnabled === false || cat.type === 'safety')) return acc;
        return acc + (art.quantity * art.unitPrice);
    }, 0);
    const totalLabor = articles.reduce((acc, art) => {
        if (art.isEnabled === false) return acc;
        const cat = categories.find(c => c.code === art.categoryCode);
        if (cat && cat.isEnabled === false) return acc;
        return acc + ((art.quantity * art.unitPrice) * (art.laborRate / 100));
    }, 0);
    const totalSafetyProgettuale = articles.reduce((acc, art) => {
        if (art.isEnabled === false) return acc;
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

  const totalForView = viewMode === 'COMPUTO' ? totals.totalWorks :
                       viewMode === 'SICUREZZA' ? totals.totalSafetyProgettuale :
                       totals.grandTotal;

  const generateNextWbsCode = (currentCats: Category[]) => {
      if (viewMode === 'SICUREZZA') {
          return `S.${(currentCats.filter(c => c.type === 'safety' && !c.isSuperCategory).length + 1).toString().padStart(2, '0')}`;
      }
      return `WBS.${(currentCats.filter(c => c.type !== 'safety' && !c.isSuperCategory).length + 1).toString().padStart(2, '0')}`;
  };
  
  const renumberCategories = useCallback((cats: Category[], currentArts: Article[]) => {
      const codeMap: Record<string, string> = {};
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
    const newAnalyses = analysesToRenumber.map((an, idx) => {
      const newCode = `AP.${(idx + 1).toString().padStart(2, '0')}`;
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
      const targetCode = targetWbsOverride || activeCategoryForAi || (selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode);
      const laborRate = analysis.totalBatchValue > 0 ? parseFloat(((analysis.totalLabor / analysis.totalBatchValue) * 100).toFixed(2)) : 0;
      const newMeasId = Math.random().toString(36).substr(2, 9);
      const newArticle: Article = {
          id: Math.random().toString(36).substr(2, 9), categoryCode: targetCode, code: analysis.code, description: analysis.description, unit: analysis.unit, unitPrice: roundTwoDecimals(analysis.totalUnitPrice), laborRate: laborRate, linkedAnalysisId: analysis.id, priceListSource: `Da Analisi ${analysis.code}`, soaCategory: activeSoaCategory, measurements: [{ id: newMeasId, description: '', type: 'positive', multiplier: undefined }], quantity: 0, displayMode: wbsDisplayMode
      };
      
      const lastIdx = [...articles].reverse().findIndex(a => a.categoryCode === targetCode);
      let updatedArticles;
      if (lastIdx !== -1) {
          const insertPos = articles.length - lastIdx;
          updatedArticles = [...articles];
          updatedArticles.splice(insertPos, 0, newArticle);
      } else {
          updatedArticles = [...articles, newArticle];
      }
      
      updateState(updatedArticles, categories, analyses);
      setLastAddedMeasurementId(newMeasId);
      handleScrollToArticle(newArticle.id, undefined, targetCode);
      if (viewMode === 'ANALISI') setViewMode('COMPUTO');
      setIsImportAnalysisModalOpen(false); 
  };

  const handleViewLinkedAnalysis = (analysisId: string) => {
      const analysis = analyses.find(a => a.id === analysisId);
      if (analysis) { setEditingAnalysis(analysis); setIsAnalysisEditorOpen(true); } else { alert("Analisi non trovata."); }
  };

  const handleConvertArticleToAnalysis = (article: Article) => {
      const newId = Math.random().toString(36).substr(2, 9);
      const newAnalysis: PriceAnalysis = {
          id: newId,
          code: `AP.${(analyses.length + 1).toString().padStart(2, '0')}`,
          description: article.description,
          unit: article.unit,
          analysisQuantity: 1,
          components: [],
          generalExpensesRate: 15,
          profitRate: 10,
          totalMaterials: 0,
          totalLabor: 0,
          totalEquipment: 0,
          costoTecnico: 0,
          valoreSpese: 0,
          valoreUtile: 0,
          totalBatchValue: article.unitPrice,
          totalUnitPrice: article.unitPrice,
          isLocked: false
      };
      
      const updatedArticles = articles.map(art => 
          art.id === article.id ? { 
              ...art, 
              linkedAnalysisId: newId,
              priceListSource: `Da Analisi ${newAnalysis.code}` 
          } : art
      );
      
      updateState(updatedArticles, categories, [...analyses, newAnalysis]);
      setEditingAnalysis(newAnalysis);
      setIsAnalysisEditorOpen(true);
  };

  const handleInsertExternalArticle = (insertIndex: number, rawText: string) => {
      if (!canAddArticle()) return;
      const targetCode = selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode;
      const parsed = parseDroppedContent(rawText);
      if (parsed) {
          const newArticleId = Math.random().toString(36).substr(2, 9);
          const newMeasId = Math.random().toString(36).substr(2, 9);
          const newArticle: Article = {
              id: newArticleId, categoryCode: targetCode, code: parsed.code || 'NP.001', priceListSource: parsed.priceListSource, description: parsed.description || 'Voce importata', unit: parsed.unit || 'cad', unitPrice: parsed.unitPrice || 0, laborRate: parsed.laborRate || 0, soaCategory: activeSoaCategory, measurements: [{ id: newMeasId, description: '', type: 'positive', length: undefined, multiplier: undefined }], quantity: 0, displayMode: wbsDisplayMode
          };
          updateState([...articles, newArticle]);
          setLastAddedMeasurementId(newMeasId);
          handleScrollToArticle(newArticleId, undefined, targetCode);
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
      if (isDraggingArticle || isDraggingAnalysis) {
          if (targetCat?.isSuperCategory) { e.dataTransfer.dropEffect = 'none'; setWbsDropTarget(null); return; }
          setWbsDropTarget({ code: targetCode, position: 'inside' });
          return;
      }
      if (draggedCategoryCode || e.dataTransfer.types.includes('text/plain')) {
          if (draggedCategoryCode === targetCode) { setWbsDropTarget(null); return; }
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          if (targetCat?.isSuperCategory) {
              if (e.clientY < (rect.top + 15)) { setWbsDropTarget({ code: targetCode, position: 'top' }); } else { setWbsDropTarget({ code: targetCode, position: 'inside' }); }
          } else {
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
          if (targetCategory?.isSuperCategory) { setIsDraggingAnalysis(false); return; }
          const analysis = analyses.find(a => a.id === analysisId);
          if (analysis) { handleImportAnalysisToArticle(analysis, targetCode); playUISound('confirm'); }
          setIsDraggingAnalysis(false); setDraggedAnalysisId(null); return;
      }
      const textData = e.dataTransfer.getData('text/plain');
      if (textData && !draggedCategoryCode) {
          try {
              const payload = JSON.parse(textData);
              if (payload && payload.type === 'CROSS_TAB_WBS_BUNDLE') { setWbsOptionsContext({ type: 'import', payload, initialName: payload.category.name, targetCode: targetCode || undefined, position: pos as any }); return; }
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
          setDraggedCategoryCode(null); setIsDraggingArticle(false); return;
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
          if (pos === 'inside' && targetCat?.isSuperCategory) {
              targetParentId = targetCode;
              const lastChildIdx = [...newCatsOrder].reverse().findIndex(c => c.parentId === targetCode);
              if (lastChildIdx !== -1) { finalTargetIdx = newCatsOrder.length - lastChildIdx; } else { finalTargetIdx = newCatsOrder.findIndex(c => c.code === targetCode) + 1; }
          } else {
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
          setDraggedCategoryCode(null); playUISound('move');
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
      const newArticlesRaw = sourceArticles.map(art => { const newArtId = Math.random().toString(36).substr(2, 9); let newLinkedAnalysisId = art.linkedAnalysisId; if (newLinkedAnalysisId && analysisIdMap.has(newLinkedAnalysisId)) { newLinkedAnalysisId = analysisIdMap.get(newLinkedAnalysisId)!; } let newMeasurements: Measurement[] = []; if (mode === 'full') { newMeasurements = art.measurements.map(m => ({ ...m, id: Math.random().toString(36).substr(2, 9), linkedArticleId: undefined })); } else if (mode === 'descriptions') { newMeasurements = art.measurements.map(m => ({ ...m, id: Math.random().toString(36).substr(2, 9), linkedArticleId: undefined, length: undefined, width: undefined, height: undefined, multiplier: undefined })); } else { newMeasurements = [{ id: Math.random().toString(36).substr(2, 9), description: '', type: 'positive' }]; } return { ...art, id: newArtId, categoryCode: tempCode, linkedAnalysisId: newLinkedAnalysisId, measurements: newMeasurements, displayMode: wbsDisplayMode } as Article; });
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

  const handleUpdateArticle = (id: string, field: keyof Article, value: any) => { 
    const finalValue = field === 'description' ? cleanDescription(value) : value;
    const updated = articles.map(art => art.id === id ? { ...art, [field]: finalValue } : art); 
    updateState(updated); 
  };
  
  // PATTO DI FERRO: DISTACCO ANALISI SU MODIFICA EDIT
  const handleArticleEditSave = (id: string, updates: Partial<Article>) => { 
    const cleanedUpdates = { ...updates };
    if (cleanedUpdates.description) cleanedUpdates.description = cleanDescription(cleanedUpdates.description);
    if (cleanedUpdates.code) cleanedUpdates.code = cleanDescription(cleanedUpdates.code); // Anche il codice se necessario

    const updated = articles.map(art => {
        if (id === art.id) {
           const isActuallyModified = Object.keys(cleanedUpdates).some(k => (cleanedUpdates as any)[k] !== (art as any)[k]);
           if (isActuallyModified && art.linkedAnalysisId) {
              return { 
                  ...art, 
                  ...cleanedUpdates, 
                  linkedAnalysisId: undefined, 
                  priceListSource: 'Definito dal Progettista' 
              };
           }
           return { ...art, ...cleanedUpdates };
        }
        return art;
    }); 
    updateState(updated); 
  };

  const handleEditArticleDetails = (article: Article) => { setEditingArticle(article); setIsEditArticleModalOpen(true); };
  const handleDeleteArticle = (id: string) => { if (window.confirm("Eliminare la voce?")) { const updated = articles.filter(art => art.id !== id); updateState(updated); } };
  const handleAddMeasurement = (articleId: string) => { 
      const newId = Math.random().toString(36).substr(2, 9); setLastAddedMeasurementId(newId); 
      setArticles(prevArticles => { const updated = prevArticles.map(art => { if (art.id !== articleId) return art; const lastM = art.measurements.length > 0 ? art.measurements[art.measurements.length - 1] : null; let newM: Measurement = { id: newId, description: '', type: 'positive', length: undefined, width: undefined, height: undefined, multiplier: undefined }; if (smartRepeatActiveId === articleId && lastM && lastM.type !== 'subtotal') { newM = { ...newM, description: lastM.description, multiplier: lastM.multiplier, length: lastM.length, width: lastM.width, height: lastM.height, type: lastM.type }; } return { ...art, measurements: [...art.measurements, newM] }; }); return recalculateAllArticles(updated); });
  };
  const handleUpdateMeasurement = (articleId: string, mId: string, field: keyof Measurement, value: string | number | undefined) => { 
      const finalValue = field === 'description' && typeof value === 'string' ? cleanDescription(value) : value;

      // Aggiorna immediatamente l'input visibile nel DOM se presente
      const domEl = document.querySelector(`[data-m-id="${mId}"][data-field="${field}"]`) as HTMLInputElement;
      if (domEl) {
        domEl.value = finalValue === undefined ? '' : String(finalValue);
      }

      // Aggiorna immediatamente articlesRef.current in modo che qualsiasi callback vocale veda i dati aggiornati
      articlesRef.current = articlesRef.current.map(art => {
        if (art.id !== articleId) return art;
        const newMeasurements = art.measurements.map(m => {
          if (m.id !== mId) return m;
          return { ...m, [field]: finalValue };
        });
        return { ...art, measurements: newMeasurements };
      });

      setArticles(prevArticles => { 
          const updated = prevArticles.map(art => { 
              if (art.id !== articleId) return art; 
              const newMeasurements = art.measurements.map(m => { 
                  if (m.id !== mId) return m; 
                  return { ...m, [field]: finalValue }; 
              }); 
              return { ...art, measurements: newMeasurements }; 
          }); 
          if (field === 'description') return updated; // Skip recalculation for description changes to improve performance
          return recalculateAllArticles(updated); 
      });
  };
  const handleAddSubtotal = (articleId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newM: Measurement = { id: Math.random().toString(36).substr(2, 9), description: '', type: 'subtotal' }; return { ...art, measurements: [...art.measurements, newM] }; }); updateState(updated); };
  const handleDeleteMeasurement = (articleId: string, mId: string) => { const updated = articles.map(art => { if (art.id !== articleId) return art; const newMeasurements = art.measurements.filter(m => m.id !== mId); return { ...art, measurements: newMeasurements }; }); updateState(updated); };
  // --- DRAG & DROP MISURAZIONI (SPOSTAMENTO NELLA STESSA VOCE, COPIA TRA VOCI DIVERSE) ---
  const handleMeasurementDrop = (
    sourceArticleId: string, 
    measurementId: string, 
    targetArticleId: string, 
    targetMeasurementId?: string, 
    position: 'top' | 'bottom' = 'bottom'
  ) => {
    const currentArticles = articlesRef.current;
    const sourceArt = currentArticles.find(a => a.id === sourceArticleId);
    const targetArt = currentArticles.find(a => a.id === targetArticleId);
    if (!sourceArt || !targetArt) return;

    const sourceMeas = sourceArt.measurements.find(m => m.id === measurementId);
    if (!sourceMeas) return;

    if (sourceArticleId === targetArticleId) {
      // 1. SPOSTAMENTO DI POSIZIONE NELLA STESSA VOCE (MOVE)
      const currentMeasurements = [...sourceArt.measurements];
      const fromIndex = currentMeasurements.findIndex(m => m.id === measurementId);
      let toIndex = targetMeasurementId 
        ? currentMeasurements.findIndex(m => m.id === targetMeasurementId)
        : currentMeasurements.length - 1;
      
      if (fromIndex === -1 || toIndex === -1) return;
      if (position === 'bottom' && fromIndex > toIndex) toIndex++;
      else if (position === 'top' && fromIndex < toIndex) toIndex--;

      const [movedItem] = currentMeasurements.splice(fromIndex, 1);
      currentMeasurements.splice(toIndex, 0, movedItem);

      const updated = currentArticles.map(art => 
        art.id === sourceArticleId ? { ...art, measurements: currentMeasurements } : art
      );
      updateState(updated);
      playUISound('move');
    } else {
      // 2. COPIA NELL'ALTRA VOCE (COPY ACROSS ARTICLES)
      // "se la sposto di voce la copia nell'altra voce...questa è una unicità del programma..."
      const newMeasId = Math.random().toString(36).substr(2, 9);
      const clonedMeas: Measurement = {
        ...sourceMeas,
        id: newMeasId,
      };

      const targetMeasurements = [...targetArt.measurements];
      let insertIndex = targetMeasurements.length;
      if (targetMeasurementId) {
        const idx = targetMeasurements.findIndex(m => m.id === targetMeasurementId);
        if (idx !== -1) {
          insertIndex = position === 'bottom' ? idx + 1 : idx;
        }
      }

      targetMeasurements.splice(insertIndex, 0, clonedMeas);

      const updated = currentArticles.map(art => {
        if (art.id === targetArticleId) {
          return { ...art, measurements: targetMeasurements };
        }
        return art; // La voce sorgente rimane intatta (COPIA)
      });

      updateState(recalculateAllArticles(updated));
      setLastAddedMeasurementId(newMeasId);
      playUISound('confirm');
    }
  };

  const handleArticleDragStart = (e: React.DragEvent, article: Article) => { setIsDraggingArticle(true); e.dataTransfer.setData(MIME_ARTICLE, 'true'); e.dataTransfer.setData('type', 'ARTICLE'); e.dataTransfer.setData('articleId', article.id); e.dataTransfer.effectAllowed = 'all'; };
  const onArticleDragEnd = () => { setIsDraggingArticle(false); setWbsDropTarget(null); };
  const handleArticleDrop = (e: React.DragEvent, targetArticleId: string, position: 'top' | 'bottom' = 'bottom') => { setIsDraggingArticle(false); setWbsDropTarget(null); const articleId = e.dataTransfer.getData('articleId'); if (!articleId) return; const targetArticle = articles.find(a => a.id === articleId); if (!targetArticle) return; const currentCategoryArticles = articles.filter(a => a.categoryCode === targetArticle.categoryCode); const startIndex = currentCategoryArticles.findIndex(a => a.id === articleId); let targetIndex = currentCategoryArticles.findIndex(a => a.id === targetArticleId); if (startIndex === -1 || targetIndex === -1) return; if (position === 'bottom' && startIndex > targetIndex) targetIndex++; else if (position === 'top' && startIndex < targetIndex) targetIndex--; const otherArticles = articles.filter(a => a.categoryCode !== targetArticle.categoryCode); const newSubset = [...currentCategoryArticles]; const [movedItem] = newSubset.splice(startIndex, 1); newSubset.splice(targetIndex, 0, movedItem); const newGlobalArticles = [...otherArticles, ...newSubset]; updateState(newGlobalArticles); setLastMovedItemId(articleId); setTimeout(() => setLastMovedItemId(null), 3000); };
  const handleOpenLinkModal = (articleId: string, measurementId: string) => { setLinkTarget({ articleId, measurementId }); setIsLinkModalOpen(true); };
  const handleLinkMeasurement = (sourceArticle: Article, type: 'quantity' | 'amount') => { if (!linkTarget) return; const updated = articles.map(art => { if (art.id !== linkTarget.articleId) return art; const newMeasurements = art.measurements.map(m => { if (m.id !== linkTarget.measurementId) return m; return { ...m, linkedArticleId: sourceArticle.id, linkedType: type, length: undefined, width: undefined, height: undefined, description: '', multiplier: undefined, type: 'positive' as const }; }); return { ...art, measurements: newMeasurements }; }); updateState(updated); setIsLinkModalOpen(false); setLinkTarget(null); };
  const handleScrollToArticle = (id: string, fromId?: string, categoryCodeOverride?: string) => { 
    if (fromId) setReturnPath(fromId); 
    const targetArt = articles.find(a => a.id === id); 
    const targetCatCode = categoryCodeOverride || targetArt?.categoryCode;
    if (targetCatCode && selectedCategoryCode !== targetCatCode) {
      setSelectedCategoryCode(targetCatCode);
    }
    setLastMovedItemId(id); 
    setTimeout(() => setLastMovedItemId(null), 4000); 

    const performScroll = () => {
      const element = document.getElementById(`article-${id}`);
      const scrollContainer = scrollContainerRef.current;
      if (element && scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const targetScrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top);
        scrollContainer.scrollTo({
          top: Math.max(0, targetScrollTop - 2),
          behavior: 'smooth'
        });
      }
    };

    setTimeout(performScroll, 50);
    setTimeout(performScroll, 200);
    setTimeout(performScroll, 450);
  };
  const handleReturnToArticle = () => { if (returnPath) { const id = returnPath; setReturnPath(null); handleScrollToArticle(id); } };
  const handleAddEmptyArticle = (categoryCode: string) => { if (!canAddArticle()) return; const nextAnalysisCode = `AP.${(analyses.length + 1).toString().padStart(2, '0')}`; const newArticleId = Math.random().toString(36).substr(2, 9); const newMeasId = Math.random().toString(36).substr(2, 9); const newArticle: Article = { id: newArticleId, categoryCode, code: nextAnalysisCode, description: cleanDescription('Nuova voce'), unit: 'cad', unitPrice: 0, laborRate: 0, linkedAnalysisId: undefined, priceListSource: `Da Analisi ${nextAnalysisCode}`, soaCategory: activeSoaCategory, measurements: [{ id: newMeasId, description: '', type: 'positive', multiplier: undefined }], quantity: 0, displayMode: wbsDisplayMode }; updateState([...articles, newArticle]); setLastAddedMeasurementId(newMeasId); handleScrollToArticle(newArticleId, undefined, categoryCode); };
  const handleToggleArticleLock = (id: string) => { const updated = articles.map(art => art.id === id ? { ...art, isLocked: !art.isLocked } : art); updateState(updated); };
  const handleToggleArticleEnabled = (id: string) => { const updated = articles.map(art => art.id === id ? { ...art, isEnabled: art.isEnabled === false ? true : false } : art); updateState(updated); playUISound('toggle'); };
  const handleOpenRebarCalculator = (articleId: string) => { setRebarTargetArticleId(articleId); setIsRebarModalOpen(true); };
  const handleOpenPaintingCalculator = (articleId: string) => { setPaintingTargetArticleId(articleId); setIsPaintingModalOpen(true); };
  const handleToggleSmartRepeat = (articleId: string) => { if (smartRepeatActiveId === articleId) setSmartRepeatActiveId(null); else setSmartRepeatActiveId(articleId); };
  
  // --- SISTEMA DETTATURA VOCALE OPERATIVA AVANZATA CONTINUA ---
  const focusMeasurementCell = (mId: string, field: VoiceField) => {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-m-id="${mId}"][data-field="${field}"]`) as HTMLInputElement | HTMLTextAreaElement;
      if (el) {
        el.focus();
        if ('select' in el) el.select();
      }
    });
  };

  const handleVoiceAdvance = (articleId: string, currentRowId: string, currentField: VoiceField) => {
    const art = articlesRef.current.find(a => a.id === articleId);
    if (!art) return;
    const fieldIndex = MEASUREMENT_FIELDS.indexOf(currentField);

    if (fieldIndex < MEASUREMENT_FIELDS.length - 1) {
      const nextField = MEASUREMENT_FIELDS[fieldIndex + 1];
      voiceStateRef.current = { articleId, rowId: currentRowId, field: nextField };
      setVoiceActiveField(nextField);
      focusMeasurementCell(currentRowId, nextField);
      playUISound('move');
      setVoiceFeedbackNotice(`Cella: ${nextField.toUpperCase()}`);
    } else {
      // È alla fine del rigo (altezza/peso) e va avanti:
      // "se va avanti crea un rigo nuovo e si posiziona con il cursore sul rigo nella descrizione"
      const newMeasId = Math.random().toString(36).substr(2, 9);
      const newM: Measurement = { id: newMeasId, description: '', type: 'positive' };
      const updated = articlesRef.current.map(a => 
        a.id === articleId ? { ...a, measurements: [...a.measurements, newM] } : a
      );
      updateState(updated);
      setLastAddedMeasurementId(newMeasId);

      voiceStateRef.current = { articleId, rowId: newMeasId, field: 'description' };
      setVoiceActiveRowId(newMeasId);
      setVoiceActiveField('description');
      playUISound('newline');
      setVoiceFeedbackNotice("Nuovo rigo creato • Cella: DESCRIZIONE");
      setTimeout(() => {
        focusMeasurementCell(newMeasId, 'description');
      }, 150);
    }
  };

  const handleVoiceBackward = (articleId: string, currentRowId: string, currentField: VoiceField) => {
    const art = articlesRef.current.find(a => a.id === articleId);
    if (!art) return;
    const fieldIndex = MEASUREMENT_FIELDS.indexOf(currentField);

    if (fieldIndex > 0) {
      const prevField = MEASUREMENT_FIELDS[fieldIndex - 1];
      voiceStateRef.current = { articleId, rowId: currentRowId, field: prevField };
      setVoiceActiveField(prevField);
      focusMeasurementCell(currentRowId, prevField);
      playUISound('move');
      setVoiceFeedbackNotice(`Cella: ${prevField.toUpperCase()}`);
    } else {
      const rowIdx = art.measurements.findIndex(m => m.id === currentRowId);
      if (rowIdx > 0) {
        const prevRow = art.measurements[rowIdx - 1];
        voiceStateRef.current = { articleId, rowId: prevRow.id, field: 'height' };
        setVoiceActiveRowId(prevRow.id);
        setVoiceActiveField('height');
        focusMeasurementCell(prevRow.id, 'height');
        playUISound('move');
        setVoiceFeedbackNotice("Rigo precedente • Cella: ALTEZZA");
      }
    }
  };

  const handleVoiceCellFocus = (rowId: string, field: VoiceField) => {
    if (recordingArticleId) {
      voiceStateRef.current = { articleId: recordingArticleId, rowId, field };
      setVoiceActiveRowId(rowId);
      setVoiceActiveField(field);
    }
  };

  const handleStartVoiceDictation = (articleId: string) => {
    // Se già attiva per questa voce, disattiviamo
    if (isVoiceRunningRef.current && recordingArticleId === articleId) {
      isVoiceRunningRef.current = false;
      if (voiceRecognitionRef.current) {
        try { voiceRecognitionRef.current.stop(); } catch (e) {}
      }
      setRecordingArticleId(null);
      setVoiceActiveRowId(null);
      setVoiceFeedbackNotice(null);
      playUISound('toggle');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Riconoscimento vocale non supportato in questo browser. Usa Google Chrome o Microsoft Edge.");
      return;
    }

    if (voiceRecognitionRef.current) {
      try { 
        isVoiceRunningRef.current = false;
        voiceRecognitionRef.current.stop(); 
      } catch (e) {}
    }

    const targetArticle = articlesRef.current.find(a => a.id === articleId);
    if (!targetArticle) return;

    let activeRowId = targetArticle.measurements[targetArticle.measurements.length - 1]?.id;
    if (!activeRowId) {
      const newMId = Math.random().toString(36).substr(2, 9);
      const newM: Measurement = { id: newMId, description: '', type: 'positive' };
      const updated = articlesRef.current.map(a => a.id === articleId ? { ...a, measurements: [newM] } : a);
      updateState(updated);
      activeRowId = newMId;
    }

    const initialField: VoiceField = 'description';
    voiceStateRef.current = { articleId, rowId: activeRowId, field: initialField };
    setRecordingArticleId(articleId);
    setVoiceActiveRowId(activeRowId);
    setVoiceActiveField(initialField);
    setVoiceFeedbackNotice("Dettatura continua attiva • Parla liberamente");
    isVoiceRunningRef.current = true;
    focusMeasurementCell(activeRowId, initialField);
    playUISound('toggle');

    const recognition = new SpeechRecognition();
    recognition.lang = 'it-IT';
    recognition.continuous = true;
    recognition.interimResults = false;
    voiceRecognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i][0]) {
          transcript += ' ' + event.results[i][0].transcript;
        }
      }
      transcript = transcript.trim();
      if (!transcript) return;

      const { articleId: currArtId, rowId: currRowId, field: currField } = voiceStateRef.current;
      if (!currArtId || !currRowId) return;

      const analysis = analyzeVoiceTranscript(transcript, currField);
      setVoiceFeedbackNotice(`"${transcript}"`);

      // 1. Comando Indietro
      if (analysis.command === 'indietro') {
        handleVoiceBackward(currArtId, currRowId, currField);
        return;
      }

      // 2. Comando Cancella
      if (analysis.command === 'cancella') {
        if (currField === 'description') {
          handleUpdateMeasurement(currArtId, currRowId, 'description', '');
        } else {
          handleUpdateMeasurement(currArtId, currRowId, currField, undefined);
        }
        setVoiceFeedbackNotice("Dato cancellato");
        playUISound('toggle');
        setTimeout(() => focusMeasurementCell(currRowId, currField), 50);
        return;
      }

      // 3. Comando Cancella Rigo
      if (analysis.command === 'cancella_rigo') {
        handleDeleteMeasurement(currArtId, currRowId);
        playUISound('toggle');
        const art = articlesRef.current.find(a => a.id === currArtId);
        const remaining = art?.measurements.filter(m => m.id !== currRowId) || [];
        if (remaining.length > 0) {
          const nextTarget = remaining[remaining.length - 1];
          voiceStateRef.current = { articleId: currArtId, rowId: nextTarget.id, field: 'description' };
          setVoiceActiveRowId(nextTarget.id);
          setVoiceActiveField('description');
          setTimeout(() => focusMeasurementCell(nextTarget.id, 'description'), 100);
        }
        setVoiceFeedbackNotice("Rigo eliminato");
        return;
      }

      // 4. Comando Nuovo Rigo
      if (analysis.command === 'nuovo_rigo') {
        const newMeasId = Math.random().toString(36).substr(2, 9);
        const newM: Measurement = { id: newMeasId, description: '', type: 'positive' };
        const updated = articlesRef.current.map(a => 
          a.id === currArtId ? { ...a, measurements: [...a.measurements, newM] } : a
        );
        updateState(updated);
        setLastAddedMeasurementId(newMeasId);
        voiceStateRef.current = { articleId: currArtId, rowId: newMeasId, field: 'description' };
        setVoiceActiveRowId(newMeasId);
        setVoiceActiveField('description');
        playUISound('newline');
        setVoiceFeedbackNotice("Nuovo rigo creato");
        setTimeout(() => focusMeasurementCell(newMeasId, 'description'), 120);
        return;
      }

      // 5. Comando Parziale
      if (analysis.command === 'parziale') {
        handleAddSubtotal(currArtId);
        playUISound('confirm');
        setVoiceFeedbackNotice("Parziale inserito");
        return;
      }

      // 6. Comando puro AVANTI (senza altri dati inseriti)
      if (analysis.command === 'avanti' && analysis.valueText === undefined && analysis.valueNumber === undefined) {
        handleVoiceAdvance(currArtId, currRowId, currField);
        return;
      }

      // 7. INSERIMENTO VALORE E AVANZAMENTO AUTOMATICO A OGNI RICONOSCIMENTO!
      // "al termine di ogni riconoscimento va avanti automaticamente lungo il rigo"
      // "se in una cella riconosce la parola avanti toglie avanti dalla descrizione e passa alla cella dopo"
      if (currField === 'description') {
        const textVal = analysis.valueText !== undefined ? analysis.valueText : transcript;
        handleUpdateMeasurement(currArtId, currRowId, 'description', textVal);
        handleVoiceAdvance(currArtId, currRowId, 'description');
      } else {
        if (analysis.valueNumber !== undefined) {
          handleUpdateMeasurement(currArtId, currRowId, currField, analysis.valueNumber);
        } else if (analysis.valueText !== undefined) {
          const parsed = parseFloat(analysis.valueText.replace(',', '.'));
          if (!isNaN(parsed)) {
            handleUpdateMeasurement(currArtId, currRowId, currField, parsed);
          }
        }
        handleVoiceAdvance(currArtId, currRowId, currField);
      }
    };

    recognition.onerror = (event: any) => {
      console.warn("SpeechRecognition notice:", event.error);
    };

    // Ascolto continuo: si riavvia automaticamente in onend finché l'utente non clicca per spegnerlo!
    recognition.onend = () => {
      if (isVoiceRunningRef.current) {
        try {
          recognition.start();
        } catch (e) {
          setTimeout(() => {
            if (isVoiceRunningRef.current) {
              try { recognition.start(); } catch (err) {}
            }
          }, 150);
        }
      } else {
        setRecordingArticleId(null);
        setVoiceActiveRowId(null);
        setVoiceFeedbackNotice(null);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.warn("Errore avvio riconoscimento:", e);
    }
  };

  const handleToggleItemDisplayMode = (articleId: string) => {
    const article = articles.find(a => a.id === articleId);
    if (!article) return;
    const next = ((article.displayMode || 0) + 1) % 3;
    handleUpdateArticle(articleId, 'displayMode', next);
    playUISound('cycle');
  };

  const handleCycleDisplayMode = () => { 
    const nextMode = (wbsDisplayMode + 1) % 3; 
    setWbsDisplayMode(nextMode); 
    playUISound('cycle'); 
    const updated = articles.map(a => a.categoryCode === selectedCategoryCode ? { ...a, displayMode: nextMode } : a); 
    updateState(updated); 
  };
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
  const handleAddRebarMeasurement = (measurements: Array<{ diameter: number; weight: number; multiplier: number; length: number; description: string }>) => { 
    const effectiveTargetId = rebarTargetArticleId || articles.find(a => 
      a.unit?.toLowerCase().includes('kg') || 
      a.description?.toLowerCase().includes('acciaio') || 
      a.description?.toLowerCase().includes('ferr') ||
      a.description?.toLowerCase().includes('b450')
    )?.id || articles[0]?.id;

    if (!effectiveTargetId) return;

    const newMeasures: Measurement[] = measurements.map(m => ({ 
      id: Math.random().toString(36).substr(2, 9), 
      description: m.description, 
      type: 'positive' as const, 
      multiplier: m.multiplier, 
      length: m.length, 
      width: undefined, 
      height: m.weight 
    }));

    const updated = articles.map(art => { 
      if (art.id !== effectiveTargetId) return art; 
      return { ...art, measurements: [...art.measurements, ...newMeasures] }; 
    }); 
    updateState(updated); 
    playUISound('confirm');
    setIsRebarModalOpen(false); 
  };
  const handleAddPaintingMeasurements = (paintRows: Array<{ description: string; multiplier: number; length?: number; width?: number; height?: number; type: 'positive' }>) => { if (paintingTargetArticleId) { const updated = articles.map(art => { if (art.id !== paintingTargetArticleId) return art; const newMeasures = paintRows.map(row => ({ ...row, id: Math.random().toString(36).substr(2, 9) })); return { ...art, measurements: [...art.measurements, ...newMeasures] }; }); updateState(updated); setIsPaintingModalOpen(false); } };
  const handleDropContent = (rawText: string) => { if (!canAddArticle()) return; const targetCatCode = activeCategoryForAi || (selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode); const currentCat = categories.find(c => c.code === targetCatCode); if (currentCat && currentCat.isLocked) { alert("Capitolo bloccato."); return; } if (!rawText) return; setIsProcessingDrop(true); setTimeout(() => { try { const parsed = parseDroppedContent(rawText); if (parsed) { const newArtId = Math.random().toString(36).substr(2, 9); const newMeasId = Math.random().toString(36).substr(2, 9); const newArticle: Article = { id: newArtId, categoryCode: targetCatCode, code: parsed.code || 'NP.001', priceListSource: parsed.priceListSource, description: parsed.description || 'Voce importata', unit: parsed.unit || 'cad', unitPrice: parsed.unitPrice || 0, laborRate: parsed.laborRate || 0, soaCategory: activeSoaCategory, measurements: [{ id: newMeasId, description: '', type: 'positive', length: undefined, multiplier: undefined }], quantity: 0, displayMode: wbsDisplayMode }; updateState([...articles, ...[newArticle]]); setLastAddedMeasurementId(newMeasId); handleScrollToArticle(newArtId, undefined, targetCatCode); } } catch (e) { console.error("Drop Parser Error", e); } finally { setIsProcessingDrop(false); } }, 100); };
  const handleBulkGenerateLocal = async (description: string) => { if (!canAddArticle()) return; setIsGenerating(true); try { const generatedItems = await generateBulkItems(description, projectInfo.region, projectInfo.year, categories); if (generatedItems && generatedItems.length > 0) { const newArticles: Article[] = generatedItems.map(item => { const qty = item.quantity || 1; return { id: Math.random().toString(36).substr(2, 9), categoryCode: item.categoryCode || (categories[0]?.code || 'WBS.01'), code: item.code || 'NP.001', priceListSource: item.priceListSource || 'Generato da IA', description: item.description || 'Voce generata', unit: item.unit || 'cad', unitPrice: item.unitPrice || 0, laborRate: item.laborRate || 0, soaCategory: activeSoaCategory, measurements: [{ id: Math.random().toString(36).substr(2, 9), description: 'Voce generata da assistente', type: 'positive', length: qty, multiplier: 1 }], quantity: qty, displayMode: wbsDisplayMode, groundingUrls: (item as any).groundingUrls }; }); updateState([...articles, ...newArticles]); if (newArticles.length > 0) handleScrollToArticle(newArticles[0].id, undefined, newArticles[0].categoryCode); setIsBulkModalOpen(false); } } catch (e) { console.error("Bulk Generation Error:", e); alert("Si è verificato un errore durante la generazione delle voci."); } finally { setIsGenerating(false); } };
  const handleWorkspaceDrop = (e: React.DragEvent) => { 
    e.preventDefault(); e.stopPropagation(); 
    if (draggedCategoryCode) { setIsWorkspaceDragOver(false); return; }
    setIsWorkspaceDragOver(false);
    const analysisId = e.dataTransfer.getData(MIME_ANALYSIS_DRAG);
    if (analysisId) {
        const targetCode = selectedCategoryCode === 'SUMMARY' ? categories[0].code : selectedCategoryCode;
        const analysis = analyses.find(a => a.id === analysisId);
        if (analysis) { handleImportAnalysisToArticle(analysis, targetCode); playUISound('confirm'); }
        setIsDraggingAnalysis(false); setDraggedAnalysisId(null); return;
    }
    const textData = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text'); 
    const isInternal = e.dataTransfer.types.includes(MIME_ARTICLE) || e.dataTransfer.types.includes(MIME_MEASUREMENT) || e.dataTransfer.types.includes('articleId'); 
    if (textData && !isInternal) { try { const payload = JSON.parse(textData); if (payload && payload.type === 'CROSS_TAB_WBS_BUNDLE') { setWbsOptionsContext({ type: 'import', payload, initialName: payload.category.name, position: 'bottom' }); return; } } catch (err) {} handleDropContent(textData); }
  };
  const handleWorkspaceDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (draggedCategoryCode) { e.dataTransfer.dropEffect = 'none'; if (isWorkspaceDragOver) setIsWorkspaceDragOver(false); return; } const isExternal = !e.dataTransfer.types.includes(MIME_ARTICLE) && !e.dataTransfer.types.includes(MIME_MEASUREMENT); if (isExternal && !isWorkspaceDragOver) setIsWorkspaceDragOver(true); e.dataTransfer.dropEffect = 'copy'; };
  const handleToolbarMouseDown = (e: React.MouseEvent) => { setIsDraggingToolbar(true); dragOffset.current = { x: e.clientX - toolbarPos.x, y: e.clientY - toolbarPos.y }; };
  useEffect(() => { const handleGlobalMouseMove = (e: MouseEvent) => { if (isDraggingToolbar) { let nextX = e.clientX - dragOffset.current.x; let nextY = e.clientY - dragOffset.current.y; setToolbarPos({ x: nextX, y: nextY }); } }; const handleGlobalMouseUp = () => setIsDraggingToolbar(false); if (isDraggingToolbar) { window.addEventListener('mousemove', handleGlobalMouseMove); window.addEventListener('mouseup', handleGlobalMouseUp); } return () => { window.removeEventListener('mousemove', handleGlobalMouseMove); window.removeEventListener('mouseup', handleGlobalMouseUp); }; }, [isDraggingToolbar]);
  const getFullProjectExportData = () => { return JSON.stringify({ gecolaData: { projectInfo, categories, articles, analyses }, exportedAt: new Date().toISOString(), app: "GeCoLa Cloud" }, null, 2); };
  
  const handleSmartSave = async (silent: boolean = false, forcePicker: boolean = false) => { 
    const jsonString = getFullProjectExportData(); 
    if ('showSaveFilePicker' in window) { 
      try { 
        let handle = (!forcePicker) ? currentFileHandle : null; 
        if (!handle) { 
          if (silent) return; 
          handle = await (window as any).showSaveFilePicker({ suggestedName: `${projectInfo.title || 'Progetto'}.json`, types: [{ description: 'JSON Project File', accept: { 'application/json': ['.json'] }, }], }); 
          setCurrentFileHandle(handle); 
          const pickedName = handle.name.replace(/\.json$/i, '');
          setProjectInfo(prev => ({ ...prev, title: pickedName }));
        } 
        if (silent) setIsAutoSaving(true); 
        const writable = await handle.createWritable(); 
        await writable.write(jsonString); 
        await writable.close(); 
      } catch (err: any) { 
        if (err.name !== 'AbortError' && !silent) { setIsSaveModalOpen(true); } 
      } finally { 
        if (silent) setTimeout(() => setIsAutoSaving(false), 800); 
      } 
    } else { 
      if (!silent) setIsSaveModalOpen(true); 
    } 
  };
  
  useEffect(() => { if (!currentFileHandle) return; const timeoutId = setTimeout(() => { handleSmartSave(true, false); }, 3000); return () => clearTimeout(timeoutId); }, [articles, categories, projectInfo, analyses, currentFileHandle]);

  const handleOpenProject = async () => {
    // PATTO DI FERRO: RIPRISTINO TASTO APRI CON FALLBACK ROBUSTO
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: 'JSON Project File', accept: { 'application/json': ['.json'] } }],
          multiple: false
        });
        const file = await handle.getFile();
        const content = await file.text();
        const data = JSON.parse(content);
        if (data.gecolaData) {
          setProjectInfo(data.gecolaData.projectInfo);
          updateState(data.gecolaData.articles, data.gecolaData.categories, data.gecolaData.analyses || []);
          setCurrentFileHandle(handle);
          const pickedName = handle.name.replace(/\.json$/i, '');
          setProjectInfo(prev => ({ ...prev, title: pickedName }));
          playUISound('confirm');
        } else {
          alert("Formato file non valido.");
        }
        return; // Successo
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.warn("File System Access API non disponibile o negata, uso fallback legacy:", err);
      }
    }
    
    // Fallback o se API non presente
    fileInputRef.current?.click();
  };

  const handleLoadProjectLegacy = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const content = event.target?.result as string; const data = JSON.parse(content); if (data.gecolaData) { setProjectInfo(data.gecolaData.projectInfo); updateState(data.gecolaData.articles, data.gecolaData.categories, data.gecolaData.analyses || []); } else { alert("Formato non valido."); } setCurrentFileHandle(null); } catch (error) { alert("Errore caricamento."); } }; reader.readAsText(file); e.target.value = ''; };
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter') { const target = e.target as HTMLElement; if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') { if (target.tagName === 'TEXTAREA' && e.shiftKey) return; e.preventDefault(); const inputs = Array.from(document.querySelectorAll('input:not([disabled]), textarea:not([disabled])')); const index = inputs.indexOf(target as HTMLInputElement | HTMLTextAreaElement); if (index > -1 && index < inputs.length - 1) (inputs[index + 1] as HTMLElement).focus(); } } };
  const toggleSuperCollapse = (code: string) => { playUISound('toggle'); setCollapsedSuperCodes(prev => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; }); };
  const activeCategory = useMemo(() => categories.find(c => c.code === selectedCategoryCode), [categories, selectedCategoryCode]);
  const activeArticles = useMemo(() => articles.filter(a => a.categoryCode === selectedCategoryCode), [articles, selectedCategoryCode]);
  const filteredCategories = useMemo(() => { return activeWbsContext === 'safety' ? categories.filter(c => c.type === 'safety') : categories.filter(c => c.type !== 'safety'); }, [categories, activeWbsContext]);
  const topLevelCategories = useMemo(() => filteredCategories.filter(c => !c.parentId), [filteredCategories]);

  return (
    <div className="h-screen flex flex-col bg-slate-900 font-sans overflow-hidden text-slate-800" onDragOver={(e) => { e.preventDefault(); }} onDragEnter={(e) => { e.preventDefault(); }} onClick={() => { if(!globalAudioCtx) globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); globalAudioCtx.resume(); setIsSaveMenuOpen(false); setIsPrintMenuOpen(false); }}>
      <input type="file" ref={fileInputRef} onChange={handleLoadProjectLegacy} className="hidden" accept=".json" />
      {!isOnline && user && user !== 'visitor' && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-500">
            <div className="bg-red-600 p-8 rounded-[3rem] shadow-[0_0_80px_rgba(220,38,38,0.4)] mb-10 animate-pulse border-4 border-white/20"><ShieldAlert className="w-24 h-24 text-white" /></div>
            <h2 className="text-5xl font-black text-white uppercase tracking-tighter mb-4 italic">Security Link Broken</h2>
            <div className="h-1.5 w-32 bg-red-600 rounded-full mb-6"></div>
            <p className="text-slate-400 max-w-lg text-xl font-bold leading-relaxed mb-12">Connessione con il server GeCoLa interrotta.<br/><span className="text-red-500 uppercase tracking-widest font-black">Il software è temporaneamente sospeso</span><br/>per garantire l'integrità del database.</p>
            <div className="flex flex-col items-center gap-4"><div className="flex items-center gap-3 bg-slate-800/80 px-8 py-4 rounded-full border border-slate-700 shadow-2xl"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /><span className="text-sm font-black uppercase tracking-[0.2em] text-blue-100">Riconnessione al Cloud GeCoLa...</span></div><p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Engineering Safety Protocol Active</p></div>
        </div>
      )}
      {authLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 text-white"><Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" /><p className="font-black uppercase tracking-widest text-xs">Sistema in Avvio...</p></div>
      ) : !user ? (
        <Login onVisitorLogin={handleVisitorLogin} />
      ) : (
        <>
          {!isFocusMode && (
            <div className="bg-slate-900 shadow-md z-[100] h-14 flex items-center justify-between px-6 border-b border-slate-800 flex-shrink-0">
                <div className="flex items-center space-x-3 w-72">
                    <div className="bg-gradient-to-br from-orange-500 to-amber-600 p-2 rounded-xl shadow-md"><Calculator className="w-6 h-6 text-white" /></div>
                    <span className="font-extrabold text-lg text-white tracking-tight">GeCoLa <span className="font-normal text-slate-400 text-xs ml-1 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">v12.0</span></span>
                    <button onClick={() => setIsManualOpen(true)} className="ml-2 p-1.5 bg-blue-600/90 hover:bg-blue-600 text-white rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95 group relative"><HelpCircle className="w-4 h-4" /><span className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-bold uppercase px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[9999]">Manuale</span></button>
                </div>
                <div className="flex-1 px-6 flex justify-center items-center gap-6">
                    {isVisitor && (
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5 bg-blue-600/20 border border-blue-500/50 px-3 py-1 rounded-full text-blue-200 text-[10px] font-bold uppercase tracking-wider animate-pulse"><Sparkles className="w-3 h-3" /> Demo Mode</div>
                            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${articles.length >= 15 ? 'bg-red-600 border-red-500 text-white animate-bounce' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>Voci: {articles.length} / 15</div>
                        </div>
                    )}
                    <div className="flex items-center gap-3 bg-slate-800/80 px-5 py-1.5 rounded-xl border border-slate-700/80 text-white cursor-pointer hover:bg-slate-800 hover:border-slate-600 transition-all shadow-sm group" onClick={() => setIsSettingsModalOpen(true)}>
                        {isOnline && (
                          <div className={`w-2.5 h-2.5 rounded-full ${isAutoSaving ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'}`}></div>
                        )}
                        <div className="flex flex-col items-start leading-tight">
                          <span className="truncate max-w-[320px] text-base tracking-tight font-bold uppercase">{projectInfo.title}</span>
                          <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider">OPERATORE: {user !== 'visitor' ? (user as FirebaseUser).email : 'VISITATORE'}</span>
                        </div>
                        <Settings className="w-5 h-5 text-slate-400 group-hover:text-blue-400 group-hover:rotate-90 transition-all duration-300 ml-1" />
                    </div>
                    <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 gap-1">
                        <button onClick={handleUndo} disabled={history.length === 0} className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-all hover:scale-110"><Undo2 className="w-4 h-4" /></button>
                        <div className="w-px h-4 bg-slate-700"></div>
                        <button onClick={handleRedo} disabled={future.length === 0} className="p-1 text-slate-300 hover:text-white disabled:opacity-20 transition-all hover:scale-110"><Redo2 className="w-4 h-4" /></button>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <button onClick={handleResetProject} className="p-2 transition-all text-slate-300 hover:text-emerald-400 hover:scale-105 active:scale-95 group relative" title="Nuovo Progetto"><FilePlus2 className="w-5 h-5" /><span className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-bold uppercase px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-[9999]">Nuovo Progetto</span></button>
                    <button onClick={handleOpenProject} className="p-2 transition-colors text-slate-300 hover:text-orange-400" title="Apri (.json)"><FolderOpen className="w-5 h-5" /></button>
                    <button 
                      onClick={() => { setIsSaveModalOpen(true); playUISound('confirm'); }} 
                      className="px-3 py-1.5 transition-all flex items-center gap-1.5 text-slate-200 hover:text-white bg-blue-600/80 hover:bg-blue-600 border border-blue-500 rounded-lg shadow-xs hover:scale-105 active:scale-95 cursor-pointer"
                      title="Salva con Nome (CME / CM)"
                    >
                      <Save className="w-4 h-4 text-white" />
                      <span className="text-xs font-bold">Salva</span>
                    </button>
                    <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setIsPrintMenuOpen(!isPrintMenuOpen); setIsSaveMenuOpen(false); }} className="p-2 transition-colors text-slate-300 hover:text-white flex items-center gap-1"><FileText className="w-5 h-5" /><ChevronDown className={`w-3 h-3 transition-transform ${isPrintMenuOpen ? 'rotate-180' : ''}`} /></button>
                        {isPrintMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-72 bg-white shadow-2xl rounded-xl py-2 z-[100] border border-slate-200 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150">
                                <button onClick={() => { setIsPrintMenuOpen(false); generateComputoMetricPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 flex items-center gap-3 font-bold"><FileText className="w-4 h-4 text-blue-500" />Computo Estimativo (.pdf)</button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateComputoMetricoSubappaltoPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-2.5 text-sm text-emerald-800 hover:bg-emerald-50 flex items-center gap-3 font-bold border-b border-slate-100"><Briefcase className="w-4 h-4 text-emerald-600" />Computo Metrico Subappalto (.pdf)</button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateDistintaFerriPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-2.5 text-sm text-amber-800 hover:bg-amber-50 flex items-center gap-3 font-bold border-b border-slate-100"><RebarCagePillarIcon className="w-4 h-4" />Distinta Ferri e Sagomario (.pdf)</button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateComputoSicurezzaPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-orange-50 flex items-center gap-3 font-bold"><ShieldAlert className="w-3.5 h-3.5 text-orange-500" />Computo Oneri Sicurezza</button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateElencoPrezziPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-blue-50 flex items-center gap-3"><AlignLeft className="w-3.5 h-3.5 text-slate-500" />Elenco Prezzi Unitari</button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateManodoperaPdf(projectInfo, categories, articles); }} className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-blue-50 flex items-center gap-3"><User className="w-3.5 h-3.5 text-cyan-600" />Stima Manodopera</button>
                                <button onClick={() => { setIsPrintMenuOpen(false); generateAnalisiPrezziPdf(projectInfo, analyses); }} className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-blue-50 flex items-center gap-3"><TestTubes className="w-3.5 h-3.5 text-purple-600" />Analisi Nuovi Prezzi</button>
                            </div>
                        )}
                    </div>
                    <button onClick={handleLogout} className="p-2 text-red-400 hover:text-white ml-2 transition-colors"><LogOut className="w-5 h-5" /></button>
                </div>
            </div>
          )}
          <div className={`flex flex-1 overflow-hidden transition-all duration-500 ${isFocusMode ? 'bg-[#1e293b]' : ''}`}>
            {!isFocusMode && (
                <div className="w-[20.4rem] bg-slate-100 border-r border-slate-200 flex flex-col flex-shrink-0 z-40 shadow-xs transition-all duration-300 relative pl-[6px]">
                <div onMouseEnter={() => startScroll(-3)} onMouseLeave={stopScroll} onDragOver={(e) => { e.preventDefault(); startScroll(-3); }} onDragEnter={(e) => { e.preventDefault(); startScroll(-3); }} onDragLeave={stopScroll} className="absolute top-[135px] left-0 right-0 h-10 z-[100] cursor-n-resize opacity-0 hover:opacity-100 transition-opacity bg-gradient-to-b from-blue-500/40 to-transparent flex items-center justify-center pointer-events-auto"><ChevronUp className={`text-blue-600 animate-bounce w-6 h-6 ${draggedCategoryCode || isDraggingArticle || isDraggingAnalysis ? 'opacity-50' : 'opacity-100'}`} /></div>
                <div onMouseEnter={() => startScroll(3)} onMouseLeave={stopScroll} onDragOver={(e) => { e.preventDefault(); startScroll(3); }} onDragEnter={(e) => { e.preventDefault(); startScroll(3); }} onDragLeave={stopScroll} className="absolute bottom-0 left-0 right-0 h-16 z-[100] cursor-s-resize opacity-0 hover:opacity-100 transition-opacity bg-gradient-to-t from-blue-500/40 to-transparent flex items-center justify-center pointer-events-auto"><ChevronDown className={`text-blue-600 animate-bounce w-8 h-8 ${draggedCategoryCode || isDraggingArticle || isDraggingAnalysis ? 'opacity-50' : 'opacity-100'}`} /></div>
                <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 shadow-xs"><div className="flex items-baseline gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">TOTALE:</span><span className="font-mono font-bold text-slate-900 text-sm tracking-tight">{formatCurrency(totalForView)}</span></div></div>
                <div className="p-1 bg-slate-200/60 border-b border-slate-200 grid grid-cols-5 gap-1 shrink-0">
                    <button onClick={() => { handleViewChange('lavori'); setActiveWbsContext('work'); }} className={`py-2 text-[8.5px] font-bold uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'COMPUTO' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}><HardHat className="w-3.5 h-3.5" /> Lavori</button>
                    <button onClick={() => { handleViewChange('sicurezza'); setActiveWbsContext('safety'); }} className={`py-2 text-[8.5px] font-bold uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'SICUREZZA' ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}><ShieldAlert className="w-3.5 h-3.5" /> Sicur.</button>
                    <button onClick={() => setViewMode('ANALISI')} className={`py-2 text-[8.5px] font-bold uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'ANALISI' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}><TestTubes className="w-3.5 h-3.5" /> Analisi</button>
                    <button onClick={() => setViewMode('SUMMARY')} className={`py-2 text-[8.5px] font-bold uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'SUMMARY' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}><Layers className="w-3.5 h-3.5" /> Riepil.</button>
                    <button onClick={() => setViewMode('CRONOPROGRAMMA')} className={`py-2 text-[8.5px] font-bold uppercase rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${viewMode === 'CRONOPROGRAMMA' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}><Calendar className="w-3.5 h-3.5" /> Crono</button>
                </div>
                <div className="p-1.5 bg-slate-200/40 border-b border-slate-200 grid grid-cols-4 gap-1.5 shrink-0">
                    <button onClick={handleToggleAllCategories} title="ACCENDI/SPEGNI" className="py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all text-slate-500 hover:text-amber-500 flex flex-col items-center justify-center gap-1 shadow-xs"><Lightbulb className="w-3.5 h-3.5" /><span className="text-[6.5px] font-bold uppercase text-slate-500">Luci</span></button>
                    <button onClick={handleAddWbs} title="NUOVA WBS" className="py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all text-slate-500 hover:text-blue-600 flex flex-col items-center justify-center gap-1 shadow-xs"><PlusCircle className="w-3.5 h-3.5" /><span className="text-[6.5px] font-bold uppercase text-slate-500">WBS</span></button>
                    <button onClick={handleAddSuperCategory} title="SUPER CATEGORIA" className="py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all text-slate-500 hover:text-orange-600 flex flex-col items-center justify-center gap-1 shadow-xs"><FolderPlus className="w-3.5 h-3.5" /><span className="text-[6.5px] font-bold uppercase text-slate-500">Super</span></button>
                    <button onClick={handleToggleSurveyorGuard} title="SENTINELLA ATTIVA" className={`py-1.5 rounded-lg border transition-all flex flex-col items-center justify-center gap-1 ${isSurveyorGuardActive ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-inner' : 'bg-white border-slate-200 text-slate-400 hover:text-emerald-600 shadow-xs'}`}><ShieldCheck className="w-3.5 h-3.5" /><span className={`text-[6.5px] font-bold uppercase ${isSurveyorGuardActive ? 'text-emerald-700 font-extrabold' : 'text-slate-500'}`}>Sentry</span></button>
                </div>
                <div ref={sidebarRef} className={`flex-1 overflow-y-auto scrollbar-hide overflow-x-visible ${activeWbsContext === 'safety' ? 'bg-orange-50/20' : 'bg-transparent'}`} onDrop={(e) => handleWbsDrop(e, null)}>
                    <ul className="p-3 space-y-2 pb-5">
                        {topLevelCategories.map((cat) => {
                        const isInsideDropTarget = wbsDropTarget?.code === cat.code && wbsDropTarget?.position === 'inside';
                        const childCategories = filteredCategories.filter(c => c.parentId === cat.code);
                        const isChildSelected = childCategories.some(c => c.code === selectedCategoryCode);
                        const isCollapsed = collapsedSuperCodes.has(cat.code);
                        if (cat.isSuperCategory) {
                            return (
                                <li key={cat.id} className={`relative group/super transition-all ${!cat.isEnabled ? 'opacity-40 grayscale' : ''} ${lastMovedItemId === cat.code ? 'highlight-move' : ''}`} onDragOver={(e) => handleWbsDragOver(e, cat.code)} onDrop={(e) => handleWbsDrop(e, cat.code)}>
                                    {wbsDropTarget?.code === cat.code && wbsDropTarget?.position === 'top' && !isDraggingArticle && !isDraggingAnalysis && (<div className="absolute -top-1 left-0 right-0 h-1.5 bg-blue-600 z-[60] shadow-[0_0_12px_rgba(37,99,235,1)] rounded-full animate-pulse"></div>)}
                                    {wbsDropTarget?.code === cat.code && wbsDropTarget?.position === 'inside' && (<div className="absolute inset-0 border-2 border-orange-500 rounded-2xl bg-orange-500/10 pointer-events-none z-50 animate-pulse"><div className="absolute top-8 left-6 right-6 h-1 bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,1)] rounded-full"></div></div>)}
                                    <div className="flex flex-row items-end group" draggable onDragStart={(e) => handleWbsDragStart(e, cat.code)} onDragEnd={() => setDraggedCategoryCode(null)}>
                                        <div onClick={() => toggleSuperCollapse(cat.code)} className={`px-4 py-1.5 rounded-t-xl border-t border-x text-[8px] font-black uppercase tracking-[0.2em] transition-all flex flex-row items-center gap-2 cursor-pointer select-none shadow-sm text-white max-w-[80%] overflow-hidden`} style={{ backgroundColor: isInsideDropTarget ? '#F97316' : (cat.color || '#CBD5E1'), borderColor: isInsideDropTarget ? '#EA580C' : (cat.color || '#94A3B8'), borderLeftWidth: isChildSelected ? '4px' : '1px', borderLeftColor: 'white' }}><GripVertical className="w-3 h-3 opacity-30" /><ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isCollapsed ? '-rotate-90' : ''}`} /><span className="truncate">{cat.name}</span></div>
                                        <div className="flex mb-0.5 ml-1 gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }} className="p-1.5 bg-white/80 border border-slate-300 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-white shadow-sm transition-all transform active:scale-90"><Settings className="w-3.5 h-3.5" /></button></div>
                                    </div>
                                    <div className={`rounded-b-2xl rounded-tr-2xl border transition-all duration-500 relative ${isInsideDropTarget ? 'border-orange-500 bg-orange-50 shadow-2xl scale-[1.01]' : 'bg-white shadow-sm'} ${isCollapsed ? 'p-0 h-[8px] overflow-hidden' : 'p-2 min-h-[40px]'}`} style={{ borderColor: !isInsideDropTarget ? (cat.color || '#CBD5E1') : undefined }}>
                                        {!isCollapsed && (
                                            <div className="animate-in fade-in duration-500">
                                                <div className="flex flex-col gap-1.5">
                                                  {childCategories.map(child => {
                                                    const isSelectedChild = selectedCategoryCode === child.code;
                                                    const isTargeted = wbsDropTarget?.code === child.code;
                                                    return (
                                                    <div key={child.id} draggable onDragStart={(e) => handleWbsDragStart(e, child.code)} onDragEnd={() => setDraggedCategoryCode(null)} onDragOver={(e) => handleWbsDragOver(e, child.code)} onDrop={(e) => handleWbsDrop(e, child.code)} className={`rounded-xl border-l-4 transition-all duration-300 cursor-pointer flex flex-col group/child relative overflow-visible ${isSelectedChild ? (activeWbsContext === 'safety' ? 'bg-orange-50 shadow-lg translate-x-1 border-orange-500 p-3' : 'bg-blue-50 shadow-lg translate-x-1 border-blue-500 p-3') : 'bg-white border-slate-100 hover:border-slate-300 px-3 py-1.5'} ${lastMovedItemId === child.code ? 'highlight-move' : ''} ${(isDraggingArticle || isDraggingAnalysis) && isTargeted ? 'ring-4 ring-green-500 border-green-600 z-50 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : ''}`}>
                                                      {isTargeted && wbsDropTarget?.position === 'top' && !isDraggingArticle && !isDraggingAnalysis && (<div className={`absolute -top-1.5 left-0 right-0 h-1.5 z-[60] rounded-full animate-pulse ${activeWbsContext === 'safety' ? 'bg-orange-600 shadow-[0_0_12px_rgba(234,88,12,1)]' : 'bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,1)]'}`}></div>)}
                                                      <div className="flex justify-between items-center" onClick={() => setSelectedCategoryCode(prev => prev === child.code ? '' : child.code)}>
                                                          <div className="flex flex-col max-w-[65%]"><div className="flex items-center gap-2"><span className={`text-[8px] font-black font-mono ${isSelectedChild ? (activeWbsContext === 'safety' ? 'text-orange-700' : 'text-blue-700') : 'text-slate-400'}`}>{child.code}</span>{child.soaCategory && <span className={`text-[7px] font-black bg-slate-100 px-1 rounded ${isSelectedChild ? (activeWbsContext === 'safety' ? 'text-orange-800 bg-orange-200/50' : 'text-blue-800 bg-blue-200/50') : 'text-slate-50'}`}>{child.soaCategory}</span>}</div><span className={`font-black uppercase leading-none truncate ${isSelectedChild ? (activeWbsContext === 'safety' ? 'text-orange-900 text-[10px]' : 'text-blue-900 text-[10px]') : 'text-slate-600 text-[10px]'}`}>{child.name}</span></div>
                                                          <div className="flex flex-col items-end gap-1 flex-shrink-0"><span className={`font-mono font-black text-[10px] ${isSelectedChild ? (activeWbsContext === 'safety' ? 'text-orange-700' : 'text-blue-700') : 'text-slate-400'}`}>{formatCurrency(categoryTotals[child.code] || 0)}</span><div className="flex items-center gap-1 opacity-0 group-hover/child:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); handleEditCategory(child); }} className={`p-1 transition-colors ${activeWbsContext === 'safety' ? 'text-orange-600 hover:text-blue-600' : 'text-blue-600 hover:text-orange-600'}`}><Settings className="w-3.3 h-3.3" /></button>{child.isLocked && <Lock className="w-3 h-3 text-red-500" />}</div></div>
                                                      </div>
                                                      {isTargeted && wbsDropTarget?.position === 'bottom' && !isDraggingArticle && !isDraggingAnalysis && (<div className={`absolute -bottom-1.5 left-0 right-0 h-1.5 z-[60] rounded-full animate-pulse ${activeWbsContext === 'safety' ? 'bg-orange-600 shadow-[0_0_12px_rgba(234,88,12,1)]' : 'bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,1)]'}`}></div>)}
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
                            {isTargeted && wbsDropTarget?.position === 'top' && !isDraggingArticle && !isDraggingAnalysis && (<div className={`absolute -top-1 left-0 right-0 h-1.5 z-[60] rounded-full animate-pulse ${activeWbsContext === 'safety' ? 'bg-orange-600 shadow-[0_0_15px_rgba(234,88,12,1)]' : 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,1)]'}`}></div>)}
                            <div draggable onDragStart={(e) => handleWbsDragStart(e, cat.code)} onDragEnd={() => setDraggedCategoryCode(null)} className="cursor-pointer group/wbsrow" onClick={() => setSelectedCategoryCode(prev => prev === cat.code ? '' : cat.code)}>
                                <div className={`w-full text-left rounded-2xl border transition-all duration-300 flex flex-col relative overflow-visible shadow-sm ${isSelected ? (activeWbsContext === 'safety' ? 'bg-orange-50 border-l-[8px] border-orange-500 shadow-xl scale-[1.02] py-3.5' : 'bg-blue-50 border-l-[8px] border-blue-500 shadow-xl scale-[1.02] py-3.5') : 'bg-slate-50 border-slate-200 hover:bg-white py-1.5'} ${(isDraggingArticle || isDraggingAnalysis) && isTargeted ? 'ring-4 ring-green-500 border-green-600 z-50 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : ''}`} style={{ borderLeftColor: isSelected ? undefined : (cat.color || 'transparent') }}>
                                    <div className="px-3.5 h-full flex flex-col justify-between">
                                        <div className="flex flex-row justify-between items-start">
                                            <div className="flex-1 overflow-hidden"><div className="flex items-center gap-2 mb-0.5"><span className={`text-[8px] font-black font-mono px-1.5 py-0.5 rounded shadow-sm text-white`} style={{ backgroundColor: isSelected ? (activeWbsContext === 'safety' ? '#EA580C' : '#2563EB') : (cat.color || (activeWbsContext === 'safety' ? '#F97316' : '#3B82F6')) }}>{cat.code}</span>{cat.soaCategory && <span className={`text-[7px] font-black uppercase px-1 rounded border ${isSelected ? (activeWbsContext === 'safety' ? 'border-orange-200 bg-orange-100 text-orange-800' : 'border-blue-200 bg-blue-100 text-blue-800') : 'border-slate-200 bg-white text-slate-400'}`}>{cat.soaCategory}</span>}{cat.isLocked && <Lock className="w-2.5 h-2.5 text-red-500" />}</div><span className={`font-black block whitespace-normal uppercase leading-tight transition-all ${isSelected ? (activeWbsContext === 'safety' ? 'text-orange-900 text-[11px]' : 'text-blue-900 text-[11px]') : 'text-slate-600 text-[9px] truncate'}`}>{cat.name}</span></div>
                                            <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2"><span className={`font-mono font-black text-[12px] ${isSelected ? (activeWbsContext === 'safety' ? 'text-orange-700' : 'text-blue-700') : 'text-slate-500'}`}>{formatCurrency(categoryTotals[cat.code] || 0)}</span><div className="flex gap-1 opacity-0 group-hover/wbsrow-container:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }} className={`p-1.5 bg-white rounded-lg border transition-all ${activeWbsContext === 'safety' ? 'border-orange-200 text-orange-600 hover:bg-orange-500 hover:text-white' : 'border-blue-200 text-blue-600 hover:bg-blue-500 hover:text-white'}`}><Settings className="w-3.3 h-3.3" /></button></div></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {isTargeted && wbsDropTarget?.position === 'bottom' && !isDraggingArticle && !isDraggingAnalysis && (<div className={`absolute -bottom-1 left-0 right-0 h-1.5 z-[60] rounded-full animate-pulse ${activeWbsContext === 'safety' ? 'bg-orange-600 shadow-[0_0_15px_rgba(234,88,12,1)]' : 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,1)]'}`}></div>)}
                        </li>
                        )})}
                        <li onDragOver={(e) => handleWbsDragOver(e, 'WBS_BOTTOM_TARGET')} onDrop={(e) => handleWbsDrop(e, null)} className={`h-24 transition-all flex flex-col justify-start pt-2 ${wbsDropTarget?.code === 'WBS_BOTTOM_TARGET' ? (activeWbsContext === 'safety' ? 'bg-orange-600/5' : 'bg-blue-600/5') : ''}`}>{wbsDropTarget?.code === 'WBS_BOTTOM_TARGET' && (<div className={`h-1.5 shadow-[0_0_12px_rgba(59,130,246,0.8)] rounded-full animate-pulse mx-4 ${activeWbsContext === 'safety' ? 'bg-orange-600 shadow-orange-600/80' : 'bg-blue-600 shadow-blue-600/80'}`} />)}</li>
                    </ul>
                </div>
                </div>
            )}
            <div className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-500 ${isFocusMode ? 'bg-[#1e293b]' : ''} ${draggedCategoryCode ? 'pointer-events-none select-none opacity-50' : ''}`}>
               {isFocusMode && (
                  <div style={{ left: 15, top: 15 }} className="fixed z-[300] flex items-center gap-3 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-2 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] animate-in slide-in-from-top-4 duration-500 group select-none transition-all">
                    <div onMouseDown={handleToolbarMouseDown} className="p-2 cursor-move text-slate-500 hover:text-blue-400 transition-colors"><GripHorizontal className="w-5 h-5" /></div>
                    <button onClick={() => handleEditCategory(activeCategory!)} className="p-3 rounded-xl bg-white border border-slate-200 text-blue-700 hover:bg-blue-50 transition-all shadow-lg active:scale-95"><Settings className="w-5 h-5" /></button>
                    <div className="flex items-center gap-4 pr-3 mr-1 ml-1"><div className="flex flex-col"><span className="text-[12px] font-black text-white/90 uppercase tracking-tighter max-w-[250px] leading-tight mb-1">{activeCategory?.code} - {activeCategory?.name}</span><span className={`text-lg font-black font-mono tracking-tighter leading-none ${viewMode === 'SICUREZZA' ? 'text-orange-400' : 'text-blue-400'}`}>{formatCurrency(categoryTotals[activeCategory?.code || ''] || 0)}</span></div><div className="h-6 w-[1.5px] bg-slate-700"></div><button onClick={() => { setActiveCategoryForAi(activeCategory?.code || null); setIsImportAnalysisModalOpen(true); }} className={`px-4 py-2 rounded-xl font-black uppercase text-[10px] flex items-center gap-2 shadow-lg transition-all active:scale-95 ${viewMode === 'SICUREZZA' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'} text-white`}><Plus className="w-4 h-4" /> Voce</button></div>
                    <button onClick={() => setIsFocusMode(false)} className="bg-slate-800 hover:bg-orange-600 text-white p-2.5 rounded-xl transition-all active:scale-90"><Minimize2 className="w-4 h-4" /></button>
                  </div>
               )}
               {returnPath && (<button onClick={handleReturnToArticle} className="fixed bottom-12 right-12 z-[250] flex items-center gap-3 bg-blue-600 hover:bg-blue-700 backdrop-blur-lg border border-blue-50 text-blue-100 px-6 py-4 rounded-[2rem] shadow-2xl animate-in slide-in-from-bottom-8"><ArrowLeft className="w-5 h-5" /><b>Torna alla voce</b></button>)}
               {viewMode === 'SUMMARY' ? (
                   <div className="flex-1 overflow-y-auto p-12 bg-white"><Summary totals={totals} info={projectInfo} categories={categories} articles={articles} analyses={analyses} /></div>
               ) : viewMode === 'CRONOPROGRAMMA' ? (
                   <div className="flex-1 overflow-hidden"><ScheduleView categories={categories} articles={articles} projectInfo={projectInfo} offsets={scheduleOffsets} teamSizes={teamSizes} onOffsetChange={(id, val) => setScheduleOffsets(prev => ({ ...prev, [id]: val }))} onTeamSizeChange={(id, val) => setTeamSizes(prev => ({ ...prev, [id]: val }))} onReorderCategories={(newCats) => { const result = renumberCategories(newCats, articles); updateState(result.newArticles, result.newCategories); }} /></div>
               ) : (viewMode === 'COMPUTO' || viewMode === 'SICUREZZA' || viewMode === 'ANALISI') && activeCategory ? (
                   <>
                   {viewMode !== 'ANALISI' && !isFocusMode && (
                       <div className={`flex items-center justify-between p-5 bg-slate-50 rounded-t-3xl border-2 border-b-0 shadow-lg z-[60] ${viewMode === 'SICUREZZA' ? 'border-orange-600' : 'border-blue-700'}`}>
                            <div className="flex items-center gap-5">
                                  <div className="flex flex-col items-center gap-2"><div className={`px-4 py-2.5 rounded-2xl font-black text-2xl shadow-inner text-white w-[145px] text-center transition-all duration-500 transform hover:scale-105`} style={{ backgroundColor: viewMode === 'SICUREZZA' ? '#EA580C' : (activeCategory.color || '#3B82F6') }}>{activeCategory.code}</div>{activeCategory.soaCategory && (<div className={`border px-3 py-1 rounded-full flex items-center gap-1.5 font-black text-[10px] uppercase shadow-xs ${viewMode === 'SICUREZZA' ? 'bg-orange-100 border-orange-200 text-orange-700' : 'bg-purple-100 border-purple-200 text-purple-700'}`}><Award className="w-3 h-3" />Categoria SOA: {activeCategory.soaCategory}</div>)}<div className="flex items-center gap-2"><button onClick={() => handleEditCategory(activeCategory)} title="Impostazioni Capitolo" className={`p-1.5 rounded-lg bg-white border shadow-sm transition-all transform active:scale-95 group relative ${viewMode === 'SICUREZZA' ? 'border-orange-200 text-orange-600 hover:bg-orange-50' : 'border-blue-200 text-blue-700 hover:bg-blue-50'}`}><Settings className="w-3.5 h-3.5" /><span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[7px] font-black uppercase px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-[9999]">Impostazioni</span></button><button onClick={() => setIsFocusMode(true)} title="Focus Mode" className="p-1.5 rounded-lg bg-slate-800 text-white hover:bg-blue-600 shadow-sm transition-all transform active:scale-95 group relative"><Maximize2 className="w-3.5 h-3.5" /><span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[7px] font-black uppercase px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-[9999]">Full Screen</span></button><button onClick={handleCycleDisplayMode} className={`p-1.5 rounded-lg border transition-all shadow-sm group/cycle relative transform active:scale-95 ${wbsDisplayMode === 0 ? 'bg-white text-slate-400 border-slate-200 hover:border-blue-400' : wbsDisplayMode === 1 ? 'bg-indigo-600 text-white border-indigo-700' : wbsDisplayMode === 2 ? 'bg-blue-800 text-white border-blue-900 animate-pulse' : ''}`}><RefreshCw className={`w-3.5 h-3.5 transition-transform duration-700 ${wbsDisplayMode > 0 ? 'rotate-180' : ''}`} /><div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 w-72 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest p-4 rounded-2xl shadow-2xl opacity-0 group-hover/cycle:opacity-100 pointer-events-none transition-all z-[9999] border border-white/10 ring-1 ring-black flex flex-col gap-2 text-center"><div className={`transition-opacity ${wbsDisplayMode === 0 ? 'text-blue-400' : 'opacity-30'}`}>0 - Tutto Aperto</div><div className={`transition-opacity ${wbsDisplayMode === 1 ? 'text-indigo-400' : 'opacity-30'}`}>1 - Revisione</div><div className={`transition-opacity ${wbsDisplayMode === 2 ? 'text-orange-400' : 'opacity-30'}`}>2 - Patto d'Acciaio</div></div></button></div></div>
                                  <div className="flex flex-col ml-6 justify-center"><div className="flex items-center gap-3"><h2 className={`text-2xl font-black uppercase max-w-[550px] whitespace-normal leading-tight tracking-tight ${viewMode === 'SICUREZZA' ? 'text-orange-600' : 'text-blue-600'}`}>{activeCategory.name}</h2></div><div className="mt-3 flex items-center gap-4"><span className={`text-3xl font-mono font-black ${viewMode === 'SICUREZZA' ? 'text-orange-600' : 'text-blue-600'}`}>{formatCurrency(categoryTotals[activeCategory.code] || 0)}</span></div></div>
                            </div>
                            <div className="flex items-center">
                              {/* HELP IN LINEA PREZZARI - AGGIORNATO */}
                               <div className="group/listini relative">
                                <a href="https://www.gecola.it/home/listini" target="_blank" rel="noopener noreferrer" className={`bg-white border-2 px-8 py-4 rounded-2xl font-black text-xs uppercase flex items-center gap-3 shadow-xl transform transition-all active:scale-95 group/btn ${viewMode === 'SICUREZZA' ? 'border-orange-600 text-orange-600 hover:bg-orange-600 hover:text-white' : 'border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white'}`}>
                                  <Database className="w-5 h-5 animate-pulse" />
                                  Sorgente Prezzi Ufficiali
                                  <ExternalLink className="w-4 h-4 opacity-50" />
                                </a>
                                
                                <div className="absolute top-full mt-4 right-0 w-80 bg-slate-950 text-white p-6 rounded-[2.5rem] shadow-2xl opacity-0 group-hover/listini:opacity-100 pointer-events-none transition-all z-[9999] border border-white/10 ring-1 ring-black">
                                    <h4 className={`font-black uppercase text-[10px] tracking-widest mb-4 flex items-center gap-2 ${viewMode === 'SICUREZZA' ? 'text-orange-400' : 'text-blue-400'}`}><Info className="w-4 h-4" /> Supporto Drag & Drop</h4>
                                    
                                    <div className="relative h-24 bg-white/5 rounded-2xl mb-4 flex items-center justify-center overflow-hidden border border-white/5">
                                        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 0)', backgroundSize: '10px 10px' }}></div>
                                        {/* Animation visualizer */}
                                        <div className={`w-16 h-10 border-2 border-dashed rounded-lg flex items-center justify-center relative drop-zone-anim ${viewMode === 'SICUREZZA' ? 'border-orange-500/30' : 'border-blue-500/30'}`}>
                                            <div className="absolute -left-12 top-2 drag-icon-anim">
                                                <MousePointer2 className="w-6 h-6 text-white drop-shadow-lg" />
                                                <div className={`w-8 h-4 rounded border border-white/20 -mt-1 ml-2 ${viewMode === 'SICUREZZA' ? 'bg-orange-600/80' : 'bg-blue-600/80'}`}></div>
                                            </div>
                                            <CornerRightDown className={`w-4 h-4 opacity-40 ${viewMode === 'SICUREZZA' ? 'text-orange-400' : 'text-blue-400'}`} />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <p className="text-[10px] leading-relaxed">
                                            <span className={`font-black ${viewMode === 'SICUREZZA' ? 'text-orange-400' : 'text-blue-400'}`}>PROCEDURA DI AGGANCIO:</span><br/>
                                            1. Apri il listino su <b>gecola.it</b><br/>
                                            2. Trascina la voce desiderata tenendo premuto il <span className="text-white font-bold">tasto sinistro</span> del mouse.<br/>
                                            3. Portala qui sopra e rilascia <span className={`font-bold ${viewMode === 'SICUREZZA' ? 'text-orange-400' : 'text-blue-400'}`}>SOLO quando vedi la luce di aggancio attivo</span>.
                                        </p>
                                        <div className={`p-3 rounded-xl border ${viewMode === 'SICUREZZA' ? 'bg-orange-500/10 border-orange-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                                            <p className={`text-[9px] font-bold ${viewMode === 'SICUREZZA' ? 'text-orange-300' : 'text-blue-300'}`}>GeCoLa Cloud popolerà istantaneamente codice, descrizione, UM e prezzo.</p>
                                        </div>
                                    </div>
                                </div>
                              </div>
                            </div>
                       </div>
                   )}
                   {viewMode === 'ANALISI' ? (
                    <div className="p-10 bg-[#f4f6f8] min-h-full flex-1 overflow-y-auto"><div className="flex justify-between items-end mb-8 border-b-2 border-purple-200 pb-6"><div className="flex items-center gap-6"><div className="bg-purple-600 p-4 rounded-xl shadow-lg ring-4 ring-purple-100"><Database className="w-8 h-8 text-white" /></div><div><h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase italic">Gestionale Analisi Prezzi</h2></div></div><button onClick={() => { setEditingAnalysis(null); setIsAnalysisEditorOpen(true); }} className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-xl font-black uppercase text-xs shadow-xl flex items-center gap-3 transition-all transform active:scale-90"><Plus className="w-5 h-5" /> Nuova Analisi</button></div><div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden ring-1 ring-slate-300/50"><table className="w-full text-left border-collapse table-fixed"><thead className="bg-slate-100 border-b-2 border-purple-100 text-slate-500 text-[10px] font-black uppercase tracking-widest"><tr><th className="p-4 w-12 text-center border-r border-slate-200">#</th><th className="p-4 w-14 text-center border-r border-slate-200">D&D</th><th className="p-4 w-28 border-r border-slate-200">Codice</th><th className="p-4 border-r border-slate-200">Oggetto dell'Analisi</th><th className="p-4 w-24 text-center border-r border-slate-200">U.M.</th><th className="p-4 w-36 text-right border-r border-slate-200">Unitario €</th><th className="p-4 w-52 text-center bg-slate-50">Gestionale</th></tr></thead><tbody className="divide-y divide-slate-100">{analyses.map((analysis, index) => { const isCurrentlyDragging = draggedAnalysisId === analysis.id; const isDragOver = analysisDragOverId === analysis.id; return (<tr key={analysis.id} draggable onDragStart={(e) => handleAnalysisRowDragStart(e, analysis.id)} onDragOver={(e) => handleAnalysisRowDragOver(e, analysis.id)} onDragLeave={() => setAnalysisDragOverId(null)} onDrop={(e) => handleAnalysisRowDrop(e, analysis.id)} onDragEnd={() => { setDraggedAnalysisId(null); setIsDraggingAnalysis(false); }} className={`group transition-all ${isCurrentlyDragging ? 'opacity-30' : 'hover:bg-slate-50/80'} ${isDragOver ? (analysisDropPosition === 'top' ? 'border-t-4 border-t-purple-600' : 'border-b-4 border-b-purple-600') : ''} ${lastMovedItemId === analysis.id ? 'highlight-move' : ''}`}><td className="p-4 text-center font-mono text-[10px] text-slate-400 bg-slate-50/50 border-r border-slate-100">{index + 1}</td><td className="p-4 text-center border-r border-slate-100"><GripVertical className="w-5 h-5 mx-auto text-slate-300 group-hover:text-purple-600 cursor-grab active:cursor-grabbing" /></td><td className="p-4 border-r border-slate-100"><span className="bg-purple-50 text-purple-700 border border-purple-200 font-black font-mono text-xs px-3 py-1 rounded-lg shadow-sm">{analysis.code}</span></td><td className="p-4 border-r border-slate-100"><p className="font-bold text-slate-700 text-xs leading-relaxed line-clamp-2 uppercase tracking-tighter">{analysis.description}</p></td><td className="p-4 text-center border-r border-slate-100"><span className="text-[10px] font-black text-slate-500 uppercase px-2 py-1 bg-slate-100 rounded border border-slate-200">{analysis.unit}</span></td><td className="p-4 text-right border-r border-slate-100"><span className="text-lg font-black text-purple-800 font-mono tracking-tighter leading-none">{formatCurrency(analysis.totalUnitPrice)}</span></td><td className="p-4 text-center bg-slate-50/30"><div className="flex items-center justify-center gap-1.5 px-2"><button onClick={() => handleImportAnalysisToArticle(analysis)} className="bg-emerald-600 text-white p-2 rounded-lg shadow-lg hover:bg-emerald-700 transition-all flex items-center gap-2 px-3 transform active:scale-90" title="Importa in Computo"><ArrowRight className="w-3.5 h-3.5" /><span className="text-[9px] font-black uppercase">Importa</span></button><button onClick={() => { setEditingAnalysis(analysis); setIsAnalysisEditorOpen(true); }} className="bg-white border border-slate-200 text-slate-600 hover:text-purple-600 hover:border-purple-300 p-2 rounded-lg shadow-sm transition-all transform active:scale-90" title="Modifica"><PenLine className="w-4 h-4" /></button><button onClick={() => { const newAnalyses = analyses.map(an => an.id === analysis.id ? { ...an, isLocked: !an.isLocked } : an); updateState(articles, categories, newAnalyses); }} className={`p-2 rounded-lg border transition-all transform active:scale-90 ${analysis.isLocked ? 'text-red-600 bg-red-50 border-red-200' : 'text-slate-400 bg-white border-slate-200 hover:text-blue-600'}`}>{analysis.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}</button><button onClick={() => handleDeleteAnalysis(analysis.id)} className="bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 p-2 rounded-lg shadow-sm transition-all transform active:scale-90" title="Elimina"><Trash2 className="w-4 h-4" /></button></div></td></tr>); })}</tbody></table></div></div>
                   ) : (
                   <>
                   {/* BARRA INTESTAZIONI FISSA E IMMOBILE - NON SI SPOSTA E NON SPARISCE MAI */}
                   <div 
                     className={`px-6 bg-slate-100 border-x border-slate-200/90 z-30 select-none shadow-xs flex-shrink-0 computo-header-container ${viewMode === 'SICUREZZA' ? 'border-orange-200/80' : 'border-blue-200/80'}`}
                     style={{ paddingRight: `calc(1.5rem + ${scrollbarWidth}px)` }}
                   >
                     <table className="w-full text-left border-separate border-spacing-0 table-fixed bg-slate-100">
                       <colgroup>
                         <col style={{ width: '46px' }} />
                         <col style={{ width: projectInfo.tariffColumnWidth ? `${projectInfo.tariffColumnWidth}px` : '135px' }} />
                         <col style={{ width: 'auto' }} />
                         <col style={{ width: '44px' }} />
                         <col style={{ width: '54px' }} />
                         <col style={{ width: '54px' }} />
                         <col style={{ width: '54px' }} />
                         <col style={{ width: '74px' }} />
                         <col style={{ width: '84px' }} />
                         <col style={{ width: '96px' }} />
                         <col style={{ width: '84px' }} />
                       </colgroup>
                       <TableHeader activeColumn={activeColumn} tariffWidth={projectInfo.tariffColumnWidth} isSafety={viewMode === 'SICUREZZA'} />
                     </table>
                   </div>

                   <div 
                     ref={scrollContainerRef}
                     className={`flex-1 overflow-y-auto overflow-x-hidden border-x border-b border-slate-200/90 flex flex-col relative scroll-smooth bg-slate-100/50 computo-scroll-container ${isWorkspaceDragOver ? 'ring-8 ring-blue-400 ring-inset animate-pulse bg-blue-50/50' : ''}`} 
                     onKeyDown={handleInputKeyDown} 
                     onDragOver={handleWorkspaceDragOver} 
                     onDragLeave={() => setIsWorkspaceDragOver(false)} 
                     onDrop={handleWorkspaceDrop}
                   >
    <div className={`flex-1 flex flex-col min-h-full px-6 pt-0 pb-12 relative`}>
        <table className="w-full text-left border-separate border-spacing-0 relative bg-white shadow-sm rounded-b-xl table-fixed">
            <colgroup>
              <col style={{ width: '46px' }} />
              <col style={{ width: projectInfo.tariffColumnWidth ? `${projectInfo.tariffColumnWidth}px` : '135px' }} />
              <col style={{ width: 'auto' }} />
              <col style={{ width: '44px' }} />
              <col style={{ width: '54px' }} />
              <col style={{ width: '54px' }} />
              <col style={{ width: '54px' }} />
              <col style={{ width: '74px' }} />
              <col style={{ width: '84px' }} />
              <col style={{ width: '96px' }} />
              <col style={{ width: '84px' }} />
            </colgroup>
                                {activeArticles.length === 0 ? (
                                    <tbody><tr><td colSpan={11} className="py-24"><div className={`flex flex-col items-center gap-8 max-w-2xl mx-auto p-12 rounded-[3.5rem] border-4 border-dashed text-center space-y-4 ${viewMode === 'SICUREZZA' ? 'border-orange-100 bg-orange-50/30' : 'border-blue-100 bg-slate-50/30'}`}><div className={`p-8 rounded-[2.5rem] shadow-inner bg-white border ${viewMode === 'SICUREZZA' ? 'text-orange-200 border-orange-50' : 'text-blue-200 border-blue-50'}`}><Zap className="w-16 h-16" /></div><h3 className={`text-3xl font-black uppercase tracking-tighter text-slate-400`}>Capitolo Vuoto</h3></div></td></tr></tbody>
                                ) : (
                                    activeArticles.map((article, artIndex) => (
                                        <ArticleGroup key={article.id} article={article} index={artIndex} globalIndex={globalArticleIndexMap.get(article.id) || 0} allArticles={articles} isPrintMode={false} isCategoryLocked={activeCategory.isLocked} isSurveyorGuardActive={isSurveyorGuardActive} projectSettings={projectInfo} lastMovedItemId={lastMovedItemId} recordingArticleId={recordingArticleId} onUpdateArticle={handleUpdateArticle} onEditArticleDetails={handleEditArticleDetails} onDeleteArticle={handleDeleteArticle} onToggleArticleEnabled={handleToggleArticleEnabled} onAddMeasurement={handleAddMeasurement} onAddSubtotal={handleAddSubtotal} onUpdateMeasurement={handleUpdateMeasurement} onDeleteMeasurement={handleDeleteMeasurement} onOpenLinkModal={handleOpenLinkModal} onScrollToArticle={handleScrollToArticle} onArticleDragStart={handleArticleDragStart} onArticleDrop={handleArticleDrop} onArticleDragEnd={onArticleDragEnd} lastAddedMeasurementId={lastAddedMeasurementId} onColumnFocus={setActiveColumn} onViewAnalysis={handleViewLinkedAnalysis} onInsertExternalArticle={handleInsertExternalArticle} onToggleArticleLock={handleToggleArticleLock} onOpenRebarCalculator={handleOpenRebarCalculator} onOpenPaintingCalculator={handleOpenPaintingCalculator} onToggleSmartRepeat={handleToggleSmartRepeat} onToggleItemDisplayMode={handleToggleItemDisplayMode} onStartVoiceDictation={handleStartVoiceDictation} smartRepeatActiveId={smartRepeatActiveId} onMeasurementDrop={handleMeasurementDrop} voiceActiveRowId={voiceActiveRowId} voiceActiveField={voiceActiveField} onVoiceCellFocus={handleVoiceCellFocus} onOpenContextMenu={handleOpenContextMenu} />
                                    ))
                                )}
                            </table>
                            <div className="h-[calc(100vh-280px)] flex-shrink-0 pointer-events-none" />
                      </div>
                   </div>
                   </>
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
          <RebarCalculatorModal 
            isOpen={isRebarModalOpen} 
            onClose={() => setIsRebarModalOpen(false)} 
            onAdd={handleAddRebarMeasurement} 
            articles={articles}
            targetArticleId={rebarTargetArticleId}
            onSelectTargetArticle={(id) => setRebarTargetArticleId(id)}
          />
          <PaintingCalculatorModal isOpen={isPaintingModalOpen} onClose={() => setIsPaintingModalOpen(false)} onAdd={handleAddPaintingMeasurements} />
          {contextMenuTarget && (
            <ComputoContextMenu
              x={contextMenuTarget.x}
              y={contextMenuTarget.y}
              article={contextMenuTarget.article}
              measurement={contextMenuTarget.measurement}
              globalIndex={globalArticleIndexMap.get(contextMenuTarget.article.id) || 0}
              isSafety={viewMode === 'SICUREZZA' || contextMenuTarget.article.categoryCode.startsWith('S.')}
              isLocked={activeCategory?.isLocked || contextMenuTarget.article.isLocked}
              onAddMeasurement={handleAddMeasurement}
              onAddSubtotal={handleAddSubtotal}
              onAddSameMeasure={handleAddSameMeasure}
              onToggleDeduction={handleToggleDeductionMeasurement}
              onSetMeasurementType={handleSetMeasurementType}
              onAddMeasurementWithType={handleAddMeasurementWithType}
              onDeleteMeasurement={handleDeleteMeasurement}
              onToggleArticleEnabled={handleToggleArticleEnabled}
              onOpenRebarCalculator={handleOpenRebarCalculator}
              onClose={() => setContextMenuTarget(null)}
            />
          )}

          {/* BANNER FLUTTUANTE CONTROLLO DETTATURA VOCALE CONTINUA */}
          {recordingArticleId && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[250] bg-slate-950/95 text-white px-5 py-3 rounded-2xl shadow-2xl border-2 border-purple-500/80 backdrop-blur-md flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
              <div className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center p-2 bg-purple-600 rounded-xl text-white shadow-md">
                  <Mic className="w-5 h-5 animate-pulse" />
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900"></span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-purple-300">
                      Dettatura Continua Attiva
                    </span>
                    <span className="bg-purple-900/80 border border-purple-400 text-purple-200 text-[10px] font-black uppercase px-2 py-0.5 rounded-full font-mono">
                      Cella: {voiceActiveField === 'description' ? 'Descrizione' : voiceActiveField === 'multiplier' ? 'Parti Uguali' : voiceActiveField === 'length' ? 'Lunghezza' : voiceActiveField === 'width' ? 'Larghezza' : 'Altezza/Peso'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-medium truncate max-w-md">
                    {voiceFeedbackNotice || "Parla liberamente lungo il rigo. Dì 'Avanti' per avanzare o creare un nuovo rigo."}
                  </div>
                </div>
              </div>

              <div className="hidden md:flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
                <span className="text-purple-400 font-bold">Comandi:</span>
                <span>"Avanti"</span> • <span>"Indietro"</span> • <span>"Cancella"</span> • <span>"Nuovo rigo"</span>
              </div>

              <button
                onClick={() => handleStartVoiceDictation(recordingArticleId)}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all shadow hover:scale-105 active:scale-95 cursor-pointer whitespace-nowrap"
                title="Spegni riconoscimento vocale"
              >
                Disattiva
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default App;