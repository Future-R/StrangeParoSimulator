import React, { useEffect, useRef, useState } from 'react';
import { LogEntry, RuntimeCharacter } from '../types';

interface MobileGameSceneProps {
    logs: LogEntry[];
    characters: RuntimeCharacter[];
    pendingCharacterId?: string;
}

export const MobileGameScene: React.FC<MobileGameSceneProps> = ({ logs, characters, pendingCharacterId }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [lastLog, setLastLog] = useState<LogEntry | null>(null);

    // Get the character to display
    const activeCharacter = characters.find(c => 
        // 1. Pending Event Character
        (pendingCharacterId && c.instanceId === pendingCharacterId) ||
        // 2. Character mentioned in last log
        (logs.length > 0 && c.名称 === logs[logs.length - 1].characterName) ||
        // 3. Default to the Uma (usually index 1)
        (!c.templateId.includes('训练员'))
    ) || characters[1] || characters[0];

    useEffect(() => {
        if (logs.length > 0) {
            setLastLog(logs[logs.length - 1]);
        }
    }, [logs]);

    // Canvas Drawing Logic
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Resize canvas to fit container
        const resize = () => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        // Animation Loop
        let animationFrameId: number;
        let time = 0;

        // Cloud objects
        const clouds = Array.from({ length: 5 }).map(() => ({
            x: Math.random() * canvas.width,
            y: Math.random() * (canvas.height * 0.4),
            size: 20 + Math.random() * 30,
            speed: 0.2 + Math.random() * 0.3
        }));

        const render = () => {
            time++;
            const w = canvas.width;
            const h = canvas.height;

            // 1. Sky Gradient (Blue to White)
            const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
            skyGrad.addColorStop(0, '#60A5FA'); // Blue-400
            skyGrad.addColorStop(0.6, '#DBEAFE'); // Blue-100
            skyGrad.addColorStop(1, '#F0FDF4'); // Green-50
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, w, h);

            // 2. Moving Clouds
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            clouds.forEach(cloud => {
                cloud.x += cloud.speed;
                if (cloud.x > w + cloud.size * 2) cloud.x = -cloud.size * 2;
                
                ctx.beginPath();
                ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2);
                ctx.arc(cloud.x + cloud.size * 0.8, cloud.y - cloud.size * 0.2, cloud.size * 0.8, 0, Math.PI * 2);
                ctx.arc(cloud.x - cloud.size * 0.8, cloud.y - cloud.size * 0.2, cloud.size * 0.8, 0, Math.PI * 2);
                ctx.fill();
            });

            // 3. Ground (Grass)
            ctx.fillStyle = '#86EFAC'; // Green-300
            ctx.beginPath();
            ctx.ellipse(w / 2, h, w * 0.8, h * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();

            // 4. Character Silhouette / Placeholder
            // Since we don't have assets, we draw a stylized figure
            if (activeCharacter) {
                const charX = w / 2;
                const charY = h * 0.85;
                const breath = Math.sin(time * 0.05) * 5;

                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.1)';
                ctx.beginPath();
                ctx.ellipse(charX, charY, 60, 15, 0, 0, Math.PI * 2);
                ctx.fill();

                // Body (Simple shape)
                ctx.fillStyle = activeCharacter.性别 === '女' ? '#F472B6' : '#60A5FA'; // Pink or Blue
                
                // Draw a simple pawn-like shape
                ctx.beginPath();
                // Head
                ctx.arc(charX, charY - 140 + breath, 35, 0, Math.PI * 2);
                // Body
                ctx.moveTo(charX, charY - 110 + breath);
                ctx.bezierCurveTo(charX - 40, charY - 80 + breath, charX - 50, charY, charX, charY);
                ctx.bezierCurveTo(charX + 50, charY, charX + 40, charY - 80 + breath, charX, charY - 110 + breath);
                ctx.fill();

                // Add "ears" if it's a Uma (simple triangles)
                if (activeCharacter.标签组.some(t => t.templateId === '马娘')) {
                     ctx.beginPath();
                     ctx.moveTo(charX - 25, charY - 165 + breath);
                     ctx.lineTo(charX - 15, charY - 135 + breath);
                     ctx.lineTo(charX - 35, charY - 135 + breath);
                     ctx.fill();

                     ctx.beginPath();
                     ctx.moveTo(charX + 25, charY - 165 + breath);
                     ctx.lineTo(charX + 35, charY - 135 + breath);
                     ctx.lineTo(charX + 15, charY - 135 + breath);
                     ctx.fill();
                }
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [activeCharacter]);

    const isSystemLog = lastLog?.type === 'system';

    return (
        <div ref={containerRef} className="relative w-full h-full bg-gray-100 overflow-hidden flex flex-col">
            {/* The Canvas Layer */}
            <canvas ref={canvasRef} className="absolute inset-0 z-0 block" />

            {/* UI Overlay Layer */}
            <div className="relative z-10 flex flex-col justify-between h-full pointer-events-none">
                
                {/* Top Status Bar (Mini) */}
                <div className="bg-white/80 backdrop-blur-md p-2 m-2 rounded-lg shadow-sm border border-white/50 flex justify-between items-center pointer-events-auto">
                    <div className="flex flex-col">
                         <span className="text-xs font-bold text-gray-500">当前心情</span>
                         <span className="text-sm font-bold text-pink-500">{activeCharacter?.通用属性.心情 ?? '--'}</span>
                    </div>
                    <div className="flex space-x-2">
                        <div className="flex flex-col items-center w-12">
                             <div className="text-[10px] text-gray-400 font-bold">体力</div>
                             <div className="w-full bg-gray-200 h-1.5 rounded-full mt-1">
                                <div className="bg-green-500 h-full rounded-full" style={{width: `${Math.min(100, activeCharacter?.通用属性.体力 ?? 0)}%`}}></div>
                             </div>
                        </div>
                        <div className="flex flex-col items-center w-12">
                             <div className="text-[10px] text-gray-400 font-bold">精力</div>
                             <div className="w-full bg-gray-200 h-1.5 rounded-full mt-1">
                                <div className="bg-blue-500 h-full rounded-full" style={{width: `${Math.min(100, activeCharacter?.通用属性.精力 ?? 0)}%`}}></div>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Dialogue Box */}
                {lastLog && (
                    <div className="m-2 mb-28 pointer-events-auto">
                        {isSystemLog ? (
                             <div className="bg-gray-800/80 text-white text-center py-2 px-4 rounded-full text-xs font-bold backdrop-blur-sm shadow-lg mb-4 animate-jelly">
                                {lastLog.text.replace(/===/g, '').trim()}
                             </div>
                        ) : (
                            <div className="bg-white/95 border-2 border-green-200 shadow-xl rounded-xl overflow-hidden animate-fade-in">
                                {/* Name Tag */}
                                <div className="bg-green-500 px-4 py-1 flex justify-between items-center">
                                    <span className="text-white font-bold text-sm tracking-wide">
                                        {lastLog.characterName}
                                    </span>
                                </div>
                                {/* Text Content */}
                                <div className="p-4 min-h-[100px] flex items-start">
                                    <div 
                                        className="text-gray-800 text-sm leading-relaxed font-medium"
                                        dangerouslySetInnerHTML={{ __html: lastLog.text.replace(/\n/g, '<br/>') }}
                                    ></div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
