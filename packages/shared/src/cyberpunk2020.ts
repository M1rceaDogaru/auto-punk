import type {
  AIPersona,
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

/** The attribute governing each skill for pool calculation (CP2020). */
export const SKILL_ATTRIBUTES: Record<string, AttributeKey> = {
  Guns: 'cool',
  Melee: 'body',
  Throwing: 'reflexes',
  Athletics: 'body',
  Driving: 'reflexes',
  Stealth: 'reflexes',
  Streetwise: 'empathy',
  Barter: 'intelligence',
  Oratory: 'cool',
  Persuasion: 'cool',
  Psychology: 'intelligence',
  Computer: 'tech',
  Cyberdeck: 'tech',
  Electronics: 'tech',
  'First Aid': 'empathy',
  Medicine: 'intelligence',
  Repair: 'tech',
  'Security Systems': 'reflexes',
};

/** Max dice pool for a skill test = governing attribute + skill rating (CP2020). */
export function maxSkillPool(character: Pick<Character, 'attributes' | 'skills'>, skillName: string): number {
  const rating = character.skills[skillName] ?? 0;
  const attrKey = SKILL_ATTRIBUTES[skillName];
  if (!attrKey) return Math.min(rating, MAX_SKILL);
  return (character.attributes[attrKey] ?? 0) + rating;
}

/** Total skill points a character may spend across all skills (CP2020). */
export const SKILL_POINT_BUDGET = 45;

/** Ready-made personas the host can add as AI players (classic CP2020 archetypes). */
export const AI_PERSONA_PRESETS: AIPersona[] = [
  {
    archetype: 'Solo',
    personality: 'Cold, professional mercenary. Allergic to risk and sloppy work.',
    goals: ['Get paid no matter what', 'Stay out of the corporate spotlight'],
    secrets: ['Owes a fixer a dangerous favor'],
  },
  {
    archetype: 'Netrunner',
    personality: 'Wired-in and half in the matrix; socially awkward offline.',
    goals: ['Crack the biggest corp ICE ever built', 'Protect their deck at all costs'],
    secrets: ["Their handle is wanted by a megacorp's black-ops team"],
  },
  {
    archetype: 'Rockerboy',
    personality: 'Charismatic performer who believes music can wake up Night City.',
    goals: ['Get their album heard beyond the streets', 'Keep the band together'],
    secrets: ["They've been selling fan data to a corp for cash"],
  },
  {
    archetype: 'Medtech',
    personality: 'Calm, scrupulous healer who hates waste — of bodies or bullets.',
    goals: ['Keep their clinic running', 'Prove cyberware can be humane'],
    secrets: ['They once turned away a patient they could have saved'],
  },
  {
    archetype: 'Corpo',
    personality: 'Polished, ambitious, and always calculating the ROI on every relationship.',
    goals: ['Climb one more rung at the corp', 'Never be seen losing composure'],
    secrets: ["They've been embezzling from their own division"],
  },
  {
    archetype: 'Fixer',
    personality: 'Knows everyone, owes no one — or so they claim.',
    goals: ['Keep every deal alive', 'Stay above the street level'],
    secrets: ['Their most trusted contact is a corp asset'],
  },
];

const MIN_ATTR = 1;
const MAX_ATTR = 6;
const MIN_SKILL = 0;
const MAX_SKILL = 6;

function clampInt(n: number, min: number, max: number): number {
  const v = Math.round(Number.isFinite(n) ? n : min);
  return Math.max(min, Math.min(max, v));
}

/** Reduce ratings (highest first, ties by insertion order) until the total fits SKILL_POINT_BUDGET. */
function fitSkillBudget(skills: Record<string, number>): void {
  let total = Object.values(skills).reduce((a, b) => a + b, 0);
  while (total > SKILL_POINT_BUDGET) {
    let topKey: string | null = null;
    for (const [k, v] of Object.entries(skills)) {
      if (v <= 0) continue;
      if (topKey === null || v > skills[topKey]) topKey = k;
    }
    if (topKey === null) break;
    skills[topKey] -= 1;
    total -= 1;
  }
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
  fitSkillBudget(skills);

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
