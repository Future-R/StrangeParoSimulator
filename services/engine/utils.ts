
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
      period: isLate ? '后半' : '前半',
      dateStr: `第${year}年 ${month}月 ${isLate ? '后半' : '前半'}`
  };
};

export const getTurnDate = (turn: number): string => {
  // Check specifically for confinement tag on player (p1)
  if (typeof window !== 'undefined' && window.GameDebug) {
      const p1 = window.GameDebug.characters.find(c => c.instanceId === 'p1');
      if (p1 && p1.标签组.some(t => t.templateId === '监禁')) {
          return "?年?月?日";
      }
  }

  if (turn > 72) return "结局"; 
  return getTurnInfo(turn).dateStr;
};

export const evalValue = (valStr: string, variables?: Record<string, any>, subject?: RuntimeCharacter, allChars?: RuntimeCharacter[]): number => {
    if (!valStr) return 0;
    
    const str = String(valStr).trim();

    if (str === '队伍人数' && allChars) {
        return allChars.filter(c => c.inTeam).length;
    }

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
        const minVal = evalValue(randomMatch[1].trim(), variables, subject, allChars);
        const maxVal = evalValue(randomMatch[2].trim(), variables, subject, allChars);
        return Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
    }

    // 2. Property Access Syntax: [当前角色.]属性.XXX
    if (subject && (str.startsWith('属性.') || str.startsWith('当前角色.属性.'))) {
        const attrName = str.includes('当前角色.属性.') 
            ? str.replace('当前角色.属性.', '') 
            : str.replace('属性.', '');
        
        // @ts-ignore
        const val = subject.通用属性[attrName] ?? subject.竞赛属性[attrName];
        if (val !== undefined) return val;
    }

    // 2.5 Tag Layer Access: 标签组(TagID).层数
    if (subject && (str.includes('标签组') && str.includes('.层数'))) {
         const match = str.match(/标签组\s*\(\s*([^)]+)\s*\)\.层数/);
         if (match) {
             const tagId = match[1].trim();
             const tag = subject.标签组.find(t => t.templateId === tagId);
             return tag ? tag.层数 : 0;
         }
    }

    // 3. Direct Variable Lookup (Legacy support/Direct key usage)
    if (variables && variables[str] !== undefined) {
        const val = parseInt(variables[str]);
        if (!isNaN(val)) return val;
    }

    // 4. Parse Integer
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
