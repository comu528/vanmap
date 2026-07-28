// 戦士 10/17: evolution3 の実動作（M8-B §15）。Node.js 標準機能のみ。
// - 3 進化すべてが発動し、基礎スキルと置換関係にある（同時稼働しない）
// - safetyCaps が実装から実際に参照され、上限を超えないこと
// - 血戦旋風の撃破延長が 1 発動あたり上限つきで、無限 duration にならないこと
// - 不落の城壁の反撃が 1 構え 1 回で、反撃から新しい構えが生まれないこと
// 実行: node tests/warrior-evolutions.mjs

import { DATA, WARRIOR, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, registryMap, skillSource, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 evolution3 実動作（M8-B）');
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
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};

// M8-C: 「構え」系の進化は発動時に攻撃しない（被弾に反応して反撃する）。命中を要求しない。
const STANCE_ONLY = new Set(['adamant_counter']);

// ===== 1. 進化すべてが発動・命中 =====
section('1. evolution（構え系を除く）すべてが発動し、命中してダメージを与える');
for (const id of EXPECTED.evolutions) {
  if (STANCE_ONLY.has(id)) continue;
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  run(ctx);
  const st = ctx.sm.statsList().find((s) => s.id === id) || {};
  ok((st.casts || 0) > 0, `${id}: 発動する（casts ${st.casts}）`);
  ok((st.hits || 0) > 0, `${id}: 命中する（hits ${st.hits}）`);
  ok((st.damage || 0) > 0, `${id}: ダメージを与える（${Math.round(st.damage)}）`);
  info(`${id}: cast${st.casts} hit${st.hits} dmg${Math.round(st.damage)} extra=${JSON.stringify(st.extra)}`);
}

// ===== 2. 置換関係（進化後は基礎スキルが消える）=====
section('2. 進化は基礎 active と置換関係（同時稼働しない）');
for (const id of EXPECTED.evolutions) {
  const e = DATA.evolutions.find((x) => x.id === id);
  const ctx = build();
  ctx.sm.acquireOrLevel(e.baseSkillId);
  ctx.sm.setLevel(e.baseSkillId, 8);
  const evoId = ctx.sm.evolve(e.baseSkillId);
  ok(evoId === id, `${e.baseSkillId} → ${id} へ進化する`);
  ok(!ctx.sm.skills.has(e.baseSkillId), `${e.baseSkillId}: 進化後は基礎スキルが消える`);
  ok(ctx.sm.skills.has(id), `${id}: 進化後スキルが稼働する`);
  run(ctx, 5000);
  const baseSt = ctx.sm.statsList().find((s) => s.id === e.baseSkillId);
  ok(!baseSt || (baseSt.casts || 0) === 0, `${e.baseSkillId}: 進化後に基礎スキルが発動しない`);
}

// ===== 3. safetyCaps が実装から参照される =====
section('3. 宣言した safetyCaps がすべて実装から参照される（死にフィールドなし）');
{
  const map = registryMap();
  for (const id of EXPECTED.evolutions) {
    const e = DATA.evolutions.find((x) => x.id === id);
    const src = skillSourceDeep(id, map) || '';
    for (const key of Object.keys(e.safetyCaps || {})) {
      ok(src.includes(`'${key}'`) || src.includes(`"${key}"`), `${id}: safetyCaps.${key} を実装が参照する`);
    }
    // 宣言した数値ブロックも参照されていること（死にフィールド禁止）。
    for (const block of ['damage', 'area', 'knockback', 'poiseDamage', 'comboGain', 'furyGain', 'projectileCount', 'mitigation', 'counterWindow', 'killExtend']) {
      if (!e[block]) continue;
      for (const key of Object.keys(e[block])) {
        ok(src.includes(key), `${id}: ${block}.${key} を実装が参照する`);
      }
    }
  }
}

// ===== 4. 千刃乱舞: 打撃数と cast 上限 =====
section('4. 千刃乱舞: 多段でも 1 発動 = 1 cast、コンボ/闘気は上限内');
{
  const e = DATA.evolutions.find((x) => x.id === 'thousand_blade_dance');
  const ctx = build();
  ctx.sm.acquireOrLevel('thousand_blade_dance');
  run(ctx, 8000);
  const st = ctx.sm.statsList().find((s) => s.id === 'thousand_blade_dance') || {};
  const maxCasts = Math.ceil(8000 / e.cooldown) + 2;
  ok((st.casts || 0) <= maxCasts, `cast ${st.casts} ≤ ${maxCasts}`);
  // 最後の発動の締めは遅延実行の途中なので、casts と casts-1 の両方を許容する。
  ok((st.extra?.finales || 0) === (st.casts || 0) || (st.extra?.finales || 0) === (st.casts || 0) - 1,
    `締めの全周斬りは 1 発動 1 回（${st.extra?.finales} / ${st.casts}）`);
  ok((st.extra?.strikes || 0) <= (st.casts || 0) * e.safetyCaps.maxStrikesPerCast, `打撃数 ${st.extra?.strikes} が maxStrikesPerCast 以内`);
  // 1 発動あたりのコンボ・闘気は data の maxPerCast 以内。
  const perCastCombo = ctx.w.telemetry.comboPeak / Math.max(1, st.casts);
  ok(perCastCombo <= e.comboGain.maxPerCast + 1e-6, `1 発動あたりのコンボ寄与 ${perCastCombo.toFixed(2)} ≤ ${e.comboGain.maxPerCast}`);
  info(`千刃乱舞: cast${st.casts} 打撃${st.extra?.strikes} 締め${st.extra?.finales}`);
}

// ===== 5. 血戦旋風: 撃破延長の上限 =====
section('5. 血戦旋風: 撃破で延長するが 1 発動あたり上限があり、無限 duration にならない');
{
  const e = DATA.evolutions.find((x) => x.id === 'bloodstorm_whirlwind');
  // 大量の弱い敵で延長を狙う。
  const ctx = build({ enemies: makeEnemies(200, { x: 300, y: 300, dy: 0, hp: 1 }) });
  ctx.sm.acquireOrLevel('bloodstorm_whirlwind');
  run(ctx, 12000);
  const st = ctx.sm.statsList().find((s) => s.id === 'bloodstorm_whirlwind') || {};
  const spins = st.extra?.spins || 0;
  const maxActive = spins * e.safetyCaps.maxSpinDurationMs;
  ok((st.extra?.activeMs || 0) <= maxActive + 1, `稼働時間 ${Math.round(st.extra?.activeMs)}ms ≤ maxSpinDurationMs × ${spins} = ${maxActive}`);
  ok((st.extra?.killExtensions || 0) <= spins * e.safetyCaps.maxKillExtendPerCast, `延長回数 ${st.extra?.killExtensions} が maxKillExtendPerCast × ${spins} 以内`);
  info(`血戦旋風: 回転${spins} 延長${st.extra?.killExtensions || 0} 稼働${Math.round(st.extra?.activeMs || 0)}ms`);
  // 敵がいない間は延長されない。
  const empty = build({ enemies: makeEnemies(1, { x: 300, y: 300, hp: 1e9 }) });
  empty.sm.acquireOrLevel('bloodstorm_whirlwind');
  run(empty, 12000);
  const es = empty.sm.statsList().find((s) => s.id === 'bloodstorm_whirlwind') || {};
  ok((es.extra?.killExtensions || 0) === 0, '撃破が起きなければ延長されない');
}
{
  // 撃破延長が「自分の攻撃で倒したとき」だけであること。
  const ctx = build({ enemies: makeEnemies(20, { x: 300, y: 300, dy: 0, hp: 1e9 }) });
  ctx.sm.acquireOrLevel('bloodstorm_whirlwind');
  run(ctx, 2000);
  const sk = ctx.sm.skills.get('bloodstorm_whirlwind');
  const before = (ctx.sm.statsList().find((s) => s.id === 'bloodstorm_whirlwind')?.extra?.killExtensions) || 0;
  sk.onEnemyKilled(ctx.enemies[0], 'great_cleave');
  const after = (ctx.sm.statsList().find((s) => s.id === 'bloodstorm_whirlwind')?.extra?.killExtensions) || 0;
  ok(after === before, '他スキルの撃破では延長しない');
}

// ===== 6. 不落の城壁: 反撃は 1 構え 1 回 =====
section('6. 不落の城壁: 反撃は 1 構えにつき 1 回・反撃から新しい構えが生まれない');
{
  const e = DATA.evolutions.find((x) => x.id === 'unyielding_fortress');
  const ctx = build();
  ctx.sm.acquireOrLevel('unyielding_fortress');
  run(ctx, 3000);
  const sk = ctx.sm.skills.get('unyielding_fortress');
  ok(typeof sk.onPlayerHit === 'function', 'onPlayerHit を公開する（被弾フック）');
  ok(typeof sk.activeMitigation === 'function', 'activeMitigation を公開する');
  // 構えを新しく張ってから 5 連続被弾。
  sk.fire();
  let counters = 0;
  for (let i = 0; i < 5; i++) if (sk.onPlayerHit(10, 8)) counters++;
  ok(counters === e.counterWindow.maxCountersPerWindow, `5 連続被弾でも反撃は ${e.counterWindow.maxCountersPerWindow} 回（実際 ${counters}）`);
  const castsBefore = (ctx.sm.statsList().find((s) => s.id === 'unyielding_fortress') || {}).casts;
  ok(sk.onPlayerHit(10, 8) === false, '構えを使い切ったら反撃しない');
  const castsAfter = (ctx.sm.statsList().find((s) => s.id === 'unyielding_fortress') || {}).casts;
  ok(castsBefore === castsAfter, '反撃は recordCast を増やさない（無限 cast にならない）');
  // 構えが切れれば再び反撃できる（新しい fire が必要）。
  for (let i = 0; i < Math.ceil(e.counterWindow.durationMs / 16) + 2; i++) { ctx.sm.update(16, { hasEnemies: false }); ctx.scene.advance(16); }
  ok(sk.onPlayerHit(10, 8) === false, '構えが切れている間は反撃しない');
}
{
  // 反撃は闘気・コンボを増やさない（data の perCounter = 0）。
  const e = DATA.evolutions.find((x) => x.id === 'unyielding_fortress');
  ok(e.comboGain.perCounter === 0 && e.furyGain.perCounter === 0, '反撃の comboGain / furyGain は data で 0');
  const ctx = build();
  ctx.sm.acquireOrLevel('unyielding_fortress');
  const sk = ctx.sm.skills.get('unyielding_fortress');
  sk.fire();
  const furyBefore = ctx.w.fury, comboBefore = ctx.w.combo;
  sk.onPlayerHit(10, 8);
  ok(ctx.w.fury === furyBefore, '反撃で闘気が増えない');
  ok(ctx.w.combo === comboBefore, '反撃でコンボが増えない');
}

// ===== 7. 進化も残響 / 分身の対象外 =====
section('7. 戦士の進化は残響 / 分身の対象外');
{
  const map = registryMap();
  for (const id of EXPECTED.evolutions) {
    const e = DATA.evolutions.find((x) => x.id === id);
    ok(e.echoPolicy === 'forbidden' && e.clonePolicy === 'forbidden', `${id}: data で forbidden`);
    ok(e.canTriggerEcho === false && e.canBeCopiedByClone === false, `${id}: フラグも false`);
    const src = skillSource(id, map) || '';
    ok(!/echoCast|cloneCast/.test(src), `${id}: echoCast / cloneCast を実装していない`);
  }
}

// ===== 8. 敵ゼロ・ボスのみで例外を出さない =====
section('8. 敵ゼロ / ボスのみで例外を出さない');
for (const id of EXPECTED.evolutions) {
  let threw = null;
  try {
    const empty = build({ enemies: [] });
    empty.sm.acquireOrLevel(id);
    run(empty, 4000);
    const bossOnly = build({ enemies: [], boss: makeBoss() });
    bossOnly.sm.acquireOrLevel(id);
    run(bossOnly, 4000);
  } catch (e) { threw = e; }
  ok(!threw, `${id}: 例外を出さない（${threw ? threw.message : 'ok'}）`);
}

// ===== 9. 進化前後の比較（役割が変わる）=====
section('9. 進化で役割が広がる（データ次元の比較）');
for (const id of EXPECTED.evolutions) {
  const e = DATA.evolutions.find((x) => x.id === id);
  const base = DATA.skills.find((s) => s.id === e.baseSkillId);
  const lv8 = base.levels[7];
  const baseDims = Object.keys(lv8).length;
  const evoDims = ['damage', 'area', 'knockback', 'poiseDamage', 'projectileCount', 'mitigation', 'counterWindow', 'killExtend']
    .filter((k) => e[k]).reduce((n, k) => n + Object.keys(e[k]).length, 0);
  ok(evoDims >= 4, `${id}: 進化が持つ数値次元 ${evoDims} ≥ 4`);
  ok(e.cooldown > 0, `${id}: cooldown ${e.cooldown}ms が明示されている`);
  info(`${id}: 基礎 Lv8 次元 ${baseDims} → 進化 次元 ${evoDims}（CD ${lv8.cooldown} → ${e.cooldown}）`);
}

void WARRIOR;
T.finish();
