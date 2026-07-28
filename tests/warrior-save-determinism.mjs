// 戦士 13/17: 決定論（M8-B §18）。Node.js 標準機能のみ。
// 同じ seed・同じ入力列なら、戦士のランタイム（闘気/コンボ/体勢/ダメージ）が完全に一致すること、
// および保存 → 復元 → 続行が「途中で中断しなかった場合」と一致することを検証する。
// 実行: node tests/warrior-save-determinism.mjs

import { createHash } from 'node:crypto';
import { EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner } from './warrior-common.mjs';

const T = runner('戦士 決定論（M8-B）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();

const build = (opts = {}) => {
  const enemies = makeEnemies(opts.n || 12, { x: 316, y: 300, dy: 3, hp: opts.hp || 4000, elite: !!opts.elite });
  const scene = makeScene({ enemies, boss: opts.boss ? makeBoss() : null, now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  for (const id of (opts.skills || EXPECTED.actives)) { sm.acquireOrLevel(id); if (EXPECTED.actives.includes(id)) sm.setLevel(id, 8); }
  return { scene, w, sm, enemies };
};
const step = (ctx, ms = 16) => {
  ctx.sm.update(ms, { hasEnemies: true });
  ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
  ctx.w.update(ms);
  ctx.scene.advance(ms);
};
// 状態の指紋（浮動小数は丸めずそのまま文字列化する）。
const fingerprint = (ctx) => {
  const stats = ctx.sm.statsList().map((s) => `${s.id}:${s.casts}:${s.hits}:${s.damage}`).join('|');
  const w = ctx.w;
  const enemies = ctx.enemies.map((e) => `${e.hp}:${e._poise}:${e._staggerUntil}:${e._kb}`).join(',');
  return createHash('sha256').update([
    stats, enemies,
    w.fury, w.combo, w.comboGraceLeftMs, w.releaseLeftMs,
    JSON.stringify(w.bossPoise), JSON.stringify(w.unyielding),
    JSON.stringify(w.telemetry.furyBySource), w.telemetry.poiseDamage, w.telemetry.physicalDamage,
  ].join('\n')).digest('hex');
};

// ===== 1. 同一入力で完全一致 =====
section('1. 同じ初期条件・同じ入力列で状態が完全一致する');
{
  const runs = [];
  for (let r = 0; r < 3; r++) {
    const ctx = build({ boss: true, elite: true, mods: { killHealMult: 1 } });
    for (let i = 0; i < 600; i++) step(ctx);
    runs.push(fingerprint(ctx));
  }
  ok(runs[0] === runs[1] && runs[1] === runs[2], `3 回の実行がすべて同一（${runs[0].slice(0, 16)}…）`);
  info(`ランタイム指紋: ${runs[0]}`);
}

// ===== 2. dt の分割で結果が変わらない（同じ総時間）=====
section('2. フレーム時間の合計が同じなら、闘気・コンボの上限判定が壊れない');
{
  const a = build();
  for (let i = 0; i < 300; i++) step(a, 16);
  const b = build();
  for (let i = 0; i < 150; i++) step(b, 32);
  // 打撃タイミングが変わるため完全一致は求めないが、上限は両方で守られる。
  const cap = 6; // fury.maxGainPerCast
  ok(a.w.fury <= 100 && b.w.fury <= 100, '両方とも闘気が上限内');
  ok(a.w.telemetry.furyOvercap >= 0 && b.w.telemetry.furyOvercap >= 0, 'overcap が非負');
  void cap;
}

// ===== 3. 保存 → 復元 → 続行が中断なしと一致 =====
// 遅延実行中の打撃（delayedCall）は production でも保存対象外のため、
// ここでは「WarriorCombatSystem の状態そのもの」が往復して同じ続きを辿ることを検証する。
section('3. 闘気・コンボ・体勢の状態は保存 → 復元 → 続行で中断なしと一致する');
{
  // 固定スクリプト（時間・命中・撃破・被弾・体勢削りの決まった列）。
  // 中断点は「戦闘が途切れた瞬間」に置く（2 秒の無入力）。cast 予算・同一敵記録・毎秒窓は
  // 意図的に復元しない設計のため、それらが影響しない静止点でのみ完全一致を要求できる。
  const partA = [], idle = [], partB = [];
  for (let i = 0; i < 200; i++) {
    partA.push(['tick', 16]);
    if (i % 3 === 0) partA.push(['hit', `a#${Math.floor(i / 3)}`, i % 7]);
    if (i % 11 === 0) partA.push(['poise', 40]);
    if (i % 17 === 0) partA.push(['damage', 12]);
    if (i % 23 === 0) partA.push(['kill']);
  }
  for (let i = 0; i < 125; i++) idle.push(['tick', 16]); // 2 秒の無入力（窓・予算が自然に閉じる）
  for (let i = 0; i < 200; i++) {
    partB.push(['tick', 16]);
    if (i % 3 === 0) partB.push(['hit', `b#${Math.floor(i / 3)}`, i % 7]);
    if (i % 11 === 0) partB.push(['poise', 40]);
    if (i % 17 === 0) partB.push(['damage', 12]);
    if (i % 23 === 0) partB.push(['kill']);
  }
  const script = [...partA, ...idle, ...partB];
  const makeRig = () => {
    const boss = makeBoss();
    const enemies = makeEnemies(8, { elite: true, hp: 1e9 });
    const scene = makeScene({ enemies, boss, now: 10000 });
    const w = makeWarrior(WarriorCombatSystem, scene, { mods: { killHealMult: 1 } });
    w.setHp(scene.player.hp, scene.player.maxHp);
    return { scene, w, enemies, boss };
  };
  const apply = (rig, op) => {
    const [kind, a, b] = op;
    if (kind === 'tick') { rig.w.setHp(rig.scene.player.hp, rig.scene.player.maxHp); rig.w.update(a); rig.scene.advance(a); }
    else if (kind === 'hit') rig.w.noteMeleeHit({ castKey: a, target: rig.enemies[b], damage: 30, comboGain: 1, furyGain: 1 });
    else if (kind === 'poise') rig.w.applyPoiseDamage(rig.boss, a);
    else if (kind === 'damage') { const out = rig.w.applyIncomingDamage(a, { engaged: true }); rig.scene.player.hp = Math.max(1, rig.scene.player.hp - out); }
    else if (kind === 'kill') rig.w.noteKill({ alive: false, isElite: false, isBoss: false });
  };
  const wf = (w) => createHash('sha256').update([
    w.fury, w.combo, w.comboGraceLeftMs, w.releaseLeftMs,
    JSON.stringify(w.recovery), JSON.stringify(w.unyielding), JSON.stringify(w.bossPoise),
    JSON.stringify(w.telemetry.furyBySource), w.telemetry.poiseDamage, w.telemetry.physicalDamage,
    w.telemetry.comboPeak, w.telemetry.killHeal, w.telemetry.mitigationAmount,
  ].join('|')).digest('hex');

  const straight = makeRig();
  for (const op of script) apply(straight, op);
  const target = wf(straight.w);

  const half = partA.length + idle.length; // 静止点で中断する
  const first = makeRig();
  for (let i = 0; i < half; i++) apply(first, script[i]);
  const snap = JSON.parse(JSON.stringify(first.w.serialize()));
  const hpAt = first.scene.player.hp;
  const nowAt = first.scene.time.now;

  const resumed = makeRig();
  resumed.scene.advance(nowAt - resumed.scene.time.now);
  resumed.scene.player.hp = hpAt;
  resumed.w.restore(snap);
  resumed.w.setHp(hpAt, resumed.scene.player.maxHp);
  for (let i = half; i < script.length; i++) apply(resumed, script[i]);
  const got = wf(resumed.w);
  ok(got === target, `中断あり / なしで戦士の状態が一致（${got.slice(0, 16)}… vs ${target.slice(0, 16)}…）`);
  info(`スクリプト ${script.length} 手を ${half} 手で中断・復元して一致`);
}

// ===== 4. 乱数を使っていない（同じ入力で必ず同じ）=====
section('4. 戦士のロジックが乱数に依存しない');
{
  // Math.random を壊しても結果が変わらないこと（戦士側が使っていない証明）。
  const real = Math.random;
  const a = build({ boss: true });
  for (let i = 0; i < 300; i++) step(a);
  const fa = fingerprint(a);
  Math.random = () => 0.999999;
  const b = build({ boss: true });
  for (let i = 0; i < 300; i++) step(b);
  const fb = fingerprint(b);
  Math.random = real;
  ok(fa === fb, 'Math.random を差し替えても結果が変わらない');
}

// ===== 5. 進化でも決定論 =====
section('5. 進化3種でも決定論が保たれる');
{
  const runs = [];
  for (let r = 0; r < 2; r++) {
    const ctx = build({ boss: true, elite: true, skills: EXPECTED.evolutions });
    for (let i = 0; i < 600; i++) step(ctx);
    runs.push(fingerprint(ctx));
  }
  ok(runs[0] === runs[1], `進化3種の実行が一致（${runs[0].slice(0, 16)}…）`);
  info(`進化ランタイム指紋: ${runs[0]}`);
}

T.finish();
