
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, User, Attachment, UserRole } from '../types';

interface MessengerProps {
  messages: ChatMessage[];
  currentUser: User;
  allUsers: User[];
  onSendMessage: (msg: Partial<ChatMessage>) => void;
  onReadChat: (chatId: string) => void;
  isSyncing?: boolean;
}

const LoadingStar = () => (
  <div className="absolute -top-3 -right-3 w-8 h-8 z-20 flex items-center justify-center animate-in zoom-in duration-300">
    <div className="relative w-full h-full">
      {/* Cerchio di caricamento rotante */}
      <svg className="w-full h-full animate-spin text-indigo-500" viewBox="0 0 24 24">
        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none"></circle>
        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      {/* Stellina Gialla Fissa al Centro */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 100 95" fill="#D4AF37" className="drop-shadow-[0_0_3px_rgba(212,175,55,0.8)]">
           <path d="M50 0L61.2257 34.5492H97.5528L68.1636 55.9017L79.3893 90.4508L50 69.0983L20.6107 90.4508L31.8364 55.9017L2.44717 34.5492H38.7743L50 0Z" />
        </svg>
      </div>
    </div>
  </div>
);

const ProcessingStar = () => (
  <div className="flex flex-col items-center justify-center py-2 animate-in fade-in zoom-in duration-200">
    <div className="relative">
      <div className="absolute inset-0 bg-indigo-500/30 blur-2xl rounded-full animate-pulse"></div>
      <svg width="34" height="34" viewBox="0 0 100 95" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-spin duration-[3000ms] relative z-10">
        <path d="M50 0L61.2257 34.5492H97.5528L68.1636 55.9017L79.3893 90.4508L50 69.0983L20.6107 90.4508L31.8364 55.9017L2.44717 34.5492H38.7743L50 0Z" fill="#D4AF37"/>
      </svg>
    </div>
    <span className="text-[7px] font-black text-indigo-700 uppercase tracking-[0.4em] mt-2 animate-pulse italic">Cifratura DNA in corso...</span>
  </div>
);

const Messenger: React.FC<MessengerProps> = ({ messages, currentUser, allUsers, onSendMessage, onReadChat, isSyncing }) => {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<'general' | string>('general');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pendingVoiceMsg, setPendingVoiceMsg] = useState<Attachment | null>(null);
  const [auditMode, setAuditMode] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const isLegalAudit = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.VIEWER || currentUser.role === UserRole.COMANDANTE;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    onReadChat(selectedChat);
  }, [messages, selectedChat]);

  const filteredMessages = useMemo(() => {
    if (selectedChat === 'general') {
      return messages.filter(m => !m.recipientId);
    } else {
      if (auditMode && isLegalAudit) {
         return messages.filter(m => m.userId === selectedChat || m.recipientId === selectedChat);
      }
      return messages.filter(m => 
        (m.userId === currentUser.id && m.recipientId === selectedChat) ||
        (m.userId === selectedChat && m.recipientId === currentUser.id)
      );
    }
  }, [messages, selectedChat, currentUser.id, auditMode, isLegalAudit]);

  const activeRecipient = useMemo(() => {
    if (selectedChat === 'general') return null;
    return allUsers.find(u => u.id === selectedChat);
  }, [allUsers, selectedChat]);

  const unreadPerChat = useMemo(() => {
    const counts: Record<string, number> = {};
    const lastReads = currentUser.lastReadTimestamps || {};
    const lastReadGen = lastReads['general'] || '1970-01-01T00:00:00.000Z';
    counts['general'] = messages.filter(m => !m.recipientId && m.userId !== currentUser.id && m.timestamp > lastReadGen).length;
    allUsers.forEach(u => {
      if (u.id === currentUser.id) return;
      const lastReadU = lastReads[u.id] || '1970-01-01T00:00:00.000Z';
      counts[u.id] = messages.filter(m => m.recipientId === currentUser.id && m.userId === u.id && m.timestamp > lastReadU).length;
    });
    return counts;
  }, [messages, currentUser, allUsers]);

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleSend = async () => {
    if (pendingVoiceMsg) {
      onSendMessage({
        text: '🎤 Messaggio Vocale Operativo',
        isVoice: true,
        timestamp: new Date().toISOString(),
        recipientId: selectedChat === 'general' ? undefined : selectedChat,
        attachments: [pendingVoiceMsg]
      });
      setPendingVoiceMsg(null);
      return;
    }

    if (!inputText.trim() && attachments.length === 0) return;
    const textToSend = inputText;
    const currentAttachments = [...attachments];
    
    setInputText('');
    setAttachments([]);
    
    onSendMessage({
      text: textToSend || (currentAttachments.length > 0 ? '📎 Allegati' : ''),
      timestamp: new Date().toISOString(),
      attachments: currentAttachments,
      recipientId: selectedChat === 'general' ? undefined : selectedChat
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const b64 = await blobToBase64(file);
        newAttachments.push({ id: `att-${Date.now()}-${i}`, name: file.name, data: b64, type: file.type, size: file.size, uploadedAt: new Date().toISOString() });
      } catch (err) { console.error(err); }
    }
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const startRecording = async (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (pendingVoiceMsg) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        setIsProcessingAudio(true); 
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const b64 = await blobToBase64(blob);
        
        setPendingVoiceMsg({
          id: `voice-${Date.now()}`,
          name: `nota-vocale.webm`,
          data: b64,
          type: 'audio/webm',
          size: blob.size,
          uploadedAt: new Date().toISOString()
        });
        
        setIsProcessingAudio(false);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = window.setInterval(() => setRecordingDuration(p => p + 1), 1000);
    } catch (e) { 
      alert("Accesso al microfono negato o non disponibile."); 
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const playVoiceMessage = (audioData: string, id: string) => {
    if (playingId === id) { currentAudioRef.current?.pause(); setPlayingId(null); return; }
    if (currentAudioRef.current) currentAudioRef.current.pause();
    const audio = new Audio(audioData);
    currentAudioRef.current = audio;
    setPlayingId(id);
    audio.play();
    audio.onended = () => setPlayingId(null);
  };

  return (
    <div className="flex-1 flex h-full bg-white rounded-[3rem] overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in duration-500 relative font-['Inter']">
      <aside className="w-80 bg-[#f8fafc] border-r border-slate-200 flex flex-col h-full flex-shrink-0">
        <div className="p-6 bg-white border-b border-slate-200">
           <div className="flex justify-between items-center mb-4">
             <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Chat Operativa</h3>
             {isLegalAudit && (
                <button onClick={() => setAuditMode(!auditMode)} className={`text-[7px] font-black uppercase px-2 py-1 rounded border transition-all ${auditMode ? 'bg-rose-600 border-rose-700 text-white' : 'bg-slate-100 text-slate-400'}`}>Audit Legale {auditMode ? 'ON' : 'OFF'}</button>
             )}
           </div>
           <button onClick={() => setSelectedChat('general')} className={`w-full p-4 rounded-2xl flex items-center justify-between transition-all mb-4 relative ${selectedChat === 'general' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center font-black text-lg shadow-md border border-white/20">G</div>
                <div className="text-left"><p className="text-[10px] font-black uppercase tracking-widest leading-none">Canale Generale</p><p className="text-[8px] font-bold opacity-60 mt-1">Audit Forense</p></div>
              </div>
              {unreadPerChat['general'] > 0 && selectedChat !== 'general' && <span className="bg-rose-600 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-md border border-white">{unreadPerChat['general']}</span>}
           </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
           {allUsers.filter(u => u.id !== currentUser.id).map(user => (
             <button key={user.id} onClick={() => setSelectedChat(user.id)} className={`w-full p-4 rounded-2xl flex items-center justify-between transition-all border relative ${selectedChat === user.id ? 'bg-white border-indigo-500 shadow-md scale-[1.02] z-10' : 'bg-white border-slate-100 hover:border-indigo-200'}`}>
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md flex-shrink-0 border border-slate-100 bg-slate-50 flex items-center justify-center">
                    {user.profilePhoto ? <img src={user.profilePhoto} className="w-full h-full object-cover" /> : <span className="font-black text-slate-300 uppercase">{user.username.charAt(0)}</span>}
                  </div>
                  <div className="text-left flex-1 min-w-0"><p className="text-[10px] font-black text-slate-800 uppercase tracking-tighter truncate">{user.username}</p><p className="text-[8px] font-black text-slate-400 uppercase truncate">[{user.workgroup}]</p></div>
                </div>
                {unreadPerChat[user.id] > 0 && selectedChat !== user.id && <span className="bg-rose-600 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-md border border-white">{unreadPerChat[user.id]}</span>}
             </button>
           ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] min-w-0 relative">
        <div className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0 z-50 shadow-sm">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center text-white font-black italic shadow-md border-2 border-white">
               {selectedChat === 'general' ? 'G' : (activeRecipient?.profilePhoto ? <img src={activeRecipient.profilePhoto} className="w-full h-full object-cover" /> : activeRecipient?.username.charAt(0).toUpperCase())}
             </div>
             <div>
               <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight italic">{selectedChat === 'general' ? 'CHAT OPERATIVA: CANALE GENERALE' : `CHAT OPERATIVA: ${activeRecipient?.username.toUpperCase()}`}</h3>
               <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Identità Verificata & Cifratura Forense Attiva</p>
             </div>
          </div>
          {auditMode && <div className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-[8px] font-black uppercase shadow-sm border border-rose-200 animate-pulse">Monitoraggio Audit Attivo</div>}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
          {filteredMessages.map((msg, i) => {
            const isLastMessage = i === filteredMessages.length - 1;
            const isMyMessage = msg.userId === currentUser.id;
            const showLoading = isLastMessage && isMyMessage && isSyncing;

            return (
              <div key={msg.id || i} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                <div className={`max-w-[75%] rounded-2xl p-4 shadow-sm relative ${isMyMessage ? 'bg-[#d9fdd3] rounded-tr-none border-l-4 border-emerald-400' : 'bg-white rounded-tl-none border-l-4 border-indigo-400'}`}>
                  {showLoading && <LoadingStar />}
                  {auditMode && <p className="text-[6px] font-black text-rose-500 uppercase mb-1">AUDIT: {msg.username} [{msg.workgroup}]</p>}
                  {!msg.isVoice ? (
                     <div className="space-y-2">
                       {msg.attachments?.map(a => (
                         <div key={a.id} className="bg-white/50 p-3 rounded-xl border border-black/5 flex items-center gap-3">
                           <span className="text-xl">📄</span>
                           <div className="flex-1 min-w-0">
                             <p className="text-[10px] font-black truncate">{a.name}</p>
                             <button onClick={() => { const l=document.createElement('a'); l.href=a.data; l.download=a.name; l.click(); }} className="text-[8px] font-black text-indigo-600 uppercase mt-1">Scarica</button>
                           </div>
                         </div>
                       ))}
                       <p className="text-sm text-slate-800 font-medium whitespace-pre-wrap">{msg.text}</p>
                     </div>
                  ) : (
                    <div className="flex items-center gap-4 py-2 min-w-[200px]">
                      <button onClick={() => playVoiceMessage(msg.attachments![0].data, msg.id)} className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-md transition-all active:scale-95 ${playingId === msg.id ? 'bg-rose-500' : 'bg-emerald-600'}`}>{playingId === msg.id ? '❚❚' : '▶'}</button>
                      <div className="flex-1 flex gap-0.5 items-center h-4">
                         {[...Array(15)].map((_, j) => <div key={j} className={`w-1 rounded-full ${playingId === msg.id ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} style={{height: `${20 + Math.random()*80}%`}} />)}
                      </div>
                      <span className="text-[9px] font-black text-slate-400">🎤</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center mt-2">
                     <span className="text-[7px] text-slate-300 font-black uppercase">{msg.username}</span>
                     <span className="text-[8px] text-slate-400 font-bold">{new Date(msg.timestamp).toLocaleString('it-IT', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-[#f0f2f5] px-4 py-3 flex items-end gap-2 flex-shrink-0 z-50">
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col p-2 min-h-[50px] justify-center">
            
            {isProcessingAudio ? (
              <ProcessingStar />
            ) : (
              <>
                {(attachments.length > 0 || pendingVoiceMsg) && (
                  <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-xl mb-2 border border-slate-200">
                    {attachments.map(att => (
                      <div key={att.id} className="bg-white px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-2 text-[8px] font-black uppercase">
                        <span className="truncate max-w-[100px]">📄 {att.name}</span>
                        <button onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} className="text-rose-500">✕</button>
                      </div>
                    ))}
                    {pendingVoiceMsg && (
                      <div className="bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 flex items-center gap-3 animate-in slide-in-from-left duration-300 relative">
                        <span className="text-[8px] font-black text-emerald-700 uppercase tracking-widest">🎤 NOTA VOCALE PRONTA</span>
                        <div className="h-4 w-px bg-emerald-200"></div>
                        <button onClick={() => playVoiceMessage(pendingVoiceMsg.data, 'pending')} className="text-[8px] font-black text-emerald-600 uppercase hover:text-emerald-800">{playingId === 'pending' ? 'STOP' : 'ASCOLTA'}</button>
                        <button onClick={() => setPendingVoiceMsg(null)} className="text-rose-500 text-[10px]">✕</button>
                      </div>
                    )}
                  </div>
                )}

                {isRecording ? (
                   <div className="p-3 bg-rose-50 rounded-xl mb-2 flex items-center justify-between border border-rose-100 animate-pulse">
                     <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-rose-600 animate-ping"></div>
                        <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest italic">Registrazione Militare Attiva: {Math.floor(recordingDuration/60)}:{(recordingDuration%60).toString().padStart(2,'0')}</span>
                     </div>
                     <span className="text-[8px] font-bold text-rose-400 uppercase italic">Rilascia per terminare</span>
                   </div>
                ) : (
                   <div className="flex items-center gap-3">
                      <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">📎</button>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" />
                      <input 
                        type="text" 
                        placeholder="Scrivi un messaggio operativo..."
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        className="flex-1 bg-transparent border-none py-2 px-1 outline-none text-sm font-medium"
                      />
                   </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 pb-1">
             <button 
               onMouseDown={startRecording}
               onMouseUp={stopRecording}
               onMouseLeave={stopRecording}
               onTouchStart={startRecording}
               onTouchEnd={stopRecording}
               className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all ${isRecording ? 'bg-rose-600 text-white scale-125 shadow-rose-200' : 'bg-white text-slate-500 hover:bg-indigo-50 border border-slate-200 active:scale-90'}`}
               title="Tieni premuto per registrare"
               style={{ cursor: 'pointer' }}
             >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
             </button>
             
             <button 
               onClick={() => handleSend()}
               disabled={(!inputText.trim() && attachments.length === 0 && !pendingVoiceMsg) || isRecording}
               className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${(!inputText.trim() && attachments.length === 0 && !pendingVoiceMsg) ? 'bg-slate-100 text-slate-300 border border-slate-200' : 'bg-emerald-600 text-white shadow-emerald-200'}`}
               title="Invia Messaggio"
               style={{ cursor: 'pointer' }}
             >
                <svg className="w-6 h-6 rotate-45 mb-1 mr-1" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Messenger;
