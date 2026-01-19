
import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { Lock, Calculator, AlertCircle, Loader2, UserCircle, ShieldAlert, CheckCircle2, Sparkles, Mail, KeyRound, ArrowLeft } from 'lucide-react';

interface LoginProps {
  onVisitorLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onVisitorLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
        setError("Errore configurazione Firebase.");
        return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
          setError('Credenziali non valide. Verifica email e password.');
      } else if (err.code === 'auth/too-many-requests') {
          setError('Account temporaneamente bloccato per troppi tentativi.');
      } else {
          setError('Errore di accesso al server.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Inserisci la tua email per ricevere il link.");
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await sendPasswordResetEmail(auth!, email);
      setMessage("Link di ripristino inviato! Controlla la tua casella email.");
      setTimeout(() => setIsResetMode(false), 5000);
    } catch (err: any) {
      setError("Impossibile inviare l'email. Verifica l'indirizzo inserito.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-700 animate-in fade-in zoom-in-95 duration-500">
        
        <div className="p-10">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-orange-500 p-3 rounded-2xl shadow-xl mb-4">
                <Calculator className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">GeCoLa <span className="text-orange-500">Cloud</span></h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Professional Estimating System</p>
          </div>

          <h2 className="text-xl font-bold text-slate-700 mb-6 text-center">
            {isResetMode ? 'Ripristino Password' : 'Accesso al Sistema'}
          </h2>

          <form onSubmit={isResetMode ? handleResetPassword : handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-3 animate-in slide-in-from-top-1">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            {message && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm flex items-center gap-3 animate-in slide-in-from-top-1">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                {message}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 ml-1">Email Aziendale</label>
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm bg-slate-50"
                  placeholder="email@azienda.it"
                />
              </div>
            </div>

            {!isResetMode && (
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 ml-1">Password</label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all text-sm bg-slate-50"
                    placeholder="••••••••"
                  />
                </div>
                <div className="flex justify-end mt-2">
                    <button 
                      type="button" 
                      onClick={() => setIsResetMode(true)}
                      className="text-[10px] font-black text-blue-600 uppercase hover:text-blue-800 transition-colors"
                    >
                        Password dimenticata?
                    </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2c3e50] hover:bg-[#1e293b] text-white font-black py-4 px-4 rounded-2xl shadow-lg transform transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed uppercase text-xs tracking-widest"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isResetMode ? (
                <>Invia Link di Ripristino</>
              ) : (
                <><Lock className="w-4 h-4" /> Accedi Pro</>
              )}
            </button>

            {isResetMode && (
                <button
                    type="button"
                    onClick={() => setIsResetMode(false)}
                    className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-slate-800 text-xs font-bold transition-colors pt-2"
                >
                    <ArrowLeft className="w-4 h-4" /> Torna al Login
                </button>
            )}

            {!isResetMode && (
              <>
                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                    <div className="relative flex justify-center text-[10px] uppercase font-black text-slate-300"><span className="bg-white px-4 tracking-[0.2em]">Oppure</span></div>
                </div>

                <button
                  type="button"
                  onClick={onVisitorLogin}
                  className="w-full bg-slate-50 border-2 border-slate-100 hover:border-orange-500 hover:bg-orange-50 text-slate-600 font-black py-4 px-4 rounded-2xl shadow-sm transform transition-all active:scale-95 flex items-center justify-center gap-2 uppercase text-xs tracking-widest group"
                >
                  <UserCircle className="w-5 h-5 text-slate-400 group-hover:text-orange-500" /> 
                  Versione LITE (Demo)
                </button>
              </>
            )}
          </form>

          <p className="mt-8 text-center text-[9px] text-slate-300 font-bold uppercase tracking-tighter leading-relaxed">
            GeCoLa Security Layer v5.0<br/>
            © AETERNA s.r.l. Milano
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
