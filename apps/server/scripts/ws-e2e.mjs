// Full end-to-end smoke test against a live LM Studio: exercises every LLM path.
import { WebSocket } from 'ws';

const url = process.env.WS_URL ?? 'ws://localhost:8787/ws';
const ws = new WebSocket(url);

let roomId, playerId;
let sentSetGame = false, sentConfigureAi = false, sentCreateChar = false, sentStart = false, sentDeclare = false;
let openingText = '', resolutionText = '', aiName = '';

function send(o) { ws.send(JSON.stringify(o)); }
ws.on('open', () => { console.log('[e2e] connected -> create'); send({ type: 'create', gameId: 'cyberpunk2020', name: 'Host' }); });

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'error') return console.error('[e2e] server error:', msg.message);
  if (msg.type === 'joined') { roomId = msg.roomId; playerId = msg.playerId; }
  const s = msg.state;
  if (!s) return;

  // Capture narration for the summary.
  for (const e of s.events ?? []) {
    if (e.type === 'scene' && !openingText) openingText = String(e.payload.narration ?? '');
    if (e.type === 'gm_resolution' && !resolutionText) resolutionText = String(e.payload.narration ?? '');
  }
  const aiChar = s.characters.find((c) => c.playerId !== playerId);
  if (aiChar) aiName = aiChar.name;

  // Completion: one full round resolved.
  if ((s.round?.number ?? 0) >= 2 && sentDeclare) return finish(0, 'full round completed');

  const status = s.room.status;
  const aiCount = s.players.filter((p) => p.kind === 'ai').length;
  const hostChar = s.characters.find((c) => c.playerId === playerId);

  if (status === 'creating' && !sentSetGame) { sentSetGame = true; console.log('[e2e] set_game'); send({ type: 'set_game', gameId: 'cyberpunk2020' }); }
  else if (status === 'character_creation') {
    if (aiCount < 1 && !sentConfigureAi) { sentConfigureAi = true; console.log('[e2e] configure_ai(1 Solo)'); send({ type: 'configure_ai', aiConfigs: [{ archetype: 'Solo', personality: 'gritty, cautious mercenary who trusts no one', goals: ['get paid and walk away'], secrets: [] }] }); }
    else if (!hostChar && !sentCreateChar) { sentCreateChar = true; console.log('[e2e] create_character(host)'); send({ type: 'create_character', input: { name: 'Rache', attributes: { body: 4, cool: 5, intelligence: 3, reflexes: 4, tech: 2, empathy: 2 }, skills: { Guns: 4, Stealth: 3 } } }); }
    else if (hostChar && aiCount >= 1 && !sentStart) { sentStart = true; console.log('[e2e] start_game -> LLM generates AI sheet + opening scene…'); send({ type: 'start_game' }); }
  }
  else if (status === 'playing' && !sentDeclare) { sentDeclare = true; console.log('[e2e] playing -> declare host action (AI decides + GM resolves via LLM)…'); send({ type: 'declare_action', action: { playerId, intent: 'I scan the neon-lit street for a safe way to reach the noodle bar.', skillUsed: undefined } }); }
});

function finish(code, note) {
  console.log(`\n[e2e] ${note}`);
  if (openingText) console.log('[e2e] OPENING:', openingText.slice(0, 240).replace(/\s+/g, ' '), '…');
  if (aiName) console.log(`[e2e] AI character: ${aiName}`);
  if (resolutionText) console.log('[e2e] GM RESOLUTION:', resolutionText.slice(0, 240).replace(/\s+/g, ' '), '…');
  ws.close();
  setTimeout(() => process.exit(code), 150);
}

setTimeout(() => finish(1, 'TIMEOUT (LLM too slow or stuck)'), 160000);
