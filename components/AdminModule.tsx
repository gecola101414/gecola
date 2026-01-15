
import React, { useState } from 'react';
import { User, UserRole, UserPermissions } from '../types';

interface AdminModuleProps {
  users: User[];
  onUpdateUsers: (newUsers: User[], log: { action: string, details: string }) => void;
  currentUser: User;
}

const PermissionCheckbox = ({ label, checked, onChange, disabled }: { label: string, checked: boolean, onChange: (v: boolean) => void, disabled?: boolean }) => (
  <label className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${checked ? 'bg-indigo-50 border-indigo-600' : 'bg-slate-50 border-slate-100 hover:border-indigo-200'}`}>
    <input 
      type="checkbox" 
      checked={checked} 
      onChange={(e) => onChange(e.target.checked)} 
      disabled={disabled}
      className="w-5 h-5 accent-indigo-600"
    />
    <span className="text-[10px] font-black uppercase tracking-tight text-slate-700">{label}</span>
  </label>
);

const AdminModule: React.FC<AdminModuleProps> = ({ users, onUpdateUsers, currentUser }) => {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [viewingResponsibility, setViewingResponsibility] = useState<User | null>(null);

  const canEdit = currentUser.permissions.canAdminUsers;

  const handleSaveUser = () => {
    if (!editingUser) return;
    let updatedUsers = !users.find(u => u.id === editingUser.id) ? [...users, editingUser] : users.map(u => u.id === editingUser.id ? editingUser : u);
    onUpdateUsers(updatedUsers, { action: 'GESTIONE STAFF', details: `Aggiornato profilo staff per ${editingUser.username}.` });
    setEditingUser(null);
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500 font-['Inter'] overflow-hidden">
      <div className="flex justify-between items-center bg-slate-900 p-8 rounded-[3rem] shadow-2xl border border-slate-800 flex-shrink-0">
        <div>
          <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter leading-none">Anagrafica Staff DNA</h2>
          <p className="text-indigo-400 text-[9px] font-black uppercase tracking-[0.3em] mt-2">Trasparenza & Accreditamento Bio-Digitale</p>
        </div>
        {canEdit && (
          <button 
            onClick={() => setEditingUser({
              id: `u-${Date.now()}`, username: '', passwordHash: '123456', role: UserRole.EDITOR, workgroup: '',
              permissions: { canManageFunds: false, canManageWorks: false, canManagePlanning: false, canAccessAudit: false, canAdminUsers: false, canExportData: false },
              isFirstLogin: true, mustChangePassword: true
            })}
            className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-indigo-700 transition-all border-b-[6px] border-indigo-900"
          >
            Nuovo Operatore +
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {users.map(user => (
            <div key={user.id} className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-50 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all group relative overflow-hidden">
               <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-3xl bg-slate-50 border-2 border-slate-100 flex items-center justify-center text-slate-300 font-black text-2xl overflow-hidden shadow-inner">
                    {user.profilePhoto ? <img src={user.profilePhoto} className="w-full h-full object-cover" /> : user.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter leading-none">{user.username}</h3>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase mt-1">[{user.workgroup || 'ESTERN'}]</p>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-2 mb-6">
                  <button 
                    onClick={() => setViewingResponsibility(user)}
                    className="py-3 bg-slate-950 text-white rounded-xl font-black uppercase text-[8px] tracking-widest shadow-md hover:bg-slate-800 transition-all"
                  >
                    Vedi Video Accreditamento 🎥
                  </button>
                  {canEdit && (
                    <button 
                      onClick={() => setEditingUser(user)}
                      className="py-3 bg-indigo-50 text-indigo-700 rounded-xl font-black uppercase text-[8px] tracking-widest border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all"
                    >
                      Modifica Permessi ⚙️
                    </button>
                  )}
               </div>

               <div className="space-y-2">
                  <div className="flex justify-between items-center text-[8px] font-black text-slate-400 uppercase">
                     <span>Ruolo:</span>
                     <span className="text-slate-900 italic">{user.role}</span>
                  </div>
                  <div className="flex justify-between items-center text-[8px] font-black text-slate-400 uppercase">
                     <span>Accreditato:</span>
                     <span className={user.accreditationVideo ? 'text-emerald-600' : 'text-rose-600'}>{user.accreditationVideo ? 'SÌ (DNA)' : 'NO'}</span>
                  </div>
               </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODALE VISUALIZZAZIONE VIDEO (PER TUTTI) */}
      {viewingResponsibility && (
        <div className="fixed inset-0 z-[700] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="bg-white rounded-[4rem] p-10 shadow-2xl max-w-2xl w-full border border-slate-200">
            <h3 className="text-xl font-black uppercase italic tracking-tighter mb-4">Accreditamento Forense: {viewingResponsibility.username}</h3>
            {viewingResponsibility.accreditationVideo ? (
               <video src={viewingResponsibility.accreditationVideo} autoPlay controls className="w-full aspect-video rounded-3xl bg-black mb-6 shadow-2xl" />
            ) : (
              <div className="aspect-video bg-slate-50 rounded-3xl flex flex-col items-center justify-center mb-6 border-2 border-dashed border-slate-200 text-slate-300">
                 <span className="text-5xl mb-4">⚠️</span>
                 <p className="text-xs font-black uppercase tracking-widest italic">Video non presente nel DNA</p>
              </div>
            )}
            <button onClick={() => setViewingResponsibility(null)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg">Chiudi Fascicolo Bio-Digitale</button>
          </div>
        </div>
      )}

      {/* MODALE EDITING (SOLO ADMIN) */}
      {editingUser && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-2xl rounded-[4rem] shadow-2xl p-12 border border-slate-200 relative">
             <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
             <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter mb-8">Configurazione Staff DNA</h3>
             <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <input type="text" placeholder="Nome Operatore" value={editingUser.username} onChange={e => setEditingUser({...editingUser, username: e.target.value})} className="px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none" />
                  <input type="text" placeholder="Ufficio" value={editingUser.workgroup} onChange={e => setEditingUser({...editingUser, workgroup: e.target.value.toUpperCase()})} className="px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none" />
                </div>
                <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none">
                   {Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-3">
                   <PermissionCheckbox label="Fondi (IDV)" checked={editingUser.permissions.canManageFunds} onChange={v => setEditingUser({...editingUser, permissions: {...editingUser.permissions, canManageFunds: v}})} />
                   <PermissionCheckbox label="Lavori" checked={editingUser.permissions.canManageWorks} onChange={v => setEditingUser({...editingUser, permissions: {...editingUser.permissions, canManageWorks: v}})} />
                   <PermissionCheckbox label="Obiettivi" checked={editingUser.permissions.canManagePlanning} onChange={v => setEditingUser({...editingUser, permissions: {...editingUser.permissions, canManagePlanning: v}})} />
                   <PermissionCheckbox label="Staff" checked={editingUser.permissions.canAdminUsers} onChange={v => setEditingUser({...editingUser, permissions: {...editingUser.permissions, canAdminUsers: v}})} disabled={editingUser.id === currentUser.id} />
                </div>
             </div>
             <div className="flex gap-4 mt-10">
                <button onClick={() => setEditingUser(null)} className="flex-1 py-4 text-slate-400 font-black uppercase text-[10px]">Annulla</button>
                <button onClick={handleSaveUser} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl">Sigilla Profilo</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminModule;
