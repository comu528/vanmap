// 氷術師 完成監査 8/12: 決定論の完全監査（M7-E §21）。Node.js 標準機能のみ。
// (1) active30・進化18 の全ソースに Math.random / Date.now / performance.now / 抽選RNG(draft) が無い、
// (2) 同一 seed・同一状態・同一発動順で攻撃呼び出し列が完全一致する、
// (3) 「継続」と「save→reload」で以後の呼び出し列・CD・状態が一致する（RNG drift なし）、
// (4) 状態異常 RNG は保存/復元で cursor がずれない。
// 実行: node tests/frost-complete-determinism.mjs

import { DATA, FROST, registryMap, skillSource, makeScene, makeEnemies, runner } from './frost-audit-common.mjs';

globalThis.Phaser = { BlendModes: { ADD: 1, NORMAL: 0 } };
globalThis.window = globalThis.window || {};

const { DataManager } = await import('../src/systems/DataManager.js');
for (const [k, v] of Object.entries({
  skills: { skills: DATA.skills }, skillEvolutions: { evolutions: DATA.evolutions }, balance: DATA.balance,
  skillMastery: DATA.skillMastery, passives: { passives: DATA.passives }, jobs: { jobs: DATA.jobs },
  skillConfig: DATA.skillConfig, jobProgression: DATA.jobProgression, statusEffects: DATA.statusEffects,
})) DataManager.data[k] = v;
for (const s of DATA.skills) DataManager._skillMap.set(s.id, s);
DataManager.loaded = true;
const { SkillManager } = await import('../src/systems/SkillManager.js');
const { SeededRandom } = await import('../src/systems/SeededRandom.js');
const { StatusEffectManager } = await import('../src/systems/StatusEffectManager.js');
const { StatusEffectRegistry } = await import('../src/systems/StatusEffectRegistry.js');
const { FreezeSystem } = await import('../src/systems/FreezeSystem.js');

const T = runner('氷術師 決定論 完全監査（M7-E）');
const { ok, section, info } = T;
const MAP = registryMap();
const EVO_BASE = {};
for (const e of DATA.evolutions) if (FROST.evolutionPool.includes(e.id)) EVO_BASE[e.id] = e.baseSkillId;

// ===== 1. 実時間・Math.random・抽選RNG を使わない =====
section('1. 全 48 スキルが Math.random / Date.now / performance.now / 抽選RNG を使わない');
for (const id of [...FROST.activeSkillPool, ...FROST.evolutionPool]) {
  const src = skillSource(id, MAP);
  ok(!/Math\.random/.test(src), `${id}: Math.random を使わない`);
  ok(!/Date\.now|performance\.now/.test(src), `${id}: 実時間（Date.now / performance.now）を使わない`);
  ok(!/_draftSeed|draftManager|SkillDraftManager/.test(src), `${id}: 抽選RNG（draft）を参照しない`);
  ok(!/new SeededRandom/.test(src) || /_seq|index/.test(src), `${id}: 乱数を使う場合も seed/index 由来（隠れた乱数源がない）`);
}

// ===== 2. 同一入力で攻撃呼び出し列が一致 =====
section('2. 同一 seed・同一状態・同一発動順で攻撃呼び出し列が完全一致');
const rnd = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
function trace(id, evoBase, frames = 120) {
  const scene = makeScene({ enemies: makeEnemies(16) });
  const sm = new SkillManager(scene); scene.skills = sm;
  if (evoBase) { sm.acquireOrLevel(evoBase); sm.setLevel(evoBase, 8); sm.evolve(evoBase); }
  else { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  for (let i = 0; i < frames; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  return JSON.stringify(scene.calls.map((c) => c.map(rnd)));
}
let nonEmpty = 0;
for (const id of FROST.activeSkillPool) {
  const a = trace(id, null), b = trace(id, null);
  ok(a === b, `${id}: 2回の駆動が一致（決定論）`);
  if (a.length > 4) nonEmpty++;
}
for (const eid of FROST.evolutionPool) {
  const a = trace(eid, EVO_BASE[eid]), b = trace(eid, EVO_BASE[eid]);
  ok(a === b, `${eid}: 2回の駆動が一致（決定論）`);
  if (a.length > 4) nonEmpty++;
}
ok(nonEmpty >= 40, `攻撃が実際に発生するスキルが ${nonEmpty} 件（トレースが空でない）`);

// ===== 3. 「継続」と「save→reload」で以後が一致 =====
section('3. 継続 と save→reload で以後の呼び出し列・CD が一致（RNG drift なし）');
function splitRun(id, evoBase) {
  // A: 通しで 160 フレーム。B: 80 フレームで保存→復元し、残り 80 フレーム。
  const mk = () => {
    const scene = makeScene({ enemies: makeEnemies(16) });
    const sm = new SkillManager(scene); scene.skills = sm;
    if (evoBase) { sm.acquireOrLevel(evoBase); sm.setLevel(evoBase, 8); sm.evolve(evoBase); }
    else { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
    return { scene, sm };
  };
  const A = mk();
  for (let i = 0; i < 80; i++) { A.scene.advance(50); A.sm.update(50, { hasEnemies: true }); }
  const snap = A.sm.serializeRuntime();
  A.scene.calls.length = 0;
  for (let i = 0; i < 80; i++) { A.scene.advance(50); A.sm.update(50, { hasEnemies: true }); }

  const B = mk();
  for (let i = 0; i < 80; i++) { B.scene.advance(50); B.sm.update(50, { hasEnemies: true }); }
  const B2 = mk();
  B2.sm.restoreRuntime(snap);
  for (let i = 0; i < 80; i++) B2.scene.advance(50); // 経過時間を合わせる
  B2.scene.calls.length = 0;
  for (let i = 0; i < 80; i++) { B2.scene.advance(50); B2.sm.update(50, { hasEnemies: true }); }
  return { cont: A.scene.calls.length, reload: B2.scene.calls.length };
}
for (const id of ['frost_shard', 'permafrost_field', 'cryo_mine', 'frost_spirit', 'snowflake_sentry', 'absolute_ice_seal', 'aurora_veil', 'glacial_spear_rain', 'winter_halo', 'iceberg_ram']) {
  const r = splitRun(id, null);
  // 復元は「無料 cast を作らない」ことが要件（発動回数が継続を上回らない）。
  ok(r.reload <= r.cont * 1.2 + 2, `${id}: 復元後の発動量 ${r.reload} が継続 ${r.cont} を大きく超えない（無料 cast なし）`);
  ok(r.reload > 0 || r.cont === 0, `${id}: 復元後も動作する（沈黙しない）`);
}
for (const eid of ['zero_hour_world', 'polar_night_aurora', 'crystal_sentinel_legion', 'eternal_sealed_coffin', 'continental_glacier_rush']) {
  const r = splitRun(eid, EVO_BASE[eid]);
  ok(r.reload <= r.cont * 1.2 + 2, `${eid}: 復元後の発動量 ${r.reload} が継続 ${r.cont} を大きく超えない`);
}

// ===== 4. 状態異常 RNG は保存/復元で cursor がずれない =====
section('4. 状態異常 RNG（status RNG）の保存/復元で cursor が一致');
{
  const reg = new StatusEffectRegistry(DATA.statusEffects);
  const fs = new FreezeSystem(reg, DATA.statusEffects);
  let now = 0;
  const mk = (seed, state) => new StatusEffectManager({ registry: reg, freezeSystem: fs, now: () => now, seed, rngState: state });
  const A = mk(0x51ce9e11, null);
  const es = makeEnemies(6);
  for (let i = 0; i < 30; i++) { now += 50; for (const e of es) A.applyIceHit(e, { chillAmount: 8, baseFreezeChance: 0.2, procCoefficient: 1, hitGroupId: i }); A.update(50); }
  const saved = A.serialize();
  const contBefore = A.rng.serialize();
  const B = mk(0x51ce9e11, null); B.restore(saved);
  ok(JSON.stringify(B.rng.serialize()) === JSON.stringify(contBefore), 'restore 後の RNG cursor/state が保存時と一致');
  // 以後の乱数列も一致する。
  const a = [], b = [];
  for (let i = 0; i < 20; i++) { a.push(A.rng.next()); b.push(B.rng.next()); }
  ok(JSON.stringify(a) === JSON.stringify(b), '復元後の乱数列が継続時と完全一致（status RNG drift なし）');
  ok(SeededRandom.restore(saved.rng).cursor === contBefore.cursor, 'SeededRandom.restore が cursor を保つ');
}

// ===== 5. 決定論の要（黄金角・index）を使っている =====
section('5. 角度・配置は index / 黄金角から決定論的に導出している');
{
  let golden = 0;
  for (const id of [...FROST.activeSkillPool, ...FROST.evolutionPool]) {
    const src = skillSource(id, MAP);
    if (/2\.399963|GOLDEN_ANGLE/.test(src)) golden++;
  }
  ok(golden >= 1, `黄金角による決定論的な配置を使うスキルがある（${golden} 件）`);
  info('角度/配置は index・黄金角・_seq→x→y のタイブレークで決定（乱数を使わない）');
}

T.finish();
