
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
      <div className="flex flex-col items-center">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500/30 blur-3xl rounded-full animate-pulse"></div>
          <svg width="60" height="60" viewBox="0 0 100 95" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-spin duration-[3000ms] relative z-10">
            <path d="M50 0L61.2257 34.5492H97.5528L68.1636 55.9017L79.3893 90.4508L50 69.0983L20.6107 90.4508L31.8364 55.9017L2.44717 34.5492H38.7743L50 0Z" fill="#D4AF37"/>
          </svg>
          <div className="absolute inset-[-15px] border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>
        <p className="text-white font-black uppercase text-[10px] tracking-[0.4em] mt-10 animate-pulse italic">Cifratura DNA in corso...</p>
      </div>
    </div>
  );
};

const EsercitoLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const scale = size === 'sm' ? 'scale-[0.45]' : size === 'md' ? 'scale-[0.7]' : 'scale-100';
  const margin = size === 'sm' ? '-my-4' : size === 'md' ? '-my-2' : 'my-0';
  return (
    <div className={`flex flex-col items-center justify-center transform ${scale} ${margin} select-none origin-right`}>
      <svg width="100" height="95" viewBox="0 0 100 95" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md">
        <path d="M50 0L61.2257 34.5492H97.5528L68.1636 55.9017L79.3893 90.4508L50 69.0983L20.6107 90.4508L31.8364 55.9017L2.44717 34.5492H38.7743L50 0Z" fill="#B58900"/>
        <path d="M50 0L50 69.0983L20.6107 90.4508L31.8364 55.9017L2.44717 34.5492H38.7743L50 0Z" fill="#D4AF37"/>
      </svg>
      <span className="text-[34px] font-serif font-black tracking-[0.2em] text-black mt-2 leading-none uppercase italic text-center text-nowrap">ESERCITO</span>
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

const ResponsibilityAccreditation: React.FC<{ vaultId: string, user: User, onComplete: (video: string, photo: string) => void, onSkip: () => void }> = ({ vaultId, user, onComplete, onSkip }) => {
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(20);
  const [videoBlob, setVideoBlob] = useState<string | null>(null);
  const [tempPhoto, setTempPhoto] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) { console.warn("Accesso cam fallito"); }
  };

  useEffect(() => { if (!videoBlob) startStream(); }, [videoBlob]);

  const captureFrame = () => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.8);
    }
    return null;
  };

  const startRecording = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    if (!stream) { alert("Nessun input video rilevato."); return; }
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const reader = new FileReader();
      reader.onload = () => { 
        setVideoBlob(reader.result as string); 
        stream.getTracks().forEach(t => t.stop());
      };
      reader.readAsDataURL(blob);
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
    setCountdown(20);
    timerRef.current = window.setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { 
           const photo = captureFrame(); 
           setTempPhoto(photo);
           stopRecording(); 
           return 0; 
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  return (
    <div className="bg-slate-900 rounded-[3rem] p-10 shadow-2xl max-w-3xl w-full border-4 border-indigo-600 flex flex-col items-center animate-in zoom-in duration-300 font-['Inter']">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter leading-none text-nowrap">Dichiarazione Assunzione Responsabilità</h2>
        <p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest mt-2 italic">Protocollo Forense Identità Operativa (20s)</p>
      </div>

      <div className="relative w-full aspect-video bg-black rounded-[2rem] overflow-hidden border-2 border-white/20 shadow-inner group">
        {!videoBlob ? (
          <>
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start">
               <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
                  <p className="text-[8px] font-black text-white/50 uppercase tracking-widest">DNA VAULT</p>
                  <p className="text-lg font-mono font-black text-indigo-400 leading-none">{vaultId}</p>
               </div>
               {recording && <div className="bg-rose-600 text-white px-4 py-2 rounded-xl font-black text-xl animate-pulse shadow-lg">REC: {countdown}s</div>}
            </div>
            {!recording && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <button onClick={startRecording} className="px-10 py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-2xl hover:scale-110 transition-all border-b-[6px] border-indigo-900 active:translate-y-1">Avvia Registrazione Bio-Forense</button>
              </div>
            )}
          </>
        ) : (
          <>
            <video src={videoBlob} controls className="w-full h-full object-cover" />
            <div className="absolute top-4 left-4 z-20">
               {tempPhoto && (
                 <div className="w-20 h-20 rounded-xl border-4 border-indigo-600 overflow-hidden shadow-2xl bg-black">
                    <img src={tempPhoto} className="w-full h-full object-cover" alt="Biometric Thumbnail" />
                 </div>
               )}
            </div>
            <div className="absolute top-4 right-4">
               <span className="bg-emerald-500 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow-lg">Review Registrazione Pronta</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-8 bg-white/5 p-6 rounded-2xl border border-white/10 w-full">
        <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-3 italic text-center">Formula da recitare chiaramente:</p>
        <p className="text-lg font-serif italic text-white leading-relaxed text-center">
          "Io <strong>{user.username}</strong>, con ruolo <strong>{user.role}</strong>, <br/> 
          assumo piena responsabilità per l'accesso al DNA <strong>{vaultId}</strong>"
        </p>
      </div>

      <div className="mt-8 w-full flex flex-col gap-3">
        {videoBlob ? (
          <div className="flex gap-4">
            <button onClick={() => { setVideoBlob(null); setTempPhoto(null); setCountdown(20); }} className="flex-1 py-5 bg-slate-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-600 transition-all border-b-[6px] border-slate-900 active:translate-y-1">Rifai Registrazione</button>
            <button onClick={() => videoBlob && tempPhoto && onComplete(videoBlob, tempPhoto)} className="flex-[2] py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-emerald-700 transition-all border-b-[6px] border-emerald-900 active:translate-y-1">Finalizza ed Accedi</button>
          </div>
        ) : (
          <button onClick={onSkip} className="w-full py-4 text-slate-500 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors underline decoration-slate-700">Sottoscrivi in un secondo momento</button>
        )}
      </div>
    </div>
  );
};

const FirstLoginSetup: React.FC<{ onComplete: (data: Partial<User>) => void }> = ({ onComplete }) => {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const isReady = pwd.length >= 6 && pwd === confirm;

  return (
    <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-lg w-full border-4 border-indigo-600 animate-in zoom-in duration-300 font-['Inter']">
       <div className="text-center mb-10"><EsercitoLogo size="md" /><h2 className="text-2xl font-black text-slate-800 uppercase italic mt-6 leading-none">Aggiornamento Credenziali</h2><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">Protocollo Sicurezza Obbligatorio</p></div>
       <div className="space-y-6">
          <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100">
             <p className="text-[10px] font-black text-indigo-700 uppercase italic mb-2 leading-tight text-center">Reset Credenziali Eseguito</p>
             <p className="text-[9px] text-indigo-600 italic leading-relaxed text-center">Il tuo profilo è stato resettato. Devi impostare una nuova password personale prima di procedere al nuovo video-accreditamento.</p>
          </div>
          <div className="space-y-4">
             <input type="password" placeholder="Nuova Password" value={pwd} onChange={e => setPwd(e.target.value)} className="w-full px-8 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold focus:border-indigo-600 outline-none shadow-inner" />
             <input type="password" placeholder="Conferma Nuova Password" value={confirm} onChange={e => setConfirm(e.target.value)} className={`w-full px-8 py-4 bg-slate-50 border-2 rounded-2xl font-bold outline-none shadow-inner ${confirm && pwd !== confirm ? 'border-rose-400' : 'border-slate-200 focus:border-indigo-600'}`} />
          </div>
          <button disabled={!isReady} onClick={() => isReady && onComplete({ passwordHash: pwd })} className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase shadow-xl mt-4 disabled:opacity-30 border-b-[6px] border-indigo-900 active:translate-y-1 transition-all">Salva e Vai a Video-Firma</button>
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
  const [activeFileName, setActiveFileName] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [view, setView] = useState<'gateway' | 'login' | 'setup' | 'first-login-setup' | 'responsibility-accreditation' | 'dashboard' | 'idvs' | 'works' | 'planning' | 'comms' | 'admin' | 'audit' | 'chapter-detail' | 'manual' | 'add-idv' | 'add-work' | 'change-password' | 'azimuth'>('gateway');
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'remote-update' | 'conflict-resolved'>('synced');
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const [savedHandleExists, setSavedHandleExists] = useState(false);
  const [savedFileName, setSavedFileName] = useState("");
  const [savedVaultId, setSavedVaultId] = useState("");
  const [globalFilter, setGlobalFilter] = useState<'mine' | 'all'>('all'); 
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [historyFilterId, setHistoryFilterId] = useState<string | null>(null);
  const [activePlanningListId, setActivePlanningListId] = useState<string | null>(null);
  const [prefillIdvData, setPrefillIdvData] = useState<Partial<FundingIDV> | null>(null);
  const [auditFilter, setAuditFilter] = useState('');
  const [auditFromDate, setAuditFromDate] = useState('');
  const [auditToDate, setAuditToDate] = useState('');
  const [editWorkOrder, setEditWorkOrder] = useState<WorkOrder | null>(null);
  const [bidModalOrder, setBidModalOrder] = useState<WorkOrder | null>(null);
  const [paymentModalOrder, setPaymentModalOrder] = useState<WorkOrder | null>(null);

  const isWritingRef = useRef(false);
  const stateRef = useRef<AppState | null>(null);
  const lastModifiedRef = useRef<number>(0);
  const lastSizeRef = useRef<number>(0);

  useEffect(() => { stateRef.current = state; }, [state]);
  
  useEffect(() => { 
    getHandleFromIDB().then(data => { 
      if(data && data.handle) { 
        setSavedHandleExists(true); 
        setSavedFileName(data.handle.name); 
        setSavedVaultId(data.vaultId || "DNA-NON-REGISTRATO");
      } 
    }); 
  }, []);

  const formatEuro = (val: number) => `€ ${val.toLocaleString('it-IT')}`;

  const unreadStats = useMemo(() => {
    if (!state || !currentUser) return { general: 0, direct: 0 };
    const lastReads = currentUser.lastReadTimestamps || {};
    const lastReadGen = lastReads['general'] || '1970-01-01T00:00:00.000Z';
    const general = (state.chatMessages || []).filter(m => !m.recipientId && m.userId !== currentUser.id && m.timestamp > lastReadGen).length;
    const direct = (state.chatMessages || []).filter(m => m.recipientId === currentUser.id && m.timestamp > (lastReads[m.userId] || '1970-01-01T00:00:00.000Z')).length;
    return { general, direct };
  }, [state?.chatMessages, currentUser]);

  const sanitizeState = (data: any): AppState | null => {
    if (!data) return null;
    return {
      ...data,
      vaultId: data.vaultId || `DNA-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      version: data.version || 1,
      commandName: data.commandName || "COMANDO CME",
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
    if (!fileHandle || currentUser?.role === UserRole.VIEWER) return;
    isWritingRef.current = true; setSyncStatus('syncing');
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(encrypt(newState));
      await writable.close();
      const fileAfter = await fileHandle.getFile();
      lastModifiedRef.current = fileAfter.lastModified; lastSizeRef.current = fileAfter.size;
      setSyncStatus('synced');
    } catch (err) { setSyncStatus('error'); } 
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
          lastModifiedRef.current = file.lastModified; lastSizeRef.current = file.size;
          setSyncStatus('remote-update');
          setTimeout(() => setSyncStatus('synced'), 2000);
        } else { lastModifiedRef.current = file.lastModified; lastSizeRef.current = file.size; }
      }
    } catch (e) {}
  }, [fileHandle, view]);

  useEffect(() => {
    const interval = setInterval(checkRemoteUpdates, 2000);
    window.addEventListener('focus', checkRemoteUpdates);
    return () => { clearInterval(interval); window.removeEventListener('focus', checkRemoteUpdates); };
  }, [checkRemoteUpdates]);

  const updateVault = async (updates: Partial<AppState> | ((prev: AppState) => Partial<AppState>), log?: { action: string, details: string, relatedId?: string, videoProof?: string }) => {
    if (currentUser?.role === UserRole.VIEWER) return;
    await checkRemoteUpdates();
    if (!stateRef.current) return;
    const currentState = stateRef.current;
    const finalUpdates = typeof updates === 'function' ? updates(currentState) : updates;
    let stateWithUpdates = { ...currentState, ...finalUpdates };
    if (log && currentUser) {
      stateWithUpdates.auditLog = [{ id: `log-${Date.now()}`, timestamp: new Date().toISOString(), userId: currentUser.id, username: currentUser.username, workgroup: currentUser.role === UserRole.ADMIN ? '(Amministratore)' : currentUser.workgroup, action: log.action, details: log.details, relatedId: log.relatedId, videoProof: log.videoProof }, ...(currentState.auditLog || [])].slice(0, 50000);
    }
    const newState = { ...stateWithUpdates, version: (currentState.version || 0) + 1, lastSync: new Date().toISOString() };
    setState(newState); await writeToDisk(newState);
  };

  const optimisticWorkUpdate = async (updates: Partial<AppState> | ((prev: AppState) => Partial<AppState>), log?: { action: string, details: string, relatedId?: string }) => {
    if (!state) return;
    const currentState = state;
    const finalUpdates = typeof updates === 'function' ? updates(currentState) : updates;
    const nextState = { ...currentState, ...finalUpdates };
    setState(nextState);
    await new Promise(res => setTimeout(res, 800));
    setIsProcessing(true);
    try {
      await updateVault(updates, log);
      await new Promise(res => setTimeout(res, 1200));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogin = async (userId: string, p: string) => {
    if (!state) return;
    setIsProcessing(true);
    try {
      const user = state.users.find(usr => usr.id === userId);
      if (user) {
        if (user.passwordHash === p) {
          const loggedUser = { ...user, lastActive: new Date().toISOString(), loginCount: (user.loginCount || 0) + 1 };
          setCurrentUser(loggedUser);
          
          // FLOW LOGICA RESET: se deve cambiare password o manca il video, lo obblighiamo
          if (user.mustChangePassword || user.isFirstLogin) {
            setView('first-login-setup');
          } else if (!user.accreditationVideo && user.role !== UserRole.VIEWER) {
            setView('responsibility-accreditation');
          } else {
            setView('dashboard');
          }
        } else alert("Chiave di accesso errata.");
      }
    } finally { setIsProcessing(false); }
  };

  const handleTransparencyAccess = async () => {
    if (!state) return;
    setIsProcessing(true);
    try {
      setCurrentUser({ id: 'u-public', username: 'Visualizzatore Pubblico', passwordHash: '', role: UserRole.VIEWER, workgroup: 'ESTERNO', isFirstLogin: false });
      setView('dashboard');
    } finally { setIsProcessing(false); }
  };

  const handleDirectAccess = async () => {
    setIsProcessing(true);
    try {
      const data = await getHandleFromIDB(); if (!data || !data.handle) return;
      const handle = data.handle;
      if (await handle.requestPermission({ mode: 'readwrite' }) === 'granted') {
        const file = await handle.getFile(); const dec = decrypt(await file.text());
        if (dec) { setFileHandle(handle); setActiveFileName(handle.name); setState(dec); lastModifiedRef.current = file.lastModified; lastSizeRef.current = file.size; setView('login'); }
      }
    } catch (e) { setSavedHandleExists(false); }
    finally { setIsProcessing(false); }
  };

  const handleOpenFilePicker = async () => {
    setIsProcessing(true);
    try {
      const [handle] = await (window as any).showOpenFilePicker({ types: [{ description: 'Archivio PPB (.ppb)', accept: { 'application/octet-stream': ['.ppb'] } }], multiple: false });
      if (handle) { 
        const file = await handle.getFile(); 
        const dec = decrypt(await file.text()); 
        if (dec) { 
          setFileHandle(handle); 
          setActiveFileName(handle.name); 
          setState(dec); 
          await saveHandleToIDB(handle, dec.vaultId);
          lastModifiedRef.current = file.lastModified; 
          lastSizeRef.current = file.size; 
          setView('login'); 
        } else alert("File non valido."); 
      }
    } catch (e) {}
    finally { setIsProcessing(false); }
  };

  const handleCreateNewDatabase = async () => {
    setIsProcessing(true);
    try { 
      const handle = await (window as any).showSaveFilePicker({ suggestedName: 'Vault_DNA_2026.ppb' }); 
      setFileHandle(handle); 
      setActiveFileName(handle.name); 
      setView('setup'); 
    } catch(e){}
    finally { setIsProcessing(false); }
  };

  const handleUndo = async () => {
    if (undoHistory.length === 0 || !state) return;
    setIsProcessing(true);
    try {
      const previous = undoHistory[0];
      setRedoHistory([state, ...redoHistory]);
      setState(previous);
      setUndoHistory(undoHistory.slice(1));
      await writeToDisk(previous);
    } finally { setIsProcessing(false); }
  };

  const handleRedo = async () => {
    if (redoHistory.length === 0 || !state) return;
    setIsProcessing(true);
    try {
      const next = redoHistory[0];
      setUndoHistory([state, ...undoHistory]);
      setState(next);
      setRedoHistory(redoHistory.slice(1));
      await writeToDisk(next);
    } finally { setIsProcessing(false); }
  };

  const handleSendMessage = async (msg: Partial<ChatMessage>) => {
    if (!currentUser || !state) return;
    const newMsg: ChatMessage = { id: `msg-${Date.now()}`, userId: currentUser.id, username: currentUser.username, role: currentUser.role, workgroup: currentUser.workgroup, text: msg.text || '', timestamp: new Date().toISOString(), attachments: msg.attachments || [], isVoice: msg.isVoice || false, recipientId: msg.recipientId };
    
    // Aggiornamento stato immediato e scrittura su disco sincrona
    const nextState: AppState = { ...state, chatMessages: [...(state.chatMessages || []), newMsg], version: (state.version || 0) + 1, lastSync: new Date().toISOString() };
    setState(nextState);
    
    // Forziamo scrittura immediata saltando i timer
    await writeToDisk(nextState);
  };

  const handleMarkChatRead = async (chatId: string) => {
    if (!currentUser || !state) return;
    const updatedUser = { ...currentUser, lastReadTimestamps: { ...(currentUser.lastReadTimestamps || {}), [chatId]: new Date().toISOString() } };
    setCurrentUser(updatedUser);
    await updateVault((prev) => ({ users: prev.users.map(u => u.id === currentUser.id ? updatedUser : u) }));
  };

  const handleGlobalExportPDF = async () => {
    if (!state) return;
    setIsProcessing(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(14); doc.setFont("helvetica", "bold");
      doc.text(state.commandName.toUpperCase(), 105, 15, { align: "center" });
      doc.setFontSize(10);
      doc.text(`REGISTRO ANALITICO INTEGRALE DNA - ${state.vaultId}`, 105, 21, { align: "center" });
      const stats = state.idvs.map(idv => {
        const ordersForIdv = state.orders.filter(o => o.linkedIdvIds.includes(idv.id));
        const committed = ordersForIdv.reduce((sum, o) => sum + (o.contractValue || 0), 0);
        const paid = ordersForIdv.reduce((sum, o) => sum + (o.paidValue || 0), 0);
        return [idv.idvCode, idv.capitolo, formatEuro(idv.amount), formatEuro(committed), formatEuro(paid), formatEuro(idv.amount - committed)];
      });
      autoTable(doc, { startY: 30, head: [['IDV', 'Capitolo', 'Budget', 'Contratti', 'Liquidato', 'Disponibile']], body: stats, theme: 'grid', headStyles: { fillColor: [15, 23, 42], fontSize: 8 } });
      setPdfPreviewUrl(doc.output('bloburl').toString());
    } finally { setIsProcessing(false); }
  };

  const handleResetUserPassword = async (userId: string) => {
    if (!confirm(`AZZERARE CREDENZIALI E VIDEO RESPONSABILITÀ PER L'OPERATORE? L'utente dovrà rientrare con password "${DEFAULT_PASSWORD}" e rifare il video.`)) return;
    
    setIsProcessing(true);
    try {
      await updateVault(prev => ({
        users: prev.users.map(u => u.id === userId ? { 
          ...u, 
          passwordHash: DEFAULT_PASSWORD, 
          mustChangePassword: true, 
          accreditationVideo: undefined, // CANCELLAZIONE VIDEO PER OBBLIGO RE-FIRMA
          profilePhoto: undefined 
        } : u)
      }), { 
        action: 'AZZERAMENTO CREDENZIALI (TABULA RASA)', 
        details: `Reset totale eseguito per l'utente ${userId}. Forza cambio password e nuova video-firma al primo accesso.`, 
        relatedId: userId 
      });
      alert(`RESET ESEGUITO.\nL'operatore deve ora usare la password universale: ${DEFAULT_PASSWORD}`);
    } finally { setIsProcessing(false); }
  };

  if (view === 'gateway') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 font-['Inter']">
      <GlobalLoader active={isProcessing} />
      <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-w-5xl w-full flex flex-col md:flex-row gap-16 border border-slate-200 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
        <div className="flex-1 space-y-10 flex flex-col items-center md:items-start">
          <EsercitoLogo size="lg" />
          <h1 className="text-5xl font-black text-slate-800 tracking-tighter uppercase leading-none italic mt-8 text-center md:text-left">MANAGEMENT DNA<br/><span className="text-indigo-600 font-black tracking-widest">PROT. PPB 10.6 LEGACY</span></h1>
          <button onClick={handleTransparencyAccess} disabled={!state} className={`flex items-center gap-3 px-8 py-4 rounded-2xl border-2 transition-all group ${state ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'opacity-30 border-slate-200 text-slate-300 cursor-not-allowed'}`}><span className="text-2xl group-hover:animate-pulse">👁️</span><div className="text-left"><p className="text-[10px] font-black uppercase tracking-widest leading-none text-nowrap">Consultazione Trasparenza</p><p className="text-[8px] font-bold uppercase opacity-60">Sola Lettura Audit Esterno</p></div></button>
        </div>
        <div className="flex-1 flex flex-col gap-4 justify-center">
          {savedHandleExists && ( 
            <button onClick={handleDirectAccess} className="p-10 bg-indigo-600 text-white rounded-[2.5rem] hover:bg-indigo-700 transition-all text-left shadow-2xl group border-b-[6px] border-indigo-900 flex flex-col items-center justify-center text-center"> 
              <span className="text-[10px] font-black uppercase opacity-70 mb-2 block tracking-widest">DNA Rilevato in Sessione Precedente</span> 
              <p className="text-2xl font-black italic tracking-tighter uppercase mb-2">RIPRENDI SESSIONE</p> 
              <div className="bg-white/10 px-6 py-3 rounded-2xl border border-white/20 max-w-full space-y-1">
                <span className="text-[11px] font-bold italic truncate block text-indigo-100">{savedFileName}</span>
                <span className="text-[9px] font-mono font-black truncate block text-indigo-400">ID: {savedVaultId}</span>
              </div>
            </button> 
          )}
          <button onClick={handleOpenFilePicker} className="w-full py-6 bg-slate-100 text-slate-700 border-2 border-slate-200 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-md hover:bg-slate-200 transition-all"> CARICA ARCHIVIO DNA 📂 </button>
          <button onClick={handleCreateNewDatabase} className="w-full py-6 bg-emerald-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-md hover:bg-emerald-700 transition-all"> GENERA NUOVO DNA ➕ </button>
        </div>
      </div>
    </div>
  );

  if (view === 'setup') return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-50/50 p-6">
      <GlobalLoader active={isProcessing} />
      <div className="bg-white rounded-[4rem] p-16 shadow-2xl max-md w-full text-center border border-indigo-100"><EsercitoLogo size="md" /><h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter mb-10 italic mt-6 leading-none text-nowrap">Inizializzazione DNA</h2><div className="space-y-4 text-left">
      <input type="text" placeholder="Nome Comando CME" id="s-cmd" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold outline-none focus:border-indigo-600 shadow-inner" />
      <input type="text" placeholder="User Amministratore (Garante)" id="s-u" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold outline-none focus:border-indigo-600 shadow-inner" />
      <input type="password" placeholder="Password Master" id="s-p" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold outline-none focus:border-indigo-600 shadow-inner" />
      <button onClick={async () => { 
        const cmd = (document.getElementById('s-cmd') as any).value; 
        const u = (document.getElementById('s-u') as any).value; 
        const p = (document.getElementById('s-p') as any).value; 
        if (u && p && cmd) { 
          setIsProcessing(true);
          try {
            const vId = `DNA-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`; 
            const init: AppState = { vaultId: vId, version: 1, commandName: cmd, users: [{ id: 'u-admin', username: u, passwordHash: p, role: UserRole.ADMIN, workgroup: '', mustChangePassword: false, loginCount: 0, isFirstLogin: false }], idvs: [], orders: [], planningNeeds: [], planningLists: [], auditLog: [], chatMessages: [], briefings: [], lastSync: new Date().toISOString() }; 
            setState(init); setCurrentUser(init.users[0]); await saveHandleToIDB(fileHandle, vId); await writeToDisk(init); setView('dashboard'); 
          } finally { setIsProcessing(false); }
        } 
      }} className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase mt-4 shadow-xl tracking-widest hover:bg-indigo-700 transition-all border-b-[6px] border-indigo-900 active:translate-y-1">Sigilla e Crea DNA Vault</button></div></div></div>
  );

  if (view === 'login' && state) return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-50/50 p-6 font-['Inter']">
      <GlobalLoader active={isProcessing} />
      <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-lg w-full text-center border border-indigo-100 space-y-8"><EsercitoLogo size="md" /><h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter italic leading-none">Sblocco Identità</h2><div className="space-y-6 text-left"><div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Operatore</label><select id="l-u" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold outline-none focus:border-indigo-600 appearance-none shadow-sm">{state.users.map(u => <option key={u.id} value={u.id}>{u.username.toUpperCase()} {u.role === UserRole.ADMIN ? '(Amministratore)' : `[${u.workgroup}]`}</option>)}</select></div><div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-4">Password</label><input type="password" placeholder="••••••••" id="l-p" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-200 rounded-3xl font-bold focus:border-indigo-600 outline-none shadow-sm" /></div><button onClick={() => handleLogin((document.getElementById('l-u') as any)?.value || '', (document.getElementById('l-p') as any)?.value || '')} className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase shadow-xl hover:bg-indigo-700 transition-all border-b-4 border-indigo-900 active:translate-y-1">Apri Archivio DNA</button>
    <button onClick={handleTransparencyAccess} className="w-full text-[10px] font-black text-amber-600 uppercase tracking-widest hover:text-amber-700 transition-colors">Visualizzazione Pubblica Sola Lettura 👁️</button>
    </div></div></div>
  );

  if (view === 'first-login-setup' && currentUser) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <GlobalLoader active={isProcessing} />
      <FirstLoginSetup onComplete={async (data) => { 
        setIsProcessing(true);
        try {
          const updatedUser = { ...currentUser, ...data, isFirstLogin: false, mustChangePassword: false, lastActive: new Date().toISOString() }; 
          await updateVault((prev) => ({ users: prev.users.map(u => u.id === currentUser.id ? updatedUser : u) }), { action: 'CONFIGURAZIONE INIZIALE', details: `Operatore ${currentUser.username} ha aggiornato la chiave di accesso personale.`, relatedId: currentUser.id }); 
          setCurrentUser(updatedUser); setView('responsibility-accreditation'); 
        } finally { setIsProcessing(false); }
      }} />
    </div>
  );

  if (view === 'responsibility-accreditation' && currentUser && state) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
       <GlobalLoader active={isProcessing} />
       <ResponsibilityAccreditation vaultId={state.vaultId} user={currentUser} onSkip={() => setView('dashboard')} onComplete={async (video, photo) => { 
         setIsProcessing(true);
         try {
           const updatedUser = { ...currentUser, accreditationVideo: video, profilePhoto: photo, lastActive: new Date().toISOString() }; 
           await updateVault((prev) => ({ users: prev.users.map(u => u.id === currentUser.id ? updatedUser : u) }), { action: 'ASSUNZIONE RESPONSABILITÀ', details: `Dichiarazione video 20s finalizzata con miniatura biometrica.`, relatedId: currentUser.id, videoProof: video }); 
           setCurrentUser(updatedUser); setView('dashboard'); 
         } finally { setIsProcessing(false); }
       }} />
    </div>
  );

  if (!state || !currentUser) return null;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 font-['Inter'] text-slate-700 overflow-hidden">
      <GlobalLoader active={isProcessing} />
      {(currentUser.role === UserRole.VIEWER || currentUser.role === UserRole.ADMIN) && (
        <div className={`text-white px-10 py-1 flex justify-between items-center z-[1000] animate-in slide-in-from-top duration-500 ${currentUser.role === UserRole.ADMIN ? 'bg-indigo-900' : 'bg-amber-50'}`}>
           <span className={`text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-4 animate-pulse ${currentUser.role === UserRole.ADMIN ? 'text-white' : 'text-amber-800'}`}>
              {currentUser.role === UserRole.ADMIN ? `⚠️ GARANTE (AMMINISTRATORE) - DNA VAULT: ${state.vaultId}` : '⚠️ AUDIT PUBBLICO'} 
              <span className="opacity-50">|</span> AZIONI OPERATIVE DISABILITATE
           </span>
           <button onClick={() => window.location.reload()} className={`text-[10px] font-black uppercase underline tracking-widest opacity-80 hover:opacity-100 transition-opacity ${currentUser.role === UserRole.ADMIN ? 'text-white' : 'text-amber-800'}`}>Disconnetti Sessione</button>
        </div>
      )}

      <div className="flex flex-1 h-full min-h-0">
        <aside className="w-84 bg-white border-r border-slate-200 p-4 flex flex-col shadow-xl z-50 h-full">
          <div className="pt-2 pb-5 border-b border-slate-100 flex flex-col flex-shrink-0 relative"> 
             <div className="mb-4 text-center"><p className="text-[12px] font-black uppercase text-indigo-700 tracking-[0.2em] px-2 italic text-nowrap">{state.commandName}</p></div>
             <div className="flex flex-col items-center gap-2 mb-2 relative group bg-slate-50 p-4 rounded-[2rem] border border-slate-100 shadow-inner">
                <button onClick={() => window.location.reload()} className="absolute top-3 right-3 p-2 text-slate-300 hover:text-rose-600 transition-colors bg-white rounded-full shadow-sm border border-slate-100 z-20"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>
                <div className="w-20 h-20 rounded-3xl bg-white overflow-hidden border-4 border-indigo-100 shadow-lg relative flex items-center justify-center group-hover:scale-105 transition-transform">
                   {currentUser.profilePhoto ? <img src={currentUser.profilePhoto} className="w-full h-full object-cover" /> : (currentUser.accreditationVideo ? <video src={currentUser.accreditationVideo} className="w-full h-full object-cover" muted loop autoPlay /> : <span className="text-3xl">👤</span>)}
                </div>
                <div className="text-center">
                  <span className={`text-[8px] font-black uppercase italic tracking-widest px-3 py-1 rounded-full border inline-block mb-1 ${currentUser.role === UserRole.ADMIN ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-400 border-slate-100'}`}>{currentUser.role === UserRole.ADMIN ? '(Amministratore)' : currentUser.role}</span>
                  <p className="text-sm font-black text-indigo-900 uppercase truncate tracking-tight">{currentUser.username}</p> 
                  {currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.VIEWER && <p className="text-[7px] text-slate-400 font-bold uppercase tracking-widest opacity-60 leading-none text-nowrap">UFFICIO: {currentUser.workgroup}</p>}
                </div>
             </div>
             {!currentUser.accreditationVideo && currentUser.role !== UserRole.VIEWER && (
                <div className="mt-2 p-3 bg-rose-50 border border-rose-100 rounded-2xl animate-pulse">
                   <p className="text-[7px] font-black text-rose-600 uppercase tracking-widest mb-2 leading-tight">⚠️ Responsabilità non assunta via video</p>
                   <button onClick={() => setView('responsibility-accreditation')} className="w-full py-2 bg-rose-600 text-white text-[8px] font-black uppercase rounded-lg shadow-md hover:bg-rose-700 transition-colors">Sottoscrivi DNA Ora</button>
                </div>
             )}
          </div>

          <nav className="space-y-0.5 flex-1 overflow-y-auto no-scrollbar py-4 px-2">
            {[ { id: 'dashboard', label: 'Analisi' }, { id: 'azimuth', label: 'Azimuth Check' }, { id: 'works', label: 'Lavori' }, { id: 'idvs', label: 'Fondi' }, { id: 'planning', label: 'Obiettivi' }, { id: 'comms', label: 'CHAT OPERATIVA' }, { id: 'audit', label: 'Registro DNA' }, { id: 'admin', label: 'Gestione Staff' }, { id: 'manual', label: 'Manuale' } ].map(item => (
                <button key={item.id} onClick={() => setView(item.id as any)} className={`w-full flex items-center justify-between px-6 py-3 rounded-[1.2rem] transition-all relative ${view === item.id ? 'bg-indigo-600 text-white shadow-lg scale-[1.01]' : 'text-slate-400 hover:bg-slate-50'}`}> 
                  <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span> 
                  {item.id === 'comms' && unreadStats.general + unreadStats.direct > 0 && <span className="bg-rose-500 text-white text-[8px] w-4 h-4 flex items-center justify-center rounded-full shadow-md border border-white">{unreadStats.general + unreadStats.direct}</span>} 
                </button> 
            ))}
          </nav>
          <div className="mt-auto pt-2 opacity-20 text-center"><p className="text-[6px] font-black uppercase tracking-widest">DNA VAULT PPB v10.6</p></div>
        </aside>

        <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
          <header className="bg-white px-10 py-5 flex justify-between items-center border-b border-slate-200 z-40 shadow-sm flex-shrink-0">
            <div className="flex items-center gap-6"> 
               <div>
                 <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter leading-none">PPB DNA Management</h2>
                 <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[9px] font-black text-indigo-600 uppercase italic">Identità: {state.vaultId}</span>
                    <div className="w-[1px] h-3 bg-slate-200 mx-1"></div>
                    <span className="text-[9px] font-black text-slate-400 uppercase italic">Valore: <span className="text-slate-900 font-black">{formatEuro(state.idvs.reduce((s, i) => s + i.amount, 0))}</span></span>
                 </div>
               </div>
               <div className="h-8 w-[1px] bg-slate-100"></div>
               {currentUser.role !== UserRole.VIEWER && currentUser.role !== UserRole.ADMIN && (
                <div className="flex items-center gap-1.5 px-2"> 
                  <button onClick={handleUndo} disabled={undoHistory.length === 0} className={`p-2.5 rounded-xl border ${undoHistory.length > 0 ? 'bg-white text-indigo-600 shadow-sm' : 'bg-slate-50 text-slate-200'}`} title="Annulla"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L4 10L9 5M4 10H15C18.3137 10 21 12.6863 21 16V20" /></svg></button> 
                  <button onClick={handleRedo} disabled={redoHistory.length === 0} className={`p-2.5 rounded-xl border ${redoHistory.length > 0 ? 'bg-white text-emerald-600 shadow-sm' : 'bg-slate-50 text-slate-200'}`} title="Ripristina"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M15 15L20 10L15 5M20 10H9C5.68629 10 3 12.6863 3 16V20" /></svg></button> 
                </div>
               )} 
               <button onClick={handleGlobalExportPDF} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-md hover:bg-indigo-700 transition-all active:scale-95">📄 EXPORT ANALISI PDF</button>
            </div>
            <EsercitoLogo size="sm" />
          </header>

          <div className="flex-1 overflow-hidden p-10 bg-slate-50/50 flex flex-col">
             <div className="max-w-[1400px] mx-auto w-full h-full flex flex-col">
                {view === 'dashboard' && <div className="overflow-y-auto h-full pr-2 custom-scrollbar"><Dashboard idvs={state.idvs} orders={state.orders} auditLog={state.auditLog} commandName={state.commandName} onChapterClick={(c) => { setSelectedChapter(c); setView('chapter-detail'); }} /></div>} 
                {view === 'audit' && <AuditLog log={state.auditLog} filter={auditFilter} setFilter={setAuditFilter} fromDate={auditFromDate} setFromDate={setAuditFromDate} toDate={auditToDate} setToDate={setAuditToDate} />} 
                {view === 'admin' && <div className="bg-white p-12 rounded-[3.5rem] border border-slate-200 shadow-xl space-y-8 animate-in fade-in duration-500 overflow-y-auto h-full custom-scrollbar">
                  <div className="flex justify-between items-center border-b pb-6">
                     <h3 className="text-2xl font-black italic uppercase tracking-tighter">Personale Accreditato & Evidence DNA</h3>
                  </div>
                  {currentUser.role === UserRole.ADMIN && (
                    <div className="grid grid-cols-4 gap-4 items-end bg-slate-50 p-6 rounded-[2rem] border border-indigo-100 shadow-inner">
                      <input type="text" placeholder="Ufficio / Reparto" id="nu-g" className="px-4 py-3 rounded-xl border border-slate-200 font-bold outline-none" />
                      <input type="text" placeholder="Username" id="nu-u" className="px-4 py-3 rounded-xl border border-slate-200 font-bold outline-none" />
                      <select id="nu-r" className="px-4 py-3 rounded-xl border border-indigo-200 font-bold outline-none bg-white text-[10px]">{Object.values(UserRole).filter(r => r !== UserRole.ADMIN).map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}</select>
                      <button onClick={async () => { const g = (document.getElementById('nu-g') as any).value; const u = (document.getElementById('nu-u') as any).value; const r = (document.getElementById('nu-r') as any).value; if(u && g) { const newUserId = `u-${Date.now()}`; setIsProcessing(true); try { await updateVault((prev) => ({ users: [...prev.users, { id: newUserId, username: u, passwordHash: DEFAULT_PASSWORD, role: r as UserRole, workgroup: g, mustChangePassword: true, loginCount: 0, isFirstLogin: true }] }), { action: 'PROPOSTA ACCREDITAMENTO', details: `Generata pre-utenza per ${u} [${g}]. Attesa video-evidenza responsabilità.`, relatedId: newUserId }); } finally { setIsProcessing(false); } } }} className="bg-indigo-600 text-white py-3 rounded-xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all text-nowrap">Invia Accreditamento</button>
                    </div>
                  )}
                  <div className="flex flex-col gap-3">
                    {state.users.map(u => (
                      <div key={u.id} className="bg-white border border-slate-100 rounded-[2rem] p-5 flex items-center justify-between hover:shadow-lg transition-all group relative overflow-hidden">
                        <div className="flex items-center gap-6 relative z-10 flex-1">
                          <div className="w-16 h-16 bg-slate-900 rounded-2xl overflow-hidden border-4 border-indigo-500 shadow-md flex items-center justify-center flex-shrink-0">
                             {u.profilePhoto ? <img src={u.profilePhoto} className="w-full h-full object-cover" /> : (u.accreditationVideo ? <video src={u.accreditationVideo} className="w-full h-full object-cover" muted loop autoPlay /> : <span className="text-2xl text-white">👤</span>)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-slate-800 italic uppercase text-lg leading-tight truncate">{u.username}</p>
                            <div className="flex items-center gap-2 mt-1">
                               <span className={`text-[8px] font-black uppercase italic tracking-widest px-2 py-0.5 rounded border ${u.role === UserRole.ADMIN ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{u.role === UserRole.ADMIN ? '(Amministratore)' : u.role}</span>
                               <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest border-l pl-2">UFFICIO: <span className="text-slate-800">{u.workgroup || 'NON DEFINITO'}</span></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 relative z-10">
                          <div className="text-right">
                             {u.accreditationVideo ? <span className="bg-emerald-100 text-emerald-700 text-[8px] font-black px-3 py-1 rounded-full border border-emerald-200">RESPONSABILITÀ ASSUNTA</span> : <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-3 py-1 rounded-full border border-amber-200">FIRMA PENDENTE</span>}
                             <p className="text-[7px] text-slate-300 font-bold uppercase mt-1">ID: {u.id}</p>
                          </div>
                          
                          <div className="flex items-center gap-2 border-l pl-6 min-w-[200px] justify-end">
                             {/* RESET AMMINISTRATORE VISIBILE SOLO AL COMANDANTE/REPPE SULLA RIGA ADMIN */}
                             {u.role === UserRole.ADMIN && (currentUser.role === UserRole.COMANDANTE || currentUser.role === UserRole.REPPE) && currentUser.accreditationVideo && (
                                <button onClick={() => handleResetUserPassword(u.id)} className="px-5 py-2.5 bg-rose-600 text-white rounded-xl text-[8px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-700 transition-all active:scale-95 border-b-[4px] border-rose-900 active:translate-y-1">🎖️ RESET AMMINISTRATORE</button>
                             )}
                             
                             {/* RESET UTENTI NORMALI PER ADMIN */}
                             {currentUser.role === UserRole.ADMIN && u.role !== UserRole.ADMIN && (
                                <button onClick={() => handleResetUserPassword(u.id)} className="text-[8px] font-black text-rose-500 uppercase underline hover:text-rose-700 transition-all">AZZERA CREDENZIALI</button>
                             )}
                             
                             {u.accreditationVideo && (
                                <button onClick={() => setHistoryFilterId(u.id)} className="p-3 bg-slate-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm border border-slate-100 active:scale-95" title="Vedi Video-Evidence">🎥</button>
                             )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>} 
                {view === 'works' && <Catalog orders={globalFilter === 'mine' ? state.orders.filter(o => o.workgroup === currentUser.workgroup) : state.orders} idvs={state.idvs} highlightId={highlightedOrderId} onAdd={() => setView('add-work')} onChapterClick={(c) => { setSelectedChapter(c); setView('chapter-detail'); }} onStageClick={(o, s) => { if (s === 1) setEditWorkOrder(o); if (s === 2) setBidModalOrder(o); if (s === 3) setPaymentModalOrder(o); }} onDelete={async (id) => { setIsProcessing(true); try { await updateVault((prev) => ({ orders: prev.orders.filter(ord => ord.id !== id) }), { action: 'ELIMINAZIONE', details: `Fascicolo rimosso.`, relatedId: id }); } finally { setIsProcessing(false); } }} onToggleLock={async (id) => { setIsProcessing(true); try { await updateVault((prev) => ({ orders: prev.orders.map(ord => ord.id === id ? { ...ord, locked: !ord.locked } : ord) }), { action: 'PROTEZIONE', details: `Lock variato.`, relatedId: id }); } finally { setIsProcessing(false); } }} currentUser={currentUser} onShowHistory={(id) => setHistoryFilterId(id)} />} 
                {view === 'idvs' && <IdvList idvs={globalFilter === 'mine' ? state.idvs.filter(i => i.assignedWorkgroup === currentUser.workgroup) : state.idvs} orders={state.orders} onAdd={() => setView('add-idv')} onChapterClick={(c) => { setSelectedChapter(c); setView('chapter-detail'); }} onDelete={async (id) => { setIsProcessing(true); try { await updateVault((prev) => ({ idvs: prev.idvs.filter(idv => idv.id !== id) }), { action: 'RIMOZIONE', details: `Asset fondo rimosso.`, relatedId: id }); } finally { setIsProcessing(false); } }} onToggleLock={async (id) => { setIsProcessing(true); try { await updateVault((prev) => ({ idvs: prev.idvs.map(idv => idv.id === id ? { ...idv, locked: !idv.locked } : idv) }), { action: 'LOCK', details: `Protezione risorsa variata.`, relatedId: id }); } finally { setIsProcessing(false); } }} userRole={currentUser.role} commandName={state.commandName} onShowHistory={(id) => setHistoryFilterId(id)} />} 
                {view === 'planning' && <PlanningModule state={state} activeListId={activePlanningListId} onSetActiveListId={setActivePlanningListId} onUpdate={async (u, log) => { setIsProcessing(true); try { await updateVault(u, log); } finally { setIsProcessing(false); } }} currentUser={currentUser} idvs={state.idvs} globalFilter={globalFilter} commandName={state.commandName} onShowHistory={(id) => setHistoryFilterId(id)} />} 
                {view === 'comms' && <Messenger messages={state.chatMessages || []} currentUser={currentUser} allUsers={state.users} onSendMessage={handleSendMessage} onReadChat={handleMarkChatRead} isSyncing={syncStatus === 'syncing'} />} 
                {view === 'manual' && <div className="overflow-y-auto h-full pr-2 custom-scrollbar"><Manual commandName={state.commandName} /></div>} 
                {view === 'azimuth' && <AzimuthCheck briefings={state.briefings || []} userRole={currentUser.role} onAddBriefing={async (b) => { const newBriefId = `brief-${Date.now()}`; setIsProcessing(true); try { await updateVault(prev => ({ briefings: [...(prev.briefings || []), { ...b as Briefing, id: newBriefId, status: 'scheduled' }] }), { action: 'PLANNING BRIEFING', details: `Azimuth Check programmato: ${b.title}.`, relatedId: newBriefId }); } finally { setIsProcessing(false); } }} />}
                {view === 'chapter-detail' && selectedChapter && <ChapterReport chapter={selectedChapter} idvs={(state.idvs || []).filter(i => i.capitolo === selectedChapter)} allIdvs={state.idvs || []} orders={state.orders || []} onBack={() => setView('dashboard')} onAddWork={() => setView('add-work')} onOrderClick={(orderId) => { setHighlightedOrderId(orderId); setView('works'); }} userRole={currentUser.role} currentUser={currentUser} />} 
                {view === 'add-idv' && <IdvForm existingChapters={Array.from(new Set(state.idvs.map(i => i.capitolo)))} users={state.users} currentUser={currentUser} initialData={prefillIdvData || undefined} onSubmit={async (d) => { const newIdvId = `idv-${Date.now()}`; setIsProcessing(true); try { await updateVault((prev) => { const nextState = { ...prev, idvs: [...prev.idvs, { id: newIdvId, ...d as any, createdAt: new Date().toISOString(), ownerId: currentUser.id, ownerName: currentUser.username, ownerWorkgroup: currentUser.workgroup }] }; if(prefillIdvData?.sourceProjectId) { nextState.planningNeeds = nextState.planningNeeds.map(n => n.id === prefillIdvData.sourceProjectId ? {...n, isFunded: true, linkedIdvId: newIdvId} : n); } return nextState; }, { action: 'REGISTRAZIONE ASSET', details: `Asset IDV ${d.idvCode} registrato.`, relatedId: newIdvId }); setPrefillIdvData(null); setView('idvs'); } finally { setIsProcessing(false); } }} onCancel={() => { setPrefillIdvData(null); setView('idvs'); }} />} 
                {(view === 'add-work' || editWorkOrder) && <WorkForm idvs={state.idvs} orders={state.orders} currentUser={currentUser} existingChapters={Array.from(new Set(state.idvs.map(i => i.capitolo)))} initialData={editWorkOrder || undefined} prefilledChapter={selectedChapter || undefined} onSubmit={async (d) => { if (editWorkOrder) await optimisticWorkUpdate((prev) => ({ orders: prev.orders.map(o => o.id === editWorkOrder.id ? { ...o, ...d } : o) }), { action: 'REVISIONE', details: `Pratica ${editWorkOrder.orderNumber} aggiornata.`, relatedId: editWorkOrder.id }); else { const autoId = `IMP-${new Date().getFullYear()}-${(state.orders.length + 1001).toString().slice(-4)}`; const newId = `w-${Date.now()}`; await optimisticWorkUpdate((prev) => ({ orders: [...prev.orders, { id: newId, ...d as any, orderNumber: autoId, status: WorkStatus.PROGETTO, createdAt: new Date().toISOString(), ownerId: currentUser.id, ownerName: currentUser.username, workgroup: currentUser.workgroup }] }), { action: 'NUOVO IMPEGNO', details: `Impegno ${autoId} creato.`, relatedId: newId }); } setEditWorkOrder(null); setView('works'); }} onCancel={() => { setEditWorkOrder(null); setView('works'); }} />}
             </div>
          </div>
        </main>

        {historyFilterId && (
          <div className="fixed inset-0 z-[700] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
             <div className="bg-white w-full max-w-5xl h-[80vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border-4 border-indigo-600">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white flex-shrink-0">
                   <div><h3 className="text-2xl font-black italic uppercase">Evidence DNA & Log Responsabilità</h3><p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none mt-1">Identità Operatore: {state.users.find(u => u.id === historyFilterId)?.username}</p></div>
                   <button onClick={() => setHistoryFilterId(null)} className="px-6 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">Chiudi Fascicolo Identità</button>
                </div>
                <div className="flex-1 overflow-hidden p-10 flex gap-10">
                   <div className="flex-1 space-y-6">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2">Evidenza Video-Assunzione Responsabilità</h4>
                      <div className="aspect-video bg-black rounded-[2rem] overflow-hidden border-4 border-slate-100 shadow-xl relative">
                        {state.users.find(u => u.id === historyFilterId)?.accreditationVideo ? (
                          <video src={state.users.find(u => u.id === historyFilterId)?.accreditationVideo} controls className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 italic px-20 text-center"><span className="text-6xl mb-4">🚫</span><p className="font-black uppercase text-[10px] tracking-widest opacity-40">Nessuna evidenza video depositata per questo operatore.</p></div>
                        )}
                      </div>
                   </div>
                   <div className="w-96 flex flex-col">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b pb-2 mb-4 italic">Ledger Operazioni Correlate</h4>
                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                        {state.auditLog.filter(l => l.userId === historyFilterId || l.relatedId === historyFilterId).map(entry => (
                          <div key={entry.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-black text-indigo-600 uppercase italic">{entry.action}</p>
                            <p className="text-[9px] font-medium text-slate-500 italic mt-1 leading-tight">{entry.details}</p>
                            <p className="text-[7px] font-black text-slate-300 uppercase mt-2">{new Date(entry.timestamp).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                   </div>
                </div>
             </div>
          </div>
        )}
        {pdfPreviewUrl && <div className="fixed inset-0 z-[600] bg-slate-950/95 flex items-center justify-center p-6 backdrop-blur-sm"><div className="bg-white w-full max-w-6xl h-full rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border border-slate-800"><div className="p-5 flex justify-between items-center bg-slate-900 border-b border-slate-800 flex-shrink-0"><span className="text-[10px] font-black uppercase italic text-indigo-400 tracking-[0.4em]">Official DNA Register - {state.vaultId}</span><button onClick={() => { URL.revokeObjectURL(pdfPreviewUrl!); setPdfPreviewUrl(null); }} className="px-6 py-2.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">✕ Chiudi Registro</button></div><iframe src={pdfPreviewUrl} title="PDF Preview" className="flex-1 border-0" /></div></div>}
        {bidModalOrder && <BidModal order={bidModalOrder} onSave={async (b) => { await optimisticWorkUpdate((prev) => ({ orders: prev.orders.map(o => o.id === bidModalOrder.id ? { ...o, status: WorkStatus.AFFIDAMENTO, winner: b.winner, contractValue: b.bidValue, contractPdf: b.contractPdf } : o) }), { action: 'AFFIDAMENTO', details: `Affidato ${bidModalOrder.orderNumber}. Valore: ${b.bidValue}.`, relatedId: bidModalOrder.id }); setBidModalOrder(null); }} onClose={() => setBidModalOrder(null)} />}
        {paymentModalOrder && <PaymentModal order={paymentModalOrder} onSave={async (p) => { await optimisticWorkUpdate((prev) => ({ orders: prev.orders.map(o => o.id === paymentModalOrder.id ? { ...o, status: WorkStatus.PAGAMENTO, paidValue: p.paidValue, invoicePdf: p.invoicePdf, invoiceNumber: p.invoiceNumber, invoiceDate: p.invoiceDate, creGenerated: true, creDate: p.creDate } : o) }), { action: 'LIQUIDAZIONE', details: `Pratica ${paymentModalOrder.orderNumber} liquidata.`, relatedId: paymentModalOrder.id }); setPaymentModalOrder(null); }} onClose={() => setPaymentModalOrder(null)} />}
      </div>
    </div>
  );
};
export default App;
