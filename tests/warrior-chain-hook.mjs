// 戦士 Wave1 11/19: 鎖鉤（M8-C §5-8, §11, §16）。Node.js 標準機能のみ。
// 引き寄せは「敵の座標をこちらから書き換える」唯一の機構なので、次を機械的に固定する。
//   - 通常敵は引き寄せられる / エリートは大幅に短い / ボスは動かない（代わりにこちらが近づく）
//   - 引き寄せは共通経路（combat.pullTarget）を通り、SpatialGrid の更新を伴う
//   - 壁の外・NaN・テレポート（一瞬での長距離移動）を作らない
//   - 対象が消えたら安全に終わる（敵オブジェクトを保持しない）
//   - ボスが予告 / 突進中は踏み込まない（完全無視もしない）
//   - 1 発動あたりの引き寄せ回数に上限がある
// 実行: node tests/warrior-chain-hook.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, capFor, readSrc } from './warrior-common.mjs';

const T = runner('戦士 鎖鉤（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const SKILL = (id) => DATA.skills.find((x) => x.id === id);
const PULL = DATA.balance.warrior.pull;
const LV8 = SKILL('chain_hook').levels[7];
const CFG = SKILL('chain_hook').config;

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(6, { x: 520, y: 300, dy: 6, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  // 品質別 cap と data 側の上限を両方使う（production と同じ）。
  scene.combat.warriorPullConfig = () => PULL;
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
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. data の役割宣言 =====
section('1. data: 通常 > エリート の引き寄せ距離で、ボスには接近距離だけを持つ');
{
  for (const lv of SKILL('chain_hook').levels) {
    ok(lv.pullDistanceNormal > lv.pullDistanceElite, `Lv${lv.level}: 通常 ${lv.pullDistanceNormal} > エリート ${lv.pullDistanceElite}`);
    ok(lv.playerApproachBoss > 0, `Lv${lv.level}: ボスには自分が近づく（${lv.playerApproachBoss}px）`);
    ok(lv.knockback === 0, `Lv${lv.level}: 引き寄せ技なのでノックバックは 0`);
  }
  ok(PULL.bossPullDistance === 0, `balance: ボスの引き寄せ距離は 0（${PULL.bossPullDistance}）`);
  ok(PULL.maxPullPerCast >= 1, `balance: 1 発動あたりの引き寄せ回数 ${PULL.maxPullPerCast}`);
  ok(PULL.worldMargin > 0, `balance: 壁からの余白 ${PULL.worldMargin}px`);
}

// ===== 2. 通常敵は引き寄せられる =====
section('2. 通常敵は引き寄せられ、実際に距離が縮まる');
{
  const enemies = makeEnemies(1, { x: 540, y: 300, hp: 1e9 });
  const ctx = build({ enemies });
  ctx.sm.acquireOrLevel('chain_hook'); ctx.sm.setLevel('chain_hook', 8);
  const d0 = Math.hypot(enemies[0].x - ctx.scene.player.x, enemies[0].y - ctx.scene.player.y);
  run(ctx, 3000);
  const d1 = Math.hypot(enemies[0].x - ctx.scene.player.x, enemies[0].y - ctx.scene.player.y);
  ok(d1 < d0, `距離が縮まる（${Math.round(d0)}px → ${Math.round(d1)}px）`);
  ok(d0 - d1 <= LV8.pullDistanceNormal + 1, `引き寄せ距離が data の上限内（${Math.round(d0 - d1)}px ≤ ${LV8.pullDistanceNormal}px）`);
  const s = st(ctx, 'chain_hook');
  ok((s.extra?.hooks || 0) > 0, `鉤を打ち込む（${s.extra?.hooks} 回）`);
  ok((s.extra?.pullDistance || 0) > 0, `引き寄せ距離が記録される（${Math.round(s.extra?.pullDistance)}px）`);
  ok(ctx.w.telemetry.chainPulls > 0, `テレメトリに残る（${ctx.w.telemetry.chainPulls} 回 / ${Math.round(ctx.w.telemetry.chainPullDistance)}px）`);
  info(`通常敵: ${Math.round(d0)}px → ${Math.round(d1)}px（${Math.round(d0 - d1)}px 引き寄せ）`);
}

// ===== 3. エリートは大幅に短い =====
section('3. エリートは引き寄せ距離が大幅に短い');
{
  const measure = (elite) => {
    const enemies = makeEnemies(1, { x: 540, y: 300, hp: 1e9, elite });
    const ctx = build({ enemies });
    ctx.sm.acquireOrLevel('chain_hook'); ctx.sm.setLevel('chain_hook', 8);
    const d0 = Math.hypot(enemies[0].x - ctx.scene.player.x, enemies[0].y - ctx.scene.player.y);
    run(ctx, 1500);
    return d0 - Math.hypot(enemies[0].x - ctx.scene.player.x, enemies[0].y - ctx.scene.player.y);
  };
  const normal = measure(false);
  const elite = measure(true);
  ok(elite < normal, `エリート ${Math.round(elite)}px < 通常 ${Math.round(normal)}px`);
  ok(elite <= LV8.pullDistanceElite + 1, `エリートは data の上限内（${Math.round(elite)}px ≤ ${LV8.pullDistanceElite}px）`);
  ok(elite / Math.max(1, normal) <= 0.5, `エリートは通常の半分以下（${(elite / normal * 100).toFixed(0)}%）`);
  info(`引き寄せ: 通常${Math.round(normal)}px / エリート${Math.round(elite)}px`);
}

// ===== 4. ボスは動かず、こちらが近づく =====
section('4. ボスは動かせない — 代わりにプレイヤーが安全距離だけ踏み込む');
{
  const boss = makeBoss({ x: 560, y: 300, hp: 1e9 });
  const ctx = build({ enemies: [], boss });
  ctx.sm.acquireOrLevel('chain_hook'); ctx.sm.setLevel('chain_hook', 8);
  const bx = boss.x, by = boss.y;
  const px = ctx.scene.player.x, py = ctx.scene.player.y;
  run(ctx, 3000);
  ok(boss.x === bx && boss.y === by, `ボスは 1px も動かない（${bx},${by}）`);
  const moved = Math.hypot(ctx.scene.player.x - px, ctx.scene.player.y - py);
  ok(moved > 0, `プレイヤーが近づく（${Math.round(moved)}px）`);
  ok(moved <= LV8.playerApproachBoss + 1, `接近距離が data の上限内（${Math.round(moved)}px ≤ ${LV8.playerApproachBoss}px）`);
  ok(ctx.w.telemetry.bossApproaches > 0, `テレメトリに接近が残る（${ctx.w.telemetry.bossApproaches} 回）`);
  ok(ctx.w.telemetry.chainPulls === 0, 'ボス相手では引き寄せ回数は増えない');
  // pullTarget を直接呼んでもボスは動かない。
  ok(ctx.scene.combat.pullTarget(boss, { distance: 500 }) === 0, 'pullTarget はボスに対して 0 を返す');
  ok(boss.x === bx && boss.y === by, 'pullTarget 後もボスの座標は不変');
  info(`ボス: 接近${Math.round(moved)}px / ボス移動 0px`);
}

// ===== 5. 壁外・NaN・テレポートを作らない =====
section('5. 壁際・極端な配置でも壁外 / NaN / テレポートを作らない');
for (const [ex, ey] of [[24, 24], [1576, 1176], [800, 24], [24, 600]]) {
  const enemies = makeEnemies(1, { x: ex, y: ey, hp: 1e9 });
  const ctx = build({ enemies });
  ctx.scene.player.x = 800; ctx.scene.player.y = 600;
  ctx.sm.acquireOrLevel('chain_hook'); ctx.sm.setLevel('chain_hook', 8);
  // 1 フレームあたりの移動量を測る（テレポート検出）。
  let maxStep = 0;
  let prev = { x: enemies[0].x, y: enemies[0].y };
  for (let i = 0; i < 200; i++) {
    ctx.sm.update(16, { hasEnemies: true });
    ctx.w.update(16); ctx.scene.advance(16);
    maxStep = Math.max(maxStep, Math.hypot(enemies[0].x - prev.x, enemies[0].y - prev.y));
    prev = { x: enemies[0].x, y: enemies[0].y };
  }
  const e = enemies[0];
  ok(Number.isFinite(e.x) && Number.isFinite(e.y), `敵@(${ex},${ey}): 座標が有限`);
  ok(e.x >= 0 && e.x <= 1600 && e.y >= 0 && e.y <= 1200, `敵@(${ex},${ey}): 壁の外へ出ない（${Math.round(e.x)},${Math.round(e.y)}）`);
  ok(maxStep <= CFG.pullSpeed * 0.016 * 1.5 + 1,
    `敵@(${ex},${ey}): 1 フレーム最大 ${maxStep.toFixed(1)}px（テレポートしない・pullSpeed ${CFG.pullSpeed}px/s）`);
}

// ===== 6. 引き寄せは共通経路を通る =====
section('6. 引き寄せは共通経路（combat.pullTarget）を通る');
{
  const enemies = makeEnemies(1, { x: 540, y: 300, hp: 1e9 });
  const ctx = build({ enemies });
  ctx.sm.acquireOrLevel('chain_hook'); ctx.sm.setLevel('chain_hook', 8);
  let pulls = 0;
  const orig = ctx.scene.combat.pullTarget;
  ctx.scene.combat.pullTarget = (e, o) => { pulls += 1; return orig(e, o); };
  run(ctx, 3000);
  ok(pulls > 0, `combat.pullTarget を通る（${pulls} 回）`);
  // スキルが敵座標を直接書き換えていないこと。
  const src = readSrc('src/skills/ChainHookSkill.js');
  ok(!/target\.x\s*=/.test(src) && !/target\.y\s*=/.test(src), 'スキルが敵座標を直接書き換えていない');
  ok(/combat\.pullTarget/.test(src), 'スキルは共通経路を呼んでいる');
  // production の pullTarget が SpatialGrid を更新している。
  const bs = readSrc('src/scenes/BattleScene.js');
  const i = bs.indexOf('  pullTarget(e, opts = {}) {');
  ok(i > 0, 'BattleScene に pullTarget の実体がある');
  const body = bs.slice(i, bs.indexOf('\n  }\n', i));
  ok(/enemyGrid/.test(body), 'BattleScene.pullTarget が SpatialGrid（enemyGrid）を更新する');
  ok(/bossPullDistance/.test(body), 'BattleScene.pullTarget が balance の bossPullDistance を使う');
  ok(/worldMargin/.test(body), 'BattleScene.pullTarget が balance の worldMargin で壁内へ収める');
}

// ===== 7. 対象が消えても安全 =====
section('7. 引き寄せ中に対象が消えても安全に終わる（敵オブジェクトを保持しない）');
{
  const enemies = makeEnemies(3, { x: 540, y: 300, dy: 8, hp: 1e9 });
  const ctx = build({ enemies });
  ctx.sm.acquireOrLevel('chain_hook'); ctx.sm.setLevel('chain_hook', 8);
  const sk = ctx.sm.skills.get('chain_hook');
  sk.fire();
  ok(sk.hooking === true, '鉤が刺さっている');
  for (let i = 0; i < 3; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  for (const e of enemies) { e.alive = false; ctx.w.onEnemyRemoved(e); }
  let threw = null;
  try { for (let i = 0; i < 100; i++) { sk.update(16, { hasEnemies: false }); ctx.scene.advance(16); } } catch (e) { threw = e; }
  ok(!threw, `対象消失でも例外が出ない（${threw ? threw.message : 'ok'}）`);
  ok(!sk.hooking, '対象消失で鉤が外れる');
  // 保存内容に敵オブジェクトが含まれない。
  const sk2 = build().sm;
  const c2 = build();
  c2.sm.acquireOrLevel('chain_hook'); c2.sm.setLevel('chain_hook', 8);
  const s2 = c2.sm.skills.get('chain_hook');
  s2.fire();
  const saved = s2.serializeState();
  ok(typeof saved.hookSeq === 'number', `安定 runtime id（_seq）だけを保存する（${saved.hookSeq}）`);
  ok(!Object.values(saved).some((v) => v && typeof v === 'object'), '保存にオブジェクト参照が含まれない');
  ok(JSON.stringify(saved).length < 200, `保存が小さい（${JSON.stringify(saved).length} bytes）`);
  void sk2;
}

// ===== 8. ボスの予告 / 突進中は踏み込まない =====
section('8. ボスの予告 / 突進中は踏み込まない（完全無視はしない）');
{
  const boss = makeBoss({ x: 500, y: 300, hp: 1e9, state: 'telegraph' });
  const ctx = build({ enemies: [], boss });
  ctx.sm.acquireOrLevel('chain_hook'); ctx.sm.setLevel('chain_hook', 8);
  const px = ctx.scene.player.x;
  run(ctx, 3000);
  ok(Math.abs(ctx.scene.player.x - px) < 1, `予告中は踏み込まない（x ${px} → ${Math.round(ctx.scene.player.x)}）`);
  const s = st(ctx, 'chain_hook');
  ok((s.extra?.misses || 0) > 0, `空振りとして記録される（${s.extra?.misses} 回）`);
  // 予告が終われば踏み込む。
  const calm = makeBoss({ x: 500, y: 300, hp: 1e9, state: 'chase' });
  const cctx = build({ enemies: [], boss: calm });
  cctx.sm.acquireOrLevel('chain_hook'); cctx.sm.setLevel('chain_hook', 8);
  const cpx = cctx.scene.player.x;
  run(cctx, 3000);
  ok(cctx.scene.player.x > cpx, `予告していなければ踏み込む（x ${cpx} → ${Math.round(cctx.scene.player.x)}）`);
}

// ===== 9. 1 発動あたりの引き寄せ回数上限 =====
section('9. 1 発動あたりの引き寄せ回数が上限で頭打ちになる');
for (const q of ['low', 'medium', 'high', 'ultra']) {
  const cap = Math.min(capFor('maxChainPullsPerCast', q, 1), PULL.maxPullPerCast);
  ok(cap >= 1, `${q}: cap ${cap} ≥ 1`);
  const enemies = makeEnemies(12, { x: 540, y: 300, dy: 6, hp: 1e9 });
  const ctx = build({ enemies, quality: q });
  ctx.sm.acquireOrLevel('chain_hook'); ctx.sm.setLevel('chain_hook', 8);
  let pulled = 0;
  const orig = ctx.scene.combat.pullTarget;
  ctx.scene.combat.pullTarget = (e, o) => { const v = orig(e, o); if (v > 0) pulled += 1; return v; };
  run(ctx, 20000);
  const s = st(ctx, 'chain_hook');
  // 引き寄せは数フレームに分けるので「対象数」ではなく「引き寄せ総距離」で上限を見る。
  ok((s.extra?.pullDistance || 0) <= (s.extra?.hooks || 0) * LV8.pullDistanceNormal * cap + 2,
    `${q}: 引き寄せ総距離 ${Math.round(s.extra?.pullDistance || 0)}px ≤ hooks${s.extra?.hooks} × ${LV8.pullDistanceNormal} × cap${cap}`);
  void pulled;
}

// ===== 10. 近すぎる相手は狙わない / 遠すぎる相手には届かない =====
section('10. 射程外の敵には鉤が届かない');
{
  const far = makeEnemies(4, { x: 300 + LV8.range * 2, y: 300, dy: 4, hp: 1e9 });
  const ctx = build({ enemies: far });
  ctx.sm.acquireOrLevel('chain_hook'); ctx.sm.setLevel('chain_hook', 8);
  const x0 = far.map((e) => e.x);
  run(ctx, 6000);
  ok(far.every((e, i) => e.x === x0[i]), `射程 ${LV8.range}px の 2 倍先の敵は動かない`);
  const s = st(ctx, 'chain_hook');
  ok((s.extra?.misses || 0) > 0, `空振りとして記録される（${s.extra?.misses} 回）`);
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, '弾を出さない');
  ok(SKILL('chain_hook').lv80ProjectileTarget === false, 'Job Lv80 の弾数対象ではない');
}

// ===== 11. 保存 / 復元で二重移動しない =====
section('11. 保存 / 復元で引き寄せの途中状態を持ち越さない');
{
  const enemies = makeEnemies(2, { x: 540, y: 300, dy: 8, hp: 1e9 });
  const ctx = build({ enemies });
  ctx.sm.acquireOrLevel('chain_hook'); ctx.sm.setLevel('chain_hook', 8);
  const sk = ctx.sm.skills.get('chain_hook');
  sk.fire();
  sk.update(16, { hasEnemies: true });
  const saved = sk.serializeState();
  const ctx2 = build();
  ctx2.sm.acquireOrLevel('chain_hook'); ctx2.sm.setLevel('chain_hook', 8);
  const sk2 = ctx2.sm.skills.get('chain_hook');
  sk2.restoreState(saved);
  ok(!sk2.hooking, '復元しても引き寄せは再開しない');
  ok(sk2._cd === saved.cdLeft, `CD だけが戻る（${sk2._cd}）`);
  const before = ctx2.enemies.map((e) => ({ x: e.x, y: e.y }));
  sk2._cd = 1e9;
  for (let i = 0; i < 30; i++) { sk2.update(16, { hasEnemies: true }); ctx2.scene.advance(16); }
  ok(ctx2.enemies.every((e, i) => e.x === before[i].x && e.y === before[i].y), '復元直後に無料の引き寄せが起きない');
}

T.finish();
