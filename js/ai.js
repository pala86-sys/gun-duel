import { ACTIONS, ACTION_KEYS, validateChoice } from './rules.js';

/**
 * @param {{ bullets: number, hp: number, alive: boolean }} self
 * @param {Array<{ bullets: number, hp: number, alive: boolean, isAi?: boolean }>} opponents
 * @param {'duel'|'multi'} mode
 * @returns {import('./rules.js').ActionId}
 */
export function pickAiAction(self, opponents, mode) {
  const aliveOps = opponents.filter((p) => p.alive);
  const avgOppBullets =
    aliveOps.length > 0
      ? aliveOps.reduce((s, p) => s + p.bullets, 0) / aliveOps.length
      : 0;

  const affordable = ACTION_KEYS.filter((key) => {
    const cost = Math.max(0, -ACTIONS[key].cost);
    return self.bullets >= cost;
  });

  const pick = (key) => validateChoice(key, self.bullets);

  if (self.bullets === 0) {
    return pick(affordable.includes('0') ? '0' : '1');
  }

  if (self.hp <= 1 && avgOppBullets >= 1.5 && affordable.includes('X')) {
    if (Math.random() < 0.55) return 'X';
  }

  if (self.bullets <= 1 && affordable.includes('0')) {
    if (Math.random() < 0.7) return '0';
  }

  if (self.bullets >= 2 && affordable.includes('3')) {
    if (Math.random() < 0.35) return '3';
  }

  if (self.bullets >= 1 && affordable.includes('2')) {
    if (Math.random() < 0.45) return '2';
  }

  if (affordable.includes('1')) {
    if (mode === 'duel' && self.bullets <= 2) return '1';
    if (Math.random() < 0.25) return '1';
  }

  if (affordable.includes('0') && self.bullets < 3) {
    return '0';
  }

  const fallback = affordable.length ? affordable[Math.floor(Math.random() * affordable.length)] : '1';
  return pick(fallback);
}
