// M7-B: 氷術師 新 active10種・新進化5種の「途中再開時の runtimeState 保存 / 再構築 / 二重生成防止」を実スキルクラスで検証。
// 最小 Phaser モックでスキルを実際に fire/update させ、serializeState/restoreState の round-trip と無料再発動防止を確認する。
// Node.js 標準機能のみ。決定論（Math.random 不使用）は frost-determinism-wave2.mjs で別途検証。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

globalThis.Phaser = { BlendModes: { ADD: 1, NORMAL: 0 } };

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(readFileSync(join(REPO, 'data', n), 'utf8'));
const { DataManager } = await import(join(REPO, 'src/systems/DataManager.js'));
for (const [k, f] of Object.entries({ skills: 'skills.json', skillEvolutions: 'skill-evolutions.json', balance: 'balance.json', skillMastery: 'skill-mastery.json', passives: 'passives.json', jobs: 'jobs.json', skillConfig: 'skill-config.json', jobProgression: 'job-progression.json', statusEffects: 'status-effects.json' })) DataManager.data[k] = load(f);
for (const s of DataManager.data.skills.skills) DataManager._skillMap.set(s.id, s);
DataManager.loaded = true;

const { SkillManager, skillsWithRuntimeState } = await import(join(REPO, 'src/systems/SkillManager.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

// ---- 最小 Phaser シーンモック ----
const mkImg = () => { const o = {}; const c = () => o; for (const m of ['setTint', 'clearTint', 'setBlendMode', 'setDepth', 'setAlpha', 'setScale', 'setPosition', 'setOrigin', 'setVisible', 'setRotation', 'setStrokeStyle', 'destroy', 'setDisplaySize', 'setVelocity']) o[m] = c; o.x = 0; o.y = 0; o.body = { velocity: { x: 0, y: 0 } }; return o; };
const noopEffects = new Proxy({}, { get: () => () => {} });
let nowMs = 1000;
function makeScene() {
  const es = Array.from({ length: 20 }, (_, i) => ({ x: 240 + i * 3, y: 240, alive: true, isBoss: false, isElite: false, maxHp: 60, _seq: i, _chill: 0, applySlow() {} }));
  const scene = {
    time: { get now() { return nowMs; } }, _m: { suppressed: 0 }, worldW: 1600, worldH: 1200, _defaultElement: 'ice',
    add: { image: () => mkImg(), rectangle: () => mkImg(), circle: () => mkImg() },
    effects: noopEffects, player: { x: 300, y: 300, cfg: { attackRange: 260 } },
    boss: null, _hg: 0, nextHitGroupId() { return ++this._hg; }, countProjBySkill: () => 0, _es: es,
    passives: { getAreaMultiplier: () => 1, getDurationMultiplier: () => 1, getDamageMultiplier: () => 1, getIceDamageMultiplier: () => 1, getProjectileCountBonus: () => 0, getMult: () => 1, _cooldownMin: 0.5, version: 0 },
    jobMods: { fireAreaMult: () => 1, explosionAreaMult: () => 1, cooldownMult: () => 1, projectileCountBonus: () => 0, statusPowerMult: () => 1, damageMultiplier: () => 1 },
    telemetry: null,
  };
  scene.combat = {
    nearestEnemy: () => es.find((e) => e.alive) || null, nearestEnemyExcept: () => es.find((e) => e.alive) || null,
    enemiesInRadius: () => es.filter((e) => e.alive), forEachEnemyInRadius: (x, y, r, fn) => { for (const e of es) if (e.alive) fn(e); },
    densestPoint: () => ({ x: 240, y: 240 }), dealDamage: () => false, damageArea: () => {}, spawnPlayerProjectile: () => {},
    skillCap: (n, f) => DataManager.skillCap(n, 'high', f), frameBudget: () => true,
    isFrozen: () => false, isChilled: () => false, chillOf: () => 0, chillRatio: () => 0,
    shatterEnemy: () => false, freezeEnemy: () => false, applyChill: () => 0, addBossGauge: () => null, addBossGaugeTo: () => null,
    absorbBossBullets: () => ({ absorbed: 0, value: 0 }), nextHitGroupId: () => scene.nextHitGroupId(),
    entitiesWithStatus: () => [], countStatus: () => 0, jobElement: () => 'ice', randomEnemies: () => [],
    markEnemy: () => {}, markedCount: () => 0, worldBounds: () => ({ w: 1600, h: 1200 }),
  };
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, sm };
}

const NEW_ACTIVES = ['icicle_volley', 'frost_orbit', 'freezing_ray', 'hailstorm', 'cryo_mine', 'frost_spirit', 'ice_prison', 'avalanche', 'mirror_ice', 'glacier_drop'];
const NEW_EVOS = { crystal_tempest: 'icicle_volley', absolute_zero_ray: 'freezing_ray', whiteout_cataclysm: 'hailstorm', frost_queen_court: 'frost_spirit', world_end_avalanche: 'avalanche' };
// runtimeState（cdLeft）を持つべきスキル（CD/設置/遅延/防御型）と、再構築で足りる常設型（continuous）。
const HAS_RUNTIME = new Set(['icicle_volley', 'freezing_ray', 'hailstorm', 'cryo_mine', 'ice_prison', 'avalanche', 'mirror_ice', 'glacier_drop', 'crystal_tempest', 'absolute_zero_ray', 'whiteout_cataclysm', 'world_end_avalanche']);
const REBUILD_ONLY = new Set(['frost_orbit', 'frost_spirit', 'frost_queen_court']);

function acquireEvo(sm, evoId) { const base = NEW_EVOS[evoId]; sm.acquireOrLevel(base); sm.setLevel(base, 8); sm.evolve(base); return sm.skills.get(evoId); }
function acquireActive(sm, id) { sm.acquireOrLevel(id); sm.setLevel(id, 8); return sm.skills.get(id); }

section('1. runtimeState を持つ/持たないスキルの区別が正しい');
{
  const rt = new Set(skillsWithRuntimeState());
  for (const id of HAS_RUNTIME) ok(rt.has(id), `${id} は runtimeState(cdLeft) を保存する`);
  for (const id of REBUILD_ONLY) ok(!rt.has(id), `${id} は runtimeState を持たず再構築で復元（無料再発動しない）`);
}

section('2. 全15スキルが fire/update で例外を投げず駆動できる（ランタイムスモーク）');
for (const id of [...NEW_ACTIVES, ...Object.keys(NEW_EVOS)]) {
  const { sm } = makeScene();
  const sk = NEW_EVOS[id] ? acquireEvo(sm, id) : acquireActive(sm, id);
  let threw = null;
  try { for (let i = 0; i < 80; i++) { nowMs += 50; sm.update(50, { hasEnemies: true }); } } catch (e) { threw = e; }
  ok(!threw, `${id}: 80フレーム駆動で例外なし${threw ? ' → ' + threw.message : ''}`);
  ok(sk, `${id}: インスタンス生成`);
  if (sk && sk.destroy) { try { sk.destroy(); } catch (e) { ok(false, `${id}: destroy で例外 ${e.message}`); } }
}

section('3. CD型スキル: 発動で CD が張られ、serialize→restore で残り CD を維持（無料再発動しない）');
// mirror_ice は _state.cdLeft を使う防御型のため section 5 で個別検証（ここでは _cd 型を対象）。
for (const id of [...NEW_ACTIVES.filter((x) => HAS_RUNTIME.has(x) && x !== 'mirror_ice'), ...Object.keys(NEW_EVOS).filter((x) => HAS_RUNTIME.has(x))]) {
  const A = makeScene();
  const sk = NEW_EVOS[id] ? acquireEvo(A.sm, id) : acquireActive(A.sm, id);
  for (let i = 0; i < 120 && sk._cd <= 0; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(sk._cd > 0, `${id}: 発動でクールダウンが張られる`);
  const st = sk.serializeState();
  ok(st && typeof st.cdLeft === 'number' && st.cdLeft > 0, `${id}: serializeState が残り cdLeft(>0) を返す`);
  // 別インスタンスへ復元 → 再直列化で cdLeft が一致（round-trip・無料再発動しない）。
  const B = makeScene();
  const sk2 = NEW_EVOS[id] ? acquireEvo(B.sm, id) : acquireActive(B.sm, id);
  sk2.restoreState(st);
  ok(Math.abs((sk2._cd || 0) - st.cdLeft) < 1e-6, `${id}: restoreState で cdLeft を復元`);
}

section('4. 氷河墜落: pendingImpact（落下待機）を保存・復元し、再開直後に二重落下しない');
{
  const A = makeScene();
  const sk = acquireActive(A.sm, 'glacier_drop');
  // 落下を予約するまで駆動。
  for (let i = 0; i < 200 && !sk._pending; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(sk._pending, 'glacier_drop: 落下待機（_pending）が生成される');
  const st = sk.serializeState();
  ok(typeof st.pendingImpactLeft === 'number' && typeof st.pendingImpactX === 'number' && typeof st.pendingImpactY === 'number', 'glacier_drop: pendingImpactLeft/X/Y を保存');
  ok(st.cdLeft > 0, 'glacier_drop: cdLeft も保存（再開直後に無料再発動しない）');
  const B = makeScene();
  const sk2 = acquireActive(B.sm, 'glacier_drop');
  sk2.restoreState(st);
  ok(sk2._pending && Math.abs(sk2._pending.left - st.pendingImpactLeft) < 1e-6, 'glacier_drop: restoreState で予告を再構築（二重生成しない）');
  ok(sk2._cd > 0, 'glacier_drop: 復元後も CD 維持');
}

section('5. 氷鏡結界: cdLeft / activeLeft / durabilityLeft を保存・復元する');
{
  const A = makeScene();
  const sk = acquireActive(A.sm, 'mirror_ice');
  for (let i = 0; i < 4; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); } // 展開させる
  const st = sk.serializeState();
  for (const k of ['cdLeft', 'activeLeft', 'durabilityLeft']) ok(typeof st[k] === 'number', `mirror_ice: ${k} を保存`);
  const B = makeScene();
  const sk2 = acquireActive(B.sm, 'mirror_ice');
  sk2.restoreState(st);
  ok(sk2._state.durabilityLeft === st.durabilityLeft && sk2._state.activeLeft === st.activeLeft, 'mirror_ice: 耐久/残時間を復元（防御耐久を無料再生成しない）');
}

section('6. 常設型（氷晶環/雪精霊/雪后氷霊陣）は再開で二重生成しない（レベル数へ再構築）');
for (const id of REBUILD_ONLY) {
  const { sm, scene } = makeScene();
  const sk = NEW_EVOS[id] ? acquireEvo(sm, id) : acquireActive(sm, id);
  for (let i = 0; i < 20; i++) { nowMs += 50; sm.update(50, { hasEnemies: true }); } // 召喚/氷晶を構築
  const arr = sk.spirits || sk.orbs || [];
  const before = arr.length;
  for (let i = 0; i < 20; i++) { nowMs += 50; sm.update(50, { hasEnemies: true }); } // さらに駆動しても増殖しない
  const after = (sk.spirits || sk.orbs || []).length;
  ok(after === before && after > 0, `${id}: 常設物が上限内で一定（${before}→${after}・無限増殖しない）`);
  ok(typeof sk.serializeState !== 'function', `${id}: serializeState を持たず再構築で復元`);
}

section('7. 火の魔女の runtimeState 保存に影響しない（非回帰）');
{
  const rt = new Set(skillsWithRuntimeState());
  for (const id of ['flame_barrier', 'phoenix_feather', 'ember_minefield', 'scorching_ray']) ok(rt.has(id), `火 ${id} の runtimeState を維持`);
  // 火の魔女の代表 CD スキルが引き続き cdLeft を round-trip できる。
  const { sm } = makeScene();
  sm.acquireOrLevel('fireball'); const fb = sm.skills.get('fireball');
  fb._cd = 500; const st = fb.serializeState ? fb.serializeState() : null;
  if (st) { const { sm: sm2 } = makeScene(); sm2.acquireOrLevel('fireball'); const fb2 = sm2.skills.get('fireball'); fb2.restoreState(st); ok(fb2._cd === 500, 'fireball の cdLeft round-trip 維持'); }
  else ok(true, 'fireball は runtimeState 非対象（既存挙動）');
}

console.log(fail ? `\n✗ 氷術師 runtime保存(wave2)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師 runtime保存(wave2)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
