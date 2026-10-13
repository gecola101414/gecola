
export interface Category {
  id: string; 
  code: string;
  name: string;
  isLocked?: boolean;
  isEnabled?: boolean;
  isImported?: boolean;
  isSuperCategory?: boolean; 
  type?: 'work' | 'safety'; 
  parentId?: string; 
  color?: string; 
  soaCategory?: string; 
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
  isEnabled?: boolean;
  originalGlobalIndex?: number;
  displayMode?: number; 
  soaCategory?: string; 
  groundingUrls?: any[];
  includesMarkup?: boolean; // Spuntatura: true se già comprensivo di Spese Generali e Utile d'Impresa
}

export interface AnalysisMeasurement {
  id: string;
  description: string;
  multiplier?: number;
  length?: number;
  width?: number;
  height?: number;
}

export interface AnalysisComponent {
  id: string;
  type: 'material' | 'labor' | 'equipment' | 'general';
  code?: string;
  description: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  includesMarkup?: boolean;
  measurements?: AnalysisMeasurement[];
  sourcePriceList?: string;
}

export interface PriceAnalysis {
  id: string;
  code: string;
  description: string;
  unit: string;
  analysisQuantity: number;
  articles?: Article[];
  components?: AnalysisComponent[];
  generalExpensesRate: number;
  profitRate: number;
  markupMode?: 'exclude_from_markup' | 'unbundle_and_reapply';
  isLocked?: boolean;
  totalMaterials: number;
  totalLabor: number;
  totalEquipment: number;
  costoTecnico: number;
  valoreSpese: number;
  valoreUtile: number;
  totalBatchValue: number;
  totalUnitPrice: number;
  totalNetItems?: number;
  totalInclusiveItems?: number;
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
  showLaborIncidenceInSummary?: boolean;
  descriptionLength?: 'full' | 'short';
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
