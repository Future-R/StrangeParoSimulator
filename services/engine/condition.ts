
import { RuntimeCharacter } from '../../types';
import { getTurnInfo, evalValue } from './utils';
import { resolveTargetCharacter } from './character';

export const checkCondition = (condition: string, char: RuntimeCharacter, turn: number, choiceIndex?: number, allChars: RuntimeCharacter[] = [], variables?: Record<string, any>): boolean => {
  if (!condition || condition.trim() === '') return true;

  // 1. Basic OR (||) Support
  // We split by '||' at the top level (ignoring parentheses). If ANY part is true, return true.
  let parenLevel = 0;
  for (let i = 0; i < condition.length; i++) {
      const c = condition[i];
      if (c === '(') parenLevel++;
      if (c === ')') parenLevel--;
      
      if (c === '|' && condition[i+1] === '|' && parenLevel === 0) {
          const left = condition.substring(0, i).trim();
          const right = condition.substring(i+2).trim();
          // Short-circuit logic: if left is true, we don't strictly need to evaluate right, but recursion handles it.
          // Note: Standard JS precedence is && before ||. 
          // However, here we are splitting by || FIRST. 
          // Example: A && B || C. 
          // Split: "A && B" OR "C". 
          // If check("A && B") is true, result is true. Else check("C").
          // This correctly implements A && B || C (AND binds tighter).
          return checkCondition(left, char, turn, choiceIndex, allChars, variables) || 
                 checkCondition(right, char, turn, choiceIndex, allChars, variables);
      }
  }

  // 2. AND (&&) Logic (Existing)
  const subConditions: string[] = [];
  parenLevel = 0;
  let buffer = '';
  
  for (let i = 0; i < condition.length; i++) {
      const c = condition[i];
      if (c === '(') parenLevel++;
      if (c === ')') parenLevel--;
      
      if (c === '&' && condition[i+1] === '&' && parenLevel === 0) {
          subConditions.push(buffer.trim());
          buffer = '';
          i++; 
      } else {
          buffer += c;
      }
  }
  if (buffer.trim()) subConditions.push(buffer.trim());

  const turnInfo = getTurnInfo(turn);

  return subConditions.every(cond => {
    if (cond === 'true') return true;
    if (cond === 'false') return false;

    // Parentheses stripping for simple cases (Recursion)
    if (cond.startsWith('(') && cond.endsWith(')')) {
        // Simple check to ensure it's a wrapping pair, not "(A) && (B)" (though split logic handles top level)
        // Since we split by && already, "A && B" inside parens is one chunk.
        return checkCondition(cond.substring(1, cond.length - 1), char, turn, choiceIndex, allChars, variables);
    }

    if (cond.startsWith('已选序号')) {
        const match = cond.match(/已选序号\s*==\s*(\d+)/);
        if (match) return choiceIndex === parseInt(match[1]);
    }

    if (cond.includes('当前月')) {
        const match = cond.match(/当前月\s*([>=<]+|==)\s*(\d+)/);
        if (match) {
            const op = match[1];
            const val = parseInt(match[2]);
            switch (op) {
                case '>': return turnInfo.month > val;
                case '>=': return turnInfo.month >= val;
                case '<': return turnInfo.month < val;
                case '<=': return turnInfo.month <= val;
                case '==': return turnInfo.month === val;
            }
        }
    }
    if (cond.includes('当前年')) {
        const match = cond.match(/当前年\s*([>=<]+|==)\s*(\d+)/);
        if (match) {
            const op = match[1];
            const val = parseInt(match[2]);
            switch (op) {
                case '>': return turnInfo.year > val;
                case '>=': return turnInfo.year >= val;
                case '<': return turnInfo.year < val;
                case '<=': return turnInfo.year <= val;
                case '==': return turnInfo.year === val;
            }
        }
    }
    if (cond.includes('当前旬')) {
        const match = cond.match(/当前旬\s*==\s*"([^"]+)"/);
        if (match) return turnInfo.period === match[1];
    }

    if (cond.startsWith('变量.')) {
        const match = cond.match(/变量\.([a-zA-Z0-9_\u4e00-\u9fa5]+)\s*([>=<]+|==)\s*(-?\d+)/);
        if (match && variables) {
             const key = match[1];
             const op = match[2];
             const val = parseInt(match[3]);
             const varVal = typeof variables[key] === 'number' ? variables[key] : 0;
             switch (op) {
                case '>': return varVal > val;
                case '>=': return varVal >= val;
                case '<': return varVal < val;
                case '<=': return varVal <= val;
                case '==': return varVal === val;
             }
        }
    }
    
    if (cond.startsWith('变量存在')) {
        const match = cond.match(/变量存在\s+([a-zA-Z0-9_\u4e00-\u9fa5]+)/);
        if (match && variables) {
            const key = match[1];
            return variables[key] !== undefined && variables[key] !== null;
        }
        return false;
    }

    if (cond.startsWith('存在角色满足')) {
        const innerMatch = cond.match(/存在角色满足\((.*)\)/);
        if (innerMatch) {
            const innerCond = innerMatch[1];
            return allChars.some(c => checkCondition(innerCond, c, turn, choiceIndex, allChars, variables));
        }
    }

    let subject = char;
    let propPath = cond;

    const dotIndex = cond.indexOf('.');
    if (dotIndex !== -1 && !cond.startsWith('变量.')) { 
        const potentialSubjectKey = cond.substring(0, dotIndex);
        const resolved = resolveTargetCharacter(potentialSubjectKey, char, allChars, variables);
        if (resolved) {
            subject = resolved;
            propPath = cond.substring(dotIndex + 1); 
        } else if (potentialSubjectKey === '当前角色') {
             propPath = cond.substring(dotIndex + 1);
        }
    }

    if (propPath.includes('标签组 存在')) {
      const match = propPath.match(/"([^"]+)"/);
      if (match) return subject.标签组.some(t => t.templateId === match[1]);
      return false;
    }
    
    if (propPath.includes('标签组 不存在')) {
      const match = propPath.match(/"([^"]+)"/);
      if (match) return !subject.标签组.some(t => t.templateId === match[1]);
      return true;
    }

    // Updated Random Check: supports 随机(min, max) and variables
    if (cond.startsWith('随机')) {
      const match = cond.match(/随机\(\s*([^,~\)]+)\s*[,~]\s*([^,~\)]+)\s*\)\s*([>=<]+|==)\s*(.+)/);
      if (match) {
        const min = evalValue(match[1].trim(), variables);
        const max = evalValue(match[2].trim(), variables);
        const op = match[3];
        const val = evalValue(match[4].trim(), variables);
        
        const rand = Math.floor(Math.random() * (max - min + 1)) + min;
        switch (op) {
          case '>': return rand > val;
          case '>=': return rand >= val;
          case '<': return rand < val;
          case '<=': return rand <= val;
          case '==': return rand === val;
        }
      }
    }

    if (propPath.includes('属性.')) {
      const match = propPath.match(/属性\.([\w\u4e00-\u9fa5]+)\s*([>=<]+|==)\s*(\d+)/);
      if (match) {
        const attrName = match[1];
        const op = match[2];
        const val = parseInt(match[3]);
        // @ts-ignore
        const currentVal = subject.通用属性[attrName] ?? subject.竞赛属性[attrName] ?? 0;
        switch (op) {
          case '>': return currentVal > val;
          case '>=': return currentVal >= val;
          case '<': return currentVal < val;
          case '<=': return currentVal <= val;
          case '==': return currentVal === val;
        }
      }
    }

    if (propPath.includes('在队伍')) {
        const match = propPath.match(/在队伍\s*==\s*(true|false)/);
        if (match) return subject.inTeam === (match[1] === 'true');
    }

    if (propPath.includes('关系.')) {
        const match = propPath.match(/关系\.([\w\u4e00-\u9fa5]+)\.([\w\u4e00-\u9fa5]+)\s*([>=<]+|==)\s*(\d+)/);
        if (match) {
            const targetName = match[1];
            const type = match[2] as '友情' | '爱情';
            const op = match[3];
            const val = parseInt(match[4]);
            
            let targetId = 'p1'; 
            if (targetName === '玩家') {
                targetId = 'p1';
            } else {
                const targetChar = resolveTargetCharacter(targetName, char, allChars, variables);
                if (targetChar) targetId = targetChar.instanceId;
                else return false;
            }
            const rel = subject.关系列表[targetId] || { 友情: 0, 爱情: 0 };
            const currentVal = rel[type];
            switch (op) {
                case '>': return currentVal > val;
                case '>=': return currentVal >= val;
                case '<': return currentVal < val;
                case '<=': return currentVal <= val;
                case '==': return currentVal === val;
            }
        }
    }

    if (cond.includes('训练员.性别')) {
        const trainer = allChars.find(c => c.templateId === '训练员' || c.instanceId === 'p1');
        if (trainer) {
            const match = cond.match(/训练员\.性别\s*==\s*"([^"]+)"/);
            if (match) return trainer.性别 === match[1];
        }
    }

    if (propPath.includes('模板ID')) {
        const match = propPath.match(/模板ID\s*([!=]=)\s*"([^"]+)"/);
        if (match) {
            const op = match[1];
            const val = match[2];
            if (op === '==') return subject.templateId === val;
            if (op === '!=') return subject.templateId !== val;
        }
    }
    return false;
  });
};