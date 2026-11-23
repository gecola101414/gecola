import { PlanToken, QuoteUnit } from './pdfPlanExtractor';

export interface PlanLayer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
}

export interface PenStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  isHighlighter?: boolean;
  layerId?: string;
}

export interface PlanTextNote {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  vertical?: boolean;
  bgOpaque?: boolean;
  isReminder?: boolean;
  layerId?: string;
}

export interface MeasuredPolygon {
  id: string;
  points: Array<{ x: number; y: number }>;
  centroid: { x: number; y: number };
  label: string;
  areaM2: number;
  perimM: number;
  color: string;
  layerId?: string;
}

export interface MeasuredRulerLine {
  id: string;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  meters: number;
  label?: string;
  layerId?: string;
  isLaser?: boolean;
}

export interface SavedPlanSheet {
  id: string;
  name: string;
  numPages: number;
  currentPage: number;
  quoteUnit: QuoteUnit;
  exportUnit: QuoteUnit;
  scaleDenominator: number;
  customMetersPerPt: number | null;
  defaultHeightM: number;
  layers: PlanLayer[];
  activeLayerId: string;
  measuredPolygonsByPage: Record<number, MeasuredPolygon[]>;
  measuredLinesByPage: Record<number, MeasuredRulerLine[]>;
  penStrokesByPage: Record<number, PenStroke[]>;
  textNotesByPage: Record<number, PlanTextNote[]>;
  customTokensByPage?: Record<number, PlanToken[]>;
  pdfBase64?: string;
  fileSizeBytes?: number;
  updatedAt: string;
}

export const DEFAULT_LAYER_IDS = {
  MEASURES: 'layer_misure',
  QUOTES: 'layer_quote',
  NOTES: 'layer_appunti',
  SITE: 'layer_cantiere',
} as const;

export function createDefaultPlanLayers(): PlanLayer[] {
  return [
    {
      id: DEFAULT_LAYER_IDS.MEASURES,
      name: 'Misure e Aree',
      color: '#059669',
      visible: true,
      locked: false,
    },
    {
      id: DEFAULT_LAYER_IDS.QUOTES,
      name: 'Quote & Misure Pulite',
      color: '#f59e0b',
      visible: true,
      locked: false,
    },
    {
      id: DEFAULT_LAYER_IDS.NOTES,
      name: 'Appunti & Promemoria',
      color: '#2563eb',
      visible: true,
      locked: false,
    },
    {
      id: DEFAULT_LAYER_IDS.SITE,
      name: 'Verifiche / Varianti',
      color: '#0ea5e9',
      visible: true,
      locked: false,
    },
  ];
}

export function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
}

export function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

const IDB_NAME = 'gecola_plan_workspace_db';
const IDB_VERSION = 1;
const IDB_STORE = 'workspace';
const WORKSPACE_KEY = 'active_project_sheets';

function openPlanWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponibile'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Errore apertura IndexedDB'));
  });
}

export async function savePlanWorkspaceToIdb(
  sheets: SavedPlanSheet[],
  activeSheetId: string | null
): Promise<void> {
  try {
    const db = await openPlanWorkspaceDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ sheets, activeSheetId, updatedAt: new Date().toISOString() }, WORKSPACE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Errore salvataggio planimetrie'));
    });
    db.close();
  } catch (err) {
    console.warn('Impossibile salvare le tavole in IndexedDB:', err);
  }
}

export async function loadPlanWorkspaceFromIdb(): Promise<{
  sheets: SavedPlanSheet[];
  activeSheetId: string | null;
}> {
  try {
    const db = await openPlanWorkspaceDb();
    const result = await new Promise<{ sheets: SavedPlanSheet[]; activeSheetId: string | null }>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(WORKSPACE_KEY);
      req.onsuccess = () => {
        const val = req.result;
        if (val && Array.isArray(val.sheets)) {
          resolve({ sheets: val.sheets, activeSheetId: val.activeSheetId || null });
        } else {
          resolve({ sheets: [], activeSheetId: null });
        }
      };
      req.onerror = () => reject(req.error || new Error('Errore lettura planimetrie'));
    });
    db.close();
    return result;
  } catch (err) {
    console.warn('Impossibile caricare le tavole da IndexedDB:', err);
    return { sheets: [], activeSheetId: null };
  }
}

export async function clearPlanWorkspaceFromIdb(): Promise<void> {
  try {
    const db = await openPlanWorkspaceDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(WORKSPACE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('Errore pulizia IndexedDB planimetrie:', err);
  }
}
