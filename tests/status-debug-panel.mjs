// M7-B.1: 状態デバッグパネルの純ロジック（対象選択・実数行・凍結判定内訳・カウンタ）を検証。Node標準のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StatusEffectRegistry } from '../src/systems/StatusEffectRegistry.js';
import { FreezeSystem } from '../src/systems/FreezeSystem.js';
import { StatusEffectManager } from '../src/systems/StatusEffectManager.js';
import { StatusDebugPanel, activeStatusesOf, enemyDebugLines, freezeBreakdownLines, bossDebugLines, counterLines } from '../src/ui/StatusDebugPanel.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const seData = JSON.parse(readFileSync(join(dir, 'data', 'status-effects.json'), 'utf8'));
const reg = new StatusEffectRegistry(seData);
let clock = 1000;
const mkSfx = (seed = 5) => new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clock, seed });
let seq = 0;
const enemy = () => ({ alive: true, isBoss: false, isElite: false, maxHp: 60, hp: 60, _seq: seq++, x: 10, y: 10 });
const boss = () => ({ alive: true, isBoss: true, maxHp: 5000, hp: 5000, x: 0, y: 0, _frostGauge: 0, _frostBreaks: 0 });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const has = (lines, sub) => lines.some((l) => l.includes(sub));
const section = (t) => console.log(t);

section('1. 対象選択: setTarget（生存のみ）・死亡で選択解除・_validTarget');
{
  const panel = new StatusDebugPanel({}); // scene stub（open() まで scene.add は使わない）
  const e = enemy();
  panel.setTarget(e); ok(panel.target === e, '生存中の敵を選択');
  e.alive = false; ok(panel._validTarget() === null && panel.target === null, '死亡で選択解除');
  panel.setTarget(e); ok(panel.target === null, '死亡した敵は選択できない');
}

section('2. 敵の状態実数（HP/種別/冷気/減速/凍結/耐性/倍率/active）');
{
  const sfx = mkSfx(); const e = enemy();
  sfx.addChill(e, 45);
  const L = enemyDebugLines(e, sfx, clock);
  ok(has(L, '種別:normal') && has(L, 'HP:'), 'HP・種別を表示');
  ok(has(L, '冷気:45') && has(L, '比率:'), '冷気の実数と比率');
  ok(has(L, '減速:') && has(L, 'freezeChanceCap:'), '減速率と freezeChanceCap');
  ok(has(L, 'chillGain×') && has(L, 'freezeDur×'), '各倍率');
  ok(has(L, '凍結:×') && has(L, '耐性:×'), '凍結/耐性の状態');
  ok(activeStatusesOf(e, sfx, clock).includes('chill'), 'active statuses に chill');
}

section('3. 凍結判定の内訳（base/chill寄与/proc/最終/roll/結果/hitGroup）');
{
  const sfx = mkSfx(9); const e = enemy();
  sfx.applyIceHit(e, { chillAmount: 20, baseFreezeChance: 0.3, procCoefficient: 0.8, hitGroupId: 7 });
  const L = freezeBreakdownLines(e);
  ok(has(L, 'base×proc:') && has(L, '冷気寄与:') && has(L, 'proc:'), '内訳（base×proc/冷気寄与/proc）');
  ok(has(L, '最終freezeChance:') && has(L, 'roll:') && has(L, '結果:'), '最終確率・roll・結果');
  ok(has(L, 'hitGroup:7'), 'hitGroupId を表示');
  ok(e._statusDebug && typeof e._statusDebug.roll === 'number', 'RNG roll が記録される');
}

section('4. hitGroup 上限でスキップされた内訳');
{
  const sfx = mkSfx(3); const e = enemy();
  // 同一 hitGroup で上限（sameHitGroupMaxFreezeChecks=1）を超える2回目はスキップ。
  sfx.applyIceHit(e, { chillAmount: 5, baseFreezeChance: 0.2, procCoefficient: 1, hitGroupId: 42 });
  sfx.applyIceHit(e, { chillAmount: 5, baseFreezeChance: 0.2, procCoefficient: 1, hitGroupId: 42 });
  const L = freezeBreakdownLines(e);
  ok(has(L, 'スキップ') && has(L, 'hitGroup上限'), '2回目は hitGroup上限でスキップ表示');
}

section('5. ボスの氷砕状態（ゲージ/threshold/倍率/break/cooldown/vuln/ice倍率）');
{
  const sfx = mkSfx(); const b = boss();
  for (let i = 0; i < 30; i++) sfx.addBossGauge(b, 10);
  const L = bossDebugLines(b, sfx, clock);
  ok(has(L, '氷砕ゲージ:') && has(L, 'break回数:'), 'ゲージ・break回数');
  ok(has(L, 'threshold倍率:×') && has(L, 'iceダメージ倍率:×'), 'threshold倍率・iceダメージ倍率');
  ok(has(L, 'cooldown残:') && has(L, 'vuln残:'), 'cooldown/vuln 残り');
}

section('6. 実動作カウンタ行（telemetry と重複しない SEM カウンタ）');
{
  const sfx = mkSfx(); const e = enemy();
  sfx.applyIceHit(e, { chillAmount: 10, baseFreezeChance: 0.2, procCoefficient: 1, hitGroupId: 1 });
  const L = counterLines(sfx, { frozenCount: 1, immuneCount: 0, burningCount: 2, indexSize: 5, telemetry: { status: { shatters: 3, bossFrostbreaks: 1 } } });
  ok(has(L, '冷気付与:1'), '冷気付与カウンタ');
  ok(has(L, '凍結試行:1'), '凍結試行カウンタ');
  ok(has(L, '炎上中:2'), '炎上中（telemetry ではなく scene 由来）');
  ok(has(L, '粉砕:3') && has(L, '氷砕:1'), '粉砕/氷砕は telemetry を正として表示');
}

section('7. 純関数は profile/状態を変更しない（読み取り専用）');
{
  const sfx = mkSfx(); const e = enemy(); sfx.addChill(e, 30);
  const c0 = JSON.stringify(sfx.counters());
  enemyDebugLines(e, sfx, clock); freezeBreakdownLines(e); counterLines(sfx, {});
  ok(JSON.stringify(sfx.counters()) === c0, '行生成でカウンタ（状態）を変えない');
  ok(sfx.chillOf(e) === 30, '行生成で冷気値を変えない');
}

console.log(fail ? `\n✗ 状態デバッグパネルテスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 状態デバッグパネルテスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
