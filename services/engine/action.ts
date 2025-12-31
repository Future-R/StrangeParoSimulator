
import { RuntimeCharacter } from '../../types';
import { checkCondition } from './condition';
import { resolveTargetCharacter } from './character';
import { evalValue, applyRelationshipModifiers } from './utils';

export const executeAction = (
    commandStr: string, 
    subject: RuntimeCharacter, 
    turn: number, 
    allChars: RuntimeCharacter[], 
    variables: Record<string, any>, 
    isSilent: boolean = false,
    eventTags: string[] = []
): { newVariables?: Record<string, any>, nextEventId?: string } => {
    if (!commandStr) return {};
    
    const commands = commandStr.split(';').map(s => s.trim()).filter(s => s);
    const result: { newVariables?: Record<string, any>, nextEventId?: string } = { newVariables: {} };

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
                const attr = actionParts[1] as any;
                const valStr = actionParts[2];
                const val = evalValue(valStr, variables); // Updated: Pass variables
                
                if (target.通用属性[attr as keyof typeof target.通用属性] !== undefined) {
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
                    const targetKey = funcMatch[2].trim(); 
                    const sourceKey = funcMatch[3].trim(); 
                    const val = evalValue(funcMatch[4].trim(), variables); // Updated
                    const targetChar = resolveTargetCharacter(targetKey, subject, allChars, variables);
                    const sourceChar = resolveTargetCharacter(sourceKey, subject, allChars, variables);
                    if (targetChar && sourceChar) {
                        const finalVal = applyRelationshipModifiers(val, targetChar, type);
                        if (!sourceChar.关系列表[targetChar.instanceId]) sourceChar.关系列表[targetChar.instanceId] = { 友情: 0, 爱情: 0 };
                        const rel = sourceChar.关系列表[targetChar.instanceId];
                        rel[type] = Math.min(100, Math.max(0, rel[type] + finalVal));
                    }
                } else {
                    const type = actionParts[1] as '友情' | '爱情';
                    const val = evalValue(actionParts[2], variables); // Updated
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
                // Fixed regex: Use (.+) for the last argument to allow nested parentheses like 随机(5~15)
                const match = fullCmd.match(/双向关系变更\(([^,]+),\s*([^/]+)\/([^,]+),\s*(.+)\)/);
                if (match) {
                    const type = match[1].trim() as '友情' | '爱情';
                    const charAKey = match[2].trim();
                    const charBKey = match[3].trim();
                    const val = evalValue(match[4].trim(), variables); // Updated
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
                            const list = variables[listKey];
                            if (Array.isArray(list) && list.length > 0) variables[key] = list[Math.floor(Math.random() * list.length)];
                        }
                    } else if (expr.startsWith('随机')) {
                        variables[key] = evalValue(expr);
                    } else {
                        variables[key] = expr; 
                    }
                }
                break;
            }
            case '变量计算': {
                const key = actionParts[1];
                const opSym = actionParts[2];
                const val = evalValue(actionParts[3], variables); // Updated
                if (variables[key] !== undefined && typeof variables[key] === 'number') {
                    if (opSym === '+') variables[key] += val;
                    if (opSym === '-') variables[key] -= val;
                }
                break;
            }
            case '跳转': {
                result.nextEventId = actionParts[1];
                break;
            }
            case '概率跳转': {
                const chance = parseInt(actionParts[1]);
                const nextId = actionParts[2];
                if (Math.random() * 100 < chance) result.nextEventId = nextId;
                break;
            }
            case '列表筛选': {
                const fullCmd = actionParts.join(' ');
                const match = fullCmd.match(/列表筛选\(([^,]+),\s*(.+)\)/);
                if (match) {
                    const listKey = match[1].trim();
                    const cond = match[2].trim();
                    if (Array.isArray(variables[listKey])) {
                        variables[listKey] = (variables[listKey] as RuntimeCharacter[]).filter(c => 
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
                        variables[listKey] = (variables[listKey] as RuntimeCharacter[]).filter(c => c.instanceId !== targetC.instanceId);
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
                         variables[listKey] = variables[listKey].slice(0, count);
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
                     if (Array.isArray(variables[listKey]) && targetC) variables[listKey].push(targetC);
                 }
                 break;
            }
            case '列表执行': {
                const fullCmd = actionParts.join(' ');
                const match = fullCmd.match(/列表执行\(([^,]+),\s*(.+)\)/);
                if (match) {
                    const listKey = match[1].trim();
                    const innerCmd = match[2].trim();
                    const list = variables[listKey];
                    if (Array.isArray(list)) {
                        list.forEach(c => {
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
        }
    });

    return result;
};
