
import React, { useState, useRef } from 'react';
import { WorkOrder, PaymentResult } from '../types';
import { VoiceInput } from './VoiceInput';

interface PaymentModalProps {
  order: WorkOrder;
  onSave: (payment: PaymentResult) => void;
  onClose: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ order, onSave, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paymentData, setPaymentData] = useState<PaymentResult>({
    paidValue: order.paidValue || order.contractValue || order.estimatedValue,
    invoiceDate: new Date().toISOString().split('T')[0],
    invoiceNumber: '',
    invoicePdf: order.invoicePdf,
    creGenerated: true, // Sempre vero per automazione
    creDate: order.creDate || new Date().toISOString().split('T')[0]
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPaymentData({
        ...paymentData,
        invoicePdf: { name: file.name, data: event.target?.result as string }
      });
    };
    reader.readAsDataURL(file);
  };

  const economy = (order.contractValue || order.estimatedValue) - paymentData.paidValue;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-200">
        <div className="bg-emerald-600 px-8 py-8 relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
          <div className="relative z-10">
            <h3 className="text-2xl font-black text-white tracking-tighter uppercase">Liquidazione & Chiusura Pratica</h3>
            <p className="text-emerald-100 text-xs font-bold uppercase tracking-widest mt-1">Caricamento Fattura e Chiusura Contabile</p>
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onSave(paymentData); }} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Numero Fattura / Nota</label>
              <VoiceInput
                value={paymentData.invoiceNumber}
                onChange={(v) => setPaymentData({ ...paymentData, invoiceNumber: v })}
                placeholder="es. FATT-2024-99"
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Importo Liquidato (€)</label>
              <VoiceInput
                type="number"
                value={paymentData.paidValue}
                onChange={(v) => setPaymentData({ ...paymentData, paidValue: Number(v) })}
                required
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none font-black text-emerald-600 text-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Allegato Fattura (PDF)</label>
              <input type="file" accept="application/pdf" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-full py-4 border-2 border-dashed rounded-2xl transition-all flex items-center justify-center gap-3 ${
                  paymentData.invoicePdf ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-emerald-300'
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span className="text-xs font-black uppercase tracking-widest truncate px-4">{paymentData.invoicePdf ? paymentData.invoicePdf.name : 'Carica Fattura'}</span>
              </button>
            </div>
            <div className={`p-5 rounded-2xl border flex flex-col justify-center ${economy >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
              <span className="text-[9px] font-black uppercase text-slate-400 mb-1">Risparmio finale</span>
              <p className={`text-xl font-black ${economy >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>€{economy.toLocaleString()}</p>
            </div>
          </div>

          <div className="p-6 bg-slate-900 rounded-[2rem] border-2 border-emerald-500/30 text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-20 text-emerald-500 group-hover:scale-110 transition-transform">
              <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            </div>
            <div className="flex items-start justify-between relative z-10">
              <div className="flex-1">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-2">Automazione Documentale Attiva</h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">Il sistema genererà automaticamente il <strong>Certificato di Regolare Esecuzione (CRE)</strong> con i dati contabili inseriti.</p>
                <div className="flex items-center gap-4">
                   <div className="bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-emerald-500/30">
                     CRE PRONTO PER STAMPA
                   </div>
                   <div className="flex flex-col">
                     <span className="text-[8px] font-black text-slate-500 uppercase ml-1">Data Emissione</span>
                     <input 
                      type="date" 
                      value={paymentData.creDate} 
                      onChange={(e) => setPaymentData({...paymentData, creDate: e.target.value})}
                      className="bg-transparent border-b border-emerald-500/50 text-xs font-bold text-white outline-none p-1 focus:border-emerald-500 transition-colors"
                     />
                   </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-5 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-6 py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors">Annulla</button>
            <button type="submit" className="px-10 py-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95">Salva e Chiudi Pratica</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentModal;
