
import React, { useState, useRef } from 'react';
import { WorkOrder, BidResult } from '../types';
import { VoiceInput } from './VoiceInput';

interface BidModalProps {
  order: WorkOrder;
  onSave: (bid: BidResult) => void;
  onClose: () => void;
}

const BidModal: React.FC<BidModalProps> = ({ order, onSave, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bidData, setBidData] = useState<BidResult>({
    winner: order.winner || '',
    bidValue: order.contractValue || order.estimatedValue,
    date: new Date().toISOString().split('T')[0],
    contractPdf: order.contractPdf
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Il file è troppo grande (max 2MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setBidData({
        ...bidData,
        contractPdf: { name: file.name, data: event.target?.result as string }
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(bidData);
  };

  const economy = order.estimatedValue - (bidData.bidValue || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
      <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-200">
        <div className="bg-[#0f172a] px-8 py-8 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16"></div>
          <div className="relative z-10">
            <h3 className="text-2xl font-black text-white tracking-tighter uppercase">Scheda Affidamento Lavori</h3>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-[10px] font-black bg-indigo-600 text-white px-3 py-1 rounded-full uppercase tracking-widest">{order.orderNumber}</span>
              <p className="text-indigo-200 text-xs font-medium truncate">{order.description}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Nome Ditta Aggiudicataria</label>
              <VoiceInput
                value={bidData.winner}
                onChange={(v) => setBidData({ ...bidData, winner: v })}
                placeholder="es. Costruzioni Rossi Srl"
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 outline-none font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Importo di Contratto (€)</label>
              <VoiceInput
                type="number"
                value={bidData.bidValue}
                onChange={(v) => setBidData({ ...bidData, bidValue: Number(v) })}
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 outline-none font-black text-indigo-600 text-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Documento di Affidamento / Contratto (PDF)</label>
            <input type="file" accept="application/pdf" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`w-full py-4 border-2 border-dashed rounded-2xl transition-all flex items-center justify-center gap-3 ${
                bidData.contractPdf ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-indigo-300'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              <span className="text-xs font-black uppercase tracking-widest">{bidData.contractPdf ? bidData.contractPdf.name : 'Carica Atto Affidamento'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
             <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Data di Aggiudicazione</label>
              <input
                type="date"
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 outline-none font-bold text-slate-700"
                value={bidData.date}
                onChange={(e) => setBidData({ ...bidData, date: e.target.value })}
              />
            </div>
            <div className={`p-5 rounded-2xl border flex flex-col justify-center ${economy >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
              <span className={`text-[9px] font-black uppercase mb-1 ${economy >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                Economia di Gara
              </span>
              <p className={`text-xl font-black ${economy >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                €{Math.abs(economy).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-5 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-6 py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors">Annulla</button>
            <button type="submit" className="px-10 py-4 bg-[#0f172a] text-white rounded-2xl hover:bg-slate-800 font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95">Conferma Affidamento</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BidModal;
