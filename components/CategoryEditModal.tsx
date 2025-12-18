
import React, { useState, useEffect } from 'react';
import { X, Save, FolderPlus, Edit3 } from 'lucide-react';
import { Category } from '../types';

interface CategoryEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  initialData?: Category | null;
  nextWbsCode?: string;
}

const CategoryEditModal: React.FC<CategoryEditModalProps> = ({ isOpen, onClose, onSave, initialData, nextWbsCode }) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name);
      } else {
        setName('');
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name);
      onClose();
    }
  };

  const displayCode = initialData ? initialData.code : nextWbsCode;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden border border-gray-300">
        <div className="bg-slate-700 px-5 py-3 flex justify-between items-center border-b border-gray-600">
          <h3 className="text-white font-semibold flex items-center gap-2">
            {initialData ? <Edit3 className="w-4 h-4 text-blue-300" /> : <FolderPlus className="w-4 h-4 text-green-300" />}
            {initialData ? 'Modifica WBS' : 'Nuova WBS'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Codice WBS (Automatico)</label>
              <div className="w-full border border-gray-200 bg-gray-100 rounded p-2 font-mono font-bold uppercase text-gray-600">
                  {displayCode}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Descrizione WBS</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 rounded p-2 focus:ring-1 focus:ring-blue-500 outline-none"
                placeholder="Es. Impianti Speciali"
                autoFocus
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-blue-700 rounded hover:bg-blue-700 flex items-center shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              Salva
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CategoryEditModal;
