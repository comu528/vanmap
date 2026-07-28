// 戦士 4/17: 闘気（fury）と闘気解放（M8-B §4・§5）。Node.js 標準機能のみ。
// - 獲得源が近接命中/撃破/コンボ/軽減/被弾の 5 種に限られること
// - 1 発動あたり・1 秒あたりの上限で無限蓄積しないこと
// - DoT・他ジョブ経路（castKey なし）で青天井にならないこと
// - 100 到達で 1 回だけ解放し、解放中は獲得が減衰し、終了で 0 へ戻ること
// 実行: node tests/warrior-fury.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner } from './warrior-common.mjs';

const T = runner('戦士 闘気・闘気解放（M8-B）');
const { ok, section, info } = T;

const { WarriorCombatSystem, FURY_SOURCES, WARRIOR_DEFAULTS } = await bootRuntime();
const CFG = DATA.balance.warrior;

const setup = (opts = {}) => {
  const enemies = opts.enemies || makeEnemies(6, { hp: 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  return { scene, w, enemies };
};

// ===== 1. 設定値の健全性 =====
section('1. balance.json の warrior.fury が健全');
ok(CFG && CFG.fury, 'balance.json に warrior.fury がある');
ok(CFG.fury.max > 0, `max ${CFG.fury.max} > 0`);
ok(CFG.fury.maxGainPerCast > 0 && CFG.fury.maxGainPerCast < CFG.fury.max, `maxGainPerCast ${CFG.fury.maxGainPerCast} が 0 < x < max`);
ok(CFG.fury.maxGainPerSecond > 0, `maxGainPerSecond ${CFG.fury.maxGainPerSecond} > 0`);
ok(CFG.fury.releaseGainMult >= 0 && CFG.fury.releaseGainMult < 1, `releaseGainMult ${CFG.fury.releaseGainMult} が [0,1)`);
ok(WARRIOR_DEFAULTS.fury.max > 0, '既定値（data 欠落時のフォールバック）も健全');

// ===== 2. 獲得源は 5 種 + exposed のみ =====
section('2. 闘気の獲得源が宣言どおり（telemetry のキーと 1:1）');
ok(FURY_SOURCES.join(',') === 'meleeHit,kill,combo,mitigated,damageTaken,exposed', `FURY_SOURCES = ${FURY_SOURCES.join(',')}`);
{
  const { w } = setup();
  for (const s of FURY_SOURCES) ok(Object.prototype.hasOwnProperty.call(w.telemetry.furyBySource, s), `telemetry.furyBySource.${s} がある`);
  const before = w.fury;
  w.addFury(5, 'unknownSource', null);
  ok(w.fury > before, '未知の source でも闘気自体は入る（統計だけ計上されない）');
  ok(w.telemetry.furyGained > 0, 'furyGained には計上される');
}

// ===== 3. 1 発動あたりの上限 =====
section('3. 同一 castKey での加算は maxGainPerCast を超えない');
{
  const { w } = setup();
  let total = 0;
  for (let i = 0; i < 50; i++) total += w.addFury(3, 'meleeHit', 'cast#1');
  ok(Math.abs(total - CFG.fury.maxGainPerCast) < 1e-6, `1 cast の合計 ${total.toFixed(2)} = ${CFG.fury.maxGainPerCast}`);
  info(`50 回 × 3 の加算が ${total.toFixed(2)} に抑えられた`);
}

// ===== 4. 1 秒あたりの上限 =====
section('4. 1 秒あたりの加算は maxGainPerSecond を超えない');
{
  const { scene, w } = setup();
  let total = 0;
  for (let i = 0; i < 40; i++) total += w.addFury(3, 'meleeHit', `cast#${i}`);
  ok(Math.abs(total - CFG.fury.maxGainPerSecond) < 1e-6, `1 秒の合計 ${total.toFixed(2)} = ${CFG.fury.maxGainPerSecond}`);
  scene.advance(1000);
  const next = w.addFury(3, 'meleeHit', 'cast#next');
  ok(next > 0, '1 秒経過で窓がリセットされ再び加算できる');
}

// ===== 5. castKey なし（DoT・他ジョブ経路）でも秒上限で守られる =====
section('5. castKey なしの加算も 1 秒上限を超えない');
{
  const { w } = setup();
  let total = 0;
  for (let i = 0; i < 100; i++) total += w.addFury(5, 'damageTaken', null);
  ok(total <= CFG.fury.maxGainPerSecond + 1e-6, `castKey なし 100 回でも ${total.toFixed(2)} ≤ ${CFG.fury.maxGainPerSecond}`);
}

// ===== 6. 100 到達で自動解放（1 回だけ）=====
section('6. 闘気 100 到達で自動解放し、解放は再帰しない');
{
  const { scene, w } = setup();
  for (let i = 0; i < 40; i++) { w.addFury(CFG.fury.max, 'kill', null); scene.advance(1000); }
  ok(w.telemetry.furyReleases >= 1, `解放が ${w.telemetry.furyReleases} 回発生`);
  ok(w.releaseActive, '解放中');
  const releasesBefore = w.telemetry.furyReleases;
  ok(w.startRelease() === false, '解放中に startRelease を呼んでも二重発動しない');
  ok(w.telemetry.furyReleases === releasesBefore, '解放回数が増えない');
  const fresh = setup();
  fresh.w.fury = CFG.fury.max;
  fresh.w.startRelease();
  ok(fresh.w.fury === 0, '解放開始で闘気が 0 になる');
}

// ===== 7. 解放中の獲得減衰 =====
section('7. 解放中は闘気の獲得が releaseGainMult まで減衰する');
{
  const { scene, w } = setup();
  w.fury = CFG.fury.max; w.startRelease();
  scene.advance(1000);
  const gained = w.addFury(10, 'meleeHit', null);
  ok(gained <= 10 * CFG.fury.releaseGainMult + 1e-6, `解放中の獲得 ${gained.toFixed(3)} ≤ ${(10 * CFG.fury.releaseGainMult).toFixed(3)}`);
}

// ===== 8. 解放終了で闘気 0・バフ解除 =====
section('8. 解放終了で闘気 0・攻防バフが元へ戻る');
{
  const { scene, w } = setup();
  const baseDmg = w.meleeDamageMultiplier(null);
  const baseSpd = w.attackSpeedMultiplier();
  w.fury = CFG.fury.max; w.startRelease();
  ok(w.meleeDamageMultiplier(null) > baseDmg, '解放中は近接ダメージ倍率が上がる');
  ok(w.attackSpeedMultiplier() > baseSpd, '解放中は攻撃速度倍率が上がる');
  ok(w.cooldownMultiplier() < 1, '解放中はクールダウン倍率が下がる');
  ok(w.knockbackMultiplier() > 1 && w.poiseDamageMultiplier() > 1, '解放中はノックバック/体勢削りも上がる');
  ok(w.damageReduction({}) >= CFG.furyRelease.damageReduction - 1e-9, '解放中は被ダメージ軽減が乗る');
  for (let i = 0; i < 200; i++) { w.update(50); scene.advance(50); }
  ok(!w.releaseActive, '時間経過で解放が終了する');
  ok(w.fury === 0, '解放終了時に闘気が 0');
  ok(Math.abs(w.meleeDamageMultiplier(null) - baseDmg) < 1e-9, '近接ダメージ倍率が元へ戻る');
  ok(Math.abs(w.attackSpeedMultiplier() - baseSpd) < 1e-9, '攻撃速度倍率が元へ戻る');
}

// ===== 9. Job Lv / passive 倍率 =====
section('9. 外部倍率（Job Lv / passive）が獲得へ乗る');
{
  const a = setup();
  const b = setup({ mods: { furyGainMult: 2 } });
  // 1 cast 上限（maxGainPerCast）に当たらない小さな値で比較する。
  const base = Math.min(2, CFG.fury.maxGainPerCast / 2);
  const ga = a.w.addFury(base, 'meleeHit', 'c1');
  const gb = b.w.addFury(base, 'meleeHit', 'c1');
  ok(Math.abs(gb - ga * 2) < 1e-6, `furyGainMult=2 で獲得が 2 倍（${ga.toFixed(2)} → ${gb.toFixed(2)}）`);
  const c = setup({ mods: { releaseDurationBonusMs: 1000 } });
  c.w.fury = CFG.fury.max; c.w.startRelease();
  ok(Math.abs(c.w.releaseLeftMs - (CFG.furyRelease.durationMs + 1000)) < 1e-6, '解放時間へ Job Lv50 のボーナスが乗る');
}

// ===== 10. 超過分は telemetry の overcap へ =====
section('10. 最大値超過分は闘気にならず overcap として記録される');
{
  const { scene, w } = setup();
  w.fury = CFG.fury.max - 1;
  w.addFury(CFG.fury.maxGainPerCast, 'kill', null);
  ok(w.telemetry.furyOvercap > 0, `overcap ${w.telemetry.furyOvercap.toFixed(2)} > 0`);
  ok(w.fury === 0 || w.fury <= CFG.fury.max, '闘気は max を超えない（解放で 0 へ）');
  void scene;
}

// ===== 11. 無効時（他ジョブ）は完全に不活性 =====
section('11. enabled=false（火/氷の周回）では一切の状態が動かない');
{
  const { w } = setup({ enabled: false });
  ok(w.addFury(50, 'meleeHit', null) === 0, 'addFury が 0 を返す');
  ok(w.fury === 0, '闘気が増えない');
  ok(w.startRelease() === false, '解放しない');
  ok(w.damageReduction({ engaged: true }) === 0, '軽減 0');
  ok(w.addCombo(10, null, null) === 0, 'コンボも増えない');
  ok(w.applyPoiseDamage({ alive: true, isElite: true }, 999) === null, '体勢も削らない');
  ok(w.noteKill({ alive: false }) === 0, '撃破回復も起きない');
}

// ===== 12. 撃破・軽減・被弾からの獲得 =====
section('12. 撃破 / 軽減 / 被弾でも闘気が入る');
{
  const { w } = setup();
  w.setHp(100, 100);
  const beforeKill = w.telemetry.furyBySource.kill;
  w.noteKill({ alive: false, isElite: false, isBoss: false });
  ok(w.telemetry.furyBySource.kill > beforeKill, '撃破で kill 由来の闘気が入る');
  const out = w.applyIncomingDamage(50, { engaged: true });
  ok(out < 50, `軽減が効いている（50 → ${out.toFixed(2)}）`);
  ok(w.telemetry.furyBySource.mitigated > 0, '軽減量から mitigated 由来の闘気が入る');
  ok(w.telemetry.furyBySource.damageTaken > 0, '通ったダメージから damageTaken 由来の闘気が入る');
  ok(w.telemetry.mitigationAmount > 0, '軽減量が記録される');
}

// ===== 13. exposed（ボス体勢崩し中）の獲得増加 =====
section('13. ボス露出中は闘気獲得が増える');
{
  const boss = makeBoss();
  const { scene, w } = setup({ boss });
  const normal = w.addFury(4, 'meleeHit', 'n1');
  scene.advance(1000);
  w.bossPoise.exposedLeftMs = 4000;
  const exposed = w.addFury(4, 'meleeHit', 'e1');
  ok(exposed > normal, `露出中 ${exposed.toFixed(3)} > 通常 ${normal.toFixed(3)}`);
  ok(w.telemetry.exposedBonusFury > 0, 'exposedBonusFury が記録される');
}

T.finish();
