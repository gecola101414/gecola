
import React, { useMemo } from 'react';
import { FundingIDV, WorkOrder, WorkStatus } from '../types';

interface ChaptersSummaryProps {
  idvs: FundingIDV[];
  orders: WorkOrder[];
  onChapterClick: (chapter: string) => void;
}

export const getChapterColor = (chapter: string) => {
  if (!chapter) return 'slate';
  const colors = ['indigo', 'emerald', 'amber', 'rose', 'cyan', 'violet', 'orange', 'blue', 'teal', 'fuchsia'];
  let hash = 0;
  for (let i = 0; i < chapter.length; i++) { hash = chapter.charCodeAt(i) + ((hash << 5) - hash); }
  return colors[Math.abs(hash) % colors.length];
};

const ChaptersSummary: React.FC<ChaptersSummaryProps> = ({ idvs = [], orders = [], onChapterClick }) => {
  const statsByChapter = useMemo(() => {
    const stats: Record<string, any> = {};
    (idvs || []).forEach(idv => {
      const cap = idv.capitolo || 'N/D';
      if (!stats[cap]) stats[cap] = { capitolo: cap, total: 0, completed: 0 };
      stats[cap].total += (idv.amount || 0);
    });
    (orders || []).forEach(o => {
      const linked = (idvs || []).find(i => o.linkedIdvIds && o.linkedIdvIds.includes(i.id));
      if (linked && stats[linked.capitolo]) {
        if (o.status === WorkStatus.PAGAMENTO) stats[linked.capitolo].completed += (o.paidValue || 0);
      }
    });
    return Object.values(stats);
  }, [idvs, orders]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {statsByChapter.map(c => {
        const color = getChapterColor(c.capitolo);
        const fontSize = c.capitolo.length > 5 ? 'text-[10px]' : 'text-xl';
        return (
          <div key={c.capitolo} className="bg-white p-6 rounded-[2rem] border border-indigo-50 shadow-sm hover:shadow-md transition-all group">
             <div className="flex justify-between items-start mb-6">
                <button 
                  onClick={() => onChapterClick(c.capitolo)}
                  className={`w-14 h-14 rounded-2xl bg-${color}-50 text-${color}-600 border border-${color}-100 flex flex-col items-center justify-center shadow-sm group-hover:bg-indigo-500 group-hover:text-white transition-all`}
                >
                  <span className="text-[7px] font-black opacity-50 uppercase">Cap.</span>
                  <span className={`${fontSize} font-black leading-none truncate w-full text-center px-1`}>{c.capitolo}</span>
                </button>
                <div className="text-right">
                   <p className="text-[8px] font-black text-slate-300 uppercase">Residuo</p>
                   <p className="text-sm font-black text-slate-700">€{(c.total - c.completed).toLocaleString()}</p>
                </div>
             </div>
             <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-black uppercase mb-1">
                   <span className="text-slate-400">Avanzamento</span>
                   <span className={`text-${color}-600`}>{c.total > 0 ? Math.round((c.completed/c.total)*100) : 0}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-50 rounded-full border border-slate-100 overflow-hidden">
                   <div className={`h-full bg-${color}-500 transition-all duration-1000`} style={{ width: `${c.total > 0 ? (c.completed/c.total)*100 : 0}%` }} />
                </div>
             </div>
          </div>
        );
      })}
    </div>
  );
};
export default ChaptersSummary;
