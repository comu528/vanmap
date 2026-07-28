// 戦士 2/17: プール分離（M8-B §2）。Node.js 標準機能のみ。
// 戦士 active5 / passive4 / evolution3 が火の魔女・氷術師の候補へ 1 件も出ないこと、
// 逆に火/氷のスキルが戦士の候補へ 1 件も出ないことを production の poolEligibility で検証する。
// 実行: node tests/warrior-pool-eligibility.mjs

import { memberAllowedForJob } from '../src/systems/poolEligibility.js';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, WARRIOR, FLAME, FROST, draftCatalog, jobPools, seedRange, runner } from './warrior-common.mjs';

const T = runner('戦士 プール分離監査（M8-B）');
const { ok, section, info } = T;

const catalog = draftCatalog();
const JOBS = { warrior: jobPools('warrior'), flame_witch: jobPools('flame_witch'), frost_mage: jobPools('frost_mage') };

// ===== 1. データ上の宣言 =====
section('1. データ: 戦士の active5 / passive4 は jobs:["warrior"]・暗黙共通なし');
for (const id of WARRIOR.activeSkillPool) {
  const s = DATA.skills.find((x) => x.id === id);
  ok(Array.isArray(s.jobs) && s.jobs.length === 1 && s.jobs[0] === 'warrior', `${id}: jobs=["warrior"]`);
  ok(s.isCommon === false && !s.jobs.includes('*'), `${id}: 明示共通ではない`);
}
for (const id of WARRIOR.passiveSkillPool) {
  const p = DATA.passives.find((x) => x.id === id);
  ok(Array.isArray(p.jobs) && p.jobs.length === 1 && p.jobs[0] === 'warrior', `${id}: jobs=["warrior"]`);
  ok(p.isCommon === false && !p.jobs.includes('*'), `${id}: 明示共通ではない`);
}
const explicitCommon = [...DATA.skills, ...DATA.passives].filter((m) => m.isCommon === true || (Array.isArray(m.jobs) && m.jobs.includes('*')));
ok(explicitCommon.length === 0, `明示共通は 0 件（${explicitCommon.map((m) => m.id).join(',') || 'なし'}）`);

// ===== 2. memberAllowedForJob の適格性（3ジョブ総当たり）=====
section('2. poolEligibility: 各メンバーは 1 ジョブにのみ適格');
const allMembers = [
  ...DATA.skills.map((s) => ({ ...s, category: 'active' })),
  ...DATA.passives.map((p) => ({ ...p, category: 'passive' })),
];
for (const m of allMembers) {
  const jobsAllowed = Object.entries(JOBS).filter(([, j]) => memberAllowedForJob(m, j)).map(([k]) => k);
  ok(jobsAllowed.length <= 1, `${m.id}: 適格ジョブは最大1（実際 ${jobsAllowed.join(',') || 'なし'}）`);
  if (WARRIOR.activeSkillPool.includes(m.id) || WARRIOR.passiveSkillPool.includes(m.id)) {
    ok(jobsAllowed.length === 1 && jobsAllowed[0] === 'warrior', `${m.id}: 戦士のみ適格`);
  }
  if (FLAME.activeSkillPool.includes(m.id) || FLAME.passiveSkillPool.includes(m.id)) {
    ok(jobsAllowed.length === 1 && jobsAllowed[0] === 'flame_witch', `${m.id}: 火の魔女のみ適格（戦士へ漏れない）`);
  }
  if (FROST.activeSkillPool.includes(m.id) || FROST.passiveSkillPool.includes(m.id)) {
    ok(jobsAllowed.length === 1 && jobsAllowed[0] === 'frost_mage', `${m.id}: 氷術師のみ適格（戦士へ漏れない）`);
  }
}

// ===== 3. jobs 未指定を暗黙共通にしない =====
section('3. jobs 未指定 / 空を暗黙共通にしない');
const orphan = allMembers.filter((m) => (!Array.isArray(m.jobs) || m.jobs.length === 0) && m.isCommon !== true);
for (const m of orphan) {
  for (const [jid, j] of Object.entries(JOBS)) {
    const inPool = (j.activeSkillPool || []).includes(m.id) || (j.passiveSkillPool || []).includes(m.id);
    ok(!memberAllowedForJob(m, j) || inPool, `${m.id}: jobs 未指定を暗黙共通として ${jid} へ出さない`);
  }
}
info(`jobs 未指定メンバー ${orphan.length} 件`);

// ===== 4. 実抽選（production SkillDraftManager）で混入 0 =====
section('4. 実抽選: 200 seed で他ジョブ混入が 0 件');
const poolIds = (jid) => new Set([...JOBS[jid].activeSkillPool, ...JOBS[jid].passiveSkillPool]);
for (const jid of Object.keys(JOBS)) {
  const allowed = poolIds(jid);
  let leak = 0, total = 0;
  const seen = new Set();
  for (const s of seedRange(200)) {
    const d = new SkillDraftManager({});
    const cands = d._generate({
      catalog, job: JOBS[jid], owned: { active: {}, passive: {} },
      slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3,
    }, s);
    for (const c of cands) { total++; seen.add(c.id); if (!allowed.has(c.id)) leak++; }
  }
  ok(leak === 0, `${jid}: 他ジョブ混入 0（leak=${leak} / 候補 ${total}）`);
  info(`${jid}: 200 seed で出現した固有 id ${seen.size} 種`);
}

// ===== 5. 戦士は全 9 種（active5 + passive4）が抽選で到達可能 =====
section('5. 戦士: active5 + passive4 のすべてが抽選で出現する（死に候補なし）');
{
  const seen = new Set();
  for (const s of seedRange(400)) {
    const d = new SkillDraftManager({});
    for (const c of d._generate({
      catalog, job: JOBS.warrior, owned: { active: {}, passive: {} },
      slots: { active: { used: 0, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 4,
    }, s)) seen.add(c.id);
  }
  for (const id of [...WARRIOR.activeSkillPool, ...WARRIOR.passiveSkillPool]) {
    ok(seen.has(id), `${id}: 400 seed の初回候補で出現する`);
  }
}

// ===== 6. 進化の補助 passive は同じジョブのプールで到達可能 =====
section('6. 進化条件（補助 passive Lv4）が戦士プール内で成立する');
for (const id of WARRIOR.evolutionPool) {
  const e = DATA.evolutions.find((x) => x.id === id);
  for (const req of e.requiredSkills || []) {
    const p = DATA.passives.find((x) => x.id === req.skill);
    ok(!!p && WARRIOR.passiveSkillPool.includes(req.skill), `${id}: 補助 ${req.skill} が戦士 passive プールにある`);
    ok(p && p.maxLevel >= req.level, `${id}: 補助 ${req.skill} は Lv${req.level} まで上げられる（maxLevel ${p?.maxLevel}）`);
  }
}

T.finish();
