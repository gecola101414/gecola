
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
  const isComando = userRole === UserRole.COMANDANTE || userRole === UserRole.REPPE || userRole === UserRole.ADMIN;

  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1));
  }, [currentMonth]);

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500 font-['Inter']">
      <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] text-white flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-center md:text-left">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter">Azimuth Check</h2>
          <p className="text-indigo-400 text-[9px] font-black uppercase tracking-[0.3em] mt-1">Coordinamento Strategico</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="p-2 bg-slate-800 rounded-xl">◀</button>
          <span className="text-xs font-black uppercase tracking-widest min-w-[120px] text-center italic">{currentMonth.toLocaleString('it-IT', { month: 'long', year: 'numeric' })}</span>
          <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="p-2 bg-slate-800 rounded-xl">▶</button>
        </div>
      </div>

      <div className="flex-1 bg-white p-4 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm overflow-y-auto no-scrollbar">
        {/* LISTA PER MOBILE / GRIGLIA PER DESKTOP */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {daysInMonth.map((day, idx) => {
            const dateStr = day.toISOString().split('T')[0];
            const dayBriefings = briefings.filter(b => b.date === dateStr);
            if (dayBriefings.length === 0 && window.innerWidth < 768) return null;

            return (
              <div key={idx} className={`rounded-2xl border-2 p-4 transition-all flex flex-col gap-2 ${dayBriefings.length > 0 ? 'border-indigo-400 bg-indigo-50/30' : 'border-slate-50 bg-white opacity-50 hidden md:flex'}`}>
                <span className="text-xs font-black text-slate-400">{day.getDate()} {window.innerWidth < 768 && day.toLocaleString('it-IT', { weekday: 'short' }).toUpperCase()}</span>
                {dayBriefings.map(b => (
                  <div key={b.id} className="bg-slate-900 p-2 rounded-xl text-white">
                    <p className="text-[8px] font-black text-indigo-400 mb-0.5">{b.time}</p>
                    <p className="text-[10px] font-black uppercase truncate">{b.title}</p>
                  </div>
                ))}
              </div>
            );
          })}
          {briefings.filter(b => b.date.startsWith(currentMonth.toISOString().slice(0, 7))).length === 0 && (
            <div className="col-span-full py-20 text-center opacity-30 italic font-black uppercase text-xs tracking-widest">Nessun Briefing Programmato</div>
          )}
        </div>
      </div>
    </div>
  );
};
export default AzimuthCheck;
