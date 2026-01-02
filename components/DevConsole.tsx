
import React, { useState } from 'react';

// DSL Documentation Data
const DSL_DOCS = [
    {
        category: "基础语法",
        items: [
            {
                title: "指令结构",
                content: "指令之间使用分号 `;` 分隔。\n例如：`属性变更 体力 -10; 属性变更 心情 5`"
            },
            {
                title: "目标指定",
                content: "默认操作对象为触发事件的角色（控制台默认为训练员）。\n指定对象语法：`对象名.指令`\n例如：`训练员.属性变更 财富 -1` 或 `摩耶重炮.获得标签 懒惰`\n指令若包含 `( )`，目标写在括号参数内，如 `关系变更(友情, 目标, ...)`"
            },
            {
                title: "条件后缀 (若)",
                content: "单条指令可以附加条件，仅当条件满足时执行。\n语法：`指令 若 条件`\n例如：`属性变更 心情 -5 若 属性.体力 < 10`"
            }
        ]
    },
    {
        category: "常用指令",
        items: [
            {
                title: "属性变更",
                content: "语法：`属性变更 [属性名] [数值]`\n属性名：体力, 精力, 心情, 爱欲, 速度, 耐力, 力量, 毅力, 智慧, 魅力, 财富, 学识, 体质\n特殊属性：`随机` (随机一项赛马属性), `全属性` (所有赛马属性)\n数值支持：`随机(10~20)`, `变量.X`\n例如：`属性变更 速度 10`, `属性变更 随机 随机(5~10)`"
            },
            {
                title: "关系变更",
                content: "注意：关系存储在发出情感的一方。\n单向(默认对玩家)：`关系变更 [类型] [数值]`\n指定：`关系变更([类型], [主动方], [被动方], [数值])`\n例如：`关系变更(友情, 摩耶重炮, 训练员, 50)` 表示【摩耶重炮】对【训练员】的友情+50。\n双向：`双向关系变更([类型], [角色A]/[角色B], [数值])`"
            },
            {
                title: "标签操作",
                content: "获得：`获得标签 [标签ID] [层数?]`\n变更：`标签变更 [标签ID] [增量]`\n移除：`移除标签 [标签ID]`"
            },
            {
                title: "流程控制",
                content: "跳转：`跳转 [事件ID]`\n继续：`继续 [事件ID]` (带暂停)\n概率跳转：`概率跳转 [概率0-100] [事件ID]`\n角色入队：`让角色入队([目标])`"
            },
            {
                title: "变量操作",
                content: "设置：`设置变量 [变量名] = [表达式]`\n计算：`变量计算 [变量名] [+/-] [数值]`\n表达式支持：\n- `获取随机队友()`\n- `获取随机全员角色()`\n- `获取角色(非队友)`\n- `列表随机取值(变量.列表)`\n- `随机(1~100)`"
            }
        ]
    },
    {
        category: "条件判别",
        items: [
            {
                title: "逻辑运算",
                content: "支持 `&&` (与), `||` (或), `()` (括号优先级)。"
            },
            {
                title: "属性比较",
                content: "语法：`[对象.]属性.[属性名] [比较符] [数值]`\n例如：`属性.体力 > 50`, `训练员.属性.财富 < 0`"
            },
            {
                title: "标签检查",
                content: "存在：`[对象.]标签组 存在 \"标签ID\"`\n不存在：`[对象.]标签组 不存在 \"标签ID\"`\n层数：`[对象.]标签组(标签ID).层数 [>=<] [数值]`\n例如：`训练员.标签组(肉体屈服).层数 >= 5`"
            },
            {
                title: "关系检查",
                content: "语法：`[源.]关系.[目标].友情/爱情 [比较符] [数值]`\n例如：`关系.玩家.爱情 > 50`, `关系.东海帝王.友情 >= 20`"
            }
        ]
    }
];

interface DevConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (command: string) => void;
}

export const DevConsole: React.FC<DevConsoleProps> = ({ isOpen, onClose, onExecute }) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [showDocs, setShowDocs] = useState(false);
  const [docSearch, setDocSearch] = useState('');

  if (!isOpen) return null;

  const handleRun = () => {
    if (!input.trim()) return;
    onExecute(input);
    setHistory(prev => [`> ${input}`, ...prev].slice(0, 20));
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleRun();
    }
  };

  const filteredDocs = DSL_DOCS.map(cat => ({
      ...cat,
      items: cat.items.filter(item => 
          item.title.toLowerCase().includes(docSearch.toLowerCase()) || 
          item.content.toLowerCase().includes(docSearch.toLowerCase())
      )
  })).filter(cat => cat.items.length > 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono">
      <div className="w-full max-w-5xl bg-black border-2 border-[#66D814] rounded-lg shadow-[0_0_20px_rgba(102,216,20,0.3)] flex flex-col h-[85vh] overflow-hidden relative">
        {/* Header */}
        <div className="bg-[#111] border-b border-[#333] p-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            <span className="ml-2 text-[#66D814] font-bold tracking-widest text-sm">FUTURE_TERMINAL_V1.0</span>
          </div>
          <div className="flex gap-4 items-center">
              <button 
                onClick={() => setShowDocs(!showDocs)} 
                className={`text-xs px-3 py-1 rounded border transition-colors ${showDocs ? 'bg-[#66D814] text-black border-[#66D814]' : 'bg-transparent text-[#66D814] border-[#66D814]'}`}
              >
                  {showDocs ? '隐藏帮助' : '指令帮助'}
              </button>
              <button onClick={onClose} className="text-[#66D814] hover:text-white transition-colors text-xl leading-none">×</button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/* Main Console Area */}
            <div className={`flex flex-col h-full transition-all duration-300 ${showDocs ? 'w-1/2 border-r border-[#333]' : 'w-full'}`}>
                {/* Output/History Area */}
                <div className="flex-1 bg-black p-4 overflow-y-auto font-mono text-sm space-y-1 border-b border-[#333]">
                <div className="text-gray-500 mb-4 select-none">
                    # 欢迎进入未来系统。<br/>
                    # 请输入标准 DSL 指令。默认主语为【训练员(p1)】。<br/>
                    # 按 Ctrl+Enter 执行指令。<br/>
                    # 提示：点击右上方“指令帮助”查看文档。<br/>
                </div>
                {history.map((line, i) => (
                    <div key={i} className="text-[#66D814] opacity-80 break-all border-l-2 border-[#333] pl-2">{line}</div>
                ))}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-[#111] shrink-0">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full h-24 bg-black border border-[#333] text-[#66D814] p-3 focus:outline-none focus:border-[#66D814] resize-none font-mono text-sm rounded"
                    placeholder="输入指令... (Ctrl+Enter 执行)"
                    autoFocus
                />
                <div className="flex justify-between items-center mt-3">
                    <span className="text-xs text-gray-500">支持多条指令 (;)</span>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setInput('')}
                            className="px-4 py-1.5 border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 rounded text-sm transition-colors"
                        >
                            清空
                        </button>
                        <button 
                            onClick={handleRun}
                            className="px-6 py-1.5 bg-[#66D814] text-black font-bold hover:bg-[#7aff25] rounded text-sm transition-colors shadow-[0_0_10px_rgba(102,216,20,0.4)]"
                        >
                            执行 EXECUTE
                        </button>
                    </div>
                </div>
                </div>
            </div>

            {/* Documentation Sidebar */}
            {showDocs && (
                <div className="w-1/2 bg-[#1e1e1e] flex flex-col h-full animate-fade-in">
                    <div className="p-3 border-b border-[#333] bg-[#252526]">
                        <input 
                            className="w-full bg-[#3c3c3c] border border-[#454545] text-gray-200 px-3 py-1.5 rounded text-sm focus:outline-none focus:border-[#0e639c]"
                            placeholder="搜索指令..."
                            value={docSearch}
                            onChange={(e) => setDocSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {filteredDocs.map((cat, idx) => (
                            <div key={idx}>
                                <h3 className="text-[#569cd6] font-bold border-b border-[#454545] pb-1 mb-3 text-sm">{cat.category}</h3>
                                <div className="space-y-3">
                                    {cat.items.map((item, i) => (
                                        <div key={i} className="bg-[#333] p-3 rounded border border-[#454545]">
                                            <div className="text-[#4fc1ff] font-mono font-bold text-xs mb-1">{item.title}</div>
                                            <div className="text-gray-400 text-xs whitespace-pre-wrap leading-relaxed">{item.content}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {filteredDocs.length === 0 && <div className="text-gray-500 text-center text-sm mt-10">未找到结果</div>}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
