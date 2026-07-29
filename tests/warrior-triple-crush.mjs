// 戦士 Wave2 10/21: 三段砕き（M8-D §triple_crush）。Node.js 標準機能のみ。
//   - 短い前方打ち → 横薙ぎ → 小範囲の叩きつけ の三段
//   - コンボが閾値を超えると最終段だけ強くなる
//   - 1 発動 = 1 recordCast（各段では recordCast しない）
//   - 途中で保存 / 復元しても二重再生しない
// 実行: node tests/warrior-triple-crush.mjs

import { DATA, makeScene, makeEnemies, makeWarrior, bootRuntime, runner, capFor } from './warrior-common.mjs';

const T = runner('戦士 三段砕き（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'triple_crush';
const SKILL = DATA.skills.find((x) => x.id === ID);

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 330, y: 300, dy: 3, hp: opts.hp || 1e9 });
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

// ===== 1. 三段が順番に出る =====
section('1. 三段が順番に出る（1 発動 = 1 recordCast）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 16000);
  const s = st(ctx, ID);
  const stages = SKILL.config.stages;
  ok((s.casts || 0) > 0, `発動する（${s.casts}）`);
  ok((s.extra?.stages || 0) > (s.casts || 0), `段数 ${s.extra?.stages} > cast ${s.casts}（多段は hits 側で数える）`);
  ok((s.extra?.stages || 0) <= (s.casts || 0) * stages, `段数 ${s.extra?.stages} ≤ cast × ${stages}`);
  ok(ctx.w.telemetry.comboStages > 0, `段の進行が記録される（${ctx.w.telemetry.comboStages}）`);
  info(`三段砕き: cast${s.casts} 段${s.extra?.stages} hit${s.hits}`);
}

// ===== 2. 最終段は範囲が広い =====
section('2. 最終段は小範囲の叩きつけ（前 2 段より広く当たる）');
{
  // 背後にも敵を置き、全周の最終段だけが当たることを見る。
  const front = makeEnemies(3, { x: 340, y: 300, dy: 3, hp: 1e9 });
  const back = makeEnemies(3, { x: 262, y: 300, dy: 3, hp: 1e9 });
  back.forEach((e, i) => { e._seq = 50 + i; });
  const ctx = build({ enemies: [...front, ...back] });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 16000);
  const backHits = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID && back.includes(c[2])).length;
  ok(backHits > 0, `背後の敵にも最終段が当たる（${backHits}）`);
  const frontHits = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID && front.includes(c[2])).length;
  ok(frontHits > backHits, `前方のほうが当たる回数が多い（前 ${frontHits} > 後 ${backHits}）`);
}

// ===== 3. コンボ閾値で最終段が強くなる =====
section('3. コンボが閾値を超えると最終段だけ強くなる');
{
  const th = SKILL.config.comboThreshold;
  ok(typeof th === 'number' && th > 0, `data に comboThreshold がある（${th}）`);
  const mkDmg = (combo) => {
    const ctx = build();
    ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
    // 手動でコンボを積む（スキル自身のコンボ獲得と混ざらないよう、1 発動だけを見る）。
    ctx.w.combo = combo;
    const sk = ctx.sm.skills.get(ID);
    sk.fire();
    for (let i = 0; i < 60; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
    return ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID).reduce((n, c) => n + c[3], 0);
  };
  const lo = mkDmg(0), hi = mkDmg(th + 5);
  ok(hi > lo, `コンボ ${th + 5} のほうが総ダメージが大きい（${Math.round(lo)} → ${Math.round(hi)}）`);
  ok(SKILL.levels[7].comboBonus > SKILL.levels[0].comboBonus, 'comboBonus が Lv で伸びる');
}

// ===== 4. 段ごとに recordCast しない =====
section('4. 各段で cast を水増ししない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 20000);
  const s = st(ctx, ID);
  const cd = SKILL.levels[7].cooldown;
  ok((s.casts || 0) <= Math.ceil(20000 / cd) + 1, `cast ${s.casts} が CD ${cd}ms から見て妥当`);
  // 闘気 / コンボの 1 発動あたりの上限も守る。
  const casts = Math.max(1, s.casts || 0);
  ok(ctx.w.telemetry.furyGained / casts <= DATA.balance.warrior.fury.maxGainPerCast + 1e-6,
    `1 発動あたりの闘気 ${(ctx.w.telemetry.furyGained / casts).toFixed(2)} ≤ ${DATA.balance.warrior.fury.maxGainPerCast}`);
}

// ===== 5. 途中保存で二重再生しない =====
section('5. 段の途中で保存 / 復元しても二重再生しない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire();
  for (let i = 0; i < 6; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  const state = sk.serializeState();
  ok(typeof state.cdLeft === 'number', 'cdLeft を保存する');
  ok(!('stage' in state), '段の進行そのものは保存しない');
  const before = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID).length;
  // 復元直後に再発動しない状況（CD が残っている）で「残りの段が勝手に再生されないこと」だけを見る。
  sk.restoreState({ ...state, cdLeft: 99999 });
  ok(sk._combo === null, '復元で段の途中状態を持ち越さない');
  for (let i = 0; i < 30; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  const after = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID).length;
  ok(after === before, `復元後に残りの段が勝手に再生されない（${before} → ${after}）`);
}

// ===== 6. 対象数の上限 =====
section('6. 対象数が data の上限内');
{
  const ctx = build({ enemies: makeEnemies(40, { x: 330, y: 300, dy: 1, hp: 1e9 }) });
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 8000);
  const cap = capFor('maxCrushStages', 'high', 3);
  const s = st(ctx, ID);
  ok((s.extra?.stages || 0) <= (s.casts || 0) * cap, `段数が品質 cap（${cap}）を超えない`);
  ok((s.hits || 0) > 0, '多数の敵でも当たる');
}

// ===== 7. 成長 =====
section('7. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = SKILL.levels[7];
  for (const k of ['damage', 'stage2', 'stage3', 'finalRadius', 'knockback', 'poiseDamage', 'comboBonus']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  ok(b.interval < a.interval, `interval: ${a.interval} → ${b.interval}（段が速くなる）`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 20000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 20000);
  ok((st(hi, ID).damage || 0) > (st(lo, ID).damage || 0),
    `Lv8 の総ダメージ ${Math.round(st(hi, ID).damage)} > Lv1 ${Math.round(st(lo, ID).damage)}`);
}

// ===== 8. 破棄 =====
section('8. 破棄後に残りの段が動かない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire();
  for (let i = 0; i < 4; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  const before = ctx.scene.calls.length;
  sk.destroy();
  for (let i = 0; i < 60; i++) sk.update(16, { hasEnemies: true });
  ok(ctx.scene.calls.length === before, `破棄後に打撃が増えない（${before}）`);
  ok(sk._combo === null, '破棄で段の状態が消える');
}

T.finish();
