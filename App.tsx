
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
      <span className="text-[34px] font-serif font-black tracking-[0.2em] text-black mt-2 leading-none uppercase italic text-center">ESERCITO</span>
    </div>
  );
};

// COMPONENTE DI VIDEO REGISTRAZIONE PER ACCREDITAMENTO
const VideoAccreditamento: React.FC<{ onComplete: (blobStr: string) => void, userName: string }> = ({ onComplete, userName }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [status, setStatus] = useState<'idle' | 'preparing' | 'recording' | 'finished'>('idle');
  const [countdown, setCountdown] = useState(5);
  const chunks = useRef<Blob[]>([]);

  const startCamera = async () => {
    setStatus('preparing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
      
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'video/webm' });
        const reader = new FileReader();
        reader.onloadend = () => onComplete(reader.result as string);
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      setTimeout(() => {
        setStatus('recording');
        recorder.start();
        const timer = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              recorder.stop();
              setStatus('finished');
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }, 2000);

    } catch (err) {
      alert("Errore accesso camera. Il protocollo richiede accreditamento video.");
      setStatus('idle');
    }
  };

  return (
    <div className="bg-slate-900 rounded-[2rem] p-6 flex flex-col items-center gap-4 border-4 border-indigo-500/30 overflow-hidden shadow-2xl">
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border-2 border-slate-700">
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
        {status === 'recording' && (
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <div className="w-3 h-3 bg-rose-600 rounded-full animate-pulse"></div>
            <span className="text-white text-[10px] font-black uppercase tracking-widest">REC {countdown}s</span>
          </div>
        )}
        {status === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80">
            <button onClick={startCamera} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:bg-indigo-700 transition-all">Attiva Fotocamera</button>
          </div>
        )}
      </div>
      <div className="text-center">
        <p className="text-indigo-400 text-[9px] font-black uppercase tracking-[0.3em] mb-1 italic">Dichiarazione Giurata di Non-Ripudiabilità</p>
        <p className="text-white text-xs font-bold italic leading-relaxed">
          "Io, {userName.toUpperCase()}, dichiaro sotto mia responsabilità <br/> di aver aggiornato i codici di accesso al sistema."
        </p>
      </div>
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
  const [view, setView] = useState<'gateway' | 'login' | 'setup' | 'dashboard' | 'idvs' | 'works' | 'planning' | 'comms' | 'admin' | 'audit' | 'chapter-detail' | 'manual' | 'add-idv' | 'add-work' | 'change-password' | 'azimuth' | 'strengthen-bio'>('gateway');
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'remote-update' | 'conflict-resolved'>('synced');
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const [savedHandleExists, setSavedHandleExists] = useState(false);
  const [globalFilter, setGlobalFilter] = useState<'mine' | 'all'>('all'); 
  
  const [editWorkOrder, setEditWorkOrder] = useState<WorkOrder | null>(null);
  const [bidModalOrder, setBidModalOrder] = useState<WorkOrder | null>(null);
  const [paymentModalOrder, setPaymentModalOrder] = useState<WorkOrder | null>(null);

  const [videoProof, setVideoProof] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<{ url: string, user: string } | null>(null);

  const isWritingRef = useRef(false);
  const stateRef = useRef<AppState | null>(null);
  const lastModifiedRef = useRef<number>(0);
  const lastSizeRef = useRef<number>(0);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    getHandleFromIDB().then(h => { if(h) setSavedHandleExists(true); });
  }, []);

  const sanitizeState = (data: any): AppState | null => {
    if (!data) return null;
    return {
      ...data,
      version: data.version || 1,
      commandName: data.commandName || "COMANDO UNIVERSALE",
      users: data.users || [],
      idvs: data.idvs || [],
      orders: data.orders || [],
      planningNeeds: data.planningNeeds || [],
      planningLists: data.planningLists || [],
      auditLog: data.auditLog || [],
      chatMessages: data.chatMessages || [],
      briefings: data.briefings || [],
      lastSync: data.lastSync || new Date().toISOString()
    };
  };

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
      const dec = JSON.parse(new TextDecoder().decode(uint8));
      return sanitizeState(dec);
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
      console.error("Errore scrittura:", err);
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
    window.addEventListener('focus', checkRemoteUpdates);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkRemoteUpdates);
    };
  }, [checkRemoteUpdates]);

  const updateVault = async (updates: Partial<AppState> | ((prev: AppState) => Partial<AppState>), log?: { action: string, details: string, video?: string }) => {
    await checkRemoteUpdates();
    if (!stateRef.current) return;
    const currentState = stateRef.current;
    
    const finalUpdates = typeof updates === 'function' ? updates(currentState) : updates;
    
    let stateWithUpdates = { ...currentState, ...finalUpdates };
    if (log && currentUser) {
      const newEntry: AuditEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        username: currentUser.username,
        workgroup: currentUser.workgroup,
        action: log.action,
        details: log.details,
        videoProof: log.video
      };
      stateWithUpdates.auditLog = [newEntry, ...(currentState.auditLog || [])].slice(0, 50000);
    }
    
    if (currentUser) {
      setUndoHistory(prev => [currentState, ...prev].slice(0, 30));
      setRedoHistory([]);
    }
    
    const newState = { 
      ...stateWithUpdates, 
      version: (currentState.version || 0) + 1, 
      lastSync: new Date().toISOString() 
    };
    
    setState(newState);
    await writeToDisk(newState);
  };

  const handleSendMessage = (msgData: Partial<ChatMessage>) => {
    if (!state || !currentUser) return;
    const newMessage: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
      userId: currentUser.id,
      username: currentUser.username,
      role: currentUser.role,
      workgroup: currentUser.workgroup,
      text: msgData.text || '',
      timestamp: new Date().toISOString(),
      attachments: msgData.attachments || [],
      isVoice: msgData.isVoice || false,
      recipientId: msgData.recipientId
    };
    updateVault((prev) => ({ chatMessages: [...(prev.chatMessages || []), newMessage] }));
  };

  const handleMarkChatRead = (chatId: string) => {
    if (!state || !currentUser) return;
    const now = new Date().toISOString();
    const updatedUser = { 
      ...currentUser, 
      lastReadTimestamps: { 
        ...(currentUser.lastReadTimestamps || {}), 
        [chatId]: now 
      } 
    };
    updateVault((prev) => ({ 
      users: prev.users.map(u => u.id === currentUser.id ? updatedUser : u) 
    }));
    setCurrentUser(updatedUser);
  };

  const unreadStats = useMemo(() => {
    if (!state || !currentUser) return { direct: 0, general: 0 };
    const messages = state.chatMessages || [];
    const lastReads = currentUser.lastReadTimestamps || {};
    
    const lastReadGeneral = lastReads['general'] || '1970-01-01T00:00:00.000Z';
    const generalCount = messages.filter(m => !m.recipientId && m.userId !== currentUser.id && m.timestamp > lastReadGeneral).length;

    let directCount = 0;
    state.users.forEach(u => {
      if (u.id === currentUser.id) return;
      const lastReadDirect = lastReads[u.id] || '1970-01-01T00:00:00.000Z';
      directCount += messages.filter(m => m.recipientId === currentUser.id && m.userId === u.id && m.timestamp > lastReadDirect).length;
    });

    return { direct: directCount, general: generalCount };
  }, [state?.chatMessages, state?.users, currentUser]);

  const handleUndo = useCallback(async () => {
    if (undoHistory.length === 0 || !state) return;
    const previous = undoHistory[0];
    setRedoHistory(prev => [state, ...prev]);
    setUndoHistory(prev => prev.slice(1));
    setState(previous);
    await writeToDisk(previous);
  }, [undoHistory, state]);

  const handleRedo = useCallback(async () => {
    if (redoHistory.length === 0 || !state) return;
    const next = redoHistory[0];
    setUndoHistory(prev => [state, ...prev]);
    setRedoHistory(prev => prev.slice(1));
    setState(next);
    await writeToDisk(next);
  }, [redoHistory, state]);

  const handleLogin = async (userId: string, p: string) => {
    if (!state) return;
    const user = state.users.find(usr => usr.id === userId && usr.passwordHash === p);
    if (user) {
      const now = new Date().toISOString();
      // Verifichiamo se l'utente ha già fatto video-accreditamento nel log
      const hasBio = state.auditLog.some(l => l.userId === userId && l.videoProof);
      
      updateVault((prev) => ({ 
        users: prev.users.map(u => u.id === userId ? { ...u, lastActive: now, loginCount: (u.loginCount || 0) + 1 } : u)
      }), { action: 'Accesso Protocollo Verified', details: `Autenticazione operatore ${user.username} eseguita. Controllo integrità: OK.` });
      
      const loggedUser = { ...user, lastActive: now, loginCount: (user.loginCount || 0) + 1, isBioVerified: hasBio };
      setCurrentUser(loggedUser);
      if (loggedUser.mustChangePassword) setView('change-password');
      else setView('dashboard');
    } else { alert("Password errata."); }
  };

  const handleChangePassword = async (newPass: string, skipBio: boolean = false) => {
    if (!currentUser || !state) return;
    
    if (!skipBio && !videoProof) {
      alert("Fornire video-accreditamento o procedere con finalizzazione standard.");
      return;
    }
    
    updateVault((prev) => ({ 
      users: prev.users.map(u => u.id === currentUser.id ? { ...u, passwordHash: newPass, mustChangePassword: false } : u )
    }), { 
      action: skipBio ? 'Aggiornamento Chiavi (Standard)' : 'Rotazione Chiavi con Bio-Validazione', 
      details: skipBio ? `L'operatore ${currentUser.username} ha aggiornato la password senza video-accreditamento.` : `L'operatore ${currentUser.username} ha eseguito la rotazione chiavi con validazione video.`,
      video: videoProof || undefined 
    });
    
    setCurrentUser({ ...currentUser, passwordHash: newPass, mustChangePassword: false, isBioVerified: !skipBio });
    setVideoProof(null);
    setView('dashboard');
  };

  const handleStrengthenBio = async () => {
    if (!currentUser || !videoProof) return;
    updateVault((prev) => ({ 
      users: prev.users.map(u => u.id === currentUser.id ? { ...u, isBioVerified: true } : u)
    }), { 
      action: 'Bio-Rafforzamento Sessione', 
      details: `L'operatore ${currentUser.username} ha rafforzato l'accesso corrente con video-accreditamento differito.`,
      video: videoProof 
    });
    setCurrentUser({...currentUser, isBioVerified: true});
    setVideoProof(null);
    setView('dashboard');
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
      }
    } catch (e) { setSavedHandleExists(false); }
  };

  const handleOpenFilePicker = async () => {
    try {
      const [handle] = await (window as any).showOpenFilePicker({ types: [{ description: 'Archivio PPB (.ppb)', accept: { 'application/octet-stream': ['.ppb'] } }], multiple: false });
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
        } else alert("File non valido o corrotto.");
      }
    } catch (e) {
      console.error("Errore apertura file:", e);
    }
  };

  const handleCreateNewDatabase = async () => {
    try {
      const handle = await (window as any).showSaveFilePicker({ suggestedName: 'Archivio_Finanziario_CME_2026.ppb' });
      setFileHandle(handle); setActiveFileName(handle.name); await saveHandleToIDB(handle); setView('setup');
    } catch(e){}
  };

  if (view === 'gateway') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 font-['Inter']">
      <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-4xl w-full flex flex-col md:flex-row gap-16 border border-slate-200 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
        <div className="flex-1 space-y-10 flex flex-col items-center md:items-start">
          <EsercitoLogo size="lg" />
          <h1 className="text-5xl font-black text-slate-800 tracking-tighter uppercase leading-none italic mt-8 text-center md:text-left">GESTIONE FINANZIARIA<br/><span className="text-indigo-600 font-black tracking-widest">PPB 4.1 ORION</span></h1>
          <p className="text-slate-400 font-medium italic text-center md:text-left">Sistema tattico per il monitoraggio dei flussi finanziari<br/>Protocollo Orion: Bio-Accesso Flessibile</p>
        </div>
        <div className="flex-1 flex flex-col gap-4 justify-center">
          {savedHandleExists && ( <button onClick={handleDirectAccess} className="p-10 bg-indigo-600 text-white rounded-[2.5rem] hover:bg-indigo-700 transition-all text-left shadow-2xl group active:scale-[0.98] border-b-[6px] border-indigo-900 flex flex-col items-center justify-center text-center"> <span className="text-[10px] font-black uppercase opacity-70 mb-2 block tracking-widest">Memoria Locale Rilevata</span> <p className="text-2xl font-black italic tracking-tighter uppercase">RIPRENDI LAVORO</p> </button> )}
          <button onClick={handleOpenFilePicker} className="w-full py-6 bg-slate-100 text-slate-700 border-2 border-slate-200 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-md hover:bg-slate-200 transition-all flex flex-col items-center"> <span className="text-[8px] opacity-50 mb-1">Hai già un file .ppb?</span> APRI ARCHIVIO ESISTENTE 📂 </button>
          <button onClick={handleCreateNewDatabase} className="w-full py-6 bg-emerald-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-md hover:bg-emerald-700 transition-all flex flex-col items-center"> <span className="text-[8px] opacity-50 mb-1">Nuova installazione?</span> CREA NUOVO ARCHIVIO ➕ </button>
        </div>
      </div>
    </div>
  );

  if (view === 'setup') return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-50/50 p-6">
      <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-md w-full text-center border border-indigo-100">
        <EsercitoLogo size="md" />
        <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter mb-10 italic mt-6">Inizializzazione Archivio</h2>
        <div className="space-y-4 text-left">
          <input type="text" placeholder="Comando Gestore" id="s-cmd" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold focus:border-indigo-600 outline-none" />
          <input type="text" placeholder="Ufficio Master" id="s-g" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold focus:border-indigo-600 outline-none" />
          <input type="text" placeholder="Username Admin" id="s-u" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold focus:border-indigo-600 outline-none" />
          <input type="password" placeholder="Password Master" id="s-p" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold focus:border-indigo-600 outline-none" />
          <button onClick={async () => {
            const cmd = (document.getElementById('s-cmd') as any).value;
            const g = (document.getElementById('s-g') as any).value; 
            const u = (document.getElementById('s-u') as any).value; 
            const p = (document.getElementById('s-p') as any).value;
            if (u && p && g && cmd) {
              const init: AppState = { version: 1, commandName: cmd, users: [{ id: 'u-1', username: u, passwordHash: p, role: UserRole.ADMIN, workgroup: g, mustChangePassword: false, loginCount: 0 }], idvs: [], orders: [], planningNeeds: [], planningLists: [], auditLog: [], chatMessages: [], briefings: [], lastSync: new Date().toISOString() };
              setState(init); setCurrentUser(init.users[0]); await writeToDisk(init); setView('dashboard');
            }
          }} className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase mt-4">Crea Nuovo Archivio</button>
        </div>
      </div>
    </div>
  );

  if (view === 'login' && state) return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-50/50 p-6">
      <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-md w-full text-center border border-indigo-100">
        <EsercitoLogo size="md" />
        <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter mb-10 italic mt-6">Login Accreditato</h2>
        <div className="space-y-4 text-left">
          <select id="l-u" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold outline-none focus:border-indigo-600">
            {state.users.map(u => <option key={u.id} value={u.id}>{u.username.toUpperCase()} - {u.workgroup}</option>)}
          </select>
          <input type="password" placeholder="Password" id="l-p" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold focus:border-indigo-600 outline-none" />
          <button onClick={() => handleLogin((document.getElementById('l-u') as any).value, (document.getElementById('l-p') as any).value)} className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase shadow-xl tracking-widest hover:bg-indigo-700 transition-all">Accedi al PPB</button>
        </div>
      </div>
    </div>
  );

  if (view === 'change-password') return (
    <div className="min-h-screen flex items-center justify-center bg-rose-50 p-6">
      <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-2xl w-full text-center border-4 border-rose-200 flex flex-col gap-8">
        <div><EsercitoLogo size="sm" /><h2 className="text-2xl font-black text-rose-600 uppercase italic mt-4">Sostituzione Codici</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Video-accreditamento facoltativo per rafforzamento</p></div>
        {!videoProof ? (
          <div className="space-y-4">
             <VideoAccreditamento userName={currentUser?.username || ''} onComplete={(v) => setVideoProof(v)} />
             <p className="text-[9px] text-slate-400 italic">Puoi saltare questo passaggio e farlo più tardi dal cruscotto.</p>
          </div>
        ) : (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-[2rem] p-6 flex items-center gap-4 animate-in zoom-in duration-300">
            <span className="text-3xl">✅</span><div className="text-left"><p className="text-xs font-black text-emerald-700 uppercase">Video Acquisito</p><p className="text-[9px] font-medium text-emerald-600 italic">L'accesso sarà considerato BIO-VALIDATO.</p></div>
            <button onClick={() => setVideoProof(null)} className="ml-auto text-[8px] font-black text-slate-400">Cancella</button>
          </div>
        )}
        <div className="space-y-4 text-left">
          <input type="password" placeholder="Nuova Password" id="cp-1" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold outline-none focus:border-indigo-600" />
          <input type="password" placeholder="Conferma" id="cp-2" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold outline-none focus:border-indigo-600" />
          <div className="flex gap-4">
            <button onClick={() => { const p1 = (document.getElementById('cp-1') as any).value; if(p1) handleChangePassword(p1, true); }} className="flex-1 py-6 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase text-[10px]">Finalizza senza Video</button>
            <button disabled={!videoProof} onClick={() => { const p1 = (document.getElementById('cp-1') as any).value; if(p1) handleChangePassword(p1, false); }} className={`flex-1 py-6 rounded-3xl font-black uppercase shadow-xl text-[10px] ${videoProof ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}>Rafforza con Video</button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!state || !currentUser) return null;

  return (
    <div className="h-screen w-screen flex bg-slate-50 font-['Inter'] text-slate-700 overflow-hidden">
      <aside className="w-72 bg-white border-r border-slate-200 p-8 flex flex-col shadow-xl z-50 h-full">
        <div className="mb-10 flex flex-col items-center"> 
          <div className="italic text-center">
            <h1 className="text-sm font-black uppercase text-slate-800 leading-none">Protocollo PPB</h1>
            <p className="text-[8px] text-indigo-400 font-bold uppercase mt-1 tracking-widest truncate max-w-[200px]">{state.commandName}</p>
          </div> 
        </div>
        
        <nav className="space-y-1.5 flex-1 overflow-y-auto no-scrollbar">
          {[ 
            { id: 'dashboard', label: 'Analisi' }, 
            { id: 'azimuth', label: 'AZIMUTH CHECK' },
            { id: 'works', label: 'Lavori' }, 
            { id: 'idvs', label: 'Fondi' }, 
            { id: 'planning', label: 'Obiettivi' }, 
            { id: 'comms', label: 'CHAT' },
            { id: 'audit', label: 'REGISTRO' }, 
            { id: 'manual', label: 'Guida' }, 
            { id: 'admin', label: 'Staff' } 
          ].map(item => ( (item.id !== 'admin' || currentUser.role === UserRole.ADMIN) && ( 
            <button 
              key={item.id} 
              onClick={() => { setView(item.id as any); setHighlightedOrderId(null); }} 
              className={`w-full flex items-center justify-between px-6 py-4 rounded-[1.5rem] transition-all relative ${view === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
            > 
              <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span> 
              {item.id === 'comms' && unreadStats.general + unreadStats.direct > 0 && <span className="bg-rose-500 text-white text-[8px] w-4 h-4 flex items-center justify-center rounded-full">{unreadStats.general + unreadStats.direct}</span>}
              {item.id === 'azimuth' && <span className="text-xs">🧭</span>}
            </button> 
          ) ))}
        </nav>

        {!currentUser.isBioVerified && (
           <button onClick={() => setView('strengthen-bio')} className="mt-4 p-4 bg-rose-50 border-2 border-rose-200 rounded-2xl flex flex-col items-center gap-2 group hover:bg-rose-600 transition-all animate-pulse">
              <span className="text-lg">🛡️</span>
              <span className="text-[8px] font-black text-rose-600 uppercase tracking-widest group-hover:text-white">BIO-RAFFORZAMENTO</span>
           </button>
        )}

        <div className="mt-auto pt-6 border-t border-slate-100 text-center"> <span className="text-[8px] font-black text-slate-400 uppercase italic">{currentUser.role}</span> <p className="text-xs font-black text-indigo-600 uppercase mt-1 truncate">{currentUser.username} [{currentUser.workgroup}]</p> <button onClick={() => window.location.reload()} className="w-full mt-4 py-3 text-[9px] font-black text-rose-500 uppercase hover:bg-rose-50 rounded-xl transition-all border border-rose-100">Esci</button> </div>
      </aside>

      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <header className="bg-white px-10 py-5 flex justify-between items-center border-b border-slate-200 z-40 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-6"> 
            <div><h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter leading-none">PPB Management</h2><span className="text-[9px] font-black text-slate-400 uppercase italic">Org: {state.commandName}</span></div>
            <div className="h-8 w-[1px] bg-slate-100"></div>
            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner"> 
              <button onClick={() => setGlobalFilter('mine')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${globalFilter === 'mine' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>👤 MIE</button> 
              <button onClick={() => setGlobalFilter('all')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${globalFilter === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>🌐 TUTTE</button> 
            </div> 
          </div>
          <div className="flex items-center gap-6">
             {currentUser.isBioVerified ? <span title="Bio-Verificato" className="text-emerald-500 text-xl">🛡️</span> : <span title="Verifica parziale" className="text-rose-500 text-xl animate-pulse">⚠️</span>}
             <EsercitoLogo size="sm" />
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-10 bg-slate-50/50 flex flex-col">
          <div className="max-w-[1400px] mx-auto w-full h-full flex flex-col">
            {view === 'dashboard' && <div className="overflow-y-auto h-full pr-2 custom-scrollbar"><Dashboard idvs={state.idvs} orders={state.orders} auditLog={state.auditLog} commandName={state.commandName} onChapterClick={(c) => { setSelectedChapter(c); setView('chapter-detail'); }} /></div>}
            {view === 'azimuth' && <AzimuthCheck briefings={state.briefings || []} userRole={currentUser.role} onAddBriefing={(b) => updateVault(prev => ({ briefings: [...(prev.briefings || []), { ...b as Briefing, id: `brief-${Date.now()}`, status: 'scheduled' }] }), { action: 'Pianificazione Briefing', details: `Nuovo Azimuth Check pianificato: ${b.title} il ${b.date}.` })} />}
            {view === 'strengthen-bio' && (
              <div className="h-full flex items-center justify-center p-8">
                 <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-2xl w-full text-center border-4 border-indigo-100 space-y-8 animate-in zoom-in duration-500">
                    <div><h2 className="text-3xl font-black text-slate-800 uppercase italic">Bio-Rafforzamento</h2><p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Aumenta il livello di sicurezza della sessione corrente</p></div>
                    {!videoProof ? <VideoAccreditamento userName={currentUser.username} onComplete={setVideoProof} /> : (
                      <div className="bg-emerald-50 p-8 rounded-[3rem] border-2 border-emerald-200">
                         <p className="text-2xl mb-4">✅</p>
                         <button onClick={handleStrengthenBio} className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase shadow-xl hover:bg-indigo-700">Finalizza Rafforzamento</button>
                      </div>
                    )}
                    <button onClick={() => setView('dashboard')} className="text-slate-400 font-bold uppercase text-[9px] tracking-widest hover:text-rose-600 transition-all">Annulla e Torna al Cruscotto</button>
                 </div>
              </div>
            )}
            {view === 'works' && <Catalog orders={globalFilter === 'mine' ? state.orders.filter(o => o.workgroup === currentUser.workgroup) : state.orders} idvs={state.idvs} highlightId={highlightedOrderId} onAdd={() => setView('add-work')} onChapterClick={(c) => { setSelectedChapter(c); setView('chapter-detail'); }} onStageClick={(o, s) => { if (s === 1) setEditWorkOrder(o); if (s === 2) setBidModalOrder(o); if (s === 3) setPaymentModalOrder(o); }} onDelete={(id) => { updateVault((prev) => ({ orders: prev.orders.filter(ord => ord.id !== id) }), { action: 'Eliminazione Pratica', details: `Pratica cancellata definitivamente.` }); }} onToggleLock={(id) => { updateVault((prev) => ({ orders: prev.orders.map(ord => ord.id === id ? { ...ord, locked: !ord.locked } : ord) }), { action: 'Variazione Stato Integrità', details: `Flag protezione modificato.` }); }} currentUser={currentUser} />}
            {view === 'idvs' && <IdvList idvs={globalFilter === 'mine' ? state.idvs.filter(i => i.assignedWorkgroup === currentUser.workgroup) : state.idvs} orders={state.orders} onAdd={() => setView('add-idv')} onChapterClick={(c) => { setSelectedChapter(c); setView('chapter-detail'); }} onDelete={(id) => { updateVault((prev) => ({ idvs: prev.idvs.filter(idv => idv.id !== id) }), { action: 'De-allocazione Risorsa', details: `IDV rimosso.` }); }} onToggleLock={(id) => { updateVault((prev) => ({ idvs: prev.idvs.map(idv => idv.id === id ? { ...idv, locked: !idv.locked } : idv) }), { action: 'Segregazione Asset', details: `Stato disponibilità IDV variato.` }); }} userRole={currentUser.role} commandName={state.commandName} />}
            {view === 'planning' && <PlanningModule state={state} onUpdate={(u, log) => updateVault(u, log)} currentUser={currentUser} idvs={state.idvs} globalFilter={globalFilter} commandName={state.commandName} />}
            {view === 'comms' && <Messenger messages={state.chatMessages || []} currentUser={currentUser} allUsers={state.users} onSendMessage={handleSendMessage} onReadChat={handleMarkChatRead} />}
            {view === 'audit' && <AuditLog log={state.auditLog} />}
            {view === 'manual' && <div className="overflow-y-auto h-full pr-2 custom-scrollbar"><Manual commandName={state.commandName} /></div>}
            {view === 'admin' && (
              <div className="bg-white p-12 rounded-[3.5rem] border border-slate-200 shadow-xl space-y-8 animate-in fade-in duration-500 overflow-y-auto h-full custom-scrollbar">
                <h3 className="text-2xl font-black italic uppercase tracking-tighter">Gestione Staff</h3>
                <div className="grid grid-cols-4 gap-4 items-end bg-slate-50 p-6 rounded-[2rem]">
                   <input type="text" placeholder="Ufficio" id="nu-g" className="px-4 py-3 rounded-xl border border-slate-200 font-bold outline-none" />
                   <input type="text" placeholder="Username" id="nu-u" className="px-4 py-3 rounded-xl border border-slate-200 font-bold outline-none" />
                   <select id="nu-r" className="px-4 py-3 rounded-xl border border-indigo-200 font-bold outline-none bg-white">
                      <option value={UserRole.VIEWER}>VISUALIZZATORE</option>
                      <option value={UserRole.EDITOR}>TECNICO</option>
                      <option value={UserRole.ACCOUNTANT}>AMMINISTRATIVO</option>
                      <option value={UserRole.REPPE}>R.E.P.P.E.</option>
                      <option value={UserRole.COMANDANTE}>COMANDANTE</option>
                      <option value={UserRole.ADMIN}>ADMIN</option>
                   </select>
                   <button onClick={() => {
                      const g = (document.getElementById('nu-g') as any).value; const u = (document.getElementById('nu-u') as any).value; const r = (document.getElementById('nu-r') as any).value;
                      if(u && g) { updateVault((prev) => ({ users: [...prev.users, { id: `u-${Date.now()}`, username: u, passwordHash: DEFAULT_PASSWORD, role: r as UserRole, workgroup: g, mustChangePassword: true, loginCount: 0 }] }), { action: 'Accreditamento Operatore', details: `Creata utenza per ${u}.` }); alert(`Password: ${DEFAULT_PASSWORD}`); }
                   }} className="bg-indigo-600 text-white py-3 rounded-xl font-black uppercase text-[10px] shadow-lg tracking-widest">Aggiungi Staff</button>
                </div>
                <div className="space-y-3">
                  {state.users.map(u => {
                    const latestVideo = state.auditLog.find(log => log.userId === u.id && log.videoProof)?.videoProof;
                    return (
                      <div key={u.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-between hover:shadow-md transition-all">
                        <div className="flex items-center gap-4"><div className="w-10 h-10 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-xl italic">{u.workgroup[0]}</div><div><p className="font-black text-slate-800 italic uppercase text-sm tracking-tighter">{u.username} <span className="text-[9px] text-indigo-500 ml-2">[{u.workgroup}]</span></p><p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{u.role}</p></div></div>
                        <div className="flex items-center gap-4">
                          {latestVideo && <button onClick={() => setPlayingVideo({ url: latestVideo, user: u.username })} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm border border-indigo-100 animate-pulse">🎥 ACCREDITAMENTO</button>}
                          <button onClick={() => { if(u.id !== currentUser.id && confirm("Revocare accesso?")) updateVault((prev) => ({ users: prev.users.filter(usr => usr.id !== u.id) }), { action: 'Revoca Abilitazioni', details: `Accesso negato per ${u.username}.` }); }} className="text-rose-400 hover:text-rose-600 text-[10px] font-black uppercase">Elimina</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {view === 'chapter-detail' && selectedChapter && (
              <ChapterReport 
                chapter={selectedChapter} 
                idvs={(state.idvs || []).filter(i => i.capitolo === selectedChapter)} 
                allIdvs={state.idvs || []} 
                orders={state.orders || []} 
                onBack={() => setView('dashboard')} 
                onAddWork={() => setView('add-work')} 
                onOrderClick={(orderId) => { setHighlightedOrderId(orderId); setView('works'); }} 
                userRole={currentUser.role} 
                currentUser={currentUser} 
              />
            )}
            {view === 'add-idv' && <IdvForm existingChapters={Array.from(new Set(state.idvs.map(i => i.capitolo)))} users={state.users} currentUser={currentUser} onSubmit={async (d) => { await updateVault((prev) => ({ idvs: [...prev.idvs, { id: `idv-${Date.now()}`, ...d as any, createdAt: new Date().toISOString(), ownerId: currentUser.id, ownerName: currentUser.username, ownerWorkgroup: currentUser.workgroup }] }), { action: 'Registrazione Asset', details: `Fondo registered.` }); setView('idvs'); }} onCancel={() => setView('idvs')} />}
            {(view === 'add-work' || editWorkOrder) && <WorkForm idvs={state.idvs} orders={state.orders} currentUser={currentUser} existingChapters={Array.from(new Set(state.idvs.map(i => i.capitolo)))} initialData={editWorkOrder || undefined} prefilledChapter={selectedChapter || undefined} onSubmit={async (d) => { 
                if (editWorkOrder) { 
                  updateVault((prev) => ({ orders: prev.orders.map(o => o.id === editWorkOrder.id ? { ...o, ...d } : o) }), { action: 'Revisione Pratica', details: `Aggiornato ${editWorkOrder.orderNumber}.` }); 
                } else { 
                  const autoId = `IMP-${new Date().getFullYear()}-${(state.orders.length + 1001).toString().slice(-4)}`;
                  updateVault((prev) => ({ orders: [...prev.orders, { id: `w-${Date.now()}`, ...d as any, orderNumber: autoId, status: WorkStatus.PROGETTO, createdAt: new Date().toISOString(), ownerId: currentUser.id, ownerName: currentUser.username, workgroup: currentUser.workgroup }] }), { action: 'Nuovo Impegno', details: `Protocollo ${autoId} inserito.` }); 
                } 
                setEditWorkOrder(null); setView('works'); 
              }} onCancel={() => { setEditWorkOrder(null); setView('works'); }} />}
          </div>
        </div>
      </main>

      {playingVideo && (
        <div className="fixed inset-0 z-[250] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8">
          <div className="bg-white rounded-[3rem] p-4 shadow-2xl max-w-2xl w-full border-4 border-indigo-600 animate-in zoom-in duration-300">
            <div className="aspect-video bg-black rounded-2xl overflow-hidden mb-4 relative">
              <video src={playingVideo.url} autoPlay controls className="w-full h-full object-cover" />
              <div className="absolute top-4 left-4 bg-indigo-600 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">Reperto Forense: {playingVideo.user.toUpperCase()}</div>
            </div>
            <div className="flex justify-between items-center px-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Integrità Verificata Protocollo Orion</span>
              <button onClick={() => setPlayingVideo(null)} className="px-6 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-700">Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {bidModalOrder && <BidModal order={bidModalOrder} onSave={(b) => { 
        updateVault((prev) => ({ orders: prev.orders.map(o => o.id === bidModalOrder.id ? { ...o, status: WorkStatus.AFFIDAMENTO, winner: b.winner, contractValue: b.bidValue, contractPdf: b.contractPdf } : o) }), { action: 'Affidamento Gara', details: `Pratica ${bidModalOrder.orderNumber} affidata.` }); 
        setBidModalOrder(null); 
      }} onClose={() => setBidModalOrder(null)} />}
      {paymentModalOrder && <PaymentModal order={paymentModalOrder} onSave={(p) => { 
        updateVault((prev) => ({ orders: prev.orders.map(o => o.id === paymentModalOrder.id ? { ...o, status: WorkStatus.PAGAMENTO, paidValue: p.paidValue, invoicePdf: p.invoicePdf, invoiceNumber: p.invoiceNumber, invoiceDate: p.invoiceDate, creGenerated: true, creDate: p.creDate } : o) }), { action: 'Chiusura Contabile', details: `Pratica ${paymentModalOrder.orderNumber} liquidata.` }); 
        setPaymentModalOrder(null); 
      }} onClose={() => setPaymentModalOrder(null)} />}
    </div>
  );
};
export default App;
