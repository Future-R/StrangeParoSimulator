import React, { useState, useEffect } from 'react';
import { GameEvent } from '../types';

interface Props {
    isOpen: boolean;
    isLoading?: boolean;
    event: GameEvent | undefined | null;
    onConfirm: (event: GameEvent) => void;
    onRegenerateOptions: (event: GameEvent) => Promise<GameEvent['选项组']>;
    onRedo: () => void;
    onCancel: () => void; // Fallback to normal behavior
}

export const LLMPreviewModal: React.FC<Props> = ({ isOpen, isLoading, event, onConfirm, onRegenerateOptions, onRedo, onCancel }) => {
    const [localEvent, setLocalEvent] = useState<GameEvent | null>(null);
    const [isRegeneratingOpts, setIsRegeneratingOpts] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);

    useEffect(() => {
        if (event) {
            setLocalEvent(JSON.parse(JSON.stringify(event)));
        } else {
            setLocalEvent(null);
        }
        setCopySuccess(false);
    }, [event]);

    if (!isOpen) return null;

    if (isLoading || !localEvent) {
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
                <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4 border-4 border-purple-200">
                    <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto"></div>
                    <h3 className="font-bold text-purple-800 text-lg">AI 事件生成中...</h3>
                    <p className="text-sm text-gray-500">正在与大语言模型通信，这可能需要几秒钟。</p>
                    <button onClick={onCancel} className="mt-4 px-4 py-2 border rounded hover:bg-gray-100 text-gray-600 text-sm">取消并恢复默认</button>
                </div>
            </div>
        );
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(JSON.stringify(localEvent, null, 2)).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        });
    };

    const handleRegenerateOptions = async () => {
        setIsRegeneratingOpts(true);
        try {
            const newOpts = await onRegenerateOptions(localEvent);
            if (newOpts && newOpts.length > 0) {
                setLocalEvent(prev => prev ? { ...prev, 选项组: newOpts } : null);
            }
        } finally {
            setIsRegeneratingOpts(false);
        }
    };

    const updateOptionText = (index: number, newText: string) => {
        setLocalEvent(prev => {
            if (!prev || !prev.选项组) return prev;
            const newOpts = [...prev.选项组];
            newOpts[index] = { ...newOpts[index], 显示文本: newText };
            return { ...prev, 选项组: newOpts };
        });
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border-4 border-purple-200 relative flex flex-col max-h-[90vh]">
                <div className="bg-purple-100 p-4 border-b border-purple-200 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-purple-800 text-lg">✨ AI 事件预览与编辑</h3>
                        <p className="text-xs text-purple-600 mt-1">您可以手动修改内容，确认无误后应用。</p>
                    </div>
                    <button 
                        onClick={handleCopy}
                        className="text-xs bg-white text-purple-700 px-3 py-1.5 rounded-md border border-purple-300 hover:bg-purple-50 flex items-center"
                    >
                        {copySuccess ? '已复制 ✔️' : '复制 JSON'}
                    </button>
                </div>
                
                <div className="overflow-y-auto p-4 space-y-4">
                    <div>
                        <h4 className="text-sm font-bold text-gray-400 mb-1">标题</h4>
                        <input 
                            type="text" 
                            className="w-full border rounded p-2 text-lg font-bold outline-none focus:border-purple-400" 
                            value={localEvent.标题 || ''} 
                            onChange={e => setLocalEvent({...localEvent, 标题: e.target.value})}
                        />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-gray-400 mb-1">正文</h4>
                        <textarea 
                            className="w-full border rounded p-2 text-gray-700 whitespace-pre-wrap outline-none focus:border-purple-400 min-h-[100px]"
                            value={localEvent.正文}
                            onChange={e => setLocalEvent({...localEvent, 正文: e.target.value})}
                        />
                    </div>
                    {localEvent.预操作指令 && (
                        <div>
                            <h4 className="text-sm font-bold text-gray-400 mb-1">预操作指令 (只读)</h4>
                            <code className="text-xs bg-gray-100 p-2 rounded block break-all">{localEvent.预操作指令}</code>
                        </div>
                    )}
                    {localEvent.操作指令 && (
                        <div>
                            <h4 className="text-sm font-bold text-gray-400 mb-1">操作指令 (只读)</h4>
                            <code className="text-xs bg-gray-100 p-2 rounded block break-all">{localEvent.操作指令}</code>
                        </div>
                    )}
                    
                    {localEvent.选项组 && localEvent.选项组.length > 0 && (
                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <h4 className="text-sm font-bold text-gray-400">选项组</h4>
                                <button 
                                    onClick={handleRegenerateOptions}
                                    disabled={isRegeneratingOpts}
                                    className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                                >
                                    {isRegeneratingOpts ? '生成中...' : '重新生成选项 🔄'}
                                </button>
                            </div>
                            <div className="space-y-2">
                                {localEvent.选项组.map((opt, i) => (
                                    <div key={i} className="border p-2 rounded bg-gray-50 text-sm">
                                        <input 
                                            type="text"
                                            className="w-full border bg-white rounded px-2 py-1 mb-1 font-bold outline-none focus:border-purple-400"
                                            value={opt.显示文本}
                                            onChange={e => updateOptionText(i, e.target.value)}
                                        />
                                        {opt.操作指令 && <p className="text-xs text-gray-500 font-mono mt-1">{opt.操作指令}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="border-t p-4 flex justify-between bg-gray-50">
                    <button onClick={onCancel} className="px-4 py-2 border rounded hover:bg-gray-200 text-gray-600 font-medium">取消(跳过)</button>
                    <div className="space-x-2">
                        <button onClick={onRedo} className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 font-medium shadow-sm">重写事件</button>
                        <button onClick={() => onConfirm(localEvent)} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 font-bold shadow-md shadow-purple-600/30">确认应用</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
