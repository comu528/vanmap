// M9-A 横断監査 4/25: 品質 4 段階で gameplay trace が byte-identical（最重要）。
// production の SkillManager / 全スキル class / WarriorCombatSystem を実駆動し、
// 同じ配置・同じ dt で quality だけを変えた 4 run の trace（cast / hit / damage / kill /
// runtimeState / 呼び出し列ハッシュ / 戦士資源）を比較する。
// M9-A の cap 分類（gameplay = 単一値）を巻き戻すと、このテストが必ず落ちる。
// 実行: node tests/cross-job-quality-gameplay-invariance.mjs（HEAVY=1 で長時間 run）
import { JOB_IDS, QUALITIES, HEAVY, poolsOf, runJob, runner } from './cross-job-common.mjs';

const T = runner('品質不変性: gameplay trace（M9-A）');
const { ok, section, info } = T;
const STEPS = HEAVY ? 2400 : 800;

for (const jobId of JOB_IDS) {
  const p = poolsOf(jobId);
  for (const [label, ids] of [['active 30', p.active], ['evolution 18', p.evolution]]) {
    section(`${jobId}: ${label} を同時所持して品質 4 段階を比較`);
    const runs = {};
    for (const q of QUALITIES) runs[q] = await runJob(jobId, { quality: q, ids, steps: STEPS });
    const base = runs.high;
    for (const q of QUALITIES) {
      ok(runs[q].hash === base.hash, `${jobId}/${label}: ${q} の gameplay trace が high と一致`);
      if (runs[q].hash !== base.hash) {
        // 差分の内訳を出す（デバッグ補助）。
        for (const id of ids) {
          const a = JSON.stringify(runs[q].trace.stats[id]), b = JSON.stringify(base.trace.stats[id]);
          if (a !== b) info(`  差分 ${id}: ${q}=${a} high=${b}`);
        }
        info(`  calls: ${q}=${runs[q].trace.calls.count} high=${base.trace.calls.count}`);
      }
    }
    // 個別スキル単位でも確認（1 run の statsList が per-id なので、全 id が一致 ＝ 全 48 skill の quality 差ゼロ）。
    for (const id of ids) {
      const a = JSON.stringify(runs.low.trace.stats[id]);
      const b = JSON.stringify(runs.ultra.trace.stats[id]);
      ok(a === b, `${id}: low と ultra で cast / hit / damage / kill / extra が一致`);
    }
    // runtimeState（cooldown / 再開状態）も一致。
    ok(JSON.stringify(runs.low.trace.runtime) === JSON.stringify(runs.ultra.trace.runtime),
      `${jobId}/${label}: runtimeState が low / ultra で一致`);
    if (jobId === 'warrior') {
      ok(JSON.stringify(runs.low.trace.warrior) === JSON.stringify(runs.ultra.trace.warrior),
        `warrior/${label}: 闘気 / コンボ / 体勢 / telemetry が low / ultra で一致`);
    }
    info(`${jobId}/${label}: calls ${base.trace.calls.count} 件 / trace hash ${base.hash.slice(0, 12)}…`);
  }
}

section('great_cleave の再検証（M8-F の 58 → 59 分岐が解消していること）');
{
  const runs = {};
  for (const q of QUALITIES) runs[q] = await runJob('warrior', { quality: q, ids: ['great_cleave'], steps: HEAVY ? 3600 : 1800 });
  const casts = QUALITIES.map((q) => runs[q].trace.stats.great_cleave.casts);
  ok(new Set(casts).size === 1, `great_cleave: 4 品質で主発動が一致（${casts.join('/')}）`);
  const hits = QUALITIES.map((q) => runs[q].trace.stats.great_cleave.hits);
  ok(new Set(hits).size === 1, `great_cleave: 4 品質で命中数が一致（${hits.join('/')}）`);
}

T.finish();
