
import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Plus, Trash2, Calculator, Coins, Hammer, Truck, Package, Scale, Maximize2, Minimize2 } from 'lucide-react';
import { PriceAnalysis, AnalysisComponent } from '../types';
import { COMMON_UNITS } from '../constants';

interface AnalysisEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: PriceAnalysis | null;
  onSave: (analysis: PriceAnalysis) => void;
  nextCode?: string;
}

const AnalysisEditorModal: React.FC<AnalysisEditorModalProps> = ({ isOpen, onClose, analysis, onSave, nextCode }) => {
  const [formData, setFormData] = useState<PriceAnalysis>({
    id: '',
    code: '',
    description: '',
    unit: 'cad',
    analysisQuantity: 1,
    components: [],
    generalExpensesRate: 15,
    profitRate: 10,
    totalMaterials: 0,
    totalLabor: 0,
    totalEquipment: 0,
    costoTecnico: 0,
    valoreSpese: 0,
    valoreUtile: 0,
    totalBatchValue: 0,
    totalUnitPrice: 0
  });

  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Unique ID for the main datalist
  const sharedDatalistId = "analysis-units-datalist";

  useEffect(() => {
    if (isOpen) {
      if (analysis) {
        setFormData(JSON.parse(JSON.stringify(analysis))); // Deep copy
      } else {
        setFormData({
            id: Math.random().toString(36).substr(2, 9),
            code: nextCode || 'AP.01',
            description: '',
            unit: 'cad',
            analysisQuantity: 1,
            components: [
                { id: Math.random().toString(36).substr(2, 9), type: 'labor', description: 'Operaio Specializzato', unit: 'h', unitPrice: 35.00, quantity: 1 }
            ],
            generalExpensesRate: 15,
            profitRate: 10,
            totalMaterials: 0,
            totalLabor: 0,
            totalEquipment: 0,
            costoTecnico: 0,
            valoreSpese: 0,
            valoreUtile: 0,
            totalBatchValue: 0,
            totalUnitPrice: 0
        });
      }
    }
  }, [isOpen, analysis, nextCode]);

  // Recalculate totals whenever components, rates, or analysisQuantity change
  const calculatedTotals = useMemo(() => {
    let mat = 0, lab = 0, eq = 0;
    
    // Sum of components is the cost for the BATCH (Analysis Quantity)
    formData.components.forEach(c => {
        const val = c.quantity * c.unitPrice;
        if (c.type === 'material') mat += val;
        else if (c.type === 'labor') lab += val;
        else eq += val;
    });

    const costoTecnico = mat + lab + eq;
    const spese = costoTecnico * (formData.generalExpensesRate / 100);
    const utile = (costoTecnico + spese) * (formData.profitRate / 100);
    const totalBatch = costoTecnico + spese + utile;
    
    // Unit Price = Total Batch / Quantity to Analyze
    const qty = formData.analysisQuantity > 0 ? formData.analysisQuantity : 1;
    const unitPrice = totalBatch / qty;

    return { mat, lab, eq, costoTecnico, spese, utile, totalBatch, unitPrice };
  }, [formData.components, formData.generalExpensesRate, formData.profitRate, formData.analysisQuantity]);

  if (!isOpen) return null;

  const handleAddComponent = (type: 'material' | 'labor' | 'equipment') => {
    const newComp: AnalysisComponent = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        description: type === 'labor' ? 'Nuova figura professionale' : type === 'material' ? 'Nuovo materiale' : 'Nuovo nolo',
        unit: type === 'labor' || type === 'equipment' ? 'h' : 'cad',
        unitPrice: 0,
        quantity: 1
    };
    setFormData(prev => ({ ...prev, components: [...prev.components, newComp] }));
  };

  const handleUpdateComponent = (id: string, field: keyof AnalysisComponent, value: string | number) => {
    setFormData(prev => ({
        ...prev,
        components: prev.components.map(c => c.id === id ? { ...c, [field]: value } : c)
    }));
  };

  const handleDeleteComponent = (id: string) => {
    setFormData(prev => ({
        ...prev,
        components: prev.components.filter(c => c.id !== id)
    }));
  };

  const handleSave = () => {
     const finalAnalysis: PriceAnalysis = {
         ...formData,
         totalMaterials: calculatedTotals.mat,
         totalLabor: calculatedTotals.lab,
         totalEquipment: calculatedTotals.eq,
         costoTecnico: calculatedTotals.costoTecnico,
         valoreSpese: calculatedTotals.spese,
         valoreUtile: calculatedTotals.utile,
         totalBatchValue: calculatedTotals.totalBatch,
         totalUnitPrice: calculatedTotals.unitPrice
     };
     onSave(finalAnalysis);
     onClose();
  };

  const formatEuro = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      {/* Global Datalist for this modal */}
      <datalist id={sharedDatalistId}>
          {COMMON_UNITS.map((u, i) => (
              <option key={`${u}-${i}`} value={u} />
          ))}
      </datalist>

      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-gray-300 relative">
        
        {/* Expanded Description Overlay */}
        {isDescriptionExpanded && (
            <div className="absolute inset-0 z-50 bg-white flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-3">
                    <div>
                        <h4 className="font-bold text-xl text-purple-900 flex items-center gap-2"><Maximize2 className="w-5 h-5"/> Descrizione Estesa Analisi</h4>
                        <p className="text-gray-500 text-sm">Codice: <span className="font-mono font-bold">{formData.code}</span></p>
                    </div>
                    <button 
                        onClick={() => setIsDescriptionExpanded(false)} 
                        className="bg-purple-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-purple-700 flex items-center gap-2 shadow-md transition-transform hover:scale-105"
                    >
                        <Minimize2 className="w-4 h-4" /> Conferma e Chiudi
                    </button>
                </div>
                <div className="flex-1 flex flex-col">
                    <textarea
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        className="flex-1 w-full border border-gray-300 rounded-lg p-6 text-lg font-serif text-gray-800 shadow-inner resize-none focus:ring-2 focus:ring-purple-500 outline-none leading-relaxed"
                        autoFocus
                        placeholder="Inserisci la descrizione tecnica dettagliata dell'analisi..."
                    />
                    <div className="mt-2 text-right text-xs text-gray-400">
                        Caratteri: {formData.description.length}
                    </div>
                </div>
            </div>
        )}

        {/* Header */}
        <div className="bg-[#8e44ad] px-6 py-4 flex justify-between items-center border-b border-gray-600 text-white flex-shrink-0">
          <div>
              <h3 className="font-bold text-xl flex items-center gap-2">
                <Calculator className="w-6 h-6 text-purple-200" />
                Analisi Prezzo Unitario
              </h3>
              <p className="text-purple-200 text-xs">Calcola il costo per una quantità reale e ottieni l'unitario</p>
          </div>
          <button onClick={onClose} className="text-purple-200 hover:text-white transition-colors bg-white/10 p-2 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex flex-1 overflow-hidden">
            {/* Left: Input Form */}
            <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
                {/* Main Config Inputs */}
                <div className="p-4 bg-gray-50 border-b border-gray-200 grid grid-cols-12 gap-4 items-start">
                    <div className="col-span-2">
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Codice</label>
                        <input type="text" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className="w-full border border-gray-300 rounded p-2 text-sm font-bold font-mono text-purple-900" />
                    </div>
                    <div className="col-span-5 relative">
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-bold uppercase text-gray-500">Descrizione Voce</label>
                            <button 
                                onClick={() => setIsDescriptionExpanded(true)}
                                className="text-purple-600 hover:text-purple-800 text-[10px] font-bold flex items-center gap-1 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 hover:bg-purple-100 transition-colors"
                                title="Ingrandisci casella di testo"
                            >
                                <Maximize2 className="w-3 h-3" /> Espandi
                            </button>
                        </div>
                        <textarea 
                            value={formData.description} 
                            onChange={e => setFormData({...formData, description: e.target.value})} 
                            className="w-full border border-gray-300 rounded p-2 text-sm resize-none h-[52px] leading-tight focus:ring-1 focus:ring-purple-500 outline-none" 
                            placeholder="Es. Posa in opera di..." 
                        />
                    </div>
                    <div className="col-span-3 bg-purple-100 p-2 rounded border border-purple-200 h-[76px] flex flex-col justify-center">
                        <label className="block text-[10px] font-bold uppercase text-purple-700 mb-1 flex items-center gap-1"><Scale className="w-3 h-3" /> Quantità Analizzata</label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="number" 
                                value={formData.analysisQuantity} 
                                onChange={e => setFormData({...formData, analysisQuantity: parseFloat(e.target.value) || 1})} 
                                className="w-full border border-purple-300 rounded p-1 text-sm text-center font-bold text-purple-900 focus:ring-1 focus:ring-purple-500" 
                            />
                        </div>
                    </div>
                    <div className="col-span-2">
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">U.M. Finale</label>
                        <input 
                            type="text" 
                            list={sharedDatalistId}
                            value={formData.unit} 
                            onChange={e => setFormData({...formData, unit: e.target.value})} 
                            className="w-full border border-gray-300 rounded p-2 text-sm text-center font-bold" 
                            autoComplete="off"
                        />
                    </div>
                </div>

                {/* Components List */}
                <div className="flex-1 overflow-y-auto p-4 bg-white relative">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100 text-gray-600 font-bold text-xs uppercase sticky top-0 z-10">
                            <tr>
                                <th className="p-2 w-8"></th>
                                <th className="p-2">Descrizione Elemento</th>
                                <th className="p-2 w-16 text-center">U.M.</th>
                                <th className="p-2 w-24 text-right">Prezzo Unit.</th>
                                <th className="p-2 w-24 text-center">Q.tà Totale<br/><span className="text-[9px] lowercase font-normal">(per analisi)</span></th>
                                <th className="p-2 w-24 text-right">Importo</th>
                                <th className="p-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {formData.components.map(comp => (
                                <tr key={comp.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                                    <td className="p-2 text-center">
                                        {comp.type === 'material' && <span title="Materiale"><Package className="w-4 h-4 text-orange-500" /></span>}
                                        {comp.type === 'labor' && <span title="Manodopera"><Hammer className="w-4 h-4 text-blue-500" /></span>}
                                        {comp.type === 'equipment' && <span title="Nolo"><Truck className="w-4 h-4 text-green-500" /></span>}
                                    </td>
                                    <td className="p-2">
                                        <input type="text" value={comp.description} onChange={e => handleUpdateComponent(comp.id, 'description', e.target.value)} className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm font-medium text-gray-700" placeholder="Descrizione..." />
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            type="text" 
                                            list={sharedDatalistId}
                                            value={comp.unit} 
                                            onChange={e => handleUpdateComponent(comp.id, 'unit', e.target.value)} 
                                            className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm text-center text-gray-500" 
                                            autoComplete="off"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input type="number" value={comp.unitPrice} onChange={e => handleUpdateComponent(comp.id, 'unitPrice', parseFloat(e.target.value))} className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm text-right font-mono" />
                                    </td>
                                    <td className="p-2">
                                        <input type="number" value={comp.quantity} onChange={e => handleUpdateComponent(comp.id, 'quantity', parseFloat(e.target.value))} className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm text-center font-bold bg-yellow-50 rounded text-yellow-900" />
                                    </td>
                                    <td className="p-2 text-right font-mono font-medium text-gray-800">
                                        {formatEuro(comp.quantity * comp.unitPrice)}
                                    </td>
                                    <td className="p-2 text-center">
                                        <button onClick={() => handleDeleteComponent(comp.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))}
                            {formData.components.length === 0 && (
                                <tr><td colSpan={7} className="p-8 text-center text-gray-400 italic">Nessun componente inserito. Aggiungi materiali o manodopera.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Footer Buttons (Sticky) */}
                <div className="p-3 bg-gray-50 border-t border-gray-200 flex justify-center gap-3 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-20">
                    <button onClick={() => handleAddComponent('labor')} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded hover:bg-blue-50 text-xs font-bold shadow-sm"><Plus className="w-3 h-3" /> AGGIUNGI MANODOPERA</button>
                    <button onClick={() => handleAddComponent('material')} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-orange-200 text-orange-700 rounded hover:bg-orange-50 text-xs font-bold shadow-sm"><Plus className="w-3 h-3" /> AGGIUNGI MATERIALE</button>
                    <button onClick={() => handleAddComponent('equipment')} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-green-200 text-green-700 rounded hover:bg-green-50 text-xs font-bold shadow-sm"><Plus className="w-3 h-3" /> AGGIUNGI NOLO/ATTR.</button>
                </div>
            </div>

            {/* Right: Calculation Summary */}
            <div className="w-80 bg-gray-50 flex flex-col border-l border-gray-200 shadow-inner overflow-y-auto">
                <div className="p-4 border-b border-gray-200 bg-white">
                    <h4 className="text-xs font-bold uppercase text-gray-500 mb-4">Costi Totali (su {formData.analysisQuantity} {formData.unit})</h4>
                    
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-600 flex items-center gap-1"><Package className="w-3 h-3" /> Materiali</span>
                            <span className="font-mono">{formatEuro(calculatedTotals.mat)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600 flex items-center gap-1"><Hammer className="w-3 h-3" /> Manodopera</span>
                            <span className="font-mono">{formatEuro(calculatedTotals.lab)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600 flex items-center gap-1"><Truck className="w-3 h-3" /> Noli</span>
                            <span className="font-mono">{formatEuro(calculatedTotals.eq)}</span>
                        </div>
                        <div className="border-t border-gray-300 pt-1 mt-1 flex justify-between font-bold text-gray-800">
                            <span>Costo Tecnico</span>
                            <span>{formatEuro(calculatedTotals.costoTecnico)}</span>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-b border-gray-200 bg-white">
                    <div className="mb-4">
                        <label className="flex justify-between text-xs font-bold uppercase text-gray-500 mb-1">
                            <span>Spese Generali</span>
                            <div className="flex items-center">
                                <input type="number" value={formData.generalExpensesRate} onChange={e => setFormData({...formData, generalExpensesRate: parseFloat(e.target.value)})} className="w-10 text-right border-b border-gray-300 focus:outline-none text-purple-600 font-bold" />
                                <span>%</span>
                            </div>
                        </label>
                        <div className="text-right font-mono text-gray-700 text-sm">
                            {formatEuro(calculatedTotals.spese)}
                        </div>
                    </div>
                    <div>
                        <label className="flex justify-between text-xs font-bold uppercase text-gray-500 mb-1">
                            <span>Utile d'Impresa</span>
                            <div className="flex items-center">
                                <input type="number" value={formData.profitRate} onChange={e => setFormData({...formData, profitRate: parseFloat(e.target.value)})} className="w-10 text-right border-b border-gray-300 focus:outline-none text-purple-600 font-bold" />
                                <span>%</span>
                            </div>
                        </label>
                         <p className="text-[10px] text-gray-400 mb-1 italic text-right">(Su Costo + Spese)</p>
                        <div className="text-right font-mono text-gray-700 text-sm">
                            {formatEuro(calculatedTotals.utile)}
                        </div>
                    </div>
                    <div className="border-t border-gray-300 pt-2 mt-2 flex justify-between font-bold text-gray-900">
                        <span>Totale Analisi</span>
                        <span>{formatEuro(calculatedTotals.totalBatch)}</span>
                    </div>
                </div>

                <div className="p-6 bg-purple-50 flex-1 flex flex-col justify-center items-center text-center">
                     <span className="text-xs font-bold uppercase text-purple-800 mb-2 block">Prezzo Unitario Finale</span>
                     <div className="text-xs text-purple-600 mb-1">Totale / {formData.analysisQuantity}</div>
                     <div className="text-4xl font-bold font-mono text-purple-700 mb-1 bg-white px-4 py-2 rounded shadow-sm border border-purple-100">
                        {formatEuro(calculatedTotals.unitPrice)}
                     </div>
                     <div className="text-xs text-purple-600 font-bold mt-1">per {formData.unit}</div>

                     <div className="mt-6 w-full p-2 bg-white rounded border border-purple-100 text-xs shadow-sm">
                         <div className="flex justify-between text-gray-500">Incidenza Manodopera</div>
                         <div className="font-bold text-purple-800 text-lg">
                             {calculatedTotals.totalBatch > 0 ? ((calculatedTotals.lab / calculatedTotals.totalBatch) * 100).toFixed(2) : '0.00'} %
                         </div>
                     </div>
                </div>

                <div className="p-4 border-t border-gray-200 bg-white sticky bottom-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                     <button onClick={handleSave} disabled={!formData.code || calculatedTotals.totalBatch === 0} className="w-full bg-[#8e44ad] hover:bg-[#9b59b6] text-white py-3 rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transform transition-transform active:scale-95">
                         <Save className="w-5 h-5" />
                         SALVA ANALISI
                     </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisEditorModal;
