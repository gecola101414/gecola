
import React, { useState } from 'react';

const Manual: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'genesis' | 'ops'>('genesis');
  const [activeChapter, setActiveChapter] = useState(1);

  const chapters = [
    { 
      id: 1, 
      title: "Architettura e Cifratura Quantistica", 
      content: "Il Vault opera su un framework proprietario denominato 'Hyper-Safe Core'. Ogni pacchetto dati viene frammentato in blocchi da 128-bit e processato tramite un algoritmo AES-256 in modalità GCM (Galois/Counter Mode). Questa modalità non si limita alla cifratura, ma fornisce un 'Authentication Tag' univoco per ogni record. Se un solo bit del database viene alterato (anche per degradazione fisica del supporto), il sistema rileva la discrepanza nel tag GCM e impedisce il caricamento del file corrotto, garantendo l'integrità assoluta del dato storico. La chiave di sessione è derivata tramite PBKDF2 (Password-Based Key Derivation Function 2) con un salt variabile di 256-bit."
    },
    { 
      id: 2, 
      title: "Gestione Identità e Privilegi (IAM)", 
      content: "Il protocollo Identity and Access Management segue lo standard 'Least Privilege Access'. I ruoli non sono semplici etichette, ma matrici di permessi binari mappate sui componenti UI. L'Ufficio Tecnico detiene l'authority sulla 'Estimated Value Baseline', mentre l'Ufficio Amministrativo possiede l'authority esclusiva sul 'Payment Trigger'. Ogni interazione dell'utente viene firmata digitalmente con un timestamp non ripudiabile, creando una catena di responsabilità che rende impossibile l'inserimento di dati anonimi o non autorizzati."
    },
    { 
      id: 3, 
      title: "Asset Transazionale Atomico (IDV)", 
      content: "L'Identificativo di Valuta (IDV) è l'unità fondamentale di energia finanziaria del sistema. Ogni IDV deve essere considerato un database relazionale a sé stante. Il sistema impedisce la creazione di IDV senza una 'Justification String' valida. La logica di business impone che la somma dei lavori collegati a un IDV non superi mai l'importo nominale dello stesso. In caso di tentativo di sforamento, il core logico attiva un 'Overflow Exception' che blocca l'interfaccia utente fino al ripristino dei parametri di congruità economica."
    },
    { 
      id: 4, 
      title: "Protocollo Stage 1: Progettazione Strategica", 
      content: "Lo Stage 1 trasforma un'esigenza verbale in un'entità contabile. In questa fase, il sistema calcola la 'Financial Reserve'. Il caricamento del progetto in formato PDF non è opzionale: il Vault esegue un check sulla presenza del file per validare lo stato. Il valore di stima inserito funge da 'Anchor' per tutte le fasi successive. Se il valore di stima viene modificato dopo l'inizio dello Stage 2, il sistema richiede una nota di variazione obbligatoria per tracciare il motivo del cambio di perimetro economico dell'opera."
    },
    { 
      id: 5, 
      title: "Protocollo Stage 2: Affidamento e Gara", 
      content: "La fase di affidamento richiede l'associazione di tre parametri critici: Ditta, CIG e Valore di Contratto. Il Vault opera qui una funzione di 'Economy Harvesting'. Nel momento in cui il valore di contratto viene validato come inferiore alla stima originale, il differenziale viene istantaneamente ricalcolato e reso disponibile nel pool dei residui attivi del capitolo di appartenenza. Questo protocollo di riallocazione immediata previene il ristagno di fondi impegnati ma non utilizzati, ottimizzando la velocità di spesa del Team di Lavoro."
    },
    { 
      id: 6, 
      title: "Protocollo Stage 3: Liquidazione e Chiusura", 
      content: "La liquidazione è l'ultimo stadio del ciclo di vita del lavoro. Richiede l'inserimento della fattura elettronica (o relativo metadato) e la verifica della conformità. Una volta che lo stato passa a 'Pagamento', il record diventa immutabile. La modifica di un lavoro liquidato richiede un 'Admin Hard-Reset'. Questo garantisce che i report generati per le revisioni contabili siano specchi fedeli della realtà finanziaria, privi di modifiche retroattive che potrebbero inficiare la trasparenza del processo."
    },
    { 
      id: 7, 
      title: "CRE Auto-Engine: Automazione Documentale", 
      content: "Il Certificato di Regolare Esecuzione (CRE) viene generato attraverso un motore di composizione vettoriale che aggrega i dati provenienti dai tre stage. Il sistema esegue un cross-check finale: verifica che la ditta dello Stage 2 coincida con l'intestatario della fattura dello Stage 3 e che l'importo liquidato sia coerente con il contratto. Il documento viene renderizzato in PDF/A-1b per garantire l'archiviazione a lungo termine senza perdita di fedeltà visiva, includendo un timestamp crittografico che ne valida l'autenticità."
    },
    { 
      id: 8, 
      title: "Strategic Planning e Modulo Sandbox", 
      content: "Il modulo di pianificazione permette al Team di Lavoro di operare in una 'Virtual Sandbox'. Qui le esigenze possono essere create, raggruppate e spostate tra liste di priorità senza influenzare il registro contabile ufficiale. Il sistema fornisce strumenti di aggregazione rapida (Total Sum) per ogni gruppo, permettendo di presentare piani di spesa futuribili con dati certi. Il Drag & Drop tra liste non è solo estetico: sposta l'esigenza in un contesto gerarchico differente, aggiornando istantaneamente i report di previsione."
    },
    { 
      id: 9, 
      title: "Deep Speech Processing e Interfaccia Vocale", 
      content: "Il sistema integra un'interfaccia vocale basata sulle Web Speech API con logica di filtraggio contestuale. Tenendo premuto il tasto di input, il modulo isola la voce dell'operatore. Il trascritto viene analizzato da una regex proprietaria che identifica costanti numeriche e stringhe di testo. Se l'utente detta 'Cinquemila euro', il processore converte la stringa in '5000.00' pronto per il database. Questo riduce l'errore umano di battitura durante l'inserimento di grandi moli di dati descrittivi o tecnici."
    },
    { 
      id: 10, 
      title: "Sincronizzazione Multi-Node e Conflitti", 
      content: "In scenari di utilizzo multi-utente su cartelle di rete condivise, il Vault implementa un protocollo di 'Optimistic Locking'. Ogni sessione monitora il timestamp di ultima modifica del file sorgente. Se un operatore tenta di salvare mentre un altro ha già aggiornato il file, il sistema blocca l'operazione e propone un 'Conflict Resolution Tool'. L'operatore può scegliere di sovrascrivere o integrare i propri dati, assicurando che nessuna informazione venga persa a causa di collisioni di scrittura concorrente."
    },
    { 
      id: 11, 
      title: "Motore di Esportazione PDF e PPTX", 
      content: "L'esportazione dei dati utilizza bridge tra il DOM HTML e i motori di generazione binaria. Le dashboard vengono convertite in buffer di immagine ad alta risoluzione (300 DPI) per essere iniettate nelle slide PowerPoint, garantendo che i grafici rimangano nitidi anche su proiettori 4K. I report PDF seguono template ministeriali rigidi, ottimizzando margini e interlinee per la stampa laser standard. Ogni export include un header di sicurezza che riporta la versione del database e l'utente esportatore."
    },
    { 
      id: 12, 
      title: "Infrastruttura di Backup 3-2-1", 
      content: "Il sistema promuove una politica di backup a file singolo. Essendo il database contenuto interamente nel file .PPB, il ripristino è istantaneo: basta sostituire il file corrotto con l'ultima copia valida. Si raccomanda di mantenere 3 copie (originale + 2 backup), su 2 supporti differenti, di cui 1 fisicamente disconnesso dalla rete per prevenire attacchi ransomware. Il Vault esegue un 'Self-Check' all'avvio: se il checksum non quadra, avvisa l'utente prima di permettere qualsiasi modifica."
    },
    { 
      id: 13, 
      title: "Gestione Residui Attivi e Passivi", 
      content: "Operativamente, la gestione dei residui richiede un'attenzione millimetrica. Il Vault distingue tra 'Residuo di Capitolo' (fondi assegnati ma non ancora impegnati) e 'Residuo di Pratica' (fondi impegnati ma non ancora liquidati). Il sistema fornisce una vista 'Netta' che sottrae immediatamente ogni impegno (anche solo stimato) dalla disponibilità, evitando l'illusione di possedere fondi che sono già destinati a progetti in corso, seppur non ancora contrattualizzati."
    },
    { 
      id: 14, 
      title: "Protocollo Validazione CIG e CUP", 
      content: "Il CIG (Codice Identificativo Gara) e il CUP (Codice Unico Progetto) sono trattati come chiavi esterne di validazione. Il Vault non permette il passaggio allo Stage 2 se il formato del CIG non è coerente con gli standard ANAC. Questi codici sono essenziali per la tracciabilità dei flussi finanziari e vengono inseriti automaticamente in tutti i documenti di export (CRE, Report, PPTX), eliminando il rischio di discrepanze tra il sistema gestionale interno e i portali di monitoraggio nazionali."
    },
    { 
      id: 15, 
      title: "Audit Log Forense e Tracciabilità", 
      content: "Ogni azione compiuta nel Vault lascia una traccia indelebile. L'Audit Log registra l'ID utente, l'indirizzo IP (se disponibile), il timestamp preciso e il 'Before/After' dei dati modificati. In caso di contestazioni o errori contabili, l'Amministratore può ricostruire l'intera sequenza di eventi che ha portato a un determinato stato del database. Questo log è cifrato insieme al resto dei dati e non può essere alterato o eliminato dagli utenti standard, garantendo l'integrità del processo di revisione."
    },
    { 
      id: 16, 
      title: "Emergency Protocol: Accesso Offline", 
      content: "Il Vault è progettato per funzionare in totale assenza di connettività internet (Air-Gapped environments). Tutti i motori di calcolo, rendering e cifratura risiedono nel client locale. Questo elimina la dipendenza da server esterni e protegge il Team di Lavoro da blackout infrastrutturali. In caso di emergenza, il file .PPB può essere spostato su qualsiasi stazione di lavoro dotata del software Vault per riprendere le operazioni in meno di 60 secondi."
    },
    { 
      id: 17, 
      title: "Cross-Check di Integrità IDV-Order", 
      content: "Il cuore del sistema esegue ciclicamente un 'Integrity Sweep'. Questo processo verifica che ogni Work Order sia collegato a IDV esistenti e che la somma degli ordini non ecceda mai il fondo IDV originario. Se viene rilevata un'incongruenza (ad esempio a causa di una cancellazione manuale forzata di un IDV), il sistema evidenzia le pratiche 'Orfane' con un alert rosso nel registro, impedendo la generazione di documenti CRE fino alla correzione del collegamento."
    },
    { 
      id: 18, 
      title: "Ottimizzazione Query e Performance", 
      content: "Nonostante il database possa crescere fino a migliaia di record, la velocità di risposta è garantita da un sistema di 'Indexing In-Memory'. Al caricamento del file .PPB, il Vault indicizza le chiavi primarie (IDV Code, Order Number, Capitolo) in strutture dati ad accesso rapido (Hash Maps). Questo permette ricerche istantanee e ricalcoli di bilancio globali in tempo reale (inferiori a 16ms), mantenendo l'interfaccia fluida e reattiva anche durante sessioni di lavoro intensive."
    },
    { 
      id: 19, 
      title: "Protocollo Comunicazione e Note Staff", 
      content: "Per favorire il coordinamento del Team di Lavoro, il Vault permette l'inserimento di note tecniche all'interno di ogni pratica e IDV. Queste note non sono semplici commenti, ma 'Contextual Metadata' che viaggiano insieme al dato. Un operatore dell'Ufficio Tecnico può lasciare specifiche istruzioni all'Amministrativo, che le visualizzerà direttamente all'apertura del modulo di liquidazione, riducendo la necessità di comunicazioni esterne e centralizzando la conoscenza."
    },
    { 
      id: 20, 
      title: "Decommissioning e Archiviazione Annata", 
      content: "Al termine dell'anno fiscale, il Vault prevede un protocollo di 'Freeze'. L'intero file .PPB viene marcato come 'Legacy' e salvato in un archivio storico a sola lettura. Viene quindi generato un nuovo file per l'annata successiva, importando esclusivamente i residui attivi e le pratiche non ancora liquidate. Questo processo di 'Purge' mantiene il database performante ed evita l'accumulo di dati obsoleti, pur conservando la possibilità di consultare gli archivi passati in qualsiasi momento."
    }
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-10 duration-1000 pb-40 px-6">
      
      {/* HEADER MASTER - NASA DESIGN AESTHETICS */}
      <div className="relative overflow-hidden bg-slate-950 rounded-[4rem] p-16 text-white shadow-2xl border-2 border-slate-800">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full -mr-40 -mt-40 blur-[120px]"></div>
        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-end gap-12">
           <div className="space-y-6">
              <div className="inline-flex items-center gap-3 px-6 py-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-black uppercase tracking-[0.5em] rounded-full">
                Manual Technical Specification - Rev. 2025.5
              </div>
              <h1 className="text-8xl font-black tracking-tighter italic uppercase leading-[0.85] select-none">
                {activeTab === 'genesis' ? 'La Genesi' : 'Operatività'}
              </h1>
              <p className="text-slate-500 text-xl font-medium italic max-w-2xl border-l-4 border-indigo-500/30 pl-6">
                Standard Operativo di Precisione per Team di Lavoro ad Alta Efficienza.
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
                Manuale Tecnico
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
                  L'Evoluzione del <br/>
                  <span className="text-indigo-600 underline decoration-indigo-100 underline-offset-[12px]">Team di Lavoro</span>
                </h2>
                
                <div className="relative p-12 bg-white rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden group">
                  <div className="absolute top-0 right-0 p-12 text-9xl font-black italic opacity-5 select-none translate-x-10 -translate-y-10">CORE</div>
                  <div className="relative z-10 prose prose-slate prose-2xl italic text-slate-600 font-medium leading-[1.6] space-y-10 text-justify">
                    <p>
                      "Correva l'anno 2024 quando, immerso nella gestione quotidiana del **Team di Lavoro**, percepii per la prima volta la fragilità intrinseca della nostra memoria amministrativa. Eravamo ostaggi di un'architettura effimera: dati frammentati tra fogli di calcolo vulnerabili, presentazioni che cristallizzavano verità già superate e archivi fisici disconnessi."
                    </p>
                    <p>
                      "Sentivo l'esigenza viscerale di colmare quel vuoto. Non bastava digitalizzare; serviva un'entità che garantisse la **Sovranità del Dato**. Il Vault nasce in quel momento: l'idea di trasformare il flusso operativo da un peso statico a un processo dinamico, protetto da una camera blindata crittografica che non ammette incertezze."
                    </p>
                    <p>
                      "Ogni membro del nostro Team di Lavoro deve sentire la sicurezza di operare su un registro immutabile. Abbiamo costruito un baluardo dove l'errore umano viene eroso dall'algoritmo e dove ogni risorsa trova la sua collocazione logica in un sistema di verità assoluta."
                    </p>
                  </div>
                  <div className="mt-12 pt-8 border-t border-slate-100 flex justify-between items-center">
                    <div>
                      <p className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Ing. GIMONDO Domenico</p>
                      <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Architect & Lead Developer</p>
                    </div>
                    <div className="w-16 h-1 bg-indigo-600/20 rounded-full"></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { l: "Mission", v: "DATO UNICO", d: "Sincronia Operativa" },
                  { l: "Vision", v: "PAPERLESS", d: "Digitalizzazione Totale" },
                  { l: "Goal", v: "PRECISIONE", d: "Conformità ISO" }
                ].map((s, i) => (
                  <div key={i} className="bg-slate-900 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl group hover:border-indigo-500/50 transition-all">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{s.l}</p>
                    <p className="text-4xl font-black text-indigo-400 italic mb-1">{s.v}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{s.d}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 sticky top-10 space-y-8">
              <div className="bg-indigo-600 rounded-[3.5rem] p-12 text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-10 -mt-10"></div>
                <h3 className="text-2xl font-black uppercase italic mb-8 border-b border-white/20 pb-4">Etica Professionale</h3>
                <ul className="space-y-10">
                  {[
                    { t: "Responsabilità", d: "Ogni interazione è tracciata e firmata digitalmente." },
                    { t: "Trasparenza", d: "Il dato è accessibile secondo i privilegi IAM definiti." },
                    { t: "Evoluzione", d: "Protocolli adattivi basati sui feedback del Team." }
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
        <div className="animate-in fade-in zoom-in-95 duration-700 px-4 min-h-[1000px] flex flex-col lg:flex-row gap-12">
          
          {/* NAVIGAZIONE NASA-STYLE */}
          <div className="w-full lg:w-96 flex flex-col gap-2 overflow-y-auto no-scrollbar pr-4">
            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 pl-4 border-l-2 border-indigo-500/20">Operational Sections</h4>
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

          {/* AREA DETTAGLIO NASA-STYLE */}
          <div className="flex-1 space-y-8">
            <div className="bg-white rounded-[4rem] border border-slate-100 shadow-2xl p-16 relative overflow-hidden flex flex-col min-h-[850px]">
               <div className="absolute top-0 right-0 p-20 opacity-5 font-black text-[18rem] italic select-none pointer-events-none tracking-tighter">
                  {activeChapter}
               </div>
               
               <div className="relative z-10 flex-1 flex flex-col">
                  <div className="mb-12">
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-xs font-black text-indigo-600 uppercase tracking-[0.4em]">Section 0{activeChapter} / Protocol V.5</span>
                      <div className="h-[2px] w-20 bg-indigo-100"></div>
                    </div>
                    <h3 className="text-6xl font-black text-slate-900 italic uppercase tracking-tighter leading-tight max-w-4xl">
                      {chapters.find(c => c.id === activeChapter)?.title}
                    </h3>
                  </div>

                  <div className="flex-1">
                    <div className="prose prose-slate prose-xl italic text-slate-500 font-medium leading-[1.8] text-justify whitespace-pre-line bg-slate-50/40 p-12 rounded-[3.5rem] border border-slate-50 shadow-inner">
                       {chapters.find(c => c.id === activeChapter)?.content}
                    </div>
                  </div>

                  <div className="pt-12 mt-12 border-t border-slate-50 flex justify-between items-center">
                     <div className="flex gap-4">
                        <div className="px-5 py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest">Vault-Spec-0{activeChapter}</div>
                        <div className="px-5 py-3 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-[9px] font-black uppercase tracking-widest">Confidential / Internal Use Only</div>
                     </div>
                     <div className="flex gap-3">
                        <button 
                          disabled={activeChapter === 1}
                          onClick={() => setActiveChapter(prev => prev - 1)}
                          className="p-5 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-all disabled:opacity-30 active:scale-90"
                        >
                           <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button 
                          disabled={activeChapter === chapters.length}
                          onClick={() => setActiveChapter(prev => prev + 1)}
                          className="p-5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-lg disabled:opacity-30 active:scale-90"
                        >
                           <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                        </button>
                     </div>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="bg-emerald-900/5 p-12 rounded-[4rem] border-2 border-emerald-100 flex flex-col justify-center gap-6">
                  <h4 className="text-3xl font-black text-emerald-900 italic uppercase tracking-tighter">Learning Objectives</h4>
                  <p className="text-sm font-medium text-emerald-700 italic leading-relaxed text-justify">
                     L'operatore del Team di Lavoro deve padroneggiare ogni sezione di questo manuale per garantire la conformità agli standard ISO di gestione del dato. Il tempo di training stimato per la piena operatività è di 120 minuti di consultazione assistita.
                  </p>
               </div>
               <div className="bg-slate-900 p-12 rounded-[4rem] text-white flex flex-col justify-center gap-6">
                  <h4 className="text-3xl font-black italic uppercase tracking-tighter text-indigo-400">Certificazione V.5</h4>
                  <p className="text-sm font-medium text-slate-400 italic leading-relaxed text-justify">
                     L'utilizzo dei protocolli descritti garantisce l'allineamento con le best-practice internazionali. Ogni riga di codice e di documentazione è stata validata per assicurare precisione millimetrica sul campo amministrativo.
                  </p>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER MASTER NASA FIRMA */}
      <div className="pt-32 border-t border-slate-200 flex flex-col items-center gap-8">
         <div className="flex gap-12 items-center opacity-30">
            <span className="text-[10px] font-black uppercase tracking-[0.5em]">Accuracy</span>
            <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.5em]">Security</span>
            <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.5em]">Integrità</span>
         </div>
         <div className="w-32 h-32 bg-slate-950 rounded-[3rem] flex items-center justify-center text-white text-6xl font-black italic shadow-2xl relative border-4 border-slate-800">
            V
            <div className="absolute -bottom-3 -right-3 w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-xs shadow-xl border-4 border-slate-950">21</div>
         </div>
         <div className="text-center space-y-4">
            <p className="text-lg font-black text-slate-400 uppercase tracking-[0.4em] italic">Vault Master Protocol - Security Core v.23.0</p>
            <div className="space-y-1">
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">@2025 Ing. Domenico Gimondo — Lead Architect</p>
               <p className="text-[9px] text-indigo-500 font-black uppercase tracking-[0.3em]">Precision Engineering for Professional Workgroups</p>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Manual;
