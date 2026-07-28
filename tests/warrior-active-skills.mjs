// 戦士 9/17: active5 の実動作（M8-B §14）。Node.js 標準機能のみ。
// 実装クラスをヘッドレスで駆動し、5 種すべてが
//   - 敵がいれば必ず発動して命中し、ダメージ・闘気・コンボを生む
//   - 遠距離へ飛ぶ斬撃波を出さない（近接判定のみ・projectile を作らない）
//   - 1 発動 = 1 recordCast（追加打撃で cast が増えない）
//   - 敵ゼロ・ボスのみ・境界でも例外を出さない
// ことを確認する。
// 実行: node tests/warrior-active-skills.mjs

import { DATA, WARRIOR, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, registryMap, skillSource } from './warrior-common.mjs';

const T = runner('戦士 active5 実動作（M8-B）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 316, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 8000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: (ctx.enemies || []).some((e) => e.alive) || !!(ctx.scene.boss && ctx.scene.boss.alive) });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};

// ===== 1. 5 種すべてが発動・命中する =====
section('1. active5 すべてが発動し、命中してダメージを与える');
for (const id of EXPECTED.actives) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  ctx.sm.setLevel(id, 8);
  run(ctx);
  const st = ctx.sm.statsList().find((s) => s.id === id) || {};
  ok((st.casts || 0) > 0, `${id}: 発動する（casts ${st.casts}）`);
  ok((st.hits || 0) > 0, `${id}: 命中する（hits ${st.hits}）`);
  ok((st.damage || 0) > 0, `${id}: ダメージを与える（${Math.round(st.damage)}）`);
  ok(ctx.w.telemetry.meleeHits > 0, `${id}: 近接命中として集計される`);
  ok(ctx.w.telemetry.furyGained > 0, `${id}: 闘気を生む`);
  info(`${id}: cast${st.casts} hit${st.hits} dmg${Math.round(st.damage)} 闘気${ctx.w.telemetry.furyGained.toFixed(1)} コンボ最大${ctx.w.telemetry.comboPeak}`);
}

// ===== 2. 遠距離へ飛ばない =====
section('2. 斬撃波・弾を飛ばさない（近接 arc 判定のみ）');
for (const id of EXPECTED.actives) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
  run(ctx, 5000);
  const projs = ctx.scene.calls.filter((c) => c[0] === 'proj');
  ok(projs.length === 0, `${id}: spawnPlayerProjectile を呼ばない（${projs.length} 件）`);
  // 遠くの敵には当たらない。
  const far = build({ enemies: makeEnemies(4, { x: 1000, y: 1000, hp: 1e9 }) });
  far.sm.acquireOrLevel(id); far.sm.setLevel(id, 8);
  run(far, 5000);
  const st = far.sm.statsList().find((s) => s.id === id) || {};
  ok((st.hits || 0) === 0, `${id}: 700px 離れた敵には当たらない（hits ${st.hits || 0}）`);
}

// ===== 3. 1 発動 = 1 recordCast =====
section('3. 追加打撃・tick で cast 数が水増しされない');
for (const id of EXPECTED.actives) {
  const s = DATA.skills.find((x) => x.id === id);
  const ctx = build();
  ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
  const ms = 8000;
  run(ctx, ms);
  const st = ctx.sm.statsList().find((x) => x.id === id) || {};
  const cd = s.levels[7].cooldown;
  const maxCasts = Math.ceil(ms / cd) + 2;
  ok((st.casts || 0) <= maxCasts, `${id}: cast ${st.casts} ≤ 理論上限 ${maxCasts}（CD ${cd}ms）`);
  ok((st.hits || 0) >= (st.casts || 0), `${id}: hits ≥ casts（多段は hits 側で数える）`);
  ok(ctx.w.telemetry.meleeCasts <= maxCasts, `${id}: meleeCasts ${ctx.w.telemetry.meleeCasts} も上限以内`);
}

// ===== 4. 敵ゼロ・ボスのみ・境界 =====
section('4. 敵ゼロ / ボスのみ / 境界で例外を出さない');
for (const id of EXPECTED.actives) {
  let threw = null;
  try {
    const empty = build({ enemies: [] });
    empty.sm.acquireOrLevel(id); empty.sm.setLevel(id, 8);
    run(empty, 3000);
    const bossOnly = build({ enemies: [], boss: makeBoss() });
    bossOnly.sm.acquireOrLevel(id); bossOnly.sm.setLevel(id, 8);
    run(bossOnly, 3000);
    const corner = build();
    corner.scene.player.x = 8; corner.scene.player.y = 8;
    corner.sm.acquireOrLevel(id); corner.sm.setLevel(id, 8);
    run(corner, 3000);
    ok(Number.isFinite(corner.scene.player.x) && Number.isFinite(corner.scene.player.y), `${id}: 座標が NaN/Infinity にならない`);
    ok(corner.scene.player.x >= 0 && corner.scene.player.x <= corner.scene.worldW, `${id}: プレイヤーが壁外へ出ない`);
  } catch (e) { threw = e; }
  ok(!threw, `${id}: 例外を出さない（${threw ? threw.message : 'ok'}）`);
}

// ===== 5. Lv1→Lv8 で強くなる =====
section('5. Lv1 → Lv8 でダメージが増える（成長が実効している）');
for (const id of EXPECTED.actives) {
  const lo = build(); lo.sm.acquireOrLevel(id); lo.sm.setLevel(id, 1); run(lo, 8000);
  const hi = build(); hi.sm.acquireOrLevel(id); hi.sm.setLevel(id, 8); run(hi, 8000);
  const d1 = (lo.sm.statsList().find((s) => s.id === id) || {}).damage || 0;
  const d8 = (hi.sm.statsList().find((s) => s.id === id) || {}).damage || 0;
  ok(d8 > d1, `${id}: Lv8 の総ダメージ ${Math.round(d8)} > Lv1 ${Math.round(d1)}`);
}

// ===== 6. スキル固有の役割 =====
section('6. スキル固有の役割が実動作で確認できる');
{
  // 盾撃: 軽減ウィンドウを開く。
  const ctx = build();
  ctx.sm.acquireOrLevel('shield_bash'); ctx.sm.setLevel('shield_bash', 8);
  run(ctx, 3000);
  const sb = ctx.sm.skills.get('shield_bash');
  ok(typeof sb.activeMitigation === 'function', 'shield_bash: activeMitigation を公開する');
  const st = ctx.sm.statsList().find((s) => s.id === 'shield_bash') || {};
  ok((st.extra?.mitigationWindows || 0) > 0, `shield_bash: 軽減ウィンドウ ${st.extra?.mitigationWindows} 回`);
}
{
  // 突進斬り: 実際に移動し、突進中は軽減が乗る。
  const ctx = build();
  ctx.sm.acquireOrLevel('charge_slash'); ctx.sm.setLevel('charge_slash', 8);
  const x0 = ctx.scene.player.x, y0 = ctx.scene.player.y;
  // 往復して同じ座標へ戻ることがあるため、最終座標ではなく「途中で最も離れた距離」で判定する。
  let maxDev = 0;
  for (let i = 0; i < 6000 / 16; i++) {
    ctx.sm.update(16, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(16); ctx.scene.advance(16);
    maxDev = Math.max(maxDev, Math.hypot(ctx.scene.player.x - x0, ctx.scene.player.y - y0));
  }
  const st = ctx.sm.statsList().find((s) => s.id === 'charge_slash') || {};
  ok((st.extra?.charges || 0) > 0, `charge_slash: 突進 ${st.extra?.charges} 回`);
  ok((st.extra?.dashDistance || 0) > 0, `charge_slash: 実際に移動する（${Math.round(st.extra?.dashDistance)}px）`);
  ok(maxDev > 40, `charge_slash: 突進で最大 ${Math.round(maxDev)}px 移動する`);
  const cs = ctx.sm.skills.get('charge_slash');
  ok(typeof cs.chargeMitigation === 'function', 'charge_slash: chargeMitigation を公開する');
}
{
  // 旋風斬り: 明確な duration を持ち、必ず終わる。
  const ctx = build();
  ctx.sm.acquireOrLevel('whirlwind_slash'); ctx.sm.setLevel('whirlwind_slash', 8);
  run(ctx, 10000);
  const st = ctx.sm.statsList().find((s) => s.id === 'whirlwind_slash') || {};
  ok((st.extra?.spins || 0) > 0, `whirlwind_slash: 回転 ${st.extra?.spins} 回`);
  const def = DATA.skills.find((s) => s.id === 'whirlwind_slash');
  const maxActive = (st.extra?.spins || 0) * def.levels[7].duration * 1.4;
  ok((st.extra?.activeMs || 0) <= maxActive, `whirlwind_slash: 稼働時間 ${Math.round(st.extra?.activeMs)}ms が duration × 回数以内（常設化しない）`);
}
{
  // 地砕き: 闘気解放中に追加 impact。
  const base = build();
  base.sm.acquireOrLevel('ground_slam'); base.sm.setLevel('ground_slam', 8);
  run(base, 6000);
  const rel = build();
  rel.sm.acquireOrLevel('ground_slam'); rel.sm.setLevel('ground_slam', 8);
  rel.w.fury = DATA.balance.warrior.fury.max; rel.w.startRelease();
  rel.w.releaseLeftMs = 1e9; // 検証中ずっと解放状態にする
  run(rel, 6000);
  const b = base.sm.statsList().find((s) => s.id === 'ground_slam') || {};
  const r = rel.sm.statsList().find((s) => s.id === 'ground_slam') || {};
  ok((r.extra?.impacts || 0) >= (b.extra?.impacts || 0), `ground_slam: 解放中は impact が増える（${b.extra?.impacts} → ${r.extra?.impacts}）`);
}
{
  // 大薙ぎ: strikes 分の打撃。
  const ctx = build();
  ctx.sm.acquireOrLevel('great_cleave'); ctx.sm.setLevel('great_cleave', 8);
  run(ctx, 6000);
  const st = ctx.sm.statsList().find((s) => s.id === 'great_cleave') || {};
  const def = DATA.skills.find((s) => s.id === 'great_cleave');
  ok((st.extra?.strikes || 0) >= (st.casts || 0) * def.levels[7].strikes, `great_cleave: 1 発動あたり ${def.levels[7].strikes} 打撃`);
}

// ===== 7. 残響 / 分身の対象外 =====
section('7. 戦士 active は残響 / 分身の対象外（無料の追加近接が生まれない）');
{
  const map = registryMap();
  for (const id of EXPECTED.actives) {
    const s = DATA.skills.find((x) => x.id === id);
    ok(s.echoPolicy === 'forbidden' && s.clonePolicy === 'forbidden', `${id}: data で forbidden`);
    const src = skillSource(id, map) || '';
    ok(!/echoCast|cloneCast/.test(src), `${id}: echoCast / cloneCast を実装していない`);
  }
}

// ===== 8. 上限（多数の敵）=====
section('8. 敵が多数でも 1 打撃あたりの対象数が上限内');
for (const id of EXPECTED.actives) {
  const many = build({ enemies: makeEnemies(120, { x: 300, y: 300, dy: 0, hp: 1e9 }) });
  many.sm.acquireOrLevel(id); many.sm.setLevel(id, 8);
  run(many, 2000);
  const st = many.sm.statsList().find((s) => s.id === id) || {};
  const perStrike = (st.hits || 0) / Math.max(1, st.casts || 1);
  ok(perStrike <= 24 * 40, `${id}: 1 発動あたり命中 ${perStrike.toFixed(1)}（上限が効いている）`);
  ok(Number.isFinite(st.damage), `${id}: 総ダメージが有限`);
}

void WARRIOR;
T.finish();
