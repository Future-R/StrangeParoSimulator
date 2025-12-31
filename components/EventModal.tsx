
import React, { useEffect, useState, useRef } from 'react';
import { GameEvent, RuntimeCharacter } from '../types';
import { parseText, checkCondition } from '../services/engine';

interface EventModalProps {
  isOpen: boolean;
  event: GameEvent | undefined;
  characterName: string;
  parsedTitle?: string; 
  parsedText?: string;  
  variables?: Record<string, any>;
  characters: RuntimeCharacter[];
  currentTurn: number;
  onSelectOption: (optionIndex: number, displayText: string) => void;
}

export const EventModal: React.FC<EventModalProps> = ({ 
    isOpen, event, characterName, parsedTitle, parsedText, 
    variables, characters, currentTurn, onSelectOption 
}) => {
  const [buttonsDisabled, setButtonsDisabled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const animationFrameRef = useRef<number>();

  // Find current character for context if possible
  const currentChar = characters.find(c => c.名称 === characterName) || characters[0];
  const isIndecisive = currentChar?.标签组.some(t => t.templateId === '优柔寡断');

  useEffect(() => {
    if (isOpen) {
        setIsMinimized(false); // Reset minimize state on new event
        
        if (isIndecisive) {
            setButtonsDisabled(true);
            setProgress(0);
            
            const duration = 2000;
            const startTime = performance.now();

            const animate = (currentTime: number) => {
                const elapsed = currentTime - startTime;
                const newProgress = Math.min((elapsed / duration) * 100, 100);
                
                setProgress(newProgress);

                if (elapsed < duration) {
                    animationFrameRef.current = requestAnimationFrame(animate);
                } else {
                    setButtonsDisabled(false);
                }
            };

            animationFrameRef.current = requestAnimationFrame(animate);
        } else {
            setButtonsDisabled(false);
            setProgress(0);
        }
    }
    
    return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isOpen, isIndecisive, event]);

  if (!isOpen || !event) return null;

  // Ensure default fallback uses parsing logic or simple replacement, and convert newlines to <br/>
  const titleContent = parsedTitle || event.标题 || '事件抉择';
  const rawBodyContent = parsedText || event.正文.replace(/{当前角色\.名称}/g, characterName);
  const bodyContent = rawBodyContent.replace(/\n/g, '<br/>');

  const hasOptions = event.选项组 && event.选项组.length > 0;
  
  // Filter options based on visibleCondition
  const visibleOptions = event.选项组?.map((opt, originalIndex) => ({...opt, originalIndex})).filter(opt => {
      if (!opt.可见条件) return true;
      return checkCondition(opt.可见条件, currentChar, currentTurn, undefined, characters, variables);
  }) || [];

  return (
    <>
        {/* Main Modal Overlay */}
        <div 
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ease-in-out
                ${isMinimized 
                    ? 'bg-black/0 pointer-events-none' 
                    : 'bg-black/50 backdrop-blur-sm pointer-events-auto'
                }
            `}
        >
            <div 
                className={`bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border-4 border-green-100 relative flex flex-col max-h-[90vh] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                    ${isMinimized 
                        ? 'translate-x-[120%] scale-75 opacity-0' 
                        : 'translate-x-0 scale-100 opacity-100 animate-jelly'
                    }
                `}
            >
                {/* Header */}
                <div className="bg-green-600 p-4 shrink-0 flex justify-between items-center relative shadow-md z-10">
                    <h3 className="text-white font-bold text-lg text-center tracking-wider flex-1 mr-12">
                        {titleContent}
                    </h3>
                    {/* 
                        Minimize Button - Static Raised Style 
                        Fixed position (no translate), just color change on active to ensure reliable clicking.
                    */}
                    <button 
                        onClick={() => setIsMinimized(true)}
                        className="
                            absolute right-3 top-1/2 -translate-y-1/2 
                            bg-green-500 hover:bg-green-400 text-white 
                            px-3 py-1.5 rounded-lg 
                            border-b-4 border-green-700 
                            active:bg-green-600 active:border-green-800
                            shadow-sm transition-colors flex items-center gap-1 z-20
                        "
                        title="暂时收起以查看信息"
                    >
                        <span className="text-xs font-black drop-shadow-sm">收起</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
                
                {/* Scrollable Content */}
                <div className="p-6 overflow-y-auto">
                    <div className="mb-2 text-sm text-gray-500 font-bold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        {characterName} 遭遇了事件：
                    </div>
                    <div className="text-gray-800 text-lg mb-8 leading-relaxed font-medium">
                        <div dangerouslySetInnerHTML={{ __html: bodyContent }}></div>
                    </div>
                    
                    {/* Indecisive Progress Bar */}
                    {buttonsDisabled && isIndecisive && (
                        <div className="mb-4">
                            <div className="flex justify-between text-xs text-gray-400 font-bold mb-1">
                                <span>优柔寡断发动中...</span>
                                <span>犹豫中</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                <div 
                                    className="bg-gray-400 h-full rounded-full transition-all duration-75 ease-linear"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        {hasOptions && visibleOptions.length > 0 ? (
                            visibleOptions.map((opt, idx) => {
                                // Parse option text to support variables like {OptionA.Name}
                                const displayText = parseText(opt.显示文本, currentChar, currentTurn, characters, variables);
                                return (
                                    <button
                                        key={opt.originalIndex}
                                        onClick={() => onSelectOption(opt.originalIndex, displayText)}
                                        disabled={buttonsDisabled}
                                        className={`
                                            w-full text-left p-4 rounded-xl border-2 transition-all duration-200 group shadow-sm flex items-center
                                            ${buttonsDisabled 
                                                ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-wait opacity-70' 
                                                : 'border-gray-100 hover:border-[#16A34A] hover:bg-[#16A34A] hover:text-white hover:scale-[1.02] active:scale-[0.98]'
                                            }
                                        `}
                                    >
                                        <span className={`
                                            w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold mr-3 transition-colors
                                            ${buttonsDisabled 
                                                ? 'bg-gray-200 text-gray-400' 
                                                : 'bg-gray-200 text-gray-600 group-hover:bg-white group-hover:text-[#16A34A]'
                                            }
                                        `}>
                                            {idx + 1}
                                        </span>
                                        <span className={`font-bold ${buttonsDisabled ? '' : 'text-gray-700 group-hover:text-white'}`}>
                                            {displayText}
                                        </span>
                                    </button>
                                );
                            })
                        ) : (
                            <button
                                onClick={() => onSelectOption(-1, '继续')}
                                disabled={buttonsDisabled}
                                className={`
                                    w-full p-4 rounded-xl font-bold transition-all duration-200 shadow-md
                                    ${buttonsDisabled
                                        ? 'bg-gray-300 text-gray-500 cursor-wait'
                                        : 'bg-green-500 text-white hover:bg-green-600 hover:scale-[1.02] active:scale-[0.98]'
                                    }
                                `}
                            >
                                继续
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* Restore Button (Floating) */}
        {/* Mobile: Bottom Right FAB. Desktop: Right Edge Tab */}
        <div 
            className={`fixed z-[60] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                ${isMinimized 
                    ? 'translate-x-0 opacity-100' 
                    : 'translate-x-32 opacity-0 pointer-events-none'
                }
                md:right-0 md:top-1/2 md:-translate-y-1/2
                right-5 bottom-28
            `}
        >
            <button 
                onClick={() => setIsMinimized(false)}
                className="
                    bg-green-600 text-white shadow-[0_4px_0_#14532d] active:shadow-none active:translate-y-1 border-2 border-green-800 
                    hover:bg-green-500 transition-all flex items-center justify-center gap-2 group
                    
                    /* Desktop Styles: Tab on the right */
                    md:p-3 md:rounded-l-xl md:rounded-r-none md:border-r-0 md:flex-col md:w-auto md:h-auto
                    
                    /* Mobile Styles: Circular FAB */
                    p-4 rounded-full w-14 h-14 md:w-auto md:h-auto
                "
            >
                <div className="bg-white/20 p-1.5 rounded-full group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-6 h-6 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7 7-7" />
                    </svg>
                </div>
                <span className="
                    font-bold tracking-widest opacity-90 group-hover:opacity-100
                    hidden md:block md:[writing-mode:vertical-rl] md:text-xs md:py-2
                ">
                    当前事件
                </span>
            </button>
        </div>
    </>
  );
};
