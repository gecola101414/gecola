
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AppState, PlanningNeed, User, FundingIDV, UserRole, Attachment, PlanningList, DecretationEntry, AuditEntry } from '../types';
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
  idvs: FundingIDV[];
  globalFilter: 'mine' | 'all';
  commandName: string;
  onShowHistory: (id: string) => void;
  forceNewListTrigger?: number;
}

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

const PlanningModule: React.FC<PlanningModuleProps> = ({ state, activeListId, onSetActiveListId, onUpdate, currentUser, idvs, globalFilter, commandName, onShowHistory, forceNewListTrigger }) => {
  const [editingNeed, setEditingNeed] = useState<Partial<PlanningNeed> | null>(null);
  const [editingList, setEditingList] = useState<Partial<PlanningList> | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  
  const needs = state.planningNeeds || [];
  const lists = state.planningLists || [];
  const isAdmin = currentUser.role === UserRole.ADMIN;
  const isViewer = currentUser.role === UserRole.VIEWER;
  const isGarante = isAdmin || isViewer;
  const isStaffAutorizzato = currentUser.role === UserRole.COMANDANTE || currentUser.role === UserRole.REPPE || currentUser.role === UserRole.PPB;

  useEffect(() => {
    if (forceNewListTrigger && forceNewListTrigger > 0) {
      setEditingList({ name: '', description: '' });
    }
  }, [forceNewListTrigger]);

  const filteredNeeds = useMemo(() => {
    let base = activeListId ? needs.filter(n => n.listId === activeListId) : needs.filter(n => !n.listId);
    if (globalFilter === 'mine') base = base.filter(n => n.workgroup === currentUser.workgroup);
    return [...base].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [needs, activeListId, globalFilter, currentUser.workgroup]);

  const formatCurrency = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

  const exportSingleProjectPDF = (need: PlanningNeed) => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text("SCHEDA OBIETTIVO STRATEGICO", 105, 15, { align: "center" });
    
    autoTable(doc, {
      startY: 30,
      head: [['Campo', 'Valore']],
      body: [
        ['Oggetto', need.description],
        ['Capitolo', need.chapter],
        ['Caserma', need.barracks],
        ['Valore Estimativo', formatCurrency(need.projectValue)],
        ['Priorità', need.priority === 1 ? 'URGENTE' : (need.priority === 2 ? 'STRATEGICO' : 'PROGRAMMATO')],
        ['Stato Fondo', need.isFunded ? 'FINANZIATO' : 'DA FINANZIARE'],
        ['Proposto da', need.ownerName],
        ['Ufficio', need.workgroup],
        ['Data Creazione', new Date(need.createdAt).toLocaleDateString()]
      ],
      theme: 'grid'
    });
    setPdfPreviewUrl(doc.output('bloburl').toString());
  };

  const handleSaveNeed = useCallback(() => {
    if (!editingNeed || isGarante) return;
    let updatedNeeds;
    let logMsg;
    if (editingNeed.id) {
      updatedNeeds = needs.map(n => n.id === editingNeed.id ? { ...n, ...editingNeed } : n);
      logMsg = { action: 'Revisione Dati Progetto', details: `L'operatore ${currentUser.username} ha modificato i parametri del fascicolo "${editingNeed.description}".`, relatedId: editingNeed.id };
    } else {
      const id = `need-${Date.now()}`;
      updatedNeeds = [...needs, { ...editingNeed as PlanningNeed, id, attachments: editingNeed.attachments || [], decretations: [], createdAt: new Date().toISOString(), ownerName: currentUser.username, ownerId: currentUser.id, workgroup: currentUser.workgroup, locked: false, listId: activeListId || undefined }];
      logMsg = { action: 'Nuova Scheda Obiettivo', details: `Caricata scheda progettuale: "${editingNeed.description}".`, relatedId: id };
    }
    onUpdate({ planningNeeds: updatedNeeds }, logMsg);
    setEditingNeed(null);
  }, [editingNeed, needs, currentUser, activeListId, onUpdate, isGarante]);

  const handleSaveList = () => {
    if (!editingList || isGarante) return;
    let updatedLists;
    let logMsg;
    if (editingList.id) {
      updatedLists = lists.map(l => l.id === editingList.id ? { ...l, name: editingList.name, description: editingList.description } : l);
      logMsg = { action: 'Rinomina Sottogruppo', details: `Sottogruppo obiettivi ${editingList.id} rinominato in "${editingList.name}".` };
    } else {
      const id = `list-${Date.now()}`;
      updatedLists = [...lists, { ...editingList as PlanningList, id, createdAt: new Date().toISOString(), locked: false }];
      logMsg = { action: 'Nuovo Sottogruppo Obiettivi', details: `Creato nuovo contenitore obiettivi: "${editingList.name}".` };
      onSetActiveListId(id);
    }
    onUpdate({ planningLists: updatedLists }, logMsg);
    setEditingList(null);
  };

  const handleDeleteList = (id: string) => {
    if (!confirm("Eliminare il sottogruppo? I progetti contenuti torneranno nel Brogliaccio Generale.")) return;
    const updatedLists = lists.filter(l => l.id !== id);
    const updatedNeeds = needs.map(n => n.listId === id ? { ...n, listId: undefined } : n);
    onSetActiveListId(null);
    onUpdate({ planningLists: updatedLists, planningNeeds: updatedNeeds }, { action: 'RIMOZIONE SOTTOGRUPPO', details: `Sottogruppo ${id} eliminato.` });
    setEditingList(null);
  };

  const handleDragStart = (e: React.DragEvent, need: PlanningNeed) => {
    if (isGarante || need.locked) return;
    e.dataTransfer.setData('projectId', need.id);
  };

  const handleDrop = (e: React.DragEvent, targetListId: string | null) => {
    e.preventDefault();
    const projectId = e.dataTransfer.getData('projectId');
    if (!projectId) return;

    const updatedNeeds = needs.map(n => n.id === projectId ? { ...n, listId: targetListId || undefined } : n);
    const targetName = targetListId ? lists.find(l => l.id === targetListId)?.name : 'Brogliaccio';
    
    onUpdate({ planningNeeds: updatedNeeds }, { 
      action: 'SPOSTAMENTO TATTICO', 
      details: `Progetto ${projectId} spostato in ${targetName}.`,
      relatedId: projectId
    });
  };

  const handleTabClick = (listId: string | null) => {
    if (activeListId === listId) {
      if (listId === null) return; // Brogliaccio non modificabile
      const list = lists.find(l => l.id === listId);
      if (list) setEditingList(list);
    } else {
      onSetActiveListId(listId);
    }
  };

  return (
    <div className="h-full flex flex-col relative animate-in fade-in duration-500 overflow-hidden font-['Inter']">
      
      {/* AREA TABS (RETTANGOLI ROSSI) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-4 px-2 bg-white/50 border-b border-slate-200 flex-shrink-0 z-20">
        <button 
          onClick={() => handleTabClick(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, null)}
          className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border-2 whitespace-nowrap ${activeListId === null ? 'bg-slate-900 border-slate-900 text-white scale-105 z-10' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}
        >
          📁 Brogliaccio Generale
        </button>
        {lists.map(list => (
          <button 
            key={list.id}
            onClick={() => handleTabClick(list.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, list.id)}
            className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border-2 whitespace-nowrap group relative ${activeListId === list.id ? 'bg-indigo-600 border-indigo-600 text-white scale-105 z-10' : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200'}`}
          >
            🎯 {list.name}
            {activeListId === list.id && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span></span>}
          </button>
        ))}
      </div>

      <div className="flex-1 bg-white rounded-b-[2rem] border-x border-b border-slate-200 shadow-2xl flex flex-col overflow-hidden min-h-0">
        <div className="bg-slate-100 px-8 py-3 grid grid-cols-12 gap-6 items-center border-b border-slate-200 flex-shrink-0">
           <div className="col-span-1 text-[8px] font-black text-slate-400 uppercase tracking-widest">Ord.</div>
           <div className="col-span-1 text-[8px] font-black text-slate-400 uppercase tracking-widest">Cap.</div>
           <div className="col-span-6 text-[8px] font-black text-slate-400 uppercase tracking-widest">Oggetto / Obiettivo</div>
           <div className="col-span-2 text-center text-[8px] font-black text-slate-400 uppercase tracking-widest">Priorità</div>
           <div className="col-span-2 text-right text-[8px] font-black text-slate-400 uppercase tracking-widest">Valore Estimativo</div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2 bg-white">
          {filteredNeeds.map((need, idx) => (
            <div 
              key={need.id} 
              draggable={!need.locked && !isGarante}
              onDragStart={(e) => handleDragStart(e, need)}
              onClick={() => setEditingNeed(need)}
              className={`group bg-white rounded-2xl p-4 border-2 transition-all flex items-center gap-6 relative hover:shadow-lg cursor-pointer ${need.locked ? 'bg-slate-50 border-slate-100' : 'border-slate-50 hover:border-indigo-100'}`}
            >
                <div className={`w-8 h-8 rounded-xl ${getPriorityColor(need.priority)} text-white flex items-center justify-center font-black text-[10px] italic shadow-md`}>{idx + 1}</div>
                <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-1"><span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[8px] font-black uppercase italic block text-center">C-{need.chapter}</span></div>
                  <div className="col-span-6">
                     <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black text-slate-800 tracking-tight italic truncate uppercase leading-none">{need.description}</h4>
                        {need.isFunded && <span className="bg-amber-100 text-amber-600 text-[6px] font-black px-1.5 py-0.5 rounded border border-amber-200">⭐ FINANZIATO</span>}
                     </div>
                     <p className="text-[7px] font-bold text-slate-400 uppercase italic mt-1 leading-none">Caserma: {need.barracks}</p>
                  </div>
                  <div className="col-span-2 flex justify-center"><PriorityBadge priority={need.priority || 3} /></div>
                  <div className="col-span-3 text-right"><p className="text-sm font-black text-slate-900 tracking-tighter italic">{formatCurrency(need.projectValue)}</p></div>
                </div>
              <div className="flex items-center gap-3 pr-2 border-l border-slate-100 pl-4">
                <button onClick={(e) => { e.stopPropagation(); onShowHistory(need.id); }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-all" title="Storico">📜</button>
                <button onClick={(e) => { e.stopPropagation(); exportSingleProjectPDF(need); }} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-all" title="Esporta PDF">📄</button>
              </div>
            </div>
          ))}
          {filteredNeeds.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center py-20 opacity-30 italic">
               <span className="text-6xl mb-4">📂</span>
               <p className="font-black uppercase text-[10px] tracking-[0.3em]">Nessun obiettivo pianificato in questo sottogruppo</p>
               {!isGarante && <p className="text-[8px] mt-2">Usa "Pianifica Nuovo Progetto" per iniziare o trascina un elemento qui.</p>}
            </div>
          )}
        </div>

        {!isGarante && (
           <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-center">
              <button onClick={() => setEditingNeed({ description: '', chapter: '', barracks: '', projectValue: 0, priority: 3, attachments: [], listId: activeListId || undefined })} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all border-b-[6px] border-indigo-900">➕ PIANIFICA NUOVO PROGETTO</button>
           </div>
        )}
      </div>

      {editingList && (
        <div className="fixed inset-0 z-[600] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl p-10 border border-slate-200 flex flex-col gap-6">
            <div className="flex justify-between items-center border-b pb-4">
               <h3 className="text-2xl font-black text-slate-800 italic uppercase tracking-tighter">{editingList.id ? 'Configura Sottogruppo' : 'Nuovo Sottogruppo'}</h3>
               {editingList.id && (
                 <button onClick={() => handleDeleteList(editingList.id!)} className="text-[10px] font-black text-rose-600 uppercase underline hover:text-rose-800">Elimina Gruppo</button>
               )}
            </div>
            <div className="space-y-5">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Nome Identificativo</label>
                <input type="text" placeholder="es. Manutenzioni Straordinarie 2026" value={editingList.name} onChange={e => setEditingList({...editingList, name: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-600 shadow-inner" />
              </div>
              <div className="space-y-1">
                 <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Finalità Strategica / Descrizione</label>
                 <textarea placeholder="Dettagliare la finalità del sottogruppo..." value={editingList.description} onChange={e => setEditingList({...editingList, description: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-medium italic h-32 outline-none focus:border-indigo-600 shadow-inner" />
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={() => setEditingList(null)} className="flex-1 py-4 text-slate-400 font-bold uppercase text-[10px] tracking-widest">Annulla</button>
              <button onClick={handleSaveList} disabled={!editingList.name?.trim()} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50">Conferma Operazione</button>
            </div>
          </div>
        </div>
      )}

      {editingNeed && (
        <div className="fixed inset-0 z-[500] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-[1200px] h-full max-h-[90vh] rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
             <div className="px-10 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
               <div className="flex items-center gap-4"><div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-lg">V</div><div><h3 className="text-xl font-black text-slate-950 italic uppercase tracking-tighter">Fascicolo Obiettivo Strategico</h3><span className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.2em]">Strategia Operativa {activeListId ? 'Sottogruppo' : 'Brogliaccio'}</span></div></div>
               <div className="flex items-center gap-2">
                  <button onClick={() => setEditingNeed(null)} className="px-4 py-2 bg-white border border-slate-200 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-rose-600 transition-all">Esci</button>
                  {!editingNeed.locked && !isGarante && <button onClick={handleSaveNeed} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all">Salva Variazioni</button>}
               </div>
             </div>
             <div className="flex-1 flex overflow-hidden min-h-0">
                <div className="flex-[2] p-8 overflow-y-auto custom-scrollbar border-r border-slate-100 flex flex-col gap-6">
                  <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-4">Descrizione Oggetto Progetto</label>
                      <VoiceInput disabled={editingNeed.locked || isGarante} type="textarea" value={editingNeed.description || ''} onChange={v => setEditingNeed({...editingNeed, description: v})} className="w-full p-4 bg-slate-50 rounded-[1.5rem] border border-slate-100 text-sm font-medium italic min-h-[60px] outline-none shadow-inner" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><label className="text-[8px] font-black uppercase text-slate-400 tracking-widest block mb-1">Capitolo</label><input disabled={editingNeed.locked || isGarante} value={needValue(editingNeed.chapter)} onChange={e => setEditingNeed({...editingNeed, chapter: e.target.value})} className="w-full bg-transparent border-b-2 border-slate-200 text-base font-black text-slate-900 outline-none" /></div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><label className="text-[8px] font-black uppercase text-slate-400 tracking-widest block mb-1">Stima Economica (€)</label><VoiceInput disabled={editingNeed.locked || isGarante} type="number" value={needValue(editingNeed.projectValue)} onChange={v => setEditingNeed({...editingNeed, projectValue: Number(v)})} className="w-full bg-transparent border-b-2 border-slate-200 text-base font-black text-indigo-600 outline-none" /></div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><label className="text-[8px] font-black uppercase text-slate-400 tracking-widest block mb-1">Sito / Caserma</label><input disabled={editingNeed.locked || isGarante} value={needValue(editingNeed.barracks)} onChange={e => setEditingNeed({...editingNeed, barracks: e.target.value})} className="w-full bg-transparent border-b-2 border-slate-200 text-base font-black text-slate-900 outline-none" /></div>
                  
                  <div className="space-y-3">
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-4">Priorità Tattica</label>
                      <div className="flex gap-2">
                         {[1, 2, 3].map(p => (
                           <button key={p} disabled={editingNeed.locked || isGarante} onClick={() => setEditingNeed({...editingNeed, priority: p as any})} className={`flex-1 py-3 rounded-xl border-2 text-[8px] font-black uppercase tracking-widest transition-all ${editingNeed.priority === p ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400'}`}>
                             {p === 1 ? '🔴 URGENTE' : p === 2 ? '🟠 STRATEGICO' : '🔵 PROGRAMMATO'}
                           </button>
                         ))}
                      </div>
                  </div>
                </div>
                <div className="flex-[1] bg-slate-50/50 p-8 border-l border-slate-100 flex flex-col items-center justify-center opacity-40 italic">
                    <span className="text-5xl mb-4">🎖️</span>
                    <p className="text-[10px] font-black uppercase tracking-widest text-center">In attesa di sigillo gerarchico superiore</p>
                </div>
             </div>
           </div>
        </div>
      )}

      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[900] bg-slate-950/95 flex items-center justify-center p-6 backdrop-blur-sm">
           <div className="bg-white w-full max-w-5xl h-full rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border border-slate-800">
             <div className="p-5 flex justify-between items-center bg-slate-900 border-b border-slate-800 flex-shrink-0">
               <span className="text-[10px] font-black uppercase italic text-indigo-400 tracking-[0.4em]">Protocollo Anteprima Scheda Progetto</span>
               <button onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }} className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">✕ Esci</button>
             </div>
             <iframe src={pdfPreviewUrl} className="flex-1 border-0" />
           </div>
        </div>
      )}
    </div>
  );
};

// Helper per gestire valori undefined negli input
const needValue = (v: any) => v === undefined || v === null ? '' : v;

export default PlanningModule;
