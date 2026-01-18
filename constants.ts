
import { Article, Category, ProjectInfo, PriceAnalysis } from './types';

export const REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", 
  "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", 
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", 
  "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"
];

export const YEARS = ["2025", "2024", "2023", "2022"];

export const COMMON_UNITS = [
    'cad', 'm', 'm²', 'm³', 'kg', 'q', 't', 'h', 'cm', 'mm', 'l', 'a corpo'
];

export const REBAR_WEIGHTS = [
  { diameter: 6, weight: 0.222 },
  { diameter: 8, weight: 0.395 },
  { diameter: 10, weight: 0.617 },
  { diameter: 12, weight: 0.888 },
  { diameter: 14, weight: 1.208 },
  { diameter: 16, weight: 1.578 },
  { diameter: 18, weight: 1.998 },
  { diameter: 20, weight: 2.466 },
  { diameter: 22, weight: 2.984 },
  { diameter: 24, weight: 3.551 },
  { diameter: 26, weight: 4.168 },
  { diameter: 28, weight: 4.834 },
  { diameter: 30, weight: 5.549 },
  { diameter: 32, weight: 6.313 }
];

export const SOA_CATEGORIES = [
    { code: 'OG1', desc: 'Edifici civili e industriali' },
    { code: 'OG2', desc: 'Restauro e manutenzione beni immobili' },
    { code: 'OG3', desc: 'Strade, autostrade, ponti, viadotti' },
    { code: 'OS3', desc: 'Impianti idrico-sanitario, cucine, lavanderie' },
    { code: 'OS30', desc: 'Impianti interni elettrici, telefonici, radiotelefonici e televisivi' }
];

export const PROJECT_INFO: ProjectInfo = {
  title: 'Ristrutturazione Edificio Residenziale "Palazzo del Sole"',
  client: 'Condominio Via Roma 12',
  designer: 'Arch. Marco Rossi',
  location: 'Milano (MI)',
  date: new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
  priceList: 'Prezzario Lombardia 2025', 
  region: 'Lombardia',
  year: '2025',
  vatRate: 10,
  safetyRate: 3.5,
};

export const CATEGORIES: Category[] = [
  { code: 'WBS.01', name: 'Apprestamenti di Cantiere e Sicurezza', isEnabled: true, isLocked: false },
  { code: 'WBS.02', name: 'Demolizioni, Rimozioni e Scavi', isEnabled: true, isLocked: false },
  { code: 'WBS.03', name: 'Strutture e Opere Murarie', isEnabled: true, isLocked: false },
  { code: 'WBS.04', name: 'Impianti Tecnologici (Idro-Termo-Sanitario)', isEnabled: true, isLocked: false },
  { code: 'WBS.05', name: 'Opere di Finitura e Rivestimenti', isEnabled: true, isLocked: false },
];

export const INITIAL_ARTICLES: Article[] = [
  {
    id: 'demo-art-1',
    categoryCode: 'WBS.02',
    code: '1.A.01.10.a',
    description: 'Demolizione di muratura di qualsiasi natura e spessore, compreso l\'onere per il carico, il trasporto e lo scarico alle discariche autorizzate del materiale di risulta.',
    unit: 'm³',
    unitPrice: 45.50,
    laborRate: 85,
    soaCategory: 'OG1',
    priceListSource: 'Prezzario Lombardia 2025',
    quantity: 0,
    measurements: [
      { id: 'm1', description: 'Parete divisoria corridoio', multiplier: 1, length: 4.50, width: 0.15, height: 2.70, type: 'positive' },
      { id: 'm2', description: 'Sfondato porta cucina', multiplier: 1, length: 0.90, width: 0.15, height: 2.10, type: 'deduction' }
    ]
  },
  {
    id: 'demo-art-2',
    categoryCode: 'WBS.03',
    code: '2.B.20.05.b',
    description: 'Fornitura e posa in opera di tramezzatura interna realizzata con blocchi in laterizio forato sp. 8 cm, compreso allettamento con malta bastarda e ogni altro onere.',
    unit: 'm²',
    unitPrice: 32.80,
    laborRate: 45,
    soaCategory: 'OG1',
    priceListSource: 'Prezzario Lombardia 2025',
    quantity: 0,
    measurements: [
      { id: 'm3', description: 'Nuovo divisorio camera/bagno', multiplier: 1, length: 3.20, height: 2.70, type: 'positive' },
      { id: 'm4', description: 'Nuovo divisorio ingresso', multiplier: 2, length: 1.50, height: 2.70, type: 'positive' }
    ]
  },
  {
    id: 'demo-art-3',
    categoryCode: 'WBS.05',
    code: '5.F.15.10.c',
    description: 'Posa in opera di pavimento in gres porcellanato di prima scelta, in piastrelle di qualsiasi formato, compresa la formazione del letto di posa con collante cementizio.',
    unit: 'm²',
    unitPrice: 28.00,
    laborRate: 60,
    soaCategory: 'OG1',
    priceListSource: 'Prezzario Lombardia 2025',
    quantity: 0,
    measurements: [
      { id: 'm5', description: 'Pavimentazione soggiorno', multiplier: 1, length: 6.00, width: 4.50, type: 'positive' },
      { id: 'm6', description: 'Pavimentazione camera', multiplier: 1, length: 4.00, width: 4.00, type: 'positive' }
    ]
  }
];

export const INITIAL_ANALYSES: PriceAnalysis[] = [
  {
    id: 'demo-analysis-1',
    code: 'AP.01',
    description: 'Intonaco civile per interni a base di calce e cemento',
    unit: 'm²',
    analysisQuantity: 1,
    generalExpensesRate: 15,
    profitRate: 10,
    components: [
      { id: 'c1', type: 'material', description: 'Malta bastarda pronta', unit: 'm³', unitPrice: 120.00, quantity: 0.02 },
      { id: 'c2', type: 'labor', description: 'Operaio Specializzato', unit: 'h', unitPrice: 35.00, quantity: 0.40 },
      { id: 'c3', type: 'labor', description: 'Operaio Comune', unit: 'h', unitPrice: 28.00, quantity: 0.30 },
      { id: 'c4', type: 'equipment', description: 'Impalcatura mobile', unit: 'h', unitPrice: 5.00, quantity: 0.40 }
    ],
    totalMaterials: 2.4,
    totalLabor: 22.4,
    totalEquipment: 2.0,
    costoTecnico: 26.8,
    valoreSpese: 4.02,
    valoreUtile: 3.08,
    totalBatchValue: 33.90,
    totalUnitPrice: 33.90
  }
];
