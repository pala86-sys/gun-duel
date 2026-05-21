/** @typedef {'gun'|'chicken'} StatsGameId */
/** @type {StatsGameId|null} */
export let statsFilterGame = null;

let renderStatsImpl = () => {};

/** 由 app.js 注入戰績畫面渲染 */
export function registerStatsOpener(fn) {
  renderStatsImpl = fn;
}

/** @param {StatsGameId|null} gameId null = 遊戲選擇頁（兩款都顯示） */
export function openStatsScreen(gameId = null) {
  statsFilterGame = gameId;
  renderStatsImpl();
}

export function showHub() {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById('screen-hub')?.classList.add('active');
}

export function showGunHome() {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById('screen-home')?.classList.add('active');
}

/** @param {() => void} openChickenSetup */
export function bindHub(openChickenSetup) {
  document.getElementById('btn-hub-gun')?.addEventListener('click', showGunHome);
  document.getElementById('btn-hub-chicken')?.addEventListener('click', openChickenSetup);
  document.getElementById('btn-hub-stats')?.addEventListener('click', () => openStatsScreen(null));
  document.getElementById('btn-gun-home-back')?.addEventListener('click', showHub);
}
