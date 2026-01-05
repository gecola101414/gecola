
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  WorkOrder, WorkStatus, FundingIDV, User, UserRole, AppState, PlanningNeed, PlanningList, AuditEntry, ChatMessage 
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

const SYSTEM_SECRET = "CME_LOMB_SECURE_VAULT_2026_V21_MASTER";
const ENCRYPTION_PREFIX = "PPB_CRYPT_V21:";
const IDB_NAME = 'VaultDB';
const IDB_STORE = 'Handles';
const DEFAULT_PASSWORD = "1234567890";

const EsercitoLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const scale = size === 'sm' ? 'scale-[0.45]' : size === 'md' ? 'scale-[0.7]' : 'scale-100';
  const margin = size === 'sm' ? '-my-4' : size === 'md' ? '-my-2' : 'my-0';
  
  return (
    <div className={`flex flex-col items-center justify-center transform ${scale} ${margin} select-none origin-right`}>
      <svg width="100" height="95" viewBox="0 0 100 95" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
        <path d="M50 0L61.2257 34.5492H97.5528L68.1636 55.9017L79.3893 90.4508L50 69.0983L20.6107 90.4508L31.8364 55.9017L2.44717 34.5492H38.7743L50 0Z" fill="#B58900"/>
        <path d="M50 0L50 69.0983L20.6107 90.4508L31.8364 55.9017L2.44717 34.5492H38.7743L50 0Z" fill="#D4AF37"/>
      </svg>
      <span className="text-[34px] font-serif font-black tracking-[0.2em] text-black mt-2 leading-none uppercase italic">ESERCITO</span>
    </div>
  );
};

const saveHandleToIDB = async (handle: any) => {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const tx = db.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).put(handle, 'lastHandle');
  return new Promise(res => tx.oncomplete = res);
};

const getHandleFromIDB = async () => {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return new Promise<any>((res) => {
    const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get('lastHandle');
    req.onsuccess = () => res(req.result);
  });
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [undoHistory, setUndoHistory] = useState<AppState[]>([]); 
  const [redoHistory, setRedoHistory] = useState<AppState[]>([]);
  const [fileHandle, setFileHandle] = useState<any | null>(null);
  const [activeFileName, setActiveFileName] = useState<string>("");
  const [view, setView] = useState<'gateway' | 'login' | 'setup' | 'dashboard' | 'idvs' | 'works' | 'planning' | 'comms' | 'admin' | 'audit' | 'chapter-detail' | 'manual' | 'add-idv' | 'add-work' | 'change-password'>('gateway');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'remote-update' | 'conflict-resolved'>('synced');
  const [savedHandleExists, setSavedHandleExists] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const isWritingRef = useRef(false);
  const stateRef = useRef<AppState | null>(null);
  const lastModifiedRef = useRef<number>(0);
  const lastSizeRef = useRef<number>(0);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    getHandleFromIDB().then(h => { if(h) setSavedHandleExists(true); });
  }, []);

  // OTTIMIZZAZIONE: CIFRATURA ACCELERATA CON BUFFER DIRETTI
  const encrypt = (data: any): string => {
    try {
      const text = JSON.stringify(data);
      const uint8 = new TextEncoder().encode(text);
      const keyUint8 = new TextEncoder().encode(SYSTEM_SECRET);
      // XOR In-place per evitare allocazioni extra
      for (let i = 0; i < uint8.length; i++) {
        uint8[i] ^= keyUint8[i % keyUint8.length];
      }
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < uint8.length; i += chunk) {
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunk) as any);
      }
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
      for (let i = 0; i < binary.length; i++) {
        uint8[i] = binary.charCodeAt(i) ^ keyUint8[i % keyUint8.length];
      }
      return JSON.parse(new TextDecoder().decode(uint8));
    } catch (e) { return null; }
  };

  const writeToDisk = async (newState: AppState) => {
    if (!fileHandle) return;
    isWritingRef.current = true;
    setSyncStatus('syncing');
    try {
      const writable = await fileHandle.createWritable();
      const encrypted = encrypt(newState);
      await writable.write(encrypted);
      await writable.close();
      const fileAfter = await fileHandle.getFile();
      lastModifiedRef.current = fileAfter.lastModified;
      lastSizeRef.current = fileAfter.size;
      setSyncStatus('synced');
    } catch (err) { 
      setSyncStatus('error'); 
    } 
    finally { isWritingRef.current = false; }
  };

  const checkRemoteUpdates = useCallback(async () => {
    if (!fileHandle || isWritingRef.current || view === 'gateway' || view === 'login') return;
    try {
      const file = await fileHandle.getFile();
      if (file.lastModified > lastModifiedRef.current || file.size !== lastSizeRef.current) {
        const content = await file.text();
        const dec = decrypt(content);
        if (dec && dec.version > (stateRef.current?.version || 0)) {
          setState(dec);
          lastModifiedRef.current = file.lastModified;
          lastSizeRef.current = file.size;
          setSyncStatus('remote-update');
          setTimeout(() => setSyncStatus('synced'), 2000);
        } else {
          lastModifiedRef.current = file.lastModified;
          lastSizeRef.current = file.size;
        }
      }
    } catch (e) {}
  }, [fileHandle, view]);

  useEffect(() => {
    const interval = setInterval(checkRemoteUpdates, 2000);
    return () => clearInterval(interval);
  }, [checkRemoteUpdates]);

  const updateVault = async (updates: Partial<AppState>, log?: { action: string, details: string }) => {
    if (!stateRef.current) return;
    const currentState = stateRef.current;
    let finalUpdates = { ...updates };
    if (log && currentUser) {
      const newEntry: AuditEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        username: currentUser.username,
        workgroup: currentUser.workgroup,
        action: log.action,
        details: log.details
      };
      // OTTIMIZZAZIONE: Ridotto limite log a 5000 per fluidità
      finalUpdates.auditLog = [newEntry, ...(currentState.auditLog || [])].slice(0, 5000);
    }
    if (currentUser) {
      setUndoHistory(prev => [currentState, ...prev].slice(0, 15));
      setRedoHistory([]);
    }
    const newState = { ...currentState, ...finalUpdates, version: (currentState.version || 0) + 1, lastSync: new Date().toISOString() };
    setState(newState);
    await writeToDisk(newState);
  };

  // OTTIMIZZAZIONE: LOGIN NON BLOCCANTE
  const handleLogin = async (userId: string, p: string) => {
    if (!state) return;
    setIsLoggingIn(true);
    
    // Timeout breve per permettere al thread UI di mostrare il caricamento
    setTimeout(async () => {
      const user = state.users.find(usr => usr.id === userId && usr.passwordHash === p);
      if (user) {
        const now = new Date().toISOString();
        const updatedUsers = state.users.map(u => u.id === userId ? { ...u, lastActive: now, loginCount: (u.loginCount || 0) + 1 } : u);
        const loggedUser = updatedUsers.find(u => u.id === userId)!;
        
        // Transizione UI immediata
        setCurrentUser(loggedUser);
        if (loggedUser.mustChangePassword) setView('change-password');
        else setView('dashboard');
        setIsLoggingIn(false);

        // Operazione disco delegata in background
        updateVault({ users: updatedUsers }, { 
          action: 'Accesso Vault', 
          details: `Accesso autorizzato per ${loggedUser.username}. Protocollo V21 Master attivo.` 
        });
      } else { 
        setIsLoggingIn(false);
        alert("Password errata."); 
      }
    }, 50);
  };

  // Fix: Implemented handleSendMessage to allow users to send messages in the Messenger component
  const handleSendMessage = (msg: Partial<ChatMessage>) => {
    if (!state || !currentUser) return;
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      userId: currentUser.id,
      username: currentUser.username,
      role: currentUser.role,
      workgroup: currentUser.workgroup,
      text: msg.text || '',
      timestamp: msg.timestamp || new Date().toISOString(),
      recipientId: msg.recipientId
    };
    updateVault({ chatMessages: [...(state.chatMessages || []), newMessage] });
  };

  // Fix: Implemented handleMarkChatRead to track the last time a user viewed a specific chat
  const handleMarkChatRead = (chatId: string) => {
    if (!state || !currentUser) return;
    const now = new Date().toISOString();
    const updatedUsers = state.users.map(u => {
      if (u.id === currentUser.id) {
        return {
          ...u,
          lastReadTimestamps: {
            ...(u.lastReadTimestamps || {}),
            [chatId]: now
          }
        };
      }
      return u;
    });
    
    // Update local state and disk without cluttering audit log for every chat switch
    const newState = { ...state, users: updatedUsers, version: state.version + 1 };
    setState(newState);
    writeToDisk(newState);
    setCurrentUser(updatedUsers.find(u => u.id === currentUser.id)!);
  };

  const handleOpenFilePicker = async () => {
    try {
      const [handle] = await (window as any).showOpenFilePicker({ types: [{ description: 'Archivio Vault PPB', accept: { 'application/octet-stream': ['.ppb'] } }], multiple: false });
      if (handle) {
        const file = await handle.getFile();
        const content = await file.text();
        const dec = decrypt(content);
        if (dec) { 
          setFileHandle(handle); 
          setActiveFileName(handle.name); 
          setState(dec); 
          await saveHandleToIDB(handle); 
          lastModifiedRef.current = file.lastModified; 
          lastSizeRef.current = file.size; 
          setView('login'); 
        } else alert("File corrotto o password archivio non corrispondente.");
      }
    } catch (e) {}
  };

  const handleDirectAccess = async () => {
    try {
      const handle = await getHandleFromIDB();
      if (!handle) return;
      if (await handle.requestPermission({ mode: 'readwrite' }) === 'granted') {
        const file = await handle.getFile();
        const content = await file.text();
        const dec = decrypt(content);
        if (dec) { 
          setFileHandle(handle); 
          setActiveFileName(handle.name); 
          setState(dec); 
          lastModifiedRef.current = file.lastModified; 
          lastSizeRef.current = file.size; 
          setView('login'); 
        }
      } else { setSavedHandleExists(false); }
    } catch (e) { setSavedHandleExists(false); }
  };

  if (view === 'gateway') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 font-['Inter']">
      <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-4xl w-full flex flex-col md:flex-row gap-16 border border-slate-200 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
        <div className="flex-1 space-y-10">
          <EsercitoLogo size="lg" />
          <h1 className="text-5xl font-black text-slate-800 tracking-tighter uppercase leading-none italic mt-8">Shared Vault<br/><span className="text-indigo-600 font-black">V21 MASTER</span></h1>
          <p className="text-slate-400 font-medium italic">Sistema di monitoraggio flussi finanziari<br/>Comando Militare Esercito Lombardia</p>
        </div>
        <div className="flex-1 flex flex-col gap-4 justify-center">
          {savedHandleExists && ( 
            <button onClick={handleDirectAccess} className="p-10 bg-indigo-600 text-white rounded-[2.5rem] hover:bg-indigo-700 transition-all text-left shadow-2xl group active:scale-[0.98] border-b-[6px] border-indigo-900 flex flex-col items-center justify-center text-center"> 
              <span className="text-[10px] font-black uppercase opacity-70 mb-2 block tracking-widest">Database Caricato in Cache</span> 
              <p className="text-2xl font-black italic tracking-tighter uppercase">ACCEDI ORA</p> 
            </button> 
          )}
          <button onClick={handleOpenFilePicker} className="w-full py-6 bg-slate-100 text-slate-700 border-2 border-slate-200 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-md hover:bg-slate-200 transition-all">📂 APRI ALTRO ARCHIVIO</button>
        </div>
      </div>
    </div>
  );

  if (view === 'login') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-[3.5rem] p-12 shadow-xl border border-slate-200 w-full max-w-md animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center mb-10">
           <EsercitoLogo size="md" />
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] mt-6 italic">Secure Entry Protocol</p>
        </div>
        <div className="space-y-4">
          <select id="user-select" className="w-full p-5 bg-slate-100 border-none rounded-2xl font-black uppercase text-xs tracking-widest outline-none focus:ring-4 focus:ring-indigo-500/10">
            {state?.users.map(u => <option key={u.id} value={u.id}>{u.username} [{u.workgroup}]</option>)}
          </select>
          <input id="pass-input" type="password" placeholder="PASSWORD DI REPARTO" className="w-full p-5 bg-slate-100 border-none rounded-2xl font-black uppercase text-xs tracking-widest outline-none focus:ring-4 focus:ring-indigo-500/10" onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const u = (document.getElementById('user-select') as HTMLSelectElement).value;
              const p = (document.getElementById('pass-input') as HTMLInputElement).value;
              handleLogin(u, p);
            }
          }} />
          <button 
            disabled={isLoggingIn}
            onClick={() => {
              const u = (document.getElementById('user-select') as HTMLSelectElement).value;
              const p = (document.getElementById('pass-input') as HTMLInputElement).value;
              handleLogin(u, p);
            }} 
            className={`w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg transition-all hover:bg-indigo-700 active:scale-95 flex justify-center items-center gap-3 ${isLoggingIn ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isLoggingIn ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                VERIFICA IN CORSO...
              </>
            ) : "AUTENTICAZIONE"}
          </button>
        </div>
        <button onClick={() => setView('gateway')} className="w-full mt-6 text-[8px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-600 transition-all">Annulla e Chiudi Database</button>
      </div>
    </div>
  );

  if (!state || !currentUser) return null;

  return (
    <div className="h-screen w-screen flex bg-slate-50 font-['Inter'] text-slate-700 overflow-hidden">
      <aside className="w-72 bg-white border-r border-slate-200 p-8 flex flex-col shadow-xl z-50 h-full">
        <div className="mb-10 flex flex-col items-center"> 
          <div className="italic text-center">
            <h1 className="text-sm font-black uppercase text-slate-800 leading-none">Vault V21</h1>
            <p className="text-[8px] text-indigo-400 font-bold uppercase mt-1 tracking-widest">Comando Militare Lombardia</p>
          </div> 
        </div>
        <nav className="space-y-1.5 flex-1 overflow-y-auto no-scrollbar">
          {[ 
            { id: 'dashboard', label: 'Analisi' }, 
            { id: 'works', label: 'Lavori' }, 
            { id: 'idvs', label: 'Fondi' }, 
            { id: 'planning', label: 'Obiettivi' }, 
            { id: 'comms', label: 'Tactical Comms' },
            { id: 'audit', label: 'Ledger' }, 
            { id: 'manual', label: 'Guida' }
          ].map(item => (
            <button 
              key={item.id} 
              onClick={() => { setView(item.id as any); }} 
              className={`w-full flex items-center justify-between px-6 py-4 rounded-[1.5rem] transition-all relative ${view === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
            > 
              <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span> 
            </button> 
          ))}
        </nav>
        <div className="mt-auto pt-6 border-t border-slate-100 text-center"> 
          <span className="text-[8px] font-black text-slate-400 uppercase italic">{currentUser.role}</span> 
          <p className="text-xs font-black text-indigo-600 uppercase mt-1 truncate">{currentUser.username} [{currentUser.workgroup}]</p> 
          <button onClick={() => window.location.reload()} className="w-full mt-4 py-3 text-[9px] font-black text-rose-500 uppercase hover:bg-rose-50 rounded-xl transition-all border border-rose-100">Esci</button> 
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <header className="bg-white px-10 py-5 flex justify-between items-center border-b border-slate-200 z-40 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-6"> 
            <div>
              <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter leading-none">Vault Management System</h2>
              <div className="flex items-center gap-2 mt-1">
                 <span className="text-[9px] font-black text-slate-400 uppercase italic">Ufficio Attivo: {currentUser.workgroup}</span>
              </div>
            </div> 
            <div className="h-8 w-[1px] bg-slate-100 mx-1"></div>
            <div className="flex flex-col">
               <span className="text-[7px] font-black text-slate-300 uppercase italic tracking-widest leading-none mb-1">Database Master</span>
               <div className="flex items-center gap-2">
                 <span className="text-[10px] font-black text-slate-800 uppercase italic truncate max-w-[200px]">{activeFileName}</span>
                 <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                   syncStatus === 'synced' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                   syncStatus === 'remote-update' ? 'bg-indigo-500 animate-bounce' : 
                   'bg-amber-500 animate-pulse'
                 }`}></div>
               </div>
            </div>
          </div>
          <EsercitoLogo size="sm" />
        </header>

        <div className="flex-1 overflow-hidden p-10 bg-slate-50/50">
          <div className="max-w-[1400px] mx-auto w-full h-full">
            {view === 'dashboard' && <Dashboard idvs={state.idvs} orders={state.orders} onChapterClick={(c) => { }} />}
            {view === 'works' && <Catalog orders={state.orders} idvs={state.idvs} onAdd={() => {}} onStageClick={() => {}} onToggleLock={() => {}} onDelete={() => {}} onChapterClick={() => {}} currentUser={currentUser} />}
            {view === 'comms' && <Messenger messages={state.chatMessages || []} currentUser={currentUser} allUsers={state.users} onSendMessage={handleSendMessage} onReadChat={handleMarkChatRead} />}
            {view === 'audit' && <AuditLog log={state.auditLog} />}
            {view === 'manual' && <Manual />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
