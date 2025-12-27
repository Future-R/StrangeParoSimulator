import React from 'react';
import { GameEvent } from '../types';

interface EventModalProps {
  isOpen: boolean;
  event: GameEvent | undefined;
  characterName: string;
  parsedTitle?: string; // New
  parsedText?: string;  // New
  onSelectOption: (optionIndex: number, displayText: string) => void;
}

export const EventModal: React.FC<EventModalProps> = ({ isOpen, event, characterName, parsedTitle, parsedText, onSelectOption }) => {
  if (!isOpen || !event || !event.选项组) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm transition-opacity duration-300">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-jelly border-4 border-green-100 transform">
        <div className="bg-green-600 p-4">
            <h3 className="text-white font-bold text-lg text-center tracking-wider">
                {parsedTitle || event.标题 || '事件抉择'}
            </h3>
        </div>
        
        <div className="p-6">
            <div className="mb-2 text-sm text-gray-500 font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                {characterName} 遭遇了事件：
            </div>
            <div className="text-gray-800 text-lg mb-8 leading-relaxed font-medium">
                {/* Use parsed text if available to show resolved names/titles correctly */}
                <div dangerouslySetInnerHTML={{ 
                    __html: parsedText || event.正文.replace(/{当前角色\.名称}/g, characterName) 
                }}></div>
            </div>
            
            <div className="space-y-3">
                {event.选项组.map((opt, idx) => (
                    <button
                        key={idx}
                        onClick={() => onSelectOption(idx, opt.显示文本)}
                        className="w-full text-left p-4 rounded-xl border-2 border-gray-100 hover:border-green-500 hover:bg-green-50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group shadow-sm"
                    >
                        <div className="flex items-center">
                            <span className="bg-gray-200 group-hover:bg-green-500 group-hover:text-white text-gray-600 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold mr-3 transition-colors">
                                {idx + 1}
                            </span>
                            <span className="font-bold text-gray-700 group-hover:text-green-800">
                                {opt.显示文本}
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};