// 戦士 Wave1 17/19: 後始末・リーク防止（M8-C §20）。Node.js 標準機能のみ。
// Wave1 は「進行中の状態」を持つスキルが多いので、後始末を個別に固定する。
//   - 15 スキルすべてが destroy を実装し、破棄後に遅延処理・進行中処理が動かない
//   - 反撃の構え・戦吼バフが破棄 / リセットで必ず消える
//   - 敵のプール返却で参照が残らない（引き寄せ・処刑・連撃の対象を保持しない）
//   - Enemy.reset() が Wave1 で増えたフィールド（引き寄せ・体勢・スタッガー）を戻す
//   - 長時間プレイでも内部 Map が伸び続けない
// 実行: node tests/warrior-wave1-cleanup.mjs

import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc, registryMap, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 Wave1 後始末・リーク防止（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const WAVE1 = [...EXPECTED.wave1Actives, ...EXPECTED.wave1Evolutions];
const SKILL = (id) => DATA.skills.find((x) => x.id === id);

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 330, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
    if (i % 25 === 12) ctx.scene.onWarriorHit(60, 40);
  }
};

// ===== 1. 全スキルが destroy を実装 =====
section('1. Wave1 の 15 スキルすべてが destroy と破棄ガードを持つ');
{
  const map = registryMap();
  for (const id of WAVE1) {
    const src = skillSourceDeep(id, map) || '';
    ok(/destroy\s*\(\s*\)\s*\{/.test(src), `${id}: destroy を実装する`);
    ok(/_dead\s*=\s*true/.test(src), `${id}: 破棄フラグ _dead を立てる`);
    ok(/this\._dead\s*\|\|/.test(src) || !/delayedCall/.test(src), `${id}: 遅延処理に破棄ガードがある`);
  }
}

// ===== 2. 破棄後に遅延打撃・進行中処理が走らない =====
section('2. 破棄後に遅延打撃・進行中の効果が一切動かない');
for (const id of WAVE1) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  if (SKILL(id)) ctx.sm.setLevel(id, 8);
  run(ctx, 1000);
  const sk = ctx.sm.skills.get(id);
  const before = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === id).length;
  // production と同じ手順: destroy → SkillManager から外す → 以降フレームを回し続ける。
  sk.destroy();
  ctx.sm.skills.delete(id);
  ctx.scene.advance(5000);            // 保留中の遅延処理をすべて発火させる
  run(ctx, 5000);                     // その後もフレームを回す
  const after = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === id).length;
  ok(after === before, `${id}: 破棄後に追加の打撃が発生しない（${before} → ${after}）`);
  ok(Number.isFinite(ctx.scene.player.x), `${id}: 破棄後も座標が壊れない`);
}

// ===== 3. 進行中の状態が破棄で消える =====
section('3. 破棄で進行中の状態（跳躍 / 進軍 / 鎖鉤 / 連撃 / 構え）が消える');
{
  const ONGOING = {
    leap_smash: '_leap', heaven_crushing_descent: '_leap',
    sweeping_advance: '_sweep', chain_hook: '_hook', relentless_combo: '_combo',
  };
  for (const [id, field] of Object.entries(ONGOING)) {
    const ctx = build();
    ctx.sm.acquireOrLevel(id);
    if (SKILL(id)) ctx.sm.setLevel(id, 8);
    const sk = ctx.sm.skills.get(id);
    sk.fire();
    sk.update(16, { hasEnemies: true });
    ok(!!sk[field], `${id}: 進行中の状態がある`);
    sk.destroy();
    ok(!sk[field], `${id}: destroy で ${field} が消える`);
  }
  // 構え系。
  for (const id of ['counter_stance', 'adamant_counter']) {
    const ctx = build();
    ctx.sm.acquireOrLevel(id);
    if (SKILL(id)) ctx.sm.setLevel(id, 8);
    const sk = ctx.sm.skills.get(id);
    sk.fire();
    ok(!!ctx.w.counterWindowOf(id), `${id}: 構えが開いている`);
    sk.destroy();
    ok(!ctx.w.counterWindowOf(id), `${id}: destroy で構えが閉じる`);
    ok(sk.activeMitigation() === 0, `${id}: destroy 後は軽減も 0`);
  }
}

// ===== 4. SkillManager.destroy でまとめて止まる =====
section('4. SkillManager.destroy で Wave1 の全スキルが止まる');
{
  const ctx = build();
  for (const id of WAVE1) { ctx.sm.acquireOrLevel(id); if (SKILL(id)) ctx.sm.setLevel(id, 8); }
  run(ctx, 8000);
  const before = ctx.scene.calls.filter((c) => c[0] === 'melee').length;
  ctx.sm.destroy();
  ctx.scene.advance(8000);
  const after = ctx.scene.calls.filter((c) => c[0] === 'melee').length;
  ok(after === before, `破棄後は打撃が発生しない（${before} → ${after}）`);
  ok(ctx.sm.skills.size === 0, 'スキル一覧が空になる');
  ok(ctx.w.counterWindows.size === 0, '反撃の構えも残らない');
}

// ===== 5. WarriorCombatSystem.destroy / reset =====
section('5. WarriorCombatSystem の destroy / reset で Wave1 の状態がすべて消える');
{
  const boss = makeBoss();
  const ctx = build({ boss, mods: { killHealMult: 1 } });
  for (const id of WAVE1) { ctx.sm.acquireOrLevel(id); if (SKILL(id)) ctx.sm.setLevel(id, 8); }
  run(ctx, 8000);
  ctx.w.applyWarCryBuff({ durationMs: 6000, meleeDamageBonus: 0.2 });
  ctx.w.beginCounterWindow('counter_stance', { durationMs: 3000, maxCounters: 2, priority: 1 });
  ok(ctx.w.warCry.leftMs > 0 && ctx.w.counterWindows.size > 0, '破棄前はバフ・構えがある');

  ctx.w.destroy();
  ok(ctx.w.warCry.leftMs === 0, 'destroy で戦吼バフが消える');
  ok(ctx.w.counterWindows.size === 0, 'destroy で構えが消える');
  ok(ctx.w._castBudgets.size === 0, 'cast 予算 Map が空');
  ok(ctx.w._targetHitAt.size === 0, '敵参照 Map が空');

  // reset（周回リセット）でも同じ。
  const ctx2 = build({ boss: makeBoss() });
  ctx2.w.applyWarCryBuff({ durationMs: 6000, meleeDamageBonus: 0.2 });
  ctx2.w.beginCounterWindow('adamant_counter', { durationMs: 3000, maxCounters: 3, priority: 3 });
  ctx2.w.consumeCounterEvent();
  ctx2.w.noteExecute(true, 10);
  ctx2.w.noteMovement('chainPull', 100);
  ctx2.w.reset();
  ok(ctx2.w.warCry.leftMs === 0, 'reset で戦吼バフが消える');
  ok(ctx2.w.counterWindows.size === 0, 'reset で構えが消える');
  ok(ctx2.w.telemetry.executions === 0 && ctx2.w.telemetry.counters === 0, 'reset で Wave1 のテレメトリも 0');
  ok(ctx2.w.telemetry.chainPulls === 0 && ctx2.w.telemetry.leapLandings === 0, 'reset で移動系テレメトリも 0');
}

// ===== 6. 敵のプール返却で参照が残らない =====
section('6. 敵のプール返却・撃破で Wave1 の敵参照が残らない');
{
  const ctx = build({ enemies: makeEnemies(24, { x: 330, y: 300, dy: 2, hp: 1e9 }) });
  for (const id of WAVE1) { ctx.sm.acquireOrLevel(id); if (SKILL(id)) ctx.sm.setLevel(id, 8); }
  run(ctx, 8000);
  ok(ctx.w._targetHitAt.size > 0, '命中で敵参照が入る');
  for (const e of ctx.enemies) ctx.w.onEnemyRemoved(e);
  ok(ctx.w._targetHitAt.size === 0, 'すべて返却すると参照が空になる');
  for (const e of ctx.enemies) {
    ok(e._poise === 0 && e._poiseImmuneUntil === 0 && e._staggerUntil === 0 && e._staggerSlow === 0,
      '敵の体勢フィールドがクリアされる');
  }
  // 引き寄せ・連撃が保持するのは _seq（数値）だけで、スキル側に敵オブジェクトが残らない。
  for (const id of ['chain_hook', 'relentless_combo']) {
    const sk = ctx.sm.skills.get(id);
    const s = JSON.stringify(sk.serializeState());
    ok(!/alive|maxHp|applyKnockback/.test(s), `${id}: 保存に敵オブジェクトが混ざらない`);
  }
}

// ===== 7. Enemy.reset が Wave1 の残留を戻す =====
section('7. Enemy.reset が引き寄せ・体勢・スタッガー・目印の残留を戻す');
{
  const src = readSrc('src/entities/Enemy.js');
  const i = src.indexOf('  reset(');
  ok(i > 0, 'Enemy.reset がある');
  const body = src.slice(i, src.indexOf('\n  }', i));
  for (const f of ['_poise', '_poiseImmuneUntil', '_staggerUntil', '_staggerSlow']) {
    ok(body.includes(f), `reset が ${f} を戻す（体勢・スタッガーの残留なし）`);
  }
  ok(/_knockback/.test(body) || /setVelocity/.test(body), 'reset が押し引きの慣性を戻す');
  // 引き寄せ側でも慣性を残さない。
  const bs = readSrc('src/scenes/BattleScene.js');
  const pi = bs.indexOf('  pullTarget(e, opts = {}) {');
  const pbody = bs.slice(pi, bs.indexOf('\n  }\n', pi));
  ok(/setVelocity/.test(pbody), 'pullTarget が引き寄せ直後の速度を 0 にする');
  ok(/_knockback/.test(pbody), 'pullTarget がノックバックの残留も消す');
}

// ===== 8. BattleScene.cleanup / 検証周回のリセット =====
section('8. BattleScene の後始末が Wave1 でも変わらず働く');
{
  const src = readSrc('src/scenes/BattleScene.js');
  const start = src.indexOf('  cleanup() {');
  ok(start > 0, 'BattleScene.cleanup がある');
  const body = src.slice(start, src.indexOf('\n  }', start));
  ok(/this\.warrior\.destroy\(\)/.test(body), 'cleanup が warrior.destroy() を呼ぶ');
  ok(/_inWarriorCounter/.test(src), '反撃の再入ガードがある（cleanup 後に残らない）');
  ok(/onRelease:.*warrior\.onEnemyRemoved/.test(src), '敵プールの onRelease で参照を落とす');
  const bp = src.indexOf('startBalancePlaytest(cfg) {');
  const bpBody = src.slice(bp, src.indexOf('\n  }\n', bp));
  ok(/this\.warrior\.reset\(\)/.test(bpBody), '検証周回の開始で warrior.reset() を呼ぶ');
}

// ===== 9. 長時間プレイでも Map が伸びない =====
section('9. Wave1 を全部持って長時間回しても内部 Map が伸び続けない');
{
  const ctx = build({ enemies: makeEnemies(40, { x: 330, y: 300, dy: 2, hp: 400 }), mods: { killHealMult: 1 } });
  for (const id of WAVE1) { ctx.sm.acquireOrLevel(id); if (SKILL(id)) ctx.sm.setLevel(id, 8); }
  run(ctx, 60000);
  ok(ctx.w._castBudgets.size <= 60, `cast 予算 Map ${ctx.w._castBudgets.size} ≤ 60`);
  ok(ctx.w._targetHitAt.size <= 200, `敵参照 Map ${ctx.w._targetHitAt.size} ≤ 200`);
  ok(ctx.w.counterWindows.size <= 3, `構えの登録 ${ctx.w.counterWindows.size} ≤ 3（反撃系統の数）`);
  ok(ctx.scene.pendingTimers() <= 40, `保留中の遅延処理 ${ctx.scene.pendingTimers()} ≤ 40`);
  ok(Object.keys(ctx.scene._warriorSkillStats).length <= WAVE1.length + 4,
    `スキル別統計 ${Object.keys(ctx.scene._warriorSkillStats).length} 件（スキル数ぶんで止まる）`);
  info(`60 秒: castBudgets ${ctx.w._castBudgets.size} / targetHitAt ${ctx.w._targetHitAt.size} / timers ${ctx.scene.pendingTimers()}`);
}

// ===== 10. 破棄 → 再構築を繰り返しても壊れない =====
section('10. 破棄 → 再構築を 30 回繰り返しても状態が漏れない');
{
  let threw = null;
  let last = null;
  try {
    for (let i = 0; i < 30; i++) {
      const ctx = build();
      for (const id of WAVE1) { ctx.sm.acquireOrLevel(id); if (SKILL(id)) ctx.sm.setLevel(id, 8); }
      run(ctx, 2000);
      ctx.sm.destroy();
      ctx.w.destroy();
      last = ctx;
    }
  } catch (e) { threw = e; }
  ok(!threw, `例外なし（${threw ? threw.message : 'ok'}）`);
  ok(last && last.w.counterWindows.size === 0, '最後の実体にも構えが残らない');
  ok(last && last.w.warCry.leftMs === 0, '最後の実体にもバフが残らない');
}

T.finish();
