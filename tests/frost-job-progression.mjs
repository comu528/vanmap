// M7-A: 氷術師 Job Lv1〜100 と到達報酬の補正解決のテスト。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JobModifierManager } from '../src/systems/JobModifierManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const jobProg = JSON.parse(readFileSync(join(dir, 'data', 'job-progression.json'), 'utf8'));
const cfg = jobProg.jobs.frost_mage;
const fw = jobProg.jobs.flame_witch;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const approx = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const section = (t) => console.log(t);
const mk = (lv, c = cfg) => { const jm = new JobModifierManager(); jm.setResolved(JobModifierManager.resolve(c, lv)); return jm; };
const ice = (extra = {}) => ({ element: 'ice', ...extra });

section('1. Lv1 恒等 / 主属性');
{
  const j1 = mk(1);
  ok(j1.primaryElement === 'ice', 'primaryElement が ice');
  ok(j1.damageMultiplier(ice()) === 1, 'Lv1: 氷ダメージ恒等');
  ok(j1.statusPowerMult() === 1 && j1.shatterDamageMult() === 1, 'Lv1: 冷気/粉砕恒等');
  ok(j1.cooldownMult() === 1 && j1.projectileCountBonus() === 0, 'Lv1: CD/発射数恒等');
}

section('2. Lv100 の基本成長（指定値）');
{
  const j = mk(100);
  ok(approx(j.damageMultiplier(ice()), 1 + 0.0035 * 99 + 0.05), 'Lv100 氷ダメージ = 基本34.65% + Lv5(5%)');
  ok(approx(j.statusPowerMult(), 1 + 0.0030 * 99 + 0.10), 'Lv100 冷気 = 基本29.7% + Lv10(10%)');
  ok(approx(j.shatterDamageMult(), 1 + 0.0040 * 99), 'Lv100 粉砕 = 基本39.6%');
}

section('3. 属性の誤適用がない（氷補正を火へ / 火補正を氷へ）');
{
  const jIce = mk(100);
  ok(jIce.damageMultiplier({ element: 'fire' }) === 1, '氷術師は火ダメージへ補正しない');
  const jFire = mk(100, fw);
  ok(jFire.damageMultiplier({ element: 'ice' }) === 1, '火の魔女は氷ダメージへ補正しない');
  ok(jFire.damageMultiplier({ element: 'fire' }) > 1, '火の魔女は火へは補正する（非回帰）');
}

section('4. 到達報酬 Lv5〜Lv100');
{
  ok(mk(4).damageMultiplier(ice()) < mk(5).damageMultiplier(ice()), 'Lv5 氷晶強化で氷ダメージ増加');
  ok(approx(mk(5).damageMultiplier(ice()) - mk(4).damageMultiplier(ice()), 0.05 + 0.0035), 'Lv5 は +5%（＋1レベル基本成長）');
  ok(approx(mk(10).statusPowerMult() - mk(9).statusPowerMult(), 0.10 + 0.0030), 'Lv10 冷気増幅 +10%');
  ok(approx(mk(20).cooldownMult(), 1 - 0.05), 'Lv20 急速詠唱 CD-5%');
  ok(mk(30).extraRerolls() === 1, 'Lv30 選択の余地 リロール+1');
  ok(mk(29).extraRerolls() === 0, 'Lv29 ではリロール加算なし');
  // Lv40 凍結狩り: chilled +10% / frozen +20%・frozen 優先で二重適用しない。
  const j40 = mk(40);
  ok(approx(j40.damageMultiplier(ice({ isChilledTarget: true })) / j40.damageMultiplier(ice()), 1.10), 'Lv40 chilled +10%');
  ok(approx(j40.damageMultiplier(ice({ isFrozenTarget: true })) / j40.damageMultiplier(ice()), 1.20), 'Lv40 frozen +20%');
  ok(approx(j40.damageMultiplier(ice({ isChilledTarget: true, isFrozenTarget: true })) / j40.damageMultiplier(ice()), 1.20), 'chilled+frozen は frozen 優先（二重適用しない）');
  ok(mk(39).damageMultiplier(ice({ isFrozenTarget: true })) === mk(39).damageMultiplier(ice()), 'Lv39 では対象ボーナス無し');
  ok(mk(50).shatterOnFrozenKill() && !mk(49).shatterOnFrozenKill(), 'Lv50 氷砕連鎖の解放');
  ok(approx(mk(60).damageMultiplier(ice({ isEvolved: true })) / mk(60).damageMultiplier(ice()), 1.20), 'Lv60 進化+20%');
  ok(approx(mk(70).rarityWeightMult('rare'), 1.15) && approx(mk(70).rarityWeightMult('legendary'), 1.25), 'Lv70 レアリティ重み');
  ok(mk(80).projectileCountBonus() === 1 && mk(79).projectileCountBonus() === 0, 'Lv80 発射数+1');
  const az = mk(100).absoluteZero();
  ok(az && approx(az.normalThresholdReduction, 0.20) && approx(az.bossThresholdReduction, 0.15) && approx(az.frozenDurationMult, 0.20), 'Lv100 絶対零度の値');
  ok(!mk(99).absoluteZero(), 'Lv99 では絶対零度なし');
}

section('5. 直列化・復元（primaryElement 維持）');
{
  const j = mk(100); const s = j.serialize();
  const j2 = new JobModifierManager(); j2.restore(s);
  ok(j2.primaryElement === 'ice' && approx(j2.damageMultiplier(ice()), j.damageMultiplier(ice())), 'restore で氷補正が一致');
}

console.log(fail ? `\n✗ 氷術師 Job Lv テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師 Job Lv テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
