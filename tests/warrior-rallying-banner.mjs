// 戦士 Wave2 15/21: 戦旗招集（M8-D §rallying_banner）。Node.js 標準機能のみ。
//   - その場へ短時間の陣を張る。陣は**常に 1 つだけ**（重ねがけ＝置換）
//   - 効果は**戦士本人が内側にいるときだけ**。外へ出れば即座に解除される
//   - 効果値は balance の上限で必ず頭打ちになる
//   - 他ジョブでは陣そのものが張れない
//   - 保存 / 復元で二重生成しない
// 実行: node tests/warrior-rallying-banner.mjs

import { DATA, makeScene, makeEnemies, makeWarrior, bootRuntime, runner } from './warrior-common.mjs';

const T = runner('戦士 戦旗招集（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'rallying_banner';
const SKILL = DATA.skills.find((x) => x.id === ID);
const RALLY = DATA.balance.warrior.rally;

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(8, { x: 330, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 20000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. 陣を張る =====
section('1. その場へ陣を張り、設置の衝撃は 1 発動 1 回');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 30000);
  const s = st(ctx, ID);
  ok((s.casts || 0) > 0, `発動する（${s.casts}）`);
  ok((s.extra?.banners || 0) === (s.casts || 0), `設置回数 ${s.extra?.banners} = cast ${s.casts}`);
  ok(ctx.w.telemetry.rallyPlacements > 0, `陣の設置が記録される（${ctx.w.telemetry.rallyPlacements}）`);
  ok(ctx.w.telemetry.rallyUptimeMs > 0, `陣の継続時間が記録される（${Math.round(ctx.w.telemetry.rallyUptimeMs)}ms）`);
  ok(ctx.w.telemetry.rallyInsideMs > 0, `内側にいた時間が記録される（${Math.round(ctx.w.telemetry.rallyInsideMs)}ms）`);
  ok((s.hits || 0) > 0, `設置の衝撃が当たる（${s.hits}）`);
  info(`戦旗招集: cast${s.casts} 設置${ctx.w.telemetry.rallyPlacements} 内側${Math.round(ctx.w.telemetry.rallyInsideMs)}ms`);
}

// ===== 2. 陣は常に 1 つ（重ねがけしない）=====
section('2. 陣は常に 1 つだけ（重ねて立てても置換される）');
{
  ok(RALLY.maxFields === 1, `balance で陣は 1 つ（${RALLY.maxFields}）`);
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire(); sk.fire(); sk.fire();
  ok(ctx.w.rallyField !== null, '陣が張られている');
  ok(typeof ctx.w.rallyField === 'object' && !Array.isArray(ctx.w.rallyField), '陣は 1 つのフィールドで表現される');
  ctx.w.updateRallyPosition(ctx.scene.player.x, ctx.scene.player.y);
  const b1 = ctx.w.rallyBonus('meleeArea');
  sk.fire();
  ctx.w.updateRallyPosition(ctx.scene.player.x, ctx.scene.player.y);
  ok(Math.abs(ctx.w.rallyBonus('meleeArea') - b1) < 1e-9, `再設置で効果が積み上がらない（${b1.toFixed(3)}）`);
  ok(SKILL.config.stack === 'refresh', 'data で置換（refresh）と宣言している');
}

// ===== 3. 内側でだけ効く =====
section('3. 効果は戦士が内側にいるときだけ（外へ出れば即座に切れる）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  const p = ctx.scene.player;
  sk.fire();
  ctx.w.updateRallyPosition(p.x, p.y);
  ok(ctx.w.rallyActive, '陣が有効');
  ok(ctx.w.rallyInside, '設置直後は内側にいる');
  for (const k of ['comboGrace', 'furyGain', 'mitigation', 'meleeArea']) {
    ok(ctx.w.rallyBonus(k) > 0, `内側では ${k} の補正が乗る（${ctx.w.rallyBonus(k).toFixed(3)}）`);
  }
  // 外へ出る。
  ctx.w.updateRallyPosition(p.x + 1000, p.y + 1000);
  ok(!ctx.w.rallyInside, '外へ出ると内側判定が落ちる');
  for (const k of ['comboGrace', 'furyGain', 'mitigation', 'meleeArea']) {
    ok(ctx.w.rallyBonus(k) === 0, `外では ${k} の補正が 0`);
  }
  ok(ctx.w.rallyActive, '陣そのものは残っている（消えるのは効果だけ）');
  // 戻れば再び効く。
  ctx.w.updateRallyPosition(p.x, p.y);
  ok(ctx.w.rallyInside, '戻れば再び内側になる');
}

// ===== 4. 効果値は上限で頭打ち =====
section('4. 効果値が balance の上限を必ず超えない');
{
  const ctx = build();
  ctx.w.placeRallyField('test', {
    x: 300, y: 300, durationMs: 999999, radius: 200,
    comboGrace: 99, furyGain: 99, mitigation: 99, meleeArea: 99, killHealBonus: 99, perSecondCapBonus: 99,
  });
  const f = ctx.w.rallyField;
  ok(f.leftMs <= RALLY.maxDurationMs + 1e-9, `持続 ${f.leftMs} ≤ ${RALLY.maxDurationMs}`);
  ok(f.comboGrace <= RALLY.maxComboGrace + 1e-9, `comboGrace ≤ ${RALLY.maxComboGrace}`);
  ok(f.furyGain <= RALLY.maxFuryGain + 1e-9, `furyGain ≤ ${RALLY.maxFuryGain}`);
  ok(f.mitigation <= RALLY.maxMitigation + 1e-9, `mitigation ≤ ${RALLY.maxMitigation}`);
  ok(f.meleeArea <= RALLY.maxMeleeArea + 1e-9, `meleeArea ≤ ${RALLY.maxMeleeArea}`);
  ok(f.killHealBonus <= RALLY.maxKillHealBonus + 1e-9, `killHealBonus ≤ ${RALLY.maxKillHealBonus}`);
  // data の Lv8 も上限内。
  const b = SKILL.levels[7];
  ok(b.comboGrace <= RALLY.maxComboGrace, `Lv8 comboGrace ${b.comboGrace} ≤ ${RALLY.maxComboGrace}`);
  ok(b.furyGain <= RALLY.maxFuryGain, `Lv8 furyGain ${b.furyGain} ≤ ${RALLY.maxFuryGain}`);
  ok(b.mitigationValue <= RALLY.maxMitigation, `Lv8 mitigation ${b.mitigationValue} ≤ ${RALLY.maxMitigation}`);
  ok(b.meleeArea <= RALLY.maxMeleeArea, `Lv8 meleeArea ${b.meleeArea} ≤ ${RALLY.maxMeleeArea}`);
  ok(b.duration <= RALLY.maxDurationMs, `Lv8 duration ${b.duration} ≤ ${RALLY.maxDurationMs}`);
}

// ===== 5. 既存システムへの反映 =====
section('5. 内側の補正が既存の闘気 / コンボ猶予 / 軽減 / 近接範囲へ反映される');
{
  const ctx = build();
  const w = ctx.w;
  const p = ctx.scene.player;
  const area0 = w.meleeAreaMultiplier();
  const red0 = w.damageReduction({ engaged: true });
  w.placeRallyField('test', { x: p.x, y: p.y, durationMs: 8000, radius: 200, comboGrace: 0.5, furyGain: 0.4, mitigation: 0.2, meleeArea: 0.2 });
  w.updateRallyPosition(p.x, p.y);
  ok(w.meleeAreaMultiplier() > area0, `近接範囲が広がる（${area0.toFixed(3)} → ${w.meleeAreaMultiplier().toFixed(3)}）`);
  ok(w.damageReduction({ engaged: true }) > red0, `軽減が増える（${red0.toFixed(3)} → ${w.damageReduction({ engaged: true }).toFixed(3)}）`);
  // 外へ出ると元に戻る。
  w.updateRallyPosition(p.x + 1000, p.y + 1000);
  ok(Math.abs(w.meleeAreaMultiplier() - area0) < 1e-9, '外では近接範囲が元に戻る');
  ok(Math.abs(w.damageReduction({ engaged: true }) - red0) < 1e-9, '外では軽減も元に戻る');
  // 合計軽減の上限は守られる。
  w.updateRallyPosition(p.x, p.y);
  ok(w.damageReduction({ engaged: true, charging: true, extra: 0.5 }) <= DATA.balance.warrior.mitigation.maxTotalReduction + 1e-9,
    '合計軽減が上限を超えない');
}

// ===== 6. 他ジョブでは張れない =====
section('6. 他ジョブでは陣そのものが張れない');
{
  const ctx = build();
  ctx.w.enabled = false;
  const r = ctx.w.placeRallyField('test', { x: 300, y: 300, durationMs: 5000, radius: 100, meleeArea: 0.2 });
  ok(r === null, '無効な戦士システムでは陣が張れない');
  ok(ctx.w.rallyBonus('meleeArea') === 0, '補正も 0');
  ctx.w.enabled = true;
}

// ===== 7. 保存 / 復元で二重生成しない =====
section('7. 保存 / 復元で陣が二重生成されない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire();
  const state = sk.serializeState();
  ok(!('rallyLeftMs' in state) && !('field' in state), 'スキル側は陣を保存しない（WarriorCombatSystem が持つ）');
  const buffs = ctx.w.serializeTimedBuffs();
  ok(buffs.rallyField, 'serializeTimedBuffs が陣を保存する');
  const before = ctx.w.telemetry.rallyPlacements;
  ctx.w.restoreTimedBuffs(buffs);
  ok(ctx.w.rallyField !== null, '復元で陣が戻る');
  ok(ctx.w.telemetry.rallyPlacements === before, `復元で設置回数が増えない（${before}）`);
  sk.restoreState(state);
  ok(ctx.w.rallyField !== null, 'スキルの復元で陣が消えたり増えたりしない');
}

// ===== 8. 成長 =====
section('8. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = SKILL.levels[7];
  for (const k of ['duration', 'radius', 'comboGrace', 'furyGain', 'mitigationValue', 'meleeArea', 'initialShock', 'initialPoise']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
}

// ===== 9. 破棄 =====
section('9. 破棄で陣が消える');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  const sk = ctx.sm.skills.get(ID);
  sk.fire();
  ok(ctx.w.rallyActive, '陣が張られている');
  sk.destroy();
  ok(!ctx.w.rallyActive, '破棄で陣が消える');
  ok(ctx.w.rallyBonus('meleeArea') === 0, '破棄で補正も消える');
}

T.finish();
