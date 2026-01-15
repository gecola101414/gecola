
import React, { useState, DragEvent } from 'react';
import { Sparkles, Loader2, CornerRightDown, ExternalLink, MousePointerClick } from 'lucide-react';

interface CategoryDropGateProps {
  onDropContent: (text: string) => void;
  isLoading: boolean;
  categoryCode: string;
}

const CategoryDropGate: React.FC<CategoryDropGateProps> = ({ onDropContent, isLoading, categoryCode }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const text = e.dataTransfer.getData('text');
    if (text) {
      onDropContent(text);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-32 rounded-xl border-2 border-blue-400 bg-blue-50 flex flex-col items-center justify-center animate-pulse shadow-inner">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
        <span className="text-sm font-bold text-blue-700 uppercase tracking-widest">Analisi tecnica in corso...</span>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        w-full h-32 rounded-xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center gap-2 group
        ${isDragOver 
          ? 'border-green-500 bg-green-50 shadow-[0_0_20px_rgba(34,197,94,0.2)] scale-[1.01]' 
          : 'border-gray-300 bg-slate-50 hover:border-blue-400 hover:bg-white'
        }
      `}
    >
      <div className={`p-3 rounded-full transition-colors ${isDragOver ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-500'}`}>
        {isDragOver ? <CornerRightDown className="w-6 h-6" /> : <MousePointerClick className="w-6 h-6" />}
      </div>
      
      <div className="text-center">
        <span className={`text-xs font-bold uppercase tracking-widest block ${isDragOver ? 'text-green-700' : 'text-gray-500 group-hover:text-blue-700'}`}>
          {isDragOver ? 'RILASCIA PER IMPORTARE' : 'Trascina qui una voce da'}
        </span>
        {!isDragOver && (
          <div className="flex items-center justify-center gap-1 mt-1">
            <a 
                href="https://www.gecola.it" 
                target="_blank" 
                rel="noreferrer" 
                className="text-blue-600 hover:text-blue-800 font-black text-sm flex items-center"
                onClick={(e) => e.stopPropagation()}
            >
                GECOLA.IT <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </div>
        )}
      </div>

      {!isDragOver && <Sparkles className="w-4 h-4 text-orange-300 absolute top-4 right-4 opacity-50" />}
    </div>
  );
};

export default CategoryDropGate;
