
import React, { useState, useEffect, useRef } from 'react';
import { X, Globe, Search, Info, ArrowRight, MousePointer2, Calculator, Maximize2 } from 'lucide-react';

interface GecolaBrowserProps {
  isOpen: boolean;
  onClose: () => void;
}

const GecolaBrowser: React.FC<GecolaBrowserProps> = ({ isOpen, onClose }) => {
  // Finestra Movable e Resizable
  const [position, setPosition] = useState({ x: 150, y: 100 });
  const [size, setSize] = useState({ width: 950, height: 650 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ width: 0, height: 0, mouseX: 0, mouseY: 0 });

  // Motore di Ricerca Interno
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  
  const MOCK_DATABASE = [
    "1.A.05 - Noleggio trabattello professionale h 6m per lavori in quota - cad - 3.50 - 15% - Lombardia",
    "2.B.10 - Demolizione pavimento ceramica compreso massetto e carico - mq - 22.40 - 90% - Lombardia",
    "3.C.01 - Tubazione scarico in PP innesto a guarnizione diam. 50mm - m - 12.80 - 45% - Lombardia",
    "4.D.15 - Intonaco civile per interni base calce cemento steso a macchina - mq - 18.90 - 55% - Lombardia",
    "5.E.02 - Posa pavimento gres porcellanato formato 30x60 su massetto esistente - mq - 28.50 - 65% - Lombardia",
    "SIC.01 - Recinzione cantiere rete elettrosaldata su basamenti cls - m - 15.50 - 10% - Sicurezza",
    "SIC.02 - Cartellonistica di sicurezza e segnali avviso pericolo - cad - 85.00 - 5% - Sicurezza",
    "SIC.03 - Fornitura estintori portatili polvere 6kg approvati - cad - 45.00 - 0% - Sicurezza",
    "6.F.10 - Tinteggiatura interni con idropittura lavabile due mani - mq - 12.00 - 80% - Lombardia",
    "7.G.05 - Porta interna in legno tamburato finitura rovere - cad - 320.00 - 10% - Lombardia",
    "8.H.20 - Rimozione sanitari esistenti compreso smaltimento a discarica - cad - 45.00 - 95% - Lombardia",
    "9.I.15 - Massetto autolivellante per impianti radianti a pavimento - mq - 32.50 - 40% - Lombardia"
  ];

  useEffect(() => {
    // Filtro intelligente fino a 5 parole (AND logic)
    const words = searchQuery.toLowerCase().split(' ').filter(w => w.trim().length > 0).slice(0, 5);
    if (words.length === 0) {
      setSearchResults([]);
      return;
    }
    const filtered = MOCK_DATABASE.filter(item => 
      words.every(word => item.toLowerCase().includes(word))
    );
    setSearchResults(filtered);
  }, [searchQuery]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.browser-title-bar')) {
      setIsDragging(true);
      dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStart.current = { 
      width: size.width, 
      height: size.height, 
      mouseX: e.clientX, 
      mouseY: e.clientY 
    };
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const nextX = Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragStart.current.x));
        const nextY = Math.max(0, Math.min(window.innerHeight - size.height, e.clientY - dragStart.current.y));
        setPosition({ x: nextX, y: nextY });
      }
      if (isResizing) {
        const deltaX = e.clientX - resizeStart.current.mouseX;
        const deltaY = e.clientY - resizeStart.current.mouseY;
        setSize({
          width: Math.max(500, resizeStart.current.width + deltaX),
          height: Math.max(400, resizeStart.current.height + deltaY)
        });
      }
    };
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, isResizing, size]);

  if (!isOpen) return null;

  return (
    <div 
      style={{ 
        left: position.x, 
        top: position.y, 
        width: size.width, 
        height: size.height,
        zIndex: 400
      }}
      className="fixed bg-white rounded-2xl shadow-[0_40px_100px_rgba(0,0,0,0.6)] border border-slate-400 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
    >
      {/* Title Bar */}
      <div 
        onMouseDown={handleMouseDown}
        className="browser-title-bar h-12 bg-slate-900 flex items-center justify-between px-4 cursor-move select-none border-b border-slate-700"
      >
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
          </div>
          <div className="h-4 w-px bg-slate-700 mx-1"></div>
          <div className="flex items-center gap-2 text-slate-100">
             <Globe className="w-4 h-4 text-orange-500" />
             <span className="text-[10px] font-black uppercase tracking-[0.2em]">Navigatore GeCoLa Cloud</span>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-red-600 rounded-lg text-slate-400 hover:text-white transition-all">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Ricerca */}
        <div className="w-80 border-r border-slate-300 bg-slate-100 flex flex-col p-4 shadow-inner">
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">
                <div className="p-1 bg-orange-500 rounded text-white"><Search className="w-3 h-3" /></div> 
                Smart Filter (AND Logic)
            </div>
            
            <div className="relative mb-6">
                <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtra (es: dem pav cer)..."
                    className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-xs font-bold shadow-sm focus:border-orange-500 outline-none transition-colors"
                />
                <div className="absolute right-3 top-3 text-[8px] font-black text-slate-300">MAX 5 WORDS</div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                {searchResults.length === 0 ? (
                    <div className="text-center py-16 opacity-30 flex flex-col items-center gap-4 grayscale">
                        <Calculator className="w-16 h-16 text-slate-400" />
                        <p className="text-[10px] font-black uppercase tracking-tighter leading-relaxed">
                            Inserisci termini per filtrare<br/>il database delle opere
                        </p>
                    </div>
                ) : (
                    searchResults.map((res, i) => {
                        const parts = res.split(' - ');
                        return (
                        <div 
                            key={i}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', res.replace(/ - /g, '\t'));
                            }}
                            className="bg-white p-3 rounded-xl border border-slate-300 shadow-sm hover:border-orange-500 hover:shadow-lg transition-all group cursor-grab active:cursor-grabbing border-l-4 border-l-slate-300 hover:border-l-orange-500"
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="bg-slate-100 text-slate-600 font-mono text-[9px] px-2 py-0.5 rounded border border-slate-200 group-hover:bg-orange-100 group-hover:text-orange-700 transition-colors">
                                    {parts[0]}
                                </span>
                                <MousePointer2 className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100" />
                            </div>
                            <p className="text-[11px] font-bold text-slate-800 line-clamp-3 leading-tight mb-2">
                                {parts[1]}
                            </p>
                            <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-orange-600">€ {parts[3]}</span>
                                    <span className="text-[8px] text-slate-400 font-bold uppercase">{parts[2]}</span>
                                </div>
                                <span className="text-[7px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded uppercase tracking-tighter">LISTINO</span>
                            </div>
                        </div>
                    );})
                )}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-300">
                <div className="bg-white p-3 rounded-xl border border-slate-200 flex gap-3 shadow-sm">
                    <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <p className="text-[9px] text-slate-600 font-medium leading-snug">
                        <strong>LOGICA EXCEL:</strong> Verranno mostrate solo le voci che contengono <strong>tutte</strong> le parole cercate.
                    </p>
                </div>
            </div>
        </div>

        {/* Iframe */}
        <div className="flex-1 relative bg-white">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                <Globe className="w-64 h-64" />
            </div>
            <iframe 
                src="https://www.gecola.it/home/listini" 
                className="w-full h-full border-none"
                title="GeCoLa External Portal"
            />
        </div>
      </div>

      {/* Resize Handle */}
      <div 
        onMouseDown={handleResizeMouseDown}
        className="absolute bottom-0 right-0 w-8 h-8 cursor-nwse-resize flex items-end justify-end p-1 group z-50"
      >
        <div className="w-4 h-4 border-r-[3px] border-b-[3px] border-slate-300 group-hover:border-orange-500 rounded-br-sm transition-colors"></div>
      </div>
    </div>
  );
};

export default GecolaBrowser;
