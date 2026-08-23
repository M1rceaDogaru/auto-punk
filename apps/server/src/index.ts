import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { WebSocketServer } from 'ws';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';
import { Store } from './store.js';
import { LlmClient } from './llm/llmClient.js';
import { GameServer } from './gameServer.js';
import { handleConnection } from './socket/handler.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};

async function serveStatic(req: FastifyRequest, reply: FastifyReply, distDir: string): Promise<void> {
  const url = new URL(req.raw.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname.startsWith('/api')) {
    return reply.code(404).send({ error: 'not found' });
  }

  let filePath = path.normalize(path.join(distDir, decodeURIComponent(url.pathname)));
  if (!filePath.startsWith(distDir)) return reply.code(403).send({ error: 'forbidden' });

  try {
    const st = statSync(filePath);
    if (st.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    // SPA fallback to index.html for client-side routes.
    filePath = path.join(distDir, 'index.html');
  }

  try {
    const body = await readFile(filePath);
    reply.header('content-type', MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream');
    return reply.send(body);
  } catch {
    return reply.code(404).send({ error: 'not found' });
  }
}

async function main(): Promise<void> {
  const config = loadConfig();

  const store = new Store(config.dataDir);
  await store.init();

  const llm = new LlmClient({ baseUrl: config.lmStudioUrl, apiKey: config.lmApiKey, model: config.model });
  const server = new GameServer(store, llm, config);

  const app = Fastify({ logger: false });

  // Permissive CORS for cross-origin HTTP (dev). WebSocket upgrades are unaffected.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('access-control-allow-origin', '*');
    reply.header('access-control-allow-methods', 'GET,POST,OPTIONS');
    reply.header('access-control-allow-headers', 'content-type');
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  app.get('/api/health', async () => ({ ok: true, model: config.model, rooms: store.list().length }));

  const distDir = process.env.WEB_DIST ?? path.resolve(new URL('../../web/dist/', import.meta.url).pathname);
  if (existsSync(distDir)) {
    app.setNotFoundHandler((req, reply) => serveStatic(req, reply, distDir));
  } else {
    console.log('[auto-punk] no built web app found — run the Vite dev server for the UI in development.');
  }

  await app.listen({ port: config.port, host: config.host });

  const wss = new WebSocketServer({ server: app.server, path: '/ws' });
  wss.on('connection', (ws) => handleConnection(ws, server));

  console.log(`[auto-punk] listening on http://${config.host}:${config.port}  (websocket at /ws)`);
  console.log(`[auto-punk] LM Studio ${config.lmStudioUrl}  model=${config.model}`);
  console.log(`[auto-punk] data dir: ${storeDirLabel(config.dataDir)} (${store.list().length} room(s) loaded)`);
}

function storeDirLabel(dir: string): string {
  return path.resolve(dir);
}

main().catch((err) => {
  console.error('[auto-punk] fatal:', err);
  process.exit(1);
});
