// M8-C 2/19: プール分離（3ジョブ・active15/passive4/evolution8）。Node.js 標準機能のみ。
// Wave1 で 10 active を足しても、火の魔女 / 氷術師の候補へ 1 件も漏れないことを production の
// poolEligibility / SkillDraftManager で検証する。
// 実行: node tests/warrior-wave1-pool.mjs

import { memberAllowedForJob } from '../src/systems/poolEligibility.js';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { DATA, WARRIOR, FLAME, FROST, EXPECTED, draftCatalog, jobPools, seedRange, registeredIds, runner } from './warrior-common.mjs';

const T = runner('戦士 Wave1 プール分離（M8-C）');
const { ok, section, info } = T;

const catalog = draftCatalog();
const JOBS = { warrior: jobPools('warrior'), flame_witch: jobPools('flame_witch'), frost_mage: jobPools('frost_mage') };
const SEEDS = Number(process.env.HEAVY) ? 600 : 200;

// ===== 1. データ宣言 =====
section('1. 新 active10 は jobs:["warrior"] / isCommon:false');
for (const id of EXPECTED.wave1Actives) {
  const s = DATA.skills.find((x) => x.id === id);
  ok(Array.isArray(s.jobs) && s.jobs.length === 1 && s.jobs[0] === 'warrior', `${id}: jobs=["warrior"]`);
  ok(s.isCommon === false && !s.jobs.includes('*'), `${id}: 明示共通ではない`);
}
{
  const explicitCommon = [...DATA.skills, ...DATA.passives].filter((m) => m.isCommon === true || (Array.isArray(m.jobs) && m.jobs.includes('*')));
  ok(explicitCommon.length === 0, `明示共通は 0 件（${explicitCommon.map((m) => m.id).join(',') || 'なし'}）`);
}

// ===== 2. 各メンバーの適格ジョブは最大 1 =====
section('2. poolEligibility: 各メンバーは 1 ジョブにのみ適格');
{
  const all = [
    ...DATA.skills.map((s) => ({ ...s, category: 'active' })),
    ...DATA.passives.map((p) => ({ ...p, category: 'passive' })),
  ];
  for (const m of all) {
    const allowed = Object.entries(JOBS).filter(([, j]) => memberAllowedForJob(m, j)).map(([k]) => k);
    ok(allowed.length <= 1, `${m.id}: 適格ジョブは最大 1（実際 ${allowed.join(',') || 'なし'}）`);
    if (EXPECTED.wave1Actives.includes(m.id)) ok(allowed[0] === 'warrior', `${m.id}: 戦士のみ適格`);
  }
}

// ===== 3. SkillCatalog = poolEligibility（表示と抽選の一致）=====
section('3. SkillCatalog の一覧 = poolEligibility の適格集合');
{
  const regIds = registeredIds();
  const cat = buildCatalog({
    skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs,
    jobId: 'warrior', registeredIds: regIds, runtimeStateIds: [],
  });
  const catalogIds = new Set(cat.actives.map((a) => a.id));
  const eligible = new Set(DATA.skills.filter((s) => memberAllowedForJob({ ...s, category: 'active' }, JOBS.warrior)).map((s) => s.id));
  ok(catalogIds.size === EXPECTED.activeCount && eligible.size === EXPECTED.activeCount,
    `active: カタログ ${catalogIds.size} = 適格 ${eligible.size} = ${EXPECTED.activeCount}`);
  ok([...catalogIds].every((id) => eligible.has(id)), 'カタログの全 active が適格集合にある');
  ok(WARRIOR.activeSkillPool.every((id) => catalogIds.has(id)), 'プール宣言の全 active がカタログにある');
  const catPassives = new Set(cat.passives.map((p) => p.id));
  ok(catPassives.size === 4, `passive: カタログ ${catPassives.size} = 4`);
}

// ===== 4. 実抽選で混入 0 =====
section(`4. 実抽選: ${SEEDS} seed で他ジョブ混入が 0 件`);
for (const jid of Object.keys(JOBS)) {
  const allowed = new Set([...JOBS[jid].activeSkillPool, ...JOBS[jid].passiveSkillPool]);
  let leak = 0, total = 0;
  const seen = new Set();
  for (const s of seedRange(SEEDS)) {
    const d = new SkillDraftManager({});
    for (const c of d._generate({
      catalog, job: JOBS[jid], owned: { active: {}, passive: {} },
      slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3,
    }, s)) { total++; seen.add(c.id); if (!allowed.has(c.id)) leak++; }
  }
  ok(leak === 0, `${jid}: 他ジョブ混入 0（leak=${leak} / 候補 ${total}）`);
  info(`${jid}: 固有 id ${seen.size} 種`);
}

// ===== 5. 戦士 19 種（active15 + passive4）すべてが抽選で出る =====
section('5. active15 + passive4 のすべてが抽選で出現する（死に候補なし）');
{
  const seen = new Set();
  for (const s of seedRange(SEEDS * 3)) {
    const d = new SkillDraftManager({});
    for (const c of d._generate({
      catalog, job: JOBS.warrior, owned: { active: {}, passive: {} },
      slots: { active: { used: 0, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 4,
    }, s)) seen.add(c.id);
  }
  for (const id of [...WARRIOR.activeSkillPool, ...WARRIOR.passiveSkillPool]) {
    ok(seen.has(id), `${id}: 初回候補で出現する`);
  }
  info(`初回候補で出現した戦士 id ${seen.size} 種 / 19 種`);
}

// ===== 6. 火 / 氷のプール規模が変わらない =====
section('6. 火 / 氷のプールが 1 件も変わっていない');
{
  ok(FLAME.activeSkillPool.length === 30 && FLAME.evolutionPool.length === 18, '火 30/18');
  ok(FROST.activeSkillPool.length === 30 && FROST.evolutionPool.length === 18, '氷 30/18');
  const warriorIds = new Set([...WARRIOR.activeSkillPool, ...WARRIOR.passiveSkillPool, ...WARRIOR.evolutionPool]);
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    for (const id of [...j.activeSkillPool, ...(j.passiveSkillPool || []), ...(j.evolutionPool || [])]) {
      ok(!warriorIds.has(id), `${jid}: ${id} が戦士プールと重ならない`);
    }
  }
}

T.finish();
