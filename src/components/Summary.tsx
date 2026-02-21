import React, { useMemo } from 'react';
import { Totals, ProjectInfo, Category, Article, PriceAnalysis } from '../types';
import { SOA_CATEGORIES } from '../constants';
import { Layers, Award, CheckCircle2, AlertTriangle, Calculator, FileText, ShieldAlert, Users, PenTool, Calendar as CalendarIcon } from 'lucide-react';

interface SummaryProps {
  totals: Totals;
  info: ProjectInfo;
  categories: Category[];
  articles: Article[];
  analyses: PriceAnalysis[];
}

const Summary: React.FC<SummaryProps> = ({ totals, info, categories, articles, analyses }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
  };

  // 1. Riepilogo per WBS
  const wbsBreakdown = useMemo(() => {
      return categories
        .filter(c => c.isEnabled !== false && !c.isSuperCategory)
        .map(cat => {
          const catTotal = articles
            .filter(a => a.categoryCode === cat.code)
            .reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
          return { ...cat, total: catTotal };
      }).filter(c => c.total > 0.01);
  }, [categories, articles]);

  // 2. Riepilogo SOA
  const soaBreakdown = useMemo(() => {
      const soaMap: Record<string, number> = {};
      let untaggedTotal = 0;

      articles.forEach(art => {
          const cat = categories.find(c => c.code === art.categoryCode);
          if (cat && cat.isEnabled === false) return;

          const amount = art.quantity * art.unitPrice;
          const effectiveSoa = cat?.soaCategory || art.soaCategory;

          if (effectiveSoa) {
              soaMap[effectiveSoa] = (soaMap[effectiveSoa] || 0) + amount;
          } else if (amount > 0) {
              untaggedTotal += amount;
          }
      });

      const list = Object.entries(soaMap).map(([code, amount]) => ({
          code,
          description: SOA_CATEGORIES.find(s => s.code === code)?.desc || 'Cat. Sconosciuta',
          amount
      })).sort((a, b) => b.amount - a.amount);

      if (untaggedTotal > 0.01) {
          list.push({ code: 'N/D', description: 'Voci non qualificate (Verifica WBS)', amount: untaggedTotal });
      }
      return list;
  }, [articles, categories]);

  const totalAnalyzed = soaBreakdown.reduce((s, i) => s + i.amount, 0);
  const totalWbs = wbsBreakdown.reduce((s, i) => s + i.total, 0);
  const isBalanced = Math.abs(totalWbs - totalAnalyzed) < 0.01;

  // Calcolo Uomini Giorno (240€/giorno) - Patto di Ferro
  const manDaysCount = Math.ceil((totals.totalLabor || 0) / 240);

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
              <div className="p-3 bg-slate-50 border-b font-bold text-blue-800 flex items-center gap-2"><Layers className="w-4 h-4" /> Riepilogo WBS (Lavori netti)</div>
              <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="p-3 text-left">Codice</th><th className="p-3 text-left">Capitolo</th><th className="p-3 text-right">Importo Netto</th></tr></thead>
                  <tbody>
                      {wbsBreakdown.map(cat => (
                          <tr key={cat.code} className={`border-t ${cat.type === 'safety' ? 'bg-orange-50/30' : ''}`}>
                              <td className="p-3 font-mono text-xs">{cat.code}</td>
                              <td className={`p-3 flex items-center gap-2 ${cat.type === 'safety' ? 'text-orange-900' : 'text-blue-900'} font-medium`}>{cat.name} {cat.type === 'safety' && <ShieldAlert className="w-3.5 h-3.5 text-orange-500" />}</td>
                              <td className="p-3 text-right font-bold text-base">{formatCurrency(cat.total)}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>

          <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
              <div className="p-3 bg-slate-50 border-b font-bold text-purple-800 flex items-center gap-2"><Award className="w-4 h-4" /> Analisi SOA (Ereditata da WBS)</div>
              <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="p-3 text-left">Cat.</th><th className="p-3 text-left">Descrizione</th><th className="p-3 text-right">Importo</th></tr></thead>
                  <tbody>
                      {soaBreakdown.map((item, idx) => (
                          <tr key={item.code} className={`border-t ${idx === 0 ? 'bg-purple-50' : ''} ${item.code === 'N/D' ? 'bg-red-50' : ''}`}>
                              <td className="p-3"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.code === 'N/D' ? 'bg-red-200 text-red-800' : 'bg-slate-200 text-slate-800'}`}>{item.code}</span></td>
                              <td className="p-3 text-xs">{item.description}</td>
                              <td className="p-3 text-right font-bold">{formatCurrency(item.amount)}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>

      {analyses.length > 0 && (
          <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden mt-8">
              <div className="p-3 bg-purple-50 border-b font-bold text-purple-900 flex items-center gap-2"><PenTool className="w-4 h-4" /> Elenco Analisi Nuovi Prezzi</div>
              <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                      <tr>
                          <th className="p-3 text-left w-24">Codice</th>
                          <th className="p-3 text-left">Descrizione</th>
                          <th className="p-3 text-center w-20">U.M.</th>
                          <th className="p-3 text-right w-32">Prezzo Unitario</th>
                      </tr>
                  </thead>
                  <tbody>
                      {analyses.map(an => (
                          <tr key={an.id} className="border-t hover:bg-gray-50 transition-colors">
                              <td className="p-3 font-mono text-xs font-bold text-purple-700">{an.code}</td>
                              <td className="p-3 text-xs">{an.description}</td>
                              <td className="p-3 text-center text-xs">{an.unit}</td>
                              <td className="p-3 text-right font-bold">{formatCurrency(an.totalUnitPrice)}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <div className="bg-white p-8 shadow-lg rounded-xl border border-blue-100 flex flex-col justify-center">
              <div className="flex items-center gap-4 mb-6 border-b border-slate-50 pb-4">
                  <div className="bg-blue-600 p-2 rounded-xl"><Calculator className="w-6 h-6 text-white" /></div>
                  <h3 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Quadro Economico</h3>
              </div>
              <div className="space-y-4">
                  <div className="flex justify-between text-gray-600 font-bold border-b border-gray-50 pb-2">
                      <span>Totale Opere (Lavori netti)</span>
                      <span className="font-mono text-blue-700 text-lg">{formatCurrency(totals.totalWorks)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 font-medium text-sm">
                      <span>Oneri Sicurezza PSC</span>
                      <span className="font-mono">{formatCurrency(totals.safetyCosts)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 font-medium text-sm border-b border-gray-50 pb-2">
                      <span>IVA di Progetto ({info.vatRate}%)</span>
                      <span className="font-mono">{formatCurrency(totals.vatAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
                      <span className="font-black text-blue-900 uppercase text-xs tracking-widest">Totale Generale</span>
                      <span className="font-mono text-2xl font-black text-blue-700">{formatCurrency(totals.grandTotal)}</span>
                  </div>
              </div>
          </div>

          <div className="bg-white p-8 shadow-lg rounded-xl border border-orange-100 flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
                  <Users className="w-32 h-32 text-orange-600" />
              </div>
              <div className="flex items-center gap-4 mb-6 border-b border-slate-50 pb-4">
                  <div className="bg-orange-500 p-2 rounded-xl"><Users className="w-6 h-6 text-white" /></div>
                  <h3 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Stima Manodopera</h3>
              </div>
              <div className="space-y-5">
                  <div className="flex justify-between items-center text-gray-600 font-bold">
                      <div className="flex flex-col">
                          <span className="text-xs uppercase tracking-widest text-slate-400">Importo Totale</span>
                          <span className="text-base">Incidenza Manodopera</span>
                      </div>
                      <span className="font-mono text-orange-700 text-xl">{formatCurrency(totals.totalLabor)}</span>
                  </div>
                  
                  <div className="bg-orange-50 p-5 rounded-2xl border border-orange-100 relative z-10">
                      <div className="flex justify-between items-center">
                          <div>
                              <span className="block font-black text-orange-900 uppercase text-[10px] tracking-[0.2em] mb-1">Parametro Uomini-Giorno</span>
                              <p className="text-[9px] text-orange-600 font-bold italic">Basato su costo standard di 240,00 €/giorno</p>
                          </div>
                          <div className="text-right">
                              <span className="block font-mono text-4xl font-black text-orange-600 leading-none">{manDaysCount}</span>
                              <span className="text-[9px] font-black text-orange-400 uppercase tracking-widest">GG LAVORATIVI</span>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {/* BLOCCO DATA E FIRMA DEL PROGETTISTA (PATTO DI FERRO) */}
      <div className="mt-12 flex flex-col md:flex-row justify-between items-start gap-12 border-t-2 border-slate-200 pt-10">
          <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-400">
                  <CalendarIcon className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Luogo e Data</span>
              </div>
              <p className="text-sm font-bold text-slate-700 uppercase italic">{info.location}, {info.date}</p>
          </div>
          
          <div className="w-full md:w-80 space-y-6 text-center">
              <div className="flex items-center justify-center gap-2 text-slate-400">
                  <PenTool className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Il Progettista</span>
              </div>
              <div className="h-24 w-full bg-slate-50 border-b-2 border-slate-300 rounded-xl flex items-center justify-center">
                  <span className="text-slate-300 text-xs italic font-serif">Firma Digitale o Autografa</span>
              </div>
              <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{info.designer}</p>
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