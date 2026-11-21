import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Box,
  Check,
  CheckSquare,
  ChevronDown,
  Cuboid,
  Eye,
  Layers,
  MousePointerClick,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { LaserSensitivity } from '../utils/planLaserRaycaster';
import { SignificantQuoteItem } from '../utils/planCleanGeometry';
import {
  BimObject,
  BimObjectKind,
  BimWallObject,
  PlanBimModel,
} from '../utils/planBimExtractor';

interface Plan3DViewerProps {
  mode: '3d' | 'bim';
  bimModel: PlanBimModel;
  onUpdateBimObject: (updated: BimObject) => void;
  onDeleteBimObject: (id: string, kind: BimObjectKind) => void;
  wallHeightM: number;
  onWallHeightChange: (newHeightM: number) => void;
  /** Cleaned architectural floor-plan canvas (free of text & dimension lines) */
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
}

type CameraPreset = 'iso' | 'top' | 'front';
type ClickMode = 'instant' | 'select';
type BimFilter = 'all' | BimObjectKind;
type OpenDropdown = 'view' | 'model' | 'bim' | null;

// Module-scoped scratch helpers (no allocations during pointer/render)
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();

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

function makeQuoteSpriteTexture(text: string, isRoom: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = isRoom ? 'rgba(15, 23, 42, 0.92)' : 'rgba(245, 158, 11, 0.95)';
    ctx.strokeStyle = isRoom ? '#38bdf8' : '#0f172a';
    ctx.lineWidth = 4;
    const pad = 8;
    const w = canvas.width - pad * 2;
    const h = canvas.height - pad * 2;
    ctx.beginPath();
    ctx.roundRect(pad, pad, w, h, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isRoom ? '#f8fafc' : '#0f172a';
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

// Palette opaca anti-riflesso ad alto contrasto fisso:
// Zero bagliori bianchi ruotando la camera da qualsiasi angolazione
const COLOR_BG_STUDIO = 0x0f172a;
const COLOR_BASE_PLINTH = 0x1e293b;
const COLOR_BASE_FRAME = 0x475569;

const COLOR_WALL_EXT = 0x334155;
const COLOR_WALL_INT = 0x475569;
const COLOR_WALL_CAP = 0xcbd5e1;
const COLOR_EDGE_DEFAULT = 0x090d16;

const COLOR_DOOR_FRAME = 0x1e293b;
const COLOR_DOOR_PANEL = 0xb45309;
const COLOR_WIN_FRAME = 0x94a3b8;
const COLOR_WIN_GLASS = 0x38bdf8;
const COLOR_PILLAR_BODY = 0x64748b;
const COLOR_PILLAR_CAP = 0x0f172a;
const COLOR_ROOM_SLAB = 0x0ea5e9;

const COLOR_HOVER = 0xf59e0b;
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
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const menuBarRef = useRef<HTMLDivElement | null>(null);

  const [openMenu, setOpenMenu] = useState<OpenDropdown>(null);
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
  const entriesRef = useRef<Map<string, InteractiveMeshEntry>>(new Map());
  const quotesGroupRef = useRef<THREE.Group | null>(null);
  const hoveredIdRef = useRef<string | null>(null);

  const savedCameraRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const lastModelKeyRef = useRef<string>('');

  const modeRef = useRef(mode);
  const clickModeRef = useRef(clickMode);
  const sidesRef = useRef(sides);
  const onComputeBimObjectRef = useRef(onComputeBimObject);
  const selectedIdsRef = useRef(selectedIds);
  const computedIdsRef = useRef(computedIds);
  const inspectedIdRef = useRef(inspectedId);

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
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);
  useEffect(() => {
    computedIdsRef.current = computedIds;
  }, [computedIds]);
  useEffect(() => {
    inspectedIdRef.current = inspectedId;
  }, [inspectedId]);

  const refreshObjectColors = useMemo(
    () => () => {
      const entries = entriesRef.current;
      const sel = selectedIdsRef.current;
      const comp = computedIdsRef.current;
      const hov = hoveredIdRef.current;
      const insp = inspectedIdRef.current;

      entries.forEach((entry, id) => {
        const isHov = id === hov;
        const isInsp = id === insp;
        const isSel = sel.has(id);
        const isComp = comp.has(id);

        if (isHov || isInsp) {
          entry.materials.forEach((m) => {
            m.color.setHex(COLOR_HOVER);
            m.emissive.setHex(0x3b1704);
          });
          if (entry.edgeMat) {
            entry.edgeMat.color.setHex(0xffffff);
            entry.edgeMat.opacity = 0.95;
          }
        } else if (isSel) {
          entry.materials.forEach((m) => {
            m.color.setHex(COLOR_SELECTED);
            m.emissive.setHex(0x064e3b);
          });
          if (entry.edgeMat) {
            entry.edgeMat.color.setHex(0xffffff);
            entry.edgeMat.opacity = 0.9;
          }
        } else if (isComp) {
          entry.materials.forEach((m) => {
            m.color.setHex(COLOR_COMPUTED);
            m.emissive.setHex(0x0c4a6e);
          });
          if (entry.edgeMat) {
            entry.edgeMat.color.setHex(0xbae6fd);
            entry.edgeMat.opacity = 0.85;
          }
        } else {
          entry.materials.forEach((m, idx) => {
            m.color.setHex(entry.baseColors[idx] ?? COLOR_WALL_EXT);
            m.emissive.setHex(0x000000);
          });
          if (entry.edgeMat) {
            entry.edgeMat.color.setHex(entry.baseEdgeColor ?? COLOR_EDGE_DEFAULT);
            entry.edgeMat.opacity = entry.baseEdgeOpacity ?? 0.78;
          }
        }
      });
      requestRenderRef.current();
    },
    []
  );

  useEffect(() => {
    refreshObjectColors();
  }, [selectedIds, computedIds, inspectedId, refreshObjectColors]);

  useEffect(() => {
    if (quotesGroupRef.current) {
      quotesGroupRef.current.visible = showQuotesLayer;
      requestRenderRef.current();
    }
  }, [showQuotesLayer]);

  // Main Three.js scene lifecycle — Matte Anti-Glare Lighting Rig
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = Math.max(320, container.clientWidth);
    const height = Math.max(260, container.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLOR_BG_STUDIO);

    const { boundsM, planWidthM, planHeightM, walls, doors, windows, pillars, rooms } = bimModel;
    const centerX = walls.length > 0 ? (boundsM.minX + boundsM.maxX) * 0.5 : planWidthM * 0.5;
    const centerZ = walls.length > 0 ? (boundsM.minY + boundsM.maxY) * 0.5 : planHeightM * 0.5;
    const spanX = Math.max(4, walls.length > 0 ? boundsM.maxX - boundsM.minX : planWidthM);
    const spanZ = Math.max(4, walls.length > 0 ? boundsM.maxY - boundsM.minY : planHeightM);
    const diag = Math.max(6, Math.hypot(spanX, spanZ));

    scene.fog = new THREE.Fog(COLOR_BG_STUDIO, diag * 2.8, diag * 7.8);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, Math.max(220, diag * 12));

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Esposizione calibrata anti-sovraesposizione: niente riflessi bianchi abbaglianti
    renderer.toneMappingExposure = 0.94;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    // Subtle Studio PMREM Environment (controlled per-material via low envMapIntensity so floor/walls NEVER glare white!)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Anti-Glare Balanced Architectural Lighting Rig
    // Luce diffusa morbida + luce chiave calibrata (1.15) + luce di riempimento laterale (0.42)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.34);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x334155, 0.48);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff8ee, 1.15);
    keyLight.position.set(diag * 0.72, diag * 1.38, diag * 0.58);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
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

    // Standard CAD Controls: Wheel zoom to cursor, Middle-click PAN, Left/Right drag Orbit
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.enableZoom = true;
    controls.zoomSpeed = 1.2;
    controls.zoomToCursor = true;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.panSpeed = 1.15;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = Math.max(1.2, diag * 0.12);
    controls.maxDistance = diag * 4.2;

    const disposables: Array<{ dispose: () => void }> = [];

    // Fixed Matte Architectural Base Plinth + Crisp Frame
    const plinthW = planWidthM + 1.6;
    const plinthH = planHeightM + 1.6;
    const baseOffsetX = planWidthM * 0.5 - centerX;
    const baseOffsetZ = planHeightM * 0.5 - centerZ;

    const plinthGeo = new THREE.BoxGeometry(plinthW, 0.28, plinthH);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: COLOR_BASE_PLINTH,
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
      color: COLOR_BASE_FRAME,
      transparent: true,
      opacity: 0.85,
    });
    const plinthEdges = new THREE.LineSegments(plinthEdgesGeo, plinthEdgesMat);
    plinthEdges.position.copy(plinthMesh.position);
    scene.add(plinthEdges);
    disposables.push(plinthEdgesGeo, plinthEdgesMat);

    // Clean Matte PDF Floor Plan Texture:
    // MeshLambertMaterial (100% diffuso opaco, ZERO specular glare ruotando!) + carta bianco-avorio leggera (#eef2f6)
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
        floorTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
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

    const pickMeshes: THREE.Mesh[] = [];
    const newEntries = new Map<string, InteractiveMeshEntry>();

    const showKind = (kind: BimObjectKind): boolean => {
      if (mode === '3d') return kind === 'wall';
      return bimFilter === 'all' || bimFilter === kind;
    };

    const unitBodyGeo = new THREE.BoxGeometry(1, 0.955, 1);
    unitBodyGeo.translate(0, 0.4775, 0);
    const unitCapGeo = new THREE.BoxGeometry(1.006, 0.045, 1.05);
    unitCapGeo.translate(0, 0.9775, 0);
    const unitEdgesGeo = new THREE.EdgesGeometry(unitBodyGeo);
    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    unitBoxGeo.translate(0, 0.5, 0);
    const unitBoxEdgesGeo = new THREE.EdgesGeometry(unitBoxGeo);
    disposables.push(unitBodyGeo, unitCapGeo, unitEdgesGeo, unitBoxGeo, unitBoxEdgesGeo);

    // 1. WALLS (Opachi anti-riflesso: roughness 0.92, metalness 0, envMapIntensity 0.14)
    if (showKind('wall')) {
      for (const wall of walls) {
        const group = new THREE.Group();
        group.position.set(wall.cxM - centerX, 0, wall.cyM - centerZ);
        const sx = wall.orientation === 'H' ? wall.lengthM : wall.thicknessM;
        const sz = wall.orientation === 'H' ? wall.thicknessM : wall.lengthM;
        group.scale.set(sx, Math.max(0.4, wall.heightM), sz);

        const bodyColor = wall.category === 'Muro Perimetrale' ? COLOR_WALL_EXT : COLOR_WALL_INT;
        const bodyMat = new THREE.MeshStandardMaterial({
          color: bodyColor,
          roughness: 0.92,
          metalness: 0.0,
          envMapIntensity: 0.14,
        });
        const capMat = new THREE.MeshStandardMaterial({
          color: COLOR_WALL_CAP,
          roughness: 0.9,
          metalness: 0.0,
          envMapIntensity: 0.1,
        });
        const edgeMat = new THREE.LineBasicMaterial({
          color: COLOR_EDGE_DEFAULT,
          transparent: true,
          opacity: 0.82,
        });

        const bodyMesh = new THREE.Mesh(unitBodyGeo, bodyMat);
        bodyMesh.castShadow = !isSoftwareGl;
        bodyMesh.receiveShadow = !isSoftwareGl;
        bodyMesh.userData.bimId = wall.id;

        const capMesh = new THREE.Mesh(unitCapGeo, capMat);
        capMesh.castShadow = !isSoftwareGl;
        capMesh.userData.bimId = wall.id;

        const edgeLine = new THREE.LineSegments(unitEdgesGeo, edgeMat);
        group.add(bodyMesh, capMesh, edgeLine);
        scene.add(group);

        pickMeshes.push(bodyMesh, capMesh);
        newEntries.set(wall.id, {
          obj: wall,
          materials: [bodyMat],
          baseColors: [bodyColor],
          edgeMat,
          baseEdgeColor: COLOR_EDGE_DEFAULT,
          baseEdgeOpacity: 0.82,
        });
        disposables.push(bodyMat, capMat, edgeMat);
      }
    }

    // 2. BIM DOORS
    if (showKind('door')) {
      for (const door of doors) {
        const group = new THREE.Group();
        group.position.set(door.cxM - centerX, 0, door.cyM - centerZ);
        if (door.orientation === 'V') group.rotation.y = Math.PI / 2;

        const frameMat = new THREE.MeshStandardMaterial({
          color: COLOR_DOOR_FRAME,
          roughness: 0.85,
          metalness: 0.05,
          envMapIntensity: 0.15,
        });
        const panelMat = new THREE.MeshStandardMaterial({
          color: COLOR_DOOR_PANEL,
          roughness: 0.85,
          metalness: 0.0,
          envMapIntensity: 0.15,
        });
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0x451a03,
          transparent: true,
          opacity: 0.8,
        });

        const dThick = Math.max(0.08, door.thicknessM + 0.02);
        const jambW = 0.06;
        const leftJamb = new THREE.Mesh(unitBoxGeo, frameMat);
        leftJamb.scale.set(jambW, door.heightM, dThick);
        leftJamb.position.set(-door.widthM * 0.5 + jambW * 0.5, 0, 0);
        leftJamb.userData.bimId = door.id;

        const rightJamb = new THREE.Mesh(unitBoxGeo, frameMat);
        rightJamb.scale.set(jambW, door.heightM, dThick);
        rightJamb.position.set(door.widthM * 0.5 - jambW * 0.5, 0, 0);
        rightJamb.userData.bimId = door.id;

        const header = new THREE.Mesh(unitBoxGeo, frameMat);
        header.scale.set(door.widthM, 0.07, dThick);
        header.position.set(0, door.heightM - 0.07, 0);
        header.userData.bimId = door.id;

        const leafW = Math.max(0.3, door.widthM - jambW * 2);
        const leafH = Math.max(0.5, door.heightM - 0.07);
        const leaf = new THREE.Mesh(unitBoxGeo, panelMat);
        leaf.scale.set(leafW, leafH, 0.045);
        leaf.castShadow = !isSoftwareGl;
        leaf.userData.bimId = door.id;

        const leafEdge = new THREE.LineSegments(unitBoxEdgesGeo, edgeMat);
        leafEdge.scale.copy(leaf.scale);

        if (wallHeightM > door.heightM + 0.12) {
          const transomH = wallHeightM - door.heightM;
          const transomMat = new THREE.MeshStandardMaterial({
            color: COLOR_WALL_INT,
            roughness: 0.92,
            metalness: 0.0,
            envMapIntensity: 0.14,
          });
          const transom = new THREE.Mesh(unitBoxGeo, transomMat);
          transom.scale.set(door.widthM, transomH, door.thicknessM);
          transom.position.set(0, door.heightM, 0);
          group.add(transom);
          disposables.push(transomMat);
        }

        group.add(leftJamb, rightJamb, header, leaf, leafEdge);
        scene.add(group);

        pickMeshes.push(leftJamb, rightJamb, header, leaf);
        newEntries.set(door.id, {
          obj: door,
          materials: [panelMat],
          baseColors: [COLOR_DOOR_PANEL],
          edgeMat,
          baseEdgeColor: 0x451a03,
          baseEdgeOpacity: 0.8,
        });
        disposables.push(frameMat, panelMat, edgeMat);
      }
    }

    // 3. BIM WINDOWS
    if (showKind('window')) {
      for (const win of windows) {
        const group = new THREE.Group();
        group.position.set(win.cxM - centerX, 0, win.cyM - centerZ);
        if (win.orientation === 'V') group.rotation.y = Math.PI / 2;

        const sillMat = new THREE.MeshStandardMaterial({
          color: COLOR_WALL_EXT,
          roughness: 0.92,
          metalness: 0.0,
          envMapIntensity: 0.14,
        });
        const frameMat = new THREE.MeshStandardMaterial({
          color: COLOR_WIN_FRAME,
          roughness: 0.75,
          metalness: 0.1,
          envMapIntensity: 0.2,
        });
        const glassMat = new THREE.MeshStandardMaterial({
          color: COLOR_WIN_GLASS,
          roughness: 0.35,
          metalness: 0.1,
          envMapIntensity: 0.35,
          transparent: true,
          opacity: 0.55,
        });
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.85,
        });

        if (win.sillHeightM > 0.08) {
          const underWall = new THREE.Mesh(unitBoxGeo, sillMat);
          underWall.scale.set(win.widthM, win.sillHeightM, win.thicknessM);
          underWall.castShadow = !isSoftwareGl;
          underWall.userData.bimId = win.id;
          group.add(underWall);
          pickMeshes.push(underWall);
        }

        const sillLedge = new THREE.Mesh(unitBoxGeo, frameMat);
        sillLedge.scale.set(win.widthM + 0.06, 0.06, win.thicknessM + 0.08);
        sillLedge.position.set(0, win.sillHeightM, 0);
        sillLedge.userData.bimId = win.id;

        const glass = new THREE.Mesh(unitBoxGeo, glassMat);
        glass.scale.set(Math.max(0.25, win.widthM - 0.08), win.heightM, 0.04);
        glass.position.set(0, win.sillHeightM + 0.05, 0);
        glass.userData.bimId = win.id;

        const topFrame = new THREE.Mesh(unitBoxGeo, frameMat);
        topFrame.scale.set(win.widthM, 0.06, win.thicknessM + 0.02);
        topFrame.position.set(0, win.sillHeightM + win.heightM, 0);
        topFrame.userData.bimId = win.id;

        const mullion = new THREE.Mesh(unitBoxGeo, frameMat);
        mullion.scale.set(0.05, win.heightM, 0.07);
        mullion.position.set(0, win.sillHeightM + 0.05, 0);
        mullion.userData.bimId = win.id;

        const glassEdge = new THREE.LineSegments(unitBoxEdgesGeo, edgeMat);
        glassEdge.scale.copy(glass.scale);
        glassEdge.position.copy(glass.position);

        const topY = win.sillHeightM + win.heightM + 0.05;
        if (wallHeightM > topY + 0.08) {
          const lintel = new THREE.Mesh(unitBoxGeo, sillMat);
          lintel.scale.set(win.widthM, wallHeightM - topY, win.thicknessM);
          lintel.position.set(0, topY, 0);
          group.add(lintel);
        }

        group.add(sillLedge, glass, topFrame, mullion, glassEdge);
        scene.add(group);

        pickMeshes.push(sillLedge, glass, topFrame, mullion);
        newEntries.set(win.id, {
          obj: win,
          materials: [glassMat, frameMat],
          baseColors: [COLOR_WIN_GLASS, COLOR_WIN_FRAME],
          edgeMat,
          baseEdgeColor: 0xe0f2fe,
          baseEdgeOpacity: 0.85,
        });
        disposables.push(sillMat, frameMat, glassMat, edgeMat);
      }
    }

    // 4. BIM PILLARS
    if (showKind('pillar')) {
      for (const pil of pillars) {
        const group = new THREE.Group();
        group.position.set(pil.cxM - centerX, 0, pil.cyM - centerZ);
        group.scale.set(pil.widthM, Math.max(0.4, pil.heightM), pil.depthM);

        const bodyMat = new THREE.MeshStandardMaterial({
          color: COLOR_PILLAR_BODY,
          roughness: 0.9,
          metalness: 0.0,
          envMapIntensity: 0.14,
        });
        const capMat = new THREE.MeshStandardMaterial({
          color: COLOR_PILLAR_CAP,
          roughness: 0.85,
          metalness: 0.05,
          envMapIntensity: 0.12,
        });
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0xf8fafc,
          transparent: true,
          opacity: 0.7,
        });

        const bodyMesh = new THREE.Mesh(unitBodyGeo, bodyMat);
        bodyMesh.castShadow = !isSoftwareGl;
        bodyMesh.receiveShadow = !isSoftwareGl;
        bodyMesh.userData.bimId = pil.id;

        const capMesh = new THREE.Mesh(unitCapGeo, capMat);
        capMesh.userData.bimId = pil.id;

        const edgeLine = new THREE.LineSegments(unitEdgesGeo, edgeMat);
        group.add(bodyMesh, capMesh, edgeLine);
        scene.add(group);

        pickMeshes.push(bodyMesh, capMesh);
        newEntries.set(pil.id, {
          obj: pil,
          materials: [bodyMat],
          baseColors: [COLOR_PILLAR_BODY],
          edgeMat,
          baseEdgeColor: 0xf8fafc,
          baseEdgeOpacity: 0.7,
        });
        disposables.push(bodyMat, capMat, edgeMat);
      }
    }

    // 5. BIM ROOMS / FLOOR SLABS
    if (showKind('room')) {
      for (const rm of rooms) {
        const slabMat = new THREE.MeshStandardMaterial({
          color: COLOR_ROOM_SLAB,
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
          baseColors: [COLOR_ROOM_SLAB],
          edgeMat,
          baseEdgeColor: 0x0284c7,
          baseEdgeOpacity: 0.65,
        });
        disposables.push(slabMat, edgeMat);
      }
    }

    // 6. DEDICATED TOGGLEABLE QUOTE LAYER IN 3D/BIM
    const quotesGroup = new THREE.Group();
    quotesGroup.visible = showQuotesLayer;
    const cappedQuotes = significantQuotes.slice(0, 40);
    const spriteScale = Math.max(0.85, Math.min(2.4, diag * 0.085));
    for (const q of cappedQuotes) {
      const tex = makeQuoteSpriteTexture(q.text, q.kind === 'room');
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
      const hFocus = Math.min(wallHeightM * 0.3, 1.4);
      _targetLook.set(0, hFocus, 0);
      if (preset === 'top') {
        _targetPos.set(0, diag * 1.38, 0.01);
      } else if (preset === 'front') {
        _targetPos.set(0, diag * 0.42, diag * 1.18);
      } else {
        _targetPos.set(diag * 0.72, diag * 0.78, diag * 0.82);
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

    const modelKey = `${planWidthM.toFixed(1)}_${planHeightM.toFixed(1)}_${lumaVersion}`;
    if (savedCameraRef.current && lastModelKeyRef.current === modelKey) {
      camera.position.copy(savedCameraRef.current.pos);
      controls.target.copy(savedCameraRef.current.target);
      controls.update();
    } else {
      lastModelKeyRef.current = modelKey;
      setCameraPreset('iso', true);
    }

    // CAD Mouse & BIM Object Picking
    let pointerDownPos: { x: number; y: number } | null = null;
    let isMiddlePanning = false;
    let lastHoverTime = 0;

    const pickObjAt = (clientX: number, clientY: number): BimObject | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_ndc, camera);
      const hits = _raycaster.intersectObjects(pickMeshes, false);
      if (hits.length === 0) return null;
      const bimId = hits[0].object.userData?.bimId as string | undefined;
      if (!bimId) return null;
      return newEntries.get(bimId)?.obj ?? null;
    };

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
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isMiddlePanning) return;
      const now = performance.now();
      if (now - lastHoverTime < 45) return;
      lastHoverTime = now;

      const hit = pickObjAt(e.clientX, e.clientY);
      const hitId = hit?.id ?? null;
      if (hitId !== hoveredIdRef.current) {
        hoveredIdRef.current = hitId;
        setHoveredObj(hit);
        renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
        refreshObjectColors();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 1) {
        isMiddlePanning = false;
        renderer.domElement.style.cursor = hoveredIdRef.current ? 'pointer' : 'grab';
        return;
      }
      if (!pointerDownPos || e.button !== 0) return;
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      pointerDownPos = null;
      if (dist > 5) return;

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

    refreshObjectColors();
    requestRender();

    return () => {
      disposed = true;
      if (rafId !== 0) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
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
  }, [bimModel, mode, bimFilter, cleanFloorCanvas, significantQuotes, wallHeightM, lumaVersion, refreshObjectColors]);

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

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 select-none overflow-hidden">
      {/* BARRA MENU A TENDINA STILE AUTOCAD (SOPRA IL DISEGNO — ZERO SOVRAPPOSIZIONI SUL CANVAS) */}
      <div
        ref={menuBarRef}
        className="bg-slate-900 border-b border-slate-700/90 px-3 py-1 flex items-center justify-between gap-2 shrink-0 text-xs relative z-30"
      >
        <div className="flex items-center gap-1">
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
              <div className="absolute left-0 top-full mt-1 w-52 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-1 z-50 text-xs">
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
                    Rilevamento Muri dal PDF
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
              <span>{mode === 'bim' ? 'Oggetti BIM' : 'Computo Pareti'}</span>
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
                        ['all', 'Tutti gli oggetti BIM', bimModel.walls.length + bimModel.doors.length + bimModel.windows.length + bimModel.pillars.length + bimModel.rooms.length],
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
                {mode === 'bim' && (
                  <>
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
                      <span>+ Tutti i Vani</span>
                      <span className="font-mono text-[10px] text-cyan-400">{bimModel.rooms.length}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

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

        {/* AZIONI RAPIDE SELEZIONE (A DESTRA NELLA BARRA — ZERO OVERLAY SUL DISEGNO) */}
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
                <span>Computa {selectedObjects.length} selez.</span>
              </button>
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
                <input
                  type="text"
                  value={inspectedObj.finish}
                  onChange={(e) => onUpdateBimObject({ ...inspectedObj, finish: e.target.value })}
                  className="w-32 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-white"
                />
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

        {bimModel.walls.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto bg-slate-900 border border-slate-700 rounded-xl px-5 py-4 text-center max-w-sm shadow-2xl">
              <Box className="w-7 h-7 text-amber-400 mx-auto mb-2" />
              <div className="text-sm font-bold text-white">Nessuna parete rilevata nella pianta pulita</div>
              <p className="text-xs text-slate-400 mt-1">
                Apri il menu <strong className="text-slate-200">Modello ▾</strong> in alto e imposta{' '}
                <strong className="text-slate-200">Sottili</strong>, oppure verifica la calibrazione della scala.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* BARRA DI STATO CAD INFERIORE (FUORI DAL DISEGNO — LETTURA OGGETTO HOVER + TOTALI + COMANDI MOUSE) */}
      <div className="bg-slate-950 border-t border-slate-800 px-3 py-1 flex items-center justify-between gap-3 text-[11px] shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-0 truncate">
          {hoveredObj ? (
            <>
              <span className="font-mono font-bold text-amber-400 shrink-0">{hoveredObj.code}</span>
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
          Rotella: Zoom · Clic rotella: Pan · Trascina: Orbita
        </div>
      </div>
    </div>
  );
};
