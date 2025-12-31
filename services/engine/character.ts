
import { CharacterTemplate, RuntimeCharacter, RuntimeTag, TagTemplate } from '../../types';
import { CHARACTERS, TAGS } from '../../constants';

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
    适性: template.适性 ? { ...template.适性 } : undefined,
    标签组: tags,
    已触发事件: {},
    关系列表: {},
    称呼列表: template.称呼列表,
    inTeam: inTeam
  };

  const hasTag = (id: string) => char.标签组.some(t => t.templateId === id);

  if (hasTag('贫穷')) char.通用属性.财富 = Math.max(0, char.通用属性.财富 - 5);
  if (hasTag('富豪')) char.通用属性.财富 += 5;
  if (hasTag('魅力十足')) char.通用属性.魅力 += 5;
  if (hasTag('路人脸')) char.通用属性.魅力 = Math.max(0, char.通用属性.魅力 - 5);

  return char;
};

export const getAvailableStartTags = (): TagTemplate[] => {
    return Object.values(TAGS).filter(t => t.人类可用 && t.开局可选);
};

export const resolveTargetCharacter = (key: string, current: RuntimeCharacter, allChars: RuntimeCharacter[], variables?: Record<string, any>): RuntimeCharacter | undefined => {
    if (key === '当前角色') return current;
    if (key === '训练员') return allChars.find(c => c.templateId === '训练员' || c.instanceId === 'p1');
    if (key === '玩家') return allChars.find(c => c.instanceId === 'p1');
    
    // Priority 1: Check by template ID or Name (for static references)
    const byTemplate = allChars.find(c => c.templateId === key || c.名称 === key);
    if (byTemplate) return byTemplate;

    // Priority 2: Variable lookup
    if (variables && variables[key]) {
        const val = variables[key];

        // Handle ID strings directly (e.g., 'c1', 'p1')
        if (typeof val === 'string') {
             if (val.startsWith('c') || val.startsWith('p') || val.startsWith('npc')) {
                 const found = allChars.find(c => c.instanceId === val);
                 if (found) return found;
             }
             // Fix: Also check for Name or TemplateId matches in variables
             const foundByName = allChars.find(c => c.名称 === val || c.templateId === val);
             if (foundByName) return foundByName;
        }

        // Handle Character Objects (e.g. from '设置变量 ... = 获取随机角色')
        // CRITICAL: Must use instanceId from the variable to find the LIVE object in `allChars`.
        // The object in `variables` might be from a stale state snapshot.
        if (typeof val === 'object' && val.instanceId) {
            return allChars.find(c => c.instanceId === val.instanceId);
        }
    }

    // Priority 3: Fallback - treat key as instanceId
    return allChars.find(c => c.instanceId === key);
};
