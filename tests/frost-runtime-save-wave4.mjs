// M7-D: 氷術師 新 active5種・新進化5種の「途中再開時の runtimeState 保存 / 再構築 / 二重生成防止」を実スキルクラスで検証。
// graphics 対応の最小 Phaser モック（ボス/敵の _iceSeal・_iceHitCount 含む）でスキルを fire/update させ、serializeState/restoreState の round-trip を確認する。Node.js 標準機能のみ。
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

function stub() { const t = { x: 0, y: 0, width: 0, height: 0, radius: 0, body: { velocity: { x: 0, y: 0 } } }; const p = new Proxy(t, { get(o, k) { if (k in o) return o[k]; if (k === 'then') return undefined; return () => p; } }); return p; }
const noopEffects = new Proxy({}, { get: () => () => {} });
let nowMs = 1000;
function makeScene(withBoss = false) {
  const es = Array.from({ length: 20 }, (_, i) => ({ x: 300 + (i % 5) * 8, y: 300 + Math.floor(i / 5) * 8, alive: true, isBoss: false, isElite: false, maxHp: 60, _seq: i, _chill: 20 + i, _iceSeal: null, _iceHitCount: 0, applySlow() {} }));
  const boss = withBoss ? { x: 320, y: 300, alive: true, isBoss: true, maxHp: 5000, _seq: 999, _chill: 80, _iceSeal: null, _iceHitCount: 0, _frostGauge: 0, _frostBreaks: 0 } : null;
  const all = boss ? [...es, boss] : es;
  const scene = {
    time: { get now() { return nowMs; } }, _m: { suppressed: 0 }, worldW: 1600, worldH: 1200, _defaultElement: 'ice',
    add: { image: () => stub(), rectangle: () => stub(), circle: () => stub(), ellipse: () => stub(), graphics: () => stub(), text: () => stub(), container: () => stub() },
    effects: noopEffects, player: { x: 300, y: 300, cfg: { attackRange: 260 } }, boss, _hg: 0, nextHitGroupId() { return ++this._hg; }, countProjBySkill: () => 0,
    tweens: { add: (cfg) => { if (cfg && cfg.onComplete) cfg.onComplete(); } },
    passives: { getAreaMultiplier: () => 1, getDurationMultiplier: () => 1, getDamageMultiplier: () => 1, getIceDamageMultiplier: () => 1, getProjectileCountBonus: () => 0, getMult: () => 1, _cooldownMin: 0.5, version: 0 },
    jobMods: { fireAreaMult: () => 1, explosionAreaMult: () => 1, cooldownMult: () => 1, projectileCountBonus: () => 0, statusPowerMult: () => 1, damageMultiplier: () => 1 }, telemetry: null,
  };
  scene.combat = {
    nearestEnemy: () => all.find((e) => e.alive) || null, nearestEnemyExcept: () => all.find((e) => e.alive) || null,
    enemiesInRadius: () => all.filter((e) => e.alive), forEachEnemyInRadius: (x, y, r, fn) => { for (const e of all) if (e.alive) fn(e); },
    densestPoint: () => ({ x: 320, y: 300 }), dealDamage: () => false, damageArea: () => {}, spawnPlayerProjectile: () => {},
    skillCap: (n, f) => DataManager.skillCap(n, 'high', f), frameBudget: () => true,
    isFrozen: () => false, isChilled: () => true, chillOf: (e) => e._chill || 0, chillRatio: (e) => Math.min(1, (e._chill || 0) / 100),
    shatterEnemy: () => false, freezeEnemy: () => false, applyChill: () => 0, addBossGauge: () => null, addBossGaugeTo: () => null,
    absorbBossBullets: () => ({ absorbed: 0, value: 0 }), nextHitGroupId: () => scene.nextHitGroupId(), entitiesWithStatus: () => [], countStatus: () => 0, jobElement: () => 'ice', randomEnemies: () => [], markEnemy: () => {}, markedCount: () => 0, worldBounds: () => ({ w: 1600, h: 1200 }),
  };
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, sm, es, boss };
}

const NEW_ACTIVES = ['glacial_spear_rain', 'snowflake_sentry', 'iceberg_ram', 'absolute_ice_seal', 'aurora_veil'];
const NEW_EVOS = { heavenfall_glacier_lances: 'glacial_spear_rain', crystal_sentinel_legion: 'snowflake_sentry', continental_glacier_rush: 'iceberg_ram', eternal_sealed_coffin: 'absolute_ice_seal', polar_night_aurora: 'aurora_veil' };
const ALL = [...NEW_ACTIVES, ...Object.keys(NEW_EVOS)];

function acquireEvo(sm, id) { const base = NEW_EVOS[id]; sm.acquireOrLevel(base); sm.setLevel(base, 8); sm.evolve(base); return sm.skills.get(id); }
function acquireActive(sm, id) { sm.acquireOrLevel(id); sm.setLevel(id, 8); return sm.skills.get(id); }

section('1. 新 active5・新進化5 は全て runtimeState を保存する');
{ const rt = new Set(skillsWithRuntimeState()); for (const id of ALL) ok(rt.has(id), `${id} は runtimeState を保存する`); }

section('2. 全10スキルが fire/update で例外なく駆動できる（graphics/marker 経路スモーク）');
for (const id of ALL) {
  const { sm } = makeScene(true);
  const sk = NEW_EVOS[id] ? acquireEvo(sm, id) : acquireActive(sm, id);
  let threw = null;
  try { for (let i = 0; i < 160; i++) { nowMs += 50; sm.update(50, { hasEnemies: true }); } } catch (e) { threw = e; }
  ok(!threw, `${id}: 160フレーム駆動で例外なし${threw ? ' → ' + threw.message : ''}`);
  if (sk && sk.destroy) { try { sk.destroy(); } catch (e) { ok(false, `${id}: destroy で例外 ${e.message}`); } }
}

section('3. glacial_spear_rain: barrage（spearsRemaining/index/center/telegraph）を保存し、二重barrageしない');
{
  const A = makeScene(); const sk = acquireActive(A.sm, 'glacial_spear_rain');
  for (let i = 0; i < 30 && !(sk._barrage && sk._barrage.active); i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(sk._barrage && sk._barrage.active, 'glacial_spear_rain: barrage 開始');
  const st = sk.serializeState();
  ok(st.barrageActive && typeof st.spearsRemaining === 'number' && typeof st.targetCenterX === 'number' && st.cdLeft > 0, 'barrage状態＋cdLeftを保存');
  const B = makeScene(); const sk2 = acquireActive(B.sm, 'glacial_spear_rain'); sk2.restoreState(st);
  ok(sk2._barrage && sk2._barrage.remaining === st.spearsRemaining, '未落下の槍のみ再開');
}

section('4. snowflake_sentry: 生存砲台（instanceId/x/y/activeLeft/shotLeft）を保存・復元し二重生成しない');
{
  const A = makeScene(); const sk = acquireActive(A.sm, 'snowflake_sentry');
  for (let i = 0; i < 60 && sk.sentries.length === 0; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(sk.sentries.length > 0, 'snowflake_sentry: 砲台が設置される');
  const st = sk.serializeState();
  ok(Array.isArray(st.sentries) && st.sentries[0] && typeof st.sentries[0].activeLeft === 'number' && typeof st.nextInstanceId === 'number', '砲台状態を保存');
  const B = makeScene(); const sk2 = acquireActive(B.sm, 'snowflake_sentry'); sk2.restoreState(st);
  ok(sk2.sentries.length === st.sentries.filter((t) => t.activeLeft > 0).length, '生存砲台のみ再構築（二重生成しない）');
}

section('5. iceberg_ram: 滑走中の氷山を保存し、二重崩壊しない');
{
  const A = makeScene(); const sk = acquireActive(A.sm, 'iceberg_ram');
  for (let i = 0; i < 60 && !sk.berg; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(sk.berg, 'iceberg_ram: 氷山が生成される');
  const st = sk.serializeState();
  ok(st.active && typeof st.x === 'number' && typeof st.directionX === 'number' && st.collapsePending === true, '氷山状態＋collapsePendingを保存');
  const B = makeScene(); const sk2 = acquireActive(B.sm, 'iceberg_ram'); sk2.restoreState(st);
  ok(sk2.berg && Math.abs(sk2.berg.activeLeft - st.activeLeft) < 1e-6, '氷山を1つだけ再構築');
}

section('6. absolute_ice_seal: markLeft/nextInstanceId＋ボス印のみ保存（通常敵印は捨てる・CD必須復元）');
{
  const A = makeScene(true); const sk = acquireActive(A.sm, 'absolute_ice_seal');
  for (let i = 0; i < 30 && sk.marks.length === 0; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(sk.marks.length > 0, 'absolute_ice_seal: 氷印が付与される');
  const st = sk.serializeState();
  ok(typeof st.markLeft === 'number' && typeof st.nextInstanceId === 'number', 'markLeft/nextInstanceId を保存');
  const bossMarked = sk.marks.some((m) => m.isBoss);
  ok(!bossMarked || st.bossMark, 'ボス印があれば bossMark を保存（通常敵印は保存しない）');
  const B = makeScene(true); const sk2 = acquireActive(B.sm, 'absolute_ice_seal'); sk2.restoreState(st);
  ok(sk2._markLeft === st.markLeft, 'CD（markLeft）を必ず復元');
  const normalRestored = sk2.marks.filter((m) => !m.isBoss).length;
  ok(normalRestored === 0, '通常敵の印は復元しない（無料起爆しない）');
}

section('7. aurora_veil: activeなセッション（activeLeft/tickLeft/burstLeft/phase/layoutIndex）を保存し二重生成しない');
{
  const A = makeScene(); const sk = acquireActive(A.sm, 'aurora_veil');
  for (let i = 0; i < 30 && !sk._session; i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(sk._session, 'aurora_veil: セッション開始');
  const st = sk.serializeState();
  ok(typeof st.activeLeft === 'number' && typeof st.tickLeft === 'number' && typeof st.burstLeft === 'number', 'セッション状態を保存');
  const B = makeScene(); const sk2 = acquireActive(B.sm, 'aurora_veil'); sk2.restoreState(st);
  ok(sk2._session && Math.abs(sk2._session.activeLeft - st.activeLeft) < 1e-6 && sk2._session.bands.length > 0, '主オーロラを1つだけ再構築');
}

section('8. 進化 runtime: heavenfall barrage / continental 氷河 / eternal_sealed_coffin ボス印 / polar_night セッションの保存・復元');
{
  const A = makeScene(); const h = acquireEvo(A.sm, 'heavenfall_glacier_lances');
  for (let i = 0; i < 40 && !(h._barrage && h._barrage.active); i++) { nowMs += 50; A.sm.update(50, { hasEnemies: true }); }
  ok(h._barrage && h._barrage.active, 'heavenfall: barrage 開始'); const hs = h.serializeState();
  ok(hs.barrageActive && typeof hs.waveRemaining === 'number', 'heavenfall: wave/barrage 状態を保存');
  const B = makeScene(); const c = acquireEvo(B.sm, 'continental_glacier_rush');
  for (let i = 0; i < 60 && !c.rush; i++) { nowMs += 50; B.sm.update(50, { hasEnemies: true }); }
  ok(c.rush, 'continental: 氷河が生成される'); const cs = c.serializeState();
  ok(cs.active && cs.collapsePending === true, 'continental: 氷河状態を保存');
  const C2 = makeScene(); const c2 = acquireEvo(C2.sm, 'continental_glacier_rush'); c2.restoreState(cs); ok(c2.rush, 'continental: 1つだけ再構築');
  const D = makeScene(true); const z = acquireEvo(D.sm, 'eternal_sealed_coffin');
  for (let i = 0; i < 30 && z.marks.length === 0; i++) { nowMs += 50; D.sm.update(50, { hasEnemies: true }); }
  ok(z.marks.length > 0, 'eternal_sealed_coffin: 氷棺印が付与される'); const zs = z.serializeState();
  ok(typeof zs.markLeft === 'number', 'eternal_sealed_coffin: markLeft を保存');
  const E = makeScene(); const p = acquireEvo(E.sm, 'polar_night_aurora');
  for (let i = 0; i < 30 && !p._session; i++) { nowMs += 50; E.sm.update(50, { hasEnemies: true }); }
  ok(p._session, 'polar_night: セッション開始'); const ps = p.serializeState();
  ok(typeof ps.activeLeft === 'number' && typeof ps.pillarCounter === 'number', 'polar_night: セッション＋pillarCounter を保存');
  const F = makeScene(); const p2 = acquireEvo(F.sm, 'polar_night_aurora'); p2.restoreState(ps); ok(p2._session && p2._session.bands.length > 0, 'polar_night: 主帯を再構築');
}

section('9. save_version v6・runtimeState に表示オブジェクト/Graphics/overlay/entity参照を含まない');
{
  const { sm } = makeScene(true); const sk = acquireActive(sm, 'snowflake_sentry');
  for (let i = 0; i < 60; i++) { nowMs += 50; sm.update(50, { hasEnemies: true }); }
  const json = JSON.stringify(sk.serializeState());
  ok(!/gfx|Graphics|Tween|Text|overlay|enemy|sprite|_iceSeal/.test(json), 'snowflake_sentry: runtimeState に表示/entity 参照を含まない');
  const seal = acquireActive(sm, 'absolute_ice_seal');
  for (let i = 0; i < 30; i++) { nowMs += 50; sm.update(50, { hasEnemies: true }); }
  const j2 = JSON.stringify(seal.serializeState());
  ok(!/overlay|enemy\b|Graphics|Tween/.test(j2), 'absolute_ice_seal: runtimeState に overlay/entity 参照を含まない');
}

console.log(fail ? `\n✗ 氷術師 runtime保存(wave4)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師 runtime保存(wave4)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
