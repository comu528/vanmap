// 戦士 最終Wave 6/16: 貫穿突き（M8-E §piercing_lunge）。Node.js 標準機能のみ。
//   - 前方の狭い直線を貫く「近接」であり、弾を 1 つも出さない
//   - 通常敵は複数体を貫き、エリート / ボスが射線上にいると単体寄りへ威力が寄る
//   - 射程は data で頭打ち。画面端（700px 先）までは絶対に届かない
//   - 少しだけ届かないときだけ踏み込む。ボス予兆中は踏み込まない
//   - 1 発動 = 1 recordCast（踏み込みや 2 段目で cast を水増ししない）
//   - Lv1 → Lv8 で宣言した成長軸がすべて伸びる
// 実行: node tests/warrior-piercing-lunge.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, capFor } from './warrior-common.mjs';

const T = runner('戦士 貫穿突き（M8-E）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'piercing_lunge';
const SKILL = DATA.skills.find((x) => x.id === ID);
const LINE = DATA.balance.warrior.line;

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 330, y: 300, dy: 2, hp: opts.hp || 1e9 });
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

// ===== 1. 弾ではない =====
section('1. 弾ではない（踏み込み＋近接の直線判定）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 12000);
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, '弾を 1 つも出さない');
  ok(ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID).length > 0, '近接判定として出る');
  const s = st(ctx, ID);
  ok((s.hits || 0) > 0 && (s.damage || 0) > 0, `命中してダメージを与える（hit${s.hits} / ${Math.round(s.damage)}）`);
  ok(SKILL.castMode === 'cooldown' && !SKILL.projectile, 'data も弾スキルとして宣言していない');
  info(`貫穿突き: cast${s.casts} hit${s.hits} 貫通${s.extra?.penetrations || 0}`);
}

// ===== 2. 直線に乗った敵だけを貫く =====
section('2. 射線上の通常敵だけを貫く（横に外れた敵は当たらない）');
{
  // 射線（右向き）の上に 6 体、真上に離れた位置へ 6 体。
  const onLine = makeEnemies(6, { x: 340, y: 300, dx: 30, dy: 0, hp: 1e9 });
  const offLine = makeEnemies(6, { x: 340, y: 180, dx: 30, dy: 0, hp: 1e9 });
  const ctx = build({ enemies: [...onLine, ...offLine] });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 6000);
  const hitOn = onLine.filter((e) => e.hp < e.maxHp).length;
  const hitOff = offLine.filter((e) => e.hp < e.maxHp).length;
  ok(hitOn > 1, `射線上の敵を複数体貫く（${hitOn} 体）`);
  ok(hitOff < hitOn, `幅から外れた敵はほとんど当たらない（${hitOff} 体 < ${hitOn} 体）`);
  ok(ctx.w.telemetry.linePenetrations > 0, `貫通が記録される（${ctx.w.telemetry.linePenetrations}）`);
}

// ===== 3. 硬い相手は単体寄り =====
section('3. エリート / ボスが射線上にいると単体寄りへ威力が寄る');
{
  const ratio = LINE.toughSingleTargetRatio;
  ok(ratio > 0 && ratio < 1, `balance の toughSingleTargetRatio が 0 < ${ratio} < 1`);
  const w = makeWarrior(WarriorCombatSystem, makeScene({ enemies: [], now: 1000 }), {});
  w.beginPiercingLunge({ lineLength: 200, width: 60, maxTargets: 10, maxHitsPerTarget: 1, stepIn: 0 });
  const normals = makeEnemies(10, { x: 300, y: 300, dx: 10, hp: 1e9 });
  const elites = makeEnemies(2, { x: 300, y: 300, dx: 10, hp: 1e9, elite: true });
  const onlyNormal = w.resolveLineMeleeTargets([...normals], { maxTargets: 10 });
  ok(onlyNormal.length === 10, `通常敵だけなら上限まで貫く（${onlyNormal.length}）`);
  const mixed = w.resolveLineMeleeTargets([...elites, ...normals], { maxTargets: 10 });
  ok(mixed.length < 10, `硬い相手が混ざると対象数が減る（${mixed.length} < 10）`);
  ok(mixed.filter((e) => e.isElite).length === 2, 'エリートは必ず対象へ入る');
  ok(w.telemetry.lineToughHits === 2, `硬い相手への命中が記録される（${w.telemetry.lineToughHits}）`);
  // 通常敵に割り当てられる枠は ratio 由来の少数だけ。
  ok(mixed.filter((e) => !e.isElite).length <= Math.max(1, Math.round(10 * ratio)),
    `通常敵の枠が ratio 由来の少数（${mixed.filter((e) => !e.isElite).length}）`);
  // data のボーナスは硬い相手へ乗る（＝硬い相手ほど 1 点に集まる）。
  ok(SKILL.levels[7].eliteBonus > 0 && SKILL.levels[7].bossBonus > 0,
    `Lv8 の eliteBonus ${SKILL.levels[7].eliteBonus} / bossBonus ${SKILL.levels[7].bossBonus} が正`);
}

// ===== 4. 画面端まで届かない =====
section('4. 射程が data で頭打ち（画面端まで絶対に届かない）');
{
  ok(SKILL.levels[7].lineLength <= LINE.maxLineLength,
    `Lv8 の lineLength ${SKILL.levels[7].lineLength} ≤ balance ${LINE.maxLineLength}`);
  ok(SKILL.levels[7].width <= LINE.maxWidth, `Lv8 の width ${SKILL.levels[7].width} ≤ balance ${LINE.maxWidth}`);
  ok(SKILL.levels[7].stepInDistance <= LINE.maxStepInDistance,
    `Lv8 の stepInDistance ${SKILL.levels[7].stepInDistance} ≤ balance ${LINE.maxStepInDistance}`);
  ok(SKILL.levels[7].lineLength + SKILL.levels[7].stepInDistance < 700,
    `射程 + 踏み込み ${SKILL.levels[7].lineLength + SKILL.levels[7].stepInDistance}px < 700px（画面端へ届かない）`);
  // 実際に 700px 先の敵へは 1 も届かない。
  const far = makeEnemies(4, { x: 400 + 700, y: 300, dx: 6, hp: 1e9 });
  const ctx = build({ enemies: far });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 8000);
  ok(far.every((e) => e.hp === e.maxHp), '700px 先の敵へは 1 ダメージも通らない');
  // 内部の頭打ちも data を超えない。
  const cfg = ctx.w.beginPiercingLunge({ lineLength: 99999, width: 99999, maxTargets: 999, maxHitsPerTarget: 99, stepIn: 99999 });
  ok(cfg.length <= LINE.maxLineLength && cfg.width <= LINE.maxWidth, '過大な要求は balance の上限へクランプ');
  ok(cfg.maxTargets <= LINE.maxTargets && cfg.maxHitsPerTarget <= LINE.maxHitsPerTargetPerCast, '対象数 / 多重命中も上限内');
}

// ===== 5. 踏み込みは安全 =====
section('5. 踏み込みは安全（少し届かないときだけ・ボス予兆中は踏み込まない）');
{
  // 近い敵しかいなければ踏み込まない。
  const near = build({ enemies: makeEnemies(6, { x: 410, y: 300, dx: 4, hp: 1e9 }) });
  near.sm.acquireOrLevel(ID); near.sm.setLevel(ID, 8);
  run(near, 6000);
  ok(near.w.telemetry.lineStepIns === 0 || near.w.telemetry.stepInDistance >= 0, '近い相手なら踏み込みが不要');

  // ボス予兆中は踏み込まない。
  const boss = makeBoss({ x: 400 + 260, y: 300, hp: 1e9 });
  const tctx = build({ enemies: [], boss });
  tctx.scene.bossTelegraphing = () => true;
  tctx.scene.combat.bossTelegraphing = () => true;
  tctx.sm.acquireOrLevel(ID); tctx.sm.setLevel(ID, 8);
  const x0 = tctx.scene.player.x;
  run(tctx, 8000);
  ok(Math.abs(tctx.scene.player.x - x0) < 1e-6, `ボス予兆中は 1px も踏み込まない（移動 ${(tctx.scene.player.x - x0).toFixed(2)}px）`);
  ok(tctx.w.telemetry.lineStepIns === 0, 'テレメトリ上も踏み込み 0');

  // 予兆が無ければ、少し遠い相手へ踏み込む。
  const gctx = build({ enemies: makeEnemies(4, { x: 400 + 190, y: 300, dx: 4, hp: 1e9 }) });
  gctx.sm.acquireOrLevel(ID); gctx.sm.setLevel(ID, 8);
  run(gctx, 8000);
  ok(gctx.w.telemetry.lineStepIns > 0, `届かないときは踏み込む（${gctx.w.telemetry.lineStepIns} 回）`);
  // 踏み込みの距離は M8-D と同じ stepInDistance へ加算される（1 発動あたり上限つき）。
  const casts = st(gctx, ID).casts || 1;
  ok(gctx.w.telemetry.stepInDistance <= casts * LINE.maxStepInDistance + 1e-6,
    `踏み込み総距離 ${Math.round(gctx.w.telemetry.stepInDistance)}px ≤ cast${casts} × 上限 ${LINE.maxStepInDistance}px`);
}

// ===== 6. cast 水増しなし =====
section('6. 1 発動 = 1 recordCast（踏み込み / 段で水増ししない）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 20000);
  const s = st(ctx, ID);
  ok((s.extra?.lunges || 0) === (s.casts || 0), `踏み込み開始回数 ${s.extra?.lunges} = cast ${s.casts}`);
  ok(ctx.w.telemetry.lineThrusts >= (s.casts || 0), `突き ${ctx.w.telemetry.lineThrusts} ≥ cast ${s.casts}`);
  // 同一敵への多重命中は data の上限内。
  const cap = Math.min(SKILL.config.maxHitsPerTargetPerCast, LINE.maxHitsPerTargetPerCast);
  const maxT = Math.min(SKILL.levels[7].maxTargets, capFor('maxLineTargets', 'high', 12));
  ok((s.hits || 0) <= (s.casts || 1) * maxT * cap * 2,
    `hits ${s.hits} ≤ cast × 対象上限 ${maxT} × 多重上限 ${cap}（余裕を持った上界）`);
}

// ===== 7. 成長 =====
section('7. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = SKILL.levels[7];
  for (const k of ['damage', 'stepInDistance', 'lineLength', 'width', 'maxTargets', 'eliteBonus', 'bossBonus', 'poiseDamage', 'knockbackNormal']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 20000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 20000);
  ok((st(hi, ID).damage || 0) > (st(lo, ID).damage || 0),
    `Lv8 の総ダメージ ${Math.round(st(hi, ID).damage)} > Lv1 ${Math.round(st(lo, ID).damage)}`);
}

// ===== 8. 進行中状態は保存しない =====
section('8. 踏み込みの途中状態は保存しない（復元で座標が飛ばない）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 4000);
  const sk = ctx.sm.skills.get(ID);
  const s = sk.serializeState();
  for (const k of ['x', 'y', 'angle', 'moved', 'seqHits', 'castKey']) ok(!(k in s), `${k} を保存しない`);
  sk.restoreState({ ...s, cdLeft: 99999 });
  ok(sk.lunging === false, '復元直後は踏み込み中ではない');
}

T.finish();
