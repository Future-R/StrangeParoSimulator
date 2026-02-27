
import { RuntimeCharacter, RaceAttributes } from '../../types';
import { checkCondition } from './condition';
import { resolveTargetCharacter } from './character';
import { evalValue, applyRelationshipModifiers } from './utils';

// Helper to ensure we are working with fresh character instances from the current state
const refreshList = (list: any[], allChars: RuntimeCharacter[]): any[] => {
    if (!Array.isArray(list)) return [];
    return list.map(item => {
        if (item && typeof item === 'object' && item.instanceId) {
            return allChars.find(c => c.instanceId === item.instanceId) || item;
        }
        return item;
    });
};

export const executeAction = (
    commandStr: string,
    subject: RuntimeCharacter,
    turn: number,
    allChars: RuntimeCharacter[],
    variables: Record<string, any>,
    isSilent: boolean = false,
    eventTags: string[] = []
): { newVariables?: Record<string, any>, nextEventId?: string, isWait?: boolean, printOutputs?: string[] } => {
    if (!commandStr) return {};

    // Removed global comma normalization per user request to preserve Chinese commas in text
    const commands = commandStr.split(';').map(s => s.trim()).filter(s => s);
    const result: { newVariables?: Record<string, any>, nextEventId?: string, isWait?: boolean, printOutputs: string[] } = {
        newVariables: {},
        printOutputs: []
    };

    commands.forEach(rawCmd => {
        // 1. Normalization for common natural language typos/aliases
        // Supports: "训练员属性变更" -> "训练员.属性变更"
        let cmd = rawCmd.replace(/^训练员属性变更/, '训练员.属性变更');

        const ifIndex = cmd.lastIndexOf(' 若 ');
        if (ifIndex !== -1) {
            const condition = cmd.substring(ifIndex + 3).trim();
            const action = cmd.substring(0, ifIndex).trim();
            if (!checkCondition(condition, subject, turn, undefined, allChars, variables)) {
                return;
            }
            cmd = action;
        }

        const parts = cmd.split(' ');
        const op = parts[0];

        let target = subject;
        let actionParts = parts;

        // Target Resolution (Syntax: "TargetName.Action")
        if (op.includes('.')) {
            const [targetKey, realOp] = op.split('.');
            const resolved = resolveTargetCharacter(targetKey, subject, allChars, variables);
            if (resolved) {
                target = resolved;
                actionParts = [realOp, ...parts.slice(1)];
            }
        }

        // Fix: Normalize action name by stripping function call parentheses
        // e.g. "让角色入队(目标)" -> "让角色入队"
        const rawAction = actionParts[0];
        const action = rawAction.includes('(') ? rawAction.split('(')[0] : rawAction;

        switch (action) {
            case '属性变更': {
                const attr = actionParts[1] as string;
                const valStr = actionParts[2];
                // Note: val is calculated once here. If '随机(min~max)' is used, it's evaluated now.
                // We pass 'target' as the subject for evalValue to allow "属性.体质" relative to the target char
                const val = evalValue(valStr, variables, target, allChars);

                const raceAttrs: (keyof RaceAttributes)[] = ['速度', '耐力', '力量', '毅力', '智慧'];

                if (attr === '随机' || attr === '随机属性') {
                    const randomAttr = raceAttrs[Math.floor(Math.random() * raceAttrs.length)];
                    target.竞赛属性[randomAttr] = Math.max(0, target.竞赛属性[randomAttr] + val);
                } else if (attr === '全属性') {
                    raceAttrs.forEach(a => {
                        target.竞赛属性[a] = Math.max(0, target.竞赛属性[a] + val);
                    });
                } else if (target.通用属性[attr as keyof typeof target.通用属性] !== undefined) {
                    // @ts-ignore
                    target.通用属性[attr] = Math.max(0, Math.min(100, target.通用属性[attr] + val));
                } else if (target.竞赛属性[attr as keyof typeof target.竞赛属性] !== undefined) {
                    // @ts-ignore
                    target.竞赛属性[attr] = Math.max(0, target.竞赛属性[attr] + val);
                }
                break;
            }
            case '关系变更': {
                const fullCmd = actionParts.join(' ');
                // Fixed regex: Use (.+) for the last argument to allow nested parentheses like 随机(5~15)
                const funcMatch = fullCmd.match(/关系变更\(([^,]+),\s*([^,]+),\s*([^,]+),\s*(.+)\)/);
                if (funcMatch) {
                    const type = funcMatch[1].trim() as '友情' | '爱情';
                    const subjectKey = funcMatch[2].trim(); // Arg 1: Subject (Who feels)
                    const objectKey = funcMatch[3].trim();  // Arg 2: Object (Whom they feel about)
                    const val = evalValue(funcMatch[4].trim(), variables, subject, allChars);

                    const subjectChar = resolveTargetCharacter(subjectKey, subject, allChars, variables);
                    const objectChar = resolveTargetCharacter(objectKey, subject, allChars, variables);

                    // Logic: Subject's feeling towards Object changes
                    if (subjectChar && objectChar) {
                        const finalVal = applyRelationshipModifiers(val, objectChar, type);
                        if (!subjectChar.关系列表[objectChar.instanceId]) subjectChar.关系列表[objectChar.instanceId] = { 友情: 0, 爱情: 0 };
                        const rel = subjectChar.关系列表[objectChar.instanceId];
                        rel[type] = Math.min(100, Math.max(0, rel[type] + finalVal));
                    }
                } else {
                    // Default shorthand: 关系变更 友情 10
                    // Implies: Current Target (subject of the action context) -> Player (p1)
                    const type = actionParts[1] as '友情' | '爱情';
                    const val = evalValue(actionParts[2], variables, target, allChars);
                    const p1 = allChars.find(c => c.instanceId === 'p1');
                    if (p1) {
                        const finalVal = applyRelationshipModifiers(val, p1, type);
                        if (!target.关系列表['p1']) target.关系列表['p1'] = { 友情: 0, 爱情: 0 };
                        const rel = target.关系列表['p1'];
                        rel[type] = Math.min(100, Math.max(0, rel[type] + finalVal));
                    }
                }
                break;
            }
            case '双向关系变更':
            case '双向关系变更(友情,':
                {
                    const fullCmd = actionParts.join(' ');

                    // Pattern 1: A/B Pair (Existing)
                    // e.g. 双向关系变更(友情, A/B, 10)
                    const matchPair = fullCmd.match(/双向关系变更\(([^,]+),\s*([^/]+)\/([^,]+),\s*(.+)\)/);

                    // Pattern 2: List Variable (New)
                    // e.g. 双向关系变更(友情, 变量.训练组, 随机(5~10))
                    const matchList = fullCmd.match(/双向关系变更\(([^,]+),\s*(变量\.[^,]+),\s*(.+)\)/);

                    if (matchList) {
                        const type = matchList[1].trim() as '友情' | '爱情';
                        const listKey = matchList[2].trim().replace('变量.', '');
                        const valStr = matchList[3].trim();

                        if (Array.isArray(variables[listKey])) {
                            const chars = refreshList(variables[listKey], allChars) as RuntimeCharacter[];
                            // Update variable to fresh list to be safe
                            variables[listKey] = chars;

                            // Apply mutually to all pairs in the list
                            for (let i = 0; i < chars.length; i++) {
                                for (let j = i + 1; j < chars.length; j++) {
                                    const c1 = chars[i];
                                    const c2 = chars[j];
                                    // Re-evaluate val for each pair so "随机(5~15)" generates different numbers
                                    const val = evalValue(valStr, variables, subject, allChars);

                                    const val12 = applyRelationshipModifiers(val, c2, type);
                                    if (!c1.关系列表[c2.instanceId]) c1.关系列表[c2.instanceId] = { 友情: 0, 爱情: 0 };
                                    c1.关系列表[c2.instanceId][type] = Math.min(100, Math.max(0, c1.关系列表[c2.instanceId][type] + val12));

                                    const val21 = applyRelationshipModifiers(val, c1, type);
                                    if (!c2.关系列表[c1.instanceId]) c2.关系列表[c1.instanceId] = { 友情: 0, 爱情: 0 };
                                    c2.关系列表[c1.instanceId][type] = Math.min(100, Math.max(0, c2.关系列表[c1.instanceId][type] + val21));
                                }
                            }
                        }
                    } else if (matchPair) {
                        const type = matchPair[1].trim() as '友情' | '爱情';
                        const charAKey = matchPair[2].trim();
                        const charBKey = matchPair[3].trim();
                        const val = evalValue(matchPair[4].trim(), variables, subject, allChars); // Updated
                        const charA = resolveTargetCharacter(charAKey, subject, allChars, variables);
                        const charB = resolveTargetCharacter(charBKey, subject, allChars, variables);
                        if (charA && charB) {
                            const valAB = applyRelationshipModifiers(val, charB, type);
                            if (!charA.关系列表[charB.instanceId]) charA.关系列表[charB.instanceId] = { 友情: 0, 爱情: 0 };
                            charA.关系列表[charB.instanceId][type] = Math.min(100, Math.max(0, charA.关系列表[charB.instanceId][type] + valAB));
                            const valBA = applyRelationshipModifiers(val, charA, type);
                            if (!charB.关系列表[charA.instanceId]) charB.关系列表[charA.instanceId] = { 友情: 0, 爱情: 0 };
                            charB.关系列表[charA.instanceId][type] = Math.min(100, Math.max(0, charB.关系列表[charA.instanceId][type] + valBA));
                        }
                    }
                    break;
                }
            case '获得标签': {
                const tagId = actionParts[1];
                const layers = actionParts[2] ? parseInt(actionParts[2]) : 1;
                const existing = target.标签组.find(t => t.templateId === tagId);
                if (existing) { existing.层数 = layers; }
                else { target.标签组.push({ templateId: tagId, 层数: layers, 添加日期: turn }); }
                break;
            }
            case '标签变更': {
                const tagId = actionParts[1];
                const changeVal = actionParts[2] ? parseInt(actionParts[2]) : 0;

                if (changeVal === 0) break;

                const existingIndex = target.标签组.findIndex(t => t.templateId === tagId);
                if (existingIndex !== -1) {
                    target.标签组[existingIndex].层数 += changeVal;
                    // If layers drop below 1, remove tag
                    if (target.标签组[existingIndex].层数 < 1) {
                        target.标签组.splice(existingIndex, 1);
                    }
                } else if (changeVal > 0) {
                    // Only add if positive change
                    target.标签组.push({ templateId: tagId, 层数: changeVal, 添加日期: turn });
                }
                break;
            }
            case '移除标签': {
                const tagId = actionParts[1];
                target.标签组 = target.标签组.filter(t => t.templateId !== tagId);
                break;
            }
            case '设置变量': {
                const fullCmd = actionParts.join(' ');
                const assignMatch = fullCmd.match(/设置变量\s+(?:(角色|列表|数字)\s+)?([^=]+)=\s*(.+)/);
                if (assignMatch) {
                    const key = assignMatch[2].trim();
                    const expr = assignMatch[3].trim();
                    if (expr.startsWith('获取随机队友()')) {
                        // User requested: do NOT exclude p1, only exclude self.
                        const teammates = allChars.filter(c => c.inTeam && c.instanceId !== subject.instanceId);
                        if (teammates.length > 0) variables[key] = teammates[Math.floor(Math.random() * teammates.length)];
                    } else if (expr.startsWith('获取随机全员角色()')) {
                        // Exclude 'p1', but we should also probably exclude self if it implies social interaction, 
                        // though some events might want true random. 
                        // For now, keeping as is unless specified, but usually safe to exclude self for target selection.
                        const candidates = allChars.filter(c => c.instanceId !== 'p1' && c.instanceId !== subject.instanceId);
                        variables[key] = candidates[Math.floor(Math.random() * candidates.length)];
                    } else if (expr.startsWith('获取角色(非队友)')) {
                        variables[key] = allChars.filter(c => !c.inTeam && c.instanceId !== 'p1');
                    } else if (expr.startsWith('获取角色(全员)')) {
                        variables[key] = [...allChars];
                    } else if (expr.startsWith('列表随机取值')) {
                        const listMatch = expr.match(/列表随机取值\(([^)]+)\)/);
                        if (listMatch) {
                            const listKey = listMatch[1].trim();
                            // Refresh list before picking to ensure the picked object is fresh
                            const list = refreshList(variables[listKey], allChars);
                            if (Array.isArray(list) && list.length > 0) variables[key] = list[Math.floor(Math.random() * list.length)];
                        }
                    } else if (expr.startsWith('列表首位')) {
                        const listMatch = expr.match(/列表首位\(([^)]+)\)/);
                        if (listMatch) {
                            const listKey = listMatch[1].trim();
                            // Refresh list before picking
                            const list = refreshList(variables[listKey], allChars);
                            if (Array.isArray(list) && list.length > 0) variables[key] = list[0];
                        }
                    } else if (expr.startsWith('随机')) {
                        // Support relative evalValue using subject
                        variables[key] = evalValue(expr, variables, subject, allChars);
                    } else if (expr === '队伍人数') {
                        variables[key] = allChars.filter(c => c.inTeam).length;
                    } else {
                        // Try to resolve as a character reference first (e.g. 当前角色)
                        const resolved = resolveTargetCharacter(expr, subject, allChars, variables);
                        if (resolved) {
                            variables[key] = resolved;
                        } else {
                            variables[key] = expr;
                        }
                    }
                }
                break;
            }
            case '变量计算': {
                const key = actionParts[1];
                const opSym = actionParts[2];
                const val = evalValue(actionParts[3], variables, subject, allChars);
                if (variables[key] !== undefined && typeof variables[key] === 'number') {
                    if (opSym === '+') variables[key] += val;
                    if (opSym === '-') variables[key] -= val;
                    if (opSym === '*') variables[key] *= val;
                    if (opSym === '/') variables[key] = Math.floor(variables[key] / (val || 1));
                }
                break;
            }
            case '跳转': {
                result.nextEventId = actionParts[1];
                result.isWait = false;
                break;
            }
            case '继续': {
                result.nextEventId = actionParts[1];
                result.isWait = true;
                break;
            }
            case '概率跳转': {
                const chance = parseInt(actionParts[1]);
                const nextId = actionParts[2];
                if (Math.random() * 100 < chance) {
                    result.nextEventId = nextId;
                    result.isWait = false;
                }
                break;
            }
            case '列表筛选': {
                const fullCmd = actionParts.join(' ');
                const match = fullCmd.match(/列表筛选\(([^,]+),\s*(.+)\)/);
                if (match) {
                    const listKey = match[1].trim();
                    const cond = match[2].trim();

                    if (Array.isArray(variables[listKey])) {
                        const freshList = refreshList(variables[listKey], allChars);
                        variables[listKey] = (freshList as RuntimeCharacter[]).filter(c =>
                            checkCondition(cond, c, turn, undefined, allChars, variables)
                        );
                    }
                }
                break;
            }
            case '列表排除': {
                const fullCmd = actionParts.join(' ');
                const match = fullCmd.match(/列表排除\(([^,]+),\s*(.+)\)/);
                if (match) {
                    const listKey = match[1].trim();
                    const targetVar = match[2].trim();
                    const targetC = resolveTargetCharacter(targetVar, subject, allChars, variables);

                    if (Array.isArray(variables[listKey]) && targetC) {
                        const freshList = refreshList(variables[listKey], allChars);
                        variables[listKey] = (freshList as RuntimeCharacter[]).filter(c => c.instanceId !== targetC.instanceId);
                    }
                }
                break;
            }
            case '列表截取': {
                // Updated Logic: Use regex to safely extract arguments, avoiding space-split issues
                const fullCmd = actionParts.join(' ');
                const match = fullCmd.match(/列表截取\(([^,]+),\s*(\d+)\)/);
                if (match) {
                    const listKey = match[1].trim();
                    const count = parseInt(match[2]);
                    if (Array.isArray(variables[listKey])) {
                        // No need to refresh for slicing, but safer to do so
                        const freshList = refreshList(variables[listKey], allChars);
                        variables[listKey] = freshList.slice(0, count);
                    }
                }
                break;
            }
            case '列表添加': {
                const fullCmd = actionParts.join(' ');
                const match = fullCmd.match(/列表添加\(([^,]+),\s*(.+)\)/);
                if (match) {
                    const listKey = match[1].trim();
                    const targetVar = match[2].trim();
                    const targetC = resolveTargetCharacter(targetVar, subject, allChars, variables);
                    if (Array.isArray(variables[listKey]) && targetC) {
                        // Ensure list contains fresh objects before pushing
                        variables[listKey] = refreshList(variables[listKey], allChars);
                        variables[listKey].push(targetC);
                    }
                }
                break;
            }
            case '列表排序': {
                const fullCmd = actionParts.join(' ');
                // e.g. 列表排序(粉丝, 关系.当前角色.爱情, desc)
                const match = fullCmd.match(/列表排序\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
                if (match) {
                    const listKey = match[1].trim();
                    const propPath = match[2].trim();
                    const order = match[3].trim().toLowerCase(); // 'asc' or 'desc'

                    if (Array.isArray(variables[listKey])) {
                        const freshList = refreshList(variables[listKey], allChars) as RuntimeCharacter[];

                        variables[listKey] = freshList.sort((a, b) => {
                            // Extract values for a and b using propPath logic manually
                            const getVal = (c: RuntimeCharacter) => {
                                // Support "关系.X.Y" where X can be '当前角色'
                                if (propPath.startsWith('关系.')) {
                                    const relParts = propPath.split('.');
                                    const targetKey = relParts[1]; // e.g. '当前角色' or 'p1'
                                    const type = relParts[2] as '友情' | '爱情';

                                    const targetC = resolveTargetCharacter(targetKey, subject, allChars, variables);
                                    if (targetC) {
                                        const rel = c.关系列表[targetC.instanceId] || { 友情: 0, 爱情: 0 };
                                        return rel[type];
                                    }
                                    return 0;
                                }
                                // Support "属性.X"
                                if (propPath.startsWith('属性.')) {
                                    const attr = propPath.split('.')[1];
                                    // @ts-ignore
                                    return c.通用属性[attr] ?? c.竞赛属性[attr] ?? 0;
                                }
                                return 0;
                            };

                            const valA = getVal(a);
                            const valB = getVal(b);

                            return order === 'desc' ? valB - valA : valA - valB;
                        });
                    }
                }
                break;
            }
            case '列表执行': {
                const fullCmd = actionParts.join(' ');
                const match = fullCmd.match(/列表执行\(([^,]+),\s*(.+)\)/);
                if (match) {
                    const listKey = match[1].trim();
                    const innerCmd = match[2].trim();

                    if (Array.isArray(variables[listKey])) {
                        const freshList = refreshList(variables[listKey], allChars);
                        // Update variable to fresh list
                        variables[listKey] = freshList;

                        freshList.forEach(c => {
                            executeAction(innerCmd, c, turn, allChars, variables, isSilent);
                        });
                    }
                }
                break;
            }
            case '让角色入队': {
                const fullCmd = actionParts.join(' ');
                const match = fullCmd.match(/让角色入队\((.+)\)/);
                if (match) {
                    const targetVar = match[1].trim();
                    const targetC = resolveTargetCharacter(targetVar, subject, allChars, variables);
                    if (targetC) {
                        targetC.inTeam = true;
                        // Set join turn for sorting
                        targetC.recruitedAt = turn;
                    }
                }
                break;
            }
            case '交合': {
                const fullCmd = actionParts.join(' ');
                const match = fullCmd.match(/交合\(([^,]+),\s*(.+)\)/);
                if (match) {
                    const charAKey = match[1].trim();
                    const charBKey = match[2].trim();
                    const charA = resolveTargetCharacter(charAKey, subject, allChars, variables);
                    const charB = resolveTargetCharacter(charBKey, subject, allChars, variables);

                    if (charA && charB) {
                        // Pregnancy Logic
                        if (charA.性别 !== charB.性别) {
                            const female = charA.性别 === '女' ? charA : charB;
                            const tagId = '怀孕';
                            const existing = female.标签组.find(t => t.templateId === tagId);

                            // Only impart pregnancy if NOT already pregnant
                            if (!existing) {
                                // 10% chance
                                if (Math.random() < 0.1) {
                                    female.标签组.push({ templateId: tagId, 层数: 20, 添加日期: turn });
                                }
                            }
                        }
                    }
                }
                break;
            }
            case '打印': {
                const fullCmd = cmd; // Use normalized cmd
                // Support both 打印(X) and 打印 X
                const match = fullCmd.match(/打印(?:\((.+)\)|\s+(.+))/);
                if (match) {
                    const expr = (match[1] || match[2]).trim().replace(/['"]/g, '');
                    let output = '';

                    // Try to resolve as a variable
                    if (expr.startsWith('变量.')) {
                        const varName = expr.substring(3);
                        const val = variables[varName];
                        output = `[变量] ${varName} = ${val !== undefined ? (typeof val === 'object' ? val.名称 : val) : '未定义'}`;
                    }
                    // Try to resolve as a character property
                    else if (expr.includes('.')) {
                        const parts = expr.split('.');
                        // Handle 关系.角色.类型 syntax (e.g., 关系.特别周.爱情)
                        if (parts[0] === '关系' && parts.length === 3) {
                            const targetName = parts[1];
                            const relType = parts[2] as '友情' | '爱情';
                            const relTarget = resolveTargetCharacter(targetName, subject, allChars, variables);

                            if (relTarget) {
                                const rel = subject.关系列表[relTarget.instanceId]?.[relType] || 0;
                                output = `[关系] ${subject.名称} -> ${relTarget.名称} (${relType}) = ${rel}`;
                            } else {
                                output = `[错误] 未找到关系目标: ${targetName}`;
                            }
                        } else {
                            const targetName = parts[0];
                            const target = resolveTargetCharacter(targetName, subject, allChars, variables);

                            if (target) {
                                if (parts[1] === '属性' && parts[2]) {
                                    const attrName = parts[2] as keyof typeof target.通用属性 | keyof typeof target.竞赛属性;
                                    const val = target.通用属性[attrName as keyof typeof target.通用属性] ?? target.竞赛属性[attrName as keyof typeof target.竞赛属性];
                                    output = `[属性] ${target.名称}.${parts[2]} = ${val}`;
                                } else if (parts[1] === '关系' && parts[2] && parts[3]) {
                                    const relTargetName = parts[2];
                                    const relType = parts[3] as '友情' | '爱情';
                                    const relTarget = resolveTargetCharacter(relTargetName, subject, allChars, variables);
                                    if (relTarget) {
                                        const rel = target.关系列表[relTarget.instanceId]?.[relType] || 0;
                                        output = `[关系] ${target.名称} -> ${relTarget.名称} (${relType}) = ${rel}`;
                                    } else {
                                        output = `[错误] 未找到关系目标: ${relTargetName}`;
                                    }
                                } else if (parts[1] === '标签组' && parts[2]) {
                                    const tagId = parts[2].replace(/[()]/g, '');
                                    const tag = target.标签组.find(t => t.templateId === tagId);
                                    if (parts[3] === '层数') {
                                        output = `[标签] ${target.名称}.${tagId}(层数) = ${tag ? tag.层数 : 0}`;
                                    } else {
                                        output = `[标签] ${target.名称}.${tagId} = ${tag ? '存在' : '不存在'}`;
                                    }
                                } else {
                                    const val = target[parts[1] as keyof typeof target];
                                    output = `[字段] ${target.名称}.${parts[1]} = ${val}`;
                                }
                            } else {
                                output = `[错误] 未找到目标角色: ${targetName}`;
                            }
                        }
                    } else {
                        // Just print the raw string if it's not a recognizable expression
                        output = `[输出] ${expr}`;
                    }

                    if (output) {
                        result.printOutputs.push(output);
                        if (!isSilent) console.log(`[DSL 打印] ${output}`);
                    }
                }
                break;
            }
        }
    });

    return result;
};
