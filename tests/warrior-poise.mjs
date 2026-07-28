// 戦士 8/17: ノックバックと体勢崩し（M8-B §11・§12・§13）。Node.js 標準機能のみ。
// - 通常敵はノックバック、エリートは stagger、ボスは stance break → exposed という 3 段構え
// - ボスは常時ノックバックしない（無限ハメが成立しない）
// - 体勢ゲージは氷の frostbreak とは独立（別フィールド・別しきい値・別クールダウン）
// - 崩すたびにしきい値が上がり、上限で頭打ちになる
// 実行: node tests/warrior-poise.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc } from './warrior-common.mjs';

const T = runner('戦士 ノックバック・体勢崩し（M8-B）');
const { ok, section, info } = T;

const { WarriorCombatSystem } = await bootRuntime();
const P = DATA.balance.warrior.poise;

const setup = (opts = {}) => {
  const enemies = opts.enemies || makeEnemies(4, { hp: 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 5000 });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  return { scene, w, enemies };
};

// ===== 1. 設定値 =====
section('1. balance.json の warrior.poise が健全');
ok(P.elite.threshold > 0, `elite.threshold ${P.elite.threshold}`);
ok(P.elite.staggerMs > 0 && P.elite.immunityMs > P.elite.staggerMs, `stagger ${P.elite.staggerMs}ms < immunity ${P.elite.immunityMs}ms（ハメ防止）`);
ok(P.elite.slowFactor > 0 && P.elite.slowFactor <= 1, `elite.slowFactor ${P.elite.slowFactor} が (0,1]`);
ok(P.boss.threshold > P.elite.threshold, `boss.threshold ${P.boss.threshold} > elite ${P.elite.threshold}`);
ok(P.boss.exposedMs > 0 && P.boss.reactionMs > 0, 'boss の reaction / exposed が正');
ok(P.boss.thresholdGrowth > 1 && P.boss.thresholdMaxMult > 1, `崩すたびに難しくなる（growth ${P.boss.thresholdGrowth} / 上限×${P.boss.thresholdMaxMult}）`);
ok(P.boss.breakCooldownMs > 0, `breakCooldownMs ${P.boss.breakCooldownMs} > 0（連続崩しの防止）`);
ok(P.decayPerSec > 0, `decayPerSec ${P.decayPerSec} > 0（放置でゲージが戻る）`);

// ===== 2. 通常敵はノックバック =====
section('2. 通常敵はノックバックし、体勢ゲージを持たない');
{
  const { w, enemies } = setup();
  const e = enemies[0];
  const kb = w.resolveKnockback(e, 60);
  ok(kb.knockback > 0, `通常敵はノックバックする（${kb.knockback}）`);
  ok(kb.poiseBonus === 0, '通常敵には体勢変換がない');
  ok(w.telemetry.knockbacks === 1, 'ノックバック回数が記録される');
  ok(w.applyPoiseDamage(e, 999) === null, '通常敵に体勢ゲージは無い');
  ok((e._poise || 0) === 0, '_poise が増えない');
}

// ===== 3. エリートはノックバック軽減 → 体勢へ変換 =====
section('3. エリートはノックバックが大幅軽減され、主に体勢へ変換される');
{
  const { w } = setup({ enemies: makeEnemies(2, { elite: true, hp: 1e9 }) });
  const normal = setup();
  const e = { alive: true, isElite: true, _poise: 0, _poiseImmuneUntil: 0, _staggerUntil: 0 };
  const kbE = w.resolveKnockback(e, 100);
  const kbN = normal.w.resolveKnockback(normal.enemies[0], 100);
  ok(kbE.knockback < kbN.knockback, `エリートのノックバックは軽減される（${kbE.knockback} < ${kbN.knockback}）`);
  ok(kbE.poiseBonus > 0, `ノックバック分が体勢へ回る（${kbE.poiseBonus}）`);
}

// ===== 4. エリートの stagger =====
section('4. エリートはしきい値到達で stagger し、直後は免疫がつく');
{
  const { scene, w } = setup();
  const e = { alive: true, isElite: true, _poise: 0, _poiseImmuneUntil: 0, _staggerUntil: 0, _staggerSlow: 0 };
  const half = w.applyPoiseDamage(e, P.elite.threshold * 0.5);
  ok(half === null, 'しきい値未満では stagger しない');
  ok(e._poise > 0, '体勢ゲージが溜まる');
  const res = w.applyPoiseDamage(e, P.elite.threshold);
  ok(res && res.type === 'eliteStagger', 'しきい値到達で stagger');
  ok(e._poise === 0, 'ゲージがリセットされる');
  ok(e._staggerUntil > scene.time.now, '_staggerUntil が未来に設定される（Enemy が減速へ使う）');
  ok(e._staggerSlow > 0 && e._staggerSlow <= 1, `_staggerSlow ${e._staggerSlow} が減速率として設定される`);
  ok(e._poiseImmuneUntil > scene.time.now, '直後は体勢免疫がつく');
  ok(w.telemetry.eliteStaggers === 1, 'stagger 回数が記録される');
  // 免疫中は積み上がらない。
  ok(w.applyPoiseDamage(e, P.elite.threshold * 10) === null, '免疫中は削れない（連続 stagger のハメ防止）');
  ok(e._poise === 0, '免疫中はゲージも増えない');
  scene.advance(P.elite.immunityMs + 10);
  ok(w.applyPoiseDamage(e, P.elite.threshold) !== null, '免疫が切れれば再び崩せる');
}

// ===== 5. ボスは常時ノックバックしない =====
section('5. ボスはノックバックしない（押し続けてハメられない）');
{
  const boss = makeBoss();
  const { w } = setup({ boss });
  const kb = w.resolveKnockback(boss, 1000);
  ok(kb.knockback === 0, 'ボスのノックバック量は常に 0');
  ok(kb.poiseBonus === 0, 'ボスは knockback→poise 変換もしない（体勢は poiseDamage のみ）');
}

// ===== 6. ボスの stance break → exposed =====
section('6. ボスはしきい値到達で体勢崩し（行動中断 → 露出）');
{
  const boss = makeBoss({ state: 'telegraph' });
  const { scene, w } = setup({ boss });
  const th = w.bossPoiseThreshold();
  ok(Math.abs(th - P.boss.threshold) < 1e-9, `初回しきい値 ${th}`);
  ok(w.applyPoiseDamage(boss, th * 0.5) === null, 'しきい値未満では崩れない');
  ok(w.bossPoise.gauge > 0, 'ゲージが溜まる');
  const res = w.applyPoiseDamage(boss, th);
  ok(res && res.type === 'bossStanceBreak', '体勢崩しが発生');
  ok(boss._staggerCalls === 1, 'ボスへ applyPoiseStagger が呼ばれる（予告/突進の中断）');
  ok(boss.state === 'chase', '予告中でも中断されて chase へ戻る（frostbreak との差別化点）');
  ok(w.exposedActive, '露出状態になる');
  ok(w.bossPoise.exposedLeftMs === P.boss.exposedMs, `露出 ${P.boss.exposedMs}ms`);
  ok(w.telemetry.bossStanceBreaks === 1, '崩し回数が記録される');
  ok(w.bossPoise.gauge === 0, 'ゲージがリセットされる');
  // 露出中は近接ダメージ増加。
  const normalMult = w.meleeDamageMultiplier({ isBoss: false });
  const bossMult = w.meleeDamageMultiplier(boss);
  ok(bossMult > normalMult, `露出中のボスへの近接ダメージが増える（${normalMult.toFixed(3)} → ${bossMult.toFixed(3)}）`);
  // クールダウン中は再度崩せない。
  ok(w.applyPoiseDamage(boss, th * 10) === null, '崩し直後のクールダウン中は再度崩せない');
  scene.advance(P.boss.breakCooldownMs + 10);
  w.update(P.boss.breakCooldownMs + 10);
  ok(w.bossPoise.cooldownLeftMs === 0, 'クールダウンが明ける');
}

// ===== 7. しきい値の上昇と頭打ち =====
section('7. 崩すたびにしきい値が上がり、上限で頭打ちになる');
{
  const boss = makeBoss();
  const { scene, w } = setup({ boss });
  const thresholds = [];
  for (let i = 0; i < 12; i++) {
    thresholds.push(w.bossPoiseThreshold());
    w.bossPoise.cooldownLeftMs = 0;
    w.applyPoiseDamage(boss, w.bossPoiseThreshold());
    scene.advance(10);
  }
  let asc = true;
  for (let i = 1; i < 5; i++) if (thresholds[i] <= thresholds[i - 1]) asc = false;
  ok(asc, `序盤はしきい値が上がる（${thresholds.slice(0, 4).map((v) => Math.round(v)).join(' → ')}）`);
  const maxTh = P.boss.threshold * P.boss.thresholdMaxMult;
  ok(thresholds[thresholds.length - 1] <= maxTh + 1e-9, `上限 ${maxTh} で頭打ち（実際 ${Math.round(thresholds[thresholds.length - 1])}）`);
  ok(w.bossPoise.thresholdMult <= P.boss.thresholdMaxMult + 1e-9, `thresholdMult ${w.bossPoise.thresholdMult.toFixed(2)} ≤ ${P.boss.thresholdMaxMult}`);
  info(`崩し ${w.bossPoise.breaks} 回でしきい値 ${Math.round(thresholds[0])} → ${Math.round(thresholds[thresholds.length - 1])}`);
}

// ===== 8. ゲージの自然減衰 =====
section('8. 攻撃を止めるとボス体勢ゲージは減衰する');
{
  const boss = makeBoss();
  const { scene, w } = setup({ boss });
  w.applyPoiseDamage(boss, P.boss.threshold * 0.5);
  const before = w.bossPoise.gauge;
  for (let i = 0; i < 20; i++) { w.update(100); scene.advance(100); }
  ok(w.bossPoise.gauge < before, `2 秒放置でゲージが減る（${before.toFixed(1)} → ${w.bossPoise.gauge.toFixed(1)}）`);
  ok(Math.abs((before - w.bossPoise.gauge) - P.decayPerSec * 2) < 1e-6, `減衰量が decayPerSec × 2 秒（${P.decayPerSec * 2}）`);
}

// ===== 9. 露出は時間で必ず終わる =====
section('9. 露出は時間で必ず終わる（永続しない）');
{
  const boss = makeBoss();
  const { scene, w } = setup({ boss });
  w.applyPoiseDamage(boss, P.boss.threshold);
  ok(w.exposedActive, '露出開始');
  for (let i = 0; i < Math.ceil(P.boss.exposedMs / 100) + 2; i++) { w.update(100); scene.advance(100); }
  ok(!w.exposedActive, '時間経過で露出が終わる');
  ok(w.telemetry.exposedUptimeMs > 0, `露出時間が記録される（${w.telemetry.exposedUptimeMs}ms）`);
}

// ===== 10. frostbreak との独立 =====
section('10. 体勢（poise）は氷の frostbreak と独立している');
{
  const boss = makeBoss();
  const { w } = setup({ boss });
  boss._frostGauge = 500; boss._frostBreaks = 3;
  w.applyPoiseDamage(boss, P.boss.threshold * 0.5);
  ok(boss._frostGauge === 500, 'poise を削っても氷ゲージは変わらない');
  ok(boss._frostBreaks === 3, '氷砕回数も変わらない');
  ok(w.bossPoise.gauge > 0, '体勢ゲージは WarriorCombatSystem 側が持つ（Boss のフィールドを奪わない）');
  // Boss.js の実装上も別メソッド・別フィールド。
  const src = readSrc('src/entities/Boss.js');
  ok(/applyFrostStagger/.test(src) && /applyPoiseStagger/.test(src), 'Boss は frostStagger と poiseStagger を別メソッドで持つ');
  ok(/_frostStaggerUntil/.test(src) && /_poiseStaggerUntil/.test(src), '硬直の管理フィールドも別');
}

// ===== 11. ボス撃破 / 敵除去で状態が残らない =====
section('11. ボス撃破・敵のプール返却で体勢状態が残らない');
{
  const boss = makeBoss();
  const { w } = setup({ boss });
  w.applyPoiseDamage(boss, P.boss.threshold);
  ok(w.bossPoise.breaks === 1 && w.exposedActive, '崩し済み');
  w.onBossRemoved();
  ok(w.bossPoise.gauge === 0 && w.bossPoise.breaks === 0, 'ボス撃破で体勢状態がリセットされる');
  ok(!w.exposedActive, '露出も解除される');
  ok(w.bossPoise.thresholdMult === 1, 'しきい値倍率も戻る（次のボスへ持ち越さない）');

  const e = { alive: true, isElite: true, _poise: 50, _poiseImmuneUntil: 9e9, _staggerUntil: 9e9, _staggerSlow: 0.85 };
  w.onEnemyRemoved(e);
  ok(e._poise === 0 && e._poiseImmuneUntil === 0 && e._staggerUntil === 0 && e._staggerSlow === 0, 'プール返却で敵の体勢フィールドがクリアされる');
}

// ===== 12. 体勢削り倍率 =====
section('12. 体勢削りに passive / Job Lv / コンボ / 闘気解放の倍率が乗る');
{
  const a = setup();
  const b = setup({ mods: { poiseDamageMult: 2 } });
  const ea = { alive: true, isElite: true, _poise: 0, _poiseImmuneUntil: 0, _staggerUntil: 0 };
  const eb = { alive: true, isElite: true, _poise: 0, _poiseImmuneUntil: 0, _staggerUntil: 0 };
  a.w.applyPoiseDamage(ea, 10); b.w.applyPoiseDamage(eb, 10);
  ok(Math.abs(eb._poise - ea._poise * 2) < 1e-6, `poiseDamageMult=2 で削り量が 2 倍（${ea._poise} → ${eb._poise}）`);
  const c = setup();
  c.w.fury = DATA.balance.warrior.fury.max; c.w.startRelease();
  ok(c.w.poiseDamageMultiplier() > 1, '闘気解放中は体勢削りが増える');
}

T.finish();
