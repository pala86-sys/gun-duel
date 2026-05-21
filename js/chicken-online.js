import { OnlineClient } from './online.js';
import {
  startMatchSession,
  appendRoundLogs,
  peekSession,
  cancelMatchSession,
} from './match-session.js';
import { SPOT_INFO } from './chicken/rules.js';
import { SPOTS } from './chicken/game.js';

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** @type {import('./chicken-app.js').ChickenUiAPI} */
let ui = null;

/** @type {OnlineClient|null} */
let chOnline = null;
/** @type {object|null} */
let chOnlineState = null;
let chOcCount = 2;
let chSelectedSpots = [];

export function initChickenOnline(api) {
  ui = api;

  document.getElementById('btn-ch-online-create')?.addEventListener('click', () => {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    document.getElementById('screen-ch-online-create')?.classList.add('active');
  });
  document.getElementById('btn-ch-online-join')?.addEventListener('click', () => {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    document.getElementById('screen-ch-online-join')?.classList.add('active');
  });
  document.getElementById('btn-ch-oc-back')?.addEventListener('click', () => ui.openChickenSetup());
  document.getElementById('btn-ch-oj-back')?.addEventListener('click', () => ui.openChickenSetup());

  document.getElementById('ch-oc-count-minus')?.addEventListener('click', () => {
    chOcCount = Math.max(2, chOcCount - 1);
    document.getElementById('ch-oc-count').textContent = String(chOcCount);
  });
  document.getElementById('ch-oc-count-plus')?.addEventListener('click', () => {
    chOcCount = Math.min(4, chOcCount + 1);
    document.getElementById('ch-oc-count').textContent = String(chOcCount);
  });

  document.getElementById('btn-ch-create-room')?.addEventListener('click', createChRoom);
  document.getElementById('btn-ch-join-room')?.addEventListener('click', joinChRoom);
  document.getElementById('btn-ch-lobby-start')?.addEventListener('click', () => chOnline?.chStart());
  document.getElementById('btn-ch-leave-lobby')?.addEventListener('click', leaveChOnline);
}

async function ensureChOnline() {
  if (!chOnline) {
    chOnline = new OnlineClient();
    chOnline.onState = (state) => {
      chOnlineState = state;
      applyChOnlineState(state);
    };
    chOnline.onError = (msg) => ui.toast(msg);
  }
  if (!chOnline.connected) await chOnline.connect();
}

async function createChRoom() {
  const btn = document.getElementById('btn-ch-create-room');
  btn.disabled = true;
  btn.textContent = '連線中…';
  try {
    await ensureChOnline();
    chOnline.chCreate(
      document.getElementById('ch-host-name').value,
      chOcCount,
      document.getElementById('ch-oc-effect').value
    );
  } catch (e) {
    ui.toast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '建立房間';
  }
}

async function joinChRoom() {
  const code = document.getElementById('ch-join-code').value.trim().toUpperCase();
  if (code.length !== 4) {
    document.getElementById('ch-join-error').textContent = '請輸入 4 碼';
    document.getElementById('ch-join-error').classList.remove('hidden');
    return;
  }
  try {
    await ensureChOnline();
    chOnline.chJoin(code, document.getElementById('ch-join-name').value);
  } catch (e) {
    ui.toast(e.message);
  }
}

export function leaveChOnline() {
  chOnline?.disconnect();
  chOnline = null;
  chOnlineState = null;
  cancelMatchSession();
  ui.showHubFromChicken();
}

function applyChOnlineState(state) {
  if (state.phase === 'lobby') {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    document.getElementById('screen-ch-lobby')?.classList.add('active');
    document.getElementById('ch-lobby-code').textContent = state.code;
    document.getElementById('ch-invite-url').textContent = `${location.origin}${location.pathname}`;
    const you = state.you;
    const isHost = you?.id === state.hostPlayerId;
    document.getElementById('btn-ch-lobby-start').classList.toggle('hidden', !isHost);
    document.getElementById('ch-lobby-wait').classList.toggle('hidden', isHost);
    document.getElementById('ch-lobby-wait').textContent = isHost
      ? `已加入 ${state.players.length}/${state.playerCount} 人，湊齊後可開始`
      : `等待房主開始（${state.players.length}/${state.playerCount} 人）`;
    document.getElementById('ch-lobby-players').innerHTML = state.players
      .map(
        (p) =>
          `<li>${escapeHtml(p.name)}${p.isHost ? '（房主）' : ''}${p.id === you?.id ? '（你）' : ''}</li>`
      )
      .join('');
    return;
  }

  if (state.phase === 'pick' || state.phase === 'thief-pick' || state.phase === 'guard-pick' || state.phase === 'thieves-pick') {
    if (!peekSession()) {
      startMatchSession({
        game: 'chicken',
        mode: state.mode,
        playKind: 'online',
        roomCode: state.code,
        myName: state.you?.name || '玩家',
        myPlayerId: state.you?.id,
      });
    }
  }

  ui.showChickenScreen('chGame');
  ui.els.chEndPanel.classList.add('hidden');

  const you = state.you;
  const isHost = you?.id === state.hostPlayerId;
  const canPick = !!you?.canPick;
  const modeLabel = state.mode === '2p' ? '兩人' : `${state.players.length}人`;
  ui.els.chRoundLabel.textContent = `第 ${state.round} 回合 · 房間 ${state.code} · ${modeLabel}`;
  ui.els.chPhaseHint.textContent = ui.getPhaseText(state);

  ui.renderPlayersOnline(state);

  if (state.phase === 'reveal' || state.phase === 'ended') {
    ui.els.chActionPanel.classList.add('hidden');
    ui.els.chWaitingPanel.classList.add('hidden');
    ui.els.chRevealPanel.classList.remove('hidden');
    appendRoundLogs(state.round, state.lastLogs || []);
    ui.els.chRevealLog.innerHTML = `<ul class="reveal-log">${state.lastLogs.map((l) => `<li>${l}</li>`).join('')}</ul>`;
    ui.els.chBtnNext.classList.toggle('hidden', !isHost);
    ui.els.chWaitHostNext.classList.toggle('hidden', isHost);
    if (state.phase === 'ended') {
      ui.recordChickenMatchFromOnline(state);
      showChEnd(state);
    }
    return;
  }

  ui.els.chRevealPanel.classList.add('hidden');
  if (canPick) {
    ui.els.chWaitingPanel.classList.add('hidden');
    ui.els.chActionPanel.classList.remove('hidden');
    ui.els.chPrompt.textContent = '選擇號碼（僅你可見）';
    renderChSpotsOnline(state, you);
  } else {
    ui.els.chActionPanel.classList.add('hidden');
    ui.els.chWaitingPanel.classList.remove('hidden');
    document.getElementById('ch-waiting-text').textContent = you?.hasChosen
      ? '你已選好，等待其他玩家…'
      : '等待其他玩家選擇…';
  }
}

function renderChSpotsOnline(state, you) {
  const isGuard = state.pickLimit === 2 && you.canPick;
  chSelectedSpots = Array.isArray(you.picks) ? [...you.picks] : [];

  ui.els.chSpotCards.innerHTML = SPOTS.map((spot) => {
    const info = SPOT_INFO[spot];
    const locked = spot === 5 && !you.hasKey && !isGuard;
    const selected = you.pick === spot || chSelectedSpots.includes(spot);
    return `
      <button type="button" class="ch-spot-btn ${locked ? 'locked' : ''} ${selected ? 'selected' : ''}"
        data-spot="${spot}" ${locked ? 'disabled' : ''}>
        <span class="ch-spot-num">${info.icon || info.label}</span>
        <span class="ch-spot-label">${info.label}</span>
      </button>`;
  }).join('');

  ui.els.chSpotCards.querySelectorAll('.ch-spot-btn:not(:disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const spot = Number(btn.dataset.spot);
      if (isGuard) {
        const idx = chSelectedSpots.indexOf(spot);
        if (idx >= 0) chSelectedSpots.splice(idx, 1);
        else if (chSelectedSpots.length < 2) chSelectedSpots.push(spot);
        renderChSpotsOnline(state, { ...you, picks: chSelectedSpots });
        ui.els.chBtnConfirm.disabled = chSelectedSpots.length !== 2;
      } else {
        ui.els.chSpotCards.querySelectorAll('.ch-spot-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        you._pick = spot;
        ui.els.chBtnConfirm.disabled = false;
      }
    });
  });
  ui._onlineYouPick = you;
  ui.els.chBtnConfirm.disabled = isGuard ? chSelectedSpots.length !== 2 : you.pick == null && you._pick == null;
}

function showChEnd(state) {
  const winners = state.winners || [];
  ui.els.chActionPanel.classList.add('hidden');
  ui.els.chRevealPanel.classList.add('hidden');
  ui.els.chEndPanel.classList.remove('hidden');
  if (state.mode === '2p' && winners.length === 1) {
    ui.els.chEndTitle.textContent = '🏆 世上最強怪盜！';
    ui.els.chEndBody.innerHTML = `<p><strong>${escapeHtml(winners[0].name)}</strong> 勝利！${winners[0].score} 分</p>`;
  } else {
    ui.els.chEndTitle.textContent = '遊戲結束';
    ui.els.chEndBody.innerHTML = winners
      .map((w) => `<strong>${escapeHtml(w.name)}</strong> ${w.score}分`)
      .join('、');
  }
}

export function onChConfirmOnline() {
  if (!chOnline || !chOnlineState?.you) return;
  const you = ui._onlineYouPick || chOnlineState.you;
  const limit = chOnlineState.pickLimit;
  if (limit === 2) {
    if (chSelectedSpots.length !== 2) return;
    chOnline.chPickGuard(chSelectedSpots);
  } else {
    const spot = you._pick ?? you.pick;
    if (spot == null) return;
    chOnline.chPick(spot);
  }
  ui.els.chBtnConfirm.disabled = true;
}

export function onChNextOnline() {
  chOnline?.chNext();
}

export function isChickenOnline() {
  return !!chOnline;
}
