import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AlertTriangle,
  AppWindow,
  Box,
  BoxSelect,
  Check,
  CheckSquare,
  ChevronDown,
  Cuboid,
  DoorOpen,
  Eraser,
  Eye,
  FileImage,
  Layers,
  Loader2,
  MousePointerClick,
  Pencil,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Tag,
  Trash2,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import { LaserSensitivity } from '../utils/planLaserRaycaster';
import { SignificantQuoteItem } from '../utils/planCleanGeometry';
import {
  BimDoorObject,
  BimObject,
  BimObjectKind,
  BimPillarObject,
  BimRoomObject,
  BimWallObject,
  BimWindowObject,
  inferRoomFloorType,
  PlanBimModel,
} from '../utils/planBimExtractor';

interface Plan3DViewerProps {
  mode: '3d' | 'bim';
  bimModel: PlanBimModel;
  onUpdateBimObject: (updated: BimObject) => void;
  onDeleteBimObject: (id: string, kind: BimObjectKind) => void;
  onDeleteMultipleBimObjects?: (items: Array<{ id: string; kind: BimObjectKind }>) => void;
  onAddBimObject?: (newObj: BimObject) => void;
  onCleanBimModel?: (action: 'short_fragments' | 'dedup_and_stairs') => void;
  onUndoBim?: () => void;
  onRedoBim?: () => void;
  canUndoBim?: boolean;
  canRedoBim?: boolean;
  wallHeightM: number;
  onWallHeightChange: (newHeightM: number) => void;
  /** Floor-plan canvas (used in Technical Blueprint view and optional Maquette PDF tracing underlay) */
  cleanFloorCanvas: HTMLCanvasElement | null;
  /** Significant quotes projected onto the toggleable Quote layer */
  significantQuotes: SignificantQuoteItem[];
  showQuotesLayer: boolean;
  onToggleQuotesLayer: () => void;
  lumaVersion: number;
  sensitivity: LaserSensitivity;
  onSensitivityChange: (sens: LaserSensitivity) => void;
  onComputeBimObject: (obj: BimObject, sides: 1 | 2) => void;
  onComputeMultipleBimObjects: (objs: BimObject[], sides: 1 | 2) => void;
  activeCellLabel?: string | null;
  /** Server-side Gemini Vision architectural reconstruction controls */
  isAnalyzingAi?: boolean;
  aiError?: string | null;
  onDismissAiError?: () => void;
  onRequestAiRebuild?: () => void;
  onUseLocalModel?: () => void;
  hasAiModel?: boolean;
}

type CameraPreset = 'iso' | 'top' | 'front';
type ClickMode = 'instant' | 'select';
type BimFilter = 'all' | BimObjectKind;
type OpenDropdown = 'view' | 'edit' | 'model' | 'bim' | null;
type VisualTheme = 'maquette' | 'blueprint';
type EditTool = 'none' | 'erase_click' | 'erase_box' | 'draw_wall' | 'add_door' | 'add_window' | 'add_pillar';
type NewWallPreset = 'perimeter' | 'partition';

// Module-scoped scratch helpers (zero allocations during pointer/render)
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _planeHit = new THREE.Vector3();
const _projVec = new THREE.Vector3();

function makeCadUid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
    const isSoft = /SwiftShader|llvmpipe|Software|Mesa OffScreen/i.test(renderer);
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return isSoft;
  } catch {
    return false;
  }
}

/**
 * Deterministic pseudo-random helper for repeatable procedural architectural textures.
 */
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Generates a realistic light natural oak staggered parquet CanvasTexture
 * matching clean architectural maquette visualization.
 */
function createOakFloorTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const rand = seededRand(4219);
    ctx.fillStyle = '#cda977';
    ctx.fillRect(0, 0, size, size);

    const rows = 16;
    const plankH = size / rows;
    // Rich warm blonde natural oak tones (reads true golden-oak under ACES lighting, never chalky)
    const baseTones = [
      [212, 180, 134],
      [202, 167, 118],
      [219, 190, 146],
      [194, 158, 108],
      [207, 174, 126],
    ];

    for (let r = 0; r < rows; r++) {
      const y = r * plankH;
      const offset = ((r * 137) % 256) - 256;
      let x = offset;
      while (x < size) {
        const pw = 160 + Math.floor(rand() * 110);
        const tone = baseTones[Math.floor(rand() * baseTones.length)];
        const jitter = Math.floor((rand() - 0.5) * 12);
        const cr = Math.min(255, Math.max(0, tone[0] + jitter));
        const cg = Math.min(255, Math.max(0, tone[1] + jitter));
        const cb = Math.min(255, Math.max(0, tone[2] + jitter));

        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fillRect(x, y, pw, plankH);

        // Subtle horizontal oak wood grain fibers
        const grainCount = 8 + Math.floor(rand() * 6);
        for (let g = 0; g < grainCount; g++) {
          const gy = y + 2 + rand() * (plankH - 4);
          const alpha = 0.06 + rand() * 0.07;
          ctx.strokeStyle = rand() > 0.3 ? `rgba(116, 82, 42, ${alpha})` : `rgba(255, 245, 224, ${alpha})`;
          ctx.lineWidth = 0.7 + rand() * 1.1;
          ctx.beginPath();
          ctx.moveTo(x, gy);
          ctx.bezierCurveTo(
            x + pw * 0.33,
            gy + (rand() - 0.5) * 2.5,
            x + pw * 0.66,
            gy + (rand() - 0.5) * 2.5,
            x + pw,
            gy
          );
          ctx.stroke();
        }

        // Crisp vertical end-joint seam
        ctx.strokeStyle = 'rgba(112, 82, 48, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, y);
        ctx.lineTo(x + 0.5, y + plankH);
        ctx.stroke();

        x += pw;
      }

      // Horizontal plank seam
      ctx.strokeStyle = 'rgba(112, 82, 48, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(size, y + 0.5);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, maxAniso);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a realistic warm sand-beige architectural ceramic/travertine tile CanvasTexture
 * for bathrooms, balconies, corridors, and staircases.
 */
function createCeramicFloorTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const rand = seededRand(8831);
    ctx.fillStyle = '#d7cdbc';
    ctx.fillRect(0, 0, size, size);

    const grid = 4; // 4×4 tiles per texture repeat (~50cm each when repeat=2.0m)
    const tile = size / grid;
    const baseTones = [
      [218, 208, 191],
      [211, 200, 182],
      [224, 215, 199],
      [205, 194, 176],
    ];

    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const x = gx * tile;
        const y = gy * tile;
        const tone = baseTones[Math.floor(rand() * baseTones.length)];
        const jitter = Math.floor((rand() - 0.5) * 7);
        ctx.fillStyle = `rgb(${tone[0] + jitter},${tone[1] + jitter},${tone[2] + jitter})`;
        ctx.fillRect(x, y, tile, tile);

        // Soft travertine/porcelain stone clouding
        for (let c = 0; c < 6; c++) {
          const cx = x + rand() * tile;
          const cy = y + rand() * tile;
          const rad = 16 + rand() * 38;
          const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
          grad.addColorStop(0, rand() > 0.5 ? 'rgba(168, 154, 132, 0.13)' : 'rgba(255, 250, 240, 0.16)');
          grad.addColorStop(1, 'rgba(215, 205, 188, 0)');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, tile, tile);
        }

        // Crisp architectural grout line
        ctx.strokeStyle = 'rgba(138, 128, 112, 0.42)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, y + 0.75, tile - 1.5, tile - 1.5);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(8, maxAniso);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a soft contact Ambient Occlusion gradient texture for wall/pillar bases
 * so walls appear grounded on oak/ceramic floors like a raytraced architectural render.
 */
function createWallAoTexture(): THREE.CanvasTexture {
  const w = 16;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, 'rgba(28, 25, 22, 0.0)');
    grad.addColorStop(0.28, 'rgba(28, 25, 22, 0.14)');
    grad.addColorStop(0.5, 'rgba(28, 25, 22, 0.24)');
    grad.addColorStop(0.72, 'rgba(28, 25, 22, 0.14)');
    grad.addColorStop(1.0, 'rgba(28, 25, 22, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Computes tight interior building footprint strips from walls/openings so L-shaped
 * or irregular floor plans NEVER get a giant protruding rectangular oak slab.
 */
function buildTightInteriorFloorRects(
  walls: BimWallObject[],
  boundsM: { minX: number; maxX: number; minY: number; maxY: number }
): Array<{ x: number; y: number; w: number; h: number }> {
  const spanX = Math.max(1, boundsM.maxX - boundsM.minX);
  const spanY = Math.max(1, boundsM.maxY - boundsM.minY);
  const cell = Math.max(0.22, Math.min(0.45, Math.max(spanX, spanY) / 64));
  const pad = 2; // exterior border cells for flood-fill
  const cols = Math.min(96, Math.ceil(spanX / cell) + pad * 2);
  const rows = Math.min(96, Math.ceil(spanY / cell) + pad * 2);
  const stepX = spanX / Math.max(1, cols - pad * 2);
  const stepY = spanY / Math.max(1, rows - pad * 2);
  const originX = boundsM.minX - pad * stepX;
  const originY = boundsM.minY - pad * stepY;

  const blocked = new Uint8Array(cols * rows);

  // Rasterize walls onto occupancy grid with slight inflation to bridge doorway gaps
  for (const w of walls) {
    const len = Math.max(0.1, Math.hypot(w.x2M - w.x1M, w.y2M - w.y1M));
    const steps = Math.max(2, Math.ceil(len / (Math.min(stepX, stepY) * 0.45)));
    const rad = Math.max(1, Math.ceil(Math.max(w.thicknessM * 0.7, 0.35) / Math.min(stepX, stepY)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = w.x1M + (w.x2M - w.x1M) * t;
      const py = w.y1M + (w.y2M - w.y1M) * t;
      const gx = Math.floor((px - originX) / stepX);
      const gy = Math.floor((py - originY) / stepY);
      for (let dy = -rad; dy <= rad; dy++) {
        const ny = gy + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -rad; dx <= rad; dx++) {
          const nx = gx + dx;
          if (nx < 0 || nx >= cols) continue;
          blocked[ny * cols + nx] = 1;
        }
      }
    }
  }

  // Morphological close (dilate 2 cells -> flood-fill outside) to seal balcony/door openings
  const sealed = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!blocked[y * cols + x]) continue;
      for (let dy = -2; dy <= 2; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= rows) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= cols) continue;
          sealed[ny * cols + nx] = 1;
        }
      }
    }
  }

  // BFS exterior flood-fill from border
  const outside = new Uint8Array(cols * rows);
  const queue = new Int32Array(cols * rows);
  let qHead = 0;
  let qTail = 0;
  const enqueue = (idx: number) => {
    if (!outside[idx] && !sealed[idx]) {
      outside[idx] = 1;
      queue[qTail++] = idx;
    }
  };
  for (let x = 0; x < cols; x++) {
    enqueue(x);
    enqueue((rows - 1) * cols + x);
  }
  for (let y = 0; y < rows; y++) {
    enqueue(y * cols);
    enqueue(y * cols + (cols - 1));
  }
  while (qHead < qTail) {
    const cur = queue[qHead++];
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    if (cx > 0) enqueue(cur - 1);
    if (cx < cols - 1) enqueue(cur + 1);
    if (cy > 0) enqueue(cur - cols);
    if (cy < rows - 1) enqueue(cur + cols);
  }

  // Keep true interior cells (not outside, or actually on a wall)
  const inside = new Uint8Array(cols * rows);
  let insideCount = 0;
  for (let i = 0; i < cols * rows; i++) {
    if (!outside[i]) {
      inside[i] = 1;
      insideCount++;
    }
  }
  if (insideCount === 0) return [];

  // Merge interior cells into horizontal scanline rectangles
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      if (!inside[y * cols + x]) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < cols && inside[y * cols + x]) x++;
      rects.push({
        x: originX + x0 * stepX,
        y: originY + y * stepY,
        w: (x - x0) * stepX,
        h: stepY + 0.004,
      });
    }
  }
  return rects;
}

/**
 * Builds a flat world-UV mapped polygon floor geometry at Y = 0 from 2D meter vertices.
 */
function buildPolygonFloorGeometry(
  polyM: Array<{ x: number; y: number }>,
  centerX: number,
  centerZ: number,
  tileScaleM: number
): THREE.ShapeGeometry | null {
  if (!polyM || polyM.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(polyM[0].x - centerX, -(polyM[0].y - centerZ));
  for (let i = 1; i < polyM.length; i++) {
    shape.lineTo(polyM[i].x - centerX, -(polyM[i].y - centerZ));
  }
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);

  // Assign real-world meter UVs so wood planks & ceramic tiles match exact architectural scale
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const inv = 1 / Math.max(0.2, tileScaleM);
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) * inv, pos.getZ(i) * inv);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an extruded light-grey concrete slab directly beneath a 2D meter polygon (Y = -depthM .. 0).
 */
function buildPolygonPlinthGeometry(
  polyM: Array<{ x: number; y: number }>,
  centerX: number,
  centerZ: number,
  depthM = 0.16
): THREE.ExtrudeGeometry | null {
  if (!polyM || polyM.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(polyM[0].x - centerX, -(polyM[0].y - centerZ));
  for (let i = 1; i < polyM.length; i++) {
    shape.lineTo(polyM[i].x - centerX, -(polyM[i].y - centerZ));
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depthM,
    bevelEnabled: false,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -depthM, 0);
  geo.computeVertexNormals();
  return geo;
}

function makeQuoteSpriteTexture(text: string, isRoom: boolean, lightTheme: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = isRoom
      ? lightTheme
        ? 'rgba(255, 255, 255, 0.94)'
        : 'rgba(15, 23, 42, 0.92)'
      : 'rgba(245, 158, 11, 0.95)';
    ctx.strokeStyle = isRoom ? (lightTheme ? '#64748b' : '#38bdf8') : '#0f172a';
    ctx.lineWidth = 4;
    const pad = 8;
    const w = canvas.width - pad * 2;
    const h = canvas.height - pad * 2;
    ctx.beginPath();
    ctx.roundRect(pad, pad, w, h, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isRoom ? (lightTheme ? '#0f172a' : '#f8fafc') : '#0f172a';
    ctx.font = isRoom ? 'bold 24px sans-serif' : 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 16), canvas.width / 2, canvas.height / 2 + 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

interface InteractiveMeshEntry {
  obj: BimObject;
  materials: THREE.MeshStandardMaterial[];
  baseColors: number[];
  edgeMat?: THREE.LineBasicMaterial;
  baseEdgeColor?: number;
  baseEdgeOpacity?: number;
}

// --- THEME 1: MAQUETTE BIANCA ARCHITETTONICA (DEFAULT — STUDIO ARCHITECTURAL CUTAWAY) ---
const MAQ_BG_STUDIO = 0xf5f6f8;
const MAQ_CONCRETE_PLINTH = 0x9ea6b2;
const MAQ_WALL_MATTE = 0xeeece7;
const MAQ_WALL_TOP_CAP = 0xffffff;
const MAQ_WALL_EDGE = 0x707987;
const MAQ_DOOR_FRAME = 0xe4e2dc;
const MAQ_DOOR_LEAF = 0xf7f6f2;
const MAQ_DOOR_HANDLE = 0x7c8798;
const MAQ_WIN_FRAME = 0xd2d8e0;
const MAQ_WIN_GLASS = 0xb8d4e6;
const MAQ_RAILING_METAL = 0xadb4bf;

// --- THEME 2: PIANTINA TECNICA SCURA (OPZIONALE DA MENU VISTA) ---
const DARK_BG_STUDIO = 0x0f172a;
const DARK_BASE_PLINTH = 0x1e293b;
const DARK_BASE_FRAME = 0x475569;
const DARK_WALL_EXT = 0x334155;
const DARK_WALL_INT = 0x475569;
const DARK_WALL_CAP = 0xcbd5e1;
const DARK_EDGE_DEFAULT = 0x090d16;
const DARK_DOOR_FRAME = 0x1e293b;
const DARK_DOOR_PANEL = 0xb45309;
const DARK_WIN_FRAME = 0x94a3b8;
const DARK_WIN_GLASS = 0x38bdf8;
const DARK_PILLAR_BODY = 0x64748b;
const DARK_PILLAR_CAP = 0x0f172a;
const DARK_ROOM_SLAB = 0x0ea5e9;

// Highlight colors
const COLOR_HOVER = 0xf59e0b;
const COLOR_ERASE_HOVER = 0xef4444;
const COLOR_SELECTED = 0x10b981;
const COLOR_COMPUTED = 0x0284c7;

function getObjectAreaOrQtyText(obj: BimObject, sides: 1 | 2): string {
  if (obj.kind === 'wall') {
    const m2 = Math.round(obj.lengthM * obj.heightM * sides * 100) / 100;
    return `L ${obj.lengthM.toFixed(2)} × H ${obj.heightM.toFixed(2)}${sides === 2 ? ' × 2' : ''} = ${m2.toFixed(2)} m²`;
  }
  if (obj.kind === 'door') {
    const m2 = Math.round(obj.widthM * obj.heightM * 100) / 100;
    return `${obj.widthM.toFixed(2)} × ${obj.heightM.toFixed(2)} m (${m2.toFixed(2)} m²)`;
  }
  if (obj.kind === 'window') {
    const m2 = Math.round(obj.widthM * obj.heightM * 100) / 100;
    return `${obj.widthM.toFixed(2)} × ${obj.heightM.toFixed(2)} m · Dav. ${obj.sillHeightM.toFixed(2)}m (${m2.toFixed(2)} m²)`;
  }
  if (obj.kind === 'pillar') {
    const m3 = Math.round(obj.widthM * obj.depthM * obj.heightM * 100) / 100;
    return `${obj.widthM.toFixed(2)} × ${obj.depthM.toFixed(2)} × ${obj.heightM.toFixed(2)} m (${m3.toFixed(2)} m³)`;
  }
  return `Sup. ${obj.areaM2.toFixed(2)} m² · Perim. ${obj.perimeterM.toFixed(2)} m`;
}

export const Plan3DViewer: React.FC<Plan3DViewerProps> = ({
  mode,
  bimModel,
  onUpdateBimObject,
  onDeleteBimObject,
  onDeleteMultipleBimObjects,
  onAddBimObject,
  onCleanBimModel,
  onUndoBim,
  onRedoBim,
  canUndoBim = false,
  canRedoBim = false,
  wallHeightM,
  onWallHeightChange,
  cleanFloorCanvas,
  significantQuotes,
  showQuotesLayer,
  onToggleQuotesLayer,
  lumaVersion,
  sensitivity,
  onSensitivityChange,
  onComputeBimObject,
  onComputeMultipleBimObjects,
  activeCellLabel,
  isAnalyzingAi = false,
  aiError = null,
  onDismissAiError,
  onRequestAiRebuild,
  onUseLocalModel,
  hasAiModel = false,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const menuBarRef = useRef<HTMLDivElement | null>(null);

  const [visualTheme, setVisualTheme] = useState<VisualTheme>('maquette');
  const [showBlueprintOverlay, setShowBlueprintOverlay] = useState<boolean>(false);
  const [showShadows, setShowShadows] = useState<boolean>(true);
  const [openMenu, setOpenMenu] = useState<OpenDropdown>(null);
  const [editTool, setEditTool] = useState<EditTool>('none');
  const [newWallPreset, setNewWallPreset] = useState<NewWallPreset>('partition');
  const [drawStatusText, setDrawStatusText] = useState<string | null>(null);
  const [eraseBoxRect, setEraseBoxRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const [clickMode, setClickMode] = useState<ClickMode>('instant');
  const [sides, setSides] = useState<1 | 2>(1);
  const [bimFilter, setBimFilter] = useState<BimFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [computedIds, setComputedIds] = useState<Set<string>>(() => new Set());
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [hoveredObj, setHoveredObj] = useState<BimObject | null>(null);
  const [heightInput, setHeightInput] = useState(wallHeightM.toFixed(2));

  useEffect(() => {
    setHeightInput(wallHeightM.toFixed(2));
  }, [wallHeightM]);

  // Close AutoCAD dropdown menu on outside click or Escape
  useEffect(() => {
    if (!openMenu) return;
    const onDocDown = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const allObjectsMap = useMemo(() => {
    const map = new Map<string, BimObject>();
    for (const w of bimModel.walls) map.set(w.id, w);
    for (const d of bimModel.doors) map.set(d.id, d);
    for (const wn of bimModel.windows) map.set(wn.id, wn);
    for (const p of bimModel.pillars) map.set(p.id, p);
    for (const r of bimModel.rooms) map.set(r.id, r);
    return map;
  }, [bimModel]);

  const inspectedObj = useMemo(
    () => (inspectedId ? allObjectsMap.get(inspectedId) ?? null : null),
    [inspectedId, allObjectsMap]
  );

  useEffect(() => {
    if (inspectedId && !allObjectsMap.has(inspectedId)) {
      setInspectedId(null);
    }
  }, [inspectedId, allObjectsMap]);

  // Imperative Three.js refs
  const requestRenderRef = useRef<() => void>(() => {});
  const applyPresetRef = useRef<(preset: CameraPreset) => void>(() => {});
  const applyShadowsRef = useRef<(enabled: boolean) => void>(() => {});
  const showShadowsRef = useRef<boolean>(showShadows);
  const controlsRef = useRef<OrbitControls | null>(null);
  const entriesRef = useRef<Map<string, InteractiveMeshEntry>>(new Map());
  const quotesGroupRef = useRef<THREE.Group | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const drawStartRef = useRef<{ xM: number; yM: number } | null>(null);
  const clearCadPreviewRef = useRef<() => void>(() => {});

  const savedCameraRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const lastModelKeyRef = useRef<string>('');

  const modeRef = useRef(mode);
  const clickModeRef = useRef(clickMode);
  const sidesRef = useRef(sides);
  const onComputeBimObjectRef = useRef(onComputeBimObject);
  const onDeleteBimObjectRef = useRef(onDeleteBimObject);
  const onDeleteMultipleBimObjectsRef = useRef(onDeleteMultipleBimObjects);
  const onAddBimObjectRef = useRef(onAddBimObject);
  const selectedIdsRef = useRef(selectedIds);
  const computedIdsRef = useRef(computedIds);
  const inspectedIdRef = useRef(inspectedId);
  const visualThemeRef = useRef(visualTheme);
  const editToolRef = useRef<EditTool>(editTool);
  const newWallPresetRef = useRef<NewWallPreset>(newWallPreset);
  const wallHeightMRef = useRef<number>(wallHeightM);
  const bimModelRef = useRef<PlanBimModel>(bimModel);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    clickModeRef.current = clickMode;
  }, [clickMode]);
  useEffect(() => {
    sidesRef.current = sides;
  }, [sides]);
  useEffect(() => {
    onComputeBimObjectRef.current = onComputeBimObject;
  }, [onComputeBimObject]);
  useEffect(() => {
    onDeleteBimObjectRef.current = onDeleteBimObject;
  }, [onDeleteBimObject]);
  useEffect(() => {
    onDeleteMultipleBimObjectsRef.current = onDeleteMultipleBimObjects;
  }, [onDeleteMultipleBimObjects]);
  useEffect(() => {
    onAddBimObjectRef.current = onAddBimObject;
  }, [onAddBimObject]);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);
  useEffect(() => {
    computedIdsRef.current = computedIds;
  }, [computedIds]);
  useEffect(() => {
    inspectedIdRef.current = inspectedId;
  }, [inspectedId]);
  useEffect(() => {
    visualThemeRef.current = visualTheme;
  }, [visualTheme]);
  useEffect(() => {
    showShadowsRef.current = showShadows;
    applyShadowsRef.current(showShadows);
  }, [showShadows]);
  useEffect(() => {
    editToolRef.current = editTool;
    drawStartRef.current = null;
    setDrawStatusText(null);
    setEraseBoxRect(null);
    clearCadPreviewRef.current();
    // Configure OrbitControls left-drag without rebuilding the 3D scene
    if (controlsRef.current) {
      const blockLeftOrbit =
        editTool === 'erase_box' ||
        editTool === 'draw_wall' ||
        editTool === 'add_door' ||
        editTool === 'add_window' ||
        editTool === 'add_pillar';
      controlsRef.current.mouseButtons = {
        LEFT: blockLeftOrbit ? (null as unknown as THREE.MOUSE) : THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      };
    }
  }, [editTool]);
  useEffect(() => {
    newWallPresetRef.current = newWallPreset;
  }, [newWallPreset]);
  useEffect(() => {
    wallHeightMRef.current = wallHeightM;
  }, [wallHeightM]);
  useEffect(() => {
    bimModelRef.current = bimModel;
  }, [bimModel]);

  // CAD Keyboard Shortcuts (Esc, Ctrl+Z, Ctrl+Y, Delete/Backspace)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (onUndoBim && canUndoBim) {
          e.preventDefault();
          onUndoBim();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        if (onRedoBim && canRedoBim) {
          e.preventDefault();
          onRedoBim();
        }
        return;
      }
      if (e.key === 'Escape') {
        if (drawStartRef.current) {
          drawStartRef.current = null;
          setDrawStatusText(null);
          clearCadPreviewRef.current();
        } else if (editToolRef.current !== 'none') {
          setEditTool('none');
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (inspectedIdRef.current) {
          const obj = allObjectsMap.get(inspectedIdRef.current);
          if (obj) {
            e.preventDefault();
            onDeleteBimObjectRef.current(obj.id, obj.kind);
            setInspectedId(null);
          }
        } else if (selectedIdsRef.current.size > 0 && onDeleteMultipleBimObjectsRef.current) {
          const items = Array.from(selectedIdsRef.current)
            .map((id) => allObjectsMap.get(id))
            .filter(Boolean)
            .map((o) => ({ id: (o as BimObject).id, kind: (o as BimObject).kind }));
          if (items.length > 0) {
            e.preventDefault();
            onDeleteMultipleBimObjectsRef.current(items);
            setSelectedIds(new Set());
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allObjectsMap, canUndoBim, canRedoBim, onUndoBim, onRedoBim]);

  const refreshObjectColors = useMemo(
    () => () => {
      const entries = entriesRef.current;
      const sel = selectedIdsRef.current;
      const comp = computedIdsRef.current;
      const hov = hoveredIdRef.current;
      const insp = inspectedIdRef.current;
      const isMaq = visualThemeRef.current === 'maquette';
      const isErasing = editToolRef.current === 'erase_click';

      entries.forEach((entry, id) => {
        const isHov = id === hov;
        const isInsp = id === insp;
        const isSel = sel.has(id);
        const isComp = comp.has(id);

        if (isHov && isErasing) {
          entry.materials.forEach((m) => {
            m.color.setHex(COLOR_ERASE_HOVER);
            m.emissive.setHex(0x450a0a);
          });
          if (entry.edgeMat) {
            entry.edgeMat.color.setHex(0x991b1b);
            entry.edgeMat.opacity = 1.0;
          }
        } else if (isHov || isInsp) {
          entry.materials.forEach((m) => {
            m.color.setHex(COLOR_HOVER);
            m.emissive.setHex(isMaq ? 0x261200 : 0x3b1704);
          });
          if (entry.edgeMat) {
            entry.edgeMat.color.setHex(isMaq ? 0xb45309 : 0xffffff);
            entry.edgeMat.opacity = 0.95;
          }
        } else if (isSel) {
          entry.materials.forEach((m) => {
            m.color.setHex(COLOR_SELECTED);
            m.emissive.setHex(isMaq ? 0x042f22 : 0x064e3b);
          });
          if (entry.edgeMat) {
            entry.edgeMat.color.setHex(isMaq ? 0x047857 : 0xffffff);
            entry.edgeMat.opacity = 0.9;
          }
        } else if (isComp) {
          entry.materials.forEach((m) => {
            m.color.setHex(COLOR_COMPUTED);
            m.emissive.setHex(isMaq ? 0x062538 : 0x0c4a6e);
          });
          if (entry.edgeMat) {
            entry.edgeMat.color.setHex(isMaq ? 0x0369a1 : 0xbae6fd);
            entry.edgeMat.opacity = 0.85;
          }
        } else {
          entry.materials.forEach((m, idx) => {
            m.color.setHex(entry.baseColors[idx] ?? (isMaq ? MAQ_WALL_MATTE : DARK_WALL_EXT));
            m.emissive.setHex(0x000000);
          });
          if (entry.edgeMat) {
            entry.edgeMat.color.setHex(entry.baseEdgeColor ?? (isMaq ? MAQ_WALL_EDGE : DARK_EDGE_DEFAULT));
            entry.edgeMat.opacity = entry.baseEdgeOpacity ?? (isMaq ? 0.36 : 0.78);
          }
        }
      });
      requestRenderRef.current();
    },
    []
  );

  useEffect(() => {
    refreshObjectColors();
  }, [selectedIds, computedIds, inspectedId, visualTheme, editTool, refreshObjectColors]);

  useEffect(() => {
    if (quotesGroupRef.current) {
      quotesGroupRef.current.visible = showQuotesLayer;
      requestRenderRef.current();
    }
  }, [showQuotesLayer]);

  // Main Three.js Scene Lifecycle — Pure Architectural White Maquette (Default) + Technical Dark Blueprint
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const isMaquette = visualTheme === 'maquette';
    const width = Math.max(320, container.clientWidth);
    const height = Math.max(260, container.clientHeight);

    const bgHex = isMaquette ? MAQ_BG_STUDIO : DARK_BG_STUDIO;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgHex);

    const { boundsM, planWidthM, planHeightM, walls, doors, windows, pillars, rooms } = bimModel;
    const railings = bimModel.railings || [];
    const hasGeo = walls.length > 0 || rooms.length > 0;
    const centerX = hasGeo ? (boundsM.minX + boundsM.maxX) * 0.5 : planWidthM * 0.5;
    const centerZ = hasGeo ? (boundsM.minY + boundsM.maxY) * 0.5 : planHeightM * 0.5;
    const spanX = Math.max(4, hasGeo ? boundsM.maxX - boundsM.minX : planWidthM);
    const spanZ = Math.max(4, hasGeo ? boundsM.maxY - boundsM.minY : planHeightM);
    const diag = Math.max(6, Math.hypot(spanX, spanZ));

    scene.fog = isMaquette
      ? new THREE.Fog(MAQ_BG_STUDIO, diag * 4.5, diag * 11.0)
      : new THREE.Fog(DARK_BG_STUDIO, diag * 2.8, diag * 7.8);

    // Architectural cutaway perspective (35° feels close to an isometric architectural maquette!)
    const camera = new THREE.PerspectiveCamera(
      isMaquette ? 34 : 40,
      width / height,
      0.1,
      Math.max(220, diag * 14)
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isMaquette ? 0.9 : 0.94;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Soft Studio Environment (subtle intensity per-material prevents any white glare while rotating)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // High-Contrast Architectural Studio Sunlight Rig (Maquette) vs Anti-Glare Technical Rig (Blueprint)
    let hemiLight: THREE.HemisphereLight;
    let keyLight: THREE.DirectionalLight;
    const initialShadowsOn = showShadowsRef.current;

    if (isMaquette) {
      // Lower hemisphere bounce + strong diagonal sun creates crisp sunlit vs shaded white walls & interior shadows
      hemiLight = new THREE.HemisphereLight(0xf5f8fc, 0xbdb5a8, initialShadowsOn ? 0.52 : 0.78);
      scene.add(hemiLight);

      keyLight = new THREE.DirectionalLight(0xfff5e6, initialShadowsOn ? 1.85 : 1.25);
      keyLight.position.set(diag * 0.68, diag * 1.12, diag * 0.56);
      if (!isSoftwareGl) {
        keyLight.castShadow = initialShadowsOn;
        keyLight.shadow.mapSize.set(2048, 2048);
        const pad = diag * 0.85;
        keyLight.shadow.camera.left = -pad;
        keyLight.shadow.camera.right = pad;
        keyLight.shadow.camera.top = pad;
        keyLight.shadow.camera.bottom = -pad;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = diag * 5.0;
        keyLight.shadow.bias = -0.0003;
        keyLight.shadow.normalBias = 0.02;
        keyLight.shadow.radius = 2.4;
      }
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xd4e4f7, 0.22);
      fillLight.position.set(-diag * 0.85, diag * 0.68, -diag * 0.72);
      scene.add(fillLight);
    } else {
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.34);
      scene.add(ambientLight);

      hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x334155, initialShadowsOn ? 0.48 : 0.68);
      scene.add(hemiLight);

      keyLight = new THREE.DirectionalLight(0xfff8ee, initialShadowsOn ? 1.15 : 0.9);
      keyLight.position.set(diag * 0.72, diag * 1.38, diag * 0.58);
      if (!isSoftwareGl) {
        keyLight.castShadow = initialShadowsOn;
        keyLight.shadow.mapSize.set(2048, 2048);
        const pad = diag * 0.78;
        keyLight.shadow.camera.left = -pad;
        keyLight.shadow.camera.right = pad;
        keyLight.shadow.camera.top = pad;
        keyLight.shadow.camera.bottom = -pad;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = diag * 4.5;
        keyLight.shadow.bias = -0.0005;
        keyLight.shadow.normalBias = 0.03;
      }
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xcbd5e1, 0.42);
      fillLight.position.set(-diag * 0.85, diag * 0.8, -diag * 0.72);
      scene.add(fillLight);
    }

    // Standard CAD Controls: Wheel zoom to cursor, Middle-click PAN, Left/Right drag Orbit
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.enableZoom = true;
    controls.zoomSpeed = 1.2;
    controls.zoomToCursor = true;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.panSpeed = 1.15;
    const initBlockLeft =
      editToolRef.current === 'erase_box' ||
      editToolRef.current === 'draw_wall' ||
      editToolRef.current === 'add_door' ||
      editToolRef.current === 'add_window' ||
      editToolRef.current === 'add_pillar';
    controls.mouseButtons = {
      LEFT: initBlockLeft ? (null as unknown as THREE.MOUSE) : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = Math.max(1.2, diag * 0.14);
    controls.maxDistance = diag * 4.5;

    const disposables: Array<{ dispose: () => void }> = [];

    // Shared procedural textures for Maquette mode
    let oakTex: THREE.CanvasTexture | null = null;
    let ceramicTex: THREE.CanvasTexture | null = null;
    let wallAoTex: THREE.CanvasTexture | null = null;
    let wallAoMat: THREE.MeshBasicMaterial | null = null;
    if (isMaquette) {
      oakTex = createOakFloorTexture(maxAniso);
      ceramicTex = createCeramicFloorTexture(maxAniso);
      wallAoTex = createWallAoTexture();
      wallAoMat = new THREE.MeshBasicMaterial({
        map: wallAoTex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      disposables.push(oakTex, ceramicTex, wallAoTex, wallAoMat);
    }

    const concretePlinthMat = new THREE.MeshStandardMaterial({
      color: MAQ_CONCRETE_PLINTH,
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.04,
    });
    disposables.push(concretePlinthMat);

    // --- BASE / GROUND PLANE ---
    const roomsWithPolygons = rooms.filter((r) => r.polygonM && r.polygonM.length >= 3);

    let shadowGroundMesh: THREE.Mesh | null = null;
    const aoStrips: THREE.Mesh[] = [];

    if (isMaquette) {
      // Seamless pure white studio floor catching crisp-yet-soft exterior shadows
      const shadowGroundGeo = new THREE.PlaneGeometry(diag * 14, diag * 14);
      shadowGroundGeo.rotateX(-Math.PI / 2);
      const shadowGroundMat = new THREE.ShadowMaterial({ opacity: 0.22 });
      const shadowGround = new THREE.Mesh(shadowGroundGeo, shadowGroundMat);
      shadowGround.position.set(0, -0.165, 0);
      shadowGround.receiveShadow = !isSoftwareGl;
      shadowGround.visible = initialShadowsOn;
      shadowGroundMesh = shadowGround;
      scene.add(shadowGround);
      disposables.push(shadowGroundGeo, shadowGroundMat);

      // Optional semi-transparent PDF floor-plan reference underlay in Maquette mode for 1:1 CAD tracing & cleanup
      if (showBlueprintOverlay && cleanFloorCanvas && cleanFloorCanvas.width > 0 && cleanFloorCanvas.height > 0) {
        const texCanvas = document.createElement('canvas');
        const maxTex = isSoftwareGl ? 1024 : 2048;
        const tScale = Math.min(1, maxTex / Math.max(cleanFloorCanvas.width, cleanFloorCanvas.height));
        texCanvas.width = Math.max(64, Math.round(cleanFloorCanvas.width * tScale));
        texCanvas.height = Math.max(64, Math.round(cleanFloorCanvas.height * tScale));
        const tCtx = texCanvas.getContext('2d');
        if (tCtx) {
          tCtx.fillStyle = '#ffffff';
          tCtx.fillRect(0, 0, texCanvas.width, texCanvas.height);
          tCtx.drawImage(cleanFloorCanvas, 0, 0, texCanvas.width, texCanvas.height);
          const refTex = new THREE.CanvasTexture(texCanvas);
          refTex.colorSpace = THREE.SRGBColorSpace;
          refTex.anisotropy = Math.min(8, maxAniso);
          refTex.needsUpdate = true;
          const refGeo = new THREE.PlaneGeometry(planWidthM, planHeightM);
          refGeo.rotateX(-Math.PI / 2);
          const refMat = new THREE.MeshBasicMaterial({
            map: refTex,
            transparent: true,
            opacity: 0.46,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3,
          });
          const refMesh = new THREE.Mesh(refGeo, refMat);
          refMesh.position.set(planWidthM * 0.5 - centerX, 0.022, planHeightM * 0.5 - centerZ);
          scene.add(refMesh);
          disposables.push(refTex, refGeo, refMat);
        }
      }

      if (roomsWithPolygons.length === 0 && hasGeo) {
        // Compute tight interior silhouette strips strictly inside the walls (NEVER a giant protruding bbox!)
        const tightRects = buildTightInteriorFloorRects(walls, boundsM);
        const fallbackRects =
          tightRects.length > 0
            ? tightRects
            : [{ x: boundsM.minX, y: boundsM.minY, w: spanX, h: spanZ }];

        const baseFloorMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: oakTex,
          roughness: 0.78,
          metalness: 0.0,
          envMapIntensity: 0.08,
        });
        disposables.push(baseFloorMat);

        for (const rc of fallbackRects) {
          const rx = rc.x + rc.w * 0.5 - centerX;
          const rz = rc.y + rc.h * 0.5 - centerZ;

          const pGeo = new THREE.BoxGeometry(rc.w, 0.16, rc.h);
          const pMesh = new THREE.Mesh(pGeo, concretePlinthMat);
          pMesh.position.set(rx, -0.08, rz);
          pMesh.castShadow = !isSoftwareGl;
          pMesh.receiveShadow = !isSoftwareGl;
          scene.add(pMesh);
          disposables.push(pGeo);

          const fGeo = new THREE.PlaneGeometry(rc.w, rc.h);
          fGeo.rotateX(-Math.PI / 2);
          const pos = fGeo.attributes.position;
          const uv = fGeo.attributes.uv;
          for (let i = 0; i < pos.count; i++) {
            uv.setXY(i, (pos.getX(i) + rx) / 1.85, (pos.getZ(i) + rz) / 1.85);
          }
          uv.needsUpdate = true;

          const fMesh = new THREE.Mesh(fGeo, baseFloorMat);
          fMesh.position.set(rx, 0.002, rz);
          fMesh.receiveShadow = !isSoftwareGl;
          scene.add(fMesh);
          disposables.push(fGeo);
        }
      }
    } else {
      // Optional Dark Technical Blueprint Mode (PDF texture on dark studio plinth)
      const plinthW = planWidthM + 1.6;
      const plinthH = planHeightM + 1.6;
      const baseOffsetX = planWidthM * 0.5 - centerX;
      const baseOffsetZ = planHeightM * 0.5 - centerZ;

      const plinthGeo = new THREE.BoxGeometry(plinthW, 0.28, plinthH);
      const plinthMat = new THREE.MeshStandardMaterial({
        color: DARK_BASE_PLINTH,
        roughness: 0.96,
        metalness: 0.0,
        envMapIntensity: 0.08,
      });
      const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
      plinthMesh.position.set(baseOffsetX, -0.15, baseOffsetZ);
      plinthMesh.receiveShadow = !isSoftwareGl;
      scene.add(plinthMesh);
      disposables.push(plinthGeo, plinthMat);

      const plinthEdgesGeo = new THREE.EdgesGeometry(plinthGeo);
      const plinthEdgesMat = new THREE.LineBasicMaterial({
        color: DARK_BASE_FRAME,
        transparent: true,
        opacity: 0.85,
      });
      const plinthEdges = new THREE.LineSegments(plinthEdgesGeo, plinthEdgesMat);
      plinthEdges.position.copy(plinthMesh.position);
      scene.add(plinthEdges);
      disposables.push(plinthEdgesGeo, plinthEdgesMat);

      let floorTexture: THREE.CanvasTexture | null = null;
      if (cleanFloorCanvas && cleanFloorCanvas.width > 0 && cleanFloorCanvas.height > 0) {
        const texCanvas = document.createElement('canvas');
        const maxTex = isSoftwareGl ? 1024 : 2048;
        const tScale = Math.min(1, maxTex / Math.max(cleanFloorCanvas.width, cleanFloorCanvas.height));
        texCanvas.width = Math.max(64, Math.round(cleanFloorCanvas.width * tScale));
        texCanvas.height = Math.max(64, Math.round(cleanFloorCanvas.height * tScale));
        const tCtx = texCanvas.getContext('2d');
        if (tCtx) {
          tCtx.fillStyle = '#f1f5f9';
          tCtx.fillRect(0, 0, texCanvas.width, texCanvas.height);
          tCtx.drawImage(cleanFloorCanvas, 0, 0, texCanvas.width, texCanvas.height);
          floorTexture = new THREE.CanvasTexture(texCanvas);
          floorTexture.colorSpace = THREE.SRGBColorSpace;
          floorTexture.anisotropy = Math.min(8, maxAniso);
          floorTexture.needsUpdate = true;
          disposables.push(floorTexture);
        }
      }

      const floorGeo = new THREE.PlaneGeometry(planWidthM, planHeightM);
      floorGeo.rotateX(-Math.PI / 2);
      const floorMat = new THREE.MeshLambertMaterial({
        color: 0xeef2f6,
        map: floorTexture,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.position.set(baseOffsetX, 0.002, baseOffsetZ);
      floorMesh.receiveShadow = !isSoftwareGl;
      scene.add(floorMesh);
      disposables.push(floorGeo, floorMat);
    }

    const pickMeshes: THREE.Mesh[] = [];
    const newEntries = new Map<string, InteractiveMeshEntry>();

    // Show full architectural maquette (walls, doors, windows, pillars, rooms) in BOTH 3D and BIM!
    const showKind = (kind: BimObjectKind): boolean => {
      if (mode === '3d') return true;
      return bimFilter === 'all' || bimFilter === kind;
    };

    const unitBodyGeo = new THREE.BoxGeometry(1, 0.96, 1);
    unitBodyGeo.translate(0, 0.48, 0);
    const unitCapGeo = new THREE.BoxGeometry(1.002, 0.04, 1.002);
    unitCapGeo.translate(0, 0.98, 0);
    const unitEdgesGeo = new THREE.EdgesGeometry(unitBodyGeo);
    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    unitBoxGeo.translate(0, 0.5, 0);
    const unitBoxEdgesGeo = new THREE.EdgesGeometry(unitBoxGeo);
    disposables.push(unitBodyGeo, unitCapGeo, unitEdgesGeo, unitBoxGeo, unitBoxEdgesGeo);

    // 1. WALLS (Supports orthogonal + diagonal angles!)
    if (showKind('wall')) {
      for (const wall of walls) {
        const dx = wall.x2M - wall.x1M;
        const dz = wall.y2M - wall.y1M;
        const angle =
          typeof wall.angleRad === 'number'
            ? wall.angleRad
            : Math.hypot(dx, dz) > 0.001
            ? Math.atan2(dz, dx)
            : wall.orientation === 'V'
            ? Math.PI / 2
            : 0;

        const wallGroup = new THREE.Group();
        wallGroup.position.set(wall.cxM - centerX, 0, wall.cyM - centerZ);
        wallGroup.rotation.y = -angle;

        const wLen = Math.max(0.15, wall.lengthM);
        const wH = Math.max(0.4, wall.heightM);
        const wT = Math.max(0.08, wall.thicknessM);

        // Concrete architectural slab strip + contact AO floor shadow beneath wall in Maquette mode
        if (isMaquette) {
          const baseSkirt = new THREE.Mesh(unitBoxGeo, concretePlinthMat);
          baseSkirt.position.set(0, -0.16, 0);
          baseSkirt.scale.set(wLen + wT * 0.35, 0.16, wT + 0.02);
          baseSkirt.castShadow = !isSoftwareGl;
          baseSkirt.receiveShadow = !isSoftwareGl;
          wallGroup.add(baseSkirt);

          if (wallAoMat) {
            const aoPlaneGeo = new THREE.PlaneGeometry(wLen + 0.06, wT + 0.28);
            aoPlaneGeo.rotateX(-Math.PI / 2);
            const aoStrip = new THREE.Mesh(aoPlaneGeo, wallAoMat);
            aoStrip.position.set(0, 0.015, 0);
            aoStrip.visible = initialShadowsOn;
            aoStrips.push(aoStrip);
            wallGroup.add(aoStrip);
            disposables.push(aoPlaneGeo);
          }
        }

        const bodyColor = isMaquette
          ? MAQ_WALL_MATTE
          : wall.category === 'Muro Perimetrale'
          ? DARK_WALL_EXT
          : DARK_WALL_INT;
        const capColor = isMaquette ? MAQ_WALL_TOP_CAP : DARK_WALL_CAP;
        const edgeColor = isMaquette ? MAQ_WALL_EDGE : DARK_EDGE_DEFAULT;
        const edgeOpacity = isMaquette ? 0.42 : 0.82;

        const bodyMat = new THREE.MeshStandardMaterial({
          color: bodyColor,
          roughness: isMaquette ? 0.92 : 0.92,
          metalness: 0.0,
          envMapIntensity: isMaquette ? 0.04 : 0.14,
        });
        const capMat = new THREE.MeshStandardMaterial({
          color: capColor,
          emissive: isMaquette ? 0x121212 : 0x000000,
          roughness: 0.88,
          metalness: 0.0,
          envMapIntensity: isMaquette ? 0.04 : 0.1,
        });
        const edgeMat = new THREE.LineBasicMaterial({
          color: edgeColor,
          transparent: true,
          opacity: edgeOpacity,
        });

        const bodyMesh = new THREE.Mesh(unitBodyGeo, bodyMat);
        bodyMesh.scale.set(wLen, wH, wT);
        bodyMesh.castShadow = !isSoftwareGl;
        bodyMesh.receiveShadow = !isSoftwareGl;
        bodyMesh.userData.bimId = wall.id;

        const capMesh = new THREE.Mesh(unitCapGeo, capMat);
        capMesh.scale.set(wLen, wH, wT);
        capMesh.castShadow = !isSoftwareGl;
        capMesh.receiveShadow = !isSoftwareGl;
        capMesh.userData.bimId = wall.id;

        const edgeLine = new THREE.LineSegments(unitEdgesGeo, edgeMat);
        edgeLine.scale.set(wLen, wH, wT);

        wallGroup.add(bodyMesh, capMesh, edgeLine);
        scene.add(wallGroup);

        pickMeshes.push(bodyMesh, capMesh);
        newEntries.set(wall.id, {
          obj: wall,
          materials: isMaquette ? [bodyMat, capMat] : [bodyMat],
          baseColors: isMaquette ? [bodyColor, capColor] : [bodyColor],
          edgeMat,
          baseEdgeColor: edgeColor,
          baseEdgeOpacity: edgeOpacity,
        });
        disposables.push(bodyMat, capMat, edgeMat);
      }
    }

    // 2. DOORS (Matte white open hinged architectural doors in Maquette mode)
    if (showKind('door')) {
      for (const door of doors) {
        const angle =
          typeof door.angleRad === 'number'
            ? door.angleRad
            : door.orientation === 'V'
            ? Math.PI / 2
            : 0;

        const group = new THREE.Group();
        group.position.set(door.cxM - centerX, 0, door.cyM - centerZ);
        group.rotation.y = -angle;

        const frameColor = isMaquette ? MAQ_DOOR_FRAME : DARK_DOOR_FRAME;
        const leafColor = isMaquette ? MAQ_DOOR_LEAF : DARK_DOOR_PANEL;
        const edgeColor = isMaquette ? MAQ_WALL_EDGE : 0x451a03;
        const edgeOpacity = isMaquette ? 0.38 : 0.8;

        const frameMat = new THREE.MeshStandardMaterial({
          color: frameColor,
          roughness: 0.88,
          metalness: 0.0,
          envMapIntensity: isMaquette ? 0.08 : 0.15,
        });
        const panelMat = new THREE.MeshStandardMaterial({
          color: leafColor,
          roughness: 0.84,
          metalness: 0.0,
          envMapIntensity: isMaquette ? 0.09 : 0.15,
        });
        const handleMat = new THREE.MeshStandardMaterial({
          color: MAQ_DOOR_HANDLE,
          roughness: 0.35,
          metalness: 0.6,
          envMapIntensity: 0.3,
        });
        const edgeMat = new THREE.LineBasicMaterial({
          color: edgeColor,
          transparent: true,
          opacity: edgeOpacity,
        });

        const dThick = Math.max(0.09, door.thicknessM + 0.02);
        const jambW = 0.055;
        const leftJamb = new THREE.Mesh(unitBoxGeo, frameMat);
        leftJamb.scale.set(jambW, door.heightM, dThick);
        leftJamb.position.set(-door.widthM * 0.5 + jambW * 0.5, 0, 0);
        leftJamb.castShadow = !isSoftwareGl;
        leftJamb.receiveShadow = !isSoftwareGl;
        leftJamb.userData.bimId = door.id;

        const rightJamb = new THREE.Mesh(unitBoxGeo, frameMat);
        rightJamb.scale.set(jambW, door.heightM, dThick);
        rightJamb.position.set(door.widthM * 0.5 - jambW * 0.5, 0, 0);
        rightJamb.castShadow = !isSoftwareGl;
        rightJamb.receiveShadow = !isSoftwareGl;
        rightJamb.userData.bimId = door.id;

        const header = new THREE.Mesh(unitBoxGeo, frameMat);
        header.scale.set(door.widthM, 0.06, dThick);
        header.position.set(0, door.heightM - 0.06, 0);
        header.castShadow = !isSoftwareGl;
        header.userData.bimId = door.id;

        const leafW = Math.max(0.35, door.widthM - jambW * 2);
        const leafH = Math.max(0.5, door.heightM - 0.065);

        // Hinged door pivot swung open ~40° into the room (matches architectural maquette!)
        const hingePivot = new THREE.Group();
        hingePivot.position.set(-door.widthM * 0.5 + jambW, 0, 0);
        const swingSign = door.swingSign === -1 ? -1 : 1;
        if (door.doorType !== 'Porta Scorrevole') {
          hingePivot.rotation.y = isMaquette ? swingSign * 0.72 : 0;
        }

        const leaf = new THREE.Mesh(unitBoxGeo, panelMat);
        leaf.scale.set(leafW, leafH, 0.042);
        leaf.position.set(leafW * 0.5, 0.004, 0);
        leaf.castShadow = !isSoftwareGl;
        leaf.receiveShadow = !isSoftwareGl;
        leaf.userData.bimId = door.id;

        const leafEdge = new THREE.LineSegments(unitBoxEdgesGeo, edgeMat);
        leafEdge.scale.copy(leaf.scale);
        leafEdge.position.copy(leaf.position);

        // Minimalist silver lever handle
        const handle = new THREE.Mesh(unitBoxGeo, handleMat);
        handle.scale.set(0.11, 0.022, 0.095);
        handle.position.set(leafW - 0.11, 1.0, 0);
        handle.userData.bimId = door.id;

        hingePivot.add(leaf, leafEdge, handle);

        // Transom wall above door up to wallHeightM
        if (wallHeightM > door.heightM + 0.08) {
          const transomH = wallHeightM - door.heightM;
          const transomMat = new THREE.MeshStandardMaterial({
            color: isMaquette ? MAQ_WALL_MATTE : DARK_WALL_INT,
            roughness: 0.9,
            metalness: 0.0,
            envMapIntensity: isMaquette ? 0.08 : 0.14,
          });
          const transom = new THREE.Mesh(unitBoxGeo, transomMat);
          transom.scale.set(door.widthM, transomH, door.thicknessM);
          transom.position.set(0, door.heightM, 0);
          transom.castShadow = !isSoftwareGl;
          transom.receiveShadow = !isSoftwareGl;
          transom.userData.bimId = door.id;
          group.add(transom);
          disposables.push(transomMat);
        }

        group.add(leftJamb, rightJamb, header, hingePivot);
        scene.add(group);

        pickMeshes.push(leftJamb, rightJamb, header, leaf);
        newEntries.set(door.id, {
          obj: door,
          materials: [panelMat, frameMat],
          baseColors: [leafColor, frameColor],
          edgeMat,
          baseEdgeColor: edgeColor,
          baseEdgeOpacity: edgeOpacity,
        });
        disposables.push(frameMat, panelMat, handleMat, edgeMat);
      }
    }

    // 3. WINDOWS & PORTEFINESTRE (Minimalist slim aluminum/white frames + clean translucent glass)
    if (showKind('window')) {
      for (const win of windows) {
        const angle =
          typeof win.angleRad === 'number'
            ? win.angleRad
            : win.orientation === 'V'
            ? Math.PI / 2
            : 0;

        const group = new THREE.Group();
        group.position.set(win.cxM - centerX, 0, win.cyM - centerZ);
        group.rotation.y = -angle;

        const sillColor = isMaquette ? MAQ_WALL_MATTE : DARK_WALL_EXT;
        const frameColor = isMaquette ? MAQ_WIN_FRAME : DARK_WIN_FRAME;
        const glassColor = isMaquette ? MAQ_WIN_GLASS : DARK_WIN_GLASS;
        const edgeColor = isMaquette ? 0x9aa5b5 : 0xe0f2fe;
        const edgeOpacity = isMaquette ? 0.45 : 0.85;

        const sillMat = new THREE.MeshStandardMaterial({
          color: sillColor,
          roughness: 0.9,
          metalness: 0.0,
          envMapIntensity: isMaquette ? 0.08 : 0.14,
        });
        const frameMat = new THREE.MeshStandardMaterial({
          color: frameColor,
          roughness: isMaquette ? 0.55 : 0.75,
          metalness: 0.12,
          envMapIntensity: isMaquette ? 0.18 : 0.2,
        });
        const glassMat = new THREE.MeshStandardMaterial({
          color: glassColor,
          roughness: 0.18,
          metalness: 0.08,
          envMapIntensity: 0.35,
          transparent: true,
          opacity: isMaquette ? 0.34 : 0.55,
          depthWrite: false,
        });
        const edgeMat = new THREE.LineBasicMaterial({
          color: edgeColor,
          transparent: true,
          opacity: edgeOpacity,
        });

        // Concrete base strip below window in maquette mode
        if (isMaquette) {
          const baseSkirt = new THREE.Mesh(unitBoxGeo, concretePlinthMat);
          baseSkirt.position.set(0, -0.16, 0);
          baseSkirt.scale.set(win.widthM + 0.04, 0.16, win.thicknessM + 0.02);
          baseSkirt.castShadow = !isSoftwareGl;
          group.add(baseSkirt);
        }

        if (win.sillHeightM > 0.08) {
          const underWall = new THREE.Mesh(unitBoxGeo, sillMat);
          underWall.scale.set(win.widthM, win.sillHeightM, win.thicknessM);
          underWall.castShadow = !isSoftwareGl;
          underWall.receiveShadow = !isSoftwareGl;
          underWall.userData.bimId = win.id;
          group.add(underWall);
          pickMeshes.push(underWall);
        }

        const frameY = Math.max(0.02, win.sillHeightM);
        const winH = Math.max(0.45, Math.min(win.heightM, wallHeightM - frameY));

        // Slim architectural perimeter frame
        const sillLedge = new THREE.Mesh(unitBoxGeo, frameMat);
        sillLedge.scale.set(win.widthM + 0.04, 0.055, win.thicknessM + 0.05);
        sillLedge.position.set(0, frameY, 0);
        sillLedge.castShadow = !isSoftwareGl;
        sillLedge.userData.bimId = win.id;

        const leftJamb = new THREE.Mesh(unitBoxGeo, frameMat);
        leftJamb.scale.set(0.055, winH, 0.085);
        leftJamb.position.set(-win.widthM * 0.5 + 0.028, frameY, 0);
        leftJamb.userData.bimId = win.id;

        const rightJamb = new THREE.Mesh(unitBoxGeo, frameMat);
        rightJamb.scale.set(0.055, winH, 0.085);
        rightJamb.position.set(win.widthM * 0.5 - 0.028, frameY, 0);
        rightJamb.userData.bimId = win.id;

        const topFrame = new THREE.Mesh(unitBoxGeo, frameMat);
        topFrame.scale.set(win.widthM, 0.055, 0.09);
        topFrame.position.set(0, frameY + winH - 0.055, 0);
        topFrame.userData.bimId = win.id;

        const glass = new THREE.Mesh(unitBoxGeo, glassMat);
        glass.scale.set(Math.max(0.25, win.widthM - 0.1), Math.max(0.3, winH - 0.1), 0.024);
        glass.position.set(0, frameY + 0.05, 0);
        glass.userData.bimId = win.id;

        // Add 1 or 2 slim vertical mullions depending on window width
        const mullionCount = win.widthM >= 2.2 ? 2 : win.widthM >= 0.95 ? 1 : 0;
        for (let mIdx = 0; mIdx < mullionCount; mIdx++) {
          const frac = (mIdx + 1) / (mullionCount + 1) - 0.5;
          const mullion = new THREE.Mesh(unitBoxGeo, frameMat);
          mullion.scale.set(0.042, winH - 0.06, 0.075);
          mullion.position.set(frac * win.widthM, frameY + 0.04, 0);
          mullion.userData.bimId = win.id;
          group.add(mullion);
          pickMeshes.push(mullion);
        }

        const glassEdge = new THREE.LineSegments(unitBoxEdgesGeo, edgeMat);
        glassEdge.scale.copy(glass.scale);
        glassEdge.position.copy(glass.position);

        const topY = frameY + winH;
        if (wallHeightM > topY + 0.08) {
          const lintel = new THREE.Mesh(unitBoxGeo, sillMat);
          lintel.scale.set(win.widthM, wallHeightM - topY, win.thicknessM);
          lintel.position.set(0, topY, 0);
          lintel.castShadow = !isSoftwareGl;
          lintel.receiveShadow = !isSoftwareGl;
          lintel.userData.bimId = win.id;
          group.add(lintel);
        }

        group.add(sillLedge, leftJamb, rightJamb, topFrame, glass, glassEdge);
        scene.add(group);

        pickMeshes.push(sillLedge, leftJamb, rightJamb, topFrame, glass);
        newEntries.set(win.id, {
          obj: win,
          materials: [glassMat, frameMat],
          baseColors: [glassColor, frameColor],
          edgeMat,
          baseEdgeColor: edgeColor,
          baseEdgeOpacity: edgeOpacity,
        });
        disposables.push(sillMat, frameMat, glassMat, edgeMat);
      }
    }

    // 4. PILLARS (Pure matte white columns in Maquette mode)
    if (showKind('pillar')) {
      for (const pil of pillars) {
        const group = new THREE.Group();
        group.position.set(pil.cxM - centerX, 0, pil.cyM - centerZ);
        group.scale.set(pil.widthM, Math.max(0.4, pil.heightM), pil.depthM);

        const bodyColor = isMaquette ? MAQ_WALL_MATTE : DARK_PILLAR_BODY;
        const capColor = isMaquette ? MAQ_WALL_TOP_CAP : DARK_PILLAR_CAP;
        const edgeColor = isMaquette ? MAQ_WALL_EDGE : 0xf8fafc;
        const edgeOpacity = isMaquette ? 0.38 : 0.7;

        const bodyMat = new THREE.MeshStandardMaterial({
          color: bodyColor,
          roughness: 0.9,
          metalness: 0.0,
          envMapIntensity: isMaquette ? 0.08 : 0.14,
        });
        const capMat = new THREE.MeshStandardMaterial({
          color: capColor,
          roughness: 0.86,
          metalness: 0.0,
          envMapIntensity: isMaquette ? 0.06 : 0.12,
        });
        const edgeMat = new THREE.LineBasicMaterial({
          color: edgeColor,
          transparent: true,
          opacity: edgeOpacity,
        });

        const bodyMesh = new THREE.Mesh(unitBodyGeo, bodyMat);
        bodyMesh.castShadow = !isSoftwareGl;
        bodyMesh.receiveShadow = !isSoftwareGl;
        bodyMesh.userData.bimId = pil.id;

        const capMesh = new THREE.Mesh(unitCapGeo, capMat);
        capMesh.castShadow = !isSoftwareGl;
        capMesh.userData.bimId = pil.id;

        const edgeLine = new THREE.LineSegments(unitEdgesGeo, edgeMat);
        group.add(bodyMesh, capMesh, edgeLine);
        scene.add(group);

        pickMeshes.push(bodyMesh, capMesh);
        newEntries.set(pil.id, {
          obj: pil,
          materials: isMaquette ? [bodyMat, capMat] : [bodyMat],
          baseColors: isMaquette ? [bodyColor, capColor] : [bodyColor],
          edgeMat,
          baseEdgeColor: edgeColor,
          baseEdgeOpacity: edgeOpacity,
        });
        disposables.push(bodyMat, capMat, edgeMat);
      }
    }

    // 5. ROOMS / FLOOR SLABS (Oak wood parquet & Light beige ceramic tiles in Maquette mode!)
    if (showKind('room')) {
      for (const rm of rooms) {
        const floorType = rm.floorType ?? inferRoomFloorType(rm.name);

        if (isMaquette) {
          const isOak = floorType === 'oak';
          const floorMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: isOak ? oakTex : ceramicTex,
            roughness: isOak ? 0.78 : 0.68,
            metalness: 0.0,
            envMapIntensity: isOak ? 0.08 : 0.1,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
          });

          let floorMesh: THREE.Mesh;
          if (rm.polygonM && rm.polygonM.length >= 3) {
            const polyGeo = buildPolygonFloorGeometry(rm.polygonM, centerX, centerZ, isOak ? 1.85 : 2.0);
            if (polyGeo) {
              floorMesh = new THREE.Mesh(polyGeo, floorMat);
              floorMesh.position.y = 0.004;
              floorMesh.receiveShadow = !isSoftwareGl;
              floorMesh.userData.bimId = rm.id;
              scene.add(floorMesh);
              disposables.push(polyGeo);

              // Extruded concrete architectural slab directly beneath this room polygon
              const plinthPolyGeo = buildPolygonPlinthGeometry(rm.polygonM, centerX, centerZ, 0.16);
              if (plinthPolyGeo) {
                const plinthPolyMesh = new THREE.Mesh(plinthPolyGeo, concretePlinthMat);
                plinthPolyMesh.castShadow = !isSoftwareGl;
                plinthPolyMesh.receiveShadow = !isSoftwareGl;
                scene.add(plinthPolyMesh);
                disposables.push(plinthPolyGeo);
              }
            } else {
              continue;
            }
          } else {
            // Rectangular room slab fallback with proper world-scale UVs and zero Z-fighting
            const rectGeo = new THREE.PlaneGeometry(rm.widthM, rm.depthM);
            rectGeo.rotateX(-Math.PI / 2);
            const scaleM = isOak ? 1.85 : 2.0;
            const pos = rectGeo.attributes.position;
            const uv = rectGeo.attributes.uv;
            for (let i = 0; i < pos.count; i++) {
              uv.setXY(i, (pos.getX(i) + rm.cxM) / scaleM, (pos.getZ(i) + rm.cyM) / scaleM);
            }
            uv.needsUpdate = true;

            floorMesh = new THREE.Mesh(rectGeo, floorMat);
            floorMesh.position.set(rm.cxM - centerX, 0.011, rm.cyM - centerZ);
            floorMesh.receiveShadow = !isSoftwareGl;
            floorMesh.userData.bimId = rm.id;
            scene.add(floorMesh);
            disposables.push(rectGeo);
          }

          pickMeshes.push(floorMesh);
          newEntries.set(rm.id, {
            obj: rm,
            materials: [floorMat],
            baseColors: [0xffffff],
          });
          disposables.push(floorMat);
        } else {
          // Dark technical blueprint mode translucent room overlay
          const slabMat = new THREE.MeshStandardMaterial({
            color: DARK_ROOM_SLAB,
            roughness: 0.95,
            metalness: 0.0,
            envMapIntensity: 0.0,
            transparent: true,
            opacity: 0.22,
          });
          const edgeMat = new THREE.LineBasicMaterial({
            color: 0x0284c7,
            transparent: true,
            opacity: 0.65,
          });
          const slab = new THREE.Mesh(unitBoxGeo, slabMat);
          slab.position.set(rm.cxM - centerX, 0.008, rm.cyM - centerZ);
          slab.scale.set(rm.widthM, 0.03, rm.depthM);
          slab.userData.bimId = rm.id;

          const edge = new THREE.LineSegments(unitBoxEdgesGeo, edgeMat);
          edge.position.copy(slab.position);
          edge.scale.copy(slab.scale);

          scene.add(slab, edge);
          pickMeshes.push(slab);
          newEntries.set(rm.id, {
            obj: rm,
            materials: [slabMat],
            baseColors: [DARK_ROOM_SLAB],
            edgeMat,
            baseEdgeColor: 0x0284c7,
            baseEdgeOpacity: 0.65,
          });
          disposables.push(slabMat, edgeMat);
        }
      }
    }

    // 6. BALCONY RAILINGS / PARAPETS (Minimalist matte-silver architectural balustrade)
    if (railings.length > 0) {
      const railMat = new THREE.MeshStandardMaterial({
        color: isMaquette ? MAQ_RAILING_METAL : 0x94a3b8,
        roughness: 0.5,
        metalness: 0.28,
        envMapIntensity: 0.25,
      });
      disposables.push(railMat);

      for (const rl of railings) {
        const dx = rl.x2M - rl.x1M;
        const dz = rl.y2M - rl.y1M;
        const len = Math.hypot(dx, dz);
        if (len < 0.35) continue;

        const angle = Math.atan2(dz, dx);
        const h = Math.max(0.85, Math.min(1.25, rl.heightM || 1.05));
        const rGroup = new THREE.Group();
        rGroup.position.set((rl.x1M + rl.x2M) * 0.5 - centerX, 0, (rl.y1M + rl.y2M) * 0.5 - centerZ);
        rGroup.rotation.y = -angle;

        const topRail = new THREE.Mesh(unitBoxGeo, railMat);
        topRail.scale.set(len, 0.04, 0.045);
        topRail.position.set(0, h - 0.04, 0);
        topRail.castShadow = !isSoftwareGl;

        const botRail = new THREE.Mesh(unitBoxGeo, railMat);
        botRail.scale.set(len, 0.032, 0.038);
        botRail.position.set(0, 0.06, 0);

        rGroup.add(topRail, botRail);

        const steps = Math.max(2, Math.round(len / 0.14));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps - 0.5;
          const post = new THREE.Mesh(unitBoxGeo, railMat);
          const isEnd = i === 0 || i === steps;
          const thick = isEnd ? 0.032 : 0.018;
          post.scale.set(thick, h - 0.02, thick);
          post.position.set(t * len, 0, 0);
          post.castShadow = !isSoftwareGl;
          rGroup.add(post);
        }

        scene.add(rGroup);
      }
    }

    // 7. DEDICATED TOGGLEABLE QUOTE LAYER IN 3D/BIM
    const quotesGroup = new THREE.Group();
    quotesGroup.visible = showQuotesLayer;
    const cappedQuotes = significantQuotes.slice(0, 40);
    const spriteScale = Math.max(0.85, Math.min(2.4, diag * 0.085));
    for (const q of cappedQuotes) {
      const tex = makeQuoteSpriteTexture(q.text, q.kind === 'room', isMaquette);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(
        q.xM - centerX,
        q.kind === 'room' ? 0.35 : wallHeightM + 0.45,
        q.yM - centerZ
      );
      sprite.scale.set(spriteScale * 1.45, spriteScale * 0.42, 1);
      quotesGroup.add(sprite);
      disposables.push(tex, mat);
    }
    scene.add(quotesGroup);
    quotesGroupRef.current = quotesGroup;

    entriesRef.current = newEntries;

    let isTransitioning = false;
    const setCameraPreset = (preset: CameraPreset, immediate = false) => {
      const hFocus = Math.min(wallHeightM * 0.25, 1.1);
      _targetLook.set(0, hFocus, 0);
      if (preset === 'top') {
        _targetPos.set(0, diag * 1.55, 0.01);
      } else if (preset === 'front') {
        _targetPos.set(0, diag * 0.44, diag * 1.32);
      } else {
        // Classic elevated architectural cutaway isometric angle (matches reference image)
        const mult = isMaquette ? 0.94 : 0.78;
        _targetPos.set(diag * mult * 0.85, diag * mult * 1.02, diag * mult * 0.92);
      }

      if (immediate || isSoftwareGl) {
        camera.position.copy(_targetPos);
        controls.target.copy(_targetLook);
        controls.update();
        isTransitioning = false;
        requestRender();
      } else {
        isTransitioning = true;
        requestRender();
      }
    };
    applyPresetRef.current = (preset: CameraPreset) => setCameraPreset(preset, false);

    let rafId = 0;
    let disposed = false;
    let lastTime = performance.now();

    const afterDraw = (onDone: () => void) => {
      if (!isSoftwareGl) {
        onDone();
        return;
      }
      const gl = renderer.getContext();
      if ('fenceSync' in gl) {
        const gl2 = gl as WebGL2RenderingContext;
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl2.flush();
          const poll = () => {
            if (disposed) {
              gl2.deleteSync(sync);
              return;
            }
            const status = gl2.clientWaitSync(sync, 0, 0);
            if (status === gl2.TIMEOUT_EXPIRED) {
              requestAnimationFrame(poll);
            } else {
              gl2.deleteSync(sync);
              onDone();
            }
          };
          requestAnimationFrame(poll);
          return;
        }
      }
      onDone();
    };

    const drawFrame = () => {
      rafId = 0;
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      let needsMore = false;
      if (isTransitioning) {
        const lambda = 7.5;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetPos.x, lambda, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetPos.y, lambda, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetPos.z, lambda, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetLook.x, lambda, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetLook.y, lambda, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetLook.z, lambda, dt);
        if (
          camera.position.distanceTo(_targetPos) < 0.04 &&
          controls.target.distanceTo(_targetLook) < 0.04
        ) {
          camera.position.copy(_targetPos);
          controls.target.copy(_targetLook);
          isTransitioning = false;
        } else {
          needsMore = true;
        }
      }

      const dampingActive = controls.update();
      savedCameraRef.current = {
        pos: camera.position.clone(),
        target: controls.target.clone(),
      };
      renderer.render(scene, camera);

      if (needsMore || (!isSoftwareGl && dampingActive)) {
        afterDraw(() => requestRender());
      }
    };

    const requestRender = () => {
      if (disposed || rafId !== 0) return;
      rafId = requestAnimationFrame(drawFrame);
    };
    requestRenderRef.current = requestRender;

    const onControlStart = () => {
      isTransitioning = false;
    };
    const onControlChange = () => {
      requestRender();
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

    const modelKey = `${planWidthM.toFixed(1)}_${planHeightM.toFixed(1)}_${lumaVersion}_${bimModel.source || 'local'}`;
    if (savedCameraRef.current && lastModelKeyRef.current === modelKey) {
      camera.position.copy(savedCameraRef.current.pos);
      controls.target.copy(savedCameraRef.current.target);
      controls.update();
    } else {
      lastModelKeyRef.current = modelKey;
      setCameraPreset('iso', true);
    }

    // --- LIVE 3D CAD PREVIEW GHOSTS (Wall drawing, Snap marker, Door/Window/Pillar placement) ---
    const cadPreviewGroup = new THREE.Group();
    const snapRingGeo = new THREE.RingGeometry(0.09, 0.17, 24);
    snapRingGeo.rotateX(-Math.PI / 2);
    const snapRingMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const snapRing = new THREE.Mesh(snapRingGeo, snapRingMat);
    snapRing.position.y = 0.05;
    snapRing.visible = false;

    const previewWallGeo = new THREE.BoxGeometry(1, 1, 1);
    previewWallGeo.translate(0, 0.5, 0);
    const previewWallMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x065f46,
      transparent: true,
      opacity: 0.55,
      roughness: 0.5,
      depthWrite: false,
    });
    const previewWallMesh = new THREE.Mesh(previewWallGeo, previewWallMat);
    previewWallMesh.visible = false;

    const previewOpeningMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0369a1,
      transparent: true,
      opacity: 0.6,
      roughness: 0.4,
      depthWrite: false,
    });
    const previewOpeningMesh = new THREE.Mesh(previewWallGeo, previewOpeningMat);
    previewOpeningMesh.visible = false;

    cadPreviewGroup.add(snapRing, previewWallMesh, previewOpeningMesh);
    scene.add(cadPreviewGroup);
    disposables.push(snapRingGeo, snapRingMat, previewWallGeo, previewWallMat, previewOpeningMat);

    const hideCadPreviews = () => {
      snapRing.visible = false;
      previewWallMesh.visible = false;
      previewOpeningMesh.visible = false;
      requestRender();
    };
    clearCadPreviewRef.current = hideCadPreviews;

    // Collect existing wall endpoints for AutoCAD endpoint snapping
    const wallSnapPts: Array<{ xM: number; yM: number }> = [];
    for (const w of walls) {
      wallSnapPts.push({ xM: w.x1M, yM: w.y1M }, { xM: w.x2M, yM: w.y2M });
    }

    const raycastGroundPlanM = (clientX: number, clientY: number): { xM: number; yM: number } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_ndc, camera);
      const hit = _raycaster.ray.intersectPlane(_groundPlane, _planeHit);
      if (!hit) return null;
      return {
        xM: hit.x + centerX,
        yM: hit.z + centerZ,
      };
    };

    const snapPlanPoint = (
      raw: { xM: number; yM: number },
      anchor: { xM: number; yM: number } | null,
      forceOrtho: boolean
    ): { xM: number; yM: number; snapped: boolean } => {
      let xM = raw.xM;
      let yM = raw.yM;
      let snapped = false;

      // 1. Endpoint snap to existing walls (within 32 cm)
      let bestDist = 0.32;
      for (const pt of wallSnapPts) {
        const d = Math.hypot(pt.xM - raw.xM, pt.yM - raw.yM);
        if (d < bestDist) {
          bestDist = d;
          xM = pt.xM;
          yM = pt.yM;
          snapped = true;
        }
      }

      // 2. Auto-ortho (within ~6°) or forced ortho (Shift) relative to start point
      if (anchor && !snapped) {
        const dx = xM - anchor.xM;
        const dy = yM - anchor.yM;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.08) {
          const ang = Math.atan2(dy, dx);
          const nearest90 = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
          if (forceOrtho || Math.abs(ang - nearest90) < 0.11) {
            const isHoriz = Math.abs(Math.cos(nearest90)) > 0.5;
            if (isHoriz) {
              yM = anchor.yM;
            } else {
              xM = anchor.xM;
            }
            snapped = true;
          }
        }
      }

      return {
        xM: Math.round(xM * 100) / 100,
        yM: Math.round(yM * 100) / 100,
        snapped,
      };
    };

    const pickObjWithPointAt = (
      clientX: number,
      clientY: number
    ): { obj: BimObject; point: THREE.Vector3 } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_ndc, camera);
      const hits = _raycaster.intersectObjects(pickMeshes, false);
      if (hits.length === 0) return null;
      const bimId = hits[0].object.userData?.bimId as string | undefined;
      if (!bimId) return null;
      const entry = newEntries.get(bimId);
      if (!entry) return null;
      return { obj: entry.obj, point: hits[0].point };
    };

    const pickObjAt = (clientX: number, clientY: number): BimObject | null =>
      pickObjWithPointAt(clientX, clientY)?.obj ?? null;

    const projectWallHitPlacement = (
      wall: BimWallObject,
      hitPoint: THREE.Vector3,
      openingWidthM: number
    ) => {
      const dx = wall.x2M - wall.x1M;
      const dy = wall.y2M - wall.y1M;
      const len = Math.max(0.2, Math.hypot(dx, dy));
      const ux = dx / len;
      const uy = dy / len;
      const px = hitPoint.x + centerX;
      const py = hitPoint.z + centerZ;
      const rawT = (px - wall.x1M) * ux + (py - wall.y1M) * uy;
      const half = Math.min(openingWidthM * 0.5, len * 0.45);
      const clampedT = Math.max(half, Math.min(len - half, rawT));
      const cxM = Math.round((wall.x1M + ux * clampedT) * 100) / 100;
      const cyM = Math.round((wall.y1M + uy * clampedT) * 100) / 100;
      const angleRad =
        typeof wall.angleRad === 'number' ? wall.angleRad : Math.atan2(dy, dx);
      const orientation: 'H' | 'V' = Math.abs(Math.cos(angleRad)) >= 0.5 ? 'H' : 'V';
      return { cxM, cyM, angleRad, orientation, thicknessM: wall.thicknessM };
    };

    // CAD Mouse & BIM Object Picking + Edit Tools
    let pointerDownPos: { x: number; y: number } | null = null;
    let eraseBoxStart: { x: number; y: number } | null = null;
    let isMiddlePanning = false;
    let lastHoverTime = 0;

    const onMouseDownPreventAutoscroll = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        isMiddlePanning = true;
        renderer.domElement.style.cursor = 'grabbing';
        return;
      }
      if (e.button === 0) {
        pointerDownPos = { x: e.clientX, y: e.clientY };
        if (editToolRef.current === 'erase_box') {
          const rect = renderer.domElement.getBoundingClientRect();
          const lx = e.clientX - rect.left;
          const ly = e.clientY - rect.top;
          eraseBoxStart = { x: lx, y: ly };
          setEraseBoxRect({ x: lx, y: ly, w: 0, h: 0 });
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isMiddlePanning) return;
      const tool = editToolRef.current;

      // Active Box-Eraser drag
      if (tool === 'erase_box' && eraseBoxStart) {
        const rect = renderer.domElement.getBoundingClientRect();
        const cx = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const cy = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        setEraseBoxRect({
          x: Math.min(eraseBoxStart.x, cx),
          y: Math.min(eraseBoxStart.y, cy),
          w: Math.abs(cx - eraseBoxStart.x),
          h: Math.abs(cy - eraseBoxStart.y),
        });
        renderer.domElement.style.cursor = 'crosshair';
        return;
      }

      const now = performance.now();
      if (now - lastHoverTime < 28) return;
      lastHoverTime = now;

      // CAD Draw Wall live 3D preview
      if (tool === 'draw_wall') {
        renderer.domElement.style.cursor = 'crosshair';
        const raw = raycastGroundPlanM(e.clientX, e.clientY);
        if (!raw) {
          hideCadPreviews();
          return;
        }
        const snapped = snapPlanPoint(raw, drawStartRef.current, e.shiftKey);
        snapRing.position.set(snapped.xM - centerX, 0.05, snapped.yM - centerZ);
        snapRingMat.color.setHex(snapped.snapped ? 0x22c55e : 0x38bdf8);
        snapRing.visible = true;

        if (drawStartRef.current) {
          const sx = drawStartRef.current.xM;
          const sy = drawStartRef.current.yM;
          const dx = snapped.xM - sx;
          const dy = snapped.yM - sy;
          const len = Math.hypot(dx, dy);
          if (len >= 0.08) {
            const ang = Math.atan2(dy, dx);
            const thick = newWallPresetRef.current === 'perimeter' ? 0.3 : 0.12;
            const wH = wallHeightMRef.current;
            previewWallMesh.position.set((sx + snapped.xM) * 0.5 - centerX, 0, (sy + snapped.yM) * 0.5 - centerZ);
            previewWallMesh.rotation.y = -ang;
            previewWallMesh.scale.set(len, wH, thick);
            previewWallMesh.visible = true;
            setDrawStatusText(
              `Nuovo ${newWallPresetRef.current === 'perimeter' ? 'Muro Perimetrale (0.30m)' : 'Tramezzo (0.12m)'} · L = ${len.toFixed(2)} m · Clicca per confermare (Esc annulla)`
            );
          } else {
            previewWallMesh.visible = false;
          }
        } else {
          previewWallMesh.visible = false;
          setDrawStatusText(
            snapped.snapped
              ? 'Snap angolo attivo · Clicca punto iniziale del muro'
              : 'Clicca punto iniziale del muro (Shift: ortogonale · Tasto destro: ruota)'
          );
        }
        previewOpeningMesh.visible = false;
        requestRender();
        return;
      }

      // CAD Add Door / Window live preview on hovered wall
      if (tool === 'add_door' || tool === 'add_window') {
        renderer.domElement.style.cursor = 'crosshair';
        const hitInfo = pickObjWithPointAt(e.clientX, e.clientY);
        if (hitInfo && hitInfo.obj.kind === 'wall') {
          const opW = tool === 'add_door' ? 0.85 : 1.2;
          const opH = tool === 'add_door' ? 2.1 : 1.4;
          const opY = tool === 'add_door' ? 0 : 1.0;
          const placed = projectWallHitPlacement(hitInfo.obj, hitInfo.point, opW);
          previewOpeningMesh.position.set(placed.cxM - centerX, opY, placed.cyM - centerZ);
          previewOpeningMesh.rotation.y = -placed.angleRad;
          previewOpeningMesh.scale.set(opW, opH, placed.thicknessM + 0.08);
          previewOpeningMat.color.setHex(tool === 'add_door' ? 0xf59e0b : 0x0ea5e9);
          previewOpeningMesh.visible = true;
          snapRing.visible = false;
          previewWallMesh.visible = false;
          setDrawStatusText(
            tool === 'add_door'
              ? `Clicca sul muro ${hitInfo.obj.code} per aprire Porta (0,85 × 2,10 m)`
              : `Clicca sul muro ${hitInfo.obj.code} per aprire Finestra (1,20 × 1,40 m)`
          );
          requestRender();
        } else {
          previewOpeningMesh.visible = false;
          setDrawStatusText(
            tool === 'add_door'
              ? 'Passa il mouse sopra un muro per posizionare una Porta'
              : 'Passa il mouse sopra un muro per posizionare una Finestra'
          );
          requestRender();
        }
        return;
      }

      // CAD Add Pillar live preview on floor
      if (tool === 'add_pillar') {
        renderer.domElement.style.cursor = 'crosshair';
        const raw = raycastGroundPlanM(e.clientX, e.clientY);
        if (raw) {
          const snapped = snapPlanPoint(raw, null, false);
          previewWallMesh.position.set(snapped.xM - centerX, 0, snapped.yM - centerZ);
          previewWallMesh.rotation.y = 0;
          previewWallMesh.scale.set(0.35, wallHeightMRef.current, 0.35);
          previewWallMesh.visible = true;
          snapRing.visible = false;
          previewOpeningMesh.visible = false;
          setDrawStatusText('Clicca sul pavimento per posizionare Pilastro 0,35 × 0,35 m');
          requestRender();
        }
        return;
      }

      // Default or Erase-Click hover picking
      const hit = pickObjAt(e.clientX, e.clientY);
      const hitId = hit?.id ?? null;
      if (hitId !== hoveredIdRef.current) {
        hoveredIdRef.current = hitId;
        setHoveredObj(hit);
        renderer.domElement.style.cursor =
          tool === 'erase_click'
            ? hit
              ? 'crosshair'
              : 'grab'
            : tool === 'erase_box'
            ? 'crosshair'
            : hit
            ? 'pointer'
            : 'grab';
        refreshObjectColors();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 1) {
        isMiddlePanning = false;
        renderer.domElement.style.cursor = hoveredIdRef.current ? 'pointer' : 'grab';
        return;
      }
      if (e.button !== 0) return;

      const tool = editToolRef.current;

      // Complete Box-Eraser selection
      if (tool === 'erase_box' && eraseBoxStart) {
        const rect = renderer.domElement.getBoundingClientRect();
        const endX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const endY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        const minX = Math.min(eraseBoxStart.x, endX);
        const maxX = Math.max(eraseBoxStart.x, endX);
        const minY = Math.min(eraseBoxStart.y, endY);
        const maxY = Math.max(eraseBoxStart.y, endY);
        eraseBoxStart = null;
        pointerDownPos = null;
        setEraseBoxRect(null);

        if (maxX - minX >= 8 && maxY - minY >= 8 && onDeleteMultipleBimObjectsRef.current) {
          const isInsideBox = (wx: number, wy: number, wz: number): boolean => {
            _projVec.set(wx, wy, wz).project(camera);
            if (_projVec.z < -1 || _projVec.z > 1) return false;
            const sx = (_projVec.x * 0.5 + 0.5) * rect.width;
            const sy = (-_projVec.y * 0.5 + 0.5) * rect.height;
            return sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;
          };

          const toDelete: Array<{ id: string; kind: BimObjectKind }> = [];
          newEntries.forEach(({ obj }) => {
            if (obj.kind === 'room') return; // Protect room floor slabs during bulk wall cleanup
            if (obj.kind === 'wall') {
              const midIn = isInsideBox(obj.cxM - centerX, obj.heightM * 0.5, obj.cyM - centerZ);
              const p1In = isInsideBox(obj.x1M - centerX, obj.heightM * 0.5, obj.y1M - centerZ);
              const p2In = isInsideBox(obj.x2M - centerX, obj.heightM * 0.5, obj.y2M - centerZ);
              if (midIn || (p1In && p2In)) {
                toDelete.push({ id: obj.id, kind: 'wall' });
              }
            } else {
              const cy = obj.kind === 'window' ? obj.sillHeightM + obj.heightM * 0.5 : obj.heightM * 0.5;
              if (isInsideBox(obj.cxM - centerX, cy, obj.cyM - centerZ)) {
                toDelete.push({ id: obj.id, kind: obj.kind });
              }
            }
          });
          if (toDelete.length > 0) {
            onDeleteMultipleBimObjectsRef.current(toDelete);
          }
        }
        return;
      }

      if (!pointerDownPos) return;
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      pointerDownPos = null;
      if (dist > 6) return;

      // Tool: 1-Click Eraser
      if (tool === 'erase_click') {
        const hit = pickObjAt(e.clientX, e.clientY);
        if (hit) {
          onDeleteBimObjectRef.current(hit.id, hit.kind);
          if (inspectedIdRef.current === hit.id) setInspectedId(null);
        }
        return;
      }

      // Tool: 2-Point Snapped Wall Drawer
      if (tool === 'draw_wall') {
        const raw = raycastGroundPlanM(e.clientX, e.clientY);
        if (!raw) return;
        const snapped = snapPlanPoint(raw, drawStartRef.current, e.shiftKey);
        if (!drawStartRef.current) {
          drawStartRef.current = { xM: snapped.xM, yM: snapped.yM };
          setDrawStatusText('Punto iniziale fissato · Muovi e clicca punto finale del muro (Esc annulla)');
        } else {
          const sx = drawStartRef.current.xM;
          const sy = drawStartRef.current.yM;
          const len = Math.hypot(snapped.xM - sx, snapped.yM - sy);
          drawStartRef.current = null;
          hideCadPreviews();
          if (len >= 0.2 && onAddBimObjectRef.current) {
            const isPerim = newWallPresetRef.current === 'perimeter';
            const angleRad = Math.atan2(snapped.yM - sy, snapped.xM - sx);
            const orientation: 'H' | 'V' = Math.abs(Math.cos(angleRad)) >= 0.5 ? 'H' : 'V';
            const nextNum = bimModelRef.current.walls.length + 1;
            const code = `${isPerim ? 'MP' : 'TR'}${nextNum}`;
            const newWall: BimWallObject = {
              id: makeCadUid('wall'),
              kind: 'wall',
              code,
              name: `${isPerim ? 'Muro Perimetrale' : 'Tramezzo'} ${code}`,
              category: isPerim ? 'Muro Perimetrale' : 'Tramezzo Interno',
              material: isPerim ? 'Muratura / Tamponatura' : 'Laterizio / Cartongesso',
              x1M: sx,
              y1M: sy,
              x2M: snapped.xM,
              y2M: snapped.yM,
              cxM: Math.round(((sx + snapped.xM) * 0.5) * 100) / 100,
              cyM: Math.round(((sy + snapped.yM) * 0.5) * 100) / 100,
              lengthM: Math.round(len * 100) / 100,
              thicknessM: isPerim ? 0.3 : 0.12,
              heightM: wallHeightMRef.current,
              orientation,
              angleRad,
            };
            onAddBimObjectRef.current(newWall);
            setDrawStatusText(`Muro ${code} (${newWall.lengthM.toFixed(2)} m) aggiunto · Clicca per disegnarne un altro`);
          }
        }
        return;
      }

      // Tool: Add Door or Window on clicked Wall (auto-carves opening!)
      if (tool === 'add_door' || tool === 'add_window') {
        const hitInfo = pickObjWithPointAt(e.clientX, e.clientY);
        if (!hitInfo || hitInfo.obj.kind !== 'wall' || !onAddBimObjectRef.current) return;
        const opW = tool === 'add_door' ? 0.85 : 1.2;
        const placed = projectWallHitPlacement(hitInfo.obj, hitInfo.point, opW);
        hideCadPreviews();

        if (tool === 'add_door') {
          const nextNum = bimModelRef.current.doors.length + 1;
          const code = `P${nextNum}`;
          const newDoor: BimDoorObject = {
            id: makeCadUid('door'),
            kind: 'door',
            code,
            name: `Porta ${code}`,
            doorType: 'Porta Interna',
            cxM: placed.cxM,
            cyM: placed.cyM,
            widthM: opW,
            heightM: 2.1,
            thicknessM: placed.thicknessM,
            orientation: placed.orientation,
            angleRad: placed.angleRad,
            swingSign: 1,
          };
          onAddBimObjectRef.current(newDoor);
        } else {
          const nextNum = bimModelRef.current.windows.length + 1;
          const code = `F${nextNum}`;
          const newWin: BimWindowObject = {
            id: makeCadUid('win'),
            kind: 'window',
            code,
            name: `Finestra ${code}`,
            windowType: 'Finestra PVC/Alluminio',
            cxM: placed.cxM,
            cyM: placed.cyM,
            widthM: opW,
            heightM: 1.4,
            sillHeightM: 1.0,
            thicknessM: placed.thicknessM,
            orientation: placed.orientation,
            angleRad: placed.angleRad,
          };
          onAddBimObjectRef.current(newWin);
        }
        return;
      }

      // Tool: Add Structural Pillar on clicked Floor
      if (tool === 'add_pillar') {
        const raw = raycastGroundPlanM(e.clientX, e.clientY);
        if (!raw || !onAddBimObjectRef.current) return;
        const snapped = snapPlanPoint(raw, null, false);
        hideCadPreviews();
        const nextNum = bimModelRef.current.pillars.length + 1;
        const code = `PL${nextNum}`;
        const newPillar: BimPillarObject = {
          id: makeCadUid('pil'),
          kind: 'pillar',
          code,
          name: `Pilastro ${code}`,
          material: 'C.A. gettato in opera',
          cxM: snapped.xM,
          cyM: snapped.yM,
          widthM: 0.35,
          depthM: 0.35,
          heightM: wallHeightMRef.current,
        };
        onAddBimObjectRef.current(newPillar);
        return;
      }

      // Normal 3D / BIM Selection & Computation
      const hit = pickObjAt(e.clientX, e.clientY);
      if (!hit) {
        if (modeRef.current === 'bim') setInspectedId(null);
        return;
      }

      if (modeRef.current === 'bim') {
        if (e.shiftKey || clickModeRef.current === 'select') {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(hit.id)) next.delete(hit.id);
            else next.add(hit.id);
            return next;
          });
        } else {
          setInspectedId(hit.id);
        }
      } else {
        if (clickModeRef.current === 'instant' && !e.shiftKey) {
          onComputeBimObjectRef.current(hit, sidesRef.current);
          setComputedIds((prev) => {
            const next = new Set(prev);
            next.add(hit.id);
            return next;
          });
        } else {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(hit.id)) next.delete(hit.id);
            else next.add(hit.id);
            return next;
          });
        }
      }
    };

    const onPointerLeave = () => {
      isMiddlePanning = false;
      eraseBoxStart = null;
      setEraseBoxRect(null);
      if (hoveredIdRef.current !== null) {
        hoveredIdRef.current = null;
        setHoveredObj(null);
        refreshObjectColors();
      }
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('mousedown', onMouseDownPreventAutoscroll);
    domEl.addEventListener('auxclick', onAuxClick);
    domEl.addEventListener('contextmenu', onContextMenu);
    domEl.addEventListener('pointerdown', onPointerDown);
    domEl.addEventListener('pointermove', onPointerMove);
    domEl.addEventListener('pointerup', onPointerUp);
    domEl.addEventListener('pointerleave', onPointerLeave);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(240, Math.floor(entry.contentRect.width));
        const h = Math.max(200, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      }
    });
    resizeObserver.observe(container);

    applyShadowsRef.current = (enabled: boolean) => {
      if (!isSoftwareGl) {
        keyLight.castShadow = enabled;
        renderer.shadowMap.needsUpdate = true;
      }
      if (isMaquette) {
        hemiLight.intensity = enabled ? 0.52 : 0.78;
        keyLight.intensity = enabled ? 1.85 : 1.25;
      } else {
        hemiLight.intensity = enabled ? 0.48 : 0.68;
        keyLight.intensity = enabled ? 1.15 : 0.9;
      }
      if (shadowGroundMesh) shadowGroundMesh.visible = enabled;
      for (const strip of aoStrips) strip.visible = enabled;
      requestRender();
    };

    refreshObjectColors();
    requestRender();

    return () => {
      disposed = true;
      if (rafId !== 0) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
      controlsRef.current = null;
      clearCadPreviewRef.current = () => {};
      applyShadowsRef.current = () => {};
      domEl.removeEventListener('mousedown', onMouseDownPreventAutoscroll);
      domEl.removeEventListener('auxclick', onAuxClick);
      domEl.removeEventListener('contextmenu', onContextMenu);
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('pointermove', onPointerMove);
      domEl.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('pointerleave', onPointerLeave);

      entriesRef.current.clear();
      quotesGroupRef.current = null;
      envTarget.dispose();
      for (const item of disposables) item.dispose();
      renderer.dispose();
      if (domEl.parentNode === container) container.removeChild(domEl);
    };
  }, [
    bimModel,
    mode,
    bimFilter,
    visualTheme,
    showBlueprintOverlay,
    cleanFloorCanvas,
    significantQuotes,
    wallHeightM,
    lumaVersion,
    refreshObjectColors,
  ]);

  const totalWallLengthM = useMemo(
    () => Math.round(bimModel.walls.reduce((s, w) => s + w.lengthM, 0) * 100) / 100,
    [bimModel.walls]
  );

  const totalWallAreaM2 = useMemo(
    () => Math.round(bimModel.walls.reduce((s, w) => s + w.lengthM * w.heightM * sides, 0) * 100) / 100,
    [bimModel.walls, sides]
  );

  const selectedObjects = useMemo(
    () => Array.from(selectedIds).map((id) => allObjectsMap.get(id)).filter(Boolean) as BimObject[],
    [selectedIds, allObjectsMap]
  );

  const commitHeightInput = () => {
    const parsed = parseFloat(heightInput.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0.4 && parsed <= 25) {
      onWallHeightChange(Math.round(parsed * 100) / 100);
    } else {
      setHeightInput(wallHeightM.toFixed(2));
    }
  };

  const updateNumField = (field: string, raw: string) => {
    if (!inspectedObj) return;
    const val = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(val) || val <= 0) return;
    const rounded = Math.round(val * 100) / 100;
    onUpdateBimObject({ ...inspectedObj, [field]: rounded } as BimObject);
  };

  const batchComputeCategory = (objs: BimObject[]) => {
    if (objs.length === 0) return;
    onComputeMultipleBimObjects(objs, sides);
    setComputedIds((prev) => {
      const next = new Set(prev);
      objs.forEach((o) => next.add(o.id));
      return next;
    });
    setOpenMenu(null);
  };

  const isAiModel = bimModel.source === 'ai-vision';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 select-none overflow-hidden">
      {/* BARRA MENU A TENDINA STILE AUTOCAD (SOPRA IL DISEGNO — ZERO SOVRAPPOSIZIONI SUL CANVAS) */}
      <div
        ref={menuBarRef}
        className="bg-slate-900 border-b border-slate-700/90 px-3 py-1 flex items-center justify-between gap-2 shrink-0 text-xs relative z-30"
      >
        <div className="flex items-center gap-1 flex-wrap">
          {/* MENU A TENDINA 1: VISTA */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'view' ? null : 'view'))}
              className={`px-2.5 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                openMenu === 'view'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-200 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-sky-400" />
              <span>Vista</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {openMenu === 'view' && (
              <div className="absolute left-0 top-full mt-1 w-60 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-1 z-50 text-xs">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Stile Architettonico
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVisualTheme('maquette');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-amber-300" />
                    <span>Maquette Bianca (Pulita)</span>
                  </span>
                  {visualTheme === 'maquette' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVisualTheme('blueprint');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span>Piantina Tecnica (Scuro)</span>
                  </span>
                  {visualTheme === 'blueprint' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
                <div className="my-1 border-t border-slate-800" />
                <button
                  type="button"
                  onClick={() => {
                    applyPresetRef.current('iso');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>Assonometria 3D</span>
                  <span className="text-[10px] font-mono text-slate-500">ISO</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyPresetRef.current('top');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>Vista dall&apos;alto</span>
                  <span className="text-[10px] font-mono text-slate-500">TOP</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyPresetRef.current('front');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span>Prospetto Frontale</span>
                  <span className="text-[10px] font-mono text-slate-500">FRONT</span>
                </button>
                <div className="my-1 border-t border-slate-800" />
                <button
                  type="button"
                  onClick={() => {
                    onToggleQuotesLayer();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-400" />
                    <span>Layer Quote 3D</span>
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      showQuotesLayer ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {showQuotesLayer ? 'ON' : 'OFF'}
                  </span>
                </button>
                {visualTheme === 'maquette' && cleanFloorCanvas && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowBlueprintOverlay((v) => !v);
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <FileImage className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Ricalca Pianta PDF</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        showBlueprintOverlay ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {showBlueprintOverlay ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowShadows((v) => !v);
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-amber-300" />
                    <span>Ombre 3D</span>
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      showShadows ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {showShadows ? 'ON' : 'OFF'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyPresetRef.current('iso');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-300 hover:bg-slate-800 flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>Ripristina Camera</span>
                </button>
              </div>
            )}
          </div>

          {/* MENU A TENDINA 2: MODIFICA & PULIZIA CAD RAPIDA */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'edit' ? null : 'edit'))}
              className={`px-2.5 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                editTool !== 'none'
                  ? 'bg-emerald-600 text-white'
                  : openMenu === 'edit'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-200 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Pencil className="w-3.5 h-3.5 text-emerald-300" />
              <span>Modifica</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {openMenu === 'edit' && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-1.5 z-50 text-xs">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-400">
                  Pulizia Manuale Rapida
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditTool((t) => (t === 'erase_click' ? 'none' : 'erase_click'));
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Eraser className="w-3.5 h-3.5 text-rose-400" />
                    <span>Gomma Rapida (1 Clic)</span>
                  </span>
                  {editTool === 'erase_click' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditTool((t) => (t === 'erase_box' ? 'none' : 'erase_box'));
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <BoxSelect className="w-3.5 h-3.5 text-rose-400" />
                    <span>Riquadro Gomma (Pulisci Zona)</span>
                  </span>
                  {editTool === 'erase_box' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>

                <div className="my-1.5 border-t border-slate-800" />
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Disegna / Aggiungi Oggetti CAD
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditTool((t) => (t === 'draw_wall' ? 'none' : 'draw_wall'));
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Pencil className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Disegna Muro (2 Punti + Snap)</span>
                  </span>
                  {editTool === 'draw_wall' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditTool((t) => (t === 'add_door' ? 'none' : 'add_door'));
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <DoorOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>Inserisci Porta su Muro</span>
                  </span>
                  {editTool === 'add_door' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditTool((t) => (t === 'add_window' ? 'none' : 'add_window'));
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <AppWindow className="w-3.5 h-3.5 text-sky-400" />
                    <span>Inserisci Finestra su Muro</span>
                  </span>
                  {editTool === 'add_window' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditTool((t) => (t === 'add_pillar' ? 'none' : 'add_pillar'));
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Square className="w-3.5 h-3.5 text-slate-300" />
                    <span>Inserisci Pilastro C.A.</span>
                  </span>
                  {editTool === 'add_pillar' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>

                {onCleanBimModel && (
                  <>
                    <div className="my-1.5 border-t border-slate-800" />
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                      Pulizia Automatica 1-Clic
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onCleanBimModel('short_fragments');
                        setOpenMenu(null);
                      }}
                      className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-1.5"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Elimina frammenti corti (&lt; 0,65m)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onCleanBimModel('dedup_and_stairs');
                        setOpenMenu(null);
                      }}
                      className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Unisci muri doppi &amp; rimuovi scale</span>
                    </button>
                  </>
                )}

                <div className="my-1.5 border-t border-slate-800" />
                <button
                  type="button"
                  onClick={() => {
                    setShowShadows((v) => !v);
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5 text-amber-300" />
                    <span>Ombre 3D</span>
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      showShadows ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {showShadows ? 'ON' : 'OFF'}
                  </span>
                </button>

                {editTool !== 'none' && (
                  <>
                    <div className="my-1.5 border-t border-slate-800" />
                    <button
                      type="button"
                      onClick={() => {
                        setEditTool('none');
                        setOpenMenu(null);
                      }}
                      className="w-full px-3 py-1.5 text-left text-slate-300 hover:bg-slate-800 flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                      <span>Esci da Modifica (Esc)</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* MENU A TENDINA 2: MODELLO & PARETI */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'model' ? null : 'model'))}
              className={`px-2.5 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                openMenu === 'model'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-200 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
              <span>Modello</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {openMenu === 'model' && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-2.5 z-50 text-xs space-y-2.5">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Facce Parete nel Computo
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setSides(1)}
                      className={`px-2 py-1 rounded font-semibold ${
                        sides === 1 ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      1 Lato
                    </button>
                    <button
                      type="button"
                      onClick={() => setSides(2)}
                      className={`px-2 py-1 rounded font-semibold ${
                        sides === 2 ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      2 Lati (×2)
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Azione Clic su Oggetto
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setClickMode('instant')}
                      className={`px-2 py-1 rounded font-semibold inline-flex items-center justify-center gap-1 ${
                        clickMode === 'instant'
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      <MousePointerClick className="w-3 h-3" />
                      <span>{mode === 'bim' ? 'Modifica' : 'Computa'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setClickMode('select')}
                      className={`px-2 py-1 rounded font-semibold inline-flex items-center justify-center gap-1 ${
                        clickMode === 'select'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      <CheckSquare className="w-3 h-3" />
                      <span>Multi</span>
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Rilevamento Locale PDF (Fallback)
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        ['thin', 'Sottili'],
                        ['medium', 'Media'],
                        ['thick', 'Spessi'],
                      ] as Array<[LaserSensitivity, string]>
                    ).map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => onSensitivityChange(val)}
                        className={`px-2 py-1 rounded font-semibold ${
                          sensitivity === val
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                  {hasAiModel && onUseLocalModel && (
                    <button
                      type="button"
                      onClick={() => {
                        onUseLocalModel();
                        setOpenMenu(null);
                      }}
                      className="mt-1.5 w-full px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium text-center"
                    >
                      Usa estrazione locale veloce
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* MENU A TENDINA 3: OGGETTI BIM & COMPUTO RAPIDO */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'bim' ? null : 'bim'))}
              className={`px-2.5 py-1 rounded text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                openMenu === 'bim'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-200 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Cuboid className="w-3.5 h-3.5 text-cyan-400" />
              <span>{mode === 'bim' ? 'Oggetti BIM' : 'Computo'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {openMenu === 'bim' && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-1.5 z-50 text-xs">
                {mode === 'bim' && (
                  <>
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Filtra Categoria Visibile
                    </div>
                    {(
                      [
                        [
                          'all',
                          'Tutti gli oggetti BIM',
                          bimModel.walls.length +
                            bimModel.doors.length +
                            bimModel.windows.length +
                            bimModel.pillars.length +
                            bimModel.rooms.length,
                        ],
                        ['wall', 'Solo Muri & Tramezzi', bimModel.walls.length],
                        ['door', 'Solo Porte', bimModel.doors.length],
                        ['window', 'Solo Finestre / Infissi', bimModel.windows.length],
                        ['pillar', 'Solo Pilastri C.A.', bimModel.pillars.length],
                        ['room', 'Solo Vani / Pavimenti', bimModel.rooms.length],
                      ] as Array<[BimFilter, string, number]>
                    ).map(([key, label, cnt]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setBimFilter(key);
                          setOpenMenu(null);
                        }}
                        className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Check className={`w-3 h-3 ${bimFilter === key ? 'text-cyan-400' : 'opacity-0'}`} />
                          <span>{label}</span>
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">{cnt}</span>
                      </button>
                    ))}
                    <div className="my-1.5 border-t border-slate-800" />
                  </>
                )}

                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Invia Categoria al Computo
                </div>
                <button
                  type="button"
                  disabled={bimModel.walls.length === 0}
                  onClick={() => batchComputeCategory(bimModel.walls)}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 disabled:opacity-40 flex items-center justify-between"
                >
                  <span>+ Tutte le Pareti ({sides === 2 ? '2 lati' : '1 lato'})</span>
                  <span className="font-mono text-[10px] text-emerald-400">{bimModel.walls.length}</span>
                </button>
                <button
                  type="button"
                  disabled={bimModel.doors.length === 0}
                  onClick={() => batchComputeCategory(bimModel.doors)}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 disabled:opacity-40 flex items-center justify-between"
                >
                  <span>+ Tutte le Porte</span>
                  <span className="font-mono text-[10px] text-amber-400">{bimModel.doors.length}</span>
                </button>
                <button
                  type="button"
                  disabled={bimModel.windows.length === 0}
                  onClick={() => batchComputeCategory(bimModel.windows)}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 disabled:opacity-40 flex items-center justify-between"
                >
                  <span>+ Tutte le Finestre</span>
                  <span className="font-mono text-[10px] text-sky-400">{bimModel.windows.length}</span>
                </button>
                <button
                  type="button"
                  disabled={bimModel.pillars.length === 0}
                  onClick={() => batchComputeCategory(bimModel.pillars)}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 disabled:opacity-40 flex items-center justify-between"
                >
                  <span>+ Tutti i Pilastri</span>
                  <span className="font-mono text-[10px] text-slate-300">{bimModel.pillars.length}</span>
                </button>
                <button
                  type="button"
                  disabled={bimModel.rooms.length === 0}
                  onClick={() => batchComputeCategory(bimModel.rooms)}
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800 disabled:opacity-40 flex items-center justify-between"
                >
                  <span>+ Tutti i Pavimenti / Vani</span>
                  <span className="font-mono text-[10px] text-cyan-400">{bimModel.rooms.length}</span>
                </button>
              </div>
            )}
          </div>

          {/* PULSANTE RICOSTRUZIONE ARCHITETTONICA PULITA AI */}
          {onRequestAiRebuild && (
            <button
              type="button"
              disabled={isAnalyzingAi}
              onClick={onRequestAiRebuild}
              className={`ml-1 px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-70 ${
                isAiModel
                  ? 'bg-emerald-600/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
              title="Analizza la planimetria PDF e ricostruisce solo muri puliti, porte, finestre, pilastri e pavimenti (ignora quote, scritte e arredi)"
            >
              {isAnalyzingAi ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>
                {isAnalyzingAi
                  ? 'Analisi pianta...'
                  : isAiModel
                  ? 'Modello Pulito ✓ · Rigenera'
                  : 'Ricostruisci Pulito'}
              </span>
            </button>
          )}

          {/* ALTEZZA H RAPIDA DIRETTA IN BARRA */}
          <div className="flex items-center gap-1 bg-slate-950 rounded px-2 py-0.5 border border-slate-700 ml-1">
            <span className="font-bold text-amber-300 text-[11px]">H:</span>
            <input
              type="text"
              value={heightInput}
              onChange={(e) => setHeightInput(e.target.value)}
              onBlur={commitHeightInput}
              onKeyDown={(e) => e.key === 'Enter' && commitHeightInput()}
              className="w-11 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center font-mono tabular-nums text-[11px] text-white focus:outline-none focus:border-amber-400"
              title="Altezza estrusione pareti e pilastri (m)"
            />
            <span className="text-slate-400 font-mono text-[11px]">m</span>
          </div>

          {activeCellLabel && (
            <span className="ml-1 px-2 py-0.5 rounded bg-amber-950 border border-amber-500/50 text-[11px] font-semibold text-amber-200 whitespace-nowrap">
              Cella attiva: {activeCellLabel}
            </span>
          )}
        </div>

        {/* AZIONI RAPIDE SELEZIONE + UNDO/REDO (A DESTRA NELLA BARRA — ZERO OVERLAY SUL DISEGNO) */}
        <div className="flex items-center gap-1.5">
          {selectedObjects.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  onComputeMultipleBimObjects(selectedObjects, sides);
                  setComputedIds((prev) => {
                    const next = new Set(prev);
                    selectedObjects.forEach((o) => next.add(o.id));
                    return next;
                  });
                  setSelectedIds(new Set());
                }}
                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Computa {selectedObjects.length}</span>
              </button>
              {onDeleteMultipleBimObjects && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteMultipleBimObjects(
                      selectedObjects.map((o) => ({ id: o.id, kind: o.kind }))
                    );
                    setSelectedIds(new Set());
                  }}
                  className="px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap"
                  title="Elimina tutti gli oggetti selezionati (Canc)"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Elimina</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                title="Deseleziona tutto"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {onUndoBim && (
            <button
              type="button"
              disabled={!canUndoBim}
              onClick={onUndoBim}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
              title="Annulla ultima modifica 3D/BIM (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onRedoBim && (
            <button
              type="button"
              disabled={!canRedoBim}
              onClick={onRedoBim}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none"
              title="Ripristina modifica annullata (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => applyPresetRef.current('iso')}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
            title="Centra e ripristina vista 3D"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* BARRA STRUMENTO MODIFICA CAD ATTIVO (ANCORATA SOTTO IL MENU — ZERO OVERLAY SUL DISEGNO) */}
      {editTool !== 'none' && (
        <div className="bg-slate-950 border-b border-emerald-500/50 px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap shrink-0 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] inline-flex items-center gap-1">
              {editTool === 'erase_click' && <><Eraser className="w-3 h-3 text-rose-400" /> Gomma 1-Clic</>}
              {editTool === 'erase_box' && <><BoxSelect className="w-3 h-3 text-rose-400" /> Riquadro Gomma</>}
              {editTool === 'draw_wall' && <><Pencil className="w-3 h-3 text-emerald-400" /> Disegna Muro</>}
              {editTool === 'add_door' && <><DoorOpen className="w-3 h-3 text-amber-400" /> Inserisci Porta</>}
              {editTool === 'add_window' && <><AppWindow className="w-3 h-3 text-sky-400" /> Inserisci Finestra</>}
              {editTool === 'add_pillar' && <><Square className="w-3 h-3 text-slate-300" /> Inserisci Pilastro</>}
            </span>

            {editTool === 'draw_wall' && (
              <div className="inline-flex items-center gap-1 bg-slate-900 rounded p-0.5 border border-slate-700">
                <button
                  type="button"
                  onClick={() => setNewWallPreset('perimeter')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                    newWallPreset === 'perimeter' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Perimetrale 30cm
                </button>
                <button
                  type="button"
                  onClick={() => setNewWallPreset('partition')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                    newWallPreset === 'partition' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Tramezzo 12cm
                </button>
              </div>
            )}

            <span className="text-slate-300 text-[11px]">
              {editTool === 'erase_click' && 'Clicca su qualsiasi muro o oggetto di disturbo per eliminarlo subito (Ctrl+Z annulla).'}
              {editTool === 'erase_box' && 'Trascina un riquadro con tasto sinistro per cancellare un’intera zona · Tasto destro: ruota.'}
              {editTool === 'draw_wall' && 'Clicca 2 punti con snap automatico agli angoli (Shift: ortogonale) · Tasto destro: ruota.'}
              {editTool === 'add_door' && 'Clicca su un muro per inserire una porta e aprire automaticamente il vano.'}
              {editTool === 'add_window' && 'Clicca su un muro per inserire una finestra e aprire automaticamente il vano.'}
              {editTool === 'add_pillar' && 'Clicca sul pavimento per inserire un pilastro strutturale 35×35 cm.'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {visualTheme === 'maquette' && cleanFloorCanvas && (
              <button
                type="button"
                onClick={() => setShowBlueprintOverlay((v) => !v)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold inline-flex items-center gap-1 border ${
                  showBlueprintOverlay
                    ? 'bg-cyan-600/25 border-cyan-400/60 text-cyan-200'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                }`}
                title="Mostra in trasparenza la pianta PDF originale sotto la maquette per ricalcare o pulire al millimetro"
              >
                <FileImage className="w-3 h-3" />
                <span>Ricalca PDF {showBlueprintOverlay ? 'ON' : 'OFF'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowShadows((v) => !v)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold inline-flex items-center gap-1 border ${
                showShadows
                  ? 'bg-amber-600/20 border-amber-400/50 text-amber-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Attiva o disattiva le ombre nel 3D"
            >
              <Sun className="w-3 h-3" />
              <span>Ombre {showShadows ? 'ON' : 'OFF'}</span>
            </button>
            <button
              type="button"
              onClick={() => applyPresetRef.current('top')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold"
              title="Passa alla vista dall'alto (perfetta per ricalcare o pulire)"
            >
              Vista TOP
            </button>
            <button
              type="button"
              onClick={() => setEditTool('none')}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              <span>Fine</span>
            </button>
          </div>
        </div>
      )}

      {/* BARRA STATO ANALISI ARCHITETTONICA (ANCORATA SOPRA IL CANVAS — ZERO SOVRAPPOSIZIONI) */}
      {isAnalyzingAi && (
        <div className="bg-indigo-950/90 border-b border-indigo-500/40 px-3 py-1.5 flex items-center justify-between gap-2 text-xs text-indigo-100 shrink-0">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-300 shrink-0" />
            <span>
              Ricostruzione architettonica pulita in corso: estrazione muri, porte, finestre, pilastri e pavimenti (escludendo quote, scritte e arredi)...
            </span>
          </div>
        </div>
      )}

      {!isAnalyzingAi && aiError && (
        <div className="bg-amber-950/90 border-b border-amber-500/40 px-3 py-1.5 flex items-center justify-between gap-2 text-xs text-amber-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{aiError}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onRequestAiRebuild && (
              <button
                type="button"
                onClick={onRequestAiRebuild}
                className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-[11px] inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Riprova</span>
              </button>
            )}
            {onDismissAiError && (
              <button
                type="button"
                onClick={onDismissAiError}
                className="p-0.5 rounded text-amber-300 hover:text-white"
                title="Chiudi avviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* BARRA PROPRIETÀ BIM ANCORATA IN ALTO (SOLO QUANDO SI CLICCA UN OGGETTO IN BIM — MAI SOPRA IL DISEGNO!) */}
      {mode === 'bim' && inspectedObj && (
        <div className="bg-slate-950 border-b border-cyan-500/50 px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap shrink-0 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold text-[11px]">
              {inspectedObj.code}
            </span>
            <input
              type="text"
              value={inspectedObj.name}
              onChange={(e) => onUpdateBimObject({ ...inspectedObj, name: e.target.value } as BimObject)}
              className="w-40 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs font-semibold text-white focus:outline-none focus:border-cyan-400"
            />

            {inspectedObj.kind === 'wall' && (
              <>
                <select
                  value={inspectedObj.category}
                  onChange={(e) =>
                    onUpdateBimObject({
                      ...inspectedObj,
                      category: e.target.value as BimWallObject['category'],
                    })
                  }
                  className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-white"
                >
                  <option value="Muro Perimetrale">Muro Perimetrale</option>
                  <option value="Tramezzo Interno">Tramezzo Interno</option>
                </select>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  L
                  <input
                    type="number"
                    step="0.05"
                    value={inspectedObj.lengthM}
                    onChange={(e) => updateNumField('lengthM', e.target.value)}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-white"
                  />
                </label>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  H
                  <input
                    type="number"
                    step="0.05"
                    value={inspectedObj.heightM}
                    onChange={(e) => updateNumField('heightM', e.target.value)}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-white"
                  />
                </label>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  Sp.
                  <input
                    type="number"
                    step="0.02"
                    value={inspectedObj.thicknessM}
                    onChange={(e) => updateNumField('thicknessM', e.target.value)}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-white"
                  />
                </label>
              </>
            )}

            {inspectedObj.kind === 'door' && (
              <>
                <select
                  value={inspectedObj.doorType}
                  onChange={(e) => onUpdateBimObject({ ...inspectedObj, doorType: e.target.value as any })}
                  className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-white"
                >
                  <option value="Porta Interna">Porta Interna</option>
                  <option value="Portoncino Blindato">Portoncino Blindato</option>
                  <option value="Porta Scorrevole">Porta Scorrevole</option>
                </select>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  L
                  <input
                    type="number"
                    step="0.05"
                    value={inspectedObj.widthM}
                    onChange={(e) => updateNumField('widthM', e.target.value)}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-white"
                  />
                </label>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  H
                  <input
                    type="number"
                    step="0.05"
                    value={inspectedObj.heightM}
                    onChange={(e) => updateNumField('heightM', e.target.value)}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-white"
                  />
                </label>
              </>
            )}

            {inspectedObj.kind === 'window' && (
              <>
                <select
                  value={inspectedObj.windowType}
                  onChange={(e) => onUpdateBimObject({ ...inspectedObj, windowType: e.target.value as any })}
                  className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-white"
                >
                  <option value="Finestra PVC/Alluminio">Finestra PVC/Alluminio</option>
                  <option value="Portafinestra">Portafinestra</option>
                  <option value="Vetrata">Vetrata</option>
                </select>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  L
                  <input
                    type="number"
                    step="0.05"
                    value={inspectedObj.widthM}
                    onChange={(e) => updateNumField('widthM', e.target.value)}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-white"
                  />
                </label>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  H
                  <input
                    type="number"
                    step="0.05"
                    value={inspectedObj.heightM}
                    onChange={(e) => updateNumField('heightM', e.target.value)}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-white"
                  />
                </label>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  Dav.
                  <input
                    type="number"
                    step="0.05"
                    value={inspectedObj.sillHeightM}
                    onChange={(e) => updateNumField('sillHeightM', e.target.value)}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-white"
                  />
                </label>
              </>
            )}

            {inspectedObj.kind === 'pillar' && (
              <>
                <select
                  value={inspectedObj.material}
                  onChange={(e) => onUpdateBimObject({ ...inspectedObj, material: e.target.value as any })}
                  className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-white"
                >
                  <option value="C.A. gettato in opera">C.A. gettato in opera</option>
                  <option value="Acciaio">Acciaio</option>
                  <option value="Muratura">Muratura</option>
                </select>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  A
                  <input
                    type="number"
                    step="0.05"
                    value={inspectedObj.widthM}
                    onChange={(e) => updateNumField('widthM', e.target.value)}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-white"
                  />
                </label>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  B
                  <input
                    type="number"
                    step="0.05"
                    value={inspectedObj.depthM}
                    onChange={(e) => updateNumField('depthM', e.target.value)}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-white"
                  />
                </label>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  H
                  <input
                    type="number"
                    step="0.05"
                    value={inspectedObj.heightM}
                    onChange={(e) => updateNumField('heightM', e.target.value)}
                    className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-white"
                  />
                </label>
              </>
            )}

            {inspectedObj.kind === 'room' && (
              <>
                <select
                  value={inspectedObj.floorType ?? inferRoomFloorType(inspectedObj.name)}
                  onChange={(e) => {
                    const ft = e.target.value as NonNullable<BimRoomObject['floorType']>;
                    onUpdateBimObject({
                      ...inspectedObj,
                      floorType: ft,
                      finish: ft === 'oak' ? 'Parquet Rovere Naturale' : 'Gres Porcellanato Beige',
                    });
                  }}
                  className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-white"
                >
                  <option value="oak">Parquet Rovere</option>
                  <option value="ceramic">Gres Beige</option>
                </select>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  m²
                  <input
                    type="number"
                    step="0.1"
                    value={inspectedObj.areaM2}
                    onChange={(e) => updateNumField('areaM2', e.target.value)}
                    className="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-white"
                  />
                </label>
              </>
            )}

            <span className="font-mono text-[11px] text-emerald-400 font-bold">
              {getObjectAreaOrQtyText(inspectedObj, sides)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                onComputeBimObject(inspectedObj, sides);
                setComputedIds((prev) => {
                  const next = new Set(prev);
                  next.add(inspectedObj.id);
                  return next;
                });
              }}
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              <span>Computa</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onDeleteBimObject(inspectedObj.id, inspectedObj.kind);
                setInspectedId(null);
              }}
              className="p-1 rounded bg-rose-950 hover:bg-rose-900 border border-rose-700/60 text-rose-300"
              title="Elimina oggetto dal BIM"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setInspectedId(null)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
              title="Chiudi proprietà"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* VIEWPORT 3D/BIM 100% PULITO E LIBERO DA QUALSIASI MENU IN SOVRAPPOSIZIONE */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        <div ref={canvasMountRef} className="w-full h-full" />

        {/* Riquadro Gomma attivo solo durante il trascinamento */}
        {eraseBoxRect && eraseBoxRect.w > 2 && eraseBoxRect.h > 2 && (
          <div
            className="absolute pointer-events-none z-20 border-2 border-rose-500 bg-rose-500/20 rounded-sm"
            style={{
              left: eraseBoxRect.x,
              top: eraseBoxRect.y,
              width: eraseBoxRect.w,
              height: eraseBoxRect.h,
            }}
          />
        )}

        {bimModel.walls.length === 0 && !isAnalyzingAi && editTool === 'none' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto bg-slate-900 border border-slate-700 rounded-xl px-5 py-4 text-center max-w-sm shadow-2xl">
              <Box className="w-7 h-7 text-amber-400 mx-auto mb-2" />
              <div className="text-sm font-bold text-white">Nessuna parete rilevata nella pianta</div>
              <p className="text-xs text-slate-400 mt-1">
                Premi <strong className="text-indigo-300">Ricostruisci Pulito</strong> in alto oppure usa <strong className="text-emerald-300">Modifica → Disegna Muro</strong> con <strong className="text-cyan-300">Ricalca PDF</strong>.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* BARRA DI STATO CAD INFERIORE (FUORI DAL DISEGNO — LETTURA OGGETTO HOVER + TOTALI + COMANDI MOUSE) */}
      <div className="bg-slate-950 border-t border-slate-800 px-3 py-1 flex items-center justify-between gap-3 text-[11px] shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-0 truncate">
          {drawStatusText ? (
            <span className="font-mono font-semibold text-emerald-300 truncate">{drawStatusText}</span>
          ) : hoveredObj ? (
            <>
              <span
                className={`font-mono font-bold shrink-0 ${
                  editTool === 'erase_click' ? 'text-rose-400' : 'text-amber-400'
                }`}
              >
                {editTool === 'erase_click' ? `ELIMINA ${hoveredObj.code}` : hoveredObj.code}
              </span>
              <span className="font-semibold text-white truncate">{hoveredObj.name}</span>
              <span className="text-slate-600">·</span>
              <span className="font-mono tabular-nums text-emerald-400 font-bold whitespace-nowrap">
                {getObjectAreaOrQtyText(hoveredObj, sides)}
              </span>
            </>
          ) : mode === 'bim' ? (
            <span className="font-mono tabular-nums text-slate-300 whitespace-nowrap">
              <Layers className="w-3 h-3 inline mr-1 text-cyan-400" />
              {bimModel.walls.length} muri · {bimModel.doors.length} porte · {bimModel.windows.length} finestre · {bimModel.pillars.length} pilastri · {bimModel.rooms.length} vani
            </span>
          ) : (
            <span className="font-mono tabular-nums text-slate-300 whitespace-nowrap">
              {bimModel.walls.length} pareti · {totalWallLengthM.toFixed(2)} ml ·{' '}
              <span className="text-emerald-400 font-bold">
                {totalWallAreaM2.toFixed(2)} m² {sides === 2 ? '(2 lati)' : '(1 lato)'}
              </span>
            </span>
          )}
        </div>

        <div className="text-[10px] text-slate-500 whitespace-nowrap shrink-0 hidden sm:block">
          {editTool !== 'none'
            ? 'Tasto destro: Orbita · Rotella: Zoom · Clic rotella: Pan · Ctrl+Z: Annulla'
            : 'Rotella: Zoom · Clic rotella: Pan · Trascina: Orbita'}
        </div>
      </div>
    </div>
  );
};
