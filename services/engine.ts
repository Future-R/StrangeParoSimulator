
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

  const char: RuntimeCharacter = {
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

  // 应用特质(标签)的初始效果修正
  const hasTag = (id: string) => char.标签组.some(t => t.templateId === id);

  if (hasTag('贫穷')) {
      char.通用属性.财富 = Math.max(0, char.通用属性.财富 - 5);
  }
  if (hasTag('富豪')) {
      char.通用属性.财富 += 5;
  }
  if (hasTag('魅力十足')) {
      char.通用属性.魅力 += 5;
  }
  if (hasTag('路人脸')) {
      char.通用属性.魅力 = Math.max(0, char.通用属性.魅力 - 5);
  }

  return char;
};

export const getAvailableStartTags = (): TagTemplate[] => {
    return Object.values(TAGS).filter(t => t.人类可用 && t.开局可选);
};

// 解析目标角色 (支持 'p1', '当前角色', '训练员', 或变量名)
const resolveTargetCharacter = (key: string, current: RuntimeCharacter, allChars: RuntimeCharacter[], variables?: Record<string, any>): RuntimeCharacter | undefined => {
    if (key === '当前角色') return current;
    if (key === '训练员') return allChars.find(c => c.templateId === '训练员' || c.instanceId === 'p1');
    if (key === '玩家') return allChars.find(c => c.instanceId === 'p1');
    
    // Check for "Template ID" or "Name" match directly (e.g. "优秀素质")
    const byTemplate = allChars.find(c => c.templateId === key || c.名称 === key);
    if (byTemplate) return byTemplate;

    if (variables && variables[key]) {
        // Assume variable stores instanceId for characters (string)
        if (typeof variables[key] === 'string' && (variables[key].startsWith('c') || variables[key].startsWith('p') || variables[key].startsWith('npc'))) {
             return allChars.find(c => c.instanceId === variables[key]);
        }
        // If variable is an object (RuntimeCharacter), return it directly (though usually we store IDs)
        if (typeof variables[key] === 'object' && variables[key].instanceId) {
            return variables[key];
        }
    }
    // Try find by ID directly
    return allChars.find(c => c.instanceId === key);
};

// 辅助函数：解析数值，支持 "随机(min~max)" 或纯数字
const evalValue = (valStr: string): number => {
    if (!valStr) return 0;
    // Handle string inputs like "随机(5~15)" that might come from regex matches
    const randomMatch = valStr.toString().match(/随机\((-?\d+)~(\-?\d+)\)/);
    if (randomMatch) {
        const min = parseInt(randomMatch[1]);
        const max = parseInt(randomMatch[2]);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    return parseInt(valStr) || 0;
};

// Apply Charm multiplier and Tag logic for relationship growth (Target is the one receiving affection)
// type: '友情' | '爱情' - Currently only Love is affected by Wedding Ring
const applyRelationshipModifiers = (val: number, target: RuntimeCharacter | undefined, type: '友情' | '爱情'): number => {
    if (val <= 0 || !target) return val;
    
    let multiplier = 1.0;

    // 1. Charm Multiplier (Applies to both? Usually Charm affects Love/Friendship growth positively)
    // Charm multiplier: 5 Charm -> 0.5x, 50 Charm -> 5.0x
    const charm = target.通用属性.魅力 || 0;
    multiplier *= Math.max(0, charm) / 10;

    // 2. Wedding Ring Multiplier (Only applies to Love '爱情')
    // If target has "婚戒" tag, reduce love gain by 50%
    if (type === '爱情' && target.标签组.some(t => t.templateId === '婚戒')) {
        multiplier *= 0.5;
    }

    return Math.floor(val * multiplier);
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

    // 3. 变量检查
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
    
    // NEW: 变量存在检查
    if (cond.startsWith('变量存在')) {
        const match = cond.match(/变量存在\s+([a-zA-Z0-9_\u4e00-\u9fa5]+)/);
        if (match && variables) {
            const key = match[1];
            return variables[key] !== undefined && variables[key] !== null;
        }
        return false;
    }

    // NEW: 存在角色满足(条件) - 用于全局检查
    if (cond.startsWith('存在角色满足')) {
        const innerMatch = cond.match(/存在角色满足\((.*)\)/);
        if (innerMatch) {
            const innerCond = innerMatch[1];
            return allChars.some(c => checkCondition(innerCond, c, turn, choiceIndex, allChars, variables));
        }
    }

    // 解析主语 (Subject Resolution)
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

    // New: 在队伍检查
    if (propPath.includes('在队伍')) {
        const match = propPath.match(/在队伍\s*==\s*(true|false)/);
        if (match) {
             return subject.inTeam === (match[1] === 'true');
        }
    }

    // 7. 关系检查 (General Relationship Check)
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
  result = result.replace(/{随机文字\(([\s\S]*?)\)}/g, (match, argsContent) => {
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
  result = result.replace(/{当前角色\.名称}/g, char.名称);
  result = result.replace(/{当前角色\.属性\.([\w\u4e00-\u9fa5]+)}/g, (_, attr) => {
    // @ts-ignore
    return (char.通用属性[attr] ?? char.竞赛属性[attr] ?? 0).toString();
  });

  // 3. 变量替换 (NEW: {VarName.名称} or {VarName})
  // Enhanced to support String comparisons in ternary operator: {Var == "Str" ? "A" : "B"}
  if (variables) {
      result = result.replace(/{([a-zA-Z0-9_\u4e00-\u9fa5]+(?:\.[a-zA-Z0-9_\u4e00-\u9fa5]+)?)\s*([!=><]=?)\s*(?:(-?\d+)|"([^"]*)")\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"}/g, 
        (match, varPath, op, numValStr, strValStr, trueText, falseText) => {
             // Resolve variable value
             let varVal: any = 0;
             if (varPath === '训练员.性别') {
                 varVal = trainerGender;
             } else if (varPath.includes('.')) {
                 // Try resolving object property if supported in future, for now mostly flat variables
             } else {
                 varVal = variables[varPath];
                 if (varVal === undefined) varVal = 0;
             }

             // Determine comparison value
             let compareVal: any;
             if (numValStr !== undefined) {
                 compareVal = parseInt(numValStr);
                 if (typeof varVal === 'string') varVal = parseInt(varVal) || 0; // Force int comparison
             } else {
                 compareVal = strValStr; // String comparison
             }

             let res = false;
             switch (op) {
                case '>': res = varVal > compareVal; break;
                case '>=': res = varVal >= compareVal; break;
                case '<': res = varVal < compareVal; break;
                case '<=': res = varVal <= compareVal; break;
                case '==': res = varVal == compareVal; break;
                case '!=': res = varVal != compareVal; break;
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
             if (prop === '性别') return trainerGender;
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
    silent: boolean = false,
    eventTags: string[] = [] // New Param
): ActionResult => {
  if (!actionStr) return { logs: [] };
  
  const actions = actionStr.split(';').map(s => s.trim());
  const logs: string[] = [];
  let nextEventId: string | undefined = undefined;
  const currentVariables = { ...variables };

  // Helper to extract function arguments robustly (handles nested parens for 随机())
  const parseArgs = (str: string): string[] => {
      const openIdx = str.indexOf('(');
      const closeIdx = str.lastIndexOf(')');
      if (openIdx === -1 || closeIdx === -1) return [];
      const content = str.substring(openIdx + 1, closeIdx);
      // Simple comma split is risky if Random() used commas (it doesn't currently), but to be safe:
      return content.split(',').map(s => s.trim());
  };

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
        
        // Get Characters (New LINQ-like entry point)
        const match = action.match(/设置变量\s+(\S+)\s+(\S+)\s*=\s*(.+)/);
        if (match) {
            const [_, type, key, funcPart] = match;
            const funcName = funcPart.split('(')[0].trim();
            const funcArgs = funcPart.match(/\((.*?)\)/)?.[1] || "";

            if (funcName === '获取随机队友') {
                const others = allChars.filter(c => c.instanceId !== char.instanceId && c.inTeam); 
                if (others.length > 0) {
                    const randomMate = others[Math.floor(Math.random() * others.length)];
                    currentVariables[key] = randomMate.instanceId;
                }
            } 
            else if (funcName === '获取随机全员角色') {
                const count = parseInt(funcArgs) || 1;
                // Exclude self
                const others = allChars.filter(c => c.instanceId !== char.instanceId); 
                
                if (type === '列表') {
                    const selectedIds = [];
                    const pool = [...others];
                    for (let i = 0; i < count && pool.length > 0; i++) {
                        const idx = Math.floor(Math.random() * pool.length);
                        selectedIds.push(pool[idx].instanceId);
                        pool.splice(idx, 1);
                    }
                    currentVariables[key] = selectedIds;
                } else {
                    // Legacy single char
                    if (others.length > 0) {
                        const randomChar = others[Math.floor(Math.random() * others.length)];
                        currentVariables[key] = randomChar.instanceId;
                    }
                }
            }
            // NEW: Generic Source Getter
            else if (funcName === '获取角色') {
                let pool: RuntimeCharacter[] = [];
                if (funcArgs.includes('全员')) {
                    pool = [...allChars];
                } else if (funcArgs.includes('队友')) {
                    pool = allChars.filter(c => c.inTeam);
                } else if (funcArgs.includes('非队友')) {
                    pool = allChars.filter(c => !c.inTeam);
                }
                currentVariables[key] = pool.map(c => c.instanceId);
            }
            // NEW: Pick random from list variable
            else if (funcName === '列表随机取值') {
                const listKey = funcArgs.trim();
                const list = currentVariables[listKey];
                if (Array.isArray(list) && list.length > 0) {
                    const randomId = list[Math.floor(Math.random() * list.length)];
                    currentVariables[key] = randomId;
                } else {
                    // Empty list or invalid -> set to null/undefined
                    delete currentVariables[key];
                }
            }
        }
        return;
    }

    // New: 列表添加(列表名, 目标)
    if (action.startsWith('列表添加')) {
        const args = parseArgs(action);
        if (args.length >= 2) {
            const listKey = args[0];
            const targetKey = args[1];
            
            const list = currentVariables[listKey];
            const target = resolveTargetCharacter(targetKey, char, allChars, currentVariables);

            if (Array.isArray(list) && target) {
                if (!list.includes(target.instanceId)) {
                    list.push(target.instanceId);
                }
            }
        }
        return;
    }

    // New: 列表排除(列表名, 目标)
    if (action.startsWith('列表排除')) {
        const args = parseArgs(action);
        if (args.length >= 2) {
            const listKey = args[0];
            const targetKey = args[1];
            
            const list = currentVariables[listKey];
            const target = resolveTargetCharacter(targetKey, char, allChars, currentVariables);

            if (Array.isArray(list) && target) {
                const idx = list.indexOf(target.instanceId);
                if (idx !== -1) {
                    list.splice(idx, 1);
                }
            }
        }
        return;
    }

    // New: 列表筛选(列表名, 条件)
    if (action.startsWith('列表筛选')) {
        // Regex is fragile for complex conditions, use substring
        const openParen = action.indexOf('(');
        const closeParen = action.lastIndexOf(')');
        if (openParen !== -1 && closeParen !== -1) {
            const inner = action.substring(openParen + 1, closeParen);
            const firstComma = inner.indexOf(',');
            if (firstComma !== -1) {
                const listKey = inner.substring(0, firstComma).trim();
                const condition = inner.substring(firstComma + 1).trim();
                
                let list = currentVariables[listKey];
                if (Array.isArray(list)) {
                    const filtered = list.filter(id => {
                        const c = allChars.find(x => x.instanceId === id);
                        if (!c) return false;
                        return checkCondition(condition, c, turn, undefined, allChars, currentVariables);
                    });
                    currentVariables[listKey] = filtered;
                }
            }
        }
        return;
    }

    // New: 列表截取(列表名, 数量) -> Random Sampling (Take N)
    if (action.startsWith('列表截取')) {
        const args = parseArgs(action);
        if (args.length >= 2) {
            const listKey = args[0];
            const count = parseInt(args[1]);
            const list = currentVariables[listKey];
            
            if (Array.isArray(list)) {
                // Shuffle and slice
                for (let i = list.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [list[i], list[j]] = [list[j], list[i]];
                }
                currentVariables[listKey] = list.slice(0, count);
            }
        }
        return;
    }

    // New: 列表执行(列表名, 指令)
    if (action.startsWith('列表执行')) {
        const openParen = action.indexOf('(');
        const closeParen = action.lastIndexOf(')');
        if (openParen !== -1 && closeParen !== -1) {
            const inner = action.substring(openParen + 1, closeParen);
            const firstComma = inner.indexOf(',');
            if (firstComma !== -1) {
                const listKey = inner.substring(0, firstComma).trim();
                const subCommand = inner.substring(firstComma + 1).trim();
                
                const list = currentVariables[listKey];
                if (Array.isArray(list)) {
                    list.forEach(charId => {
                        const targetChar = allChars.find(c => c.instanceId === charId);
                        if (targetChar) {
                            executeAction(subCommand, targetChar, turn, allChars, currentVariables, true, eventTags);
                        }
                    });
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

    // New: 双向关系变更
    if (action.startsWith('双向关系变更')) {
        const args = parseArgs(action); 
        
        if (args.length >= 3) {
            const type = args[0] as '友情' | '爱情';
            const targetsStr = args[1];
            const baseVal = evalValue(args[2]);
            
            let resolvedChars: RuntimeCharacter[] = [];

            // Case A: Variable List (e.g. 变量.训练组)
            if (targetsStr.startsWith('变量.')) {
                const varName = targetsStr.split('.')[1];
                const list = currentVariables[varName];
                if (Array.isArray(list)) {
                    list.forEach(id => {
                        const c = allChars.find(x => x.instanceId === id);
                        if (c) resolvedChars.push(c);
                    });
                }
            } 
            // Case B: Slash separated string
            else {
                const rawNames = targetsStr.split('/').map(s => s.trim().replace(/"/g, ''));
                rawNames.forEach(name => {
                    const c = resolveTargetCharacter(name, char, allChars, currentVariables);
                    if (c) resolvedChars.push(c);
                });
            }

            for (let i = 0; i < resolvedChars.length; i++) {
                for (let j = i + 1; j < resolvedChars.length; j++) {
                    const charA = resolvedChars[i];
                    const charB = resolvedChars[j];

                    let valForB = applyRelationshipModifiers(baseVal, charB, type);
                    if (!charA.关系列表[charB.instanceId]) charA.关系列表[charB.instanceId] = { 友情: 0, 爱情: 0 };
                    charA.关系列表[charB.instanceId][type] = Math.max(0, Math.min(100, charA.关系列表[charB.instanceId][type] + valForB));

                    let valForA = applyRelationshipModifiers(baseVal, charA, type);
                    if (!charB.关系列表[charA.instanceId]) charB.关系列表[charA.instanceId] = { 友情: 0, 爱情: 0 };
                    charB.关系列表[charA.instanceId][type] = Math.max(0, Math.min(100, charB.关系列表[charA.instanceId][type] + valForA));
                }
            }
        }
        return;
    }

    // 3. 关系变更 (单向)
    if (action.startsWith('关系变更(')) {
        const args = parseArgs(action);
        if (args.length === 4) {
               const type = args[0] as '友情' | '爱情';
               const subject = resolveTargetCharacter(args[1], char, allChars, currentVariables);
               const target = resolveTargetCharacter(args[2], char, allChars, currentVariables);
               const baseVal = evalValue(args[3]);
               
               let finalVal = applyRelationshipModifiers(baseVal, target, type);

               if (subject && target) {
                   const targetId = target.instanceId;
                   if (!subject.关系列表[targetId]) subject.关系列表[targetId] = { 友情: 0, 爱情: 0 };
                   subject.关系列表[targetId][type] = Math.max(0, Math.min(100, subject.关系列表[targetId][type] + finalVal));
               }
               return; 
        }
        return;
    }
    
    // NEW: 让角色入队
    if (action.startsWith('让角色入队')) {
        const args = parseArgs(action);
        if (args.length >= 1) {
            const target = resolveTargetCharacter(args[0], char, allChars, currentVariables);
            if (target) {
                target.inTeam = true;
                if (!silent) logs.push(`(${target.名称}) 加入了队伍`);
            }
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
      const valStr = parts[argsStartIndex + 1];
      let val = 0;
      
      // FIX: Check if value is a variable
      if (currentVariables && currentVariables[valStr] !== undefined && typeof currentVariables[valStr] === 'number') {
          val = currentVariables[valStr];
      } else {
          val = evalValue(valStr);
      }
      
      // 天才特质效果
      if (val > 0 && subject.标签组.some(t => t.templateId === '天才') && subject.通用属性.精力 > 50) {
          if (attr === '学识') {
              val += 1;
          } else if (attr === '智慧') {
              val = Math.floor(val * 1.2);
          }
      }

      // 木头特质效果
      if (attr === '爱欲' && val > 0 && subject.标签组.some(t => t.templateId === '木头')) {
          val = Math.floor(val * 0.2);
      }

      const isSurvival = ['体力', '心情', '精力', '爱欲'].includes(attr);
      const isBasic = ['体质', '学识', '魅力', '财富'].includes(attr);
      const isRace = ['速度', '耐力', '力量', '毅力', '智慧'].includes(attr) || attr === '随机';
      
      // Random Attribute Logic (e.g. 属性变更 随机 10)
      let targetAttr = attr;
      if (attr === '随机') {
          const pool = ['速度', '耐力', '力量', '毅力', '智慧'];
          targetAttr = pool[Math.floor(Math.random() * pool.length)];
      }

      // 训练员属性加成逻辑重构
      // 只有在 Race 属性且为工作/训练事件，且主体是马娘时生效
      if (isRace && val > 0 && (eventTags.includes('工作') || eventTags.includes('训练')) && subject.标签组.some(t => t.templateId === '马娘')) {
          const trainer = allChars.find(c => c.instanceId === 'p1');
          if (trainer) {
              const knowledge = trainer.通用属性.学识 || 0;
              // 固定系数：学识 * 10% (e.g. 10 -> 100%, 5 -> 50%)
              const knowledgeMultiplier = knowledge * 0.1;
              val = val * knowledgeMultiplier;
          }
          
          // 擅长训练特质：额外乘区 1.5
          if (subject.标签组.some(t => t.templateId === '擅长训练')) {
              val = val * 1.5;
          }
          
          // 向下取整
          val = Math.floor(val);
      }

      // @ts-ignore
      if (subject.通用属性[targetAttr] !== undefined) {
        // Depletion Penalty Check (If already <= 0 and decreasing)
        if (val < 0) {
             // @ts-ignore
             if (subject.通用属性[targetAttr] <= 0) {
                 const prefix = subject.instanceId !== char.instanceId ? `(${subject.名称})` : '';
                 if (targetAttr === '体力') {
                     subject.通用属性.体质 = Math.max(0, subject.通用属性.体质 - 1);
                     if (!silent) logs.push(`${prefix}体质 -1 (体力透支)`);
                 } else if (targetAttr === '精力') {
                     subject.通用属性.学识 = Math.max(0, subject.通用属性.学识 - 1);
                     if (!silent) logs.push(`${prefix}学识 -1 (精力透支)`);
                 } else if (targetAttr === '心情') {
                     subject.通用属性.魅力 = Math.max(0, subject.通用属性.魅力 - 1);
                     if (!silent) logs.push(`${prefix}魅力 -1 (心情崩溃)`);
                 }
             }
        }

        if (isSurvival) {
             // Survival attributes: Clamp 0 to 100
             // @ts-ignore
             subject.通用属性[targetAttr] = Math.max(0, Math.min(100, subject.通用属性[targetAttr] + val));
        } else if (isBasic) {
             // Basic attributes: Unbounded lower, max 100
             // @ts-ignore
             subject.通用属性[targetAttr] = Math.min(100, subject.通用属性[targetAttr] + val);
        } else {
             // @ts-ignore
             subject.通用属性[targetAttr] = Math.max(0, Math.min(100, subject.通用属性[targetAttr] + val));
        }
      } 
      // @ts-ignore
      else if (subject.竞赛属性[targetAttr] !== undefined) {
        // @ts-ignore
        subject.竞赛属性[targetAttr] = Math.max(0, Math.min(1200, subject.竞赛属性[targetAttr] + val));
      }
      
      if (!silent) {
        const prefix = subject.instanceId !== char.instanceId ? `(${subject.名称})` : '';
        logs.push(`${prefix}${targetAttr} ${val > 0 ? '+' : ''}${val}`);
      }
    } 
    else if (cmd === '训练员属性变更') {
       const attr = parts[argsStartIndex];
       let val = evalValue(parts[argsStartIndex + 1]);
       const trainer = allChars.find(c => c.templateId === '训练员' || c.instanceId === 'p1');
       if (trainer) {
          // 天才特质效果 (Trainer)
          if (val > 0 && trainer.标签组.some(t => t.templateId === '天才') && trainer.通用属性.精力 > 50) {
              if (attr === '学识') {
                  val += 1;
              } else if (attr === '智慧') {
                  val = Math.floor(val * 1.2);
              }
          }

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
      const layerCount = parseInt(parts[argsStartIndex + 1]) || 1; // Default to 1 if not specified
      
      // Small Appetite Protection
      // 小鸟胃：发福时有80%概率抵消。
      if (tagId === '肥胖' && subject.标签组.some(t => t.templateId === '小鸟胃')) {
          if (Math.random() < 0.8) {
              if (!silent) logs.push(`(小鸟胃)抵消了发福状态`);
              return; 
          }
      }

      if (TAGS[tagId] && !subject.标签组.some(t => t.templateId === tagId)) {
        subject.标签组.push({ templateId: tagId, 添加日期: turn, 层数: layerCount });
        if (!silent) {
            const prefix = subject.instanceId !== char.instanceId ? `(${subject.名称})` : '';
            logs.push(`${prefix}获得特质【${TAGS[tagId].显示名}】`);
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
              logs.push(`${prefix}移除特质【${TAGS[tagId].显示名}】`);
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
        let baseVal = evalValue(parts[argsStartIndex + 1]);
        const targetId = 'p1'; 
        
        if (type === '爱情' && baseVal > 0 && subject.标签组.some(t => t.templateId === '木头')) {
             baseVal = Math.floor(baseVal * 0.2);
        }

        const target = allChars.find(c => c.instanceId === targetId);
        let finalVal = applyRelationshipModifiers(baseVal, target, type);

        if (!subject.关系列表[targetId]) {
            subject.关系列表[targetId] = { 友情: 0, 爱情: 0 };
        }
        
        subject.关系列表[targetId][type] = Math.max(0, Math.min(100, subject.关系列表[targetId][type] + finalVal));
    }
  });

  return { logs, nextEventId, newVariables: currentVariables };
};

export const generateStateDiffLog = (oldChars: RuntimeCharacter[], newChars: RuntimeCharacter[], activeCharId: string): string[] => {
    const diffs: string[] = [];
    const oldMap = new Map(oldChars.map(c => [c.instanceId, c]));

    newChars.forEach(newChar => {
        const oldChar = oldMap.get(newChar.instanceId);
        if (!oldChar) return;

        const isSelf = newChar.instanceId === activeCharId;
        const prefix = isSelf ? '' : `(${newChar.名称})`;

        // Attributes to track
        const generalAttrs = ['体质', '学识', '魅力', '财富', '心情', '体力', '精力', '爱欲'];
        generalAttrs.forEach(key => {
            // @ts-ignore
            const diff = (newChar.通用属性[key] || 0) - (oldChar.通用属性[key] || 0);
            if (diff !== 0) diffs.push(`${prefix}${key} ${diff > 0 ? '+' : ''}${diff}`);
        });

        const raceAttrs = ['速度', '耐力', '力量', '毅力', '智慧'];
        raceAttrs.forEach(key => {
            // @ts-ignore
            const diff = (newChar.竞赛属性[key] || 0) - (oldChar.竞赛属性[key] || 0);
            if (diff !== 0) diffs.push(`${prefix}${key} ${diff > 0 ? '+' : ''}${diff}`);
        });

        // Tags
        newChar.标签组.forEach(tag => {
            if (!oldChar.标签组.some(t => t.templateId === tag.templateId)) {
                diffs.push(`${prefix}获得【${TAGS[tag.templateId]?.显示名 || tag.templateId}】`);
            }
        });
        oldChar.标签组.forEach(tag => {
            if (!newChar.标签组.some(t => t.templateId === tag.templateId)) {
                diffs.push(`${prefix}移除【${TAGS[tag.templateId]?.显示名 || tag.templateId}】`);
            }
        });
        
        // Relationships (Check towards p1 or from p1, and if activeChar is not p1, check its outgoing changes)
        Object.keys(newChar.关系列表).forEach(targetId => {
             const oldRel = oldChar.关系列表[targetId] || { 友情: 0, 爱情: 0 };
             const newRel = newChar.关系列表[targetId];
             
             // Check Love
             const loveDiff = newRel.爱情 - oldRel.爱情;
             if (loveDiff !== 0) {
                 const targetName = newChars.find(c => c.instanceId === targetId)?.名称 || targetId;
                 if (newChar.instanceId === 'p1') {
                     diffs.push(`对${targetName}爱情 ${loveDiff > 0 ? '+' : ''}${loveDiff}`);
                 } else if (targetId === 'p1') {
                     diffs.push(`${prefix}爱情 ${loveDiff > 0 ? '+' : ''}${loveDiff}`);
                 }
             }

             // Check Friendship
             const friendDiff = newRel.友情 - oldRel.友情;
             if (friendDiff !== 0) {
                 const targetName = newChars.find(c => c.instanceId === targetId)?.名称 || targetId;
                 if (newChar.instanceId === 'p1') {
                     diffs.push(`对${targetName}友情 ${friendDiff > 0 ? '+' : ''}${friendDiff}`);
                 } else if (targetId === 'p1') {
                     diffs.push(`${prefix}友情 ${friendDiff > 0 ? '+' : ''}${friendDiff}`);
                 }
             }
        });
    });

    return diffs;
};

// ===========================
// Event Triggering
// ===========================

export const triggerCharacterEvent = (gameState: GameState, charId: string, specificEvent?: GameEvent): GameState => {
  const char = gameState.characters.find(c => c.instanceId === charId);
  if (!char) return gameState;

  let eventToTrigger = specificEvent;

  if (!eventToTrigger) {
    const availableEvents = EVENTS.filter(e => {
        if (e.可触发次数 !== -1) {
            const count = char.已触发事件[e.id] || 0;
            if (count >= e.可触发次数) return false;
        }
        return checkCondition(e.触发条件, char, gameState.currentTurn, undefined, gameState.characters);
    });

    if (availableEvents.length === 0) return gameState;

    const totalWeight = availableEvents.reduce((sum, e) => sum + e.权重, 0);
    let r = Math.random() * totalWeight;
    
    for (const e of availableEvents) {
        r -= e.权重;
        if (r <= 0) {
            eventToTrigger = e;
            break;
        }
    }
    if (!eventToTrigger) eventToTrigger = availableEvents[availableEvents.length - 1];
  }

  // Common: Update trigger count
  const newChars = gameState.characters.map(c => {
      if (c.instanceId === charId) {
          return {
              ...c,
              已触发事件: {
                  ...c.已触发事件,
                  [eventToTrigger!.id]: (c.已触发事件[eventToTrigger!.id] || 0) + 1
              }
          };
      }
      return c;
  });
  
  const subjectChar = newChars.find(c => c.instanceId === charId)!;

  // Auto-Resolve Logic for events WITHOUT options
  const hasOptions = eventToTrigger.选项组 && eventToTrigger.选项组.length > 0;

  if (!hasOptions) {
      // 1. Snapshot State
      const snapshotChars = JSON.parse(JSON.stringify(newChars));

      // 2. Pre-actions
      let currentVariables: Record<string, any> = {};
      if (eventToTrigger.预操作指令) {
          const res = executeAction(eventToTrigger.预操作指令, subjectChar, gameState.currentTurn, newChars, {}, true, eventToTrigger.标签组);
          currentVariables = res.newVariables || {};
      }

      // 3. Main Actions
      let nextEventId: string | undefined = undefined;
      if (eventToTrigger.操作指令) {
          const res = executeAction(eventToTrigger.操作指令, subjectChar, gameState.currentTurn, newChars, currentVariables, true, eventToTrigger.标签组);
          if (res.nextEventId) nextEventId = res.nextEventId;
      }

      // 4. Branch Logic (Auto)
      if (eventToTrigger.分支组) {
          for (const branch of eventToTrigger.分支组) {
              if (checkCondition(branch.判别式, subjectChar, gameState.currentTurn, undefined, newChars, currentVariables)) {
                  const bRes = executeAction(branch.操作指令, subjectChar, gameState.currentTurn, newChars, currentVariables, true, eventToTrigger.标签组);
                  if (bRes.nextEventId) nextEventId = bRes.nextEventId;
                  if (branch.跳转事件ID) nextEventId = branch.跳转事件ID;
                  break;
              }
          }
      }

      // 5. Parse Text
      const parsedText = parseText(eventToTrigger.正文, subjectChar, gameState.currentTurn, newChars, currentVariables);
      
      // 6. Diff Log
      const diffLogs = generateStateDiffLog(snapshotChars, newChars, charId);
      const effectHtml = diffLogs.length > 0 
          ? `<div class='mt-1 text-xs font-bold text-gray-500'>(${diffLogs.join(', ')})</div>`
          : "";

      const logEntry: LogEntry = {
          turn: gameState.currentTurn,
          characterName: subjectChar.名称,
          text: parsedText + effectHtml,
          type: 'event',
          isImportant: !!eventToTrigger.标题
      };

      const newState = {
          ...gameState,
          characters: newChars,
          logs: [...gameState.logs, logEntry]
      };

      // 7. Handle Jump (Recursion)
      if (nextEventId) {
          const nextEvt = EVENTS.find(e => e.id === nextEventId);
          if (nextEvt) {
               return triggerCharacterEvent(newState, charId, nextEvt);
          }
      }

      return newState;

  } else {
      // Event HAS Options -> Queue as Pending
      let currentVariables: Record<string, any> = {};
      if (eventToTrigger.预操作指令) {
          const res = executeAction(eventToTrigger.预操作指令, subjectChar, gameState.currentTurn, newChars, {}, true, eventToTrigger.标签组);
          currentVariables = res.newVariables || {};
      }

      const parsedTitle = eventToTrigger.标题 ? parseText(eventToTrigger.标题, subjectChar, gameState.currentTurn, newChars, currentVariables) : undefined;
      const parsedText = parseText(eventToTrigger.正文, subjectChar, gameState.currentTurn, newChars, currentVariables);

      const pendingItem: PendingEventItem = {
          characterId: charId,
          event: eventToTrigger,
          variables: currentVariables,
          parsedTitle,
          parsedText
      };

      return {
          ...gameState,
          characters: newChars,
          pendingEvents: [...gameState.pendingEvents, pendingItem]
      };
  }
};
    