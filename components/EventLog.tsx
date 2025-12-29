
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
    <div className="flex-1 bg-gray-100 h-full overflow-y-auto p-4 md:p-6 pb-24 md:pb-32 w-full">
      <div className="max-w-3xl mx-auto space-y-6">
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
                    ) : isChoice ? (
                        <div className="bg-yellow-50 border border-yellow-200 text-gray-700 rounded-2xl rounded-tr-none p-3 shadow-sm max-w-[90%] md:max-w-[85%]">
                             <div className="text-sm md:text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: log.text.replace(/\n/g, '<br/>') }}></div>
                        </div>
                    ) : (
                        // Narrative / Event Log Style
                        <div className="relative mt-6 mb-2 max-w-[98%] md:max-w-[90%] self-start">
                            {/* Name Capsule - Increased size to match body text */}
                            <div className="absolute -top-4 left-4 bg-[#66D814] text-white text-sm md:text-base font-bold px-4 py-1 rounded-full shadow-sm z-10 border-2 border-white">
                                {log.characterName}
                            </div>
                            
                            {/* Text Capsule */}
                            <div className="bg-white border-2 border-[#66D814] rounded-2xl p-5 pt-6 text-gray-800 shadow-sm">
                                <div className="text-sm md:text-base leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: log.text.replace(/\n/g, '<br/>') }}></div>
                            </div>
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
