const STORAGE_KEY = 'gun-duel-history';
const MAX_RECORDS = 50;

/**
 * @typedef {'win'|'lose'|'survive'} MatchResult
 * @typedef {Object} MatchRecord
 * @property {string} id
 * @property {string} playedAt
 * @property {'duel'|'multi'} mode
 * @property {'local'|'online'} playKind
 * @property {string} [roomCode]
 * @property {string} myName
 * @property {MatchResult} result
 * @property {number} rounds
 * @property {string[]} winners
 * @property {Array<{name:string,alive:boolean,hp:number,bullets:number}>} players
 * @property {Array<{round:number,logs:string[]}>} roundLogs
 */

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
}

/**
 * @param {MatchRecord} record
 */
export function saveMatch(record) {
  const list = loadAll();
  if (list.some((r) => r.id === record.id)) return;
  list.unshift(record);
  saveAll(list);
}

/** @returns {MatchRecord[]} */
export function getHistory() {
  return loadAll();
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * @param {string} [myName]
 */
export function getSummary(myName) {
  const list = loadAll();
  const filtered = myName
    ? list.filter((r) => r.myName === myName)
    : list;
  const wins = filtered.filter((r) => r.result === 'win' || r.result === 'survive').length;
  const losses = filtered.filter((r) => r.result === 'lose').length;
  return {
    total: filtered.length,
    wins,
    losses,
    winRate: filtered.length ? Math.round((wins / filtered.length) * 100) : 0,
  };
}

/**
 * @param {object} params
 */
export function buildMatchRecord({
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
  const iWon =
    me &&
    (winnerIds.has(me.id) ||
      winnerNames.includes(me.name) ||
      (me.alive && winnerNames.length === 0));
  const iAlive = me?.alive;

  let result = 'lose';
  if (me && winnerNames.includes(me.name) && iAlive) {
    result = mode === 'multi' && winnerNames.length > 1 ? 'survive' : 'win';
  } else if (iWon && iAlive) {
    result = mode === 'multi' && winnerNames.length > 1 ? 'survive' : 'win';
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

export function formatMode(mode, playKind) {
  const m = mode === 'duel' ? '兩人' : '多人';
  const p = playKind === 'online' ? '線上' : '本機';
  return `${p} · ${m}`;
}
