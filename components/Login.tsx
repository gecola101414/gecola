
import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { Lock, Calculator, AlertCircle, Loader2, UserCircle, ShieldAlert, CheckCircle2, Phone, Mail, TrendingUp, ExternalLink, Handshake, Users } from 'lucide-react';

interface LoginProps {
  onVisitorLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onVisitorLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
        setError("Errore configurazione Firebase.");
        return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
          setError('Email o password non validi.');
      } else {
          setError('Errore di accesso. Riprova.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Inserisci la tua email per il ripristino.');
      return;
    }
    if (!auth) return;
    setResetLoading(true);
    setError('');
    setSuccess('');
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess('Email di ripristino inviata!');
    } catch (err: any) {
      setError('Impossibile inviare l\'email di ripristino.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e293b] px-4 py-6">
      <div className="max-w-6xl w-full bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row border border-slate-700 h-[92vh]">
        
        {/* LATO SINISTRO: LOGIN (TOP) + PARTNER SITE (BOTTOM) */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          
          {/* AREA LOGIN COMPATTA IN ALTO */}
          <div className="p-8 pb-4">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500 p-2 rounded-xl shadow-lg">
                    <Calculator className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">GeCoLa <span className="text-orange-500">Cloud</span></h1>
              </div>
              <div className="text-right">
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Accesso Professionale</h2>
                <p className="text-slate-400 text-[10px] font-bold uppercase">Software di Estimazione v11.9</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4">
                <label className="block text-[9px] font-black uppercase text-slate-400 mb-1 ml-1">Email Aziendale</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-xs bg-slate-50 font-bold"
                  placeholder="email@azienda.it"
                />
              </div>

              <div className="md:col-span-4">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[9px] font-black uppercase text-slate-400 ml-1">Password</label>
                  <button 
                    type="button" 
                    onClick={handleForgotPassword}
                    className="text-[8px] font-black text-slate-400 hover:text-orange-600 uppercase tracking-tighter"
                  >
                    Recupera
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-xs bg-slate-50 font-bold"
                  placeholder="••••••••"
                />
              </div>

              <div className="md:col-span-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#2c3e50] hover:bg-[#1e293b] text-white font-black py-2.5 px-4 rounded-xl shadow-lg transform transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 uppercase text-[10px] tracking-widest"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Lock className="w-3.5 h-3.5" /> Entra nel Progetto</>}
                </button>
              </div>
              
              {error && (
                <div className="col-span-12 bg-red-50 text-red-700 px-4 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 animate-in slide-in-from-top-1">
                  <AlertCircle className="w-3 h-3" /> {error}
                </div>
              )}
            </form>
          </div>

          {/* AREA PARTNER A TUTTA AREA IN BASSO */}
          <div className="flex-1 mt-4 relative bg-slate-900 overflow-hidden border-t border-slate-200 group">
             <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-white/10 to-transparent z-20 pointer-events-none"></div>
             
             <iframe 
                src="https://www.mapei.com/it/it/home-page" 
                className="w-full h-full border-none pointer-events-auto"
                title="Partner Mapei Full Layout"
              />

              <div className="absolute top-4 left-6 z-30 flex items-center gap-2 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full border border-slate-200 shadow-xl">
                <TrendingUp className="w-3.5 h-3.5 text-orange-600 animate-pulse" />
                <span className="text-[8px] font-black uppercase text-slate-800 tracking-widest">Sito Partner Consigliato</span>
              </div>

              <a 
                href="https://www.mapei.com/it/it/home-page" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="absolute inset-0 z-10 bg-transparent flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 backdrop-blur-[1px]"
              >
                <div className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-black text-xs uppercase flex items-center gap-3 shadow-2xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 hover:scale-105 border-2 border-orange-500">
                    Sito Ufficiale Mapei <ExternalLink className="w-4 h-4 text-orange-500" />
                </div>
              </a>
          </div>
        </div>

        {/* LATO DESTRO: SIDEBAR INFO E TASTO VISITATORE */}
        <div className="w-full md:w-96 bg-slate-50 p-8 border-l border-slate-200 flex flex-col shadow-inner">
            
            <div className="flex-1 space-y-8 overflow-y-auto custom-scrollbar pr-2">
                
                {/* Info Versione */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-blue-600 font-black text-xs uppercase tracking-widest">
                        <ShieldAlert className="w-4 h-4" /> Qualità Certificata
                    </div>
                    
                    <ul className="space-y-4">
                        <li className="flex items-start gap-3">
                            <div className="bg-blue-100 p-2 rounded-xl shadow-sm"><CheckCircle2 className="w-4 h-4 text-blue-600" /></div>
                            <div>
                                <span className="block text-[10px] font-black text-slate-700 uppercase leading-none mb-1">Standard Regionali</span>
                                <span className="text-[10px] text-slate-500 font-medium leading-tight block">Prezzari aggiornati e calcoli parametrici rigorosi.</span>
                            </div>
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="bg-orange-100 p-2 rounded-xl shadow-sm"><Handshake className="w-4 h-4 text-orange-600" /></div>
                            <div>
                                <span className="block text-[10px] font-black text-slate-700 uppercase leading-none mb-1">Supporto IA</span>
                                <span className="text-[10px] text-slate-500 font-medium leading-tight block">Integrazione Gemini Pro per analisi prezzi istantanee.</span>
                            </div>
                        </li>
                    </ul>
                </div>

                {/* Contatti Commerciali */}
                <div className="bg-[#2c3e50] p-6 rounded-[2rem] text-white shadow-xl relative overflow-hidden group">
                    <div className="absolute -top-6 -right-6 p-4 opacity-5 group-hover:scale-110 transition-transform duration-700">
                        <Users className="w-24 h-24" />
                    </div>
                    
                    <h4 className="font-black text-[10px] uppercase tracking-widest text-orange-400 mb-4 flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5" /> Contatto Commerciale
                    </h4>
                    
                    <div className="space-y-4 relative z-10">
                        <div className="space-y-1">
                            <span className="block text-[8px] font-black text-slate-400 uppercase tracking-tighter">Proprietà e Sviluppo</span>
                            <span className="block text-sm font-black text-white uppercase tracking-tight leading-tight">AETERNA s.r.l. Milano</span>
                        </div>

                        <div className="space-y-3 pt-3 border-t border-white/10">
                            <div className="flex items-center gap-3">
                                <div className="bg-white/10 p-1.5 rounded-lg"><Phone className="w-3.5 h-3.5 text-orange-400" /></div>
                                <span className="text-xs font-mono font-bold text-slate-200">351 9822401</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="bg-white/10 p-1.5 rounded-lg"><Mail className="w-3.5 h-3.5 text-orange-400" /></div>
                                <span className="text-xs font-mono font-bold text-slate-200 break-all">gecolakey@gmail.com</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* TASTO VISITATORE POSIZIONATO SOTTO I CONTATTI */}
                <div className="pt-2">
                    <button
                        type="button"
                        onClick={onVisitorLogin}
                        className="w-full bg-white border-2 border-slate-200 hover:border-orange-500 hover:bg-orange-50 text-slate-700 font-black py-5 px-4 rounded-3xl shadow-sm transform transition-all active:scale-95 flex flex-col items-center justify-center gap-2 uppercase tracking-widest group"
                    >
                        <div className="flex items-center gap-3">
                            <UserCircle className="w-6 h-6 text-slate-300 group-hover:text-orange-500 transition-colors" /> 
                            <span className="text-xs">ACCEDI COME VISITATORE</span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-bold normal-case group-hover:text-orange-600 transition-colors">Ambiente di test • Limite 15 voci</span>
                    </button>
                </div>
            </div>

            <div className="pt-6 mt-auto text-center border-t border-slate-200">
                 <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                   © 2026 GeCoLa Cloud Promotion System
                 </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
