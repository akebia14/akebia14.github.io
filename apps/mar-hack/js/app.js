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

  // ★ドラは牌だけ
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

    // ドラ：牌のみ表示（カンドラが増えると並ぶ）
    renderTiles(elDora, state.doraTiles);

    // 裏ドラ：リーチ和了後のみ牌表示
    if (state.showUraDora) {
      renderTiles(elUraDora, state.uraDoraTiles);
    } else {
      elUraDora.innerHTML = "";
    }

    // ★リーチ成立後は手牌を触れない（ツモ切りのみ）
    renderTiles(elHand, state.hand, {
      clickable: !!state.drawn && !state.riichiLocked,
      onClick: (idx, t) => discardFromHand(idx, t),
    });

    // ツモ牌は常に捨てられる（ツモ切り）
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

    // ★リーチ後は暗槓禁止（MVP仕様）
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
    elLog.textContent = "";

    const wallAll = buildWall();
    const deadWall = wallAll.splice(-14);

    // UIは「表示牌」は出さないが、内部では保持する
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

      // ★リーチ成立後ロック（手牌変更不可）
      riichiLocked: false,

      // ★一発用（mahjong.js側がctx.ippatsuを見て役付けする前提）
      ippatsuEligible: false,
      ippatsuOnThisDraw: false,

      // ★裏ドラ表示（和了後のみ）
      showUraDora: false,
      uraDoraTiles: [],

      seatWind: "東",
      roundWind: "東",
    };

    log("新規開始：配牌13枚（親/場風=東 固定）");
    log(`ドラ: ${state.doraTiles[0]}`);

    render();
    scheduleAutoDraw();
  }

  function autoDrawFromLive() {
    if (!state || state.isEnded) return;
    if (state.drawn) return;
    if (state.draws >= GAME_MAX_DRAWS) return endHand("流局：ツモ上限に到達");
    if (state.wall.length <= 0) return endHand("流局：山切れ");

    const t = state.wall.shift();
    state.drawn = t;
    state.draws += 1;
    state.lastDraw = t;
    state.lastWinFrom = "live";

    // ★このツモが“一発対象ツモ”か確定
    state.ippatsuOnThisDraw = !!state.ippatsuEligible;

    log(`ツモ(${state.draws}): ${t}`);
    render();
  }

  function afterDiscardCommon(discardedTile) {
    // 捨て牌を積む
    state.discards.push(discardedTile);

    // 一発：対象ツモを和了しなかったので、捨てた時点で消滅
    if (state.ippatsuOnThisDraw) {
      state.ippatsuEligible = false;
      state.ippatsuOnThisDraw = false;
    }

    // 捨て牌後に理牌
    state.hand = MahHack.sortTiles(state.hand);
    state.drawn = null;

    log(`捨て: ${discardedTile}`);
    render();

    if (state.draws >= GAME_MAX_DRAWS) {
      return endHand("流局：上限ツモ終了時点で和了なし");
    }
    scheduleAutoDraw();
  }

  function discardFromHand(idx, t) {
    if (!state || state.isEnded) return;
    if (!state.drawn) return;

    // ★リーチ成立後は手牌を変更できない（ツモ切りのみ）
    if (state.riichiLocked) {
      log("リーチ後は手牌を変更できません（ツモ切りのみ）");
      return;
    }

    // 手牌から捨て → ツモ牌を手牌に入れる
    state.hand.splice(idx, 1);
    state.hand.push(state.drawn);

    // リーチ成立判定（宣言後、捨ててテンパイなら成立）
    if (state.riichiTurnLocked) {
      const waits = MahHack.winningTilesFor13(state.hand);
      if (waits.length === 0) {
        log("リーチ不成立：捨て牌後がテンパイではありません（宣言取消）");
        state.riichi = false;
        state.doubleRiichi = false;
        state.riichiLocked = false;
      } else {
        log(`リーチ成立：待ち=${waits.join(" ")}`);
        state.ippatsuEligible = true;   // 次ツモが一発対象
        state.riichiLocked = true;      // ★ここから先は手牌変更不可
      }
      state.riichiTurnLocked = false;
    }

    afterDiscardCommon(t);
  }

  function discardDrawn(t) {
    if (!state || state.isEnded) return;
    if (!state.drawn) return;
    if (t !== state.drawn) return;

    // リーチ成立判定（ツモ切りでも、捨てた後がテンパイなら成立）
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
        state.riichiLocked = true; // ★ここから先はツモ切りのみ
      }
      state.riichiTurnLocked = false;
    }

    afterDiscardCommon(t);
  }

  function declareRiichi() {
    if (!canRiichiNow()) return;

    // ★ダブルリーチは「初ツモ後〜初捨て牌前」限定（draws===1 & discards===0）
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

    // ★リーチ後は暗槓を禁止（MVP仕様）
    if (state.riichiLocked || state.riichi || state.doubleRiichi) {
      log("リーチ後は暗槓できません（MVP仕様）");
      return;
    }

    // カンしたら一発権利は消える（将来の仕様拡張のため）
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

    // カンドラ（表示牌は出さないが、ドラ牌は増やす）
    const idx = deadWallIndicesForKandora(state.kanCount);
    const ind = state.deadWall[idx.ind];
    const uraInd = state.deadWall[idx.ura];
    if (!ind || !uraInd) return endHand("エラー：死に王牌不足（カン上限）");

    state.doraIndicators.push(ind);
    state.uraIndicators.push(uraInd);
    state.doraTiles.push(MahHack.nextDoraFromIndicator(ind));

    log(`暗槓: ${tile}（ドラ追加: ${MahHack.nextDoraFromIndicator(ind)}）`);

    // 嶺上ツモ
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

    // 裏ドラはリーチ和了時に確定表示
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

      // ★一発（mahjong.js側が対応している前提）
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

    log("=== 和了（ツモ） ===");
    log(`和了牌: ${winTile} / 取得元: ${state.lastWinFrom}`);
    if (haitei) log("イベント：海底摸月");
    if (rinshan) log("イベント：嶺上開花");
    if (state.doubleRiichi) log("イベント：ダブルリーチ");
    else if (state.riichi) log("イベント：リーチ");
    if (ctx.ippatsu) log("イベント：一発");

    log("役：");
    for (const y of yakuInfo.yaku) log(`- ${y.name}：${y.han}翻`);

    const fu = MahHack.calcFu(tiles, yakuInfo, ctx);
    const han = yakuInfo.han;

    log(`合計：${han}翻 / ${fu}符`);

    const pts = MahHack.calcPoints(han, fu, ctx.optMangan30fu4han);
    if (pts.limitName) log(`区分：${pts.limitName}`);
    log(`basic points：${pts.basePoints}`);
    log(`合計点(便宜スカラー)：${pts.total}`);

    render();
    endHand();
  }

  btnNew.addEventListener("click", newGame);
  btnWin.addEventListener("click", win);
  btnRiichi.addEventListener("click", declareRiichi);
  btnAnkan.addEventListener("click", ankan);

  log("「新規開始」を押してください。");
})();
