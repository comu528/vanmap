// 戦士 1/17: カタログ整合性（M8-B §1・§2）。Node.js 標準機能のみ。
// SkillCatalog（production）を唯一の正として active5 / passive4 / evolution3 を検証し、
// 重複 id/name・未登録クラス・孤立クラス・プール不一致・データ欠落が無いことを確認する。
// 実行: node tests/warrior-catalog.mjs

import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { DATA, WARRIOR, FLAME, FROST, EXPECTED, registryMap, registeredIds, runner, readSrc, skillSource } from './warrior-common.mjs';

const T = runner('戦士 カタログ監査（M8-B）');
const { ok, section, info } = T;

const regIds = registeredIds();
const catFor = (jobId) => buildCatalog({
  skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs, jobId,
  registeredIds: regIds, runtimeStateIds: [],
});
const war = catFor('warrior');

// ===== 1. 総数 =====
section('1. active5 / passive4 / evolution3');
ok(war.summary.activeCount === EXPECTED.activeCount, `active ${war.summary.activeCount} = 5`);
ok(war.summary.passiveCount === EXPECTED.passiveCount, `passive ${war.summary.passiveCount} = 4`);
ok(war.summary.evolutionCount === EXPECTED.evolutionCount, `evolution ${war.summary.evolutionCount} = 3`);
ok(WARRIOR.activeSkillPool.length === 15 && WARRIOR.passiveSkillPool.length === 4 && WARRIOR.evolutionPool.length === 8,
  'jobs.json のプール数も 15/4/8');
ok(WARRIOR.activeSkillPool.join(',') === EXPECTED.actives.join(','), `activeSkillPool = ${EXPECTED.actives.join(',')}`);
ok(WARRIOR.passiveSkillPool.join(',') === EXPECTED.passives.join(','), `passiveSkillPool = ${EXPECTED.passives.join(',')}`);
ok(WARRIOR.evolutionPool.join(',') === EXPECTED.evolutions.join(','), `evolutionPool = ${EXPECTED.evolutions.join(',')}`);

section('1b. 火の魔女 / 氷術師のカタログ規模は不変（30/4/18）');
for (const [jid, label] of [['flame_witch', '火の魔女'], ['frost_mage', '氷術師']]) {
  const c = catFor(jid);
  ok(c.summary.activeCount === 30, `${label} active 30`);
  ok(c.summary.passiveCount === 4, `${label} passive 4`);
  ok(c.summary.evolutionCount === 18, `${label} evolution 18`);
}

// ===== 2. issues 0 =====
section('2. SkillCatalog の不整合検出（issues）が 0 件');
ok(war.issues.length === 0, `warrior issues 0（実際 ${war.issues.length}: ${war.issues.map((i) => i.type + ':' + i.id).join(', ')}）`);

// ===== 3. 重複 id / name =====
section('3. duplicate id / duplicate name が無い（3ジョブ横断）');
const dup = (arr) => { const s = new Set(), d = []; for (const x of arr) { if (s.has(x)) d.push(x); s.add(x); } return d; };
const allIds = [...DATA.skills.map((s) => s.id), ...DATA.evolutions.map((e) => e.id), ...DATA.passives.map((p) => p.id)];
ok(dup(allIds).length === 0, `全 id がグローバルに一意（重複 ${dup(allIds).join(',') || 'なし'}）`);
const allNames = [...DATA.skills.map((s) => s.name), ...DATA.evolutions.map((e) => e.displayName)];
ok(dup(allNames).length === 0, `全 表示名 がグローバルに一意（重複 ${dup(allNames).join(',') || 'なし'}）`);

// ===== 4. クラス登録 =====
section('4. JSON とファクトリ登録の双方向一致（未登録クラス / 孤立クラスなし）');
const map = registryMap();
for (const id of [...WARRIOR.activeSkillPool, ...WARRIOR.evolutionPool]) {
  ok(!!map[id], `${id}: REGISTRY に実装クラスが登録されている`);
  ok(regIds.includes(id), `${id}: registeredIds に含まれる`);
  ok(!!skillSource(id, map), `${id}: 実装クラスのソースが存在する`);
}
for (const id of regIds) {
  const known = DATA.skills.some((s) => s.id === id) || DATA.evolutions.some((e) => e.id === id);
  ok(known, `REGISTRY の ${id} は skills.json / skill-evolutions.json に実在する（孤立クラスなし）`);
}

// ===== 5. active データの必須項目 =====
section('5. 戦士 active5 のデータ完全性');
for (const id of WARRIOR.activeSkillPool) {
  const s = DATA.skills.find((x) => x.id === id);
  ok(!!s, `${id}: skills.json に存在する`);
  if (!s) continue;
  ok(s.element === 'physical', `${id}: element=physical`);
  ok(Array.isArray(s.jobs) && s.jobs.length === 1 && s.jobs[0] === 'warrior', `${id}: jobs=["warrior"]`);
  ok(s.isCommon === false, `${id}: isCommon=false`);
  ok(s.maxLevel === 8, `${id}: maxLevel=8`);
  ok(Array.isArray(s.levels) && s.levels.length === 8, `${id}: levels が 8 段階`);
  ok(s.echoPolicy === 'forbidden' && s.clonePolicy === 'forbidden', `${id}: 残響/分身は forbidden`);
  ok(s.canTriggerEcho === false && s.canBeCopiedByClone === false, `${id}: canTriggerEcho / canBeCopiedByClone = false`);
  ok(typeof s.meleeRange === 'number' && s.meleeRange > 0, `${id}: meleeRange が正`);
  ok(typeof s.mainCastEvent === 'string' && s.mainCastEvent.length > 0, `${id}: mainCastEvent がある`);
  ok(Array.isArray(s.damageTags) && s.damageTags.includes('melee'), `${id}: damageTags に melee`);
  // レベル成長: damage / cooldown が単調（damage は非減少、cooldown は非増加）。
  let dmgOk = true, cdOk = true;
  for (let i = 1; i < s.levels.length; i++) {
    if (s.levels[i].damage < s.levels[i - 1].damage) dmgOk = false;
    if (s.levels[i].cooldown > s.levels[i - 1].cooldown) cdOk = false;
  }
  ok(dmgOk, `${id}: damage が Lv で非減少`);
  ok(cdOk, `${id}: cooldown が Lv で非増加`);
}

// ===== 6. passive データ =====
section('6. 戦士 passive4 のデータ完全性');
const modifierKeys = new Set(DATA.skillConfig.modifierKeys || []);
for (const id of WARRIOR.passiveSkillPool) {
  const p = DATA.passives.find((x) => x.id === id);
  ok(!!p, `${id}: passives.json に存在する`);
  if (!p) continue;
  ok(Array.isArray(p.jobs) && p.jobs.join(',') === 'warrior', `${id}: jobs=["warrior"]`);
  ok(p.isCommon === false, `${id}: isCommon=false`);
  ok(p.maxLevel === 4, `${id}: maxLevel=4`);
  ok(Array.isArray(p.modifiers) && p.modifiers.length > 0, `${id}: modifiers がある`);
  for (const m of p.modifiers || []) {
    ok(modifierKeys.has(m.key), `${id}: modifier key "${m.key}" は skill-config.modifierKeys にある`);
    ok(['addMult', 'subMult', 'add'].includes(m.op), `${id}: modifier op "${m.op}" が既知`);
    ok(typeof m.perLevel === 'number' && m.perLevel > 0, `${id}: ${m.key} の perLevel が正`);
  }
}

// ===== 7. evolution データ =====
section('7. 戦士 evolution3 のデータ完全性');
for (const id of WARRIOR.evolutionPool) {
  const e = DATA.evolutions.find((x) => x.id === id);
  ok(!!e, `${id}: skill-evolutions.json に存在する`);
  if (!e) continue;
  ok(e.element === 'physical', `${id}: element=physical`);
  ok(WARRIOR.activeSkillPool.includes(e.baseSkillId), `${id}: baseSkillId ${e.baseSkillId} が戦士 active`);
  ok(Array.isArray(e.requiredSkills) && e.requiredSkills.length === 1, `${id}: requiredSkills が 1 件`);
  const aux = e.requiredSkills[0];
  // M8-C: 補助は passive でも active でもよい（天墜崩撃 = 地砕き Lv6）。必要 Lv は data で明示する。
  const inPassive = WARRIOR.passiveSkillPool.includes(aux.skill);
  const inActive = WARRIOR.activeSkillPool.includes(aux.skill);
  ok(inPassive || inActive, `${id}: 補助 ${aux.skill} が戦士のプールにある`);
  ok(typeof aux.level === 'number' && aux.level >= 1, `${id}: 補助 ${aux.skill} の必要 Lv${aux.level} が data で明示されている`);
  if (inActive) ok(e.baseSkillId !== aux.skill && e.replacementSkillId !== aux.skill, `${id}: 補助 active ${aux.skill} は置換されない`);
  ok(e.replacementSkillId === e.id, `${id}: replacementSkillId が自身（置換関係）`);
  ok(e.echoPolicy === 'forbidden' && e.clonePolicy === 'forbidden', `${id}: 残響/分身は forbidden`);
  ok(e.safetyCaps && Object.keys(e.safetyCaps).length > 0, `${id}: safetyCaps がある`);
  ok(e.lv80ProjectileTarget === false, `${id}: 進化は Lv80 打撃数の対象外`);
  const base = DATA.skills.find((s) => s.id === e.baseSkillId);
  ok(base && Array.isArray(base.evolutionBranches) && base.evolutionBranches.includes(e.id),
    `${e.baseSkillId}: evolutionBranches に ${id} を宣言している`);
}
// 進化の基礎 3 種と、進化を持たない active 2 種。
const withEvo = WARRIOR.evolutionPool.map((id) => DATA.evolutions.find((e) => e.id === id).baseSkillId);
info(`進化あり active: ${withEvo.join(',')} / 進化なし active: ${WARRIOR.activeSkillPool.filter((id) => !withEvo.includes(id)).join(',')}`);

// ===== 8. Lv80 対象 =====
section('8. Job Lv80「打撃数+1」対象は明示 flag のスキルのみ');
const lv80 = WARRIOR.activeSkillPool.filter((id) => DATA.skills.find((s) => s.id === id)?.lv80ProjectileTarget === true);
ok(lv80.join(',') === EXPECTED.lv80Targets.join(','), `Lv80対象 ${lv80.join(',')} = ${EXPECTED.lv80Targets.join(',')}`);
for (const id of WARRIOR.activeSkillPool) {
  const s = DATA.skills.find((x) => x.id === id);
  ok(typeof s.lv80ProjectileTarget === 'boolean', `${id}: lv80ProjectileTarget を明示している`);
}

// ===== 9. jobs.json / job-progression.json =====
section('9. jobs.json / job-progression.json の戦士定義');
ok(WARRIOR.element === 'physical', 'job element=physical');
ok(WARRIOR.preferredRange === 'melee', 'preferredRange=melee');
ok(Array.isArray(WARRIOR.statusEffects) && WARRIOR.statusEffects.length === 0, '共通状態異常を追加していない（statusEffects 空）');
ok(WARRIOR.initialActiveSkills.length === 1 && WARRIOR.initialActiveSkills[0] === 'great_cleave', '初期 active = great_cleave');
ok((WARRIOR.initialPassiveSkills || []).length === 0, '初期 passive なし');
const jp = DATA.jobProgression.jobs.warrior;
ok(!!jp, 'job-progression.json に warrior がある');
ok(jp.levelCap === 100, 'levelCap=100');
ok(Array.isArray(jp.milestones) && jp.milestones.length >= 10, `到達報酬 ${jp.milestones.length} 件`);

// ===== 10. docs =====
section('10. docs にカタログが記載されている');
const catalogMd = readSrc('docs/skill-catalog.md');
for (const id of [...WARRIOR.activeSkillPool, ...WARRIOR.passiveSkillPool, ...WARRIOR.evolutionPool]) {
  ok(catalogMd.includes(id), `docs/skill-catalog.md に ${id} が載っている`);
}

info(`rarity(active): ${JSON.stringify(war.summary.rarityActives)}`);
info(`火 ${FLAME.activeSkillPool.length} / 氷 ${FROST.activeSkillPool.length} / 戦士 ${WARRIOR.activeSkillPool.length} active`);
T.finish();
