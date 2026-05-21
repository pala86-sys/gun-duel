import { initChickenApp, openChickenSetup } from './chicken-app.js';

/** 由 app.js 注入 */
export let openStatsScreen = () => {};

export function registerStatsOpener(fn) {
  openStatsScreen = fn;
}

export function showHub() {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById('screen-hub')?.classList.add('active');
}

export function showGunHome() {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById('screen-home')?.classList.add('active');
}

document.getElementById('btn-hub-gun')?.addEventListener('click', showGunHome);
document.getElementById('btn-hub-chicken')?.addEventListener('click', openChickenSetup);

document.getElementById('btn-hub-stats')?.addEventListener('click', () => openStatsScreen());

document.getElementById('btn-gun-home-back')?.addEventListener('click', showHub);

initChickenApp();
