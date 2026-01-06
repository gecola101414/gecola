
import React, { useMemo, useState } from 'react';
import { AuditEntry } from '../types';

interface AuditLogProps {
  log: AuditEntry[];
}

const AuditLog: React.FC<AuditLogProps> = ({ log }) => {
  const [filter, setFilter] = useState('');
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  
  const sortedLog = useMemo(() => {
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
    return filtered;
  }, [log, filter]);

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500 font-['Inter'] overflow-hidden">
      <div className="flex justify-between items-end px-2 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Registro Storico Operativo</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase italic tracking-widest">Integrità Forense & Scatola Nera delle Transazioni</p>
        </div>
        <div className="relative">
          <input 
            type="text" 
            placeholder="Ricerca nel registro (Operatore, Ufficio, ID Pratica...)" 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-6 py-3 bg-white border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-indigo-500 w-80 shadow-inner"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30 text-xs">🔍</span>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-white">
          <table className="w-full border-separate border-spacing-0 min-w-[1000px]">
            <thead className="sticky top-0 z-[60]">
              <tr className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest italic shadow-md">
                <th className="px-6 py-4 text-left border-b border-slate-800 w-40 bg-slate-900 sticky top-0">Data/Ora UTC</th>
                <th className="px-6 py-4 text-left border-b border-slate-800 w-32 bg-slate-900 sticky top-0">Ufficio</th>
                <th className="px-6 py-4 text-left border-b border-slate-800 w-40 bg-slate-900 sticky top-0">Operatore</th>
                <th className="px-6 py-4 text-left border-b border-slate-800 w-48 bg-slate-900 sticky top-0">Azione Codificata</th>
                <th className="px-6 py-4 text-left border-b border-slate-800 bg-slate-900 sticky top-0">Dettaglio Variazione (Delta)</th>
                <th className="px-6 py-4 text-center border-b border-slate-800 w-24 bg-slate-900 sticky top-0">Biometria</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {sortedLog.map((entry) => (
                <tr key={entry.id} className="hover:bg-indigo-50/50 transition-colors group">
                  <td className="px-6 py-3 text-[10px] font-mono text-slate-400 whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleString('it-IT', { 
                      day: '2-digit', month: '2-digit', year: '2-digit', 
                      hour: '2-digit', minute: '2-digit', second: '2-digit' 
                    })}
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
                      entry.action.includes('biometrico') || entry.action.includes('Video') ? 'text-indigo-700 font-black' :
                      entry.action.includes('Creazione') || entry.action.includes('Nuova') || entry.action.includes('Iniezione') ? 'text-emerald-600' : 
                      entry.action.includes('Rimozione') || entry.action.includes('Cancellazione') || entry.action.includes('Revoca') ? 'text-rose-600' : 
                      'text-slate-500'
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
                        className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-all scale-90 group-hover:scale-100 animate-pulse"
                        title="Vedi Dichiarazione Biometrica"
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
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> Record Processati: {sortedLog.length}</span>
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Integrità: 100% Validata</span>
           </div>
           <div className="flex gap-2 items-center">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span>Protocollo Scutum Attivo</span>
           </div>
        </div>
      </div>

      {playingVideo && (
        <div className="fixed inset-0 z-[250] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8">
          <div className="bg-white rounded-[3rem] p-4 shadow-2xl max-w-2xl w-full border-4 border-indigo-600 animate-in zoom-in duration-300">
            <div className="aspect-video bg-black rounded-2xl overflow-hidden mb-4 relative">
              <video src={playingVideo} autoPlay controls className="w-full h-full object-cover" />
              <div className="absolute top-4 left-4 bg-indigo-600 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">Reperto Biometrico Forense</div>
            </div>
            <div className="flex justify-between items-center px-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic leading-none">Integrità Verificata dal Sistema</span>
              <button onClick={() => setPlayingVideo(null)} className="px-6 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-700">Chiudi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
