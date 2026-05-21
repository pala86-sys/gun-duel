import { SPOTS, canThiefPickSpot, getWinThreshold } from './rules.js';

/**
 * @param {import('./game.js').ChickenGame} game
 * @param {{ hasKey: boolean, score: number }} player
 */
export function pickChickenThiefSpot(game, player) {
  const legal = SPOTS.filter((s) => canThiefPickSpot(player, s, game.effectMode));
  if (!legal.length) return 4;

  const need = getWinThreshold(game.mode) - player.score;
  if (legal.includes(4) && (need <= 4 || Math.random() < 0.55)) return 4;
  if (legal.includes(5) && (need <= 5 || Math.random() < 0.4)) return 5;
  if (legal.includes(2) && game.effectMode !== 'none' && !player.hasKey && Math.random() < 0.28) {
    return 2;
  }
  if (legal.includes(3) && game.effectMode === 'full' && Math.random() < 0.22) return 3;
  if (legal.includes(1) && game.effectMode !== 'none' && Math.random() < 0.18) return 1;

  const weights = legal.map((s) => (s === 4 ? 5 : s === 5 ? 4 : s === 2 ? 2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < legal.length; i++) {
    r -= weights[i];
    if (r <= 0) return legal[i];
  }
  return legal[legal.length - 1];
}

/** 防守盲選 2 格：不可讀取偷竊方已選號碼；依對手是否持鑰匙調整權重 */
function pickTwoGuardSpotsBlind({ thiefHasKey = false } = {}) {
  const pool = thiefHasKey
    ? [
        { spot: 4, w: 4 },
        { spot: 5, w: 4 },
        { spot: 3, w: 2 },
        { spot: 2, w: 1.5 },
        { spot: 1, w: 1 },
      ]
    : [
        { spot: 4, w: 5 },
        { spot: 3, w: 2.5 },
        { spot: 2, w: 2 },
        { spot: 1, w: 1.5 },
        { spot: 5, w: 0.12 },
      ];
  const picks = [];
  const remaining = [...pool];
  while (picks.length < 2 && remaining.length) {
    const total = remaining.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < remaining.length; i++) {
      r -= remaining[i].w;
      if (r <= 0) {
        picks.push(remaining[i].spot);
        remaining.splice(i, 1);
        break;
      }
    }
  }
  return picks;
}

/**
 * @param {import('./game.js').ChickenGame} game
 * @param {{ id: string, isAi?: boolean }} picker
 * @returns {number[]}
 */
export function pickChickenGuardSpots(game, picker) {
  if (game.mode === '2p' && game.phase === 'guard-pick') {
    // 實體規則：守方選 2 格時不知道偷了哪一格，AI 不可讀 thief.pick
    const thief = game.players[game.thiefIndex];
    return pickTwoGuardSpotsBlind({ thiefHasKey: !!thief?.hasKey });
  }

  if (game.mode === 'multi' && game.phase === 'guard-pick') {
    const anyThiefHasKey = game.players.some((p) => p.id !== picker.id && p.hasKey);
    if (anyThiefHasKey && Math.random() < 0.65) return [4, 5];
    return pickTwoGuardSpotsBlind({ thiefHasKey: anyThiefHasKey });
  }

  return [4, 5];
}
