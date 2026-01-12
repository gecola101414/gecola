
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AppState, PlanningNeed, User, FundingIDV, UserRole, Attachment, PlanningList, DecretationEntry, AuditEntry } from '../types';
import { VoiceInput } from './VoiceInput';
// @ts-ignore
import { jsPDF } from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

interface ProjectSnapshot {
  description: string;
  chapter: string;
  value: string;
  barracks: string;
}

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

const PlanningModule: React.FC<PlanningModuleProps> = ({ state, activeListId, onSetActiveListId, onUpdate, currentUser, idvs, globalFilter, commandName, onShowHistory }) => {
  const [editingNeed, setEditingNeed] = useState<Partial<PlanningNeed> | null>(null);
  const [editingList, setEditingList] = useState<Partial<PlanningList> | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<Attachment | null>(null);
  const [selectedDecretation, setSelectedDecretation] = useState<DecretationEntry | null>(null);
  
  const needs = state.planningNeeds || [];
  const lists = state.planningLists || [];
  const isReppe = currentUser.role === UserRole.REPPE;
  const isComandante = currentUser.role === UserRole.COMANDANTE;
  const isPpb = currentUser.role === UserRole.PPB;
  const isComando = isReppe || isComandante;
  const isStaffAutorizzato = isComandante || isReppe || isPpb;
  const isAdmin = currentUser.role === UserRole.ADMIN;
  const isViewer = currentUser.role === UserRole.VIEWER;
  const isGarante = isAdmin || isViewer;

  const activeList = useMemo(() => lists.find(l => l.id === activeListId), [lists, activeListId]);
  const isCurrentListLocked = activeList?.locked || (activeList?.isApprovedByComandante && activeList?.isApprovedByReppe) || false;

  const filteredNeeds = useMemo(() => {
    let base = activeListId ? needs.filter(n => n.listId === activeListId) : needs.filter(n => !n.listId);
    if (globalFilter === 'mine') base = base.filter(n => n.workgroup === currentUser.workgroup);
    return [...base].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [needs, activeListId, globalFilter, currentUser.workgroup]);

  const formatCurrency = (val: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val);

  const exportSingleProjectPDF = (need: PlanningNeed) => {
    const doc = new jsPDF();
    const listName = lists.find(l => l.id === need.listId)?.name || 'Generale (Brogliaccio)';
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(commandName.toUpperCase(), 105, 15, { align: "center" });
    doc.setFontSize(16); doc.text("FASCICOLO PIANIFICAZIONE OBIETTIVO", 105, 35, { align: "center" });
    autoTable(doc, {
      startY: 45,
      head: [['Parametro Strategico', 'Dettaglio Tecnico-Amministrativo']],
      body: [
        ['SOTTOGRUPPO OBIETTIVI', listName.toUpperCase()],
        ['OGGETTO / DESCRIZIONE', need.description.toUpperCase()],
        ['CAPITOLO DI SPESA', need.chapter],
        ['STIMA ECONOMICA', formatCurrency(need.projectValue)],
        ['SITO OPERATIVO', need.barracks.toUpperCase()],
        ['STATO FINANZIAMENTO', need.isFunded ? 'FINANZIATO (ASSEGNATO IDV)' : 'PIANIFICATO'],
        ['UFFICIO PROPONENTE', need.workgroup],
        ['DATA REGISTRAZIONE', new Date(need.createdAt).toLocaleString('it-IT')],
        ['PRIORITÀ ASSEGNATA', `${need.priority} - ${need.priority === 1 ? 'URGENTE' : need.priority === 2 ? 'STRATEGICA' : 'PROGRAMMATA'}`]
      ],
      theme: 'grid'
    });
    setPdfPreviewUrl(doc.output('bloburl').toString());
  };

  const handleSaveNeed = useCallback(() => {
    if (!editingNeed || isCurrentListLocked || isGarante) return;
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
  }, [editingNeed, needs, currentUser, activeListId, isCurrentListLocked, onUpdate, isGarante]);

  const handleSaveList = () => {
    if (!editingList || !isStaffAutorizzato || isGarante) return;
    let updatedLists;
    let logMsg;
    if (editingList.id) {
      updatedLists = lists.map(l => l.id === editingList.id ? { ...l, name: editingList.name, description: editingList.description } : l);
      logMsg = { action: 'Rinomina Sottogruppo', details: `Sottogruppo obiettivi ${editingList.id} rinominato in "${editingList.name}".` };
    } else {
      const id = `list-${Date.now()}`;
      updatedLists = [...lists, { ...editingList as PlanningList, id, createdAt: new Date().toISOString(), locked: false }];
      logMsg = { action: 'Nuovo Sottogruppo Obiettivi', details: `Creato nuovo contenitore obiettivi: "${editingList.name}".` };
    }
    onUpdate({ planningLists: updatedLists }, logMsg);
    setEditingList(null);
  };

  const handleApplyOfficialSeal = () => {
    if (!editingNeed?.id || !isComando || isGarante) return;
    const sealType = isReppe ? 'isApprovedByReppe' : 'isApprovedByComandante';
    const dateType = isReppe ? 'approvalDateReppe' : 'approvalDateComandante';
    const updatedNeeds = needs.map(n => n.id === editingNeed.id ? { ...n, [sealType]: true, [dateType]: new Date().toISOString(), locked: true } : n);
    onUpdate({ planningNeeds: updatedNeeds }, { action: 'SIGILLO UFFICIALE APPOSTO', details: `Progetto "${editingNeed.description}" validato da ${currentUser.username}. Scheda BLOCCATA.`, relatedId: editingNeed.id });
    setEditingNeed(updatedNeeds.find(n => n.id === editingNeed.id) || null);
  };

  const handleDragStart = (e: React.DragEvent, need: PlanningNeed) => {
    if (isGarante) return;
    e.dataTransfer.setData('ppb/project', JSON.stringify(need));
    localStorage.setItem('draggingProjectId', need.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="h-full flex flex-col relative animate-in fade-in duration-500 overflow-hidden font-['Inter']">
      <div className="flex-1 bg-white rounded-[2rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden m-2 min-h-0">
        <div className="bg-slate-900 px-8 py-4 flex justify-between items-center flex-shrink-0 z-10">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] italic">Registro Progetti Strategici</span>
            <span className="text-xs font-black text-white uppercase italic tracking-tighter">{activeListId ? activeList?.name : 'Brogliaccio Generale'}</span>
          </div>
          <div className="flex items-center gap-4">
             {activeListId && isStaffAutorizzato && !isGarante && (
                <button onClick={() => setEditingList(activeList)} className="p-2.5 bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors border border-slate-700 shadow-md" title="Configura Sottogruppo">⚙️</button>
             )}
             {!isCurrentListLocked && !isGarante && <button onClick={() => setEditingNeed({ description: '', chapter: '', barracks: '', projectValue: 0, priority: 3, attachments: [], listId: activeListId || undefined })} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 active:translate-y-0.5 transition-all">Pianifica Nuovo Progetto +</button>}
          </div>
        </div>

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
              className={`group bg-white rounded-2xl p-4 border-2 transition-all flex items-center gap-6 relative hover:shadow-lg cursor-pointer ${need.locked ? 'bg-slate-50 border-slate-100' : 'border-slate-50 hover:border-indigo-100'}`}
            >
              <div onClick={() => setEditingNeed(need)} className="flex-1 flex items-center gap-6">
                <div className={`w-8 h-8 rounded-xl ${getPriorityColor(need.priority)} text-white flex items-center justify-center font-black text-[10px] italic shadow-md`}>{idx + 1}</div>
                <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-1"><span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[8px] font-black uppercase italic block text-center">C-{need.chapter}</span></div>
                  <div className="col-span-6">
                     <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black text-slate-800 tracking-tight italic truncate uppercase leading-none">{need.description}</h4>
                        {need.isFunded && <span className="bg-amber-100 text-amber-600 text-[6px] font-black px-1.5 py-0.5 rounded border border-amber-200">⭐ FINANZIATO</span>}
                     </div>
                     <p className="text-[7px] font-bold text-slate-400 uppercase italic mt-1 leading-none">Caserma: {need.barracks}</p>
                     <p className="text-[6px] font-black text-slate-300 uppercase italic mt-0.5">{need.ownerName} • {new Date(need.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="col-span-2 flex justify-center"><PriorityBadge priority={need.priority || 3} /></div>
                  <div className="col-span-3 text-right"><p className="text-sm font-black text-slate-900 tracking-tighter italic">{formatCurrency(need.projectValue)}</p></div>
                </div>
              </div>
              <div className="flex items-center gap-3 pr-2 border-l border-slate-100 pl-4">
                <button onClick={(e) => { e.stopPropagation(); onShowHistory(need.id); }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-all" title="Storico Scheda">📜</button>
                <button onClick={(e) => { e.stopPropagation(); exportSingleProjectPDF(need); }} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-all" title="PDF">📄</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingList && (
        <div className="fixed inset-0 z-[600] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl p-10 border border-slate-200 flex flex-col gap-6">
            <h3 className="text-2xl font-black text-slate-800 italic uppercase tracking-tighter border-b pb-4">{editingList.id ? 'Configura Sottogruppo' : 'Nuovo Sottogruppo'}</h3>
            <div className="space-y-5">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Nome Identificativo</label>
                <input type="text" placeholder="es. Manutenzioni Straordinarie 2026" value={editingList.name} onChange={e => setEditingList({...editingList, name: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-600" />
              </div>
              <div className="space-y-1">
                 <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Finalità Strategica / Descrizione</label>
                 <textarea placeholder="Dettagliare la finalità del sottogruppo..." value={editingList.description} onChange={e => setEditingList({...editingList, description: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-medium italic h-32 outline-none focus:border-indigo-600" />
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={() => setEditingList(null)} className="flex-1 py-4 text-slate-400 font-bold uppercase text-[10px] tracking-widest">Annulla</button>
              <button onClick={handleSaveList} disabled={!editingList.name?.trim()} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50">Conferma Configurazione</button>
            </div>
          </div>
        </div>
      )}

      {editingNeed && (
        <div className="fixed inset-0 z-[500] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-[1400px] h-full max-h-[96vh] rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
             <div className="px-10 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
               <div className="flex items-center gap-4"><div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-lg">V</div><div><h3 className="text-xl font-black text-slate-950 italic uppercase tracking-tighter">Fascicolo Obiettivo Strategico</h3><span className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.2em]">Strategia Operativa 9.9 LEGACY-BIO</span></div></div>
               <div className="flex items-center gap-2">
                  <button onClick={() => setEditingNeed(null)} className="px-4 py-2 bg-white border border-slate-200 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-rose-600 transition-all">Esci</button>
                  {!editingNeed.locked && !isGarante && <button onClick={handleSaveNeed} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all">Salva Variazioni</button>}
               </div>
             </div>
             <div className="flex-1 flex overflow-hidden min-h-0">
                <div className="flex-[2] p-8 overflow-y-auto custom-scrollbar border-r border-slate-100 flex flex-col gap-6">
                  <div className="flex gap-10 items-start">
                     <div className="flex-1 space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-4">Descrizione Oggetto Progetto</label>
                        <VoiceInput disabled={editingNeed.locked || isGarante} type="textarea" value={editingNeed.description || ''} onChange={v => setEditingNeed({...editingNeed, description: v})} className="w-full p-4 bg-slate-50 rounded-[1.5rem] border border-slate-100 text-sm font-medium italic min-h-[60px] outline-none shadow-inner" />
                     </div>
                     <div className="w-64 space-y-3 flex flex-col items-start">
                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-4">Priorità Tattica</label>
                        <div className="flex flex-col gap-2 w-full">
                           <button disabled={editingNeed.locked || isGarante} onClick={() => setEditingNeed({...editingNeed, priority: 1})} className={`w-full py-3 rounded-xl border-2 text-[8px] font-black uppercase tracking-widest transition-all text-left px-5 flex items-center justify-between ${editingNeed.priority === 1 ? 'bg-rose-600 border-rose-600 text-white shadow-lg scale-[1.02]' : 'bg-rose-50 border-rose-100 text-rose-600 hover:border-rose-400'}`}><span>🔴 1 - URGENTE</span> {editingNeed.priority === 1 && <span>✓</span>}</button>
                           <button disabled={editingNeed.locked || isGarante} onClick={() => setEditingNeed({...editingNeed, priority: 2})} className={`w-full py-3 rounded-xl border-2 text-[8px] font-black uppercase tracking-widest transition-all text-left px-5 flex items-center justify-between ${editingNeed.priority === 2 ? 'bg-amber-600 border-amber-600 text-white shadow-lg scale-[1.02]' : 'bg-amber-50 border-amber-100 text-amber-600 hover:border-amber-400'}`}><span>🟠 2 - STRATEGICO</span> {editingNeed.priority === 2 && <span>✓</span>}</button>
                           <button disabled={editingNeed.locked || isGarante} onClick={() => setEditingNeed({...editingNeed, priority: 3})} className={`w-full py-3 rounded-xl border-2 text-[8px] font-black uppercase tracking-widest transition-all text-left px-5 flex items-center justify-between ${editingNeed.priority === 3 ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-[1.02]' : 'bg-indigo-50 border-indigo-100 text-indigo-600 hover:border-indigo-400'}`}><span>🔵 3 - PROGRAMMATO</span> {editingNeed.priority === 3 && <span>✓</span>}</button>
                        </div>
                     </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><label className="text-[8px] font-black uppercase text-slate-400 tracking-widest block mb-1">Capitolo</label><input disabled={editingNeed.locked || isGarante} value={editingNeed.chapter || ''} onChange={e => setEditingNeed({...editingNeed, chapter: e.target.value})} className="w-full bg-transparent border-b-2 border-slate-200 text-base font-black text-slate-900 outline-none" /></div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><label className="text-[8px] font-black uppercase text-slate-400 tracking-widest block mb-1">Stima Economica (€)</label><VoiceInput disabled={editingNeed.locked || isGarante} type="number" value={editingNeed.projectValue || 0} onChange={v => setEditingNeed({...editingNeed, projectValue: Number(v)})} className="w-full bg-transparent border-b-2 border-slate-200 text-base font-black text-indigo-600 outline-none" /></div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><label className="text-[8px] font-black uppercase text-slate-400 tracking-widest block mb-1">Sito / Caserma</label><input disabled={editingNeed.locked || isGarante} value={editingNeed.barracks || ''} onChange={e => setEditingNeed({...editingNeed, barracks: e.target.value})} className="w-full bg-transparent border-b-2 border-slate-200 text-base font-black text-slate-900 outline-none" /></div>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Archivio Documentale Allegato</h4>
                       {!editingNeed.locked && !isGarante && (
                         <label className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer hover:bg-emerald-700 shadow-md transition-all">Carica Documento 📁<input type="file" onChange={(e) => {
                            const file = e.target.files?.[0];
                            if(file && editingNeed) {
                               const reader = new FileReader();
                               reader.onload = (ev) => {
                                  const att: Attachment = { id: `att-${Date.now()}`, name: file.name, data: ev.target?.result as string, type: file.type, size: file.size, uploadedAt: new Date().toISOString() };
                                  const updatedAtts = [...(editingNeed.attachments || []), att];
                                  setEditingNeed({...editingNeed, attachments: updatedAtts});
                                  if(editingNeed.id) onUpdate({ planningNeeds: needs.map(n => n.id === editingNeed.id ? {...n, attachments: updatedAtts} : n) });
                               };
                               reader.readAsDataURL(file);
                            }
                         }} multiple className="hidden" /></label>
                       )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 overflow-y-auto custom-scrollbar pr-2">
                       {(editingNeed.attachments || []).map(att => (
                         <div key={att.id} onClick={() => setViewingAttachment(att)} className="bg-white border-2 border-slate-50 p-4 rounded-[1.5rem] flex items-center justify-between group hover:border-indigo-100 hover:shadow-md transition-all cursor-pointer">
                            <div className="flex items-center gap-4 min-w-0">
                               <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-xl shadow-inner group-hover:bg-indigo-50 transition-colors">📄</div>
                               <div className="min-w-0">
                                  <p className="text-[10px] font-black text-slate-800 truncate uppercase">{att.name}</p>
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">{(att.size / 1024).toFixed(1)} KB</p>
                               </div>
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>
                </div>

                <div className="flex-[1.2] bg-slate-50/50 p-8 flex flex-col min-h-0 border-l border-slate-100">
                  <div className="flex justify-between items-center border-b-2 border-amber-100 pb-3 mb-6">
                    <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-amber-600">Ledger Decisionale & Decreti</h4>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                    {editingNeed.decretations?.map((dec) => (
                         <div key={dec.id} onClick={() => setSelectedDecretation(dec)} className={`p-5 rounded-3xl border-2 transition-all cursor-pointer shadow-sm relative overflow-hidden group ${selectedDecretation?.id === dec.id ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-100 hover:border-indigo-300'}`}>
                           <div className="flex items-center justify-between mb-3">
                             <span className={`text-[7px] font-black px-2 py-0.5 rounded uppercase ${selectedDecretation?.id === dec.id ? 'bg-white/20 text-white' : (dec.role === UserRole.COMANDANTE ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700')}`}>{dec.role}</span>
                             <span className={`text-[6px] font-black uppercase italic ${selectedDecretation?.id === dec.id ? 'text-white/60' : 'text-slate-300'}`}>{new Date(dec.date).toLocaleString()}</span>
                           </div>
                           {dec.text && <p className={`text-[10px] font-medium italic leading-snug border-l-2 pl-3 ${selectedDecretation?.id === dec.id ? 'border-white/30' : 'border-slate-100 text-slate-800'}`}>{dec.text}</p>}
                         </div>
                     ))}
                  </div>
                  {isComando && !isGarante && (
                    <div className="mt-6 space-y-4 pt-6 border-t-2 border-slate-200">
                       {((isReppe && !editingNeed.isApprovedByReppe) || (isComandante && !editingNeed.isApprovedByComandante)) && (
                         <button onClick={handleApplyOfficialSeal} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl border-b-4 border-emerald-900 transition-all flex items-center justify-center gap-3"><span>{isReppe ? '⚖️' : '🎖️'}</span> APPONI SIGILLO UFFICIALE</button>
                       )}
                    </div>
                  )}
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

export default PlanningModule;
