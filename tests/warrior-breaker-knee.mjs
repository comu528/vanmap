// 戦士 Wave2 14/21: 破城膝撃（M8-D §breaker_knee）。Node.js 標準機能のみ。
//   - 超近距離の単体打撃。エリート / ボスの体勢削りに特化
//   - 通常敵には短いノックバック
//   - 射程からわずかに外れているときだけ安全に踏み込む
//   - 兜割りより CD と射程が短く、体勢削りが高い
// 実行: node tests/warrior-breaker-knee.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner } from './warrior-common.mjs';

const T = runner('戦士 破城膝撃（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'breaker_knee';
const SKILL = DATA.skills.find((x) => x.id === ID);
const ARMOR = DATA.skills.find((x) => x.id === 'armor_breaker');

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(8, { x: 320, y: 300, dy: 3, hp: opts.hp || 1e9 });
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

// ===== 1. 単体・超近距離 =====
section('1. 超近距離の単体打撃（複数を巻き込まない）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 16000);
  const s = st(ctx, ID);
  ok((s.casts || 0) > 0, `発動する（${s.casts}）`);
  ok((s.hits || 0) > 0, `命中する（${s.hits}）`);
  ok((s.hits || 0) <= (s.casts || 0), `1 発動 1 体まで（hits ${s.hits} ≤ cast ${s.casts}）`);
  ok(SKILL.levels[7].range < 60, `射程 ${SKILL.levels[7].range}px が超近距離`);
  info(`破城膝撃: cast${s.casts} hit${s.hits} 踏み込み${ctx.w.telemetry.stepIns}`);
}

// ===== 2. エリート / ボスの体勢に特化 =====
section('2. エリート / ボスへの体勢削りに特化している');
{
  const norm = build();
  norm.sm.acquireOrLevel(ID); norm.sm.setLevel(ID, 8);
  run(norm, 16000);
  const elite = build({ enemies: makeEnemies(6, { x: 320, y: 300, dy: 3, hp: 1e9, elite: true }) });
  elite.sm.acquireOrLevel(ID); elite.sm.setLevel(ID, 8);
  run(elite, 16000);
  const perHitN = norm.w.telemetry.poiseDamage / Math.max(1, st(norm, ID).hits || 1);
  const perHitE = elite.w.telemetry.poiseDamage / Math.max(1, st(elite, ID).hits || 1);
  ok(perHitE > perHitN, `エリートのほうが 1 撃の体勢削りが大きい（${perHitN.toFixed(1)} → ${perHitE.toFixed(1)}）`);
  ok(SKILL.levels[7].eliteBonus > 0 && SKILL.levels[7].bossBonus > 0, 'eliteBonus / bossBonus が正');

  const bctx = build({ enemies: [], boss: makeBoss({ x: 320, y: 300, hp: 1e9 }) });
  bctx.sm.acquireOrLevel(ID); bctx.sm.setLevel(ID, 8);
  run(bctx, 16000);
  ok(bctx.w.telemetry.poiseDamage > 0, `ボスの体勢を削る（${bctx.w.telemetry.poiseDamage.toFixed(1)}）`);
  ok((st(bctx, ID).hits || 0) > 0, 'ボスにも当たる');
}

// ===== 3. 通常敵には短いノックバック =====
section('3. 通常敵には短いノックバック、エリート / ボスは動かない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 16000);
  ok(ctx.enemies.some((e) => e._kb > 0), '通常敵はノックバックする');
  ok(SKILL.levels[7].knockback < DATA.skills.find((x) => x.id === 'shield_bash').levels[7].knockback,
    `ノックバックは盾殴りより短い（${SKILL.levels[7].knockback}）`);
  const bctx = build({ enemies: [], boss: makeBoss({ x: 320, y: 300, hp: 1e9 }) });
  bctx.sm.acquireOrLevel(ID); bctx.sm.setLevel(ID, 8);
  const bx = bctx.scene.boss.x;
  run(bctx, 16000);
  ok(bctx.scene.boss.x === bx, 'ボスは動かない');
}

// ===== 4. わずかに外れているときだけ踏み込む =====
section('4. 射程からわずかに外れているときだけ安全に踏み込む');
{
  // 射程 + 少し のところに 1 体だけ置く。
  const range = SKILL.levels[7].range;
  const e = makeEnemies(1, { x: 300 + range + 20, y: 300, hp: 1e9 })[0];
  const ctx = build({ enemies: [e] });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const x0 = ctx.scene.player.x;
  run(ctx, 16000);
  ok(ctx.w.telemetry.stepIns > 0, `踏み込みが発生する（${ctx.w.telemetry.stepIns}）`);
  ok(ctx.w.telemetry.stepInDistance > 0, `踏み込み距離が記録される（${ctx.w.telemetry.stepInDistance.toFixed(1)}px）`);
  ok((st(ctx, ID).hits || 0) > 0, '踏み込んで当たる');
  // 遠すぎる相手には踏み込まない。
  const far = makeEnemies(1, { x: 1200, y: 300, hp: 1e9 })[0];
  const fctx = build({ enemies: [far] });
  fctx.sm.acquireOrLevel(ID); fctx.sm.setLevel(ID, 8);
  const fx0 = fctx.scene.player.x;
  run(fctx, 16000);
  ok(Math.abs(fctx.scene.player.x - fx0) < SKILL.levels[7].stepIn + 1e-6,
    `遠すぎる相手へは踏み込み量を超えて動かない（${Math.abs(fctx.scene.player.x - fx0).toFixed(1)}px）`);
  ok((st(fctx, ID).hits || 0) === 0, '遠すぎる相手には当たらない');
  void x0;
}

// ===== 5. 兜割りとの住み分け =====
section('5. 兜割りより CD と射程が短く、体勢削りが高い');
{
  ok(SKILL.levels[7].cooldown < ARMOR.levels[7].cooldown,
    `CD: 破城膝撃 ${SKILL.levels[7].cooldown} < 兜割り ${ARMOR.levels[7].cooldown}`);
  ok(SKILL.levels[7].range < ARMOR.levels[7].range,
    `射程: 破城膝撃 ${SKILL.levels[7].range} < 兜割り ${ARMOR.levels[7].range}`);
  ok(SKILL.levels[7].poiseDamage > ARMOR.levels[7].poiseDamage,
    `体勢削り: 破城膝撃 ${SKILL.levels[7].poiseDamage} > 兜割り ${ARMOR.levels[7].poiseDamage}`);
  ok(SKILL.lv80ProjectileTarget === false, '破城膝撃は Lv80 打撃数 +1 の対象ではない');
}

// ===== 6. 弾を飛ばさない・cast 水増しなし =====
section('6. 弾を飛ばさず、cast も水増しされない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 16000);
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, '弾を 1 つも出さない');
  const s = st(ctx, ID);
  ok((s.extra?.knees || 0) === (s.casts || 0), `膝撃回数 ${s.extra?.knees} = cast ${s.casts}`);
}

// ===== 7. 成長 =====
section('7. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = SKILL.levels[7];
  for (const k of ['damage', 'range', 'stepIn', 'poiseDamage', 'eliteBonus', 'bossBonus', 'knockback']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 20000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 20000);
  ok((st(hi, ID).damage || 0) > (st(lo, ID).damage || 0),
    `Lv8 の総ダメージ ${Math.round(st(hi, ID).damage)} > Lv1 ${Math.round(st(lo, ID).damage)}`);
}

// ===== 8. 保存 / 破棄 =====
section('8. 保存 / 破棄で踏み込みが残らない');
{
  const range = SKILL.levels[7].range;
  const e = makeEnemies(1, { x: 300 + range + 20, y: 300, hp: 1e9 })[0];
  const ctx = build({ enemies: [e] });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire();
  for (let i = 0; i < 3; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  sk.restoreState({ cdLeft: 99999 });
  ok(sk._step === null, '復元で踏み込み状態を持ち越さない');
  sk.fire();
  const x = ctx.scene.player.x;
  sk.destroy();
  for (let i = 0; i < 60; i++) sk.update(16, { hasEnemies: true });
  ok(sk._step === null, '破棄で踏み込みが消える');
  ok(ctx.scene.player.x === x, '破棄後にプレイヤーが動かない');
}

T.finish();
