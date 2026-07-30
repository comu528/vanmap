// M9-A 横断監査 20/25: 3 ジョブ横断の性能監査（Node 純ロジック）。Node.js 標準機能のみ。
// 敵 24+4elite+boss・active30 Lv8 の共通 profile を 4 品質で回し、
//   - 品質を下げても gameplay イベント数が不変（減るのは visual だけ）
//   - 実行時間が許容内（canonical gameplay cap 固定後も低品質機の負荷が破綻しない）
//   - 長時間 run で配列 / Map が増え続けない
// を確認する。実ブラウザの FPS / メモリは**未計測**（docs/test-guide.md の M9-A 節）。
// 実行: node tests/cross-job-performance.mjs（HEAVY=1 で長時間）
import { JOB_IDS, QUALITIES, HEAVY, poolsOf, runJob, runner } from './cross-job-common.mjs';

const T = runner('3 ジョブ性能監査（M9-A）');
const { ok, section, info } = T;
const STEPS = HEAVY ? 4000 : 1200;

for (const jobId of JOB_IDS) {
  section(`${jobId}: 4 品質の gameplay イベント数と実行時間`);
  const ids = poolsOf(jobId).active;
  const times = {};
  let base = null;
  for (const q of QUALITIES) {
    const t0 = Date.now();
    const r = await runJob(jobId, { quality: q, ids, steps: STEPS });
    times[q] = (Date.now() - t0) / 1000;
    if (!base) base = r;
    ok(r.trace.calls.count === base.trace.calls.count, `${q}: gameplay イベント数が不変（${r.trace.calls.count}）`);
    ok(r.hash === base.hash, `${q}: trace 全体が一致`);
  }
  info(`実行時間: ${QUALITIES.map((q) => `${q} ${times[q].toFixed(1)}s`).join(' / ')}（${STEPS} step）`);
  ok(Math.max(...Object.values(times)) < 60, `最悪の実行時間 < 60s`);
  // 低品質でも高品質でも計算量が同じ（gameplay cap 固定の帰結）: 時間比が極端でない。
  const ratio = Math.max(...Object.values(times)) / Math.max(0.01, Math.min(...Object.values(times)));
  ok(ratio < 5, `品質間の実行時間比 ${ratio.toFixed(2)} < 5（gameplay 計算量が品質非依存）`);
}

section('long run で配列 / Map が増え続けない');
{
  const short = await runJob('warrior', { quality: 'high', ids: poolsOf('warrior').active, steps: 600 });
  const long = await runJob('warrior', { quality: 'high', ids: poolsOf('warrior').active, steps: 1800 });
  // スキル Map・stats Map は run 長に依存しない。
  ok(long.sm.skills.size === short.sm.skills.size, `skills Map が一定（${long.sm.skills.size}）`);
  ok(long.sm.stats.size === short.sm.stats.size, `stats Map が一定（${long.sm.stats.size}）`);
  // 敵ヒット記録などの一時集合が run 長に比例して増えない（3 倍の時間で 3 倍未満の残留）。
  const residual = (r) => {
    let n = 0;
    for (const sk of r.sm.skills.values()) {
      for (const v of Object.values(sk)) { if (v instanceof Set || v instanceof Map) n += v.size; }
    }
    return n;
  };
  const s1 = residual(short), s2 = residual(long);
  ok(s2 <= Math.max(50, s1 * 3), `スキル内 Set/Map の残留が線形以下（${s1} → ${s2}）`);
  info(`スキル内 Set/Map 残留: 600step=${s1} / 1800step=${s2}`);
}

section('SpatialGrid: 毎フレーム全敵走査が無い（候補絞り込みの実測）');
{
  const { SpatialGrid } = await import('../src/systems/SpatialGrid.js');
  const grid = new SpatialGrid(64, 1600, 1200);
  const objs = Array.from({ length: 200 }, (_, i) => ({ x: (i * 53) % 1600, y: (i * 37) % 1200, alive: true }));
  for (const o of objs) grid.insert(o);
  let candidates = 0;
  grid.forEachInRadius ? grid.forEachInRadius(800, 600, 100, () => candidates++) : (candidates = grid.queryCircle ? grid.queryCircle(800, 600, 100).length : -1);
  ok(candidates >= 0 && candidates < 200, `半径 100px の候補が全体 200 より少ない（${candidates}）`);
}

T.finish();
