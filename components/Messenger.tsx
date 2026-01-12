
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, User, Attachment } from '../types';

interface MessengerProps {
  messages: ChatMessage[];
  currentUser: User;
  allUsers: User[];
  onSendMessage: (msg: Partial<ChatMessage>) => void;
  onReadChat: (chatId: string) => void;
}

const Messenger: React.FC<MessengerProps> = ({ messages, currentUser, allUsers, onSendMessage }) => {
  const [inputText, setInputText] = useState('');
  const [selectedChat, setSelectedChat] = useState<'general' | string>('general');
  const [showChatList, setShowChatList] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, selectedChat, showChatList]);

  const filteredMessages = useMemo(() => {
    if (selectedChat === 'general') return messages.filter(m => !m.recipientId);
    return messages.filter(m => 
      (m.userId === currentUser.id && m.recipientId === selectedChat) ||
      (m.userId === selectedChat && m.recipientId === currentUser.id)
    );
  }, [messages, selectedChat, currentUser.id]);

  const activeChatName = selectedChat === 'general' ? 'Canale Generale' : allUsers.find(u => u.id === selectedChat)?.username;

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage({
      text: inputText,
      userId: currentUser.id,
      username: currentUser.username,
      workgroup: currentUser.workgroup,
      timestamp: new Date().toISOString(),
      recipientId: selectedChat === 'general' ? undefined : selectedChat
    });
    setInputText('');
  };

  return (
    <div className="flex-1 flex h-full bg-white rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl border border-slate-200 relative font-['Inter']">
      
      {/* LISTA CHAT (Scomparsa su mobile se una chat è aperta) */}
      <aside className={`w-full md:w-80 bg-slate-50 border-r border-slate-200 flex flex-col h-full flex-shrink-0 ${!showChatList ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-6 bg-white border-b border-slate-200">
           <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Comunicazioni</h3>
           <button onClick={() => { setSelectedChat('general'); setShowChatList(false); }} className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${selectedChat === 'general' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center font-black">G</div>
              <div className="text-left"><p className="text-[10px] font-black uppercase">Generale</p></div>
           </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
           {allUsers.filter(u => u.id !== currentUser.id).map(user => (
             <button key={user.id} onClick={() => { setSelectedChat(user.id); setShowChatList(false); }} className={`w-full p-4 rounded-2xl flex items-center gap-4 border transition-all ${selectedChat === user.id ? 'bg-white border-indigo-500 shadow-sm' : 'bg-white border-slate-100'}`}>
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-400">{user.username[0]}</div>
                <div className="text-left flex-1 min-w-0"><p className="text-[10px] font-black text-slate-800 uppercase truncate">{user.username}</p><p className="text-[8px] text-slate-400 truncate">[{user.workgroup}]</p></div>
             </button>
           ))}
        </div>
      </aside>

      {/* AREA MESSAGGI */}
      <div className={`flex-1 flex flex-col h-full bg-[#f0f2f5] min-w-0 ${showChatList ? 'hidden md:flex' : 'flex'}`}>
        <div className="h-16 md:h-20 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between flex-shrink-0 z-50">
          <div className="flex items-center gap-4">
             <button onClick={() => setShowChatList(true)} className="md:hidden p-2 text-slate-400">←</button>
             <div>
               <h3 className="text-xs md:text-sm font-black text-slate-800 uppercase truncate max-w-[150px] md:max-w-none">{activeChatName}</h3>
               <p className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest">Crittografia Attiva</p>
             </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 custom-scrollbar">
          {filteredMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.userId === currentUser.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl p-4 shadow-sm ${msg.userId === currentUser.id ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                <p className="text-sm text-slate-800 font-medium leading-relaxed">{msg.text}</p>
                <div className="flex justify-between items-center mt-2 gap-4">
                   <span className="text-[7px] text-slate-300 font-black uppercase">{msg.username}</span>
                   <span className="text-[8px] text-slate-400 font-bold">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-[#f0f2f5] px-4 py-3 flex items-end gap-2 flex-shrink-0">
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-2 flex items-center">
            <input 
              type="text" 
              placeholder="Messaggio..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              className="flex-1 bg-transparent border-none py-2 px-2 outline-none text-sm font-medium"
            />
          </div>
          <button onClick={handleSend} className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all">
            <svg className="w-6 h-6 rotate-45" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Messenger;
