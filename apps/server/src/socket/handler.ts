import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@auto-punk/shared';
import type { GameServer } from '../gameServer.js';

/** Wire a single client socket to the game server. The first message must be `create` or `join`. */
export function handleConnection(ws: WebSocket, server: GameServer): void {
  let joined = false;

  const send = (msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const sendError = (message: string) => send({ type: 'error', message });

  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      sendError('Invalid message');
      return;
    }

    if (!joined) {
      handleJoinPhase(msg);
      return;
    }
    routeJoined(msg);
  });

  ws.on('close', () => server.detachSocket(ws));
  ws.on('error', () => server.detachSocket(ws));

  function handleJoinPhase(msg: ClientMessage): void {
    try {
      if (msg.type === 'create') {
        const { doc, player } = server.createRoom(msg.gameId, msg.name);
        joined = true;
        server.attachSocket(ws, doc.room.id, player.id);
        send({ type: 'joined', roomId: doc.room.id, playerId: player.id, seatToken: player.seatToken, state: server.stateFor(doc) });
      } else if (msg.type === 'join') {
        const player = server.joinRoom(msg.roomId, msg.name, msg.seatToken);
        joined = true;
        server.attachSocket(ws, msg.roomId, player.id);
        const state = server.stateForRoom(msg.roomId);
        if (!state) {
          sendError('Room not found');
          return;
        }
        send({ type: 'joined', roomId: msg.roomId, playerId: player.id, seatToken: player.seatToken, state });
      } else {
        sendError('First message must be "create" or "join"');
      }
    } catch (err) {
      sendError((err as Error).message);
    }
  }

  function routeJoined(msg: ClientMessage): void {
    const binding = server.getBinding(ws);
    if (!binding) return;
    try {
      switch (msg.type) {
        case 'set_game':
          server.setGame(binding.roomId, binding.playerId, msg.gameId);
          break;
        case 'configure_ai':
          server.configureAI(binding.roomId, binding.playerId, msg.aiConfigs);
          break;
        case 'create_character':
          server.createCharacter(binding.roomId, binding.playerId, msg.input);
          break;
        case 'regenerate_ai_character':
          void server.generateAiCharacters(binding.roomId, msg.playerId).catch((e) => sendError((e as Error).message));
          break;
        case 'start_game':
          void server.startGame(binding.roomId, binding.playerId).catch((e) => sendError((e as Error).message));
          break;
        case 'declare_action':
          server.declareAction(binding.roomId, binding.playerId, msg.action);
          break;
        case 'proceed_round':
          server.proceedRound(binding.roomId, binding.playerId);
          break;
        default:
          sendError('Unknown message');
      }
    } catch (err) {
      sendError((err as Error).message);
    }
  }
}
