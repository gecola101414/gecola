
import React, { useMemo } from 'react';
import { Totals, ProjectInfo, Category, Article } from '../types';
import { SOA_CATEGORIES } from '../constants';
import { Layers, Award, CheckCircle2, AlertTriangle, Calculator, FileText, ShieldAlert } from 'lucide-react';

interface SummaryProps {
  totals: Totals;
  info: ProjectInfo;
  categories: Category[];
  articles: Article[];
}

const Summary: React.FC<SummaryProps> = ({ totals, info, categories, articles }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
  };

  const formatPercent = (val: number) => {
      return new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 2 }).format(val);
  };

  const wbsBreakdown = useMemo(() => {
      return categories
        .filter(c => c.isEnabled !== false)
        .map(cat => {
          const catTotal = articles
            .filter(a => a.categoryCode === cat.code)
            .reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
          return { ...cat, total: catTotal };
      });
  }, [categories, articles]);

  const soaBreakdown = useMemo(() => {
      const soaMap: Record<string, number> = {};
      let untaggedTotal = 0;
      articles.forEach(art => {
          const cat = categories.find(c => c.code === art.categoryCode);
          if (cat && cat.isEnabled === false) return;
          
          const amount = art.quantity * art.unitPrice;
          if (art.soaCategory) soaMap[art.soaCategory] = (soaMap[art.soaCategory] || 0) + amount;
          else untaggedTotal += amount;
      });
      const list = Object.entries(soaMap).map(([code, amount]) => ({
          code,
          description: SOA_CATEGORIES.find(s => s.code === code)?.desc || 'Cat. Sconosciuta',
          amount
      })).sort((a, b) => b.amount - a.amount);
      if (untaggedTotal > 0.01) list.push({ code: 'N/D', description: 'Voci non qualificate', amount: untaggedTotal });
      return list;
  }, [articles, categories]);

  const totalAnalyzed = soaBreakdown.reduce((s, i) => s + i.amount, 0);
  const totalWbs = wbsBreakdown.reduce((s, i) => s + i.total, 0);
  const isBalanced = Math.abs(totalWbs - totalAnalyzed) < 0.01;

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="bg-white p-6 shadow-sm rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-600"></div>
          <div>
              <span className="text-xs text-gray-500 font-bold uppercase block mb-1">Progetto</span>
              <span className="text-lg font-bold text-gray-800 block">{info.title}</span>
              <span className="text-sm text-gray-600 mt-1 flex items-center gap-1"><FileText className="w-3 h-3"/> {info.location}</span>
          </div>
          <div>
              <span className="text-xs text-gray-500 font-bold uppercase block mb-1">Committente</span>
              <span className="text-base text-gray-800">{info.client}</span>
          </div>
          <div className="text-right">
              <span className="text-xs text-gray-500 font-bold uppercase block mb-1">Listino</span>
              <span className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded font-mono font-bold">{info.region} {info.year}</span>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
              <div className="p-3 bg-slate-50 border-b font-bold text-blue-800 flex items-center gap-2"><Layers className="w-4 h-4" /> Riepilogo WBS</div>
              <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="p-3 text-left">Codice</th><th className="p-3 text-left">Capitolo</th><th className="p-3 text-right">Importo</th></tr></thead>
                  <tbody>
                      {wbsBreakdown.map(cat => (
                          <tr key={cat.code} className={`border-t ${cat.type === 'safety' ? 'bg-orange-50/30' : ''}`}>
                              <td className="p-3 font-mono text-xs">{cat.code}</td>
                              <td className={`p-3 flex items-center gap-2 ${cat.type === 'safety' ? 'text-orange-900' : 'text-blue-900'} font-medium`}>
                                {cat.name}
                                {cat.type === 'safety' && <ShieldAlert className="w-3.5 h-3.5 text-orange-500" />}
                              </td>
                              <td className="p-3 text-right font-bold text-base">{formatCurrency(cat.total)}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>

          <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
              <div className="p-3 bg-slate-50 border-b font-bold text-purple-800 flex items-center gap-2"><Award className="w-4 h-4" /> Analisi SOA</div>
              <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="p-3 text-left">Cat.</th><th className="p-3 text-left">Descrizione</th><th className="p-3 text-right">Importo</th></tr></thead>
                  <tbody>
                      {soaBreakdown.map((item, idx) => (
                          <tr key={item.code} className={`border-t ${idx === 0 ? 'bg-purple-50' : ''}`}>
                              <td className="p-3"><span className="bg-slate-200 px-1.5 py-0.5 rounded text-[10px] font-bold">{item.code}</span></td>
                              <td className="p-3 text-xs">{item.description}</td>
                              <td className="p-3 text-right font-bold">{formatCurrency(item.amount)}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>

      <div className="bg-white p-8 shadow-lg rounded-xl border border-blue-100 mt-8 flex flex-col items-end">
          <div className="w-full max-w-md space-y-3">
              <div className="flex justify-between text-gray-600"><span>Totale Lavori (A)</span><span className="font-mono">{formatCurrency(totals.totalWorks)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Oneri Sicurezza PSC (Analitici) (B)</span><span className="font-mono text-orange-600 font-bold">{formatCurrency(totals.totalSafetyProgettuale)}</span></div>
              <div className="flex justify-between text-gray-400 text-xs italic"><span>Quota Sicurezza su Lavori ({info.safetyRate}%) (C)</span><span className="font-mono">{formatCurrency(totals.safetyCosts)}</span></div>
              <div className="pt-4 flex justify-between items-center border-t-2 border-blue-600 text-blue-900 font-black text-2xl">
                  <span>TOTALE (A+B+C)</span>
                  <span className="font-mono">{formatCurrency(totals.totalWorks + totals.totalSafetyProgettuale + totals.safetyCosts)}</span>
              </div>
              <p className="text-[10px] text-gray-400 text-right mt-2 uppercase tracking-tighter">* Importi netti esclusi di IVA di legge</p>
          </div>
      </div>

      <div className={`p-4 rounded-lg flex items-center justify-between ${isBalanced ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          <div className="flex items-center gap-3">
              {isBalanced ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              <span className="font-bold">{isBalanced ? 'Bilancio Contabile Verificato' : 'Discrepanza tra WBS e SOA'}</span>
          </div>
      </div>
    </div>
  );
};

export default Summary;
