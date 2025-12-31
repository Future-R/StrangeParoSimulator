
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

  // Default R1: 灰铁
  let rarityText = "N";
  let rarityBg = "bg-zinc-100";
  let rarityTextCol = "text-zinc-600";
  let rarityBorder = "border-zinc-300";
  let titleColor = "text-zinc-800";
  
  if (tag.稀有度 === 2) { // R2: 白银
      rarityText = "R"; 
      rarityBg = "bg-slate-50";
      rarityTextCol = "text-slate-600";
      rarityBorder = "border-slate-300";
      titleColor = "text-slate-700";
  }
  if (tag.稀有度 === 3) { // R3: 黄金
      rarityText = "SR"; 
      rarityBg = "bg-yellow-50";
      rarityTextCol = "text-yellow-700";
      rarityBorder = "border-yellow-200";
      titleColor = "text-yellow-700";
  }
  if (tag.稀有度 >= 4) { // R4: 彩钻
      rarityText = "SSR";
      rarityBg = "bg-purple-50";
      rarityTextCol = "text-purple-600";
      rarityBorder = "border-purple-200";
      titleColor = "text-purple-600";
  }

  // Special handling for title gradient if R4
  const titleClass = tag.稀有度 >= 4 
    ? "font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600"
    : `font-bold text-lg ${titleColor}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-jelly border-2 border-white" onClick={e => e.stopPropagation()}>
         <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 className={titleClass}>{tag.显示名}</h3>
            <span className={`text-xs font-black px-2 py-0.5 rounded border ${rarityBg} ${rarityTextCol} ${rarityBorder}`}>{rarityText}</span>
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
