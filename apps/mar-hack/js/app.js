(() => {
  "use strict";

  /********************
   * 設定
   ********************/
  const GAME_MAX_DRAWS = 30;
  const AUTO_DRAW_DELAY_MS = 200;

  /********************
   * DOM
   ********************/
  const $ = (id) => document.getElementById(id);

  const elHand = $("hand");
  const elDrawn = $("drawn");
  const elDiscards = $("discards");
  const elLog = $("log");
  const elDrawCount = $("drawCount");
  const elWallCount = $("wallCount");

  // Dora
  const elDora = $("doraTile");
  const elUraDora = $("uraDoraTile");

  // Buttons
  const btnNew = $("btnNew");
  const btnWin = $("btnWin");
  const btnRiichi = $("btnRiichi");
  const btnAnkan = $("btnAnkan");
  const optMangan30fu4han = $("optMangan30fu4han");

  // Enemy UI (index.html に存在する前提)
  const elEnemyInfo = $("enemyInfo");
  const elEnemyImg = $("enemyImg");
  const elEnemyHpText = $("enemyHpText");
  const elEnemyHpBar = $("enemyHpBar");

  // Player HUD
  const elStage = $("stage");
  const elPlayerHp = $("playerHp");

  // Result Dialog（共通）
  const dlg = $("resultDialog");
  const elResultTitle = $("resultTitle");
  const elResultSub = $("resultSub");
  const elResultHand = $("resultHand");
  const elResultDora = $("resultDora");
  const elResultUraDora = $("resultUraDora");
  const elResultYaku = $("resultYaku");
  const elResultScore = $("resultScore");
  const elResultBattle = $("resultBattle");
  const btnNextHand = $("btnNextHand");

  /********************
   * State
   ********************/
  let state = null;
  let locked = false; // ダイアログ表示中など、操作を止める

  /********************
   * Utils
   ********************/
  function log(s) {
    elLog.textContent = (elLog.textContent ? elLog.textContent + "\n" : "") + s;
    elLog.scrollTop = elLog.scrollHeight;
  }

  // 牌画像の命名ルール：
  // 1m.png, 3p.png, 6s.png, 東.png, 白.png, 發.png, 中.png
  function tileToImgSrc(t) {
    if (typeof t === "string" && t.length === 2 && ["m", "p", "s"].includes(t[1])) {
      return `./tiles/${t[0]}${t[1]}.png`;
    }
    return `./tiles/${t}.png`;
  }

  function renderTiles(container, tiles, { clickable, onClick } = {}) {
    container.innerHTML = "";
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const img = document.createElement("img");
      img.alt = t;
      img.src = tileToImgSrc(t);
      if (clickable) {
        img.addEventListener("click", () => onClick(i, t));
        img.title = `捨てる: ${t}`;
      }
      container.appendChild(img);
    }
  }

  function renderSingleTile(container, t, { clickable, onClick } = {}) {
    container.innerHTML = "";
    if (!t) return;
    const img = document.createElement("img");
    img.alt = t;
    img.src = tileToImgSrc(t);
    if (clickable) {
      img.addEventListener("click", () => onClick(t));
      img.title = `捨てる: ${t}（ツモ切り）`;
    }
    container.appendChild(img);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildWall() {
    const tiles = [];
    for (const s of ["m", "p", "s"]) {
      for (let n = 1; n <= 9; n++) for (let k = 0; k < 4; k++) tiles.push(`${n}${s}`);
    }
    for (const h of ["東", "南", "西", "北", "白", "發", "中"]) {
      for (let k = 0; k < 4; k++) tiles.push(h);
    }
    return shuffle(tiles);
  }

  // 王牌内のカンドラ位置（1カン目: 8/9, 2カン目: 10/11, ... を想定）
  // ※あなたの mahjong.js と噛み合う形の「表示用」として扱う
  function deadWallIndicesForKandora(n) {
    const base = 6 + (n - 1) * 2;
    return { ind: base, ura: base + 1 };
  }

  /********************
   * Battle UI
   ********************/
  function renderBattle() {
    const b = (window.Battle && typeof Battle.snapshot === "function") ? Battle.snapshot() : null;
    if (!b) return;

    if (elStage) elStage.textContent = String(b.stage ?? "-");
    if (elPlayerHp) elPlayerHp.textContent = String(b.playerHp ?? "-");

    // Enemy UI
    if (elEnemyImg && b.enemyImg) elEnemyImg.src = b.enemyImg;

    if (elEnemyInfo && (b.nextAttackIn != null) && (b.atkMin != null) && (b.atkMax != null)) {
      elEnemyInfo.textContent = `攻撃まであと${b.nextAttackIn}ターン（${b.atkMin}～${b.atkMax}）`;
    }

    if (elEnemyHpText && (b.enemyHp != null) && (b.enemyMaxHp != null)) {
      elEnemyHpText.textContent = `${Math.max(0, b.enemyHp)} / ${b.enemyMaxHp}`;
    }

    if (elEnemyHpBar && (b.enemyHp != null) && (b.enemyMaxHp != null) && b.enemyMaxHp > 0) {
      const pct = Math.max(0, Math.min(100, (b.enemyHp / b.enemyMaxHp) * 100));
      elEnemyHpBar.style.width = `${pct}%`;
    }
  }

  /********************
   * Mahjong: render
   ********************/
  function setControlsEnabled() {
    if (!state) return;

    // 和了ボタン
    const canWin = !!state.drawn && MahHack.isAgari([...state.hand, state.drawn]);
    btnWin.disabled = locked || !canWin;

    // リーチ：未実装の「詳細テンパイ判定」までは簡易条件で有効化（※現行仕様のまま）
    btnRiichi.disabled = locked || state.riichiLocked || !state.drawn;

    // 暗槓：リーチ後不可
    btnAnkan.disabled = locked || state.riichiLocked || !state.drawn;
  }

  function render() {
    if (!state) return;

    renderBattle();

    // ドラ
    renderTiles(elDora, state.doraTiles);
    renderTiles(elUraDora, state.showUraDora ? state.uraDoraTiles : []);

    // 手牌（リーチ後は手出し不可）
    renderTiles(elHand, state.hand, {
      clickable: !!state.drawn && !locked && !state.riichiLocked,
      onClick: (idx, t) => discardFromHand(idx, t),
    });

    // ツモ（常にツモ切りは可能）
    renderSingleTile(elDrawn, state.drawn, {
      clickable: !!state.drawn && !locked,
      onClick: (t) => discardDrawn(t),
    });

    // 捨て牌
    renderTiles(elDiscards, state.discards);

    const remaining = Math.max(0, GAME_MAX_DRAWS - state.draws);
    elDrawCount.textContent = `ツモ ${state.draws} / ${GAME_MAX_DRAWS}（残り ${remaining}）`;
    elWallCount.textContent = `山 ${state.wall.length}`;

    setControlsEnabled();
  }

  /********************
   * Flow: draw / discard
   ********************/
  function scheduleAutoDraw() {
    if (!state) return;
    if (locked) return;
    if (state.drawn) return;
    if (state.draws >= GAME_MAX_DRAWS) return;

    clearTimeout(state.autoTimer);
    state.autoTimer = setTimeout(() => autoDraw(), AUTO_DRAW_DELAY_MS);
  }

  function autoDraw() {
    if (!state || locked) return;
    if (state.drawn) return;
    if (state.draws >= GAME_MAX_DRAWS) return;

    if (state.wall.length <= 0) {
      return resolveRyukyoku(); // 山切れ扱い
    }

    const t = state.wall.shift();
    state.drawn = t;
    state.draws += 1;

    log(`ツモ(${state.draws}): ${t}`);
    render();
  }

  function afterDiscard(discardedTile) {
    state.discards.push(discardedTile);

    // 理牌
    state.hand = MahHack.sortTiles(state.hand);
    state.drawn = null;

    log(`捨て: ${discardedTile}`);
    render();

    // ツモ回数上限で流局
    if (state.draws >= GAME_MAX_DRAWS) {
      return resolveRyukyoku();
    }
    scheduleAutoDraw();
  }

  function discardFromHand(idx, t) {
    if (!state || locked) return;
    if (!state.drawn) return;

    // リーチ後は手出し不可
    if (state.riichiLocked) {
      log("リーチ後は手牌を変更できません（ツモ切りのみ）");
      return;
    }

    // 手牌の1枚を捨て、ツモ牌を手牌へ
    state.hand.splice(idx, 1);
    state.hand.push(state.drawn);

    afterDiscard(t);
  }

  function discardDrawn(t) {
    if (!state || locked) return;
    if (!state.drawn) return;
    if (t !== state.drawn) return;

    // ツモ切り
    afterDiscard(t);
  }

  /********************
   * Ankan
   ********************/
  function ankan() {
    if (!state || locked) return;
    if (!state.drawn) return;

    // リーチ後は暗槓不可（MVP仕様）
    if (state.riichiLocked) {
      log("リーチ後は暗槓できません（MVP仕様）");
      return;
    }

    const tiles14 = [...state.hand, state.drawn];
    const counts = MahHack.countTiles(tiles14);

    // 4枚ある牌を探す（最初の1種のみ実行）
    let target = null;
    for (const [k, v] of counts.entries()) {
      if (v >= 4) { target = k; break; }
    }
    if (!target) return;

    // 4枚抜く
    let removed = 0;
    const remain = [];
    for (const tt of tiles14) {
      if (tt === target && removed < 4) { removed++; continue; }
      remain.push(tt);
    }

    state.kanCount += 1;

    // カンドラ公開（表示用）
    const idx = deadWallIndicesForKandora(state.kanCount);
    const ind = state.deadWall[idx.ind];
    const uraInd = state.deadWall[idx.ura];
    if (!ind || !uraInd) {
      log("エラー：王牌不足（カン上限）");
      return;
    }

    state.doraIndicators.push(ind);
    state.uraIndicators.push(uraInd);
    const newDora = MahHack.nextDoraFromIndicator(ind);
    state.doraTiles.push(newDora);

    log(`暗槓: ${target}（ドラ追加: ${newDora}）`);

    // 嶺上牌（簡易：deadWall末尾から引く）
    const rinshan = state.deadWall.pop();
    if (!rinshan) {
      log("流局：王牌不足");
      return resolveRyukyoku();
    }

    state.hand = MahHack.sortTiles(remain);
    state.drawn = rinshan;
    state.lastWinFrom = "rinshan";

    log(`嶺上ツモ: ${rinshan}`);
    render();
  }

  /********************
   * Win / Ryukyoku
   ********************/
  function winTsumo() {
    if (!state || locked) return;
    if (!state.drawn) return;

    const tiles = [...state.hand, state.drawn];
    if (!MahHack.isAgari(tiles)) {
      log("和了不可：和了形ではありません");
      return;
    }

    // 裏ドラ公開：リーチ/ダブリー時のみ（現状のMVPではリーチ自体の厳密判定は簡易）
    const uraDoraTiles = (state.riichi || state.doubleRiichi)
      ? state.uraIndicators.map(MahHack.nextDoraFromIndicator)
      : [];

    state.uraDoraTiles = uraDoraTiles;
    state.showUraDora = uraDoraTiles.length > 0;

    const ctx = {
      winType: "tsumo",
      winTile: state.drawn,
      isMenzen: true,

      riichi: state.riichi,
      doubleRiichi: state.doubleRiichi,
      // 一発・海底などの厳密条件は、あなた側で検証中のためここでは固定しない
      ippatsu: false,

      haitei: false,
      houtei: false,
      rinshan: state.lastWinFrom === "rinshan",
      chankan: false,
      tenhou: false,
      chiihou: false,

      seatWind: "東",
      roundWind: "東",
      kanCount: state.kanCount,

      doraTiles: state.doraTiles,
      uraDoraTiles,
      optMangan30fu4han: !!optMangan30fu4han.checked,
    };

    const y = MahHack.detectYaku(tiles, ctx);
    const fu = MahHack.calcFu(tiles, y, ctx);
    const pts = MahHack.calcPoints(y.han, fu, ctx.optMangan30fu4han);

    // バトル反映
    const before = Battle.snapshot();
    const res = Battle.applyWin(pts.total);
    const after = res.snap;

    // ロックして結果表示
    locked = true;
    clearTimeout(state.autoTimer);

    // ダイアログ
    openResultDialog({
      title: "和了（ツモ）",
      sub: `STAGE ${before.stage} → ${after.stage}`,
      handTiles: MahHack.sortTiles(tiles),
      doraTiles: state.doraTiles,
      uraDoraTiles: state.uraDoraTiles,
      yakuList: y.yaku,
      scoreText:
        `役：${y.han}翻 ${fu}符\n` +
        (pts.limitName ? `区分：${pts.limitName}\n` : "") +
        `合計点：${pts.total}`,
      battleText:
        `与ダメージ：${pts.total}\n` +
        `敵HP：${before.enemyHp} → ${after.enemyHp}\n` +
        `自分HP：${before.playerHp} → ${after.playerHp}` +
        (res.attack ? `\n敵の攻撃：-${res.attack.damage}` : "") +
        (res.killed && res.healed ? `\nSTAGE CLEAR 回復：+${res.healed}` : ""),
      isGameOver: !!after.isEnded,
      gameOverStage: after.stage,
    });

    render();
  }

  function resolveRyukyoku() {
    if (!state || locked) return;

    // テンパイ判定（13枚）
    const waits = MahHack.winningTilesFor13(state.hand);
    const isTenpai = waits.length > 0;

    const before = Battle.snapshot();
    const res = Battle.applyRyukyoku(isTenpai);
    const after = res.snap;

    locked = true;
    clearTimeout(state.autoTimer);

    openResultDialog({
      title: "流局",
      sub: isTenpai ? `テンパイ（待ち：${waits.join(" ")}）` : "ノーテン",
      handTiles: MahHack.sortTiles(state.hand),
      doraTiles: state.doraTiles,
      uraDoraTiles: [],
      yakuList: [],
      scoreText: `ペナルティ：-${res.penalty}`,
      battleText:
        `自分HP：${before.playerHp} → ${after.playerHp}` +
        (res.attack ? `\n敵の攻撃：-${res.attack.damage}` : "") +
        `\n敵HP：${before.enemyHp}（変化なし）`,
      isGameOver: !!after.isEnded,
      gameOverStage: after.stage,
    });

    render();
  }

  /********************
   * Dialog
   ********************/
  function openResultDialog(payload) {
    // タイトル/サブ
    elResultTitle.textContent = payload.isGameOver ? "GAME OVER" : payload.title;
    elResultSub.textContent = payload.isGameOver ? `到達STAGE：${payload.gameOverStage}` : (payload.sub || "");

    // 牌表示
    renderTiles(elResultHand, payload.handTiles || []);
    renderTiles(elResultDora, payload.doraTiles || []);
    renderTiles(elResultUraDora, payload.uraDoraTiles || []);

    // 役
    elResultYaku.innerHTML = "";
    if (payload.yakuList && payload.yakuList.length > 0) {
      for (const yy of payload.yakuList) {
        const li = document.createElement("li");
        li.textContent = `${yy.name}（${yy.han}翻）`;
        elResultYaku.appendChild(li);
      }
    } else {
      const li = document.createElement("li");
      li.textContent = "（なし）";
      elResultYaku.appendChild(li);
    }

    elResultScore.textContent = payload.scoreText || "";
    elResultBattle.textContent = payload.battleText || "";

    btnNextHand.textContent = payload.isGameOver ? "最初から" : "次の局へ";
    dlg.showModal();

    btnNextHand.onclick = () => {
      dlg.close();
      if (payload.isGameOver) {
        // 最初から
        newGame();
        return;
      }
      // 次局
      startNextHand(false);
    };
  }

  /********************
   * Game Start / Next Hand
   ********************/
  function startNextHand(isFirst) {
    locked = false;

    const wallAll = buildWall();
    const deadWall = wallAll.splice(-14);

    const doraIndicators = [deadWall[4]];
    const uraIndicators = [deadWall[5]];
    const doraTiles = [MahHack.nextDoraFromIndicator(deadWall[4])];

    const hand = [];
    for (let i = 0; i < 13; i++) hand.push(wallAll.shift());

    state = {
      wall: wallAll,
      deadWall,
      doraIndicators,
      uraIndicators,
      doraTiles,
      uraDoraTiles: [],
      showUraDora: false,

      hand: MahHack.sortTiles(hand),
      drawn: null,
      discards: [],

      draws: 0,
      kanCount: 0,
      lastWinFrom: "live",

      riichi: false,
      doubleRiichi: false,
      riichiLocked: false,

      autoTimer: null,
    };

    if (isFirst) elLog.textContent = "";
    log("配牌13枚（親/場風=東 固定）");
    log(`ドラ: ${state.doraTiles[0]}`);

    render();
    scheduleAutoDraw();
  }

  function newGame() {
    if (!window.Battle || typeof Battle.initBattle !== "function") {
      // Battle が未ロードの場合、ここで止める（エラーを握りつぶさない）
      throw new Error("Battle.initBattle が見つかりません（battle.js の読み込みを確認してください）");
    }
    Battle.initBattle();
    startNextHand(true);
  }

  /********************
   * Events
   ********************/
  btnNew.addEventListener("click", () => newGame());
  btnWin.addEventListener("click", () => winTsumo());
  btnAnkan.addEventListener("click", () => ankan());

  // MVP：リーチは「ロック」だけ行う簡易版（厳密な成立判定は今後あなたの検証後に反映）
  btnRiichi.addEventListener("click", () => {
    if (!state || locked) return;
    if (!state.drawn) return;
    if (state.riichiLocked) return;
    state.riichi = true;
    state.riichiLocked = true; // リーチ後は手出し不可（ツモ切りのみ）
    log("リーチ（MVP：成立判定簡略 / 手牌ロック）");
    render();
  });

  // 初期表示
  log("「新規開始」を押してください。");
  renderBattle();
})();
