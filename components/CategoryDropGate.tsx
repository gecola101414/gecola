
import React, { useState, DragEvent } from 'react';
import { Sparkles, Loader2, CornerRightDown, ExternalLink } from 'lucide-react';

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
      <div className="h-full min-h-[36px] px-4 rounded border border-blue-200 bg-blue-50 flex items-center justify-center animate-pulse shadow-sm">
        <Loader2 className="w-3 h-3 text-blue-600 animate-spin mr-2" />
        <span className="text-[10px] font-bold text-blue-700">Analisi in corso...</span>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        h-full min-h-[36px] w-full px-4 rounded border-2 border-dashed transition-all duration-200 cursor-default flex items-center justify-center gap-2 group
        ${isDragOver 
          ? 'border-green-500 bg-green-50 shadow-inner' 
          : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'
        }
      `}
      title="Trascina qui il testo copiato"
    >
      <CornerRightDown className={`w-3 h-3 ${isDragOver ? 'text-green-600' : 'text-gray-400'}`} />
      
      <span className={`text-[10px] font-medium uppercase tracking-wide truncate ${isDragOver ? 'text-green-700 font-bold' : 'text-gray-400 group-hover:text-gray-600'}`}>
        {isDragOver ? 'RILASCIA ADESSO' : (
            <span className="flex items-center gap-1">
                Trascina voce da 
                <a 
                    href="https://www.gecola.it" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-blue-500 hover:text-blue-700 hover:underline font-bold flex items-center z-20 relative pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    gecola.it <ExternalLink className="w-2 h-2 ml-0.5 inline" />
                </a>
            </span>
        )}
      </span>

      {!isDragOver && <Sparkles className="w-3 h-3 text-gray-300 opacity-50" />}
    </div>
  );
};

export default CategoryDropGate;
