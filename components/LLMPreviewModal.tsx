import React from 'react';
import { GameEvent } from '../types';

interface Props {
    isOpen: boolean;
    isLoading?: boolean;
    event: GameEvent | undefined | null;
    onConfirm: () => void;
    onRedo: () => void;
    onCancel: () => void; // Fallback to normal behavior
}

export const LLMPreviewModal: React.FC<Props> = ({ isOpen, isLoading, event, onConfirm, onRedo, onCancel }) => {
    if (!isOpen) return null;

    if (isLoading || !event) {
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

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border-4 border-purple-200 relative flex flex-col max-h-[90vh]">
                <div className="bg-purple-100 p-4 border-b border-purple-200">
                    <h3 className="font-bold text-purple-800 text-lg">✨ AI 事件预览</h3>
                    <p className="text-xs text-purple-600 mt-1">在应用到游戏之前预览生成的事件内容。</p>
                </div>
                
                <div className="overflow-y-auto p-4 space-y-4">
                    <div>
                        <h4 className="text-sm font-bold text-gray-400">标题</h4>
                        <p className="text-lg font-bold">{event.标题 || '无标题'}</p>
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-gray-400">正文</h4>
                        <p className="text-gray-700 whitespace-pre-wrap">{event.正文}</p>
                    </div>
                    {event.预操作指令 && (
                        <div>
                            <h4 className="text-sm font-bold text-gray-400">预操作指令</h4>
                            <code className="text-xs bg-gray-100 p-2 rounded block break-all">{event.预操作指令}</code>
                        </div>
                    )}
                    {event.操作指令 && (
                        <div>
                            <h4 className="text-sm font-bold text-gray-400">操作指令</h4>
                            <code className="text-xs bg-gray-100 p-2 rounded block break-all">{event.操作指令}</code>
                        </div>
                    )}
                    
                    {event.选项组 && event.选项组.length > 0 && (
                        <div>
                            <h4 className="text-sm font-bold text-gray-400 mb-2">选项组</h4>
                            <div className="space-y-2">
                                {event.选项组.map((opt, i) => (
                                    <div key={i} className="border p-2 rounded bg-gray-50 text-sm">
                                        <p className="font-bold">{opt.显示文本}</p>
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
                        <button onClick={onRedo} className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 font-medium shadow-sm">重新生成</button>
                        <button onClick={onConfirm} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 font-bold shadow-md shadow-purple-600/30">确认应用</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
