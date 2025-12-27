
import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { EventLog } from './components/EventLog';
import { GameControls } from './components/GameControls';
import { EventModal } from './components/EventModal';
import { SetupScreen } from './components/SetupScreen';
import { GameState, RuntimeCharacter, LogEntry } from './types';
import { createRuntimeCharacter, triggerCharacterEvent, executeAction, checkCondition, getTurnDate, parseText } from './services/engine';
import { CHARACTERS, EVENTS } from './constants';

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

  // DEBUG: Expose state to console
  useEffect(() => {
    // @ts-ignore
    window.GameDebug = gameState;
  }, [gameState]);

  const handleSetupComplete = (name: string, gender: '男'|'女', selectedTags: string[]) => {
      const trainer = createRuntimeCharacter(CHARACTERS['训练员'], 'p1', name, gender, selectedTags);
      const umaKeys = ['优秀素质', '东海帝王', '摩耶重炮', '米浴'];
      const randomKey = umaKeys[Math.floor(Math.random() * umaKeys.length)];
      const uma = createRuntimeCharacter(CHARACTERS[randomKey], 'c1');

      setGameState({
          gamePhase: 'playing',
          currentTurn: 0,
          maxTurns: INITIAL_MAX_TURNS,
          characters: [trainer, uma],
          logs: [{
              turn: 0,
              characterName: '系统',
              text: `欢迎来到特雷森学园，${name}！`,
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
        const option = event.选项组?.[optionIndex];
        if (!option) return prev;

        const charIndex = prev.characters.findIndex(c => c.instanceId === characterId);
        if (charIndex === -1) return prev;

        // Clone characters completely because executeAction might modify other characters via variables
        const newCharacters = JSON.parse(JSON.stringify(prev.characters)) as RuntimeCharacter[];
        const char = newCharacters[charIndex];
        
        // 1. 执行选项操作
        const { logs: resultLogs } = executeAction(option.操作指令, char, prev.currentTurn, newCharacters, variables);

        // 2. 核心增强：执行选项后的逻辑分支 (Branching)
        let extraLogs: string[] = [];
        let jumpId: string | undefined = undefined;
        if (event.分支组) {
            for (const branch of event.分支组) {
                // UPDATE: Passed prev.currentTurn to checkCondition
                if (checkCondition(branch.判别式, char, prev.currentTurn, optionIndex + 1, newCharacters, variables)) {
                    const bRes = executeAction(branch.操作指令, char, prev.currentTurn, newCharacters, variables);
                    extraLogs.push(...bRes.logs);
                    if (bRes.nextEventId) jumpId = bRes.nextEventId;
                    if (branch.跳转事件ID) jumpId = branch.跳转事件ID;
                    break;
                }
            }
        }

        const newLogs = [...prev.logs];
        const combinedEffects = [...resultLogs, ...extraLogs];
        const effectHtml = combinedEffects.length > 0 
            ? `<div class='mt-1 text-xs font-bold text-gray-500'>(${combinedEffects.join(', ')})</div>`
            : "";
        
        // UPDATE: Passed prev.currentTurn to parseText
        const parsedDisplayText = parseText(displayText, char, prev.currentTurn, newCharacters, variables);

        newLogs.push({
            turn: prev.currentTurn,
            characterName: char.名称,
            text: `选择了【${parsedDisplayText}】${effectHtml}`,
            type: 'choice'
        });

        let remainingEvents = prev.pendingEvents.slice(1);
        if (jumpId) {
            const nextEvent = EVENTS.find(e => e.id === jumpId);
            if (nextEvent) {
                remainingEvents = [{ 
                    characterId, 
                    event: nextEvent,
                    variables: variables 
                }, ...remainingEvents];
            }
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

        if (nextQueue.length === 0) {
            const nextTurn = prev.currentTurn + 1;
            if (nextTurn > prev.maxTurns) return { ...prev, gamePhase: 'gameover', isAuto: false };
            
            newState.currentTurn = nextTurn;
            newState.logs = [...prev.logs, {
                turn: nextTurn,
                characterName: '系统',
                text: `=== ${getTurnDate(nextTurn)} ===`,
                type: 'system'
            }];
            nextQueue = prev.characters.map(c => c.instanceId);
        }

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

  // UPDATE: Passed gameState.currentTurn to parseText
  const parsedModalText = currentPendingEvent && currentPendingChar
    ? parseText(currentPendingEvent.event.正文, currentPendingChar, gameState.currentTurn, gameState.characters, currentPendingEvent.variables)
    : undefined;

  const parsedModalTitle = currentPendingEvent && currentPendingChar && currentPendingEvent.event.标题
    ? parseText(currentPendingEvent.event.标题, currentPendingChar, gameState.currentTurn, gameState.characters, currentPendingEvent.variables)
    : undefined;

  const hasPendingActions = gameState.currentTurnQueue.length > 0;

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-white">
        <Sidebar characters={gameState.characters} />
        <div className="flex-1 flex flex-col h-full relative">
            <div className="p-4 border-b bg-white shadow-sm flex justify-between items-center z-20">
                <h1 className="text-xl font-bold text-gray-800">怪文书模拟器</h1>
                <div className="text-xs text-gray-500">Ver 0.6.3</div>
            </div>
            <EventLog logs={gameState.logs} />
            <div className="h-24"></div>
        </div>
        <EventModal 
            isOpen={!!currentPendingEvent} 
            event={currentPendingEvent?.event} 
            characterName={currentPendingChar?.名称 || ''}
            parsedTitle={parsedModalTitle}
            parsedText={parsedModalText}
            onSelectOption={handleOptionSelect}
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
