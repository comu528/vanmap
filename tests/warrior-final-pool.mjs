// 戦士 最終Wave 2/16: プール分離（M8-E §10）。Node.js 標準機能のみ。
//   - 最終Wave の 10 件が戦士専用で、火 / 氷の抽選へ 1 件も漏れない
//   - SkillCatalog = SkillDraftManager = poolEligibility が一致する
//   - active30 + passive4 のすべてが抽選に出る（死に候補なし）
//   - 進化後の id が通常 draft へ出ない
// 実行: node tests/warrior-final-pool.mjs

import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { memberAllowedForJob } from '../src/systems/poolEligibility.js';
import { DATA, WARRIOR, FLAME, FROST, EXPECTED, draftCatalog, jobPools, seedRange, registeredIds, runner } from './warrior-common.mjs';

const T = runner('戦士 最終Wave プール分離（M8-E）');
const { ok, section, info } = T;

const catalog = draftCatalog();
const SEEDS = 200;
const NEW = [...EXPECTED.finalActives, ...EXPECTED.finalEvolutions];

section('1. 新 active5 は jobs:["warrior"] / isCommon:false');
for (const id of EXPECTED.finalActives) {
  const s = DATA.skills.find((x) => x.id === id);
  ok((s.jobs || []).join(',') === 'warrior', `${id}: jobs=["warrior"]`);
  ok(s.isCommon === false, `${id}: isCommon=false（共通プールへ出ない）`);
}

section('2. poolEligibility: 各メンバーは 1 ジョブにのみ適格');
{
  const JOBS = { warrior: jobPools('warrior'), flame_witch: jobPools('flame_witch'), frost_mage: jobPools('frost_mage') };
  const members = [...DATA.skills.map((s) => ({ ...s, category: 'active' })), ...DATA.passives.map((p) => ({ ...p, category: 'passive' }))];
  for (const m of members) {
    const allowed = Object.entries(JOBS).filter(([, j]) => memberAllowedForJob(m, j)).map(([k]) => k);
    ok(allowed.length <= 1, `${m.id}: 適格ジョブは最大 1（${allowed.join(',') || 'なし'}）`);
    if (EXPECTED.finalActives.includes(m.id)) ok(allowed[0] === 'warrior', `${m.id}: 戦士のみ適格`);
  }
}

section('3. SkillCatalog の一覧 = poolEligibility の適格集合');
{
  const ids = registeredIds();
  const cat = buildCatalog({ skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs, jobId: 'warrior', registeredIds: ids, runtimeStateIds: ids });
  const catalogIds = new Set(cat.actives.map((a) => a.id));
  const job = jobPools('warrior');
  const eligible = new Set(DATA.skills.filter((s) => memberAllowedForJob({ ...s, category: 'active' }, job)).map((s) => s.id));
  ok(catalogIds.size === EXPECTED.activeCount && eligible.size === EXPECTED.activeCount,
    `active: カタログ ${catalogIds.size} = 適格 ${eligible.size} = ${EXPECTED.activeCount}`);
  for (const id of EXPECTED.finalActives) {
    ok(catalogIds.has(id), `${id}: カタログに載る`);
    ok(eligible.has(id), `${id}: 適格集合に載る`);
  }
  // 進化後の id は active の適格集合に入らない（通常 draft へ出ない）。
  for (const id of WARRIOR.evolutionPool) ok(!eligible.has(id), `${id}: 進化は通常 draft の適格集合に入らない`);
  ok(cat.passives.length === 4, `passive 4 件（${cat.passives.length}）`);
  ok(cat.evolutions.length === 18, `進化 18 件（${cat.evolutions.length}）`);
}

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
    ok(leak === 0, `${jid}: 最終Wave のスキルが 1 件も出ない（${leak}）`);
    info(`${jid}: 固有 id ${seen.size} 種`);
  }
}

section('5. active30 + passive4 のすべてが抽選で出現する（死に候補なし）');
{
  const job = jobPools('warrior');
  const seen = new Set();
  for (const s of seedRange(SEEDS * 4)) {
    const owned = { active: {}, passive: {} };
    if (s % 3 === 1) for (const id of EXPECTED.actives.slice(0, 3)) owned.active[id] = 4;
    const d = new SkillDraftManager({});
    const c = d._generate({ catalog, job, owned, slots: { active: { used: Object.keys(owned.active).length, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3 }, s);
    for (const x of c) seen.add(x.id);
  }
  for (const id of [...EXPECTED.actives, ...EXPECTED.passives]) ok(seen.has(id), `${id}: 抽選候補に出る`);
  for (const id of WARRIOR.evolutionPool) ok(!seen.has(id), `${id}: 進化は通常候補に出ない`);
  info(`初回候補で出現した戦士 id ${seen.size} 種`);
}

section('6. 火 / 氷のプールが 1 件も変わっていない');
for (const j of [FLAME, FROST]) {
  ok(j.activeSkillPool.length === 30, `${j.id}: active 30`);
  ok(j.evolutionPool.length === 18, `${j.id}: 進化 18`);
  ok((j.passiveSkillPool || []).length === 4, `${j.id}: passive 4`);
  for (const id of NEW) ok(!j.activeSkillPool.includes(id) && !j.evolutionPool.includes(id), `${j.id}: ${id} を含まない`);
}
ok(WARRIOR.activeSkillPool.length === 30 && WARRIOR.evolutionPool.length === 18, '戦士は 30/18（火 / 氷と同規模）');

T.finish();
