
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, User, Attachment, UserRole, FundingIDV, WorkOrder, WorkStatus } from '../types';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

interface MessengerProps {
  messages: ChatMessage[];
  currentUser: User;
  allUsers: User[];
  idvs: FundingIDV[];
  orders: WorkOrder[];
  onSendMessage: (msg: Partial<ChatMessage>) => void;
  onReadChat: (chatId: string) => void;
  onForceSync?: () => void;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const Messenger: React.FC<MessengerProps> = ({ messages, currentUser, allUsers, idvs, orders, onSendMessage, onReadChat, onForceSync }) => {
  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [selectedChat, setSelectedChat] = useState<'general' | string>('general');
  const [isLiveRoomOpen, setIsLiveRoomOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'permissions' | 'connecting' | 'active' | 'error'>('idle');
  const [liveTranscript, setLiveTranscript] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    // Fix: Explicitly cast Array.from(files) to File[] to avoid 'unknown' type errors on name, type, and size properties.
    (Array.from(files) as File[]).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const att: Attachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          data: event.target?.result as string,
          type: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString()
        };
        setPendingAttachments(prev => [...prev, att]);
      };
      // Fix: Now reader.readAsDataURL(file) receives a File object correctly.
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = () => {
    if (!inputText.trim() && pendingAttachments.length === 0) return;
    onSendMessage({
      text: inputText,
      timestamp: new Date().toISOString(),
      recipientId: selectedChat === 'general' ? undefined : selectedChat,
      attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined
    });
    setInputText('');
    setPendingAttachments([]);
  };

  const startLiveBriefing = async () => {
    setIsLiveRoomOpen(true);
    setLiveStatus('permissions');
    setLiveTranscript(["[SISTEMA] Inizializzazione protocollo Ufficiale di Collegamento (Solo Audio)..."]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setLiveStatus('connecting');
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
          systemInstruction: `Sei l'Ufficiale di Collegamento IA del Comando Militare Esercito Lombardia.`
        },
        callbacks: {
          onopen: () => {
            setLiveStatus('active');
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
            (liveSessionRef as any).processor = scriptProcessor;
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
            }
          }
        }
      });
      liveSessionRef.current = sessionPromise;
    } catch (e) {
      setLiveStatus('error');
    }
  };

  const stopLiveBriefing = () => {
    setIsLiveRoomOpen(false);
    if (liveSessionRef.current) liveSessionRef.current.then((s: any) => s.close());
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close();
    outputAudioContextRef.current?.close();
  };

  return (
    <div className="flex-1 flex h-full bg-white rounded-[3rem] overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in duration-500 relative">
      {isLiveRoomOpen && (
        <div className="absolute inset-0 z-[100] bg-slate-950 flex flex-col animate-in zoom-in duration-300">
           <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-900 shadow-xl">
              <div className="flex items-center gap-6">
                 <div className={`w-3 h-3 rounded-full ${liveStatus === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
                 <div>
                    <h2 className="text-white font-black uppercase tracking-[0.3em] italic text-sm">SALA BRIEFING VOCALE</h2>
                 </div>
              </div>
              <button onClick={stopLiveBriefing} className="px-6 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Termina Sessione ✕</button>
           </div>
           <div className="flex-1 flex gap-6 p-8 overflow-hidden bg-slate-950 items-center justify-center">
              <div className="w-48 h-48 rounded-full border-4 border-indigo-500/20 flex items-center justify-center relative">
                 <div className={`absolute inset-0 rounded-full border-t-4 border-indigo-500 ${liveStatus === 'active' ? 'animate-spin' : ''}`}></div>
                 <span className="text-7xl">🎙️</span>
              </div>
           </div>
        </div>
      )}

      <aside className="w-80 bg-[#f8fafc] border-r border-slate-200 flex flex-col h-full flex-shrink-0">
        <div className="p-6 bg-white border-b border-slate-200">
           <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Tactical Comms</h3>
           <button onClick={() => setSelectedChat('general')} className={`w-full p-4 rounded-2xl flex items-center gap-4 ${selectedChat === 'general' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100'}`}>
              <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center font-black">G</div>
              <div className="text-left"><p className="text-[10px] font-black uppercase">Generale</p></div>
           </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
           {allUsers.filter(u => u.id !== currentUser.id).map(user => (
             <button key={user.id} onClick={() => setSelectedChat(user.id)} className={`w-full p-4 rounded-2xl flex items-center gap-4 border ${selectedChat === user.id ? 'bg-white border-indigo-500 shadow-md scale-[1.02]' : 'bg-white border-slate-100'}`}>
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black">{user.username.charAt(0)}</div>
                <div className="text-left min-w-0">
                   <p className="text-[10px] font-black text-slate-800 uppercase truncate">{user.username}</p>
                   <p className="text-[8px] font-black text-slate-400 uppercase">[{user.workgroup}]</p>
                </div>
             </button>
           ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] min-w-0 relative">
        <div className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between z-50">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-white font-black italic">{selectedChat === 'general' ? 'G' : activeRecipient?.username.charAt(0).toUpperCase()}</div>
             <div><h3 className="text-sm font-black text-slate-800 uppercase italic">{selectedChat === 'general' ? 'CANALE GENERALE COMANDO' : activeRecipient?.username.toUpperCase()}</h3></div>
          </div>
          <button onClick={startLiveBriefing} className="w-12 h-12 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 rounded-2xl shadow-xl transition-all">🎙️</button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]">
          {filteredMessages.map((msg, idx) => {
            const isMine = msg.userId === currentUser.id;
            return (
              <div key={msg.id || idx} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl p-4 shadow-sm relative ${isMine ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                  {!isMine && selectedChat === 'general' && (<p className="text-[9px] font-black text-indigo-600 uppercase mb-1">{msg.username} [{msg.workgroup}]</p>)}
                  <p className="text-sm text-slate-800 font-medium leading-relaxed">{msg.text}</p>
                  
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-black/5 pt-2">
                       {msg.attachments.map(att => (
                         <div key={att.id} className="flex items-center gap-2 p-2 bg-black/5 rounded-xl">
                            <span className="text-lg">📄</span>
                            <div className="flex-1 min-w-0">
                               <p className="text-[9px] font-black text-slate-700 truncate">{att.name}</p>
                               <p className="text-[7px] text-slate-400 font-bold uppercase">{(att.size / 1024).toFixed(1)} KB</p>
                            </div>
                         </div>
                       ))}
                    </div>
                  )}

                  <div className="flex justify-end items-center gap-1 mt-1">
                     <span className="text-[8px] text-slate-400 font-bold uppercase">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                     {isMine && <span className="text-[10px] text-blue-400">✓✓</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white border-t border-slate-200 p-4 z-50">
           {pendingAttachments.length > 0 && (
             <div className="flex gap-2 overflow-x-auto pb-4 mb-2">
                {pendingAttachments.map(att => (
                  <div key={att.id} className="flex-shrink-0 bg-slate-100 px-4 py-2 rounded-xl flex items-center gap-3 border border-slate-200">
                    <span className="text-xs">📄</span>
                    <span className="text-[9px] font-black text-slate-600">{att.name}</span>
                    <button onClick={() => setPendingAttachments(prev => prev.filter(p => p.id !== att.id))} className="text-rose-500 font-bold">✕</button>
                  </div>
                ))}
             </div>
           )}
           <div className="flex items-center gap-3">
              <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 transition-all">📎</button>
              <input type="text" placeholder="Messaggio..." value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} className="flex-1 bg-slate-100 border-none px-6 py-3 rounded-2xl text-sm outline-none" />
              <button onClick={handleSend} className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all">➤</button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Messenger;
