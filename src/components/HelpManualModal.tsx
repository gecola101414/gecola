import React, { useState } from 'react';
import { 
  X, Book, ChevronRight, ChevronLeft, Calculator, Sparkles, Award, 
  Layers, Search, Save, Users, User, Zap, ShieldCheck, Share2, 
  Maximize2, Paintbrush, CircleDot, Database, Terminal, Cpu, 
  Bike, MousePointer2, Settings, FileText, Info, HardHat, Link, History, ArrowLeft, CopyPlus, ShieldAlert,
  Calendar, Gavel
} from 'lucide-react';

interface HelpManualModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpManualModal: React.FC<HelpManualModalProps> = ({ isOpen, onClose }) => {
  const [activeChapter, setActiveChapter] = useState(0);

  const chapters = [
    {
      title: "1. La Visione dell'Autore",
      icon: <Bike className="w-5 h-5" />,
      content: "Per l'Ing. Domenico Gimondo, un software tecnico deve essere come una bicicletta: l'importante non è il meccanismo delle marce, ma la libertà di movimento che ti regala. \n\nGeCoLa è progettato per eliminare la 'fatica informatica'. Una volta trovato l'equilibrio tra la tua competenza professionale e la semplicità del foglio digitale, non lo dimenticherai più. \n\nDefiniamo questo approccio **'Muscle Memory Software'**: strumenti così intuitivi e organici che, una volta appresi (in pochissimi minuti), diventano un'estensione naturale delle tue mani. Come andare in bicicletta, appunto: impari una volta e pedali per sempre senza mai guardare i pedali."
    },
    {
      title: "2. L'Autore: Ing. Domenico GIMONDO",
      icon: <User className="w-5 h-5" />,
      content: "Professionista esperto nel settore delle Opere Pubbliche, Domenico Gimondo ha dedicato la sua carriera alla ricerca della sintesi tecnica. \n\nIl suo viaggio è iniziato negli anni '90 con la creazione di applicativi complessi in Excel e Visual Basic for Applications (VBA), nati per risolvere i problemi quotidiani della contabilità di cantiere. Attraverso l'evoluzione dei fogli condivisi, è approdato alla visione Cloud con il progetto 'Spin', di cui GeCoLa è l'espressione più avanzata."
    },
    {
      title: "3. Navigazione & Workspace",
      icon: <Maximize2 className="w-5 h-5" />,
      content: "L'area di lavoro è divisa in tre zone: Sidebar (Indice WBS), Top Bar (Dati Progetto) e il Foglio (Misure). \n\nIl foglio è 'infinito': man mano che aggiungi voci, esso si srotola verso il basso. I comandi sono integrati direttamente nelle celle per evitare spostamenti inutili del mouse all'estremità destra."
    },
    {
      title: "4. Focus Mode & Toolbar Dinamica",
      icon: <MousePointer2 className="w-5 h-5" />,
      content: "Attiva il 'Tutto Schermo' per eliminare ogni distrazione. In questa modalità, una toolbar fluttuante minimalista comparirà al centro. \n\nGestione Toolbar:\n- TRASCINAMENTO: Tieni premuto sulla maniglia e spostala.\n- CONTENUTO: Mostra il nome della WBS attiva e il suo importo parziale."
    },
    {
      title: "5. Gestione WBS (Capitoli)",
      icon: <Layers className="w-5 h-5" />,
      content: "La WBS è il cuore del computo. Puoi aggiungere nuovi capitoli col tasto (+), rinominarli o bloccarli. \n\nBloccare un capitolo impedisce modifiche accidentali. Puoi trascinare le WBS per cambiare l'ordine cronologico; il sistema rinumererà tutto automaticamente."
    },
    {
      title: "6. Comandi Integrati (Novità v11.9)",
      icon: <Settings className="w-5 h-5" />,
      content: "Per massimizzare la visibilità, la colonna comandi è stata eliminata. \n\nDISPOSIZIONE TASTI:\n- ARTICOLI: I tasti Blocco/Modifica/Elimina sono nella colonna 'Par.Ug'.\n- MISURE: I tasti Link/Segno/Elimina sono nella colonna 'Tariffa'.\n- AGGIUNTA RIGHI: I tasti sono all'interno della colonna 'Designazione' nel rigo finale. La sequenza è: Nuovo Rigo (+) e Sommano Parziale (Σ)."
    },
    {
      title: "7. Smart Painting (Pitturazioni)",
      icon: <Paintbrush className="w-5 h-5" />,
      content: "Accedi al calcolatore cliccando l'icona 'Pitture'. Definisci se il vano è rettangolare o a 'L'. \n\nIl sistema genera automaticamente righi per soffitto e pareti, 'esplodendoli' nel foglio principale."
    },
    {
      title: "8. Configuratore Ferri d'Armatura",
      icon: <CircleDot className="w-5 h-5" />,
      content: "Calcola i KG di acciaio B450C selezionando il diametro (Ø). Il sistema applica il peso specifico corretto e formatta automaticamente la designazione del rigo."
    },
    {
      title: "9. Navigazione Circolare 'Vedi Voce'",
      icon: <Link className="w-5 h-5" />,
      content: "La funzione 'Vedi Voce' implementa una navigazione circolare assistita:\n\n- ISPEZIONE: Il link ti proietta alla voce sorgente.\n- RITORNO SMART: Un tasto fluttuante trasparente ti riporta istantaneamente al punto dove stavi scrivendo."
    },
    {
      title: "10. Assistente AI & Voice Control",
      icon: <Sparkles className="w-5 h-5" />,
      content: "GeCoLa usa l'IA per aiutarti:\n- Ricerca Prezzi: Chiedi all'IA di trovare voci su gecola.it.\n- Dettatura Vocale: Tieni premuta l'icona Microfono per estrarre descrizione e numeri dalla voce."
    },
    {
      title: "11. Analisi dei Nuovi Prezzi",
      icon: <Database className="w-5 h-5" />,
      content: "Modulo per giustificare prezzi non a listino. Scomponi in Materiali, Manodopera e Noli. Calcola automaticamente Costo Tecnico, Spese Generali (15%) e Utile (10%)."
    },
    {
      title: "12. Qualifiche SOA & Normativa",
      icon: <Award className="w-5 h-5" />,
      content: "Assegna categorie SOA (OG1, OS3, etc.). Il Riepilogo Generale determina Categoria Prevalente e Scorporabili, fondamentale per le gare pubbliche."
    },
    {
      title: "13. Stima Manodopera & Sicurezza",
      icon: <HardHat className="w-5 h-5" />,
      content: "Monitoraggio incidenza manodopera e calcolo oneri sicurezza fissi. Genera stampe obbligatorie per l'analisi delle offerte anomale."
    },
    {
      title: "14. Export, Excel & Stampe PDF",
      icon: <FileText className="w-5 h-5" />,
      content: "Portabilità totale: PDF professionali, Excel con formule attive e JSON per backup universali."
    },
    {
      title: "15. Supporto & Assistenza",
      icon: <Settings className="w-5 h-5" />,
      content: "GeCoLa è un sistema vivo. Suggerimenti contestuali e assistenza tecnica diretta garantiscono la continuità del tuo lavoro professionale."
    },
    {
      title: "16. Smart Repeat (Misure Seriali)",
      icon: <CopyPlus className="w-5 h-5" />,
      content: "Attivando il quarto pulsante della barra strumenti (icona clona), abiliti la modalità 'Smart Repeat'. \n\nQuesta funzione è fondamentale per lavori ripetitivi: ogni volta che crei un nuovo rigo (tramite pulsante (+), tasto INVIO o Comando Vocale), il sistema pre-compila automaticamente i campi con i dati del rigo precedente. È ideale per computare vani identici o armature seriali in frazioni di secondo."
    },
    {
      title: "17. Controllo Dimensionale Attivo (Sentinella)",
      icon: <ShieldAlert className="w-5 h-5" />,
      content: "Il cuore dell'intelligenza contabile di GeCoLa (Surveyor Guard 4.2).\n\nLOGICA DEI RANGHI:\nIl sistema analizza i suffissi delle unità di misura ($m^3=3$, $m^2=2$, $m=1$). Quando colleghi una voce (Vedi Voce), la 'Sentinella' (attivabile dal pulsante scudo nella toolbar WBS) calcola la differenza tra il rango della sorgente e quello della destinazione.\n\nSCICCHERIA OPERATIVA:\nSe passi da $m^2$ a $m^3$, il sistema 'pretende' una sola dimensione locale. I campi già forniti dalla sorgente vengono bloccati (grigio), mentre il campo mancante si illumina in AZZURRO GLOW per guidare la tua mano. Inserire dimensioni in eccesso attiverà un segnale ROSSO NEON sulla cella incoerente, permettendo un intervento istantaneo senza margini di errore."
    },
    {
      title: "18. Cronoprogramma Professionale A3",
      icon: <Calendar className="w-5 h-5" />,
      content: "Il modulo Cronoprogramma trasforma il valore della manodopera in pianificazione temporale scientifica.\n\nREGOLE DEL SISTEMA:\n1. **PARAMETRO SQ (SQUADRA):** Definisci il numero di operai assegnati alla WBS. Il sistema calcola la durata basandosi su una produzione base di € 240,00/die per operaio.\n2. **BUFFER TECNICO (+10%):** Per rigore professionale, ogni durata calcolata viene incrementata del 10% per assorbire imprevisti meteo e interferenze.\n3. **CALENDARIO:** La pianificazione segue la settimana corta (5gg) e un unico turno di lavoro.\n4. **VALENZA GIURIDICA:** La durata è espressa in 'Giorni Naturali e Consecutivi' ai sensi dell'Art. 121 DPR 207/2010. \n\nEXPORT: Genera un documento A3 orizzontale con diagramma di Gantt e Relazione Tecnica integrata in calce."
    }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-2 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden border border-slate-700 animate-in zoom-in-95">
        
        {/* Header */}
        <div className="bg-[#2c3e50] p-6 flex justify-between items-center border-b border-slate-600 text-white flex-shrink-0">
          <div className="flex items-center gap-5">
            <div className="bg-orange-500 p-2.5 rounded-2xl shadow-xl shadow-orange-500/20">
              <Book className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter leading-none mb-1">Guida Operativa GeCoLa</h2>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.25em]">Engineering Solution by Ing. Domenico GIMONDO</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-white/10 hover:bg-red-600 p-2 rounded-2xl transition-all hover:scale-110 active:scale-95">
            <X className="w-7 h-7" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-72 bg-slate-50 border-r border-slate-200 overflow-y-auto p-3 space-y-1 custom-scrollbar flex-shrink-0">
            {chapters.map((ch, idx) => (
              <button
                key={idx}
                onClick={() => setActiveChapter(idx)}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 group ${activeChapter === idx ? 'bg-blue-600 text-white shadow-lg translate-x-1' : 'hover:bg-white text-slate-600'}`}
              >
                <div className={`flex-shrink-0 p-2 rounded-lg transition-colors ${activeChapter === idx ? 'bg-white/20' : 'bg-slate-200/50 group-hover:bg-blue-50'}`}>
                  {React.cloneElement(ch.icon as React.ReactElement<any>, { className: `w-4 h-4 ${activeChapter === idx ? 'text-white' : 'text-slate-500'}` })}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-tight truncate ${activeChapter === idx ? 'text-white' : 'text-slate-500'}`}>{ch.title.split('. ')[1]}</span>
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 p-10 overflow-y-auto bg-white custom-scrollbar">
            <div className="max-w-3xl mx-auto">
              {activeChapter === 1 ? (
                <div className="animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center gap-8 mb-12">
                        <div className="relative">
                            <div className="w-40 h-40 bg-slate-100 rounded-[3rem] flex items-center justify-center border-4 border-white shadow-2xl overflow-hidden ring-1 ring-slate-200">
                                <User className="w-20 h-20 text-slate-300" />
                            </div>
                            <div className="absolute -bottom-2 -right-2 bg-blue-600 p-3 rounded-full border-4 border-white shadow-lg">
                                <Cpu className="w-6 h-6 text-white" />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-4xl font-black text-slate-800 tracking-tighter leading-none mb-3">Ing. Domenico GIMONDO</h3>
                            <div className="h-2 w-48 bg-blue-600 rounded-full mb-6"></div>
                            <div className="flex flex-wrap gap-2">
                                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-slate-200">Public Works Expert</span>
                                <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-blue-100">Cloud Architecture</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-6 text-lg text-slate-600 leading-relaxed">
                        <p className="border-l-4 border-blue-500 pl-6 italic font-medium text-slate-800 bg-slate-50 py-4 rounded-r-2xl shadow-sm">
                            "Ho dedicato anni a trasformare la riga di comando in un'esperienza visiva. La tecnologia non deve spaventare, deve potenziare l'intuizione del tecnico. GeCoLa è il risultato di questo equilibrio."
                        </p>
                        <p className="text-base">
                            Con una carriera radicata nella direzione lavori e nel coordinamento della sicurezza, l'Ingegner <strong>Gimondo</strong> ha sempre cercato di automatizzare le procedure più onerose. I suoi primi applicativi in <strong>Excel e VBA</strong> sono diventati standard di riferimento per molti colleghi, evolvendosi poi nel progetto <strong>Spin</strong>.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
                            <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden group">
                                <Terminal className="w-10 h-10 text-green-400 mb-4 opacity-50 group-hover:scale-110 transition-transform" />
                                <h4 className="text-xs font-black uppercase text-slate-400 mb-2 tracking-widest">Le Origini (Excel/VBA)</h4>
                                <p className="text-sm opacity-80 leading-relaxed">La nascita di macro intelligenti per la gestione parametrica delle misure e degli ordini di servizio.</p>
                            </div>
                            <div className="bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden group">
                                <Database className="w-10 h-10 text-blue-200 mb-4 opacity-50 group-hover:scale-110 transition-transform" />
                                <h4 className="text-xs font-black uppercase text-blue-100 mb-2 tracking-widest">L'Era Spin (Cloud)</h4>
                                <p className="text-sm opacity-90 leading-relaxed">Il passaggio definitivo al web: collaborazione sincrona e intelligenza artificiale al servizio dell'ingegneria.</p>
                            </div>
                        </div>
                    </div>
                </div>
              ) : (
                <div className="animate-in fade-in duration-500">
                    <div className="flex items-center gap-6 mb-10">
                        <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 shadow-inner">
                        {React.cloneElement(chapters[activeChapter].icon as React.ReactElement<any>, { className: 'w-12 h-12 text-blue-600' })}
                        </div>
                        <div>
                            <h3 className="text-4xl font-black text-slate-800 tracking-tighter leading-none mb-2">
                            {chapters[activeChapter].title}
                            </h3>
                            <div className="h-2 w-24 bg-blue-600 rounded-full"></div>
                        </div>
                    </div>
                    
                    <div className="text-xl text-slate-600 leading-relaxed font-medium mb-12 whitespace-pre-wrap">
                        {chapters[activeChapter].content}
                    </div>

                    <div className="grid grid-cols-2 gap-6 mt-12 border-t border-slate-100 pt-10">
                        <div className="bg-orange-50 border border-orange-100 p-6 rounded-3xl flex flex-col gap-3 group hover:bg-orange-100 transition-colors">
                            <div className="flex items-center gap-3">
                                <Zap className="w-6 h-6 text-orange-500 group-hover:animate-pulse" />
                                <h4 className="font-black text-orange-900 uppercase text-[10px] tracking-[0.2em]">Obiettivo: Velocità</h4>
                            </div>
                            <p className="text-xs text-orange-700 font-bold leading-snug">Riduci del 70% i tempi di calcolo e revisione del computo.</p>
                        </div>
                        <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl flex flex-col gap-3 group hover:bg-indigo-100 transition-colors">
                            <div className="flex items-center gap-3">
                                <ShieldCheck className="w-6 h-6 text-indigo-500 group-hover:animate-bounce" />
                                <h4 className="font-black text-indigo-900 uppercase text-[10px] tracking-[0.2em]">Obiettivo: Rigore</h4>
                            </div>
                            <p className="text-xs text-indigo-700 font-bold leading-snug">Conformità totale ai prezzari regionali e alle norme sui lavori pubblici.</p>
                        </div>
                    </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center px-12 flex-shrink-0">
          <button 
            disabled={activeChapter === 0}
            onClick={() => setActiveChapter(prev => prev - 1)}
            className="flex items-center gap-3 text-[10px] font-black uppercase text-slate-400 hover:text-blue-600 disabled:opacity-20 transition-all hover:-translate-x-1"
          >
            <ChevronLeft className="w-5 h-5" /> Precedente
          </button>
          
          <div className="flex items-center gap-6">
             <div className="h-1.5 w-64 bg-slate-200 rounded-full overflow-hidden flex">
                <div 
                    className="h-full bg-blue-600 transition-all duration-700 ease-out shadow-[0_0_10px_rgba(34,197,94,0.5)]" 
                    style={{ width: `${((activeChapter + 1) / chapters.length) * 100}%` }}
                ></div>
             </div>
             <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest min-w-[120px] text-center bg-white px-4 py-1.5 rounded-full border border-slate-200 shadow-sm">
                Sezione {activeChapter + 1} / {chapters.length}
             </div>
          </div>

          <button 
            disabled={activeChapter === chapters.length - 1}
            onClick={() => setActiveChapter(prev => (prev + 1) % chapters.length)}
            className="flex items-center gap-3 text-[10px] font-black uppercase text-slate-400 hover:text-blue-600 disabled:opacity-20 transition-all hover:translate-x-1"
          >
            Successivo <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpManualModal;