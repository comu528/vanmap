// 戦士 Wave1 7/19: 跳躍強襲 / 天墜崩撃（M8-C §5-4, §11）。Node.js 標準機能のみ。
// 移動系スキルの安全条件を固定する。
//   - 跳躍は距離と時間の両方で必ず終わる（無限跳躍しない）
//   - 壁の外・NaN 座標へ飛ばない
//   - 対象が死亡・消失しても安全に着地する（記録した座標へ跳ぶ）
//   - 跳躍中は「軽減」であって無敵ではない（ダメージは必ず 1 以上通る）
//   - ボスの予告 / 突進中は真正面へ踏み込まない（完全無視もしない）
//   - 着地の衝撃は 1 発動 1 回。二次衝撃（進化）も 1 回だけ
// 実行: node tests/warrior-leap.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, capFor } from './warrior-common.mjs';

const T = runner('戦士 跳躍強襲 / 天墜崩撃（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const SKILL = (id) => DATA.skills.find((x) => x.id === id);
const EVO = (id) => DATA.evolutions.find((x) => x.id === id);

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 500, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 8000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
    if (!Number.isFinite(ctx.scene.player.x) || !Number.isFinite(ctx.scene.player.y)) break;
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};
const LEAPERS = ['leap_smash', 'heaven_crushing_descent'];

// ===== 1. 跳躍で実際に接近する =====
section('1. 跳躍で密集地点へ近づき、着地で周囲を打つ');
for (const id of LEAPERS) {
  const enemies = makeEnemies(8, { x: 520, y: 300, dy: 4, hp: 1e9 });
  const ctx = build({ enemies });
  ctx.sm.acquireOrLevel(id);
  if (id === 'leap_smash') ctx.sm.setLevel(id, 8);
  const x0 = ctx.scene.player.x;
  run(ctx, 8000);
  const s = st(ctx, id);
  ok((s.extra?.leaps || 0) > 0, `${id}: 跳躍する（${s.extra?.leaps} 回）`);
  ok((s.extra?.landings || 0) > 0, `${id}: 着地する（${s.extra?.landings} 回）`);
  ok(ctx.scene.player.x > x0 + 20, `${id}: 敵の方向へ近づく（x ${x0} → ${Math.round(ctx.scene.player.x)}）`);
  ok((s.hits || 0) > 0, `${id}: 着地で命中する（${s.hits} 発）`);
  ok(ctx.w.telemetry.leapLandings > 0, `${id}: 着地がテレメトリに残る（${ctx.w.telemetry.leapLandings}）`);
  info(`${id}: 跳躍${s.extra?.leaps} 着地${s.extra?.landings} 移動${Math.round(s.extra?.leapDistance || 0)}px 命中${s.hits}`);
}

// ===== 2. 距離と時間の両方で必ず終わる =====
section('2. 跳躍は距離と時間の両方で必ず終わる（無限跳躍しない）');
for (const id of LEAPERS) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  if (id === 'leap_smash') ctx.sm.setLevel(id, 8);
  const sk = ctx.sm.skills.get(id);
  const P = sk.leapParams();
  sk.fire();
  // 1 フレームずつ進めて、maxLeapMs + 猶予で必ず _leap が消えることを見る。
  let frames = 0;
  const limit = Math.ceil((P.maxLeapMs + P.landingDelayMs + 200) / 16);
  while (sk._leap && frames < limit * 4) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); frames += 1; }
  ok(!sk._leap, `${id}: ${frames} フレームで跳躍が終わる`);
  ok(frames <= limit, `${id}: maxLeapMs(${P.maxLeapMs}ms) + 着地遅延の範囲で終わる（${frames} ≤ ${limit} フレーム）`);
  // 移動距離が data の跳躍距離を超えない。
  const s = st(ctx, id);
  ok((s.extra?.leapDistance || 0) <= P.distance + 1e-6, `${id}: 移動 ${Math.round(s.extra?.leapDistance || 0)}px ≤ 跳躍距離 ${P.distance}px`);
}

// ===== 3. 壁外・NaN を作らない =====
section('3. 壁際・世界の隅でも壁外 / NaN 座標を作らない');
for (const id of LEAPERS) {
  for (const [px, py] of [[24, 24], [1576, 1176], [24, 1176], [1576, 24], [800, 600]]) {
    const enemies = makeEnemies(6, { x: px + 10, y: py + 10, dy: 2, hp: 1e9 });
    const ctx = build({ enemies });
    ctx.scene.player.x = px; ctx.scene.player.y = py;
    ctx.sm.acquireOrLevel(id);
    if (id === 'leap_smash') ctx.sm.setLevel(id, 8);
    run(ctx, 8000);
    const p = ctx.scene.player;
    ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${id} @(${px},${py}): 座標が有限`);
    ok(p.x >= 0 && p.x <= 1600 && p.y >= 0 && p.y <= 1200, `${id} @(${px},${py}): 壁の外へ出ない（${Math.round(p.x)},${Math.round(p.y)}）`);
  }
}

// ===== 4. 対象が消えても安全に着地する =====
section('4. 跳躍中に対象が死亡・消失しても安全に着地する');
for (const id of LEAPERS) {
  const enemies = makeEnemies(6, { x: 520, y: 300, dy: 4, hp: 1e9 });
  const ctx = build({ enemies });
  ctx.sm.acquireOrLevel(id);
  if (id === 'leap_smash') ctx.sm.setLevel(id, 8);
  const sk = ctx.sm.skills.get(id);
  // fire() を直接呼ぶと recordCast を通らないため、着地は recordExtra を覗いて数える。
  let landings = 0;
  const origExtra = ctx.sm.recordExtra.bind(ctx.sm);
  ctx.sm.recordExtra = (sid, key, v, op) => { if (sid === id && key === 'landings') landings += 1; return origExtra(sid, key, v, op); };
  sk.fire();
  ok(!!sk._leap, `${id}: 跳躍が始まる`);
  // 空中で全敵を消す。
  for (let i = 0; i < 3; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  for (const e of enemies) { e.alive = false; ctx.w.onEnemyRemoved(e); }
  let threw = null;
  try {
    for (let i = 0; i < 120; i++) { sk.update(16, { hasEnemies: false }); ctx.scene.advance(16); }
  } catch (e) { threw = e; }
  ok(!threw, `${id}: 対象消失でも例外が出ない（${threw ? threw.message : 'ok'}）`);
  ok(!sk._leap, `${id}: 対象消失でも跳躍が終わる`);
  ok(Number.isFinite(ctx.scene.player.x), `${id}: 座標が壊れない`);
  ok(landings >= 1, `${id}: 記録した座標へ着地する（着地 ${landings} 回）`);
}

// ===== 5. 軽減であって無敵ではない =====
section('5. 跳躍中の軽減は「軽減」であり無敵ではない（ダメージは必ず通る）');
for (const id of LEAPERS) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  if (id === 'leap_smash') ctx.sm.setLevel(id, 8);
  const sk = ctx.sm.skills.get(id);
  sk.fire();
  sk.update(16, { hasEnemies: true }); ctx.scene.advance(16);
  ok(sk.leaping === true, `${id}: 滞空中と判定される`);
  const mit = sk.chargeMitigation();
  ok(mit > 0, `${id}: 滞空中は軽減がある（${mit}）`);
  ok(mit < 1, `${id}: 軽減は 100% 未満（無敵ではない）`);
  const raw = 100;
  const applied = ctx.w.applyIncomingDamage(raw, { extra: mit, engaged: true, charging: true });
  ok(applied > 0, `${id}: 100 ダメージのうち ${applied.toFixed(1)} は必ず通る`);
  ok(applied < raw, `${id}: 軽減自体は効いている（${applied.toFixed(1)} < ${raw}）`);
  const total = 1 - applied / raw;
  ok(total <= DATA.balance.warrior.mitigation.maxTotalReduction + 1e-9,
    `${id}: 合計軽減 ${(total * 100).toFixed(1)}% が上限内`);
  // 着地後は軽減が消える。
  for (let i = 0; i < 120; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  ok(sk.chargeMitigation() === 0, `${id}: 着地後は軽減が消える`);
}

// ===== 6. ボスの予告 / 突進中は真正面へ踏み込まない =====
section('6. ボスの予告 / 突進中は、その真正面へは踏み込まない（完全無視もしない）');
for (const id of LEAPERS) {
  const boss = makeBoss({ x: 700, y: 300, hp: 1e9, state: 'telegraph' });
  const ctx = build({ enemies: makeEnemies(4, { x: 700, y: 300, dy: 2, hp: 1e9 }), boss });
  ctx.sm.acquireOrLevel(id);
  if (id === 'leap_smash') ctx.sm.setLevel(id, 8);
  const sk = ctx.sm.skills.get(id);
  const p = ctx.scene.player;
  const toBoss = Math.atan2(boss.y - p.y, boss.x - p.x);
  sk.fire();
  ok(!!sk._leap, `${id}: 予告中でも跳躍自体は行う（完全に止まらない）`);
  let diff = sk._leap.angle - toBoss;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  ok(Math.abs(diff) >= 0.8, `${id}: ボス方向から ${(Math.abs(diff) * 180 / Math.PI).toFixed(0)}° 逸らす`);
  // 予告していないときは素直に敵へ向かう。
  const calm = makeBoss({ x: 700, y: 300, hp: 1e9, state: 'chase' });
  const cctx = build({ enemies: makeEnemies(4, { x: 700, y: 300, dy: 2, hp: 1e9 }), boss: calm });
  cctx.sm.acquireOrLevel(id);
  if (id === 'leap_smash') cctx.sm.setLevel(id, 8);
  const csk = cctx.sm.skills.get(id);
  csk.fire();
  let cdiff = csk._leap.angle - Math.atan2(calm.y - cctx.scene.player.y, calm.x - cctx.scene.player.x);
  while (cdiff > Math.PI) cdiff -= Math.PI * 2;
  while (cdiff < -Math.PI) cdiff += Math.PI * 2;
  ok(Math.abs(cdiff) < 0.8, `${id}: 予告していなければ素直に近づく（ずれ ${(Math.abs(cdiff) * 180 / Math.PI).toFixed(0)}°）`);
}

// ===== 7. 着地の衝撃は 1 発動 1 回 =====
section('7. 着地の衝撃は 1 発動 1 回（cast が水増しされない）');
{
  const ls = SKILL('leap_smash').levels[7];
  const ctx = build();
  ctx.sm.acquireOrLevel('leap_smash'); ctx.sm.setLevel('leap_smash', 8);
  run(ctx, 20000);
  const s = st(ctx, 'leap_smash');
  ok((s.casts || 0) <= Math.ceil(20000 / ls.cooldown) + 2, `cast ${s.casts} が CD どおり`);
  ok((s.extra?.landings || 0) <= (s.extra?.leaps || 0), `着地 ${s.extra?.landings} ≤ 跳躍 ${s.extra?.leaps}`);
  ok((s.extra?.leaps || 0) === (s.casts || 0), `跳躍数 ${s.extra?.leaps} = cast ${s.casts}`);

  // 天墜崩撃: 二次衝撃も 1 着地 1 回。
  const e = EVO('heaven_crushing_descent');
  const ectx = build();
  ectx.sm.acquireOrLevel('heaven_crushing_descent');
  run(ectx, 20000);
  const es = st(ectx, 'heaven_crushing_descent');
  ok((es.extra?.secondaryImpacts || 0) <= (es.extra?.landings || 0),
    `二次衝撃 ${es.extra?.secondaryImpacts} ≤ 着地 ${es.extra?.landings}`);
  ok((es.casts || 0) <= Math.ceil(20000 / e.cooldown) + 2, `天墜崩撃 cast ${es.casts} が CD どおり`);
  info(`跳躍強襲 cast${s.casts}/着地${s.extra?.landings} 天墜崩撃 cast${es.casts}/二次${es.extra?.secondaryImpacts}`);
}

// ===== 8. 品質別 cap =====
section('8. 着地衝撃・軌跡は品質別 cap で頭打ちになる');
for (const q of ['low', 'medium', 'high', 'ultra']) {
  const impactCap = capFor('maxLeapImpacts', q, 2);
  const trailCap = capFor('maxLeapTrails', q, 8);
  ok(impactCap >= 1, `${q}: maxLeapImpacts ${impactCap} ≥ 1`);
  ok(trailCap >= 1, `${q}: maxLeapTrails ${trailCap} ≥ 1`);
  const ctx = build({ quality: q });
  ctx.sm.acquireOrLevel('heaven_crushing_descent');
  run(ctx, 20000);
  const s = st(ctx, 'heaven_crushing_descent');
  const lands = s.extra?.landings || 0;
  ok((s.extra?.secondaryImpacts || 0) <= lands * Math.max(0, impactCap - 1),
    `${q}: 二次衝撃 ${s.extra?.secondaryImpacts || 0} ≤ (cap${impactCap}-1) × 着地${lands}`);
}

// ===== 9. 保存: 跳躍の途中状態を持ち越さない =====
section('9. 保存/復元で跳躍の途中状態を持ち越さない（無料の着地衝撃を作らない）');
for (const id of LEAPERS) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  if (id === 'leap_smash') ctx.sm.setLevel(id, 8);
  const sk = ctx.sm.skills.get(id);
  sk.fire();
  sk.update(16, { hasEnemies: true });
  const saved = sk.serializeState();
  ok(saved.leapPhase === 'air', `${id}: 保存時に滞空中と記録される`);
  ok(!('angle' in saved) && !('traveled' in saved), `${id}: 座標・角度は保存しない`);
  const ctx2 = build();
  ctx2.sm.acquireOrLevel(id);
  if (id === 'leap_smash') ctx2.sm.setLevel(id, 8);
  const sk2 = ctx2.sm.skills.get(id);
  let landings2 = 0;
  const origExtra2 = ctx2.sm.recordExtra.bind(ctx2.sm);
  ctx2.sm.recordExtra = (sid, key, v, op) => { if (sid === id && key === 'landings') landings2 += 1; return origExtra2(sid, key, v, op); };
  sk2.restoreState(saved);
  ok(!sk2._leap, `${id}: 復元しても跳躍は再開しない`);
  // CD を残したまま数フレーム回し、勝手に着地衝撃が出ないことを見る。
  sk2._cd = 5000;
  for (let i = 0; i < 30; i++) { sk2.update(16, { hasEnemies: true }); ctx2.scene.advance(16); }
  ok(landings2 === 0, `${id}: 復元直後に無料の着地衝撃が出ない（${landings2} 回）`);
}

// ===== 10. 弾を飛ばさない =====
section('10. 跳躍系は弾を飛ばさない');
for (const id of LEAPERS) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  if (id === 'leap_smash') ctx.sm.setLevel(id, 8);
  run(ctx, 10000);
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, `${id}: spawnPlayerProjectile を呼ばない`);
  ok(SKILL(id) ? SKILL(id).lv80ProjectileTarget === false : EVO(id).lv80ProjectileTarget === false,
    `${id}: Job Lv80 の弾数対象ではない`);
}

T.finish();
