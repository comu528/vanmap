// 戦士 Wave1 12/19: 怒涛連撃（M8-C §5-10）。Node.js 標準機能のみ。
// 「対象を倒したら次の相手へ手数を引き継ぐ」機構が暴走しないことを固定する。
//   - 撃破で近距離の次の相手へ引き継ぐ（retarget）
//   - 引き継ぎ先は近距離だけ。遠距離へ瞬間移動しない
//   - 引き継ぎ回数に上限がある（無限連鎖しない）
//   - strike 数が多くても 1 発動 = 1 recordCast
//   - 闘気 / コンボは 1 発動あたりの上限で守られる
//   - ボス単体でも全 strike が有効
//   - 敵オブジェクトを保持しない（安定 runtime id のみ）
// 実行: node tests/warrior-relentless-combo.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, capFor } from './warrior-common.mjs';

const T = runner('戦士 怒涛連撃（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const SKILL = (id) => DATA.skills.find((x) => x.id === id);
const LV8 = SKILL('relentless_combo').levels[7];
const CFG = SKILL('relentless_combo').config;

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 320, y: 300, dy: 4, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: (ctx.enemies || []).some((e) => e.alive) || !!(ctx.scene.boss && ctx.scene.boss.alive) });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. data の役割宣言 =====
section('1. data: 手数で押し切る設計（strike 数が多く、締めに倍率がある）');
{
  for (const lv of SKILL('relentless_combo').levels) {
    ok(lv.strikes >= 4, `Lv${lv.level}: strikes ${lv.strikes} ≥ 4`);
    ok(lv.finalStrikeMultiplier > 1, `Lv${lv.level}: 締めに倍率 ×${lv.finalStrikeMultiplier}`);
    ok(lv.retargetRange > lv.radius, `Lv${lv.level}: 引き継ぎ範囲 ${lv.retargetRange} > 判定半径 ${lv.radius}`);
  }
  ok(CFG.maxRetargets >= 1, `引き継ぎ回数の上限がある（${CFG.maxRetargets}）`);
  ok(SKILL('relentless_combo').lv80ProjectileTarget === true, 'Job Lv80 の打撃数対象');
}

// ===== 2. 連撃が成立する =====
section('2. 1 発動で複数回叩き、締めが強い');
{
  const one = makeEnemies(1, { x: 330, y: 300, hp: 1e9 });
  const ctx = build({ enemies: one });
  ctx.sm.acquireOrLevel('relentless_combo'); ctx.sm.setLevel('relentless_combo', 8);
  run(ctx, 12000);
  const s = st(ctx, 'relentless_combo');
  ok((s.extra?.combos || 0) > 0, `連撃が始まる（${s.extra?.combos} 回）`);
  ok((s.extra?.strikes || 0) >= (s.extra?.combos || 0) * 4, `1 発動あたり複数打撃（${s.extra?.strikes} 打撃 / ${s.extra?.combos} 発動）`);
  ok((s.extra?.completedChains || 0) > 0, `連撃を撃ち切る（${s.extra?.completedChains} 回）`);
  const dmgs = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === 'relentless_combo').map((c) => c[3]);
  ok(Math.max(...dmgs) / Math.min(...dmgs) > 1.5, `締めが強い（${Math.min(...dmgs).toFixed(1)} → ${Math.max(...dmgs).toFixed(1)}）`);
  ok(Math.max(...dmgs) / Math.min(...dmgs) <= LV8.finalStrikeMultiplier + 1e-6,
    `締めの倍率は data どおり（×${(Math.max(...dmgs) / Math.min(...dmgs)).toFixed(2)} ≤ ×${LV8.finalStrikeMultiplier}）`);
  info(`怒涛連撃: 発動${s.extra?.combos} 打撃${s.extra?.strikes} 完走${s.extra?.completedChains}`);
}

// ===== 3. 撃破で近距離の次の相手へ引き継ぐ =====
section('3. 対象を倒したら近距離の次の相手へ残りの手数を引き継ぐ');
{
  // 4 方向に 1 体ずつ置く（arc ±51° なので 1 打撃で 1 体しか倒れず、必ず引き継ぎが要る）。
  const weak = makeEnemies(4, { x: 0, y: 0, dy: 0, hp: 1 });
  const ring = [[355, 300], [300, 355], [245, 300], [300, 245]];
  weak.forEach((e, i) => { e.x = ring[i][0]; e.y = ring[i][1]; });
  const ctx = build({ enemies: weak });
  ctx.sm.acquireOrLevel('relentless_combo'); ctx.sm.setLevel('relentless_combo', 8);
  run(ctx, 12000);
  const s = st(ctx, 'relentless_combo');
  ok((s.extra?.retargets || 0) > 0, `引き継ぎが起きる（${s.extra?.retargets} 回）`);
  ok(ctx.w.telemetry.relentlessRetargets > 0, `テレメトリに残る（${ctx.w.telemetry.relentlessRetargets}）`);
  ok(weak.filter((e) => !e.alive).length > 1, `複数の敵を倒す（${weak.filter((e) => !e.alive).length} 体）`);
  // 引き継ぎ回数は上限内。
  const cap = Math.min(CFG.maxRetargets, capFor('maxRelentlessRetargets', 'high', 3));
  ok((s.extra?.retargets || 0) <= (s.extra?.combos || 0) * cap,
    `引き継ぎ ${s.extra?.retargets} ≤ cap${cap} × 発動${s.extra?.combos}`);
  info(`引き継ぎ: ${s.extra?.retargets} 回 / 上限 ${cap}/発動`);
}

// ===== 4. 遠距離へ瞬間移動しない =====
section('4. 引き継ぎ先は近距離だけ（遠くの敵へは飛ばない）');
{
  // 目の前の 1 体（すぐ倒れる）と、遠方の集団。
  const near = makeEnemies(1, { x: 320, y: 300, hp: 1 });
  const far = makeEnemies(10, { x: 320 + LV8.retargetRange * 3, y: 300, dy: 4, hp: 1e9 });
  const ctx = build({ enemies: [...near, ...far] });
  ctx.sm.acquireOrLevel('relentless_combo'); ctx.sm.setLevel('relentless_combo', 8);
  const px = ctx.scene.player.x, py = ctx.scene.player.y;
  run(ctx, 12000);
  const hitFar = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === 'relentless_combo' && far.includes(c[2])).length;
  ok(hitFar === 0, `引き継ぎ範囲の 3 倍先の敵には当たらない（${hitFar} 発）`);
  ok(ctx.scene.player.x === px && ctx.scene.player.y === py, 'プレイヤーは移動しない（瞬間移動しない）');
  ok(far.every((e) => e.alive), '遠くの敵は無傷');
}

// ===== 5. 1 発動 = 1 recordCast =====
section('5. 多段でも 1 発動 = 1 recordCast');
{
  const ctx = build();
  ctx.sm.acquireOrLevel('relentless_combo'); ctx.sm.setLevel('relentless_combo', 8);
  run(ctx, 20000);
  const s = st(ctx, 'relentless_combo');
  const maxCasts = Math.ceil(20000 / LV8.cooldown) + 2;
  ok((s.casts || 0) <= maxCasts, `cast ${s.casts} ≤ ${maxCasts}（CD どおり）`);
  ok((s.extra?.combos || 0) === (s.casts || 0), `連撃数 ${s.extra?.combos} = cast ${s.casts}`);
  ok((s.hits || 0) > (s.casts || 0) * 3, `多段は hits 側で数える（hits ${s.hits}）`);
}

// ===== 6. strike 数は品質別 cap で頭打ち =====
section('6. strike 数と引き継ぎ回数が品質別 cap で頭打ちになる');
for (const q of ['low', 'medium', 'high', 'ultra']) {
  const sCap = capFor('maxRelentlessStrikes', q, 12);
  const rCap = capFor('maxRelentlessRetargets', q, 3);
  ok(sCap >= 1 && rCap >= 1, `${q}: cap が正（strikes ${sCap} / retargets ${rCap}）`);
  const weak = makeEnemies(30, { x: 320, y: 300, dy: 2, hp: 1 });
  const ctx = build({ enemies: weak, quality: q });
  ctx.sm.acquireOrLevel('relentless_combo'); ctx.sm.setLevel('relentless_combo', 8);
  // Lv80 の追加打撃を無視して cap が効くことを確認する。
  const sk = ctx.sm.skills.get('relentless_combo');
  sk.strikeCount = () => 999;
  run(ctx, 20000);
  const s = st(ctx, 'relentless_combo');
  ok((s.extra?.plannedStrikes || 0) <= (s.extra?.combos || 0) * sCap,
    `${q}: 計画打撃 ${s.extra?.plannedStrikes} ≤ cap${sCap} × 発動${s.extra?.combos}`);
  ok((s.extra?.retargets || 0) <= (s.extra?.combos || 0) * Math.min(rCap, CFG.maxRetargets),
    `${q}: 引き継ぎ ${s.extra?.retargets} ≤ cap${Math.min(rCap, CFG.maxRetargets)} × 発動${s.extra?.combos}`);
}

// ===== 7. 闘気 / コンボの過剰獲得がない =====
section('7. 多段でも闘気 / コンボが 1 発動あたりの上限を超えない');
{
  const ctx = build({ enemies: makeEnemies(20, { x: 320, y: 300, dy: 2, hp: 1e9 }) });
  ctx.sm.acquireOrLevel('relentless_combo'); ctx.sm.setLevel('relentless_combo', 8);
  run(ctx, 20000);
  const s = st(ctx, 'relentless_combo');
  const casts = Math.max(1, s.casts || 0);
  const furyPerCast = ctx.w.telemetry.furyGained / casts;
  const maxFuryPerCast = DATA.balance.warrior.fury.maxGainPerCast;
  ok(furyPerCast <= maxFuryPerCast + 1e-6, `1 発動あたりの闘気 ${furyPerCast.toFixed(2)} ≤ ${maxFuryPerCast}`);
  const comboPerCast = ctx.w.telemetry.comboPeak / casts;
  ok(comboPerCast <= DATA.balance.warrior.combo.maxGainPerCast + 1e-6,
    `1 発動あたりのコンボ ${comboPerCast.toFixed(2)} ≤ ${DATA.balance.warrior.combo.maxGainPerCast}`);
  info(`過剰獲得なし: 闘気 ${furyPerCast.toFixed(2)}/発動 コンボ ${comboPerCast.toFixed(2)}/発動`);
}

// ===== 8. ボス単体でも全 strike が有効 =====
section('8. ボス単体でも手数がすべて消化される');
{
  const boss = makeBoss({ x: 330, y: 300, hp: 1e9 });
  const ctx = build({ enemies: [], boss });
  ctx.sm.acquireOrLevel('relentless_combo'); ctx.sm.setLevel('relentless_combo', 8);
  run(ctx, 12000);
  const s = st(ctx, 'relentless_combo');
  ok((s.extra?.combos || 0) > 0, `ボス相手でも発動する（${s.extra?.combos} 回）`);
  ok((s.extra?.strikes || 0) === (s.extra?.plannedStrikes || 0),
    `計画した手数がすべて消化される（${s.extra?.strikes} / ${s.extra?.plannedStrikes}）`);
  ok((s.extra?.completedChains || 0) === (s.extra?.combos || 0), `全連撃が完走する（${s.extra?.completedChains}）`);
  ok((s.extra?.retargets || 0) === 0, 'ボス単体では引き継ぎが起きない');
  info(`ボス単体: 発動${s.extra?.combos} 打撃${s.extra?.strikes}/${s.extra?.plannedStrikes}`);
}

// ===== 9. 対象が消えたら安全に終わる =====
section('9. 連撃中に対象が全滅しても安全に終わる');
{
  const enemies = makeEnemies(6, { x: 320, y: 300, dy: 3, hp: 1e9 });
  const ctx = build({ enemies });
  ctx.sm.acquireOrLevel('relentless_combo'); ctx.sm.setLevel('relentless_combo', 8);
  const sk = ctx.sm.skills.get('relentless_combo');
  sk.fire();
  ok(sk.comboing === true, '連撃が始まる');
  for (let i = 0; i < 3; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  for (const e of enemies) { e.alive = false; ctx.w.onEnemyRemoved(e); }
  let threw = null;
  try { for (let i = 0; i < 200; i++) { sk.update(16, { hasEnemies: false }); ctx.scene.advance(16); } } catch (e) { threw = e; }
  ok(!threw, `対象消失でも例外が出ない（${threw ? threw.message : 'ok'}）`);
  ok(!sk.comboing, '対象消失で連撃が終わる');
}

// ===== 10. 敵オブジェクトを保持しない =====
section('10. 保存に敵オブジェクトを持たず、復元で二重 strike しない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel('relentless_combo'); ctx.sm.setLevel('relentless_combo', 8);
  const sk = ctx.sm.skills.get('relentless_combo');
  sk.fire();
  sk.update(16, { hasEnemies: true });
  const saved = sk.serializeState();
  ok(!Object.values(saved).some((v) => v && typeof v === 'object'), '保存にオブジェクト参照が含まれない');
  ok(typeof saved.remainStrikes === 'number', `残り手数を保存する（${saved.remainStrikes}）`);
  ok(JSON.stringify(saved).length < 200, `保存が小さい（${JSON.stringify(saved).length} bytes）`);
  const ctx2 = build();
  ctx2.sm.acquireOrLevel('relentless_combo'); ctx2.sm.setLevel('relentless_combo', 8);
  const sk2 = ctx2.sm.skills.get('relentless_combo');
  sk2.restoreState(saved);
  ok(!sk2.comboing, '復元しても連撃は再開しない');
  ok(sk2._cd === saved.cdLeft, `CD だけが戻る（${sk2._cd}）`);
  let strikes = 0;
  const origMelee = ctx2.scene.combat.meleeStrike;
  ctx2.scene.combat.meleeStrike = (o) => { if (o.skillId === 'relentless_combo') strikes += 1; return origMelee(o); };
  sk2._cd = 1e9;
  for (let i = 0; i < 60; i++) { sk2.update(16, { hasEnemies: true }); ctx2.scene.advance(16); }
  ok(strikes === 0, `復元直後に無料の打撃が出ない（${strikes} 発）`);
  // 内部 Map に敵参照が残らない（撃破で確実に落ちる）。
  const w = ctx.w;
  for (const e of ctx.enemies) w.onEnemyRemoved(e);
  ok(w._targetHitAt.size === 0, '敵参照 Map が空になる');
}

// ===== 11. 弾を飛ばさない / 例外なし =====
section('11. 弾を飛ばさず、敵ゼロでも例外が出ない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel('relentless_combo'); ctx.sm.setLevel('relentless_combo', 8);
  run(ctx, 12000);
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, '弾を出さない');
  let threw = null;
  try {
    const empty = build({ enemies: [] });
    empty.sm.acquireOrLevel('relentless_combo'); empty.sm.setLevel('relentless_combo', 8);
    run(empty, 8000);
    ok((st(empty, 'relentless_combo').extra?.combos || 0) === 0, '敵ゼロでは連撃が始まらない');
  } catch (e) { threw = e; }
  ok(!threw, `敵ゼロで例外なし（${threw ? threw.message : 'ok'}）`);
}

T.finish();
