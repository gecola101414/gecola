
export interface Category {
  code: string;
  name: string;
  isLocked?: boolean;
  isEnabled?: boolean;
}

export interface Measurement {
  id: string;
  description: string;
  type: 'positive' | 'deduction' | 'subtotal';
  length?: number; // Lunghezza
  width?: number;  // Larghezza
  height?: number; // Altezza / Peso
  multiplier?: number; // Parti uguali - Optional/Undefined means 1 visually but blank
  // Dynamic Linking fields
  linkedArticleId?: string;
  linkedType?: 'quantity' | 'amount';
}

export interface Article {
  id: string;
  categoryCode: string;
  code: string;
  priceListSource?: string; // e.g. "Prezzario DEI 2024" or "Da Analisi AP.01"
  description: string;
  unit: string;
  unitPrice: number;
  laborRate: number; // Incidenza Manodopera %
  measurements: Measurement[]; // The list of detailed measurements
  quantity: number; // Calculated cached sum
  linkedAnalysisId?: string; // ID of the PriceAnalysis if linked
  isLocked?: boolean; // NEW: Lock individual article
  soaCategory?: string; // NEW: SOA Category (e.g., OG1, OS3)
}

export interface AnalysisComponent {
  id: string;
  type: 'material' | 'labor' | 'equipment' | 'general';
  description: string;
  unit: string;
  unitPrice: number;
  quantity: number; // Quantity needed for the analysis batch
}

export interface PriceAnalysis {
  id: string;
  code: string; // e.g. "AP.01"
  description: string; // Title of the analysis
  unit: string; // U.M. of the resulting item (e.g. m2)
  analysisQuantity: number; // NEW: The quantity being analyzed (sample size)
  components: AnalysisComponent[];
  generalExpensesRate: number; // % Spese Generali (default 15%)
  profitRate: number; // % Utile d'Impresa (default 10%)
  
  // Calculated values (cached for display)
  totalMaterials: number;
  totalLabor: number;
  totalEquipment: number;
  costoTecnico: number; // Sum of above
  valoreSpese: number;
  valoreUtile: number;
  totalBatchValue: number; // Total value of the batch
  totalUnitPrice: number; // The final price per unit (Batch / Quantity)
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
