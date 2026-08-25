// Core domain types shared by the server (authoritative) and the web client.

export type GameId = 'cyberpunk2020';

export type RoomStatus =
  | 'creating'
  | 'character_creation'
  | 'ready_check'
  | 'playing'
  | 'combat'
  | 'ended';

export interface Room {
  id: string;
  gameId: GameId;
  status: RoomStatus;
  /** Rolling, LLM-maintained summary of everything that has happened so far. */
  worldSummary: string;
  /** The most recent GM scene / narration text shown to the table. */
  scene: string;
  createdAt: number;
  updatedAt: number;
}

export type PlayerKind = 'human' | 'ai';

export interface AIPersona {
  archetype: string;
  personality: string;
  goals: string[];
  secrets: string[];
}

export interface Player {
  id: string;
  roomId: string;
  /** Client-generated token persisted in localStorage so a refresh reattaches to the same seat. */
  seatToken: string;
  name: string;
  kind: PlayerKind;
  isHost: boolean;
  characterId?: string;
  persona?: AIPersona;
}

export interface Attributes {
  body: number;
  cool: number;
  intelligence: number;
  reflexes: number;
  tech: number;
  empathy: number;
}

export type AttributeKey = keyof Attributes;

export interface SkillCategory {
  category: string;
  skills: string[];
}

export interface Character {
  id: string;
  roomId: string;
  playerId: string;
  name: string;
  gameId: GameId;
  attributes: Attributes;
  /** skillName -> rating (0..5+) */
  skills: Record<string, number>;
  edgePool: number;
  hp: { current: number; max: number };
  soak: number;
  move: number;
  edd: number;
  cyberware: string[];
  gear: string[];
  /** Present for AI characters; drives the LLM's behaviour. */
  persona?: AIPersona;
}

export interface NewCharacterInput {
  name: string;
  attributes: Attributes;
  skills: Record<string, number>;
  edgePool?: number;
  edd?: number;
  cyberware?: string[];
  gear?: string[];
}

/** Context passed to a game system when materialising a character. */
export interface CreateCharacterContext {
  roomId: string;
  playerId: string;
  id: () => string;
}

/** A single player's declared action for the current round. */
export interface DeclaredAction {
  playerId: string;
  characterName: string;
  intent: string;
  skillUsed?: string;
  dicePool?: number;
}

export type EventType =
  | 'room_created'
  | 'player_joined'
  | 'game_selected'
  | 'character_created'
  | 'scene'
  | 'round_start'
  | 'action_declared'
  | 'dice_roll'
  | 'gm_resolution'
  | 'state_change'
  | 'combat_start'
  | 'combat_end'
  | 'compaction';

export interface GameEvent {
  seq: number;
  roomId: string;
  type: EventType;
  at: number;
  actorId?: string;
  payload: Record<string, unknown>;
}

/** A machine-applicable mutation produced by the GM resolution step. */
export interface StateChange {
  characterId: string;
  field: 'hp.current' | 'edgePool' | 'edd';
  /** Additive change (e.g. damage = negative). Mutually exclusive with `value`. */
  delta?: number;
  /** Absolute set. Mutually exclusive with `delta`. */
  value?: number;
}

export type RoundPhase = 'scene' | 'collecting' | 'resolving';

export interface RoundInfo {
  number: number;
  phase: RoundPhase;
  pendingActions: DeclaredAction[];
  /** Human player ids that have not yet declared an action this round. */
  awaitingHumanIds: string[];
  /** Initiative order (character ids) when in combat. */
  initiative?: string[];
}

/** Full authoritative snapshot broadcast to every client in a room. */
export interface RoomState {
  room: Room;
  players: Player[];
  characters: Character[];
  /** Recent events for the live feed (bounded). */
  events: GameEvent[];
  round?: RoundInfo;
  /** True while the server is mid-LLM-call; clients should disable inputs. */
  busy: boolean;
  /** Player ids with a live connection right now (presence, recomputed per broadcast). */
  onlinePlayerIds: string[];
}

/** Lightweight room descriptor for the landing-page table list (HTTP `GET /api/rooms`). */
export interface RoomSummary {
  id: string;
  status: RoomStatus;
  hostName?: string;
  humanCount: number;
  aiCount: number;
  playerCount: number;
  createdAt: number;
  updatedAt: number;
  /** Short, truncated label of the current scene (may be empty for fresh tables). */
  label?: string;
}

// ---- WebSocket protocol ---------------------------------------------------

export type ClientMessage =
  | { type: 'create'; gameId: GameId; name: string }
  | { type: 'join'; roomId: string; name: string; seatToken?: string }
  | { type: 'set_game'; gameId: GameId }
  | { type: 'configure_ai'; aiConfigs: AIPersona[] }
  | { type: 'create_character'; input: NewCharacterInput }
  | { type: 'regenerate_ai_character'; playerId?: string }
  | { type: 'start_game' }
  | { type: 'declare_action'; action: DeclaredAction }
  | { type: 'proceed_round' }
  /** Private side question to the GM; does not affect game state. */
  | { type: 'ask_gm'; id: string; question: string };

export type ServerMessage =
  | { type: 'joined'; roomId: string; playerId: string; seatToken: string; state: RoomState }
  | { type: 'state'; state: RoomState }
  | { type: 'error'; message: string }
  /** Answer to a private `ask_gm` question, sent only to the asking player. */
  | { type: 'gm_answer'; id: string; answer: string };
