import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { 
  X, Save, Grid3X3, Layers, Plus, Trash2, ChevronRight, Check,
  RotateCcw, Eye, Box, Sliders, Hash, ArrowRight, ShieldCheck,
  Maximize2, Sparkles, HelpCircle, RefreshCw, ZoomIn, ZoomOut, Compass
} from 'lucide-react';
import { REBAR_WEIGHTS } from '../constants';
import { Article } from '../types';

export interface GeneratedRebarRow {
  description: string;
  multiplier: number;
  length: number;
  weight: number; // altezza / peso kg/m
  diameter: number;
  category: 'ferri' | 'staffe';
}

interface RebarCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (measurements: Array<{ diameter: number; weight: number; multiplier: number; length: number; description: string }>) => void;
  articles?: Article[];
  targetArticleId?: string | null;
  onSelectTargetArticle?: (articleId: string) => void;
}

export type StructureCategory = 'beam' | 'column' | 'curb' | 'footing' | 'slab' | 'custom';

interface StructurePreset {
  id: StructureCategory;
  label: string;
  defaultName: string;
  defaultB: number; // cm
  defaultH: number; // cm
  defaultL: number; // m
  defaultCover: number; // cm
  topBarsCount: number;
  topBarsDia: number;
  botBarsCount: number;
  botBarsDia: number;
  sideBarsCount: number;
  sideBarsDia: number;
  stirrupDia: number;
  stirrupPitch: number; // cm
}

const PRESETS: Record<StructureCategory, StructurePreset> = {
  beam: {
    id: 'beam',
    label: 'Trave in C.A.',
    defaultName: 'Trave T1',
    defaultB: 30,
    defaultH: 50,
    defaultL: 5.00,
    defaultCover: 3.0,
    topBarsCount: 2,
    topBarsDia: 14,
    botBarsCount: 4,
    botBarsDia: 16,
    sideBarsCount: 2,
    sideBarsDia: 12,
    stirrupDia: 8,
    stirrupPitch: 15
  },
  column: {
    id: 'column',
    label: 'Pilastro in C.A.',
    defaultName: 'Pilastro P1',
    defaultB: 30,
    defaultH: 30,
    defaultL: 3.20,
    defaultCover: 3.0,
    topBarsCount: 2,
    topBarsDia: 16,
    botBarsCount: 2,
    botBarsDia: 16,
    sideBarsCount: 2,
    sideBarsDia: 16,
    stirrupDia: 8,
    stirrupPitch: 15
  },
  curb: {
    id: 'curb',
    label: 'Cordolo / Trave Fondaz.',
    defaultName: 'Cordolo C1',
    defaultB: 40,
    defaultH: 60,
    defaultL: 6.00,
    defaultCover: 4.0,
    topBarsCount: 3,
    topBarsDia: 16,
    botBarsCount: 3,
    botBarsDia: 16,
    sideBarsCount: 2,
    sideBarsDia: 12,
    stirrupDia: 10,
    stirrupPitch: 20
  },
  footing: {
    id: 'footing',
    label: 'Plinto di Fondazione',
    defaultName: 'Plinto PL1',
    defaultB: 120,
    defaultH: 60,
    defaultL: 1.20,
    defaultCover: 5.0,
    topBarsCount: 4,
    topBarsDia: 14,
    botBarsCount: 6,
    botBarsDia: 16,
    sideBarsCount: 0,
    sideBarsDia: 12,
    stirrupDia: 8,
    stirrupPitch: 20
  },
  slab: {
    id: 'slab',
    label: 'Soletta Piena / Solaio',
    defaultName: 'Soletta S1',
    defaultB: 100,
    defaultH: 20,
    defaultL: 4.00,
    defaultCover: 2.5,
    topBarsCount: 5,
    topBarsDia: 10,
    botBarsCount: 5,
    botBarsDia: 12,
    sideBarsCount: 0,
    sideBarsDia: 10,
    stirrupDia: 6,
    stirrupPitch: 25
  },
  custom: {
    id: 'custom',
    label: 'Elemento Personalizzato',
    defaultName: 'Elemento E1',
    defaultB: 30,
    defaultH: 40,
    defaultL: 4.50,
    defaultCover: 3.0,
    topBarsCount: 2,
    topBarsDia: 12,
    botBarsCount: 2,
    botBarsDia: 12,
    sideBarsCount: 0,
    sideBarsDia: 10,
    stirrupDia: 8,
    stirrupPitch: 20
  }
};

const getNominalWeight = (diameter: number): number => {
  const match = REBAR_WEIGHTS.find(w => w.diameter === diameter);
  if (match) return match.weight;
  // Formula fisica nominale: d^2 * 0.006165 kg/m
  return parseFloat(((diameter * diameter) * 0.006166).toFixed(3));
};

export const RebarCalculatorModal: React.FC<RebarCalculatorModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  articles = [],
  targetArticleId,
  onSelectTargetArticle
}) => {
  // --- STATO CONFIGURAZIONE STRUTTURALE ---
  const [structureType, setStructureType] = useState<StructureCategory>('beam');
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [elementName, setElementName] = useState<string>('Trave T1');
  const [elementMultiplier, setElementMultiplier] = useState<number>(1);

  const isColumn = structureType === 'column' || orientation === 'vertical';

  // Dimensioni calcestruzzo (in cm e m)
  const [baseCm, setBaseCm] = useState<number>(30);
  const [heightCm, setHeightCm] = useState<number>(50);
  const [lengthM, setLengthM] = useState<number>(5.00);
  const [coverCm, setCoverCm] = useState<number>(3.0);

  // Ferri Longitudinali Superiori
  const [topBarsCount, setTopBarsCount] = useState<number>(2);
  const [topBarsDia, setTopBarsDia] = useState<number>(14);
  const [topBarsLength, setTopBarsLength] = useState<number>(5.50);

  // Ferri Longitudinali Inferiori
  const [botBarsCount, setBotBarsCount] = useState<number>(4);
  const [botBarsDia, setBotBarsDia] = useState<number>(16);
  const [botBarsLength, setBotBarsLength] = useState<number>(5.50);

  // Ferri di Parete / Spina
  const [enableSideBars, setEnableSideBars] = useState<boolean>(true);
  const [sideBarsCount, setSideBarsCount] = useState<number>(2);
  const [sideBarsDia, setSideBarsDia] = useState<number>(12);
  const [sideBarsLength, setSideBarsLength] = useState<number>(5.50);

  // Staffe
  const [stirrupDia, setStirrupDia] = useState<number>(8);
  const [stirrupPitchCm, setStirrupPitchCm] = useState<number>(15);
  const [manualStirrupsCount, setManualStirrupsCount] = useState<number | null>(null);
  const [manualStirrupDev, setManualStirrupDev] = useState<number | null>(null);

  // Opzioni Inserimento
  const [separateDiameters, setSeparateDiameters] = useState<boolean>(true);
  const [includeSubtotal, setIncludeSubtotal] = useState<boolean>(true);

  // Distinta Sessione (accumulator)
  const [sessionBatch, setSessionBatch] = useState<GeneratedRebarRow[]>([]);

  // --- STATI VISUALIZZATORE 3D ---
  const [viewPreset, setViewPreset] = useState<'iso' | 'front' | 'section' | 'top'>('iso');
  const [xRayMode, setXRayMode] = useState<'transparent' | 'opaque' | 'rebarOnly'>('transparent');
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [showDimensions, setShowDimensions] = useState<boolean>(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeStateRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    rootGroup: THREE.Group;
    gridHelper?: THREE.GridHelper;
    isDragging: boolean;
    prevMousePos: { x: number; y: number };
    spherical: { radius: number; theta: number; phi: number };
    target: THREE.Vector3;
    animFrameId: number | null;
    updateCameraPosition?: () => void;
  } | null>(null);

  // Cambia preset tipo struttura
  const handleSelectPreset = (cat: StructureCategory) => {
    setStructureType(cat);
    setOrientation(cat === 'column' ? 'vertical' : 'horizontal');
    const p = PRESETS[cat];
    setElementName(p.defaultName);
    setBaseCm(p.defaultB);
    setHeightCm(p.defaultH);
    setLengthM(p.defaultL);
    setCoverCm(p.defaultCover);
    setTopBarsCount(p.topBarsCount);
    setTopBarsDia(p.topBarsDia);
    setTopBarsLength(parseFloat((p.defaultL + 0.50).toFixed(2)));
    setBotBarsCount(p.botBarsCount);
    setBotBarsDia(p.botBarsDia);
    setBotBarsLength(parseFloat((p.defaultL + 0.50).toFixed(2)));
    setEnableSideBars(p.sideBarsCount > 0);
    setSideBarsCount(p.sideBarsCount);
    setSideBarsDia(p.sideBarsDia);
    setSideBarsLength(parseFloat((p.defaultL + 0.50).toFixed(2)));
    setStirrupDia(p.stirrupDia);
    setStirrupPitchCm(p.stirrupPitch);
    setManualStirrupsCount(null);
    setManualStirrupDev(null);
  };

  // Aggiorna lunghezze ferri con ancoraggi sismici standard (40 diametri ai nodi)
  const handleApplyAnchorageLengths = () => {
    const extraAnchorTop = (40 * topBarsDia * 2) / 1000; // in m
    const extraAnchorBot = (40 * botBarsDia * 2) / 1000;
    setTopBarsLength(parseFloat((lengthM + extraAnchorTop).toFixed(2)));
    setBotBarsLength(parseFloat((lengthM + extraAnchorBot).toFixed(2)));
    if (enableSideBars) {
      setSideBarsLength(parseFloat((lengthM + (40 * sideBarsDia * 2) / 1000).toFixed(2)));
    }
  };

  // --- CALCOLI GEOMETRICI & STATISTICI ---
  // Calcolo automatico numero staffe: L(cm) / passo + 1
  const autoStirrupsCount = useMemo(() => {
    if (stirrupPitchCm <= 0) return 0;
    return Math.floor((lengthM * 100) / stirrupPitchCm) + 1;
  }, [lengthM, stirrupPitchCm]);

  const effectiveStirrupsCount = manualStirrupsCount !== null ? manualStirrupsCount : autoStirrupsCount;

  // Sviluppo geometrico staffa in metri: 2*(b - 2c) + 2*(h - 2c) + 2*(10*dia)
  const autoStirrupDevelopmentM = useMemo(() => {
    const internalB = Math.max(2, baseCm - 2 * coverCm);
    const internalH = Math.max(2, heightCm - 2 * coverCm);
    const perimeterCm = 2 * internalB + 2 * internalH;
    const hooksCm = 2 * (10 * (stirrupDia / 10)); // 2 ganci a 135° da 10 diametri
    return parseFloat(((perimeterCm + hooksCm) / 100).toFixed(2));
  }, [baseCm, heightCm, coverCm, stirrupDia]);

  const effectiveStirrupDevM = manualStirrupDev !== null ? manualStirrupDev : autoStirrupDevelopmentM;

  // Pesi lineari unitari (kg/m)
  const topBarsUnitWeight = getNominalWeight(topBarsDia);
  const botBarsUnitWeight = getNominalWeight(botBarsDia);
  const sideBarsUnitWeight = getNominalWeight(sideBarsDia);
  const stirrupUnitWeight = getNominalWeight(stirrupDia);

  // Pesi parziali singolo elemento
  const singleTopBarsWeight = topBarsCount * topBarsLength * topBarsUnitWeight;
  const singleBotBarsWeight = botBarsCount * botBarsLength * botBarsUnitWeight;
  const singleSideBarsWeight = (enableSideBars ? sideBarsCount : 0) * sideBarsLength * sideBarsUnitWeight;
  const singleTotalLongBarsWeight = singleTopBarsWeight + singleBotBarsWeight + singleSideBarsWeight;

  const singleStirrupsWeight = effectiveStirrupsCount * effectiveStirrupDevM * stirrupUnitWeight;
  const singleTotalSteelWeight = singleTotalLongBarsWeight + singleStirrupsWeight;

  // Calcolo con moltiplicatore elementi
  const totalBatchSteelWeight = singleTotalSteelWeight * elementMultiplier;

  // Volume calcestruzzo e incidenza kg/m3
  const concreteVolumeM3 = (baseCm / 100) * (heightCm / 100) * lengthM * elementMultiplier;
  const steelRatioKgM3 = concreteVolumeM3 > 0 ? totalBatchSteelWeight / concreteVolumeM3 : 0;

  // --- GENERAZIONE RIGHI PER IL COMPUTO METRICO ---
  const currentElementRows: GeneratedRebarRow[] = useMemo(() => {
    const rows: GeneratedRebarRow[] = [];
    const prefix = elementName ? elementName.trim() : 'Elemento C.A.';

    if (separateDiameters) {
      // 1. Ferri Longitudinali Inferiori
      if (botBarsCount > 0) {
        rows.push({
          description: `${prefix} - Ferri longitudinali inf. (${botBarsCount}Ø${botBarsDia} L=${botBarsLength.toFixed(2)}m)`,
          multiplier: elementMultiplier * botBarsCount,
          length: botBarsLength,
          weight: botBarsUnitWeight,
          diameter: botBarsDia,
          category: 'ferri'
        });
      }

      // 2. Ferri Longitudinali Superiori
      if (topBarsCount > 0) {
        rows.push({
          description: `${prefix} - Ferri longitudinali sup. (${topBarsCount}Ø${topBarsDia} L=${topBarsLength.toFixed(2)}m)`,
          multiplier: elementMultiplier * topBarsCount,
          length: topBarsLength,
          weight: topBarsUnitWeight,
          diameter: topBarsDia,
          category: 'ferri'
        });
      }

      // 3. Ferri di Parete
      if (enableSideBars && sideBarsCount > 0) {
        rows.push({
          description: `${prefix} - Ferri di parete / spina (${sideBarsCount}Ø${sideBarsDia} L=${sideBarsLength.toFixed(2)}m)`,
          multiplier: elementMultiplier * sideBarsCount,
          length: sideBarsLength,
          weight: sideBarsUnitWeight,
          diameter: sideBarsDia,
          category: 'ferri'
        });
      }
    } else {
      // Rigo accorpato ferri longitudinali con peso ponderato medio
      const totalBars = (topBarsCount + botBarsCount + (enableSideBars ? sideBarsCount : 0));
      if (totalBars > 0) {
        const weightedKgPerM = singleTotalLongBarsWeight / (totalBars * lengthM || 1);
        rows.push({
          description: `${prefix} - Ferri longitudinali (${botBarsCount}Ø${botBarsDia} + ${topBarsCount}Ø${topBarsDia}${enableSideBars ? ' + ' + sideBarsCount + 'Ø' + sideBarsDia : ''}) L=${lengthM.toFixed(2)}m`,
          multiplier: elementMultiplier * totalBars,
          length: lengthM,
          weight: parseFloat(weightedKgPerM.toFixed(3)),
          diameter: botBarsDia,
          category: 'ferri'
        });
      }
    }

    // 4. Rigo Staffe (ESATTAMENTE COME RICHIESTO: Nome seguito da staffe, numero, diametro, sviluppo di una staffa e peso)
    if (effectiveStirrupsCount > 0) {
      rows.push({
        description: `${prefix} - Staffe Ø${stirrupDia} p=${stirrupPitchCm}cm (N. ${effectiveStirrupsCount} staffe, sviluppo 1 staffa = ${effectiveStirrupDevM.toFixed(2)}m)`,
        multiplier: elementMultiplier * effectiveStirrupsCount,
        length: effectiveStirrupDevM,
        weight: stirrupUnitWeight,
        diameter: stirrupDia,
        category: 'staffe'
      });
    }

    return rows;
  }, [
    elementName, elementMultiplier, separateDiameters,
    botBarsCount, botBarsDia, botBarsLength, botBarsUnitWeight,
    topBarsCount, topBarsDia, topBarsLength, topBarsUnitWeight,
    enableSideBars, sideBarsCount, sideBarsDia, sideBarsLength, sideBarsUnitWeight,
    effectiveStirrupsCount, stirrupDia, stirrupPitchCm, effectiveStirrupDevM, stirrupUnitWeight,
    singleTotalLongBarsWeight, lengthM
  ]);

  // Carica subito nel computo metrico
  const handleApplyImmediate = () => {
    const toInsert = sessionBatch.length > 0 ? [...sessionBatch, ...currentElementRows] : currentElementRows;
    if (toInsert.length === 0) return;

    onAdd(toInsert.map(r => ({
      description: r.description,
      multiplier: r.multiplier,
      length: r.length,
      weight: r.weight,
      diameter: r.diameter
    })));

    setSessionBatch([]);
    onClose();
  };

  // Aggiungi alla distinta sessione e passa al prossimo elemento (es. T1 -> T2)
  const handleAddToBatch = () => {
    if (currentElementRows.length === 0) return;
    setSessionBatch(prev => [...prev, ...currentElementRows]);

    // Incrementa automaticamente il numero nella sigla dell'elemento (es. T1 -> T2, P1 -> P2)
    const match = elementName.match(/^(.*?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const num = parseInt(match[2], 10) + 1;
      setElementName(`${prefix}${num}`);
    } else {
      setElementName(`${elementName} bis`);
    }
  };

  // --- THREE.JS 3D INITIALIZATION & RENDERING ENGINE ---
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = canvas.clientWidth || 600;
    const height = canvas.clientHeight || 450;

    // Scena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Slate-900 profondo

    // Telecamera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Illuminazione architetturale di precisione
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight1.position.set(10, 15, 12);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.6); // Accento ciano per riflessi acciaio
    dirLight2.position.set(-10, -5, -10);
    scene.add(dirLight2);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.5);
    scene.add(hemiLight);

    // Griglia base di riferimento
    const gridHelper = new THREE.GridHelper(10, 20, 0x334155, 0x1e293b);
    gridHelper.position.y = -1.5;
    scene.add(gridHelper);

    // Gruppo radice che conterrà l'elemento strutturale
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Coordinate sferiche per l'orbita libera della telecamera
    const spherical = { radius: 7.5, theta: Math.PI / 4, phi: Math.PI / 3 };
    const target = new THREE.Vector3(0, 0, 0);

    const updateCameraPosition = () => {
      camera.position.x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = target.y + spherical.radius * Math.cos(spherical.phi);
      camera.position.z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(target);
    };
    updateCameraPosition();

    threeStateRef.current = {
      scene,
      camera,
      renderer,
      rootGroup,
      gridHelper,
      isDragging: false,
      prevMousePos: { x: 0, y: 0 },
      spherical,
      target,
      animFrameId: null,
      updateCameraPosition
    };

    // Mouse Controls per orbit & zoom fluido
    const onMouseDown = (e: MouseEvent) => {
      if (!threeStateRef.current) return;
      threeStateRef.current.isDragging = true;
      threeStateRef.current.prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!threeStateRef.current || !threeStateRef.current.isDragging) return;
      const dx = e.clientX - threeStateRef.current.prevMousePos.x;
      const dy = e.clientY - threeStateRef.current.prevMousePos.y;
      threeStateRef.current.prevMousePos = { x: e.clientX, y: e.clientY };

      const factor = 0.006;
      threeStateRef.current.spherical.theta -= dx * factor;
      threeStateRef.current.spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, threeStateRef.current.spherical.phi - dy * factor));
      updateCameraPosition();
    };

    const onMouseUp = () => {
      if (!threeStateRef.current) return;
      threeStateRef.current.isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (!threeStateRef.current) return;
      e.preventDefault();
      const zoomFactor = e.deltaY * 0.005;
      threeStateRef.current.spherical.radius = Math.max(2.0, Math.min(25.0, threeStateRef.current.spherical.radius + zoomFactor));
      updateCameraPosition();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Touch controls per tablet/mobile
    let touchStartDist = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (!threeStateRef.current) return;
      if (e.touches.length === 1) {
        threeStateRef.current.isDragging = true;
        threeStateRef.current.prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        touchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!threeStateRef.current) return;
      if (e.touches.length === 1 && threeStateRef.current.isDragging) {
        const dx = e.touches[0].clientX - threeStateRef.current.prevMousePos.x;
        const dy = e.touches[0].clientY - threeStateRef.current.prevMousePos.y;
        threeStateRef.current.prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        threeStateRef.current.spherical.theta -= dx * 0.008;
        threeStateRef.current.spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, threeStateRef.current.spherical.phi - dy * 0.008));
        updateCameraPosition();
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const factor = (touchStartDist - dist) * 0.01;
        touchStartDist = dist;
        threeStateRef.current.spherical.radius = Math.max(2.0, Math.min(25.0, threeStateRef.current.spherical.radius + factor));
        updateCameraPosition();
      }
    };

    const onTouchEnd = () => {
      if (!threeStateRef.current) return;
      threeStateRef.current.isDragging = false;
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!canvas || !threeStateRef.current) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && h > 0) {
        threeStateRef.current.camera.aspect = w / h;
        threeStateRef.current.camera.updateProjectionMatrix();
        threeStateRef.current.renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(canvas);

    // Loop di rendering a 60 FPS
    const animate = () => {
      if (!threeStateRef.current) return;
      if (autoRotate && !threeStateRef.current.isDragging) {
        threeStateRef.current.spherical.theta += 0.008;
        updateCameraPosition();
      }
      threeStateRef.current.renderer.render(scene, camera);
      threeStateRef.current.animFrameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);

      if (threeStateRef.current?.animFrameId) {
        cancelAnimationFrame(threeStateRef.current.animFrameId);
      }
      renderer.dispose();
      threeStateRef.current = null;
    };
  }, [isOpen]);

  // Aggiorna la vista della telecamera quando cambia il preset di vista o tipo struttura
  useEffect(() => {
    if (!threeStateRef.current) return;
    const { spherical, updateCameraPosition } = threeStateRef.current;
    const L = Math.max(0.5, Math.min(12, lengthM));

    if (viewPreset === 'iso') {
      spherical.theta = Math.PI / 4;
      spherical.phi = isColumn ? Math.PI / 2.8 : Math.PI / 3;
      spherical.radius = isColumn ? Math.max(5.5, L * 1.5) : 7.5;
    } else if (viewPreset === 'front') {
      spherical.theta = 0;
      spherical.phi = Math.PI / 2;
      spherical.radius = isColumn ? Math.max(5.0, L * 1.4) : 6.5;
    } else if (viewPreset === 'section') {
      if (isColumn) {
        // Per il pilastro la sezione è orizzontale: telecamera dall'alto verso il basso
        spherical.theta = 0;
        spherical.phi = 0.05;
        spherical.radius = 3.5;
      } else {
        // Per la trave la sezione è trasversale vista in testata
        spherical.theta = Math.PI / 2;
        spherical.phi = Math.PI / 2;
        spherical.radius = 4.0;
      }
    } else if (viewPreset === 'top') {
      spherical.theta = 0;
      spherical.phi = 0.05;
      spherical.radius = isColumn ? 4.5 : 8.0;
    }
    updateCameraPosition?.();
  }, [viewPreset, structureType, orientation, lengthM, isColumn]);

  // --- COSTRUZIONE GEOMETRIA PARAMETRICA 3D ---
  useEffect(() => {
    if (!threeStateRef.current) return;
    const { rootGroup, gridHelper } = threeStateRef.current;

    // Pulisci vecchi mesh
    while (rootGroup.children.length > 0) {
      const obj = rootGroup.children[0];
      rootGroup.remove(obj);
      if ((obj as any).geometry) (obj as any).geometry.dispose();
      if ((obj as any).material) {
        if (Array.isArray((obj as any).material)) {
          (obj as any).material.forEach((m: any) => m.dispose());
        } else {
          (obj as any).material.dispose();
        }
      }
    }

    // Scala dimensionale per Three.js: 1 unità = 1 metro
    const b = Math.max(0.1, baseCm / 100);
    const h = Math.max(0.1, heightCm / 100);
    const L = Math.max(0.5, Math.min(12, lengthM));
    const c = Math.max(0.01, Math.min(Math.min(b, h) / 2 - 0.02, coverCm / 100));

    // Posiziona il piano di griglia alla base dell'elemento (appoggio a terra)
    if (gridHelper) {
      gridHelper.position.y = isColumn ? -L / 2 : -h / 2;
    }

    // 1. BLOCCO CALCESTRUZZO (Trasparente o Solido)
    // Gradazione grigio cemento armato aumentata del 10% (0x3d4a5c, finitura minerale profonda, opacità 0.36)
    if (xRayMode !== 'rebarOnly') {
      // Per il pilastro la geometria sta verticale: larghezza b (X), altezza L (Y), profondità h (Z)
      // Per la trave: larghezza b (X), altezza h (Y), lunghezza L (Z)
      const concreteGeo = isColumn 
        ? new THREE.BoxGeometry(b, L, h) 
        : new THREE.BoxGeometry(b, h, L);

      const concreteMat = new THREE.MeshPhysicalMaterial({
        color: 0x3d4a5c, // Grigio cemento armato strutturale aumentato del 10% di profondità cromatica
        transparent: true,
        opacity: xRayMode === 'opaque' ? 0.98 : 0.36, // +10% presenza materica in trasparenza
        roughness: 0.50, // Finitura getto di calcestruzzo naturale
        metalness: 0.06,
        clearcoat: 0.20,
        depthWrite: xRayMode === 'opaque'
      });
      const concreteMesh = new THREE.Mesh(concreteGeo, concreteMat);
      concreteMesh.castShadow = true;
      concreteMesh.receiveShadow = true;
      rootGroup.add(concreteMesh);

      // Spigoli marcati tipo blueprint CAD tecnico
      const edges = new THREE.EdgesGeometry(concreteGeo);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xa0aec0,
        transparent: true,
        opacity: 0.70
      });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      rootGroup.add(wireframe);

      // Piastra / basamento di fondazione alla base del pilastro verticale
      if (isColumn) {
        const footingGeo = new THREE.BoxGeometry(b * 1.5, 0.06, h * 1.5);
        const footingMat = new THREE.MeshStandardMaterial({
          color: 0x242e3d, // Magrone / fondazione basale
          roughness: 0.85
        });
        const footingMesh = new THREE.Mesh(footingGeo, footingMat);
        footingMesh.position.set(0, -L / 2 - 0.03, 0);
        footingMesh.receiveShadow = true;
        rootGroup.add(footingMesh);
      }
    }

    // Materiali Acciaio
    const rebarMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8, // Azzurro titanio / acciaio lucido per ferri longitudinali
      metalness: 0.85,
      roughness: 0.25
    });

    const stirrupMat = new THREE.MeshStandardMaterial({
      color: 0xf97316, // Arancione vivido cantieristico per staffe
      metalness: 0.75,
      roughness: 0.3
    });

    // Dimensioni interne della staffa
    const stirrupDiaM = (stirrupDia / 1000);
    const stirrupRadius = Math.max(0.003, stirrupDiaM / 2);

    if (isColumn) {
      // ==========================================
      // PILASTRO IN C.A. (ORIENTAMENTO VERTICALE)
      // ==========================================
      const innerBx = b - 2 * c - stirrupDiaM;
      const innerHz = h - 2 * c - stirrupDiaM;

      const xLeft = -innerBx / 2;
      const xRight = innerBx / 2;
      const zBot = -innerHz / 2;
      const zTop = innerHz / 2;

      // Funzione per inserire barra verticale lungo l'asse Y
      const addColumnBar = (x: number, z: number, diaMm: number, barLenM: number) => {
        const radius = Math.max(0.004, (diaMm / 2000));
        const len = Math.max(0.2, barLenM);
        const barGeo = new THREE.CylinderGeometry(radius, radius, len, 16);
        const barMesh = new THREE.Mesh(barGeo, rebarMat);
        barMesh.position.set(x, 0, z); // Eretto in verticale lungo asse Y!
        barMesh.castShadow = true;
        rootGroup.add(barMesh);

        // Ganci di ripresa sismica in testa (+Y) e al piede (-Y)
        const hookLen = radius * 7;
        const hookGeo = new THREE.CylinderGeometry(radius, radius, hookLen, 12);

        // Gancio in testa (verso l'interno)
        const hookTop = new THREE.Mesh(hookGeo, rebarMat);
        hookTop.rotation.z = Math.PI / 2;
        hookTop.position.set(x + (x > 0 ? -hookLen / 2 : hookLen / 2), len / 2, z);
        rootGroup.add(hookTop);

        // Gancio al piede (ancoraggio plinto / fondazione)
        const hookBot = new THREE.Mesh(hookGeo, rebarMat);
        hookBot.rotation.z = Math.PI / 2;
        hookBot.position.set(x + (x > 0 ? hookLen / 2 : -hookLen / 2), -len / 2, z);
        rootGroup.add(hookBot);
      };

      // A. Ferri Faccia Posteriore (Z = zTop)
      if (topBarsCount > 0) {
        if (topBarsCount === 1) {
          addColumnBar(0, zTop, topBarsDia, topBarsLength);
        } else {
          const stepX = (xRight - xLeft) / (topBarsCount - 1);
          for (let i = 0; i < topBarsCount; i++) {
            addColumnBar(xLeft + i * stepX, zTop, topBarsDia, topBarsLength);
          }
        }
      }

      // B. Ferri Faccia Anteriore (Z = zBot)
      if (botBarsCount > 0) {
        if (botBarsCount === 1) {
          addColumnBar(0, zBot, botBarsDia, botBarsLength);
        } else {
          const stepX = (xRight - xLeft) / (botBarsCount - 1);
          for (let i = 0; i < botBarsCount; i++) {
            addColumnBar(xLeft + i * stepX, zBot, botBarsDia, botBarsLength);
          }
        }
      }

      // C. Ferri di Parete Pilastro (distribuiti lungo Z sui lati xLeft e xRight)
      if (enableSideBars && sideBarsCount > 0) {
        const pairs = Math.floor(sideBarsCount / 2);
        if (pairs > 0) {
          const stepZ = (zTop - zBot) / (pairs + 1);
          for (let p = 1; p <= pairs; p++) {
            const zPos = zBot + p * stepZ;
            addColumnBar(xLeft, zPos, sideBarsDia, sideBarsLength);
            addColumnBar(xRight, zPos, sideBarsDia, sideBarsLength);
          }
        }
      }

      // Staffe Orizzontali (anelli chiusi sul piano X-Z distribuiti lungo l'altezza Y)
      const numStirrups = effectiveStirrupsCount;
      if (numStirrups > 0) {
        const path = new THREE.CurvePath<THREE.Vector3>();
        const p1 = new THREE.Vector3(xLeft, 0, zTop);
        const p2 = new THREE.Vector3(xRight, 0, zTop);
        const p3 = new THREE.Vector3(xRight, 0, zBot);
        const p4 = new THREE.Vector3(xLeft, 0, zBot);

        path.add(new THREE.LineCurve3(p1, p2));
        path.add(new THREE.LineCurve3(p2, p3));
        path.add(new THREE.LineCurve3(p3, p4));
        path.add(new THREE.LineCurve3(p4, p1));

        // Gancio di chiusura sismica a 135° nel piano X-Z
        const hookPt = new THREE.Vector3(xLeft + 0.04, 0, zTop - 0.04);
        path.add(new THREE.LineCurve3(p1, hookPt));

        const stirrupGeo = new THREE.TubeGeometry(path, 32, stirrupRadius, 8, false);

        // Distribuzione verticale dal basso all'alto lungo Y
        const halfL = L / 2;
        const startY = -halfL + 0.06;
        const endY = halfL - 0.06;
        const pitchY = (stirrupPitchCm / 100);

        for (let s = 0; s < numStirrups; s++) {
          const curY = startY + s * pitchY;
          if (curY > endY + 0.02) break;

          const stirrupMesh = new THREE.Mesh(stirrupGeo, stirrupMat);
          stirrupMesh.position.set(0, curY, 0); // Posizionata a quota Y
          stirrupMesh.castShadow = true;
          rootGroup.add(stirrupMesh);
        }
      }
    } else {
      // ==========================================
      // TRAVE / CORDOLO / SOLETTA (ORIZZONTALE LUNGO Z)
      // ==========================================
      const innerBx = b - 2 * c - stirrupDiaM;
      const innerHy = h - 2 * c - stirrupDiaM;

      const xLeft = -innerBx / 2;
      const xRight = innerBx / 2;
      const yBot = -innerHy / 2;
      const yTop = innerHy / 2;

      // 2. FERRI LONGITUDINALI (Tondini lungo Z)
      const addLongitudinalBar = (x: number, y: number, diaMm: number, barLenM: number) => {
        const radius = Math.max(0.004, (diaMm / 2000));
        const len = Math.max(0.2, barLenM);
        const barGeo = new THREE.CylinderGeometry(radius, radius, len, 16);
        const barMesh = new THREE.Mesh(barGeo, rebarMat);
        barMesh.rotation.x = Math.PI / 2; // Allineato lungo asse Z
        barMesh.position.set(x, y, 0);
        barMesh.castShadow = true;
        rootGroup.add(barMesh);

        // Ganci di chiusura 90° alle estremità per realismo strutturale
        const hookLen = radius * 8;
        const hookGeo = new THREE.CylinderGeometry(radius, radius, hookLen, 12);
        const hookZ1 = new THREE.Mesh(hookGeo, rebarMat);
        hookZ1.position.set(x, y + (y > 0 ? -hookLen / 2 : hookLen / 2), len / 2);
        rootGroup.add(hookZ1);

        const hookZ2 = new THREE.Mesh(hookGeo, rebarMat);
        hookZ2.position.set(x, y + (y > 0 ? -hookLen / 2 : hookLen / 2), -len / 2);
        rootGroup.add(hookZ2);
      };

      // A. Ferri Superiori
      if (topBarsCount > 0) {
        if (topBarsCount === 1) {
          addLongitudinalBar(0, yTop, topBarsDia, topBarsLength);
        } else {
          const stepX = (xRight - xLeft) / (topBarsCount - 1);
          for (let i = 0; i < topBarsCount; i++) {
            addLongitudinalBar(xLeft + i * stepX, yTop, topBarsDia, topBarsLength);
          }
        }
      }

      // B. Ferri Inferiori
      if (botBarsCount > 0) {
        if (botBarsCount === 1) {
          addLongitudinalBar(0, yBot, botBarsDia, botBarsLength);
        } else {
          const stepX = (xRight - xLeft) / (botBarsCount - 1);
          for (let i = 0; i < botBarsCount; i++) {
            addLongitudinalBar(xLeft + i * stepX, yBot, botBarsDia, botBarsLength);
          }
        }
      }

      // C. Ferri di Parete
      if (enableSideBars && sideBarsCount > 0) {
        const pairs = Math.floor(sideBarsCount / 2);
        if (pairs > 0) {
          const stepY = (yTop - yBot) / (pairs + 1);
          for (let p = 1; p <= pairs; p++) {
            const yPos = yBot + p * stepY;
            addLongitudinalBar(xLeft, yPos, sideBarsDia, sideBarsLength);
            addLongitudinalBar(xRight, yPos, sideBarsDia, sideBarsLength);
          }
        }
      }

      // 3. STAFFE LUNGO LA LUNGHEZZA Z
      const numStirrups = effectiveStirrupsCount;
      if (numStirrups > 0) {
        const path = new THREE.CurvePath<THREE.Vector3>();
        const p1 = new THREE.Vector3(xLeft, yTop, 0);
        const p2 = new THREE.Vector3(xRight, yTop, 0);
        const p3 = new THREE.Vector3(xRight, yBot, 0);
        const p4 = new THREE.Vector3(xLeft, yBot, 0);

        path.add(new THREE.LineCurve3(p1, p2));
        path.add(new THREE.LineCurve3(p2, p3));
        path.add(new THREE.LineCurve3(p3, p4));
        path.add(new THREE.LineCurve3(p4, p1));

        // Aggiungi gancio sismico a 135° in alto
        const hookPt = new THREE.Vector3(xLeft + 0.04, yTop - 0.04, 0);
        path.add(new THREE.LineCurve3(p1, hookPt));

        const stirrupGeo = new THREE.TubeGeometry(path, 32, stirrupRadius, 8, false);

        // Posizionamento lungo Z
        const halfL = L / 2;
        const startZ = -halfL + 0.05;
        const endZ = halfL - 0.05;
        const pitchZ = (stirrupPitchCm / 100);

        for (let s = 0; s < numStirrups; s++) {
          const curZ = startZ + s * pitchZ;
          if (curZ > endZ + 0.02) break;

          const stirrupMesh = new THREE.Mesh(stirrupGeo, stirrupMat);
          stirrupMesh.position.z = curZ;
          stirrupMesh.castShadow = true;
          rootGroup.add(stirrupMesh);
        }
      }
    }
  }, [
    structureType, orientation, isColumn, baseCm, heightCm, lengthM, coverCm,
    topBarsCount, topBarsDia, topBarsLength,
    botBarsCount, botBarsDia, botBarsLength,
    enableSideBars, sideBarsCount, sideBarsDia, sideBarsLength,
    stirrupDia, stirrupPitchCm, effectiveStirrupsCount,
    xRayMode
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 text-slate-100 rounded-[2rem] shadow-2xl w-full max-w-7xl h-[94vh] max-h-[950px] border border-slate-700/80 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* HEADER MODAL */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-orange-500 to-amber-600 p-2.5 rounded-2xl shadow-lg shadow-orange-500/20 text-white">
              <Grid3X3 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                  Armature 3D Expert
                  <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full">
                    Elementi Omogenei & Staffe
                  </span>
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Calcolo parametrico travi, pilastri, cordoli e plinti con rendering 3D in tempo reale e distinta cantieristica
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Selettore Voce di Destinazione */}
            {articles.length > 0 && (
              <div className="hidden lg:flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
                <span className="text-[10px] uppercase font-bold text-slate-400">Inserisci in voce:</span>
                <select
                  value={targetArticleId || ''}
                  onChange={(e) => onSelectTargetArticle?.(e.target.value)}
                  className="bg-slate-900 text-xs font-bold text-orange-400 rounded-lg px-2 py-1 outline-none border border-slate-700 cursor-pointer max-w-[200px] truncate"
                >
                  {articles.map((art, idx) => (
                    <option key={art.id} value={art.id}>
                      [{idx + 1}] {art.code} - {art.description.substring(0, 30)}...
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors border border-transparent hover:border-slate-700"
              title="Chiudi finestra (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BODY A 2 COLONNE: 3D VIEWPORT (SX) + CONTROLLI STRUTTURALI (DX) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-slate-950">
          
          {/* COLONNA SINISTRA: VIEWPORT 3D & STATISTICHE (7 COLONNE SU DESKTOP) */}
          <div className="lg:col-span-7 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 relative bg-slate-950/70 overflow-hidden">
            
            {/* Barra Controlli 3D Top */}
            <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-800 shadow-xl pointer-events-auto">
                <button
                  onClick={() => setViewPreset('iso')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${viewPreset === 'iso' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  3D Iso
                </button>
                <button
                  onClick={() => setViewPreset('front')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${viewPreset === 'front' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  Fronte
                </button>
                <button
                  onClick={() => setViewPreset('section')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${viewPreset === 'section' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  Sezione
                </button>
                <button
                  onClick={() => setViewPreset('top')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${viewPreset === 'top' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  Pianta
                </button>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-800 shadow-xl pointer-events-auto">
                <button
                  onClick={() => setXRayMode(xRayMode === 'transparent' ? 'rebarOnly' : xRayMode === 'rebarOnly' ? 'opaque' : 'transparent')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${xRayMode === 'rebarOnly' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  title="Modalità Visualizzazione (Trasparente, Solo Ferri, Calcestruzzo Pieno)"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {xRayMode === 'transparent' ? 'Raggi X' : xRayMode === 'rebarOnly' ? 'Solo Gabbia' : 'Opaco'}
                </button>
                <button
                  onClick={() => setAutoRotate(!autoRotate)}
                  className={`p-1.5 rounded-lg text-xs transition-all ${autoRotate ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  title="Auto-rotazione 360°"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* CANVAS 3D INTERATTIVO */}
            <div className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing">
              <canvas ref={canvasRef} className="w-full h-full block" />
              
              {/* Badge Quote 3D sovrimpresse */}
              <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2 pointer-events-none">
                <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300">
                  <span className="text-orange-400 font-bold">SEZIONE:</span> {baseCm}×{heightCm} cm
                </div>
                <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300">
                  <span className="text-cyan-400 font-bold">{isColumn ? 'ALTEZZA H:' : 'LUNGH:'}</span> {lengthM.toFixed(2)} m
                </div>
                <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300">
                  <span className="text-emerald-400 font-bold">STAFFE:</span> {effectiveStirrupsCount} staffe @ {stirrupPitchCm}cm
                </div>
                <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300">
                  <span className="text-amber-400 font-bold">ASSETTO:</span> {isColumn ? '↕ Verticale (Pilastro)' : '↔ Orizzontale (Trave)'}
                </div>
              </div>

              {/* Suggerimento interazione mouse */}
              <div className="absolute bottom-3 right-3 z-10 text-[10px] text-slate-500 font-medium hidden sm:block pointer-events-none">
                Trascina: Ruota • Rotellina: Zoom • Shift+Drag: Sposta
              </div>
            </div>

            {/* PANNELLO METRICHE & INCIDENZA SOTTO IL 3D */}
            <div className="p-4 bg-slate-900/95 border-t border-slate-800 flex-shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Ferri Longitudinali</div>
                <div className="text-lg font-mono font-black text-white mt-0.5 tabular-nums">
                  {(singleTotalLongBarsWeight * elementMultiplier).toFixed(2)} <span className="text-xs font-normal text-slate-400">kg</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {topBarsCount + botBarsCount + (enableSideBars ? sideBarsCount : 0)} barre totali
                </div>
              </div>

              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">Staffe Totali</div>
                <div className="text-lg font-mono font-black text-white mt-0.5 tabular-nums">
                  {(singleStirrupsWeight * elementMultiplier).toFixed(2)} <span className="text-xs font-normal text-slate-400">kg</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {effectiveStirrupsCount * elementMultiplier} staffe Ø{stirrupDia}
                </div>
              </div>

              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-orange-500/30 bg-orange-500/5">
                <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Totale Acciaio</div>
                <div className="text-lg font-mono font-black text-orange-400 mt-0.5 tabular-nums">
                  {totalBatchSteelWeight.toFixed(2)} <span className="text-xs font-normal text-slate-400">kg</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-bold">
                  {elementMultiplier > 1 ? `x${elementMultiplier} elementi uguali` : '1 elemento singolo'}
                </div>
              </div>

              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Incidenza Acciaio</div>
                <div className="text-lg font-mono font-black text-white mt-0.5 tabular-nums">
                  {steelRatioKgM3.toFixed(1)} <span className="text-xs font-normal text-slate-400">kg/m³</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {concreteVolumeM3.toFixed(2)} m³ calcestruzzo
                </div>
              </div>
            </div>
          </div>

          {/* COLONNA DESTRA: CONTROLLI STRUTTURALI & INSERIMENTO COMPUTO (5 COLONNE) */}
          <div className="lg:col-span-5 flex flex-col h-full overflow-hidden bg-slate-900/60">
            
            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
              
              {/* 1. SELEZIONE TIPO ELEMENTO OMOGENEO */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">
                    1. Tipo Elemento Strutturale
                  </label>
                  {/* Switch rapido Orientamento 3D */}
                  <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setOrientation('horizontal')}
                      className={`px-2 py-0.5 rounded-md transition-all ${
                        !isColumn
                          ? 'bg-orange-500 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Disponi orizzontale come trave/cordolo"
                    >
                      ↔ Orizzontale
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientation('vertical')}
                      className={`px-2 py-0.5 rounded-md transition-all ${
                        isColumn
                          ? 'bg-orange-500 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Disponi verticale come pilastro"
                    >
                      ↕ Verticale
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(PRESETS) as StructureCategory[]).map(cat => (
                    <button
                      key={cat}
                      onClick={() => handleSelectPreset(cat)}
                      className={`p-2 rounded-xl text-left border text-xs font-bold transition-all ${
                        structureType === cat
                          ? 'bg-orange-500/20 border-orange-500 text-orange-300 ring-1 ring-orange-500/50'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <div className="truncate">{PRESETS[cat].label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. IDENTIFICAZIONE ELEMENTO & GEOMETRIA CASSAFORMA */}
              <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/60 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wide block mb-1">
                      Nome Elemento nel Computo
                    </label>
                    <input
                      type="text"
                      value={elementName}
                      onChange={(e) => setElementName(e.target.value)}
                      placeholder="Es: Trave T1, Pilastro P1..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wide block mb-1">
                      Pezzi Uguali
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={elementMultiplier}
                      onChange={(e) => setElementMultiplier(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-center text-orange-400 outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-1 border-t border-slate-700/50">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Base (cm)</label>
                    <input
                      type="number"
                      min="10"
                      max="300"
                      value={baseCm}
                      onChange={(e) => setBaseCm(Math.max(5, parseFloat(e.target.value) || 0))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      {isColumn ? 'Profondità (cm)' : 'Altezza (cm)'}
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="300"
                      value={heightCm}
                      onChange={(e) => setHeightCm(Math.max(5, parseFloat(e.target.value) || 0))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      {isColumn ? 'H Pilastro (m)' : 'Lunghezza (m)'}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      value={lengthM}
                      onChange={(e) => setLengthM(Math.max(0.2, parseFloat(e.target.value) || 0))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Copriferro (cm)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="10"
                      value={coverCm}
                      onChange={(e) => setCoverCm(Math.max(1, parseFloat(e.target.value) || 2.5))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
              </div>

              {/* 3. FERRI LONGITUDINALI (TONDINI) */}
              <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-cyan-400 tracking-wider">
                    2. Ferri Longitudinali (Tondini)
                  </span>
                  <button
                    onClick={handleApplyAnchorageLengths}
                    className="text-[10px] font-bold text-cyan-300 hover:text-white bg-cyan-950/60 hover:bg-cyan-900/80 px-2 py-0.5 rounded-md border border-cyan-500/30 transition-colors"
                    title="Calcola lunghezza con ancoraggi sismici 40Ø"
                  >
                    + Ancoraggi 40Ø
                  </button>
                </div>

                {/* Ferri Inferiori */}
                <div className="grid grid-cols-12 gap-2 items-center bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60">
                  <div className="col-span-4 text-xs font-bold text-slate-300">
                    Ferri Inferiori
                  </div>
                  <div className="col-span-2">
                    <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">N.</span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={botBarsCount}
                      onChange={(e) => setBotBarsCount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-xs font-mono font-bold text-center text-white"
                    />
                  </div>
                  <div className="col-span-3">
                    <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Diametro</span>
                    <select
                      value={botBarsDia}
                      onChange={(e) => setBotBarsDia(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-1 py-1 text-xs font-mono font-bold text-cyan-300"
                    >
                      {REBAR_WEIGHTS.map(w => (
                        <option key={w.diameter} value={w.diameter}>Ø{w.diameter}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Lung. (m)</span>
                    <input
                      type="number"
                      step="0.05"
                      value={botBarsLength}
                      onChange={(e) => setBotBarsLength(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-xs font-mono font-bold text-center text-white"
                    />
                  </div>
                </div>

                {/* Ferri Superiori */}
                <div className="grid grid-cols-12 gap-2 items-center bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60">
                  <div className="col-span-4 text-xs font-bold text-slate-300">
                    Ferri Superiori
                  </div>
                  <div className="col-span-2">
                    <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">N.</span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={topBarsCount}
                      onChange={(e) => setTopBarsCount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-xs font-mono font-bold text-center text-white"
                    />
                  </div>
                  <div className="col-span-3">
                    <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Diametro</span>
                    <select
                      value={topBarsDia}
                      onChange={(e) => setTopBarsDia(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-1 py-1 text-xs font-mono font-bold text-cyan-300"
                    >
                      {REBAR_WEIGHTS.map(w => (
                        <option key={w.diameter} value={w.diameter}>Ø{w.diameter}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Lung. (m)</span>
                    <input
                      type="number"
                      step="0.05"
                      value={topBarsLength}
                      onChange={(e) => setTopBarsLength(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-xs font-mono font-bold text-center text-white"
                    />
                  </div>
                </div>

                {/* Ferri di Parete (Opzionale) */}
                <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-700/40">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableSideBars}
                        onChange={(e) => setEnableSideBars(e.target.checked)}
                        className="rounded accent-orange-500"
                      />
                      <span>Ferri di Parete / Spina (Laterali)</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">consigliati per h &gt; 45 cm</span>
                  </div>

                  {enableSideBars && (
                    <div className="grid grid-cols-12 gap-2 items-center mt-2">
                      <div className="col-span-4 text-[11px] text-slate-400">
                        Barre laterali
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="2"
                          step="2"
                          value={sideBarsCount}
                          onChange={(e) => setSideBarsCount(Math.max(2, parseInt(e.target.value) || 2))}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-xs font-mono font-bold text-center text-white"
                        />
                      </div>
                      <div className="col-span-3">
                        <select
                          value={sideBarsDia}
                          onChange={(e) => setSideBarsDia(parseInt(e.target.value, 10))}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-1 py-1 text-xs font-mono font-bold text-cyan-300"
                        >
                          {REBAR_WEIGHTS.map(w => (
                            <option key={w.diameter} value={w.diameter}>Ø{w.diameter}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.05"
                          value={sideBarsLength}
                          onChange={(e) => setSideBarsLength(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-xs font-mono font-bold text-center text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 4. STAFFE (STIRRUPS) */}
              <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-orange-400 tracking-wider">
                    3. Staffe Sagomate & Passo
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Ø{stirrupDia} • {stirrupUnitWeight.toFixed(3)} kg/m
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      Diametro Staffa
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {[6, 8, 10].map(dia => (
                        <button
                          key={dia}
                          onClick={() => setStirrupDia(dia)}
                          className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                            stirrupDia === dia
                              ? 'bg-orange-500 text-white shadow-sm'
                              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          Ø{dia}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      Passo Staffe (cm)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="50"
                      value={stirrupPitchCm}
                      onChange={(e) => {
                        setStirrupPitchCm(Math.max(5, parseInt(e.target.value) || 15));
                        setManualStirrupsCount(null);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-center text-orange-400 outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      N. Staffe Calcolato
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={effectiveStirrupsCount}
                      onChange={(e) => setManualStirrupsCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-center text-white outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* Sviluppo 1 staffa */}
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-700/60 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-200">
                      Sviluppo di 1 Staffa (con ganci sismici 135°)
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                      2×({baseCm}-2×{coverCm}) + 2×({heightCm}-2×{coverCm}) + 2×(10Ø) = {autoStirrupDevelopmentM.toFixed(2)} m
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={effectiveStirrupDevM}
                      onChange={(e) => setManualStirrupDev(parseFloat(e.target.value) || 0)}
                      className="w-20 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-xs font-mono font-bold text-center text-orange-400"
                    />
                    <span className="text-xs font-mono text-slate-400">m</span>
                  </div>
                </div>
              </div>

              {/* 5. ANTEPRIMA RIGHI DA INSERIRE */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-orange-400" />
                    Anteprima Righi nel Computo Metrico
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[10px] text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={separateDiameters}
                        onChange={(e) => setSeparateDiameters(e.target.checked)}
                        className="rounded accent-orange-500 text-[10px]"
                      />
                      <span>Separa Ø</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {currentElementRows.map((r, i) => (
                    <div key={i} className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs font-mono">
                      <div className="truncate pr-2">
                        <span className={`font-bold ${r.category === 'ferri' ? 'text-cyan-300' : 'text-orange-300'}`}>
                          {r.description}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0 text-slate-400 tabular-nums">
                        {r.multiplier} × {r.length.toFixed(2)}m × {r.weight.toFixed(3)}kg = <span className="text-white font-bold">{(r.multiplier * r.length * r.weight).toFixed(2)} kg</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Session Batch List (se ha elementi in sospeso) */}
                {sessionBatch.length > 0 && (
                  <div className="pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1.5">
                      <span>Elementi in distinta sessione: {sessionBatch.length} righi accumulati</span>
                      <button
                        onClick={() => setSessionBatch([])}
                        className="text-red-400 hover:underline text-[10px]"
                      >
                        Svuota distinta
                      </button>
                    </div>
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {sessionBatch.map((b, idx) => (
                        <div key={idx} className="text-[10px] font-mono text-slate-500 flex justify-between bg-slate-900/40 px-2 py-1 rounded">
                          <span className="truncate">{b.description}</span>
                          <span>{(b.multiplier * b.length * b.weight).toFixed(2)} kg</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* BARRA AZIONI BOTTOM */}
            <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 flex-shrink-0">
              <button
                onClick={handleAddToBatch}
                className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-all border border-slate-700 flex items-center gap-2"
                title="Aggiungi questo elemento e continua con un altro elemento (es. T1 poi T2)"
              >
                <Plus className="w-4 h-4 text-orange-400" />
                <span>Salva &amp; Prossimo Elemento</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Annulla
                </button>

                <button
                  onClick={handleApplyImmediate}
                  disabled={currentElementRows.length === 0 && sessionBatch.length === 0}
                  className="px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider bg-orange-500 hover:bg-orange-600 disabled:opacity-30 text-white shadow-lg shadow-orange-500/25 transition-all flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Carica in Computo ({(totalBatchSteelWeight + sessionBatch.reduce((acc, r) => acc + (r.multiplier * r.length * r.weight), 0)).toFixed(2)} kg)</span>
                  <ChevronRight className="w-4 h-4 opacity-70" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RebarCalculatorModal;
