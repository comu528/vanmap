// 氷術師 完成監査 10/12: 品質別上限（quality cap）の監査（M7-E §22）。Node.js 標準機能のみ。
// balance.json の skillCaps について「参照されない上限」「存在しない上限の参照」「名前違い」「非正/順序違反」を検出し、
// 上限到達時も冷気/凍結/防御などの状態ロジックが落ちないこと、low 品質でも 0 件化しないことを確認する。
// 実行: node tests/frost-quality-cap-audit.mjs

import { DATA, FROST, registryMap, skillSource, readSrc, runner, allSrc, capFor } from './frost-audit-common.mjs';
import { capTiers } from './cap-shape.mjs';

const T = runner('氷術師 quality cap 監査（M7-E）');
const { ok, section, info } = T;

const CAPS = DATA.balance.skillCaps || {};
const SRC = allSrc();
const MAP = registryMap();
const TIERS = ['low', 'medium', 'high', 'ultra'];

// 火の魔女側で M6 期から残っている未参照上限（M7-E の対象外＝火の挙動を変えないため保持する）。
const FLAME_LEGACY_UNUSED = ['maxBarrierEffects', 'maxBurningEnemyIndex', 'maxChainTargets', 'maxCopyGeneration', 'maxMainCastEventsPerFrame'];

// ===== 1. 値の妥当性（正数・low ≤ medium ≤ high ≤ ultra）=====
section('1. すべての skillCaps が正数・単調（visual は 4 段階 / gameplay・safety は単一値）');
for (const [name, v] of Object.entries(CAPS)) {
  ok(v && typeof v === 'object', `${name}: オブジェクト`);
  // M9-A: gameplay / safety は単一値（品質非依存）、visual だけ 4 段階。
  const t4 = capTiers(v);
  for (const t of TIERS) {
    ok(Number.isFinite(t4[t]) && t4[t] > 0, `${name}.${t} が正の有限数（${t4[t]}）`);
  }
  ok(t4.low <= t4.medium && t4.medium <= t4.high && t4.high <= t4.ultra, `${name}: low ${t4.low} ≤ medium ${t4.medium} ≤ high ${t4.high} ≤ ultra ${t4.ultra}`);
}

// ===== 2. 未参照の上限が無い（火の既存分を除く）=====
section('2. 宣言された上限が実装から参照される（未使用 cap の検出）');
const unused = Object.keys(CAPS).filter((k) => !new RegExp("'" + k + "'").test(SRC)).sort();
for (const k of unused) {
  ok(FLAME_LEGACY_UNUSED.includes(k), `${k}: 未参照の上限（M7-E で許容するのは火の魔女由来の既存分のみ）`);
}
info(`未参照（火の魔女由来・M7-E 対象外）: ${unused.join(', ') || 'なし'}`);
ok(unused.every((k) => FLAME_LEGACY_UNUSED.includes(k)), '氷術師側に未参照の quality cap が無い');

// ===== 3. 存在しない上限を参照していない（名前違いの検出）=====
section('3. 実装が参照する上限名がすべて実在する（存在しない cap / 名前違いの検出）');
{
  const referenced = new Set();
  for (const m of SRC.matchAll(/skillCap\(\s*'([A-Za-z0-9_]+)'/g)) referenced.add(m[1]);
  for (const m of SRC.matchAll(/frameBudget\(\s*'[^']*'\s*,\s*'([A-Za-z0-9_]+)'/g)) referenced.add(m[1]);
  for (const name of [...referenced].sort()) ok(name in CAPS, `skillCap('${name}') が balance.json に存在する`);
  info(`quality cap の参照名 ${referenced.size} 件`);
}

// ===== 4. safetyCaps（進化ごとの絶対上限）と quality cap の二層が矛盾しない =====
section('4. 進化の safetyCaps は EvolvedSkillBase.cap() で読むか、同等の quality cap が実装にある');
for (const eid of FROST.evolutionPool) {
  const ev = DATA.evolutions.find((e) => e.id === eid);
  const src = skillSource(eid, MAP);
  const keys = Object.keys(ev.safetyCaps || {});
  ok(keys.length > 0, `${eid}: safetyCaps を宣言している`);
  for (const k of keys) ok(typeof ev.safetyCaps[k] === 'number' && ev.safetyCaps[k] >= 0, `${eid}.safetyCaps.${k} が非負`);
  // 少なくとも1つの上限機構（safetyCaps / quality cap / frameBudget）を実際に使っていること。
  ok(/this\.cap\(|skillCap\(|frameBudget\(/.test(src), `${eid}: 上限機構（this.cap / skillCap / frameBudget）を実際に使う`);
}

// ===== 5. 装飾上限とダメージ上限の区別 =====
section('5. 表示上限（statusVisuals）と判定上限（skillCaps）が分離している');
{
  const sv = DATA.balance.statusVisuals || {};
  ok(Object.keys(sv).length > 0 || /statusVisual/.test(SRC), 'statusVisuals 系の表示設定が存在する');
  const vm = readSrc('src/systems/StatusVisualManager.js');
  ok(!/dealDamage\(|damageArea\(|applyIceHit\(/.test(vm), '表示マネージャは damage / 状態付与の判定を行わない（表示上限が火力に影響しない）');
  ok(/_cap\(/.test(vm), '表示側は独自の表示上限を使う');
  const sem = readSrc('src/systems/StatusEffectManager.js');
  ok(/maxFrozenEnemies|maxStatusIndexEntries/.test(sem), '状態索引の上限は状態側（skillCaps）で管理される');
  ok(/return false/.test(sem), '索引上限に達しても既存状態は壊さず新規登録だけを止める');
}

// ===== 6. low 品質でも 0 件化しない =====
section('6. low 品質でも主要スキルの生成数が 0 にならない');
const KEY_CAPS = ['maxFrostShards', 'maxGlacialLances', 'maxIcicleVolleyProjectiles', 'maxSnowflakeSentries',
  'maxGlacialSpearProjectiles', 'maxIceSealMarks', 'maxAuroraBands', 'maxPolarStars', 'maxCrystalBlooms',
  'maxIcePrisons', 'maxIcebergRams', 'maxContinentalGlacierRushes', 'maxWorldEndAvalancheWaves', 'maxSentryProjectiles'];
for (const name of KEY_CAPS) {
  ok(name in CAPS, `${name} が存在する`);
  ok(capFor(name, 'low', 0) >= 1, `${name}: low 品質でも 1 以上（0 件化しない）`);
}

// ===== 7. 上限が実データの要求値以上（通常品質で恒等）=====
section('7. 主要な上限が data の要求値以上（high 品質では実効値を削らない）');
const lv8 = (id) => { const s = DATA.skills.find((x) => x.id === id); return (s.levels || [])[7] || {}; };
ok(capFor('maxFrostShards', 'high') >= (lv8('frost_shard').count || 1), 'maxFrostShards ≥ frost_shard Lv8 の発射数');
ok(capFor('maxGlacialLances', 'high') >= (lv8('glacial_lance').count || 1), 'maxGlacialLances ≥ glacial_lance Lv8 の発射数');
ok(capFor('maxGlacialSpearProjectiles', 'high') >= (lv8('glacial_spear_rain').spearCount || 1), 'maxGlacialSpearProjectiles ≥ glacial_spear_rain Lv8 の槍数');
ok(capFor('maxSnowflakeSentries', 'high') >= (lv8('snowflake_sentry').maxSentries || 1), 'maxSnowflakeSentries ≥ snowflake_sentry Lv8 の砲台数');
ok(capFor('maxIceSealMarks', 'high') >= (lv8('absolute_ice_seal').maxMarks || 1), 'maxIceSealMarks ≥ absolute_ice_seal Lv8 の印数');
ok(capFor('maxAuroraBands', 'high') >= (lv8('aurora_veil').bandCount || 1), 'maxAuroraBands ≥ aurora_veil Lv8 の帯数');
ok(capFor('maxIcePrisons', 'high') >= (lv8('ice_prison').targetCount || 1), 'maxIcePrisons ≥ ice_prison Lv8 の対象数（制御スキルの主効果を削らない）');
ok(capFor('maxWorldEndAvalancheWaves', 'low') >= ((DATA.evolutions.find((e) => e.id === 'world_end_avalanche').wave || {}).count || 3),
  'maxWorldEndAvalancheWaves は low でも wave.count 以上（品質で波数を削らない）');

// ===== 8. 全敵総当たり・無制限インスタンスが無い =====
section('8. 全敵総当たり / 無制限インスタンスが無い');
for (const id of [...FROST.activeSkillPool, ...FROST.evolutionPool]) {
  const src = skillSource(id, MAP);
  ok(!/for\s*\(\s*const\s+\w+\s+of\s+this\.scene\.enemies\b/.test(src), `${id}: scene.enemies を直接全走査しない（SpatialGrid 経由）`);
  const pushes = (src.match(/\.push\(/g) || []).length;
  if (pushes > 0) ok(/skillCap\(|this\.cap\(|Math\.min\(/.test(src), `${id}: 配列へ積む処理に上限がある（無制限インスタンスなし）`);
}

T.finish();
