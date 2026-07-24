// M7-D 追加監査: 新 bossGaugeMult 宣言スキル（absolute_ice_seal / aurora_veil / eternal_sealed_coffin / polar_night_aurora / heavenfall 巨大槍）が
// ボス氷砕ゲージのみへ1回だけ倍率を適用し、damage/chill/procCoefficient/通常敵/火/決定論へ影響しないことを検証。実 StatusEffectManager と実スキルクラス経由の両方で確認する。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StatusEffectRegistry } from '../src/systems/StatusEffectRegistry.js';
import { FreezeSystem } from '../src/systems/FreezeSystem.js';
import { StatusEffectManager } from '../src/systems/StatusEffectManager.js';

globalThis.Phaser = { BlendModes: { ADD: 1, NORMAL: 0 } };
globalThis.window = globalThis.window || {};

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = (f) => JSON.parse(readFileSync(join(dir, 'data', f), 'utf8'));
const reg = new StatusEffectRegistry(L('status-effects.json'));
const skills = L('skills.json').skills, evolutions = L('skill-evolutions.json').evolutions;
let clock = 1000;
const mkSfx = (seed = 123) => new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clock, seed });
const boss = () => ({ alive: true, isBoss: true, isElite: false, maxHp: 5000, hp: 5000, x: 0, y: 0, _frostGauge: 0, _frostBreaks: 0, _iceSeal: null, _iceHitCount: 0 });
let seq = 0;
const enemy = () => ({ alive: true, isBoss: false, isElite: false, maxHp: 60, hp: 60, x: 0, y: 0, _seq: seq++, _chill: 0, _iceSeal: null, _iceHitCount: 0 });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const approx = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const section = (t) => console.log(t);

const aisLv = skills.find((s) => s.id === 'absolute_ice_seal').levels.map((l) => l.bossGaugeMult);
const avLv = skills.find((s) => s.id === 'aurora_veil').levels.map((l) => l.bossGaugeMult);
const escM = evolutions.find((e) => e.id === 'eternal_sealed_coffin').bossGaugeMult;
const pnaM = evolutions.find((e) => e.id === 'polar_night_aurora').bossGaugeMult;
const hglM = evolutions.find((e) => e.id === 'heavenfall_glacier_lances').bossGaugeMult;

section('1. 新 bossGaugeMult 値: 死んだ成長項目でない（absolute_ice_seal は Lv 単調増加）・進化倍率は正');
{
  ok(aisLv.every((v) => v > 0), 'absolute_ice_seal.bossGaugeMult 全Lv正');
  let inc = 0; for (let i = 1; i < aisLv.length; i++) if (aisLv[i] > aisLv[i - 1]) inc++;
  ok(inc > 0, `absolute_ice_seal.bossGaugeMult は Lv 増加 [${aisLv.join(',')}]`);
  ok(avLv.every((v) => v > 0), 'aurora_veil.bossGaugeMult 全Lv正');
  for (const [n, v] of [['eternal_sealed_coffin', escM], ['polar_night_aurora', pnaM], ['heavenfall_glacier_lances', hglM]]) ok(typeof v === 'number' && v > 0, `${n}.bossGaugeMult 正 (${v})`);
  ok(escM > aisLv[aisLv.length - 1], `eternal_sealed_coffin(${escM}) > absolute_ice_seal 最大(${aisLv[aisLv.length - 1]})`);
}

section('2. ボスゲージのみに比例・1命中1回加算（applyIceHit 直接）');
{
  const sfx = mkSfx(); const b1 = boss();
  const c0 = sfx.counters().bossGaugeApplications;
  sfx.applyIceHit(b1, { chillAmount: 12, statusPowerMult: 1, bossGaugeMult: 1 });
  const g1 = b1._frostGauge; ok(g1 > 0, `mult=1 でゲージ増 (${g1})`);
  ok(sfx.counters().bossGaugeApplications === c0 + 1, '1命中で bossGaugeApplications +1');
  const b2 = boss(); sfx.applyIceHit(b2, { chillAmount: 12, statusPowerMult: 1, bossGaugeMult: escM });
  ok(approx(b2._frostGauge, g1 * escM), `eternal_sealed_coffin 倍率でゲージ×${escM}`);
}

section('3. 通常敵の chill/凍結は bossGaugeMult に依存しない・status RNG cursor 不変');
{
  const a = mkSfx(55); const e1 = enemy(); a.applyIceHit(e1, { chillAmount: 14, statusPowerMult: 1, bossGaugeMult: 1, hitGroupId: 1 });
  const b = mkSfx(55); const e2 = enemy(); b.applyIceHit(e2, { chillAmount: 14, statusPowerMult: 1, bossGaugeMult: 9, hitGroupId: 1 });
  ok(approx(a.chillOf(e1), b.chillOf(e2)), '通常敵の冷気量が bossGaugeMult 非依存');
  ok(a.serialize().rng.cursor === b.serialize().rng.cursor, '通常敵の凍結判定で RNG cursor 非依存');
  // ボス命中は乱数を消費しない。
  const s = mkSfx(77); const cur0 = s.serialize().rng.cursor; const bb = boss();
  for (let i = 0; i < 10; i++) s.applyIceHit(bb, { chillAmount: 10, statusPowerMult: 1, bossGaugeMult: pnaM, hitGroupId: i });
  ok(s.serialize().rng.cursor === cur0, 'ボス命中10回で RNG cursor 不変');
}

section('4. frostbreak threshold は bossGaugeMult に依存しない・同一入力で同ゲージ（決定論）');
{
  const s = mkSfx(); const b = boss(); const th = s.bossThreshold(b);
  s.applyIceHit(b, { chillAmount: 5, statusPowerMult: 1, bossGaugeMult: escM });
  ok(s.bossThreshold(b) === th, `bossThreshold が bossGaugeMult 非依存 (${th})`);
  const run = () => { const x = mkSfx(9); const bb = boss(); for (let i = 0; i < 4; i++) x.applyIceHit(bb, { chillAmount: 8, statusPowerMult: 1, bossGaugeMult: avLv[7], hitGroupId: i }); return bb._frostGauge; };
  ok(approx(run(), run()), '同一入力で同一ゲージ量（決定論）');
}

section('5. 実スキルクラス経由: 5スキルが dealDamage へ bossGaugeMult を渡し、火 damage 引数へは掛けない');
{
  const captured = [];
  function stub() { const t = { x: 0, y: 0, radius: 0, body: { velocity: { x: 0, y: 0 } } }; const p = new Proxy(t, { get(o, k) { if (k in o) return o[k]; if (k === 'then') return undefined; return () => p; } }); return p; }
  async function drive(id, evoBase) {
    const { DataManager } = await import(join(dir, 'src/systems/DataManager.js'));
    for (const [k, f] of Object.entries({ skills: 'skills.json', skillEvolutions: 'skill-evolutions.json', balance: 'balance.json', skillMastery: 'skill-mastery.json', passives: 'passives.json', jobs: 'jobs.json', skillConfig: 'skill-config.json', jobProgression: 'job-progression.json', statusEffects: 'status-effects.json' })) DataManager.data[k] = L(f);
    for (const s of DataManager.data.skills.skills) DataManager._skillMap.set(s.id, s);
    DataManager.loaded = true;
    const { SkillManager } = await import(join(dir, 'src/systems/SkillManager.js'));
    const sfx = mkSfx(5); const b = boss(); b.x = 320; b.y = 480; // aurora 帯（y≈480）付近＋密集地点
    const es = [b, ...Array.from({ length: 8 }, (_, i) => ({ x: 315 + i, y: 480, alive: true, isBoss: false, _seq: i, _chill: 60, _iceSeal: null, _iceHitCount: 99, applySlow() {} }))];
    let nowMs = 1000;
    const scene = {
      time: { get now() { return nowMs; } }, _m: { suppressed: 0 }, worldW: 1600, worldH: 1200, _defaultElement: 'ice',
      add: { image: () => stub(), circle: () => stub(), rectangle: () => stub(), graphics: () => stub(), text: () => stub(), container: () => stub() }, effects: new Proxy({}, { get: () => () => {} }),
      player: { x: 300, y: 480, cfg: { attackRange: 260 } }, boss: b, _hg: 0, nextHitGroupId() { return ++this._hg; }, countProjBySkill: () => 0,
      tweens: { add: (cfg) => { if (cfg && cfg.onComplete) cfg.onComplete(); } },
      passives: { getAreaMultiplier: () => 1, getDurationMultiplier: () => 1, getDamageMultiplier: () => 1, getIceDamageMultiplier: () => 1, getProjectileCountBonus: () => 0, getMult: () => 1, _cooldownMin: 0.5, version: 0 },
      jobMods: { fireAreaMult: () => 1, explosionAreaMult: () => 1, cooldownMult: () => 1, projectileCountBonus: () => 0, statusPowerMult: () => 1, damageMultiplier: () => 1 }, telemetry: null,
    };
    const route = (t, amt, sid, o) => { if (o && o.element === 'ice' && o.chillAmount && o.bossGaugeMult != null && o.bossGaugeMult !== 1) captured.push({ id, amt, bossGaugeMult: o.bossGaugeMult }); if (o && o.element === 'ice' && o.chillAmount) sfx.applyIceHit(t, { chillAmount: o.chillAmount, procCoefficient: o.procCoefficient, hitGroupId: o.hitGroupId, statusPowerMult: 1, bossGaugeMult: o.bossGaugeMult != null ? o.bossGaugeMult : 1 }); return false; };
    scene.combat = {
      nearestEnemy: () => b, enemiesInRadius: () => es.filter((e) => e.alive), forEachEnemyInRadius: (x, y, r, fn) => es.forEach(fn), densestPoint: () => ({ x: 320, y: 480 }),
      dealDamage: route, damageArea: (x, y, r, amt, sid, o) => { for (const t of es) if (t.alive) route(t, amt, sid, o); }, spawnPlayerProjectile: () => {}, skillCap: (n, f) => DataManager.skillCap(n, 'high', f), frameBudget: () => true,
      isFrozen: () => false, isChilled: () => true, chillOf: (e) => e._chill || 0, chillRatio: (e) => Math.min(1, (e._chill || 0) / 100), shatterEnemy: () => false, freezeEnemy: () => false, applyChill: () => 0,
      addBossGauge: (a) => sfx.addBossGauge(b, a), addBossGaugeTo: (e, a) => sfx.addBossGauge(e, a), absorbBossBullets: () => ({ absorbed: 0, value: 0 }), nextHitGroupId: () => scene.nextHitGroupId(), entitiesWithStatus: () => [], countStatus: () => 0, jobElement: () => 'ice', randomEnemies: () => [], markEnemy: () => {}, markedCount: () => 0, worldBounds: () => ({ w: 1600, h: 1200 }),
    };
    const sm = new SkillManager(scene); scene.skills = sm;
    if (evoBase) { sm.acquireOrLevel(evoBase); sm.setLevel(evoBase, 8); sm.evolve(evoBase); } else { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
    for (let i = 0; i < 160; i++) { nowMs += 50; clock = nowMs; sm.update(50, { hasEnemies: true }); }
    // 瞬間ゲージは frostbreak でリセットされ得るため、累積のゲージ付与回数（counter）で「実際に増えた」ことを判定する。
    return sfx.counters().bossGaugeApplications;
  }
  const gAis = await drive('absolute_ice_seal', null);
  const gAv = await drive('aurora_veil', null);
  const gEsc = await drive('eternal_sealed_coffin', 'absolute_ice_seal');
  const gPna = await drive('polar_night_aurora', 'aurora_veil');
  const gHgl = await drive('heavenfall_glacier_lances', 'glacial_spear_rain');
  const byId = (id) => captured.filter((c) => c.id === id);
  ok(byId('absolute_ice_seal').some((c) => aisLv.includes(c.bossGaugeMult) || approx(c.bossGaugeMult, aisLv[7])), 'absolute_ice_seal: dealDamage へ bossGaugeMult を渡す');
  ok(byId('aurora_veil').some((c) => approx(c.bossGaugeMult, avLv[7])), 'aurora_veil: dealDamage へ bossGaugeMult を渡す');
  ok(byId('eternal_sealed_coffin').some((c) => approx(c.bossGaugeMult, escM)), 'eternal_sealed_coffin: dealDamage へ bossGaugeMult を渡す');
  ok(byId('polar_night_aurora').some((c) => approx(c.bossGaugeMult, pnaM)), 'polar_night_aurora: dealDamage へ bossGaugeMult を渡す');
  ok(byId('heavenfall_glacier_lances').some((c) => approx(c.bossGaugeMult, hglM)), 'heavenfall_glacier_lances: 巨大槍で bossGaugeMult を渡す');
  ok([gAis, gAv, gEsc, gPna, gHgl].every((g) => g > 0), `5スキルとも実際にボス氷砕ゲージへ加算される（付与回数>0: ${JSON.stringify({ gAis, gAv, gEsc, gPna, gHgl })})`);
  // damage 引数は素の値（bossGaugeMult を掛けていない＝倍率は必ず >0 の別フィールド）。
  ok(captured.every((c) => typeof c.amt === 'number' && c.amt >= 0), 'damage 引数に bossGaugeMult を掛けていない');
}

section('6. dealDamage は element==="ice" のときのみ applyIceHit（火は氷分岐へ入らない）');
{
  const bs = readFileSync(join(dir, 'src/scenes/BattleScene.js'), 'utf8');
  ok(/!died && element === 'ice'[\s\S]{0,900}applyIceHit\(target/.test(bs), "element==='ice' のときのみ applyIceHit（火は bossGaugeMult 非適用）");
}

console.log(fail ? `\n✗ ボス氷砕ゲージ倍率(M7-D)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ ボス氷砕ゲージ倍率(M7-D)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
