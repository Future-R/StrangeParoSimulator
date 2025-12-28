
import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { EventLog } from './components/EventLog';
import { GameControls } from './components/GameControls';
import { EventModal } from './components/EventModal';
import { TagModal } from './components/TagModal';
import { SetupScreen } from './components/SetupScreen';
import { MobileCharacterList } from './components/MobileCharacterList';
import { GameState, RuntimeCharacter, LogEntry, TagTemplate } from './types';
import { createRuntimeCharacter, triggerCharacterEvent, executeAction, checkCondition, getTurnDate, parseText } from './services/engine';
import { CHARACTERS, EVENTS, ENDING_EVENTS } from './constants';

const INITIAL_MAX_TURNS = 72;

const createInitialState = (): GameState => {
    return {
        gamePhase: 'setup',
        currentTurn: 0,
        maxTurns: INITIAL_MAX_TURNS,
        characters: [],
        logs: [],
        pendingEvents: [],
        currentTurnQueue: [],
        isAuto: false,
        autoSpeed: 1000
    };
};

function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialState());
  const [activeTag, setActiveTag] = useState<TagTemplate | null>(null);

  // DEBUG: Expose state to console
  useEffect(() => {
    // @ts-ignore
    window.GameDebug = gameState;
  }, [gameState]);

  const handleSetupComplete = (name: string, gender: '男'|'女', selectedTags: string[]) => {
      // 1. Determine Starter Uma (Random from a subset)
      const umaKeys = ['优秀素质', '东海帝王', '摩耶重炮', '米浴', '北部玄驹'];
      const randomUmaKey = umaKeys[Math.floor(Math.random() * umaKeys.length)];

      // 2. Create All Characters
      const allCharacters: RuntimeCharacter[] = [];
      
      // Create Trainer (Player) - Always 'p1'
      const trainer = createRuntimeCharacter(CHARACTERS['训练员'], 'p1', true, name, gender, selectedTags);
      allCharacters.push(trainer);

      // Create everyone else
      Object.values(CHARACTERS).forEach(tpl => {
          if (tpl.id === '训练员') return; // Already created

          const isStarter = tpl.id === randomUmaKey;
          const instanceId = isStarter ? 'c1' : `npc_${tpl.id}`;
          
          const char = createRuntimeCharacter(tpl, instanceId, isStarter); // Only starter is inTeam initially
          allCharacters.push(char);
      });

      const starterUma = allCharacters.find(c => c.instanceId === 'c1');

      setGameState({
          gamePhase: 'playing',
          currentTurn: 0,
          maxTurns: INITIAL_MAX_TURNS,
          characters: allCharacters,
          logs: [{
              turn: 0,
              characterName: '系统',
              text: `${name}与${starterUma?.名称 || '未知马娘'}的三年开始了。`,
              type: 'system'
          }],
          pendingEvents: [],
          currentTurnQueue: [],
          isAuto: false,
          autoSpeed: 1000
      });
  };

  const handleOptionSelect = useCallback((optionIndex: number, displayText: string) => {
    setGameState(prev => {
        if (prev.pendingEvents.length === 0) return prev;

        const currentEventItem = prev.pendingEvents[0];
        const { characterId, event, variables } = currentEventItem;
        
        let newCharacters = JSON.parse(JSON.stringify(prev.characters)) as RuntimeCharacter[];
        let char = newCharacters.find(c => c.instanceId === characterId);
        
        if (!char) return prev;

        let resultLogs: string[] = [];
        let jumpId: string | undefined = undefined;

        // Special handling for "Continue" button (optionIndex === -1)
        if (optionIndex === -1) {
            // No action needed for continue, just proceed to remove event or check branches
        } else {
             const option = event.选项组?.[optionIndex];
             if (option) {
                // 1. 执行选项操作
                const res = executeAction(option.操作指令, char, prev.currentTurn, newCharacters, variables);
                resultLogs = res.logs;
                if (res.nextEventId) jumpId = res.nextEventId;

                // 2. 选项分支
                if (event.分支组) {
                    for (const branch of event.分支组) {
                        if (checkCondition(branch.判别式, char, prev.currentTurn, optionIndex + 1, newCharacters, variables)) {
                            const bRes = executeAction(branch.操作指令, char, prev.currentTurn, newCharacters, variables);
                            resultLogs.push(...bRes.logs);
                            if (bRes.nextEventId) jumpId = bRes.nextEventId;
                            if (branch.跳转事件ID) jumpId = branch.跳转事件ID;
                            break;
                        }
                    }
                }
             }
        }
        
        // 3. 自动分支 (For events without options, or if we want to check branch conditions regardless of option)
        // Usually used for "Exhaustion" events that might chain
        if (optionIndex === -1 && event.分支组) {
             for (const branch of event.分支组) {
                if (checkCondition(branch.判别式, char, prev.currentTurn, undefined, newCharacters, variables)) {
                    const bRes = executeAction(branch.操作指令, char, prev.currentTurn, newCharacters, variables);
                    resultLogs.push(...bRes.logs);
                    if (bRes.nextEventId) jumpId = bRes.nextEventId;
                    if (branch.跳转事件ID) jumpId = branch.跳转事件ID;
                    break;
                }
            }
        }

        const newLogs = [...prev.logs];
        const combinedEffects = [...resultLogs];
        const effectHtml = combinedEffects.length > 0 
            ? `<div class='mt-1 text-xs font-bold text-gray-500'>(${combinedEffects.join(', ')})</div>`
            : "";
        
        if (optionIndex !== -1) {
            const parsedDisplayText = parseText(displayText, char, prev.currentTurn, newCharacters, variables);
            newLogs.push({
                turn: prev.currentTurn,
                characterName: char.名称,
                text: `选择了【${parsedDisplayText}】${effectHtml}`,
                type: 'choice'
            });
        }

        let remainingEvents = prev.pendingEvents.slice(1);
        
        // --- JUMP LOGIC with TEXT LOGGING ---
        if (jumpId) {
            const nextEvent = EVENTS.find(e => e.id === jumpId);
            if (nextEvent) {
                // Determine Character for next event (usually same, but could be different if variables supported it, for now assume same)
                const nextChar = char; 

                // Execute Pre-actions immediately
                let nextVariables = { ...variables };
                if (nextEvent.预操作指令) {
                     const preRes = executeAction(nextEvent.预操作指令, nextChar, prev.currentTurn, newCharacters, nextVariables);
                     nextVariables = preRes.newVariables || nextVariables;
                }

                // Check if jump target has options
                // If it has options -> Add to pending
                // If NO options -> Execute immediately (Chain narrative)
                const hasOptions = nextEvent.选项组 && nextEvent.选项组.length > 0;
                
                let jumpEffectHtml = '';
                if (nextEvent.操作指令 && !hasOptions) {
                    const actRes = executeAction(nextEvent.操作指令, nextChar, prev.currentTurn, newCharacters, nextVariables);
                    if (actRes.logs.length > 0) {
                        jumpEffectHtml = `<div class='mt-2 pt-2 border-t border-dashed border-gray-200 text-xs text-gray-400 font-bold'>${actRes.logs.join('  ')}</div>`;
                    }
                }

                // Log the Text Immediately
                const parsedText = parseText(nextEvent.正文, nextChar, prev.currentTurn, newCharacters, nextVariables) + jumpEffectHtml;
                newLogs.push({
                    turn: prev.currentTurn,
                    characterName: nextChar.名称,
                    text: parsedText,
                    type: 'event',
                    isImportant: !!nextEvent.标题
                });

                if (hasOptions) {
                     // Add to Pending Events (so user can interact or click continue)
                    remainingEvents = [{ 
                        characterId, 
                        event: nextEvent,
                        variables: nextVariables 
                    }, ...remainingEvents];
                }
            }
        }

        // --- CHECK GAME OVER AFTER ENDING EVENT ---
        // If we were processing the ending (turn > maxTurns) and no more events pending
        if (prev.currentTurn > prev.maxTurns && remainingEvents.length === 0) {
            return {
                ...prev,
                characters: newCharacters,
                logs: newLogs,
                pendingEvents: [],
                gamePhase: 'gameover'
            };
        }

        return {
            ...prev,
            characters: newCharacters,
            logs: newLogs,
            pendingEvents: remainingEvents,
        };
    });
  }, []); 

  const handleNextTurn = useCallback(() => {
    setGameState(prev => {
        if (prev.gamePhase === 'gameover' || prev.pendingEvents.length > 0) return prev;

        let newState = { ...prev };
        let nextQueue = [...prev.currentTurnQueue];

        // 1. If queue is empty, try to advance turn
        if (nextQueue.length === 0) {
            const nextTurn = prev.currentTurn + 1;
            
            // --- ENDING CHECK ---
            // If we just finished the last turn (maxTurns), trigger the Ending Phase
            if (nextTurn > prev.maxTurns) {
                 // Prevent infinite loop if we are already in ending phase but just cleared an event
                 // Only trigger if we aren't already processing an ending
                 
                 // Strategy: Move to Turn 73 (Max+1) and queue the Trainer to trigger the Ending Event
                 newState.currentTurn = nextTurn;
                 
                 // Find an ending event
                 // Filter endings by priority/condition (simplified for now to just pick first valid)
                 const endingEvent = ENDING_EVENTS.find(e => checkCondition(e.触发条件, prev.characters[0], nextTurn, undefined, prev.characters));
                 
                 if (endingEvent) {
                     // Force trigger the ending event on the Trainer (p1)
                     return triggerCharacterEvent(newState, 'p1', endingEvent);
                 } else {
                     // No ending found? Just game over.
                     return { ...prev, gamePhase: 'gameover', isAuto: false };
                 }
            }
            
            newState.currentTurn = nextTurn;
            newState.logs = [...prev.logs, {
                turn: nextTurn,
                characterName: '系统',
                text: `=== ${getTurnDate(nextTurn)} ===`,
                type: 'system'
            }];
            // Only queue characters currently in the team
            nextQueue = prev.characters.filter(c => c.inTeam).map(c => c.instanceId);
        }

        // 2. Process next character in queue
        const targetId = nextQueue.shift();
        newState.currentTurnQueue = nextQueue;
        
        if (targetId) {
            return triggerCharacterEvent(newState, targetId);
        }
        return newState;
    });
  }, []);

  const restartGame = useCallback(() => setGameState(createInitialState()), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (gameState.gamePhase === 'setup') return;

        if (gameState.pendingEvents.length > 0) {
            const key = parseInt(e.key);
            if (!isNaN(key) && key >= 1 && key <= 9) {
                const event = gameState.pendingEvents[0].event;
                if (event.选项组 && event.选项组.length >= key) {
                    handleOptionSelect(key - 1, event.选项组[key-1].显示文本);
                }
            }
            return;
        }

        if (e.code === 'Space' || e.code === 'Enter') {
            e.preventDefault(); 
            if (gameState.gamePhase === 'gameover') {
                restartGame();
            } else {
                handleNextTurn();
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, handleOptionSelect, handleNextTurn, restartGame]);

  useEffect(() => {
    let interval: number | undefined;
    if (gameState.isAuto && gameState.gamePhase === 'playing' && gameState.pendingEvents.length === 0) {
      interval = window.setInterval(() => {
        handleNextTurn();
      }, gameState.autoSpeed);
    }
    return () => clearInterval(interval);
  }, [gameState.isAuto, gameState.gamePhase, gameState.pendingEvents.length, handleNextTurn, gameState.autoSpeed]);

  const toggleAuto = () => setGameState(prev => ({ ...prev, isAuto: !prev.isAuto }));

  if (gameState.gamePhase === 'setup') return <SetupScreen onComplete={handleSetupComplete} />;

  const currentPendingEvent = gameState.pendingEvents[0];
  const currentPendingChar = currentPendingEvent 
    ? gameState.characters.find(c => c.instanceId === currentPendingEvent.characterId)
    : undefined;

  const parsedModalText = currentPendingEvent && currentPendingChar
    ? parseText(currentPendingEvent.event.正文, currentPendingChar, gameState.currentTurn, gameState.characters, currentPendingEvent.variables)
    : undefined;

  const parsedModalTitle = currentPendingEvent && currentPendingChar && currentPendingEvent.event.标题
    ? parseText(currentPendingEvent.event.标题, currentPendingChar, gameState.currentTurn, gameState.characters, currentPendingEvent.variables)
    : undefined;

  const hasPendingActions = gameState.currentTurnQueue.length > 0;

  // Filter for display
  const teamCharacters = gameState.characters.filter(c => c.inTeam);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-white">
        
        {/* Mobile Header (Date) - Visible only on mobile */}
        <div className="md:hidden flex-shrink-0 bg-white border-b border-gray-200 p-3 shadow-sm flex justify-center items-center z-20">
             <div className="px-4 py-1 rounded-full border border-green-400 bg-green-50">
                <span className="font-bold text-green-700 text-base">{getTurnDate(gameState.currentTurn)}</span>
             </div>
        </div>

        {/* Desktop Sidebar - Hidden on Mobile */}
        <div className="hidden md:flex md:w-96 flex-shrink-0 h-full z-10">
            <Sidebar 
                characters={teamCharacters} 
                onTagClick={setActiveTag}
            />
        </div>

        <div className="flex-1 flex flex-col h-full relative overflow-hidden">
            {/* Desktop Header */}
            <div className="hidden md:flex p-4 border-b bg-white shadow-sm justify-between items-center z-20 flex-shrink-0">
                <h1 className="text-xl font-bold text-gray-800">怪文书模拟器</h1>
            </div>

            {/* Main Content Area (Scrollable) */}
            <div className="flex-1 overflow-y-auto flex flex-col w-full">
                
                {/* Mobile Character Accordion List - Visible only on Mobile, part of scroll flow */}
                <div className="md:hidden flex-shrink-0">
                     <MobileCharacterList 
                        characters={teamCharacters} 
                        onTagClick={setActiveTag}
                     />
                </div>

                {/* Event Log - The rest of the space */}
                <EventLog logs={gameState.logs} />
            </div>

            {/* Spacer for fixed bottom controls */}
            <div className="h-16 md:h-24 flex-shrink-0"></div>
        </div>

        <EventModal 
            isOpen={!!currentPendingEvent} 
            event={currentPendingEvent?.event} 
            characterName={currentPendingChar?.名称 || ''}
            parsedTitle={parsedModalTitle}
            parsedText={parsedModalText}
            onSelectOption={handleOptionSelect}
        />

        <TagModal 
            isOpen={!!activeTag}
            tag={activeTag}
            onClose={() => setActiveTag(null)}
        />
        
        <GameControls 
            currentTurn={gameState.currentTurn} 
            maxTurns={gameState.maxTurns}
            isAuto={gameState.isAuto}
            onNextTurn={handleNextTurn}
            onToggleAuto={toggleAuto}
            isGameOver={gameState.gamePhase === 'gameover'}
            onRestart={restartGame}
            hasPendingActions={hasPendingActions}
        />
    </div>
  );
}

export default App;
