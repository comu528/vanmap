// M7-A: 状態異常・ジョブ選択の保存/復元の round-trip と非回帰のテスト。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrateProfile } from '../src/systems/profileSchema.js';
import { StatusEffectRegistry } from '../src/systems/StatusEffectRegistry.js';
import { FreezeSystem } from '../src/systems/FreezeSystem.js';
import { StatusEffectManager } from '../src/systems/StatusEffectManager.js';
import { skillsWithRuntimeState } from '../src/systems/SkillManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const seData = JSON.parse(readFileSync(join(dir, 'data', 'status-effects.json'), 'utf8'));
const reg = new StatusEffectRegistry(seData);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

section('1. selectedJobId / frost_mage jobProgress の round-trip');
{
  const p = migrateProfile({ selectedJobId: 'frost_mage', jobProgress: { frost_mage: { totalXp: 1234, runs: 3 } } }, 6, '0.7.0');
  const json = JSON.stringify(p);
  const p2 = migrateProfile(JSON.parse(json), 6, '0.7.0'); // 保存→インポートを模す
  ok(p2.selectedJobId === 'frost_mage', 'selectedJobId が round-trip で維持');
  ok(p2.jobProgress.frost_mage.totalXp === 1234, 'frost_mage jobProgress が round-trip で維持');
}

section('2. 状態RNG（cursor）の round-trip — 再読込で凍結判定を引き直せない');
{
  const m1 = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => 0, seed: 555 });
  const e = { alive: true, isBoss: false, isElite: false, maxHp: 60, _seq: 1 };
  // 何回か判定を進めてから状態を保存。
  for (let i = 0; i < 7; i++) m1.applyIceHit(e, { chillAmount: 5, baseFreezeChance: 0.3, procCoefficient: 0.5, hitGroupId: i });
  const saved = m1.serialize();
  // 続きの判定列。
  const cont = [];
  const e2 = { alive: true, isBoss: false, isElite: false, maxHp: 60, _seq: 2 };
  for (let i = 0; i < 10; i++) cont.push(m1.applyIceHit(e2, { chillAmount: 5, baseFreezeChance: 0.3, procCoefficient: 0.5, hitGroupId: 100 + i }).froze);
  // 保存直後の状態から復元して同じ続きを再現。
  const m2 = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => 0, seed: 1 });
  m2.restore(saved);
  const cont2 = [];
  const e3 = { alive: true, isBoss: false, isElite: false, maxHp: 60, _seq: 2 };
  for (let i = 0; i < 10; i++) cont2.push(m2.applyIceHit(e3, { chillAmount: 5, baseFreezeChance: 0.3, procCoefficient: 0.5, hitGroupId: 100 + i }).froze);
  ok(cont.join('') === cont2.join(''), '復元後は同じ凍結判定列（引き直しできない）');
  ok(saved.rng && typeof saved.rng.cursor === 'number', 'serialize は状態RNGの cursor を含む');
}

section('3. ボス氷砕状態の round-trip（gauge/breaks/vulnRemain）');
{
  let clk = 1000; const m = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clk, seed: 1 });
  const boss = { alive: true, isBoss: true, maxHp: 5000 };
  for (let i = 0; i < 40; i++) m.addBossGauge(boss, 10);
  boss._frostGauge = 120;
  // 保存相当の抽出。
  const snap = { gauge: boss._frostGauge, breaks: boss._frostBreaks, vulnRemainMs: Math.max(0, (boss._frostbreakVulnUntil || 0) - clk) };
  // 復元相当。
  const boss2 = { alive: true, isBoss: true, maxHp: 5000, _frostGauge: 0, _frostBreaks: 0 };
  boss2._frostGauge = snap.gauge; boss2._frostBreaks = snap.breaks;
  if (snap.vulnRemainMs > 0) boss2._frostbreakVulnUntil = clk + snap.vulnRemainMs;
  ok(boss2._frostGauge === boss._frostGauge && boss2._frostBreaks === boss._frostBreaks, 'ゲージ/break回数が復元される');
  ok(m.bossThreshold(boss2) === m.bossThreshold(boss), '復元後の必要閾値が一致（成長を悪用で初期化しない）');
  ok(snap.breaks > 0, 'break が発生していた（テスト前提）');
}

section('4. 氷スキルは個別 runtimeState を持たない（再開時に安全再構築・悪用防止）');
{
  const rt = new Set(skillsWithRuntimeState());
  for (const id of ['frost_shard', 'frost_nova', 'glacial_lance', 'permafrost_field', 'ice_wall', 'diamond_blizzard', 'absolute_zero_domain', 'heaven_piercing_glacier']) {
    ok(!rt.has(id), `${id} は serializeState を持たない（氷弾/凍土/氷壁位置は保存せず再構築）`);
  }
}

section('5. 旧 profile を壊さない・save_version は v6 維持');
{
  const legacy = migrateProfile({ save_version: 5, embers: 3, skillMastery: { fireball: { casts: 10 } } }, 6, '0.7.0');
  ok(legacy.save_version === 6, '移行後 save_version は 6');
  ok(legacy.embers === 3 && legacy.selectedJobId === 'flame_witch', '旧データを保持しつつ既定ジョブを補完');
  ok(legacy.balanceTelemetry && typeof legacy.balanceTelemetry === 'object', 'M6-F テレメトリ構造を維持');
}

console.log(fail ? `\n✗ 状態異常保存・非回帰テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 状態異常保存・非回帰テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
