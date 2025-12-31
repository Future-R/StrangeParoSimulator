
import { GameState, GameEvent, RuntimeCharacter, PendingEventItem } from '../../types';
import { EVENTS } from '../../constants';
import { checkCondition } from './condition';
import { executeAction } from './action';
import { parseText } from './text';

// Helper: Calculate differences for a single character
const calculateCharDiffs = (oldChar: RuntimeCharacter, newChar: RuntimeCharacter, allNewChars: RuntimeCharacter[], isSubject: boolean): string[] => {
    const diffs: string[] = [];
    const getDiff = (a: number, b: number) => {
        const d = b - a;
        return d > 0 ? `+${d}` : `${d}`;
    };

    // 1. Attributes
    const attrs: (keyof typeof oldChar.通用属性)[] = ['体力', '精力', '心情', '爱欲', '体质', '学识', '魅力', '财富'];
    attrs.forEach(k => {
        const diff = newChar.通用属性[k] - oldChar.通用属性[k];
        if (diff !== 0) {
            diffs.push(`${k}${getDiff(oldChar.通用属性[k], newChar.通用属性[k])}`);
        }
    });
    
    const rAttrs: (keyof typeof oldChar.竞赛属性)[] = ['速度', '耐力', '力量', '毅力', '智慧'];
    rAttrs.forEach(k => {
         const diff = newChar.竞赛属性[k] - oldChar.竞赛属性[k];
         if (diff !== 0) {
            diffs.push(`${k}${getDiff(oldChar.竞赛属性[k], newChar.竞赛属性[k])}`);
        }
    });

    // 2. Tags
    const oldTags = oldChar.标签组.map(t => t.templateId);
    const newTags = newChar.标签组.map(t => t.templateId);
    newTags.forEach(t => {
        if (!oldTags.includes(t)) diffs.push(`获得[${t}]`);
    });
    oldTags.forEach(t => {
         if (!newTags.includes(t)) diffs.push(`移除[${t}]`);
    });

    // 3. Relationships (Show Trend Only)
    const allRelKeys = Array.from(new Set([...Object.keys(oldChar.关系列表), ...Object.keys(newChar.关系列表)]));
    allRelKeys.forEach(targetId => {
         const oldRel = oldChar.关系列表[targetId] || { 友情: 0, 爱情: 0 };
         const newRel = newChar.关系列表[targetId] || { 友情: 0, 爱情: 0 };
         
         let targetLabel = '';
         if (targetId !== 'p1') {
             const tChar = allNewChars.find(c => c.instanceId === targetId);
             if (tChar) targetLabel = `(${tChar.名称})`;
         }

         if (oldRel.友情 !== newRel.友情) {
             const symbol = newRel.友情 > oldRel.友情 ? '↑' : '↓';
             diffs.push(`友情${targetLabel}${symbol}`);
         }
         if (oldRel.爱情 !== newRel.爱情) {
             const symbol = newRel.爱情 > oldRel.爱情 ? '↑' : '↓';
             diffs.push(`爱情${targetLabel}${symbol}`);
         }
    });

    return diffs;
};

export const generateStateDiffLog = (oldChars: RuntimeCharacter[], newChars: RuntimeCharacter[], subjectId: string): string[] => {
    const lines: string[] = [];

    // 1. Handle Subject First (No Name Prefix)
    const subjectNew = newChars.find(c => c.instanceId === subjectId);
    const subjectOld = oldChars.find(c => c.instanceId === subjectId);

    if (subjectNew && subjectOld) {
        const charDiffs = calculateCharDiffs(subjectOld, subjectNew, newChars, true);
        if (charDiffs.length > 0) {
            lines.push(charDiffs.join(', '));
        }
    }

    // 2. Handle Others (With Name Prefix)
    newChars.forEach(newChar => {
        if (newChar.instanceId === subjectId) return;
        const oldChar = oldChars.find(c => c.instanceId === newChar.instanceId);
        if (!oldChar) return;

        const charDiffs = calculateCharDiffs(oldChar, newChar, newChars, false);
        if (charDiffs.length > 0) {
            lines.push(`${newChar.名称}：${charDiffs.join(', ')}`);
        }
    });

    return lines;
};

// Helper to apply option effects (Used by both manual and auto choices)
const applyOptionEffect = (
    state: GameState, 
    characterId: string, 
    event: GameEvent, 
    optionIndex: number, 
    variables: Record<string, any>,
    forceChoiceText?: string
): GameState => {
    const newState = JSON.parse(JSON.stringify(state)) as GameState;
    const char = newState.characters.find(c => c.instanceId === characterId)!;
    const snapshotChars = JSON.parse(JSON.stringify(state.characters)) as RuntimeCharacter[];
    
    let nextEventId: string | undefined = undefined;
    const option = event.选项组?.[optionIndex];

    if (option) {
        // Execute Option Action
        const res = executeAction(option.操作指令, char, newState.currentTurn, newState.characters, variables, true, event.标签组);
        if (res.nextEventId) nextEventId = res.nextEventId;

        // Execute Branches
        if (event.分支组) {
            for (const branch of event.分支组) {
                 if (checkCondition(branch.判别式, char, newState.currentTurn, optionIndex + 1, newState.characters, variables)) {
                     const bRes = executeAction(branch.操作指令, char, newState.currentTurn, newState.characters, variables, true, event.标签组);
                     if (bRes.nextEventId) nextEventId = bRes.nextEventId;
                     if (branch.跳转事件ID) nextEventId = branch.跳转事件ID;
                     break;
                 }
            }
        }

        // Generate Diff Log
        const diffs = generateStateDiffLog(snapshotChars, newState.characters, characterId);
        // Clean formatting: No outer parens, lines separated by <br/>
        const diffHtml = diffs.length > 0 ? `<div class='mt-1 text-xs font-bold text-gray-500 leading-tight'>${diffs.join('<br/>')}</div>` : "";
        
        // Log Choice
        const displayText = forceChoiceText || parseText(option.显示文本, char, newState.currentTurn, newState.characters, variables);
        newState.logs.push({
            turn: newState.currentTurn,
            characterName: char.名称,
            text: `选择了【${displayText}】${diffHtml}`,
            type: 'choice'
        });
    }

    // Tag Logic (Work/Stress)
    if (event.标签组?.includes('工作') && char.标签组.some(t => t.templateId === '社畜')) {
         if (char.通用属性.体力 >= 5 && char.通用属性.心情 >= 5) {
             char.通用属性.体力 -= 5;
             char.通用属性.心情 -= 5;
             char.通用属性.精力 = Math.min(100, char.通用属性.精力 + 10);
         }
    }

    // Chain Next Event
    if (nextEventId) {
        const nextEvent = EVENTS.find(e => e.id === nextEventId);
        if (nextEvent) {
            return processEvent(newState, nextEvent, characterId, variables);
        }
    }

    // Check Game Over
    if (event.标签组?.includes('结局')) {
        newState.gamePhase = 'gameover';
    }

    return newState;
};

export const processEvent = (
    currentState: GameState, 
    event: GameEvent, 
    characterId: string, 
    initialVariables: Record<string, any> = {}
): GameState => {
    // 1. Strict Interactive Check: Must have options array with length > 0
    const hasOptions = Array.isArray(event.选项组) && event.选项组.length > 0;
    const isInteractive = hasOptions;

    const char = currentState.characters.find(c => c.instanceId === characterId)!;
    const isMultiplePersonality = char.标签组.some(t => t.templateId === '多重人格');

    // --- Case 1: Interactive (Has Options) ---
    if (isInteractive) {
        // [Multiple Personality Logic - Interactive]
        // 50% chance to auto-choose randomly, suppress modal, and restore stats
        if (isMultiplePersonality && Math.random() < 0.5) {
            let newState = JSON.parse(JSON.stringify(currentState)) as GameState;
            const newChar = newState.characters.find(c => c.instanceId === characterId)!;
            
            // Execute Pre-Action (Silent)
            let variables = { ...initialVariables };
            if (event.预操作指令) {
                const res = executeAction(event.预操作指令, newChar, newState.currentTurn, newState.characters, variables, true, event.标签组);
                variables = { ...variables, ...(res.newVariables || {}) };
            }

            // Log "Memory Lost"
            const memoryLostText = `${newChar.名称}没有这段记忆。`;
            newState.logs.push({
                turn: newState.currentTurn,
                characterName: newChar.名称,
                text: memoryLostText,
                type: 'event',
                isImportant: !!event.标题
            });

            // Random Choice with Visibility Check
            let randomIdx = 0;
            const options = event.选项组 || [];
            if (options.length > 0) {
                 const validIndices: number[] = [];
                 options.forEach((opt, idx) => {
                     const isVisible = !opt.可见条件 || checkCondition(opt.可见条件, newChar, newState.currentTurn, undefined, newState.characters, variables);
                     if (isVisible) validIndices.push(idx);
                 });
                 
                 if (validIndices.length > 0) {
                     randomIdx = validIndices[Math.floor(Math.random() * validIndices.length)];
                 }
            }
            
            // Compensation Injection:
            // Instead of manually updating stats here, we modify the event logic on-the-fly
            // so that `applyOptionEffect` captures the stat restoration in the diff log.
            const compensatedEvent = { ...event };
            if (compensatedEvent.选项组) {
                // Clone the options array and the specific option to avoid mutating the global constant
                compensatedEvent.选项组 = [...compensatedEvent.选项组];
                const selectedOption = { ...compensatedEvent.选项组[randomIdx] };
                
                // Prepend the restoration command
                selectedOption.操作指令 = `属性变更 体力 5; 属性变更 精力 5; ${selectedOption.操作指令 || ''}`;
                compensatedEvent.选项组[randomIdx] = selectedOption;
            }

            // Apply Choice with obfuscated text
            // Note: We use `newState` (which has pre-actions applied) as the base.
            // `applyOptionEffect` will snapshot this base, execute the (now compensated) option, and diff them.
            return applyOptionEffect(
                newState, 
                characterId, 
                compensatedEvent, 
                randomIdx, 
                variables, 
                "你不知道做出了什么选择" // Override choice text
            );
        }

        // Normal Interactive Flow
        let variables = { ...initialVariables };
        // Execute Pre-Action on a temp state for variable resolution in UI
        const newState = JSON.parse(JSON.stringify(currentState)) as GameState;
        const newChar = newState.characters.find(c => c.instanceId === characterId)!;
        
        if (event.预操作指令) {
             const res = executeAction(event.预操作指令, newChar, newState.currentTurn, newState.characters, variables, true, event.标签组);
             variables = { ...variables, ...(res.newVariables || {}) };
        }

        return {
             ...newState,
             pendingEvents: [{
                 characterId,
                 event,
                 variables,
                 parsedText: parseText(event.正文, newChar, newState.currentTurn, newState.characters, variables),
                 parsedTitle: event.标题 ? parseText(event.标题, newChar, newState.currentTurn, newState.characters, variables) : undefined
             }, ...newState.pendingEvents]
        };
    }

    // --- Case 2: Non-Interactive (Flavor/Auto) ---
    // Execute immediately and chain if needed.
    let newState = JSON.parse(JSON.stringify(currentState)) as GameState;
    const newChar = newState.characters.find(c => c.instanceId === characterId)!;
    const snapshotChars = JSON.parse(JSON.stringify(currentState.characters)) as RuntimeCharacter[];
    let variables = { ...initialVariables };

    // 1. Pre-Action
    if (event.预操作指令) {
        const res = executeAction(event.预操作指令, newChar, newState.currentTurn, newState.characters, variables, true, event.标签组);
        variables = { ...variables, ...(res.newVariables || {}) };
    }

    // 2. Action (Auto-resolve branches or direct action)
    let nextEventId: string | undefined = undefined;

    if (event.操作指令) {
        const res = executeAction(event.操作指令, newChar, newState.currentTurn, newState.characters, variables, true, event.标签组);
        if (res.nextEventId) nextEventId = res.nextEventId;
    }

    if (event.分支组) {
        for (const branch of event.分支组) {
            if (checkCondition(branch.判别式, newChar, newState.currentTurn, undefined, newState.characters, variables)) {
                const bRes = executeAction(branch.操作指令, newChar, newState.currentTurn, newState.characters, variables, true, event.标签组);
                if (bRes.nextEventId) nextEventId = bRes.nextEventId;
                if (branch.跳转事件ID) nextEventId = branch.跳转事件ID;
                break;
            }
        }
    }

    // 3. Log
    const diffs = generateStateDiffLog(snapshotChars, newState.characters, characterId);
    let diffHtml = '';
    if (diffs.length > 0) diffHtml = `<div class='mt-1 text-xs font-bold text-gray-500 leading-tight'>${diffs.join('<br/>')}</div>`;
    
    let parsedText = parseText(event.正文, newChar, newState.currentTurn, newState.characters, variables);

    // Fallback if parsed text is empty but original text was not (Safety)
    if (!parsedText && event.正文 && event.正文.trim() !== '') {
        parsedText = event.正文; 
    }

    // [Multiple Personality Logic - Non-Interactive]
    // 20% chance to "forget" the text (but effects still happened)
    if (isMultiplePersonality && Math.random() < 0.2) {
        parsedText = `${newChar.名称}没有这段记忆。`;
    }
    
    newState.logs.push({
        turn: newState.currentTurn,
        characterName: newChar.名称,
        text: parsedText + diffHtml,
        type: 'event',
        isImportant: false
    });

    // 4. Chain
    if (nextEventId) {
        const nextEvent = EVENTS.find(e => e.id === nextEventId);
        if (nextEvent) {
            return processEvent(newState, nextEvent, characterId, variables);
        }
    }

    return newState;
};

export const resolvePendingEvent = (gameState: GameState, optionIndex: number): GameState => {
    if (gameState.pendingEvents.length === 0) return gameState;

    const currentItem = gameState.pendingEvents[0];
    const { characterId, event, variables } = currentItem;
    
    // Remove current pending event
    const baseState = {
        ...gameState,
        pendingEvents: gameState.pendingEvents.slice(1)
    };

    const char = baseState.characters.find(c => c.instanceId === characterId)!;

    // Log the Event Text First (The prompt)
    const eventText = currentItem.parsedText || parseText(event.正文, char, baseState.currentTurn, baseState.characters, variables);
    baseState.logs.push({
        turn: baseState.currentTurn,
        characterName: char.名称,
        text: eventText,
        type: 'event',
        isImportant: !!event.标题
    });

    // Fallback if needed
    if (optionIndex === -1 && (!event.选项组 || event.选项组.length === 0)) {
         return processEvent(baseState, { ...event, 标题: undefined, 选项组: [] }, characterId, variables);
    }

    return applyOptionEffect(baseState, characterId, event, optionIndex, variables || {});
};

export const triggerCharacterEvent = (
    state: GameState, 
    characterId: string, 
    specificEvent?: GameEvent
): GameState => {
    const char = state.characters.find(c => c.instanceId === characterId);
    if (!char) return state;

    let eventToTrigger = specificEvent;

    if (!eventToTrigger) {
        const validEvents = EVENTS.filter(e => {
            const triggeredCount = char.已触发事件[e.id] || 0;
            if (e.可触发次数 !== -1 && triggeredCount >= e.可触发次数) return false;
            return checkCondition(e.触发条件, char, state.currentTurn, undefined, state.characters);
        });

        if (validEvents.length === 0) return state;

        const totalWeight = validEvents.reduce((sum, e) => sum + e.权重, 0);
        let randomVal = Math.random() * totalWeight;
        
        for (const e of validEvents) {
            randomVal -= e.权重;
            if (randomVal <= 0) {
                eventToTrigger = e;
                break;
            }
        }
        
        if (!eventToTrigger) eventToTrigger = validEvents[validEvents.length - 1];
    }

    if (!eventToTrigger) return state;

    const nextState = processEvent(state, eventToTrigger, characterId);
    
    const nextChar = nextState.characters.find(c => c.instanceId === characterId);
    if (nextChar) {
        nextChar.已触发事件[eventToTrigger.id] = (nextChar.已触发事件[eventToTrigger.id] || 0) + 1;
    }

    return nextState;
};
