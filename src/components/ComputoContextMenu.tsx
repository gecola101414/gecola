import React, { useEffect, useRef } from 'react';
import { 
  Plus, Sigma, CopyPlus, PlusCircle, MinusCircle, Trash2, X, Power, PowerOff, Lightbulb, Grid3X3
} from 'lucide-react';
import { Article, Measurement } from '../types';

export interface ContextMenuProps {
  x: number;
  y: number;
  article: Article;
  measurement?: Measurement | null;
  globalIndex?: number;
  isSafety?: boolean;
  isLocked?: boolean;
  onAddMeasurement: (articleId: string) => void;
  onAddSubtotal: (articleId: string) => void;
  onAddSameMeasure: (articleId: string, sourceMeasurementId?: string) => void;
  onToggleDeduction?: (mId: string) => void;
  onSetMeasurementType?: (articleId: string, mId: string, type: 'positive' | 'deduction') => void;
  onAddMeasurementWithType?: (articleId: string, type: 'positive' | 'deduction') => void;
  onDeleteMeasurement?: (articleId: string, mId: string) => void;
  onToggleArticleEnabled?: (articleId: string) => void;
  onOpenRebarCalculator?: (articleId: string) => void;
  onClose: () => void;
}

export const ComputoContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  article,
  measurement,
  globalIndex,
  isSafety = false,
  isLocked = false,
  onAddMeasurement,
  onAddSubtotal,
  onAddSameMeasure,
  onToggleDeduction,
  onSetMeasurementType,
  onAddMeasurementWithType,
  onDeleteMeasurement,
  onToggleArticleEnabled,
  onOpenRebarCalculator,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleMenuContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const menuWidth = 250;
  const menuHeight = 270;
  const posX = Math.max(10, Math.min(x, window.innerWidth - menuWidth - 15));
  const posY = Math.max(10, Math.min(y, window.innerHeight - menuHeight - 15));

  const isDeduction = measurement?.type === 'deduction';
  const isSubtotal = measurement?.type === 'subtotal';

  const handleSetType = (type: 'positive' | 'deduction') => {
    if (measurement) {
      if (onSetMeasurementType) {
        onSetMeasurementType(article.id, measurement.id, type);
      } else if (onToggleDeduction) {
        if ((type === 'deduction' && !isDeduction) || (type === 'positive' && isDeduction)) {
          onToggleDeduction(measurement.id);
        }
      }
    } else if (onAddMeasurementWithType) {
      onAddMeasurementWithType(article.id, type);
    } else {
      onAddMeasurement(article.id);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      onContextMenu={handleMenuContextMenu}
      style={{ left: `${posX}px`, top: `${posY}px` }}
      className="fixed z-[99999] w-[250px] bg-slate-900/95 backdrop-blur-xl border border-slate-700/90 shadow-[0_20px_50px_rgba(0,0,0,0.65)] rounded-2xl p-2.5 text-white select-none ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header Info */}
      <div className={`px-2.5 py-1.5 rounded-xl mb-2 flex items-center justify-between border ${isSafety ? 'bg-orange-950/60 border-orange-500/30 text-orange-200' : 'bg-blue-950/60 border-blue-500/30 text-blue-200'}`}>
        <div className="flex items-center gap-2 overflow-hidden pr-2">
          <div className={`w-5 h-5 rounded-md flex items-center justify-center font-mono font-black text-[10px] text-white flex-shrink-0 ${isSafety ? 'bg-orange-600' : 'bg-blue-600'}`}>
            {globalIndex !== undefined ? globalIndex : '#'}
          </div>
          <div className="truncate">
            <div className="text-[11px] font-black uppercase tracking-tight text-white truncate">
              {article.code}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          title="Chiudi menu"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        {/* 1. Nuovo Rigo */}
        <button
          disabled={isLocked}
          onClick={() => {
            onAddMeasurement(article.id);
            onClose();
          }}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-xs font-bold text-slate-100 hover:bg-emerald-600/90 hover:text-white transition-all group disabled:opacity-40 disabled:pointer-events-none"
        >
          <div className="flex items-center gap-2.5">
            <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
              <Plus className="w-4 h-4" />
            </span>
            <span>Nuovo Rigo</span>
          </div>
          <span className="text-[9px] font-mono opacity-60 group-hover:opacity-100 bg-white/10 px-1.5 py-0.5 rounded">Invio</span>
        </button>

        {/* 2. Somma Parziale */}
        <button
          disabled={isLocked}
          onClick={() => {
            onAddSubtotal(article.id);
            onClose();
          }}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-xs font-bold text-slate-100 hover:bg-amber-600/90 hover:text-white transition-all group disabled:opacity-40 disabled:pointer-events-none"
        >
          <div className="flex items-center gap-2.5">
            <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
              <Sigma className="w-4 h-4" />
            </span>
            <span>Somma Parziale</span>
          </div>
          <span className="text-[9px] font-mono opacity-60 group-hover:opacity-100 bg-white/10 px-1.5 py-0.5 rounded">Σ</span>
        </button>

        {/* 3. Stessa Somma / Stessa Misura */}
        <button
          disabled={isLocked || article.measurements.length === 0}
          onClick={() => {
            onAddSameMeasure(article.id, measurement?.id);
            onClose();
          }}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-xs font-bold text-slate-100 hover:bg-cyan-600/90 hover:text-white transition-all group disabled:opacity-40 disabled:pointer-events-none"
        >
          <div className="flex items-center gap-2.5">
            <span className="p-1 rounded-lg bg-cyan-500/20 text-cyan-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
              <CopyPlus className="w-4 h-4" />
            </span>
            <span>Stessa Somma</span>
          </div>
          <span className="text-[9px] font-mono opacity-60 group-hover:opacity-100 bg-white/10 px-1.5 py-0.5 rounded">Clona</span>
        </button>

        {/* Armatura 3D & Ferri / Staffe */}
        {onOpenRebarCalculator && (
          <button
            disabled={isLocked}
            onClick={() => {
              onOpenRebarCalculator(article.id);
              onClose();
            }}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-xs font-bold text-slate-100 hover:bg-orange-600/90 hover:text-white transition-all group disabled:opacity-40 disabled:pointer-events-none"
          >
            <div className="flex items-center gap-2.5">
              <span className="p-1 rounded-lg bg-orange-500/20 text-orange-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                <Grid3X3 className="w-4 h-4" />
              </span>
              <span>Armatura 3D Ferri/Staffe</span>
            </div>
            <span className="text-[9px] font-mono opacity-60 group-hover:opacity-100 bg-white/10 px-1.5 py-0.5 rounded">3D</span>
          </button>
        )}

        {/* 4. Positivi e Negativi */}
        <div className="pt-1.5 pb-0.5">
          <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 px-1 mb-1">
            Segno Misura
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              disabled={isLocked || isSubtotal}
              onClick={() => handleSetType('positive')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[11px] font-bold transition-all border ${
                measurement && !isDeduction && !isSubtotal
                  ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/50 shadow-sm' 
                  : 'bg-slate-800/90 border-slate-700/80 text-slate-300 hover:text-white hover:bg-emerald-700/50 hover:border-emerald-600'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>Positivo (+)</span>
            </button>
            <button
              disabled={isLocked || isSubtotal}
              onClick={() => handleSetType('deduction')}
              className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[11px] font-bold transition-all border ${
                measurement && isDeduction
                  ? 'bg-rose-600/30 border-rose-500 text-rose-300 ring-2 ring-rose-500/50 shadow-sm' 
                  : 'bg-slate-800/90 border-slate-700/80 text-slate-300 hover:text-white hover:bg-rose-700/50 hover:border-rose-600'
              }`}
            >
              <MinusCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Negativo (-)</span>
            </button>
          </div>
        </div>

        {/* 5. Elimina Rigo (se invocato su un rigo esistente) */}
        {measurement && onDeleteMeasurement && (
          <div className="pt-1">
            <button
              disabled={isLocked}
              onClick={() => {
                onDeleteMeasurement(article.id, measurement.id);
                onClose();
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left text-xs font-semibold text-rose-400 hover:bg-rose-600/80 hover:text-white transition-all group disabled:opacity-40 disabled:pointer-events-none"
            >
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-rose-500/20 text-rose-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </span>
                <span>Elimina Rigo</span>
              </div>
              <span className="text-[9px] font-mono opacity-60 group-hover:opacity-100 bg-white/10 px-1.5 py-0.5 rounded">Canc</span>
            </button>
          </div>
        )}

        {/* 6. Accendi / Spegni Singola Voce (Gestione Sottocomputo Subappalto) */}
        {onToggleArticleEnabled && (
          <div className="pt-1.5 border-t border-slate-700/60 mt-1">
            <button
              onClick={() => {
                onToggleArticleEnabled(article.id);
                onClose();
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-xs font-bold transition-all group ${
                article.isEnabled === false
                  ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-white border border-amber-500/40'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
              }`}
              title={article.isEnabled === false ? "Riattiva voce nel computo" : "Disattiva ed escludi da sottocomputi/subappalto"}
            >
              <div className="flex items-center gap-2.5">
                <span className={`p-1 rounded-lg ${article.isEnabled === false ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-700 text-slate-400'} group-hover:bg-white/20 group-hover:text-white transition-colors`}>
                  {article.isEnabled === false ? <Power className="w-3.5 h-3.5 text-amber-400" /> : <PowerOff className="w-3.5 h-3.5 text-slate-400" />}
                </span>
                <span>{article.isEnabled === false ? 'Riattiva Voce' : 'Spegni / Escludi Voce'}</span>
              </div>
              <span className={`text-[8.5px] font-mono uppercase px-1.5 py-0.5 rounded ${article.isEnabled === false ? 'bg-amber-400/30 text-amber-200' : 'bg-slate-700 text-slate-400'}`}>
                {article.isEnabled === false ? 'OFF' : 'ON'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
