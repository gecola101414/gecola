import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Calculator, LayoutDashboard, FolderOpen, Minus, XCircle, ChevronRight, Settings, PlusCircle, MinusCircle, Link as LinkIcon, ExternalLink, Undo2, Redo2, PenLine, MapPin, Lock, Unlock, Lightbulb, LightbulbOff, Edit2, FolderPlus, GripVertical, Mic, Sigma, Save, FileSignature, CheckCircle2, Loader2, Cloud, Share2, FileText, ChevronDown, TestTubes, Search, Coins, ArrowRightLeft, Copy, Move, LogOut, AlertTriangle, ShieldAlert, Award, User, BookOpen, Edit3, Paperclip, MousePointerClick, AlignLeft, Layers, Sparkles } from 'lucide-react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { ref, set, onValue, off } from 'firebase/database';
import { auth, db } from './firebase';
import Login from './components/Login';
import { CATEGORIES, INITIAL_ARTICLES, PROJECT_INFO, INITIAL_ANALYSES, SOA_CATEGORIES } from './constants';
import { Article, Totals, ProjectInfo, Measurement, Category, PriceAnalysis, AnalysisComponent } from './types';
import Summary from './components/Summary';
import ProjectSettingsModal from './components/ProjectSettingsModal';
import LinkArticleModal from './components/LinkArticleModal';
import ArticleEditModal from './components/ArticleEditModal';
import CategoryDropGate from './components/CategoryDropGate';
import CategoryEditModal from './components/CategoryEditModal';
import SaveProjectModal from './components/SaveProjectModal';
import AnalysisEditorModal from './components/AnalysisEditorModal';
import ImportAnalysisModal from './components/ImportAnalysisModal';
import BulkGeneratorModal from './components/BulkGeneratorModal';
import { parseDroppedContent, parseVoiceMeasurement, generateBulkItems } from './services/geminiService';
import { generateComputoMetricPdf, generateElencoPrezziPdf, generateManodoperaPdf, generateAnalisiPrezziPdf } from './services/pdfGenerator';

// --- Helpers di Formattazione ---
const formatCurrency = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
const formatNumber = (val: number | undefined) => (val === undefined || val === null || val === 0) ? '' : val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const getWbsNumber = (code: string) => { const match = code.match(/WBS\.(\d+)/); return match ? parseInt(match[1], 10) : code; };
const roundTwoDecimals = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

// --- Engine di Calcolo Originale ---
const calculateRowValue = (m: Measurement, linkedValue: number = 0): number => {
  if (m.type === 'subtotal') return 0;
  if (m.linkedArticleId) {
    const mult = m.multiplier === undefined ? 1 : m.multiplier;
    return (linkedValue || 0) * mult * (m.type === 'deduction' ? -1 : 1);
  }
  const factors = [m.length, m.width, m.height].filter(v => v !== undefined && v !== 0 && v !== null);
  const base = factors.length > 0 ? factors.reduce((a, b) => (a || 1) * (b || 1), 1) : 0;
  let mult = (m.multiplier !== undefined) ? m.multiplier : (factors.length > 0 ? 1 : 0);
  const val = ((factors.length === 0 && mult !== 0) ? 1 : base) * mult;
  return m.type === 'deduction' ? -val : val;
};

const resolveArticleQuantity = (id: string, map: Map<string, Article>, visited: Set<string> = new Set()): number => {
  if (visited.has(id)) return 0;
  visited.add(id);
  const art = map.get(id);
  if (!art) return 0;
  return art.measurements.reduce((sum, m) => {
    let rowVal = 0;
    if (m.linkedArticleId) {
       const srcQty = resolveArticleQuantity(m.linkedArticleId, map, new Set(visited));
       let base = srcQty;
       if (m.linkedType === 'amount') { const src = map.get(m.linkedArticleId); if (src) base = srcQty * src.unitPrice; }
       rowVal = calculateRowValue(m, base);
    } else { rowVal = calculateRowValue(m); }
    return sum + rowVal;
  }, 0);
};

const recalculateAllArticles = (articles: Article[]): Article[] => {
  const map = new Map(articles.map(a => [a.id, a]));
  return articles.map(art => ({ ...art, quantity: resolveArticleQuantity(art.id, map) }));
};

// --- Componenti Tabella ---
const TableHeader: React.FC<{ activeColumn: string | null }> = ({ activeColumn }) => (
  <thead className="bg-[#f8f9fa] border-b border-black text-[9px] uppercase font-bold text-gray-800 sticky top-0 z-20 shadow-sm">
    <tr>
      <th className="py-1 px-1 text-center w-[35px] border-r border-gray-300">N.</th>
      <th className="py-1 px-1 text-left w-[100px] border-r border-gray-300">Tariffa</th>
      <th className={`py-1 px-1 text-left min-w-[250px] border-r border-gray-300 ${activeColumn === 'desc' ? 'bg-blue-50' : ''}`}>Designazione dei Lavori</th>
      <th className="py-1 px-1 text-center w-[45px] border-r border-gray-300">Par.Ug</th>
      <th className="py-1 px-1 text-center w-[55px] border-r border-gray-300">Lung.</th>
      <th className="py-1 px-1 text-center w-[55px] border-r border-gray-300">Largh.</th>
      <th className="py-1 px-1 text-center w-[55px] border-r border-gray-300">H/Peso</th>
      <th className="py-1 px-1 text-center w-[70px] border-r border-gray-300 bg-gray-100">Quantità</th>
      <th className="py-1 px-1 text-right w-[80px] border-r border-gray-300">Prezzo €</th>
      <th className="py-1 px-1 text-right w-[90px] border-r border-gray-300">Importo €</th>
      <th className="py-1 px-1 text-right w-[80px] border-r border-gray-300">M.O. €</th>
      <th className="py-1 px-1 text-center w-[50px] print:hidden text-gray-400">Cmd</th>
    </tr>
  </thead>
);

const ArticleGroup: React.FC<any> = (props) => {
   const { article, index, allArticles, onUpdateArticle, onEditArticleDetails, onDeleteArticle, onAddMeasurement, onAddSubtotal, onUpdateMeasurement, onDeleteMeasurement, onToggleDeduction, onOpenLinkModal, onScrollToArticle, onArticleDragStart, onViewAnalysis, onToggleArticleLock } = props;
   const [isArticleDragOver, setIsArticleDragOver] = useState(false);
   const [articleDropPosition, setArticleDropPosition] = useState<'top' | 'bottom' | null>(null);
   const isArticleLocked = article.isLocked || false;

   let runningPartialSum = 0;
   const processedMeasurements = article.measurements.map((m: any) => {
        let val = 0;
        if (m.type !== 'subtotal') {
            if (m.linkedArticleId) {
                const linkedArt = allArticles.find((a: any) => a.id === m.linkedArticleId);
                if (linkedArt) {
                    const baseVal = m.linkedType === 'amount' ? (linkedArt.quantity * linkedArt.unitPrice) : linkedArt.quantity;
                    val = calculateRowValue(m, baseVal);
                }
            } else { val = calculateRowValue(m); }
        }
        let displayValue = 0;
        if (m.type === 'subtotal') { displayValue = runningPartialSum; runningPartialSum = 0; }
        else { displayValue = val; runningPartialSum += val; }
        return { ...m, displayValue };
   });

   const hierarchicalNumber = `${getWbsNumber(article.categoryCode)}.${index + 1}`;

   return (
      <tbody id={`article-${article.id}`} className={`bg-white border-b border-gray-400 relative ${isArticleLocked ? 'bg-gray-50' : ''}`}>
         <tr 
            className={`align-top cursor-move hover:bg-slate-50 transition-colors group/row`}
            draggable={!isArticleLocked}
            onDragStart={(e) => onArticleDragStart(e, article)}
         >
            <td className="text-center py-2 text-xs font-bold text-gray-500 border-r border-gray-200 font-mono">{hierarchicalNumber}</td>
            <td className="p-1 border-r border-gray-200 align-top">
                <div className="flex flex-col relative">
                    <span className={`font-mono font-bold text-xs px-1 ${article.linkedAnalysisId ? 'text-purple-700' : ''}`}>{article.code}</span>
                    {article.linkedAnalysisId && <button onClick={() => onViewAnalysis(article.linkedAnalysisId)} className="absolute right-0 top-0 text-purple-500 p-0.5" title="Vedi Analisi"><TestTubes className="w-3 h-3" /></button>}
                </div>
            </td>
            <td className="p-2 border-r border-gray-200"><div className="text-sm text-gray-900 font-serif text-justify leading-tight">{article.description}</div></td>
            <td colSpan={8} className="border-r border-gray-200"></td>
            <td className="print:hidden text-center align-top pt-2">
               <div className="flex flex-col items-center space-y-1">
                  <button onClick={() => onToggleArticleLock(article.id)} className={`p-1 rounded ${isArticleLocked ? 'text-red-500 bg-red-50 shadow-sm' : 'text-gray-300 hover:text-blue-500'}`}>{isArticleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}</button>
                  {!isArticleLocked && <><button onClick={() => onDeleteArticle(article.id)} className="text-gray-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button><button onClick={() => onEditArticleDetails(article)} className="text-gray-300 hover:text-blue-600"><PenLine className="w-4 h-4" /></button></>}
               </div>
            </td>
         </tr>
         {processedMeasurements.map((m: any) => (
            <tr key={m.id} className={`text-xs group/meas transition-colors ${m.type === 'deduction' ? 'text-red-600' : 'text-gray-800'} ${m.type === 'subtotal' ? 'bg-yellow-50 font-bold' : 'bg-white hover:bg-slate-50'}`}>
                <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                <td className="pl-6 pr-2 py-1 border-r border-gray-200 relative">
                     {m.type === 'subtotal' ? <div className="italic text-gray-600 text-right pr-2 uppercase text-[10px]">Sommano parziale</div> : (
                        <div className="flex items-center">
                             <div className="absolute left-0 top-1/2 w-4 h-[1px] bg-gray-300"></div>
                             {m.linkedArticleId ? <button onClick={() => onScrollToArticle(m.linkedArticleId)} className="text-blue-600 font-bold hover:underline text-[11px] truncate">Vedi voce collegata</button> : <input value={m.description} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'description', e.target.value)} className="w-full bg-transparent border-none p-0 focus:ring-0 placeholder-gray-300" placeholder="..." disabled={isArticleLocked} />}
                        </div>
                     )}
                </td>
                <td className="border-r border-gray-200 p-0 bg-gray-50"><input type="number" disabled={isArticleLocked} className="w-full text-center bg-transparent border-none text-xs" value={m.multiplier || ''} placeholder="1" onChange={(e) => onUpdateMeasurement(article.id, m.id, 'multiplier', parseFloat(e.target.value))} /></td>
                <td className="border-r border-gray-200 p-0 bg-gray-50"><input type="number" disabled={isArticleLocked || !!m.linkedArticleId} className="w-full text-center bg-transparent border-none text-xs" value={m.length || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'length', parseFloat(e.target.value))} /></td>
                <td className="border-r border-gray-200 p-0 bg-gray-50"><input type="number" disabled={isArticleLocked || !!m.linkedArticleId} className="w-full text-center bg-transparent border-none text-xs" value={m.width || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'width', parseFloat(e.target.value))} /></td>
                <td className="border-r border-gray-200 p-0 bg-gray-50"><input type="number" disabled={isArticleLocked || !!m.linkedArticleId} className="w-full text-center bg-transparent border-none text-xs" value={m.height || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'height', parseFloat(e.target.value))} /></td>
                <td className={`border-r border-gray-200 text-right font-mono pr-1 ${m.type === 'subtotal' ? 'bg-yellow-100 text-black border-t-2 border-b-2 border-gray-300' : 'bg-white text-gray-500'}`}>{formatNumber(m.displayValue)}</td>
                <td colSpan={3} className="border-r border-gray-200"></td>
                <td className="text-center print:hidden bg-gray-50/50">
                    {!isArticleLocked && (
                        <div className="flex justify-center items-center space-x-1 opacity-0 group-hover/meas:opacity-100 transition-opacity">
                            {m.type !== 'subtotal' && <><button onClick={() => onOpenLinkModal(article.id, m.id)} className={`rounded p-0.5 ${m.linkedArticleId ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-blue-500'}`}><LinkIcon className="w-3.5 h-3.5" /></button><button onClick={() => onToggleDeduction(article.id, m.id)} className={`p-0.5 ${m.type === 'positive' ? 'text-gray-300 hover:text-red-500' : 'text-red-500'}`}><MinusCircle className="w-3.5 h-3.5" /></button></>}
                            <button onClick={() => onDeleteMeasurement(article.id, m.id)} className="text-gray-300 hover:text-red-500 p-0.5"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                    )}
                </td>
            </tr>
         ))}
         <tr className="bg-white font-bold text-xs border-t border-gray-300 border-b-2 border-gray-400">
             <td className="border-r border-gray-300"></td><td className="border-r border-gray-300"></td>
             <td className="px-2 py-2 text-right border-r border-gray-300 uppercase">Sommano {article.unit}</td>
             <td colSpan={4} className="border-r border-gray-200"></td>
             <td className="text-right pr-1 font-mono text-black border-t-4 border-double border-gray-800">{formatNumber(article.quantity)}</td>
             <td className="border-l border-r border-gray-300 text-right pr-1 font-mono bg-slate-50">{formatNumber(article.unitPrice)}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-blue-900 bg-blue-50/30">{formatNumber(article.quantity * article.unitPrice)}</td>
             <td className="border-r border-gray-300 text-right pr-1 font-mono text-gray-400 font-normal text-[9px]">{formatCurrency((article.quantity * article.unitPrice) * (article.laborRate / 100))}</td>
             <td className="text-center print:hidden bg-gray-50 align-middle">
                {!isArticleLocked && (
                   <div className="flex items-center justify-center space-x-1">
                        <button onClick={() => onAddSubtotal(article.id)} className="w-5 h-5 rounded-full text-orange-400 border border-orange-200 flex items-center justify-center hover:bg-orange-50" title="Parziale"><Sigma className="w-3 h-3" /></button>
                        <button onClick={() => onAddMeasurement(article.id)} className="w-6 h-6 rounded-full text-gray-500 border border-gray-300 hover:bg-slate-500 hover:text-white flex items-center justify-center shadow-sm" title="Nuova Misura"><Plus className="w-4 h-4" /></button>
                   </div>
                )}
             </td>
         </tr>
      </tbody>
   );
};

// --- Tipi Mancanti ---
interface Snapshot {
  articles: Article[];
  categories: Category[];
  analyses: PriceAnalysis[];
}

type ViewMode = 'COMPUTO' | 'ANALISI';

// --- App Principal Restaurata ---
const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  useEffect(() => { if (!auth) { setAuthLoading(false); return; } return onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); }); }, []);

  // 1. FIX CURSORE GLOBALE: Evita il simbolo del divieto durante il drag cross-tab
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault(); 
      if (e.dataTransfer) { e.dataTransfer.dropEffect = 'copy'; }
    };
    const handleGlobalDrop = (e: DragEvent) => { e.preventDefault(); };
    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('drop', handleGlobalDrop);
    return () => { window.removeEventListener('dragover', handleGlobalDragOver); window.removeEventListener('drop', handleGlobalDrop); };
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>('COMPUTO');
  const [categories, setCategories] = useState<Category[]>(CATEGORIES);
  const [articles, setArticles] = useState<Article[]>(INITIAL_ARTICLES);
  const [analyses, setAnalyses] = useState<PriceAnalysis[]>(INITIAL_ANALYSES);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(PROJECT_INFO);
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>('SUMMARY');
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<{articleId: string, measurementId: string} | null>(null);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [isAnalysisEditorOpen, setIsAnalysisEditorOpen] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState<PriceAnalysis | null>(null);
  const [isImportAnalysisModalOpen, setIsImportAnalysisModalOpen] = useState(false);
  const [draggedCategoryCode, setDraggedCategoryCode] = useState<string | null>(null);
  const [wbsDropTarget, setWbsDropTarget] = useState<{ code: string, position: 'top' | 'bottom' } | null>(null);

  const updateState = (newArticles: Article[], newCategories: Category[] = categories, newAnalyses: PriceAnalysis[] = analyses) => {
      setHistory(prev => [...prev, { articles, categories, analyses }].slice(-50));
      setFuture([]);
      setArticles(recalculateAllArticles(newArticles));
      setCategories(newCategories);
      setAnalyses(newAnalyses);
  };

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture(f => [{ articles, categories, analyses }, ...f]);
    setHistory(h => h.slice(0, -1));
    setArticles(prev.articles); setCategories(prev.categories); setAnalyses(prev.analyses);
  }, [history, articles, categories, analyses]);

  // Handler for starting drag of an analysis item
  const handleAnalysisDragStart = (e: React.DragEvent, analysis: PriceAnalysis) => { 
    e.dataTransfer.setData('text/plain', `GECOLA_DATA::ANALYSIS::${JSON.stringify(analysis)}`); 
    e.dataTransfer.effectAllowed = 'copy'; 
  };

  // Handler for content dropped into the WBS gate from gecola.it
  const handleDropContent = (rawText: string) => { 
      const targetCatCode = selectedCategoryCode === 'SUMMARY' ? (categories[0]?.code || 'WBS.01') : selectedCategoryCode;
      const currentCat = categories.find(c => c.code === targetCatCode);
      if (currentCat && currentCat.isLocked) { alert("Impossibile importare: Il capitolo è bloccato."); return; }
      if (!rawText) return; 
      try { 
          const parsed = parseDroppedContent(rawText); 
          if (parsed) { 
              const newArticle: Article = { 
                  id: Math.random().toString(36).substr(2, 9), 
                  categoryCode: targetCatCode, 
                  code: parsed.code || 'NP.001', 
                  priceListSource: parsed.priceListSource, 
                  description: parsed.description || 'Voce importata', 
                  unit: parsed.unit || 'cad', 
                  unitPrice: parsed.unitPrice || 0, 
                  laborRate: parsed.laborRate || 0, 
                  soaCategory: 'OG1', 
                  measurements: [{ id: Math.random().toString(36).substr(2,9), description: '', type: 'positive' }], 
                  quantity: 0 
              }; 
              updateState([...articles, newArticle]); 
          } else { alert("Struttura dati non riconosciuta."); } 
      } catch (e) { console.error(e); }
  };

  // Utility to generate the next WBS code based on current list length
  const generateNextWbsCode = (currentCats: Category[]) => `WBS.${(currentCats.length + 1).toString().padStart(2, '0')}`;
  
  // Handler for saving or creating a category
  const handleSaveCategory = (name: string) => {
    if (editingCategory) {
        const newCats = categories.map(c => c.code === editingCategory.code ? { ...c, name } : c);
        updateState(articles, newCats);
    } else {
        const newCode = generateNextWbsCode(categories);
        const newCat: Category = { code: newCode, name, isEnabled: true, isLocked: false };
        const newCats = [...categories, newCat];
        updateState(articles, newCats);
    }
  };

  const activeCategory = useMemo(() => categories.find(c => c.code === selectedCategoryCode), [categories, selectedCategoryCode]);
  const activeArticles = useMemo(() => articles.filter(a => a.categoryCode === selectedCategoryCode), [articles, selectedCategoryCode]);
  
  const totals = useMemo(() => {
    const totalWorks = articles.reduce((acc, art) => { const cat = categories.find(c => c.code === art.categoryCode); return (cat && cat.isEnabled !== false) ? acc + (art.quantity * art.unitPrice) : acc; }, 0);
    const safety = totalWorks * (projectInfo.safetyRate / 100);
    const tax = totalWorks + safety;
    return { totalWorks, safetyCosts: safety, totalTaxable: tax, vatAmount: tax * (projectInfo.vatRate / 100), grandTotal: tax * (1 + projectInfo.vatRate / 100) };
  }, [articles, categories, projectInfo]);

  // 2. LOGICA DRAG START CROSS-TAB: Popola il bundle per il trasferimento
  const handleWbsDragStart = (e: React.DragEvent, code: string) => { 
      e.dataTransfer.effectAllowed = 'all'; 
      e.dataTransfer.setData('text/uri-list', window.location.href); // Trucco per attivazione Tab
      setDraggedCategoryCode(code); 
      const cat = categories.find(c => c.code === code);
      if (cat) {
          const catArticles = articles.filter(a => a.categoryCode === code);
          const relatedAnalyses = analyses.filter(an => catArticles.some(art => art.linkedAnalysisId === an.id));
          const bundle = { type: 'CROSS_TAB_WBS_BUNDLE', category: cat, articles: catArticles, analyses: relatedAnalyses };
          e.dataTransfer.setData('text/plain', JSON.stringify(bundle));
      }
  };

  // 3. LOGICA DROP CROSS-TAB: Riceve e clona il bundle rigenerando gli ID
  const handleWbsDrop = (e: React.DragEvent, targetCode: string | null) => { 
      e.preventDefault(); setWbsDropTarget(null); 
      const textData = e.dataTransfer.getData('text/plain');
      if (textData) {
          try {
              const payload = JSON.parse(textData);
              if (payload && payload.type === 'CROSS_TAB_WBS_BUNDLE') {
                  const { category: importedCat, articles: importedArticles, analyses: importedAnalyses } = payload;
                  const newCatCode = `WBS.${(categories.length + 1).toString().padStart(2, '0')}`;
                  const analysisIdMap = new Map<string, string>();
                  const newAnalysesList = [...analyses];
                  
                  // Clona Analisi
                  if (importedAnalyses) {
                      importedAnalyses.forEach((an: PriceAnalysis) => {
                          const nid = Math.random().toString(36).substr(2, 9);
                          analysisIdMap.set(an.id, nid);
                          newAnalysesList.push({ ...an, id: nid, code: an.code + "-Clona", components: an.components.map(c => ({...c, id: Math.random().toString(36).substr(2,9)})) });
                      });
                  }
                  // Clona Articoli
                  const newArticles = importedArticles.map((art: Article) => {
                      const nid = Math.random().toString(36).substr(2, 9);
                      let nLid = art.linkedAnalysisId; if (nLid && analysisIdMap.has(nLid)) nLid = analysisIdMap.get(nLid);
                      return { ...art, id: nid, categoryCode: newCatCode, linkedAnalysisId: nLid, measurements: art.measurements.map(m => ({ ...m, id: Math.random().toString(36).substr(2,9), linkedArticleId: undefined })) };
                  });
                  updateState([...articles, ...newArticles], [...categories, { ...importedCat, code: newCatCode, name: importedCat.name + " (Importato)" }], newAnalysesList);
                  setSelectedCategoryCode(newCatCode);
                  return;
              }
          } catch (e) { /* silent fail */ }
      }
      setDraggedCategoryCode(null);
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white font-mono"><Loader2 className="animate-spin mr-3 text-orange-500"/> SISTEMA GECOLA IN CARICAMENTO...</div>;
  if (!user) return <Login />;

  return (
    <div className="h-screen flex flex-col bg-[#e8eaed] font-sans overflow-hidden text-slate-800" onDragOver={(e) => { e.preventDefault(); if(e.dataTransfer) e.dataTransfer.dropEffect='copy'; }}>
      {/* Navbar Professionale */}
      <div className="bg-[#2c3e50] shadow-md z-50 h-14 flex items-center justify-between px-6 border-b border-slate-600">
          <div className="flex items-center space-x-3 w-64 flex-shrink-0">
              <div className="bg-orange-500 p-1.5 rounded-lg shadow-lg"><Calculator className="text-white w-5 h-5"/></div>
              <span className="font-bold text-white text-lg uppercase tracking-tight">GeCoLa <span className="font-light opacity-80 text-xs">v3.2</span></span>
          </div>
          <div className="flex-1 flex justify-center">
              <div className="bg-slate-800/50 px-5 py-1 rounded-full text-white font-bold text-sm truncate max-w-[500px] border border-slate-700 shadow-inner group cursor-pointer" onClick={() => setIsSettingsModalOpen(true)}>
                  {projectInfo.title} <Edit3 className="w-3 h-3 inline ml-2 text-slate-400 group-hover:text-white transition-colors" />
              </div>
          </div>
          <div className="flex items-center space-x-3 w-64 justify-end">
              <button onClick={() => setIsSaveModalOpen(true)} className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-all" title="Esporta"><Share2 className="w-5 h-5"/></button>
              <button onClick={() => setIsSettingsModalOpen(true)} className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded transition-all" title="Impostazioni"><Settings className="w-5 h-5"/></button>
              <button onClick={() => signOut(auth)} className="p-1.5 text-red-400 hover:text-white hover:bg-red-600 rounded ml-2 transition-all"><LogOut className="w-5 h-5"/></button>
          </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigazione */}
        <div className="w-64 bg-white border-r border-slate-300 flex flex-col z-10 shadow-lg">
          <div className="p-3 bg-slate-50 border-b flex gap-1">
              <button onClick={() => setViewMode('COMPUTO')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${viewMode === 'COMPUTO' ? 'bg-white text-blue-700 shadow-md ring-1 ring-blue-100' : 'text-slate-500 hover:bg-slate-100'}`}>Computo</button>
              <button onClick={() => setViewMode('ANALISI')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${viewMode === 'ANALISI' ? 'bg-white text-purple-700 shadow-md ring-1 ring-purple-100' : 'text-slate-500 hover:bg-slate-100'}`}>Analisi</button>
          </div>
          <div className="flex-1 overflow-y-auto" onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleWbsDrop(e, null)}>
            {viewMode === 'COMPUTO' ? (
                <ul className="py-2">
                    <li>
                        <button onClick={() => setSelectedCategoryCode('SUMMARY')} className={`w-full text-left pl-3 pr-2 py-3 border-l-4 transition-all flex items-center gap-3 ${selectedCategoryCode === 'SUMMARY' ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
                            <LayoutDashboard className="w-4 h-4" />
                            <span className="text-xs uppercase tracking-wider">Quadro Riepilogo</span>
                        </button>
                    </li>
                    {categories.map(cat => (
                        <li key={cat.code} className="relative group/cat">
                            <div draggable onDragStart={(e) => handleWbsDragStart(e, cat.code)}>
                                <button onClick={() => setSelectedCategoryCode(cat.code)} className={`w-full text-left pl-3 pr-2 py-2 border-l-4 transition-all ${selectedCategoryCode === 'selectedCategoryCode === cat.code' ? 'bg-blue-50 border-blue-500 shadow-sm' : 'border-transparent hover:bg-slate-50'}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2"><GripVertical className="w-3 h-3 text-gray-300"/><span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded ${selectedCategoryCode === cat.code ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-600'}`}>{cat.code}</span></div>
                                        <div className="flex gap-1 opacity-0 group-hover/cat:opacity-100 transition-opacity">
                                            <button onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); setIsCategoryModalOpen(true); }} className="p-1 text-blue-400 hover:text-blue-600"><Edit2 className="w-3 h-3"/></button>
                                            <button onClick={(e) => { e.stopPropagation(); if(window.confirm("Eliminare capitolo?")) { updateState(articles.filter(a => a.categoryCode !== cat.code), categories.filter(c => c.code !== cat.code)); } }} className="p-1 text-red-300 hover:text-red-500"><Trash2 className="w-3 h-3"/></button>
                                        </div>
                                    </div>
                                    <div className="pl-5 text-xs font-medium truncate text-slate-800 mt-0.5">{cat.name}</div>
                                    <div className="pl-5 text-[10px] font-mono text-blue-600 font-bold">{formatCurrency(articles.filter(a => a.categoryCode === cat.code).reduce((s, a) => s + a.quantity * a.unitPrice, 0))}</div>
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="p-2 space-y-2">
                    {analyses.map(an => (
                        <div key={an.id} draggable onDragStart={(e) => handleAnalysisDragStart(e, an)} className="bg-white p-3 rounded border border-slate-200 shadow-sm hover:border-purple-300 transition-all cursor-grab group">
                            <div className="flex justify-between font-bold text-[10px] text-purple-700 mb-1"><span>{an.code}</span><span className="font-mono">{formatCurrency(an.totalUnitPrice)}</span></div>
                            <p className="text-[11px] text-slate-600 line-clamp-2 leading-tight">{an.description}</p>
                            <div className="mt-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setEditingAnalysis(an); setIsAnalysisEditorOpen(true); }} className="flex-1 text-[9px] bg-purple-50 text-purple-700 py-1 rounded font-bold hover:bg-purple-100">MODIFICA</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
          <div className="p-4 border-t bg-slate-50">
                <button onClick={() => { setEditingCategory(null); setIsCategoryModalOpen(true); }} className="w-full flex items-center justify-center gap-2 bg-white border border-dashed border-slate-300 text-slate-500 py-2 rounded-lg text-xs font-bold hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm"><Plus className="w-4 h-4" /> NUOVA WBS</button>
          </div>
        </div>

        {/* Content Principale */}
        <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] p-4 relative shadow-inner">
           <div className="flex-1 overflow-y-auto bg-white shadow-xl border border-gray-300 rounded-xl flex flex-col">
              {selectedCategoryCode === 'SUMMARY' ? (
                <div className="p-8 max-w-6xl mx-auto w-full animate-in fade-in duration-500"><Summary totals={totals} info={projectInfo} categories={categories} articles={articles} /></div>
              ) : activeCategory ? (
                <div className="flex flex-col h-full">
                  <div className="p-4 bg-gray-50 border-b flex items-center justify-between sticky top-0 z-30 shadow-sm">
                      <div className="flex items-center gap-3">
                          <div className="bg-white border border-slate-300 p-2 rounded shadow-sm text-center min-w-[60px]">
                              <span className="text-[10px] text-slate-400 font-bold block uppercase leading-none mb-1">WBS</span>
                              <span className="text-2xl font-black text-slate-800 leading-none">{activeCategory.code}</span>
                          </div>
                          <div>
                            <h2 className="text-lg font-bold uppercase truncate max-w-[400px] text-slate-800">{activeCategory.name}</h2>
                            <div className="text-xs text-blue-600 font-mono font-bold">{formatCurrency(articles.filter(a => a.categoryCode === activeCategory.code).reduce((s, a) => s + a.quantity * a.unitPrice, 0))}</div>
                          </div>
                      </div>
                      <div className="flex items-center gap-4 w-[450px]">
                          <div className="flex-1"><CategoryDropGate onDropContent={handleDropContent} isLoading={false} categoryCode={activeCategory.code} /></div>
                          <div className="flex gap-2">
                             <button onClick={() => setIsImportAnalysisModalOpen(true)} className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg hover:bg-purple-700 transition-all hover:scale-110" title="Aggiungi da Analisi"><TestTubes className="w-5 h-5"/></button>
                             <button onClick={() => { const nid = Math.random().toString(36).substr(2,9); updateState([...articles, { id: nid, categoryCode: activeCategory.code, code: 'NP.000', description: 'Nuova voce libera inserita a mano', unit: 'cad', unitPrice: 0, laborRate: 0, quantity: 0, measurements: [{id: Math.random().toString(36).substr(2,9), description: 'Voce nuova', type: 'positive'}] }]); }} className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg hover:bg-blue-700 transition-all hover:scale-110" title="Voce Libera"><Plus/></button>
                          </div>
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                      <table className="w-full text-left border-collapse min-w-[1000px]">
                          <TableHeader activeColumn={null}/>
                          {activeArticles.map((art, idx) => (
                            <ArticleGroup key={art.id} article={art} index={idx} allArticles={articles} onUpdateArticle={(id: any, f: any, v: any) => updateState(articles.map(a => a.id === id ? {...a, [f]: v} : a))} onEditArticleDetails={setEditingArticle} onDeleteArticle={(id: any) => window.confirm("Eliminare voce?") && updateState(articles.filter(a => a.id !== id))} onAddMeasurement={(aid: any) => updateState(articles.map(a => a.id === aid ? {...a, measurements: [...a.measurements, {id: Math.random().toString(36).substr(2,9), description: '', type: 'positive'}]} : a))} onAddSubtotal={(aid: any) => updateState(articles.map(a => a.id === aid ? {...a, measurements: [...a.measurements, {id: Math.random().toString(36).substr(2,9), description: 'Sommano parziale', type: 'subtotal'}]} : a))} onUpdateMeasurement={(aid: any, mid: any, f: any, v: any) => updateState(articles.map(a => a.id === aid ? {...a, measurements: a.measurements.map(m => m.id === mid ? {...m, [f]: v} : m)} : a))} onDeleteMeasurement={(aid: any, mid: any) => updateState(articles.map(a => a.id === aid ? {...a, measurements: a.measurements.filter(m => m.id !== mid)} : a))} onToggleDeduction={(aid: any, mid: any) => updateState(articles.map(a => a.id === aid ? {...a, measurements: a.measurements.map(m => m.id === mid ? {...m, type: m.type === 'positive' ? 'deduction' : 'positive'} : m)} : a))} onOpenLinkModal={(aid: any, mid: any) => setLinkTarget({articleId: aid, measurementId: mid})} onScrollToArticle={(id: any) => document.getElementById(`article-${id}`)?.scrollIntoView({behavior:'smooth', block: 'center'})} onArticleDragStart={(e: any, a: any) => { e.dataTransfer.setData('articleId', a.id); e.dataTransfer.effectAllowed = 'copyMove'; }} onViewAnalysis={(id: any) => { const a = analyses.find(x => x.id === id); if(a) {setEditingAnalysis(a); setIsAnalysisEditorOpen(true);}}} onToggleArticleLock={(id: any) => updateState(articles.map(a => a.id === id ? {...a, isLocked: !a.isLocked} : a))} />
                          ))}
                          {activeArticles.length === 0 && (
                            <tbody><tr><td colSpan={12} className="py-20 text-center text-slate-300 italic">Nessun contenuto in questa WBS. Trascina una voce o clicca sul + blu.</td></tr></tbody>
                          )}
                      </table>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-10 bg-slate-50/50">
                    <FolderOpen className="w-24 h-24 text-blue-100 mb-6" />
                    <h2 className="text-3xl font-black text-slate-800 uppercase tracking-widest">GeCoLa Professional</h2>
                    <p className="text-slate-500 max-w-md mt-2">Seleziona un capitolo (WBS) o visualizza il Quadro Riepilogo Generale.</p>
                </div>
              )}
           </div>
           
           {/* Floating Action Buttons */}
           <div className="absolute bottom-8 right-8 flex flex-col gap-3 print:hidden">
                <button onClick={handleUndo} disabled={history.length === 0} className="w-12 h-12 bg-white rounded-full shadow-2xl flex items-center justify-center text-slate-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-110 border border-gray-200"><Undo2 className="w-5 h-5"/></button>
                <button onClick={() => generateComputoMetricPdf(projectInfo, categories, articles)} className="w-12 h-12 bg-red-600 rounded-full shadow-2xl flex items-center justify-center text-white hover:bg-red-700 transition-all hover:scale-110" title="Esporta PDF"><FileText className="w-5 h-5"/></button>
           </div>
        </div>
      </div>

      {/* Modali */}
      <ProjectSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} info={projectInfo} onSave={(info) => {setProjectInfo(info); updateState(articles, categories, analyses);}} />
      <CategoryEditModal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} onSave={handleSaveCategory} initialData={editingCategory} nextWbsCode={generateNextWbsCode(categories)} />
      <SaveProjectModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} articles={articles} categories={categories} projectInfo={projectInfo} />
      <AnalysisEditorModal isOpen={isAnalysisEditorOpen} onClose={() => setIsAnalysisEditorOpen(false)} analysis={editingAnalysis} onSave={(an) => { let list = [...analyses]; const i = list.findIndex(x => x.id === an.id); if(i!==-1) list[i]=an; else list.push(an); updateState(articles.map(a => a.linkedAnalysisId === an.id ? {...a, description: an.description, unitPrice: roundTwoDecimals(an.totalUnitPrice)} : a), categories, list); }} />
      <ImportAnalysisModal isOpen={isImportAnalysisModalOpen} onClose={() => setIsImportAnalysisModalOpen(false)} analyses={analyses} onImport={(an) => { updateState([...articles, {id: Math.random().toString(36).substr(2,9), categoryCode: selectedCategoryCode, code: an.code, description: an.description, unit: an.unit, unitPrice: roundTwoDecimals(an.totalUnitPrice), laborRate: 0, measurements: [{id: Math.random().toString(36).substr(2,9), description: 'Import da analisi', type: 'positive'}], quantity: 0, linkedAnalysisId: an.id }]); setIsImportAnalysisModalOpen(false); }} />
      {editingArticle && <ArticleEditModal isOpen={!!editingArticle} onClose={() => setEditingArticle(null)} article={editingArticle} onSave={(id: any, up: any) => updateState(articles.map(a => a.id === id ? {...a, ...up} : a))} />}
      {linkTarget && <LinkArticleModal isOpen={!!linkTarget} onClose={() => setLinkTarget(null)} articles={articles} currentArticleId={linkTarget.articleId} onLink={(src: any, type: any) => { updateState(articles.map(a => a.id === linkTarget.articleId ? {...a, measurements: a.measurements.map(m => m.id === linkTarget.measurementId ? {...m, linkedArticleId: src.id, linkedType: type} : m)} : a)); setLinkTarget(null); }} />}
    </div>
  );
};
export default App;