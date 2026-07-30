// M9-A 横断監査 8/25: 進化 54 件の横断監査。Node.js 標準機能のみ。
// data 整合＋production（SkillCatalog / SkillDraftManager）で「条件を満たした所持状態なら提示される」ことを実駆動。
// 実行: node tests/cross-job-evolution-audit.mjs
import { DATA, JOB_IDS, poolsOf, runner, jobDraftBundle, computeEvolvables, simDraft } from './cross-job-common.mjs';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { evolutionPartnerIds } from '../src/systems/SkillCatalog.js';

const T = runner('進化 54 件 横断監査（M9-A）');
const { ok, section, info } = T;

section('1. data 整合（base / 補助 / 置換 / safetyCaps / Lv80）');
for (const e of DATA.evolutions) {
  const jobId = JOB_IDS.find((j) => poolsOf(j).evolution.includes(e.id));
  ok(!!jobId, `${e.id}: いずれかのジョブに属す`);
  if (!jobId) continue;
  const p = poolsOf(jobId);
  ok(p.active.includes(e.baseSkillId), `${e.id}: base ${e.baseSkillId} が同ジョブの active`);
  const base = DATA.skills.find((s) => s.id === e.baseSkillId);
  ok((e.requiredMasteryLevel || 0) <= 20, `${e.id}: requiredMasteryLevel が範囲内`);
  for (const r of e.requiredSkills || []) {
    const isActive = p.active.includes(r.skill);
    const isPassive = p.passive.includes(r.skill);
    ok(isActive || isPassive, `${e.id}: 補助 ${r.skill} が同ジョブのプール内（unknown support 0）`);
    const max = isActive ? ((DATA.skills.find((s) => s.id === r.skill) || {}).maxLevel || 8)
      : ((DATA.passives.find((x) => x.id === r.skill) || {}).maxLevel || 4);
    ok(r.level <= max, `${e.id}: 補助 ${r.skill} Lv${r.level} ≤ 最大 ${max}`);
  }
  ok(e.replacementSkillId === e.id, `${e.id}: replacementSkillId が自身`);
  ok(base && (base.maxLevel || 8) >= 1, `${e.id}: base の maxLevel が有効`);
  ok(e.lv80ProjectileTarget !== true, `${e.id}: Lv80 対象でない`);
  for (const [k, v] of Object.entries(e.safetyCaps || {})) {
    ok(typeof v === 'number' && Number.isFinite(v) && v > 0, `${e.id}.safetyCaps.${k} が正の有限数（${v}）`);
  }
}

section('2. 到達可能性: 条件を組めば production の抽選で提示される（54 件全数）');
for (const jobId of JOB_IDS) {
  const bundle = jobDraftBundle(jobId);
  for (const [evoId, r] of Object.entries(bundle.reqs)) {
    // 条件を満たす所持状態を構成する。
    const owned = { active: { [r.base]: r.baseLevel }, passive: {} };
    for (const a of r.aux) {
      if (a.kind === 'active') owned.active[a.id] = a.level; else owned.passive[a.id] = a.level;
    }
    const evolvables = computeEvolvables(bundle, owned, new Set());
    ok(evolvables.some((x) => x.evolutionId === evoId), `${evoId}: 条件成立で evolvable になる`);
    const draft = new SkillDraftManager({
      rarityWeights: DATA.skillConfig.rarityWeights, synergy: DATA.skillConfig.synergy, guidance: DATA.skillConfig.guidance,
    });
    draft.reset(7, {});
    const cands = draft.open({
      catalog: bundle.catalog, job: bundle.pools, owned,
      slots: { active: { used: Object.keys(owned.active).length, max: 8 }, passive: { used: Object.keys(owned.passive).length, max: 4 } },
      evolvables, evolvedBaseIds: [], need: 3, unlock: { highestClearedDifficulty: 0 },
      synergy: { partnerIds: evolutionPartnerIds(bundle.recipes, owned), battleLevel: 30 },
      jobId, evolutionRecipes: bundle.guidanceRecipes,
    });
    ok(cands.some((c) => c.kind === 'evolution' && c.id === evoId), `${evoId}: 候補として提示される`);
  }
}

section('3. active 補助の進化（3 ジョブ計）と取得実績');
{
  const activeSupport = [];
  for (const jobId of JOB_IDS) {
    const p = poolsOf(jobId);
    for (const evoId of p.evolution) {
      const e = DATA.evolutions.find((x) => x.id === evoId);
      if ((e.requiredSkills || []).some((r) => p.active.includes(r.skill))) activeSupport.push(evoId);
    }
  }
  info(`active 補助の進化: ${activeSupport.join(' ')}`);
  ok(activeSupport.length === 20, `active 補助の進化 計 20 件（火 14 / 氷 3 / 戦士 3・実測 ${activeSupport.length}）`);
  // 全 54 進化が「取得 0 でない」ことは各 completion スイートが 5 戦略合算で保証している。
  // ここでは単一戦略 100 seed でも大半が取得されることを横断確認する（低率 3 件は M8-F で構造由来と記録済み）。
  for (const jobId of JOB_IDS) {
    const takenEvos = new Set();
    for (let seed = 1; seed <= 100; seed++) {
      const r = simDraft(jobId, { seed, slotActive: 8, levelUps: 60 });
      for (const id of r.evolved) takenEvos.add(id);
    }
    const p = poolsOf(jobId);
    const missing = p.evolution.filter((id) => !takenEvos.has(id));
    info(`${jobId}: 単一戦略 100 seed で取得された進化 ${takenEvos.size}/18（未取得: ${missing.join(',') || 'なし'}）`);
    ok(takenEvos.size >= 12, `${jobId}: 100 seed で 12 種以上の進化が取得される（${takenEvos.size}）`);
  }
}

T.finish();
