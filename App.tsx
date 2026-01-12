
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  WorkOrder, WorkStatus, FundingIDV, User, UserRole, AppState, PlanningNeed, PlanningList, AuditEntry, ChatMessage, Briefing
} from './types';
import Dashboard from './components/Dashboard';
import Catalog from './components/Catalog';
import WorkForm from './components/WorkForm';
import { IdvForm } from './components/IdvForm';
import IdvList from './components/IdvList';
import BidModal from './components/BidModal';
import PaymentModal from './components/PaymentModal';
import ChapterReport from './components/ChapterReport';
import Manual from './components/Manual';
import PlanningModule from './components/PlanningModule';
import AuditLog from './components/AuditLog';
import Messenger from './components/Messenger';
import AzimuthCheck from './components/AzimuthCheck';
// @ts-ignore
import { jsPDF } from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

const SYSTEM_SECRET = "CME_LOMB_SECURE_VAULT_2026_V21_MASTER";
const ENCRYPTION_PREFIX = "PPB_CRYPT_V21:";
const IDB_NAME = 'VaultDB';
const IDB_STORE = 'Handles';
const DEFAULT_PASSWORD = "1234567890";

const GlobalLoader: React.FC<{ active: boolean }> = ({ active }) => {
  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="flex flex-col items-center p-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500/30 blur-3xl rounded-full animate-pulse"></div>
          <svg width="60" height="60" viewBox="0 0 100 95" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-spin duration-[3000ms] relative z-10">
            <path d="M50 0L61.2257 34.5492H97.5528L68.1636 55.9017L79.3893 90.4508L50 69.0983L20.6107 90.4508L31.8364 55.9017L2.44717 34.5492H38.7743L50 0Z" fill="#D4AF37"/>
          </svg>
        </div>
        <p className="text-white font-black uppercase text-[10px] tracking-[0.4em] mt-10 animate-pulse italic">Sincronizzazione Criptata...</p>
      </div>
    </div>
  );
};

const EsercitoLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const scale = size === 'sm' ? 'scale-[0.45]' : size === 'md' ? 'scale-[0.7]' : 'scale-100';
  return (
    <div className={`flex flex-col items-center justify-center transform ${scale} select-none`}>
      <svg width="100" height="95" viewBox="0 0 100 95" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M50 0L61.2257 34.5492H97.5528L68.1636 55.9017L79.3893 90.4508L50 69.0983L20.6107 90.4508L31.8364 55.9017L2.44717 34.5492H38.7743L50 0Z" fill="#B58900"/>
        <path d="M50 0L50 69.0983L20.6107 90.4508L31.8364 55.9017L2.44717 34.5492H38.7743L50 0Z" fill="#D4AF37"/>
      </svg>
      <span className="text-[28px] font-serif font-black tracking-[0.2em] text-black mt-1 leading-none uppercase italic">ESERCITO</span>
    </div>
  );
};

const saveHandleToIDB = async (handle: any, vaultId: string = "") => {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const tx = db.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).put({ handle, vaultId }, 'lastHandle');
  return new Promise(res => tx.oncomplete = res);
};

const FirstLoginSetup: React.FC<{ onComplete: (data: Partial<User>) => void }> = ({ onComplete }) => {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');

  const checks = {
    length: pwd.length >= 8,
    number: /[0-9]/.test(pwd),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(pwd),
    match: pwd === confirm && pwd !== ''
  };

  const isReady = Object.values(checks).every(Boolean);

  return (
    <div className="bg-white rounded-[3rem] p-10 shadow-2xl max-w-lg w-full border-4 border-indigo-600 animate-in zoom-in duration-300 font-['Inter']">
       <div className="text-center mb-8"><EsercitoLogo size="md" /><h2 className="text-2xl font-black text-slate-800 uppercase italic mt-6 leading-none">Aggiornamento Credenziali</h2><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">Protocollo Sicurezza Obbligatorio</p></div>
       <div className="space-y-6">
          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
             <p className="text-[9px] text-indigo-600 italic leading-relaxed text-center">Per proteggere il DNA Vault, imposta una password che rispetti i parametri di sicurezza militare.</p>
          </div>
          
          <div className="space-y-4">
             <input type="password" placeholder="Nuova Password" value={pwd} onChange={e => setPwd(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold focus:border-indigo-600 outline-none shadow-inner" />
             <input type="password" placeholder="Conferma Nuova Password" value={confirm} onChange={e => setConfirm(e.target.value)} className={`w-full px-6 py-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none shadow-inner ${confirm && pwd !== confirm ? 'border-rose-400' : 'border-slate-200 focus:border-indigo-600'}`} />
          </div>

          <div className="grid grid-cols-2 gap-2">
             {[
               { label: 'Min. 8 Caratteri', ok: checks.length },
               { label: 'Include Numero', ok: checks.number },
               { label: 'Carattere Speciale', ok: checks.special },
               { label: 'Password Coincidenti', ok: checks.match }
             ].map((c, i) => (
               <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[8px] font-black uppercase transition-colors ${c.ok ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                  <span>{c.ok ? '✅' : '❌'}</span> {c.label}
               </div>
             ))}
          </div>

          <button disabled={!isReady} onClick={() => isReady && onComplete({ passwordHash: pwd })} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase shadow-xl mt-4 disabled:opacity-30 border-b-[6px] border-indigo-900 active:translate-y-1 transition-all">Salva e Prosegui</button>
       </div>
    </div>
  );
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [undoHistory, setUndoHistory] = useState<AppState[]>([]); 
  const [redoHistory, setRedoHistory] = useState<AppState[]>([]);
  const [fileHandle, setFileHandle] = useState<any | null>(null);
  const [view, setView] = useState<any>('gateway');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [savedHandleExists, setSavedHandleExists] = useState(false);
  const [triggerNewPlanning, setTriggerNewPlanning] = useState(0);
  const [historyFilterId, setHistoryFilterId] = useState<string | null>(null);
  const [activePlanningListId, setActivePlanningListId] = useState<string | null>(null);
  const [editWorkOrder, setEditWorkOrder] = useState<WorkOrder | null>(null);
  const [bidModalOrder, setBidModalOrder] = useState<WorkOrder | null>(null);
  const [paymentModalOrder, setPaymentModalOrder] = useState<WorkOrder | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const encrypt = (data: any): string => {
    try {
      const text = JSON.stringify(data);
      const uint8 = new TextEncoder().encode(text);
      const keyUint8 = new TextEncoder().encode(SYSTEM_SECRET);
      const encrypted = uint8.map((b, i) => b ^ keyUint8[i % keyUint8.length]);
      let binary = '';
      for (let i = 0; i < encrypted.byteLength; i++) { binary += String.fromCharCode(encrypted[i]); }
      return ENCRYPTION_PREFIX + btoa(binary);
    } catch (e) { return ""; }
  };

  const decrypt = (encryptedText: string): any | null => {
    if (!encryptedText || !encryptedText.startsWith(ENCRYPTION_PREFIX)) return null;
    try {
      const base64 = encryptedText.replace(ENCRYPTION_PREFIX, '');
      const binary = atob(base64);
      const uint8 = new Uint8Array(binary.length);
      const keyUint8 = new TextEncoder().encode(SYSTEM_SECRET);
      for (let i = 0; i < binary.length; i++) { uint8[i] = binary.charCodeAt(i) ^ keyUint8[i % keyUint8.length]; }
      return JSON.parse(new TextDecoder().decode(uint8));
    } catch (e) { return null; }
  };

  const writeToDisk = async (newState: AppState) => {
    if (!fileHandle || currentUser?.role === UserRole.VIEWER) return;
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(encrypt(newState));
      await writable.close();
    } catch (err) { console.error(err); }
  };

  const updateVault = async (updates: Partial<AppState> | ((prev: AppState) => Partial<AppState>), log?: any) => {
    if (!state || currentUser?.role === UserRole.VIEWER) return;
    const finalUpdates = typeof updates === 'function' ? updates(state) : updates;
    const newState = { 
      ...state, 
      ...finalUpdates, 
      version: (state.version || 0) + 1,
      lastSync: new Date().toISOString()
    };
    if (log && currentUser) {
      newState.auditLog = [{ 
        id: `log-${Date.now()}`, 
        timestamp: new Date().toISOString(), 
        userId: currentUser.id, 
        username: currentUser.username, 
        workgroup: currentUser.workgroup, 
        action: log.action, 
        details: log.details 
      }, ...(state.auditLog || [])].slice(0, 5000);
    }
    setState(newState);
    await writeToDisk(newState);
  };

  const handleLogin = async (userId: string, p: string) => {
    if (!state) return;
    const user = state.users.find(usr => usr.id === userId);
    if (user && user.passwordHash === p) {
      setCurrentUser(user);
      if (user.mustChangePassword || user.isFirstLogin) {
        setView('first-login-setup');
      } else {
        setView('dashboard');
      }
    } else alert("Chiave di accesso errata.");
  };

  const handleCreateNewDatabase = async () => {
    setIsProcessing(true);
    try { 
      const handle = await (window as any).showSaveFilePicker({ 
        suggestedName: 'Vault_DNA_2026.ppb',
        types: [{ description: 'Archivio PPB (.ppb)', accept: { 'application/octet-stream': ['.ppb'] } }] 
      }); 
      setFileHandle(handle); 
      setView('setup'); 
    } catch(e){}
    finally { setIsProcessing(false); }
  };

  const isGarante = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.VIEWER;

  if (view === 'gateway') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 font-['Inter']">
      <GlobalLoader active={isProcessing} />
      <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-5xl w-full flex flex-col md:flex-row gap-16 border border-slate-200 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
        <div className="flex-1 space-y-10 flex flex-col items-center md:items-start">
          <EsercitoLogo size="lg" />
          <h1 className="text-5xl font-black text-slate-800 tracking-tighter uppercase leading-none italic mt-8 text-center md:text-left">MANAGEMENT DNA<br/><span className="text-indigo-600 font-black tracking-widest">PROT. PPB 10.6 LEGACY</span></h1>
        </div>
        <div className="flex-1 flex flex-col gap-4 justify-center">
          <button onClick={async () => {
             setIsProcessing(true);
             try {
               const [handle] = await (window as any).showOpenFilePicker({ types: [{ description: 'Archivio PPB (.ppb)', accept: { 'application/octet-stream': ['.ppb'] } }] });
               const file = await handle.getFile();
               const dec = decrypt(await file.text());
               if(dec) { setFileHandle(handle); setState(dec); setView('login'); }
             } catch(e){}
             finally { setIsProcessing(false); }
          }} className="w-full py-6 bg-slate-100 text-slate-700 border-2 border-slate-200 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-md hover:bg-slate-200 transition-all"> CARICA ARCHIVIO DNA 📂 </button>
          <button onClick={handleCreateNewDatabase} className="w-full py-6 bg-emerald-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-md hover:bg-emerald-700 transition-all"> GENERA NUOVO DNA ➕ </button>
        </div>
      </div>
    </div>
  );

  if (view === 'setup') return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-50/50 p-6">
      <GlobalLoader active={isProcessing} />
      <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-md w-full text-center border border-indigo-100">
        <EsercitoLogo size="md" />
        <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter mb-10 italic mt-6 leading-none">Inizializzazione DNA</h2>
        <div className="space-y-4 text-left">
          <input type="text" placeholder="Nome Comando CME" id="s-cmd" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold outline-none focus:border-indigo-600 shadow-inner" />
          <input type="text" placeholder="User Amministratore (Garante)" id="s-u" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold outline-none focus:border-indigo-600 shadow-inner" />
          <input type="password" placeholder="Password Master" id="s-p" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold outline-none focus:border-indigo-600 shadow-inner" />
          <button onClick={async () => { 
            const cmd = (document.getElementById('s-cmd') as any).value; 
            const u = (document.getElementById('s-u') as any).value; 
            const p = (document.getElementById('s-p') as any).value; 
            if (u && p && cmd && fileHandle) { 
              setIsProcessing(true);
              try {
                const vId = `DNA-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`; 
                const init: AppState = { vaultId: vId, version: 1, commandName: cmd, users: [{ id: 'u-admin', username: u, passwordHash: p, role: UserRole.ADMIN, workgroup: 'COMANDO', mustChangePassword: false, loginCount: 0, isFirstLogin: false }], idvs: [], orders: [], planningNeeds: [], planningLists: [], auditLog: [], chatMessages: [], briefings: [], lastSync: new Date().toISOString() }; 
                setState(init); setCurrentUser(init.users[0]); await writeToDisk(init); await saveHandleToIDB(fileHandle, vId); setView('dashboard'); 
              } finally { setIsProcessing(false); }
            } else { alert("Compilare tutti i campi per inizializzare il Vault."); }
          }} className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase mt-4 shadow-xl tracking-widest hover:bg-indigo-700 transition-all border-b-[6px] border-indigo-900 active:translate-y-1">Sigilla e Crea DNA Vault</button>
        </div>
      </div>
    </div>
  );

  if (view === 'login' && state) return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-50/50 p-6 font-['Inter']">
      <GlobalLoader active={isProcessing} />
      <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-lg w-full text-center border border-indigo-100 space-y-8">
        <EsercitoLogo size="md" />
        <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter italic leading-none">Sblocco Identità</h2>
        <div className="space-y-6 text-left">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Operatore Autorizzato</label>
            <select id="l-u" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold outline-none focus:border-indigo-600 appearance-none shadow-sm">
              {state.users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.username.toUpperCase()} — {u.role.toUpperCase()} [{u.workgroup}]
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Password DNA</label>
            <input type="password" placeholder="••••••••" id="l-p" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold focus:border-indigo-600 outline-none shadow-sm" />
          </div>
          <button onClick={() => handleLogin((document.getElementById('l-u') as any)?.value || '', (document.getElementById('l-p') as any)?.value || '')} className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase shadow-xl hover:bg-indigo-700 transition-all border-b-4 border-indigo-900 active:translate-y-1">Apri Archivio DNA</button>
        </div>
      </div>
    </div>
  );

  if (view === 'first-login-setup' && currentUser) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <GlobalLoader active={isProcessing} />
      <FirstLoginSetup onComplete={async (data) => { 
        setIsProcessing(true);
        try {
          const updatedUser = { ...currentUser, ...data, isFirstLogin: false, mustChangePassword: false, lastActive: new Date().toISOString() }; 
          await updateVault((prev) => ({ users: prev.users.map(u => u.id === currentUser.id ? updatedUser : u) }), { action: 'CONFIGURAZIONE INIZIALE', details: `Operatore ${currentUser.username} ha aggiornato la chiave di accesso personale.`, relatedId: currentUser.id }); 
          setCurrentUser(updatedUser); setView('dashboard'); 
        } finally { setIsProcessing(false); }
      }} />
    </div>
  );

  const menuItems = [
    { id: 'dashboard', label: 'Analisi', icon: '📊' },
    { id: 'works', label: 'Lavori', icon: '🏗️' },
    { id: 'idvs', label: 'Fondi', icon: '💰' },
    { id: 'planning', label: 'Obiettivi', icon: '🎯' },
    { id: 'comms', label: 'Chat', icon: '💬' },
    { id: 'audit', label: 'Registro', icon: '📜' },
    { id: 'manual', label: 'Manuale', icon: '📖' }
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 font-['Inter'] overflow-hidden">
      <GlobalLoader active={isProcessing} />
      
      <header className="bg-white px-4 md:px-8 py-4 flex justify-between items-center border-b border-slate-200 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 text-slate-600 bg-slate-50 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div>
            <h2 className="text-lg md:text-xl font-black text-slate-800 uppercase italic leading-none">DNA PPB</h2>
            <span className="text-[8px] font-black text-indigo-500 uppercase block md:inline md:ml-2">{state.vaultId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view === 'planning' && !isGarante && (
            <button onClick={() => setTriggerNewPlanning(p => p+1)} className="p-2 md:px-4 md:py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase shadow-md">➕ <span className="hidden md:inline">NUOVA</span></button>
          )}
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-full overflow-hidden border-2 border-indigo-100 flex items-center justify-center bg-slate-200">
            {currentUser.profilePhoto ? <img src={currentUser.profilePhoto} className="w-full h-full object-cover" /> : <span className="font-black text-slate-500">{currentUser.username[0]}</span>}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] md:hidden" onClick={() => setIsSidebarOpen(false)} />}
        
        <aside className={`fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 z-[110] transform transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-6 h-full flex flex-col">
            <div className="md:hidden flex justify-end mb-4">
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-slate-100 rounded-full">✕</button>
            </div>
            <nav className="space-y-1 flex-1 overflow-y-auto">
              {menuItems.map(item => (
                <button 
                  key={item.id} 
                  onClick={() => { setView(item.id); setIsSidebarOpen(false); }} 
                  className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${view === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
                </button>
              ))}
            </nav>
            <button onClick={() => window.location.reload()} className="mt-auto p-4 text-[10px] font-black text-rose-600 uppercase border-t border-slate-100 flex items-center gap-3 hover:bg-rose-50 rounded-xl transition-all">🚪 Disconnetti</button>
          </div>
        </aside>

        <main className="flex-1 overflow-hidden p-4 md:p-8 flex flex-col">
          <div className="w-full h-full max-w-7xl mx-auto overflow-y-auto no-scrollbar pb-10">
            {view === 'dashboard' && <Dashboard idvs={state.idvs} orders={state.orders} auditLog={state.auditLog} commandName={state.commandName} onChapterClick={(c) => { setSelectedChapter(c); setView('chapter-detail'); }} />}
            {view === 'works' && <Catalog orders={state.orders} idvs={state.idvs} onAdd={() => setView('add-work')} onChapterClick={(c) => { setSelectedChapter(c); setView('chapter-detail'); }} onStageClick={(o, s) => { if (s === 1) setEditWorkOrder(o); if (s === 2) setBidModalOrder(o); if (s === 3) setPaymentModalOrder(o); }} onDelete={(id) => updateVault({ orders: state.orders.filter(o => o.id !== id) })} onToggleLock={(id) => updateVault({ orders: state.orders.map(o => o.id === id ? {...o, locked: !o.locked} : o) })} currentUser={currentUser} onShowHistory={setHistoryFilterId} />}
            {view === 'idvs' && <IdvList idvs={state.idvs} orders={state.orders} commandName={state.commandName} onChapterClick={(c) => { setSelectedChapter(c); setView('chapter-detail'); }} onAdd={() => setView('add-idv')} onToggleLock={(id) => updateVault({ idvs: state.idvs.map(i => i.id === id ? {...i, locked: !i.locked} : i) })} onDelete={(id) => updateVault({ idvs: state.idvs.filter(i => i.id !== id) })} userRole={currentUser.role} onShowHistory={setHistoryFilterId} />}
            {view === 'planning' && <PlanningModule state={state} activeListId={activePlanningListId} onSetActiveListId={setActivePlanningListId} onUpdate={(u, l) => updateVault(u, l)} currentUser={currentUser} idvs={state.idvs} globalFilter="all" commandName={state.commandName} onShowHistory={setHistoryFilterId} forceNewListTrigger={triggerNewPlanning} />}
            {view === 'comms' && <Messenger messages={state.chatMessages || []} currentUser={currentUser} allUsers={state.users} onSendMessage={(m) => updateVault({ chatMessages: [...state.chatMessages, { ...m as any, id: `msg-${Date.now()}` }] })} onReadChat={() => {}} />}
            {view === 'audit' && <AuditLog log={state.auditLog} filter="" setFilter={()=>{}} fromDate="" setFromDate={()=>{}} toDate="" setToDate={()=>{}} />}
            {view === 'manual' && <Manual commandName={state.commandName} />}
            {view === 'chapter-detail' && selectedChapter && <ChapterReport chapter={selectedChapter} idvs={(state.idvs || []).filter(i => i.capitolo === selectedChapter)} allIdvs={state.idvs || []} orders={state.orders || []} onBack={() => setView('dashboard')} onAddWork={() => setView('add-work')} onOrderClick={() => {}} userRole={currentUser.role} currentUser={currentUser} />}
          </div>
        </main>
      </div>

      {(view === 'add-work' || editWorkOrder) && <WorkForm idvs={state.idvs} orders={state.orders} currentUser={currentUser} existingChapters={[]} initialData={editWorkOrder || undefined} onSubmit={(d) => { updateVault({ orders: editWorkOrder ? state.orders.map(o => o.id === editWorkOrder.id ? {...o, ...d} : o) : [...state.orders, {...d as any, id: `w-${Date.now()}`, createdAt: new Date().toISOString(), orderNumber: `IMP-${Date.now()}`, ownerId: currentUser.id, ownerName: currentUser.username, workgroup: currentUser.workgroup}] }); setEditWorkOrder(null); setView('works'); }} onCancel={() => { setEditWorkOrder(null); setView('works'); }} />}
      {view === 'add-idv' && <IdvForm users={state.users} currentUser={currentUser} existingChapters={[]} onSubmit={(d) => { updateVault({ idvs: [...state.idvs, {...d as any, id: `idv-${Date.now()}`, createdAt: new Date().toISOString(), ownerId: currentUser.id, ownerName: currentUser.username, ownerWorkgroup: currentUser.workgroup}] }); setView('idvs'); }} onCancel={() => setView('idvs')} />}
      {bidModalOrder && <BidModal order={bidModalOrder} onSave={(b) => { updateVault({ orders: state.orders.map(o => o.id === bidModalOrder.id ? {...o, ...b, status: WorkStatus.AFFIDAMENTO} : o) }); setBidModalOrder(null); }} onClose={() => setBidModalOrder(null)} />}
      {paymentModalOrder && <PaymentModal order={paymentModalOrder} onSave={(p) => { updateVault({ orders: state.orders.map(o => o.id === paymentModalOrder.id ? {...o, ...p, status: WorkStatus.PAGAMENTO} : o) }); setPaymentModalOrder(null); }} onClose={() => setPaymentModalOrder(null)} />}
    </div>
  );
};
export default App;
