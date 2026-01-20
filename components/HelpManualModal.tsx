
import React, { useState } from 'react';
import { 
  X, Book, ChevronRight, ChevronLeft, Calculator, Sparkles, Award, 
  Layers, Search, Save, Users, User, Zap, ShieldCheck, Share2, 
  Maximize2, Paintbrush, CircleDot, Database, Terminal, Cpu, 
  Bike, MousePointer2, Settings, FileText, Info, HardHat, Link, History, ArrowLeft
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
      content: "Per l'Ing. Domenico Gimondo, un software tecnico deve essere come una bicicletta: l'importante non è il meccanismo delle marce, ma la libertà di movimento che ti regala. \n\nGeCoLa è progettato per eliminare la 'fatica informatica'. Una volta trovato l'equilibrio tra la tua competenza professionale e la semplicità del foglio digitale, non ti dimenticherai più come si fa. Il programma mette al centro la capacità dell'uomo, restando un passo indietro rispetto al lavoro che sta nascendo."
    },
    {
      title: "2. L'Autore: Ing. Domenico GIMONDO",
      icon: <User className="w-5 h-5" />,
      content: "Professionista esperto nel settore delle Opere Pubbliche, Domenico Gimondo ha dedicato la sua carriera alla ricerca della sintesi tecnica. \n\nIl suo viaggio è iniziato negli anni '90 con la creazione di applicativi complessi in Excel e Visual Basic for Applications (VBA), nati per risolvere i problemi quotidiani della contabilità di cantiere. Attraverso l'evoluzione dei fogli condivisi, è approdato alla visione Cloud con il progetto 'Spin', di cui GeCoLa è l'espressione più avanzata: un ambiente dove il calcolo ingegneristico è potente ma accessibile ovunque."
    },
    {
      title: "3. Navigazione & Workspace",
      icon: <Maximize2 className="w-5 h-5" />,
      content: "L'area di lavoro è divisa in tre zone: Sidebar (Indice WBS), Top Bar (Dati Progetto) e il Foglio (Misure). \n\nPuoi spostare la visuale velocemente cliccando sui nomi dei capitoli a sinistra. Il foglio è 'infinito': man mano che aggiungi voci, esso si srotola verso il basso come un antico rotolo di pergamena tecnica, mantenendo sempre la testata delle colonne visibile per non perdere mai il riferimento della misura."
    },
    {
      title: "4. Focus Mode & Toolbar Dinamica",
      icon: <MousePointer2 className="w-5 h-5" />,
      content: "Attiva il 'Tutto Schermo' per eliminare ogni distrazione. In questa modalità, una toolbar fluttuante minimalista comparirà al centro. \n\nGestione Toolbar:\n- TRASCINAMENTO: Tieni premuto sulla maniglia e spostala. Il sistema impedisce alla toolbar di uscire dai bordi dello schermo (Boundary Lock), garantendo che sia sempre accessibile.\n- CONTENUTO: Mostra solo il nome della WBS attiva e il suo importo parziale, per un monitoraggio discreto del budget."
    },
    {
      title: "5. Gestione WBS (Capitoli)",
      icon: <Layers className="w-5 h-5" />,
      content: "La WBS è il cuore del computo. Puoi aggiungere nuovi capitoli col tasto (+), rinominarli o bloccarli. \n\nBloccare un capitolo (icona Lucchetto) impedisce modifiche accidentali: ideale quando una fase di lavoro è stata approvata o completata. Ricorda: puoi trascinare le WBS per cambiare l'ordine cronologico dei lavori; il sistema rinumererà tutto automaticamente."
    },
    {
      title: "6. Caricamento Misure Standard",
      icon: <Calculator className="w-5 h-5" />,
      content: "Ogni rigo misura accetta Descrizione, Parti Uguali, Lunghezza, Larghezza e Altezza/Peso. \n\nSe inserisci solo la Lunghezza, il sistema la considera come quantità lineare. Se compili più campi, GeCoLa calcola il prodotto. Il tasto INVIO ti sposta automaticamente al campo successivo, rendendo l'inserimento veloce come su un foglio Excel tradizionale."
    },
    {
      title: "7. Smart Painting (Pitturazioni)",
      icon: <Paintbrush className="w-5 h-5" />,
      content: "Accedi al calcolatore cliccando l'icona 'Pitture'. Definisci se il vano è rettangolare o a 'L'. \n\nInserendo le dimensioni del perimetro e l'altezza, il sistema genera due righi: uno per il soffitto (area) e uno per le pareti (perimetro x altezza). Una volta confermato, le misure vengono 'esplose' nel foglio principale, pronte per eventuali detrazioni di porte o finestre."
    },
    {
      title: "8. Configuratore Ferri d'Armatura",
      icon: <CircleDot className="w-5 h-5" />,
      content: "Progettato per calcolare i KG di acciaio B450C. Seleziona il diametro (Ø) e il sistema applica il peso specifico corretto. \n\nIndica il numero di pezzi (staffe o barre) e la lunghezza. La designazione del rigo verrà formattata automaticamente includendo il diametro e la struttura di riferimento (es: [TRAVE T1] Staffe Ø8). Ideale per computare armature complesse in pochi secondi."
    },
    {
      title: "9. Navigazione Circolare 'Vedi Voce'",
      icon: <Link className="w-5 h-5" />,
      content: "La funzione 'Vedi Voce' implementa una navigazione circolare assistita per la verifica istantanea dei dati.\n\n- ISPEZIONE: Cliccando su un link 'Vedi voce n. X.Y', il software ti proietta direttamente alla voce sorgente per verificarne le misure.\n- RITORNO SMART: Automaticamente apparirà sullo schermo un tasto fluttuante trasparente 'Torna alla voce di lavoro'. Cliccandolo, GeCoLa ti riporta istantaneamente al punto esatto dove stavi scrivendo, chiudendo il ciclo di verifica senza farti scorrere manualmente il foglio."
    },
    {
      title: "10. Assistente AI & Voice Control",
      icon: <Sparkles className="w-5 h-5" />,
      content: "GeCoLa usa l'intelligenza artificiale per aiutarti nella scrittura. \n\n- Ricerca Prezzi: Chiedi all'IA di trovare il prezzo di un lavoro; lei cercherà su gecola.it e scriverà la voce per te.\n- Dettatura Vocale: Tieni premuta l'icona del Microfono su un rigo e parla. L'IA interpreterà la tua voce estraendo descrizione e misure numeriche (es: 'parete soggiorno lunga cinque metri e venti per altezza due e settanta')."
    },
    {
      title: "11. Analisi dei Nuovi Prezzi",
      icon: <Database className="w-5 h-5" />,
      content: "Quando un prezzo non esiste nei listini, devi giustificarlo. Il modulo Analisi permette di scomporre la voce in Materiali, Manodopera e Noli. \n\nGeCoLa calcola automaticamente il Costo Tecnico, aggiunge le Spese Generali (15%) e l'Utile d'Impresa (10%), restituendo il Prezzo Unitario finito da applicare al computo. Ogni modifica all'analisi aggiorna in tempo reale il valore della voce nel computo."
    },
    {
      title: "12. Qualifiche SOA & Normativa",
      icon: <Award className="w-5 h-5" />,
      content: "Essenziale per le Opere Pubbliche. Assegna a ogni voce la sua categoria SOA (OG1, OS3, etc.). \n\nNel Riepilogo Generale, il sistema analizzerà la distribution degli importi determinando la Categoria Prevalente e le Scorporabili. Questo assicura che il tuo computo sia pronto per le procedure di gara o per la contabilità lavori ufficiale."
    },
    {
      title: "13. Stima Manodopera & Sicurezza",
      icon: <HardHat className="w-5 h-5" />,
      content: "Il sistema monitora l'incidenza della manodopera per ogni voce. \n\nPuoi stampare il documento specifico 'Stima Manodopera', obbligatorio per verificare l'anomalia delle offerte. Gli oneri della sicurezza (fissi) vengono calcolati in percentuale sul totale lavori, garantendo che i costi per la salute dei lavoratori siano sempre chiaramente evidenziati e non soggetti a ribasso."
    },
    {
      title: "14. Export, Excel & Stampe PDF",
      icon: <FileText className="w-5 h-5" />,
      content: "Il lavoro prodotto è tuo e deve essere portabile. \n\n- PDF: Stampe professionali con logo e impaginazione ministeriale.\n- Excel: Esportazione in formato tabellare con formule attive per revisioni contabili esterne.\n- JSON: Formato di scambio universale per salvare il progetto sul tuo PC e riaprirlo in futuro o su un altro computer."
    },
    {
      title: "15. Supporto & Assistenza",
      icon: <Settings className="w-5 h-5" />,
      content: "GeCoLa è un sistema vivo. Se riscontri difficoltà o hai bisogno di personalizzazioni, il team di assistenza è a disposizione. \n\nLe icone di aiuto sparse nell'interfaccia offrono suggerimenti contestuali. Per problemi tecnici gravi, utilizza i canali diretti indicati nella schermata di Login. Ricorda: GeCoLa è uno strumento creato da tecnici per i tecnici."
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
                /* Layout Speciale per Biografia Autore */
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
                /* Layout Standard Capitoli */
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
                    className="h-full bg-blue-600 transition-all duration-700 ease-out shadow-[0_0_10px_rgba(37,99,235,0.5)]" 
                    style={{ width: `${((activeChapter + 1) / chapters.length) * 100}%` }}
                ></div>
             </div>
             <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest min-w-[120px] text-center bg-white px-4 py-1.5 rounded-full border border-slate-200 shadow-sm">
                Sezione {activeChapter + 1} / {chapters.length}
             </div>
          </div>

          <button 
            disabled={activeChapter === chapters.length - 1}
            onClick={() => setActiveChapter(prev => prev + 1)}
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
