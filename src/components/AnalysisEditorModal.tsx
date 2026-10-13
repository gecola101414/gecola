import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, Save, Plus, Trash2, Calculator, Hammer, Truck, Package, 
  Scale, Maximize2, Minimize2, Lock, Unlock, FileText, CornerDownRight, 
  GripVertical, ChevronDown, ChevronRight, Copy, Info, Check, 
  ShieldCheck, ArrowRight, Percent, RefreshCw, SlidersHorizontal
} from 'lucide-react';
import { PriceAnalysis, AnalysisComponent, AnalysisMeasurement, ProjectInfo } from '../types';
import { COMMON_UNITS, LABOR_CATALOG, EQUIPMENT_CATALOG, MATERIAL_CATALOG } from '../constants';
import { cleanDescription, parseDroppedContent } from '../services/geminiService';
import { generateAnalisiPrezziPdf } from '../services/pdfGenerator';

interface AnalysisEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: PriceAnalysis | null;
  onSave: (analysis: PriceAnalysis) => void;
  nextCode?: string;
  projectInfo?: ProjectInfo;
}

export const AnalysisEditorModal: React.FC<AnalysisEditorModalProps> = ({ 
  isOpen, 
  onClose, 
  analysis, 
  onSave, 
  nextCode,
  projectInfo
}) => {
  const [formData, setFormData] = useState<PriceAnalysis>({
    id: '',
    code: '',
    description: '',
    unit: 'm²',
    analysisQuantity: 1, 
    components: [],
    generalExpensesRate: 15,
    profitRate: 10,
    markupMode: 'exclude_from_markup',
    totalMaterials: 0,
    totalLabor: 0,
    totalEquipment: 0,
    costoTecnico: 0,
    valoreSpese: 0,
    valoreUtile: 0,
    totalBatchValue: 0,
    totalUnitPrice: 0,
    isLocked: false
  });

  const [expandedMeasurementIds, setExpandedMeasurementIds] = useState<Set<string>>(new Set());
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<'ALL' | 'material' | 'labor' | 'equipment'>('ALL');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [dragOverGroup, setDragOverGroup] = useState<'material' | 'labor' | 'equipment' | 'global' | null>(null);

  // Datalist IDs
  const sharedDatalistId = "analysis-units-datalist-v2";
  const laborDatalistId = "labor-catalog-datalist-v2";
  const equipDatalistId = "equip-catalog-datalist-v2";
  const matDatalistId = "mat-catalog-datalist-v2";

  useEffect(() => {
    if (isOpen) {
      if (analysis) {
        const cloned: PriceAnalysis = JSON.parse(JSON.stringify(analysis));
        // Assicurati che ogni componente abbia le proprietà minime
        cloned.components = (cloned.components || []).map(c => ({
          ...c,
          includesMarkup: c.includesMarkup ?? false,
          measurements: c.measurements || []
        }));
        cloned.markupMode = cloned.markupMode || 'exclude_from_markup';
        setFormData(cloned);
      } else {
        setFormData({
          id: Math.random().toString(36).substr(2, 9),
          code: nextCode || 'AP.01',
          description: '',
          unit: 'm²',
          analysisQuantity: 1, 
          components: [],
          generalExpensesRate: 15,
          profitRate: 10,
          markupMode: 'exclude_from_markup',
          totalMaterials: 0,
          totalLabor: 0,
          totalEquipment: 0,
          costoTecnico: 0,
          valoreSpese: 0,
          valoreUtile: 0,
          totalBatchValue: 0,
          totalUnitPrice: 0,
          isLocked: false
        });
      }
      setExpandedMeasurementIds(new Set());
    }
  }, [isOpen, analysis, nextCode]);

  // Calcolo misurazioni per ciascun componente
  const getComponentQuantity = (comp: AnalysisComponent): number => {
    if (comp.measurements && comp.measurements.length > 0) {
      return comp.measurements.reduce((sum, m) => {
        const hasDims = m.length !== undefined || m.width !== undefined || m.height !== undefined;
        const mult = m.multiplier !== undefined ? m.multiplier : (hasDims ? 1 : 0);
        const l = m.length === undefined ? 1 : m.length;
        const w = m.width === undefined ? 1 : m.width;
        const h = m.height === undefined ? 1 : m.height;
        const base = hasDims ? (l * w * h) : 0;
        const rowVal = (!hasDims && mult !== 0) ? mult : (base * mult);
        return sum + rowVal;
      }, 0);
    }
    return comp.quantity || 0;
  };

  // CALCOLO AVANZATO RIEPILOGO ECONOMICO
  const calculated = useMemo(() => {
    let matNet = 0, matInc = 0;
    let labNet = 0, labInc = 0;
    let eqNet = 0, eqInc = 0;

    formData.components.forEach(comp => {
      const qty = getComponentQuantity(comp);
      const val = (qty || 0) * (comp.unitPrice || 0);

      if (comp.type === 'material') {
        if (comp.includesMarkup) matInc += val;
        else matNet += val;
      } else if (comp.type === 'labor') {
        if (comp.includesMarkup) labInc += val;
        else labNet += val;
      } else {
        if (comp.includesMarkup) eqInc += val;
        else eqNet += val;
      }
    });

    const matTotal = matNet + matInc;
    const labTotal = labNet + labInc;
    const eqTotal = eqNet + eqInc;

    const costoTecnicoNetto = matNet + labNet + eqNet;
    const costoTecnicoComprensivo = matInc + labInc + eqInc;
    const costoTecnicoTotale = matTotal + labTotal + eqTotal;

    const sgRate = formData.generalExpensesRate || 0;
    const uiRate = formData.profitRate || 0;
    const markupFactor = (1 + (sgRate / 100)) * (1 + (uiRate / 100));

    let speseGenerali = 0;
    let utileImpresa = 0;
    let totaleLotto = 0;
    let unbundledBaseInclusive = 0;

    if (formData.markupMode === 'unbundle_and_reapply') {
      // Modalità Scorporo: scorpora le voci comprensive e riapplica il ricarico uniforme su tutto il lotto
      unbundledBaseInclusive = markupFactor > 0 ? (costoTecnicoComprensivo / markupFactor) : costoTecnicoComprensivo;
      const costoBaseComplessivo = costoTecnicoNetto + unbundledBaseInclusive;
      speseGenerali = costoBaseComplessivo * (sgRate / 100);
      utileImpresa = (costoBaseComplessivo + speseGenerali) * (uiRate / 100);
      totaleLotto = costoBaseComplessivo + speseGenerali + utileImpresa;
    } else {
      // Modalità Standard: non applicare ulteriore ricarico alle voci già comprensive (esclusione da doppio ricarico)
      speseGenerali = costoTecnicoNetto * (sgRate / 100);
      utileImpresa = (costoTecnicoNetto + speseGenerali) * (uiRate / 100);
      totaleLotto = costoTecnicoNetto + speseGenerali + utileImpresa + costoTecnicoComprensivo;
    }

    const qty = formData.analysisQuantity > 0 ? formData.analysisQuantity : 1;
    const unitPrice = totaleLotto / qty;

    // Incidenza manodopera sul totale lotto
    const laborIncidence = totaleLotto > 0 ? ((labTotal / totaleLotto) * 100) : 0;

    return {
      matNet, matInc, matTotal,
      labNet, labInc, labTotal,
      eqNet, eqInc, eqTotal,
      costoTecnicoNetto,
      costoTecnicoComprensivo,
      costoTecnicoTotale,
      speseGenerali,
      utileImpresa,
      totaleLotto,
      unitPrice,
      laborIncidence,
      unbundledBaseInclusive
    };
  }, [formData.components, formData.generalExpensesRate, formData.profitRate, formData.analysisQuantity, formData.markupMode]);

  if (!isOpen) return null;

  const isLocked = formData.isLocked || false;

  // GESTIONE COMPONENTI
  const handleAddComponent = (type: 'material' | 'labor' | 'equipment', defaultData?: Partial<AnalysisComponent>) => {
    if (isLocked) return;
    const newComp: AnalysisComponent = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      code: defaultData?.code || (type === 'material' ? 'MAT.01' : type === 'labor' ? 'MO.01' : 'NOL.01'),
      description: defaultData?.description || '',
      unit: defaultData?.unit || (type === 'labor' || type === 'equipment' ? 'h' : 'm²'),
      unitPrice: defaultData?.unitPrice || 0,
      quantity: defaultData?.quantity !== undefined ? defaultData.quantity : 1,
      includesMarkup: defaultData?.includesMarkup ?? false,
      measurements: defaultData?.measurements || [],
      sourcePriceList: defaultData?.sourcePriceList
    };
    setFormData(prev => ({ ...prev, components: [...prev.components, newComp] }));
  };

  const handleUpdateComponent = (id: string, field: keyof AnalysisComponent, value: any) => {
    if (isLocked) return;
    setFormData(prev => {
      const newComponents = prev.components.map(c => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: value };

        if (field === 'description') {
          let catalog: any[] = [];
          if (c.type === 'labor') catalog = LABOR_CATALOG;
          else if (c.type === 'equipment') catalog = EQUIPMENT_CATALOG;
          else if (c.type === 'material') catalog = MATERIAL_CATALOG;

          const match = catalog.find(item => item.description === value);
          if (match) {
            updated.unit = match.unit;
            updated.unitPrice = match.price;
          }
        }
        return updated;
      });
      return { ...prev, components: newComponents };
    });
  };

  const handleDeleteComponent = (id: string) => {
    if (isLocked) return;
    setFormData(prev => ({
      ...prev,
      components: prev.components.filter(c => c.id !== id)
    }));
  };

  const handleDuplicateComponent = (comp: AnalysisComponent) => {
    if (isLocked) return;
    const duplicated: AnalysisComponent = {
      ...comp,
      id: Math.random().toString(36).substr(2, 9),
      measurements: comp.measurements ? comp.measurements.map(m => ({ ...m, id: Math.random().toString(36).substr(2, 9) })) : []
    };
    setFormData(prev => ({
      ...prev,
      components: [...prev.components, duplicated]
    }));
  };

  // GESTIONE MISURAZIONI DETTAGLIATE PER SINGOLO COMPONENTE (MINI-COMPUTO)
  const toggleMeasurements = (compId: string) => {
    setExpandedMeasurementIds(prev => {
      const next = new Set(prev);
      if (next.has(compId)) next.delete(compId);
      else next.add(compId);
      return next;
    });
  };

  const handleAddMeasurementRow = (compId: string) => {
    if (isLocked) return;
    const newMeas: AnalysisMeasurement = {
      id: Math.random().toString(36).substr(2, 9),
      description: 'Misura di computo',
      multiplier: 1,
      length: 1,
      width: undefined,
      height: undefined
    };
    setFormData(prev => ({
      ...prev,
      components: prev.components.map(c => {
        if (c.id !== compId) return c;
        const currentMeas = c.measurements || [];
        return { ...c, measurements: [...currentMeas, newMeas] };
      })
    }));
  };

  const handleUpdateMeasurementRow = (compId: string, measId: string, field: keyof AnalysisMeasurement, value: any) => {
    if (isLocked) return;
    setFormData(prev => ({
      ...prev,
      components: prev.components.map(c => {
        if (c.id !== compId) return c;
        const updatedMeas = (c.measurements || []).map(m => {
          if (m.id !== measId) return m;
          return { ...m, [field]: value };
        });
        return { ...c, measurements: updatedMeas };
      })
    }));
  };

  const handleDeleteMeasurementRow = (compId: string, measId: string) => {
    if (isLocked) return;
    setFormData(prev => ({
      ...prev,
      components: prev.components.map(c => {
        if (c.id !== compId) return c;
        return {
          ...c,
          measurements: (c.measurements || []).filter(m => m.id !== measId)
        };
      })
    }));
  };

  // GESTIONE DRAG & DROP DA PREZZARI ESTERNI E DA COMPUTO
  const handleDropOnGroup = (e: React.DragEvent, targetType?: 'material' | 'labor' | 'equipment') => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroup(null);
    if (isLocked) return;

    const rawText = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
    if (!rawText) return;

    const parsed = parseDroppedContent(rawText);
    if (parsed) {
      let finalType: 'material' | 'labor' | 'equipment' = targetType || 'material';

      if (!targetType) {
        const descLower = (parsed.description || '').toLowerCase();
        if (descLower.includes('operaio') || descLower.includes('manodopera') || descLower.includes('posatore') || descLower.includes('assistente')) {
          finalType = 'labor';
        } else if (descLower.includes('nolo') || descLower.includes('autocarro') || descLower.includes('gru') || descLower.includes('escavatore') || descLower.includes('pompa') || descLower.includes('ponteggio')) {
          finalType = 'equipment';
        }
      }

      handleAddComponent(finalType, {
        code: parsed.code || 'NP.001',
        description: parsed.description || 'Elemento da prezzario',
        unit: parsed.unit || (finalType === 'labor' ? 'h' : 'm²'),
        unitPrice: parsed.unitPrice || 0,
        quantity: 1,
        // Di default, una voce importata da prezzario regionale contiene già Spese Generali e Utile!
        includesMarkup: true,
        sourcePriceList: parsed.priceListSource || 'Prezzario Regionale'
      });
    }
  };

  // SALVATAGGIO
  const handleSave = () => {
    if (isLocked) return;

    // Normalizza i componenti sincronizzando le quantità dalle misure se presenti
    const finalizedComponents = formData.components.map(c => {
      const qty = getComponentQuantity(c);
      return {
        ...c,
        quantity: qty,
        description: cleanDescription(c.description),
        code: cleanDescription(c.code || ''),
        unit: cleanDescription(c.unit)
      };
    });

    const finalAnalysis: PriceAnalysis = {
      ...formData,
      description: cleanDescription(formData.description),
      code: cleanDescription(formData.code),
      unit: cleanDescription(formData.unit),
      components: finalizedComponents,
      totalMaterials: calculated.matTotal,
      totalLabor: calculated.labTotal,
      totalEquipment: calculated.eqTotal,
      costoTecnico: calculated.costoTecnicoTotale,
      valoreSpese: calculated.speseGenerali,
      valoreUtile: calculated.utileImpresa,
      totalBatchValue: calculated.totaleLotto,
      totalUnitPrice: calculated.unitPrice,
      totalNetItems: calculated.costoTecnicoNetto,
      totalInclusiveItems: calculated.costoTecnicoComprensivo
    };

    onSave(finalAnalysis);
    onClose();
  };

  const handlePrintPreview = () => {
    const tempAnalysis: PriceAnalysis = {
      ...formData,
      totalMaterials: calculated.matTotal,
      totalLabor: calculated.labTotal,
      totalEquipment: calculated.eqTotal,
      costoTecnico: calculated.costoTecnicoTotale,
      valoreSpese: calculated.speseGenerali,
      valoreUtile: calculated.utileImpresa,
      totalBatchValue: calculated.totaleLotto,
      totalUnitPrice: calculated.unitPrice
    };
    generateAnalisiPrezziPdf(
      projectInfo || {
        title: 'Progetto Edile',
        client: 'Committente',
        designer: 'Progettista',
        location: '',
        date: new Date().toLocaleDateString('it-IT'),
        priceList: 'Prezzario Ufficiale',
        region: 'Regione',
        year: '2025',
        vatRate: 10,
        safetyRate: 3.5
      },
      [tempAnalysis]
    );
  };

  const formatEuro = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: true }).format(n);
  const formatNum = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });

  // Raggruppamento componenti
  const materials = formData.components.filter(c => c.type === 'material');
  const labor = formData.components.filter(c => c.type === 'labor');
  const equipment = formData.components.filter(c => c.type === 'equipment');

  const visibleGroups = [
    { key: 'material', title: '1. MATERIALI E FORNITURE', color: 'orange', icon: Package, items: materials, total: calculated.matTotal, net: calculated.matNet, inc: calculated.matInc },
    { key: 'labor', title: '2. MANODOPERA E OPERAI', color: 'blue', icon: Hammer, items: labor, total: calculated.labTotal, net: calculated.labNet, inc: calculated.labInc },
    { key: 'equipment', title: '3. NOLI, TRASPORTI E ATTREZZATURE', color: 'green', icon: Truck, items: equipment, total: calculated.eqTotal, net: calculated.eqNet, inc: calculated.eqInc },
  ].filter(g => selectedGroupFilter === 'ALL' || selectedGroupFilter === g.key);

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-3 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      {/* CATALOG DATALISTS */}
      <datalist id={sharedDatalistId}>
        {COMMON_UNITS.map((u, i) => (<option key={`${u}-${i}`} value={u} />))}
      </datalist>
      <datalist id={laborDatalistId}>
        {LABOR_CATALOG.map((item, i) => (<option key={i} value={item.description}>{formatEuro(item.price)}/h</option>))}
      </datalist>
      <datalist id={equipDatalistId}>
        {EQUIPMENT_CATALOG.map((item, i) => (<option key={i} value={item.description}>{formatEuro(item.price)}/h</option>))}
      </datalist>
      <datalist id={matDatalistId}>
        {MATERIAL_CATALOG.map((item, i) => (<option key={i} value={item.description}>{formatEuro(item.price)}/{item.unit}</option>))}
      </datalist>

      <div 
        className={`bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-300 relative transition-all duration-300 ${
          isMaximized ? 'w-[98vw] h-[96vh]' : 'w-full max-w-7xl h-[92vh]'
        } ${isLocked ? 'opacity-95' : ''}`}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={(e) => handleDropOnGroup(e)}
      >
        {/* MODALE DESCRIZIONE ESTESA */}
        {isDescriptionExpanded && (
          <div className="absolute inset-0 z-50 bg-white flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-3">
              <div>
                <h4 className="font-bold text-xl text-purple-900 flex items-center gap-2"><Maximize2 className="w-5 h-5"/> Descrizione Estesa Analisi Prezzo</h4>
                <p className="text-gray-500 text-xs">Tariffa: <span className="font-mono font-bold text-purple-700">{formData.code}</span></p>
              </div>
              <button onClick={() => setIsDescriptionExpanded(false)} className="bg-purple-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-purple-700 flex items-center gap-2 shadow-md transition-transform hover:scale-105">
                <Minimize2 className="w-4 h-4" /> Conferma e Riduci
              </button>
            </div>
            <textarea
              value={formData.description}
              onChange={e => !isLocked && setFormData({...formData, description: e.target.value})}
              readOnly={isLocked}
              className={`flex-1 w-full border border-gray-300 rounded-xl p-6 text-base font-serif text-gray-800 shadow-inner resize-none focus:ring-2 focus:ring-purple-500 outline-none leading-relaxed text-justify ${isLocked ? 'bg-gray-50 cursor-not-allowed' : ''}`}
              autoFocus
              placeholder="Inserisci la descrizione tecnica dettagliata della lavorazione..."
            />
          </div>
        )}

        {/* TOP BAR / HEADER */}
        <div className="bg-gradient-to-r from-purple-800 via-purple-700 to-indigo-800 px-6 py-3.5 flex justify-between items-center text-white flex-shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-xs">
              <Calculator className="w-6 h-6 text-purple-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg tracking-tight flex items-center gap-2">
                  ANALISI PREZZO UNITARIO
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-md font-mono text-purple-200">Computo Metrico Analitico</span>
                </h3>
                {isLocked && (
                  <span className="bg-red-500/80 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                    <Lock className="w-3 h-3" /> BLOCCATA
                  </span>
                )}
              </div>
              <p className="text-purple-200 text-xs">Strutturata in 3 gruppi (Materiali, Manodopera, Noli) con scorporo/esclusione Spese Generali & Utile</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={handlePrintPreview} 
              className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-white/20 transition-all hover:scale-105"
              title="Stampa Scheda Analisi PDF"
            >
              <FileText className="w-4 h-4 text-purple-200" />
              <span>Stampa PDF</span>
            </button>
            <button 
              onClick={() => setIsMaximized(!isMaximized)} 
              className="text-purple-200 hover:text-white bg-white/10 p-2 rounded-lg transition-colors"
              title={isMaximized ? "Ripristina dimensioni" : "Massimizza"}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button 
              onClick={onClose} 
              className="text-purple-200 hover:text-white bg-white/10 hover:bg-red-500 p-2 rounded-lg transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CORPO PRINCIPALE: GRIGLIA A SINISTRA (MINI COMPUTO) + TABELLA RIEPILOGATIVA A DESTRA */}
        <div className="flex flex-1 overflow-hidden">
          {/* AREA SINISTRA: TESTATA VOCE + 3 GRUPPI DI LAVORAZIONE */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
            {/* PARAMETRI GENERALI VOCE DI ANALISI */}
            <div className="p-3.5 bg-white border-b border-slate-200 grid grid-cols-12 gap-3 items-start shadow-xs flex-shrink-0">
              <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Codice Tariffa</label>
                <input 
                  type="text" 
                  readOnly={isLocked} 
                  value={formData.code} 
                  onChange={e => setFormData({...formData, code: e.target.value})} 
                  className={`w-full border border-slate-300 rounded-lg p-2 text-sm font-black font-mono text-purple-900 bg-purple-50/30 focus:bg-white focus:ring-2 focus:ring-purple-400 outline-none ${isLocked ? 'bg-slate-100 cursor-not-allowed' : ''}`} 
                  placeholder="Es. AP.01"
                />
              </div>

              <div className="col-span-6 relative">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-black uppercase text-slate-500">Designazione / Descrizione Lavorazione</label>
                  <button 
                    onClick={() => setIsDescriptionExpanded(true)} 
                    className="text-purple-700 hover:text-purple-900 text-[10px] font-black flex items-center gap-1 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 hover:bg-purple-100 transition-colors"
                  >
                    <Maximize2 className="w-3 h-3" /> Espandi
                  </button>
                </div>
                <textarea 
                  readOnly={isLocked} 
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})} 
                  className={`w-full border border-slate-300 rounded-lg p-2 text-xs resize-none h-[48px] leading-tight focus:ring-2 focus:ring-purple-400 outline-none text-justify ${isLocked ? 'bg-slate-100 cursor-not-allowed' : ''}`} 
                  placeholder="Descrizione estesa dell'opera finita (es. Posa in opera di sottofondo alleggerito...)" 
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1 flex items-center gap-1">
                  <Scale className="w-3 h-3 text-purple-600" /> Quantità Lotto
                </label>
                <input 
                  readOnly={isLocked} 
                  type="number" 
                  step="any"
                  value={formData.analysisQuantity || ''} 
                  onChange={e => setFormData({...formData, analysisQuantity: parseFloat(e.target.value) || 0})} 
                  className={`w-full border border-purple-300 rounded-lg p-2 text-sm text-center font-black text-purple-900 bg-purple-50/50 focus:ring-2 focus:ring-purple-400 outline-none ${isLocked ? 'bg-white cursor-not-allowed' : ''}`} 
                  placeholder="1.00" 
                />
              </div>

              <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">U.M. Finale</label>
                <input 
                  readOnly={isLocked} 
                  type="text" 
                  list={sharedDatalistId} 
                  value={formData.unit} 
                  onChange={e => setFormData({...formData, unit: e.target.value})} 
                  className={`w-full border border-slate-300 rounded-lg p-2 text-sm text-center font-black text-slate-700 focus:ring-2 focus:ring-purple-400 outline-none ${isLocked ? 'bg-slate-100 cursor-not-allowed' : ''}`} 
                  placeholder="m²"
                  autoComplete="off" 
                />
              </div>
            </div>

            {/* BARRA FILTRI GRUPPI E AZIONI RAPIDE */}
            <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase text-slate-500 mr-2 flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3" /> Gruppi:
                </span>
                <button 
                  onClick={() => setSelectedGroupFilter('ALL')} 
                  className={`px-3 py-1 rounded-lg text-xs font-black uppercase transition-all ${
                    selectedGroupFilter === 'ALL' ? 'bg-purple-700 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  TUTTI I 3 GRUPPI ({formData.components.length})
                </button>
                <button 
                  onClick={() => setSelectedGroupFilter('material')} 
                  className={`px-3 py-1 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-1.5 ${
                    selectedGroupFilter === 'material' ? 'bg-orange-600 text-white shadow-xs' : 'bg-white text-orange-700 hover:bg-orange-50 border border-orange-200'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" /> Materiali ({materials.length})
                </button>
                <button 
                  onClick={() => setSelectedGroupFilter('labor')} 
                  className={`px-3 py-1 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-1.5 ${
                    selectedGroupFilter === 'labor' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-blue-700 hover:bg-blue-50 border border-blue-200'
                  }`}
                >
                  <Hammer className="w-3.5 h-3.5" /> Manodopera ({labor.length})
                </button>
                <button 
                  onClick={() => setSelectedGroupFilter('equipment')} 
                  className={`px-3 py-1 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-1.5 ${
                    selectedGroupFilter === 'equipment' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" /> Noli ({equipment.length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 italic bg-white px-2.5 py-1 rounded border border-slate-200 flex items-center gap-1">
                  <Info className="w-3 h-3 text-purple-600" /> Trascina qui voci da prezzari o dal computo
                </span>
              </div>
            </div>

            {/* TABELLA COMPUTO DELLE VOCI SUDDIVISA IN 3 GRUPPI */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6">
              {visibleGroups.map(group => {
                const GroupIcon = group.icon;
                const isOver = dragOverGroup === group.key;

                return (
                  <div 
                    key={group.key}
                    onDragOver={(e) => { e.preventDefault(); setDragOverGroup(group.key as any); }}
                    onDragLeave={() => setDragOverGroup(null)}
                    onDrop={(e) => handleDropOnGroup(e, group.key as any)}
                    className={`bg-white rounded-xl border transition-all shadow-xs overflow-hidden ${
                      isOver ? 'ring-2 ring-purple-500 border-purple-500 bg-purple-50/20' : 'border-slate-200'
                    }`}
                  >
                    {/* INTESTAZIONE GRUPPO */}
                    <div className={`px-4 py-2.5 flex justify-between items-center border-b ${
                      group.key === 'material' ? 'bg-orange-50/80 border-orange-200 text-orange-950' :
                      group.key === 'labor' ? 'bg-blue-50/80 border-blue-200 text-blue-950' :
                      'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg ${
                          group.key === 'material' ? 'bg-orange-500 text-white' :
                          group.key === 'labor' ? 'bg-blue-500 text-white' :
                          'bg-emerald-500 text-white'
                        }`}>
                          <GroupIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-black text-xs uppercase tracking-wider">{group.title}</h4>
                          <span className="text-[10px] opacity-75">
                            {group.items.length} {group.items.length === 1 ? 'elemento' : 'elementi'}
                            {group.inc > 0 && ` • di cui ${formatEuro(group.inc)} già con S.G. e Utile`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[9px] uppercase font-bold text-slate-500 block leading-tight">Subtotale {group.title.split('.')[1]?.trim()}</span>
                          <span className="font-mono font-black text-sm text-slate-900">{formatEuro(group.total)}</span>
                        </div>

                        {!isLocked && (
                          <button
                            onClick={() => handleAddComponent(group.key as any)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1 shadow-xs transition-all hover:scale-105 active:scale-95 text-white ${
                              group.key === 'material' ? 'bg-orange-600 hover:bg-orange-700' :
                              group.key === 'labor' ? 'bg-blue-600 hover:bg-blue-700' :
                              'bg-emerald-600 hover:bg-emerald-700'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" /> + Aggiungi
                          </button>
                        )}
                      </div>
                    </div>

                    {/* GRIGLIA VOCI DEL GRUPPO */}
                    {group.items.length === 0 ? (
                      <div 
                        onClick={() => !isLocked && handleAddComponent(group.key as any)}
                        className="py-8 text-center text-slate-400 border-2 border-dashed border-slate-200 m-3 rounded-lg hover:border-purple-300 hover:bg-purple-50/10 cursor-pointer transition-all"
                      >
                        <p className="text-xs font-medium">Nessun elemento in {group.title}. Clicca qui o trascina da prezzario per aggiungere.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[9px] tracking-wider">
                            <tr>
                              <th className="py-2 px-2.5 w-10 text-center">#</th>
                              <th className="py-2 px-2.5 w-24">Codice</th>
                              <th className="py-2 px-2.5">Descrizione Elemento / Risorsa</th>
                              <th className="py-2 px-2 w-14 text-center">U.M.</th>
                              <th className="py-2 px-2 w-28 text-center bg-blue-50/50">Quantità</th>
                              <th className="py-2 px-2 w-24 text-right">Prezzo Unit. €</th>
                              <th className="py-2 px-2 w-28 text-right font-black">Importo €</th>
                              <th className="py-2 px-2 w-44 text-center bg-slate-100/80">Spuntatura S.G. & Utile</th>
                              <th className="py-2 px-2 w-16 text-center">Azioni</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.items.map((comp, compIdx) => {
                              const dlId = comp.type === 'labor' ? laborDatalistId : comp.type === 'equipment' ? equipDatalistId : matDatalistId;
                              const effectiveQty = getComponentQuantity(comp);
                              const compAmount = effectiveQty * (comp.unitPrice || 0);
                              const isMeasurementsOpen = expandedMeasurementIds.has(comp.id);
                              const hasMeasurements = comp.measurements && comp.measurements.length > 0;

                              return (
                                <React.Fragment key={comp.id}>
                                  <tr className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="py-2 px-2.5 text-center font-mono text-slate-400">
                                      {compIdx + 1}
                                    </td>

                                    {/* CODICE */}
                                    <td className="py-2 px-2.5">
                                      <input 
                                        type="text"
                                        readOnly={isLocked}
                                        value={comp.code || ''}
                                        onChange={e => handleUpdateComponent(comp.id, 'code', e.target.value)}
                                        placeholder="Codice..."
                                        className="w-full bg-transparent font-mono font-bold text-slate-700 text-xs focus:ring-1 focus:ring-purple-300 rounded px-1 py-0.5"
                                      />
                                    </td>

                                    {/* DESCRIZIONE */}
                                    <td className="py-2 px-2.5">
                                      <div className="flex flex-col">
                                        <input 
                                          type="text" 
                                          list={dlId}
                                          readOnly={isLocked} 
                                          value={comp.description} 
                                          onChange={e => handleUpdateComponent(comp.id, 'description', e.target.value)} 
                                          className={`w-full bg-transparent font-medium text-slate-800 text-xs focus:ring-1 focus:ring-purple-300 rounded px-1 py-0.5 ${isLocked ? 'cursor-not-allowed' : ''}`}
                                          placeholder="Seleziona dal catalogo o digita descrizione..."
                                        />
                                        {comp.sourcePriceList && (
                                          <span className="text-[9px] text-purple-600 font-mono pl-1">Origine: {comp.sourcePriceList}</span>
                                        )}
                                      </div>
                                    </td>

                                    {/* UM */}
                                    <td className="py-2 px-2 text-center">
                                      <input 
                                        readOnly={isLocked} 
                                        type="text" 
                                        list={sharedDatalistId} 
                                        value={comp.unit} 
                                        onChange={e => handleUpdateComponent(comp.id, 'unit', e.target.value)} 
                                        className={`w-full bg-transparent text-center font-bold text-slate-600 text-xs focus:ring-1 focus:ring-purple-300 rounded px-1 py-0.5 ${isLocked ? 'cursor-not-allowed' : ''}`} 
                                        autoComplete="off" 
                                      />
                                    </td>

                                    {/* QUANTITÀ + TASTO MISURE */}
                                    <td className="py-2 px-2 bg-blue-50/30 text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        {hasMeasurements ? (
                                          <span className="font-mono font-black text-blue-900 text-xs px-1.5 py-0.5 bg-blue-100 rounded border border-blue-200">
                                            {formatNum(effectiveQty)}
                                          </span>
                                        ) : (
                                          <input 
                                            readOnly={isLocked} 
                                            type="number" 
                                            step="any" 
                                            value={comp.quantity} 
                                            onChange={e => handleUpdateComponent(comp.id, 'quantity', parseFloat(e.target.value) || 0)} 
                                            className={`w-16 bg-white border border-blue-200 focus:ring-1 focus:ring-blue-400 text-center font-mono font-black text-blue-900 text-xs rounded p-1 ${isLocked ? 'cursor-not-allowed' : ''}`} 
                                          />
                                        )}
                                        <button
                                          onClick={() => toggleMeasurements(comp.id)}
                                          className={`p-1 rounded transition-colors ${
                                            hasMeasurements 
                                              ? 'bg-blue-600 text-white' 
                                              : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                                          }`}
                                          title={hasMeasurements ? `Modifica ${comp.measurements?.length} misure` : "Aggiungi sviluppo misure (mini-computo)"}
                                        >
                                          {isMeasurementsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                        </button>
                                      </div>
                                    </td>

                                    {/* PREZZO UNITARIO */}
                                    <td className="py-2 px-2 text-right">
                                      <input 
                                        readOnly={isLocked} 
                                        type="number" 
                                        step="0.01" 
                                        value={comp.unitPrice} 
                                        onChange={e => handleUpdateComponent(comp.id, 'unitPrice', parseFloat(e.target.value) || 0)} 
                                        className={`w-20 bg-transparent text-right font-mono font-bold text-slate-800 text-xs focus:ring-1 focus:ring-purple-300 rounded px-1 py-0.5 ${isLocked ? 'cursor-not-allowed' : ''}`} 
                                      />
                                    </td>

                                    {/* IMPORTO TOTALE */}
                                    <td className="py-2 px-2 text-right font-mono font-black text-slate-900 text-xs">
                                      {formatEuro(compAmount)}
                                    </td>

                                    {/* SPUNTATURA PARTICOLARE S.G. & UTILE D'IMPRESA */}
                                    <td className="py-2 px-2 bg-slate-50 text-center">
                                      <button
                                        disabled={isLocked}
                                        onClick={() => handleUpdateComponent(comp.id, 'includesMarkup', !comp.includesMarkup)}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1.5 mx-auto border ${
                                          comp.includesMarkup
                                            ? 'bg-purple-100 border-purple-300 text-purple-800 shadow-xs'
                                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                        }`}
                                        title={
                                          comp.includesMarkup
                                            ? "Voce da prezzario con Spese Generali e Utile già inclusi. Non subirà ulteriore ricarico."
                                            : "Voce al netto elementare. Subirà il ricarico di Spese Generali e Utile d'Impresa alla fine."
                                        }
                                      >
                                        {comp.includesMarkup ? (
                                          <>
                                            <ShieldCheck className="w-3 h-3 text-purple-600" />
                                            <span>Già Comprensiva</span>
                                          </>
                                        ) : (
                                          <>
                                            <Check className="w-3 h-3 text-emerald-600" />
                                            <span>Al Netto (Soggetta)</span>
                                          </>
                                        )}
                                      </button>
                                    </td>

                                    {/* AZIONI */}
                                    <td className="py-2 px-2 text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <button 
                                          onClick={() => handleDuplicateComponent(comp)}
                                          className="text-slate-400 hover:text-purple-600 p-1 rounded hover:bg-purple-50 transition-colors"
                                          title="Duplica Elemento"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>
                                        {!isLocked && (
                                          <button 
                                            onClick={() => handleDeleteComponent(comp.id)} 
                                            className="text-slate-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                                            title="Elimina Elemento"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>

                                  {/* SEZIONE RIGHETTI MISURE DETTAGLIATE (MINI-COMPUTO PILATO) */}
                                  {isMeasurementsOpen && (
                                    <tr className="bg-blue-50/40 border-b border-blue-100">
                                      <td colSpan={9} className="p-3 pl-8">
                                        <div className="bg-white rounded-lg border border-blue-200 p-3 shadow-inner">
                                          <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                                              <Scale className="w-3.5 h-3.5 text-blue-600" /> 
                                              Sviluppo Misurazioni per "{comp.description || comp.code}":
                                            </span>
                                            <button
                                              onClick={() => handleAddMeasurementRow(comp.id)}
                                              className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded text-[10px] font-black uppercase flex items-center gap-1 shadow-xs"
                                            >
                                              <Plus className="w-3 h-3" /> + Nuovo Rigo Misura
                                            </button>
                                          </div>

                                          <table className="w-full text-left text-xs">
                                            <thead className="text-[9px] uppercase font-bold text-slate-500 border-b border-slate-200">
                                              <tr>
                                                <th className="py-1 px-2">Descrizione Rigo</th>
                                                <th className="py-1 px-2 w-20 text-center">Parti Ug.</th>
                                                <th className="py-1 px-2 w-20 text-center">Lunghezza</th>
                                                <th className="py-1 px-2 w-20 text-center">Larghezza</th>
                                                <th className="py-1 px-2 w-20 text-center">Altezza/Peso</th>
                                                <th className="py-1 px-2 w-24 text-right">Quantità Rigo</th>
                                                <th className="py-1 px-2 w-10 text-center"></th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {(comp.measurements || []).map((meas, mIdx) => {
                                                const hasDims = meas.length !== undefined || meas.width !== undefined || meas.height !== undefined;
                                                const mult = meas.multiplier !== undefined ? meas.multiplier : (hasDims ? 1 : 0);
                                                const l = meas.length === undefined ? 1 : meas.length;
                                                const w = meas.width === undefined ? 1 : meas.width;
                                                const h = meas.height === undefined ? 1 : meas.height;
                                                const rowVal = hasDims ? (mult * l * w * h) : mult;

                                                return (
                                                  <tr key={meas.id} className="hover:bg-slate-50">
                                                    <td className="py-1 px-2">
                                                      <input
                                                        type="text"
                                                        value={meas.description}
                                                        onChange={e => handleUpdateMeasurementRow(comp.id, meas.id, 'description', e.target.value)}
                                                        className="w-full bg-transparent border-none text-xs text-slate-700 focus:ring-1 focus:ring-blue-300 rounded p-1"
                                                        placeholder="Descrizione (es. Travi piano terra...)"
                                                      />
                                                    </td>
                                                    <td className="py-1 px-2 text-center">
                                                      <input
                                                        type="number"
                                                        step="any"
                                                        value={meas.multiplier ?? ''}
                                                        onChange={e => handleUpdateMeasurementRow(comp.id, meas.id, 'multiplier', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                                        className="w-16 text-center bg-slate-50 border border-slate-200 text-xs font-mono rounded p-1"
                                                        placeholder="1"
                                                      />
                                                    </td>
                                                    <td className="py-1 px-2 text-center">
                                                      <input
                                                        type="number"
                                                        step="any"
                                                        value={meas.length ?? ''}
                                                        onChange={e => handleUpdateMeasurementRow(comp.id, meas.id, 'length', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                                        className="w-16 text-center bg-slate-50 border border-slate-200 text-xs font-mono rounded p-1"
                                                        placeholder="m"
                                                      />
                                                    </td>
                                                    <td className="py-1 px-2 text-center">
                                                      <input
                                                        type="number"
                                                        step="any"
                                                        value={meas.width ?? ''}
                                                        onChange={e => handleUpdateMeasurementRow(comp.id, meas.id, 'width', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                                        className="w-16 text-center bg-slate-50 border border-slate-200 text-xs font-mono rounded p-1"
                                                        placeholder="m"
                                                      />
                                                    </td>
                                                    <td className="py-1 px-2 text-center">
                                                      <input
                                                        type="number"
                                                        step="any"
                                                        value={meas.height ?? ''}
                                                        onChange={e => handleUpdateMeasurementRow(comp.id, meas.id, 'height', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                                        className="w-16 text-center bg-slate-50 border border-slate-200 text-xs font-mono rounded p-1"
                                                        placeholder="m/kg"
                                                      />
                                                    </td>
                                                    <td className="py-1 px-2 text-right font-mono font-bold text-blue-900">
                                                      {formatNum(rowVal)}
                                                    </td>
                                                    <td className="py-1 px-2 text-center">
                                                      <button
                                                        onClick={() => handleDeleteMeasurementRow(comp.id, meas.id)}
                                                        className="text-slate-300 hover:text-red-500 p-1"
                                                      >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                      </button>
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                            <tfoot>
                                              <tr className="border-t border-blue-200 font-bold bg-blue-50/50">
                                                <td colSpan={5} className="py-1.5 px-2 text-right uppercase text-[10px] text-blue-900">
                                                  Sommano Quantità ({comp.unit}):
                                                </td>
                                                <td className="py-1.5 px-2 text-right font-mono font-black text-blue-900">
                                                  {formatNum(effectiveQty)}
                                                </td>
                                                <td></td>
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* AREA DESTRA: TABELLA RIEPILOGATIVA ACCANTO (QUADRO ECONOMICO UFFICIALE) */}
          <div className="w-88 md:w-96 bg-white border-l border-slate-200 shadow-xl flex flex-col justify-between overflow-y-auto flex-shrink-0">
            <div>
              {/* TESTATA RIEPILOGO */}
              <div className="p-4 bg-slate-900 text-white flex justify-between items-center shadow-xs">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-purple-400" />
                  <h4 className="font-black text-xs uppercase tracking-widest">Quadro Economico Analisi</h4>
                </div>
                <span className="text-[10px] font-mono text-purple-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                  D.Lgs 36/2023
                </span>
              </div>

              {/* 1. RIPARTIZIONE DEI 3 GRUPPI DI COSTO */}
              <div className="p-4 border-b border-slate-200 bg-slate-50/50 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Costi Tecnici Diretti</span>
                  <span className="text-[10px] text-slate-400 font-bold">Incidenza %</span>
                </div>

                {/* Materiali */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1.5 text-slate-700 font-bold">
                      <Package className="w-3.5 h-3.5 text-orange-500" /> Materiali e Forniture
                    </span>
                    <span className="font-mono font-bold text-slate-900">{formatEuro(calculated.matTotal)}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-orange-500 h-full rounded-full transition-all" 
                      style={{ width: `${calculated.costoTecnicoTotale > 0 ? (calculated.matTotal / calculated.costoTecnicoTotale) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Manodopera */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1.5 text-slate-700 font-bold">
                      <Hammer className="w-3.5 h-3.5 text-blue-500" /> Manodopera Totale
                    </span>
                    <span className="font-mono font-bold text-slate-900">{formatEuro(calculated.labTotal)}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-full rounded-full transition-all" 
                      style={{ width: `${calculated.costoTecnicoTotale > 0 ? (calculated.labTotal / calculated.costoTecnicoTotale) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Noli */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1.5 text-slate-700 font-bold">
                      <Truck className="w-3.5 h-3.5 text-emerald-500" /> Noli e Attrezzature
                    </span>
                    <span className="font-mono font-bold text-slate-900">{formatEuro(calculated.eqTotal)}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full rounded-full transition-all" 
                      style={{ width: `${calculated.costoTecnicoTotale > 0 ? (calculated.eqTotal / calculated.costoTecnicoTotale) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Totale Costo Tecnico */}
                <div className="border-t border-slate-300 pt-2 flex justify-between items-center text-xs font-black uppercase text-slate-900">
                  <span>Totale Costo Tecnico:</span>
                  <span className="font-mono text-sm text-purple-900">{formatEuro(calculated.costoTecnicoTotale)}</span>
                </div>
              </div>

              {/* 2. GESTIONE SPESE GENERALI & UTILE D'IMPRESA CON SPUNTATURA E SCORPORO */}
              <div className="p-4 border-b border-slate-200 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Spese Generali & Utile</span>
                  <span className="text-[9px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded">
                    {formData.markupMode === 'unbundle_and_reapply' ? 'Scorporo Uniforme' : 'Esclusione da Ricarico'}
                  </span>
                </div>

                {/* Dettaglio quote imponibili */}
                <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-600 flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-600" /> Quota al Netto (Soggetta a Ricarico):
                    </span>
                    <span className="font-mono font-bold text-slate-900">{formatEuro(calculated.costoTecnicoNetto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-purple-600" /> Quota già Comprensiva (Prezzario):
                    </span>
                    <span className="font-mono font-bold text-slate-900">{formatEuro(calculated.costoTecnicoComprensivo)}</span>
                  </div>
                </div>

                {/* Spese Generali */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      Spese Generali
                      <div className="flex items-center ml-2">
                        <input 
                          type="number"
                          step="0.1"
                          readOnly={isLocked}
                          value={formData.generalExpensesRate}
                          onChange={e => setFormData({...formData, generalExpensesRate: parseFloat(e.target.value) || 0})}
                          className={`w-12 text-center border border-slate-300 rounded text-xs font-bold font-mono text-purple-800 p-0.5 ${isLocked ? 'cursor-not-allowed bg-slate-100' : 'bg-white'}`}
                        />
                        <span className="text-[10px] font-bold text-slate-500 ml-1">%</span>
                      </div>
                    </label>
                    <span className="font-mono font-bold text-xs text-slate-900">{formatEuro(calculated.speseGenerali)}</span>
                  </div>
                </div>

                {/* Utile Impresa */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      Utile d'Impresa
                      <div className="flex items-center ml-2">
                        <input 
                          type="number"
                          step="0.1"
                          readOnly={isLocked}
                          value={formData.profitRate}
                          onChange={e => setFormData({...formData, profitRate: parseFloat(e.target.value) || 0})}
                          className={`w-12 text-center border border-slate-300 rounded text-xs font-bold font-mono text-purple-800 p-0.5 ${isLocked ? 'cursor-not-allowed bg-slate-100' : 'bg-white'}`}
                        />
                        <span className="text-[10px] font-bold text-slate-500 ml-1">%</span>
                      </div>
                    </label>
                    <span className="font-mono font-bold text-xs text-slate-900">{formatEuro(calculated.utileImpresa)}</span>
                  </div>
                </div>

                {/* Toggle Modalità Scorporo / Esclusione */}
                <div className="pt-1">
                  <button
                    disabled={isLocked}
                    onClick={() => setFormData({
                      ...formData, 
                      markupMode: formData.markupMode === 'unbundle_and_reapply' ? 'exclude_from_markup' : 'unbundle_and_reapply'
                    })}
                    className="w-full text-left p-2 rounded-lg border border-purple-200 bg-purple-50/50 hover:bg-purple-100/60 transition-colors flex items-center justify-between group"
                    title="Clicca per commutare tra esclusione e ricalcolo con scorporo uniforme"
                  >
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase text-purple-900">
                        {formData.markupMode === 'unbundle_and_reapply' 
                          ? "Scorpora prezzari e ricalcola uniformemente" 
                          : "Non ricaricare le voci già comprensive"}
                      </span>
                      <span className="text-[9px] text-purple-700 opacity-80">
                        {formData.markupMode === 'unbundle_and_reapply'
                          ? "Applica SG e Utile su tutto il lotto dopo scorporo"
                          : "SG e Utile aggiunti solo sulla quota netta"}
                      </span>
                    </div>
                    <RefreshCw className="w-3.5 h-3.5 text-purple-600 group-hover:rotate-180 transition-transform" />
                  </button>
                </div>
              </div>

              {/* 3. TOTALE LOTTO ANALIZZATO */}
              <div className="p-4 border-b border-slate-200 bg-slate-50/80">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-600 uppercase text-[10px]">Importo Totale Lotto ({formData.analysisQuantity} {formData.unit}):</span>
                  <span className="font-mono font-black text-sm text-slate-900">{formatEuro(calculated.totaleLotto)}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1">
                  <span>Incidenza Manodopera Finale:</span>
                  <span className="font-mono font-bold text-blue-700">{calculated.laborIncidence.toFixed(2)}%</span>
                </div>
              </div>
            </div>

            {/* BOX HERO PREZZO UNITARIO FINALE + AZIONI */}
            <div className="p-4 bg-gradient-to-b from-purple-50/80 to-purple-100/60 border-t border-purple-200 space-y-3">
              <div className="bg-white p-3.5 rounded-xl border-2 border-purple-300 shadow-md text-center">
                <span className="text-[9px] font-black uppercase text-purple-800 tracking-[0.2em] block mb-1">
                  PREZZO UNITARIO FINALE (AL NETTO DI RIBASSO)
                </span>
                <div className="text-2xl font-black font-mono text-purple-900 leading-none">
                  {formatEuro(calculated.unitPrice)}
                </div>
                <span className="text-[10px] text-purple-600 font-bold uppercase tracking-wider block mt-1">
                  per ogni {formData.unit}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl font-bold uppercase text-[10px] border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors shadow-xs"
                >
                  Annulla
                </button>
                <button
                  onClick={isLocked ? onClose : handleSave}
                  disabled={!formData.code || (calculated.totaleLotto === 0 && !isLocked)}
                  className={`w-full py-2.5 rounded-xl font-black uppercase text-[10px] shadow-md flex items-center justify-center gap-1.5 transition-all text-white ${
                    isLocked 
                      ? 'bg-slate-500 hover:bg-slate-600' 
                      : 'bg-purple-700 hover:bg-purple-800 hover:scale-[1.02] active:scale-95'
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isLocked ? "CHIUDI" : "CONFERMA ANALISI"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisEditorModal;