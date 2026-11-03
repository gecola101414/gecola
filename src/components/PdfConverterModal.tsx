import React, { useState, useRef } from 'react';
import { 
  FileText, Upload, CheckCircle2, AlertCircle, Loader2, Sparkles, 
  ArrowRight, Layers, FileSpreadsheet, Calculator, ShieldCheck, X, HardHat
} from 'lucide-react';
import { convertPdfComputo, ConvertedComputoResult } from '../utils/pdfComputoConverter';

interface PdfConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (result: ConvertedComputoResult) => void;
  playUISound?: (sound: 'click' | 'confirm' | 'toggle' | 'delete') => void;
}

export const PdfConverterModal: React.FC<PdfConverterModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  playUISound
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [conversionResult, setConversionResult] = useState<ConvertedComputoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleProcessFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError("Il file selezionato non è un documento PDF.");
      return;
    }

    setError(null);
    setConversionResult(null);
    setIsConverting(true);
    setProgressStep('Caricamento e lettura documento PDF in corso...');

    // Cede immediatamente il controllo al thread principale per mostrare la rotellina a video
    await new Promise(r => setTimeout(r, 60));

    try {
      const arrayBuffer = await file.arrayBuffer();
      setProgressStep('Analisi layout pagine e coordinate tabelle PriMus...');
      await new Promise(r => setTimeout(r, 60));

      const result = await convertPdfComputo(arrayBuffer, file.name);

      setProgressStep('Finalizzazione voci, misurazioni e gruppi WBS...');
      await new Promise(r => setTimeout(r, 80));

      setConversionResult(result);
      setIsConverting(false);
      if (playUISound) playUISound('confirm');
    } catch (err: any) {
      console.error("PDF conversion error:", err);
      setError(err?.message || "Si è verificato un errore durante la conversione del PDF. Verifica che sia un file computo integro.");
      setIsConverting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleConfirmImport = () => {
    if (!conversionResult) return;
    onImportComplete(conversionResult);
    if (playUISound) playUISound('confirm');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-[0_25px_70px_rgba(0,0,0,0.5)] border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Modal */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 px-8 py-5 text-white flex items-center justify-between border-b border-blue-900/50">
          <div className="flex items-center gap-3.5">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-2xl shadow-lg border border-blue-400/40">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded-md border border-blue-400/30">
                  Universal Bridge
                </span>
                <span className="text-[10px] font-extrabold uppercase text-amber-300">
                  PriMus ACCA • Universale
                </span>
              </div>
              <h3 className="text-xl font-black tracking-tight text-white uppercase mt-0.5">
                Convertitore Computi PDF in GeCoLa
              </h3>
            </div>
          </div>
          <button 
            onClick={() => { if (playUISound) playUISound('click'); onClose(); }}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-7 overflow-y-auto space-y-6 flex-1">
          
          {/* Quick Explanation */}
          <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs">
            <div className="p-2 bg-blue-600 rounded-xl text-white shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-yellow-300" />
            </div>
            <div className="text-xs text-slate-700 leading-relaxed">
              <p className="font-bold text-slate-900 mb-0.5">
                Rendi la tua piattaforma completamente aperta e universale!
              </p>
              GeCoLa decodifica i PDF dei computi metrici generati da <strong className="text-blue-900">ACCA PriMus</strong> o altri software, importando automaticamente tutte le voci, descrizioni, tariffe, misurazioni di dettaglio (lunghezza, larghezza, altezza, detrazioni) e i singoli gruppi di lavoro WBS. Potrai così gestire subito la <strong className="text-slate-900">contabilità di cantiere</strong>, il <strong className="text-slate-900">SAL</strong> e la valutazione del <strong className="text-slate-900">subappalto</strong>.
            </div>
          </div>

          {/* Upload Drop Zone or Spinning Wheel Loading Screen */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".pdf,application/pdf" 
            className="hidden" 
          />

          {isConverting ? (
            /* Dedicated high-visibility spinning wheel loader */
            <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white rounded-3xl p-10 flex flex-col items-center justify-center text-center shadow-2xl border border-blue-700/50 animate-in fade-in zoom-in-95 duration-200">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-full border-4 border-blue-400/20 border-t-blue-400 border-r-indigo-400 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center animate-pulse">
                    <Loader2 className="w-8 h-8 text-blue-300 animate-spin" />
                  </div>
                </div>
              </div>
              
              <span className="text-[11px] font-black uppercase tracking-[0.25em] text-blue-300 mb-1">
                Elaborazione Computo in Corso
              </span>
              <h4 className="text-xl font-black text-white mb-2">
                GeCoLa sta convertendo il PDF...
              </h4>
              <p className="text-sm font-semibold text-slate-300 max-w-md animate-pulse">
                {progressStep}
              </p>

              <div className="mt-6 flex items-center gap-2.5 px-4 py-1.5 bg-white/10 rounded-full text-xs text-blue-200 font-mono border border-blue-400/20 shadow-inner">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                Estrazione articoli, tariffe, misurazioni e gruppi WBS
              </div>
            </div>
          ) : (
            /* Upload Dropzone */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-3 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                isDragging 
                  ? 'border-blue-500 bg-blue-50/80 scale-[1.01]' 
                  : 'border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-slate-100/80'
              }`}
            >
              <div className={`p-4 rounded-full transition-transform ${isDragging ? 'bg-blue-600 text-white scale-110' : 'bg-white shadow-md text-blue-600'}`}>
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">
                  Trascina qui un file PDF oppure <span className="text-blue-600 underline">sfoglia il tuo computer</span>
                </p>
                <p className="text-[11px] text-slate-500 font-medium mt-1">
                  Compatibile con stampe PDF di PriMus ACCA, STR Vision, Edil-Clima e computi tabellari standard
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Conversion Success Preview */}
          {conversionResult && !isConverting && (
            <div className="bg-emerald-50/90 border-2 border-emerald-400 rounded-3xl p-5 space-y-4 animate-in fade-in duration-300 shadow-md">
              <div className="flex items-center justify-between border-b border-emerald-200 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-emerald-600 text-white rounded-xl">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-emerald-800 tracking-wider">Computo Convertito con Successo!</span>
                    <h4 className="text-base font-black text-slate-900 leading-tight">
                      {conversionResult.projectInfo.title}
                    </h4>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Importo Totale Lavori</span>
                  <span className="text-lg font-mono font-black text-emerald-800">
                    € {conversionResult.totalAmount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Statistics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-white p-3 rounded-2xl border border-emerald-200 shadow-xs">
                  <span className="text-[9px] font-bold uppercase text-slate-400 block">Voci Estratte</span>
                  <span className="text-xl font-black font-mono text-slate-800">{conversionResult.articlesCount}</span>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-emerald-200 shadow-xs">
                  <span className="text-[9px] font-bold uppercase text-slate-400 block">Gruppi WBS</span>
                  <span className="text-xl font-black font-mono text-slate-800">{conversionResult.categories.length}</span>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-emerald-200 shadow-xs">
                  <span className="text-[9px] font-bold uppercase text-slate-400 block">Pagine Elaborate</span>
                  <span className="text-xl font-black font-mono text-slate-800">{conversionResult.totalPages}</span>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-emerald-200 shadow-xs">
                  <span className="text-[9px] font-bold uppercase text-slate-400 block">Integrità Calcolo</span>
                  <span className="text-xs font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-block mt-1">
                    100% Esatto
                  </span>
                </div>
              </div>

              {/* Preview of categories */}
              <div className="bg-white p-3.5 rounded-2xl border border-emerald-200/80">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-2">
                  Struttura WBS Rilevata dal Computo:
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {conversionResult.categories.map((c, i) => (
                    <span 
                      key={i} 
                      className={`text-[9px] px-2 py-0.5 rounded-lg font-bold border ${
                        c.isSuperCategory 
                          ? 'bg-amber-100 text-amber-900 border-amber-300 font-black' 
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-8 py-4 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { if (playUISound) playUISound('click'); onClose(); }}
            className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase text-slate-600 hover:text-slate-800 hover:bg-slate-200 transition-colors"
          >
            Annulla
          </button>

          {conversionResult && (
            <button
              type="button"
              onClick={handleConfirmImport}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-3 rounded-2xl shadow-lg hover:shadow-xl transform active:scale-95 transition-all flex items-center gap-2 uppercase text-xs tracking-wider"
            >
              <span>Apri Computo in GeCoLa</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
