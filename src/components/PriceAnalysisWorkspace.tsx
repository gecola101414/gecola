import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, Trash2, Copy, FileText, ArrowRight, Check,
  ChevronDown, ChevronRight, Package, Hammer, Truck, Info,
  Calculator, Layers, HelpCircle, GripVertical, AlertCircle,
  Paintbrush, Headset, CopyPlus, MinusCircle, Link as LinkIcon,
  Lock, Unlock, Power, PowerOff, ShieldCheck, Database,
  CornerRightDown, MousePointer2, ExternalLink, Settings,
  Maximize2, Minimize2, RefreshCw, Award, PenLine
} from 'lucide-react';
import { 
  PriceAnalysis, Article, Measurement, ProjectInfo, AnalysisComponent 
} from '../types';
import { COMMON_UNITS } from '../constants';
import { parseDroppedContent, cleanDescription } from '../services/geminiService';
import { generateAnalisiPrezziPdf } from '../services/pdfGenerator';
import RebarCalculatorModal from './RebarCalculatorModal';
import PaintingCalculatorModal from './PaintingCalculatorModal';

interface PriceAnalysisWorkspaceProps {
  analysis: PriceAnalysis;
  onUpdateAnalysis: (updated: PriceAnalysis) => void;
  projectInfo: ProjectInfo;
  onImportToComputo?: (analysis: PriceAnalysis) => void;
  onDuplicateAnalysis?: (analysis: PriceAnalysis) => void;
  selectedGroupFilter?: 'all' | 'material' | 'labor' | 'equipment';
  onSelectGroupFilter?: (group: 'all' | 'material' | 'labor' | 'equipment') => void;
}

// Icona Armatura 3D Staffe identica al Computo Metrico
export const RebarCagePillarIcon: React.FC<{ className?: string }> = ({ className = "w-3.5 h-3.5" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <line x1="7.5" y1="2" x2="7.5" y2="22" stroke="currentColor" strokeWidth="1.6" className="text-cyan-500" />
    <line x1="16.5" y1="2" x2="16.5" y2="22" stroke="currentColor" strokeWidth="1.6" className="text-cyan-500" />
    <line x1="12" y1="5.5" x2="12" y2="23.5" stroke="currentColor" strokeWidth="1.8" className="text-cyan-600" />
    <line x1="12" y1="1" x2="12" y2="19.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.5 1.5" opacity="0.6" className="text-cyan-400" />
    <polygon points="5,6 12,2.5 19,6 12,9.5" stroke="currentColor" strokeWidth="1.6" fill="none" className="text-orange-500" />
    <polygon points="5,12 12,8.5 19,12 12,15.5" stroke="currentColor" strokeWidth="1.6" fill="none" className="text-orange-500" />
    <polygon points="5,18 12,14.5 19,18 12,21.5" stroke="currentColor" strokeWidth="1.6" fill="none" className="text-orange-500" />
  </svg>
);

// Formattazione valuta e numeri identica al computo
const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: true }).format(val || 0);
};

const formatResult = (val: number | undefined | null) => {
  const value = val || 0;
  return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 3, useGrouping: true });
};

// Calcolo valore di riga misura identico al computo metrico
const calculateMeasRowValue = (m: Measurement): number => {
  if (m.type === 'subtotal') return 0;
  const hasDims = (m.length !== undefined && m.length !== 0) || 
                  (m.width !== undefined && m.width !== 0) || 
                  (m.height !== undefined && m.height !== 0);
  const hasMult = m.multiplier !== undefined && m.multiplier !== 0;

  if (!hasDims && !hasMult) return 0;

  const mult = hasMult ? m.multiplier! : 1;
  const l = (m.length === undefined || m.length === 0) ? 1 : m.length;
  const w = (m.width === undefined || m.width === 0) ? 1 : m.width;
  const h = (m.height === undefined || m.height === 0) ? 1 : m.height;
  const sign = m.type === 'deduction' ? -1 : 1;

  const base = hasDims ? (l * w * h) : 1;
  return base * mult * sign;
};

// Calcolo quantità totale di una voce da tutte le sue misure
const calculateArticleQuantity = (art: Article): number => {
  if (!art.measurements || art.measurements.length === 0) return art.quantity || 0;
  
  const validMeasurements = art.measurements.filter(m => 
    (m.description && m.description.trim() !== '') || 
    (m.multiplier !== undefined && m.multiplier !== 0) || 
    (m.length !== undefined && m.length !== 0) || 
    (m.width !== undefined && m.width !== 0) || 
    (m.height !== undefined && m.height !== 0) ||
    m.type === 'subtotal'
  );

  if (validMeasurements.length === 0) return art.quantity || 0;

  return validMeasurements.reduce((sum, m) => sum + calculateMeasRowValue(m), 0);
};

// Ricalcolo economico complessivo dell'analisi prezzi (Spese Generali e Utile d'Impresa)
export const calculateAnalysisFullTotals = (
  articles: Article[],
  anQty: number,
  sgRate: number,
  uiRate: number
) => {
  let matNet = 0, matInc = 0;
  let labNet = 0, labInc = 0;
  let eqNet = 0, eqInc = 0;

  articles.forEach(art => {
    if (art.isEnabled === false) return;
    const qty = calculateArticleQuantity(art);
    const amount = qty * (art.unitPrice || 0);
    const isInc = art.includesMarkup === true;

    if (art.categoryCode === 'MAT') {
      if (isInc) matInc += amount; else matNet += amount;
    } else if (art.categoryCode === 'MO') {
      if (isInc) labInc += amount; else labNet += amount;
    } else {
      if (isInc) eqInc += amount; else eqNet += amount;
    }
  });

  const totalMaterials = matNet + matInc;
  const totalLabor = labNet + labInc;
  const totalEquipment = eqNet + eqInc;

  const totalNetItems = matNet + labNet + eqNet;
  const totalInclusiveItems = matInc + labInc + eqInc;

  const sgFrac = sgRate / 100;
  const uiFrac = uiRate / 100;
  const compoundMultiplier = (1 + sgFrac) * (1 + uiFrac);

  const sgNet = totalNetItems * sgFrac;
  const uiNet = (totalNetItems + sgNet) * uiFrac;

  const baseInc = compoundMultiplier > 0 ? (totalInclusiveItems / compoundMultiplier) : totalInclusiveItems;
  const sgInc = baseInc * sgFrac;
  const uiInc = (baseInc + sgInc) * uiFrac;

  const costoTecnico = totalNetItems + baseInc;
  const valoreSpese = sgNet + sgInc;
  const valoreUtile = uiNet + uiInc;

  const totalBatchValue = totalNetItems + sgNet + uiNet + totalInclusiveItems;
  const effectiveBatchValue = totalNetItems + totalInclusiveItems > 0 ? totalBatchValue : 0;
  const refQty = anQty > 0 ? anQty : 1;
  const totalUnitPrice = effectiveBatchValue / refQty;
  const laborIncidence = effectiveBatchValue > 0 ? ((totalLabor / effectiveBatchValue) * 100) : 0;

  return {
    totalMaterials,
    totalLabor,
    totalEquipment,
    totalNetItems,
    totalInclusiveItems,
    costoTecnico,
    valoreSpese,
    valoreUtile,
    totalBatchValue: effectiveBatchValue,
    totalUnitPrice,
    laborIncidence
  };
};

// Conversione bidirezionale Article <-> AnalysisComponent per compatibilità assoluta
const convertArticleToComponent = (art: Article): AnalysisComponent => {
  const compType = art.categoryCode === 'MAT' ? 'material' : art.categoryCode === 'MO' ? 'labor' : 'equipment';
  return {
    id: art.id,
    type: compType,
    code: art.code,
    description: art.description,
    unit: art.unit,
    unitPrice: art.unitPrice || 0,
    quantity: art.quantity || 1,
    includesMarkup: art.includesMarkup ?? false,
    measurements: (art.measurements || []).map(m => ({
      id: m.id,
      description: m.description,
      multiplier: m.multiplier,
      length: m.length,
      width: m.width,
      height: m.height
    })),
    sourcePriceList: art.priceListSource
  };
};

// Sotto-componenti di input rapidi e sicuri (identici al computo metrico)
interface FastInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  initialValue: string;
  onCommit: (value: string) => void;
}

const FastInput: React.FC<FastInputProps> = ({ initialValue, onCommit, ...props }) => {
  const [val, setVal] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    setVal(initialValue);
    isDirtyRef.current = false;
  }, [initialValue]);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (props.onBlur) props.onBlur(e);
    if (isDirtyRef.current && val !== initialValue) {
      isDirtyRef.current = false;
      onCommit(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (props.onKeyDown) props.onKeyDown(e);
    if (e.key === 'Enter') {
      if (isDirtyRef.current && val !== initialValue) {
        isDirtyRef.current = false;
        onCommit(val);
      }
    }
  };

  return (
    <input
      ref={inputRef}
      {...props}
      value={val}
      onChange={(e) => {
        isDirtyRef.current = true;
        setVal(e.target.value);
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

interface FastTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  initialValue: string;
  onCommit: (value: string) => void;
}

const FastTextarea: React.FC<FastTextareaProps> = ({ initialValue, onCommit, ...props }) => {
  const [val, setVal] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDirtyRef = useRef(false);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(20, textareaRef.current.scrollHeight)}px`;
    }
  };

  useEffect(() => {
    setVal(initialValue);
    isDirtyRef.current = false;
    setTimeout(adjustHeight, 0);
  }, [initialValue]);

  useEffect(() => {
    adjustHeight();
  }, [val]);

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (props.onBlur) props.onBlur(e);
    if (isDirtyRef.current && val !== initialValue) {
      isDirtyRef.current = false;
      onCommit(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isDirtyRef.current && val !== initialValue) {
        isDirtyRef.current = false;
        onCommit(val);
      }
      if (props.onKeyDown) props.onKeyDown(e);
      return;
    }
    if (props.onKeyDown) props.onKeyDown(e);
  };

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      {...props}
      value={val}
      onChange={(e) => {
        isDirtyRef.current = true;
        setVal(e.target.value);
        adjustHeight();
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

interface FastNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  initialValue: number | undefined;
  onCommit: (value: number | undefined) => void;
}

const FastNumberInput: React.FC<FastNumberInputProps> = ({ initialValue, onCommit, ...props }) => {
  const [val, setVal] = useState(initialValue === undefined ? '' : initialValue.toString());
  const inputRef = useRef<HTMLInputElement>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    setVal(initialValue === undefined ? '' : initialValue.toString());
    isDirtyRef.current = false;
  }, [initialValue]);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (props.onBlur) props.onBlur(e);
    if (isDirtyRef.current) {
      const numVal = val === '' ? undefined : parseFloat(val);
      if (numVal !== initialValue) {
        isDirtyRef.current = false;
        onCommit(numVal);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (props.onKeyDown) props.onKeyDown(e);
    if (e.key === 'Enter') {
      if (isDirtyRef.current) {
        const numVal = val === '' ? undefined : parseFloat(val);
        if (numVal !== initialValue) {
          isDirtyRef.current = false;
          onCommit(numVal);
        }
      }
    }
  };

  return (
    <input
      ref={inputRef}
      {...props}
      type="number"
      value={val}
      onChange={(e) => {
        isDirtyRef.current = true;
        setVal(e.target.value);
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

// MODALE DI CONFIGURAZIONE RISORSA ANALITICA (INCIDENZA MANODOPERA & SPESE GENERALI / UTILE)
interface ResourceConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  article: Article;
  onSave: (updated: Article) => void;
}

const ResourceConfigModal: React.FC<ResourceConfigModalProps> = ({
  isOpen,
  onClose,
  article,
  onSave
}) => {
  const [code, setCode] = useState(article.code);
  const [description, setDescription] = useState(article.description);
  const [unit, setUnit] = useState(article.unit);
  const [unitPrice, setUnitPrice] = useState(article.unitPrice);
  const [laborRate, setLaborRate] = useState(article.laborRate ?? 0);
  const [includesMarkup, setIncludesMarkup] = useState(article.includesMarkup ?? false);

  useEffect(() => {
    setCode(article.code);
    setDescription(article.description);
    setUnit(article.unit);
    setUnitPrice(article.unitPrice);
    setLaborRate(article.laborRate ?? 0);
    setIncludesMarkup(article.includesMarkup ?? false);
  }, [article]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-gradient-to-r from-purple-700 to-indigo-800 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-purple-200" />
            <div>
              <h3 className="text-lg font-black uppercase tracking-wide">Configurazione Risorsa Analitica</h3>
              <p className="text-xs text-purple-200">Definisci l'incidenza della manodopera e i parametri contrattuali</p>
            </div>
          </div>
          <button onClick={onClose} className="text-purple-200 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Codice Tariffa</label>
              <input 
                type="text" 
                value={code} 
                onChange={e => setCode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:border-purple-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Unità di Misura</label>
              <select 
                value={unit} 
                onChange={e => setUnit(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-black font-mono text-slate-800 focus:bg-white focus:border-purple-500 outline-none"
              >
                {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Prezzo Unitario €</label>
              <input 
                type="number" 
                step="any"
                value={unitPrice} 
                onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-black text-purple-900 focus:bg-white focus:border-purple-500 outline-none text-right"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Designazione della Risorsa</label>
            <textarea 
              rows={3}
              value={description} 
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-semibold text-slate-800 focus:bg-white focus:border-purple-500 outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1" title="Percentuale di manodopera inclusa nella risorsa (Obbligo di Legge)">
                Incidenza Manodopera %
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  min="0" 
                  max="100" 
                  step="any"
                  value={laborRate} 
                  onChange={e => setLaborRate(parseFloat(e.target.value) || 0)}
                  className="w-24 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-blue-800 focus:bg-white focus:border-purple-500 outline-none text-center"
                />
                <span className="text-xs font-bold text-slate-600">%</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Obbligo di legge per congruità e sicurezza.</p>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                Condizione Economica Prezzario
              </label>
              <label className="flex items-start gap-2.5 mt-2 cursor-pointer bg-purple-50/50 p-2.5 rounded-xl border border-purple-200">
                <input 
                  type="checkbox" 
                  checked={includesMarkup} 
                  onChange={e => setIncludesMarkup(e.target.checked)}
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                />
                <div className="flex flex-col">
                  <span className="text-[11px] font-black text-purple-900 leading-tight">Comprensivo di S.G. e Utile</span>
                  <span className="text-[9px] text-slate-500">Lordo da prezzario ufficiale (S.G. e Utile già inclusi)</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Annulla
          </button>
          <button 
            onClick={() => {
              onSave({
                ...article,
                code,
                description,
                unit,
                unitPrice,
                laborRate,
                includesMarkup
              });
              onClose();
            }}
            className="bg-purple-700 hover:bg-purple-800 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wide shadow-md transition-all cursor-pointer flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Conferma e Salva</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const PriceAnalysisWorkspace: React.FC<PriceAnalysisWorkspaceProps> = ({
  analysis,
  onUpdateAnalysis,
  projectInfo,
  onImportToComputo,
  onDuplicateAnalysis,
  selectedGroupFilter = 'material',
  onSelectGroupFilter
}) => {
  const [dragOverCategory, setDragOverCategory] = useState<'MAT' | 'MO' | 'NOL' | null>(null);
  const [lastAddedMeasurementId, setLastAddedMeasurementId] = useState<string | null>(null);
  const [smartRepeatActiveId, setSmartRepeatActiveId] = useState<string | null>(null);
  const [recordingArticleId, setRecordingArticleId] = useState<string | null>(null);
  const [voiceActiveRowId, setVoiceActiveRowId] = useState<string | null>(null);
  const [voiceActiveField, setVoiceActiveField] = useState<string | null>(null);

  // Modale Configurazione Risorsa (Incidenza M.O. & S.G./Utile)
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Article | null>(null);

  // Modali Calcolatori Parametrici identici al Computo
  const [isRebarModalOpen, setIsRebarModalOpen] = useState(false);
  const [rebarTargetArticleId, setRebarTargetArticleId] = useState<string | null>(null);
  const [isPaintingModalOpen, setIsPaintingModalOpen] = useState(false);
  const [paintingTargetArticleId, setPaintingTargetArticleId] = useState<string | null>(null);

  // Normalizza gli articoli della tariffa analitica
  const articles: Article[] = useMemo(() => {
    if (analysis.articles && analysis.articles.length > 0) {
      return analysis.articles.map(art => ({
        ...art,
        quantity: calculateArticleQuantity(art)
      }));
    }
    if (analysis.components && analysis.components.length > 0) {
      return analysis.components.map(c => {
        const catCode = c.type === 'material' ? 'MAT' : c.type === 'labor' ? 'MO' : 'NOL';
        const meas: Measurement[] = (c.measurements && c.measurements.length > 0)
          ? c.measurements.map(m => ({
              id: m.id || Math.random().toString(36).substr(2, 9),
              description: m.description || '',
              multiplier: m.multiplier,
              length: m.length,
              width: m.width,
              height: m.height,
              type: 'positive' as const
            }))
          : [{ id: Math.random().toString(36).substr(2, 9), description: '', type: 'positive' as const }];

        return {
          id: c.id || Math.random().toString(36).substr(2, 9),
          categoryCode: catCode,
          code: c.code || (catCode === 'MAT' ? 'MAT.01' : catCode === 'MO' ? 'MO.01' : 'NOL.01'),
          description: c.description || 'Risorsa analitica',
          unit: c.unit || (catCode === 'MO' ? 'h' : 'm³'),
          unitPrice: c.unitPrice || 0,
          laborRate: catCode === 'MO' ? 100 : 0,
          measurements: meas,
          quantity: c.quantity || 1,
          includesMarkup: c.includesMarkup ?? false,
          priceListSource: c.sourcePriceList
        } as Article;
      });
    }
    return [];
  }, [analysis]);

  const totals = useMemo(() => {
    return calculateAnalysisFullTotals(
      articles,
      analysis.analysisQuantity || 1,
      analysis.generalExpensesRate ?? 15,
      analysis.profitRate ?? 10
    );
  }, [articles, analysis.analysisQuantity, analysis.generalExpensesRate, analysis.profitRate]);

  const syncAnalysis = (nextArticles: Article[], partialUpdates?: Partial<PriceAnalysis>) => {
    const calculatedArts = nextArticles.map(a => ({
      ...a,
      quantity: calculateArticleQuantity(a)
    }));

    const calculatedEconomics = calculateAnalysisFullTotals(
      calculatedArts,
      (partialUpdates?.analysisQuantity !== undefined ? partialUpdates.analysisQuantity : analysis.analysisQuantity) || 1,
      (partialUpdates?.generalExpensesRate !== undefined ? partialUpdates.generalExpensesRate : (analysis.generalExpensesRate ?? 15)),
      (partialUpdates?.profitRate !== undefined ? partialUpdates.profitRate : (analysis.profitRate ?? 10))
    );

    const components = calculatedArts.map(convertArticleToComponent);

    const updated: PriceAnalysis = {
      ...analysis,
      ...partialUpdates,
      articles: calculatedArts,
      components,
      totalMaterials: calculatedEconomics.totalMaterials,
      totalLabor: calculatedEconomics.totalLabor,
      totalEquipment: calculatedEconomics.totalEquipment,
      costoTecnico: calculatedEconomics.costoTecnico,
      totalNetItems: calculatedEconomics.totalNetItems,
      totalInclusiveItems: calculatedEconomics.totalInclusiveItems,
      valoreSpese: calculatedEconomics.valoreSpese,
      valoreUtile: calculatedEconomics.valoreUtile,
      totalBatchValue: calculatedEconomics.totalBatchValue,
      totalUnitPrice: calculatedEconomics.totalUnitPrice
    };

    onUpdateAnalysis(updated);
  };

  const handleUpdateGeneralField = <K extends keyof PriceAnalysis>(field: K, value: PriceAnalysis[K]) => {
    syncAnalysis(articles, { [field]: value });
  };

  const handleAddArticle = (categoryCode: 'MAT' | 'MO' | 'NOL') => {
    const newArtId = 'art_' + Math.random().toString(36).substr(2, 9);
    const newMeasId = 'meas_' + Math.random().toString(36).substr(2, 9);

    const catArticles = articles.filter(a => a.categoryCode === categoryCode);
    const nextNum = (catArticles.length + 1).toString().padStart(2, '0');

    let defaultCode = '';
    let defaultDesc = '';
    let defaultUnit = 'm³';

    if (categoryCode === 'MAT') {
      defaultCode = `MAT.${nextNum}`;
      defaultDesc = 'Nuovo materiale / fornitura a piè d\'opera';
      defaultUnit = 'm³';
    } else if (categoryCode === 'MO') {
      defaultCode = `MO.${nextNum}`;
      defaultDesc = 'Operaio specializzato / squadra di posa';
      defaultUnit = 'h';
    } else {
      defaultCode = `NOL.${nextNum}`;
      defaultDesc = 'Nolo macchinario / attrezzatura di cantiere';
      defaultUnit = 'h';
    }

    const newArticle: Article = {
      id: newArtId,
      categoryCode,
      code: defaultCode,
      description: defaultDesc,
      unit: defaultUnit,
      unitPrice: 0,
      laborRate: categoryCode === 'MO' ? 100 : 0,
      measurements: [
        { id: newMeasId, description: '', type: 'positive' }
      ],
      quantity: 1,
      includesMarkup: false
    };

    setEditingResource(newArticle);
    setIsResourceModalOpen(true);
  };

  const handleUpdateArticle = (artId: string, field: keyof Article, value: any) => {
    const updated = articles.map(art => {
      if (art.id !== artId) return art;
      return { ...art, [field]: value };
    });
    syncAnalysis(updated);
  };

  const handleDeleteArticle = (artId: string) => {
    const updated = articles.filter(art => art.id !== artId);
    syncAnalysis(updated);
  };

  const handleDuplicateArticle = (art: Article) => {
    const newArtId = 'art_' + Math.random().toString(36).substr(2, 9);
    const duplicated: Article = {
      ...art,
      id: newArtId,
      code: `${art.code}.bis`,
      measurements: (art.measurements || []).map(m => ({
        ...m,
        id: 'meas_' + Math.random().toString(36).substr(2, 9)
      }))
    };
    syncAnalysis([...articles, duplicated]);
  };

  const handleToggleArticleEnabled = (artId: string) => {
    const updated = articles.map(art => {
      if (art.id !== artId) return art;
      return { ...art, isEnabled: art.isEnabled === false ? true : false };
    });
    syncAnalysis(updated);
  };

  const handleToggleArticleLock = (artId: string) => {
    const updated = articles.map(art => {
      if (art.id !== artId) return art;
      return { ...art, isLocked: !art.isLocked };
    });
    syncAnalysis(updated);
  };

  const handleAddMeasurement = (artId: string) => {
    const newMeasId = 'meas_' + Math.random().toString(36).substr(2, 9);
    const updated = articles.map(art => {
      if (art.id !== artId) return art;
      const newM: Measurement = {
        id: newMeasId,
        description: '',
        type: 'positive'
      };
      return { ...art, measurements: [...(art.measurements || []), newM] };
    });
    syncAnalysis(updated);
    setLastAddedMeasurementId(newMeasId);
  };

  const handleAddSubtotal = (artId: string) => {
    const newMeasId = 'meas_' + Math.random().toString(36).substr(2, 9);
    const updated = articles.map(art => {
      if (art.id !== artId) return art;
      const newM: Measurement = {
        id: newMeasId,
        description: 'Sommano parziale',
        type: 'subtotal'
      };
      return { ...art, measurements: [...(art.measurements || []), newM] };
    });
    syncAnalysis(updated);
  };

  const handleUpdateMeasurement = (artId: string, measId: string, field: keyof Measurement, value: any) => {
    const updated = articles.map(art => {
      if (art.id !== artId) return art;
      const nextMeas = (art.measurements || []).map(m => {
        if (m.id !== measId) return m;
        return { ...m, [field]: value };
      });
      return { ...art, measurements: nextMeas };
    });
    syncAnalysis(updated);
  };

  const handleDeleteMeasurement = (artId: string, measId: string) => {
    const updated = articles.map(art => {
      if (art.id !== artId) return art;
      const nextMeas = (art.measurements || []).filter(m => m.id !== measId);
      return { ...art, measurements: nextMeas };
    });
    syncAnalysis(updated);
  };

  const handleToggleDeduction = (artId: string, measId: string) => {
    const updated = articles.map(art => {
      if (art.id !== artId) return art;
      const nextMeas = (art.measurements || []).map(m => {
        if (m.id !== measId) return m;
        const newType: 'positive' | 'deduction' = m.type === 'deduction' ? 'positive' : 'deduction';
        let newDesc = m.description;
        const prefix = 'A dedurre: ';
        if (newType === 'deduction') {
          if (!newDesc.startsWith(prefix)) newDesc = prefix + newDesc;
        } else {
          if (newDesc.startsWith(prefix)) newDesc = newDesc.substring(prefix.length);
        }
        return { ...m, type: newType, description: newDesc };
      });
      return { ...art, measurements: nextMeas };
    });
    syncAnalysis(updated);
  };

  const handleToggleSmartRepeat = (artId: string) => {
    if (smartRepeatActiveId === artId) {
      setSmartRepeatActiveId(null);
    } else {
      setSmartRepeatActiveId(artId);
      const art = articles.find(a => a.id === artId);
      if (art && art.measurements && art.measurements.length > 0) {
        const lastM = art.measurements[art.measurements.length - 1];
        if (lastM.type !== 'subtotal') {
          const newMeasId = 'meas_' + Math.random().toString(36).substr(2, 9);
          const clonedM: Measurement = {
            ...lastM,
            id: newMeasId
          };
          const updated = articles.map(a => a.id === artId ? { ...a, measurements: [...a.measurements, clonedM] } : a);
          syncAnalysis(updated);
          setLastAddedMeasurementId(newMeasId);
        }
      }
    }
  };

  const handleMeasKeyDown = (e: React.KeyboardEvent, artId: string, mId: string, currentField: string, isLastRow: boolean) => {
    const art = articles.find(a => a.id === artId);
    if (!art) return;
    const measurements = art.measurements || [];
    const rowIdx = measurements.findIndex(m => m.id === mId);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIdx < measurements.length - 1) {
        const nextRowId = measurements[rowIdx + 1].id;
        const target = document.querySelector(`[data-m-id="${nextRowId}"][data-field="${currentField}"]`) as HTMLElement;
        if (target) target.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIdx > 0) {
        const prevRowId = measurements[rowIdx - 1].id;
        const target = document.querySelector(`[data-m-id="${prevRowId}"][data-field="${currentField}"]`) as HTMLElement;
        if (target) target.focus();
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const fields = ['description', 'multiplier', 'length', 'width', 'height'];
      const fieldIdx = fields.indexOf(currentField);
      if (fieldIdx >= 0 && fieldIdx < fields.length - 1) {
        const nextField = fields[fieldIdx + 1];
        const target = document.querySelector(`[data-m-id="${mId}"][data-field="${nextField}"]`) as HTMLElement;
        if (target) target.focus();
      } else {
        // reached height (last field of row)
        if (rowIdx < measurements.length - 1) {
          const nextRowId = measurements[rowIdx + 1].id;
          const target = document.querySelector(`[data-m-id="${nextRowId}"][data-field="description"]`) as HTMLElement;
          if (target) target.focus();
        } else {
          handleAddMeasurement(artId);
        }
      }
    }
  };

  const handleDropItem = (e: React.DragEvent, targetCategory?: 'MAT' | 'MO' | 'NOL') => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCategory(null);

    const rawText = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
    if (!rawText) return;

    try {
      const parsed = parseDroppedContent(rawText);
      if (parsed) {
        let resolvedCategory: 'MAT' | 'MO' | 'NOL' = targetCategory || 'MAT';
        if (!targetCategory) {
          const descLower = (parsed.description || '').toLowerCase();
          if (descLower.includes('operaio') || descLower.includes('manovale') || descLower.includes('squadra') || descLower.includes('posa') || descLower.includes('ore')) {
            resolvedCategory = 'MO';
          } else if (descLower.includes('nolo') || descLower.includes('escavatore') || descLower.includes('gru') || descLower.includes('autocarro') || descLower.includes('attrezzatura') || descLower.includes('betoniera')) {
            resolvedCategory = 'NOL';
          }
        }

        const newArtId = 'art_' + Math.random().toString(36).substr(2, 9);
        const newMeasId = 'meas_' + Math.random().toString(36).substr(2, 9);

        const newArticle: Article = {
          id: newArtId,
          categoryCode: resolvedCategory,
          code: parsed.code || (resolvedCategory === 'MAT' ? 'MAT.01' : resolvedCategory === 'MO' ? 'MO.01' : 'NOL.01'),
          description: parsed.description || 'Voce importata da prezzario regionale',
          unit: parsed.unit || (resolvedCategory === 'MO' ? 'h' : 'm³'),
          unitPrice: parsed.unitPrice || 0,
          laborRate: parsed.laborRate !== undefined && !isNaN(parsed.laborRate) ? parsed.laborRate : (resolvedCategory === 'MO' ? 100 : 0),
          measurements: [
            { id: newMeasId, description: '', type: 'positive' }
          ],
          quantity: 1,
          includesMarkup: true,
          priceListSource: parsed.priceListSource || 'Prezzario Regionale'
        };

        setEditingResource(newArticle);
        setIsResourceModalOpen(true);
      }
    } catch (err) {
      console.error("Errore drag & drop in analisi:", err);
    }
  };

  const materialArticles = useMemo(() => articles.filter(a => a.categoryCode === 'MAT'), [articles]);
  const laborArticles = useMemo(() => articles.filter(a => a.categoryCode === 'MO'), [articles]);
  const equipmentArticles = useMemo(() => articles.filter(a => a.categoryCode === 'NOL'), [articles]);

  const groupsConfig = [
    {
      key: 'material' as const,
      catCode: 'MAT' as const,
      code: '1.00',
      title: 'MATERIALI E FORNITURE',
      shortTitle: 'Materiale',
      color: '#EA580C',
      icon: Package,
      items: materialArticles,
      total: totals.totalMaterials
    },
    {
      key: 'labor' as const,
      catCode: 'MO' as const,
      code: '2.00',
      title: 'MANODOPERA ED OPERAI',
      shortTitle: 'Manodopera',
      color: '#2563EB',
      icon: Hammer,
      items: laborArticles,
      total: totals.totalLabor
    },
    {
      key: 'equipment' as const,
      catCode: 'NOL' as const,
      code: '3.00',
      title: 'NOLI E TRASPORTI',
      shortTitle: 'Nolo',
      color: '#059669',
      icon: Truck,
      items: equipmentArticles,
      total: totals.totalEquipment
    }
  ];

  const activeGroupKey = selectedGroupFilter || 'material';
  const activeGroup = groupsConfig.find(g => g.key === activeGroupKey) || groupsConfig[0];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f4f6f8] overflow-hidden select-none font-sans">
      {/* 1. TESTATA SUPERIORE DELLA VOCE ANALIZZATA (PROGETTO & PREZZO UNITARIO RISULTANTE) */}
      <div className="bg-white border-b-2 border-purple-200 px-6 py-4 shadow-sm flex flex-col gap-3 flex-shrink-0 z-30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            {/* BADGE CODICE TARIFFARIO EDITABILE */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <span className="text-[9px] font-black uppercase text-purple-700 tracking-wider">Tariffa N.P.</span>
              <FastInput
                initialValue={analysis.code || 'AP.01'}
                onCommit={(val) => handleUpdateGeneralField('code', val)}
                className="bg-purple-900 text-white font-mono font-black text-xl px-3 py-1.5 rounded-xl shadow-md border-2 border-purple-700 text-center w-28 focus:outline-none focus:ring-2 focus:ring-purple-400"
                title="Codice Nuovo Prezzo (es. AP.01)"
              />
            </div>

            {/* DESIGNAZIONE DEL NUOVO PREZZO UNITARIO */}
            <div className="flex-1 flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Designazione del Nuovo Prezzo Unitario
                </span>
                <span className="text-[9px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full border border-purple-200">
                  Computo Analitico a 3 Gruppi (D.Lgs. 36/2023)
                </span>
              </div>
              <FastTextarea
                initialValue={analysis.description || ''}
                onCommit={(val) => handleUpdateGeneralField('description', val)}
                rows={2}
                placeholder="Descrizione completa dell'opera finita in ogni sua parte, compresi materiali, manodopera, noli e trasporti..."
                className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-purple-500 rounded-xl p-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-200 transition-all resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* PARAMETRI LOTTO E PREZZO UNITARIO RISULTANTE */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* PARAMETRI LOTTO RIFERIMENTO */}
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-2xl flex items-center gap-3 shadow-2xs">
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase text-slate-500">Unità di Misura</span>
                <select
                  value={analysis.unit || 'm³'}
                  onChange={(e) => handleUpdateGeneralField('unit', e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-black font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {COMMON_UNITS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div className="w-px h-8 bg-slate-200"></div>

              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase text-slate-500">Quantità Lotto</span>
                <FastNumberInput
                  initialValue={analysis.analysisQuantity || 1}
                  onCommit={(val) => handleUpdateGeneralField('analysisQuantity', val || 1)}
                  min="0.001"
                  step="any"
                  className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-black font-mono text-purple-900 w-20 text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
                  title="Quantità del lotto analizzato (es. 1 m³ o 100 m²)"
                />
              </div>

              <div className="w-px h-8 bg-slate-200"></div>

              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase text-slate-500">S.G. %</span>
                <FastNumberInput
                  initialValue={analysis.generalExpensesRate ?? 15}
                  onCommit={(val) => handleUpdateGeneralField('generalExpensesRate', val ?? 15)}
                  min="0"
                  max="100"
                  className="bg-white border border-slate-300 rounded-lg px-1.5 py-1 text-xs font-bold font-mono text-slate-700 w-14 text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
                  title="Aliquota Spese Generali (standard 15%)"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase text-slate-500">Utile %</span>
                <FastNumberInput
                  initialValue={analysis.profitRate ?? 10}
                  onCommit={(val) => handleUpdateGeneralField('profitRate', val ?? 10)}
                  min="0"
                  max="100"
                  className="bg-white border border-slate-300 rounded-lg px-1.5 py-1 text-xs font-bold font-mono text-slate-700 w-14 text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
                  title="Aliquota Utile d'Impresa (standard 10%)"
                />
              </div>
            </div>

            {/* HERO BOX PREZZO UNITARIO RISULTANTE IN EVIDENZA */}
            <div className="bg-gradient-to-br from-purple-700 to-indigo-800 text-white p-3 px-5 rounded-2xl shadow-xl flex flex-col items-end min-w-[170px]">
              <span className="text-[9px] font-black uppercase tracking-wider text-purple-200">
                Nuovo Prezzo Unitario
              </span>
              <span className="text-2xl font-black font-mono tracking-tight leading-none text-white my-0.5">
                {formatCurrency(totals.totalUnitPrice)}
              </span>
              <span className="text-[9px] font-bold text-purple-300 uppercase">
                a {analysis.unit || 'm³'}
              </span>
            </div>

            {/* AZIONI VELOCI SULL'ANALISI */}
            <div className="flex flex-col gap-1.5">
              {onImportToComputo && (
                <button
                  onClick={() => onImportToComputo(analysis)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] px-3.5 py-1.5 rounded-xl shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  title="Importa questo prezzo analizzato nel computo metrico dei lavori"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Importa nel Computo</span>
                </button>
              )}
              <button
                onClick={() => generateAnalisiPrezziPdf(projectInfo, [analysis])}
                className="bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-300 hover:border-purple-300 font-bold uppercase text-[10px] px-3.5 py-1.5 rounded-xl shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                title="Stampa Scheda Analisi Prezzo Ufficiale (.PDF contrattuale con firme)"
              >
                <FileText className="w-3.5 h-3.5 text-purple-600" />
                <span>Stampa Scheda PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* BARRA TABS SELETTORE RAPIDO DEI 3 GRUPPI (MENU A TENDINA COME IL COMPUTO SEMPLICE) */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
              <Layers className="w-3 h-3 text-purple-600" /> Gruppo Attivo:
            </span>
            {groupsConfig.map(g => {
              const Icon = g.icon;
              const isSelected = activeGroupKey === g.key;
              return (
                <button
                  key={g.key}
                  onClick={() => onSelectGroupFilter?.(g.key)}
                  className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  style={{ backgroundColor: isSelected ? g.color : undefined }}
                >
                  <Icon className="w-3 h-3" />
                  <span>{g.code} {g.shortTitle}</span>
                  <span className={`font-mono text-[9px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-black/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {g.items.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
            <span>Costo Tecnico: <b className="text-purple-900">{formatCurrency(totals.costoTecnico)}</b></span>
            <span>•</span>
            <span>Incidenza M.O.: <b className="text-blue-700">{totals.laborIncidence.toFixed(1)}%</b></span>
          </div>
        </div>
      </div>

      {/* 2. AREA DI COMPUTAZIONE IDENTICA AL COMPUTO METRICO (CON INTESTAZIONE FISSA E RIGA SOMMANO IN BASSO) */}
      <div className="flex-1 flex flex-col overflow-hidden px-6 pt-4 pb-6">
        <div 
          className={`flex flex-col bg-slate-50 rounded-3xl border-2 shadow-sm overflow-hidden flex-1 transition-all ${
            dragOverCategory === activeGroup.catCode ? 'border-purple-500 ring-4 ring-purple-300 bg-purple-50/30' : 'border-slate-300'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOverCategory(activeGroup.catCode); }}
          onDragLeave={() => setDragOverCategory(null)}
          onDrop={(e) => handleDropItem(e, activeGroup.catCode)}
        >
          {/* TESTATA DI GRUPPO FISSA IN ALTO */}
          <div className="flex items-center justify-between p-5 bg-slate-50 rounded-t-3xl border-b-2 border-slate-300 shadow-xs z-20 flex-shrink-0">
            <div className="flex items-center gap-5">
              <div className="flex flex-col items-center gap-2">
                <div 
                  className="px-4 py-2.5 rounded-2xl font-black text-2xl shadow-inner text-white w-[145px] text-center transition-all duration-300"
                  style={{ backgroundColor: activeGroup.color }}
                >
                  {activeGroup.code}
                </div>
                <div className="border px-3 py-1 rounded-full flex items-center gap-1.5 font-black text-[10px] uppercase shadow-xs bg-white text-slate-700 border-slate-200">
                  <activeGroup.icon className="w-3 h-3 text-slate-600" />
                  <span>{activeGroup.items.length} {activeGroup.items.length === 1 ? 'Voce' : 'Voci'}</span>
                </div>
              </div>

              <div className="flex flex-col ml-6 justify-center">
                <div className="flex items-center gap-3">
                  <h2 
                    className="text-2xl font-black uppercase max-w-[550px] whitespace-normal leading-tight tracking-tight"
                    style={{ color: activeGroup.color }}
                  >
                    {activeGroup.title}
                  </h2>
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <span 
                    className="text-3xl font-mono font-black"
                    style={{ color: activeGroup.color }}
                  >
                    {formatCurrency(activeGroup.total)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <a 
                href="https://www.gecola.it/home/listini" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="bg-white border-2 border-slate-300 hover:border-purple-400 px-4 py-3 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-sm text-slate-600 hover:text-purple-700 transition-all cursor-pointer"
                title="Apri prezzari ufficiali regionali su gecola.it"
              >
                <Database className="w-4 h-4 text-purple-600" />
                <span>Prezzari Ufficiali</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-50" />
              </a>

              <button
                onClick={() => handleAddArticle(activeGroup.catCode)}
                className="px-6 py-3.5 rounded-2xl font-black uppercase text-xs flex items-center gap-2 shadow-lg transition-all active:scale-95 text-white cursor-pointer"
                style={{ backgroundColor: activeGroup.color }}
                title={`Aggiungi nuova risorsa a ${activeGroup.title}`}
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>+ Voce {activeGroup.shortTitle}</span>
              </button>
            </div>
          </div>

          {/* BARRA INTESTAZIONI TABELLA FISSA E IMMOBILE */}
          <div className="bg-slate-100 border-b-2 border-slate-300 z-10 flex-shrink-0 select-none shadow-xs">
            <table className="w-full text-left border-separate border-spacing-0 table-fixed bg-slate-100">
              <colgroup>
                <col style={{ width: '46px' }} />
                <col style={{ width: '135px' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: '44px' }} />
                <col style={{ width: '54px' }} />
                <col style={{ width: '54px' }} />
                <col style={{ width: '54px' }} />
                <col style={{ width: '74px' }} />
                <col style={{ width: '84px' }} />
                <col style={{ width: '96px' }} />
                <col style={{ width: '110px' }} />
              </colgroup>
              <thead className="select-none">
                <tr className="text-[10px] uppercase font-bold tracking-wider text-slate-700">
                  <th className="bg-slate-100 py-3 px-2 text-center border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">N.</th>
                  <th className="bg-slate-100 py-3 px-2.5 text-left border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">Tariffa</th>
                  <th className="bg-slate-100 py-3 px-3 text-left border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">
                    <span>Designazione dei Lavori (Elementi e Risorse)</span>
                  </th>
                  <th className="bg-slate-100 py-3 px-1 text-center border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">Par.Ug.</th>
                  <th className="bg-slate-100 py-3 px-1 text-center border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">Lung.</th>
                  <th className="bg-slate-100 py-3 px-1 text-center border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">Larg.</th>
                  <th className="bg-slate-100 py-3 px-1 text-center border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">H/Peso</th>
                  <th className="bg-slate-200 py-3 px-2 text-center border-r border-b-2 border-slate-300 font-extrabold text-slate-800 shadow-[inset_0_-2px_0_#94a3b8]">Quantità</th>
                  <th className="bg-slate-100 py-3 px-2 text-right border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">Prezzo €</th>
                  <th className="bg-slate-100 py-3 px-2 text-right border-r border-b-2 border-slate-300 shadow-[inset_0_-2px_0_#cbd5e1]">Importo €</th>
                  <th className="bg-purple-100 py-3 px-2 text-center text-purple-950 font-extrabold shadow-[inset_0_-2px_0_#d8b4fe]">Incidenza M.O. / Config</th>
                </tr>
              </thead>
            </table>
          </div>

          {/* CORPO DELLA TABELLA DELLE VOCI SCORREVOLE (CON RIGA SOMMANO IN BASSO COME IL COMPUTO) */}
          <div className="flex-1 overflow-y-auto bg-white scrollbar-hide pb-32">
            {activeGroup.items.length === 0 ? (
              <div 
                onClick={() => handleAddArticle(activeGroup.catCode)}
                className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 m-8 rounded-3xl hover:border-purple-400 hover:bg-purple-50/20 cursor-pointer transition-all"
              >
                <activeGroup.icon className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-bold text-slate-600">Nessuna risorsa presente in {activeGroup.title}.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Clicca qui o su <b style={{ color: activeGroup.color }}>+ Voce {activeGroup.shortTitle}</b> per iniziare, oppure trascina una voce da prezzario regionale.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-separate border-spacing-0 table-fixed bg-white">
                <colgroup>
                  <col style={{ width: '46px' }} />
                  <col style={{ width: '135px' }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: '44px' }} />
                  <col style={{ width: '54px' }} />
                  <col style={{ width: '54px' }} />
                  <col style={{ width: '54px' }} />
                  <col style={{ width: '74px' }} />
                  <col style={{ width: '84px' }} />
                  <col style={{ width: '96px' }} />
                  <col style={{ width: '110px' }} />
                </colgroup>

                {activeGroup.items.map((art, artIdx) => {
                  const isArticleDisabled = art.isEnabled === false;
                  const isArticleLocked = art.isLocked || false;
                  const hierarchicalNumber = `${activeGroup.code}.${artIdx + 1}`;
                  const totalAmount = (art.quantity || 0) * (art.unitPrice || 0);

                  let runningPartialSum = 0;
                  const processedMeasurements = (art.measurements || []).map(m => {
                    const val = calculateMeasRowValue(m);
                    let displayValue = 0;
                    if (m.type === 'subtotal') {
                      displayValue = runningPartialSum;
                      runningPartialSum = 0;
                    } else {
                      displayValue = val;
                      runningPartialSum += val;
                    }
                    return { ...m, calculatedValue: val, displayValue };
                  });

                  return (
                    <tbody 
                      key={art.id}
                      id={`article-block-${art.id}`}
                      className={`article-block group/article transition-all border-b-2 border-slate-200 ${
                        isArticleDisabled ? 'opacity-60 bg-amber-50/20' : ''
                      }`}
                    >
                      {/* RIGA 1: TESTATA VOCE CON QUANTITÀ VUOTA IN ALTO E PULSANTI CALCOLATORI PARAMETRICI ESATTI DEL COMPUTO */}
                      <tr className={`align-top article-header-row bg-gradient-to-r from-blue-50/40 via-white to-slate-50/30 border-t-2 border-t-blue-500`}>
                        {/* N. IDENTIFICATIVO E TOGGLE ATTIVA/SPENTA */}
                        <td className="text-center py-2 px-1.5 border-r border-slate-200 bg-slate-50/60">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleToggleArticleEnabled(art.id)}
                              className={`p-1 rounded-lg transition-all ${
                                isArticleDisabled
                                  ? 'bg-amber-500 text-white shadow hover:bg-amber-600 scale-105 ring-2 ring-amber-300'
                                  : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                              }`}
                              title={isArticleDisabled ? "Risorsa disattivata. Clicca per attivare" : "Risorsa attiva. Clicca per spegnere"}
                            >
                              {isArticleDisabled ? <PowerOff className="w-3.5 h-3.5 text-white" /> : <Power className="w-3.5 h-3.5" />}
                            </button>
                            <span className={isArticleDisabled ? 'object-id-badge bg-amber-200 text-amber-900 border-amber-300' : 'object-id-badge'}>
                              {artIdx + 1}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 font-mono tracking-tight">
                              {hierarchicalNumber}
                            </span>
                          </div>
                        </td>

                        {/* TARIFFA */}
                        <td className="p-1.5 border-r border-slate-200 align-top bg-white">
                          <div className="flex flex-col relative">
                            <FastTextarea
                              initialValue={art.code}
                              onCommit={(val) => handleUpdateArticle(art.id, 'code', val)}
                              className="font-mono font-bold text-xs w-full bg-slate-50 rounded border border-slate-200/80 px-1.5 py-0.5 resize-none leading-tight text-slate-800 focus:bg-white focus:border-purple-500 outline-none"
                              rows={1}
                              placeholder="Codice..."
                            />
                            {art.priceListSource && (
                              <div className="text-[9px] text-purple-600 font-sans px-1 mt-1 leading-tight truncate" title={art.priceListSource}>
                                {art.priceListSource}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* DESIGNAZIONE DEI LAVORI */}
                        <td className="p-2 border-r border-slate-200 bg-white">
                          <FastTextarea
                            initialValue={art.description}
                            onCommit={(val) => handleUpdateArticle(art.id, 'description', val)}
                            rows={2}
                            className="w-full font-sans font-semibold text-justify border-none focus:ring-0 bg-transparent resize-y p-0.5 text-blue-600 leading-relaxed text-[14.5px] outline-none"
                            placeholder="Descrizione elemento o risorsa..."
                          />
                        </td>

                        {/* CONTROLLI AZIONI RAPIDE */}
                        <td className="border-r border-slate-200 bg-slate-50/40 p-1 text-center align-top">
                          <div className="flex flex-col items-center gap-1 mt-1">
                            <button 
                              onClick={() => handleToggleArticleLock(art.id)} 
                              className={`transition-all p-1 rounded-md ${
                                isArticleLocked 
                                  ? 'text-red-500 hover:text-red-700 bg-red-50 border border-red-200' 
                                  : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100'
                              }`} 
                              title={isArticleLocked ? "Sblocca voce" : "Blocca voce"}
                            >
                              {isArticleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>
                            <button 
                              onClick={() => { setEditingResource(art); setIsResourceModalOpen(true); }}
                              className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors p-1 rounded-md" 
                              title="Modifica Dettagli e Incidenza"
                            >
                              <PenLine className="w-3.5 h-3.5" />
                            </button>
                            <div className="opacity-0 group-hover/article:opacity-100 transition-opacity flex flex-col items-center gap-1">
                              <button 
                                onClick={() => handleDuplicateArticle(art)} 
                                className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors p-1 rounded-md" 
                                title="Duplica voce"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteArticle(art.id)} 
                                className="text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors p-1 rounded-md" 
                                title="Elimina voce"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* COLONNE CENTRALI E QUANTITÀ/PREZZO/IMPORTO VUOTE IN ALTO (NON RIDONDANTI) */}
                        <td colSpan={6} className="border-r border-slate-200 bg-slate-50/20"></td>

                        {/* INCIDENZA MANODOPERA & PULSANTE CONFIGURAZIONE */}
                        <td className="p-2 text-center align-top bg-purple-50/20">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200" title="Incidenza Manodopera %">
                              MO: {art.laborRate ?? 0}%
                            </span>
                            <button
                              onClick={() => { setEditingResource(art); setIsResourceModalOpen(true); }}
                              className="w-full py-1 px-1.5 rounded-lg text-[9px] font-black uppercase bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer"
                              title="Configura parametri economici e incidenza manodopera della risorsa"
                            >
                              <Settings className="w-3 h-3 text-purple-700" />
                              <span>Configura</span>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* RIGA 2: BARRA "MISURAZIONI & SVILUPPO" CON TUTTI I PULSANTI DEL COMPUTO (ARMATURE 3D, PITTURAZIONI, SMART REPEAT, RIGO) */}
                      <tr className="bg-slate-50/90 border-y border-slate-200">
                        <td className="border-r border-slate-200 bg-slate-50/50"></td>
                        <td className="border-r border-slate-200 bg-slate-50/50"></td>
                        <td className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider border-r border-slate-200 bg-white/70 flex items-center justify-between text-blue-700">
                          <span className="flex items-center gap-1.5 font-bold">
                            <Layers className="w-3.5 h-3.5 opacity-70" />
                            MISURAZIONI & SVILUPPO:
                          </span>
                          <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/80">
                            {/* CALCOLO PARAMETRICO ARMATURE 3D */}
                            <button 
                              onClick={() => { setRebarTargetArticleId(art.id); setIsRebarModalOpen(true); }}
                              className="p-1 rounded transition-all hover:text-orange-500 hover:bg-white text-slate-500 group relative"
                              title="Calcolo Parametrico Armature 3D & Staffe (Pilastrino / Trave)"
                            >
                              <RebarCagePillarIcon className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                            </button>

                            {/* CALCOLO AUTOMATICO PITTURAZIONI */}
                            <button 
                              onClick={() => { setPaintingTargetArticleId(art.id); setIsPaintingModalOpen(true); }}
                              className="p-1 rounded transition-colors hover:text-blue-600 hover:bg-white text-slate-500"
                              title="Calcolo Automatico Pitturazioni e Superfici"
                            >
                              <Paintbrush className="w-3.5 h-3.5" />
                            </button>

                            {/* SMART REPEAT */}
                            <button 
                              onClick={() => handleToggleSmartRepeat(art.id)}
                              className={`p-1 rounded transition-all ${
                                smartRepeatActiveId === art.id 
                                  ? 'bg-blue-600 text-white shadow' 
                                  : 'text-slate-500 hover:text-blue-600 hover:bg-white'
                              }`}
                              title="Smart Repeat (Clona rigo precedente)"
                            >
                              <CopyPlus className="w-3.5 h-3.5" />
                            </button>

                            {/* DETTATURA VOCALE / CUFFIA */}
                            <button
                              onClick={() => {
                                if (recordingArticleId === art.id) {
                                  setRecordingArticleId(null);
                                } else {
                                  setRecordingArticleId(art.id);
                                  if (!art.measurements || art.measurements.length === 0) {
                                    handleAddMeasurement(art.id);
                                  }
                                }
                              }}
                              className={`p-1 rounded transition-all flex items-center gap-1 ${
                                recordingArticleId === art.id 
                                  ? 'bg-purple-600 text-white animate-pulse shadow-md ring-2 ring-purple-300' 
                                  : 'text-slate-500 hover:text-purple-600 hover:bg-white'
                              }`}
                              title={recordingArticleId === art.id ? "Dettatura Vocale ATTIVA. Clicca per disattivare" : "Attiva Dettatura Vocale Continua (Cuffie / Microfono)"}
                            >
                              <Headset className="w-3.5 h-3.5" />
                              {recordingArticleId === art.id && (
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping"></span>
                              )}
                            </button>

                            {/* AGGIUNTA RAPIDA RIGO MISURA */}
                            <button
                              onClick={() => handleAddMeasurement(art.id)}
                              className="p-1 rounded text-slate-500 hover:text-purple-700 hover:bg-white transition-all font-bold text-[9px] flex items-center gap-0.5 ml-1 px-1.5"
                              title="Aggiungi rigo di misura"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Rigo</span>
                            </button>
                          </div>
                        </td>
                        <td colSpan={8} className="border-r border-slate-200 bg-slate-50/50"></td>
                      </tr>

                      {/* RIGHE DI MISURA (ESATTAMENTE LA STESSA GRAFICA E INTERAZIONI DEL COMPUTO) */}
                      {processedMeasurements.map((m, mIdx) => {
                        const isSubtotal = m.type === 'subtotal';
                        const isDeduction = m.type === 'deduction';
                        const isLastMeasRow = mIdx === processedMeasurements.length - 1;
                        const isRowVoiceActive = recordingArticleId === art.id && voiceActiveRowId === m.id;

                        return (
                          <tr
                            key={m.id}
                            className={`group/row cursor-default transition-all border-b border-slate-200/70 ${
                              isSubtotal ? 'bg-amber-50/70 font-bold border-y border-amber-200/90' : (
                                isDeduction ? 'bg-rose-50/60' : 'bg-white hover:bg-slate-50/50'
                              )
                            } ${isRowVoiceActive ? 'bg-purple-50/50 ring-1 ring-purple-400' : ''}`}
                            style={{ fontSize: '13.5px' }}
                          >
                            <td className="border-r border-slate-200 bg-slate-50/30"></td>
                            
                            {/* COLONNA PULSANTI AZIONE MISURA (COME NEL COMPUTO) */}
                            <td className="p-0 border-r border-slate-200 bg-slate-50/40 text-center relative align-middle">
                              <div className="flex justify-center items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity px-1 h-full py-1.5">
                                <GripVertical className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing flex-shrink-0" title="Trascina rigo" />
                                {!isSubtotal && (
                                  <button 
                                    onClick={() => handleToggleDeduction(art.id, m.id)} 
                                    className={`rounded p-0.5 transition-colors ${
                                      isDeduction 
                                        ? 'bg-rose-600 text-white hover:bg-rose-700' 
                                        : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                    }`} 
                                    title={isDeduction ? "Rendi Positivo" : "A Dedurre"}
                                  >
                                    <MinusCircle className="w-4 h-4" />
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleDeleteMeasurement(art.id, m.id)} 
                                  className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-colors" 
                                  title="Elimina Rigo"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>

                            {/* DESCRIZIONE MISURA */}
                            <td className={`pl-3 pr-1 py-1 border-r border-slate-200 relative align-top ${isDeduction ? 'text-rose-900 font-bold' : ''}`}>
                              <div className="flex items-start gap-2 relative w-full min-h-[22px]">
                                {isSubtotal ? (
                                  <div className="italic text-amber-900 text-right pr-2 w-full font-bold">
                                    Sommano parziale
                                  </div>
                                ) : (
                                  <div className="flex-1 flex items-start gap-2 relative w-full">
                                    <div className={`absolute left-0 top-3 w-4 h-[1px] ${isDeduction ? 'bg-rose-300' : 'bg-slate-300'}`}></div>
                                    <FastTextarea
                                      initialValue={m.description || ''}
                                      onCommit={(val) => handleUpdateMeasurement(art.id, m.id, 'description', val)}
                                      data-m-id={m.id}
                                      data-field="description"
                                      autoFocus={m.id === lastAddedMeasurementId}
                                      onKeyDown={(e) => handleMeasKeyDown(e, art.id, m.id, 'description', isLastMeasRow)}
                                      className={`w-full bg-transparent border-none p-0 focus:ring-0 placeholder-slate-300 resize-none overflow-hidden whitespace-pre-wrap break-words text-justify leading-snug pl-5 ${
                                        isDeduction ? 'text-rose-900 font-bold' : 'text-slate-800'
                                      }`}
                                      style={{ fontSize: '13.5px', minHeight: '22px' }}
                                      placeholder=""
                                    />
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* PAR.UG. */}
                            <td className={`border-r border-slate-200 p-0 transition-colors ${isDeduction ? 'bg-rose-50/60' : 'bg-slate-50/40'}`}>
                              {!isSubtotal ? (
                                <FastNumberInput
                                  data-m-id={m.id}
                                  data-field="multiplier"
                                  className={`w-full text-center bg-transparent border-none text-xs focus:bg-white placeholder-slate-300 h-full font-mono tabular-nums outline-none ${
                                    isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'
                                  }`}
                                  style={{ fontSize: '13.5px' }}
                                  initialValue={m.multiplier}
                                  onCommit={(val) => handleUpdateMeasurement(art.id, m.id, 'multiplier', val)}
                                  onKeyDown={(e) => handleMeasKeyDown(e, art.id, m.id, 'multiplier', isLastMeasRow)}
                                  placeholder=""
                                />
                              ) : null}
                            </td>

                            {/* LUNGHEZZA */}
                            <td className={`border-r border-slate-200 p-0 transition-all ${isDeduction ? 'bg-rose-50/60' : 'bg-slate-50/40'}`}>
                              {isSubtotal ? (
                                <div className="text-center text-slate-300">-</div>
                              ) : (
                                <FastNumberInput
                                  data-m-id={m.id}
                                  data-field="length"
                                  step="any"
                                  className={`w-full text-center bg-transparent border-none text-xs focus:bg-white placeholder-slate-300 h-full font-mono tabular-nums outline-none ${
                                    isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'
                                  }`}
                                  style={{ fontSize: '13.5px' }}
                                  initialValue={m.length}
                                  onCommit={(val) => handleUpdateMeasurement(art.id, m.id, 'length', val)}
                                  onKeyDown={(e) => handleMeasKeyDown(e, art.id, m.id, 'length', isLastMeasRow)}
                                  placeholder=""
                                />
                              )}
                            </td>

                            {/* LARGHEZZA */}
                            <td className={`border-r border-slate-200 p-0 transition-all ${isDeduction ? 'bg-rose-50/60' : 'bg-slate-50/40'}`}>
                              {isSubtotal ? (
                                <div className="text-center text-slate-300">-</div>
                              ) : (
                                <FastNumberInput
                                  data-m-id={m.id}
                                  data-field="width"
                                  step="any"
                                  className={`w-full text-center bg-transparent border-none text-xs focus:bg-white placeholder-slate-300 h-full font-mono tabular-nums outline-none ${
                                    isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'
                                  }`}
                                  style={{ fontSize: '13.5px' }}
                                  initialValue={m.width}
                                  onCommit={(val) => handleUpdateMeasurement(art.id, m.id, 'width', val)}
                                  onKeyDown={(e) => handleMeasKeyDown(e, art.id, m.id, 'width', isLastMeasRow)}
                                  placeholder=""
                                />
                              )}
                            </td>

                            {/* ALTEZZA / PESO */}
                            <td className={`border-r border-slate-200 p-0 transition-all ${isDeduction ? 'bg-rose-50/60' : 'bg-slate-50/40'}`}>
                              {isSubtotal ? (
                                <div className="text-center text-slate-300">-</div>
                              ) : (
                                <FastNumberInput
                                  data-m-id={m.id}
                                  data-field="height"
                                  step="any"
                                  className={`w-full text-center bg-transparent border-none text-xs focus:bg-white placeholder-slate-300 h-full font-mono tabular-nums outline-none ${
                                    isDeduction ? 'text-rose-900 font-black' : 'text-slate-800'
                                  }`}
                                  style={{ fontSize: '13.5px' }}
                                  initialValue={m.height}
                                  onCommit={(val) => handleUpdateMeasurement(art.id, m.id, 'height', val)}
                                  onKeyDown={(e) => handleMeasKeyDown(e, art.id, m.id, 'height', isLastMeasRow)}
                                  placeholder=""
                                />
                              )}
                            </td>

                            {/* QUANTITÀ RISULTANTE */}
                            <td className={`p-1 px-2 border-r border-slate-200 text-center font-mono tabular-nums ${
                              isSubtotal ? 'bg-amber-100/70 font-black text-amber-950' : (
                                isDeduction ? 'bg-rose-100 text-rose-900 font-black' : 'bg-slate-50/80 font-bold text-slate-800'
                              )
                            }`}>
                              {formatResult(isSubtotal ? m.displayValue : m.calculatedValue)}
                            </td>

                            <td className="border-r border-slate-200 bg-slate-50/10"></td>
                            <td className="border-r border-slate-200 bg-slate-50/10"></td>
                            <td className="bg-purple-50/10"></td>
                          </tr>
                        );
                      })}

                      {/* RIGA IN FONDO ALLA VOCE: SOMMANO ESATTO COME NEL COMPUTO */}
                      <tr className="border-b-2 border-slate-300 bg-slate-50/90 font-bold text-xs">
                        <td className="border-r border-slate-200 bg-slate-100/50"></td>
                        <td className="border-r border-slate-200 bg-slate-100/50"></td>
                        <td className="px-2.5 py-2 text-left border-r border-slate-200 flex items-center justify-between">
                          <span className="uppercase text-[10px] ml-auto font-black tracking-wider text-slate-500">
                            Sommano <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">{art.unit || 'm³'}</span>
                          </span>
                        </td>
                        <td className="border-r border-slate-200"></td>
                        <td className="border-r border-slate-200"></td>
                        <td className="border-r border-slate-200"></td>
                        <td className="border-r border-slate-200"></td>
                        <td className="border-r border-slate-200 text-right pr-2 font-mono font-extrabold bg-slate-100/80 text-slate-900">
                          {formatResult(art.quantity)}
                        </td>
                        <td className="border-r border-slate-200 text-right p-0 font-mono">
                          <FastNumberInput
                            initialValue={art.unitPrice}
                            onCommit={(val) => handleUpdateArticle(art.id, 'unitPrice', val || 0)}
                            step="any"
                            className="w-full text-right font-mono font-bold text-xs text-slate-800 bg-transparent hover:bg-white focus:bg-white px-2 py-1 rounded outline-none"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="border-r border-slate-200 text-right pr-2 font-mono font-black text-purple-900 bg-purple-50/20">
                          {formatCurrency(totalAmount)}
                        </td>
                        <td className="bg-slate-50"></td>
                      </tr>

                      {/* PULSANTI RAPIDI AGGIUNGI MISURA E SOMMANO PARZIALE SOTTO */}
                      <tr className="bg-slate-50/40 border-b-2 border-slate-200/80">
                        <td colSpan={2} className="border-r border-slate-200"></td>
                        <td colSpan={9} className="py-1.5 px-3">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleAddMeasurement(art.id)}
                              className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>+ Rigo Misura</span>
                            </button>
                            <span className="text-slate-300">•</span>
                            <button
                              type="button"
                              onClick={() => handleAddSubtotal(art.id)}
                              className="text-[10px] font-black uppercase text-amber-600 hover:text-amber-800 flex items-center gap-1 hover:underline cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>+ Sommano Parziale</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  );
                })}
              </table>
            )}
          </div>

          {/* BARRA INFERIORE DEL GRUPPO CON SPAZIO VUOTO COME IL COMPUTO */}
          <div className="p-4 bg-slate-100/70 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
            <button
              onClick={() => handleAddArticle(activeGroup.catCode)}
              className="bg-white hover:bg-slate-50 border border-slate-300 font-black uppercase text-[11px] px-4 py-2 rounded-xl shadow-2xs flex items-center gap-2 transition-all cursor-pointer"
              style={{ color: activeGroup.color }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Aggiungi un'altra risorsa a {activeGroup.title}</span>
            </button>

            <span className="text-[10px] text-slate-400">
              Trascina una voce da prezzario regionale per inserirla direttamente in questo gruppo.
            </span>
          </div>
        </div>
      </div>

      {/* MODALE CONFIGURAZIONE RISORSA */}
      {isResourceModalOpen && editingResource && (
        <ResourceConfigModal
          isOpen={isResourceModalOpen}
          onClose={() => {
            setIsResourceModalOpen(false);
            setEditingResource(null);
          }}
          article={editingResource}
          onSave={(updatedArt) => {
            const exists = articles.some(a => a.id === updatedArt.id);
            if (exists) {
              const nextArts = articles.map(a => a.id === updatedArt.id ? updatedArt : a);
              syncAnalysis(nextArts);
            } else {
              syncAnalysis([...articles, updatedArt]);
              setLastAddedMeasurementId(updatedArt.measurements?.[0]?.id || null);
              setTimeout(() => {
                const el = document.getElementById(`article-block-${updatedArt.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 100);
            }
            setIsResourceModalOpen(false);
            setEditingResource(null);
          }}
        />
      )}

      {/* MODALI PARAMETRICI IDENTICI AL COMPUTO */}
      {isRebarModalOpen && (
        <RebarCalculatorModal
          isOpen={isRebarModalOpen}
          onClose={() => setIsRebarModalOpen(false)}
          onAdd={(generatedMeas) => {
            if (rebarTargetArticleId) {
              const art = articles.find(a => a.id === rebarTargetArticleId);
              if (art) {
                const nextMeas = [
                  ...(art.measurements || []),
                  ...generatedMeas.map(gm => ({
                    id: 'meas_' + Math.random().toString(36).substr(2, 9),
                    description: gm.description,
                    multiplier: gm.multiplier,
                    length: gm.length,
                    width: gm.width,
                    height: gm.height,
                    type: gm.type || 'positive'
                  }))
                ];
                handleUpdateArticle(rebarTargetArticleId, 'measurements', nextMeas);
              }
            }
            setIsRebarModalOpen(false);
          }}
          articles={articles}
          targetArticleId={rebarTargetArticleId}
          onSelectTargetArticle={(id) => setRebarTargetArticleId(id)}
        />
      )}

      {isPaintingModalOpen && (
        <PaintingCalculatorModal
          isOpen={isPaintingModalOpen}
          onClose={() => setIsPaintingModalOpen(false)}
          onAdd={(generatedMeas) => {
            if (paintingTargetArticleId) {
              const art = articles.find(a => a.id === paintingTargetArticleId);
              if (art) {
                const nextMeas = [
                  ...(art.measurements || []),
                  ...generatedMeas.map(gm => ({
                    id: 'meas_' + Math.random().toString(36).substr(2, 9),
                    description: gm.description,
                    multiplier: gm.multiplier,
                    length: gm.length,
                    width: gm.width,
                    height: gm.height,
                    type: gm.type || 'positive'
                  }))
                ];
                handleUpdateArticle(paintingTargetArticleId, 'measurements', nextMeas);
              }
            }
            setIsPaintingModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
