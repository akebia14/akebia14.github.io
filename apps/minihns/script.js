(() => {
  'use strict';

  /******************************************************************
   * Phase 5 + Phase 6 Integrated Game Logic (script.js)
   * - Phase5: Scaling unified by kills (enemy HP, gold, weapon DPS)
   * - Phase6: Rarity 5 tiers (Common/Uncommon/Rare/Epic/Legendary)
   * - Boss rarity: Common = 0, redistributed to others (fixed weights)
   * - Keeps: auto DPS tick, click dmg, inventory(5), equip(1), float dmg,
   *          boss every 10, kill fx, save/load, renderFast/renderSlow split
   *
   * NOTE:
   * - Critical applies to CLICK only (avoid tick spam).
   ******************************************************************/

  /*********************
   * Constants
   *********************/
  const SAVE_KEY = 'mini_hns_phase5_6_v1';

  const TICK_MS = 100;

  // Progression base (Phase5 scaling)
  const BASE_ENEMY_HP = 50;
  const ENEMY_HP_GROWTH_PER_KILL = 10;

  const BASE_GOLD_REWARD = 10;
  const GOLD_GROWTH_PER_KILL = 1; // kills で線形増加（固定）

  // Upgrades
  const BASE_DPS = 5;
  const DPS_PER_LEVEL = 2;
  const DPS_UPGRADE_BASE_COST = 20;
  const DPS_UPGRADE_COST_RATE = 1.5;

  const BASE_CLICK_DMG = 1;
  const CLICK_DMG_PER_LEVEL = 1;
  const CLICK_UPGRADE_BASE_COST = 15;
  const CLICK_UPGRADE_COST_RATE = 1.6;

  // Enemy images
  const ENEMY_IMAGE_COUNT = 16;
  const ENEMY_IMAGE_DIR = './pic/enemy/';
  const ENEMY_IMAGE_PREFIX = 'enemy';
  const ENEMY_IMAGE_EXT = '.png';

  // Float dmg
  const FLOAT_LIFETIME_MS = 500;
  const FLOAT_MARGIN_PX = 14;
  const FLOAT_FONT_MIN = 16;
  const FLOAT_FONT_MAX = 22;

  // Kill FX (CSS classes)
  const KILL_SHAKE_CLASS = 'killShake';
  const FLASH_CLASS = 'on';

  // Inventory
  const INVENTORY_SIZE = 5;

  // Boss
  const BOSS_EVERY = 10;
  const BOSS_HP_MULT = 5;
  const BOSS_GOLD_MULT = 5;

  // Critical (click only)
  const CRIT_CHANCE = 0.05;
  const CRIT_MULT = 2.0;

  // Phase6: Rarity definition
  const RARITIES = /** @type {const} */ ([
    'common',
    'uncommon',
    'rare',
    'epic',
    'legendary'
  ]);

  const RARITY_LABEL = {
    common: 'Common',
    uncommon: 'Uncommon',
    rare: 'Rare',
    epic: 'Epic',
    legendary: 'Legendary',
  };

  // Normal drop distribution (sum 100)
  const DROP_WEIGHTS_NORMAL = {
    common: 60,
    uncommon: 25,
    rare: 10,
    epic: 4,
    legendary: 1,
  };

  // Boss drop distribution (sum 100)
  // User request: Common = 0, redistribute to others
  const DROP_WEIGHTS_BOSS = {
    common: 0,
    uncommon: 43,
    rare: 29,
    epic: 21,
    legendary: 7,
  };

  // Phase5+6: Weapon DPS scaling
  // base grows with kills; rarity adds multiplier
  const WEAPON_DPS_BASE_MIN = 1;
  const WEAPON_DPS_BASE_MAX = 3;
  const WEAPON_DPS_GROWTH_PER_KILL = 0.35; // killsで基礎レンジが伸びる（固定）

  const RARITY_DPS_MULT = {
    common: 1.0,
    uncommon: 1.25,
    rare: 1.6,
    epic: 2.1,
    legendary: 2.8,
  };

  // Weapon name generation (Phase6)
  const TYPES = ['Sword', 'Axe', 'Dagger', 'Mace', 'Spear'];

  const PREFIX_BY_RARITY = {
    common: ['Rusty', 'Plain', 'Worn', 'Simple', 'Old'],
    uncommon: ['Sturdy', 'Balanced', 'Honed', 'Reliable', 'Tough'],
    rare: ['Sharp', 'Brutal', 'Arcane', 'Gleaming', 'Vicious', 'Mythic'],
    epic: ['Eternal', 'Doom', 'Celestial', 'Abyssal', 'Radiant'],
    legendary: ['Godslayer', 'Worldbreaker', 'Phoenix', 'Dragon', 'Legend'],
  };

  const SUFFIX_BY_RARITY = {
    common: ['of Training', 'of Habit', 'of Practice', 'of Steady Hands'],
    uncommon: ['of Craft', 'of Readiness', 'of Momentum', 'of Focus'],
    rare: ['of Power', 'of Fury', 'of Slaughter', 'of Precision', 'of Kings'],
    epic: ['of Cataclysm', 'of the Void', 'of Ascension', 'of the Titans'],
    legendary: ['of Infinity', 'of Apocalypse', 'of the Ancients', 'of Destiny'],
  };

  /*********************
   * State
   *********************/
  /** Weapon shape:
   * { id: string, name: string, rarity: 'common'|'uncommon'|'rare'|'epic'|'legendary', dps: number }
   */
  let state = {
    gold: 0,
    kills: 0,
    dpsLevel: 0,
    clickLevel: 0,

    enemyHpMax: BASE_ENEMY_HP,
    enemyHp: BASE_ENEMY_HP,
    enemyImageNo: 1,
    isBoss: false,

    equippedWeapon: { id: 'weapon_fist', name: '素手', rarity: 'common', dps: 0 },
    inventory: [],
    droppedWeapon: null,

    inRun: false,
  };

  let timerId = null;

  // Heavy UI rebuild only when changed
  let needsSlowRender = true;

  /*********************
   * DOM
   *********************/
  const $ = (id) => document.getElementById(id);

  const elStatus = $('status');
  const elEnemyHp = $('enemyHp');
  const elEnemyHpMax = $('enemyHpMax');
  const elGold = $('gold');
  const elKills = $('runs');

  const elTotalDps = $('totalDps');
  const elBaseDps = $('baseDps');
  const elLvDps = $('lvDps');
  const elWeaponDps = $('weaponDps');

  const elClickDmg = $('clickDmg');

  const elDpsLevel = $('dpsLevel');
  const elDpsCost = $('dpsCost');
  const elClickLevel = $('clickLevel');
  const elClickCost = $('clickCost');

  const elEnemyArea = $('enemyArea');
  const elEnemyImg = $('enemyImg');
  const elFlash = $('flash');

  const elEquippedWeapon = $('equippedWeapon');
  const elDroppedWeapon = $('droppedWeapon');
  const elDropActions = $('dropActions');
  const elReplaceActions = $('replaceActions');
  const elInventoryList = $('inventoryList');

  const elLog = $('log');

  const btnStart = $('btnStart');
  const btnStop = $('btnStop');
  const btnReset = $('btnReset');

  const btnUpgradeDps = $('btnUpgradeDps');
  const btnUpgradeClick = $('btnUpgradeClick');

  const btnEquipDrop = $('btnEquipDrop');
  const btnAddDrop = $('btnAddDrop');
  const btnDiscardDrop = $('btnDiscardDrop');

  /*********************
   * Helpers
   *********************/
  function nowTs() {
    return new Date().toLocaleString();
  }

  function log(line) {
    elLog.textContent = `[${nowTs()}] ${line}\n` + elLog.textContent;
  }

  function pad3(n) {
    return String(n).padStart(3, '0');
  }

  function enemyImagePath(no) {
    return `${ENEMY_IMAGE_DIR}${ENEMY_IMAGE_PREFIX}${pad3(no)}${ENEMY_IMAGE_EXT}`;
  }

  function rollEnemyImageNo() {
    return 1 + Math.floor(Math.random() * ENEMY_IMAGE_COUNT);
  }

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /*********************
   * Calculations
   *********************/
  function calcDpsFromLevel() {
    return state.dpsLevel * DPS_PER_LEVEL;
  }

  function calcTotalDps() {
    return BASE_DPS + calcDpsFromLevel() + (state.equippedWeapon?.dps || 0);
  }

  function calcClickDmgBase() {
    return BASE_CLICK_DMG + state.clickLevel * CLICK_DMG_PER_LEVEL;
  }

  function calcDpsUpgradeCost() {
    return Math.floor(DPS_UPGRADE_BASE_COST * Math.pow(DPS_UPGRADE_COST_RATE, state.dpsLevel));
  }

  function calcClickUpgradeCost() {
    return Math.floor(CLICK_UPGRADE_BASE_COST * Math.pow(CLICK_UPGRADE_COST_RATE, state.clickLevel));
  }

  function currentEnemyNumber() {
    return state.kills + 1;
  }

  function isBossForEnemyNumber(n) {
    return (n % BOSS_EVERY) === 0;
  }

  /*********************
   * Phase5: Scaling (unified by kills)
   *********************/
  function hpBaseByKills(kills) {
    return BASE_ENEMY_HP + kills * ENEMY_HP_GROWTH_PER_KILL;
  }

  function goldBaseByKills(kills) {
    return BASE_GOLD_REWARD + kills * GOLD_GROWTH_PER_KILL;
  }

  function weaponBaseRangeByKills(kills) {
    // Base range grows gradually with kills
    const add = kills * WEAPON_DPS_GROWTH_PER_KILL;
    const min = WEAPON_DPS_BASE_MIN + Math.floor(add);
    const max = WEAPON_DPS_BASE_MAX + Math.floor(add * 1.2);
    return { min, max: Math.max(min, max) };
  }

  /*********************
   * Phase6: Rarity roll
   *********************/
  function rollRarity(isBossDrop) {
    const weights = isBossDrop ? DROP_WEIGHTS_BOSS : DROP_WEIGHTS_NORMAL;

    const total = RARITIES.reduce((sum, r) => sum + (weights[r] || 0), 0);
    // total should be 100 by design, but calculate anyway.
    let roll = Math.random() * total;

    for (const r of RARITIES) {
      roll -= (weights[r] || 0);
      if (roll < 0) return r;
    }
    return 'common';
  }

  function rollWeaponName(rarity) {
    const prefixArr = PREFIX_BY_RARITY[rarity] || PREFIX_BY_RARITY.common;
    const suffixArr = SUFFIX_BY_RARITY[rarity] || SUFFIX_BY_RARITY.common;

    const prefix = prefixArr[randInt(0, prefixArr.length - 1)];
    const type = TYPES[randInt(0, TYPES.length - 1)];
    const suffix = suffixArr[randInt(0, suffixArr.length - 1)];

    return `${prefix} ${type} ${suffix}`;
  }

  function rollWeapon(isBossDrop) {
    const rarity = rollRarity(isBossDrop);

    const baseRange = weaponBaseRangeByKills(state.kills);
    const mult = RARITY_DPS_MULT[rarity] || 1.0;

    // Apply multiplier to base range
    const min = Math.max(1, Math.floor(baseRange.min * mult));
    const max = Math.max(min, Math.floor(baseRange.max * mult));

    const dps = randInt(min, max);

    return {
      id: makeId('weapon'),
      name: rollWeaponName(rarity),
      rarity,
      dps,
    };
  }

  /*********************
   * Save / Load
   *********************/
  function normalizeRarity(r) {
    // backward compatibility: old version used 'rare' vs 'common'
    if (r === 'rare') return 'rare';
    if (r === 'common') return 'common';
    if (r === 'uncommon') return 'uncommon';
    if (r === 'epic') return 'epic';
    if (r === 'legendary') return 'legendary';
    return 'common';
  }

  function normalizeWeapon(w) {
    if (!w || typeof w !== 'object') return null;
    return {
      id: String(w.id || makeId('weapon')),
      name: String(w.name || 'Unknown Weapon'),
      rarity: normalizeRarity(w.rarity),
      dps: Number(w.dps) || 0
    };
  }

  function save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    try {
      const parsed = JSON.parse(raw);

      state.gold = Number(parsed.gold) || 0;
      state.kills = Number(parsed.kills ?? parsed.runs) || 0;
      state.dpsLevel = Number(parsed.dpsLevel) || 0;
      state.clickLevel = Number(parsed.clickLevel) || 0;

      state.enemyHpMax = Number(parsed.enemyHpMax) || BASE_ENEMY_HP;
      state.enemyHp = Number(parsed.enemyHp) || state.enemyHpMax;

      const no = Number(parsed.enemyImageNo);
      state.enemyImageNo = (no >= 1 && no <= ENEMY_IMAGE_COUNT) ? no : 1;

      state.isBoss = Boolean(parsed.isBoss);

      const eq = normalizeWeapon(parsed.equippedWeapon);
      state.equippedWeapon = eq || { id: 'weapon_fist', name: '素手', rarity: 'common', dps: 0 };

      state.inventory = Array.isArray(parsed.inventory)
        ? parsed.inventory.slice(0, INVENTORY_SIZE).map(normalizeWeapon).filter(Boolean)
        : [];

      state.droppedWeapon = normalizeWeapon(parsed.droppedWeapon);

      state.inRun = Boolean(parsed.inRun);

      return true;
    } catch {
      return false;
    }
  }

  function stopRun() {
    state.inRun = false;
    timerId && clearInterval(timerId);
    timerId = null;
  }

  function resetAll() {
    stopRun();
    localStorage.removeItem(SAVE_KEY);

    state = {
      gold: 0,
      kills: 0,
      dpsLevel: 0,
      clickLevel: 0,

      enemyHpMax: BASE_ENEMY_HP,
      enemyHp: BASE_ENEMY_HP,
      enemyImageNo: 1,
      isBoss: false,

      equippedWeapon: { id: 'weapon_fist', name: '素手', rarity: 'common', dps: 0 },
      inventory: [],
      droppedWeapon: null,

      inRun: false,
    };

    needsSlowRender = true;

    elEnemyImg.src = enemyImagePath(state.enemyImageNo);
    renderFast();
    renderSlow();
    needsSlowRender = false;

    log('リセットしました。');
    save();
  }

  /*********************
   * FX
   *********************/
  function playKillFx() {
    elEnemyImg.classList.remove(KILL_SHAKE_CLASS);
    void elEnemyImg.offsetWidth;
    elEnemyImg.classList.add(KILL_SHAKE_CLASS);

    elFlash.classList.remove(FLASH_CLASS);
    void elFlash.offsetWidth;
    elFlash.classList.add(FLASH_CLASS);
  }

  function spawnDamageFloat(text) {
    const w = elEnemyArea.clientWidth;
    const h = elEnemyArea.clientHeight;

    const x = FLOAT_MARGIN_PX + Math.random() * (w - FLOAT_MARGIN_PX * 2);
    const y = FLOAT_MARGIN_PX + Math.random() * (h - FLOAT_MARGIN_PX * 2);

    const font = Math.floor(FLOAT_FONT_MIN + Math.random() * (FLOAT_FONT_MAX - FLOAT_FONT_MIN));

    const el = document.createElement('div');
    el.className = 'floatDmg';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.fontSize = `${font}px`;

    elEnemyArea.appendChild(el);
    setTimeout(() => el.remove(), FLOAT_LIFETIME_MS);
  }

  /*********************
   * Enemy setup
   *********************/
  function prepareNextEnemy() {
    const n = currentEnemyNumber();
    const boss = isBossForEnemyNumber(n);
    state.isBoss = boss;

    const base = hpBaseByKills(state.kills);
    state.enemyHpMax = boss ? base * BOSS_HP_MULT : base;
    state.enemyHp = state.enemyHpMax;

    state.enemyImageNo = rollEnemyImageNo();
    elEnemyImg.src = enemyImagePath(state.enemyImageNo);
  }

  function rewardGold() {
    const base = goldBaseByKills(state.kills);
    const gold = state.isBoss ? base * BOSS_GOLD_MULT : base;
    state.gold += gold;
    return gold;
  }

  /*********************
   * Inventory actions
   *********************/
  function isInventoryFull() {
    return state.inventory.length >= INVENTORY_SIZE;
  }

  function addToInventory(w) {
    if (isInventoryFull()) return false;
    state.inventory.push(w);
    return true;
  }

  function removeFromInventoryByIndex(idx) {
    if (idx < 0 || idx >= state.inventory.length) return null;
    return state.inventory.splice(idx, 1)[0] || null;
  }

  function equipWeaponFromInventoryIndex(idx) {
    const w = state.inventory[idx];
    if (!w) return;
    state.equippedWeapon = w;
    needsSlowRender = true;
    log(`装備変更：${w.name}（${RARITY_LABEL[w.rarity]} / +${w.dps} DPS）/ 総DPS=${calcTotalDps()}`);
  }

  function equipDropWeapon() {
    if (!state.droppedWeapon) return;
    state.equippedWeapon = state.droppedWeapon;
    state.droppedWeapon = null;
    needsSlowRender = true;
    log(`装備変更：${state.equippedWeapon.name}（${RARITY_LABEL[state.equippedWeapon.rarity]} / +${state.equippedWeapon.dps} DPS）/ 総DPS=${calcTotalDps()}`);
  }

  function discardDropWeapon() {
    if (!state.droppedWeapon) return;
    log(`武器破棄：${state.droppedWeapon.name}（${RARITY_LABEL[state.droppedWeapon.rarity]} / +${state.droppedWeapon.dps} DPS）`);
    state.droppedWeapon = null;
    needsSlowRender = true;
  }

  function addDropToInventory() {
    if (!state.droppedWeapon) return;

    if (addToInventory(state.droppedWeapon)) {
      log(`インベントリに追加：${state.droppedWeapon.name}（${RARITY_LABEL[state.droppedWeapon.rarity]} / +${state.droppedWeapon.dps} DPS）`);
      state.droppedWeapon = null;
      needsSlowRender = true;
    } else {
      log('インベントリが満杯です。置換ボタンで入れ替えてください。');
      needsSlowRender = true;
    }
  }

  function replaceInventoryIndexWithDrop(idx) {
    if (!state.droppedWeapon) return;
    if (idx < 0 || idx >= INVENTORY_SIZE) return;

    if (idx < state.inventory.length) {
      const removed = state.inventory[idx];
      state.inventory[idx] = state.droppedWeapon;
      log(`置換：${removed.name}（${RARITY_LABEL[removed.rarity]}） → ${state.inventory[idx].name}（${RARITY_LABEL[state.inventory[idx].rarity]}）`);
      state.droppedWeapon = null;
      needsSlowRender = true;
      return;
    }

    if (addToInventory(state.droppedWeapon)) {
      log(`インベントリに追加：${state.droppedWeapon.name}（${RARITY_LABEL[state.droppedWeapon.rarity]}）`);
      state.droppedWeapon = null;
      needsSlowRender = true;
    } else {
      log('置換に失敗しました（満杯）。');
      needsSlowRender = true;
    }
  }

  /*********************
   * Kill flow
   *********************/
  function onEnemyKilled() {
    playKillFx();

    state.kills += 1;
    const gold = rewardGold();

    const drop = rollWeapon(state.isBoss);
    state.droppedWeapon = drop;

    if (!isInventoryFull()) {
      addToInventory(drop);
      state.droppedWeapon = null;
      log(`撃破！ +${gold}G / 武器取得：${drop.name}（${RARITY_LABEL[drop.rarity]} / +${drop.dps} DPS）`);
    } else {
      log(`撃破！ +${gold}G / 武器ドロップ：${drop.name}（${RARITY_LABEL[drop.rarity]} / +${drop.dps} DPS）→ 置換 or 破棄`);
    }

    needsSlowRender = true;
    prepareNextEnemy();
  }

  /*********************
   * Run control
   *********************/
  function startRun() {
    if (state.inRun) return;

    state.inRun = true;
    prepareNextEnemy();

    const n = currentEnemyNumber();
    log(`周回開始：敵#${n}${state.isBoss ? '（BOSS）' : ''} / 総DPS=${calcTotalDps()}`);

    timerId && clearInterval(timerId);
    timerId = setInterval(tick, TICK_MS);

    save();
    renderFast();
    if (needsSlowRender) {
      renderSlow();
      needsSlowRender = false;
    }
  }

  function tick() {
    if (!state.inRun) return;

    const dps = calcTotalDps();
    const damage = dps * (TICK_MS / 1000);
    state.enemyHp = Math.max(0, state.enemyHp - damage);

    if (state.enemyHp <= 0) {
      onEnemyKilled();
    }

    save();
    renderFast();
    if (needsSlowRender) {
      renderSlow();
      needsSlowRender = false;
    }
  }

  /*********************
   * Click attack (+crit)
   *********************/
  function rollCrit() {
    return Math.random() < CRIT_CHANCE;
  }

  function clickAttack() {
    if (!state.inRun) return;

    const base = calcClickDmgBase();
    const isCrit = rollCrit();
    const dmg = isCrit ? Math.floor(base * CRIT_MULT) : base;

    spawnDamageFloat(isCrit ? `CRIT! -${dmg}` : `-${dmg}`);

    state.enemyHp = Math.max(0, state.enemyHp - dmg);
    if (state.enemyHp <= 0) {
      onEnemyKilled();
    }

    save();
    renderFast();
    if (needsSlowRender) {
      renderSlow();
      needsSlowRender = false;
    }
  }

  /*********************
   * Upgrades
   *********************/
  function upgradeDps() {
    const cost = calcDpsUpgradeCost();
    if (state.gold < cost) {
      log('Goldが足りません（DPS強化）。');
      return;
    }
    state.gold -= cost;
    state.dpsLevel += 1;
    log(`DPS強化：Lv${state.dpsLevel}（総DPS=${calcTotalDps()}）`);

    save();
    renderFast();
  }

  function upgradeClick() {
    const cost = calcClickUpgradeCost();
    if (state.gold < cost) {
      log('Goldが足りません（クリック強化）。');
      return;
    }
    state.gold -= cost;
    state.clickLevel += 1;
    log(`クリック強化：Lv${state.clickLevel}（ClickDMG=${calcClickDmgBase()} / Crit x${CRIT_MULT}）`);

    save();
    renderFast();
  }

  /*********************
   * Rendering
   *********************/
  function rarityCssClass(rarity) {
  return `rarity-${rarity}`;
}


  function weaponLabel(w) {
    if (!w) return '---';
    const cls = rarityCssClass(w.rarity);
    const label = RARITY_LABEL[w.rarity] || 'Common';
    return `<span class="${cls}">${label}：${escapeHtml(w.name)}（+${w.dps} DPS）</span>`;
  }

  // Fast: update numeric/status only
  function renderFast() {
    const n = currentEnemyNumber();
    elStatus.textContent = state.inRun
      ? `RUNNING (#${n}${state.isBoss ? ' BOSS' : ''})`
      : 'IDLE';

    elEnemyHp.textContent = Math.ceil(state.enemyHp);
    elEnemyHpMax.textContent = state.enemyHpMax;

    elGold.textContent = state.gold;
    elKills.textContent = state.kills;

    const total = calcTotalDps();
    elTotalDps.textContent = total;
    elBaseDps.textContent = BASE_DPS;
    elLvDps.textContent = calcDpsFromLevel();
    elWeaponDps.textContent = state.equippedWeapon?.dps || 0;

    elClickDmg.textContent = calcClickDmgBase();

    elDpsLevel.textContent = state.dpsLevel;
    elDpsCost.textContent = calcDpsUpgradeCost();

    elClickLevel.textContent = state.clickLevel;
    elClickCost.textContent = calcClickUpgradeCost();
  }

  function renderInventory() {
    let html = '';
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const w = state.inventory[i];
      if (!w) {
        html += `
          <div class="invRow">
            <span class="tag">#${i + 1}</span>
            <span class="mono">（空）</span>
          </div>`;
        continue;
      }
      html += `
        <div class="invRow">
          <span class="tag">#${i + 1}</span>
          <span>${weaponLabel(w)}</span>
          <button data-act="equipInv" data-idx="${i}">装備</button>
          <button data-act="discardInv" data-idx="${i}">破棄</button>
        </div>`;
    }
    elInventoryList.innerHTML = html;
  }

  function renderDropControls() {
    const hasDrop = !!state.droppedWeapon;

    elDropActions.style.display = hasDrop ? 'block' : 'none';

    btnAddDrop.disabled = !hasDrop || isInventoryFull();
    btnEquipDrop.disabled = !hasDrop;
    btnDiscardDrop.disabled = !hasDrop;

    if (hasDrop && isInventoryFull()) {
      let html = '<div class="hint">インベントリ満杯：置換先を選択</div>';
      for (let i = 0; i < INVENTORY_SIZE; i++) {
        html += `<button data-act="replace" data-idx="${i}">#${i + 1} と置換</button>`;
      }
      elReplaceActions.innerHTML = html;
      elReplaceActions.style.display = 'block';
    } else {
      elReplaceActions.innerHTML = '';
      elReplaceActions.style.display = 'none';
    }
  }

  function renderSlow() {
    elEquippedWeapon.innerHTML = weaponLabel(state.equippedWeapon);
    elDroppedWeapon.innerHTML = weaponLabel(state.droppedWeapon);

    renderInventory();
    renderDropControls();
  }

  /*********************
   * Events
   *********************/
  function bindEvents() {
    btnStart.onclick = startRun;

    btnStop.onclick = () => {
      log('停止しました。');
      stopRun();
      save();
      renderFast();
    };

    btnReset.onclick = resetAll;

    btnUpgradeDps.onclick = upgradeDps;
    btnUpgradeClick.onclick = upgradeClick;

    elEnemyImg.addEventListener('click', clickAttack);

    elEnemyImg.addEventListener('error', () => {
      log(`画像が読み込めません：${elEnemyImg.src}`);
    });

    btnEquipDrop.onclick = () => {
      equipDropWeapon();
      save();
      renderFast();
      if (needsSlowRender) { renderSlow(); needsSlowRender = false; }
    };

    btnAddDrop.onclick = () => {
      addDropToInventory();
      save();
      renderFast();
      if (needsSlowRender) { renderSlow(); needsSlowRender = false; }
    };

    btnDiscardDrop.onclick = () => {
      discardDropWeapon();
      save();
      renderFast();
      if (needsSlowRender) { renderSlow(); needsSlowRender = false; }
    };

    elReplaceActions.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.getAttribute('data-act') !== 'replace') return;

      const idx = Number(t.getAttribute('data-idx'));
      if (!Number.isFinite(idx)) return;

      replaceInventoryIndexWithDrop(idx);
      save();
      renderFast();
      if (needsSlowRender) { renderSlow(); needsSlowRender = false; }
    });

    elInventoryList.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;

      const act = t.getAttribute('data-act');
      if (!act) return;

      const idx = Number(t.getAttribute('data-idx'));
      if (!Number.isFinite(idx)) return;

      if (act === 'equipInv') {
        equipWeaponFromInventoryIndex(idx);
        save();
        renderFast();
        if (needsSlowRender) { renderSlow(); needsSlowRender = false; }
        return;
      }

      if (act === 'discardInv') {
        const removed = removeFromInventoryByIndex(idx);
        if (removed) log(`武器破棄：${removed.name}（${RARITY_LABEL[removed.rarity]} / +${removed.dps} DPS）`);
        needsSlowRender = true;
        save();
        renderFast();
        if (needsSlowRender) { renderSlow(); needsSlowRender = false; }
        return;
      }
    });
  }

  /*********************
   * Init
   *********************/
  function init() {
    const loaded = load();

    // do not auto-resume
    state.inRun = false;

    // ensure enemy image is set
    elEnemyImg.src = enemyImagePath(clamp(state.enemyImageNo, 1, ENEMY_IMAGE_COUNT));

    // First render
    renderFast();
    renderSlow();
    needsSlowRender = false;

    log(loaded ? 'セーブデータをロードしました。' : '新規開始です。');

    save();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
