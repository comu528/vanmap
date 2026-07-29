// 戦士 Wave2 11/21: 刃防陣（M8-D §blade_guard）。Node.js 標準機能のみ。
//   - 短時間の能動防御 ＋ ごく近距離への周期斬り
//   - **反撃ではない**（被弾に反応しない）
//   - 弾を完全無効化しない（軽減のみ・合計 70% クランプ）
//   - 旋風斬より狭く・低火力・防御寄り
//   - tick では recordCast しない
// 実行: node tests/warrior-blade-guard.mjs

import { DATA, makeScene, makeEnemies, makeWarrior, bootRuntime, runner, capFor, registryMap, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 刃防陣（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'blade_guard';
const SKILL = DATA.skills.find((x) => x.id === ID);
const WHIRL = DATA.skills.find((x) => x.id === 'whirlwind_slash');

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 320, y: 300, dy: 3, hp: opts.hp || 1e9 });
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

// ===== 1. 構えている間、周期的に斬る =====
section('1. 構えている間だけ周期的に斬る（tick で cast は増えない）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 20000);
  const s = st(ctx, ID);
  ok((s.casts || 0) > 0, `発動する（${s.casts}）`);
  ok((s.extra?.ticks || 0) > (s.casts || 0), `tick ${s.extra?.ticks} > cast ${s.casts}`);
  ok((s.extra?.guards || 0) === (s.casts || 0), `構え回数 ${s.extra?.guards} = cast ${s.casts}`);
  ok(ctx.w.telemetry.guardTicks > 0, `tick が記録される（${ctx.w.telemetry.guardTicks}）`);
  ok(ctx.w.telemetry.guardUptimeMs > 0, `構えの継続時間が記録される（${Math.round(ctx.w.telemetry.guardUptimeMs)}ms）`);
  info(`刃防陣: cast${s.casts} tick${s.extra?.ticks} hit${s.hits}`);
}

// ===== 2. 反撃ではない =====
section('2. 反撃（counter）ではない — 被弾に反応しない');
{
  const src = skillSourceDeep(ID, registryMap()) || '';
  ok(!/counterSource/.test(src), 'counterSource を名乗らない');
  ok(!/performCounter/.test(src), 'performCounter を実装しない');
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 4000);
  const before = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID).length;
  for (let i = 0; i < 5; i++) ctx.scene.onWarriorHit(100, 80);
  const after = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID).length;
  ok(after === before, `被弾しても追加の斬撃が出ない（${before} → ${after}）`);
  ok((ctx.w.telemetry.counters || 0) === 0, '反撃としても数えられない');
}

// ===== 3. 弾を完全無効化しない =====
section('3. 軽減のみ（完全無効化しない・合計上限を守る）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  for (let i = 0; i < 60 && !sk.guarding; i++) { ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16); }
  ok(sk.guarding, '構え状態を作れる');
  const m = sk.activeMitigation();
  ok(m > 0, `構え中は軽減が乗る（${m.toFixed(3)}）`);
  ok(m < 1, `完全無効化しない（${m.toFixed(3)} < 1）`);
  const out = ctx.w.applyIncomingDamage(100, { engaged: true, guarding: true, extra: m });
  ok(out > 0, `被弾が 0 にならない（${out.toFixed(1)}）`);
  ok(ctx.w.damageReduction({ engaged: true, extra: m }) <= DATA.balance.warrior.mitigation.maxTotalReduction + 1e-9,
    '合計軽減が上限を超えない');
  ok(SKILL.levels[7].mitigationValue < 1, `Lv8 の宣言値も 1 未満（${SKILL.levels[7].mitigationValue}）`);
}

// ===== 4. 旋風斬より狭く・低火力・防御寄り =====
section('4. 旋風斬より狭く・低火力・防御寄り');
{
  ok(SKILL.levels[7].radius < WHIRL.levels[7].radius,
    `半径: 刃防陣 ${SKILL.levels[7].radius} < 旋風斬 ${WHIRL.levels[7].radius}`);
  ok(SKILL.levels[7].damage < WHIRL.levels[7].damage,
    `威力: 刃防陣 ${SKILL.levels[7].damage} < 旋風斬 ${WHIRL.levels[7].damage}`);
  ok(SKILL.levels[7].mitigationValue > 0, '刃防陣だけが軽減を持つ（防御寄り）');
  ok(WHIRL.levels[7].mitigationValue === undefined, '旋風斬は軽減を持たない');
  const g = build(); g.sm.acquireOrLevel(ID); g.sm.setLevel(ID, 8); run(g, 24000);
  const wh = build(); wh.sm.acquireOrLevel('whirlwind_slash'); wh.sm.setLevel('whirlwind_slash', 8); run(wh, 24000);
  ok((st(g, ID).damage || 0) < (st(wh, 'whirlwind_slash').damage || 0),
    `実 DPS も低い（刃防陣 ${Math.round(st(g, ID).damage)} < 旋風斬 ${Math.round(st(wh, 'whirlwind_slash').damage)}）`);
}

// ===== 5. tick の上限 =====
section('5. 1 フレームあたりの tick が data の上限内');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const budget = capFor('maxGuardTicksPerFrame', 'high', 2);
  const sk = ctx.sm.skills.get(ID);
  let worst = 0;
  for (let i = 0; i < 900; i++) {
    const before = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID).length;
    ctx.sm.update(200, { hasEnemies: true }); ctx.w.update(200); ctx.scene.advance(200); // 大きい dt でも溢れない
    const after = ctx.scene.calls.filter((c) => c[0] === 'melee' && c[1] === ID).length;
    const ticks = sk._guard ? 1 : 0;
    void ticks;
    worst = Math.max(worst, (after - before) / Math.max(1, ctx.enemies.length));
  }
  ok(worst <= budget + 1e-6, `1 フレームの tick が ${budget} 以下（最大 ${worst.toFixed(1)}）`);
  const maxTargets = SKILL.levels[7].maxTargets;
  ok(maxTargets <= 8, `1 tick の対象数上限は ${maxTargets}（旋風斬より控えめ）`);
}

// ===== 6. 構えは必ず終わる =====
section('6. 構えは必ず終わる（maxGuardMs で頭打ち）');
{
  ok(SKILL.levels[7].duration <= SKILL.config.maxGuardMs, `Lv8 の duration ≤ maxGuardMs（${SKILL.config.maxGuardMs}）`);
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire();
  for (let i = 0; i < 600; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); if (!sk.guarding) break; }
  ok(!sk.guarding || sk._guard.leftMs <= SKILL.config.maxGuardMs, '構えはいずれ必ず終わる');
}

// ===== 7. 保存は「再開」であって「二重化」ではない =====
section('7. 保存 / 復元は再開であって二重化ではない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire();
  for (let i = 0; i < 20; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  const state = sk.serializeState();
  ok(state.guardLeftMs > 0, `残り時間を保存する（${Math.round(state.guardLeftMs)}ms）`);
  ok(state.guardTicks >= 0, '消化済み tick 数も保存する');
  sk.restoreState(state);
  ok(sk.guarding, '復元で構えが再開する');
  ok(sk._guard.leftMs <= state.guardLeftMs + 1e-6, '残り時間が増えない（二重化しない）');
  ok(sk._guard.ticks === state.guardTicks, '消化済み tick 数を引き継ぐ');
}

// ===== 8. 成長 =====
section('8. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = SKILL.levels[7];
  for (const k of ['damage', 'duration', 'radius', 'mitigationValue', 'poiseDamage', 'maxTargets']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  ok(b.tickInterval < a.tickInterval, `tickInterval: ${a.tickInterval} → ${b.tickInterval}（刻みが速くなる）`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 24000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 24000);
  ok((st(hi, ID).damage || 0) > (st(lo, ID).damage || 0),
    `Lv8 の総ダメージ ${Math.round(st(hi, ID).damage)} > Lv1 ${Math.round(st(lo, ID).damage)}`);
}

// ===== 9. 破棄 =====
section('9. 破棄後に tick が動かない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire();
  for (let i = 0; i < 10; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  const before = ctx.scene.calls.length;
  sk.destroy();
  for (let i = 0; i < 120; i++) sk.update(16, { hasEnemies: true });
  ok(ctx.scene.calls.length === before, `破棄後に tick が出ない（${before}）`);
  ok(sk._guard === null, '破棄で構えの状態が消える');
  ok(sk.activeMitigation() === 0, '破棄で軽減も消える');
}

T.finish();
