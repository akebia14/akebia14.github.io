(() => {
  const GAME_MAX_DRAWS = 30;
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
  const elEnemyAtk = $("enemyAtk");

  // Dora
  const elDora = $("doraTile");
  const elUraDora = $("uraDoraTile");

  const btnNew = $("btnNew");
  const btnWin = $("btnWin");
  const btnRiichi = $("btnRiichi");
  const btnAnkan = $("btnAnkan");
  const optMangan30fu4han = $("optMangan30fu4han");

  // Result dialog
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

  let state = null;
  let pendingNextHand = false;

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
      elEnemyAtk.textContent = "-";
      return;
    }
    elStage.textContent = String(b.stage);
    elPlayerHp.textContent = String(b.playerHp);
    elEnemyHp.textContent = String(b.enemyHp);
    elEnemyAtk.textContent = String(b.enemyAtk);
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

  function setControlsEnabled(enabled) {
    btnWin.disabled = true;
    btnRiichi.disabled = true;
    btnAnkan.disabled = true;
    if (!enabled) return;
    const canWin = !!state?.drawn && MahHack.isAgari([...state.hand, state.drawn]);
    btnWin.disabled = !canWin;
    btnRiichi.disabled = !canRiichiNow();
    btnAnkan.disabled = state.riichiLocked || !hasAnkanCandidate();
  }

  function render() {
    if (!state) return;

    renderBattleHud();

    renderTiles(elDora, state.doraTiles);
    if (state.showUraDora) renderTiles(elUraDora, state.uraDoraTiles);
    else elUraDora.innerHTML = "";

    renderTiles(elHand, state.hand, {
      clickable: !!state.drawn && !state.riichiLocked,
      onClick: (idx, t) => discardFromHand(idx, t),
    });

    renderSingleTile(elDrawn, state.drawn, {
      clickable: !!state.drawn,
      onClick: (t) => discardDrawn(t),
    });

    const e = Battle.snapshot();
    enemyImg.src = e.enemyImg;
    enemyInfo.textContent = `攻撃まであと${e.nextAtkIn}ターン（${e.atkMin}～${e.atkMax}）`;
    enemyHpText.textContent = `${e.enemyHp} / ${e.enemyMaxHp}`;
    enemyHpBar.style.width = `${(e.enemyHp / e.enemyMaxHp) * 100}%`;


    renderTiles(elDiscards, state.discards);

    const remaining = Math.max(0, GAME_MAX_DRAWS - state.draws);
    elDrawCount.textContent = `ツモ ${state.draws} / ${GAME_MAX_DRAWS}（残り ${remaining}）`;
    elWallCount.textContent = `山 ${state.wall.length}`;

    setControlsEnabled(!state.isEnded);
  }

  function endHand(msg) {
    if (!state) return;
    state.isEnded = true;
    clearTimeout(state.autoTimer);
    if (msg) log(msg);
    setControlsEnabled(false);
  }

  function newGame() {
    Battle.initBattle();
    renderBattleHud();
    startNextHand(true);
  }

  function startNextHand(isFirst = false) {
    pendingNextHand = false;

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

      ippatsuEligible: false,
      ippatsuOnThisDraw: false,

      showUraDora: false,
      uraDoraTiles: [],

      seatWind: "東",
      roundWind: "東",
    };

    if (isFirst) elLog.textContent = "";
    log("配牌13枚（親/場風=東 固定）");
    log(`ドラ: ${state.doraTiles[0]}`);

    render();
    scheduleAutoDraw();
  }

  function autoDrawFromLive() {
    if (!state || state.isEnded) return;
    if (state.drawn) return;
    if (state.draws >= GAME_MAX_DRAWS) return;
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

  function openResultDialog(payload) {
    // title/sub
    elResultTitle.textContent = payload.title;
    elResultSub.textContent = payload.sub;

    // tiles
    renderTiles(elResultHand, payload.handTiles || []);
    renderTiles(elResultDora, payload.doraTiles || []);
    renderTiles(elResultUraDora, payload.uraDoraTiles || []);

    // yaku list
    elResultYaku.innerHTML = "";
    if (payload.yakuList && payload.yakuList.length > 0) {
      for (const y of payload.yakuList) {
        const li = document.createElement("li");
        li.textContent = `${y.name}（${y.han}翻）`;
        elResultYaku.appendChild(li);
      }
    } else {
      const li = document.createElement("li");
      li.textContent = "（なし）";
      elResultYaku.appendChild(li);
    }

    // score/battle text
    elResultScore.textContent = payload.scoreText || "";
    elResultBattle.textContent = payload.battleText || "";

    pendingNextHand = true;
    dlg.showModal();
  }

  btnNextHand.addEventListener("click", () => {
    if (dlg.open) dlg.close();
    if (!pendingNextHand) return;

    const b = Battle.snapshot();
    renderBattleHud();
    if (b && b.isEnded) {
      endHand("GAME OVER（自分HPが0になりました）");
      pendingNextHand = false;
      return;
    }

    pendingNextHand = false;
    startNextHand(false);
  });

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

    // バトル適用（得点＝ダメージ）
    const before = Battle.snapshot();
    const res = Battle.applyWin(pts.total);
    const after = res.snap;

    // 攻撃が入った場合
    const attackText = res.attack ? `\n敵の攻撃：-${res.attack.damage}（2局ごと）` : "";

    // 結果ダイアログ内容
    const title = "和了（ツモ）";
    const sub = `STAGE ${before.stage} → ${after.stage}`;
    const scoreText =
      `役：${han}翻 ${fu}符\n` +
      (pts.limitName ? `区分：${pts.limitName}\n` : "") +
      `合計点：${pts.total}`;

    const battleText =
      `与ダメージ：${pts.total}\n` +
      `敵HP：${before.enemyHp} → ${after.enemyHp}\n` +
      `自分HP：${before.playerHp} → ${after.playerHp}` +
      attackText;

    // ログにも残す
    log("=== 和了（ツモ） ===");
    for (const y of yakuInfo.yaku) log(`- ${y.name}：${y.han}翻`);
    log(`合計：${han}翻 / ${fu}符 / 点=${pts.total}`);
    log(`ダメージ：${pts.total}（敵HP ${before.enemyHp} → ${after.enemyHp}）`);
    if (res.attack) log(`敵の攻撃：-${res.attack.damage}（自分HP ${before.playerHp} → ${after.playerHp}）`);
    if (res.killed) log(`敵撃破：STAGE ${after.stage} / 次の敵HP ${after.enemyHp}`);

    endHand();
    render();

    openResultDialog({
      title,
      sub,
      handTiles: MahHack.sortTiles(tiles),
      doraTiles: state.doraTiles,
      uraDoraTiles: state.uraDoraTiles,
      yakuList: yakuInfo.yaku,
      scoreText,
      battleText,
    });
  }

  function resolveRyukyoku() {
    const waits = MahHack.winningTilesFor13(state.hand);
    const isTenpai = waits.length > 0;

    const before = Battle.snapshot();
    const res = Battle.applyRyukyoku(isTenpai);
    const after = res.snap;

    const attackText = res.attack ? `\n敵の攻撃：-${res.attack.damage}（2局ごと）` : "";
    const title = "流局";
    const sub = isTenpai ? `テンパイ（待ち：${waits.join(" ")}）` : "ノーテン";
    const scoreText = `ペナルティ：-${res.penalty}`;
    const battleText =
      `自分HP：${before.playerHp} → ${after.playerHp}` + attackText + `\n` +
      `敵HP：${before.enemyHp}（変化なし）`;

    log("=== 流局 ===");
    log(sub);
    log(`ペナルティ：-${res.penalty}（自分HP ${before.playerHp} → ${after.playerHp}）`);
    if (res.attack) log(`敵の攻撃：-${res.attack.damage}（2局ごと）`);

    endHand();
    render();

    openResultDialog({
      title,
      sub,
      handTiles: MahHack.sortTiles(state.hand),
      doraTiles: state.doraTiles,
      uraDoraTiles: [],
      yakuList: [],
      scoreText,
      battleText,
    });
  }

  btnNew.addEventListener("click", () => {
    Battle.initBattle();
    renderBattleHud();
    startNextHand(true);
  });
  btnWin.addEventListener("click", win);
  btnRiichi.addEventListener("click", declareRiichi);
  btnAnkan.addEventListener("click", ankan);

  function declareRiichi() {
    if (!canRiichiNow()) return;

    const isDouble = (state.draws === 1 && state.discards.length === 0);
    state.riichi = !isDouble;
    state.doubleRiichi = isDouble;
    state.riichiTurnLocked = true;

    log(isDouble ? "ダブルリーチ宣言（捨て牌で成立判定）" : "リーチ宣言（捨て牌で成立判定）");
    render();
  }

  // 初期表示
  renderBattleHud();
  log("「新規開始」を押してください。");
})();
