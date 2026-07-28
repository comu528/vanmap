// 火の魔女 完成監査 5/12: ハズレ候補・死に候補・死にパラメータ（M8-A §6）。Node.js 標準機能のみ。
// 「data に宣言されているのに実装から一度も参照されない値」を機械的に検出する。M8-A では
// 21 件の死にパラメータ（旧 evolution ブロック / buffDamage / burnMs / 進化の未接続項目ほか）を解消した。
// 実行: node tests/flame-dead-content-audit.mjs

import { DATA, FLAME, registryMap, skillSource, readSrc, runner, allSrc } from './flame-audit-common.mjs';

const T = runner('火の魔女 死にコンテンツ監査（M8-A）');
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
// 共通経路（BattleScene / SkillBase / Projectile 等）が読むキーも「参照されている」と見なす。
const SHARED = readSrc('src/scenes/BattleScene.js') + readSrc('src/skills/SkillBase.js') + readSrc('src/skills/EvolvedSkillBase.js')
  + readSrc('src/systems/StatusEffectManager.js') + readSrc('src/systems/SkillManager.js') + readSrc('src/entities/Projectile.js')
  + readSrc('src/systems/CastPolicy.js') + readSrc('src/systems/EvolutionManager.js') + readSrc('src/entities/Player.js');

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
for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
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
ok(dead.length === 0, `死にパラメータ 0 件（実際 ${dead.length}）`);

// ===== 2. Lv 成長項目は実際に成長している =====
section('2. levels[] の数値項目は Lv1→Lv8 で少なくとも1つ変化する');
for (const id of FLAME.activeSkillPool) {
  const def = defOf(id);
  const lv = def.levels || [];
  ok(lv.length === (def.maxLevel || 8), `${id}: levels が maxLevel 分ある（${lv.length}）`);
  for (let i = 1; i < lv.length; i++) {
    const changed = Object.keys(lv[i]).some((k) => k !== 'level' && lv[i][k] !== lv[i - 1][k]);
    ok(changed, `${id}: Lv${i} → Lv${i + 1} で少なくとも1つの値が変化する`);
  }
  // NaN / Infinity / 負数が無い。
  for (const l of lv) for (const [k, v] of Object.entries(l)) {
    if (typeof v === 'number') ok(Number.isFinite(v) && v >= 0, `${id}.Lv${l.level}.${k} が有限の非負数（${v}）`);
  }
}

// ===== 3. 旧 evolution ブロック（skills.json 側の重複定義）が残っていない =====
section('3. skills.json に旧 evolution ブロック（skill-evolutions.json と二重管理）が無い');
for (const s of DATA.skills) {
  ok(!s.evolution, `${s.id}: skills.json 側の旧 evolution ブロックが無い（進化の正は skill-evolutions.json のみ）`);
}

// ===== 4. 宣言メタと実装の対応（runtimeState / echo / clone / Lv80 / proc）=====
section('4. 宣言メタと実装の対応（未接続の宣言が無い）');
for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
  const def = defOf(id);
  const src = skillSource(id, MAP);
  const isEvo = FLAME.evolutionPool.includes(id);
  if (/serializeState\s*\(/.test(src)) ok(/restoreState\s*\(/.test(src), `${id}: serializeState があれば restoreState もある`);
  if (/restoreState\s*\(/.test(src)) ok(/serializeState\s*\(/.test(src), `${id}: restoreState があれば serializeState もある`);
  if (def.echoPolicy === 'custom') ok(/echoCast\s*\(/.test(src), `${id}: echoPolicy=custom なら echoCast を実装している`);
  if (def.clonePolicy === 'custom') ok(/cloneCast\s*\(|echoCast\s*\(/.test(src), `${id}: clonePolicy=custom なら cloneCast/echoCast を実装している`);
  if (def.echoPolicy === 'forbidden') ok(def.canTriggerEcho === false, `${id}: echoPolicy=forbidden なら canTriggerEcho=false`);
  if (def.clonePolicy === 'forbidden') ok(def.canBeCopiedByClone === false, `${id}: clonePolicy=forbidden なら canBeCopiedByClone=false`);
  ok(def.lv80ProjectileTarget === true ? /fireProjectileCount\s*\(/.test(src) : !/fireProjectileCount\s*\(/.test(src),
    `${id}: lv80ProjectileTarget=${!!def.lv80ProjectileTarget} と fireProjectileCount の有無が一致`);
  ok(!isEvo || def.lv80ProjectileTarget !== true, `${id}: 進化は Lv80 対象外`);
}

// ===== 5. Job milestone / modifier に対応スキル/経路がある（死に milestone なし）=====
section('5. 火の魔女の Job Lv 報酬が対応スキル/経路を持つ');
{
  const jp = DATA.jobProgression;
  const node = (jp.jobs && (jp.jobs.flame_witch || (Array.isArray(jp.jobs) && jp.jobs.find((j) => j.id === 'flame_witch')))) || jp.flame_witch;
  ok(!!node, 'job-progression.json に flame_witch の定義がある');
  const src = allSrc();
  const jm = readSrc('src/systems/JobModifierManager.js');
  const text = JSON.stringify(node || {});
  for (const key of ['elementDamageMult', 'dotDamageMult', 'areaMult', 'cooldownMult', 'projectileCountBonus',
    'explosionAreaMult', 'echoChance', 'rarityWeightMult', 'evolutionAssist', 'projectileSpeedMult']) {
    if (text.includes(key)) ok(new RegExp(key).test(jm) || new RegExp(key).test(src), `Job modifier ${key} が実装から参照される`);
  }
  // Lv80「発射数+1」は明示 flag の6種のみへ適用される（tag 由来の自動適用をしない）。
  const audit = readSrc('src/systems/SkillAudit.js');
  ok(/lv80ProjectileTarget === true/.test(audit), 'Lv80 対象判定は明示 flag のみ（tag から自動導出しない）');

  // ---- Job Lv1〜100 の全 milestone が JobModifierManager.resolve で解釈される（死に milestone なし）----
  const KNOWN_TYPES = ['fireDamageMult', 'elementDamageMult', 'projectileSpeedMult', 'cooldownMult', 'rerollBonus',
    'explosion', 'evolvedDamageMult', 'rarityWeight', 'projectileCount', 'echo', 'echoUpgrade',
    'statusPowerMult', 'shatterDamageMult', 'areaMult'];
  const ms = (node && node.milestones) || [];
  ok(ms.length >= 10, `flame_witch の milestone が ${ms.length} 件`);
  for (const m of ms) {
    ok(KNOWN_TYPES.includes(m.type), `Lv${m.level} ${m.id}: type=${m.type} が JobModifierManager の既知タイプ`);
    ok(new RegExp("case '" + m.type + "'").test(jm) || m.type === 'echo', `Lv${m.level} ${m.id}: resolve() が type=${m.type} を処理する`);
  }
  ok((node.perLevelBonuses || {}).fireDamagePerLevel > 0, '基本成長 fireDamagePerLevel が正');
  ok((node.perLevelBonuses || {}).fireDotPerLevel > 0, '基本成長 fireDotPerLevel が正');
  ok((node.perLevelBonuses || {}).fireAreaPerLevel > 0, '基本成長 fireAreaPerLevel が正');
  ok(node.levelCap === 100, 'levelCap は 100');
  // 火の補正は primaryElement=fire のときだけ適用される（氷へ誤適用しない）。
  ok(/tags\.element !== this\._r\.primaryElement\) return 1/.test(jm), '属性が一致しないダメージへは補正を適用しない（他ジョブ混入なし）');
  ok(/primaryElement = jobConfig\.element/.test(jm), 'primaryElement は job データから決まる');
  // 周回開始時に凍結される（スキルから profile.jobLevel を直接参照しない）。
  const bs2 = readSrc('src/scenes/BattleScene.js');
  ok(/resolvedJobModifiers/.test(bs2), 'BattleScene が resolvedJobModifiers を周回開始時に凍結する');
  for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
    const s = skillSource(id, MAP);
    ok(!/profile\.jobLevel|jobProgress/.test(s), `${id}: スキルから profile.jobLevel を直接参照しない（jobMods 経由）`);
  }
  // Lv100 の完全残響が再帰キャストを作らない（世代上限は CastPolicy が持つ）。
  const cp = readSrc('src/systems/CastPolicy.js');
  ok(/if \(gen > mg\) return null;/.test(cp), 'Lv100 の残響でも generation 上限で再帰しない');
}

// ===== 6. quality cap（未参照 0・存在しない cap の参照 0）=====
section('6. quality cap の未参照 0 / 存在しない cap の参照 0');
{
  const SRC = allSrc();
  const CAPS = DATA.balance.skillCaps || {};
  const unused = Object.keys(CAPS).filter((k) => !new RegExp("'" + k + "'").test(SRC)).sort();
  ok(unused.length === 0, `未参照 quality cap 0 件（実際 ${unused.length}: ${unused.join(', ') || 'なし'}）`);
  const refs = new Set();
  for (const m of SRC.matchAll(/skillCap\(\s*'([A-Za-z0-9_]+)'/g)) refs.add(m[1]);
  for (const m of SRC.matchAll(/frameBudget\(\s*'[^']*'\s*,\s*'([A-Za-z0-9_]+)'/g)) refs.add(m[1]);
  for (const n of [...refs].sort()) ok(n in CAPS, `skillCap('${n}') が balance.json に存在する`);
  // M7-E で残っていた「火由来の未参照 cap 5件」が解消されている。
  for (const removed of ['maxBarrierEffects', 'maxBurningEnemyIndex', 'maxChainTargets', 'maxCopyGeneration', 'maxMainCastEventsPerFrame']) {
    ok(!(removed in CAPS), `M7-E から残っていた未参照 cap ${removed} が解消されている`);
  }
}

// ===== 7. 死にフィールド（実装側の未使用インスタンス変数）=====
section('7. 実装側の予約フィールドが残っていない');
{
  const base = readSrc('src/skills/SkillBase.js');
  ok(!/_initCd/.test(base), 'SkillBase の未参照フィールド _initCd が削除されている');
  const src = allSrc();
  // serializeState が空オブジェクトだけを返す実装（＝実質 no-op な保存）が無い。
  ok(!/serializeState\(\)\s*\{\s*return\s*\{\s*\};?\s*\}/.test(src), 'serializeState() が空オブジェクトを返すだけの実装は無い');
}

// ===== 8. docs と実装の一致 =====
section('8. docs に主要な宣言値が記載されている');
{
  const skillsMd = readSrc('docs/skills.md') + readSrc('docs/jobs.md') + readSrc('docs/skill-catalog.md');
  for (const id of FLAME.activeSkillPool) ok(skillsMd.includes(id), `docs に ${id} の記載がある`);
  for (const id of FLAME.evolutionPool) ok(skillsMd.includes(id), `docs に ${id} の記載がある`);
}

T.finish();
