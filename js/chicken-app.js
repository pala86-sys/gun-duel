import { ChickenGame, SPOTS } from './chicken/game.js';
import { SPOT_INFO, checkWinner } from './chicken/rules.js';
import {
  initChickenOnline,
  isChickenOnline,
  onChConfirmOnline,
  onChNextOnline,
  leaveChOnline,
} from './chicken-online.js';
import {
  startMatchSession,
  appendRoundLogs,
  finishMatchSession,
  cancelMatchSession,
  peekSession,
} from './match-session.js';
import { saveMatch, buildChickenMatchRecord } from './stats.js';

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

const screens = {
  chSetup: document.getElementById('screen-ch-setup'),
  chGame: document.getElementById('screen-ch-game'),
};

export const els = {
  chPlayerCount: document.getElementById('ch-player-count'),
  chNames: document.getElementById('ch-name-inputs'),
  chEffectMode: document.getElementById('ch-effect-mode'),
  chPlayersArea: document.getElementById('ch-players-area'),
  chSpotCards: document.getElementById('ch-spot-cards'),
  chPrompt: document.getElementById('ch-prompt'),
  chBtnConfirm: document.getElementById('ch-btn-confirm'),
  chRevealLog: document.getElementById('ch-reveal-log'),
  chRoundLabel: document.getElementById('ch-round-label'),
  chPhaseHint: document.getElementById('ch-phase-hint'),
  chActionPanel: document.getElementById('ch-action-panel'),
  chWaitingPanel: document.getElementById('ch-waiting-panel'),
  chRevealPanel: document.getElementById('ch-reveal-panel'),
  chEndPanel: document.getElementById('ch-end-panel'),
  chEndTitle: document.getElementById('ch-end-title'),
  chEndBody: document.getElementById('ch-end-body'),
  chBtnNext: document.getElementById('ch-btn-next'),
  chWaitHostNext: document.getElementById('ch-wait-host-next'),
};

/** @type {ChickenGame|null} */
let chickenGame = null;
let chSetupCount = 2;
let chSelectedSpots = [];

export function showChickenScreen(name) {
  Object.values(screens).forEach((el) => el?.classList.remove('active'));
  screens[name]?.classList.add('active');
}

function renderChNameInputs() {
  const defaults = ['怪盜雞排', '魯蛇三世', '玩家3', '玩家4'];
  els.chNames.innerHTML = Array.from({ length: chSetupCount }, (_, i) => `
    <label class="field"><span>玩家 ${i + 1}</span>
      <input type="text" data-ch-index="${i}" value="${escapeHtml(defaults[i] || `玩家${i + 1}`)}" maxlength="12">
    </label>`).join('');
}

export function getPhaseText(state) {
  if (state.phase === 'ended') return '遊戲結束';
  if (state.phase === 'reveal') return '公布結果';
  const picker = state.players.find((p) => p.id === state.pickerId);
  if (!picker) return '';
  if (state.mode === '2p') {
    if (state.phase === 'thief-pick') return `${picker.name} 偷竊（選 1 個）`;
    if (state.phase === 'guard-pick') return `${picker.name} 防守（選 2 個）`;
  } else {
    if (state.phase === 'guard-pick') return `${picker.name} 起始守衛（選 2 個）`;
    if (state.phase === 'thieves-pick') return `${picker.name} 偷竊（選 1 個）`;
  }
  return '';
}

export function renderPlayersOnline(state) {
  els.chPlayersArea.innerHTML = state.players
    .map((p) => {
      const tags = [];
      if (p.isStarter) tags.push('起始');
      if (p.isThief) tags.push('偷');
      if (p.hasKey) tags.push('🔑');
      const isYou = state.you && p.id === state.you.id;
      let reveal = '';
      if (state.phase === 'reveal' || state.phase === 'ended') {
        if (typeof p.pick === 'number') reveal = `<div class="ch-pick-reveal">偷 ${p.pick}</div>`;
        else if (Array.isArray(p.picks) && p.picks.length) reveal = `<div class="ch-pick-reveal">守 ${p.picks.join('、')}</div>`;
      } else if (p.hasChosen) {
        reveal = `<div class="ch-pick-reveal muted">已選好</div>`;
      }
      return `
        <article class="player-card ch-player ${p.canPick ? 'active-turn' : ''} ${isYou ? 'is-you' : ''}">
          <div class="player-header">
            <span class="player-name">${escapeHtml(p.name)}${isYou ? '（你）' : ''}</span>
            <span class="ch-score">${p.score} 分</span>
          </div>
          <div class="ch-tags">${tags.map((t) => `<span class="ch-tag">${t}</span>`).join('')}</div>
          ${reveal}
        </article>`;
    })
    .join('');
}

function renderPlayers(state) {
  els.chPlayersArea.innerHTML = state.players
    .map((p) => {
      const tags = [];
      if (p.isStarter) tags.push('起始');
      if (p.isThief) tags.push('偷');
      if (p.hasKey) tags.push('🔑');
      let reveal = '';
      if (state.phase === 'reveal') {
        if (p.pick != null) reveal = `<div class="ch-pick-reveal">偷 ${p.pick}</div>`;
        else if (p.picks?.length) reveal = `<div class="ch-pick-reveal">守 ${p.picks.join('、')}</div>`;
      }
      return `
        <article class="player-card ch-player ${p.id === state.pickerId ? 'active-turn' : ''}">
          <div class="player-header">
            <span class="player-name">${escapeHtml(p.name)}</span>
            <span class="ch-score">${p.score} 分</span>
          </div>
          <div class="ch-tags">${tags.map((t) => `<span class="ch-tag">${t}</span>`).join('')}</div>
          ${reveal}
        </article>`;
    })
    .join('');
}

function renderSpotButtons(state) {
  if (!chickenGame) return;
  // 必須改 game 內的玩家；state.players 是 getPublicState 的副本
  const picker = chickenGame.players.find((p) => p.id === state.pickerId);
  if (!picker) return;
  const isGuard = state.pickLimit === 2;
  chSelectedSpots = picker.picks?.length ? [...picker.picks] : picker.pick != null ? [picker.pick] : [];

  els.chSpotCards.innerHTML = SPOTS.map((spot) => {
    const info = SPOT_INFO[spot];
    const locked = spot === 5 && !picker.hasKey && !isGuard;
    const selected = picker.pick === spot || chSelectedSpots.includes(spot);
    return `
      <button type="button" class="ch-spot-btn ${locked ? 'locked' : ''} ${selected ? 'selected' : ''}"
        data-spot="${spot}" ${locked ? 'disabled' : ''}>
        <span class="ch-spot-num">${info.icon || info.label}</span>
        <span class="ch-spot-label">${info.label} ${info.name}</span>
      </button>`;
  }).join('');

  els.chSpotCards.querySelectorAll('.ch-spot-btn:not(:disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const spot = Number(btn.dataset.spot);
      if (isGuard) {
        const idx = chSelectedSpots.indexOf(spot);
        if (idx >= 0) chSelectedSpots.splice(idx, 1);
        else if (chSelectedSpots.length < 2) chSelectedSpots.push(spot);
        else return;
        picker.picks = [...chSelectedSpots];
        renderSpotButtons(state);
        els.chBtnConfirm.disabled = chSelectedSpots.length !== 2;
      } else {
        els.chSpotCards.querySelectorAll('.ch-spot-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        picker.pick = spot;
        els.chBtnConfirm.disabled = false;
      }
    });
  });

  els.chBtnConfirm.disabled = isGuard ? chSelectedSpots.length !== 2 : picker.pick == null;
}

function applyState(state) {
  const modeLabel = state.mode === '2p' ? '兩人' : `${state.players.length}人`;
  els.chRoundLabel.textContent = `第 ${state.round} 回合 · ${modeLabel} · 目標 ${state.threshold} 分`;
  els.chPhaseHint.textContent = getPhaseText(state);

  if (state.phase === 'reveal' || state.phase === 'ended') {
    els.chActionPanel.classList.add('hidden');
    els.chRevealPanel.classList.remove('hidden');
    renderPlayers(state);
    els.chRevealLog.innerHTML = `<ul class="reveal-log">${state.lastLogs.map((l) => `<li>${l}</li>`).join('')}</ul>`;
    return;
  }

  els.chActionPanel.classList.remove('hidden');
  els.chRevealPanel.classList.add('hidden');
  renderPlayers(state);
  const picker = state.players.find((p) => p.id === state.pickerId);
  els.chPrompt.textContent = picker
    ? `${picker.name}，請按住選擇（勿讓他人看到）`
    : '等待…';
  renderSpotButtons(state);
}

function recordChickenEnd(state, winners) {
  const payload = finishMatchSession(
    state.players.map((p) => ({ ...p, id: p.id })),
    winners
  );
  if (!payload) return;
  saveMatch(buildChickenMatchRecord(payload));
  if (typeof window.__updateStatsLines === 'function') window.__updateStatsLines();
}

function showChickenEnd(state, winners) {
  applyState(state);
  els.chActionPanel.classList.add('hidden');
  els.chRevealPanel.classList.add('hidden');
  els.chEndPanel.classList.remove('hidden');
  if (state.mode === '2p' && winners.length === 1) {
    els.chEndTitle.textContent = '🏆 世上最強怪盜！';
    els.chEndBody.innerHTML = `<p><strong>${escapeHtml(winners[0].name)}</strong> 勝利！</p><p>${winners[0].score} 分</p>`;
  } else {
    els.chEndTitle.textContent = '遊戲結束';
    els.chEndBody.innerHTML = `<p>最高分：</p><p>${winners.map((w) => `<strong>${escapeHtml(w.name)}</strong> ${w.score}分`).join('、')}</p>`;
  }
}

function startChickenGame() {
  const names = Array.from(els.chNames.querySelectorAll('input')).map(
    (inp) => inp.value.trim() || '玩家'
  );
  const mode = chSetupCount === 2 ? '2p' : 'multi';
  const effectMode = els.chEffectMode.value;
  chickenGame = new ChickenGame(mode, effectMode, names, {
    onPick: (state) => applyState(state),
    onReveal: (state) => {
      appendRoundLogs(state.round, state.lastLogs);
      applyState(state);
      const winners = checkWinner(chickenGame.players, chickenGame.mode);
      if (winners) {
        chickenGame.phase = 'ended';
        recordChickenEnd(state, winners);
        showChickenEnd(state, winners);
      }
    },
    onEnd: (state, winners) => {
      recordChickenEnd(state, winners);
      showChickenEnd(state, winners);
    },
  });

  startMatchSession({
    game: 'chicken',
    mode,
    playKind: 'local',
    myName: chickenGame.players[0].name,
    myPlayerId: chickenGame.players[0].id,
  });

  showChickenScreen('chGame');
  els.chEndPanel.classList.add('hidden');
  els.chRevealPanel.classList.add('hidden');
  applyState(chickenGame.getPublicState());
}

/** @typedef {typeof els & { toast: Function, showChickenScreen: Function, openChickenSetup: Function, showHubFromChicken: Function, getPhaseText: Function, renderPlayersOnline: Function }} ChickenUiAPI */

export function initChickenApp() {
    initChickenOnline({
      els,
      toast,
      showChickenScreen,
      openChickenSetup,
      showHubFromChicken,
      getPhaseText,
      renderPlayersOnline,
      recordChickenMatchFromOnline,
    });

  document.getElementById('btn-ch-setup-back')?.addEventListener('click', () => {
    if (isChickenOnline()) leaveChOnline();
    else {
      cancelMatchSession();
      showHubFromChicken();
    }
  });

  document.getElementById('btn-ch-count-minus')?.addEventListener('click', () => {
    chSetupCount = Math.max(2, chSetupCount - 1);
    els.chPlayerCount.textContent = String(chSetupCount);
    renderChNameInputs();
  });

  document.getElementById('btn-ch-count-plus')?.addEventListener('click', () => {
    chSetupCount = Math.min(4, chSetupCount + 1);
    els.chPlayerCount.textContent = String(chSetupCount);
    renderChNameInputs();
  });

  document.getElementById('btn-ch-start')?.addEventListener('click', startChickenGame);

  els.chBtnConfirm?.addEventListener('click', () => {
    if (isChickenOnline()) {
      onChConfirmOnline();
      return;
    }
    if (!chickenGame) return;
    const picker = chickenGame.getCurrentPicker();
    if (!picker) return;
    if (chickenGame.getPickLimit() === 2) {
      const picks = [...chSelectedSpots];
      if (picks.length !== 2) return;
      picker.picks = [];
      for (const spot of picks) {
        const err = chickenGame.submitPick(spot);
        if (err.error) {
          toastCh(err.error);
          return;
        }
      }
    } else {
      const spot = picker.pick ?? chSelectedSpots[0];
      if (spot == null) return;
      const err = chickenGame.submitPick(spot);
      if (err.error) toastCh(err.error);
    }
  });

  document.getElementById('ch-btn-next')?.addEventListener('click', () => {
    if (isChickenOnline()) onChNextOnline();
    else chickenGame?.advanceAfterReveal();
  });

  document.getElementById('ch-btn-quit')?.addEventListener('click', () => {
    if (confirm('離開遊戲？')) {
      cancelMatchSession();
      if (isChickenOnline()) leaveChOnline();
      else {
        chickenGame = null;
        showHubFromChicken();
      }
    }
  });

  document.getElementById('ch-btn-home')?.addEventListener('click', () => {
    if (isChickenOnline()) leaveChOnline();
    else showHubFromChicken();
  });
  document.getElementById('ch-btn-again')?.addEventListener('click', () => {
    els.chEndPanel.classList.add('hidden');
    showChickenScreen('chSetup');
  });
}

export function toast(msg) {
  toastCh(msg);
}

function toastCh(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2500);
}

export function recordChickenMatchFromOnline(state) {
  if (!state.you) return;
  const winners =
    state.winners?.length > 0
      ? state.winners.map((w) => ({ id: w.id, name: w.name, score: w.score ?? 0 }))
      : state.players;
  const payload = finishMatchSession(state.players, winners);
  if (!payload) return;
  payload.myPlayerId = state.you.id;
  payload.myName = state.you.name;
  payload.playKind = 'online';
  payload.roomCode = state.code;
  saveMatch(buildChickenMatchRecord(payload));
}

export function openChickenSetup() {
  chSetupCount = 2;
  if (els.chPlayerCount) els.chPlayerCount.textContent = '2';
  renderChNameInputs();
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  screens.chSetup?.classList.add('active');
}

export function showHubFromChicken() {
  chickenGame = null;
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById('screen-hub')?.classList.add('active');
}
