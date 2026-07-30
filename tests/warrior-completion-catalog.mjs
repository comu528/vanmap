// 戦士 完成監査 1/23: 完成カタログ（M8-F §3）。Node.js 標準機能のみ。
//   - active30 / passive4 / evolution18 / 合計52
//   - id / displayName の重複 0・未知クラス 0・未登録クラス 0・JSON だけ / class だけ / docs だけ 0
//   - orphan / 到達不能 evolution 0・未知の base / support 0
//   - SkillCatalog = SkillDraftManager = poolEligibility = F9 = docs
//   - Job Lv80 はちょうど 6 種で進化は 0 種
//   - 火 / 氷のカタログと catalog issue 0
// 実行: node tests/warrior-completion-catalog.mjs

import { buildCatalog, evolutionRecipes } from '../src/systems/SkillCatalog.js';
import { memberAllowedForJob } from '../src/systems/poolEligibility.js';
import { appliesLv80ProjectileCount } from '../src/systems/SkillAudit.js';
import { DATA, WARRIOR, FLAME, FROST, EXPECTED, registeredIds, registryMap, jobPools, readSrc, runner } from './warrior-common.mjs';

const T = runner('戦士 完成カタログ監査（M8-F）');
const { ok, section, info } = T;

const MAP = registryMap();
const IDS = registeredIds();
const CAT = buildCatalog({
  skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs,
  jobId: 'warrior', registeredIds: IDS, runtimeStateIds: IDS,
});

// ===== 1. 規模 =====
section('1. active30 / passive4 / evolution18 / 合計52');
{
  ok(WARRIOR.activeSkillPool.length === 30, `active ${WARRIOR.activeSkillPool.length} = 30`);
  ok((WARRIOR.passiveSkillPool || []).length === 4, `passive ${(WARRIOR.passiveSkillPool || []).length} = 4`);
  ok(WARRIOR.evolutionPool.length === 18, `evolution ${WARRIOR.evolutionPool.length} = 18`);
  const total = WARRIOR.activeSkillPool.length + (WARRIOR.passiveSkillPool || []).length + WARRIOR.evolutionPool.length;
  ok(total === 52, `合計 ${total} = 52（火 / 氷と同規模）`);
  ok(CAT.actives.length === 30 && CAT.evolutions.length === 18, `カタログも 30 / 18（${CAT.actives.length}/${CAT.evolutions.length}）`);
  ok((CAT.issues || []).length === 0, `SkillCatalog の issues が 0 件（${(CAT.issues || []).join(' / ')}）`);
  info(`カタログ: active${CAT.actives.length} passive${(CAT.passives || []).length} evolution${CAT.evolutions.length}`);
}

// ===== 2. 重複が 0 =====
section('2. id / 表示名の重複が 0 件');
{
  const ids = [...WARRIOR.activeSkillPool, ...(WARRIOR.passiveSkillPool || []), ...WARRIOR.evolutionPool];
  ok(new Set(ids).size === ids.length, `id の重複 0（${ids.length} 件）`);
  const names = [
    ...WARRIOR.activeSkillPool.map((id) => (DATA.skills.find((s) => s.id === id) || {}).name),
    ...(WARRIOR.passiveSkillPool || []).map((id) => (DATA.passives.find((p) => p.id === id) || {}).displayName),
    ...WARRIOR.evolutionPool.map((id) => (DATA.evolutions.find((e) => e.id === id) || {}).displayName),
  ];
  ok(names.every((n) => typeof n === 'string' && n.length > 0), 'すべて表示名を持つ');
  ok(new Set(names).size === names.length, `表示名の重複 0（${names.length} 件）`);
  // 全ジョブ横断でも重複しない（他ジョブと同名のスキルを作っていない）。
  const allNames = [...DATA.skills.map((s) => s.name), ...DATA.evolutions.map((e) => e.displayName),
    ...DATA.passives.map((p) => p.displayName)];
  const dup = allNames.filter((n, i) => allNames.indexOf(n) !== i);
  ok(dup.length === 0, `3 ジョブ横断でも表示名の重複 0（${dup.join(',') || 'なし'}）`);
}

// ===== 3. JSON / class / docs の三方向一致 =====
section('3. JSON だけ / class だけ / docs だけ が 0 件');
{
  const jsonOnly = [];
  const classOnly = [];
  for (const id of [...WARRIOR.activeSkillPool, ...WARRIOR.evolutionPool]) {
    if (!MAP[id]) jsonOnly.push(id);
  }
  ok(jsonOnly.length === 0, `JSON にあってクラスが無い: 0 件（${jsonOnly.join(',') || 'なし'}）`);
  // 逆方向: 戦士向けクラス名なのに data に無いもの。
  const dataIds = new Set([...DATA.skills.map((s) => s.id), ...DATA.evolutions.map((e) => e.id)]);
  for (const id of Object.keys(MAP)) if (!dataIds.has(id)) classOnly.push(id);
  ok(classOnly.length === 0, `クラスがあって data に無い: 0 件（${classOnly.join(',') || 'なし'}）`);
  // docs（skill-catalog.md）に 48 件すべてが載っている。
  const doc = readSrc('docs/skill-catalog.md');
  const missingDoc = [...WARRIOR.activeSkillPool, ...WARRIOR.evolutionPool].filter((id) => !doc.includes(id));
  ok(missingDoc.length === 0, `docs に載っていない: 0 件（${missingDoc.join(',') || 'なし'}）`);
  // docs だけに出てくる戦士 id（綴り間違い / 消し忘れ）が無い。
  const docIds = (doc.match(/`[a-z_]{4,}`/g) || []).map((m) => m.slice(1, -1));
  const strayWarriorish = docIds.filter((id) => /^(great|shield|whirlwind|charge|ground|armor|twin|execution|leap|sweeping|counter|war|chain|shockwave|relentless|rising|backstep|battlefield|triple|blade|berserker|breaker|rallying|piercing|duel|battle|earthshaker|weapon|thousand|bloodstorm|unyielding|skull|crimson|adamant|heaven|fortress|shadow|mountain|blood|godspeed|king|continental)_/.test(id))
    .filter((id) => !dataIds.has(id) && !(DATA.passives || []).some((p) => p.id === id));
  ok(strayWarriorish.length === 0, `docs だけに出てくる戦士 id: 0 件（${strayWarriorish.join(',') || 'なし'}）`);
}

// ===== 4. 三方向の集合一致 =====
section('4. SkillCatalog = SkillDraftManager（poolEligibility）= F9 = docs');
{
  const job = jobPools('warrior');
  const eligible = new Set(DATA.skills.filter((s) => memberAllowedForJob({ ...s, category: 'active' }, job)).map((s) => s.id));
  const catIds = new Set(CAT.actives.map((a) => a.id));
  ok(eligible.size === 30 && catIds.size === 30, `適格集合 ${eligible.size} = カタログ ${catIds.size} = 30`);
  for (const id of WARRIOR.activeSkillPool) {
    ok(eligible.has(id), `${id}: poolEligibility が適格と判定`);
    ok(catIds.has(id), `${id}: SkillCatalog に載る`);
  }
  const pEligible = new Set(DATA.passives.filter((p) => memberAllowedForJob({ ...p, category: 'passive' }, job)).map((p) => p.id));
  ok(pEligible.size === 4, `passive の適格集合 4（${[...pEligible].join(',')}）`);
  // F9（BattleScene の戦士検証パネル）は data 由来のプールを列挙する（ハードコード一覧を持たない）。
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/activeSkillPool/.test(bs) && /evolutionPool/.test(bs), 'F9 / F8 は data のプールを参照する');
  const hardcoded = WARRIOR.activeSkillPool.filter((id) => new RegExp(`['"]${id}['"]`).test(bs));
  info(`BattleScene が id を直書きしている戦士 active: ${hardcoded.join(',') || 'なし'}（警告表示のための参照のみ）`);
}

// ===== 5. 進化の健全性 =====
section('5. orphan / 到達不能 evolution 0・未知の base / support 0');
{
  const recipes = evolutionRecipes(CAT).filter((r) => WARRIOR.evolutionPool.includes(r.evolutionId));
  ok(recipes.length === 18, `レシピ 18 件（${recipes.length}）`);
  const activeSet = new Set(WARRIOR.activeSkillPool);
  const passiveSet = new Set(WARRIOR.passiveSkillPool || []);
  for (const r of recipes) {
    const e = DATA.evolutions.find((x) => x.id === r.evolutionId);
    ok(activeSet.has(r.baseSkillId), `${r.evolutionId}: base ${r.baseSkillId} が戦士 active プールにある`);
    ok(e.replacementSkillId === r.evolutionId, `${r.evolutionId}: replacementSkillId が自身（base を置換）`);
    ok(!Array.isArray(e.branches) && !e.branchOf, `${r.evolutionId}: 分岐なし`);
    ok(e.lv80ProjectileTarget === false, `${r.evolutionId}: Lv80 対象外`);
    for (const a of [...r.auxActive, ...r.auxPassive]) {
      ok(activeSet.has(a.skill) || passiveSet.has(a.skill), `${r.evolutionId}: 補助 ${a.skill} が戦士プールにある`);
      const max = activeSet.has(a.skill)
        ? (DATA.skills.find((s) => s.id === a.skill).maxLevel || 8)
        : (DATA.passives.find((p) => p.id === a.skill).maxLevel || 4);
      ok(a.level >= 1 && a.level <= max, `${r.evolutionId}: 補助 ${a.skill} の必要 Lv ${a.level} ≤ 最大 ${max}（到達可能）`);
    }
    ok(r.baseMaxLevel === (DATA.skills.find((s) => s.id === r.baseSkillId).maxLevel || 8),
      `${r.evolutionId}: base の必要 Lv が最大 Lv（${r.baseMaxLevel}）`);
  }
  // orphan: base を持たない進化 / 進化を 2 つ持つ base が無い。
  const byBase = {};
  for (const r of recipes) byBase[r.baseSkillId] = (byBase[r.baseSkillId] || 0) + 1;
  const multi = Object.entries(byBase).filter(([, n]) => n > 1);
  ok(multi.length === 0, `1 つの base に進化が 2 つ以上ぶら下がらない（${multi.map(([k, n]) => `${k}:${n}`).join(',') || 'なし'}）`);
  ok(Object.keys(byBase).length === 18, `進化を持つ base は 18 種（${Object.keys(byBase).length}）`);
  info(`進化を持たない active: ${WARRIOR.activeSkillPool.filter((id) => !byBase[id]).join(', ')}`);
}

// ===== 6. Job Lv80 =====
section('6. Job Lv80「打撃数 +1」はちょうど 6 種・進化は 0 種');
{
  const lv80 = WARRIOR.activeSkillPool.filter((id) => appliesLv80ProjectileCount(DATA.skills.find((s) => s.id === id)));
  ok(lv80.length === 6, `対象 6 種（${lv80.length}）`);
  ok(lv80.slice().sort().join(',') === EXPECTED.lv80Targets.slice().sort().join(','), `対象が期待どおり（${lv80.join(',')}）`);
  const evoLv80 = WARRIOR.evolutionPool.filter((id) => appliesLv80ProjectileCount(DATA.evolutions.find((e) => e.id === id)));
  ok(evoLv80.length === 0, `進化の Lv80 対象 0 種（${evoLv80.join(',') || 'なし'}）`);
  // 火 / 氷も 6 種のまま。
  for (const [j, name] of [[FLAME, '火'], [FROST, '氷']]) {
    const n = j.activeSkillPool.filter((id) => appliesLv80ProjectileCount(DATA.skills.find((s) => s.id === id))).length;
    ok(n === 6, `${name} の Lv80 対象も 6 種のまま（${n}）`);
  }
}

// ===== 7. 宣言の一貫性 =====
section('7. jobs:["warrior"] / isCommon:false / 火 / 氷混入 0');
for (const id of WARRIOR.activeSkillPool) {
  const s = DATA.skills.find((x) => x.id === id);
  ok((s.jobs || []).length === 1 && s.jobs[0] === 'warrior', `${id}: jobs=["warrior"]`);
  ok(s.isCommon === false, `${id}: isCommon=false`);
  ok(s.element === 'physical', `${id}: element=physical`);
  ok(s.maxLevel === 8 && (s.levels || []).length === 8, `${id}: Lv1〜8`);
  ok(!FLAME.activeSkillPool.includes(id) && !FROST.activeSkillPool.includes(id), `${id}: 火 / 氷のプールに混ざらない`);
}

// ===== 8. 火 / 氷のカタログ =====
section('8. 火 / 氷のカタログが 30/4/18・issue 0');
for (const [jid, name] of [['flame_witch', '火'], ['frost_mage', '氷']]) {
  const j = DATA.jobs.find((x) => x.id === jid);
  ok(j.activeSkillPool.length === 30 && j.evolutionPool.length === 18 && (j.passiveSkillPool || []).length === 4,
    `${name}: 30 / 4 / 18`);
  const c = buildCatalog({
    skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs,
    jobId: jid, registeredIds: IDS, runtimeStateIds: IDS,
  });
  ok((c.issues || []).length === 0, `${name}: catalog issue 0 件（${(c.issues || []).join(' / ')}）`);
  for (const id of WARRIOR.activeSkillPool) ok(!c.actives.some((a) => a.id === id), `${name}: ${id} が混ざらない`);
}

T.finish();
