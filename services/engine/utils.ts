
import { RuntimeCharacter } from '../../types';
import { resolveTargetCharacter } from './character';

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
    if (str.startsWith('随机')) {
        // Use updated argPattern from condition.ts logic to be consistent
        const argPattern = '(?:(?:[^,]+\\.)?标签组\\s*\\([^)]+\\)\\s*\\.层数|[^,~\\)]+)';
        const regex = new RegExp(`随机\\(\\s*(${argPattern})\\s*[,~]\\s*(${argPattern})\\s*\\)`);
        const randomMatch = str.match(regex);
        
        if (randomMatch) {
            const minVal = evalValue(randomMatch[1].trim(), variables, subject, allChars);
            const maxVal = evalValue(randomMatch[2].trim(), variables, subject, allChars);
            return Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
        }
    }

    // 2. Property Access Syntax: [Target.]属性.XXX
    if (str.includes('属性.')) {
        let targetChar = subject;
        let attrName = str;

        if (str.includes('.')) {
            const parts = str.split('.');
            const propIndex = parts.indexOf('属性');
            if (propIndex !== -1) {
                // If there's a prefix before '属性', resolve target
                if (propIndex > 0) {
                    const targetKey = parts.slice(0, propIndex).join('.');
                    if (targetKey !== '当前角色') {
                        const resolved = resolveTargetCharacter(targetKey, subject || (allChars && allChars[0]) as RuntimeCharacter, allChars || [], variables);
                        if (resolved) targetChar = resolved;
                    }
                }
                attrName = parts.slice(propIndex + 1).join('.');
            }
        }
        
        if (targetChar) {
            // @ts-ignore
            const val = targetChar.通用属性[attrName] ?? targetChar.竞赛属性[attrName];
            if (val !== undefined) return val;
        }
    }

    // 2.5 Tag Layer Access: [Target.]标签组(TagID).层数
    if (str.includes('标签组') && str.includes('.层数')) {
         const match = str.match(/(?:(.+)\.)?标签组\s*\(\s*([^)]+)\s*\)\.层数/);
         if (match) {
             const targetKey = match[1];
             const tagId = match[2].trim().replace(/['"]/g, ''); // Strip quotes
             
             let targetChar = subject;
             if (targetKey && allChars) {
                 const resolved = resolveTargetCharacter(targetKey, subject || allChars[0], allChars, variables);
                 if (resolved) targetChar = resolved;
             }

             if (targetChar) {
                 const tag = targetChar.标签组.find(t => t.templateId === tagId);
                 return tag ? tag.层数 : 0;
             }
             return 0;
         }
    }

    // 2.6 Relationship Access: [Target.]关系.[Object].[友情/爱情]
    if (str.includes('关系.')) {
        const match = str.match(/(?:(.+)\.)?关系\.((?:变量\.)?[^\.]+)\.([\w\u4e00-\u9fa5]+)/);
        if (match) {
            const subjectKey = match[1];
            const objectKey = match[2];
            const type = match[3] as '友情' | '爱情';

            let subjectChar = subject;
            if (subjectKey && allChars) {
                const resolved = resolveTargetCharacter(subjectKey, subject || allChars[0], allChars, variables);
                if (resolved) subjectChar = resolved;
            }

            if (subjectChar && allChars) {
                const objectChar = resolveTargetCharacter(objectKey, subjectChar, allChars, variables);
                if (objectChar) {
                    const rel = subjectChar.关系列表[objectChar.instanceId] || { 友情: 0, 爱情: 0 };
                    return rel[type] || 0;
                }
            }
            return 0;
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
