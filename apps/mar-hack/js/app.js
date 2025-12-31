(() => {
  const GAME_MAX_DRAWS = 50;
  const AUTO_DRAW_DELAY_MS = 200;

  const $ = (id) => document.getElementById(id);

  const elHand = $("hand");
  const elDrawn = $("drawn");
  const elDiscards = $("discards");
  const elLog = $("log");
  const elDrawCount = $("drawCount");
  const elWallCount = $("wallCount");

  // Battle HUD
  const elStage = $("stage");
  const elPlayerHp = $("playerHp");
  const elEnemyHp = $("enemyHp");

  // Dora (tile only)
  const elDora = $("doraTile");
  const elUraDora = $("uraDoraTile");

  const btnNew = $("btnNew");
  const btnWin = $("btnWin");
  const btnRiichi = $("btnRiichi");
  const btnAnkan = $("btnAnkan");
  const optMangan30fu4han = $("optMangan30fu4han");

  let state = null;

  function log(s) {
    elLog.textContent = (elLog.textContent ? elLog.textContent + "\n" : "") + s;
    elLog.scrollTop = elLog.scrollHeight;
  }

  function tileToImgSrc(t) {
    if (typeof t === "string" && t.length === 2 && ["m","p","s"].includes(t[1])) {
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
    for (const s of ["m","p","s"]) {
      for (let n = 1; n <= 9; n++) for (let k = 0; k < 4; k++) tiles.push(`${n}${s}`);
    }
    for (const h of ["東","南","西","北","白","發","中"]) {
      for (let k = 0; k < 4; k++) tiles.push(h);
    }
    return shuffle(tiles);
  }

  function deadWallIndicesForKandora(n) {
    const base = 6 + (n - 1) * 2;
    return { ind: base, ura: base + 1 };
  }

  function renderBattleHud() {
    const b = Battle.snapshot();
    if (!b) {
      elStage.textContent = "-";
      elPlayerHp.textContent = "-";
      elEnemyHp.textContent = "-";
      return;
    }
    elStage.textContent = String(b.stage);
    elPlayerHp.textContent = String(b.playerHp);
    elEnemyHp.textContent = String(b.enemyHp);
  }

  function scheduleAutoDraw() {
    if (!state) return;
    if (state.isEnded) return;
    if (state.drawn) return;
    clearTimeout(state.autoTimer);
    state.autoTimer = setTimeout(() => {
      autoDrawFromLive();
    }, AUTO_DRAW_DELAY_MS);
  }

  function canRiichiNow() {
    if (!state) return false;
    if (state.riichi || state.doubleRiichi) return false;
    if (!state.drawn) return false;
    if (state.riichiLocked) return false;

    const tiles14 = [...state.hand, state.drawn];
    for (let i = 0; i < tiles14.length; i++) {
      const tmp = tiles14.slice();
      tmp.splice(i, 1);
      const waits = MahHack.winningTilesFor13(tmp);
      if (waits.length > 0) return true;
    }
    return false;
  }

  function hasAnkanCandidate() {
    if (!state || !state.drawn) return false;
    const c = MahHack.countTiles([...state.hand, state.drawn]);
    for (const [, v] of c.entries()) if (v >= 4) return true;
    return false;
  }

  function render() {
    if (!state) return;

    renderBattleHud();

    // Dora
    renderTiles(elDora, state.doraTiles);
    if (state.showUraDora) renderTiles(elUraDora, state.uraDoraTiles);
    else elUraDora.innerHTML = "";

    // Riichi lock: hand unclickable
    renderTiles(elHand, state.hand, {
      clickable: !!state.drawn && !state.riichiLocked,
      onClick: (idx, t) => discardFromHand(idx, t),
    });

    // Drawn always discardable
    renderSingleTile(elDrawn, state.drawn, {
      clickable: !!state.drawn,
      onClick: (t) => discardDrawn(t),
    });

    renderTiles(elDiscards, state.discards);

    const remaining = Math.max(0, GAME_MAX_DRAWS - state.draws);
    elDrawCount.textContent = `ツモ ${state.draws} / ${GAME_MAX_DRAWS}（残り ${remaining}）`;
    elWallCount.textContent = `山 ${state.wall.length}`;

    const canWin = !!state.drawn && MahHack.isAgari([...state.hand, state.drawn]);
    btnWin.disabled = !canWin;

    btnRiichi.disabled = !canRiichiNow();

    // MVP rule: no ankan after riichi
    btnAnkan.disabled = state.riichiLocked || !hasAnkanCandidate();
  }

  function endHand(msg) {
    if (!state) return;
    state.isEnded = true;
    clearTimeout(state.autoTimer);
    if (msg) log(msg);
    btnWin.disabled = true;
    btnRiichi.disabled = true;
    btnAnkan.disabled = true;
  }

  function newGame() {
    // Battle init (only when pressing New)
    Battle.initBattle();
    renderBattleHud();

    startNextHand(true);
  }

  function startNextHand(isFirst = false) {
    elLog.textContent = isFirst ? "" : elLog.textContent;

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
      kanCount: 0,

      hand: MahHack.sortTiles(hand),
      drawn: null,
      discards: [],

      draws: 0,
      lastDraw: null,
      lastWinFrom: null,
      isEnded: false,
      autoTimer: null,

      riichi: false,
      doubleRiichi: false,
      riichiTurnLocked: false,

      riichiLocked: false,

      // Ippatsu flags (mahjong.js supports ctx.ippatsu)
      ippatsuEligible: false,
      ippatsuOnThisDraw: false,

      showUraDora: false,
      uraDoraTiles: [],

      seatWind: "東",
      roundWind: "東",
    };

    if (isFirst) {
      log("新規開始：Battle開始");
    }
    log("配牌13枚（親/場風=東 固定）");
    log(`ドラ: ${state.doraTiles[0]}`);

    render();
    scheduleAutoDraw();
  }

  function autoDrawFromLive() {
    if (!state || state.isEnded) return;
    if (state.drawn) return;
    if (state.draws >= GAME_MAX_DRAWS) return; // ここには来ないはず
    if (state.wall.length <= 0) return endHand("流局：山切れ");

    const t = state.wall.shift();
    state.drawn = t;
    state.draws += 1;
    state.lastDraw = t;
    state.lastWinFrom = "live";

    state.ippatsuOnThisDraw = !!state.ippatsuEligible;

    log(`ツモ(${state.draws}): ${t}`);
    render();
  }

  function afterDiscardCommon(discardedTile) {
    state.discards.push(discardedTile);

    if (state.ippatsuOnThisDraw) {
      state.ippatsuEligible = false;
      state.ippatsuOnThisDraw = false;
    }

    state.hand = MahHack.sortTiles(state.hand);
    state.drawn = null;

    log(`捨て: ${discardedTile}`);
    render();

    // draw limit reached AFTER discard -> ryukyoku resolution
    if (state.draws >= GAME_MAX_DRAWS) {
      return resolveRyukyoku();
    }
    scheduleAutoDraw();
  }

  function discardFromHand(idx, t) {
    if (!state || state.isEnded) return;
    if (!state.drawn) return;

    if (state.riichiLocked) {
      log("リーチ後は手牌を変更できません（ツモ切りのみ）");
      return;
    }

    state.hand.splice(idx, 1);
    state.hand.push(state.drawn);

    if (state.riichiTurnLocked) {
      const waits = MahHack.winningTilesFor13(state.hand);
      if (waits.length === 0) {
        log("リーチ不成立：捨て牌後がテンパイではありません（宣言取消）");
        state.riichi = false;
        state.doubleRiichi = false;
        state.riichiLocked = false;
      } else {
        log(`リーチ成立：待ち=${waits.join(" ")}`);
        state.ippatsuEligible = true;
        state.riichiLocked = true;
      }
      state.riichiTurnLocked = false;
    }

    afterDiscardCommon(t);
  }

  function discardDrawn(t) {
    if (!state || state.isEnded) return;
    if (!state.drawn) return;
    if (t !== state.drawn) return;

    if (state.riichiTurnLocked) {
      const waits = MahHack.winningTilesFor13(state.hand);
      if (waits.length === 0) {
        log("リーチ不成立：捨て牌後がテンパイではありません（宣言取消）");
        state.riichi = false;
        state.doubleRiichi = false;
        state.riichiLocked = false;
      } else {
        log(`リーチ成立：待ち=${waits.join(" ")}`);
        state.ippatsuEligible = true;
        state.riichiLocked = true;
      }
      state.riichiTurnLocked = false;
    }

    afterDiscardCommon(t);
  }

  function declareRiichi() {
    if (!canRiichiNow()) return;

    const isDouble = (state.draws === 1 && state.discards.length === 0);
    state.riichi = !isDouble;
    state.doubleRiichi = isDouble;
    state.riichiTurnLocked = true;

    log(isDouble ? "ダブルリーチ宣言（捨て牌で成立判定）" : "リーチ宣言（捨て牌で成立判定）");
    render();
  }

  function ankan() {
    if (!state || state.isEnded) return;
    if (!state.drawn) return;

    if (state.riichiLocked || state.riichi || state.doubleRiichi) {
      log("リーチ後は暗槓できません（MVP仕様）");
      return;
    }

    state.ippatsuEligible = false;
    state.ippatsuOnThisDraw = false;

    const tiles14 = [...state.hand, state.drawn];
    const c = MahHack.countTiles(tiles14);
    const candidates = [...c.entries()].filter(([, v]) => v >= 4).map(([k]) => k);
    if (candidates.length === 0) return;

    const tile = candidates[0];

    let removed = 0;
    const remain = [];
    for (const tt of tiles14) {
      if (tt === tile && removed < 4) { removed++; continue; }
      remain.push(tt);
    }

    state.kanCount += 1;

    const idx = deadWallIndicesForKandora(state.kanCount);
    const ind = state.deadWall[idx.ind];
    const uraInd = state.deadWall[idx.ura];
    if (!ind || !uraInd) return endHand("エラー：死に王牌不足（カン上限）");

    state.doraIndicators.push(ind);
    state.uraIndicators.push(uraInd);
    const newDora = MahHack.nextDoraFromIndicator(ind);
    state.doraTiles.push(newDora);

    log(`暗槓: ${tile}（ドラ追加: ${newDora}）`);

    const rinshanTile = state.deadWall.pop();
    if (!rinshanTile) return endHand("流局：王牌不足");

    state.hand = MahHack.sortTiles(remain);
    state.drawn = rinshanTile;
    state.lastDraw = rinshanTile;
    state.lastWinFrom = "rinshan";

    log(`嶺上ツモ: ${rinshanTile}`);
    render();
  }

  function win() {
    if (!state || state.isEnded) return;
    if (!state.drawn) return;

    const tiles = [...state.hand, state.drawn];
    if (!MahHack.isAgari(tiles)) { log("和了不可：和了形ではありません"); return; }

    const winTile = state.drawn;
    const winType = "tsumo";

    const haitei = (state.lastWinFrom === "live" && state.wall.length === 0);
    const rinshan = (state.lastWinFrom === "rinshan");

    const uraDoraTiles = (state.riichi || state.doubleRiichi)
      ? state.uraIndicators.map(MahHack.nextDoraFromIndicator)
      : [];

    if (uraDoraTiles.length > 0) {
      state.uraDoraTiles = uraDoraTiles;
      state.showUraDora = true;
    }

    const ctx = {
      winType,
      winTile,
      isMenzen: true,

      riichi: state.riichi,
      doubleRiichi: state.doubleRiichi,
      ippatsu: state.ippatsuOnThisDraw === true,

      haitei,
      houtei: false,
      rinshan,
      chankan: false,
      tenhou: false,
      chiihou: false,

      seatWind: state.seatWind,
      roundWind: state.roundWind,
      kanCount: state.kanCount,

      doraTiles: state.doraTiles,
      uraDoraTiles,

      optMangan30fu4han: !!optMangan30fu4han.checked,
    };

    const yakuInfo = MahHack.detectYaku(tiles, ctx);
    const fu = MahHack.calcFu(tiles, yakuInfo, ctx);
    const han = yakuInfo.han;

    const pts = MahHack.calcPoints(han, fu, ctx.optMangan30fu4han);

    log("=== 和了（ツモ） ===");
    log(`和了牌: ${winTile} / 取得元: ${state.lastWinFrom}`);
    log("役：");
    for (const y of yakuInfo.yaku) log(`- ${y.name}：${y.han}翻`);
    log(`合計：${han}翻 / ${fu}符`);
    if (pts.limitName) log(`区分：${pts.limitName}`);
    log(`合計点：${pts.total}`);

    // ===== Battle apply: 得点 = ダメージ =====
    const before = Battle.snapshot();
    const after = Battle.applyWin(pts.total);

    log(`ダメージ：${pts.total}（敵HP ${before.enemyHp} → ${after.enemyHp}）`);
    if (after.stage !== before.stage) {
      log(`敵撃破：次の敵へ（STAGE ${after.stage} / 敵HP ${after.enemyHp}）`);
    }

    render();
    endHand("次局へ進みます");
    startNextHand(false);
  }

  function resolveRyukyoku() {
    // テンパイ判定：13枚手牌がテンパイなら waits>0
    const waits = MahHack.winningTilesFor13(state.hand);
    const isTenpai = waits.length > 0;

    log("=== 流局 ===");
    log(isTenpai ? `テンパイ（待ち=${waits.join(" ")}）` : "ノーテン");

    const before = Battle.snapshot();
    const res = Battle.applyRyukyoku(isTenpai);

    log(`ペナルティ：-${res.penalty}（自分HP ${before.playerHp} → ${res.playerHp}）`);

    render();
    if (res.isEnded) {
      endHand("GAME OVER（自分HPが0になりました）");
      return;
    }

    endHand("次局へ進みます");
    startNextHand(false);
  }

  btnNew.addEventListener("click", newGame);
  btnWin.addEventListener("click", win);
  btnRiichi.addEventListener("click", declareRiichi);
  btnAnkan.addEventListener("click", ankan);

  // 初期表示
  renderBattleHud();
  log("「新規開始」を押してください。");
})();
