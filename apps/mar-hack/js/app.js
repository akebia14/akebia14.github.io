(() => {
  "use strict";

  /********************
   * 設定
   ********************/
  const GAME_MAX_DRAWS = 30;
  const AUTO_DRAW_DELAY_MS = 200;

  // 流局ペナルティ（ユーザー指定）
  const PENALTY_TENPAI = 3000;
  const PENALTY_NOTEN = 10000;

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

  const elDora = $("doraTile");
  const elUraDora = $("uraDoraTile");

  const btnNew = $("btnNew");
  const btnWin = $("btnWin");
  const btnRiichi = $("btnRiichi");
  const btnAnkan = $("btnAnkan");
  const optMangan30fu4han = $("optMangan30fu4han");

  // Enemy UI
  const elEnemyInfo = $("enemyInfo");
  const elEnemyImg = $("enemyImg");
  const elEnemyHpText = $("enemyHpText");
  const elEnemyHpBar = $("enemyHpBar");

  // HUD
  const elStage = $("stage");
  const elPlayerHp = $("playerHp");

  // Result Dialog（index.html完全版前提）
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
   * 必須DOM検証（ID不整合ならここで確実に止める）
   ********************/
  const REQUIRED = [
    ["hand", elHand], ["drawn", elDrawn], ["discards", elDiscards],
    ["log", elLog], ["drawCount", elDrawCount], ["wallCount", elWallCount],
    ["doraTile", elDora], ["uraDoraTile", elUraDora],
    ["btnNew", btnNew], ["btnWin", btnWin], ["btnRiichi", btnRiichi], ["btnAnkan", btnAnkan],
    ["enemyInfo", elEnemyInfo], ["enemyImg", elEnemyImg], ["enemyHpText", elEnemyHpText], ["enemyHpBar", elEnemyHpBar],
    ["stage", elStage], ["playerHp", elPlayerHp],
    ["resultDialog", dlg], ["resultTitle", elResultTitle], ["resultSub", elResultSub],
    ["resultHand", elResultHand], ["resultDora", elResultDora], ["resultUraDora", elResultUraDora],
    ["resultYaku", elResultYaku], ["resultScore", elResultScore], ["resultBattle", elResultBattle],
    ["btnNextHand", btnNextHand],
  ];
  for (const [id, node] of REQUIRED) {
    if (!node) throw new Error(`DOM要素が見つかりません: #${id}（index.html のIDを確認）`);
  }

  /********************
   * State
   ********************/
  let state = null;
  let locked = false;        // ダイアログ中・局切替中など
  let riichiReady = false;   // 「リーチ宣言済み。次の捨て牌を宣言牌にする」
  let autoTimer = null;

  /********************
   * Utils
   ********************/
  function log(s) {
    elLog.textContent = (elLog.textContent ? elLog.textContent + "\n" : "") + s;
    elLog.scrollTop = elLog.scrollHeight;
  }

  // 牌画像の命名ルール：
  // 数牌: 1m.png, 3p.png, 6s.png
  // 字牌: 東.png, 白.png, 發.png, 中.png, ...
  function tileToImgSrc(t) {
    if (typeof t === "string" && t.length === 2 && ["m", "p", "s"].includes(t[1])) {
      return `./tiles/${t[0]}${t[1]}.png`;
    }
    return `./tiles/${t}.png`;
  }

  function renderTiles(container, tiles, { clickable = false, onClick } = {}) {
    container.innerHTML = "";
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const img = document.createElement("img");
      img.alt = t;
      img.src = tileToImgSrc(t);
      if (clickable) {
        img.style.cursor = "pointer";
        img.addEventListener("click", () => onClick(i, t));
      }
      container.appendChild(img);
    }
  }

  function renderSingleTile(container, t, { clickable = false, onClick } = {}) {
    container.innerHTML = "";
    if (!t) return;
    const img = document.createElement("img");
    img.alt = t;
    img.src = tileToImgSrc(t);
    if (clickable) {
      img.style.cursor = "pointer";
      img.addEventListener("click", () => onClick(t));
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

  // 王牌内の「表示牌」位置（表示用）
  // deadWall[4]をドラ表示牌、deadWall[5]を裏ドラ表示牌にする運用に合わせる
  function deadWallIndicesForKandora(n) {
    const base = 6 + (n - 1) * 2;
    return { ind: base, ura: base + 1 };
  }

  function clearAutoTimer() {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = null;
  }

  /********************
   * Battle UI
   ********************/
  function renderBattle() {
    if (!window.Battle || typeof Battle.snapshot !== "function") return;
    const b = Battle.snapshot();
    if (!b) return;

    elStage.textContent = String(b.stage ?? "-");
    elPlayerHp.textContent = String(b.playerHp ?? "-");

    if (b.enemyImg) elEnemyImg.src = b.enemyImg;

    // ★ battle.js は nextAtkIn を返す
    if (b.nextAtkIn != null && b.atkMin != null && b.atkMax != null) {
      elEnemyInfo.textContent = `攻撃まであと${b.nextAtkIn}ターン（${b.atkMin}～${b.atkMax}）`;
    }

    if (b.enemyHp != null && b.enemyMaxHp != null) {
      elEnemyHpText.textContent = `${Math.max(0, b.enemyHp)} / ${b.enemyMaxHp}`;
      const pct = b.enemyMaxHp > 0 ? Math.max(0, Math.min(100, (b.enemyHp / b.enemyMaxHp) * 100)) : 0;
      elEnemyHpBar.style.width = `${pct}%`;
    }
  }

  /********************
   * リーチ可否判定（14枚→どれか捨ててテンパイになるか）
   ********************/
  function canRiichiNow() {
    if (!state) return false;
    if (locked) return false;
    if (state.riichiLocked || state.riichi) return false;
    if (!state.drawn) return false; // ツモ直後のみ
    if (!state.isMenzen) return false;

    const tiles14 = [...state.hand, state.drawn];

    for (let i = 0; i < tiles14.length; i++) {
      const t13 = tiles14.slice(0, i).concat(tiles14.slice(i + 1));
      const waits = MahHack.winningTilesFor13(t13);
      if (waits.length > 0) return true;
    }
    return false;
  }

  /********************
   * Controls
   ********************/
  function setControlsEnabled() {
    if (!state) return;

    const canWin = !!state.drawn && MahHack.isAgari([...state.hand, state.drawn]);
    btnWin.disabled = locked || !canWin;

    // リーチ：可否判定に基づく
    btnRiichi.disabled = !canRiichiNow();

    // 暗槓：リーチ確定後は不可（MVP）
    btnAnkan.disabled = locked || state.riichiLocked || !state.drawn;
  }

  /********************
   * Render
   ********************/
  function render() {
    if (!state) return;

    renderBattle();

    renderTiles(elDora, state.doraTiles);
    renderTiles(elUraDora, state.showUraDora ? state.uraDoraTiles : []);

    // 手牌：リーチ確定後は手出し不可（ツモ切りのみ）
    renderTiles(elHand, state.hand, {
      clickable: !!state.drawn && !locked && !state.riichiLocked,
      onClick: (idx, t) => discardFromHand(idx, t),
    });

    // ツモ牌：常にツモ切りは可能
    renderSingleTile(elDrawn, state.drawn, {
      clickable: !!state.drawn && !locked,
      onClick: (t) => discardDrawn(t),
    });

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
    if (!state || locked) return;
    if (state.drawn) return;
    if (state.draws >= GAME_MAX_DRAWS) return;

    clearAutoTimer();
    autoTimer = setTimeout(autoDraw, AUTO_DRAW_DELAY_MS);
  }

  function autoDraw() {
    if (!state || locked) return;
    if (state.drawn) return;

    if (state.draws >= GAME_MAX_DRAWS) return resolveRyukyoku();
    if (state.wall.length <= 0) return resolveRyukyoku();

    const t = state.wall.shift();
    state.drawn = t;
    state.draws += 1;

    log(`ツモ(${state.draws}): ${t}`);
    render();
  }

  function finalizeRiichiIfNeeded(discardedTile) {
    if (!riichiReady) return;
    riichiReady = false;
    state.riichi = true;
    state.riichiLocked = true; // 以後、手出し不可（ツモ切りのみ）
    log(`リーチ成立（宣言牌: ${discardedTile}）`);
  }

  function afterDiscard(discardedTile) {
    state.discards.push(discardedTile);

    // 理牌
    state.hand = MahHack.sortTiles(state.hand);
    state.drawn = null;

    log(`捨て: ${discardedTile}`);
    render();

    if (state.draws >= GAME_MAX_DRAWS) return resolveRyukyoku();
    scheduleAutoDraw();
  }

  function discardFromHand(idx, t) {
    if (!state || locked) return;
    if (!state.drawn) return;

    if (state.riichiLocked) {
      log("リーチ後は手牌を変更できません（ツモ切りのみ）");
      return;
    }

    // 手牌の1枚を捨て、ツモ牌を手牌へ
    state.hand.splice(idx, 1);
    state.hand.push(state.drawn);

    finalizeRiichiIfNeeded(t);
    afterDiscard(t);
  }

  function discardDrawn(t) {
    if (!state || locked) return;
    if (!state.drawn) return;
    if (t !== state.drawn) return;

    // ツモ切り
    finalizeRiichiIfNeeded(t);
    afterDiscard(t);
  }

  /********************
   * Ankan
   ********************/
  function ankan() {
    if (!state || locked) return;
    if (!state.drawn) return;

    if (state.riichiLocked) {
      log("リーチ後は暗槓できません（MVP仕様）");
      return;
    }

    const tiles14 = [...state.hand, state.drawn];
    const counts = MahHack.countTiles(tiles14);

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

    // カンドラ追加（表示用）
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

    log(`暗槓: ${target}（カンドラ追加: ${newDora}）`);

    // 嶺上牌（簡易：deadWall末尾から）
    const rinshan = state.deadWall.pop();
    if (!rinshan) return resolveRyukyoku();

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

    // 裏ドラ公開：リーチ成立時のみ
    const uraDoraTiles = (state.riichi)
      ? state.uraIndicators.map(MahHack.nextDoraFromIndicator)
      : [];

    state.uraDoraTiles = uraDoraTiles;
    state.showUraDora = uraDoraTiles.length > 0;

    // yaku/符/点
    const ctx = {
      winType: "tsumo",
      winTile: state.drawn,
      isMenzen: true,
      riichi: state.riichi,
      doubleRiichi: false,
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

    locked = true;
    clearAutoTimer();

    const isGameOver = (after.playerHp <= 0);

    openResultDialog({
      isGameOver,
      title: "和了（ツモ）",
      sub: res.cleared ? "STAGE CLEAR（HP +10000）" : "",
      handTiles: MahHack.sortTiles(tiles),
      doraTiles: state.doraTiles,
      uraDoraTiles: state.uraDoraTiles,
      yakuList: y.yaku,
      scoreText:
        `役：${y.han}翻 ${fu}符\n` +
        (pts.limitName ? `区分：${pts.limitName}\n` : "") +
        `合計点：${pts.total}`,
      battleText: buildBattleText({
        before, after,
        youDmg: pts.total,
        enemyAtk: res.atk,
        cleared: res.cleared,
      }),
    });

    render();
  }

  function resolveRyukyoku() {
    if (!state || locked) return;

    const waits = MahHack.winningTilesFor13(state.hand);
    const isTenpai = waits.length > 0;

    const penalty = isTenpai ? PENALTY_TENPAI : PENALTY_NOTEN;

    const before = Battle.snapshot();
    const res = Battle.applyLose(penalty);
    const after = res.snap;

    locked = true;
    clearAutoTimer();

    const isGameOver = (after.playerHp <= 0);

    openResultDialog({
      isGameOver,
      title: "流局",
      sub: isTenpai ? `テンパイ（待ち：${waits.join(" ")}）` : "ノーテン",
      handTiles: MahHack.sortTiles(state.hand),
      doraTiles: state.doraTiles,
      uraDoraTiles: [], // 流局では裏ドラは表示しない
      yakuList: [],
      scoreText: `ペナルティ：-${penalty}`,
      battleText: buildBattleText({
        before, after,
        youDmg: -penalty,
        enemyAtk: res.atk,
        cleared: false,
      }),
    });

    render();
  }

  function buildBattleText({ before, after, youDmg, enemyAtk, cleared }) {
    // youDmg: +なら敵へ与ダメ、-なら自分への損害（ペナルティ）
    let s = "";

    if (youDmg >= 0) {
      s += `与ダメージ：${youDmg}\n`;
      s += `敵HP：${before.enemyHp} → ${after.enemyHp}\n`;
    } else {
      s += `自分ダメージ（流局）：${-youDmg}\n`;
      s += `敵HP：${before.enemyHp}（変化なし）\n`;
    }

    if (enemyAtk != null) {
      s += `敵の攻撃：-${enemyAtk}\n`;
    }

    s += `自分HP：${before.playerHp} → ${after.playerHp}\n`;

    if (cleared) {
      s += `STAGE CLEAR：敵HPが次ステージに更新 / HP +10000\n`;
      s += `STAGE：${before.stage} → ${after.stage}\n`;
    }

    return s.trim();
  }

  /********************
   * Dialog
   ********************/
  function openResultDialog(payload) {
    const isGO = !!payload.isGameOver;

    elResultTitle.textContent = isGO ? "GAME OVER" : payload.title;
    elResultSub.textContent = isGO ? `到達STAGE：${Battle.snapshot().stage}` : (payload.sub || "");

    renderTiles(elResultHand, payload.handTiles || []);
    renderTiles(elResultDora, payload.doraTiles || []);
    renderTiles(elResultUraDora, payload.uraDoraTiles || []);

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

    btnNextHand.textContent = isGO ? "最初から" : "次の局へ";

    try {
      dlg.showModal();
    } catch (e) {
      // showModal が使えない環境のフォールバック
      alert(`${elResultTitle.textContent}\n\n${elResultScore.textContent}\n\n${elResultBattle.textContent}`);
      return;
    }

    btnNextHand.onclick = () => {
      dlg.close();
      if (isGO) {
        newGame();
        return;
      }
      startNextHand(false);
    };
  }

  /********************
   * Hand start
   ********************/
  function startNextHand(isFirst) {
    locked = false;
    riichiReady = false;
    clearAutoTimer();

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

      isMenzen: true,

      riichi: false,
      riichiLocked: false,
    };

    if (isFirst) elLog.textContent = "";
    log("配牌13枚");
    log(`ドラ: ${state.doraTiles[0]}`);

    render();
    scheduleAutoDraw();
  }

  function newGame() {
    if (!window.Battle || typeof Battle.initBattle !== "function") {
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

  btnRiichi.addEventListener("click", () => {
    if (!canRiichiNow()) return;
    // リーチは「次の捨て牌」で確定（押した瞬間にロックしない）
    riichiReady = true;
    log("リーチ宣言：次に捨てる牌が宣言牌になります");
    render();
  });

  // 初期表示
  log("「新規開始」を押してください。");
  renderBattle();
})();
