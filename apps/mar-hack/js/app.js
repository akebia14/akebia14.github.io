/* app.js
 * UIとゲーム進行：配牌→最大20ツモ→捨て牌→和了判定→採点表示
 */

(() => {
  const GAME_MAX_DRAWS = 20;

  const $ = (id) => document.getElementById(id);
  const elHand = $("hand");
  const elDiscards = $("discards");
  const elLog = $("log");
  const elDrawCount = $("drawCount");
  const elWallCount = $("wallCount");
  const elDoraInd = $("doraIndicator");
  const elDora = $("doraTile");

  const btnNew = $("btnNew");
  const btnDraw = $("btnDraw");
  const btnWin = $("btnWin");
  const optMangan30fu4han = $("optMangan30fu4han");

  let state = null;

  function log(s) {
    elLog.textContent = (elLog.textContent ? elLog.textContent + "\n" : "") + s;
    elLog.scrollTop = elLog.scrollHeight;
  }

  function tileToImgSrc(t) {
    // 数牌: 1m.png など。字牌: 東.png / 白.png など（ユーザー指定）
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

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildWall() {
    const tiles = [];
    // 数牌 1-9 × m/p/s ×4
    for (const s of ["m","p","s"]) {
      for (let n = 1; n <= 9; n++) {
        for (let k = 0; k < 4; k++) tiles.push(`${n}${s}`);
      }
    }
    // 字牌：東南西北白發中 ×4
    for (const h of ["東","南","西","北","白","發","中"]) {
      for (let k = 0; k < 4; k++) tiles.push(h);
    }
    return shuffle(tiles);
  }

  function newGame() {
    elLog.textContent = "";
    const wallAll = buildWall();

    // 死に王牌14枚。ドラ表示はその中の1枚を使う（位置の厳密再現はMVPでは不要なため固定インデックス）
    // 「死に王牌にドラ表示があり、表示牌の次がドラ」という点を実装。:contentReference[oaicite:12]{index=12}
    const deadWall = wallAll.splice(-14);
    const doraIndicator = deadWall[4];
    const doraTile = MahHack.nextDoraFromIndicator(doraIndicator);

    const hand = [];
    for (let i = 0; i < 13; i++) hand.push(wallAll.shift());

    state = {
      wall: wallAll,
      deadWall,
      doraIndicator,
      doraTile,
      hand: MahHack.sortTiles(hand),
      discards: [],
      draws: 0,
      hasDrawnThisTurn: false,
      lastDraw: null,
    };

    btnDraw.disabled = false;
    btnWin.disabled = true;

    render();
    log("新規開始：配牌13枚");
    log(`ドラ表示牌: ${doraIndicator} / ドラ: ${doraTile}`);
  }

  function render() {
    if (!state) return;
    renderTiles(elDoraInd, [state.doraIndicator]);
    renderTiles(elDora, [state.doraTile]);

    renderTiles(elHand, state.hand, {
      clickable: state.hasDrawnThisTurn, // ツモ後のみ捨て可能
      onClick: (idx, t) => discard(idx, t)
    });
    renderTiles(elDiscards, state.discards);

    elDrawCount.textContent = `ツモ ${state.draws} / ${GAME_MAX_DRAWS}`;
    elWallCount.textContent = `山 ${state.wall.length}`;

    const canWin = MahHack.isAgari(state.hand) && state.hasDrawnThisTurn;
    btnWin.disabled = !canWin;
  }

  function draw() {
    if (!state) return;
    if (state.hasDrawnThisTurn) { log("エラー：捨て牌前に連続ツモはできません"); return; }
    if (state.draws >= GAME_MAX_DRAWS) { log("流局：ツモ上限に到達"); btnDraw.disabled = true; btnWin.disabled = true; return; }
    if (state.wall.length <= 0) { log("流局：山切れ"); btnDraw.disabled = true; btnWin.disabled = true; return; }

    const t = state.wall.shift();
    state.hand.push(t);
    state.hand = MahHack.sortTiles(state.hand);
    state.draws += 1;
    state.hasDrawnThisTurn = true;
    state.lastDraw = t;

    log(`ツモ(${state.draws}): ${t}`);
    if (MahHack.isAgari(state.hand)) {
      log("和了形です：上がる（ツモ）が可能");
    }
    if (state.draws >= GAME_MAX_DRAWS && !MahHack.isAgari(state.hand)) {
      log("流局：20ツモ終了時点で和了なし");
      btnDraw.disabled = true;
    }
    render();
  }

  function discard(idx, t) {
    if (!state || !state.hasDrawnThisTurn) return;
    // 14枚→1枚捨てて13枚に戻す
    state.hand.splice(idx, 1);
    state.discards.push(t);
    state.hand = MahHack.sortTiles(state.hand);
    state.hasDrawnThisTurn = false;

    log(`捨て: ${t}`);
    if (state.draws >= GAME_MAX_DRAWS) {
      log("流局：ツモ上限に到達（和了なし）");
      btnDraw.disabled = true;
      btnWin.disabled = true;
    }
    render();
  }

  function win() {
    if (!state) return;
    if (!MahHack.isAgari(state.hand)) { log("和了形ではありません"); return; }

    const ctx = {
      tsumo: true,
      doraTile: state.doraTile,
      optMangan30fu4han: !!optMangan30fu4han.checked,
    };

    const yakuInfo = MahHack.detectYaku(state.hand, ctx);

    // 役満（国士のみ実装）
    if (yakuInfo.yakuman && yakuInfo.yakuman > 0) {
      log("=== 和了：役満 ===");
      log(yakuInfo.yaku.map(x => `- ${x.name}`).join("\n"));
      // 役満は basic points=8000（数え役満も同等） :contentReference[oaicite:13]{index=13}
      const basePoints = 8000;
      const total = basePoints * 4;
      log(`合計点(便宜スカラー): ${total}（basic ${basePoints} ×4）`);
      btnDraw.disabled = true;
      btnWin.disabled = true;
      return;
    }

    const fu = MahHack.calcFu(state.hand, yakuInfo, ctx);
    const han = yakuInfo.han;

    log("=== 和了（ツモ） ===");
    log("役：");
    for (const y of yakuInfo.yaku) {
      if (y.isDora) log(`- ${y.name}：${y.han}翻`);
      else log(`- ${y.name}：${y.han}翻`);
    }
    log(`合計：${han}翻 / ${fu}符`);

    const pts = MahHack.calcPoints(han, fu, ctx.optMangan30fu4han);
    if (pts.limitName) log(`区分：${pts.limitName}`);
    log(`basic points：${pts.basePoints}`);
    log(`合計点(便宜スカラー)：${pts.total}`);

    btnDraw.disabled = true;
    btnWin.disabled = true;
  }

  btnNew.addEventListener("click", newGame);
  btnDraw.addEventListener("click", draw);
  btnWin.addEventListener("click", win);

  // 初期表示
  log("「新規開始」を押してください。");
})();
