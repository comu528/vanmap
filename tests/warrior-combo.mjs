// 戦士 5/17: コンボ（M8-B §6）。Node.js 標準機能のみ。
// - 命中で増え、grace 経過後は毎秒減衰し、0 で途切れること
// - 閾値ボーナスが宣言順に効き、閾値を跨いだときだけ 1 回イベントが出ること
// - 同一敵への多段・1 発動あたりの加算で水増しできないこと
// - コンボがスキルごとではなくジョブ全体で 1 本であること
// 実行: node tests/warrior-combo.mjs

import { DATA, makeScene, makeEnemies, makeWarrior, bootRuntime, runner } from './warrior-common.mjs';

const T = runner('戦士 コンボ（M8-B）');
const { ok, section, info } = T;

const { WarriorCombatSystem } = await bootRuntime();
const CFG = DATA.balance.warrior.combo;

const setup = (opts = {}) => {
  const enemies = opts.enemies || makeEnemies(6, { hp: 1e9 });
  const scene = makeScene({ enemies, now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  return { scene, w, enemies };
};

// ===== 1. 設定値 =====
section('1. balance.json の warrior.combo が健全');
ok(CFG.maxValue > 0, `maxValue ${CFG.maxValue}`);
ok(CFG.graceMs > 0, `graceMs ${CFG.graceMs}`);
ok(CFG.decayPerSec > 0, `decayPerSec ${CFG.decayPerSec}`);
ok(CFG.maxGainPerCast > 0, `maxGainPerCast ${CFG.maxGainPerCast}`);
ok(CFG.sameTargetWindowMs > 0, `sameTargetWindowMs ${CFG.sameTargetWindowMs}`);
ok(Array.isArray(CFG.thresholds) && CFG.thresholds.length >= 3, `閾値 ${CFG.thresholds.length} 段`);
{
  let asc = true;
  for (let i = 1; i < CFG.thresholds.length; i++) if (CFG.thresholds[i].at <= CFG.thresholds[i - 1].at) asc = false;
  ok(asc, '閾値 at が昇順');
  const keys = new Set(['at', 'attackSpeedMult', 'meleeAreaMult', 'meleeDamageMult', 'poiseDamageMult', 'furyGainMult']);
  for (const t of CFG.thresholds) for (const k of Object.keys(t)) ok(keys.has(k), `閾値キー "${k}" は実装が参照する既知キー`);
}

// ===== 2. 命中で増える / grace 中は減らない =====
section('2. 命中で増え、grace 中は減衰しない');
{
  const { scene, w, enemies } = setup();
  for (let i = 0; i < 5; i++) w.addCombo(1, `c${i}`, enemies[i]);
  ok(w.combo === 5, `5 回命中でコンボ 5（実際 ${w.combo}）`);
  ok(w.comboGraceLeftMs > 0, 'grace が張られている');
  for (let i = 0; i < 10; i++) { w.update(100); scene.advance(100); }
  ok(w.combo === 5, `grace 中（1.0s 経過）はコンボが減らない（実際 ${w.combo}）`);
}

// ===== 3. grace 経過後の減衰と途切れ =====
section('3. grace 経過後は毎秒 decayPerSec で減り、0 で途切れる');
{
  const { scene, w, enemies } = setup();
  for (let i = 0; i < 6; i++) w.addCombo(1, `c${i}`, enemies[i]);
  const start = w.combo;
  // grace を消化。
  for (let i = 0; i < Math.ceil(CFG.graceMs / 100) + 1; i++) { w.update(100); scene.advance(100); }
  ok(w.comboGraceLeftMs === 0, 'grace が切れる');
  const beforeDecay = w.combo;
  w.update(1000); scene.advance(1000);
  const dropped = beforeDecay - w.combo;
  ok(Math.abs(dropped - CFG.decayPerSec) < 1e-6 || w.combo === 0, `1 秒で ${dropped.toFixed(2)} 減衰（decayPerSec ${CFG.decayPerSec}）`);
  for (let i = 0; i < 60; i++) { w.update(100); scene.advance(100); }
  ok(w.combo === 0, 'やがて 0 になる');
  ok(w.telemetry.comboBreaks >= 1, `途切れ回数 ${w.telemetry.comboBreaks} が記録される`);
  info(`開始 ${start} → 0 まで減衰した`);
}

// ===== 4. 同一敵の多段では増えない =====
section('4. 同一敵への短時間の多段はコンボを増やさない');
{
  const { scene, w, enemies } = setup();
  const t = enemies[0];
  const first = w.addCombo(1, 'castA', t);
  const second = w.addCombo(1, 'castB', t);
  ok(first === 1, '1 回目は増える');
  ok(second === 0, `sameTargetWindowMs 内の 2 回目は増えない（${second}）`);
  scene.advance(CFG.sameTargetWindowMs + 10);
  ok(w.addCombo(1, 'castC', t) === 1, '窓が明ければ同じ敵でも増える');
}

// ===== 5. 1 発動あたりの上限 =====
section('5. 同一 castKey の加算は maxGainPerCast を超えない');
{
  const { w, enemies } = setup();
  let total = 0;
  for (let i = 0; i < 20; i++) total += w.addCombo(1, 'sameCast', enemies[i % enemies.length]);
  ok(total <= CFG.maxGainPerCast, `1 cast の合計 ${total} ≤ ${CFG.maxGainPerCast}`);
}

// ===== 6. 閾値ボーナス =====
section('6. 閾値ボーナスが宣言どおりに効く');
{
  const { w } = setup();
  const zero = w.comboBonuses();
  ok(zero.attackSpeedMult === 0 && zero.meleeDamageMult === 0, 'コンボ 0 ではボーナス 0');
  for (const t of CFG.thresholds) {
    w.combo = t.at;
    const b = w.comboBonuses();
    ok(b.reached.includes(t.at), `コンボ ${t.at} で閾値 ${t.at} に到達`);
    for (const k of ['attackSpeedMult', 'meleeAreaMult', 'meleeDamageMult', 'poiseDamageMult', 'furyGainMult']) {
      if (typeof t[k] === 'number') ok(b[k] >= t[k] - 1e-9, `閾値 ${t.at}: ${k} が ${t[k]} 以上乗る`);
    }
  }
  // 最上位の閾値ではすべての下位ボーナスが合算される。
  w.combo = CFG.thresholds[CFG.thresholds.length - 1].at;
  const top = w.comboBonuses();
  ok(top.reached.length === CFG.thresholds.length, `最上位では ${CFG.thresholds.length} 段すべて有効`);
  ok(w.attackSpeedMultiplier() > 1, '攻撃速度倍率が 1 を超える');
  ok(w.meleeAreaMultiplier() > 1, '近接範囲倍率が 1 を超える');
  ok(w.meleeDamageMultiplier(null) > 1, '近接ダメージ倍率が 1 を超える');
  ok(w.cooldownMultiplier() < 1, 'クールダウン倍率が 1 未満');
}

// ===== 7. 閾値イベントは跨いだときだけ 1 回 =====
section('7. 閾値イベントは跨いだ瞬間に 1 回だけ');
{
  const { scene, w, enemies } = setup();
  const first = CFG.thresholds[0].at;
  let i = 0;
  while (w.combo < first + 5) { w.addCombo(1, `c${i}`, enemies[i % enemies.length]); i++; scene.advance(CFG.sameTargetWindowMs + 1); if (i > 500) break; }
  ok(w.telemetry.comboThresholdCounts[String(first)] === 1, `閾値 ${first} の到達回数が 1（実際 ${w.telemetry.comboThresholdCounts[String(first)]}）`);
  const events = scene.calls.filter((c) => c[0] === 'warriorEvent' && c[1] === 'comboThreshold' && c[2].at === first);
  ok(events.length === 1, `comboThreshold イベントが 1 回だけ（実際 ${events.length}）`);
}

// ===== 8. コンボはジョブ全体で 1 本 =====
section('8. コンボはスキルごとではなくジョブ全体で 1 本');
{
  const { scene, w, enemies } = setup();
  w.addCombo(1, 'great_cleave#1', enemies[0]);
  w.addCombo(1, 'ground_slam#1', enemies[1]);
  w.addCombo(1, 'shield_bash#1', enemies[2]);
  ok(w.combo === 3, `別スキルの命中が同じコンボへ積まれる（${w.combo}）`);
  ok(typeof w.combo === 'number' && !Array.isArray(w.combo), 'コンボはスカラー（スキル別ゲージではない）');
  void scene;
}

// ===== 9. コンボが闘気を生む =====
section('9. コンボの増加が闘気を生む（殴り続ける報酬）');
{
  const { scene, w, enemies } = setup();
  for (let i = 0; i < 6; i++) { w.addCombo(1, `c${i}`, enemies[i]); scene.advance(CFG.sameTargetWindowMs + 1); }
  ok(w.telemetry.furyBySource.combo > 0, `combo 由来の闘気 ${w.telemetry.furyBySource.combo.toFixed(2)} > 0`);
}

// ===== 10. passive / Job Lv 倍率 =====
section('10. 戦闘本能（grace/decay/閾値）と Job Lv40（閾値強化）が効く');
{
  const a = setup();
  const b = setup({ mods: { comboGraceMult: 2, comboDecayMult: 0.5 } });
  a.w.addCombo(1, 'x', null); b.w.addCombo(1, 'x', null);
  ok(b.w.comboGraceLeftMs > a.w.comboGraceLeftMs, `comboGraceMult で猶予が伸びる（${a.w.comboGraceLeftMs} → ${b.w.comboGraceLeftMs}）`);
  // 減衰倍率。
  for (const s of [a, b]) { s.w.combo = 40; s.w.comboGraceLeftMs = 0; s.w.update(1000); }
  ok(b.w.combo > a.w.combo, `comboDecayMult で減衰が緩む（${a.w.combo.toFixed(1)} vs ${b.w.combo.toFixed(1)}）`);
  const c = setup({ mods: { comboThresholdBonusMult: 2 } });
  const d = setup();
  const at = CFG.thresholds[0].at;
  c.w.combo = at; d.w.combo = at;
  ok(c.w.comboBonuses().attackSpeedMult > d.w.comboBonuses().attackSpeedMult, 'comboThresholdBonusMult で閾値効果が強くなる');
}

// ===== 11. 上限 =====
section('11. コンボは maxValue を超えない');
{
  const { scene, w, enemies } = setup();
  for (let i = 0; i < 2000; i++) { w.addCombo(3, `c${i}`, enemies[i % enemies.length]); scene.advance(CFG.sameTargetWindowMs + 1); }
  ok(w.combo <= CFG.maxValue, `コンボ ${w.combo} ≤ maxValue ${CFG.maxValue}`);
  ok(w.telemetry.comboPeak <= CFG.maxValue, 'comboPeak も maxValue 以内');
}

// ===== 12. breakCombo =====
section('12. 明示的な途切れ（breakCombo）');
{
  const { w, enemies } = setup();
  w.addCombo(3, 'c', enemies[0]);
  const before = w.telemetry.comboBreaks;
  w.breakCombo();
  ok(w.combo === 0, 'コンボが 0 になる');
  ok(w.comboGraceLeftMs === 0, 'grace も消える');
  ok(w.telemetry.comboBreaks === before + 1, '途切れ回数が 1 増える');
  w.breakCombo();
  ok(w.telemetry.comboBreaks === before + 1, 'コンボ 0 での再呼び出しでは増えない');
}

T.finish();
