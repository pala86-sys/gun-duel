import { ChickenGame } from '../js/chicken/game.js';
import { checkWinner } from '../js/chicken/rules.js';

const chickenRooms = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = 'C' + Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (chickenRooms.has(code));
  return code;
}

function genId() {
  return `chp_${Math.random().toString(36).slice(2, 10)}`;
}

export function createChickenRoom(playerCount, effectMode, hostName, socketId) {
  const code = genCode();
  const room = {
    code,
    gameType: 'chicken',
    phase: 'lobby',
    playerCount: Math.min(4, Math.max(2, playerCount)),
    effectMode: effectMode || 'full',
    hostPlayerId: null,
    game: null,
    players: [],
    winners: [],
    createdAt: Date.now(),
  };
  const result = addChickenPlayer(room, socketId, hostName);
  if (result.error) return result;
  chickenRooms.set(code, room);
  return { room, player: result.player };
}

export function getChickenRoom(code) {
  return chickenRooms.get(String(code || '').toUpperCase());
}

export function deleteChickenRoom(code) {
  chickenRooms.delete(code);
}

export function addChickenPlayer(room, socketId, name) {
  if (room.phase !== 'lobby') return { error: '遊戲已開始' };
  if (room.players.length >= room.playerCount) return { error: '房間已滿' };
  const player = {
    id: genId(),
    name: name.trim().slice(0, 12) || '玩家',
    socketId,
    isHost: room.players.length === 0,
  };
  if (player.isHost) room.hostPlayerId = player.id;
  room.players.push(player);
  return { player };
}

export function startChickenGame(room, requesterId) {
  if (room.phase !== 'lobby') return { error: '遊戲已開始' };
  if (room.hostPlayerId !== requesterId) return { error: '僅房主可開始' };
  if (room.players.length < room.playerCount) {
    return { error: `需要 ${room.playerCount} 位玩家（目前 ${room.players.length} 人）` };
  }
  const mode = room.playerCount === 2 ? '2p' : 'multi';
  const names = room.players.map((p) => p.name);
  const game = new ChickenGame(mode, room.effectMode, names, {}, { online: true });
  game.players.forEach((gp, i) => {
    gp.id = room.players[i].id;
  });
  room.game = game;
  room.phase = 'playing';
  room.winners = [];
  game.cb = {
    onPick: () => broadcastChicken(room),
    onReveal: () => {
      const winners = checkWinner(game.players, game.mode);
      if (winners) {
        game.phase = 'ended';
        room.phase = 'ended';
        room.winners = winners;
      }
      broadcastChicken(room);
    },
  };
  game.notify();
  return {};
}

function broadcastChicken(room) {
  /* filled by index.js */
}

export function setChickenBroadcaster(fn) {
  broadcastChicken = fn;
}

export function chickenPick(room, playerId, payload) {
  if (!room.game) return { error: '遊戲未開始' };
  const game = room.game;
  if (payload.spots && Array.isArray(payload.spots)) {
    return game.submitGuardSpots(playerId, payload.spots.map(Number));
  }
  const spot = Number(payload.spot);
  if (!spot) return { error: '無效選擇' };
  const err = game.submitPick(spot, playerId);
  if (!err.error) {
    if (game.phase === 'reveal' || game.phase === 'ended') {
      const winners = checkWinner(game.players, game.mode);
      if (winners) {
        game.phase = 'ended';
        room.phase = 'ended';
        room.winners = winners;
      }
    }
    broadcastChicken(room);
  }
  return err;
}

export function chickenNext(room, requesterId) {
  if (!room.game) return { error: '遊戲未開始' };
  if (room.hostPlayerId !== requesterId) return { error: '僅房主可進行下一回合' };
  if (room.game.phase !== 'reveal') return { error: '請先完成本回合公布' };
  room.game.advanceAfterReveal();
  if (room.game.phase === 'ended') {
    room.phase = 'ended';
    room.winners = checkWinner(room.game.players, room.game.mode) || [];
  }
  broadcastChicken(room);
  return {};
}

export function serializeChickenRoom(room, viewerPlayerId) {
  if (room.phase === 'lobby') {
    return {
      gameType: 'chicken',
      code: room.code,
      phase: 'lobby',
      playerCount: room.playerCount,
      effectMode: room.effectMode,
      hostPlayerId: room.hostPlayerId,
      you: room.players.find((p) => p.id === viewerPlayerId) || null,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.id === room.hostPlayerId,
      })),
    };
  }
  const g = room.game;
  const base = g.getPublicState(viewerPlayerId);
  return {
    gameType: 'chicken',
    code: room.code,
    phase: room.phase === 'ended' ? 'ended' : g.phase,
    hostPlayerId: room.hostPlayerId,
    winners: (room.winners || []).map((w) => ({ id: w.id, name: w.name, score: w.score })),
    you: (() => {
      const p = base.players.find((x) => x.id === viewerPlayerId);
      const rp = room.players.find((x) => x.id === viewerPlayerId);
      if (!p || !rp) return null;
      return { ...p, isHost: rp.id === room.hostPlayerId };
    })(),
    ...base,
  };
}

export function removeChickenPlayer(socketId) {
  for (const [code, room] of chickenRooms) {
    const idx = room.players.findIndex((p) => p.socketId === socketId);
    if (idx === -1) continue;
    const wasHost = room.players[idx].id === room.hostPlayerId;
    room.players.splice(idx, 1);
    if (room.phase === 'lobby' && wasHost && room.players.length > 0) {
      room.players[0].isHost = true;
      room.hostPlayerId = room.players[0].id;
    }
    if (room.players.length === 0) deleteChickenRoom(code);
  }
}
