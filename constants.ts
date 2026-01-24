
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

export const LABOR_CATALOG = [
  { description: "Operaio Specializzato", unit: "h", price: 35.50 },
  { description: "Operaio Qualificato", unit: "h", price: 32.15 },
  { description: "Operaio Comune", unit: "h", price: 28.30 },
  { description: "Capocantiere / Tecnico IV liv.", unit: "h", price: 42.00 },
  { description: "Autista / Meccanico", unit: "h", price: 33.50 }
];

export const EQUIPMENT_CATALOG = [
  { description: "Escavatore cingolato 15-20t", unit: "h", price: 55.00 },
  { description: "Mini-escavatore 1.5t", unit: "h", price: 25.00 },
  { description: "Gru a torre braccio 40-50m", unit: "h", price: 38.00 },
  { description: "Autocarro ribaltabile 10t", unit: "h", price: 32.00 },
  { description: "Pompa per calcestruzzo braccio 24m", unit: "h", price: 110.00 },
  { description: "Ponteggio metallico (Noleggio/Mese)", unit: "mq", price: 1.80 },
  { description: "Betoniera a bicchiere", unit: "h", price: 4.50 },
  { description: "Motocompressore 3000 l/min", unit: "h", price: 12.00 },
  { description: "Trabattello in alluminio h 6m", unit: "h", price: 3.50 }
];

export const MATERIAL_CATALOG = [
  { description: "Calcestruzzo C25/30 XC2 Rck 30", unit: "m³", price: 125.00 },
  { description: "Calcestruzzo C30/37 XC3 Rck 37", unit: "m³", price: 138.00 },
  { description: "Malta cementizia M5 (sacco 25kg)", unit: "cad", price: 4.50 },
  { description: "Acciaio B450C in barre per armatura", unit: "kg", price: 1.15 },
  { description: "Rete elettrosaldata Ø6 10x10", unit: "kg", price: 1.35 },
  { description: "Blocchi laterizio forato sp. 8cm", unit: "m²", price: 12.50 },
  { description: "Blocchi laterizio forato sp. 12cm", unit: "m²", price: 15.80 },
  { description: "Intonaco premiscelato base calce/cem", unit: "kg", price: 0.32 },
  { description: "Pittura lavabile per interni (fustino 14l)", unit: "cad", price: 65.00 },
  { description: "Collante cementizio per pavimenti C2TE", unit: "kg", price: 0.85 },
  { description: "Gres porcellanato standard 30x60", unit: "m²", price: 24.00 }
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
    { code: 'OG4', desc: 'Opere d’arte nel sottosuolo' },
    { code: 'OG5', desc: 'Dighe' },
    { code: 'OG6', desc: 'Acquedotti, gasdotti, oleodotti' },
    { code: 'OG7', desc: 'Opere marittime e lavori di dragaggio' },
    { code: 'OG8', desc: 'Opere fluviali, di difesa, di sistemazione idraulica' },
    { code: 'OG9', desc: 'Impianti per la produzione di energia elettrica' },
    { code: 'OG10', desc: 'Impianti per la trasformazione alta/media tensione' },
    { code: 'OG11', desc: 'Impianti tecnologici' },
    { code: 'OG12', desc: 'Opere ed impianti di bonifica e protezione ambientale' },
    { code: 'OG13', desc: 'Opere di ingegneria naturalistica' },
    { code: 'OS1', desc: 'Lavori in terra' },
    { code: 'OS2-A', desc: 'Superfici decorate di beni immobili' },
    { code: 'OS2-B', desc: 'Beni culturali mobili' },
    { code: 'OS3', desc: 'Impianti idrico-sanitario, cucine, lavanderie' },
    { code: 'OS4', desc: 'Impianti elettromeccanici trasportatori' },
    { code: 'OS5', desc: 'Impianti pneumatici e antintrusione' },
    { code: 'OS6', desc: 'Finiture di opere generali in materiali lignei, plastici, metallici e vetrosi' },
    { code: 'OS7', desc: 'Finiture di opere generali di natura edile e tecnica' },
    { code: 'OS8', desc: 'Opere di impermeabilizzazione' },
    { code: 'OS9', desc: 'Impianti per la segnaletica luminosa e sicurezza traffico' },
    { code: 'OS10', desc: 'Segnaletica stradale non luminosa' },
    { code: 'OS11', desc: 'Apparecchiature strutturali speciali' },
    { code: 'OS12-A', desc: 'Barriere stradali di sicurezza' },
    { code: 'OS12-B', desc: 'Barriere paramassi, ferma neve e simili' },
    { code: 'OS13', desc: 'Strutture prefabbricate in cemento armato' },
    { code: 'OS14', desc: 'Impianti di smaltimento e recupero rifiuti' },
    { code: 'OS15', desc: 'Pulizia di acque marine, lacustri, fluviali' },
    { code: 'OS16', desc: 'Impianti per centrali di produzione energia elettrica' },
    { code: 'OS17', desc: 'Linee telefoniche ed impianti di telefonia' },
    { code: 'OS18-A', desc: 'Componenti strutturali in acciaio' },
    { code: 'OS18-B', desc: 'Componenti per facciate continue' },
    { code: 'OS19', desc: 'Impianti di reti di telecomunicazione e dati' },
    { code: 'OS20-A', desc: 'Rilevamenti topografici' },
    { code: 'OS20-B', desc: 'Indagini geognostiche' },
    { code: 'OS21', desc: 'Opere strutturali speciali' },
    { code: 'OS22', desc: 'Impianti di potabilizzazione e depurazione' },
    { code: 'OS23', desc: 'Demolizione di opere' },
    { code: 'OS24', desc: 'Verde e arredo urbano' },
    { code: 'OS25', desc: 'Scavi archeologici' },
    { code: 'OS26', desc: 'Pavimentazioni e sovrastrutture speciali' },
    { code: 'OS27', desc: 'Impianti per la trazione elettrica' },
    { code: 'OS28', desc: 'Impianti termici e di condizionamento' },
    { code: 'OS29', desc: 'Armamento ferroviario' },
    { code: 'OS30', desc: 'Impianti interni elettrici, telefonici, radiotelefonici e televisivi' },
    { code: 'OS31', desc: 'Impianti per la mobilità sospesa' },
    { code: 'OS32', desc: 'Strutture in legno' },
    { code: 'OS33', desc: 'Coperture speciali' },
    { code: 'OS34', desc: 'Sistemi antirumore per infrastrutture di mobilità' },
    { code: 'OS35', desc: 'Interventi a basso impatto ambientale' }
];

export const PROJECT_INFO: ProjectInfo = {
  title: 'Nuovo Progetto Protetto',
  client: 'Dott.ssa Elisabetta Bianchi',
  designer: 'Ing. Domenico Gimondo',
  location: 'Milano (MI)',
  date: new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
  priceList: 'Prezzario Lombardia 2025', 
  region: 'Lombardia',
  year: '2025',
  vatRate: 10,
  safetyRate: 3.5,
  fontSizeTitle: 28,
  fontSizeClient: 15,
  fontSizeTotals: 22,
  tariffColumnWidth: 105,
  fontSizeMeasurements: 12,
  fontSizeWbsSidebar: 14,
};

export const CATEGORIES: Category[] = [
  { code: 'WBS.01', name: 'Apprestamenti di Cantiere e Sicurezza', isEnabled: true, isLocked: false, type: 'work' },
  { code: 'WBS.02', name: 'Demolizioni e Rimozioni', isEnabled: true, isLocked: false, type: 'work' },
  { code: 'WBS.03', name: 'Opere Murarie e Sottofondi', isEnabled: true, isLocked: false, type: 'work' },
  { code: 'WBS.04', name: 'Impianto Idrico e Condizionamento', isEnabled: true, isLocked: false, type: 'work' },
  { code: 'WBS.05', name: 'Pavimenti e Finiture', isEnabled: true, isLocked: false, type: 'work' },
  // 5 WBS dedicate alla Sicurezza Progettuale
  { code: 'S.01', name: 'Apprestamenti di Sicurezza PSC', isEnabled: true, isLocked: false, type: 'safety' },
  { code: 'S.02', name: 'DPI e Dispositivi di Protezione Speciali', isEnabled: true, isLocked: false, type: 'safety' },
  { code: 'S.03', name: 'Impiantistica di Cantiere (Messa a terra, etc)', isEnabled: true, isLocked: false, type: 'safety' },
  { code: 'S.04', name: 'Misure di Prevenzione Rischio Rumore/Vibrazioni', isEnabled: true, isLocked: false, type: 'safety' },
  { code: 'S.05', name: 'Servizi Igienico-Assistenziali di Cantiere', isEnabled: true, isLocked: false, type: 'safety' },
];

export const INITIAL_ARTICLES: Article[] = [
  {
    id: 'art-01',
    categoryCode: 'WBS.01',
    code: '1.A.05',
    description: 'Noleggio e montaggio di trabattello professionale h 6m per lavori in quota, compreso ogni onere di sicurezza e certificazione.',
    unit: 'h',
    unitPrice: 3.50,
    laborRate: 10,
    soaCategory: 'OG1',
    priceListSource: 'Prezzario Lombardia 2025',
    quantity: 0,
    measurements: [
      { id: 'm1', description: 'Apprestamento per lavori in soggiorno', multiplier: 24, length: 1, type: 'positive' }
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
      { id: 'c1', type: 'material', description: 'Intonaco premiscelato base calce/cem', unit: 'kg', unitPrice: 0.32, quantity: 20 },
      { id: 'c2', type: 'labor', description: 'Operaio Specializzato', unit: 'h', unitPrice: 35.50, quantity: 0.40 }
    ],
    totalMaterials: 6.4,
    totalLabor: 22.69,
    totalEquipment: 1.4,
    costoTecnico: 30.49,
    valoreSpese: 4.57,
    valoreUtile: 3.51,
    totalBatchValue: 38.57,
    totalUnitPrice: 38.57
  }
];
