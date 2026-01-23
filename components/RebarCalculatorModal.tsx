
import React, { useState, useEffect } from 'react';
import { X, Save, Ruler, Grid3X3, Weight, Construction, Hash, Info, Layers } from 'lucide-react';
import { REBAR_WEIGHTS } from '../constants';

interface RebarCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: { diameter: number; weight: number; multiplier: number; length: number; description: string }) => void;
}

type RebarType = 'Staffe' | 'Barre' | 'Sagomati' | 'Ferro Armatura';

let persistentStructure = '';

const RebarCalculatorModal: React.FC<RebarCalculatorModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [structureName, setStructureName] = useState(persistentStructure);
  const [selectedDiameter, setSelectedDiameter] = useState<number | null>(12);
  const [rebarType, setRebarType] = useState<RebarType>('Ferro Armatura');
  const [multiplier, setMultiplier] = useState<number>(0);
  const [length, setLength] = useState<number>(0);
  const [customDesc, setCustomDesc] = useState<string>('');

  useEffect(() => {
    persistentStructure = structureName;
  }, [structureName]);

  if (!isOpen) return null;

  const currentWeightPerMeter = selectedDiameter ? REBAR_WEIGHTS.find(w => w.diameter === selectedDiameter)?.weight || 0 : 0;
  const totalWeight = multiplier * length * currentWeightPerMeter;

  const handleAdd = () => {
    if (selectedDiameter) {
      const prefix = structureName ? `[${structureName.toUpperCase()}] ` : '';
      const formattedDesc = `${prefix}${rebarType} Ø${selectedDiameter}${customDesc ? ' - ' + customDesc : ''}`;
      
      onAdd({
        diameter: selectedDiameter,
        weight: currentWeightPerMeter,
        multiplier: multiplier || 1,
        length: length || 1,
        description: formattedDesc
      });
      // Reset locale ma mantiene struttura
      setMultiplier(0);
      setLength(0);
      setCustomDesc('');
    }
  };

  return (
    <div 
        className="fixed inset-0 z-[200] flex items-center justify-center p-2 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()} // Impedisce al click interno di fermare l'automatismo
    >
      <div className="bg-[#f8fafc] rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-300 flex flex-col max-h-[98vh] animate-in zoom-in-95 duration-150">
        
        <div className="bg-slate-900 px-5 py-3 flex justify-between items-center text-white border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 p-1.5 rounded-lg">
              <Grid3X3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-tight italic leading-none">Configuratore Armature B450C</h2>
              <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-1">Industrial Measurement Tool</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-white/5 hover:bg-red-600/40 p-1.5 rounded-lg transition-all border border-white/10">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
             <div className="flex items-center gap-2 text-[9px] font-black uppercase text-orange-600 tracking-tighter whitespace-nowrap">
                <Layers className="w-3 h-3" /> Struttura:
             </div>
             <input 
                type="text"
                value={structureName}
                onChange={(e) => setStructureName(e.target.value)}
                placeholder="Es: FONDAZIONI / PILASTRI P1-P5"
                className="flex-1 bg-transparent border-none p-0 font-bold text-slate-800 outline-none focus:ring-0 text-xs uppercase placeholder:normal-case italic"
             />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <label className="block text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">Diametro (Ø mm)</label>
              <div className="grid grid-cols-7 lg:grid-cols-4 gap-1.5 mb-4">
                {REBAR_WEIGHTS.map((item) => (
                  <button
                    key={item.diameter}
                    onClick={() => setSelectedDiameter(item.diameter)}
                    className={`py-1.5 rounded-lg border-2 text-[11px] font-black transition-all ${selectedDiameter === item.diameter ? 'bg-orange-500 border-orange-600 text-white' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-orange-300'}`}
                  >
                    {item.diameter}
                  </button>
                ))}
              </div>

              {selectedDiameter && (
                <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center">
                    <div className="text-[9px] font-black text-slate-400 uppercase mb-3">Sezione in Scala</div>
                    <div 
                        className="bg-slate-700 rounded-full shadow-lg border-4 border-slate-400 flex items-center justify-center overflow-hidden transition-all duration-300"
                        style={{ width: `${selectedDiameter * 2}px`, height: `${selectedDiameter * 2}px` }}
                    >
                        <div className="w-full h-full bg-slate-500 opacity-20 rotate-45 scale-150"></div>
                    </div>
                    <div className="mt-4 text-center">
                        <span className="block text-[10px] font-black text-slate-700 uppercase">Peso Teorico Lineare</span>
                        <span className="text-xl font-mono font-black text-orange-600">{currentWeightPerMeter.toFixed(3)} <span className="text-[10px] text-slate-400 uppercase ml-1">kg/m</span></span>
                    </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 flex flex-col gap-3">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <label className="block text-[9px] font-black uppercase text-slate-400 mb-2 tracking-widest">Lavorazione & Dettagli</label>
                    <div className="flex gap-1.5 mb-3">
                        {(['Staffe', 'Barre', 'Sagomati'] as RebarType[]).map((t) => (
                            <button key={t} onClick={() => setRebarType(t)} className={`flex-1 py-1.5 rounded-lg font-bold text-[9px] uppercase border-2 transition-all ${rebarType === t ? 'bg-slate-800 border-slate-800 text-white' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200'}`}>{t}</button>
                        ))}
                    </div>
                    <input type="text" value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} placeholder="Posizione specifica (es. Passo 15cm)" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-slate-700 outline-none focus:border-orange-500 text-[11px]" />
                </div>
            </div>

            <div className="lg:col-span-3 space-y-3">
                <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex gap-3">
                    <div className="flex-1">
                        <label className="block text-[8px] font-black text-slate-400 mb-1 uppercase">Pezzi</label>
                        <input type="number" value={multiplier || ''} onChange={(e) => setMultiplier(parseFloat(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-black text-slate-800 outline-none text-xs" placeholder="es. 10" />
                    </div>
                    <div className="flex-1">
                        <label className="block text-[8px] font-black text-slate-400 mb-1 uppercase">Lung. m</label>
                        <input type="number" step="0.01" value={length || ''} onChange={(e) => setLength(parseFloat(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-black text-slate-800 outline-none text-xs" placeholder="es. 1.50" />
                    </div>
                </div>

                <div className="bg-slate-900 rounded-2xl p-4 text-white shadow-lg border border-slate-700 flex flex-col justify-center min-h-[90px] relative overflow-hidden">
                    <Weight className="absolute -right-4 -bottom-4 w-16 h-16 opacity-5 text-white pointer-events-none" />
                    <span className="text-orange-500 font-black text-[8px] uppercase tracking-widest mb-1">PESO TOTALE RIGO</span>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-black font-mono tracking-tighter text-white">{(totalWeight || 0).toFixed(3)}</span>
                        <span className="text-sm font-bold text-slate-500 uppercase">kg</span>
                    </div>
                </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-white border-t border-slate-100 flex justify-between items-center">
            <div className="hidden md:block text-left">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Anteprima Designazione:</span>
                <p className="text-[10px] font-bold text-orange-600 truncate max-w-[400px] mt-0.5 italic">
                    {structureName ? `[${structureName.toUpperCase()}] ` : ''}{rebarType} Ø{selectedDiameter}{customDesc ? ' - ' + customDesc : ''}
                </p>
            </div>
            <div className="flex gap-2">
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-black uppercase text-[9px] text-slate-400 hover:text-slate-600 transition-all">Annulla</button>
                <button 
                    disabled={!selectedDiameter || totalWeight <= 0}
                    onClick={handleAdd}
                    className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-8 py-2.5 rounded-xl font-black uppercase text-[9px] shadow-lg shadow-orange-600/20 flex items-center gap-2 transform active:scale-95 transition-all"
                >
                    <Save className="w-3.5 h-3.5" />
                    Carica Ferro
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default RebarCalculatorModal;
