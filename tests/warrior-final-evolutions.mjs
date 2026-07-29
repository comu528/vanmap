// 戦士 最終Wave 5/16: 進化5 の固有仕様（M8-E §4）。Node.js 標準機能のみ。
//   神速貫陣    : 二度突く。二段目は少し広いが長さは同じ。1 発動 = 1 recordCast。
//   覇王討ち    : 決闘補正が強く、体勢崩しで小幅延長（上限つき）。撃破時 1 回だけ再選択。
//   血染修羅    : 構え中の撃破だけ回復が伸びる（既存の毎秒 cap を共有）。永続化しない。
//   大陸震砕踏破: 踏みが増え最終衝撃が広い。前進中の軽減は完全無敵にならない。
//   天鏡返し    : 弾は弾き返し、近接は既存の反撃調停へ。迎撃の構えは置換されず CD も変わらない。
// 実行: node tests/warrior-final-evolutions.mjs

import { DATA, WARRIOR, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, registryMap, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 最終Wave 進化5 固有仕様（M8-E）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const EVO = (id) => DATA.evolutions.find((x) => x.id === id);
const NEW_EVO = EXPECTED.finalEvolutions;

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 340, y: 300, dy: 5, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high', enemyBullets: opts.enemyBullets });
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

section('1. 進化は単一形態（Lv 固定）で、基礎 active を置換する');
for (const id of NEW_EVO) {
  const e = EVO(id);
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  const sk = ctx.sm.skills.get(id);
  ok(!!sk, `${id}: インスタンス化できる`);
  if (!sk) continue;
  ok(sk.isEvolved === true, `${id}: isEvolved=true`);
  ok(sk.maxLevel === 1, `${id}: maxLevel=1（進化後の追加 Lv なし）`);
  ok(sk.baseSkillId === e.baseSkillId, `${id}: baseSkillId=${e.baseSkillId}`);
  ok(sk.name === e.displayName, `${id}: 表示名が data 由来（${sk.name}）`);
  ok(sk.stats && sk.stats.cooldown === e.cooldown, `${id}: cooldown が evoDef 由来（${e.cooldown}）`);
}

section('2. 進化は実動作で発動する');
for (const id of NEW_EVO) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  run(ctx, 20000);
  const s = st(ctx, id);
  ok((s.casts || 0) > 0, `${id}: 発動する（${s.casts}）`);
  info(`${id}: cast${s.casts} hit${s.hits || 0} dmg${Math.round(s.damage || 0)}`);
}

section('3. 多段・追撃・tick で cast 数が水増しされない');
for (const id of NEW_EVO) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  run(ctx, 20000);
  const s = st(ctx, id);
  const cd = EVO(id).cooldown;
  ok((s.casts || 0) <= Math.ceil(20000 / cd) + 1, `${id}: cast ${s.casts} が CD ${cd}ms から見て妥当`);
}

section('4. 神速貫陣: 二度突き・長さは変わらない');
{
  const e = EVO('godspeed_impaler');
  ok(e.area.secondWidth > e.area.width, `二段目は広い（${e.area.width} → ${e.area.secondWidth}）`);
  ok(e.area.lineLength <= DATA.balance.warrior.line.maxLineLength, `長さは balance の上限内（${e.area.lineLength}）`);
  const ctx = build();
  ctx.sm.acquireOrLevel('godspeed_impaler');
  run(ctx, 20000);
  const s = st(ctx, 'godspeed_impaler');
  ok((s.extra?.thrusts || 0) === (s.casts || 0) * 2, `1 発動 2 突き（thrusts ${s.extra?.thrusts} = cast ${s.casts} × 2）`);
  ok((s.hits || 0) > (s.casts || 0), '多段は hits 側で数える');
  // 闘気 / コンボは 1 発動あたりの上限を共有する。
  const casts = Math.max(1, s.casts || 0);
  ok(ctx.w.telemetry.furyGained / casts <= DATA.balance.warrior.fury.maxGainPerCast + 1e-6,
    `1 発動あたりの闘気 ${(ctx.w.telemetry.furyGained / casts).toFixed(2)} ≤ ${DATA.balance.warrior.fury.maxGainPerCast}`);
}

section('5. 覇王討ち: 延長と再選択に上限がある');
{
  const e = EVO('king_slayer_duel');
  const cfg = DATA.balance.warrior.duel;
  ok(e.extension.maxTotalMs <= cfg.maxExtensionMs, `延長の合計上限が balance 以下（${e.extension.maxTotalMs}）`);
  ok(e.safetyCaps.maxRetargetsPerCast <= cfg.maxRetargetsPerCast, '再選択の上限が balance 以下');
  const ctx = build({ enemies: makeEnemies(6, { x: 340, y: 300, dy: 5, hp: 1e9, elite: true }) });
  ctx.sm.acquireOrLevel('king_slayer_duel');
  run(ctx, 24000);
  ok(ctx.w.telemetry.duelStarts > 0, `決闘が始まる（${ctx.w.telemetry.duelStarts}）`);
  ok(ctx.w.telemetry.duelElite > 0, `エリートを優先して選ぶ（${ctx.w.telemetry.duelElite}）`);
  // 延長しても合計上限を超えない。
  const d = ctx.w.duelState(null);
  if (d) ok(d.extendedMs <= d.maxExtensionMs + 1e-6, `延長 ${Math.round(d.extendedMs)}ms ≤ 上限 ${d.maxExtensionMs}ms`);
  ok(ctx.w.telemetry.duelRetargets <= ctx.w.telemetry.duelStarts * cfg.maxRetargetsPerCast,
    `再選択 ${ctx.w.telemetry.duelRetargets} が上限内`);
  // formal status を作っていない（相手に debuff を貼らない）。
  const src = skillSourceDeep('king_slayer_duel', registryMap()) || '';
  ok(!/applyStatus|addStatus|statusFx\./.test(src), '相手へ formal status を付けない');
}

section('6. 血染修羅: 回復は既存の毎秒 cap を共有し、永続化しない');
{
  const e = EVO('blood_asura_trance');
  const cfg = DATA.balance.warrior.trance;
  ok(e.bloodOath.killHealBonus <= cfg.maxKillHealBonus, `killHealBonus が上限以下（${e.bloodOath.killHealBonus}）`);
  ok(e.stance.durationMs <= cfg.maxDurationMs, `持続が上限以下（${e.stance.durationMs}）`);
  const ctx = build({ hp: 40 });
  ctx.w.mods.killHealMult = 1;
  ctx.sm.acquireOrLevel('blood_asura_trance');
  ctx.scene.player.hp = ctx.scene.player.maxHp * 0.4;
  run(ctx, 30000);
  ok(ctx.w.telemetry.tranceStarts > 0, `構えが発動する（${ctx.w.telemetry.tranceStarts}）`);
  ok(ctx.scene.player.hp <= ctx.scene.player.maxHp + 1e-9, '回復が最大 HP を超えない（overheal しない）');
  // 構えは必ず終わる（永続化しない）。
  for (let i = 0; i < 2000; i++) ctx.w.update(16);
  ok(!ctx.w.tranceActive, '時間が経てば構えは必ず終わる');
  // ライフスティールではない（撃破時だけ）。
  const src = skillSourceDeep('blood_asura_trance', registryMap()) || '';
  ok(!/lifesteal|drain/i.test(src), 'ライフスティールを持たない');
  ok(!/takeDamage|selfDamage/.test(src), '自傷しない');
}

section('7. 大陸震砕踏破: 前進中の軽減は完全無敵にならない');
{
  const e = EVO('continental_quake_march');
  const cfg = DATA.balance.warrior.march;
  ok(e.march.mitigationValue <= cfg.maxMitigation, `軽減が上限以下（${e.march.mitigationValue}）`);
  ok(e.area.finalRadius > e.area.radius, `最終衝撃は広い（${e.area.radius} → ${e.area.finalRadius}）`);
  ok(e.area.finalRadius <= cfg.maxRadius, `それでも近距離のまま（${e.area.finalRadius} ≤ ${cfg.maxRadius}）`);
  const ctx = build();
  ctx.sm.acquireOrLevel('continental_quake_march');
  run(ctx, 20000);
  const s = st(ctx, 'continental_quake_march');
  ok((s.extra?.stomps || 0) > (s.casts || 0), `1 発動で複数回踏む（stomps ${s.extra?.stomps} > cast ${s.casts}）`);
  ok(ctx.w.telemetry.marchFinalStomps > 0, `最終踏みが発生する（${ctx.w.telemetry.marchFinalStomps}）`);
  // 軽減の合計は 70% クランプ（無敵にならない）。
  const sk = ctx.sm.skills.get('continental_quake_march');
  const red = ctx.w.damageReduction({ engaged: true, charging: true, extra: sk.activeMitigation() });
  ok(red <= DATA.balance.warrior.mitigation.maxTotalReduction + 1e-9, `合計軽減 ${red.toFixed(3)} ≤ 0.7`);
  ok(ctx.w.applyIncomingDamage(100, { engaged: true, extra: sk.activeMitigation() }) > 0, '被弾が 0 にならない');
}

section('8. 天鏡返し: 迎撃の構えを置換せず CD も変えない');
{
  const e = EVO('heaven_mirror_reversal');
  ok(e.requiredSkills[0].skill === 'counter_stance', '補助は counter_stance');
  ok(WARRIOR.activeSkillPool.includes('counter_stance'), 'counter_stance は active（passive ではない）');
  ok(e.replacementSkillId !== 'counter_stance', 'counter_stance を置換しない');
  ok(e.requiredSkills[0].level > 0, `必要 Lv が data に明示されている（Lv${e.requiredSkills[0].level}）`);
  const ctx = build();
  ctx.sm.acquireOrLevel('counter_stance'); ctx.sm.setLevel('counter_stance', e.requiredSkills[0].level);
  const cdBefore = ctx.sm.skills.get('counter_stance').stats.cooldown;
  ctx.sm.acquireOrLevel('heaven_mirror_reversal');
  run(ctx, 20000);
  ok(!!ctx.sm.skills.get('counter_stance'), '進化後も迎撃の構えが残る');
  ok(ctx.sm.skills.get('counter_stance').stats.cooldown === cdBefore, `迎撃の構えの CD が変わらない（${cdBefore}）`);
  ok((st(ctx, 'counter_stance').casts || 0) > 0, '迎撃の構えも通常どおり発動する');
  ok((st(ctx, 'heaven_mirror_reversal').casts || 0) > 0, '天鏡返しも発動する');
  info(`天鏡返し cast${st(ctx, 'heaven_mirror_reversal').casts} / 迎撃の構え cast${st(ctx, 'counter_stance').casts}`);
}

section('9. 宣言値がすべて実装から参照される（死にフィールド禁止）');
{
  const map = registryMap();
  for (const id of NEW_EVO) {
    const src = skillSourceDeep(id, map) || '';
    const e = EVO(id);
    for (const key of Object.keys(e.safetyCaps || {})) {
      ok(src.includes(`'${key}'`) || src.includes(`"${key}"`), `${id}: safetyCaps.${key} が実装から参照される`);
    }
    for (const block of ['damage', 'area', 'knockback', 'poiseDamage', 'comboGain', 'furyGain',
      'movement', 'duel', 'stance', 'march', 'deflection', 'extension', 'bloodOath', 'secondaryImpact',
      'eliteBonus', 'bossBonus']) {
      if (!e[block]) continue;
      for (const key of Object.keys(e[block])) ok(src.includes(key), `${id}: ${block}.${key} が実装から参照される`);
    }
  }
}

section('10. 進化も遠距離だけで完結しない');
// 移動系（踏破）は自力で近づくので、遠方判定の対象から外す（M8-C / M8-D と同じ扱い）。
const MOVERS = new Set(['continental_quake_march']);
for (const id of NEW_EVO) {
  if (MOVERS.has(id)) { ok(true, `${id}: 移動系（自力で近づく）は遠距離判定の対象外`); continue; }
  const ctx = build({ enemies: makeEnemies(6, { x: 1200, y: 1000, hp: 1e9 }) });
  ctx.sm.acquireOrLevel(id);
  run(ctx, 16000);
  ok((st(ctx, id).hits || 0) === 0, `${id}: 遠く（900px 以上）の敵には届かない`);
}

T.finish();
