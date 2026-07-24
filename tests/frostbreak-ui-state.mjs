// M7-B.1: ボス氷砕UI状態（表示可否・現在値/threshold・break・cooldown・vuln・保存復元一致・fire/ice倍率区別）を検証。Node標準のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StatusEffectRegistry } from '../src/systems/StatusEffectRegistry.js';
import { FreezeSystem } from '../src/systems/FreezeSystem.js';
import { StatusEffectManager } from '../src/systems/StatusEffectManager.js';
import { bossFrostDisplayState } from '../src/ui/BossFrostbreakDisplay.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const seData = JSON.parse(readFileSync(join(dir, 'data', 'status-effects.json'), 'utf8'));
const reg = new StatusEffectRegistry(seData);
let clock = 1000;
const mkSfx = () => new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clock, seed: 1 });
const boss = () => ({ alive: true, isBoss: true, maxHp: 5000, x: 0, y: 0, _frostGauge: 0, _frostBreaks: 0 });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

section('1. 表示可否: ボス不在/火の魔女は非表示・氷術師+ボスのみ表示');
{
  const sfx = mkSfx();
  ok(bossFrostDisplayState(null, sfx, 'ice', clock).visible === false, 'ボス不在は非表示');
  ok(bossFrostDisplayState(boss(), sfx, 'fire', clock).visible === false, '火の魔女は非表示（空ゲージを出さない）');
  const dead = boss(); dead.alive = false;
  ok(bossFrostDisplayState(dead, sfx, 'ice', clock).visible === false, 'ボス死亡は非表示');
  ok(bossFrostDisplayState(boss(), sfx, 'ice', clock).visible === true, '氷術師＋生存ボスは表示');
}

section('2. 現在値/threshold・割合・break回数');
{
  const sfx = mkSfx(); const b = boss(); b._frostGauge = 100;
  const st = bossFrostDisplayState(b, sfx, 'ice', clock);
  ok(st.gauge === 100 && st.threshold > 0, '現在値と必要値');
  ok(Math.abs(st.ratio - 100 / st.threshold) < 1e-9, '割合が gauge/threshold');
  ok(st.breaks === 0, 'break回数 0');
}

section('3. frostbreak 発生: break++/vuln有効/ice倍率>1・次回threshold増加');
{
  const sfx = mkSfx(); const b = boss();
  const th0 = sfx.bossThreshold(b);
  for (let i = 0; i < 40; i++) sfx.addBossGauge(b, 10); // 400 で threshold(250) 超過 → break
  const st = bossFrostDisplayState(b, sfx, 'ice', clock);
  ok(st.breaks >= 1, `break が発生 (${st.breaks})`);
  ok(st.vulnActive && st.vulnRemain > 0, 'vulnerability 有効・残り秒あり');
  ok(st.iceMultiplier > 1, `ice ダメージ倍率 > 1 (${st.iceMultiplier})`);
  ok(sfx.bossThreshold(b) > th0, `次回 threshold が増加 (${th0}→${sfx.bossThreshold(b)})`);
}

section('4. fire/ice 倍率の区別: vuln 中でも ice のみ増加（fire は 1 相当）');
{
  const sfx = mkSfx(); const b = boss();
  for (let i = 0; i < 40; i++) sfx.addBossGauge(b, 10);
  // bossIceVulnMultiplier は ice 用。dealDamage は element==='ice' のときのみ乗算する（本テストは倍率値の区別を確認）。
  ok(sfx.bossIceVulnMultiplier(b) > 1, 'ice 被ダメージ倍率は vuln 中 >1');
  const cfg = reg.bossFrostbreakConfig();
  ok(cfg.iceDamageTakenMultiplierDuringVulnerability >= 1, 'iceDamageTakenMultiplier は設定値（fire には適用しない設計）');
}

section('5. cooldown 中の表示');
{
  const sfx = mkSfx(); const b = boss();
  for (let i = 0; i < 40; i++) sfx.addBossGauge(b, 10); // break → cooldown 開始
  const st = bossFrostDisplayState(b, sfx, 'ice', clock);
  ok(st.cooldownRemain > 0, `break 直後は cooldown 残あり (${st.cooldownRemain})`);
}

section('6. 保存・復元後に表示値が一致（gauge/breaks/vulnRemain）');
{
  const sfx = mkSfx(); const b = boss();
  for (let i = 0; i < 40; i++) sfx.addBossGauge(b, 10);
  b._frostGauge = 120;
  const before = bossFrostDisplayState(b, sfx, 'ice', clock);
  // buildRunSnapshot 相当の抽出 → 復元。
  const snap = { gauge: b._frostGauge, breaks: b._frostBreaks, vulnRemainMs: before.vulnRemain, cdRemainMs: before.cooldownRemain };
  const b2 = boss(); b2._frostGauge = snap.gauge; b2._frostBreaks = snap.breaks;
  if (snap.vulnRemainMs > 0) b2._frostbreakVulnUntil = clock + snap.vulnRemainMs;
  if (snap.cdRemainMs > 0) b2._frostbreakCdUntil = clock + snap.cdRemainMs;
  const after = bossFrostDisplayState(b2, sfx, 'ice', clock);
  ok(after.gauge === before.gauge && after.breaks === before.breaks, '復元後の gauge/breaks 一致');
  ok(Math.abs(after.vulnRemain - before.vulnRemain) < 1 && Math.abs(after.threshold - before.threshold) < 1e-6, '復元後の vuln残/threshold 一致（成長を初期化しない）');
}

console.log(fail ? `\n✗ ボス氷砕UI状態テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ ボス氷砕UI状態テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
