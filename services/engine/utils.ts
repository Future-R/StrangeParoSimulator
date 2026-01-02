
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
  // Check specifically for confinement tag on player (p1)
  // We need to access this via window.GameDebug or similar since we don't have direct access to state here,
  // BUT `getTurnDate` is usually called within React components where we pass props,
  // or via `getTurnInfo` which is pure.
  // To keep it clean, we will rely on the caller to handle visual obfuscation OR 
  // we check the global window.GameDebug if available (hacky but works for this specific requested feature)
  
  if (typeof window !== 'undefined' && window.GameDebug) {
      const p1 = window.GameDebug.characters.find(c => c.instanceId === 'p1');
      if (p1 && p1.标签组.some(t => t.templateId === '监禁')) {
          return "?年?月?日";
      }
  }

  if (turn > 72) return "结局"; 
  return getTurnInfo(turn).dateStr;
};

export const evalValue = (valStr: string, variables?: Record<string, any>): number => {
    if (!valStr) return 0;
    
    const str = String(valStr).trim();

    // 0. Explicit Variable Syntax: 变量.X
    if (str.startsWith('变量.') && variables) {
        const key = str.replace('变量.', '');
        if (variables[key] !== undefined) {
             const val = parseInt(variables[key]);
             return isNaN(val) ? 0 : val;
        }
        return 0; 
    }

    // 1. Random Syntax: 随机(min, max) -> Supports nested evalValue for arguments
    // Supports both ',' and '~' for backward compatibility
    const randomMatch = str.match(/随机\(\s*([^,~\)]+)\s*[,~]\s*([^,~\)]+)\s*\)/);
    if (randomMatch) {
        const minVal = evalValue(randomMatch[1].trim(), variables);
        const maxVal = evalValue(randomMatch[2].trim(), variables);
        return Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
    }

    // 2. Direct Variable Lookup (Legacy support/Direct key usage)
    if (variables && variables[str] !== undefined) {
        const val = parseInt(variables[str]);
        if (!isNaN(val)) return val;
    }

    // 3. Parse Integer
    return parseInt(str) || 0;
};

export const applyRelationshipModifiers = (val: number, target: RuntimeCharacter | undefined, type: '友情' | '爱情'): number => {
    if (val <= 0 || !target) return val;
    let multiplier = 1.0;
    const charm = target.通用属性.魅力 || 0;
    multiplier *= Math.max(0, charm) / 10;
    if (type === '爱情' && target.标签组.some(t => t.templateId === '婚戒')) {
        multiplier *= 0.2; // CHANGED from 0.5 to 0.2
    }
    return Math.floor(val * multiplier);
};
