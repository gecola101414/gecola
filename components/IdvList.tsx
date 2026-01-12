
import React, { useMemo, useState } from 'react';
import { FundingIDV, WorkOrder, UserRole } from '../types';
import { calculateAllResiduals } from './WorkForm';
import { getChapterColor } from './ChaptersSummary';
// @ts-ignore
import { jsPDF } from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

interface IdvListProps {
  idvs: FundingIDV[];
  orders: WorkOrder[];
  commandName: string;
  onChapterClick: (chapter: string) => void;
  onAdd: () => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
  userRole?: string;
  onShowHistory: (id: string) => void;
}

const IdvList: React.FC<IdvListProps> = ({ idvs, orders, commandName, onChapterClick, onAdd, onToggleLock, onDelete, userRole, onShowHistory }) => {
  const currentResiduals = calculateAllResiduals(idvs, orders);
  const sortedIdvs = useMemo(() => [...idvs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [idvs]);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  
  // L'amministratore è il garante, non crea fondi (IDV) - Funzione delegata a PPB o Comandante
  const canManageFunds = userRole === UserRole.PPB || userRole === UserRole.COMANDANTE || userRole === UserRole.REPPE;
  const totalAllocated = idvs.reduce((a, b) => a + (b.amount || 0), 0);

  const exportSingleIdvPDF = (idv: FundingIDV) => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text("CERTIFICATO ASSEGNAZIONE RISORSE (IDV)", 105, 15, { align: "center" });
    autoTable(doc, {
      startY: 30,
      head: [['Parametro', 'Valore']],
      body: [
        ['Codice IDV', idv.idvCode],
        ['Capitolo di Spesa', idv.capitolo],
        ['Importo Iniziale', `€ ${idv.amount.toLocaleString()}`],
        ['Ufficio Assegnatario', idv.assignedWorkgroup],
        ['Motivazione Strategica', idv.motivation],
        ['Data Registrazione', new Date(idv.createdAt).toLocaleString()],
        ['Registrato da', idv.ownerName]
      ],
      theme: 'grid'
    });
    setPdfPreviewUrl(doc.output('bloburl').toString());
  };

  return (
    <div className="h-full flex flex-col relative animate-in fade-in duration-500 overflow-hidden font-['Inter']">
      <div className="sticky top-0 z-[45] bg-slate-50 pb-4 flex items-center justify-between border-b border-slate-200 px-2 flex-shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex flex-col"><div className="flex items-center gap-2"><div className="flex h-3 w-6 rounded-sm overflow-hidden shadow-sm border border-slate-200"><div className="flex-1 bg-emerald-600"></div><div className="flex-1 bg-white"></div><div className="flex-1 bg-rose-600"></div></div><h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">Registro Asset Fondiari</h2></div></div>
          {canManageFunds && <button onClick={onAdd} className="flex items-center gap-3 group"><div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-black text-lg shadow-lg border-2 border-white group-hover:scale-110 transition-all">+</div><span className="text-[10px] font-black text-emerald-700 uppercase italic">Nuovo Fondo IDV</span></button>}
        </div>
        <div className="bg-white px-5 py-2.5 rounded-xl shadow-sm border border-slate-200 flex flex-col items-end"><span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Massa Monetaria Totale</span><span className="text-base font-black text-slate-900 italic tracking-tighter">€{totalAllocated.toLocaleString()}</span></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3 bg-white min-h-0 mt-4">
        {sortedIdvs.map((idv, index) => {
          const residual = currentResiduals[idv.id] ?? (idv.amount || 0);
          const color = getChapterColor(idv.capitolo);
          return (
            <div key={idv.id} className={`group bg-white rounded-2xl p-5 border-2 transition-all flex items-center gap-8 relative hover:shadow-lg ${idv.locked ? 'bg-slate-50 border-slate-100' : 'border-slate-50 hover:border-indigo-100'}`}>
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex flex-col items-center justify-center font-black text-xs italic border-2 border-white shadow-md flex-shrink-0">{index + 1}</div>
              <div className="w-56 flex flex-col"><div className="flex items-center gap-2"><button onClick={() => onChapterClick(idv.capitolo)} className={`px-2 py-0.5 rounded bg-${color}-500 text-white text-[9px] font-black uppercase shadow-sm`}>Cap. {idv.capitolo}</button><span className="text-xs font-black text-slate-800 uppercase italic tracking-tighter">{idv.idvCode}</span></div></div>
              <div className="flex-1 min-w-0"><p className="text-xs font-medium text-slate-600 italic leading-tight truncate uppercase pr-4">"{idv.motivation}"</p><p className="text-[7px] font-black text-slate-400 mt-1 uppercase">Competenza: {idv.assignedWorkgroup}</p></div>
              <div className="text-right flex flex-col min-w-[150px] pr-4 border-r border-slate-100"><span className="text-[8px] font-black text-slate-400 uppercase italic mb-1">Disponibilità Reale</span><p className={`text-lg font-black tracking-tighter italic ${residual < 100 ? 'text-rose-600' : 'text-emerald-700'}`}>€{residual.toLocaleString()}</p></div>
              <div className="flex items-center gap-2">
                 <button onClick={() => onShowHistory(idv.id)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-all" title="Archivio Storico Fondo">📜</button>
                 <button onClick={() => exportSingleIdvPDF(idv)} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-all" title="Esporta Certificato IDV">📄</button>
                 {canManageFunds && <><button onClick={() => onToggleLock(idv.id)} className={`p-2.5 rounded-xl ${idv.locked ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-300 hover:bg-indigo-500 hover:text-white'}`}>{idv.locked ? '🔒' : '🔓'}</button>{!idv.locked && <button onClick={() => confirm("Eliminare asset monetario?") && onDelete(idv.id)} className="p-2.5 bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl transition-all shadow-sm">🗑️</button>}</>}
              </div>
            </div>
          );
        })}
      </div>

      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[900] bg-slate-950/95 flex items-center justify-center p-6 backdrop-blur-sm">
           <div className="bg-white w-full max-w-5xl h-full rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border border-slate-800">
             <div className="p-5 flex justify-between items-center bg-slate-900 border-b border-slate-800 flex-shrink-0">
               <span className="text-[10px] font-black uppercase italic text-indigo-400 tracking-[0.4em]">Certificato Risorsa Finanziaria IDV</span>
               <button onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }} className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">✕ Chiudi</button>
             </div>
             <iframe src={pdfPreviewUrl} className="flex-1 border-0" />
           </div>
        </div>
      )}
    </div>
  );
};
export default IdvList;
