
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, User, Attachment, UserRole } from '../types';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

interface MessengerProps {
  messages: ChatMessage[];
  currentUser: User;
  allUsers: User[];
  onSendMessage: (msg: Partial<ChatMessage>) => void;
  onReadChat: (chatId: string) => void;
  onForceSync?: () => void;
}

// Utility: Encoding/Decoding standard per flussi PCM
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

const Messenger: React.FC<MessengerProps> = ({ messages, currentUser, allUsers, onSendMessage, onReadChat, onForceSync }) => {
  const [inputText, setInputText] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<'general' | string>('general');
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  
  // LIVE BRIEFING STATE
  const [isLiveRoomOpen, setIsLiveRoomOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'permissions' | 'connecting' | 'active' | 'error'>('idle');
  const [liveTranscript, setLiveTranscript] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // LIVE REFS
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // --- LIVE BRIEFING LOGIC ---
  const startLiveBriefing = async () => {
    setIsLiveRoomOpen(true);
    setLiveStatus('permissions');
    setLiveTranscript(["[SISTEMA] Richiesta accesso sensori AV..."]);

    try {
      // 1. Acquisizione Stream (Permessi)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: { width: 480, height: 360, frameRate: 15 } 
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      
      setLiveStatus('connecting');
      setLiveTranscript(prev => [...prev, "[OK] Sensori pronti. Inizializzazione bridge IA..."]);

      // 2. Setup Audio Contexts
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Cruciale: riprendere il contesto audio (spesso bloccato dal browser)
      await inputCtx.resume();
      await outputCtx.resume();
      
      audioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      // 3. Connessione Gemini Live
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
          systemInstruction: `Sei l'Ufficiale di Collegamento IA del Comando Militare Esercito Lombardia.
          Stai fornendo assistenza video/audio in tempo reale. Sii professionale, conciso e autoritario.`
        },
        callbacks: {
          onopen: () => {
            setLiveStatus('active');
            setLiveTranscript(prev => [...prev, "[OK] Collegamento criptato stabilito. Voce e Video attivi."]);
            
            // Streaming Audio
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (liveStatus === 'active' || true) { // Continua se la sessione è aperta
                const inputData = e.inputBuffer.getChannelData(0);
                const l = inputData.length;
                const int16 = new Int16Array(l);
                for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
                const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
                sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
              }
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
            (liveSessionRef as any).processor = scriptProcessor;

            // Streaming Video (Frame limitati per stabilità)
            const interval = setInterval(() => {
              if (canvasRef.current && videoRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                ctx?.drawImage(videoRef.current, 0, 0, 320, 240);
                canvasRef.current.toBlob(async (blob) => {
                  if (blob) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      const base64 = (reader.result as string).split(',')[1];
                      sessionPromise.then(s => s.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } }));
                    };
                    reader.readAsDataURL(blob);
                  }
                }, 'image/jpeg', 0.5);
              }
            }, 1500);
            (liveSessionRef as any).currentInterval = interval;
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
          },
          onclose: () => {
            setLiveStatus('idle');
            setLiveTranscript(prev => [...prev, "[INFO] Connessione chiusa dall'host."]);
          },
          onerror: (e) => {
            console.error(e);
            setLiveStatus('error');
            setLiveTranscript(prev => [...prev, "[ERRORE] Collisione pacchetti o Timeout server."]);
          }
        }
      });

      liveSessionRef.current = sessionPromise;

    } catch (e) {
      console.error(e);
      setLiveStatus('error');
      setLiveTranscript(prev => [...prev, "[ERRORE] Accesso negato o Risorsa occupata."]);
    }
  };

  const stopLiveBriefing = () => {
    setLiveStatus('idle');
    setIsLiveRoomOpen(false);
    
    if (liveSessionRef.current) {
      liveSessionRef.current.then((s: any) => s.close());
      clearInterval((liveSessionRef as any).currentInterval);
      if ((liveSessionRef as any).processor) (liveSessionRef as any).processor.disconnect();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    
    audioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    nextStartTimeRef.current = 0;
  };

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage({
      text: inputText,
      timestamp: new Date().toISOString(),
      recipientId: selectedChat === 'general' ? undefined : selectedChat
    });
    setInputText('');
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

  return (
    <div className="flex-1 flex h-full bg-white rounded-[3rem] overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in duration-500 relative">
      
      {/* SALA BRIEFING - OVERLAY INTEGRALE */}
      {isLiveRoomOpen && (
        <div className="absolute inset-0 z-[100] bg-slate-950 flex flex-col animate-in zoom-in duration-300">
           <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-900 shadow-xl">
              <div className="flex items-center gap-6">
                 <div className={`w-3 h-3 rounded-full shadow-[0_0_10px] ${
                   liveStatus === 'active' ? 'bg-emerald-500 shadow-emerald-500/80 animate-pulse' : 
                   liveStatus === 'error' ? 'bg-rose-500 shadow-rose-500/80' : 
                   'bg-amber-500 shadow-amber-500/80 animate-bounce'
                 }`}></div>
                 <div>
                    <h2 className="text-white font-black uppercase tracking-[0.3em] italic text-sm">SALA BRIEFING - VAULT LIVE</h2>
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Stato Sessione: {liveStatus.toUpperCase()}</p>
                 </div>
              </div>
              <button onClick={stopLiveBriefing} className="px-6 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-rose-700 transition-all">Termina Sessione ✕</button>
           </div>
           
           <div className="flex-1 flex gap-6 p-8 overflow-hidden bg-slate-950">
              {/* VIDEO FEED (Grayscale Tattico) */}
              <div className="flex-1 bg-black rounded-[2.5rem] border-2 border-white/5 relative overflow-hidden shadow-2xl flex items-center justify-center">
                 <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover transition-opacity duration-1000 ${liveStatus === 'active' ? 'opacity-40 grayscale' : 'opacity-10'}`} />
                 <canvas ref={canvasRef} className="hidden" width="320" height="240" />
                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)]"></div>
                 
                 {liveStatus !== 'active' && (
                   <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                      <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-indigo-400 font-black text-[10px] uppercase tracking-widest animate-pulse">Sincronizzazione Sensori...</p>
                   </div>
                 )}

                 <div className="absolute bottom-10 left-10">
                    <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Operatore Identificato</span>
                    <p className="text-2xl font-black italic uppercase tracking-tighter text-white">{currentUser.username}</p>
                 </div>
              </div>

              {/* DASHBOARD IA */}
              <div className="w-[450px] flex flex-col gap-6">
                 <div className="bg-slate-900 rounded-[2.5rem] p-10 border border-white/10 shadow-xl flex flex-col items-center justify-center aspect-square">
                    <div className="w-32 h-32 rounded-full bg-indigo-600/10 flex items-center justify-center mb-8 relative border-2 border-indigo-500/20">
                       <div className={`w-24 h-24 rounded-full bg-indigo-500 transition-all duration-300 ${liveStatus === 'active' ? 'animate-ping opacity-10' : 'opacity-0'}`}></div>
                       <div className="absolute inset-0 flex items-center justify-center text-5xl">🤖</div>
                    </div>
                    <h3 className="text-white font-black uppercase text-xs tracking-widest mb-2 italic">Ufficiale IA - Vault Bridge</h3>
                    <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.2em] mb-8">Canale Audio Protocollato</p>
                    <div className="flex items-center gap-1.5 h-12">
                       {[...Array(16)].map((_, i) => (
                         <div key={i} className={`w-1.5 bg-indigo-500 rounded-full transition-all duration-200 ${liveStatus === 'active' ? 'opacity-100' : 'opacity-10'}`} 
                              style={{ height: `${liveStatus === 'active' ? 20 + Math.random() * 80 : 10}%`, transitionDelay: `${i * 30}ms` }}></div>
                       ))}
                    </div>
                 </div>

                 <div className="flex-1 bg-black/40 rounded-[2.5rem] border border-white/5 p-8 overflow-y-auto custom-scrollbar shadow-inner">
                    <h4 className="text-[8px] font-black text-indigo-500/50 uppercase tracking-[0.4em] mb-6 italic border-b border-white/5 pb-2">Log di Transazione Live</h4>
                    <div className="space-y-3">
                      {liveTranscript.map((t, i) => (
                        <p key={i} className="text-indigo-100/70 text-[10px] font-mono leading-relaxed flex items-start gap-3">
                          <span className="text-indigo-600 font-bold">»</span> 
                          <span>{t}</span>
                        </p>
                      ))}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* SIDEBAR CONTATTI */}
      <aside className="w-80 bg-[#f8fafc] border-r border-slate-200 flex flex-col h-full flex-shrink-0">
        <div className="p-6 bg-white border-b border-slate-200">
           <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Tactical Comms</h3>
           <button 
            onClick={() => setSelectedChat('general')}
            className={`w-full p-4 rounded-2xl flex items-center justify-between transition-all mb-4 relative ${selectedChat === 'general' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
           >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center font-black text-lg">G</div>
                <div className="text-left">
                   <p className="text-[10px] font-black uppercase tracking-widest">Generale</p>
                   <p className="text-[8px] font-bold opacity-60 uppercase">Tutto il Reparto</p>
                </div>
              </div>
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
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black text-sm uppercase flex-shrink-0">
                    {user.username.charAt(0)}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                     <p className="text-[10px] font-black text-slate-800 uppercase tracking-tighter truncate">{user.username}</p>
                     <p className="text-[8px] font-black text-slate-400 uppercase truncate">[{user.workgroup}]</p>
                  </div>
                </div>
             </button>
           ))}
        </div>
      </aside>

      {/* AREA CHAT */}
      <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] min-w-0 relative">
        <div className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0 z-50">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-white font-black italic shadow-md">
               {selectedChat === 'general' ? 'G' : activeRecipient?.username.charAt(0).toUpperCase()}
             </div>
             <div>
               <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none italic">
                 {selectedChat === 'general' ? 'CANALE GENERALE COMANDO' : activeRecipient?.username.toUpperCase()}
               </h3>
               <div className="flex items-center gap-1.5 mt-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Cifratura Vault Attiva</span>
               </div>
             </div>
          </div>
          
          <div className="flex items-center gap-3">
              {/* TASTO BRIEFING VIDEO LIVE */}
              <button 
                onClick={startLiveBriefing}
                title="Avvia Sala Briefing Live"
                className="w-12 h-12 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 rounded-2xl shadow-xl transition-all hover:scale-110 active:scale-95 group"
              >
                <span className="text-xl group-hover:animate-bounce">📹</span>
              </button>

              <button 
                onClick={onForceSync}
                className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl border border-slate-100 transition-all"
              >
                🔄
              </button>
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
                    <p className="text-[9px] font-black text-indigo-600 uppercase tracking-tighter mb-1">{msg.username} [{msg.workgroup}]</p>
                  )}
                  <p className="text-sm text-slate-800 font-medium leading-relaxed">{msg.text}</p>
                  <div className="flex justify-end items-center gap-1 mt-1">
                     <span className="text-[8px] text-slate-400 font-bold uppercase">
                       {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                     </span>
                     {isMine && <span className="text-[10px] text-blue-400">✓✓</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* INPUT AREA */}
        <div className="bg-white px-6 py-4 flex items-center gap-4 flex-shrink-0 z-50">
           <input 
            type="text" 
            placeholder="Comunica con il reparto..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 bg-slate-100 border-none px-6 py-3 rounded-2xl text-sm outline-none"
          />
          <button onClick={handleSend} className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all">➤</button>
        </div>
      </div>
    </div>
  );
};

export default Messenger;
