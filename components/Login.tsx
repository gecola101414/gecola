
import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { Lock, Calculator, AlertCircle, Loader2, UserCircle, ShieldAlert, Info, Mail, MessageSquare, CheckCircle2, Sparkles, Phone, Users, TrendingUp, Handshake, ExternalLink } from 'lucide-react';

interface LoginProps {
  onVisitorLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onVisitorLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
        setError("Errore configurazione Firebase. Inserisci le chiavi API nel file firebase.ts");
        return;
    }
    setLoading(true);
    setError('');
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
          setError('Email o password non validi.');
      } else if (err.code === 'auth/too-many-requests') {
          setError('Troppi tentativi. Riprova più tardi.');
      } else {
          setError('Errore di accesso. Riprova.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e293b] px-4 py-6">
      <div className="max-w-5xl w-full bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row border border-slate-700 animate-in fade-in zoom-in-95 duration-500 h-[90vh] max-h-[850px]">
        
        {/* LATO SINISTRO: LOGIN E BANNER PUBBLICITARIO ESPANSO */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-8 md:p-10 pb-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-orange-500 p-2 rounded-xl shadow-lg">
                  <Calculator className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">GeCoLa <span className="text-orange-500">Cloud</span></h1>
            </div>

            <h2 className="text-lg font-bold text-slate-700 mb-4">Accesso al Sistema</h2>

            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl text-xs flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 mb-1 ml-1">Email Aziendale</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm bg-slate-50"
                    placeholder="email@esempio.it"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 mb-1 ml-1">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm bg-slate-50"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#2c3e50] hover:bg-[#1e293b] text-white font-black py-3 px-4 rounded-xl shadow-lg transform transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed uppercase text-[10px] tracking-widest"
                  >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Lock className="w-3.5 h-3.5" /> Accedi Pro</>}
                  </button>

                  <button
                  type="button"
                  onClick={onVisitorLogin}
                  className="w-full bg-white border-2 border-slate-100 hover:border-orange-500 hover:bg-orange-50 text-slate-600 font-black py-3 px-4 rounded-xl shadow-sm transform transition-all active:scale-95 flex items-center justify-center gap-2 uppercase text-[10px] tracking-widest group"
                  >
                  <UserCircle className="w-4 h-4 text-slate-400 group-hover:text-orange-500" /> 
                  Lite
                  </button>
              </div>
            </form>
          </div>

          {/* SPAZIO PUBBLICITARIO MAPEI - TUTTO LO SPAZIO IN BASSO */}
          <div className="flex-1 mt-4 px-8 pb-8 flex flex-col">
              <div className="flex-1 rounded-[2rem] border border-slate-200 bg-white shadow-2xl overflow-hidden group/ad relative flex flex-col border-b-4 border-b-orange-500">
                <div className="px-6 py-3 bg-slate-900 text-white flex justify-between items-center z-30">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-orange-500 animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Partner Tecnico Consigliato</span>
                    </div>
                    <span className="text-[8px] font-bold bg-white text-slate-900 px-2 py-0.5 rounded-full">LIVE PREVIEW</span>
                </div>
                
                <div className="flex-1 relative bg-slate-50">
                    <iframe 
                        src="https://www.mapei.com/it/it/home-page" 
                        className="w-full h-full border-none scale-[0.65] origin-top-left w-[154%] h-[154%]"
                        title="Partner Mapei Full"
                        style={{ pointerEvents: 'none' }}
                    />
                    <a 
                        href="https://www.mapei.com/it/it/home-page" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="absolute inset-0 z-40 bg-transparent flex flex-col items-center justify-center opacity-0 group-hover/ad:opacity-100 transition-opacity bg-slate-900/40 backdrop-blur-[2px]"
                    >
                        <div className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-black text-xs uppercase flex items-center gap-3 shadow-2xl transform translate-y-4 group-hover/ad:translate-y-0 transition-all duration-300 hover:scale-105 border-2 border-orange-500">
                            Esplora Soluzioni Mapei <ExternalLink className="w-4 h-4 text-orange-500" />
                        </div>
                    </a>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-center">
                   <p className="text-[8px] text-slate-400 font-black uppercase tracking-tighter">
                     © 2026 GeCoLa Cloud Promotion System • AETERNA s.r.l.
                   </p>
                </div>
              </div>
          </div>
        </div>

        {/* LATO DESTRO: OPPORTUNITÀ COMMERCIALI E LIMITI */}
        <div className="w-full md:w-96 bg-slate-50 p-8 md:p-10 border-l border-slate-100 flex flex-col justify-between">
            <div className="space-y-6">
                <div className="flex items-center gap-2 text-blue-600 font-black text-xs uppercase tracking-widest mb-2">
                    <Sparkles className="w-4 h-4" /> Versione Lite (Demo)
                </div>
                
                <ul className="space-y-5">
                    <li className="flex items-start gap-3">
                        <div className="bg-blue-100 p-2 rounded-xl mt-0.5 shadow-sm"><CheckCircle2 className="w-4 h-4 text-blue-600" /></div>
                        <div>
                            <span className="block text-xs font-black text-slate-700 uppercase leading-none mb-1">Funzioni Complete</span>
                            <span className="text-[11px] text-slate-500 font-medium leading-tight block">Tutto abilitato: IA Gemini e stampe PDF professionali.</span>
                        </div>
                    </li>
                    <li className="flex items-start gap-3">
                        <div className="bg-orange-100 p-2 rounded-xl mt-0.5 shadow-sm"><ShieldAlert className="w-4 h-4 text-orange-600" /></div>
                        <div>
                            <span className="block text-xs font-black text-slate-700 uppercase leading-none mb-1">Limite 5 Voci</span>
                            <span className="text-[11px] text-slate-500 font-medium leading-tight block">Il limite di 5 articoli totali serve solo a testare la qualità.</span>
                        </div>
                    </li>
                </ul>

                <div className="pt-6 border-t border-slate-200">
                    <div className="flex items-center gap-2 text-orange-600 font-black text-xs uppercase tracking-widest mb-4">
                        <Handshake className="w-5 h-5" /> Diventa Partner
                    </div>
                    <p className="text-[11px] text-slate-600 font-medium leading-relaxed mb-4">
                        Offriamo provvigioni ai vertici del settore e supporto tecnico diretto per agenti qualificati.
                    </p>
                </div>
            </div>

            <div className="mt-10 bg-[#2c3e50] p-6 rounded-[2rem] text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute -top-4 -right-4 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                    <Users className="w-24 h-24" />
                </div>
                
                <h4 className="font-black text-xs uppercase tracking-widest text-orange-400 mb-4 flex items-center gap-2">
                    <Mail className="w-4 h-4" /> Contatto Commerciale
                </h4>
                
                <div className="space-y-4">
                    <div className="space-y-1">
                        <span className="block text-[9px] font-black text-slate-400 uppercase tracking-tighter leading-none">Proprietà e Sviluppo</span>
                        <span className="block text-sm font-black text-white uppercase tracking-tight">AETERNA s.r.l. Milano</span>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/10 p-1.5 rounded-lg"><Phone className="w-3.5 h-3.5 text-orange-400" /></div>
                            <span className="text-xs font-mono font-bold">351 9822401</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="bg-white/10 p-1.5 rounded-lg"><Mail className="w-3.5 h-3.5 text-orange-400" /></div>
                            <span className="text-xs font-mono font-bold break-all text-xs">gecolakey@gmail.com</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
