
import React from 'react';
import { TagTemplate } from '../types';

interface TagModalProps {
  isOpen: boolean;
  tag: TagTemplate | null;
  targetNames?: string[];
  onClose: () => void;
}

export const TagModal: React.FC<TagModalProps> = ({ isOpen, tag, targetNames, onClose }) => {
  if (!isOpen || !tag) return null;

  // Default N (Iron/Stone)
  let rarityText = "N";
  let rarityBadgeClass = "bg-gray-200 text-gray-600 border-gray-300";
  let titleColor = "text-gray-800";
  let headerBg = "bg-gray-50/50";
  
  if (tag.稀有度 === 2) { // R (Silver)
      rarityText = "R"; 
      rarityBadgeClass = "bg-gradient-to-b from-slate-100 to-slate-200 text-slate-700 border-slate-300";
      titleColor = "text-slate-800";
      headerBg = "bg-gradient-to-r from-slate-50 to-slate-100";
  }
  else if (tag.稀有度 === 3) { // SR (Gold)
      rarityText = "SR"; 
      rarityBadgeClass = "bg-gradient-to-b from-amber-100 to-amber-200 text-amber-800 border-amber-300";
      titleColor = "text-amber-900";
      headerBg = "bg-gradient-to-r from-amber-50 to-yellow-50";
  }
  else if (tag.稀有度 >= 4) { // SSR (Rainbow/Diamond)
      rarityText = "SSR";
      rarityBadgeClass = "bg-gradient-to-br from-fuchsia-100 to-purple-100 text-purple-700 border-purple-300";
      titleColor = "text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600";
      headerBg = "bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50";
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-jelly border-2 border-white" onClick={e => e.stopPropagation()}>
         <div className={`p-4 border-b border-gray-100 flex justify-between items-center ${headerBg}`}>
            <h3 className={`font-bold text-lg ${titleColor}`}>{tag.显示名}</h3>
            <span className={`text-xs font-black px-2 py-0.5 rounded border shadow-sm ${rarityBadgeClass}`}>{rarityText}</span>
         </div>
         <div className="p-6 bg-white">
            <p className="text-gray-600 leading-relaxed text-base font-medium whitespace-pre-line">{tag.描述}</p>
            {targetNames && targetNames.length > 0 && (
                <div className="mt-4 pt-3 border-t border-dashed border-gray-200">
                    <div className="flex flex-wrap gap-2">
                        {targetNames.slice(0, 3).map((name, idx) => (
                            <span key={idx} className="text-sm bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg border border-blue-100 font-bold shadow-sm">
                                {name}
                            </span>
                        ))}
                    </div>
                </div>
            )}
         </div>
         <div className="p-3 border-t border-gray-100 bg-gray-50 flex justify-end">
             <button onClick={onClose} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-bold transition-colors">
                 关闭
             </button>
         </div>
      </div>
    </div>
  );
};
