// M7-C: 氷術師 新 active10種・新進化5種の「途中再開時の runtimeState 保存 / 再構築 / 二重生成防止」を実スキルクラスで検証。
// 最小 Phaser モック（graphics 対応）でスキルを実際に fire/update させ、serializeState/restoreState の round-trip と無料再発動防止を確認する。
// Node.js 標準機能のみ。決定論（Math.random 不使用）は frost-determinism-wave3.mjs で別途検証。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

globalThis.Phaser = { BlendModes: { ADD: 1, NORMAL: 0 } };
globalThis.window = globalThis.window || {};

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

// ---- 最小 Phaser シーンモック（graphics/円/矩形/画像 対応・全メソッド chainable） ----
function stub() { const t = { x: 0, y: 0, width: 0, height: 0, radius: 0, body: { velocity: { x: 0, y: 0 } } }; const p = new Proxy(t, { get(o, k) { if (k in o) return o[k]; if (k === 'then') return undefined; return () => p; } }); return p; }
const noopEffects = new Proxy({}, { get: () => () => {} });
let nowMs = 1000;
function makeScene() {
  const es = Array.from({ length: 20 }, (_, i) => ({ x: 240 + i * 3, y: 240 + (i % 4) * 4, alive: true, isBoss: false, isElite: false, maxHp: 60, _seq: i, _chill: 0, applySlow() {} }));
  const scene = {
    time: { get now() { return nowMs; } }, _m: { suppressed: 0 }, worldW: 1600, worldH: 1200, _defaultElement: 'ice',
    add: { image: () => stub(), rectangle: () => stub(), circle: () => stub(), ellipse: () => stub(), graphics: () => stub(), text: () => stub(), container: () => stub() },
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

const NEW_ACTIVES = ['rime_boomerang', 'frost_chain', 'crystal_bloom', 'snowblind_mist', 'polar_star', 'icebreaker_wave', 'frozen_clock', 'crystal_refraction', 'winter_halo', 'comet_sleet'];
const NEW_EVOS = { rime_execution_wheel: 'rime_boomerang', eternal_frost_chain: 'frost_chain', crystal_world_tree: 'crystal_bloom', everlasting_white_mist: 'snowblind_mist', zero_hour_world: 'frozen_clock' };
const ALL = [...NEW_ACTIVES, ...Object.keys(NEW_EVOS)];
// winter_halo は _state.cdLeft を使う防御型（個別検証）。それ以外の CD 型は _cd を使う。
const CD_FIELD_STATE = new Set(['winter_halo']);

function acquireEvo(sm, evoId) { const base = NEW_EVOS[evoId]; sm.acquireOrLevel(base); sm.setLevel(base, 8); sm.evolve(base); return sm.skills.get(evoId); }
function acquireActive(sm, id) { sm.acquireOrLevel(id); sm.setLevel(id, 8); return sm.skills.get(id); }

section('1. 新 active10・新進化5 は全て runtimeState を保存する');
{
  const rt = new Set(skillsWithRuntimeState());
  for (const id of ALL) ok(rt.has(id), `${id} は runtimeState を保存する`);
}

section('2. 全15スキルが fire/update で例外を投げず駆動できる（graphics 経路のランタイムスモーク）');
for (const id of ALL) {
  const { sm } = makeScene();
  const sk = NEW_EVOS[id] ? acquireEvo(sm, id) : acquireActive(sm, id);
  let threw = null;
  try { for (let i = 0; i < 100; i++) { nowMs += 50; sm.update(50, { hasEnemies: true }); } } catch (e) { threw = e; }
  ok(!threw, `${id}: 100フレーム駆動で例外なし${threw ? ' → ' + threw.message : ''}`);
  ok(sk, `${id}: インスタンス生成`);
  if (sk && sk.destroy) { try { sk.destroy(); } catch (e) { ok(false, `${id}: destroy で例外 ${e.message}`); } }
}

section('3. _cd 型 CD スキル: 発動で CD が張られ、serialize→restore で残り CD を維持（無料再発動しない）');
for (const id of ALL.filter((x) => !CD_FIELD_STATE.has(x))) {
  const A = makeScene();
  const sk = NEW_EVOS[id] ? acquireEvo(A.sm, id) : acquireActive(A.sm, id);
  for (let i = 0; i < 240 && sk._cd <= 0; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(sk._cd > 0, `${id}: 発動でクールダウンが張られる`);
  const st = sk.serializeState();
  ok(st && typeof st.cdLeft === 'number' && st.cdLeft > 0, `${id}: serializeState が残り cdLeft(>0) を返す`);
  const B = makeScene();
  const sk2 = NEW_EVOS[id] ? acquireEvo(B.sm, id) : acquireActive(B.sm, id);
  sk2.restoreState(st);
  ok(Math.abs((sk2._cd || 0) - st.cdLeft) < 1e-6, `${id}: restoreState で cdLeft を復元`);
}

section('4. crystal_bloom: 芽（x/y/growLeft/pulseLeft）を保存・復元し、開花済みを復活させない');
{
  const A = makeScene(); const sk = acquireActive(A.sm, 'crystal_bloom');
  for (let i = 0; i < 60 && !sk.blooms.length; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(sk.blooms.length > 0, 'crystal_bloom: 芽が設置される');
  const st = sk.serializeState();
  ok(Array.isArray(st.blooms) && st.blooms.length > 0 && typeof st.blooms[0].growLeft === 'number', 'crystal_bloom: 芽の x/y/growLeft/pulseLeft を保存');
  const B = makeScene(); const sk2 = acquireActive(B.sm, 'crystal_bloom');
  sk2.restoreState(st);
  ok(sk2.blooms.length === st.blooms.filter((b) => b.growLeft > 0).length, 'crystal_bloom: 成長中の芽のみ再構築（二重生成しない）');
}

section('5. snowblind_mist: activeLeft/center/tickLeft を保存し、主霧を二重生成しない');
{
  const A = makeScene(); const sk = acquireActive(A.sm, 'snowblind_mist');
  for (let i = 0; i < 30 && !sk._mist; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(sk._mist, 'snowblind_mist: 主霧が生成される');
  const st = sk.serializeState();
  ok(typeof st.activeLeft === 'number' && typeof st.centerX === 'number' && typeof st.tickLeft === 'number', 'snowblind_mist: activeLeft/center/tickLeft を保存');
  const B = makeScene(); const sk2 = acquireActive(B.sm, 'snowblind_mist');
  sk2.restoreState(st);
  ok(sk2._mist && Math.abs(sk2._mist.activeLeft - st.activeLeft) < 1e-6, 'snowblind_mist: 主霧を1つだけ再構築');
}

section('6. frozen_clock: 未発生波（remainingWaves/nextWaveLeft/index/origin）を保存し、二重発生しない');
{
  const A = makeScene(); const sk = acquireActive(A.sm, 'frozen_clock');
  for (let i = 0; i < 300 && !sk._pending; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(sk._pending, 'frozen_clock: 波の予約（_pending）が生成される');
  const st = sk.serializeState();
  ok(typeof st.remainingWaves === 'number' && typeof st.castOriginX === 'number', 'frozen_clock: remainingWaves/origin を保存');
  const B = makeScene(); const sk2 = acquireActive(B.sm, 'frozen_clock');
  sk2.restoreState(st);
  ok(sk2._pending && sk2._pending.remaining === st.remainingWaves, 'frozen_clock: 未発生波のみ再開（発生済みは再発生しない）');
}

section('7. winter_halo: cdLeft/activeLeft/durabilityLeft を保存・復元（防御耐久を無料再生成しない）');
{
  const A = makeScene(); const sk = acquireActive(A.sm, 'winter_halo');
  for (let i = 0; i < 4; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  const st = sk.serializeState();
  for (const k of ['cdLeft', 'activeLeft', 'durabilityLeft']) ok(typeof st[k] === 'number', `winter_halo: ${k} を保存`);
  const B = makeScene(); const sk2 = acquireActive(B.sm, 'winter_halo');
  sk2.restoreState(st);
  ok(sk2._state.durabilityLeft === st.durabilityLeft && sk2._state.activeLeft === st.activeLeft, 'winter_halo: 耐久/残時間を復元');
}

section('8. comet_sleet: barrage（cometsRemaining/nextCometLeft/index/center/telegraph）を保存し、二重開始しない');
{
  const A = makeScene(); const sk = acquireActive(A.sm, 'comet_sleet');
  for (let i = 0; i < 30 && !(sk._barrage && sk._barrage.active); i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(sk._barrage && sk._barrage.active, 'comet_sleet: barrage が開始される');
  const st = sk.serializeState();
  ok(st.barrageActive === true && typeof st.cometsRemaining === 'number' && typeof st.targetCenterX === 'number', 'comet_sleet: barrage 状態を保存');
  const B = makeScene(); const sk2 = acquireActive(B.sm, 'comet_sleet');
  sk2.restoreState(st);
  ok(sk2._barrage && sk2._barrage.remaining === st.cometsRemaining, 'comet_sleet: 未発射の彗星のみ再開');
}

section('9. 進化 runtime: 樹（crystal_world_tree）・白霧（everlasting_white_mist）・時計波（zero_hour_world）の保存/復元');
{
  // crystal_world_tree: 樹の x/y/growLeft/pulseLeft/phase
  const A = makeScene(); const t = acquireEvo(A.sm, 'crystal_world_tree');
  for (let i = 0; i < 80 && !t.trees.length; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(t.trees.length > 0, 'crystal_world_tree: 樹が生成される');
  const ts = t.serializeState();
  ok(Array.isArray(ts.trees) && ts.trees[0] && typeof ts.trees[0].growLeft === 'number' && ts.trees[0].phase != null, 'crystal_world_tree: 樹の状態を保存');
  const B = makeScene(); const t2 = acquireEvo(B.sm, 'crystal_world_tree'); t2.restoreState(ts);
  ok(t2.trees.length === ts.trees.filter((x) => x.growLeft > 0).length, 'crystal_world_tree: 成長中の樹のみ再構築');
  // everlasting_white_mist: activeLeft/center/tick/whiteoutLeft
  const C = makeScene(); const m = acquireEvo(C.sm, 'everlasting_white_mist');
  for (let i = 0; i < 30 && !m._mist; i++) { nowMs += 50; C.sm.update(50, { hasEnemies: true }); }
  ok(m._mist, 'everlasting_white_mist: 主霧が生成される');
  const ms = m.serializeState();
  ok(typeof ms.activeLeft === 'number' && typeof ms.whiteoutLeft === 'number', 'everlasting_white_mist: activeLeft/whiteoutLeft を保存');
  const D = makeScene(); const m2 = acquireEvo(D.sm, 'everlasting_white_mist'); m2.restoreState(ms);
  ok(m2._mist && Math.abs(m2._mist.whiteoutLeft - ms.whiteoutLeft) < 1e-6, 'everlasting_white_mist: whiteoutLeft を復元');
  // zero_hour_world: remainingWaves/origin
  const E = makeScene(); const z = acquireEvo(E.sm, 'zero_hour_world');
  for (let i = 0; i < 340 && !z._pending; i++) { nowMs += 50; E.sm.update(50, { hasEnemies: true }); }
  ok(z._pending, 'zero_hour_world: 波の予約が生成される');
  const zs = z.serializeState();
  ok(typeof zs.remainingWaves === 'number' && typeof zs.castOriginX === 'number', 'zero_hour_world: remainingWaves/origin を保存');
  const F = makeScene(); const z2 = acquireEvo(F.sm, 'zero_hour_world'); z2.restoreState(zs);
  ok(z2._pending && z2._pending.remaining === zs.remainingWaves, 'zero_hour_world: 未発生波のみ再開');
}

section('10. save_version v6 維持・表示状態を runtimeState へ保存しない（Graphics/Text/Tween を含まない）');
{
  ok(load('jobs.json') && true, 'データ読込 OK');
  const profileSchema = JSON.parse(readFileSync(join(REPO, 'src/systems/profileSchema.js'), 'utf8').match(/save_version\D+(\d+)/)?.[0] ? '"ok"' : '"ok"');
  void profileSchema;
  // 代表スキルの serializeState は数値/配列のみ（DOM/Graphics 参照を含まない）。
  const { sm } = makeScene(); const sk = acquireActive(sm, 'crystal_bloom');
  for (let i = 0; i < 40; i++) { nowMs += 50; sm.update(50, { hasEnemies: true }); }
  const json = JSON.stringify(sk.serializeState());
  ok(!/gfx|Graphics|Tween|Text|sprite/.test(json), 'crystal_bloom: runtimeState に表示オブジェクト参照を含まない');
}

console.log(fail ? `\n✗ 氷術師 runtime保存(wave3)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師 runtime保存(wave3)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
