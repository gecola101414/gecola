
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
}

const IdvList: React.FC<IdvListProps> = ({ idvs, orders, commandName, onChapterClick, onAdd, onToggleLock, onDelete, userRole }) => {
  const currentResiduals = calculateAllResiduals(idvs, orders);
  const sortedIdvs = [...idvs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  
  // Estensione permessi: Admin, Comandante e REPPE possono gestire gli asset
  const canManageFunds = userRole === UserRole.ADMIN || userRole === UserRole.COMANDANTE || userRole === UserRole.REPPE;

  const totalAllocated = idvs.reduce((a, b) => a + b.amount, 0);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(commandName.toUpperCase(), 105, 15, { align: "center" });
    doc.text("REGISTRO ASSET FONDIARI (IDV)", 105, 22, { align: "center" });

    const tableRows = sortedIdvs.map((i, idx) => [
      idx + 1,
      i.idvCode,
      i.capitolo,
      i.assignedWorkgroup,
      `€ ${i.amount.toLocaleString()}`,
      `€ ${(currentResiduals[i.id] || 0).toLocaleString()}`,
      i.locked ? 'SI' : 'NO'
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['#', 'Codice IDV', 'Capitolo', 'Ufficio', 'Assegnato', 'Residuo', 'Locked']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [6, 78, 59] },
      styles: { fontSize: 8 }
    });

    setPdfPreviewUrl(doc.output('bloburl'));
  };

  return (
    <div className="h-full flex flex-col relative animate-in fade-in duration-500 overflow-hidden font-['Inter']">
      
      {/* HEADER MINIMALE TATTICO */}
      <div className="sticky top-0 z-[45] bg-slate-50 pb-4 flex items-center justify-between border-b border-slate-200 px-2 flex-shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
               <div className="flex h-3 w-6 rounded-sm overflow-hidden shadow-sm border border-slate-200">
                  <div className="flex-1 bg-emerald-600"></div>
                  <div className="flex-1 bg-white"></div>
                  <div className="flex-1 bg-rose-600"></div>
               </div>
               <h2 className="text-xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">Registro Asset Fondiari</h2>
            </div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1 ml-8 italic">{commandName} - Gestione Finanziaria</p>
          </div>

          {canManageFunds && (
            <button onClick={onAdd} className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center font-black text-lg shadow-lg border-2 border-white group-hover:scale-110 transition-all">+</div>
              <div className="text-left">
                <span className="block text-[7px] font-black text-slate-400 uppercase tracking-widest italic leading-none">Assegna</span>
                <span className="text-[10px] font-black text-emerald-700 uppercase italic leading-none">Nuovo Fondo</span>
              </div>
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
           <button onClick={handleExportPDF} className="px-5 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-[9px] font-black uppercase hover:border-indigo-600 hover:text-indigo-600 transition-all shadow-sm">ANTEPRIMA PDF</button>
           <div className="bg-white px-5 py-2.5 rounded-xl shadow-sm border border-slate-200 flex flex-col items-end">
             <span className="text-[7px] font-black text-slate-400 uppercase italic tracking-widest mb-1">Massa Totale Autorizzata</span>
             <span className="text-base font-black text-slate-900 italic tracking-tighter">€{totalAllocated.toLocaleString()}</span>
           </div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden m-2 min-h-0 mt-4">
        <div className="bg-slate-50 px-8 py-3 flex justify-between items-center border-b border-slate-100 flex-shrink-0 z-10">
          <span className="text-[10px] font-black text-slate-500 uppercase italic tracking-widest">Database Risorse Economiche (IDV)</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3 bg-white min-h-0">
          {sortedIdvs.map((idv, index) => {
            const residual = currentResiduals[idv.id] ?? 0;
            const color = getChapterColor(idv.capitolo);
            const isCritical = residual < (idv.amount * 0.1);
            const isUsed = (idv.amount - residual) > 0;

            return (
              <div key={idv.id} className={`group bg-white rounded-2xl p-5 border-2 transition-all flex items-center gap-8 relative hover:shadow-lg cursor-default ${idv.locked ? 'bg-slate-50 border-slate-100' : 'border-slate-50 hover:border-indigo-100'}`}>
                
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex flex-col items-center justify-center font-black text-xs italic border-2 border-white shadow-md flex-shrink-0">
                   <span className="text-sm">{(index + 1).toString().padStart(2, '0')}</span>
                </div>

                <div className="w-48 flex flex-col">
                  <div className="flex items-center gap-2">
                     <button onClick={() => onChapterClick(idv.capitolo)} className={`px-2 py-0.5 rounded bg-${color}-500 text-white text-[9px] font-black uppercase shadow-sm`}>Cap. {idv.capitolo}</button>
                     <span className="text-xs font-black text-slate-800 uppercase italic tracking-tighter">{idv.idvCode}</span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-600 italic leading-tight truncate uppercase pr-4">"{idv.motivation}"</p>
                  <p className="text-[7px] font-black text-slate-400 mt-1 uppercase tracking-widest">Assegnato a: {idv.assignedWorkgroup}</p>
                </div>

                <div className="text-right flex flex-col min-w-[150px] pr-4 border-r border-slate-100">
                   <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic mb-1 leading-none">Residuo Operativo</span>
                   <p className={`text-lg font-black tracking-tighter italic ${isCritical ? 'text-rose-600' : 'text-emerald-700'}`}>€{residual.toLocaleString()}</p>
                </div>

                <div className="flex items-center gap-2">
                   {canManageFunds && (
                     <>
                        <button 
                          onClick={() => onToggleLock(idv.id)} 
                          className={`p-2.5 rounded-xl transition-all ${idv.locked ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-50 text-slate-300 hover:bg-indigo-500 hover:text-white'}`}
                          title={idv.locked ? "Sblocca Asset" : "Blocca Asset"}
                        >
                          {idv.locked ? '🔒' : '🔓'}
                        </button>
                        {!isUsed && !idv.locked && (
                          <button 
                            onClick={() => { if(confirm("Cancellare definitivamente questo fondo? L'azione è irreversibile.")) onDelete(idv.id) }} 
                            className="p-2.5 bg-rose-50 text-rose-300 hover:bg-rose-500 hover:text-white rounded-xl transition-all shadow-sm group-hover:opacity-100 opacity-100"
                            title="Elimina Fondo"
                          >
                            🗑️
                          </button>
                        )}
                        {isUsed && <span className="text-[10px] opacity-20 grayscale" title="Impossibile cancellare: fondo già utilizzato">🚫</span>}
                     </>
                   )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[200] bg-slate-950/95 flex items-center justify-center p-6 backdrop-blur-sm">
           <div className="bg-white w-full max-w-6xl h-full rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border border-slate-800">
             <div className="p-5 flex justify-between items-center bg-slate-900 border-b border-slate-800 flex-shrink-0">
               <span className="text-[10px] font-black uppercase italic text-indigo-400 tracking-[0.4em]">Official Asset Registry - PPB 4.0</span>
               <button onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }} className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-700 transition-all">✕ Chiudi Registro</button>
             </div>
             <iframe src={pdfPreviewUrl} className="flex-1 border-0" />
           </div>
        </div>
      )}
    </div>
  );
};

export default IdvList;
