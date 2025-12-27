
import { RuntimeCharacter, GameEvent, EventOption, RuntimeTag, CharacterTemplate, GameState, LogEntry, PendingEventItem, TagTemplate, EventBranch } from '../types';
import { EVENTS, CHARACTERS, TAGS } from '../constants';

// ===========================
// 帮助函数 (Helpers)
// ===========================

export const getTurnInfo = (turn: number) => {
  const year = Math.floor(turn / 24) + 1;
  const monthIndex = Math.floor((turn % 24) / 2);
  const month = monthIndex + 1;
  const isLate = turn % 2 === 1;
  return { 
      year, 
      month, 
      isLate, 
      period: isLate ? '下旬' : '上旬',
      dateStr: `第${year}年 ${month}月 ${isLate ? '下旬' : '上旬'}`
  };
};

export const getTurnDate = (turn: number): string => {
  return getTurnInfo(turn).dateStr;
};

export const createRuntimeCharacter = (template: CharacterTemplate, instanceId: string, overrideName?: string, overrideGender?: '男'|'女', extraTagIds?: string[]): RuntimeCharacter => {
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
    标签组: tags,
    已触发事件: {},
    关系列表: {},
    称呼列表: template.称呼列表 // 继承模板配置
  };
};

export const getAvailableStartTags = (): TagTemplate[] => {
    return Object.values(TAGS).filter(t => t.人类可用 && t.开局可选);
};

// 解析目标角色 (支持 'p1', '当前角色', '训练员', 或变量名)
const resolveTargetCharacter = (key: string, current: RuntimeCharacter, allChars: RuntimeCharacter[], variables?: Record<string, any>): RuntimeCharacter | undefined => {
    if (key === '当前角色') return current;
    if (key === '训练员') return allChars.find(c => c.templateId === '训练员' || c.instanceId === 'p1');
    if (variables && variables[key]) {
        // Assume variable stores instanceId for characters
        return allChars.find(c => c.instanceId === variables[key]);
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

    // 解析主语 (Subject Resolution)
    let subject = char;
    let propPath = cond;

    const dotIndex = cond.indexOf('.');
    if (dotIndex !== -1) {
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

    // 3. 标签检查
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

    // 4. 随机数
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

    // 5. 属性检查
    if (propPath.includes('属性.')) {
      const match = propPath.match(/属性\.(\w+)\s*([>=<]+|==)\s*(\d+)/);
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

    // 6. 关系检查
    if (propPath.includes('关系.玩家.')) {
        const match = propPath.match(/关系\.玩家\.(\w+)\s*([>=<]+|==)\s*(\d+)/);
        if (match) {
            const type = match[1] as '友情' | '爱情';
            const op = match[2];
            const val = parseInt(match[3]);
            // 默认目标是 p1
            const rel = subject.关系列表['p1'] || { 友情: 0, 爱情: 0 };
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

    // 7. 训练员属性检查
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
        const match = propPath.match(/模板ID\s*==\s*"([^"]+)"/);
        if (match) return subject.templateId === match[1];
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
  result = result.replace(/{当前角色\.属性\.(\w+)}/g, (_, attr) => {
    // @ts-ignore
    return (char.通用属性[attr] ?? char.竞赛属性[attr] ?? 0).toString();
  });

  // 3. 变量替换 (NEW: {VarName.名称})
  if (variables) {
      // Regex matches {VarName.Prop} with support for Chinese characters
      result = result.replace(/{([a-zA-Z0-9_\u4e00-\u9fa5]+)\.([a-zA-Z0-9_\u4e00-\u9fa5]+)}/g, (match, varName, prop) => {
          if (varName === '当前角色') return match; // skip, handled above
          if (varName === '训练员') {
             if (prop === '称呼') return calling;
             if (prop === '兄姐') return calling;
             if (prop === '他她') return trainerGender === '男' ? '他' : '她';
             if (prop === '你') return '你';
             return match; 
          }

          const targetId = variables[varName];
          if (!targetId) return match; // Variable not found

          const targetChar = allChars.find(c => c.instanceId === targetId);
          if (!targetChar) return match; // Char not found

          if (prop === '名称') return targetChar.名称;
          // @ts-ignore
          if (targetChar.通用属性[prop] !== undefined) return targetChar.通用属性[prop].toString();
           // @ts-ignore
          if (targetChar.竞赛属性[prop] !== undefined) return targetChar.竞赛属性[prop].toString();

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
      const others = allChars.filter(c => c.instanceId !== char.instanceId);
      const randomMate = others.length > 0 
        ? others[Math.floor(Math.random() * others.length)].名称 
        : '某个路过的马娘';
      result = result.replace(/{随机队友}/g, randomMate);
  }

  return result;
};

export interface ActionResult {
    logs: string[];
    nextEventId?: string;
    newVariables?: Record<string, any>;
}

export const executeAction = (actionStr: string, char: RuntimeCharacter, turn: number, allChars: RuntimeCharacter[] = [], variables?: Record<string, any>): ActionResult => {
  if (!actionStr) return { logs: [] };
  
  const actions = actionStr.split(';').map(s => s.trim());
  const logs: string[] = [];
  let nextEventId: string | undefined = undefined;
  const currentVariables = { ...variables };

  actions.forEach(action => {
    if (!action) return;

    // 1. 设置变量 (New)
    // Syntax: 设置变量 角色 [Key] = 获取随机队友()
    // FIX: Using \S instead of \w to support Chinese characters in variable names
    if (action.startsWith('设置变量')) {
        const match = action.match(/设置变量\s+(\S+)\s+(\S+)\s*=\s*(.+)/);
        if (match) {
            const [_, type, key, func] = match;
            if (func.trim() === '获取随机队友()') {
                const others = allChars.filter(c => c.instanceId !== char.instanceId); // Exclude self
                if (others.length > 0) {
                    const randomMate = others[Math.floor(Math.random() * others.length)];
                    currentVariables[key] = randomMate.instanceId;
                    // Log hidden or debug?
                }
            }
        }
        return;
    }

    // 2. 关系变更 (Function Syntax)
    if (action.startsWith('关系变更(')) {
        const content = action.substring(action.indexOf('(') + 1, action.lastIndexOf(')'));
        const args = content.split(',').map(s => s.trim());
        
        // Case A: 关系变更(Subject, Target, Val)
        if (args.length === 3) {
            const subject = resolveTargetCharacter(args[0], char, allChars, currentVariables);
            let targetKey = 'p1';
            const val = parseInt(args[2]);

            if (subject) {
                 if (!subject.关系列表[targetKey]) subject.关系列表[targetKey] = { 友情: 0, 爱情: 0 };
                 subject.关系列表[targetKey].友情 = Math.max(0, Math.min(100, subject.关系列表[targetKey].友情 + val));
                 if (val < 0) subject.关系列表[targetKey].爱情 = Math.max(0, Math.min(100, subject.关系列表[targetKey].爱情 + val));

                 logs.push(`${subject.名称} 与 训练员 关系 ${val}`);
            }
        }
        // Case B: 关系变更(Type, Subject, Target, Val)
        if (args.length === 4) {
               const type = args[0] as '友情' | '爱情';
               const subject = resolveTargetCharacter(args[1], char, allChars, currentVariables);
               let targetKey = 'p1'; // Default
               const val = parseInt(args[3]);
               if (subject) {
                   if (!subject.关系列表[targetKey]) subject.关系列表[targetKey] = { 友情: 0, 爱情: 0 };
                   subject.关系列表[targetKey][type] = Math.max(0, Math.min(100, subject.关系列表[targetKey][type] + val));
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

    // Check if parts[0] is a variable or subject ref (contains '.')
    if (parts[0].includes('.')) {
        const [subjKey, command] = parts[0].split('.');
        const resolved = resolveTargetCharacter(subjKey, char, allChars, currentVariables);
        if (resolved) {
            subject = resolved;
            cmd = command;
            argsStartIndex = 1; // parts[1] is arg 1
        }
    } else if (currentVariables[parts[0]]) {
         // Variable acting as subject without dot? e.g. "随机角色 属性变更..."
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
      // @ts-ignore
      if (subject.通用属性[attr] !== undefined) {
        // @ts-ignore
        subject.通用属性[attr] = Math.max(0, Math.min(100, subject.通用属性[attr] + val));
      } 
      // @ts-ignore
      else if (subject.竞赛属性[attr] !== undefined) {
        // @ts-ignore
        subject.竞赛属性[attr] = Math.max(0, Math.min(1200, subject.竞赛属性[attr] + val));
      }
      const prefix = subject.instanceId !== char.instanceId ? `(${subject.名称})` : '';
      logs.push(`${prefix}${attr} ${val > 0 ? '+' : ''}${val}`);
    } 
    else if (cmd === '训练员属性变更') {
       const attr = parts[argsStartIndex];
       const val = parseInt(parts[argsStartIndex + 1]);
       logs.push(`(训练员)${attr} ${val > 0 ? '+' : ''}${val}`);
    }
    else if (cmd === '获得标签') {
      const tagId = parts[argsStartIndex];
      if (TAGS[tagId] && !subject.标签组.some(t => t.templateId === tagId)) {
        subject.标签组.push({ templateId: tagId, 添加日期: turn, 层数: 1 });
        const prefix = subject.instanceId !== char.instanceId ? `(${subject.名称})` : '';
        logs.push(`${prefix}获得标签【${TAGS[tagId].显示名}】`);
      }
    }
    else if (cmd === '移除标签') {
      const tagId = parts[argsStartIndex];
      const index = subject.标签组.findIndex(t => t.templateId === tagId);
      if (index !== -1) {
          subject.标签组.splice(index, 1);
          const prefix = subject.instanceId !== char.instanceId ? `(${subject.名称})` : '';
          logs.push(`${prefix}移除标签【${TAGS[tagId].显示名}】`);
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
        
        // 特质逻辑：木头 (爱情获取量 -80%)
        if (type === '爱情' && val > 0 && subject.标签组.some(t => t.templateId === '木头')) {
             val = Math.floor(val * 0.2);
        }

        if (!subject.关系列表[targetId]) {
            subject.关系列表[targetId] = { 友情: 0, 爱情: 0 };
        }
        
        subject.关系列表[targetId][type] = Math.max(0, Math.min(100, subject.关系列表[targetId][type] + val));
        
        const prefix = subject.instanceId !== char.instanceId ? `(${subject.名称})` : '';
    }
  });

  return { logs, nextEventId, newVariables: currentVariables };
};

// ===========================
// 被动效果处理 (Passive Effects)
// ===========================
const applyPassiveEffects = (char: RuntimeCharacter) => {
    // 好色: 每回合爱欲+2
    if (char.标签组.some(t => t.templateId === '好色')) {
        char.通用属性.爱欲 = Math.min(100, char.通用属性.爱欲 + 2);
    }
    // 小祖宗: 每回合心情-2
    if (char.标签组.some(t => t.templateId === '小祖宗')) {
        char.通用属性.心情 = Math.max(0, char.通用属性.心情 - 2);
    }
    // 社畜: 精力+2, 心情-1
    if (char.标签组.some(t => t.templateId === '社畜')) {
        char.通用属性.精力 = Math.min(100, char.通用属性.精力 + 2);
        char.通用属性.心情 = Math.max(0, char.通用属性.心情 - 1);
    }
    // 受虐狂 (原抖M): 心情-1, 爱欲+1
    if (char.标签组.some(t => t.templateId === '受虐狂')) {
        char.通用属性.爱欲 = Math.min(100, char.通用属性.爱欲 + 1);
        char.通用属性.心情 = Math.max(0, char.通用属性.心情 - 1);
    }
    // 施虐狂 (原抖S): 心情+1, 爱欲+1 (愉悦犯)
    if (char.标签组.some(t => t.templateId === '施虐狂')) {
        char.通用属性.爱欲 = Math.min(100, char.通用属性.爱欲 + 1);
        char.通用属性.心情 = Math.min(100, char.通用属性.心情 + 1);
    }
};

// ===========================
// 主逻辑 (Core Logic)
// ===========================

export const triggerCharacterEvent = (state: GameState, instanceId: string): GameState => {
    const charIndex = state.characters.findIndex(c => c.instanceId === instanceId);
    if (charIndex === -1) return state;

    const char = state.characters[charIndex];
    const newChar = JSON.parse(JSON.stringify(char)) as RuntimeCharacter;
    
    const newLogs = [...state.logs];
    const pendingEvents = [...state.pendingEvents];

    // 1. Apply Passive Effects
    applyPassiveEffects(newChar);

    // 2. Filter Events based on updated stats AND current turn
    // Pass turn to checkCondition
    const validEvents = EVENTS.filter(e => {
        const triggerCount = newChar.已触发事件[e.id] || 0;
        if (e.可触发次数 !== -1 && triggerCount >= e.可触发次数) return false;
        return checkCondition(e.触发条件, newChar, state.currentTurn, undefined, state.characters);
    });

    if (validEvents.length === 0) {
        newLogs.push({
            turn: state.currentTurn,
            characterName: newChar.名称,
            text: `${newChar.名称} 度过了平静的半个月。`,
            type: 'event'
        });
        const newCharacters = [...state.characters];
        newCharacters[charIndex] = newChar;
        return { ...state, characters: newCharacters, logs: newLogs };
    }

    const totalWeight = validEvents.reduce((sum, e) => sum + e.权重, 0);
    let random = Math.random() * totalWeight;
    let selectedEvent = validEvents[validEvents.length - 1];
    for (const e of validEvents) {
        random -= e.权重;
        if (random <= 0) {
            selectedEvent = e;
            break;
        }
    }

    newChar.已触发事件[selectedEvent.id] = (newChar.已触发事件[selectedEvent.id] || 0) + 1;

    // --- Execute Pre-Actions ---
    let eventVariables: Record<string, any> | undefined = undefined;
    if (selectedEvent.预操作指令) {
        const res = executeAction(selectedEvent.预操作指令, newChar, state.currentTurn, state.characters);
        eventVariables = res.newVariables;
    }

    let effectHtml = '';
    let jumpId: string | undefined = undefined;
    if (selectedEvent.操作指令) {
        const { logs, nextEventId } = executeAction(selectedEvent.操作指令, newChar, state.currentTurn, state.characters, eventVariables);
        if (logs.length > 0) {
            effectHtml = `<div class='mt-2 pt-2 border-t border-dashed border-gray-200 text-xs text-gray-400 font-bold'>${logs.join('  ')}</div>`;
        }
        jumpId = nextEventId;
    }

    if (!selectedEvent.选项组 || selectedEvent.选项组.length === 0) {
        if (selectedEvent.分支组) {
            for (const branch of selectedEvent.分支组) {
                // Pass turn to checkCondition
                if (checkCondition(branch.判别式, newChar, state.currentTurn, undefined, state.characters, eventVariables)) {
                    const { logs, nextEventId } = executeAction(branch.操作指令, newChar, state.currentTurn, state.characters, eventVariables);
                    if (logs.length > 0) {
                        effectHtml += `<div class='mt-1 text-xs text-gray-400 font-bold'>(分支效果: ${logs.join(' ')})</div>`;
                    }
                    if (nextEventId) jumpId = nextEventId;
                    if (branch.跳转事件ID) jumpId = branch.跳转事件ID;
                    break;
                }
            }
        }
    }

    // Pass turn to parseText
    const parsedText = parseText(selectedEvent.正文, newChar, state.currentTurn, state.characters, eventVariables) + effectHtml;
    newLogs.push({
        turn: state.currentTurn,
        characterName: newChar.名称,
        text: parsedText,
        type: 'event',
        isImportant: !!selectedEvent.标题
    });

    const newCharacters = [...state.characters];
    newCharacters[charIndex] = newChar;

    if (selectedEvent.选项组 && selectedEvent.选项组.length > 0) {
        pendingEvents.push({ 
            characterId: instanceId, 
            event: selectedEvent,
            variables: eventVariables 
        });
    } else if (jumpId) {
        const nextEvent = EVENTS.find(e => e.id === jumpId);
        if (nextEvent) {
            pendingEvents.unshift({ 
                characterId: instanceId, 
                event: nextEvent,
                variables: eventVariables 
            });
        }
    }

    return {
        ...state,
        characters: newCharacters,
        logs: newLogs,
        pendingEvents
    };
};
