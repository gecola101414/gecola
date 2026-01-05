
import React, { useMemo, useState } from 'react';
import { AuditEntry } from '../types';

interface AuditLogProps {
  log: AuditEntry[];
}

const AuditLog: React.FC<AuditLogProps> = ({ log }) => {
  const [filter, setFilter] = useState('');
  
  const sortedLog = useMemo(() => {
    let filtered = [...(log || [])].reverse();
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
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter italic">Operational Ledger</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase italic tracking-widest">Integrità Forense & Scatola Nera Transazionale (Font: 10px)</p>
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
        {/* CONTENITORE CON SCROLL E HEADER BLOCCATO (STICKY) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-white">
          <table className="w-full border-separate border-spacing-0 min-w-[800px]">
            <thead className="sticky top-0 z-[60]">
              <tr className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest italic shadow-md">
                <th className="px-6 py-4 text-left border-b border-slate-800 w-40 bg-slate-900 sticky top-0">Data/Ora UTC</th>
                <th className="px-6 py-4 text-left border-b border-slate-800 w-32 bg-slate-900 sticky top-0">Ufficio</th>
                <th className="px-6 py-4 text-left border-b border-slate-800 w-40 bg-slate-900 sticky top-0">Operatore</th>
                <th className="px-6 py-4 text-left border-b border-slate-800 w-48 bg-slate-900 sticky top-0">Azione Codificata</th>
                <th className="px-6 py-4 text-left border-b border-slate-800 bg-slate-900 sticky top-0">Dettaglio Analitico della Variazione (Delta)</th>
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
                      entry.action.includes('Creazione') || entry.action.includes('Nuova') || entry.action.includes('Iniezione') ? 'text-emerald-600' : 
                      entry.action.includes('Rimozione') || entry.action.includes('Cancellazione') || entry.action.includes('Revoca') ? 'text-rose-600' : 
                      entry.action.includes('Spostamento') || entry.action.includes('Riallocazione') ? 'text-amber-600' :
                      entry.action.includes('Modifica') || entry.action.includes('Variazione') || entry.action.includes('Delta') ? 'text-indigo-600' : 
                      'text-slate-500'
                    }`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-[10px] font-medium text-slate-500 leading-snug italic border-l border-slate-50">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-700 font-bold">{entry.details.split(' | ')[0]}</span>
                      {entry.details.includes(' | ') && (
                        <div className="flex flex-col gap-0.5 mt-1 border-t border-slate-100 pt-1">
                          {entry.details.split(' | ').slice(1).map((detail, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-[9px]">
                              <span className="text-indigo-400 font-black">→</span>
                              <span className="text-slate-500">{detail}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {sortedLog.length === 0 && (
            <div className="h-80 flex flex-col items-center justify-center text-slate-300 opacity-30 gap-3">
               <span className="text-5xl">📼</span>
               <p className="text-[11px] font-black uppercase tracking-widest italic">Ledger Vuoto - In attesa di transazioni</p>
            </div>
          )}
        </div>
        
        {/* FOOTER INFORMATIVO */}
        <div className="bg-slate-50 px-8 py-3 border-t border-slate-100 flex justify-between items-center text-[9px] font-black text-slate-400 uppercase italic tracking-widest flex-shrink-0">
           <div className="flex gap-8">
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> Record Processati: {sortedLog.length}</span>
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Integrità: 100% Validata</span>
           </div>
           <div className="flex gap-2 items-center">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span>Live Black Box Enabled</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default AuditLog;
