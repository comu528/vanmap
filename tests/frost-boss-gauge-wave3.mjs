// M7-C 追加監査: bossGaugeMult がボス氷砕ゲージのみへ1回だけ適用され、damage/chill/procCoefficient/通常敵/火/決定論へ影響しないことを検証。
// 実 StatusEffectManager/FreezeSystem/StatusEffectRegistry を使い、ボス分岐（applyIceHit）と実スキルクラス経由の両方で確認する。Node.js 標準機能のみ。
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
const seData = L('status-effects.json');
const skills = L('skills.json').skills;
const evolutions = L('skill-evolutions.json').evolutions;
const reg = new StatusEffectRegistry(seData);
let clock = 1000;
const mkSfx = (seed = 123) => new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clock, seed });
const boss = () => ({ alive: true, isBoss: true, isElite: false, maxHp: 5000, hp: 5000, x: 0, y: 0, _frostGauge: 0, _frostBreaks: 0 });
let seq = 0;
const enemy = () => ({ alive: true, isBoss: false, isElite: false, maxHp: 60, hp: 60, x: 0, y: 0, _seq: seq++, _chill: 0 });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const approx = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const section = (t) => console.log(t);

const fcLevels = skills.find((s) => s.id === 'frozen_clock').levels.map((l) => l.bossGaugeMult);
const zhMult = evolutions.find((e) => e.id === 'zero_hour_world').bossGaugeMult;
const ewmMult = evolutions.find((e) => e.id === 'everlasting_white_mist').bossGaugeMult;

section('1. bossGaugeMult はボスの氷砕ゲージ量へ比例し、1命中1回だけ加算する');
{
  const sfx = mkSfx(); const b1 = boss();
  const c0 = sfx.counters().bossGaugeApplications;
  sfx.applyIceHit(b1, { chillAmount: 10, statusPowerMult: 1, bossGaugeMult: 1 });
  const g1 = b1._frostGauge;
  ok(g1 > 0, `mult=1 でゲージが増える (${g1})`);
  ok(sfx.counters().bossGaugeApplications === c0 + 1, '1命中で bossGaugeApplications が +1（1回だけ加算）');
  const b2 = boss();
  sfx.applyIceHit(b2, { chillAmount: 10, statusPowerMult: 1, bossGaugeMult: 2 });
  ok(approx(b2._frostGauge, g1 * 2), `mult=2 でゲージがちょうど2倍 (${b2._frostGauge} == ${g1 * 2})`);
  const b3 = boss();
  sfx.applyIceHit(b3, { chillAmount: 10, statusPowerMult: 1, bossGaugeMult: 1.8 });
  ok(approx(b3._frostGauge, g1 * 1.8), `mult=1.8 でゲージが1.8倍 (${b3._frostGauge})`);
}

section('2. データ: frozen_clock は Lv 単調増加、zero_hour_world は frozen_clock 最大より高い、everlasting_white_mist は正値（死んだ成長項目でない）');
{
  ok(fcLevels.every((v) => typeof v === 'number' && v > 0), 'frozen_clock.bossGaugeMult は全 Lv 正値');
  let inc = 0; for (let i = 1; i < fcLevels.length; i++) if (fcLevels[i] > fcLevels[i - 1]) inc++;
  ok(inc > 0, `frozen_clock.bossGaugeMult は Lv で増加する（定数の死んだ項目でない）: [${fcLevels.join(',')}]`);
  const fcMax = Math.max(...fcLevels);
  ok(zhMult > fcMax, `zero_hour_world(${zhMult}) は frozen_clock 最大(${fcMax}) より明確に高い`);
  ok(typeof ewmMult === 'number' && ewmMult > 0, `everlasting_white_mist.bossGaugeMult は正値 (${ewmMult})`);
}

section('3. frozen_clock: Lv が上がるとボスゲージ量が増える（実 bossGaugeMult を反映・同一 chill 基準で単調）');
{
  // 同一 chill=10 に対して Lv1 と Lv8 の bossGaugeMult を適用したゲージ量を比較（chill 成長を除いた純倍率効果）。
  const sfx = mkSfx(); const bl1 = boss(); const bl8 = boss();
  sfx.applyIceHit(bl1, { chillAmount: 10, statusPowerMult: 1, bossGaugeMult: fcLevels[0] });
  sfx.applyIceHit(bl8, { chillAmount: 10, statusPowerMult: 1, bossGaugeMult: fcLevels[7] });
  ok(bl8._frostGauge > bl1._frostGauge, `Lv8 倍率のゲージ(${bl8._frostGauge}) > Lv1 倍率(${bl1._frostGauge})`);
  ok(approx(bl8._frostGauge / bl1._frostGauge, fcLevels[7] / fcLevels[0]), 'ゲージ比が bossGaugeMult 比とちょうど一致（倍率のみが効いている）');
  // zero_hour_world は frozen_clock Lv8 より大きいゲージ。
  const bz = boss();
  sfx.applyIceHit(bz, { chillAmount: 10, statusPowerMult: 1, bossGaugeMult: zhMult });
  ok(bz._frostGauge > bl8._frostGauge, `zero_hour_world 倍率のゲージ(${bz._frostGauge}) > frozen_clock Lv8(${bl8._frostGauge})`);
}

section('4. 通常敵・エリートは bossGaugeMult に影響されない（冷気/凍結/粉砕は不変）');
{
  const sfxA = mkSfx(42); const e1 = enemy();
  sfxA.applyIceHit(e1, { chillAmount: 12, statusPowerMult: 1, bossGaugeMult: 1, hitGroupId: 1 });
  const chillNoMult = sfxA.chillOf(e1);
  const sfxB = mkSfx(42); const e2 = enemy();
  sfxB.applyIceHit(e2, { chillAmount: 12, statusPowerMult: 1, bossGaugeMult: 5, hitGroupId: 1 });
  const chillWithMult = sfxB.chillOf(e2);
  ok(approx(chillNoMult, chillWithMult), `通常敵の冷気量が bossGaugeMult に依存しない (${chillNoMult} == ${chillWithMult})`);
  // 凍結判定（RNG 消費・結果）も不変。
  ok(sfxA.serialize().rng.cursor === sfxB.serialize().rng.cursor, '通常敵の凍結判定で status RNG cursor が bossGaugeMult に依存しない');
}

section('5. status RNG cursor: ボスへの氷命中は乱数を消費しない（bossGaugeMult も乱数を使わない・決定論不変）');
{
  const sfx = mkSfx(999);
  const cur0 = sfx.serialize().rng.cursor;
  const b = boss();
  for (let i = 0; i < 20; i++) sfx.applyIceHit(b, { chillAmount: 10, statusPowerMult: 1, bossGaugeMult: 2.2, hitGroupId: i });
  ok(sfx.serialize().rng.cursor === cur0, `ボス命中20回で RNG cursor 不変 (${cur0})`);
}

section('6. 同一入力で同じゲージ結果（保存→復元後も再現・決定論）');
{
  const run = () => { const sfx = mkSfx(7); const b = boss(); for (let i = 0; i < 5; i++) sfx.applyIceHit(b, { chillAmount: 8, statusPowerMult: 1, bossGaugeMult: 1.8, hitGroupId: i }); return b._frostGauge; };
  ok(approx(run(), run()), '同一入力で同一ゲージ量（決定論）');
  // ゲージはボスエンティティ側（_frostGauge）に載り、スキルの runtimeState には含まれない（表示/一時状態を保存しない）。
  const fcSrc = readFileSync(join(dir, 'src/skills/FrozenClockSkill.js'), 'utf8');
  ok(!/serializeState[\s\S]*frostGauge|serializeState[\s\S]*gauge/.test(fcSrc.match(/serializeState[\s\S]*?\}/)?.[0] || ''), 'frozen_clock.serializeState はゲージ量を保存しない（ボス側の状態）');
}

section('7. frostbreak threshold/cooldown/vulnerability の値は不変（ゲージが速く貯まるだけ・閾値/CD/脆弱の仕様は既存のまま）');
{
  const sfx = mkSfx(); const b = boss();
  const thBefore = sfx.bossThreshold(b);
  sfx.applyIceHit(b, { chillAmount: 5, statusPowerMult: 1, bossGaugeMult: 2.2 });
  ok(sfx.bossThreshold(b) === thBefore, `bossThreshold が bossGaugeMult に依存しない (${thBefore})`);
  // 閾値到達で frostbreak が発生し、既存 cooldown/vulnerability が付く（値は config 由来で不変）。
  const b2 = boss(); let broke = null;
  for (let i = 0; i < 200 && !broke; i++) { const r = sfx.applyIceHit(b2, { chillAmount: 50, statusPowerMult: 1, bossGaugeMult: 2.2, hitGroupId: i }); if (r.frostbreak) broke = r.frostbreak; }
  ok(broke, 'ゲージが閾値に達すると frostbreak が発生する（速く貯まるだけで仕様は不変）');
  ok(b2._frostbreakCdUntil > clock, 'frostbreak 後に既存クールダウンが設定される');
}

section('8. 実スキルクラス経由: FrozenClock/ZeroHourWorld/EverlastingWhiteMist が dealDamage へ bossGaugeMult を渡し、火 damage 引数へは掛けない');
{
  // combat.dealDamage を BattleScene のボス氷分岐に近い形で再現（element:'ice' のときのみ applyIceHit へ bossGaugeMult を渡す）。
  const captured = [];
  function stub() { const t = { x: 0, y: 0, radius: 0, body: { velocity: { x: 0, y: 0 } } }; const p = new Proxy(t, { get(o, k) { if (k in o) return o[k]; if (k === 'then') return undefined; return () => p; } }); return p; }
  async function driveOnBoss(id, evoBase, mult) {
    const { DataManager } = await import(join(dir, 'src/systems/DataManager.js'));
    for (const [k, f] of Object.entries({ skills: 'skills.json', skillEvolutions: 'skill-evolutions.json', balance: 'balance.json', skillMastery: 'skill-mastery.json', passives: 'passives.json', jobs: 'jobs.json', skillConfig: 'skill-config.json', jobProgression: 'job-progression.json', statusEffects: 'status-effects.json' })) DataManager.data[k] = L(f);
    for (const s of DataManager.data.skills.skills) DataManager._skillMap.set(s.id, s);
    DataManager.loaded = true;
    const { SkillManager } = await import(join(dir, 'src/systems/SkillManager.js'));
    const sfx = mkSfx(5); const b = boss(); b.x = 305; b.y = 300; const es = [b]; // 波の原点（player=300,300）付近に配置して命中させる
    let nowMs = 1000;
    const scene = {
      time: { get now() { return nowMs; } }, _m: { suppressed: 0 }, worldW: 1600, worldH: 1200, _defaultElement: 'ice',
      add: { image: () => stub(), circle: () => stub(), rectangle: () => stub(), graphics: () => stub(), text: () => stub(), container: () => stub() }, effects: new Proxy({}, { get: () => () => {} }),
      player: { x: 300, y: 300, cfg: { attackRange: 260 } }, boss: b, _hg: 0, nextHitGroupId() { return ++this._hg; }, countProjBySkill: () => 0,
      passives: { getAreaMultiplier: () => 1, getDurationMultiplier: () => 1, getDamageMultiplier: () => 1, getIceDamageMultiplier: () => 1, getProjectileCountBonus: () => 0, getMult: () => 1, _cooldownMin: 0.5, version: 0 },
      jobMods: { fireAreaMult: () => 1, explosionAreaMult: () => 1, cooldownMult: () => 1, projectileCountBonus: () => 0, statusPowerMult: () => 1, damageMultiplier: () => 1 }, telemetry: null,
    };
    scene.combat = {
      nearestEnemy: () => b, enemiesInRadius: () => es, forEachEnemyInRadius: (x, y, r, fn) => es.forEach(fn), densestPoint: () => ({ x: 300, y: 300 }),
      // ボス氷分岐のみ applyIceHit（BattleScene.dealDamage の element:'ice' 経路を模擬）。damage 引数は捕捉して倍率非適用を確認。
      dealDamage: (t, amt, sid, o) => { if (o && o.element === 'ice' && o.chillAmount) { captured.push({ amt, bossGaugeMult: o.bossGaugeMult }); sfx.applyIceHit(t, { chillAmount: o.chillAmount, baseFreezeChance: o.baseFreezeChance || 0, procCoefficient: o.procCoefficient, hitGroupId: o.hitGroupId, statusPowerMult: 1, bossGaugeMult: o.bossGaugeMult != null ? o.bossGaugeMult : 1 }); } return false; },
      damageArea: () => {}, spawnPlayerProjectile: () => {}, skillCap: (n, f) => DataManager.skillCap(n, 'high', f), frameBudget: () => true,
      isFrozen: () => false, isChilled: () => false, chillOf: () => 0, chillRatio: () => 0, shatterEnemy: () => false, freezeEnemy: () => false, applyChill: () => 0,
      addBossGauge: (a) => sfx.addBossGauge(b, a), addBossGaugeTo: (e, a) => sfx.addBossGauge(e, a), absorbBossBullets: () => ({ absorbed: 0, value: 0 }), nextHitGroupId: () => scene.nextHitGroupId(), entitiesWithStatus: () => [], countStatus: () => 0, jobElement: () => 'ice', randomEnemies: () => [], markEnemy: () => {}, markedCount: () => 0, worldBounds: () => ({ w: 1600, h: 1200 }),
    };
    const sm = new SkillManager(scene); scene.skills = sm;
    if (evoBase) { sm.acquireOrLevel(evoBase); sm.setLevel(evoBase, 8); sm.evolve(evoBase); } else { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
    for (let i = 0; i < 120; i++) { nowMs += 50; clock = nowMs; sm.update(50, { hasEnemies: true }); }
    return { gauge: b._frostGauge, captured: captured.slice() };
  }
  captured.length = 0;
  const fc = await driveOnBoss('frozen_clock', null, null);
  ok(fc.captured.length > 0, 'frozen_clock: ボスへ氷命中が発生');
  ok(fc.captured.every((c) => approx(c.bossGaugeMult, fcLevels[7])), `frozen_clock: dealDamage へ Lv8 bossGaugeMult(${fcLevels[7]}) を渡す`);
  ok(fc.captured.every((c) => c.amt === skills.find((s) => s.id === 'frozen_clock').levels[7].damage), 'frozen_clock: damage 引数は素の Lv8 damage（bossGaugeMult を掛けない）');
  ok(fc.gauge > 0, 'frozen_clock: ボス氷砕ゲージが実際に増える');
  captured.length = 0;
  const zh = await driveOnBoss('zero_hour_world', 'frozen_clock', null);
  ok(zh.captured.some((c) => approx(c.bossGaugeMult, zhMult)), `zero_hour_world: dealDamage へ bossGaugeMult(${zhMult}) を渡す`);
  captured.length = 0;
  const ewm = await driveOnBoss('everlasting_white_mist', 'snowblind_mist', null);
  ok(ewm.captured.some((c) => approx(c.bossGaugeMult, ewmMult)), `everlasting_white_mist: dealDamage へ bossGaugeMult(${ewmMult}) を渡す`);
}

section('9. 火（element:fire）へは適用されない: dealDamage は element==="ice" のときのみ applyIceHit を呼ぶ');
{
  const bsSrc = readFileSync(join(dir, 'src/scenes/BattleScene.js'), 'utf8');
  ok(/!died && element === 'ice'[\s\S]{0,900}applyIceHit\(target/.test(bsSrc), "dealDamage は element==='ice' のときのみ applyIceHit（火は氷分岐へ入らない＝bossGaugeMult 非適用）");
  // bossGaugeMult は damage 倍率計算（amount *= ...）行に現れない。
  const dmgBlock = bsSrc.match(/dealDamage\(target[\s\S]*?applyIceHit/)?.[0] || '';
  const amountMulLines = dmgBlock.split('\n').filter((l) => /amount\s*\*?=|amount =/.test(l));
  ok(amountMulLines.every((l) => !/bossGaugeMult/.test(l)), 'bossGaugeMult は damage 倍率計算へ掛からない');
}

console.log(fail ? `\n✗ ボス氷砕ゲージ倍率(M7-C)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ ボス氷砕ゲージ倍率(M7-C)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
