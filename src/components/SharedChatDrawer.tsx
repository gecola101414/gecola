import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Edit3,
  FileSpreadsheet,
  FolderOpen,
  MessageCircle,
  Paperclip,
  Send,
  Smile,
  Users,
  X,
} from 'lucide-react';
import {
  formatChatTime,
  formatFileSize,
  OnlinePresenceUser,
  sendSharedChatMessage,
  setSharedChatTyping,
  SharedChatMessage,
  SharedFileAttachmentRef,
  SharedTypingUser,
  UserRoleTag,
} from '../services/sharedWorkspaceService';

interface SharedChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  currentName: string;
  currentRole: UserRoleTag;
  onChangeName: (newName: string) => void;
  onlineUsers: OnlinePresenceUser[];
  messages: SharedChatMessage[];
  typingUsers: SharedTypingUser[];
  onOpenStorageFolder: (folderId?: string) => void;
  onOpenAttachment?: (attachment: SharedFileAttachmentRef) => void;
}

const QUICK_EMOJIS = ['👍', '👋', '📐', '🏗️', '✅', '📄', '🔥', '💡', '🧱', '⚡'];

const SENDER_COLORS = [
  'text-emerald-700',
  'text-blue-700',
  'text-orange-700',
  'text-purple-700',
  'text-teal-700',
  'text-rose-700',
  'text-indigo-700',
];

function pickSenderColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function renderRoleBadge(role: UserRoleTag) {
  if (role === 'PRO') {
    return (
      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
        PRO
      </span>
    );
  }
  if (role === 'FORZE_ARMATE') {
    return (
      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
        FA FREE
      </span>
    );
  }
  return (
    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 border border-sky-300">
      FREE
    </span>
  );
}

const SharedChatDrawer: React.FC<SharedChatDrawerProps> = ({
  isOpen,
  onClose,
  clientId,
  currentName,
  currentRole,
  onChangeName,
  onlineUsers,
  messages,
  typingUsers,
  onOpenStorageFolder,
  onOpenAttachment,
}) => {
  const [draft, setDraft] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [showOnlineList, setShowOnlineList] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentName);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const feedEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setNameDraft(currentName);
  }, [currentName]);

  useEffect(() => {
    if (isOpen) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      setSharedChatTyping(clientId, currentName, false);
    };
  }, [clientId, currentName]);

  const otherTyping = useMemo(
    () => typingUsers.filter((t) => t.clientId !== clientId),
    [typingUsers, clientId]
  );

  const handleDraftChange = (val: string) => {
    setDraft(val);
    setSendError(null);
    if (val.trim().length > 0) {
      setSharedChatTyping(clientId, currentName, true);
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => {
        setSharedChatTyping(clientId, currentName, false);
      }, 2800);
    } else {
      setSharedChatTyping(clientId, currentName, false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;
    setIsSending(true);
    setSendError(null);
    setSharedChatTyping(clientId, currentName, false);
    try {
      await sendSharedChatMessage({
        clientId,
        senderName: currentName,
        senderRole: currentRole,
        text,
      });
      setDraft('');
      setShowEmojis(false);
    } catch (err: any) {
      setSendError(err?.message || 'Errore invio messaggio.');
    } finally {
      setIsSending(false);
    }
  };

  const commitName = () => {
    const cleaned = nameDraft.trim();
    if (cleaned) {
      onChangeName(cleaned);
    } else {
      setNameDraft(currentName);
    }
    setIsEditingName(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9200] w-[calc(100vw-2rem)] sm:w-[410px] h-[min(640px,calc(100vh-5.5rem))] bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.42)] border border-slate-300 flex flex-col overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* HEADER STILE WHATSAPP */}
      <div className="bg-[#075E54] text-white px-4 py-3 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#25D366] text-slate-950 font-black flex items-center justify-center shrink-0 shadow">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm truncate">Chat Condivisa GeCoLa</h3>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-100">
              <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse shrink-0" />
              <span>
                {onlineUsers.length} {onlineUsers.length === 1 ? 'collegato ora' : 'collegati ora'}
              </span>
              <span className="opacity-60">·</span>
              <button
                type="button"
                onClick={() => setShowOnlineList((v) => !v)}
                className="underline decoration-dotted hover:text-white inline-flex items-center gap-1"
              >
                <Users className="w-3 h-3" />
                <span>{showOnlineList ? 'Nascondi' : 'Vedi utenti'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onOpenStorageFolder()}
            className="px-2 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold flex items-center gap-1 transition-colors"
            title="Apri Archivio Condiviso (10 Cartelle Computi)"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-300" />
            <span className="hidden xs:inline">Archivio</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 text-emerald-100 hover:text-white transition-colors"
            title="Chiudi chat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* BARRA TUO PROFILO & UTENTI ONLINE IN TEMPO REALE */}
      <div className="bg-[#128C7E]/10 border-b border-emerald-200 px-3 py-2 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-slate-600 font-semibold shrink-0">Tu sei:</span>
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={nameDraft}
                  maxLength={32}
                  autoFocus
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitName();
                    if (e.key === 'Escape') {
                      setNameDraft(currentName);
                      setIsEditingName(false);
                    }
                  }}
                  className="px-2 py-0.5 text-xs font-bold text-slate-900 bg-white border border-emerald-500 rounded focus:outline-none w-36"
                />
                <button
                  type="button"
                  onClick={commitName}
                  className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                  title="Salva nome"
                >
                  <Check className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                className="inline-flex items-center gap-1 font-bold text-slate-900 hover:text-emerald-700 truncate"
                title="Clicca per cambiare il tuo nome in chat"
              >
                <span className="truncate">{currentName}</span>
                {renderRoleBadge(currentRole)}
                <Edit3 className="w-3 h-3 text-slate-400 shrink-0" />
              </button>
            )}
          </div>
          <span className="text-[10px] font-semibold text-emerald-800 shrink-0">
            Piano Free Sync
          </span>
        </div>

        {showOnlineList && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {onlineUsers.length === 0 ? (
              <span className="text-[11px] text-slate-500 italic">Connessione presenza in corso...</span>
            ) : (
              onlineUsers.map((u) => {
                const isMe = u.clientId === clientId;
                return (
                  <div
                    key={u.clientId}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] shrink-0 ${
                      isMe
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                        : 'bg-white border-slate-200 text-slate-800 font-medium'
                    }`}
                    title={u.projectTitle ? `Progetto: ${u.projectTitle}` : u.name}
                  >
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                      {getInitials(u.name)}
                    </span>
                    <span className="max-w-[110px] truncate">{isMe ? `${u.name} (Tu)` : u.name}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* MESSAGGI STILE WHATSAPP */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
        style={{
          backgroundColor: '#efeae2',
          backgroundImage:
            'radial-gradient(rgba(15, 23, 42, 0.05) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 text-slate-500">
            <div className="bg-white/90 border border-slate-200 rounded-2xl p-4 shadow-sm max-w-xs space-y-2">
              <MessageCircle className="w-8 h-8 text-[#128C7E] mx-auto" />
              <p className="text-xs font-bold text-slate-800">Benvenuto nella Chat Condivisa</p>
              <p className="text-[11px] leading-relaxed text-slate-600">
                Scrivi ai colleghi connessi (utenti Registrati o Free) oppure condividi computi salvati nelle 10 cartelle dell&apos;Archivio.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.clientId === clientId;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 shadow-xs border ${
                    isMine
                      ? 'bg-[#d9fdd3] border-emerald-200 rounded-tr-xs text-slate-900'
                      : 'bg-white border-slate-200 rounded-tl-xs text-slate-900'
                  }`}
                >
                  {!isMine && (
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[11px] font-extrabold ${pickSenderColor(msg.senderName)}`}>
                        {msg.senderName}
                      </span>
                      {renderRoleBadge(msg.senderRole)}
                    </div>
                  )}

                  {msg.attachment && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenAttachment) onOpenAttachment(msg.attachment!);
                        else onOpenStorageFolder(msg.attachment!.folderId);
                      }}
                      className="w-full text-left mb-1.5 p-2 rounded-lg bg-slate-900/5 hover:bg-slate-900/10 border border-slate-300/80 flex items-center gap-2 transition-colors"
                    >
                      <div className="p-1.5 rounded-md bg-emerald-600 text-white shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {msg.attachment.fileName}
                        </div>
                        <div className="text-[10px] text-slate-600 truncate">
                          {msg.attachment.folderTitle} · {formatFileSize(msg.attachment.size)} · Apri
                        </div>
                      </div>
                    </button>
                  )}

                  {msg.text && (
                    <p className="text-[13px] leading-snug whitespace-pre-wrap break-words">
                      {msg.text}
                    </p>
                  )}

                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                    <span>{formatChatTime(msg.createdAt)}</span>
                    {isMine && <CheckCheck className="w-3.5 h-3.5 text-sky-600" />}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {otherTyping.length > 0 && (
          <div className="inline-flex items-center gap-1.5 bg-white/95 border border-slate-200 rounded-full px-3 py-1 text-[11px] text-emerald-700 font-semibold shadow-2xs">
            <span className="animate-pulse">●</span>
            <span>
              {otherTyping.map((t) => t.name).slice(0, 2).join(', ')}{' '}
              {otherTyping.length > 1 ? 'stanno scrivendo...' : 'sta scrivendo...'}
            </span>
          </div>
        )}

        <div ref={feedEndRef} />
      </div>

      {/* EMOJI QUICK BAR */}
      {showEmojis && (
        <div className="bg-slate-100 border-t border-slate-200 px-3 py-1.5 flex items-center justify-between gap-1 overflow-x-auto shrink-0">
          {QUICK_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => handleDraftChange(draft + em)}
              className="text-lg hover:scale-125 transition-transform px-1"
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {sendError && (
        <div className="px-3 py-1 bg-rose-50 border-t border-rose-200 text-[11px] text-rose-700 font-semibold">
          {sendError}
        </div>
      )}

      {/* BARRA INVIO MESSAGGIO STILE WHATSAPP */}
      <form
        onSubmit={handleSend}
        className="bg-[#f0f2f5] border-t border-slate-200 px-2.5 py-2 flex items-center gap-1.5 shrink-0"
      >
        <button
          type="button"
          onClick={() => setShowEmojis((v) => !v)}
          className={`p-2 rounded-full transition-colors ${
            showEmojis ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-200'
          }`}
          title="Emoji rapide"
        >
          <Smile className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => onOpenStorageFolder()}
          className="p-2 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
          title="Allega o salva un file nelle 10 cartelle condivise"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <input
          type="text"
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          placeholder="Scrivi un messaggio..."
          className="flex-1 bg-white rounded-full px-3.5 py-2 text-xs text-slate-900 border border-slate-200 focus:outline-none focus:border-emerald-500"
        />

        <button
          type="submit"
          disabled={!draft.trim() || isSending}
          className="w-9 h-9 rounded-full bg-[#00a884] hover:bg-[#008f6f] disabled:bg-slate-300 text-white flex items-center justify-center shrink-0 transition-colors shadow-xs"
          title="Invia messaggio"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default SharedChatDrawer;
