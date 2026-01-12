
import React, { useMemo, useState } from 'react';
import { AuditEntry } from '../types';

interface AuditLogProps {
  log: AuditEntry[];
  title?: string;
  filter: string;
  setFilter: (v: string) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
}

const AuditLog: React.FC<AuditLogProps> = ({ 
  log, 
  title = "Registro Storico Operativo",
  filter,
  setFilter,
  fromDate,
  setFromDate,
  toDate,
  setToDate
}) => {
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  
  const filteredLog = useMemo(() => {
    let filtered = [...(log || [])];
    
    if (filter) {
      const f = filter.toLowerCase();
      filtered = filtered.filter(e => 
        e.username.toLowerCase().includes(f) || 
        e.workgroup.toLowerCase().includes(f) || 
        e.action.toLowerCase().includes(f) || 
        e.details.toLowerCase().includes(f)
      );
    }

    if (fromDate) {
      const start = new Date(fromDate).getTime();
      filtered = filtered.filter(e => new Date(e.timestamp).getTime() >= start);
    }
    if (toDate) {
      const end = new Date(toDate).getTime() + (24 * 60 * 60 * 1000);
      filtered = filtered.filter(e => new Date(e.timestamp).getTime() <= end);
    }

    return filtered;
  }, [log, filter, fromDate, toDate]);

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500 font-['Inter'] overflow-hidden">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 px-2 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">{title}</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase italic tracking-widest">Integrità Forense & Scatola Nera delle Transazioni</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex flex-col gap-1">
            <label className="text-[7px] font-black text-slate-400 uppercase ml-2">Ricerca Testuale</label>
            <input 
              type="text" 
              placeholder="Filtra testo..." 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black uppercase outline-none focus:border-indigo-500 w-48 shadow-inner"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[7px] font-black text-slate-400 uppercase ml-2">Da Data</label>
            <input 
              type="date" 
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black outline-none focus:border-indigo-500 shadow-inner"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[7px] font-black text-slate-400 uppercase ml-2">A Data</label>
            <input 
              type="date" 
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black outline-none focus:border-indigo-500 shadow-inner"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-white">
          <table className="w-full border-separate border-spacing-0 min-w-[1000px]">
            <thead className="sticky top-0 z-[60]">
              <tr className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest italic shadow-md">
                <th className="px-6 py-4 text-left border-b border-slate-800 w-44 bg-slate-900 sticky top-0">Data/Ora UTC</th>
                <th className="px-6 py-4 text-left border-b border-slate-800 w-32 bg-slate-900 sticky top-0">Ufficio</th>
                <th className="px-6 py-4 text-left border-b border-slate-800 w-40 bg-slate-900 sticky top-0">Operatore</th>
                <th className="px-6 py-4 text-left border-b border-slate-800 w-48 bg-slate-900 sticky top-0">Azione</th>
                <th className="px-6 py-4 text-left border-b border-slate-800 bg-slate-900 sticky top-0">Dettaglio Delta Integrale</th>
                <th className="px-6 py-4 text-center border-b border-slate-800 w-24 bg-slate-900 sticky top-0">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredLog.map((entry) => (
                <tr key={entry.id} className="hover:bg-indigo-50/50 transition-colors group">
                  <td className="px-6 py-3 text-[10px] font-mono text-slate-400 whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleString('it-IT')}
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-[9px] font-black px-2 py-0.5 bg-slate-100 text-slate-500 rounded uppercase border border-slate-200">
                      {entry.workgroup}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-[10px] font-black text-slate-700 uppercase italic truncate max-w-[150px]">
                    {entry.username}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`text-[9px] font-black uppercase tracking-tight ${
                      entry.action.includes('SIGILLO') ? 'text-indigo-700 font-black' :
                      entry.action.includes('Creazione') || entry.action.includes('Nuova') ? 'text-emerald-600' : 
                      entry.action.includes('Rimozione') ? 'text-rose-600' : 'text-slate-500'
                    }`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-[10px] font-medium text-slate-500 leading-snug italic border-l border-slate-50">
                    <p className="text-slate-700 font-bold whitespace-pre-wrap">{entry.details}</p>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {entry.videoProof ? (
                      <button 
                        onClick={() => setPlayingVideo(entry.videoProof || null)}
                        className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-all scale-90 group-hover:scale-100"
                      >
                        🎥
                      </button>
                    ) : (
                      <span className="text-[18px] opacity-10">🔒</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-slate-50 px-8 py-3 border-t border-slate-100 flex justify-between items-center text-[9px] font-black text-slate-400 uppercase italic tracking-widest flex-shrink-0">
           <div className="flex gap-8">
              <span>Record Totali: {log.length}</span>
              <span className="text-indigo-600">Filtrati: {filteredLog.length}</span>
           </div>
           <span>Protocollo Forense LEGACY-BIO 10.0 Attivo</span>
        </div>
      </div>

      {playingVideo && (
        <div className="fixed inset-0 z-[750] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8">
          <div className="bg-white rounded-[3rem] p-4 shadow-2xl max-w-2xl w-full border-4 border-indigo-600 animate-in zoom-in duration-300">
            <video src={playingVideo} autoPlay controls className="aspect-video bg-black rounded-2xl overflow-hidden mb-4 w-full h-full object-cover" />
            <button onClick={() => setPlayingVideo(null)} className="w-full py-4 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Chiudi Evidence</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
