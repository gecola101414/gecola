import React from 'react';
import { ProjectInfo } from '../types';
import { FileText, MapPin, Calendar, User, BookOpen, Settings } from 'lucide-react';

interface ProjectHeaderProps {
  info: ProjectInfo;
  onEdit: () => void;
}

const ProjectHeader: React.FC<ProjectHeaderProps> = ({ info, onEdit }) => {
  return (
    <div className="bg-white p-6 shadow-sm border-b border-gray-200 mb-6 rounded-t-lg relative group">
      <button 
        onClick={onEdit}
        className="absolute top-4 right-4 p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
        title="Modifica Dati Progetto"
      >
        <Settings className="w-5 h-5" />
      </button>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pr-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-2">{info.title}</h1>
          <div className="flex items-center text-gray-500 text-sm space-x-4">
             <span className="flex items-center"><MapPin className="w-4 h-4 mr-1" /> {info.location}</span>
             <span className="flex items-center"><Calendar className="w-4 h-4 mr-1" /> {info.date}</span>
          </div>
        </div>
        <div className="mt-4 md:mt-0 flex flex-col items-end">
          <div className="bg-blue-50 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide border border-blue-200">
            Computo Metrico Estimativo
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
        <div className="flex items-center text-gray-700">
          <User className="w-5 h-5 mr-3 text-gray-400" />
          <span className="font-semibold w-24">Committente:</span>
          <span>{info.client}</span>
        </div>
        <div className="flex items-center text-gray-700">
          <BookOpen className="w-5 h-5 mr-3 text-gray-400" />
          <span className="font-semibold w-24">Prezzario:</span>
          <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-xs font-mono font-bold border border-orange-200">
             {info.region} {info.year}
          </span>
        </div>
        <div className="flex items-center text-gray-700 md:col-span-2">
            <FileText className="w-5 h-5 mr-3 text-gray-400" />
            <span className="font-semibold w-24">Dati:</span>
            <span>IVA {info.vatRate}% &bull; Sicurezza {info.safetyRate}%</span>
        </div>
      </div>
    </div>
  );
};

export default ProjectHeader;