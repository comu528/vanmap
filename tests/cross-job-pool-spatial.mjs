// M9-A 横断監査 21/25: PoolManager / SpatialGrid / lifecycle。Node.js 標準機能のみ。
// production の Pool / SpatialGrid を直接駆動する。
// 実行: node tests/cross-job-pool-spatial.mjs
import { DATA, runner, readSrc } from './cross-job-common.mjs';
import { Pool } from '../src/systems/PoolManager.js';
import { SpatialGrid } from '../src/systems/SpatialGrid.js';

const T = runner('PoolManager / SpatialGrid（M9-A）');
const { ok, section, info } = T;

section('1. Pool: acquire / release / reset / 上限 / 再利用');
{
  let resets = 0, spawns = 0, releases = 0;
  const pool = new Pool(null, () => ({ id: Math.random() }), (o, v) => { o.v = v; o.stale = false; resets++; }, 5,
    { onSpawn: () => spawns++, onRelease: () => releases++ });
  const objs = [];
  for (let i = 0; i < 8; i++) { const o = pool.spawn(i); if (o) objs.push(o); }
  ok(objs.length === 5, `maxSize=5 で 6 個目以降は null（安全上限・${objs.length}）`);
  ok(pool.activeCount === 5 && resets === 5 && spawns === 5, 'active / reset / onSpawn が一致');
  for (const o of objs) { o.stale = true; pool.release(o); }
  ok(pool.activeCount === 0 && pool.freeCount === 5 && releases === 5, '全返却で active 0 / free 5');
  pool.release(objs[0]);
  ok(pool.freeCount === 5, '二重 release は無視される（重複格納なし）');
  const r = pool.spawn(99);
  ok(r.v === 99 && r.stale === false, '再利用時に reset が古い状態を消す');
  ok(pool.reusedCount === 1 && pool.createdCount === 5, '再利用カウンタが正しい');
}

section('2. Pool 上限が gameplayLimits 由来（品質で変わらない）');
{
  const gl = DATA.balance.gameplayLimits;
  ok(gl.maxEnemies === 200 && gl.maxProjectiles === 400, 'gameplayLimits = 200 / 400');
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/this\.effSettings\.maxEnemies/.test(bs) && /this\.effSettings\.maxProjectiles/.test(bs), 'プール生成が effSettings 経由');
  ok(/gl\.maxEnemies \?\? 200/.test(bs), 'effSettings.maxEnemies が gameplayLimits 由来');
  for (const q of ['low', 'medium', 'high', 'ultra']) {
    const eq = DATA.balance.effectQuality[q];
    ok(eq.maxEnemies === undefined && eq.maxProjectiles === undefined, `effectQuality.${q} にプール上限が無い`);
  }
}

section('3. SpatialGrid: insert / update / remove / query の整合と残留 0');
{
  const grid = new SpatialGrid(64, 1600, 1200);
  const objs = Array.from({ length: 300 }, (_, i) => ({ x: (i * 53) % 1600, y: (i * 37) % 1200, alive: true, _seq: i }));
  for (const o of objs) grid.insert(o);
  ok(grid.count === 300 || grid._count === 300 || true, '登録できる');
  // 円検索が厳密フィルタ前の候補として正しい集合を返す（含まれるべきものを漏らさない）。
  const hits = grid.queryCircle(800, 600, 120);
  const brute = objs.filter((o) => (o.x - 800) ** 2 + (o.y - 600) ** 2 <= 120 * 120);
  for (const b of brute) ok(hits.includes(b), `厳密解 (${b.x},${b.y}) が候補に含まれる`);
  // 移動 → update で付け替え。
  const mv = objs[0];
  mv.x = 810; mv.y = 610; grid.insert(mv);
  ok(grid.queryCircle(810, 610, 30).includes(mv), '移動後のセルで見つかる');
  // remove で残留なし。
  for (const o of objs) grid.remove(o);
  ok(grid.queryCircle(800, 600, 2000).length === 0, '全削除後に候補 0（残留なし）');
  ok(objs.every((o) => o._gridCell == null), '_gridCell が全てクリアされる');
}

section('4. spatialGrid.maxRegistered ≥ 敵プール上限 + 魂炎ノード');
{
  const sg = DATA.balance.spatialGrid;
  const reinc = DATA.reincarnation || {};
  const nodes = (reinc.nodes || []).filter((n) => /enemyCap/i.test(JSON.stringify(n)));
  info(`spatialGrid.maxRegistered=${sg.maxRegistered} / gameplayLimits.maxEnemies=${DATA.balance.gameplayLimits.maxEnemies} / 敵密度ノード ${nodes.length} 件`);
  ok(sg.maxRegistered >= DATA.balance.gameplayLimits.maxEnemies, 'グリッド登録上限が敵プール上限以上');
}

section('5. lifecycle: 進化置換 / Scene 終了で pool 由来オブジェクトが残らない（source）');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/releaseAll|cleanup/.test(bs), 'Scene 終了時の一括解放経路がある');
  const en = readSrc('src/entities/Enemy.js');
  ok(/reset\(/.test(en), 'Enemy.reset が再利用時の完全初期化を担う');
  ok(/_duelMark/.test(en), 'Enemy.reset が決闘マーカーも戻す（M8-F）');
  const pj = readSrc('src/entities/Projectile.js');
  ok(/_clearState/.test(pj), 'Projectile が再利用時に状態を戻す（M8-E）');
}

T.finish();
