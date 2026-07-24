// M7-B.1: 状態異常「表示状態」の純ロジック（冷気段階・アイコン優先度・上限・解除・cleanup・イベント）を検証。
// Phaser 描画は再現せず、StatusVisualManager の純関数＋StatusEffectManager の権威フィールド/イベントで確認する。Node標準のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StatusEffectRegistry } from '../src/systems/StatusEffectRegistry.js';
import { FreezeSystem } from '../src/systems/FreezeSystem.js';
import { StatusEffectManager } from '../src/systems/StatusEffectManager.js';
import { chillTierOf, isNearThreshold, selectIcons, entityVisualState, VisualBudget, ICON_PRIORITY } from '../src/systems/StatusVisualManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const seData = JSON.parse(readFileSync(join(dir, 'data', 'status-effects.json'), 'utf8'));
const reg = new StatusEffectRegistry(seData);
let clock = 1000;
const mkSfx = (seed = 123) => new StatusEffectManager({ registry: reg, freezeSystem: new FreezeSystem(reg), now: () => clock, seed });
let seq = 0;
const enemy = (elite = false) => ({ alive: true, isBoss: false, isElite: elite, maxHp: 60, hp: 60, _seq: seq++, x: 0, y: 0 });
const boss = () => ({ alive: true, isBoss: true, maxHp: 5000, hp: 5000, x: 0, y: 0, _frostGauge: 0, _frostBreaks: 0 });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

section('1. 冷気段階: 0=none / 1〜39%=low / 40〜74%=mid / 75%+=high');
{
  ok(chillTierOf(0) === 'none', 'chill 0 は none');
  ok(chillTierOf(0.2) === 'low', '20% は low');
  ok(chillTierOf(0.39) === 'low' && chillTierOf(0.40) === 'mid', '39%/40% 境界');
  ok(chillTierOf(0.6) === 'mid', '60% は mid');
  ok(chillTierOf(0.74) === 'mid' && chillTierOf(0.75) === 'high', '74%/75% 境界');
  ok(chillTierOf(1) === 'high', '100% は high');
}

section('2. threshold 近接（guaranteed の90%以上）');
{
  ok(!isNearThreshold(89, 100), '89/100(guar) は near でない');
  ok(isNearThreshold(90, 100), '90/100 は near');
  ok(!isNearThreshold(50, 0), 'guaranteed 0 は near にしない');
}

section('3. アイコン優先度: frozen > burning > freeze_immunity > chill_high・最大数');
{
  ok(JSON.stringify(ICON_PRIORITY) === JSON.stringify(['frozen', 'burning', 'freeze_immunity', 'chill_high']), '優先度順が仕様どおり');
  const all = selectIcons({ frozen: true, burning: true, freezeImmune: true, chillHigh: true }, 4);
  ok(JSON.stringify(all) === JSON.stringify(['frozen', 'burning', 'freeze_immunity', 'chill_high']), '4状態を優先度順で返す');
  const cap2 = selectIcons({ frozen: true, burning: true, freezeImmune: true, chillHigh: true }, 2);
  ok(JSON.stringify(cap2) === JSON.stringify(['frozen', 'burning']), '最大2で上位2件（frozen/burning）');
  ok(selectIcons({ frozen: false, burning: false, freezeImmune: true, chillHigh: true }, 1).join() === 'freeze_immunity', 'frozen/burning無ければ immunity 優先');
  ok(selectIcons({}, 3).length === 0, '状態なしはアイコン0');
}

section('4. entityVisualState: 権威フィールドから可視状態を解決・chill=0 で表示なし');
{
  const sfx = mkSfx(); const e = enemy();
  let st = entityVisualState(e, sfx);
  ok(!st.hasAny() && st.tier === 'none', 'chill0/非凍結は表示なし');
  sfx.addChill(e, 30); st = entityVisualState(e, sfx);
  ok(st.tier === 'low' && st.hasAny(), '冷気30で low・表示あり');
  sfx.addChill(e, 60); st = entityVisualState(e, sfx); // 合計90 → high
  ok(st.tier === 'high' && st.chillHigh, '冷気90で high');
  // 凍結最優先。
  clock += 10; e._freezeImmuneUntil = 0; sfx.freeze(e); st = entityVisualState(e, sfx);
  ok(st.frozen, '凍結中は frozen=true');
  const icons = selectIcons({ frozen: st.frozen, burning: st.burning, freezeImmune: st.freezeImmune, chillHigh: st.chillHigh }, 2);
  ok(icons[0] === 'frozen', '凍結中はアイコン先頭が frozen');
}

section('5. 状態解除・死亡・release・pool再利用で表示状態が残らない');
{
  const sfx = mkSfx(); const e = enemy();
  sfx.addChill(e, 80); sfx.freeze(e);
  ok(entityVisualState(e, sfx).hasAny(), '付与直後は表示あり');
  sfx.onDeath(e); // clearEntity 相当
  ok(!entityVisualState(e, sfx).hasAny(), 'onDeath 後は表示なし（冷気/凍結クリア）');
  // pool 再利用: 同じオブジェクトを再利用してもフィールドが初期化されていれば残留なし。
  e._chill = 0; e._chillSlow = 0; e._frozenUntil = 0; e._freezeImmuneUntil = 0; e.alive = true;
  ok(!entityVisualState(e, sfx).hasAny(), 'pool 再利用（フィールド初期化）で残留なし');
}

section('6. 品質別上限: VisualBudget は上限で装飾を抑制し到達数を記録（状態ロジックは別）');
{
  const b = new VisualBudget({ chill: 2 });
  ok(b.take('chill') && b.take('chill') && !b.take('chill'), 'cap2 で3回目は false');
  ok(b.capReached().chill === 1, '到達数を記録');
  // 上限に達しても状態ロジック（凍結/冷気）は不変。
  const sfx = mkSfx(); const es = Array.from({ length: 10 }, () => enemy());
  for (const e of es) sfx.addChill(e, 50);
  ok(es.every((e) => sfx.chillOf(e) === 50), '表示上限に関係なく冷気値は保持される');
}

section('7. 状態イベントが発火する（表示側が購読・判定/RNGは不変）');
{
  const sfx = mkSfx(); const e = enemy();
  const events = [];
  sfx.on((type) => events.push(type));
  sfx.addChill(e, 30);
  ok(events.includes('chillChanged'), 'addChill で chillChanged');
  // near 通知（guaranteed 100 の 90=90 到達）。
  events.length = 0; sfx.addChill(e, 65); // 30+65=95 → near 90 を跨ぐ
  ok(events.includes('chillThresholdNear'), '閾値近接で chillThresholdNear');
  events.length = 0; e._freezeImmuneUntil = 0; sfx.freeze(e);
  ok(events.includes('frozenStarted'), 'freeze で frozenStarted');
  events.length = 0; sfx.unfreeze(e, { immunity: true });
  ok(events.includes('frozenEnded') && events.includes('freezeImmunityStarted'), 'unfreeze で frozenEnded＋freezeImmunityStarted');
}

section('8. 実動作カウンタ（chill付与/凍結試行/成功/耐性・hitGroupスキップ）');
{
  const sfx = mkSfx(777);
  // 別々の敵へ1回ずつ（凍結で蓄積が止まらないよう）＝chill付与5回・凍結試行5回。
  for (let i = 0; i < 5; i++) sfx.applyIceHit(enemy(), { chillAmount: 10, baseFreezeChance: 0.3, procCoefficient: 0.5, hitGroupId: i });
  const c = sfx.counters();
  ok(c.chillApplications === 5, `chillApplications 記録 (${c.chillApplications})`);
  ok(c.freezeAttempts === 5, `freezeAttempts 記録 (${c.freezeAttempts})`);
  // 耐性中は immunitySkips。
  const e2 = enemy(); e2._freezeImmuneUntil = clock + 1000;
  const before = sfx.counters().immunitySkips;
  sfx.applyIceHit(e2, { chillAmount: 10, baseFreezeChance: 0.9, procCoefficient: 1, hitGroupId: 99 });
  ok(sfx.counters().immunitySkips === before + 1, '耐性中は immunitySkips++');
}

section('9. Phaser 経路のランタイムスモーク（最小モックで例外なく駆動・描画は未検証）');
{
  globalThis.Phaser = { BlendModes: { ADD: 1 } };
  const chain = () => { const o = {}; const c = () => o; for (const m of ['setPosition', 'setVisible', 'setDepth', 'setScrollFactor', 'setStrokeStyle', 'setFillStyle', 'setOrigin', 'setScale', 'setAlpha', 'setSize', 'setTint', 'setRotation', 'setText', 'setBlendMode', 'clear', 'fillStyle', 'fillTriangle', 'fillCircle', 'fillRoundedRect', 'fillRect', 'destroy', 'add']) o[m] = c; o.x = 0; o.y = 0; o.width = 0; return o; };
  const scene = {
    add: { container: () => { const c = chain(); c.add = () => c; return c; }, circle: () => chain(), ellipse: () => chain(), graphics: () => chain(), text: () => chain(), rectangle: () => chain() },
    tweens: { add: (cfg) => { if (cfg && cfg.onComplete) cfg.onComplete(); } },
    time: { now: 0, delayedCall: (ms, fn) => fn && fn() },
    combat: { skillCap: (n, f) => f }, effects: { explosion() {}, sparks() {} }, burningCount: () => 0, telemetry: null,
  };
  const { StatusVisualManager } = await import('../src/systems/StatusVisualManager.js');
  const { BossFrostbreakDisplay } = await import('../src/ui/BossFrostbreakDisplay.js');
  const { StatusDebugPanel } = await import('../src/ui/StatusDebugPanel.js');
  let threw = null;
  try {
    const sfx = mkSfx(11);
    const svm = new StatusVisualManager(scene); svm.subscribe(sfx);
    const es = Array.from({ length: 6 }, () => enemy());
    for (const e of es) sfx.addChill(e, 60);
    sfx.freeze(es[0]);
    svm.beginFrame(); svm.update(1000, sfx, es, null); // interval 超過で reconcile
    svm.onShatter(10, 10);
    es[1].alive = false; svm.update(1000, sfx, es.filter((e) => e.alive), null); // cleanup 経路
    svm.clear(); svm.destroy();
    const hud = { bossFrostBar: chain(), showBossFrost() {}, hideBossFrost() {}, updateBossFrost() {} };
    const bfd = new BossFrostbreakDisplay(scene, hud); bfd.setConfig({ frostbreak: { showText: true, textDurationMs: 900, shardCount: 8 }, vulnerability: { blink: true, blinkPeriodMs: 320 } }); bfd.subscribe(sfx);
    const b = boss(); for (let i = 0; i < 40; i++) sfx.addBossGauge(b, 10);
    bfd.update(b, sfx, 'ice', 0); bfd.update(null, sfx, 'ice', 0); bfd.destroy();
    const panel = new StatusDebugPanel(scene); panel.open(); panel.setTarget(es[2]); panel.update(sfx, b); panel.close();
  } catch (e) { threw = e; }
  ok(!threw, `3表示クラスが例外なく駆動する${threw ? ' → ' + threw.message : ''}`);
}

console.log(fail ? `\n✗ 状態表示状態テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 状態表示状態テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
