// Dev smoke test: exercises the non-LLM room lifecycle over a real WebSocket.
import { WebSocket } from 'ws';

const url = process.env.WS_URL ?? 'ws://localhost:8787/ws';
const ws = new WebSocket(url);

let roomId, seatToken, playerId;
let sentSetGame = false;
let sentConfigureAi = false;
let sentCreateChar = false;

function send(obj) {
  ws.send(JSON.stringify(obj));
}

ws.on('open', () => {
  console.log('[smoke] connected -> create room');
  send({ type: 'create', gameId: 'cyberpunk2020', name: 'Host' });
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'error') return finish(1, `ERROR: ${msg.message}`);
  if (msg.type === 'joined') {
    roomId = msg.roomId;
    seatToken = msg.seatToken;
    playerId = msg.playerId;
    console.log(`[smoke] joined room=${roomId} player=${playerId}`);
  }
  const s = msg.state;
  if (!s) return;

  if (s.room.status === 'creating' && !sentSetGame) {
    sentSetGame = true;
    console.log('[smoke] status=creating -> set_game');
    send({ type: 'set_game', gameId: s.room.gameId });
    return;
  }

  if (s.room.status === 'character_creation') {
    const aiCount = s.players.filter((p) => p.kind === 'ai').length;
    const hostChar = s.characters.find((c) => c.playerId === playerId);
    if (aiCount < 1 && !sentConfigureAi) {
      sentConfigureAi = true;
      console.log('[smoke] no AI yet -> configure_ai(1 Solo)');
      send({ type: 'configure_ai', aiConfigs: [{ archetype: 'Solo', personality: 'gritty mercenary', goals: ['make money'], secrets: [] }] });
    } else if (!hostChar && !sentCreateChar) {
      sentCreateChar = true;
      console.log('[smoke] host has no character -> create_character');
      send({ type: 'create_character', input: { name: 'Rache', attributes: { body: 4, cool: 5, intelligence: 3, reflexes: 4, tech: 2, empathy: 2 }, skills: { Guns: 4, Stealth: 3 } } });
    } else if (hostChar && aiCount >= 1) {
      finish(0, `OK players=${s.players.length} chars=${s.characters.length} hostHP=${hostChar.hp.current}/${hostChar.hp.max}`);
    }
  }
});

function finish(code, note) {
  console.log(`[smoke] ${note}`);
  ws.close();
  setTimeout(() => process.exit(code), 150);
}

setTimeout(() => finish(1, 'timeout'), 8000);
