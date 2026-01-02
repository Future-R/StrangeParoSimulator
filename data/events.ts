
import { GameEvent } from '../types';
import { SYSTEM_EVENTS } from './events/system';
import { RELATIONSHIP_EVENTS } from './events/relationship';
import { NARRATIVE_EVENTS } from './events/narrative';
import { CHARACTER_EVENTS } from './events/character';
import { SEASONAL_EVENTS } from './events/seasonal';
import { ENDING_EVENTS } from './events/endings';
import { TEIO_BASEMENT_EVENTS } from './events/teio_basement';

// ===========================
// 事件聚合 (Events Aggregation)
// ===========================

export const EVENTS: GameEvent[] = [
  ...SEASONAL_EVENTS, 
  ...RELATIONSHIP_EVENTS,
  ...CHARACTER_EVENTS,
  ...NARRATIVE_EVENTS,
  ...SYSTEM_EVENTS,
  ...TEIO_BASEMENT_EVENTS, // New Teio Route
];

export { ENDING_EVENTS };
