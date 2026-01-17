
import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { Lock, Calculator, AlertCircle, Loader2, UserCircle, ShieldAlert, Info, Mail, MessageSquare, CheckCircle2, Sparkles, Phone, Users, TrendingUp, Handshake } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center bg-[#1e293b] px-4 py-12">
      <div className="max-w-5xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-slate-700 animate-in fade-in zoom-in-95 duration-500">
        
        {/* LATO SINISTRO: LOGIN E VISITA */}
        <div className="flex-1 p-8 md:p-12">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-orange-500 p-2 rounded-xl shadow-lg">
                <Calculator className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">GeCoLa <span className="text-orange-500">Cloud</span></h1>
          </div>

          <h2 className="text-xl font-bold text-slate-700 mb-6">Accesso al Sistema</h2>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 ml-1">Email Aziendale</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm bg-slate-50"
                placeholder="email@esempio.it"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 ml-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm bg-slate-50"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2c3e50] hover:bg-[#1e293b] text-white font-black py-4 px-4 rounded-xl shadow-lg transform transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed uppercase text-xs tracking-widest"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Lock className="w-4 h-4" /> Accedi Pro</>}
            </button>

            <div className="relative my-8">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                <div className="relative flex justify-center text-[10px] uppercase font-black text-slate-300"><span className="bg-white px-4 tracking-[0.2em]">Oppure</span></div>
            </div>

            <button
              type="button"
              onClick={onVisitorLogin}
              className="w-full bg-white border-2 border-slate-100 hover:border-orange-500 hover:bg-orange-50 text-slate-600 font-black py-4 px-4 rounded-xl shadow-sm transform transition-all active:scale-95 flex items-center justify-center gap-2 uppercase text-xs tracking-widest group"
            >
              <UserCircle className="w-5 h-5 text-slate-400 group-hover:text-orange-500" /> 
              Prova la Versione Lite
            </button>
          </form>

          <p className="mt-8 text-center text-[10px] text-slate-300 font-bold uppercase tracking-tighter">
            © 2026 diritti riservati AETERNA s.r.l.
          </p>
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
                            <span className="text-[11px] text-slate-500 font-medium leading-tight block">Tutto abilitato: salvataggio .JSON, IA Gemini e stampe PDF professionali.</span>
                        </div>
                    </li>
                    <li className="flex items-start gap-3">
                        <div className="bg-orange-100 p-2 rounded-xl mt-0.5 shadow-sm"><ShieldAlert className="w-4 h-4 text-orange-600" /></div>
                        <div>
                            <span className="block text-xs font-black text-slate-700 uppercase leading-none mb-1">Limite 5 Voci</span>
                            <span className="text-[11px] text-slate-500 font-medium leading-tight block">Il limite di 5 articoli totali serve solo a testare la qualità del prodotto.</span>
                        </div>
                    </li>
                </ul>

                <div className="pt-6 border-t border-slate-200">
                    <div className="flex items-center gap-2 text-orange-600 font-black text-xs uppercase tracking-widest mb-4">
                        <Handshake className="w-5 h-5" /> Diventa Partner Commerciale
                    </div>
                    <p className="text-[11px] text-slate-600 font-medium leading-relaxed mb-4">
                        Stiamo selezionando **Agenti di Vendita** e distributori qualificati per l'espansione della rete GeCoLa in tutta Italia. Offriamo provvigioni ai vertici del settore e supporto tecnico diretto.
                    </p>
                    <div className="flex items-center gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="text-[10px] font-black text-slate-700 uppercase">Opportunità ad alto rendimento</span>
                    </div>
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
                            <span className="text-xs font-mono font-bold break-all">gecolakey@gmail.com</span>
                        </div>
                    </div>

                    <div className="pt-3">
                        <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-xl">
                            <span className="text-[8px] text-orange-300 block uppercase font-black mb-0.5">Responsabile Progetto</span>
                            <span className="text-xs font-bold text-white tracking-wide">Ing. Domenico Gimondo</span>
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
