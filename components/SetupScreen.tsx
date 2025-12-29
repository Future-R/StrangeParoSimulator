
import React, { useState, useEffect } from 'react';
import { TagTemplate } from '../types';
import { getAvailableStartTags } from '../services/engine';

interface SetupScreenProps {
  onComplete: (name: string, gender: '男' | '女', selectedTags: string[]) => void;
}

// 绿色瞄准框组件 (3D立体风格) - Used in Step 2
const SelectionFrame = () => (
  <div className="absolute inset-0 pointer-events-none z-20">
    {/* 使用 drop-shadow 滤镜模拟厚度和立体感 */}
    <div className="w-full h-full relative" style={{ filter: 'drop-shadow(0px 4px 0px #3F8C0B)' }}>
        {/* Top Left */}
        <div className="absolute -top-1.5 -left-1.5 w-7 h-7 border-t-[6px] border-l-[6px] border-[#66D814] rounded-tl-xl"></div>
        {/* Top Right */}
        <div className="absolute -top-1.5 -right-1.5 w-7 h-7 border-t-[6px] border-r-[6px] border-[#66D814] rounded-tr-xl"></div>
        {/* Bottom Left */}
        <div className="absolute -bottom-1.5 -left-1.5 w-7 h-7 border-b-[6px] border-l-[6px] border-[#66D814] rounded-bl-xl"></div>
        {/* Bottom Right */}
        <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 border-b-[6px] border-r-[6px] border-[#66D814] rounded-br-xl"></div>
    </div>
  </div>
);

// Step 1: Label Pill (Flat, no shadow)
const LabelPill = ({ children }: { children?: React.ReactNode }) => (
    <div className="bg-[#F2E3DB] text-[#5D4037] font-bold px-2 py-1 rounded-full text-xs md:text-sm text-center flex items-center justify-center tracking-wide whitespace-nowrap w-20 md:w-24 flex-shrink-0">
        {children}
    </div>
);

// Step 1: 3D Radio Button (Smaller on mobile, flex-shrink-0 to keep circular)
const RadioButton = ({ label, checked, onClick }: { label: string, checked: boolean, onClick: () => void }) => (
    <button onClick={onClick} className="flex items-center space-x-1 md:space-x-2 group focus:outline-none select-none cursor-pointer hover:opacity-90 active:scale-95 transition-transform">
        {/* Outer Ring - flex-shrink-0 is crucial */}
        <div className="relative w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-b from-[#D1D5DB] to-[#9CA3AF] p-[1px] shadow-sm flex-shrink-0">
             {/* White Rim */}
            <div className="w-full h-full rounded-full bg-white p-[2px] shadow-inner">
                 {/* Inner Color Sphere */}
                 <div className={`
                    w-full h-full rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] relative
                    ${checked 
                        ? 'bg-gradient-to-b from-[#8BE830] to-[#55B50A]' 
                        : 'bg-gradient-to-b from-[#F3F4F6] to-[#D1D5DB]'
                    }
                 `}>
                    {/* Glossy Highlight */}
                    {checked && <div className="absolute top-1 left-1 w-2 h-1 bg-white/60 rounded-full rotate-[-30deg] blur-[0.5px]"></div>}
                 </div>
            </div>
        </div>
        {/* Label - whitespace-nowrap */}
        <span className={`font-bold text-sm md:text-lg tracking-wide whitespace-nowrap ${checked ? 'text-[#5D4037]' : 'text-[#A09085]'}`}>{label}</span>
    </button>
);

export const SetupScreen: React.FC<SetupScreenProps> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('新人训练员');
  // Default gender is now '随机'
  const [gender, setGender] = useState<'男' | '女' | '随机'>('随机'); 
  const [availableTags, setAvailableTags] = useState<TagTemplate[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [blockedTags, setBlockedTags] = useState<string[]>([]);

  const isNameEmpty = name.trim().length === 0;

  useEffect(() => {
    const allTags = getAvailableStartTags();
    const selected: TagTemplate[] = [];
    const pool = [...allTags];
    
    // Weighted selection logic
    const TARGET_COUNT = 10;
    
    for (let i = 0; i < TARGET_COUNT && pool.length > 0; i++) {
        const totalWeight = pool.reduce((sum, t) => sum + (5 - t.稀有度), 0);
        let r = Math.random() * totalWeight;
        
        let foundIndex = -1;
        for (let j = 0; j < pool.length; j++) {
            r -= (5 - pool[j].稀有度);
            if (r <= 0) {
                foundIndex = j;
                break;
            }
        }
        
        if (foundIndex === -1) foundIndex = pool.length - 1;
        
        selected.push(pool[foundIndex]);
        pool.splice(foundIndex, 1);
    }

    setAvailableTags(selected);
  }, []);

  useEffect(() => {
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
    if (isNameEmpty) return;
    
    let finalGender: '男' | '女';

    if (selectedTags.includes('马娘')) {
        finalGender = '女';
    } else if (gender === '随机') {
        finalGender = Math.random() > 0.5 ? '男' : '女';
    } else {
        finalGender = gender;
    }

    onComplete(name, finalGender, selectedTags);
  };

  const getTagColors = (tag: TagTemplate, isSelected: boolean) => {
      if (isSelected) return { title: 'text-orange-600', border: 'border-orange-400', bg: 'bg-yellow-50' };
      
      switch (tag.稀有度) {
          case 2: return { title: 'text-slate-700', border: 'border-gray-200', bg: 'bg-slate-50' }; // Silver
          case 3: return { title: 'text-yellow-700', border: 'border-yellow-200', bg: 'bg-yellow-50' }; // Gold
          case 4: return { title: 'text-purple-600', border: 'border-purple-200', bg: 'bg-purple-50' }; // Diamond
          default: return { title: 'text-zinc-700', border: 'border-gray-200', bg: 'bg-white' }; // Iron
      }
  };

  const getRarityBadge = (rarity: number) => {
      if (rarity === 2) return <span className="text-xs bg-slate-100 text-slate-600 px-1.5 rounded border border-slate-200">R</span>;
      if (rarity === 3) return <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 rounded border border-yellow-200">SR</span>;
      if (rarity >= 4) return <span className="text-xs bg-purple-100 text-purple-600 px-1.5 rounded border border-purple-200 font-bold">SSR</span>;
      return <span className="text-xs bg-gray-100 text-gray-500 px-1.5 rounded border border-gray-200">N</span>;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-sans bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
      
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border-2 border-green-400 flex flex-col max-h-[90vh]">
        
        {/* Header - Keep title large */}
        <div className="bg-[#66D814] p-4 text-center shadow-md relative overflow-hidden flex-shrink-0 z-10">
            <div className="absolute top-0 left-0 w-full h-full bg-white opacity-10 transform -skew-x-12"></div>
            <h1 className="text-2xl font-bold text-white relative z-10 tracking-widest drop-shadow-md">
                训练员登记
            </h1>
        </div>

        {step === 1 && (
          <div className="p-6 md:p-8 pb-10 md:pb-12 animate-fade-in flex-1 overflow-y-auto flex flex-col items-center bg-white min-h-[400px]">
             
             {/* Subtitle - Smaller */}
             <div className="mb-8 text-[#5D4037] font-bold text-base md:text-lg tracking-wide">
                请输入训练员信息
             </div>

             <div className="w-full max-w-lg space-y-5 px-1 md:px-6">
                
                {/* Name Input Row */}
                <div className="flex flex-col space-y-1">
                    <div className="flex items-center">
                        <LabelPill>训练员姓名</LabelPill>
                        <div className="ml-2 md:ml-3 flex-1 relative">
                            <input 
                                type="text" 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={10}
                                className="w-full bg-white border-2 border-[#E5D5CB] rounded-lg py-1.5 pl-3 pr-8 text-[#4A3B32] font-bold text-base md:text-lg focus:outline-none focus:border-[#66D814] transition-colors shadow-sm placeholder-[#D1C2B8]"
                                placeholder=""
                            />
                            {/* Pencil Icon */}
                            <svg className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-[#D1C2B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </div>
                    </div>
                    {/* Helper text - Smaller */}
                    <div className="text-right text-[10px] md:text-xs text-[#9CA3AF] font-bold tracking-wide mr-1">
                        请输入1~10个字符的内容
                    </div>
                </div>

                {/* Gender Selection Row */}
                <div className="flex items-center">
                     <LabelPill>性 别</LabelPill>
                     {/* Reduced margin and spacing for mobile compatibility */}
                     <div className="flex items-center ml-3 md:ml-6 space-x-3 md:space-x-8 flex-1 justify-start overflow-x-visible">
                        <RadioButton label="男 性" checked={gender === '男'} onClick={() => setGender('男')} />
                        <RadioButton label="女 性" checked={gender === '女'} onClick={() => setGender('女')} />
                        <RadioButton label="随 机" checked={gender === '随机'} onClick={() => setGender('随机')} />
                     </div>
                </div>

                {/* Spacer */}
                <div className="pt-6 md:pt-8"></div>

                {/* Submit Button */}
                <div className="flex justify-center">
                  <button
                      onClick={() => { if(!isNameEmpty) setStep(2); }}
                      disabled={isNameEmpty}
                      className={`
                          w-full max-w-xs font-black py-3 px-10 rounded-xl text-lg md:text-xl tracking-widest flex items-center justify-center border-2 transition-all
                          ${isNameEmpty 
                             ? 'bg-gray-400 border-gray-500 text-gray-200 shadow-none cursor-not-allowed grayscale opacity-80' 
                             : 'bg-gradient-to-b from-[#8BE830] to-[#55B50A] hover:from-[#9BF040] hover:to-[#60C510] text-white shadow-[0_4px_0_#3F8C0B] active:shadow-none active:translate-y-1 border-[#66D814] cursor-pointer'
                          }
                      `}
                   >
                      登 记
                   </button>
                </div>

             </div>
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
                    const colors = getTagColors(tag, isSelected);

                    return (
                        <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        disabled={isBlocked}
                        className={`
                            relative p-3 rounded-xl border-2 text-left transition-all duration-200 flex items-start h-full
                            ${isSelected 
                                ? 'shadow-md transform scale-[1.01]' 
                                : isBlocked
                                    ? 'opacity-60 cursor-not-allowed grayscale'
                                    : 'hover:border-green-400 hover:shadow-sm'
                            }
                            ${colors.bg} ${colors.border}
                        `}
                        >
                        {isSelected && <SelectionFrame />}
                        <div className="w-full">
                            <div className="flex justify-between items-center mb-1">
                                <span className={`font-bold text-base ${colors.title}`}>
                                    {tag.显示名}
                                </span>
                                {getRarityBadge(tag.稀有度)}
                            </div>
                            <div className="text-xs text-gray-500 leading-snug">
                                {tag.描述}
                            </div>
                        </div>
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
                    className="flex-1 bg-gradient-to-b from-[#66D814] to-[#55B50A] hover:from-[#76E020] hover:to-[#60C510] text-white font-bold py-3 rounded-xl shadow-lg border-b-4 border-[#4AA00D] active:border-0 active:translate-y-1 transition-all text-lg"
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
