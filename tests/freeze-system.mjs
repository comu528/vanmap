// M7-A: 冷気減速・凍結確率・ボス氷砕・粉砕の数値と決定論のテスト。Node.js 標準機能のみ（Math.random 不使用）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StatusEffectRegistry } from '../src/systems/StatusEffectRegistry.js';
import { FreezeSystem } from '../src/systems/FreezeSystem.js';
import { StatusEffectManager } from '../src/systems/StatusEffectManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const seData = JSON.parse(readFileSync(join(dir, 'data', 'status-effects.json'), 'utf8'));
const reg = new StatusEffectRegistry(seData);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const approx = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const section = (t) => console.log(t);

const fs = new FreezeSystem(reg);
let seq = 0;
const enemy = (elite = false) => ({ alive: true, isBoss: false, isElite: elite, maxHp: 60, _seq: seq++ });

section('1. 冷気による減速');
ok(fs.slowFactor('normal', 0) === 0, 'chill=0 で減速なし');
ok(fs.slowFactor('normal', 50) > 0 && fs.slowFactor('normal', 50) < 0.5, 'chill増加で減速（最大未満）');
ok(approx(fs.slowFactor('normal', 100), 0.5), 'chillCap到達で maxSlow 50%');
ok(approx(fs.slowFactor('elite', 130), 0.35), 'エリートは chillCap130 で maxSlow 35%');
ok(fs.slowFactor('normal', 999) <= 0.5, '最大減速を超えない');

section('2. 凍結確率式・確定凍結・cap');
{
  const c = fs.computeFreezeChance('normal', { baseFreezeChance: 0.1, procCoefficient: 1, chill: 0 });
  ok(approx(c.chance, 0.1), 'chill=0: freezeChance = base×proc');
  const c2 = fs.computeFreezeChance('normal', { baseFreezeChance: 0, procCoefficient: 1, chill: 50 });
  ok(approx(c2.chance, (50 / 100) * seData.freeze.chanceFromChill), 'chill寄与 = (chill/cap)×chanceFromChill');
  const cap = fs.computeFreezeChance('normal', { baseFreezeChance: 5, procCoefficient: 1, chill: 0 });
  ok(cap.chance <= seData.freeze.normal.freezeChanceCap, 'freezeChanceCap を超えない');
  ok(fs.computeFreezeChance('normal', { chill: 100 }).guaranteed, 'threshold到達で確定凍結');
  ok(fs.computeFreezeChance('elite', { chill: 129 }).guaranteed === false, 'エリートは130未満で非確定');
  ok(fs.computeFreezeChance('elite', { chill: 130 }).guaranteed, 'エリートは130で確定');
}

section('3. 決定論（同 seed・同命中順で同結果・Math.random不使用）');
{
  const run = () => {
    const m = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => 0, seed: 777 });
    const e = enemy(); const res = [];
    for (let i = 0; i < 30; i++) res.push(m.applyIceHit(e, { chillAmount: 6, baseFreezeChance: 0.12, procCoefficient: 0.5, hitGroupId: i }).froze);
    return res.join('');
  };
  ok(run() === run(), '同 seed・同命中順で同じ凍結結果');
}

section('4. procCoefficient と hitGroup で多段永久凍結を防ぐ');
{
  // 低 procCoefficient かつ同一 hitGroup では、多段命中しても即座に凍結し続けない。
  const m = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => 0, seed: 5 });
  const e = enemy(); let freezes = 0;
  for (let i = 0; i < 40; i++) { if (m.applyIceHit(e, { chillAmount: 3, baseFreezeChance: 0.2, procCoefficient: 0.1, hitGroupId: 1 }).froze) freezes++; }
  ok(freezes <= 1, '同一 hitGroup の凍結判定回数上限（多段で永久凍結しない）');
}

section('5. freeze_immunity 中は凍結しない・冷気は軽減して蓄積');
{
  const m = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => 0, seed: 9 });
  const e = enemy(); e._freezeImmuneUntil = 5000;
  const before = e._chill || 0;
  const r = m.applyIceHit(e, { chillAmount: 50, baseFreezeChance: 1, procCoefficient: 1, hitGroupId: 2 });
  ok(!r.froze, '耐性中は凍結しない');
  ok((e._chill || 0) > before && (e._chill || 0) < 50, '耐性中も設定倍率ぶんだけ冷気を蓄積');
}

section('6. frozen 中は無制限延長しない・エリート耐性');
{
  let clk = 0; const m = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clk, seed: 3 });
  const e = enemy(); m.freeze(e); const until1 = e._frozenUntil;
  clk = 100; m.freeze(e);
  ok(e._frozenUntil === until1, '凍結中の再付与は残り時間を延長しない');
  const eN = enemy(false), eE = enemy(true);
  const mm = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => 0, seed: 1 });
  mm.freeze(eN); mm.freeze(eE);
  ok((eE._frozenUntil - 0) < (eN._frozenUntil - 0), 'エリートの凍結時間は通常敵より短い');
}

section('7. 凍結解除で AI/速度が復元される（フラグクリア）');
{
  let clk = 0; const m = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clk, seed: 1 });
  const e = enemy(); e.onFreezeEnd = () => { e.restored = true; };
  m.freeze(e); clk += 5000; m.update(50);
  ok(!m.isFrozen(e) && e.restored, '解除で凍結フラグが外れ復元フックが呼ばれる');
}

section('8. ボスは凍結しない・氷砕ゲージ・閾値成長・脆弱・cooldown');
{
  let clk = 0; const m = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clk, seed: 1 });
  const boss = { alive: true, isBoss: true, maxHp: 5000 };
  ok(m.freeze(boss) === false, 'ボスは frozen にならない');
  ok(m.addChill(boss, 100) === 0, 'ボスに冷気を蓄積しない（ゲージへ変換）');
  let ev = null; for (let i = 0; i < 30; i++) { const r = m.addBossGauge(boss, 10); if (r) { ev = r; break; } }
  ok(ev && ev.breaks === 1, '閾値到達で frostbreak 発生');
  ok(m.bossVulnActive(boss), 'break で vulnerability 付与');
  ok(approx(m.bossIceVulnMultiplier(boss), seData.bossFrostbreak.iceDamageTakenMultiplierDuringVulnerability), 'vulnerability中は氷被ダメージ増加');
  const th1 = m.bossThreshold(boss);
  const base = seData.bossFrostbreak.baseThreshold;
  ok(th1 > base, 'break後は次回閾値が増加');
  ok(m.bossThreshold({ _frostBreaks: 100 }) <= base * seData.bossFrostbreak.maximumThresholdMultiplier + 1e-6, '最大閾値倍率を超えない');
  // cooldown 中は連続 break しない。
  const before = boss._frostBreaks; m.addBossGauge(boss, 99999);
  ok(boss._frostBreaks === before, 'cooldown中は連続 break しない');
}

section('9. 粉砕: frozen のみ・ボス対象外・最大HP割合で無制限にしない');
{
  const m = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => 0, seed: 1 });
  const e = enemy(); ok(m.shatter(e) === null, 'frozen でない敵は粉砕しない');
  m.freeze(e); const r = m.shatter(e, { skillPower: 40 });
  ok(r && r.damage > 0, 'frozen 敵を粉砕できる');
  ok(!m.isFrozen(e), '粉砕で凍結解除');
  const huge = { alive: true, isBoss: false, isElite: false, maxHp: 1e9 };
  m.freeze(huge); const rh = m.shatter(huge, { skillPower: 0 });
  ok(rh.damage <= seData.shatter.absoluteCap, '粉砕ダメージは絶対上限を超えない（最大HP割合で暴走しない）');
  const boss = { alive: true, isBoss: true, maxHp: 5000 };
  ok(m.shatter(boss) === null, 'ボスは通常粉砕を適用しない');
}

console.log(fail ? `\n✗ 凍結システムテスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 凍結システムテスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
