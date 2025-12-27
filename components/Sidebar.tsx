import React from 'react';
import { RuntimeCharacter, RuntimeTag } from '../types';
import { TAGS } from '../constants';

interface SidebarProps {
  characters: RuntimeCharacter[];
}

// 进度条组件，用于状态属性 (体力、精力、心情、爱欲)
// 改为无图标，紧凑设计
const StatusBar = ({ label, value, colorClass }: { label: string, value: number, colorClass: string }) => (
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

// 数值组件，用于基础属性 (体质、学识等)
const AttrBox = ({ label, value }: { label: string, value: number }) => (
    <div className="flex flex-col items-center p-2 bg-gray-50 rounded border border-gray-100">
        <span className="text-xs text-gray-500 mb-1">{label}</span>
        <span className="font-bold text-gray-800 text-lg">{value}</span>
    </div>
);

const TagChip: React.FC<{ tag: RuntimeTag }> = ({ tag }) => {
    const template = TAGS[tag.templateId];
    if (!template) return null;
    
    let bg = "bg-gray-100";
    let text = "text-gray-600";
    let border = "border-gray-300";

    if (template.稀有度 === 2) { 
        bg = "bg-blue-50";
        text = "text-blue-700";
        border = "border-blue-200";
    }
    if (template.稀有度 >= 3) { 
        bg = "bg-yellow-50";
        text = "text-yellow-700";
        border = "border-yellow-300";
    }

    return (
        <span className={`${bg} ${text} ${border} text-xs font-bold me-1.5 px-3 py-1 rounded border inline-block mb-1.5 shadow-sm`} title={template.描述}>
            {template.显示名}
        </span>
    );
}

export const Sidebar: React.FC<SidebarProps> = ({ characters }) => {
  return (
    <div className="w-full md:w-96 flex-shrink-0 bg-[#F2F4F8] border-r border-gray-300 h-screen overflow-y-auto no-scrollbar shadow-2xl z-10 flex flex-col font-sans">
      <div className="p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <h2 className="font-bold text-gray-700 text-center tracking-wide text-lg">队伍编成</h2>
      </div>
      
      <div className="p-4 space-y-6 flex-1">
        {characters.map((char) => {
            const isTrainer = char.标签组.some(t => t.templateId === '训练员');
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

                    {/* 3. Race Attributes (Only for Uma) */}
                    {!isTrainer && (
                        <div className="mb-4 pt-2">
                             <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-bold text-gray-500 mb-1">
                                <span>速</span><span>耐</span><span>力</span><span>毅</span><span>智</span>
                             </div>
                             <div className="grid grid-cols-5 gap-1">
                                <div className="h-1 bg-blue-200 rounded"><div className="h-full bg-blue-500 rounded" style={{width: `${Math.min(100, char.竞赛属性.速度/12)}%`}}></div></div>
                                <div className="h-1 bg-orange-200 rounded"><div className="h-full bg-orange-500 rounded" style={{width: `${Math.min(100, char.竞赛属性.耐力/12)}%`}}></div></div>
                                <div className="h-1 bg-red-200 rounded"><div className="h-full bg-red-500 rounded" style={{width: `${Math.min(100, char.竞赛属性.力量/12)}%`}}></div></div>
                                <div className="h-1 bg-pink-200 rounded"><div className="h-full bg-pink-500 rounded" style={{width: `${Math.min(100, char.竞赛属性.毅力/12)}%`}}></div></div>
                                <div className="h-1 bg-green-200 rounded"><div className="h-full bg-green-500 rounded" style={{width: `${Math.min(100, char.竞赛属性.智慧/12)}%`}}></div></div>
                             </div>
                             <div className="grid grid-cols-5 gap-1 text-center text-xs font-bold text-gray-800 mt-1">
                                <span>{char.竞赛属性.速度}</span>
                                <span>{char.竞赛属性.耐力}</span>
                                <span>{char.竞赛属性.力量}</span>
                                <span>{char.竞赛属性.毅力}</span>
                                <span>{char.竞赛属性.智慧}</span>
                             </div>
                        </div>
                    )}

                    {/* 4. Tags */}
                    <div className="flex flex-wrap pt-3 border-t border-gray-100 mt-2">
                        {char.标签组.map((tag, idx) => (
                            <TagChip key={`${tag.templateId}-${idx}`} tag={tag} />
                        ))}
                    </div>
                </div>
              </div>
            );
        })}
      </div>
    </div>
  );
};