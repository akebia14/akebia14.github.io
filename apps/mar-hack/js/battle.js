(() => {
  const BASE_HP = 8000;
  const HEAL_ON_CLEAR = 10000;
  const ATK_BASE = 5000;

  function randEnemyImg() {
    const n = String(Math.floor(Math.random() * 16) + 1).padStart(3, "0");
    return `./enemy/enemy${n}.png`;
  }

  let b = null;

  function initBattle() {
    b = {
      stage: 1,
      playerHp: 25000,
      enemyMaxHp: BASE_HP,
      enemyHp: BASE_HP,
      enemyImg: randEnemyImg(),
      hands: 0,
    };
    return snapshot();
  }

  function snapshot() {
    if (!b) return null;
    const base = ATK_BASE * b.stage;
    return {
      ...b,
      atkMin: Math.floor(base * 0.8),
      atkMax: Math.floor(base * 1.2),
      nextAtkIn: 2 - (b.hands % 2),
    };
  }

  function onHandEnd() {
    b.hands++;
    if (b.hands % 2 !== 0) return null;
    const dmg = Math.floor((ATK_BASE * b.stage) * (0.8 + Math.random() * 0.4));
    b.playerHp -= dmg;
    return dmg;
  }

  function applyWin(dmg) {
    b.enemyHp -= dmg;
    let cleared = false;

    if (b.enemyHp <= 0) {
      cleared = true;
      b.stage++;
      b.playerHp += HEAL_ON_CLEAR;
      b.enemyMaxHp = BASE_HP * b.stage;
      b.enemyHp = b.enemyMaxHp;
      b.enemyImg = randEnemyImg();
    }

    const atk = onHandEnd();
    return { snap: snapshot(), atk, cleared };
  }

  function applyLose(penalty) {
    b.playerHp -= penalty;
    const atk = onHandEnd();
    return { snap: snapshot(), atk };
  }

  window.Battle = { initBattle, snapshot, applyWin, applyLose };
})();
