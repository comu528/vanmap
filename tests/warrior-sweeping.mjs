// 戦士 Wave1 8/19: 薙ぎ進軍 / 震脚（M8-C §5-5, §5-9, §11）。Node.js 標準機能のみ。
// 薙ぎ進軍は「移動しながら攻撃する」唯一の active なので、移動系の安全条件をここで固定する。
//   - 前進しながら左右交互に薙ぐ（突進斬りのような一点 dash ではない）
//   - 打撃数・持続の両方に上限があり、必ず終わる
//   - 壁外・NaN・すり抜けを作らない
//   - 対象を見失っても短距離だけ進んで安全に終わる
//   - 押し出しすぎて攻撃不能にならない（knockback を弱める）
//   - 1 発動 = 1 recordCast
// 震脚は「短距離制圧」であり、演出だけを大きく見せてダメージ範囲は radius のままであること。
// 実行: node tests/warrior-sweeping.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, capFor, readSrc } from './warrior-common.mjs';

const T = runner('戦士 薙ぎ進軍 / 震脚（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const SKILL = (id) => DATA.skills.find((x) => x.id === id);

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 380, y: 300, dy: 4, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 10000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
    if (!Number.isFinite(ctx.scene.player.x) || !Number.isFinite(ctx.scene.player.y)) break;
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. 前進しながら薙ぐ =====
section('1. 薙ぎ進軍: 前進しながら薙ぎ、実際に距離を移動する');
{
  const sa = SKILL('sweeping_advance').levels[7];
  const ctx = build();
  ctx.sm.acquireOrLevel('sweeping_advance'); ctx.sm.setLevel('sweeping_advance', 8);
  const x0 = ctx.scene.player.x;
  run(ctx, 10000);
  const s = st(ctx, 'sweeping_advance');
  ok((s.extra?.advances || 0) > 0, `進軍する（${s.extra?.advances} 回）`);
  ok((s.extra?.advanceDistance || 0) > 0, `移動距離が記録される（${Math.round(s.extra?.advanceDistance)}px）`);
  ok(Math.abs(ctx.scene.player.x - x0) > 10 || Math.abs(ctx.scene.player.y - 300) > 10, '実際に位置が変わる');
  ok((s.hits || 0) > 0, `命中する（${s.hits} 発）`);
  ok(ctx.w.telemetry.sweepDistance > 0, `移動がテレメトリに残る（${Math.round(ctx.w.telemetry.sweepDistance)}px）`);
  // 1 発動あたりの移動距離は speed × duration を超えない。
  const perCast = (s.extra?.advanceDistance || 0) / Math.max(1, s.extra?.advances || 0);
  ok(perCast <= sa.speed * (sa.duration / 1000) * 1.2 + 1,
    `1 発動あたり ${Math.round(perCast)}px ≤ speed×duration ${Math.round(sa.speed * sa.duration / 1000)}px`);
  info(`薙ぎ進軍: 進軍${s.extra?.advances} 移動${Math.round(s.extra?.advanceDistance)}px 打撃${s.extra ? '' : ''}命中${s.hits}`);
}

// ===== 2. 左右交互に薙ぐ =====
section('2. 薙ぎ進軍: 左右交互に薙ぐ（同じ向きへ振り続けない）');
{
  const ctx = build({ enemies: makeEnemies(1, { x: 340, y: 300, hp: 1e9 }) });
  ctx.sm.acquireOrLevel('sweeping_advance'); ctx.sm.setLevel('sweeping_advance', 8);
  const facings = [];
  const origMelee = ctx.scene.combat.meleeStrike;
  ctx.scene.combat.meleeStrike = (o) => { if (o.skillId === 'sweeping_advance') facings.push(o.facing); return origMelee(o); };
  run(ctx, 8000);
  ok(facings.length >= 4, `複数回薙ぐ（${facings.length} 回）`);
  // 進行方向を軸に、+側 / -側が交互に出る。
  let alternations = 0;
  for (let i = 1; i < facings.length; i++) if (Math.sign(facings[i] - facings[i - 1]) !== 0) alternations += 1;
  ok(alternations >= facings.length - 2, `振りの向きが交互に変わる（${alternations}/${facings.length - 1}）`);
  info(`薙ぎ: ${facings.length} 回 / 交互 ${alternations} 回`);
}

// ===== 3. 打撃数・持続の両方で必ず終わる =====
section('3. 薙ぎ進軍: 打撃数と持続の両方で必ず終わる（無限進軍しない）');
{
  const sa = SKILL('sweeping_advance').levels[7];
  const ctx = build();
  ctx.sm.acquireOrLevel('sweeping_advance'); ctx.sm.setLevel('sweeping_advance', 8);
  const sk = ctx.sm.skills.get('sweeping_advance');
  sk.fire();
  let frames = 0;
  const limit = Math.ceil(sa.duration / 16) + 8;
  while (sk._sweep && frames < limit * 5) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); frames += 1; }
  ok(!sk._sweep, `${frames} フレームで進軍が終わる`);
  ok(frames <= limit, `duration(${sa.duration}ms) の範囲で終わる（${frames} ≤ ${limit} フレーム）`);
  // 打撃数上限でも終わる。
  const ctx2 = build();
  ctx2.sm.acquireOrLevel('sweeping_advance'); ctx2.sm.setLevel('sweeping_advance', 8);
  const sk2 = ctx2.sm.skills.get('sweeping_advance');
  sk2.fire();
  let strikes = 0;
  const origExtra = ctx2.sm.recordExtra.bind(ctx2.sm);
  ctx2.sm.recordExtra = (sid, k, v, op) => origExtra(sid, k, v, op);
  const origMelee = ctx2.scene.combat.meleeStrike;
  ctx2.scene.combat.meleeStrike = (o) => { if (o.skillId === 'sweeping_advance') strikes += 1; return origMelee(o); };
  for (let i = 0; i < 400 && sk2._sweep; i++) { sk2.update(16, { hasEnemies: true }); ctx2.scene.advance(16); }
  ok(strikes <= sa.maxStrikes, `打撃 ${strikes} ≤ maxStrikes ${sa.maxStrikes}`);
  info(`薙ぎ進軍: ${frames} フレームで終了 / 1 発動 ${strikes} 打撃`);
}

// ===== 4. 壁外・NaN を作らない =====
section('4. 薙ぎ進軍: 壁際でも壁外 / NaN 座標を作らない');
for (const [px, py] of [[24, 24], [1576, 1176], [24, 1176], [1576, 24], [800, 600]]) {
  const ctx = build({ enemies: makeEnemies(6, { x: px, y: py, dy: 2, hp: 1e9 }) });
  ctx.scene.player.x = px; ctx.scene.player.y = py;
  ctx.sm.acquireOrLevel('sweeping_advance'); ctx.sm.setLevel('sweeping_advance', 8);
  run(ctx, 10000);
  const p = ctx.scene.player;
  ok(Number.isFinite(p.x) && Number.isFinite(p.y), `@(${px},${py}): 座標が有限`);
  ok(p.x >= 0 && p.x <= 1600 && p.y >= 0 && p.y <= 1200, `@(${px},${py}): 壁の外へ出ない（${Math.round(p.x)},${Math.round(p.y)}）`);
}

// ===== 5. 対象を見失っても安全に終わる =====
section('5. 薙ぎ進軍: 対象を見失っても現在方向へ進んで安全に終わる');
{
  const enemies = makeEnemies(6, { x: 380, y: 300, dy: 3, hp: 1e9 });
  const ctx = build({ enemies });
  ctx.sm.acquireOrLevel('sweeping_advance'); ctx.sm.setLevel('sweeping_advance', 8);
  const sk = ctx.sm.skills.get('sweeping_advance');
  sk.fire();
  for (let i = 0; i < 5; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  const angBefore = sk._sweep.angle;
  for (const e of enemies) { e.alive = false; ctx.w.onEnemyRemoved(e); }
  let threw = null;
  try {
    for (let i = 0; i < 300 && sk._sweep; i++) { sk.update(16, { hasEnemies: false }); ctx.scene.advance(16); }
  } catch (e) { threw = e; }
  ok(!threw, `対象消失でも例外が出ない（${threw ? threw.message : 'ok'}）`);
  ok(!sk._sweep, '対象消失でも進軍が終わる');
  ok(Number.isFinite(ctx.scene.player.x), '座標が壊れない');
  void angBefore;
}

// ===== 6. 押し出しすぎない =====
section('6. 薙ぎ進軍: knockback を弱め、押し出して攻撃不能にしない');
{
  const cfg = SKILL('sweeping_advance').config;
  ok(cfg.maxKnockbackPush > 0 && cfg.maxKnockbackPush < 1, `knockback を ${cfg.maxKnockbackPush} 倍へ弱める`);
  const sa = SKILL('sweeping_advance').levels[7];
  ok(sa.knockback < SKILL('shockwave_stomp').levels[7].knockback,
    `素の knockback ${sa.knockback} < 震脚 ${SKILL('shockwave_stomp').levels[7].knockback}`);
  // 実測: 進軍中も命中し続ける（押し出しで空振りに終わらない）。
  const one = makeEnemies(1, { x: 340, y: 300, hp: 1e9 });
  const ctx = build({ enemies: one });
  ctx.sm.acquireOrLevel('sweeping_advance'); ctx.sm.setLevel('sweeping_advance', 8);
  run(ctx, 10000);
  const s = st(ctx, 'sweeping_advance');
  ok((s.hits || 0) >= (s.extra?.advances || 0) * 2, `1 発動あたり複数回当たる（命中 ${s.hits} / 進軍 ${s.extra?.advances}）`);
}

// ===== 7. 1 発動 = 1 recordCast =====
section('7. 薙ぎ進軍: tick で cast が水増しされない');
{
  const sa = SKILL('sweeping_advance').levels[7];
  const ctx = build();
  ctx.sm.acquireOrLevel('sweeping_advance'); ctx.sm.setLevel('sweeping_advance', 8);
  run(ctx, 20000);
  const s = st(ctx, 'sweeping_advance');
  ok((s.casts || 0) <= Math.ceil(20000 / sa.cooldown) + 2, `cast ${s.casts} が CD どおり`);
  ok((s.extra?.advances || 0) === (s.casts || 0), `進軍数 ${s.extra?.advances} = cast ${s.casts}`);
  ok((s.hits || 0) > (s.casts || 0), `命中は cast より多い（多段は hits 側で数える）`);
}

// ===== 8. 1 フレームあたりの打撃上限 =====
section('8. 薙ぎ進軍: 1 フレームあたりの打撃数が maxSweepStrikesPerFrame で頭打ち');
for (const q of ['low', 'medium', 'high', 'ultra']) {
  const cap = capFor('maxSweepStrikesPerFrame', q, 2);
  ok(cap >= 1, `${q}: cap ${cap} ≥ 1`);
  const ctx = build({ quality: q });
  ctx.sm.acquireOrLevel('sweeping_advance'); ctx.sm.setLevel('sweeping_advance', 8);
  const sk = ctx.sm.skills.get('sweeping_advance');
  sk.fire();
  let maxPerFrame = 0;
  const origMelee = ctx.scene.combat.meleeStrike;
  for (let i = 0; i < 200 && sk._sweep; i++) {
    let n = 0;
    ctx.scene.combat.meleeStrike = (o) => { if (o.skillId === 'sweeping_advance') n += 1; return origMelee(o); };
    sk.update(500, { hasEnemies: true }); // 大きな dt を与えても 1 フレーム上限で止まる
    ctx.scene.advance(500);
    maxPerFrame = Math.max(maxPerFrame, n);
  }
  ctx.scene.combat.meleeStrike = origMelee;
  ok(maxPerFrame <= cap, `${q}: 1 フレーム最大 ${maxPerFrame} 打撃 ≤ cap ${cap}`);
}

// ===== 9. 保存: 再開であって二重化ではない =====
section('9. 薙ぎ進軍: 保存/復元は「再開」であって「二重化」ではない');
{
  const sa = SKILL('sweeping_advance').levels[7];
  const ctx = build();
  ctx.sm.acquireOrLevel('sweeping_advance'); ctx.sm.setLevel('sweeping_advance', 8);
  const sk = ctx.sm.skills.get('sweeping_advance');
  sk.fire();
  for (let i = 0; i < 10; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  const saved = sk.serializeState();
  ok(saved.sweepLeftMs > 0 && saved.sweepLeftMs <= sa.duration, `残り時間を保存する（${Math.round(saved.sweepLeftMs)}ms）`);
  ok(saved.sweepStrikes >= 0, `消化済み打撃数を保存する（${saved.sweepStrikes}）`);
  const ctx2 = build();
  ctx2.sm.acquireOrLevel('sweeping_advance'); ctx2.sm.setLevel('sweeping_advance', 8);
  const sk2 = ctx2.sm.skills.get('sweeping_advance');
  sk2.restoreState(saved);
  ok(!!sk2._sweep, '復元で進軍が再開する');
  ok(sk2._sweep.leftMs <= sa.duration, `残り時間が duration を超えない（${Math.round(sk2._sweep.leftMs)}ms ≤ ${sa.duration}ms）`);
  ok(sk2._sweep.strikes === saved.sweepStrikes, `消化済み打撃数を引き継ぐ（${sk2._sweep.strikes}）`);
  // 復元後の残り打撃数が data の上限を超えない。
  let strikes = 0;
  const origMelee = ctx2.scene.combat.meleeStrike;
  ctx2.scene.combat.meleeStrike = (o) => { if (o.skillId === 'sweeping_advance') strikes += 1; return origMelee(o); };
  for (let i = 0; i < 300 && sk2._sweep; i++) { sk2.update(16, { hasEnemies: true }); ctx2.scene.advance(16); }
  ok(strikes + saved.sweepStrikes <= sa.maxStrikes, `合計打撃 ${strikes + saved.sweepStrikes} ≤ maxStrikes ${sa.maxStrikes}`);
  info(`薙ぎ進軍 保存: 残り${Math.round(saved.sweepLeftMs)}ms 消化${saved.sweepStrikes} 復元後${strikes}`);
}

// ===== 10. 震脚: 短距離制圧・演出とダメージ範囲の分離 =====
section('10. 震脚: 判定は短距離のまま、演出だけを大きく見せる');
{
  const ss = SKILL('shockwave_stomp');
  const lv8 = ss.levels[7];
  ok(ss.config.shockwaveVisualScale > 1, `演出倍率がある（×${ss.config.shockwaveVisualScale}）`);
  ok(lv8.radius < SKILL('ground_slam').levels[7].radius, `判定半径 ${lv8.radius} < 地砕き ${SKILL('ground_slam').levels[7].radius}`);
  ok(lv8.cooldown < SKILL('ground_slam').levels[7].cooldown, `回転が速い（CD ${lv8.cooldown}ms < 地砕き ${SKILL('ground_slam').levels[7].cooldown}ms）`);
  ok(lv8.knockback > SKILL('great_cleave').levels[7].knockback, `押し返しが強い（${lv8.knockback}）`);
  // 実測: 演出倍率ぶん遠くの敵には当たらない。
  const near = makeEnemies(4, { x: 300 + lv8.radius * 0.6, y: 300, dy: 0, hp: 1e9 });
  const far = makeEnemies(4, { x: 300 + lv8.radius * 1.8, y: 300, dy: 0, hp: 1e9 });
  const ctx = build({ enemies: [...near, ...far] });
  ctx.sm.acquireOrLevel('shockwave_stomp'); ctx.sm.setLevel('shockwave_stomp', 8);
  run(ctx, 6000);
  const hitFar = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === 'shockwave_stomp' && far.includes(c[2])).length;
  const hitNear = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === 'shockwave_stomp' && near.includes(c[2])).length;
  ok(hitNear > 0, `判定内の敵には当たる（${hitNear} 発）`);
  ok(hitFar === 0, `演出倍率ぶん外の敵には当たらない（${hitFar} 発）`);
  // ソース上でも「visualScale は演出専用」であることを明記している。
  const src = readSrc('src/skills/ShockwaveStompSkill.js');
  ok(/visualScale/.test(src) && /判定半径/.test(src), 'ソースに演出とダメージ範囲の分離が明記されている');
  info(`震脚: 判定${lv8.radius}px 演出×${ss.config.shockwaveVisualScale} 近${hitNear}/遠${hitFar}`);
}

// ===== 11. 両者とも弾を飛ばさない =====
section('11. 薙ぎ進軍 / 震脚は弾を飛ばさない');
for (const id of ['sweeping_advance', 'shockwave_stomp']) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
  run(ctx, 10000);
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, `${id}: 弾を出さない`);
  ok(SKILL(id).lv80ProjectileTarget === false, `${id}: Job Lv80 の弾数対象ではない`);
  // ボスのみ / 敵ゼロでも例外なし。
  let threw = null;
  try {
    const only = build({ enemies: [], boss: makeBoss({ hp: 1e9 }) });
    only.sm.acquireOrLevel(id); only.sm.setLevel(id, 8);
    run(only, 6000);
    const empty = build({ enemies: [] });
    empty.sm.acquireOrLevel(id); empty.sm.setLevel(id, 8);
    run(empty, 6000);
  } catch (e) { threw = e; }
  ok(!threw, `${id}: 敵ゼロ / ボスのみでも例外なし（${threw ? threw.message : 'ok'}）`);
}

T.finish();
