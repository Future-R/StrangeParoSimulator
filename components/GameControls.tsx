
import React from 'react';
import { getTurnDate } from '../services/engine';

interface GameControlsProps {
  currentTurn: number;
  maxTurns: number;
  isAuto: boolean;
  onNextTurn: () => void;
  onToggleAuto: () => void;
  isGameOver: boolean;
  onRestart: () => void;
  hasPendingActions: boolean; 
}

export const GameControls: React.FC<GameControlsProps> = ({ 
    currentTurn, maxTurns, isAuto, onNextTurn, onToggleAuto, isGameOver, onRestart, hasPendingActions
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 md:left-96 bg-white/95 backdrop-blur-md border-t border-gray-200 p-3 md:p-5 shadow-[0_-5px_15px_rgba(0,0,0,0.05)] flex items-center justify-between z-30">
      
      {/* Turn Display: Hidden on Mobile (Moved to Top Header), Visible on Desktop */}
      <div className="hidden md:flex items-center space-x-4">
        <div className="bg-white px-6 py-3 rounded-xl border-2 border-green-400 shadow-sm flex flex-col items-center min-w-[140px]">
            <span className="font-bold text-green-700 text-xl leading-none">{getTurnDate(currentTurn)}</span>
        </div>
      </div>

      {/* Buttons Container: Full width on mobile, right aligned on desktop */}
      <div className="flex space-x-3 w-full md:w-auto">
        {isGameOver ? (
             <button 
                onClick={onRestart}
                className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 md:py-4 px-6 md:px-10 rounded-xl md:rounded-full shadow-lg transition transform hover:-translate-y-1 hover:shadow-xl border-b-4 border-blue-800 active:border-0 active:translate-y-0 text-base md:text-lg"
            >
                ↺ 重新开始
            </button>
        ) : (
            <>
                <button 
                    onClick={onToggleAuto}
                    className={`
                        flex-1 md:flex-none font-bold py-2 md:py-3 px-4 md:px-8 rounded-xl border-2 transition-all flex items-center justify-center space-x-2 text-base md:text-lg
                        ${isAuto 
                            ? 'bg-red-50 text-red-600 border-red-300 hover:bg-red-100' 
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }
                    `}
                >
                    <span className={isAuto ? 'animate-pulse' : ''}>●</span>
                    <span>{isAuto ? '停止' : '自动'}</span>
                </button>
                <button 
                    onClick={onNextTurn}
                    disabled={isAuto}
                    className={`
                        flex-[2] md:flex-none text-white font-bold py-2 md:py-3 px-6 md:px-10 rounded-xl shadow-lg border-b-4 active:border-0 active:translate-y-1 transition-all text-base md:text-xl
                        ${isAuto ? 'opacity-50 cursor-not-allowed filter grayscale ' : ''}
                        ${hasPendingActions 
                            ? 'bg-gradient-to-b from-orange-400 to-orange-500 border-orange-700 hover:from-orange-500 hover:to-orange-600' 
                            : 'bg-gradient-to-b from-[#66D814] to-[#55B50A] border-[#4AA00D] hover:from-[#76E020] hover:to-[#60C510]'
                        }
                    `}
                >
                    {hasPendingActions ? '继续 ▶' : '下一回合 ▶▶'}
                </button>
            </>
        )}
      </div>
    </div>
  );
};
