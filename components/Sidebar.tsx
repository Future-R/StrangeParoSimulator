
import React, { useState } from 'react';
import { RuntimeCharacter, RuntimeTag, TagTemplate, Aptitudes } from '../types';
import { TAGS } from '../constants';
import { AptitudeModal } from './AptitudeModal';

interface SidebarProps {
  characters: RuntimeCharacter[];
  onTagClick: (tag: RuntimeTag) => void;
}

// 进度条组件
export const StatusBar = ({ label, value, colorClass }: { label: string, value: number, colorClass: string }) => (
  <div className="w-full">
    <div className="flex justify-between text-xs font-bold text-gray-500 mb-0.5">
        <span>{label}</span>
        <span className={`${colorClass.replace('bg-', 'text-')}`}>{value}</span>
    </div>
    <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div 
            className={`h-full rounded-full transition-all duration-500 ${colorClass}`} 
            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        ></div>
    </div>
  </div>
);

// 数值组件
export const AttrBox = ({ label, value }: { label: string, value: number }) => (
    <div className="flex flex-col items-center p-2 bg-gray-50 rounded border border-gray-100 min-w-[3rem]">
        <span className="text-xs text-gray-500 mb-1">{label}</span>
        <span className="font-bold text-gray-800 text-lg leading-none">{value}</span>
    </div>
);

// 竞赛属性色块组件
export const RaceAttrBlock = ({ label, value, color }: { label: string, value: number, color: string }) => (
    <div className={`${color} text-white rounded-lg p-2 flex flex-col items-center justify-center shadow-sm border-b-2 border-black/10`}>
        <span className="text-[10px] font-bold opacity-90 mb-0.5">{label}</span>
        <span className="font-bold text-lg leading-none drop-shadow-sm">{value}</span>
    </div>
);

// 标签组件 (可点击) - Updated with Material Styles
export const TagChip: React.FC<{ tag: RuntimeTag; onClick?: (t: RuntimeTag) => void }> = ({ tag, onClick }) => {
    const template = TAGS[tag.templateId];
    if (!template) return null;
    
    // Default N (Iron/Stone)
    let className = "bg-zinc-200 border-zinc-300 text-zinc-700";

    if (template.稀有度 === 2) { // R (Silver Metal)
        className = "bg-gradient-to-b from-slate-200 to-slate-300 border-slate-400 text-slate-800 shadow-sm";
    }
    else if (template.稀有度 === 3) { // SR (Gold Metal)
        className = "bg-gradient-to-b from-yellow-200 via-yellow-300 to-yellow-400 border-yellow-500 text-yellow-900 shadow-sm";
    }
    else if (template.稀有度 >= 4) { // SSR (Rainbow Diamond)
        className = "bg-gradient-to-r from-indigo-200 via-purple-200 to-pink-200 border-purple-400 text-purple-900 shadow-sm animate-pulse-slow";
    }

    return (
        <button 
            onClick={(e) => { e.stopPropagation(); onClick?.(tag); }}
            className={`${className} text-xs font-bold me-1.5 px-2 py-1 rounded border inline-flex items-center mb-1 hover:opacity-80 active:scale-95 transition-all`} 
            title={template.描述}
        >
            {template.显示名}
            {template.显示层数 && tag.层数 > 0 && (
                <span className="ml-1 px-1 bg-black/10 rounded text-[10px] min-w-[14px] text-center border border-black/5">{tag.层数}</span>
            )}
        </button>
    );
}

export const Sidebar: React.FC<SidebarProps> = ({ characters, onTagClick }) => {
  const [aptModalData, setAptModalData] = useState<{name: string, apt: Aptitudes} | null>(null);

  // characters prop passed here should already be filtered by inTeam, but just in case
  const displayCharacters = characters.filter(c => c.inTeam);

  return (
    <div className="w-full h-full bg-[#F2F4F8] border-r border-gray-300 overflow-y-auto no-scrollbar shadow-2xl flex flex-col font-sans">
      <div className="p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <h2 className="font-bold text-gray-700 text-center tracking-wide text-lg">队伍编成</h2>
      </div>
      
      <div className="p-4 space-y-6 flex-1">
        {displayCharacters.map((char) => {
            const isTrainer = char.标签组.some(t => t.templateId === '训练员');
            const hasUmaTag = char.标签组.some(t => t.templateId === '马娘');
            const cardColor = isTrainer ? 'border-green-400' : 'border-pink-400';
            const headerColor = isTrainer ? 'bg-green-500' : 'bg-pink-500';

            return (
              <div key={char.instanceId} className={`bg-white rounded-xl shadow-md border-2 ${cardColor} overflow-hidden`}>
                {/* Header */}
                <div className={`${headerColor} p-3 flex justify-between items-center`}>
                    <div className="flex items-center space-x-3">
                        <div className="bg-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold text-gray-700 border border-gray-300">
                             {char.性别 === '女' ? '♀' : '♂'}
                        </div>
                        <span className="font-bold text-white text-base tracking-wide shadow-black drop-shadow-md">{char.名称}</span>
                    </div>
                </div>

                <div className="p-4">
                    {/* 1. Volatile Status Section - Double Column Layout */}
                    <div className="mb-4 pb-4 border-b border-dashed border-gray-200 grid grid-cols-2 gap-x-4 gap-y-3">
                        <StatusBar label="体力" value={char.通用属性.体力} colorClass="bg-green-500" />
                        <StatusBar label="精力" value={char.通用属性.精力} colorClass="bg-blue-500" />
                        <StatusBar label="心情" value={char.通用属性.心情} colorClass="bg-pink-500" />
                        <StatusBar label="爱欲" value={char.通用属性.爱欲} colorClass="bg-purple-500" />
                    </div>

                    {/* 2. Stable Attributes Section */}
                    <div className="grid grid-cols-4 gap-2 mb-4">
                         <AttrBox label="体质" value={char.通用属性.体质} />
                         <AttrBox label="学识" value={char.通用属性.学识} />
                         <AttrBox label="魅力" value={char.通用属性.魅力} />
                         <AttrBox label="财富" value={char.通用属性.财富} />
                    </div>

                    {/* 3. Race Attributes & Aptitudes */}
                    {/* 显示条件修改：如果拥有马娘特质，则显示竞赛属性，即使是训练员 */}
                    {hasUmaTag && (
                        <>
                            <div className="mb-4 pt-1">
                                <div className="grid grid-cols-5 gap-2">
                                    <RaceAttrBlock label="速度" value={char.竞赛属性.速度} color="bg-blue-500" />
                                    <RaceAttrBlock label="耐力" value={char.竞赛属性.耐力} color="bg-orange-500" />
                                    <RaceAttrBlock label="力量" value={char.竞赛属性.力量} color="bg-red-500" />
                                    <RaceAttrBlock label="毅力" value={char.竞赛属性.毅力} color="bg-pink-500" />
                                    <RaceAttrBlock label="智慧" value={char.竞赛属性.智慧} color="bg-green-500" />
                                </div>
                            </div>
                            {char.适性 && (
                                <button 
                                    onClick={() => setAptModalData({ name: char.名称, apt: char.适性! })}
                                    className="w-full mt-1 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm font-bold transition-colors border border-blue-200 border-dashed"
                                >
                                    查看适性详情
                                </button>
                            )}
                        </>
                    )}

                    {/* 4. Tags */}
                    <div className="flex flex-wrap pt-3 border-t border-gray-100 mt-2">
                        {char.标签组.map((tag, idx) => (
                            <TagChip 
                                key={`${tag.templateId}-${idx}`} 
                                tag={tag} 
                                onClick={onTagClick}
                            />
                        ))}
                    </div>
                </div>
              </div>
            );
        })}
      </div>

      <AptitudeModal 
          isOpen={!!aptModalData} 
          onClose={() => setAptModalData(null)} 
          aptitudes={aptModalData?.apt} 
          title={aptModalData?.name || ''} 
      />
    </div>
  );
};
