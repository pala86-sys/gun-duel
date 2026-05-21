/** 本局進行中：累積回合紀錄，結束時寫入戰績 */

/** @type {object|null} */
let session = null;

/**
 * @param {object} meta
 * @param {'gun'|'chicken'} meta.game
 */
export function startMatchSession(meta) {
  session = {
    ...meta,
    game: meta.game || 'gun',
    roundLogs: [],
    saved: false,
  };
}

export function appendRoundLogs(round, logs) {
  if (!session) return;
  const plain = logs.map((l) => String(l).replace(/<[^>]+>/g, ''));
  session.roundLogs.push({ round, logs: plain });
}

export function finishMatchSession(players, winners) {
  if (!session || session.saved) return null;
  session.saved = true;
  const payload = {
    game: session.game,
    mode: session.mode,
    playKind: session.playKind,
    roomCode: session.roomCode,
    myName: session.myName,
    myPlayerId: session.myPlayerId,
    players,
    winners,
    roundLogs: session.roundLogs,
    rounds: session.roundLogs.length,
  };
  session = null;
  return payload;
}

export function peekSession() {
  return session;
}

export function cancelMatchSession() {
  session = null;
}
