import { ACTIONS, ACTION_KEYS, validateChoice } from './rules.js';
import {
  LocalGameController,
  escapeHtml,
  formatActionHtml,
  renderTracker,
} from './local-game.js';
import { OnlineClient } from './online.js';

/** @typedef {'local'|'online'} PlayKind */
/** @typedef {'duel'|'multi'} GameMode */

/** @type {PlayKind|null} */
let playKind = null;
/** @type {GameMode|null} */
let mode = null;
/** @type {'pass'|'ai'} */
let localStyle = 'pass';
let setupCount = 3;
let aiCount = 1;
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
  setup: document.getElementById('screen-setup'),
  onlineCreate: document.getElementById('screen-online-create'),
  onlineJoin: document.getElementById('screen-online-join'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
};

const els = {
  setupTitle: document.getElementById('setup-title'),
  playerCount: document.getElementById('player-count'),
  nameInputs: document.getElementById('name-inputs'),
  fieldPlayerCount: document.getElementById('field-player-count'),
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
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el?.classList.remove('active'));
  screens[name]?.classList.add('active');
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

function defaultNames(count) {
  const d = ['小建', '小全', '玩家3', '玩家4', '玩家5', '玩家6', '玩家7', '玩家8', '玩家9', '玩家10'];
  return Array.from({ length: count }, (_, i) => d[i] ?? `玩家${i + 1}`);
}

function renderNameInputs() {
  if (localStyle === 'ai') {
    els.nameInputs.innerHTML = '';
    els.nameInputs.classList.add('hidden');
    return;
  }
  els.nameInputs.classList.remove('hidden');
  const names = defaultNames(setupCount);
  els.nameInputs.innerHTML = names
    .map(
      (n, i) =>
        `<label class="field"><span>玩家 ${i + 1}</span><input type="text" data-index="${i}" value="${escapeHtml(n)}" maxlength="12"></label>`
    )
    .join('');
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

function renderPlayerCards(players, phase, options = {}) {
  const { youId, hideOthersChoice } = options;
  els.playersArea.innerHTML = players
    .map((p) => {
      const isYou = youId && p.id === youId;
      const showChoice =
        phase === 'reveal' ||
        phase === 'ended' ||
        (phase === 'pick' && isYou && p.choice);
      const choiceLabel =
        showChoice && p.choice
          ? typeof p.choice === 'string'
            ? ACTIONS[validateChoice(p.choice, p.bullets)].label
            : '✓'
          : p.hasChosen
            ? '✓'
            : '';

      const reveal =
        showChoice && typeof p.choice === 'string'
          ? `<div class="reveal-action"><span class="action-num">${ACTIONS[validateChoice(p.choice, p.bullets)].label}</span> ${ACTIONS[validateChoice(p.choice, p.bullets)].name}</div>`
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
  const yourName = els.inputYourName.value.trim() || '玩家';
  let roster;

  if (localStyle === 'ai') {
    const aiNum = mode === 'duel' ? 1 : aiCount;
    roster = [{ name: yourName, isAi: false }];
    for (let i = 0; i < aiNum; i++) roster.push({ name: `電腦 ${i + 1}`, isAi: true });
  } else {
    const inputs = els.nameInputs.querySelectorAll('input');
    roster = Array.from(inputs).map((input, i) => ({
      name: input.value.trim() || `玩家${i + 1}`,
      isAi: false,
    }));
  }

  localGame = new LocalGameController(mode, {
    onPickPhase: ({ round, isFinalRound, picker, players }) => {
      showScreen('game');
      showGamePanels({ phase: 'pick', canPick: true, playKind: 'local' });
      els.roundLabel.textContent = `第 ${round} 回合`;
      els.phaseHint.textContent = isFinalRound ? '最後一回合！' : '你的回合';
      els.selectPrompt.textContent =
        localStyle === 'ai'
          ? '選擇你的行動（AI 已自動選好）'
          : `${picker.name}，請選擇行動`;
      selectedAction = null;
      els.btnConfirm.disabled = true;
      renderPlayerCards(players, 'pick', { youId: localStyle === 'ai' ? 'p0' : undefined });
      bindActionButtons(picker);
    },
    onReveal: ({ round, players, logs, shouldEnd, awaitingFinalRound }) => {
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
      showEndFromPlayers(players, m);
    },
  });

  localGame.start(roster);
}

function showEndFromPlayers(players, m) {
  showGamePanels({ phase: 'ended', canPick: false });
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
      showGamePanels({ phase: 'ended', canPick: false, isHost, playKind: 'online' });
      const winners = state.winners || [];
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

document.querySelectorAll('.mode-card').forEach((btn) => {
  btn.addEventListener('click', () => {
    flow = btn.dataset.flow;
    if (flow === 'local-duel') {
      playKind = 'local';
      localStyle = 'pass';
      mode = 'duel';
      els.setupTitle.textContent = '兩人對戰（本機）';
      els.fieldPlayerCount.classList.add('hidden');
      els.fieldAiCount.classList.add('hidden');
      els.fieldAiMode.classList.add('hidden');
      els.fieldYourName.classList.add('hidden');
      setupCount = 2;
      renderNameInputs();
      showScreen('setup');
    } else if (flow === 'local-multi') {
      playKind = 'local';
      localStyle = 'pass';
      mode = 'multi';
      els.setupTitle.textContent = '多人圍圈（本機）';
      els.fieldPlayerCount.classList.remove('hidden');
      els.fieldAiCount.classList.add('hidden');
      els.fieldAiMode.classList.add('hidden');
      els.fieldYourName.classList.add('hidden');
      setupCount = 3;
      els.playerCount.textContent = '3';
      renderNameInputs();
      showScreen('setup');
    } else if (flow === 'local-ai') {
      playKind = 'local';
      localStyle = 'ai';
      mode = 'duel';
      els.setupTitle.textContent = '單人 vs AI';
      els.fieldPlayerCount.classList.add('hidden');
      els.fieldAiCount.classList.remove('hidden');
      els.fieldAiMode.classList.remove('hidden');
      els.fieldYourName.classList.remove('hidden');
      aiCount = 1;
      els.aiCount.textContent = '1';
      els.aiModeSelect.onchange = () => {
        const isMulti = els.aiModeSelect.value === 'multi';
        els.fieldAiCount.classList.toggle('hidden', !isMulti);
      };
      els.aiModeSelect.dispatchEvent(new Event('change'));
      renderNameInputs();
      showScreen('setup');
    } else if (flow === 'online-create') {
      showScreen('onlineCreate');
    } else if (flow === 'online-join') {
      showScreen('onlineJoin');
    }
  });
});

document.getElementById('btn-setup-back').addEventListener('click', () => showScreen('home'));
document.querySelectorAll('[data-back="home"]').forEach((b) =>
  b.addEventListener('click', () => showScreen('home'))
);

document.getElementById('btn-count-minus').addEventListener('click', () => {
  const min = localStyle === 'ai' ? 2 : mode === 'duel' ? 2 : 3;
  setupCount = Math.max(min, setupCount - 1);
  els.playerCount.textContent = String(setupCount);
  if (localStyle === 'ai') aiCount = Math.min(aiCount, setupCount - 1);
  renderNameInputs();
});

document.getElementById('btn-count-plus').addEventListener('click', () => {
  setupCount = Math.min(10, setupCount + 1);
  els.playerCount.textContent = String(setupCount);
  renderNameInputs();
});

document.getElementById('btn-ai-minus').addEventListener('click', () => {
  aiCount = Math.max(1, aiCount - 1);
  els.aiCount.textContent = String(aiCount);
});

document.getElementById('btn-ai-plus').addEventListener('click', () => {
  aiCount = Math.min(setupCount - 1, aiCount + 1);
  els.aiCount.textContent = String(aiCount);
});

document.getElementById('btn-start-game').addEventListener('click', () => {
  if (localStyle === 'ai') {
    mode = els.aiModeSelect.value === 'multi' ? 'multi' : 'duel';
  }
  startLocalGame();
});

els.btnConfirm.addEventListener('click', () => {
  if (!selectedAction) return;
  if (playKind === 'local' && localGame) {
    localGame.confirmPick(selectedAction);
    return;
  }
  if (playKind === 'online' && online) {
    online.pick(selectedAction);
    els.btnConfirm.disabled = true;
  }
});

els.btnNextRound.addEventListener('click', () => {
  if (playKind === 'local' && localGame) {
    localGame.nextRound();
    return;
  }
  if (playKind === 'online' && online) online.next();
});

document.getElementById('btn-quit').addEventListener('click', () => {
  if (confirm('確定離開？')) {
    online?.disconnect();
    online = null;
    localGame = null;
    showScreen('home');
  }
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  if (playKind === 'online') showScreen('lobby');
  else showScreen('setup');
});

document.getElementById('btn-home').addEventListener('click', () => {
  online?.disconnect();
  online = null;
  showScreen('home');
});

// Online create
let hostMax = 4;
let hostAi = 0;

const hostMode = document.getElementById('host-mode');
const hostMaxWrap = document.getElementById('host-max-wrap');

hostMode.addEventListener('change', () => {
  if (hostMode.value === 'duel') {
    hostMax = 2;
    hostMaxWrap.classList.add('hidden');
  } else {
    hostMax = 4;
    hostMaxWrap.classList.remove('hidden');
  }
  document.getElementById('host-max').textContent = String(hostMax);
});

document.getElementById('host-max-minus').addEventListener('click', () => {
  hostMax = Math.max(3, hostMax - 1);
  document.getElementById('host-max').textContent = String(hostMax);
});
document.getElementById('host-max-plus').addEventListener('click', () => {
  hostMax = Math.min(10, hostMax + 1);
  document.getElementById('host-max').textContent = String(hostMax);
});
document.getElementById('host-ai-minus').addEventListener('click', () => {
  hostAi = Math.max(0, hostAi - 1);
  document.getElementById('host-ai').textContent = String(hostAi);
});
document.getElementById('host-ai-plus').addEventListener('click', () => {
  hostAi = Math.min(hostMax - 1, hostAi + 1);
  document.getElementById('host-ai').textContent = String(hostAi);
});

document.getElementById('btn-create-room').addEventListener('click', async () => {
  try {
    await ensureOnline();
    playKind = 'online';
    const m = hostMode.value;
    online.create(m, document.getElementById('host-name').value, hostMax, hostAi);
  } catch {
    /* toast shown */
  }
});

document.getElementById('btn-join-room').addEventListener('click', async () => {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length !== 4) {
    els.joinError.textContent = '請輸入 4 碼房間代碼';
    els.joinError.classList.remove('hidden');
    return;
  }
  els.joinError.classList.add('hidden');
  try {
    await ensureOnline();
    playKind = 'online';
    online.join(code, document.getElementById('join-name').value);
  } catch {
    /* toast */
  }
});

document.getElementById('btn-lobby-start').addEventListener('click', () => {
  online?.start();
});

document.getElementById('btn-leave-lobby').addEventListener('click', () => {
  online?.disconnect();
  online = null;
  showScreen('home');
});

// AI mode: mode toggle in setup for multi AI
document.querySelectorAll('#field-player-count').forEach(() => {});

// Fix local AI mode to allow multi - add mode select in setup for ai? 
// For simplicity AI uses duel by default; user can change via hidden - add quick toggle in setup for ai

