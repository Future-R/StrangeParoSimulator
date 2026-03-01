import React from 'react';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CHANGELOG_DATA = [
  {
    version: '0.2.260301a',
    date: '2026-03-01',
    changes: [
      '新增：特别周作为初始马娘。',
      '新增：Genesis撰写的13个特别周事件。',
      '调整：部分文案细节。',
    ]
  },
  {
    version: '0.2.260228a',
    date: '2026-02-28',
    changes: [
      '新增：版本号显示和更新日志。',
      '新增：非初始马娘特别周。',
      '新增：路痴标签。',
      '调整：移除一处多余的交合判定。',
      '修复：关系语法糖未能正确解析。',
      '修复：赌狗事件文本描述错误。',
      '也许接下来会开始慢慢恢复更新？',
    ]
  },
  {
    version: '0.2.260104c',
    date: '2026-01-04',
    changes: [
      '实装8名可玩角色，54个特性，184个事件。',
      '提供导入外部事件功能。',
      '长期征集投稿。可通过GitHub投稿事件或向我反馈。',
    ]
  }
];

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="bg-[#66D814] p-4 text-center shadow-md relative flex-shrink-0">
          <h2 className="text-xl font-bold text-white tracking-widest drop-shadow-md">
            更新日志
          </h2>
          <button 
            onClick={onClose}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white hover:text-green-100 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50">
          {CHANGELOG_DATA.map((log, index) => (
            <div key={log.version} className="relative">
              {/* Timeline line */}
              {index !== CHANGELOG_DATA.length - 1 && (
                <div className="absolute left-[11px] top-8 bottom-[-32px] w-0.5 bg-green-200"></div>
              )}
              
              <div className="flex items-start gap-4">
                {/* Timeline dot */}
                <div className="relative z-10 w-6 h-6 rounded-full bg-green-100 border-4 border-white shadow-sm flex items-center justify-center flex-shrink-0 mt-1">
                  <div className="w-2 h-2 rounded-full bg-[#66D814]"></div>
                </div>
                
                <div className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex justify-between items-baseline mb-3 border-b border-gray-100 pb-2">
                    <h3 className="text-lg font-bold text-gray-800">v{log.version}</h3>
                    <span className="text-xs text-gray-400 font-medium">{log.date}</span>
                  </div>
                  <ul className="space-y-2">
                    {log.changes.map((change, i) => (
                      <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                        <span className="text-[#66D814] mt-1">•</span>
                        <span className="leading-relaxed">{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
