/* mahjong.js
 * 目的：手牌の和了形判定・一部役判定・符/翻/点数（上限含む）・ドラ処理
 * 前提：門前のみ、ツモのみ、鳴き/カンなし
 *
 * 参考（ルール出典）：
 * - Dora（ドラ表示→次牌がドラ）：https://riichi.wiki/Dora  :contentReference[oaicite:4]{index=4}
 * - Fu（符の概念/基礎）：https://riichi.wiki/Fu :contentReference[oaicite:5]{index=5}
 * - Pinfuツモ20符：https://majandofu.com/en-mahjong-fu-points （2024-06-12）:contentReference[oaicite:6]{index=6}
 * - 点数上限（満貫〜数え役満）：https://riichi.wiki/Japanese_mahjong_scoring_rules / https://riichi.wiki/Scoring_table :contentReference[oaicite:7]{index=7}
 * - 30符4翻を満貫扱い（オプション言及）：https://en.wikipedia.org/wiki/Japanese_mahjong_scoring_rules :contentReference[oaicite:8]{index=8}
 */

(() => {
  const SUITS = ["m", "p", "s"];
  const WINDS = ["東", "南", "西", "北"];
  const DRAGONS = ["白", "發", "中"];

  function isSuit(t) { return typeof t === "string" && t.length === 2 && SUITS.includes(t[1]); }
  function isHonor(t) { return WINDS.includes(t) || DRAGONS.includes(t); }
  function tileKey(t) { return t; }

  function sortTiles(tiles) {
    const order = (t) => {
      if (isSuit(t)) {
        const n = parseInt(t[0], 10);
        const s = t[1];
        const suitBase = s === "m" ? 0 : s === "p" ? 20 : 40;
        return suitBase + n;
      }
      if (WINDS.includes(t)) return 80 + WINDS.indexOf(t);
      return 90 + DRAGONS.indexOf(t);
    };
    return [...tiles].sort((a, b) => order(a) - order(b));
  }

  function countTiles(tiles) {
    const m = new Map();
    for (const t of tiles) m.set(tileKey(t), (m.get(tileKey(t)) || 0) + 1);
    return m;
  }

  // ドラ：表示牌の次牌（数牌は9→1、風牌は東→南→西→北→東、三元は白→發→中→白）
  function nextDoraFromIndicator(ind) {
    if (isSuit(ind)) {
      const n = parseInt(ind[0], 10);
      const s = ind[1];
      const next = n === 9 ? 1 : n + 1;
      return `${next}${s}`;
    }
    if (WINDS.includes(ind)) {
      return WINDS[(WINDS.indexOf(ind) + 1) % 4];
    }
    if (DRAGONS.includes(ind)) {
      return DRAGONS[(DRAGONS.indexOf(ind) + 1) % 3];
    }
    throw new Error("unknown indicator: " + ind);
  }

  function doraCount(tiles, doraTile) {
    return tiles.reduce((acc, t) => acc + (t === doraTile ? 1 : 0), 0);
  }

  // ===== 和了形判定（門前・ツモのみ） =====

  function isChiitoitsu(counts) {
    let pairs = 0;
    for (const v of counts.values()) {
      if (v === 2) pairs++;
      else if (v === 0) continue;
      else return false;
    }
    return pairs === 7;
  }

  function isKokushi(tiles) {
    // 1&9 of each suit + 7 honors = 13種。そこにどれか1枚重複で14枚
    const need = new Set([
      "1m","9m","1p","9p","1s","9s",
      "東","南","西","北","白","發","中"
    ]);
    const set = new Set(tiles);
    if (![...need].every(x => set.has(x))) return false;
    // どれか1種が2枚以上
    const counts = countTiles(tiles);
    let hasPair = false;
    for (const k of need) {
      if ((counts.get(k) || 0) >= 2) { hasPair = true; break; }
    }
    return hasPair;
  }

  // 標準形：4面子+雀頭（順子/刻子のみ、カンなし）
  function canFormMentsu(counts) {
    // countsはMap。破壊的に操作するのでコピーして扱う。
    const keys = sortTiles([...counts.keys()]);
    const get = (k) => counts.get(k) || 0;
    const dec = (k, n) => counts.set(k, get(k) - n);

    // 次に残っている最小牌を探す
    let nextKey = null;
    for (const k of keys) {
      if (get(k) > 0) { nextKey = k; break; }
    }
    if (!nextKey) return true; // 全消しOK

    // 刻子
    if (get(nextKey) >= 3) {
      dec(nextKey, 3);
      if (canFormMentsu(counts)) return true;
      dec(nextKey, -3);
    }

    // 順子（数牌のみ）
    if (isSuit(nextKey)) {
      const n = parseInt(nextKey[0], 10);
      const s = nextKey[1];
      if (n <= 7) {
        const k2 = `${n+1}${s}`;
        const k3 = `${n+2}${s}`;
        if (get(k2) > 0 && get(k3) > 0) {
          dec(nextKey, 1); dec(k2, 1); dec(k3, 1);
          if (canFormMentsu(counts)) return true;
          dec(nextKey, -1); dec(k2, -1); dec(k3, -1);
        }
      }
    }

    return false;
  }

  function isStandardAgari(tiles) {
    const counts = countTiles(tiles);
    // 雀頭候補を総当たり
    for (const [k, v] of counts.entries()) {
      if (v >= 2) {
        const c2 = new Map(counts);
        c2.set(k, v - 2);
        if (canFormMentsu(c2)) return true;
      }
    }
    return false;
  }

  function isAgari(tiles) {
    if (tiles.length !== 14) return false;
    if (isKokushi(tiles)) return true;
    const counts = countTiles(tiles);
    if (isChiitoitsu(counts)) return true;
    return isStandardAgari(tiles);
  }

  // ===== 役判定（MVP: 一部のみ） =====

  function isTanyao(tiles) {
    // 2-8のみ（数牌のみ）
    for (const t of tiles) {
      if (!isSuit(t)) return false;
      const n = parseInt(t[0], 10);
      if (n === 1 || n === 9) return false;
    }
    return true;
  }

  function suitType(tiles) {
    // 混一色/清一色判定に使う
    const suits = new Set();
    let hasHonor = false;
    for (const t of tiles) {
      if (isSuit(t)) suits.add(t[1]);
      else hasHonor = true;
    }
    return { suits, hasHonor };
  }

  function isChinitsu(tiles) {
    const { suits, hasHonor } = suitType(tiles);
    return suits.size === 1 && !hasHonor;
  }

  function isHonitsu(tiles) {
    const { suits, hasHonor } = suitType(tiles);
    return suits.size === 1 && hasHonor;
  }

  function isToitoi(tiles) {
    // 標準形で、4面子が全部刻子であるかを判定（簡易：順子が組めるなら除外）
    // 厳密には分解が必要だが、MVPとしては「標準形の分解探索で順子を使わず成功するか」を見る
    if (!isStandardAgari(tiles)) return false;
    const counts0 = countTiles(tiles);
    // 雀頭候補総当たりで「刻子のみ」で面子が作れるか
    for (const [k, v] of counts0.entries()) {
      if (v >= 2) {
        const counts = new Map(counts0);
        counts.set(k, v - 2);
        if (canFormKoutsuOnly(counts)) return true;
      }
    }
    return false;
  }

  function canFormKoutsuOnly(counts) {
    const keys = sortTiles([...counts.keys()]);
    const get = (k) => counts.get(k) || 0;
    const dec = (k, n) => counts.set(k, get(k) - n);

    let nextKey = null;
    for (const k of keys) {
      if (get(k) > 0) { nextKey = k; break; }
    }
    if (!nextKey) return true;

    if (get(nextKey) >= 3) {
      dec(nextKey, 3);
      if (canFormKoutsuOnly(counts)) return true;
      dec(nextKey, -3);
    }
    return false;
  }

  function isSanankou(tiles) {
    // 鳴きなし＝すべて暗刻扱い。標準形分解で刻子が3つ以上なら成立（簡易）
    if (!isStandardAgari(tiles)) return false;
    const counts0 = countTiles(tiles);

    for (const [pairKey, v] of counts0.entries()) {
      if (v < 2) continue;
      const counts = new Map(counts0);
      counts.set(pairKey, v - 2);
      const res = countKoutsuInAnyDecomp(counts);
      if (res >= 3) return true;
    }
    return false;
  }

  function countKoutsuInAnyDecomp(counts) {
    // 可能な分解のうち、刻子数最大を返す（小規模なのでDFS）
    const keys = sortTiles([...counts.keys()]);
    const get = (k) => counts.get(k) || 0;
    const dec = (k, n) => counts.set(k, get(k) - n);

    let nextKey = null;
    for (const k of keys) {
      if (get(k) > 0) { nextKey = k; break; }
    }
    if (!nextKey) return 0;

    let best = -Infinity;

    // 刻子
    if (get(nextKey) >= 3) {
      dec(nextKey, 3);
      best = Math.max(best, 1 + countKoutsuInAnyDecomp(counts));
      dec(nextKey, -3);
    }

    // 順子
    if (isSuit(nextKey)) {
      const n = parseInt(nextKey[0], 10);
      const s = nextKey[1];
      if (n <= 7) {
        const k2 = `${n+1}${s}`, k3 = `${n+2}${s}`;
        if (get(k2) > 0 && get(k3) > 0) {
          dec(nextKey, 1); dec(k2, 1); dec(k3, 1);
          best = Math.max(best, 0 + countKoutsuInAnyDecomp(counts));
          dec(nextKey, -1); dec(k2, -1); dec(k3, -1);
        }
      }
    }

    return best === -Infinity ? -Infinity : best;
  }

  function isIipeikou(tiles) {
    // 門前のみ。標準形分解で同一順子が1組以上あれば成立（簡易）
    if (!isStandardAgari(tiles)) return false;
    const counts0 = countTiles(tiles);
    for (const [pairKey, v] of counts0.entries()) {
      if (v < 2) continue;
      const counts = new Map(counts0);
      counts.set(pairKey, v - 2);
      const seqs = collectSequencesFromAnyDecomp(counts);
      if (!seqs) continue;
      const m = new Map();
      for (const s of seqs) m.set(s, (m.get(s) || 0) + 1);
      for (const c of m.values()) if (c >= 2) return true;
    }
    return false;
  }

  function collectSequencesFromAnyDecomp(counts) {
    // 1つでも分解できたら、その分解での順子一覧を返す（簡易）
    const keys = sortTiles([...counts.keys()]);
    const get = (k) => counts.get(k) || 0;
    const dec = (k, n) => counts.set(k, get(k) - n);

    let nextKey = null;
    for (const k of keys) { if (get(k) > 0) { nextKey = k; break; } }
    if (!nextKey) return [];

    // 刻子優先→順子の順で探索（MVP）
    if (get(nextKey) >= 3) {
      dec(nextKey, 3);
      const r = collectSequencesFromAnyDecomp(counts);
      if (r) { dec(nextKey, -3); return r; }
      dec(nextKey, -3);
    }
    if (isSuit(nextKey)) {
      const n = parseInt(nextKey[0], 10), s = nextKey[1];
      if (n <= 7) {
        const k2 = `${n+1}${s}`, k3 = `${n+2}${s}`;
        if (get(k2) > 0 && get(k3) > 0) {
          dec(nextKey, 1); dec(k2, 1); dec(k3, 1);
          const r = collectSequencesFromAnyDecomp(counts);
          if (r) { dec(nextKey, -1); dec(k2, -1); dec(k3, -1); return [`${n}${s}${n+1}${s}${n+2}${s}`, ...r]; }
          dec(nextKey, -1); dec(k2, -1); dec(k3, -1);
        }
      }
    }
    return null;
  }

  function detectYaku(tiles, ctx) {
    // ctx: { tsumo: true, doraTile, optMangan30fu4han }
    const yaku = [];
    let yakuman = 0;

    if (isKokushi(tiles)) {
      yakuman += 1;
      yaku.push({ name: "国士無双", han: 13, yakuman: true });
      return { yaku, han: 13, yakuman, dora: doraCount(tiles, ctx.doraTile) };
    }

    const counts = countTiles(tiles);

    if (isChiitoitsu(counts)) {
      yaku.push({ name: "七対子", han: 2 });
    }

    // 門前ツモ（鳴きなし固定なので常に門前）
    if (ctx.tsumo) yaku.push({ name: "門前清自摸和", han: 1 });

    if (isTanyao(tiles)) yaku.push({ name: "断么九", han: 1 });

    if (isHonitsu(tiles)) yaku.push({ name: "混一色", han: 3 }); // 門前
    if (isChinitsu(tiles)) yaku.push({ name: "清一色", han: 6 }); // 門前

    if (isToitoi(tiles)) yaku.push({ name: "対々和", han: 2 });
    if (isSanankou(tiles)) yaku.push({ name: "三暗刻", han: 2 });

    if (isIipeikou(tiles)) yaku.push({ name: "一盃口", han: 1 });

    const dora = doraCount(tiles, ctx.doraTile);
    if (dora > 0) yaku.push({ name: "ドラ", han: dora, isDora: true });

    const han = yaku.reduce((a, x) => a + (x.isDora ? 0 : x.han), 0) + dora;

    return { yaku, han, yakuman, dora };
  }

  // ===== 符計算（MVP：門前ツモのみ、七対子=25符、ピンフツモ=20符、その他は簡易） =====
  function calcFu(tiles, yakuInfo, ctx) {
    const names = new Set(yakuInfo.yaku.map(x => x.name));
    const counts = countTiles(tiles);

    if (isChiitoitsu(counts)) return 25;

    // ピンフ（簡易判定：一盃口等とは独立。ここでは“完全ピンフ”の厳密待ち判定は未実装）
    // MVP上は「面子が順子のみ」かつ「雀頭が役牌でない」ならピンフ扱いにします。
    // ※厳密には待ち形（両面待ち）等が必要。
    const pinfu = isPinfuApprox(tiles);
    if (pinfu && ctx.tsumo) return 20; // 出典：麻雀豆腐 :contentReference[oaicite:9]{index=9}

    // 基本：20符 + ツモ2符（門前ツモ）
    let fu = 20;
    if (ctx.tsumo) fu += 2;

    // 面子・待ち・雀頭の加符はMVPでは未実装（追加予定ポイント）
    // 端数切り上げ（10符単位）
    fu = Math.ceil(fu / 10) * 10;
    return fu;
  }

  function isPinfuApprox(tiles) {
    if (!isStandardAgari(tiles)) return false;
    const counts0 = countTiles(tiles);

    // どれか1分解で「刻子なし」かつ「雀頭が役牌でない」ならOK（近似）
    for (const [pairKey, v] of counts0.entries()) {
      if (v < 2) continue;
      if (isHonor(pairKey)) return false; // 役牌判定は厳密には場風/自風/三元。MVPは「字牌雀頭をNG」にして安全側。
      const counts = new Map(counts0);
      counts.set(pairKey, v - 2);
      if (canFormShuntsuOnly(counts)) return true;
    }
    return false;
  }

  function canFormShuntsuOnly(counts) {
    const keys = sortTiles([...counts.keys()]);
    const get = (k) => counts.get(k) || 0;
    const dec = (k, n) => counts.set(k, get(k) - n);

    let nextKey = null;
    for (const k of keys) { if (get(k) > 0) { nextKey = k; break; } }
    if (!nextKey) return true;

    if (!isSuit(nextKey)) return false;
    const n = parseInt(nextKey[0], 10), s = nextKey[1];
    if (n > 7) return false;

    const k2 = `${n+1}${s}`, k3 = `${n+2}${s}`;
    if (get(k2) > 0 && get(k3) > 0) {
      dec(nextKey, 1); dec(k2, 1); dec(k3, 1);
      const ok = canFormShuntsuOnly(counts);
      dec(nextKey, -1); dec(k2, -1); dec(k3, -1);
      return ok;
    }
    return false;
  }

  // ===== 点数（基本点→合計点）。MVPは「親子/供託/本場なし」、表示は“合計点”のみ =====
  function calcPoints(han, fu, optMangan30fu4han) {
    // 役満/数え役満は別処理（ここは通常手）
    // 参考：riichi.wiki scoring :contentReference[oaicite:10]{index=10}

    // 満貫以上（翻数ベース）
    let limitName = null;
    let basePoints = null; // basic points

    if (han >= 13) { limitName = "数え役満"; basePoints = 8000; }
    else if (han >= 11) { limitName = "三倍満"; basePoints = 6000; }
    else if (han >= 8) { limitName = "倍満"; basePoints = 4000; }
    else if (han >= 6) { limitName = "跳満"; basePoints = 3000; }
    else if (han >= 5) { limitName = "満貫"; basePoints = 2000; }
    else {
      // 通常：fu * 2^(2+han)
      const calc = fu * Math.pow(2, 2 + han);
      // 満貫切り上げ：2000超なら満貫
      if (calc >= 2000) { limitName = "満貫"; basePoints = 2000; }
      else {
        // ユーザー仕様：30符4翻を満貫扱い
        // （一般には1920 basic points で満貫未満の場合がある、という言及あり）:contentReference[oaicite:11]{index=11}
        if (optMangan30fu4han && han === 4 && fu === 30) { limitName = "満貫"; basePoints = 2000; }
        else { basePoints = calc; }
      }
    }

    // MVPは「ツモ合計点」を  (基本点*2)*3 のような分配はせず、便宜的に“基礎点×4”を表示します。
    // 後で敵ダメージに使う前提なら、ここは自由に設計しやすいので単一スカラーにしています。
    const total = Math.ceil(basePoints) * 4;

    return { limitName, basePoints: Math.ceil(basePoints), total };
  }

  // 公開API
  window.MahHack = {
    sortTiles,
    countTiles,
    isAgari,
    detectYaku,
    calcFu,
    calcPoints,
    nextDoraFromIndicator,
    doraCount,
    isKokushi,
  };
})();
