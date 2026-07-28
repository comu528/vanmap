// 戦士 Wave1 5/19: 兜割り / 双牙斬（M8-C §5-1, §5-2）。Node.js 標準機能のみ。
// 「単体高体勢」「高速コンボ builder」という 2 つの役割が実装として成立していることを見る。
//   兜割り  : 硬い相手（エリート/ボス）を優先して狙い、1 発あたりの体勢削りが大きく、
//             同一敵への体勢削りは 1 発動 1 回。Job Lv80 で打撃が増えても cast は増えない。
//   双牙斬  : 素早い 2 連斬りでコンボを積む。2 撃目は広く、倍率がかかる。
// 実行: node tests/warrior-armor-breaker.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, capFor } from './warrior-common.mjs';

const T = runner('戦士 兜割り / 双牙斬（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const SKILL = (id) => DATA.skills.find((x) => x.id === id);

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 316, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  if (opts.lv80) sm.setJobLevel ? sm.setJobLevel(80) : null;
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
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. 兜割り: 硬い相手を優先して狙う =====
section('1. 兜割り: エリート/ボスが射程内にいれば、通常敵より優先して狙う');
{
  // 通常敵をプレイヤーの右、エリートを左に置く。preferTough なら左（エリート）へ向く。
  const normals = makeEnemies(4, { x: 340, y: 300, dy: 2, hp: 1e9 });
  const elite = makeEnemies(1, { x: 240, y: 300, dy: 0, hp: 1e9, elite: true })[0];
  const ctx = build({ enemies: [...normals, elite] });
  ctx.sm.acquireOrLevel('armor_breaker');
  ctx.sm.setLevel('armor_breaker', 8);
  run(ctx, 8000);
  const hitsOnElite = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === 'armor_breaker' && c[2] === elite).length;
  const hitsOnNormal = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === 'armor_breaker' && c[2] !== elite).length;
  ok(hitsOnElite > 0, `エリートへ命中する（${hitsOnElite} 発）`);
  ok(hitsOnElite >= hitsOnNormal, `エリートを優先する（エリート ${hitsOnElite} ≥ 通常 ${hitsOnNormal}）`);
  // ボスがいればボスを最優先。
  const boss = makeBoss({ x: 240, y: 300, hp: 1e9 });
  const bctx = build({ enemies: makeEnemies(4, { x: 340, y: 300, dy: 2, hp: 1e9 }), boss });
  bctx.sm.acquireOrLevel('armor_breaker');
  bctx.sm.setLevel('armor_breaker', 8);
  run(bctx, 8000);
  const bossHits = bctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === 'armor_breaker' && c[2] === boss).length;
  ok(bossHits > 0, `ボスへ命中する（${bossHits} 発）`);
  info(`兜割り: エリート${hitsOnElite}/通常${hitsOnNormal} ボス${bossHits}`);
}

// ===== 2. 兜割り: 単体高体勢（1 発あたりの体勢削りが大きい）=====
section('2. 兜割り: 単体高体勢 — 1 発あたりの体勢削りが戦士 active の中で最大級');
{
  const ab = SKILL('armor_breaker').levels[7];
  const others = ['great_cleave', 'whirlwind_slash', 'twin_fang_slash', 'sweeping_advance', 'relentless_combo'];
  for (const id of others) {
    const o = SKILL(id).levels[7];
    ok(ab.poiseDamage > o.poiseDamage, `1 発の体勢削り ${ab.poiseDamage} > ${id} ${o.poiseDamage}`);
  }
  // 範囲は狭く、回転も遅い（単体向け）。
  ok(ab.width <= 1.2, `振りが狭い（arc ${ab.width} rad）`);
  ok(ab.cooldown >= SKILL('twin_fang_slash').levels[7].cooldown * 2, `回転が遅い（CD ${ab.cooldown}ms）`);
  // 実測: 1 発動あたりの当たり数が少ない（単体寄り）。
  const ctx = build({ enemies: makeEnemies(16, { x: 320, y: 300, dy: 2, hp: 1e9 }) });
  ctx.sm.acquireOrLevel('armor_breaker'); ctx.sm.setLevel('armor_breaker', 8);
  run(ctx, 8000);
  const s = st(ctx, 'armor_breaker');
  const perCast = (s.hits || 0) / Math.max(1, s.casts || 0);
  // 全周範囲技（旋風斬）と比べて明確に少ないこと。絶対値ではなく比較で見る。
  const wctx = build({ enemies: makeEnemies(16, { x: 320, y: 300, dy: 2, hp: 1e9 }) });
  wctx.sm.acquireOrLevel('whirlwind_slash'); wctx.sm.setLevel('whirlwind_slash', 8);
  run(wctx, 8000);
  const ws2 = st(wctx, 'whirlwind_slash');
  const wPerCast = (ws2.hits || 0) / Math.max(1, ws2.casts || 0);
  ok(perCast < wPerCast, `密集 16 体で 1 発動あたり ${perCast.toFixed(1)} 体 < 旋風斬 ${wPerCast.toFixed(1)} 体（範囲技ではない）`);
  info(`兜割り: 体勢${ab.poiseDamage}/発 1発動あたり${perCast.toFixed(1)}体`);
}

// ===== 3. 兜割り: 同一敵への体勢削りは 1 発動 1 回 =====
section('3. 兜割り: 追加打撃があっても同一敵への体勢削りは 1 発動 1 回');
{
  const ab = SKILL('armor_breaker').levels[7];
  const single = makeEnemies(1, { x: 340, y: 300, hp: 1e9 });
  const ctx = build({ enemies: single });
  ctx.sm.acquireOrLevel('armor_breaker'); ctx.sm.setLevel('armor_breaker', 8);
  // Job Lv80 相当の追加打撃を強制する（strikeCount が +1 される状況を再現）。
  const sk = ctx.sm.skills.get('armor_breaker');
  const origStrike = sk.strikeCount.bind(sk);
  sk.strikeCount = (n) => origStrike(n) + 1;
  run(ctx, 8000);
  const s = st(ctx, 'armor_breaker');
  const ws = ctx.scene._warriorSkillStats.armor_breaker || {};
  ok((s.extra?.strikes || 0) > (s.casts || 0), `追加打撃が出ている（打撃 ${s.extra?.strikes} > cast ${s.casts}）`);
  ok((ws.poiseDamage || 0) <= (s.casts || 0) * ab.poiseDamage * 1.6 + 1,
    `体勢削り ${Math.round(ws.poiseDamage || 0)} が 1 発動 1 回ぶんに収まる（打撃数ぶん二重に削らない）`);
  ok((s.casts || 0) <= Math.ceil(8000 / ab.cooldown) + 2, `追加打撃で cast が水増しされない（${s.casts}）`);
  info(`兜割り: cast${s.casts} 打撃${s.extra?.strikes} 体勢${Math.round(ws.poiseDamage || 0)}`);
}

// ===== 4. 兜割り: 打撃数は品質別 cap で必ず頭打ち =====
section('4. 兜割り: 打撃数は maxOverheadStrikes で頭打ちになる');
for (const q of ['low', 'medium', 'high', 'ultra']) {
  const cap = capFor('maxOverheadStrikes', q, 3);
  const ctx = build({ quality: q });
  ctx.sm.acquireOrLevel('armor_breaker'); ctx.sm.setLevel('armor_breaker', 8);
  const sk = ctx.sm.skills.get('armor_breaker');
  sk.strikeCount = () => 99; // 上限を無視しようとしても cap で止まる
  run(ctx, 6000);
  const s = st(ctx, 'armor_breaker');
  ok((s.extra?.strikes || 0) <= (s.casts || 0) * cap, `${q}: 打撃 ${s.extra?.strikes} ≤ cap${cap} × cast${s.casts}`);
}

// ===== 5. 双牙斬: 2 連斬りで、2 撃目が広く強い =====
section('5. 双牙斬: 1 発動で 2 連斬りし、2 撃目は広く倍率がかかる');
{
  const tf = SKILL('twin_fang_slash').levels[7];
  ok(tf.strikes === 2, `data 上 2 連斬り（strikes ${tf.strikes}）`);
  ok(tf.secondStrikeMultiplier > 1, `2 撃目に倍率がある（×${tf.secondStrikeMultiplier}）`);
  ok(SKILL('twin_fang_slash').config.secondArcBonus > 0, `2 撃目は広い（+${SKILL('twin_fang_slash').config.secondArcBonus} rad）`);
  const ctx = build({ enemies: makeEnemies(1, { x: 330, y: 300, hp: 1e9 }) });
  ctx.sm.acquireOrLevel('twin_fang_slash'); ctx.sm.setLevel('twin_fang_slash', 8);
  run(ctx, 8000);
  const s = st(ctx, 'twin_fang_slash');
  ok((s.extra?.strikes || 0) >= (s.casts || 0) * 2 - 2, `2 連斬りが出ている（打撃 ${s.extra?.strikes} / cast ${s.casts}）`);
  // 実ダメージに 1 撃目 / 2 撃目の差が現れる。
  const dmgs = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === 'twin_fang_slash').map((c) => c[3]);
  const uniq = [...new Set(dmgs.map((d) => Math.round(d * 100)))];
  ok(uniq.length >= 2, `1 撃目と 2 撃目でダメージが違う（${uniq.length} 種）`);
  ok(Math.max(...dmgs) / Math.min(...dmgs) <= tf.secondStrikeMultiplier + 1e-6,
    `倍率は data どおり（実測 ×${(Math.max(...dmgs) / Math.min(...dmgs)).toFixed(2)} ≤ ×${tf.secondStrikeMultiplier}）`);
  info(`双牙斬: cast${s.casts} 打撃${s.extra?.strikes} ダメージ ${Math.min(...dmgs).toFixed(1)}〜${Math.max(...dmgs).toFixed(1)}`);
}

// ===== 6. 双牙斬: コンボ builder として最速級 =====
section('6. 双牙斬: 戦士 active の中で最も速くコンボを積める');
{
  const tf = SKILL('twin_fang_slash').levels[7];
  for (const id of ['great_cleave', 'armor_breaker', 'ground_slam', 'shockwave_stomp', 'leap_smash']) {
    ok(tf.cooldown < SKILL(id).levels[7].cooldown, `CD ${tf.cooldown}ms < ${id} ${SKILL(id).levels[7].cooldown}ms`);
  }
  // 同じ時間・同じ敵配置でコンボ到達値を比べる（兜割りより速く積める）。
  const peak = (id) => {
    const ctx = build({ enemies: makeEnemies(8, { x: 320, y: 300, dy: 3, hp: 1e9 }) });
    ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
    run(ctx, 8000);
    return ctx.w.telemetry.comboPeak;
  };
  const twin = peak('twin_fang_slash');
  const armor = peak('armor_breaker');
  ok(twin > armor, `コンボ到達 双牙斬 ${twin} > 兜割り ${armor}`);
  info(`コンボ到達: 双牙斬${twin} / 兜割り${armor}`);
}

// ===== 7. 双牙斬: 打撃数は品質別 cap で頭打ち・cast は増えない =====
section('7. 双牙斬: 打撃数は maxTwinFangStrikes で頭打ち、cast は水増しされない');
for (const q of ['low', 'medium', 'high', 'ultra']) {
  const cap = capFor('maxTwinFangStrikes', q, 3);
  const ctx = build({ quality: q });
  ctx.sm.acquireOrLevel('twin_fang_slash'); ctx.sm.setLevel('twin_fang_slash', 8);
  const sk = ctx.sm.skills.get('twin_fang_slash');
  sk.strikeCount = () => 99;
  run(ctx, 6000);
  const s = st(ctx, 'twin_fang_slash');
  ok((s.extra?.strikes || 0) <= (s.casts || 0) * cap, `${q}: 打撃 ${s.extra?.strikes} ≤ cap${cap} × cast${s.casts}`);
  const cd = SKILL('twin_fang_slash').levels[7].cooldown;
  ok((s.casts || 0) <= Math.ceil(6000 / cd) + 2, `${q}: cast ${s.casts} が CD どおり`);
}

// ===== 8. 両者とも Job Lv80 の弾数対象で、遠距離へ飛ばない =====
section('8. 両者は Job Lv80 の対象だが、遠距離へは一切飛ばない');
for (const id of ['armor_breaker', 'twin_fang_slash']) {
  ok(SKILL(id).lv80ProjectileTarget === true, `${id}: Job Lv80 の弾数（打撃数）対象`);
  const ctx = build({ enemies: makeEnemies(6, { x: 900, y: 900, hp: 1e9 }) });
  ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
  run(ctx, 6000);
  const s = st(ctx, id);
  ok((s.hits || 0) === 0, `${id}: 600px 離れた敵には当たらない`);
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, `${id}: 弾を出さない`);
}

// ===== 9. 敵ゼロ・ボスのみでも例外を出さない =====
section('9. 敵ゼロ / ボスのみでも例外を出さない');
for (const id of ['armor_breaker', 'twin_fang_slash']) {
  let threw = null;
  try {
    const empty = build({ enemies: [] });
    empty.sm.acquireOrLevel(id); empty.sm.setLevel(id, 8);
    run(empty, 4000);
    const only = build({ enemies: [], boss: makeBoss({ hp: 1e9 }) });
    only.sm.acquireOrLevel(id); only.sm.setLevel(id, 8);
    run(only, 4000);
  } catch (e) { threw = e; }
  ok(!threw, `${id}: 例外なし（${threw ? threw.message : 'ok'}）`);
}

T.finish();
