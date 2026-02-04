import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Ruler, Grid3X3, Weight, Construction, Hash, Info, Layers, Plus, Trash2, ChevronRight, ListChecks } from 'lucide-react';
import { REBAR_WEIGHTS } from '../constants';

interface RebarRow {
  id: string;
  diameter: number;
  weight: number;
  multiplier: number;
  length: number;
  type: string;
  customDesc: string;
}

interface RebarCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (measurements: Array<{ diameter: number; weight: number; multiplier: number; length: number; description: string }>) => void;
}

const STRUCTURE_TYPES = [
  "Fondazione (Plinti)",
  "Trave di Fondazione",
  "Muro controterra",
  "Pilastro",
  "Trave in elevazione",
  "Solaio (Soletta)",
  "Cordolo perimetrale",
  "Scala / Rampa",
  "Balcone / Sbalzo",
  "Opere Accessorie"
];

const RebarCalculatorModal: React.FC<RebarCalculatorModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [selectedStructure, setSelectedStructure] = useState(STRUCTURE_TYPES[0]);
  const [structureDetail, setStructureDetail] = useState('');
  const [selectedDiameter, setSelectedDiameter] = useState<number>(12);
  const [rebarType, setRebarType] = useState('Ferri');
  const [multiplier, setMultiplier] = useState<number>(0);
  const [length, setLength] = useState<number>(0);
  const [customDesc, setCustomDesc] = useState('');
  
  // Lista dei ferri aggiunti nella sessione corrente
  const [pendingRows, setPendingRows] = useState<RebarRow[]>([]);

  if (!isOpen) return null;

  const currentWeightPerMeter = REBAR_WEIGHTS.find(w => w.diameter === selectedDiameter)?.weight || 0;

  const handleAddRow = () => {
    if (multiplier <= 0 || length <= 0) return;

    const newRow: RebarRow = {
      id: Math.random().toString(36).substr(2, 9),
      diameter: selectedDiameter,
      weight: currentWeightPerMeter,
      multiplier,
      length,
      type: rebarType,
      customDesc: customDesc
    };

    setPendingRows([...pendingRows, newRow]);
    // Reset campi di input per il prossimo inserimento
    setMultiplier(0);
    setLength(0);
    setCustomDesc('');
  };

  const removeRow = (id: string) => {
    setPendingRows(pendingRows.filter(r => r.id !== id));
  };

  const handleFinalSubmit = () => {
    if (pendingRows.length === 0) return;

    const formattedMeasurements = pendingRows.map(row => {
      const prefix = `[${selectedStructure.toUpperCase()}${structureDetail ? ' - ' + structureDetail.toUpperCase() : ''}]`;
      const desc = `${prefix} ${row.type} Ø${row.diameter}${row.customDesc ? ' (' + row.customDesc + ')' : ''}`;
      
      return {
        diameter: row.diameter,
        weight: row.weight,
        multiplier: row.multiplier,
        length: row.length,
        description: desc
      };
    });

    onAdd(formattedMeasurements);
    setPendingRows([]);
    onClose();
  };

  const sessionTotalWeight = pendingRows.reduce((acc, row) => acc + (row.multiplier * row.length * row.weight), 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl overflow-hidden border border-slate-200 flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-150">
        
        {/* Header Tecnico */}
        <div className="bg-slate-900 px-8 py-5 flex justify-between items-center text-white border-b border-slate-700">
          <div className="flex items-center gap-5">
            <div className="bg-orange-500 p-3 rounded-2xl shadow-lg shadow-orange-500/20">
              <Grid3X3 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter italic leading-none">Armature B450C Expert</h2>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1.5">Configuratore Seriale ad Alta Precisione</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-white/5 hover:bg-red-600/40 p-2 rounded-xl transition-all border border-white/10">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          
          {/* STEP 1: DEFINIZIONE STRUTTURA */}
          <div className="p-6 border-b border-slate-200 bg-white shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest flex items-center gap-2">
                    <Layers className="w-3 h-3 text-orange-500" /> Destinazione d'uso (Dove?)
                </label>
                <select 
                    value={selectedStructure}
                    onChange={(e) => setSelectedStructure(e.target.value)}
                    className="w-full border-2 border-slate-100 rounded-2xl px-5 py-3.5 outline-none focus:border-orange-500 font-black text-slate-700 bg-slate-50 transition-all text-sm appearance-none cursor-pointer"
                >
                    {STRUCTURE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Specificità Progetto (Es. Sigla Trave)</label>
                <input 
                    type="text"
                    value={structureDetail}
                    onChange={(e) => setStructureDetail(e.target.value)}
                    placeholder="Es: T1, P3, Fondazione Nord..."
                    className="w-full border-2 border-slate-100 rounded-2xl px-5 py-3.5 outline-none focus:border-orange-500 font-bold text-slate-700 bg-white transition-all text-sm uppercase italic"
                />
             </div>
          </div>

          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            
            {/* STEP 2: RIGA DI COMANDO E DIAMETRI */}
            <div className="w-full lg:w-[450px] p-8 border-r border-slate-200 overflow-y-auto space-y-8">
                
                {/* Selezione Diametro */}
                <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest flex items-center gap-2">
                        <CircleDotIcon className="w-3 h-3" /> Seleziona Diametro (Ø mm)
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                        {REBAR_WEIGHTS.map((item) => (
                        <button
                            key={item.diameter}
                            onClick={() => setSelectedDiameter(item.diameter)}
                            className={`py-3 rounded-xl border-2 text-xs font-black transition-all transform active:scale-95 ${selectedDiameter === item.diameter ? 'bg-orange-500 border-orange-600 text-white shadow-lg shadow-orange-500/30' : 'bg-white border-slate-100 text-slate-400 hover:border-orange-200'}`}
                        >
                            Ø{item.diameter}
                        </button>
                        ))}
                    </div>
                </div>

                {/* Riga di Comando */}
                <div className="bg-slate-900 rounded-[2rem] p-6 text-white space-y-5 shadow-2xl border border-slate-700">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-400">Inserimento rapido</span>
                        <span className="text-[10px] font-mono text-slate-500">Ø{selectedDiameter} • {currentWeightPerMeter.toFixed(3)} kg/m</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <span className="text-[8px] font-black text-slate-400 uppercase">Tipologia</span>
                            <div className="flex bg-white/5 rounded-lg p-1">
                                <button onClick={() => setRebarType('Ferri')} className={`flex-1 py-1 rounded text-[9px] font-black uppercase transition-all ${rebarType === 'Ferri' ? 'bg-white text-slate-900' : 'text-slate-400'}`}>Ferri</button>
                                <button onClick={() => setRebarType('Staffe')} className={`flex-1 py-1 rounded text-[9px] font-black uppercase transition-all ${rebarType === 'Staffe' ? 'bg-white text-slate-900' : 'text-slate-400'}`}>Staffe</button>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <span className="text-[8px] font-black text-slate-400 uppercase">Pezzi</span>
                            <input type="number" value={multiplier || ''} onChange={e => setMultiplier(parseFloat(e.target.value) || 0)} className="w-full bg-white/10 border-none rounded-lg px-3 py-2 text-white font-mono font-black outline-none focus:ring-1 focus:ring-orange-500 text-sm" placeholder="10" />
                        </div>
                        <div className="space-y-1.5">
                            <span className="text-[8px] font-black text-slate-400 uppercase">Lung. (m)</span>
                            <input type="number" step="0.01" value={length || ''} onChange={e => setLength(parseFloat(e.target.value) || 0)} className="w-full bg-white/10 border-none rounded-lg px-3 py-2 text-white font-mono font-black outline-none focus:ring-1 focus:ring-orange-500 text-sm" placeholder="1.50" />
                        </div>
                        <div className="space-y-1.5">
                            <span className="text-[8px] font-black text-slate-400 uppercase">Nota (opz.)</span>
                            <input type="text" value={customDesc} onChange={e => setCustomDesc(e.target.value)} className="w-full bg-white/10 border-none rounded-lg px-3 py-2 text-white font-bold outline-none focus:ring-1 focus:ring-orange-500 text-sm italic" placeholder="Passo 15" />
                        </div>
                    </div>

                    <button 
                        onClick={handleAddRow}
                        disabled={multiplier <= 0 || length <= 0}
                        className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-20 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-orange-600/20"
                    >
                        <Plus className="w-5 h-5" /> Aggiungi alla lista
                    </button>
                </div>
            </div>

            {/* STEP 3: TABELLA RIEPILOGO SESSIONE */}
            <div className="flex-1 flex flex-col p-8 overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <ListChecks className="w-6 h-6 text-slate-400" />
                        <h3 className="font-black text-slate-800 uppercase tracking-tighter italic">Elementi Pronti per il Computo</h3>
                    </div>
                    <div className="bg-slate-900 text-white px-5 py-2 rounded-2xl flex items-center gap-4 shadow-xl">
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Peso Totale Sessione</span>
                        <span className="text-xl font-mono font-black text-orange-500">{sessionTotalWeight.toFixed(2)} <span className="text-[10px] text-slate-400">KG</span></span>
                    </div>
                </div>

                <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-inner overflow-hidden flex flex-col">
                    <div className="overflow-y-auto flex-1 custom-scrollbar">
                        {pendingRows.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4">
                                <Construction className="w-20 h-20" />
                                <p className="font-black uppercase text-xs tracking-widest">Nessun elemento inserito</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr className="text-[9px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100">
                                        <th className="px-6 py-4">Ø</th>
                                        <th className="px-6 py-4">Tipo</th>
                                        <th className="px-6 py-4 text-center">Pezzi</th>
                                        <th className="px-6 py-4 text-center">L (m)</th>
                                        <th className="px-6 py-4">Peso Unit.</th>
                                        <th className="px-6 py-4 text-right">Peso Tot.</th>
                                        <th className="px-6 py-4 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {pendingRows.map(row => (
                                        <tr key={row.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-6 py-4 font-black text-orange-600 font-mono text-sm">Ø{row.diameter}</td>
                                            <td className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">{row.type} <span className="text-slate-300 italic normal-case ml-1">{row.customDesc}</span></td>
                                            <td className="px-6 py-4 text-center font-bold text-slate-700 text-sm">{row.multiplier}</td>
                                            <td className="px-6 py-4 text-center font-bold text-slate-700 text-sm">{row.length.toFixed(2)}</td>
                                            <td className="px-6 py-4 text-[10px] font-mono text-slate-400">{row.weight.toFixed(3)} kg/m</td>
                                            <td className="px-6 py-4 text-right font-black text-slate-800 font-mono text-sm">{(row.multiplier * row.length * row.weight).toFixed(2)} kg</td>
                                            <td className="px-6 py-4">
                                                <button onClick={() => removeRow(row.id)} className="p-2 text-slate-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-4">
                    <button 
                        onClick={onClose} 
                        className="px-8 py-4 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:text-slate-600 transition-all tracking-[0.2em]"
                    >
                        Annulla Sessione
                    </button>
                    <button 
                        disabled={pendingRows.length === 0}
                        onClick={handleFinalSubmit}
                        className="bg-slate-900 hover:bg-blue-600 disabled:opacity-20 text-white px-12 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl transition-all active:scale-95 flex items-center gap-4 group"
                    >
                        <Save className="w-5 h-5 text-blue-400" />
                        Carica {pendingRows.length} Elementi in Computo
                        <ChevronRight className="w-4 h-4 opacity-30 group-hover:opacity-100 transition-all" />
                    </button>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Semplice componente icona locale
const CircleDotIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
    </svg>
);

export default RebarCalculatorModal;