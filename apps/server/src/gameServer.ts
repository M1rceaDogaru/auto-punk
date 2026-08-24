import type { WebSocket } from 'ws';
import {
  ALL_SKILLS,
  createRng,
  getGameSystem,
  rollD10Pool,
  rollSucceeded,
  type AIPersona,
  type Character,
  type DeclaredAction,
  type DiceRollResult,
  type EventType,
  type GameEvent,
  type GameId,
  type NewCharacterInput,
  type Player,
  type Room,
  type RoomState,
  type RoundInfo,
  type StateChange,
} from '@auto-punk/shared';
import { Store, type RoomDoc } from './store.js';
import { newRoomId, newSeatToken, uuid } from './id.js';
import type { Config } from './config.js';
import { LlmClient } from './llm/llmClient.js';
import {
  buildAiActionMessages,
  buildAiCharacterMessages,
  buildCompactionMessages,
  buildGmQuestionMessages,
  buildOpeningMessages,
  buildResolutionMessages,
  validateAiAction,
  validateGmOpening,
  validateGmResolution,
} from './llm/prompts.js';

const COMPACT_EVERY = 24; // fold events into the world summary every N new events

interface SocketBinding {
  roomId: string;
  playerId: string;
}

export class GameServer {
  private readonly sockets = new Map<WebSocket, SocketBinding>();
  private readonly busy = new Map<string, boolean>();
  private readonly chains = new Map<string, Promise<void>>();

  constructor(
    private readonly store: Store,
    private readonly llm: LlmClient,
    private readonly config: Config,
  ) {}

  // ---- Socket plumbing -----------------------------------------------------

  attachSocket(ws: WebSocket, roomId: string, playerId: string): void {
    this.sockets.set(ws, { roomId, playerId });
  }

  detachSocket(ws: WebSocket): void {
    this.sockets.delete(ws);
  }

  getBinding(ws: WebSocket): SocketBinding | undefined {
    return this.sockets.get(ws);
  }

  stateForRoom(roomId: string): RoomState | undefined {
    const doc = this.store.get(roomId);
    return doc ? this.stateFor(doc) : undefined;
  }

  private send(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  stateFor(doc: RoomDoc): RoomState {
    return {
      room: doc.room,
      players: doc.players,
      characters: doc.characters,
      events: doc.events.slice(-this.config.maxEventsInState),
      round: doc.round,
      busy: this.busy.get(doc.room.id) ?? false,
    };
  }

  broadcastState(roomId: string): void {
    const doc = this.store.get(roomId);
    if (!doc) return;
    const state = this.stateFor(doc);
    for (const [ws, binding] of this.sockets) {
      if (binding.roomId === roomId) this.send(ws, { type: 'state', state });
    }
  }

  // ---- Room / player lifecycle --------------------------------------------

  createRoom(gameId: GameId, hostName: string): { doc: RoomDoc; player: Player } {
    const now = Date.now();
    const roomId = newRoomId();
    const room: Room = {
      id: roomId,
      gameId,
      status: 'creating',
      worldSummary: '',
      scene: '',
      createdAt: now,
      updatedAt: now,
    };
    const host: Player = {
      id: uuid(),
      roomId,
      seatToken: newSeatToken(),
      name: sanitizeName(hostName),
      kind: 'human',
      isHost: true,
    };
    const doc: RoomDoc = { room, players: [host], characters: [], events: [], eventSeq: 1 };
    this.appendEvent(doc, 'room_created', { gameId });
    this.store.set(doc);
    return { doc, player: host };
  }

  joinRoom(roomId: string, name: string, seatToken?: string): Player {
    const doc = this.store.get(roomId);
    if (!doc) throw new Error('Room not found');
    if (['playing', 'combat', 'ended'].includes(doc.room.status)) {
      throw new Error('Game already in progress — cannot join now');
    }
    if (seatToken) {
      const existing = doc.players.find((p) => p.seatToken === seatToken);
      if (existing) return existing;
    }
    const player: Player = {
      id: uuid(),
      roomId,
      seatToken: newSeatToken(),
      name: sanitizeName(name),
      kind: 'human',
      isHost: false,
    };
    doc.players.push(player);
    this.appendEvent(doc, 'player_joined', { name: player.name });
    this.store.set(doc);
    return player;
  }

  // ---- Permissioned helpers ------------------------------------------------

  private requireHost(doc: RoomDoc, playerId: string): Player {
    const player = doc.players.find((p) => p.id === playerId);
    if (!player) throw new Error('Not a member of this room');
    if (!player.isHost) throw new Error('Only the host can do that');
    return player;
  }

  private requirePlayer(doc: RoomDoc, playerId: string): Player {
    const player = doc.players.find((p) => p.id === playerId);
    if (!player) throw new Error('Not a member of this room');
    return player;
  }

  // ---- Event / state mutation ---------------------------------------------

  private appendEvent(doc: RoomDoc, type: EventType, payload: Record<string, unknown>, actorId?: string): GameEvent {
    const event: GameEvent = { seq: doc.eventSeq++, roomId: doc.room.id, type, at: Date.now(), actorId, payload };
    doc.events.push(event);
    return event;
  }

  private touch(doc: RoomDoc): void {
    doc.room.updatedAt = Date.now();
  }

  // ---- Host controls -------------------------------------------------------

  setGame(roomId: string, playerId: string, gameId: GameId): void {
    const doc = this.store.get(roomId);
    if (!doc) throw new Error('Room not found');
    this.requireHost(doc, playerId);
    if (doc.room.status !== 'creating') throw new Error('Game already selected');
    doc.room.gameId = gameId;
    doc.room.status = 'character_creation';
    this.appendEvent(doc, 'game_selected', { gameId }, playerId);
    this.touch(doc);
    this.store.set(doc);
    this.broadcastState(roomId);
  }

  configureAI(roomId: string, playerId: string, aiConfigs: AIPersona[]): void {
    const doc = this.store.get(roomId);
    if (!doc) throw new Error('Room not found');
    this.requireHost(doc, playerId);
    if (['playing', 'combat', 'ended'].includes(doc.room.status)) throw new Error('Cannot change AI players mid-game');

    // Remove existing AI players and their characters.
    const aiIds = new Set(doc.players.filter((p) => p.kind === 'ai').map((p) => p.id));
    doc.characters = doc.characters.filter((c) => !aiIds.has(c.playerId));
    doc.players = doc.players.filter((p) => p.kind !== 'ai');

    for (const persona of aiConfigs.slice(0, 8)) {
      const ai: Player = {
        id: uuid(),
        roomId,
        seatToken: newSeatToken(),
        name: `AI-${persona.archetype || 'Agent'}`,
        kind: 'ai',
        isHost: false,
        persona,
      };
      doc.players.push(ai);
    }
    this.appendEvent(doc, 'game_selected', { aiCount: aiConfigs.length }, playerId);
    this.touch(doc);
    this.store.set(doc);
    this.broadcastState(roomId);
  }

  // ---- Character creation --------------------------------------------------

  createCharacter(roomId: string, playerId: string, input: NewCharacterInput): void {
    const doc = this.store.get(roomId);
    if (!doc) throw new Error('Room not found');
    const player = this.requirePlayer(doc, playerId);
    if (player.kind !== 'human') throw new Error('AI characters are generated by the system');
    if (['playing', 'combat', 'ended'].includes(doc.room.status)) throw new Error('Character creation is closed');

    const system = getGameSystem(doc.room.gameId);
    const character = system.createCharacter(input, { roomId, playerId, id: uuid });
    doc.characters.push(character);
    player.characterId = character.id;
    this.appendEvent(doc, 'character_created', { name: character.name }, playerId);
    this.touch(doc);
    this.store.set(doc);
    this.broadcastState(roomId);
  }

  /** Generate (or regenerate) AI character sheets via the LLM. */
  async generateAiCharacters(roomId: string, onlyPlayerId?: string): Promise<void> {
    await this.runExclusive(roomId, async () => {
      const doc = this.store.get(roomId);
      if (!doc) return;
      const system = getGameSystem(doc.room.gameId);
      const targets = doc.players.filter(
        (p) => p.kind === 'ai' && p.persona && (!onlyPlayerId || p.id === onlyPlayerId),
      );

      for (const ai of targets) {
        // Replace any existing character for this AI.
        doc.characters = doc.characters.filter((c) => c.playerId !== ai.id);
        try {
          const sheet = await this.llm.chatJSON(
            buildAiCharacterMessages({ persona: ai.persona!, skillNames: ALL_SKILLS }),
            (parsed) => system.createCharacter(parsed as NewCharacterInput, { roomId, playerId: ai.id, id: uuid }),
            { temperature: 0.9 },
          );
          sheet.persona = ai.persona;
          doc.characters.push(sheet);
          ai.characterId = sheet.id;
          this.appendEvent(doc, 'character_created', { name: sheet.name, ai: true });
        } catch (err) {
          console.error(`[director] AI character generation failed for ${ai.name}:`, err);
          // Leave the AI without a character; host can retry.
        }
      }
      this.touch(doc);
      this.store.set(doc);
      this.broadcastState(roomId);
    });
  }

  // ---- Game start ----------------------------------------------------------

  async startGame(roomId: string, playerId: string): Promise<void> {
    await this.runExclusive(roomId, async () => {
      const doc = this.store.get(roomId);
      if (!doc) return;
      this.requireHost(doc, playerId);
      if (['playing', 'combat', 'ended'].includes(doc.room.status)) throw new Error('Game already started');

      const humansWithoutChar = doc.players.filter((p) => p.kind === 'human' && !doc.characters.some((c) => c.playerId === p.id));
      if (humansWithoutChar.length > 0) throw new Error('All players need a character before starting');

      this.busy.set(roomId, true);
      this.broadcastState(roomId);
      try {
        // Ensure every player has a character (generate missing AI sheets).
        const missingAi = doc.players.some((p) => p.kind === 'ai' && !doc.characters.some((c) => c.playerId === p.id));
        if (missingAi) await this.generateAiCharactersInner(doc);

        const opening = await this.llm.chatJSON(buildOpeningMessages({ worldSummary: doc.room.worldSummary, characters: doc.characters }), validateGmOpening, { temperature: 0.9 });
        doc.room.scene = opening.narration;
        this.appendEvent(doc, 'scene', { narration: opening.narration });

        const humans = doc.players.filter((p) => p.kind === 'human');
        doc.round = { number: 1, phase: 'collecting', pendingActions: [], awaitingHumanIds: humans.map((h) => h.id) };
        doc.room.status = 'playing';
      } finally {
        this.busy.set(roomId, false);
      }
      this.touch(doc);
      this.store.set(doc);
      this.broadcastState(roomId);
    });
  }

  // ---- Round loop ----------------------------------------------------------

  declareAction(roomId: string, playerId: string, action: DeclaredAction): void {
    const doc = this.store.get(roomId);
    if (!doc) throw new Error('Room not found');
    const player = this.requirePlayer(doc, playerId);
    if (player.kind !== 'human') throw new Error('Only human players declare actions here');
    if (doc.room.status !== 'playing' && doc.room.status !== 'combat') throw new Error('Game is not in progress');
    if (!doc.round || doc.round.phase !== 'collecting') throw new Error('Not collecting actions right now');

    const character = doc.characters.find((c) => c.playerId === playerId);
    if (!character) throw new Error('You have no character');

    const declared: DeclaredAction = { ...action, playerId, characterName: character.name };
    doc.round.pendingActions.push(declared);
    doc.round.awaitingHumanIds = doc.round.awaitingHumanIds.filter((id) => id !== playerId);
    this.appendEvent(doc, 'action_declared', toActionPayload(declared), playerId);
    this.store.set(doc);
    this.broadcastState(roomId);

    if (doc.round.awaitingHumanIds.length === 0 && !this.busy.get(roomId)) {
      void this.resolveRound(roomId).catch((err) => console.error('[director] resolve failed:', err));
    }
  }

  proceedRound(roomId: string, playerId: string): void {
    const doc = this.store.get(roomId);
    if (!doc) throw new Error('Room not found');
    this.requireHost(doc, playerId);
    if (['playing', 'combat'].includes(doc.room.status) && !this.busy.get(roomId)) {
      void this.resolveRound(roomId).catch((err) => console.error('[director] resolve failed:', err));
    }
  }

  /** Private side question from a human player. Informational only: no state changes, no busy flag. */
  async askGm(ws: WebSocket, roomId: string, playerId: string, id: string, question: string): Promise<void> {
    const doc = this.store.get(roomId);
    if (!doc) throw new Error('Room not found');
    const player = this.requirePlayer(doc, playerId);
    if (player.kind !== 'human') throw new Error('Only human players can ask the GM questions');
    if (!['playing', 'combat'].includes(doc.room.status)) throw new Error('The game has not started yet');

    const character = doc.characters.find((c) => c.playerId === playerId);
    const answer = await this.llm.chat(
      buildGmQuestionMessages({
        character,
        worldSummary: doc.room.worldSummary,
        scene: doc.room.scene,
        events: doc.events,
        question,
      }),
      { temperature: 0.7 },
    );
    this.send(ws, { type: 'gm_answer', id, answer });
  }

  private async resolveRound(roomId: string): Promise<void> {
    await this.runExclusive(roomId, async () => {
      const doc = this.store.get(roomId);
      if (!doc || !doc.round) return;
      if (['playing', 'combat'].includes(doc.room.status)) {
        doc.round.phase = 'resolving';
      }

      this.busy.set(roomId, true);
      this.broadcastState(roomId);
      try {
        // 1. AI players decide their actions (parallel).
        const aiWithoutAction = doc.players.filter(
          (p) => p.kind === 'ai' && !doc.round!.pendingActions.some((a) => a.playerId === p.id),
        );
        await Promise.all(
          aiWithoutAction.map(async (ai) => {
            const character = doc.characters.find((c) => c.playerId === ai.id);
            if (!character) return;
            try {
              const decision = await this.llm.chatJSON(
                buildAiActionMessages({
                  character,
                  worldSummary: doc.room.worldSummary,
                  scene: doc.room.scene,
                  events: doc.events,
                  otherActions: doc.round!.pendingActions.filter((a) => a.playerId !== ai.id),
                }),
                validateAiAction,
                { temperature: 0.9 },
              );
              const declared: DeclaredAction = {
                playerId: ai.id,
                characterName: character.name,
                intent: decision.intent,
                skillUsed: decision.skillUsed ?? undefined,
                dicePool: decision.dicePool ?? undefined,
              };
              doc.round!.pendingActions.push(declared);
              this.appendEvent(doc, 'action_declared', toActionPayload(declared), ai.id);
            } catch (err) {
              console.error(`[director] AI action failed for ${ai.name}:`, err);
            }
          }),
        );

        // 2. Roll dice for any actions that need a skill test.
        const rolls: DiceRollResult[] = [];
        for (const action of doc.round.pendingActions) {
          if (!action.skillUsed && action.dicePool === undefined) continue;
          const character = doc.characters.find((c) => c.playerId === action.playerId);
          if (!character) continue;
          const pool = action.dicePool ?? character.skills[action.skillUsed!] ?? 0;
          if (pool <= 0) continue;
          const roll = rollD10Pool(pool, `${action.characterName}: ${action.skillUsed}`, createRng());
          rolls.push(roll);
          this.appendEvent(doc, 'dice_roll', { ...roll, succeeded: rollSucceeded(roll), characterId: character.id });
        }

        // 3. GM resolves the round (ordered by initiative when in combat).
        const ordered = doc.room.status === 'combat' && doc.round.initiative
          ? orderActionsByInitiative(doc.round.pendingActions, doc.round.initiative)
          : doc.round.pendingActions;

        const resolution = await this.llm.chatJSON(
          buildResolutionMessages({
            worldSummary: doc.room.worldSummary,
            scene: doc.room.scene,
            characters: doc.characters,
            events: doc.events,
            actions: ordered,
            rolls,
          }),
          validateGmResolution,
          { temperature: 0.85 },
        );

        // 4. Apply state changes + narrate.
        for (const change of resolution.stateChanges ?? []) {
          const applied = this.applyStateChange(doc, change);
          if (applied) this.appendEvent(doc, 'state_change', applied);
        }
        doc.room.scene = resolution.narration;
        this.appendEvent(doc, 'gm_resolution', { narration: resolution.narration });

        // 5. Combat transitions.
        if (resolution.combat && resolution.combat.participants.length > 0) {
          const ids = resolution.combat.participants
            .map((name) => doc.characters.find((c) => c.name === name)?.id)
            .filter((x): x is string => Boolean(x));
          if (ids.length > 0) {
            doc.room.status = 'combat';
            doc.round.initiative = computeInitiative(doc, ids);
            this.appendEvent(doc, 'combat_start', { participants: resolution.combat.participants });
          }
        } else if (doc.room.status === 'combat') {
          const survivors = (doc.round.initiative ?? []).filter((id) => {
            const c = doc.characters.find((x) => x.id === id);
            return c && c.hp.current > 0;
          });
          if (survivors.length === 0 || resolution.endGame) {
            doc.room.status = 'playing';
            doc.round.initiative = undefined;
            this.appendEvent(doc, 'combat_end', {});
          } else {
            doc.round.initiative = survivors;
          }
        }

        if (resolution.endGame) {
          doc.room.status = 'ended';
          doc.round = undefined;
        } else {
          const humans = doc.players.filter((p) => p.kind === 'human');
          doc.round.number += 1;
          doc.round.phase = 'collecting';
          doc.round.pendingActions = [];
          doc.round.awaitingHumanIds = humans.map((h) => h.id);
        }

        // 6. Periodic context compaction.
        if (doc.events.length % COMPACT_EVERY === 0 && !resolution.endGame) {
          await this.compact(doc).catch((err) => console.error('[director] compaction failed:', err));
        }
      } finally {
        this.busy.set(roomId, false);
      }

      this.touch(doc);
      this.store.set(doc);
      this.broadcastState(roomId);
    });
  }

  private applyStateChange(doc: RoomDoc, change: StateChange): Record<string, unknown> | null {
    const character = doc.characters.find((c) => c.id === change.characterId);
    if (!character) return null;
    let value: number;
    switch (change.field) {
      case 'hp.current':
        value = clamp(change.value ?? character.hp.current + (change.delta ?? 0), 0, character.hp.max);
        character.hp.current = value;
        break;
      case 'edgePool':
        value = Math.max(0, change.value ?? character.edgePool + (change.delta ?? 0));
        character.edgePool = value;
        break;
      case 'edd':
        value = Math.max(0, Math.round(change.value ?? character.edd + (change.delta ?? 0)));
        character.edd = value;
        break;
      default:
        return null;
    }
    return { characterId: character.id, characterName: character.name, field: change.field, delta: change.delta, value };
  }

  private async compact(doc: RoomDoc): Promise<void> {
    const recent = doc.events.slice(-COMPACT_EVERY * 2);
    const result = await this.llm.chatJSON(
      buildCompactionMessages({ existingSummary: doc.room.worldSummary, newEvents: recent }),
      (parsed) => {
        const o = parsed as Record<string, unknown>;
        if (typeof o.summary !== 'string') throw new Error('summary must be a string');
        return { summary: o.summary };
      },
      { temperature: 0.3 },
    );
    doc.room.worldSummary = result.summary;
    this.appendEvent(doc, 'compaction', {});
  }

  // ---- Internals -----------------------------------------------------------

  private async generateAiCharactersInner(doc: RoomDoc): Promise<void> {
    const system = getGameSystem(doc.room.gameId);
    for (const ai of doc.players.filter((p) => p.kind === 'ai' && p.persona)) {
      if (doc.characters.some((c) => c.playerId === ai.id)) continue;
      try {
        const sheet = await this.llm.chatJSON(
          buildAiCharacterMessages({ persona: ai.persona!, skillNames: ALL_SKILLS }),
          (parsed) => system.createCharacter(parsed as NewCharacterInput, { roomId: doc.room.id, playerId: ai.id, id: uuid }),
          { temperature: 0.9 },
        );
        sheet.persona = ai.persona;
        doc.characters.push(sheet);
        ai.characterId = sheet.id;
      } catch (err) {
        console.error(`[director] AI character generation failed for ${ai.name}:`, err);
      }
    }
  }

  /** Serialize async operations per room to prevent overlapping LLM work. */
  private runExclusive<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(roomId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    this.chains.set(roomId, prev.then(() => gate));
    return prev.then(async () => {
      try {
        return await fn();
      } finally {
        release();
      }
    });
  }
}

// ---- Pure helpers ----------------------------------------------------------

function sanitizeName(name: string): string {
  const clean = (name ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
  return clean || 'Player';
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function toActionPayload(a: DeclaredAction): Record<string, unknown> {
  return { characterName: a.characterName, intent: a.intent, skillUsed: a.skillUsed ?? null };
}

function computeInitiative(doc: RoomDoc, ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ca = doc.characters.find((c) => c.id === a);
    const cb = doc.characters.find((c) => c.id === b);
    return (cb?.attributes.reflexes ?? 0) - (ca?.attributes.reflexes ?? 0);
  });
}

function orderActionsByInitiative(actions: DeclaredAction[], initiative: string[]): DeclaredAction[] {
  const rank = new Map(initiative.map((id, i) => [id, i]));
  return [...actions].sort((a, b) => (rank.get(a.playerId) ?? 999) - (rank.get(b.playerId) ?? 999));
}
