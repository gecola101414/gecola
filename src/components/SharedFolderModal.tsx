import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Folder,
  FolderPlus,
  FolderOpen,
  Search,
  UploadCloud,
  Download,
  Trash2,
  FileJson,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  Info,
} from 'lucide-react';
import {
  CollabStatusInfo,
  SharedFileMeta,
  fetchSharedFolderListing,
  createSharedSubfolder,
  loadProjectFromSharedFolder,
  deleteSharedFolderFile,
  formatBytes,
} from '../services/teamCollabService';

interface SharedFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProjectPayload: (payload: any, meta: SharedFileMeta) => void;
  onQuickSaveCurrent: (folder: string, docType: 'CME' | 'CM', note: string, notifyInChat: boolean) => Promise<void>;
  currentProjectTitle: string;
  currentArticleCount: number;
  refreshSignal: number;
  collabStatus?: CollabStatusInfo;
}

const SharedFolderModal: React.FC<SharedFolderModalProps> = ({
  isOpen,
  onClose,
  onOpenProjectPayload,
  onQuickSaveCurrent,
  currentProjectTitle,
  currentArticleCount,
  refreshSignal,
  collabStatus,
}) => {
  const [folders, setFolders] = useState<string[]>(['Generale', 'Gare e Appalti', 'Cantieri Attivi', 'Subappalti']);
  const [files, setFiles] = useState<SharedFileMeta[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const [showQuickSave, setShowQuickSave] = useState(false);
  const [quickSaveFolder, setQuickSaveFolder] = useState('Generale');
  const [quickSaveType, setQuickSaveType] = useState<'CME' | 'CM'>('CME');
  const [quickSaveNote, setQuickSaveNote] = useState('');
  const [quickSaveNotify, setQuickSaveNotify] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadListing = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSharedFolderListing();
      setFolders(data.folders);
      setFiles(data.files);
      if (selectedFolder !== 'ALL' && !data.folders.includes(selectedFolder)) {
        setSelectedFolder('ALL');
      }
      if (data.folders.length > 0 && !data.folders.includes(quickSaveFolder)) {
        setQuickSaveFolder(data.folders[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Errore di connessione alla cartella condivisa.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadListing();
    }
  }, [isOpen, refreshSignal]);

  useEffect(() => {
    if (selectedFolder !== 'ALL') {
      setQuickSaveFolder(selectedFolder);
    }
  }, [selectedFolder]);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return files.filter((f) => {
      if (selectedFolder !== 'ALL' && f.folder !== selectedFolder) return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.fileName.toLowerCase().includes(q) ||
        f.author.toLowerCase().includes(q) ||
        f.folder.toLowerCase().includes(q) ||
        (f.note || '').toLowerCase().includes(q)
      );
    });
  }, [files, selectedFolder, searchQuery]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of files) {
      counts[f.folder] = (counts[f.folder] || 0) + 1;
    }
    return counts;
  }, [files]);

  if (!isOpen) return null;

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    setIsCreatingFolder(true);
    setError(null);
    try {
      const res = await createSharedSubfolder(trimmed);
      setFolders(res.folders);
      setSelectedFolder(res.folder);
      setQuickSaveFolder(res.folder);
      setNewFolderName('');
      setFeedback(`Cartella "${res.folder}" creata.`);
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Errore creazione cartella.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleQuickSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onQuickSaveCurrent(quickSaveFolder, quickSaveType, quickSaveNote.trim(), quickSaveNotify);
      setQuickSaveNote('');
      setShowQuickSave(false);
      setFeedback(`Salvato in Cartella Condivisa / ${quickSaveFolder}.`);
      setTimeout(() => setFeedback(null), 3500);
      await loadListing();
    } catch (err: any) {
      setError(err?.message || 'Errore durante il salvataggio.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenFile = async (meta: SharedFileMeta) => {
    setOpeningId(meta.id);
    setError(null);
    try {
      const { payload } = await loadProjectFromSharedFolder(meta.id);
      onOpenProjectPayload(payload, meta);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Impossibile aprire il file selezionato.');
    } finally {
      setOpeningId(null);
    }
  };

  const handleDownloadFile = async (meta: SharedFileMeta) => {
    try {
      const { payload } = await loadProjectFromSharedFolder(meta.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || 'Impossibile scaricare il file.');
    }
  };

  const handleDeleteFile = async (meta: SharedFileMeta) => {
    setDeletingId(meta.id);
    setError(null);
    try {
      await deleteSharedFolderFile(meta.id);
      setFiles((prev) => prev.filter((f) => f.id !== meta.id));
      setFeedback(`"${meta.fileName}" rimosso dalla cartella condivisa.`);
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Errore eliminazione file.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDateTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const formatEuro = (val: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val || 0);

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[82vh] max-h-[760px] flex flex-col overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-emerald-600 rounded-xl text-white shrink-0">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-white font-bold text-base tracking-tight truncate">
                Cartella Condivisa GeCoLa
              </h3>
              <p className="text-slate-400 text-xs truncate">
                {collabStatus?.mode === 'firebase'
                  ? 'Cloud Firebase'
                  : collabStatus?.mode === 'server'
                    ? 'Server Condiviso'
                    : 'Archivio Locale Browser'}{' '}
                · {files.length} {files.length === 1 ? 'progetto salvato' : 'progetti salvati'} · sincronizzato in tempo reale
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadListing()}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Aggiorna elenco"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowQuickSave((v) => !v)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Salva Progetto Corrente Qui</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Chiudi Cartella Condivisa"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Inline Quick-Save Drawer */}
        {showQuickSave && (
          <form
            onSubmit={handleQuickSave}
            className="bg-emerald-50/90 border-b border-emerald-200 px-6 py-3.5 flex flex-wrap items-end gap-3 shrink-0"
          >
            <div className="min-w-[170px] flex-1">
              <label className="block text-[11px] font-semibold text-emerald-950 mb-1">
                Progetto attivo ({currentArticleCount} voci)
              </label>
              <div className="text-xs font-bold text-slate-900 bg-white border border-emerald-200 rounded-lg px-3 py-2 truncate">
                {currentProjectTitle || 'Progetto GeCoLa'}
              </div>
            </div>

            <div className="w-44">
              <label className="block text-[11px] font-semibold text-emerald-950 mb-1">Cartella destinazione</label>
              <select
                value={quickSaveFolder}
                onChange={(e) => setQuickSaveFolder(e.target.value)}
                className="w-full text-xs font-semibold bg-white border border-emerald-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:border-emerald-600"
              >
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-36">
              <label className="block text-[11px] font-semibold text-emerald-950 mb-1">Formato</label>
              <select
                value={quickSaveType}
                onChange={(e) => setQuickSaveType(e.target.value as 'CME' | 'CM')}
                className="w-full text-xs font-semibold bg-white border border-emerald-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:border-emerald-600"
              >
                <option value="CME">CME Completo</option>
                <option value="CM">Solo CM (No Prezzi)</option>
              </select>
            </div>

            <div className="min-w-[180px] flex-1">
              <label className="block text-[11px] font-semibold text-emerald-950 mb-1">Nota revisione (opzionale)</label>
              <input
                type="text"
                value={quickSaveNote}
                onChange={(e) => setQuickSaveNote(e.target.value)}
                placeholder="Es. Rev. 2 aggiornate misure bagno"
                className="w-full text-xs bg-white border border-emerald-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <label className="flex items-center gap-1.5 text-xs font-medium text-emerald-950 py-2 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={quickSaveNotify}
                onChange={(e) => setQuickSaveNotify(e.target.checked)}
                className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
              />
              <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
              <span>Avvisa in Chat</span>
            </label>

            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
              <span>Conferma Salvataggio</span>
            </button>
          </form>
        )}

        {/* Backend notice (Visitor / Firebase rules) */}
        {collabStatus?.notice && (
          <div className="px-6 py-2 text-xs bg-amber-50 text-amber-900 border-b border-amber-200 flex items-center gap-2 shrink-0">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{collabStatus.notice}</span>
          </div>
        )}

        {/* Notifications */}
        {(error || feedback) && (
          <div
            className={`px-6 py-2 text-xs font-medium flex items-center gap-2 border-b shrink-0 ${
              error
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            {error ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{error || feedback}</span>
          </div>
        )}

        {/* Main 2-column body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Sidebar: Folders */}
          <aside className="w-60 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500 mb-2 px-1">Cartelle condivise</div>
              <form onSubmit={handleCreateFolder} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Nuova cartella..."
                  className="flex-1 min-w-0 text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={isCreatingFolder || !newFolderName.trim()}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg transition-colors shrink-0 cursor-pointer"
                  title="Crea nuova sottocartella"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              </form>
            </div>

            <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
              <button
                type="button"
                onClick={() => setSelectedFolder('ALL')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  selectedFolder === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <FolderOpen className="w-4 h-4 shrink-0" />
                  <span className="truncate">Tutte le cartelle</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] opacity-80">{files.length}</span>
              </button>

              {folders.map((folder) => {
                const count = folderCounts[folder] || 0;
                const active = selectedFolder === folder;
                return (
                  <button
                    key={folder}
                    type="button"
                    onClick={() => setSelectedFolder(folder)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      active ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-200/70'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Folder className={`w-4 h-4 shrink-0 ${active ? 'text-blue-100' : 'text-amber-500'}`} />
                      <span className="truncate">{folder}</span>
                    </span>
                    <span className="font-mono tabular-nums text-[11px] opacity-80">{count}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Right Content: Search + File Table */}
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cerca per nome computo, autore o nota..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800"
                />
              </div>
              <div className="text-xs text-slate-500 whitespace-nowrap shrink-0">
                {selectedFolder === 'ALL' ? 'Tutte le cartelle' : `Cartella: ${selectedFolder}`} ·{' '}
                <span className="font-mono tabular-nums font-semibold text-slate-700">
                  {filteredFiles.length}
                </span>{' '}
                file
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && files.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="text-xs font-medium">Caricamento cartella condivisa...</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
                  <FolderOpen className="w-10 h-10 text-slate-300 mb-3" />
                  <h4 className="text-sm font-semibold text-slate-800 mb-1">
                    Nessun computo in questa cartella
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mb-4">
                    Salva qui il progetto corrente per renderlo immediatamente disponibile a tutti i colleghi collegati e aprirlo in un clic.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowQuickSave(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Salva Progetto Corrente Qui</span>
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredFiles.map((file) => (
                    <div
                      key={file.id}
                      className="px-5 py-3.5 hover:bg-slate-50/90 transition-colors flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <FileJson
                            className={`w-4 h-4 shrink-0 ${
                              file.docType === 'CM' ? 'text-emerald-600' : 'text-blue-600'
                            }`}
                          />
                          <span className="text-sm font-semibold text-slate-900 truncate">{file.title}</span>
                          <span className="text-[11px] font-mono font-semibold text-slate-500 shrink-0">
                            {file.docType}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                          <span className="font-medium text-slate-700">{file.folder}</span>
                          <span aria-hidden="true">·</span>
                          <span>{file.author}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{formatDateTime(file.updatedAt)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{file.articleCount} voci</span>
                          {file.planSheetCount > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">{file.planSheetCount} tavole</span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{formatBytes(file.sizeBytes)}</span>
                        </div>

                        {file.note && (
                          <p className="mt-1 text-xs text-slate-600 line-clamp-1">{file.note}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {file.docType === 'CME' && (
                          <div className="text-right hidden sm:block">
                            <div className="text-xs font-mono font-bold tabular-nums text-slate-900">
                              {formatEuro(file.totalAmount)}
                            </div>
                            <div className="text-[11px] text-slate-400">Importo CME</div>
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={openingId === file.id}
                          onClick={() => void handleOpenFile(file)}
                          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {openingId === file.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FolderOpen className="w-3.5 h-3.5" />
                          )}
                          <span>Apri</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDownloadFile(file)}
                          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
                          title="Scarica copia .json sul PC"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          disabled={deletingId === file.id}
                          onClick={() => void handleDeleteFile(file)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Elimina dalla cartella condivisa"
                        >
                          {deletingId === file.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedFolderModal;
