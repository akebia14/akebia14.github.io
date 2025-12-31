<script>
(() => {
  'use strict';

  /******************************************************************
   * Phase 3.1〜4 Integrated Game Logic (JS Only)
   * - Inventory (5 slots)
   * - Weapon random name generation
   * - Critical hit (click only) with "CRIT!" float
   * - Boss every 10 enemies: HPx5, Goldx5, Rare rate up
   * - Keeps: auto DPS tick, click dmg, upgrades, enemy image random,
   *         float dmg, kill shake + flash, save/load
   *
   * NOTE:
   * - Critical is applied to CLICK attack only (to avoid tick spam).
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

  // Kill FX
  const KILL_SHAKE_CLASS = 'killShake';
  const FLASH_CLASS = 'on';

  // Inventory / weapons
  const INVENTORY_SIZE = 5;

  const WEAPON_DROP_RATE_RARE = 0.20; // normal
  const WEAPON_DROP_RATE_RARE_BOSS = 0.50; // boss
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
    kills: 0,           // total enemies defeated (used for scaling & boss cadence)
    dpsLevel: 0,
    clickLevel: 0,

    enemyHpMax: BASE_ENEMY_HP,
    enemyHp: BASE_ENEMY_HP,
    enemyImageNo: 1,
    isBoss: false,      // current enemy is boss?

    // equipment + inventory
    equippedWeapon: { id: 'weapon_fist', name: '素手', rarity: 'common', dps: 0 },
    inventory: [],      // up to INVENTORY_SIZE
    droppedWeapon: null, // last drop (not yet decided if inventory full)

    inRun: false,
  };

  let timerId = null;

  /*********************
   * DOM (required IDs)
   *********************/
  const $ = (id) => document.getElementById(id);

  // Status box
  const elStatus = $('status');
  const elEnemyHp = $('enemyHp');
  const elEnemyHpMax = $('enemyHpMax');
  const elGold = $('gold');
  const elKills = $('runs'); // keep existing label "runs" but means kills

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
  const elDropActions = $('dropActions');         // container for drop action buttons
  const elReplaceActions = $('replaceActions');   // container for replace buttons when full
  const elInventoryList = $('inventoryList');     // container for inventory list UI

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
    // simple unique enough for this local game
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
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
    // 1-indexed enemy in the sequence
    return state.kills + 1;
  }

  function isBossForEnemyNumber(n) {
    return (n % BOSS_EVERY) === 0;
  }

  /*********************
   * Weapon generation (Phase 3.2)
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
      const parsed = JSON.parse(raw);

      state.gold = Number(parsed.gold) || 0;
      state.kills = Number(parsed.kills ?? parsed.runs) || 0; // backward-ish
      state.dpsLevel = Number(parsed.dpsLevel) || 0;
      state.clickLevel = Number(parsed.clickLevel) || 0;

      state.enemyHpMax = Number(parsed.enemyHpMax) || BASE_ENEMY_HP;
      state.enemyHp = Number(parsed.enemyHp) || state.enemyHpMax;

      const no = Number(parsed.enemyImageNo);
      state.enemyImageNo = (no >= 1 && no <= ENEMY_IMAGE_COUNT) ? no : 1;

      state.isBoss = Boolean(parsed.isBoss);

      // equipped weapon
      if (parsed.equippedWeapon && typeof parsed.equippedWeapon === 'object') {
        const w = parsed.equippedWeapon;
        state.equippedWeapon = {
          id: String(w.id || 'weapon_fist'),
          name: String(w.name || '素手'),
          rarity: (w.rarity === 'rare') ? 'rare' : 'common',
          dps: Number(w.dps) || 0
        };
      }

      // inventory
      state.inventory = Array.isArray(parsed.inventory)
        ? parsed.inventory.slice(0, INVENTORY_SIZE).map((w) => ({
            id: String(w?.id || makeId('weapon')),
            name: String(w?.name || 'Unknown Weapon'),
            rarity: (w?.rarity === 'rare') ? 'rare' : 'common',
            dps: Number(w?.dps) || 0
          }))
        : [];

      // drop
      if (parsed.droppedWeapon && typeof parsed.droppedWeapon === 'object') {
        const w = parsed.droppedWeapon;
        state.droppedWeapon = {
          id: String(w.id || makeId('weapon')),
          name: String(w.name || 'Unknown Weapon'),
          rarity: (w.rarity === 'rare') ? 'rare' : 'common',
          dps: Number(w.dps) || 0
        };
      } else {
        state.droppedWeapon = null;
      }

      state.inRun = Boolean(parsed.inRun);

      return true;
    } catch {
      return false;
    }
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

    elEnemyImg.src = enemyImagePath(state.enemyImageNo);
    render();
    log('リセットしました。');
  }

  /*********************
   * FX
   *********************/
  function playKillFx() {
    // shake
    elEnemyImg.classList.remove(KILL_SHAKE_CLASS);
    void elEnemyImg.offsetWidth;
    elEnemyImg.classList.add(KILL_SHAKE_CLASS);

    // flash
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

    const base = BASE_ENEMY_HP + state.kills * ENEMY_HP_GROWTH_PER_KILL;
    state.enemyHpMax = boss ? base * BOSS_HP_MULT : base;
    state.enemyHp = state.enemyHpMax;

    state.enemyImageNo = rollEnemyImageNo();
    elEnemyImg.src = enemyImagePath(state.enemyImageNo);
  }

  function rewardGold() {
    const gold = state.isBoss ? (BASE_GOLD_REWARD * BOSS_GOLD_MULT) : BASE_GOLD_REWARD;
    state.gold += gold;
    return gold;
  }

  /*********************
   * Inventory actions (Phase 3.1)
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
    log(`装備変更：${w.name}（+${w.dps} DPS）/ 総DPS=${calcTotalDps()}`);
  }

  function equipDropWeapon() {
    if (!state.droppedWeapon) return;
    state.equippedWeapon = state.droppedWeapon;
    log(`装備変更：${state.equippedWeapon.name}（+${state.equippedWeapon.dps} DPS）/ 総DPS=${calcTotalDps()}`);
    state.droppedWeapon = null;
  }

  function discardDropWeapon() {
    if (!state.droppedWeapon) return;
    log(`武器破棄：${state.droppedWeapon.name}（+${state.droppedWeapon.dps} DPS）`);
    state.droppedWeapon = null;
  }

  function addDropToInventory() {
    if (!state.droppedWeapon) return;
    if (addToInventory(state.droppedWeapon)) {
      log(`インベントリに追加：${state.droppedWeapon.name}（+${state.droppedWeapon.dps} DPS）`);
      state.droppedWeapon = null;
    } else {
      // full: UI will show replace buttons
      log('インベントリが満杯です。置換ボタンで入れ替えてください。');
    }
  }

  function replaceInventoryIndexWithDrop(idx) {
    if (!state.droppedWeapon) return;
    if (idx < 0 || idx >= INVENTORY_SIZE) return;

    // if idx exists -> replace; if idx doesn't exist but inventory not full -> treat as add
    if (idx < state.inventory.length) {
      const removed = state.inventory[idx];
      state.inventory[idx] = state.droppedWeapon;
      log(`置換：${removed.name} → ${state.droppedWeapon.name}`);
      state.droppedWeapon = null;
      return;
    }

    // idx points to empty slot
    if (addToInventory(state.droppedWeapon)) {
      log(`インベントリに追加：${state.droppedWeapon.name}`);
      state.droppedWeapon = null;
    } else {
      log('置換に失敗しました（満杯）。');
    }
  }

  /*********************
   * Kill flow
   *********************/
  function onEnemyKilled() {
    playKillFx();

    state.kills += 1;
    const gold = rewardGold();

    // drop weapon every kill (100%)
    const drop = rollWeapon(state.isBoss);
    state.droppedWeapon = drop;

    // auto-add if inventory has space; otherwise require decision
    if (!isInventoryFull()) {
      addToInventory(drop);
      state.droppedWeapon = null;
      log(`撃破！ +${gold}G / 武器取得：${drop.name}（+${drop.dps} DPS）`);
    } else {
      log(`撃破！ +${gold}G / 武器ドロップ：${drop.name}（+${drop.dps} DPS）→ 置換 or 破棄`);
    }

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
    render();
  }

  function stopRun() {
    state.inRun = false;
    timerId && clearInterval(timerId);
    timerId = null;
    render();
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
    render();
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
    render();
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
    render();
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
    render();
  }

  /*********************
   * Rendering
   *********************/
  function weaponLabel(w) {
    if (!w) return '---';
    const cls = (w.rarity === 'rare') ? 'rare-rare' : 'rare-common';
    const rareName = (w.rarity === 'rare') ? 'Rare' : 'Common';
    return `<span class="${cls}">${rareName}：${escapeHtml(w.name)}（+${w.dps} DPS）</span>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderInventory() {
    // Inventory list with equip/discard
    // Uses event delegation on container.
    let html = '';
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const w = state.inventory[i];
      if (!w) {
        html += `
          <div class="invRow">
            <span class="tag">#${i+1}</span>
            <span class="mono">（空）</span>
          </div>`;
        continue;
      }
      html += `
        <div class="invRow">
          <span class="tag">#${i+1}</span>
          <span>${weaponLabel(w)}</span>
          <button data-act="equipInv" data-idx="${i}">装備</button>
          <button data-act="discardInv" data-idx="${i}">破棄</button>
        </div>`;
    }
    elInventoryList.innerHTML = html;
  }

  function renderDropControls() {
    const hasDrop = !!state.droppedWeapon;

    // show/hide action area
    elDropActions.style.display = hasDrop ? 'block' : 'none';

    // add button enabled only if not full
    btnAddDrop.disabled = !hasDrop || isInventoryFull();
    btnEquipDrop.disabled = !hasDrop;
    btnDiscardDrop.disabled = !hasDrop;

    // replace controls shown when drop exists and inventory full
    if (hasDrop && isInventoryFull()) {
      let html = '<div class="hint">インベントリ満杯：置換先を選択</div>';
      for (let i = 0; i < INVENTORY_SIZE; i++) {
        html += `<button data-act="replace" data-idx="${i}">#${i+1} と置換</button>`;
      }
      elReplaceActions.innerHTML = html;
      elReplaceActions.style.display = 'block';
    } else {
      elReplaceActions.innerHTML = '';
      elReplaceActions.style.display = 'none';
    }
  }

  function render() {
    elStatus.textContent = state.inRun ? 'RUNNING' : 'IDLE';

    // Enemy HP
    elEnemyHp.textContent = Math.ceil(state.enemyHp);
    elEnemyHpMax.textContent = state.enemyHpMax;

    // Gold / kills
    elGold.textContent = state.gold;
    elKills.textContent = state.kills;

    // DPS breakdown
    const total = calcTotalDps();
    elTotalDps.textContent = total;
    elBaseDps.textContent = BASE_DPS;
    elLvDps.textContent = calcDpsFromLevel();
    elWeaponDps.textContent = state.equippedWeapon?.dps || 0;

    // Click
    elClickDmg.textContent = calcClickDmgBase();

    // Upgrades
    elDpsLevel.textContent = state.dpsLevel;
    elDpsCost.textContent = calcDpsUpgradeCost();

    elClickLevel.textContent = state.clickLevel;
    elClickCost.textContent = calcClickUpgradeCost();

    // Equipment / drop
    elEquippedWeapon.innerHTML = weaponLabel(state.equippedWeapon);
    elDroppedWeapon.innerHTML = weaponLabel(state.droppedWeapon);

    // Boss indicator (uses status suffix)
    const n = currentEnemyNumber();
    if (state.inRun) {
      elStatus.textContent = `RUNNING (#${n}${state.isBoss ? ' BOSS' : ''})`;
    }

    renderInventory();
    renderDropControls();
  }

  /*********************
   * Events
   *********************/
  function bindEvents() {
    btnStart.onclick = startRun;
    btnStop.onclick = () => { log('停止しました。'); stopRun(); save(); };
    btnReset.onclick = resetAll;

    btnUpgradeDps.onclick = upgradeDps;
    btnUpgradeClick.onclick = upgradeClick;

    // Enemy click
    elEnemyImg.addEventListener('click', clickAttack);

    elEnemyImg.addEventListener('error', () => {
      log(`画像が読み込めません：${elEnemyImg.src}`);
    });

    // Drop actions
    btnEquipDrop.onclick = () => { equipDropWeapon(); save(); render(); };
    btnAddDrop.onclick = () => { addDropToInventory(); save(); render(); };
    btnDiscardDrop.onclick = () => { discardDropWeapon(); save(); render(); };

    // Replace actions (delegation)
    elReplaceActions.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const act = t.getAttribute('data-act');
      if (act !== 'replace') return;
      const idx = Number(t.getAttribute('data-idx'));
      if (!Number.isFinite(idx)) return;

      replaceInventoryIndexWithDrop(idx);
      save();
      render();
    });

    // Inventory list actions (delegation)
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
        render();
        return;
      }
      if (act === 'discardInv') {
        const removed = removeFromInventoryByIndex(idx);
        if (removed) log(`武器破棄：${removed.name}（+${removed.dps} DPS）`);
        save();
        render();
        return;
      }
    });
  }

  /*********************
   * Init
   *********************/
  function init() {
    const loaded = load();

    // set initial image
    elEnemyImg.src = enemyImagePath(state.enemyImageNo);

    render();
    log(loaded ? 'セーブデータをロードしました。' : '新規開始です。');

    // do not auto-resume
    state.inRun = false;
    save();
    render();

    bindEvents();
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
</script>
