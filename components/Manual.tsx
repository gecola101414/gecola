
import React, { useState } from 'react';

interface ManualProps {
  commandName: string;
}

const Manual: React.FC<ManualProps> = ({ commandName }) => {
  const [activeTab, setActiveTab] = useState<'genesis' | 'ops'>('genesis');
  const [activeChapter, setActiveChapter] = useState(1);

  const chapters = [
    { 
      id: 1, 
      title: "Fase 1: Iniezione Risorse (IDV)", 
      content: "L'operatività inizia nella sezione 'Fondi'. Un Amministratore deve registrare un Identificativo di Valuta (IDV). Inserendo il capitolo, l'importo e l'ufficio di assegnazione, si crea la 'base monetaria' su cui lavorare. Senza un IDV attivo, il sistema non permetterà di creare nuovi impegni di spesa."
    },
    { 
      id: 2, 
      title: "Fase 2: Pianificazione e Obiettivi", 
      content: "Prima di diventare un impegno contabile, un'idea deve essere inserita in 'Obiettivi'. Qui i tecnici caricano le schede progetto. Il Comandante o il R.E.P.P.E. possono visionare queste liste e 'Decretare' o 'Sigillare' gli obiettivi. Questo passaggio garantisce che ogni spesa futura sia allineata all'intendimento strategico del Comando."
    },
    { 
      id: 3, 
      title: "Fase 3: Creazione dell'Impegno (Stage 1)", 
      content: "Dalla sezione 'Lavori', cliccando sul pulsante '+' si apre il fascicolo. Bisogna selezionare il capitolo e i fondi (IDV) precedentemente creati. Caricando la relazione tecnica in PDF e inserendo il valore di stima, la pratica entra ufficialmente nel ciclo finanziario. Il sistema blocca la creazione se la somma degli IDV selezionati non copre il valore stimato."
    },
    { 
      id: 4, 
      title: "Fase 4: Gara e Affidamento (Stage 2)", 
      content: "Una volta completata la progettazione, si clicca sul pallino '2' della pratica. Qui si inseriscono i dati della ditta vincitrice e il valore di contratto finale. Se il contratto è inferiore alla stima, il sistema ricalcola automaticamente l'economia di gara, liberando il residuo sul fondo IDV originale per altri utilizzi."
    },
    { 
      id: 5, 
      title: "Fase 5: Liquidazione e CRE (Stage 3)", 
      content: "Al termine dell'opera, si clicca sul pallino '3'. Si inseriscono i dati della fattura e l'importo effettivamente pagato. Al salvataggio, la pratica viene marcata come 'Pagata' e il PPB abilita il tasto 'CRE' per generare e stampare istantaneamente il Certificato di Regolare Esecuzione con tutti i dati di legge precompilati."
    },
    { 
      id: 6, 
      title: "Monitoraggio e Analisi", 
      content: "La 'Analisi' (Dashboard) fornisce una vista in tempo reale dei flussi finanziari per capitolo. Da qui è possibile esportare report PDF per le riunioni di coordinamento o generare slide PowerPoint automatiche che mostrano l'avanzamento della spesa del Comando."
    },
    { 
      id: 7, 
      title: "Sicurezza e Registro Storico", 
      content: "Ogni azione compiuta (modifica, cancellazione, accesso) viene salvata nel 'REGISTRO'. Questo elenco è immutabile e permette di tracciare la responsabilità di ogni operatore. In caso di errori, è possibile utilizzare i tasti 'Undo/Redo' in alto per tornare a uno stato precedente del database."
    }
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-10 duration-1000 pb-40 px-6">
      
      {/* HEADER MASTER */}
      <div className="relative overflow-hidden bg-slate-950 rounded-[4rem] p-16 text-white shadow-2xl border-2 border-slate-800">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full -mr-40 -mt-40 blur-[120px]"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-end gap-12">
           <div className="space-y-6">
              <div className="inline-flex items-center gap-3 px-6 py-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-black uppercase tracking-[0.5em] rounded-full">
                PPB Operational Protocol - Versione 4.0
              </div>
              <h1 className="text-8xl font-black tracking-tighter italic uppercase leading-[0.85] select-none">
                {activeTab === 'genesis' ? 'La Genesi' : 'Operatività'}
              </h1>
              <p className="text-slate-500 text-xl font-medium italic max-w-2xl border-l-4 border-indigo-500/30 pl-6">
                Guida tecnica e concettuale per l'organizzazione {commandName}.
              </p>
           </div>
           
           <div className="flex bg-slate-900/50 backdrop-blur-md p-2 rounded-3xl border border-white/5 shadow-2xl">
              <button 
                onClick={() => setActiveTab('genesis')}
                className={`px-10 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${activeTab === 'genesis' ? 'bg-indigo-600 text-white shadow-[0_10px_30px_rgba(79,70,229,0.4)]' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Visione
              </button>
              <button 
                onClick={() => setActiveTab('ops')}
                className={`px-10 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${activeTab === 'ops' ? 'bg-indigo-600 text-white shadow-[0_10px_30px_rgba(79,70,229,0.4)]' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Manuale Operativo
              </button>
           </div>
        </div>
      </div>

      {activeTab === 'genesis' ? (
        <div className="animate-in fade-in zoom-in-95 duration-700">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-20 items-start px-4">
            <div className="lg:col-span-8 space-y-16">
              <div className="space-y-8">
                <h2 className="text-6xl font-black text-slate-900 italic tracking-tighter uppercase leading-none">
                  La Certezza del Dato <br/>
                  <span className="text-indigo-600 underline decoration-indigo-100 underline-offset-[12px]">Autorità Decisionale</span>
                </h2>
                
                <div className="relative p-12 bg-white rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden group">
                  <div className="absolute top-0 right-0 p-12 text-9xl font-black italic opacity-5 select-none translate-x-10 -translate-y-10">PPB</div>
                  <div className="relative z-10 prose prose-slate prose-2xl italic text-slate-600 font-medium leading-[1.6] space-y-10 text-justify">
                    <p>
                      "Il Protocollo PPB nasce per garantire l'integrità assoluta della memoria amministrativa. In un contesto operativo moderno, la digitalizzazione deve offrire una base di verità non manipolabile."
                    </p>
                    <p>
                      "Attraverso questo strumento, il **Comandante** esercita la propria autorità decretando le pianificazioni e validando i progetti di spesa. Ogni firma digitale apposta su un obiettivo o su una pratica di liquidazione sancisce la certezza del flusso finanziario e la corretta allocazione delle risorse pubbliche."
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 sticky top-10 space-y-8">
              <div className="bg-indigo-600 rounded-[3.5rem] p-12 text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-10 -mt-10"></div>
                <h3 className="text-2xl font-black uppercase italic mb-8 border-b border-white/20 pb-4">Etica Digitale</h3>
                <ul className="space-y-10">
                  {[
                    { t: "Invarianza", d: "Il dato registrato nel PPB è immutabile e verificabile." },
                    { t: "Autorità", d: "Il Comando decreta i piani strategici e di spesa." },
                    { t: "Certezza", d: "Zero margini di errore nel calcolo dei residui e dei CIG." }
                  ].map((p, i) => (
                    <li key={i} className="space-y-2">
                      <p className="text-sm font-black uppercase tracking-widest text-indigo-200">{p.t}</p>
                      <p className="text-xs font-medium text-white/70 italic leading-relaxed text-justify">{p.d}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-in fade-in zoom-in-95 duration-700 px-4 min-h-[800px] flex flex-col lg:flex-row gap-12">
          
          {/* NAVIGAZIONE */}
          <div className="w-full lg:w-96 flex flex-col gap-2 overflow-y-auto no-scrollbar pr-4">
            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 pl-4 border-l-2 border-indigo-500/20">Guida Pratica</h4>
            {chapters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setActiveChapter(ch.id)}
                className={`flex items-center gap-4 p-5 rounded-[1.8rem] transition-all text-left group border-2 ${activeChapter === ch.id ? 'bg-indigo-600 border-indigo-600 shadow-xl scale-[1.02]' : 'bg-white border-slate-50 hover:border-indigo-100 hover:bg-slate-50/50'}`}
              >
                <span className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-[10px] transition-colors ${activeChapter === ch.id ? 'bg-white text-indigo-600' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-400'}`}>
                  {ch.id.toString().padStart(2, '0')}
                </span>
                <span className={`text-[9px] font-black uppercase tracking-widest leading-tight transition-colors ${activeChapter === ch.id ? 'text-white' : 'text-slate-500'}`}>
                  {ch.title}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-8">
            <div className="bg-white rounded-[4rem] border border-slate-100 shadow-2xl p-16 relative overflow-hidden flex flex-col min-h-[600px]">
               <div className="relative z-10 flex-1 flex flex-col">
                  <div className="mb-12">
                    <h3 className="text-6xl font-black text-slate-900 italic uppercase tracking-tighter leading-tight max-w-4xl">
                      {chapters.find(c => c.id === activeChapter)?.title}
                    </h3>
                  </div>
                  <div className="flex-1">
                    <div className="prose prose-slate prose-xl italic text-slate-500 font-medium leading-[1.8] text-justify whitespace-pre-line bg-slate-50/40 p-12 rounded-[3.5rem] border border-slate-50 shadow-inner">
                       {chapters.find(c => c.id === activeChapter)?.content}
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER MASTER */}
      <div className="pt-32 border-t border-slate-200 flex flex-col items-center gap-8 text-center">
         <div className="w-32 h-32 bg-slate-950 rounded-[3rem] flex items-center justify-center text-white text-6xl font-black italic shadow-2xl relative border-4 border-slate-800">
            PPB
            <div className="absolute -bottom-3 -right-3 w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-xs shadow-xl border-4 border-slate-950">4.0</div>
         </div>
         <div className="space-y-4">
            <p className="text-lg font-black text-slate-400 uppercase tracking-[0.4em] italic">PPB Master Protocol - Versione Universale</p>
            <div className="space-y-1">
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">PROPRIETÀ: {commandName.toUpperCase()}</p>
               <p className="text-[9px] text-indigo-500 font-black uppercase tracking-[0.3em]">Precision Engineering for Operational Excellence</p>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Manual;
