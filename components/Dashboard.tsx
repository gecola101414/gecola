
import React, { useMemo } from 'react';
import { FundingIDV, WorkOrder } from '../types';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList
} from 'recharts';

interface DashboardProps {
  idvs: FundingIDV[];
  orders: WorkOrder[];
  auditLog: any[];
  commandName: string;
  onChapterClick: (chapter: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ idvs, orders, onChapterClick }) => {
  const globalStats = useMemo(() => {
    const total = idvs.reduce((acc, curr) => acc + curr.amount, 0);
    const pds = orders.reduce((acc, curr) => acc + (curr.estimatedValue || 0), 0);
    const contracts = orders.reduce((acc, curr) => acc + (curr.contractValue || 0), 0);
    const paid = orders.reduce((acc, curr) => acc + (curr.paidValue || 0), 0);
    return { total, pds, contracts, paid };
  }, [idvs, orders]);

  const chartData = [
    { name: 'Assegnato', val: globalStats.total, color: '#64748b' },
    { name: 'PDS', val: globalStats.pds, color: '#f59e0b' },
    { name: 'Contratti', val: globalStats.contracts, color: '#6366f1' },
    { name: 'Liquidato', val: globalStats.paid, color: '#10b981' }
  ];

  const formatEuro = (val: number) => `€ ${val.toLocaleString('it-IT')}`;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        {[
          { label: 'TOTALE', val: globalStats.total, bg: 'bg-slate-900', text: 'text-white' },
          { label: 'PDS', val: globalStats.pds, bg: 'bg-amber-50', text: 'text-amber-700' },
          { label: 'CONTRATTI', val: globalStats.contracts, bg: 'bg-indigo-50', text: 'text-indigo-700' },
          { label: 'LIQUIDATO', val: globalStats.paid, bg: 'bg-emerald-50', text: 'text-emerald-700' }
        ].map((s, i) => (
          <div key={i} className={`${s.bg} p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] shadow-sm border border-slate-100`}>
            <p className={`text-[7px] md:text-[9px] font-black uppercase tracking-widest opacity-60 mb-1`}>{s.label}</p>
            <p className={`text-sm md:text-xl font-black ${s.text} truncate`}>{formatEuro(s.val)}</p>
          </div>
        ))}
      </div>

      <div className="bg-white p-6 md:p-10 rounded-[2rem] border border-slate-100 shadow-sm">
        <h3 className="text-[10px] font-black uppercase text-slate-400 mb-6 italic tracking-widest">Avanzamento Globale</h3>
        <div className="h-[250px] md:h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 800}} />
              <YAxis hide />
              <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', fontSize: '10px'}} />
              <Bar dataKey="val" radius={[10, 10, 0, 0]} barSize={40}>
                {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                <LabelList dataKey="val" position="top" formatter={formatEuro} style={{fontSize: '9px', fontWeight: 900}} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-50 border-b border-slate-100">
           <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest italic leading-none">Dettaglio Capitoli</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[8px] font-black text-slate-400 uppercase tracking-widest">Cap.</th>
                <th className="px-6 py-4 text-right text-[8px] font-black text-slate-400 uppercase tracking-widest">Budget</th>
                <th className="px-6 py-4 text-right text-[8px] font-black text-slate-400 uppercase tracking-widest">Liquidato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {Array.from(new Set(idvs.map(i => i.capitolo))).map(cap => {
                const capTotal = idvs.filter(i => i.capitolo === cap).reduce((a, b) => a + b.amount, 0);
                return (
                  <tr key={cap} onClick={() => onChapterClick(cap)} className="hover:bg-indigo-50 cursor-pointer transition-colors">
                    <td className="px-6 py-4 font-black text-indigo-600 text-xs">C-{cap}</td>
                    <td className="px-6 py-4 text-right font-black text-slate-600 text-xs">{formatEuro(capTotal)}</td>
                    <td className="px-6 py-4 text-right font-black text-emerald-600 text-xs">--</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
