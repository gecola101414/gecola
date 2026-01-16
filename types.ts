
export interface Category {
  code: string;
  name: string;
  isLocked?: boolean;
  isEnabled?: boolean;
  isImported?: boolean; // Per distinguere WBS esterne
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
  location: string;
  date: string;
  priceList: string; 
  region: string;
  year: string;
  vatRate: number;
  safetyRate: number;
}

export interface Totals {
  totalWorks: number;
  safetyCosts: number;
  totalTaxable: number;
  vatAmount: number;
  grandTotal: number;
}

export interface BulkGenerationResult {
  items: Partial<Article>[];
}
