// M9-A 横断監査 1/25: 3 ジョブ横断カタログ整合。Node.js 標準機能のみ。
// 実行: node tests/cross-job-catalog.mjs
import { DATA, JOB_IDS, jobOf, poolsOf, runner, registryMap } from './cross-job-common.mjs';
import { buildCatalog } from '../src/systems/SkillCatalog.js';

const T = runner('3 ジョブ横断カタログ（M9-A）');
const { ok, section, info } = T;
const REG = registryMap();

section('1. 各ジョブ 30 / 4 / 18 / 52・全体 90 / 12 / 54 / 156');
for (const j of JOB_IDS) {
  const p = poolsOf(j);
  ok(p.active.length === 30, `${j}: active 30（${p.active.length}）`);
  ok(p.passive.length === 4, `${j}: passive 4（${p.passive.length}）`);
  ok(p.evolution.length === 18, `${j}: evolution 18（${p.evolution.length}）`);
  ok(p.active.length + p.passive.length + p.evolution.length === 52, `${j}: 合計 52`);
}
ok(DATA.skills.length === 90, `skills.json 全体 90（${DATA.skills.length}）`);
ok(DATA.passives.length === 12, `passives.json 全体 12（${DATA.passives.length}）`);
ok(DATA.evolutions.length === 54, `skill-evolutions.json 全体 54（${DATA.evolutions.length}）`);
ok(DATA.skills.length + DATA.evolutions.length === 144, `skill + evolution = 144`);
ok(DATA.skills.length + DATA.evolutions.length + DATA.passives.length === 156, `全メンバー 156`);

section('2. id / displayName の重複 0');
{
  const ids = new Map();
  for (const s of DATA.skills) ids.set(s.id, (ids.get(s.id) || 0) + 1);
  for (const e of DATA.evolutions) ids.set(e.id, (ids.get(e.id) || 0) + 1);
  for (const p of DATA.passives) ids.set(p.id, (ids.get(p.id) || 0) + 1);
  const dup = [...ids].filter(([, n]) => n > 1).map(([k]) => k);
  ok(dup.length === 0, `id 重複 0（${dup.join(',') || 'なし'}）`);
  const names = new Map();
  for (const s of DATA.skills) names.set(s.name, (names.get(s.name) || 0) + 1);
  for (const e of DATA.evolutions) names.set(e.displayName, (names.get(e.displayName) || 0) + 1);
  for (const p of DATA.passives) names.set(p.displayName, (names.get(p.displayName) || 0) + 1);
  const ndup = [...names].filter(([, n]) => n > 1).map(([k]) => k);
  ok(ndup.length === 0, `displayName の意図しない衝突 0（${ndup.join(',') || 'なし'}）`);
}

section('3. unknown class 0 / orphan class 0 / JSON-only 0 / class-only 0');
{
  const inPool = new Set(JOB_IDS.flatMap((j) => { const p = poolsOf(j); return [...p.active, ...p.evolution]; }));
  for (const id of inPool) ok(!!REG[id], `${id}: SkillManager に登録がある（unknown class 0）`);
  const orphan = Object.keys(REG).filter((id) => !inPool.has(id));
  ok(orphan.length === 0, `どのジョブのプールにも属さない登録クラス 0（${orphan.join(',') || 'なし'}）`);
  for (const id of inPool) {
    const has = DATA.skills.some((s) => s.id === id) || DATA.evolutions.some((e) => e.id === id);
    ok(has, `${id}: data 定義がある（class-only 0）`);
  }
  for (const s of DATA.skills) ok(inPool.has(s.id), `${s.id}: いずれかのジョブプールに属す（JSON-only 0）`);
  for (const e of DATA.evolutions) ok(JOB_IDS.some((j) => poolsOf(j).evolution.includes(e.id)), `${e.id}: いずれかの進化プールに属す`);
  for (const p of DATA.passives) ok(JOB_IDS.some((j) => poolsOf(j).passive.includes(p.id)), `${p.id}: いずれかの passive プールに属す`);
}

section('4. Job Lv80 対象 ちょうど 6 / job・進化は対象 0');
for (const j of JOB_IDS) {
  const p = poolsOf(j);
  const lv80 = p.active.filter((id) => (DATA.skills.find((s) => s.id === id) || {}).lv80ProjectileTarget === true);
  ok(lv80.length === 6, `${j}: Lv80 対象がちょうど 6（${lv80.length}）`);
}
for (const e of DATA.evolutions) ok(e.lv80ProjectileTarget !== true, `${e.id}: 進化は Lv80 対象でない`);

section('5. SkillCatalog（production）が 3 ジョブとも issues 0');
for (const j of JOB_IDS) {
  const cat = buildCatalog({
    skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs,
    jobId: j, registeredIds: Object.keys(REG), runtimeStateIds: Object.keys(REG),
  });
  ok(Array.isArray(cat.issues) && cat.issues.length === 0, `${j}: buildCatalog issues 0（${(cat.issues || []).map((i) => i.code || i).join(',') || 'なし'}）`);
}

section('6. カタログ設計差の一覧（エラーではなく記録）');
{
  for (const j of JOB_IDS) {
    const p = poolsOf(j);
    const rar = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
    let noEvo = 0, withState = 0;
    const evoBases = new Set(DATA.evolutions.filter((e) => p.evolution.includes(e.id)).map((e) => e.baseSkillId));
    for (const id of p.active) {
      const d = DATA.skills.find((s) => s.id === id);
      rar[d.rarity] = (rar[d.rarity] || 0) + 1;
      if (!evoBases.has(id)) noEvo++;
      withState++;
    }
    const activeSupport = DATA.evolutions.filter((e) => p.evolution.includes(e.id))
      .filter((e) => (e.requiredSkills || []).some((r) => DATA.skills.some((s) => s.id === r.skill))).length;
    info(`${j}: rarity C${rar.common}/U${rar.uncommon}/R${rar.rare}/L${rar.legendary} 進化なしactive${noEvo} active補助進化${activeSupport}`);
    // 設計差そのものは仕様（戦士は legendary 0、火は active 補助 14 件など）。counts の整合だけ確認。
    ok(rar.common + rar.uncommon + rar.rare + rar.legendary === 30, `${j}: rarity 合計 30`);
  }
  // 既知の設計差を固定（黙って変わったら検知する）。
  const L = (j) => poolsOf(j).active.filter((id) => (DATA.skills.find((s) => s.id === id) || {}).rarity === 'legendary').length;
  ok(L('flame_witch') === 3 && L('frost_mage') === 3 && L('warrior') === 0,
    `legendary active: 火 3 / 氷 3 / 戦士 0（設計差・M8-F で記録済み）`);
}

T.finish();
