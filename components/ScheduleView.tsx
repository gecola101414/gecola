import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Category, Article, ProjectInfo } from '../types';
import { Calendar, Clock, MoveHorizontal, Info, HardHat, ZoomIn, ZoomOut, FileDown, Layers, ChevronDown, GripVertical, Coins, TrendingUp, X, FileText, Award, Users, Plus, Minus, PenTool } from 'lucide-react';
import { VIVID_COLORS } from '../constants';
import { generateScheduleA3Pdf } from '../services/pdfGenerator';

interface ScheduleViewProps {
  categories: Category[];
  articles: Article[];
  projectInfo: ProjectInfo;
  offsets: Record<string, number>;
  teamSizes: Record<string, number>;
  onOffsetChange: (catId: string, days: number) => void;
  onTeamSizeChange: (catId: string, size: number) => void;
  onReorderCategories: (newCategories: Category[]) => void;
}

// Parametro di produzione: 240€ di manodopera prodotta al giorno da un operaio (Uniformato a Summary)
const PRODUCTION_PER_MAN = 240; 
// Incremento forfettario per condimeteo e imprevisti (Patto di Ferro)
const WEATHER_BUFFER_FACTOR = 1.10;

const isWeekend = (day: number) => {
  const mod = day % 7;
  return mod === 6 || mod === 0;
};

const getCalendarBounds = (workingOffset: number, workingDuration: number) => {
  let wDaysFound = 0;
  let currentDay = 1;

  while (wDaysFound < workingOffset) {
    if (!isWeekend(currentDay)) {
      wDaysFound++;
    }
    currentDay++;
  }
  while (isWeekend(currentDay)) {
    currentDay++;
  }
  const calendarStart = currentDay;

  let wDaysDuration = 0;
  let calendarEnd = calendarStart;
  while (wDaysDuration < workingDuration) {
    if (!isWeekend(calendarEnd)) {
      wDaysDuration++;
    }
    if (wDaysDuration < workingDuration) calendarEnd++;
  }

  return { calendarStart, calendarEnd, calendarDuration: (calendarEnd - calendarStart) + 1 };
};

const ScheduleView: React.FC<ScheduleViewProps> = ({ categories, articles, projectInfo, offsets, teamSizes, onOffsetChange, onTeamSizeChange, onReorderCategories }) => {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  const [dayWidth, setDayWidth] = useState(45); 
  const [isDraggingBar, setIsDraggingBar] = useState<string | null>(null);
  const [startX, setStartX] = useState(0);
  const [initialOffset, setInitialOffset] = useState(0);

  const [draggedWbsId, setDraggedWbsId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'top' | 'bottom' | null>(null);

  const [selectedWbsId, setSelectedWbsId] = useState<string | null>(null);

  const isSyncingRef = useRef(false);

  const handleSidebarScroll = () => {
    if (!sidebarRef.current || !timelineRef.current || isSyncingRef.current) return;
    isSyncingRef.current = true;
    timelineRef.current.scrollTop = sidebarRef.current.scrollTop;
    requestAnimationFrame(() => { isSyncingRef.current = false; });
  };

  const handleTimelineScroll = () => {
    if (!sidebarRef.current || !timelineRef.current || isSyncingRef.current) return;
    isSyncingRef.current = true;
    sidebarRef.current.scrollTop = timelineRef.current.scrollTop;
    requestAnimationFrame(() => { isSyncingRef.current = false; });
  };

  const scheduleData = useMemo(() => {
    let cumulativeWorkingDay = 0;
    
    return categories
      .filter(c => !c.isSuperCategory && c.isEnabled !== false)
      .map((cat, idx) => {
        const catArticles = articles.filter(a => a.categoryCode === cat.code);
        const totalWorks = catArticles.reduce((sum, a) => sum + (a.quantity * a.unitPrice), 0);
        const totalLabor = catArticles.reduce((sum, a) => {
            const itemTotal = a.quantity * a.unitPrice;
            return sum + (itemTotal * (a.laborRate / 100));
        }, 0);
        
        const teamSize = teamSizes[cat.id] || 2;
        // Calcolo durata con incremento 10% (Patto di Ferro)
        const duration = Math.max(1, Math.ceil((totalLabor / (PRODUCTION_PER_MAN * teamSize)) * WEATHER_BUFFER_FACTOR));
        
        const workingOffset = offsets[cat.id] !== undefined ? offsets[cat.id] : cumulativeWorkingDay;
        const { calendarStart, calendarEnd, calendarDuration } = getCalendarBounds(workingOffset, duration);
        const barColor = cat.color || VIVID_COLORS[idx % VIVID_COLORS.length];
        
        cumulativeWorkingDay = workingOffset + duration;

        return {
            ...cat,
            totalWorks,
            totalLabor,
            duration, 
            workingOffset,
            calendarStart,
            calendarEnd,
            calendarDuration,
            barColor,
            teamSize
        };
      })
      .filter(d => d.totalLabor > 0.01);
  }, [categories, articles, offsets, teamSizes]);

  const maxCalendarDays = useMemo(() => {
    const lastDay = scheduleData.reduce((max, d) => Math.max(max, d.calendarEnd), 60);
    return Math.max(lastDay + 30, 60); 
  }, [scheduleData]);

  const daysArray = Array.from({ length: maxCalendarDays }, (_, i) => i + 1);

  const handleBarMouseDown = (e: React.MouseEvent, catId: string) => {
    e.stopPropagation();
    setIsDraggingBar(catId);
    setStartX(e.clientX);
    const currentData = scheduleData.find(d => d.id === catId);
    setInitialOffset(currentData?.workingOffset || 0);
  };

  const handleWbsOpenDossier = (catId: string) => {
      setSelectedWbsId(catId);
  };

  const handleWbsFocusInTimeline = (cat: any) => {
      if (!timelineRef.current) return;
      const targetX = (cat.calendarStart - 1) * dayWidth;
      timelineRef.current.scrollTo({
          left: Math.max(0, targetX - 100),
          behavior: 'smooth'
      });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingBar) return;
      const deltaX = e.clientX - startX;
      const deltaWorkingDays = Math.round(deltaX / dayWidth);
      const newOffset = Math.max(0, initialOffset + deltaWorkingDays);
      if (newOffset !== offsets[isDraggingBar]) {
        onOffsetChange(isDraggingBar, newOffset);
      }
    };
    const handleMouseUp = () => setIsDraggingBar(null);
    if (isDraggingBar) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingBar, startX, initialOffset, dayWidth, onOffsetChange, offsets]);

  const handleWbsDragStart = (e: React.DragEvent, id: string) => {
    setDraggedWbsId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleWbsDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedWbsId === id) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    setDropPosition(e.clientY < midPoint ? 'top' : 'bottom');
    setDropTargetId(id);
  };

  const handleWbsDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedWbsId || draggedWbsId === targetId) return;

    const sourceIdx = categories.findIndex(c => c.id === draggedWbsId);
    if (sourceIdx === -1) return;

    const newCategories = [...categories];
    const [movedCat] = newCategories.splice(sourceIdx, 1);
    
    let targetIdx = newCategories.findIndex(c => c.id === targetId);
    if (dropPosition === 'bottom') targetIdx++;
    
    newCategories.splice(Math.max(0, targetIdx), 0, movedCat);
    onReorderCategories(newCategories);
    
    setDraggedWbsId(null);
    setDropTargetId(null);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);
  };

  const selectedWbsData = useMemo(() => {
    return scheduleData.find(d => d.id === selectedWbsId);
  }, [selectedWbsId, scheduleData]);

  const headerHeight = 48; 
  const rowHeight = 80;   

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white animate-in fade-in duration-500 overflow-hidden relative">
      
      {/* MODALE SCHEDA DETTAGLIO WBS */}
      {selectedWbsData && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
                  <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white border-b border-slate-800">
                      <div className="flex items-center gap-4">
                          <div className="p-2.5 rounded-xl shadow-lg" style={{ backgroundColor: selectedWbsData.barColor }}>
                              <Layers className="w-5 h-5 text-white" />
                          </div>
                          <div>
                              <h3 className="text-lg font-black uppercase tracking-tight italic leading-none">{selectedWbsData.code}</h3>
                              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Dossier Tecnico Attività</p>
                          </div>
                      </div>
                      <button onClick={() => setSelectedWbsId(null)} className="p-1.5 hover:bg-white/10 rounded-full transition-all">
                          <X className="w-5 h-5 text-slate-400" />
                      </button>
                  </div>
                  
                  <div className="p-6 space-y-6 bg-slate-50">
                      <div>
                          <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Descrizione WBS</label>
                          <p className="text-slate-800 font-black text-base leading-tight uppercase italic">{selectedWbsData.name}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                              <div className="flex items-center gap-2 mb-2">
                                  <Coins className="w-3.5 h-3.5 text-blue-600" />
                                  <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Valore Lavori</span>
                              </div>
                              <p className="text-lg font-mono font-black text-slate-900">{formatCurrency(selectedWbsData.totalWorks)}</p>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                              <div className="flex items-center gap-2 mb-2">
                                  <HardHat className="w-3.5 h-3.5 text-orange-500" />
                                  <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Netto Manodopera</span>
                              </div>
                              <p className="text-lg font-mono font-black text-slate-900">{formatCurrency(selectedWbsData.totalLabor)}</p>
                          </div>
                      </div>

                      {/* GESTIONE SQUADRA TIPO */}
                      <div className="bg-white p-5 rounded-[2rem] border border-blue-100 shadow-md flex items-center justify-between">
                          <div className="flex items-center gap-3">
                              <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                                  <Users className="w-5 h-5" />
                              </div>
                              <div>
                                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Configurazione Forza Lavoro</span>
                                  <h4 className="text-sm font-black text-slate-800 uppercase italic">Squadra Tipo (Sq.)</h4>
                              </div>
                          </div>
                          <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                              <button 
                                onClick={() => onTeamSizeChange(selectedWbsData.id, Math.max(1, selectedWbsData.teamSize - 1))}
                                className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-600 transition-all active:scale-90"
                              >
                                  <Minus className="w-4 h-4" />
                              </button>
                              <span className="text-xl font-black font-mono text-slate-900 w-8 text-center">{selectedWbsData.teamSize}</span>
                              <button 
                                onClick={() => onTeamSizeChange(selectedWbsData.id, Math.min(10, selectedWbsData.teamSize + 1))}
                                className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-green-600 transition-all active:scale-90"
                              >
                                  <Plus className="w-4 h-4" />
                              </button>
                          </div>
                      </div>

                      <div className="bg-indigo-900 rounded-2xl p-5 text-white relative overflow-hidden shadow-xl">
                          <div className="absolute top-0 right-0 p-2 opacity-10">
                              <TrendingUp className="w-16 h-16" />
                          </div>
                          <div className="relative z-10">
                              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-indigo-300">Indice di Incidenza Operativa</span>
                              <div className="flex items-baseline gap-2 mt-1">
                                  <span className="text-3xl font-black font-mono">
                                      {selectedWbsData.totalWorks > 0 ? ((selectedWbsData.totalLabor / selectedWbsData.totalWorks) * 100).toFixed(1) : "0.0"}%
                                  </span>
                                  <span className="text-[10px] font-bold uppercase text-indigo-400">Incidenza M.O.</span>
                              </div>
                          </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                          <div className="flex flex-col items-center p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                              <Clock className="w-3.5 h-3.5 text-slate-400 mb-1.5" />
                              <span className="text-[7px] font-black uppercase text-slate-400 mb-1">Durata Prevista</span>
                              <span className="text-xs font-black text-slate-800">{selectedWbsData.duration} GG</span>
                          </div>
                          <div className="flex flex-col items-center p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                              <Calendar className="w-3.5 h-3.5 text-slate-400 mb-1.5" />
                              <span className="text-[7px] font-black uppercase text-slate-400 mb-1">Inizio</span>
                              <span className="text-xs font-black text-slate-800">Giorno {selectedWbsData.calendarStart}</span>
                          </div>
                          <div className="flex flex-col items-center p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                              <Award className="w-3.5 h-3.5 text-slate-400 mb-1.5" />
                              <span className="text-[7px] font-black uppercase text-slate-400 mb-1">Fine</span>
                              <span className="text-xs font-black text-slate-800">Giorno {selectedWbsData.calendarEnd}</span>
                          </div>
                      </div>
                  </div>
                  
                  <div className="p-4 bg-white border-t border-slate-100 flex justify-center">
                      <button onClick={() => setSelectedWbsId(null)} className="px-10 py-2.5 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">
                          Conferma e Chiudi
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Top Bar - Controls */}
      <div className="p-6 bg-slate-800 border-b border-slate-700 flex justify-between items-center shrink-0 shadow-2xl relative z-50">
        <div className="flex items-center gap-6">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-700 p-4 rounded-[1.8rem] shadow-xl ring-2 ring-blue-400/20">
            <Calendar className="w-10 h-10 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tighter italic text-transparent bg-clip-text bg-gradient-r from-white to-slate-400">Chronos Gantt v2.8</h2>
            <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-blue-400 font-black uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 italic">Forza Lavoro Sq. Attiva • Buffer 10% Integrato</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em]">Produzione/Operaio: € 240,00 / GIORNO</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
            <div className="bg-slate-900/80 px-6 py-3 rounded-2xl border border-slate-700 flex items-center gap-4 shadow-inner">
                <ZoomOut className="w-4 h-4 text-slate-500" />
                <input 
                    type="range" min="15" max="120" value={dayWidth} 
                    onChange={(e) => setDayWidth(parseInt(e.target.value))}
                    className="w-48 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <ZoomIn className="w-4 h-4 text-blue-400" />
            </div>
            <button 
                onClick={() => generateScheduleA3Pdf(projectInfo, scheduleData, maxCalendarDays)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-xl flex items-center gap-3 transition-all active:scale-95 group"
            >
                <FileDown className="w-5 h-5" /> Esporta A3
            </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar (WBS List) */}
        <div className="w-[420px] flex flex-col border-r border-slate-700 bg-slate-800/80 shrink-0 z-40 shadow-[10px_0_30px_rgba(0,0,0,0.3)]">
          <div style={{ height: headerHeight }} className="border-b border-slate-700 bg-slate-900/50 flex items-center px-6 sticky top-0 z-10 shrink-0">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                <Layers className="w-3 h-3" /> WBS & PIANIFICAZIONE
            </span>
          </div>
          <div 
            ref={sidebarRef}
            onScroll={handleSidebarScroll}
            className="flex-1 overflow-y-auto scrollbar-hide scroll-smooth"
          >
            {scheduleData.map(cat => (
              <div 
                key={cat.id} 
                draggable
                onDragStart={(e) => handleWbsDragStart(e, cat.id)}
                onDragOver={(e) => handleWbsDragOver(e, cat.id)}
                onDrop={(e) => handleWbsDrop(e, cat.id)}
                onDragEnd={() => { setDraggedWbsId(null); setDropTargetId(null); }}
                onClick={() => handleWbsFocusInTimeline(cat)}
                onDoubleClick={() => handleWbsOpenDossier(cat.id)}
                style={{ height: rowHeight }}
                className={`border-b border-slate-700/50 flex items-center px-6 group hover:bg-slate-700/30 transition-all relative cursor-pointer ${draggedWbsId === cat.id ? 'opacity-20 grayscale bg-blue-900/20' : ''}`}
              >
                {dropTargetId === cat.id && (
                    <div className={`absolute left-0 right-0 h-1 bg-blue-500 z-50 shadow-[0_0_15px_rgba(59,130,246,1)] ${dropPosition === 'top' ? 'top-0' : 'bottom-0'}`} />
                )}
                <div className="flex items-center gap-4 w-full pointer-events-none">
                    <GripVertical className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0" />
                    <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded shadow-sm text-white`} style={{ backgroundColor: cat.barColor }}>{cat.code}</span>
                                <span className="text-[10px] text-slate-300 font-black truncate uppercase tracking-tighter max-w-[180px]">{cat.name}</span>
                            </div>
                            {/* COLONNA Sq. */}
                            <div className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded-lg flex items-center gap-1.5">
                                <Users className="w-2.5 h-2.5 text-blue-400" />
                                <span className="text-[9px] font-black text-blue-300">Sq.:{cat.teamSize}</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-black text-white/80 font-mono tracking-tight">{new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cat.totalLabor)}</span>
                                <span className="text-[7px] text-slate-500 uppercase font-black tracking-widest">Valore Manodopera</span>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-700 shadow-inner">
                                <Clock className="w-3 h-3 text-orange-500" />
                                <span className="text-xs font-black text-orange-400 font-mono">{cat.duration} GG LAV.</span>
                            </div>
                        </div>
                    </div>
                </div>
              </div>
            ))}
            <div className="h-40" />
          </div>
        </div>

        {/* Timeline Chart Area */}
        <div 
            ref={timelineRef}
            onScroll={handleTimelineScroll}
            className="flex-1 overflow-auto bg-slate-950 custom-scrollbar scroll-smooth"
        >
          <div style={{ width: maxCalendarDays * dayWidth }} className="min-h-full flex flex-col relative">
            
            {/* Header Giorni (Sticky) */}
            <div style={{ height: headerHeight }} className="border-b border-slate-700 bg-slate-900 flex sticky top-0 z-30 shadow-md shrink-0">
              {daysArray.map(day => {
                const weekend = isWeekend(day);
                return (
                  <div 
                    key={day} 
                    style={{ width: dayWidth }} 
                    className={`h-full border-r border-slate-800/50 flex flex-col items-center justify-center flex-shrink-0 ${weekend ? 'bg-slate-800/60' : ''}`}
                  >
                    <span className={`text-[11px] font-black font-mono ${weekend ? 'text-red-400/40' : 'text-slate-400'}`}>{day}</span>
                    {dayWidth > 50 && <span className="text-[6px] text-slate-600 font-black uppercase mt-0.5">{weekend ? 'OFF' : 'WORK'}</span>}
                  </div>
                );
              })}
            </div>

            {/* Grid & Bars Container */}
            <div className="relative flex-1">
                {/* Sfondo Weekend */}
                <div className="absolute top-0 bottom-0 left-0 right-0 flex pointer-events-none z-0">
                    {daysArray.map(day => {
                        const weekend = isWeekend(day);
                        return (
                            <div 
                                key={day} 
                                style={{ width: dayWidth }} 
                                className={`h-full border-r border-slate-800/20 shrink-0 ${weekend ? 'bg-black/30 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.02)_5px,rgba(255,255,255,0.02)_10px)]' : ''}`}
                            />
                        );
                    })}
                </div>

                {/* Barre Gantt */}
                <div className="relative z-10">
                    {scheduleData.map(cat => (
                        <div 
                            key={cat.id} 
                            style={{ height: rowHeight }}
                            className="border-b border-slate-700/10 flex items-center relative group"
                        >
                            <div className="absolute inset-0 bg-white/[0.01] pointer-events-none group-hover:bg-white/[0.03]" />
                            
                            <div 
                                onMouseDown={(e) => handleBarMouseDown(e, cat.id)}
                                onDoubleClick={() => handleWbsOpenDossier(cat.id)}
                                style={{ 
                                    left: (cat.calendarStart - 1) * dayWidth, 
                                    width: cat.calendarDuration * dayWidth,
                                    backgroundColor: cat.barColor + 'dd',
                                    borderColor: cat.barColor
                                }}
                                className={`absolute h-9 rounded-lg cursor-pointer transition-shadow flex items-center px-4 shadow-[0_10px_25px_rgba(0,0,0,0.5)] border-2 hover:brightness-110 active:scale-[0.98] ${isDraggingBar === cat.id ? 'ring-4 ring-white/20 z-30 scale-105' : 'z-20'}`}
                            >
                                {/* Marker Triangolo WinProject (Angolo Vivo) */}
                                <div 
                                    style={{ borderTopColor: cat.barColor }}
                                    className="absolute top-full left-0 w-0 h-0 border-t-[12px] border-r-[12px] border-r-transparent drop-shadow-lg"
                                />
                                <div 
                                    style={{ borderTopColor: cat.barColor }}
                                    className="absolute top-full right-0 w-0 h-0 border-t-[12px] border-l-[12px] border-l-transparent drop-shadow-lg"
                                />

                                <div className="flex items-center justify-between w-full overflow-hidden pointer-events-none">
                                    <div className="flex items-center gap-2">
                                        <MoveHorizontal className="w-3 h-3 text-white/40" />
                                        <span className="text-[10px] font-black uppercase text-white truncate drop-shadow-md tracking-tighter">
                                            {dayWidth > 40 ? `${cat.code} - ${cat.name}` : cat.code}
                                        </span>
                                    </div>
                                    <div className="bg-black/30 rounded px-1.5 py-0.5 shrink-0 ml-2 border border-white/5 flex items-center gap-1.5">
                                        <Users className="w-2.5 h-2.5 text-blue-400" />
                                        <span className="text-[9px] font-black text-white font-mono">{cat.duration}d</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    <div className="h-40" />
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend Footer */}
      <div className="p-4 bg-slate-800 border-t border-slate-700 flex flex-col md:flex-row justify-between items-center shrink-0 shadow-2xl gap-6">
          <div className="flex flex-wrap items-center gap-6 px-4">
              <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-slate-900 border border-slate-600 rounded-lg shadow-inner"></div>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Produzione Attiva</span>
              </div>
              <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-slate-800 border border-slate-600 rounded-lg flex items-center justify-center overflow-hidden">
                      <div className="w-full h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(255,255,255,0.05)_2px,rgba(255,255,255,0.05)_4px)]" />
                  </div>
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Sospensione Weekend</span>
              </div>
              <div className="h-4 w-px bg-slate-700 mx-2 hidden md:block" />
              <div className="flex items-center gap-3">
                  <ChevronDown className="w-4 h-4 text-blue-400" strokeWidth={4} />
                  <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest italic">Squadra Sq.: Default 2</span>
              </div>
          </div>

          {/* FIRMA DEL PROGETTISTA NEL CRONOPROGRAMMA UI */}
          <div className="flex items-center gap-8 bg-slate-900/50 px-6 py-3 rounded-2xl border border-slate-700">
              <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <Calendar className="w-3 h-3" />
                      <span className="text-[8px] font-black uppercase tracking-widest">Data Emissione</span>
                  </div>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">{projectInfo.date}</span>
              </div>
              <div className="w-px h-8 bg-slate-700" />
              <div className="flex flex-col items-center">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <PenTool className="w-3 h-3" />
                      <span className="text-[8px] font-black uppercase tracking-widest">Il Progettista</span>
                  </div>
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-tight italic">{projectInfo.designer}</span>
              </div>
          </div>
      </div>
    </div>
  );
};

export default ScheduleView;