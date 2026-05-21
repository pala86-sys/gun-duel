/** 本局進行中：累積回合紀錄，結束時寫入戰績 */

/** @type {object|null} */
let session = null;

export function startMatchSession(meta) {
  session = {
    ...meta,
    roundLogs: [],
    saved: false,
  };
}

export function appendRoundLogs(round, logs) {
  if (!session) return;
  session.roundLogs.push({ round, logs: [...logs] });
}

export function finishMatchSession(players, winners) {
  if (!session || session.saved) return null;
  session.saved = true;
  const record = {
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
  return record;
}

export function peekSession() {
  return session;
}

export function cancelMatchSession() {
  session = null;
}
