(() => {
  const DEFAULT_PLAYER_HP = 25000;
  const DEFAULT_ENEMY_HP = 8000;

  let battle = null;

  function initBattle() {
    battle = {
      stage: 1,
      playerHp: DEFAULT_PLAYER_HP,
      enemyHp: DEFAULT_ENEMY_HP,
      isEnded: false,
    };
    return snapshot();
  }

  function snapshot() {
    if (!battle) return null;
    return {
      stage: battle.stage,
      playerHp: battle.playerHp,
      enemyHp: battle.enemyHp,
      isEnded: battle.isEnded,
    };
  }

  function applyWin(pointsTotal) {
    if (!battle || battle.isEnded) return snapshot();

    battle.enemyHp -= pointsTotal;

    // 敵撃破 → 次ステージ（敵HPは固定 8000）
    if (battle.enemyHp <= 0) {
      battle.stage += 1;
      battle.enemyHp = DEFAULT_ENEMY_HP;
    }

    return snapshot();
  }

  function applyRyukyoku(isTenpai) {
    if (!battle || battle.isEnded) return snapshot();

    const penalty = isTenpai ? 3000 : 10000;
    battle.playerHp -= penalty;

    if (battle.playerHp <= 0) {
      battle.playerHp = 0;
      battle.isEnded = true;
    }

    return { ...snapshot(), penalty };
  }

  window.Battle = {
    initBattle,
    snapshot,
    applyWin,
    applyRyukyoku,
  };
})();
