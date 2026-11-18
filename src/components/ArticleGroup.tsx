import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  Trash2,
  MinusCircle,
  Link as LinkIcon,
  Link2Off,
  PenLine,
  Lock,
  Unlock,
  GripVertical,
  Sigma,
  TestTubes,
  Headset,
  CopyPlus,
  Paintbrush,
  Layers,
  AlertTriangle,
  Power,
  PowerOff,
} from 'lucide-react';
import { Article, Measurement, ProjectInfo } from '../types';
import { VoiceField } from '../services/voiceDictationService';
import {
  MIME_ARTICLE,
  MIME_MEASUREMENT,
  MIME_ANALYSIS_DRAG,
  playUISound,
  formatNumber,
  formatResult,
  getDynamicNumberFontSize,
  getWbsNumber,
  getRank,
  calculateRowValueWithContext,
} from '../utils/computoHelpers';

export interface TableHeaderProps {
  activeColumn: string | null;
  tariffWidth?: number;
  isSafety?: boolean;
}

export const TableHeader: React.FC<TableHeaderProps> = ({ activeColumn, tariffWidth, isSafety }) => (
  <thead className="select-none shadow-sm border-b-2 border-slate-300">
    <tr className="text-[10px] uppercase font-bold tracking-wider text-slate-700">
      <th className="bg-slate-100 py-3 px-2 text-center w-[46px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">
        N.
      </th>
      <th
        className="bg-slate-100 py-3 px-2.5 text-left border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]"
        style={{ width: tariffWidth ? `${tariffWidth}px` : '135px' }}
      >
        Tariffa
      </th>
      <th
        className={`py-3 px-3 text-left border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1] ${
          activeColumn === 'desc'
            ? isSafety
              ? 'bg-orange-100 text-orange-950 font-extrabold'
              : 'bg-blue-100 text-blue-950 font-extrabold'
            : 'bg-slate-100'
        }`}
      >
        <span>Designazione dei Lavori</span>
      </th>
      <th
        className={`py-3 px-1 text-center w-[44px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1] ${
          activeColumn === 'mult'
            ? isSafety
              ? 'bg-orange-100 text-orange-950 font-extrabold'
              : 'bg-blue-100 text-blue-950 font-extrabold'
            : 'bg-slate-100'
        }`}
      >
        Par.Ug.
      </th>
      <th
        className={`py-3 px-1 text-center w-[54px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1] ${
          activeColumn === 'len'
            ? isSafety
              ? 'bg-orange-100 text-orange-950 font-extrabold'
              : 'bg-blue-100 text-blue-950 font-extrabold'
            : 'bg-slate-100'
        }`}
      >
        Lung.
      </th>
      <th
        className={`py-3 px-1 text-center w-[54px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1] ${
          activeColumn === 'wid'
            ? isSafety
              ? 'bg-orange-100 text-orange-950 font-extrabold'
              : 'bg-blue-100 text-blue-950 font-extrabold'
            : 'bg-slate-100'
        }`}
      >
        Larg.
      </th>
      <th
        className={`py-3 px-1 text-center w-[54px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1] ${
          activeColumn === 'h'
            ? isSafety
              ? 'bg-orange-100 text-orange-950 font-extrabold'
              : 'bg-blue-100 text-blue-950 font-extrabold'
            : 'bg-slate-100'
        }`}
      >
        H/Peso
      </th>
      <th className="bg-slate-200 py-3 px-2 text-center w-[74px] border-r border-b-2 border-slate-300 font-extrabold text-slate-800 shadow-[inset_0_-2px_0_#94a3b8]">
        Quantità
      </th>
      <th className="bg-slate-100 py-3 px-2 text-right w-[84px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">
        Prezzo €
      </th>
      <th className="bg-slate-100 py-3 px-2 text-right w-[96px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">
        Importo €
      </th>
      <th className="bg-slate-100 py-3 px-2 text-right w-[84px] border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">
        M.O. €
      </th>
    </tr>
  </thead>
);

interface FastInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  initialValue: string;
  onCommit: (value: string) => void;
}

export const FastInput: React.FC<FastInputProps> = ({ initialValue, onCommit, ...props }) => {
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

interface FastTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  initialValue: string;
  onCommit: (value: string) => void;
}

export const FastTextarea: React.FC<FastTextareaProps> = ({ initialValue, onCommit, ...props }) => {
  const [val, setVal] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDirtyRef = useRef(false);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(22, el.scrollHeight)}px`;
  };

  useEffect(() => {
    setVal(initialValue);
    isDirtyRef.current = false;
    // Evita forced reflow su migliaia di celle vuote o corte a singola riga durante lo scroll virtualizzato
    if (initialValue && (initialValue.includes('\n') || initialValue.length >= 42)) {
      const raf = requestAnimationFrame(adjustHeight);
      return () => cancelAnimationFrame(raf);
    } else if (textareaRef.current && textareaRef.current.style.height && textareaRef.current.style.height !== '22px') {
      textareaRef.current.style.height = '22px';
    }
  }, [initialValue]);

  useEffect(() => {
    if (props.autoFocus && textareaRef.current) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
        adjustHeight();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [props.autoFocus]);

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (props.onBlur) props.onBlur(e);
    if (isDirtyRef.current && val !== initialValue) {
      isDirtyRef.current = false;
      onCommit(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isDirtyRef.current && val !== initialValue) {
        isDirtyRef.current = false;
        onCommit(val);
      }
      if (props.onKeyDown) props.onKeyDown(e);
      return;
    }
    if (props.onKeyDown) props.onKeyDown(e);
  };

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      {...props}
      value={val}
      onChange={(e) => {
        isDirtyRef.current = true;
        setVal(e.target.value);
        adjustHeight();
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

interface FastNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  initialValue: number | undefined;
  onCommit: (value: number | undefined) => void;
  'data-m-id'?: string;
  'data-field'?: string;
}

export const FastNumberInput: React.FC<FastNumberInputProps> = ({ initialValue, onCommit, ...props }) => {
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

  const field = props['data-field'];
  const threshold = field === 'multiplier' ? 4 : 5;
  const dynamicFontSize = getDynamicNumberFontSize(val, 13.5, threshold, 8.5);

  return (
    <input
      ref={inputRef}
      {...props}
      type="number"
      step={props.step ?? 'any'}
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
      title={props.title || val}
    />
  );
};

// Icona Pilastrino 3D con 4 ferri verticali interni e 3 staffe sagomate esterne
export const RebarCagePillarIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="7.5" y1="2" x2="7.5" y2="22" stroke="currentColor" strokeWidth="1.6" className="text-cyan-500" />
    <line x1="16.5" y1="2" x2="16.5" y2="22" stroke="currentColor" strokeWidth="1.6" className="text-cyan-500" />
    <line x1="12" y1="5.5" x2="12" y2="23.5" stroke="currentColor" strokeWidth="1.8" className="text-cyan-600" />
    <line
      x1="12"
      y1="1"
      x2="12"
      y2="19.5"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeDasharray="1.5 1.5"
      opacity="0.6"
      className="text-cyan-400"
    />
    <polygon points="5,6 12,2.5 19,6 12,9.5" stroke="currentColor" strokeWidth="1.6" fill="none" className="text-orange-500" />
    <polygon points="5,12 12,8.5 19,12 12,15.5" stroke="currentColor" strokeWidth="1.6" fill="none" className="text-orange-500" />
    <polygon points="5,18 12,14.5 19,18 12,21.5" stroke="currentColor" strokeWidth="1.6" fill="none" className="text-orange-500" />
  </svg>
);

export interface ArticleGroupProps {
  article: Article;
  index: number;
  globalIndex: number;
  allArticlesMap: Map<string, Article>;
  articleLocalNumberMap: Map<string, string>;
  isPrintMode: boolean;
  isCategoryLocked?: boolean;
  isSurveyorGuardActive: boolean;
  projectSettings: ProjectInfo;
  lastMovedItemId: string | null;
  recordingArticleId: string | null;
  onUpdateArticle: (id: string, field: keyof Article, value: any) => void;
  onEditArticleDetails: (article: Article) => void;
  onUpdateMeasurement: (articleId: string, mId: string, field: keyof Measurement, value: any) => void;
  onDeleteMeasurement: (articleId: string, mId: string) => void;
  onAddMeasurement: (articleId: string) => void;
  onAddSubtotal: (articleId: string) => void;
  onOpenLinkModal: (articleId: string, measurementId: string) => void;
  onScrollToArticle: (id: string, fromId?: string) => void;
  onViewAnalysis: (analysisId: string, articleId?: string) => void;
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
  onMeasurementDrop?: (
    sourceArticleId: string,
    measurementId: string,
    targetArticleId: string,
    targetMeasurementId?: string,
    position?: 'top' | 'bottom'
  ) => void;
  voiceActiveRowId?: string | null;
  voiceActiveField?: VoiceField;
  onVoiceCellFocus?: (rowId: string, field: VoiceField) => void;
  onOpenContextMenu?: (e: React.MouseEvent, article: Article, measurement?: Measurement | null) => void;
  onTbodyRef?: (articleId: string, el: HTMLTableSectionElement | null) => void;
}

const ArticleGroupComponent: React.FC<ArticleGroupProps> = (props) => {
  const {
    article,
    index,
    globalIndex,
    allArticlesMap,
    articleLocalNumberMap,
    isPrintMode,
    isCategoryLocked,
    isSurveyorGuardActive,
    projectSettings,
    lastMovedItemId,
    recordingArticleId,
    onUpdateArticle,
    onEditArticleDetails,
    onDeleteArticle,
    onToggleArticleEnabled,
    onAddMeasurement,
    onAddSubtotal,
    onUpdateMeasurement,
    onDeleteMeasurement,
    onOpenLinkModal,
    onScrollToArticle,
    onInsertExternalArticle,
    onToggleArticleLock,
    onOpenRebarCalculator,
    onOpenPaintingCalculator,
    onToggleSmartRepeat,
    onStartVoiceDictation,
    smartRepeatActiveId,
    onViewAnalysis,
    lastAddedMeasurementId,
    onColumnFocus,
    onToggleItemDisplayMode,
    onArticleDragStart,
    onArticleDrop,
    onArticleDragEnd,
    onOpenContextMenu,
    onMeasurementDragStart,
    onMeasurementDrop,
    voiceActiveRowId,
    voiceActiveField,
    onVoiceCellFocus,
    onTbodyRef,
  } = props;

  const [measurementDragOverId, setMeasurementDragOverId] = useState<string | null>(null);
  const [measurementDropPosition, setMeasurementDropPosition] = useState<'top' | 'bottom' | null>(null);
  const [isArticleDragOver, setIsArticleDragOver] = useState(false);
  const [articleDropPosition, setArticleDropPosition] = useState<'top' | 'bottom' | null>(null);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [touchedRowIds, setTouchedRowIds] = useState<Set<string>>(new Set());

  const addBtnRef = useRef<HTMLButtonElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);

  const setCombinedTbodyRef = (el: HTMLTableSectionElement | null) => {
    tbodyRef.current = el;
    onTbodyRef?.(article.id, el);
  };

  const isArticleLocked = article.isLocked || false;
  const isArticleDisabled = article.isEnabled === false;
  const areControlsDisabled = Boolean(isCategoryLocked || isArticleLocked);

  const individualDisplayMode = article.displayMode || 0;
  const isIndustrialMode = individualDisplayMode === 2; // Patto d'Acciaio
  const isConciseMode = individualDisplayMode === 1; // Revisione
  const isSafetyCategory = article.categoryCode.startsWith('S.');

  const handleCycleLocal = () => {
    if (isCategoryLocked) return;
    onToggleItemDisplayMode(article.id);
  };

  const getSurveyorWarning = (
    m: Measurement
  ): { msg: string; severity: 'error' | 'warning'; isVisible: boolean; isExcess: boolean; missingFields: string[] } | null => {
    if (!isSurveyorGuardActive || m.type === 'subtotal') return null;
    if (m.pdfQuantity !== undefined || (m.description && m.description.toLowerCase().includes('vedi voce'))) return null;

    const targetRank = getRank(article.unit);
    if (targetRank === 0) return null;

    const isCurrentlyFocused = focusedRowId === m.id;
    const hasAnyLocalData = Boolean(
      m.description ||
        (m.length !== undefined && m.length !== 0) ||
        (m.width !== undefined && m.width !== 0) ||
        (m.height !== undefined && m.height !== 0) ||
        (m.multiplier !== undefined && m.multiplier !== 0)
    );

    let sourceRank = 0;
    if (m.linkedArticleId) {
      const src = allArticlesMap.get(m.linkedArticleId);
      if (src) sourceRank = getRank(src.unit);
    }

    const localFields = ['length', 'width', 'height'];
    const possibleLocalFields = localFields.slice(sourceRank, 3);
    const filledLocalFields = possibleLocalFields.filter(
      (f) => (m as any)[f] !== undefined && (m as any)[f] !== 0 && (m as any)[f] !== null
    );

    const totalEffectiveDims = sourceRank + filledLocalFields.length;

    if (totalEffectiveDims > targetRank) {
      return {
        msg: `COERENZA: Rilevate ${totalEffectiveDims} dimensioni. Per ${article.unit} ne bastano ${targetRank}.`,
        severity: 'error',
        isVisible: true,
        isExcess: true,
        missingFields: [],
      };
    }

    const isVisibleWarning =
      totalEffectiveDims < targetRank &&
      (!!m.linkedArticleId || (!isCurrentlyFocused && hasAnyLocalData && touchedRowIds.has(m.id)));

    if (totalEffectiveDims < targetRank) {
      const missing = possibleLocalFields.filter((f) => !filledLocalFields.includes(f));
      return {
        msg: `CONTABILITÀ: Mancano ${targetRank - totalEffectiveDims} dimensioni per soddisfare l'unità ${article.unit}.`,
        severity: 'warning',
        isVisible: isVisibleWarning,
        isExcess: false,
        missingFields: missing,
      };
    }

    return null;
  };

  useEffect(() => {
    if (lastAddedMeasurementId === 'ADD_BUTTON_FOCUS' + article.id) {
      addBtnRef.current?.focus();
    }
  }, [lastAddedMeasurementId, article.id]);

  const handleMeasKeyDown = (e: React.KeyboardEvent, mId: string, currentField: string, isLastRow: boolean) => {
    const rowIdx = article.measurements.findIndex((m) => m.id === mId);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIdx < article.measurements.length - 1) {
        const nextRowId = article.measurements[rowIdx + 1].id;
        const target = document.querySelector(`[data-m-id="${nextRowId}"][data-field="${currentField}"]`) as HTMLElement | null;
        if (target) {
          target.focus();
          playUISound('move');
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIdx > 0) {
        const prevRowId = article.measurements[rowIdx - 1].id;
        const target = document.querySelector(`[data-m-id="${prevRowId}"][data-field="${currentField}"]`) as HTMLElement | null;
        if (target) {
          target.focus();
          playUISound('move');
        }
      }
    }

    if (e.key === 'Enter') {
      if (currentField === 'description') {
        e.preventDefault();
        const target = document.querySelector(`[data-m-id="${mId}"][data-field="multiplier"]`) as HTMLElement | null;
        if (target) {
          target.focus();
          playUISound('move');
        }
      } else if (isLastRow && currentField === 'height' && !areControlsDisabled) {
        e.preventDefault();
        onAddMeasurement(article.id);
        playUISound('newline');
      }
    }
  };

  const getLinkedInfo = (m: Measurement) => {
    if (!m.linkedArticleId) return null;
    return allArticlesMap.get(m.linkedArticleId) || null;
  };

  const getLinkedArticleNumber = (linkedArt: Article) => {
    return articleLocalNumberMap.get(linkedArt.id) || `${getWbsNumber(linkedArt.categoryCode)}.1`;
  };

  let runningPartialSum = 0;
  const processedMeasurements = article.measurements.map((m) => {
    let val = 0;
    if (m.type !== 'subtotal') {
      if (m.linkedArticleId) {
        const linkedArt = allArticlesMap.get(m.linkedArticleId);
        if (linkedArt) {
          const baseVal = m.linkedType === 'amount' ? linkedArt.quantity * linkedArt.unitPrice : linkedArt.quantity;
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
    if (e.dataTransfer.types.includes('Files')) {
      return;
    }
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setIsArticleDragOver(false);
      setArticleDropPosition(null);
      return;
    }
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
    setTouchedRowIds((prev) => {
      if (prev.has(mId)) return prev;
      const next = new Set(prev);
      next.add(mId);
      return next;
    });
  };

  const handleToggleDeduction = (mId: string) => {
    const m = article.measurements.find((meas) => meas.id === mId);
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

  const handleRowDragStart = (e: React.DragEvent, mId: string) => {
    if (areControlsDisabled) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    e.dataTransfer.setData(MIME_MEASUREMENT, 'true');
    e.dataTransfer.setData('type', 'MEASUREMENT');
    e.dataTransfer.setData('sourceArticleId', article.id);
    e.dataTransfer.setData('measurementId', mId);
    e.dataTransfer.effectAllowed = 'copyMove';
    onMeasurementDragStart?.(e, article.id, mId);
  };

  const handleRowDragOver = (e: React.DragEvent, mId: string) => {
    if (areControlsDisabled) return;
    const isMeas = e.dataTransfer.types.includes(MIME_MEASUREMENT) || e.dataTransfer.types.includes('type');
    if (!isMeas) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    setMeasurementDropPosition(e.clientY < mid ? 'top' : 'bottom');
    setMeasurementDragOverId(mId);
  };

  const handleRowDrop = (e: React.DragEvent, targetMeasId: string) => {
    const dragType = e.dataTransfer.getData('type');
    const sourceArtId = e.dataTransfer.getData('sourceArticleId');
    const sourceMeasId = e.dataTransfer.getData('measurementId');
    if (dragType === 'MEASUREMENT' && sourceArtId && sourceMeasId) {
      e.preventDefault();
      e.stopPropagation();
      const pos = measurementDropPosition || 'bottom';
      setMeasurementDragOverId(null);
      setMeasurementDropPosition(null);
      if (!areControlsDisabled) {
        onMeasurementDrop?.(sourceArtId, sourceMeasId, article.id, targetMeasId, pos);
      }
    }
  };

  const descFontSize = 15.5;
  const measFontSize = projectSettings.fontSizeMeasurements || 13.5;

  return (
    <tbody
      ref={setCombinedTbodyRef}
      id={`article-${article.id}`}
      style={{ scrollMarginTop: '60px' }}
      className={`article-block group/article transition-all ${
        isArticleDisabled ? 'opacity-60 grayscale-[20%] bg-amber-50/20' : isArticleLocked ? 'opacity-80' : ''
      } ${
        isArticleDragOver
          ? isSafetyCategory
            ? 'ring-2 ring-orange-500 ring-inset'
            : 'ring-2 ring-blue-500 ring-inset'
          : ''
      } ${lastMovedItemId === article.id ? 'highlight-move' : ''}`}
      onDragOver={handleTbodyDragOver}
      onDragLeave={handleTbodyDragLeave}
      onDrop={handleTbodyDrop}
    >
      {isArticleDragOver && articleDropPosition === 'top' && (
        <tr>
          <td colSpan={11} className="p-0">
            <div className="h-1.5 bg-blue-600 animate-pulse shadow-[0_0_8px_rgba(37,99,235,0.8)]" />
          </td>
        </tr>
      )}

      {/* TESTATA ARTICOLO */}
      <tr
        className={`align-top article-header-row ${!isPrintMode ? 'cursor-pointer' : ''} ${
          isIndustrialMode
            ? 'bg-slate-100'
            : isArticleDisabled
            ? 'bg-amber-50/50'
            : isSafetyCategory
            ? 'bg-gradient-to-r from-orange-50/50 via-white to-slate-50/40'
            : 'bg-gradient-to-r from-blue-50/50 via-white to-slate-50/40'
        } border-t-2 ${
          isArticleDisabled ? 'border-t-amber-400' : isSafetyCategory ? 'border-t-orange-400' : 'border-t-blue-500'
        }`}
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
        {/* 1. N. */}
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
                title={
                  isArticleDisabled
                    ? 'Voce SPENTA (Esclusa dal computo subappalto e totali). Clicca per riattivare'
                    : 'Voce ATTIVA. Clicca per spegnere ed escludere dal sottocomputo subappalto'
                }
              >
                {isArticleDisabled ? <PowerOff className="w-3.5 h-3.5 text-white" /> : <Power className="w-3.5 h-3.5" />}
              </button>
            )}
            <span
              className={
                isArticleDisabled
                  ? 'object-id-badge bg-amber-200 text-amber-900 border-amber-300'
                  : isSafetyCategory
                  ? 'object-id-badge-safety'
                  : 'object-id-badge'
              }
            >
              {globalIndex}
            </span>
            <span className="text-[10px] font-bold text-slate-500 font-mono tracking-tight">{hierarchicalNumber}</span>
            {isArticleDisabled && (
              <span className="text-[7.5px] font-black uppercase tracking-wider px-1 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-300">
                OFF
              </span>
            )}
          </div>
        </td>

        {/* 2. TARIFFA */}
        <td
          className={`p-1.5 border-r border-slate-200 align-top ${isIndustrialMode ? 'bg-slate-100/50' : 'bg-white'}`}
          style={{ width: projectSettings.tariffColumnWidth ? `${projectSettings.tariffColumnWidth}px` : '135px' }}
        >
          <div className="flex flex-col relative">
            <div className="flex items-center">
              <textarea
                readOnly
                value={article.code}
                className={`font-mono font-bold text-xs w-full bg-slate-50 rounded border border-slate-200/80 px-1.5 py-0.5 resize-y overflow-hidden leading-tight disabled:text-gray-400 cursor-default focus:ring-0 ${
                  isAnalysisLinked ? 'text-purple-700 bg-purple-50/50 border-purple-200' : 'text-slate-800'
                } ${isArticleLocked ? 'text-gray-400' : ''} ${isIndustrialMode ? 'text-indigo-800' : ''}`}
                rows={isIndustrialMode ? 1 : 2}
                placeholder="Codice"
                disabled={true}
              />
              {isAnalysisLinked && !isPrintMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    article.linkedAnalysisId && onViewAnalysis(article.linkedAnalysisId, article.id);
                  }}
                  className="ml-1 text-purple-600 hover:text-purple-800 hover:bg-purple-100 p-1 rounded transition-colors flex-shrink-0"
                  title="Apri Analisi Prezzo"
                >
                  <TestTubes className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {(individualDisplayMode > 0 || article.priceListSource) && !isIndustrialMode && (
              <div className="text-[9px] text-slate-400 px-1 mt-1 leading-tight truncate max-w-full font-sans" title={article.priceListSource}>
                {article.priceListSource || 'Prezzario N/D'}
              </div>
            )}
            {!isIndustrialMode && article.soaCategory && (
              <div className="text-[9px] text-slate-500 font-medium px-1 mt-0.5 flex items-center gap-1" title={`Categoria SOA: ${article.soaCategory}`}>
                <span className="bg-slate-100 border border-slate-200 px-1 py-0.2 rounded text-[8.5px] font-bold">SOA: {article.soaCategory}</span>
              </div>
            )}
          </div>
        </td>

        {/* 3. DESIGNAZIONE DEI LAVORI */}
        <td className={`p-2 border-r border-slate-200 ${isIndustrialMode ? 'bg-slate-100/50' : 'bg-white'}`}>
          {isArticleDisabled && (
            <div className="mb-1 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                <PowerOff className="w-2.5 h-2.5" /> Voce Esclusa da Subappalto / Spenta
              </span>
            </div>
          )}
          {isPrintMode || isConciseMode || isIndustrialMode ? (
            <p
              className={`leading-relaxed font-sans font-semibold text-justify px-0.5 whitespace-pre-wrap ${
                isIndustrialMode ? 'line-clamp-1 italic font-bold text-slate-600' : isConciseMode ? 'line-clamp-2' : ''
              } ${!isIndustrialMode && isSafetyCategory ? 'text-orange-950' : !isIndustrialMode ? 'text-blue-600' : ''}`}
              style={{ color: !isIndustrialMode && !isSafetyCategory ? '#2563eb' : undefined, fontSize: `${descFontSize}px` }}
            >
              {article.description}
              {isIndustrialMode ? ' ...' : ''}
            </p>
          ) : (
            <textarea
              readOnly={true}
              value={article.description}
              rows={isArticleLocked ? 2 : 4}
              className={`w-full font-sans font-semibold text-justify border-none focus:ring-0 bg-transparent resize-y p-0.5 cursor-default scrollbar-hide ${
                isArticleLocked ? 'opacity-60 italic' : 'min-h-[50px]'
              } ${isSafetyCategory ? 'text-orange-950' : 'text-blue-600'}`}
              style={{
                color: !isSafetyCategory ? '#2563eb' : undefined,
                WebkitTextFillColor: !isSafetyCategory ? '#2563eb' : undefined,
                fontSize: `${descFontSize}px`,
              }}
            />
          )}
        </td>

        {/* 4. CONTROLLI RAPIDI VOCE */}
        <td
          className="border-r border-slate-200 bg-slate-50/40 p-1 text-center align-top"
          onClick={(e) => e.stopPropagation()}
        >
          {!isPrintMode && (
            <div className="flex flex-col items-center gap-1 mt-0.5">
              <button
                type="button"
                disabled={isCategoryLocked}
                onClick={() => onToggleArticleLock(article.id)}
                className={`transition-all p-1 rounded-md ${
                  isArticleLocked
                    ? 'text-red-500 hover:text-red-700 bg-red-50 border border-red-200'
                    : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100'
                }`}
                title={isArticleLocked ? 'Sblocca voce' : 'Blocca voce'}
              >
                {isArticleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                disabled={areControlsDisabled}
                onClick={() => onEditArticleDetails(article)}
                className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors p-1 rounded-md disabled:opacity-30"
                title="Modifica Dettagli Articolo"
              >
                <PenLine className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={areControlsDisabled}
                onClick={() => onDeleteArticle(article.id)}
                className="opacity-0 group-hover/article:opacity-100 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all p-1 rounded-md disabled:opacity-0"
                title="Elimina Articolo"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </td>

        {/* 5-7. LUNG / LARG / H-PESO VUOTE IN TESTATA (o U.M. in modalità compatta) */}
        <td colSpan={3} className="border-r border-slate-200 bg-slate-50/20 text-center align-middle">
          {isIndustrialMode && (
            <span className="font-mono text-[10px] font-bold uppercase text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
              {article.unit}
            </span>
          )}
        </td>

        {/* 8-11. QUANTITÀ / PREZZO / IMPORTO / M.O. VISIBILI IN TESTATA QUANDO COLLASSATO (Patto d'Acciaio) */}
        <td className="border-r border-slate-200 p-1.5 text-right font-mono font-bold text-slate-800 align-middle bg-slate-100/40 tabular-nums">
          {isIndustrialMode ? (
            <span style={{ fontSize: getDynamicNumberFontSize(article.quantity, 13, 6, 8.5) }}>{formatResult(article.quantity)}</span>
          ) : null}
        </td>
        <td className="border-r border-slate-200 p-1.5 text-right font-mono font-semibold text-slate-700 align-middle tabular-nums">
          {isIndustrialMode ? (
            <span style={{ fontSize: getDynamicNumberFontSize(article.unitPrice, 12.5, 6, 8.5) }}>{formatNumber(article.unitPrice) || '0,00'}</span>
          ) : null}
        </td>
        <td className="border-r border-slate-200 p-1.5 text-right font-mono font-black text-blue-900 align-middle bg-blue-50/20 tabular-nums">
          {isIndustrialMode ? (
            <span style={{ fontSize: getDynamicNumberFontSize(totalAmount, 13, 7, 8.5) }}>{formatResult(totalAmount)}</span>
          ) : null}
        </td>
        <td className="p-1.5 text-right font-mono font-semibold text-slate-600 align-middle tabular-nums">
          {isIndustrialMode ? (
            <span style={{ fontSize: getDynamicNumberFontSize(laborValue, 12.5, 6, 8.5) }}>{formatResult(laborValue)}</span>
          ) : null}
        </td>
      </tr>

      {/* CORPO MISURAZIONI (NASCOSTO IN MODALITÀ PATTO D'ACCIAIO) */}
      {!isIndustrialMode && (
        <>
          {/* BARRA STRUMENTI MISURAZIONI & SVILUPPO */}
          {!isPrintMode && (
            <tr className="bg-slate-50/90 border-y border-slate-200">
              <td className="border-r border-slate-200 bg-slate-50/50"></td>
              <td className="border-r border-slate-200 bg-slate-50/50"></td>
              <td className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border-r border-slate-200 bg-white/70">
                <div className="flex items-center justify-between gap-2">
                  <span className={`flex items-center gap-1.5 font-bold ${isSafetyCategory ? 'text-orange-700' : 'text-blue-700'}`}>
                    <Layers className="w-3.5 h-3.5 opacity-70" />
                    MISURAZIONI &amp; SVILUPPO:
                  </span>
                  <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/80">
                    <button
                      type="button"
                      disabled={areControlsDisabled}
                      onClick={() => onOpenRebarCalculator(article.id)}
                      className="p-1 rounded transition-all hover:text-orange-500 hover:bg-white text-slate-500 group relative disabled:opacity-30"
                      title="Calcolo Parametrico Armature 3D & Staffe"
                    >
                      <RebarCagePillarIcon className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                    </button>
                    <button
                      type="button"
                      disabled={areControlsDisabled}
                      onClick={() => onOpenPaintingCalculator(article.id)}
                      className="p-1 rounded transition-colors hover:text-blue-600 hover:bg-white text-slate-500 disabled:opacity-30"
                      title="Calcolo Automatico Pitturazioni e Superfici"
                    >
                      <Paintbrush className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={areControlsDisabled}
                      onClick={() => onToggleSmartRepeat(article.id)}
                      className={`p-1 rounded transition-all disabled:opacity-30 ${
                        smartRepeatActiveId === article.id
                          ? 'bg-blue-600 text-white shadow'
                          : 'text-slate-500 hover:text-blue-600 hover:bg-white'
                      }`}
                      title="Smart Repeat (Clona rigo precedente)"
                    >
                      <CopyPlus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={areControlsDisabled}
                      onClick={() => onStartVoiceDictation(article.id)}
                      className={`p-1 rounded transition-all flex items-center gap-1 disabled:opacity-30 ${
                        recordingArticleId === article.id
                          ? 'bg-purple-600 text-white animate-pulse shadow-md ring-2 ring-purple-300'
                          : 'text-slate-500 hover:text-purple-600 hover:bg-white'
                      }`}
                      title={
                        recordingArticleId === article.id
                          ? 'Dettatura Vocale ATTIVA. Clicca per disattivare'
                          : 'Attiva Dettatura Vocale Continua'
                      }
                    >
                      <Headset className="w-3.5 h-3.5" />
                      {recordingArticleId === article.id && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />}
                    </button>
                    <button
                      type="button"
                      disabled={areControlsDisabled}
                      onClick={() => onAddMeasurement(article.id)}
                      className="p-1 rounded text-slate-500 hover:text-blue-700 hover:bg-white transition-all font-bold text-[9px] flex items-center gap-0.5 ml-0.5 px-1.5 disabled:opacity-30"
                      title="Aggiungi rigo di misura"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Rigo</span>
                    </button>
                  </div>
                </div>
              </td>
              <td colSpan={8} className="border-r border-slate-200 bg-slate-50/50"></td>
            </tr>
          )}

          {/* RIGHE DI MISURA */}
          {processedMeasurements.map((m, mIdx) => {
            const isSubtotal = m.type === 'subtotal';
            const isDeduction = m.type === 'deduction';
            const isLastMeasRow = mIdx === processedMeasurements.length - 1;
            const isRowVoiceActive = recordingArticleId === article.id && voiceActiveRowId === m.id;
            const warning = getSurveyorWarning(m);
            const linkedArt = getLinkedInfo(m);
            const isMeasDragTarget = measurementDragOverId === m.id;

            const isFieldExcess = Boolean(warning?.isExcess);
            const isMissingField = (fieldName: string) => Boolean(warning?.isVisible && !warning.isExcess && warning.missingFields.includes(fieldName));
            const isVoiceCell = (fieldName: VoiceField) =>
              recordingArticleId === article.id && voiceActiveRowId === m.id && voiceActiveField === fieldName;

            return (
              <tr
                key={m.id}
                onFocus={() => handleFocusRow(m.id)}
                onDragOver={(e) => handleRowDragOver(e, m.id)}
                onDragLeave={() => {
                  if (measurementDragOverId === m.id) {
                    setMeasurementDragOverId(null);
                    setMeasurementDropPosition(null);
                  }
                }}
                onDrop={(e) => handleRowDrop(e, m.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenContextMenu?.(e, article, m);
                }}
                className={`group/row cursor-default transition-all border-b border-slate-200/70 ${
                  isSubtotal
                    ? 'bg-amber-50/70 font-bold border-y border-amber-200/90'
                    : isDeduction
                    ? 'bg-rose-50/60'
                    : 'bg-white hover:bg-slate-50/50'
                } ${isRowVoiceActive ? 'bg-purple-50/50 ring-1 ring-purple-400' : ''} ${
                  isMeasDragTarget && measurementDropPosition === 'top'
                    ? 'border-t-2 border-t-blue-600'
                    : isMeasDragTarget && measurementDropPosition === 'bottom'
                    ? 'border-b-2 border-b-blue-600'
                    : ''
                }`}
                style={{ fontSize: `${measFontSize}px` }}
              >
                {/* 1. N. Rigo */}
                <td className="border-r border-slate-200 bg-slate-50/30 text-center text-[9px] font-mono text-slate-400 align-middle">
                  {!isSubtotal ? mIdx + 1 : 'Σ'}
                </td>

                {/* 2. Azioni rigo */}
                <td className="p-0 border-r border-slate-200 bg-slate-50/40 text-center relative align-middle">
                  {!isPrintMode && !areControlsDisabled && (
                    <div className="flex justify-center items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity px-1 h-full py-1">
                      <span
                        draggable
                        onDragStart={(e) => handleRowDragStart(e, m.id)}
                        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 p-0.5"
                        title="Trascina rigo (sposta nella stessa voce o copia in un'altra)"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </span>
                      {!isSubtotal && (
                        <>
                          <button
                            type="button"
                            onClick={() => onOpenLinkModal(article.id, m.id)}
                            className={`rounded p-0.5 transition-colors ${
                              m.linkedArticleId
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                            }`}
                            title={m.linkedArticleId ? 'Modifica collegamento (Vedi Voce)' : 'Collega ad un altro articolo (Vedi Voce)'}
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleDeduction(m.id)}
                            className={`rounded p-0.5 transition-colors ${
                              isDeduction
                                ? 'bg-rose-600 text-white hover:bg-rose-700'
                                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                            }`}
                            title={isDeduction ? 'Rendi Positivo' : 'A Dedurre'}
                          >
                            <MinusCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteMeasurement(article.id, m.id)}
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-colors"
                        title="Elimina Rigo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </td>

                {/* 3. Descrizione misura */}
                <td className={`pl-3 pr-1 py-1 border-r border-slate-200 relative align-top ${isDeduction ? 'text-rose-900 font-bold' : ''}`}>
                  <div className="flex items-start gap-2 relative w-full min-h-[22px]">
                    {isSubtotal ? (
                      <div className="italic text-amber-900 text-right pr-2 w-full font-bold">Sommano parziale</div>
                    ) : (
                      <div className="flex-1 flex flex-col gap-1 relative w-full">
                        {linkedArt && (
                          <div className="flex items-center gap-1.5 pl-5 pt-0.5">
                            <button
                              type="button"
                              onClick={() => onScrollToArticle(linkedArt.id, article.id)}
                              className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors"
                              title={`Vai all'articolo collegato ${linkedArt.code}`}
                            >
                              <LinkIcon className="w-2.5 h-2.5" />
                              <span>
                                Vedi Voce {getLinkedArticleNumber(linkedArt)} ({linkedArt.code}) —{' '}
                                {m.linkedType === 'amount' ? 'Importo' : 'Quantità'}
                              </span>
                            </button>
                            {!isPrintMode && !areControlsDisabled && (
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateMeasurement(article.id, m.id, 'linkedArticleId', undefined);
                                  onUpdateMeasurement(article.id, m.id, 'linkedType', undefined);
                                }}
                                className="text-slate-400 hover:text-red-600 p-0.5 rounded"
                                title="Scollega riferimento"
                              >
                                <Link2Off className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                        <div className="flex-1 flex items-start gap-2 relative w-full">
                          <div className={`absolute left-0 top-3 w-4 h-[1px] ${isDeduction ? 'bg-rose-300' : 'bg-slate-300'}`} />
                          <FastTextarea
                            initialValue={m.description || ''}
                            onCommit={(val) => onUpdateMeasurement(article.id, m.id, 'description', val)}
                            data-m-id={m.id}
                            data-field="description"
                            autoFocus={m.id === lastAddedMeasurementId}
                            disabled={areControlsDisabled}
                            onFocus={() => {
                              handleFocusRow(m.id);
                              onColumnFocus('desc');
                              onVoiceCellFocus?.(m.id, 'description');
                            }}
                            onBlur={() => onColumnFocus(null)}
                            onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'description', isLastMeasRow)}
                            className={`w-full bg-transparent border-none p-0 focus:ring-0 placeholder-slate-300 resize-none overflow-hidden whitespace-pre-wrap break-words text-justify leading-snug pl-5 outline-none ${
                              isDeduction ? 'text-rose-900 font-bold' : 'text-slate-800'
                            } ${isVoiceCell('description') ? 'recording-feedback' : ''}`}
                            style={{ fontSize: `${measFontSize}px`, minHeight: '22px' }}
                            placeholder=""
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </td>

                {/* 4. Par.Ug. */}
                <td
                  className={`border-r border-slate-200 p-0 transition-colors ${isDeduction ? 'bg-rose-50/60' : 'bg-slate-50/40'} ${
                    isVoiceCell('multiplier') ? 'recording-feedback' : ''
                  }`}
                >
                  {!isSubtotal ? (
                    <FastNumberInput
                      data-m-id={m.id}
                      data-field="multiplier"
                      disabled={areControlsDisabled}
                      onFocus={() => {
                        handleFocusRow(m.id);
                        onColumnFocus('mult');
                        onVoiceCellFocus?.(m.id, 'multiplier');
                      }}
                      onBlur={() => onColumnFocus(null)}
                      className={`w-full text-center bg-transparent border-none text-xs focus:bg-white placeholder-slate-300 h-full font-mono tabular-nums outline-none ${
                        isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'
                      }`}
                      initialValue={m.multiplier}
                      onCommit={(val) => onUpdateMeasurement(article.id, m.id, 'multiplier', val)}
                      onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'multiplier', isLastMeasRow)}
                      placeholder=""
                    />
                  ) : null}
                </td>

                {/* 5. Lunghezza */}
                <td
                  className={`border-r border-slate-200 p-0 transition-all ${isDeduction ? 'bg-rose-50/60' : 'bg-slate-50/40'} ${
                    isFieldExcess && m.length !== undefined ? 'excess-cell' : ''
                  } ${isMissingField('length') ? 'missing-field-glow' : ''} ${isVoiceCell('length') ? 'recording-feedback' : ''}`}
                >
                  {isSubtotal ? (
                    <div className="text-center text-slate-300">-</div>
                  ) : (
                    <FastNumberInput
                      data-m-id={m.id}
                      data-field="length"
                      disabled={areControlsDisabled}
                      onFocus={() => {
                        handleFocusRow(m.id);
                        onColumnFocus('len');
                        onVoiceCellFocus?.(m.id, 'length');
                      }}
                      onBlur={() => onColumnFocus(null)}
                      className={`w-full text-center bg-transparent border-none text-xs focus:bg-white placeholder-slate-300 h-full font-mono tabular-nums outline-none ${
                        isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'
                      } ${isFieldExcess && m.length !== undefined ? 'excess-error' : ''}`}
                      initialValue={m.length}
                      onCommit={(val) => onUpdateMeasurement(article.id, m.id, 'length', val)}
                      onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'length', isLastMeasRow)}
                      placeholder=""
                    />
                  )}
                </td>

                {/* 6. Larghezza */}
                <td
                  className={`border-r border-slate-200 p-0 transition-all ${isDeduction ? 'bg-rose-50/60' : 'bg-slate-50/40'} ${
                    isFieldExcess && m.width !== undefined ? 'excess-cell' : ''
                  } ${isMissingField('width') ? 'missing-field-glow' : ''} ${isVoiceCell('width') ? 'recording-feedback' : ''}`}
                >
                  {isSubtotal ? (
                    <div className="text-center text-slate-300">-</div>
                  ) : (
                    <FastNumberInput
                      data-m-id={m.id}
                      data-field="width"
                      disabled={areControlsDisabled}
                      onFocus={() => {
                        handleFocusRow(m.id);
                        onColumnFocus('wid');
                        onVoiceCellFocus?.(m.id, 'width');
                      }}
                      onBlur={() => onColumnFocus(null)}
                      className={`w-full text-center bg-transparent border-none text-xs focus:bg-white placeholder-slate-300 h-full font-mono tabular-nums outline-none ${
                        isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'
                      } ${isFieldExcess && m.width !== undefined ? 'excess-error' : ''}`}
                      initialValue={m.width}
                      onCommit={(val) => onUpdateMeasurement(article.id, m.id, 'width', val)}
                      onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'width', isLastMeasRow)}
                      placeholder=""
                    />
                  )}
                </td>

                {/* 7. H/Peso */}
                <td
                  className={`border-r border-slate-200 p-0 transition-all ${isDeduction ? 'bg-rose-50/60' : 'bg-slate-50/40'} ${
                    isFieldExcess && m.height !== undefined ? 'excess-cell' : ''
                  } ${isMissingField('height') ? 'missing-field-glow' : ''} ${isVoiceCell('height') ? 'recording-feedback' : ''}`}
                >
                  {isSubtotal ? (
                    <div className="text-center text-slate-300">-</div>
                  ) : (
                    <FastNumberInput
                      data-m-id={m.id}
                      data-field="height"
                      disabled={areControlsDisabled}
                      onFocus={() => {
                        handleFocusRow(m.id);
                        onColumnFocus('h');
                        onVoiceCellFocus?.(m.id, 'height');
                      }}
                      onBlur={() => onColumnFocus(null)}
                      className={`w-full text-center bg-transparent border-none text-xs focus:bg-white placeholder-slate-300 h-full font-mono tabular-nums outline-none ${
                        isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'
                      } ${isFieldExcess && m.height !== undefined ? 'excess-error' : ''}`}
                      initialValue={m.height}
                      onCommit={(val) => onUpdateMeasurement(article.id, m.id, 'height', val)}
                      onKeyDown={(e) => handleMeasKeyDown(e, m.id, 'height', isLastMeasRow)}
                      placeholder=""
                    />
                  )}
                </td>

                {/* 8. Quantità Risultante */}
                <td
                  className={`p-1 px-2 border-r border-slate-200 text-right font-mono tabular-nums relative ${
                    isSubtotal
                      ? 'bg-amber-100/70 font-black text-amber-950'
                      : isDeduction
                      ? 'bg-rose-100 text-rose-900 font-black'
                      : 'bg-slate-50/80 font-bold text-slate-800'
                  }`}
                  title={warning?.isVisible ? warning.msg : undefined}
                >
                  <div className="flex items-center justify-end gap-1">
                    {warning?.isVisible && (
                      <AlertTriangle
                        className={`w-3.5 h-3.5 flex-shrink-0 ${
                          warning.severity === 'error' ? 'text-red-600 animate-pulse' : 'text-amber-500'
                        }`}
                      />
                    )}
                    <span style={{ fontSize: getDynamicNumberFontSize(isSubtotal ? m.displayValue : m.calculatedValue, 13, 6, 8.5) }}>
                      {formatResult(isSubtotal ? m.displayValue : m.calculatedValue)}
                    </span>
                  </div>
                </td>

                {/* 9-11. Vuote nelle righe di misura */}
                <td className="border-r border-slate-200 bg-slate-50/10"></td>
                <td className="border-r border-slate-200 bg-slate-50/10"></td>
                <td className="bg-slate-50/10"></td>
              </tr>
            );
          })}

          {/* RIGA RIEPILOGO VOCE: SOMMANO & TOTALI */}
          <tr className="border-b border-slate-300 bg-slate-50/90 font-bold text-xs">
            <td className="border-r border-slate-200 bg-slate-100/50"></td>
            <td className="border-r border-slate-200 bg-slate-100/50"></td>
            <td className="px-2.5 py-1.5 text-left border-r border-slate-200">
              <div className="flex items-center justify-between gap-2">
                {!isPrintMode && !areControlsDisabled ? (
                  <div className="flex items-center gap-2">
                    <button
                      ref={addBtnRef}
                      type="button"
                      onClick={() => {
                        onAddMeasurement(article.id);
                        playUISound('newline');
                      }}
                      className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Rigo Misura</span>
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => {
                        onAddSubtotal(article.id);
                        playUISound('confirm');
                      }}
                      className="text-[10px] font-black uppercase text-amber-600 hover:text-amber-800 flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Sigma className="w-3 h-3" />
                      <span>Parziale</span>
                    </button>
                  </div>
                ) : (
                  <span />
                )}
                <span className="uppercase text-[10px] ml-auto font-black tracking-wider text-slate-500">
                  Sommano{' '}
                  <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {article.unit || 'cad'}
                  </span>
                </span>
              </div>
            </td>
            <td className="border-r border-slate-200"></td>
            <td className="border-r border-slate-200"></td>
            <td className="border-r border-slate-200"></td>
            <td className="border-r border-slate-200"></td>
            <td className="border-r border-slate-200 text-right pr-2 font-mono font-extrabold bg-slate-100/80 text-slate-900 tabular-nums">
              <span style={{ fontSize: getDynamicNumberFontSize(article.quantity, 13, 6, 8.5) }}>
                {formatResult(article.quantity)}
              </span>
            </td>
            <td className="border-r border-slate-200 text-right p-0 font-mono tabular-nums">
              {!isPrintMode && !areControlsDisabled ? (
                <FastNumberInput
                  initialValue={article.unitPrice}
                  onCommit={(val) => onUpdateArticle(article.id, 'unitPrice', val || 0)}
                  className="w-full text-right font-mono font-bold text-xs text-slate-800 bg-transparent hover:bg-white focus:bg-white px-2 py-1 rounded outline-none"
                  placeholder="0.00"
                />
              ) : (
                <span className="pr-2">{formatResult(article.unitPrice)}</span>
              )}
            </td>
            <td
              className={`border-r border-slate-200 text-right pr-2 font-mono font-black tabular-nums ${
                isSafetyCategory ? 'text-orange-900 bg-orange-50/30' : 'text-blue-900 bg-blue-50/30'
              }`}
            >
              <span style={{ fontSize: getDynamicNumberFontSize(totalAmount, 13, 7, 8.5) }}>{formatResult(totalAmount)}</span>
            </td>
            <td className="text-right pr-2 font-mono font-semibold text-slate-600 bg-slate-50 tabular-nums">
              <span style={{ fontSize: getDynamicNumberFontSize(laborValue, 12.5, 6, 8.5) }}>{formatResult(laborValue)}</span>
            </td>
          </tr>
        </>
      )}

      {/* SEPARATORE NETTO TRA ARTICOLI */}
      <tr className="article-separator-row select-none pointer-events-none">
        <td colSpan={11} className="article-separator-cell p-0 text-center">
          <div className="h-full flex items-center justify-between px-6">
            <div className="w-full h-0.5 bg-slate-400/50 rounded-full" />
          </div>
        </td>
      </tr>

      {isArticleDragOver && articleDropPosition === 'bottom' && (
        <tr>
          <td colSpan={11} className="p-0">
            <div className="h-1.5 bg-blue-600 animate-pulse shadow-[0_0_8px_rgba(37,99,235,0.8)]" />
          </td>
        </tr>
      )}
    </tbody>
  );
};

function areArticleGroupPropsEqual(prev: ArticleGroupProps, next: ArticleGroupProps): boolean {
  if (
    prev.article !== next.article ||
    prev.index !== next.index ||
    prev.globalIndex !== next.globalIndex ||
    prev.isPrintMode !== next.isPrintMode ||
    prev.isCategoryLocked !== next.isCategoryLocked ||
    prev.isSurveyorGuardActive !== next.isSurveyorGuardActive ||
    prev.projectSettings !== next.projectSettings ||
    prev.onTbodyRef !== next.onTbodyRef
  ) {
    return false;
  }

  // Evidenziazione spostamento solo per la voce interessata
  const prevMoved = prev.lastMovedItemId === prev.article.id;
  const nextMoved = next.lastMovedItemId === next.article.id;
  if (prevMoved !== nextMoved) return false;

  // Smart repeat solo per la voce interessata
  const prevRepeat = prev.smartRepeatActiveId === prev.article.id;
  const nextRepeat = next.smartRepeatActiveId === next.article.id;
  if (prevRepeat !== nextRepeat) return false;

  // Dettatura vocale solo per la voce interessata
  const prevRec = prev.recordingArticleId === prev.article.id;
  const nextRec = next.recordingArticleId === next.article.id;
  if (prevRec !== nextRec) return false;
  if (nextRec && (prev.voiceActiveRowId !== next.voiceActiveRowId || prev.voiceActiveField !== next.voiceActiveField)) {
    return false;
  }

  // Focus auto su nuovo rigo solo se riguarda questo articolo
  if (prev.lastAddedMeasurementId !== next.lastAddedMeasurementId) {
    const addFocusKey = 'ADD_BUTTON_FOCUS' + next.article.id;
    const touchesThis =
      prev.lastAddedMeasurementId === addFocusKey ||
      next.lastAddedMeasurementId === addFocusKey ||
      next.article.measurements.some(
        (m) => m.id === prev.lastAddedMeasurementId || m.id === next.lastAddedMeasurementId
      );
    if (touchesThis) return false;
  }

  // Aggiorna solo se un articolo collegato tramite "Vedi Voce" è cambiato
  if (prev.allArticlesMap !== next.allArticlesMap || prev.articleLocalNumberMap !== next.articleLocalNumberMap) {
    for (let i = 0; i < next.article.measurements.length; i++) {
      const linkedId = next.article.measurements[i].linkedArticleId;
      if (linkedId) {
        if (prev.allArticlesMap.get(linkedId) !== next.allArticlesMap.get(linkedId)) return false;
        if (prev.articleLocalNumberMap.get(linkedId) !== next.articleLocalNumberMap.get(linkedId)) return false;
      }
    }
  }

  // Callback stability check
  if (
    prev.onUpdateArticle !== next.onUpdateArticle ||
    prev.onEditArticleDetails !== next.onEditArticleDetails ||
    prev.onUpdateMeasurement !== next.onUpdateMeasurement ||
    prev.onDeleteMeasurement !== next.onDeleteMeasurement ||
    prev.onAddMeasurement !== next.onAddMeasurement ||
    prev.onAddSubtotal !== next.onAddSubtotal ||
    prev.onOpenLinkModal !== next.onOpenLinkModal ||
    prev.onScrollToArticle !== next.onScrollToArticle ||
    prev.onViewAnalysis !== next.onViewAnalysis ||
    prev.onInsertExternalArticle !== next.onInsertExternalArticle ||
    prev.onToggleArticleLock !== next.onToggleArticleLock ||
    prev.onOpenRebarCalculator !== next.onOpenRebarCalculator ||
    prev.onOpenPaintingCalculator !== next.onOpenPaintingCalculator ||
    prev.onToggleSmartRepeat !== next.onToggleSmartRepeat ||
    prev.onToggleItemDisplayMode !== next.onToggleItemDisplayMode ||
    prev.onStartVoiceDictation !== next.onStartVoiceDictation ||
    prev.onDeleteArticle !== next.onDeleteArticle ||
    prev.onToggleArticleEnabled !== next.onToggleArticleEnabled ||
    prev.onArticleDragStart !== next.onArticleDragStart ||
    prev.onArticleDrop !== next.onArticleDrop ||
    prev.onArticleDragEnd !== next.onArticleDragEnd ||
    prev.onColumnFocus !== next.onColumnFocus ||
    prev.onMeasurementDragStart !== next.onMeasurementDragStart ||
    prev.onMeasurementDrop !== next.onMeasurementDrop ||
    prev.onVoiceCellFocus !== next.onVoiceCellFocus ||
    prev.onOpenContextMenu !== next.onOpenContextMenu
  ) {
    return false;
  }

  return true;
}

export const ArticleGroup = React.memo(ArticleGroupComponent, areArticleGroupPropsEqual);
