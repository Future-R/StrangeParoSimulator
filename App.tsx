
import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { EventLog } from './components/EventLog';
import { GameControls } from './components/GameControls';
import { EventModal } from './components/EventModal';
import { TagModal } from './components/TagModal';
import { SetupScreen } from './components/SetupScreen';
import { MobileCharacterList } from './components/MobileCharacterList';
import { GameState, RuntimeCharacter, LogEntry, TagTemplate, RuntimeTag, Relationship } from './types';
import { createRuntimeCharacter, triggerCharacterEvent, resolvePendingEvent, getTurnDate, parseText, checkCondition, getAvailableStartTags } from './services/engine';
import { CHARACTERS, EVENTS, ENDING_EVENTS, TAGS } from './constants';

const INITIAL_MAX_TURNS = 72;

// Add global type declaration
declare global {
  interface Window {
    GameDebug: GameState;
    printRelations: (subjectId?: string) => void;
  }
}

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
  const [activeTagData, setActiveTagData] = useState<{ tag: TagTemplate, targetNames?: string[] } | null>(null);

  useEffect(() => {
    // Debuggers
    // @ts-ignore
    window.GameDebug = gameState;

    window.printRelations = (subjectId: string = 'p1') => {
        const subject = gameState.characters.find(c => c.instanceId === subjectId);
        if (!subject) {
            console.error(`Character with ID ${subjectId} not found.`);
            return;
        }

        const data = gameState.characters
            .filter(c => c.instanceId !== subjectId)
            .map(target => {
                const relTo = subject.关系列表[target.instanceId] || { 友情: 0, 爱情: 0 };
                const relFrom = target.关系列表[subject.instanceId] || { 友情: 0, 爱情: 0 };
                return {
                    '角色名': target.名称,
                    'ID': target.instanceId,
                    '我对TA(友情)': relTo.友情,
                    '我对TA(爱情)': relTo.爱情,
                    'TA对我(友情)': relFrom.友情,
                    'TA对我(爱情)': relFrom.爱情,
                };
            });
        
        console.log(`=== 【${subject.名称}】的人际关系表 ===`);
        console.table(data);
    };

  }, [gameState]);

  const handleTagClick = (runtimeTag: RuntimeTag) => {
      const template = TAGS[runtimeTag.templateId];
      if (!template) return;
      
      let targetNames: string[] = [];
      if (runtimeTag.targets && runtimeTag.targets.length > 0) {
          targetNames = runtimeTag.targets.map(tid => {
              const c = gameState.characters.find(char => char.instanceId === tid);
              return c ? c.名称 : '未知';
          });
      }
      setActiveTagData({ tag: template, targetNames });
  };

  const handleSetupComplete = (name: string, gender: '男'|'女', selectedTags: string[], starterId?: string) => {
      const umaKeys = ['优秀素质', '东海帝王', '摩耶重炮', '米浴', '北部玄驹', '无声铃鹿'];
      // If starterId is provided (Dev Mode), use it. Otherwise pick random.
      const chosenUmaKey = starterId || umaKeys[Math.floor(Math.random() * umaKeys.length)];

      // --- Logic for '变化万千' Trait ---
      let finalTags = [...selectedTags];
      if (finalTags.includes('变化万千')) {
          // 1. Remove the trait itself
          finalTags = finalTags.filter(t => t !== '变化万千');
          
          const allPool = getAvailableStartTags();
          
          // 2. Loop twice to add 2 random traits
          for (let i = 0; i < 2; i++) {
               // Filter pool for valid tags:
               // - Not already selected
               // - Not '变化万千'
               // - Not mutually exclusive with ANY current tag
               const validPool = allPool.filter(t => {
                   if (finalTags.includes(t.id)) return false;
                   if (t.id === '变化万千') return false;
                   
                   // Check forward mutex (Existing blocks New)
                   const isBlockedByCurrent = finalTags.some(existingId => {
                       const existingTag = TAGS[existingId];
                       return existingTag?.互斥标签?.includes(t.id);
                   });
                   if (isBlockedByCurrent) return false;

                   // Check backward mutex (New blocks Existing)
                   const blocksCurrent = t.互斥标签?.some(blockedId => finalTags.includes(blockedId));
                   if (blocksCurrent) return false;

                   return true;
               });

               if (validPool.length === 0) break;

               // Weighted Random Selection
               let totalWeight = validPool.reduce((sum, t) => sum + (5 - t.稀有度), 0);
               let r = Math.random() * totalWeight;
               let selected = validPool[validPool.length - 1];
               
               for (const t of validPool) {
                   const weight = 5 - t.稀有度;
                   r -= weight;
                   if (r <= 0) {
                       selected = t;
                       break;
                   }
               }
               finalTags.push(selected.id);
          }
      }

      const allCharacters: RuntimeCharacter[] = [];
      const trainer = createRuntimeCharacter(CHARACTERS['训练员'], 'p1', true, name, gender, finalTags);
      allCharacters.push(trainer);

      Object.values(CHARACTERS).forEach(tpl => {
          if (tpl.id === '训练员') return;
          const isStarter = tpl.id === chosenUmaKey;
          const instanceId = isStarter ? 'c1' : `npc_${tpl.id}`;
          const char = createRuntimeCharacter(tpl, instanceId, isStarter); 
          allCharacters.push(char);
      });

      const starterUma = allCharacters.find(c => c.instanceId === 'c1');
      allCharacters.forEach(char => {
          const tpl = CHARACTERS[char.templateId];
          if (tpl && tpl.初始标签附带对象) {
              Object.entries(tpl.初始标签附带对象).forEach(([tagId, targetTplIds]) => {
                  const tag = char.标签组.find(t => t.templateId === tagId);
                  if (tag) {
                      const resolvedTargets: string[] = [];
                      targetTplIds.forEach(tTplId => {
                          const targetChar = allCharacters.find(c => c.templateId === tTplId);
                          if (targetChar) resolvedTargets.push(targetChar.instanceId);
                      });
                      tag.targets = resolvedTargets;
                  }
              });
          }
      });

      const starterQueue = allCharacters.filter(c => c.inTeam).map(c => c.instanceId);

      setGameState({
          gamePhase: 'playing',
          currentTurn: 1, 
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

  // Simplified using resolvePendingEvent from engine
  const handleOptionSelect = useCallback((optionIndex: number, displayText: string) => {
    setGameState(prev => resolvePendingEvent(prev, optionIndex));
  }, []); 

  const handleNextTurn = useCallback(() => {
    setGameState(prev => {
        if (prev.gamePhase === 'gameover' || prev.pendingEvents.length > 0) return prev;

        let newState = { ...prev };
        let nextQueue = [...prev.currentTurnQueue];

        if (nextQueue.length === 0) {
            // Bad Ending Check
            for (const char of prev.characters) {
                if (!char.inTeam) continue;
                let badEndId: string | null = null;
                if (char.通用属性.体质 < 0) badEndId = 'ending_low_con';
                else if (char.通用属性.学识 < 0) badEndId = 'ending_low_int';
                else if (char.通用属性.魅力 < 0) badEndId = 'ending_low_chr';
                else if (char.通用属性.财富 < 0) badEndId = 'ending_low_wealth';

                if (badEndId) {
                    const endEvent = ENDING_EVENTS.find(e => e.id === badEndId);
                    if (endEvent) return triggerCharacterEvent(newState, char.instanceId, endEvent);
                }
            }

            const nextTurn = prev.currentTurn + 1;
            
            // Max Turn Ending
            if (nextTurn > prev.maxTurns) {
                 newState.currentTurn = nextTurn;
                 const endingEvent = ENDING_EVENTS.find(e => checkCondition(e.触发条件, prev.characters[0], nextTurn, undefined, prev.characters));
                 if (endingEvent) return triggerCharacterEvent(newState, 'p1', endingEvent);
                 return { ...prev, gamePhase: 'gameover', isAuto: false };
            }
            
            newState.currentTurn = nextTurn;
            newState.logs = [...prev.logs, {
                turn: nextTurn,
                characterName: '系统',
                text: `=== ${getTurnDate(nextTurn)} ===`,
                type: 'system'
            }];
            
            // Turn Passives
            newState.characters.forEach(c => {
                if (c.标签组.some(t => t.templateId === '好色')) c.通用属性.爱欲 = Math.min(100, c.通用属性.爱欲 + 2);

                const admirationTag = c.标签组.find(t => t.templateId === '憧憬');
                if (admirationTag && admirationTag.targets) {
                    admirationTag.targets.forEach(targetId => {
                        if (!c.关系列表[targetId]) c.关系列表[targetId] = { 友情: 0, 爱情: 0 };
                        c.关系列表[targetId].友情 = Math.min(100, c.关系列表[targetId].友情 + 2);
                    });
                }
                const goodAtTrainingIndex = c.标签组.findIndex(t => t.templateId === '擅长训练');
                if (goodAtTrainingIndex !== -1) {
                    c.标签组[goodAtTrainingIndex].层数 -= 1;
                    if (c.标签组[goodAtTrainingIndex].层数 <= 0) c.标签组.splice(goodAtTrainingIndex, 1);
                }
            });

            // Regenerate Queue based on LATEST inTeam status
            // This ensures characters who joined in the previous turn (and had inTeam set to true) are included.
            nextQueue = prev.characters.filter(c => c.inTeam).map(c => c.instanceId);
        }

        const targetId = nextQueue.shift();
        newState.currentTurnQueue = nextQueue;
        
        if (targetId) return triggerCharacterEvent(newState, targetId);
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
                    handleOptionSelect(key - 1, "");
                }
            }
            return;
        }

        if (e.code === 'Space' || e.code === 'Enter') {
            e.preventDefault(); 
            if (gameState.gamePhase === 'gameover') restartGame();
            else handleNextTurn();
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

  // Since we pre-calculate in engine, we can use it directly, fallback to on-the-fly parsing
  const parsedModalText = currentPendingEvent?.parsedText;
  const parsedModalTitle = currentPendingEvent?.parsedTitle;

  const hasPendingActions = gameState.currentTurnQueue.length > 0;
  
  // Sort characters for display: P1 first, then by recruitedAt
  const teamCharacters = gameState.characters
    .filter(c => c.inTeam)
    .sort((a, b) => {
        // P1 always first
        if (a.instanceId === 'p1') return -1;
        if (b.instanceId === 'p1') return 1;
        
        // Sort by recruitedAt (0 for starters, Turn# for new)
        const ra = a.recruitedAt ?? 0;
        const rb = b.recruitedAt ?? 0;
        if (ra !== rb) return ra - rb;
        
        // Stable sort fallback
        return a.instanceId.localeCompare(b.instanceId);
    });

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-white">
        
        <div className="md:hidden flex-shrink-0 bg-white border-b border-gray-200 p-3 shadow-sm flex justify-center items-center z-20 relative">
             <div className="px-4 py-1 rounded-full border border-green-400 bg-green-50">
                <span className="font-bold text-green-700 text-base">{getTurnDate(gameState.currentTurn)}</span>
             </div>
             <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-mono">v0.1.260102a</div>
        </div>

        <div className="hidden md:flex md:w-96 flex-shrink-0 h-full z-10">
            <Sidebar 
                characters={teamCharacters} 
                onTagClick={handleTagClick}
            />
        </div>

        <div className="flex-1 flex flex-col h-full relative overflow-hidden">
            <div className="hidden md:flex p-4 border-b bg-white shadow-sm justify-between items-center z-20 flex-shrink-0">
                <h1 className="text-xl font-bold text-gray-800">怪文书模拟器</h1>
                <span className="text-xs text-gray-400 font-mono select-none">v0.1.260102a</span>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col w-full">
                <div className="md:hidden flex-shrink-0">
                     <MobileCharacterList 
                        characters={teamCharacters} 
                        onTagClick={handleTagClick}
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
            isOpen={!!activeTagData}
            tag={activeTagData?.tag || null}
            targetNames={activeTagData?.targetNames}
            onClose={() => setActiveTagData(null)}
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
