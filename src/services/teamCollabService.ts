import {
  ref as dbRef,
  get,
  set,
  remove,
  onValue,
  onDisconnect,
  query,
  limitToLast,
} from 'firebase/database';
import { signInAnonymously } from 'firebase/auth';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { auth, db, storage } from '../firebase';

export const DEFAULT_SHARED_FOLDERS = [
  'Generale',
  'Gare e Appalti',
  'Cantieri Attivi',
  'Subappalti',
];

export type CollabBackendMode = 'server' | 'firebase' | 'local';

export interface CollabStatusInfo {
  mode: CollabBackendMode;
  connected: boolean;
  notice?: string;
  needsFirebaseRules?: boolean;
}

export interface SharedFileMeta {
  id: string;
  fileName: string;
  title: string;
  folder: string;
  docType: 'CME' | 'CM';
  author: string;
  note?: string;
  articleCount: number;
  planSheetCount: number;
  totalAmount: number;
  sizeBytes: number;
  savedAt: string;
  updatedAt: string;
  storageBackend?: 'rtdb' | 'storage';
  storagePath?: string;
  downloadUrl?: string;
}

export interface ChatAttachment {
  sharedFileId: string;
  fileName: string;
  title: string;
  folder: string;
  docType: 'CME' | 'CM';
  articleCount: number;
  totalAmount: number;
}

export interface ChatMessage {
  id: string;
  channel: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  attachment?: ChatAttachment;
}

export interface OnlineOperator {
  userId: string;
  userName: string;
  channel: string;
  connectedAt: string;
  accountType?: 'account' | 'altri';
  isArmedForces?: boolean;
}

export interface SharedFolderListing {
  folders: string[];
  files: SharedFileMeta[];
}

export interface SaveToSharedFolderRequest {
  title: string;
  fileName: string;
  folder: string;
  docType: 'CME' | 'CM';
  author: string;
  note?: string;
  articleCount: number;
  planSheetCount: number;
  totalAmount: number;
  payload: unknown;
  notifyInChat?: boolean;
  chatChannel?: string;
  senderId?: string;
}

export interface CollabSessionCallbacks {
  userId: string;
  userName: string;
  channel: string;
  accountType?: 'account' | 'altri';
  isArmedForces?: boolean;
  onStatusChange: (status: CollabStatusInfo) => void;
  onMessagesReplace: (messages: ChatMessage[]) => void;
  onMessageAdded: (message: ChatMessage) => void;
  onMessageDeleted: (messageId: string) => void;
  onOperatorsChange: (operators: OnlineOperator[]) => void;
  onSharedUpdated: (filesCount?: number) => void;
}

export interface CollabSessionHandle {
  updatePresence: (
    userName: string,
    channel: string,
    accountType?: 'account' | 'altri',
    isArmedForces?: boolean
  ) => void;
  sendMessage: (params: {
    id?: string;
    channel: string;
    senderName: string;
    text: string;
    attachment?: ChatAttachment;
  }) => Promise<ChatMessage>;
  deleteMessage: (messageId: string) => Promise<void>;
  disconnect: () => void;
}

export const RECOMMENDED_FIREBASE_RTDB_RULES = `{
  "rules": {
    "sessions": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "sharedChat": { ".read": "auth != null", ".write": "auth != null" },
    "sharedPresence": { ".read": true, ".write": true },
    "sharedStorageMeta": { ".read": "auth != null", ".write": "auth != null" },
    "sharedStoragePayloads": { ".read": "auth != null", ".write": "auth != null" }
  }
}`;

// -------------------- HELPERS --------------------

function sanitizeFolderName(name: string): string {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|#$.[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return cleaned || 'Generale';
}

function mergeFolders(raw?: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw.map((f) => sanitizeFolderName(String(f || '')))
    : raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>).map((f) => sanitizeFolderName(String(f || '')))
      : [];
  const merged = [...DEFAULT_SHARED_FOLDERS];
  for (const name of list) {
    if (name && !merged.some((m) => m.toLowerCase() === name.toLowerCase())) {
      merged.push(name);
    }
  }
  return merged;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function isPermissionDeniedError(err: unknown): boolean {
  const msg = String((err as any)?.code || (err as any)?.message || err || '').toLowerCase();
  return msg.includes('permission_denied') || msg.includes('permission denied') || msg.includes('unauthorized');
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
    promise.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// -------------------- LOCAL INDEXEDDB + BROADCASTCHANNEL BACKEND --------------------

const IDB_NAME = 'gecola_team_collab_v1';
const IDB_VERSION = 1;
const STORE_KV = 'kv';
const STORE_FILES_META = 'filesMeta';
const STORE_FILE_PAYLOADS = 'filePayloads';
const STORE_MESSAGES = 'messages';
const BC_NAME = 'gecola_team_collab_sync';

type LocalBusEvent =
  | { type: 'shared:updated' }
  | { type: 'chat:message'; message: ChatMessage }
  | { type: 'chat:deleted'; messageId: string }
  | { type: 'presence:heartbeat'; operator: OnlineOperator & { lastSeen: number } }
  | { type: 'presence:leave'; userId: string };

const localEventListeners = new Set<(ev: LocalBusEvent) => void>();
let localBroadcastChannel: BroadcastChannel | null = null;

function ensureLocalBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!localBroadcastChannel) {
    localBroadcastChannel = new BroadcastChannel(BC_NAME);
    localBroadcastChannel.onmessage = (e) => {
      if (e.data && typeof e.data === 'object') {
        for (const fn of localEventListeners) fn(e.data as LocalBusEvent);
      }
    };
  }
  return localBroadcastChannel;
}

function emitLocalEvent(ev: LocalBusEvent) {
  for (const fn of localEventListeners) fn(ev);
  try {
    ensureLocalBroadcastChannel()?.postMessage(ev);
  } catch {
    // ignore
  }
}

function openCollabIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_KV)) {
        database.createObjectStore(STORE_KV, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(STORE_FILES_META)) {
        database.createObjectStore(STORE_FILES_META, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORE_FILE_PAYLOADS)) {
        database.createObjectStore(STORE_FILE_PAYLOADS, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORE_MESSAGES)) {
        database.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB non disponibile'));
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const database = await openCollabIdb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result || []) as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const database = await openCollabIdb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(storeName: string, value: unknown): Promise<void> {
  const database = await openCollabIdb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const database = await openCollabIdb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function localFetchSharedFolder(): Promise<SharedFolderListing> {
  const kvRow = await idbGet<{ key: string; value: string[] }>(STORE_KV, 'folders');
  const folders = mergeFolders(kvRow?.value);
  const files = (await idbGetAll<SharedFileMeta>(STORE_FILES_META)).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return { folders, files };
}

async function localCreateSubfolder(name: string): Promise<{ folder: string; folders: string[] }> {
  const folder = sanitizeFolderName(name);
  const { folders } = await localFetchSharedFolder();
  const next = mergeFolders([...folders, folder]);
  await idbPut(STORE_KV, { key: 'folders', value: next });
  emitLocalEvent({ type: 'shared:updated' });
  return { folder, folders: next };
}

async function localSaveFile(req: SaveToSharedFolderRequest): Promise<{ file: SharedFileMeta; folders: string[] }> {
  const folder = sanitizeFolderName(req.folder || 'Generale');
  const { folders: currentFolders, files } = await localFetchSharedFolder();
  const folders = mergeFolders([...currentFolders, folder]);
  await idbPut(STORE_KV, { key: 'folders', value: folders });

  const existing = files.find(
    (f) => f.folder.toLowerCase() === folder.toLowerCase() && f.fileName.toLowerCase() === req.fileName.toLowerCase()
  );
  const id = existing ? existing.id : makeId('sh');
  const nowIso = new Date().toISOString();
  const serialized = JSON.stringify(req.payload);
  const sizeBytes = new Blob([serialized]).size;

  const meta: SharedFileMeta = {
    id,
    fileName: req.fileName,
    title: req.title,
    folder,
    docType: req.docType,
    author: req.author,
    note: req.note,
    articleCount: Number(req.articleCount) || 0,
    planSheetCount: Number(req.planSheetCount) || 0,
    totalAmount: Number(req.totalAmount) || 0,
    sizeBytes,
    savedAt: existing ? existing.savedAt : nowIso,
    updatedAt: nowIso,
  };

  await idbPut(STORE_FILE_PAYLOADS, { id, payload: req.payload });
  await idbPut(STORE_FILES_META, meta);
  emitLocalEvent({ type: 'shared:updated' });

  if (req.notifyInChat) {
    const msg: ChatMessage = {
      id: makeId('msg'),
      channel: req.chatChannel || 'generale',
      senderId: req.senderId || req.author,
      senderName: req.author,
      text: req.note
        ? `Ho salvato "${meta.fileName}" nella cartella "${meta.folder}": ${req.note}`
        : `Ho salvato "${meta.fileName}" nella cartella "${meta.folder}".`,
      timestamp: nowIso,
      attachment: {
        sharedFileId: meta.id,
        fileName: meta.fileName,
        title: meta.title,
        folder: meta.folder,
        docType: meta.docType,
        articleCount: meta.articleCount,
        totalAmount: meta.totalAmount,
      },
    };
    await localPostChatMessage(msg);
  }

  return { file: meta, folders };
}

async function localLoadFile(id: string): Promise<{ meta: SharedFileMeta; payload: any }> {
  const meta = await idbGet<SharedFileMeta>(STORE_FILES_META, id);
  const row = await idbGet<{ id: string; payload: any }>(STORE_FILE_PAYLOADS, id);
  if (!meta || !row) throw new Error('File non trovato nell’archivio locale.');
  return { meta, payload: row.payload };
}

async function localDeleteFile(id: string): Promise<void> {
  await idbDelete(STORE_FILES_META, id);
  await idbDelete(STORE_FILE_PAYLOADS, id);
  emitLocalEvent({ type: 'shared:updated' });
}

async function localFetchChatMessages(channel?: string): Promise<ChatMessage[]> {
  const all = (await idbGetAll<ChatMessage>(STORE_MESSAGES)).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  return channel ? all.filter((m) => m.channel === channel) : all.slice(-200);
}

async function localPostChatMessage(msg: ChatMessage): Promise<ChatMessage> {
  await idbPut(STORE_MESSAGES, msg);
  emitLocalEvent({ type: 'chat:message', message: msg });
  return msg;
}

async function localDeleteChatMessage(id: string): Promise<void> {
  await idbDelete(STORE_MESSAGES, id);
  emitLocalEvent({ type: 'chat:deleted', messageId: id });
}

// -------------------- BACKEND DETECTION & STATE --------------------

let cachedAuthKey: string | null = null;
let cachedDetectionPromise: Promise<CollabStatusInfo> | null = null;
let currentBackendStatus: CollabStatusInfo = { mode: 'local', connected: false };
const statusSubscribers = new Set<(status: CollabStatusInfo) => void>();

function updateBackendStatus(next: CollabStatusInfo) {
  currentBackendStatus = next;
  for (const fn of statusSubscribers) fn(next);
}

export function getCurrentCollabStatus(): CollabStatusInfo {
  return currentBackendStatus;
}

export function resetCollabBackendCache() {
  cachedAuthKey = null;
  cachedDetectionPromise = null;
}

async function probeExpressServer(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    const res = await fetch('/api/shared-folder', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) return false;
    const data = await res.json();
    return Boolean(data && Array.isArray(data.folders) && Array.isArray(data.files));
  } catch {
    return false;
  }
}

async function probeFirebaseDatabase(): Promise<{ ok: boolean; permissionDenied: boolean }> {
  if (!db) return { ok: false, permissionDenied: false };
  try {
    await withTimeout(get(dbRef(db, 'sharedPresence')), 4000, 'Firebase RTDB Presence');
    return { ok: true, permissionDenied: false };
  } catch (firstErr) {
    try {
      await withTimeout(get(dbRef(db, 'sharedStorageMeta/folders')), 4000, 'Firebase RTDB');
      return { ok: true, permissionDenied: false };
    } catch (err) {
      if (isPermissionDeniedError(err) && auth && !auth.currentUser) {
        try {
          await withTimeout(signInAnonymously(auth), 3500, 'Firebase Anon Auth');
          await withTimeout(get(dbRef(db, 'sharedPresence')), 3500, 'Firebase RTDB Presence Retry');
          return { ok: true, permissionDenied: false };
        } catch {
          // ignore if anonymous auth is disabled in console
        }
      }
      return { ok: false, permissionDenied: isPermissionDeniedError(firstErr) || isPermissionDeniedError(err) };
    }
  }
}

export async function detectCollabBackend(): Promise<CollabStatusInfo> {
  const authKey = auth?.currentUser?.uid || 'anon';
  if (cachedDetectionPromise && cachedAuthKey === authKey) {
    return cachedDetectionPromise;
  }
  cachedAuthKey = authKey;
  cachedDetectionPromise = (async () => {
    const hasServer = await probeExpressServer();
    if (hasServer) {
      const info: CollabStatusInfo = { mode: 'server', connected: true };
      updateBackendStatus(info);
      return info;
    }

    const fb = await probeFirebaseDatabase();
    if (fb.ok) {
      const info: CollabStatusInfo = { mode: 'firebase', connected: true };
      updateBackendStatus(info);
      return info;
    }

    const isLoggedIn = Boolean(auth?.currentUser);
    const info: CollabStatusInfo = {
      mode: 'local',
      connected: true,
      needsFirebaseRules: fb.permissionDenied && isLoggedIn,
      notice: fb.permissionDenied
        ? isLoggedIn
          ? 'Permessi Firebase Realtime Database non abilitati sui nodi condivisi: attivo archivio locale browser.'
          : 'Modalità Visitatore: Chat e Cartella funzionano in locale su questo browser. Effettua il Login per sincronizzare in Cloud con il team.'
        : 'Connessione Cloud non raggiungibile: attivo archivio locale browser.',
    };
    updateBackendStatus(info);
    return info;
  })();

  return cachedDetectionPromise;
}

function degradeToLocalOnPermissionError(err: unknown) {
  const isLoggedIn = Boolean(auth?.currentUser);
  const isPerm = isPermissionDeniedError(err);
  const info: CollabStatusInfo = {
    mode: 'local',
    connected: true,
    needsFirebaseRules: isPerm && isLoggedIn,
    notice: isPerm
      ? isLoggedIn
        ? 'Scrittura Firebase bloccata dalle regole RTDB: salvataggio eseguito in archivio locale browser.'
        : 'Modalità Visitatore: salvataggio in archivio locale browser. Accedi con Login per il Cloud.'
      : 'Errore di rete Firebase: attivo archivio locale browser.',
  };
  cachedDetectionPromise = Promise.resolve(info);
  updateBackendStatus(info);
}

// -------------------- FIREBASE CLOUD BACKEND (VERCEL-READY) --------------------

const MAX_RTDB_JSON_BYTES = 4 * 1024 * 1024; // 4 MB diretto su RTDB (zero CORS su Vercel)

async function firebaseFetchSharedFolder(): Promise<SharedFolderListing> {
  if (!db) throw new Error('Firebase non configurato.');
  const [foldersSnap, filesSnap] = await Promise.all([
    get(dbRef(db, 'sharedStorageMeta/folders')),
    get(dbRef(db, 'sharedStorageMeta/files')),
  ]);
  const folders = mergeFolders(foldersSnap.val());
  const rawFiles = filesSnap.val() as Record<string, SharedFileMeta> | null;
  const files: SharedFileMeta[] = rawFiles
    ? Object.entries(rawFiles)
        .filter(([, v]) => Boolean(v && typeof v === 'object' && v.fileName))
        .map(([id, v]) => ({ ...v, id }))
        .sort((a, b) => new Date(b.updatedAt || b.savedAt).getTime() - new Date(a.updatedAt || a.savedAt).getTime())
    : [];
  return { folders, files };
}

async function firebaseCreateSubfolder(name: string): Promise<{ folder: string; folders: string[] }> {
  if (!db) throw new Error('Firebase non configurato.');
  const folder = sanitizeFolderName(name);
  const snap = await get(dbRef(db, 'sharedStorageMeta/folders'));
  const folders = mergeFolders([...mergeFolders(snap.val()), folder]);
  await set(dbRef(db, 'sharedStorageMeta/folders'), folders);
  return { folder, folders };
}

async function firebaseSaveFile(req: SaveToSharedFolderRequest): Promise<{ file: SharedFileMeta; folders: string[] }> {
  if (!db) throw new Error('Firebase non configurato.');
  const folder = sanitizeFolderName(req.folder || 'Generale');
  const { folders: currentFolders, files } = await firebaseFetchSharedFolder();
  const folders = mergeFolders([...currentFolders, folder]);
  await set(dbRef(db, 'sharedStorageMeta/folders'), folders);

  const existing = files.find(
    (f) => f.folder.toLowerCase() === folder.toLowerCase() && f.fileName.toLowerCase() === req.fileName.toLowerCase()
  );
  const id = existing ? existing.id : makeId('sh');
  const nowIso = new Date().toISOString();
  const serialized = JSON.stringify(req.payload);
  const sizeBytes = new Blob([serialized]).size;

  let storageBackend: 'rtdb' | 'storage' = 'rtdb';
  let storagePath: string | undefined;
  let downloadUrl: string | undefined;

  if (sizeBytes <= MAX_RTDB_JSON_BYTES) {
    await set(dbRef(db, `sharedStoragePayloads/${id}`), {
      json: serialized,
      updatedAt: nowIso,
    });
    storageBackend = 'rtdb';
  } else if (storage) {
    storagePath = `shared_computi/${id}_${req.fileName.replace(/[^\w.-]+/g, '_')}`;
    const blob = new Blob([serialized], { type: 'application/json' });
    try {
      const fRef = storageRef(storage, storagePath);
      await withTimeout(uploadBytes(fRef, blob, { contentType: 'application/json' }), 15000, 'Firebase Storage');
      downloadUrl = await getDownloadURL(fRef);
      storageBackend = 'storage';
    } catch {
      if (sizeBytes <= 8 * 1024 * 1024) {
        await set(dbRef(db, `sharedStoragePayloads/${id}`), {
          json: serialized,
          updatedAt: nowIso,
        });
        storageBackend = 'rtdb';
        storagePath = undefined;
      } else {
        throw new Error('File troppo grande (> 8 MB) per Firebase RTDB senza permessi Storage.');
      }
    }
  } else {
    throw new Error('File troppo grande (> 4 MB) per il salvataggio Cloud.');
  }

  const meta: SharedFileMeta = stripUndefined({
    id,
    fileName: req.fileName,
    title: req.title,
    folder,
    docType: req.docType,
    author: req.author,
    note: req.note || undefined,
    articleCount: Number(req.articleCount) || 0,
    planSheetCount: Number(req.planSheetCount) || 0,
    totalAmount: Number(req.totalAmount) || 0,
    sizeBytes,
    savedAt: existing ? existing.savedAt : nowIso,
    updatedAt: nowIso,
    storageBackend,
    storagePath,
    downloadUrl,
  });

  await set(dbRef(db, `sharedStorageMeta/files/${id}`), meta);

  if (req.notifyInChat) {
    const msg: ChatMessage = stripUndefined({
      id: makeId('msg'),
      channel: req.chatChannel || 'generale',
      senderId: req.senderId || req.author,
      senderName: req.author,
      text: req.note
        ? `Ho salvato "${meta.fileName}" nella cartella condivisa "${meta.folder}": ${req.note}`
        : `Ho salvato "${meta.fileName}" nella cartella condivisa "${meta.folder}".`,
      timestamp: nowIso,
      attachment: {
        sharedFileId: meta.id,
        fileName: meta.fileName,
        title: meta.title,
        folder: meta.folder,
        docType: meta.docType,
        articleCount: meta.articleCount,
        totalAmount: meta.totalAmount,
      },
    });
    await set(dbRef(db, `sharedChat/teamMessages/${msg.id}`), msg);
  }

  return { file: meta, folders };
}

async function firebaseLoadFile(id: string): Promise<{ meta: SharedFileMeta; payload: any }> {
  if (!db) throw new Error('Firebase non configurato.');
  const metaSnap = await get(dbRef(db, `sharedStorageMeta/files/${id}`));
  const meta = metaSnap.val() as SharedFileMeta | null;
  if (!meta) throw new Error('File non trovato nella cartella condivisa.');

  if (meta.storageBackend === 'storage' && meta.downloadUrl) {
    const res = await fetch(meta.downloadUrl);
    if (!res.ok) throw new Error('Impossibile scaricare il file da Firebase Storage.');
    const payload = await res.json();
    return { meta: { ...meta, id }, payload };
  }

  const payloadSnap = await get(dbRef(db, `sharedStoragePayloads/${id}`));
  const val = payloadSnap.val() as { json?: string; payload?: unknown } | null;
  if (!val) throw new Error('Contenuto del file non più disponibile.');
  const payload = typeof val.json === 'string' ? JSON.parse(val.json) : val.payload;
  return { meta: { ...meta, id }, payload };
}

async function firebaseDeleteFile(id: string): Promise<void> {
  if (!db) throw new Error('Firebase non configurato.');
  const metaSnap = await get(dbRef(db, `sharedStorageMeta/files/${id}`)).catch(() => null);
  const meta = metaSnap?.val() as SharedFileMeta | null;
  await remove(dbRef(db, `sharedStorageMeta/files/${id}`));
  await remove(dbRef(db, `sharedStoragePayloads/${id}`)).catch(() => {});
  if (meta?.storagePath && storage) {
    await deleteObject(storageRef(storage, meta.storagePath)).catch(() => {});
  }
}

async function firebaseFetchChatMessages(channel?: string): Promise<ChatMessage[]> {
  if (!db) return [];
  const snap = await get(query(dbRef(db, 'sharedChat/teamMessages'), limitToLast(200)));
  const raw = snap.val() as Record<string, ChatMessage> | null;
  if (!raw) return [];
  const list = Object.entries(raw)
    .filter(([, m]) => Boolean(m && typeof m === 'object'))
    .map(([id, m]) => ({ ...m, id }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return channel ? list.filter((m) => m.channel === channel) : list;
}

async function firebasePostChatMessage(msg: ChatMessage): Promise<ChatMessage> {
  if (!db) throw new Error('Firebase non configurato.');
  const clean = stripUndefined(msg);
  await set(dbRef(db, `sharedChat/teamMessages/${clean.id}`), clean);
  return clean;
}

async function firebaseDeleteChatMessage(id: string): Promise<void> {
  if (!db) throw new Error('Firebase non configurato.');
  await remove(dbRef(db, `sharedChat/teamMessages/${id}`));
}

// -------------------- PUBLIC UNIFIED API --------------------

export async function fetchSharedFolderListing(): Promise<SharedFolderListing> {
  const { mode } = await detectCollabBackend();
  if (mode === 'server') {
    const res = await fetch('/api/shared-folder', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error('Impossibile leggere la cartella condivisa.');
    return res.json();
  }
  if (mode === 'firebase') {
    try {
      return await firebaseFetchSharedFolder();
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        degradeToLocalOnPermissionError(err);
        return localFetchSharedFolder();
      }
      throw err;
    }
  }
  return localFetchSharedFolder();
}

export async function createSharedSubfolder(name: string): Promise<{ folder: string; folders: string[] }> {
  const { mode } = await detectCollabBackend();
  if (mode === 'server') {
    const res = await fetch('/api/shared-folder/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Impossibile creare la cartella.');
    return res.json();
  }
  if (mode === 'firebase') {
    try {
      return await firebaseCreateSubfolder(name);
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        degradeToLocalOnPermissionError(err);
        return localCreateSubfolder(name);
      }
      throw err;
    }
  }
  return localCreateSubfolder(name);
}

export async function saveProjectToSharedFolder(
  req: SaveToSharedFolderRequest
): Promise<{ file: SharedFileMeta; folders: string[] }> {
  const { mode } = await detectCollabBackend();
  if (mode === 'server') {
    const res = await fetch('/api/shared-folder/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Errore durante il salvataggio nella cartella condivisa.');
    }
    return res.json();
  }
  if (mode === 'firebase') {
    try {
      return await firebaseSaveFile(req);
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        degradeToLocalOnPermissionError(err);
        return localSaveFile(req);
      }
      throw err;
    }
  }
  return localSaveFile(req);
}

export async function loadProjectFromSharedFolder(
  id: string
): Promise<{ meta: SharedFileMeta; payload: any }> {
  const { mode } = await detectCollabBackend();
  if (mode === 'server') {
    const res = await fetch(`/api/shared-folder/files/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('File non trovato nella cartella condivisa.');
    return res.json();
  }
  if (mode === 'firebase') {
    try {
      return await firebaseLoadFile(id);
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        degradeToLocalOnPermissionError(err);
        return localLoadFile(id);
      }
      throw err;
    }
  }
  return localLoadFile(id);
}

export async function deleteSharedFolderFile(id: string): Promise<void> {
  const { mode } = await detectCollabBackend();
  if (mode === 'server') {
    const res = await fetch(`/api/shared-folder/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Impossibile eliminare il file dalla cartella condivisa.');
    return;
  }
  if (mode === 'firebase') {
    try {
      await firebaseDeleteFile(id);
      return;
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        degradeToLocalOnPermissionError(err);
        return localDeleteFile(id);
      }
      throw err;
    }
  }
  return localDeleteFile(id);
}

export async function fetchChatHistory(
  channel?: string
): Promise<{ messages: ChatMessage[]; operators: OnlineOperator[] }> {
  const { mode } = await detectCollabBackend();
  if (mode === 'server') {
    const qs = channel ? `?channel=${encodeURIComponent(channel)}` : '';
    const res = await fetch(`/api/chat/messages${qs}`);
    if (!res.ok) throw new Error('Impossibile caricare la cronologia chat.');
    return res.json();
  }
  if (mode === 'firebase') {
    try {
      const messages = await firebaseFetchChatMessages(channel);
      return { messages, operators: [] };
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        degradeToLocalOnPermissionError(err);
        return { messages: await localFetchChatMessages(channel), operators: [] };
      }
      throw err;
    }
  }
  return { messages: await localFetchChatMessages(channel), operators: [] };
}

export async function postChatMessage(payload: {
  id?: string;
  channel: string;
  senderId: string;
  senderName: string;
  text: string;
  attachment?: ChatAttachment;
}): Promise<ChatMessage> {
  const { mode } = await detectCollabBackend();
  const msg: ChatMessage = {
    id: payload.id || makeId('msg'),
    channel: payload.channel || 'generale',
    senderId: payload.senderId,
    senderName: payload.senderName,
    text: payload.text,
    timestamp: new Date().toISOString(),
    attachment: payload.attachment,
  };

  if (mode === 'server') {
    const res = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
    if (!res.ok) throw new Error('Errore invio messaggio.');
    const data = await res.json();
    return data.message;
  }
  if (mode === 'firebase') {
    try {
      return await firebasePostChatMessage(msg);
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        degradeToLocalOnPermissionError(err);
        return localPostChatMessage(msg);
      }
      throw err;
    }
  }
  return localPostChatMessage(msg);
}

export async function deleteChatMessageApi(id: string): Promise<void> {
  const { mode } = await detectCollabBackend();
  if (mode === 'server') {
    const res = await fetch(`/api/chat/messages/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Errore eliminazione messaggio.');
    return;
  }
  if (mode === 'firebase') {
    try {
      await firebaseDeleteChatMessage(id);
      return;
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        degradeToLocalOnPermissionError(err);
        return localDeleteChatMessage(id);
      }
      throw err;
    }
  }
  return localDeleteChatMessage(id);
}

// -------------------- UNIFIED REALTIME SESSION --------------------

export function startCollabSession(callbacks: CollabSessionCallbacks): CollabSessionHandle {
  let disposed = false;
  let activeMode: CollabBackendMode = 'local';
  let currentUserName = callbacks.userName;
  let currentChannel = callbacks.channel;
  let currentAccountType: 'account' | 'altri' =
    callbacks.accountType || (callbacks.isArmedForces ? 'altri' : 'account');
  let currentIsArmedForces = Boolean(callbacks.isArmedForces || currentAccountType === 'altri');
  let wsRef: WebSocket | null = null;
  let firebasePushPresence: (() => void) | null = null;
  let localPushPresence: (() => void) | null = null;
  let reconnectTimer: number | null = null;
  let cleanupFns: Array<() => void> = [];

  const statusListener = (st: CollabStatusInfo) => {
    if (!disposed) callbacks.onStatusChange(st);
  };
  statusSubscribers.add(statusListener);
  cleanupFns.push(() => statusSubscribers.delete(statusListener));

  const startLocalMode = () => {
    activeMode = 'local';
    ensureLocalBroadcastChannel();
    const localPeers = new Map<string, OnlineOperator & { lastSeen: number }>();

    const emitOperatorsList = () => {
      if (disposed) return;
      const now = Date.now();
      localPeers.set(callbacks.userId, {
        userId: callbacks.userId,
        userName: currentUserName,
        channel: currentChannel,
        connectedAt: new Date().toISOString(),
        accountType: currentAccountType,
        isArmedForces: currentIsArmedForces,
        lastSeen: now,
      });
      const activeList: OnlineOperator[] = [];
      for (const [k, peer] of localPeers.entries()) {
        if (now - peer.lastSeen > 60_000 && k !== callbacks.userId) {
          localPeers.delete(k);
          continue;
        }
        activeList.push({
          userId: peer.userId,
          userName: peer.userName,
          channel: peer.channel,
          connectedAt: peer.connectedAt,
          accountType: peer.accountType,
          isArmedForces: peer.isArmedForces,
        });
      }
      callbacks.onOperatorsChange(activeList);
    };

    const broadcastMyPresence = () => {
      if (disposed) return;
      const me: OnlineOperator & { lastSeen: number } = {
        userId: callbacks.userId,
        userName: currentUserName,
        channel: currentChannel,
        connectedAt: new Date().toISOString(),
        accountType: currentAccountType,
        isArmedForces: currentIsArmedForces,
        lastSeen: Date.now(),
      };
      localPeers.set(callbacks.userId, me);
      emitLocalEvent({ type: 'presence:heartbeat', operator: me });
      emitOperatorsList();
    };

    localPushPresence = broadcastMyPresence;
    broadcastMyPresence();
    const hb = window.setInterval(broadcastMyPresence, 15000);
    cleanupFns.push(() => {
      window.clearInterval(hb);
      localPushPresence = null;
      emitLocalEvent({ type: 'presence:leave', userId: callbacks.userId });
    });

    localFetchChatMessages()
      .then((msgs) => {
        if (!disposed) callbacks.onMessagesReplace(msgs);
      })
      .catch(() => {});

    localFetchSharedFolder()
      .then((res) => {
        if (!disposed) callbacks.onSharedUpdated(res.files.length);
      })
      .catch(() => {});

    const onLocalEv = (ev: LocalBusEvent) => {
      if (disposed) return;
      if (ev.type === 'chat:message') {
        callbacks.onMessageAdded(ev.message);
      } else if (ev.type === 'chat:deleted') {
        callbacks.onMessageDeleted(ev.messageId);
      } else if (ev.type === 'shared:updated') {
        localFetchSharedFolder()
          .then((res) => {
            if (!disposed) callbacks.onSharedUpdated(res.files.length);
          })
          .catch(() => {});
      } else if (ev.type === 'presence:heartbeat' && ev.operator) {
        const isNewPeer = !localPeers.has(ev.operator.userId);
        localPeers.set(ev.operator.userId, { ...ev.operator, lastSeen: Date.now() });
        emitOperatorsList();
        if (isNewPeer && ev.operator.userId !== callbacks.userId) {
          broadcastMyPresence();
        }
      } else if (ev.type === 'presence:leave' && ev.userId) {
        localPeers.delete(ev.userId);
        emitOperatorsList();
      }
    };
    localEventListeners.add(onLocalEv);
    cleanupFns.push(() => localEventListeners.delete(onLocalEv));
  };

  const startFirebaseMode = () => {
    if (!db) {
      startLocalMode();
      return;
    }
    activeMode = 'firebase';
    const clientSessionKey = makeId('cl');
    const presenceNode = dbRef(db, `sharedPresence/${clientSessionKey}`);
    const connectedRef = dbRef(db, '.info/connected');
    let triedAnonSignIn = false;

    const writePresence = () => {
      if (disposed || !db) return;
      set(presenceNode, {
        userId: callbacks.userId,
        userName: currentUserName,
        channel: currentChannel,
        accountType: currentAccountType,
        isArmedForces: currentIsArmedForces,
        connectedAt: new Date().toISOString(),
        lastSeen: Date.now(),
      }).catch(async (err) => {
        if (isPermissionDeniedError(err)) {
          if (!triedAnonSignIn && auth && !auth.currentUser) {
            triedAnonSignIn = true;
            try {
              await signInAnonymously(auth);
              writePresence();
              return;
            } catch {
              // ignore if anonymous auth is not enabled
            }
          }
          degradeToLocalOnPermissionError(err);
        }
      });
    };
    firebasePushPresence = writePresence;
    cleanupFns.push(() => {
      firebasePushPresence = null;
    });

    const unsubConn = onValue(connectedRef, (snap) => {
      if (disposed) return;
      const connected = snap.val() === true;
      callbacks.onStatusChange({ mode: 'firebase', connected });
      if (connected) {
        onDisconnect(presenceNode).remove().catch(() => {});
        writePresence();
      }
    });
    cleanupFns.push(unsubConn);

    writePresence();
    const hb = window.setInterval(writePresence, 25000);
    cleanupFns.push(() => window.clearInterval(hb));
    cleanupFns.push(() => {
      remove(presenceNode).catch(() => {});
    });

    const unsubPresence = onValue(
      dbRef(db, 'sharedPresence'),
      (snap) => {
        if (disposed) return;
        const raw = snap.val() as Record<string, any> | null;
        if (!raw) {
          callbacks.onOperatorsChange([
            {
              userId: callbacks.userId,
              userName: currentUserName,
              channel: currentChannel,
              connectedAt: new Date().toISOString(),
              accountType: currentAccountType,
              isArmedForces: currentIsArmedForces,
            },
          ]);
          return;
        }
        const cutoff = Date.now() - 90_000;
        const byUser = new Map<string, OnlineOperator>();
        for (const [sessionKey, item] of Object.entries(raw)) {
          if (!item || typeof item !== 'object') continue;
          const lastSeen = Number(item.lastSeen) || 0;
          if (lastSeen && lastSeen < cutoff) continue;
          const uid = String(item.userId || item.clientId || sessionKey);
          const uname = String(item.userName || item.name || 'Operatore');
          if (!uid) continue;
          const isAltri =
            item.accountType === 'altri' ||
            item.isArmedForces === true ||
            item.role === 'FORZE_ARMATE' ||
            uname.toLowerCase().includes('forze armate');
          const dedupKey = isAltri ? `${uid}_${sessionKey}` : uid;
          if (!byUser.has(dedupKey)) {
            byUser.set(dedupKey, {
              userId: uid,
              userName: uname,
              channel: String(item.channel || 'generale'),
              connectedAt: String(item.connectedAt || new Date(lastSeen || Date.now()).toISOString()),
              accountType: isAltri ? 'altri' : 'account',
              isArmedForces: isAltri,
            });
          }
        }
        callbacks.onOperatorsChange(Array.from(byUser.values()));
      },
      () => {}
    );
    cleanupFns.push(unsubPresence);

    // Se è una sessione "Altri" (Forze Armate senza account Firebase), serve solo il tracking presenza:
    // evitiamo di sottoscrivere nodi protetti da auth!=null (sharedChat/sharedStorageMeta) che degraderebbero la sessione
    if (currentAccountType === 'altri' && !auth?.currentUser) {
      return;
    }

    let initializedMessages = false;
    let knownMsgIds = new Set<string>();
    const unsubMessages = onValue(
      query(dbRef(db, 'sharedChat/teamMessages'), limitToLast(200)),
      (snap) => {
        if (disposed) return;
        const raw = snap.val() as Record<string, ChatMessage> | null;
        const list: ChatMessage[] = raw
          ? Object.entries(raw)
              .filter(([, m]) => Boolean(m && typeof m === 'object'))
              .map(([id, m]) => ({ ...m, id }))
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          : [];

        if (!initializedMessages) {
          initializedMessages = true;
          knownMsgIds = new Set(list.map((m) => m.id));
          callbacks.onMessagesReplace(list);
        } else {
          const nextIds = new Set(list.map((m) => m.id));
          for (const m of list) {
            if (!knownMsgIds.has(m.id)) {
              callbacks.onMessageAdded(m);
            }
          }
          for (const oldId of knownMsgIds) {
            if (!nextIds.has(oldId)) {
              callbacks.onMessageDeleted(oldId);
            }
          }
          knownMsgIds = nextIds;
          callbacks.onMessagesReplace(list);
        }
      },
      (err) => {
        if (isPermissionDeniedError(err) && currentAccountType === 'account') {
          degradeToLocalOnPermissionError(err);
          startLocalMode();
        }
      }
    );
    cleanupFns.push(unsubMessages);

    const unsubFiles = onValue(
      dbRef(db, 'sharedStorageMeta/files'),
      (snap) => {
        if (disposed) return;
        const raw = snap.val() as Record<string, SharedFileMeta> | null;
        const count = raw ? Object.values(raw).filter((v) => v && v.fileName).length : 0;
        callbacks.onSharedUpdated(count);
      },
      () => {}
    );
    cleanupFns.push(unsubFiles);
  };

  const startServerMode = () => {
    activeMode = 'server';

    if (currentAccountType === 'account') {
      fetchSharedFolderListing()
        .then((res) => {
          if (!disposed) callbacks.onSharedUpdated(res.files.length);
        })
        .catch(() => {});

      fetchChatHistory()
        .then((res) => {
          if (disposed) return;
          callbacks.onMessagesReplace(res.messages || []);
          callbacks.onOperatorsChange(res.operators || []);
        })
        .catch(() => {});
    }

    const connectWs = () => {
      if (disposed) return;
      try {
        const ws = new WebSocket(getCollabWebSocketUrl());
        wsRef = ws;

        ws.onopen = () => {
          if (disposed) return;
          callbacks.onStatusChange({ mode: 'server', connected: true });
          ws.send(
            JSON.stringify({
              type: 'presence:join',
              userId: callbacks.userId,
              userName: currentUserName,
              channel: currentChannel,
              accountType: currentAccountType,
              isArmedForces: currentIsArmedForces,
            })
          );
        };

        ws.onmessage = (event) => {
          if (disposed) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'init') {
              if (Array.isArray(data.messages)) callbacks.onMessagesReplace(data.messages);
              if (Array.isArray(data.operators)) callbacks.onOperatorsChange(data.operators);
            } else if (data.type === 'presence:update') {
              if (Array.isArray(data.operators)) callbacks.onOperatorsChange(data.operators);
            } else if (data.type === 'chat:message' && data.message) {
              callbacks.onMessageAdded(data.message as ChatMessage);
            } else if (data.type === 'chat:deleted' && data.messageId) {
              callbacks.onMessageDeleted(String(data.messageId));
            } else if (data.type === 'shared:updated') {
              fetchSharedFolderListing()
                .then((res) => {
                  if (!disposed) callbacks.onSharedUpdated(res.files.length);
                })
                .catch(() => callbacks.onSharedUpdated());
            }
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          if (disposed) return;
          callbacks.onStatusChange({ mode: 'server', connected: false });
          reconnectTimer = window.setTimeout(connectWs, 2500);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        callbacks.onStatusChange({ mode: 'server', connected: false });
        reconnectTimer = window.setTimeout(connectWs, 3000);
      }
    };

    connectWs();
    cleanupFns.push(() => {
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (wsRef) {
        wsRef.close();
        wsRef = null;
      }
    });
  };

  detectCollabBackend().then((status) => {
    if (disposed) return;
    callbacks.onStatusChange(status);
    if (status.mode === 'server') {
      startServerMode();
    } else if (status.mode === 'firebase') {
      startFirebaseMode();
    } else {
      startLocalMode();
    }
  });

  return {
    updatePresence(
      userName: string,
      channel: string,
      accountType?: 'account' | 'altri',
      isArmedForces?: boolean
    ) {
      currentUserName = userName;
      currentChannel = channel;
      if (accountType) currentAccountType = accountType;
      if (typeof isArmedForces === 'boolean') currentIsArmedForces = isArmedForces;
      if (activeMode === 'server' && wsRef && wsRef.readyState === WebSocket.OPEN) {
        wsRef.send(
          JSON.stringify({
            type: 'presence:join',
            userId: callbacks.userId,
            userName,
            channel,
            accountType: currentAccountType,
            isArmedForces: currentIsArmedForces,
          })
        );
      } else if (activeMode === 'firebase' && firebasePushPresence) {
        firebasePushPresence();
      } else if (activeMode === 'local' && localPushPresence) {
        localPushPresence();
      }
    },
    async sendMessage(params) {
      const id = params.id || makeId('msg');
      if (activeMode === 'server' && wsRef && wsRef.readyState === WebSocket.OPEN) {
        const optimistic: ChatMessage = {
          id,
          channel: params.channel,
          senderId: callbacks.userId,
          senderName: params.senderName,
          text: params.text,
          timestamp: new Date().toISOString(),
          attachment: params.attachment,
        };
        wsRef.send(
          JSON.stringify({
            type: 'chat:send',
            id,
            channel: params.channel,
            senderName: params.senderName,
            text: params.text,
            attachment: params.attachment,
          })
        );
        return optimistic;
      }
      return postChatMessage({
        id,
        channel: params.channel,
        senderId: callbacks.userId,
        senderName: params.senderName,
        text: params.text,
        attachment: params.attachment,
      });
    },
    async deleteMessage(messageId: string) {
      if (activeMode === 'server' && wsRef && wsRef.readyState === WebSocket.OPEN) {
        wsRef.send(JSON.stringify({ type: 'chat:delete', messageId }));
        return;
      }
      await deleteChatMessageApi(messageId);
    },
    disconnect() {
      disposed = true;
      for (const fn of cleanupFns) {
        try {
          fn();
        } catch {
          // ignore
        }
      }
      cleanupFns = [];
    },
  };
}

export function getCollabWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function getOrCreateLocalOperatorId(): string {
  try {
    let id = localStorage.getItem('gecola_operator_id');
    if (!id) {
      id = `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      localStorage.setItem('gecola_operator_id', id);
    }
    return id;
  } catch {
    return `op_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
