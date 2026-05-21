const STORAGE_KEY = 'card-battle-history';
const LEGACY_KEY = 'gun-duel-history';
const MAX_PER_GAME = 50;

/** @typedef {'gun'|'chicken'} GameId */
/** @typedef {'win'|'lose'|'survive'} MatchResult */

function loadAll() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy).map((r) => ({ ...r, game: 'gun' }));
        saveAll(parsed);
        localStorage.removeItem(LEGACY_KEY);
        return parsed;
      }
      return [];
    }
    const list = JSON.parse(raw);
    return list.map((r) => ({ ...r, game: r.game || 'gun' }));
  } catch {
    return [];
  }
}

function saveAll(records) {
  const gun = records.filter((r) => r.game === 'gun').slice(0, MAX_PER_GAME);
  const chicken = records.filter((r) => r.game === 'chicken').slice(0, MAX_PER_GAME);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...gun, ...chicken]));
}

/**
 * @param {object} record
 */
export function saveMatch(record) {
  const list = loadAll();
  if (list.some((r) => r.id === record.id)) return;
  list.unshift({ ...record, game: record.game || 'gun' });
  saveAll(list);
}

/** @param {GameId} [gameId] */
export function getHistory(gameId) {
  const list = loadAll();
  return gameId ? list.filter((r) => r.game === gameId) : list;
}

/** @param {GameId} [gameId] 不傳則清除全部 */
export function clearHistory(gameId) {
  if (!gameId) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  saveAll(loadAll().filter((r) => r.game !== gameId));
}

/**
 * @param {GameId} gameId
 * @param {string} [myName]
 */
export function getSummary(gameId, myName) {
  let list = loadAll().filter((r) => r.game === gameId);
  if (myName) list = list.filter((r) => r.myName === myName);
  const wins = list.filter((r) => r.result === 'win' || r.result === 'survive').length;
  const losses = list.filter((r) => r.result === 'lose').length;
  return {
    total: list.length,
    wins,
    losses,
    winRate: list.length ? Math.round((wins / list.length) * 100) : 0,
  };
}

/** 槍戰對決 */
export function buildGunMatchRecord({
  mode,
  playKind,
  roomCode,
  myName,
  myPlayerId,
  players,
  winners,
  roundLogs,
  rounds,
}) {
  const winnerIds = new Set((winners || []).map((w) => w.id ?? w));
  const winnerNames = (winners || []).map((w) => w.name ?? w);
  const me =
    players.find((p) => p.id === myPlayerId) ||
    players.find((p) => p.name === myName);

  let result = 'lose';
  if (me && winnerNames.includes(me.name) && me.alive) {
    result = mode === 'multi' && winnerNames.length > 1 ? 'survive' : 'win';
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    game: 'gun',
    playedAt: new Date().toISOString(),
    mode,
    playKind,
    roomCode: roomCode || undefined,
    myName: myName || '玩家',
    result,
    rounds: rounds || roundLogs?.length || 0,
    winners: winnerNames,
    players: players.map((p) => ({
      name: p.name,
      alive: !!p.alive,
      hp: p.hp,
      bullets: p.bullets,
    })),
    roundLogs: roundLogs || [],
  };
}

/** 怪盜雞排 */
export function buildChickenMatchRecord({
  mode,
  playKind,
  roomCode,
  myName,
  myPlayerId,
  players,
  winners,
  roundLogs,
  rounds,
}) {
  const winnerList = winners || [];
  const winnerNames = winnerList.map((w) => w.name ?? w);
  const maxScore = Math.max(...players.map((p) => p.score), 0);
  const topNames = players.filter((p) => p.score === maxScore).map((p) => p.name);
  const me =
    players.find((p) => p.id === myPlayerId) ||
    players.find((p) => p.name === myName);

  let result = 'lose';
  if (me && topNames.includes(me.name)) {
    result = mode === 'multi' && topNames.length > 1 ? 'survive' : 'win';
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    game: 'chicken',
    playedAt: new Date().toISOString(),
    mode,
    playKind,
    roomCode: roomCode || undefined,
    myName: myName || '玩家',
    result,
    rounds: rounds || roundLogs?.length || 0,
    winners: winnerNames.length ? winnerNames : topNames,
    players: players.map((p) => ({
      name: p.name,
      score: p.score,
    })),
    roundLogs: roundLogs || [],
  };
}

/** @deprecated 使用 buildGunMatchRecord */
export function buildMatchRecord(params) {
  return buildGunMatchRecord(params);
}

export function formatResult(result) {
  if (result === 'win') return '勝利';
  if (result === 'survive') return '存活獲勝';
  return '落敗';
}

export function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatGunMode(mode, playKind) {
  const m = mode === 'duel' ? '兩人' : '多人';
  const p = playKind === 'online' ? '線上' : '本機';
  return `${p} · ${m}`;
}

export function formatChickenMode(mode, playKind) {
  const m = mode === '2p' ? '兩人' : '多人';
  const p = playKind === 'online' ? '線上' : '本機';
  return `${p} · ${m}`;
}

export const GAME_LABELS = {
  gun: '槍戰對決',
  chicken: '怪盜雞排',
};
