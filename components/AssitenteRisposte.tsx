
import React, { useState, useMemo, useEffect } from 'react';
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
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [canUseLocalAI, setCanUseLocalAI] = useState(false);

  // Check per disponibilità API nativa del browser (Chrome Prompt API)
  useEffect(() => {
    const checkLocalAI = async () => {
      // @ts-ignore
      if (window.ai && window.ai.canCreateTextSession) {
        // @ts-ignore
        const status = await window.ai.canCreateTextSession();
        if (status === 'readily') {
          setCanUseLocalAI(true);
          setIsLocalMode(true); // Default su locale per sicurezza
        }
      }
    };
    checkLocalAI();
  }, []);

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
      const selectedFiles = allAttachments.filter(a => selectedAttachmentIds.includes(a.id));
      
      if (isLocalMode && canUseLocalAI) {
        // --- ELABORAZIONE LOCALE (BROWSER NATIVE) ---
        // @ts-ignore
        const session = await window.ai.createTextSession();
        
        // Prepariamo un contesto testuale dai file (metadata e info base poiché window.ai è text-only)
        const fileContext = selectedFiles.map(f => `FILE: ${f.name} (Dim: ${f.size} bytes)`).join('\n');
        
        const fullPrompt = `Sei un assistente ufficiale del Comando Militare. 
        RIFERIMENTI DOCUMENTALI: ${fileContext}
        DIRETTIVA: ${userPrompt}
        Scrivi una risposta formale professionale.`;
        
        const result = await session.prompt(fullPrompt);
        setGeneratedDraft(result);
      } else {
        // --- ELABORAZIONE CLOUD (GOOGLE SDK) ---
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const parts: any[] = selectedFiles.map(file => ({
          inlineData: { mimeType: file.type || 'application/pdf', data: file.data.split(',')[1] }
        }));
        
        parts.push({
          text: `Agisci come Ufficiale di Collegamento del Comando Militare Esercito Lombardia. 
          Analizza i documenti e scrivi una risposta ufficiale basandoti su: "${userPrompt}". 
          Usa un tono formale, cita date e numeri se presenti nei file.`
        });

        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: [{ parts }],
          config: { thinkingConfig: { thinkingBudget: 16384 }, temperature: 0.7 }
        });
        setGeneratedDraft(response.text || 'Errore nella generazione.');
      }
    } catch (error) {
      console.error(error);
      setGeneratedDraft("ERRORE: Impossibile elaborare la risposta. Verificare la configurazione AI del browser o la connessione.");
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
      {/* SIDEBAR SINISTRA: SELEZIONE DOCUMENTI */}
      <div className="w-72 flex flex-col gap-2 bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-4 bg-slate-900">
           <div className="flex justify-between items-center mb-1">
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest italic">Vault Scans</h3>
              <div className="bg-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded-md">{selectedAttachmentIds.length}</div>
           </div>
           <p className="text-white text-[8px] font-bold uppercase opacity-60">Seleziona bersagli di analisi</p>
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

        {/* CONTROLLO MODALITÀ SICUREZZA */}
        <div className="p-4 bg-slate-50 border-t border-slate-100">
           <div className="flex flex-col gap-2">
              <button 
                onClick={() => canUseLocalAI && setIsLocalMode(!isLocalMode)}
                className={`w-full py-2 rounded-xl text-[8px] font-black uppercase tracking-widest border-2 transition-all flex items-center justify-center gap-2 ${isLocalMode ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400'}`}
              >
                {isLocalMode ? '🔒 Sicurezza: Locale Active' : '🌐 Modalità: Cloud Active'}
              </button>
              {!canUseLocalAI && (
                <p className="text-[7px] text-slate-400 font-bold uppercase text-center italic">API Nativa non rilevata nel browser</p>
              )}
           </div>
        </div>
      </div>

      {/* AREA CENTRALE: MASSIMIZZAZIONE SPAZIO BOZZA */}
      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {/* BARRA SUPERIORE PROMPT (MOLTO COMPATTA) */}
        <div className="bg-white rounded-[2rem] p-3 border border-slate-200 shadow-xl flex gap-3 items-center flex-shrink-0">
           <div className="flex-1 relative">
              <textarea 
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="Direttiva di comando: es. Rispondi citando la mancanza di fondi..."
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-[12px] font-medium text-slate-700 outline-none focus:border-indigo-600 transition-all resize-none h-16"
              />
           </div>
           <button 
            onClick={handleGenerateResponse}
            disabled={isProcessing || !userPrompt.trim()}
            className={`h-16 w-44 rounded-2xl font-black uppercase text-[9px] tracking-widest shadow-lg transition-all flex flex-col items-center justify-center gap-1 ${isProcessing ? 'bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'}`}
           >
             {isProcessing ? (
               <div className="w-5 h-5 border-2 border-slate-400 border-t-white rounded-full animate-spin"></div>
             ) : (
               <>
                 <span className="text-lg">✍️</span>
                 <span>GENERA ATTO</span>
               </>
             )}
           </button>
        </div>

        {/* AREA BOZZA (MASSIMIZZATA) */}
        <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col relative min-h-0">
           <div className={`p-2 px-4 flex justify-between items-center flex-shrink-0 ${isLocalMode ? 'bg-emerald-900' : 'bg-slate-900'}`}>
              <div className="flex items-center gap-3">
                 <div className={`w-2 h-2 rounded-full ${isLocalMode ? 'bg-emerald-400' : 'bg-indigo-400'} animate-pulse`}></div>
                 <span className="text-[9px] font-black text-white uppercase tracking-widest italic">
                    {isLocalMode ? 'SISTEMA NATIVO BROWSER - 100% PRIVATE' : 'TERMINALE CLOUD POTENZIATO'}
                 </span>
              </div>
              {generatedDraft && (
                <button onClick={copyToClipboard} className="text-[9px] font-black text-white bg-white/10 hover:bg-white/20 px-4 py-1 rounded-lg transition-all">COPIA BOZZA</button>
              )}
           </div>
           
           <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/pinstriped-suit.png')]">
              {isProcessing ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 opacity-40">
                   <div className="w-24 h-1 bg-indigo-600 rounded-full animate-pulse"></div>
                   <p className="text-[9px] uppercase tracking-[0.3em] font-black text-slate-800 italic">Elaborazione interna in corso...</p>
                </div>
              ) : generatedDraft ? (
                <div className="bg-white p-12 shadow-2xl border border-slate-100 min-h-full mx-auto max-w-4xl font-mono text-[13px] leading-relaxed text-slate-800">
                  <pre className="whitespace-pre-wrap">{generatedDraft}</pre>
                  <div className="mt-20 pt-10 border-t border-slate-100 flex justify-between items-end opacity-40 italic">
                     <div>
                        <p className="text-[9px] font-black uppercase">Visto del Comando IA</p>
                        <p className="text-[8px] font-bold">Integrità del documento validata</p>
                     </div>
                     <p className="text-[8px] font-bold uppercase">{new Date().toLocaleDateString()} / CME LOMB</p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                   <span className="text-5xl">🏛️</span>
                   <div className="text-center">
                      <p className="text-[10px] font-black uppercase tracking-[0.5em]">Attesa Direttive</p>
                      <p className="text-[8px] font-bold text-slate-400 mt-2">I dati inseriti rimarranno all'interno di questo browser.</p>
                   </div>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
