// M7-B: 氷術師 新スキルの決定論を検証する。(1) 全ソースに Math.random / 抽選RNG(draft) 参照が無い、
// (2) 同一 seed・状態・発動順で同一の攻撃パターン（弾角度・落下位置・波方向など）を再現する。Node.js 標準機能のみ。
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
const { SkillManager } = await import(join(REPO, 'src/systems/SkillManager.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

const NEW_FILES = [
  'IcicleVolleySkill', 'FrostOrbitSkill', 'FreezingRaySkill', 'HailstormSkill', 'CryoMineSkill', 'FrostSpiritSkill',
  'IcePrisonSkill', 'AvalancheSkill', 'MirrorIceSkill', 'GlacierDropSkill',
  'CrystalTempestSkill', 'AbsoluteZeroRaySkill', 'WhiteoutCataclysmSkill', 'FrostQueenCourtSkill', 'WorldEndAvalancheSkill',
];

section('1. 新スキルのソースに Math.random / 抽選RNG(draft) 参照が無い（決定論・RNG分離）');
for (const f of NEW_FILES) {
  const src = readFileSync(join(REPO, 'src/skills', f + '.js'), 'utf8');
  ok(!/Math\.random/.test(src), `${f}: Math.random を使用しない`);
  ok(!/\.draft\b/.test(src) && !/_draftSeed/.test(src), `${f}: 抽選RNG(draft) を参照しない`);
  ok(!/Date\.now|performance\.now/.test(src), `${f}: 実時間(Date.now) を使用しない`);
}

// ---- 決定論トレース: 同一状態でスキルを2回駆動し、攻撃呼び出し列が一致することを確認 ----
const mkImg = () => { const o = {}; const c = () => o; for (const m of ['setTint', 'clearTint', 'setBlendMode', 'setDepth', 'setAlpha', 'setScale', 'setPosition', 'setOrigin', 'setVisible', 'setRotation', 'setStrokeStyle', 'destroy', 'setDisplaySize', 'setVelocity']) o[m] = c; o.x = 0; o.y = 0; o.body = { velocity: { x: 0, y: 0 } }; return o; };
const noopEffects = new Proxy({}, { get: () => () => {} });

function traceRun(id, evoBase) {
  const trace = [];
  let nowMs = 1000;
  const es = Array.from({ length: 16 }, (_, i) => ({ x: 240 + i * 4, y: 240 + (i % 3) * 5, alive: true, isBoss: false, isElite: false, maxHp: 60, _seq: i, _chill: i * 2, applySlow() {} }));
  const scene = {
    time: { get now() { return nowMs; } }, _m: { suppressed: 0 }, worldW: 1600, worldH: 1200, _defaultElement: 'ice',
    add: { image: () => mkImg(), rectangle: () => mkImg(), circle: () => mkImg() }, effects: noopEffects,
    player: { x: 300, y: 300, cfg: { attackRange: 260 } }, boss: null, _hg: 0, nextHitGroupId() { return ++this._hg; }, countProjBySkill: () => 0,
    passives: { getAreaMultiplier: () => 1, getDurationMultiplier: () => 1, getDamageMultiplier: () => 1, getIceDamageMultiplier: () => 1, getProjectileCountBonus: () => 0, getMult: () => 1, _cooldownMin: 0.5, version: 0 },
    jobMods: { fireAreaMult: () => 1, explosionAreaMult: () => 1, cooldownMult: () => 1, projectileCountBonus: () => 0, statusPowerMult: () => 1, damageMultiplier: () => 1 }, telemetry: null,
  };
  const rnd = (v) => Math.round(v * 100) / 100;
  scene.combat = {
    nearestEnemy: () => es.find((e) => e.alive) || null, nearestEnemyExcept: () => es.find((e) => e.alive) || null,
    enemiesInRadius: () => es.filter((e) => e.alive), forEachEnemyInRadius: (x, y, r, fn) => { for (const e of es) if (e.alive) fn(e); },
    densestPoint: () => ({ x: 240, y: 240 }), spawnPlayerProjectile: (x, y, a, sp, o) => trace.push(['proj', rnd(x), rnd(y), rnd(a), rnd(sp)]),
    dealDamage: (t, amt) => { trace.push(['dmg', rnd(t.x), rnd(t.y), rnd(amt)]); return false; },
    damageArea: (x, y, r, amt) => trace.push(['area', rnd(x), rnd(y), rnd(r), rnd(amt)]),
    skillCap: (n, f) => DataManager.skillCap(n, 'high', f), frameBudget: () => true,
    isFrozen: () => false, isChilled: (e) => (e._chill || 0) > 4, chillOf: (e) => e._chill || 0, chillRatio: (e) => Math.min(1, (e._chill || 0) / 100),
    shatterEnemy: () => false, freezeEnemy: () => false, applyChill: () => 0, addBossGauge: () => null, addBossGaugeTo: () => null,
    absorbBossBullets: () => ({ absorbed: 0, value: 0 }), nextHitGroupId: () => scene.nextHitGroupId(), entitiesWithStatus: () => [], countStatus: () => 0, jobElement: () => 'ice', randomEnemies: () => [], markEnemy: () => {}, markedCount: () => 0, worldBounds: () => ({ w: 1600, h: 1200 }),
  };
  const sm = new SkillManager(scene); scene.skills = sm;
  if (evoBase) { sm.acquireOrLevel(evoBase); sm.setLevel(evoBase, 8); sm.evolve(evoBase); } else { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  for (let i = 0; i < 60; i++) { nowMs += 50; sm.update(50, { hasEnemies: true }); }
  return JSON.stringify(trace);
}

section('2. 同一 seed・状態・発動順で同一の攻撃パターンを再現（決定論トレース）');
const CASES = [
  ['icicle_volley'], ['hailstorm'], ['avalanche'], ['frost_spirit'], ['cryo_mine'], ['glacier_drop'], ['ice_prison'], ['freezing_ray'],
  ['crystal_tempest', 'icicle_volley'], ['world_end_avalanche', 'avalanche'], ['frost_queen_court', 'frost_spirit'], ['whiteout_cataclysm', 'hailstorm'],
];
for (const [id, base] of CASES) {
  const a = traceRun(id, base), b = traceRun(id, base);
  ok(a === b, `${id}: 2回の駆動で攻撃呼び出し列が一致（決定論）`);
  ok(a.length > 2, `${id}: 攻撃が発生している（トレース非空）`);
}

console.log(fail ? `\n✗ 氷術師 決定論(wave2)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師 決定論(wave2)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
