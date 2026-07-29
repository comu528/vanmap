// M8-C 1/19: カタログ整合性（総数は EXPECTED を正とする。M8-D 時点で active25 / passive4 / evolution13）。
// SkillCatalog（production）を唯一の正として、Wave1 で追加した 10 active / 5 evolution が
// 重複なく・実装クラスと双方向に一致し・データが完全であることを検証する。
// 実行: node tests/warrior-wave1-catalog.mjs

import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { DATA, WARRIOR, EXPECTED, registryMap, registeredIds, runner, readSrc, skillSource, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 Wave1 カタログ（M8-C）');
const { ok, section, info } = T;

const regIds = registeredIds();
const war = buildCatalog({
  skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs,
  jobId: 'warrior', registeredIds: regIds, runtimeStateIds: [],
});
const NEW_ACT = EXPECTED.wave1Actives;
const NEW_EVO = EXPECTED.wave1Evolutions;

// ===== 1. 総数 =====
// 総数の「正」は EXPECTED（M8-D で active25 / evolution13 へ拡張済み）。
// この suite が保証するのは「Wave1 の 15 種が全部残っていること」であって、総数の固定ではない。
const TOTAL = EXPECTED.activeCount + EXPECTED.passiveCount + EXPECTED.evolutionCount;
section(`1. active${EXPECTED.activeCount} / passive${EXPECTED.passiveCount} / evolution${EXPECTED.evolutionCount}（合計 ${TOTAL}）`);
ok(war.summary.activeCount === EXPECTED.activeCount, `active ${war.summary.activeCount} = ${EXPECTED.activeCount}`);
ok(war.summary.passiveCount === EXPECTED.passiveCount, `passive ${war.summary.passiveCount} = ${EXPECTED.passiveCount}`);
ok(war.summary.evolutionCount === EXPECTED.evolutionCount, `evolution ${war.summary.evolutionCount} = ${EXPECTED.evolutionCount}`);
ok(war.summary.activeCount + war.summary.passiveCount + war.summary.evolutionCount === TOTAL, `合計 ${TOTAL}`);
ok(war.issues.length === 0, `SkillCatalog の issues 0（実際 ${war.issues.length}: ${war.issues.map((i) => i.type + ':' + i.id).join(',')}）`);
ok(NEW_ACT.length === 10 && NEW_EVO.length === 5, 'Wave1 の追加は active10 / evolution5');
info(`新 active: ${NEW_ACT.join(', ')}`);
info(`新 evolution: ${NEW_EVO.join(', ')}`);

// ===== 2. 重複 id / name（3ジョブ横断）=====
section('2. duplicate id / duplicate name が 0 件');
{
  const dup = (arr) => { const seen = new Set(), d = []; for (const x of arr) { if (seen.has(x)) d.push(x); seen.add(x); } return d; };
  const allIds = [...DATA.skills.map((s) => s.id), ...DATA.evolutions.map((e) => e.id), ...DATA.passives.map((p) => p.id)];
  ok(dup(allIds).length === 0, `全 id が一意（重複 ${dup(allIds).join(',') || 'なし'}）`);
  const allNames = [...DATA.skills.map((s) => s.name), ...DATA.evolutions.map((e) => e.displayName)];
  ok(dup(allNames).length === 0, `全 表示名 が一意（重複 ${dup(allNames).join(',') || 'なし'}）`);
  const orders = DATA.skills.filter((s) => (s.jobs || []).includes('warrior')).map((s) => s.displayOrder);
  ok(dup(orders).length === 0, `戦士 active の displayOrder が一意（重複 ${dup(orders).join(',') || 'なし'}）`);
}

// ===== 3. クラス登録の双方向一致 =====
section('3. JSON だけ / クラスだけ が 0 件');
{
  const map = registryMap();
  for (const id of [...NEW_ACT, ...NEW_EVO]) {
    ok(!!map[id], `${id}: REGISTRY に実装クラスがある`);
    ok(regIds.includes(id), `${id}: registeredIds に含まれる`);
    ok(!!skillSource(id, map), `${id}: 実装ファイルが存在する`);
  }
  for (const id of regIds) {
    const known = DATA.skills.some((s) => s.id === id) || DATA.evolutions.some((e) => e.id === id);
    ok(known, `REGISTRY の ${id} は data に実在する（孤立クラスなし）`);
  }
  const declared = [...WARRIOR.activeSkillPool, ...WARRIOR.evolutionPool];
  for (const id of declared) ok(!!map[id], `${id}: プール宣言に対する実装がある（JSON だけ が無い）`);
}

// ===== 4. 新 active10 のデータ完全性 =====
section('4. 新 active10 のデータ完全性');
for (const id of NEW_ACT) {
  const s = DATA.skills.find((x) => x.id === id);
  ok(!!s, `${id}: skills.json にある`);
  if (!s) continue;
  ok(s.element === 'physical', `${id}: element=physical`);
  ok(Array.isArray(s.jobs) && s.jobs.length === 1 && s.jobs[0] === 'warrior', `${id}: jobs=["warrior"]`);
  ok(s.isCommon === false, `${id}: isCommon=false`);
  ok(s.maxLevel === 8 && Array.isArray(s.levels) && s.levels.length === 8, `${id}: Lv1〜8`);
  ok(s.echoPolicy === 'forbidden' && s.clonePolicy === 'forbidden', `${id}: 残響/分身は forbidden`);
  ok(s.canTriggerEcho === false && s.canBeCopiedByClone === false, `${id}: echo/clone フラグも false`);
  ok(typeof s.meleeRange === 'number' && s.meleeRange > 0, `${id}: meleeRange が正（近接である宣言）`);
  ok(s.castMode === 'cooldown', `${id}: castMode=cooldown`);
  ok(typeof s.mainCastEvent === 'string' && s.mainCastEvent.length > 0, `${id}: mainCastEvent がある`);
  ok(Array.isArray(s.damageTags) && s.damageTags.includes('melee'), `${id}: damageTags に melee`);
  ok((s.tags || []).includes('physical') && (s.tags || []).includes('melee'), `${id}: tags に physical/melee`);
  ok(['common', 'uncommon', 'rare', 'legendary'].includes(s.rarity), `${id}: rarity=${s.rarity}`);
  ok(typeof s.lv80ProjectileTarget === 'boolean', `${id}: lv80ProjectileTarget を明示`);
  // 数値の健全性（NaN / Infinity / 負数を作らない）。
  for (const lv of s.levels) {
    for (const [k, v] of Object.entries(lv)) {
      if (typeof v !== 'number') continue;
      ok(Number.isFinite(v), `${id} Lv${lv.level}: ${k} が有限値`);
      ok(v >= 0, `${id} Lv${lv.level}: ${k} が非負（${v}）`);
    }
  }
  // 成長の単調性。
  let dmgOk = true, cdOk = true;
  for (let i = 1; i < s.levels.length; i++) {
    if ((s.levels[i].damage ?? 0) < (s.levels[i - 1].damage ?? 0)) dmgOk = false;
    if (s.levels[i].cooldown > s.levels[i - 1].cooldown) cdOk = false;
  }
  ok(dmgOk, `${id}: damage が Lv で非減少`);
  ok(cdOk, `${id}: cooldown が Lv で非増加`);
}

// ===== 5. 新 evolution5 のデータ完全性 =====
section('5. 新 evolution5 のデータ完全性');
for (const id of NEW_EVO) {
  const e = DATA.evolutions.find((x) => x.id === id);
  ok(!!e, `${id}: skill-evolutions.json にある`);
  if (!e) continue;
  ok(e.element === 'physical', `${id}: element=physical`);
  ok(NEW_ACT.includes(e.baseSkillId), `${id}: base ${e.baseSkillId} が Wave1 の active`);
  ok(e.replacementSkillId === e.id, `${id}: base を置換する（replacementSkillId が自身）`);
  ok(e.echoPolicy === 'forbidden' && e.clonePolicy === 'forbidden', `${id}: 残響/分身は forbidden`);
  ok(e.lv80ProjectileTarget === false, `${id}: Lv80 対象外`);
  ok(e.safetyCaps && Object.keys(e.safetyCaps).length > 0, `${id}: safetyCaps がある`);
  ok(typeof e.cooldown === 'number' && e.cooldown > 0, `${id}: cooldown が正`);
  ok(typeof e.meleeRange === 'number' && e.meleeRange > 0, `${id}: meleeRange が正`);
  const base = DATA.skills.find((s) => s.id === e.baseSkillId);
  ok(base && (base.evolutionBranches || []).includes(id), `${e.baseSkillId}: evolutionBranches に ${id} を宣言`);
  // 数値の健全性。
  const walk = (o, path) => {
    for (const [k, v] of Object.entries(o || {})) {
      if (typeof v === 'number') {
        ok(Number.isFinite(v), `${id}: ${path}.${k} が有限値`);
        ok(v >= 0, `${id}: ${path}.${k} が非負（${v}）`);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path + '.' + k);
    }
  };
  for (const block of ['damage', 'area', 'knockback', 'poiseDamage', 'comboGain', 'furyGain', 'projectileCount', 'safetyCaps']) {
    if (e[block]) walk(e[block], block);
  }
}

// ===== 6. 進化条件（active 補助の明示）=====
section('6. 進化条件が既存 schema どおり（base Lv8 ＋ 補助 Lv 明示）');
for (const id of NEW_EVO) {
  const e = DATA.evolutions.find((x) => x.id === id);
  ok(Array.isArray(e.requiredSkills) && e.requiredSkills.length === 1, `${id}: requiredSkills が 1 件`);
  const req = e.requiredSkills[0];
  const inPassive = WARRIOR.passiveSkillPool.includes(req.skill);
  const inActive = WARRIOR.activeSkillPool.includes(req.skill);
  ok(inPassive || inActive, `${id}: 補助 ${req.skill} が戦士のプールにある`);
  ok(typeof req.level === 'number' && req.level >= 1, `${id}: 補助の必要 Lv${req.level} を data で明示`);
  if (inPassive) {
    const p = DATA.passives.find((x) => x.id === req.skill);
    ok(req.level === 4, `${id}: passive 補助は既存 warrior 進化と同じ Lv4 要求`);
    ok(p.maxLevel >= req.level, `${id}: 補助 ${req.skill} は Lv${req.level} まで上げられる`);
  } else {
    const a = DATA.skills.find((x) => x.id === req.skill);
    ok(a.maxLevel >= req.level, `${id}: active 補助 ${req.skill} は Lv${req.level} まで上げられる（maxLevel ${a.maxLevel}）`);
    ok(e.baseSkillId !== req.skill, `${id}: base と補助 active が別（${e.baseSkillId} / ${req.skill}）`);
    ok(e.replacementSkillId !== req.skill, `${id}: 補助 active ${req.skill} を置換しない`);
    info(`${id}: active 補助 ${req.skill} Lv${req.level}（置換されない）`);
  }
}

// ===== 7. Job Lv80 対象は 6 種 =====
section('7. Job Lv80「打撃数+1」対象は明示 flag の 6 種だけ');
{
  const lv80 = WARRIOR.activeSkillPool.filter((id) => DATA.skills.find((s) => s.id === id).lv80ProjectileTarget === true);
  ok(lv80.join(',') === EXPECTED.lv80Targets.join(','), `Lv80 対象 = ${lv80.join(',')}`);
  ok(lv80.length === 6, `6 種（実際 ${lv80.length}）`);
  for (const id of WARRIOR.evolutionPool) {
    ok(DATA.evolutions.find((e) => e.id === id).lv80ProjectileTarget === false, `${id}: 進化は対象外`);
  }
}

// ===== 8. 実装の宣言（役割が data と一致しているか）=====
section('8. 実装が data の役割どおりに書かれている');
{
  const map = registryMap();
  // 遠距離へ飛ぶ剣ビームを作らない（弾を生成しない）。
  for (const id of [...NEW_ACT, ...NEW_EVO]) {
    const src = skillSourceDeep(id, map) || '';
    ok(!/spawnPlayerProjectile/.test(src), `${id}: 弾を生成しない（近接判定のみ）`);
    ok(!/echoCast|cloneCast/.test(skillSource(id, map) || ''), `${id}: 残響/分身の実装を持たない`);
  }
}

// ===== 9. docs =====
section('9. docs にカタログが記載されている');
{
  const md = readSrc('docs/skill-catalog.md');
  for (const id of [...NEW_ACT, ...NEW_EVO]) ok(md.includes(id), `docs/skill-catalog.md に ${id} が載っている`);
  ok(/active\s*15|active15/.test(md), 'docs に active15 の記載がある');
  ok(/進化\s*8|evolution\s*8|evolution8/.test(md), 'docs に進化8 の記載がある');
}

info(`rarity(active15): ${JSON.stringify(war.summary.rarityActives)}`);
T.finish();
