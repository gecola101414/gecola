
import React, { useMemo } from 'react';
import { Totals, ProjectInfo, Category, Article } from '../types';
import { SOA_CATEGORIES } from '../constants';
import { Layers, Award, CheckCircle2, AlertTriangle, Calculator, FileText } from 'lucide-react';

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

  // 1. Calcolo Dettaglio WBS (Capitoli)
  const wbsBreakdown = useMemo(() => {
      // Filtra solo categorie abilitate e map per calcolare i totali
      return categories
        .filter(c => c.isEnabled !== false)
        .map(cat => {
          const catTotal = articles
            .filter(a => a.categoryCode === cat.code)
            .reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
          return { ...cat, total: catTotal };
      });
  }, [categories, articles]);

  // 2. Calcolo Dettaglio SOA (Categorie)
  const soaBreakdown = useMemo(() => {
      const soaMap: Record<string, number> = {};
      let untaggedTotal = 0;

      const enabledCategoryCodes = new Set(categories.filter(c => c.isEnabled !== false).map(c => c.code));

      articles.forEach(art => {
          if (!enabledCategoryCodes.has(art.categoryCode)) return;

          const amount = art.quantity * art.unitPrice;
          const soa = art.soaCategory;

          if (soa) {
              soaMap[soa] = (soaMap[soa] || 0) + amount;
          } else {
              untaggedTotal += amount;
          }
      });

      const list = Object.entries(soaMap).map(([code, amount]) => {
          const def = SOA_CATEGORIES.find(s => s.code === code);
          return {
              code,
              description: def?.desc || 'Categoria sconosciuta',
              amount
          };
      }).sort((a, b) => b.amount - a.amount);

      if (untaggedTotal > 0.01) {
          list.push({
              code: 'N/D',
              description: 'Voci senza qualificazione SOA',
              amount: untaggedTotal
          });
      }

      return list;
  }, [categories, articles]);

  const totalSoaAmount = soaBreakdown.reduce((sum, item) => sum + item.amount, 0);
  const totalWbsAmount = wbsBreakdown.reduce((sum, item) => sum + item.total, 0); 
  
  // Calcoli finali
  const safetyAmount = totalWbsAmount * (info.safetyRate / 100);
  const grandTotal = totalWbsAmount + safetyAmount; // SENZA IVA

  const isBalanced = Math.abs(totalWbsAmount - totalSoaAmount) < 0.01;

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      
      {/* HEADER DATI PROGETTO */}
      <div className="bg-white p-6 shadow-sm rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-600"></div>
          <div>
              <span className="text-xs text-gray-500 font-bold uppercase block mb-1">Progetto</span>
              <span className="text-lg font-bold text-gray-800 block leading-tight">{info.title}</span>
              <span className="text-sm text-gray-600 mt-1 flex items-center gap-1"><FileText className="w-3 h-3"/> {info.location}</span>
          </div>
          <div>
              <span className="text-xs text-gray-500 font-bold uppercase block mb-1">Committente</span>
              <span className="text-base text-gray-800">{info.client || '-'}</span>
          </div>
          <div className="text-right">
              <span className="text-xs text-gray-500 font-bold uppercase block mb-1">Listino Base</span>
              <span className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded font-mono font-bold">{info.region} {info.year}</span>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* COLONNA SINISTRA: RIEPILOGO WBS */}
          <div className="flex flex-col h-full">
              <div className="flex items-center mb-4 text-blue-800 border-b border-blue-200 pb-2">
                  <Layers className="w-5 h-5 mr-2" />
                  <h3 className="text-lg font-bold uppercase tracking-wide">Riepilogo per Capitoli (WBS)</h3>
              </div>
              
              <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden flex-1">
                  <table className="w-full text-sm">
                      <thead className="bg-gray-100 text-gray-600 font-bold border-b border-gray-200">
                          <tr>
                              <th className="p-3 text-left w-24">Codice</th>
                              <th className="p-3 text-left">Descrizione Capitolo</th>
                              <th className="p-3 text-right w-32">Importo</th>
                          </tr>
                      </thead>
                      <tbody>
                          {wbsBreakdown.map((cat, idx) => (
                              <tr key={cat.code} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                  <td className="p-3 font-mono font-bold text-gray-500 align-top">{cat.code}</td>
                                  <td className="p-3 text-gray-800 font-medium align-top">{cat.name}</td>
                                  <td className="p-3 text-right font-mono font-bold text-gray-700 align-top">{formatCurrency(cat.total)}</td>
                              </tr>
                          ))}
                          {wbsBreakdown.length === 0 && (
                              <tr><td colSpan={3} className="p-6 text-center text-gray-400 italic">Nessun capitolo presente</td></tr>
                          )}
                      </tbody>
                      <tfoot className="bg-blue-50 border-t-2 border-blue-100">
                          <tr>
                              <td colSpan={2} className="p-3 text-right font-bold text-blue-900 uppercase text-xs">Totale Solo Lavori</td>
                              <td className="p-3 text-right font-bold font-mono text-blue-900 text-base">{formatCurrency(totalWbsAmount)}</td>
                          </tr>
                      </tfoot>
                  </table>
              </div>
          </div>

          {/* COLONNA DESTRA: ANALISI SOA */}
          <div className="flex flex-col h-full">
              <div className="flex items-center mb-4 text-purple-800 border-b border-purple-200 pb-2">
                  <Award className="w-5 h-5 mr-2" />
                  <h3 className="text-lg font-bold uppercase tracking-wide">Analisi Categorie SOA</h3>
              </div>

              <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden flex-1">
                  <table className="w-full text-sm">
                      <thead className="bg-gray-100 text-gray-600 font-bold border-b border-gray-200">
                          <tr>
                              <th className="p-3 text-left w-20">Cat.</th>
                              <th className="p-3 text-left">Descrizione Qualificazione</th>
                              <th className="p-3 text-right w-20">%</th>
                              <th className="p-3 text-right w-32">Importo</th>
                          </tr>
                      </thead>
                      <tbody>
                          {soaBreakdown.map((item, idx) => {
                              const isPrevalent = idx === 0 && item.amount > 0;
                              return (
                                  <tr key={item.code} className={`border-b border-gray-100 ${item.code === 'N/D' ? 'bg-red-50' : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')} ${isPrevalent ? 'bg-purple-50' : ''}`}>
                                      <td className={`p-3 align-top`}>
                                          <span className={`font-mono font-bold px-2 py-1 rounded text-xs ${isPrevalent ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'} ${item.code === 'N/D' ? 'bg-red-100 text-red-600' : ''}`}>
                                              {item.code}
                                          </span>
                                      </td>
                                      <td className="p-3 text-gray-800 text-xs align-middle">
                                          {item.description}
                                          {isPrevalent && <div className="text-[10px] text-purple-600 font-bold mt-1 uppercase tracking-wider">★ Categoria Prevalente</div>}
                                      </td>
                                      <td className="p-3 text-right text-xs text-gray-500 align-middle font-mono">{totalSoaAmount > 0 ? formatPercent(item.amount / totalSoaAmount) : '0%'}</td>
                                      <td className="p-3 text-right font-mono font-medium align-middle">{formatCurrency(item.amount)}</td>
                                  </tr>
                              );
                          })}
                          {soaBreakdown.length === 0 && (
                              <tr><td colSpan={4} className="p-6 text-center text-gray-400 italic">Nessuna voce analizzabile</td></tr>
                          )}
                      </tbody>
                      <tfoot className="bg-purple-50 border-t-2 border-purple-100">
                          <tr>
                              <td colSpan={3} className="p-3 text-right font-bold text-purple-900 uppercase text-xs">Totale per SOA</td>
                              <td className="p-3 text-right font-bold font-mono text-purple-900 text-base">{formatCurrency(totalSoaAmount)}</td>
                          </tr>
                      </tfoot>
                  </table>
              </div>
          </div>
      </div>

      {/* TOTALE GENERALE (SENZA IVA) */}
      <div className="bg-white p-8 shadow-lg rounded-xl border border-gray-300 mt-8">
          <div className="flex flex-col md:flex-row justify-between items-end md:items-center border-b-2 border-gray-100 pb-6 mb-6">
              <div className="flex items-center">
                  <div className="p-3 bg-gray-100 rounded-full mr-4"><Calculator className="w-8 h-8 text-gray-600" /></div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">Quadro Economico Estimativo (Dettaglio)</h2>
                    <span className="text-xs text-gray-500 uppercase tracking-widest font-bold">Fase Progettuale (Escluso IVA)</span>
                  </div>
              </div>
          </div>
          
          <div className="space-y-4 text-sm max-w-2xl ml-auto">
              <div className="flex justify-between items-center text-gray-600 text-base border-b border-gray-100 pb-2">
                  <span>Totale Lavori a misura e a corpo (A)</span>
                  <span className="font-mono font-medium">{formatCurrency(totalWbsAmount)}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600 text-base border-b border-gray-100 pb-2">
                  <span>Oneri per la Sicurezza ({info.safetyRate}%) (B) <span className="text-xs text-gray-400 italic ml-2 bg-gray-100 px-2 py-0.5 rounded">Non soggetti a ribasso</span></span>
                  <span className="font-mono font-medium">{formatCurrency(safetyAmount)}</span>
              </div>
              
              <div className="pt-4 flex justify-between items-center bg-blue-50 p-6 rounded-lg border border-blue-100">
                  <div className="flex flex-col">
                      <span className="font-bold text-blue-900 uppercase text-xl tracking-tight">Totale Lavori</span>
                      <span className="text-blue-500 text-xs uppercase tracking-widest">(A + B)</span>
                  </div>
                  <span className="font-mono text-4xl font-bold text-blue-700">{formatCurrency(grandTotal)}</span>
              </div>
          </div>
      </div>

      {/* VERIFICA QUADRATURA */}
      <div className={`mt-6 p-4 rounded-lg border-l-4 shadow-sm flex items-center justify-between transition-colors ${isBalanced ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
          <div className="flex items-center gap-4">
              {isBalanced ? (
                  <div className="bg-green-100 p-2 rounded-full"><CheckCircle2 className="w-6 h-6 text-green-600" /></div>
              ) : (
                  <div className="bg-red-100 p-2 rounded-full"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
              )}
              <div>
                  <h4 className={`font-bold text-sm uppercase tracking-wider ${isBalanced ? 'text-green-800' : 'text-red-800'}`}>
                      {isBalanced ? 'Quadratura Contabile Verificata' : 'Attenzione: Discrepanza nei totali'}
                  </h4>
                  <p className={`text-xs mt-1 ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                      {isBalanced 
                          ? 'Il totale analitico delle WBS corrisponde perfettamente alla somma delle categorie SOA.' 
                          : `Esiste una differenza di ${formatCurrency(Math.abs(totalWbsAmount - totalSoaAmount))} tra il totale WBS e il totale SOA. Verifica le voci non assegnate (N/D).`}
                  </p>
              </div>
          </div>
      </div>

    </div>
  );
};

export default Summary;
