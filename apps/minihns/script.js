(() => {
  'use strict';

  /******************************************************************
   * Phase 5+6 + Weapon Options Expansion
   * - Weapon must have:
   *   - DPS (auto damage per second add)
   *   - DPC (click damage add)
   * - Rarity-based extra options (random):
   *   - critChanceAdd (additive)
   *   - critMultAdd (additive to multiplier)
   *   - goldMultAdd (additive to gold multiplier)
   *
   * Notes:
   * - Critical applies to CLICK only.
   * - Inventory button stability: renderFast/renderSlow split maintained.
   ******************************************************************/

  /*********************
   * Constants
   *********************/
  const SAVE_KEY = 'mini_hns_phase5_6_opts_v1';
  const TICK_MS = 100;

  // Progression base (Phase5 scaling)
  const BASE_ENEMY_HP = 50;
  const ENEMY_HP_GROWTH_PER_KILL = 10;

  const BASE_GOLD_REWARD = 10;
  const GOLD_GROWTH_PER_KILL = 1; // killsで線形増加

  // Upgrades
  const BASE_DPS = 5;
  const DPS_PER_LEVEL = 2;
  const DPS_UPGRADE_BASE_COST = 20;
  const DPS_UPGRADE_COST_RATE = 1.5;

  // Click base
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

  // Base Critical (click only)
  const BASE_CRIT_CHANCE = 0.05;
  const BASE_CRIT_MULT = 2.0;

  // Phase6: Rarity
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

  // Boss drop distribution (sum 100) - Common = 0
  const DROP_WEIGHTS_BOSS = {
    common: 0,
    uncommon: 43,
    rare: 29,
    epic: 21,
    legendary: 7,
  };

  // Phase5+6: Weapon scaling
  // DPS base range grows with kills; rarity applies multiplier
  const WEAPON_DPS_BASE_MIN = 1;
  const WEAPON_DPS_BASE_MAX = 3;
  const WEAPON_DPS_GROWTH_PER_KILL = 0.35;

  // DPC base range grows with kills; tuned lower than DPS
  const WEAPON_DPC_BASE_MIN = 0;
  const WEAPON_DPC_BASE_MAX = 2;
  const WEAPON_DPC_GROWTH_PER_KILL = 0.20;

  const RARITY_POWER_MULT = {
    common: 1.0,
    uncommon: 1.25,
    rare: 1.6,
    epic: 2.1,
    legendary: 2.8,
  };

  // Rarity-based option counts (extra options)
  // common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 3
  const EXTRA_OPT_COUNT = {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 3,
  };

  // Option value ranges by rarity
  // critChanceAdd in [min,max] (e.g., 0.01 = +1%)
  const OPT_RANGES = {
    uncommon: {
      critChanceAdd: [0.01, 0.03],
      critMultAdd: [0.10, 0.25],
      goldMultAdd: [0.05, 0.15],
    },
    rare: {
      critChanceAdd: [0.02, 0.06],
      critMultAdd: [0.20, 0.50],
      goldMultAdd: [0.10, 0.30],
    },
    epic: {
      critChanceAdd: [0.04, 0.10],
      critMultAdd: [0.40, 0.90],
      goldMultAdd: [0.20, 0.60],
    },
    legendary: {
      critChanceAdd: [0.06, 0.15],
      critMultAdd: [0.70, 1.50],
      goldMultAdd: [0.40, 1.20],
    },
  };

  // Weapon name generation
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
   * {
   *  id: string,
   *  name: string,
   *  rarity: 'common'|'uncommon'|'rare'|'epic'|'legendary',
   *  dps: number,
   *  dpc: number,
   *  opts: { critChanceAdd:number, critMultAdd:number, goldMultAdd:number }
   * }
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

    equippedWeapon: {
      id: 'weapon_fist',
      name: '素手',
      rarity: 'common',
      dps: 0,
      dpc: 0,
      opts: { critChanceAdd: 0, critMultAdd: 0, goldMultAdd: 0 }
    },
    inventory: [],
    droppedWeapon: null,

    inRun: false,
  };

  let timerId = null;
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

  function randFloat(min, max) {
    return min + Math.random() * (max - min);
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

  function pct(n) {
    return `${Math.round(n * 100)}%`;
  }

  /*********************
   * Core Calculations
   *********************/
  function calcDpsFromLevel() {
    return state.dpsLevel * DPS_PER_LEVEL;
  }

  function weaponStats() {
    const w = state.equippedWeapon;
    return {
      dps: Number(w?.dps) || 0,
      dpc: Number(w?.dpc) || 0,
      opts: {
        critChanceAdd: Number(w?.opts?.critChanceAdd) || 0,
        critMultAdd: Number(w?.opts?.critMultAdd) || 0,
        goldMultAdd: Number(w?.opts?.goldMultAdd) || 0,
      }
    };
  }

  function calcTotalDps() {
    const w = weaponStats();
    return BASE_DPS + calcDpsFromLevel() + w.dps;
  }

  function calcClickDmgBaseOnly() {
    return BASE_CLICK_DMG + state.clickLevel * CLICK_DMG_PER_LEVEL;
  }

  function calcClickDmgTotal() {
    const w = weaponStats();
    return calcClickDmgBaseOnly() + w.dpc;
  }

  function calcCritChance() {
    const w = weaponStats();
    return clamp(BASE_CRIT_CHANCE + w.opts.critChanceAdd, 0, 0.75);
  }

  function calcCritMult() {
    const w = weaponStats();
    return clamp(BASE_CRIT_MULT + w.opts.critMultAdd, 1.0, 10.0);
  }

  function calcGoldMult() {
    const w = weaponStats();
    // additive: 0.20 = +20% => x1.20
    return clamp(1.0 + w.opts.goldMultAdd, 1.0, 100.0);
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
   * Phase5: Scaling unified by kills
   *********************/
  function hpBaseByKills(kills) {
    return BASE_ENEMY_HP + kills * ENEMY_HP_GROWTH_PER_KILL;
  }

  function goldBaseByKills(kills) {
    return BASE_GOLD_REWARD + kills * GOLD_GROWTH_PER_KILL;
  }

  function weaponDpsBaseRangeByKills(kills) {
    const add = kills * WEAPON_DPS_GROWTH_PER_KILL;
    const min = WEAPON_DPS_BASE_MIN + Math.floor(add);
    const max = WEAPON_DPS_BASE_MAX + Math.floor(add * 1.2);
    return { min, max: Math.max(min, max) };
  }

  function weaponDpcBaseRangeByKills(kills) {
    const add = kills * WEAPON_DPC_GROWTH_PER_KILL;
    const min = WEAPON_DPC_BASE_MIN + Math.floor(add * 0.7);
    const max = WEAPON_DPC_BASE_MAX + Math.floor(add * 1.0);
    return { min, max: Math.max(min, max) };
  }

  /*********************
   * Phase6: Rarity and option roll
   *********************/
  function rollRarity(isBossDrop) {
    const weights = isBossDrop ? DROP_WEIGHTS_BOSS : DROP_WEIGHTS_NORMAL;
    const total = RARITIES.reduce((sum, r) => sum + (weights[r] || 0), 0);

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

  function pickUnique(arr, count) {
    const copy = arr.slice();
    const out = [];
    const c = Math.min(count, copy.length);
    for (let i = 0; i < c; i++) {
      const idx = randInt(0, copy.length - 1);
      out.push(copy.splice(idx, 1)[0]);
    }
    return out;
  }

  function rollExtraOptions(rarity) {
    const count = EXTRA_OPT_COUNT[rarity] || 0;
    if (count <= 0) {
      return { critChanceAdd: 0, critMultAdd: 0, goldMultAdd: 0 };
    }

    const pool = ['critChanceAdd', 'critMultAdd', 'goldMultAdd'];
    const chosen = pickUnique(pool, count);

    const base = OPT_RANGES[rarity];
    const opts = { critChanceAdd: 0, critMultAdd: 0, goldMultAdd: 0 };

    for (const key of chosen) {
      const [min, max] = base[key];
      // store with 3-decimal precision to keep text stable
      opts[key] = Math.round(randFloat(min, max) * 1000) / 1000;
    }
    return opts;
  }

  function rollWeapon(isBossDrop) {
    const rarity = rollRarity(isBossDrop);
    const mult = RARITY_POWER_MULT[rarity] || 1.0;

    const dpsBase = weaponDpsBaseRangeByKills(state.kills);
    const dpcBase = weaponDpcBaseRangeByKills(state.kills);

    const dpsMin = Math.max(0, Math.floor(dpsBase.min * mult));
    const dpsMax = Math.max(dpsMin, Math.floor(dpsBase.max * mult));
    const dps = randInt(dpsMin, dpsMax);

    const dpcMin = Math.max(0, Math.floor(dpcBase.min * mult));
    const dpcMax = Math.max(dpcMin, Math.floor(dpcBase.max * mult));
    const dpc = randInt(dpcMin, dpcMax);

    const opts = rollExtraOptions(rarity);

    return {
      id: makeId('weapon'),
      name: rollWeaponName(rarity),
      rarity,
      dps,
      dpc,
      opts
    };
  }

  /*********************
   * Save / Load
   *********************/
  function normalizeRarity(r) {
    if (r === 'common') return 'common';
    if (r === 'uncommon') return 'uncommon';
    if (r === 'rare') return 'rare';
    if (r === 'epic') return 'epic';
    if (r === 'legendary') return 'legendary';
    return 'common';
  }

  function normalizeWeapon(w) {
    if (!w || typeof w !== 'object') return null;

    const rarity = normalizeRarity(w.rarity);
    return {
      id: String(w.id || makeId('weapon')),
      name: String(w.name || 'Unknown Weapon'),
      rarity,
      dps: Number(w.dps) || 0,
      dpc: Number(w.dpc) || 0,
      opts: {
        critChanceAdd: Number(w.opts?.critChanceAdd) || 0,
        critMultAdd: Number(w.opts?.critMultAdd) || 0,
        goldMultAdd: Number(w.opts?.goldMultAdd) || 0,
      }
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
      state.equippedWeapon = eq || {
        id: 'weapon_fist',
        name: '素手',
        rarity: 'common',
        dps: 0,
        dpc: 0,
        opts: { critChanceAdd: 0, critMultAdd: 0, goldMultAdd: 0 }
      };

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

      equippedWeapon: {
        id: 'weapon_fist',
        name: '素手',
        rarity: 'common',
        dps: 0,
        dpc: 0,
        opts: { critChanceAdd: 0, critMultAdd: 0, goldMultAdd: 0 }
      },
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
   * Enemy setup & Rewards
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
    const bossMult = state.isBoss ? BOSS_GOLD_MULT : 1;
    const wGoldMult = calcGoldMult();

    const gold = Math.floor(base * bossMult * wGoldMult);
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
    log(`装備変更：${w.name}（${RARITY_LABEL[w.rarity]} / DPS+${w.dps} / DPC+${w.dpc}）`);
  }

  function equipDropWeapon() {
    if (!state.droppedWeapon) return;
    state.equippedWeapon = state.droppedWeapon;
    state.droppedWeapon = null;
    needsSlowRender = true;
    const w = state.equippedWeapon;
    log(`装備変更：${w.name}（${RARITY_LABEL[w.rarity]} / DPS+${w.dps} / DPC+${w.dpc}）`);
  }

  function discardDropWeapon() {
    if (!state.droppedWeapon) return;
    const w = state.droppedWeapon;
    log(`武器破棄：${w.name}（${RARITY_LABEL[w.rarity]} / DPS+${w.dps} / DPC+${w.dpc}）`);
    state.droppedWeapon = null;
    needsSlowRender = true;
  }

  function addDropToInventory() {
    if (!state.droppedWeapon) return;

    if (addToInventory(state.droppedWeapon)) {
      const w = state.droppedWeapon;
      log(`インベントリに追加：${w.name}（${RARITY_LABEL[w.rarity]} / DPS+${w.dps} / DPC+${w.dpc}）`);
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

    const drop = state.droppedWeapon;

    if (idx < state.inventory.length) {
      const removed = state.inventory[idx];
      state.inventory[idx] = drop;
      log(`置換：${removed.name}（${RARITY_LABEL[removed.rarity]}） → ${drop.name}（${RARITY_LABEL[drop.rarity]}）`);
      state.droppedWeapon = null;
      needsSlowRender = true;
      return;
    }

    if (addToInventory(drop)) {
      log(`インベントリに追加：${drop.name}（${RARITY_LABEL[drop.rarity]}）`);
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
      log(`撃破！ +${gold}G / 武器取得：${drop.name}（${RARITY_LABEL[drop.rarity]} / DPS+${drop.dps} / DPC+${drop.dpc}）`);
    } else {
      log(`撃破！ +${gold}G / 武器ドロップ：${drop.name}（${RARITY_LABEL[drop.rarity]} / DPS+${drop.dps} / DPC+${drop.dpc}）→ 置換 or 破棄`);
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
    log(`周回開始：敵#${n}${state.isBoss ? '（BOSS）' : ''} / 総DPS=${calcTotalDps()} / ClickDMG=${calcClickDmgTotal()}`);

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
    return Math.random() < calcCritChance();
  }

  function clickAttack() {
    if (!state.inRun) return;

    const base = calcClickDmgTotal();
    const isCrit = rollCrit();
    const mult = calcCritMult();
    const dmg = isCrit ? Math.floor(base * mult) : base;

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
    log(`クリック強化：Lv${state.clickLevel}（ClickDMG=${calcClickDmgTotal()}）`);
    save();
    renderFast();
  }

  /*********************
   * Rendering
   *********************/
  function rarityCssClass(rarity) {
    return `rarity-${rarity}`;
  }

  function optsSummary(w) {
    if (!w || !w.opts) return '';
    const parts = [];
    if (w.opts.critChanceAdd > 0) parts.push(`CRIT率+${pct(w.opts.critChanceAdd)}`);
    if (w.opts.critMultAdd > 0) parts.push(`CRIT倍+${w.opts.critMultAdd.toFixed(2)}`);
    if (w.opts.goldMultAdd > 0) parts.push(`G+${pct(w.opts.goldMultAdd)}`);
    return parts.length ? ` / ${parts.join(' / ')}` : '';
  }

  function weaponLabel(w) {
    if (!w) return '---';
    const cls = rarityCssClass(w.rarity);
    const label = RARITY_LABEL[w.rarity] || 'Common';

    return `<span class="${cls}">${label}：${escapeHtml(w.name)}（DPS+${w.dps} / DPC+${w.dpc}${escapeHtml(optsSummary(w))}）</span>`;
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
    elWeaponDps.textContent = weaponStats().dps;

    // ClickDMG表示は「基礎 + 武器DPC」
    elClickDmg.textContent = calcClickDmgTotal();

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
        if (removed) {
          log(`武器破棄：${removed.name}（${RARITY_LABEL[removed.rarity]} / DPS+${removed.dps} / DPC+${removed.dpc}）`);
        }
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

    elEnemyImg.src = enemyImagePath(clamp(state.enemyImageNo, 1, ENEMY_IMAGE_COUNT));

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
