import {
  ref as dbRef,
  push,
  set,
  onValue,
  onDisconnect,
  remove,
  get,
  query,
  limitToLast,
} from 'firebase/database';
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage } from '../firebase';

export type UserRoleTag = 'PRO' | 'FREE' | 'FORZE_ARMATE';

export interface OnlinePresenceUser {
  clientId: string;
  name: string;
  role: UserRoleTag;
  joinedAt: number;
  lastSeen: number;
  projectTitle?: string;
}

export interface SharedFileAttachmentRef {
  fileId: string;
  folderId: string;
  folderTitle: string;
  fileName: string;
  size: number;
}

export interface SharedChatMessage {
  id: string;
  clientId: string;
  senderName: string;
  senderRole: UserRoleTag;
  text: string;
  createdAt: number;
  attachment?: SharedFileAttachmentRef;
}

export interface SharedTypingUser {
  clientId: string;
  name: string;
  updatedAt: number;
}

export interface ComputoThemeFolder {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  accentHex: string;
  badgeClass: string;
}

export interface SharedStorageFileItem {
  id: string;
  folderId: string;
  fileName: string;
  size: number;
  mimeType: string;
  authorClientId: string;
  authorName: string;
  authorRole: UserRoleTag;
  createdAt: number;
  note?: string;
  storageBackend: 'storage' | 'rtdb';
  storagePath?: string;
  downloadUrl?: string;
}

export const SHARED_COMPUTI_FOLDERS: ComputoThemeFolder[] = [
  {
    id: '01_ristrutturazioni_interni',
    number: '01',
    title: 'Ristrutturazioni & Interni',
    subtitle: 'Appartamenti, bagni, cucine, demolizioni e tramezzi',
    accentHex: '#f97316',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
  },
  {
    id: '02_strutture_ca_acciaio',
    number: '02',
    title: 'Strutture C.A. & Acciaio',
    subtitle: 'Fondazioni, pilastri, travi, solai e adeguamenti sismici',
    accentHex: '#dc2626',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  {
    id: '03_impianti_elettrici_fv',
    number: '03',
    title: 'Impianti Elettrici & FV',
    subtitle: 'Quadri, distribuzione, domotica, illuminazione e fotovoltaico',
    accentHex: '#eab308',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    id: '04_idrotermico_clima',
    number: '04',
    title: 'Idro-Termo-Sanitari & Clima',
    subtitle: 'Pompe di calore, radiante, caldaie, scarichi e VMC',
    accentHex: '#0284c7',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
  },
  {
    id: '05_facciate_cappotti_coperture',
    number: '05',
    title: 'Facciate, Cappotti & Coperture',
    subtitle: 'Isolamento termico, ponteggi, tetti e impermeabilizzazioni',
    accentHex: '#059669',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    id: '06_strade_scavi_urbaniz',
    number: '06',
    title: 'Strade, Scavi & Urbanizzazioni',
    subtitle: 'Movimento terra, asfalti, fognature e sottoservizi',
    accentHex: '#78716c',
    badgeClass: 'bg-stone-200 text-stone-800 border-stone-300',
  },
  {
    id: '07_sicurezza_cantiere_psc',
    number: '07',
    title: 'Sicurezza Cantiere (PSC)',
    subtitle: 'Oneri sicurezza, recinzioni, apprestamenti e segnaletica',
    accentHex: '#b45309',
    badgeClass: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  },
  {
    id: '08_finiture_serramenti_pitture',
    number: '08',
    title: 'Finiture, Serramenti & Pitture',
    subtitle: 'Infissi, cartongesso, posa pavimenti e tinteggiature',
    accentHex: '#7c3aed',
    badgeClass: 'bg-violet-100 text-violet-800 border-violet-300',
  },
  {
    id: '09_opere_pubbliche_pnrr',
    number: '09',
    title: 'Opere Pubbliche & PNRR',
    subtitle: 'Edifici scolastici, gare d’appalto e manutenzioni enti',
    accentHex: '#2563eb',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  {
    id: '10_template_analisi_vari',
    number: '10',
    title: 'Template, Analisi & Vari',
    subtitle: 'Modelli pronti, nuovi prezzi, listini e computi misti',
    accentHex: '#0d9488',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-300',
  },
];

const CLIENT_ID_KEY = 'gecola_shared_client_id';
const DISPLAY_NAME_KEY = 'gecola_shared_display_name';
const MAX_RTDB_FALLBACK_BYTES = 2.2 * 1024 * 1024; // ~2.2 MB safe on Firebase Spark RTDB

export function getOrCreateSharedClientId(): string {
  try {
    const existing = sessionStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const created = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function getStoredDisplayName(fallbackEmail?: string | null, isArmedForces?: boolean): string {
  try {
    const saved = localStorage.getItem(DISPLAY_NAME_KEY)?.trim();
    if (saved) return saved;
  } catch {}
  if (fallbackEmail) {
    const local = fallbackEmail.split('@')[0] || fallbackEmail;
    return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (isArmedForces) return 'Operatore Forze Armate';
  const suffix = getOrCreateSharedClientId().slice(-4).toUpperCase();
  return `Ospite ${suffix}`;
}

export function saveStoredDisplayName(name: string): void {
  try {
    const cleaned = name.trim().slice(0, 32);
    if (cleaned) localStorage.setItem(DISPLAY_NAME_KEY, cleaned);
  } catch {}
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatChatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function registerSharedPresence(
  user: OnlinePresenceUser
): () => void {
  if (!db) return () => {};

  const presenceRef = dbRef(db, `sharedPresence/${user.clientId}`);
  const connectedRef = dbRef(db, '.info/connected');

  const writePresence = () => {
    set(presenceRef, {
      ...user,
      lastSeen: Date.now(),
    }).catch(() => {});
  };

  const unsubConnected = onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      onDisconnect(presenceRef).remove().catch(() => {});
      writePresence();
    }
  });

  // Update immediately as well
  writePresence();

  const heartbeat = window.setInterval(() => {
    set(presenceRef, {
      ...user,
      lastSeen: Date.now(),
    }).catch(() => {});
  }, 25000);

  return () => {
    window.clearInterval(heartbeat);
    unsubConnected();
    remove(presenceRef).catch(() => {});
  };
}

export function subscribeSharedPresence(
  callback: (users: OnlinePresenceUser[]) => void
): () => void {
  if (!db) {
    callback([]);
    return () => {};
  }
  const listRef = dbRef(db, 'sharedPresence');
  return onValue(listRef, (snap) => {
    const raw = snap.val() as Record<string, OnlinePresenceUser> | null;
    if (!raw) {
      callback([]);
      return;
    }
    const cutoff = Date.now() - 90_000;
    const users = Object.values(raw)
      .filter((u) => u && u.clientId && u.name && (u.lastSeen || 0) >= cutoff)
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    callback(users);
  });
}

export function setSharedChatTyping(clientId: string, name: string, isTyping: boolean): void {
  if (!db) return;
  const typingRef = dbRef(db, `sharedChatTyping/${clientId}`);
  if (!isTyping) {
    remove(typingRef).catch(() => {});
    return;
  }
  onDisconnect(typingRef).remove().catch(() => {});
  set(typingRef, { clientId, name, updatedAt: Date.now() }).catch(() => {});
}

export function subscribeSharedChatTyping(
  callback: (typingUsers: SharedTypingUser[]) => void
): () => void {
  if (!db) {
    callback([]);
    return () => {};
  }
  const typingListRef = dbRef(db, 'sharedChatTyping');
  return onValue(typingListRef, (snap) => {
    const raw = snap.val() as Record<string, SharedTypingUser> | null;
    if (!raw) {
      callback([]);
      return;
    }
    const now = Date.now();
    const list = Object.values(raw).filter((t) => t && now - (t.updatedAt || 0) < 8000);
    callback(list);
  });
}

export function subscribeSharedChatMessages(
  callback: (messages: SharedChatMessage[]) => void
): () => void {
  if (!db) {
    callback([]);
    return () => {};
  }
  const q = query(dbRef(db, 'sharedChat/messages'), limitToLast(150));
  return onValue(q, (snap) => {
    const raw = snap.val() as Record<string, Omit<SharedChatMessage, 'id'>> | null;
    if (!raw) {
      callback([]);
      return;
    }
    const seen = new Set<string>();
    const list: SharedChatMessage[] = [];
    for (const [id, msg] of Object.entries(raw)) {
      if (!msg || seen.has(id)) continue;
      seen.add(id);
      list.push({ id, ...msg });
    }
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(list);
  });
}

export async function sendSharedChatMessage(payload: {
  clientId: string;
  senderName: string;
  senderRole: UserRoleTag;
  text: string;
  attachment?: SharedFileAttachmentRef;
}): Promise<void> {
  if (!db) throw new Error('Database Firebase non disponibile.');
  const trimmed = payload.text.trim();
  if (!trimmed && !payload.attachment) return;

  const listRef = dbRef(db, 'sharedChat/messages');
  const newRef = push(listRef);
  await set(newRef, {
    clientId: payload.clientId,
    senderName: payload.senderName.trim() || 'Utente',
    senderRole: payload.senderRole,
    text: trimmed,
    createdAt: Date.now(),
    ...(payload.attachment ? { attachment: payload.attachment } : {}),
  });
}

export function subscribeAllSharedFiles(
  callback: (filesByFolder: Record<string, SharedStorageFileItem[]>) => void
): () => void {
  if (!db) {
    callback({});
    return () => {};
  }
  const rootRef = dbRef(db, 'sharedStorageMeta');
  return onValue(rootRef, (snap) => {
    const raw = snap.val() as Record<string, Record<string, SharedStorageFileItem>> | null;
    const grouped: Record<string, SharedStorageFileItem[]> = {};
    for (const f of SHARED_COMPUTI_FOLDERS) {
      grouped[f.id] = [];
    }
    if (raw) {
      for (const [folderId, folderMap] of Object.entries(raw)) {
        if (!folderMap) continue;
        const items = Object.entries(folderMap)
          .map(([id, item]) => ({ ...item, id }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        grouped[folderId] = items;
      }
    }
    callback(grouped);
  });
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function tryUploadToFirebaseStorage(
  blob: Blob,
  path: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!storage) {
      reject(new Error('Firebase Storage non inizializzato'));
      return;
    }
    const fileRef = storageRef(storage, path);
    const task = uploadBytesResumable(fileRef, blob, {
      contentType: blob.type || 'application/octet-stream',
    });

    const timeout = window.setTimeout(() => {
      try {
        task.cancel();
      } catch {}
      reject(new Error('Timeout caricamento Firebase Storage'));
    }, 12000);

    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0 && onProgress) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (err) => {
        window.clearTimeout(timeout);
        reject(err);
      },
      async () => {
        window.clearTimeout(timeout);
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export async function uploadSharedFile(params: {
  folderId: string;
  file: File | Blob;
  fileName: string;
  authorClientId: string;
  authorName: string;
  authorRole: UserRoleTag;
  note?: string;
  onProgress?: (pct: number) => void;
}): Promise<SharedStorageFileItem> {
  if (!db) throw new Error('Database Firebase non disponibile.');

  const safeName = params.fileName.replace(/[^\w.\-() ]+/g, '_').slice(0, 120) || 'computo.json';
  const fileId = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const mimeType = params.file.type || (safeName.toLowerCase().endsWith('.json') ? 'application/json' : 'application/octet-stream');
  const storagePath = `shared_computi/${params.folderId}/${fileId}_${safeName}`;

  let storageBackend: 'storage' | 'rtdb' = 'storage';
  let downloadUrl: string | undefined;

  try {
    downloadUrl = await tryUploadToFirebaseStorage(params.file, storagePath, params.onProgress);
  } catch (storageErr) {
    // Piano gratuito Spark / utente Free senza auth su bucket Storage: fallback trasparente su Realtime Database
    if (params.file.size > MAX_RTDB_FALLBACK_BYTES) {
      throw new Error(
        `Impossibile caricare file > 2,2 MB su Storage Firebase (regole bucket o piano gratuito). Comprimi il file o verifica i permessi Firebase Storage.`
      );
    }
    params.onProgress?.(45);
    const buf = new Uint8Array(await params.file.arrayBuffer());
    const b64 = uint8ToBase64(buf);
    await set(dbRef(db, `sharedStoragePayloads/${fileId}`), {
      b64,
      mimeType,
      fileName: safeName,
      createdAt: Date.now(),
    });
    storageBackend = 'rtdb';
    params.onProgress?.(100);
  }

  const item: SharedStorageFileItem = {
    id: fileId,
    folderId: params.folderId,
    fileName: safeName,
    size: params.file.size,
    mimeType,
    authorClientId: params.authorClientId,
    authorName: params.authorName,
    authorRole: params.authorRole,
    createdAt: Date.now(),
    ...(params.note?.trim() ? { note: params.note.trim().slice(0, 160) } : {}),
    storageBackend,
    ...(storageBackend === 'storage' ? { storagePath, downloadUrl } : {}),
  };

  await set(dbRef(db, `sharedStorageMeta/${params.folderId}/${fileId}`), item);
  return item;
}

export async function fetchSharedFileBlob(item: SharedStorageFileItem): Promise<Blob> {
  if (item.storageBackend === 'storage' && item.downloadUrl) {
    const res = await fetch(item.downloadUrl);
    if (!res.ok) throw new Error('Errore download da Firebase Storage');
    return await res.blob();
  }
  if (!db) throw new Error('Database Firebase non disponibile.');
  const snap = await get(dbRef(db, `sharedStoragePayloads/${item.id}`));
  const val = snap.val() as { b64?: string; mimeType?: string } | null;
  if (!val?.b64) {
    throw new Error('Contenuto file non più presente nel database.');
  }
  const bytes = base64ToUint8(val.b64);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: val.mimeType || item.mimeType || 'application/octet-stream' });
}

export async function downloadSharedFile(item: SharedStorageFileItem): Promise<void> {
  const blob = await fetchSharedFileBlob(item);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function deleteSharedFile(item: SharedStorageFileItem): Promise<void> {
  if (!db) throw new Error('Database Firebase non disponibile.');
  await remove(dbRef(db, `sharedStorageMeta/${item.folderId}/${item.id}`));

  if (item.storageBackend === 'rtdb') {
    await remove(dbRef(db, `sharedStoragePayloads/${item.id}`)).catch(() => {});
  } else if (item.storagePath && storage) {
    await deleteObject(storageRef(storage, item.storagePath)).catch(() => {});
  }
}
