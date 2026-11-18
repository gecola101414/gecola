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
} from 'lucide-react';
import { Article } from '../types';
import {
  analyzeHighlightedRegion,
  analyzePdfPlanPage,
  buildMeasurementsFromRoom,
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
}

type ActiveTool = 'highlight' | 'pick' | 'ruler' | 'polygon' | 'calibrate' | 'pan';
type TargetNumericField = 'multiplier' | 'length' | 'width' | 'height';

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
}) => {
  const effectiveTargetId = targetArticleId || articles[0]?.id || '';
  const targetArticle = useMemo(
    () => articles.find((a) => a.id === effectiveTargetId) || articles[0] || null,
    [articles, effectiveTargetId]
  );

  // Stato documento PDF
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageAnalyses, setPageAnalyses] = useState<Record<number, PlanPageAnalysis>>({});
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isDragOverDropzone, setIsDragOverDropzone] = useState(false);

  // Parametri estrazione & scala
  const [quoteUnit, setQuoteUnit] = useState<QuoteUnit>('m');
  const [extractionMode, setExtractionMode] = useState<MeasureExtractionMode>('area_lw');
  const [defaultHeightM, setDefaultHeightM] = useState<number>(3.0);
  const [scaleDenominator, setScaleDenominator] = useState<number>(100);
  const [customMetersPerPt, setCustomMetersPerPt] = useState<number | null>(null);

  // Strumenti CAD viewport
  const [activeTool, setActiveTool] = useState<ActiveTool>('highlight');
  const [zoom, setZoom] = useState<number>(1);
  const [showOverlayTokens, setShowOverlayTokens] = useState<boolean>(true);
  const [osnapEnabled, setOsnapEnabled] = useState<boolean>(true);
  const [cursorPt, setCursorPt] = useState<{ x: number; y: number } | null>(null);
  const [snappedVertex, setSnappedVertex] = useState<SnapVertex | null>(null);

  // Stati interazione attiva su canvas
  const [highlightDrag, setHighlightDrag] = useState<PlanBBox | null>(null);
  const [flashTokenIds, setFlashTokenIds] = useState<Set<string>>(new Set());
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);

  // Quota picker singolo (L + W pairing quando nessuna casella è evidenziata)
  const [pendingLengthPick, setPendingLengthPick] = useState<{ val: number; label: string } | null>(null);

  // Righello & Calibrazione & Poligono
  const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
  const [polygonPts, setPolygonPts] = useState<Array<{ x: number; y: number }>>([]);
  const [calibrationDraft, setCalibrationDraft] = useState<{ distPt: number; realMetersStr: string } | null>(null);

  // Pan & Resizer split
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const panOriginRef = useRef<{ clientX: number; clientY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(570);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const [isRoomsDrawerOpen, setIsRoomsDrawerOpen] = useState<boolean>(false);

  // Coda misure stile Elenco Misure Computo + Casella Evidenziata & Lampeggiamento
  const [queuedRows, setQueuedRows] = useState<QueuedMeasureDraft[]>([]);
  const [activeCell, setActiveCell] = useState<{ rowId: string; field: TargetNumericField } | null>(null);
  const [flashingCell, setFlashingCell] = useState<{ rowId: string; field: TargetNumericField; on: boolean } | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sheetWrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const rowInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Sincronizza modalità predefinita da articolo
  useEffect(() => {
    if (!isOpen || !targetArticle) return;
    setExtractionMode(inferDefaultModeForArticle(targetArticle.unit, targetArticle.description));
  }, [isOpen, targetArticle?.id]);

  // Reset temporanei al cambio pagina
  useEffect(() => {
    setHighlightDrag(null);
    setRulerStart(null);
    setPolygonPts([]);
    setCalibrationDraft(null);
    setPendingLengthPick(null);
    setSnappedVertex(null);
  }, [currentPage]);

  // Cleanup timer lampeggio
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearInterval(flashTimerRef.current);
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

  // Inserisce un valore misurato nella casella evidenziata (activeCell) e lampeggia
  const insertValueIntoActiveCell = useCallback(
    (numericValue: number, sourceLabel?: string) => {
      if (!activeCell) return false;
      const targetRow = queuedRows.find((r) => r.id === activeCell.rowId && r.type !== 'subtotal');
      if (!targetRow) return false;

      const rounded = Math.round(numericValue * 100) / 100;
      const { rowId, field } = activeCell;

      setQueuedRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, [field]: rounded } : r))
      );
      triggerCellBlink(rowId, field);

      // Avanzamento intelligente alla prossima cella vuota dello stesso rigo (es. Lung. -> Larg.)
      if (field === 'length' && targetRow.width === undefined && extractionMode !== 'linear') {
        setActiveCell({ rowId, field: 'width' });
        setLastFeedback(
          `${FIELD_LABEL_IT[field]} = ${rounded.toFixed(2)} inserito${sourceLabel ? ` (${sourceLabel})` : ''} · Prossima casella evidenziata: Larg.`
        );
      } else if (field === 'width' && targetRow.height === undefined && (extractionMode === 'volume' || extractionMode === 'walls_perim_h')) {
        setActiveCell({ rowId, field: 'height' });
        setLastFeedback(
          `${FIELD_LABEL_IT[field]} = ${rounded.toFixed(2)} inserito${sourceLabel ? ` (${sourceLabel})` : ''} · Prossima casella evidenziata: H/Peso`
        );
      } else {
        setActiveCell(null);
        setLastFeedback(
          `${FIELD_LABEL_IT[field]} = ${rounded.toFixed(2)} inserito nella casella evidenziata${sourceLabel ? ` (${sourceLabel})` : ''}`
        );
      }

      return true;
    },
    [activeCell, queuedRows, extractionMode, triggerCellBlink]
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

        if (autoFit && scrollContainerRef.current) {
          const rect = scrollContainerRef.current.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 100) {
            const fitZ = Math.min((rect.width - 32) / analysis.width, (rect.height - 32) / analysis.height);
            setZoom(Math.max(0.35, Math.min(2.8, Math.round(fitZ * 100) / 100)));
          }
        }
        return analysis;
      } catch (err) {
        console.error('Errore analisi pagina planimetria:', err);
        return null;
      }
    },
    [customMetersPerPt]
  );

  // Carica nuovo PDF
  const handleLoadPdfFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setPdfError('Seleziona un file .PDF contenente una tavola planimetrica.');
        return;
      }
      setIsLoadingPdf(true);
      setPdfError(null);
      setPageAnalyses({});
      setCustomMetersPerPt(null);
      setLastFeedback(null);

      try {
        const doc = await loadPdfPlanDocument(file);
        setPdfDoc(doc);
        setPdfFileName(file.name);
        setNumPages(doc.numPages);

        const initialScanCount = Math.min(doc.numPages, 8);
        let firstRichPage = 1;
        let foundRich = false;

        for (let p = 1; p <= initialScanCount; p++) {
          const analysis = await analyzePdfPlanPage(doc, p, quoteUnit);
          setPageAnalyses((prev) => ({ ...prev, [p]: analysis }));
          if (analysis.detectedHeightM && analysis.detectedHeightM > 0) {
            setDefaultHeightM(analysis.detectedHeightM);
          }
          if (analysis.detectedScaleDenominator) {
            setScaleDenominator(analysis.detectedScaleDenominator);
          }
          if (!foundRich && (analysis.rooms.length > 0 || analysis.tokens.length > 5)) {
            firstRichPage = p;
            foundRich = true;
          }
        }

        setCurrentPage(firstRichPage);
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            setPageAnalyses((prev) => {
              const targetA = prev[firstRichPage];
              if (targetA && scrollContainerRef.current) {
                const rect = scrollContainerRef.current.getBoundingClientRect();
                if (rect.width > 100 && rect.height > 100) {
                  const fitZ = Math.min((rect.width - 32) / targetA.width, (rect.height - 32) / targetA.height);
                  setZoom(Math.max(0.35, Math.min(2.8, Math.round(fitZ * 100) / 100)));
                }
              }
              return prev;
            });
          }
        });
      } catch (err: any) {
        console.error('Errore apertura PDF:', err);
        setPdfError(err?.message || 'Impossibile aprire il documento PDF.');
      } finally {
        setIsLoadingPdf(false);
      }
    },
    [quoteUnit]
  );

  // Rianalizza pagina al cambio unità (m/cm/mm)
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const analyzed = await analyzePdfPlanPage(pdfDoc, currentPage, quoteUnit);
      if (!cancelled) {
        setPageAnalyses((prev) => ({ ...prev, [currentPage]: analyzed }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage, quoteUnit]);

  // Render pagina su canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !isOpen) return;
    let cancelled = false;

    const renderPage = async () => {
      setIsRenderingPage(true);
      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
        }

        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const renderScale = Math.min(3.5, zoom * dpr);
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('Render page warning:', err);
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
  }, [pdfDoc, currentPage, zoom, isOpen]);

  // Scorciatoie tastiera
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      const isInput = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT';

      if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        setIsSpacePressed(true);
      } else if (e.key === 'Escape') {
        if (highlightDrag) {
          setHighlightDrag(null);
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
        setQueuedRows((prev) => prev.slice(0, -1));
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isOpen, highlightDrag, rulerStart, polygonPts.length, calibrationDraft, activeCell, onClose]);

  const handleFitToViewport = useCallback(() => {
    if (!currentAnalysis || !scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    if (rect.width <= 100 || rect.height <= 100) return;
    const fitZ = Math.min((rect.width - 32) / currentAnalysis.width, (rect.height - 32) / currentAnalysis.height);
    setZoom(Math.max(0.35, Math.min(2.8, Math.round(fitZ * 100) / 100)));
  }, [currentAnalysis]);

  const appendDrafts = useCallback(
    (drafts: QueuedMeasureDraft[], flashIds?: string[], feedback?: string) => {
      if (drafts.length === 0) return;
      setQueuedRows((prev) => [...prev, ...drafts]);

      // Lampeggia il primo campo numerico valorizzato dell'ultimo rigo aggiunto
      const last = drafts[drafts.length - 1];
      if (last.type !== 'subtotal') {
        const blinkField: TargetNumericField =
          last.length !== undefined
            ? 'length'
            : last.width !== undefined
            ? 'width'
            : last.height !== undefined
            ? 'height'
            : 'multiplier';
        triggerCellBlink(last.id, blinkField);
      }

      if (flashIds && flashIds.length > 0) {
        setFlashTokenIds(new Set(flashIds));
        setTimeout(() => setFlashTokenIds(new Set()), 1100);
      }
      if (feedback) {
        setLastFeedback(feedback);
      }
    },
    [triggerCellBlink]
  );

  // Aggiunge un nuovo rigo vuoto pronto per scrivere a mano o misurare con casella evidenziata
  const handleAddEmptyRow = useCallback(
    (type: 'positive' | 'deduction' = 'positive') => {
      const id = uid();
      const newRow: QueuedMeasureDraft = {
        id,
        description: type === 'deduction' ? 'A detrarre ' : '',
        type,
      };
      setQueuedRows((prev) => [...prev, newRow]);
      setActiveCell({ rowId: id, field: 'length' });
      requestAnimationFrame(() => {
        const descInput = rowInputRefs.current.get(`desc_${id}`);
        if (descInput) {
          descInput.focus();
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
        insertValueIntoActiveCell(token.numericValue, `Quota ${token.str}`);
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
        appendDrafts(rows, [token.id], `Estratta superficie ${token.str}`);
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

  // Finalizza poligono CAD
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

      // Se c'è una casella attiva, inserisce l'area o il perimetro a seconda della modalità
      if (activeCell) {
        const valToInsert = extractionMode === 'linear' || extractionMode === 'walls_perim_h' ? perimM : areaM2;
        setPolygonPts([]);
        insertValueIntoActiveCell(valToInsert, 'Poligono CAD');
        return;
      }

      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      let roomName = 'Poligono da tavola';
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

      const rows = buildMeasurementsFromRoom(roomName, {
        areaMq: areaM2,
        perimeterM: perimM,
        mode: extractionMode === 'area_lw' ? 'area_lw' : extractionMode,
        defaultHeightM,
        sourceNote: `Poligono ${pts.length} vertici`,
      });
      setPolygonPts([]);
      appendDrafts(rows, undefined, `Poligono ${roomName}: ${areaM2.toFixed(2)} m² · Perim. ${perimM.toFixed(2)} m`);
    },
    [metersPerPt, activeCell, insertValueIntoActiveCell, currentAnalysis, extractionMode, defaultHeightM, appendDrafts]
  );

  // Eventi Mouse sul Canvas PDF
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!currentAnalysis) return;

    if (e.button === 1 || isSpacePressed || activeTool === 'pan') {
      e.preventDefault();
      if (!scrollContainerRef.current) return;
      setIsPanning(true);
      panOriginRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        scrollLeft: scrollContainerRef.current.scrollLeft,
        scrollTop: scrollContainerRef.current.scrollTop,
      };
      return;
    }

    if (e.button !== 0) return;

    const useSnap = activeTool === 'ruler' || activeTool === 'polygon' || activeTool === 'calibrate';
    const { pt } = getPdfCoords(e.clientX, e.clientY, useSnap);

    if (activeTool === 'highlight') {
      setHighlightDrag({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
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
        setRulerStart(null);
        if (distM > 0.01) {
          // Priorità assoluta: se c'è una casella evidenziata nel computo, inserisci dentro e lampeggia!
          if (insertValueIntoActiveCell(distM, 'Righello')) {
            return;
          }
          // Altrimenti crea un nuovo rigo con Parti Uguali saltato e Lunghezza valorizzata (e pre-seleziona Larghezza!)
          const newId = uid();
          const newDraft: QueuedMeasureDraft = {
            id: newId,
            description: 'Misura da righello',
            type: 'positive',
            multiplier: undefined,
            length: distM,
            height: extractionMode === 'walls_perim_h' || extractionMode === 'volume' ? defaultHeightM : undefined,
          };
          setQueuedRows((prev) => [...prev, newDraft]);
          triggerCellBlink(newId, 'length');
          if (extractionMode !== 'linear') {
            setActiveCell({ rowId: newId, field: 'width' });
            setLastFeedback(`Misurato ${distM.toFixed(2)} m in Lung. · Casella Larg. pronta per la seconda misura`);
          } else {
            setLastFeedback(`Misurato ${distM.toFixed(2)} m`);
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
    if (isPanning && panOriginRef.current && scrollContainerRef.current) {
      const dx = e.clientX - panOriginRef.current.clientX;
      const dy = e.clientY - panOriginRef.current.clientY;
      scrollContainerRef.current.scrollLeft = panOriginRef.current.scrollLeft - dx;
      scrollContainerRef.current.scrollTop = panOriginRef.current.scrollTop - dy;
      return;
    }

    const useSnap = activeTool === 'ruler' || activeTool === 'polygon' || activeTool === 'calibrate';
    const { pt, snap } = getPdfCoords(e.clientX, e.clientY, useSnap);
    setCursorPt(pt);
    setSnappedVertex(snap);

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

    if (activeTool === 'highlight' && highlightDrag && currentAnalysis) {
      const w = Math.abs(highlightDrag.x2 - highlightDrag.x1);
      const h = Math.abs(highlightDrag.y2 - highlightDrag.y1);
      const box = highlightDrag;
      setHighlightDrag(null);

      // Clic rapido (< 5pt): seleziona eventuale quota/vano sotto al cursore
      if (w < 5 && h < 5) {
        const cx = (box.x1 + box.x2) / 2;
        const cy = (box.y1 + box.y2) / 2;
        const hit = currentAnalysis.tokens.find(
          (t) =>
            t.kind !== 'other' &&
            t.kind !== 'scale' &&
            cx >= t.bbox.x1 - 3 &&
            cx <= t.bbox.x2 + 3 &&
            cy >= t.bbox.y1 - 3 &&
            cy <= t.bbox.y2 + 3
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
        insertValueIntoActiveCell(numericMatches[0].numericValue, `Evidenziato ${numericMatches[0].str}`);
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

  const handleWheelZoom = (e: React.WheelEvent) => {
    if (!pdfDoc) return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(0.35, Math.min(3.5, Math.round(z * factor * 100) / 100)));
  };

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
    const cloned: QueuedMeasureDraft = { ...refRow, id: uid() };
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
    setCalibrationDraft(null);
    setLastFeedback(`Scala calibrata: ${meters.toFixed(2)} m (~1:${derivedDenom})`);
    setActiveTool('ruler');
  };

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

  if (!isOpen) return null;

  const liveRulerMeters =
    rulerStart && cursorPt
      ? Math.round(Math.hypot(cursorPt.x - rulerStart.x, cursorPt.y - rulerStart.y) * metersPerPt * 100) / 100
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
            <span>{pdfDoc ? 'Cambia PDF' : 'Apri Tavola PDF'}</span>
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

      {/* WORKSPACE A TUTTO SCHERMO: TAVOLA PDF (SINISTRA) + ELENCO MISURE COMPUTO (DESTRA) */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* AREA TAVOLA PDF */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-900 relative">
          {/* TOOLBAR CAD */}
          {pdfDoc && (
            <div className="bg-slate-800/95 border-b border-slate-700/80 px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap shrink-0">
              <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setActiveTool('highlight')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
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
                  onClick={() => setActiveTool('pick')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    activeTool === 'pick'
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Clicca una singola quota (la inserisce nella casella evidenziata se attiva!)"
                >
                  <MousePointerClick className="w-3.5 h-3.5" />
                  <span>Clicca Quota</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool('ruler');
                    setRulerStart(null);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
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
                    setActiveTool('polygon');
                    setPolygonPts([]);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    activeTool === 'polygon'
                      ? 'bg-indigo-500 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Traccia un poligono sui vertici del vano"
                >
                  <Pentagon className="w-3.5 h-3.5" />
                  <span>Poligono</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool('calibrate');
                    setRulerStart(null);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    activeTool === 'calibrate'
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Calibra la scala cliccando 2 punti di una misura nota"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Calibra</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTool('pan')}
                  className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                    activeTool === 'pan' ? 'bg-slate-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Sposta la tavola (oppure tieni premuto Spazio)"
                >
                  <Hand className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Controlli Overlay, OSNAP, Unità Quote & Zoom */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowOverlayTokens((v) => !v)}
                  className={`px-2 py-1 rounded-md text-xs font-medium border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                    showOverlayTokens
                      ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {showOverlayTokens ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>Rilevamenti</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOsnapEnabled((v) => !v)}
                  className={`px-2 py-1 rounded-md text-xs font-medium border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                    osnapEnabled
                      ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                  title="Snap magnetico ai vertici del disegno PDF"
                >
                  <Magnet className="w-3.5 h-3.5" />
                  <span>Snap</span>
                </button>

                <div className="flex items-center bg-slate-900 rounded-md border border-slate-700 p-0.5 text-[11px]">
                  {(['m', 'cm', 'mm'] as QuoteUnit[]).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setQuoteUnit(u)}
                      className={`px-1.5 py-0.5 rounded font-mono font-semibold transition-colors ${
                        quoteUnit === u ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>

                <div className="flex items-center bg-slate-900 rounded-md border border-slate-700 p-0.5">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.35, Math.round((z - 0.2) * 100) / 100))}
                    className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800"
                    title="Zoom Indietro"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 text-[11px] font-mono tabular-nums text-slate-200 min-w-[46px] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(3.5, Math.round((z + 0.2) * 100) / 100))}
                    className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800"
                    title="Zoom Avanti"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleFitToViewport}
                    className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800 border-l border-slate-700 ml-0.5 pl-1.5"
                    title="Adatta tavola"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* BARRA CONTESTUALE ATTIVA (Casella Evidenziata / Calibrazione / Poligono / Feedback) */}
          {pdfDoc && (calibrationDraft || polygonPts.length > 0 || pendingLengthPick || activeCell || lastFeedback) && (
            <div className="bg-slate-950/90 border-b border-slate-800 px-3 py-1.5 flex items-center justify-between gap-3 text-xs shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 text-slate-200 flex-wrap">
                {calibrationDraft ? (
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

          {/* VIEWPORT PDF */}
          <div
            ref={scrollContainerRef}
            onWheel={handleWheelZoom}
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
            className={`flex-1 overflow-auto relative flex items-start justify-center p-4 select-none ${
              isPanning || isSpacePressed || activeTool === 'pan'
                ? isPanning
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : activeTool === 'highlight' || activeTool === 'ruler' || activeTool === 'polygon' || activeTool === 'calibrate'
                ? 'cursor-crosshair'
                : 'cursor-default'
            }`}
          >
            {isLoadingPdf ? (
              <div className="m-auto flex flex-col items-center gap-3 text-slate-200">
                <div className="w-12 h-12 border-4 border-slate-700 border-t-amber-400 rounded-full animate-spin" />
                <p className="text-sm font-semibold">Decodifica tavola PDF, quote e vettori CAD in corso...</p>
              </div>
            ) : !pdfDoc ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`m-auto max-w-xl w-full border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
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
                  Scorri le planimetrie, evidenzia un vano o le quote, oppure evidenzia una casella nella tabella computo a destra e prendi la misura direttamente col <span className="text-emerald-300 font-semibold">Righello</span> sulla tavola — senza AutoCAD.
                </p>
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors">
                  <Upload className="w-4 h-4" />
                  Seleziona PDF Planimetria
                </span>
                {pdfError && <p className="mt-4 text-xs text-rose-400 font-medium">{pdfError}</p>}
              </div>
            ) : (
              <div
                ref={sheetWrapperRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onDoubleClick={() => {
                  if (activeTool === 'polygon' && polygonPts.length >= 3) {
                    finalizePolygon(polygonPts);
                  }
                }}
                style={{
                  width: currentAnalysis ? currentAnalysis.width * zoom : undefined,
                  height: currentAnalysis ? currentAnalysis.height * zoom : undefined,
                }}
                className="relative bg-white shadow-[0_20px_60px_rgba(0,0,0,0.65)] shrink-0 ring-1 ring-white/10"
              >
                <canvas ref={canvasRef} className="block" />

                {isRenderingPage && (
                  <div className="absolute top-2 right-2 bg-slate-900/80 text-white text-[10px] px-2 py-1 rounded font-medium pointer-events-none">
                    Rendering...
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
                        const fill = isFlashed
                          ? 'rgba(245, 158, 11, 0.55)'
                          : tok.kind === 'surface'
                          ? 'rgba(16, 185, 129, 0.16)'
                          : tok.kind === 'perimeter'
                          ? 'rgba(245, 158, 11, 0.16)'
                          : tok.kind === 'dimension'
                          ? 'rgba(6, 182, 212, 0.14)'
                          : tok.kind === 'room'
                          ? 'rgba(99, 102, 241, 0.13)'
                          : 'rgba(148, 163, 184, 0.15)';
                        const stroke = isFlashed
                          ? '#f59e0b'
                          : tok.kind === 'surface'
                          ? 'rgba(16, 185, 129, 0.65)'
                          : tok.kind === 'perimeter'
                          ? 'rgba(245, 158, 11, 0.65)'
                          : tok.kind === 'dimension'
                          ? 'rgba(6, 182, 212, 0.55)'
                          : tok.kind === 'room'
                          ? 'rgba(99, 102, 241, 0.55)'
                          : 'rgba(148, 163, 184, 0.5)';

                        return (
                          <rect
                            key={tok.id}
                            x={tok.bbox.x1}
                            y={tok.bbox.y1}
                            width={tok.bbox.x2 - tok.bbox.x1}
                            height={tok.bbox.y2 - tok.bbox.y1}
                            rx={1.5}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={isFlashed ? 1.5 : 0.7}
                            className={activeTool === 'pick' ? 'pointer-events-auto cursor-pointer hover:opacity-90' : ''}
                            onClick={(ev) => {
                              if (activeTool === 'pick') {
                                ev.stopPropagation();
                                handlePickToken(tok);
                              }
                            }}
                          >
                            <title>
                              {tok.str}
                              {tok.numericValue !== undefined ? ` (${tok.numericValue})` : ''}
                            </title>
                          </rect>
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
                        <g transform={`translate(${(rulerStart.x + cursorPt.x) / 2}, ${(rulerStart.y + cursorPt.y) / 2 - 8 / zoom})`}>
                          <rect x={-26 / zoom} y={-10 / zoom} width={52 / zoom} height={14 / zoom} rx={3 / zoom} fill="#0f172a" opacity={0.9} />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            y={-3 / zoom}
                            fill="#ffffff"
                            fontSize={9 / zoom}
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {liveRulerMeters.toFixed(2)} m
                          </text>
                        </g>
                      </g>
                    )}

                    {polygonPts.length > 0 && (
                      <g>
                        <polygon
                          points={[...polygonPts, ...(cursorPt ? [cursorPt] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
                          fill="rgba(79, 70, 229, 0.18)"
                          stroke="#4f46e5"
                          strokeWidth={1.6 / zoom}
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
                  </svg>
                )}
              </div>
            )}
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
                          {pa.isLikelyScanned ? '(Cop.)' : roomCount > 0 ? `(${roomCount} vani)` : ''}
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

                        {/* DESCRIZIONE */}
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
                        </td>

                        {/* PAR.UG. | LUNG. | LARG. | H/PESO (Clicca per evidenziare come target misura!) */}
                        {(['multiplier', 'length', 'width', 'height'] as TargetNumericField[]).map((field) => (
                          <td key={field} className="border-r border-slate-200 p-0.5">
                            <input
                              type="number"
                              step="0.01"
                              value={row[field] ?? ''}
                              placeholder=""
                              onFocus={() => setActiveCell({ rowId: row.id, field })}
                              onClick={() => setActiveCell({ rowId: row.id, field })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddEmptyRow('positive');
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
