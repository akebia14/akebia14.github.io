(() => {
  const DEFAULT_PLAYER_HP = 25000;
  const BASE_ENEMY_HP = 8000;

  // 2局ごとに攻撃
  const ATTACK_EVERY_HANDS = 2;
  const BASE_ATTACK = 5000; // stage倍率が掛かる
  const ATTACK_RANDOM_MIN = 0.8;
  const ATTACK_RANDOM_MAX = 1.2;

  let battle = null;

  function enemyHpForStage(stage) {
    return BASE_ENEMY_HP * stage;
  }

  function enemyAtkForStage(stage) {
    return BASE_ATTACK * stage;
  }

  function randInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function initBattle() {
    battle = {
      stage: 1,
      playerHp: DEFAULT_PLAYER_HP,
      enemyHp: enemyHpForStage(1),
      handsPlayed: 0,
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
      enemyAtk: enemyAtkForStage(battle.stage),
      handsPlayed: battle.handsPlayed,
      isEnded: battle.isEnded,
      nextAttackIn: ATTACK_EVERY_HANDS - (battle.handsPlayed % ATTACK_EVERY_HANDS || ATTACK_EVERY_HANDS),
    };
  }

  function applyWin(pointsTotal) {
    if (!battle || battle.isEnded) return { snap: snapshot(), attack: null, killed: false };

    battle.enemyHp -= pointsTotal;

    let killed = false;
    if (battle.enemyHp <= 0) {
      killed = true;
      battle.stage += 1;
      battle.enemyHp = enemyHpForStage(battle.stage);
    }

    const attack = finalizeHandAndMaybeAttack();
    return { snap: snapshot(), attack, killed };
  }

  function applyRyukyoku(isTenpai) {
    if (!battle || battle.isEnded) return { snap: snapshot(), penalty: 0, attack: null };

    const penalty = isTenpai ? 3000 : 10000;
    battle.playerHp -= penalty;
    if (battle.playerHp <= 0) {
      battle.playerHp = 0;
      battle.isEnded = true;
      return { snap: snapshot(), penalty, attack: null };
    }

    const attack = finalizeHandAndMaybeAttack();
    return { snap: snapshot(), penalty, attack };
  }

  function finalizeHandAndMaybeAttack() {
    // 局終了
    battle.handsPlayed += 1;

    // 2局ごとに攻撃
    if (battle.handsPlayed % ATTACK_EVERY_HANDS !== 0) return null;

    const base = enemyAtkForStage(battle.stage);
    const min = Math.floor(base * ATTACK_RANDOM_MIN);
    const max = Math.floor(base * ATTACK_RANDOM_MAX);
    const dmg = randInt(min, max);

    battle.playerHp -= dmg;
    if (battle.playerHp <= 0) {
      battle.playerHp = 0;
      battle.isEnded = true;
    }
    return { damage: dmg };
  }

  window.Battle = {
    initBattle,
    snapshot,
    applyWin,
    applyRyukyoku,
  };
})();
