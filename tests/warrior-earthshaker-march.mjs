// 戦士 最終Wave 9/16: 震天踏破（M8-E §earthshaker_march）。Node.js 標準機能のみ。
//   - 前へ歩きながら複数地点を踏む（大地砕き / 震脚と違って「移動しながら複数点」）
//   - 1 発動 = 1 recordCast。踏みごとに cast を水増ししない
//   - 対象が消えても現在の方向へ安全に進み続け、距離と時間の両方で必ず終わる
//   - ボス予兆中は前進を止める（完全に無視はしない）
//   - 壁の外へ出ない / 座標が NaN にならない / 無限に歩かない
//   - 最後の一歩だけが重い
// 実行: node tests/warrior-earthshaker-march.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, capFor } from './warrior-common.mjs';

const T = runner('戦士 震天踏破（M8-E）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'earthshaker_march';
const SKILL = DATA.skills.find((x) => x.id === ID);
const MA = DATA.balance.warrior.march;
const L8 = SKILL.levels[7];

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 340, y: 300, dx: 12, dy: 2, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 12000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. 移動しながら複数地点を踏む =====
section('1. 移動しながら複数地点を踏む（その場の範囲攻撃ではない）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const x0 = ctx.scene.player.x, y0 = ctx.scene.player.y;
  run(ctx, 8000);
  ok(ctx.w.telemetry.marchStomps > 1, `1 発動で複数回踏む（${ctx.w.telemetry.marchStomps}）`);
  ok(ctx.w.telemetry.marchDistance > 0, `踏みながら移動する（${Math.round(ctx.w.telemetry.marchDistance)}px）`);
  ok(Math.hypot(ctx.scene.player.x - x0, ctx.scene.player.y - y0) > 0, 'プレイヤーの座標が実際に動く');
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, '弾を 1 つも出さない');
  info(`震天踏破: cast${st(ctx, ID).casts} 踏み${ctx.w.telemetry.marchStomps} 移動${Math.round(ctx.w.telemetry.marchDistance)}px`);
}

// ===== 2. 既存の踏みつけ系との差 =====
section('2. 大地砕き / 震脚との違い（1 回の範囲は小さく、地点が複数）');
{
  const slam = DATA.skills.find((x) => x.id === 'ground_slam');
  const stomp = DATA.skills.find((x) => x.id === 'shockwave_stomp');
  ok(L8.radius < slam.levels[slam.levels.length - 1].radius,
    `1 回の半径 ${L8.radius} < 大地砕き ${slam.levels[slam.levels.length - 1].radius}`);
  ok(L8.stompCount > 1, `踏みが複数回（${L8.stompCount}）`);
  ok(!(slam.levels[slam.levels.length - 1].stompCount > 1), '大地砕きは 1 発動 1 地点のまま');
  ok(!(stomp.levels[stomp.levels.length - 1].stepDistance > 0) || L8.stepDistance > 0,
    '震脚と違い、踏みのたびに前進する');
  ok(L8.stepDistance > 0, `踏みのたびに前進する（${L8.stepDistance}px）`);
}

// ===== 3. cast 水増しなし =====
section('3. 1 発動 = 1 recordCast（踏みごとに cast を増やさない）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 20000);
  const s = st(ctx, ID);
  ok((s.extra?.marches || 0) === (s.casts || 0), `進軍開始 ${s.extra?.marches} = cast ${s.casts}`);
  ok((s.extra?.stomps || 0) > (s.casts || 0), `踏み ${s.extra?.stomps} > cast ${s.casts}（踏みは cast ではない）`);
  const cap = Math.min(L8.stompCount, capFor('maxMarchStomps', 'high', 7), MA.maxStomps);
  ok((s.extra?.stomps || 0) <= (s.casts || 1) * cap, `踏み ≤ cast × 上限 ${cap}`);
}

// ===== 4. 必ず終わる =====
section('4. 距離と時間の両方で必ず終わる（無限に歩かない）');
{
  ok(L8.stompCount <= MA.maxStomps, `Lv8 の stompCount ${L8.stompCount} ≤ balance ${MA.maxStomps}`);
  ok(SKILL.config.maxMarchMs <= MA.maxMarchMs, `data の maxMarchMs ${SKILL.config.maxMarchMs} ≤ balance ${MA.maxMarchMs}`);
  ok(L8.stepDistance <= MA.maxStepDistance, `Lv8 の stepDistance ${L8.stepDistance} ≤ balance ${MA.maxStepDistance}`);
  ok(L8.radius <= MA.maxRadius, `Lv8 の radius ${L8.radius} ≤ balance ${MA.maxRadius}`);
  // 内部の頭打ちも data を超えない。
  const w = makeWarrior(WarriorCombatSystem, makeScene({ enemies: [], now: 1000 }), {});
  const plan = w.beginEarthshakerMarch({ stompCount: 999, intervalMs: 1, stepDistance: 99999, radius: 99999, maxMs: 1e9, mitigation: 9 });
  ok(plan.stomps <= MA.maxStomps && plan.stepDistance <= MA.maxStepDistance, '過大な要求は balance の上限へクランプ');
  ok(plan.maxMs <= MA.maxMarchMs && plan.radius <= MA.maxRadius, '時間と半径も上限内');
  ok(plan.mitigation <= MA.maxMitigation + 1e-9, `軽減も上限 ${MA.maxMitigation} 以下（${plan.mitigation}）`);

  // 実際に進軍が終わる（marching が false へ戻る）。
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 3000);
  const sk = ctx.sm.skills.get(ID);
  run(ctx, 6000);
  ok(sk.marching === false, '一定時間後には進軍が終わっている');
  ok(ctx.w.telemetry.marchCompleted > 0, `完走が記録される（${ctx.w.telemetry.marchCompleted}）`);
}

// ===== 5. 対象が消えても安全 =====
section('5. 対象が消えても現在の方向へ安全に進み続ける');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 2000);
  // 進軍の途中で敵を全滅させる。
  for (const e of ctx.enemies) e.alive = false;
  const before = { x: ctx.scene.player.x, y: ctx.scene.player.y };
  let threw = false;
  try { run(ctx, 4000); } catch (err) { threw = true; }
  ok(!threw, '対象消失で例外を投げない');
  ok(Number.isFinite(ctx.scene.player.x) && Number.isFinite(ctx.scene.player.y), '座標が NaN にならない');
  ok(ctx.sm.skills.get(ID).marching === false, '進軍は必ず終わる');
  void before;
}

// ===== 6. ボス予兆中は前進しない =====
section('6. ボス予兆中は前進を止める（完全に無視はしない）');
{
  ok(SKILL.config.avoidBossTelegraph !== false, 'data で予兆回避を宣言している');
  const ctx = build({ enemies: makeEnemies(6, { x: 360, y: 300, dx: 10, hp: 1e9 }), boss: makeBoss({ x: 700, y: 300, hp: 1e9 }) });
  ctx.scene.bossTelegraphing = () => true;
  ctx.scene.combat.bossTelegraphing = () => true;
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const x0 = ctx.scene.player.x;
  run(ctx, 8000);
  ok(Math.abs(ctx.scene.player.x - x0) < 1e-6, `予兆中は 1px も前進しない（${(ctx.scene.player.x - x0).toFixed(2)}px）`);
  ok(ctx.w.telemetry.marchStomps > 0, `それでもその場で踏む（${ctx.w.telemetry.marchStomps} 回・完全に無視はしない）`);
}

// ===== 7. 壁の外へ出ない =====
section('7. 壁の外へ出ない（worldMargin でクランプ）');
{
  ok(MA.worldMargin > 0, `balance の worldMargin が正（${MA.worldMargin}）`);
  const scene = makeScene({ enemies: makeEnemies(6, { x: 1590, y: 300, dy: 3, hp: 1e9 }), now: 10000, quality: 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene); scene.skills = sm;
  scene.player.x = scene.worldW - 10; // 右端すれすれ
  const ctx = { scene, w, sm, enemies: scene.enemies };
  sm.acquireOrLevel(ID); sm.setLevel(ID, 8);
  run(ctx, 12000);
  const m = MA.worldMargin;
  ok(scene.player.x >= m - 1e-6 && scene.player.x <= scene.worldW - m + 1e-6,
    `x が [${m}, ${scene.worldW - m}] の内側（${scene.player.x.toFixed(1)}）`);
  ok(scene.player.y >= m - 1e-6 && scene.player.y <= scene.worldH - m + 1e-6,
    `y も内側（${scene.player.y.toFixed(1)}）`);
  ok(Number.isFinite(scene.player.x) && Number.isFinite(scene.player.y), '座標が NaN にならない');
}

// ===== 8. 最後の一歩が重い =====
section('8. 最後の一歩だけが重い');
{
  ok(L8.finalStompMultiplier > 1, `finalStompMultiplier が 1 より大きい（${L8.finalStompMultiplier}）`);
  const w = makeWarrior(WarriorCombatSystem, makeScene({ enemies: [], now: 1000 }), {});
  w.beginEarthshakerMarch({ stompCount: 3, intervalMs: 150, stepDistance: 40, radius: 90, maxMs: 2000, mitigation: 0 });
  ok(w.resolveMarchStomp(0, 3, 40).final === false, '1 歩目は最終ではない');
  ok(w.resolveMarchStomp(1, 3, 40).final === false, '2 歩目は最終ではない');
  ok(w.resolveMarchStomp(2, 3, 40).final === true, '3 歩目（最後）が最終');
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 12000);
  ok(ctx.w.telemetry.marchFinalStomps > 0, `最終踏みが記録される（${ctx.w.telemetry.marchFinalStomps}）`);
  ok(ctx.w.telemetry.marchFinalStomps < ctx.w.telemetry.marchStomps, '最終踏みは全踏みの一部だけ');
}

// ===== 9. 成長 =====
section('9. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = L8;
  for (const k of ['damage', 'stompCount', 'stepDistance', 'radius', 'knockback', 'poiseDamage', 'finalStompMultiplier']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  ok(b.interval < a.interval, `interval: ${a.interval} → ${b.interval}（踏むテンポが速くなる）`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 20000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 20000);
  ok((st(hi, ID).damage || 0) > (st(lo, ID).damage || 0),
    `Lv8 の総ダメージ ${Math.round(st(hi, ID).damage)} > Lv1 ${Math.round(st(lo, ID).damage)}`);
}

// ===== 10. 進行中の踏みは保存しない =====
section('10. 残りの踏みは保存しない（復元で二重再生しない）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 3000);
  const sk = ctx.sm.skills.get(ID);
  const s = sk.serializeState();
  for (const k of ['x', 'y', 'angle', 'castKey', 'plan']) ok(!(k in s), `${k} を保存しない`);
  const before = ctx.scene.calls.length;
  sk.restoreState({ ...s, cdLeft: 99999 });
  for (let i = 0; i < 200; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  ok(sk.marching === false, '復元直後は進軍中ではない');
  ok(ctx.scene.calls.length === before, `復元後に無料の踏みが出ない（増分 ${ctx.scene.calls.length - before}）`);
}

T.finish();
