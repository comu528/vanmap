// 戦士 12/17: 保存 / 復元（M8-B §17）。Node.js 標準機能のみ。
// - WarriorCombatSystem の serialize/restore が往復で一致すること
// - 8 スキルすべてがクールダウンを保存し、再読込直後の無料発動が起きないこと
// - 旧セーブ（warriorState なし・他ジョブ）で壊れないこと
// - 再読込で闘気・コンボ・不屈CD・ボス体勢を初期化して稼げないこと
// 実行: node tests/warrior-runtime-save.mjs

import { DATA, WARRIOR, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc, registryMap, skillSource } from './warrior-common.mjs';

const T = runner('戦士 保存 / 復元（M8-B）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ALL = [...EXPECTED.actives, ...EXPECTED.evolutions];

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 316, y: 300, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: opts.now || 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
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

// ===== 1. save_version を上げない（追加のみ）=====
section('1. save_version は据え置き（追加フィールドのみ）');
{
  const src = readSrc('src/systems/BattleManager.js');
  ok(/warriorState/.test(src), 'buildRunSnapshot が warriorState を保存する');
  ok(/s\.warrior && s\.warrior\.enabled/.test(src), '戦士周回のときだけ保存する（他ジョブは null）');
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/r\.warriorState/.test(bs), 'restoreFromRun が warriorState を復元する');
  const cfg = readSrc('src/config/game-config.js');
  ok(/SAVE_VERSION\s*=\s*6/.test(cfg) || !/SAVE_VERSION/.test(cfg), 'save_version は 6 のまま（追加のみで移行不要）');
}

// ===== 2. serialize / restore の往復一致 =====
section('2. WarriorCombatSystem の serialize / restore が往復で一致する');
{
  const boss = makeBoss();
  const ctx = build({ boss, mods: { killHealMult: 1 } });
  for (const id of EXPECTED.actives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 6000);
  ctx.w.applyPoiseDamage(boss, DATA.balance.warrior.poise.boss.threshold * 0.6);
  ctx.w.setChargeWindow(400);
  const snap = JSON.parse(JSON.stringify(ctx.w.serialize()));
  ok(typeof snap.fury === 'number', 'fury を保存する');
  ok(typeof snap.combo === 'number', 'combo を保存する');
  ok(snap.recovery && typeof snap.recovery.leftMs === 'number', 'recovery を保存する');
  ok(snap.unyielding && typeof snap.unyielding.cooldownLeftMs === 'number', '不屈 CD を保存する');
  ok(snap.bossPoise && typeof snap.bossPoise.gauge === 'number', 'ボス体勢ゲージを保存する');
  ok(typeof snap.chargeLeftMs === 'number', '突進の軽減窓の残りを保存する');
  ok(!!snap.telemetry, 'telemetry を保存する');

  const ctx2 = build({ boss: makeBoss() });
  ctx2.w.restore(snap);
  ok(Math.abs(ctx2.w.fury - snap.fury) < 1e-9, `闘気が復元される（${snap.fury.toFixed(2)}）`);
  ok(Math.abs(ctx2.w.combo - snap.combo) < 1e-9, `コンボが復元される（${snap.combo}）`);
  ok(ctx2.w.unyielding.cooldownLeftMs === snap.unyielding.cooldownLeftMs, '不屈 CD が復元される');
  ok(Math.abs(ctx2.w.bossPoise.gauge - snap.bossPoise.gauge) < 1e-9, 'ボス体勢ゲージが復元される');
  ok(ctx2.w.bossPoise.thresholdMult === snap.bossPoise.thresholdMult, 'しきい値倍率が復元される');
  const snap2 = JSON.parse(JSON.stringify(ctx2.w.serialize()));
  for (const k of ['fury', 'combo', 'comboGraceLeftMs', 'releaseLeftMs']) {
    ok(Math.abs(snap[k] - snap2[k]) < 1e-6, `再シリアライズで ${k} が一致`);
  }
  info(`保存サイズ ${JSON.stringify(snap).length} 文字`);
}

// ===== 3. 復元でカウンタが初期化されない =====
section('3. 再読込で闘気 / コンボ / 不屈CD / ボス体勢を初期化して稼げない');
{
  const boss = makeBoss();
  const ctx = build({ boss });
  ctx.w.fury = 80; ctx.w.combo = 45;
  ctx.w.unyielding.cooldownLeftMs = 30000; ctx.w.unyielding.triggers = 1;
  ctx.w.bossPoise = { gauge: 200, thresholdMult: 1.25, breaks: 1, cooldownLeftMs: 500, exposedLeftMs: 1200, reactionLeftMs: 0 };
  const snap = JSON.parse(JSON.stringify(ctx.w.serialize()));
  const after = build({ boss: makeBoss() });
  after.w.restore(snap);
  ok(after.w.fury === 80, '闘気が 0 へ戻らない');
  ok(after.w.combo === 45, 'コンボが 0 へ戻らない');
  ok(after.w.unyielding.cooldownLeftMs === 30000, '不屈 CD が 0 へ戻らない（再読込で撃ち直せない）');
  ok(after.w.unyielding.triggers === 1, '発動回数が保持される');
  ok(after.w.bossPoise.gauge === 200, 'ボス体勢ゲージが 0 へ戻らない');
  ok(after.w.bossPoise.thresholdMult === 1.25, 'しきい値倍率が 1 へ戻らない（崩し直しで簡単にならない）');
  ok(after.w.bossPoise.breaks === 1, '崩し回数が保持される');
}

// ===== 4. 復元で cast 予算・target 記録がリセットされる =====
section('4. 復元では cast 予算・同一敵記録がクリアされる（古い参照を持ち越さない）');
{
  const ctx = build();
  ctx.w.addFury(3, 'meleeHit', 'cast#1');
  ctx.w.addCombo(1, 'cast#1', ctx.enemies[0]);
  const snap = JSON.parse(JSON.stringify(ctx.w.serialize()));
  const after = build();
  after.w.restore(snap);
  ok(after.w._castBudgets.size === 0, 'cast 予算がクリアされる');
  ok(after.w._targetHitAt.size === 0, '同一敵の記録がクリアされる（死んだ敵オブジェクトを保持しない）');
}

// ===== 5. 全 8 スキルが runtimeState を持ち、CD を保存する =====
section('5. active5 + evolution3 すべてが serializeState / restoreState を実装する');
{
  const map = registryMap();
  for (const id of ALL) {
    const src = skillSource(id, map) || '';
    ok(/serializeState\s*\(/.test(src), `${id}: serializeState を実装する`);
    ok(/restoreState\s*\(/.test(src), `${id}: restoreState を実装する`);
    ok(/cdLeft/.test(src), `${id}: クールダウン残りを保存する`);
  }
  const ctx = build();
  for (const id of ALL) ctx.sm.acquireOrLevel(id);
  run(ctx, 1500);
  const rt = ctx.sm.serializeRuntime();
  for (const id of ALL) {
    ok(Object.prototype.hasOwnProperty.call(rt, id), `${id}: serializeRuntime に含まれる`);
    ok(typeof rt[id].cdLeft === 'number', `${id}: cdLeft が数値`);
  }
  info(`runtimeState: ${Object.keys(rt).length} スキル`);
}

// ===== 6. 再読込直後の無料発動が起きない =====
section('6. 再読込直後にクールダウンが 0 へ戻らない（無料発動なし）');
for (const id of ALL) {
  const a = build();
  a.sm.acquireOrLevel(id);
  if (DATA.skills.some((s) => s.id === id)) a.sm.setLevel(id, 8);
  run(a, 400);
  const rt = JSON.parse(JSON.stringify(a.sm.serializeRuntime()));
  const b = build();
  b.sm.acquireOrLevel(id);
  if (DATA.skills.some((s) => s.id === id)) b.sm.setLevel(id, 8);
  b.sm.restoreRuntime(rt);
  const sk = b.sm.skills.get(id);
  ok(sk._cd > 0, `${id}: 復元後もクールダウンが残る（${Math.round(sk._cd)}ms）`);
  // 復元直後の 1 フレームで発動しない。
  const castsBefore = (b.sm.statsList().find((s) => s.id === id) || {}).casts || 0;
  b.sm.update(16, { hasEnemies: true });
  const castsAfter = (b.sm.statsList().find((s) => s.id === id) || {}).casts || 0;
  ok(castsAfter === castsBefore, `${id}: 復元直後の 1 フレームで発動しない`);
}

// ===== 7. 継続状態の復元（回転・構え・軽減窓）=====
section('7. 継続状態は「再開」であり「二重化」しない');
{
  // 旋風斬り: 残り duration だけを引き継ぎ、発動回数は増えない。
  const a = build();
  a.sm.acquireOrLevel('whirlwind_slash'); a.sm.setLevel('whirlwind_slash', 8);
  run(a, 500);
  const rt = JSON.parse(JSON.stringify(a.sm.serializeRuntime()));
  ok(rt.whirlwind_slash.spinLeftMs > 0, '回転中の残り duration が保存される');
  const b = build();
  b.sm.acquireOrLevel('whirlwind_slash'); b.sm.setLevel('whirlwind_slash', 8);
  const castsBefore = b.w.telemetry.meleeCasts;
  b.sm.restoreRuntime(rt);
  ok(b.w.telemetry.meleeCasts === castsBefore, '復元で meleeCasts が増えない（発動としてカウントしない）');
  ok(b.sm.skills.get('whirlwind_slash').spinning, '回転が再開される');
  const def = DATA.skills.find((s) => s.id === 'whirlwind_slash');
  ok(b.sm.skills.get('whirlwind_slash')._spin.leftMs <= def.levels[7].duration, '残り duration が元の duration を超えない');
}
{
  // 突進斬り: 途中状態は復元しない（座標の飛び・無料再ダッシュの防止）。
  const a = build();
  a.sm.acquireOrLevel('charge_slash'); a.sm.setLevel('charge_slash', 8);
  run(a, 100);
  const rt = JSON.parse(JSON.stringify(a.sm.serializeRuntime()));
  const b = build();
  b.sm.acquireOrLevel('charge_slash'); b.sm.setLevel('charge_slash', 8);
  const x0 = b.scene.player.x;
  b.sm.restoreRuntime(rt);
  ok(!b.sm.skills.get('charge_slash').charging, '突進の途中状態は復元しない');
  ok(b.scene.player.x === x0, '復元で座標が飛ばない');
}
{
  // 不落の城壁: 構えの残り時間・使用回数の両方を復元（復元で反撃が復活しない）。
  const a = build();
  a.sm.acquireOrLevel('unyielding_fortress');
  run(a, 300);
  const sk = a.sm.skills.get('unyielding_fortress');
  sk.fire();
  sk.onPlayerHit(10, 8);
  const rt = JSON.parse(JSON.stringify(a.sm.serializeRuntime()));
  ok(rt.unyielding_fortress.counterUsed >= 1, '反撃の使用回数が保存される');
  const b = build();
  b.sm.acquireOrLevel('unyielding_fortress');
  b.sm.restoreRuntime(rt);
  ok(b.sm.skills.get('unyielding_fortress').onPlayerHit(10, 8) === false, '復元後に反撃が復活しない');
}

// ===== 8. 旧セーブ・他ジョブで壊れない =====
section('8. 旧セーブ（warriorState なし）・他ジョブでも壊れない');
{
  const ctx = build();
  ok(ctx.w.restore(null) === undefined || true, 'restore(null) が例外を出さない');
  ok(ctx.w.fury === 0 && ctx.w.combo === 0, '初期値のまま');
  ctx.w.restore({});
  ok(ctx.w.fury === 0, '空オブジェクトでも壊れない');
  ctx.w.restore({ fury: 'x', combo: null, bossPoise: 'bad', unyielding: 3, telemetry: [] });
  ok(Number.isFinite(ctx.w.fury), '不正な型でも fury が有限値のまま');
  ok(Number.isFinite(ctx.w.combo), '不正な型でも combo が有限値のまま');
  ok(typeof ctx.w.bossPoise === 'object' && Number.isFinite(ctx.w.bossPoise.gauge), 'bossPoise が壊れない');
  // 無効時（他ジョブ）は保存しない。
  const off = build({ enabled: false });
  ok(off.w.enabled === false, '他ジョブでは enabled=false');
}

void WARRIOR;
T.finish();
