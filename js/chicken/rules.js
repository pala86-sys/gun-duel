/** 怪盜雞排 vs 魯蛇三世 — 規則引擎 */

export const SPOTS = [1, 2, 3, 4, 5];

export const SPOT_INFO = {
  1: { label: '1', name: '迴轉', icon: '↻', desc: '再偷一次' },
  2: { label: '2', name: '鑰匙', icon: '🔑', desc: '解鎖 5 號' },
  3: { label: '3', name: '扣分', icon: '−1', desc: '守方/起始 −1 分' },
  4: { label: '4', name: '四分', icon: '4', desc: '得 4 分' },
  5: { label: '5', name: '金庫', icon: '🔒', desc: '需鑰匙才能偷' },
};

/** @typedef {'full'|'simple'|'none'} EffectMode */
/** @typedef {'2p'|'multi'} ChickenMode */

/**
 * @param {ChickenMode} mode
 * @param {number} seatIndex 0=起始位
 */
export function getInitialScore(mode, seatIndex) {
  if (mode === '2p') return seatIndex === 0 ? 0 : 2;
  return [3, 2, 1, 0][seatIndex] ?? 0;
}

export function getWinThreshold(mode) {
  return mode === '2p' ? 10 : 15;
}

/**
 * @param {object} p
 * @param {EffectMode} effects
 */
export function canThiefPickSpot(p, spot, effects) {
  if (spot === 5 && !p.hasKey) return false;
  return true;
}

/**
 * @param {Array<{id:string,name:string,score:number,hasKey:boolean}>} players
 * @param {ChickenMode} mode
 */
export function checkWinner(players, mode) {
  const threshold = getWinThreshold(mode);
  if (mode === '2p') {
    const w = players.find((p) => p.score >= threshold);
    return w ? [w] : null;
  }
  const hit = players.some((p) => p.score >= threshold);
  if (!hit) return null;
  const max = Math.max(...players.map((p) => p.score));
  return players.filter((p) => p.score === max);
}

/**
 * 兩人：偷 vs 守
 * @returns {{ logs: string[], extraSteal: boolean, success: boolean }}
 */
export function resolve2pRound(state, thiefPick, guardPicks, effectMode) {
  const thief = state.players[state.thiefIndex];
  const guard = state.players[1 - state.thiefIndex];
  const guarded = guardPicks.includes(thiefPick);
  const logs = [];

  logs.push(
    `${thief.name} 偷 <strong>${thiefPick}</strong> · ${guard.name} 守 ${guardPicks.join('、')}`
  );

  if (guarded) {
    logs.push('🚫 偷竊失敗，不得分');
    return { logs, extraSteal: false, success: false };
  }

  thief.score += thiefPick;
  logs.push(`✅ 偷竊成功！${thief.name} +${thiefPick} 分（現在 ${thief.score} 分）`);

  let extraSteal = false;
  if (effectMode !== 'none') {
    if (thiefPick === 1 && effectMode === 'full') {
      extraSteal = true;
      logs.push('↻ 發動 1：再偷一次（不換起始）');
    }
    if (thiefPick === 2 && effectMode !== 'none') {
      thief.hasKey = true;
      logs.push(`🔑 ${thief.name} 取得鑰匙，可偷 5 號`);
    }
    if (thiefPick === 3 && effectMode === 'full') {
      guard.score = Math.max(0, guard.score - 1);
      logs.push(`−1 ${guard.name} 扣 1 分（現在 ${guard.score} 分）`);
    }
  }

  return { logs, extraSteal, success: true };
}

/**
 * 三四人：起始守、其他人偷
 */
export function resolveMultiRound(state, guardPicks, thiefPicks, effectMode) {
  const starter = state.players[state.starterIndex];
  const logs = [];
  logs.push(`${starter.name}（起始）守 ${guardPicks.sort((a, b) => a - b).join('、')}`);

  const successes = [];
  for (const [playerId, spot] of Object.entries(thiefPicks)) {
    const thief = state.players.find((p) => p.id === playerId);
    if (!thief || thief.id === starter.id) continue;
    if (guardPicks.includes(spot)) {
      logs.push(`🚫 ${thief.name} 偷 ${spot} 失敗`);
      continue;
    }
    thief.score += spot;
    successes.push({ thief, spot });
    logs.push(`✅ ${thief.name} 偷 ${spot} 成功 +${spot} 分（${thief.score} 分）`);
  }

  let extraStealQueue = [];
  let starterPenalty3 = false;

  if (effectMode === 'full') {
    for (const { thief, spot } of successes) {
      if (spot === 2) {
        thief.hasKey = true;
        logs.push(`🔑 ${thief.name} 取得鑰匙`);
      }
    }
    const any3 = successes.some((s) => s.spot === 3);
    if (any3) {
      starter.score = Math.max(0, starter.score - 1);
      starterPenalty3 = true;
      logs.push(`−1 ${starter.name} 被偷 3 號，扣 1 分（${starter.score} 分）`);
    }
    extraStealQueue = successes.filter((s) => s.spot === 1).map((s) => s.thief.id);
    if (extraStealQueue.length) {
      logs.push(`↻ ${extraStealQueue.map((id) => state.players.find((p) => p.id === id)?.name).join('、')} 再偷一次`);
    }
  } else if (effectMode === 'simple') {
    extraStealQueue = successes.filter((s) => s.spot === 1).map((s) => s.thief.id);
    if (extraStealQueue.length) {
      logs.push(`↻ 再偷一次（僅 1 號效果）`);
    }
  }

  return { logs, extraStealQueue, successes };
}

/** 多人：僅「再偷一次」的單獨結算 */
export function resolveBonusSteal(starter, guardPicks, thief, spot, effectMode) {
  const logs = [];
  if (guardPicks.includes(spot)) {
    logs.push(`🚫 ${thief.name} 加偷 ${spot} 失敗`);
    return { logs };
  }
  thief.score += spot;
  logs.push(`✅ ${thief.name} 加偷 ${spot} 成功 +${spot} 分（${thief.score} 分）`);
  if (effectMode === 'full' && spot === 2) {
    thief.hasKey = true;
    logs.push(`🔑 ${thief.name} 取得鑰匙`);
  }
  if (effectMode === 'full' && spot === 3) {
    starter.score = Math.max(0, starter.score - 1);
    logs.push(`−1 ${starter.name} 扣 1 分（${starter.score} 分）`);
  }
  return { logs };
}
