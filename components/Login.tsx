import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { Lock, Calculator, AlertCircle, Loader2, UserCircle, ShieldAlert, CheckCircle2, Phone, Mail, Handshake, Users, Sparkles, Cpu, Activity, Zap, Layers } from 'lucide-react';

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
        setError("Errore configurazione Firebase.");
        return;
    }
    setLoading(true);
    setError('');
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error(err);
      setError('Credenziali non valide.');
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
    try {
      await sendPasswordResetEmail(auth, email);
      alert('Email di ripristino inviata!');
    } catch (err: any) {
      setError('Impossibile inviare l\'email.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e293b] p-4 overflow-hidden">
      <div className="max-w-7xl w-full bg-white rounded-[3rem] shadow-[0_40px_120px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col md:flex-row h-[90vh] border border-slate-700">
        
        {/* LATO SINISTRO: LOGIN (TOP) + ANIMAZIONE AI (BOTTOM) */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          
          {/* AREA LOGIN SUPERIORE */}
          <div className="p-8 pb-4 shrink-0">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500 p-2 rounded-xl shadow-lg">
                    <Calculator className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-3xl font-black text-slate-800 tracking-tighter uppercase leading-none">
                  GeCoLa <span className="text-orange-500">WEB</span>
                </h1>
              </div>
              
              <div className="text-right hidden lg:block">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-tighter">Accesso Professionale</h2>
                <p className="text-slate-400 text-[9px] font-bold uppercase">Engineering System v12.0</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4">
                <label className="block text-[9px] font-black uppercase text-slate-400 mb-1 ml-1 tracking-widest">Email Aziendale</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-500 outline-none transition-all text-sm bg-slate-50 font-bold text-slate-700 shadow-inner"
                  placeholder="email@azienda.it"
                />
              </div>

              <div className="md:col-span-4">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[9px] font-black uppercase text-slate-400 ml-1 tracking-widest">Password</label>
                  <button type="button" onClick={handleForgotPassword} className="text-[8px] font-bold text-blue-600 hover:underline uppercase">Recupera</button>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-100 focus:border-blue-500 outline-none transition-all text-sm bg-slate-50 font-bold text-slate-700 shadow-inner"
                  placeholder="••••••••"
                />
              </div>

              <div className="md:col-span-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#2c3e50] hover:bg-[#1e293b] text-white font-black py-3 px-6 rounded-xl shadow-xl transform transition-all active:scale-95 flex items-center justify-center gap-3 uppercase text-xs tracking-widest"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Lock className="w-4 h-4" /> LOGIN</>}
                </button>
              </div>
            </form>
            {error && (
                <div className="mt-2 bg-red-50 text-red-700 px-4 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 border border-red-100 animate-in fade-in slide-in-from-top-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {error}
                </div>
            )}
          </div>

          {/* AREA ANIMAZIONE AI - NEURAL DATA FLOW (SOSTITUISCE IMMAGINE) */}
          <div className="flex-1 relative bg-slate-950 overflow-hidden border-t border-slate-800">
              {/* Background Grid */}
              <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
              
              {/* Animazione Nodi Pulsanti */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 blur-[100px] animate-pulse"></div>
                      <Cpu className="w-32 h-32 text-blue-500/20 animate-spin-slow" />
                      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                          <Activity className="w-16 h-16 text-blue-400 animate-pulse" />
                      </div>
                  </div>
              </div>

              {/* Data Streams (Righi di computo che scorrono) */}
              <div className="absolute top-0 left-10 bottom-0 w-64 opacity-30 select-none overflow-hidden flex flex-col justify-center gap-2 font-mono text-[8px] text-blue-400/50 italic">
                  {[...Array(15)].map((_, i) => (
                      <div key={i} className={`whitespace-nowrap animate-slide-left`} style={{ animationDelay: `${i * 0.5}s`, animationDuration: '10s' }}>
                        WBS.{String(i+1).padStart(2,'0')} - ANALISI PREZZO UNITARIO - CALCOLO VOLUMI IN CORSO... 125,45 mc x 142,50 €
                      </div>
                  ))}
              </div>

              {/* Scanning Laser Line */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent animate-scan z-10 shadow-[0_0_20px_rgba(59,130,246,0.5)]"></div>

              {/* Badge Informativo in basso */}
              <div className="absolute bottom-8 left-10 z-20 space-y-3">
                 <div className="inline-flex items-center gap-2 bg-blue-600 px-4 py-1.5 rounded-full border border-blue-400 shadow-2xl animate-in slide-in-from-bottom-4">
                    <Sparkles className="w-3 h-3 text-yellow-300" />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white">GeCoLa AI Engine Active</span>
                 </div>
                 <h2 className="text-3xl font-black text-white italic tracking-tighter leading-none drop-shadow-2xl">
                    L'intelligenza al servizio<br/>
                    <span className="text-blue-400">del computo moderno.</span>
                 </h2>
              </div>
          </div>
        </div>

        {/* LATO DESTRO: SIDEBAR (INFO + VISITATORE) - COMPRESSA PER PAGINA SINGOLA */}
        <div className="w-full md:w-80 bg-slate-50 border-l border-slate-200 flex flex-col shadow-inner">
            
            <div className="p-6 flex-1 flex flex-col space-y-6 overflow-hidden">
                
                {/* Qualità Certificata */}
                <div className="space-y-4 shrink-0">
                    <div className="flex items-center gap-2 text-blue-700 font-black text-[10px] uppercase tracking-[0.2em]">
                        <ShieldAlert className="w-4 h-4" /> Qualità Certificata
                    </div>
                    
                    <ul className="space-y-3">
                        <li className="flex items-center gap-3">
                            <div className="bg-blue-100 p-2 rounded-xl text-blue-600"><CheckCircle2 className="w-4 h-4" /></div>
                            <span className="text-[9px] font-black text-slate-700 uppercase tracking-tighter">prezzari regionali</span>
                        </li>
                        <li className="flex items-center gap-3">
                            <div className="bg-orange-100 p-2 rounded-xl text-orange-600"><Zap className="w-4 h-4" /></div>
                            <span className="text-[9px] font-black text-slate-700 uppercase tracking-tighter">Analisi IA Istantanea</span>
                        </li>
                    </ul>
                </div>

                {/* Box Contatto Commerciale - Più compatto */}
                <div className="bg-[#2c3e50] p-5 rounded-[2rem] text-white shadow-xl relative overflow-hidden group border border-slate-600 shrink-0">
                    <h4 className="font-black text-[9px] uppercase tracking-widest text-orange-400 mb-3 flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5" /> Assistenza Diretta
                    </h4>
                    <div className="space-y-3 relative z-10">
                        <div className="flex items-center gap-3">
                            <Phone className="w-4 h-4 text-orange-400" />
                            <span className="text-[14.5px] font-mono font-bold text-slate-100 tracking-tighter">351 9822401</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Mail className="w-4 h-4 text-orange-400" />
                            <span className="text-xs font-mono font-bold text-slate-100 truncate">gecolakey@gmail.com</span>
                        </div>
                    </div>
                </div>

                {/* PULSANTE VISITATORE - POSIZIONATO PER EVITARE SCROLL */}
                <div className="mt-auto pt-4 flex flex-col items-center">
                    <button
                        type="button"
                        onClick={onVisitorLogin}
                        className="w-full bg-white border-2 border-slate-200 hover:border-orange-500 hover:bg-orange-50 text-slate-700 font-black py-4 px-4 rounded-[1.8rem] shadow-lg transform transition-all active:scale-95 flex flex-col items-center justify-center gap-1 group"
                    >
                        <div className="flex items-center gap-2">
                            <UserCircle className="w-5 h-5 text-slate-300 group-hover:text-orange-500 transition-colors" /> 
                            <span className="text-[11px] uppercase tracking-widest">Entra come Visitatore</span>
                        </div>
                        <span className="text-[8px] text-slate-400 font-bold uppercase group-hover:text-orange-600 transition-colors">Ambiente Test • 15 Voci</span>
                    </button>
                    
                    <div className="mt-6 text-center">
                         <p className="text-[8px] text-slate-400 font-black uppercase tracking-[0.2em]">
                           © 2026 GeCoLa WEB Professional
                         </p>
                    </div>
                </div>
            </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes slide-left {
          from { transform: translateX(100%); }
          to { transform: translateX(-200%); }
        }
        .animate-scan {
          animation: scan 4s linear infinite;
        }
        .animate-slide-left {
          animation: slide-left linear infinite;
        }
        .animate-spin-slow {
          animation: spin 20s linear infinite;
        }
      `}} />
    </div>
  );
};

export default Login;