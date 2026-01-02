
import { RuntimeCharacter } from '../../types';
import { checkCondition } from './condition';
import { resolveTargetCharacter } from './character';

// Helper to split "Cond ? True : False" respecting nested braces and quotes
const splitTernary = (content: string) => {
    let qIdx = -1;
    let cIdx = -1;
    let depth = 0;
    let inQuote = false;
    let quoteChar = '';
    
    for (let k = 0; k < content.length; k++) {
        const char = content[k];
        
        if (inQuote) {
            if (char === quoteChar && content[k-1] !== '\\') {
                inQuote = false;
            }
        } else {
            if (char === '"' || char === "'") {
                inQuote = true;
                quoteChar = char;
            } else if (char === '{') {
                depth++;
            } else if (char === '}') {
                depth--;
            } else if (depth === 0) {
                if (char === '?' && qIdx === -1) {
                    qIdx = k;
                } else if (char === ':' && qIdx !== -1) {
                    // Find the first colon at depth 0 after the question mark.
                    // This assumes standard precedence (A ? B : C).
                    if (cIdx === -1) cIdx = k;
                }
            }
        }
    }
    
    if (qIdx !== -1 && cIdx !== -1) {
        return {
            cond: content.substring(0, qIdx),
            tVal: content.substring(qIdx + 1, cIdx),
            fVal: content.substring(cIdx + 1)
        };
    }
    return null;
};

// Helper to split function arguments by comma, respecting quotes
const splitArgs = (str: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (inQuote) {
            if (char === quoteChar && str[i-1] !== '\\') {
                inQuote = false;
            }
            current += char;
        } else {
            if (char === '"' || char === "'") {
                inQuote = true;
                quoteChar = char;
                current += char;
            } else if (char === ',') {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
    }
    if (current) result.push(current.trim());
    return result;
};

// Helper to clean quotes from result strings
const cleanResult = (s: string) => s.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');

export const parseText = (text: string, char: RuntimeCharacter, turn: number, allChars: RuntimeCharacter[], variables?: Record<string, any>): string => {
    if (!text) return '';
    
    let result = '';
    let i = 0;
    
    while (i < text.length) {
        if (text[i] === '{') {
            // Found start of a block. scan for balanced closing '}'
            let depth = 1;
            let j = i + 1;
            
            while (j < text.length && depth > 0) {
                if (text[j] === '{') depth++;
                else if (text[j] === '}') depth--;
                j++;
            }
            
            if (depth === 0) {
                // We have a balanced block from i to j-1
                // Content excludes outer braces
                const blockContent = text.substring(i + 1, j - 1);
                
                // 1. Try Ternary Parse
                const ternaryParts = splitTernary(blockContent);
                if (ternaryParts) {
                    const { cond, tVal, fVal } = ternaryParts;
                    const isTrue = checkCondition(cond.trim(), char, turn, undefined, allChars, variables);
                    // Recursively parse the result part (it might contain variables)
                    const rawResult = isTrue ? cleanResult(tVal) : cleanResult(fVal);
                    // We need to parse the RESULT again because it might contain {Variable}
                    result += parseText(rawResult, char, turn, allChars, variables);
                    i = j;
                    continue;
                }
                
                // 2. Try Random Text: 随机文字(...)
                if (blockContent.startsWith('随机文字(') && blockContent.endsWith(')')) {
                    const args = blockContent.substring(5, blockContent.length - 1);
                    const options = splitArgs(args).map(s => cleanResult(s));
                    if (options.length > 0) {
                        const rawResult = options[Math.floor(Math.random() * options.length)];
                        // Recursively parse the selected text to resolve inner variables
                        result += parseText(rawResult, char, turn, allChars, variables);
                    }
                    i = j;
                    continue;
                }

                // 3. Variable Substitution
                // Handle complex lookups like 变量.X or 角色.属性
                const path = blockContent.trim();
                let replacement = '';
                
                if (path.startsWith('变量.')) {
                    const varKey = path.replace('变量.', '');
                    if (variables && variables[varKey] !== undefined) {
                        if (typeof variables[varKey] === 'object' && variables[varKey].名称) replacement = variables[varKey].名称;
                        else replacement = String(variables[varKey]);
                    }
                } else {
                    let subject = char;
                    let prop = path;
                    
                    if (path.includes('.')) {
                        const parts = path.split('.');
                        const targetKey = parts[0];
                        const resolved = resolveTargetCharacter(targetKey, char, allChars, variables);
                        if (resolved) {
                            subject = resolved;
                            prop = parts.slice(1).join('.');
                        } else if (targetKey === '当前角色') {
                            prop = parts.slice(1).join('.');
                        }
                    }

                    if (prop === '名称') replacement = subject.名称;
                    else if (prop === '称呼') {
                        if (subject.称呼列表) {
                            for (const rule of subject.称呼列表) {
                                if (!rule.判别式 || checkCondition(rule.判别式, subject, turn, undefined, allChars, variables)) {
                                    replacement = rule.称呼;
                                    break; 
                                }
                            }
                        }
                        if (!replacement) replacement = '训练员';
                    }
                    else if (prop === '性别') replacement = subject.性别;
                    // Fallback: if we couldn't resolve, keep the original text or empty?
                    // If it was meant to be text like {Unknown}, let's return empty to hide implementation details
                }
                
                result += replacement;
                i = j;
                continue;
            }
        }
        
        // Plain text character
        result += text[i];
        i++;
    }

    return result;
};
