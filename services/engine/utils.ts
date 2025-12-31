
import { RuntimeCharacter } from '../../types';

export const getTurnInfo = (turn: number) => {
  const adjustedTurn = Math.max(0, turn - 1);
  const year = Math.floor(adjustedTurn / 24) + 1;
  const monthIndex = Math.floor((adjustedTurn % 24) / 2);
  const month = monthIndex + 1;
  const isLate = adjustedTurn % 2 === 1; 
  return { 
      year, 
      month, 
      isLate, 
      period: isLate ? '下旬' : '上旬',
      dateStr: `第${year}年 ${month}月 ${isLate ? '下旬' : '上旬'}`
  };
};

export const getTurnDate = (turn: number): string => {
  if (turn > 72) return "结局"; 
  return getTurnInfo(turn).dateStr;
};

export const evalValue = (valStr: string, variables?: Record<string, any>): number => {
    if (!valStr) return 0;
    
    // 1. Try Variable Lookup
    if (variables && variables[valStr] !== undefined) {
        const val = parseInt(variables[valStr]);
        if (!isNaN(val)) return val;
    }

    // 2. Try Random Syntax: 随机(min~max)
    const randomMatch = valStr.toString().match(/随机\((-?\d+)~(\-?\d+)\)/);
    if (randomMatch) {
        const min = parseInt(randomMatch[1]);
        const max = parseInt(randomMatch[2]);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // 3. Parse Integer
    return parseInt(valStr) || 0;
};

export const applyRelationshipModifiers = (val: number, target: RuntimeCharacter | undefined, type: '友情' | '爱情'): number => {
    if (val <= 0 || !target) return val;
    let multiplier = 1.0;
    const charm = target.通用属性.魅力 || 0;
    multiplier *= Math.max(0, charm) / 10;
    if (type === '爱情' && target.标签组.some(t => t.templateId === '婚戒')) {
        multiplier *= 0.5;
    }
    return Math.floor(val * multiplier);
};
