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
  hasPendingActions: boolean; // New prop
}

export const GameControls: React.FC<GameControlsProps> = ({ 
    currentTurn, maxTurns, isAuto, onNextTurn, onToggleAuto, isGameOver, onRestart, hasPendingActions
}) => {
  return (
    <div className="fixed bottom-0 left-0 md:left-96 right-0 bg-white/90 backdrop-blur-sm border-t border-gray-200 p-5 shadow-[0_-5px_15px_rgba(0,0,0,0.05)] flex items-center justify-between z-30">
      <div className="flex items-center space-x-4">
        <div className="bg-white px-6 py-3 rounded-xl border-2 border-green-400 shadow-sm flex flex-col items-center min-w-[140px]">
            <span className="font-bold text-green-700 text-xl leading-none">{getTurnDate(currentTurn)}</span>
        </div>
      </div>

      <div className="flex space-x-4">
        {isGameOver ? (
             <button 
                onClick={onRestart}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-10 rounded-full shadow-lg transition transform hover:-translate-y-1 hover:shadow-xl border-b-4 border-blue-800 active:border-0 active:translate-y-0 text-lg"
            >
                ↺ 重新开始
            </button>
        ) : (
            <>
                <button 
                    onClick={onToggleAuto}
                    className={`
                        font-bold py-3 px-8 rounded-xl border-2 transition-all flex items-center space-x-2 text-lg
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
                        text-white font-bold py-3 px-10 rounded-xl shadow-lg border-b-4 active:border-0 active:translate-y-1 transition-all text-xl
                        ${isAuto ? 'opacity-50 cursor-not-allowed filter grayscale ' : ''}
                        ${hasPendingActions 
                            ? 'bg-gradient-to-b from-orange-400 to-orange-500 border-orange-700 hover:from-orange-500 hover:to-orange-600' 
                            : 'bg-gradient-to-b from-[#A5D63F] to-[#88B828] border-[#6E951E] hover:from-[#B4E44C] hover:to-[#99CC33]'
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