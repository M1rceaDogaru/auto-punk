import type { ChatMessage } from './llmClient.js';
import type { Character, DeclaredAction, DiceRollResult, GameEvent, StateChange } from '@auto-punk/shared';
import { SKILL_POINT_BUDGET, rollSucceeded } from '@auto-punk/shared';

// ---- Output shapes (validated by the caller via chatJSON) -----------------

export interface GmOpeningOutput {
  narration: string;
}

export interface GmResolutionOutput {
  narration: string;
  stateChanges?: StateChange[];
  combat?: { participants: string[]; reason: string } | null;
  endGame?: boolean;
}

export interface AiActionOutput {
  intent: string;
  skillUsed?: string | null;
  dicePool?: number | null;
}

const VALID_FIELDS = new Set(['hp.current', 'edgePool', 'edd']);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function validateGmOpening(parsed: unknown): GmOpeningOutput {
  const o = parsed as Record<string, unknown>;
  if (!o || !isNonEmptyString(o.narration)) throw new Error('narration must be a non-empty string');
  return { narration: o.narration };
}

export function validateGmResolution(parsed: unknown): GmResolutionOutput {
  const o = parsed as Record<string, unknown>;
  if (!o || !isNonEmptyString(o.narration)) throw new Error('narration must be a non-empty string');
  const out: GmResolutionOutput = { narration: o.narration };

  if (Array.isArray(o.stateChanges)) {
    out.stateChanges = (o.stateChanges as unknown[]).map((sc) => {
      const c = sc as Record<string, unknown>;
      if (!c || typeof c.characterId !== 'string' || typeof c.field !== 'string') {
        throw new Error('stateChange must have characterId and field');
      }
      if (!VALID_FIELDS.has(c.field)) throw new Error(`invalid stateChange field: ${c.field}`);
      const change: StateChange = { characterId: c.characterId, field: c.field as StateChange['field'] };
      if (typeof c.delta === 'number') change.delta = c.delta;
      else if (typeof c.value === 'number') change.value = c.value;
      else throw new Error('stateChange must have a numeric delta or value');
      return change;
    });
  }

  if (o.combat && typeof o.combat === 'object') {
    const cbt = o.combat as Record<string, unknown>;
    if (!Array.isArray(cbt.participants)) throw new Error('combat.participants must be an array');
    out.combat = { participants: cbt.participants.map(String), reason: String(cbt.reason ?? '') };
  } else {
    out.combat = null;
  }

  out.endGame = o.endGame === true;
  return out;
}

export function validateAiAction(parsed: unknown): AiActionOutput {
  const o = parsed as Record<string, unknown>;
  if (!o || !isNonEmptyString(o.intent)) throw new Error('intent must be a non-empty string');
  return {
    intent: o.intent,
    skillUsed: typeof o.skillUsed === 'string' && o.skillUsed ? o.skillUsed : null,
    dicePool: typeof o.dicePool === 'number' ? Math.max(0, Math.floor(o.dicePool)) : null,
  };
}

// ---- Context formatting ----------------------------------------------------

function formatCharacter(c: Character): string {
  const a = c.attributes;
  const skills = Object.entries(c.skills)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}${v}`)
    .join(', ');
  const persona = c.persona
    ? ` | persona: ${c.persona.archetype}; goals: ${c.persona.goals.join('; ') || 'n/a'}; secrets: ${c.persona.secrets.join('; ') || 'n/a'}`
    : '';
  return `${c.name} [HP ${c.hp.current}/${c.hp.max}, Soak ${c.soak}, Edge ${c.edgePool}] attrs B${a.body}/C${a.cool}/I${a.intelligence}/R${a.reflexes}/T${a.tech}/E${a.empathy}${skills ? ` | skills: ${skills}` : ''}${persona}`;
}

export function formatCharacters(characters: Character[]): string {
  if (characters.length === 0) return '(no characters yet)';
  return characters.map(formatCharacter).join('\n');
}

function shortEvent(e: GameEvent): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.type) {
    case 'scene':
    case 'gm_resolution':
      return `GM: ${String(p.narration ?? '').slice(0, 400)}`;
    case 'action_declared':
      return `${p.characterName}: ${p.intent}${p.skillUsed ? ` [${p.skillUsed}]` : ''}`;
    case 'dice_roll': {
      const r = p as unknown as DiceRollResult & { succeeded?: boolean };
      return `ROLL ${r.label}: pool ${r.pool}, ${r.successes} success${r.successes === 1 ? '' : 'es'}${r.fumble ? ', FUMBLE' : ''}`;
    }
    case 'combat_start':
      return `COMBAT begins: ${(p.participants as string[]).join(', ')}`;
    case 'state_change':
      return `${p.characterName} ${p.field} ${p.delta !== undefined ? `by ${p.delta}` : `= ${p.value}`}`;
    default:
      return e.type;
  }
}

export function formatEvents(events: GameEvent[], limit = 40): string {
  const recent = events.slice(-limit);
  if (recent.length === 0) return '(no history yet)';
  return recent.map((e) => `#${e.seq} ${shortEvent(e)}`).join('\n');
}

/** name -> id map so the model can reference characters by stable id in stateChanges. */
export function formatIdMap(characters: Character[]): string {
  if (characters.length === 0) return '(none)';
  return characters.map((c) => `${c.name}=${c.id}`).join(', ');
}

// ---- Prompt builders -------------------------------------------------------

const GM_SYSTEM = `You are the AI Game Master for a Cyberpunk 2020 tabletop RPG played in a browser by a mix of human and AI players. You narrate a gritty, neon-soaked cyberpunk story set in Night City. You control the world, NPCs, and consequences; you NEVER speak or act for the player characters — they declare their own actions. Keep narration vivid but concise (a few short paragraphs). When skill tests occur, the dice are rolled by the system and handed to you as results: narrate outcomes strictly consistent with those results and never invent roll outcomes yourself. Always respond with ONLY valid JSON.`;

export function buildOpeningMessages(args: {
  worldSummary: string;
  characters: Character[];
}): ChatMessage[] {
  const user = `Begin the game. Set an evocative opening scene that introduces the location, mood, and a clear hook or inciting incident for these characters to react to. End by prompting them for what they do next.

CHARACTERS:
${formatCharacters(args.characters)}

Respond with JSON: {"narration": string}`;
  return [
    { role: 'system', content: GM_SYSTEM },
    { role: 'user', content: user },
  ];
}

export function buildResolutionMessages(args: {
  worldSummary: string;
  scene: string;
  characters: Character[];
  events: GameEvent[];
  actions: DeclaredAction[];
  rolls: DiceRollResult[];
}): ChatMessage[] {
  const actionLines = args.actions.length
    ? args.actions.map((a) => `- ${a.characterName}: ${a.intent}${a.skillUsed ? ` (skill: ${a.skillUsed})` : ''}`).join('\n')
    : '(no actions declared this round)';

  const rollLines = args.rolls.length
    ? args.rolls.map((r) => `- ${r.label}: pool ${r.pool}, dice [${r.dice.join(',')}], ${r.successes} success(es), fumble=${r.fumble}, succeeded=${rollSucceeded(r)}`).join('\n')
    : '(no rolls this round)';

  const user = `Resolve the current round. The players declared these actions; here are the dice results for any skill tests. Narrate what happens as a consequence, advance the story, and end by prompting the players for their next move. Apply state changes only when justified (damage reduces hp.current via a negative delta; spending edge reduces edgePool; cash changes edd). If a fight breaks out, set combat with the participating character names. Set endGame=true only if the session is conclusively over.

WORLD SUMMARY:
${args.worldSummary || '(none yet)'}

CURRENT SCENE:
${args.scene}

CHARACTERS (id map for stateChanges): ${formatIdMap(args.characters)}
${formatCharacters(args.characters)}

RECENT HISTORY:
${formatEvents(args.events)}

ACTIONS THIS ROUND:
${actionLines}

DICE RESULTS:
${rollLines}

Respond with JSON: {"narration": string, "stateChanges": [{"characterId": string, "field": "hp.current"|"edgePool"|"edd", "delta": number} | {"characterId": string, "field": ..., "value": number}], "combat": null | {"participants": [string], "reason": string}, "endGame": boolean}`;

  return [{ role: 'system', content: GM_SYSTEM }, { role: 'user', content: user }];
}

export function buildAiActionMessages(args: {
  character: Character;
  worldSummary: string;
  scene: string;
  events: GameEvent[];
  otherActions: DeclaredAction[];
}): ChatMessage[] {
  const persona = args.character.persona;
  const system = `You are playing the character ${args.character.name} in a Cyberpunk 2020 game. Stay fully in character and act in your own self-interest.${
    persona ? `\nPersona: archetype=${persona.archetype}; personality=${persona.personality}; goals=${persona.goals.join('; ') || 'n/a'}; secrets=${persona.secrets.join('; ') || 'n/a'}.` : ''
  } Decide ONE concrete, specific action for this moment. Respond with ONLY valid JSON.`;

  const others = args.otherActions.length
    ? args.otherActions.map((a) => `- ${a.characterName}: ${a.intent}`).join('\n')
    : '(no one has acted yet)';

  const user = `WORLD SUMMARY:
${args.worldSummary || '(none yet)'}

CURRENT SCENE:
${args.scene}

YOUR CHARACTER:
${formatCharacters([args.character])}

RECENT HISTORY:
${formatEvents(args.events, 25)}

OTHER PLAYERS' ACTIONS THIS ROUND:
${others}

Respond with JSON: {"intent": string, "skillUsed": string|null, "dicePool": number|null}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function buildAiCharacterMessages(args: { persona: { archetype: string; personality: string; goals: string[]; secrets: string[] }; skillNames: string[] }): ChatMessage[] {
  const p = args.persona;
    const system = `You generate a Cyberpunk 2020 character sheet for an AI player. Create a coherent, playable character that fits the persona. Attributes are integers 1-7 (higher is better). Skills use ONLY these names with integer ratings 0-6: ${args.skillNames.join(', ')}. The sum of all skill ratings must not exceed ${SKILL_POINT_BUDGET} points — spend them on a focused set of skills that fit the persona. Edge pool is 1-8. Starting cash (edd) is 100-5000. Respond with ONLY valid JSON.`;
  const user = `Persona to embody:
archetype: ${p.archetype}
personality: ${p.personality}
goals: ${p.goals.join('; ') || 'n/a'}
secrets: ${p.secrets.join('; ') || 'n/a'}

Respond with JSON: {"name": string, "attributes": {"body":number,"cool":number,"intelligence":number,"reflexes":number,"tech":number,"empathy":number}, "skills": {skillName:number}, "edgePool": number, "edd": number}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Private side question from a human player about their character or the situation. */
export function buildGmQuestionMessages(args: {
  character?: Character;
  worldSummary: string;
  scene: string;
  events: GameEvent[];
  question: string;
}): ChatMessage[] {
  const system = `You are the AI Game Master for a Cyberpunk 2020 tabletop RPG. A human player is asking you a private side question about their character or the current situation, outside the main game flow. Answer helpfully and concisely (a few sentences) in the voice of a gritty cyberpunk GM. You may fill in plausible details consistent with the provided context — gear carried, environment, NPCs, prices — but stay strictly consistent with it. Do NOT advance the story, do NOT declare or resolve actions, and do NOT change anything: this is purely informational. If the context does not pin down an answer, say so briefly and offer your best in-character guess.`;
  const user = `WORLD SUMMARY:
${args.worldSummary || '(none yet)'}

CURRENT SCENE:
${args.scene}

THE ASKING PLAYER'S CHARACTER:
${args.character ? formatCharacters([args.character]) : '(no character yet)'}

RECENT HISTORY:
${formatEvents(args.events, 25)}

PLAYER'S QUESTION:
${args.question}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function buildCompactionMessages(args: { existingSummary: string; newEvents: GameEvent[] }): ChatMessage[] {
  const system = `You maintain a running summary of an ongoing Cyberpunk 2020 game for context management. Fold the new events into the existing summary and produce an updated concise summary (max ~300 words) capturing key facts, locations, NPCs, injuries, relationships, goals, and plot developments. Respond with ONLY valid JSON.`;
  const user = `EXISTING SUMMARY:
${args.existingSummary || '(none yet)'}

NEW EVENTS TO FOLD IN:
${formatEvents(args.newEvents, 60)}

Respond with JSON: {"summary": string}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
