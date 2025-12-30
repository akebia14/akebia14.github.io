/* mahjong.js (solo-riichi MVP+)
 * 対応：暗槓 / 嶺上 / カンドラ / 裏ドラ / リーチ / ダブルリーチ / 一発
 * 役：ユーザー指定リスト（ただしロン系はソロ進行ではイベントが発生しない）
 *
 * ※このファイルはユーザー貼付の版をベースに、以下を修正：
 * - リーチとダブルリーチを排他的に（ダブリー時に立直を重ねない）
 * - 一発（ctx.ippatsu）を1翻で追加
 * - 三色同順の誤検出を防ぐため、順子の「開始数字×色」の集合で厳密判定
 */

(() => {
  const SUITS = ["m", "p", "s"];
  const WINDS = ["東", "南", "西", "北"];
  const DRAGONS = ["白", "發", "中"];

  const isSuit = (t) => typeof t === "string" && t.length === 2 && SUITS.includes(t[1]);
  const isHonor = (t) => WINDS.includes(t) || DRAGONS.includes(t);

  const tileOrder = (t) => {
    if (isSuit(t)) {
      const n = parseInt(t[0], 10);
      const s = t[1];
      const base = s === "m" ? 0 : s === "p" ? 20 : 40;
      return base + n;
    }
    if (WINDS.includes(t)) return 80 + WINDS.indexOf(t);
    return 90 + DRAGONS.indexOf(t);
  };

  const sortTiles = (tiles) => [...tiles].sort((a, b) => tileOrder(a) - tileOrder(b));

  const countTiles = (tiles) => {
    const m = new Map();
    for (const t of tiles) m.set(t, (m.get(t) || 0) + 1);
    return m;
  };

  // Dora: indicator next tile
  const nextDoraFromIndicator = (ind) => {
    if (isSuit(ind)) {
      const n = parseInt(ind[0], 10);
      const s = ind[1];
      return `${n === 9 ? 1 : n + 1}${s}`;
    }
    if (WINDS.includes(ind)) return WINDS[(WINDS.indexOf(ind) + 1) % 4];
    if (DRAGONS.includes(ind)) return DRAGONS[(DRAGONS.indexOf(ind) + 1) % 3];
    throw new Error("Unknown dora indicator: " + ind);
  };

  const doraCount = (tiles, doraTiles) => {
    const set = new Map();
    for (const d of doraTiles) set.set(d, (set.get(d) || 0) + 1);
    let c = 0;
    for (const t of tiles) c += (set.get(t) || 0);
    return c;
  };

  // ======= Agari core (find decompositions) =======
  const TERMINALS = new Set(["1m","9m","1p","9p","1s","9s"]);
  const GREEN_TILES = new Set(["2s","3s","4s","6s","8s","發"]);

  const isKokushi = (tiles) => {
    const need = new Set([
      "1m","9m","1p","9p","1s","9s",
      "東","南","西","北","白","發","中"
    ]);
    const set = new Set(tiles);
    if (![...need].every(x => set.has(x))) return false;
    const counts = countTiles(tiles);
    return [...need].some(k => (counts.get(k) || 0) >= 2);
  };

  const isChiitoitsu = (tiles) => {
    const counts = countTiles(tiles);
    let pairs = 0;
    for (const v of counts.values()) {
      if (v === 2) pairs++;
      else return false;
    }
    return pairs === 7;
  };

  // Standard form decompositions: 4 melds + pair
  // meld = { type: 'seq'|'trip'|'quad', tiles:[...] }
  function* decomposeMelds(counts) {
    const keys = sortTiles([...counts.keys()]);
    const get = (k) => counts.get(k) || 0;

    let next = null;
    for (const k of keys) { if (get(k) > 0) { next = k; break; } }
    if (!next) { yield []; return; }

    // trip
    if (get(next) >= 3) {
      const c2 = new Map(counts);
      c2.set(next, get(next) - 3);
      for (const rest of decomposeMelds(c2)) {
        yield [{ type: "trip", tiles: [next, next, next] }, ...rest];
      }
    }

    // quad
    if (get(next) >= 4) {
      const c2 = new Map(counts);
      c2.set(next, get(next) - 4);
      for (const rest of decomposeMelds(c2)) {
        yield [{ type: "quad", tiles: [next, next, next, next] }, ...rest];
      }
    }

    // seq
    if (isSuit(next)) {
      const n = parseInt(next[0], 10);
      const s = next[1];
      if (n <= 7) {
        const k2 = `${n + 1}${s}`;
        const k3 = `${n + 2}${s}`;
        if ((get(k2) || 0) > 0 && (get(k3) || 0) > 0) {
          const c2 = new Map(counts);
          c2.set(next, get(next) - 1);
          c2.set(k2, (c2.get(k2) || 0) - 1);
          c2.set(k3, (c2.get(k3) || 0) - 1);
          for (const rest of decomposeMelds(c2)) {
            yield [{ type: "seq", tiles: [next, k2, k3] }, ...rest];
          }
        }
      }
    }
  }

  const standardDecomps = (tiles) => {
    const counts0 = countTiles(tiles);
    const out = [];
    for (const [k, v] of counts0.entries()) {
      if (v >= 2) {
        const counts = new Map(counts0);
        counts.set(k, v - 2);
        for (const melds of decomposeMelds(counts)) {
          if (melds.length === 4) out.push({ pair: [k, k], melds });
        }
      }
    }
    return out;
  };

  const isAgari = (tiles) => {
    if (tiles.length !== 14) return false;
    if (isKokushi(tiles)) return true;
    if (isChiitoitsu(tiles)) return true;
    return standardDecomps(tiles).length > 0;
  };

  // tenpai: winning tiles for 13-tile hand
  const allTileTypes = () => {
    const a = [];
    for (const s of SUITS) for (let n = 1; n <= 9; n++) a.push(`${n}${s}`);
    for (const h of [...WINDS, ...DRAGONS]) a.push(h);
    return a;
  };

  const winningTilesFor13 = (tiles13) => {
    if (tiles13.length !== 13) return [];
    const res = [];
    const counts = countTiles(tiles13);
    for (const t of allTileTypes()) {
      if ((counts.get(t) || 0) >= 4) continue;
      const cand = sortTiles([...tiles13, t]);
      if (isAgari(cand)) res.push(t);
    }
    return res;
  };

  // ======= Yaku detection =======
  const isTanyao = (tiles) => tiles.every(t => isSuit(t) && !["1","9"].includes(t[0]));
  const isHonitsu = (tiles) => {
    const suits = new Set();
    let honors = 0;
    for (const t of tiles) {
      if (isSuit(t)) suits.add(t[1]); else honors++;
    }
    return suits.size === 1 && honors > 0;
  };
  const isChinitsu = (tiles) => {
    const suits = new Set();
    for (const t of tiles) { if (!isSuit(t)) return false; suits.add(t[1]); }
    return suits.size === 1;
  };

  const isChanta = (decomp) => {
    const groups = [...decomp.melds.map(m => m.tiles), decomp.pair];
    const hasHonor = groups.flat().some(isHonor);
    if (!hasHonor) return false;
    const okEach = (g) => g.some(t => isHonor(t) || TERMINALS.has(t));
    return groups.every(okEach);
  };

  const isJunchan = (decomp) => {
    const groups = [...decomp.melds.map(m => m.tiles), decomp.pair];
    if (groups.flat().some(isHonor)) return false;
    const okEach = (g) => g.some(t => TERMINALS.has(t));
    return groups.every(okEach);
  };

  const isToitoi = (decomp) => decomp.melds.every(m => m.type === "trip" || m.type === "quad");
  const isSanankou = (decomp) => {
    const koutsu = decomp.melds.filter(m => m.type === "trip" || m.type === "quad").length;
    return koutsu >= 3;
  };

  // ★三色同順（誤検出防止の堅牢版）
  const isSanshokuDoujun = (decomp) => {
    // start number n(1..7) ごとに、存在する色集合を作る
    // 例：n=1 に {m,p,s} が揃っていれば三色同順
    const map = new Map(); // key: n(1..7) -> Set('m'|'p'|'s')
    for (const m of decomp.melds) {
      if (m.type !== "seq") continue;
      const a = m.tiles[0]; // 例: '3s'
      if (!isSuit(a)) continue;
      const n = parseInt(a[0], 10);
      const s = a[1];
      if (n < 1 || n > 7) continue;
      if (!map.has(n)) map.set(n, new Set());
      map.get(n).add(s);
    }
    for (let n = 1; n <= 7; n++) {
      const set = map.get(n);
      if (set && set.has("m") && set.has("p") && set.has("s")) return true;
    }
    return false;
  };

  const isSanshokuDoukou = (decomp) => {
    const trips = decomp.melds
      .filter(m => m.type === "trip" || m.type === "quad")
      .map(m => m.tiles[0]);
    for (let n = 1; n <= 9; n++) {
      const need = new Set([`m`,`p`,`s`]);
      for (const s of ["m","p","s"]) {
        if (trips.includes(`${n}${s}`)) need.delete(s);
      }
      if (need.size === 0) return true;
    }
    return false;
  };

  const isIttsuu = (decomp) => {
    const seqs = decomp.melds.filter(m => m.type === "seq").map(m => m.tiles);
    for (const s of ["m","p","s"]) {
      const a = seqs.some(t => t[0] === `1${s}` && t[1] === `2${s}` && t[2] === `3${s}`);
      const b = seqs.some(t => t[0] === `4${s}` && t[1] === `5${s}` && t[2] === `6${s}`);
      const c = seqs.some(t => t[0] === `7${s}` && t[1] === `8${s}` && t[2] === `9${s}`);
      if (a && b && c) return true;
    }
    return false;
  };

  const countIipeikou = (decomp) => {
    const seqs = decomp.melds.filter(m => m.type === "seq").map(m => m.tiles.join(","));
    const m = new Map();
    for (const k of seqs) m.set(k, (m.get(k) || 0) + 1);
    let pairs = 0;
    for (const v of m.values()) pairs += Math.floor(v / 2);
    return pairs;
  };

  const isShousangen = (decomp) => {
    const trip = new Set(decomp.melds.filter(m => m.type === "trip" || m.type === "quad").map(m => m.tiles[0]));
    const pair = decomp.pair[0];
    const tripDragons = DRAGONS.filter(d => trip.has(d)).length;
    const pairDragon = DRAGONS.includes(pair) ? 1 : 0;
    return tripDragons === 2 && pairDragon === 1;
  };

  // ======= Yakuman patterns =======
  const isDaisangen = (decomp) => {
    const trip = new Set(decomp.melds.filter(m => m.type === "trip" || m.type === "quad").map(m => m.tiles[0]));
    return DRAGONS.every(d => trip.has(d));
  };

  const isSuushi = (decomp) => {
    const trip = new Set(decomp.melds.filter(m => m.type === "trip" || m.type === "quad").map(m => m.tiles[0]));
    const pair = decomp.pair[0];
    const windTrips = WINDS.filter(w => trip.has(w)).length;
    const windPair = WINDS.includes(pair);
    const shousuushii = (windTrips === 3 && windPair);
    const daisuushii = (windTrips === 4);
    return { shousuushii, daisuushii };
  };

  const isTsuuiisou = (tiles) => tiles.every(isHonor);
  const isRyuuiisou = (tiles) => tiles.every(t => GREEN_TILES.has(t));
  const isChinroutou = (tiles) => tiles.every(t => TERMINALS.has(t));
  const isSuuankou = (decomp) => {
    const k = decomp.melds.filter(m => m.type === "trip" || m.type === "quad").length;
    return k === 4;
  };

  const isChuuren = (tiles) => {
    if (!tiles.every(isSuit)) return false;
    const suit = tiles[0][1];
    if (!tiles.every(t => t[1] === suit)) return false;
    const counts = countTiles(tiles);
    const need = new Map([
      [`1${suit}`, 3], [`2${suit}`, 1], [`3${suit}`, 1], [`4${suit}`, 1], [`5${suit}`, 1],
      [`6${suit}`, 1], [`7${suit}`, 1], [`8${suit}`, 1], [`9${suit}`, 3],
    ]);
    for (const [k, v] of need.entries()) {
      if ((counts.get(k) || 0) < v) return false;
    }
    return true;
  };

  const isSuukantsuYakuman = (ctx) => (ctx.kanCount || 0) >= 4;

  // ======= Pinfu =======
  const isYakuhaiTile = (t, ctx) => {
    if (!isHonor(t)) return false;
    if (DRAGONS.includes(t)) return true;
    return t === ctx.seatWind || t === ctx.roundWind;
  };

  const waitTypeFromDecomp = (decomp, winTile) => {
    if (decomp.pair[0] === winTile) return "tanki";

    for (const m of decomp.melds) {
      if (!m.tiles.includes(winTile)) continue;
      if (m.type === "trip" || m.type === "quad") return "shanpon";
      if (m.type === "seq") {
        const a = m.tiles[0], b = m.tiles[1], c = m.tiles[2];
        if (winTile === b) return "kanchan";
        if (a[0] === "1" && winTile === c) return "penchan";
        if (a[0] === "7" && winTile === a) return "penchan";
        return "ryanmen";
      }
    }
    return "unknown";
  };

  const isPinfu = (tiles, ctx) => {
    const winTile = ctx.winTile;
    if (!winTile) return false;

    const decomps = standardDecomps(tiles);
    for (const d of decomps) {
      if (!d.melds.every(m => m.type === "seq")) continue;
      if (isYakuhaiTile(d.pair[0], ctx)) continue;
      const wt = waitTypeFromDecomp(d, winTile);
      if (wt !== "ryanmen") continue;
      return true;
    }
    return false;
  };

  const detectYaku = (tiles, ctx) => {
    const yaku = [];

    // yakuman first
    if (isKokushi(tiles)) {
      yaku.push({ name: "国士無双", han: 13, yakuman: true });
      return { yaku, han: 13, yakumanCount: 1, doraHan: 0, uraDoraHan: 0 };
    }

    let yakumanCount = 0;
    if (ctx.tenhou) { yaku.push({ name: "天和", han: 13, yakuman: true }); yakumanCount++; }
    if (ctx.chiihou) { yaku.push({ name: "地和", han: 13, yakuman: true }); yakumanCount++; }

    const decomps = standardDecomps(tiles);
    if (decomps.length) {
      for (const d of decomps) {
        if (isDaisangen(d)) { yaku.push({ name: "大三元", han: 13, yakuman: true }); yakumanCount++; break; }
      }
      for (const d of decomps) {
        const s = isSuushi(d);
        if (s.daisuushii) { yaku.push({ name: "四喜和（大四喜）", han: 13, yakuman: true }); yakumanCount++; break; }
        if (s.shousuushii) { yaku.push({ name: "四喜和（小四喜）", han: 13, yakuman: true }); yakumanCount++; break; }
      }
      if (yakumanCount === 0 && isSuukantsuYakuman(ctx)) { yaku.push({ name: "四槓子", han: 13, yakuman: true }); yakumanCount++; }
    }
    if (yakumanCount === 0) {
      if (isTsuuiisou(tiles)) { yaku.push({ name: "字一色", han: 13, yakuman: true }); yakumanCount++; }
      if (isRyuuiisou(tiles)) { yaku.push({ name: "緑一色", han: 13, yakuman: true }); yakumanCount++; }
      if (isChinroutou(tiles)) { yaku.push({ name: "清老頭", han: 13, yakuman: true }); yakumanCount++; }
      if (isChuuren(tiles) && ctx.isMenzen) { yaku.push({ name: "九蓮宝燈", han: 13, yakuman: true }); yakumanCount++; }
      if (isChiitoitsu(tiles) === false && decomps.length) {
        for (const d of decomps) {
          if (isSuuankou(d)) { yaku.push({ name: "四暗刻", han: 13, yakuman: true }); yakumanCount++; break; }
        }
      }
    }

    if (yakumanCount > 0) {
      return { yaku, han: 13, yakumanCount, doraHan: 0, uraDoraHan: 0 };
    }

    // regular yaku
    if (ctx.isMenzen && ctx.winType === "tsumo") yaku.push({ name: "門前清自摸和", han: 1 });

    // ★リーチ系は排他（ダブリーなら立直は付けない）
    if (ctx.doubleRiichi) yaku.push({ name: "ダブルリーチ", han: 2 });
    else if (ctx.riichi) yaku.push({ name: "立直", han: 1 });

    // ★一発（app.js側で ctx.ippatsu を渡す）
    if (ctx.ippatsu) yaku.push({ name: "一発", han: 1 });

    if (isTanyao(tiles)) yaku.push({ name: "断ヤオ九", han: 1 });

    if (ctx.haitei && ctx.winType === "tsumo") yaku.push({ name: "海底摸月", han: 1 });
    if (ctx.houtei && ctx.winType === "ron") yaku.push({ name: "河底撈魚", han: 1 });
    if (ctx.rinshan && ctx.winType === "tsumo") yaku.push({ name: "嶺上開花", han: 1 });
    if (ctx.chankan && ctx.winType === "ron") yaku.push({ name: "搶槓", han: 1 });

    if (isChiitoitsu(tiles) && ctx.isMenzen) yaku.push({ name: "七対子", han: 2 });

    if (decomps.length) {
      const hasYakuhai = decomps.some(d => {
        const trip = d.melds.filter(m => m.type === "trip" || m.type === "quad").map(m => m.tiles[0]);
        return trip.some(t => isYakuhaiTile(t, ctx));
      });
      if (hasYakuhai) yaku.push({ name: "翻牌", han: 1 });

      if (isPinfu(tiles, ctx) && ctx.isMenzen) yaku.push({ name: "平和", han: 1 });

      if (ctx.isMenzen) {
        let maxPairs = 0;
        for (const d of decomps) maxPairs = Math.max(maxPairs, countIipeikou(d));
        if (maxPairs >= 2) yaku.push({ name: "二盃口", han: 3 });
        else if (maxPairs === 1) yaku.push({ name: "一盃口", han: 1 });
      }

      const any = (fn) => decomps.some(fn);

      if (any(isToitoi)) yaku.push({ name: "対々和", han: 2 });
      if (any(d => isToitoi(d) && isChanta(d))) yaku.push({ name: "混老頭", han: 2 });
      if (any(isSanankou)) yaku.push({ name: "三暗刻", han: 2 });
      if (any(isSanshokuDoukou)) yaku.push({ name: "三色同刻", han: 2 });
      if (any(isSanshokuDoujun)) yaku.push({ name: "三色同順", han: 2 });
      if (any(isShousangen)) yaku.push({ name: "小三元", han: 2 });
      if (any(isIttsuu)) yaku.push({ name: "一気通貫", han: 2 });

      if ((ctx.kanCount || 0) >= 3) yaku.push({ name: "三槓子", han: 2 });

      if (any(isChanta)) yaku.push({ name: "混全帯ヤオ九", han: 2 });
      if (any(isJunchan)) yaku.push({ name: "純全帯ヤオ九", han: 3 });
    }

    if (isHonitsu(tiles)) yaku.push({ name: "混一色", han: ctx.isMenzen ? 3 : 2 });
    if (isChinitsu(tiles)) yaku.push({ name: "清一色", han: ctx.isMenzen ? 6 : 5 });

    const doraHan = doraCount(tiles, ctx.doraTiles || []);
    if (doraHan > 0) yaku.push({ name: "ドラ", han: doraHan, isDora: true });

    const uraDoraHan = (ctx.riichi || ctx.doubleRiichi)
      ? doraCount(tiles, ctx.uraDoraTiles || [])
      : 0;
    if (uraDoraHan > 0) yaku.push({ name: "裏ドラ", han: uraDoraHan, isDora: true });

    const han = yaku.reduce((a, x) => a + x.han, 0);
    return { yaku, han, yakumanCount: 0, doraHan, uraDoraHan };
  };

  // ======= Fu =======
  const calcFu = (tiles, yakuInfo, ctx) => {
    if (yakuInfo.yaku.some(x => x.name === "七対子")) return 25;
    if (yakuInfo.yaku.some(x => x.name === "平和")) {
      return (ctx.winType === "tsumo") ? 20 : 30;
    }
    let fu = 20;
    if (ctx.winType === "tsumo") fu += 2;
    fu = Math.ceil(fu / 10) * 10;
    return fu;
  };

  // ======= Points (basic points) =======
  const calcPoints = (han, fu, optMangan30fu4han) => {
    let limitName = null;
    let basePoints = null;

    if (han >= 13) { limitName = "数え役満"; basePoints = 8000; }
    else if (han >= 11) { limitName = "三倍満"; basePoints = 6000; }
    else if (han >= 8) { limitName = "倍満"; basePoints = 4000; }
    else if (han >= 6) { limitName = "跳満"; basePoints = 3000; }
    else if (han >= 5) { limitName = "満貫"; basePoints = 2000; }
    else {
      const calc = fu * Math.pow(2, 2 + han);
      if (calc >= 2000) { limitName = "満貫"; basePoints = 2000; }
      else {
        if (optMangan30fu4han && han === 4 && fu === 30) { limitName = "満貫"; basePoints = 2000; }
        else basePoints = calc;
      }
    }

    const total = Math.ceil(basePoints) * 4;
    return { limitName, basePoints: Math.ceil(basePoints), total };
  };

  window.MahHack = {
    sortTiles,
    countTiles,
    isAgari,
    winningTilesFor13,
    standardDecomps,
    detectYaku,
    calcFu,
    calcPoints,
    nextDoraFromIndicator,
  };
})();
