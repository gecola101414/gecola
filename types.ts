
export interface Category {
  id: string; // ID univoco immutabile per gestione gerarchia
  code: string;
  name: string;
  isLocked?: boolean;
  isEnabled?: boolean;
  isImported?: boolean;
  isSuperCategory?: boolean; // Se true, funge da raccoglitore di WBS
  type?: 'work' | 'safety'; // Distingue tra capitoli di lavoro e di sicurezza
  parentId?: string; // ID della categoria genitore per raggruppamento
  color?: string; // Colore identificativo (usato principalmente per Super Categorie)
  soaCategory?: string; // Nuova centralizzazione SOA a livello di WBS
}

export interface Measurement {
  id: string;
  description: string;
  type: 'positive' | 'deduction' | 'subtotal';
  length?: number;
  width?: number;
  height?: number;
  multiplier?: number;
  linkedArticleId?: string;
  linkedType?: 'quantity' | 'amount';
}

export interface Article {
  id: string;
  categoryCode: string;
  code: string;
  priceListSource?: string;
  description: string;
  unit: string;
  unitPrice: number;
  laborRate: number;
  measurements: Measurement[];
  quantity: number;
  linkedAnalysisId?: string;
  isLocked?: boolean;
  displayMode?: number; // 0: Normal, 1: Concise, 2: Industrial
  soaCategory?: string; // Mantenuto per compatibilità ma prioritario quello di categoria
  groundingUrls?: any[];
}

export interface AnalysisComponent {
  id: string;
  type: 'material' | 'labor' | 'equipment' | 'general';
  description: string;
  unit: string;
  unitPrice: number;
  quantity: number;
}

export interface PriceAnalysis {
  id: string;
  code: string;
  description: string;
  unit: string;
  analysisQuantity: number;
  components: AnalysisComponent[];
  generalExpensesRate: number;
  profitRate: number;
  isLocked?: boolean;
  totalMaterials: number;
  totalLabor: number;
  totalEquipment: number;
  costoTecnico: number;
  valoreSpese: number;
  valoreUtile: number;
  totalBatchValue: number;
  totalUnitPrice: number;
}

export interface ProjectInfo {
  title: string;
  client: string;
  designer: string;
  location: string;
  date: string;
  priceList: string; 
  region: string;
  year: string;
  vatRate: number;
  safetyRate: number;
  fontSizeTitle?: number; 
  fontSizeClient?: number;
  fontSizeTotals?: number;
  tariffColumnWidth?: number;
  fontSizeMeasurements?: number;
  fontSizeWbsSidebar?: number;
}

export interface Totals {
  totalWorks: number;
  totalLabor: number;
  safetyCosts: number;
  totalSafetyProgettuale: number;
  totalTaxable: number;
  vatAmount: number;
  grandTotal: number;
}
