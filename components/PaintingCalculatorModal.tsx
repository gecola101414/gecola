
import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Paintbrush, Layers, Info, Square, Layout, ArrowRight, Maximize2 } from 'lucide-react';

interface PaintingCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (measurements: Array<{ description: string; multiplier: number; length?: number; width?: number; height?: number; type: 'positive' }>) => void;
}

type RoomShape = 'RECT' | 'L-SHAPE';

let persistentPaintingStructure = '';

const PaintingCalculatorModal: React.FC<PaintingCalculatorModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [structureName, setStructureName] = useState(persistentPaintingStructure);
  const [shape, setShape] = useState<RoomShape>('RECT');
  
  // Dimensioni Standard (L1: Orizzontale, W1: Verticale)
  const [L1, setL1] = useState(5.00);
  const [W1, setW1] = useState(4.00);
  const [H, setH] = useState(2.70);

  // Dimensioni extra per L-Shape (L2: Estensione Orizzontale, W2: Estensione Verticale)
  const [L2, setL2] = useState(2.50);
  const [W2, setW2] = useState(2.00);

  useEffect(() => {
    persistentPaintingStructure = structureName;
  }, [structureName]);

  // Calcolo in scala per il disegno
  const drawingScale = useMemo(() => {
    const maxCanvasDim = 320; // Dimensione massima in pixel del disegno
    const totalL = shape === 'RECT' ? L1 : (L1 + L2);
    const totalW = shape === 'RECT' ? W1 : (W1 + W2);
    const maxInputDim = Math.max(totalL, totalW, 1);
    return maxCanvasDim / maxInputDim;
  }, [L1, W1, L2, W2, shape]);

  const results = useMemo(() => {
    const prefix = structureName ? `[${structureName.toUpperCase()}] ` : '';
    if (shape === 'RECT') {
      return [
        { description: `${prefix}Soffitto Stanza Rettangolare`, multiplier: 1, length: L1, width: W1, type: 'positive' as const, value: L1 * W1 },
        { description: `${prefix}Pareti Stanza (Sviluppo)`, multiplier: 2, length: L1 + W1, height: H, type: 'positive' as const, value: (L1 + W1) * 2 * H }
      ];
    } else {
      const ceilingArea = (L1 * W1) + (L2 * (W1 + W2)); // Calcolo area corretta per L
      const perimeter = (L1 + W1 + L2 + W2 + (L1 + L2) + (W1 + W2)); // Perimetro completo della L
      return [
        { description: `${prefix}Soffitto Stanza a L`, multiplier: 1, length: ceilingArea, width: 1, type: 'positive' as const, value: ceilingArea },
        { description: `${prefix}Pareti Stanza a L (Sviluppo)`, multiplier: 1, length: perimeter, height: H, type: 'positive' as const, value: perimeter * H }
      ];
    }
  }, [L1, W1, L2, W2, H, shape, structureName]);

  if (!isOpen) return null;

  const handleGenerate = () => {
    onAdd(results.map(({ value, ...rest }) => rest));
    onClose();
  };

  const InputField = ({ value, onChange, label, subLabel }: any) => (
    <div className="flex flex-col items-center group/input">
      <span className="text-[7px] font-black text-slate-400 uppercase mb-0.5 tracking-tighter">{label}</span>
      <input 
        type="number" 
        step="0.05" 
        value={value} 
        onChange={(e) => onChange(Math.max(0.1, parseFloat(e.target.value) || 0))}
        className="w-14 bg-white border border-slate-300 rounded shadow-sm px-1 py-0.5 text-center font-mono text-[10px] font-black text-blue-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-200 outline-none transition-all"
      />
      {subLabel && <span className="text-[6px] text-slate-400 font-bold mt-0.5 italic">{subLabel}</span>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#f1f5f9] rounded-[2rem] shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-300 flex flex-col max-h-[96vh] animate-in zoom-in-95 duration-150">
        
        {/* Header Tecnico */}
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white border-b border-slate-700">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-600/20">
              <Paintbrush className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-tight italic leading-none">Smart Painting Scaler</h2>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1">Simulazione Grafica Superfici v2.0</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-white/5 hover:bg-red-600/40 p-2 rounded-xl transition-all border border-white/10 group">
            <X className="w-5 h-5 text-slate-400 group-hover:text-white" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5 overflow-y-auto">
          
          {/* Sezione Input & Mode */}
          <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
             <div className="flex-1 flex items-center gap-4 w-full md:border-r border-slate-100 md:pr-6">
                <div className="bg-slate-100 p-2 rounded-full"><Layers className="w-4 h-4 text-slate-500" /></div>
                <div className="flex-1">
                  <span className="text-[8px] font-black text-slate-400 uppercase block mb-0.5">Etichetta Vano</span>
                  <input 
                    type="text"
                    value={structureName}
                    onChange={(e) => setStructureName(e.target.value)}
                    placeholder="ES. SOGGIORNO / CAMERA 01"
                    className="w-full bg-transparent border-none p-0 font-black text-slate-800 outline-none focus:ring-0 text-xs uppercase placeholder:text-slate-300"
                  />
                </div>
             </div>
             
             <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                <button 
                  onClick={() => setShape('RECT')}
                  className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black transition-all uppercase ${shape === 'RECT' ? 'bg-white text-blue-600 shadow-md ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Square className={`w-3.5 h-3.5 ${shape === 'RECT' ? 'fill-blue-100' : ''}`} /> Rettangolo
                </button>
                <button 
                  onClick={() => setShape('L-SHAPE')}
                  className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black transition-all uppercase ${shape === 'L-SHAPE' ? 'bg-white text-blue-600 shadow-md ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Layout className={`w-3.5 h-3.5 ${shape === 'L-SHAPE' ? 'fill-blue-100' : ''}`} /> Pianta a L
                </button>
             </div>

             <div className="md:pl-4">
                <InputField label="Altezza (H)" value={H} onChange={setH} subLabel="Quota fissa" />
             </div>
          </div>

          {/* Area Disegno in Scala */}
          <div className="flex-1 min-h-[380px] bg-white rounded-[2.5rem] border border-slate-200 shadow-inner relative flex items-center justify-center p-16 overflow-hidden">
             
             {/* Griglia di sfondo */}
             <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '20px 20px' }}></div>

             {shape === 'RECT' ? (
                <div 
                  className="relative bg-blue-50/50 border-[3px] border-blue-600 shadow-2xl rounded transition-all duration-500 flex items-center justify-center group"
                  style={{ width: L1 * drawingScale, height: W1 * drawingScale }}
                >
                    {/* Quota L1 (Bottom) */}
                    <div className="absolute -bottom-10 left-0 right-0 flex justify-center items-center gap-2">
                        <div className="h-px bg-slate-300 flex-1"></div>
                        <InputField label="Lung. (L)" value={L1} onChange={setL1} />
                        <div className="h-px bg-slate-300 flex-1"></div>
                    </div>
                    {/* Quota W1 (Right) */}
                    <div className="absolute -right-14 top-0 bottom-0 flex flex-col justify-center items-center gap-2">
                        <div className="w-px bg-slate-300 flex-1"></div>
                        <InputField label="Larg. (W)" value={W1} onChange={setW1} />
                        <div className="w-px bg-slate-300 flex-1"></div>
                    </div>
                    
                    <div className="flex flex-col items-center animate-in fade-in duration-700">
                        <span className="text-[9px] font-black text-blue-800/40 uppercase tracking-widest mb-1">Superficie Lorda</span>
                        <span className="text-lg font-mono font-black text-blue-700">{(L1 * W1).toFixed(2)} <span className="text-xs">m²</span></span>
                    </div>
                </div>
             ) : (
                <div className="relative flex flex-col items-start transition-all duration-500">
                   {/* Disegno L Dinamico */}
                   <div className="flex items-end">
                      <div 
                        className="bg-blue-50/50 border-[3px] border-blue-600 border-b-0 border-r-0 relative flex items-center justify-center transition-all duration-500"
                        style={{ width: L1 * drawingScale, height: W1 * drawingScale }}
                      >
                         <div className="absolute -top-12 left-0 right-0 flex items-center gap-2">
                            <div className="h-px bg-slate-300 flex-1"></div>
                            <InputField label="L1" value={L1} onChange={setL1} />
                            <div className="h-px bg-slate-300 flex-1"></div>
                         </div>
                         <div className="absolute -left-16 top-0 bottom-0 flex flex-col items-center gap-2">
                            <div className="w-px bg-slate-300 flex-1"></div>
                            <InputField label="W1" value={W1} onChange={setW1} />
                            <div className="w-px bg-slate-300 flex-1"></div>
                         </div>
                      </div>
                      <div 
                        className="bg-blue-50/50 border-[3px] border-blue-600 border-l-0 border-b-0 relative flex items-center justify-center transition-all duration-500"
                        style={{ width: L2 * drawingScale, height: (W1 - (W1/2)) * drawingScale }}
                      >
                         {/* L2 è la larghezza del secondo blocco */}
                         <div className="absolute -top-12 left-0 right-0 flex items-center gap-2">
                            <div className="h-px bg-slate-300 flex-1"></div>
                            <InputField label="L2" value={L2} onChange={setL2} />
                            <div className="h-px bg-slate-300 flex-1"></div>
                         </div>
                      </div>
                   </div>
                   <div className="flex">
                      <div 
                        className="bg-blue-50/50 border-[3px] border-blue-600 border-t-0 relative transition-all duration-500 flex items-center justify-center"
                        style={{ width: (L1 + L2) * drawingScale, height: W2 * drawingScale }}
                      >
                         <div className="absolute -right-16 top-0 bottom-0 flex flex-col items-center gap-2">
                            <div className="w-px bg-slate-300 flex-1"></div>
                            <InputField label="W2" value={W2} onChange={setW2} />
                            <div className="w-px bg-slate-300 flex-1"></div>
                         </div>
                         <div className="flex flex-col items-center animate-in fade-in duration-700">
                            <span className="text-[8px] font-black text-blue-800/40 uppercase tracking-widest">Soffitto Totale</span>
                            <span className="text-base font-mono font-black text-blue-700">{((L1 * W1) + (L2 * (W1 + W2))).toFixed(2)} m²</span>
                         </div>
                      </div>
                   </div>
                </div>
             )}

             <div className="absolute bottom-6 right-6 flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-xl">
                <Maximize2 className="w-3 h-3 text-orange-500" />
                Scala Visuale: 1:{(100/drawingScale).toFixed(0)}
             </div>
          </div>

          {/* Simulazione Righi Computo */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-8 bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-500" /> Anteprima righi da inserire
                  </h4>
                  <div className="space-y-3">
                      {results.map((r, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl hover:border-blue-200 transition-colors group">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 font-bold text-xs">{i+1}</div>
                              <div>
                                <span className="text-[10px] font-black text-slate-800 block leading-tight">{r.description}</span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                                    {r.height ? `${r.length.toFixed(2)} x ${r.height.toFixed(2)} (x${r.multiplier})` : `${r.length.toFixed(2)} x ${r.width?.toFixed(2)} (x${r.multiplier})`}
                                </span>
                              </div>
                           </div>
                           <div className="text-right">
                              <span className="font-mono text-xs font-black text-slate-700">{r.value.toFixed(2)}</span>
                              <span className="text-[9px] text-slate-400 font-bold ml-1">m²</span>
                           </div>
                        </div>
                      ))}
                  </div>
              </div>

              {/* Box Totale Economico Simulato */}
              <div className="lg:col-span-4 bg-slate-900 rounded-[2rem] p-6 text-white flex flex-col justify-between shadow-2xl relative overflow-hidden group">
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-600/10 rounded-full blur-3xl group-hover:bg-blue-600/20 transition-all duration-700"></div>
                  
                  <div>
                    <span className="text-blue-400 font-black text-[9px] uppercase tracking-widest block mb-2">Totale Superfici Lorde</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black font-mono tracking-tighter text-white">
                           {results.reduce((s, r) => s + r.value, 0).toFixed(2)}
                        </span>
                        <span className="text-lg font-bold text-slate-500 uppercase">m²</span>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/10 space-y-3">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-slate-500 uppercase tracking-tighter">Volume Teorico Vano</span>
                        <span className="text-white">{(shape === 'RECT' ? (L1*W1*H) : (((L1*W1)+(L2*(W1+W2)))*H)).toFixed(2)} m³</span>
                    </div>
                    <p className="text-[8px] text-slate-400 leading-tight italic">
                        * Le misure sono calcolate sui fili lordi. Ricorda di inserire le deduzioni per fori e infissi nel computo principale.
                    </p>
                  </div>
              </div>
          </div>
        </div>

        {/* Footer con Azione */}
        <div className="px-8 py-5 bg-white border-t border-slate-100 flex justify-between items-center">
            <button onClick={onClose} className="px-6 py-2.5 rounded-2xl font-black uppercase text-[11px] text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all">
                Annulla
            </button>
            <button 
                onClick={handleGenerate}
                className="bg-blue-700 hover:bg-blue-800 text-white px-12 py-3 rounded-2xl font-black uppercase text-[11px] shadow-2xl shadow-blue-900/40 flex items-center gap-3 transform active:scale-95 transition-all"
            >
                <Save className="w-4 h-4" />
                Carica in Computo
                <ArrowRight className="w-4 h-4 ml-1 opacity-50" />
            </button>
        </div>
      </div>
    </div>
  );
};

export default PaintingCalculatorModal;
