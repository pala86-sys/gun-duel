import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import {
  createRoom,
  getRoom,
  addHumanPlayer,
  startGame,
  submitChoice,
  advanceRound,
  serializeRoom,
  findPlayerBySocket,
  removePlayerFromAllRooms,
} from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3456;

const app = express();
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, rooms: 'in-memory' });
});

app.use(express.static(ROOT));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/** @type {Map<WebSocket, { roomCode: string, playerId: string }>} */
const sockets = new Map();

function send(ws, type, payload = {}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
}

function broadcastRoom(room) {
  for (const client of wss.clients) {
    const meta = sockets.get(client);
    if (!meta || meta.roomCode !== room.code) continue;
    send(client, 'state', { state: serializeRoom(room, meta.playerId) });
  }
}

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

wss.on('connection', (ws) => {
  send(ws, 'hello', { port: PORT });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, 'error', { message: '無效訊息' });
      return;
    }

    const { type } = msg;

    if (type === 'create') {
      const mode = msg.mode === 'multi' ? 'multi' : 'duel';
      const maxPlayers = mode === 'duel' ? 2 : Math.min(10, Math.max(3, Number(msg.maxPlayers) || 3));
      const aiCount = Math.max(0, Math.min(maxPlayers - 1, Number(msg.aiCount) || 0));
      const room = createRoom(mode, maxPlayers, aiCount);
      const result = addHumanPlayer(room, ws, msg.name || '房主');
      if (result.error) {
        send(ws, 'error', { message: result.error });
        return;
      }
      sockets.set(ws, { roomCode: room.code, playerId: result.player.id });
      send(ws, 'joined', {
        state: serializeRoom(room, result.player.id),
        lanIp: isProduction ? null : getLanIp(),
        port: PORT,
        publicUrl: isProduction ? null : undefined,
      });
      return;
    }

    if (type === 'join') {
      const code = String(msg.code || '').toUpperCase();
      const room = getRoom(code);
      if (!room) {
        send(ws, 'error', { message: '找不到房間' });
        return;
      }
      const result = addHumanPlayer(room, ws, msg.name || '玩家');
      if (result.error) {
        send(ws, 'error', { message: result.error });
        return;
      }
      sockets.set(ws, { roomCode: room.code, playerId: result.player.id });
      send(ws, 'joined', { state: serializeRoom(room, result.player.id) });
      broadcastRoom(room);
      return;
    }

    const meta = sockets.get(ws);
    if (!meta) {
      send(ws, 'error', { message: '請先建立或加入房間' });
      return;
    }
    const room = getRoom(meta.roomCode);
    if (!room) {
      send(ws, 'error', { message: '房間已關閉' });
      return;
    }

    if (type === 'start') {
      const err = startGame(room, meta.playerId);
      if (err.error) send(ws, 'error', { message: err.error });
      else broadcastRoom(room);
      return;
    }

    if (type === 'pick') {
      const err = submitChoice(room, meta.playerId, msg.action);
      if (err.error) send(ws, 'error', { message: err.error });
      else broadcastRoom(room);
      return;
    }

    if (type === 'next') {
      const err = advanceRound(room, meta.playerId);
      if (err.error) send(ws, 'error', { message: err.error });
      else broadcastRoom(room);
      return;
    }
  });

  ws.on('close', () => {
    removePlayerFromAllRooms(ws);
    sockets.delete(ws);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`槍戰對決伺服器運行中，port ${PORT}`);
  if (!isProduction) {
    const lan = getLanIp();
    console.log(`本機：http://localhost:${PORT}`);
    console.log(`同 WiFi：http://${lan}:${PORT}`);
  } else {
    console.log('雲端模式：請使用 Render 提供的 https 網址');
  }
});
