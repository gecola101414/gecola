import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Upload,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Highlighter,
  MousePointerClick,
  Ruler,
  Pentagon,
  Crosshair,
  Hand,
  Magnet,
  Eye,
  EyeOff,
  Plus,
  MinusCircle,
  Trash2,
  Sigma,
  CopyPlus,
  Undo2,
  Check,
  Sparkles,
  RotateCcw,
  GripVertical,
  ScanText,
  Pencil,
  PenTool,
  Type,
  Eraser,
  Layers,
  Lock,
  Unlock,
  Bookmark,
  Target,
  Volume2,
  VolumeX,
  Box,
  Cuboid,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Tag,
} from 'lucide-react';
import { Article } from '../types';
import {
  analyzeHighlightedRegion,
  analyzePdfPlanPage,
  buildMeasurementsFromRoom,
  classifyPlanToken,
  DetectedRoomBlock,
  inferDefaultModeForArticle,
  loadPdfPlanDocument,
  MeasureExtractionMode,
  PlanBBox,
  PlanPageAnalysis,
  PlanToken,
  QueuedMeasureDraft,
  QuoteUnit,
  SnapVertex,
} from '../utils/pdfPlanExtractor';
import {
  OcrScanProgress,
  reclassifyPlanTokens,
  runPlanPageOcr,
  runPlanPageOcrFromCanvas,
  warmupOcrWorkers,
} from '../utils/pdfPlanOcr';
import {
  base64ToUint8,
  createDefaultPlanLayers,
  DEFAULT_LAYER_IDS,
  MeasuredPolygon,
  MeasuredRulerLine,
  PenStroke,
  PlanLayer,
  PlanTextNote,
  SavedPlanSheet,
  uint8ToBase64,
} from '../utils/planProjectStorage';
import {
  computeVirtualLaserArea,
  computeVirtualLaserShot,
  extractCanvasLumaGrid,
  LaserMode,
  LaserPoint,
  LaserSensitivity,
  PlanLumaGrid,
  playLaserBeep,
} from '../utils/planLaserRaycaster';
import {
  autoCalibratePlanFromQuotes,
  AutoCalibrationStatus,
} from '../utils/planAutoCalibration';
import {
  extractSignificantQuotes,
  SignificantQuoteItem,
} from '../utils/planCleanGeometry';
import {
  BimObject,
  BimObjectKind,
  cleanArchitecturalWalls,
  extractPlanBimModel,
  PlanBimModel,
  splitWallsAroundOpenings,
} from '../utils/planBimExtractor';
import { analyzePlanBimWithAi } from '../utils/planBimAiClient';
import { Plan3DViewer } from './Plan3DViewer';

export interface PlanMeasureExportRow {
  description: string;
  type: 'positive' | 'deduction' | 'subtotal';
  multiplier?: number;
  length?: number;
  width?: number;
  height?: number;
}

interface PlanMeasureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (rows: PlanMeasureExportRow[], targetArticleId: string) => void;
  articles: Article[];
  targetArticleId: string | null;
  onSelectTargetArticle?: (articleId: string) => void;
  planSheets?: SavedPlanSheet[];
  activePlanSheetId?: string | null;
  onPlanSheetsChange?: React.Dispatch<React.SetStateAction<SavedPlanSheet[]>>;
  onSelectActivePlanSheet?: (sheetId: string | null) => void;
}

type ActiveTool =
  | 'highlight'
  | 'pick'
  | 'ruler'
  | 'laser'
  | 'polygon'
  | 'calibrate'
  | 'edit_ocr'
  | 'pen'
  | 'text_note'
  | 'pan';
type TargetNumericField = 'multiplier' | 'length' | 'width' | 'height';

interface InternalMeasureDraft extends QueuedMeasureDraft {
  isDirectArea?: boolean;
  linkedMarkId?: string;
}

const ANNOTATION_COLORS: Array<{ hex: string; name: string }> = [
  { hex: '#ef4444', name: 'Rosso' },
  { hex: '#2563eb', name: 'Blu' },
  { hex: '#16a34a', name: 'Verde' },
  { hex: '#f59e0b', name: 'Arancio' },
  { hex: '#9333ea', name: 'Viola' },
  { hex: '#0f172a', name: 'Nero' },
];

const POLYGON_COLORS = ['#4f46e5', '#059669', '#d97706', '#0891b2', '#db2777', '#7c3aed'];

function unitFactorFromMeters(unit: QuoteUnit): number {
  if (unit === 'cm') return 100;
  if (unit === 'mm') return 1000;
  return 1;
}

function metersToUnit(meters: number, unit: QuoteUnit): number {
  const val = meters * unitFactorFromMeters(unit);
  return Math.round(val * 100) / 100;
}

function formatMeasureVal(val: number, unit: QuoteUnit): string {
  if (unit === 'm') return val.toFixed(2);
  return Number.isInteger(val) ? String(val) : String(Math.round(val * 100) / 100);
}

const MODE_OPTIONS: Array<{ id: MeasureExtractionMode; label: string; hint: string }> = [
  { id: 'area_lw', label: 'Superficie (m²)', hint: 'Lung. × Larg.' },
  { id: 'walls_perim_h', label: 'Pareti (P × H)', hint: 'Perimetro × H' },
  { id: 'linear', label: 'Lineare (m)', hint: 'Sviluppo lineare' },
  { id: 'volume', label: 'Volume (m³)', hint: 'L × W × H' },
  { id: 'count', label: 'Conteggio', hint: '1 cad / vano' },
];

function computeRowQuantity(r: QueuedMeasureDraft): number {
  if (r.type === 'subtotal') return 0;
  const hasAny =
    r.multiplier !== undefined || r.length !== undefined || r.width !== undefined || r.height !== undefined;
  if (!hasAny) return 0;
  const m = r.multiplier !== undefined ? r.multiplier : 1;
  const l = r.length !== undefined ? r.length : 1;
  const w = r.width !== undefined ? r.width : 1;
  const h = r.height !== undefined ? r.height : 1;
  const val = Math.round(m * l * w * h * 100) / 100;
  return r.type === 'deduction' ? -Math.abs(val) : val;
}

function shoelaceArea(pts: Array<{ x: number; y: number }>): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function polyPerimeter(pts: Array<{ x: number; y: number }>, closed: boolean): number {
  if (pts.length < 2) return 0;
  let perim = 0;
  for (let i = 1; i < pts.length; i++) {
    perim += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  if (closed && pts.length >= 3) {
    perim += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  }
  return perim;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

const FIELD_LABEL_IT: Record<TargetNumericField, string> = {
  multiplier: 'Par.Ug.',
  length: 'Lung.',
  width: 'Larg.',
  height: 'H/Peso',
};

export const PlanMeasureModal: React.FC<PlanMeasureModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  articles,
  targetArticleId,
  onSelectTargetArticle,
  planSheets = [],
  activePlanSheetId = null,
  onPlanSheetsChange,
  onSelectActivePlanSheet,
}) => {
  const effectiveTargetId = targetArticleId || articles[0]?.id || '';
  const targetArticle = useMemo(
    () => articles.find((a) => a.id === effectiveTargetId) || articles[0] || null,
    [articles, effectiveTargetId]
  );

  // Stato documento PDF & archivio tavole del progetto
  const [currentSheetId, setCurrentSheetId] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageAnalyses, setPageAnalyses] = useState<Record<number, PlanPageAnalysis>>({});
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isDragOverDropzone, setIsDragOverDropzone] = useState(false);
  const pdfDocCacheRef = useRef<Map<string, any>>(new Map());
  const pdfBinaryMetaRef = useRef<Map<string, { pdfBase64?: string; fileSizeBytes?: number }>>(new Map());
  const isHydratingSheetRef = useRef<boolean>(false);

  // Parametri estrazione & scala
  const [quoteUnit, setQuoteUnit] = useState<QuoteUnit>('m');
  const [exportUnit, setExportUnit] = useState<QuoteUnit>('m');
  const [extractionMode, setExtractionMode] = useState<MeasureExtractionMode>('area_lw');
  const [defaultHeightM, setDefaultHeightM] = useState<number>(3.0);
  const [scaleDenominator, setScaleDenominator] = useState<number>(100);
  const [customMetersPerPt, setCustomMetersPerPt] = useState<number | null>(null);

  // Gestione Layer CAD (Misure, Appunti, Promemoria, Varianti) + Menu a tendina stile AutoCAD
  const [layers, setLayers] = useState<PlanLayer[]>(() => createDefaultPlanLayers());
  const [activeLayerId, setActiveLayerId] = useState<string>(DEFAULT_LAYER_IDS.MEASURES);
  const [openCadMenu, setOpenCadMenu] = useState<'draw' | 'ocr_view' | 'layers' | 'units' | null>(null);
  const cadMenuBarRef = useRef<HTMLDivElement>(null);
  const [newLayerName, setNewLayerName] = useState<string>('');
  const [newLayerColor, setNewLayerColor] = useState<string>('#9333ea');

  useEffect(() => {
    if (!openCadMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (cadMenuBarRef.current && !cadMenuBarRef.current.contains(e.target as Node)) {
        setOpenCadMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenCadMenu(null);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openCadMenu]);

  // Strumenti CAD viewport & OCR editabile
  const [activeTool, setActiveTool] = useState<ActiveTool>('highlight');
  const [zoom, setZoom] = useState<number>(1);
  const [showOverlayTokens, setShowOverlayTokens] = useState<boolean>(true);
  const [showEditableOverlay, setShowEditableOverlay] = useState<boolean>(true);
  const [isScanningOcr, setIsScanningOcr] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<OcrScanProgress | null>(null);
  const ocrAbortRef = useRef<AbortController | null>(null);
  const ocrScannedPagesRef = useRef<Set<number>>(new Set());
  const pageAnalysesRef = useRef<Record<number, PlanPageAnalysis>>({});
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [editingTokenText, setEditingTokenText] = useState<string>('');
  const [newTokenDraft, setNewTokenDraft] = useState<{ x: number; y: number; text: string; vertical: boolean } | null>(null);
  const [osnapEnabled, setOsnapEnabled] = useState<boolean>(true);
  const [cursorPt, setCursorPt] = useState<{ x: number; y: number } | null>(null);
  const [snappedVertex, setSnappedVertex] = useState<SnapVertex | null>(null);

  // Stato Pennino (schizzi a mano libera) e Testi/Promemoria sulla piantina
  const [penStrokesByPage, setPenStrokesByPage] = useState<Record<number, PenStroke[]>>({});
  const [activePenStroke, setActivePenStroke] = useState<PenStroke | null>(null);
  const [penColor, setPenColor] = useState<string>('#ef4444');
  const [penWidth, setPenWidth] = useState<number>(3);
  const [penIsHighlighter, setPenIsHighlighter] = useState<boolean>(false);
  const [penEraserMode, setPenEraserMode] = useState<boolean>(false);

  const [textNotesByPage, setTextNotesByPage] = useState<Record<number, PlanTextNote[]>>({});
  const [textNoteColor, setTextNoteColor] = useState<string>('#2563eb');
  const [textNoteSize, setTextNoteSize] = useState<number>(13);
  const [editingTextNote, setEditingTextNote] = useState<{
    id?: string;
    x: number;
    y: number;
    text: string;
    color: string;
    fontSize: number;
    vertical: boolean;
    bgOpaque: boolean;
    isReminder: boolean;
    layerId: string;
  } | null>(null);
  const draggingNoteRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  // Stati interazione attiva su canvas
  const [highlightDrag, setHighlightDrag] = useState<PlanBBox | null>(null);
  const [flashTokenIds, setFlashTokenIds] = useState<Set<string>>(new Set());
  const [flashMarkIds, setFlashMarkIds] = useState<Set<string>>(new Set());
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);

  // Quota picker singolo (L + W pairing quando nessuna casella è evidenziata)
  const [pendingLengthPick, setPendingLengthPick] = useState<{ val: number; label: string } | null>(null);

  // Righello, Laser Virtuale (1 Raggio, 2 Raggi Sx+Dx, Areale m²), Calibrazione & Poligono + Segni persistenti (Righello/Poligono)
  const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
  const [laserOrigin, setLaserOrigin] = useState<LaserPoint | null>(null);
  const [laserMode, setLaserMode] = useState<LaserMode>('single');
  const [laserOrtho, setLaserOrtho] = useState<boolean>(true);
  const [laserSensitivity, setLaserSensitivity] = useState<LaserSensitivity>('medium');
  const [laserIgnoreText, setLaserIgnoreText] = useState<boolean>(true);
  const [laserSoundEnabled, setLaserSoundEnabled] = useState<boolean>(true);
  const [isShiftPressed, setIsShiftPressed] = useState<boolean>(false);
  const [laserFlashShot, setLaserFlashShot] = useState<{ p1: LaserPoint; p2: LaserPoint; meters: number } | null>(null);
  const [laserAreaFlash, setLaserAreaFlash] = useState<{
    svgFillPath: string;
    svgBorderPath: string;
    areaM2: number;
    centroid: LaserPoint;
  } | null>(null);
  const laserFlashTimerRef = useRef<number | null>(null);
  const canvasLumaRef = useRef<PlanLumaGrid | null>(null);
  const [lumaVersion, setLumaVersion] = useState<number>(0);

  // Vista 2D Pianta / 3D Pareti / BIM Editabile + Auto-Calibrazione H/V
  const [viewMode, setViewMode] = useState<'2d' | '3d' | 'bim'>('2d');
  const [showQuotesIn3D, setShowQuotesIn3D] = useState<boolean>(false);
  const [wall3DSensitivity, setWall3DSensitivity] = useState<LaserSensitivity>('medium');
  const [autoCalibState, setAutoCalibState] = useState<{
    status: AutoCalibrationStatus;
    message: string;
    matchedH: number;
    matchedV: number;
    scaleDenom?: number;
  }>({ status: 'idle', message: '', matchedH: 0, matchedV: 0 });
  const manualCalibratedPagesRef = useRef<Set<number>>(new Set());
  const autoCalibRunKeyRef = useRef<string>('');
  const [bimModelState, setBimModelState] = useState<PlanBimModel>({
    walls: [],
    doors: [],
    windows: [],
    pillars: [],
    rooms: [],
    planWidthM: 10,
    planHeightM: 10,
    boundsM: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
  });
  const aiBimCacheRef = useRef<Map<string, PlanBimModel>>(new Map());
  const aiAutoAttemptedRef = useRef<Set<string>>(new Set());
  const aiBimAbortRef = useRef<AbortController | null>(null);
  const bimUndoStackRef = useRef<PlanBimModel[]>([]);
  const bimRedoStackRef = useRef<PlanBimModel[]>([]);
  const [bimHistoryCounts, setBimHistoryCounts] = useState<{ undo: number; redo: number }>({ undo: 0, redo: 0 });
  const [aiBimOverride, setAiBimOverride] = useState<{ key: string; model: PlanBimModel } | null>(null);
  const [isAnalyzingAiBim, setIsAnalyzingAiBim] = useState<boolean>(false);
  const [aiBimError, setAiBimError] = useState<string | null>(null);

  const [polygonPts, setPolygonPts] = useState<Array<{ x: number; y: number }>>([]);
  const [calibrationDraft, setCalibrationDraft] = useState<{ distPt: number; realMetersStr: string } | null>(null);
  const [measuredPolygonsByPage, setMeasuredPolygonsByPage] = useState<Record<number, MeasuredPolygon[]>>({});
  const [measuredLinesByPage, setMeasuredLinesByPage] = useState<Record<number, MeasuredRulerLine[]>>({});
  const [showMeasuredMarks, setShowMeasuredMarks] = useState<boolean>(true);

  // Pan & Zoom stile AutoCAD (zero barre di scorrimento, solo pan infinito + zoom sul cursore) & Resizer split
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const panOffsetRef = useRef(panOffset);
  panOffsetRef.current = panOffset;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const panOriginRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(570);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const [isRoomsDrawerOpen, setIsRoomsDrawerOpen] = useState<boolean>(false);

  // Coda misure stile Elenco Misure Computo + Casella Evidenziata & Lampeggiamento
  const [queuedRows, setQueuedRows] = useState<InternalMeasureDraft[]>([]);
  const [activeCell, setActiveCell] = useState<{ rowId: string; field: TargetNumericField } | null>(null);
  const [flashingCell, setFlashingCell] = useState<{ rowId: string; field: TargetNumericField; on: boolean } | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sheetWrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const rowInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const fitAnalysisToViewport = useCallback((widthPt: number, heightPt: number) => {
    const container = scrollContainerRef.current;
    if (!container || widthPt <= 0 || heightPt <= 0) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 100 || rect.height <= 100) return;
    const pad = 24;
    const fitZ = Math.min((rect.width - pad * 2) / widthPt, (rect.height - pad * 2) / heightPt);
    const clampedZ = Math.max(0.2, Math.min(3.5, Math.round(fitZ * 100) / 100));
    const nextPan = {
      x: Math.round((rect.width - widthPt * clampedZ) / 2),
      y: Math.round((rect.height - heightPt * clampedZ) / 2),
    };
    setZoom(clampedZ);
    setPanOffset(nextPan);
  }, []);

  const zoomAroundViewportPoint = useCallback((rawNextZoom: number, clientX?: number, clientY?: number) => {
    const oldZoom = zoomRef.current;
    const nextZoom = Math.max(0.2, Math.min(5.0, Math.round(rawNextZoom * 100) / 100));
    if (nextZoom === oldZoom) return;
    const container = scrollContainerRef.current;
    if (!container) {
      setZoom(nextZoom);
      return;
    }
    const rect = container.getBoundingClientRect();
    const anchorX = clientX !== undefined ? clientX - rect.left : rect.width * 0.5;
    const anchorY = clientY !== undefined ? clientY - rect.top : rect.height * 0.5;
    const oldPan = panOffsetRef.current;
    const ratio = nextZoom / oldZoom;
    setZoom(nextZoom);
    setPanOffset({
      x: anchorX - (anchorX - oldPan.x) * ratio,
      y: anchorY - (anchorY - oldPan.y) * ratio,
    });
  }, []);

  const layerMap = useMemo(() => {
    const map = new Map<string, PlanLayer>();
    for (const l of layers) map.set(l.id, l);
    return map;
  }, [layers]);

  const isLayerVisible = useCallback(
    (layerId?: string) => {
      if (!layerId) return true;
      const layer = layerMap.get(layerId);
      return layer ? layer.visible : true;
    },
    [layerMap]
  );

  const isLayerLocked = useCallback(
    (layerId?: string) => {
      if (!layerId) return false;
      const layer = layerMap.get(layerId);
      return layer ? layer.locked : false;
    },
    [layerMap]
  );

  // Sincronizza modalità predefinita da articolo
  useEffect(() => {
    if (!isOpen || !targetArticle) return;
    setExtractionMode(inferDefaultModeForArticle(targetArticle.unit, targetArticle.description));
  }, [isOpen, targetArticle?.id]);

  // Sincronizza ref delle analisi pagina
  useEffect(() => {
    pageAnalysesRef.current = pageAnalyses;
  }, [pageAnalyses]);

  // Pre-riscalda i 2 worker OCR paralleli appena si apre il modal per OCR istantaneo in fase di rendering
  useEffect(() => {
    if (!isOpen) return;
    warmupOcrWorkers().catch(() => {
      // Fallback gestito al momento della scansione
    });
  }, [isOpen]);

  // Reset temporanei al cambio pagina
  useEffect(() => {
    setHighlightDrag(null);
    setRulerStart(null);
    setLaserOrigin(null);
    setLaserFlashShot(null);
    setLaserAreaFlash(null);
    canvasLumaRef.current = null;
    setPolygonPts([]);
    setCalibrationDraft(null);
    setPendingLengthPick(null);
    setSnappedVertex(null);
    setEditingTokenId(null);
    setNewTokenDraft(null);
    setActivePenStroke(null);
    setEditingTextNote(null);
    draggingNoteRef.current = null;
  }, [currentPage]);

  // Reset origine laser quando si cambia strumento
  useEffect(() => {
    if (activeTool !== 'laser') {
      setLaserOrigin(null);
    }
  }, [activeTool]);

  // Cleanup timer lampeggio, laser flash, AI BIM & eventuale OCR attivo
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearInterval(flashTimerRef.current);
      if (laserFlashTimerRef.current) window.clearTimeout(laserFlashTimerRef.current);
      if (ocrAbortRef.current) ocrAbortRef.current.abort();
      if (aiBimAbortRef.current) aiBimAbortRef.current.abort();
    };
  }, []);

  // Drag resizer tra Tavola PDF e Tabella Computo
  useEffect(() => {
    if (!isResizingSplit) return;
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth - e.clientX;
      setRightPanelWidth(Math.max(400, Math.min(window.innerWidth - 420, w)));
    };
    const onUp = () => setIsResizingSplit(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingSplit]);

  const currentAnalysis = pageAnalyses[currentPage] || null;

  const metersPerPt = useMemo(() => {
    if (customMetersPerPt !== null && customMetersPerPt > 0) return customMetersPerPt;
    return (0.0254 / 72) * (scaleDenominator || 100);
  }, [customMetersPerPt, scaleDenominator]);

  // Lampeggia una casella (rimane in evidenza lampeggiando e poi sparisce)
  const triggerCellBlink = useCallback((rowId: string, field: TargetNumericField) => {
    if (flashTimerRef.current) {
      window.clearInterval(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    let step = 0;
    setFlashingCell({ rowId, field, on: true });
    flashTimerRef.current = window.setInterval(() => {
      step++;
      if (step >= 7) {
        if (flashTimerRef.current) window.clearInterval(flashTimerRef.current);
        flashTimerRef.current = null;
        setFlashingCell(null);
      } else {
        setFlashingCell({ rowId, field, on: step % 2 === 0 });
      }
    }, 220);
  }, []);

  const focusCellInput = useCallback((rowId: string, field: TargetNumericField) => {
    requestAnimationFrame(() => {
      const el = rowInputRefs.current.get(`cell_${rowId}_${field}`);
      if (el) {
        el.focus();
        el.select();
      }
    });
  }, []);

  // Inserisce un valore misurato nella casella evidenziata (activeCell) con eventuale conversione m -> cm/mm e lampeggio
  const insertValueIntoActiveCell = useCallback(
    (numericValue: number, sourceLabel?: string, isAreaValue = false) => {
      if (!activeCell) return false;
      const targetRow = queuedRows.find((r) => r.id === activeCell.rowId && r.type !== 'subtotal');
      if (!targetRow) return false;

      const { rowId, field } = activeCell;
      const shouldConvertLinear =
        !isAreaValue && field !== 'multiplier' && extractionMode !== 'count';
      const convertedVal = shouldConvertLinear
        ? metersToUnit(numericValue, exportUnit)
        : Math.round(numericValue * 100) / 100;

      const convNote =
        shouldConvertLinear && exportUnit !== 'm'
          ? `${numericValue.toFixed(2)}m→${formatMeasureVal(convertedVal, exportUnit)}${exportUnit}`
          : isAreaValue
          ? `${convertedVal.toFixed(2)} m² (superficie)`
          : undefined;

      setQueuedRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                [field]: convertedVal,
                ...(isAreaValue ? { isDirectArea: true } : {}),
                ...(convNote ? { sourceNote: convNote } : {}),
              }
            : r
        )
      );
      triggerCellBlink(rowId, field);

      const formattedVal = isAreaValue ? convertedVal.toFixed(2) : formatMeasureVal(convertedVal, shouldConvertLinear ? exportUnit : 'm');
      const unitSuffix = isAreaValue ? ' m²' : shouldConvertLinear ? ` ${exportUnit}` : '';

      // Avanzamento automatico saltando Par.Ug.: Par.Ug. -> Lung. -> Larg. -> H/Peso
      if (field === 'multiplier') {
        setActiveCell({ rowId, field: 'length' });
        setLastFeedback(
          `${FIELD_LABEL_IT[field]} = ${formattedVal} inserito${sourceLabel ? ` (${sourceLabel})` : ''} · Prossima casella evidenziata: Lung.`
        );
      } else if (
        field === 'length' &&
        !isAreaValue &&
        !targetRow.isDirectArea &&
        targetRow.width === undefined &&
        extractionMode !== 'linear' &&
        extractionMode !== 'count'
      ) {
        setActiveCell({ rowId, field: 'width' });
        setLastFeedback(
          `${FIELD_LABEL_IT[field]} = ${formattedVal}${unitSuffix} inserito${sourceLabel ? ` (${sourceLabel})` : ''} · Prossima casella evidenziata: Larg.`
        );
      } else if (
        field === 'width' &&
        targetRow.height === undefined &&
        (extractionMode === 'volume' || extractionMode === 'walls_perim_h')
      ) {
        setActiveCell({ rowId, field: 'height' });
        setLastFeedback(
          `${FIELD_LABEL_IT[field]} = ${formattedVal}${unitSuffix} inserito${sourceLabel ? ` (${sourceLabel})` : ''} · Prossima casella evidenziata: H/Peso`
        );
      } else {
        setActiveCell(null);
        setLastFeedback(
          `${FIELD_LABEL_IT[field]} = ${formattedVal}${unitSuffix} inserito nella casella evidenziata${sourceLabel ? ` (${sourceLabel})` : ''}`
        );
      }

      return true;
    },
    [activeCell, queuedRows, extractionMode, exportUnit, triggerCellBlink]
  );

  // Cambio unità riportata nelle caselle del computo (m / cm / mm) riconvertendo le misure già presenti
  const handleChangeExportUnit = useCallback(
    (newUnit: QuoteUnit) => {
      if (newUnit === exportUnit) return;
      const oldFactor = unitFactorFromMeters(exportUnit);
      const newFactor = unitFactorFromMeters(newUnit);
      const ratio = newFactor / oldFactor;
      const conv = (v?: number) => (v !== undefined ? Math.round(v * ratio * 100) / 100 : undefined);

      setQueuedRows((prev) =>
        prev.map((row) => {
          if (row.type === 'subtotal' || row.isDirectArea || extractionMode === 'count') return row;
          const length = conv(row.length);
          const width = conv(row.width);
          const height = conv(row.height);

          let sourceNote = row.sourceNote;
          if (newUnit !== 'm' && length !== undefined) {
            const lenM = length / newFactor;
            const parts = [`${lenM.toFixed(2)}m→${formatMeasureVal(length, newUnit)}${newUnit}`];
            if (width !== undefined) {
              const widM = width / newFactor;
              parts.push(`${widM.toFixed(2)}m→${formatMeasureVal(width, newUnit)}${newUnit}`);
            }
            sourceNote = parts.join(' × ');
          } else if (newUnit === 'm' && row.sourceNote?.includes('→')) {
            sourceNote = undefined;
          }

          return {
            ...row,
            length,
            width,
            height,
            sourceNote,
          };
        })
      );
      setExportUnit(newUnit);
      setLastFeedback(
        newUnit === 'm'
          ? 'Unità riportata sul computo impostata in metri (m)'
          : `Unità riportata sul computo impostata in ${newUnit} (es. 3,40 m → ${formatMeasureVal(metersToUnit(3.4, newUnit), newUnit)} ${newUnit})`
      );
    },
    [exportUnit, extractionMode]
  );

  // Analizza una pagina PDF
  const ensurePageAnalyzed = useCallback(
    async (doc: any, pageNum: number, unit: QuoteUnit, autoFit = false) => {
      try {
        const analysis = await analyzePdfPlanPage(doc, pageNum, unit);
        setPageAnalyses((prev) => ({ ...prev, [pageNum]: analysis }));

        if (analysis.detectedHeightM && analysis.detectedHeightM > 0) {
          setDefaultHeightM(analysis.detectedHeightM);
        }
        if (analysis.detectedScaleDenominator && customMetersPerPt === null) {
          setScaleDenominator(analysis.detectedScaleDenominator);
        }

        if (autoFit) {
          fitAnalysisToViewport(analysis.width, analysis.height);
        }
        return analysis;
      } catch (err) {
        console.error('Errore analisi pagina planimetria:', err);
        return null;
      }
    },
    [customMetersPerPt, fitAnalysisToViewport]
  );

  // Esegue scansione OCR parallela (0° + 90°) sulla pagina corrente riusando il canvas renderizzato quando possibile
  const handleRunOcrForPage = useCallback(
    async (docToScan: any, pageNum: number, unit: QuoteUnit, preRenderedCanvas?: HTMLCanvasElement | null) => {
      if (!docToScan) return;
      if (ocrAbortRef.current) {
        ocrAbortRef.current.abort();
      }
      const controller = new AbortController();
      ocrAbortRef.current = controller;
      ocrScannedPagesRef.current.add(pageNum);

      setIsScanningOcr(true);
      setOcrProgress({ phase: 'prepare', label: 'OCR rapido durante il rendering...', progress: 10 });
      setEditingTokenId(null);
      setNewTokenDraft(null);

      try {
        const baseAnalysis = pageAnalysesRef.current[pageNum];
        const canReuseCanvas =
          preRenderedCanvas &&
          preRenderedCanvas.width >= 1500 &&
          baseAnalysis &&
          baseAnalysis.width > 0;

        const result = canReuseCanvas
          ? await runPlanPageOcrFromCanvas(
              preRenderedCanvas,
              baseAnalysis.width,
              pageNum,
              unit,
              (prog) => setOcrProgress(prog),
              controller.signal
            )
          : await runPlanPageOcr(
              docToScan,
              pageNum,
              unit,
              (prog) => setOcrProgress(prog),
              controller.signal
            );

        if (controller.signal.aborted) return;

        setPageAnalyses((prev) => {
          const base = prev[pageNum];
          if (!base) return prev;
          return {
            ...prev,
            [pageNum]: {
              ...base,
              tokens: result.tokens,
              rooms: result.rooms,
              detectedScaleDenominator: result.detectedScaleDenominator ?? base.detectedScaleDenominator,
              detectedHeightM: result.detectedHeightM ?? base.detectedHeightM,
              pageTitle: result.pageTitle ?? base.pageTitle,
            },
          };
        });

        if (result.detectedScaleDenominator && customMetersPerPt === null) {
          setScaleDenominator(result.detectedScaleDenominator);
        }
        if (result.detectedHeightM && result.detectedHeightM > 0) {
          setDefaultHeightM(result.detectedHeightM);
        }

        setShowEditableOverlay(true);
        setShowOverlayTokens(true);
        if (result.tokens.length > 0) {
          const vertCount = result.tokens.filter((t) => t.orientation === 'vertical').length;
          setLastFeedback(
            `OCR completato: ${result.tokens.length} campi editabili (${vertCount} verticali) e ${result.rooms.length} vani riconosciuti. Doppio clic su qualsiasi quota per modificarla.`
          );
        } else {
          setLastFeedback('Nessun numero o testo nitido rilevato: usa Modifica/Testo per aggiungerli oppure Righello / Poligono.');
        }
      } catch (err: any) {
        if (err?.message === 'Scansione annullata' || controller.signal.aborted) {
          ocrScannedPagesRef.current.delete(pageNum);
        } else {
          console.error('Errore scansione OCR:', err);
          setLastFeedback(`Scansione OCR non riuscita: ${err?.message || 'errore sconosciuto'}`);
        }
      } finally {
        if (ocrAbortRef.current === controller) {
          ocrAbortRef.current = null;
        }
        setIsScanningOcr(false);
        setOcrProgress(null);
      }
    },
    [customMetersPerPt]
  );

  // Salva modifica su un token OCR/manuale e ricalcola vani e quote
  const handleSaveTokenEdit = useCallback(
    (tokenId: string, rawNewText: string) => {
      const trimmed = rawNewText.trim();
      setEditingTokenId(null);
      if (!trimmed) return;

      setPageAnalyses((prev) => {
        const cur = prev[currentPage];
        if (!cur) return prev;
        const updatedRaw = cur.tokens.map((t) => {
          if (t.id !== tokenId) return t;
          const growth = Math.max(1, trimmed.length / Math.max(1, t.str.length));
          const newW = t.orientation === 'vertical' ? t.w : Math.max(t.w, Math.round(t.w * growth));
          return {
            ...t,
            str: trimmed,
            w: newW,
            bbox: t.orientation === 'vertical' ? t.bbox : { ...t.bbox, x2: Math.max(t.bbox.x2, t.bbox.x1 + newW) },
            source: (t.source || 'ocr') as 'vector' | 'ocr' | 'manual',
          };
        });
        const reclass = reclassifyPlanTokens(updatedRaw, quoteUnit, cur.detectedHeightM);
        return {
          ...prev,
          [currentPage]: {
            ...cur,
            tokens: reclass.tokens,
            rooms: reclass.rooms,
            detectedScaleDenominator: reclass.detectedScaleDenominator ?? cur.detectedScaleDenominator,
          },
        };
      });
      setLastFeedback(`Testo/Quota aggiornato in "${trimmed}"`);
    },
    [currentPage, quoteUnit]
  );

  const handleDeleteToken = useCallback(
    (tokenId: string) => {
      setEditingTokenId(null);
      setPageAnalyses((prev) => {
        const cur = prev[currentPage];
        if (!cur) return prev;
        const filtered = cur.tokens.filter((t) => t.id !== tokenId);
        const reclass = reclassifyPlanTokens(filtered, quoteUnit, cur.detectedHeightM);
        return {
          ...prev,
          [currentPage]: {
            ...cur,
            tokens: reclass.tokens,
            rooms: reclass.rooms,
          },
        };
      });
    },
    [currentPage, quoteUnit]
  );

  const handleCreateManualToken = useCallback(
    (x: number, y: number, rawText: string, vertical = false) => {
      const trimmed = rawText.trim();
      setNewTokenDraft(null);
      if (!trimmed) return;

      const classified = classifyPlanToken(trimmed, quoteUnit);
      const estW = Math.max(18, trimmed.length * 6.5);
      const estH = 12;
      const boxW = vertical ? estH : estW;
      const boxH = vertical ? estW : estH;
      const x1 = Math.max(0, x - boxW / 2);
      const y1 = Math.max(0, y - boxH / 2);
      const x2 = x1 + boxW;
      const y2 = y1 + boxH;

      const newTok: PlanToken = {
        id: `man_${uid()}`,
        str: trimmed,
        kind: classified.kind,
        rawValue: classified.rawValue,
        numericValue: classified.numericValue,
        x: x1,
        y: y1,
        cx: x,
        cy: y,
        w: boxW,
        h: boxH,
        angleDeg: vertical ? -90 : 0,
        orientation: vertical ? 'vertical' : 'horizontal',
        bbox: { x1, y1, x2, y2 },
        source: 'manual',
      };

      setPageAnalyses((prev) => {
        const cur = prev[currentPage];
        if (!cur) return prev;
        const reclass = reclassifyPlanTokens([...cur.tokens, newTok], quoteUnit, cur.detectedHeightM);
        return {
          ...prev,
          [currentPage]: {
            ...cur,
            tokens: reclass.tokens,
            rooms: reclass.rooms,
            detectedScaleDenominator: reclass.detectedScaleDenominator ?? cur.detectedScaleDenominator,
          },
        };
      });
      setShowEditableOverlay(true);
      setShowOverlayTokens(true);
      setLastFeedback(`Aggiunto campo editabile "${trimmed}"`);
    },
    [currentPage, quoteUnit]
  );

  const activateSavedSheet = useCallback(
    async (sheet: SavedPlanSheet, fitViewport = false) => {
      if (ocrAbortRef.current) {
        ocrAbortRef.current.abort();
        ocrAbortRef.current = null;
      }
      isHydratingSheetRef.current = true;
      setIsLoadingPdf(true);
      setPdfError(null);
      setRenderError(null);
      setEditingTokenId(null);
      setNewTokenDraft(null);
      setEditingTextNote(null);
      setHighlightDrag(null);
      setRulerStart(null);
      setPolygonPts([]);
      setCalibrationDraft(null);
      setPendingLengthPick(null);
      ocrScannedPagesRef.current.clear();

      try {
        let doc = pdfDocCacheRef.current.get(sheet.id);
        if (!doc) {
          if (!sheet.pdfBase64) {
            throw new Error(`La tavola "${sheet.name}" non ha il PDF incorporato. Carica nuovamente il file PDF.`);
          }
          const bytes = base64ToUint8(sheet.pdfBase64);
          doc = await loadPdfPlanDocument(bytes);
          pdfDocCacheRef.current.set(sheet.id, doc);
        }
        pdfBinaryMetaRef.current.set(sheet.id, {
          pdfBase64: sheet.pdfBase64,
          fileSizeBytes: sheet.fileSizeBytes,
        });

        const rawLayers = sheet.layers?.length ? sheet.layers : createDefaultPlanLayers();
        const hasQuotesLayer = rawLayers.some((l) => l.id === DEFAULT_LAYER_IDS.QUOTES);
        const safeLayers = hasQuotesLayer
          ? rawLayers
          : [
              rawLayers[0],
              {
                id: DEFAULT_LAYER_IDS.QUOTES,
                name: 'Quote & Misure Pulite',
                color: '#f59e0b',
                visible: true,
                locked: false,
              },
              ...rawLayers.slice(1),
            ];
        const safeActiveLayer = safeLayers.some((l) => l.id === sheet.activeLayerId)
          ? sheet.activeLayerId
          : safeLayers[0].id;

        setCurrentSheetId(sheet.id);
        onSelectActivePlanSheet?.(sheet.id);
        setPdfFileName(sheet.name);
        setNumPages(doc.numPages || sheet.numPages);
        setQuoteUnit(sheet.quoteUnit || 'm');
        setExportUnit(sheet.exportUnit || 'm');
        setScaleDenominator(sheet.scaleDenominator || 100);
        setCustomMetersPerPt(sheet.customMetersPerPt ?? null);
        setDefaultHeightM(sheet.defaultHeightM || 3.0);
        setLayers(safeLayers);
        setActiveLayerId(safeActiveLayer);
        setMeasuredPolygonsByPage(sheet.measuredPolygonsByPage || {});
        setMeasuredLinesByPage(sheet.measuredLinesByPage || {});
        setPenStrokesByPage(sheet.penStrokesByPage || {});
        setTextNotesByPage(sheet.textNotesByPage || {});

        const targetPage = Math.max(1, Math.min(sheet.currentPage || 1, doc.numPages || 1));
        manualCalibratedPagesRef.current.clear();
        autoCalibRunKeyRef.current = '';
        if (sheet.customMetersPerPt && sheet.customMetersPerPt > 0) {
          manualCalibratedPagesRef.current.add(targetPage);
          setAutoCalibState({
            status: 'manual_calibrated',
            message: `Scala calibrata salvata (~1:${sheet.scaleDenominator || 100})`,
            matchedH: 0,
            matchedV: 0,
            scaleDenom: sheet.scaleDenominator || 100,
          });
        } else {
          setAutoCalibState({ status: 'idle', message: '', matchedH: 0, matchedV: 0 });
        }
        const baseAnalysis = await analyzePdfPlanPage(doc, targetPage, sheet.quoteUnit || 'm');
        const analysesMap: Record<number, PlanPageAnalysis> = { [targetPage]: baseAnalysis };

        if (sheet.customTokensByPage) {
          for (const [pageStr, customToks] of Object.entries(sheet.customTokensByPage)) {
            const pNum = parseInt(pageStr, 10);
            if (!Number.isFinite(pNum) || !Array.isArray(customToks) || customToks.length === 0) continue;
            const pageBase =
              pNum === targetPage ? baseAnalysis : await analyzePdfPlanPage(doc, pNum, sheet.quoteUnit || 'm');
            const vectorOnly = pageBase.tokens.filter((t) => t.source !== 'ocr' && t.source !== 'manual');
            const reclass = reclassifyPlanTokens(
              [...vectorOnly, ...customToks],
              sheet.quoteUnit || 'm',
              pageBase.detectedHeightM
            );
            analysesMap[pNum] = {
              ...pageBase,
              tokens: reclass.tokens,
              rooms: reclass.rooms,
              detectedScaleDenominator: reclass.detectedScaleDenominator ?? pageBase.detectedScaleDenominator,
            };
            ocrScannedPagesRef.current.add(pNum);
          }
        }

        pageAnalysesRef.current = analysesMap;
        setPageAnalyses(analysesMap);
        setPdfDoc(doc);
        setCurrentPage(targetPage);

        const activeAnalysis = analysesMap[targetPage];
        if (fitViewport && activeAnalysis) {
          requestAnimationFrame(() => {
            fitAnalysisToViewport(activeAnalysis.width, activeAnalysis.height);
          });
        }
        setLastFeedback(`Tavola "${sheet.name}" caricata dalla memoria di progetto`);
      } catch (err: any) {
        console.error('Errore ripristino tavola salvata:', err);
        setPdfError(err?.message || 'Impossibile ripristinare la tavola salvata.');
      } finally {
        setIsLoadingPdf(false);
        setTimeout(() => {
          isHydratingSheetRef.current = false;
        }, 80);
      }
    },
    [onSelectActivePlanSheet, fitAnalysisToViewport]
  );

  // Carica nuovo PDF e lo salva nell'archivio tavole del progetto
  const handleLoadPdfFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setPdfError('Seleziona un file .PDF contenente una tavola planimetrica.');
        return;
      }
      if (ocrAbortRef.current) {
        ocrAbortRef.current.abort();
        ocrAbortRef.current = null;
      }
      isHydratingSheetRef.current = true;
      setIsLoadingPdf(true);
      setPdfError(null);
      setRenderError(null);
      setEditingTokenId(null);
      setNewTokenDraft(null);
      setEditingTextNote(null);
      setPenStrokesByPage({});
      setTextNotesByPage({});
      setMeasuredPolygonsByPage({});
      setMeasuredLinesByPage({});
      ocrScannedPagesRef.current.clear();
      manualCalibratedPagesRef.current.clear();
      autoCalibRunKeyRef.current = '';
      setViewMode('2d');
      setAutoCalibState({ status: 'idle', message: '', matchedH: 0, matchedV: 0 });
      setPageAnalyses({});
      setCustomMetersPerPt(null);
      setLastFeedback(null);

      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const pdfBase64 = bytes.byteLength <= 18 * 1024 * 1024 ? uint8ToBase64(bytes) : undefined;
        const doc = await loadPdfPlanDocument(bytes);
        const initialScanCount = Math.min(doc.numPages, 8);
        const analysesMap: Record<number, PlanPageAnalysis> = {};
        let firstRichPage = 1;
        let foundRich = false;
        let detectedScale = 100;
        let detectedH = 3.0;

        for (let p = 1; p <= initialScanCount; p++) {
          const analysis = await analyzePdfPlanPage(doc, p, quoteUnit);
          analysesMap[p] = analysis;
          if (analysis.detectedHeightM && analysis.detectedHeightM > 0) {
            detectedH = analysis.detectedHeightM;
            setDefaultHeightM(analysis.detectedHeightM);
          }
          if (analysis.detectedScaleDenominator) {
            detectedScale = analysis.detectedScaleDenominator;
            setScaleDenominator(analysis.detectedScaleDenominator);
          }
          if (!foundRich && (analysis.rooms.length > 0 || analysis.tokens.length > 5)) {
            firstRichPage = p;
            foundRich = true;
          }
        }

        const newSheetId = `sheet_${uid()}_${Date.now().toString(36)}`;
        const initLayers = createDefaultPlanLayers();
        pdfDocCacheRef.current.set(newSheetId, doc);
        pdfBinaryMetaRef.current.set(newSheetId, { pdfBase64, fileSizeBytes: bytes.byteLength });

        const targetAnalysis = analysesMap[firstRichPage];
        pageAnalysesRef.current = analysesMap;
        setCurrentSheetId(newSheetId);
        onSelectActivePlanSheet?.(newSheetId);
        setLayers(initLayers);
        setActiveLayerId(DEFAULT_LAYER_IDS.MEASURES);
        setPdfDoc(doc);
        setPdfFileName(file.name);
        setNumPages(doc.numPages);
        setPageAnalyses(analysesMap);
        setCurrentPage(firstRichPage);

        const newSheet: SavedPlanSheet = {
          id: newSheetId,
          name: file.name,
          numPages: doc.numPages,
          currentPage: firstRichPage,
          quoteUnit,
          exportUnit,
          scaleDenominator: detectedScale,
          customMetersPerPt: null,
          defaultHeightM: detectedH,
          layers: initLayers,
          activeLayerId: DEFAULT_LAYER_IDS.MEASURES,
          measuredPolygonsByPage: {},
          measuredLinesByPage: {},
          penStrokesByPage: {},
          textNotesByPage: {},
          pdfBase64,
          fileSizeBytes: bytes.byteLength,
          updatedAt: new Date().toISOString(),
        };
        onPlanSheetsChange?.((prev) => [...prev, newSheet]);

        if (targetAnalysis) {
          requestAnimationFrame(() => {
            fitAnalysisToViewport(targetAnalysis.width, targetAnalysis.height);
          });
        }
        setLastFeedback(
          pdfBase64
            ? `Tavola "${file.name}" caricata e memorizzata nel progetto`
            : `Tavola "${file.name}" caricata (file >18MB: memorizzata solo in sessione locale)`
        );
      } catch (err: any) {
        console.error('Errore apertura PDF:', err);
        setPdfError(err?.message || 'Impossibile aprire il documento PDF.');
      } finally {
        setIsLoadingPdf(false);
        setTimeout(() => {
          isHydratingSheetRef.current = false;
        }, 80);
      }
    },
    [quoteUnit, exportUnit, onPlanSheetsChange, onSelectActivePlanSheet, fitAnalysisToViewport]
  );

  const handleRemoveSavedSheet = useCallback(
    (sheetId: string) => {
      pdfDocCacheRef.current.delete(sheetId);
      pdfBinaryMetaRef.current.delete(sheetId);
      const remaining = planSheets.filter((s) => s.id !== sheetId);
      onPlanSheetsChange?.(remaining);
      if (currentSheetId === sheetId) {
        if (remaining.length > 0) {
          void activateSavedSheet(remaining[0], true);
        } else {
          setCurrentSheetId(null);
          onSelectActivePlanSheet?.(null);
          setPdfDoc(null);
          setPdfFileName('');
          setPageAnalyses({});
          setMeasuredPolygonsByPage({});
          setMeasuredLinesByPage({});
          setPenStrokesByPage({});
          setTextNotesByPage({});
        }
      }
    },
    [planSheets, currentSheetId, onPlanSheetsChange, onSelectActivePlanSheet, activateSavedSheet]
  );

  // Ripristina automaticamente l'ultima tavola lavorata quando si riapre il modal o si carica un progetto
  useEffect(() => {
    if (!isOpen || isLoadingPdf) return;
    if (planSheets.length === 0) {
      if (pdfDoc && currentSheetId) {
        setPdfDoc(null);
        setCurrentSheetId(null);
        setPdfFileName('');
        setPageAnalyses({});
      }
      return;
    }
    const stillExists = currentSheetId && planSheets.some((s) => s.id === currentSheetId);
    if (!pdfDoc || !stillExists) {
      const target = planSheets.find((s) => s.id === activePlanSheetId) || planSheets[0];
      if (target) {
        void activateSavedSheet(target, true);
      }
    }
  }, [isOpen, planSheets, activePlanSheetId, pdfDoc, currentSheetId, isLoadingPdf, activateSavedSheet]);

  // Sincronizza tutte le modifiche (misure, poligoni, layer, appunti, scala, OCR editato) nella tavola di progetto
  useEffect(() => {
    if (!currentSheetId || !pdfDoc || isHydratingSheetRef.current || !onPlanSheetsChange) return;
    const customTokensByPage: Record<number, PlanToken[]> = {};
    for (const [pStr, analysis] of Object.entries(pageAnalyses)) {
      const pNum = parseInt(pStr, 10);
      const custom = (analysis?.tokens || []).filter((t) => t.source === 'ocr' || t.source === 'manual');
      if (custom.length > 0) customTokensByPage[pNum] = custom;
    }
    const meta = pdfBinaryMetaRef.current.get(currentSheetId);
    onPlanSheetsChange((prev) =>
      prev.map((s) => {
        if (s.id !== currentSheetId) return s;
        return {
          ...s,
          name: pdfFileName || s.name,
          numPages: numPages || s.numPages,
          currentPage,
          quoteUnit,
          exportUnit,
          scaleDenominator,
          customMetersPerPt,
          defaultHeightM,
          layers,
          activeLayerId,
          measuredPolygonsByPage,
          measuredLinesByPage,
          penStrokesByPage,
          textNotesByPage,
          customTokensByPage,
          pdfBase64: meta?.pdfBase64 ?? s.pdfBase64,
          fileSizeBytes: meta?.fileSizeBytes ?? s.fileSizeBytes,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }, [
    currentSheetId,
    pdfDoc,
    pdfFileName,
    numPages,
    currentPage,
    quoteUnit,
    exportUnit,
    scaleDenominator,
    customMetersPerPt,
    defaultHeightM,
    layers,
    activeLayerId,
    measuredPolygonsByPage,
    measuredLinesByPage,
    penStrokesByPage,
    textNotesByPage,
    pageAnalyses,
    onPlanSheetsChange,
  ]);

  // Rianalizza pagina al cambio unità (m/cm/mm), preservando eventuali token OCR o manuali già estratti
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const existing = pageAnalyses[currentPage];
      if (existing && existing.tokens.some((t) => t.source === 'ocr' || t.source === 'manual')) {
        const reclass = reclassifyPlanTokens(existing.tokens, quoteUnit, existing.detectedHeightM);
        setPageAnalyses((prev) => {
          const cur = prev[currentPage];
          if (!cur) return prev;
          return {
            ...prev,
            [currentPage]: { ...cur, tokens: reclass.tokens, rooms: reclass.rooms },
          };
        });
        return;
      }
      const analyzed = await analyzePdfPlanPage(pdfDoc, currentPage, quoteUnit);
      if (!cancelled) {
        setPageAnalyses((prev) => {
          const cur = prev[currentPage];
          if (cur && cur.tokens.some((t) => t.source === 'ocr' || t.source === 'manual')) {
            return prev;
          }
          return { ...prev, [currentPage]: analyzed };
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, quoteUnit]);

  // Render pagina su canvas + avvio OCR automatico direttamente nella fase di rendering per tavole scansionate
  useEffect(() => {
    if (!pdfDoc || isLoadingPdf || !canvasRef.current || !isOpen) return;
    let cancelled = false;

    const renderPage = async () => {
      setIsRenderingPage(true);
      setRenderError(null);
      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
        }

        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        // Assicura analisi della pagina anche per pagine > 8 in PDF lunghi
        let pageAnalysis = pageAnalysesRef.current[currentPage];
        if (!pageAnalysis) {
          pageAnalysis = await analyzePdfPlanPage(pdfDoc, currentPage, quoteUnit);
          if (cancelled) return;
          pageAnalysesRef.current = { ...pageAnalysesRef.current, [currentPage]: pageAnalysis };
          setPageAnalyses((prev) => ({ ...prev, [currentPage]: pageAnalysis! }));
        }

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // Mantieni sempre alta risoluzione minima (1.8x) per precisione Laser Virtuale & estrazione BIM
        const renderScale = Math.min(3.5, Math.max(1.8, zoom * dpr));
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;

        if (cancelled) return;

        // Estrae e memorizza in cache la mappa di luminanza per il raycasting in tempo reale del Laser Virtuale
        canvasLumaRef.current = extractCanvasLumaGrid(canvas, pageAnalysis.width, pageAnalysis.height);
        setLumaVersion((v) => v + 1);

        // OCR integrato nella fase di rendering: parte subito riusando il canvas se ad alta risoluzione
        const hasOcrTokens = pageAnalysis.tokens.some((t) => t.source === 'ocr');
        if (pageAnalysis.isLikelyScanned && !hasOcrTokens && !ocrScannedPagesRef.current.has(currentPage)) {
          void handleRunOcrForPage(pdfDoc, currentPage, quoteUnit, canvas);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('Render page warning:', err);
          if (!cancelled) {
            setRenderError(err?.message || 'Errore durante la visualizzazione della tavola PDF.');
          }
        }
      } finally {
        if (!cancelled) setIsRenderingPage(false);
      }
    };

    void renderPage();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [pdfDoc, isLoadingPdf, currentPage, zoom, isOpen, quoteUnit, handleRunOcrForPage]);

  // Scorciatoie tastiera
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      const isInput = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT';

      if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        setIsSpacePressed(true);
      } else if (e.key === 'Shift') {
        setIsShiftPressed(true);
      } else if (e.key === 'Escape') {
        if (editingTextNote) {
          setEditingTextNote(null);
        } else if (editingTokenId) {
          setEditingTokenId(null);
        } else if (newTokenDraft) {
          setNewTokenDraft(null);
        } else if (activePenStroke) {
          setActivePenStroke(null);
        } else if (highlightDrag) {
          setHighlightDrag(null);
        } else if (laserOrigin) {
          setLaserOrigin(null);
        } else if (rulerStart) {
          setRulerStart(null);
        } else if (polygonPts.length > 0) {
          setPolygonPts([]);
        } else if (calibrationDraft) {
          setCalibrationDraft(null);
        } else if (activeCell) {
          setActiveCell(null);
        } else {
          onClose();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !isInput) {
        e.preventDefault();
        if (activeTool === 'pen') {
          setPenStrokesByPage((prev) => {
            const list = prev[currentPage] || [];
            if (list.length === 0) return prev;
            return { ...prev, [currentPage]: list.slice(0, -1) };
          });
        } else {
          setQueuedRows((prev) => prev.slice(0, -1));
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
      if (e.key === 'Shift') setIsShiftPressed(false);
    };
    const onWindowBlur = () => {
      setIsSpacePressed(false);
      setIsShiftPressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [
    isOpen,
    editingTextNote,
    editingTokenId,
    newTokenDraft,
    activePenStroke,
    highlightDrag,
    laserOrigin,
    laserMode,
    rulerStart,
    polygonPts.length,
    calibrationDraft,
    activeCell,
    activeTool,
    currentPage,
    onClose,
  ]);

  const handleFitToViewport = useCallback(() => {
    if (!currentAnalysis) return;
    fitAnalysisToViewport(currentAnalysis.width, currentAnalysis.height);
  }, [currentAnalysis, fitAnalysisToViewport]);

  const convertDraftToExportUnit = useCallback(
    (d: QueuedMeasureDraft): InternalMeasureDraft => {
      const isDirectArea =
        d.width === undefined &&
        d.height === undefined &&
        !!d.sourceNote &&
        (d.sourceNote.includes('Superfici') || d.sourceNote.includes('mq ') || d.sourceNote.includes('Poligono'));

      if (isDirectArea || extractionMode === 'count') {
        return {
          ...d,
          multiplier: d.multiplier === 1 ? undefined : d.multiplier,
          isDirectArea,
        };
      }

      const conv = (v?: number) => (v !== undefined ? metersToUnit(v, exportUnit) : undefined);
      const lengthConv = conv(d.length);
      const widthConv = conv(d.width);
      const heightConv = conv(d.height);

      let extraNote = d.sourceNote;
      if (exportUnit !== 'm' && d.length !== undefined) {
        const parts = [`${d.length.toFixed(2)}m→${formatMeasureVal(lengthConv!, exportUnit)}${exportUnit}`];
        if (d.width !== undefined && widthConv !== undefined) {
          parts.push(`${d.width.toFixed(2)}m→${formatMeasureVal(widthConv, exportUnit)}${exportUnit}`);
        }
        extraNote = parts.join(' × ');
      }

      return {
        ...d,
        multiplier: d.multiplier === 1 ? undefined : d.multiplier,
        length: lengthConv,
        width: widthConv,
        height: heightConv,
        sourceNote: extraNote,
      };
    },
    [exportUnit, extractionMode]
  );

  const appendDrafts = useCallback(
    (drafts: QueuedMeasureDraft[], flashIds?: string[], feedback?: string, extraMeta?: { linkedMarkId?: string; isDirectArea?: boolean }) => {
      if (drafts.length === 0) return;
      const converted = drafts.map((d) => {
        const c = convertDraftToExportUnit(d);
        if (extraMeta?.isDirectArea !== undefined) c.isDirectArea = extraMeta.isDirectArea;
        if (extraMeta?.linkedMarkId) c.linkedMarkId = extraMeta.linkedMarkId;
        return c;
      });
      setQueuedRows((prev) => [...prev, ...converted]);

      // Lampeggia Lung. (saltando Par.Ug.) e se manca Larg. su misura lineare/2D, pre-seleziona automaticamente Larg.
      const last = converted[converted.length - 1];
      if (last.type !== 'subtotal') {
        const blinkField: TargetNumericField =
          last.length !== undefined
            ? 'length'
            : last.width !== undefined
            ? 'width'
            : last.height !== undefined
            ? 'height'
            : 'length';
        triggerCellBlink(last.id, blinkField);

        if (
          converted.length === 1 &&
          last.length !== undefined &&
          last.width === undefined &&
          !last.isDirectArea &&
          extractionMode !== 'linear' &&
          extractionMode !== 'count'
        ) {
          setActiveCell({ rowId: last.id, field: 'width' });
        }
      }

      if (flashIds && flashIds.length > 0) {
        setFlashTokenIds(new Set(flashIds));
        setTimeout(() => setFlashTokenIds(new Set()), 1100);
      }
      if (feedback) {
        setLastFeedback(feedback);
      }
    },
    [convertDraftToExportUnit, extractionMode, triggerCellBlink]
  );

  // Aggiunge un nuovo rigo vuoto saltando Par.Ug. e andando subito su Lung.
  const handleAddEmptyRow = useCallback(
    (type: 'positive' | 'deduction' = 'positive', focusLengthDirectly = false) => {
      const id = uid();
      const newRow: InternalMeasureDraft = {
        id,
        description: type === 'deduction' ? 'A detrarre ' : '',
        type,
        multiplier: undefined,
      };
      setQueuedRows((prev) => [...prev, newRow]);
      setActiveCell({ rowId: id, field: 'length' });
      requestAnimationFrame(() => {
        const target = focusLengthDirectly
          ? rowInputRefs.current.get(`cell_${id}_length`)
          : rowInputRefs.current.get(`desc_${id}`);
        if (target) {
          target.focus();
        }
      });
    },
    []
  );

  // Converte coordinate mouse -> PDF scale-1 pt (con eventuale OSNAP)
  const getPdfCoords = useCallback(
    (clientX: number, clientY: number, applySnap = false): { pt: { x: number; y: number }; snap: SnapVertex | null } => {
      if (!sheetWrapperRef.current) return { pt: { x: 0, y: 0 }, snap: null };
      const rect = sheetWrapperRef.current.getBoundingClientRect();
      const rawX = (clientX - rect.left) / zoom;
      const rawY = (clientY - rect.top) / zoom;

      if (applySnap && osnapEnabled && currentAnalysis && currentAnalysis.snapVertices.length > 0) {
        const threshold = 9 / zoom;
        let best: SnapVertex | null = null;
        let bestDist = threshold;
        for (const v of currentAnalysis.snapVertices) {
          const d = Math.hypot(v.x - rawX, v.y - rawY);
          if (d < bestDist) {
            bestDist = d;
            best = v;
          }
        }
        if (best) {
          return { pt: { x: best.x, y: best.y }, snap: best };
        }
      }
      return { pt: { x: rawX, y: rawY }, snap: null };
    },
    [zoom, osnapEnabled, currentAnalysis]
  );

  // Click diretto su un token o su un vano
  const handlePickToken = useCallback(
    (token: PlanToken) => {
      if (!currentAnalysis) return;

      // Se c'è una casella evidenziata e l'utente clicca una quota / superficie / perimetro -> inseriscilo dentro!
      if (activeCell && token.numericValue && (token.kind === 'dimension' || token.kind === 'surface' || token.kind === 'perimeter' || token.kind === 'height')) {
        setFlashTokenIds(new Set([token.id]));
        setTimeout(() => setFlashTokenIds(new Set()), 900);
        insertValueIntoActiveCell(token.numericValue, `Quota ${token.str}`, token.kind === 'surface');
        return;
      }

      if (token.kind === 'room') {
        const matchedRoom = currentAnalysis.rooms.find((r) => r.tokenIds.includes(token.id));
        if (matchedRoom) {
          const rows = buildMeasurementsFromRoom(matchedRoom.name, {
            areaMq: matchedRoom.areaMq,
            perimeterM: matchedRoom.perimeterM,
            lengthM: matchedRoom.lengthM,
            widthM: matchedRoom.widthM,
            heightM: matchedRoom.heightM,
            mode: extractionMode,
            defaultHeightM,
            sourceNote: 'Clic diretto su vano',
          });
          appendDrafts(rows, matchedRoom.tokenIds, `Aggiunto vano ${matchedRoom.name}`);
          return;
        }
      }

      if (token.kind === 'surface' && token.numericValue) {
        const matchedRoom = currentAnalysis.rooms.find((r) => r.tokenIds.includes(token.id));
        const rows = buildMeasurementsFromRoom(matchedRoom?.name || 'Superficie da tavola', {
          areaMq: token.numericValue,
          perimeterM: matchedRoom?.perimeterM,
          mode: extractionMode,
          defaultHeightM,
          sourceNote: token.str,
        });
        appendDrafts(rows, [token.id], `Estratta superficie ${token.str}`, { isDirectArea: true });
        return;
      }

      if (token.kind === 'perimeter' && token.numericValue) {
        const matchedRoom = currentAnalysis.rooms.find((r) => r.tokenIds.includes(token.id));
        const rows = buildMeasurementsFromRoom(matchedRoom?.name || 'Perimetro da tavola', {
          perimeterM: token.numericValue,
          areaMq: matchedRoom?.areaMq,
          mode: extractionMode === 'area_lw' ? 'linear' : extractionMode,
          defaultHeightM,
          sourceNote: token.str,
        });
        appendDrafts(rows, [token.id], `Estratto perimetro ${token.str}`);
        return;
      }

      if (token.kind === 'dimension' && token.numericValue) {
        const val = token.numericValue;
        let nearRoom = '';
        let nearDist = 110;
        for (const rt of currentAnalysis.tokens) {
          if (rt.kind !== 'room') continue;
          const d = Math.hypot(rt.cx - token.cx, rt.cy - token.cy);
          if (d < nearDist) {
            nearDist = d;
            nearRoom = rt.str;
          }
        }

        if (extractionMode === 'linear') {
          const rows = buildMeasurementsFromRoom(nearRoom || 'Quota lineare', {
            lengthM: val,
            mode: 'linear',
            defaultHeightM,
            sourceNote: `Quota ${token.str}`,
          });
          appendDrafts(rows, [token.id], `Quota lineare ${val.toFixed(2)} m aggiunta`);
        } else if (!pendingLengthPick) {
          setPendingLengthPick({ val, label: nearRoom || 'Vano da tavola' });
          setFlashTokenIds(new Set([token.id]));
          setLastFeedback(`Prima quota selezionata: ${val.toFixed(2)} m · Clicca la seconda quota (larghezza)`);
        } else {
          const L = pendingLengthPick.val;
          const W = val;
          const label = nearRoom || pendingLengthPick.label;
          const rows = buildMeasurementsFromRoom(label, {
            lengthM: L,
            widthM: W,
            mode: extractionMode,
            defaultHeightM,
            sourceNote: `Coppia ${L.toFixed(2)} × ${W.toFixed(2)} m`,
          });
          setPendingLengthPick(null);
          appendDrafts(rows, [token.id], `Coppia quote ${L.toFixed(2)} × ${W.toFixed(2)} m aggiunta`);
        }
      }
    },
    [currentAnalysis, activeCell, insertValueIntoActiveCell, extractionMode, defaultHeightM, pendingLengthPick, appendDrafts]
  );

  const triggerMarkFlash = useCallback((markId: string) => {
    setFlashMarkIds(new Set([markId]));
    setTimeout(() => setFlashMarkIds(new Set()), 850);
  }, []);

  // Riutilizza una linea righello già segnata sulla tavola cliccandoci sopra
  const handleReuseLine = useCallback(
    (ln: MeasuredRulerLine) => {
      triggerMarkFlash(ln.id);
      if (insertValueIntoActiveCell(ln.meters, `Misura salvata ${ln.meters.toFixed(2)}m`, false)) {
        return;
      }
      const newId = uid();
      const exportVal = metersToUnit(ln.meters, exportUnit);
      const convNote =
        exportUnit !== 'm'
          ? `${ln.meters.toFixed(2)} m → ${formatMeasureVal(exportVal, exportUnit)} ${exportUnit}`
          : undefined;
      const newDraft: InternalMeasureDraft = {
        id: newId,
        description: ln.label || 'Misura da tavola salvata',
        type: 'positive',
        multiplier: undefined,
        length: exportVal,
        height:
          extractionMode === 'walls_perim_h' || extractionMode === 'volume'
            ? metersToUnit(defaultHeightM, exportUnit)
            : undefined,
        sourceNote: convNote,
      };
      setQueuedRows((prev) => [...prev, newDraft]);
      triggerCellBlink(newId, 'length');
      if (extractionMode !== 'linear' && extractionMode !== 'count') {
        setActiveCell({ rowId: newId, field: 'width' });
        setLastFeedback(
          `Inserito ${ln.meters.toFixed(2)} m${exportUnit !== 'm' ? ` → ${formatMeasureVal(exportVal, exportUnit)} ${exportUnit}` : ''} in Lung. · Passato a Larg.`
        );
      } else {
        setLastFeedback(
          `Inserito ${ln.meters.toFixed(2)} m${exportUnit !== 'm' ? ` → ${formatMeasureVal(exportVal, exportUnit)} ${exportUnit}` : ''} dalla misura salvata`
        );
      }
    },
    [triggerMarkFlash, insertValueIntoActiveCell, exportUnit, extractionMode, defaultHeightM, triggerCellBlink]
  );

  // Riutilizza un'area (o perimetro) di un poligono già segnato cliccandoci sopra
  const handleReusePolygon = useCallback(
    (poly: MeasuredPolygon, kind: 'area' | 'perimeter' = 'area') => {
      triggerMarkFlash(poly.id);
      if (kind === 'perimeter') {
        if (insertValueIntoActiveCell(poly.perimM, `Perimetro ${poly.label}`, false)) {
          return;
        }
        const newId = uid();
        const exportPerim = metersToUnit(poly.perimM, exportUnit);
        const newDraft: InternalMeasureDraft = {
          id: newId,
          description: `${poly.label} (Perimetro)`,
          type: 'positive',
          multiplier: undefined,
          length: exportPerim,
          height:
            extractionMode === 'walls_perim_h' ? metersToUnit(defaultHeightM, exportUnit) : undefined,
          sourceNote:
            exportUnit !== 'm'
              ? `${poly.perimM.toFixed(2)} m → ${formatMeasureVal(exportPerim, exportUnit)} ${exportUnit}`
              : `Perimetro ${poly.perimM.toFixed(2)} m`,
        };
        setQueuedRows((prev) => [...prev, newDraft]);
        triggerCellBlink(newId, 'length');
        setLastFeedback(`Riportato perimetro ${poly.label}: ${poly.perimM.toFixed(2)} m`);
        return;
      }

      if (insertValueIntoActiveCell(poly.areaM2, `Area ${poly.label}`, true)) {
        return;
      }
      const newId = uid();
      const newDraft: InternalMeasureDraft = {
        id: newId,
        description: poly.label,
        type: 'positive',
        multiplier: undefined,
        length: poly.areaM2,
        height: extractionMode === 'volume' ? metersToUnit(defaultHeightM, exportUnit) : undefined,
        isDirectArea: true,
        sourceNote: `Da area ${poly.label} (${poly.areaM2.toFixed(2)} m²)`,
      };
      setQueuedRows((prev) => [...prev, newDraft]);
      triggerCellBlink(newId, 'length');
      setLastFeedback(`Inserita area ${poly.label}: ${poly.areaM2.toFixed(2)} m²`);
    },
    [triggerMarkFlash, insertValueIntoActiveCell, exportUnit, extractionMode, defaultHeightM, triggerCellBlink]
  );

  // Finalizza poligono CAD -> misura la superficie e lascia il segno persistente (cancellabile & riutilizzabile) sulla tavola
  const finalizePolygon = useCallback(
    (pts: Array<{ x: number; y: number }>) => {
      if (pts.length < 3) {
        setPolygonPts([]);
        return;
      }
      const areaPt2 = shoelaceArea(pts);
      const perimPt = polyPerimeter(pts, true);
      const areaM2 = Math.round(areaPt2 * metersPerPt * metersPerPt * 100) / 100;
      const perimM = Math.round(perimPt * metersPerPt * 100) / 100;

      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      let roomName = 'Superficie da poligono';
      if (currentAnalysis) {
        let bestD = 90;
        for (const rt of currentAnalysis.tokens) {
          if (rt.kind !== 'room') continue;
          const d = Math.hypot(rt.cx - cx, rt.cy - cy);
          if (d < bestD) {
            bestD = d;
            roomName = rt.str;
          }
        }
      }

      const existingCount = (measuredPolygonsByPage[currentPage] || []).length;
      const polyColor = POLYGON_COLORS[existingCount % POLYGON_COLORS.length];
      const polyId = `poly_${uid()}`;
      const newPoly: MeasuredPolygon = {
        id: polyId,
        points: pts,
        centroid: { x: cx, y: cy },
        label: roomName === 'Superficie da poligono' ? `Sup. ${existingCount + 1}` : roomName,
        areaM2,
        perimM,
        color: polyColor,
        layerId: activeLayerId,
      };
      setMeasuredPolygonsByPage((prev) => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), newPoly],
      }));
      setShowMeasuredMarks(true);
      setPolygonPts([]);

      // Se c'è una casella attiva, inserisce la superficie (o il perimetro se modalità lineare/pareti)
      if (activeCell) {
        const isPerimMode = extractionMode === 'linear' || extractionMode === 'walls_perim_h';
        insertValueIntoActiveCell(isPerimMode ? perimM : areaM2, 'Poligono superficie', !isPerimMode);
        return;
      }

      const isPerimMode = extractionMode === 'linear' || extractionMode === 'walls_perim_h';
      const rows = buildMeasurementsFromRoom(roomName, {
        areaMq: areaM2,
        perimeterM: perimM,
        mode: extractionMode === 'area_lw' ? 'area_lw' : extractionMode,
        defaultHeightM,
        sourceNote: `Poligono ${areaM2.toFixed(2)} m² (${pts.length} vertici)`,
      });
      appendDrafts(
        rows,
        undefined,
        `Superficie ${newPoly.label}: ${areaM2.toFixed(2)} m² (Perim. ${perimM.toFixed(2)} m) · Segno cliccabile salvato sulla tavola`,
        { linkedMarkId: polyId, isDirectArea: !isPerimMode && extractionMode !== 'volume' }
      );
    },
    [
      metersPerPt,
      currentAnalysis,
      measuredPolygonsByPage,
      currentPage,
      activeLayerId,
      activeCell,
      extractionMode,
      defaultHeightM,
      appendDrafts,
      insertValueIntoActiveCell,
    ]
  );

  // Eventi Mouse sul Canvas PDF
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!currentAnalysis) return;

    if (e.button === 1 || isSpacePressed || activeTool === 'pan') {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      panOriginRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        panX: panOffsetRef.current.x,
        panY: panOffsetRef.current.y,
      };
      return;
    }

    if (e.button !== 0) return;

    const useSnap =
      activeTool === 'ruler' ||
      activeTool === 'polygon' ||
      activeTool === 'calibrate' ||
      (activeTool === 'laser' && laserMode === 'single' && !laserOrigin);
    const { pt } = getPdfCoords(e.clientX, e.clientY, useSnap);

    if (activeTool === 'highlight') {
      setHighlightDrag({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
      return;
    }

    if (activeTool === 'laser') {
      // Le misure dei laser entrano direttamente nella cella evidenziata (o nuova riga) SENZA lasciare segni permanenti in pianta
      const commitLinearLaser = (
        p1: LaserPoint,
        p2: LaserPoint,
        distM: number,
        hitWall: boolean,
        detailLabel?: string
      ) => {
        if (distM <= 0.01) return;

        if (laserSoundEnabled) playLaserBeep();

        setLaserAreaFlash(null);
        setLaserFlashShot({ p1, p2, meters: distM });
        if (laserFlashTimerRef.current) window.clearTimeout(laserFlashTimerRef.current);
        laserFlashTimerRef.current = window.setTimeout(() => setLaserFlashShot(null), 480);

        const sourceTag = detailLabel || (hitWall ? 'Laser su parete' : 'Laser virtuale');
        if (insertValueIntoActiveCell(distM, sourceTag)) {
          return;
        }

        // Nessuna casella evidenziata: crea un nuovo rigo saltando Par.Ug., inserisce Lung. e passa subito a Larg.
        const newId = uid();
        const exportVal = metersToUnit(distM, exportUnit);
        const convNote =
          exportUnit !== 'm'
            ? `${sourceTag} ${distM.toFixed(2)} m → ${formatMeasureVal(exportVal, exportUnit)} ${exportUnit}`
            : sourceTag;

        const newDraft: InternalMeasureDraft = {
          id: newId,
          description: laserMode === 'dual' ? 'Misura da laser 2 raggi' : 'Misura da laser virtuale',
          type: 'positive',
          multiplier: undefined,
          length: exportVal,
          height:
            extractionMode === 'walls_perim_h' || extractionMode === 'volume'
              ? metersToUnit(defaultHeightM, exportUnit)
              : undefined,
          sourceNote: convNote,
        };
        setQueuedRows((prev) => [...prev, newDraft]);
        triggerCellBlink(newId, 'length');
        if (extractionMode !== 'linear' && extractionMode !== 'count') {
          setActiveCell({ rowId: newId, field: 'width' });
          setLastFeedback(
            `${sourceTag}: ${distM.toFixed(2)} m${exportUnit !== 'm' ? ` → ${formatMeasureVal(exportVal, exportUnit)} ${exportUnit}` : ''} inserito in Lung. · Passato a Larg.`
          );
        } else {
          setLastFeedback(
            `${sourceTag}: ${distM.toFixed(2)} m${exportUnit !== 'm' ? ` → ${formatMeasureVal(exportVal, exportUnit)} ${exportUnit}` : ''} acquisito`
          );
        }
      };

      const grid = canvasLumaRef.current;
      const ignoreBboxes =
        laserIgnoreText && currentAnalysis ? currentAnalysis.tokens.map((t) => t.bbox) : undefined;
      const effectiveOrtho = isShiftPressed ? !laserOrtho : laserOrtho;

      // Primo clic comune a tutti e 3 i laser: posiziona il punto di partenza (origine)
      if (!laserOrigin) {
        setLaserOrigin(pt);
        if (laserMode === 'area') {
          setLastFeedback(
            activeCell
              ? `Laser Areale avviato: muoviti verso il 2° punto per espandere la superficie e clicca per inserire in ${FIELD_LABEL_IT[activeCell.field]}`
              : 'Laser Areale avviato: muoviti verso il 2° punto nel vano per elaborare la superficie e clicca per acquisire'
          );
        } else if (laserMode === 'dual') {
          setLastFeedback(
            activeCell
              ? `Laser 2 Raggi posizionato: sposta il mouse su un lato per sommare Sx+Dx e clicca per inserire in ${FIELD_LABEL_IT[activeCell.field]}`
              : 'Laser 2 Raggi posizionato: sposta il mouse su un lato (orizzontale o verticale) per sommare i due raggi e clicca'
          );
        } else {
          setLastFeedback(
            activeCell
              ? `Laser posizionato: muovi il mouse verso la parete e clicca per inserire in ${FIELD_LABEL_IT[activeCell.field]}`
              : 'Laser posizionato: muovi il mouse per mirare la parete opposta e clicca per acquisire'
          );
        }
        return;
      }

      // Secondo clic — LASER 3 (AREALE m²): acquisisce la superficie espansa senza salvare poligoni in pianta
      if (laserMode === 'area') {
        const origin = laserOrigin;
        setLaserOrigin(null);
        if (!grid) {
          setLastFeedback('Attendi il completamento del rendering della piantina per attivare il Laser Areale.');
          return;
        }
        const areaRes = computeVirtualLaserArea({
          grid,
          originPt: origin,
          cursorPt: pt,
          sensitivity: laserSensitivity,
          ignoreBboxes,
        });
        if (!areaRes) {
          setLastFeedback('Nessuna superficie rilevata tra i due punti: prova a posizionarti dentro il vano.');
          return;
        }
        const areaM2 = Math.round(areaRes.areaPt2 * metersPerPt * metersPerPt * 100) / 100;
        const perimM = Math.round(areaRes.perimPt * metersPerPt * 100) / 100;
        if (areaM2 <= 0.01) return;

        if (laserSoundEnabled) playLaserBeep();

        setLaserFlashShot(null);
        setLaserAreaFlash({
          svgFillPath: areaRes.svgFillPath,
          svgBorderPath: areaRes.svgBorderPath,
          areaM2,
          centroid: areaRes.centroid,
        });
        if (laserFlashTimerRef.current) window.clearTimeout(laserFlashTimerRef.current);
        laserFlashTimerRef.current = window.setTimeout(() => setLaserAreaFlash(null), 540);

        // Trova eventuale nome vano vicino al baricentro per la descrizione della riga
        let roomName = 'Superficie da laser areale';
        if (currentAnalysis) {
          let bestD = 95;
          for (const rt of currentAnalysis.tokens) {
            if (rt.kind !== 'room') continue;
            const d = Math.hypot(rt.cx - areaRes.centroid.x, rt.cy - areaRes.centroid.y);
            if (d < bestD) {
              bestD = d;
              roomName = rt.str;
            }
          }
        }

        const isPerimMode = extractionMode === 'linear' || extractionMode === 'walls_perim_h';
        if (activeCell) {
          insertValueIntoActiveCell(
            isPerimMode ? perimM : areaM2,
            isPerimMode ? `Laser areale (P ${perimM.toFixed(2)}m)` : `Laser areale ${areaM2.toFixed(2)} m²`,
            !isPerimMode
          );
          return;
        }

        const rows = buildMeasurementsFromRoom(roomName, {
          areaMq: areaM2,
          perimeterM: perimM,
          mode: extractionMode === 'area_lw' ? 'area_lw' : extractionMode,
          defaultHeightM,
          sourceNote: `Laser areale ${areaM2.toFixed(2)} m² (P ${perimM.toFixed(2)} m)`,
        });
        appendDrafts(
          rows,
          undefined,
          `Laser Areale ${roomName}: ${areaM2.toFixed(2)} m² (Perim. ${perimM.toFixed(2)} m) caricato nel computo`,
          { isDirectArea: !isPerimMode && extractionMode !== 'volume' }
        );
        return;
      }

      // Secondo clic — LASER 1 (1 Raggio) o LASER 2 (2 Raggi Sx+Dx sommati)
      const origin = laserOrigin;
      setLaserOrigin(null);
      if (grid) {
        const shot = computeVirtualLaserShot({
          grid,
          mode: laserMode,
          originPt: origin,
          cursorPt: pt,
          orthoLock: effectiveOrtho,
          sensitivity: laserSensitivity,
          ignoreBboxes,
        });
        if (shot) {
          const distM = Math.round(shot.distPt * metersPerPt * 100) / 100;
          if (shot.mode === 'dual') {
            const d1M = Math.round(shot.d1Pt * metersPerPt * 100) / 100;
            const d2M = Math.round(shot.d2Pt * metersPerPt * 100) / 100;
            commitLinearLaser(
              shot.p1,
              shot.p2,
              distM,
              shot.hitWall1 && shot.hitWall2,
              `Laser 2 raggi (${d1M.toFixed(2)}+${d2M.toFixed(2)}m)`
            );
          } else {
            commitLinearLaser(shot.p1, shot.p2, distM, shot.hitWall2);
          }
          return;
        }
      }
      const fallbackDistM = Math.round(Math.hypot(pt.x - origin.x, pt.y - origin.y) * metersPerPt * 100) / 100;
      commitLinearLaser(origin, pt, fallbackDistM, false);
      return;
    }

    if (activeTool === 'ruler') {
      if (!rulerStart) {
        setRulerStart(pt);
        setLastFeedback(
          activeCell
            ? `Clicca il 2° punto per inserire la misura in ${FIELD_LABEL_IT[activeCell.field]}`
            : 'Clicca il secondo punto sulla tavola per rilevare la distanza'
        );
      } else {
        const distPt = Math.hypot(pt.x - rulerStart.x, pt.y - rulerStart.y);
        const distM = Math.round(distPt * metersPerPt * 100) / 100;
        const p1 = rulerStart;
        setRulerStart(null);
        if (distM > 0.01) {
          const lineId = `line_${uid()}`;
          setMeasuredLinesByPage((prev) => ({
            ...prev,
            [currentPage]: [
              ...(prev[currentPage] || []),
              { id: lineId, p1, p2: pt, meters: distM, layerId: activeLayerId },
            ],
          }));
          setShowMeasuredMarks(true);

          // Priorità assoluta: se c'è una casella evidenziata nel computo, inserisci dentro e avanza!
          if (insertValueIntoActiveCell(distM, 'Righello')) {
            return;
          }
          // Altrimenti crea un nuovo rigo saltando Par.Ug., inserendo Lung. (convertita in exportUnit) e passando subito a Larg.!
          const newId = uid();
          const exportVal = metersToUnit(distM, exportUnit);
          const convNote =
            exportUnit !== 'm' ? `${distM.toFixed(2)} m → ${formatMeasureVal(exportVal, exportUnit)} ${exportUnit}` : undefined;

          const newDraft: InternalMeasureDraft = {
            id: newId,
            description: 'Misura da righello',
            type: 'positive',
            multiplier: undefined,
            length: exportVal,
            height:
              extractionMode === 'walls_perim_h' || extractionMode === 'volume'
                ? metersToUnit(defaultHeightM, exportUnit)
                : undefined,
            sourceNote: convNote,
            linkedMarkId: lineId,
          };
          setQueuedRows((prev) => [...prev, newDraft]);
          triggerCellBlink(newId, 'length');
          if (extractionMode !== 'linear' && extractionMode !== 'count') {
            setActiveCell({ rowId: newId, field: 'width' });
            setLastFeedback(
              `Misurato ${distM.toFixed(2)} m${exportUnit !== 'm' ? ` → ${formatMeasureVal(exportVal, exportUnit)} ${exportUnit}` : ''} in Lung. · Passato automaticamente a Larg.`
            );
          } else {
            setLastFeedback(
              `Misurato ${distM.toFixed(2)} m${exportUnit !== 'm' ? ` → ${formatMeasureVal(exportVal, exportUnit)} ${exportUnit}` : ''}`
            );
          }
        }
      }
      return;
    }

    if (activeTool === 'calibrate') {
      if (!rulerStart) {
        setRulerStart(pt);
        setCalibrationDraft(null);
        setLastFeedback('Clicca l’estremo opposto della quota nota per calibrare la scala');
      } else {
        const distPt = Math.hypot(pt.x - rulerStart.x, pt.y - rulerStart.y);
        setRulerStart(null);
        if (distPt > 4) {
          setCalibrationDraft({ distPt, realMetersStr: '4.50' });
        }
      }
      return;
    }

    if (activeTool === 'edit_ocr') {
      if (editingTokenId) {
        setEditingTokenId(null);
        return;
      }
      setNewTokenDraft({ x: pt.x, y: pt.y, text: '', vertical: false });
      return;
    }

    if (activeTool === 'pen') {
      if (penEraserMode) {
        const tol = 10 / zoom;
        setPenStrokesByPage((prev) => {
          const list = prev[currentPage] || [];
          const filtered = list.filter(
            (st) =>
              isLayerLocked(st.layerId) ||
              !isLayerVisible(st.layerId) ||
              !st.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= tol + st.width / 2)
          );
          return filtered.length === list.length ? prev : { ...prev, [currentPage]: filtered };
        });
        return;
      }
      if (isLayerLocked(activeLayerId)) {
        setLastFeedback('Il layer attivo è bloccato: sbloccalo dal pannello Layer per disegnare');
        return;
      }
      setActivePenStroke({
        id: `pen_${uid()}`,
        points: [pt],
        color: penColor,
        width: penIsHighlighter ? 11 : penWidth,
        isHighlighter: penIsHighlighter,
        layerId: activeLayerId,
      });
      return;
    }

    if (activeTool === 'text_note') {
      if (editingTextNote) {
        setEditingTextNote(null);
        return;
      }
      const noteLayerId =
        activeLayerId === DEFAULT_LAYER_IDS.MEASURES && layers.some((l) => l.id === DEFAULT_LAYER_IDS.NOTES)
          ? DEFAULT_LAYER_IDS.NOTES
          : activeLayerId;
      if (isLayerLocked(noteLayerId)) {
        setLastFeedback('Il layer degli appunti è bloccato: sbloccalo dal pannello Layer');
        return;
      }
      setEditingTextNote({
        x: pt.x,
        y: pt.y,
        text: '',
        color: textNoteColor,
        fontSize: textNoteSize,
        vertical: false,
        bgOpaque: true,
        isReminder: noteLayerId === DEFAULT_LAYER_IDS.NOTES || noteLayerId === DEFAULT_LAYER_IDS.SITE,
        layerId: noteLayerId,
      });
      return;
    }

    if (activeTool === 'polygon') {
      if (polygonPts.length >= 3) {
        const first = polygonPts[0];
        if (Math.hypot(pt.x - first.x, pt.y - first.y) <= 10 / zoom) {
          finalizePolygon(polygonPts);
          return;
        }
      }
      setPolygonPts((prev) => [...prev, pt]);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning && panOriginRef.current) {
      const dx = e.clientX - panOriginRef.current.clientX;
      const dy = e.clientY - panOriginRef.current.clientY;
      setPanOffset({
        x: panOriginRef.current.panX + dx,
        y: panOriginRef.current.panY + dy,
      });
      return;
    }

    const useSnap =
      activeTool === 'ruler' ||
      activeTool === 'polygon' ||
      activeTool === 'calibrate' ||
      (activeTool === 'laser' && laserMode === 'single' && !laserOrigin);
    const { pt, snap } = getPdfCoords(e.clientX, e.clientY, useSnap);
    setCursorPt(pt);
    setSnappedVertex(snap);

    if (draggingNoteRef.current) {
      const drag = draggingNoteRef.current;
      setTextNotesByPage((prev) => {
        const list = prev[currentPage] || [];
        return {
          ...prev,
          [currentPage]: list.map((n) =>
            n.id === drag.id && !isLayerLocked(n.layerId)
              ? { ...n, x: pt.x - drag.offsetX, y: pt.y - drag.offsetY }
              : n
          ),
        };
      });
      return;
    }

    if (activeTool === 'pen' && penEraserMode && (e.buttons & 1) === 1) {
      const tol = 10 / zoom;
      setPenStrokesByPage((prev) => {
        const list = prev[currentPage] || [];
        const filtered = list.filter(
          (st) =>
            isLayerLocked(st.layerId) ||
            !isLayerVisible(st.layerId) ||
            !st.points.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= tol + st.width / 2)
        );
        return filtered.length === list.length ? prev : { ...prev, [currentPage]: filtered };
      });
      return;
    }

    if (activePenStroke) {
      setActivePenStroke((prev) => {
        if (!prev) return null;
        const last = prev.points[prev.points.length - 1];
        if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 1.2) return prev;
        return { ...prev, points: [...prev.points, pt] };
      });
      return;
    }

    if (highlightDrag) {
      setHighlightDrag((prev) => (prev ? { ...prev, x2: pt.x, y2: pt.y } : null));
    }
  };

  const handleCanvasMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      panOriginRef.current = null;
      return;
    }

    if (draggingNoteRef.current) {
      draggingNoteRef.current = null;
      return;
    }

    if (activePenStroke) {
      const finished = activePenStroke;
      setActivePenStroke(null);
      if (finished.points.length >= 1) {
        const finalPts =
          finished.points.length === 1
            ? [finished.points[0], { x: finished.points[0].x + 0.5, y: finished.points[0].y + 0.5 }]
            : finished.points;
        setPenStrokesByPage((prev) => ({
          ...prev,
          [currentPage]: [...(prev[currentPage] || []), { ...finished, points: finalPts }],
        }));
      }
      return;
    }

    if (activeTool === 'highlight' && highlightDrag && currentAnalysis) {
      const w = Math.abs(highlightDrag.x2 - highlightDrag.x1);
      const h = Math.abs(highlightDrag.y2 - highlightDrag.y1);
      const box = highlightDrag;
      setHighlightDrag(null);

      // Clic rapido (< 5pt): carica automaticamente qualsiasi quota colorata/vano sotto al cursore
      if (w < 5 && h < 5) {
        const cx = (box.x1 + box.x2) / 2;
        const cy = (box.y1 + box.y2) / 2;
        const hit = currentAnalysis.tokens.find(
          (t) =>
            t.kind !== 'other' &&
            t.kind !== 'scale' &&
            cx >= t.bbox.x1 - 5 &&
            cx <= t.bbox.x2 + 5 &&
            cy >= t.bbox.y1 - 5 &&
            cy <= t.bbox.y2 + 5
        );
        if (hit) {
          handlePickToken(hit);
        }
        return;
      }

      const result = analyzeHighlightedRegion(box, currentAnalysis, extractionMode, defaultHeightM);

      // Se l'utente ha evidenziato UNA sola quota numerica e ha una casella attiva selezionata, mettila dentro!
      const numericMatches = result.matchedTokens.filter(
        (t) => t.numericValue && (t.kind === 'dimension' || t.kind === 'surface' || t.kind === 'perimeter')
      );
      if (activeCell && numericMatches.length === 1 && numericMatches[0].numericValue) {
        setFlashTokenIds(new Set([numericMatches[0].id]));
        setTimeout(() => setFlashTokenIds(new Set()), 900);
        insertValueIntoActiveCell(
          numericMatches[0].numericValue,
          `Evidenziato ${numericMatches[0].str}`,
          numericMatches[0].kind === 'surface'
        );
        return;
      }

      if (result.drafts.length > 0) {
        appendDrafts(
          result.drafts,
          result.matchedTokens.map((t) => t.id),
          result.summaryText
        );
      } else {
        setLastFeedback(result.summaryText);
      }
    }
  };

  // Standard CAD 2D senza barre di scorrimento: la rotella fa zoom fluido ancorato esattamente sul cursore
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !pdfDoc || viewMode !== '2d') return;

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const oldZoom = zoomRef.current;
      const factor = e.deltaY < 0 ? 1.14 : 0.88;
      zoomAroundViewportPoint(oldZoom * factor, e.clientX, e.clientY);
    };

    container.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onNativeWheel);
    };
  }, [pdfDoc, viewMode, zoomAroundViewportPoint]);

  // Standard CAD 2D: pan infinito fluido ovunque nella tavola (rotella premuta, Spazio o strumento Mano)
  useEffect(() => {
    if (!isPanning) return;
    const onWinMove = (e: MouseEvent) => {
      if (!panOriginRef.current) return;
      setPanOffset({
        x: panOriginRef.current.panX + (e.clientX - panOriginRef.current.clientX),
        y: panOriginRef.current.panY + (e.clientY - panOriginRef.current.clientY),
      });
    };
    const onWinUp = () => {
      setIsPanning(false);
      panOriginRef.current = null;
    };
    window.addEventListener('mousemove', onWinMove);
    window.addEventListener('mouseup', onWinUp);
    return () => {
      window.removeEventListener('mousemove', onWinMove);
      window.removeEventListener('mouseup', onWinUp);
    };
  }, [isPanning]);

  const handleAddAllPageRooms = () => {
    if (!currentAnalysis || currentAnalysis.rooms.length === 0) return;
    const allRows: QueuedMeasureDraft[] = [];
    const allIds: string[] = [];
    for (const rm of currentAnalysis.rooms) {
      allRows.push(
        ...buildMeasurementsFromRoom(rm.name, {
          areaMq: rm.areaMq,
          perimeterM: rm.perimeterM,
          lengthM: rm.lengthM,
          widthM: rm.widthM,
          heightM: rm.heightM,
          mode: extractionMode,
          defaultHeightM,
          sourceNote: `Scansione Pag. ${currentPage}`,
        })
      );
      allIds.push(...rm.tokenIds);
    }
    appendDrafts(allRows, allIds, `Caricati tutti i ${currentAnalysis.rooms.length} vani da Tav. ${currentPage}`);
  };

  const handleAddSingleRoom = (rm: DetectedRoomBlock) => {
    const rows = buildMeasurementsFromRoom(rm.name, {
      areaMq: rm.areaMq,
      perimeterM: rm.perimeterM,
      lengthM: rm.lengthM,
      widthM: rm.widthM,
      heightM: rm.heightM,
      mode: extractionMode,
      defaultHeightM,
      sourceNote: rm.source === 'computed-labels' ? 'Superfici tavola' : 'Quote tavola',
    });
    appendDrafts(rows, rm.tokenIds, `Aggiunto ${rm.name}`);
  };

  const handleUpdateDraft = (id: string, field: keyof QueuedMeasureDraft, value: any) => {
    setQueuedRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleCloneLastRow = () => {
    const refRow =
      (activeCell && queuedRows.find((r) => r.id === activeCell.rowId && r.type !== 'subtotal')) ||
      [...queuedRows].reverse().find((r) => r.type !== 'subtotal');
    if (!refRow) return;
    const { linkedMarkId: _omitMark, ...rest } = refRow;
    const cloned: InternalMeasureDraft = { ...rest, id: uid() };
    setQueuedRows((prev) => [...prev, cloned]);
    triggerCellBlink(cloned.id, 'length');
  };

  const handleApplyCalibration = () => {
    if (!calibrationDraft) return;
    const meters = parseFloat(calibrationDraft.realMetersStr.replace(',', '.'));
    if (!Number.isFinite(meters) || meters <= 0) return;
    const mPerPt = meters / calibrationDraft.distPt;
    setCustomMetersPerPt(mPerPt);
    const derivedDenom = Math.round((mPerPt * 72) / 0.0254);
    if (derivedDenom > 0) setScaleDenominator(derivedDenom);
    manualCalibratedPagesRef.current.add(currentPage);
    setAutoCalibState({
      status: 'manual_calibrated',
      message: `Scala calibrata manualmente (~1:${derivedDenom || scaleDenominator})`,
      matchedH: 0,
      matchedV: 0,
      scaleDenom: derivedDenom || scaleDenominator,
    });
    setCalibrationDraft(null);
    setLastFeedback(`Scala calibrata: ${meters.toFixed(2)} m (~1:${derivedDenom})`);
    setActiveTool('ruler');
  };

  // Auto-calibrazione su richiesta o automatica sulla base delle quote orizzontali e verticali censite
  const executeAutoCalibration = useCallback(
    (forceManualOverride = false) => {
      const grid = canvasLumaRef.current;
      if (!currentAnalysis || !grid) return;

      if (!forceManualOverride && manualCalibratedPagesRef.current.has(currentPage)) {
        return;
      }

      const res = autoCalibratePlanFromQuotes(
        grid,
        currentAnalysis.tokens,
        currentAnalysis.detectedScaleDenominator
      );

      if (res.success && res.metersPerPt && res.derivedScaleDenominator) {
        if (forceManualOverride) {
          manualCalibratedPagesRef.current.delete(currentPage);
        }
        setCustomMetersPerPt(res.metersPerPt);
        setScaleDenominator(res.derivedScaleDenominator);
        setAutoCalibState({
          status: 'auto_calibrated',
          message: res.reason,
          matchedH: res.matchedHorizontal,
          matchedV: res.matchedVertical,
          scaleDenom: res.derivedScaleDenominator,
        });
        setLastFeedback(res.reason);
      } else {
        setAutoCalibState({
          status: 'needs_manual',
          message: res.reason,
          matchedH: res.matchedHorizontal,
          matchedV: res.matchedVertical,
        });
        if (forceManualOverride) {
          setLastFeedback(res.reason);
        }
      }
    },
    [currentAnalysis, currentPage]
  );

  // Avvia auto-calibrazione automaticamente appena la pagina è renderizzata e le quote H/V (o OCR) sono pronte
  useEffect(() => {
    if (!pdfDoc || !currentAnalysis || isLoadingPdf) return;

    if (manualCalibratedPagesRef.current.has(currentPage)) {
      return;
    }

    if (isScanningOcr) {
      setAutoCalibState({
        status: 'pending_ocr',
        message: 'Scansione OCR quote orizzontali e verticali in corso per auto-calibrazione...',
        matchedH: 0,
        matchedV: 0,
      });
      return;
    }

    const grid = canvasLumaRef.current;
    if (!grid || lumaVersion === 0) return;

    // Su tavole scansionate attendi il completamento del primo OCR automatico
    const hasOcrOrManual = currentAnalysis.tokens.some((t) => t.source === 'ocr' || t.source === 'manual');
    if (currentAnalysis.isLikelyScanned && !hasOcrOrManual && !ocrScannedPagesRef.current.has(currentPage)) {
      setAutoCalibState({
        status: 'pending_ocr',
        message: 'Attesa scansione quote OCR per auto-calibrazione scala...',
        matchedH: 0,
        matchedV: 0,
      });
      return;
    }

    const quoteSig = currentAnalysis.tokens
      .filter((t) => t.kind === 'dimension')
      .map((t) => `${t.id}:${t.numericValue}`)
      .join('|');
    const runKey = `${currentSheetId || 'local'}_${currentPage}_${lumaVersion}_${quoteSig}`;
    if (autoCalibRunKeyRef.current === runKey) return;
    autoCalibRunKeyRef.current = runKey;

    executeAutoCalibration(false);
  }, [
    pdfDoc,
    currentSheetId,
    currentPage,
    currentAnalysis,
    isLoadingPdf,
    isScanningOcr,
    lumaVersion,
    executeAutoCalibration,
  ]);

  // 1. Quote significative e nomi vano per il layer opzionale "Quote & Misure" in 3D/BIM (senza alterare la pianta)
  const significantQuotes = useMemo<SignificantQuoteItem[]>(() => {
    return extractSignificantQuotes(currentAnalysis?.tokens || [], metersPerPt);
  }, [currentAnalysis?.tokens, metersPerPt]);

  // 2. ESTRAZIONE ARCHITETTONICA AD ALTA PRECISIONE (Muri Perimetrali, Tramezzi, Porte, Finestre, Pilastri, Vani)
  // Lavora direttamente sulla griglia PDF originale ad alta risoluzione, ignorando scritte, quote e linee di misura!
  const extractedBimModel = useMemo<PlanBimModel>(() => {
    const gridToUse = canvasLumaRef.current;
    if (!pdfDoc || lumaVersion === 0 || !gridToUse) {
      return {
        walls: [],
        doors: [],
        windows: [],
        pillars: [],
        rooms: [],
        planWidthM: 10,
        planHeightM: 10,
        boundsM: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
      };
    }
    return extractPlanBimModel(
      gridToUse,
      metersPerPt,
      currentAnalysis?.tokens || [],
      currentAnalysis?.rooms || [],
      defaultHeightM,
      wall3DSensitivity
    );
  }, [
    pdfDoc,
    lumaVersion,
    metersPerPt,
    currentAnalysis?.tokens,
    currentAnalysis?.rooms,
    wall3DSensitivity,
  ]);

  const currentPlanBimKey = useMemo(
    () => `${currentSheetId || 'local'}_${currentPage}_${metersPerPt.toFixed(6)}`,
    [currentSheetId, currentPage, metersPerPt]
  );

  const activeAiBimModel = useMemo(
    () => (aiBimOverride && aiBimOverride.key === currentPlanBimKey ? aiBimOverride.model : null),
    [aiBimOverride, currentPlanBimKey]
  );

  const runAiBimReconstruction = useCallback(
    async (forceRefresh = false) => {
      const sourceCanvas = canvasRef.current;
      if (!pdfDoc || !sourceCanvas || sourceCanvas.width === 0 || sourceCanvas.height === 0) {
        setAiBimError('Attendi il caricamento completo della planimetria PDF prima di ricostruire il modello.');
        return;
      }

      if (!forceRefresh) {
        const cached = aiBimCacheRef.current.get(currentPlanBimKey);
        if (cached) {
          setAiBimError(null);
          setAiBimOverride({ key: currentPlanBimKey, model: cached });
          return;
        }
      }

      if (aiBimAbortRef.current) {
        aiBimAbortRef.current.abort();
      }
      const controller = new AbortController();
      aiBimAbortRef.current = controller;
      aiAutoAttemptedRef.current.add(currentPlanBimKey);

      setIsAnalyzingAiBim(true);
      setAiBimError(null);

      try {
        const planW =
          currentAnalysis && currentAnalysis.width > 0
            ? currentAnalysis.width * metersPerPt
            : extractedBimModel.planWidthM;
        const planH =
          currentAnalysis && currentAnalysis.height > 0
            ? currentAnalysis.height * metersPerPt
            : extractedBimModel.planHeightM;

        const aiModel = await analyzePlanBimWithAi(
          sourceCanvas,
          planW,
          planH,
          metersPerPt,
          defaultHeightM,
          currentAnalysis?.rooms || [],
          controller.signal
        );

        if (controller.signal.aborted) return;

        aiBimCacheRef.current.set(currentPlanBimKey, aiModel);
        setAiBimOverride({ key: currentPlanBimKey, model: aiModel });
        setLastFeedback(
          `Modello 3D/BIM pulito ricostruito: ${aiModel.walls.length} muri, ${aiModel.doors.length} porte, ${aiModel.windows.length} finestre, ${aiModel.pillars.length} pilastri, ${aiModel.rooms.length} vani`
        );
      } catch (err: any) {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        console.error('Errore ricostruzione AI BIM:', err);
        setAiBimError(
          err?.message || 'Ricostruzione architettonica pulita non riuscita. Riprova o usa il rilevamento locale.'
        );
      } finally {
        if (aiBimAbortRef.current === controller) {
          aiBimAbortRef.current = null;
        }
        setIsAnalyzingAiBim(false);
      }
    },
    [
      pdfDoc,
      currentPlanBimKey,
      currentAnalysis,
      metersPerPt,
      extractedBimModel.planWidthM,
      extractedBimModel.planHeightM,
      defaultHeightM,
    ]
  );

  // Avvia automaticamente la ricostruzione architettonica pulita la prima volta che si entra in 3D o BIM
  useEffect(() => {
    if (!pdfDoc || lumaVersion === 0) return;
    if (viewMode !== '3d' && viewMode !== 'bim') return;

    const cached = aiBimCacheRef.current.get(currentPlanBimKey);
    if (cached) {
      setAiBimOverride((prev) => (prev?.key === currentPlanBimKey ? prev : { key: currentPlanBimKey, model: cached }));
      return;
    }

    if (aiAutoAttemptedRef.current.has(currentPlanBimKey)) return;
    void runAiBimReconstruction(false);
  }, [pdfDoc, lumaVersion, viewMode, currentPlanBimKey, runAiBimReconstruction]);

  // Sincronizza il modello BIM editabile dando priorità al modello pulito AI quando presente
  useEffect(() => {
    const baseModel = activeAiBimModel ?? extractedBimModel;
    bimUndoStackRef.current = [];
    bimRedoStackRef.current = [];
    setBimHistoryCounts({ undo: 0, redo: 0 });
    setBimModelState({
      ...baseModel,
      walls: baseModel.walls.map((w) => ({ ...w, heightM: defaultHeightM })),
      pillars: baseModel.pillars.map((p) => ({ ...p, heightM: defaultHeightM })),
      rooms: baseModel.rooms.map((r) => ({ ...r, heightM: defaultHeightM })),
    });
  }, [activeAiBimModel, extractedBimModel]);

  // Aggiorna altezza pareti & pilastri live quando cambia H (defaultHeightM)
  useEffect(() => {
    setBimModelState((prev) => ({
      ...prev,
      walls: prev.walls.map((w) => ({ ...w, heightM: defaultHeightM })),
      pillars: prev.pillars.map((p) => ({ ...p, heightM: defaultHeightM })),
      rooms: prev.rooms.map((r) => ({ ...r, heightM: defaultHeightM })),
    }));
  }, [defaultHeightM]);

  const applyBimEdit = useCallback((updater: (prev: PlanBimModel) => PlanBimModel, feedback?: string) => {
    setBimModelState((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      bimUndoStackRef.current = [...bimUndoStackRef.current.slice(-29), prev];
      bimRedoStackRef.current = [];
      setBimHistoryCounts({ undo: bimUndoStackRef.current.length, redo: 0 });
      return next;
    });
    if (feedback) setLastFeedback(feedback);
  }, []);

  const handleUndoBim = useCallback(() => {
    setBimModelState((prev) => {
      if (bimUndoStackRef.current.length === 0) return prev;
      const previous = bimUndoStackRef.current[bimUndoStackRef.current.length - 1];
      bimUndoStackRef.current = bimUndoStackRef.current.slice(0, -1);
      bimRedoStackRef.current = [...bimRedoStackRef.current.slice(-29), prev];
      setBimHistoryCounts({ undo: bimUndoStackRef.current.length, redo: bimRedoStackRef.current.length });
      return previous;
    });
    setLastFeedback('Modifica 3D/BIM annullata');
  }, []);

  const handleRedoBim = useCallback(() => {
    setBimModelState((prev) => {
      if (bimRedoStackRef.current.length === 0) return prev;
      const restored = bimRedoStackRef.current[bimRedoStackRef.current.length - 1];
      bimRedoStackRef.current = bimRedoStackRef.current.slice(0, -1);
      bimUndoStackRef.current = [...bimUndoStackRef.current.slice(-29), prev];
      setBimHistoryCounts({ undo: bimUndoStackRef.current.length, redo: bimRedoStackRef.current.length });
      return restored;
    });
    setLastFeedback('Modifica 3D/BIM ripristinata');
  }, []);

  // Modifica in tempo reale di un oggetto BIM (Parete, Porta, Finestra, Pilastro, Vano)
  const handleUpdateBimObject = useCallback(
    (updated: BimObject) => {
      applyBimEdit((prev) => {
        if (updated.kind === 'wall') {
          return {
            ...prev,
            walls: prev.walls.map((w) => {
              if (w.id !== updated.id) return w;
              // Se è cambiata la lunghezza dal pannello BIM, aggiorna coerentemente gli estremi x1/y1/x2/y2
              if (Math.abs(w.lengthM - updated.lengthM) > 0.001) {
                const ang =
                  typeof updated.angleRad === 'number'
                    ? updated.angleRad
                    : Math.atan2(w.y2M - w.y1M, w.x2M - w.x1M);
                const half = updated.lengthM * 0.5;
                const ux = Math.cos(ang);
                const uy = Math.sin(ang);
                return {
                  ...updated,
                  x1M: Math.round((updated.cxM - ux * half) * 100) / 100,
                  y1M: Math.round((updated.cyM - uy * half) * 100) / 100,
                  x2M: Math.round((updated.cxM + ux * half) * 100) / 100,
                  y2M: Math.round((updated.cyM + uy * half) * 100) / 100,
                  angleRad: ang,
                };
              }
              return updated;
            }),
          };
        }
        if (updated.kind === 'door') {
          return { ...prev, doors: prev.doors.map((d) => (d.id === updated.id ? updated : d)) };
        }
        if (updated.kind === 'window') {
          return { ...prev, windows: prev.windows.map((wn) => (wn.id === updated.id ? updated : wn)) };
        }
        if (updated.kind === 'pillar') {
          return { ...prev, pillars: prev.pillars.map((p) => (p.id === updated.id ? updated : p)) };
        }
        return { ...prev, rooms: prev.rooms.map((r) => (r.id === updated.id ? updated : r)) };
      });
    },
    [applyBimEdit]
  );

  // Eliminazione di un oggetto BIM in 1 clic
  const handleDeleteBimObject = useCallback(
    (id: string, kind: BimObjectKind) => {
      applyBimEdit((prev) => {
        if (kind === 'wall') return { ...prev, walls: prev.walls.filter((w) => w.id !== id) };
        if (kind === 'door') return { ...prev, doors: prev.doors.filter((d) => d.id !== id) };
        if (kind === 'window') return { ...prev, windows: prev.windows.filter((wn) => wn.id !== id) };
        if (kind === 'pillar') return { ...prev, pillars: prev.pillars.filter((p) => p.id !== id) };
        return { ...prev, rooms: prev.rooms.filter((r) => r.id !== id) };
      }, 'Oggetto rimosso dal modello 3D/BIM (Ctrl+Z per annullare)');
    },
    [applyBimEdit]
  );

  // Eliminazione multipla in 1 colpo (Riquadro Gomma o Multi-Selezione)
  const handleDeleteMultipleBimObjects = useCallback(
    (items: Array<{ id: string; kind: BimObjectKind }>) => {
      if (items.length === 0) return;
      const dropIds = new Set(items.map((it) => it.id));
      applyBimEdit(
        (prev) => ({
          ...prev,
          walls: prev.walls.filter((w) => !dropIds.has(w.id)),
          doors: prev.doors.filter((d) => !dropIds.has(d.id)),
          windows: prev.windows.filter((wn) => !dropIds.has(wn.id)),
          pillars: prev.pillars.filter((p) => !dropIds.has(p.id)),
          rooms: prev.rooms.filter((r) => !dropIds.has(r.id)),
        }),
        `Rimossi ${items.length} oggetti dal modello 3D/BIM (Ctrl+Z per annullare)`
      );
    },
    [applyBimEdit]
  );

  // Aggiunta manuale CAD di un nuovo Muro, Porta (con foro automatico!), Finestra (con foro automatico!) o Pilastro
  const handleAddBimObject = useCallback(
    (newObj: BimObject) => {
      applyBimEdit((prev) => {
        if (newObj.kind === 'wall') {
          const nextWalls = [...prev.walls, newObj];
          const minX = Math.min(prev.boundsM.minX, newObj.x1M, newObj.x2M);
          const maxX = Math.max(prev.boundsM.maxX, newObj.x1M, newObj.x2M);
          const minY = Math.min(prev.boundsM.minY, newObj.y1M, newObj.y2M);
          const maxY = Math.max(prev.boundsM.maxY, newObj.y1M, newObj.y2M);
          return {
            ...prev,
            walls: nextWalls,
            boundsM: prev.walls.length === 0
              ? {
                  minX: Math.min(newObj.x1M, newObj.x2M),
                  maxX: Math.max(newObj.x1M, newObj.x2M),
                  minY: Math.min(newObj.y1M, newObj.y2M),
                  maxY: Math.max(newObj.y1M, newObj.y2M),
                }
              : { minX, maxX, minY, maxY },
          };
        }
        if (newObj.kind === 'door') {
          const carvedWalls = splitWallsAroundOpenings(prev.walls, [newObj], []);
          return { ...prev, walls: carvedWalls, doors: [...prev.doors, newObj] };
        }
        if (newObj.kind === 'window') {
          const carvedWalls = splitWallsAroundOpenings(prev.walls, [], [newObj]);
          return { ...prev, walls: carvedWalls, windows: [...prev.windows, newObj] };
        }
        if (newObj.kind === 'pillar') {
          return { ...prev, pillars: [...prev.pillars, newObj] };
        }
        return { ...prev, rooms: [...prev.rooms, newObj] };
      }, `Aggiunto ${newObj.name} al modello 3D/BIM`);
    },
    [applyBimEdit]
  );

  // Pulizia automatica rapida 1-clic (frammenti corti o muri doppi / gradini scale)
  const handleCleanBimModel = useCallback(
    (action: 'short_fragments' | 'dedup_and_stairs') => {
      if (action === 'short_fragments') {
        applyBimEdit((prev) => {
          const kept = prev.walls.filter((w) => w.lengthM >= 0.65);
          if (kept.length === prev.walls.length) return prev;
          return { ...prev, walls: kept };
        }, 'Puliti i frammenti di parete corti (< 0,65 m)');
        return;
      }
      applyBimEdit((prev) => {
        const cleanedWalls = splitWallsAroundOpenings(
          cleanArchitecturalWalls(prev.walls),
          prev.doors,
          prev.windows
        );
        return { ...prev, walls: cleanedWalls };
      }, 'Pulizia automatica applicata (muri doppi uniti e gradini rimossi)');
    },
    [applyBimEdit]
  );

  const totalBimObjectsCount =
    bimModelState.walls.length +
    bimModelState.doors.length +
    bimModelState.windows.length +
    bimModelState.pillars.length +
    bimModelState.rooms.length;

  // Converte qualsiasi oggetto BIM in riga computo pronta per il BoQ
  const bimObjectToDraft = useCallback(
    (obj: BimObject, sides: 1 | 2): InternalMeasureDraft => {
      const id = uid();
      if (obj.kind === 'wall') {
        const areaM2 = Math.round(obj.lengthM * obj.heightM * sides * 100) / 100;
        return {
          id,
          description: sides === 2 ? `${obj.name} (2 lati)` : obj.name,
          type: 'positive',
          multiplier: sides > 1 ? sides : undefined,
          length: metersToUnit(obj.lengthM, exportUnit),
          height: metersToUnit(obj.heightM, exportUnit),
          sourceNote: `BIM ${obj.category} · ${obj.material} · ${areaM2.toFixed(2)} m²`,
        };
      }
      if (obj.kind === 'door') {
        const areaM2 = Math.round(obj.widthM * obj.heightM * 100) / 100;
        return {
          id,
          description: `${obj.name} (${obj.doorType})`,
          type: 'positive',
          multiplier: extractionMode === 'count' ? 1 : undefined,
          length: extractionMode === 'count' ? undefined : metersToUnit(obj.widthM, exportUnit),
          height: extractionMode === 'count' ? undefined : metersToUnit(obj.heightM, exportUnit),
          sourceNote: `BIM Porta ${obj.widthM.toFixed(2)}×${obj.heightM.toFixed(2)} m (${areaM2.toFixed(2)} m²)`,
        };
      }
      if (obj.kind === 'window') {
        const areaM2 = Math.round(obj.widthM * obj.heightM * 100) / 100;
        return {
          id,
          description: `${obj.name} (${obj.windowType})`,
          type: 'positive',
          multiplier: extractionMode === 'count' ? 1 : undefined,
          length: extractionMode === 'count' ? undefined : metersToUnit(obj.widthM, exportUnit),
          height: extractionMode === 'count' ? undefined : metersToUnit(obj.heightM, exportUnit),
          sourceNote: `BIM Infisso ${obj.widthM.toFixed(2)}×${obj.heightM.toFixed(2)} m (${areaM2.toFixed(2)} m²)`,
        };
      }
      if (obj.kind === 'pillar') {
        const volM3 = Math.round(obj.widthM * obj.depthM * obj.heightM * 100) / 100;
        return {
          id,
          description: `${obj.name} (${obj.material})`,
          type: 'positive',
          length: metersToUnit(obj.widthM, exportUnit),
          width: metersToUnit(obj.depthM, exportUnit),
          height: metersToUnit(obj.heightM, exportUnit),
          sourceNote: `BIM Pilastro ${obj.widthM.toFixed(2)}×${obj.depthM.toFixed(2)}×${obj.heightM.toFixed(2)} m (${volM3.toFixed(2)} m³)`,
        };
      }
      // Room / Pavimento
      return {
        id,
        description: `${obj.name} (${obj.finish})`,
        type: 'positive',
        length: obj.areaM2,
        isDirectArea: true,
        sourceNote: `BIM Vano · Sup. ${obj.areaM2.toFixed(2)} m² · Perim. ${obj.perimeterM.toFixed(2)} m`,
      };
    },
    [exportUnit, extractionMode]
  );

  // Computo diretto di 1 oggetto cliccato nel 3D o nel BIM Inspector
  const handleComputeBimObject = useCallback(
    (obj: BimObject, sides: 1 | 2) => {
      if (activeCell) {
        if (obj.kind === 'wall') {
          if (activeCell.field === 'height') {
            insertValueIntoActiveCell(obj.heightM, `Altezza ${obj.name}`, false);
            return;
          }
          if (activeCell.field === 'length' && extractionMode === 'linear') {
            insertValueIntoActiveCell(obj.lengthM, `Lung. ${obj.name}`, false);
            return;
          }
          const areaM2 = Math.round(obj.lengthM * obj.heightM * sides * 100) / 100;
          insertValueIntoActiveCell(areaM2, `${obj.name} (${sides} ${sides === 2 ? 'lati' : 'lato'})`, true);
          return;
        }
        if (obj.kind === 'door' || obj.kind === 'window') {
          const areaM2 = Math.round(obj.widthM * obj.heightM * 100) / 100;
          insertValueIntoActiveCell(areaM2, `BIM ${obj.name}`, true);
          return;
        }
        if (obj.kind === 'pillar') {
          const volM3 = Math.round(obj.widthM * obj.depthM * obj.heightM * 100) / 100;
          insertValueIntoActiveCell(volM3, `BIM ${obj.name} (m³)`, true);
          return;
        }
        insertValueIntoActiveCell(obj.areaM2, `BIM ${obj.name}`, true);
        return;
      }

      const draft = bimObjectToDraft(obj, sides);
      setQueuedRows((prev) => [...prev, draft]);
      triggerCellBlink(draft.id, 'length');
      setLastFeedback(`Oggetto BIM computato: ${draft.description}`);
    },
    [activeCell, extractionMode, insertValueIntoActiveCell, bimObjectToDraft, triggerCellBlink]
  );

  // Computo multiplo di oggetti selezionati nel 3D o nel BIM
  const handleComputeMultipleBimObjects = useCallback(
    (objs: BimObject[], sides: 1 | 2) => {
      if (objs.length === 0) return;
      const drafts = objs.map((o) => bimObjectToDraft(o, sides));
      setQueuedRows((prev) => [...prev, ...drafts]);
      triggerCellBlink(drafts[drafts.length - 1].id, 'length');
      setLastFeedback(`Aggiunti ${objs.length} oggetti BIM al computo metrico`);
    },
    [bimObjectToDraft, triggerCellBlink]
  );

  // Calcola totali parziali e totale complessivo esattamente come il computo principale
  const computedRows = useMemo(() => {
    let runningSubtotal = 0;
    let grandTotal = 0;
    let itemCounter = 0;

    return {
      rows: queuedRows.map((row) => {
        if (row.type === 'subtotal') {
          const val = Math.round(runningSubtotal * 100) / 100;
          runningSubtotal = 0;
          return { row, rowNumber: null as number | null, qty: val };
        }
        itemCounter++;
        const qty = computeRowQuantity(row);
        runningSubtotal += qty;
        grandTotal += qty;
        return { row, rowNumber: itemCounter, qty: Math.round(qty * 100) / 100 };
      }),
      grandTotal: Math.round(grandTotal * 100) / 100,
    };
  }, [queuedRows]);

  const handleConfirmImport = () => {
    if (!effectiveTargetId || queuedRows.length === 0) return;
    const exportRows: PlanMeasureExportRow[] = queuedRows.map((r) => ({
      description: r.description,
      type: r.type,
      multiplier: r.multiplier,
      length: r.length,
      width: r.width,
      height: r.height,
    }));
    onAdd(exportRows, effectiveTargetId);
    setQueuedRows([]);
    setActiveCell(null);
    onClose();
  };

  // Calcolo in tempo reale dei 2 Laser lineari (1 Raggio & 2 Raggi Sx+Dx sommati)
  const liveLaserShot = useMemo(() => {
    if (activeTool !== 'laser' || laserMode === 'area' || !laserOrigin || !cursorPt || !currentAnalysis) return null;
    const grid = canvasLumaRef.current;
    if (!grid) return null;
    const ignoreBboxes = laserIgnoreText ? currentAnalysis.tokens.map((t) => t.bbox) : undefined;
    const effectiveOrtho = isShiftPressed ? !laserOrtho : laserOrtho;
    return computeVirtualLaserShot({
      grid,
      mode: laserMode,
      originPt: laserOrigin,
      cursorPt,
      orthoLock: effectiveOrtho,
      sensitivity: laserSensitivity,
      ignoreBboxes,
    });
  }, [
    activeTool,
    cursorPt,
    currentAnalysis,
    laserMode,
    laserOrigin,
    laserIgnoreText,
    isShiftPressed,
    laserOrtho,
    laserSensitivity,
    lumaVersion,
  ]);

  // Calcolo in tempo reale del Laser 3 Areale (scansione superficie m² & perimetro tra Punto 1 e Punto 2)
  const liveLaserArea = useMemo(() => {
    if (activeTool !== 'laser' || laserMode !== 'area' || !laserOrigin || !cursorPt || !currentAnalysis) return null;
    const grid = canvasLumaRef.current;
    if (!grid) return null;
    const ignoreBboxes = laserIgnoreText ? currentAnalysis.tokens.map((t) => t.bbox) : undefined;
    return computeVirtualLaserArea({
      grid,
      originPt: laserOrigin,
      cursorPt,
      sensitivity: laserSensitivity,
      ignoreBboxes,
    });
  }, [
    activeTool,
    cursorPt,
    currentAnalysis,
    laserMode,
    laserOrigin,
    laserIgnoreText,
    laserSensitivity,
    lumaVersion,
  ]);

  if (!isOpen) return null;

  const liveRulerMeters =
    rulerStart && cursorPt
      ? Math.round(Math.hypot(cursorPt.x - rulerStart.x, cursorPt.y - rulerStart.y) * metersPerPt * 100) / 100
      : 0;

  const liveLaserMeters = liveLaserShot
    ? Math.round(liveLaserShot.distPt * metersPerPt * 100) / 100
    : 0;
  const liveLaserD1Meters = liveLaserShot
    ? Math.round(liveLaserShot.d1Pt * metersPerPt * 100) / 100
    : 0;
  const liveLaserD2Meters = liveLaserShot
    ? Math.round(liveLaserShot.d2Pt * metersPerPt * 100) / 100
    : 0;

  const liveLaserAreaM2 = liveLaserArea
    ? Math.round(liveLaserArea.areaPt2 * metersPerPt * metersPerPt * 100) / 100
    : 0;
  const liveLaserPerimM = liveLaserArea
    ? Math.round(liveLaserArea.perimPt * metersPerPt * 100) / 100
    : 0;

  const livePolyAreaM2 =
    polygonPts.length >= 2 && cursorPt
      ? Math.round(shoelaceArea([...polygonPts, cursorPt]) * metersPerPt * metersPerPt * 100) / 100
      : 0;

  // Stile visivo per cella (normale vs evidenziata come target vs lampeggiante dopo misura)
  const getCellStyleClass = (rowId: string, field: TargetNumericField, isDeduction: boolean) => {
    const isFlashing = flashingCell?.rowId === rowId && flashingCell?.field === field;
    const isActiveTarget = activeCell?.rowId === rowId && activeCell?.field === field;

    if (isFlashing && flashingCell?.on) {
      return 'bg-emerald-300 text-emerald-950 ring-2 ring-emerald-600 shadow-md scale-[1.03] font-black transition-all duration-100';
    }
    if (isFlashing && !flashingCell?.on) {
      return 'bg-amber-100 text-slate-900 ring-2 ring-amber-400 transition-all duration-100';
    }
    if (isActiveTarget) {
      return 'bg-amber-50 ring-2 ring-amber-500 text-slate-950 font-bold shadow-inner';
    }
    return isDeduction
      ? 'bg-rose-50/40 hover:bg-rose-50 text-rose-700 border-rose-200/80'
      : 'bg-white hover:bg-amber-50/40 text-slate-800 border-slate-200';
  };

  return (
    <div className="fixed inset-0 z-[10050] w-screen h-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* TOP BAR COMPATTA A TUTTO SCHERMO */}
      <header className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between gap-4 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
            <Ruler className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-white whitespace-nowrap">
                Rilievo Misure da Tavola PDF
              </h2>
              {pdfFileName && (
                <>
                  <span className="text-slate-500">·</span>
                  <span className="text-xs text-slate-300 truncate max-w-[260px]" title={pdfFileName}>
                    {pdfFileName}
                  </span>
                </>
              )}
            </div>
            {targetArticle && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400 truncate max-w-[680px]">
                <span className="font-mono font-semibold text-amber-300">{targetArticle.code}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{targetArticle.description}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-200">U.M. {targetArticle.unit || 'cad'}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {articles.length > 1 && onSelectTargetArticle && (
            <select
              value={effectiveTargetId}
              onChange={(e) => onSelectTargetArticle(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-lg px-2.5 py-1.5 max-w-[260px] focus:outline-none focus:ring-2 focus:ring-amber-500"
              title="Cambia voce del computo su cui inserire le misure"
            >
              {articles.map((art, i) => (
                <option key={art.id} value={art.id}>
                  #{i + 1} · {art.code} — {art.description.slice(0, 38)}
                </option>
              ))}
            </select>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleLoadPdfFile(file);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-100 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>{pdfDoc ? '+ Aggiungi Tavola PDF' : 'Apri Tavola PDF'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Chiudi (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* BARRA TAVOLE IN MEMORIA NEL PROGETTO */}
      {planSheets.length > 0 && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-3 py-1 flex items-center gap-1.5 overflow-x-auto shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap mr-1">
            Tavole Progetto ({planSheets.length}):
          </span>
          {planSheets.map((sheet) => {
            const isActive = sheet.id === currentSheetId;
            const polyCnt = Object.values(sheet.measuredPolygonsByPage || {}).reduce((s, a) => s + (a?.length || 0), 0);
            const lineCnt = Object.values(sheet.measuredLinesByPage || {}).reduce((s, a) => s + (a?.length || 0), 0);
            const noteCnt = Object.values(sheet.textNotesByPage || {}).reduce((s, a) => s + (a?.length || 0), 0);
            const totalMarks = polyCnt + lineCnt + noteCnt;

            return (
              <div
                key={sheet.id}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (sheet.id !== currentSheetId) void activateSavedSheet(sheet, true);
                  }}
                  className="inline-flex items-center gap-1.5 text-left"
                  title={`Passa alla tavola ${sheet.name} (${sheet.numPages} pag.)`}
                >
                  <FileText className="w-3 h-3 shrink-0 text-amber-400" />
                  <span className="max-w-[180px] truncate">{sheet.name}</span>
                  {totalMarks > 0 && (
                    <span className="px-1 rounded bg-slate-950/70 text-[10px] font-mono text-emerald-300">
                      {totalMarks}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveSavedSheet(sheet.id);
                  }}
                  className="p-0.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40"
                  title="Rimuovi tavola dalla memoria del progetto"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* WORKSPACE A TUTTO SCHERMO: TAVOLA PDF (SINISTRA) + ELENCO MISURE COMPUTO (DESTRA) */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* AREA TAVOLA PDF */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-900 relative">
          {/* BARRA MENU STILE AUTOCAD (SEMPRE IN ALTO, ZERO MENU IN SOVRAPPOSIZIONE SUL DISEGNO) */}
          {pdfDoc && (
            <div
              ref={cadMenuBarRef}
              className="relative z-40 bg-slate-900 border-b border-slate-700/80 px-2.5 py-1 flex items-center justify-between gap-2 shrink-0 select-none"
            >
              {/* SINISTRA: SELETTORE VISTA 2D / 3D / BIM + STRUMENTI RAPIDI & MENU A TENDINA AUTOCAD */}
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-md border border-slate-700 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('2d');
                      setOpenCadMenu(null);
                    }}
                    className={`px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      viewMode === '2d'
                        ? 'bg-slate-200 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                    title="Vista 2D della piantina PDF"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>2D Pianta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('3d');
                      setOpenCadMenu(null);
                    }}
                    className={`px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      viewMode === '3d'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-amber-300 hover:text-white hover:bg-amber-950/60'
                    }`}
                    title="Modello 3D pulito con pareti estruse all'altezza dichiarata H"
                  >
                    <Box className="w-3.5 h-3.5" />
                    <span>3D</span>
                    {bimModelState.walls.length > 0 && (
                      <span
                        className={`px-1 rounded text-[10px] font-mono tabular-nums ${
                          viewMode === '3d' ? 'bg-slate-950/20 text-slate-950' : 'bg-amber-500/20 text-amber-200'
                        }`}
                      >
                        {bimModelState.walls.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('bim');
                      setOpenCadMenu(null);
                    }}
                    className={`px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      viewMode === 'bim'
                        ? 'bg-cyan-500 text-slate-950 shadow-sm'
                        : 'text-cyan-300 hover:text-white hover:bg-cyan-950/60'
                    }`}
                    title="Modello BIM interattivo da PDF: individua ed edita Muri, Porte, Finestre, Pilastri e Vani"
                  >
                    <Cuboid className="w-3.5 h-3.5" />
                    <span>BIM</span>
                    {totalBimObjectsCount > 0 && (
                      <span
                        className={`px-1 rounded text-[10px] font-mono tabular-nums ${
                          viewMode === 'bim' ? 'bg-slate-950/20 text-slate-950' : 'bg-cyan-500/20 text-cyan-200'
                        }`}
                      >
                        {totalBimObjectsCount}
                      </span>
                    )}
                  </button>
                </div>

                {viewMode === '2d' && (
                  <>
                    <div className="h-4 w-px bg-slate-700/80 shrink-0" />

                    {/* STRUMENTI PRINCIPALI DI MISURA RAPIDA */}
                    <div className="flex items-center gap-0.5 bg-slate-950/80 p-0.5 rounded-md border border-slate-800 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTool('highlight');
                          setOpenCadMenu(null);
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                          activeTool === 'highlight'
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Trascina un riquadro evidenziatore sopra un vano o una quota"
                      >
                        <Highlighter className="w-3.5 h-3.5" />
                        <span>Evidenzia</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTool('pick');
                          setOpenCadMenu(null);
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                          activeTool === 'pick'
                            ? 'bg-cyan-500 text-slate-950 shadow-sm'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Clicca una singola quota (la inserisce nella casella evidenziata se attiva)"
                      >
                        <MousePointerClick className="w-3.5 h-3.5" />
                        <span>Quota</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTool('ruler');
                          setRulerStart(null);
                          setLaserOrigin(null);
                          setOpenCadMenu(null);
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                          activeTool === 'ruler'
                            ? 'bg-emerald-500 text-slate-950 shadow-sm'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Misura tra 2 punti in scala e inserisce il valore nella casella evidenziata"
                      >
                        <Ruler className="w-3.5 h-3.5" />
                        <span>Righello</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTool('laser');
                          setRulerStart(null);
                          setLaserOrigin(null);
                          setPolygonPts([]);
                          setOpenCadMenu(null);
                          setLastFeedback(
                            laserMode === 'area'
                              ? 'Laser Areale attivo: clicca il 1° punto nel vano, spostati verso il 2° punto per espandere la superficie e clicca per acquisire'
                              : laserMode === 'dual'
                              ? 'Laser 2 Raggi (Sx+Dx) attivo: clicca dentro la stanza, sposta il mouse su un lato per sommare le due pareti e clicca'
                              : 'Laser 1 Raggio attivo: clicca il punto di partenza, punta col mouse verso la parete e clicca per acquisire'
                          );
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                          activeTool === 'laser'
                            ? 'bg-red-600 text-white shadow-sm ring-1 ring-red-400/60'
                            : 'text-red-300 hover:text-white hover:bg-red-950/60'
                        }`}
                        title="Laser Virtuale (1 Raggio, 2 Raggi Sx+Dx, Areale m²)"
                      >
                        <Target className="w-3.5 h-3.5" />
                        <span>Laser</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTool('polygon');
                          setPolygonPts([]);
                          setLaserOrigin(null);
                          setOpenCadMenu(null);
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                          activeTool === 'polygon'
                            ? 'bg-indigo-500 text-white shadow-sm'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Traccia un poligono sui vertici del vano"
                      >
                        <Pentagon className="w-3.5 h-3.5" />
                        <span>Poligono</span>
                      </button>
                    </div>

                    <div className="h-4 w-px bg-slate-700/80 shrink-0" />

                    {/* MENU A TENDINA 1: DISEGNA & CALIBRA */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenCadMenu((m) => (m === 'draw' ? null : 'draw'))}
                        className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                          openCadMenu === 'draw' ||
                          ['calibrate', 'edit_ocr', 'pen', 'text_note', 'pan'].includes(activeTool)
                            ? 'bg-slate-700 text-white'
                            : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                        }`}
                        title="Strumenti di calibrazione, modifica testi, pennino e note"
                      >
                        <span>
                          {activeTool === 'calibrate'
                            ? 'Calibra'
                            : activeTool === 'edit_ocr'
                            ? 'Modifica OCR'
                            : activeTool === 'pen'
                            ? 'Pennino'
                            : activeTool === 'text_note'
                            ? 'Testo'
                            : activeTool === 'pan'
                            ? 'Pan'
                            : 'Disegna'}
                        </span>
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>

                      {openCadMenu === 'draw' && (
                        <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl p-1 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTool('calibrate');
                              setRulerStart(null);
                              setLaserOrigin(null);
                              setOpenCadMenu(null);
                            }}
                            className={`w-full px-2.5 py-1.5 rounded flex items-center justify-between text-left transition-colors ${
                              activeTool === 'calibrate'
                                ? 'bg-rose-500/20 text-rose-200 font-semibold'
                                : 'text-slate-200 hover:bg-slate-800'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <Crosshair className="w-3.5 h-3.5 text-rose-400" />
                              Calibra Scala (2 punti)
                            </span>
                            {activeTool === 'calibrate' && <Check className="w-3.5 h-3.5 text-rose-400" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveTool('edit_ocr');
                              setRulerStart(null);
                              setLaserOrigin(null);
                              setPolygonPts([]);
                              setOpenCadMenu(null);
                            }}
                            className={`w-full px-2.5 py-1.5 rounded flex items-center justify-between text-left transition-colors ${
                              activeTool === 'edit_ocr'
                                ? 'bg-violet-500/20 text-violet-200 font-semibold'
                                : 'text-slate-200 hover:bg-slate-800'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <Pencil className="w-3.5 h-3.5 text-violet-400" />
                              Modifica Quote / Testi OCR
                            </span>
                            {activeTool === 'edit_ocr' && <Check className="w-3.5 h-3.5 text-violet-400" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveTool('pen');
                              setPenEraserMode(false);
                              setRulerStart(null);
                              setLaserOrigin(null);
                              setPolygonPts([]);
                              setOpenCadMenu(null);
                            }}
                            className={`w-full px-2.5 py-1.5 rounded flex items-center justify-between text-left transition-colors ${
                              activeTool === 'pen'
                                ? 'bg-rose-500/20 text-rose-200 font-semibold'
                                : 'text-slate-200 hover:bg-slate-800'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <PenTool className="w-3.5 h-3.5 text-rose-400" />
                              Pennino Mano Libera
                            </span>
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-white/70"
                              style={{ backgroundColor: penColor }}
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveTool('text_note');
                              setRulerStart(null);
                              setLaserOrigin(null);
                              setPolygonPts([]);
                              setOpenCadMenu(null);
                            }}
                            className={`w-full px-2.5 py-1.5 rounded flex items-center justify-between text-left transition-colors ${
                              activeTool === 'text_note'
                                ? 'bg-sky-500/20 text-sky-200 font-semibold'
                                : 'text-slate-200 hover:bg-slate-800'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <Type className="w-3.5 h-3.5 text-sky-400" />
                              Testo &amp; Promemoria
                            </span>
                            {activeTool === 'text_note' && <Check className="w-3.5 h-3.5 text-sky-400" />}
                          </button>

                          <div className="my-1 border-t border-slate-800" />

                          <button
                            type="button"
                            onClick={() => {
                              setActiveTool('pan');
                              setOpenCadMenu(null);
                            }}
                            className={`w-full px-2.5 py-1.5 rounded flex items-center justify-between text-left transition-colors ${
                              activeTool === 'pan'
                                ? 'bg-slate-700 text-white font-semibold'
                                : 'text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <Hand className="w-3.5 h-3.5 text-slate-400" />
                              Sposta Tavola (Pan)
                            </span>
                            <span className="text-[10px] text-slate-500">Clic rotella</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* MENU A TENDINA 2: STRUMENTI & OCR */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenCadMenu((m) => (m === 'ocr_view' ? null : 'ocr_view'))}
                        className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                          openCadMenu === 'ocr_view'
                            ? 'bg-slate-700 text-white'
                            : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                        }`}
                        title="Scansione OCR, Pianta Pulita, Rilevamenti, OSNAP e Segni"
                      >
                        <ScanText className="w-3.5 h-3.5 text-amber-400" />
                        <span>Strumenti &amp; OCR</span>
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>

                      {openCadMenu === 'ocr_view' && (
                        <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl p-1.5 text-xs space-y-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (isScanningOcr) {
                                ocrAbortRef.current?.abort();
                                setIsScanningOcr(false);
                                setOcrProgress(null);
                              } else {
                                ocrScannedPagesRef.current.delete(currentPage);
                                void handleRunOcrForPage(pdfDoc, currentPage, quoteUnit, canvasRef.current);
                              }
                              setOpenCadMenu(null);
                            }}
                            className="w-full px-2.5 py-1.5 rounded flex items-center justify-between text-left bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 font-semibold transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              <ScanText className="w-3.5 h-3.5 text-amber-400" />
                              {isScanningOcr
                                ? `Annulla OCR (${ocrProgress ? `${ocrProgress.progress}%` : '...'})`
                                : 'Scansiona OCR (H + V)'}
                            </span>
                          </button>

                          <div className="my-1 border-t border-slate-800" />

                          {currentAnalysis?.tokens.some((t) => t.source === 'ocr' || t.source === 'manual') && (
                            <button
                              type="button"
                              onClick={() => setShowEditableOverlay((v) => !v)}
                              className="w-full px-2.5 py-1.5 rounded flex items-center justify-between text-slate-200 hover:bg-slate-800 transition-colors"
                            >
                              <span className="flex items-center gap-2">
                                <Pencil className="w-3.5 h-3.5 text-violet-400" />
                                Testi Editabili OCR
                              </span>
                              <span
                                className={`text-[10px] font-bold ${
                                  showEditableOverlay ? 'text-violet-300' : 'text-slate-500'
                                }`}
                              >
                                {showEditableOverlay ? 'ON' : 'OFF'}
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setShowOverlayTokens((v) => !v)}
                            className="w-full px-2.5 py-1.5 rounded flex items-center justify-between text-slate-200 hover:bg-slate-800 transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              {showOverlayTokens ? (
                                <Eye className="w-3.5 h-3.5 text-amber-400" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                              )}
                              Rilevamenti Quote/Vani
                            </span>
                            <span
                              className={`text-[10px] font-bold ${
                                showOverlayTokens ? 'text-amber-300' : 'text-slate-500'
                              }`}
                            >
                              {showOverlayTokens ? 'ON' : 'OFF'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setOsnapEnabled((v) => !v)}
                            className="w-full px-2.5 py-1.5 rounded flex items-center justify-between text-slate-200 hover:bg-slate-800 transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              <Magnet className="w-3.5 h-3.5 text-cyan-400" />
                              Snap Magnetico Vertici
                            </span>
                            <span
                              className={`text-[10px] font-bold ${
                                osnapEnabled ? 'text-cyan-300' : 'text-slate-500'
                              }`}
                            >
                              {osnapEnabled ? 'ON' : 'OFF'}
                            </span>
                          </button>

                          {((measuredPolygonsByPage[currentPage]?.length || 0) > 0 ||
                            (measuredLinesByPage[currentPage]?.length || 0) > 0) && (
                            <>
                              <div className="my-1 border-t border-slate-800" />
                              <button
                                type="button"
                                onClick={() => setShowMeasuredMarks((v) => !v)}
                                className="w-full px-2.5 py-1.5 rounded flex items-center justify-between text-slate-200 hover:bg-slate-800 transition-colors"
                              >
                                <span>
                                  Segni Misure (
                                  {(measuredPolygonsByPage[currentPage]?.length || 0) +
                                    (measuredLinesByPage[currentPage]?.length || 0)}
                                  )
                                </span>
                                <span
                                  className={`text-[10px] font-bold ${
                                    showMeasuredMarks ? 'text-indigo-300' : 'text-slate-500'
                                  }`}
                                >
                                  {showMeasuredMarks ? 'ON' : 'OFF'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMeasuredPolygonsByPage((prev) => ({ ...prev, [currentPage]: [] }));
                                  setMeasuredLinesByPage((prev) => ({ ...prev, [currentPage]: [] }));
                                  setOpenCadMenu(null);
                                }}
                                className="w-full px-2.5 py-1.5 rounded flex items-center gap-2 text-rose-300 hover:bg-rose-950/60 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Cancella segni pagina</span>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* MENU A TENDINA 3: LAYER, APPUNTI & PROMEMORIA (ANCORATO IN ALTO, NON FLUTTUANTE) */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenCadMenu((m) => (m === 'layers' ? null : 'layers'))}
                        className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                          openCadMenu === 'layers'
                            ? 'bg-sky-500/20 text-sky-200'
                            : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                        }`}
                        title="Gestione Layer CAD, Appunti e Promemoria"
                      >
                        <Layers className="w-3.5 h-3.5 text-sky-400" />
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: layerMap.get(activeLayerId)?.color || '#38bdf8' }}
                        />
                        <span>Layer</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          ({layers.filter((l) => l.visible).length}/{layers.length})
                        </span>
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>

                      {openCadMenu === 'layers' && (
                        <div className="absolute left-0 top-full mt-1 z-50 w-80 max-h-[70vh] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl text-slate-100 flex flex-col overflow-hidden">
                          <div className="px-3 py-1.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold">
                              <Layers className="w-3.5 h-3.5 text-sky-400" />
                              <span>Layer, Appunti &amp; Promemoria</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setOpenCadMenu(null)}
                              className="p-0.5 text-slate-400 hover:text-white rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="p-2 space-y-2 overflow-y-auto text-xs">
                            <div className="space-y-1">
                              {layers.map((layer) => {
                                const isActive = layer.id === activeLayerId;
                                const polyCount = (measuredPolygonsByPage[currentPage] || []).filter(
                                  (p) => (p.layerId || DEFAULT_LAYER_IDS.MEASURES) === layer.id
                                ).length;
                                const lineCount = (measuredLinesByPage[currentPage] || []).filter(
                                  (l) => (l.layerId || DEFAULT_LAYER_IDS.MEASURES) === layer.id
                                ).length;
                                const noteCount = (textNotesByPage[currentPage] || []).filter(
                                  (n) => (n.layerId || DEFAULT_LAYER_IDS.NOTES) === layer.id
                                ).length;
                                const penCount = (penStrokesByPage[currentPage] || []).filter(
                                  (s) => (s.layerId || DEFAULT_LAYER_IDS.NOTES) === layer.id
                                ).length;
                                const itemCount = polyCount + lineCount + noteCount + penCount;

                                return (
                                  <div
                                    key={layer.id}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${
                                      isActive
                                        ? 'bg-sky-500/15 border-sky-400/60'
                                        : 'bg-slate-800/60 border-slate-700/70 hover:bg-slate-800'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setActiveLayerId(layer.id)}
                                      className="flex-1 min-w-0 flex items-center gap-2 text-left"
                                      title="Clicca per rendere questo layer attivo"
                                    >
                                      <span
                                        className={`w-2.5 h-2.5 rounded-full shrink-0 border ${
                                          isActive ? 'border-white ring-2 ring-sky-400' : 'border-slate-500'
                                        }`}
                                        style={{ backgroundColor: layer.color }}
                                      />
                                      <span
                                        className={`truncate font-semibold ${
                                          layer.visible ? 'text-white' : 'text-slate-500 line-through'
                                        }`}
                                      >
                                        {layer.name}
                                      </span>
                                      {itemCount > 0 && (
                                        <span className="ml-auto px-1 rounded bg-slate-950/70 text-[10px] font-mono text-slate-300">
                                          {itemCount}
                                        </span>
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setLayers((prev) =>
                                          prev.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l))
                                        )
                                      }
                                      className={`p-1 rounded ${
                                        layer.visible
                                          ? 'text-sky-300 hover:bg-slate-700'
                                          : 'text-slate-500 hover:bg-slate-700'
                                      }`}
                                      title={layer.visible ? 'Nascondi layer' : 'Mostra layer'}
                                    >
                                      {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setLayers((prev) =>
                                          prev.map((l) => (l.id === layer.id ? { ...l, locked: !l.locked } : l))
                                        )
                                      }
                                      className={`p-1 rounded ${
                                        layer.locked
                                          ? 'text-amber-400 hover:bg-slate-700'
                                          : 'text-slate-400 hover:bg-slate-700'
                                      }`}
                                      title={layer.locked ? 'Sblocca layer' : 'Blocca layer da modifiche'}
                                    >
                                      {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                    </button>

                                    {layers.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextLayers = layers.filter((l) => l.id !== layer.id);
                                          setLayers(nextLayers);
                                          if (activeLayerId === layer.id && nextLayers[0]) {
                                            setActiveLayerId(nextLayers[0].id);
                                          }
                                        }}
                                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-700"
                                        title="Elimina layer"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* CREA NUOVO LAYER */}
                            <div className="pt-1.5 border-t border-slate-800 flex items-center gap-1.5">
                              <input
                                type="color"
                                value={newLayerColor}
                                onChange={(e) => setNewLayerColor(e.target.value)}
                                className="w-6 h-6 rounded bg-transparent border border-slate-700 cursor-pointer shrink-0"
                                title="Colore del nuovo layer"
                              />
                              <input
                                type="text"
                                value={newLayerName}
                                onChange={(e) => setNewLayerName(e.target.value)}
                                placeholder="Nuovo layer (es. Impianti)..."
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && newLayerName.trim()) {
                                    const created: PlanLayer = {
                                      id: `layer_${uid()}`,
                                      name: newLayerName.trim(),
                                      color: newLayerColor,
                                      visible: true,
                                      locked: false,
                                    };
                                    setLayers((prev) => [...prev, created]);
                                    setActiveLayerId(created.id);
                                    setNewLayerName('');
                                  }
                                }}
                                className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                              />
                              <button
                                type="button"
                                disabled={!newLayerName.trim()}
                                onClick={() => {
                                  if (!newLayerName.trim()) return;
                                  const created: PlanLayer = {
                                    id: `layer_${uid()}`,
                                    name: newLayerName.trim(),
                                    color: newLayerColor,
                                    visible: true,
                                    locked: false,
                                  };
                                  setLayers((prev) => [...prev, created]);
                                  setActiveLayerId(created.id);
                                  setNewLayerName('');
                                }}
                                className="px-2 py-1 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-bold text-[11px]"
                              >
                                + Layer
                              </button>
                            </div>

                            {/* ELENCO RAPIDO APPUNTI & PROMEMORIA PAGINA CORRENTE */}
                            <div className="pt-2 border-t border-slate-800 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  Appunti &amp; Promemoria (Pag. {currentPage})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveTool('text_note');
                                    if (layers.some((l) => l.id === DEFAULT_LAYER_IDS.NOTES)) {
                                      setActiveLayerId(DEFAULT_LAYER_IDS.NOTES);
                                    }
                                    setOpenCadMenu(null);
                                    setLastFeedback('Clicca sulla tavola per inserire un nuovo Appunto / Promemoria');
                                  }}
                                  className="text-[10px] font-bold text-sky-400 hover:text-sky-300"
                                >
                                  + Scrivi
                                </button>
                              </div>

                              {(textNotesByPage[currentPage] || []).length === 0 ? (
                                <p className="text-[11px] text-slate-500 italic py-0.5">
                                  Nessun appunto su questa pagina.
                                </p>
                              ) : (
                                <div className="space-y-1 max-h-36 overflow-y-auto">
                                  {(textNotesByPage[currentPage] || []).map((note) => {
                                    const lyr = layerMap.get(note.layerId || DEFAULT_LAYER_IDS.NOTES);
                                    return (
                                      <div
                                        key={note.id}
                                        onClick={() => {
                                          setEditingTextNote({
                                            id: note.id,
                                            x: note.x,
                                            y: note.y,
                                            text: note.text,
                                            color: note.color,
                                            fontSize: note.fontSize,
                                            vertical: !!note.vertical,
                                            bgOpaque: note.bgOpaque !== false,
                                            isReminder: !!note.isReminder,
                                            layerId: note.layerId || DEFAULT_LAYER_IDS.NOTES,
                                          });
                                          setOpenCadMenu(null);
                                        }}
                                        className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 cursor-pointer"
                                      >
                                        {note.isReminder ? (
                                          <Bookmark className="w-3 h-3 text-amber-400 shrink-0" />
                                        ) : (
                                          <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: note.color }}
                                          />
                                        )}
                                        <span className="truncate flex-1 text-[11px] text-slate-200">{note.text}</span>
                                        {lyr && (
                                          <span className="text-[9px] px-1 rounded bg-slate-950/70 text-slate-400 truncate max-w-[70px]">
                                            {lyr.name}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* MENU A TENDINA 4: UNITÀ & SCALA */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenCadMenu((m) => (m === 'units' ? null : 'units'))}
                        className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                          openCadMenu === 'units'
                            ? 'bg-slate-700 text-white'
                            : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                        }`}
                        title="Unità quote tavola, unità computo e auto-calibrazione"
                      >
                        <span className="font-mono text-emerald-300">
                          {quoteUnit}→{exportUnit}
                        </span>
                        <span className="text-slate-400 font-mono text-[10px]">1:{scaleDenominator}</span>
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>

                      {openCadMenu === 'units' && (
                        <div className="absolute left-0 top-full mt-1 z-50 w-60 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl p-2 text-xs space-y-2.5">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                              Unità Quote su Tavola PDF
                            </div>
                            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-0.5 rounded border border-slate-800">
                              {(['m', 'cm', 'mm'] as QuoteUnit[]).map((u) => (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={() => setQuoteUnit(u)}
                                  className={`py-1 rounded font-mono font-semibold transition-colors ${
                                    quoteUnit === u ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {u}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-1">
                              Unità Riportata in Computo
                            </div>
                            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-0.5 rounded border border-emerald-500/30">
                              {(['m', 'cm', 'mm'] as QuoteUnit[]).map((u) => (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={() => handleChangeExportUnit(u)}
                                  className={`py-1 rounded font-mono font-semibold transition-colors ${
                                    exportUnit === u ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {u}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono text-slate-300">
                              Scala 1:{scaleDenominator}
                              {customMetersPerPt !== null ? ' ✓' : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                executeAutoCalibration(true);
                                setOpenCadMenu(null);
                              }}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-semibold text-slate-100 flex items-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3 text-amber-400" />
                              Auto-calibra
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* DESTRA: STATO OCR LIVE + ZOOM (IN 2D) OPPURE UNITÀ RIPORTATA (IN 3D/BIM) */}
              <div className="flex items-center gap-1.5 shrink-0">
                {isScanningOcr && (
                  <button
                    type="button"
                    onClick={() => {
                      ocrAbortRef.current?.abort();
                      setIsScanningOcr(false);
                      setOcrProgress(null);
                    }}
                    className="px-2 py-1 rounded text-[11px] font-bold bg-amber-500 text-slate-950 flex items-center gap-1 whitespace-nowrap"
                    title="Clicca per annullare la scansione OCR"
                  >
                    <ScanText className="w-3 h-3" />
                    <span>OCR {ocrProgress ? `${ocrProgress.progress}%` : '...'}</span>
                  </button>
                )}

                {viewMode === '2d' ? (
                  <div className="flex items-center bg-slate-950 rounded-md border border-slate-700 p-0.5">
                    <button
                      type="button"
                      onClick={() => zoomAroundViewportPoint(zoomRef.current * 0.82)}
                      className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800"
                      title="Zoom Indietro"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-1.5 text-[11px] font-mono tabular-nums text-slate-200 min-w-[42px] text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => zoomAroundViewportPoint(zoomRef.current * 1.22)}
                      className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800"
                      title="Zoom Avanti"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleFitToViewport}
                      className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800 border-l border-slate-700 ml-0.5 pl-1.5"
                      title="Adatta e centra tavola"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div
                      className="flex items-center bg-slate-950 rounded-md border border-emerald-500/35 p-0.5 text-[11px]"
                      title="Unità riportata nelle caselle del computo"
                    >
                      <span className="px-1.5 text-[10px] font-semibold text-emerald-300">Riporta:</span>
                      {(['m', 'cm', 'mm'] as QuoteUnit[]).map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => handleChangeExportUnit(u)}
                          className={`px-1.5 py-0.5 rounded font-mono font-semibold transition-colors ${
                            exportUnit === u ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                    <span className="hidden xl:inline text-[11px] font-mono tabular-nums text-slate-400 px-1">
                      1:{scaleDenominator}
                      {customMetersPerPt !== null ? ' · Calibrata' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SUB-BAR CONTESTUALE LASER VIRTUALE (3 MODALITÀ: 1 RAGGIO, 2 RAGGI SX+DX, AREALE m²) */}
          {pdfDoc && viewMode === '2d' && activeTool === 'laser' && (
            <div className="bg-slate-900/95 border-b border-red-900/60 px-3 py-1.5 flex items-center justify-between gap-3 flex-wrap shrink-0 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-red-400 flex items-center gap-1 whitespace-nowrap shrink-0">
                  <Target className="w-3.5 h-3.5" />
                  Laser
                </span>

                {/* 3 Modalità Laser */}
                <div className="flex items-center bg-slate-950 rounded-md p-0.5 border border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setLaserMode('single');
                      setLaserOrigin(null);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      laserMode === 'single'
                        ? 'bg-red-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    title="Laser 1: clicca l'origine e punta col mouse verso la parete"
                  >
                    1 Raggio
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLaserMode('dual');
                      setLaserOrigin(null);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      laserMode === 'dual'
                        ? 'bg-red-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    title="Laser 2: clicca dentro la stanza, sposta il mouse su un lato → spara a destra e sinistra e somma le due distanze"
                  >
                    2 Raggi (Sx+Dx)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLaserMode('area');
                      setLaserOrigin(null);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      laserMode === 'area'
                        ? 'bg-red-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    title="Laser 3 Areale: clicca un punto e spostati verso il secondo → espande il laser su tutte le pareti e calcola i m²"
                  >
                    Areale (m²)
                  </button>
                </div>

                {laserMode !== 'area' && (
                  <button
                    type="button"
                    onClick={() => setLaserOrtho((v) => !v)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                      laserOrtho
                        ? 'bg-red-500/20 border-red-400/60 text-red-200'
                        : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                    title="Blocca il raggio a 0°/90° (tieni Shift per angolo libero 360°)"
                  >
                    Orto 0°/90°
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setLaserIgnoreText((v) => !v)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                    laserIgnoreText
                      ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                      : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                  title="Attraversa nomi vano e quote senza fermarsi sulle scritte, rilevando solo le pareti"
                >
                  Salta testi
                </button>

                {/* Sensibilità rilevamento parete */}
                <div
                  className="flex items-center bg-slate-950 rounded-md p-0.5 border border-slate-700"
                  title="Sensibilità di arresto del laser sullo spessore/contrasto delle linee di parete"
                >
                  <span className="px-1.5 text-[10px] font-semibold text-slate-400 whitespace-nowrap">Pareti:</span>
                  {(
                    [
                      { id: 'thin', label: 'Sottili' },
                      { id: 'medium', label: 'Media' },
                      { id: 'thick', label: 'Spessi' },
                    ] as Array<{ id: LaserSensitivity; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setLaserSensitivity(opt.id)}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        laserSensitivity === opt.id
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setLaserSoundEnabled((v) => !v)}
                  className={`p-1 rounded-md border transition-colors ${
                    laserSoundEnabled
                      ? 'bg-slate-800 border-slate-600 text-slate-200 hover:text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                  title={laserSoundEnabled ? 'Disattiva beep distanziometro' : 'Attiva beep distanziometro'}
                >
                  {laserSoundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="text-[11px] text-slate-400 whitespace-nowrap">
                {laserMode === 'area'
                  ? laserOrigin
                    ? 'Muoviti verso il 2° punto per espandere la superficie · Clic acquisisce in cella · Esc/Dx annulla'
                    : 'Clicca il 1° punto dentro il vano → muoviti verso il 2° punto per calcolare i m²'
                  : laserMode === 'dual'
                  ? laserOrigin
                    ? 'Sposta su un lato per sommare Sx+Dx (Shift = obliquo) · Clic acquisisce in cella · Esc/Dx annulla'
                    : 'Clicca un punto nella stanza → sposta il mouse su un lato per sommare i due raggi'
                  : laserOrigin
                  ? 'Muovi per mirare la parete (Shift = obliquo) · Clic acquisisce in cella · Esc/Dx annulla'
                  : 'Clicca punto di partenza → punta col mouse verso la parete → clicca'}
              </div>
            </div>
          )}

          {/* SUB-BAR CONTESTUALE PENNINO COLORATO / TESTO SU PIANTINA */}
          {pdfDoc && viewMode === '2d' && (activeTool === 'pen' || activeTool === 'text_note') && (
            <div className="bg-slate-900/95 border-b border-slate-700/80 px-3 py-1.5 flex items-center justify-between gap-3 flex-wrap shrink-0 text-xs">
              {activeTool === 'pen' ? (
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[11px] font-bold text-rose-300 flex items-center gap-1">
                    <PenTool className="w-3 h-3" />
                    Colore pennino:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {ANNOTATION_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => {
                          setPenColor(c.hex);
                          setPenEraserMode(false);
                        }}
                        style={{ backgroundColor: c.hex }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform ${
                          !penEraserMode && penColor === c.hex
                            ? 'border-white scale-110 ring-2 ring-rose-400'
                            : 'border-slate-600 hover:scale-105'
                        }`}
                        title={c.name}
                      />
                    ))}
                  </div>
                  <div className="h-4 w-px bg-slate-700" />
                  <div className="flex items-center gap-1 bg-slate-800 rounded-md p-0.5 border border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        setPenIsHighlighter(false);
                        setPenWidth(2.2);
                        setPenEraserMode(false);
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        !penEraserMode && !penIsHighlighter && penWidth <= 2.5
                          ? 'bg-slate-600 text-white'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Fine
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPenIsHighlighter(false);
                        setPenWidth(4.5);
                        setPenEraserMode(false);
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        !penEraserMode && !penIsHighlighter && penWidth > 2.5
                          ? 'bg-slate-600 text-white'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Medio
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPenIsHighlighter(true);
                        setPenEraserMode(false);
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        !penEraserMode && penIsHighlighter
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                      title="Tratto semi-trasparente stile evidenziatore"
                    >
                      Evidenz.
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPenEraserMode((v) => !v)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border flex items-center gap-1 ${
                      penEraserMode
                        ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                    title="Clicca o passa sopra un tratto per cancellarlo"
                  >
                    <Eraser className="w-3 h-3" />
                    <span>Gomma</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[11px] font-bold text-sky-300 flex items-center gap-1">
                    <Type className="w-3 h-3" />
                    Stile testo:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {ANNOTATION_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setTextNoteColor(c.hex)}
                        style={{ backgroundColor: c.hex }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform ${
                          textNoteColor === c.hex
                            ? 'border-white scale-110 ring-2 ring-sky-400'
                            : 'border-slate-600 hover:scale-105'
                        }`}
                        title={c.name}
                      />
                    ))}
                  </div>
                  <div className="h-4 w-px bg-slate-700" />
                  <div className="flex items-center gap-1 bg-slate-800 rounded-md p-0.5 border border-slate-700">
                    {[
                      { sz: 10, label: 'S' },
                      { sz: 13, label: 'M' },
                      { sz: 17, label: 'L' },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setTextNoteSize(opt.sz)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          textNoteSize === opt.sz ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Clicca un punto sulla piantina per scrivere · Trascina per spostare
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                {activeTool === 'pen' && (penStrokesByPage[currentPage]?.length || 0) > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setPenStrokesByPage((prev) => ({
                          ...prev,
                          [currentPage]: (prev[currentPage] || []).slice(0, -1),
                        }))
                      }
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] flex items-center gap-1"
                    >
                      <Undo2 className="w-3 h-3" />
                      <span>Annulla tratto</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPenStrokesByPage((prev) => ({ ...prev, [currentPage]: [] }))}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-950/60 border border-slate-700 text-rose-300 text-[11px]"
                    >
                      Pulisci schizzi ({penStrokesByPage[currentPage]?.length || 0})
                    </button>
                  </>
                )}
                {activeTool === 'text_note' && (textNotesByPage[currentPage]?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setTextNotesByPage((prev) => ({ ...prev, [currentPage]: [] }))}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-950/60 border border-slate-700 text-rose-300 text-[11px]"
                  >
                    Cancella testi ({textNotesByPage[currentPage]?.length || 0})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* BARRA CONTESTUALE ATTIVA (solo quando serve in 2D o scansione OCR attiva) */}
          {pdfDoc &&
            (isScanningOcr ||
              (viewMode === '2d' &&
                (calibrationDraft || polygonPts.length > 0 || pendingLengthPick || activeCell || lastFeedback))) && (
            <div className="bg-slate-950/90 border-b border-slate-800 px-3 py-1.5 flex items-center justify-between gap-3 text-xs shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 text-slate-200 flex-wrap flex-1">
                {isScanningOcr && ocrProgress ? (
                  <div className="flex items-center gap-2.5 w-full max-w-lg">
                    <span className="text-amber-300 font-semibold whitespace-nowrap">{ocrProgress.label}</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden min-w-[100px]">
                      <div
                        className="h-full bg-amber-400 transition-all duration-200"
                        style={{ width: `${Math.min(100, Math.max(5, ocrProgress.progress))}%` }}
                      />
                    </div>
                  </div>
                ) : calibrationDraft ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-rose-300">Calibra misura reale (m):</span>
                    <input
                      type="text"
                      value={calibrationDraft.realMetersStr}
                      onChange={(e) => setCalibrationDraft({ ...calibrationDraft, realMetersStr: e.target.value })}
                      className="w-20 bg-slate-800 border border-rose-400/60 rounded px-2 py-0.5 font-mono text-white text-xs focus:outline-none"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyCalibration()}
                    />
                    <button
                      type="button"
                      onClick={handleApplyCalibration}
                      className="px-2.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs"
                    >
                      Applica Scala
                    </button>
                    <button type="button" onClick={() => setCalibrationDraft(null)} className="text-slate-400 hover:text-white">
                      Annulla
                    </button>
                  </div>
                ) : polygonPts.length > 0 ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-indigo-300">Poligono attivo ({polygonPts.length} vertici)</span>
                    {polygonPts.length >= 2 && (
                      <span className="font-mono tabular-nums text-slate-300">Area: {livePolyAreaM2.toFixed(2)} m²</span>
                    )}
                    {polygonPts.length >= 3 && (
                      <button
                        type="button"
                        onClick={() => finalizePolygon(polygonPts)}
                        className="px-2.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs"
                      >
                        Chiudi Poligono
                      </button>
                    )}
                    <button type="button" onClick={() => setPolygonPts([])} className="text-slate-400 hover:text-white">
                      Annulla
                    </button>
                  </div>
                ) : pendingLengthPick ? (
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-cyan-300 font-semibold">
                      Lung.: <span className="font-mono">{pendingLengthPick.val.toFixed(2)} m</span> — Clicca seconda quota o:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const rows = buildMeasurementsFromRoom(pendingLengthPick.label, {
                          lengthM: pendingLengthPick.val,
                          mode: extractionMode,
                          defaultHeightM,
                          sourceNote: 'Quota singola',
                        });
                        setPendingLengthPick(null);
                        appendDrafts(rows, undefined, `Aggiunta quota ${pendingLengthPick.val.toFixed(2)} m`);
                      }}
                      className="px-2 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
                    >
                      + Aggiungi {pendingLengthPick.val.toFixed(2)} m
                    </button>
                    <button type="button" onClick={() => setPendingLengthPick(null)} className="text-slate-400 hover:text-white">
                      Annulla
                    </button>
                  </div>
                ) : (
                  <>
                    {activeCell && (
                      <span className="inline-flex items-center gap-1.5 text-amber-300 font-semibold">
                        <span>
                          Casella evidenziata:{' '}
                          <span className="font-mono text-white underline decoration-amber-400">
                            {FIELD_LABEL_IT[activeCell.field]}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveCell(null)}
                          className="text-slate-400 hover:text-white ml-1"
                          title="Deseleziona casella (crea nuovi righi automaticamente)"
                        >
                          ×
                        </button>
                      </span>
                    )}
                    {lastFeedback && <span className="text-emerald-300 truncate">{lastFeedback}</span>}
                  </>
                )}
              </div>

              {currentAnalysis && (
                <div className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0 hidden md:block">
                  Scala 1:{scaleDenominator}
                  {customMetersPerPt !== null ? ' (Calibrata)' : ''} · H={defaultHeightM.toFixed(2)}m
                </div>
              )}
            </div>
          )}

          {/* BANNER AUTO-CALIBRAZIONE: in 3D/BIM mostra solo avviso se calibrazione manuale richiesta, lasciando il disegno al centro */}
          {pdfDoc &&
            autoCalibState.status !== 'idle' &&
            (viewMode === '2d' || autoCalibState.status === 'needs_manual') && (
            <div
              className={`px-3 py-1.5 border-b flex items-center justify-between gap-3 flex-wrap text-xs shrink-0 ${
                autoCalibState.status === 'needs_manual'
                  ? 'bg-amber-950/90 border-amber-500/60 text-amber-100'
                  : autoCalibState.status === 'auto_calibrated'
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-100'
                  : autoCalibState.status === 'pending_ocr'
                  ? 'bg-sky-950/75 border-sky-500/40 text-sky-100'
                  : 'bg-slate-900 border-slate-700/80 text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {autoCalibState.status === 'needs_manual' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                ) : autoCalibState.status === 'auto_calibrated' || autoCalibState.status === 'manual_calibrated' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-sky-400 shrink-0 animate-spin" />
                )}
                <span className="font-semibold truncate">{autoCalibState.message}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {autoCalibState.status === 'needs_manual' && (
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('2d');
                      setActiveTool('calibrate');
                      setRulerStart(null);
                      setLaserOrigin(null);
                      setLastFeedback(
                        'Calibrazione manuale attiva: clicca 2 punti di una misura nota sulla piantina'
                      );
                    }}
                    className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 whitespace-nowrap"
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>Calibra ora</span>
                  </button>
                )}
                {autoCalibState.status !== 'pending_ocr' && (
                  <button
                    type="button"
                    onClick={() => executeAutoCalibration(true)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold text-[11px] flex items-center gap-1 whitespace-nowrap"
                    title="Riesegui auto-calibrazione sulla base delle quote orizzontali e verticali censite"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Auto-calibra</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* VIEWPORT PDF 2D (PAN + ZOOM CAD SENZA BARRE DI SCORRIMENTO) / MODELLO 3D / MODELLO BIM */}
          <div className="flex-1 relative flex min-h-0 overflow-hidden">
            {pdfDoc && (viewMode === '3d' || viewMode === 'bim') && (
              <Plan3DViewer
                mode={viewMode}
                bimModel={bimModelState}
                onUpdateBimObject={handleUpdateBimObject}
                onDeleteBimObject={handleDeleteBimObject}
                onDeleteMultipleBimObjects={handleDeleteMultipleBimObjects}
                onAddBimObject={handleAddBimObject}
                onCleanBimModel={handleCleanBimModel}
                onUndoBim={handleUndoBim}
                onRedoBim={handleRedoBim}
                canUndoBim={bimHistoryCounts.undo > 0}
                canRedoBim={bimHistoryCounts.redo > 0}
                wallHeightM={defaultHeightM}
                onWallHeightChange={(newH) => setDefaultHeightM(newH)}
                cleanFloorCanvas={canvasRef.current}
                significantQuotes={significantQuotes}
                showQuotesLayer={showQuotesIn3D}
                onToggleQuotesLayer={() => setShowQuotesIn3D((v) => !v)}
                lumaVersion={lumaVersion}
                sensitivity={wall3DSensitivity}
                onSensitivityChange={setWall3DSensitivity}
                onComputeBimObject={handleComputeBimObject}
                onComputeMultipleBimObjects={handleComputeMultipleBimObjects}
                activeCellLabel={activeCell ? FIELD_LABEL_IT[activeCell.field] : null}
                isAnalyzingAi={isAnalyzingAiBim}
                aiError={aiBimError}
                onDismissAiError={() => setAiBimError(null)}
                onRequestAiRebuild={() => void runAiBimReconstruction(true)}
                onUseLocalModel={() => setAiBimOverride(null)}
                hasAiModel={activeAiBimModel !== null}
              />
            )}

            {/* Zero barre di scorrimento: navigazione CAD pura con solo Pan (rotella premuta / Spazio / Mano) e Zoom sul cursore */}
            <div
              ref={scrollContainerRef}
              onMouseDown={(e) => {
                if (
                  e.button === 1 ||
                  (e.button === 0 && (isSpacePressed || activeTool === 'pan'))
                ) {
                  e.preventDefault();
                  setIsPanning(true);
                  panOriginRef.current = {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    panX: panOffsetRef.current.x,
                    panY: panOffsetRef.current.y,
                  };
                }
              }}
              onAuxClick={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) {
                  e.preventDefault();
                  setIsDragOverDropzone(true);
                }
              }}
              onDragLeave={() => setIsDragOverDropzone(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOverDropzone(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleLoadPdfFile(file);
              }}
              className={`${
                viewMode !== '2d' && pdfDoc
                  ? 'hidden'
                  : 'flex-1 overflow-hidden relative select-none'
              } ${
                isPanning || isSpacePressed || activeTool === 'pan'
                  ? isPanning
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
                  : activeTool === 'highlight' ||
                    activeTool === 'ruler' ||
                    activeTool === 'laser' ||
                    activeTool === 'polygon' ||
                    activeTool === 'calibrate' ||
                    activeTool === 'pen'
                  ? 'cursor-crosshair'
                  : activeTool === 'text_note'
                  ? 'cursor-text'
                  : 'cursor-default'
              }`}
            >
            {isLoadingPdf ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-200 p-6">
                <div className="w-12 h-12 border-4 border-slate-700 border-t-amber-400 rounded-full animate-spin" />
                <p className="text-sm font-semibold">Decodifica tavola PDF, quote e vettori CAD in corso...</p>
              </div>
            ) : !pdfDoc ? (
              <div className="w-full h-full flex items-center justify-center p-6">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`max-w-xl w-full border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  isDragOverDropzone
                    ? 'border-amber-400 bg-amber-500/10 scale-[1.01]'
                    : 'border-slate-700 bg-slate-800/40 hover:border-amber-400/70 hover:bg-slate-800/70'
                }`}
              >
                <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center text-amber-400 mb-4">
                  <FileText className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">Apri o Trascina qui la Tavola PDF</h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-5">
                  Scorri le planimetrie, evidenzia un vano o le quote, oppure evidenzia una casella nella tabella computo a destra e prendi la misura direttamente col <span className="text-emerald-300 font-semibold">Righello</span> o col <span className="text-red-400 font-semibold">Laser Virtuale</span> — senza AutoCAD.
                </p>
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors">
                  <Upload className="w-4 h-4" />
                  Seleziona PDF Planimetria
                </span>
                {pdfError && <p className="mt-4 text-xs text-rose-400 font-medium">{pdfError}</p>}
              </div>
              </div>
            ) : (
              <div
                ref={sheetWrapperRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onContextMenu={(e) => {
                  if (activeTool === 'laser' && laserOrigin) {
                    e.preventDefault();
                    setLaserOrigin(null);
                  }
                }}
                onMouseLeave={() => {
                  if (activePenStroke) handleCanvasMouseUp();
                }}
                onDoubleClick={(e) => {
                  if (activeTool === 'polygon' && polygonPts.length >= 3) {
                    finalizePolygon(polygonPts);
                    return;
                  }
                  if (currentAnalysis && showEditableOverlay) {
                    const { pt } = getPdfCoords(e.clientX, e.clientY, false);
                    const hit = currentAnalysis.tokens.find(
                      (t) =>
                        (t.source === 'ocr' || t.source === 'manual') &&
                        pt.x >= t.bbox.x1 - 4 &&
                        pt.x <= t.bbox.x2 + 4 &&
                        pt.y >= t.bbox.y1 - 4 &&
                        pt.y <= t.bbox.y2 + 4
                    );
                    if (hit) {
                      setEditingTokenId(hit.id);
                      setEditingTokenText(hit.str);
                    }
                  }
                }}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: currentAnalysis ? currentAnalysis.width * zoom : undefined,
                  height: currentAnalysis ? currentAnalysis.height * zoom : undefined,
                  transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0)`,
                  transformOrigin: '0 0',
                  willChange: 'transform',
                }}
                className="bg-white shadow-[0_20px_60px_rgba(0,0,0,0.65)] ring-1 ring-white/10"
              >
                <canvas ref={canvasRef} className="block w-full h-full" />

                {isRenderingPage && (
                  <div className="absolute top-2 right-2 bg-slate-900/80 text-white text-[10px] px-2 py-1 rounded font-medium pointer-events-none">
                    Rendering...
                  </div>
                )}

                {renderError && (
                  <div className="absolute inset-x-4 top-4 bg-rose-950/95 border border-rose-500/60 text-rose-100 text-xs px-3 py-2 rounded-lg shadow-lg pointer-events-none">
                    {renderError}
                  </div>
                )}

                {currentAnalysis && (
                  <svg
                    viewBox={`0 0 ${currentAnalysis.width} ${currentAnalysis.height}`}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  >
                    {showOverlayTokens &&
                      currentAnalysis.tokens.map((tok) => {
                        if (tok.kind === 'other' || tok.kind === 'scale') return null;
                        const isFlashed = flashTokenIds.has(tok.id);
                        const accentColor = isFlashed
                          ? '#f59e0b'
                          : tok.kind === 'surface'
                          ? '#059669'
                          : tok.kind === 'perimeter'
                          ? '#d97706'
                          : tok.kind === 'dimension'
                          ? '#0284c7'
                          : tok.kind === 'room'
                          ? '#4f46e5'
                          : '#64748b';
                        const isVert = tok.orientation === 'vertical';

                        return (
                          <g key={tok.id}>
                            {/* Area click/hover completamente trasparente — zero rettangolo ingombrante */}
                            <rect
                              x={tok.bbox.x1}
                              y={tok.bbox.y1}
                              width={Math.max(6, tok.bbox.x2 - tok.bbox.x1)}
                              height={Math.max(6, tok.bbox.y2 - tok.bbox.y1)}
                              fill={isFlashed ? 'rgba(245, 158, 11, 0.25)' : 'transparent'}
                              stroke="none"
                              className={
                                activeTool === 'pick' || activeTool === 'highlight'
                                  ? 'pointer-events-auto cursor-pointer hover:fill-cyan-500/15'
                                  : ''
                              }
                              onClick={(ev) => {
                                if (activeTool === 'pick') {
                                  ev.stopPropagation();
                                  handlePickToken(tok);
                                }
                              }}
                            >
                              <title>
                                {tok.str}
                                {tok.numericValue !== undefined ? ` (${tok.numericValue}) · Clicca per caricare` : ''}
                              </title>
                            </rect>
                            {/* Sottile sottolineatura colorata solo per token vettoriali (quelli OCR usano caratteri colorati diretti) */}
                            {tok.source !== 'ocr' && tok.source !== 'manual' && (
                              isVert ? (
                                <line
                                  x1={tok.bbox.x2 + 0.8}
                                  y1={tok.bbox.y1}
                                  x2={tok.bbox.x2 + 0.8}
                                  y2={tok.bbox.y2}
                                  stroke={accentColor}
                                  strokeWidth={isFlashed ? 1.8 / zoom : 0.9 / zoom}
                                  strokeOpacity={isFlashed ? 1 : 0.72}
                                />
                              ) : (
                                <line
                                  x1={tok.bbox.x1}
                                  y1={tok.bbox.y2 + 0.8}
                                  x2={tok.bbox.x2}
                                  y2={tok.bbox.y2 + 0.8}
                                  stroke={accentColor}
                                  strokeWidth={isFlashed ? 1.8 / zoom : 0.9 / zoom}
                                  strokeOpacity={isFlashed ? 1 : 0.72}
                                />
                              )
                            )}
                          </g>
                        );
                      })}

                    {hoveredRoomId &&
                      currentAnalysis.rooms
                        .filter((r) => r.id === hoveredRoomId)
                        .map((r) => (
                          <rect
                            key={r.id}
                            x={r.bbox.x1}
                            y={r.bbox.y1}
                            width={r.bbox.x2 - r.bbox.x1}
                            height={r.bbox.y2 - r.bbox.y1}
                            rx={3}
                            fill="rgba(245, 158, 11, 0.22)"
                            stroke="#d97706"
                            strokeWidth={1.8}
                            strokeDasharray="4 2"
                          />
                        ))}

                    {highlightDrag && (
                      <rect
                        x={Math.min(highlightDrag.x1, highlightDrag.x2)}
                        y={Math.min(highlightDrag.y1, highlightDrag.y2)}
                        width={Math.abs(highlightDrag.x2 - highlightDrag.x1)}
                        height={Math.abs(highlightDrag.y2 - highlightDrag.y1)}
                        fill="rgba(250, 204, 21, 0.28)"
                        stroke="#d97706"
                        strokeWidth={1.6 / zoom}
                        strokeDasharray={`${4 / zoom} ${2 / zoom}`}
                      />
                    )}

                    {/* SUPERFICI POLIGONI PERSISTENTI & LINEE RIGHELLO SALVATE (CLICCABILI PER RIUTILIZZARE LA MISURA) */}
                    {showMeasuredMarks &&
                      (measuredPolygonsByPage[currentPage] || [])
                        .filter((poly) => isLayerVisible(poly.layerId))
                        .map((poly) => {
                          const isFlashed = flashMarkIds.has(poly.id);
                          const canClickShape = activeTool === 'pick' || activeTool === 'highlight';
                          return (
                            <g key={poly.id}>
                              <polygon
                                points={poly.points.map((p) => `${p.x},${p.y}`).join(' ')}
                                fill={poly.color}
                                fillOpacity={isFlashed ? 0.42 : 0.18}
                                stroke={isFlashed ? '#f59e0b' : poly.color}
                                strokeWidth={(isFlashed ? 2.8 : 1.7) / zoom}
                                className={canClickShape ? 'pointer-events-auto cursor-pointer hover:fill-opacity-30' : ''}
                                onMouseDown={(e) => {
                                  if (activeTool === 'pick') e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  if (canClickShape) {
                                    e.stopPropagation();
                                    handleReusePolygon(poly, 'area');
                                  }
                                }}
                              >
                                <title>{`${poly.label}: ${poly.areaM2.toFixed(2)} m² (clicca per inserire nel computo)`}</title>
                              </polygon>
                              {poly.points.map((p, idx) => (
                                <circle
                                  key={idx}
                                  cx={p.x}
                                  cy={p.y}
                                  r={2.5 / zoom}
                                  fill={poly.color}
                                  stroke="#ffffff"
                                  strokeWidth={0.8 / zoom}
                                />
                              ))}
                            </g>
                          );
                        })}

                    {showMeasuredMarks &&
                      (measuredLinesByPage[currentPage] || [])
                        .filter((ln) => isLayerVisible(ln.layerId))
                        .map((ln) => {
                          const isFlashed = flashMarkIds.has(ln.id);
                          const canClickLine = activeTool === 'pick' || activeTool === 'highlight';
                          const lineColor = isFlashed ? '#f59e0b' : ln.isLaser ? '#ef4444' : '#10b981';
                          return (
                            <g key={ln.id}>
                              {ln.isLaser && (
                                <line
                                  x1={ln.p1.x}
                                  y1={ln.p1.y}
                                  x2={ln.p2.x}
                                  y2={ln.p2.y}
                                  stroke="#ef4444"
                                  strokeOpacity={0.22}
                                  strokeWidth={4.5 / zoom}
                                  strokeLinecap="round"
                                />
                              )}
                              <line
                                x1={ln.p1.x}
                                y1={ln.p1.y}
                                x2={ln.p2.x}
                                y2={ln.p2.y}
                                stroke={lineColor}
                                strokeWidth={(isFlashed ? 2.8 : ln.isLaser ? 1.5 : 1.6) / zoom}
                                strokeDasharray={ln.isLaser ? undefined : `${4 / zoom} ${2 / zoom}`}
                              />
                              <line
                                x1={ln.p1.x}
                                y1={ln.p1.y}
                                x2={ln.p2.x}
                                y2={ln.p2.y}
                                stroke="transparent"
                                strokeWidth={10 / zoom}
                                className={canClickLine ? 'pointer-events-auto cursor-pointer' : ''}
                                onMouseDown={(e) => {
                                  if (activeTool === 'pick') e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  if (canClickLine) {
                                    e.stopPropagation();
                                    handleReuseLine(ln);
                                  }
                                }}
                              >
                                <title>{`${ln.isLaser ? 'Laser' : 'Misura'} ${ln.meters.toFixed(2)} m — Clicca per inserire nel computo`}</title>
                              </line>
                              <circle cx={ln.p1.x} cy={ln.p1.y} r={2.6 / zoom} fill={lineColor} />
                              <circle cx={ln.p2.x} cy={ln.p2.y} r={2.6 / zoom} fill={lineColor} />
                            </g>
                          );
                        })}

                    {/* LASER VIRTUALE — MIRINO PRE-ORIGINE (TUTTE E 3 LE MODALITÀ) */}
                    {activeTool === 'laser' && !laserOrigin && cursorPt && (
                      <g>
                        <circle
                          cx={cursorPt.x}
                          cy={cursorPt.y}
                          r={8.5 / zoom}
                          fill="none"
                          stroke="#ef4444"
                          strokeOpacity={0.75}
                          strokeWidth={1.1 / zoom}
                          strokeDasharray={`${3 / zoom} ${2 / zoom}`}
                        />
                        {laserMode === 'dual' && (
                          <>
                            <line
                              x1={cursorPt.x - 13 / zoom}
                              y1={cursorPt.y}
                              x2={cursorPt.x + 13 / zoom}
                              y2={cursorPt.y}
                              stroke="#ef4444"
                              strokeOpacity={0.55}
                              strokeWidth={0.9 / zoom}
                            />
                            <line
                              x1={cursorPt.x}
                              y1={cursorPt.y - 13 / zoom}
                              x2={cursorPt.x}
                              y2={cursorPt.y + 13 / zoom}
                              stroke="#ef4444"
                              strokeOpacity={0.55}
                              strokeWidth={0.9 / zoom}
                            />
                          </>
                        )}
                        {laserMode === 'area' && (
                          <rect
                            x={cursorPt.x - 5.5 / zoom}
                            y={cursorPt.y - 5.5 / zoom}
                            width={11 / zoom}
                            height={11 / zoom}
                            fill="rgba(239, 68, 68, 0.16)"
                            stroke="#ef4444"
                            strokeWidth={0.9 / zoom}
                          />
                        )}
                        <circle cx={cursorPt.x} cy={cursorPt.y} r={2.4 / zoom} fill="#ff1a3c" />
                      </g>
                    )}

                    {/* LASER 1 (1 RAGGIO) & LASER 2 (2 RAGGI SX+DX SOMMATI) */}
                    {activeTool === 'laser' && liveLaserShot && (
                      <g>
                        {/* Guida sottile verso il cursore per orientamento */}
                        {cursorPt && (
                          <line
                            x1={liveLaserShot.emitter.x}
                            y1={liveLaserShot.emitter.y}
                            x2={cursorPt.x}
                            y2={cursorPt.y}
                            stroke="#ef4444"
                            strokeOpacity={0.28}
                            strokeWidth={0.9 / zoom}
                            strokeDasharray={`${3 / zoom} ${3 / zoom}`}
                          />
                        )}

                        {/* Alone esterno del fascio laser */}
                        <line
                          x1={liveLaserShot.p1.x}
                          y1={liveLaserShot.p1.y}
                          x2={liveLaserShot.p2.x}
                          y2={liveLaserShot.p2.y}
                          stroke="#ff1a3c"
                          strokeOpacity={0.26}
                          strokeWidth={7.5 / zoom}
                          strokeLinecap="round"
                        />
                        {/* Fascio laser rosso vivo */}
                        <line
                          x1={liveLaserShot.p1.x}
                          y1={liveLaserShot.p1.y}
                          x2={liveLaserShot.p2.x}
                          y2={liveLaserShot.p2.y}
                          stroke="#ff1a3c"
                          strokeWidth={1.9 / zoom}
                          strokeLinecap="round"
                        />
                        {/* Filamento interno ad alta luminosità */}
                        <line
                          x1={liveLaserShot.p1.x}
                          y1={liveLaserShot.p1.y}
                          x2={liveLaserShot.p2.x}
                          y2={liveLaserShot.p2.y}
                          stroke="#fff1f2"
                          strokeOpacity={0.92}
                          strokeWidth={0.65 / zoom}
                          strokeLinecap="round"
                        />

                        {/* Emettitore laser (punto di origine posizionato dall'utente) */}
                        <circle
                          cx={liveLaserShot.emitter.x}
                          cy={liveLaserShot.emitter.y}
                          r={5.5 / zoom}
                          fill="#0f172a"
                          fillOpacity={0.85}
                          stroke="#ff1a3c"
                          strokeWidth={1.4 / zoom}
                        />
                        <circle
                          cx={liveLaserShot.emitter.x}
                          cy={liveLaserShot.emitter.y}
                          r={2.1 / zoom}
                          fill="#fff1f2"
                        />

                        {/* Punto di impatto P2 sulla parete */}
                        <g transform={`translate(${liveLaserShot.p2.x}, ${liveLaserShot.p2.y})`}>
                          <circle
                            r={7.5 / zoom}
                            fill={liveLaserShot.hitWall2 ? '#ff1a3c' : '#f59e0b'}
                            fillOpacity={0.22}
                          />
                          <circle
                            r={3.2 / zoom}
                            fill={liveLaserShot.hitWall2 ? '#ff1a3c' : '#f59e0b'}
                            stroke="#ffffff"
                            strokeWidth={0.9 / zoom}
                          />
                          <line
                            x1={-8 / zoom}
                            y1={0}
                            x2={8 / zoom}
                            y2={0}
                            stroke={liveLaserShot.hitWall2 ? '#ff1a3c' : '#f59e0b'}
                            strokeWidth={1 / zoom}
                          />
                          <line
                            x1={0}
                            y1={-8 / zoom}
                            x2={0}
                            y2={8 / zoom}
                            stroke={liveLaserShot.hitWall2 ? '#ff1a3c' : '#f59e0b'}
                            strokeWidth={1 / zoom}
                          />
                        </g>

                        {/* Punto di impatto opposto P1 in modalità 2 Raggi (Sx+Dx) */}
                        {liveLaserShot.mode === 'dual' && (
                          <g transform={`translate(${liveLaserShot.p1.x}, ${liveLaserShot.p1.y})`}>
                            <circle
                              r={7.5 / zoom}
                              fill={liveLaserShot.hitWall1 ? '#ff1a3c' : '#f59e0b'}
                              fillOpacity={0.22}
                            />
                            <circle
                              r={3.2 / zoom}
                              fill={liveLaserShot.hitWall1 ? '#ff1a3c' : '#f59e0b'}
                              stroke="#ffffff"
                              strokeWidth={0.9 / zoom}
                            />
                            <line
                              x1={-8 / zoom}
                              y1={0}
                              x2={8 / zoom}
                              y2={0}
                              stroke={liveLaserShot.hitWall1 ? '#ff1a3c' : '#f59e0b'}
                              strokeWidth={1 / zoom}
                            />
                            <line
                              x1={0}
                              y1={-8 / zoom}
                              x2={0}
                              y2={8 / zoom}
                              stroke={liveLaserShot.hitWall1 ? '#ff1a3c' : '#f59e0b'}
                              strokeWidth={1 / zoom}
                            />
                          </g>
                        )}

                        {/* Etichette parziali Sx & Dx sui due semiraggi (modalità 2 Raggi) */}
                        {liveLaserShot.mode === 'dual' &&
                          (() => {
                            const isVerticalBeam =
                              Math.abs(liveLaserShot.p2.y - liveLaserShot.p1.y) >
                              Math.abs(liveLaserShot.p2.x - liveLaserShot.p1.x);
                            const halves = [
                              {
                                a: liveLaserShot.emitter,
                                b: liveLaserShot.p1,
                                lenPt: liveLaserShot.d1Pt,
                                valM: liveLaserD1Meters,
                              },
                              {
                                a: liveLaserShot.emitter,
                                b: liveLaserShot.p2,
                                lenPt: liveLaserShot.d2Pt,
                                valM: liveLaserD2Meters,
                              },
                            ];
                            return halves.map((h, idx) => {
                              if (h.lenPt * zoom < 34) return null;
                              const hx = (h.a.x + h.b.x) / 2 + (isVerticalBeam ? -26 / zoom : 0);
                              const hy = (h.a.y + h.b.y) / 2 + (isVerticalBeam ? 0 : 12 / zoom);
                              const pw = 42 / zoom;
                              const ph = 13 / zoom;
                              return (
                                <g key={idx} transform={`translate(${hx}, ${hy})`}>
                                  <rect
                                    x={-pw / 2}
                                    y={-ph / 2}
                                    width={pw}
                                    height={ph}
                                    rx={2.5 / zoom}
                                    fill="#0f172a"
                                    fillOpacity={0.86}
                                    stroke="#ef4444"
                                    strokeOpacity={0.55}
                                    strokeWidth={0.8 / zoom}
                                  />
                                  <text
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fill="#fecdd3"
                                    fontSize={7.5 / zoom}
                                    fontFamily="monospace"
                                    fontWeight="bold"
                                  >
                                    {h.valM.toFixed(2)}m
                                  </text>
                                </g>
                              );
                            });
                          })()}

                        {/* Display numerico distanziometro laser (somma totale in 2 Raggi o distanza in 1 Raggio) */}
                        {(() => {
                          const anchorX =
                            liveLaserShot.mode === 'dual'
                              ? liveLaserShot.emitter.x
                              : (liveLaserShot.p1.x + liveLaserShot.p2.x) / 2;
                          const anchorY =
                            liveLaserShot.mode === 'dual'
                              ? liveLaserShot.emitter.y
                              : (liveLaserShot.p1.y + liveLaserShot.p2.y) / 2;
                          const isVerticalBeam =
                            Math.abs(liveLaserShot.p2.y - liveLaserShot.p1.y) >
                            Math.abs(liveLaserShot.p2.x - liveLaserShot.p1.x);
                          const offX = isVerticalBeam ? 44 / zoom : 0;
                          const offY = isVerticalBeam ? 0 : -18 / zoom;

                          const labelText =
                            liveLaserShot.mode === 'dual'
                              ? exportUnit !== 'm'
                                ? `Σ ${liveLaserMeters.toFixed(2)}m→${formatMeasureVal(metersToUnit(liveLaserMeters, exportUnit), exportUnit)}${exportUnit}`
                                : `${liveLaserD1Meters.toFixed(2)}+${liveLaserD2Meters.toFixed(2)}=${liveLaserMeters.toFixed(2)}m`
                              : exportUnit !== 'm'
                              ? `${liveLaserMeters.toFixed(2)}m→${formatMeasureVal(metersToUnit(liveLaserMeters, exportUnit), exportUnit)}${exportUnit}`
                              : `${liveLaserMeters.toFixed(2)} m`;

                          const boxW = Math.max(66, labelText.length * 5.7 + 16) / zoom;
                          const boxH = 18 / zoom;
                          const locked =
                            liveLaserShot.mode === 'dual'
                              ? liveLaserShot.hitWall1 && liveLaserShot.hitWall2
                              : liveLaserShot.hitWall2;
                          return (
                            <g transform={`translate(${anchorX + offX}, ${anchorY + offY})`}>
                              <rect
                                x={-boxW / 2}
                                y={-boxH / 2}
                                width={boxW}
                                height={boxH}
                                rx={3.5 / zoom}
                                fill="#090d16"
                                fillOpacity={0.95}
                                stroke={locked ? '#ef4444' : '#f59e0b'}
                                strokeWidth={1.15 / zoom}
                              />
                              <circle
                                cx={-boxW / 2 + 6.5 / zoom}
                                cy={0}
                                r={2.3 / zoom}
                                fill={locked ? '#ff1a3c' : '#f59e0b'}
                              />
                              <text
                                textAnchor="middle"
                                dominantBaseline="central"
                                x={4 / zoom}
                                y={0}
                                fill="#ffffff"
                                fontSize={8.6 / zoom}
                                fontFamily="monospace"
                                fontWeight="bold"
                              >
                                {labelText}
                              </text>
                            </g>
                          );
                        })()}
                      </g>
                    )}

                    {/* LASER 3 — LASER AREALE (ESPANSIONE SUPERFICIE SULLE PARETI TRA PUNTO 1 E PUNTO 2) */}
                    {activeTool === 'laser' && laserMode === 'area' && liveLaserArea && (
                      <g>
                        {/* Superficie rilevata illuminata dal campo laser */}
                        <path
                          d={liveLaserArea.svgFillPath}
                          fill="#ff1a3c"
                          fillOpacity={0.2}
                          stroke="none"
                        />
                        {/* Alone perimetrale di impatto sulle pareti */}
                        <path
                          d={liveLaserArea.svgBorderPath}
                          fill="none"
                          stroke="#ff1a3c"
                          strokeOpacity={0.34}
                          strokeWidth={4.2 / zoom}
                          strokeLinecap="round"
                        />
                        {/* Bordo laser nitido sulle pareti incontrate */}
                        <path
                          d={liveLaserArea.svgBorderPath}
                          fill="none"
                          stroke="#ff1a3c"
                          strokeWidth={1.4 / zoom}
                          strokeLinecap="round"
                        />

                        {/* Raggi di scansione ottica dal percorso P1 → P2 verso le pareti */}
                        {liveLaserArea.scanRays.map((ray, idx) => (
                          <line
                            key={idx}
                            x1={ray.from.x}
                            y1={ray.from.y}
                            x2={ray.to.x}
                            y2={ray.to.y}
                            stroke="#ff1a3c"
                            strokeOpacity={0.32}
                            strokeWidth={0.85 / zoom}
                            strokeDasharray={`${3 / zoom} ${2.5 / zoom}`}
                          />
                        ))}

                        {/* Vettore di espansione dal Punto 1 al Punto 2 */}
                        <line
                          x1={liveLaserArea.origin.x}
                          y1={liveLaserArea.origin.y}
                          x2={liveLaserArea.cursor.x}
                          y2={liveLaserArea.cursor.y}
                          stroke="#fff1f2"
                          strokeOpacity={0.85}
                          strokeWidth={1.2 / zoom}
                          strokeDasharray={`${4 / zoom} ${2.5 / zoom}`}
                        />

                        {/* Punto 1 (Origine) & Punto 2 (Cursore espansione) */}
                        <circle
                          cx={liveLaserArea.origin.x}
                          cy={liveLaserArea.origin.y}
                          r={5 / zoom}
                          fill="#0f172a"
                          stroke="#ff1a3c"
                          strokeWidth={1.4 / zoom}
                        />
                        <circle cx={liveLaserArea.origin.x} cy={liveLaserArea.origin.y} r={2 / zoom} fill="#fff1f2" />
                        <circle
                          cx={liveLaserArea.cursor.x}
                          cy={liveLaserArea.cursor.y}
                          r={4 / zoom}
                          fill="#ff1a3c"
                          stroke="#ffffff"
                          strokeWidth={1 / zoom}
                        />

                        {/* Display centrale Laser Areale: m² e Perimetro */}
                        {(() => {
                          const isPerimMode = extractionMode === 'linear' || extractionMode === 'walls_perim_h';
                          const mainText = isPerimMode
                            ? `P ${liveLaserPerimM.toFixed(2)} m · ${liveLaserAreaM2.toFixed(2)} m²`
                            : `${liveLaserAreaM2.toFixed(2)} m² · P ${liveLaserPerimM.toFixed(2)}m`;
                          const boxW = Math.max(96, mainText.length * 5.6 + 18) / zoom;
                          const boxH = 20 / zoom;
                          return (
                            <g transform={`translate(${liveLaserArea.centroid.x}, ${liveLaserArea.centroid.y})`}>
                              <rect
                                x={-boxW / 2}
                                y={-boxH / 2}
                                width={boxW}
                                height={boxH}
                                rx={4 / zoom}
                                fill="#090d16"
                                fillOpacity={0.95}
                                stroke={liveLaserArea.enclosed ? '#ef4444' : '#f59e0b'}
                                strokeWidth={1.25 / zoom}
                              />
                              <circle
                                cx={-boxW / 2 + 7 / zoom}
                                cy={0}
                                r={2.5 / zoom}
                                fill={liveLaserArea.enclosed ? '#ff1a3c' : '#f59e0b'}
                              />
                              <text
                                textAnchor="middle"
                                dominantBaseline="central"
                                x={4 / zoom}
                                y={0}
                                fill="#ffffff"
                                fontSize={9 / zoom}
                                fontFamily="monospace"
                                fontWeight="bold"
                              >
                                {mainText}
                              </text>
                            </g>
                          );
                        })()}
                      </g>
                    )}

                    {/* FLASH DI CONFERMA IMPULSO LASER APPENA ACQUISITO (LINEARE O AREALE — NON RESTA IN PIANTA) */}
                    {laserFlashShot && (
                      <g>
                        <line
                          x1={laserFlashShot.p1.x}
                          y1={laserFlashShot.p1.y}
                          x2={laserFlashShot.p2.x}
                          y2={laserFlashShot.p2.y}
                          stroke="#fb7185"
                          strokeOpacity={0.55}
                          strokeWidth={11 / zoom}
                          strokeLinecap="round"
                        />
                        <line
                          x1={laserFlashShot.p1.x}
                          y1={laserFlashShot.p1.y}
                          x2={laserFlashShot.p2.x}
                          y2={laserFlashShot.p2.y}
                          stroke="#ffffff"
                          strokeWidth={2.4 / zoom}
                          strokeLinecap="round"
                        />
                      </g>
                    )}

                    {laserAreaFlash && (
                      <g>
                        <path d={laserAreaFlash.svgFillPath} fill="#fb7185" fillOpacity={0.42} stroke="none" />
                        <path
                          d={laserAreaFlash.svgBorderPath}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth={2.2 / zoom}
                          strokeLinecap="round"
                        />
                      </g>
                    )}

                    {rulerStart && cursorPt && (
                      <g>
                        <line
                          x1={rulerStart.x}
                          y1={rulerStart.y}
                          x2={cursorPt.x}
                          y2={cursorPt.y}
                          stroke={activeTool === 'calibrate' ? '#e11d48' : '#10b981'}
                          strokeWidth={1.8 / zoom}
                        />
                        <circle cx={rulerStart.x} cy={rulerStart.y} r={3.5 / zoom} fill="#10b981" />
                        <circle cx={cursorPt.x} cy={cursorPt.y} r={3.5 / zoom} fill="#10b981" />
                        <g transform={`translate(${(rulerStart.x + cursorPt.x) / 2}, ${(rulerStart.y + cursorPt.y) / 2 - 10 / zoom})`}>
                          <rect
                            x={(exportUnit !== 'm' ? -52 : -28) / zoom}
                            y={-10 / zoom}
                            width={(exportUnit !== 'm' ? 104 : 56) / zoom}
                            height={15 / zoom}
                            rx={3 / zoom}
                            fill="#0f172a"
                            opacity={0.92}
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            y={-2.5 / zoom}
                            fill="#ffffff"
                            fontSize={8.5 / zoom}
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {exportUnit !== 'm'
                              ? `${liveRulerMeters.toFixed(2)}m → ${formatMeasureVal(metersToUnit(liveRulerMeters, exportUnit), exportUnit)}${exportUnit}`
                              : `${liveRulerMeters.toFixed(2)} m`}
                          </text>
                        </g>
                      </g>
                    )}

                    {polygonPts.length > 0 && (
                      <g>
                        <polygon
                          points={[...polygonPts, ...(cursorPt ? [cursorPt] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
                          fill="rgba(79, 70, 229, 0.22)"
                          stroke="#4f46e5"
                          strokeWidth={1.8 / zoom}
                        />
                        {polygonPts.map((p, idx) => (
                          <circle
                            key={idx}
                            cx={p.x}
                            cy={p.y}
                            r={(idx === 0 ? 5 : 3.5) / zoom}
                            fill={idx === 0 ? '#f59e0b' : '#4f46e5'}
                            stroke="#ffffff"
                            strokeWidth={1 / zoom}
                          />
                        ))}
                      </g>
                    )}

                    {snappedVertex && (
                      <g>
                        <rect
                          x={snappedVertex.x - 5 / zoom}
                          y={snappedVertex.y - 5 / zoom}
                          width={10 / zoom}
                          height={10 / zoom}
                          fill="none"
                          stroke="#06b6d4"
                          strokeWidth={1.6 / zoom}
                        />
                        <circle cx={snappedVertex.x} cy={snappedVertex.y} r={2 / zoom} fill="#06b6d4" />
                      </g>
                    )}

                    {/* SCHIZZI CON PENNINO COLORATO (FILTRATI PER LAYER VISIBILE) */}
                    {[
                      ...(penStrokesByPage[currentPage] || []).filter((st) => isLayerVisible(st.layerId)),
                      ...(activePenStroke ? [activePenStroke] : []),
                    ].map((st) => {
                      const d = st.points
                        .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                        .join(' ');
                      return (
                        <path
                          key={st.id}
                          d={d}
                          fill="none"
                          stroke={st.color}
                          strokeWidth={st.width}
                          strokeOpacity={st.isHighlighter ? 0.42 : 0.92}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      );
                    })}
                  </svg>
                )}

                {/* ETICHETTE CLICCABILI PER RIUTILIZZARE SUPERFICI POLIGONI & LINEE RIGHELLO + CANCELLAZIONE */}
                {currentAnalysis && showMeasuredMarks && (
                  <div className="absolute inset-0 pointer-events-none">
                    {(measuredPolygonsByPage[currentPage] || [])
                      .filter((poly) => isLayerVisible(poly.layerId))
                      .map((poly) => {
                        const isFlashed = flashMarkIds.has(poly.id);
                        const locked = isLayerLocked(poly.layerId);
                        return (
                          <div
                            key={poly.id}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                              left: `${poly.centroid.x * zoom}px`,
                              top: `${poly.centroid.y * zoom}px`,
                              transform: 'translate(-50%, -50%)',
                              borderColor: isFlashed ? '#f59e0b' : poly.color,
                            }}
                            className={`absolute z-[15] pointer-events-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/92 border shadow-sm text-[11px] font-bold text-slate-900 whitespace-nowrap transition-transform ${
                              isFlashed ? 'ring-2 ring-amber-400 scale-105' : 'hover:scale-[1.03]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReusePolygon(poly, 'area');
                              }}
                              className="inline-flex items-center gap-1 cursor-pointer hover:text-indigo-700"
                              title={`Clicca per inserire ${poly.areaM2.toFixed(2)} m² nel computo`}
                            >
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: poly.color }} />
                              <span>{poly.label}</span>
                              <span className="font-mono text-indigo-800">{poly.areaM2.toFixed(2)} m²</span>
                            </button>

                            {(extractionMode === 'walls_perim_h' || extractionMode === 'linear') && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReusePolygon(poly, 'perimeter');
                                }}
                                className="px-1 rounded bg-amber-100 hover:bg-amber-200 text-[10px] font-mono text-amber-900"
                                title={`Clicca per inserire il perimetro (${poly.perimM.toFixed(2)} m)`}
                              >
                                P:{poly.perimM.toFixed(2)}m
                              </button>
                            )}

                            {!locked && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMeasuredPolygonsByPage((prev) => ({
                                    ...prev,
                                    [currentPage]: (prev[currentPage] || []).filter((p) => p.id !== poly.id),
                                  }));
                                }}
                                className="p-0.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-colors"
                                title="Cancella questa superficie segnata"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}

                    {(measuredLinesByPage[currentPage] || [])
                      .filter((ln) => isLayerVisible(ln.layerId))
                      .map((ln) => {
                        const mx = ((ln.p1.x + ln.p2.x) / 2) * zoom;
                        const my = ((ln.p1.y + ln.p2.y) / 2) * zoom;
                        const conv = metersToUnit(ln.meters, exportUnit);
                        const isFlashed = flashMarkIds.has(ln.id);
                        const locked = isLayerLocked(ln.layerId);
                        return (
                          <div
                            key={ln.id}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{ left: `${mx}px`, top: `${my}px`, transform: 'translate(-50%, -50%)' }}
                            className={`absolute z-[15] pointer-events-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-white shadow text-[10px] font-mono font-bold whitespace-nowrap transition-transform ${
                              ln.isLaser ? 'bg-red-950/92' : 'bg-emerald-950/90'
                            } ${
                              isFlashed
                                ? 'border-amber-400 ring-2 ring-amber-400 scale-105'
                                : ln.isLaser
                                ? 'border-red-400/75 hover:border-amber-300 hover:scale-105'
                                : 'border-emerald-400/70 hover:border-amber-300 hover:scale-105'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReuseLine(ln);
                              }}
                              className="cursor-pointer hover:text-amber-300 inline-flex items-center gap-1"
                              title="Clicca per inserire questa misura nel computo"
                            >
                              {ln.isLaser && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />}
                              {exportUnit !== 'm'
                                ? `${ln.meters.toFixed(2)}m → ${formatMeasureVal(conv, exportUnit)}${exportUnit}`
                                : `${ln.meters.toFixed(2)} m`}
                            </button>
                            {!locked && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMeasuredLinesByPage((prev) => ({
                                    ...prev,
                                    [currentPage]: (prev[currentPage] || []).filter((x) => x.id !== ln.id),
                                  }));
                                }}
                                className={`p-0.5 rounded hover:bg-rose-500/30 hover:text-rose-200 ${
                                  ln.isLaser ? 'text-red-300' : 'text-emerald-300'
                                }`}
                                title="Cancella questa linea"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* STRATO SOSTITUZIONE DIGITALE EDITABILE PER NUMERI E TESTI SCANSIONATI */}
                {currentAnalysis && showEditableOverlay && (
                  <div className="absolute inset-0 pointer-events-none">
                    {currentAnalysis.tokens
                      .filter((tok) => tok.source === 'ocr' || tok.source === 'manual')
                      .map((tok) => {
                        const isVert = tok.orientation === 'vertical';
                        const isEditing = editingTokenId === tok.id;
                        const boxW = Math.max(12, (tok.bbox.x2 - tok.bbox.x1) * zoom);
                        const boxH = Math.max(10, (tok.bbox.y2 - tok.bbox.y1) * zoom);
                        const unrotW = isVert ? boxH : boxW;
                        const unrotH = isVert ? boxW : boxH;
                        const fontSizePx = Math.max(8, Math.min(15, Math.round(unrotH * 0.72)));
                        const isFlashed = flashTokenIds.has(tok.id);
                        const canClickBadge = activeTool === 'edit_ocr' || activeTool === 'pick';

                        if (isEditing) {
                          return (
                            <div
                              key={tok.id}
                              onMouseDown={(e) => e.stopPropagation()}
                              style={{
                                left: `${tok.cx * zoom}px`,
                                top: `${tok.cy * zoom}px`,
                                transform: 'translate(-50%, -50%)',
                              }}
                              className="absolute z-30 pointer-events-auto flex items-center gap-1 bg-white border-2 border-violet-600 rounded-md shadow-xl p-1"
                            >
                              <input
                                type="text"
                                value={editingTokenText}
                                autoFocus
                                onChange={(e) => setEditingTokenText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveTokenEdit(tok.id, editingTokenText);
                                  } else if (e.key === 'Escape') {
                                    setEditingTokenId(null);
                                  }
                                }}
                                className="w-28 px-1.5 py-0.5 text-xs font-mono font-bold text-slate-950 bg-violet-50 rounded border border-violet-200 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveTokenEdit(tok.id, editingTokenText)}
                                className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                                title="Salva (Invio)"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteToken(tok.id)}
                                className="p-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700"
                                title="Elimina elemento"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        }

                        const coloredTextClass = isFlashed
                          ? 'bg-amber-200/95 text-slate-950 border-b-2 border-amber-600'
                          : tok.kind === 'surface'
                          ? 'bg-white/75 text-emerald-700 font-mono font-bold border-b border-dotted border-emerald-500/80'
                          : tok.kind === 'dimension'
                          ? 'bg-white/75 text-sky-700 font-mono font-bold border-b border-dotted border-sky-500/80'
                          : tok.kind === 'perimeter' || tok.kind === 'height'
                          ? 'bg-white/75 text-amber-700 font-mono font-bold border-b border-dotted border-amber-500/80'
                          : tok.kind === 'room'
                          ? 'bg-white/75 text-indigo-700 font-sans font-bold border-b border-dotted border-indigo-400/70'
                          : 'bg-white/75 text-violet-700 font-semibold border-b border-dotted border-violet-400/60';

                        return (
                          <div
                            key={tok.id}
                            onMouseDown={(e) => {
                              if (canClickBadge) e.stopPropagation();
                            }}
                            onClick={(e) => {
                              if (activeTool === 'edit_ocr') {
                                e.stopPropagation();
                                setEditingTokenId(tok.id);
                                setEditingTokenText(tok.str);
                              } else if (activeTool === 'pick') {
                                e.stopPropagation();
                                handlePickToken(tok);
                              }
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingTokenId(tok.id);
                              setEditingTokenText(tok.str);
                            }}
                            style={{
                              left: `${tok.cx * zoom}px`,
                              top: `${tok.cy * zoom}px`,
                              minWidth: `${unrotW}px`,
                              height: `${Math.max(11, unrotH)}px`,
                              fontSize: `${fontSizePx}px`,
                              lineHeight: 1.0,
                              transform: isVert
                                ? `translate(-50%, -50%) rotate(${tok.angleDeg || -90}deg)`
                                : 'translate(-50%, -50%)',
                            }}
                            className={`absolute z-10 inline-flex items-center justify-center px-[1px] rounded-[2px] whitespace-nowrap select-none transition-transform ${coloredTextClass} ${
                              activeTool === 'edit_ocr'
                                ? 'pointer-events-auto cursor-text hover:scale-105 hover:bg-violet-50/90'
                                : activeTool === 'pick'
                                ? 'pointer-events-auto cursor-pointer hover:scale-105 hover:bg-cyan-50/90'
                                : 'pointer-events-none'
                            }`}
                            title={
                              activeTool === 'edit_ocr'
                                ? `Clicca per modificare "${tok.str}"`
                                : `${tok.str}${tok.numericValue !== undefined ? ` (${tok.numericValue})` : ''} · Carattere colorato = editabile (doppio clic) e caricabile (clic)`
                            }
                          >
                            {tok.str}
                          </div>
                        );
                        })}

                    {/* Nuovo campo manuale OCR in posizionamento */}
                    {newTokenDraft && (
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          left: `${newTokenDraft.x * zoom}px`,
                          top: `${newTokenDraft.y * zoom}px`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        className="absolute z-30 pointer-events-auto flex items-center gap-1 bg-white border-2 border-violet-600 rounded-md shadow-xl p-1"
                      >
                        <input
                          type="text"
                          placeholder="Es. 3,55 o Bagno"
                          value={newTokenDraft.text}
                          autoFocus
                          onChange={(e) => setNewTokenDraft({ ...newTokenDraft, text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCreateManualToken(newTokenDraft.x, newTokenDraft.y, newTokenDraft.text, newTokenDraft.vertical);
                            } else if (e.key === 'Escape') {
                              setNewTokenDraft(null);
                            }
                          }}
                          className="w-28 px-1.5 py-0.5 text-xs font-mono font-bold text-slate-950 bg-violet-50 rounded border border-violet-200 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setNewTokenDraft({ ...newTokenDraft, vertical: !newTokenDraft.vertical })}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            newTokenDraft.vertical ? 'bg-violet-600 text-white border-violet-600' : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                          title="Orientamento verticale (-90°) / orizzontale"
                        >
                          {newTokenDraft.vertical ? '↕' : '↔'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleCreateManualToken(newTokenDraft.x, newTokenDraft.y, newTokenDraft.text, newTokenDraft.vertical)
                          }
                          className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                          title="Aggiungi"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewTokenDraft(null)}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                          title="Annulla"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* STRATO ANNOTAZIONI TESTUALI & PROMEMORIA SULLA PIANTINA (FILTRATO PER LAYER) */}
                {currentAnalysis && (
                  <div className="absolute inset-0 pointer-events-none">
                    {(textNotesByPage[currentPage] || [])
                      .filter((note) => isLayerVisible(note.layerId))
                      .map((note) => {
                        const isEditingThis = editingTextNote?.id === note.id;
                        if (isEditingThis) return null;
                        const locked = isLayerLocked(note.layerId);
                        return (
                          <div
                            key={note.id}
                            onMouseDown={(e) => {
                              if (activeTool === 'text_note' && e.button === 0 && !locked) {
                                e.stopPropagation();
                                const { pt } = getPdfCoords(e.clientX, e.clientY, false);
                                draggingNoteRef.current = {
                                  id: note.id,
                                  offsetX: pt.x - note.x,
                                  offsetY: pt.y - note.y,
                                };
                              }
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              if (locked) {
                                setLastFeedback('Layer bloccato: sbloccalo dal pannello Layer per modificare la nota');
                                return;
                              }
                              setEditingTextNote({
                                id: note.id,
                                x: note.x,
                                y: note.y,
                                text: note.text,
                                color: note.color,
                                fontSize: note.fontSize,
                                vertical: !!note.vertical,
                                bgOpaque: note.bgOpaque !== false,
                                isReminder: !!note.isReminder,
                                layerId: note.layerId || DEFAULT_LAYER_IDS.NOTES,
                              });
                            }}
                            style={{
                              left: `${note.x * zoom}px`,
                              top: `${note.y * zoom}px`,
                              color: note.color,
                              borderColor: note.bgOpaque !== false ? note.color : 'transparent',
                              fontSize: `${Math.max(9, Math.round(note.fontSize * zoom))}px`,
                              lineHeight: 1.15,
                              transform: note.vertical
                                ? 'translate(-50%, -50%) rotate(-90deg)'
                                : 'translate(-50%, -50%)',
                            }}
                            className={`absolute z-20 inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold whitespace-pre-wrap max-w-[260px] select-none ${
                              note.bgOpaque !== false
                                ? 'bg-white/92 border shadow-sm'
                                : 'bg-transparent border-0 drop-shadow-[0_1px_1px_rgba(255,255,255,0.95)]'
                            } ${
                              activeTool === 'text_note' && !locked
                                ? 'pointer-events-auto cursor-move hover:ring-2 hover:ring-sky-400'
                                : 'pointer-events-none'
                            }`}
                            title="Doppio clic per modificare o eliminare l'appunto"
                          >
                            {note.isReminder && <Bookmark className="w-3 h-3 shrink-0 text-amber-500" />}
                            <span>{note.text}</span>
                          </div>
                        );
                      })}

                    {editingTextNote && (
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          left: `${editingTextNote.x * zoom}px`,
                          top: `${editingTextNote.y * zoom}px`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        className="absolute z-40 pointer-events-auto bg-white border-2 border-sky-600 rounded-lg shadow-2xl p-2 flex flex-col gap-1.5 min-w-[260px]"
                      >
                        <input
                          type="text"
                          placeholder="Scrivi appunto, promemoria o nota..."
                          value={editingTextNote.text}
                          autoFocus
                          onChange={(e) => setEditingTextNote({ ...editingTextNote, text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const trimmed = editingTextNote.text.trim();
                              if (trimmed) {
                                const saved: PlanTextNote = {
                                  id: editingTextNote.id || `txt_${uid()}`,
                                  x: editingTextNote.x,
                                  y: editingTextNote.y,
                                  text: trimmed,
                                  color: editingTextNote.color,
                                  fontSize: editingTextNote.fontSize,
                                  vertical: editingTextNote.vertical,
                                  bgOpaque: editingTextNote.bgOpaque,
                                  isReminder: editingTextNote.isReminder,
                                  layerId: editingTextNote.layerId,
                                };
                                setTextNotesByPage((prev) => {
                                  const list = prev[currentPage] || [];
                                  const exists = list.some((n) => n.id === saved.id);
                                  return {
                                    ...prev,
                                    [currentPage]: exists
                                      ? list.map((n) => (n.id === saved.id ? saved : n))
                                      : [...list, saved],
                                  };
                                });
                              }
                              setEditingTextNote(null);
                            } else if (e.key === 'Escape') {
                              setEditingTextNote(null);
                            }
                          }}
                          style={{ color: editingTextNote.color }}
                          className="w-full px-2 py-1 text-xs font-bold bg-slate-50 rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <div className="flex items-center justify-between gap-1.5 text-[10px]">
                          <select
                            value={editingTextNote.layerId}
                            onChange={(e) => setEditingTextNote({ ...editingTextNote, layerId: e.target.value })}
                            className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 max-w-[145px]"
                            title="Assegna layer all'appunto"
                          >
                            {layers.map((l) => (
                              <option key={l.id} value={l.id}>
                                Layer: {l.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingTextNote({ ...editingTextNote, isReminder: !editingTextNote.isReminder })
                            }
                            className={`px-1.5 py-0.5 rounded font-bold border inline-flex items-center gap-1 ${
                              editingTextNote.isReminder
                                ? 'bg-amber-100 border-amber-400 text-amber-800'
                                : 'bg-slate-100 border-slate-300 text-slate-600'
                            }`}
                            title="Segna come Promemoria"
                          >
                            <Bookmark className="w-2.5 h-2.5" />
                            <span>Promemoria</span>
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1">
                            {ANNOTATION_COLORS.map((c) => (
                              <button
                                key={c.hex}
                                type="button"
                                onClick={() => setEditingTextNote({ ...editingTextNote, color: c.hex })}
                                style={{ backgroundColor: c.hex }}
                                className={`w-4 h-4 rounded-full border ${
                                  editingTextNote.color === c.hex ? 'border-slate-900 ring-2 ring-sky-400 scale-110' : 'border-slate-300'
                                }`}
                                title={c.name}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setEditingTextNote({ ...editingTextNote, vertical: !editingTextNote.vertical })
                              }
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                editingTextNote.vertical
                                  ? 'bg-sky-600 text-white border-sky-600'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                              title="Ruota testo orizzontale / verticale"
                            >
                              {editingTextNote.vertical ? '↕' : '↔'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setEditingTextNote({ ...editingTextNote, bgOpaque: !editingTextNote.bgOpaque })
                              }
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                editingTextNote.bgOpaque
                                  ? 'bg-slate-800 text-white border-slate-800'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                              title="Sfondo bianco leggibile / trasparente"
                            >
                              Sfondo
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const trimmed = editingTextNote.text.trim();
                                if (trimmed) {
                                  const saved: PlanTextNote = {
                                    id: editingTextNote.id || `txt_${uid()}`,
                                    x: editingTextNote.x,
                                    y: editingTextNote.y,
                                    text: trimmed,
                                    color: editingTextNote.color,
                                    fontSize: editingTextNote.fontSize,
                                    vertical: editingTextNote.vertical,
                                    bgOpaque: editingTextNote.bgOpaque,
                                    isReminder: editingTextNote.isReminder,
                                    layerId: editingTextNote.layerId,
                                  };
                                  setTextNotesByPage((prev) => {
                                    const list = prev[currentPage] || [];
                                    const exists = list.some((n) => n.id === saved.id);
                                    return {
                                      ...prev,
                                      [currentPage]: exists
                                        ? list.map((n) => (n.id === saved.id ? saved : n))
                                        : [...list, saved],
                                    };
                                  });
                                }
                                setEditingTextNote(null);
                              }}
                              className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                              title="Salva appunto (Invio)"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            {editingTextNote.id && (
                              <button
                                type="button"
                                onClick={() => {
                                  const targetId = editingTextNote.id;
                                  setTextNotesByPage((prev) => ({
                                    ...prev,
                                    [currentPage]: (prev[currentPage] || []).filter((n) => n.id !== targetId),
                                  }));
                                  setEditingTextNote(null);
                                }}
                                className="p-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700"
                                title="Elimina appunto"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingTextNote(null)}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                              title="Annulla"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>

          {/* FOOTER PAGINE PDF */}
          {pdfDoc && (
            <div className="bg-slate-950 border-t border-slate-800 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0 overflow-x-auto">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-35"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono tabular-nums text-slate-300 px-1.5 whitespace-nowrap">
                  Pag. {currentPage} / {numPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= numPages}
                  onClick={async () => {
                    const next = Math.min(numPages, currentPage + 1);
                    setCurrentPage(next);
                    if (!pageAnalyses[next]) await ensurePageAnalyzed(pdfDoc, next, quoteUnit);
                  }}
                  className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-35"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1 overflow-x-auto">
                {Array.from({ length: Math.min(numPages, 12) }, (_, idx) => idx + 1).map((p) => {
                  const pa = pageAnalyses[p];
                  const roomCount = pa?.rooms.length || 0;
                  const active = p === currentPage;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={async () => {
                        setCurrentPage(p);
                        if (!pageAnalyses[p]) await ensurePageAnalyzed(pdfDoc, p, quoteUnit);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                        active ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <span>Tav. {p}</span>
                      {pa && (
                        <span className={`font-mono text-[10px] ${active ? 'text-slate-900' : 'text-slate-400'}`}>
                          {pa.isLikelyScanned ? '(Img)' : roomCount > 0 ? `(${roomCount} vani)` : ''}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* MANIGLIA RIDIMENSIONAMENTO PANNELLO DESTRO */}
        <div
          onMouseDown={() => setIsResizingSplit(true)}
          className="hidden lg:flex w-2 bg-slate-800 hover:bg-amber-500 cursor-col-resize items-center justify-center transition-colors shrink-0"
          title="Trascina per allargare o restringere l'elenco misure"
        >
          <GripVertical className="w-3 h-3 text-slate-400" />
        </div>

        {/* RIGHT RAIL: ELENCO MISURE IN STILE COMPUTO METRICO */}
        <aside
          style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${rightPanelWidth}px` : undefined }}
          className="w-full lg:shrink-0 bg-white border-t lg:border-t-0 flex flex-col min-h-0"
        >
          {/* 1. MODALITÀ RILIEVO & PARAMETRI COMPATTI */}
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg overflow-x-auto">
                {MODE_OPTIONS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setExtractionMode(m.id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      extractionMode === m.id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-1">
                <span className="text-slate-500 font-medium">H (m)</span>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={defaultHeightM}
                  onChange={(e) => setDefaultHeightM(parseFloat(e.target.value) || 0)}
                  className="w-14 text-right font-mono font-bold text-slate-900 focus:outline-none tabular-nums"
                />
              </label>

              <label className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-1">
                <span className="text-slate-500 font-medium">Scala 1:</span>
                <input
                  type="number"
                  min="1"
                  max="5000"
                  value={scaleDenominator}
                  onChange={(e) => {
                    setCustomMetersPerPt(null);
                    setScaleDenominator(parseInt(e.target.value, 10) || 100);
                  }}
                  className="w-14 text-right font-mono font-bold text-slate-900 focus:outline-none tabular-nums"
                />
                {customMetersPerPt !== null && (
                  <button
                    type="button"
                    onClick={() => setCustomMetersPerPt(null)}
                    className="text-slate-400 hover:text-slate-700"
                    title="Ripristina scala nominale"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </label>

              {/* Toggle compatto Vani Rilevati */}
              {currentAnalysis && currentAnalysis.rooms.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsRoomsDrawerOpen((v) => !v)}
                  className="ml-auto px-2.5 py-1 rounded-md bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-semibold text-[11px] flex items-center gap-1 whitespace-nowrap"
                >
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  <span>Vani ({currentAnalysis.rooms.length})</span>
                  {isRoomsDrawerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>

          {/* 2. VANI RILEVATI (COLLAPSABILE PER MASSIMIZZARE L'ELENCO MISURE) */}
          {isRoomsDrawerOpen && currentAnalysis && currentAnalysis.rooms.length > 0 && (
            <div className="border-b border-slate-200 bg-amber-50/30 shrink-0">
              <div className="px-3.5 py-1.5 flex items-center justify-between border-b border-amber-100">
                <span className="text-[11px] font-bold text-slate-700">Vani Rilevati in Tav. {currentPage}</span>
                <button
                  type="button"
                  onClick={handleAddAllPageRooms}
                  className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px]"
                >
                  + Carica Tutti i Vani
                </button>
              </div>
              <div className="max-h-[145px] overflow-y-auto divide-y divide-slate-100">
                {currentAnalysis.rooms.map((rm) => (
                  <div
                    key={rm.id}
                    onMouseEnter={() => setHoveredRoomId(rm.id)}
                    onMouseLeave={() => setHoveredRoomId(null)}
                    className="px-3.5 py-1 flex items-center justify-between gap-2 hover:bg-amber-100/50 text-xs"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="font-bold text-slate-800 truncate">{rm.name}</span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-500">
                        {rm.lengthM && rm.widthM ? `${rm.lengthM.toFixed(2)}×${rm.widthM.toFixed(2)}` : ''}
                        {rm.areaMq !== undefined ? ` ${rm.areaMq.toFixed(2)}mq` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddSingleRoom(rm)}
                      className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-900 hover:text-white text-slate-700 font-bold text-[10px]"
                    >
                      + Aggiungi
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. BARRA STRUMENTI ELENCO MISURE (STILE COMPUTO) */}
          <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-1.5 flex-wrap shrink-0">
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => handleAddEmptyRow('positive')}
                className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
                title="Aggiungi un nuovo rigo e scrivi a mano o misura nella casella evidenziata"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nuovo Rigo</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddEmptyRow('deduction')}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-bold text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
                title="Aggiungi rigo a detrarre (Negativo -)"
              >
                <MinusCircle className="w-3.5 h-3.5" />
                <span>Negativo (-)</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setQueuedRows((prev) => [...prev, { id: uid(), description: '', type: 'subtotal' }])
                }
                className="px-2.5 py-1 rounded-md bg-white hover:bg-amber-50 border border-amber-200 text-amber-800 font-bold text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
                title="Inserisci riga Somma Parziale"
              >
                <Sigma className="w-3.5 h-3.5" />
                <span>Parziale</span>
              </button>

              <button
                type="button"
                disabled={queuedRows.length === 0}
                onClick={handleCloneLastRow}
                className="px-2 py-1 rounded-md bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-[11px] flex items-center gap-1 disabled:opacity-35 whitespace-nowrap"
                title="Stessa Misura / Clona rigo"
              >
                <CopyPlus className="w-3.5 h-3.5 text-cyan-600" />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={queuedRows.length === 0}
                onClick={() => setQueuedRows((prev) => prev.slice(0, -1))}
                className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-white disabled:opacity-30"
                title="Annulla ultimo rigo (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              {queuedRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQueuedRows([]);
                    setActiveCell(null);
                  }}
                  className="px-2 py-1 rounded text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Svuota
                </button>
              )}
            </div>
          </div>

          {/* 4. TABELLA ELENCO MISURE IDENTICA AL COMPUTO */}
          <div className="flex-1 overflow-auto bg-white">
            <table className="w-full border-collapse text-xs table-fixed">
              <thead className="sticky top-0 z-10 bg-slate-800 text-slate-100 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="w-7 py-2 px-1 text-center border-r border-slate-700">N.</th>
                  <th className="w-7 py-2 px-0.5 text-center border-r border-slate-700">+/-</th>
                  <th className="py-2 px-2 text-left border-r border-slate-700">Descrizione Vano / Misura</th>
                  <th className="w-[54px] py-2 px-1 text-right border-r border-slate-700">Par.Ug.</th>
                  <th className="w-[62px] py-2 px-1 text-right border-r border-slate-700">Lung.</th>
                  <th className="w-[62px] py-2 px-1 text-right border-r border-slate-700">Larg.</th>
                  <th className="w-[58px] py-2 px-1 text-right border-r border-slate-700">H/Peso</th>
                  <th className="w-[70px] py-2 px-1.5 text-right border-r border-slate-700 bg-slate-900">Totale</th>
                  <th className="w-7 py-2 px-0.5 text-center"></th>
                </tr>
              </thead>

              <tbody>
                {computedRows.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-14 text-center text-slate-400">
                      <div className="max-w-xs mx-auto space-y-2">
                        <Ruler className="w-8 h-8 mx-auto text-slate-300" />
                        <p className="text-xs font-bold text-slate-600">Elenco misure vuoto</p>
                        <p className="text-[11px] leading-relaxed text-slate-400">
                          Premi <strong className="text-emerald-600">+ Nuovo Rigo</strong>, clicca una casella (<strong className="text-amber-600">Lung.</strong> o <strong className="text-amber-600">Larg.</strong>) per evidenziarla e misurala sulla tavola PDF, oppure usa <strong className="text-amber-600">Evidenzia</strong> direttamente sul disegno.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  computedRows.rows.map(({ row, rowNumber, qty }) => {
                    if (row.type === 'subtotal') {
                      return (
                        <tr key={row.id} className="bg-amber-50/90 border-b border-amber-200 font-bold text-amber-900">
                          <td className="border-r border-amber-200 py-1.5 text-center text-[10px]">Σ</td>
                          <td className="border-r border-amber-200"></td>
                          <td colSpan={5} className="px-2 py-1.5 text-[11px] uppercase tracking-wide border-r border-amber-200">
                            SOMMA PARZIALE
                          </td>
                          <td className="px-1.5 py-1.5 text-right font-mono tabular-nums text-xs border-r border-amber-200 bg-amber-100/70">
                            {qty.toFixed(2)}
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              onClick={() => setQueuedRows((prev) => prev.filter((r) => r.id !== row.id))}
                              className="p-1 text-amber-600 hover:text-rose-600"
                              title="Elimina somma parziale"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    const isDeduction = row.type === 'deduction';

                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-slate-200 transition-colors ${
                          isDeduction ? 'bg-rose-50/50 text-rose-800 italic' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="border-r border-slate-200 py-1 px-1 text-center font-mono text-[10px] text-slate-400 tabular-nums">
                          {rowNumber}
                        </td>

                        <td className="border-r border-slate-200 py-1 px-0.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateDraft(row.id, 'type', isDeduction ? 'positive' : 'deduction')
                            }
                            className={`w-5 h-5 rounded text-[11px] font-mono font-bold inline-flex items-center justify-center transition-colors ${
                              isDeduction
                                ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            }`}
                            title={isDeduction ? 'Negativo (-) — clicca per rendere positivo' : 'Positivo (+) — clicca per rendere negativo'}
                          >
                            {isDeduction ? '-' : '+'}
                          </button>
                        </td>

                        {/* DESCRIZIONE (+ badge conversione m -> cm/mm se attiva) */}
                        <td className="border-r border-slate-200 p-0.5">
                          <input
                            ref={(el) => {
                              if (el) rowInputRefs.current.set(`desc_${row.id}`, el);
                              else rowInputRefs.current.delete(`desc_${row.id}`);
                            }}
                            type="text"
                            value={row.description}
                            placeholder="Nome vano / descrizione..."
                            onChange={(e) => handleUpdateDraft(row.id, 'description', e.target.value)}
                            className={`w-full px-1.5 py-1 text-xs rounded focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                              isDeduction ? 'bg-rose-50/40 text-rose-800 italic placeholder:text-rose-300' : 'bg-transparent text-slate-800 font-medium placeholder:text-slate-300'
                            }`}
                          />
                          {row.sourceNote && (exportUnit !== 'm' || row.isDirectArea) && (
                            <div className="px-1.5 pb-0.5 text-[10px] font-mono text-emerald-700 truncate">
                              {row.sourceNote}
                            </div>
                          )}
                        </td>

                        {/* PAR.UG. | LUNG. | LARG. | H/PESO (Salta Par.Ug., avanza automaticamente Lung. -> Larg. -> H/Peso!) */}
                        {(['multiplier', 'length', 'width', 'height'] as TargetNumericField[]).map((field) => (
                          <td key={field} className="border-r border-slate-200 p-0.5">
                            <input
                              ref={(el) => {
                                if (el) rowInputRefs.current.set(`cell_${row.id}_${field}`, el);
                                else rowInputRefs.current.delete(`cell_${row.id}_${field}`);
                              }}
                              type="number"
                              step="0.01"
                              value={row[field] ?? ''}
                              placeholder=""
                              onFocus={() => setActiveCell({ rowId: row.id, field })}
                              onClick={() => setActiveCell({ rowId: row.id, field })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (field === 'multiplier') {
                                    setActiveCell({ rowId: row.id, field: 'length' });
                                    focusCellInput(row.id, 'length');
                                  } else if (
                                    field === 'length' &&
                                    !row.isDirectArea &&
                                    extractionMode !== 'linear' &&
                                    extractionMode !== 'count'
                                  ) {
                                    setActiveCell({ rowId: row.id, field: 'width' });
                                    focusCellInput(row.id, 'width');
                                  } else if (
                                    field === 'width' &&
                                    (extractionMode === 'volume' || extractionMode === 'walls_perim_h')
                                  ) {
                                    setActiveCell({ rowId: row.id, field: 'height' });
                                    focusCellInput(row.id, 'height');
                                  } else {
                                    handleAddEmptyRow('positive', true);
                                  }
                                }
                              }}
                              onChange={(e) => {
                                const raw = e.target.value;
                                handleUpdateDraft(row.id, field, raw === '' ? undefined : parseFloat(raw));
                              }}
                              className={`w-full px-1 py-1 text-right font-mono tabular-nums text-xs rounded border focus:outline-none ${getCellStyleClass(
                                row.id,
                                field,
                                isDeduction
                              )}`}
                              title={`Clicca per evidenziare ${FIELD_LABEL_IT[field]} e ricevere la misura dal Righello o da Clicca Quota`}
                            />
                          </td>
                        ))}

                        {/* TOTALE RIGO */}
                        <td
                          className={`border-r border-slate-200 px-1.5 py-1 text-right font-mono tabular-nums font-bold text-xs ${
                            isDeduction ? 'text-rose-700 bg-rose-50/60' : 'text-blue-900 bg-blue-50/30'
                          }`}
                        >
                          {qty !== 0 ? qty.toFixed(2) : '0,00'}
                        </td>

                        <td className="p-0.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setQueuedRows((prev) => prev.filter((r) => r.id !== row.id));
                              if (row.linkedMarkId) {
                                setMeasuredPolygonsByPage((prev) => ({
                                  ...prev,
                                  [currentPage]: (prev[currentPage] || []).filter((p) => p.id !== row.linkedMarkId),
                                }));
                                setMeasuredLinesByPage((prev) => ({
                                  ...prev,
                                  [currentPage]: (prev[currentPage] || []).filter((l) => l.id !== row.linkedMarkId),
                                }));
                              }
                              if (activeCell?.rowId === row.id) setActiveCell(null);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Elimina rigo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {queuedRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold">
                    <td colSpan={7} className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-slate-600 border-r border-slate-200">
                      SOMMANO {targetArticle?.unit || ''}
                    </td>
                    <td className="px-1.5 py-2 text-right font-mono tabular-nums text-sm font-black text-blue-900 bg-blue-50/70 border-r border-slate-200">
                      {computedRows.grandTotal.toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* 5. FOOTER CONFERMA NEL COMPUTO */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
            <div className="text-[11px] text-slate-500">
              {activeCell ? (
                <span className="text-amber-700 font-semibold">
                  Casella <strong>{FIELD_LABEL_IT[activeCell.field]}</strong> evidenziata · Misura ora sul PDF
                </span>
              ) : (
                <span>Clicca una casella per evidenziarla o usa + Nuovo Rigo</span>
              )}
            </div>

            <button
              type="button"
              disabled={queuedRows.length === 0 || !effectiveTargetId}
              onClick={handleConfirmImport}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap shrink-0"
            >
              <Check className="w-4 h-4" />
              <span>
                Porta {queuedRows.length} {queuedRows.length === 1 ? 'Rigo' : 'Righi'} nel Computo ({computedRows.grandTotal.toFixed(2)} {targetArticle?.unit || ''})
              </span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default PlanMeasureModal;
