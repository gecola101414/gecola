
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

  const defaultPermissions: UserPermissions = {
    canManageFunds: false,
    canManageWorks: false,
    canManagePlanning: false,
    canAccessAudit: false,
    canAdminUsers: false,
    canExportData: false
  };

  const handleSaveUser = () => {
    if (!editingUser) return;
    
    let updatedUsers: User[];
    let action = '';
    let details = '';

    const isNew = !users.find(u => u.id === editingUser.id);
    
    if (isNew) {
      updatedUsers = [...users, editingUser];
      action = 'NUOVO OPERATORE';
      details = `Creato profilo per ${editingUser.username}. Ruolo: ${editingUser.role}.`;
    } else {
      updatedUsers = users.map(u => u.id === editingUser.id ? editingUser : u);
      action = 'MODIFICA PERMESSI';
      details = `Aggiornata configurazione staff per ${editingUser.username}. Permessi attivi: ${Object.entries(editingUser.permissions).filter(([_,v]) => v).map(([k]) => k).join(', ')}`;
    }

    onUpdateUsers(updatedUsers, { action, details });
    setEditingUser(null);
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500 font-['Inter'] overflow-hidden">
      <div className="flex justify-between items-center bg-slate-900 p-8 rounded-[3rem] shadow-2xl border border-slate-800 flex-shrink-0">
        <div>
          <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter leading-none">Gestione Staff DNA</h2>
          <p className="text-indigo-400 text-[9px] font-black uppercase tracking-[0.3em] mt-2">Controllo Accessi & Privilegi Forensi</p>
        </div>
        <button 
          onClick={() => setEditingUser({
            id: `u-${Date.now()}`,
            username: '',
            passwordHash: '123456',
            role: UserRole.EDITOR,
            workgroup: '',
            permissions: { ...defaultPermissions },
            isFirstLogin: true
          })}
          className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-indigo-700 transition-all border-b-[6px] border-indigo-900 active:translate-y-1"
        >
          Aggiungi Operatore +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {users.map(user => (
            <div key={user.id} className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-50 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all group relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5 font-black text-6xl italic select-none">{user.role.charAt(0)}</div>
               
               <div className="flex items-center gap-4 mb-6 relative z-10">
                  <div className="w-16 h-16 rounded-3xl bg-slate-50 border-2 border-slate-100 flex items-center justify-center text-slate-300 font-black text-2xl overflow-hidden shadow-inner">
                    {user.profilePhoto ? <img src={user.profilePhoto} className="w-full h-full object-cover" /> : user.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter leading-none">{user.username}</h3>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase mt-1">[{user.workgroup || 'UFFICIO NON ASSEGNATO'}]</p>
                  </div>
               </div>

               <div className="space-y-4 mb-8">
                  <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                     <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ruolo Strategico</span>
                     <span className="text-[9px] font-black text-slate-900 uppercase italic">{user.role}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                     <div className={`text-[7px] font-black px-2 py-1 rounded border ${user.permissions.canManageFunds ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>FONDI IDV</div>
                     <div className={`text-[7px] font-black px-2 py-1 rounded border ${user.permissions.canManageWorks ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>LAVORI</div>
                     <div className={`text-[7px] font-black px-2 py-1 rounded border ${user.permissions.canAdminUsers ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>STAFF</div>
                  </div>
               </div>

               <button 
                 onClick={() => setEditingUser(user)}
                 className="w-full py-4 bg-slate-900 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-indigo-600 transition-all shadow-md"
               >
                 Modifica Permessi ⚙️
               </button>
            </div>
          ))}
        </div>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-[600] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-2xl rounded-[4rem] shadow-2xl p-12 border border-slate-200 flex flex-col gap-8 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
             
             <div>
               <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Profilo Operatore DNA</h3>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Configurazione Privilegi e Identità</p>
             </div>

             <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Nome Operatore</label>
                    <input 
                      type="text" 
                      value={editingUser.username}
                      onChange={e => setEditingUser({...editingUser, username: e.target.value})}
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-600"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Ufficio / Reparto</label>
                    <input 
                      type="text" 
                      value={editingUser.workgroup}
                      onChange={e => setEditingUser({...editingUser, workgroup: e.target.value.toUpperCase()})}
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-600 uppercase"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                   <label className="text-[9px] font-black uppercase text-slate-400 ml-4">Ruolo Istituzionale</label>
                   <select 
                     value={editingUser.role}
                     onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                     className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-600"
                   >
                     {Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}
                   </select>
                </div>

                <div className="space-y-3">
                   <label className="text-[9px] font-black uppercase text-slate-400 ml-4 tracking-widest">Matrice dei Permessi (Spuntare Azioni Abilitate)</label>
                   <div className="grid grid-cols-2 gap-3">
                      <PermissionCheckbox 
                        label="Gestione Fondi (IDV)" 
                        checked={editingUser.permissions.canManageFunds}
                        onChange={v => setEditingUser({...editingUser, permissions: {...editingUser.permissions, canManageFunds: v}})}
                      />
                      <PermissionCheckbox 
                        label="Ciclo Vita Lavori" 
                        checked={editingUser.permissions.canManageWorks}
                        onChange={v => setEditingUser({...editingUser, permissions: {...editingUser.permissions, canManageWorks: v}})}
                      />
                      <PermissionCheckbox 
                        label="Pianificazioni & Obiettivi" 
                        checked={editingUser.permissions.canManagePlanning}
                        onChange={v => setEditingUser({...editingUser, permissions: {...editingUser.permissions, canManagePlanning: v}})}
                      />
                      <PermissionCheckbox 
                        label="Accesso Registro DNA" 
                        checked={editingUser.permissions.canAccessAudit}
                        onChange={v => setEditingUser({...editingUser, permissions: {...editingUser.permissions, canAccessAudit: v}})}
                      />
                      <PermissionCheckbox 
                        label="Gestione Staff & Permessi" 
                        checked={editingUser.permissions.canAdminUsers}
                        onChange={v => setEditingUser({...editingUser, permissions: {...editingUser.permissions, canAdminUsers: v}})}
                        disabled={editingUser.id === currentUser.id} // Non toglierti i permessi da solo
                      />
                      <PermissionCheckbox 
                        label="Esportazione Dati" 
                        checked={editingUser.permissions.canExportData}
                        onChange={v => setEditingUser({...editingUser, permissions: {...editingUser.permissions, canExportData: v}})}
                      />
                   </div>
                </div>
             </div>

             <div className="flex gap-4 pt-6">
                <button onClick={() => setEditingUser(null)} className="flex-1 py-5 text-slate-400 font-black uppercase text-[10px] tracking-widest">Annulla</button>
                <button onClick={handleSaveUser} className="flex-[2] py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-indigo-700 transition-all">Salva ed Applica DNA</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminModule;
