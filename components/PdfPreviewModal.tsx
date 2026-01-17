
import React, { useEffect, useRef } from 'react';
import { X, ShieldAlert, Lock, Printer, Download, MousePointer2 } from 'lucide-react';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string;
}

const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({ isOpen, onClose, pdfUrl }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleContext = (e: MouseEvent) => {
      if (isOpen) e.preventDefault();
    };
    
    const handleKeys = (e: KeyboardEvent) => {
      if (isOpen && (
        (e.ctrlKey && e.key === 'p') || 
        (e.ctrlKey && e.key === 's') || 
        (e.metaKey && e.key === 'p') || 
        (e.metaKey && e.key === 's')
      )) {
        e.preventDefault();
        alert("La funzione di stampa e salvataggio è disabilitata in modalità Visitatore.");
      }
    };

    window.addEventListener('contextmenu', handleContext);
    window.addEventListener('keydown', handleKeys);
    return () => {
      window.removeEventListener('contextmenu', handleContext);
      window.removeEventListener('keydown', handleKeys);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/95 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full h-full flex flex-col p-4 md:p-8">
        
        {/* HEADER BAR PROTETTA */}
        <div className="bg-[#2c3e50] border border-slate-600 rounded-t-2xl px-6 py-4 flex justify-between items-center shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="bg-orange-500 p-1.5 rounded-lg">
                <Lock className="w-4 h-4 text-white" />
            </div>
            <div>
                <h3 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-2">
                    GeCoLa Secure Viewer <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full ml-2">PROTETTO</span>
                </h3>
                <p className="text-slate-400 text-[10px] font-bold">Visualizzazione anteprima per account Visitatore</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-3 text-slate-400 bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700">
                <div className="flex items-center gap-1.5 line-through opacity-50"><Printer className="w-3.5 h-3.5" /> <span className="text-[10px] font-bold uppercase">Stampa</span></div>
                <div className="w-px h-3 bg-slate-600"></div>
                <div className="flex items-center gap-1.5 line-through opacity-50"><Download className="w-3.5 h-3.5" /> <span className="text-[10px] font-bold uppercase">Salva</span></div>
            </div>
            <button 
              onClick={onClose}
              className="bg-white/10 hover:bg-red-600 text-white p-2 rounded-xl transition-all hover:scale-110 active:scale-90"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* CONTAINER PDF CON OVERLAY PROTETTIVO */}
        <div className="flex-1 bg-slate-800 border-x border-b border-slate-600 rounded-b-2xl relative overflow-hidden shadow-2xl" ref={containerRef}>
          <iframe 
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1`} 
            className="w-full h-full border-none pointer-events-auto"
            title="PDF Preview"
            onContextMenu={(e) => e.preventDefault()}
          />
          
          {/* Overlay invisibile per intercettare click su toolbar PDF se caricate */}
          <div className="absolute top-0 left-0 right-0 h-14 bg-transparent pointer-events-none"></div>
          
          {/* Badge informativo */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#1e293b]/90 border border-orange-500/50 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-bounce">
            <ShieldAlert className="w-5 h-5 text-orange-500" />
            <span className="text-white text-xs font-black uppercase tracking-widest">Le funzioni di esportazione sono attive solo per account PRO</span>
          </div>
        </div>

        {/* FOOTER MESSAGGIO */}
        <div className="mt-4 flex justify-center items-center gap-2 text-slate-500 font-bold text-[10px] uppercase tracking-tighter">
            <MousePointer2 className="w-3 h-3" /> Tasto destro e scorciatoie disabilitati per motivi di sicurezza
        </div>
      </div>
    </div>
  );
};

export default PdfPreviewModal;
