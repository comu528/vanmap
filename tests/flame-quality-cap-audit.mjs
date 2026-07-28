// 火の魔女 完成監査 10/12: 品質別上限（quality cap）の監査（M8-A §12）。Node.js 標準機能のみ。
// balance.json の skillCaps について「参照されない上限」「存在しない上限の参照」「名前違い」「非正/順序違反」を検出し、
// 上限到達時も炎上/DoT/防御などのロジックが落ちないこと、low 品質でも 0 件化しないことを確認する。
// M8-A では M7-E から残っていた「火の魔女由来の未参照 cap 5 件」を解消したため、許容リストは空である。
// 実行: node tests/flame-quality-cap-audit.mjs

import { DATA, FLAME, registryMap, skillSource, readSrc, runner, allSrc, capFor, makeScene, makeEnemies, bootRuntime, evolutionBaseMap } from './flame-audit-common.mjs';

const { SkillManager } = await bootRuntime();
const T = runner('火の魔女 quality cap 監査（M8-A）');
const { ok, section, info } = T;

const CAPS = DATA.balance.skillCaps || {};
const SRC = allSrc();
const MAP = registryMap();
const TIERS = ['low', 'medium', 'high', 'ultra'];
const EVO_BASE = evolutionBaseMap();

// ===== 1. 値の妥当性（正数・low ≤ medium ≤ high ≤ ultra）=====
section('1. すべての skillCaps が正数で low ≤ medium ≤ high ≤ ultra');
for (const [name, v] of Object.entries(CAPS)) {
  ok(v && typeof v === 'object', `${name}: オブジェクト`);
  for (const t of TIERS) {
    ok(typeof v[t] === 'number' && Number.isFinite(v[t]) && v[t] > 0, `${name}.${t} が正の有限数（${v[t]}）`);
  }
  ok(v.low <= v.medium && v.medium <= v.high && v.high <= v.ultra, `${name}: low ${v.low} ≤ medium ${v.medium} ≤ high ${v.high} ≤ ultra ${v.ultra}`);
}
info(`skillCaps 総数 ${Object.keys(CAPS).length} 件`);

// ===== 2. 未参照の上限が 0 件（M8-A で火由来の 5 件を解消）=====
section('2. 宣言された上限が実装から参照される（未使用 cap 0 件）');
{
  const unused = Object.keys(CAPS).filter((k) => !new RegExp("'" + k + "'").test(SRC)).sort();
  for (const k of unused) ok(false, `${k}: 未参照の上限（M8-A では 0 件でなければならない）`);
  ok(unused.length === 0, `未参照 quality cap 0 件（実際 ${unused.length}: ${unused.join(', ') || 'なし'}）`);
  for (const removed of ['maxBarrierEffects', 'maxBurningEnemyIndex', 'maxChainTargets', 'maxCopyGeneration', 'maxMainCastEventsPerFrame']) {
    ok(!(removed in CAPS), `M7-E から残っていた未参照 cap ${removed} を削除済み`);
  }
}

// ===== 3. 存在しない上限を参照していない（名前違いの検出）=====
section('3. 実装が参照する上限名がすべて実在する（存在しない cap / 名前違いの検出）');
{
  const referenced = new Set();
  for (const m of SRC.matchAll(/skillCap\(\s*'([A-Za-z0-9_]+)'/g)) referenced.add(m[1]);
  for (const m of SRC.matchAll(/frameBudget\(\s*'[^']*'\s*,\s*'([A-Za-z0-9_]+)'/g)) referenced.add(m[1]);
  for (const name of [...referenced].sort()) ok(name in CAPS, `skillCap('${name}') が balance.json に存在する`);
  info(`quality cap の参照名 ${referenced.size} 件`);
}

// ===== 4. safetyCaps（進化ごとの絶対上限）と quality cap の二層 =====
section('4. 進化の safetyCaps は EvolvedSkillBase.cap() で読むか、同等の quality cap が実装にある');
for (const eid of FLAME.evolutionPool) {
  const ev = DATA.evolutions.find((e) => e.id === eid);
  const src = skillSource(eid, MAP);
  const keys = Object.keys(ev.safetyCaps || {});
  ok(keys.length > 0, `${eid}: safetyCaps を宣言している`);
  for (const k of keys) ok(typeof ev.safetyCaps[k] === 'number' && ev.safetyCaps[k] >= 0, `${eid}.safetyCaps.${k} が非負`);
  ok(/this\.cap\(|skillCap\(|frameBudget\(/.test(src), `${eid}: 上限機構（this.cap / skillCap / frameBudget）を実際に使う`);
}

// ===== 5. 装飾上限とダメージ上限の分離 =====
section('5. 表示上限（effectQuality / particleBudget）と判定上限（skillCaps）が分離している');
{
  const eq = DATA.balance.effectQuality || {};
  ok(Object.keys(eq).length > 0, 'effectQuality（表示上限）が存在する');
  const em = readSrc('src/systems/EffectManager.js');
  ok(!/dealDamage\(|damageArea\(/.test(em), 'EffectManager は damage 判定を行わない（表示上限が火力に影響しない）');
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/particleBudget/.test(bs) || /particleBudget/.test(em), 'パーティクル予算は表示側のみで使われる');
  ok(/_explosionBudget/.test(bs), '爆発の判定予算は skillCaps 側で管理される');
}

// ===== 6. low 品質でも 0 件化しない =====
section('6. low 品質でも主要スキルの生成数が 0 にならない');
const KEY_CAPS = ['maxFlameLances', 'maxHomingWisps', 'maxSummons', 'maxSummonProjectiles', 'maxActiveVortices',
  'maxMarks', 'maxChainDepth', 'maxSimultaneousExplosions', 'maxEvolutionProjectiles', 'maxClones',
  'maxBloodfireProjectiles', 'maxFurnaceProjectiles', 'maxScreenEdgeWaves', 'maxTethers', 'maxBlazingTrails',
  'maxSolarMirrors', 'maxInfernoBlades', 'maxAshLegionUnits', 'maxMines', 'maxFuneralPyres', 'maxMagmaVeins',
  'maxMagmaSegments', 'maxTriArrays', 'maxResonanceTargets', 'maxOverdriveProjectiles', 'maxMausoleums',
  'maxHexagramArrays', 'maxDoomsdayProjectiles'];
for (const name of KEY_CAPS) {
  ok(name in CAPS, `${name} が存在する`);
  ok(capFor(name, 'low', 0) >= 1, `${name}: low 品質でも 1 以上（0 件化しない）`);
}

// ===== 7. 上限が実データの要求値以上（high 品質では実効値を削らない）=====
section('7. 主要な上限が data の要求値以上（high 品質では主効果を削らない）');
const lv8 = (id) => { const s = DATA.skills.find((x) => x.id === id); return (s.levels || [])[7] || {}; };
ok(capFor('maxFlameLances', 'high') >= (lv8('flame_lance').count || 1), 'maxFlameLances ≥ flame_lance Lv8 の発射数');
ok(capFor('maxSummons', 'high') >= (lv8('fire_spirit').count || 1), 'maxSummons ≥ fire_spirit Lv8 の召喚数');
ok(capFor('maxClones', 'high') >= (lv8('ash_doppelganger').cloneCount || 1), 'maxClones ≥ ash_doppelganger Lv8 の分身数');
ok(capFor('maxActiveVortices', 'high') >= (lv8('flame_vortex').count || 1), 'maxActiveVortices ≥ flame_vortex Lv8 の渦数');
ok(capFor('maxMagmaVeins', 'high') >= (lv8('magma_vein').veinCount || 1), 'maxMagmaVeins ≥ magma_vein Lv8 の脈数');
ok(capFor('maxTriArrays', 'high') >= (lv8('tri_flame_array').arrays || 1), 'maxTriArrays ≥ tri_flame_array Lv8 の陣数');
ok(capFor('maxScreenEdgeWaves', 'high') >= (lv8('four_sided_inferno').directions || 1), 'maxScreenEdgeWaves ≥ four_sided_inferno Lv8 の方向数');
ok(capFor('maxMines', 'high') >= (lv8('ember_minefield').mines || 1), 'maxMines ≥ ember_minefield Lv8 の地雷数');
ok(capFor('maxTethers', 'high') >= (lv8('molten_chains').chains || 1), 'maxTethers ≥ molten_chains Lv8 の鎖数');
{
  const sol = DATA.evolutions.find((e) => e.id === 'solar_annihilation_array');
  ok(capFor('maxSolarMirrors', 'low') >= 1, 'maxSolarMirrors は low でも 1 以上（主光線が消えない）');
  ok((sol.safetyCaps || {}).maxSolarMirrors >= (sol.projectileCount || {}).mirrors, 'safetyCaps.maxSolarMirrors ≥ data の鏡数');
}

// ===== 8. 全敵総当たり・無制限インスタンスが無い =====
section('8. 全敵総当たり / 無制限インスタンスが無い');
for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
  const src = skillSource(id, MAP);
  ok(!/for\s*\(\s*const\s+\w+\s+of\s+this\.scene\.enemies\b/.test(src), `${id}: scene.enemies を直接全走査しない（SpatialGrid 経由）`);
  ok(!/enemyPool\.forEachActive/.test(src), `${id}: enemyPool.forEachActive による全敵総当たりをしない（炎上索引 / SpatialGrid を使う）`);
}

// ===== 9. low / ultra でダメージイベントが 0 にならない（実駆動）=====
section('9. low / medium / high / ultra すべてでダメージイベントが発生する（実駆動）');
for (const q of TIERS) {
  const scene = makeScene({ enemies: makeEnemies(20, { dy: 12 }), quality: q, absorb: 1, seed: 0x33aa77bb, deathEvents: [{ id: 1, x: 320, y: 200 }] });
  const sm = new SkillManager(scene); scene.skills = sm;
  for (const id of ['fireball', 'flame_lance', 'magma_vein', 'tri_flame_array', 'ember_minefield']) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  sm.acquireOrLevel('magma_vein'); sm.setLevel('magma_vein', 8); sm.evolve('magma_vein'); // world_scorching_rift
  for (let f = 0; f < 400; f++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  const dmgEvents = scene.calls.filter((c) => c[0] === 'dmg' || c[0] === 'area' || c[0] === 'aoe').length;
  ok(dmgEvents > 0, `${q}: ダメージイベントが発生する（${dmgEvents} 件）`);
  info(`${q}: ダメージイベント ${dmgEvents} 件 / 呼び出し総数 ${scene.calls.length}`);
}
void EVO_BASE;

T.finish();
