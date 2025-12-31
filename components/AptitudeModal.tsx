
import React from 'react';
import { Aptitudes } from '../types';

// 适性单个格子
const AptItem = ({ label, val }: { label: string, val: string }) => {
    let color = 'text-gray-400';
    
    if (['S', 'A'].includes(val)) color = 'text-orange-500 font-bold';
    else if (val === 'B') color = 'text-[#FFA7C6] font-bold'; // 粉色
    else if (val === 'C') color = 'text-green-500';
    else if (val === 'E') color = 'text-[#E794FE]'; // 紫色
    else if (val === 'F') color = 'text-[#B2ACE7]'; // 深青色
    else if (val === 'D') color = 'text-gray-500';
    
    return (
        <div className="flex flex-col items-center justify-center bg-gray-50 rounded p-1 border border-gray-100 min-w-[3rem]">
            <span className="text-[10px] text-gray-400 mb-0.5">{label}</span>
            <span className={`text-sm ${color}`}>{val}</span>
        </div>
    );
};

// 适性展示表格
export const AptitudeGrid = ({ apt }: { apt: Aptitudes }) => {
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
             <div className="flex items-center mb-3">
                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full shrink-0 w-12 text-center">场地</span>
                <div className="flex space-x-2 ml-3 flex-1 justify-around">
                    <AptItem label="草地" val={apt.草地} />
                    <AptItem label="沙地" val={apt.沙地} />
                </div>
             </div>
             <div className="flex items-center mb-3">
                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full shrink-0 w-12 text-center">距离</span>
                <div className="flex space-x-1 ml-3 flex-1 justify-between">
                    <AptItem label="短距离" val={apt.短距离} />
                    <AptItem label="英里" val={apt.英里} />
                    <AptItem label="中距离" val={apt.中距离} />
                    <AptItem label="长距离" val={apt.长距离} />
                </div>
             </div>
             <div className="flex items-center">
                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full shrink-0 w-12 text-center">跑法</span>
                <div className="flex space-x-1 ml-3 flex-1 justify-between">
                    <AptItem label="领头" val={apt.领头} />
                    <AptItem label="前列" val={apt.前列} />
                    <AptItem label="居中" val={apt.居中} />
                    <AptItem label="后追" val={apt.后追} />
                </div>
             </div>
        </div>
    );
};

interface AptitudeModalProps {
  isOpen: boolean;
  onClose: () => void;
  aptitudes?: Aptitudes;
  title: string;
}

export const AptitudeModal: React.FC<AptitudeModalProps> = ({ isOpen, onClose, aptitudes, title }) => {
    if (!isOpen || !aptitudes) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-jelly border-2 border-white" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h3 className="font-bold text-lg text-gray-800">{title} - 适性详情</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-lg px-2">✕</button>
                </div>
                <div className="p-6 bg-white">
                    <AptitudeGrid apt={aptitudes} />
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
