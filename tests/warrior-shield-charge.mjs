// 戦士 Wave2 7/21: 鉄壁突進（M8-D §shield_charge）。Node.js 標準機能のみ。
//   - 中距離を突進し、終点で 1 回だけ衝撃を出す（1 発動 = 1 recordCast）
//   - 突進中は**前方から来た攻撃だけ**を強く受け流す。側面は弱く背面はほぼ守れない
//   - 方向の分からない被弾（DoT / 全体）は前面扱いにしない
//   - 通常敵は押し分けるが、エリート / ボスは動かず体勢が削れる
//   - 距離と時間の両方で必ず終わる。壁外・NaN を作らない
// 実行: node tests/warrior-shield-charge.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, capFor } from './warrior-common.mjs';

const T = runner('戦士 鉄壁突進（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'shield_charge';
const SKILL = DATA.skills.find((x) => x.id === ID);
const FG = DATA.balance.warrior.frontalGuard;

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 380, y: 300, dy: 3, hp: opts.hp || 1e9 });
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

// ===== 1. 突進して当たる・終点衝撃は 1 回 =====
section('1. 突進して命中し、終点衝撃は 1 発動 1 回だけ');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 16000);
  const s = st(ctx, ID);
  ok((s.casts || 0) > 0, `発動する（${s.casts}）`);
  ok((s.hits || 0) > 0, `命中する（${s.hits}）`);
  ok((s.extra?.chargeDistance || 0) > 0, `距離を進む（${Math.round(s.extra?.chargeDistance || 0)}px）`);
  ok((s.extra?.impacts || 0) <= (s.casts || 0), `終点衝撃 ${s.extra?.impacts} ≤ cast ${s.casts}`);
  ok((s.extra?.charges || 0) === (s.casts || 0), `突進回数 ${s.extra?.charges} = cast ${s.casts}`);
  info(`鉄壁突進: cast${s.casts} hit${s.hits} 距離${Math.round(s.extra?.chargeDistance || 0)}px 衝撃${s.extra?.impacts}`);
}

// ===== 2. 前面防御: 前 / 横 / 後ろで軽減が違う =====
section('2. 前方の被弾だけを強く受け流す（側面は弱く、背面はほぼ守れない）');
{
  const ctx = build();
  const w = ctx.w;
  const p = ctx.scene.player;
  w.beginFrontGuard('test', { durationMs: 2000, mitigation: 0.5, frontArc: 1.6, facing: 0 }); // 右向き
  const front = w.frontGuardMitigation({ fromX: p.x + 200, fromY: p.y, x: p.x, y: p.y });
  const side = w.frontGuardMitigation({ fromX: p.x, fromY: p.y + 200, x: p.x, y: p.y });
  const back = w.frontGuardMitigation({ fromX: p.x - 200, fromY: p.y, x: p.x, y: p.y });
  ok(front > side, `前 ${front.toFixed(3)} > 横 ${side.toFixed(3)}`);
  ok(side > back || (side === 0 && back === 0), `横 ${side.toFixed(3)} ≥ 後ろ ${back.toFixed(3)}`);
  ok(Math.abs(side - front * FG.sideMultiplier) < 1e-9, `横は前 × ${FG.sideMultiplier}`);
  ok(Math.abs(back - front * FG.backMultiplier) < 1e-9, `後ろは前 × ${FG.backMultiplier}`);
  ok(front <= FG.maxFrontalMitigation + 1e-9, `前面軽減 ${front.toFixed(3)} ≤ 上限 ${FG.maxFrontalMitigation}`);
  // 方向の分からない被弾は前面扱いにしない。
  ok(FG.requireDirection === true, 'balance で方向必須が宣言されている');
  ok(w.frontGuardMitigation({}) === 0, '方向なしの被弾には前面軽減が乗らない');
  w.endFrontGuard('test');
  ok(w.frontGuardActive === false, '解除できる');
  ok(w.frontGuardMitigation({ fromX: p.x + 200, fromY: p.y, x: p.x, y: p.y }) === 0, '解除後は 0');
}

// ===== 3. 軽減は無敵にならない（合計 70% クランプ）=====
section('3. 前面防御は無敵にならない（合計軽減の上限を守る）');
{
  const ctx = build();
  const w = ctx.w;
  const p = ctx.scene.player;
  w.beginFrontGuard('test', { durationMs: 2000, mitigation: 0.99, frontArc: 3.0, facing: 0 });
  ok(w.frontGuard.mitigation <= FG.maxFrontalMitigation + 1e-9,
    `過大な申告は ${FG.maxFrontalMitigation} へクランプ（${w.frontGuard.mitigation}）`);
  const dctx = { engaged: true, charging: true, fromX: p.x + 100, fromY: p.y, x: p.x, y: p.y };
  const out = w.applyIncomingDamage(100, dctx);
  ok(out > 0, `被弾が 0 にならない（${out.toFixed(1)}）`);
  ok(w.damageReduction(dctx) <= DATA.balance.warrior.mitigation.maxTotalReduction + 1e-9,
    `合計軽減 ${w.damageReduction(dctx).toFixed(3)} ≤ ${DATA.balance.warrior.mitigation.maxTotalReduction}`);
  w.endFrontGuard('test');
}

// ===== 4. 突進は必ず終わる・壁外へ出ない =====
section('4. 突進は距離と時間の両方で必ず終わり、壁外・NaN を作らない');
{
  const ctx = build({ enemies: makeEnemies(4, { x: 1500, y: 1100, hp: 1e9 }) });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const p = ctx.scene.player;
  let maxJump = 0, prev = { x: p.x, y: p.y };
  for (let i = 0; i < 1200; i++) {
    ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16);
    maxJump = Math.max(maxJump, Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = { x: p.x, y: p.y };
    ok(Number.isFinite(p.x) && Number.isFinite(p.y) || i > 1e9, '');
  }
  const m = SKILL.config.worldMargin;
  ok(p.x >= m - 1e-6 && p.x <= 1600 - m + 1e-6, `x が壁内（${p.x.toFixed(1)}）`);
  ok(p.y >= m - 1e-6 && p.y <= 1200 - m + 1e-6, `y が壁内（${p.y.toFixed(1)}）`);
  ok(maxJump < 40, `1 フレームの移動が ${maxJump.toFixed(1)}px（テレポートしない）`);
  ok(ctx.sm.skills.get(ID)._charge === null, '突進はいずれ必ず終わる');
  ok(SKILL.levels[7].duration <= SKILL.config.maxChargeMs, `Lv8 の duration ≤ maxChargeMs（${SKILL.config.maxChargeMs}）`);
}

// ===== 5. 通常敵は押すが、エリート / ボスは動かない =====
section('5. 通常敵は押し分けるが、エリート / ボスは位置が動かず体勢が削れる');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 12000);
  ok(ctx.enemies.some((e) => e._kb > 0), '通常敵はノックバックする');

  const bctx = build({ enemies: [], boss: makeBoss({ x: 380, y: 300, hp: 1e9 }) });
  bctx.sm.acquireOrLevel(ID); bctx.sm.setLevel(ID, 8);
  const bx = bctx.scene.boss.x, by = bctx.scene.boss.y;
  run(bctx, 12000);
  ok(bctx.scene.boss.x === bx && bctx.scene.boss.y === by, 'ボスは押されない');
  ok(bctx.w.telemetry.poiseDamage > 0, `ボスの体勢は削れる（${bctx.w.telemetry.poiseDamage.toFixed(1)}）`);
}

// ===== 6. 接触は同一敵 1 発動 1 回 =====
section('6. 通過中の接触ダメージは同一敵へ 1 発動 1 回');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 12000);
  const s = st(ctx, ID);
  const cap = capFor('maxChargeContacts', 'high', 16);
  // 接触（1 敵 1 回）＋ 終点衝撃 の合計しか出ない。
  ok((s.hits || 0) <= (s.casts || 0) * (ctx.enemies.length + cap), `hits ${s.hits} が 1 発動あたりの上限内`);
}

// ===== 7. 成長 =====
section('7. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = SKILL.levels[7];
  for (const k of ['damage', 'duration', 'speed', 'frontArc', 'frontalMitigation', 'impactDamage', 'width', 'poiseDamage', 'knockback']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  ok(b.frontalMitigation <= FG.maxFrontalMitigation, `Lv8 の frontalMitigation ${b.frontalMitigation} ≤ ${FG.maxFrontalMitigation}`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 24000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 24000);
  ok((st(hi, ID).damage || 0) > (st(lo, ID).damage || 0),
    `Lv8 の総ダメージ ${Math.round(st(hi, ID).damage)} > Lv1 ${Math.round(st(lo, ID).damage)}`);
}

// ===== 8. 破棄 / 復元で前面防御が残らない =====
section('8. 破棄 / 保存復元で前面防御が残らない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 5000);
  const sk = ctx.sm.skills.get(ID);
  sk.restoreState({ cdLeft: 0, chargeLeftMs: 500 });
  ok(sk._charge === null, '復元で突進の途中状態を持ち越さない');
  ok(!ctx.w.frontGuardActive, '復元で前面防御が消える');
  run(ctx, 3000);
  sk.destroy();
  ok(!ctx.w.frontGuardActive, '破棄で前面防御が消える');
}

T.finish();
