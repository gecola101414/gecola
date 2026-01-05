
import React, { useState, useMemo, useEffect } from 'react';
import { ChatMessage, Attachment, User, UserRole } from '../types';
import { GoogleGenAI } from "@google/genai";

interface AssitenteRisposteProps {
  messages: ChatMessage[];
  currentUser: User;
}

type AIStatus = 'checking' | 'ready' | 'not-supported' | 'downloading';

export const AssitenteRisposte: React.FC<AssitenteRisposteProps> = ({ messages, currentUser }) => {
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [userPrompt, setUserPrompt] = useState('');
  const [generatedDraft, setGeneratedDraft] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [engine, setEngine] = useState<'local-ai' | 'local-heuristic' | 'cloud-ai'>('local-heuristic');
  const [localAIStatus, setLocalAIStatus] = useState<AIStatus>('checking');

  // Rilevamento capacità browser
  useEffect(() => {
    const detectCapabilities = async () => {
      // @ts-ignore
      if (window.ai && window.ai.canCreateTextSession) {
        try {
          // @ts-ignore
          const capabilities = await window.ai.canCreateTextSession();
          if (capabilities === 'readily') {
            setLocalAIStatus('ready');
            setEngine('local-ai');
          } else if (capabilities === 'after-download') {
            setLocalAIStatus('downloading');
            setEngine('local-heuristic');
          } else {
            setLocalAIStatus('not-supported');
            setEngine('local-heuristic');
          }
        } catch (e) {
          setLocalAIStatus('not-supported');
        }
      } else {
        setLocalAIStatus('not-supported');
        setEngine('local-heuristic');
      }
    };
    detectCapabilities();
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

  // Fix: added missing toggleAttachment function to allow selecting/deselecting attachments
  const toggleAttachment = (id: string) => {
    setSelectedAttachmentIds(prev => 
      prev.includes(id) ? prev.filter(aid => aid !== id) : [...prev, id]
    );
  };

  // MOTORE EURISTICO LOCALE (Funziona senza IA)
  const generateHeuristicDraft = (prompt: string, files: Attachment[]) => {
    const p = prompt.toLowerCase();
    const dateStr = new Date().toLocaleDateString();
    const filesList = files.map(f => f.name).join(", ");
    
    let tone = "formale";
    let action = "In riferimento alla pratica in oggetto";
    
    if (p.includes("rifiuta") || p.includes("nega") || p.includes("no")) {
      action = "Si comunica con rammarico l'impossibilità di procedere con l'istanza";
    } else if (p.includes("accetta") || p.includes("approva") || p.includes("si")) {
      action = "Si esprime parere favorevole in merito alla richiesta";
    } else if (p.includes("sollecita") || p.includes("urgenza")) {
      action = "Si richiede con sollecitudine un riscontro urgente in merito a quanto";
    } else if (p.includes("chiarisci") || p.includes("info")) {
      action = "Si richiedono ulteriori chiarimenti tecnici integrativi necessari per";
    }

    return `COMANDO MILITARE ESERCITO LOMBARDIA
Ufficio: ${currentUser.workgroup}
Data: ${dateStr}

OGGETTO: Riscontro nota relativa a: ${files.length > 0 ? files[0].name : "Documentazione Tecnica"}.

${action} trasmessa in data odierna. 

In particolare, analizzati i riferimenti di cui agli allegati (${filesList || "Dati di sistema"}), si evidenzia che la direttiva impartita dal Comando prevede un'analisi rigorosa dei criteri di conformità vigenti. 

Dettaglio Direttiva:
"${prompt}"

Rimanendo a disposizione per ulteriori approfondimenti, si porgono distinti saluti.

L'operatore incaricato: ${currentUser.username.toUpperCase()}
Protocollo Generato via Euristica Locale v4.0 (Nessun dato esterno utilizzato)`;
  };

  const handleGenerateResponse = async () => {
    if (!userPrompt.trim()) return;
    setIsProcessing(true);
    setGeneratedDraft('');

    try {
      const selectedFiles = allAttachments.filter(a => selectedAttachmentIds.includes(a.id));
      
      if (engine === 'local-ai') {
        // --- 1. IA NATIVA DEL BROWSER ---
        // @ts-ignore
        const session = await window.ai.createTextSession();
        const fileCtx = selectedFiles.map(f => f.name).join(", ");
        const result = await session.prompt(`Agisci come assistente militare. Scrivi una risposta formale basata su questa direttiva: "${userPrompt}". Considera questi file allegati: ${fileCtx}`);
        setGeneratedDraft(result);
      } else if (engine === 'cloud-ai') {
        // --- 2. IA CLOUD (GEMINI) ---
        // Use Gemini 3 series for complex reasoning tasks as per guidelines
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const parts: any[] = selectedFiles.map(file => ({
          inlineData: { mimeType: file.type || 'application/pdf', data: file.data.split(',')[1] }
        }));
        parts.push({ text: `Risposta formale Comando Militare Lombardia. Direttiva: "${userPrompt}"` });
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: [{ parts }]
        });
        // Correctly accessing text property from GenerateContentResponse
        setGeneratedDraft(response.text || 'Errore cloud.');
      } else {
        // --- 3. MOTORE EURISTICO (OFFLINE / NO-AI) ---
        setGeneratedDraft(generateHeuristicDraft(userPrompt, selectedFiles));
      }
    } catch (error) {
      setGeneratedDraft(generateHeuristicDraft(userPrompt, allAttachments.filter(a => selectedAttachmentIds.includes(a.id))));
      console.error("Switching to Heuristic fallback.");
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedDraft);
    alert("Copiato.");
  };

  return (
    <div className="h-full flex gap-4 animate-in fade-in duration-500 font-['Inter'] overflow-hidden">
      {/* SIDEBAR SINISTRA */}
      <div className="w-72 flex flex-col gap-2 bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-4 bg-slate-900">
           <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest italic">Vault Scans</h3>
           <p className="text-white text-[8px] font-bold uppercase opacity-60">Seleziona fonti dati</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
          {allAttachments.map(att => (
            <div 
              key={att.id}
              onClick={() => toggleAttachment(att.id)}
              className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-3 ${selectedAttachmentIds.includes(att.id) ? 'bg-indigo-50 border-indigo-600 shadow-sm' : 'bg-slate-50 border-slate-100 hover:border-indigo-200'}`}
            >
               <div className={`w-3 h-3 rounded flex items-center justify-center border ${selectedAttachmentIds.includes(att.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'}`}>
                 {selectedAttachmentIds.includes(att.id) && <span className="text-[7px]">✓</span>}
               </div>
               <p className="text-[9px] font-black text-slate-800 truncate uppercase">{att.name}</p>
            </div>
          ))}
        </div>

        {/* SELETTORE MOTORE */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-2">
           <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest text-center">Protocollo Elaborazione</p>
           <div className="flex flex-col gap-1">
              <button 
                onClick={() => setEngine('local-heuristic')}
                className={`w-full py-2 rounded-lg text-[8px] font-black uppercase border-2 transition-all ${engine === 'local-heuristic' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-400'}`}
              >
                Analisi Euristica (Offline)
              </button>
              <button 
                onClick={() => localAIStatus === 'ready' && setEngine('local-ai')}
                disabled={localAIStatus !== 'ready'}
                className={`w-full py-2 rounded-lg text-[8px] font-black uppercase border-2 transition-all ${engine === 'local-ai' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white border-slate-200 text-slate-400 opacity-50'}`}
              >
                Browser IA {localAIStatus === 'ready' ? '✓' : '(Inattiva)'}
              </button>
              <button 
                onClick={() => setEngine('cloud-ai')}
                className={`w-full py-2 rounded-lg text-[8px] font-black uppercase border-2 transition-all ${engine === 'cloud-ai' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}
              >
                Cloud AI Gemini
              </button>
           </div>
        </div>
      </div>

      {/* AREA CONTENUTO */}
      <div className="flex-1 flex flex-col gap-4 min-h-0">
        <div className="bg-white rounded-[2rem] p-3 border border-slate-200 shadow-xl flex gap-3 items-center flex-shrink-0">
           <textarea 
             value={userPrompt}
             onChange={(e) => setUserPrompt(e.target.value)}
             placeholder="Inserisci la guida per la bozza (es. raccorda con l'ufficio tecnico...)"
             className="flex-1 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-[12px] font-medium text-slate-700 outline-none focus:border-indigo-600 transition-all resize-none h-16"
           />
           <button 
            onClick={handleGenerateResponse}
            disabled={isProcessing || !userPrompt.trim()}
            className="h-16 w-36 rounded-2xl bg-indigo-600 text-white font-black uppercase text-[9px] tracking-widest shadow-lg hover:bg-indigo-700 active:scale-95 flex flex-col items-center justify-center gap-1 transition-all"
           >
             {isProcessing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span>GENERA ✍️</span>}
           </button>
        </div>

        <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col relative min-h-0">
           <div className={`p-2 px-6 flex justify-between items-center flex-shrink-0 ${engine === 'local-heuristic' ? 'bg-slate-800' : engine === 'local-ai' ? 'bg-emerald-900' : 'bg-indigo-900'}`}>
              <div className="flex items-center gap-3">
                 <span className="text-[9px] font-black text-white uppercase tracking-widest italic">
                    MODO: {engine === 'local-heuristic' ? 'ANALISI EURISTICA LOCALE (NO-AI)' : engine === 'local-ai' ? 'INTELLIGENZA NATIVA BROWSER' : 'POTENZA CLOUD IA'}
                 </span>
              </div>
              {generatedDraft && <button onClick={copyToClipboard} className="text-[8px] font-black text-white bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-lg transition-all">COPIA TESTO</button>}
           </div>
           
           <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-white">
              {generatedDraft ? (
                <div className="bg-white p-12 shadow-sm border border-slate-100 min-h-full mx-auto max-w-4xl font-mono text-[13px] leading-relaxed text-slate-800">
                  <pre className="whitespace-pre-wrap">{generatedDraft}</pre>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                   <span className="text-5xl opacity-20">📄</span>
                   <p className="text-[10px] font-black uppercase tracking-[0.5em] opacity-40">Attesa Input</p>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
