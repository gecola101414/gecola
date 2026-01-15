
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
import AdminModule from './components/AdminModule'; 
import AzimuthCheck from './components/AzimuthCheck';
// @ts-ignore
import { jsPDF } from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

const SYSTEM_SECRET = "CME_LOMB_SECURE_VAULT_2026_V21_MASTER";
const ENCRYPTION_PREFIX = "PPB_CRYPT_V21:";
const IDB_NAME = 'VaultDB';
const IDB_STORE = 'Handles';

const GlobalLoader: React.FC<{ active: boolean }> = ({ active }) => {
  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full animate-pulse"></div>
          <div className="w-32 h-32 border-4 border-indigo-600/10 rounded-full animate-pulse"></div>
          <div className="absolute inset-0 w-32 h-32 border-t-4 border-indigo-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
             <svg width="45" height="45" viewBox="0 0 100 95" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-pulse">
                <path d="M50 0L61.2257 34.5492H97.5528L68.1636 55.9017L79.3893 90.4508L50 69.0983L20.6107 90.4508L31.8364 55.9017L2.44717 34.5492H38.7743L50 0Z" fill="#D4AF37"/>
             </svg>
          </div>
        </div>
        <div className="text-center space-y-2">
          <p className="text-white font-black uppercase text-sm tracking-[0.5em] animate-pulse">ELABORAZIONE DNA</p>
          <p className="text-indigo-400 text-[8px] font-black uppercase tracking-widest italic opacity-60">Sincronizzazione archivio immutabile in corso...</p>
        </div>
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

  // Stati per accreditamento video
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(8);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  const sanitizeState = (data: any): AppState | null => {
    if (!data) return null;
    return {
      ...data,
      vaultId: data.vaultId || `DNA-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      version: data.version || 1,
      commandName: data.commandName || "COMANDO CME",
      users: (data.users || []).map((u: any) => ({
        ...u,
        permissions: u.permissions || {
          canManageFunds: u.role === UserRole.ADMIN || u.role === UserRole.PPB,
          canManageWorks: u.role !== UserRole.VIEWER,
          canManagePlanning: u.role !== UserRole.VIEWER,
          canAccessAudit: u.role === UserRole.ADMIN,
          canAdminUsers: u.role === UserRole.ADMIN,
          canExportData: true
        }
      })),
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
    isWritingRef.current = true; 
    setSyncStatus('syncing');
    setIsProcessing(true);
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(encrypt(newState));
      await writable.close();
      const fileAfter = await fileHandle.getFile();
      lastModifiedRef.current = fileAfter.lastModified; lastSizeRef.current = fileAfter.size;
      setSyncStatus('synced');
    } catch (err) { 
      setSyncStatus('error'); 
    } finally { 
      isWritingRef.current = false; 
      setTimeout(() => setIsProcessing(false), 400); 
    }
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
    setState(newState); 
    await writeToDisk(newState);
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
          if (user.isFirstLogin) setView('first-login-setup');
          else if (user.mustChangePassword) setView('change-password'); 
          else setView('dashboard');
        } else alert("Chiave di accesso errata.");
      }
    } finally { setIsProcessing(false); }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView('login');
  };

  const handleTransparencyAccess = async () => {
    if (!state) return;
    setIsProcessing(true);
    try {
      setCurrentUser({ id: 'u-public', username: 'Visualizzatore Pubblico', passwordHash: '', role: UserRole.VIEWER, workgroup: 'ESTERNO', isFirstLogin: false, permissions: { canManageFunds: false, canManageWorks: false, canManagePlanning: false, canAccessAudit: false, canAdminUsers: false, canExportData: false } });
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

  // Funzioni per primo accesso e accreditamento
  const handleFirstLoginSetup = async (photo: string) => {
    if (!currentUser) return;
    const updatedUser = { ...currentUser, profilePhoto: photo, isFirstLogin: false, mustChangePassword: true };
    setCurrentUser(updatedUser);
    await updateVault((prev) => ({ users: prev.users.map(u => u.id === currentUser.id ? updatedUser : u) }));
    setView('responsibility-accreditation');
  };

  const handlePasswordChange = async (newPass: string) => {
    if (!currentUser) return;
    const updatedUser = { ...currentUser, passwordHash: newPass, mustChangePassword: false };
    setCurrentUser(updatedUser);
    await updateVault((prev) => ({ users: prev.users.map(u => u.id === currentUser.id ? updatedUser : u) }), { action: 'CAMBIO PASSWORD', details: `Operatore ${currentUser.username} ha aggiornato la chiave di accesso.` });
    setView('dashboard');
  };

  const startAccreditationVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
      
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const reader = new FileReader();
        reader.onload = async (e) => {
           const videoData = e.target?.result as string;
           if (currentUser) {
              const updatedUser = { ...currentUser, accreditationVideo: videoData };
              setCurrentUser(updatedUser);
              await updateVault((prev) => ({ users: prev.users.map(u => u.id === currentUser.id ? updatedUser : u) }), { action: 'ACCREDITAMENTO FORENSE', details: `Registrato video di 8s per operatore ${currentUser.username}.`, videoProof: videoData });
              setView('dashboard');
           }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      
      recorder.start();
      setIsRecording(true);
      let count = 8;
      setCountdown(8);
      const timer = setInterval(() => {
        count--;
        setCountdown(count);
        if (count === 0) {
          clearInterval(timer);
          recorder.stop();
          setIsRecording(false);
        }
      }, 1000);
    } catch (e) { alert("Accesso camera negato."); }
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

  // Fix: Added handleSendMessage to handle chat message persistence
  const handleSendMessage = async (msg: Partial<ChatMessage>) => {
    if (!currentUser || !state) return;
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      userId: currentUser.id,
      username: currentUser.username,
      role: currentUser.role,
      workgroup: currentUser.workgroup,
      text: msg.text || '',
      timestamp: new Date().toISOString(),
      attachments: msg.attachments,
      isVoice: msg.isVoice,
      recipientId: msg.recipientId
    };
    await updateVault((prev) => ({ chatMessages: [...(prev.chatMessages || []), newMessage] }));
  };

  // Fix: Added handleMarkChatRead to update last read timestamps for the current user
  const handleMarkChatRead = async (chatId: string) => {
    if (!currentUser || !state) return;
    const now = new Date().toISOString();
    const updatedTimestamps = { ...(currentUser.lastReadTimestamps || {}), [chatId]: now };
    const updatedUser = { ...currentUser, lastReadTimestamps: updatedTimestamps };
    setCurrentUser(updatedUser);
    await updateVault((prev) => ({
      users: prev.users.map(u => u.id === currentUser.id ? updatedUser : u)
    }));
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
            const init: AppState = { vaultId: vId, version: 1, commandName: cmd, users: [{ id: 'u-admin', username: u, passwordHash: p, role: UserRole.ADMIN, workgroup: 'COMANDO', mustChangePassword: false, loginCount: 0, isFirstLogin: false, permissions: { canManageFunds: true, canManageWorks: true, canManagePlanning: true, canAccessAudit: true, canAdminUsers: true, canExportData: true } }], idvs: [], orders: [], planningNeeds: [], planningLists: [], auditLog: [], chatMessages: [], briefings: [], lastSync: new Date().toISOString() }; 
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

  // VIEW: PRIMO ACCESSO (IMPOSTA FOTO)
  if (view === 'first-login-setup') return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-50 p-6">
       <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-lg w-full text-center border border-indigo-100 space-y-8">
          <EsercitoLogo size="md" />
          <h2 className="text-2xl font-black uppercase italic tracking-tighter">Profilo Operatore</h2>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Caricamento Identità Bio-Digitale</p>
          <div className="space-y-6">
             <div className="w-32 h-32 mx-auto rounded-full bg-slate-50 border-4 border-dashed border-slate-200 flex items-center justify-center relative overflow-hidden group">
                {currentUser?.profilePhoto ? <img src={currentUser.profilePhoto} className="w-full h-full object-cover" /> : <span className="text-4xl">📸</span>}
                <input type="file" accept="image/*" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => handleFirstLoginSetup(ev.target?.result as string);
                    reader.readAsDataURL(file);
                  }
                }} className="absolute inset-0 opacity-0 cursor-pointer" />
             </div>
             <p className="text-[9px] font-bold text-slate-400 uppercase italic">Clicca sul cerchio per caricare la foto del profilo istituzionale</p>
          </div>
       </div>
    </div>
  );

  // VIEW: ACCREDITAMENTO VIDEO 8S
  if (view === 'responsibility-accreditation') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
       <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-2xl w-full text-center space-y-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-rose-600"></div>
          <h2 className="text-2xl font-black uppercase italic tracking-tighter">Accreditamento Forense DNA</h2>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">Per procedere è necessario registrare un video di assunzione responsabilità di 8 secondi. <br/>Il video sarà sigillato nel DNA e visibile solo agli organi di controllo.</p>
          
          <div className="aspect-video bg-black rounded-3xl overflow-hidden relative shadow-2xl border-4 border-slate-900">
             <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
             {isRecording && (
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-full font-black animate-pulse">
                   <div className="w-2 h-2 rounded-full bg-white animate-ping"></div>
                   REC: {countdown}s
                </div>
             )}
          </div>

          <div className="flex gap-4">
             <button onClick={() => setView('dashboard')} className="flex-1 py-5 text-slate-400 font-black uppercase text-[10px] tracking-widest">Salta (Facoltativo)</button>
             <button onClick={startAccreditationVideo} disabled={isRecording} className="flex-[2] py-5 bg-rose-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-rose-700 transition-all border-b-4 border-rose-900 active:translate-y-1">
                {isRecording ? 'Registrazione in corso...' : 'Inizia Registrazione 8s'}
             </button>
          </div>
       </div>
    </div>
  );

  // VIEW: CAMBIO PASSWORD OBBLIGATORIO
  if (view === 'change-password') return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-50 p-6">
       <div className="bg-white rounded-[4rem] p-12 shadow-2xl max-w-lg w-full text-center border border-indigo-100 space-y-8">
          <EsercitoLogo size="md" />
          <h2 className="text-2xl font-black uppercase italic tracking-tighter">Nuova Chiave di Accesso</h2>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Procedura Obbligatoria di Sicurezza DNA</p>
          <div className="space-y-4 text-left">
             <input type="password" id="np1" placeholder="Nuova Password" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-3xl font-bold focus:border-indigo-600 outline-none" />
             <input type="password" id="np2" placeholder="Conferma Password" className="w-full px-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-3xl font-bold focus:border-indigo-600 outline-none" />
             <button onClick={() => {
                const p1 = (document.getElementById('np1') as HTMLInputElement).value;
                const p2 = (document.getElementById('np2') as HTMLInputElement).value;
                if (p1 && p1 === p2) handlePasswordChange(p1);
                else alert("Le password non coincidono o sono vuote.");
             }} className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black uppercase shadow-xl hover:bg-indigo-700 border-b-4 border-indigo-900 active:translate-y-1">Applica Nuova Chiave</button>
          </div>
       </div>
    </div>
  );

  if (!state || !currentUser) return null;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 font-['Inter'] text-slate-700 overflow-hidden">
      <GlobalLoader active={isProcessing} />
      <div className="flex flex-1 h-full min-h-0">
        <aside className="w-84 bg-white border-r border-slate-200 p-4 flex flex-col shadow-xl z-50 h-full">
          <div className="pt-2 pb-5 border-b border-slate-100 flex flex-col flex-shrink-0 relative text-center">
             <EsercitoLogo size="sm" />
             <p className="text-[10px] font-black uppercase text-indigo-700 tracking-[0.2em] px-2 italic mt-2">{state.commandName}</p>
             <div className="flex flex-col items-center gap-2 mb-2 mt-4 bg-slate-50 p-4 rounded-[2rem] border border-slate-100 shadow-inner relative group">
                <button 
                  onClick={handleLogout}
                  className="absolute top-3 right-3 p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all z-20"
                  title="Uscita / Sblocco"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
                <div className="w-20 h-20 rounded-3xl bg-white overflow-hidden border-4 border-indigo-100 shadow-lg relative flex items-center justify-center">
                   {currentUser.profilePhoto ? <img src={currentUser.profilePhoto} className="w-full h-full object-cover" /> : <span className="text-3xl">👤</span>}
                </div>
                <div className="text-center">
                  <span className={`text-[8px] font-black uppercase italic tracking-widest px-3 py-1 rounded-full border inline-block mb-1 ${currentUser.role === UserRole.ADMIN ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-400 border-slate-100'}`}>{currentUser.role}</span>
                  <p className="text-sm font-black text-indigo-900 uppercase truncate tracking-tight">{currentUser.username}</p> 
                </div>
             </div>
          </div>
          <nav className="space-y-0.5 flex-1 overflow-y-auto no-scrollbar py-4 px-2">
            {[ 
              { id: 'dashboard', label: 'Analisi' }, 
              { id: 'works', label: 'Lavori' }, 
              { id: 'idvs', label: 'Fondi' }, 
              { id: 'planning', label: 'Registro Obiettivi' }, 
              { id: 'comms', label: 'Chat' }, 
              { id: 'audit', label: 'Registro DNA', restricted: !currentUser.permissions.canAccessAudit }, 
              { id: 'admin', label: 'Staff DNA', restricted: !currentUser.permissions.canAdminUsers },
              { id: 'manual', label: 'Manuale' } 
            ].filter(i => !i.restricted).map(item => (
                <button key={item.id} onClick={() => { setView(item.id as any); setEditWorkOrder(null); }} className={`w-full flex items-center justify-between px-6 py-3 rounded-[1.2rem] transition-all relative ${view === item.id ? 'bg-indigo-600 text-white shadow-lg scale-[1.01]' : 'text-slate-400 hover:bg-slate-50'}`}> 
                  <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span> 
                </button> 
            ))}
          </nav>
        </aside>

        <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
          <header className="bg-white px-10 py-5 flex justify-between items-center border-b border-slate-200 z-40 flex-shrink-0 shadow-sm">
            <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter leading-none">Registro Obiettivi & DNA Protocol</h2>
            <div className="flex gap-4">
              <button onClick={handleUndo} className="p-2 border rounded-xl bg-white text-slate-400 hover:text-indigo-600">↩</button>
              {currentUser.permissions.canExportData && <button onClick={handleGlobalExportPDF} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase shadow-md">Export DNA PDF</button>}
            </div>
          </header>

          <div className="flex-1 overflow-hidden p-6 bg-slate-50/50">
             <div className="max-w-[1400px] mx-auto w-full h-full flex flex-col">
                {view === 'dashboard' && <Dashboard idvs={state.idvs} orders={state.orders} auditLog={state.auditLog} commandName={state.commandName} onChapterClick={(c) => { setSelectedChapter(c); setView('chapter-detail'); }} />} 
                {view === 'works' && <Catalog orders={globalFilter === 'mine' ? state.orders.filter(o => o.workgroup === currentUser.workgroup) : state.orders} idvs={state.idvs} onAdd={() => { setEditWorkOrder(null); setView('add-work'); }} onStageClick={(o, s) => { if (s === 1) setEditWorkOrder(o); if (s === 2) setBidModalOrder(o); if (s === 3) setPaymentModalOrder(o); }} onDelete={async (id) => { await updateVault((prev) => ({ orders: prev.orders.filter(ord => ord.id !== id) })); }} onToggleLock={async (id) => { await updateVault((prev) => ({ orders: prev.orders.map(ord => ord.id === id ? { ...ord, locked: !ord.locked } : ord) })); }} currentUser={currentUser} onShowHistory={(id) => setHistoryFilterId(id)} onChapterClick={(c) => { setSelectedChapter(c); setView('chapter-detail'); }} />} 
                {view === 'idvs' && <IdvList idvs={globalFilter === 'mine' ? state.idvs.filter(i => i.assignedWorkgroup === currentUser.workgroup) : state.idvs} orders={state.orders} onAdd={() => setView('add-idv')} onChapterClick={(c) => { setSelectedChapter(c); setView('chapter-detail'); }} onDelete={async (id) => { await updateVault((prev) => ({ idvs: prev.idvs.filter(idv => idv.id !== id) })); }} onToggleLock={async (id) => { await updateVault((prev) => ({ idvs: prev.idvs.map(idv => idv.id === id ? { ...idv, locked: !idv.locked } : idv) })); }} userRole={currentUser.role} commandName={state.commandName} onShowHistory={(id) => setHistoryFilterId(id)} />} 
                {view === 'planning' && <PlanningModule state={state} activeListId={activePlanningListId} onSetActiveListId={setActivePlanningListId} onUpdate={async (u, log) => { await updateVault(u, log); }} currentUser={currentUser} globalFilter={globalFilter} commandName={state.commandName} onShowHistory={(id) => setHistoryFilterId(id)} onLoadFunding={(need) => { setPrefillIdvData({ motivation: need.description, amount: need.projectValue, capitolo: need.chapter, sourceProjectId: need.id, assignedWorkgroup: need.workgroup }); setView('add-idv'); }} />} 
                {view === 'chapter-detail' && selectedChapter && <ChapterReport chapter={selectedChapter} idvs={state.idvs.filter(i => i.capitolo === selectedChapter)} allIdvs={state.idvs} orders={state.orders} onBack={() => setView('dashboard')} onAddWork={() => setView('add-work')} onOrderClick={(id) => { setHighlightedOrderId(id); setView('works'); }} userRole={currentUser.role} currentUser={currentUser} />} 
                {view === 'audit' && <AuditLog log={state.auditLog} filter={auditFilter} setFilter={setAuditFilter} fromDate={auditFromDate} setFromDate={setAuditFromDate} toDate={auditToDate} setToDate={setAuditToDate} />}
                {view === 'comms' && <Messenger messages={state.chatMessages || []} currentUser={currentUser} allUsers={state.users} onSendMessage={handleSendMessage} onReadChat={handleMarkChatRead} />}
                {view === 'admin' && <AdminModule users={state.users} currentUser={currentUser} onUpdateUsers={async (nu, log) => { await updateVault({ users: nu }, log); }} />}
                {view === 'manual' && <Manual commandName={state.commandName} />}

                {/* MODALI ESCLUSIVI */}
                {view === 'add-idv' && <IdvForm existingChapters={Array.from(new Set(state.idvs.map(i => i.capitolo)))} users={state.users} currentUser={currentUser} initialData={prefillIdvData || undefined} onSubmit={async (d) => { const newIdvId = `idv-${Date.now()}`; await updateVault((prev) => { const nextState = { ...prev, idvs: [...prev.idvs, { id: newIdvId, ...d as any, createdAt: new Date().toISOString(), ownerId: currentUser.id, ownerName: currentUser.username, ownerWorkgroup: currentUser.workgroup }] }; if(prefillIdvData?.sourceProjectId) { nextState.planningNeeds = nextState.planningNeeds.map(n => n.id === prefillIdvData.sourceProjectId ? {...n, isFunded: true, linkedIdvId: newIdvId} : n); } return nextState; }, { action: 'REGISTRAZIONE ASSET', details: `Asset IDV ${d.idvCode} registrato con successo.`, relatedId: newIdvId }); setPrefillIdvData(null); setView('idvs'); }} onCancel={() => { setPrefillIdvData(null); setView('idvs'); }} />} 
                {(view === 'add-work' || (view === 'works' && editWorkOrder)) && <WorkForm idvs={state.idvs} orders={state.orders} currentUser={currentUser} existingChapters={Array.from(new Set(state.idvs.map(i => i.capitolo)))} initialData={editWorkOrder || undefined} prefilledChapter={selectedChapter || undefined} onSubmit={async (d) => { if (editWorkOrder) await updateVault((prev) => ({ orders: prev.orders.map(o => o.id === editWorkOrder.id ? { ...o, ...d } : o) })); else { const newId = `w-${Date.now()}`; await updateVault((prev) => ({ orders: [...prev.orders, { id: newId, ...d as any, orderNumber: `IMP-${Date.now()}`, status: WorkStatus.PROGETTO, createdAt: new Date().toISOString(), ownerId: currentUser.id, ownerName: currentUser.username, workgroup: currentUser.workgroup }] })); } setEditWorkOrder(null); setView('works'); }} onCancel={() => { setEditWorkOrder(null); setView('works'); }} />}
                {bidModalOrder && <BidModal order={bidModalOrder} onSave={async (b) => { await updateVault((prev) => ({ orders: prev.orders.map(o => o.id === bidModalOrder.id ? { ...o, status: WorkStatus.AFFIDAMENTO, winner: b.winner, contractValue: b.bidValue, contractPdf: b.contractPdf } : o) })); setBidModalOrder(null); }} onClose={() => setBidModalOrder(null)} />}
                {paymentModalOrder && <PaymentModal order={paymentModalOrder} onSave={async (p) => { await updateVault((prev) => ({ orders: prev.orders.map(o => o.id === paymentModalOrder.id ? { ...o, status: WorkStatus.PAGAMENTO, paidValue: p.paidValue, invoicePdf: p.invoicePdf, invoiceNumber: p.invoiceNumber, invoiceDate: p.invoiceDate, creGenerated: true, creDate: p.creDate } : o) })); setPaymentModalOrder(null); }} onClose={() => setPaymentModalOrder(null)} />}
             </div>
          </div>
        </main>
      </div>
    </div>
  );
};
export default App;
