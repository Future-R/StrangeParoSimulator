import React, { useState, useEffect } from 'react';
import { TagTemplate } from '../types';
import { getAvailableStartTags } from '../services/engine';

interface SetupScreenProps {
  onComplete: (name: string, gender: '男' | '女', selectedTags: string[]) => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('新人训练员');
  // 默认性别改为 '随机'
  const [gender, setGender] = useState<'男' | '女' | '随机'>('随机');
  const [availableTags, setAvailableTags] = useState<TagTemplate[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [blockedTags, setBlockedTags] = useState<string[]>([]);

  useEffect(() => {
    // Randomly select 10 tags
    const allTags = getAvailableStartTags();
    const shuffled = [...allTags].sort(() => 0.5 - Math.random());
    setAvailableTags(shuffled.slice(0, 10));
  }, []);

  useEffect(() => {
    // Recalculate blocked tags based on current selection
    const blocked: string[] = [];
    selectedTags.forEach(tagId => {
      const tag = availableTags.find(t => t.id === tagId);
      if (tag && tag.互斥标签) {
        blocked.push(...tag.互斥标签);
      }
    });
    setBlockedTags(blocked);
  }, [selectedTags, availableTags]);

  const toggleTag = (id: string) => {
    if (selectedTags.includes(id)) {
      setSelectedTags(prev => prev.filter(t => t !== id));
    } else {
      if (selectedTags.length < 3 && !blockedTags.includes(id)) {
        setSelectedTags(prev => [...prev, id]);
      }
    }
  };

  const handleStart = () => {
    if (!name.trim()) return;
    
    // 如果是随机，在这里解析为具体的性别
    let finalGender: '男' | '女';
    if (gender === '随机') {
        finalGender = Math.random() > 0.5 ? '男' : '女';
    } else {
        finalGender = gender;
    }

    onComplete(name, finalGender, selectedTags);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-sans bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
      
      {/* Main Card */}
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border-2 border-green-400 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-[#A5D63F] p-4 text-center shadow-md relative overflow-hidden flex-shrink-0 z-10">
            <div className="absolute top-0 left-0 w-full h-full bg-white opacity-10 transform -skew-x-12"></div>
            <h1 className="text-2xl font-bold text-white relative z-10 tracking-widest drop-shadow-md">
                训练员登记
            </h1>
        </div>

        {step === 1 && (
          <div className="p-8 animate-fade-in flex-1 overflow-y-auto">
             
             {/* Name Input */}
             <div className="mb-8">
                <label className="block text-green-800 font-bold mb-3 text-base tracking-wider">训练员姓名</label>
                <div className="relative">
                    <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={10}
                        className="w-full bg-gray-50 border-2 border-gray-300 rounded-xl py-4 px-6 text-gray-700 leading-tight focus:outline-none focus:border-green-500 transition shadow-inner font-bold text-xl"
                        placeholder="请输入姓名"
                    />
                    <div className="absolute right-4 top-4 text-gray-400 text-xl">✎</div>
                </div>
                <p className="text-sm text-right text-gray-400 mt-2">请输入1~10个字符的内容</p>
             </div>

             {/* Gender Selection */}
             <div className="mb-12">
                <label className="block text-green-800 font-bold mb-4 text-base tracking-wider">性 别</label>
                <div className="flex justify-center gap-3">
                    <button
                        onClick={() => setGender('男')}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all transform hover:scale-105 flex-1 ${
                        gender === '男' 
                            ? 'bg-blue-50 border-blue-500 shadow-md ring-2 ring-blue-200' 
                            : 'bg-white border-gray-200 text-gray-400 hover:border-blue-300'
                        }`}
                    >
                        <div className={`w-8 h-8 rounded-full border-4 flex-shrink-0 mb-2 ${gender === '男' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}></div>
                        <span className={`font-bold text-lg ${gender === '男' ? 'text-blue-600' : 'text-gray-500'}`}>男 性</span>
                    </button>

                    <button
                        onClick={() => setGender('女')}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all transform hover:scale-105 flex-1 ${
                        gender === '女' 
                            ? 'bg-pink-50 border-pink-500 shadow-md ring-2 ring-pink-200' 
                            : 'bg-white border-gray-200 text-gray-400 hover:border-pink-300'
                        }`}
                    >
                        <div className={`w-8 h-8 rounded-full border-4 flex-shrink-0 mb-2 ${gender === '女' ? 'border-pink-500 bg-pink-500' : 'border-gray-300'}`}></div>
                        <span className={`font-bold text-lg ${gender === '女' ? 'text-pink-600' : 'text-gray-500'}`}>女 性</span>
                    </button>

                    <button
                        onClick={() => setGender('随机')}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all transform hover:scale-105 flex-1 ${
                        gender === '随机' 
                            ? 'bg-purple-50 border-purple-500 shadow-md ring-2 ring-purple-200' 
                            : 'bg-white border-gray-200 text-gray-400 hover:border-purple-300'
                        }`}
                    >
                        <div className={`w-8 h-8 rounded-full border-4 flex items-center justify-center flex-shrink-0 mb-2 ${gender === '随机' ? 'border-purple-500 bg-purple-500 text-white' : 'border-gray-300 text-gray-300'}`}>
                            <span className="font-bold text-xs">?</span>
                        </div>
                        <span className={`font-bold text-lg ${gender === '随机' ? 'text-purple-600' : 'text-gray-500'}`}>随 机</span>
                    </button>
                </div>
             </div>

             <button
                onClick={() => setStep(2)}
                className="w-full bg-gradient-to-b from-[#A5D63F] to-[#88B828] hover:from-[#B4E44C] hover:to-[#99CC33] text-white font-bold py-4 px-6 rounded-2xl shadow-lg border-b-4 border-[#6E951E] active:border-0 active:translate-y-1 transition-all text-xl tracking-widest"
             >
                登 记
             </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col h-full animate-fade-in bg-gray-50 overflow-hidden">
            {/* Integrated Info Bar */}
            <div className="bg-white px-4 py-2 border-b border-gray-200 flex justify-between items-center shadow-sm flex-shrink-0">
                 <span className="text-gray-500 font-bold text-sm">请选择3个特质</span>
                 <span className={`px-3 py-1 rounded-full text-sm font-bold border ${selectedTags.length === 3 ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                    已选: {selectedTags.length} / 3
                 </span>
            </div>
            
            {/* Scrollable Grid Area */}
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableTags.map(tag => {
                    const isSelected = selectedTags.includes(tag.id);
                    const isBlocked = blockedTags.includes(tag.id) && !isSelected;

                    return (
                        <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        disabled={isBlocked}
                        className={`
                            relative p-3 rounded-xl border-2 text-left transition-all duration-200 flex items-start h-full
                            ${isSelected 
                                ? 'bg-yellow-50 border-orange-400 shadow-md transform scale-[1.01]' 
                                : isBlocked
                                    ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed grayscale'
                                    : 'bg-white border-gray-200 hover:border-green-400 hover:shadow-sm'
                            }
                        `}
                        >
                        <div className="w-full">
                            <div className="flex justify-between items-center mb-1">
                                <span className={`font-bold text-base ${isSelected ? 'text-orange-600' : 'text-gray-700'}`}>
                                    {tag.显示名}
                                </span>
                                {tag.稀有度 >= 3 && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 rounded border border-yellow-200">R</span>}
                            </div>
                            <div className="text-xs text-gray-500 leading-snug">
                                {tag.描述}
                            </div>
                        </div>

                        {isSelected && (
                            <div className="absolute top-2 right-2 text-orange-500">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            </div>
                        )}
                        </button>
                    );
                })}
                </div>
            </div>

            {/* Footer Actions */}
            <div className="flex space-x-3 p-4 bg-white border-t border-gray-200 flex-shrink-0 z-10">
                <button
                    onClick={() => setStep(1)}
                    className="flex-1 bg-white hover:bg-gray-50 text-gray-600 font-bold py-3 rounded-xl border-2 border-gray-300 shadow-sm transition text-lg"
                >
                    返回
                </button>
                <button
                    onClick={handleStart}
                    className="flex-1 bg-gradient-to-b from-[#A5D63F] to-[#88B828] hover:from-[#B4E44C] hover:to-[#99CC33] text-white font-bold py-3 rounded-xl shadow-lg border-b-4 border-[#6E951E] active:border-0 active:translate-y-1 transition-all text-lg"
                >
                    开始育成
                </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};