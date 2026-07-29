// 戦士 Wave2 2/21: プール分離（M8-D §カタログ）。Node.js 標準機能のみ。
// Wave2 の 10 active / 5 evolution が戦士専用であり、火 / 氷の抽選へ 1 件も漏れないことを見る。
//   - poolEligibility.memberAllowedForJob（production）で各メンバーが 1 ジョブにしか適格でない
//   - 実抽選（SkillDraftManager._generate）を 200 seed 回して他ジョブ混入 0 件
//   - active25 + passive4 のすべてが抽選に出る（死に候補が無い）
//   - 火 / 氷のプールが 1 件も変わっていない
// 実行: node tests/warrior-wave2-pool.mjs

import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { memberAllowedForJob } from '../src/systems/poolEligibility.js';
import { DATA, WARRIOR, FLAME, FROST, EXPECTED, draftCatalog, jobPools, seedRange, registeredIds, runner } from './warrior-common.mjs';

const T = runner('戦士 Wave2 プール分離（M8-D）');
const { ok, section, info } = T;

const catalog = draftCatalog();
const SEEDS = 200;
const NEW = [...EXPECTED.wave2Actives, ...EXPECTED.wave2Evolutions];

// ===== 1. data 側の宣言 =====
section('1. 新 active10 は jobs:["warrior"] / isCommon:false');
for (const id of EXPECTED.wave2Actives) {
  const s = DATA.skills.find((x) => x.id === id);
  ok((s.jobs || []).join(',') === 'warrior', `${id}: jobs=["warrior"]`);
  ok(s.isCommon === false, `${id}: isCommon=false（共通プールへ出ない）`);
}

// ===== 2. poolEligibility =====
section('2. poolEligibility: 各メンバーは 1 ジョブにのみ適格');
{
  const JOBS = { warrior: jobPools('warrior'), flame_witch: jobPools('flame_witch'), frost_mage: jobPools('frost_mage') };
  const members = [...DATA.skills.map((s) => ({ ...s, category: 'active' })), ...DATA.passives.map((p) => ({ ...p, category: 'passive' }))];
  for (const m of members) {
    const allowed = Object.entries(JOBS).filter(([, j]) => memberAllowedForJob(m, j)).map(([k]) => k);
    ok(allowed.length <= 1, `${m.id}: 適格ジョブは最大 1（${allowed.join(',') || 'なし'}）`);
    if (EXPECTED.wave2Actives.includes(m.id)) ok(allowed[0] === 'warrior', `${m.id}: 戦士のみ適格`);
  }
}

// ===== 3. SkillCatalog と適格集合が一致 =====
section('3. SkillCatalog の一覧 = poolEligibility の適格集合');
{
  const ids = registeredIds();
  const cat = buildCatalog({ skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs, jobId: 'warrior', registeredIds: ids, runtimeStateIds: ids });
  const catalogIds = new Set(cat.actives.map((a) => a.id));
  const job = jobPools('warrior');
  const eligible = new Set(DATA.skills.filter((s) => memberAllowedForJob({ ...s, category: 'active' }, job)).map((s) => s.id));
  ok(catalogIds.size === EXPECTED.activeCount && eligible.size === EXPECTED.activeCount,
    `active: カタログ ${catalogIds.size} = 適格 ${eligible.size} = ${EXPECTED.activeCount}`);
  for (const id of EXPECTED.wave2Actives) {
    ok(catalogIds.has(id), `${id}: カタログに載る`);
    ok(eligible.has(id), `${id}: 適格集合に載る`);
  }
}

// ===== 4. 実抽選で他ジョブへ漏れない =====
section('4. 実抽選: 200 seed で他ジョブ混入が 0 件');
{
  const NEWSET = new Set(NEW);
  for (const jid of ['flame_witch', 'frost_mage']) {
    const job = jobPools(jid);
    let leak = 0;
    const seen = new Set();
    for (const s of seedRange(SEEDS)) {
      const d = new SkillDraftManager({});
      const c = d._generate({ catalog, job, owned: { active: {}, passive: {} }, slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3 }, s);
      for (const x of c) { seen.add(x.id); if (NEWSET.has(x.id)) leak++; }
    }
    ok(leak === 0, `${jid}: Wave2 のスキルが 1 件も出ない（${leak}）`);
    info(`${jid}: 固有 id ${seen.size} 種`);
  }
}

// ===== 5. 戦士側は 25 active + 4 passive がすべて出る =====
section('5. active25 + passive4 のすべてが抽選で出現する（死に候補なし）');
{
  const job = jobPools('warrior');
  const seen = new Set();
  // 所持なし・所持ありの両方を回して、new_active / up_active の両方向を踏む。
  for (const s of seedRange(SEEDS * 3)) {
    const owned = { active: {}, passive: {} };
    if (s % 3 === 1) for (const id of EXPECTED.actives.slice(0, 3)) owned.active[id] = 4;
    const d = new SkillDraftManager({});
    const c = d._generate({ catalog, job, owned, slots: { active: { used: Object.keys(owned.active).length, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3 }, s);
    for (const x of c) seen.add(x.id);
  }
  for (const id of [...EXPECTED.actives, ...EXPECTED.passives]) ok(seen.has(id), `${id}: 抽選候補に出る`);
  info(`初回候補で出現した戦士 id ${seen.size} 種`);
}

// ===== 6. 火 / 氷のプール不変 =====
section('6. 火 / 氷のプールが 1 件も変わっていない');
for (const j of [FLAME, FROST]) {
  ok(j.activeSkillPool.length === 30, `${j.id}: active 30`);
  ok(j.evolutionPool.length === 18, `${j.id}: 進化 18`);
  ok((j.passiveSkillPool || []).length === 4, `${j.id}: passive 4`);
  for (const id of NEW) ok(!j.activeSkillPool.includes(id) && !j.evolutionPool.includes(id), `${j.id}: ${id} を含まない`);
}
ok(WARRIOR.activeSkillPool.length === 25 && WARRIOR.evolutionPool.length === 13, '戦士は 25/13');

T.finish();
