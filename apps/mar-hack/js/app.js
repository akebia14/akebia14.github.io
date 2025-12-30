/* app.js
 * UI変更版：
 * - ツモは自動
 * - ツモ牌は右側に別表示（手牌13枚のまま）
 * - 捨て牌後に理牌して、0.2秒後に次の自動ツモ
 */

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
  const elDoraInd = $("doraIndicator");
  const elDora = $("doraTile");

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

  function current14() {
    if (!state || !state.drawn) return null;
    return MahHack.sortTiles([...state.hand, state.drawn]); // 和了判定用（表示とは独立）
  }

  function scheduleAutoDraw() {
    if (!state) return;
    if (state.isEnded) return;
    if (state.drawn) return; // まだ捨ててない
    clearTimeout(state.autoTimer);
    state.autoTimer = setTimeout(() => {
      autoDrawFromLive();
    }, AUTO_DRAW_DELAY_MS);
  }

  function canRiichiNow() {
    if (!state) return false;
    if (state.riichi) return false;
    if (!state.drawn) return false; // ツモってから
    // 14枚から1枚捨てた後にテンパイか
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

    renderTiles(elDoraInd, state.doraIndicators);
    renderTiles(elDora, state.doraTiles);

    // 手牌13枚：捨て可（ツモ後のみ）
    renderTiles(elHand, state.hand, {
      clickable: !!state.drawn,
      onClick: (idx, t) => discardFromHand(idx, t),
    });

    // ツモ牌：捨て可（ツモ切り）
    renderSingleTile(elDrawn, state.drawn, {
      clickable: !!state.drawn,
      onClick: (t) => discardDrawn(t),
    });

    renderTiles(elDiscards, state.discards);

    const remaining = Math.max(0, GAME_MAX_DRAWS - state.draws);
    elDrawCount.textContent = `ツモ ${state.draws} / ${GAME_MAX_DRAWS}（残り ${remaining}）`;

    elWallCount.textContent = `山 ${state.wall.length}`;

    // 和了は14枚揃っている時のみ
    const canWin = !!state.drawn && MahHack.isAgari([...state.hand, state.drawn]);
    btnWin.disabled = !canWin;

    btnRiichi.disabled = !canRiichiNow();
    btnAnkan.disabled = !hasAnkanCandidate();
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

      hand: MahHack.sortTiles(hand), // 初期は理牌してOK（好みで無理牌にも可能）
      drawn: null,                   // ツモ牌は別枠
      discards: [],

      draws: 0,                      // live wall draw count only
      lastDraw: null,
      lastWinFrom: null,             // 'live'|'rinshan'
      isEnded: false,
      autoTimer: null,

      riichi: false,
      doubleRiichi: false,
      riichiTurnLocked: false,

      seatWind: "東",
      roundWind: "東",
    };

    log("新規開始：配牌13枚（親/場風=東 固定）");
    log(`ドラ表示牌: ${state.doraIndicators[0]} / ドラ: ${state.doraTiles[0]}`);

    render();

    // 初手ツモは自動
    scheduleAutoDraw();
  }

  function autoDrawFromLive() {
    if (!state || state.isEnded) return;
    if (state.drawn) return; // 捨ててない
    if (state.draws >= GAME_MAX_DRAWS) return endHand("流局：ツモ上限に到達");
    if (state.wall.length <= 0) return endHand("流局：山切れ");

    const t = state.wall.shift();
    state.drawn = t;
    state.draws += 1;
    state.lastDraw = t;
    state.lastWinFrom = "live";

    log(`ツモ(${state.draws}): ${t}`);

    // ツモ後に和了形なら「上がる」ボタンが有効化される
    render();
  }

  function afterDiscardCommon(discardedTile) {
    state.discards.push(discardedTile);

    // 捨て牌後に理牌
    state.hand = MahHack.sortTiles(state.hand);
    state.drawn = null;

    log(`捨て: ${discardedTile}`);
    render();

    // 20回目を捨て終わった時点で未和了なら流局
    if (state.draws >= GAME_MAX_DRAWS) {
      return endHand("流局：20ツモ終了時点で和了なし");
    }

    // 次ツモを自動（0.2秒後）
    scheduleAutoDraw();
  }

  function discardFromHand(idx, t) {
    if (!state || state.isEnded) return;
    if (!state.drawn) return; // ツモってないのに捨てない

    // 14枚のうち「手牌側」を捨てる：ツモ牌は手牌に取り込む→その後理牌
    state.hand.splice(idx, 1);
    state.hand.push(state.drawn);

    // リーチ成立判定（宣言後に捨ててテンパイであること）
    if (state.riichiTurnLocked) {
      const waits = MahHack.winningTilesFor13(state.hand);
      if (waits.length === 0) {
        log("リーチ不成立：捨て牌後がテンパイではありません（宣言を取消）");
        state.riichi = false;
        state.doubleRiichi = false;
      } else {
        log(`リーチ成立：待ち=${waits.join(" ")}`);
      }
      state.riichiTurnLocked = false;
    }

    afterDiscardCommon(t);
  }

  function discardDrawn(t) {
    if (!state || state.isEnded) return;
    if (!state.drawn) return;
    if (t !== state.drawn) return;

    // ツモ切り：手牌はそのまま、ツモ牌だけ捨てる→理牌
    // リーチ成立判定（宣言後に捨ててテンパイであること）
    if (state.riichiTurnLocked) {
      const waits = MahHack.winningTilesFor13(state.hand);
      if (waits.length === 0) {
        log("リーチ不成立：捨て牌後がテンパイではありません（宣言を取消）");
        state.riichi = false;
        state.doubleRiichi = false;
      } else {
        log(`リーチ成立：待ち=${waits.join(" ")}`);
      }
      state.riichiTurnLocked = false;
    }

    afterDiscardCommon(t);
  }

  function declareRiichi() {
    if (!canRiichiNow()) return;

    // 第一巡（最初の捨て牌前）のリーチをダブルリーチ扱い 
    const beforeFirstDiscard = state.discards.length === 0;
    state.riichi = true;
    state.doubleRiichi = beforeFirstDiscard;
    state.riichiTurnLocked = true;

    log(state.doubleRiichi ? "ダブルリーチ宣言（捨て牌で成立判定）" : "リーチ宣言（捨て牌で成立判定）");
    render();
  }

  function ankan() {
    if (!state || state.isEnded) return;
    if (!state.drawn) return;

    const tiles14 = [...state.hand, state.drawn];
    const c = MahHack.countTiles(tiles14);
    const candidates = [...c.entries()].filter(([, v]) => v >= 4).map(([k]) => k);
    if (candidates.length === 0) return;

    // MVP：複数候補がある場合、先頭を自動採用（後でUI選択に拡張）
    const tile = candidates[0];

    // 手牌13 + ツモ1 から4枚抜く
    let removed = 0;
    const remain = [];
    for (const t of tiles14) {
      if (t === tile && removed < 4) { removed++; continue; }
      remain.push(t);
    }
    // 暗槓後は 10枚（面子として4枚固定）になるので、補充ツモ（嶺上）で 11枚…ではなく、
    // 実際の手牌は「暗槓面子を除いた手牌 + 嶺上ツモ」で 11枚（表示は手牌枠に13は維持されない）
    // →UIを複雑にしないため、ここでは暗槓面子は「別管理」せず、手牌側から4枚除外した分はそのまま進めます。
    // （役判定を厳密にやる場合、暗槓面子は副露面子として構造保持が必要。現段階のMVPでは未導入）

    state.kanCount += 1;

    // カンドラ表示を即公開（採用仕様） 
    const idx = deadWallIndicesForKandora(state.kanCount);
    const ind = state.deadWall[idx.ind];
    const uraInd = state.deadWall[idx.ura];
    if (!ind || !uraInd) return endHand("エラー：死に王牌不足（カン上限）");

    state.doraIndicators.push(ind);
    state.uraIndicators.push(uraInd);
    state.doraTiles.push(MahHack.nextDoraFromIndicator(ind));

    log(`暗槓: ${tile}（カンドラ表示牌追加: ${ind} / ドラ: ${MahHack.nextDoraFromIndicator(ind)}）`);

    // 嶺上牌ツモ：deadWall末尾から1枚
    const rinshanTile = state.deadWall.pop();
    if (!rinshanTile) return endHand("流局：王牌不足");

    // 手牌を再構築：remain のうち13枚を手牌側、残り1枚をツモ牌枠…という運用に揃える
    // 現状の remain は 10枚。嶺上で1枚増えて11枚。
    // MVPとして「暗槓後の面子固定」をUIに出さないため、ここは次段階で面子表示（暗槓枠）を導入するのが正道です。
    // ただ今回の依頼はUI操作性（自動ツモ/別枠/理牌）なので、暗槓後の表示は“簡易”として続行します。

    state.hand = MahHack.sortTiles(remain); // ここでは理牌してOK
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

    // 海底：live wallが0になったツモで和了（定義上の整理） 
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
      tenhou: false,
      chiihou: false,
      seatWind: state.seatWind,
      roundWind: state.roundWind,
      kanCount: state.kanCount,
      doraTiles: state.doraTiles,
      uraDoraTiles: (state.riichi || state.doubleRiichi)
        ? state.uraIndicators.map(MahHack.nextDoraFromIndicator)
        : [],
      optMangan30fu4han: !!optMangan30fu4han.checked,
    };

    const yakuInfo = MahHack.detectYaku(tiles, ctx);

    log("=== 和了（ツモ） ===");
    log(`和了牌: ${winTile} / 取得元: ${state.lastWinFrom}`);
    if (haitei) log("イベント：海底摸月");
    if (rinshan) log("イベント：嶺上開花");
    if (state.riichi) log(state.doubleRiichi ? "イベント：ダブルリーチ" : "イベント：リーチ");

    log("役：");
    for (const y of yakuInfo.yaku) log(`- ${y.name}：${y.han}翻`);

    const fu = MahHack.calcFu(tiles, yakuInfo, ctx);
    const han = yakuInfo.han;

    log(`合計：${han}翻 / ${fu}符`);

    const pts = MahHack.calcPoints(han, fu, ctx.optMangan30fu4han);
    if (pts.limitName) log(`区分：${pts.limitName}`);
    log(`basic points：${pts.basePoints}`);
    log(`合計点(便宜スカラー)：${pts.total}`);

    endHand();
  }

  btnNew.addEventListener("click", newGame);
  btnWin.addEventListener("click", win);
  btnRiichi.addEventListener("click", declareRiichi);
  btnAnkan.addEventListener("click", ankan);

  log("「新規開始」を押してください。");
})();
