import {
  ACTIONS,
  ACTION_KEYS,
  validateChoice,
  resolveRound,
  getStartStats,
  getEliminationThreshold,
  getAliveNeighbor,
} from './rules.js';
import { pickAiAction } from './ai.js';

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export function formatActionHtml(id) {
  const a = ACTIONS[id];
  return `<strong>${a.label} ${a.name}</strong>`;
}

/**
 * @param {import('./rules.js').GameMode} mode
 * @param {Array<{name:string,isAi?:boolean}>} roster
 */
export function createLocalPlayers(mode, roster) {
  const stats = getStartStats(mode);
  return roster.map((r, i) => ({
    id: `p${i}`,
    name: r.name,
    isAi: !!r.isAi,
    bullets: stats.bullets,
    hp: stats.hp,
    alive: true,
    choice: null,
  }));
}

function formatLogLine(text) {
  return text
    .replace(/-1 血/g, '<span class="dmg">-1 血</span>')
    .replace(/\+(\d+) 子彈/g, '<span class="heal-bullets">+$1 子彈</span>');
}

export class LocalGameController {
  /**
   * @param {import('./rules.js').GameMode} mode
   * @param {object} callbacks
   */
  constructor(mode, callbacks) {
    this.mode = mode;
    this.cb = callbacks;
    this.players = [];
    this.round = 1;
    this.phase = 'pick';
    this.currentPickerIndex = 0;
    this.awaitingFinalRound = false;
    this.isFinalRound = false;
    this.eliminatedThisSession = 0;
    this.selectedAction = null;
  }

  start(roster) {
    this.players = createLocalPlayers(this.mode, roster);
    this.players.forEach((p) => {
      p.revealedAction = null;
    });
    this.round = 1;
    this.phase = 'pick';
    this.awaitingFinalRound = false;
    this.isFinalRound = false;
    this.eliminatedThisSession = 0;
    this.autoPickAi();
    this.startPickPhase();
  }

  autoPickAi() {
    for (const p of this.players) {
      if (!p.isAi || !p.alive || p.choice) continue;
      const opponents = this.players.filter((o) => o.id !== p.id);
      p.choice = pickAiAction(p, opponents, this.mode);
    }
  }

  getAliveNeighbor(playerId, direction) {
    return getAliveNeighbor(this.players, playerId, direction);
  }

  shouldEndAfterRound() {
    const alive = this.players.filter((p) => p.alive);
    if (alive.length <= 1) return true;
    if (this.mode === 'multi') return this.isFinalRound;
    return false;
  }

  updateFinalRoundSchedule() {
    if (this.mode === 'duel') return;
    if (this.isFinalRound || this.awaitingFinalRound) return;
    if (this.eliminatedThisSession >= getEliminationThreshold(this.players.length)) {
      this.awaitingFinalRound = true;
    }
  }

  startPickPhase() {
    this.phase = 'pick';
    if (this.awaitingFinalRound) {
      this.isFinalRound = true;
      this.awaitingFinalRound = false;
    }
    this.autoPickAi();

    const humanNeedPick = this.players.findIndex(
      (p) => p.alive && !p.isAi && p.choice === null
    );
    if (humanNeedPick < 0) {
      this.doReveal();
      return;
    }

    this.currentPickerIndex = humanNeedPick;
    const picker = this.players[humanNeedPick];
    this.selectedAction = null;
    this.cb.onPickPhase({
      round: this.round,
      isFinalRound: this.isFinalRound,
      picker,
      players: this.players,
      phase: this.phase,
    });
  }

  confirmPick(action) {
    const picker = this.players[this.currentPickerIndex];
    if (!picker || picker.isAi) return;
    picker.choice = action;
    this.autoPickAi();
    const humansLeft = this.players.some((p) => p.alive && !p.isAi && !p.choice);
    if (!humansLeft && this.players.filter((p) => p.alive).every((p) => p.choice)) {
      this.doReveal();
    } else {
      this.startPickPhase();
    }
  }

  doReveal() {
    this.phase = 'reveal';
    const { logs, eliminatedCount } = resolveRound(this.players, this.mode);
    this.eliminatedThisSession += eliminatedCount;
    this.players.forEach((p) => {
      p.choice = null;
      p.revealedAction = null;
    });
    this.updateFinalRoundSchedule();
    this.cb.onReveal({
      round: this.round,
      players: this.players,
      logs: logs.map(formatLogLine),
      shouldEnd: this.shouldEndAfterRound(),
      awaitingFinalRound: this.awaitingFinalRound,
      isFinalRound: this.isFinalRound,
    });
  }

  nextRound() {
    if (this.shouldEndAfterRound()) {
      this.phase = 'ended';
      this.cb.onEnd({ players: this.players, mode: this.mode });
      return;
    }
    this.round++;
    this.players.forEach((p) => {
      p.revealedAction = null;
    });
    this.startPickPhase();
  }
}

export { ACTIONS, ACTION_KEYS, validateChoice };

export function renderTracker(type, value, max, label) {
  const dots = Array.from({ length: max + 1 }, (_, i) => {
    const filled = i <= value && i > 0;
    const hand = i === value;
    return `<div class="tracker-dot ${filled ? 'filled' : ''} ${hand ? 'hand-here' : ''}">${i}</div>`;
  }).join('');
  return `
    <div class="tracker ${type}">
      <div class="tracker-label">${label}（${value}）</div>
      <div class="tracker-scale">${dots}</div>
    </div>
  `;
}
