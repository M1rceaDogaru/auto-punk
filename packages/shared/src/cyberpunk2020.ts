import type {
  AttributeKey,
  Attributes,
  Character,
  CreateCharacterContext,
  GameId,
  NewCharacterInput,
  SkillCategory,
} from './types.js';

export const CYBERPUNK_2020_ID: GameId = 'cyberpunk2020';

export const ATTRIBUTE_KEYS: AttributeKey[] = [
  'body',
  'cool',
  'intelligence',
  'reflexes',
  'tech',
  'empathy',
];

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  body: 'Body',
  cool: 'Cool',
  intelligence: 'Intelligence',
  reflexes: 'Reflexes',
  tech: 'Tech',
  empathy: 'Empathy',
};

/** Representative Cyberpunk 2020 skill set (extensible). */
export const SKILL_CATEGORIES: SkillCategory[] = [
  { category: 'Combat', skills: ['Guns', 'Melee', 'Throwing'] },
  { category: 'Physical', skills: ['Athletics', 'Driving', 'Stealth', 'Streetwise'] },
  { category: 'Social', skills: ['Barter', 'Oratory', 'Persuasion', 'Psychology'] },
  {
    category: 'Technical',
    skills: [
      'Computer',
      'Cyberdeck',
      'Electronics',
      'First Aid',
      'Medicine',
      'Repair',
      'Security Systems',
    ],
  },
];

export const ALL_SKILLS: string[] = SKILL_CATEGORIES.flatMap((c) => c.skills);

const MIN_ATTR = 1;
const MAX_ATTR = 7;
const MIN_SKILL = 0;
const MAX_SKILL = 6;

function clampInt(n: number, min: number, max: number): number {
  const v = Math.round(Number.isFinite(n) ? n : min);
  return Math.max(min, Math.min(max, v));
}

export function emptyAttributes(): Attributes {
  return { body: 3, cool: 3, intelligence: 3, reflexes: 3, tech: 3, empathy: 3 };
}

/** Derived stats from the CP2020 core rules. */
export function deriveStats(attributes: Attributes): { hpMax: number; soak: number; move: number } {
  const body = clampInt(attributes.body, MIN_ATTR, MAX_ATTR);
  return {
    hpMax: body + 5,
    soak: Math.floor(body / 2),
    move: 3 + (attributes.reflexes >= 4 ? 1 : 0),
  };
}

/** Validate a character input and produce a fully-derived Character. */
export function createCyberpunkCharacter(input: NewCharacterInput, ctx: CreateCharacterContext): Character {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('Character name is required');

  const attributes = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) {
    attributes[key] = clampInt(input.attributes?.[key] ?? 3, MIN_ATTR, MAX_ATTR);
  }

  const skills: Record<string, number> = {};
  for (const [skill, rating] of Object.entries(input.skills ?? {})) {
    if (!skill.trim()) continue;
    skills[skill.trim()] = clampInt(rating ?? 0, MIN_SKILL, MAX_SKILL);
  }

  const edgePool = clampInt(input.edgePool ?? 3, 0, 12);
  const eddRaw = typeof input.edd === 'number' && Number.isFinite(input.edd) ? input.edd : 500;
  const edd = Math.max(0, Math.round(eddRaw));
  const { hpMax, soak, move } = deriveStats(attributes);

  return {
    id: ctx.id(),
    roomId: ctx.roomId,
    playerId: ctx.playerId,
    name,
    gameId: CYBERPUNK_2020_ID,
    attributes,
    skills,
    edgePool,
    hp: { current: hpMax, max: hpMax },
    soak,
    move,
    edd,
    cyberware: [...(input.cyberware ?? [])],
    gear: [...(input.gear ?? [])],
  };
}
