
import React, { useState } from 'react';
// Added Coins to lucide-react imports
import { X, Book, ChevronRight, ChevronLeft, Lightbulb, Calculator, Sparkles, FileText, Settings, Award, Layers, Search, Mic, Save, Users, MousePointer2, Zap, ShieldCheck, Share2, Globe, Coins } from 'lucide-react';

interface HelpManualModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpManualModal: React.FC<HelpManualModalProps> = ({ isOpen, onClose }) => {
  const [activeChapter, setActiveChapter] = useState(0);

  const chapters = [
    {
      title: "1. Introduzione GeCoLa Cloud",
      icon: <Calculator className="w-5 h-5 text-blue-500" />,
      content: "Benvenuto in GeCoLa Cloud, la piattaforma ingegneristica di nuova generazione. Questo software non è solo un foglio di calcolo, ma un assistente intelligente che automatizza la creazione di Computi Metrici Estimativi professionali secondo gli standard italiani (WBS, SOA, Analisi NP)."
    },
    {
      title: "2. Struttura WBS Professionale",
      icon: <Layers className="w-5 h-5 text-indigo-500" />,
      content: "La WBS (Work Breakdown Structure) è l'anima del tuo progetto. Dividi il computo in capitoli logici. \n\nUsa l'icona [+ Nuova WBS] per aggiungere sezioni. Puoi trascinare i capitoli per riordinarli: il sistema rinumererà automaticamente tutti gli articoli in tempo reale (1.1, 1.2, 2.1...)."
    },
    {
      title: "3. Il Miracolo del Drag & Drop",
      icon: <Zap className="w-5 h-5 text-yellow-500" />,
      content: "Funzione Esclusiva: Puoi trascinare un intero capitolo (WBS) o un singolo articolo da una finestra di GeCoLa a un'altra, anche tra progetti diversi o browser diversi. Il sistema importerà non solo la voce, ma anche tutte le sue analisi prezzi collegate e le misurazioni. È il modo più veloce per riutilizzare lavori passati."
    },
    {
      title: "4. Assistente Gemini AI",
      icon: <Sparkles className="w-5 h-5 text-orange-500" />,
      content: "L'Intelligenza Artificiale di Google Gemini è integrata per generare voci complesse. Digita 'Rifacimento tetto ventilato' e l'IA cercherà i prezzi medi, scriverà la descrizione tecnica corretta e assegnerà l'unità di misura appropriata."
    },
    {
      title: "5. Smart Gate: Importazione Istantanea",
      icon: <Globe className="w-5 h-5 text-green-500" />,
      content: "Visita www.gecola.it, seleziona una voce dal prezzario online e trascinala direttamente nell'area di lavoro centrale. Lo 'Smart Gate' analizzerà il testo in volo e creerà l'articolo completo di codice, descrizione e prezzo senza che tu debba scrivere una sola parola."
    },
    {
      title: "6. Misurazioni Intelligenti",
      icon: <Settings className="w-5 h-5 text-slate-500" />,
      content: "Per ogni articolo puoi inserire infinite righe di misura. Campi disponibili: \n- Par.Ug (Moltiplicatore)\n- Lunghezza\n- Largherzza\n- Altezza/Peso\n\nSe lasci un campo vuoto, verrà considerato come valore 1. Puoi inserire deduzioni (misure in rosso) per sottrarre quantità (es. fori di finestre)."
    },
    {
      title: "7. Comandi Vocali Professionali",
      icon: <Mic className="w-5 h-5 text-purple-500" />,
      content: "Usa l'icona del microfono su una riga di misura. Di' chiaramente: 'Cucina, cinque per quattro'. L'IA capirà che la descrizione è 'Cucina', la lunghezza è 5 e la larghezza è 4. Il calcolo sarà istantaneo. Ideale per rilievi in cantiere con tablet."
    },
    {
      title: "8. Analisi dei Nuovi Prezzi (NP)",
      icon: <Coins className="w-5 h-5 text-yellow-600" />,
      content: "Se una voce non esiste a listino, usa il modulo 'Analisi'. Potrai sommare i costi elementari di materiali, manodopera e noli. Il sistema applicherà automaticamente le Spese Generali (15%) e l'Utile d'Impresa (10%) per generare un prezzo unitario congruo e giustificato."
    },
    {
      title: "9. Collegamento 'Vedi Voce'",
      icon: <Share2 className="w-5 h-5 text-blue-400" />,
      content: "Collega un articolo a un altro. Esempio: la quantità di 'Pittura' può essere legata alla quantità di 'Intonaco'. Se modifichi le misure dell'intonaco, la pittura si aggiornerà automaticamente. Non perderai mai più la coerenza dei calcoli."
    },
    {
      title: "10. Qualificazione SOA",
      icon: <Award className="w-5 h-5 text-red-500" />,
      content: "Fondamentale per le gare d'appalto. Assegna ogni voce a una categoria SOA (OG1, OG11, OS3, etc.). Il software calcolerà automaticamente nel riepilogo la categoria prevalente e gli importi scorporabili, fornendoti il quadro per la partecipazione alla gara."
    },
    {
      title: "11. Gestione Manodopera",
      icon: <Users className="w-5 h-5 text-cyan-600" />,
      content: "Ogni prezzo ha un'incidenza di manodopera (%) che puoi personalizzare. GeCoLa calcolerà l'importo totale della manodopera del progetto, dato fondamentale per la compilazione del PSC e per la verifica della congruità dei costi del personale."
    },
    {
      title: "12. Sicurezza e Oneri",
      icon: <ShieldCheck className="w-5 h-5 text-green-600" />,
      content: "Definisci nelle impostazioni la percentuale degli oneri della sicurezza (default 3%). Il sistema calcolerà l'importo totale non soggetto a ribasso, separandolo dal totale dei lavori a misura nel riepilogo generale."
    },
    {
      title: "13. Storico Modifiche (Undo/Redo)",
      icon: <ChevronLeft className="w-5 h-5 text-gray-500" />,
      content: "GeCoLa tiene traccia delle tue ultime 50 operazioni. Puoi tornare indietro o ripristinare modifiche cancellate per errore usando le frecce in alto. Lavora con la massima serenità: ogni tuo gesto è protetto."
    },
    {
      title: "14. Esportazione Formato Professionale",
      icon: <FileText className="w-5 h-5 text-orange-600" />,
      content: "Genera PDF impaginati secondo la normativa sui lavori pubblici. Ottieni:\n- Computo Metrico Estimativo\n- Elenco Prezzi Unitari\n- Analisi dei Nuovi Prezzi\n- Stima Incidenza Manodopera\n\nI file sono pronti per essere allegati a progetti ufficiali."
    },
    {
      title: "15. Backup e Collaborazione",
      icon: <Save className="w-5 h-5 text-blue-700" />,
      content: "Esporta il file .JSON del progetto. È un file leggero e completo che contiene tutto il database locale. Invialo a un collega: potrà caricarlo sulla sua istanza di GeCoLa Cloud e continuare il lavoro esattamente da dove l'hai lasciato."
    }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden border border-slate-700 animate-in zoom-in-95">
        
        {/* Header */}
        <div className="bg-[#2c3e50] p-6 flex justify-between items-center border-b border-slate-600 text-white">
          <div className="flex items-center gap-4">
            <div className="bg-orange-500 p-2.5 rounded-2xl shadow-lg shadow-orange-500/20">
              <Book className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter leading-none mb-1">Manuale Integrale GeCoLa</h2>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Protection System & Engineering v11.9</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-white/10 hover:bg-red-600 p-2 rounded-2xl transition-all hover:scale-110 active:scale-95 shadow-xl">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-80 bg-slate-50 border-r border-slate-200 overflow-y-auto p-4 space-y-1 custom-scrollbar">
            {chapters.map((ch, idx) => (
              <button
                key={idx}
                onClick={() => setActiveChapter(idx)}
                className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-4 group ${activeChapter === idx ? 'bg-blue-600 text-white shadow-xl translate-x-2' : 'hover:bg-white hover:shadow-md text-slate-600'}`}
              >
                <div className={`flex-shrink-0 p-2 rounded-xl transition-colors ${activeChapter === idx ? 'bg-white/20' : 'bg-slate-100 group-hover:bg-blue-50'}`}>
                  {React.cloneElement(ch.icon as React.ReactElement, { className: `w-5 h-5 ${activeChapter === idx ? 'text-white' : ''}` })}
                </div>
                <span className={`text-xs font-black uppercase tracking-tight truncate ${activeChapter === idx ? 'text-white' : 'text-slate-500'}`}>{ch.title.split('. ')[1]}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 p-12 overflow-y-auto bg-white custom-scrollbar">
            <div className="max-w-3xl">
              <div className="flex items-center gap-6 mb-10">
                <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 shadow-inner">
                   {React.cloneElement(chapters[activeChapter].icon as React.ReactElement, { className: 'w-10 h-10' })}
                </div>
                <div>
                    <h3 className="text-4xl font-black text-slate-800 tracking-tighter leading-none mb-2">
                    {chapters[activeChapter].title}
                    </h3>
                    <div className="h-1.5 w-24 bg-blue-600 rounded-full"></div>
                </div>
              </div>
              
              <div className="text-xl text-slate-600 leading-relaxed font-medium mb-12 whitespace-pre-wrap">
                {chapters[activeChapter].content}
              </div>

              {/* Box interattivi per rendere il manuale "stupendo" */}
              <div className="grid grid-cols-2 gap-4 mt-8">
                <div className="bg-orange-50 border border-orange-100 p-6 rounded-3xl flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <Zap className="w-6 h-6 text-orange-500" />
                        <h4 className="font-black text-orange-900 uppercase text-xs tracking-widest">Rapidità</h4>
                    </div>
                    <p className="text-sm text-orange-700 font-medium leading-snug">Riduci i tempi di preventivazione del 70% grazie ai sistemi di importazione dinamica.</p>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="w-6 h-6 text-indigo-500" />
                        <h4 className="font-black text-indigo-900 uppercase text-xs tracking-widest">Precisione</h4>
                    </div>
                    <p className="text-sm text-indigo-700 font-medium leading-snug">Ogni riga di calcolo è verificata e rinumerata automaticamente per evitare errori formali.</p>
                </div>
              </div>

              <div className="mt-12 p-8 bg-slate-900 rounded-[2.5rem] text-white relative overflow-hidden group shadow-2xl">
                 <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-125 transition-transform duration-700">
                    <Sparkles className="w-32 h-32" />
                 </div>
                 <h4 className="text-xs font-black uppercase tracking-[0.3em] text-blue-400 mb-4">Ingegnere Domenico Gimondo dice:</h4>
                 <p className="text-lg font-serif italic leading-relaxed opacity-90">
                    "GeCoLa è nato per semplificare la vita tecnica. Non cercate pulsanti complicati, lasciate che l'IA e il Drag&Drop facciano il lavoro sporco per voi. Il computo perfetto è a portata di click."
                 </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center px-12">
          <button 
            disabled={activeChapter === 0}
            onClick={() => setActiveChapter(prev => prev - 1)}
            className="flex items-center gap-3 text-xs font-black uppercase text-slate-400 hover:text-blue-600 disabled:opacity-20 transition-all hover:-translate-x-1"
          >
            <ChevronLeft className="w-5 h-5" /> Precedente
          </button>
          
          <div className="flex items-center gap-4">
             <div className="h-2 w-48 bg-slate-200 rounded-full overflow-hidden flex">
                <div 
                    className="h-full bg-blue-600 transition-all duration-500" 
                    style={{ width: `${((activeChapter + 1) / chapters.length) * 100}%` }}
                ></div>
             </div>
             <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[100px] text-center">
                Sezione {activeChapter + 1} / {chapters.length}
             </div>
          </div>

          <button 
            disabled={activeChapter === chapters.length - 1}
            onClick={() => setActiveChapter(prev => prev + 1)}
            className="flex items-center gap-3 text-xs font-black uppercase text-slate-400 hover:text-blue-600 disabled:opacity-20 transition-all hover:translate-x-1"
          >
            Successivo <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpManualModal;
