// 戦士 最終Wave 10/16: 刃返し（M8-E §weapon_deflection）。Node.js 標準機能のみ。
//   - 弾けるのは**通常の敵弾だけ**。予兆 / 光条 / 地形ハザード / DoT は弾かない
//   - **完全無効化ではない**。window ごとに弾ける数に上限があり、超えた弾はそのまま通る
//   - 弾いた弾は必ず消え、必要なら短命の物理反射弾になる。反射弾から再反射しない
//   - 同じ弾を 2 度弾かない
//   - 近接反撃とは別経路。1 イベントに応じるのは最大 1 系統
//   - recordCast は window 開始時の 1 回だけ
//   - 品質上限は演出だけに効き、弾き返しの成否は変えない
// 実行: node tests/warrior-weapon-deflection.mjs

import { DATA, makeScene, makeEnemies, makeWarrior, bootRuntime, runner, capFor } from './warrior-common.mjs';

const T = runner('戦士 刃返し（M8-E）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'weapon_deflection';
const SKILL = DATA.skills.find((x) => x.id === ID);
const DF = DATA.balance.warrior.deflection;
const L8 = SKILL.levels[7];

// 敵弾（production の Projectile と同じフィールドだけを持つ最小オブジェクト）。
let bulletSeq = 0;
const mkBullet = (o = {}) => ({
  _id: ++bulletSeq,
  x: o.x ?? 405, y: o.y ?? 300, angle: o.angle ?? Math.PI, alive: true,
  hostile: o.hostile !== false, damage: o.damage ?? 20, speed: o.speed ?? 180,
  projectileKind: o.projectileKind ?? 'bossBullet',
  isBeam: !!o.isBeam, isTelegraph: !!o.isTelegraph,
  alreadyDeflected: !!o.alreadyDeflected, deflectGeneration: o.deflectGeneration ?? 0,
  suppressSpecialEffects: false, _deflectId: null,
});

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(6, { x: 340, y: 300, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, now: 10000, quality: opts.quality || 'high', enemyBullets: opts.bullets || [] });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 4000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. 通常の敵弾だけを弾く =====
section('1. 弾けるのは通常の敵弾だけ（予兆 / 光条 / 地形 / DoT は弾かない）');
{
  ok(Array.isArray(DF.allowedKinds) && DF.allowedKinds.length > 0, `balance の allowedKinds（${DF.allowedKinds.join(',')}）`);
  ok(Array.isArray(DF.deniedKinds) && DF.deniedKinds.length > 0, `balance の deniedKinds（${DF.deniedKinds.join(',')}）`);
  for (const k of ['beam', 'telegraph', 'hazard', 'dot', 'ground']) {
    ok(DF.deniedKinds.includes(k), `${k} は denylist に載っている`);
  }
  const bullets = [
    mkBullet({ projectileKind: 'bossBullet' }),
    mkBullet({ projectileKind: 'bullet' }),
    mkBullet({ isBeam: true, projectileKind: 'beam' }),
    mkBullet({ isTelegraph: true, projectileKind: 'telegraph' }),
    mkBullet({ projectileKind: 'hazard' }),
    mkBullet({ projectileKind: 'dot' }),
    mkBullet({ projectileKind: 'ground' }),
    mkBullet({ hostile: false }),
  ];
  const ctx = build({ bullets });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 4000);
  ok(bullets[0].alive === false && bullets[1].alive === false, '通常の敵弾は弾かれて消える');
  for (let i = 2; i <= 6; i++) {
    ok(bullets[i].alive === true, `${bullets[i].projectileKind}: 弾かれずにそのまま通る`);
  }
  ok(bullets[7].alive === true, '味方弾は弾かない');
  ok(ctx.w.telemetry.deflectRejected > 0, `拒否がテレメトリに残る（${ctx.w.telemetry.deflectRejected}）`);
  info(`刃返し: 窓${ctx.w.telemetry.deflectWindows} 検知${ctx.w.telemetry.deflectSeen} 弾き${ctx.w.telemetry.deflected} 拒否${ctx.w.telemetry.deflectRejected}`);
}

// ===== 2. 完全無効化ではない =====
section('2. 完全無効化ではない（window ごとの上限を超えた弾はそのまま通る）');
{
  ok(L8.maxDeflections <= DF.maxDeflectionsPerWindow,
    `Lv8 の maxDeflections ${L8.maxDeflections} ≤ balance ${DF.maxDeflectionsPerWindow}`);
  const many = Array.from({ length: L8.maxDeflections + 8 }, (_, i) => mkBullet({ x: 400 + i * 2 }));
  const ctx = build({ bullets: many });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  // 1 window ぶんだけ進める（CD で 2 回目が来ない範囲）。
  run(ctx, Math.min(L8.windowDuration, DF.maxWindowMs) + 200);
  const gone = many.filter((b) => !b.alive).length;
  const alive = many.filter((b) => b.alive).length;
  ok(gone <= L8.maxDeflections, `1 window で弾けるのは最大 ${L8.maxDeflections} 発（実際 ${gone}）`);
  ok(alive > 0, `上限を超えた弾は生き残る（${alive} 発が通る）＝完全無効化ではない`);
  ok(ctx.w.telemetry.deflectCapReached > 0 || gone === L8.maxDeflections, '上限到達が記録される');
}

// ===== 3. 弾いた弾は必ず消える / 反射弾 =====
section('3. 弾いた弾は必ず消え、必要なら短命の物理反射弾になる');
{
  const bullets = Array.from({ length: 4 }, () => mkBullet());
  const ctx = build({ bullets });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 4000);
  const deflected = bullets.filter((b) => !b.alive);
  ok(deflected.length > 0, `弾かれた弾がある（${deflected.length}）`);
  for (const b of deflected) ok(b.alreadyDeflected === true, '弾かれた弾に印が付く');
  const refl = ctx.scene.reflected;
  ok(refl.length > 0, `反射弾が生成される（${refl.length}）`);
  for (const p of refl) {
    ok(p.hostile === false && p.ownerType === 'player', '反射弾はプレイヤー側の弾になる');
    ok(p.damage <= DF.maxReflectedDamage + 1e-9, `反射ダメージ ${p.damage} ≤ 上限 ${DF.maxReflectedDamage}`);
    ok(p.speed <= DF.maxReflectedSpeed + 1e-9, `反射速度 ${p.speed} ≤ 上限 ${DF.maxReflectedSpeed}`);
    ok(p.lifeMs <= DF.maxReflectLifeMs + 1e-9, `寿命 ${p.lifeMs} ≤ 上限 ${DF.maxReflectLifeMs}（短命）`);
    ok(p.suppressSpecialEffects === true, '元弾の特殊効果を引き継がない');
    ok(p.chillAmount === 0 && p.baseFreezeChance === 0 && p.explosionRadius === 0, '状態異常 / 爆発を持たない');
    ok(p.deflectGeneration === 1, '世代 1（反射弾から再反射しない）');
    ok(p.alreadyDeflected === true, '反射弾は再び弾かれない');
  }
  ok(ctx.w.telemetry.reflectedSpawned === refl.length, `テレメトリと一致（${ctx.w.telemetry.reflectedSpawned}）`);
  // data 側も上限内。
  ok(L8.reflectedDamage <= DF.maxReflectedDamage, `Lv8 reflectedDamage ${L8.reflectedDamage} ≤ ${DF.maxReflectedDamage}`);
  ok(L8.reflectedSpeed <= DF.maxReflectedSpeed, `Lv8 reflectedSpeed ${L8.reflectedSpeed} ≤ ${DF.maxReflectedSpeed}`);
}

// ===== 4. 再反射しない =====
section('4. 反射弾から再反射しない（無限反射が起きない）');
{
  ok(DF.maxReflectGeneration === 1, `balance の maxReflectGeneration が 1（${DF.maxReflectGeneration}）`);
  const ctx = build({ bullets: [] });
  const w = ctx.w;
  w.beginDeflectionWindow('x', { windowMs: 2000, maxDeflections: 8, radius: 200, reflect: true, reflectedDamage: 30, reflectedSpeed: 300, reflectLifeMs: 500 });
  // 世代 1 の弾（＝すでに反射された弾）は弾けない。
  const gen1 = mkBullet({ deflectGeneration: 1, alreadyDeflected: true });
  const r = w.canDeflectProjectile(gen1);
  ok(r.ok === false, `世代 1 の弾は弾けない（reason=${r.reason}）`);
  // 印が無くても世代が上限を超えていれば弾けない。
  const gen2 = mkBullet({ deflectGeneration: 2 });
  ok(w.canDeflectProjectile(gen2).ok === false, '世代 2 の弾も弾けない');
  ok(w.maxReflectGeneration() === DF.maxReflectGeneration, 'maxReflectGeneration が data 由来');
}

// ===== 5. 同じ弾を 2 度弾かない =====
section('5. 同じ弾を 2 度弾かない');
{
  const b = mkBullet();
  const ctx = build({ bullets: [b] });
  const w = ctx.w;
  w.beginDeflectionWindow('x', { windowMs: 3000, maxDeflections: 8, radius: 300, reflect: true, reflectedDamage: 20, reflectedSpeed: 200, reflectLifeMs: 400 });
  const r1 = ctx.scene.tryDeflectProjectile(b, { skillId: ID });
  ok(r1.deflected === true, '1 回目は弾ける');
  b.alive = true;                             // 意図的に生き返らせても
  const r2 = ctx.scene.tryDeflectProjectile(b, { skillId: ID });
  ok(r2.deflected === false, `2 回目は弾けない（reason=${r2.reason}）`);
  ok(w.telemetry.deflected === 1, `弾き回数が水増しされない（${w.telemetry.deflected}）`);
}

// ===== 6. 反撃と別経路（1 イベント 1 系統） =====
section('6. 近接反撃とは別経路（1 イベントに応じるのは最大 1 系統）');
{
  const ctx = build({ bullets: [] });
  const w = ctx.w;
  ok(DF.counterPriority > 0, `balance に counterPriority がある（${DF.counterPriority}）`);
  // 弾イベントは弾き返しだけを消費する。
  w.beginDeflectionWindow('x', { windowMs: 3000, maxDeflections: 4, radius: 200, reflect: false, reflectedDamage: 0, reflectedSpeed: 0, reflectLifeMs: 0 });
  w.beginCounterWindow('counter_stance', { durationMs: 3000, maxCounters: 3, priority: 2, mitigation: 0.2 });
  const p1 = w.arbitrateDeflectionAndCounter('projectile');
  ok(p1 && p1.kind === 'deflect', `弾イベント → 弾き返し（${p1 && p1.kind}）`);
  ok(w.counterWindows.get('counter_stance').used === 0, '弾イベントでは近接反撃の回数を消費しない');
  // 近接イベントは反撃だけを消費する。
  const p2 = w.arbitrateDeflectionAndCounter('melee');
  ok(p2 && p2.kind === 'counter', `近接イベント → 反撃（${p2 && p2.kind}）`);
  ok(w.deflectUsed === 0, '近接イベントでは弾き返しの回数を消費しない');
  ok(w.telemetry.reactionArbitrated >= 2, `調停がテレメトリに残る（${w.telemetry.reactionArbitrated}）`);
  // window が無ければ弾イベントには何も応じない。
  w.endDeflectionWindow('x');
  ok(w.arbitrateDeflectionAndCounter('projectile') === null, 'window が閉じていれば弾イベントに応じない');
}

// ===== 7. recordCast は window 開始時の 1 回だけ =====
section('7. recordCast は window 開始時の 1 回だけ（弾ごとに数えない）');
{
  const bullets = Array.from({ length: 10 }, (_, i) => mkBullet({ x: 400 + i }));
  const ctx = build({ bullets });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 6000);
  const s = st(ctx, ID);
  ok((s.extra?.windows || 0) === (s.casts || 0), `window ${s.extra?.windows} = cast ${s.casts}`);
  ok((s.extra?.deflected || 0) >= (s.casts || 0), `弾き ${s.extra?.deflected} は cast とは別に数える`);
  ok(ctx.w.telemetry.deflectWindows === (s.casts || 0), `テレメトリの window ${ctx.w.telemetry.deflectWindows} = cast ${s.casts}`);
}

// ===== 8. 品質上限 =====
section('8. 演出の上限は弾き返しの成否を変えない（品質は同時演出数と同時実体数だけを絞る）');
{
  const mk = (q) => {
    const bullets = Array.from({ length: 6 }, (_, i) => mkBullet({ x: 400 + i }));
    const ctx = build({ bullets, quality: q });
    ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
    run(ctx, 4000);
    return { ctx, bullets, deflected: bullets.filter((b) => !b.alive).length, tele: ctx.w.telemetry.deflected };
  };
  const hi = mk('ultra'), lo = mk('low');
  // 演出の上限（visualIntensity / maxDeflectSparkVisuals）は成否に一切関与しない。
  ok(capFor('maxDeflectSparkVisuals', 'low', 0) < capFor('maxDeflectSparkVisuals', 'ultra', 0),
    `演出上限は品質で変わる（low ${capFor('maxDeflectSparkVisuals', 'low', 0)} < ultra ${capFor('maxDeflectSparkVisuals', 'ultra', 0)}）`);
  ok(lo.deflected > 0, `low 品質でも弾き返しは成立する（${lo.deflected} 発）＝演出上限で無効化されない`);
  ok(lo.tele === lo.deflected, '低品質でもテレメトリと実挙動が一致する');
  // 弾ける「種別」の判定（allowlist / denylist）は品質で 1 件も変わらない。
  for (const q of ['low', 'medium', 'high', 'ultra']) {
    const ctx = build({ bullets: [], quality: q });
    ctx.w.beginDeflectionWindow('x', { windowMs: 2000, maxDeflections: 8, radius: 200, reflect: false, reflectedDamage: 0, reflectedSpeed: 0, reflectLifeMs: 0 });
    ok(ctx.w.canDeflectProjectile(mkBullet({ projectileKind: 'bossBullet' })).ok === true, `${q}: 通常弾は弾ける`);
    ok(ctx.w.canDeflectProjectile(mkBullet({ isBeam: true, projectileKind: 'beam' })).ok === false, `${q}: 光条は弾けない`);
    ok(ctx.w.canDeflectProjectile(mkBullet({ isTelegraph: true, projectileKind: 'telegraph' })).ok === false, `${q}: 予兆は弾けない`);
  }
  // 同時に処理する数（event 上限）は品質で絞られるが、必ず 1 以上で単調。
  const caps = ['low', 'medium', 'high', 'ultra'].map((q) => capFor('maxDeflectionsPerWindow', q, 0));
  ok(caps.every((v) => v >= 1), `どの品質でも 1 以上（${caps.join(' ≤ ')}）`);
  for (let i = 1; i < caps.length; i++) ok(caps[i] >= caps[i - 1], `品質が上がるほど緩い（${caps[i - 1]} ≤ ${caps[i]}）`);
  ok(hi.deflected >= lo.deflected, `高品質のほうが同時に多く弾ける（ultra ${hi.deflected} ≥ low ${lo.deflected}）`);
  // 反射「実体」の数も品質で絞られる（弾き返しの成否とは別軸）。
  const rcaps = ['low', 'medium', 'high', 'ultra'].map((q) => capFor('maxReflectedProjectiles', q, 0));
  ok(rcaps.every((v) => v >= 1), `反射弾の同時数もどの品質でも 1 以上（${rcaps.join(' ≤ ')}）`);
}

// ===== 9. window の後始末 =====
section('9. window は必ず閉じ、被弾フックも必ず外れる');
{
  const ctx = build({ bullets: [] });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 500);
  ok(ctx.scene._deflectOpts !== null, 'window 中は被弾フックが張られる');
  run(ctx, Math.min(L8.windowDuration, DF.maxWindowMs) + 600);
  ok(!ctx.w.deflectionActive, '時間切れで window が閉じる');
  ok(ctx.scene._deflectOpts === null, 'window が閉じたら被弾フックも外れる');
  // destroy でも外れる。
  const dctx = build({ bullets: [] });
  dctx.sm.acquireOrLevel(ID); dctx.sm.setLevel(ID, 8);
  run(dctx, 500);
  dctx.sm.skills.get(ID).destroy();
  ok(!dctx.w.deflectionActive && dctx.scene._deflectOpts === null, 'destroy で window もフックも消える');
  // 弾いた弾の id 集合は保存しない。
  const sk = ctx.sm.skills.get(ID);
  const s = sk.serializeState() || {};
  for (const k of ['deflectedIds', 'bullets', 'projectiles']) ok(!(k in s), `${k} を保存しない`);
  ok(!/_deflect/.test(JSON.stringify(ctx.w.serializeTimedBuffs().deflection || {}).replace(/deflection/g, '')),
    '保存データに弾オブジェクトを含まない');
}

// ===== 10. 成長 =====
section('10. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = L8;
  for (const k of ['windowDuration', 'maxDeflections', 'deflectRadius', 'reflectedDamage', 'reflectedSpeed', 'poiseDamage', 'visualIntensity']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  ok(b.windowDuration <= DF.maxWindowMs, `Lv8 windowDuration ${b.windowDuration} ≤ ${DF.maxWindowMs}`);
  ok(b.deflectRadius <= DF.maxDeflectRadius, `Lv8 deflectRadius ${b.deflectRadius} ≤ ${DF.maxDeflectRadius}`);
}

T.finish();
