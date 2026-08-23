export interface Config {
  port: number;
  host: string;
  dataDir: string;
  /** OpenAI-compatible base URL of the local LM Studio server (e.g. http://localhost:1234/v1). */
  lmStudioUrl: string;
  /** LM Studio ignores the key, but the client requires one to be present. */
  lmApiKey: string;
  model: string;
  maxEventsInState: number;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): Config {
  return {
    port: intFromEnv('PORT', 8787),
    host: process.env.HOST ?? '0.0.0.0',
    dataDir: process.env.DATA_DIR ?? new URL('../../../data/', import.meta.url).pathname,
    lmStudioUrl: (process.env.LM_STUDIO_URL ?? 'http://localhost:1234/v1').replace(/\/$/, ''),
    lmApiKey: process.env.LM_API_KEY ?? 'lm-studio',
    model: process.env.LM_MODEL ?? 'qwen3.8-27b',
    maxEventsInState: intFromEnv('MAX_EVENTS_IN_STATE', 200),
  };
}
