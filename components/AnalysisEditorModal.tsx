
import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Plus, Trash2, Calculator, Coins, Hammer, Truck, Package, Scale, Maximize2, Minimize2, Lock, Sparkles, Loader2, Wand2 } from 'lucide-react';
import { PriceAnalysis, AnalysisComponent } from '../types';
import { COMMON_UNITS, LABOR_CATALOG, EQUIPMENT_CATALOG, MATERIAL_CATALOG } from '../constants';
import { GoogleGenAI, Type } from "@google/genai";

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
    analysisQuantity: 0,
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
    totalUnitPrice: 0,
    isLocked: false
  });

  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const sharedDatalistId = "analysis-units-datalist";
  const laborDatalistId = "labor-catalog-datalist";
  const equipDatalistId = "equip-catalog-datalist";
  const matDatalistId = "mat-catalog-datalist";

  useEffect(() => {
    if (isOpen) {
      if (analysis) {
        setFormData(JSON.parse(JSON.stringify(analysis)));
      } else {
        setFormData({
            id: Math.random().toString(36).substr(2, 9),
            code: nextCode || 'AP.01',
            description: '',
            unit: 'cad',
            analysisQuantity: 0, 
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
            totalUnitPrice: 0,
            isLocked: false
        });
      }
    }
  }, [isOpen, analysis, nextCode]);

  const handleFullAiGeneration = async () => {
    if (isGenerating || !formData.description) {
      alert("Inserisci un titolo o una breve descrizione per attivare l'AI Genius.");
      return;
    }
    
    setIsGenerating(true);
    try {
      // Inizializzazione protetta per Vercel environment recognition
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const prompt = `Agisci come un Ingegnere Estimatore esperto. 
      LAVORO: Genera un'analisi prezzi completa per: "${formData.description}".
      RIFERIMENTO: Analisi per 1 ${formData.unit}.
      
      ISTRUZIONI:
      1. Descrizione: Scrivi una descrizione tecnica professionale e dettagliata.
      2. Componenti: Inserisci Manodopera (Operaio Specializzato/Comune), Materiali specifici e Noli.
      3. Valori: Usa quantità realistiche e prezzi medi di mercato correnti (Regione ${formData.unit}).
      
      RESTITUISCI SOLO JSON:
      {
        "description": "descrizione tecnica completa",
        "components": [
          { "type": "material|labor|equipment", "description": "nome componente", "unit": "h|kg|mc|...", "unitPrice": 10.50, "quantity": 0.5 }
        ]
      }`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              components: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    description: { type: Type.STRING },
                    unit: { type: Type.STRING },
                    unitPrice: { type: Type.NUMBER },
                    quantity: { type: Type.NUMBER }
                  },
                  required: ["type", "description", "unit", "unitPrice", "quantity"]
                }
              }
            },
            required: ["description", "components"]
          }
        }
      });

      const result = JSON.parse(response.text || "{}");
      
      if (result.components && result.components.length > 0) {
        const newComponents: AnalysisComponent[] = result.components.map((c: any) => ({
          ...c,
          id: Math.random().toString(36).substr(2, 9)
        }));

        setFormData(prev => ({
          ...prev,
          description: result.description || prev.description,
          components: newComponents,
          analysisQuantity: 1 // Impostiamo a 1 come base generata
        }));
      }
    } catch (error) {
      console.error("Vercel/Gemini API Error:", error);
      alert("Errore di connessione con il motore AI. Verifica la chiave API nelle impostazioni di Vercel.");
    } finally {
      setIsGenerating(false);
    }
  };

  const calculatedTotals = useMemo(() => {
    let mat = 0, lab = 0, eq = 0;
    formData.components.forEach(c => {
        const val = (c.quantity || 0) * (c.unitPrice || 0);
        if (c.type === 'material') mat += val;
        else if (c.type === 'labor') lab += val;
        else eq += val;
    });

    const costoTecnico = mat + lab + eq;
    const spese = costoTecnico * (formData.generalExpensesRate / 100);
    const utile = (costoTecnico + spese) * (formData.profitRate / 100);
    const totalBatch = costoTecnico + spese + utile;
    const qty = formData.analysisQuantity > 0 ? formData.analysisQuantity : 1;
    const unitPrice = totalBatch / qty;

    return { mat, lab, eq, costoTecnico, spese, utile, totalBatch, unitPrice };
  }, [formData.components, formData.generalExpensesRate, formData.profitRate, formData.analysisQuantity]);

  if (!isOpen) return null;

  const isLocked = formData.isLocked || false;

  const handleAddComponent = (type: 'material' | 'labor' | 'equipment') => {
    if (isLocked) return;
    const newComp: AnalysisComponent = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        description: '',
        unit: type === 'labor' || type === 'equipment' ? 'h' : 'cad',
        unitPrice: 0,
        quantity: 0
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
                const catalog = c.type === 'labor' ? LABOR_CATALOG : c.type === 'equipment' ? EQUIPMENT_CATALOG : MATERIAL_CATALOG;
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
    setFormData(prev => ({ ...prev, components: prev.components.filter(c => c.id !== id) }));
  };

  const handleSave = () => {
     if (isLocked) return;
     onSave({
         ...formData,
         totalMaterials: calculatedTotals.mat,
         totalLabor: calculatedTotals.lab,
         totalEquipment: calculatedTotals.eq,
         costoTecnico: calculatedTotals.costoTecnico,
         valoreSpese: calculatedTotals.spese,
         valoreUtile: calculatedTotals.utile,
         totalBatchValue: calculatedTotals.totalBatch,
         totalUnitPrice: calculatedTotals.unitPrice
     });
     onClose();
  };

  const formatEuro = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: true }).format(n);
  const formatNum = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: true });

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <datalist id={sharedDatalistId}>
          {COMMON_UNITS.map((u, i) => (<option key={`${u}-${i}`} value={u} />))}
      </datalist>

      <div className={`bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-gray-300 relative ${isLocked ? 'opacity-95' : ''}`}>
        
        {isDescriptionExpanded && (
            <div className="absolute inset-0 z-50 bg-white flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-3">
                    <div>
                        <h4 className="font-bold text-xl text-purple-900 flex items-center gap-2"><Maximize2 className="w-5 h-5"/> Descrizione Estesa Analisi</h4>
                        <p className="text-gray-500 text-sm">Codice: <span className="font-mono font-bold">{formData.code}</span></p>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={handleFullAiGeneration} 
                            disabled={isGenerating || !formData.description}
                            className="bg-gradient-to-tr from-[#4285F4] via-[#9B72CB] to-[#D96570] text-white px-5 py-2 rounded-lg font-black uppercase text-[10px] flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} 
                            AI GENIUS PRO
                        </button>
                        <button onClick={() => setIsDescriptionExpanded(false)} className="bg-slate-700 text-white px-5 py-2 rounded-lg font-bold hover:bg-slate-800 flex items-center gap-2 shadow-md">
                            <Minimize2 className="w-4 h-4" /> Chiudi
                        </button>
                    </div>
                </div>
                <div className="flex-1 flex flex-col">
                    <textarea
                        value={formData.description}
                        onChange={e => !isLocked && setFormData({...formData, description: e.target.value})}
                        readOnly={isLocked}
                        className={`flex-1 w-full border border-gray-300 rounded-lg p-6 text-lg font-serif text-gray-800 shadow-inner resize-none focus:ring-2 focus:ring-purple-500 outline-none leading-relaxed ${isLocked ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                        autoFocus
                        placeholder="Inserisci la descrizione tecnica dettagliata..."
                    />
                </div>
            </div>
        )}

        <div className="bg-[#8e44ad] px-6 py-4 flex justify-between items-center border-b border-gray-600 text-white flex-shrink-0">
          <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg"><Calculator className="w-6 h-6 text-purple-200" /></div>
              <div>
                <h3 className="font-bold text-xl flex items-center gap-2">
                    Analisi Prezzo Unitario
                    {isLocked && <Lock className="w-4 h-4 text-red-400" />}
                </h3>
                <p className="text-purple-200 text-xs">Composizione automatica ottimizzata per Cloud & Vercel</p>
              </div>
          </div>
          <button onClick={onClose} className="text-purple-200 hover:text-white transition-colors bg-white/10 p-2 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
                <div className="p-4 bg-gray-50 border-b border-gray-200 grid grid-cols-12 gap-4 items-start">
                    <div className="col-span-2">
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Codice</label>
                        <input type="text" readOnly={isLocked} value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className={`w-full border border-gray-300 rounded p-2 text-sm font-bold font-mono text-purple-900 ${isLocked ? 'bg-gray-100 cursor-not-allowed' : ''}`} />
                    </div>
                    <div className="col-span-5 relative group/desc">
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-bold uppercase text-gray-500">Titolo/Oggetto</label>
                            <div className="flex gap-1">
                                <button 
                                    onClick={handleFullAiGeneration} 
                                    disabled={isGenerating || !formData.description}
                                    className={`text-white hover:scale-105 transition-all text-[9px] font-black uppercase flex items-center gap-1 bg-gradient-to-r from-[#4285F4] to-[#D96570] px-2 py-1 rounded shadow-lg opacity-0 group-hover/desc:opacity-100 disabled:opacity-30 ${isGenerating ? 'animate-pulse' : ''}`}
                                >
                                    {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} 
                                    AI GENIUS
                                </button>
                                <button onClick={() => setIsDescriptionExpanded(true)} className="text-purple-600 hover:text-purple-800 text-[10px] font-bold flex items-center gap-1 bg-purple-50 px-2 py-1 rounded border border-purple-200 hover:bg-purple-100 transition-colors">
                                    <Maximize2 className="w-3 h-3" /> Espandi
                                </button>
                            </div>
                        </div>
                        <textarea readOnly={isLocked} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className={`w-full border border-gray-300 rounded p-2 text-sm resize-none h-[52px] leading-tight focus:ring-1 focus:ring-purple-500 outline-none ${isLocked ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Inserisci il titolo della voce..." />
                    </div>
                    <div className={`col-span-3 p-2 rounded border h-[76px] flex flex-col justify-center ${isLocked ? 'bg-gray-100 border-gray-300' : 'bg-purple-100 border-purple-200'}`}>
                        <label className="block text-[10px] font-bold uppercase text-purple-700 mb-1 flex items-center gap-1"><Scale className="w-3 h-3" /> Quantità Analizzata</label>
                        <input 
                            readOnly={isLocked} 
                            type="number" 
                            value={formData.analysisQuantity === 0 ? '' : formData.analysisQuantity} 
                            onChange={e => setFormData({...formData, analysisQuantity: parseFloat(e.target.value) || 0})} 
                            className={`w-full border border-purple-300 rounded p-1 text-sm text-center font-bold text-purple-900 focus:ring-1 focus:ring-purple-500 ${isLocked ? 'bg-white cursor-not-allowed' : ''}`} 
                            placeholder="Inserisci Q.tà"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-xs font-bold uppercase text-gray-500 mb-1">U.M. Finale</label>
                        <input readOnly={isLocked} type="text" list={sharedDatalistId} value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} className={`w-full border border-gray-300 rounded p-2 text-sm text-center font-bold ${isLocked ? 'bg-gray-100 cursor-not-allowed' : ''}`} autoComplete="off" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-white relative">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-gray-100 text-gray-600 font-bold text-[10px] uppercase sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-2 w-8 border-b border-gray-200"></th>
                                <th className="p-2 border-b border-gray-200">Elemento Analitico (Materiali / M.O. / Noli)</th>
                                <th className="p-2 w-16 text-center border-b border-gray-200">U.M.</th>
                                <th className="p-2 w-24 text-center border-b border-gray-200 bg-blue-50 text-blue-700 font-black">Quantità</th>
                                <th className="p-2 w-28 text-right border-b border-gray-200">Prezzo Unit.</th>
                                <th className="p-2 w-28 text-right border-b border-gray-200">Importo</th>
                                <th className="p-2 w-10 border-b border-gray-200"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {formData.components.map(comp => (
                                <tr key={comp.id} className="border-b border-gray-100 hover:bg-gray-50 group transition-colors">
                                    <td className="p-2 text-center">
                                        {comp.type === 'material' && <Package className="w-4 h-4 text-orange-500" />}
                                        {comp.type === 'labor' && <Hammer className="w-4 h-4 text-blue-500" />}
                                        {comp.type === 'equipment' && <Truck className="w-4 h-4 text-green-500" />}
                                    </td>
                                    <td className="p-2">
                                        <input 
                                            type="text" 
                                            readOnly={isLocked} 
                                            value={comp.description} 
                                            onChange={e => handleUpdateComponent(comp.id, 'description', e.target.value)} 
                                            className={`w-full bg-transparent border-none focus:ring-0 p-0 text-sm font-medium text-gray-700 ${isLocked ? 'cursor-not-allowed' : ''}`}
                                            placeholder="Scegli o scrivi..."
                                        />
                                    </td>
                                    <td className="p-2">
                                        <input readOnly={isLocked} type="text" list={sharedDatalistId} value={comp.unit} onChange={e => handleUpdateComponent(comp.id, 'unit', e.target.value)} className={`w-full bg-transparent border-none focus:ring-0 p-0 text-sm text-center text-gray-500 ${isLocked ? 'cursor-not-allowed' : ''}`} autoComplete="off" />
                                    </td>
                                    <td className="p-2 bg-blue-50/30">
                                        <input readOnly={isLocked} type="number" step="any" value={comp.quantity === 0 ? '' : comp.quantity} onChange={e => handleUpdateComponent(comp.id, 'quantity', parseFloat(e.target.value) || 0)} className={`w-full bg-transparent border-none focus:ring-1 focus:ring-blue-200 p-0 text-sm text-center font-black text-blue-900 ${isLocked ? 'cursor-not-allowed' : ''}`} />
                                    </td>
                                    <td className="p-2">
                                        <input readOnly={isLocked} type="number" step="0.01" value={comp.unitPrice === 0 ? '' : comp.unitPrice} onChange={e => handleUpdateComponent(comp.id, 'unitPrice', parseFloat(e.target.value) || 0)} className={`w-full bg-transparent border-none focus:ring-0 p-0 text-sm text-right font-mono ${isLocked ? 'cursor-not-allowed' : ''}`} />
                                    </td>
                                    <td className="p-2 text-right font-mono font-bold text-gray-800">
                                        {formatEuro((comp.quantity || 0) * (comp.unitPrice || 0))}
                                    </td>
                                    <td className="p-2 text-center">
                                        {!isLocked && (
                                            <button 
                                                onClick={() => handleDeleteComponent(comp.id)} 
                                                className="text-gray-300 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {formData.components.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                            <Wand2 className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-sm italic uppercase tracking-widest font-black">Usa AI GENIUS per generare l'analisi</p>
                        </div>
                    )}
                </div>
                
                <div className="p-3 bg-gray-50 border-t border-gray-200 flex justify-center gap-3 shadow-inner z-20">
                    <button disabled={isLocked} onClick={() => handleAddComponent('labor')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-blue-200 text-blue-700 rounded-xl hover:bg-blue-600 hover:text-white text-xs font-black shadow-sm disabled:opacity-50 transition-all uppercase tracking-tighter">+ Manodopera</button>
                    <button disabled={isLocked} onClick={() => handleAddComponent('material')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-orange-200 text-orange-700 rounded-xl hover:bg-orange-600 hover:text-white text-xs font-black shadow-sm disabled:opacity-50 transition-all uppercase tracking-tighter">+ Materiale</button>
                    <button disabled={isLocked} onClick={() => handleAddComponent('equipment')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-green-200 text-green-700 rounded-xl hover:bg-green-600 hover:text-white text-xs font-black shadow-sm disabled:opacity-50 transition-all uppercase tracking-tighter">+ Noli</button>
                </div>
            </div>

            <div className="w-80 bg-gray-50 flex flex-col border-l border-gray-200 shadow-inner overflow-y-auto">
                <div className="p-4 border-b border-gray-200 bg-white">
                    <h4 className="text-[10px] font-black uppercase text-gray-400 mb-4 tracking-widest flex items-center gap-2"><Scale className="w-3 h-3"/> Costi Totali Lotto</h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-gray-600 flex items-center gap-1"><Package className="w-3 h-3 text-orange-400" /> Materiali</span><span className="font-mono font-bold">{formatEuro(calculatedTotals.mat)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600 flex items-center gap-1"><Hammer className="w-3 h-3 text-blue-400" /> Manodopera</span><span className="font-mono font-bold">{formatEuro(calculatedTotals.lab)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600 flex items-center gap-1"><Truck className="w-3 h-3 text-green-400" /> Noli</span><span className="font-mono font-bold">{formatEuro(calculatedTotals.eq)}</span></div>
                        <div className="border-t border-gray-300 pt-1 mt-1 flex justify-between font-black text-gray-800 uppercase text-xs"><span>Costo Tecnico</span><span>{formatEuro(calculatedTotals.costoTecnico)}</span></div>
                    </div>
                </div>

                <div className="p-4 border-b border-gray-200 bg-white">
                    <div className="mb-4">
                        <label className="flex justify-between text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">
                            <span>Spese Generali</span>
                            <div className="flex items-center">
                                <input readOnly={isLocked} type="number" value={formData.generalExpensesRate} onChange={e => setFormData({...formData, generalExpensesRate: parseFloat(e.target.value)})} className={`w-10 text-right border-b border-gray-300 focus:outline-none text-purple-600 font-bold ${isLocked ? 'cursor-not-allowed' : ''}`} />
                                <span>%</span>
                            </div>
                        </label>
                        <div className="text-right font-mono text-gray-700 text-sm font-bold">{formatEuro(calculatedTotals.spese)}</div>
                    </div>
                    <div>
                        <label className="flex justify-between text-[10px] font-black uppercase text-gray-400 mb-1 tracking-widest">
                            <span>Utile d'Impresa</span>
                            <div className="flex items-center">
                                <input readOnly={isLocked} type="number" value={formData.profitRate} onChange={e => setFormData({...formData, profitRate: parseFloat(e.target.value)})} className={`w-10 text-right border-b border-gray-300 focus:outline-none text-purple-600 font-bold ${isLocked ? 'cursor-not-allowed' : ''}`} />
                                <span>%</span>
                            </div>
                        </label>
                        <div className="text-right font-mono text-gray-700 text-sm font-bold">{formatEuro(calculatedTotals.utile)}</div>
                    </div>
                    <div className="border-t border-gray-300 pt-2 mt-2 flex justify-between font-black text-gray-900 uppercase text-xs"><span>Totale Lotto</span><span>{formatEuro(calculatedTotals.totalBatch)}</span></div>
                </div>

                <div className="p-6 bg-purple-50 flex-1 flex flex-col justify-center items-center text-center">
                     <span className="text-[10px] font-black uppercase text-purple-800 mb-2 block tracking-[0.2em]">Prezzo Unitario Finale</span>
                     <div className="text-4xl font-black font-mono text-purple-700 mb-1 bg-white px-4 py-3 rounded-2xl shadow-xl border border-purple-100 ring-4 ring-purple-100">
                        {formatNum(calculatedTotals.unitPrice)}
                     </div>
                     <div className="text-[10px] text-purple-400 font-black mt-3 uppercase tracking-widest">per {formData.unit}</div>
                </div>

                <div className="p-4 border-t border-gray-200 bg-white sticky bottom-0 z-20 shadow-[0_-4px_15px_rgba(0,0,0,0.05)]">
                     <button onClick={isLocked ? onClose : handleSave} disabled={!formData.code || (calculatedTotals.totalBatch === 0 && !isLocked)} className={`w-full py-4 rounded-2xl font-black uppercase text-xs shadow-lg flex items-center justify-center gap-2 transform transition-all active:scale-95 text-white ${isLocked ? 'bg-gray-400 hover:bg-gray-500' : 'bg-[#8e44ad] hover:bg-[#9b59b6] shadow-purple-200'}`}>
                         {isLocked ? <><X className="w-5 h-5" /> CHIUDI VISUALIZZAZIONE</> : <><Save className="w-5 h-5" /> CONFERMA ANALISI</>}
                     </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisEditorModal;
