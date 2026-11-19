import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  HardDriveUpload,
  Loader2,
  MessageCircle,
  Save,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ComputoThemeFolder,
  deleteSharedFile,
  downloadSharedFile,
  fetchSharedFileBlob,
  formatFileSize,
  sendSharedChatMessage,
  SHARED_COMPUTI_FOLDERS,
  SharedStorageFileItem,
  uploadSharedFile,
  UserRoleTag,
} from '../services/sharedWorkspaceService';

interface SharedStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFolderId?: string;
  filesByFolder: Record<string, SharedStorageFileItem[]>;
  clientId: string;
  currentName: string;
  currentRole: UserRoleTag;
  currentProjectTitle: string;
  onGetCurrentProjectJson: () => string;
  onLoadComputoJson: (jsonText: string, fileName: string) => void;
  onOpenChatWithNotice?: () => void;
}

function getFileFormatBadge(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) {
    return { label: 'GECOLA .JSON', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: 'json' as const };
  }
  if (lower.endsWith('.pdf')) {
    return { label: 'PDF', cls: 'bg-rose-100 text-rose-800 border-rose-300', icon: 'pdf' as const };
  }
  if (lower.endsWith('.dcf') || lower.endsWith('.xpwe') || lower.endsWith('.pwe')) {
    return { label: 'PRIMUS', cls: 'bg-amber-100 text-amber-800 border-amber-300', icon: 'sheet' as const };
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
    return { label: 'EXCEL', cls: 'bg-blue-100 text-blue-800 border-blue-300', icon: 'sheet' as const };
  }
  return { label: 'FILE', cls: 'bg-slate-100 text-slate-700 border-slate-300', icon: 'file' as const };
}

function formatDateTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const SharedStorageModal: React.FC<SharedStorageModalProps> = ({
  isOpen,
  onClose,
  initialFolderId,
  filesByFolder,
  clientId,
  currentName,
  currentRole,
  currentProjectTitle,
  onGetCurrentProjectJson,
  onLoadComputoJson,
  onOpenChatWithNotice,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    initialFolderId || SHARED_COMPUTI_FOLDERS[0].id
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen && initialFolderId) {
      setSelectedFolderId(initialFolderId);
    }
  }, [isOpen, initialFolderId]);

  const activeFolder: ComputoThemeFolder | null = useMemo(
    () => SHARED_COMPUTI_FOLDERS.find((f) => f.id === selectedFolderId) || null,
    [selectedFolderId]
  );

  const totalFilesCount = useMemo(() => {
    return Object.values(filesByFolder).reduce((sum, list) => sum + list.length, 0);
  }, [filesByFolder]);

  const visibleFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list =
      selectedFolderId === 'ALL'
        ? Object.values(filesByFolder).flat().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        : filesByFolder[selectedFolderId] || [];

    if (!q) return list;
    return list.filter(
      (item) =>
        item.fileName.toLowerCase().includes(q) ||
        item.authorName.toLowerCase().includes(q) ||
        (item.note || '').toLowerCase().includes(q)
    );
  }, [filesByFolder, selectedFolderId, searchQuery]);

  const handleUploadFromDisk = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const targetFolder = activeFolder?.id || SHARED_COMPUTI_FOLDERS[0].id;
    setStatusBanner(null);
    setUploadProgress(5);

    try {
      const saved = await uploadSharedFile({
        folderId: targetFolder,
        file,
        fileName: file.name,
        authorClientId: clientId,
        authorName: currentName,
        authorRole: currentRole,
        note: noteDraft,
        onProgress: (pct) => setUploadProgress(pct),
      });
      setNoteDraft('');
      setStatusBanner({
        type: 'ok',
        text: `File "${saved.fileName}" salvato in ${SHARED_COMPUTI_FOLDERS.find((f) => f.id === targetFolder)?.title || 'cartella'}.`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'err',
        text: err?.message || 'Errore durante il caricamento su Storage condiviso.',
      });
    } finally {
      setUploadProgress(null);
    }
  };

  const handleSaveCurrentProject = async () => {
    const targetFolder = activeFolder?.id || SHARED_COMPUTI_FOLDERS[0].id;
    setStatusBanner(null);
    setUploadProgress(10);

    try {
      const jsonString = onGetCurrentProjectJson();
      const safeTitle = (currentProjectTitle || 'Computo_GeCoLa')
        .replace(/[^\w.\-() ]+/g, '_')
        .slice(0, 80);
      const fileName = safeTitle.toLowerCase().endsWith('.json') ? safeTitle : `${safeTitle}.json`;
      const blob = new Blob([jsonString], { type: 'application/json' });

      const saved = await uploadSharedFile({
        folderId: targetFolder,
        file: blob,
        fileName,
        authorClientId: clientId,
        authorName: currentName,
        authorRole: currentRole,
        note: noteDraft || `Computo condiviso da ${currentName}`,
        onProgress: (pct) => setUploadProgress(pct),
      });
      setNoteDraft('');
      setStatusBanner({
        type: 'ok',
        text: `Computo corrente "${saved.fileName}" memorizzato nello Storage condiviso!`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'err',
        text: err?.message || 'Impossibile salvare il computo corrente su Firebase.',
      });
    } finally {
      setUploadProgress(null);
    }
  };

  const handleOpenInComputo = async (item: SharedStorageFileItem) => {
    setBusyActionId(item.id);
    setStatusBanner(null);
    try {
      const blob = await fetchSharedFileBlob(item);
      const text = await blob.text();
      onLoadComputoJson(text, item.fileName);
      onClose();
    } catch (err: any) {
      setStatusBanner({
        type: 'err',
        text: err?.message || 'Errore apertura computo dal cloud.',
      });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleDownload = async (item: SharedStorageFileItem) => {
    setBusyActionId(item.id);
    setStatusBanner(null);
    try {
      await downloadSharedFile(item);
    } catch (err: any) {
      setStatusBanner({
        type: 'err',
        text: err?.message || 'Errore durante il download.',
      });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleShareInChat = async (item: SharedStorageFileItem) => {
    setBusyActionId(item.id);
    setStatusBanner(null);
    try {
      const folder = SHARED_COMPUTI_FOLDERS.find((f) => f.id === item.folderId);
      await sendSharedChatMessage({
        clientId,
        senderName: currentName,
        senderRole: currentRole,
        text: `Ho condiviso un computo nella cartella ${folder?.number || ''} · ${folder?.title || 'Archivio'}:`,
        attachment: {
          fileId: item.id,
          folderId: item.folderId,
          folderTitle: folder?.title || 'Archivio Condiviso',
          fileName: item.fileName,
          size: item.size,
        },
      });
      setStatusBanner({
        type: 'ok',
        text: `"${item.fileName}" condiviso nella Chat Condivisa!`,
      });
      onOpenChatWithNotice?.();
    } catch (err: any) {
      setStatusBanner({
        type: 'err',
        text: err?.message || 'Impossibile condividere in chat.',
      });
    } finally {
      setBusyActionId(null);
    }
  };

  const handleDelete = async (item: SharedStorageFileItem) => {
    setBusyActionId(item.id);
    setConfirmDeleteId(null);
    setStatusBanner(null);
    try {
      await deleteSharedFile(item);
      setStatusBanner({ type: 'ok', text: `File "${item.fileName}" rimosso.` });
    } catch (err: any) {
      setStatusBanner({
        type: 'err',
        text: err?.message || 'Errore eliminazione file.',
      });
    } finally {
      setBusyActionId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9300] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl h-[min(86vh,780px)] bg-white rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".json,.dcf,.xpwe,.pwe,.pdf,.xlsx,.xls,.csv,.zip,.png,.jpg,.jpeg"
          onChange={handleUploadFromDisk}
        />

        {/* HEADER */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between gap-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500 text-slate-950 shadow shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold tracking-tight truncate">
                  Archivio Condiviso Computi · 10 Cartelle Tematiche
                </h2>
                <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold uppercase">
                  Firebase Free Sync
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                Salva, condividi e scarica computi per tipologia tra tutti gli utenti Registrati e Free
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Chiudi Archivio"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY SPLIT: 10 CARTELLE A SINISTRA + FILE A DESTRA */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* SIDEBAR 10 CARTELLE */}
          <aside className="w-full md:w-80 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col min-h-0 max-h-[220px] md:max-h-none shrink-0">
            <div className="p-3 border-b border-slate-200 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cerca computo, autore, nota..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <button
                type="button"
                onClick={() => setSelectedFolderId('ALL')}
                className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between gap-2 transition-colors ${
                  selectedFolderId === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'hover:bg-slate-200/70 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-bold truncate">Tutte le 10 Cartelle</span>
                </div>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    selectedFolderId === 'ALL' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {totalFilesCount}
                </span>
              </button>

              {SHARED_COMPUTI_FOLDERS.map((folder) => {
                const count = (filesByFolder[folder.id] || []).length;
                const active = selectedFolderId === folder.id;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setSelectedFolderId(folder.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-start justify-between gap-2 transition-colors border ${
                      active
                        ? 'bg-white border-blue-500 shadow-xs ring-1 ring-blue-500/20'
                        : 'border-transparent hover:bg-slate-200/60'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className="w-6 h-6 rounded-lg text-white text-[10px] font-mono font-black flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: folder.accentHex }}
                      >
                        {folder.number}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{folder.title}</div>
                        <div className="text-[10px] text-slate-500 truncate">{folder.subtitle}</div>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                        count > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-200/80 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* AREA CONTENUTO CARTELLA SELEZIONATA */}
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            {/* BARRA AZIONI CARTELLA */}
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 space-y-2.5 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {activeFolder ? (
                    <>
                      <span
                        className="w-8 h-8 rounded-xl text-white text-xs font-mono font-black flex items-center justify-center shrink-0"
                        style={{ backgroundColor: activeFolder.accentHex }}
                      >
                        {activeFolder.number}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-slate-900 truncate">
                          {activeFolder.title}
                        </h3>
                        <p className="text-[11px] text-slate-500 truncate">{activeFolder.subtitle}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Folder className="w-7 h-7 text-amber-500 shrink-0" />
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900">
                          Tutti i Computi Condivisi ({totalFilesCount})
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Vista unificata delle 10 tipologie tematiche
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadProgress !== null}
                    onClick={handleSaveCurrentProject}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                    title="Salva il computo attualmente aperto in GeCoLa dentro questa cartella"
                  >
                    <Save className="w-4 h-4" />
                    <span>Salva Computo Aperto Qui</span>
                  </button>

                  <button
                    type="button"
                    disabled={uploadProgress !== null}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Carica File dal PC</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={noteDraft}
                  maxLength={140}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Nota facoltativa prima di salvare/caricare (es. Ristrutturazione bagno 6mq Lombardia 2026)..."
                  className="flex-1 min-w-[220px] px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                />
                {uploadProgress !== null && (
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Caricamento {uploadProgress}%</span>
                  </div>
                )}
              </div>

              {statusBanner && (
                <div
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 border ${
                    statusBanner.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <span>{statusBanner.text}</span>
                  <button
                    type="button"
                    onClick={() => setStatusBanner(null)}
                    className="opacity-60 hover:opacity-100"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* ELENCO FILE */}
            <div className="flex-1 overflow-y-auto p-4">
              {visibleFiles.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4 text-slate-400">
                  <HardDriveUpload className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-700">
                    {searchQuery ? 'Nessun file trovato per questa ricerca' : 'Cartella ancora vuota'}
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
                    Usa <strong className="text-emerald-700">Salva Computo Aperto Qui</strong> per archiviare subito il computo su cui stai lavorando oppure{' '}
                    <strong className="text-blue-700">Carica File dal PC</strong> (.json, .dcf, .xpwe, .pdf, .xlsx).
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {visibleFiles.map((item) => {
                    const fmt = getFileFormatBadge(item.fileName);
                    const folderObj = SHARED_COMPUTI_FOLDERS.find((f) => f.id === item.folderId);
                    const isJson = item.fileName.toLowerCase().endsWith('.json');
                    const isBusy = busyActionId === item.id;
                    const isConfirmingDel = confirmDeleteId === item.id;

                    return (
                      <div
                        key={item.id}
                        className="border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 bg-white shadow-2xs flex flex-col justify-between gap-3 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 shrink-0">
                            {fmt.icon === 'json' ? (
                              <FileCode2 className="w-5 h-5 text-emerald-600" />
                            ) : fmt.icon === 'pdf' ? (
                              <FileText className="w-5 h-5 text-rose-600" />
                            ) : (
                              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${fmt.cls}`}>
                                {fmt.label}
                              </span>
                              {selectedFolderId === 'ALL' && folderObj && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${folderObj.badgeClass}`}>
                                  {folderObj.number} · {folderObj.title}
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-slate-400 ml-auto">
                                {formatFileSize(item.size)}
                              </span>
                            </div>

                            <h4 className="text-xs font-extrabold text-slate-900 break-all leading-snug">
                              {item.fileName}
                            </h4>

                            {item.note && (
                              <p className="text-[11px] text-slate-600 line-clamp-2">{item.note}</p>
                            )}

                            <div className="flex items-center flex-wrap gap-2 text-[10px] text-slate-500 pt-0.5">
                              <span>
                                Da <strong className="text-slate-700">{item.authorName}</strong> (
                                {item.authorRole === 'PRO' ? 'Registrato' : 'Free'})
                              </span>
                              <span>·</span>
                              <span>{formatDateTime(item.createdAt)}</span>
                              <span>·</span>
                              <span className="text-emerald-700 font-semibold">
                                {item.storageBackend === 'storage' ? 'Firebase Storage' : 'Cloud DB'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isJson && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleOpenInComputo(item)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 transition-colors"
                              >
                                {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                <span>Apri in GeCoLa</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDownload(item)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 transition-colors"
                            >
                              <Download className="w-3 h-3" />
                              <span>Scarica</span>
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleShareInChat(item)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#25D366]/15 hover:bg-[#25D366]/25 text-emerald-900 border border-emerald-300 text-[11px] font-bold flex items-center gap-1 transition-colors"
                              title="Invia collegamento rapido nella Chat Condivisa"
                            >
                              <Share2 className="w-3 h-3 text-emerald-700" />
                              <MessageCircle className="w-3 h-3 text-emerald-700" />
                              <span>Invia in Chat</span>
                            </button>
                          </div>

                          <div>
                            {isConfirmingDel ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDelete(item)}
                                  className="px-2 py-1 rounded bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-700"
                                >
                                  Elimina
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-[10px] font-bold"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmDeleteId(item.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Elimina file dall'archivio condiviso"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedStorageModal;
