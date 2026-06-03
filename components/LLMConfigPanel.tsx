import React, { useState, useEffect } from 'react';

export interface LLMConfig {
    enabled: boolean;
    url: string;
    key: string;
    model: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    config: LLMConfig;
    onSave: (config: LLMConfig) => void;
}

export const LLMConfigPanel: React.FC<Props> = ({ isOpen, onClose, config, onSave }) => {
    const [localConfig, setLocalConfig] = useState<LLMConfig>(config);
    const [testStatus, setTestStatus] = useState<string>('');

    useEffect(() => {
        setLocalConfig(config);
    }, [config]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(localConfig);
        onClose();
    };

    const handleTest = async () => {
        setTestStatus('测试中...');
        let fetchUrl = localConfig.url;
        
        // Auto-correct common API endpoint mistakes
        if (fetchUrl === 'https://api.deepseek.com' || fetchUrl === 'https://api.deepseek.com/') {
            fetchUrl = 'https://api.deepseek.com/chat/completions';
        }
        
        if (fetchUrl.endsWith('/v1')) {
            fetchUrl += '/chat/completions';
        }

        try {
            const res = await fetch(fetchUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localConfig.key}`
                },
                body: JSON.stringify({
                    model: localConfig.model || 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'Say "OK"' }],
                    max_tokens: 10
                })
            });
            if (res.ok) {
                setTestStatus('连接成功');
            } else {
                setTestStatus(`错误: ${res.status} ${res.statusText}`);
            }
        } catch (e: any) {
            setTestStatus(`连接失败: ${e.message}`);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                    <h2 className="text-xl font-bold">LLM 驱动配置</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-red-500">关闭</button>
                </div>

                <div className="space-y-4">
                    <label className="flex items-center space-x-2">
                        <input type="checkbox" checked={localConfig.enabled} onChange={e => setLocalConfig({...localConfig, enabled: e.target.checked})} />
                        <span className="font-medium">启用 LLM 生成事件模式</span>
                    </label>

                    <div>
                        <label className="block text-sm font-medium mb-1">API 接口地址 (OpenAI格式)</label>
                        <input type="text" className="w-full border rounded p-2" value={localConfig.url} onChange={e => setLocalConfig({...localConfig, url: e.target.value})} placeholder="https://api.openai.com/v1/chat/completions" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">模型名称</label>
                        <input type="text" className="w-full border rounded p-2" value={localConfig.model} onChange={e => setLocalConfig({...localConfig, model: e.target.value})} placeholder="gpt-4o / deepseek-chat" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">API 密钥 (API Key)</label>
                        <input type="password" className="w-full border rounded p-2" value={localConfig.key} onChange={e => setLocalConfig({...localConfig, key: e.target.value})} />
                    </div>

                    <div className="flex space-x-2">
                        <button onClick={handleTest} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 outline-none">测试连接</button>
                        <span className="flex-1 text-xs text-gray-500 self-center">{testStatus}</span>
                    </div>
                </div>

                <div className="border-t pt-4 flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-100">取消</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">保存</button>
                </div>
            </div>
        </div>
    );
};
