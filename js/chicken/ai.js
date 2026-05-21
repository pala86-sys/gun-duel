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

/**
 * @param {import('./game.js').ChickenGame} game
 * @param {{ id: string }} picker
 * @returns {number[]}
 */
export function pickChickenGuardSpots(game, picker) {
  if (game.mode === '2p' && game.phase === 'guard-pick') {
    const thief = game.players[game.thiefIndex];
    const thiefPick = thief?.pick;
    const picks = new Set();
    if (typeof thiefPick === 'number') picks.add(thiefPick);
    for (const spot of [5, 4, 3, 2, 1]) {
      if (picks.size >= 2) break;
      picks.add(spot);
    }
    return [...picks].slice(0, 2);
  }

  if (game.mode === 'multi' && game.phase === 'guard-pick') {
    const preferred = [5, 4, 3, 2, 1];
    if (Math.random() < 0.75) return [4, 5];
    return [preferred[0], preferred[1]];
  }

  return [4, 5];
}
