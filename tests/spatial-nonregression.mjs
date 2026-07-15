// 空間グリッドの決定論的な非回帰テスト & 負荷計測（Milestone 5-A）。
// Node.js 標準機能のみ（外部依存なし）。実行: node tests/spatial-nonregression.mjs
//
// 目的:
//   BattleScene が戦闘判定で使う「近傍検索の候補集め」を、総当たり(O(N)) から
//   空間グリッドへ置き換えた。ダメージ計算・貫通・連鎖・感染・安全上限などの
//   下流ロジックは両方式で同一コードを共有しており、変更していない。
//   よって「候補集合と走査順が総当たりと完全一致する」ことを厳密に示せば、
//   命中敵ID/与ダメージ/生死/貫通/討伐/感染対象/ボス除外/安全上限の結果は不変である。
//
// このテストは上記の前提（候補の集合＋順序の一致）を厳密に検証し、加えて
// 削減率と負荷スケールを計測する。ブラウザ実挙動（FPS）は別途 GitHub Pages で確認する。

import { SpatialGrid } from '../src/systems/SpatialGrid.js';

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('  ✗ ' + msg); failures++; }
}
function arraysEqualBySeq(a, b, msg) {
  const sa = a.map((o) => o._seq).join(',');
  const sb = b.map((o) => o._seq).join(',');
  assert(sa === sb, `${msg}\n      brute=[${sb}]\n      grid =[${sa}]`);
}

// 決定論的 RNG（mulberry32）— BattleScene と同じ系列。
function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORLD_W = 1600, WORLD_H = 1200, CELL = 64;

// 敵を模した軽量オブジェクト（BattleScene と同じく x/y/alive/_seq を持つ）。
function makeEnemies(n, seed) {
  const rng = createRng(seed);
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({ _seq: i, x: rng() * WORLD_W, y: rng() * WORLD_H, alive: true, isElite: rng() < 0.1 });
  }
  return list;
}

// ---- 総当たり（旧方式）参照実装 ----
function bruteInRadius(list, x, y, r) {
  const r2 = r * r;
  const out = [];
  for (const e of list) { if (e.alive !== false) { const dx = e.x - x, dy = e.y - y; if (dx * dx + dy * dy <= r2) out.push(e); } }
  out.sort((a, b) => a._seq - b._seq);
  return out;
}
// BattleScene.nearestTarget の敵ループと同じ（Set順走査 + 厳密 d<bestD）。
function bruteNearest(list, x, y, range) {
  let best = null, bestD = Infinity;
  for (const e of list) {
    if (e.alive === false) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD && d <= range) { bestD = d; best = e; }
  }
  return best;
}
function bruteAABB(list, x, y, w, h) {
  const hw = w / 2, hh = h / 2;
  const out = [];
  for (const e of list) {
    if (e.alive === false) continue;
    if (Math.abs(e.x - x) <= hw && Math.abs(e.y - y) <= hh) out.push(e);
  }
  out.sort((a, b) => a._seq - b._seq);
  return out;
}

// ---- グリッド経由（新方式）— BattleScene と同じ「候補→厳密判定→_seq整列」 ----
function gridInRadius(grid, x, y, r) {
  const r2 = r * r;
  const cand = grid.queryCircle(x, y, r);
  const out = [];
  for (const e of cand) { if (e.alive !== false) { const dx = e.x - x, dy = e.y - y; if (dx * dx + dy * dy <= r2) out.push(e); } }
  out.sort((a, b) => a._seq - b._seq);
  return out;
}
function gridNearest(grid, x, y, range) {
  const cand = grid.queryCircle(x, y, range);
  cand.sort((a, b) => a._seq - b._seq);
  let best = null, bestD = Infinity;
  for (const e of cand) {
    if (e.alive === false) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD && d <= range) { bestD = d; best = e; }
  }
  return best;
}
function gridAABB(grid, x, y, w, h) {
  const hw = w / 2, hh = h / 2;
  const cand = grid.queryAABB(x, y, w, h);
  const out = [];
  for (const e of cand) { if (e.alive !== false && Math.abs(e.x - x) <= hw && Math.abs(e.y - y) <= hh) out.push(e); }
  out.sort((a, b) => a._seq - b._seq);
  return out;
}

function buildGrid(list) {
  const grid = new SpatialGrid(CELL, WORLD_W, WORLD_H);
  for (const e of list) grid.insert(e);
  return grid;
}

// =================== 1. 円範囲検索の集合＋順序一致 ===================
console.log('1. 円範囲検索（targetsInRadius 相当）: 集合と走査順の一致');
{
  const list = makeEnemies(400, 12345);
  const grid = buildGrid(list);
  const rng = createRng(999);
  let bruteCmp = 0, gridCmp = 0, checks = 0;
  for (let i = 0; i < 500; i++) {
    const x = rng() * WORLD_W, y = rng() * WORLD_H, r = 20 + rng() * 160;
    const b = bruteInRadius(list, x, y, r);
    const g = gridInRadius(grid, x, y, r);
    arraysEqualBySeq(b, g, `円検索が不一致 (x=${x.toFixed(0)},y=${y.toFixed(0)},r=${r.toFixed(0)})`);
    bruteCmp += list.length;
    gridCmp += grid.queryCircle(x, y, r).length;
    checks++;
  }
  console.log(`   ${checks}件の検索すべてで一致。比較回数 旧総当り=${bruteCmp} 空間=${gridCmp} 削減=${(100 * (1 - gridCmp / bruteCmp)).toFixed(1)}%`);
}

// =================== 2. 最寄り検索の一致（同距離時の優先も） ===================
console.log('2. 最寄り検索（nearestTarget 相当）: 同一対象を返す');
{
  const list = makeEnemies(400, 2024);
  const grid = buildGrid(list);
  const rng = createRng(77);
  let mism = 0;
  for (let i = 0; i < 500; i++) {
    const x = rng() * WORLD_W, y = rng() * WORLD_H, range = 40 + rng() * 300;
    const b = bruteNearest(list, x, y, range);
    const g = gridNearest(grid, x, y, range);
    if ((b && b._seq) !== (g && g._seq)) { mism++; if (mism <= 3) console.error(`   ✗ 最寄り不一致 brute=${b && b._seq} grid=${g && g._seq}`); }
  }
  assert(mism === 0, `最寄り検索が ${mism} 件不一致`);
  if (mism === 0) console.log('   500件すべてで同一の最寄り対象。');
}

// =================== 3. 矩形範囲検索の一致 ===================
console.log('3. 矩形範囲検索（queryAABB）: 集合の一致');
{
  const list = makeEnemies(300, 555);
  const grid = buildGrid(list);
  const rng = createRng(31);
  for (let i = 0; i < 300; i++) {
    const x = rng() * WORLD_W, y = rng() * WORLD_H, w = 30 + rng() * 260, h = 30 + rng() * 260;
    arraysEqualBySeq(bruteAABB(list, x, y, w, h), gridAABB(grid, x, y, w, h), '矩形検索が不一致');
  }
  console.log('   300件すべてで一致。');
}

// =================== 4. 密集地点カウントの一致（densestPoint 相当） ===================
console.log('4. 近傍数カウント（densestPoint 相当）: 各点の近傍数が一致');
{
  const list = makeEnemies(250, 8888);
  const grid = buildGrid(list);
  const radius = 70, r2 = radius * radius;
  let mism = 0;
  for (const c of list) {
    let bruteCount = 0;
    for (const o of list) { const dx = c.x - o.x, dy = c.y - o.y; if (dx * dx + dy * dy <= r2) bruteCount++; }
    const cand = grid.queryCircle(c.x, c.y, radius);
    let gridCount = 0;
    for (const o of cand) { const dx = c.x - o.x, dy = c.y - o.y; if (dx * dx + dy * dy <= r2) gridCount++; }
    if (bruteCount !== gridCount) mism++;
  }
  assert(mism === 0, `近傍数カウントが ${mism} 点で不一致`);
  if (mism === 0) console.log('   250点すべてで近傍数が一致（→ 密集地点の選択も一致）。');
}

// =================== 5. 死亡・削除・移動の反映 ===================
console.log('5. 死亡/削除/移動後もグリッドと総当たりが一致');
{
  const list = makeEnemies(300, 4242);
  const grid = buildGrid(list);
  const rng = createRng(101);
  // 一部を死亡・一部をグリッドから削除（プール返却相当）
  for (let i = 0; i < list.length; i++) {
    if (i % 7 === 0) list[i].alive = false;           // 死亡（除外されるべき）
    if (i % 11 === 0) grid.remove(list[i]);           // プール返却（グリッドから消える）
  }
  // 生存かつ削除されていないものだけが候補になる（remove 済みは list からも除外して参照を作る）
  const removed = new Set();
  for (let i = 0; i < list.length; i++) if (i % 11 === 0) removed.add(list[i]);
  const liveList = list.filter((e) => e.alive !== false && !removed.has(e));
  for (let i = 0; i < 200; i++) {
    const x = rng() * WORLD_W, y = rng() * WORLD_H, r = 30 + rng() * 200;
    arraysEqualBySeq(bruteInRadius(liveList, x, y, r), gridInRadius(grid, x, y, r), '死亡/削除後の検索が不一致');
  }
  // 移動 + 差分更新
  for (const e of liveList) { e.x = Math.min(WORLD_W, Math.max(0, e.x + (rng() - 0.5) * 300)); e.y = Math.min(WORLD_H, Math.max(0, e.y + (rng() - 0.5) * 300)); grid.update(e); }
  for (let i = 0; i < 200; i++) {
    const x = rng() * WORLD_W, y = rng() * WORLD_H, r = 30 + rng() * 200;
    arraysEqualBySeq(bruteInRadius(liveList, x, y, r), gridInRadius(grid, x, y, r), '移動(差分更新)後の検索が不一致');
  }
  // グリッドは「削除(remove)」したものだけ登録から外れる。死亡フラグだけの敵は
  // 登録に残るが検索では _isLive で除外される（上の全検索一致がそれを保証している）。
  const expectedRegistered = list.length - removed.size;
  assert(grid.size === expectedRegistered, `差分更新後の登録数が不一致 grid=${grid.size} 期待=${expectedRegistered}`);
  console.log(`   死亡/削除/移動後も全検索一致。登録数 ${grid.size}（生存 ${liveList.length}、削除 ${removed.size}）。`);
}

// =================== 6. フィルタ（エリート/ボス判定）と重複なし ===================
console.log('6. フィルタ（エリート抽出）と重複なしの確認');
{
  const list = makeEnemies(300, 606);
  const grid = buildGrid(list);
  const elitesBrute = list.filter((e) => e.isElite).map((e) => e._seq).sort((a, b) => a - b);
  const elitesGrid = grid.queryAABB(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, (o) => o.isElite).map((e) => e._seq).sort((a, b) => a - b);
  assert(elitesBrute.join(',') === elitesGrid.join(','), 'エリートフィルタ結果が不一致');
  // 重複なし: 全域検索で各オブジェクトはちょうど1回
  const all = grid.queryAABB(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H);
  assert(all.length === new Set(all).size, '検索結果に重複がある');
  assert(all.length === list.length, `全域検索が全件を返さない (${all.length}/${list.length})`);
  console.log(`   エリート ${elitesGrid.length} 件一致・重複なし・全域 ${all.length} 件。`);
}

// =================== 7. 負荷スケールと削減率 ===================
console.log('7. 負荷スケール（通常/高/極端）と比較回数削減');
function loadCase(name, nEnemies, nQueries, radius) {
  const list = makeEnemies(nEnemies, nEnemies * 3 + 1);
  const grid = buildGrid(list);
  const rng = createRng(nEnemies + 7);
  let bruteCmp = 0, gridCmp = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < nQueries; i++) {
    const x = rng() * WORLD_W, y = rng() * WORLD_H;
    const g = gridInRadius(grid, x, y, radius);
    // 参照の総当りも実行して一致確認（サンプル）
    if (i % 50 === 0) arraysEqualBySeq(bruteInRadius(list, x, y, radius), g, `${name}: 負荷時の検索不一致`);
    bruteCmp += list.length;
    gridCmp += grid.queryCircle(x, y, radius).length;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const reduction = (100 * (1 - gridCmp / bruteCmp)).toFixed(1);
  console.log(`   [${name}] 敵${nEnemies} × 検索${nQueries}: 旧総当り比較=${bruteCmp} 空間比較=${gridCmp} 削減=${reduction}%  (${ms.toFixed(1)}ms)`);
  return { bruteCmp, gridCmp };
}
loadCase('通常', 100, 2000, 80);
loadCase('高負荷', 300, 4000, 80);
loadCase('極端', 2000, 4000, 80);

// =================== 結果 ===================
console.log('');
if (failures) {
  console.error(`✗ 非回帰テスト失敗: ${failures} 件の不一致`);
  process.exit(1);
} else {
  console.log('✓ 空間グリッド非回帰テストに成功（候補集合と走査順が総当たりと完全一致）。');
  process.exit(0);
}
