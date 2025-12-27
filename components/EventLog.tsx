
import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface EventLogProps {
  logs: LogEntry[];
}

export const EventLog: React.FC<EventLogProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex-1 bg-gray-100 h-screen overflow-y-auto p-4 pb-32">
      <div className="max-w-3xl mx-auto space-y-4">
        {logs.map((log, idx) => {
            const isSystem = log.type === 'system';
            const isChoice = log.type === 'choice';
            
            return (
                <div 
                    key={idx} 
                    className={`
                    animate-fade-in transition-all
                    ${isSystem ? 'flex justify-center my-4' : 'flex flex-col'}
                    ${isChoice ? 'items-end' : ''}
                    `}
                >
                    {isSystem ? (
                         <div className="bg-gray-200 text-gray-600 text-xs font-bold px-4 py-1 rounded-full shadow-inner border border-white">
                             {log.text.replace(/===/g, '').trim()}
                         </div>
                    ) : (
                        <div className={`
                            max-w-[90%] rounded-2xl p-4 shadow-sm border
                            ${isChoice 
                                ? 'bg-yellow-50 border-yellow-200 text-gray-700 rounded-tr-none' 
                                : 'bg-white border-gray-200 text-gray-800 rounded-tl-none'
                            }
                        `}>
                             {!isChoice && (
                                <div className="font-bold text-xs text-green-600 mb-1 flex items-center">
                                    <span className="w-2 h-2 rounded-full bg-green-500 mr-1"></span>
                                    {log.characterName}
                                </div>
                             )}
                             <div className="text-sm md:text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: log.text.replace(/\n/g, '<br/>') }}></div>
                        </div>
                    )}
                </div>
            );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
};
