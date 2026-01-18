
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Save, Paintbrush, Layers, Info, Square, Layout, ArrowRight, Maximize2, MousePointer2 } from 'lucide-react';

interface PaintingCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (measurements: Array<{ description: string; multiplier: number; length?: number; width?: number; height?: number; type: 'positive' }>) => void;
}

type RoomShape = 'RECT' | 'L-SHAPE';

// Persistenza globale dei dati per la sessione corrente
let persistentPaintingStructure = '';
let persistentL1 = 0; // Inizialmente bianche (zero)
let persistentW1 = 0; // Inizialmente bianche (zero)
let persistentH = 2.70; // Altezza standard memorizzata
let persistentL2 = 0; // Inizialmente bianche (zero)
let persistentW2 = 0; // Inizialmente bianche (zero)
let persistentShape: RoomShape = 'RECT';

// Sotto-componente spostato all'esterno per evitare la rigenerazione e la conseguente perdita di focus
const BufferedInput = ({ value, onChange, label, tabIndex, autoFocus = false }: any) => {
  const [localVal, setLocalVal] = useState(value === 0 ? '' : value.toString());
  
  // Sincronizza lo stato locale se il valore esterno cambia (es. reset globale)
  useEffect(() => {
    setLocalVal(value === 0 ? '' : value.toString());
  }, [value]);

  const commit = () => {
    const num = parseFloat(localVal);
    if (!isNaN(num)) onChange(num);
    else if (localVal === '') onChange(0);
    else setLocalVal(value === 0 ? '' : value.toString());
  };

  return (
    <div className="flex flex-col items-center">
      <span className="text-[7px] font-black text-slate-400 uppercase mb-0.5">{label}</span>
      <input 
        type="number"
        step="0.01"
        autoFocus={autoFocus}
        tabIndex={tabIndex}
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-14 bg-white border border-slate-300 rounded shadow-sm px-1 py-1 text-center font-mono text-[10px] font-black text-blue-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-200 outline-none"
      />
    </div>
  );
};

const PaintingCalculatorModal: React.FC<PaintingCalculatorModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [localStructureName, setLocalStructureName] = useState(persistentPaintingStructure);
  const [shape, setShape] = useState<RoomShape>(persistentShape);
  
  const [L1, setL1] = useState(persistentL1);
  const [W1, setW1] = useState(persistentW1);
  const [H, setH] = useState(persistentH);
  const [L2, setL2] = useState(persistentL2);
  const [W2, setW2] = useState(persistentW2);

  // Sincronizzazione persistenza misure e altezza
  useEffect(() => {
    persistentL1 = L1;
    persistentW1 = W1;
    persistentH = H;
    persistentL2 = L2;
    persistentW2 = W2;
    persistentShape = shape;
  }, [L1, W1, H, L2, W2, shape]);

  // Gestione nome vano con persistenza immediata
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalStructureName(val);
    persistentPaintingStructure = val;
  };

  const drawingScale = useMemo(() => {
    const maxCanvasDim = 280; 
    const totalL = shape === 'RECT' ? (L1 || 1) : ((L1 + L2) || 1);
    const totalW = shape === 'RECT' ? (W1 || 1) : ((W1 + W2) || 1);
    const maxInputDim = Math.max(totalL, totalW, 1);
    return maxCanvasDim / maxInputDim;
  }, [L1, W1, L2, W2, shape]);

  const results = useMemo(() => {
    const prefix = localStructureName ? `[${localStructureName.toUpperCase()}] ` : '';
    if (shape === 'RECT') {
      return [
        { description: `${prefix}Soffitto Stanza Rettangolare`, multiplier: 1, length: L1 || 0, width: W1 || 0, type: 'positive' as const, value: (L1 || 0) * (W1 || 0) },
        { description: `${prefix}Pareti Stanza (Sviluppo)`, multiplier: 2, length: (L1 || 0) + (W1 || 0), height: H || 0, type: 'positive' as const, value: ((L1 || 0) + (W1 || 0)) * 2 * (H || 0) }
      ];
    } else {
      const ceilingArea = ((L1 || 0) * (W1 || 0)) + ((L2 || 0) * ((W1 || 0) + (W2 || 0)));
      const perimeter = ((L1 || 0) + (W1 || 0) + (L2 || 0) + (W2 || 0) + ((L1 || 0) + (L2 || 0)) + ((W1 || 0) + (W2 || 0)));
      return [
        { description: `${prefix}Soffitto Stanza a L`, multiplier: 1, length: ceilingArea, width: 1, type: 'positive' as const, value: ceilingArea },
        { description: `${prefix}Pareti Stanza a L (Sviluppo)`, multiplier: 1, length: perimeter, height: H || 0, type: 'positive' as const, value: perimeter * (H || 0) }
      ];
    }
  }, [L1, W1, L2, W2, H, shape, localStructureName]);

  if (!isOpen) return null;

  const handleGenerate = () => {
    onAdd(results.map(({ value, ...rest }) => {
        // Rimuove larghezza pareti in esportazione per pulizia rigo come richiesto
        if (rest.description.toLowerCase().includes('pareti')) {
            return { ...rest, width: undefined };
        }
        return rest;
    }));
    onClose();
  };

  return (
    <div 
        className="fixed inset-0 z-[200] flex items-center justify-center p-2 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()} // Fondamentale: impedisce al click interno di fermare l'automatismo
    >
      <div className="bg-[#f1f5f9] rounded-[2.5rem] shadow-2xl w-full max-w-6xl overflow-hidden border border-slate-300 flex flex-col max-h-[98vh] animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-3.5 flex justify-between items-center text-white border-b border-slate-700">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-600/20">
              <Paintbrush className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-tight italic leading-none">Smart Painting Scaler</h2>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1">Geometria Parametrica Orizzontale</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-white/5 hover:bg-red-600/40 p-2 rounded-xl transition-all border border-white/10">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 flex flex-row overflow-hidden">
            
            <div className="flex-[1.2] bg-white border-r border-slate-200 relative flex items-center justify-center p-12 overflow-hidden shadow-inner">
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '15px 15px' }}></div>
                
                <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-[9px] font-black uppercase tracking-widest text-slate-400 border border-slate-200">
                   <Maximize2 className="w-3 h-3 text-blue-500" /> Scala: 1:{(100/drawingScale).toFixed(0)}
                </div>

                {shape === 'RECT' ? (
                    <div 
                        className="relative bg-blue-50/50 border-[3px] border-blue-600 shadow-2xl rounded transition-all duration-500 flex items-center justify-center"
                        style={{ width: (L1 || 1) * drawingScale, height: (W1 || 1) * drawingScale }}
                    >
                        <div className="absolute -bottom-10 left-0 right-0 flex justify-center items-center gap-2"><div className="h-px bg-slate-200 flex-1"></div><BufferedInput tabIndex={1} autoFocus={true} label="Lung. (L)" value={L1} onChange={setL1}/><div className="h-px bg-slate-200 flex-1"></div></div>
                        <div className="absolute -right-14 top-0 bottom-0 flex flex-col justify-center items-center gap-2"><div className="w-px bg-slate-200 flex-1"></div><BufferedInput tabIndex={2} label="Larg. (W)" value={W1} onChange={setW1}/><div className="w-px bg-slate-200 flex-1"></div></div>
                        <span className="text-lg font-mono font-black text-blue-700 animate-in fade-in duration-700">{((L1 || 0) * (W1 || 0)).toFixed(2)} m²</span>
                    </div>
                ) : (
                    <div className="relative flex flex-col items-start transition-all duration-500">
                        <div className="flex items-end">
                            <div className="bg-blue-50/50 border-[3px] border-blue-600 border-b-0 border-r-0 relative flex items-center justify-center transition-all duration-500" style={{ width: (L1 || 1) * drawingScale, height: (W1 || 1) * drawingScale }}>
                                <div className="absolute -top-12 left-0 right-0 flex items-center gap-2"><div className="h-px bg-slate-200 flex-1"></div><BufferedInput tabIndex={1} autoFocus={true} label="L1" value={L1} onChange={setL1}/><div className="h-px bg-slate-200 flex-1"></div></div>
                                <div className="absolute -left-16 top-0 bottom-0 flex flex-col items-center gap-2"><div className="w-px bg-slate-200 flex-1"></div><BufferedInput tabIndex={2} label="W1" value={W1} onChange={setW1}/><div className="w-px bg-slate-200 flex-1"></div></div>
                            </div>
                            <div className="bg-blue-50/50 border-[3px] border-blue-600 border-l-0 border-b-0 relative flex items-center justify-center transition-all duration-500" style={{ width: (L2 || 1) * drawingScale, height: ((W1 || 1) - ((W1 || 1)/2)) * drawingScale }}>
                                <div className="absolute -top-12 left-0 right-0 flex items-center gap-2"><div className="h-px bg-slate-200 flex-1"></div><BufferedInput tabIndex={3} label="L2" value={L2} onChange={setL2}/><div className="h-px bg-slate-200 flex-1"></div></div>
                            </div>
                        </div>
                        <div className="flex">
                            <div className="bg-blue-50/50 border-[3px] border-blue-600 border-t-0 relative transition-all duration-500 flex items-center justify-center" style={{ width: ((L1 || 0) + (L2 || 0) || 1) * drawingScale, height: (W2 || 1) * drawingScale }}>
                                <div className="absolute -right-16 top-0 bottom-0 flex flex-col items-center gap-2"><div className="w-px bg-slate-200 flex-1"></div><BufferedInput tabIndex={4} label="W2" value={W2} onChange={setW2}/><div className="w-px bg-slate-200 flex-1"></div></div>
                                <span className="text-sm font-mono font-black text-blue-700 animate-in fade-in">Tot. {results[0].value.toFixed(2)} m²</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 flex flex-col p-6 gap-6 bg-[#f8fafc]">
                <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                             <BufferedInput tabIndex={5} label="Alt. Stanza (H)" value={H} onChange={setH}/>
                        </div>
                        <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl">
                            <button onClick={() => setShape('RECT')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${shape === 'RECT' ? 'bg-white text-blue-600 shadow-md ring-1 ring-slate-200' : 'text-slate-400'}`}>Rettangolo</button>
                            <button onClick={() => setShape('L-SHAPE')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${shape === 'L-SHAPE' ? 'bg-white text-blue-600 shadow-md ring-1 ring-slate-200' : 'text-slate-400'}`}>Forma a L</button>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        <input 
                            tabIndex={6} 
                            value={localStructureName} 
                            onChange={handleNameChange} 
                            placeholder="NOME VANO..." 
                            className="flex-1 bg-transparent border-none p-0 font-black text-slate-800 outline-none text-[10px] uppercase italic" 
                        />
                    </div>
                </div>

                <div className="flex-1 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Info className="w-4 h-4 text-blue-500" /> Righi in caricamento</h4>
                    <div className="space-y-2 overflow-y-auto pr-2">
                        {results.map((r, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-400">{i+1}</div>
                                    <div>
                                        <span className="text-[10px] font-black text-slate-800 block leading-tight truncate max-w-[180px]">{r.description}</span>
                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                            {r.height ? `${r.length.toFixed(2)}x${r.height.toFixed(2)}` : `${r.length.toFixed(2)}x${r.width?.toFixed(2)}`}
                                        </span>
                                    </div>
                                </div>
                                <span className="font-mono text-[11px] font-black text-slate-700">{r.value.toFixed(2)} <span className="text-[8px] font-bold text-slate-400">m²</span></span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600 opacity-10 rounded-full -mr-12 -mt-12 blur-2xl"></div>
                    <span className="text-blue-400 font-black text-[9px] uppercase tracking-[0.2em] block mb-1">Superficie Totale Lorda</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black font-mono tracking-tighter">{results.reduce((s, r) => s + r.value, 0).toFixed(2)}</span>
                        <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">m²</span>
                    </div>
                </div>
            </div>
        </div>

        <div className="px-8 py-5 bg-white border-t border-slate-100 flex justify-between items-center">
            <button onClick={onClose} className="px-6 py-2.5 rounded-2xl font-black uppercase text-[11px] text-slate-400 hover:text-slate-600 transition-all">Annulla</button>
            <div className="flex items-center gap-3">
                <div className="hidden lg:flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase">
                    <MousePointer2 className="w-3 h-3" /> Fai invio sugli input per aggiornare il disegno
                </div>
                <button tabIndex={7} onClick={handleGenerate} className="bg-blue-700 hover:bg-blue-800 text-white px-12 py-3 rounded-2xl font-black uppercase text-[11px] shadow-2xl shadow-blue-900/40 flex items-center gap-3 transform active:scale-95 transition-all">
                    <Save className="w-4 h-4" /> Carica Pitturazioni
                    <ArrowRight className="w-4 h-4 opacity-50" />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default PaintingCalculatorModal;
