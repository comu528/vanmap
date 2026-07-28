// 戦士 15/17: 後始末・リーク防止（M8-B §21）。Node.js 標準機能のみ。
// - Scene 終了 / 周回終了 / 敵のプール返却で戦士側の参照が残らないこと
// - 8 スキルすべてが destroy を実装し、破棄後に遅延処理が動かないこと
// - HUD が destroy で Text/Graphics を破棄すること
// - 内部 Map が無制限に伸びないこと
// 実行: node tests/warrior-cleanup.mjs

import { EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc, registryMap, skillSource } from './warrior-common.mjs';

const T = runner('戦士 後始末・リーク防止（M8-B）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ALL = [...EXPECTED.actives, ...EXPECTED.evolutions];

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 316, y: 300, dy: 3, hp: 1e9 });
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
  }
};

// ===== 1. 全スキルが destroy を実装 =====
section('1. active5 + evolution3 すべてが destroy を実装する');
{
  const map = registryMap();
  for (const id of ALL) {
    const src = skillSource(id, map) || '';
    ok(/destroy\s*\(\s*\)\s*\{/.test(src), `${id}: destroy を実装する`);
    ok(/_dead\s*=\s*true/.test(src), `${id}: 破棄フラグ _dead を立てる`);
    ok(/this\._dead\s*\|\|/.test(src) || !/delayedCall/.test(src), `${id}: 遅延処理に破棄ガードがある`);
  }
}

// ===== 2. 破棄後に遅延処理が走らない =====
section('2. 破棄後の遅延打撃が実行されない');
for (const id of ALL) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  if (EXPECTED.actives.includes(id)) ctx.sm.setLevel(id, 8);
  run(ctx, 200);
  const sk = ctx.sm.skills.get(id);
  const before = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === id).length;
  sk.destroy();
  ctx.scene.advance(3000); // 保留中の delayedCall をすべて発火させる
  const after = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === id).length;
  ok(after === before, `${id}: 破棄後に追加の打撃が発生しない（${before} → ${after}）`);
}

// ===== 3. SkillManager.destroy でまとめて破棄 =====
section('3. SkillManager.destroy で全スキルが破棄され、遅延処理も止まる');
{
  const ctx = build();
  for (const id of ALL) ctx.sm.acquireOrLevel(id);
  run(ctx, 3000);
  const before = ctx.scene.calls.filter((c) => c[0] === 'melee').length;
  ctx.sm.destroy();
  ctx.scene.advance(5000);
  const after = ctx.scene.calls.filter((c) => c[0] === 'melee').length;
  ok(after === before, `SkillManager 破棄後は打撃が発生しない（${before} → ${after}）`);
  ok(ctx.sm.skills.size === 0, 'スキル一覧が空になる');
}

// ===== 4. WarriorCombatSystem.destroy =====
section('4. WarriorCombatSystem.destroy で参照・進行中の効果が残らない');
{
  const boss = makeBoss();
  const ctx = build({ boss, mods: { killHealMult: 1 } });
  for (const id of EXPECTED.actives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 4000);
  ctx.w.fury = 100; ctx.w.startRelease();
  ctx.w.checkUnyielding();
  ctx.w.applyPoiseDamage(boss, 400);
  ok(ctx.w._castBudgets.size > 0 || ctx.w._targetHitAt.size > 0, '破棄前は内部 Map に参照がある');
  ctx.w.destroy();
  ok(ctx.w._castBudgets.size === 0, 'cast 予算 Map が空になる');
  ok(ctx.w._targetHitAt.size === 0, '敵参照 Map が空になる（死んだ敵オブジェクトを保持しない）');
  ok(ctx.w.releaseLeftMs === 0, '闘気解放が止まる');
  ok(ctx.w.recovery.leftMs === 0 && ctx.w.recovery.remainAmount === 0, '回復予約が消える');
  ok(ctx.w.unyielding.activeLeftMs === 0 && ctx.w.unyielding.healLeftMs === 0, '不屈の進行が止まる');
  ok(ctx.w.bossPoise.exposedLeftMs === 0 && ctx.w.bossPoise.reactionLeftMs === 0, 'ボス露出/反応が消える');
  // 破棄後の update で回復コールバックが呼ばれない。
  const hp = ctx.scene.player.hp;
  ctx.w.recovery = { leftMs: 1000, totalMs: 1000, remainAmount: 50 };
  ctx.w.update(500);
  ok(ctx.scene.player.hp === hp, '破棄後は heal コールバックが呼ばれない');
}

// ===== 5. 敵のプール返却で参照が落ちる =====
section('5. 敵のプール返却・撃破で敵参照が残らない');
{
  const ctx = build();
  for (const id of EXPECTED.actives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 2000);
  ok(ctx.w._targetHitAt.size > 0, '命中で敵参照が入る');
  for (const e of ctx.enemies) ctx.w.onEnemyRemoved(e);
  ok(ctx.w._targetHitAt.size === 0, 'すべて返却すると参照が空になる');
  for (const e of ctx.enemies) {
    ok(e._poise === 0 && e._poiseImmuneUntil === 0 && e._staggerUntil === 0 && e._staggerSlow === 0, '敵の体勢フィールドがクリアされる');
  }
}

// ===== 6. 内部 Map が無制限に伸びない =====
section('6. 内部 Map が無制限に伸びない（長時間プレイでのリーク防止）');
{
  const ctx = build();
  for (let i = 0; i < 5000; i++) ctx.w.addFury(0.01, 'meleeHit', `cast#${i}`);
  ok(ctx.w._castBudgets.size <= 60, `cast 予算 Map ${ctx.w._castBudgets.size} ≤ 60（間引きが効いている）`);
  const many = makeEnemies(500, { hp: 1e9 });
  for (let i = 0; i < many.length; i++) { ctx.w.addCombo(1, `c${i}`, many[i]); ctx.scene.advance(300); }
  ok(ctx.w._targetHitAt.size <= 200, `敵参照 Map ${ctx.w._targetHitAt.size} ≤ 200（上限で一掃される）`);
  info(`castBudgets ${ctx.w._castBudgets.size} / targetHitAt ${ctx.w._targetHitAt.size}`);
}

// ===== 7. BattleScene.cleanup の呼び出し =====
section('7. BattleScene.cleanup が戦士システム・HUD・デバッグを破棄する');
{
  const src = readSrc('src/scenes/BattleScene.js');
  const start = src.indexOf('  cleanup() {');
  ok(start > 0, 'BattleScene.cleanup がある');
  const body = src.slice(start, src.indexOf('\n  }', start));
  ok(/this\.warrior\.destroy\(\)/.test(body), 'cleanup が warrior.destroy() を呼ぶ');
  ok(/warriorHud/.test(body) && /destroy/.test(body), 'cleanup が warriorHud を破棄する');
  ok(/_wardbg/.test(body), 'cleanup が戦士デバッグパネルを破棄する');
  // 敵のプール返却フックでも参照を落とす。
  ok(/onRelease:.*warrior\.onEnemyRemoved/.test(src), '敵プールの onRelease で warrior.onEnemyRemoved を呼ぶ');
  ok(/onBossRemoved/.test(src), 'ボス撃破で onBossRemoved を呼ぶ');
}

// ===== 8. HUD の破棄 =====
section('8. WarriorHud.destroy が表示要素を破棄する');
{
  const src = readSrc('src/ui/WarriorHud.js');
  ok(/destroy\s*\(\s*\)\s*\{/.test(src), 'WarriorHud に destroy がある');
  const start = src.indexOf('  destroy() {');
  const body = src.slice(start, start + 400);
  ok(/o\.destroy\(\)/.test(body), '各表示要素を destroy する');
  ok(/this\.container\.destroy\(\)/.test(body), 'コンテナも destroy する');
  ok(/this\._all\s*=\s*\[\]/.test(body), '参照配列を空にする');
}

// ===== 9. 周回リセット（F8 検証開始）=====
section('9. 検証周回の開始で戦士のランタイムがリセットされる');
{
  const src = readSrc('src/scenes/BattleScene.js');
  const start = src.indexOf('startBalancePlaytest(cfg) {');
  const body = src.slice(start, src.indexOf('\n  }\n', start));
  ok(/this\.warrior\.reset\(\)/.test(body), '検証開始で warrior.reset() を呼ぶ');
  ok(/_warriorSkillStats\s*=\s*null/.test(body), 'スキル別統計もリセットする');
}

// ===== 10. reset で全状態が初期化される =====
section('10. WarriorCombatSystem.reset で周回状態がすべて初期化される');
{
  const boss = makeBoss();
  const ctx = build({ boss });
  ctx.w.fury = 80; ctx.w.combo = 50;
  ctx.w.startRelease();
  ctx.w.unyielding.cooldownLeftMs = 1000; ctx.w.unyielding.triggers = 2;
  ctx.w.applyPoiseDamage(boss, 100);
  ctx.w.reset();
  ok(ctx.w.fury === 0 && ctx.w.combo === 0, '闘気・コンボが 0');
  ok(ctx.w.releaseLeftMs === 0, '解放が止まる');
  ok(ctx.w.unyielding.triggers === 0 && ctx.w.unyielding.cooldownLeftMs === 0, '不屈がリセットされる');
  ok(ctx.w.bossPoise.gauge === 0 && ctx.w.bossPoise.breaks === 0 && ctx.w.bossPoise.thresholdMult === 1, 'ボス体勢がリセットされる');
  ok(ctx.w.telemetry.meleeHits === 0 && ctx.w.telemetry.furyGained === 0, 'テレメトリもリセットされる');
  ok(ctx.w._castBudgets.size === 0 && ctx.w._targetHitAt.size === 0, '内部 Map が空');
}

T.finish();
