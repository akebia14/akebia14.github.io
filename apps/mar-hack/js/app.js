/* app.js (solo-riichi MVP+)
 * - 新規開始：親（東）固定、場風も東固定（翻牌判定用）
 * - ツモ上限：20（ライブ山からの通常ツモ回数。嶺上ツモは別枠で増やさない仕様）
 * - 暗槓：手牌に4枚あるときに実行可。嶺上牌を王牌からツモ。
 * - リーチ：テンパイ時のみ宣言可。第一巡（初回捨て牌前）ならダブルリーチ扱い。
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

  function newGame() {
    elLog.textContent = "";
    const wallAll = buildWall();

    // dead wall 14
    const deadWall = wallAll.splice(-14);

    // dora indicator positions:
    // MVP固定：死に王牌[4]が表ドラ表示、裏は対応する“裏”として[5]を保持（和了時にのみ公開/加算）
    // kandoraは順次、[6],[8],[10]...（表示）と、その裏として次インデックスを保持する（MVP固定ルール）
    const doraIndicators = [deadWall[4]];
    const uraIndicators = [deadWall[5]];
    const doraTiles = [MahHack.nextDoraFromIndicator(deadWall[4])];

    const hand = [];
    for (let i = 0; i < 13; i++) hand.push(wallAll.shift());

    state = {
      wall: wallAll,          // live wall
      deadWall,              // dead wall pool
      doraIndicators,
      uraIndicators,
      doraTiles,
      kanCount: 0,
      hand: MahHack.sortTiles(hand),
      discards: [],
      draws: 0,              // live-wall draws count only
      hasDrawnThisTurn: false,
      lastDraw: null,
      riichi: false,
      doubleRiichi: false,
      riichiTurnLocked: false,
      riichiDeclaredBeforeFirstDiscard: false,
      turn: 0,               // increment on each draw action (live or rinshan) for UI
      seatWind: "東",
      roundWind: "東",
      lastWinTile: null,
      lastWinFrom: null,     // 'live'|'rinshan'
    };

    btnDraw.disabled = false;
    btnWin.disabled = true;
    btnRiichi.disabled = true;
    btnAnkan.disabled = true;

    render();
    log("新規開始：配牌13枚（親/場風=東 固定）");
    log(`ドラ表示牌: ${state.doraIndicators[0]} / ドラ: ${state.doraTiles[0]}`);
  }

  function canRiichiNow() {
    if (!state) return false;
    if (state.riichi) return false;
    if (!state.hasDrawnThisTurn) return false;
    // テンパイ条件：どれか1枚捨てた後、13枚がテンパイ（待ちが1枚以上）
    for (let i = 0; i < state.hand.length; i++) {
      const tmp = state.hand.slice();
      tmp.splice(i, 1);
      const waits = MahHack.winningTilesFor13(tmp);
      if (waits.length > 0) return true;
    }
    return false;
  }

  function hasAnkanCandidate() {
    if (!state || !state.hasDrawnThisTurn) return false;
    const c = MahHack.countTiles(state.hand);
    for (const [k, v] of c.entries()) if (v >= 4) return true;
    return false;
  }

  function render() {
    if (!state) return;

    renderTiles(elDoraInd, state.doraIndicators);
    renderTiles(elDora, state.doraTiles);

    renderTiles(elHand, state.hand, {
      clickable: state.hasDrawnThisTurn,
      onClick: (idx, t) => discard(idx, t),
    });
    renderTiles(elDiscards, state.discards);

    elDrawCount.textContent = `ツモ ${state.draws} / ${GAME_MAX_DRAWS}`;
    elWallCount.textContent = `山 ${state.wall.length}`;

    const canWin = state.hasDrawnThisTurn && MahHack.isAgari(state.hand);
    btnWin.disabled = !canWin;

    btnRiichi.disabled = !canRiichiNow();
    btnAnkan.disabled = !(hasAnkanCandidate());

    if (!state.hasDrawnThisTurn) {
      // ツモ前
    }
  }

  function drawFromLive() {
    if (!state) return;
    if (state.hasDrawnThisTurn) { log("エラー：捨て牌前に連続ツモはできません"); return; }
    if (state.draws >= GAME_MAX_DRAWS) { log("流局：ツモ上限に到達"); endHand(); return; }
    if (state.wall.length <= 0) { log("流局：山切れ"); endHand(); return; }

    const t = state.wall.shift();
    state.hand.push(t);
    state.hand = MahHack.sortTiles(state.hand);

    state.draws += 1;
    state.turn += 1;
    state.hasDrawnThisTurn = true;
    state.lastDraw = t;
    state.lastWinFrom = "live";

    log(`ツモ(${state.draws}): ${t}`);

    // 海底：live wall が残り0の状態でツモった場合、そのツモで和了なら海底 :contentReference[oaicite:52]{index=52}
    // 判定は win() 側で行う（ctx.haitei=true）
    render();
  }

  function deadWallIndicesForKandora(n) {
    // MVP固定：表ドラ(4)、裏(5) を使ったあと、カンドラ表示は 6,8,10,12（最大4槓想定）
    // 裏はそれぞれ +1
    const base = 6 + (n - 1) * 2;
    return { ind: base, ura: base + 1 };
  }

  function ankan() {
    if (!state || !state.hasDrawnThisTurn) return;
    const c = MahHack.countTiles(state.hand);
    const candidates = [...c.entries()].filter(([k, v]) => v >= 4).map(([k]) => k);
    if (candidates.length === 0) return;

    // MVP：候補が複数ある場合、最初の候補を暗槓（UI選択は次段階）
    const tile = candidates[0];

    // remove 4 tiles
    let removed = 0;
    state.hand = state.hand.filter(t => {
      if (t === tile && removed < 4) { removed++; return false; }
      return true;
    });

    state.kanCount += 1;

    // kandora indicator reveal immediately (rule choice; see Kan timing variations) :contentReference[oaicite:53]{index=53}
    const idx = deadWallIndicesForKandora(state.kanCount);
    const ind = state.deadWall[idx.ind];
    const uraInd = state.deadWall[idx.ura];
    if (!ind || !uraInd) {
      log("エラー：死に王牌が不足（カン上限に到達）");
      endHand();
      return;
    }
    state.doraIndicators.push(ind);
    state.uraIndicators.push(uraInd);
    state.doraTiles.push(MahHack.nextDoraFromIndicator(ind));

    log(`暗槓: ${tile}（カンドラ表示牌追加: ${ind} / ドラ: ${MahHack.nextDoraFromIndicator(ind)}）`);

    // rinshan draw: draw 1 from dead wall tail (MVP：deadWall末尾から取得)
    // rinshan yaku is event-based, applied if win on this draw :contentReference[oaicite:54]{index=54}
    const rinshanTile = state.deadWall.pop();
    if (!rinshanTile) {
      log("流局：王牌不足");
      endHand();
      return;
    }
    state.hand.push(rinshanTile);
    state.hand = MahHack.sortTiles(state.hand);
    state.lastDraw = rinshanTile;
    state.lastWinFrom = "rinshan";

    log(`嶺上ツモ: ${rinshanTile}`);

    // 暗槓後は「捨て牌が必要」なので hasDrawnThisTurn 維持
    state.hasDrawnThisTurn = true;
    render();
  }

  function discard(idx, t) {
    if (!state || !state.hasDrawnThisTurn) return;

    // リーチ後の打牌制約（厳密ルールは実装差が出るため、今回は制約をかけない＝採用仕様）
    // ※ここで「リーチ後は基本ツモ切りのみ」等の制約を入れることも可能

    state.hand.splice(idx, 1);
    state.discards.push(t);
    state.hand = MahHack.sortTiles(state.hand);
    state.hasDrawnThisTurn = false;

    log(`捨て: ${t}`);

    // リーチ宣言成立：捨て牌後の13枚がテンパイであること
    if (state.riichiTurnLocked) {
      const waits = MahHack.winningTilesFor13(state.hand);
      if (waits.length === 0) {
        // 不成立
        log("リーチ不成立：捨て牌後がテンパイではありません（宣言を取消）");
        state.riichi = false;
        state.doubleRiichi = false;
      } else {
        log(`リーチ成立：待ち=${waits.join(" ")}`);
      }
      state.riichiTurnLocked = false;
    }

    // 20ツモ到達後に捨ててまだ和了していないなら流局
    if (state.draws >= GAME_MAX_DRAWS) {
      log("流局：ツモ上限に到達（和了なし）");
      endHand();
    }
    render();
  }

  function declareRiichi() {
    if (!canRiichiNow()) return;

    // 第一巡（最初の捨て牌前）のリーチをダブルリーチ扱い :contentReference[oaicite:55]{index=55}
    const beforeFirstDiscard = state.discards.length === 0;
    state.riichi = true;
    state.doubleRiichi = beforeFirstDiscard;
    state.riichiTurnLocked = true;

    log(state.doubleRiichi ? "ダブルリーチ宣言（捨て牌で成立判定）" : "リーチ宣言（捨て牌で成立判定）");
    render();
  }

  function endHand() {
    btnDraw.disabled = true;
    btnWin.disabled = true;
    btnRiichi.disabled = true;
    btnAnkan.disabled = true;
  }

  function win() {
    if (!state) return;
    if (!state.hasDrawnThisTurn || !MahHack.isAgari(state.hand)) {
      log("和了不可：和了形ではありません");
      return;
    }

    // win tile: lastDraw
    const winTile = state.lastDraw;
    const winType = "tsumo";

    // haitei flag: if last live draw consumed the last live tile
    const haitei = (state.lastWinFrom === "live" && state.wall.length === 0);
    const rinshan = (state.lastWinFrom === "rinshan");

    const ctx = {
      winType,
      winTile,
      isMenzen: true,
      riichi: state.riichi && !state.doubleRiichi,
      doubleRiichi: state.doubleRiichi,
      haitei,
      houtei: false,   // ソロ仕様では発生しない
      rinshan,
      chankan: false,  // ソロ仕様では発生しない
      tenhou: false,   // 「配牌14枚（親）」で和了している場合のみ app側で付与する余地（今回は未導入）
      chiihou: false,  // ソロ仕様（親固定）では未使用
      seatWind: state.seatWind,
      roundWind: state.roundWind,
      kanCount: state.kanCount,
      doraTiles: state.doraTiles,
      uraDoraTiles: (state.riichi || state.doubleRiichi)
        ? state.uraIndicators.map(MahHack.nextDoraFromIndicator)
        : [],
      optMangan30fu4han: !!optMangan30fu4han.checked,
    };

    const yakuInfo = MahHack.detectYaku(state.hand, ctx);

    log("=== 和了（ツモ） ===");
    log(`和了牌: ${winTile} / 取得元: ${state.lastWinFrom}`);
    if (haitei) log("イベント：海底摸月");
    if (rinshan) log("イベント：嶺上開花");
    if (state.riichi) log(state.doubleRiichi ? "イベント：ダブルリーチ" : "イベント：リーチ");

    log("役：");
    for (const y of yakuInfo.yaku) log(`- ${y.name}：${y.han}翻`);

    const fu = MahHack.calcFu(state.hand, yakuInfo, ctx);
    const han = yakuInfo.han;

    log(`合計：${han}翻 / ${fu}符`);

    const pts = MahHack.calcPoints(han, fu, ctx.optMangan30fu4han);
    if (pts.limitName) log(`区分：${pts.limitName}`);
    log(`basic points：${pts.basePoints}`);
    log(`合計点(便宜スカラー)：${pts.total}`);

    endHand();
  }

  btnNew.addEventListener("click", newGame);
  btnDraw.addEventListener("click", drawFromLive);
  btnWin.addEventListener("click", win);
  btnRiichi.addEventListener("click", declareRiichi);
  btnAnkan.addEventListener("click", ankan);

  log("「新規開始」を押してください。");
})();
