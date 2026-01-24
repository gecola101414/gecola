
export interface Category {
  code: string;
  name: string;
  isLocked?: boolean;
  isEnabled?: boolean;
  isImported?: boolean;
  type?: 'work' | 'safety'; // Distingue tra capitoli di lavoro e di sicurezza
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
  soaCategory?: string;
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
  safetyCosts: number;
  totalSafetyProgettuale: number; // Somma analitica dei capitoli sicurezza (S.xx)
  totalTaxable: number;
  vatAmount: number;
  grandTotal: number;
}

export interface BulkGenerationResult {
  items: Partial<Article>[];
}
