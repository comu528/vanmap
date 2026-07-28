// 氷術師 完成監査 5/12: ハズレ候補・死に候補・死にパラメータ（M7-E §11）。Node.js 標準機能のみ。
// 「data に宣言されているのに実装から一度も参照されない値」を機械的に検出する。M7-C の bossGaugeMult 不具合
// （Lv成長項目なのに未参照）と同じクラスの欠陥を再発させないための恒久ガード。
// 実行: node tests/frost-dead-content-audit.mjs

import { DATA, FROST, registryMap, skillSource, readSrc, runner, allSrc } from './frost-audit-common.mjs';

const T = runner('氷術師 死にコンテンツ監査（M7-E）');
const { ok, section, info } = T;

const MAP = registryMap();
// スキル実装が直接読まない共通メタ（枠組み側が解釈する）。ここに無いキーは実装から参照されねばならない。
const META_KEYS = new Set([
  'id', 'name', 'displayName', 'description', 'icon', 'iconKey', 'category', 'element', 'tags', 'rarity', 'weight',
  'jobs', 'isCommon', 'prerequisites', 'conflicts', 'unlockCondition', 'evolutionBranches', 'displayOrder',
  'modifiers', 'enabled', 'maxLevel', 'levels', 'level', 'castMode', 'mainCastEvent', 'lv80ProjectileTarget',
  'echoDescription', 'cloneDescription', 'echoPolicy', 'clonePolicy', 'canTriggerEcho', 'canBeCopiedByClone',
  'isDefensive', 'isReactive', 'usesResourceCost', 'baseSkillId', 'requiredSkills', 'requiredMasteryLevel',
  'replacementSkillId', 'visualTier', 'runtimeState', 'skill', 'initial', 'visual', 'requires', 'safetyCaps', 'config',
]);
// 共通経路（BattleScene / SkillBase / StatusEffectManager 等）が読むキーも「参照されている」と見なす。
const SHARED = readSrc('src/scenes/BattleScene.js') + readSrc('src/skills/SkillBase.js') + readSrc('src/skills/EvolvedSkillBase.js')
  + readSrc('src/systems/StatusEffectManager.js') + readSrc('src/systems/SkillManager.js') + readSrc('src/entities/Projectile.js')
  + readSrc('src/systems/CastPolicy.js') + readSrc('src/systems/EvolutionManager.js');

function paths(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    if (!prefix && META_KEYS.has(k)) continue;
    const p = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) paths(v, p, out); else out.add(p);
  }
}
const referenced = (path, src) => path.split('.').every((seg) => new RegExp('\\b' + seg.replace(/[^\w]/g, '') + '\\b').test(src));

// ===== 1. Lv成長項目・効果値がすべて実装から参照される =====
section('1. 宣言された成長項目/効果値が実装で参照される（死にパラメータ 0）');
const dead = [];
const defOf = (id) => DATA.skills.find((s) => s.id === id) || DATA.evolutions.find((e) => e.id === id);
for (const id of [...FROST.activeSkillPool, ...FROST.evolutionPool]) {
  const def = defOf(id);
  const src = skillSource(id, MAP);
  ok(!!src, `${id}: 実装クラス ${MAP[id] || '(未登録)'} のソースが読める`);
  if (!src) continue;
  const ps = new Set();
  if (Array.isArray(def.levels)) paths(def.levels[0] || {}, '', ps);
  paths(def, '', ps);
  if (def.config) for (const k of Object.keys(def.config)) ps.add('config.' + k);
  for (const p of [...ps].sort()) {
    const seen = referenced(p, src) || referenced(p, SHARED);
    if (!seen) dead.push(`${id}.${p}`);
    ok(seen, `${id}: ${p} が実装から参照される`);
  }
}
info(`死にパラメータ: ${dead.length ? dead.join(', ') : 'なし'}`);

// ===== 2. Lv 成長項目は実際に成長している（全Lvで同値の「成長しない成長項目」を検出）=====
section('2. levels[] の数値項目は Lv1→Lv8 で少なくとも1つ変化し、単調な成長項目は逆行しない');
for (const id of FROST.activeSkillPool) {
  const def = defOf(id);
  const lv = def.levels || [];
  ok(lv.length === (def.maxLevel || 8), `${id}: levels が maxLevel 分ある（${lv.length}）`);
  for (let i = 1; i < lv.length; i++) {
    const changed = Object.keys(lv[i]).some((k) => k !== 'level' && lv[i][k] !== lv[i - 1][k]);
    ok(changed, `${id}: Lv${i} → Lv${i + 1} で少なくとも1つの値が変化する`);
  }
  // bossGaugeMult は M7-C 追加監査で「実適用」を保証した成長項目。宣言されていれば単調非減少であること。
  if (lv[0] && lv[0].bossGaugeMult != null) {
    let mono = true;
    for (let i = 1; i < lv.length; i++) if (lv[i].bossGaugeMult < lv[i - 1].bossGaugeMult) mono = false;
    ok(mono, `${id}: bossGaugeMult が Lv で単調非減少`);
    ok(referenced('bossGaugeMult', skillSource(id, MAP)), `${id}: bossGaugeMult を実装が渡している`);
  }
}

// ===== 3. bossGaugeMult はボス氷砕ゲージだけへ1回適用される（共通経路）=====
section('3. bossGaugeMult は StatusEffectManager のボス分岐のみで使われる');
{
  const sem = readSrc('src/systems/StatusEffectManager.js');
  ok(/bossGaugeMult/.test(sem), 'StatusEffectManager が bossGaugeMult を参照する（未使用の成長項目でない）');
  ok(/t === 'boss'[\s\S]{0,400}bossGaugeMult/.test(sem), 'bossGaugeMult はボス分岐の中でだけ読まれる');
  ok(/addBossGauge\(e,\s*chillAmt\s*\*\s*gaugeMult\)/.test(sem), 'ゲージ加算量にだけ1回掛かる（damage/chill/proc へは掛からない）');
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/bossGaugeMult:\s*opts\.bossGaugeMult/.test(bs) || /bossGaugeMult,/.test(bs), 'dealDamage/damageArea が bossGaugeMult を渡す');
  // ボス以外の経路（冷気量そのもの）へ倍率を掛けている実装が無い。
  for (const id of [...FROST.activeSkillPool, ...FROST.evolutionPool]) {
    const src = skillSource(id, MAP);
    ok(!/chillAmount:\s*[^,]*\*\s*bossMult/.test(src), `${id}: chillAmount へボスゲージ倍率を掛けていない`);
  }
}

// ===== 4. 宣言メタと実装の対応（runtimeState / echo / clone / Lv80 / cooldown / proc / chill）=====
section('4. 宣言メタと実装の対応（未接続の宣言が無い）');
for (const id of [...FROST.activeSkillPool, ...FROST.evolutionPool]) {
  const def = defOf(id);
  const src = skillSource(id, MAP);
  const isEvo = FROST.evolutionPool.includes(id);
  if (Array.isArray(def.runtimeState) ? def.runtimeState.length : def.runtimeState) {
    ok(/serializeState\s*\(/.test(src) && /restoreState\s*\(/.test(src), `${id}: runtimeState 宣言に対し serializeState/restoreState がある`);
  }
  if (/serializeState\s*\(/.test(src)) ok(/restoreState\s*\(/.test(src), `${id}: serializeState があれば restoreState もある`);
  if (def.echoPolicy === 'custom') ok(/echoCast\s*\(/.test(src), `${id}: echoPolicy=custom なら echoCast を実装している`);
  if (def.clonePolicy === 'custom') ok(/cloneCast\s*\(|echoCast\s*\(/.test(src), `${id}: clonePolicy=custom なら cloneCast/echoCast を実装している`);
  if (def.echoPolicy === 'forbidden') ok(def.canTriggerEcho === false, `${id}: echoPolicy=forbidden なら canTriggerEcho=false`);
  if (def.clonePolicy === 'forbidden') ok(def.canBeCopiedByClone === false, `${id}: clonePolicy=forbidden なら canBeCopiedByClone=false`);
  ok(def.lv80ProjectileTarget === true ? /fireProjectileCount\s*\(/.test(src) : !/fireProjectileCount\s*\(/.test(src),
    `${id}: lv80ProjectileTarget=${!!def.lv80ProjectileTarget} と fireProjectileCount の有無が一致`);
  ok(!isEvo || def.lv80ProjectileTarget !== true, `${id}: 進化は Lv80 対象外`);
  if (def.procCoefficient != null) ok(/procCoefficient/.test(src), `${id}: procCoefficient を実装が渡す`);
  const lv1 = (def.levels || [])[0] || def;
  if (lv1.chillAmount != null || (def.chill && def.chill.amount != null)) ok(/chillAmount/.test(src), `${id}: chillAmount を実装が渡す`);
}

// ===== 5. Job milestone / modifier に対応スキルがある（死に milestone なし）=====
section('5. 氷術師の Job Lv 報酬が対応スキル/経路を持つ');
{
  const jp = DATA.jobProgression;
  const frostNode = (jp.jobs && (jp.jobs.frost_mage || (Array.isArray(jp.jobs) && jp.jobs.find((j) => j.id === 'frost_mage')))) || jp.frost_mage;
  ok(!!frostNode, 'job-progression.json に frost_mage の定義がある');
  const src = allSrc();
  const jm = readSrc('src/systems/JobModifierManager.js');
  const text = JSON.stringify(frostNode || {});
  for (const key of ['elementDamageMult', 'statusPowerMult', 'shatterDamageMult', 'cooldownMult', 'projectileCountBonus']) {
    if (text.includes(key)) ok(new RegExp(key).test(jm) || new RegExp(key).test(src), `Job modifier ${key} が実装から参照される`);
  }
  // Lv80「発射数+1」は明示 flag の6種のみへ適用される（tag 由来の自動適用をしない）。
  const audit = readSrc('src/systems/SkillAudit.js');
  ok(/lv80ProjectileTarget === true/.test(audit), 'Lv80 対象判定は明示 flag のみ（tag から自動導出しない）');
}

// ===== 6. docs と実装の一致（宣言値の記載漏れ）=====
section('6. docs に主要な宣言値が記載されている');
{
  const skillsMd = readSrc('docs/skills.md') + readSrc('docs/jobs.md');
  for (const id of FROST.activeSkillPool) ok(skillsMd.includes(id), `docs に ${id} の記載がある`);
  for (const id of FROST.evolutionPool) ok(skillsMd.includes(id), `docs に ${id} の記載がある`);
}

ok(dead.length === 0, `死にパラメータ 0 件（実際 ${dead.length}）`);
T.finish();
