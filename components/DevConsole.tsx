
import React, { useState } from 'react';

interface DevConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (command: string) => void;
}

export const DevConsole: React.FC<DevConsoleProps> = ({ isOpen, onClose, onExecute }) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono">
      <div className="w-full max-w-4xl bg-black border-2 border-[#66D814] rounded-lg shadow-[0_0_20px_rgba(102,216,20,0.3)] flex flex-col h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="bg-[#111] border-b border-[#333] p-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            <span className="ml-2 text-[#66D814] font-bold tracking-widest text-sm">FUTURE_TERMINAL_V1.0</span>
          </div>
          <button onClick={onClose} className="text-[#66D814] hover:text-white transition-colors text-xl">×</button>
        </div>

        {/* Output/History Area */}
        <div className="flex-1 bg-black p-4 overflow-y-auto font-mono text-sm space-y-1 border-b border-[#333]">
          <div className="text-gray-500 mb-4">
            # 欢迎进入未来系统。<br/>
            # 请输入标准 DSL 指令。默认主语为【训练员(p1)】。<br/>
            # 示例:<br/>
            # - 属性变更 财富 500<br/>
            # - 东海帝王.获得标签 强运<br/>
            # - 关系变更(爱情, 东海帝王, 训练员, 100)<br/>
            # - 跳转 ending_teio_cage_total<br/>
          </div>
          {history.map((line, i) => (
            <div key={i} className="text-[#66D814] opacity-80 break-all">{line}</div>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-[#111]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-24 bg-black border border-[#333] text-[#66D814] p-3 focus:outline-none focus:border-[#66D814] resize-none font-mono text-sm rounded"
            placeholder="输入指令... (Ctrl+Enter 执行)"
            autoFocus
          />
          <div className="flex justify-between items-center mt-3">
            <span className="text-xs text-gray-500">支持多条指令，用分号 ; 分隔</span>
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
    </div>
  );
};
