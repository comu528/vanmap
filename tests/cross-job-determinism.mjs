// M9-A 横断監査 24/25: 3 ジョブの決定論。Node.js 標準機能のみ。
// - 同 seed の候補列が run 間で一致（production SkillDraftManager）
// - 同条件の runtime trace が run 間で一致（production SkillManager 全スキル）
// - 品質を変えても両方が一致（quality invariance との連結）
// 実行: node tests/cross-job-determinism.mjs
import { JOB_IDS, poolsOf, runJob, runner, simDraft } from './cross-job-common.mjs';

const T = runner('3 ジョブ決定論（M9-A）');
const { ok, section, info } = T;

section('1. 候補列の決定論（同 seed 2 回 → 完全一致）');
for (const jobId of JOB_IDS) {
  for (const seed of [1, 77, 4096]) {
    const a = simDraft(jobId, { seed, slotActive: 6, levelUps: 50 });
    const b = simDraft(jobId, { seed, slotActive: 6, levelUps: 50 });
    ok(a.candidateSeq.join('|') === b.candidateSeq.join('|'), `${jobId} seed=${seed}: 候補列が一致`);
    ok(a.buildKey === b.buildKey, `${jobId} seed=${seed}: build が一致`);
  }
}

section('2. runtime trace の決定論（同条件 2 回 → hash 一致）');
for (const jobId of JOB_IDS) {
  const ids = poolsOf(jobId).active;
  const a = await runJob(jobId, { quality: 'high', ids, steps: 500 });
  const b = await runJob(jobId, { quality: 'high', ids, steps: 500 });
  ok(a.hash === b.hash, `${jobId}: runtime trace が run 間で一致（${a.hash.slice(0, 12)}…）`);
}

section('3. 品質を跨いだ決定論（low の 2 回目 = ultra の 1 回目）');
for (const jobId of JOB_IDS) {
  const ids = poolsOf(jobId).evolution;
  const lo = await runJob(jobId, { quality: 'low', ids, steps: 500 });
  const hi = await runJob(jobId, { quality: 'ultra', ids, steps: 500 });
  ok(lo.hash === hi.hash, `${jobId}: 進化 18 種の trace が low / ultra で一致`);
}

T.finish();
