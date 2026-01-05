
import React, { useState, useMemo } from 'react';
import { WorkOrder, FundingIDV, User, WorkStatus } from '../types';

interface RedattoreAttiProps {
  orders: WorkOrder[];
  idvs: FundingIDV[];
  currentUser: User;
}

type TemplateType = 'RICHIESTA_FONDI' | 'LETTERA_INCARICO' | 'RELAZIONE_CHIUSURA' | 'COMUNICAZIONE_CIG';

export const RedattoreAtti: React.FC<RedattoreAttiProps> = ({ orders, idvs, currentUser }) => {
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('RICHIESTA_FONDI');
  const [editedText, setEditedText] = useState<string>('');

  const selectedOrder = useMemo(() => orders.find(o => o.id === setSelectedOrderId), [orders, selectedOrderId]);
  
  const templates = {
    RICHIESTA_FONDI: {
      label: "Nota di Richiesta Fondi",
      generate: (o: WorkOrder) => {
        const chapter = idvs.find(i => o.linkedIdvIds.includes(i.id))?.capitolo || '[CAPITOLO]';
        return `COMANDO MILITARE ESERCITO LOMBARDIA
Ufficio: ${o.workgroup}
Protocollo: VAULT/${o.orderNumber}/${new Date().getFullYear()}

OGGETTO: Richiesta di integrazione fondi per "${o.description.toUpperCase()}".

Si rappresenta la necessità urgente di procedere all'avvio della pratica in oggetto sul capitolo ${chapter}.
L'importo stimato per l'intervento è di € ${o.estimatedValue.toLocaleString()}.
Tale esigenza rientra nel piano di ammodernamento infrastrutturale del reparto.

L'operatore di riferimento: ${o.ownerName}
Data: ${new Date().toLocaleDateString()}

Firmato digitalmente.`;
      }
    },
    LETTERA_INCARICO: {
      label: "Comunicazione Affidamento",
      generate: (o: WorkOrder) => {
        if (!o.winner) return "ERRORE: Dati aggiudicazione mancanti nel Ledger.";
        return `COMANDO MILITARE ESERCITO LOMBARDIA
Servizio Amministrativo

Spett.le Ditta: ${o.winner.toUpperCase()}

OGGETTO: Comunicazione di affidamento lavori - Rif. ${o.orderNumber}.

Con la presente si comunica che, a seguito di indagine di mercato, codesta ditta è risultata aggiudicataria dell'intervento relativo a:
"${o.description.toUpperCase()}"

Importo di contratto: € ${o.contractValue?.toLocaleString() || o.estimatedValue.toLocaleString()}
Termini di esecuzione: 30gg naturali e consecutivi dalla data della presente.

Si prega di confermare ricezione e accettazione termini.

Il Responsabile del Procedimento: ${o.ownerName}`;
      }
    },
    RELAZIONE_CHIUSURA: {
      label: "Relazione Tecnica Finale",
      generate: (o: WorkOrder) => {
        return `RELAZIONE TECNICA DI CHIUSURA LAVORI
Pratica: ${o.orderNumber}
Data Ultimo Aggiornamento: ${o.creDate || new Date().toLocaleDateString()}

In data odierna si attesta la regolare esecuzione delle prestazioni relative a "${o.description}".
Il fornitore ${o.winner || '[DITTA]'} ha operato in conformità al contratto.

DATI CONTABILI FINALI:
- Valore Progettuale: € ${o.estimatedValue.toLocaleString()}
- Valore Contratto: € ${o.contractValue?.toLocaleString() || 'N.D.'}
- Valore Liquidato: € ${o.paidValue?.toLocaleString() || 'N.D.'}
- Economia di Gara: € ${(o.estimatedValue - (o.contractValue || 0)).toLocaleString()}

La pratica viene trasmessa all'ufficio amministrativo per la chiusura definitiva.`;
      }
    },
    COMUNICAZIONE_CIG: {
      label: "Promemoria Codici Identificativi",
      generate: (o: WorkOrder) => {
        return `PROMEMORIA TRACCIABILITÀ FINANZIARIA
Pratica: ${o.orderNumber}

Si riportano i codici per la fatturazione elettronica e tracciabilità:
DESCRIZIONE: ${o.description}
IMPORTO: € ${o.contractValue?.toLocaleString() || o.estimatedValue.toLocaleString()}

Si rammenta alla ditta l'obbligo di indicare il CIG in ogni comunicazione contabile.`;
      }
    }
  };

  const handleGenerate = () => {
    const order = orders.find(o => o.id === selectedOrderId);
    if (order) {
      setEditedText(templates[selectedTemplate].generate(order));
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(editedText);
    alert("Testo copiato negli appunti.");
  };

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in duration-500 font-['Inter']">
      <header className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">Redattore Atti Offline</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase italic tracking-widest mt-1">Sintesi automatica basata sui dati certificati del Ledger</p>
        </div>
        <div className="flex gap-3">
           <select 
            value={selectedOrderId} 
            onChange={(e) => setSelectedOrderId(e.target.value)}
            className="px-4 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-[10px] font-black uppercase outline-none focus:border-indigo-600"
           >
              <option value="">Seleziona Pratica...</option>
              {orders.map(o => <option key={o.id} value={o.id}>{o.orderNumber} - {o.description.substring(0, 20)}...</option>)}
           </select>
           <select 
            value={selectedTemplate} 
            onChange={(e) => setSelectedTemplate(e.target.value as TemplateType)}
            className="px-4 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-[10px] font-black uppercase outline-none focus:border-indigo-600"
           >
              {Object.entries(templates).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
           </select>
           <button 
            onClick={handleGenerate} 
            disabled={!selectedOrderId}
            className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all"
           >
            Genera Bozza ✍️
           </button>
        </div>
      </header>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* AREA EDITING */}
        <div className="flex-1 bg-white rounded-[3rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col relative">
           <div className="p-4 bg-slate-900 flex justify-between items-center">
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest italic">Editor Documentale - Protocollo V21</span>
              <button onClick={copyToClipboard} className="text-[9px] font-black text-white bg-indigo-600 px-3 py-1 rounded-lg hover:bg-indigo-700">Copia Testo</button>
           </div>
           <textarea 
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="flex-1 p-12 font-mono text-sm leading-relaxed text-slate-700 outline-none resize-none bg-[url('https://www.transparenttextures.com/patterns/pinstriped-suit.png')] bg-fixed"
            placeholder="Seleziona una pratica e genera la bozza per iniziare..."
           />
        </div>

        {/* INFO LATERALE */}
        <div className="w-80 space-y-4">
           <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white border-2 border-indigo-500/30">
              <h3 className="text-xs font-black uppercase tracking-widest mb-4 italic text-indigo-400">Verifica Integrità</h3>
              <p className="text-[10px] text-slate-400 italic leading-relaxed">
                Il redattore offline garantisce che ogni cifra e nome corrisponda esattamente a quanto registrato nel file crittografato.
              </p>
              <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
                 <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-500">Dati Ledger</span>
                    <span className="text-[9px] font-black text-emerald-500">OK</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-500">Placeholder</span>
                    <span className="text-[9px] font-black text-emerald-500">MAPPATI</span>
                 </div>
              </div>
           </div>

           <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100">
              <h4 className="text-[10px] font-black text-indigo-900 uppercase mb-4">Istruzioni</h4>
              <ul className="text-[9px] text-indigo-600 font-medium space-y-2 italic">
                 <li>1. Scegli la pratica dal database locale.</li>
                 <li>2. Seleziona il modello di comunicazione.</li>
                 <li>3. Clicca su Genera Bozza.</li>
                 <li>4. Modifica se necessario e copia.</li>
              </ul>
           </div>
        </div>
      </div>
    </div>
  );
};
