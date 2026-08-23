import type {
  AttributeKey,
  Character,
  CreateCharacterContext,
  GameId,
  NewCharacterInput,
  SkillCategory,
} from './types.js';
import {
  ATTRIBUTE_KEYS,
  CYBERPUNK_2020_ID,
  SKILL_CATEGORIES,
  createCyberpunkCharacter,
} from './cyberpunk2020.js';

/** A pluggable RPG rules system. v1 ships only Cyberpunk 2020. */
export interface GameSystem {
  id: GameId;
  name: string;
  attributeKeys: AttributeKey[];
  skillCategories: SkillCategory[];
  createCharacter(input: NewCharacterInput, ctx: CreateCharacterContext): Character;
}

export const cyberpunk2020System: GameSystem = {
  id: CYBERPUNK_2020_ID,
  name: 'Cyberpunk 2020',
  attributeKeys: ATTRIBUTE_KEYS,
  skillCategories: SKILL_CATEGORIES,
  createCharacter: (input, ctx) => createCyberpunkCharacter(input, ctx),
};

export const GAME_SYSTEMS: Record<GameId, GameSystem> = {
  [CYBERPUNK_2020_ID]: cyberpunk2020System,
};

export function getGameSystem(id: GameId): GameSystem {
  const system = GAME_SYSTEMS[id];
  if (!system) throw new Error(`Unknown game system: ${id}`);
  return system;
}
