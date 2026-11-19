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

export async function fetchSharedFolderListing(): Promise<SharedFolderListing> {
  const res = await fetch('/api/shared-folder');
  if (!res.ok) throw new Error('Impossibile leggere la cartella condivisa.');
  return res.json();
}

export async function createSharedSubfolder(name: string): Promise<{ folder: string; folders: string[] }> {
  const res = await fetch('/api/shared-folder/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Impossibile creare la cartella.');
  return res.json();
}

export async function saveProjectToSharedFolder(
  req: SaveToSharedFolderRequest
): Promise<{ file: SharedFileMeta; folders: string[] }> {
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

export async function loadProjectFromSharedFolder(
  id: string
): Promise<{ meta: SharedFileMeta; payload: any }> {
  const res = await fetch(`/api/shared-folder/files/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('File non trovato nella cartella condivisa.');
  return res.json();
}

export async function deleteSharedFolderFile(id: string): Promise<void> {
  const res = await fetch(`/api/shared-folder/files/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Impossibile eliminare il file dalla cartella condivisa.');
}

export async function fetchChatHistory(
  channel?: string
): Promise<{ messages: ChatMessage[]; operators: OnlineOperator[] }> {
  const qs = channel ? `?channel=${encodeURIComponent(channel)}` : '';
  const res = await fetch(`/api/chat/messages${qs}`);
  if (!res.ok) throw new Error('Impossibile caricare la cronologia chat.');
  return res.json();
}

export async function postChatMessage(payload: {
  id?: string;
  channel: string;
  senderId: string;
  senderName: string;
  text: string;
  attachment?: ChatAttachment;
}): Promise<ChatMessage> {
  const res = await fetch('/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Errore invio messaggio.');
  const data = await res.json();
  return data.message;
}

export async function deleteChatMessageApi(id: string): Promise<void> {
  const res = await fetch(`/api/chat/messages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Errore eliminazione messaggio.');
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
