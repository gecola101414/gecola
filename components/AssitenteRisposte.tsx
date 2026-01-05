
import React, { useState, useMemo } from 'react';
import { ChatMessage, Attachment, User, UserRole } from '../types';
import { GoogleGenAI } from "@google/genai";

interface AssitenteRisposteProps {
  messages: ChatMessage[];
  currentUser: User;
}

export const AssitenteRisposte: React.FC<AssitenteRisposteProps> = ({ messages, currentUser }) => {
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [userPrompt, setUserPrompt] = useState('');
  const [generatedDraft, setGeneratedDraft] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const allAttachments = useMemo(() => {
    const atts: Attachment[] = [];
    const seenIds = new Set<string>();
    messages.forEach(m => {
      m.attachments?.forEach(a => {
        if (!seenIds.has(a.id)) {
          atts.push(a);
          seenIds.add(a.id);
        }
      });
    });
    return atts.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }, [messages]);

  const toggleAttachment = (id: string) => {
    setSelectedAttachmentIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleGenerateResponse = async () => {
    if (!userPrompt.trim()) return;
    setIsProcessing(true);
    setGeneratedDraft('');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const selectedFiles = allAttachments.filter(a => selectedAttachmentIds.includes(a.id));
      const parts: any[] = selectedFiles.map(file => ({
        inlineData: { mimeType: file.type || 'application/pdf', data: file.data.split(',')[1] }
      }));
      parts.push({
        text: `Agisci come Ufficiale di Collegamento del Comando Militare Esercito Lombardia. Analizza i documenti allegati e scrivi una risposta ufficiale basandoti su: "${userPrompt}".`
      });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [{ parts }],
        config: { thinkingConfig: { thinkingBudget: 16384 }, temperature: 0.7 }
      });
      setGeneratedDraft(response.text || 'Errore nella generazione della bozza.');
    } catch (error) {
      setGeneratedDraft("ERRORE CRITICO: Impossibile analizzare i documenti.");
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedDraft);
    alert("Bozza copiata negli appunti.");
  };

  return (
    <div className="h-full flex gap-4 animate-in fade-in duration-500 font-['Inter'] overflow-hidden">
      {/* SIDEBAR SINISTRA: SELEZIONE DOCUMENTI (STRETTA) */}
      <div className="w-80 flex flex-col gap-2 bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-4 bg-slate-900 flex justify-between items-center">
           <div>
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest italic">Vault Scans</h3>
              <p className="text-white text-[8px] font-bold uppercase opacity-60">Seleziona Fonti Documentali</p>
           </div>
           <div className="bg-indigo-600 text-white text-[9px] font-black px-2 py-1 rounded-md">{selectedAttachmentIds.length}</div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {allAttachments.map(att => (
            <div 
              key={att.id}
              onClick={() => toggleAttachment(att.id)}
              className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-3 ${selectedAttachmentIds.includes(att.id) ? 'bg-indigo-50 border-indigo-600 shadow-sm' : 'bg-slate-50 border-slate-100 hover:border-indigo-200'}`}
            >
               <div className={`w-4 h-4 rounded flex items-center justify-center border ${selectedAttachmentIds.includes(att.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'}`}>
                 {selectedAttachmentIds.includes(att.id) && <span className="text-[8px]">✓</span>}
               </div>
               <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black text-slate-800 truncate uppercase">{att.name}</p>
                  <p className="text-[7px] font-bold text-slate-400 uppercase italic">{(att.size / 1024).toFixed(1)} KB</p>
               </div>
            </div>
          ))}
          {allAttachments.length === 0 && (
            <div className="py-20 text-center opacity-20">
               <span className="text-4xl">📁</span>
               <p className="text-[10px] font-black uppercase mt-4 tracking-widest">Nessun file</p>
            </div>
          )}
        </div>
      </div>

      {/* AREA CENTRALE: PROMPT E RISPOSTA (DOMINANTE) */}
      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {/* BARRA SUPERIORE PROMPT (COMPATTA) */}
        <div className="bg-white rounded-[2rem] p-4 border border-slate-200 shadow-xl flex gap-4 items-center flex-shrink-0">
           <div className="flex-1 relative">
              <label className="absolute -top-2 left-4 bg-white px-2 text-[7px] font-black text-indigo-600 uppercase tracking-widest z-10">Direttiva di Comando</label>
              <textarea 
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="Inserisci la guida per l'IA (es: Rispondi formalmente negando la richiesta...)"
                className="w-full p-4 pt-5 bg-slate-50 border border-slate-100 rounded-2xl text-[12px] font-medium text-slate-700 outline-none focus:border-indigo-600 transition-all resize-none h-20"
              />
           </div>
           <button 
            onClick={handleGenerateResponse}
            disabled={isProcessing || !userPrompt.trim()}
            className={`h-20 w-48 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg transition-all flex flex-col items-center justify-center gap-2 ${isProcessing ? 'bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'}`}
           >
             {isProcessing ? (
               <div className="w-6 h-6 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div>
             ) : (
               <>
                 <span className="text-xl">✍️</span>
                 <span>ELABORA RISPOSTA</span>
               </>
             )}
           </button>
        </div>

        {/* AREA RISPOSTA (MASSIMIZZATA) */}
        <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col relative min-h-0">
           <div className="p-3 bg-slate-900 flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-3">
                 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                 <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest italic">Terminal Redazione Ufficiale</span>
              </div>
              {generatedDraft && (
                <button onClick={copyToClipboard} className="text-[9px] font-black text-white bg-indigo-600 px-6 py-1.5 rounded-lg hover:bg-indigo-700 transition-all shadow-lg active:scale-95">COPIA DOCUMENTO</button>
              )}
           </div>
           
           <div className="flex-1 p-10 font-mono text-[13px] leading-relaxed text-slate-700 overflow-y-auto custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/pinstriped-suit.png')] relative">
              {isProcessing ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm gap-4 z-50">
                   <div className="w-20 h-1 bg-indigo-600 rounded-full animate-pulse"></div>
                   <p className="text-[10px] uppercase tracking-[0.3em] font-black text-slate-800 italic animate-bounce">L'Ufficiale IA sta analizzando i documenti...</p>
                </div>
              ) : generatedDraft ? (
                <div className="bg-white p-12 shadow-2xl border border-slate-100 min-h-full mx-auto max-w-4xl relative">
                  {/* Filigrana estetica */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
                     <span className="text-9xl font-black italic -rotate-12">ESERCITO</span>
                  </div>
                  <pre className="whitespace-pre-wrap font-mono relative z-10">{generatedDraft}</pre>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-6">
                   <div className="w-24 h-24 rounded-full border-4 border-slate-100 flex items-center justify-center">
                     <span className="text-5xl">📄</span>
                   </div>
                   <div className="text-center">
                      <p className="text-[10px] font-black uppercase tracking-[0.5em]">In attesa di input</p>
                      <p className="text-[8px] font-bold text-slate-400 mt-2">Configura il prompt e seleziona gli allegati per iniziare.</p>
                   </div>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
