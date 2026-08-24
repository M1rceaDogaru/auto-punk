# AGENTS.md — working in auto-punk

Guidance for AI coding agents (and humans) making changes to this repo. Read [PLAN.md](./PLAN.md) for the full design and [README.md](./README.md) for setup before non-trivial work.

## What this is

A browser-based tabletop RPG platform with an **AI game master** and mixed **AI + human players**. No accounts — rooms are addressed by a short unique instance id (shareable link). v1 ships **Cyberpunk 2020**, driven by a local LM Studio LLM (`qwen3.8-27b` at `http://localhost:1234`).

## Monorepo layout (npm workspaces)

| Path | Package | Role |
|---|---|---|
| `packages/shared/` | `@auto-punk/shared` | **Pure TS, zero runtime deps.** Domain types + Cyberpunk 2020 rules engine + dice. Used by both server and web. Must stay dependency-free and unit-testable. |
| `apps/server/` | `@auto-punk/server` | Node + Fastify + `ws`. The **authoritative** game server: state, rules engine, LLM orchestration, JSON persistence. |
| `apps/web/` | `@auto-punk/web` | React + Vite + Zustand thin client over WebSocket. Renders state, submits actions. |

The shared package is imported as source (`main`/`types` point at `src/index.ts`). The web aliases it to the TS source in `vite.config.ts`; the server runs it via `tsx`. **Do not add runtime dependencies to `packages/shared`.**

## Commands (run from repo root)

```bash
npm install            # install all workspaces
npm run dev            # server (tsx watch) + web (vite :5173) concurrently
npm start              # server only (tsx src/index.ts)
npm run build:web      # vite build -> apps/web/dist
npm test               # node --import tsx --test packages/shared/test/*.test.ts
npm run typecheck      # tsc -p tsconfig.json  (whole monorepo, noEmit)
```

**Always run `npm run typecheck` and `npm test` before considering a change done.** Type-checking is strict (`strict: true`). There is no separate lint step configured.

## Architecture invariants — do not break these

1. **The server is the single source of truth.** All game state lives on the server; browsers only render `RoomState` snapshots and send intent messages. Never let a client mutate authoritative state or roll dice.
2. **Dice are rolled by the deterministic engine, never by the LLM.** Rolls use a seeded RNG in `packages/shared/src/dice.ts`. The LLM *narrates* outcomes from results it is handed; it must not invent roll results. Keep this separation when touching prompts or resolution logic.
3. **Structured LLM output = prompt + robust extraction + validation + retry.** See `LlmClient.chatJSON` and the validators in `apps/server/src/llm/prompts.ts`. The model may not support `response_format`, so correctness comes from `extractJson` (tolerates code fences/prose) plus a validator that throws on bad shape, with corrective-feedback retries. When adding a new LLM call, follow this pattern: build messages → define an output interface + validator → call `chatJSON`.
4. **Rounds are server-side transactions.** A round collects all actions (humans via UI; each AI auto-decides in *parallel* LLM calls), the engine rolls dice, the GM resolves + narrates, state changes are applied, then everything is committed and broadcast. Per-room async work is serialized through `GameServer.runExclusive` to prevent overlapping LLM work — preserve that when adding new round-phase operations.
5. **Persistence is a write-through JSON file store** (`apps/server/src/store.ts`): one file per room in `DATA_DIR`, atomic writes (tmp + rename), hydrated into an in-memory cache on boot so games resume after restart. It sits behind the `Store` class so SQLite can be dropped in later — keep mutations going through `store.set(doc)`.
6. **The event log is append-only** and powers the UI feed, resumability, and context compaction. Append via `appendEvent`; don't rewrite history.

## Key files to know

- `packages/shared/src/types.ts` — all domain types **and** the WebSocket wire protocol (`ClientMessage`, `ServerMessage`). Changing the protocol means updating both this file and the handlers on each side.
- `apps/server/src/gameServer.ts` — room/player lifecycle, round loop, combat/initiative, state-change application, compaction. The heart of the server.
- `apps/server/src/llm/prompts.ts` — all prompt builders + output validators (`buildOpeningMessages`, `buildResolutionMessages`, `buildAiActionMessages`, `buildAiCharacterMessages`, `buildGmQuestionMessages`, `buildCompactionMessages`).
- `apps/server/src/socket/handler.ts` — maps incoming WebSocket messages to `GameServer` methods. The first message must be `create` or `join`.
- `apps/web/src/store/useGameStore.ts` — Zustand store; owns the single WebSocket connection and all client→server sends.

## Conventions

- **TypeScript, ESM** (`"type": "module"`). Relative imports in server/shared source use explicit `.js` extensions (e.g. `import { Store } from './store.js'`) even though files are `.ts` — keep this style.
- **No comments unless asked.** Match the existing minimal-comment style; let names and types carry meaning.
- Keep `packages/shared` pure: no Node APIs, no I/O, no deps. Anything testable should live there or be a pure function.
- Config comes from environment via `apps/server/src/config.ts` (`loadConfig`). Don't hardcode ports/URLs/model names — add them to the config with sensible defaults.
- The web client connects to the server at `<host>:8787/ws` (overridable with `VITE_WS_URL`). In dev, Vite runs on `:5173`.

## Testing approach

- **Unit** (`npm test`, high value): pure rules engine — dice rolls, success/fumble counting, HP/Soak math, opposed rolls. Deterministic via a seeded/injected RNG (see the `seqRng` helper in `packages/shared/test/dice.test.ts`). Add tests here for any rules-engine change.
- **Dev scripts** (`apps/server/scripts/`, need a running server / LM Studio):
  - `llm-ping.ts` — one real structured-output LLM call (checks LM Studio is reachable + JSON works).
  - `ws-smoke.mjs` — non-LLM room lifecycle over a live WebSocket.
  - `ws-e2e.mjs` — full end-to-end round against a live LM Studio, exercising every LLM path.

## Gotchas

- The server only serves the built web app if `apps/web/dist` exists; otherwise it logs that you should run the Vite dev server for the UI in development.
- `data/` is gitignored and holds live room state — don't commit it, and be aware tests/dev runs create files there.
- LM Studio must be up with `qwen3.8-27b` loaded or every LLM path fails; use `llm-ping.ts` to verify before debugging game logic.
