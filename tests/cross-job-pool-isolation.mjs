// M9-A 横断監査 2/25: プール分離と poolEligibility の単一性。Node.js 標準機能のみ。
// 実行: node tests/cross-job-pool-isolation.mjs
import { DATA, JOB_IDS, poolsOf, runner } from './cross-job-common.mjs';
import { memberAllowedForJob } from '../src/systems/poolEligibility.js';

const T = runner('3 ジョブ プール分離（M9-A）');
const { ok, section, info } = T;

section('1. 3 ジョブのプールが互いに素（active / passive / evolution）');
for (const kind of ['active', 'passive', 'evolution']) {
  for (let a = 0; a < JOB_IDS.length; a++) {
    for (let b = a + 1; b < JOB_IDS.length; b++) {
      const A = new Set(poolsOf(JOB_IDS[a])[kind]);
      const inter = poolsOf(JOB_IDS[b])[kind].filter((id) => A.has(id));
      ok(inter.length === 0, `${kind}: ${JOB_IDS[a]} ∩ ${JOB_IDS[b]} = ∅（${inter.join(',') || 'なし'}）`);
    }
  }
}

section('2. memberAllowedForJob（production）が単一の正: プール所属 ⇔ 適格');
{
  const members = [
    ...DATA.skills.map((s) => ({ ...s, category: s.category || 'active' })),
    ...DATA.passives.map((p) => ({ ...p, category: 'passive' })),
  ];
  for (const m of members) {
    const allowedJobs = JOB_IDS.filter((j) => memberAllowedForJob(m, DATA.jobs.find((x) => x.id === j)));
    const poolJobs = JOB_IDS.filter((j) => {
      const p = poolsOf(j);
      return p.active.includes(m.id) || p.passive.includes(m.id);
    });
    ok(allowedJobs.join(',') === poolJobs.join(','),
      `${m.id}: 適格ジョブ = プール所属（${allowedJobs.join(',') || 'なし'}）`);
    ok(allowedJobs.length <= 1, `${m.id}: 適格ジョブは最大 1 つ（${allowedJobs.length}）`);
  }
  info(`メンバー ${members.length} 件を全数確認`);
}

section('3. 暗黙の common が 0（isCommon / jobs:["*"] とも明示 0 件）');
{
  ok(DATA.skills.filter((s) => s.isCommon === true).length === 0, 'isCommon:true の skill 0 件');
  ok(DATA.passives.filter((p) => p.isCommon === true).length === 0, 'isCommon:true の passive 0 件');
  ok(DATA.skills.filter((s) => (s.jobs || []).includes('*')).length === 0, 'jobs:["*"] の skill 0 件');
  for (const s of DATA.skills) ok(Array.isArray(s.jobs) && s.jobs.length === 1, `${s.id}: jobs が明示された 1 ジョブ`);
  for (const p of DATA.passives) ok(Array.isArray(p.jobs) && p.jobs.length === 1, `${p.id}: jobs が明示された 1 ジョブ`);
}

section('4. 進化の base / 補助が同一ジョブ内に閉じる');
for (const j of JOB_IDS) {
  const p = poolsOf(j);
  const inJob = new Set([...p.active, ...p.passive]);
  for (const evoId of p.evolution) {
    const e = DATA.evolutions.find((x) => x.id === evoId);
    ok(!!e, `${evoId}: data がある`);
    if (!e) continue;
    ok(inJob.has(e.baseSkillId), `${evoId}: base ${e.baseSkillId} が ${j} のプール内`);
    for (const r of e.requiredSkills || []) ok(inJob.has(r.skill), `${evoId}: 補助 ${r.skill} が ${j} のプール内`);
  }
}

T.finish();
