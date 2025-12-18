
import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { Lock, Calculator, AlertCircle, Loader2 } from 'lucide-react';

const Login: React.FC = () => {
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
      // Login successful, auth state change will trigger re-render in App
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-700">
        
        {/* Header Graphic */}
        <div className="bg-[#2c3e50] p-8 text-center border-b border-orange-500 border-b-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 border-2 border-orange-500 mb-4 shadow-lg">
            <Lock className="w-8 h-8 text-orange-500" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">GeCoLa <span className="text-orange-400 font-light">Secure</span></h1>
          <p className="text-slate-400 text-xs uppercase tracking-widest mt-1">Accesso Riservato</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Email Autorizzata</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                placeholder="nome@azienda.it"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Password di Sicurezza</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2c3e50] hover:bg-[#34495e] text-white font-bold py-3 px-4 rounded-lg shadow-lg transform transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Accedi al Programma'}
            </button>
          </form>

          <div className="mt-8 text-center">
             <p className="text-xs text-gray-400 flex items-center justify-center gap-1">
               <Lock className="w-3 h-3" />
               Protetto da Google Server Authentication
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
