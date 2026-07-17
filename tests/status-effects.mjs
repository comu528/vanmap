// M7-A: 汎用状態異常基盤のテスト（StatusEffectRegistry / StatusEffectManager）。Node.js 標準機能のみ。
// 状態定義・索引・適用・更新・解除・死亡/返却での掃除・炎上索引の非回帰を検証する。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StatusEffectRegistry } from '../src/systems/StatusEffectRegistry.js';
import { FreezeSystem } from '../src/systems/FreezeSystem.js';
import { StatusEffectManager } from '../src/systems/StatusEffectManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(readFileSync(join(dir, 'data', n), 'utf8'));
const seData = load('status-effects.json');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

let clock = 1000;
const now = () => clock;
const mk = () => new StatusEffectManager({ registry: new StatusEffectRegistry(seData), freezeSystem: new FreezeSystem(new StatusEffectRegistry(seData)), now, seed: 42 });
let seq = 0;
const enemy = (elite = false) => ({ alive: true, isBoss: false, isElite: elite, maxHp: 60, _seq: seq++, onFreezeEnd() { this.thawed = (this.thawed || 0) + 1; } });

section('1. 状態定義（必須5種・kind）');
const reg = new StatusEffectRegistry(seData);
for (const id of ['burning', 'chill', 'frozen', 'freeze_immunity', 'frostbreak_vulnerability']) ok(reg.has(id), `${id} 定義が存在`);
ok(reg.kindOf('burning') === 'damageOverTime', 'burning は damageOverTime');
ok(reg.kindOf('chill') === 'scalar', 'chill は scalar');
ok(reg.kindOf('frozen') === 'control', 'frozen は control');
ok(reg.kindOf('freeze_immunity') === 'immunity', 'freeze_immunity は immunity');
ok(reg.kindOf('frostbreak_vulnerability') === 'vulnerability', 'frostbreak_vulnerability は vulnerability');
for (const id of reg.ids()) ok(reg.isKindValid(id), `${id} の kind が既知`);
ok(reg.bossPolicy('chill') === 'convertToGauge', 'chill のボス方針は convertToGauge');
ok(reg.bossPolicy('frozen') === 'immune', 'frozen のボス方針は immune');
ok(!reg.affects('frozen', 'boss'), 'frozen はボスに適用しない');

section('2. 状態の開始・更新・解除');
{
  const m = mk(); const e = enemy();
  m.addChill(e, 40);
  ok(m.isChilled(e) && m.chillOf(e) > 0, '冷気の付与で chill 索引に載る');
  ok(m.countStatus('chill') === 1, 'chill 索引に1体');
  m.freeze(e);
  ok(m.isFrozen(e), '凍結が付与される');
  ok(m.countStatus('frozen') === 1, 'frozen 索引に1体');
  clock += 5000; m.update(50);
  ok(!m.isFrozen(e), '期限切れで凍結解除');
  ok(m.isFreezeImmune(e), '解除後に凍結耐性');
  ok(e.thawed >= 1, 'onFreezeEnd が呼ばれた');
}

section('3. 索引: 重複登録なし・死亡/返却で解除・Scene終了clear');
{
  const m = mk(); const e = enemy();
  m.addChill(e, 20); m.addChill(e, 20);
  ok(m.countStatus('chill') === 1, '同じ敵を重複登録しない');
  m.freeze(e);
  m.onDeath(e);
  ok(m.countStatus('chill') === 0 && m.countStatus('frozen') === 0, '死亡で全索引から除去');
  const e2 = enemy(); m.addChill(e2, 30); m.freeze(e2); m.onRelease(e2);
  ok(m.countStatus('chill') === 0 && m.countStatus('frozen') === 0, 'プール返却で全索引から除去');
  const e3 = enemy(); m.addChill(e3, 30); m.clearAll();
  ok(m.countStatus('chill') === 0, 'Scene終了 clearAll で索引クリア');
}

section('4. 炎上（burning）索引の非回帰（M6-E 挙動維持）');
{
  const m = mk(); const e = enemy();
  m.registerBurning(e);
  ok(m.countStatus('burning') === 1, 'registerBurning で burning 索引に載る');
  ok(m.entitiesWithStatus('burning').length === 1, 'entitiesWithStatus(burning) で取得できる');
  m.unregisterBurning(e);
  ok(m.countStatus('burning') === 0, 'unregisterBurning で解除');
}

section('5. 索引上限（新状態のみ・burning は無制限）');
{
  // 低い上限で cap 到達時に新規付与をスキップ（既存は壊さない）。
  const m = new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now, seed: 1, cap: () => 2 });
  const es = [enemy(), enemy(), enemy()];
  const r = es.map((e) => m.addChill(e, 30) > 0);
  ok(r[0] && r[1] && !r[2], '上限到達で3体目の冷気付与はスキップ（既存2体は維持）');
  ok(m.countStatus('chill') === 2, '索引は上限2で頭打ち');
}

console.log(fail ? `\n✗ 状態異常テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 状態異常テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
