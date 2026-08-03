// M9-A.2 6/12: 品質 4 段階の長時間比較（実ブラウザ）。Node.js 標準機能のみ。
// 同 seed / 同 build / 同 draft で low / medium / high / ultra を回し、
// gameplay trace が一致し visual だけが変わることを実測記録で検証する。
// 実行: node tests/browser-quality-plan.mjs
import { results, runner, JOB_IDS, QUALITIES } from './browser-results-common.mjs';

const T = runner('品質 4 段階（実ブラウザ長時間・M9-A.2）');
const { ok, section, info } = T;
const R = results();

section('1. 3 ジョブ × 4 品質を実施している');
for (const j of JOB_IDS) {
  const rs = R.quality.filter((x) => x.job === j);
  ok(rs.length === 4, `${j}: ${rs.length} 品質`);
  const qs = new Set(rs.map((x) => x.quality));
  for (const q of QUALITIES) ok(qs.has(q), `${j}: ${q} を実施`);
  const seeds = new Set(rs.map((x) => x.seed));
  ok(seeds.size === 1, `${j}: 全品質で同一 seed（${[...seeds].join(',')}）`);
}

section('2. 長時間である（1 ジョブは 5 分相当・他は 3 分相当）・build は固定');
{
  ok(R.quality.every((q) => q.build && q.build.actives >= 25),
    `品質比較は固定 build（active 25 種以上）で行っている（${[...new Set(R.quality.map((q) => q.build && q.build.actives))].join('/')}）`);
  ok(R.quality.every((q) => q.build.passives >= 4), '固定 build の passive が 4');
}
{
  const byJob = {};
  for (const r of R.quality) byJob[r.job] = Math.max(byJob[r.job] || 0, r.gameSecReached);
  info(Object.entries(byJob).map(([j, s]) => `${j} ${s}s`).join(' / '));
  ok(Object.values(byJob).some((s) => s >= 280), `最低 1 ジョブが 5 分相当（最大 ${Math.max(...Object.values(byJob))} ゲーム秒）`);
  ok(Object.values(byJob).every((s) => s >= 160), '全ジョブが 3 分相当以上');
  ok(R.quality.every((r) => r.gameSecReached >= 100), '各品質 run が 100 ゲーム秒以上');
}


section('3. gameplay が 4 品質で同水準（実ブラウザは実時間 delta なので byte-identical にはならない）');
{
  // ★ 重要: Phaser の update(delta) は**実時間**なので、実ブラウザでは 2 回の run が
  //    フレーム単位で一致しない。byte-identical の証明は固定 dt の Node ハーネスが担う
  //    （tests/cross-job-quality-full-invariance.mjs）。ここで見るのは
  //    「同じ採取時刻で gameplay の量が同水準」「低品質で減っていない」こと。
  ok(R.qualityComparison && typeof R.qualityComparison.tolerance === 'number',
    `許容幅が記録されている（±${R.qualityComparison && R.qualityComparison.tolerance * 100}%）`);
  ok(R.qualityComparison.byteIdenticalClaimed === false,
    '実ブラウザで byte-identical を主張していない（Node ハーネスの担当と明記）');
  const tol = R.qualityComparison.tolerance;
  for (const j of JOB_IDS) {
    const rs = R.quality.filter((x) => x.job === j);
    const caps = rs.map((x) => x.capturedAtSec);
    ok(Math.max(...caps) - Math.min(...caps) <= 5,
      `${j}: 4 品質の採取時刻が ±5 秒で揃っている（${caps.map((x) => Math.round(x)).join('/')}）`);
    ok(Math.min(...caps) >= 150, `${j}: 採取時刻が 150 ゲーム秒以上（${Math.round(Math.min(...caps))}）`);
    // ★ level / xp は品質比較に使わない。実測で同 seed・同 build・同品質でも Lv1〜Lv10 まで振れた
    //   （オート移動の経路次第で XP 玉の回収量が大きく変わる。撃破数 277〜285 は安定していた）。
    //   品質依存ではない run 間分散なので、安定して観測できる量だけで比較する。
    for (const k of ['kills', 'damage', 'casts', 'hits']) {
      const vals = rs.map((x) => x.gameplay[k]);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const spread = lo > 0 ? (hi - lo) / lo : (hi === 0 ? 0 : 1);
      ok(spread <= tol, `${j}: ${k} の品質間ばらつき ${(spread * 100).toFixed(1)}% ≤ ${(tol * 100)}%（${vals.join('/')}）`);
    }
    ok(rs.every((x) => x.gameplay.damage > 0 && x.gameplay.kills > 0), `${j}: 実際に戦闘が進んでいる`);
    // draft（決定論）は品質に影響されない ＝ 取得スキルの集合は完全一致すべき。
    const builds = new Set(rs.map((x) => JSON.stringify(x.gameplay.acquiredSkills)));
    ok(builds.size === 1, `${j}: 取得スキルの集合が 4 品質で完全一致（draft は品質非依存）`);
  }
}

section('4. gameplay 上限が品質非依存');
for (const r of R.quality) {
  ok(r.caps.maxEnemies === 200, `${r.job}/${r.quality}: 敵上限 200`);
  ok(r.caps.maxProjectiles === 400, `${r.job}/${r.quality}: 弾上限 400`);
  ok(r.caps.hitStop === true, `${r.job}/${r.quality}: hitStop 有効`);
}

section('5. visual だけが品質で変わる（低品質で削減される）');
for (const j of JOB_IDS) {
  const by = Object.fromEntries(R.quality.filter((x) => x.job === j).map((x) => [x.quality, x]));
  ok(by.low.caps.particleBudget < by.ultra.caps.particleBudget,
    `${j}: particleBudget が low < ultra（${by.low.caps.particleBudget} < ${by.ultra.caps.particleBudget}）`);
  ok(by.low.caps.damageNumbers === false && by.high.caps.damageNumbers === true,
    `${j}: damageNumbers が low のみ無効`);
  ok(by.low.visual.maxDisplayObjects <= by.ultra.visual.maxDisplayObjects,
    `${j}: 表示オブジェクト数 low ${by.low.visual.maxDisplayObjects} ≤ ultra ${by.ultra.visual.maxDisplayObjects}`);
  info(`${j}: 表示オブジェクト最大 low ${by.low.visual.maxDisplayObjects} / medium ${by.medium.visual.maxDisplayObjects} / high ${by.high.visual.maxDisplayObjects} / ultra ${by.ultra.visual.maxDisplayObjects}`);
}

section('5.5 XP 回収量の run 間分散を記録している（品質差ではない）');
{
  const lv = R.quality.map((q) => q.gameplay.level);
  const gemNote = R.qualityComparison.levelVarianceNote;
  info(`到達 Lv の分布: ${lv.join('/')}`);
  ok(typeof gemNote === 'string' && gemNote.length > 20,
    'level / xp を品質比較に使わない理由が記録されている');
  ok(/オート移動|autoMove|回収/.test(gemNote), '理由がオート移動の回収経路であることを明示している');
}

section('6. 低品質で gameplay イベントが「減って」いない（一方向の劣化が無い）');
for (const j of JOB_IDS) {
  const by = Object.fromEntries(R.quality.filter((x) => x.job === j).map((x) => [x.quality, x]));
  const tol = R.qualityComparison.tolerance;
  for (const k of ['casts', 'hits', 'kills', 'damage']) {
    const lowV = by.low.gameplay[k], ultraV = by.ultra.gameplay[k];  // level / xp は含めない
    ok(lowV >= ultraV * (1 - tol), `${j}: ${k} が low で系統的に減っていない（low ${lowV} / ultra ${ultraV}）`);
  }
}
{
  // 全ジョブ合算で low が ultra より一貫して低いなら「低品質で gameplay が削られている」疑い。
  const lowSum = R.quality.filter((x) => x.quality === 'low').reduce((a, x) => a + x.gameplay.kills, 0);
  const ultraSum = R.quality.filter((x) => x.quality === 'ultra').reduce((a, x) => a + x.gameplay.kills, 0);
  info(`合算撃破数 low ${lowSum} / ultra ${ultraSum}`);
  ok(lowSum >= ultraSum * (1 - R.qualityComparison.tolerance), '合算でも low が系統的に劣らない');
}

section('7. FPS / heap が記録されている');
for (const r of R.quality) {
  ok(typeof r.fps.avg === 'number' && r.fps.avg > 0, `${r.job}/${r.quality}: 平均 ${r.fps.avg} fps`);
  ok(typeof r.heapMb === 'number' && r.heapMb > 0, `${r.job}/${r.quality}: heap ${r.heapMb} MB`);
  ok(r.errors === 0, `${r.job}/${r.quality}: エラー 0`);
}
{
  // 「low が high より重い」は warning。実測から判定する。
  const heavy = [];
  for (const j of JOB_IDS) {
    const by = Object.fromEntries(R.quality.filter((x) => x.job === j).map((x) => [x.quality, x]));
    if (by.low.fps.avg + 5 < by.high.fps.avg) heavy.push(`${j}: low ${by.low.fps.avg} < high ${by.high.fps.avg}`);
  }
  info(heavy.length ? `low が high より明確に重い: ${heavy.join(' / ')}` : 'low が high より重いジョブは無い');
  ok(heavy.length === 0 || R.verdict.classified.some((c) => c.key === 'LOW_QUALITY_NOT_FASTER'),
    'low が重い場合は verdict に分類されている');
}

T.finish();
