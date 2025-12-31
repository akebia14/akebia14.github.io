(() => {
  "use strict";

  /********************
   * DOM
   ********************/
  const handEl = document.getElementById("hand");
  const drawnEl = document.getElementById("drawn");
  const discardEl = document.getElementById("discards");

  const drawCountEl = document.getElementById("drawCount");
  const wallCountEl = document.getElementById("wallCount");

  const btnNew = document.getElementById("btnNew");
  const btnRiichi = document.getElementById("btnRiichi");
  const btnAnkan = document.getElementById("btnAnkan");
  const btnWin = document.getElementById("btnWin");

  // HUD
  const stageEl = document.getElementById("stage");
  const playerHpEl = document.getElementById("playerHp");

  // Enemy UI
  const enemyImg = document.getElementById("enemyImg");
  const enemyInfo = document.getElementById("enemyInfo");
  const enemyHpText = document.getElementById("enemyHpText");
  const enemyHpBar = document.getElementById("enemyHpBar");

  // Dialog
  const resultDialog = document.getElementById("resultDialog");
  const resultTitle = document.getElementById("resultTitle");
  const resultBody = document.getElementById("resultBody");
  const btnResultOk = document.getElementById("btnResultOk");

  const logEl = document.getElementById("log");

  /********************
   * State
   ********************/
  let state = null;
  let gameLocked = false; // ダイアログ中ロック

  /********************
   * Utils
   ********************/
  function log(msg) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }

  function renderTiles(el, tiles) {
    el.innerHTML = "";
    tiles.forEach(t => {
      const img = document.createElement("img");
      img.src = `./tiles/${t}.png`;
      img.dataset.tile = t;
      el.appendChild(img);
    });
  }

  /********************
   * Render
   ********************/
  function render() {
    const snap = Battle.snapshot();
    if (!snap) return;

    // ===== Enemy UI =====
    enemyImg.src = snap.enemyImg;
    enemyInfo.textContent =
      `攻撃まであと${snap.nextAtkIn}ターン（${snap.atkMin}～${snap.atkMax}）`;

    enemyHpText.textContent =
      `${Math.max(0, snap.enemyHp)} / ${snap.enemyMaxHp}`;

    enemyHpBar.style.width =
      `${Math.max(0, snap.enemyHp) / snap.enemyMaxHp * 100}%`;

    // ===== HUD =====
    stageEl.textContent = snap.stage;
    playerHpEl.textContent = snap.playerHp;

    // ===== Mahjong UI =====
    renderTiles(handEl, state.hand);
    renderTiles(drawnEl, state.drawn ? [state.drawn] : []);
    renderTiles(discardEl, state.discards);

    drawCountEl.textContent =
      `ツモ ${state.drawCount} / ${state.maxDraw}（残り ${state.maxDraw - state.drawCount}）`;

    wallCountEl.textContent = `山 ${state.wall.length}`;

    btnRiichi.disabled = state.riichi || !state.canRiichi;
    btnWin.disabled = !state.canWin;
  }

  /********************
   * Game Control
   ********************/
  function newGame() {
    state = MahHack.newGame({
      maxDraw: 30,
      mangan30fu4han: document.getElementById("optMangan30fu4han").checked
    });

    Battle.initBattle();

    gameLocked = false;
    logEl.textContent = "";
    log("=== NEW GAME ===");

    draw();
    render();
  }

  function draw() {
    if (gameLocked) return;
    if (state.drawCount >= state.maxDraw) {
      onRyuukyoku();
      return;
    }

    state.drawn = state.wall.pop();
    state.drawCount++;
    render();
  }

  function discard(tile) {
    if (gameLocked) return;
    if (state.riichi && tile !== state.drawn) return;

    state.discards.push(tile);

    if (tile === state.drawn) {
      state.drawn = null;
    } else {
      const i = state.hand.indexOf(tile);
      state.hand.splice(i, 1);
    }

    state.hand = MahHack.sortTiles(state.hand);

    setTimeout(draw, 200);
    render();
  }

  function onWin() {
    if (gameLocked) return;

    const winResult = MahHack.calcWin(state);
    const damage = winResult.totalPoints;

    const result = Battle.applyWin(damage);
    gameLocked = true;

    render();

    if (result.snap.playerHp <= 0) {
      showGameOver(result.snap);
      return;
    }

    showResultDialog(winResult, result);
  }

  function onRyuukyoku() {
    if (gameLocked) return;

    const penalty = state.isTenpai ? 3000 : 10000;
    const result = Battle.applyLose(penalty);

    gameLocked = true;
    render();

    if (result.snap.playerHp <= 0) {
      showGameOver(result.snap);
      return;
    }

    showResultDialog(null, result, penalty);
  }

  /********************
   * Dialogs
   ********************/
  function showResultDialog(winResult, battleResult, penalty = 0) {
    resultTitle.textContent = winResult ? "和了" : "流局";

    let text = "";

    if (winResult) {
      text += `点数: ${winResult.totalPoints}\n`;
      text += `敵ダメージ: ${winResult.totalPoints}\n`;
    } else {
      text += `自分ダメージ: ${penalty}\n`;
    }

    if (battleResult.atk) {
      text += `敵の反撃: ${battleResult.atk}\n`;
    }

    if (battleResult.cleared) {
      text += `\nSTAGE CLEAR!\nHP +10000`;
    }

    resultBody.textContent = text;

    resultDialog.showModal();

    btnResultOk.onclick = () => {
      resultDialog.close();
      gameLocked = false;
      state = MahHack.nextHand(state);
      draw();
      render();
    };
  }

  function showGameOver(snap) {
    resultTitle.textContent = "GAME OVER";
    resultBody.textContent = `到達ステージ: ${snap.stage}`;

    resultDialog.showModal();

    btnResultOk.onclick = () => {
      resultDialog.close();
      newGame();
    };
  }

  /********************
   * Events
   ********************/
  handEl.addEventListener("click", e => {
    if (!e.target.dataset.tile) return;
    discard(e.target.dataset.tile);
  });

  drawnEl.addEventListener("click", e => {
    if (!e.target.dataset.tile) return;
    discard(e.target.dataset.tile);
  });

  btnWin.onclick = onWin;
  btnNew.onclick = newGame;

})();
