
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, User, Attachment, UserRole } from '../types';

interface MessengerProps {
  messages: ChatMessage[];
  currentUser: User;
  allUsers: User[];
  onSendMessage: (msg: Partial<ChatMessage>) => void;
  onReadChat: (chatId: string) => void;
}

const Messenger: React.FC<MessengerProps> = ({ messages, currentUser, allUsers, onSendMessage, onReadChat }) => {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);
  const [selectedChat, setSelectedChat] = useState<'general' | string>('general');
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // Ogni volta che seleziono una chat o arrivano messaggi in quella attiva, la segno come letta
    onReadChat(selectedChat);
  }, [messages, selectedChat]);

  // Filtro messaggi per chat selezionata
  const filteredMessages = useMemo(() => {
    if (selectedChat === 'general') {
      return messages.filter(m => !m.recipientId);
    } else {
      return messages.filter(m => 
        (m.userId === currentUser.id && m.recipientId === selectedChat) ||
        (m.userId === selectedChat && m.recipientId === currentUser.id)
      );
    }
  }, [messages, selectedChat, currentUser.id]);

  const activeRecipient = useMemo(() => {
    if (selectedChat === 'general') return null;
    return allUsers.find(u => u.id === selectedChat);
  }, [allUsers, selectedChat]);

  // Calcolo non letti per la sidebar contatti
  const unreadPerChat = useMemo(() => {
    const counts: Record<string, number> = {};
    const lastReads = currentUser.lastReadTimestamps || {};

    // Canale Generale
    const lastReadGen = lastReads['general'] || '1970-01-01T00:00:00.000Z';
    counts['general'] = messages.filter(m => !m.recipientId && m.userId !== currentUser.id && m.timestamp > lastReadGen).length;

    // Contatti
    allUsers.forEach(u => {
      if (u.id === currentUser.id) return;
      const lastReadU = lastReads[u.id] || '1970-01-01T00:00:00.000Z';
      counts[u.id] = messages.filter(m => m.recipientId === currentUser.id && m.userId === u.id && m.timestamp > lastReadU).length;
    });

    return counts;
  }, [messages, currentUser, allUsers]);

  // Check initial permission status
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as any }).then(permissionStatus => {
        if (permissionStatus.state === 'granted') setMicPermission('granted');
        if (permissionStatus.state === 'denied') setMicPermission('denied');
        permissionStatus.onchange = () => {
          if (permissionStatus.state === 'granted') { setMicPermission('granted'); setShowPermissionGuide(false); }
          if (permissionStatus.state === 'denied') setMicPermission('denied');
        };
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (currentAudioRef.current) currentAudioRef.current.pause();
    };
  }, []);

  const getSupportedMimeType = () => {
    const types = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
    for (const type of types) { if (MediaRecorder.isTypeSupported(type)) return type; }
    return 'audio/wav';
  };

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage({
      text: inputText,
      timestamp: new Date().toISOString(),
      attachments: [],
      recipientId: selectedChat === 'general' ? undefined : selectedChat
    });
    setInputText('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const attachment: Attachment = {
          id: `msg-att-${Date.now()}-${Math.random()}`,
          name: file.name,
          data: event.target?.result as string,
          type: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString()
        };
        onSendMessage({
          text: file.type.startsWith('image/') ? '📷 Foto inviata' : `📄 Documento inviato: ${file.name}`,
          attachments: [attachment],
          timestamp: new Date().toISOString(),
          recipientId: selectedChat === 'general' ? undefined : selectedChat
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const downloadAttachment = (att: Attachment) => {
    const link = document.createElement('a');
    link.href = att.data;
    link.download = att.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const startRecording = async () => {
    if (micPermission !== 'granted') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        setMicPermission('granted');
      } catch (err) { setMicPermission('denied'); setShowPermissionGuide(true); return; }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onload = () => {
          onSendMessage({
            text: '🎤 Messaggio Vocale',
            isVoice: true,
            timestamp: new Date().toISOString(),
            recipientId: selectedChat === 'general' ? undefined : selectedChat,
            attachments: [{
              id: `voice-${Date.now()}`,
              name: `audio-note.${mimeType.split('/')[1]}`,
              data: reader.result as string,
              type: mimeType,
              size: audioBlob.size,
              uploadedAt: new Date().toISOString()
            }]
          });
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = window.setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    } catch (err) { setMicPermission('denied'); setShowPermissionGuide(true); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    }
  };

  const playVoiceMessage = (msgId: string, audioData: string) => {
    if (playingId === msgId) { currentAudioRef.current?.pause(); setPlayingId(null); return; }
    if (currentAudioRef.current) currentAudioRef.current.pause();
    const audio = new Audio(audioData);
    currentAudioRef.current = audio;
    setPlayingId(msgId);
    audio.play().catch(e => setPlayingId(null));
    audio.onended = () => setPlayingId(null);
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex h-full bg-white rounded-[3rem] overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in duration-500 relative">
      
      {/* SIDEBAR CONTATTI */}
      <aside className="w-80 bg-[#f8fafc] border-r border-slate-200 flex flex-col h-full flex-shrink-0">
        <div className="p-6 bg-white border-b border-slate-200">
           <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Contatti Operativi</h3>
           <button 
            onClick={() => setSelectedChat('general')}
            className={`w-full p-4 rounded-2xl flex items-center justify-between transition-all mb-4 relative ${selectedChat === 'general' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
           >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center font-black text-lg">G</div>
                <div className="text-left">
                   <p className="text-[10px] font-black uppercase tracking-widest">Canale Generale</p>
                   <p className="text-[8px] font-bold opacity-60">UFFICIO: {currentUser.workgroup}</p>
                </div>
              </div>
              {unreadPerChat['general'] > 0 && selectedChat !== 'general' && (
                <span className="bg-rose-600 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full animate-pulse shadow-md border border-white">
                  {unreadPerChat['general']}
                </span>
              )}
           </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
           {allUsers.filter(u => u.id !== currentUser.id).map(user => (
             <button 
              key={user.id}
              onClick={() => setSelectedChat(user.id)}
              className={`w-full p-4 rounded-2xl flex items-center justify-between transition-all border relative ${selectedChat === user.id ? 'bg-white border-indigo-500 shadow-md scale-[1.02] z-10' : 'bg-white border-slate-100 hover:border-indigo-200'}`}
             >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center font-black text-sm uppercase flex-shrink-0">
                    {user.username.charAt(0)}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                     <p className="text-[10px] font-black text-slate-800 uppercase tracking-tighter truncate">{user.username}</p>
                     <p className="text-[8px] font-black text-slate-400 uppercase truncate">[{user.workgroup}] - {user.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {unreadPerChat[user.id] > 0 && selectedChat !== user.id && (
                    <span className="bg-rose-600 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full animate-pulse shadow-md border border-white">
                      {unreadPerChat[user.id]}
                    </span>
                  )}
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                </div>
             </button>
           ))}
        </div>
      </aside>

      {/* AREA CHAT */}
      <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] min-w-0 relative">
        
        {/* GUIDA SBLOCCO MANUALE */}
        {showPermissionGuide && (
          <div className="absolute inset-x-0 top-20 bg-rose-600 text-white p-4 z-[60] flex items-start gap-4 animate-in slide-in-from-top duration-300 shadow-xl">
             <span className="text-3xl">🛡️</span>
             <div className="flex-1">
                <p className="text-[11px] font-black uppercase tracking-widest leading-none mb-1">Accesso Microfono Bloccato</p>
                <p className="text-[9px] font-medium italic opacity-90 leading-relaxed">
                  Comandante, deve sbloccare manualmente: <br/>
                  1. Clicchi l'icona del <strong>Lucchetto 🔒</strong> in alto.<br/>
                  2. Imposti "Microfono" su <strong>CONSENTI</strong>.
                </p>
             </div>
             <button onClick={() => setShowPermissionGuide(false)} className="text-xl font-bold px-2">✕</button>
          </div>
        )}

        {/* HEADER CHAT SELEZIONATA */}
        <div className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0 z-50 shadow-sm">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-white font-black italic shadow-md border-2 border-white">
               {selectedChat === 'general' ? 'G' : activeRecipient?.username.charAt(0).toUpperCase()}
             </div>
             <div>
               <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none italic">
                 {selectedChat === 'general' ? 'CANALE GENERALE COMANDO' : `CHAT DIRETTA: ${activeRecipient?.username.toUpperCase()}`}
               </h3>
               <div className="flex items-center gap-1.5 mt-1.5">
                  <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                    {isRecording ? `IN REGISTRAZIONE: ${formatDuration(recordingDuration)}` : (micPermission === 'denied' ? 'ERRORE MICROFONO' : 'Cifratura End-to-End Vault Attiva')}
                  </span>
               </div>
             </div>
          </div>
          <div className="flex items-center gap-6 opacity-30">
              <span className="text-xl">📞</span>
              <span className="text-xl">🎥</span>
              <span className="text-xl">⋮</span>
          </div>
        </div>

        {/* MESSAGGI */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat"
        >
          {filteredMessages.map((msg, idx) => {
            const isMine = msg.userId === currentUser.id;
            return (
              <div key={msg.id || idx} className={`flex ${isMine ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                <div className={`max-w-[75%] rounded-2xl p-4 shadow-sm relative ${isMine ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                  
                  {!isMine && selectedChat === 'general' && (
                    <div className="flex items-center gap-2 mb-2">
                       <span className="text-[9px] font-black text-indigo-600 uppercase tracking-tighter">{msg.username}</span>
                       <span className="text-[7px] font-black text-slate-300 uppercase italic">[{msg.workgroup}]</span>
                    </div>
                  )}

                  {msg.attachments?.filter(a => !msg.isVoice).map(att => (
                    <div key={att.id} className="mb-3">
                      {att.type.startsWith('image/') ? (
                        <img src={att.data} alt={att.name} className="rounded-xl max-h-64 w-auto object-cover border border-slate-100 shadow-sm" />
                      ) : (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-4">
                          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-2xl shadow-sm">📄</div>
                          <div className="flex-1 min-w-0">
                             <p className="text-[10px] font-black text-slate-800 truncate uppercase">{att.name}</p>
                             <p className="text-[8px] font-bold text-slate-400">{(att.size / 1024).toFixed(1)} KB</p>
                             <button 
                              onClick={() => downloadAttachment(att)}
                              className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md"
                             >
                               📥 Scarica Documento
                             </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {msg.isVoice ? (
                    <div className="flex items-center gap-4 py-2 pr-6 min-w-[240px]">
                      <button 
                        onClick={() => msg.attachments?.[0] && playVoiceMessage(msg.id, msg.attachments[0].data)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md transition-all active:scale-90 ${playingId === msg.id ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {playingId === msg.id ? <span className="text-xs">❚❚</span> : <span className="text-xs ml-0.5">▶</span>}
                      </button>
                      <div className="flex-1 flex gap-0.5 items-center h-8">
                         {[...Array(20)].map((_, i) => (
                           <div 
                             key={i} 
                             className={`w-[3px] rounded-full transition-all duration-300 ${playingId === msg.id ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} 
                             style={{ height: playingId === msg.id ? `${30 + Math.random() * 70}%` : `${10 + (i % 5) * 10}%` }}
                           ></div>
                         ))}
                      </div>
                      <span className="text-[9px] font-black text-slate-400">🎤</span>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  )}

                  <div className="flex justify-end items-center gap-1 mt-2">
                     <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">
                       {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                     </span>
                     {isMine && <span className="text-[10px] text-blue-400 font-bold">✓✓</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredMessages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center py-20 opacity-30">
               <span className="text-5xl mb-4">💬</span>
               <p className="text-[10px] font-black uppercase tracking-widest">Inizia una conversazione sicura</p>
            </div>
          )}
        </div>

        {/* INPUT AREA */}
        <div className="bg-white px-6 py-4 flex items-center gap-4 flex-shrink-0 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
          {!isRecording ? (
            <>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-11 h-11 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-full transition-all border border-slate-100"
              >
                <span className="text-2xl">📎</span>
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
              <div className="flex-1 relative">
                 <input 
                  type="text" 
                  placeholder={selectedChat === 'general' ? "Messaggio al Canale Generale..." : `Scrivi a ${activeRecipient?.username}...`}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  className="w-full bg-[#f0f2f5] border-none px-6 py-4 rounded-2xl text-sm font-medium outline-none shadow-inner"
                 />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-rose-50 rounded-2xl py-4 border border-rose-100 animate-pulse">
               <span className="text-[10px] font-black text-rose-600 uppercase tracking-[0.2em]">Registrazione Vocale: {formatDuration(recordingDuration)}</span>
            </div>
          )}

          {inputText.trim() && !isRecording ? (
            <button 
              onClick={handleSend}
              className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-all active:scale-95"
            >
              <span className="text-lg rotate-45 mb-1">➤</span>
            </button>
          ) : (
            <button 
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all active:scale-95 ${isRecording ? 'bg-rose-600 scale-110 z-[60] text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-900'}`}
            >
              <span className="text-xl">🎤</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Messenger;
