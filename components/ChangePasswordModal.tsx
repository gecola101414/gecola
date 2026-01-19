
import React, { useState } from 'react';
import { updatePassword, signOut } from 'firebase/auth';
import { ref, update } from 'firebase/database';
import { auth, db } from '../firebase';
import { X, Lock, ShieldCheck, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("La password deve contenere almeno 8 caratteri.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = auth?.currentUser;
      if (!user) throw new Error("Utente non autenticato");

      // 1. Update Password in Firebase Auth
      await updatePassword(user, newPassword);

      // 2. Update flag in Database
      if (db) {
          const userRef = ref(db, `users/${user.uid}/security`);
          await update(userRef, { 
              mustChangePassword: false,
              lastPasswordChange: new Date().toISOString()
          });
      }

      onSuccess();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/requires-recent-login') {
        setError("Per motivi di sicurezza, effettua nuovamente il login prima di cambiare la password.");
        setTimeout(() => signOut(auth!), 3000);
      } else {
        setError("Errore durante l'aggiornamento. Riprova.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-xl">
      <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-700 animate-in fade-in zoom-in-95 duration-500">
        <div className="bg-blue-600 p-8 text-center text-white relative">
           <div className="bg-white/20 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                <ShieldCheck className="w-10 h-10 text-white" />
           </div>
           <h3 className="text-2xl font-black uppercase tracking-tight">Sicurezza Obbligatoria</h3>
           <p className="text-blue-100 text-sm mt-2 font-medium">Al primo accesso è necessario impostare una nuova password personale.</p>
        </div>

        <form onSubmit={handleUpdate} className="p-10 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="relative">
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 ml-1">Nuova Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-slate-50 transition-all"
                  placeholder="Minimo 8 caratteri"
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-4 text-slate-400 hover:text-blue-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 ml-1">Conferma Password</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-slate-50 transition-all"
                placeholder="Ripeti la password"
              />
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-start gap-3">
             <Lock className="w-4 h-4 text-blue-600 mt-0.5" />
             <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Scegli una password complessa che contenga lettere, numeri e simboli. Non comunicarla mai a terzi.
             </p>
          </div>

          <button
            type="submit"
            disabled={loading || !newPassword || !confirmPassword}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 px-4 rounded-2xl shadow-xl transform transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed uppercase text-sm tracking-widest"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Aggiorna Password & Accedi</>}
          </button>
          
          <button 
            type="button" 
            onClick={() => signOut(auth!)}
            className="w-full text-slate-400 hover:text-slate-600 text-xs font-bold transition-colors"
          >
            Annulla ed Esci
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
