import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Plus, Trash2, Calculator, Save, FileText, ChevronDown, ChevronRight, 
  Maximize2, Minimize2, Check, ShieldCheck, ArrowRight, Copy, RefreshCw, 
  Package, Hammer, Truck, Scale, Info, CornerDownRight, GripVertical, 
  PlusCircle, Edit2, ShieldAlert, Award
} from 'lucide-react';
import { PriceAnalysis, Article, Measurement, ProjectInfo } from '../types';
import { COMMON_UNITS } from '../constants';
import { cleanDescription, parseDroppedContent } from '../services/geminiService';
import { generateAnalisiPrezziPdf } from '../services/pdfGenerator';

interface AnalysisComputoViewProps {
  analysis: PriceAnalysis;
  onUpdateAnalysis: (updated: PriceAnalysis) => void;
  onImportToComputo: (analysis: PriceAnalysis) => void;
  onDuplicateAnalysis: (analysis: PriceAnalysis) => void;
  projectInfo: ProjectInfo;
  selectedCategoryFilter?: 'ALL' | 'MAT' | 'MO' | 'NOL';
  onCategoryFilterChange?: (filter: 'ALL' | 'MAT' | 'MO' | 'NOL') => void;
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: true }).format(val);
};

const formatNumber = (val: number | undefined | null) => {
  if (val === undefined || val === null || val === 0) return '';
  return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
};

const formatResult = (val: number | undefined | null) => {
  const value = val || 0;
  return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
};

const roundTwoDecimals = (num: number) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

// Calcolo valore di riga misura nel mini-computo
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

// Risolve la quantità totale di una voce da tutte le sue misure
const calculateArticleQuantity = (art: Article): number => {
  if (!art.measurements || art.measurements.length === 0) return art.quantity || 0;
  
  const validMeasurements = art.measurements.filter(m => 
    m.description || 
    (m.multiplier !== undefined && m.multiplier !== 0) || 
    (m.length !== undefined && m.length !== 0) || 
    (m.width !== undefined && m.width !== 0) || 
    (m.height !== undefined && m.height !== 0)
  );

  if (validMeasurements.length === 0) return art.quantity || 0;

  return validMeasurements.reduce((sum, m) => sum + calculateMeasRowValue(m), 0);
};

export const AnalysisComputoView: React.FC<AnalysisComputoViewProps> = ({
  analysis,
  onUpdateAnalysis,
  onImportToComputo,
  onDuplicateAnalysis,
  projectInfo,
  selectedCategoryFilter = 'ALL',
  onCategoryFilterChange
}) => {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [dragOverCategory, setDragOverCategory] = useState<'MAT' | 'MO' | 'NOL' | null>(null);

  // Normalizza gli articoli dell'analisi
  const currentArticles: Article[] = useMemo(() => {
    if (analysis.articles && analysis.articles.length > 0) {
      return analysis.articles.map(art => ({
        ...art,
        quantity: calculateArticleQuantity(art)
      }));
    }
    // Retrocompatibilità da components se articles non popolato
    if (analysis.components && analysis.components.length > 0) {
      return analysis.components.map(c => {
        const catCode = c.type === 'material' ? 'MAT' : c.type === 'labor' ? 'MO' : 'NOL';
        const meas: Measurement[] = (c.measurements && c.measurements.length > 0)
          ? c.measurements.map(m => ({
              id: m.id,
              description: m.description,
              multiplier: m.multiplier,
              length: m.length,
              width: m.width,
              height: m.height,
              type: 'positive' as const
            }))
          : [{ id: Math.random().toString(36).substr(2, 9), description: '', multiplier: c.quantity || 1, type: 'positive' as const }];

        return {
          id: c.id,
          categoryCode: catCode,
          code: c.code || (catCode === 'MAT' ? 'MAT.01' : catCode === 'MO' ? 'MO.01' : 'NOL.01'),
          description: c.description,
          unit: c.unit,
          unitPrice: c.unitPrice || 0,
          laborRate: catCode === 'MO' ? 100 : 0,
          measurements: meas,
          quantity: c.quantity || 1,
          includesMarkup: c.includesMarkup ?? false,
          sourcePriceList: c.sourcePriceList
        } as Article;
      });
    }
    return [];
  }, [analysis]);

  // Calcolo totale dinamico ed economico dell'analisi
  const calculatedTotals = useMemo(() => {
    let matNet = 0, matInc = 0;
    let labNet = 0, labInc = 0;
    let eqNet = 0, eqInc = 0;

    currentArticles.forEach(art => {
      if (art.isEnabled === false) return;
      const amt = (art.quantity || 0) * (art.unitPrice || 0);
      const isInc = art.includesMarkup === true;

      if (art.categoryCode === 'MAT') {
        if (isInc) matInc += amt; else matNet += amt;
      } else if (art.categoryCode === 'MO') {
        if (isInc) labInc += amt; else labNet += amt;
      } else {
        if (isInc) eqInc += amt; else eqNet += amt;
      }
    });

    const totalMaterials = matNet + matInc;
    const totalLabor = labNet + labInc;
    const totalEquipment = eqNet + eqInc;
    const costoTecnicoNetto = matNet + labNet + eqNet;
    const costoTecnicoComprensivo = matInc + labInc + eqInc;
    const costoTecnico = totalMaterials + totalLabor + totalEquipment;

    const sgRate = analysis.generalExpensesRate ?? 15;
    const uiRate = analysis.profitRate ?? 10;
    const markupFactor = (1 + (sgRate / 100)) * (1 + (uiRate / 100));

    let valoreSpese = 0;
    let valoreUtile = 0;
    let totalBatchValue = 0;

    if (analysis.markupMode === 'unbundle_and_reapply') {
      const baseComprensivo = markupFactor > 0 ? (costoTecnicoComprensivo / markupFactor) : costoTecnicoComprensivo;
      const baseTotale = costoTecnicoNetto + baseComprensivo;
      valoreSpese = baseTotale * (sgRate / 100);
      valoreUtile = (baseTotale + valoreSpese) * (uiRate / 100);
      totalBatchValue = baseTotale + valoreSpese + valoreUtile;
    } else {
      // Standard italiano: esclusione da doppio ricarico delle voci già comprensive
      valoreSpese = costoTecnicoNetto * (sgRate / 100);
      valoreUtile = (costoTecnicoNetto + valoreSpese) * (uiRate / 100);
      totalBatchValue = costoTecnicoNetto + valoreSpese + valoreUtile + costoTecnicoComprensivo;
    }

    const refQty = analysis.analysisQuantity > 0 ? analysis.analysisQuantity : 1;
    const totalUnitPrice = totalBatchValue / refQty;
    const laborIncidence = totalBatchValue > 0 ? ((totalLabor / totalBatchValue) * 100) : 0;

    return {
      matNet, matInc, totalMaterials,
      labNet, labInc, totalLabor,
      eqNet, eqInc, totalEquipment,
      costoTecnicoNetto,
      costoTecnicoComprensivo,
      costoTecnico,
      valoreSpese,
      valoreUtile,
      totalBatchValue,
      totalUnitPrice,
      laborIncidence
    };
  }, [currentArticles, analysis.generalExpensesRate, analysis.profitRate, analysis.analysisQuantity, analysis.markupMode]);

  // Aggiorna l'analisi madre mantenendo lo stato calcolato sincronizzato
  const syncAnalysisState = (updatedArticles: Article[], partialAnalysisUpdates?: Partial<PriceAnalysis>) => {
    const nextArticles = updatedArticles.map(a => ({
      ...a,
      quantity: calculateArticleQuantity(a)
    }));

    const nextAnalysis: PriceAnalysis = {
      ...analysis,
      ...partialAnalysisUpdates,
      articles: nextArticles,
      totalMaterials: calculatedTotals.totalMaterials,
      totalLabor: calculatedTotals.totalLabor,
      totalEquipment: calculatedTotals.totalEquipment,
      costoTecnico: calculatedTotals.costoTecnico,
      valoreSpese: calculatedTotals.valoreSpese,
      valoreUtile: calculatedTotals.valoreUtile,
      totalBatchValue: calculatedTotals.totalBatchValue,
      totalUnitPrice: calculatedTotals.totalUnitPrice,
      totalNetItems: calculatedTotals.costoTecnicoNetto,
      totalInclusiveItems: calculatedTotals.costoTecnicoComprensivo
    };

    onUpdateAnalysis(nextAnalysis);
  };

  // --- AZIONI SUGLI ARTICOLI DEL COMPUTO ANALISI ---
  const handleAddArticle = (categoryCode: 'MAT' | 'MO' | 'NOL') => {
    const newArtId = Math.random().toString(36).substr(2, 9);
    const newMeasId = Math.random().toString(36).substr(2, 9);

    const defaultCode = categoryCode === 'MAT' 
      ? `MAT.${(currentArticles.filter(a => a.categoryCode === 'MAT').length + 1).toString().padStart(2, '0')}`
      : categoryCode === 'MO'
      ? `MO.${(currentArticles.filter(a => a.categoryCode === 'MO').length + 1).toString().padStart(2, '0')}`
      : `NOL.${(currentArticles.filter(a => a.categoryCode === 'NOL').length + 1).toString().padStart(2, '0')}`;

    const defaultDesc = categoryCode === 'MAT'
      ? 'Fornitura materiale a piè d\'opera'
      : categoryCode === 'MO'
      ? 'Operaio Specializzato'
      : 'Nolo attrezzatura / macchinario';

    const defaultUnit = categoryCode === 'MAT' ? 'm³' : 'h';

    const newArticle: Article = {
      id: newArtId,
      categoryCode,
      code: defaultCode,
      description: defaultDesc,
      unit: defaultUnit,
      unitPrice: 0,
      laborRate: categoryCode === 'MO' ? 100 : 0,
      measurements: [
        { id: newMeasId, description: 'Rigo misura base', multiplier: 1, type: 'positive' }
      ],
      quantity: 1,
      includesMarkup: false
    };

    syncAnalysisState([...currentArticles, newArticle]);
  };

  const handleUpdateArticle = (artId: string, field: keyof Article, value: any) => {
    const updated = currentArticles.map(a => {
      if (a.id !== artId) return a;
      return { ...a, [field]: value };
    });
    syncAnalysisState(updated);
  };

  const handleDeleteArticle = (artId: string) => {
    if (window.confirm("Eliminare questa risorsa dall'analisi?")) {
      const updated = currentArticles.filter(a => a.id !== artId);
      syncAnalysisState(updated);
    }
  };

  // --- AZIONI SULLE MISURE (IDENTICHE AL COMPUTO NORMALE) ---
  const handleAddMeasurement = (artId: string) => {
    const newMeasId = Math.random().toString(36).substr(2, 9);
    const updated = currentArticles.map(art => {
      if (art.id !== artId) return art;
      const newM: Measurement = {
        id: newMeasId,
        description: '',
        multiplier: 1,
        type: 'positive'
      };
      return { ...art, measurements: [...(art.measurements || []), newM] };
    });
    syncAnalysisState(updated);
  };

  const handleUpdateMeasurement = (artId: string, measId: string, field: keyof Measurement, value: any) => {
    const updated = currentArticles.map(art => {
      if (art.id !== artId) return art;
      const nextMeas = (art.measurements || []).map(m => {
        if (m.id !== measId) return m;
        return { ...m, [field]: value };
      });
      return { ...art, measurements: nextMeas };
    });
    syncAnalysisState(updated);
  };

  const handleDeleteMeasurement = (artId: string, measId: string) => {
    const updated = currentArticles.map(art => {
      if (art.id !== artId) return art;
      const nextMeas = (art.measurements || []).filter(m => m.id !== measId);
      return { ...art, measurements: nextMeas };
    });
    syncAnalysisState(updated);
  };

  // --- DRAG & DROP DA PREZZARI REGIONALI O COMPUTO ---
  const handleDropOnCategory = (e: React.DragEvent, categoryCode: 'MAT' | 'MO' | 'NOL') => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCategory(null);

    const rawText = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
    if (!rawText) return;

    const parsed = parseDroppedContent(rawText);
    if (parsed) {
      const newArtId = Math.random().toString(36).substr(2, 9);
      const newMeasId = Math.random().toString(36).substr(2, 9);

      const newArticle: Article = {
        id: newArtId,
        categoryCode,
        code: parsed.code || 'NP.001',
        description: parsed.description || 'Voce importata da prezzario',
        unit: parsed.unit || (categoryCode === 'MO' ? 'h' : 'm²'),
        unitPrice: parsed.unitPrice || 0,
        laborRate: categoryCode === 'MO' ? 100 : (parsed.laborRate || 0),
        measurements: [
          { id: newMeasId, description: 'Quantità da prezzario', multiplier: 1, type: 'positive' }
        ],
        quantity: 1,
        // Una voce proveniente da prezzario ufficiale incorpora già spese generali e utile!
        includesMarkup: true,
        priceListSource: parsed.priceListSource || 'Prezzario Regionale'
      };

      syncAnalysisState([...currentArticles, newArticle]);
    }
  };

  // Raggruppamento per le 3 categorie
  const matArticles = currentArticles.filter(a => a.categoryCode === 'MAT');
  const moArticles = currentArticles.filter(a => a.categoryCode === 'MO');
  const nolArticles = currentArticles.filter(a => a.categoryCode === 'NOL');

  const visibleGroups = [
    { key: 'MAT' as const, title: '1. MATERIALI E FORNITURE', color: 'orange', icon: Package, items: matArticles, total: calculatedTotals.totalMaterials },
    { key: 'MO' as const, title: '2. MANODOPERA E OPERAI', color: 'blue', icon: Hammer, items: moArticles, total: calculatedTotals.totalLabor },
    { key: 'NOL' as const, title: '3. NOLI, TRASPORTI E ATTREZZATURE', color: 'green', icon: Truck, items: nolArticles, total: calculatedTotals.totalEquipment },
  ].filter(g => selectedCategoryFilter === 'ALL' || selectedCategoryFilter === g.key);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100/50 overflow-hidden select-none">
      {/* MODALE DESCRIZIONE ESTESA */}
      {isDescriptionExpanded && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-6 flex flex-col h-[70vh]">
            <div className="flex justify-between items-center mb-4 border-b border-slate-200 pb-3">
              <div>
                <h4 className="font-bold text-xl text-purple-900 flex items-center gap-2">
                  <Maximize2 className="w-5 h-5"/> Descrizione Completa Opera Finita
                </h4>
                <p className="text-slate-500 text-xs">Tariffa: <span className="font-mono font-bold text-purple-700">{analysis.code}</span></p>
              </div>
              <button 
                onClick={() => setIsDescriptionExpanded(false)} 
                className="bg-purple-700 text-white px-5 py-2 rounded-xl font-bold hover:bg-purple-800 flex items-center gap-2 shadow-md transition-transform hover:scale-105"
              >
                <Minimize2 className="w-4 h-4" /> Conferma e Riduci
              </button>
            </div>
            <textarea
              value={analysis.description}
              onChange={e => syncAnalysisState(currentArticles, { description: e.target.value })}
              className="flex-1 w-full border border-slate-300 rounded-xl p-5 text-base font-serif text-slate-800 shadow-inner resize-none focus:ring-2 focus:ring-purple-500 outline-none leading-relaxed text-justify"
              autoFocus
              placeholder="Inserisci la descrizione tecnica dettagliata dell'opera finita analizzata..."
            />
          </div>
        </div>
      )}

      {/* 1. TESTATA SUPERIORE DELLA VOCE ANALIZZATA (PARAMETRI DI COMPUTO E VALORE UNITARIO) */}
      <div className="bg-white border-b-2 border-purple-200 shadow-sm p-4 z-20 flex-shrink-0">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          {/* Identificativi Analisi */}
          <div className="flex items-center gap-3 flex-1">
            <div className="bg-purple-700 text-white p-3 rounded-2xl shadow-md flex flex-col items-center justify-center min-w-[70px]">
              <span className="text-[9px] font-black uppercase tracking-wider text-purple-200">Tariffa</span>
              <input 
                type="text" 
                value={analysis.code} 
                onChange={e => syncAnalysisState(currentArticles, { code: e.target.value })} 
                className="bg-transparent text-center font-black font-mono text-base text-white focus:outline-none focus:ring-1 focus:ring-purple-300 rounded w-full"
                placeholder="AP.01"
              />
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Oggetto dell'Analisi (Designazione dell'Opera Finita):
                </span>
                <button 
                  onClick={() => setIsDescriptionExpanded(true)}
                  className="text-[10px] text-purple-700 font-bold hover:text-purple-900 flex items-center gap-1 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded border border-purple-200"
                >
                  <Maximize2 className="w-3 h-3" /> Espandi testo
                </button>
              </div>
              <input 
                type="text" 
                value={analysis.description} 
                onChange={e => syncAnalysisState(currentArticles, { description: e.target.value })} 
                className="w-full font-bold text-slate-800 text-sm border-b border-slate-300 focus:border-purple-600 focus:outline-none py-0.5"
                placeholder="Descrizione dell'opera analizzata..."
              />
            </div>
          </div>

          {/* Parametri Quantità Lotto, U.M. e S.G. & Utile */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Quantità Rapportata & U.M. */}
            <div className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 flex items-center gap-2 shadow-2xs">
              <Scale className="w-4 h-4 text-purple-700" />
              <div>
                <span className="text-[9px] font-black uppercase text-purple-700 block leading-tight">Lotto Analizzato</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input 
                    type="number" 
                    step="any"
                    value={analysis.analysisQuantity || 1} 
                    onChange={e => syncAnalysisState(currentArticles, { analysisQuantity: parseFloat(e.target.value) || 1 })} 
                    className="w-14 bg-white border border-purple-300 rounded text-xs font-mono font-black text-purple-900 text-center p-0.5"
                  />
                  <input 
                    type="text" 
                    list="analysis-units-main"
                    value={analysis.unit} 
                    onChange={e => syncAnalysisState(currentArticles, { unit: e.target.value })} 
                    className="w-12 bg-white border border-purple-300 rounded text-xs font-bold text-slate-800 text-center p-0.5"
                  />
                </div>
              </div>
            </div>

            {/* Spese Generali & Utile Impresa */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-3 text-xs shadow-2xs">
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Spese Generali</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <input 
                    type="number" 
                    step="0.5"
                    value={analysis.generalExpensesRate ?? 15} 
                    onChange={e => syncAnalysisState(currentArticles, { generalExpensesRate: parseFloat(e.target.value) || 0 })} 
                    className="w-12 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-purple-800 text-center p-0.5"
                  />
                  <span className="text-[10px] font-bold text-slate-500">%</span>
                </div>
              </div>

              <div className="w-px h-6 bg-slate-200"></div>

              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Utile d'Impresa</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <input 
                    type="number" 
                    step="0.5"
                    value={analysis.profitRate ?? 10} 
                    onChange={e => syncAnalysisState(currentArticles, { profitRate: parseFloat(e.target.value) || 0 })} 
                    className="w-12 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-purple-800 text-center p-0.5"
                  />
                  <span className="text-[10px] font-bold text-slate-500">%</span>
                </div>
              </div>
            </div>

            {/* HERO BOX PREZZO UNITARIO FINALE */}
            <div className="bg-gradient-to-br from-purple-800 to-indigo-900 text-white rounded-2xl px-5 py-2.5 shadow-lg flex flex-col items-end min-w-[170px] ring-2 ring-purple-400/40">
              <span className="text-[9px] font-black uppercase tracking-widest text-purple-200">
                PREZZO UNITARIO FINALE
              </span>
              <div className="text-xl font-black font-mono tracking-tight text-white leading-tight">
                {formatCurrency(calculatedTotals.totalUnitPrice)}
              </div>
              <span className="text-[9px] text-purple-200 font-bold uppercase">
                per ogni {analysis.unit}
              </span>
            </div>
          </div>
        </div>

        {/* Barra di Riepilogo e Azioni Veloci */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap justify-between items-center text-xs gap-3">
          <div className="flex items-center gap-4 text-slate-600">
            <span className="flex items-center gap-1 text-[11px]">
              <Package className="w-3.5 h-3.5 text-orange-500" /> Mat: <b className="font-mono text-slate-800">{formatCurrency(calculatedTotals.totalMaterials)}</b>
            </span>
            <span className="flex items-center gap-1 text-[11px]">
              <Hammer className="w-3.5 h-3.5 text-blue-500" /> M.O.: <b className="font-mono text-slate-800">{formatCurrency(calculatedTotals.totalLabor)}</b>
            </span>
            <span className="flex items-center gap-1 text-[11px]">
              <Truck className="w-3.5 h-3.5 text-emerald-500" /> Noli: <b className="font-mono text-slate-800">{formatCurrency(calculatedTotals.totalEquipment)}</b>
            </span>
            <span className="text-[11px] text-slate-400">|</span>
            <span className="text-[11px]">
              Costo Tecnico: <b className="font-mono text-purple-900">{formatCurrency(calculatedTotals.costoTecnico)}</b>
            </span>
            <span className="text-[11px]">
              Incidenza M.O.: <b className="font-mono text-blue-700">{calculatedTotals.laborIncidence.toFixed(1)}%</b>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onDuplicateAnalysis(analysis)}
              className="bg-white border border-slate-300 hover:border-purple-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs hover:bg-slate-50 transition-all"
              title="Duplica questa analisi per creare una variante"
            >
              <Copy className="w-3.5 h-3.5 text-indigo-600" />
              <span>Duplica Analisi</span>
            </button>
            <button
              onClick={() => generateAnalisiPrezziPdf(projectInfo, [analysis])}
              className="bg-white border border-slate-300 hover:border-purple-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs hover:bg-slate-50 transition-all"
              title="Stampa Scheda Analisi Ufficiale PDF"
            >
              <FileText className="w-3.5 h-3.5 text-purple-600" />
              <span>Stampa PDF</span>
            </button>
            <button
              onClick={() => onImportToComputo(analysis)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 shadow-md transition-all hover:scale-105 active:scale-95"
              title="Inserisci questa analisi come articolo nel Computo Metrico"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>Importa in Computo</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. BARRA INTESTAZIONI IDENTICA AL COMPUTO METRICO */}
      <div className="px-6 bg-slate-100 border-x border-b border-slate-200 z-10 flex-shrink-0 shadow-xs">
        <table className="w-full text-left border-separate border-spacing-0 table-fixed">
          <colgroup>
            <col style={{ width: '46px' }} />
            <col style={{ width: '135px' }} />
            <col style={{ width: 'auto' }} />
            <col style={{ width: '54px' }} />
            <col style={{ width: '54px' }} />
            <col style={{ width: '54px' }} />
            <col style={{ width: '54px' }} />
            <col style={{ width: '74px' }} />
            <col style={{ width: '84px' }} />
            <col style={{ width: '96px' }} />
            <col style={{ width: '130px' }} />
          </colgroup>
          <thead className="select-none">
            <tr className="text-[10px] uppercase font-bold tracking-wider text-slate-700">
              <th className="bg-slate-100 py-2.5 px-2 text-center border-r border-slate-300">N.</th>
              <th className="bg-slate-100 py-2.5 px-2 text-left border-r border-slate-300">Tariffa</th>
              <th className="bg-slate-100 py-2.5 px-3 text-left border-r border-slate-300">Elemento di Costo / Risorsa</th>
              <th className="bg-slate-100 py-2.5 px-1 text-center border-r border-slate-300">Par.Ug</th>
              <th className="bg-slate-100 py-2.5 px-1 text-center border-r border-slate-300">Lung.</th>
              <th className="bg-slate-100 py-2.5 px-1 text-center border-r border-slate-300">Larg.</th>
              <th className="bg-slate-100 py-2.5 px-1 text-center border-r border-slate-300">H/Peso</th>
              <th className="bg-slate-100 py-2.5 px-2 text-right border-r border-slate-300">Quantità</th>
              <th className="bg-slate-100 py-2.5 px-2 text-right border-r border-slate-300">Prezzo €</th>
              <th className="bg-slate-100 py-2.5 px-2 text-right border-r border-slate-300">Importo €</th>
              <th className="bg-purple-100 py-2.5 px-2 text-center text-purple-900 font-extrabold">S.G. & Utile</th>
            </tr>
          </thead>
        </table>
      </div>

      {/* 3. CORPO DELLA TABELLA COMPUTO DIVISO NEI 3 GRUPPI (MATERIALI, MANODOPERA, NOLI) */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {visibleGroups.map(group => {
          const GroupIcon = group.icon;
          const isDragOver = dragOverCategory === group.key;

          return (
            <div 
              key={group.key}
              onDragOver={(e) => { e.preventDefault(); setDragOverCategory(group.key); }}
              onDragLeave={() => setDragOverCategory(null)}
              onDrop={(e) => handleDropOnCategory(e, group.key)}
              className={`bg-white rounded-xl border transition-all shadow-sm overflow-hidden ${
                isDragOver ? 'ring-4 ring-purple-400 border-purple-500 bg-purple-50/20' : 'border-slate-300'
              }`}
            >
              {/* BANNER DI CAPITOLO / GRUPPO DI LAVORAZIONE */}
              <div className={`px-4 py-2.5 flex justify-between items-center border-b ${
                group.key === 'MAT' ? 'bg-orange-50 border-orange-200 text-orange-950' :
                group.key === 'MO' ? 'bg-blue-50 border-blue-200 text-blue-950' :
                'bg-emerald-50 border-emerald-200 text-emerald-950'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`p-1.5 rounded-lg ${
                    group.key === 'MAT' ? 'bg-orange-600 text-white' :
                    group.key === 'MO' ? 'bg-blue-600 text-white' :
                    'bg-emerald-600 text-white'
                  }`}>
                    <GroupIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-xs uppercase tracking-wider">{group.title}</h3>
                    <span className="text-[10px] text-slate-500">
                      {group.items.length} {group.items.length === 1 ? 'risorsa presente' : 'risorse presenti'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Subtotale {group.title.split('.')[1]?.trim()}</span>
                    <span className="font-mono font-black text-sm text-slate-900">{formatCurrency(group.total)}</span>
                  </div>

                  <button
                    onClick={() => handleAddArticle(group.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1 shadow-xs transition-all hover:scale-105 active:scale-95 text-white ${
                      group.key === 'MAT' ? 'bg-orange-600 hover:bg-orange-700' :
                      group.key === 'MO' ? 'bg-blue-600 hover:bg-blue-700' :
                      'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" /> + Aggiungi {group.key === 'MAT' ? 'Materiale' : group.key === 'MO' ? 'Manodopera' : 'Nolo'}
                  </button>
                </div>
              </div>

              {/* TABELLA COMPUTO DELLE VOCI */}
              {group.items.length === 0 ? (
                <div 
                  onClick={() => handleAddArticle(group.key)}
                  className="py-10 text-center text-slate-400 border-2 border-dashed border-slate-200 m-4 rounded-xl hover:border-purple-400 hover:bg-purple-50/20 cursor-pointer transition-all"
                >
                  <p className="text-xs font-bold text-slate-500">Nessuna voce in {group.title}.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Clicca qui per aggiungere o trascina una voce da prezzario regionale (gecola.it, testo).</p>
                </div>
              ) : (
                <table className="w-full text-left border-separate border-spacing-0 table-fixed bg-white">
                  <colgroup>
                    <col style={{ width: '46px' }} />
                    <col style={{ width: '135px' }} />
                    <col style={{ width: 'auto' }} />
                    <col style={{ width: '54px' }} />
                    <col style={{ width: '54px' }} />
                    <col style={{ width: '54px' }} />
                    <col style={{ width: '54px' }} />
                    <col style={{ width: '74px' }} />
                    <col style={{ width: '84px' }} />
                    <col style={{ width: '96px' }} />
                    <col style={{ width: '130px' }} />
                  </colgroup>
                  <tbody>
                    {group.items.map((art, artIdx) => {
                      const totalAmount = (art.quantity || 0) * (art.unitPrice || 0);

                      return (
                        <React.Fragment key={art.id}>
                          {/* RIGA INTESTAZIONE DELLA VOCE (COME NEL COMPUTO) */}
                          <tr className="border-t-2 border-slate-200 bg-slate-50/70 hover:bg-slate-100/60 transition-colors">
                            {/* N. PROGRESSIVO */}
                            <td className="p-2 text-center border-r border-slate-200 font-mono text-xs font-bold text-slate-500">
                              {artIdx + 1}
                            </td>

                            {/* TARIFFA */}
                            <td className="p-2 border-r border-slate-200">
                              <input 
                                type="text"
                                value={art.code}
                                onChange={e => handleUpdateArticle(art.id, 'code', e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono font-black text-xs text-purple-900 focus:ring-1 focus:ring-purple-400"
                                placeholder="Codice..."
                              />
                            </td>

                            {/* DESIGNAZIONE VOCE */}
                            <td className="p-2 border-r border-slate-200">
                              <div className="flex flex-col">
                                <input 
                                  type="text"
                                  value={art.description}
                                  onChange={e => handleUpdateArticle(art.id, 'description', e.target.value)}
                                  className="w-full bg-transparent font-bold text-xs text-slate-800 focus:outline-none focus:bg-white rounded px-1 py-0.5"
                                  placeholder="Descrizione risorsa..."
                                />
                                {art.priceListSource && (
                                  <span className="text-[9px] text-purple-600 font-mono pl-1">
                                    Fonte: {art.priceListSource}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* U.M. */}
                            <td colSpan={4} className="p-2 text-center border-r border-slate-200">
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-[10px] text-slate-400 font-bold uppercase">U.M:</span>
                                <input 
                                  type="text"
                                  value={art.unit}
                                  onChange={e => handleUpdateArticle(art.id, 'unit', e.target.value)}
                                  className="w-12 text-center bg-white border border-slate-300 rounded text-xs font-black text-slate-700 py-0.5"
                                />
                              </div>
                            </td>

                            {/* QUANTITÀ TOTALE VOCE */}
                            <td className="p-2 text-right border-r border-slate-200 font-mono font-black text-xs text-blue-900 bg-blue-50/40">
                              {formatResult(art.quantity)}
                            </td>

                            {/* PREZZO UNITARIO */}
                            <td className="p-2 text-right border-r border-slate-200">
                              <input 
                                type="number"
                                step="0.01"
                                value={art.unitPrice || ''}
                                onChange={e => handleUpdateArticle(art.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                                className="w-full text-right bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono font-bold text-xs text-slate-800"
                                placeholder="0.00"
                              />
                            </td>

                            {/* IMPORTO TOTALE */}
                            <td className="p-2 text-right border-r border-slate-200 font-mono font-black text-xs text-purple-900">
                              {formatCurrency(totalAmount)}
                            </td>

                            {/* SPUNTATURA PARTICOLARE: CON O SENZA SPESE GENERALI & UTILE */}
                            <td className="p-2 text-center bg-slate-50">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleUpdateArticle(art.id, 'includesMarkup', !art.includesMarkup)}
                                  className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase transition-all flex items-center justify-center gap-1 border shadow-2xs ${
                                    art.includesMarkup
                                      ? 'bg-purple-100 border-purple-300 text-purple-900'
                                      : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                  }`}
                                  title={
                                    art.includesMarkup 
                                      ? "Voce da prezzario ufficiale: Spese Generali e Utile d'Impresa già INCLUSI nel prezzo."
                                      : "Voce al netto elementare: applicherà il ricarico di Spese Generali e Utile alla fine."
                                  }
                                >
                                  {art.includesMarkup ? (
                                    <>
                                      <ShieldCheck className="w-3 h-3 text-purple-700" />
                                      <span>Comprensivo S.G./Utile</span>
                                    </>
                                  ) : (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-600" />
                                      <span>Al Netto (Soggetta)</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => handleDeleteArticle(art.id)}
                                  className="text-slate-300 hover:text-red-500 p-1"
                                  title="Elimina risorsa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* ELENCO DELLE MISURE DELLA VOCE (COME NEL COMPUTO) */}
                          <tr className="bg-slate-50/30">
                            <td colSpan={2} className="border-r border-slate-200"></td>
                            <td colSpan={9} className="p-1 pl-4">
                              <div className="flex items-center justify-between py-1">
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                                  ELENCO DELLE MISURE:
                                </span>
                                <button
                                  onClick={() => handleAddMeasurement(art.id)}
                                  className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[9px] font-black uppercase flex items-center gap-1 transition-all"
                                >
                                  <Plus className="w-3 h-3" /> + Aggiungi Rigo Misura
                                </button>
                              </div>
                            </td>
                          </tr>

                          {(art.measurements || []).map((m, mIdx) => {
                            const rowVal = calculateMeasRowValue(m);

                            return (
                              <tr key={m.id} className="hover:bg-blue-50/30 transition-colors text-xs border-b border-slate-100">
                                <td className="border-r border-slate-200"></td>
                                <td className="border-r border-slate-200"></td>

                                {/* Descrizione Rigo Misura */}
                                <td className="p-1 px-3 border-r border-slate-200">
                                  <input 
                                    type="text"
                                    value={m.description}
                                    onChange={e => handleUpdateMeasurement(art.id, m.id, 'description', e.target.value)}
                                    className="w-full bg-transparent text-xs text-slate-700 focus:outline-none focus:bg-white rounded px-1 py-0.5"
                                    placeholder="Descrizione misura (es. Travi spessore 30cm...)"
                                  />
                                </td>

                                {/* Par. Uguali */}
                                <td className="p-1 border-r border-slate-200 text-center">
                                  <input 
                                    type="number"
                                    step="any"
                                    value={m.multiplier ?? ''}
                                    onChange={e => handleUpdateMeasurement(art.id, m.id, 'multiplier', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                    className="w-full text-center bg-transparent focus:bg-white text-xs font-mono rounded"
                                    placeholder="1"
                                  />
                                </td>

                                {/* Lunghezza */}
                                <td className="p-1 border-r border-slate-200 text-center">
                                  <input 
                                    type="number"
                                    step="any"
                                    value={m.length ?? ''}
                                    onChange={e => handleUpdateMeasurement(art.id, m.id, 'length', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                    className="w-full text-center bg-transparent focus:bg-white text-xs font-mono rounded"
                                  />
                                </td>

                                {/* Larghezza */}
                                <td className="p-1 border-r border-slate-200 text-center">
                                  <input 
                                    type="number"
                                    step="any"
                                    value={m.width ?? ''}
                                    onChange={e => handleUpdateMeasurement(art.id, m.id, 'width', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                    className="w-full text-center bg-transparent focus:bg-white text-xs font-mono rounded"
                                  />
                                </td>

                                {/* Altezza / Peso */}
                                <td className="p-1 border-r border-slate-200 text-center">
                                  <input 
                                    type="number"
                                    step="any"
                                    value={m.height ?? ''}
                                    onChange={e => handleUpdateMeasurement(art.id, m.id, 'height', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                    className="w-full text-center bg-transparent focus:bg-white text-xs font-mono rounded"
                                  />
                                </td>

                                {/* Quantità Rigo */}
                                <td className="p-1 px-2 border-r border-slate-200 text-right font-mono font-bold text-slate-700">
                                  {formatResult(rowVal)}
                                </td>

                                <td className="border-r border-slate-200"></td>
                                <td className="border-r border-slate-200"></td>

                                {/* Azione elimina rigo */}
                                <td className="p-1 text-center">
                                  <button
                                    onClick={() => handleDeleteMeasurement(art.id, m.id)}
                                    className="text-slate-300 hover:text-red-500 p-0.5"
                                    title="Elimina rigo"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}

                          {/* RIGA DI CHIUSURA SOMMANO VOCE */}
                          <tr className="border-b-2 border-slate-200 bg-slate-50/60 font-bold text-xs">
                            <td colSpan={2} className="border-r border-slate-200"></td>
                            <td colSpan={5} className="py-1 px-3 text-right uppercase text-[9px] text-slate-500 border-r border-slate-200">
                              SOMMANO {art.unit}:
                            </td>
                            <td className="py-1 px-2 text-right font-mono font-black text-blue-900 border-r border-slate-200">
                              {formatResult(art.quantity)}
                            </td>
                            <td className="py-1 px-2 text-right font-mono text-slate-500 border-r border-slate-200">
                              {formatResult(art.unitPrice)}
                            </td>
                            <td className="py-1 px-2 text-right font-mono font-black text-purple-900 border-r border-slate-200">
                              {formatCurrency(totalAmount)}
                            </td>
                            <td></td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      <datalist id="analysis-units-main">
        {COMMON_UNITS.map((u, i) => (<option key={`${u}-${i}`} value={u} />))}
      </datalist>
    </div>
  );
};

export default AnalysisComputoView;
