
import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { EventLog } from './components/EventLog';
import { GameControls } from './components/GameControls';
import { EventModal } from './components/EventModal';
import { TagModal } from './components/TagModal';
import { SetupScreen } from './components/SetupScreen';
import { MobileCharacterList } from './components/MobileCharacterList';
import { GameState, RuntimeCharacter, LogEntry, TagTemplate } from './types';
import { createRuntimeCharacter, triggerCharacterEvent, executeAction, checkCondition, getTurnDate, parseText, generateStateDiffLog } from './services/engine';
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
    
    // @ts-ignore
    window.printRelations = () => {
        console.table(
            gameState.characters
                .filter(c => c.instanceId !== 'p1')
                .map(c => ({
                    姓名: c.名称,
                    友情: c.关系列表['p1']?.友情 || 0,
                    爱情: c.关系列表['p1']?.爱情 || 0,
                    爱欲: c.通用属性.爱欲
                }))
        );
    };
  }, [gameState]);

  const handleSetupComplete = (name: string, gender: '男'|'女', selectedTags: string[]) => {
      // 1. Determine Starter Uma (Random from a subset)
      const umaKeys = ['优秀素质', '东海帝王', '摩耶重炮', '米浴', '北部玄驹', '无声铃鹿'];
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
      
      // Fix: Populate queue immediately for Turn 1
      const starterQueue = allCharacters.filter(c => c.inTeam).map(c => c.instanceId);

      setGameState({
          gamePhase: 'playing',
          currentTurn: 1, // Start at Turn 1 (Early Jan)
          maxTurns: INITIAL_MAX_TURNS,
          characters: allCharacters,
          logs: [{
              turn: 1,
              characterName: '系统',
              text: `${name}与${starterUma?.名称 || '未知马娘'}的三年开始了。`,
              type: 'system'
          }],
          pendingEvents: [],
          currentTurnQueue: starterQueue,
          isAuto: false,
          autoSpeed: 1000
      });
  };

  const handleOptionSelect = useCallback((optionIndex: number, displayText: string) => {
    setGameState(prev => {
        if (prev.pendingEvents.length === 0) return prev;

        const currentEventItem = prev.pendingEvents[0];
        const { characterId, event, variables } = currentEventItem;
        
        // 1. Snapshot State Before Action
        const snapshotCharacters = JSON.parse(JSON.stringify(prev.characters)) as RuntimeCharacter[];
        
        // 2. Prepare Mutable State
        let newCharacters = JSON.parse(JSON.stringify(prev.characters)) as RuntimeCharacter[];
        let char = newCharacters.find(c => c.instanceId === characterId);
        
        if (!char) return prev;

        let jumpId: string | undefined = undefined;

        // Special handling for "Continue" button (optionIndex === -1)
        if (optionIndex === -1) {
            // No action needed for continue
        } else {
             const option = event.选项组?.[optionIndex];
             if (option) {
                // Execute Action (Silent)
                const res = executeAction(option.操作指令, char, prev.currentTurn, newCharacters, variables, true);
                if (res.nextEventId) jumpId = res.nextEventId;

                // Process Branches (Silent)
                if (event.分支组) {
                    for (const branch of event.分支组) {
                        if (checkCondition(branch.判别式, char, prev.currentTurn, optionIndex + 1, newCharacters, variables)) {
                            const bRes = executeAction(branch.操作指令, char, prev.currentTurn, newCharacters, variables, true);
                            if (bRes.nextEventId) jumpId = bRes.nextEventId;
                            if (branch.跳转事件ID) jumpId = branch.跳转事件ID;
                            break;
                        }
                    }
                }
             }
        }
        
        // Auto Branches for Continue (Silent)
        if (optionIndex === -1 && event.分支组) {
             for (const branch of event.分支组) {
                if (checkCondition(branch.判别式, char, prev.currentTurn, undefined, newCharacters, variables)) {
                    const bRes = executeAction(branch.操作指令, char, prev.currentTurn, newCharacters, variables, true);
                    if (bRes.nextEventId) jumpId = bRes.nextEventId;
                    if (branch.跳转事件ID) jumpId = branch.跳转事件ID;
                    break;
                }
            }
        }

        // --- Tag Logic (Silent) ---
        // Modify state in place, results will be captured by Diff
        if (event.标签组?.includes('工作') && char.标签组.some(t => t.templateId === '社畜')) {
            if (char.通用属性.体力 >= 5 && char.通用属性.心情 >= 5) {
                char.通用属性.体力 -= 5;
                char.通用属性.心情 -= 5;
                char.通用属性.精力 = Math.min(100, char.通用属性.精力 + 10);
            }
        }

        // --- Diffing to Generate Clean Log ---
        const diffLogs = generateStateDiffLog(snapshotCharacters, newCharacters, characterId);
        
        const newLogs = [...prev.logs];
        const effectHtml = diffLogs.length > 0 
            ? `<div class='mt-1 text-xs font-bold text-gray-500'>(${diffLogs.join(', ')})</div>`
            : "";
        
        if (optionIndex !== -1) {
            // Need to parse option text again here for log to be correct if variables used
            const parsedDisplayText = parseText(displayText, char, prev.currentTurn, newCharacters, variables);
            newLogs.push({
                turn: prev.currentTurn,
                characterName: char.名称,
                text: `选择了【${parsedDisplayText}】${effectHtml}`,
                type: 'choice'
            });
        }

        let remainingEvents = prev.pendingEvents.slice(1);
        
        // --- JUMP LOGIC (Silent Execution, Log Parsing) ---
        if (jumpId) {
            const nextEvent = EVENTS.find(e => e.id === jumpId);
            if (nextEvent) {
                const nextChar = char; 

                let nextVariables = { ...variables };
                if (nextEvent.预操作指令) {
                     const preRes = executeAction(nextEvent.预操作指令, nextChar, prev.currentTurn, newCharacters, nextVariables, true);
                     nextVariables = preRes.newVariables || nextVariables;
                }

                const hasOptions = nextEvent.选项组 && nextEvent.选项组.length > 0;
                
                let jumpEffectHtml = '';
                if (nextEvent.操作指令 && !hasOptions) {
                    // Execute immediately silently, then diff again
                    // Use newCharacters as baseline for jump action
                    const preJumpSnapshot = JSON.parse(JSON.stringify(newCharacters)) as RuntimeCharacter[];
                    
                    executeAction(nextEvent.操作指令, nextChar, prev.currentTurn, newCharacters, nextVariables, true);
                    
                    const jumpDiffs = generateStateDiffLog(preJumpSnapshot, newCharacters, characterId);
                    if (jumpDiffs.length > 0) {
                        jumpEffectHtml = `<div class='mt-2 pt-2 border-t border-dashed border-gray-200 text-xs text-gray-400 font-bold'>${jumpDiffs.join('  ')}</div>`;
                    }
                }

                const parsedText = parseText(nextEvent.正文, nextChar, prev.currentTurn, newCharacters, nextVariables) + jumpEffectHtml;
                newLogs.push({
                    turn: prev.currentTurn,
                    characterName: nextChar.名称,
                    text: parsedText,
                    type: 'event',
                    isImportant: !!nextEvent.标题
                });

                if (hasOptions) {
                    remainingEvents = [{ 
                        characterId, 
                        event: nextEvent,
                        variables: nextVariables 
                    }, ...remainingEvents];
                }
            }
        }

        // --- CHECK IF THIS WAS AN ENDING ---
        if (currentEventItem.event.标签组?.includes('结局')) {
             return {
                ...prev,
                characters: newCharacters,
                logs: newLogs,
                pendingEvents: [],
                gamePhase: 'gameover'
            };
        }

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
            
            // --- MID-GAME ENDING CHECK (Negative Basic Stats) ---
            // Check all characters in team for negative BASIC attributes (Con, Int, Chr, Wealth)
            // Survival attributes (HP, Mood) are now clamped at 0.
            for (const char of prev.characters) {
                if (!char.inTeam) continue;
                
                let badEndId: string | null = null;
                // Survival check: Constitution, Intelligence, Charm, Wealth
                if (char.通用属性.体质 < 0) badEndId = 'ending_low_con';
                else if (char.通用属性.学识 < 0) badEndId = 'ending_low_int';
                else if (char.通用属性.魅力 < 0) badEndId = 'ending_low_chr';
                else if (char.通用属性.财富 < 0) badEndId = 'ending_low_wealth';

                if (badEndId) {
                    const endEvent = ENDING_EVENTS.find(e => e.id === badEndId);
                    if (endEvent) {
                        return triggerCharacterEvent(newState, char.instanceId, endEvent);
                    }
                }
            }

            const nextTurn = prev.currentTurn + 1;
            
            // --- ENDING CHECK (MAX TURNS) ---
            if (nextTurn > prev.maxTurns) {
                 newState.currentTurn = nextTurn;
                 const endingEvent = ENDING_EVENTS.find(e => checkCondition(e.触发条件, prev.characters[0], nextTurn, undefined, prev.characters));
                 
                 if (endingEvent) {
                     return triggerCharacterEvent(newState, 'p1', endingEvent);
                 } else {
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
                    // We need to parse text here too technically, but handleOptionSelect will re-parse for log
                    // However, we need the raw text to match what's on screen if we want accuracy.
                    // But handleOptionSelect takes index, the text is for logging.
                    const rawText = gameState.pendingEvents[0].event.选项组[key-1].显示文本;
                    handleOptionSelect(key - 1, rawText);
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

  const parsedModalText = currentPendingEvent?.parsedText 
    ? currentPendingEvent.parsedText
    : (currentPendingEvent && currentPendingChar
        ? parseText(currentPendingEvent.event.正文, currentPendingChar, gameState.currentTurn, gameState.characters, currentPendingEvent.variables)
        : undefined);

  const parsedModalTitle = currentPendingEvent?.parsedTitle
    ? currentPendingEvent.parsedTitle
    : (currentPendingEvent && currentPendingChar && currentPendingEvent.event.标题
        ? parseText(currentPendingEvent.event.标题, currentPendingChar, gameState.currentTurn, gameState.characters, currentPendingEvent.variables)
        : undefined);

  const hasPendingActions = gameState.currentTurnQueue.length > 0;
  const teamCharacters = gameState.characters.filter(c => c.inTeam);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-white">
        
        <div className="md:hidden flex-shrink-0 bg-white border-b border-gray-200 p-3 shadow-sm flex justify-center items-center z-20 relative">
             <div className="px-4 py-1 rounded-full border border-green-400 bg-green-50">
                <span className="font-bold text-green-700 text-base">{getTurnDate(gameState.currentTurn)}</span>
             </div>
             <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-mono">v0.1.251230b</div>
        </div>

        <div className="hidden md:flex md:w-96 flex-shrink-0 h-full z-10">
            <Sidebar 
                characters={teamCharacters} 
                onTagClick={setActiveTag}
            />
        </div>

        <div className="flex-1 flex flex-col h-full relative overflow-hidden">
            <div className="hidden md:flex p-4 border-b bg-white shadow-sm justify-between items-center z-20 flex-shrink-0">
                <h1 className="text-xl font-bold text-gray-800">怪文书模拟器</h1>
                <span className="text-xs text-gray-400 font-mono select-none">v0.1.251230b</span>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col w-full">
                <div className="md:hidden flex-shrink-0">
                     <MobileCharacterList 
                        characters={teamCharacters} 
                        onTagClick={setActiveTag}
                     />
                </div>
                <EventLog logs={gameState.logs} />
            </div>

            <div className="h-16 md:h-24 flex-shrink-0"></div>
        </div>

        <EventModal 
            isOpen={!!currentPendingEvent} 
            event={currentPendingEvent?.event} 
            characterName={currentPendingChar?.名称 || ''}
            parsedTitle={parsedModalTitle}
            parsedText={parsedModalText}
            variables={currentPendingEvent?.variables}
            characters={gameState.characters}
            currentTurn={gameState.currentTurn}
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
