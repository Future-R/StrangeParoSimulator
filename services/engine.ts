import { RuntimeCharacter, GameEvent, EventOption, RuntimeTag, CharacterTemplate, GameState, LogEntry, PendingEventItem, TagTemplate, EventBranch } from '../types';
import { EVENTS, CHARACTERS, TAGS } from '../constants';

// ===========================
// 帮助函数 (Helpers)
// ===========================

export const getTurnDate = (turn: number): string => {
  const year = Math.floor((turn - 1) / 24) + 1;
  const monthIndex = Math.floor(((turn - 1) % 24) / 2);
  const month = monthIndex + 1;
  const isLate = (turn - 1) % 2 === 1;
  return `第${year}年 ${month}月 ${isLate ? '下旬' : '上旬'}`;
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

// 增强判别：支持 choiceIndex, 关系判断, 以及训练员属性判断
export const checkCondition = (condition: string, char: RuntimeCharacter, choiceIndex?: number, allChars: RuntimeCharacter[] = []): boolean => {
  if (!condition || condition.trim() === '') return true;

  const subConditions = condition.split('&&').map(s => s.trim());
  
  return subConditions.every(cond => {
    // 1. 选项序号判别 (用于分支组)
    if (cond.startsWith('已选序号')) {
        const match = cond.match(/已选序号\s*==\s*(\d+)/);
        if (match) {
            return choiceIndex === parseInt(match[1]);
        }
    }

    // 2. 标签检查
    if (cond.includes('当前角色.标签组 存在')) {
      const match = cond.match(/"([^"]+)"/);
      if (match) return char.标签组.some(t => t.templateId === match[1]);
      return false;
    }
    
    if (cond.includes('当前角色.标签组 不存在')) {
      const match = cond.match(/"([^"]+)"/);
      if (match) return !char.标签组.some(t => t.templateId === match[1]);
      return true;
    }

    // 3. 随机数
    if (cond.startsWith('随机')) {
      const match = cond.match(/随机\(\s*(\d+)~(\d+)\s*\)\s*([>=<]+)\s*(\d+)/);
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

    // 4. 属性检查 (当前角色)
    if (cond.includes('当前角色.属性.')) {
      const match = cond.match(/当前角色\.属性\.(\w+)\s*([>=<]+)\s*(\d+)/);
      if (match) {
        const attrName = match[1];
        const op = match[2];
        const val = parseInt(match[3]);
        // @ts-ignore
        const currentVal = char.通用属性[attrName] ?? char.竞赛属性[attrName] ?? 0;
        switch (op) {
          case '>': return currentVal > val;
          case '>=': return currentVal >= val;
          case '<': return currentVal < val;
          case '<=': return currentVal <= val;
          case '==': return currentVal === val;
        }
      }
    }

    // 5. 关系检查
    // 语法: 当前角色.关系.玩家.友情 > 50
    if (cond.includes('当前角色.关系.玩家.')) {
        const match = cond.match(/当前角色\.关系\.玩家\.(\w+)\s*([>=<]+)\s*(\d+)/);
        if (match) {
            const type = match[1] as '友情' | '爱情';
            const op = match[2];
            const val = parseInt(match[3]);
            // 默认目标是 p1
            const rel = char.关系列表['p1'] || { 友情: 0, 爱情: 0 };
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

    // 6. 训练员属性检查 (新增)
    // 语法: 训练员.性别 == "女"
    if (cond.includes('训练员.性别')) {
        const trainer = allChars.find(c => c.templateId === 'player_template' || c.instanceId === 'p1');
        if (trainer) {
            const match = cond.match(/训练员\.性别\s*==\s*"([^"]+)"/);
            if (match) {
                return trainer.性别 === match[1];
            }
        }
    }

    if (cond.includes('当前角色.模板ID')) {
        const match = cond.match(/当前角色\.模板ID\s*==\s*"([^"]+)"/);
        if (match) return char.templateId === match[1];
    }

    return false;
  });
};

// ===========================
// DSL 解析器 (DSL Parser)
// ===========================

export const parseText = (text: string, char: RuntimeCharacter, allChars: RuntimeCharacter[] = []): string => {
  let result = text;
  
  // 查找训练员
  const trainer = allChars.find(c => c.templateId === 'player_template') || allChars.find(c => c.instanceId === 'p1');
  const trainerGender = trainer?.性别 || '男';

  // 1. 动态称呼解析
  let calling = '训练员'; // 默认值
  if (char.称呼列表 && char.称呼列表.length > 0) {
      for (const rule of char.称呼列表) {
          // 如果没有判别式，或者判别式为真，则使用该称呼
          if (!rule.判别式 || checkCondition(rule.判别式, char, undefined, allChars)) {
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

  // 3. 称呼替换 (Unified)
  result = result.replace(/{训练员\.称呼}/g, calling);
  // 为了兼容旧配置，也替换其他变体，或者根据需求映射到 calling
  result = result.replace(/{训练员\.兄姐}/g, calling); 
  
  // 辅助代词
  result = result.replace(/{训练员\.他她}/g, trainerGender === '男' ? '他' : '她');
  result = result.replace(/{训练员\.你}/g, '你'); 

  // 4. 随机队友替换
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
}

export const executeAction = (actionStr: string, char: RuntimeCharacter, turn: number): ActionResult => {
  if (!actionStr) return { logs: [] };
  
  const actions = actionStr.split(';').map(s => s.trim());
  const logs: string[] = [];
  let nextEventId: string | undefined = undefined;

  actions.forEach(action => {
    if (!action) return;
    const parts = action.split(' ');
    const cmd = parts[0];

    if (cmd === '属性变更') {
      const attr = parts[1];
      const val = parseInt(parts[2]);
      // @ts-ignore
      if (char.通用属性[attr] !== undefined) {
        // @ts-ignore
        // UPDATE: All general attributes and status attributes now capped at 100
        char.通用属性[attr] = Math.max(0, Math.min(100, char.通用属性[attr] + val));
      } 
      // @ts-ignore
      else if (char.竞赛属性[attr] !== undefined) {
        // @ts-ignore
        char.竞赛属性[attr] = Math.max(0, Math.min(1200, char.竞赛属性[attr] + val));
      }
      logs.push(`${attr} ${val > 0 ? '+' : ''}${val}`);
    } 
    else if (cmd === '训练员属性变更') {
       // Only used to display logs if applied to self, actual change happens in parent state or needs complex refactor.
       // NOTE: Currently executeAction modifies 'char' in place. 
       // For trainer modification from Uma event, we need access to trainer char which is not passed here by reference easily for modification.
       // SIMPLIFICATION: We will ignore cross-character modification in this simplified logic OR assume 'char' is the one being modified.
       // However, for logs we can pretend.
       const attr = parts[1];
       const val = parseInt(parts[2]);
       logs.push(`(训练员)${attr} ${val > 0 ? '+' : ''}${val}`);
    }
    else if (cmd === '获得标签') {
      const tagId = parts[1];
      if (TAGS[tagId] && !char.标签组.some(t => t.templateId === tagId)) {
        char.标签组.push({ templateId: tagId, 添加日期: turn, 层数: 1 });
        logs.push(`获得标签【${TAGS[tagId].显示名}】`);
      }
    }
    else if (cmd === '移除标签') {
      const tagId = parts[1];
      const index = char.标签组.findIndex(t => t.templateId === tagId);
      if (index !== -1) {
          char.标签组.splice(index, 1);
          logs.push(`移除标签【${TAGS[tagId].显示名}】`);
      }
    }
    else if (cmd === '概率获得标签') {
      const chance = parseInt(parts[1]);
      const tagId = parts[2];
      if (Math.random() * 100 < chance) {
         if (TAGS[tagId] && !char.标签组.some(t => t.templateId === tagId)) {
            char.标签组.push({ templateId: tagId, 添加日期: turn, 层数: 1 });
            logs.push(`触发：获得标签【${TAGS[tagId].显示名}】`);
         }
      }
    }
    else if (cmd === '跳转') {
        nextEventId = parts[1];
    }
    else if (cmd === '概率跳转') {
        const chance = parseInt(parts[1]);
        const successEvent = parts[2];
        const failEvent = parts[3];
        if (Math.random() * 100 < chance) nextEventId = successEvent;
        else if (failEvent) nextEventId = failEvent;
    }
    else if (cmd === '关系变更') {
        const type = parts[1] as '友情' | '爱情';
        let val = parseInt(parts[2]);
        const targetId = 'p1'; 
        
        // 特质逻辑：木头 (爱情获取量 -80%)
        if (type === '爱情' && val > 0 && char.标签组.some(t => t.templateId === '木头')) {
             val = Math.floor(val * 0.2);
        }

        if (!char.关系列表[targetId]) {
            char.关系列表[targetId] = { 友情: 0, 爱情: 0 };
        }
        
        char.关系列表[targetId][type] = Math.max(0, Math.min(100, char.关系列表[targetId][type] + val));
    }
  });

  return { logs, nextEventId };
};

// ===========================
// 被动效果处理 (Passive Effects)
// ===========================
const applyPassiveEffects = (char: RuntimeCharacter) => {
    // 隐藏被动效果的Log显示，直接应用数值
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

    // 1. Apply Passive Effects FIRST (Silently)
    applyPassiveEffects(newChar);

    // 2. Filter Events based on updated stats
    // Pass allChars to checkCondition
    const validEvents = EVENTS.filter(e => {
        const triggerCount = newChar.已触发事件[e.id] || 0;
        if (e.可触发次数 !== -1 && triggerCount >= e.可触发次数) return false;
        return checkCondition(e.触发条件, newChar, undefined, state.characters);
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

    let effectHtml = '';
    let jumpId: string | undefined = undefined;
    if (selectedEvent.操作指令) {
        const { logs, nextEventId } = executeAction(selectedEvent.操作指令, newChar, state.currentTurn);
        if (logs.length > 0) {
            effectHtml = `<div class='mt-2 pt-2 border-t border-dashed border-gray-200 text-xs text-gray-400 font-bold'>${logs.join('  ')}</div>`;
        }
        jumpId = nextEventId;
    }

    if (!selectedEvent.选项组 || selectedEvent.选项组.length === 0) {
        if (selectedEvent.分支组) {
            for (const branch of selectedEvent.分支组) {
                // Pass allChars
                if (checkCondition(branch.判别式, newChar, undefined, state.characters)) {
                    const { logs, nextEventId } = executeAction(branch.操作指令, newChar, state.currentTurn);
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

    const parsedText = parseText(selectedEvent.正文, newChar, state.characters) + effectHtml;
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
        pendingEvents.push({ characterId: instanceId, event: selectedEvent });
    } else if (jumpId) {
        const nextEvent = EVENTS.find(e => e.id === jumpId);
        if (nextEvent) {
            pendingEvents.unshift({ characterId: instanceId, event: nextEvent });
        }
    }

    return {
        ...state,
        characters: newCharacters,
        logs: newLogs,
        pendingEvents
    };
};