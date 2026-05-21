import { ACTIONS, ACTION_KEYS, validateChoice } from './rules.js';
import {
  LocalGameController,
  escapeHtml,
  formatActionHtml,
  renderTracker,
} from './local-game.js';
import { OnlineClient } from './online.js';
import {
  saveMatch,
  getHistory,
  getSummary,
  clearHistory,
  buildGunMatchRecord,
  formatResult,
  formatDate,
  formatGunMode,
  formatChickenMode,
  GAME_LABELS,
} from './stats.js';
import {
  startMatchSession,
  appendRoundLogs,
  finishMatchSession,
  cancelMatchSession,
  peekSession,
} from './match-session.js';
import {
  showGunHome,
  showHub,
  bindHub,
  registerStatsOpener,
  statsFilterGame,
  openStatsScreen,
} from './hub.js';
import { initChickenApp, openChickenSetup } from './chicken-app.js';

/** @typedef {'local'|'online'} PlayKind */
/** @typedef {'duel'|'multi'} GameMode */

/** @type {PlayKind|null} */
let playKind = null;
/** @type {GameMode|null} */
let mode = null;
let aiCount = 1;
/** 單人 vs AI 多人模式：你 + 最多 9 位 AI（共 10 人） */
const MAX_AI_OPPONENTS = 9;
/** @type {string} */
let flow = '';

/** @type {LocalGameController|null} */
let localGame = null;
/** @type {OnlineClient|null} */
let online = null;
/** @type {object|null} */
let onlineState = null;
let selectedAction = null;

const screens = {
  home: document.getElementById('screen-home'),
  stats: document.getElementById('screen-stats'),
  setup: document.getElementById('screen-setup'),
  onlineCreate: document.getElementById('screen-online-create'),
  onlineJoin: document.getElementById('screen-online-join'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
};

const PLAYER_NAME_KEY = 'gun-duel-player-name';

const els = {
  setupTitle: document.getElementById('setup-title'),
  fieldAiCount: document.getElementById('field-ai-count'),
  fieldAiMode: document.getElementById('field-ai-mode'),
  aiModeSelect: document.getElementById('ai-mode-select'),
  fieldYourName: document.getElementById('field-your-name'),
  aiCount: document.getElementById('ai-count'),
  inputYourName: document.getElementById('input-your-name'),
  playersArea: document.getElementById('players-area'),
  actionPanel: document.getElementById('action-panel'),
  waitingPanel: document.getElementById('waiting-panel'),
  revealPanel: document.getElementById('reveal-panel'),
  endPanel: document.getElementById('end-panel'),
  actionCards: document.getElementById('action-cards'),
  selectPrompt: document.getElementById('select-prompt'),
  btnConfirm: document.getElementById('btn-confirm'),
  revealResults: document.getElementById('reveal-results'),
  roundLabel: document.getElementById('round-label'),
  phaseHint: document.getElementById('phase-hint'),
  endTitle: document.getElementById('end-title'),
  endWinners: document.getElementById('end-winners'),
  btnNextRound: document.getElementById('btn-next-round'),
  waitHostNext: document.getElementById('wait-host-next'),
  waitingText: document.getElementById('waiting-text'),
  pickProgress: document.getElementById('pick-progress'),
  lobbyCode: document.getElementById('lobby-code'),
  lobbyPlayers: document.getElementById('lobby-players'),
  btnLobbyStart: document.getElementById('btn-lobby-start'),
  lobbyWait: document.getElementById('lobby-wait'),
  inviteUrl: document.getElementById('invite-url'),
  inviteLan: document.getElementById('invite-lan'),
  joinError: document.getElementById('join-error'),
  toast: document.getElementById('toast'),
  statsOverview: document.getElementById('stats-overview'),
  statsList: document.getElementById('stats-list'),
  statsEmpty: document.getElementById('stats-empty'),
  statsSummaryLine: document.getElementById('stats-summary-line'),
};

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  screens[name]?.classList.add('active');
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

function getStoredPlayerName() {
  return localStorage.getItem(PLAYER_NAME_KEY)?.trim() || '';
}

function setStoredPlayerName(name) {
  if (name?.trim()) localStorage.setItem(PLAYER_NAME_KEY, name.trim().slice(0, 12));
}

function updateHomeStatsLine() {
  const gun = getSummary('gun');
  const ch = getSummary('chicken');
  if (els.statsSummaryLine) {
    els.statsSummaryLine.textContent =
      gun.total > 0 ? `共 ${gun.total} 場` : '完成對局後自動記錄';
  }
  const hubLine = document.getElementById('stats-summary-line-hub');
  const hubTotal = gun.total + ch.total;
  if (hubLine) {
    hubLine.textContent = hubTotal > 0 ? `共 ${hubTotal} 場` : '完成對局後自動記錄';
  }
  const chLine = document.getElementById('stats-summary-line-ch');
  if (chLine) {
    chLine.textContent = ch.total > 0 ? `共 ${ch.total} 場` : '完成對局後自動記錄';
  }
}

function recordGunMatchEnd(players, winners, extra = {}) {
  const payload = finishMatchSession(players, winners);
  if (!payload) return;
  const record = buildGunMatchRecord({ ...payload, ...extra });
  saveMatch(record);
  updateHomeStatsLine();
}

function renderStatsList(list, formatModeFn, playerDetailFn) {
  return list
    .map((r) => {
      const cls = r.result === 'lose' ? 'lose' : 'win';
      const roundsHtml =
        r.roundLogs?.length > 0
          ? `<div class="stats-rounds"><details><summary>回合詳情（${r.roundLogs.length} 回合）</summary><ul>${r.roundLogs
              .map(
                (rr) =>
                  `<li><strong>第 ${rr.round} 回合</strong><ul>${rr.logs.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul></li>`
              )
              .join('')}</ul></details></div>`
          : '';
      return `
        <li class="stats-item ${cls}">
          <div class="stats-item-header">
            <span class="stats-item-result">${formatResult(r.result)}</span>
            <span class="stats-item-meta">${formatDate(r.playedAt)}</span>
          </div>
          <div class="stats-item-meta">
            ${escapeHtml(r.myName)} · ${formatModeFn(r.mode, r.playKind)}${r.roomCode ? ` · ${r.roomCode}` : ''}<br>
            勝者：${escapeHtml(r.winners.join('、') || '—')} · ${r.rounds} 回合<br>
            ${playerDetailFn(r)}
          </div>
          ${roundsHtml}
        </li>`;
    })
    .join('');
}

function renderStatsOverviewBlock(gameId, icon) {
  const sum = getSummary(gameId);
  const label = GAME_LABELS[gameId];
  return `
    <div class="stats-game-block">
      <h3 class="stats-game-title">${icon} ${label}</h3>
      <div class="stats-overview">
        <div class="stat-box"><div class="num">${sum.total}</div><div class="lbl">場次</div></div>
        <div class="stat-box"><div class="num">${sum.wins}</div><div class="lbl">勝場</div></div>
        <div class="stat-box"><div class="num">${sum.winRate}%</div><div class="lbl">勝率</div></div>
      </div>
    </div>`;
}

function renderStatsScreen() {
  const filter = statsFilterGame;
  const showGun = !filter || filter === 'gun';
  const showChicken = !filter || filter === 'chicken';

  const titleEl = document.getElementById('stats-screen-title');
  if (titleEl) {
    titleEl.textContent = filter
      ? `${GAME_LABELS[filter]} · 戰績`
      : '戰績紀錄';
  }

  const gunList = showGun ? getHistory('gun') : [];
  const chList = showChicken ? getHistory('chicken') : [];

  els.statsOverview.innerHTML = [
    showGun ? renderStatsOverviewBlock('gun', '🔫') : '',
    showChicken ? renderStatsOverviewBlock('chicken', '🍗') : '',
  ].join('');

  const hasAny = gunList.length > 0 || chList.length > 0;
  els.statsEmpty.classList.toggle('hidden', hasAny);
  if (els.statsEmpty && filter) {
    els.statsEmpty.textContent = `尚無${GAME_LABELS[filter]}對戰紀錄，完成一局後會自動儲存於此裝置。`;
  } else if (els.statsEmpty) {
    els.statsEmpty.textContent = '尚無對戰紀錄，完成一局後會自動儲存於此裝置。';
  }

  els.statsList.innerHTML = [
    showGun && gunList.length
      ? renderStatsList(gunList, formatGunMode, (r) =>
          r.players.map((p) => `${p.name}（${p.hp}血/${p.bullets}彈）`).join(' · ')
        )
      : '',
    showChicken && chList.length
      ? renderStatsList(chList, formatChickenMode, (r) =>
          r.players.map((p) => `${p.name}（${p.score}分）`).join(' · ')
        )
      : '',
  ].join('');

  const gunBtn = document.getElementById('btn-clear-stats-gun');
  const chBtn = document.getElementById('btn-clear-stats-chicken');
  const allBtn = document.getElementById('btn-clear-stats');
  gunBtn?.classList.toggle('hidden', !!(filter && filter !== 'gun'));
  chBtn?.classList.toggle('hidden', !!(filter && filter !== 'chicken'));
  allBtn?.classList.toggle('hidden', !!filter);

  showScreen('stats');
}

function bindStatsClearButtons() {
  const panel = document.getElementById('screen-stats');
  if (!panel || panel.dataset.clearBound) return;
  panel.dataset.clearBound = '1';

  panel.addEventListener('click', (e) => {
    const id = e.target.closest('button')?.id;
    if (id === 'btn-clear-stats') {
      if (!confirm('確定清除兩款遊戲的所有戰績？')) return;
      clearHistory();
      renderStatsScreen();
      updateHomeStatsLine();
      toast('已清除全部戰績');
      return;
    }
    if (id === 'btn-clear-stats-gun') {
      if (!confirm(`確定清除「${GAME_LABELS.gun}」戰績？`)) return;
      clearHistory('gun');
      renderStatsScreen();
      updateHomeStatsLine();
      toast(`已清除${GAME_LABELS.gun}戰績`);
      return;
    }
    if (id === 'btn-clear-stats-chicken') {
      if (!confirm('確定清除怪盜雞排戰績？')) return;
      clearHistory('chicken');
      renderStatsScreen();
      updateHomeStatsLine();
      toast('已清除雞排戰績');
    }
  });
}

function statsBack() {
  if (statsFilterGame === 'gun') showGunHome();
  else if (statsFilterGame === 'chicken') openChickenSetup();
  else showHub();
  updateHomeStatsLine();
}

// --- Local game UI ---

function bindActionButtons(picker) {
  els.actionCards.innerHTML = ACTION_KEYS.map((key) => {
    const a = ACTIONS[key];
    const cost = Math.max(0, -a.cost);
    const canAfford = picker.bullets >= cost;
    const costText = a.cost > 0 ? `+${a.cost}彈` : a.cost < 0 ? `${-a.cost}彈` : '—';
    return `
      <button type="button" class="action-btn ${!canAfford ? 'invalid-hint' : ''}" data-action="${key}">
        <span class="action-value">${a.label}</span>
        <span class="action-name">${a.name}</span>
        <span class="action-cost">${costText}</span>
      </button>`;
  }).join('');

  els.actionCards.querySelectorAll('.action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.actionCards.querySelectorAll('.action-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAction = btn.dataset.action;
      els.btnConfirm.disabled = false;
    });
  });
}

/** 公布結果時用回合實際結算的行動，勿用結算後子彈數 re-validate */
function actionForDisplay(p, phase) {
  if (phase === 'reveal' || phase === 'ended') {
    return p.revealedAction ?? p.resolvedAction ?? p.choice;
  }
  return p.choice;
}

function renderPlayerCards(players, phase, options = {}) {
  const { youId, hideOthersChoice } = options;
  els.playersArea.innerHTML = players
    .map((p) => {
      const isYou = youId && p.id === youId;
      const displayAction = actionForDisplay(p, phase);
      const showChoice =
        phase === 'reveal' ||
        phase === 'ended' ||
        (phase === 'pick' && isYou && p.choice);

      const reveal =
        showChoice && typeof displayAction === 'string' && ACTIONS[displayAction]
          ? `<div class="reveal-action"><span class="action-num">${ACTIONS[displayAction].label}</span> ${ACTIONS[displayAction].name}</div>`
          : phase === 'pick' && p.hasChosen && hideOthersChoice && !isYou
            ? `<div class="reveal-action muted">已選好</div>`
            : '';

      return `
        <article class="player-card ${!p.alive ? 'eliminated' : ''} ${isYou ? 'is-you' : ''}" data-id="${p.id}">
          <div class="player-header">
            <span class="player-name">${escapeHtml(p.name)}${p.isAi ? ' 🤖' : ''}${isYou ? '（你）' : ''}${!p.alive ? '（出局）' : ''}</span>
          </div>
          <div class="trackers">
            ${renderTracker('bullets', p.bullets, 5, '子彈')}
            ${renderTracker('hp', p.hp, 5, '血量')}
          </div>
          ${reveal}
        </article>`;
    })
    .join('');
}

function getMaxAiCount() {
  return els.aiModeSelect?.value === 'multi' ? MAX_AI_OPPONENTS : 1;
}

function syncAiCountStepper() {
  if (!els.aiCount) return;
  const max = getMaxAiCount();
  aiCount = Math.max(1, Math.min(aiCount, max));
  els.aiCount.textContent = String(aiCount);
  document.getElementById('btn-ai-minus')?.toggleAttribute('disabled', aiCount <= 1);
  document.getElementById('btn-ai-plus')?.toggleAttribute('disabled', aiCount >= max);
}

function showGamePanels({ phase, canPick, isHost, playKind: pk }) {
  els.actionPanel.classList.toggle('hidden', !canPick);
  els.waitingPanel.classList.toggle('hidden', canPick || phase !== 'pick');
  els.revealPanel.classList.toggle('hidden', phase !== 'reveal');
  els.endPanel.classList.toggle('hidden', phase !== 'ended');

  if (pk === 'online' && phase === 'reveal') {
    const you = onlineState?.you;
    const isH = you?.id === onlineState?.hostPlayerId;
    els.btnNextRound.classList.toggle('hidden', !isH);
    els.waitHostNext.classList.toggle('hidden', isH);
  } else {
    els.btnNextRound.classList.remove('hidden');
    els.waitHostNext.classList.add('hidden');
  }
}

function startLocalGame() {
  playKind = 'local';
  const yourName = els.inputYourName.value.trim() || getStoredPlayerName() || '玩家';
  setStoredPlayerName(yourName);
  const aiNum = mode === 'duel' ? 1 : aiCount;
  const roster = [{ name: yourName, isAi: false }];
  for (let i = 0; i < aiNum; i++) roster.push({ name: `電腦 ${i + 1}`, isAi: true });

  startMatchSession({
    game: 'gun',
    mode,
    playKind: 'ai',
    myName: yourName,
    myPlayerId: 'p0',
  });

  localGame = new LocalGameController(mode, {
    onPickPhase: ({ round, isFinalRound, picker, players }) => {
      showScreen('game');
      showGamePanels({ phase: 'pick', canPick: true, playKind: 'local' });
      els.roundLabel.textContent = `第 ${round} 回合`;
      els.phaseHint.textContent = isFinalRound ? '最後一回合！' : '你的回合';
      els.selectPrompt.textContent = '選擇你的行動（AI 已自動選好）';
      selectedAction = null;
      els.btnConfirm.disabled = true;
      renderPlayerCards(players, 'pick', { youId: 'p0' });
      bindActionButtons(picker);
    },
    onReveal: ({ round, players, logs, shouldEnd, awaitingFinalRound }) => {
      appendRoundLogs(round, logs.map((l) => l.replace(/<[^>]+>/g, '')));
      showGamePanels({ phase: 'reveal', canPick: false, playKind: 'local' });
      els.phaseHint.textContent = '公布結果';
      renderPlayerCards(players, 'reveal');
      const alive = players.filter((p) => p.alive);
      els.revealResults.innerHTML = `
        <ul class="reveal-log">${logs.map((l) => `<li>${l}</li>`).join('')}</ul>
        <p class="alive-summary">存活：${alive.map((p) => `${p.name}（${p.hp}血/${p.bullets}彈）`).join(' · ') || '無'}</p>`;
      els.btnNextRound.textContent = shouldEnd ? '查看結果' : awaitingFinalRound ? '進行最後一回合' : '下一回合';
    },
    onEnd: ({ players, mode: m }) => {
      const alive = players.filter((p) => p.alive);
      recordGunMatchEnd(players, alive);
      showEndFromPlayers(players, m);
    },
  });

  localGame.start(roster);
}

function resetGunGameUI() {
  showGamePanels({ phase: 'pick', canPick: false });
  els.endPanel?.classList.add('hidden');
  els.revealPanel?.classList.add('hidden');
  els.actionPanel?.classList.add('hidden');
  els.waitingPanel?.classList.add('hidden');
  if (els.revealResults) els.revealResults.innerHTML = '';
  if (els.playersArea) els.playersArea.innerHTML = '';
  selectedAction = null;
  if (els.btnConfirm) els.btnConfirm.disabled = true;
}

function leaveGunGame() {
  if (!confirm('確定離開？')) return;
  cancelMatchSession();
  online?.disconnect();
  online = null;
  localGame = null;
  resetGunGameUI();
  showGunHome();
}

function playAgainGun() {
  if (playKind === 'online') {
    resetGunGameUI();
    showScreen('lobby');
    return;
  }
  cancelMatchSession();
  localGame = null;
  resetGunGameUI();
  if (playKind === 'local' && mode) {
    startLocalGame();
    return;
  }
  showScreen('setup');
}

function showEndFromPlayers(players, m) {
  showScreen('game');
  showGamePanels({ phase: 'ended', canPick: false });
  els.phaseHint.textContent = '遊戲結束';
  const alive = players.filter((p) => p.alive);
  if (m === 'duel') {
    if (alive.length === 1) {
      els.endTitle.textContent = '勝利！';
      els.endWinners.innerHTML = `<p>🏆 <strong>${escapeHtml(alive[0].name)}</strong> 獲勝！</p>`;
    } else {
      els.endTitle.textContent = '平手？';
      els.endWinners.innerHTML = '<p>所有玩家皆出局</p>';
    }
  } else {
    els.endTitle.textContent = '遊戲結束';
    els.endWinners.innerHTML =
      alive.length > 0
        ? `<p>🏆 存活者：</p><p>${alive.map((p) => `<strong>${escapeHtml(p.name)}</strong>`).join('、')}</p>`
        : '<p>無人生還</p>';
  }
}

// --- Online ---

async function ensureOnline() {
  if (!online) {
    online = new OnlineClient();
    online.onState = (state) => {
      onlineState = state;
      applyOnlineState(state);
    };
    online.onError = (msg) => toast(msg);
    online.onJoined = ({ lanIp }) => {
      const isLocal =
        location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      if (lanIp && isLocal) {
        els.inviteLan.textContent = `同 WiFi：http://${lanIp}:${location.port || 3456}`;
        els.inviteLan.classList.remove('hidden');
      } else {
        els.inviteLan.classList.add('hidden');
        if (location.protocol === 'https:') {
          els.inviteLan.textContent =
            '已使用雲端網址，各地手機皆可加入（免費方案首次開啟可能需等待約 30 秒）';
          els.inviteLan.classList.remove('hidden');
        }
      }
    };
  }
  if (!online.connected) {
    try {
      await online.connect();
    } catch {
      toast('無法連線。請執行 npm start 啟動伺服器');
      throw new Error('connect failed');
    }
  }
}

function applyOnlineState(state) {
  onlineState = state;
  mode = state.mode;

  if (state.phase === 'lobby') {
    showScreen('lobby');
    els.lobbyCode.textContent = state.code;
    els.inviteUrl.textContent = `${location.origin}${location.pathname}`;
    const you = state.you;
    const isHost = you?.id === state.hostPlayerId;
    els.btnLobbyStart.classList.toggle('hidden', !isHost);
    els.lobbyWait.classList.toggle('hidden', isHost);
    els.lobbyPlayers.innerHTML = state.players
      .map(
        (p) =>
          `<li>${escapeHtml(p.name)}${p.isAi ? ' 🤖' : ''}${p.isHost ? '（房主）' : ''}${p.id === you?.id ? '（你）' : ''}</li>`
      )
      .join('');
    return;
  }

  if (state.phase === 'pick' || state.phase === 'reveal' || state.phase === 'ended') {
    if (!peekSession() && state.round === 1 && state.phase === 'pick') {
      startMatchSession({
        game: 'gun',
        mode: state.mode,
        playKind: 'online',
        roomCode: state.code,
        myName: state.you?.name || '玩家',
        myPlayerId: state.you?.id,
      });
      setStoredPlayerName(state.you?.name);
    }

    showScreen('game');
    const you = state.you;
    const isHost = you?.id === state.hostPlayerId;
    const alive = state.players.filter((p) => p.alive);
    const needPick = you?.alive && !you?.isAi && you?.choice === null && state.phase === 'pick';

    els.roundLabel.textContent = `第 ${state.round} 回合 · 房間 ${state.code}`;
    els.phaseHint.textContent =
      state.isFinalRound ? '最後一回合！' : state.phase === 'pick' ? '選擇階段' : state.phase === 'reveal' ? '公布結果' : '遊戲結束';

    renderPlayerCards(state.players, state.phase, {
      youId: you?.id,
      hideOthersChoice: true,
    });

    if (state.phase === 'pick') {
      els.pickProgress.textContent = `${state.pickedCount}/${state.aliveCount} 已選`;
      if (needPick) {
        showGamePanels({ phase: 'pick', canPick: true, isHost, playKind: 'online' });
        els.selectPrompt.textContent = '選擇你的行動（僅你可見）';
        selectedAction = null;
        els.btnConfirm.disabled = true;
        bindActionButtons(you);
      } else {
        showGamePanels({ phase: 'pick', canPick: false, isHost, playKind: 'online' });
        els.waitingText.textContent = you?.choice
          ? '你已選好，等待其他玩家…'
          : !you?.alive
            ? '你已出局，觀戰中'
            : '等待其他玩家選牌…';
      }
    } else if (state.phase === 'reveal') {
      appendRoundLogs(state.round, state.lastLogs || []);
      showGamePanels({ phase: 'reveal', canPick: false, isHost, playKind: 'online' });
      const logs = state.lastLogs || [];
      els.revealResults.innerHTML = `
        <ul class="reveal-log">${logs.map((l) => `<li>${escapeHtml(l).replace(/-1 血/g, '<span class="dmg">-1 血</span>')}</li>`).join('')}</ul>
        <p class="alive-summary">存活：${alive.map((p) => `${p.name}（${p.hp}血/${p.bullets}彈）`).join(' · ') || '無'}</p>`;
      const shouldEnd =
        alive.length <= 1 ||
        (state.mode === 'multi' && state.isFinalRound);
      els.btnNextRound.textContent = shouldEnd ? '查看結果' : state.awaitingFinalRound ? '進行最後一回合' : '下一回合';
    } else if (state.phase === 'ended') {
      const winners = state.winners || [];
      recordGunMatchEnd(state.players, winners);
      showGamePanels({ phase: 'ended', canPick: false, isHost, playKind: 'online' });
      els.endTitle.textContent = '遊戲結束';
      els.endWinners.innerHTML =
        winners.length > 0
          ? `<p>🏆 ${winners.map((w) => `<strong>${escapeHtml(w.name)}</strong>`).join('、')}</p>`
          : '<p>無人生還</p>';
      els.revealPanel.classList.add('hidden');
      els.endPanel.classList.remove('hidden');
    }
  }
}

// --- Events ---

function bindGunEvents() {
  document.querySelectorAll('#screen-home .mode-card[data-flow]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const flowId = btn.dataset.flow;
      if (!flowId) return;
      if (flowId === 'local-ai') {
        playKind = 'local';
        mode = 'duel';
        if (els.setupTitle) els.setupTitle.textContent = '單人 vs AI';
        els.fieldYourName?.classList.remove('hidden');
        aiCount = 1;
        if (els.aiModeSelect) {
          els.aiModeSelect.onchange = () => {
            const isMulti = els.aiModeSelect.value === 'multi';
            els.fieldAiCount?.classList.toggle('hidden', !isMulti);
            syncAiCountStepper();
          };
          els.aiModeSelect.dispatchEvent(new Event('change'));
        }
        syncAiCountStepper();
        showScreen('setup');
      } else if (flowId === 'online-create') {
        showScreen('onlineCreate');
        syncHostCreateForm();
      } else if (flowId === 'online-join') {
        showScreen('onlineJoin');
      }
    });
  });

  document.getElementById('btn-setup-back')?.addEventListener('click', () => showGunHome());
  document.querySelectorAll('[data-back="home"]').forEach((b) =>
    b.addEventListener('click', () => showGunHome())
  );

  document.getElementById('btn-ai-minus')?.addEventListener('click', () => {
    aiCount = Math.max(1, aiCount - 1);
    syncAiCountStepper();
  });

  document.getElementById('btn-ai-plus')?.addEventListener('click', () => {
    aiCount = Math.min(getMaxAiCount(), aiCount + 1);
    syncAiCountStepper();
  });

  document.getElementById('btn-start-game')?.addEventListener('click', () => {
    mode = els.aiModeSelect?.value === 'multi' ? 'multi' : 'duel';
    startLocalGame();
  });

  els.btnConfirm?.addEventListener('click', () => {
    if (!selectedAction) return;
    if (playKind === 'local' && localGame) {
      localGame.confirmPick(selectedAction);
      return;
    }
    if (playKind === 'online' && online) {
      online.pick(selectedAction);
      if (els.btnConfirm) els.btnConfirm.disabled = true;
    }
  });

  els.btnNextRound?.addEventListener('click', () => {
    if (playKind === 'local' && localGame) {
      localGame.nextRound();
      return;
    }
    if (playKind === 'online' && online) online.next();
  });

  document.getElementById('btn-open-stats')?.addEventListener('click', () => openStatsScreen('gun'));
  document.getElementById('btn-stats-back')?.addEventListener('click', statsBack);

  document.getElementById('btn-quit')?.addEventListener('click', leaveGunGame);
  document.getElementById('btn-play-again')?.addEventListener('click', playAgainGun);
  document.getElementById('btn-view-stats')?.addEventListener('click', () => openStatsScreen('gun'));

  document.getElementById('btn-home')?.addEventListener('click', () => {
    if (!confirm('確定離開並返回遊戲選擇？')) return;
    cancelMatchSession();
    online?.disconnect();
    online = null;
    localGame = null;
    resetGunGameUI();
    showHub();
    updateHomeStatsLine();
  });
}

// --- 線上開房表單（須在 bootApp 前初始化，避免 syncHostCreateForm 讀取未宣告變數）---
let hostMax = 2;
let hostAi = 0;

const hostMode = document.getElementById('host-mode');
const hostMaxWrap = document.getElementById('host-max-wrap');
const hostDuelHint = document.getElementById('host-duel-hint');
const hostMaxEl = document.getElementById('host-max');
const hostAiEl = document.getElementById('host-ai');
const btnCreateRoom = document.getElementById('btn-create-room');

function syncHostCreateForm() {
  if (!hostMode || !hostMaxWrap || !hostMaxEl || !hostAiEl) return;
  const isDuel = hostMode.value === 'duel';
  if (isDuel) {
    hostMax = 2;
    hostMaxWrap.classList.add('hidden');
    hostDuelHint?.classList.remove('hidden');
    hostAi = Math.min(hostAi, 1);
  } else {
    hostMaxWrap.classList.remove('hidden');
    hostDuelHint?.classList.add('hidden');
    if (hostMax < 3) hostMax = 4;
  }
  hostMaxEl.textContent = String(hostMax);
  hostAiEl.textContent = String(hostAi);
}

function bindHostOnlineEvents() {
  if (document.body.dataset.hostOnlineBound) return;
  document.body.dataset.hostOnlineBound = '1';

  hostMode?.addEventListener('change', syncHostCreateForm);

  document.getElementById('host-max-minus')?.addEventListener('click', () => {
    if (!hostMode || hostMode.value === 'duel') return;
    hostMax = Math.max(3, hostMax - 1);
    if (hostMaxEl) hostMaxEl.textContent = String(hostMax);
    hostAi = Math.min(hostAi, hostMax - 1);
    if (hostAiEl) hostAiEl.textContent = String(hostAi);
  });
  document.getElementById('host-max-plus')?.addEventListener('click', () => {
    if (!hostMode || hostMode.value === 'duel') return;
    hostMax = Math.min(10, hostMax + 1);
    if (hostMaxEl) hostMaxEl.textContent = String(hostMax);
  });
  document.getElementById('host-ai-minus')?.addEventListener('click', () => {
    hostAi = Math.max(0, hostAi - 1);
    if (hostAiEl) hostAiEl.textContent = String(hostAi);
  });
  document.getElementById('host-ai-plus')?.addEventListener('click', () => {
    const cap = hostMode?.value === 'duel' ? 1 : hostMax - 1;
    hostAi = Math.min(cap, hostAi + 1);
    if (hostAiEl) hostAiEl.textContent = String(hostAi);
  });

  btnCreateRoom?.addEventListener('click', async () => {
    const prevText = btnCreateRoom.textContent;
    btnCreateRoom.disabled = true;
    btnCreateRoom.textContent = '連線中…';
    try {
      await ensureOnline();
      playKind = 'online';
      const m = hostMode?.value ?? 'duel';
      const maxPlayers = m === 'duel' ? 2 : hostMax;
      const ai = m === 'duel' ? Math.min(hostAi, 1) : hostAi;
      online.create(m, document.getElementById('host-name')?.value ?? '房主', maxPlayers, ai);
    } catch (e) {
      toast(e?.message || '無法連線伺服器');
    } finally {
      btnCreateRoom.disabled = false;
      btnCreateRoom.textContent = prevText;
    }
  });

  document.getElementById('btn-join-room')?.addEventListener('click', async () => {
    const code = document.getElementById('join-code')?.value.trim().toUpperCase();
    if (code.length !== 4) {
      if (els.joinError) {
        els.joinError.textContent = '請輸入 4 碼房間代碼';
        els.joinError.classList.remove('hidden');
      }
      return;
    }
    els.joinError?.classList.add('hidden');
    try {
      await ensureOnline();
      playKind = 'online';
      online.join(code, document.getElementById('join-name')?.value ?? '玩家');
    } catch {
      /* toast from ensureOnline / onError */
    }
  });

  document.getElementById('btn-lobby-start')?.addEventListener('click', () => {
    online?.start();
  });

  document.getElementById('btn-leave-lobby')?.addEventListener('click', () => {
    cancelMatchSession();
    online?.disconnect();
    online = null;
    showHub();
  });
}

function bootApp() {
  bindHub(openChickenSetup);
  bindGunEvents();
  bindStatsClearButtons();
  bindHostOnlineEvents();
  registerStatsOpener(renderStatsScreen);
  try {
    initChickenApp();
  } catch (err) {
    console.error('雞排模組初始化失敗', err);
  }
  window.__updateStatsLines = updateHomeStatsLine;
  updateHomeStatsLine();
  syncHostCreateForm();
}

bootApp();

