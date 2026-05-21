import {
  getInitialScore,
  getWinThreshold,
  canThiefPickSpot,
  checkWinner,
  resolve2pRound,
  resolveMultiRound,
  resolveBonusSteal,
  SPOTS,
} from './rules.js';

let idSeq = 0;
function uid() {
  return `ch_${++idSeq}`;
}

/**
 * @typedef {'full'|'simple'|'none'} EffectMode
 * @typedef {'2p'|'multi'} ChickenMode
 * @typedef {'guard-pick'|'thief-pick'|'thieves-pick'|'reveal'|'ended'} Phase
 */

export class ChickenGame {
  /**
   * @param {ChickenMode} mode
   * @param {EffectMode} effectMode
   * @param {string[]} names
   * @param {object} callbacks
   */
  constructor(mode, effectMode, names, callbacks = {}, options = {}) {
    this.mode = mode;
    this.effectMode = effectMode;
    this.cb = callbacks;
    this.online = !!options.online;
    this.players = names.map((name, i) => ({
      id: uid(),
      name: name.trim() || `玩家${i + 1}`,
      score: getInitialScore(mode, i),
      hasKey: false,
      pick: null,
      picks: [],
    }));
    this.starterIndex = 0;
    this.thiefIndex = 0;
    this.round = 1;
    this.phase = mode === '2p' ? 'thief-pick' : 'guard-pick';
    this.extraSteal2p = false;
    this.extraStealQueue = [];
    this.lastLogs = [];
    this.pendingGuardPicks = null;
    this.pendingThiefPicks = {};
  }

  get starter() {
    return this.players[this.starterIndex];
  }

  get threshold() {
    return getWinThreshold(this.mode);
  }

  /** @param {string} [playerId] */
  canPlayerPick(playerId) {
    const p = this.players.find((x) => x.id === playerId);
    if (!p || this.phase === 'reveal' || this.phase === 'ended') return false;
    if (this.mode === '2p') {
      if (this.phase === 'thief-pick') return p.id === this.players[this.thiefIndex].id;
      if (this.phase === 'guard-pick') return p.id === this.players[1 - this.thiefIndex].id;
      return false;
    }
    if (this.phase === 'guard-pick') return p.id === this.starter.id;
    if (this.phase === 'thieves-pick') {
      if (this.extraStealQueue.length) return playerId === this.extraStealQueue[0];
      if (p.id === this.starter.id) return false;
      return this.pendingThiefPicks[playerId] == null;
    }
    return false;
  }

  /** @returns {object|null} current picker（本機輪流用） */
  getCurrentPicker() {
    if (this.online) return null;
    for (const p of this.players) {
      if (this.canPlayerPick(p.id)) return p;
    }
    return null;
  }

  getPickLimit() {
    if (this.mode === '2p') {
      return this.phase === 'guard-pick' ? 2 : 1;
    }
    if (this.phase === 'guard-pick') return 2;
    return 1;
  }

  /** @param {number} spot @param {string} [playerId] */
  submitPick(spot, playerId) {
    const picker = playerId
      ? this.players.find((p) => p.id === playerId)
      : this.getCurrentPicker();
    if (!picker) return { error: '目前無需選擇' };
    if (playerId && !this.canPlayerPick(playerId)) return { error: '還沒輪到你選擇' };

    if (this.mode === '2p') {
      return this.submit2p(picker, spot);
    }
    return this.submitMulti(picker, spot);
  }

  /** @param {string} playerId @param {number[]} spots */
  submitGuardSpots(playerId, spots) {
    if (!this.canPlayerPick(playerId)) return { error: '還沒輪到你選擇' };
    const picker = this.players.find((p) => p.id === playerId);
    if (!picker || spots.length !== 2) return { error: '請選 2 個號碼' };
    picker.picks = [];
    if (this.mode === '2p' && this.phase === 'guard-pick') {
      picker.picks = [...spots];
      const thief = this.players[this.thiefIndex];
      const res = resolve2pRound(
        { players: this.players, thiefIndex: this.thiefIndex },
        thief.pick,
        picker.picks,
        this.effectMode
      );
      this.lastLogs = res.logs;
      this.phase = 'reveal';
      this.extraSteal2p = res.extraSteal;
      this.cb.onReveal?.(this.getPublicState());
      return {};
    }
    if (this.mode === 'multi' && this.phase === 'guard-pick') {
      this.pendingGuardPicks = [...spots];
      picker.picks = [];
      this.phase = 'thieves-pick';
      this.players.forEach((p) => {
        if (p.id !== this.starter.id) p.pick = null;
      });
      this.pendingThiefPicks = {};
      this.notify();
      return {};
    }
    return { error: '階段錯誤' };
  }

  submit2p(picker, spot) {
    if (this.phase === 'thief-pick') {
      if (!canThiefPickSpot(picker, spot, this.effectMode)) {
        return { error: '5 號需鑰匙才能偷' };
      }
      picker.pick = spot;
      this.phase = 'guard-pick';
      this.notify();
      return {};
    }
    if (this.phase === 'guard-pick') {
      if (!picker.picks) picker.picks = [];
      if (picker.picks.includes(spot)) return { error: '已選過此號' };
      picker.picks.push(spot);
      if (picker.picks.length < 2) {
        this.notify();
        return {};
      }
      const thief = this.players[this.thiefIndex];
      const res = resolve2pRound(
        { players: this.players, thiefIndex: this.thiefIndex },
        thief.pick,
        picker.picks,
        this.effectMode
      );
      this.lastLogs = res.logs;
      this.phase = 'reveal';
      this.extraSteal2p = res.extraSteal;
      this.cb.onReveal?.(this.getPublicState());
      return {};
    }
    return { error: '階段錯誤' };
  }

  submitMulti(picker, spot) {
    if (this.phase === 'guard-pick') {
      if (!picker.picks) picker.picks = [];
      if (picker.picks.includes(spot)) return { error: '已選過' };
      picker.picks.push(spot);
      if (picker.picks.length < 2) {
        this.notify();
        return {};
      }
      this.pendingGuardPicks = [...picker.picks];
      picker.picks = [];
      this.phase = 'thieves-pick';
      this.players.forEach((p) => {
        if (p.id !== this.starter.id) p.pick = null;
      });
      this.pendingThiefPicks = {};
      this.notify();
      return {};
    }
    if (this.phase === 'thieves-pick') {
      if (!canThiefPickSpot(picker, spot, this.effectMode)) {
        return { error: '5 號需鑰匙才能偷' };
      }
      if (this.extraStealQueue.length) {
        const res = resolveBonusSteal(
          this.starter,
          this.pendingGuardPicks,
          picker,
          spot,
          this.effectMode
        );
        this.lastLogs = [...(this.lastLogs || []), ...res.logs];
        this.extraStealQueue.shift();
        if (this.extraStealQueue.length) {
          this.notify();
          return {};
        }
        this.phase = 'reveal';
        this.cb.onReveal?.(this.getPublicState());
        return {};
      }
      picker.pick = spot;
      this.pendingThiefPicks[picker.id] = spot;
      const thieves = this.players.filter((p) => p.id !== this.starter.id);
      const allDone = thieves.every((p) => this.pendingThiefPicks[p.id] != null);
      if (!allDone) {
        this.notify();
        return {};
      }
      return this.finishMultiThieves();
    }
    return { error: '階段錯誤' };
  }

  finishMultiThieves() {
    const picks = { ...this.pendingThiefPicks };
    const res = resolveMultiRound(
      {
        players: this.players,
        starterIndex: this.starterIndex,
      },
      this.pendingGuardPicks,
      picks,
      this.effectMode
    );
    this.lastLogs = res.logs;
    this.extraStealQueue = res.extraStealQueue || [];
    if (this.extraStealQueue.length) {
      this.phase = 'thieves-pick';
      this.notify();
      return {};
    }
    this.phase = 'reveal';
    this.cb.onReveal?.(this.getPublicState());
    return {};
  }

  advanceAfterReveal() {
    const winners = checkWinner(this.players, this.mode);
    if (winners) {
      this.phase = 'ended';
      this.cb.onEnd?.(this.getPublicState(), winners);
      return;
    }

    if (this.mode === '2p' && this.extraSteal2p) {
      this.extraSteal2p = false;
      const thief = this.players[this.thiefIndex];
      const guard = this.players[1 - this.thiefIndex];
      thief.pick = null;
      guard.picks = [];
      this.phase = 'thief-pick';
      this.round += 0;
      this.notify();
      return;
    }

    this.players.forEach((p) => {
      p.pick = null;
      p.picks = [];
    });
    this.pendingThiefPicks = {};
    this.pendingGuardPicks = null;
    this.extraStealQueue = [];

    if (this.mode === '2p') {
      this.starterIndex = 1 - this.starterIndex;
      this.thiefIndex = this.starterIndex;
    } else {
      this.starterIndex = (this.starterIndex + 1) % this.players.length;
    }

    this.round += 1;
    this.phase = this.mode === '2p' ? 'thief-pick' : 'guard-pick';
    this.notify();
  }

  getPublicState(viewerId = null) {
    const picker = this.getCurrentPicker();
    const hidePicks = this.phase !== 'reveal' && this.phase !== 'ended';
    return {
      mode: this.mode,
      effectMode: this.effectMode,
      round: this.round,
      phase: this.phase,
      threshold: this.threshold,
      starterIndex: this.starterIndex,
      thiefIndex: this.thiefIndex,
      extraSteal2p: this.extraSteal2p,
      lastLogs: this.lastLogs,
      pickerId: picker?.id ?? null,
      pickLimit: this.getPickLimit(),
      online: this.online,
      players: this.players.map((p) => {
        const isMe = viewerId && p.id === viewerId;
        const canPick = this.online && this.canPlayerPick(p.id);
        const showPick = !hidePicks || isMe;
        const hasChosen =
          this.online &&
          hidePicks &&
          (p.pick != null ||
            (p.picks?.length >= 2) ||
            this.pendingThiefPicks[p.id] != null);
        return {
          id: p.id,
          name: p.name,
          score: p.score,
          hasKey: p.hasKey,
          pick: showPick ? p.pick : hidePicks && hasChosen ? true : null,
          picks:
            showPick && Array.isArray(p.picks) && p.picks.length
              ? [...p.picks]
              : hidePicks && hasChosen && p.picks
                ? true
                : [],
          isStarter: p.id === this.starter.id,
          isThief: this.mode === '2p' && p.id === this.players[this.thiefIndex]?.id,
          canPick: this.online ? canPick : p.id === picker?.id,
          hasChosen: !!hasChosen,
        };
      }),
    };
  }

  notify() {
    this.cb.onPick?.(this.getPublicState());
  }
}

export { SPOTS };
