// 戦士 最終Wave 1/16: カタログ整合性（M8-E §10）。Node.js 標準機能のみ。
// SkillCatalog（production）を唯一の正として、**火 / 氷と同規模（30 / 4 / 18 = 52）へ到達した**ことと、
// 最終Wave で追加した 5 active / 5 evolution が完全であることを検証する。
// 実行: node tests/warrior-final-catalog.mjs

import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { DATA, WARRIOR, FLAME, FROST, EXPECTED, registryMap, registeredIds, runner, readSrc, skillSource, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 最終Wave カタログ（M8-E）');
const { ok, section, info } = T;

const regIds = registeredIds();
const map = registryMap();
const war = buildCatalog({
  skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs,
  jobId: 'warrior', registeredIds: regIds, runtimeStateIds: [],
});
const NEW_ACT = EXPECTED.finalActives;
const NEW_EVO = EXPECTED.finalEvolutions;
const SKILL = (id) => DATA.skills.find((x) => x.id === id);
const EVO = (id) => DATA.evolutions.find((x) => x.id === id);

// ===== 1. 最終カタログ規模 =====
section('1. active30 / passive4 / evolution18（合計 52）＝火 / 氷と同規模');
ok(war.summary.activeCount === 30, `active ${war.summary.activeCount} = 30`);
ok(war.summary.passiveCount === 4, `passive ${war.summary.passiveCount} = 4`);
ok(war.summary.evolutionCount === 18, `evolution ${war.summary.evolutionCount} = 18`);
ok(war.summary.activeCount + war.summary.passiveCount + war.summary.evolutionCount === 52, '合計 52');
ok(war.issues.length === 0, `SkillCatalog の issues 0（実際 ${war.issues.length}: ${war.issues.map((i) => i.type + ':' + i.id).join(',')}）`);
for (const j of [FLAME, FROST]) {
  ok(j.activeSkillPool.length === 30 && j.evolutionPool.length === 18 && (j.passiveSkillPool || []).length === 4,
    `${j.id}: 30/4/18（戦士と同規模）`);
}
ok(NEW_ACT.length === 5 && NEW_EVO.length === 5, '最終Wave の追加は active5 / evolution5');
ok(WARRIOR.activeSkillPool.join(',') === EXPECTED.actives.join(','), 'activeSkillPool の並びが期待どおり');
ok(WARRIOR.evolutionPool.join(',') === EXPECTED.evolutions.join(','), 'evolutionPool の並びが期待どおり');
info(`新 active: ${NEW_ACT.join(', ')}`);
info(`新 evolution: ${NEW_EVO.join(', ')}`);

// ===== 2. 重複 =====
section('2. duplicate id / name / displayOrder が 0 件（3 ジョブ横断）');
{
  const dup = (arr) => { const seen = new Set(), d = []; for (const x of arr) { if (seen.has(x)) d.push(x); seen.add(x); } return d; };
  const allIds = [...DATA.skills.map((s) => s.id), ...DATA.evolutions.map((e) => e.id), ...DATA.passives.map((p) => p.id)];
  ok(dup(allIds).length === 0, `全 id が一意（重複 ${dup(allIds).join(',') || 'なし'}）`);
  const allNames = [...DATA.skills.map((s) => s.name), ...DATA.evolutions.map((e) => e.displayName)];
  ok(dup(allNames).length === 0, `全 表示名 が一意（重複 ${dup(allNames).join(',') || 'なし'}）`);
  const orders = DATA.skills.filter((s) => (s.jobs || []).includes('warrior')).map((s) => s.displayOrder);
  ok(dup(orders).length === 0, `戦士 active の displayOrder が一意（重複 ${dup(orders).join(',') || 'なし'}）`);
  const eOrders = WARRIOR.evolutionPool.map((id) => EVO(id).displayOrder);
  ok(dup(eOrders).length === 0, `戦士 進化 の displayOrder が一意（重複 ${dup(eOrders).join(',') || 'なし'}）`);
}

// ===== 3. 新 active5 の data 完全性 =====
section('3. 新 active5 の data が完全（Lv1–8・物理・戦士専用）');
for (const id of NEW_ACT) {
  const s = SKILL(id);
  ok(!!s, `${id}: skills.json にある`);
  if (!s) continue;
  ok(s.element === 'physical', `${id}: element=physical`);
  ok((s.jobs || []).join(',') === 'warrior', `${id}: jobs=["warrior"]`);
  ok(s.isCommon === false, `${id}: isCommon=false`);
  ok(s.maxLevel === 8 && (s.levels || []).length === 8, `${id}: Lv1–8`);
  ok(s.echoPolicy === 'forbidden' && s.clonePolicy === 'forbidden', `${id}: 残響 / 分身は forbidden`);
  ok(s.canTriggerEcho === false && s.canBeCopiedByClone === false, `${id}: canTriggerEcho / canBeCopiedByClone = false`);
  ok(s.castMode === 'cooldown', `${id}: castMode=cooldown`);
  ok(typeof s.mainCastEvent === 'string' && s.mainCastEvent.length > 0, `${id}: mainCastEvent がある`);
  ok(s.lv80ProjectileTarget === false, `${id}: Lv80 打撃数 +1 の対象ではない`);
  ok(typeof s.meleeRange === 'number' && s.meleeRange > 0, `${id}: meleeRange が正`);
  ok((s.tags || []).includes('physical'), `${id}: tags に physical`);
  ok((s.damageTags || []).includes('melee'), `${id}: damageTags に melee（遠距離だけで完結しない）`);
  ok(Array.isArray(s.evolutionBranches) && s.evolutionBranches.length === 1, `${id}: 進化を 1 つ持つ`);
  // 成長。
  let cdOk = true;
  for (let i = 1; i < s.levels.length; i++) if (s.levels[i].cooldown > s.levels[i - 1].cooldown) cdOk = false;
  ok(cdOk, `${id}: cooldown が Lv で非増加`);
  const a = s.levels[0], b = s.levels[7];
  const grew = Object.keys(a).filter((k) => k !== 'level' && k !== 'cooldown' && typeof a[k] === 'number' && b[k] > a[k]);
  ok(grew.length >= 2, `${id}: Lv1 → Lv8 で伸びる数値が 2 つ以上（${grew.join(',')}）`);
  for (const lv of s.levels) {
    for (const [k, v] of Object.entries(lv)) {
      if (typeof v !== 'number') continue;
      ok(Number.isFinite(v) && v >= 0, `${id}.Lv${lv.level}.${k} が有限の非負数（${v}）`);
    }
  }
}

// ===== 4. 新 evolution5 の data 完全性 =====
section('4. 新 evolution5 の data が完全（基礎 / 補助 / safetyCaps）');
for (const id of NEW_EVO) {
  const e = EVO(id);
  ok(!!e, `${id}: skill-evolutions.json にある`);
  if (!e) continue;
  ok(NEW_ACT.includes(e.baseSkillId), `${id}: 基礎は最終Wave の active（${e.baseSkillId}）`);
  ok((e.requiredSkills || []).length === 1, `${id}: 補助は 1 件`);
  ok(e.requiredSkills[0].level > 0, `${id}: 補助の必要 Lv が data に明示されている（Lv${e.requiredSkills[0].level}）`);
  ok(e.replacementSkillId === id, `${id}: 自身へ置換（基礎を消して枠を増やさない）`);
  ok(e.element === 'physical', `${id}: element=physical`);
  ok(e.echoPolicy === 'forbidden' && e.clonePolicy === 'forbidden', `${id}: 残響 / 分身は forbidden`);
  ok(e.lv80ProjectileTarget === false, `${id}: Lv80 の対象ではない`);
  ok(e.safetyCaps && Object.keys(e.safetyCaps).length > 0, `${id}: safetyCaps がある`);
  for (const [k, v] of Object.entries(e.safetyCaps || {})) {
    ok(typeof v === 'number' && Number.isFinite(v) && v >= 0, `${id}: safetyCaps.${k} が非負の有限数`);
  }
  ok(typeof e.cooldown === 'number' && e.cooldown > 0, `${id}: cooldown が正`);
  ok(e.requiredSkills[0].skill !== e.baseSkillId, `${id}: 補助が基礎と別スキル`);
  // 進化後は通常 draft へ出ない（evolutionPool にだけ載る）。
  ok(!WARRIOR.activeSkillPool.includes(id), `${id}: activeSkillPool には載らない`);
  ok(WARRIOR.evolutionPool.includes(id), `${id}: evolutionPool に載る`);
}

// ===== 5. 実装クラスとの双方向一致 =====
section('5. 実装クラスと data が双方向に一致する');
for (const id of [...NEW_ACT, ...NEW_EVO]) {
  ok(!!map[id], `${id}: SkillManager の REGISTRY に登録されている`);
  const src = skillSourceDeep(id, map);
  ok(!!src, `${id}: 実装ファイルがある`);
  if (!src) continue;
  ok(/serializeState\s*\(/.test(src) && /restoreState\s*\(/.test(src), `${id}: serializeState / restoreState を持つ`);
  ok(/destroy\s*\(\s*\)\s*\{/.test(src), `${id}: destroy を持つ`);
  const own = skillSource(id, map) || '';
  ok(!/echoCast|cloneCast/.test(own), `${id}: 残響 / 分身の実装を持たない`);
  ok(!/enemyPool\.forEachActive/.test(own), `${id}: 全敵総当たりをしない`);
}
{
  const known = new Set([...DATA.skills.map((s) => s.id), ...DATA.evolutions.map((e) => e.id)]);
  for (const id of Object.keys(map)) ok(known.has(id), `REGISTRY の ${id} は data にも存在する（class のみ 0）`);
  // 逆方向: 戦士の全 id に実装クラスがある（JSON のみ 0）。
  for (const id of [...WARRIOR.activeSkillPool, ...WARRIOR.evolutionPool]) ok(!!map[id], `${id}: 実装クラスがある`);
}

// ===== 6. Job Lv80 対象は 6 種のまま =====
section('6. Job Lv80「打撃数 +1」の対象を 1 件も増やしていない');
{
  const flagged = WARRIOR.activeSkillPool.filter((id) => SKILL(id).lv80ProjectileTarget === true);
  ok(flagged.length === 6, `戦士の Lv80 対象は 6 種のまま（${flagged.length}）`);
  ok(flagged.join(',') === EXPECTED.lv80Targets.join(','), `対象の顔ぶれも不変（${flagged.join(' / ')}）`);
  for (const j of [FLAME, FROST]) {
    const n = j.activeSkillPool.filter((id) => SKILL(id).lv80ProjectileTarget === true).length;
    ok(n === 6, `${j.id}: Lv80 対象は 6 種のまま（${n}）`);
  }
  for (const id of WARRIOR.evolutionPool) ok(EVO(id).lv80ProjectileTarget === false, `${id}: 進化は対象外`);
}

// ===== 7. rarity =====
section('7. rarity の分布が偏っていない');
{
  const dist = {};
  for (const id of NEW_ACT) { const r = SKILL(id).rarity; dist[r] = (dist[r] || 0) + 1; }
  ok(!dist.legendary, '最終Wave に legendary を作っていない');
  ok((dist.common || 0) >= 1, `common が 1 種以上（${dist.common || 0}）`);
  ok((dist.rare || 0) <= 2, `rare は 2 種以下（${dist.rare || 0}）`);
  info(`rarity(最終Wave active5): ${JSON.stringify(dist)}`);
  const all = {};
  for (const id of WARRIOR.activeSkillPool) { const r = SKILL(id).rarity; all[r] = (all[r] || 0) + 1; }
  info(`rarity(warrior active30): ${JSON.stringify(all)}`);
  ok(Object.values(all).every((n) => n > 0), '全 rarity 帯に戦士 active がある');
}

// ===== 8. docs =====
section('8. docs にカタログが記載されている');
{
  const cat = readSrc('docs/skill-catalog.md');
  for (const id of [...NEW_ACT, ...NEW_EVO]) ok(cat.includes(id), `skill-catalog.md に ${id} の記載がある`);
  ok(cat.includes('**30**') && cat.includes('**18**'), 'skill-catalog.md の規模表が 30 / 18 になっている');
}

T.finish();
