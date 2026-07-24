// M7-B.1: 状態表示/イベント追加が「計算・確率・RNG cursor・炎上・氷術師スキル数・保存」を変えないことを検証。Node標準のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StatusEffectRegistry } from '../src/systems/StatusEffectRegistry.js';
import { FreezeSystem } from '../src/systems/FreezeSystem.js';
import { StatusEffectManager } from '../src/systems/StatusEffectManager.js';
import { migrateProfile } from '../src/systems/profileSchema.js';
import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { registeredSkillIds, skillsWithRuntimeState } from '../src/systems/SkillManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = (f) => JSON.parse(readFileSync(join(dir, 'data', f), 'utf8'));
const seData = L('status-effects.json');
const reg = new StatusEffectRegistry(seData);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

section('1. FreezeSystem 確率計算が不変（イベント/カウンタ追加の影響なし）');
{
  const fs = new FreezeSystem(reg);
  const a = fs.computeFreezeChance('normal', { baseFreezeChance: 0.2, procCoefficient: 0.8, chill: 40 });
  ok(Math.abs(a.chance - (0.2 * 0.8 + (40 / 100) * reg.freezeConfig().chanceFromChill * 0.8)) < 1e-9, 'freezeChance 式が仕様どおり');
  ok(fs.computeFreezeChance('normal', { chill: 100 }).guaranteed === true, 'chill=100 で確定凍結');
}

section('2. status RNG cursor 不変: applyIceHit の凍結列が保存→復元で完全再現');
{
  let clk = 0;
  const m1 = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clk, seed: 4242 });
  const e = { alive: true, isBoss: false, isElite: false, maxHp: 60, _seq: 1 };
  for (let i = 0; i < 6; i++) m1.applyIceHit(e, { chillAmount: 5, baseFreezeChance: 0.3, procCoefficient: 0.5, hitGroupId: i });
  const saved = m1.serialize();
  const seqA = [];
  const e2 = { alive: true, isBoss: false, isElite: false, maxHp: 60, _seq: 2 };
  for (let i = 0; i < 12; i++) seqA.push(m1.applyIceHit(e2, { chillAmount: 5, baseFreezeChance: 0.3, procCoefficient: 0.5, hitGroupId: 100 + i }).froze);
  // 復元して同じ続きを再現。
  const m2 = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clk, seed: 1 });
  m2.restore(saved);
  const seqB = [];
  const e3 = { alive: true, isBoss: false, isElite: false, maxHp: 60, _seq: 2 };
  for (let i = 0; i < 12; i++) seqB.push(m2.applyIceHit(e3, { chillAmount: 5, baseFreezeChance: 0.3, procCoefficient: 0.5, hitGroupId: 100 + i }).froze);
  ok(seqA.join('') === seqB.join(''), '復元後の凍結判定列が一致（RNG cursor 不変）');
  ok(saved.rng && typeof saved.rng.cursor === 'number', 'serialize は rng cursor のみ（表示状態/カウンタは保存しない）');
  ok(!('counters' in saved) && !('listeners' in saved), 'カウンタ/リスナは保存しない');
}

section('3. イベント購読の有無で凍結判定結果が変わらない');
{
  const run = (withListener) => {
    let clk = 0; const m = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clk, seed: 909 });
    if (withListener) m.on(() => { /* 何もしない購読 */ });
    const out = []; const e = { alive: true, isBoss: false, isElite: false, maxHp: 60, _seq: 1 };
    for (let i = 0; i < 20; i++) out.push(m.applyIceHit(e, { chillAmount: 8, baseFreezeChance: 0.25, procCoefficient: 0.6, hitGroupId: i }).froze);
    return out.join('');
  };
  ok(run(false) === run(true), '購読あり/なしで判定列が一致');
}

section('4. 炎上（burning）非回帰: registerBurning は索引へ追加し、炎上ロジックへ影響しない');
{
  let clk = 0; const m = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clk, seed: 1 });
  const e = { alive: true, isBoss: false, _igniteUntil: 1000, ignited: true, _seq: 1 };
  m.registerBurning(e);
  ok(m.countStatus('burning') === 1, 'burning 索引へ登録される');
  // update は burning 索引を刈り取らない（M6-E 経路が正）。
  clk = 2000; m.update(16);
  ok(m.indexOf('burning').has(e), 'update は burning 索引を変更しない（炎上は既存経路が管理）');
}

section('5. 氷術師 active15・進化8、火の魔女30/18 のカタログ非回帰');
{
  const args = { skills: L('skills.json').skills, passives: L('passives.json').passives, evolutions: L('skill-evolutions.json').evolutions, jobs: L('jobs.json').jobs, registeredIds: registeredSkillIds(), runtimeStateIds: skillsWithRuntimeState() };
  const fm = buildCatalog({ ...args, jobId: 'frost_mage' });
  ok(fm.summary.activeCount === 15 && fm.summary.evolutionCount === 8, '氷術師 active15/進化8');
  const fw = buildCatalog({ ...args, jobId: 'flame_witch' });
  ok(fw.summary.activeCount === 30 && fw.summary.evolutionCount === 18, '火の魔女 active30/進化18');
}

section('6. save_version v6 維持・表示状態は保存しない');
{
  const p = migrateProfile({ save_version: 5, selectedJobId: 'frost_mage' }, 6, '0.7.1');
  ok(p.save_version === 6, 'save_version 6');
  // skillRuntime（CD保存）の対象数は不変（frost 12種＋火の runtimeState 保持スキル）。
  const rt = new Set(skillsWithRuntimeState());
  for (const id of ['glacier_drop', 'mirror_ice', 'frost_shard', 'flame_barrier']) ok(rt.has(id), `${id} の runtimeState 保持を維持`);
}

console.log(fail ? `\n✗ 視認性 非回帰テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 視認性 非回帰テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
