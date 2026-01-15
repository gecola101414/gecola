
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
import WelcomeModal from './components/WelcomeModal';
import { parseDroppedContent, parseVoiceMeasurement, generateBulkItems, generateWbsCategories } from './services/geminiService';
import { generateComputoMetricPdf, generateElencoPrezziPdf } from './services/pdfGenerator';

// --- Helper Functions ---
const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
};

const formatNumber = (val: number | undefined) => {
    if (val === undefined || val === null || val === 0) return '';
    return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getWbsNumber = (code: string) => {
    const match = code.match(/WBS\.(\d+)/);
    return match ? parseInt(match[1], 10) : code;
};

const roundTwoDecimals = (num: number) => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

// --- Core Calculation Engine ---
const calculateRowValue = (m: Measurement, linkedValue: number = 0): number => {
  if (m.type === 'subtotal') return 0;
  if (m.linkedArticleId) {
    const mult = m.multiplier === undefined ? 1 : m.multiplier;
    return (linkedValue || 0) * mult * (m.type === 'deduction' ? -1 : 1);
  }
  const l = m.length;
  const w = m.width;
  const h = m.height;
  const factors = [l, w, h].filter(v => v !== undefined && v !== 0 && v !== null);
  const base = factors.length > 0 ? factors.reduce((a, b) => (a || 1) * (b || 1), 1) : 0;
  let effectiveMultiplier = 0;
  if (m.multiplier !== undefined) {
      effectiveMultiplier = m.multiplier;
  } else {
      if (factors.length > 0) effectiveMultiplier = 1;
      else if (m.length === undefined && m.width === undefined && m.height === undefined) effectiveMultiplier = 0;
  }
  const effectiveBase = (factors.length === 0 && effectiveMultiplier !== 0) ? 1 : base;
  const val = effectiveBase * effectiveMultiplier;
  return m.type === 'deduction' ? -val : val;
};

const resolveArticleQuantity = (
  articleId: string, 
  allArticlesMap: Map<string, Article>, 
  visited: Set<string> = new Set()
): number => {
  if (visited.has(articleId)) return 0;
  visited.add(articleId);
  const article = allArticlesMap.get(articleId);
  if (!article) return 0;
  return article.measurements.reduce((sum, m) => {
    let rowVal = 0;
    if (m.linkedArticleId) {
       const sourceQty = resolveArticleQuantity(m.linkedArticleId, allArticlesMap, new Set(visited));
       let finalSourceVal = sourceQty;
       if (m.linkedType === 'amount') {
         const sourceArt = allArticlesMap.get(m.linkedArticleId);
         if (sourceArt) finalSourceVal = sourceQty * sourceArt.unitPrice;
       }
       rowVal = calculateRowValue(m, finalSourceVal);
    } else {
       rowVal = calculateRowValue(m);
    }
    return sum + rowVal;
  }, 0);
};

const recalculateAllArticles = (articles: Article[]): Article[] => {
  const articleMap = new Map(articles.map(a => [a.id, a]));
  return articles.map(art => {
    const calculatedQty = resolveArticleQuantity(art.id, articleMap);
    return { ...art, quantity: calculatedQty };
  });
};

// --- Components ---
interface TableHeaderProps { activeColumn: string | null; }

const TableHeader: React.FC<TableHeaderProps> = ({ activeColumn }) => (
  <thead className="bg-[#f8f9fa] border-b border-black text-[9px] uppercase font-bold text-gray-800 sticky top-0 z-20 shadow-sm">
    <tr>
      <th className="py-1 px-1 text-center w-[35px] border-r border-gray-300">N.</th>
      <th className="py-1 px-1 text-left w-[100px] border-r border-gray-300">Tariffa</th>
      <th className={`py-1 px-1 text-left min-w-[250px] border-r border-gray-300 ${activeColumn === 'desc' ? 'bg-blue-50 text-blue-900' : ''}`}>Designazione dei Lavori</th>
      <th className={`py-1 px-1 text-center w-[45px] border-r border-gray-300 ${activeColumn === 'mult' ? 'bg-blue-50 text-blue-900' : ''}`}>Par.Ug</th>
      <th className={`py-1 px-1 text-center w-[55px] border-r border-gray-300 ${activeColumn === 'len' ? 'bg-blue-50 text-blue-900' : ''}`}>Lung.</th>
      <th className={`py-1 px-1 text-center w-[55px] border-r border-gray-300 ${activeColumn === 'wid' ? 'bg-blue-50 text-blue-900' : ''}`}>Largh.</th>
      <th className={`py-1 px-1 text-center w-[55px] border-r border-gray-300 ${activeColumn === 'h' ? 'bg-blue-50 text-blue-900' : ''}`}>H/Peso</th>
      <th className="py-1 px-1 text-center w-[70px] border-r border-gray-300 bg-gray-100">Quantità</th>
      <th className="py-1 px-1 text-right w-[80px] border-r border-gray-300">Prezzo €</th>
      <th className="py-1 px-1 text-right w-[90px] border-r border-gray-300">Importo €</th>
      <th className="py-1 px-1 text-right w-[80px] border-r border-gray-300">M.O. €</th>
      <th className="py-1 px-1 text-center w-[50px] print:hidden text-gray-400">Cmd</th>
    </tr>
  </thead>
);

interface ArticleGroupProps {
  article: Article; index: number; allArticles: Article[]; isPrintMode: boolean; isCategoryLocked?: boolean;
  onUpdateArticle: (id: string, field: keyof Article, value: string | number) => void;
  onEditArticleDetails: (article: Article) => void; onDeleteArticle: (id: string) => void;
  onAddMeasurement: (articleId: string) => void; onAddSubtotal: (articleId: string) => void;
  onAddVoiceMeasurement: (articleId: string, data: Partial<Measurement>) => void;
  onUpdateMeasurement: (articleId: string, mId: string, field: keyof Measurement, value: string | number | undefined) => void;
  onDeleteMeasurement: (articleId: string, mId: string) => void;
  onToggleDeduction: (articleId: string, mId: string) => void;
  onOpenLinkModal: (articleId: string, measurementId: string) => void;
  onScrollToArticle: (id: string) => void; onReorderMeasurements: (articleId: string, startIndex: number, endIndex: number) => void;
  onArticleDragStart: (e: React.DragEvent, article: Article) => void;
  onArticleDrop: (e: React.DragEvent, targetArticleId: string, position: 'top' | 'bottom') => void;
  onArticleDragEnd: () => void; lastAddedMeasurementId: string | null; onColumnFocus: (col: string | null) => void;
  onViewAnalysis: (analysisId: string) => void; onInsertExternalArticle: (index: number, text: string) => void;
  onToggleArticleLock: (id: string) => void;
}

const ArticleGroup: React.FC<ArticleGroupProps> = (props) => {
   const { article, index, allArticles, isPrintMode, isCategoryLocked, onUpdateArticle, onEditArticleDetails, onDeleteArticle, onAddMeasurement, onAddSubtotal, onAddVoiceMeasurement, onUpdateMeasurement, onDeleteMeasurement, onToggleDeduction, onOpenLinkModal, onScrollToArticle, onReorderMeasurements, onArticleDragStart, onArticleDrop, onArticleDragEnd, lastAddedMeasurementId, onColumnFocus, onViewAnalysis, onInsertExternalArticle, onToggleArticleLock } = props;
   
   const [measurementDragOverId, setMeasurementDragOverId] = useState<string | null>(null);
   const [isArticleDragOver, setIsArticleDragOver] = useState(false);
   const [articleDropPosition, setArticleDropPosition] = useState<'top' | 'bottom' | null>(null);
   const [isListening, setIsListening] = useState(false);
   const addBtnRef = useRef<HTMLButtonElement>(null);
   const recognitionRef = useRef<any>(null);

   const isArticleLocked = article.isLocked || false;
   const areControlsDisabled = isCategoryLocked || isArticleLocked;

   const getLinkedInfo = (m: Measurement) => {
     if (!m.linkedArticleId) return null;
     return allArticles.find(a => a.id === m.linkedArticleId);
   };

   const hierarchicalNumber = `${getWbsNumber(article.categoryCode)}.${index + 1}`;
   const totalAmount = article.quantity * article.unitPrice;
   const laborValue = totalAmount * (article.laborRate / 100);

   const processedMeasurements = article.measurements.map(m => {
        let val = 0;
        if (m.type !== 'subtotal') {
            if (m.linkedArticleId) {
                const linkedArt = allArticles.find(a => a.id === m.linkedArticleId);
                if (linkedArt) {
                    const baseVal = m.linkedType === 'amount' ? (linkedArt.quantity * linkedArt.unitPrice) : linkedArt.quantity;
                    val = calculateRowValue(m, baseVal);
                }
            } else val = calculateRowValue(m);
        }
        return { ...m, calculatedValue: val };
   });

   const handleArticleHeaderDragStart = (e: React.DragEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
        e.preventDefault(); return;
      }
      onArticleDragStart(e, article);
   };

   return (
      <tbody id={`article-${article.id}`} className={`bg-white border-b border-gray-400 group/article transition-colors relative ${isArticleLocked ? 'bg-gray-50' : ''}`}>
         {isArticleDragOver && articleDropPosition === 'top' && (
             <tr className="h-0"><td colSpan={12} className="p-0 border-none h-0 relative"><div className="absolute w-full h-1 bg-green-500 -top-0.5 z-50"></div></td></tr>
         )}
         <tr 
            className={`align-top ${!isPrintMode ? 'cursor-move hover:bg-slate-50' : ''}`}
            draggable={!isPrintMode && !areControlsDisabled}
            onDragStart={handleArticleHeaderDragStart}
            onDragEnd={() => onArticleDragEnd()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsArticleDragOver(true); const rect = e.currentTarget.getBoundingClientRect(); setArticleDropPosition(e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom'); }}
            onDragLeave={() => setIsArticleDragOver(false)}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsArticleDragOver(false); onArticleDrop(e, article.id, articleDropPosition || 'bottom'); }}
         >
            <td className="text-center py-2 text-xs font-bold text-gray-500 border-r border-gray-200 bg-white font-mono">{hierarchicalNumber}</td>
            <td className="p-1 border-r border-gray-200 align-top bg-white">
                <div className="flex flex-col">
                    <span className="font-mono font-bold text-xs text-purple-700">{article.code}</span>
                    {article.soaCategory && <span className="text-[9px] text-gray-400">SOA: {article.soaCategory}</span>}
                </div>
            </td>
            <td className="p-2 border-r border-gray-200 bg-white">
                <p className="text-sm text-gray-900 leading-relaxed font-serif text-justify">{article.description}</p>
                {/* Fix: Added display of grounding sources from Google Search */}
                {article.groundingUrls && article.groundingUrls.length > 0 && (
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-[10px]">
                    <p className="font-bold text-blue-800 mb-1">Fonti consultate:</p>
                    <ul className="list-disc pl-4">
                      {article.groundingUrls.map((chunk, i) => (
                        chunk.web && (
                          <li key={i}>
                            <a href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              {chunk.web.title || chunk.web.uri}
                            </a>
                          </li>
                        )
                      ))}
                    </ul>
                  </div>
                )}
            </td>
            <td colSpan={8} className="bg-white border-r border-gray-200"></td>
            <td className="text-center pt-2 print:hidden bg-gray-50/30">
                <div className="flex flex-col items-center gap-1 opacity-0 group-hover/article:opacity-100 transition-opacity">
                    <button onClick={() => onToggleArticleLock(article.id)} className="p-1 text-gray-300 hover:text-blue-600">{article.isLocked ? <Lock className="w-3.5 h-3.5 text-red-500" /> : <Unlock className="w-3.5 h-3.5" />}</button>
                    <button onClick={() => onEditArticleDetails(article)} className="p-1 text-gray-300 hover:text-blue-600"><PenLine className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onDeleteArticle(article.id)} className="p-1 text-gray-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
            </td>
         </tr>
         {processedMeasurements.map((m, idx) => (
            <tr key={m.id} className={`text-xs ${m.type === 'subtotal' ? 'bg-yellow-50' : 'bg-white'}`}>
                <td className="border-r border-gray-200"></td><td className="border-r border-gray-200"></td>
                <td className="pl-6 pr-2 py-1 border-r border-gray-200">
                    <input value={m.description} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'description', e.target.value)} className="w-full bg-transparent border-none p-0 focus:ring-0 text-gray-700" placeholder="Misura..." disabled={areControlsDisabled} />
                </td>
                <td className="border-r border-gray-200 text-center bg-gray-50"><input type="number" value={m.multiplier || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'multiplier', parseFloat(e.target.value))} className="w-full bg-transparent text-center border-none p-0" placeholder="1" disabled={areControlsDisabled} /></td>
                <td className="border-r border-gray-200 text-center bg-gray-50"><input type="number" value={m.length || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'length', parseFloat(e.target.value))} className="w-full bg-transparent text-center border-none p-0" disabled={areControlsDisabled} /></td>
                <td className="border-r border-gray-200 text-center bg-gray-50"><input type="number" value={m.width || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'width', parseFloat(e.target.value))} className="w-full bg-transparent text-center border-none p-0" disabled={areControlsDisabled} /></td>
                <td className="border-r border-gray-200 text-center bg-gray-50"><input type="number" value={m.height || ''} onChange={(e) => onUpdateMeasurement(article.id, m.id, 'height', parseFloat(e.target.value))} className="w-full bg-transparent text-center border-none p-0" disabled={areControlsDisabled} /></td>
                <td className="border-r border-gray-200 text-right pr-1 font-mono">{formatNumber(m.calculatedValue)}</td>
                <td colSpan={4} className="bg-gray-50/30"></td>
            </tr>
         ))}
         <tr className="bg-white font-bold text-xs border-t border-gray-300">
             <td colSpan={2} className="border-r border-gray-200"></td>
             <td className="px-2 py-2 text-right border-r border-gray-300 uppercase text-gray-500">Sommano {article.unit}</td>
             <td colSpan={4} className="border-r border-gray-200"></td>
             <td className="text-right pr-1 font-mono border-r border-gray-200">{formatNumber(article.quantity)}</td>
             <td className="text-right pr-1 font-mono border-r border-gray-200">{formatNumber(article.unitPrice)}</td>
             <td className="text-right pr-1 font-mono text-blue-900 border-r border-gray-200">{formatNumber(totalAmount)}</td>
             <td className="text-right pr-1 font-mono text-gray-500 border-r border-gray-200">{formatCurrency(laborValue)}</td>
             <td className="text-center print:hidden bg-gray-50">
                 <button onClick={() => onAddMeasurement(article.id)} className="p-1 text-blue-600 hover:bg-blue-100 rounded-full" disabled={areControlsDisabled}><Plus className="w-4 h-4" /></button>
             </td>
         </tr>
      </tbody>
   );
};

// Fix: Added missing ViewMode type definition to resolve compilation error on line 250
type ViewMode = 'COMPUTO' | 'ANALISI';

const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('COMPUTO');
  const [categories, setCategories] = useState<Category[]>(CATEGORIES);
  const [articles, setArticles] = useState<Article[]>(INITIAL_ARTICLES);
  const [analyses, setAnalyses] = useState<PriceAnalysis[]>(INITIAL_ANALYSES);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(PROJECT_INFO);
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>(CATEGORIES[0]?.code || 'WBS.01');
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(true);
  const [draggedCategoryCode, setDraggedCategoryCode] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isEditArticleModalOpen, setIsEditArticleModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [isImportAnalysisModalOpen, setIsImportAnalysisModalOpen] = useState(false);
  const [isAnalysisEditorOpen, setIsAnalysisEditorOpen] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState<PriceAnalysis | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
  const [activeSoaCategory, setActiveSoaCategory] = useState<string>('OG1');

  useEffect(() => {
    if (!auth) { setAuthLoading(false); return; }
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); if(u) setIsWelcomeOpen(false); });
  }, []);

  // MIRACOLO: Global Drag Over per abilitare drop tra schede
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    window.addEventListener('dragover', (e) => handleGlobalDragOver(e as unknown as DragEvent));
    return () => window.removeEventListener('dragover', (e) => handleGlobalDragOver(e as unknown as DragEvent));
  }, []);

  const updateState = (newArticles: Article[], newCats = categories, newAn = analyses) => {
      setArticles(recalculateAllArticles(newArticles));
      setCategories(newCats);
      setAnalyses(newAn);
  };

  const handleWbsDragStart = (e: React.DragEvent, code: string) => {
      setDraggedCategoryCode(code);
      // TRUCCO: Aggiungiamo un finto URL per forzare il Tab Switch del browser
      e.dataTransfer.setData('text/uri-list', window.location.href);
      const cat = categories.find(c => c.code === code);
      if (cat) {
          const catArticles = articles.filter(a => a.categoryCode === code);
          const relatedAnalyses = analyses.filter(an => catArticles.some(art => art.linkedAnalysisId === an.id));
          const bundle = { type: 'CROSS_TAB_WBS_BUNDLE', category: cat, articles: catArticles, analyses: relatedAnalyses };
          e.dataTransfer.setData('text/plain', JSON.stringify(bundle));
      }
      e.dataTransfer.effectAllowed = 'all';
  };

  const handleWbsDrop = (e: React.DragEvent, targetCode: string | null) => {
      e.preventDefault();
      const textData = e.dataTransfer.getData('text/plain');
      if (textData) {
          try {
              const payload = JSON.parse(textData);
              if (payload && payload.type === 'CROSS_TAB_WBS_BUNDLE') {
                  const { category: impCat, articles: impArts, analyses: impAn } = payload;
                  const newCode = `WBS.${(categories.length + 1).toString().padStart(2, '0')}`;
                  const newCat = { ...impCat, code: newCode, name: impCat.name + " (Copia)" };
                  
                  // Rigenerazione ID per indipendenza
                  const idMap = new Map();
                  const anMap = new Map();
                  const newAnList = [...analyses];
                  
                  impAn.forEach((an: any) => {
                      const newAnId = Math.random().toString(36).substr(2, 9);
                      anMap.set(an.id, newAnId);
                      newAnList.push({ ...an, id: newAnId });
                  });

                  const newArts = impArts.map((art: any) => {
                      const newArtId = Math.random().toString(36).substr(2, 9);
                      return { 
                          ...art, 
                          id: newArtId, 
                          categoryCode: newCode, 
                          linkedAnalysisId: anMap.get(art.linkedAnalysisId) || art.linkedAnalysisId,
                          measurements: art.measurements.map((m: any) => ({ ...m, id: Math.random().toString(36).substr(2, 9) }))
                      };
                  });

                  updateState([...articles, ...newArts], [...categories, newCat], newAnList);
                  setSelectedCategoryCode(newCode);
              }
          } catch (e) { console.error("Drop Error", e); }
      }
      setDraggedCategoryCode(null);
  };

  const totals: Totals = useMemo(() => {
    const totalWorks = articles.reduce((acc, a) => acc + (a.quantity * a.unitPrice), 0);
    const safetyCosts = totalWorks * (projectInfo.safetyRate / 100);
    const totalTaxable = totalWorks + safetyCosts;
    const vatAmount = totalTaxable * (projectInfo.vatRate / 100);
    return { totalWorks, safetyCosts, totalTaxable, vatAmount, grandTotal: totalTaxable + vatAmount };
  }, [articles, projectInfo]);

  const handleWelcomeComplete = async (info: ProjectInfo, description?: string) => {
      setProjectInfo(info);
      if (description) {
          setIsGenerating(true);
          const newWbs = await generateWbsCategories(description);
          if (newWbs.length > 0) {
              setCategories(newWbs);
              setSelectedCategoryCode(newWbs[0].code);
          }
          setIsGenerating(false);
      }
      setIsWelcomeOpen(false);
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Caricamento...</div>;
  if (!user && auth) return <Login />;

  const activeArticles = articles.filter(a => a.categoryCode === selectedCategoryCode);
  const activeCategory = categories.find(c => c.code === selectedCategoryCode);

  return (
    <div className="h-screen flex flex-col bg-[#e8eaed] font-sans overflow-hidden text-slate-800">
      <div className="bg-[#2c3e50] shadow-md z-50 h-14 flex items-center justify-between px-6 border-b border-slate-600">
          <div className="flex items-center space-x-3 w-64">
            <div className="bg-orange-500 p-1.5 rounded-lg"><Calculator className="w-5 h-5 text-white" /></div>
            <span className="font-bold text-lg text-white">GeCoLa Pro</span>
          </div>
          <div className="flex-1 px-6 flex justify-center">
              <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-1 rounded-full border border-slate-700 text-white font-bold text-sm cursor-pointer" onClick={() => setIsSettingsModalOpen(true)}>
                  {projectInfo.title} <Edit3 className="w-3 h-3" />
              </div>
          </div>
          <div className="flex items-center space-x-3">
             <button onClick={() => setIsPrintMenuOpen(!isPrintMenuOpen)} className="p-1.5 text-slate-300 hover:text-white relative"><FileText className="w-5 h-5" />
                {isPrintMenuOpen && (<div className="absolute right-0 top-full mt-2 w-48 bg-white shadow-xl rounded-lg py-2 z-50"><button onClick={() => generateComputoMetricPdf(projectInfo, categories, articles)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50">Computo Metrico</button></div>)}
             </button>
             <button onClick={() => signOut(auth)} className="p-1.5 text-red-400 hover:text-white"><LogOut className="w-5 h-5" /></button>
          </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 bg-white border-r border-slate-300 flex flex-col shadow-lg z-10">
          <div className="p-3 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase flex justify-between items-center">
              <span>WBS Progetto</span>
              <button onClick={() => setViewMode('COMPUTO')} className="text-blue-600"><PlusCircle className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={(e) => handleWbsDrop(e, null)}>
              {categories.map(cat => (
                  <div key={cat.code} draggable onDragStart={(e) => handleWbsDragStart(e, cat.code)} onDrop={(e) => handleWbsDrop(e, cat.code)} className={`p-3 border-l-4 cursor-pointer hover:bg-slate-50 transition-all ${selectedCategoryCode === cat.code ? 'bg-blue-50 border-blue-500' : 'border-transparent'}`} onClick={() => setSelectedCategoryCode(cat.code)}>
                      <div className="flex items-center gap-2"><span className="text-[10px] font-mono font-bold bg-slate-200 px-1 rounded">{cat.code}</span></div>
                      <span className="text-xs font-medium block truncate mt-1">{cat.name}</span>
                  </div>
              ))}
              <div className="mt-auto p-3 border-t bg-slate-50" onClick={() => setSelectedCategoryCode('SUMMARY')}>
                  <button className={`w-full flex items-center p-2 rounded text-xs font-bold ${selectedCategoryCode === 'SUMMARY' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500'}`}><Layers className="w-4 h-4 mr-2" /> Riepilogo</button>
              </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-[#f0f2f5]">
           <div className="bg-white rounded-xl shadow-lg border border-gray-300 min-h-full">
              {selectedCategoryCode === 'SUMMARY' ? (
                  <div className="p-8"><Summary totals={totals} info={projectInfo} categories={categories} articles={articles} /></div>
              ) : activeCategory ? (
                  <div>
                      <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                          <h2 className="text-xl font-black text-gray-800 uppercase">{activeCategory.code} - {activeCategory.name}</h2>
                          <button onClick={() => setIsImportAnalysisModalOpen(true)} className="bg-blue-600 text-white p-2 rounded-full shadow-lg"><Plus className="w-5 h-5" /></button>
                      </div>
                      <table className="w-full text-left">
                          <TableHeader activeColumn={null} />
                          {activeArticles.map((art, idx) => (
                              <ArticleGroup key={art.id} article={art} index={idx} allArticles={articles} isPrintMode={false} onUpdateArticle={() => {}} onEditArticleDetails={setEditingArticle} onDeleteArticle={() => {}} onAddMeasurement={() => {}} onAddSubtotal={() => {}} onAddVoiceMeasurement={() => {}} onUpdateMeasurement={() => {}} onDeleteMeasurement={() => {}} onToggleDeduction={() => {}} onOpenLinkModal={() => {}} onScrollToArticle={() => {}} onReorderMeasurements={() => {}} onArticleDragStart={() => {}} onArticleDrop={() => {}} onArticleDragEnd={() => {}} lastAddedMeasurementId={null} onColumnFocus={() => {}} onViewAnalysis={() => {}} onInsertExternalArticle={() => {}} onToggleArticleLock={() => {}} />
                          ))}
                      </table>
                  </div>
              ) : null}
           </div>
        </div>
      </div>
      
      <WelcomeModal isOpen={isWelcomeOpen} onComplete={handleWelcomeComplete} isLoading={isGenerating} />
      <ProjectSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} info={projectInfo} onSave={setProjectInfo} />
      {editingArticle && <ArticleEditModal isOpen={!!editingArticle} onClose={() => setEditingArticle(null)} article={editingArticle} onSave={() => {}} />}
      <ImportAnalysisModal isOpen={isImportAnalysisModalOpen} onClose={() => setIsImportAnalysisModalOpen(false)} analyses={analyses} onImport={() => {}} />
    </div>
  );
};

export default App;