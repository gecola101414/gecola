import { 
  X, Save, Folder, Tag, Palette, Check, Info, ListFilter, LayoutGrid, Sparkles,
  Lock, Unlock, Lightbulb, LightbulbOff, Trash2, Copy, AlertTriangle, Zap,
  ChevronLeft, ChevronRight, Award, HelpCircle
} from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { Category } from '../types';
import { VIVID_COLORS, WBS_SUGGESTIONS, SOA_CATEGORIES } from '../constants';

interface CategoryEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, isSuper: boolean, color: string, soa?: string) => void;
  onDelete?: (code: string) => void;
  onToggleLock?: (code: string) => void;
  onToggleEnabled?: (code: string) => void;
  onDuplicate?: (code: string) => void;
  initialData?: Category | null;
  nextWbsCode?: string;
  forcedIsSuper?: boolean;
}

const CategoryEditModal: React.FC<CategoryEditModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  onDelete,
  onToggleLock,
  onToggleEnabled,
  onDuplicate,
  initialData, 
  nextWbsCode, 
  forcedIsSuper 
}) => {
  const [name, setName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3B82F6');
  const [selectedSoa, setSelectedSoa] = useState('OG1');
  const [colorPageIndex, setColorPageIndex] = useState(0);

  const isSuperMode = forcedIsSuper !== undefined ? forcedIsSuper : (initialData?.isSuperCategory || false);
  const itemsPerPage = 5;
  const totalPages = Math.ceil(VIVID_COLORS.length / itemsPerPage);

  const currentColors = useMemo(() => {
    const start = colorPageIndex * itemsPerPage;
    return VIVID_COLORS.slice(start, start + itemsPerPage);
  }, [colorPageIndex]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name);
        setSelectedColor(initialData.color || '#3B82F6');
        setSelectedSoa(initialData.soaCategory || 'OG1');
        const colorIdx = VIVID_COLORS.indexOf(initialData.color || '');
        if (colorIdx !== -1) {
            setColorPageIndex(Math.floor(colorIdx / itemsPerPage));
        }
      } else {
        setName('');
        setSelectedColor('#475569');
        setSelectedSoa('OG1');
        setColorPageIndex(0);
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name, isSuperMode, isSuperMode ? selectedColor : '', selectedSoa);
      onClose();
    }
  };

  const handleActionWithAutoClose = (action: (code: string) => void) => {
    if (initialData && action) {
      action(initialData.code);
      onClose();
    }
  };

  const nextColorPage = () => setColorPageIndex((prev) => (prev + 1) % totalPages);
  const prevColorPage = () => setColorPageIndex((prev) => (prev - 1 + totalPages) % totalPages);

  const displayCode = initialData ? initialData.code : nextWbsCode;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] shadow-[0_20px_60px_rgba(0,0,0,0.4)] w-full max-w-3xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 flex flex-col md:flex-row h-auto max-h-[90vh]">
        
        <div className={`w-full md:w-64 p-6 flex flex-col transition-colors duration-700 text-white ${isSuperMode ? 'bg-indigo-600' : 'bg-slate-800'}`}>
          <div className="mb-6">
             <div className="bg-white/20 p-3 rounded-[1rem] w-fit mb-4 shadow-inner">
                {isSuperMode ? <Folder className="w-8 h-8" /> : <LayoutGrid className="w-8 h-8" />}
             </div>
             <h2 className="text-xl font-black uppercase tracking-tighter leading-tight">
                {isSuperMode ? 'Super Nodo' : 'Modulo WBS'}
             </h2>
             <div className="h-1 w-12 bg-white/40 rounded-full mt-2"></div>
          </div>

          <div className="space-y-4 flex-1">
             <div className="bg-white/10 p-4 rounded-xl border border-white/5 group/help relative">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-indigo-200 mb-2 flex items-center gap-2">
                  <HelpCircle className="w-3 h-3 text-orange-400" /> Manuale Rapido
                </h4>
                <p className="text-[10px] font-medium leading-relaxed opacity-90 italic">
                  {isSuperMode 
                    ? "Le Supercategorie organizzano il progetto. Definisci un colore per identificarle visivamente nella sidebar." 
                    : "Ogni WBS deve essere qualificata SOA. Questo permette al sistema di generare il riepilogo per gare d'appalto."}
                </p>
             </div>

             {initialData && (
                <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-indigo-200 mb-3 flex items-center gap-2"><Zap className="w-3 h-3"/> Azioni Rapide</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            type="button"
                            onClick={() => handleActionWithAutoClose(onToggleLock!)}
                            className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all border ${initialData.isLocked ? 'bg-red-600 border-red-500 shadow-inner' : 'bg-white/10 border-white/10 hover:bg-white/20'}`}
                        >
                            {initialData.isLocked ? <Lock className="w-4 h-4 text-white" /> : <Unlock className="w-4 h-4 text-slate-300" />}
                            <span className="text-[8px] font-black uppercase tracking-widest">Blocco</span>
                        </button>
                        
                        <button 
                            type="button"
                            onClick={() => handleActionWithAutoClose(onToggleEnabled!)}
                            className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all border ${initialData.isEnabled !== false ? 'bg-amber-50 border-amber-600 shadow-inner' : 'bg-white/10 border-white/10 hover:bg-white/20'}`}
                        >
                            {initialData.isEnabled !== false ? <Lightbulb className="w-4 h-4 text-white" /> : <LightbulbOff className="w-4 h-4 text-slate-300" />}
                            <span className="text-[8px] font-black uppercase tracking-widest">Stato</span>
                        </button>

                        <button 
                            type="button"
                            onClick={() => { if(initialData) { onDuplicate?.(initialData.code); onClose(); } }}
                            className="p-3 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all border bg-white/10 border-white/10 hover:bg-blue-600 hover:border-blue-50"
                        >
                            <Copy className="w-4 h-4 text-slate-300" />
                            <span className="text-[8px] font-black uppercase tracking-widest">Copia</span>
                        </button>

                        <button 
                            type="button"
                            onClick={() => { if(initialData) { onDelete?.(initialData.code); onClose(); } }}
                            className="p-3 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all border bg-white/10 border-white/10 hover:bg-red-600 hover:border-red-500"
                        >
                            <Trash2 className="w-4 h-4 text-slate-300" />
                            <span className="text-[8px] font-black uppercase tracking-widest">Elimina</span>
                        </button>
                    </div>
                </div>
             )}
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 text-[8px] font-black uppercase tracking-widest opacity-40 text-center shrink-0">
            Steel Engine by Gimondo
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
          
          <div className="px-6 py-4 flex justify-between items-center border-b border-slate-100 bg-white">
              <div>
                <h3 className="font-black uppercase text-[9px] tracking-widest text-slate-400 mb-1">
                   {initialData ? 'Modifica Elemento' : `Nuovo Elemento`}
                </h3>
                <p className="text-slate-800 text-lg font-black tracking-tighter">
                   Identificativo: <span className="text-indigo-600 font-mono">{displayCode}</span>
                </p>
              </div>
              <button onClick={onClose} className="hover:bg-slate-100 p-1.5 rounded-xl transition-all">
                <X className="w-6 h-6 text-slate-400" />
              </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
            
            <div className="space-y-2">
              <label className="block text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">
                Nome Categoria / Capitolo
              </label>
              <div className="relative group">
                <Tag className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" />
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border-2 border-slate-200 rounded-xl pl-11 pr-5 py-3.5 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none font-black text-slate-700 bg-white transition-all text-sm placeholder:font-normal shadow-sm"
                  placeholder={isSuperMode ? "Es: OPERE STRUTTURALI" : "Inserisci nome..."}
                  autoFocus
                />
              </div>
            </div>

            {!isSuperMode && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 ml-1">
                          <Award className="w-3 h-3 text-purple-600" /> Qualificazione SOA
                        </label>
                        <select 
                            value={selectedSoa} 
                            onChange={(e) => setSelectedSoa(e.target.value)}
                            className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-xs bg-white text-slate-700 outline-none focus:border-purple-500 transition-all"
                        >
                            {SOA_CATEGORIES.map(soa => (
                                <option key={soa.code} value={soa.code}>{soa.code} - {soa.desc}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 ml-1">
                          <ListFilter className="w-3 h-3" /> Suggerimenti Rapidi
                        </label>
                        <div className="grid grid-cols-1 gap-1">
                             <select 
                                onChange={(e) => setName(e.target.value)}
                                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-xs bg-slate-50 text-slate-500 outline-none hover:border-indigo-300 transition-all"
                             >
                                <option value="">Seleziona un titolo standard...</option>
                                {WBS_SUGGESTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                        </div>
                    </div>
                </div>
              </div>
            )}

            {isSuperMode && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex justify-between items-center ml-1">
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        <Palette className="w-3 h-3" /> Tavolozza Colori Identificativi
                    </label>
                    <span className="text-[9px] font-black text-slate-300 uppercase">Pagina {colorPageIndex + 1} / {totalPages}</span>
                </div>
                
                <div className="flex items-center gap-2">
                    <button type="button" onClick={prevColorPage} className="p-2 bg-white rounded-full border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    
                    <div className="flex-1 flex justify-between items-center gap-3 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                        {currentColors.map((color) => (
                            <button
                            key={color}
                            type="button"
                            onClick={() => setSelectedColor(color)}
                            className={`w-9 h-9 rounded-full border-[3px] transition-all transform hover:scale-110 active:scale-90 flex items-center justify-center shadow-md ${selectedColor === color ? 'border-slate-800 scale-110' : 'border-white hover:border-slate-200'}`}
                            style={{ backgroundColor: color }}
                            >
                            {selectedColor === color && <Check className="w-4 h-4 text-white drop-shadow-md" />}
                            </button>
                        ))}
                    </div>

                    <button type="button" onClick={nextColorPage} className="p-2 bg-white rounded-full border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
              </div>
            )}

            {initialData?.isLocked && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-4 text-red-700">
                    <AlertTriangle className="w-6 h-6 flex-shrink-0" />
                    <p className="text-[11px] font-bold uppercase leading-tight">Elemento bloccato. Sblocca a sinistra per modificare.</p>
                </div>
            )}
          </form>

          <div className="p-6 bg-white border-t border-slate-100 flex justify-end gap-3 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-colors tracking-[0.2em]"
            >
              Annulla
            </button>
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || initialData?.isLocked}
              className={`px-10 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center gap-2 transform transition-all active:scale-95 disabled:opacity-50 disabled:grayscale text-white ${isSuperMode ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-800 hover:bg-slate-900'}`}
            >
              <Save className="w-4 h-4" />
              Salva Capitolo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoryEditModal;