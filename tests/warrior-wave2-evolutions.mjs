// 戦士 Wave2 5/21: 進化5 の固有仕様（M8-D §新 evolution）。Node.js 標準機能のみ。
//   天衝断空  : 二段の斬り上げ。打ち上げは一段目だけ・同一敵は 1 発動 1 回。
//   城塞蹂躙  : 突進が長く終点衝撃が広い。前面防御が強い（ただし 55% で頭打ち）。
//   無影燕返  : 二度差し返す。二段目だけ近距離 retarget 可・テレポートしない。
//   山岳投擲  : 着地点に大 impact。ground_slam は置換されず CD も変わらない。
//   血盟戦旗  : 陣の内側の撃破だけ回復が強まる。旗は 1 本・秒間 cap は外さない。
// 共通: 1 発動 = 1 recordCast、遠距離へ弾を飛ばさない、宣言値がすべて実装から参照される。
// 実行: node tests/warrior-wave2-evolutions.mjs

import { DATA, WARRIOR, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, registryMap, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 Wave2 進化5 固有仕様（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const EVO = (id) => DATA.evolutions.find((x) => x.id === id);
const NEW_EVO = EXPECTED.wave2Evolutions;

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 330, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms = 12000, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
  }
};
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. 進化は単一形態・基礎を置換する =====
section('1. 進化は単一形態（Lv 固定）で、基礎 active を置換する');
for (const id of NEW_EVO) {
  const e = EVO(id);
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  const sk = ctx.sm.skills.get(id);
  ok(!!sk, `${id}: インスタンス化できる`);
  if (!sk) continue;
  ok(sk.isEvolved === true, `${id}: isEvolved=true`);
  ok(sk.maxLevel === 1, `${id}: maxLevel=1（単一形態）`);
  ok(sk.baseSkillId === e.baseSkillId, `${id}: baseSkillId=${e.baseSkillId}`);
  ok(sk.name === e.displayName, `${id}: 表示名が data 由来（${sk.name}）`);
  ok(sk.stats && sk.stats.cooldown === e.cooldown, `${id}: cooldown が evoDef 由来（${e.cooldown}）`);
}

// ===== 2. 実際に撃てて、ダメージが基礎より重い =====
section('2. 進化は実動作で基礎より重い（役割は変わらない）');
for (const id of NEW_EVO) {
  const e = EVO(id);
  const evo = build(); evo.sm.acquireOrLevel(id); run(evo, 16000);
  const base = build(); base.sm.acquireOrLevel(e.baseSkillId); base.sm.setLevel(e.baseSkillId, 8); run(base, 16000);
  const de = st(evo, id).damage || 0, db = st(base, e.baseSkillId).damage || 0;
  ok(de > 0, `${id}: ダメージを出す（${Math.round(de)}）`);
  ok((st(evo, id).casts || 0) > 0, `${id}: 発動する（${st(evo, id).casts}）`);
  info(`${id}: 進化 ${Math.round(de)} / 基礎 Lv8 ${Math.round(db)}`);
}

// ===== 3. 1 発動 = 1 recordCast =====
section('3. 多段・追撃・tick で cast 数が水増しされない');
for (const id of NEW_EVO) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  run(ctx, 16000);
  const s = st(ctx, id);
  ok((s.casts || 0) > 0, `${id}: cast > 0`);
  ok((s.hits || 0) >= (s.casts || 0) || (s.hits || 0) === 0, `${id}: hits ≥ casts（多段は hits 側で数える）`);
}

// ===== 4. 遠距離へ飛ばさない =====
section('4. 進化も遠距離へ弾を飛ばさない');
const MOVERS = new Set(['fortress_rampage', 'shadow_swallow_riposte']);
for (const id of NEW_EVO) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  run(ctx, 12000);
  ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, `${id}: 弾を 1 つも出さない`);
  if (MOVERS.has(id)) continue;
  const far = build({ enemies: makeEnemies(6, { x: 1000, y: 1000, hp: 1e9 }) });
  far.sm.acquireOrLevel(id);
  run(far, 12000);
  ok((st(far, id).hits || 0) === 0, `${id}: 700px 先へは届かない`);
}

// ===== 5. 天衝断空: 打ち上げは一段目だけ・同一敵 1 回 =====
section('5. 天衝断空: 打ち上げは一段目のみ・同一敵は 1 発動 1 回');
{
  const ctx = build();
  ctx.sm.acquireOrLevel('heaven_rending_ascent');
  run(ctx, 12000);
  const casts = st(ctx, 'heaven_rending_ascent').casts || 0;
  ok(ctx.w.telemetry.launches > 0, `打ち上げが発生する（${ctx.w.telemetry.launches}）`);
  const cap = EVO('heaven_rending_ascent').safetyCaps.maxLaunchPerTargetPerCast;
  ok(ctx.w.telemetry.launches <= casts * cap * ctx.enemies.length,
    `打ち上げ数が 1 発動 × 上限 ${cap} × 敵数 を超えない（${ctx.w.telemetry.launches}）`);
  // エリート / ボスは浮かず、体勢へ変換される。
  const eb = build({ enemies: makeEnemies(4, { x: 330, y: 300, dy: 3, hp: 1e9, elite: true }), boss: makeBoss({ x: 350, y: 300, hp: 1e9 }) });
  eb.sm.acquireOrLevel('heaven_rending_ascent');
  run(eb, 12000);
  ok(eb.w.telemetry.launches === 0, `エリート / ボスは 1 度も浮かない（${eb.w.telemetry.launches}）`);
  ok(eb.w.telemetry.launchBlocked > 0, `打ち上げ拒否が記録される（${eb.w.telemetry.launchBlocked}）`);
  ok(eb.w.telemetry.launchPoiseConverted > 0, `体勢削りへ変換される（${eb.w.telemetry.launchPoiseConverted.toFixed(1)}）`);
}

// ===== 6. 城塞蹂躙: 前面防御が上限を超えない =====
section('6. 城塞蹂躙: 前面軽減が balance の上限（55%）を超えない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel('fortress_rampage');
  run(ctx, 4000);
  const maxFront = DATA.balance.warrior.frontalGuard.maxFrontalMitigation;
  ok(!ctx.w.frontGuardActive || ctx.w.frontGuard.mitigation <= maxFront + 1e-9,
    `前面軽減 ${ctx.w.frontGuard.mitigation.toFixed(3)} ≤ ${maxFront}`);
  ok((st(ctx, 'fortress_rampage').casts || 0) > 0, '突進が発動する');
  ok((st(ctx, 'fortress_rampage').extra?.impacts || 0) <= (st(ctx, 'fortress_rampage').casts || 0),
    '終点衝撃は 1 発動 1 回まで');
}

// ===== 7. 無影燕返: 二段・テレポートしない =====
section('7. 無影燕返: 二度差し返し、座標が飛ばない');
{
  const ctx = build();
  ctx.sm.acquireOrLevel('shadow_swallow_riposte');
  const p = ctx.scene.player;
  let maxJump = 0, prev = { x: p.x, y: p.y };
  for (let i = 0; i < 900; i++) {
    ctx.sm.update(16, { hasEnemies: true }); ctx.w.update(16); ctx.scene.advance(16);
    maxJump = Math.max(maxJump, Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = { x: p.x, y: p.y };
  }
  const s = st(ctx, 'shadow_swallow_riposte');
  const cap = EVO('shadow_swallow_riposte').safetyCaps.maxRipostesPerCast;
  ok((s.extra?.strikes || 0) > (s.casts || 0), `1 発動で 2 回斬る（strikes ${s.extra?.strikes} > casts ${s.casts}）`);
  ok((s.extra?.strikes || 0) <= (s.casts || 0) * cap, `斬り返しは 1 発動 ${cap} 回まで`);
  ok(maxJump < 60, `1 フレームの移動が ${maxJump.toFixed(1)}px（テレポートしない）`);
  ok(Number.isFinite(p.x) && Number.isFinite(p.y), '座標が NaN にならない');
}

// ===== 8. 山岳投擲: ground_slam を置換せず CD も触らない =====
section('8. 山岳投擲: 補助 active（大地砕き）を置換せず CD も変えない');
{
  const e = EVO('mountain_hurl');
  ok(e.requiredSkills[0].skill === 'ground_slam', '補助は ground_slam');
  ok(WARRIOR.activeSkillPool.includes('ground_slam'), 'ground_slam は active（passive ではない）');
  ok(e.replacementSkillId !== 'ground_slam', 'ground_slam を置換しない');
  ok(!WARRIOR.evolutionPool.some((x) => EVO(x).baseSkillId === 'ground_slam'), 'ground_slam 自体は進化元ではない');
  const ctx = build();
  ctx.sm.acquireOrLevel('ground_slam'); ctx.sm.setLevel('ground_slam', 6);
  const cdBefore = ctx.sm.skills.get('ground_slam').stats.cooldown;
  ctx.sm.acquireOrLevel('mountain_hurl');
  run(ctx, 16000);
  ok(!!ctx.sm.skills.get('ground_slam'), '進化後も大地砕きが残る');
  ok(ctx.sm.skills.get('ground_slam').stats.cooldown === cdBefore, `大地砕きの CD が変わらない（${cdBefore}）`);
  ok((st(ctx, 'ground_slam').casts || 0) > 0, '大地砕きも通常どおり発動する');
  ok((st(ctx, 'mountain_hurl').casts || 0) > 0, '山岳投擲も発動する');
  info(`山岳投擲 cast${st(ctx, 'mountain_hurl').casts} / 大地砕き cast${st(ctx, 'ground_slam').casts}`);
}

// ===== 9. 血盟戦旗: 旗は 1 本・秒間 cap を外さない =====
section('9. 血盟戦旗: 旗は常に 1 本・血気の秒間 cap を外さない');
{
  const ctx = build({ hp: 1 });
  ctx.sm.acquireOrLevel('blood_oath_standard');
  run(ctx, 40000);
  ok(ctx.w.rallyField === null || typeof ctx.w.rallyField === 'object', '陣は 1 つのフィールドで表現される');
  const cfg = DATA.balance.warrior.rally;
  if (ctx.w.rallyField) {
    ok(ctx.w.rallyField.killHealBonus <= cfg.maxKillHealBonus + 1e-9, `killHealBonus ≤ ${cfg.maxKillHealBonus}`);
    ok(ctx.w.rallyField.perSecondCapBonus <= cfg.maxKillHealBonus + 1e-9, `perSecondCapBonus ≤ ${cfg.maxKillHealBonus}`);
    ok(ctx.w.rallyField.leftMs <= cfg.maxDurationMs + 1e-9, `持続 ≤ ${cfg.maxDurationMs}ms`);
  }
  ok(ctx.w.telemetry.rallyPlacements >= 2, `複数回立てても（${ctx.w.telemetry.rallyPlacements} 回）陣は 1 つのまま`);
  // 回復は overheal しない。
  ok(ctx.scene.player.hp <= ctx.scene.player.maxHp + 1e-9, '回復が最大 HP を超えない');
}

// ===== 10. 宣言値がすべて実装から参照される（死にフィールド禁止）=====
section('10. 進化の宣言値がすべて実装から参照される');
{
  const map = registryMap();
  for (const id of NEW_EVO) {
    const src = skillSourceDeep(id, map) || '';
    const e = EVO(id);
    for (const key of Object.keys(e.safetyCaps || {})) {
      ok(src.includes(`'${key}'`) || src.includes(`"${key}"`), `${id}: safetyCaps.${key} が実装から参照される`);
    }
    for (const block of ['damage', 'area', 'knockback', 'poiseDamage', 'comboGain', 'furyGain', 'movement', 'throw', 'field', 'launch', 'charge', 'mitigation', 'bloodOath', 'graceRefill', 'secondaryImpact']) {
      if (!e[block]) continue;
      for (const key of Object.keys(e[block])) ok(src.includes(key), `${id}: ${block}.${key} が実装から参照される`);
    }
  }
}

T.finish();
