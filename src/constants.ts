
import { Article, Category, ProjectInfo, PriceAnalysis } from './types';

export const REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", 
  "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", 
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", 
  "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"
];

export const YEARS = ["2025", "2024", "2023", "2022"];

export const COMMON_UNITS = [
    'cad', 
    'm', 
    'm²', 
    'm³', 
    'kg', 
    'q', 
    't', 
    'h', 
    'cm', 
    'mm', 
    'l', 
    'a corpo'
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
  title: 'Nuovo Progetto',
  client: 'Committente Predefinito',
  location: 'Cantiere',
  date: new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
  priceList: 'Prezzario Regionale', 
  region: 'Lombardia', // Default impostato
  year: '2025',        // Default impostato
  vatRate: 10,
  safetyRate: 3,
};

export const CATEGORIES: Category[] = [
  { code: 'WBS.01', name: 'Opere Propedeutiche e Demolizioni', isEnabled: true, isLocked: false },
  { code: 'WBS.02', name: 'Strutture Murarie e Tamponamenti', isEnabled: true, isLocked: false },
  { code: 'WBS.03', name: 'Impianto Idrico-Sanitario', isEnabled: true, isLocked: false },
  { code: 'WBS.04', name: 'Impianto Elettrico', isEnabled: true, isLocked: false },
  { code: 'WBS.05', name: 'Finiture (Pavimenti, Rivestimenti, Pitture)', isEnabled: true, isLocked: false },
  { code: 'WBS.06', name: 'Serramenti e Chiusure', isEnabled: true, isLocked: false },
];

export const INITIAL_ARTICLES: Article[] = [];

export const INITIAL_ANALYSES: PriceAnalysis[] = [
  {
    id: 'demo-analysis-1',
    code: 'AP.01',
    description: 'Intonaco civile per interni a base di calce e cemento',
    unit: 'mq',
    analysisQuantity: 1, // Default 1
    generalExpensesRate: 15,
    profitRate: 10,
    components: [
      { id: 'c1', type: 'material', description: 'Malta bastarda pronta', unit: 'mc', unitPrice: 120.00, quantity: 0.02 },
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
