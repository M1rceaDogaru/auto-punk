import { create } from 'zustand';
import type { AIPersona, GameId, NewCharacterInput, RoomState, RoomSummary } from '@auto-punk/shared';

export type ConnStatus = 'idle' | 'connecting' | 'connected';

/** One entry of the private GM side chat (kept in memory only, never sent to game state). */
export interface GmChatEntry {
  id: string;
  question: string;
  answer?: string;
}

interface GameStore {
  connStatus: ConnStatus;
  roomId?: string;
  playerId?: string;
  seatToken?: string;
  state?: RoomState;
  /** Landing-page table list (fetched over HTTP, refreshed while on the landing screen). */
  rooms?: RoomSummary[];
  error: string | null;
  gmChat: GmChatEntry[];

  fetchRooms(): Promise<void>;
  createRoom(name: string): void;
  joinRoom(roomId: string, name: string): void;
  setGame(gameId: GameId): void;
  configureAI(configs: AIPersona[]): void;
  createCharacter(input: NewCharacterInput): void;
  startGame(): void;
  declareAction(action: { intent: string; skillUsed?: string; dicePool?: number }): void;
  proceedRound(): void;
  regenerateAi(playerId?: string): void;
  askGm(question: string): void;
  clearError(): void;
}

function wsUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_WS_URL;
  if (env) return env;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.hostname}:8787/ws`;
}

/** Base URL of the game server's HTTP API. In dev Vite serves on :5173 but the API lives on :8787. */
function apiBaseUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL;
  if (env) return env.replace(/\/$/, '');
  const proto = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${proto}://${window.location.hostname}:8787`;
}

function seatKey(roomId: string): string {
  return `autopunk.seat.${roomId}`;
}

let ws: WebSocket | null = null;

export const useGameStore = create<GameStore>((set, get) => {
  function connect(): void {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    set({ connStatus: 'connecting', error: null });
    ws = new WebSocket(wsUrl());

    ws.onopen = () => set({ connStatus: 'connected' });
    ws.onerror = () => set({ error: 'Connection to the game server failed. Is it running?' });
    ws.onclose = () => {
      if (get().connStatus !== 'idle') set({ connStatus: 'idle' });
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.type === 'joined') {
        set({ roomId: msg.roomId, playerId: msg.playerId, seatToken: msg.seatToken, state: msg.state });
        try {
          localStorage.setItem(seatKey(msg.roomId), msg.seatToken);
        } catch {
          /* ignore storage errors */
        }
      } else if (msg.type === 'state') {
        set({ state: msg.state });
      } else if (msg.type === 'gm_answer') {
        set((s) => ({ gmChat: s.gmChat.map((e) => (e.id === msg.id ? { ...e, answer: msg.answer } : e)) }));
      } else if (msg.type === 'error') {
        set({ error: msg.message });
      }
    };
  }

  function send(obj: unknown): void {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  return {
    connStatus: 'idle',
    rooms: undefined,
    error: null,
    gmChat: [],

    async fetchRooms() {
      try {
        const res = await fetch(`${apiBaseUrl()}/api/rooms`);
        if (!res.ok) return;
        set({ rooms: (await res.json()) as RoomSummary[] });
      } catch {
        /* server unreachable — leave the list empty */
      }
    },

    createRoom(name) {
      connect();
      // Queue the create once open.
      const attempt = () => {
        if (ws?.readyState === WebSocket.OPEN) send({ type: 'create', gameId: 'cyberpunk2020' as GameId, name });
        else setTimeout(attempt, 100);
      };
      attempt();
    },

    joinRoom(roomId, name) {
      let seatToken: string | undefined;
      try {
        seatToken = localStorage.getItem(seatKey(roomId)) ?? undefined;
      } catch {
        /* ignore */
      }
      connect();
      const attempt = () => {
        if (ws?.readyState === WebSocket.OPEN) send({ type: 'join', roomId, name, seatToken });
        else setTimeout(attempt, 100);
      };
      attempt();
    },

    setGame(gameId) {
      send({ type: 'set_game', gameId });
    },
    configureAI(configs) {
      send({ type: 'configure_ai', aiConfigs: configs });
    },
    createCharacter(input) {
      send({ type: 'create_character', input });
    },
    startGame() {
      set({ error: null });
      send({ type: 'start_game' });
    },
    declareAction(action) {
      const playerId = get().playerId;
      if (!playerId) return;
      send({ type: 'declare_action', action: { ...action, playerId } });
    },
    proceedRound() {
      send({ type: 'proceed_round' });
    },
    regenerateAi(playerId) {
      send({ type: 'regenerate_ai_character', playerId });
    },
    askGm(question) {
      const id = `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      set((s) => ({ gmChat: [...s.gmChat.slice(-49), { id, question }] }));
      send({ type: 'ask_gm', id, question });
    },
    clearError() {
      set({ error: null });
    },
  };
});
