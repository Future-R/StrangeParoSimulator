
import React, { useState, useEffect, useRef } from 'react';
import { TagTemplate, CharacterTemplate, GameEvent } from '../types';
import { getAvailableStartTags } from '../services/engine';
import { CHARACTERS, EVENTS } from '../constants';

interface SetupScreenProps {
  onComplete: (name: string, gender: '男' | '女', selectedTags: string[], starterId?: string) => void;
}

// 绿色瞄准框组件 (3D立体风格) - Used in Step 2 & 3
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

// Step 1: Label Pill (Even Smaller for mobile)
const LabelPill = ({ children }: { children?: React.ReactNode }) => (
    <div className="bg-[#F2E3DB] text-[#5D4037] font-bold px-1 md:px-2 py-1 rounded-full text-[10px] md:text-sm text-center flex items-center justify-center tracking-wide whitespace-nowrap w-[4.5rem] md:w-24 flex-shrink-0">
        {children}
    </div>
);

// Step 1: 3D Radio Button (Compact)
const RadioButton = ({ label, checked, onClick }: { label: string, checked: boolean, onClick: () => void }) => (
    <button onClick={onClick} className="flex items-center space-x-1 md:space-x-2 group focus:outline-none select-none cursor-pointer hover:opacity-90 active:scale-95 transition-transform">
        {/* Outer Ring - Reduced size */}
        <div className="relative w-6 h-6 md:w-8 md:h-8 rounded-full bg-gradient-to-b from-[#D1D5DB] to-[#9CA3AF] p-[1px] shadow-sm flex-shrink-0">
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
        {/* Label - Smaller text */}
        <span className={`font-bold text-xs md:text-lg tracking-wide whitespace-nowrap ${checked ? 'text-[#5D4037]' : 'text-[#A09085]'}`}>{label}</span>
    </button>
);

export const SetupScreen: React.FC<SetupScreenProps> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('新人');
  // Default gender is now '随机'
  const [gender, setGender] = useState<'男' | '女' | '随机'>('随机'); 
  const [availableTags, setAvailableTags] = useState<TagTemplate[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [blockedTags, setBlockedTags] = useState<string[]>([]);
  
  // Dev Mode State
  const [selectedStarterId, setSelectedStarterId] = useState<string | null>(null);
  
  // MOD Loader Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isNameEmpty = name.trim().length === 0;
  const isDevMode = name === '未来';

  // Logic extracted for reuse (Dev Mode Refresh)
  const generateRandomTraits = () => {
    const allTags = getAvailableStartTags();
    const selected: TagTemplate[] = [];
    const pool = [...allTags];
    
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
    setSelectedTags([]); // Reset selection on refresh
  };

  useEffect(() => {
    generateRandomTraits();
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
    
    // Dev Mode Interception
    if (isDevMode && step === 2) {
        setStep(3);
        return;
    }

    let finalGender: '男' | '女';

    if (selectedTags.includes('马娘')) {
        finalGender = '女';
    } else if (gender === '随机') {
        finalGender = Math.random() > 0.5 ? '男' : '女';
    } else {
        finalGender = gender;
    }

    onComplete(name, finalGender, selectedTags, selectedStarterId || undefined);
  };

  // MOD Parsing Logic
  const handleModLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let loadedCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await file.text();
        
        try {
            // Simple robust parsing for array export
            // Matches: export const [VARNAME] [TYPE_OPT] = [
            const match = text.match(/export const\s+\w+\s*(?::\s*GameEvent\[\])?\s*=\s*\[/);
            if (!match) {
                console.warn(`Skipping ${file.name}: No event array export found.`);
                continue;
            }
            
            const startIdx = match.index! + match[0].length - 1; // Index of '['
            const endIdx = text.lastIndexOf(']');
            
            if (endIdx === -1 || endIdx <= startIdx) {
                 console.warn(`Skipping ${file.name}: Malformed array structure.`);
                 continue;
            }

            const arrayStr = text.substring(startIdx, endIdx + 1);
            
            // Execute as anonymous function to get the array
            // NOTE: This assumes the MOD file content inside the array is valid JS/JSON-like
            // and does not rely on external variables or imports.
            const newEvents = new Function(`return ${arrayStr}`)() as GameEvent[];

            if (Array.isArray(newEvents)) {
                newEvents.forEach(ev => {
                    if (!ev.id) return;
                    const existingIdx = EVENTS.findIndex(e => e.id === ev.id);
                    if (existingIdx !== -1) {
                        EVENTS[existingIdx] = ev;
                        updatedCount++;
                    } else {
                        EVENTS.push(ev);
                        loadedCount++;
                    }
                });
            }
        } catch (err) {
            console.error(`Error loading MOD ${file.name}:`, err);
            alert(`加载 MOD ${file.name} 失败: 格式错误或语法不支持`);
        }
    }

    if (loadedCount > 0 || updatedCount > 0) {
        alert(`MOD 加载完成！\n\n新增事件: ${loadedCount}\n更新事件: ${updatedCount}\n\n事件池已更新。`);
    } else {
        alert("未从文件中提取到有效事件。请确保文件包含 `export const XX = [...]` 格式的事件数组。");
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Improved Visual Styles for Tags
  const getTagStyleInfo = (tag: TagTemplate, isSelected: boolean, isBlocked: boolean) => {
      if (isBlocked) {
          return {
              container: "bg-gray-100 border-gray-200 opacity-60 grayscale cursor-not-allowed",
              title: "text-gray-400",
              desc: "text-gray-400",
              badge: null
          };
      }

      // Base Styles based on Rarity (Material Look)
      let container = "bg-white border-gray-200 hover:border-gray-300";
      let title = "text-gray-700";
      let desc = "text-gray-500";
      let badge = <span className="text-xs bg-gray-100 text-gray-500 px-1.5 rounded border border-gray-200 font-mono">N</span>;

      if (tag.稀有度 === 2) { // R: Silver Metal
          container = "bg-gradient-to-br from-[#F1F5F9] via-[#E2E8F0] to-[#CBD5E1] border-[#94A3B8] shadow-sm hover:brightness-105";
          title = "text-[#334155] drop-shadow-sm";
          desc = "text-[#475569]";
          badge = <span className="text-xs bg-gradient-to-b from-slate-100 to-slate-200 text-slate-700 px-1.5 rounded border border-slate-300 font-bold font-serif shadow-sm">R</span>;
      } else if (tag.稀有度 === 3) { // SR: Gold Metal
          container = "bg-gradient-to-br from-[#FFFBEB] via-[#FEF3C7] to-[#FDE68A] border-[#D97706] shadow-sm hover:brightness-105";
          title = "text-[#92400E] drop-shadow-sm";
          desc = "text-[#B45309]";
          badge = <span className="text-xs bg-gradient-to-b from-amber-100 to-amber-200 text-amber-800 px-1.5 rounded border border-amber-300 font-bold font-serif shadow-sm">SR</span>;
      } else if (tag.稀有度 >= 4) { // SSR: Rainbow Diamond (Green/Teal -> Pink/Purple)
          // Updated colors
          container = "bg-gradient-to-br from-emerald-50 via-sky-50 to-pink-50 border-pink-300 relative group hover:shadow-pink-200/50 hover:shadow-lg transition-all";
          title = "text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-sky-600 to-pink-600 drop-shadow-sm";
          desc = "text-purple-700";
          badge = <span className="text-xs bg-gradient-to-br from-emerald-100 to-pink-100 text-purple-700 px-1.5 rounded border border-pink-300 font-bold font-serif shadow-sm">SSR</span>;
      }

      // Selection Override (Highlight/Glow)
      if (isSelected) {
          // Add Green Selection Frame Effect on top of material
          if (tag.稀有度 >= 4) {
               container += " ring-2 ring-pink-400 shadow-[0_0_15px_rgba(244,114,182,0.4)] transform scale-[1.02]";
          } else if (tag.稀有度 === 3) {
               container += " ring-2 ring-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.4)] transform scale-[1.02]";
          } else if (tag.稀有度 === 2) {
               container += " ring-2 ring-slate-400 shadow-md transform scale-[1.02]";
          } else {
               container = "bg-green-50 border-green-400 ring-1 ring-green-200 shadow-md transform scale-[1.02]";
               title = "text-green-800";
               desc = "text-green-600";
          }
      }

      return { container, title, desc, badge };
  };

  // Filter playable characters for Step 3
  const playableCharacters = Object.values(CHARACTERS).filter(c => !c.isTrainer);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-2 md:p-4 font-sans bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
      
      {/* Container - removed max-h constraint slightly to allow content flow, but keeping structure */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95%] md:max-w-3xl overflow-hidden border-2 border-green-400 flex flex-col">
        
        {/* Header */}
        <div className="bg-[#66D814] p-4 text-center shadow-md relative overflow-hidden flex-shrink-0 z-10">
            <div className="absolute top-0 left-0 w-full h-full bg-white opacity-10 transform -skew-x-12"></div>
            <h1 className="text-2xl font-bold text-white relative z-10 tracking-widest drop-shadow-md">
                {step === 3 ? '初始马娘选择' : '训练员登记'}
            </h1>
            <a 
                href="https://github.com/Future-R/StrangeParoSimulator"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 opacity-60 hover:opacity-100 hover:scale-105 transition-all text-white"
                title="GitHub Project"
            >
                <svg viewBox="0 0 24 24" className="w-5 h-5 drop-shadow-sm" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
            </a>
        </div>

        {step === 1 && (
          // Removed flex-1 and min-h-[400px] to allow container to shrink to fit content
          <div className="px-3 py-6 md:p-8 animate-fade-in overflow-y-auto flex flex-col items-center bg-white">
             
             {/* Subtitle - Smaller */}
             <div className="mb-6 md:mb-8 text-[#5D4037] font-bold text-sm md:text-lg tracking-wide">
                请输入训练员信息
             </div>

             <div className="w-full max-w-lg space-y-4 md:space-y-5 px-0 md:px-6">
                
                {/* Name Input Row */}
                <div className="flex flex-col space-y-1">
                    <div className="flex items-center">
                        <LabelPill>训练员姓名</LabelPill>
                        <div className="ml-2 flex-1 relative">
                            <input 
                                type="text" 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={10}
                                className="w-full bg-white border-2 border-[#E5D5CB] rounded-lg py-1.5 pl-3 pr-8 text-[#4A3B32] font-bold text-sm md:text-lg focus:outline-none focus:border-[#66D814] transition-colors shadow-sm placeholder-[#D1C2B8]"
                                placeholder=""
                            />
                            {/* Pencil Icon */}
                            <svg className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-[#D1C2B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </div>
                    </div>
                    {/* Helper text - Tiny */}
                    <div className="text-right text-[9px] md:text-xs text-[#9CA3AF] font-bold tracking-wide mr-1">
                        请输入1~10个字符的内容
                    </div>
                </div>

                {/* Gender Selection Row - Optimized for small screens */}
                <div className="flex items-center">
                     <LabelPill>性 别</LabelPill>
                     {/* Very tight spacing to fit all 3 options */}
                     <div className="flex items-center ml-2 space-x-2 md:space-x-8 flex-1 justify-start">
                        <RadioButton label="男 性" checked={gender === '男'} onClick={() => setGender('男')} />
                        <RadioButton label="女 性" checked={gender === '女'} onClick={() => setGender('女')} />
                        <RadioButton label="随 机" checked={gender === '随机'} onClick={() => setGender('随机')} />
                     </div>
                </div>

                {/* Spacer */}
                <div className="pt-4 md:pt-8"></div>

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

                {/* MOD Loader Trigger */}
                <div className="mt-4 flex justify-center">
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-gray-400 hover:text-[#66D814] hover:underline cursor-pointer flex items-center gap-1 transition-colors"
                        title="导入 .ts 或 .js 文件以加载自定义事件"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        加载外部事件包
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept=".ts,.js,.txt" 
                        multiple 
                        onChange={handleModLoad}
                    />
                </div>

             </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col h-full animate-fade-in bg-gray-50 overflow-hidden min-h-[50vh]">
            {/* Integrated Info Bar */}
            <div className="bg-white px-4 py-2 border-b border-gray-200 flex justify-between items-center shadow-sm flex-shrink-0">
                 <span className="text-gray-500 font-bold text-xs md:text-sm">请选择3个特质</span>
                 <span className={`px-2 py-0.5 md:px-3 md:py-1 rounded-full text-xs md:text-sm font-bold border ${selectedTags.length === 3 ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                    已选: {selectedTags.length} / 3
                 </span>
            </div>
            
            {/* Scrollable Grid Area */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4 min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableTags.map(tag => {
                    const isSelected = selectedTags.includes(tag.id);
                    const isBlocked = blockedTags.includes(tag.id) && !isSelected;
                    const styles = getTagStyleInfo(tag, isSelected, isBlocked);

                    return (
                        <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        disabled={isBlocked}
                        className={`
                            relative p-3 rounded-xl border-2 text-left transition-all duration-200 flex items-start h-full
                            ${styles.container}
                        `}
                        >
                        {/* SSR Shimmer Animation Layer - Wrapped in clipped container */}
                        {!isBlocked && tag.稀有度 >= 4 && (
                            <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none z-0">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 translate-x-[-150%] animate-shimmer"></div>
                            </div>
                        )}

                        {/* Selection Frame - Outside of clipped container, direct child of button */}
                        {isSelected && <SelectionFrame />}
                        
                        <div className="w-full relative z-10">
                            <div className="flex justify-between items-center mb-1">
                                <span className={`font-bold text-sm md:text-base ${styles.title}`}>
                                    {tag.显示名}
                                </span>
                                {styles.badge}
                            </div>
                            <div className={`text-[10px] md:text-xs leading-snug font-medium ${styles.desc}`}>
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
                {isDevMode && (
                    <button
                        onClick={generateRandomTraits}
                        className="bg-purple-100 hover:bg-purple-200 text-purple-700 font-bold px-4 rounded-xl border-2 border-purple-300 shadow-sm transition text-sm"
                        title="开发者功能：刷新特质"
                    >
                        刷新
                    </button>
                )}
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
                    {isDevMode ? '下一步 (Dev)' : '开始育成'}
                </button>
            </div>
          </div>
        )}

        {/* Step 3: Dev Mode Only - Select Starter */}
        {step === 3 && (
            <div className="flex flex-col h-full animate-fade-in bg-gray-50 overflow-hidden min-h-[50vh]">
                <div className="bg-white px-4 py-2 border-b border-gray-200 flex justify-between items-center shadow-sm flex-shrink-0">
                    <span className="text-gray-500 font-bold text-xs md:text-sm">开发者模式：指定初始马娘</span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 md:p-4 min-h-0">
                    <div className="grid grid-cols-2 gap-3">
                        {playableCharacters.map(char => {
                            const isSelected = selectedStarterId === char.id;
                            return (
                                <button
                                    key={char.id}
                                    onClick={() => setSelectedStarterId(char.id)}
                                    className={`
                                        relative p-3 rounded-xl border-2 text-left transition-all duration-200 h-full
                                        ${isSelected 
                                            ? 'bg-pink-50 border-pink-400 shadow-md transform scale-[1.01]' 
                                            : 'bg-white border-gray-200 hover:border-pink-300'
                                        }
                                    `}
                                >
                                    {isSelected && <SelectionFrame />}
                                    <div className="font-bold text-gray-800">{char.名称}</div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {char.初始标签.join(', ')}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex space-x-3 p-4 bg-white border-t border-gray-200 flex-shrink-0 z-10">
                     <button
                        onClick={() => setStep(2)}
                        className="flex-1 bg-white hover:bg-gray-50 text-gray-600 font-bold py-3 rounded-xl border-2 border-gray-300 shadow-sm transition text-lg"
                    >
                        返回
                    </button>
                    <button
                        onClick={handleStart} // Will execute onComplete now since step is 3
                        disabled={!selectedStarterId}
                        className={`
                            flex-1 font-bold py-3 rounded-xl shadow-lg border-b-4 active:border-0 active:translate-y-1 transition-all text-lg
                            ${!selectedStarterId 
                                ? 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed' 
                                : 'bg-gradient-to-b from-[#66D814] to-[#55B50A] hover:from-[#76E020] hover:to-[#60C510] text-white border-[#4AA00D]'
                            }
                        `}
                    >
                        确认开始
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
