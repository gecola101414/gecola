import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { 
  X, Save, Grid3X3, Layers, Plus, Trash2, ChevronRight, Check,
  RotateCcw, Eye, Box, Sliders, Hash, ArrowRight, ShieldCheck,
  Maximize2, Sparkles, HelpCircle, RefreshCw, ZoomIn, ZoomOut, Compass,
  CircleDot, Disc
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

export type StructureCategory = 'beam' | 'column' | 'circular_column' | 'curb' | 'footing' | 'slab' | 'custom';

interface StructurePreset {
  id: StructureCategory;
  label: string;
  defaultName: string;
  defaultB: number; // cm (o Diametro per circolare)
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
    label: 'Pilastro Rettangolare',
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
  circular_column: {
    id: 'circular_column',
    label: 'Pilastro Circolare',
    defaultName: 'Pilastro Circolare PC1',
    defaultB: 40, // Diametro D in cm
    defaultH: 40,
    defaultL: 3.50,
    defaultCover: 3.5,
    topBarsCount: 0,
    topBarsDia: 16,
    botBarsCount: 8, // N. barre radiali longitudinali
    botBarsDia: 16,
    sideBarsCount: 0,
    sideBarsDia: 16,
    stirrupDia: 8,
    stirrupPitch: 10
  },
  curb: {
    id: 'curb',
    label: 'Cordolo / Fondazione',
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
    label: 'Elemento Libero',
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
  const [structureType, setStructureType] = useState<StructureCategory | null>(null);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [elementName, setElementName] = useState<string>('');
  const [elementMultiplier, setElementMultiplier] = useState<number>(1);

  // Per pilastro circolare: tipologia staffa ('spiral' per elica continua, 'rings' per anelli chiusi)
  const [circularStirrupType, setCircularStirrupType] = useState<'spiral' | 'rings'>('spiral');

  const isCircular = structureType === 'circular_column';
  const isColumn = structureType === 'column' || structureType === 'circular_column' || orientation === 'vertical';

  // Dimensioni calcestruzzo (in cm e m). Per circolare baseCm rappresenta il Diametro D
  const [baseCm, setBaseCm] = useState<number>(30);
  const [heightCm, setHeightCm] = useState<number>(50);
  const [lengthM, setLengthM] = useState<number>(5.00);
  const [coverCm, setCoverCm] = useState<number>(3.0);

  // Ferri Longitudinali Superiori (per travi/rettangolari)
  const [topBarsCount, setTopBarsCount] = useState<number>(2);
  const [topBarsDia, setTopBarsDia] = useState<number>(14);
  const [topBarsLength, setTopBarsLength] = useState<number>(5.50);

  // Ferri Longitudinali Inferiori / Radiali corona circolare
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

  // Reset tipologia all'apertura del modale (nessuna tipologia selezionata all'avvio)
  useEffect(() => {
    if (isOpen) {
      setStructureType(null);
      setElementName('');
    }
  }, [isOpen]);

  // Input strings per permettere cancellazione totale con Backspace senza reset forzato
  const [multiplierInput, setMultiplierInput] = useState<string>('1');
  const [baseCmInput, setBaseCmInput] = useState<string>('30');
  const [heightCmInput, setHeightCmInput] = useState<string>('50');
  const [lengthMInput, setLengthMInput] = useState<string>('5.00');
  const [coverCmInput, setCoverCmInput] = useState<string>('3.0');
  const [pitchInput, setPitchInput] = useState<string>('15');
  const [countInput, setCountInput] = useState<string>('34');

  // Input strings per numero e lunghezze barre (evitano reset prematuro durante digitazione es. 12)
  const [botBarsCountInput, setBotBarsCountInput] = useState<string>('4');
  const [topBarsCountInput, setTopBarsCountInput] = useState<string>('2');
  const [sideBarsCountInput, setSideBarsCountInput] = useState<string>('2');
  const [botBarsLengthInput, setBotBarsLengthInput] = useState<string>('5.50');
  const [topBarsLengthInput, setTopBarsLengthInput] = useState<string>('5.50');
  const [sideBarsLengthInput, setSideBarsLengthInput] = useState<string>('5.50');

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

  // Aggiornamento bidirezionale Passo Staffe <-> Numero Staffe
  const handlePitchChange = (raw: string) => {
    setPitchInput(raw);
    const p = parseFloat(raw.replace(',', '.'));
    if (!isNaN(p) && p > 0) {
      setStirrupPitchCm(p);
      const totalLenCm = lengthM * 100;
      const n = Math.max(1, Math.floor(totalLenCm / p) + 1);
      setManualStirrupsCount(n);
      setCountInput(n.toString());
    }
  };

  const handlePitchBlur = () => {
    const p = parseFloat(pitchInput.replace(',', '.'));
    if (isNaN(p) || p <= 0) {
      setPitchInput(stirrupPitchCm > 0 ? stirrupPitchCm.toString() : '15');
      if (stirrupPitchCm <= 0) setStirrupPitchCm(15);
    } else {
      setPitchInput(p.toString());
    }
  };

  const handleCountChange = (raw: string) => {
    setCountInput(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 1) {
      setManualStirrupsCount(n);
      const totalLenCm = lengthM * 100;
      const p = n > 1 ? Math.max(1, parseFloat(((totalLenCm / (n - 1))).toFixed(1))) : Math.round(totalLenCm);
      setStirrupPitchCm(p);
      setPitchInput(p.toString());
    }
  };

  const handleCountBlur = () => {
    const n = parseInt(countInput, 10);
    if (isNaN(n) || n < 1) {
      const fallbackN = effectiveStirrupsCount > 0 ? effectiveStirrupsCount : 1;
      setCountInput(fallbackN.toString());
      setManualStirrupsCount(fallbackN);
    } else {
      setCountInput(n.toString());
    }
  };

  // Stepper increment / decrement per Passo e Numero Staffe
  const handleStepPitch = (delta: number) => {
    const current = parseFloat(pitchInput.replace(',', '.')) || stirrupPitchCm || 15;
    const next = Math.max(2.5, parseFloat((current + delta).toFixed(1)));
    setStirrupPitchCm(next);
    setPitchInput(next.toString());
    const totalLenCm = lengthM * 100;
    const n = Math.max(1, Math.floor(totalLenCm / next) + 1);
    setManualStirrupsCount(n);
    setCountInput(n.toString());
  };

  const handleStepCount = (delta: number) => {
    const current = parseInt(countInput, 10) || effectiveStirrupsCount || 1;
    const next = Math.max(1, current + delta);
    setManualStirrupsCount(next);
    setCountInput(next.toString());
    const totalLenCm = lengthM * 100;
    const p = next > 1 ? Math.max(1, parseFloat(((totalLenCm / (next - 1))).toFixed(1))) : Math.round(totalLenCm);
    setStirrupPitchCm(p);
    setPitchInput(p.toString());
  };

  const handleSetDirectPitch = (targetPitch: number) => {
    setStirrupPitchCm(targetPitch);
    setPitchInput(targetPitch.toString());
    const totalLenCm = lengthM * 100;
    const n = Math.max(1, Math.floor(totalLenCm / targetPitch) + 1);
    setManualStirrupsCount(n);
    setCountInput(n.toString());
  };

  const handleMultiplierChange = (raw: string) => {
    setMultiplierInput(raw);
    const m = parseInt(raw, 10);
    if (!isNaN(m) && m > 0) {
      setElementMultiplier(m);
    }
  };

  const handleMultiplierBlur = () => {
    const m = parseInt(multiplierInput, 10);
    if (isNaN(m) || m < 1) {
      setMultiplierInput(elementMultiplier.toString());
    } else {
      setMultiplierInput(m.toString());
    }
  };

  // Handlers per Barre Inferiori / Radiali
  const handleBotBarsCountChange = (raw: string) => {
    setBotBarsCountInput(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 0) {
      setBotBarsCount(n);
    }
  };

  const handleBotBarsCountBlur = () => {
    const n = parseInt(botBarsCountInput, 10);
    if (isNaN(n) || n < (isCircular ? 1 : 0)) {
      const fallback = isCircular ? Math.max(1, botBarsCount || 6) : Math.max(0, botBarsCount);
      setBotBarsCount(fallback);
      setBotBarsCountInput(fallback.toString());
    } else {
      setBotBarsCountInput(n.toString());
    }
  };

  const handleBotBarsLengthChange = (raw: string) => {
    setBotBarsLengthInput(raw);
    const l = parseFloat(raw.replace(',', '.'));
    if (!isNaN(l) && l >= 0) {
      setBotBarsLength(l);
    }
  };

  const handleBotBarsLengthBlur = () => {
    const l = parseFloat(botBarsLengthInput.replace(',', '.'));
    if (isNaN(l) || l <= 0) {
      setBotBarsLengthInput(botBarsLength.toFixed(2));
    } else {
      setBotBarsLengthInput(l.toFixed(2));
    }
  };

  // Handlers per Barre Superiori
  const handleTopBarsCountChange = (raw: string) => {
    setTopBarsCountInput(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 0) {
      setTopBarsCount(n);
    }
  };

  const handleTopBarsCountBlur = () => {
    const n = parseInt(topBarsCountInput, 10);
    if (isNaN(n) || n < 0) {
      setTopBarsCountInput(topBarsCount.toString());
    } else {
      setTopBarsCountInput(n.toString());
    }
  };

  const handleTopBarsLengthChange = (raw: string) => {
    setTopBarsLengthInput(raw);
    const l = parseFloat(raw.replace(',', '.'));
    if (!isNaN(l) && l >= 0) {
      setTopBarsLength(l);
    }
  };

  const handleTopBarsLengthBlur = () => {
    const l = parseFloat(topBarsLengthInput.replace(',', '.'));
    if (isNaN(l) || l <= 0) {
      setTopBarsLengthInput(topBarsLength.toFixed(2));
    } else {
      setTopBarsLengthInput(l.toFixed(2));
    }
  };

  // Handlers per Barre Parete / Laterali
  const handleSideBarsCountChange = (raw: string) => {
    setSideBarsCountInput(raw);
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 0) {
      setSideBarsCount(n);
    }
  };

  const handleSideBarsCountBlur = () => {
    const n = parseInt(sideBarsCountInput, 10);
    if (isNaN(n) || n < 0) {
      setSideBarsCountInput(sideBarsCount.toString());
    } else {
      setSideBarsCountInput(n.toString());
    }
  };

  const handleSideBarsLengthChange = (raw: string) => {
    setSideBarsLengthInput(raw);
    const l = parseFloat(raw.replace(',', '.'));
    if (!isNaN(l) && l >= 0) {
      setSideBarsLength(l);
    }
  };

  const handleSideBarsLengthBlur = () => {
    const l = parseFloat(sideBarsLengthInput.replace(',', '.'));
    if (isNaN(l) || l <= 0) {
      setSideBarsLengthInput(sideBarsLength.toFixed(2));
    } else {
      setSideBarsLengthInput(l.toFixed(2));
    }
  };

  const handleBaseChange = (raw: string) => {
    setBaseCmInput(raw);
    const b = parseFloat(raw);
    if (!isNaN(b) && b > 0) setBaseCm(b);
  };
  const handleBaseBlur = () => {
    const b = parseFloat(baseCmInput);
    if (isNaN(b) || b <= 0) setBaseCmInput(baseCm.toString());
    else setBaseCmInput(b.toString());
  };

  const handleHeightChange = (raw: string) => {
    setHeightCmInput(raw);
    const h = parseFloat(raw);
    if (!isNaN(h) && h > 0) setHeightCm(h);
  };
  const handleHeightBlur = () => {
    const h = parseFloat(heightCmInput);
    if (isNaN(h) || h <= 0) setHeightCmInput(heightCm.toString());
    else setHeightCmInput(h.toString());
  };

  const handleLengthChange = (raw: string) => {
    setLengthMInput(raw);
    const l = parseFloat(raw);
    if (!isNaN(l) && l > 0) {
      setLengthM(l);
      // Ricalcola staffe mantenendo il passo corrente
      const totalLenCm = l * 100;
      const p = stirrupPitchCm > 0 ? stirrupPitchCm : 15;
      const n = Math.max(2, Math.floor(totalLenCm / p) + 1);
      setManualStirrupsCount(n);
      setCountInput(n.toString());
    }
  };
  const handleLengthBlur = () => {
    const l = parseFloat(lengthMInput);
    if (isNaN(l) || l <= 0) setLengthMInput(lengthM.toFixed(2));
    else setLengthMInput(l.toFixed(2));
  };

  const handleCoverChange = (raw: string) => {
    setCoverCmInput(raw);
    const c = parseFloat(raw);
    if (!isNaN(c) && c > 0) setCoverCm(c);
  };
  const handleCoverBlur = () => {
    const c = parseFloat(coverCmInput);
    if (isNaN(c) || c <= 0) setCoverCmInput(coverCm.toString());
    else setCoverCmInput(c.toString());
  };

  // Funzione per centrare perfettamente la vista 3D
  const handleResetCenter = () => {
    if (!threeStateRef.current) return;
    const { spherical, target, updateCameraPosition } = threeStateRef.current;
    target.set(0, 0, 0);
    const L = Math.max(0.5, Math.min(12, lengthM));
    if (viewPreset === 'iso') {
      spherical.theta = Math.PI * 0.25;
      spherical.phi = isColumn ? Math.PI * 0.38 : Math.PI * 0.33;
      spherical.radius = isColumn ? Math.max(4.8, L * 1.35) : Math.max(4.8, L * 1.35);
    } else if (viewPreset === 'front') {
      spherical.theta = 0;
      spherical.phi = Math.PI / 2;
      spherical.radius = isColumn ? Math.max(4.2, L * 1.25) : 5.8;
    } else if (viewPreset === 'section') {
      spherical.theta = isColumn ? 0 : Math.PI / 2;
      spherical.phi = isColumn ? 0.05 : Math.PI / 2;
      spherical.radius = isColumn ? 3.5 : 3.8;
    } else if (viewPreset === 'top') {
      spherical.theta = 0;
      spherical.phi = 0.05;
      spherical.radius = isColumn ? 4.2 : 6.8;
    }
    updateCameraPosition?.();
  };

  // Cambia preset tipo struttura
  const handleSelectPreset = (cat: StructureCategory) => {
    setStructureType(cat);
    setOrientation(cat === 'column' || cat === 'circular_column' ? 'vertical' : 'horizontal');
    const p = PRESETS[cat];
    setElementName(p.defaultName);
    setBaseCm(p.defaultB);
    setBaseCmInput(p.defaultB.toString());
    setHeightCm(p.defaultH);
    setHeightCmInput(p.defaultH.toString());
    setLengthM(p.defaultL);
    setLengthMInput(p.defaultL.toFixed(2));
    setCoverCm(p.defaultCover);
    setCoverCmInput(p.defaultCover.toString());
    setTopBarsCount(p.topBarsCount);
    setTopBarsCountInput(p.topBarsCount.toString());
    setTopBarsDia(p.topBarsDia);
    setTopBarsLength(parseFloat((p.defaultL + 0.50).toFixed(2)));
    setTopBarsLengthInput((p.defaultL + 0.50).toFixed(2));
    setBotBarsCount(p.botBarsCount);
    setBotBarsCountInput(p.botBarsCount.toString());
    setBotBarsDia(p.botBarsDia);
    setBotBarsLength(parseFloat((p.defaultL + 0.50).toFixed(2)));
    setBotBarsLengthInput((p.defaultL + 0.50).toFixed(2));
    setEnableSideBars(p.sideBarsCount > 0);
    setSideBarsCount(p.sideBarsCount);
    setSideBarsCountInput(p.sideBarsCount.toString());
    setSideBarsDia(p.sideBarsDia);
    setSideBarsLength(parseFloat((p.defaultL + 0.50).toFixed(2)));
    setSideBarsLengthInput((p.defaultL + 0.50).toFixed(2));
    setStirrupDia(p.stirrupDia);
    setStirrupPitchCm(p.stirrupPitch);
    setPitchInput(p.stirrupPitch.toString());
    const initialCount = Math.floor((p.defaultL * 100) / p.stirrupPitch) + 1;
    setManualStirrupsCount(initialCount);
    setCountInput(initialCount.toString());
    setManualStirrupDev(null);
  };

  // Aggiorna lunghezze ferri con ancoraggi sismici standard (40 diametri ai nodi)
  const handleApplyAnchorageLengths = () => {
    const extraAnchorTop = (40 * topBarsDia * 2) / 1000; // in m
    const extraAnchorBot = (40 * botBarsDia * 2) / 1000;
    const newTopL = parseFloat((lengthM + extraAnchorTop).toFixed(2));
    const newBotL = parseFloat((lengthM + extraAnchorBot).toFixed(2));
    setTopBarsLength(newTopL);
    setTopBarsLengthInput(newTopL.toFixed(2));
    setBotBarsLength(newBotL);
    setBotBarsLengthInput(newBotL.toFixed(2));
    if (enableSideBars) {
      const newSideL = parseFloat((lengthM + (40 * sideBarsDia * 2) / 1000).toFixed(2));
      setSideBarsLength(newSideL);
      setSideBarsLengthInput(newSideL.toFixed(2));
    }
  };

  // --- CALCOLI GEOMETRICI & STATISTICI ---
  // Calcolo automatico numero staffe: L(cm) / passo + 1 (per spirale: numero di spire)
  const autoStirrupsCount = useMemo(() => {
    if (stirrupPitchCm <= 0) return 0;
    if (isCircular && circularStirrupType === 'spiral') {
      return Math.max(3, Math.floor((lengthM * 100) / stirrupPitchCm) + 3);
    }
    return Math.floor((lengthM * 100) / stirrupPitchCm) + 1;
  }, [lengthM, stirrupPitchCm, isCircular, circularStirrupType]);

  const effectiveStirrupsCount = manualStirrupsCount !== null ? manualStirrupsCount : autoStirrupsCount;

  // Sviluppo geometrico staffa in metri
  const autoStirrupDevelopmentM = useMemo(() => {
    if (isCircular) {
      const effDiamM = Math.max(0.05, (baseCm - 2 * coverCm) / 100);
      if (circularStirrupType === 'spiral') {
        // Singola spira elicoidale
        const pitchM = stirrupPitchCm / 100;
        const turnLength = Math.sqrt(Math.pow(Math.PI * effDiamM, 2) + Math.pow(pitchM, 2));
        return parseFloat(turnLength.toFixed(3));
      } else {
        // Anello circolare chiuso con sovrapposizione ganci sismici 135° (2 * 10 diametri, min 7cm cad.)
        const ringPerimeter = Math.PI * effDiamM;
        const hookPerSideM = Math.max(0.07, 10 * (stirrupDia / 1000));
        const hooksM = 2 * hookPerSideM;
        return parseFloat((ringPerimeter + hooksM).toFixed(2));
      }
    }
    const internalB = Math.max(2, baseCm - 2 * coverCm);
    const internalH = Math.max(2, heightCm - 2 * coverCm);
    const perimeterCm = 2 * internalB + 2 * internalH;
    // 2 ganci antisismici a 135° da 10 diametri (min 7 cm ciascuno per norma tecnica NTC2018 / EC2)
    const hookPerSideCm = Math.max(7.0, 10 * (stirrupDia / 10));
    const hooksCm = 2 * hookPerSideCm;
    return parseFloat(((perimeterCm + hooksCm) / 100).toFixed(2));
  }, [isCircular, circularStirrupType, baseCm, heightCm, coverCm, stirrupDia, stirrupPitchCm]);

  const effectiveStirrupDevM = manualStirrupDev !== null ? manualStirrupDev : autoStirrupDevelopmentM;

  // Sviluppo totale spirale continua in metri (se spirale continua)
  const totalSpiralLengthM = useMemo(() => {
    if (isCircular && circularStirrupType === 'spiral') {
      return parseFloat((effectiveStirrupsCount * effectiveStirrupDevM + 0.40).toFixed(2)); // +40cm ancoraggi
    }
    return 0;
  }, [isCircular, circularStirrupType, effectiveStirrupsCount, effectiveStirrupDevM]);

  // Pesi lineari unitari (kg/m)
  const topBarsUnitWeight = getNominalWeight(topBarsDia);
  const botBarsUnitWeight = getNominalWeight(botBarsDia);
  const sideBarsUnitWeight = getNominalWeight(sideBarsDia);
  const stirrupUnitWeight = getNominalWeight(stirrupDia);

  // Pesi parziali singolo elemento
  const singleTopBarsWeight = (isCircular ? 0 : topBarsCount) * topBarsLength * topBarsUnitWeight;
  const singleBotBarsWeight = botBarsCount * botBarsLength * botBarsUnitWeight;
  const singleSideBarsWeight = (isCircular || !enableSideBars ? 0 : sideBarsCount) * sideBarsLength * sideBarsUnitWeight;
  const singleTotalLongBarsWeight = singleTopBarsWeight + singleBotBarsWeight + singleSideBarsWeight;

  const singleStirrupsWeight = (isCircular && circularStirrupType === 'spiral')
    ? totalSpiralLengthM * stirrupUnitWeight
    : effectiveStirrupsCount * effectiveStirrupDevM * stirrupUnitWeight;
    
  const singleTotalSteelWeight = singleTotalLongBarsWeight + singleStirrupsWeight;

  // Calcolo con moltiplicatore elementi
  const totalBatchSteelWeight = singleTotalSteelWeight * elementMultiplier;

  // Volume calcestruzzo e incidenza kg/m3
  const concreteVolumeM3 = isCircular
    ? Math.PI * Math.pow((baseCm / 200), 2) * lengthM * elementMultiplier
    : (baseCm / 100) * (heightCm / 100) * lengthM * elementMultiplier;
  const steelRatioKgM3 = concreteVolumeM3 > 0 ? totalBatchSteelWeight / concreteVolumeM3 : 0;

  // --- GENERAZIONE RIGHI PER IL COMPUTO METRICO ---
  const currentElementRows: GeneratedRebarRow[] = useMemo(() => {
    if (!structureType) return [];
    const rows: GeneratedRebarRow[] = [];
    const prefix = elementName ? elementName.trim() : (isCircular ? 'Pilastro Circolare' : 'Elemento C.A.');
    const elemTag = elementMultiplier > 1 ? `(N. ${elementMultiplier} elementi uguali)` : '';

    if (isCircular) {
      // 1. Ferri Longitudinali Radiali a Corona
      if (botBarsCount > 0) {
        rows.push({
          description: elementMultiplier > 1
            ? `${prefix} ${elemTag} - Ferri longitudinali radiali (${botBarsCount}Ø${botBarsDia} cad. × ${elementMultiplier} elem. = tot. ${elementMultiplier * botBarsCount} ferri, L=${botBarsLength.toFixed(2)}m)`
            : `${prefix} - Ferri longitudinali radiali (${botBarsCount}Ø${botBarsDia} L=${botBarsLength.toFixed(2)}m)`,
          multiplier: elementMultiplier * botBarsCount,
          length: botBarsLength,
          weight: botBarsUnitWeight,
          diameter: botBarsDia,
          category: 'ferri'
        });
      }

      // 2. Staffa a Spirale o Staffe Circolari Chiuse
      if (circularStirrupType === 'spiral') {
        rows.push({
          description: elementMultiplier > 1
            ? `${prefix} ${elemTag} - Armatura a Spirale Continua Ø${stirrupDia} p=${stirrupPitchCm}cm (Elica L=${totalSpiralLengthM.toFixed(2)}m cad. × ${elementMultiplier} elem. = tot. ${(totalSpiralLengthM * elementMultiplier).toFixed(2)}m, ~${effectiveStirrupsCount} spire/elem.)`
            : `${prefix} - Armatura a Spirale Continua Ø${stirrupDia} p=${stirrupPitchCm}cm (Elica continua L=${totalSpiralLengthM.toFixed(2)}m, ~${effectiveStirrupsCount} spire)`,
          multiplier: elementMultiplier,
          length: totalSpiralLengthM,
          weight: stirrupUnitWeight,
          diameter: stirrupDia,
          category: 'staffe'
        });
      } else {
        if (effectiveStirrupsCount > 0) {
          rows.push({
            description: elementMultiplier > 1
              ? `${prefix} ${elemTag} - Staffe Circolari Chiuse Ø${stirrupDia} p=${stirrupPitchCm}cm (${effectiveStirrupsCount} staffe cad. × ${elementMultiplier} elem. = tot. ${elementMultiplier * effectiveStirrupsCount} staffe, sviluppo 1 staffa = ${effectiveStirrupDevM.toFixed(2)}m)`
              : `${prefix} - Staffe Circolari Chiuse Ø${stirrupDia} p=${stirrupPitchCm}cm (N. ${effectiveStirrupsCount} cerchiature, sviluppo 1 staffa = ${effectiveStirrupDevM.toFixed(2)}m)`,
            multiplier: elementMultiplier * effectiveStirrupsCount,
            length: effectiveStirrupDevM,
            weight: stirrupUnitWeight,
            diameter: stirrupDia,
            category: 'staffe'
          });
        }
      }
      return rows;
    }

    if (separateDiameters) {
      // 1. Ferri Longitudinali Inferiori
      if (botBarsCount > 0) {
        rows.push({
          description: elementMultiplier > 1
            ? `${prefix} ${elemTag} - Ferri longitudinali inf. (${botBarsCount}Ø${botBarsDia} cad. × ${elementMultiplier} elem. = tot. ${elementMultiplier * botBarsCount} ferri, L=${botBarsLength.toFixed(2)}m)`
            : `${prefix} - Ferri longitudinali inf. (${botBarsCount}Ø${botBarsDia} L=${botBarsLength.toFixed(2)}m)`,
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
          description: elementMultiplier > 1
            ? `${prefix} ${elemTag} - Ferri longitudinali sup. (${topBarsCount}Ø${topBarsDia} cad. × ${elementMultiplier} elem. = tot. ${elementMultiplier * topBarsCount} ferri, L=${topBarsLength.toFixed(2)}m)`
            : `${prefix} - Ferri longitudinali sup. (${topBarsCount}Ø${topBarsDia} L=${topBarsLength.toFixed(2)}m)`,
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
          description: elementMultiplier > 1
            ? `${prefix} ${elemTag} - Ferri di parete / spina (${sideBarsCount}Ø${sideBarsDia} cad. × ${elementMultiplier} elem. = tot. ${elementMultiplier * sideBarsCount} ferri, L=${sideBarsLength.toFixed(2)}m)`
            : `${prefix} - Ferri di parete / spina (${sideBarsCount}Ø${sideBarsDia} L=${sideBarsLength.toFixed(2)}m)`,
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
          description: elementMultiplier > 1
            ? `${prefix} ${elemTag} - Ferri longitudinali (${botBarsCount}Ø${botBarsDia} + ${topBarsCount}Ø${topBarsDia}${enableSideBars ? ' + ' + sideBarsCount + 'Ø' + sideBarsDia : ''}) [${totalBars} ferri/elem. × ${elementMultiplier} elem. = tot. ${elementMultiplier * totalBars} ferri, L=${lengthM.toFixed(2)}m]`
            : `${prefix} - Ferri longitudinali (${botBarsCount}Ø${botBarsDia} + ${topBarsCount}Ø${topBarsDia}${enableSideBars ? ' + ' + sideBarsCount + 'Ø' + sideBarsDia : ''}) L=${lengthM.toFixed(2)}m`,
          multiplier: elementMultiplier * totalBars,
          length: lengthM,
          weight: parseFloat(weightedKgPerM.toFixed(3)),
          diameter: botBarsDia,
          category: 'ferri'
        });
      }
    }

    // 4. Rigo Staffe
    if (effectiveStirrupsCount > 0) {
      rows.push({
        description: elementMultiplier > 1
          ? `${prefix} ${elemTag} - Staffe Ø${stirrupDia} p=${stirrupPitchCm}cm (${effectiveStirrupsCount} staffe cad. × ${elementMultiplier} elem. = tot. ${elementMultiplier * effectiveStirrupsCount} staffe, sviluppo 1 staffa = ${effectiveStirrupDevM.toFixed(2)}m)`
          : `${prefix} - Staffe Ø${stirrupDia} p=${stirrupPitchCm}cm (N. ${effectiveStirrupsCount} staffe, sviluppo 1 staffa = ${effectiveStirrupDevM.toFixed(2)}m)`,
        multiplier: elementMultiplier * effectiveStirrupsCount,
        length: effectiveStirrupDevM,
        weight: stirrupUnitWeight,
        diameter: stirrupDia,
        category: 'staffe'
      });
    }

    return rows;
  }, [
    structureType, isCircular, circularStirrupType, totalSpiralLengthM,
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
    renderer.setSize(width, height, false);
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
    const handleResize = () => {
      if (!canvas || !threeStateRef.current) return;
      const container = canvas.parentElement;
      const rect = container ? container.getBoundingClientRect() : canvas.getBoundingClientRect();
      const w = Math.floor(rect.width || canvas.clientWidth || 600);
      const h = Math.floor(rect.height || canvas.clientHeight || 450);
      if (w > 0 && h > 0) {
        threeStateRef.current.camera.aspect = w / h;
        threeStateRef.current.camera.updateProjectionMatrix();
        threeStateRef.current.renderer.setSize(w, h, false);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    } else {
      resizeObserver.observe(canvas);
    }

    requestAnimationFrame(handleResize);
    [30, 100, 200, 400, 800].forEach(delay => setTimeout(handleResize, delay));

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
    const { spherical, target, updateCameraPosition } = threeStateRef.current;
    target.set(0, 0, 0);
    const L = Math.max(0.5, Math.min(12, lengthM));

    if (viewPreset === 'iso') {
      spherical.theta = Math.PI * 0.25;
      spherical.phi = isColumn ? Math.PI * 0.38 : Math.PI * 0.33;
      spherical.radius = isColumn ? Math.max(4.8, L * 1.35) : Math.max(4.8, L * 1.35);
    } else if (viewPreset === 'front') {
      spherical.theta = 0;
      spherical.phi = Math.PI / 2;
      spherical.radius = isColumn ? Math.max(4.2, L * 1.25) : 5.8;
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
        spherical.radius = 3.8;
      }
    } else if (viewPreset === 'top') {
      spherical.theta = 0;
      spherical.phi = 0.05;
      spherical.radius = isColumn ? 4.2 : 6.8;
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

    // Se nessuna tipologia è ancora selezionata, mostra la scena pulita
    if (!structureType) {
      return;
    }

    // 1. BLOCCO CALCESTRUZZO (Trasparente o Solido)
    if (xRayMode !== 'rebarOnly') {
      const concreteMat = new THREE.MeshPhysicalMaterial({
        color: 0x3d4a5c, // Grigio cemento armato strutturale profondo
        transparent: true,
        opacity: xRayMode === 'opaque' ? 0.98 : 0.36,
        roughness: 0.50,
        metalness: 0.06,
        clearcoat: 0.20,
        depthWrite: xRayMode === 'opaque'
      });

      const lineMat = new THREE.LineBasicMaterial({
        color: 0xa0aec0,
        transparent: true,
        opacity: 0.70
      });

      if (isCircular) {
        // Calcestruzzo Pilastro Circolare (Cilindro verticale lungo asse Y)
        const concreteGeo = new THREE.CylinderGeometry(b / 2, b / 2, L, 36);
        const concreteMesh = new THREE.Mesh(concreteGeo, concreteMat);
        concreteMesh.castShadow = true;
        concreteMesh.receiveShadow = true;
        rootGroup.add(concreteMesh);

        const edges = new THREE.EdgesGeometry(concreteGeo, 25);
        const wireframe = new THREE.LineSegments(edges, lineMat);
        rootGroup.add(wireframe);

        // Piastra di base circolare
        const footingGeo = new THREE.CylinderGeometry(b * 0.75, b * 0.75, 0.06, 36);
        const footingMat = new THREE.MeshStandardMaterial({
          color: 0x242e3d,
          roughness: 0.85
        });
        const footingMesh = new THREE.Mesh(footingGeo, footingMat);
        footingMesh.position.set(0, -L / 2 - 0.03, 0);
        footingMesh.receiveShadow = true;
        rootGroup.add(footingMesh);
      } else {
        const concreteGeo = isColumn 
          ? new THREE.BoxGeometry(b, L, h) 
          : new THREE.BoxGeometry(b, h, L);

        const concreteMesh = new THREE.Mesh(concreteGeo, concreteMat);
        concreteMesh.castShadow = true;
        concreteMesh.receiveShadow = true;
        rootGroup.add(concreteMesh);

        const edges = new THREE.EdgesGeometry(concreteGeo);
        const wireframe = new THREE.LineSegments(edges, lineMat);
        rootGroup.add(wireframe);

        if (isColumn) {
          const footingGeo = new THREE.BoxGeometry(b * 1.5, 0.06, h * 1.5);
          const footingMat = new THREE.MeshStandardMaterial({
            color: 0x242e3d,
            roughness: 0.85
          });
          const footingMesh = new THREE.Mesh(footingGeo, footingMat);
          footingMesh.position.set(0, -L / 2 - 0.03, 0);
          footingMesh.receiveShadow = true;
          rootGroup.add(footingMesh);
        }
      }
    }

    // Materiali Acciaio
    const rebarMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8, // Azzurro titanio / acciaio lucido per ferri longitudinali
      metalness: 0.85,
      roughness: 0.25
    });

    const stirrupMat = new THREE.MeshStandardMaterial({
      color: 0xf97316, // Arancione vivido cantieristico per staffe / spirale
      metalness: 0.75,
      roughness: 0.3
    });

    // Dimensioni esterne/interne della staffa e ferri
    const stirrupDiaM = (stirrupDia / 1000);
    const stirrupRadius = Math.max(0.003, stirrupDiaM / 2);

    if (isCircular) {
      // ==========================================
      // PILASTRO CIRCOLARE (CON SPIRALE O CERCHIATURE)
      // ==========================================
      const radiusCover = b / 2 - c;
      const stirrupCenterR = Math.max(0.025, radiusCover - stirrupRadius);
      const barRadius = Math.max(0.004, botBarsDia / 2000);
      const rebarCenterR = Math.max(0.02, stirrupCenterR - stirrupRadius - barRadius);

      // 1. FERRI LONGITUDINALI RADIALI LUNGO Y (RIGOROSAMENTE ALL'INTERNO DELLA SPIRALE/STAFFA)
      const numRadialBars = Math.max(3, botBarsCount);
      const len = Math.max(0.2, botBarsLength);
      const hookLen = barRadius * 7;
      const barGeo = new THREE.CylinderGeometry(barRadius, barRadius, len, 16);
      const hookGeo = new THREE.CylinderGeometry(barRadius, barRadius, hookLen, 12);
      const elbowGeo = new THREE.SphereGeometry(barRadius, 12, 12);

      for (let i = 0; i < numRadialBars; i++) {
        const angle = (i / numRadialBars) * Math.PI * 2;
        const x = rebarCenterR * Math.cos(angle);
        const z = rebarCenterR * Math.sin(angle);

        const barMesh = new THREE.Mesh(barGeo, rebarMat);
        barMesh.position.set(x, 0, z);
        barMesh.castShadow = true;
        rootGroup.add(barMesh);

        // Gancio di ripresa in testa piegato verso il centro
        const hookTop = new THREE.Mesh(hookGeo, rebarMat);
        hookTop.position.set(x - Math.cos(angle) * (hookLen / 2), len / 2, z - Math.sin(angle) * (hookLen / 2));
        hookTop.rotation.y = -angle;
        hookTop.rotation.z = Math.PI / 2;
        rootGroup.add(hookTop);

        const elbowTop = new THREE.Mesh(elbowGeo, rebarMat);
        elbowTop.position.set(x, len / 2, z);
        rootGroup.add(elbowTop);

        // Gancio al piede piegato verso il centro
        const hookBot = new THREE.Mesh(hookGeo, rebarMat);
        hookBot.position.set(x - Math.cos(angle) * (hookLen / 2), -len / 2, z - Math.sin(angle) * (hookLen / 2));
        hookBot.rotation.y = -angle;
        hookBot.rotation.z = Math.PI / 2;
        rootGroup.add(hookBot);

        const elbowBot = new THREE.Mesh(elbowGeo, rebarMat);
        elbowBot.position.set(x, -len / 2, z);
        rootGroup.add(elbowBot);
      }

      // 2. STAFFA A SPIRALE CONTINUA O ANELLI CIRCOLARI CHIUSI
      if (circularStirrupType === 'spiral') {
        // --- VERA ELICA CONTINUA 3D ---
        const yStart = -L / 2 + 0.05;
        const yEnd = L / 2 - 0.05;
        const spiralHeight = yEnd - yStart;
        const pitchM = Math.max(0.03, stirrupPitchCm / 100);
        const numActiveTurns = Math.max(3, spiralHeight / pitchM);

        const points: THREE.Vector3[] = [];
        const ptsPerTurn = 32;

        // A. Spire di chiusura piane al piede (1.5 spire)
        const bottomTurns = 1.5;
        const numBottomPts = Math.floor(bottomTurns * ptsPerTurn);
        for (let j = 0; j <= numBottomPts; j++) {
          const t = j / ptsPerTurn;
          const theta = t * Math.PI * 2;
          points.push(new THREE.Vector3(
            stirrupCenterR * Math.cos(theta),
            yStart,
            stirrupCenterR * Math.sin(theta)
          ));
        }

        // B. Elica continua ascendente lungo Y
        const numSpiralPts = Math.floor(numActiveTurns * ptsPerTurn);
        const startTheta = bottomTurns * Math.PI * 2;
        for (let j = 1; j <= numSpiralPts; j++) {
          const progress = j / numSpiralPts;
          const curY = yStart + progress * spiralHeight;
          const theta = startTheta + progress * numActiveTurns * Math.PI * 2;
          points.push(new THREE.Vector3(
            stirrupCenterR * Math.cos(theta),
            curY,
            stirrupCenterR * Math.sin(theta)
          ));
        }

        // C. Spire di chiusura piane in testa (1.5 spire)
        const topTurns = 1.5;
        const numTopPts = Math.floor(topTurns * ptsPerTurn);
        const endSpiralTheta = startTheta + numActiveTurns * Math.PI * 2;
        for (let j = 1; j <= numTopPts; j++) {
          const t = j / ptsPerTurn;
          const theta = endSpiralTheta + t * Math.PI * 2;
          points.push(new THREE.Vector3(
            stirrupCenterR * Math.cos(theta),
            yEnd,
            stirrupCenterR * Math.sin(theta)
          ));
        }

        const spiralCurve = new THREE.CatmullRomCurve3(points);
        const spiralGeo = new THREE.TubeGeometry(spiralCurve, points.length * 2, stirrupRadius, 10, false);
        const spiralMesh = new THREE.Mesh(spiralGeo, stirrupMat);
        spiralMesh.castShadow = true;
        rootGroup.add(spiralMesh);
      } else {
        // --- ANELLI CIRCOLARI CHIUSI CON GANCI SISMICI 135° ---
        const numStirrups = effectiveStirrupsCount;
        if (numStirrups > 0) {
          const pitchY = (stirrupPitchCm / 100);
          const maxSpanY = Math.max(0, L - 0.12);
          const desiredSpanY = Math.min(maxSpanY, (numStirrups - 1) * pitchY);
          const startY = -desiredSpanY / 2;

          const hookLen = Math.max(0.06, 10 * stirrupDiaM);
          const ringPts: THREE.Vector3[] = [];
          const offset = stirrupRadius * 0.75;
          
          // Gancio iniziale a 135° nel nucleo (Ramo A)
          ringPts.push(new THREE.Vector3(
            (stirrupCenterR - hookLen * 0.707) * Math.cos(0.25),
            -offset,
            (stirrupCenterR - hookLen * 0.707) * Math.sin(0.25)
          ));
          // Ingresso nell'anello circolare
          ringPts.push(new THREE.Vector3(
            stirrupCenterR * Math.cos(0.25),
            -offset * 0.5,
            stirrupCenterR * Math.sin(0.25)
          ));
          // Arco completo 360°
          for (let a = 0; a <= 32; a++) {
            const angle = 0.25 + (a / 32) * Math.PI * 2;
            const yProgress = -offset * 0.5 + (a / 32) * offset;
            ringPts.push(new THREE.Vector3(
              stirrupCenterR * Math.cos(angle),
              yProgress,
              stirrupCenterR * Math.sin(angle)
            ));
          }
          // Uscita e Gancio finale a 135° (Ramo B nel nucleo)
          ringPts.push(new THREE.Vector3(
            (stirrupCenterR - hookLen * 0.707) * Math.cos(0.25 + Math.PI * 2 - 0.25),
            offset,
            (stirrupCenterR - hookLen * 0.707) * Math.sin(0.25 + Math.PI * 2 - 0.25)
          ));

          const ringCurve = new THREE.CatmullRomCurve3(ringPts);
          const ringGeo = new THREE.TubeGeometry(ringCurve, 80, stirrupRadius, 8, false);

          for (let s = 0; s < numStirrups; s++) {
            const curY = startY + s * pitchY;
            if (curY > L / 2 - 0.04) break;

            const ringMesh = new THREE.Mesh(ringGeo, stirrupMat);
            ringMesh.position.set(0, curY, 0);
            ringMesh.rotation.y = (s * 0.45); // Alterna l'angolo dei ganci per norma antisismica
            ringMesh.castShadow = true;
            rootGroup.add(ringMesh);
          }
        }
      }
    } else if (isColumn) {
      // ==========================================
      // PILASTRO IN C.A. (ORIENTAMENTO VERTICALE)
      // ==========================================
      // 1. STAFFA: Posizionata all'ESTERNO (a filo del copriferro netto c)
      const stHalfBx = b / 2 - c;
      const stHalfHz = h / 2 - c;

      const stXLeft = -(stHalfBx - stirrupRadius);
      const stXRight = (stHalfBx - stirrupRadius);
      const stZBot = -(stHalfHz - stirrupRadius);
      const stZTop = (stHalfHz - stirrupRadius);

      // 2. FERRI LONGITUDINALI: Posizionati RIGOROSAMENTE ALL'INTERNO DELLA STAFFA
      // Alloggiano negli angoli interni della staffa (copriferro c + diametro staffa + raggio ferro)
      const topBarRadius = Math.max(0.004, topBarsDia / 2000);
      const botBarRadius = Math.max(0.004, botBarsDia / 2000);
      const sideBarRadius = Math.max(0.004, sideBarsDia / 2000);

      const barXLeftTop = -(stHalfBx - stirrupDiaM - topBarRadius);
      const barXRightTop = (stHalfBx - stirrupDiaM - topBarRadius);
      const barZTop = (stHalfHz - stirrupDiaM - topBarRadius);

      const barXLeftBot = -(stHalfBx - stirrupDiaM - botBarRadius);
      const barXRightBot = (stHalfBx - stirrupDiaM - botBarRadius);
      const barZBot = -(stHalfHz - stirrupDiaM - botBarRadius);

      const barXLeftSide = -(stHalfBx - stirrupDiaM - sideBarRadius);
      const barXRightSide = (stHalfBx - stirrupDiaM - sideBarRadius);

      // Funzione per inserire barra verticale lungo l'asse Y
      const addColumnBar = (x: number, z: number, diaMm: number, barLenM: number) => {
        const radius = Math.max(0.004, (diaMm / 2000));
        const len = Math.max(0.2, barLenM);
        const barGeo = new THREE.CylinderGeometry(radius, radius, len, 16);
        const barMesh = new THREE.Mesh(barGeo, rebarMat);
        barMesh.position.set(x, 0, z); // Eretto in verticale lungo asse Y all'interno della staffa!
        barMesh.castShadow = true;
        rootGroup.add(barMesh);

        // Ganci di ripresa sismica in testa (+Y) e al piede (-Y)
        const hookLen = radius * 7;
        const hookGeo = new THREE.CylinderGeometry(radius, radius, hookLen, 12);
        const elbowGeo = new THREE.SphereGeometry(radius, 12, 12);

        // Gancio in testa (verso l'interno)
        const hookTop = new THREE.Mesh(hookGeo, rebarMat);
        hookTop.rotation.z = Math.PI / 2;
        hookTop.position.set(x + (x > 0 ? -hookLen / 2 : hookLen / 2), len / 2, z);
        rootGroup.add(hookTop);

        const elbowTop = new THREE.Mesh(elbowGeo, rebarMat);
        elbowTop.position.set(x, len / 2, z);
        rootGroup.add(elbowTop);

        // Gancio al piede (ancoraggio plinto / fondazione)
        const hookBot = new THREE.Mesh(hookGeo, rebarMat);
        hookBot.rotation.z = Math.PI / 2;
        hookBot.position.set(x + (x > 0 ? hookLen / 2 : -hookLen / 2), -len / 2, z);
        rootGroup.add(hookBot);

        const elbowBot = new THREE.Mesh(elbowGeo, rebarMat);
        elbowBot.position.set(x, -len / 2, z);
        rootGroup.add(elbowBot);
      };

      // A. Ferri Faccia Posteriore (Z = barZTop, all'interno della staffa)
      if (topBarsCount > 0) {
        if (topBarsCount === 1) {
          addColumnBar(0, barZTop, topBarsDia, topBarsLength);
        } else {
          const stepX = (barXRightTop - barXLeftTop) / (topBarsCount - 1);
          for (let i = 0; i < topBarsCount; i++) {
            addColumnBar(barXLeftTop + i * stepX, barZTop, topBarsDia, topBarsLength);
          }
        }
      }

      // B. Ferri Faccia Anteriore (Z = barZBot, all'interno della staffa)
      if (botBarsCount > 0) {
        if (botBarsCount === 1) {
          addColumnBar(0, barZBot, botBarsDia, botBarsLength);
        } else {
          const stepX = (barXRightBot - barXLeftBot) / (botBarsCount - 1);
          for (let i = 0; i < botBarsCount; i++) {
            addColumnBar(barXLeftBot + i * stepX, barZBot, botBarsDia, botBarsLength);
          }
        }
      }

      // C. Ferri di Parete Pilastro (distribuiti lungo Z sui lati barXLeftSide e barXRightSide all'interno)
      if (enableSideBars && sideBarsCount > 0) {
        const pairs = Math.floor(sideBarsCount / 2);
        if (pairs > 0) {
          const stepZ = (barZTop - barZBot) / (pairs + 1);
          for (let p = 1; p <= pairs; p++) {
            const zPos = barZBot + p * stepZ;
            addColumnBar(barXLeftSide, zPos, sideBarsDia, sideBarsLength);
            addColumnBar(barXRightSide, zPos, sideBarsDia, sideBarsLength);
          }
        }
      }

      // Staffe Orizzontali (anelli chiusi sul perimetro ESTERNO dei ferri con DOPPIO gancio sismico 135° che avvolgono entrambi il ferro d'angolo)
      const numStirrups = effectiveStirrupsCount;
      if (numStirrups > 0) {
        const path = new THREE.CurvePath<THREE.Vector3>();
        
        // Raggio di curvatura del mandrino di piegatura (NTC / Eurocodice 2: R = 2.5 * diametro staffa)
        const bendRadius = Math.max(0.016, Math.min(0.035, stirrupDiaM * 2.5, (stXRight - stXLeft) * 0.2, (stZTop - stZBot) * 0.2));
        const hookLen = Math.max(0.07, 10 * stirrupDiaM);

        const xMin = stXLeft;
        const xMax = stXRight;
        const zMin = stZBot;
        const zMax = stZTop;
        const R = bendRadius;
        const dy = stirrupRadius * 1.05; // Sfalsamento assiale verticale per affiancamento realistico nello spazio

        // Coordinate centro del ferro d'angolo (spigolo superiore-sinistro)
        const xc = xMin + R;
        const zc = zMax - R;

        // Versore diagonale a 135° (uX, uZ) che punta verso l'interno del nucleo
        const uX = 0.7071;
        const uZ = -0.7071;

        // 1. Gancio iniziale 135° (Ramo A, nel nucleo a -dy)
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(xc + hookLen * uX, -dy, zc + hookLen * uZ),
          new THREE.Vector3(xc + R * 0.7071 * uX, -dy, zc + R * 0.7071 * uZ)
        ));

        // 2. Curva 135° del Ramo A che esce dal nucleo verso il lato sinistro del ferro d'angolo
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xc + R * 0.7071 * uX, -dy, zc + R * 0.7071 * uZ),
          new THREE.Vector3(xMin + R * 0.2, -dy * 0.8, zMax - R * 0.8),
          new THREE.Vector3(xMin, -dy * 0.6, zMax - R)
        ));

        // 3. Curva 90° del Ramo A che avvolge lo spigolo dal lato sinistro a quello superiore
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xMin, -dy * 0.6, zMax - R),
          new THREE.Vector3(xMin, -dy * 0.4, zMax),
          new THREE.Vector3(xMin + R, -dy * 0.2, zMax)
        ));

        // 4. Tratto Superiore (Z = zMax)
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(xMin + R, -dy * 0.2, zMax),
          new THREE.Vector3(xMax - R, 0, zMax)
        ));

        // 5. Curva 90° Spigolo Superiore-Destro
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xMax - R, 0, zMax),
          new THREE.Vector3(xMax, 0, zMax),
          new THREE.Vector3(xMax, 0, zMax - R)
        ));

        // 6. Tratto Destro (X = xMax)
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(xMax, 0, zMax - R),
          new THREE.Vector3(xMax, 0, zMin + R)
        ));

        // 7. Curva 90° Spigolo Inferiore-Destro
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xMax, 0, zMin + R),
          new THREE.Vector3(xMax, 0, zMin),
          new THREE.Vector3(xMax - R, 0, zMin)
        ));

        // 8. Tratto Inferiore (Z = zMin)
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(xMax - R, 0, zMin),
          new THREE.Vector3(xMin + R, 0, zMin)
        ));

        // 9. Curva 90° Spigolo Inferiore-Sinistro
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xMin + R, 0, zMin),
          new THREE.Vector3(xMin, 0, zMin),
          new THREE.Vector3(xMin, 0, zMin + R)
        ));

        // 10. Tratto Sinistro (X = xMin) che sale verso lo spigolo superiore-sinistro
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(xMin, 0, zMin + R),
          new THREE.Vector3(xMin, dy * 0.2, zMax - R)
        ));

        // 11. Curva 90° del Ramo B che avvolge il ferro d'angolo dal lato sinistro verso il lato superiore (affiancato a Ramo A a +dy)
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xMin, dy * 0.2, zMax - R),
          new THREE.Vector3(xMin, dy * 0.4, zMax),
          new THREE.Vector3(xMin + R, dy * 0.6, zMax)
        ));

        // 12. Curva 135° del Ramo B che si ripiega verso l'interno del nucleo affiancata al ferro longitudinale
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xMin + R, dy * 0.6, zMax),
          new THREE.Vector3(xMin + R + R * 0.2, dy * 0.8, zMax - R * 0.2),
          new THREE.Vector3(xc + R * 0.7071 * uX, dy, zc + R * 0.7071 * uZ)
        ));

        // 13. Gancio finale 135° (Ramo B affiancato al Ramo A nel nucleo, parallelo a 135°)
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(xc + R * 0.7071 * uX, dy, zc + R * 0.7071 * uZ),
          new THREE.Vector3(xc + hookLen * uX, dy, zc + hookLen * uZ)
        ));

        const stirrupGeo = new THREE.TubeGeometry(path, 128, stirrupRadius, 12, false);

        // Distribuzione verticale dal basso all'alto lungo Y perfettamente centrata
        const pitchY = (stirrupPitchCm / 100);
        const maxSpanY = Math.max(0, L - 0.12);
        const desiredSpanY = Math.min(maxSpanY, (numStirrups - 1) * pitchY);
        const startY = -desiredSpanY / 2;

        for (let s = 0; s < numStirrups; s++) {
          const curY = startY + s * pitchY;
          if (curY > L / 2 - 0.04) break;

          const stirrupMesh = new THREE.Mesh(stirrupGeo, stirrupMat);
          stirrupMesh.position.set(0, curY, 0); // Posizionata all'esterno dei ferri longitudinali
          stirrupMesh.castShadow = true;
          rootGroup.add(stirrupMesh);
        }
      }
    } else {
      // ==========================================
      // TRAVE / CORDOLO / SOLETTA (ORIZZONTALE LUNGO Z)
      // ==========================================
      // 1. STAFFA: Posizionata all'ESTERNO (a filo del copriferro netto c)
      const stHalfBx = b / 2 - c;
      const stHalfHy = h / 2 - c;

      const stXLeft = -(stHalfBx - stirrupRadius);
      const stXRight = (stHalfBx - stirrupRadius);
      const stYBot = -(stHalfHy - stirrupRadius);
      const stYTop = (stHalfHy - stirrupRadius);

      // 2. FERRI LONGITUDINALI: Posizionati RIGOROSAMENTE ALL'INTERNO DELLA STAFFA
      const topBarRadius = Math.max(0.004, topBarsDia / 2000);
      const botBarRadius = Math.max(0.004, botBarsDia / 2000);
      const sideBarRadius = Math.max(0.004, sideBarsDia / 2000);

      const barXLeftTop = -(stHalfBx - stirrupDiaM - topBarRadius);
      const barXRightTop = (stHalfBx - stirrupDiaM - topBarRadius);
      const barYTop = (stHalfHy - stirrupDiaM - topBarRadius);

      const barXLeftBot = -(stHalfBx - stirrupDiaM - botBarRadius);
      const barXRightBot = (stHalfBx - stirrupDiaM - botBarRadius);
      const barYBot = -(stHalfHy - stirrupDiaM - botBarRadius);

      const barXLeftSide = -(stHalfBx - stirrupDiaM - sideBarRadius);
      const barXRightSide = (stHalfBx - stirrupDiaM - sideBarRadius);

      // FERRI LONGITUDINALI (Tondini lungo Z all'interno della staffa)
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
        const elbowGeo = new THREE.SphereGeometry(radius, 12, 12);

        const hookZ1 = new THREE.Mesh(hookGeo, rebarMat);
        hookZ1.position.set(x, y + (y > 0 ? -hookLen / 2 : hookLen / 2), len / 2);
        rootGroup.add(hookZ1);

        const elbowZ1 = new THREE.Mesh(elbowGeo, rebarMat);
        elbowZ1.position.set(x, y, len / 2);
        rootGroup.add(elbowZ1);

        const hookZ2 = new THREE.Mesh(hookGeo, rebarMat);
        hookZ2.position.set(x, y + (y > 0 ? -hookLen / 2 : hookLen / 2), -len / 2);
        rootGroup.add(hookZ2);

        const elbowZ2 = new THREE.Mesh(elbowGeo, rebarMat);
        elbowZ2.position.set(x, y, -len / 2);
        rootGroup.add(elbowZ2);
      };

      // A. Ferri Superiori (all'interno della staffa in alto)
      if (topBarsCount > 0) {
        if (topBarsCount === 1) {
          addLongitudinalBar(0, barYTop, topBarsDia, topBarsLength);
        } else {
          const stepX = (barXRightTop - barXLeftTop) / (topBarsCount - 1);
          for (let i = 0; i < topBarsCount; i++) {
            addLongitudinalBar(barXLeftTop + i * stepX, barYTop, topBarsDia, topBarsLength);
          }
        }
      }

      // B. Ferri Inferiori (all'interno della staffa in basso)
      if (botBarsCount > 0) {
        if (botBarsCount === 1) {
          addLongitudinalBar(0, barYBot, botBarsDia, botBarsLength);
        } else {
          const stepX = (barXRightBot - barXLeftBot) / (botBarsCount - 1);
          for (let i = 0; i < botBarsCount; i++) {
            addLongitudinalBar(barXLeftBot + i * stepX, barYBot, botBarsDia, botBarsLength);
          }
        }
      }

      // C. Ferri di Parete (all'interno della staffa sui lati)
      if (enableSideBars && sideBarsCount > 0) {
        const pairs = Math.floor(sideBarsCount / 2);
        if (pairs > 0) {
          const stepY = (barYTop - barYBot) / (pairs + 1);
          for (let p = 1; p <= pairs; p++) {
            const yPos = barYBot + p * stepY;
            addLongitudinalBar(barXLeftSide, yPos, sideBarsDia, sideBarsLength);
            addLongitudinalBar(barXRightSide, yPos, sideBarsDia, sideBarsLength);
          }
        }
      }

      // 3. STAFFE LUNGO LA LUNGHEZZA Z (PERIMETRO ESTERNO CON DOPPIO GANCIO SISMICO 135° CHE AVVOLGE IL FERRO D'ANGOLO)
      const numStirrups = effectiveStirrupsCount;
      if (numStirrups > 0) {
        const path = new THREE.CurvePath<THREE.Vector3>();

        // Raggio di curvatura del mandrino di piegatura
        const bendRadius = Math.max(0.014, Math.min(0.035, stirrupDiaM * 2.5, (stXRight - stXLeft) * 0.2, (stYTop - stYBot) * 0.2));
        const hookLen = Math.max(0.07, 10 * stirrupDiaM);

        const xMin = stXLeft;
        const xMax = stXRight;
        const yMin = stYBot;
        const yMax = stYTop;
        const R = bendRadius;
        const dz = stirrupRadius * 1.05; // Sfalsamento assiale Z per affiancamento realistico nello spazio

        // Centro del ferro d'angolo (spigolo superiore-sinistro)
        const xc = xMin + R;
        const yc = yMax - R;

        // Versore diagonale a 135° (uX, uY) che punta verso l'interno del nucleo
        const uX = 0.7071;
        const uY = -0.7071;

        // 1. Gancio iniziale 135° (Ramo A, nel nucleo a -dz)
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(xc + hookLen * uX, yc + hookLen * uY, -dz),
          new THREE.Vector3(xc + R * 0.7071 * uX, yc + R * 0.7071 * uY, -dz)
        ));

        // 2. Curva 135° del Ramo A che esce dal nucleo verso il lato sinistro del ferro d'angolo
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xc + R * 0.7071 * uX, yc + R * 0.7071 * uY, -dz),
          new THREE.Vector3(xMin + R * 0.2, yMax - R * 0.8, -dz * 0.8),
          new THREE.Vector3(xMin, yMax - R, -dz * 0.6)
        ));

        // 3. Curva 90° del Ramo A che avvolge lo spigolo dal lato sinistro a quello superiore
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xMin, yMax - R, -dz * 0.6),
          new THREE.Vector3(xMin, yMax, -dz * 0.4),
          new THREE.Vector3(xMin + R, yMax, -dz * 0.2)
        ));

        // 4. Tratto Superiore (Y = yMax)
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(xMin + R, yMax, -dz * 0.2),
          new THREE.Vector3(xMax - R, yMax, 0)
        ));

        // 5. Curva 90° Spigolo Superiore-Destro (Arco continuo)
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xMax - R, yMax, 0),
          new THREE.Vector3(xMax, yMax, 0),
          new THREE.Vector3(xMax, yMax - R, 0)
        ));

        // 6. Tratto Destro (X = xMax)
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(xMax, yMax - R, 0),
          new THREE.Vector3(xMax, yMin + R, 0)
        ));

        // 7. Curva 90° Spigolo Inferiore-Destro
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xMax, yMin + R, 0),
          new THREE.Vector3(xMax, yMin, 0),
          new THREE.Vector3(xMax - R, yMin, 0)
        ));

        // 8. Tratto Inferiore (Y = yMin)
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(xMax - R, yMin, 0),
          new THREE.Vector3(xMin + R, yMin, 0)
        ));

        // 9. Curva 90° Spigolo Inferiore-Sinistro
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xMin + R, yMin, 0),
          new THREE.Vector3(xMin, yMin, 0),
          new THREE.Vector3(xMin, yMin + R, 0)
        ));

        // 10. Tratto Sinistro (X = xMin) che sale verso lo spigolo superiore-sinistro
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(xMin, yMin + R, 0),
          new THREE.Vector3(xMin, yMax - R, dz * 0.2)
        ));

        // 11. Curva 90° del Ramo B che avvolge il ferro d'angolo dal lato sinistro verso il lato superiore (affiancato a Ramo A a +dz)
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xMin, yMax - R, dz * 0.2),
          new THREE.Vector3(xMin, yMax, dz * 0.4),
          new THREE.Vector3(xMin + R, yMax, dz * 0.6)
        ));

        // 12. Curva 135° del Ramo B che si ripiega verso l'interno del nucleo affiancata al ferro longitudinale
        path.add(new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(xMin + R, yMax, dz * 0.6),
          new THREE.Vector3(xMin + R + R * 0.2, yMax - R * 0.2, dz * 0.8),
          new THREE.Vector3(xc + R * 0.7071 * uX, yc + R * 0.7071 * uY, dz)
        ));

        // 13. Gancio finale 135° (Ramo B affiancato al Ramo A nel nucleo, parallelo a 135°)
        path.add(new THREE.LineCurve3(
          new THREE.Vector3(xc + R * 0.7071 * uX, yc + R * 0.7071 * uY, dz),
          new THREE.Vector3(xc + hookLen * uX, yc + hookLen * uY, dz)
        ));

        const stirrupGeo = new THREE.TubeGeometry(path, 128, stirrupRadius, 12, false);

        // Posizionamento lungo Z perfettamente centrato all'esterno dei ferri
        const pitchZ = (stirrupPitchCm / 100);
        const maxSpanZ = Math.max(0, L - 0.10);
        const desiredSpanZ = Math.min(maxSpanZ, (numStirrups - 1) * pitchZ);
        const startZ = -desiredSpanZ / 2;

        for (let s = 0; s < numStirrups; s++) {
          const curZ = startZ + s * pitchZ;
          if (curZ > L / 2 - 0.03) break;

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
                  onClick={handleResetCenter}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex items-center gap-1.5 border border-slate-700/60"
                  title="Centra perfettamente l'elemento 3D nella vista"
                >
                  <Compass className="w-3.5 h-3.5 text-orange-400" />
                  Centra
                </button>
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

            {/* CANVAS 3D INTERATTIVO - PERFETTAMENTE CENTRATO */}
            <div className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing overflow-hidden min-h-[300px]">
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
              
              {/* Stato di Benvenuto quando nessuna tipologia è ancora selezionata */}
              {!structureType && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm text-center select-none pointer-events-auto">
                  <div className="bg-gradient-to-br from-orange-500/20 to-amber-600/10 p-5 rounded-3xl border border-orange-500/30 shadow-2xl mb-4 text-orange-400 max-w-md">
                    <Grid3X3 className="w-12 h-12 mx-auto mb-3 animate-pulse text-orange-400" />
                    <h3 className="text-base font-black uppercase tracking-wider text-white mb-1">
                      Modellatore 3D Armature
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Scegli una tipologia costruttiva per visualizzare la modellazione parametrica 3D in tempo reale, la gabbia d'armatura e calcolare la distinta dei ferri.
                    </p>
                  </div>
                  
                  {/* Pulsanti Rapidi di Selezione Tipologia */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-lg w-full">
                    {(Object.keys(PRESETS) as StructureCategory[]).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleSelectPreset(cat)}
                        className="p-3 rounded-2xl bg-slate-900/90 hover:bg-orange-500/20 border border-slate-700/80 hover:border-orange-500 text-left transition-all group shadow-lg"
                      >
                        <div className="text-xs font-black text-white group-hover:text-orange-400 transition-colors">
                          {PRESETS[cat].label}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          {cat === 'circular_column' ? 'Spirale o cerchiature' : cat === 'beam' ? 'Travi e architravi' : 'Gabbia parametrica'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Badge Quote 3D sovrimpresse */}
              {structureType && (
                <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between pointer-events-none gap-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 shadow-lg">
                      <span className="text-orange-400 font-bold">{isCircular ? 'DIAMETRO Ø:' : 'SEZIONE:'}</span> {isCircular ? `${baseCm} cm` : `${baseCm}×${heightCm} cm`}
                    </div>
                    <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 shadow-lg">
                      <span className="text-cyan-400 font-bold">{isColumn ? 'ALTEZZA H:' : 'LUNGH:'}</span> {lengthM.toFixed(2)} m
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 shadow-lg">
                      <span className="text-emerald-400 font-bold">{isCircular && circularStirrupType === 'spiral' ? 'SPIRALE:' : 'STAFFE:'}</span>{' '}
                      {isCircular && circularStirrupType === 'spiral'
                        ? `Elica Ø${stirrupDia} p=${stirrupPitchCm}cm (${effectiveStirrupsCount} spire)`
                        : `${effectiveStirrupsCount} staffe @ ${stirrupPitchCm}cm`}
                    </div>
                    <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 shadow-lg">
                      <span className="text-amber-400 font-bold">ASSETTO:</span> {isCircular ? '🔄 Pilastro Circolare' : isColumn ? '↕ Verticale (Pilastro)' : '↔ Orizzontale (Trave)'}
                    </div>
                  </div>
                </div>
              )}

              {/* Suggerimento interazione mouse */}
              {structureType && (
                <div className="absolute top-14 right-3 z-10 text-[10px] text-slate-500 font-medium hidden sm:block pointer-events-none bg-slate-900/70 px-2 py-1 rounded-md border border-slate-800/60">
                  Ruota: Trascina • Zoom: Rotellina
                </div>
              )}
            </div>

            {/* PANNELLO METRICHE & INCIDENZA SOTTO IL 3D */}
            <div className="p-4 bg-slate-900/95 border-t border-slate-800 flex-shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Ferri Longitudinali</div>
                <div className="text-lg font-mono font-black text-white mt-0.5 tabular-nums">
                  {(singleTotalLongBarsWeight * elementMultiplier).toFixed(2)} <span className="text-xs font-normal text-slate-400">kg</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {isCircular ? `${botBarsCount} barre radiali` : `${topBarsCount + botBarsCount + (enableSideBars ? sideBarsCount : 0)} barre totali`}
                </div>
              </div>

              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">
                  {isCircular && circularStirrupType === 'spiral' ? 'Spirale Continua' : 'Staffe Totali'}
                </div>
                <div className="text-lg font-mono font-black text-white mt-0.5 tabular-nums">
                  {(singleStirrupsWeight * elementMultiplier).toFixed(2)} <span className="text-xs font-normal text-slate-400">kg</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {isCircular && circularStirrupType === 'spiral'
                    ? `L=${totalSpiralLengthM.toFixed(2)}m Ø${stirrupDia}`
                    : `${effectiveStirrupsCount * elementMultiplier} staffe Ø${stirrupDia}`}
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
                      type="button"
                      onClick={() => handleSelectPreset(cat)}
                      className={`p-2 rounded-xl text-left border text-xs font-bold transition-all ${
                        structureType === cat
                          ? 'bg-orange-500/20 border-orange-500 text-orange-300 ring-1 ring-orange-500/50 shadow-md shadow-orange-500/10'
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
                      placeholder={isCircular ? 'Pilastro Circolare PC1' : 'Es: Trave T1, Pilastro P1...'}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wide block mb-1">
                      Pezzi Uguali
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={multiplierInput}
                      onChange={(e) => handleMultiplierChange(e.target.value)}
                      onBlur={handleMultiplierBlur}
                      placeholder="1"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-center text-orange-400 outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {isCircular ? (
                  /* Form Dimensioni Pilastro Circolare */
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-700/50">
                    <div>
                      <label className="text-[10px] font-bold text-orange-400 uppercase block mb-1">Diametro D (cm)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={baseCmInput}
                        onChange={(e) => handleBaseChange(e.target.value)}
                        onBlur={handleBaseBlur}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-orange-300 outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        Altezza H (m)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={lengthMInput}
                        onChange={(e) => handleLengthChange(e.target.value)}
                        onBlur={handleLengthBlur}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Copriferro (cm)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={coverCmInput}
                        onChange={(e) => handleCoverChange(e.target.value)}
                        onBlur={handleCoverBlur}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                ) : (
                  /* Form Dimensioni Elementi Rettangolari */
                  <div className="grid grid-cols-4 gap-2 pt-1 border-t border-slate-700/50">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Base (cm)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={baseCmInput}
                        onChange={(e) => handleBaseChange(e.target.value)}
                        onBlur={handleBaseBlur}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        {isColumn ? 'Profondità (cm)' : 'Altezza (cm)'}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={heightCmInput}
                        onChange={(e) => handleHeightChange(e.target.value)}
                        onBlur={handleHeightBlur}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                        {isColumn ? 'H Pilastro (m)' : 'Lunghezza (m)'}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={lengthMInput}
                        onChange={(e) => handleLengthChange(e.target.value)}
                        onBlur={handleLengthBlur}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Copriferro (cm)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={coverCmInput}
                        onChange={(e) => handleCoverChange(e.target.value)}
                        onBlur={handleCoverBlur}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-center text-white outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 3. FERRI LONGITUDINALI */}
              <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-cyan-400 tracking-wider">
                    {isCircular ? '2. Ferri Longitudinali Radiali (Corona)' : '2. Ferri Longitudinali (Tondini)'}
                  </span>
                  <button
                    onClick={handleApplyAnchorageLengths}
                    className="text-[10px] font-bold text-cyan-300 hover:text-white bg-cyan-950/60 hover:bg-cyan-900/80 px-2 py-0.5 rounded-md border border-cyan-500/30 transition-colors"
                    title="Calcola lunghezza con ancoraggi sismici 40Ø"
                  >
                    + Ancoraggi 40Ø
                  </button>
                </div>

                {isCircular ? (
                  /* Barre radiali a corona per pilastro circolare */
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">Barre Radiali a Corona</span>
                      <span className="text-[10px] text-slate-400 font-mono">Disposte radialmente all'interno della staffa</span>
                    </div>

                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">N. Barre Radiali</span>
                        <div className="flex items-center bg-slate-800 border border-slate-600 rounded overflow-hidden focus-within:border-cyan-400">
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.max(1, botBarsCount - 1);
                              setBotBarsCount(next);
                              setBotBarsCountInput(next.toString());
                            }}
                            className="px-1.5 py-1 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors font-bold text-xs"
                            title="Riduci di 1 ferro"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={botBarsCountInput}
                            onChange={(e) => handleBotBarsCountChange(e.target.value)}
                            onBlur={handleBotBarsCountBlur}
                            placeholder="8"
                            className="w-full bg-transparent px-1 py-1 text-xs font-mono font-bold text-center text-white outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = botBarsCount + 1;
                              setBotBarsCount(next);
                              setBotBarsCountInput(next.toString());
                            }}
                            className="px-1.5 py-1 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors font-bold text-xs"
                            title="Aumenta di 1 ferro"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="col-span-4">
                        <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Diametro Ø</span>
                        <select
                          value={botBarsDia}
                          onChange={(e) => setBotBarsDia(parseInt(e.target.value, 10))}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs font-mono font-bold text-cyan-300"
                        >
                          {REBAR_WEIGHTS.map(w => (
                            <option key={w.diameter} value={w.diameter}>Ø{w.diameter}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4">
                        <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">Lung. Barra (m)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={botBarsLengthInput}
                          onChange={(e) => handleBotBarsLengthChange(e.target.value)}
                          onBlur={handleBotBarsLengthBlur}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs font-mono font-bold text-center text-white outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>

                    {/* Bottoni veloci per numero barre radiali standard - senza simbolo Ø per evitare confusione con lo zero */}
                    <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-800">
                      <span className="text-[9px] font-bold text-slate-500 uppercase shrink-0">N. Rapido:</span>
                      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
                        {[4, 6, 8, 10, 12, 14, 16].map(nBars => (
                          <button
                            key={nBars}
                            type="button"
                            onClick={() => {
                              setBotBarsCount(nBars);
                              setBotBarsCountInput(nBars.toString());
                            }}
                            className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold transition-all ${
                              botBarsCount === nBars
                                ? 'bg-cyan-500 text-slate-950 shadow-sm ring-1 ring-cyan-400'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                            }`}
                            title={`${nBars} ferri radiali`}
                          >
                            {nBars}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Form Standard per Travi e Pilastri Rettangolari */
                  <>
                    {/* Ferri Inferiori */}
                    <div className="grid grid-cols-12 gap-2 items-center bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60">
                      <div className="col-span-4 text-xs font-bold text-slate-300">
                        Ferri Inferiori
                      </div>
                      <div className="col-span-2">
                        <span className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">N.</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={botBarsCountInput}
                          onChange={(e) => handleBotBarsCountChange(e.target.value)}
                          onBlur={handleBotBarsCountBlur}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-xs font-mono font-bold text-center text-white outline-none focus:border-cyan-400"
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
                          type="text"
                          inputMode="decimal"
                          value={botBarsLengthInput}
                          onChange={(e) => handleBotBarsLengthChange(e.target.value)}
                          onBlur={handleBotBarsLengthBlur}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-xs font-mono font-bold text-center text-white outline-none focus:border-cyan-400"
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
                          type="text"
                          inputMode="numeric"
                          value={topBarsCountInput}
                          onChange={(e) => handleTopBarsCountChange(e.target.value)}
                          onBlur={handleTopBarsCountBlur}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-xs font-mono font-bold text-center text-white outline-none focus:border-cyan-400"
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
                          type="text"
                          inputMode="decimal"
                          value={topBarsLengthInput}
                          onChange={(e) => handleTopBarsLengthChange(e.target.value)}
                          onBlur={handleTopBarsLengthBlur}
                          className="w-full bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-xs font-mono font-bold text-center text-white outline-none focus:border-cyan-400"
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
                              type="text"
                              inputMode="numeric"
                              value={sideBarsCountInput}
                              onChange={(e) => handleSideBarsCountChange(e.target.value)}
                              onBlur={handleSideBarsCountBlur}
                              className="w-full bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-xs font-mono font-bold text-center text-white outline-none focus:border-cyan-400"
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
                              type="text"
                              inputMode="decimal"
                              value={sideBarsLengthInput}
                              onChange={(e) => handleSideBarsLengthChange(e.target.value)}
                              onBlur={handleSideBarsLengthBlur}
                              className="w-full bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-xs font-mono font-bold text-center text-white outline-none focus:border-cyan-400"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 4. STAFFE (STIRRUPS / SPIRALE) */}
              <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-orange-400 tracking-wider">
                    {isCircular ? '3. Armatura Trasversale (Spirale / Cerchiature)' : '3. Staffe Sagomate & Passo'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Ø{stirrupDia} • {stirrupUnitWeight.toFixed(3)} kg/m
                  </span>
                </div>

                {/* Selettore Spirale vs Cerchiature per pilastro circolare */}
                {isCircular && (
                  <div className="grid grid-cols-2 gap-2 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setCircularStirrupType('spiral')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        circularStirrupType === 'spiral'
                          ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white hover:bg-slate-900'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Spirale Continua (Elica 3D)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCircularStirrupType('rings')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        circularStirrupType === 'rings'
                          ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white hover:bg-slate-900'
                      }`}
                    >
                      <CircleDot className="w-3.5 h-3.5" />
                      <span>Anelli Circolari Chiusi</span>
                    </button>
                  </div>
                )}

                {/* Preset Rapidi Passo Staffe */}
                <div className="flex items-center justify-between gap-1.5 bg-slate-900/60 p-2 rounded-xl border border-slate-700/50">
                  <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0">Preset Passo:</span>
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                    {[5, 7.5, 10, 12.5, 15, 20, 25].map(pVal => (
                      <button
                        key={pVal}
                        type="button"
                        onClick={() => handleSetDirectPitch(pVal)}
                        className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                          stirrupPitchCm === pVal
                            ? 'bg-orange-500 text-white shadow-sm ring-1 ring-orange-400'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        {pVal}cm
                      </button>
                    ))}
                  </div>
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
                          type="button"
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 flex items-center justify-between">
                      <span>{isCircular && circularStirrupType === 'spiral' ? 'Passo Elica (cm)' : 'Passo (cm)'}</span>
                      <span className="text-[9px] text-orange-400 font-normal">interasse</span>
                    </label>
                    <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl overflow-hidden focus-within:border-orange-500 transition-colors">
                      <button
                        type="button"
                        onClick={() => handleStepPitch(-2.5)}
                        className="px-2 py-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors font-bold text-xs"
                        title="Riduci passo di 2.5 cm"
                      >
                        -
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pitchInput}
                        onChange={(e) => handlePitchChange(e.target.value)}
                        onBlur={handlePitchBlur}
                        placeholder="15"
                        className="w-full bg-transparent px-1 py-2 text-sm font-mono font-bold text-center text-orange-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleStepPitch(2.5)}
                        className="px-2 py-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors font-bold text-xs"
                        title="Aumenta passo di 2.5 cm"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 flex items-center justify-between">
                      <span>{isCircular && circularStirrupType === 'spiral' ? 'N. Spire' : 'N. Staffe'}</span>
                      <span className="text-[9px] text-cyan-400 font-normal">{isCircular && circularStirrupType === 'spiral' ? 'giri totali' : 'totale barre'}</span>
                    </label>
                    <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl overflow-hidden focus-within:border-orange-500 transition-colors">
                      <button
                        type="button"
                        onClick={() => handleStepCount(-1)}
                        className="px-2 py-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors font-bold text-xs"
                        title="Riduci conteggio"
                      >
                        -
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={countInput}
                        onChange={(e) => handleCountChange(e.target.value)}
                        onBlur={handleCountBlur}
                        placeholder="21"
                        className="w-full bg-transparent px-1 py-2 text-sm font-mono font-bold text-center text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleStepCount(1)}
                        className="px-2 py-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors font-bold text-xs"
                        title="Aumenta conteggio"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sviluppo 1 staffa / Sviluppo Spirale Continua */}
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-700/60 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-200">
                      {isCircular && circularStirrupType === 'spiral'
                        ? 'Sviluppo Totale Spirale Continua (Elica + Chiusure)'
                        : isCircular
                        ? 'Sviluppo 1 Staffa Cerchiata (con sovrapposizione)'
                        : 'Sviluppo di 1 Staffa (con ganci sismici 135°)'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                      {isCircular && circularStirrupType === 'spiral'
                        ? `L = ~${effectiveStirrupsCount} spire × ${autoStirrupDevelopmentM.toFixed(3)}m/spira + ancoraggi = ${totalSpiralLengthM.toFixed(2)} m`
                        : isCircular
                        ? `π × (${baseCm} - 2×${coverCm}) + 2×(10Ø) = ${autoStirrupDevelopmentM.toFixed(2)} m`
                        : `2×(${baseCm}-2×${coverCm}) + 2×(${heightCm}-2×${coverCm}) + 2×(10Ø) = ${autoStirrupDevelopmentM.toFixed(2)} m`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={isCircular && circularStirrupType === 'spiral' ? totalSpiralLengthM : effectiveStirrupDevM}
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
