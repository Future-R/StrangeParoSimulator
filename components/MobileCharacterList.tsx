
import React, { useState } from 'react';
import { RuntimeCharacter, TagTemplate, Aptitudes } from '../types';
import { StatusBar, AttrBox, TagChip, RaceAttrBlock } from './Sidebar';
import { AptitudeModal } from './AptitudeModal';

interface MobileCharacterListProps {
  characters: RuntimeCharacter[];
  onTagClick: (tag: TagTemplate) => void;
}

export const MobileCharacterList: React.FC<MobileCharacterListProps> = ({ characters, onTagClick }) => {
  const displayCharacters = characters.filter(c => c.inTeam);
  
  // 默认展开第一个非训练员角色 (通常是马娘)
  const defaultOpenId = displayCharacters.find(c => !c.templateId.includes('训练员'))?.instanceId || displayCharacters[0]?.instanceId;
  const [expandedId, setExpandedId] = useState<string | null>(defaultOpenId);
  const [aptModalData, setAptModalData] = useState<{name: string, apt: Aptitudes} | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="bg-gray-100 border-b border-gray-300 shadow-sm z-10">
      {displayCharacters.map((char) => {
        const isTrainer = char.标签组.some(t => t.templateId === '训练员');
        const isExpanded = expandedId === char.instanceId;
        
        // 紧凑模式下的颜色
        const activeBarColor = isTrainer ? 'bg-green-500 text-white' : 'bg-pink-500 text-white';

        return (
          <div key={char.instanceId} className={`border-b border-gray-200 last:border-0 bg-white`}>
            {/* Header / Summary Row */}
            <button 
                onClick={() => toggleExpand(char.instanceId)}
                className={`w-full p-2 px-3 transition-colors ${isExpanded ? 'bg-gray-50' : 'bg-white'}`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                         {/* Avatar & Name */}
                        <div className={`
                            flex items-center justify-center w-6 h-6 rounded-full border shadow-sm flex-shrink-0 font-bold text-[10px]
                            ${isExpanded ? activeBarColor : 'bg-gray-100 text-gray-600 border-gray-300'}
                        `}>
                            {char.性别 === '女' ? '♀' : '♂'}
                        </div>
                        <span className="font-bold text-gray-800 text-sm truncate">{char.名称}</span>
                    </div>

                    {/* Arrow */}
                    <div className={`text-gray-400 transform transition-transform ml-2 ${isExpanded ? 'rotate-180' : ''}`}>
                        ▼
                    </div>
                </div>
                
                {/* 1-Row Status Bars (Only when collapsed) */}
                {!isExpanded && (
                    <div className="flex items-center space-x-3 mt-1.5 w-full pr-1">
                        {/* 体力 */}
                        <div className="flex items-center space-x-1 flex-1 min-w-0">
                            <span className="text-[10px] text-gray-400 font-bold shrink-0">体</span>
                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500" style={{width: `${char.通用属性.体力}%`}}></div>
                            </div>
                        </div>
                        {/* 精力 */}
                        <div className="flex items-center space-x-1 flex-1 min-w-0">
                            <span className="text-[10px] text-gray-400 font-bold shrink-0">精</span>
                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{width: `${char.通用属性.精力}%`}}></div>
                            </div>
                        </div>
                        {/* 心情 */}
                        <div className="flex items-center space-x-1 flex-1 min-w-0">
                            <span className="text-[10px] text-gray-400 font-bold shrink-0">心</span>
                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-pink-500" style={{width: `${char.通用属性.心情}%`}}></div>
                            </div>
                        </div>
                        {/* 爱欲 */}
                        <div className="flex items-center space-x-1 flex-1 min-w-0">
                            <span className="text-[10px] text-gray-400 font-bold shrink-0">欲</span>
                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-500" style={{width: `${char.通用属性.爱欲}%`}}></div>
                            </div>
                        </div>
                    </div>
                )}
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="p-3 bg-gray-50 border-t border-gray-100 animate-fade-in">
                    {/* Status Bars */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                         <StatusBar label="体力" value={char.通用属性.体力} colorClass="bg-green-500" />
                         <StatusBar label="精力" value={char.通用属性.精力} colorClass="bg-blue-500" />
                         <StatusBar label="心情" value={char.通用属性.心情} colorClass="bg-pink-500" />
                         <StatusBar label="爱欲" value={char.通用属性.爱欲} colorClass="bg-purple-500" />
                    </div>

                    {/* Basic Attributes */}
                    <div className="grid grid-cols-4 gap-2 mb-3">
                         <AttrBox label="体质" value={char.通用属性.体质} />
                         <AttrBox label="学识" value={char.通用属性.学识} />
                         <AttrBox label="魅力" value={char.通用属性.魅力} />
                         <AttrBox label="财富" value={char.通用属性.财富} />
                    </div>

                    {/* Race Attributes (Uma only) */}
                    {!isTrainer && (
                        <>
                            <div className="mb-3 pt-1">
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
                                    className="w-full mt-1 mb-2 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm font-bold transition-colors border border-blue-200 border-dashed"
                                >
                                    查看适性详情
                                </button>
                            )}
                        </>
                    )}

                    {/* Tags */}
                    <div className="flex flex-wrap mt-1">
                         {char.标签组.map((tag, idx) => (
                            <TagChip 
                                key={`${tag.templateId}-${idx}`} 
                                tag={tag} 
                                onClick={onTagClick}
                            />
                        ))}
                    </div>
                </div>
            )}
          </div>
        );
      })}
      
      <AptitudeModal 
          isOpen={!!aptModalData} 
          onClose={() => setAptModalData(null)} 
          aptitudes={aptModalData?.apt} 
          title={aptModalData?.name || ''} 
      />
    </div>
  );
};
