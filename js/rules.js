/**
 * 請以火力掩護我 — 規則引擎（前後端共用邏輯）
 */

export const ACTIONS = {
  '3': { name: '掃射', cost: -2, label: '3' },
  '2': { name: '射擊', cost: -1, label: '2' },
  '1': { name: '刺刀', cost: 0, label: '1' },
  '0': { name: '裝填', cost: 2, label: '0' },
  X: { name: '臥倒', cost: 0, label: 'X' },
};

export const ACTION_KEYS = ['3', '2', '1', '0', 'X'];

/** @typedef {'duel'|'multi'} GameMode */
/** @typedef {'3'|'2'|'1'|'0'|'X'} ActionId */

/**
 * @param {ActionId} action
 * @param {number} bullets
 * @returns {ActionId}
 */
export function validateChoice(action, bullets) {
  const cost = Math.max(0, -ACTIONS[action].cost);
  if (bullets < cost) return '1';
  return action;
}

/**
 * @param {ActionId} a
 * @param {ActionId} b
 */
export function damageFromCompare(a, b) {
  if (a === 'X' && b === 'X') return 0;
  if (a === 'X') {
    if (b === '1') return 1;
    return 0;
  }
  if (b === 'X') return 0;
  const na = Number(a);
  const nb = Number(b);
  if (na < nb) return 1;
  return 0;
}

/**
 * @param {ActionId} action
 * @param {number} bullets
 */
export function applyBulletChange(action, bullets) {
  const validated = validateChoice(action, bullets);
  return Math.max(0, bullets + ACTIONS[validated].cost);
}

/**
 * @param {Array<{id:string,name:string,bullets:number,hp:number,alive:boolean,choice:ActionId|null}>} allPlayers
 * @param {string} playerId
 * @param {number} direction
 */
export function getAliveNeighbor(allPlayers, playerId, direction) {
  const idx = allPlayers.findIndex((p) => p.id === playerId);
  const len = allPlayers.length;
  for (let step = 1; step < len; step++) {
    const ni = (idx + direction * step + len) % len;
    if (allPlayers[ni].alive) return allPlayers[ni];
  }
  return null;
}

export function getEliminationThreshold(playerCount) {
  if (playerCount <= 5) return 1;
  if (playerCount <= 8) return 2;
  return 3;
}

export function formatAction(id) {
  const a = ACTIONS[id];
  return `${a.label} ${a.name}`;
}

/** 戰報用：選 2、選 X */
export function formatPick(id) {
  return `選 ${ACTIONS[id].label}`;
}

/** 戰報用：選 2 射擊 */
export function formatPickDetail(id) {
  const a = ACTIONS[id];
  return `選 ${a.label} ${a.name}`;
}

function describePair(nameA, actA, nameB, actB, dmgA, dmgB) {
  const parts = [];
  if (dmgA > 0) parts.push(`${nameA} -1 血`);
  if (dmgB > 0) parts.push(`${nameB} -1 血`);
  const dmgText = parts.length ? parts.join('、') : '雙方不扣血';
  return `比大小：${nameA} ${formatPick(actA)} vs ${nameB} ${formatPick(actB)} → ${dmgText}`;
}

/**
 * @param {Array<{id:string,name:string,bullets:number,hp:number,alive:boolean,choice:ActionId|null}>} ps
 * @param {GameMode} gameMode
 */
export function resolveRound(ps, gameMode) {
  const active = ps.filter((p) => p.alive);
  const choices = new Map(
    active.map((p) => [p.id, validateChoice(p.choice, p.bullets)])
  );
  const damageMap = new Map(active.map((p) => [p.id, 0]));
  const logs = [];
  let eliminatedCount = 0;

  if (gameMode === 'duel' && active.length >= 2) {
    const [a, b] = active;
    const ca = choices.get(a.id);
    const cb = choices.get(b.id);
    const dmgA = damageFromCompare(ca, cb);
    const dmgB = damageFromCompare(cb, ca);
    damageMap.set(a.id, dmgA);
    damageMap.set(b.id, dmgB);
    logs.push(describePair(a.name, ca, b.name, cb, dmgA, dmgB));
  } else {
    for (const p of active) {
      const left = getAliveNeighbor(ps, p.id, -1);
      const right = getAliveNeighbor(ps, p.id, 1);
      const cp = choices.get(p.id);
      let total = 0;

      if (left) {
        const dL = damageFromCompare(cp, choices.get(left.id));
        total += dL;
        if (dL > 0) {
          logs.push(
            `${p.name}（${formatPick(cp)}）輸給左邊 ${left.name}（${formatPick(choices.get(left.id))}）→ -1 血`
          );
        }
      }
      if (right) {
        const dR = damageFromCompare(cp, choices.get(right.id));
        total += dR;
        if (dR > 0) {
          logs.push(
            `${p.name}（${formatPick(cp)}）輸給右邊 ${right.name}（${formatPick(choices.get(right.id))}）→ -1 血`
          );
        }
      }
      damageMap.set(p.id, total);
      if (total === 0) {
        logs.push(`${p.name}：${formatPickDetail(cp)}，左右皆平或閃避，不扣血`);
      }
    }
  }

  for (const p of active) {
    const validated = choices.get(p.id);
    const beforeBullets = p.bullets;
    p.bullets = applyBulletChange(validated, p.bullets);
    const dmg = damageMap.get(p.id) ?? 0;
    if (dmg > 0) {
      p.hp -= dmg;
      if (p.hp <= 0) {
        p.alive = false;
        eliminatedCount++;
      }
    }
    const bulletNote =
      ACTIONS[validated].cost > 0
        ? `+${ACTIONS[validated].cost} 子彈`
        : ACTIONS[validated].cost < 0
          ? `消耗 ${-ACTIONS[validated].cost} 子彈`
          : '子彈不變';
    const mistaken = p.choice !== validated ? '（子彈不足→刺刀）' : '';
    p.revealedAction = validated;
    logs.push(
      `${p.name}：${formatPickDetail(validated)}${mistaken}，${bulletNote}（${beforeBullets}→${p.bullets}）`
    );
  }

  const allActive = ps.filter((p) => p.alive);
  // 僅在仍有對手（至少 2 名存活者）且皆無彈時補充；對手已出局則不補
  if (allActive.length >= 2 && allActive.every((p) => p.bullets === 0)) {
    for (const p of allActive) p.bullets += 1;
    logs.push('存活玩家皆無彈：每人 +1 子彈');
  }

  return { logs, choices, eliminatedCount };
}

export function getStartStats(mode) {
  return {
    bullets: 3,
    hp: mode === 'duel' ? 3 : 5,
  };
}
