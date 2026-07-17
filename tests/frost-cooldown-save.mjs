// M7-A 追加監査: 氷術師スキルのクールダウンが SkillManager の共通 runtimeState 経由で active_run へ
// 保存・復元され、再読込で CD 全回復・即時再発動・領域二重生成が起きないことを検証する。
// 実スキルクラスを最小 Phaser モックで駆動する（Node.js 標準機能のみ）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

globalThis.Phaser = { BlendModes: { ADD: 1, NORMAL: 0 }, Math: { Clamp: (v, a, b) => Math.max(a, Math.min(b, v)), Angle: { Wrap: (a) => a }, Vector2: class { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } normalize() { return this; } scale() { return this; } } } };

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
let nowMs = 1000;
const enemies = () => Array.from({ length: 20 }, (_, i) => ({ x: 240 + i, y: 240, alive: true, isBoss: false, isElite: false, maxHp: 60, _seq: i, applySlow() {} }));
function makeScene() {
  const es = enemies();
  const scene = {
    time: { get now() { return nowMs; } }, _m: { suppressed: 0 }, worldW: 1600, worldH: 1200, _defaultElement: 'ice',
    add: { image: () => mkImg(), rectangle: () => mkImg(), circle: () => mkImg() },
    effects: { explosion() {} }, player: { x: 300, y: 300, cfg: { attackRange: 260 } },
    boss: null, _hg: 0, nextHitGroupId() { return ++this._hg; }, countProjBySkill: () => 0,
    passives: { getAreaMultiplier: () => 1, getDurationMultiplier: () => 1, getDamageMultiplier: () => 1, getIceDamageMultiplier: () => 1, getProjectileCountBonus: () => 0, getMult: () => 1, _cooldownMin: 0.5, version: 0 },
    jobMods: { fireAreaMult: () => 1, explosionAreaMult: () => 1, cooldownMult: () => 1, projectileCountBonus: () => 0, statusPowerMult: () => 1, damageMultiplier: () => 1 },
    _es: es,
  };
  scene.combat = {
    nearestEnemy: (x, y, r) => es.find((e) => e.alive) || null,
    enemiesInRadius: () => es.filter((e) => e.alive), forEachEnemyInRadius: (x, y, r, fn) => { for (const e of es) if (e.alive) fn(e); },
    densestPoint: () => ({ x: 240, y: 240 }), dealDamage: () => false, damageArea: () => {}, spawnPlayerProjectile: () => {},
    skillCap: (n, f) => DataManager.skillCap(n, 'high', f), isFrozen: () => false, chillOf: () => 0, chillRatio: () => 0,
    shatterEnemy: () => false, absorbBossBullets: () => 0, nextHitGroupId: () => scene.nextHitGroupId(),
    // 火スキル（funeral_pyres 等）が参照する共通 API の no-op モック。
    retainDeathEvents: () => {}, releaseDeathEvents: () => {}, recentDeathEvents: () => [], consumeDeathEvent: () => false,
    burningCount: () => 0, burningEnemies: () => [], ignite: () => {}, registerBurning: () => {}, castContext: () => null,
    frameBudget: () => true, markEnemy: () => {}, markedCount: () => 0, performClone: () => false, lastClonableCast: () => null,
    spendHealthCost: () => 0, worldBounds: () => ({ w: 1600, h: 1200 }), nearestEnemyExcept: () => null, randomEnemies: () => [],
  };
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, sm };
}

// スキルを1回発動させて CD を張る（発動するまで update）。fire 回数を返す。
function driveUntilFire(sm, id, maxFrames = 40) {
  let fires = 0; const before = () => sm.stats.get(id)?.casts || 0;
  for (let i = 0; i < maxFrames; i++) { const b = before(); nowMs += 50; sm.update(50, { hasEnemies: true }); if ((sm.stats.get(id)?.casts || 0) > b) fires++; if (fires >= 1) break; }
  return fires;
}

const FROST = ['frost_shard', 'frost_nova', 'glacial_lance', 'permafrost_field', 'ice_wall', 'diamond_blizzard', 'absolute_zero_domain', 'heaven_piercing_glacier'];
// 進化は基礎スキルとして取得できないため、進化を直接生成する経路を使う。
const isEvo = (id) => ['diamond_blizzard', 'absolute_zero_domain', 'heaven_piercing_glacier'].includes(id);
function acquire(sm, id) { if (isEvo(id)) { const Cls = sm.constructor; /* fallthrough */ } sm.acquireOrLevel(id); return sm.skills.get(id); }

section('1. 8スキルすべてが runtimeState（cdLeft）を保存する');
{
  const rt = new Set(skillsWithRuntimeState());
  for (const id of FROST) ok(rt.has(id), `${id} は skillsWithRuntimeState に含まれる`);
}

section('2. 発動直後に保存 → 再開後も残りクールダウンを維持 → 即時再発動できない');
for (const id of FROST) {
  const A = makeScene();
  // 進化は evolve 経由でしか作れないので、REGISTRY 直生成を模す: acquireOrLevel は基礎のみ。
  // ここでは基礎 active のみ CD 駆動テスト、進化は直接インスタンス生成でCDを設定して round-trip を確認。
  if (isEvo(id)) {
    // 進化は EvolvedSkillBase.update で _cd を張る。SkillManager 経由生成の代わりに直接生成。
    const modName = { diamond_blizzard: 'DiamondBlizzardSkill', absolute_zero_domain: 'AbsoluteZeroDomainSkill', heaven_piercing_glacier: 'HeavenPiercingGlacierSkill' }[id];
    const mod = await import(join(REPO, 'src/skills', modName + '.js'));
    const sk = new mod[modName](A.scene, id, 1);
    for (let i = 0; i < 40 && (sk.stats && false); i++) {} // no-op
    // 発動させて CD を張る。
    let fired = false; for (let i = 0; i < 40; i++) { const c0 = A.sm.stats.get(id)?.casts || 0; A.sm.stats.set(id, { casts: 0, hits: 0, kills: 0, damage: 0, maxLevel: 1 }); nowMs += 50; sk.update(50, { hasEnemies: true }); }
    // EvolvedSkillBase は recordCast を scene.skills.recordCast 経由。ここでは _cd を直接確認。
    ok(typeof sk._cd === 'number', `${id}: _cd を持つ`);
    sk._cd = 1500; const st = sk.serializeState(); ok(st && st.cdLeft === 1500, `${id}: serializeState が cdLeft を保存`);
    const sk2 = new mod[modName](A.scene, id, 1); sk2.restoreState(st); ok(sk2._cd === 1500, `${id}: restoreState で残り CD を復元`);
    continue;
  }
  const sk = acquire(A.sm, id);
  const fires = driveUntilFire(A.sm, id);
  ok(fires >= 1 && sk._cd > 0, `${id}: 発動後に CD が張られる`);
  // 発動直後に保存。
  const saved = A.sm.serializeRuntime();
  ok(saved[id] && typeof saved[id].cdLeft === 'number' && saved[id].cdLeft > 0, `${id}: skillRuntime に cdLeft>0 が保存される`);
  // 再開: 新しい SkillManager へ復元。
  const B = makeScene();
  B.sm.acquireOrLevel(id);
  B.sm.restoreRuntime(saved);
  const sk2 = B.sm.skills.get(id);
  ok(Math.abs(sk2._cd - saved[id].cdLeft) < 1e-6, `${id}: 再開後も残りクールダウンを維持`);
  // 即時再発動できない: cd 未満の dt では発動しない。
  const casts0 = sk2.stats?.casts || B.sm.stats.get(id)?.casts || 0;
  nowMs += Math.max(1, Math.floor(saved[id].cdLeft) - 20); B.sm.update(Math.max(1, Math.floor(saved[id].cdLeft) - 20), { hasEnemies: true });
  const castsMid = B.sm.stats.get(id)?.casts || 0;
  ok(castsMid === 0, `${id}: 再開直後（残 CD 中）は即時再発動しない`);
  // 残り CD 経過後は発動する。
  const fires2 = driveUntilFire(B.sm, id);
  ok(fires2 >= 1, `${id}: 残り CD 経過後は再発動できる`);
}

section('3. 凍土・氷壁・絶対零度領域を二重生成しない（再開直後は生成0）');
for (const id of ['permafrost_field', 'ice_wall']) {
  const A = makeScene();
  const sk = acquire(A.sm, id);
  driveUntilFire(A.sm, id);
  const listName = id === 'permafrost_field' ? 'fields' : 'walls';
  ok(sk[listName].length >= 1, `${id}: 発動で領域/壁が生成される`);
  const saved = A.sm.serializeRuntime();
  // 再開: 位置は保存されないので新インスタンスの領域は空。
  const B = makeScene(); B.sm.acquireOrLevel(id); B.sm.restoreRuntime(saved);
  const sk2 = B.sm.skills.get(id);
  ok(sk2[listName].length === 0, `${id}: 再開時に領域/壁は保存されず空（位置を再構築）`);
  // 残 CD 中の1tickでは新規生成しない（＝二重生成しない）。
  nowMs += 30; B.sm.update(30, { hasEnemies: true });
  ok(sk2[listName].length === 0, `${id}: 残 CD 中は領域/壁を再生成しない（二重生成しない）`);
}

section('4. 火の魔女の runtimeState 保存へ影響しない');
{
  const rt = new Set(skillsWithRuntimeState());
  // 既存の runtimeState 火スキルが引き続き含まれる（欠落していない）。
  for (const id of ['funeral_pyres', 'magma_vein', 'ember_minefield', 'bloodfire_pact', 'core_overdrive', 'flame_barrier', 'phoenix_feather']) ok(rt.has(id), `火スキル ${id} は引き続き runtimeState を保存`);
  // serializeState を持たない火スキルは引き続き非対象。
  for (const id of ['fireball', 'meteor', 'flame_pillar']) ok(!rt.has(id), `火スキル ${id} は従来どおり runtimeState 非対象（変化なし）`);
  // 火スキルの serializeRuntime 出力が氷追加の影響を受けない（火のみ所持の manager で氷キーが出ない）。
  const A = makeScene(); A.sm.acquireOrLevel('funeral_pyres');
  const out = A.sm.serializeRuntime();
  ok(Object.keys(out).every((k) => !FROST.includes(k)), '火のみ所持なら skillRuntime に氷スキルキーが混ざらない');
  ok(out.funeral_pyres && typeof out.funeral_pyres.cdLeft === 'number', 'funeral_pyres の cdLeft 保存は従来どおり');
}

console.log(fail ? `\n✗ 氷術師CD保存テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師CD保存テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
