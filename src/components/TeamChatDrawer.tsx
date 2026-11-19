import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Send,
  Users,
  MessageSquare,
  FolderOpen,
  Share2,
  Trash2,
  Loader2,
  Wifi,
  WifiOff,
  Check,
  Edit3,
} from 'lucide-react';
import { ChatMessage, OnlineOperator } from '../services/teamCollabService';

interface TeamChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  operators: OnlineOperator[];
  isConnected: boolean;
  activeChannel: string;
  onChannelChange: (channel: string) => void;
  projectChannelId: string;
  projectTitle: string;
  currentUserId: string;
  currentUserName: string;
  onChangeDisplayName: (name: string) => void;
  onSendMessage: (text: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onShareCurrentProjectInChat: () => Promise<void>;
  onOpenSharedFileById: (fileId: string) => Promise<void>;
}

const TeamChatDrawer: React.FC<TeamChatDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  operators,
  isConnected,
  activeChannel,
  onChannelChange,
  projectChannelId,
  projectTitle,
  currentUserId,
  currentUserName,
  onChangeDisplayName,
  onSendMessage,
  onDeleteMessage,
  onShareCurrentProjectInChat,
  onOpenSharedFileById,
}) => {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSharingProject, setIsSharingProject] = useState(false);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [showOperators, setShowOperators] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentUserName);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setNameDraft(currentUserName);
  }, [currentUserName]);

  const channels = useMemo(
    () => [
      { id: 'generale', label: 'Studio' },
      { id: projectChannelId, label: 'Progetto' },
      { id: 'cantiere', label: 'Cantiere' },
    ],
    [projectChannelId]
  );

  const visibleMessages = useMemo(
    () => messages.filter((m) => m.channel === activeChannel),
    [messages, activeChannel]
  );

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, visibleMessages.length, activeChannel]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    try {
      await onSendMessage(trimmed);
      setDraft('');
    } finally {
      setIsSending(false);
    }
  };

  const handleShareProject = async () => {
    if (isSharingProject) return;
    setIsSharingProject(true);
    try {
      await onShareCurrentProjectInChat();
    } finally {
      setIsSharingProject(false);
    }
  };

  const handleOpenAttachment = async (fileId: string) => {
    setOpeningFileId(fileId);
    try {
      await onOpenSharedFileById(fileId);
    } finally {
      setOpeningFileId(null);
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch {
      return '';
    }
  };

  const formatEuro = (val: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val || 0);

  return (
    <div className="fixed inset-y-0 right-0 z-[210] w-full sm:w-[400px] bg-white shadow-2xl border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 px-4 py-3.5 text-white border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 bg-blue-600 rounded-lg shrink-0">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold leading-tight truncate">Chat Studio & Cantiere</h3>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  {isConnected ? (
                    <Wifi className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <WifiOff className="w-3 h-3 text-amber-400" />
                  )}
                  <span>{isConnected ? 'Connesso' : 'Riconnessione...'}</span>
                </span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setShowOperators((v) => !v)}
                  className="inline-flex items-center gap-1 text-slate-300 hover:text-white cursor-pointer"
                >
                  <Users className="w-3 h-3" />
                  <span className="font-mono tabular-nums">{Math.max(1, operators.length)} online</span>
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Chiudi Chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active operator display name editor */}
        <div className="mt-2.5 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
          {isEditingName ? (
            <div className="flex items-center gap-1.5 flex-1">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onChangeDisplayName(nameDraft.trim() || 'Operatore');
                    setIsEditingName(false);
                  } else if (e.key === 'Escape') {
                    setNameDraft(currentUserName);
                    setIsEditingName(false);
                  }
                }}
                autoFocus
                className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-400"
              />
              <button
                type="button"
                onClick={() => {
                  onChangeDisplayName(nameDraft.trim() || 'Operatore');
                  setIsEditingName(false);
                }}
                className="p-1 bg-emerald-600 hover:bg-emerald-500 rounded text-white cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full text-[11px] text-slate-300">
              <span className="truncate">
                Scrivi come: <strong className="text-white">{currentUserName}</strong>
              </span>
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-white cursor-pointer shrink-0"
              >
                <Edit3 className="w-3 h-3" />
                <span>Cambia nome</span>
              </button>
            </div>
          )}
        </div>

        {/* Online operators list */}
        {showOperators && (
          <div className="mt-2 p-2 bg-slate-800/80 rounded-lg border border-slate-700 text-xs space-y-1">
            <div className="text-[11px] font-semibold text-slate-400">Operatori collegati</div>
            {operators.length === 0 ? (
              <div className="text-slate-300 text-xs">{currentUserName} (tu)</div>
            ) : (
              operators.map((op) => (
                <div key={op.userId} className="flex items-center justify-between text-slate-200">
                  <span className="truncate">
                    {op.userName} {op.userId === currentUserId ? '(tu)' : ''}
                  </span>
                  <span className="text-[10px] text-emerald-400">Attivo</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Channel selector */}
      <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-1 shrink-0">
        {channels.map((ch) => {
          const active = activeChannel === ch.id;
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => onChannelChange(ch.id)}
              className={`flex-1 py-1.5 px-2.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title={ch.id === projectChannelId ? `Canale progetto: ${projectTitle}` : ch.label}
            >
              {ch.label}
            </button>
          );
        })}
      </div>

      {/* Message stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {visibleMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 text-slate-400">
            <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-600">Nessun messaggio in questo canale</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Invia una nota ai colleghi o usa <strong className="text-slate-700">Condividi Computo</strong> per inviare il file direttamente nella cartella condivisa.
            </p>
          </div>
        ) : (
          visibleMessages.map((msg) => {
            const isMine = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">{msg.senderName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{formatTime(msg.timestamp)}</span>
                  {isMine && (
                    <button
                      type="button"
                      onClick={() => void onDeleteMessage(msg.id)}
                      className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                      title="Elimina messaggio"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div
                  className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed border ${
                    isMine
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-800 border-slate-200'
                  }`}
                >
                  {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}

                  {msg.attachment && (
                    <div
                      className={`mt-2 p-2.5 rounded-lg border ${
                        isMine
                          ? 'bg-blue-700/70 border-blue-400/50 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="text-xs font-semibold truncate">{msg.attachment.title}</div>
                      <div
                        className={`mt-0.5 text-[11px] flex flex-wrap items-center gap-x-1.5 ${
                          isMine ? 'text-blue-100' : 'text-slate-500'
                        }`}
                      >
                        <span>{msg.attachment.folder}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{msg.attachment.articleCount} voci</span>
                        {msg.attachment.docType === 'CME' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {formatEuro(msg.attachment.totalAmount)}
                            </span>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={openingFileId === msg.attachment.sharedFileId}
                        onClick={() => void handleOpenAttachment(msg.attachment!.sharedFileId)}
                        className={`mt-2 w-full py-1.5 px-2.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                          isMine
                            ? 'bg-white text-blue-700 hover:bg-blue-50'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {openingFileId === msg.attachment.sharedFileId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FolderOpen className="w-3.5 h-3.5" />
                        )}
                        <span>Apri dalla Cartella Condivisa</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="p-3 bg-white border-t border-slate-200 space-y-2 shrink-0">
        <button
          type="button"
          disabled={isSharingProject}
          onClick={() => void handleShareProject()}
          className="w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          title="Salva una copia nella Cartella Condivisa e invia il collegamento in questa chat"
        >
          {isSharingProject ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Share2 className="w-3.5 h-3.5 text-emerald-700" />
          )}
          <span>Salva e Condividi Computo in Chat</span>
        </button>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Scrivi un messaggio al team..."
            className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isSending}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg transition-colors shrink-0 cursor-pointer"
            title="Invia messaggio"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default TeamChatDrawer;
