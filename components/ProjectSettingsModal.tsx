
import React, { useState, useEffect } from 'react';
import { X, Save, Map } from 'lucide-react';
import { ProjectInfo } from '../types';
import { REGIONS, YEARS } from '../constants';

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  info: ProjectInfo;
  onSave: (newInfo: ProjectInfo) => void;
}

const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ isOpen, onClose, info, onSave }) => {
  const [formData, setFormData] = useState<ProjectInfo>(info);

  useEffect(() => {
    if (isOpen) {
      setFormData(info);
    }
  }, [isOpen, info]);

  if (!isOpen) return null;

  const handleChange = (field: keyof ProjectInfo, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-300">
        <div className="bg-[#2c3e50] px-5 py-4 flex justify-between items-center border-b border-gray-600">
          <h3 className="text-white font-semibold text-lg flex items-center gap-2">
            <Map className="w-5 h-5 text-orange-400" />
            Impostazioni Progetto & Prezzario
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Sezione Anagrafica */}
            <div className="col-span-2">
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Titolo Progetto</label>
              <input 
                type="text" 
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Committente</label>
              <input 
                type="text" 
                value={formData.client}
                onChange={(e) => handleChange('client', e.target.value)}
                className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Località</label>
              <input 
                type="text" 
                value={formData.location}
                onChange={(e) => handleChange('location', e.target.value)}
                className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Sezione Prezzario (Cruciale) */}
            <div className="col-span-2 bg-orange-50 p-4 rounded border border-orange-100 mt-2">
              <h4 className="font-bold text-orange-800 text-sm mb-3 border-b border-orange-200 pb-1">Configurazione Prezzario (AI)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Regione di Riferimento</label>
                  <select 
                    value={formData.region}
                    onChange={(e) => handleChange('region', e.target.value)}
                    className="w-full border border-gray-300 rounded p-2 bg-white focus:ring-1 focus:ring-orange-500 outline-none"
                  >
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Anno Prezzario</label>
                  <select 
                    value={formData.year}
                    onChange={(e) => handleChange('year', e.target.value)}
                    className="w-full border border-gray-300 rounded p-2 bg-white focus:ring-1 focus:ring-orange-500 outline-none"
                  >
                     {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-orange-600 mt-2">
                * Le voci generate dall'IA cercheranno di rispettare i codici e i prezzi medi di questa regione e annualità su GeCoLa.it.
              </p>
            </div>

            {/* Parametri Economici */}
            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Aliquota IVA (%)</label>
              <input 
                type="number" 
                value={formData.vatRate}
                onChange={(e) => handleChange('vatRate', parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
             <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Sicurezza (%)</label>
              <input 
                type="number" 
                value={formData.safetyRate}
                onChange={(e) => handleChange('safetyRate', parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

          </div>

          <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-blue-700 rounded hover:bg-blue-700 flex items-center shadow-sm"
            >
              <Save className="w-4 h-4 mr-2" />
              Salva Impostazioni
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProjectSettingsModal;
