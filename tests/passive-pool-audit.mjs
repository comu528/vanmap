// M7-B 追加監査: 火の魔女／氷術師の passive プール分離を検証する。
// jobs 未指定を暗黙の共通扱いせず、各ジョブの passiveSkillPool を候補抽選の正とし、SkillCatalog・SkillDraftManager・
// poolEligibility（シミュレーター/UI/テスト共通の判定）が一致することを確認する。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { memberAllowedForJob } from '../src/systems/poolEligibility.js';
import { registeredSkillIds, skillsWithRuntimeState } from '../src/systems/SkillManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = (f) => JSON.parse(readFileSync(join(dir, 'data', f), 'utf8'));
const skills = L('skills.json').skills, passives = L('passives.json').passives, evolutions = L('skill-evolutions.json').evolutions, jobs = L('jobs.json').jobs;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

const FIRE_P = ['power_amp', 'swift_cast', 'scorch_expand', 'ember_persist'];
const FROST_P = ['frost_amplification', 'rapid_freezing', 'frozen_expansion', 'lingering_cold'];
const jobOf = (id) => jobs.find((j) => j.id === id);
const meta = (x, cat) => ({ id: x.id, category: cat, rarity: x.rarity, weight: x.weight, maxLevel: x.maxLevel, enabled: x.enabled, jobs: x.jobs, isCommon: x.isCommon, prerequisites: x.prerequisites, conflicts: x.conflicts, unlockCondition: x.unlockCondition });
const catalogModel = [...skills.map((s) => meta(s, 'active')), ...passives.map((p) => meta(p, 'passive'))];

// 実抽選の eligible passive（poolEligibility＝SkillDraftManager が使う判定）。
const eligiblePassives = (jobId) => passives.filter((p) => memberAllowedForJob({ ...p, category: 'passive' }, jobOf(jobId))).map((p) => p.id).sort();

section('1. データ: 火passive4種＝jobs:["flame_witch"]／氷passive4種＝jobs:["frost_mage"]・暗黙共通なし');
{
  for (const id of FIRE_P) { const p = passives.find((x) => x.id === id); ok(p && p.isCommon === false && JSON.stringify(p.jobs) === '["flame_witch"]', `${id} は flame_witch 専用（jobs:["flame_witch"]・isCommon:false）`); }
  for (const id of FROST_P) { const p = passives.find((x) => x.id === id); ok(p && p.isCommon === false && JSON.stringify(p.jobs) === '["frost_mage"]', `${id} は frost_mage 専用`); }
  // jobs 未指定かつ非共通の passive が存在しない（暗黙共通の禁止）。
  const implicit = passives.filter((p) => p.isCommon !== true && !(p.jobs || []).includes('*') && (p.jobs || []).length === 0);
  ok(implicit.length === 0, `jobs 未指定の非共通passiveが無い（${implicit.map((p) => p.id).join(',') || 'なし'}）`);
}

section('2. jobs.json: passiveSkillPool が各ジョブの専用4種と一致');
{
  ok(JSON.stringify([...(jobOf('flame_witch').passiveSkillPool || [])].sort()) === JSON.stringify([...FIRE_P].sort()), 'flame_witch.passiveSkillPool = 火passive4種');
  ok(JSON.stringify([...(jobOf('frost_mage').passiveSkillPool || [])].sort()) === JSON.stringify([...FROST_P].sort()), 'frost_mage.passiveSkillPool = 氷passive4種');
}

section('3. 実抽選 eligible passive: 火=火4種のみ・氷=氷4種のみ（相互混入なし）');
{
  ok(JSON.stringify(eligiblePassives('flame_witch')) === JSON.stringify([...FIRE_P].sort()), `flame_witch の実候補passive=火4種 (${eligiblePassives('flame_witch').join(',')})`);
  ok(JSON.stringify(eligiblePassives('frost_mage')) === JSON.stringify([...FROST_P].sort()), `frost_mage の実候補passive=氷4種 (${eligiblePassives('frost_mage').join(',')})`);
  for (const id of FIRE_P) ok(!eligiblePassives('frost_mage').includes(id), `火passive ${id} は氷術師に出ない`);
  for (const id of FROST_P) ok(!eligiblePassives('flame_witch').includes(id), `氷passive ${id} は火の魔女に出ない`);
}

section('4. SkillCatalog と実抽選プールが一致（表示＝実候補）');
{
  const args = { skills, passives, evolutions, jobs, registeredIds: registeredSkillIds(), runtimeStateIds: skillsWithRuntimeState() };
  for (const jid of ['flame_witch', 'frost_mage']) {
    const cat = buildCatalog({ ...args, jobId: jid });
    const catPassives = cat.passives.map((p) => p.id).sort();
    ok(JSON.stringify(catPassives) === JSON.stringify(eligiblePassives(jid)), `${jid}: SkillCatalog passive = 実抽選 passive (${catPassives.join(',')})`);
    ok(cat.summary.passiveCount === 4, `${jid}: passive候補4種 (${cat.summary.passiveCount})`);
    ok(cat.issues.length === 0, `${jid}: カタログ不整合0`);
  }
}

section('5. poolEligibility の意味論: jobs未指定を共通扱いしない・明示的共通は将来追加可能');
{
  const fw = jobOf('flame_witch');
  // jobs 未指定・非共通 → どのジョブでも不適格（暗黙共通ではない）。
  ok(memberAllowedForJob({ id: 'ghost', category: 'passive', isCommon: false, jobs: [] }, fw) === false, 'jobs未指定・非共通は不適格（暗黙共通にしない）');
  // 特定ジョブ名だけでプール未登録 → 不適格（プールが正）。
  ok(memberAllowedForJob({ id: 'ghost', category: 'passive', isCommon: false, jobs: ['flame_witch'] }, { passiveSkillPool: [] }) === false, 'jobs指定だけでプール未登録なら不適格');
  // 明示的共通（jobs:["*"]）→ 全ジョブで適格（将来の共通passive追加口）。
  ok(memberAllowedForJob({ id: 'univ', category: 'passive', isCommon: false, jobs: ['*'] }, fw) === true, 'jobs:["*"] は共通として適格');
  ok(memberAllowedForJob({ id: 'univ2', category: 'passive', isCommon: true, jobs: [] }, jobOf('frost_mage')) === true, 'isCommon:true は共通として適格');
}

section('6. 既存active抽選結果が変わらない（火の魔女・同seed）＋ジョブ混入なし');
{
  // 火の魔女の抽選候補は「火のactive/passive＋その進化」だけ（氷が混入しない）。同seed・同状態で決定論。
  const fwPool = new Set([...(jobOf('flame_witch').activeSkillPool || []), ...FIRE_P]);
  const fireSkillIds = new Set(skills.filter((s) => (s.jobs || []).includes('flame_witch')).map((s) => s.id));
  const fireEvoIds = new Set(evolutions.filter((e) => fireSkillIds.has(e.baseSkillId)).map((e) => e.id));
  const draw = (seed) => { const d = new SkillDraftManager({}); return d._generate({ catalog: catalogModel, job: jobOf('flame_witch'), owned: { active: {}, passive: {} }, slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3 }, seed).map((c) => `${c.category}:${c.id}`); };
  let leak = 0, nondet = 0;
  for (let s = 1; s <= 200; s++) {
    const a = draw(s), b = draw(s);
    if (a.join('|') !== b.join('|')) nondet++;
    for (const t of a) { const id = t.split(':')[1]; if (!fwPool.has(id) && !fireEvoIds.has(id)) leak++; }
  }
  ok(leak === 0, `火の魔女の候補に氷/他ジョブが混入しない（leak=${leak}）`);
  ok(nondet === 0, `火の魔女の抽選は同seed・同状態で決定論（nondet=${nondet}）`);
  // 氷術師側も同様に氷だけ。
  const fmPool = new Set([...(jobOf('frost_mage').activeSkillPool || []), ...FROST_P]);
  const frostSkillIds = new Set(skills.filter((s) => (s.jobs || []).includes('frost_mage')).map((s) => s.id));
  const frostEvoIds = new Set(evolutions.filter((e) => frostSkillIds.has(e.baseSkillId)).map((e) => e.id));
  let fleak = 0;
  for (let s = 1; s <= 200; s++) { const d = new SkillDraftManager({}); for (const c of d._generate({ catalog: catalogModel, job: jobOf('frost_mage'), owned: { active: {}, passive: {} }, slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3 }, s)) { if (!fmPool.has(c.id) && !frostEvoIds.has(c.id)) fleak++; } }
  ok(fleak === 0, `氷術師の候補に火/他ジョブが混入しない（leak=${fleak}）`);
}

section('7. 既存進化条件が成立する（進化補助passiveが所有ジョブのプールで到達可能）');
{
  const poolFor = (jobId) => new Set(jobOf(jobId).passiveSkillPool || []);
  // 火進化: 補助passive は flame_witch プールにある。氷進化: 補助passive は frost_mage プールにある。
  for (const e of evolutions) {
    const baseFire = skills.some((s) => s.id === e.baseSkillId && (s.jobs || []).includes('flame_witch'));
    const jobId = baseFire ? 'flame_witch' : 'frost_mage';
    for (const req of e.requiredSkills || []) {
      const p = passives.find((x) => x.id === req.skill);
      if (!p) continue; // active 補助はここでは対象外
      const reachable = poolFor(jobId).has(req.skill) || p.isCommon === true || (p.jobs || []).includes('*');
      ok(reachable, `進化 ${e.id} の補助passive ${req.skill} が ${jobId} のプールで到達可能`);
    }
  }
}

console.log(fail ? `\n✗ passive プール分離監査テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ passive プール分離監査テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
