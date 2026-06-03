import { GameEvent, RuntimeCharacter, LogEntry } from '../types';
import { EVENTS } from '../constants';
import { LLMConfig } from '../components/LLMConfigPanel';

export const generateLLMEvent = async (
    config: LLMConfig,
    character: RuntimeCharacter,
    logs: LogEntry[],
    optionCounts?: Record<number, number>,
    isEnding?: boolean
): Promise<GameEvent[] | null> => {
    
    let requestedOptionCount = -1;
    const targetWeights: Record<number, number> = { 0: 500, 1: 50, 2: 200, 3: 300, 4: 50 };
    const actualCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    if (optionCounts) {
        for (const k in targetWeights) {
            actualCounts[k] = optionCounts[k as any] || 0;
        }
    }
    
    let totalScore = 0;
    const scores: Record<number, number> = {};
    for (let i = 0; i <= 4; i++) {
        const score = targetWeights[i] / (actualCounts[i] + 1);
        scores[i] = score;
        totalScore += score;
    }
    
    let rand = Math.random() * totalScore;
    for (let i = 0; i <= 4; i++) {
        rand -= scores[i];
        if (rand <= 0) {
            requestedOptionCount = i;
            break;
        }
    }
    
    // Get historical events for this character
    const charLogs = logs.filter(l => l.characterName === character.名称).slice(-20); // Last 20 logs for context
    
    // Prepare prompt
    const systemPromptExtra = isEnding 
        ? `\n\n【关键要求：生成结局】\n当前游戏已到达最终回合（第三年结束）。请你为玩家（训练员）与马娘们生成一个合适的“结局”事件。\n这应该是一个阶段性的总结或未来的展望。务必在事件的“标签组”中包含“结局”标签。`
        : '';
        
    const systemPrompt = `你是一个专业的游戏文案和数值策划，正在为一款《赛马娘》风格的文字模拟养成游戏生成动态事件。
你需要根据角色的当前状态、标签属性以及最近发生的事件历史，创作极具沉浸感、符合逻辑与人物性格的事件。${systemPromptExtra}

核心创作指南：
1. 【单次事件长度限制】：每个事件的“正文”内容必须简短精炼，严格控制在150字以内。
2. 【沉浸式角色扮演描绘】：事件的描写需要具备轻小说或Galgame的画面感与情绪张力。深入微表情、动作细节和语言特征。
3. 【上下文剧情连贯】：新生成的事件必须与历史记录在剧情逻辑上保持因果连贯，如果是日常则需要符合当前的氛围。
4. 【精确的输出限制】：你必须且只能输出一段解析无误的纯 JSON 格式代码。支持输出单个事件对象，或包含多个事件对象的数组（如果你需要设计链式事件）。严禁包含任何 Markdown 格式（如\`\`\`json）、严禁包含思考过程、严禁输出非 JSON 的多余文字。

* 在文案中，必须使用 {当前角色.名称} 指代当前事件的主角，使用 {训练员.称呼} 指代玩家（即训练员）。

请严格按照以下 JSON Schema 输出单个事件对象（如果你需要生成链式事件，请输出一个包含该对象的 JSON 数组）：
{
  "id": "随机英文字符串（必须唯一）",
  "权重": 100, // 通常为100
  "可触发次数": 1, 
  "标签组": ["字串"], // 例如 ["日常", "特殊"]
  "标题": "事件标题（简体中文）",
  "正文": "事件内容描述，要求文笔生动细腻、代入感强，且控制在150字以内（简体中文）",
  "预操作指令": "可选生效指令集合的字符串",
  "操作指令": "可选生效指令集合的字符串",
  "选项组": [
     { "显示文本": "玩家选择按钮上的文字", "操作指令": "具体的指令集" }
  ]
}

支持的预操作/操作指令语法（如有多个指令请使用回车换行分隔）：
- 属性变更 属性名 数值 (例如: 属性变更 体力 -10)
- 关系变更(类型, 目标A, 目标B, 数值)
- 添加标签 标签ID
- 移除标签 标签ID
- 跳转 事件ID (立刻执行跳转，将其他事件链式连起来)
- 继续 事件ID (等待玩家点击继续后跳转)

这里提供一个**带有分支跳转指令的多选项事件范例**供你参考如何在选项中链式触发或分支：
{
  "id": "llm_sample_branching_01",
  "权重": 100,
  "可触发次数": 1,
  "标签组": ["日常"],
  "标题": "抉择时刻",
  "正文": "{当前角色.名称}站在分叉路口，不知道该往左边还是右边走...",
  "预操作指令": "",
  "操作指令": "",
  "选项组": [
    { "显示文本": "往左走", "操作指令": "属性变更 体力 -5\\n继续 llm_sample_left_path" },
    { "显示文本": "往右走", "操作指令": "跳转 llm_sample_right_path" }
  ]
}

作为风格与结构参考，这里有一些已有事件：
${JSON.stringify([...EVENTS].sort(() => 0.5 - Math.random()).slice(0, 5), null, 2)}
`;

    const isTrainer = character.标签组.some(t => t.templateId === '训练员');
    const isUma = character.标签组.some(t => t.templateId === '马娘');
    const charRole = isTrainer ? '训练员 (玩家自身)' : (isUma ? '马娘 (训练员培养或关注的赛马娘)' : 'NPC');

    const userPrompt = `需要为当前角色生成一个新的${isEnding ? '结局' : '突发'}事件：
【角色名称】：${character.名称}
【角色定位】：${charRole}
${character.背景档案 ? `【角色背景设定】：${character.背景档案}\n` : ''}【当前核心属性】：体力 ${character.通用属性?.体力 || 0}, 心情 ${character.通用属性?.心情 || 0}, 魅力 ${character.通用属性?.魅力 || 0}
【拥有标定特征】：${character.标签组.map(t => t.templateId).join('、')}

【该角色近期经历的历史记录】：
${charLogs.length > 0 ? charLogs.map(l => `第 ${l.turn} 回合: ${l.text}`).join('\n') : '该角色近期暂无特别的行动记录，可自由发挥一段初始日常或邂逅。'}

【额外要求】：本事件必须包含恰好 ${requestedOptionCount} 个选项（选项组数组长度必须为 ${requestedOptionCount}）。${isEnding ? '作为结局，选项可能会影响最终结局走向，或者仅有1个确认选项。' : '如果是0个选项，则选项组应设置为空数组[]。如果是1个选项，通常表示只有唯一推进路径。如果是多个选项，请设计多样化的分支选择或包含“继续”、“跳转”指令的链式事件。'}

请结合以上所有信息，创作一段剧情连贯、极具沉浸感的高质量${isEnding ? '结局' : ''}事件。所有文本(标题, 正文, 选项显示)必须使用简体中文，且正文严格控制在150字以内。
注意：请直接并且仅输出 JSON，绝对不要输出任何其他思考或解释文本。`;

    let fetchUrl = config.url.trim().replace(/\/$/, '');
    if (fetchUrl === 'https://api.deepseek.com') {
        fetchUrl = 'https://api.deepseek.com/chat/completions';
    } else if (fetchUrl.endsWith('/v1')) {
        fetchUrl += '/chat/completions';
    }

    try {
        const res = await fetch(fetchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`
            },
            body: JSON.stringify({
                model: config.model || 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7
            })
        });

        if (!res.ok) {
            console.error('LLM API Error:', await res.text());
            return null;
        }

        const data = await res.json();
        let content = data.choices[0].message.content.trim();
        
        // Remove <think> blocks if present
        content = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();

        // Strip markdown backticks if the model ignores the instruction
        if (content.startsWith('```json')) {
            content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (content.startsWith('```')) {
            content = content.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }

        content = content.trim();

        // Support array of events or single event
        let parsedData: any;
        if (content.startsWith('[')) {
            const arrMatch = content.match(/\[[\s\S]*\]/);
            if (arrMatch) {
               content = arrMatch[0];
            }
            parsedData = JSON.parse(content);
        } else {
            if (!content.startsWith('{')) {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    content = jsonMatch[0];
                }
            }
            parsedData = JSON.parse(content);
        }
        
        let events: GameEvent[] = [];
        if (Array.isArray(parsedData)) {
            events = parsedData;
        } else {
            events = [parsedData];
        }

        events.forEach((parsedEvent, idx) => {
            if (!parsedEvent.id) {
                parsedEvent.id = 'llm_gen_' + Date.now() + '_' + idx;
            }
        });
        
        return events.length > 0 ? events : null;
    } catch (e) {
        console.error('Failed to generate LLM event:', e);
        return null;
    }
};

export const regenerateLLMOptions = async (
    config: LLMConfig,
    character: RuntimeCharacter,
    existingEvent: GameEvent
): Promise<GameEvent['选项组']> => {
    const systemPrompt = `你是一个专业的游戏文案和数值策划。请基于下面已经写好的事件文本，重新生成一组新的事件选项。
你必须且只能输出一段解析无误的纯 JSON 格式代码。严禁包含任何 Markdown 格式（如\`\`\`json）、严禁包含思考过程。

请严格按照以下 JSON Schema 输出：
{
  "选项组": [
     { "显示文本": "玩家选择按钮上的文字", "操作指令": "具体的指令集" }
  ]
}

支持的操作指令语法（如有多个指令请使用回车换行分隔）：
- 属性变更 属性名 数值 (例如: 属性变更 体力 -10)
- 关系变更(类型, 目标A, 目标B, 数值)
- 添加标签 标签ID
- 移除标签 标签ID
`;

    const userPrompt = `为以下事件重新生成 2 到 3 个选项：
【角色名称】：${character.名称}
${character.背景档案 ? `【角色背景设定】：${character.背景档案}\n` : ''}【事件标题】：${existingEvent.标题}
【事件正文】：${existingEvent.正文}

注意：请直接并且仅输出 JSON，包含一个 "选项组" 数组，绝对不要输出任何其他思考或解释文本。`;

    let fetchUrl = config.url.trim().replace(/\/$/, '');
    if (fetchUrl === 'https://api.deepseek.com') {
        fetchUrl = 'https://api.deepseek.com/chat/completions';
    } else if (fetchUrl.endsWith('/v1')) {
        fetchUrl += '/chat/completions';
    }

    try {
        const res = await fetch(fetchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`
            },
            body: JSON.stringify({
                model: config.model || 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7
            })
        });

        if (!res.ok) {
            console.error('LLM API Error:', await res.text());
            return [];
        }

        const data = await res.json();
        let content = data.choices[0].message.content.trim();
        content = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();

        if (content.startsWith('\`\`\`json')) {
            content = content.replace(/^\`\`\`json\n?/, '').replace(/\n?\`\`\`$/, '');
        } else if (content.startsWith('\`\`\`')) {
            content = content.replace(/^\`\`\`\n?/, '').replace(/\n?\`\`\`$/, '');
        }
        content = content.trim();

        if (!content.startsWith('{')) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                content = jsonMatch[0];
            }
        }
        
        const parsed = JSON.parse(content);
        return parsed.选项组 || [];
    } catch (e) {
        console.error('Failed to regenerate options:', e);
        return [];
    }
};
