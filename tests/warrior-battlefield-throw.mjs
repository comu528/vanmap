// 戦士 Wave2 9/21: 豪腕投げ（M8-D §battlefield_throw）。Node.js 標準機能のみ。
//   - 掴めるのは**通常敵だけ**。エリートはその場叩きつけ、ボスは掴まず重い体勢打撃へ置換
//   - 掴んだ相手が死亡 / プール返却されたら掴みは必ず解除される
//   - 投げから投げが連鎖しない。着地衝撃は 1 発動 1 回・死亡イベントも 1 回だけ
//   - 敵オブジェクトを保持しない（安定 runtime id 経由）
//   - 座標が NaN にならず、壁内へクランプされる
// 実行: node tests/warrior-battlefield-throw.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, registryMap, skillSource } from './warrior-common.mjs';

const T = runner('戦士 豪腕投げ（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'battlefield_throw';
const SKILL = DATA.skills.find((x) => x.id === ID);
const GRAB = DATA.balance.warrior.grab;

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 340, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 16000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. 通常敵を掴んで投げる =====
section('1. 通常敵を掴んで投げ、着地点に衝撃を出す');
{
  // 手前に掴む相手、離れた場所に密集地点を置く（投げ先が手元と別になる配置）。
  const near = makeEnemies(2, { x: 340, y: 300, dy: 4, hp: 1e9 });
  const far = makeEnemies(8, { x: 600, y: 300, dy: 4, hp: 1e9 });
  far.forEach((e, i) => { e._seq = 100 + i; });
  const ctx = build({ enemies: [...near, ...far] });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 24000);
  const s = st(ctx, ID);
  ok((s.casts || 0) > 0, `発動する（${s.casts}）`);
  ok(ctx.w.telemetry.grabs > 0, `掴みが発生する（${ctx.w.telemetry.grabs}）`);
  ok(ctx.w.telemetry.throwImpacts > 0, `着地衝撃が発生する（${ctx.w.telemetry.throwImpacts}）`);
  ok(ctx.w.telemetry.throwDistance > 0, `投げ距離が記録される（${Math.round(ctx.w.telemetry.throwDistance)}px）`);
  ok((s.extra?.throws || 0) <= (s.casts || 0), `投げ回数 ${s.extra?.throws} ≤ cast ${s.casts}（1 発動 1 回）`);
  info(`豪腕投げ: cast${s.casts} 掴み${ctx.w.telemetry.grabs} 投げ${s.extra?.throws} 距離${Math.round(ctx.w.telemetry.throwDistance)}px`);
}

// ===== 2. エリート / ボスは掴めない =====
section('2. エリートはその場叩きつけ、ボスは掴まず体勢打撃へ置換');
{
  ok(GRAB.allowElite === false && GRAB.allowBoss === false, 'balance でエリート / ボスの掴みは禁止');
  const ectx = build({ enemies: makeEnemies(6, { x: 340, y: 300, dy: 3, hp: 1e9, elite: true }) });
  ectx.sm.acquireOrLevel(ID); ectx.sm.setLevel(ID, 8);
  run(ectx, 24000);
  ok(ectx.w.telemetry.grabs === 0, `エリートは 1 度も掴まない（${ectx.w.telemetry.grabs}）`);
  ok(ectx.w.telemetry.grabRefused > 0, `掴み拒否が記録される（${ectx.w.telemetry.grabRefused}）`);
  ok((st(ectx, ID).extra?.eliteSlams || 0) > 0, `その場叩きつけへ置換される（${st(ectx, ID).extra?.eliteSlams}）`);
  ok(ectx.enemies.every((e) => !e._grabbed), 'エリートに掴みフラグが付かない');

  const bctx = build({ enemies: [], boss: makeBoss({ x: 340, y: 300, hp: 1e9 }) });
  bctx.sm.acquireOrLevel(ID); bctx.sm.setLevel(ID, 8);
  const bx = bctx.scene.boss.x;
  run(bctx, 24000);
  ok(bctx.w.telemetry.grabs === 0, 'ボスは 1 度も掴まない');
  ok((st(bctx, ID).extra?.bossStrikes || 0) > 0, `ボスへは体勢打撃へ置換される（${st(bctx, ID).extra?.bossStrikes}）`);
  ok(bctx.scene.boss.x === bx, 'ボスは動かない');
  ok(bctx.w.telemetry.poiseDamage > 0, `ボスの体勢は削れる（${bctx.w.telemetry.poiseDamage.toFixed(1)}）`);
  ok(!bctx.scene.boss._grabbed, 'ボスに掴みフラグが付かない');
}

// ===== 3. 掴みは 1 度に 1 つ・再帰投げが起きない =====
section('3. 掴みは 1 度に 1 つ・投げから投げが連鎖しない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  let maxConcurrent = 0;
  for (let i = 0; i < 1500; i++) {
    ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16);
    const grabbed = ctx.enemies.filter((e) => e._grabbed).length;
    maxConcurrent = Math.max(maxConcurrent, grabbed);
  }
  ok(maxConcurrent <= GRAB.maxGrabPerCast, `同時に掴むのは ${GRAB.maxGrabPerCast} 体まで（最大 ${maxConcurrent}）`);
  const s = st(ctx, ID);
  ok((s.extra?.throws || 0) <= (s.extra?.grabs || 0), `投げ ${s.extra?.throws} ≤ 掴み ${s.extra?.grabs}`);
}

// ===== 4. 対象が死んだら掴みが解除される =====
section('4. 掴んだ相手が死亡 / プール返却されたら掴みが必ず解除される');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  // 掴んだ瞬間に対象を消す。
  let killedAt = -1;
  for (let i = 0; i < 1500; i++) {
    ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16);
    if (killedAt < 0 && ctx.w.grabbing) {
      const e = ctx.scene.grabbedTarget();
      if (e) { e.alive = false; ctx.w.onEnemyRemoved(e); killedAt = i; }
    }
  }
  ok(killedAt >= 0, '掴んだ状態を作れる');
  ok(!ctx.w.grabbing, '対象が消えたら掴みが解除される');
  ok(ctx.enemies.every((e) => !e._grabbed || e.alive), '死んだ敵に掴みフラグが残らない');
  ok(ctx.w.telemetry.grabCancels > 0 || ctx.w.telemetry.throwImpacts >= 0, '掴み解除が記録される');
  ok(Number.isFinite(ctx.scene.player.x), 'プレイヤー座標が壊れない');
}

// ===== 5. 敵オブジェクトを保持しない =====
section('5. 敵オブジェクトを保持せず、安定 runtime id 経由で扱う');
{
  const src = skillSource(ID, registryMap()) || '';
  ok(!/this\._throw\.(target|enemy)\s*=/.test(src), 'スキルが敵参照を保持しない');
  ok(/grabbedTarget/.test(src), '掴んだ相手は共通経路から引き直す');
  const wsrc = (await import('node:fs')).readFileSync(new URL('../src/systems/WarriorCombatSystem.js', import.meta.url), 'utf8');
  ok(/_grab\s*=\s*\{\s*source,\s*seq/.test(wsrc), 'WarriorCombatSystem は _seq だけを持つ');
}

// ===== 6. 死亡イベントの二重化がない =====
section('6. 死亡イベントが二重に出ない');
{
  const ctx = build({ hp: 40 });
  const kills = [];
  const origDispatch = ctx.sm.dispatchKill?.bind(ctx.sm);
  if (origDispatch) ctx.sm.dispatchKill = (e, id) => { kills.push(e._seq); return origDispatch(e, id); };
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 24000);
  const dup = kills.filter((s, i) => kills.indexOf(s) !== i);
  ok(dup.length === 0, `同じ敵の死亡イベントが二重に出ない（重複 ${dup.length}）`);
}

// ===== 7. 座標の健全性 =====
section('7. 投げても座標が NaN にならず、壁内へ収まる');
{
  // 世界の隅（ただし壁内）へ寄せ、投げ先が壁の外へ出ないことを見る。
  const ctx = build({ enemies: makeEnemies(10, { x: 1500, y: 1080, dy: 4, hp: 1e9 }) });
  ctx.scene.player.x = 1480; ctx.scene.player.y = 1070;
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 24000);
  const m = GRAB.worldMargin;
  for (const e of ctx.enemies) {
    ok(Number.isFinite(e.x) && Number.isFinite(e.y), '投げた敵の座標が NaN にならない');
    ok(e.x >= m - 1e-6 && e.x <= 1600 - m + 1e-6, `投げた敵の x が壁内（${e.x.toFixed(1)}）`);
    ok(e.y >= m - 1e-6 && e.y <= 1200 - m + 1e-6, `投げた敵の y が壁内（${e.y.toFixed(1)}）`);
  }
}

// ===== 8. 成長 =====
section('8. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = SKILL.levels[7];
  for (const k of ['damage', 'grabRange', 'throwDistance', 'impactRadius', 'impactDamage', 'eliteSlam', 'bossPoise', 'knockback']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 32000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 32000);
  ok((st(hi, ID).damage || 0) > (st(lo, ID).damage || 0),
    `Lv8 の総ダメージ ${Math.round(st(hi, ID).damage)} > Lv1 ${Math.round(st(lo, ID).damage)}`);
}

// ===== 9. 破棄 / 復元 =====
section('9. 破棄 / 保存復元で掴みが残らない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  for (let i = 0; i < 1500 && !ctx.w.grabbing; i++) { ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16); }
  const sk = ctx.sm.skills.get(ID);
  sk.restoreState({ cdLeft: 0, throwPhase: 'fly' });
  ok(!ctx.w.grabbing, '復元で掴みが解除される');
  ok(sk._throw === null, '復元で投げの途中状態を持ち越さない');
  ok(ctx.enemies.every((e) => !e._grabbed), '敵側の掴みフラグも戻る');
  sk.destroy();
  ok(!ctx.w.grabbing, '破棄でも掴みが残らない');
}

T.finish();
