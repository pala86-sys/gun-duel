import {
  resolveRound,
  getStartStats,
  getEliminationThreshold,
} from '../js/rules.js';
import { pickAiAction } from '../js/ai.js';

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const rooms = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function genId() {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {import('../js/rules.js').GameMode} mode
 * @param {number} maxPlayers
 * @param {number} aiCount
 */
export function createRoom(mode, maxPlayers, aiCount = 0) {
  const code = genCode();
  const room = {
    code,
    mode,
    maxPlayers,
    phase: 'lobby',
    round: 1,
    hostPlayerId: null,
    awaitingFinalRound: false,
    isFinalRound: false,
    eliminatedThisSession: 0,
    lastLogs: [],
    winners: [],
    players: [],
    aiCount: Math.max(0, aiCount),
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(code?.toUpperCase());
}

export function deleteRoom(code) {
  rooms.delete(code);
}

export function addHumanPlayer(room, socketId, name) {
  if (room.phase !== 'lobby') return { error: '遊戲已開始' };
  const humans = room.players.filter((p) => !p.isAi);
  if (humans.length >= room.maxPlayers) return { error: '房間已滿' };
  const stats = getStartStats(room.mode);
  const player = {
    id: genId(),
    name: name.trim().slice(0, 12) || '玩家',
    socketId,
    isAi: false,
    isHost: room.players.length === 0,
    bullets: stats.bullets,
    hp: stats.hp,
    alive: true,
    choice: null,
    ready: false,
  };
  if (player.isHost) room.hostPlayerId = player.id;
  room.players.push(player);
  return { player };
}

function addAiPlayers(room) {
  const stats = getStartStats(room.mode);
  const needed = room.aiCount;
  const existingAi = room.players.filter((p) => p.isAi).length;
  for (let i = existingAi; i < needed; i++) {
    room.players.push({
      id: genId(),
      name: `電腦 ${i + 1}`,
      socketId: null,
      isAi: true,
      isHost: false,
      bullets: stats.bullets,
      hp: stats.hp,
      alive: true,
      choice: null,
      ready: true,
    });
  }
}

export function startGame(room, requesterId) {
  if (room.phase !== 'lobby') return { error: '遊戲已開始' };
  if (room.hostPlayerId !== requesterId) return { error: '僅房主可開始' };
  const humans = room.players.filter((p) => !p.isAi);
  if (humans.length < 1) return { error: '需要至少一位玩家' };
  const minPlayers = room.mode === 'duel' ? 2 : 3;
  addAiPlayers(room);
  const total = room.players.length;
  if (total < minPlayers) {
    return { error: room.mode === 'duel' ? '兩人模式至少需要 2 人（可加 AI）' : '多人模式至少需要 3 人（可加 AI）' };
  }
  room.phase = 'pick';
  room.round = 1;
  room.awaitingFinalRound = false;
  room.isFinalRound = false;
  room.eliminatedThisSession = 0;
  room.lastLogs = [];
  room.players.forEach((p) => {
    p.choice = null;
    p.revealedAction = null;
  });
  runAiPicks(room);
  return {};
}

export function submitChoice(room, playerId, action) {
  if (room.phase !== 'pick') return { error: '目前不是選牌階段' };
  const player = room.players.find((p) => p.id === playerId);
  if (!player || !player.alive) return { error: '無法選牌' };
  if (player.isAi) return { error: 'AI 由系統代選' };
  player.choice = action;
  tryResolvePick(room);
  return {};
}

function runAiPicks(room) {
  for (const p of room.players) {
    if (!p.isAi || !p.alive || room.phase !== 'pick') continue;
    if (p.choice) continue;
    const opponents = room.players.filter((o) => o.id !== p.id);
    p.choice = pickAiAction(p, opponents, room.mode);
  }
}

function tryResolvePick(room) {
  runAiPicks(room);
  const alive = room.players.filter((p) => p.alive);
  const allChosen = alive.every((p) => p.choice !== null);
  if (!allChosen) return;

  if (room.awaitingFinalRound) {
    room.isFinalRound = true;
    room.awaitingFinalRound = false;
  }

  const snapshot = room.players.map((p) => ({ ...p, choice: p.choice }));
  const { logs, eliminatedCount } = resolveRound(room.players, room.mode);
  room.lastLogs = logs;
  room.eliminatedThisSession += eliminatedCount;
  room.phase = 'reveal';

  if (room.mode === 'multi' && !room.isFinalRound && !room.awaitingFinalRound) {
    const threshold = getEliminationThreshold(room.players.length);
    if (room.eliminatedThisSession >= threshold) {
      room.awaitingFinalRound = true;
    }
  }
}

export function advanceRound(room, requesterId) {
  if (room.phase !== 'reveal') return { error: '請先完成本回合' };
  if (room.hostPlayerId !== requesterId) return { error: '僅房主可進行下一回合' };

  const alive = room.players.filter((p) => p.alive);
  const shouldEnd =
    alive.length <= 1 ||
    (room.mode === 'multi' && room.isFinalRound) ||
    (room.mode === 'duel' && alive.length <= 1);

  if (shouldEnd) {
    room.phase = 'ended';
    room.winners = alive.map((p) => ({ id: p.id, name: p.name }));
    return {};
  }

  room.round += 1;
  room.phase = 'pick';
  room.players.forEach((p) => {
    p.choice = null;
    p.revealedAction = null;
  });
  runAiPicks(room);
  return {};
}

/** @param {object} room @param {string|null} viewerPlayerId */
export function serializeRoom(room, viewerPlayerId) {
  const alive = room.players.filter((p) => p.alive);
  const pickedCount = alive.filter((p) => p.choice !== null).length;

  return {
    code: room.code,
    mode: room.mode,
    phase: room.phase,
    round: room.round,
    maxPlayers: room.maxPlayers,
    aiCount: room.aiCount,
    isFinalRound: room.isFinalRound,
    awaitingFinalRound: room.awaitingFinalRound,
    lastLogs: room.lastLogs,
    winners: room.winners,
    pickedCount,
    aliveCount: alive.length,
    hostPlayerId: room.hostPlayerId,
    you: viewerPlayerId
      ? (() => {
          const p = room.players.find((x) => x.id === viewerPlayerId);
          if (!p) return null;
          return {
            id: p.id,
            name: p.name,
            isHost: p.id === room.hostPlayerId,
            isAi: p.isAi,
            bullets: p.bullets,
            hp: p.hp,
            alive: p.alive,
            choice: room.phase === 'pick' ? p.choice : p.choice,
          };
        })()
      : null,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.id === room.hostPlayerId,
      isAi: p.isAi,
      bullets: p.bullets,
      hp: p.hp,
      alive: p.alive,
      choice:
        room.phase === 'reveal' || room.phase === 'ended'
          ? p.revealedAction ?? p.choice
          : p.id === viewerPlayerId
            ? p.choice
            : p.choice
              ? true
              : null,
      hasChosen: p.choice !== null,
      revealedAction: p.revealedAction ?? null,
    })),
  };
}

export function findPlayerBySocket(room, socketId) {
  return room.players.find((p) => p.socketId === socketId);
}

export function removePlayerFromAllRooms(socketId) {
  for (const [code, room] of rooms) {
    const idx = room.players.findIndex((p) => p.socketId === socketId && !p.isAi);
    if (idx === -1) continue;
    const wasHost = room.players[idx].id === room.hostPlayerId;
    room.players.splice(idx, 1);
    if (room.phase === 'lobby' && wasHost && room.players.length > 0) {
      const next = room.players.find((p) => !p.isAi) || room.players[0];
      room.hostPlayerId = next.id;
      next.isHost = true;
    }
    if (room.players.filter((p) => !p.isAi).length === 0) {
      deleteRoom(code);
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) deleteRoom(code);
  }
}, 600000);
