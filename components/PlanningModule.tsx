
import React, { useState, useMemo, useCallback } from 'react';
import { AppState, PlanningNeed, User, FundingIDV, UserRole, Attachment, PlanningList, DecretationEntry } from '../types';
import { VoiceInput } from './VoiceInput';
// @ts-ignore
import { jsPDF } from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

interface PlanningModuleProps {
  state: AppState;
  onUpdate: (updates: Partial<AppState>, log?: { action: string, details: string }) => void;
  currentUser: User;
  idvs: FundingIDV[];
  globalFilter: 'mine' | 'all';
}

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

const PlanningModule: React.FC<PlanningModuleProps> = ({ state, onUpdate, currentUser, idvs, globalFilter }) => {
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [editingNeed, setEditingNeed] = useState<Partial<PlanningNeed> | null>(null);
  const [editingList, setEditingList] = useState<Partial<PlanningList> | null>(null);
  const [draggedNeedId, setDraggedNeedId] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isDraggingOverFiles, setIsDraggingOverFiles] = useState(false);
  const [hoveredListId, setHoveredListId] = useState<string | null>(null);
  const [newDecretationText, setNewDecretationText] = useState('');

  const needs = state.planningNeeds || [];
  const lists = state.planningLists || [];
  
  const isReppe = currentUser.role === UserRole.REPPE;
  const isComandante = currentUser.role === UserRole.COMANDANTE;
  const isAdmin = currentUser.role === UserRole.ADMIN;
  const isEditor = currentUser.role === UserRole.EDITOR;
  const isComando = isReppe || isComandante;
  const canManageLists = isAdmin || isComando;

  const activeList = useMemo(() => lists.find(l => l.id === activeListId), [lists, activeListId]);
  const isCurrentListLocked = activeList?.locked || activeList?.isApprovedByComandante || activeList?.isApprovedByReppe || false;

  const openAttachment = (att: Attachment) => {
    const win = window.open();
    if (win) {
      win.document.write(`<iframe src="${att.data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
    }
  };

  const removeAttachment = (id: string) => {
    setEditingNeed(prev => prev ? ({ ...prev, attachments: (prev.attachments || []).filter(a => a.id !== id) }) : null);
  };

  const filteredNeeds = useMemo(() => {
    let base = activeListId ? needs.filter(n => n.listId === activeListId) : needs.filter(n => !n.listId);
    if (globalFilter === 'mine') {
      base = base.filter(n => n.workgroup === currentUser.workgroup);
    }
    return [...base].sort((a, b) => (a.priority || 3) - (b.priority || 3));
  }, [needs, activeListId, globalFilter, currentUser.workgroup]);

  const stats = useMemo(() => {
    const total = filteredNeeds.reduce((sum, n) => sum + n.projectValue, 0);
    const p1 = filteredNeeds.filter(n => n.priority === 1).reduce((sum, n) => sum + n.projectValue, 0);
    const p2 = filteredNeeds.filter(n => n.priority === 2).reduce((sum, n) => sum + n.projectValue, 0);
    const p3 = filteredNeeds.filter(n => n.priority === 3).reduce((sum, n) => sum + n.projectValue, 0);
    return { total, p1, p2, p3 };
  }, [filteredNeeds]);

  const generatePDFPreview = () => {
    const doc = new jsPDF();
    const listName = activeListId ? lists.find(l => l.id === activeListId)?.name : "Brogliaccio Libero";
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("COMANDO MILITARE ESERCITO LOMBARDIA", 105, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`REGISTRO PIANIFICAZIONE STRATEGICA PPB`, 105, 21, { align: "center" });
    doc.setFontSize(11);
    doc.text(`OBIETTIVO: ${listName.toUpperCase()}`, 105, 27, { align: "center" });
    
    if (activeList?.description) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text(`Orientamento Comando: ${activeList.description}`, 15, 34, { maxWidth: 180 });
    }

    const tableData = filteredNeeds.map((n, i) => {
      let stato = 'ATTESA VALIDAZIONE';
      if (n.isApprovedByComandante) stato = 'DECRETATO CDR 🎖️';
      else if (n.isApprovedByReppe) stato = 'VISTO REPPE ⚖️';

      return [
        i + 1, 
        `P${n.priority}`, 
        n.chapter, 
        n.description, 
        `€ ${n.projectValue.toLocaleString()}`, 
        stato
      ];
    });

    autoTable(doc, {
      startY: activeList?.description ? 45 : 38,
      head: [['#', 'Pr.', 'Cap.', 'Progetto', 'Valore Stima', 'Stato Decisionale']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
      columnStyles: {
        4: { halign: 'right' },
        5: { fontStyle: 'bold' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("BILANCIO ANALITICO PER PRIORITA'", 15, finalY);

    autoTable(doc, {
      startY: finalY + 5,
      head: [['Livello Priorità', 'Budget Complessivo']],
      body: [
        ['P1 - URGENZA ASSOLUTA', `€ ${stats.p1.toLocaleString()}`],
        ['P2 - OBIETTIVI STRATEGICI', `€ ${stats.p2.toLocaleString()}`],
        ['P3 - PROGRAMMAZIONE ANNUALE', `€ ${stats.p3.toLocaleString()}`],
        ['TOTALE GENERALE CARICO GRUPPO', `€ ${stats.total.toLocaleString()}`]
      ],
      theme: 'plain',
      styles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.row.index === 3) data.cell.styles.fillColor = [241, 245, 249];
      }
    });

    const approvedBy = activeList?.isApprovedByComandante ? "Comandante (CDR)" : (activeList?.isApprovedByReppe ? "REPPE" : "In corso");
    doc.setFontSize(8);
    doc.text(`STATO VALIDAZIONE GRUPPO: ${approvedBy.toUpperCase()}`, 15, (doc as any).lastAutoTable.finalY + 15);
    doc.setFontSize(7);
    doc.text(`Vault V21 - Tactical Security Protocol - Generato il ${new Date().toLocaleString()}`, 15, 285);

    setPdfPreviewUrl(doc.output('bloburl'));
  };

  const processFiles = useCallback((files: FileList) => {
    if (!editingNeed) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const attachment: Attachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          data: event.target?.result as string,
          type: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString()
        };
        setEditingNeed(prev => prev ? ({ ...prev, attachments: [...(prev.attachments || []), attachment] }) : null);
      };
      reader.readAsDataURL(file);
    });
  }, [editingNeed]);

  const handleDropOnList = useCallback((e: React.DragEvent, listId: string | null) => {
    e.preventDefault();
    setHoveredListId(null);
    const needId = e.dataTransfer.getData("needId") || draggedNeedId;
    if (needId) {
      const need = needs.find(n => n.id === needId);
      if (need && !need.locked && (isAdmin || isEditor || isComando)) {
        const listName = listId ? lists.find(l=>l.id===listId)?.name : 'Brogliaccio Libero';
        onUpdate(
          { planningNeeds: needs.map(n => n.id === needId ? { ...n, listId: listId || undefined } : n) },
          { action: 'Smistamento Obiettivo', details: `Il progetto "${need.description}" è stato spostato in: ${listName}.` }
        );
      }
    }
    setDraggedNeedId(null);
  }, [needs, draggedNeedId, onUpdate, isAdmin, isEditor, isComando, lists]);

  const handleSaveNeed = useCallback(() => {
    if (!editingNeed || isCurrentListLocked) return;
    let updatedNeeds;
    let logMsg;
    if (editingNeed.id) {
      updatedNeeds = needs.map(n => n.id === editingNeed.id ? { ...n, ...editingNeed } : n);
      logMsg = { action: 'Aggiornamento Fascicolo', details: `Revisione tecnica per "${editingNeed.description}". Importo stimato a sistema: €${editingNeed.projectValue?.toLocaleString()}.` };
    } else {
      const newNeed: PlanningNeed = {
        ...editingNeed as PlanningNeed,
        id: `need-${Date.now()}`,
        attachments: editingNeed.attachments || [],
        decretations: [],
        createdAt: new Date().toISOString(),
        ownerName: currentUser.username,
        workgroup: currentUser.workgroup,
        locked: false,
        listId: activeListId || undefined 
      };
      updatedNeeds = [...needs, newNeed];
      logMsg = { action: 'Immissione Nuova Scheda', details: `Nuovo progetto "${newNeed.description}" caricato direttamente nel gruppo "${activeList?.name || 'Brogliaccio'}".` };
    }
    onUpdate({ planningNeeds: updatedNeeds }, logMsg);
    setEditingNeed(null);
  }, [editingNeed, needs, currentUser, activeListId, isCurrentListLocked, onUpdate, activeList]);

  const handleSaveList = () => {
    if (!editingList || !canManageLists) return;
    let updatedLists;
    if (editingList.id) {
      updatedLists = lists.map(l => l.id === editingList.id ? { ...l, ...editingList } : l);
    } else {
      const newList: PlanningList = {
        ...editingList as PlanningList,
        id: `list-${Date.now()}`,
        createdAt: new Date().toISOString(),
        locked: false
      };
      updatedLists = [...lists, newList];
    }
    onUpdate({ planningLists: updatedLists }, { action: 'Definizione Strategica', details: `Orientamento del Sottogruppo "${editingList.name}" aggiornato dal Comando.` });
    setEditingList(null);
  };

  const handleAddDecretation = () => {
    if (!editingNeed?.id || !newDecretationText.trim() || !isComando) return;
    const newEntry: DecretationEntry = {
      id: `dec-${Date.now()}`,
      text: newDecretationText,
      author: currentUser.username,
      role: currentUser.role,
      date: new Date().toISOString()
    };
    const updatedDecretations = [...(editingNeed.decretations || []), newEntry];
    const updatedNeeds = needs.map(n => n.id === editingNeed.id ? { 
      ...n, ...editingNeed, decretations: updatedDecretations,
      [isReppe ? 'isApprovedByReppe' : 'isApprovedByComandante']: true,
      [isReppe ? 'approvalDateReppe' : 'approvalDateComandante']: new Date().toISOString()
    } : n);
    onUpdate({ planningNeeds: updatedNeeds }, { action: 'Firma Decretazione', details: `Protocollo decisionale apposto da ${currentUser.username} (${currentUser.role}) su progetto "${editingNeed.description}".` });
    setEditingNeed({ ...editingNeed, decretations: updatedDecretations });
    setNewDecretationText('');
  };

  const handleToggleListSeal = (seal: boolean) => {
    if (!activeListId || !isComando) return;
    const updatedLists = lists.map(l => l.id === activeListId ? {
      ...l, locked: seal, [isReppe ? 'isApprovedByReppe' : 'isApprovedByComandante']: seal
    } : l);
    onUpdate({ planningLists: updatedLists }, { 
      action: seal ? `Sigillo Strategico` : `Sblocco Revisione`, 
      details: seal ? `L'obiettivo "${activeList?.name}" è stato sigillato. Modifiche inibite.` : `Il Comando ha riaperto l'obiettivo "${activeList?.name}" per integrazioni tecniche.`
    });
  };

  return (
    <div className="h-full flex flex-col relative animate-in fade-in duration-500 overflow-hidden font-['Inter']">
      
      {/* TOP BAR AZIONI - MINIMALE */}
      <div className="sticky top-0 z-[45] bg-slate-50 pb-4 flex items-center justify-between border-b border-slate-200 px-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveListId(null)} 
            onDrop={(e) => handleDropOnList(e, null)} 
            onDragOver={(e) => { e.preventDefault(); setHoveredListId('brogliaccio'); }} 
            onDragLeave={() => setHoveredListId(null)} 
            className={`px-5 py-2.5 rounded-xl border-2 transition-all flex items-center gap-3 ${!activeListId ? 'bg-slate-900 border-slate-900 text-white shadow-xl' : (hoveredListId === 'brogliaccio' ? 'bg-emerald-500 border-emerald-500 text-white animate-pulse' : 'bg-white border-slate-200 text-slate-400')}`}
          >
            <span className="text-lg">📖</span>
            <div className="text-left">
              <span className="block text-[7px] font-black uppercase tracking-widest opacity-60 italic leading-none">Generale</span>
              <span className="text-[11px] font-black uppercase italic tracking-tighter">Brogliaccio</span>
            </div>
          </button>
          {canManageLists && (
            <button onClick={() => setEditingList({ name: '', description: '' })} className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-lg border-2 border-white group-hover:scale-110 transition-all">+</div>
              <div className="text-left">
                <span className="block text-[7px] font-black text-slate-400 uppercase tracking-widest italic leading-none">Crea</span>
                <span className="text-[10px] font-black text-indigo-600 uppercase italic leading-none">Sottogruppo</span>
              </div>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
           <button onClick={generatePDFPreview} className="px-5 py-2.5 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-black uppercase text-[9px] shadow-sm hover:border-indigo-600 hover:text-indigo-600 transition-all flex items-center gap-2">👁️ REGISTRO PDF</button>
           <div className="bg-white px-5 py-2.5 rounded-xl shadow-sm border border-slate-200 flex flex-col items-end">
             <span className="text-[7px] font-black text-slate-400 uppercase italic tracking-widest mb-1">Massa Gruppo</span>
             <span className="text-base font-black text-slate-900 italic tracking-tighter">€{stats.total.toLocaleString()}</span>
           </div>
           {activeListId && isComando && (
             <div className="flex gap-2">
                {!isCurrentListLocked ? (
                  <>
                    {isReppe && <button onClick={() => handleToggleListSeal(true)} className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-black uppercase text-[9px] shadow-lg hover:bg-indigo-700 transition-all">⚖️ SIGILLA</button>}
                    {isComandante && <button onClick={() => handleToggleListSeal(true)} className="px-5 py-2 bg-amber-600 text-white rounded-xl font-black uppercase text-[9px] shadow-lg hover:bg-amber-700 transition-all">🎖️ DECRETA</button>}
                  </>
                ) : (
                  <button onClick={() => handleToggleListSeal(false)} className="px-5 py-2 bg-rose-600 text-white rounded-xl font-black uppercase text-[9px] shadow-lg hover:bg-rose-700 transition-all">🔓 RIAPRI</button>
                )}
             </div>
           )}
        </div>
      </div>

      {/* NAV SOTTOGRUPPI - DRAG AREA */}
      <div className="flex items-center gap-2 py-3 overflow-x-auto no-scrollbar flex-shrink-0 px-2 border-b border-slate-100 bg-slate-50 z-[40]">
        {lists.map(list => {
          const count = needs.filter(n => n.listId === list.id).length;
          const isSelected = activeListId === list.id;
          const isHovered = hoveredListId === list.id;
          return (
            <button 
              key={list.id} 
              onClick={() => isSelected ? setEditingList(list) : setActiveListId(list.id)} 
              onDrop={(e) => handleDropOnList(e, list.id)} 
              onDragOver={(e) => { e.preventDefault(); setHoveredListId(list.id); }} 
              onDragLeave={() => setHoveredListId(null)} 
              className={`flex flex-col px-3 py-1.5 rounded-xl border-2 transition-all gap-0.5 relative flex-shrink-0 min-w-[130px] ${isSelected ? 'bg-indigo-50 border-indigo-600 text-indigo-700 shadow-md scale-[1.05] z-10' : (isHovered ? 'bg-indigo-500 border-indigo-500 text-white animate-pulse' : 'bg-white border-slate-100 text-slate-400')}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">{list.isApprovedByComandante ? '🎖️' : (list.isApprovedByReppe ? '⚖️' : '📂')}</span>
                <span className="text-[9px] font-black uppercase italic tracking-tighter truncate max-w-[80px]">{list.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[6px] font-bold uppercase italic tracking-widest">{count} SCHEDE</span>
                {list.locked && <span className="text-[6px] font-black text-amber-600 uppercase tracking-tighter">🔒 LOCKED</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* AREA LISTA - CARICAMENTO DIRETTO */}
      <div className="flex-1 bg-white rounded-[2rem] border border-slate-200 shadow-2xl flex flex-col overflow-hidden m-2 min-h-0">
        <div className="bg-slate-50 px-8 py-3 flex justify-between items-center border-b border-slate-100 flex-shrink-0 z-10">
          <div className="flex flex-col">
            <h3 className="text-[10px] font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-3">
              {activeListId ? activeList?.name : 'Brogliaccio Generale'} 
              {activeListId && <button onClick={() => setEditingList(activeList)} className="text-[7px] font-black text-indigo-500 border border-indigo-200 px-2 py-0.5 rounded bg-white hover:bg-indigo-500 hover:text-white transition-all">ORIENTAMENTO ⚙️</button>}
            </h3>
            {activeList?.description && <p className="text-[8px] font-bold text-slate-400 italic mt-0.5 truncate max-w-xl">{activeList.description}</p>}
          </div>
          {!isCurrentListLocked && !isComando && (
            <button 
              onClick={() => setEditingNeed({ description: '', chapter: '', barracks: '', projectValue: 0, priority: 3, attachments: [], listId: activeListId || undefined })} 
              className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all"
            >
              Nuova Scheda +
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2 bg-white min-h-0">
          {filteredNeeds.map((need, idx) => {
            const isMyProject = currentUser.workgroup === need.workgroup;
            const canDrag = !need.locked && !isCurrentListLocked;
            return (
              <div 
                key={need.id} 
                draggable={canDrag} 
                onDragStart={(e) => { setDraggedNeedId(need.id); e.dataTransfer.setData("needId", need.id); e.dataTransfer.effectAllowed = "move"; }} 
                onClick={() => setEditingNeed(need)} 
                className={`group bg-white rounded-2xl p-4 border-2 transition-all flex items-center gap-6 relative hover:shadow-lg cursor-pointer ${ (need.locked || isCurrentListLocked) ? 'bg-slate-50 border-slate-100 opacity-80' : (isMyProject ? 'border-indigo-50 hover:border-indigo-200' : 'border-slate-50')}`}
              >
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex flex-col items-center justify-center font-black text-[10px] italic border-2 border-white shadow-md">
                   <span className="text-[5px] opacity-50 font-black">REF</span>
                   <span>{idx + 1}</span>
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-1"><span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[7px] font-black uppercase italic block text-center">CAP. {need.chapter}</span></div>
                  <div className="col-span-6"><h4 className="text-xs font-black text-slate-800 tracking-tight italic truncate uppercase leading-none">{need.description}</h4><p className="text-[7px] font-bold text-slate-400 uppercase italic mt-1">{need.workgroup} / {need.ownerName} - {new Date(need.createdAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p></div>
                  <div className="col-span-2"><PriorityBadge priority={need.priority || 3} /></div>
                  <div className="col-span-3 text-right"><span className="text-[6px] font-black text-slate-300 uppercase block leading-none italic tracking-widest">Stima Budget</span><p className="text-sm font-black text-slate-900 tracking-tighter italic">€{need.projectValue.toLocaleString()}</p></div>
                </div>
                <div className="flex items-center gap-2">
                  {need.isApprovedByReppe && <span className="text-base" title="Visto REPPE">⚖️</span>}
                  {need.isApprovedByComandante && <span className="text-base" title="Decretato Comandante">🎖️</span>}
                  {need.attachments && need.attachments.length > 0 && <span className="bg-slate-100 text-slate-400 px-2 py-1 rounded-[8px] text-[7px] font-black">📎{need.attachments.length}</span>}
                </div>
              </div>
            );
          })}
          {filteredNeeds.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-200 py-20">
               <span className="text-4xl mb-4">📂</span>
               <p className="text-[10px] font-black uppercase tracking-widest">Nessuna scheda in questo gruppo</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL FASCICOLO - ESPANSIONE AREA DECRETAZIONI */}
      {editingNeed && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-[1500px] h-full max-h-[96vh] rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
             
             <div className="px-10 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-lg">V</div>
                 <div>
                   <h3 className="text-xl font-black text-slate-950 italic uppercase tracking-tighter">Fascicolo Strategico Progetto</h3>
                   <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.2em]">Revisione 3.6 Tactical Flow</span>
                   </div>
                 </div>
               </div>

               <div className="flex items-center gap-2">
                  <button onClick={() => setEditingNeed(null)} className="px-4 py-2 bg-white border border-slate-200 text-slate-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-rose-600 transition-all">Annulla</button>
                  {(!isComando && !isCurrentListLocked) && (
                    <button onClick={handleSaveNeed} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all">Registra Modifiche</button>
                  )}
                  {isComando && (
                    <button onClick={handleAddDecretation} className={`px-6 py-2 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg transition-all ${isComandante ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>Apponi Firma Comando</button>
                  )}
               </div>
             </div>
             
             <div className="flex-1 flex overflow-hidden min-h-0">
                <div className="flex-[1.2] p-8 overflow-y-auto custom-scrollbar border-r border-slate-100 space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100">
                      <label className="text-[7px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-1">Capitolo</label>
                      <input disabled={isComando || isCurrentListLocked} value={editingNeed.chapter || ''} onChange={e => setEditingNeed({...editingNeed, chapter: e.target.value})} className="w-full bg-transparent border-b border-slate-200 text-base font-black text-slate-900 outline-none focus:border-indigo-600" />
                    </div>
                    <div className="bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100">
                      <label className="text-[7px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-1">Stima Budget</label>
                      <input disabled={isComando || isCurrentListLocked} type="number" value={editingNeed.projectValue || 0} onChange={e => setEditingNeed({...editingNeed, projectValue: Number(e.target.value)})} className="w-full bg-transparent border-b border-slate-200 text-base font-black text-indigo-600 outline-none focus:border-indigo-600" />
                    </div>
                    <div className="bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100">
                      <label className="text-[7px] font-black uppercase text-slate-400 tracking-[0.2em] block mb-1">Caserma / Sito</label>
                      <input disabled={isComando || isCurrentListLocked} value={editingNeed.barracks || ''} onChange={e => setEditingNeed({...editingNeed, barracks: e.target.value})} className="w-full bg-transparent border-b border-slate-200 text-base font-black text-slate-900 outline-none focus:border-indigo-600" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[7px] font-black uppercase text-slate-400 tracking-[0.2em] block">Oggetto Tecnico dell'Intervento</label>
                    <VoiceInput disabled={isComando || isCurrentListLocked} type="textarea" value={editingNeed.description || ''} onChange={v => setEditingNeed({...editingNeed, description: v})} className="w-full p-6 bg-slate-50 rounded-[2rem] border border-slate-100 text-sm font-medium italic min-h-[100px] outline-none focus:border-indigo-600 transition-colors" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[7px] font-black uppercase text-slate-400 tracking-[0.2em] block">Livello Priorità Strategica</label>
                    <div className="flex gap-2">
                       {[1, 2, 3].map(p => (
                         <button key={p} disabled={isComando || isCurrentListLocked} onClick={() => setEditingNeed({...editingNeed, priority: p as any})} className={`flex-1 py-3 rounded-xl border-2 font-black text-[9px] uppercase tracking-widest transition-all ${editingNeed.priority === p ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-300 hover:border-indigo-200'}`}>
                           {p === 1 ? '🔴 URGENTE' : p === 2 ? '🟠 STRATEGICO' : '🔵 PROGRAMMATO'}
                         </button>
                       ))}
                    </div>
                  </div>

                  <div onDragOver={(e) => { e.preventDefault(); setIsDraggingOverFiles(true); }} onDragLeave={() => setIsDraggingOverFiles(false)} onDrop={(e) => { e.preventDefault(); setIsDraggingOverFiles(false); if (e.dataTransfer.files) processFiles(e.dataTransfer.files); }} className={`p-8 rounded-[2.5rem] border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3 ${isDraggingOverFiles ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-slate-100'}`}>
                    <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">📎</div>
                    <div className="text-center">
                       <p className="text-[9px] font-black uppercase tracking-widest text-slate-800">Area Allegati Tecnici</p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center mt-2">
                       {editingNeed.attachments?.map(att => (
                         <div key={att.id} className="bg-white border border-slate-200 px-4 py-2 rounded-xl flex items-center gap-3 shadow-sm group">
                            <button onClick={() => openAttachment(att)} className="text-[8px] font-black uppercase text-slate-600 hover:text-indigo-600 transition-colors italic">📄 {att.name}</button>
                            {(!isComando && !isCurrentListLocked) && <button onClick={() => removeAttachment(att.id)} className="text-rose-400 font-bold text-lg hover:text-rose-600 transition-all">×</button>}
                         </div>
                       ))}
                       {(!isComando && !isCurrentListLocked) && (
                         <>
                           <input type="file" multiple id="file-up" className="hidden" onChange={(e) => e.target.files && processFiles(e.target.files)} />
                           <label htmlFor="file-up" className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[8px] font-black uppercase tracking-widest cursor-pointer hover:bg-indigo-600 transition-all shadow-md">+ AGGIUNGI FILE</label>
                         </>
                       )}
                    </div>
                  </div>
                </div>

                {/* DESTRA - AREA DECRETAZIONI ESPANSA */}
                <div className="flex-[1.8] bg-slate-50/50 p-10 flex flex-col min-h-0 border-l border-slate-100">
                  <div className="flex-1 flex flex-col min-h-0">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-600 mb-8 border-b-2 border-amber-100 pb-3 flex items-center justify-between">
                       <span>Registro Decisionale & Decretazioni</span>
                       <span className="text-[8px] bg-white px-3 py-1 rounded-full border border-amber-200">Sessione Protetta</span>
                    </h4>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-4">
                       {editingNeed.decretations?.map((dec, i) => (
                         <div key={dec.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative group hover:shadow-xl transition-all animate-in slide-in-from-right-4">
                            <div className="flex items-center justify-between mb-5">
                               <div className="flex items-center gap-3">
                                  <span className="text-2xl">{dec.role === UserRole.COMANDANTE ? '🎖️' : '⚖️'}</span>
                                  <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase border ${dec.role === UserRole.COMANDANTE ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-indigo-100 text-indigo-700 border-indigo-200'}`}>
                                    {dec.role}
                                  </span>
                               </div>
                               <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{new Date(dec.date).toLocaleDateString()}</span>
                            </div>
                            <p className="text-[13px] font-medium text-slate-800 italic leading-[1.8] whitespace-pre-line border-l-4 border-slate-100 pl-6">{dec.text}</p>
                            <div className="mt-6 flex justify-end">
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                 FIRMAMENTE: <span className="text-slate-900">{dec.author}</span>
                               </p>
                            </div>
                         </div>
                       ))}
                       {(!editingNeed.decretations || editingNeed.decretations.length === 0) && (
                         <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-20 gap-4">
                            <span className="text-6xl">📜</span>
                            <p className="text-[11px] font-black uppercase tracking-[0.3em]">Registro intonso - In attesa di disposizioni</p>
                         </div>
                       )}
                    </div>

                    {isComando && (
                      <div className="mt-8 space-y-4 pt-8 border-t-2 border-slate-200">
                         <div className="flex items-center gap-3">
                            <span className="text-xl">{isComandante ? '🎖️' : '⚖️'}</span>
                            <label className="text-[9px] font-black uppercase text-amber-600 italic tracking-[0.2em]">
                               Inserimento Disposizione Operativa del {currentUser.role}
                            </label>
                         </div>
                         <VoiceInput type="textarea" value={newDecretationText} onChange={setNewDecretationText} placeholder="Digitare o dettare le disposizioni vincolanti per questo progetto..." className="w-full p-6 bg-white border-2 border-amber-100 rounded-[2.5rem] text-[13px] font-medium italic outline-none focus:border-amber-500 shadow-2xl" />
                      </div>
                    )}
                  </div>
                </div>
             </div>
           </div>
        </div>
      )}

      {/* PDF PREVIEW */}
      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-[200] bg-slate-950/95 flex items-center justify-center p-6 backdrop-blur-sm">
           <div className="bg-white w-full max-w-6xl h-full rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border border-slate-800">
             <div className="p-5 flex justify-between items-center bg-slate-900 border-b border-slate-800 flex-shrink-0">
               <span className="text-[10px] font-black uppercase italic text-indigo-400 tracking-[0.4em]">Official Tactical Report - CME LOMB Vault</span>
               <button onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }} className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-700 transition-all">✕ Chiudi Registro</button>
             </div>
             <iframe src={pdfPreviewUrl} className="flex-1 border-0" />
           </div>
        </div>
      )}

      {/* MODAL OBIETTIVO GRUPPO */}
      {editingList && (
        <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-lg">📂</div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Orientamento Strategico</h3>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">Guida Decisionale per l'Ufficio Tecnico</p>
                    </div>
                 </div>
                 <button onClick={() => setEditingList(null)} className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all">✕</button>
              </div>
              <div className="p-10 space-y-8">
                 <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-4">Nome del Sottogruppo Operativo</label>
                    <input disabled={!canManageLists || editingList.locked} value={editingList.name || ''} onChange={e => setEditingList({...editingList, name: e.target.value})} placeholder="es. Infrastrutture Area Sud 2026" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-[2rem] font-black text-lg text-slate-900 outline-none focus:border-indigo-600 transition-colors" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest ml-4">Orientamento del Comando / Vincoli Strategici</label>
                    <VoiceInput disabled={!canManageLists || editingList.locked} type="textarea" value={editingList.description || ''} onChange={v => setEditingList({...editingList, description: v})} placeholder="Definire qui gli obiettivi primari e le priorità assegnate a questo gruppo..." className="w-full p-8 bg-slate-50 border-2 border-slate-200 rounded-[2.5rem] font-medium text-sm italic text-slate-600 outline-none focus:border-indigo-600 min-h-[150px]" />
                 </div>
                 <div className="flex gap-4 pt-4">
                    <button onClick={() => setEditingList(null)} className="flex-1 py-5 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest">Chiudi senza salvare</button>
                    {canManageLists && !editingList.locked && (
                      <button onClick={handleSaveList} className="flex-1 py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all">Protocolla Orientamento</button>
                    )}
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default PlanningModule;
