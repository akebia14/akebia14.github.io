(() => {
  'use strict';

  /******************************************************************
   * Phase 3.1〜4 Integrated Game Logic (script.js)
   * FIX: Inventory buttons require multiple clicks
   * - Cause: tick(100ms) called render() which rebuilt inventory DOM via innerHTML
   * - Fix: Split rendering into renderFast (every tick) and renderSlow (only on changes)
   ******************************************************************/

  /*********************
   * Constants
   *********************/
  const SAVE_KEY = 'mini_hns_phase4_integrated_v1';

  const TICK_MS = 100;

  // Base progression
  const BASE_ENEMY_HP = 50;
  const ENEMY_HP_GROWTH_PER_KILL = 10;
  const BASE_GOLD_REWARD = 10;

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

  // Inventory / weapons
  const INVENTORY_SIZE = 5;

  const WEAPON_DROP_RATE_RARE = 0.20;       // normal
  const WEAPON_DROP_RATE_RARE_BOSS = 0.50;  // boss
  const WEAPON_COMMON_MIN = 1;
  const WEAPON_COMMON_MAX = 5;
  const WEAPON_RARE_MIN = 6;
  const WEAPON_RARE_MAX = 15;

  // Boss
  const BOSS_EVERY = 10;
  const BOSS_HP_MULT = 5;
  const BOSS_GOLD_MULT = 5;

  // Critical (click only)
  const CRIT_CHANCE = 0.05;
  const CRIT_MULT = 2.0;

  // Weapon name generation
  const PREFIX_COMMON = ['Rusty', 'Plain', 'Worn', 'Simple', 'Old'];
  const PREFIX_RARE = ['Sharp', 'Brutal', 'Arcane', 'Gleaming', 'Vicious', 'Mythic'];

  const TYPES = ['Sword', 'Axe', 'Dagger', 'Mace', 'Spear'];

  const SUFFIX_COMMON = ['of Training', 'of Habit', 'of Practice', 'of Steady Hands'];
  const SUFFIX_RARE = ['of Power', 'of Fury', 'of Slaughter', 'of Precision', 'of Kings'];

  /*********************
   * State
   *********************/
  /** Weapon shape:
   * { id: string, name: string, rarity: 'common'|'rare', dps: number }
   */
  let state = {
    gold: 0,
    kills: 0,           // total enemies defeated
    dpsLevel: 0,
    clickLevel: 0,

    enemyHpMax: BASE_ENEMY_HP,
    enemyHp: BASE_ENEMY_HP,
    enemyImageNo: 1,
    isBoss: false,      // current enemy is boss?

    equippedWeapon: { id: 'weapon_fist', name: '素手', rarity: 'common', dps: 0 },
    inventory: [],      // up to INVENTORY_SIZE
    droppedWeapon: null,

    inRun: false,
  };

  let timerId = null;

  // ★ FIX: heavy UI rebuild only when changed
  let needsSlowRender = true;

  /*********************
   * DOM
   *********************/
  const $ = (id) => document.getElementById(id);

  // Status box
  const elStatus = $('status');
  const elEnemyHp = $('enemyHp');
  const elEnemyHpMax = $('enemyHpMax');
  const elGold = $('gold');
  const elKills = $('runs'); // UI label "runs" = kills

  // DPS breakdown
  const elTotalDps = $('totalDps');
  const elBaseDps = $('baseDps');
  const elLvDps = $('lvDps');
  const elWeaponDps = $('weaponDps');

  // Click
  const elClickDmg = $('clickDmg');

  // Upgrades
  const elDpsLevel = $('dpsLevel');
  const elDpsCost = $('dpsCost');
  const elClickLevel = $('clickLevel');
  const elClickCost = $('clickCost');

  // Enemy image area
  const elEnemyArea = $('enemyArea');
  const elEnemyImg = $('enemyImg');
  const elFlash = $('flash');

  // Equipment / drop / inventory
  const elEquippedWeapon = $('equippedWeapon');
  const elDroppedWeapon = $('droppedWeapon');
  const elDropActions = $('dropActions');
  const elReplaceActions = $('replaceActions');
  const elInventoryList = $('inventoryList');

  // Log
  const elLog = $('log');

  // Buttons
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
    return state.kills + 1; // 1-indexed
  }

  function isBossForEnemyNumber(n) {
    return (n % BOSS_EVERY) === 0;
  }

  /*********************
   * Weapon generation
   *********************/
  function rollWeapon(isBossDrop) {
    const rareRate = isBossDrop ? WEAPON_DROP_RATE_RARE_BOSS : WEAPON_DROP_RATE_RARE;
    const isRare = Math.random() < rareRate;

    const dps = isRare
      ? randInt(WEAPON_RARE_MIN, WEAPON_RARE_MAX)
      : randInt(WEAPON_COMMON_MIN, WEAPON_COMMON_MAX);

    const prefix = isRare
      ? PREFIX_RARE[randInt(0, PREFIX_RARE.length - 1)]
      : PREFIX_COMMON[randInt(0, PREFIX_COMMON.length - 1)];

    const type = TYPES[randInt(0, TYPES.length - 1)];

    const suffix = isRare
      ? SUFFIX_RARE[randInt(0, SUFFIX_RARE.length - 1)]
      : SUFFIX_COMMON[randInt(0, SUFFIX_COMMON.length - 1)];

    const name = `${prefix} ${type} ${suffix}`;

    return {
      id: makeId('weapon'),
      name,
      rarity: isRare ? 'rare' : 'common',
      dps,
    };
  }

  /*********************
   * Save / Load
   *********************/
  function save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    try {
      const parsed = JSON.parse(ra
