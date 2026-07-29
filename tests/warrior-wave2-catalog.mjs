// 戦士 Wave2 1/21: カタログ整合性（M8-D §カタログ）。Node.js 標準機能のみ。
// SkillCatalog（production）を唯一の正として、Wave2 で追加した 10 active / 5 evolution が
//   - 重複なく（id / 表示名 / displayOrder）
//   - 実装クラスと双方向に一致し
//   - data が完全（levels 8 段・成長が単調・jobs / isCommon / echo / clone / castMode）
//   - Job Lv80「打撃数 +1」の対象を 1 件も増やしていない
// ことを検証する。
// 実行: node tests/warrior-wave2-catalog.mjs

import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { DATA, WARRIOR, FLAME, FROST, EXPECTED, registryMap, registeredIds, runner, readSrc, skillSource, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 Wave2 カタログ（M8-D）');
const { ok, section, info } = T;

const regIds = registeredIds();
const map = registryMap();
const war = buildCatalog({
  skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs,
  jobId: 'warrior', registeredIds: regIds, runtimeStateIds: [],
});
const NEW_ACT = EXPECTED.wave2Actives;
const NEW_EVO = EXPECTED.wave2Evolutions;
const SKILL = (id) => DATA.skills.find((x) => x.id === id);
const EVO = (id) => DATA.evolutions.find((x) => x.id === id);

// ===== 1. 総数 =====
// 総数の正は EXPECTED（M8-E で active30 / evolution18 へ拡張済み）。
// この suite が保証するのは「Wave2 の 15 種が全部残っていること」であって、総数の固定ではない。
section(`1. active${EXPECTED.activeCount} / passive${EXPECTED.passiveCount} / evolution${EXPECTED.evolutionCount}`);
ok(war.summary.activeCount === EXPECTED.activeCount, `active ${war.summary.activeCount} = ${EXPECTED.activeCount}`);
ok(war.summary.passiveCount === EXPECTED.passiveCount, `passive ${war.summary.passiveCount} = ${EXPECTED.passiveCount}`);
ok(war.summary.evolutionCount === EXPECTED.evolutionCount, `evolution ${war.summary.evolutionCount} = ${EXPECTED.evolutionCount}`);
ok(war.issues.length === 0, `SkillCatalog の issues 0（実際 ${war.issues.length}: ${war.issues.map((i) => i.type + ':' + i.id).join(',')}）`);
ok(NEW_ACT.length === 10 && NEW_EVO.length === 5, 'Wave2 の追加は active10 / evolution5');
ok(WARRIOR.activeSkillPool.join(',') === EXPECTED.actives.join(','), 'activeSkillPool の並びが期待どおり');
ok(WARRIOR.evolutionPool.join(',') === EXPECTED.evolutions.join(','), 'evolutionPool の並びが期待どおり');
info(`新 active: ${NEW_ACT.join(', ')}`);
info(`新 evolution: ${NEW_EVO.join(', ')}`);

// ===== 1b. 火 / 氷は不変 =====
section('1b. 火の魔女 / 氷術師のカタログ規模は不変（30/4/18）');
for (const j of [FLAME, FROST]) {
  ok(j.activeSkillPool.length === 30, `${j.id}: active 30 のまま`);
  ok(j.evolutionPool.length === 18, `${j.id}: 進化 18 のまま`);
  ok((j.passiveSkillPool || []).length === 4, `${j.id}: passive 4 のまま`);
  for (const id of [...NEW_ACT, ...NEW_EVO]) {
    ok(!j.activeSkillPool.includes(id) && !j.evolutionPool.includes(id), `${j.id}: ${id} が混ざっていない`);
  }
}

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

// ===== 3. 新 active10 の data 完全性 =====
section('3. 新 active10 の data が完全（Lv1–8・物理・戦士専用）');
for (const id of NEW_ACT) {
  const s = SKILL(id);
  ok(!!s, `${id}: skills.json にある`);
  if (!s) continue;
  ok(s.element === 'physical', `${id}: element=physical`);
  ok(Array.isArray(s.jobs) && s.jobs.length === 1 && s.jobs[0] === 'warrior', `${id}: jobs=["warrior"]`);
  ok(s.isCommon === false, `${id}: isCommon=false`);
  ok(s.maxLevel === 8 && Array.isArray(s.levels) && s.levels.length === 8, `${id}: Lv1–8`);
  ok(s.echoPolicy === 'forbidden' && s.clonePolicy === 'forbidden', `${id}: 残響 / 分身は forbidden`);
  ok(s.canTriggerEcho === false && s.canBeCopiedByClone === false, `${id}: canTriggerEcho / canBeCopiedByClone = false`);
  ok(s.castMode === 'cooldown', `${id}: castMode=cooldown`);
  ok(typeof s.mainCastEvent === 'string' && s.mainCastEvent.length > 0, `${id}: mainCastEvent がある`);
  ok(s.lv80ProjectileTarget === false, `${id}: Lv80 打撃数 +1 の対象ではない`);
  ok(typeof s.meleeRange === 'number' && s.meleeRange > 0, `${id}: meleeRange が正`);
  ok(['common', 'uncommon', 'rare', 'legendary'].includes(s.rarity), `${id}: rarity が正しい`);
  // 成長: cooldown は非増加。宣言した成長軸が Lv1 → Lv8 で実際に伸びている。
  let cdOk = true;
  for (let i = 1; i < s.levels.length; i++) if (s.levels[i].cooldown > s.levels[i - 1].cooldown) cdOk = false;
  ok(cdOk, `${id}: cooldown が Lv で非増加`);
  const first = s.levels[0], last = s.levels[7];
  const grew = Object.keys(first).filter((k) => k !== 'level' && k !== 'cooldown' && typeof first[k] === 'number' && last[k] > first[k]);
  ok(grew.length >= 2, `${id}: Lv1 → Lv8 で伸びる数値が 2 つ以上（${grew.join(',')}）`);
}

// ===== 4. 新 evolution5 の data 完全性 =====
section('4. 新 evolution5 の data が完全（基礎 / 補助 / safetyCaps）');
for (const id of NEW_EVO) {
  const e = EVO(id);
  ok(!!e, `${id}: skill-evolutions.json にある`);
  if (!e) continue;
  ok(WARRIOR.activeSkillPool.includes(e.baseSkillId), `${id}: 基礎 ${e.baseSkillId} が戦士 active`);
  ok(NEW_ACT.includes(e.baseSkillId), `${id}: 基礎は Wave2 の新 active`);
  ok(Array.isArray(e.requiredSkills) && e.requiredSkills.length === 1, `${id}: 補助は 1 件`);
  ok(e.replacementSkillId === id, `${id}: 自身へ置換（基礎を消して枠を増やさない）`);
  ok(e.element === 'physical', `${id}: element=physical`);
  ok(e.echoPolicy === 'forbidden' && e.clonePolicy === 'forbidden', `${id}: 残響 / 分身は forbidden`);
  ok(e.lv80ProjectileTarget === false, `${id}: Lv80 の対象ではない`);
  ok(e.safetyCaps && Object.keys(e.safetyCaps).length > 0, `${id}: safetyCaps がある`);
  for (const [k, v] of Object.entries(e.safetyCaps || {})) ok(typeof v === 'number' && v >= 0, `${id}: safetyCaps.${k} が非負数`);
  ok(typeof e.cooldown === 'number' && e.cooldown > 0, `${id}: cooldown が正`);
  // 補助は基礎そのものではない。
  ok(e.requiredSkills[0].skill !== e.baseSkillId, `${id}: 補助が基礎と別スキル`);
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
  // 残響 / 分身・全敵総当たりは「自分のファイル」だけを見る（共通基底の記述を拾わない）。
  const own = skillSource(id, map) || '';
  ok(!/echoCast|cloneCast/.test(own), `${id}: 残響 / 分身の実装を持たない`);
  ok(!/enemyPool\.forEachActive/.test(own), `${id}: 全敵総当たりをしない`);
}
// 逆方向: REGISTRY に「data に無い戦士スキル」が生えていない。
{
  const known = new Set([...DATA.skills.map((s) => s.id), ...DATA.evolutions.map((e) => e.id)]);
  for (const id of Object.keys(map)) ok(known.has(id), `REGISTRY の ${id} は data にも存在する`);
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
}

// ===== 7. rarity 分布 =====
section('7. rarity の分布が偏っていない');
{
  const dist = {};
  for (const id of NEW_ACT) { const r = SKILL(id).rarity; dist[r] = (dist[r] || 0) + 1; }
  ok(!dist.legendary, 'Wave2 に legendary を作っていない');
  ok((dist.common || 0) >= 2, `common が 2 種以上（${dist.common || 0}）`);
  ok((dist.rare || 0) <= 4, `rare は 4 種以下（${dist.rare || 0}）`);
  info(`rarity(Wave2 active10): ${JSON.stringify(dist)}`);
}

// ===== 8. docs =====
section('8. docs にカタログが記載されている');
{
  const cat = readSrc('docs/skill-catalog.md');
  for (const id of [...NEW_ACT, ...NEW_EVO]) ok(cat.includes(id), `skill-catalog.md に ${id} の記載がある`);
  ok(cat.includes('**25**') && cat.includes('**13**'), 'skill-catalog.md の規模表が 25 / 13 になっている');
}

T.finish();
