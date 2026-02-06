import { Article, Category, ProjectInfo, PriceAnalysis } from './types';

export const REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", 
  "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", 
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", 
  "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"
];

export const YEARS = ["2025", "2024", "2023", "2022"];

export const COMMON_UNITS = [
    'm', 'm²', 'm³', 'kg', 'q', 't', 'cad', 'h', 'l', 'a corpo', 'cm', 'mm'
];

export const VIVID_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#10B981", "#06B6D4", 
  "#3B82F6", "#6366F1", "#8B5CF6", "#D946EF", "#EC4899",
  "#DC2626", "#D97706", "#059669", "#0891B2", "#2563EB",
  "#4F46E5", "#7C3AED", "#C026D3", "#DB2777", "#475569"
];

export const WBS_SUGGESTIONS = [
  "Allestimento e Sicurezza Cantiere",
  "Demolizioni e Rimozioni",
  "Scavi e Movimento Terra",
  "Fondazioni e Opere Interrate",
  "Strutture in Elevazione (C.A.)",
  "Strutture Metalliche",
  "Solai e Coperture",
  "Impermeabilizzazioni e Isolamenti",
  "Murature Perimetrali e Tamponamenti",
  "Tramezzature e Divisioni Interne",
  "Intonaci e Finiture Grezze",
  "Sottofondi e Massetti",
  "Pavimenti Interni ed EstERNi",
  "Rivestimenti Bagni e Cucine",
  "Lattoneria e Smaltimento Acque",
  "Opere in Pietra e Marmi",
  "Infissi Esterni e Vetrate",
  "Porte e Infissi Interni",
  "Opere in Ferro e Carpenteria Leggera",
  "Ringhiere e Parapetti",
  "Impianto Idrico-Sanitario",
  "Impianto di Riscaldamento e Clima",
  "Impianto Elettrico e Domotico",
  "Impianto di Illuminazione Speciale",
  "Opere da Pittore e Tinteggiature",
  "Controsoffittature e Cartongesso",
  "Sistemazioni Esterne e Verde",
  "Recinzioni e Cancelli",
  "Oneri della Sicurezza (PSC)",
  "Assistenza Muraria Impianti",
  "Pulizia e Collaudo Finale"
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
  { description: "Gres porcellanato standard 30x60", unit: "m²", price: 24.00 },
  { description: "Pannello recinzione mobile 2.00x3.50m", unit: "cad", price: 45.00 },
  { description: "Basamento in calcestruzzo per recinzione", unit: "cad", price: 8.50 }
];

export const REBAR_WEIGHTS = [
  { diameter: 6, weight: 0.222 }, { diameter: 8, weight: 0.395 }, { diameter: 10, weight: 0.617 },
  { diameter: 12, weight: 0.888 }, { diameter: 14, weight: 1.208 }, { diameter: 16, weight: 1.578 },
  { diameter: 18, weight: 1.998 }, { diameter: 20, weight: 2.466 }, { diameter: 22, weight: 2.984 },
  { diameter: 24, weight: 3.551 }, { diameter: 26, weight: 4.168 }, { diameter: 28, weight: 4.834 },
  { diameter: 30, weight: 5.549 }, { diameter: 32, weight: 6.313 }
];

export const SOA_CATEGORIES = [
    { code: 'OG1', desc: 'Edifici civili e industriali' },
    { code: 'OG2', desc: 'Restauro beni immobili sottoposti a tutela' },
    { code: 'OG3', desc: 'Strade, autostrade, ponti, viadotti, ferrovie' },
    { code: 'OG4', desc: 'Opere d’arte nel sottosuolo' },
    { code: 'OG5', desc: 'Dighe' },
    { code: 'OG6', desc: 'Acquedotti, gasdotti, oleodotti, opere irrigazione' },
    { code: 'OG7', desc: 'Opere marittime e lavori di dragaggio' },
    { code: 'OG8', desc: 'Opere fluviali, difesa, sistemazione idraulica' },
    { code: 'OG9', desc: 'Impianti per la produzione di energia elettrica' },
    { code: 'OG10', desc: 'Impianti trasformazione AT/MT e distribuzione' },
    { code: 'OG11', desc: 'Impianti tecnologici' },
    { code: 'OG12', desc: 'Opere ed impianti di bonifica e protezione ambientale' },
    { code: 'OG13', desc: 'Opere di ingegneria naturalistica' },
    { code: 'OS1', desc: 'Lavori in terra' },
    { code: 'OS2-A', desc: 'Superfici decorate di beni immobili patrimonio culturale' },
    { code: 'OS2-B', desc: 'Beni culturali mobili archivistico e librario' },
    { code: 'OS3', desc: 'Impianti idrico-sanitario, cucine, lavanderie' },
    { code: 'OS4', desc: 'Impianti elettromeccanici trasportatori' },
    { code: 'OS5', desc: 'Impianti pneumatici e antintrusione' },
    { code: 'OS6', desc: 'Finiture in materiali lignei, plastici, metallici, vetrosi' },
    { code: 'OS7', desc: 'Finiture di natura edile e tecnica' },
    { code: 'OS8', desc: 'Opere di impermeabilizzazione' },
    { code: 'OS9', desc: 'Impianti segnaletica luminosa e sicurezza traffico' },
    { code: 'OS10', desc: 'Segnaletica stradale non luminosa' },
    { code: 'OS11', desc: 'Apparecchiature strutturali speciali' },
    { code: 'OS12-A', desc: 'Barriere stradali di sicurezza' },
    { code: 'OS12-B', desc: 'Barriere paramassi, fermaneve e simili' },
    { code: 'OS13', desc: 'Strutture prefabbricate in cemento armato' },
    { code: 'OS14', desc: 'Impianti smaltimento e recupero rifiuti' },
    { code: 'OS15', desc: 'Pulizia acque marine, lacustri, fluviali' },
    { code: 'OS16', desc: 'Impianti centrali produzione energia elettrica' },
    { code: 'OS17', desc: 'Linee telefoniche ed impianti di telefonia' },
    { code: 'OS18-A', desc: 'Componenti strutturali in acciaio' },
    { code: 'OS18-B', desc: 'Componenti per facciate continue' },
    { code: 'OS19', desc: 'Impianti reti telecomunicazione e dati' },
    { code: 'OS20-A', desc: 'Rilevamenti topografici' },
    { code: 'OS20-B', desc: 'Indagini geognostiche' },
    { code: 'OS21', desc: 'Opere strutturali speciali' },
    { code: 'OS22', desc: 'Impianti potabilizzazione e depurazione' },
    { code: 'OS23', desc: 'Demolizione di opere' },
    { code: 'OS24', desc: 'Verde e arredo urbano' },
    { code: 'OS25', desc: 'Scavi archeologici' },
    { code: 'OS26', desc: 'Pavimentazioni e sovrastrutture speciali' },
    { code: 'OS27', desc: 'Impianti per la trazione elettrica' },
    { code: 'OS28', desc: 'Impianti termici e di condizionamento' },
    { code: 'OS29', desc: 'Armamento ferroviario' },
    { code: 'OS30', desc: 'Impianti interni elettrici, telefonici, televisivi' },
    { code: 'OS31', desc: 'Impianti per la mobilità sospesa' },
    { code: 'OS32', desc: 'Strutture in legno' },
    { code: 'OS33', desc: 'Coperture speciali' },
    { code: 'OS34', desc: 'Sistemi antirumore' },
    { code: 'OS35', desc: 'Interventi a basso impatto ambientale' }
];

export const PROJECT_INFO: ProjectInfo = {
  title: 'Nuovo Progetto Edile Professionale',
  client: 'Nome Committente',
  designer: 'Ing. Domenico Gimondo',
  location: 'Località Cantiere',
  date: new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
  priceList: 'Prezzario Regionale 2025', 
  region: 'Lombardia',
  year: '2025',
  vatRate: 10,
  safetyRate: 3.5,
  fontSizeTitle: 28,
  fontSizeClient: 15,
  fontSizeTotals: 22,
  tariffColumnWidth: 135,
  fontSizeMeasurements: 12,
  fontSizeWbsSidebar: 14,
};

export const CATEGORIES: Category[] = [
  { id: 'cat_01', code: 'WBS.01', name: 'Apprestamenti e Impianto di Cantiere', isEnabled: true, isLocked: false, type: 'work', soaCategory: 'OG1' },
  { id: 'cat_02', code: 'WBS.02', name: 'Demolizioni, Rimozioni e Scavi', isEnabled: true, isLocked: false, type: 'work', soaCategory: 'OG3' },
  { id: 'cat_03', code: 'WBS.03', name: 'Opere Murarie, Tramezzi e Sottofondi', isEnabled: true, isLocked: false, type: 'work', soaCategory: 'OG1' },
  { id: 'cat_04', code: 'WBS.04', name: 'Impianti Idrico-Termici, Clima e Gas', isEnabled: true, isLocked: false, type: 'work', soaCategory: 'OS3' },
  { id: 'cat_05', code: 'WBS.05', name: 'Impianti Elettrici, Domotici e Speciali', isEnabled: true, isLocked: false, type: 'work', soaCategory: 'OS30' },
  { id: 'cat_06', code: 'WBS.06', name: 'Finiture Interne, Esterne e Serramenti', isEnabled: true, isLocked: false, type: 'work', soaCategory: 'OS7' },
  
  { id: 'cat_s01', code: 'S.01', name: 'PSC - Recinzioni, Accessi e Segnaletica', isEnabled: true, isLocked: false, type: 'safety' },
  { id: 'cat_s02', code: 'S.02', name: 'PSC - Protezioni Collettive (Ponteggi, Parapetti)', isEnabled: true, isLocked: false, type: 'safety' },
  { id: 'cat_s03', code: 'S.03', name: 'PSC - Apprestamenti Igienico-Assistenziali', isEnabled: true, isLocked: false, type: 'safety' },
  { id: 'cat_s04', code: 'S.04', name: 'PSC - Impianti di Cantiere e Messa a Terra', isEnabled: true, isLocked: false, type: 'safety' },
  { id: 'cat_s05', code: 'S.05', name: 'PSC - Misure Preventive e Primo Soccorso', isEnabled: true, isLocked: false, type: 'safety' },
];

export const INITIAL_ARTICLES: Article[] = [];

export const INITIAL_ANALYSES: PriceAnalysis[] = [];