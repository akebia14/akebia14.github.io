/* mahjong.js (solo-riichi MVP+)
 * 対応：暗槓 / 嶺上 / カンドラ / 裏ドラ / リーチ / ダブルリーチ
 * 役：ユーザー指定リスト（ただしロン系はソロ進行ではイベントが発生しない）
 *
 * 出典：
 * - Kan：カンドラ公開タイミングに差異がある旨（今回は即公開を採用仕様として固定） :contentReference[oaicite:8]{index=8}
 * - Rinshan：嶺上開花の説明・他役との両立不可など :contentReference[oaicite:9]{index=9}
 * - Chankan：ロンのみ／ツモ系と両立不可 :contentReference[oaicite:10]{index=10}
 * - Haitei/Houtei：牌の取得元が異なり相互排他、ホウテイはロンのみ等 :contentReference[oaicite:11]{index=11}
 * - Riichi/Double riichi：定義 :contentReference[oaicite:12]{index=12}
 * - Pinfu：ピンフツモは20符 :contentReference[oaicite:13]{index=13}
 * - Fu：符の概念（基礎） :contentReference[oaicite:14]{index=14}
 * - Yakuhai：翻牌の概念（役牌刻子等） :contentReference[oaicite:15]{index=15}
 * - Scoring：上限/計算枠組み :contentReference[oaicite:16]{index=16}
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
  const GREEN_TILES = new Set(["2s","3s","4s","6s","8s","發"]); // 緑一色: 緑牌（發含む） :contentReference[oaicite:17]{index=17}

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

    // quad (for completeness; in hand structure we treat kantsu as meld)
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
  // ctx:
  // {
  //   winType: 'tsumo'|'ron',
  //   isMenzen: true,
  //   riichi: true/false,
  //   doubleRiichi: true/false,
  //   haitei: true/false,
  //   houtei: true/false,
  //   rinshan: true/false,
  //   chankan: true/false,
  //   seatWind:'東'.., roundWind:'東'..,
  //   kanCount: number,
  //   doraTiles: [...],
  //   uraDoraTiles: [...], // only if riichi win
  //   optMangan30fu4han: boolean
  // }

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
    // 各面子と雀頭に么九牌/字牌を含む + 字牌を含む（字牌が無いと純全帯になる）
    const groups = [...decomp.melds.map(m => m.tiles), decomp.pair];
    const hasHonor = groups.flat().some(isHonor);
    if (!hasHonor) return false;
    const okEach = (g) => g.some(t => isHonor(t) || TERMINALS.has(t));
    return groups.every(okEach);
  };

  const isJunchan = (decomp) => {
    // 各面子と雀頭に么九牌を含む（字牌不可）
    const groups = [...decomp.melds.map(m => m.tiles), decomp.pair];
    if (groups.flat().some(isHonor)) return false;
    const okEach = (g) => g.some(t => TERMINALS.has(t));
    return groups.every(okEach);
  };

  const isToitoi = (decomp) => decomp.melds.every(m => m.type === "trip" || m.type === "quad");
  const isSanankou = (decomp, ctx) => {
    // ソロ/鳴き無しでは面子はすべて暗刻扱い。暗槓は暗刻として数える旨あり。 :contentReference[oaicite:18]{index=18}
    const koutsu = decomp.melds.filter(m => m.type === "trip" || m.type === "quad").length;
    return koutsu >= 3;
  };

  const isSanshokuDoujun = (decomp) => {
    // 三色同順：同一数字の順子（n,n+1,n+2）が m/p/s の3色で揃う
    // 例：123m + 123p + 123s
    const seqStarts = new Set(
      decomp.melds
        .filter(m => m.type === "seq")
        .map(m => m.tiles[0]) // "1m" など（順子の先頭牌）
    );
  
    for (let n = 1; n <= 7; n++) {
      const okM = seqStarts.has(`${n}m`);
      const okP = seqStarts.has(`${n}p`);
      const okS = seqStarts.has(`${n}s`);
      if (okM && okP && okS) return true;
    }
    return false;
  };


  const isSanshokuDoukou = (decomp) => {
    // 同一数字の刻子/槓子が3色 :contentReference[oaicite:19]{index=19}
    const trips = decomp.melds.filter(m => m.type === "trip" || m.type === "quad").map(m => m.tiles[0]);
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
    // 一気通貫：同一色で 123/456/789 の順子
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
    // 同一順子の重複数（2なら一盃口、4なら二盃口）
    const seqs = decomp.melds.filter(m => m.type === "seq").map(m => m.tiles.join(","));
    const m = new Map();
    for (const k of seqs) m.set(k, (m.get(k) || 0) + 1);
    let pairs = 0;
    for (const v of m.values()) pairs += Math.floor(v / 2);
    return pairs;
  };

  const isShousangen = (decomp) => {
    // 小三元：三元牌の刻子2つ + 残り1種が雀頭 :contentReference[oaicite:20]{index=20}
    const trip = new Set(decomp.melds.filter(m => m.type === "trip" || m.type === "quad").map(m => m.tiles[0]));
    const pair = decomp.pair[0];
    const tripDragons = DRAGONS.filter(d => trip.has(d)).length;
    const pairDragon = DRAGONS.includes(pair) ? 1 : 0;
    return tripDragons === 2 && pairDragon === 1;
  };

  // ======= Yakuman patterns =======
  const isDaisangen = (decomp) => {
    // 大三元：白發中すべて刻子/槓子 :contentReference[oaicite:21]{index=21}
    const trip = new Set(decomp.melds.filter(m => m.type === "trip" || m.type === "quad").map(m => m.tiles[0]));
    return DRAGONS.every(d => trip.has(d));
  };

  const isSuushi = (decomp) => {
    // 四喜和：小四喜 or 大四喜 :contentReference[oaicite:22]{index=22}
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
  const isChinroutou = (tiles) => tiles.every(t => TERMINALS.has(t)); // 清老頭：么九のみ（字牌不可）
  const isSuuankou = (decomp) => {
    // 四暗刻：暗刻4（鳴き無し前提で刻子/槓子4） :contentReference[oaicite:23]{index=23}
    const k = decomp.melds.filter(m => m.type === "trip" || m.type === "quad").length;
    return k === 4;
  };

  const isChuuren = (tiles) => {
    // 九蓮宝燈：同一色で 1112345678999 + 任意1枚、門前のみ :contentReference[oaicite:24]{index=24}
    if (!tiles.every(isSuit)) return false;
    const suit = tiles[0][1];
    if (!tiles.every(t => t[1] === suit)) return false;
    const counts = countTiles(tiles);
    const need = new Map([
      [`1${suit}`, 3], [`2${suit}`, 1], [`3${suit}`, 1], [`4${suit}`, 1], [`5${suit}`, 1],
      [`6${suit}`, 1], [`7${suit}`, 1], [`8${suit}`, 1], [`9${suit}`, 3],
    ]);
    // 13枚分を満たし、残り1枚は同一色のどれでも
    for (const [k, v] of need.entries()) {
      if ((counts.get(k) || 0) < v) return false;
    }
    // 合計14枚で、余剰は同一色内ならOK
    return true;
  };

  const isSuukantsuYakuman = (ctx) => (ctx.kanCount || 0) >= 4;

  // ======= Pinfu strict-ish (need: all sequences, non-yakuhai pair, ryanmen wait) =======
  // ここでは「待ち形」までチェックし、可能な分解のいずれかで成立すればピンフにします。
  const isYakuhaiTile = (t, ctx) => {
    if (!isHonor(t)) return false;
    if (DRAGONS.includes(t)) return true;
    return t === ctx.seatWind || t === ctx.roundWind;
  };

  const waitTypeFromDecomp = (decomp, winTile) => {
    // winTile を含む面子候補から待ちを推定（単純化）
    // - tanki: 雀頭待ち
    // - kanchan/penchan: 嵌張/辺張（順子構成）
    // - ryanmen: 両面
    // - shanpon: 双碰（刻子の片方）
    //
    // 厳密には「どの分解で和了したか」で変わるので、分解ごとに判定する。
    if (decomp.pair[0] === winTile) return "tanki";

    for (const m of decomp.melds) {
      if (!m.tiles.includes(winTile)) continue;
      if (m.type === "trip" || m.type === "quad") return "shanpon";
      if (m.type === "seq") {
        const a = m.tiles[0], b = m.tiles[1], c = m.tiles[2];
        // winTile が中央なら嵌張
        if (winTile === b) return "kanchan";
        // 辺張：12の3待ち or 89の7待ち
        if (a[0] === "1" && winTile === c) return "penchan";
        if (a[0] === "7" && winTile === a) return "penchan";
        // 両面：上記以外の端以外
        return "ryanmen";
      }
    }
    return "unknown";
  };

  const isPinfu = (tiles, ctx) => {
    if (ctx.winType !== "tsumo" && ctx.winType !== "ron") return false;
    const winTile = ctx.winTile; // app側で渡す
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

    // tenhou/chiihou: first draw win conditions (event-based) :contentReference[oaicite:25]{index=25}
    // app側で成立時だけ ctx.tenhou / ctx.chiihou を true にする
    let yakumanCount = 0;
    if (ctx.tenhou) { yaku.push({ name: "天和", han: 13, yakuman: true }); yakumanCount++; }
    if (ctx.chiihou) { yaku.push({ name: "地和", han: 13, yakuman: true }); yakumanCount++; }

    const decomps = standardDecomps(tiles);
    if (decomps.length) {
      // 牌姿系yakuman（分解依存）
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
      // yakuman時は通常役・ドラは計上しない（一般的整理：yakumanと通常役は別枠） :contentReference[oaicite:26]{index=26}
      return { yaku, han: 13, yakumanCount, doraHan: 0, uraDoraHan: 0 };
    }

    // regular yaku
    if (ctx.isMenzen && ctx.winType === "tsumo") yaku.push({ name: "門前清自摸和", han: 1 }); // :contentReference[oaicite:27]{index=27}
    if (ctx.riichi) yaku.push({ name: "立直", han: 1 }); // :contentReference[oaicite:28]{index=28}
    if (ctx.doubleRiichi) yaku.push({ name: "ダブルリーチ", han: 2 }); // :contentReference[oaicite:29]{index=29}

    if (isTanyao(tiles)) yaku.push({ name: "断ヤオ九", han: 1 }); // :contentReference[oaicite:30]{index=30}

    // 海底/河底/嶺上/搶槓（イベントフラグでのみ）
    if (ctx.haitei && ctx.winType === "tsumo") yaku.push({ name: "海底摸月", han: 1 }); // :contentReference[oaicite:31]{index=31}
    if (ctx.houtei && ctx.winType === "ron") yaku.push({ name: "河底撈魚", han: 1 }); // :contentReference[oaicite:32]{index=32}
    if (ctx.rinshan && ctx.winType === "tsumo") yaku.push({ name: "嶺上開花", han: 1 }); // :contentReference[oaicite:33]{index=33}
    if (ctx.chankan && ctx.winType === "ron") yaku.push({ name: "搶槓", han: 1 }); // :contentReference[oaicite:34]{index=34}

    // Seven pairs
    if (isChiitoitsu(tiles) && ctx.isMenzen) yaku.push({ name: "七対子", han: 2 }); // :contentReference[oaicite:35]{index=35}

    // Standard-form yaku (need decomposition)
    if (decomps.length) {
      // 翻牌（役牌刻子/槓子）
      // ソロ仕様：場風/自風は app側で ctx.roundWind/ctx.seatWind を与える
      const hasYakuhai = decomps.some(d => {
        const trip = d.melds.filter(m => m.type === "trip" || m.type === "quad").map(m => m.tiles[0]);
        return trip.some(t => isYakuhaiTile(t, ctx));
      });
      if (hasYakuhai) yaku.push({ name: "翻牌", han: 1 }); // :contentReference[oaicite:36]{index=36}

      // ピンフ（待ちまでチェック）
      if (isPinfu(tiles, ctx) && ctx.isMenzen) yaku.push({ name: "平和", han: 1 }); // :contentReference[oaicite:37]{index=37}

      // 一盃口 / 二盃口
      if (ctx.isMenzen) {
        let maxPairs = 0;
        for (const d of decomps) maxPairs = Math.max(maxPairs, countIipeikou(d));
        if (maxPairs >= 2) yaku.push({ name: "二盃口", han: 3 }); // ryanpeikou :contentReference[oaicite:38]{index=38}
        else if (maxPairs === 1) yaku.push({ name: "一盃口", han: 1 }); // :contentReference[oaicite:39]{index=39}
      }

      // 対々和 / 混老頭 / 三暗刻 / 三色同刻 / 三色同順 / 小三元 / 一気通貫 / 三槓子 / 混全帯 / 純全帯
      const any = (fn) => decomps.some(fn);

      if (any(isToitoi)) yaku.push({ name: "対々和", han: 2 }); // :contentReference[oaicite:40]{index=40}
      if (any(d => isToitoi(d) && isChanta(d))) yaku.push({ name: "混老頭", han: 2 }); // 定義はList_of_yaku側にあり :contentReference[oaicite:41]{index=41}
      if (any(d => isSanankou(d, ctx))) yaku.push({ name: "三暗刻", han: 2 }); // :contentReference[oaicite:42]{index=42}
      if (any(isSanshokuDoukou)) yaku.push({ name: "三色同刻", han: 2 }); // :contentReference[oaicite:43]{index=43}
      if (any(isSanshokuDoujun)) yaku.push({ name: "三色同順", han: 2 }); // :contentReference[oaicite:44]{index=44}
      if (any(isShousangen)) yaku.push({ name: "小三元", han: 2 }); // :contentReference[oaicite:45]{index=45}
      if (any(isIttsuu)) yaku.push({ name: "一気通貫", han: 2 }); // 定義詳細はList_of_yaku側 :contentReference[oaicite:46]{index=46}

      if ((ctx.kanCount || 0) >= 3) yaku.push({ name: "三槓子", han: 2 }); // :contentReference[oaicite:47]{index=47}

      if (any(isChanta)) yaku.push({ name: "混全帯ヤオ九", han: 2 }); // :contentReference[oaicite:48]{index=48}
      if (any(isJunchan)) yaku.push({ name: "純全帯ヤオ九", han: 3 }); // :contentReference[oaicite:49]{index=49}
    }

    // 混一色/清一色
    if (isHonitsu(tiles)) yaku.push({ name: "混一色", han: ctx.isMenzen ? 3 : 2 });
    if (isChinitsu(tiles)) yaku.push({ name: "清一色", han: ctx.isMenzen ? 6 : 5 });

    // Dora / Ura-dora (ura only if riichi win)
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
    // Chiitoitsu fixed 25
    if (yakuInfo.yaku.some(x => x.name === "七対子")) return 25;

    // Pinfu: tsumo 20 fu / ron 30 fu (as commonly used; pinfu page mentions tsumo 20 fu) :contentReference[oaicite:50]{index=50}
    if (yakuInfo.yaku.some(x => x.name === "平和")) {
      return (ctx.winType === "tsumo") ? 20 : 30;
    }

    // MVP: base 20 + tsumo 2, then round up to 10
    // 詳細加符（刻子/么九/待ち）までは今回未実装（Fu概念は出典参照） :contentReference[oaicite:51]{index=51}
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

    // 前回同様：敵ダメージに使いやすい単一スカラーとして basic*4 を返す（分配は未実装）
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
