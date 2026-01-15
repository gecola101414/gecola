
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { AppState, PlanningNeed, User, UserRole, Attachment, PlanningList } from '../types';
import { VoiceInput } from './VoiceInput';
// @ts-ignore
import { jsPDF } from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

interface PlanningModuleProps {
  state: AppState;
  activeListId: string | null;
  onSetActiveListId: (id: string | null) => void;
  onUpdate: (updates: Partial<AppState>, log?: { action: string, details: string, relatedId?: string }) => void;
  currentUser: User;
  globalFilter: 'mine' | 'all';
  commandName: string;
  onShowHistory: (id: string) => void;
  onLoadFunding?: (need: PlanningNeed) => void;
}

const getTabColor = (index: number, isActive: boolean) => {
  const colors = [
    { bg: 'bg-slate-500', text: 'text-slate-600', light: 'bg-slate-50', border: 'border-slate-200' },
    { bg: 'bg-rose-500', text: 'text-rose-600', light: 'bg-rose-50', border: 'border-rose-200' },
    { bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50', border: 'border-amber-200' },
    { bg: 'bg-indigo-500', text: 'text-indigo-600', light: 'bg-indigo-50', border: 'border-indigo-200' },
    { bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200' },
    { bg: 'bg-violet-500', text: 'text-violet-600', light: 'bg-violet-50', border: 'border-violet-200' },
  ];
  const c = colors[index % colors.length];
  if (isActive) return `bg-white ${c.border} ${c.text} border-t-4 border-t-${c.bg.replace('bg-', '')}`;
  return `${c.light} border-transparent text-slate-400 opacity-70 hover:opacity-100`;
};

const getPriorityColor = (priority: 1 | 2 | 3) => {
  if (priority === 1) return 'bg-rose-600';
  if (priority === 2) return 'bg-amber-600';
  return 'bg-indigo-600';
};

const PriorityBadge = ({ priority }: { priority: 1 | 2 | 3 }) => {
  const configs = {
    1: { color: 'bg-rose-600', text: 'URGENTE', icon: '🔴' },
    2: { color: 'bg-amber-600', text: 'STRATEGICO', icon: '🟠' },
    3: { color: 'bg-indigo-600', text: 'PROGRAMMATO', icon: '🔵' }
  };
  const c = configs[priority] || configs[3];
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${c.color} text-white text-[8px] font-black uppercase tracking-[0.1em] shadow-sm`}>
      <span>{c.icon}</span>
      <span>{c.text}</span>
    </div>
  );
};

const PlanningModule: React.FC<PlanningModuleProps> = ({ state, activeListId, onSetActiveListId, onUpdate, currentUser, globalFilter, onShowHistory, onLoadFunding, commandName }) => {
  const [editingNeed, setEditingNeed] = useState<Partial<PlanningNeed> | null>(null);
  const [editingList, setEditingList] = useState<Partial<PlanningList> | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  
  const needs = state.planningNeeds || [];
  const isGarante = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.VIEWER;

  useEffect(() => {
    if (!state.planningLists || state.planningLists.length < 6) {
      const defaultLists: PlanningList[] = [
        { id: 'list-1', name: 'Brogliaccio', description: 'Canale di ingresso primario esigenze', createdAt: new Date().toISOString(), locked: true },
        { id: 'list-2', name: 'Maggiori Esigenze', description: 'Priorità elevate segnalate dai reparti', createdAt: new Date().toISOString() },
        { id: 'list-3', name: 'Revisione', description: 'Progetti in attesa di validazione tecnica', createdAt: new Date().toISOString() },
        { id: 'list-4', name: 'Varie 1', description: 'Esigenze ordinarie a bassa priorità', createdAt: new Date().toISOString() },
        { id: 'list-5', name: 'Varie 2', description: 'Archivio o pianificazioni future', createdAt: new Date().toISOString() },
        { id: 'list-6', name: 'Archivio Strategico', description: 'Pianificazioni pluriennali e documenti storici', createdAt: new Date().toISOString() },
      ];
      onUpdate({ planningLists: defaultLists });
      if (!activeListId) onSetActiveListId('list-1');
    } else if (!activeListId) {
      onSetActiveListId(state.planningLists[0].id);
    }
  }, [state.planningLists, activeListId]);

  const activeList = useMemo(() => state.planningLists.find(l => l.id === activeListId), [state.planningLists, activeListId]);

  const filteredNeeds = useMemo(() => {
    let base = needs.filter(n => n.listId === activeListId);
    if (globalFilter === 'mine') base = base.filter(n => n.workgroup === currentUser.workgroup);
    return [...base].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [needs, activeListId, globalFilter, currentUser.workgroup]);

  // CALCOLO SUB-TOTALI PER BANDA NERA
  const listTotals = useMemo(() => {
    const totals = { 1: 0, 2: 0, 3: 0, all: 0 };
    filteredNeeds.forEach(n => {
      const val = n.projectValue || 0;
      const p = n.priority as 1|2|3;
      if (totals[p] !== undefined) totals[p] += val;
      totals.all += val;
    });
    return totals;
  }, [filteredNeeds]);

  const handleSaveNeed = useCallback(() => {
    if (!editingNeed || isGarante) return;
    let updatedNeeds;
    if (editingNeed.id) {
      updatedNeeds = needs.map(n => n.id === editingNeed.id ? { ...n, ...editingNeed } : n);
    } else {
      const id = `need-${Date.now()}`;
      updatedNeeds = [...needs, { ...editingNeed as PlanningNeed, id, attachments: editingNeed.attachments || [], decretations: [], createdAt: new Date().toISOString(), ownerName: currentUser.username, ownerId: currentUser.id, workgroup: currentUser.workgroup, listId: activeListId || 'list-1' }];
    }
    onUpdate({ planningNeeds: updatedNeeds }, { action: editingNeed.id ? 'REVISIONE OBIETTIVO' : 'NUOVO OBIETTIVO', details: `Scheda ${editingNeed.description} aggiornata nel DNA.`, relatedId: editingNeed.id });
    setEditingNeed(null);
  }, [editingNeed, needs, currentUser, activeListId, onUpdate, isGarante]);

  const handleSaveList = () => {
    if (!editingList || isGarante) return;
    onUpdate({ planningLists: state.planningLists.map(l => l.id === editingList.id ? { ...l, name: editingList.name, description: editingList.description } : l) });
    setEditingList(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !editingNeed) return;
    const newAttachments: Attachment[] = [...(editingNeed.attachments || [])];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = (event) => {
        newAttachments.push({
          id: `att-${Date.now()}-${i}`,
          name: file.name,
          data: event.target?.result as string,
          type: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString()
        });
        setEditingNeed({ ...editingNeed, attachments: [...newAttachments] });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragStart = (e: React.DragEvent, need: PlanningNeed) => {
    if (isGarante) return;
    e.dataTransfer.setData('projectId', need.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnTab = (e: React.DragEvent, targetListId: string) => {
    e.preventDefault();
    setDragOverTab(null);
    const projectId = e.dataTransfer.getData('projectId');
    if (!projectId) return;

    if (targetListId === 'load-funding') {
      const project = needs.find(n => n.id === projectId);
      if (project && onLoadFunding) onLoadFunding(project);
      return;
    }

    const updatedNeeds = needs.map(n => n.id === projectId ? { ...n, listId: targetListId } : n);
    onUpdate({ planningNeeds: updatedNeeds }, { action: 'SPOSTAMENTO OBIETTIVO', details: `Progetto spostato nel gruppo ${state.planningLists.find(l => l.id === targetListId)?.name}`, relatedId: projectId });
  };

  // FUNZIONE ESPORTAZIONE PDF SOTTOGRUPPO
  const handleExportSubgroupPDF = () => {
    if (!activeList) return;
    const doc = new jsPDF();
    const formatEuro = (v: number) => `€ ${v.toLocaleString('it-IT')}`;

    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(commandName.toUpperCase(), 105, 15, { align: "center" });
    
    doc.setFontSize(11);
    doc.text(`REGISTRO OBIETTIVI - SOTTOGRUPPO: ${activeList.name.toUpperCase()}`, 105, 22, { align: "center" });
    
    doc.setFontSize(9); doc.setFont("helvetica", "italic");
    const intro = `Analisi di pianificazione strategica per il comparto ${activeList.name}. Il presente documento certifica le esigenze rilevate e la loro priorità operativa all'interno del DNA di Comando.`;
    const lines = doc.splitTextToSize(intro, 170);
    doc.text(lines, 20, 32);

    // TABELLA SINTESI ECONOMICA
    autoTable(doc, {
      startY: 42,
      head: [['Analisi per Priorità', 'Volume Finanziario Totale']],
      body: [
        ['PRIORITÀ 1 (URGENTE)', formatEuro(listTotals[1])],
        ['PRIORITÀ 2 (STRATEGICO)', formatEuro(listTotals[2])],
        ['PRIORITÀ 3 (ORDINARIO)', formatEuro(listTotals[3])],
        ['VALORE COMPLESSIVO SOTTOGRUPPO', formatEuro(listTotals.all)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
    });

    // TABELLA ANALITICA PROGETTI
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Codice', 'Descrizione Progetto', 'Priorità', 'Ufficio', 'Stima (€)']],
      body: filteredNeeds.map(n => [
        `C-${n.chapter}`,
        n.description.toUpperCase(),
        n.priority === 1 ? 'P1-URG' : n.priority === 2 ? 'P2-STRAT' : 'P3-ORD',
        n.workgroup,
        formatEuro(n.projectValue)
      ]),
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 7 }
    });

    setPdfPreviewUrl(doc.output('bloburl').toString());
  };

  return (
    <div className="h-full flex flex-col relative animate-in fade-in duration-500 overflow-hidden font-['Inter']">
      <div className="flex items-end gap-1 px-4 pt-2 overflow-x-auto no-scrollbar flex-shrink-0">
        {(state.planningLists || []).map((list, idx) => (
          <button
            key={list.id}
            onDragOver={(e) => { e.preventDefault(); setDragOverTab(list.id); }}
            onDragLeave={() => setDragOverTab(null)}
            onDrop={(e) => handleDropOnTab(e, list.id)}
            onClick={() => onSetActiveListId(list.id)}
            onDoubleClick={() => list.id !== 'list-1' && !isGarante && setEditingList(list)}
            className={`px-6 py-3 rounded-t-2xl text-[9px] font-black uppercase tracking-widest transition-all border-x border-t relative min-w-[150px] shadow-sm ${getTabColor(idx, activeListId === list.id)} ${dragOverTab === list.id ? 'ring-4 ring-indigo-500 ring-inset scale-105' : ''}`}
          >
            {list.name}
            {activeListId === list.id && <div className="absolute -bottom-1 left-0 w-full h-2 bg-white z-30"></div>}
          </button>
        ))}

        {!isGarante && (
           <div
             onDragOver={(e) => { e.preventDefault(); setDragOverTab('load-funding'); }}
             onDragLeave={() => setDragOverTab(null)}
             onDrop={(e) => handleDropOnTab(e, 'load-funding')}
             className={`ml-6 px-6 py-3 rounded-t-2xl text-[9px] font-black uppercase tracking-widest transition-all border-x border-t flex items-center gap-2 ${
               dragOverTab === 'load-funding' 
                ? 'bg-emerald-700 text-white scale-110 z-50 shadow-xl' 
                : 'bg-emerald-50 text-emerald-700 border-emerald-100 opacity-80'
             }`}
           >
             <span className="text-sm">💰</span> ➡️ CARICA FONDO
           </div>
        )}
      </div>

      <div className="flex-1 bg-white rounded-b-[2rem] rounded-tr-[2rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden m-2 mt-0 min-h-0">
        
        {/* BANDA NERA CON SUB-TOTALI PER PRIORITÀ */}
        <div className="bg-slate-900 px-8 py-5 flex justify-between items-center flex-shrink-0 z-10 border-b border-slate-800">
          <div className="flex flex-col flex-1">
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] italic">Registro Obiettivi Strategici</span>
            <div className="flex items-center gap-4 mt-1">
              <span className="text-sm font-black text-white uppercase italic tracking-tighter border-r border-white/20 pr-4">{activeList?.name}</span>
              
              <div className="flex items-center gap-2">
                 <div className="flex items-center gap-1 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20">
                    <span className="text-[7px] font-black text-rose-500 uppercase">P1:</span>
                    <span className="text-[10px] font-black text-white">€{listTotals[1].toLocaleString()}</span>
                 </div>
                 <div className="flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                    <span className="text-[7px] font-black text-amber-500 uppercase">P2:</span>
                    <span className="text-[10px] font-black text-white">€{listTotals[2].toLocaleString()}</span>
                 </div>
                 <div className="flex items-center gap-1 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
                    <span className="text-[7px] font-black text-indigo-500 uppercase">P3:</span>
                    <span className="text-[10px] font-black text-white">€{listTotals[3].toLocaleString()}</span>
                 </div>
                 <div className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-lg border border-white/20 ml-2">
                    <span className="text-[7px] font-black text-slate-400 uppercase">TOTALE:</span>
                    <span className="text-xs font-black text-emerald-400">€{listTotals.all.toLocaleString()}</span>
                 </div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
             <button onClick={handleExportSubgroupPDF} className="px-5 py-2.5 bg-white border border-slate-700 text-slate-800 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all">Export PDF Lista</button>
             {!isGarante && <button onClick={() => setEditingNeed({ description: '', chapter: '', barracks: '', projectValue: 0, priority: 3, attachments: [] })} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all">Nuovo Progetto +</button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2 bg-white">
          {filteredNeeds.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20 italic space-y-4">
              <span className="text-6xl text-slate-300">📂</span>
              <p className="text-xs font-black uppercase tracking-widest">Nessun obiettivo in questo gruppo</p>
            </div>
          ) : (
            filteredNeeds.map((need, idx) => (
              <div 
                key={need.id} 
                draggable={!isGarante}
                onDragStart={(e) => handleDragStart(e, need)}
                onClick={() => setEditingNeed(need)}
                className={`group bg-white rounded-2xl p-4 border-2 transition-all flex items-center gap-6 relative hover:shadow-lg cursor-pointer ${need.locked ? 'bg-slate-50 border-slate-100' : 'border-slate-50 hover:border-indigo-100'}`}
              >
                <div className="w-8 h-8 rounded-xl text-white flex items-center justify-center font-black text-[10px] italic shadow-md" style={{backgroundColor: need.priority === 1 ? '#e11d48' : need.priority === 2 ? '#d97706' : '#4f46e5'}}>{idx + 1}</div>
                <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-1"><span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[8px] font-black uppercase block text-center">C-{need.chapter}</span></div>
                  <div className="col-span-6">
                     <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black text-slate-800 tracking-tight italic truncate uppercase leading-none">{need.description}</h4>
                        {need.isFunded && <span className="bg-emerald-100 text-emerald-700 text-[6px] font-black px-1.5 py-0.5 rounded border border-emerald-300 shadow-sm animate-in fade-in">💰 FINANZIATO</span>}
                     </div>
                  </div>
                  <div className="col-span-2 flex justify-center"><PriorityBadge priority={need.priority || 3} /></div>
                  <div className="col-span-3 text-right"><p className="text-sm font-black text-slate-900 tracking-tighter italic">€{need.projectValue.toLocaleString()}</p></div>
                </div>
                <div className="flex items-center gap-3 pr-2 border-l border-slate-100 pl-4">
                  {need.attachments && need.attachments.length > 0 && <span className="text-[10px]">📎 {need.attachments.length}</span>}
                  <button onClick={(e) => { e.stopPropagation(); onShowHistory(need.id); }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">📜</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {editingList && (
        <div className="fixed inset-0 z-[600] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl p-10 border border-slate-200 flex flex-col gap-6">
            <h3 className="text-2xl font-black text-slate-800 italic uppercase tracking-tighter border-b pb-4">Metadati Gruppo</h3>
            <div className="space-y-4">
              <input type="text" placeholder="Nome Gruppo" value={editingList.name} onChange={e => setEditingList({...editingList, name: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-600 shadow-inner" />
              <textarea placeholder="Descrizione strategica..." value={editingList.description} onChange={e => setEditingList({...editingList, description: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-medium italic h-32 outline-none focus:border-indigo-600 shadow-inner" />
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={() => setEditingList(null)} className="flex-1 py-4 text-slate-400 font-bold uppercase text-[10px]">Annulla</button>
              <button onClick={handleSaveList} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl">Salva Modifiche</button>
            </div>
          </div>
        </div>
      )}

      {editingNeed && (
        <div className="fixed inset-0 z-[500] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-[1200px] h-full max-h-[92vh] rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
             <div className="px-10 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
               <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-lg ${getPriorityColor(editingNeed.priority || 3)}`}>P</div>
                  <div>
                    <h3 className="text-xl font-black text-slate-950 italic uppercase tracking-tighter">Fascicolo Obiettivo Strategico</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                       <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Operatore: {editingNeed.ownerName || currentUser.username}</span>
                    </div>
                  </div>
               </div>
               <div className="flex gap-3">
                 <button onClick={() => setEditingNeed(null)} className="px-6 py-2.5 bg-white border border-slate-200 text-slate-400 rounded-xl text-[9px] font-black uppercase hover:text-rose-600 transition-all">Esci senza salvare</button>
                 {!isGarante && <button onClick={handleSaveNeed} className="px-10 py-2.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase shadow-lg hover:bg-indigo-700 transition-all">Salva ed Archivia</button>}
               </div>
             </div>

             <div className="flex-1 flex overflow-hidden min-h-0 bg-white">
                <div className="w-2/3 p-10 overflow-y-auto custom-scrollbar border-r border-slate-100 space-y-8">
                   <div className="space-y-3">
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] ml-4">Oggetto dell'esigenza</label>
                      <VoiceInput disabled={isGarante} type="textarea" value={editingNeed.description || ''} onChange={v => setEditingNeed({...editingNeed, description: v})} placeholder="Dettagliare l'opera o il servizio richiesto..." className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] text-sm font-medium italic text-slate-700 min-h-[120px] outline-none focus:border-indigo-600" />
                   </div>

                   <div className="grid grid-cols-3 gap-6">
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                         <label className="text-[8px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Capitolo</label>
                         <input disabled={isGarante} placeholder="es. 1010" value={editingNeed.chapter || ''} onChange={e => setEditingNeed({...editingNeed, chapter: e.target.value})} className="w-full bg-transparent border-b-2 border-slate-200 text-lg font-black text-indigo-700 outline-none focus:border-indigo-600" />
                      </div>
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                         <label className="text-[8px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Valore Stimato (€)</label>
                         <VoiceInput disabled={isGarante} type="number" placeholder="0.00" value={editingNeed.projectValue || 0} onChange={v => setEditingNeed({...editingNeed, projectValue: Number(v)})} className="w-full bg-transparent border-b-2 border-slate-200 text-lg font-black text-slate-900 outline-none focus:border-indigo-600" />
                      </div>
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                         <label className="text-[8px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Caserma / Sede</label>
                         <input disabled={isGarante} placeholder="es. SANTA BARBARA" value={editingNeed.barracks || ''} onChange={e => setEditingNeed({...editingNeed, barracks: e.target.value})} className="w-full bg-transparent border-b-2 border-slate-200 text-lg font-black text-slate-900 outline-none focus:border-indigo-600 uppercase" />
                      </div>
                   </div>

                   <div className="space-y-4">
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] ml-4">Livello di Priorità</label>
                      <div className="grid grid-cols-3 gap-4">
                         {[1, 2, 3].map((p) => (
                            <button 
                              key={p} 
                              onClick={() => !isGarante && setEditingNeed({...editingNeed, priority: p as 1|2|3})}
                              className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest ${editingNeed.priority === p ? 'bg-slate-900 border-slate-900 text-white shadow-xl' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200'}`}
                            >
                               {p === 1 ? '🔴 Urgente' : p === 2 ? '🟠 Strategico' : '🔵 Ordinario'}
                            </button>
                         ))}
                      </div>
                   </div>
                </div>

                <div className="w-1/3 bg-slate-50/50 p-8 flex flex-col border-l border-slate-100 space-y-8 overflow-y-auto custom-scrollbar">
                   <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 border-b border-slate-200 pb-2 italic">Supporto Documentale</h4>
                      {!isGarante && (
                        <label className="w-full p-6 border-2 border-dashed border-slate-200 bg-white rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
                           <span className="text-2xl group-hover:scale-110 transition-transform">📤</span>
                           <span className="text-[8px] font-black uppercase tracking-widest mt-2 text-slate-400 group-hover:text-indigo-600">Aggiungi Atto (PDF/IMG)</span>
                           <input type="file" multiple onChange={handleFileChange} className="hidden" />
                        </label>
                      )}
                      <div className="space-y-2">
                         {editingNeed.attachments?.map(att => (
                            <div key={att.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between shadow-sm group">
                               <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-lg">📄</span>
                                  <span className="text-[9px] font-black text-slate-700 truncate pr-4">{att.name}</span>
                               </div>
                               <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => { const l=document.createElement('a'); l.href=att.data; l.download=att.name; l.click(); }} className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all">💾</button>
                                  {!isGarante && <button onClick={() => setEditingNeed({...editingNeed, attachments: editingNeed.attachments?.filter(a => a.id !== att.id)})} className="p-1.5 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-600 hover:text-white transition-all">🗑️</button>}
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>

                   <div className="space-y-4 flex-1">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 border-b border-slate-200 pb-2 italic">Log Decretazione</h4>
                      {editingNeed.decretations?.length === 0 ? (
                        <div className="p-8 text-center opacity-20 italic">
                           <span className="text-4xl block mb-2">📜</span>
                           <p className="text-[9px] font-black uppercase tracking-widest leading-tight">Nessuna firma digitale o video decretazione rilevata.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                           {editingNeed.decretations?.map(dec => (
                              <div key={dec.id} className="bg-indigo-900 text-white p-4 rounded-2xl shadow-lg border-l-4 border-indigo-400">
                                 <p className="text-[7px] font-black text-indigo-300 uppercase mb-1">{dec.role} - {dec.date}</p>
                                 <p className="text-[10px] font-medium italic">"{dec.text}"</p>
                                 <p className="text-[8px] font-black text-right mt-2 uppercase opacity-60">Firma: {dec.author}</p>
                              </div>
                           ))}
                        </div>
                      )}
                   </div>
                </div>
             </div>
           </div>
        </div>
      )}

      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[900] bg-slate-950/95 flex items-center justify-center p-6 backdrop-blur-sm">
           <div className="bg-white w-full max-w-6xl h-full rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border border-slate-800">
             <div className="p-5 flex justify-between items-center bg-slate-900 border-b border-slate-800 flex-shrink-0">
               <span className="text-[10px] font-black uppercase italic text-indigo-400 tracking-[0.4em]">Anteprima Esportazione Sottogruppo</span>
               <button onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }} className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">✕ Chiudi</button>
             </div>
             <iframe src={pdfPreviewUrl} className="flex-1 border-0" />
           </div>
        </div>
      )}
    </div>
  );
};

export default PlanningModule;
