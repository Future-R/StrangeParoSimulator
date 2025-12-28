
import { RuntimeCharacter, GameEvent, EventOption, RuntimeTag, CharacterTemplate, GameState, LogEntry, PendingEventItem, TagTemplate, EventBranch } from '../types';
import { EVENTS, CHARACTERS, TAGS } from '../constants';

// ===========================
// 帮助函数 (Helpers)
// ===========================

export const getTurnInfo = (turn: number) => {
  // Fix: Shift turn by 1 so Turn 1 is the start
  const adjustedTurn = Math.max(0, turn - 1);
  const year = Math.floor(adjustedTurn / 24) + 1;
  const monthIndex = Math.floor((adjustedTurn % 24) / 2);
  const month = monthIndex + 1;
  // Even is Early (0), Odd is Late (1) based on adjusted turn
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
  if (turn > 72) return "结局"; // Handle ending phase
  return getTurnInfo(turn).dateStr;
};

export const createRuntimeCharacter = (template: CharacterTemplate, instanceId: string, inTeam: boolean, overrideName?: string, overrideGender?: '男'|'女', extraTagIds?: string[]): RuntimeCharacter => {
  const initialTags = [...template.初始标签];
  if (extraTagIds) {
    extraTagIds.forEach(t => {
        if (!initialTags.includes(t)) initialTags.push(t);
    });
  }

  const tags: RuntimeTag[] = initialTags.map(tagId => ({
    templateId: tagId,
    添加日期: 0,
    层数: 1
  }));

  // 初始化关系列表，默认为空
  return {
    instanceId,
    templateId: template.id,
    名称: overrideName || template.名称,
    性别: overrideGender || template.性别,
    通用属性: { ...template.通用属性 },
    竞赛属性: { ...template.竞赛属性 },
    适性: template.适性 ? { ...template.适性 } : undefined, // Copy aptitudes
    标签组: tags,
    已触发事件: {},
    关系列表: {},
    称呼列表: template.称呼列表, // 继承模板配置
    inTeam: inTeam
  };
};

export const getAvailableStartTags = (): TagTemplate[] => {
    return Object.values(TAGS).filter(t => t.人类可用 && t.开局可选);
};

// 解析目标角色 (支持 'p1', '当前角色', '训练员', 或变量名)
const resolveTargetCharacter = (key: string, current: RuntimeCharacter, allChars: RuntimeCharacter[], variables?: Record<string, any>): RuntimeCharacter | undefined => {
    if (key === '当前角色') return current;
    if (key === '训练员') return allChars.find(c => c.templateId === '训练员' || c.instanceId === 'p1');
    if (key === '玩家') return allChars.find(c => c.instanceId === 'p1');
    if (variables && variables[key]) {
        // Assume variable stores instanceId for characters (string)
        if (typeof variables[key] === 'string' && (variables[key].startsWith('c') || variables[key].startsWith('p') || variables[key].startsWith('npc'))) {
             return allChars.find(c => c.instanceId === variables[key]);
        }
    }
    // Try find by ID directly or Name
    return allChars.find(c => c.instanceId === key || c.名称 === key);
};

// 增强判别：支持 choiceIndex, 关系判断, 以及训练员属性判断, 变量判断, 日期判断
export const checkCondition = (condition: string, char: RuntimeCharacter, turn: number, choiceIndex?: number, allChars: RuntimeCharacter[] = [], variables?: Record<string, any>): boolean => {
  if (!condition || condition.trim() === '') return true;

  const subConditions = condition.split('&&').map(s => s.trim());
  const turnInfo = getTurnInfo(turn);

  return subConditions.every(cond => {
    // 0. 基础布尔值支持 (Fix for Branching fallback)
    if (cond === 'true') return true;
    if (cond === 'false') return false;

    // 1. 选项序号判别 (用于分支组)
    if (cond.startsWith('已选序号')) {
        const match = cond.match(/已选序号\s*==\s*(\d+)/);
        if (match) {
            return choiceIndex === parseInt(match[1]);
        }
    }

    // 2. 日期/回合判别 (New)
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
        if (match) {
            return turnInfo.period === match[1];
        }
    }

    // 3. 变量数值检查 (New: 变量.Key > Val)
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

    // 解析主语 (Subject Resolution)
    let subject = char;
    let propPath = cond;

    const dotIndex = cond.indexOf('.');
    if (dotIndex !== -1 && !cond.startsWith('变量.')) { // Avoid confusing variable checks
        const potentialSubjectKey = cond.substring(0, dotIndex);
        // Special Logic: Check if it starts with '训练员' or '随机角色' etc.
        const resolved = resolveTargetCharacter(potentialSubjectKey, char, allChars, variables);
        if (resolved) {
            subject = resolved;
            propPath = cond.substring(dotIndex + 1); // remove subject prefix
        } else if (potentialSubjectKey === '当前角色') {
             propPath = cond.substring(dotIndex + 1);
        }
    }

    // 4. 标签检查
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

    // 5. 随机数
    if (cond.startsWith('随机')) {
      const match = cond.match(/随机\(\s*(\d+)~(\d+)\s*\)\s*([>=<]+|==)\s*(\d+)/);
      if (match) {
        const min = parseInt(match[1]);
        const max = parseInt(match[2]);
        const op = match[3];
        const val = parseInt(match[4]);
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

    // 6. 属性检查
    // FIX: Updated regex to support Chinese characters ([\w\u4e00-\u9fa5]+)
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

    // 7. 关系检查 (General Relationship Check)
    // Supports: 关系.TargetName.Type op Value
    if (propPath.includes('关系.')) {
        const match = propPath.match(/关系\.([\w\u4e00-\u9fa5]+)\.([\w\u4e00-\u9fa5]+)\s*([>=<]+|==)\s*(\d+)/);
        if (match) {
            const targetName = match[1];
            const type = match[2] as '友情' | '爱情';
            const op = match[3];
            const val = parseInt(match[4]);
            
            let targetId = 'p1'; // Default to player if implied, but regex requires explicit target name
            
            if (targetName === '玩家') {
                targetId = 'p1';
            } else {
                const targetChar = resolveTargetCharacter(targetName, char, allChars, variables);
                if (targetChar) {
                    targetId = targetChar.instanceId;
                } else {
                    return false; // Target character not found, condition fails
                }
            }
            
            // Check relationship stored on the Subject towards the Target
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

    // 8. 训练员属性检查
    if (cond.includes('训练员.性别')) {
        const trainer = allChars.find(c => c.templateId === '训练员' || c.instanceId === 'p1');
        if (trainer) {
            const match = cond.match(/训练员\.性别\s*==\s*"([^"]+)"/);
            if (match) {
                return trainer.性别 === match[1];
            }
        }
    }

    if (propPath.includes('模板ID')) {
        // FIX: Support !=
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

// ===========================
// DSL 解析器 (DSL Parser)
// ===========================

export const parseText = (text: string, char: RuntimeCharacter, turn: number, allChars: RuntimeCharacter[] = [], variables?: Record<string, any>): string => {
  let result = text;
  
  // 查找训练员
  const trainer = allChars.find(c => c.templateId === '训练员') || allChars.find(c => c.instanceId === 'p1');
  const trainerGender = trainer?.性别 || '男';

  // 0. 随机文字解析 (New: {随机文字("A", "B")})
  // Executed first so inner variables can be parsed later
  result = result.replace(/{随机文字\((.*?)\)}/g, (match, argsContent) => {
      const options: string[] = [];
      // Match content inside quotes
      const argPattern = /"([^"]*)"/g;
      let argMatch;
      while ((argMatch = argPattern.exec(argsContent)) !== null) {
          options.push(argMatch[1]);
      }
      if (options.length === 0) return match;
      return options[Math.floor(Math.random() * options.length)];
  });

  // 1. 动态称呼解析
  let calling = '训练员'; // 默认值
  if (char.称呼列表 && char.称呼列表.length > 0) {
      for (const rule of char.称呼列表) {
          if (!rule.判别式 || checkCondition(rule.判别式, char, turn, undefined, allChars, variables)) {
              calling = rule.称呼;
              break;
          }
      }
  }

  // 2. 基础替换
  // FIX: Updated regex to support Chinese characters in attribute names
  result = result.replace(/{当前角色\.名称}/g, char.名称);
  result = result.replace(/{当前角色\.属性\.([\w\u4e00-\u9fa5]+)}/g, (_, attr) => {
    // @ts-ignore
    return (char.通用属性[attr] ?? char.竞赛属性[attr] ?? 0).toString();
  });

  // 3. 变量替换 (NEW: {VarName.名称} or {VarName})
  if (variables) {
      result = result.replace(/{([a-zA-Z0-9_\u4e00-\u9fa5]+)\s*([><]=?|==)\s*(-?\d+)\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"}/g, 
        (match, varName, op, valStr, trueText, falseText) => {
             const val = parseInt(valStr);
             const varVal = typeof variables[varName] === 'number' ? variables[varName] : 0;
             let res = false;
             switch (op) {
                case '>': res = varVal > val; break;
                case '>=': res = varVal >= val; break;
                case '<': res = varVal < val; break;
                case '<=': res = varVal <= val; break;
                case '==': res = varVal === val; break;
             }
             return res ? trueText : falseText;
      });
      
      result = result.replace(/{当前角色\.标签组 存在 "([^"]+)" \? "([^"]*)" : "([^"]*)"}/g, 
        (match, tagId, trueText, falseText) => {
            const hasTag = char.标签组.some(t => t.templateId === tagId);
            return hasTag ? trueText : falseText;
      });

      result = result.replace(/{([a-zA-Z0-9_\u4e00-\u9fa5]+)(\.([a-zA-Z0-9_\u4e00-\u9fa5]+))?}/g, (match, varName, _, prop) => {
          if (varName === '当前角色') return match; 
          if (varName === '训练员') {
             if (prop === '称呼') return calling;
             if (prop === '兄姐') return calling;
             if (prop === '他她') return trainerGender === '男' ? '他' : '她';
             if (prop === '你') return '你';
             return match; 
          }

          const val = variables[varName];
          if (!prop && (typeof val === 'number' || typeof val === 'string')) {
              return val.toString();
          }
          if (prop && typeof val === 'string') {
              const targetChar = allChars.find(c => c.instanceId === val);
              if (!targetChar) return match;
              if (prop === '名称') return targetChar.名称;
              // @ts-ignore
              if (targetChar.通用属性[prop] !== undefined) return targetChar.通用属性[prop].toString();
              // @ts-ignore
              if (targetChar.竞赛属性[prop] !== undefined) return targetChar.竞赛属性[prop].toString();
          }
          return match;
      });
  }

  // 4. 称呼替换 (Unified)
  result = result.replace(/{训练员\.称呼}/g, calling);
  result = result.replace(/{训练员\.兄姐}/g, calling); 
  
  // 辅助代词
  result = result.replace(/{训练员\.他她}/g, trainerGender === '男' ? '他' : '她');
  result = result.replace(/{训练员\.你}/g, '你'); 

  // 5. 随机队友替换 (Legacy fallback)
  if (result.includes('{随机队友}')) {
      const others = allChars.filter(c => c.instanceId !== char.instanceId && c.inTeam);
      const randomMate = others.length > 0 
        ? others[Math.floor(Math.random() * others.length)].名称 
        : '某个路过的马娘';
      result = result.replace(/{随机队友}/g, randomMate);
  }

  return result;
};

// ===========================
// State Diffing for Clean Logs
// ===========================

export const generateStateDiffLog = (oldChars: RuntimeCharacter[], newChars: RuntimeCharacter[], mainCharId: string): string[] => {
    const diffs: string[] = [];

    newChars.forEach(newChar => {
        const oldChar = oldChars.find(c => c.instanceId === newChar.instanceId);
        if (!oldChar) return;

        // 1. Generic Attributes
        Object.keys(newChar.通用属性).forEach(key => {
            const k = key as keyof typeof newChar.通用属性;
            const delta = newChar.通用属性[k] - oldChar.通用属性[k];
            if (delta !== 0) {
                const prefix = newChar.instanceId !== mainCharId ? `(${newChar.名称})` : '';
                diffs.push(`${prefix}${k} ${delta > 0 ? '+' : ''}${delta}`);
            }
        });

        // 2. Race Attributes
        Object.keys(newChar.竞赛属性).forEach(key => {
            const k = key as keyof typeof newChar.竞赛属性;
            const delta = newChar.竞赛属性[k] - oldChar.竞赛属性[k];
            if (delta !== 0) {
                const prefix = newChar.instanceId !== mainCharId ? `(${newChar.名称})` : '';
                diffs.push(`${prefix}${k} ${delta > 0 ? '+' : ''}${delta}`);
            }
        });

        // 3. Relationships (Only checking outgoing to Player 'p1' for now, or major changes)
        // If the subject is Player, check their relation to others? 
        // Or if subject is Uma, check relation to Player.
        // Let's iterate all relationship targets.
        Object.keys(newChar.关系列表).forEach(targetId => {
             const oldRel = oldChar.关系列表[targetId] || { 友情: 0, 爱情: 0 };
             const newRel = newChar.关系列表[targetId];
             
             // Name Resolution for Target
             const targetChar = newChars.find(c => c.instanceId === targetId);
             const targetName = targetChar ? targetChar.名称 : (targetId === 'p1' ? '训练员' : '未知');
             
             // Name Resolution for Subject
             const subjectName = newChar.instanceId === mainCharId ? '' : `(${newChar.名称})`;
             
             // Only show simple logs. E.g. "(Uma) Friendship +5" (implied with Trainer)
             // or "(Uma) Friendship(Teio) +5"
             
             const friendDelta = newRel.友情 - oldRel.友情;
             const loveDelta = newRel.爱情 - oldRel.爱情;

             if (friendDelta !== 0) {
                 const relLabel = targetId === 'p1' ? '友情' : `友情(${targetName})`;
                 diffs.push(`${subjectName}${relLabel} ${friendDelta > 0 ? '+' : ''}${friendDelta}`);
             }
             if (loveDelta !== 0) {
                 const relLabel = targetId === 'p1' ? '爱情' : `爱情(${targetName})`;
                 diffs.push(`${subjectName}${relLabel} ${loveDelta > 0 ? '+' : ''}${loveDelta}`);
             }
        });
        
        // 4. Tags
        const oldTagIds = oldChar.标签组.map(t => t.templateId);
        const newTagIds = newChar.标签组.map(t => t.templateId);
        
        newTagIds.forEach(id => {
            if (!oldTagIds.includes(id)) {
                 const prefix = newChar.instanceId !== mainCharId ? `(${newChar.名称})` : '';
                 const tagName = TAGS[id]?.显示名 || id;
                 diffs.push(`${prefix}获得标签【${tagName}】`);
            }
        });
        oldTagIds.forEach(id => {
            if (!newTagIds.includes(id)) {
                 const prefix = newChar.instanceId !== mainCharId ? `(${newChar.名称})` : '';
                 const tagName = TAGS[id]?.显示名 || id;
                 diffs.push(`${prefix}移除标签【${tagName}】`);
            }
        });
    });

    return diffs;
};


// ===========================
// Action Execution
// ===========================

export interface ActionResult {
    logs: string[];
    nextEventId?: string;
    newVariables?: Record<string, any>;
}

export const executeAction = (
    actionStr: string, 
    char: RuntimeCharacter, 
    turn: number, 
    allChars: RuntimeCharacter[] = [], 
    variables?: Record<string, any>,
    silent: boolean = false
): ActionResult => {
  if (!actionStr) return { logs: [] };
  
  const actions = actionStr.split(';').map(s => s.trim());
  const logs: string[] = [];
  let nextEventId: string | undefined = undefined;
  const currentVariables = { ...variables };

  actions.forEach(action => {
    if (!action) return;

    // 1. 设置变量
    if (action.startsWith('设置变量')) {
        const mathMatch = action.match(/设置变量\s+([a-zA-Z0-9_\u4e00-\u9fa5]+)\s*=\s*随机\((\d+)~(\d+)\)/);
        if (mathMatch) {
            const [_, key, min, max] = mathMatch;
            const rand = Math.floor(Math.random() * (parseInt(max) - parseInt(min) + 1)) + parseInt(min);
            currentVariables[key] = rand;
            return; 
        }
        const match = action.match(/设置变量\s+(\S+)\s+(\S+)\s*=\s*(.+)/);
        if (match) {
            const [_, type, key, func] = match;
            if (func.trim() === '获取随机队友()') {
                const others = allChars.filter(c => c.instanceId !== char.instanceId && c.inTeam); 
                if (others.length > 0) {
                    const randomMate = others[Math.floor(Math.random() * others.length)];
                    currentVariables[key] = randomMate.instanceId;
                }
            }
        }
        return;
    }

    // 2. 变量计算
    if (action.startsWith('变量计算')) {
        const parts = action.split(/\s+若\s+/);
        const mainPart = parts[0];
        const condition = parts[1];

        if (condition) {
             if (!checkCondition(condition, char, turn, undefined, allChars, currentVariables)) {
                 return; 
             }
        }

        const match = mainPart.match(/变量计算\s+([a-zA-Z0-9_\u4e00-\u9fa5]+)\s*([+-])\s*(\d+)/);
        if (match) {
            const [_, key, op, valStr] = match;
            const val = parseInt(valStr);
            if (typeof currentVariables[key] === 'number') {
                if (op === '+') currentVariables[key] += val;
                if (op === '-') currentVariables[key] -= val;
            }
        }
        return;
    }

    // 3. 关系变更
    if (action.startsWith('关系变更(')) {
        const content = action.substring(action.indexOf('(') + 1, action.lastIndexOf(')'));
        const args = content.split(',').map(s => s.trim());
        
        if (args.length === 3) {
            const subject = resolveTargetCharacter(args[0], char, allChars, currentVariables);
            let targetKey = 'p1';
            const val = parseInt(args[2]);

            if (subject) {
                 if (!subject.关系列表[targetKey]) subject.关系列表[targetKey] = { 友情: 0, 爱情: 0 };
                 subject.关系列表[targetKey].友情 = Math.max(0, Math.min(100, subject.关系列表[targetKey].友情 + val));
                 if (val < 0) subject.关系列表[targetKey].爱情 = Math.max(0, Math.min(100, subject.关系列表[targetKey].爱情 + val));
            }
        }
        if (args.length === 4) {
               const type = args[0] as '友情' | '爱情';
               const subject = resolveTargetCharacter(args[1], char, allChars, currentVariables);
               const target = resolveTargetCharacter(args[2], char, allChars, currentVariables);
               const val = parseInt(args[3]);
               
               if (subject && target) {
                   const targetId = target.instanceId;
                   if (!subject.关系列表[targetId]) subject.关系列表[targetId] = { 友情: 0, 爱情: 0 };
                   subject.关系列表[targetId][type] = Math.max(0, Math.min(100, subject.关系列表[targetId][type] + val));
               }
               return; 
        }
        return;
    }

    // Handle "Subject.Command" Syntax
    const parts = action.split(' ');
    let subject = char;
    let cmd = parts[0];
    let argsStartIndex = 1;

    if (parts[0].includes('.')) {
        const [subjKey, command] = parts[0].split('.');
        const resolved = resolveTargetCharacter(subjKey, char, allChars, currentVariables);
        if (resolved) {
            subject = resolved;
            cmd = command;
            argsStartIndex = 1; 
        }
    } else if (currentVariables[parts[0]]) {
         const resolved = resolveTargetCharacter(parts[0], char, allChars, currentVariables);
         if (resolved) {
             subject = resolved;
             cmd = parts[1];
             argsStartIndex = 2;
         }
    }

    if (cmd === '属性变更') {
      const attr = parts[argsStartIndex];
      const val = parseInt(parts[argsStartIndex + 1]);
      
      const isSurvival = ['体力', '心情', '精力', '爱欲'].includes(attr);
      const isBasic = ['体质', '学识', '魅力', '财富'].includes(attr);
      
      // @ts-ignore
      if (subject.通用属性[attr] !== undefined) {
        if (isSurvival) {
             // Survival attributes: Clamp 0 to 100
             // @ts-ignore
             subject.通用属性[attr] = Math.max(0, Math.min(100, subject.通用属性[attr] + val));
        } else if (isBasic) {
             // Basic attributes: Unbounded lower, max 100
             // @ts-ignore
             subject.通用属性[attr] = Math.min(100, subject.通用属性[attr] + val);
        } else {
             // @ts-ignore
             subject.通用属性[attr] = Math.max(0, Math.min(100, subject.通用属性[attr] + val));
        }
      } 
      // @ts-ignore
      else if (subject.竞赛属性[attr] !== undefined) {
        // @ts-ignore
        subject.竞赛属性[attr] = Math.max(0, Math.min(1200, subject.竞赛属性[attr] + val));
      }
      
      if (!silent) {
        const prefix = subject.instanceId !== char.instanceId ? `(${subject.名称})` : '';
        logs.push(`${prefix}${attr} ${val > 0 ? '+' : ''}${val}`);
      }
    } 
    else if (cmd === '训练员属性变更') {
       const attr = parts[argsStartIndex];
       const val = parseInt(parts[argsStartIndex + 1]);
       const trainer = allChars.find(c => c.templateId === '训练员' || c.instanceId === 'p1');
       if (trainer) {
          const isSurvival = ['体力', '心情', '精力', '爱欲'].includes(attr);
          const isBasic = ['体质', '学识', '魅力', '财富'].includes(attr);
          // @ts-ignore
          if (trainer.通用属性[attr] !== undefined) {
            if (isSurvival) {
                // @ts-ignore
                trainer.通用属性[attr] = Math.max(0, Math.min(100, trainer.通用属性[attr] + val));
            } else if (isBasic) {
                // @ts-ignore
                trainer.通用属性[attr] = Math.min(100, trainer.通用属性[attr] + val);
            } else {
                 // @ts-ignore
                trainer.通用属性[attr] = Math.max(0, Math.min(100, trainer.通用属性[attr] + val));
            }
          }
       }
       if (!silent) logs.push(`(训练员)${attr} ${val > 0 ? '+' : ''}${val}`);
    }
    else if (cmd === '获得标签') {
      const tagId = parts[argsStartIndex];
      if (TAGS[tagId] && !subject.标签组.some(t => t.templateId === tagId)) {
        subject.标签组.push({ templateId: tagId, 添加日期: turn, 层数: 1 });
        if (!silent) {
            const prefix = subject.instanceId !== char.instanceId ? `(${subject.名称})` : '';
            logs.push(`${prefix}获得标签【${TAGS[tagId].显示名}】`);
        }
      }
    }
    else if (cmd === '移除标签') {
      const tagId = parts[argsStartIndex];
      const index = subject.标签组.findIndex(t => t.templateId === tagId);
      if (index !== -1) {
          subject.标签组.splice(index, 1);
          if (!silent) {
              const prefix = subject.instanceId !== char.instanceId ? `(${subject.名称})` : '';
              logs.push(`${prefix}移除标签【${TAGS[tagId].显示名}】`);
          }
      }
    }
    else if (cmd === '跳转') {
        nextEventId = parts[argsStartIndex];
    }
    else if (cmd === '概率跳转') {
        const chance = parseInt(parts[argsStartIndex]);
        const successEvent = parts[argsStartIndex + 1];
        const failEvent = parts[argsStartIndex + 2];
        if (Math.random() * 100 < chance) nextEventId = successEvent;
        else if (failEvent) nextEventId = failEvent;
    }
    else if (cmd === '关系变更') {
        const type = parts[argsStartIndex] as '友情' | '爱情';
        let val = parseInt(parts[argsStartIndex + 1]);
        const targetId = 'p1'; 
        
        if (type === '爱情' && val > 0 && subject.标签组.some(t => t.templateId === '木头')) {
             val = Math.floor(val * 0.2);
        }

        if (!subject.关系列表[targetId]) {
            subject.关系列表[targetId] = { 友情: 0, 爱情: 0 };
        }
        
        subject.关系列表[targetId][type] = Math.max(0, Math.min(100, subject.关系列表[targetId][type] + val));
    }
  });

  return { logs, nextEventId, newVariables: currentVariables };
};

export const triggerCharacterEvent = (
  state: GameState, 
  characterId: string, 
  forcedEvent?: GameEvent
): GameState => {
  // Create shallow copy of characters array
  const characters = JSON.parse(JSON.stringify(state.characters)) as RuntimeCharacter[];
  const charIndex = characters.findIndex(c => c.instanceId === characterId);
  if (charIndex === -1) return state;

  const char = characters[charIndex]; 
  
  let eventToTrigger: GameEvent | undefined = forcedEvent;
  let variables: Record<string, any> = {};

  if (!eventToTrigger) {
    // Filter available events
    const availableEvents = EVENTS.filter(e => {
        // Check triggers count limit
        const triggeredCount = char.已触发事件[e.id] || 0;
        if (e.可触发次数 !== -1 && triggeredCount >= e.可触发次数) return false;

        // Check conditions
        return checkCondition(e.触发条件, char, state.currentTurn, undefined, characters);
    });

    if (availableEvents.length === 0) return state;

    // Weighted Random Selection
    const totalWeight = availableEvents.reduce((sum, e) => sum + e.权重, 0);
    let random = Math.random() * totalWeight;
    for (const e of availableEvents) {
        random -= e.权重;
        if (random <= 0) {
            eventToTrigger = e;
            break;
        }
    }
    // Fallback just in case
    if (!eventToTrigger) eventToTrigger = availableEvents[availableEvents.length - 1];
  }

  if (!eventToTrigger) return state;

  // Execute Pre-Action (Mutates variables, silent execution)
  if (eventToTrigger.预操作指令) {
      const res = executeAction(
          eventToTrigger.预操作指令, 
          char, 
          state.currentTurn, 
          characters, 
          variables, 
          true
      );
      if (res.newVariables) variables = { ...variables, ...res.newVariables };
  }

  // Update triggered count
  char.已触发事件[eventToTrigger.id] = (char.已触发事件[eventToTrigger.id] || 0) + 1;
  
  // Parse Title and Text
  const parsedTitle = eventToTrigger.标题 
      ? parseText(eventToTrigger.标题, char, state.currentTurn, characters, variables) 
      : undefined;
      
  const parsedText = parseText(eventToTrigger.正文, char, state.currentTurn, characters, variables);

  const hasOptions = eventToTrigger.选项组 && eventToTrigger.选项组.length > 0;

  // --- BRANCHING LOGIC ---

  if (hasOptions) {
      // INTERACTIVE MODE: Add to pending, LOG THE TEXT, but wait for user input for actions.
      
      const newLog: LogEntry = {
          turn: state.currentTurn,
          characterName: char.名称,
          text: parsedText,
          type: 'event',
          isImportant: !!parsedTitle
      };

      const pendingItem: PendingEventItem = {
          characterId: characterId,
          event: eventToTrigger,
          variables: variables,
          parsedText,
          parsedTitle
      };

      return {
          ...state,
          characters: characters, // Updated trigger count, pre-action variables used locally
          logs: [...state.logs, newLog],
          pendingEvents: [...state.pendingEvents, pendingItem]
      };

  } else {
      // NARRATIVE MODE: Execute immediately, Log result, No Modal.
      
      // 1. Snapshot for Diff (Use original state chars vs mutated local 'characters')
      const snapshotChars = state.characters; // Reference to old state
      
      // 2. Execute Main Action (Silent, on local 'characters')
      let jumpId: string | undefined = undefined;
      if (eventToTrigger.操作指令) {
          const res = executeAction(eventToTrigger.操作指令, char, state.currentTurn, characters, variables, true);
          if (res.nextEventId) jumpId = res.nextEventId;
      }

      // 3. Process Automatic Branches
      if (eventToTrigger.分支组) {
          for (const branch of eventToTrigger.分支组) {
              if (checkCondition(branch.判别式, char, state.currentTurn, undefined, characters, variables)) {
                  const bRes = executeAction(branch.操作指令, char, state.currentTurn, characters, variables, true);
                  if (bRes.nextEventId) jumpId = bRes.nextEventId;
                  if (branch.跳转事件ID) jumpId = branch.跳转事件ID;
                  break;
              }
          }
      }

      // 4. Generate Diff Log
      const diffLogs = generateStateDiffLog(snapshotChars, characters, characterId);
      const effectHtml = diffLogs.length > 0 
            ? `<div class='mt-1 text-xs font-bold text-gray-500'>(${diffLogs.join(', ')})</div>`
            : "";

      // 5. Create Log Entry
      const newLog: LogEntry = {
          turn: state.currentTurn,
          characterName: char.名称,
          text: parsedText + effectHtml,
          type: 'event',
          isImportant: !!parsedTitle
      };

      let newState = {
          ...state,
          characters: characters,
          logs: [...state.logs, newLog]
      };

      // 6. Handle Recursion (Jump)
      if (jumpId) {
          const nextEventObj = EVENTS.find(e => e.id === jumpId);
          if (nextEventObj) {
               return triggerCharacterEvent(newState, characterId, nextEventObj);
          }
      }

      return newState;
  }
};
