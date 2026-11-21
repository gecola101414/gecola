import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Check,
  ChevronDown,
  Crop,
  Cuboid,
  Eraser,
  Eye,
  Grid,
  Maximize2,
  Minus,
  PenLine,
  RotateCcw,
  Sparkles,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { extractCanvasLumaGrid, PlanLumaGrid } from '../utils/planLaserRaycaster';
import {
  buildWallsOnlyFilterCanvas,
  WallsOnlyFilterStrength,
} from '../utils/planCleanGeometry';
import { PlanBimModel } from '../utils/planBimExtractor';

type CleanTool = 'eraser' | 'rect_erase' | 'crop_keep' | 'draw_wall' | 'restore';
type OpenCleanMenu = 'auto' | 'view' | null;

interface PlanClean2DEditorProps {
  /** Current effective clean canvas (either auto-cleaned or manually edited) */
  workingCanvas: HTMLCanvasElement | null;
  /** Initial auto-cleaned canvas (without quotes/text) for quick reset */
  autoCleanedCanvas: HTMLCanvasElement | null;
  /** Original rendered PDF canvas (used by Restore brush and ghost underlay) */
  originalPdfCanvas: HTMLCanvasElement | null;
  pageWidthPt: number;
  pageHeightPt: number;
  metersPerPt: number;
  /** Current live BIM model extracted from the cleaned plan (for real-time wall overlay preview) */
  bimModel: PlanBimModel;
  /** Called whenever user commits a cleanup edit or filter */
  onCommitCleanCanvas: (canvas: HTMLCanvasElement, grid: PlanLumaGrid) => void;
  /** Called when user resets back to automatic clean plan */
  onResetToAutoClean: () => void;
  /** Jump directly to 3D or BIM view */
  onGoToMode: (mode: '3d' | 'bim') => void;
  hasManualEdits: boolean;
}

const BRUSH_PRESETS = [
  { id: 's', label: 'S', eraserPx: 14, wallPx: 6 },
  { id: 'm', label: 'M', eraserPx: 28, wallPx: 11 },
  { id: 'l', label: 'L', eraserPx: 54, wallPx: 16 },
  { id: 'xl', label: 'XL', eraserPx: 96, wallPx: 22 },
] as const;

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0);
  }
  return c;
}

export const PlanClean2DEditor: React.FC<PlanClean2DEditorProps> = ({
  workingCanvas,
  autoCleanedCanvas,
  originalPdfCanvas,
  pageWidthPt,
  pageHeightPt,
  metersPerPt,
  bimModel,
  onCommitCleanCanvas,
  onResetToAutoClean,
  onGoToMode,
  hasManualEdits,
}) => {
  const [tool, setTool] = useState<CleanTool>('eraser');
  const [brushPresetId, setBrushPresetId] = useState<'s' | 'm' | 'l' | 'xl'>('m');
  const [openMenu, setOpenMenu] = useState<OpenCleanMenu>(null);
  const [showBimWallsPreview, setShowBimWallsPreview] = useState<boolean>(true);
  const [showOriginalGhost, setShowOriginalGhost] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [isShiftPressed, setIsShiftPressed] = useState<boolean>(false);
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [undoCount, setUndoCount] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>(
    'Pulisci arredi, quote residue o cartigli: tutto ciò che lasci nero diventa subito 3D e BIM'
  );

  // Interactive cursor & shape preview in canvas pixel coordinates
  const [cursorPx, setCursorPx] = useState<{ x: number; y: number } | null>(null);
  const [dragBox, setDragBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [wallLineDrag, setWallLineDrag] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const menuBarRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const ghostCanvasRef = useRef<HTMLCanvasElement>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const isDrawingRef = useRef<boolean>(false);
  const lastDrawPtRef = useRef<{ x: number; y: number } | null>(null);
  const panOriginRef = useRef<{
    clientX: number;
    clientY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const hasAutoFittedRef = useRef<boolean>(false);
  const lastWorkingIdentityRef = useRef<HTMLCanvasElement | null>(null);

  const activePreset = BRUSH_PRESETS.find((p) => p.id === brushPresetId) || BRUSH_PRESETS[1];

  // Close dropdown menus on outside click or Escape
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  // Sync incoming workingCanvas onto the interactive display canvas
  useEffect(() => {
    const dest = displayCanvasRef.current;
    if (!dest || !workingCanvas) return;
    if (lastWorkingIdentityRef.current === workingCanvas && dest.width === workingCanvas.width && dest.height === workingCanvas.height) {
      return;
    }
    lastWorkingIdentityRef.current = workingCanvas;
    dest.width = workingCanvas.width;
    dest.height = workingCanvas.height;
    const ctx = dest.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, dest.width, dest.height);
      ctx.drawImage(workingCanvas, 0, 0);
    }
  }, [workingCanvas]);

  // Draw optional ghost underlay of original PDF
  useEffect(() => {
    const ghost = ghostCanvasRef.current;
    if (!ghost || !originalPdfCanvas || !showOriginalGhost) return;
    ghost.width = originalPdfCanvas.width;
    ghost.height = originalPdfCanvas.height;
    const ctx = ghost.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, ghost.width, ghost.height);
      ctx.drawImage(originalPdfCanvas, 0, 0);
    }
  }, [originalPdfCanvas, showOriginalGhost]);

  // Fit-to-viewport helper
  const handleFit = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || pageWidthPt <= 0 || pageHeightPt <= 0) return;
    const pad = 36;
    const availW = Math.max(200, container.clientWidth - pad);
    const availH = Math.max(200, container.clientHeight - pad);
    const z = Math.min(availW / pageWidthPt, availH / pageHeightPt, 2.2);
    setZoom(Math.max(0.3, Math.round(z * 100) / 100));
  }, [pageWidthPt, pageHeightPt]);

  useEffect(() => {
    if (!hasAutoFittedRef.current && pageWidthPt > 0 && pageHeightPt > 0) {
      hasAutoFittedRef.current = true;
      handleFit();
    }
  }, [pageWidthPt, pageHeightPt, handleFit]);

  // Native non-passive CAD wheel zoom toward cursor
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;
      const contentX = container.scrollLeft + pointerX;
      const contentY = container.scrollTop + pointerY;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;

      setZoom((prev) => {
        const next = Math.max(0.3, Math.min(4.0, Math.round(prev * factor * 100) / 100));
        if (next === prev) return prev;
        const ratio = next / prev;
        requestAnimationFrame(() => {
          container.scrollLeft = Math.max(0, contentX * ratio - pointerX);
          container.scrollTop = Math.max(0, contentY * ratio - pointerY);
        });
        return next;
      });
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // Push current canvas snapshot onto undo stack before mutating
  const pushUndoSnapshot = useCallback(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current.push(snap);
    if (undoStackRef.current.length > 18) {
      undoStackRef.current.shift();
    }
    setUndoCount(undoStackRef.current.length);
  }, []);

  // Commit current display canvas back to parent so 3D & BIM rebuild immediately
  const commitCurrentCanvas = useCallback(
    (msg?: string) => {
      const canvas = displayCanvasRef.current;
      if (!canvas) return;
      const cloned = cloneCanvas(canvas);
      const grid = extractCanvasLumaGrid(cloned, pageWidthPt, pageHeightPt);
      if (!grid) return;
      lastWorkingIdentityRef.current = cloned;
      onCommitCleanCanvas(cloned, grid);
      if (msg) setStatusMessage(msg);
    },
    [onCommitCleanCanvas, pageWidthPt, pageHeightPt]
  );

  // Undo handler (Ctrl+Z)
  const handleUndo = useCallback(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas || undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop();
    setUndoCount(undoStackRef.current.length);
    if (!prev) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.putImageData(prev, 0, 0);
    commitCurrentCanvas('Ultima modifica annullata · 3D e BIM aggiornati');
  }, [commitCurrentCanvas]);

  // Keyboard shortcuts (Shift ortho unlock, Space pan, Ctrl+Z undo)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true);
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false);
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
        panOriginRef.current = null;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleUndo]);

  // Convert pointer event to canvas pixel coordinates
  const getCanvasPx = useCallback((e: React.MouseEvent | MouseEvent): { x: number; y: number } | null => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y)),
    };
  }, []);

  // Brush stroke helper (eraser or restore)
  const paintBrushSegment = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }, mode: 'eraser' | 'restore') => {
      const canvas = displayCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Scale preset nicely relative to canvas resolution (~1400px nominal)
      const resFactor = Math.max(0.75, Math.min(2.2, Math.max(canvas.width, canvas.height) / 1400));
      const radius = Math.max(4, Math.round(activePreset.eraserPx * 0.5 * resFactor));

      if (mode === 'eraser') {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = radius * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(to.x, to.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (mode === 'restore' && originalPdfCanvas) {
        ctx.save();
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const steps = Math.max(1, Math.ceil(dist / Math.max(2, radius * 0.35)));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const cx = from.x + (to.x - from.x) * t;
          const cy = from.y + (to.y - from.y) * t;
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(originalPdfCanvas, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
        ctx.restore();
      }
    },
    [activePreset.eraserPx, originalPdfCanvas]
  );

  // Automatic "Solo Pareti" filter action
  const handleRunAutoWallsFilter = useCallback(
    (strength: WallsOnlyFilterStrength) => {
      const canvas = displayCanvasRef.current;
      if (!canvas) return;
      pushUndoSnapshot();
      const filtered = buildWallsOnlyFilterCanvas(canvas, pageWidthPt, pageHeightPt, metersPerPt, strength);
      if (!filtered) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(filtered.canvas, 0, 0);
      }
      lastWorkingIdentityRef.current = filtered.canvas;
      onCommitCleanCanvas(filtered.canvas, filtered.grid);
      setOpenMenu(null);
      const label = strength === 'soft' ? 'Leggero' : strength === 'standard' ? 'Standard' : 'Forte';
      setStatusMessage(`Filtro Solo Pareti (${label}) applicato · Modello 3D/BIM aggiornato automaticamente`);
    },
    [metersPerPt, onCommitCleanCanvas, pageHeightPt, pageWidthPt, pushUndoSnapshot]
  );

  // Restore original full PDF into editor (so user can manually clean from scratch)
  const handleLoadOriginalIntoEditor = useCallback(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas || !originalPdfCanvas) return;
    pushUndoSnapshot();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalPdfCanvas, 0, 0, canvas.width, canvas.height);
    setOpenMenu(null);
    commitCurrentCanvas('Tavola PDF originale caricata per pulizia manuale');
  }, [commitCurrentCanvas, originalPdfCanvas, pushUndoSnapshot]);

  // Reset to initial auto-cleaned canvas (without quotes/texts)
  const handleResetBaseClean = useCallback(() => {
    const canvas = displayCanvasRef.current;
    if (canvas && autoCleanedCanvas) {
      pushUndoSnapshot();
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(autoCleanedCanvas, 0, 0, canvas.width, canvas.height);
      }
    }
    setOpenMenu(null);
    onResetToAutoClean();
    setStatusMessage('Ripristinata la pulizia automatica base (senza scritte e righe di quota)');
  }, [autoCleanedCanvas, onResetToAutoClean, pushUndoSnapshot]);

  // Mouse handlers on canvas stage
  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle mouse button or Space+Left -> standard CAD Pan
    if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
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
    const pt = getCanvasPx(e);
    if (!pt) return;

    if (tool === 'eraser' || tool === 'restore') {
      pushUndoSnapshot();
      isDrawingRef.current = true;
      lastDrawPtRef.current = pt;
      paintBrushSegment(pt, pt, tool);
    } else if (tool === 'rect_erase' || tool === 'crop_keep') {
      setDragBox({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
    } else if (tool === 'draw_wall') {
      setWallLineDrag({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && panOriginRef.current && scrollContainerRef.current) {
      const dx = e.clientX - panOriginRef.current.clientX;
      const dy = e.clientY - panOriginRef.current.clientY;
      scrollContainerRef.current.scrollLeft = panOriginRef.current.scrollLeft - dx;
      scrollContainerRef.current.scrollTop = panOriginRef.current.scrollTop - dy;
      return;
    }

    const pt = getCanvasPx(e);
    setCursorPx(pt);
    if (!pt) return;

    if (isDrawingRef.current && (tool === 'eraser' || tool === 'restore')) {
      const prev = lastDrawPtRef.current || pt;
      paintBrushSegment(prev, pt, tool);
      lastDrawPtRef.current = pt;
    } else if (dragBox) {
      setDragBox((b) => (b ? { ...b, x2: pt.x, y2: pt.y } : null));
    } else if (wallLineDrag) {
      let x2 = pt.x;
      let y2 = pt.y;
      // Default ortho lock 0°/90° unless Shift is held
      if (!isShiftPressed) {
        if (Math.abs(x2 - wallLineDrag.x1) >= Math.abs(y2 - wallLineDrag.y1)) {
          y2 = wallLineDrag.y1;
        } else {
          x2 = wallLineDrag.x1;
        }
      }
      setWallLineDrag((l) => (l ? { ...l, x2, y2 } : null));
    }
  };

  const finishInteraction = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panOriginRef.current = null;
      return;
    }

    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      lastDrawPtRef.current = null;
      commitCurrentCanvas(
        tool === 'eraser'
          ? 'Area pulita · Modello 3D e BIM aggiornati in tempo reale'
          : 'Porzione ripristinata dal PDF originale · 3D e BIM aggiornati'
      );
      return;
    }

    const canvas = displayCanvasRef.current;
    if (dragBox && canvas) {
      const x1 = Math.min(dragBox.x1, dragBox.x2);
      const y1 = Math.min(dragBox.y1, dragBox.y2);
      const x2 = Math.max(dragBox.x1, dragBox.x2);
      const y2 = Math.max(dragBox.y1, dragBox.y2);
      setDragBox(null);

      if (x2 - x1 > 4 && y2 - y1 > 4) {
        pushUndoSnapshot();
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          if (tool === 'rect_erase') {
            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
            commitCurrentCanvas('Rettangolo cancellato · 3D e BIM aggiornati');
          } else if (tool === 'crop_keep') {
            // Wipe all 4 bands outside the selected rectangle
            ctx.fillRect(0, 0, canvas.width, y1);
            ctx.fillRect(0, y2, canvas.width, canvas.height - y2);
            ctx.fillRect(0, y1, x1, y2 - y1);
            ctx.fillRect(x2, y1, canvas.width - x2, y2 - y1);
            commitCurrentCanvas('Pianta ritagliata: eliminato tutto il resto fuori area · 3D e BIM pronti!');
          }
        }
      }
      return;
    }

    if (wallLineDrag && canvas) {
      const { x1, y1, x2, y2 } = wallLineDrag;
      setWallLineDrag(null);
      if (Math.hypot(x2 - x1, y2 - y1) > 4) {
        pushUndoSnapshot();
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          const resFactor = Math.max(0.75, Math.min(2.2, Math.max(canvas.width, canvas.height) / 1400));
          const wallPx = Math.max(4, Math.round(activePreset.wallPx * resFactor));
          ctx.save();
          ctx.strokeStyle = '#181c24';
          ctx.lineWidth = wallPx;
          ctx.lineCap = 'square';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.restore();
          commitCurrentCanvas('Parete aggiunta sul 2D Pulito · 3D e BIM aggiornati');
        }
      }
    }
  }, [activePreset.wallPx, commitCurrentCanvas, dragBox, isPanning, pushUndoSnapshot, tool, wallLineDrag]);

  const canvasW = workingCanvas?.width || 1;
  const canvasH = workingCanvas?.height || 1;
  const displayW = Math.max(100, Math.round(pageWidthPt * zoom));
  const displayH = Math.max(100, Math.round(pageHeightPt * zoom));

  const resFactor = Math.max(0.75, Math.min(2.2, Math.max(canvasW, canvasH) / 1400));
  const cursorRadiusDisplay =
    tool === 'eraser' || tool === 'restore'
      ? Math.max(4, (activePreset.eraserPx * 0.5 * resFactor * displayW) / canvasW)
      : 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-950 select-none overflow-hidden">
      {/* BARRA MENU STILE AUTOCAD IN ALTO — ZERO MENU FLUTTUANTI SUL DISEGNO */}
      <div
        ref={menuBarRef}
        className="relative z-30 bg-slate-900 border-b border-slate-700/80 px-2.5 py-1 flex items-center justify-between gap-2 flex-wrap shrink-0"
      >
        {/* SINISTRA: STRUMENTI PULIZIA MANUALE + SPESSORE + MENU A TENDINA */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-md border border-slate-800">
            <button
              type="button"
              onClick={() => setTool('eraser')}
              className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                tool === 'eraser'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Gomma manuale: cancella a mano libera linee, arredi, quote o scritte residue"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Gomma</span>
            </button>
            <button
              type="button"
              onClick={() => setTool('rect_erase')}
              className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                tool === 'rect_erase'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Cancella Rettangolo: trascina un box bianco per pulire intere zone in un colpo"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Box Cancella</span>
            </button>
            <button
              type="button"
              onClick={() => setTool('crop_keep')}
              className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                tool === 'crop_keep'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-amber-300 hover:text-white hover:bg-amber-950/60'
              }`}
              title="Ritaglia Area: seleziona la pianta da tenere e cancella TUTTO ciò che è fuori (cartigli, note, legende)"
            >
              <Crop className="w-3.5 h-3.5" />
              <span>Ritaglia Pianta</span>
            </button>
            <button
              type="button"
              onClick={() => setTool('draw_wall')}
              className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                tool === 'draw_wall'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Traccia Muro: chiudi o rinforza pareti (blocco ortogonale 0°/90°, Shift per obliquo)"
            >
              <PenLine className="w-3.5 h-3.5" />
              <span>Traccia Muro</span>
            </button>
            <button
              type="button"
              onClick={() => setTool('restore')}
              className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                tool === 'restore'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Pennello Ripristina: recupera tratti originali dal PDF se hai cancellato una parete per errore"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Ripristina</span>
            </button>
          </div>

          {/* DIMENSIONE PENNELLO / MURO */}
          {(tool === 'eraser' || tool === 'restore' || tool === 'draw_wall') && (
            <div
              className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-md border border-slate-800 text-[10px]"
              title={tool === 'draw_wall' ? 'Spessore parete tracciata' : 'Dimensione pennello'}
            >
              <span className="px-1 text-slate-400 font-semibold">
                {tool === 'draw_wall' ? 'Spess.:' : 'Dim.:'}
              </span>
              {BRUSH_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setBrushPresetId(p.id)}
                  className={`px-1.5 py-0.5 rounded font-mono font-bold transition-colors ${
                    brushPresetId === p.id
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div className="h-4 w-px bg-slate-700/80 shrink-0" />

          {/* MENU A TENDINA 1: PULIZIA AUTO */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'auto' ? null : 'auto'))}
              className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                openMenu === 'auto'
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'text-emerald-300 hover:bg-slate-800 hover:text-white'
              }`}
              title="Filtri automatici Solo Pareti per preparare la tavola al 3D e BIM"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Solo Pareti Auto</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {openMenu === 'auto' && (
              <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl p-1.5 text-xs space-y-0.5">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Estrazione Automatica Solo Pareti
                </div>
                <button
                  type="button"
                  onClick={() => handleRunAutoWallsFilter('soft')}
                  className="w-full px-2.5 py-1.5 rounded flex items-center justify-between text-slate-200 hover:bg-slate-800 text-left"
                >
                  <span>Leggero (pulisce tratteggi e grigi)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRunAutoWallsFilter('standard')}
                  className="w-full px-2.5 py-1.5 rounded flex items-center justify-between bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 font-semibold text-left"
                >
                  <span>Standard — Solo Pareti (consigliato)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRunAutoWallsFilter('strong')}
                  className="w-full px-2.5 py-1.5 rounded flex items-center justify-between text-slate-200 hover:bg-slate-800 text-left"
                >
                  <span>Forte (solo muri spessi e pilastri)</span>
                </button>

                <div className="my-1 border-t border-slate-800" />

                <button
                  type="button"
                  onClick={handleResetBaseClean}
                  className="w-full px-2.5 py-1.5 rounded flex items-center gap-2 text-slate-300 hover:bg-slate-800 text-left"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ripristina pulizia base (senza quote)</span>
                </button>
                <button
                  type="button"
                  onClick={handleLoadOriginalIntoEditor}
                  className="w-full px-2.5 py-1.5 rounded flex items-center gap-2 text-slate-300 hover:bg-slate-800 text-left"
                >
                  <Minus className="w-3.5 h-3.5 text-slate-400" />
                  <span>Ripristina PDF originale completo</span>
                </button>
              </div>
            )}
          </div>

          {/* MENU A TENDINA 2: VISTA */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'view' ? null : 'view'))}
              className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                openMenu === 'view'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-200 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              <span>Vista</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {openMenu === 'view' && (
              <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg bg-slate-900 border border-slate-700 shadow-2xl p-1.5 text-xs space-y-0.5">
                <button
                  type="button"
                  onClick={() => setShowBimWallsPreview((v) => !v)}
                  className="w-full px-2.5 py-1.5 rounded flex items-center justify-between text-slate-200 hover:bg-slate-800"
                >
                  <span className="flex items-center gap-2">
                    <Box className="w-3.5 h-3.5 text-emerald-400" />
                    Anteprima Pareti 3D/BIM
                  </span>
                  {showBimWallsPreview && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowOriginalGhost((v) => !v)}
                  className="w-full px-2.5 py-1.5 rounded flex items-center justify-between text-slate-200 hover:bg-slate-800"
                >
                  <span className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    Traccia PDF originale sotto (20%)
                  </span>
                  {showOriginalGhost && <Check className="w-3.5 h-3.5 text-sky-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGrid((v) => !v)}
                  className="w-full px-2.5 py-1.5 rounded flex items-center justify-between text-slate-200 hover:bg-slate-800"
                >
                  <span className="flex items-center gap-2">
                    <Grid className="w-3.5 h-3.5 text-slate-400" />
                    Griglia di riferimento
                  </span>
                  {showGrid && <Check className="w-3.5 h-3.5 text-slate-300" />}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={undoCount === 0}
            onClick={handleUndo}
            className="px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 text-slate-200 hover:bg-slate-800 disabled:opacity-35 disabled:hover:bg-transparent transition-colors whitespace-nowrap"
            title="Annulla ultima modifica (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Annulla</span>
          </button>
        </div>

        {/* DESTRA: ZOOM + LANCIATORE MAGICO DIRETTO 3D & BIM */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center bg-slate-950 rounded-md border border-slate-700 p-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.2) * 100) / 100))}
              className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800"
              title="Zoom Indietro"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-mono tabular-nums text-slate-200 min-w-[40px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(4.0, Math.round((z + 0.2) * 100) / 100))}
              className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800"
              title="Zoom Avanti"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFit}
              className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800 border-l border-slate-700 ml-0.5 pl-1.5"
              title="Adatta tavola"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onGoToMode('3d')}
            className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
            title="Trasforma subito questa tavola pulita nel modello 3D"
          >
            <Box className="w-3.5 h-3.5" />
            <span>Trasforma in 3D</span>
          </button>

          <button
            type="button"
            onClick={() => onGoToMode('bim')}
            className="px-2.5 py-1 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[11px] font-bold flex items-center gap-1 transition-colors whitespace-nowrap"
            title="Trasforma subito questa tavola pulita nel modello BIM editabile"
          >
            <Cuboid className="w-3.5 h-3.5" />
            <span>Trasforma in BIM</span>
          </button>
        </div>
      </div>

      {/* AREA DISEGNO 2D PULITO — 100% LIBERA AL CENTRO */}
      <div
        ref={scrollContainerRef}
        onMouseDown={(e) => {
          if (e.button === 1 && scrollContainerRef.current) {
            e.preventDefault();
            setIsPanning(true);
            panOriginRef.current = {
              clientX: e.clientX,
              clientY: e.clientY,
              scrollLeft: scrollContainerRef.current.scrollLeft,
              scrollTop: scrollContainerRef.current.scrollTop,
            };
          }
        }}
        onAuxClick={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={finishInteraction}
        onMouseLeave={() => {
          setCursorPx(null);
          if (isDrawingRef.current || isPanning) finishInteraction();
        }}
        className={`flex-1 overflow-auto bg-[#1e2633] flex items-start justify-center p-4 ${
          isPanning || isSpacePressed ? 'cursor-grabbing' : tool === 'eraser' || tool === 'restore' ? 'cursor-none' : 'cursor-crosshair'
        }`}
      >
        <div
          className="relative bg-white shadow-2xl border border-slate-700 shrink-0"
          style={{ width: displayW, height: displayH }}
          onMouseDown={handleMouseDown}
        >
          {/* Sottofondo fantasma del PDF originale (opzionale, 20% opacità) */}
          {showOriginalGhost && originalPdfCanvas && (
            <canvas
              ref={ghostCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
            />
          )}

          {/* Canvas principale 2D Pulito editabile (moltiplicato leggermente se ghost attivo così si vede sotto) */}
          <canvas
            ref={displayCanvasRef}
            className="absolute inset-0 w-full h-full block"
            style={{ opacity: showOriginalGhost ? 0.88 : 1 }}
          />

          {/* Griglia opzionale */}
          {showGrid && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(56,189,248,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,0.16) 1px, transparent 1px)',
                backgroundSize: `${Math.max(12, Math.round(displayW / 32))}px ${Math.max(12, Math.round(displayW / 32))}px`,
              }}
            />
          )}

          {/* Overlay SVG: Anteprima live Pareti BIM + Cursore pennello + Box / Traccia Muro */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${canvasW} ${canvasH}`}
            preserveAspectRatio="none"
          >
            {/* ANTEPRIMA PARETI PRONTE PER 3D/BIM IN TEMPO REALE */}
            {showBimWallsPreview &&
              metersPerPt > 0 &&
              bimModel.walls.map((w) => {
                const scaleX = canvasW / pageWidthPt;
                const scaleY = canvasH / pageHeightPt;
                const x1 = (w.x1M / metersPerPt) * scaleX;
                const y1 = (w.y1M / metersPerPt) * scaleY;
                const x2 = (w.x2M / metersPerPt) * scaleX;
                const y2 = (w.y2M / metersPerPt) * scaleY;
                const thickPx = Math.max(3, (w.thicknessM / metersPerPt) * ((scaleX + scaleY) * 0.5));
                return (
                  <line
                    key={w.id}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#10b981"
                    strokeOpacity={0.48}
                    strokeWidth={thickPx}
                    strokeLinecap="butt"
                  />
                );
              })}

            {/* ANTEPRIMA PILASTRI BIM */}
            {showBimWallsPreview &&
              metersPerPt > 0 &&
              bimModel.pillars.map((p) => {
                const scaleX = canvasW / pageWidthPt;
                const scaleY = canvasH / pageHeightPt;
                const cx = (p.cxM / metersPerPt) * scaleX;
                const cy = (p.cyM / metersPerPt) * scaleY;
                const pw = Math.max(5, (p.widthM / metersPerPt) * scaleX);
                const pd = Math.max(5, (p.depthM / metersPerPt) * scaleY);
                return (
                  <rect
                    key={p.id}
                    x={cx - pw * 0.5}
                    y={cy - pd * 0.5}
                    width={pw}
                    height={pd}
                    fill="#f59e0b"
                    fillOpacity={0.5}
                    stroke="#d97706"
                    strokeWidth={1.5}
                  />
                );
              })}

            {/* BOX CANCELLA / RITAGLIA IN CORSO */}
            {dragBox && (
              <>
                <rect
                  x={Math.min(dragBox.x1, dragBox.x2)}
                  y={Math.min(dragBox.y1, dragBox.y2)}
                  width={Math.abs(dragBox.x2 - dragBox.x1)}
                  height={Math.abs(dragBox.y2 - dragBox.y1)}
                  fill={tool === 'crop_keep' ? 'rgba(245, 158, 11, 0.14)' : 'rgba(239, 68, 68, 0.16)'}
                  stroke={tool === 'crop_keep' ? '#f59e0b' : '#ef4444'}
                  strokeWidth={Math.max(1.5, canvasW / displayW * 2)}
                  strokeDasharray={`${Math.max(4, canvasW / displayW * 6)} ${Math.max(3, canvasW / displayW * 4)}`}
                />
              </>
            )}

            {/* MURO TRACCIATO IN CORSO */}
            {wallLineDrag && (
              <line
                x1={wallLineDrag.x1}
                y1={wallLineDrag.y1}
                x2={wallLineDrag.x2}
                y2={wallLineDrag.y2}
                stroke="#06b6d4"
                strokeWidth={Math.max(4, Math.round(activePreset.wallPx * resFactor))}
                strokeLinecap="square"
                strokeOpacity={0.85}
              />
            )}

            {/* CURSORE CIRCOLARE GOMMA / RIPRISTINA */}
            {cursorPx && (tool === 'eraser' || tool === 'restore') && !isPanning && !isSpacePressed && (
              <circle
                cx={cursorPx.x}
                cy={cursorPx.y}
                r={Math.max(3, (cursorRadiusDisplay * canvasW) / displayW)}
                fill={tool === 'eraser' ? 'rgba(255,255,255,0.55)' : 'rgba(56,189,248,0.22)'}
                stroke={tool === 'eraser' ? '#ef4444' : '#0284c7'}
                strokeWidth={Math.max(1.2, (canvasW / displayW) * 1.6)}
              />
            )}
          </svg>
        </div>
      </div>

      {/* BARRA DI STATO CAD IN BASSO (FUORI DAL DISEGNO) */}
      <div className="bg-slate-900 border-t border-slate-800 px-3 py-1 flex items-center justify-between gap-3 text-[11px] text-slate-300 shrink-0">
        <div className="flex items-center gap-3 min-w-0 truncate">
          <span className="font-mono tabular-nums text-emerald-300 font-bold shrink-0">
            Pareti pronte: {bimModel.walls.length}
          </span>
          {bimModel.pillars.length > 0 && (
            <span className="font-mono tabular-nums text-amber-300 shrink-0">
              Pilastri: {bimModel.pillars.length}
            </span>
          )}
          {bimModel.doors.length + bimModel.windows.length > 0 && (
            <span className="font-mono tabular-nums text-cyan-300 shrink-0">
              Aperture: {bimModel.doors.length + bimModel.windows.length}
            </span>
          )}
          {hasManualEdits && (
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider shrink-0">
              · Pulizia personalizzata attiva
            </span>
          )}
          <span className="text-slate-400 truncate hidden md:inline">· {statusMessage}</span>
        </div>

        <div className="text-[10px] text-slate-400 font-mono whitespace-nowrap shrink-0 hidden sm:block">
          Rotella: Zoom · Clic rotella: Pan · Ctrl+Z: Annulla
          {tool === 'draw_wall' ? ' · Shift: Muro inclinato' : ''}
        </div>
      </div>
    </div>
  );
};
