// 戦士 Wave1 13/19: Job Lv80「打撃数 +1」の対象（M8-C §10）。Node.js 標準機能のみ。
// Wave1 で Lv80 の対象はちょうど 6 種になる（既存 3 + 追加 3）。
//   great_cleave / shield_bash / ground_slam / armor_breaker / twin_fang_slash / relentless_combo
// - 対象は「打撃数」が増えるだけで、遠距離へ飛ぶ弾は 1 つも増えない
// - 非対象は Lv80 でも打撃数が変わらない
// - 追加打撃で recordCast は増えず、闘気 / コンボの上限も守られる
// 実行: node tests/warrior-wave1-job80.mjs

import { JobModifierManager } from '../src/systems/JobModifierManager.js';
import { appliesLv80ProjectileCount } from '../src/systems/SkillAudit.js';
import { DATA, WARRIOR, EXPECTED, makeScene, makeEnemies, makeWarrior, bootRuntime, runner } from './warrior-common.mjs';

const T = runner('戦士 Wave1 Job Lv80 対象（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const SKILL = (id) => DATA.skills.find((x) => x.id === id);
const jp = DATA.jobProgression.jobs.warrior;
const mgr = (lv) => { const m = new JobModifierManager(); m.setResolved(JobModifierManager.resolve(jp, lv)); return m; };

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 320, y: 300, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  if (opts.jobLevel) {
    const m = mgr(opts.jobLevel);
    scene.jobMods.projectileCountBonus = () => m.projectileCountBonus();
  }
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
// 自力で近づく（＝遠方の敵にもいずれ届く）スキル。遠距離判定の対象から外す。
const MOVERS = new Set(['charge_slash', 'leap_smash', 'sweeping_advance', 'chain_hook']);

// ===== 1. 対象はちょうど 6 種 =====
section('1. Job Lv80 の対象は戦士 active のうちちょうど 6 種');
{
  const flagged = WARRIOR.activeSkillPool.filter((id) => SKILL(id).lv80ProjectileTarget === true);
  ok(flagged.length === 6, `対象は 6 種（実際 ${flagged.length}: ${flagged.join(',')}）`);
  for (const id of EXPECTED.lv80Targets) ok(flagged.includes(id), `${id}: 対象である`);
  for (const id of flagged) ok(EXPECTED.lv80Targets.includes(id), `${id}: 想定どおりの対象`);
  // 進化は 1 つも対象にしない。
  for (const id of WARRIOR.evolutionPool) {
    const e = DATA.evolutions.find((x) => x.id === id);
    ok(e.lv80ProjectileTarget === false, `${id}: 進化は Lv80 の対象外`);
  }
  // Wave1 の新 active のうち対象は 3 種だけ。
  const newTargets = EXPECTED.wave1Actives.filter((id) => SKILL(id).lv80ProjectileTarget === true);
  ok(newTargets.length === 3, `Wave1 の新規対象は 3 種（${newTargets.join(',')}）`);
  info(`Lv80 対象: ${flagged.join(' / ')}`);
}

// ===== 2. SkillAudit の判定と data 宣言が一致する =====
section('2. SkillAudit.appliesLv80ProjectileCount が data の宣言と一致する');
for (const id of WARRIOR.activeSkillPool) {
  const s = SKILL(id);
  const want = s.lv80ProjectileTarget === true;
  ok(appliesLv80ProjectileCount(s) === want, `${id}: 判定 ${appliesLv80ProjectileCount(s)} = 宣言 ${want}`);
}

// ===== 3. Lv80 で打撃数が増える（対象のみ）=====
section('3. Lv80 で対象だけ打撃数が増える');
{
  const bonus = mgr(80).projectileCountBonus();
  ok(bonus >= 1, `Lv80 の打撃数ボーナス +${bonus}`);
  ok(mgr(79).projectileCountBonus() === 0, 'Lv79 ではボーナスなし');
  for (const id of WARRIOR.activeSkillPool) {
    const target = SKILL(id).lv80ProjectileTarget === true;
    const lo = build({ jobLevel: 1 });
    lo.sm.acquireOrLevel(id); lo.sm.setLevel(id, 8);
    const hi = build({ jobLevel: 80 });
    hi.sm.acquireOrLevel(id); hi.sm.setLevel(id, 8);
    const base = SKILL(id).levels[7];
    const nBase = base.strikes || 1;
    ok(lo.sm.skills.get(id).strikeCount(nBase) === nBase, `${id}: Lv1 では打撃数 ${nBase} のまま`);
    const got = hi.sm.skills.get(id).strikeCount(nBase);
    ok(got === nBase + (target ? bonus : 0),
      `${id}: Lv80 の打撃数 ${got}（対象 ${target ? 'あり' : 'なし'}・素 ${nBase}）`);
  }
}

// ===== 4. 実プレイで打撃数が増える（対象 3 種）=====
section('4. 実プレイでも Wave1 の対象 3 種は Lv80 で打撃が増える');
for (const id of ['armor_breaker', 'twin_fang_slash', 'relentless_combo']) {
  const key = id === 'relentless_combo' ? 'plannedStrikes' : 'strikes';
  const measure = (lv) => {
    const ctx = build({ jobLevel: lv });
    ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
    run(ctx, 20000);
    const s = st(ctx, id);
    return { per: (s.extra?.[key] || 0) / Math.max(1, s.casts || 0), casts: s.casts || 0, hits: s.hits || 0 };
  };
  const lo = measure(1), hi = measure(80);
  ok(hi.per > lo.per, `${id}: 1 発動あたりの打撃 ${lo.per.toFixed(2)} → ${hi.per.toFixed(2)}`);
  // cast は増えない（追加打撃で cast が水増しされない）。
  ok(hi.casts === lo.casts, `${id}: Lv80 でも cast 数が変わらない（${lo.casts} → ${hi.casts}）`);
  info(`${id}: 打撃/発動 ${lo.per.toFixed(2)} → ${hi.per.toFixed(2)}（cast ${lo.casts} → ${hi.casts}）`);
}

// ===== 5. 非対象は Lv80 でも変わらない =====
section('5. 非対象は Lv80 でも打撃数・挙動が変わらない');
for (const id of EXPECTED.wave1Actives.filter((x) => SKILL(x).lv80ProjectileTarget !== true)) {
  const measure = (lv) => {
    const ctx = build({ jobLevel: lv });
    ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
    run(ctx, 20000);
    const s = st(ctx, id);
    return { casts: s.casts || 0, hits: s.hits || 0 };
  };
  const lo = measure(1), hi = measure(80);
  ok(lo.casts === hi.casts, `${id}: cast 数が変わらない（${lo.casts}）`);
  ok(lo.hits === hi.hits, `${id}: 命中数も変わらない（${lo.hits}）`);
}

// ===== 6. 弾は 1 つも増えない =====
section('6. Lv80 でも遠距離へ飛ぶ弾は 1 つも増えない');
for (const id of WARRIOR.activeSkillPool) {
  const ctx = build({ jobLevel: 80 });
  ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
  run(ctx, 12000);
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, `${id}: Lv80 でも弾を出さない`);
  // 遠くの敵には当たらない（移動系は自力で近づくので、移動しないスキルだけで見る）。
  if (MOVERS.has(id)) continue;
  const far = build({ jobLevel: 80, enemies: makeEnemies(6, { x: 1000, y: 1000, hp: 1e9 }) });
  far.sm.acquireOrLevel(id); far.sm.setLevel(id, 8);
  run(far, 12000);
  ok((st(far, id).hits || 0) === 0, `${id}: Lv80 でも 700px 先へ届かない`);
}

// ===== 7. 追加打撃でも闘気 / コンボが上限を超えない =====
section('7. Lv80 の追加打撃でも闘気 / コンボが 1 発動あたりの上限を超えない');
for (const id of EXPECTED.lv80Targets) {
  const ctx = build({ jobLevel: 80 });
  ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8);
  run(ctx, 20000);
  const s = st(ctx, id);
  const casts = Math.max(1, s.casts || 0);
  const fury = ctx.w.telemetry.furyGained / casts;
  ok(fury <= DATA.balance.warrior.fury.maxGainPerCast + 1e-6,
    `${id}: 1 発動あたりの闘気 ${fury.toFixed(2)} ≤ ${DATA.balance.warrior.fury.maxGainPerCast}`);
  const combo = ctx.w.telemetry.comboPeak / casts;
  ok(combo <= DATA.balance.warrior.combo.maxGainPerCast + 1e-6,
    `${id}: 1 発動あたりのコンボ ${combo.toFixed(2)} ≤ ${DATA.balance.warrior.combo.maxGainPerCast}`);
}

// ===== 8. 火 / 氷の Lv80 対象は変わっていない =====
section('8. 火 / 氷の Lv80 対象は M8-C で 1 件も変わっていない');
{
  const counts = {};
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    counts[jid] = j.activeSkillPool.filter((id) => SKILL(id).lv80ProjectileTarget === true).length;
  }
  // M8-A / M8-B 完了時点の測定値。
  ok(counts.flame_witch === 6, `火の魔女の Lv80 対象は 6 種のまま（実際 ${counts.flame_witch}）`);
  ok(counts.frost_mage === 6, `氷術師の Lv80 対象は 6 種のまま（実際 ${counts.frost_mage}）`);
  info(`Lv80 対象: 火 ${counts.flame_witch} / 氷 ${counts.frost_mage} / 戦士 6`);
}

T.finish();
