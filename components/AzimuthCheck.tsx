
import React, { useState, useMemo } from 'react';
import { Briefing, UserRole } from '../types';

interface AzimuthCheckProps {
  briefings: Briefing[];
  onAddBriefing: (b: Partial<Briefing>) => void;
  userRole: UserRole;
}

const AzimuthCheck: React.FC<AzimuthCheckProps> = ({ briefings, onAddBriefing, userRole }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [newBriefing, setNewBriefing] = useState<Partial<Briefing>>({
    title: '', description: '', date: '', time: '', location: 'SALA BRIEFING COMANDO'
  });

  const isComando = userRole === UserRole.COMANDANTE || userRole === UserRole.REPPE || userRole === UserRole.ADMIN;

  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    // Padding iniziali
    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) days.push(new Date(year, month, i));
    return days;
  }, [currentMonth]);

  const monthName = currentMonth.toLocaleString('it-IT', { month: 'long', year: 'numeric' });

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-700 font-['Inter']">
      <div className="flex justify-between items-center bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl border border-slate-800">
        <div>
          <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Azimuth Check</h2>
          <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Coordinamento Strategico & Analisi Rotta Finanziaria</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-3 bg-slate-800 text-white rounded-xl hover:bg-slate-700">◀</button>
          <span className="text-white font-black uppercase text-sm tracking-widest min-w-[150px] text-center">{monthName}</span>
          <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-3 bg-slate-800 text-white rounded-xl hover:bg-slate-700">▶</button>
          {isComando && (
            <button onClick={() => setShowModal(true)} className="ml-4 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs shadow-lg hover:bg-indigo-700 transition-all">Pianifica Briefing +</button>
          )}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-7 gap-3 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-xl overflow-y-auto custom-scrollbar">
        {['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'].map(d => (
          <div key={d} className="text-center text-[10px] font-black text-slate-400 pb-4 tracking-widest">{d}</div>
        ))}
        {daysInMonth.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="bg-slate-50/30 rounded-2xl h-32 border border-slate-50 opacity-20"></div>;
          
          const dateStr = day.toISOString().split('T')[0];
          const dayBriefings = briefings.filter(b => b.date === dateStr);
          const isToday = new Date().toDateString() === day.toDateString();

          return (
            <div key={idx} className={`bg-white rounded-2xl h-32 border-2 p-3 transition-all flex flex-col gap-1 overflow-hidden relative group hover:border-indigo-400 ${isToday ? 'border-indigo-600 ring-2 ring-indigo-100 shadow-md' : 'border-slate-50 shadow-sm'}`}>
              <span className={`text-xs font-black ${isToday ? 'text-indigo-600' : 'text-slate-300'}`}>{day.getDate()}</span>
              
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-1">
                {dayBriefings.map(b => (
                  <div key={b.id} className="bg-slate-900 p-2 rounded-lg border-l-4 border-indigo-500 shadow-sm animate-in zoom-in duration-200">
                    <p className="text-[7px] font-black text-indigo-400 uppercase tracking-tighter leading-none mb-1">{b.time}</p>
                    <p className="text-[9px] font-bold text-white uppercase italic leading-none truncate">{b.title}</p>
                  </div>
                ))}
              </div>

              {isComando && (
                <button 
                  onClick={() => { setNewBriefing({...newBriefing, date: dateStr}); setShowModal(true); }}
                  className="absolute bottom-1 right-1 w-6 h-6 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-600 hover:text-white"
                >
                  +
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl p-10 border border-slate-200 flex flex-col gap-6">
            <h3 className="text-2xl font-black text-slate-800 italic uppercase tracking-tighter border-b pb-4">Nuovo Azimuth Briefing</h3>
            <div className="space-y-4">
              <input type="text" placeholder="Oggetto Briefing" value={newBriefing.title} onChange={e => setNewBriefing({...newBriefing, title: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" />
              <div className="flex gap-4">
                <input type="date" value={newBriefing.date} onChange={e => setNewBriefing({...newBriefing, date: e.target.value})} className="flex-1 px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" />
                <input type="time" value={newBriefing.time} onChange={e => setNewBriefing({...newBriefing, time: e.target.value})} className="flex-1 px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" />
              </div>
              <input type="text" placeholder="Luogo" value={newBriefing.location} onChange={e => setNewBriefing({...newBriefing, location: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold" />
              <textarea placeholder="Elementi Decisionali e Note..." value={newBriefing.description} onChange={e => setNewBriefing({...newBriefing, description: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-medium italic h-32" />
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-4 text-slate-400 font-bold uppercase text-[10px]">Annulla</button>
              <button onClick={() => { onAddBriefing(newBriefing); setShowModal(false); }} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:bg-indigo-700">Pianifica Rotta</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AzimuthCheck;
