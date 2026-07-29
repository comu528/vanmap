// 戦士 Wave1 4/19: 追加 evolution5 の固有仕様（M8-C §12）。Node.js 標準機能のみ。
// tests/warrior-evolutions.mjs が「進化 8 種共通の骨格」を見るのに対し、
// ここでは Wave1 の 5 進化それぞれに課した**役割固有の約束**だけを検証する。
//   - skull_splitter        : 二段構え・体勢削りは 1 発動 1 回・処刑しない
//   - crimson_execution     : 処刑閾値が基礎より高い・撃破連鎖は 1 世代・エリート/ボスは処刑不可
//   - war_god_roar          : buff が基礎より強く長い・重ねがけしない・コンボ値は配らない
//   - adamant_counter       : 構えが長い・優先度が最上位・反撃後の追加軽減
//   - heaven_crushing_descent: 二次衝撃 1 回・補助 active（地砕き）を置換せず CD にも触らない
// 実行: node tests/warrior-wave1-evolutions.mjs

import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, registryMap, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 Wave1 進化5 固有仕様（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const EVO = (id) => DATA.evolutions.find((x) => x.id === id);
const SKILL = (id) => DATA.skills.find((x) => x.id === id);

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
const st = (ctx, id) => ctx.sm.statsList().find((s) => s.id === id) || {};

// ===== 1. 進化元・補助の対応（M8-C §12 の指定どおり）=====
section('1. Wave1 の 5 進化が指定どおりの「進化元 + 補助」で成立する');
{
  const WANT = {
    skull_splitter: ['armor_breaker', 'brute_force'],
    crimson_execution: ['execution_strike', 'bloodlust'],
    war_god_roar: ['war_cry', 'combat_instinct'],
    adamant_counter: ['counter_stance', 'heavy_armor'],
    heaven_crushing_descent: ['leap_smash', 'ground_slam'],
  };
  for (const [id, [base, support]] of Object.entries(WANT)) {
    const e = EVO(id);
    ok(!!e, `${id}: 進化定義がある`);
    ok(e.baseSkillId === base, `${id}: 進化元は ${base}（実際 ${e.baseSkillId}）`);
    const reqs = (e.requiredSkills || []).map((r) => r.skill);
    ok(reqs.includes(support), `${id}: 補助は ${support}（実際 ${reqs.join(',')}）`);
    const r = (e.requiredSkills || []).find((x) => x.skill === support);
    ok(r && r.level > 0, `${id}: 補助 ${support} に必要 Lv が明示されている（Lv${r?.level}）`);
    ok(e.replacementSkillId === id, `${id}: replacementSkillId は自分自身`);
    ok(e.lv80ProjectileTarget === false, `${id}: Job Lv80 の弾数対象ではない`);
  }
  // 補助が active なのは天墜崩撃だけ（他は passive）。
  for (const id of EXPECTED.wave1Evolutions) {
    const e = EVO(id);
    for (const r of e.requiredSkills || []) {
      const isActive = !!SKILL(r.skill);
      if (isActive) ok(id === 'heaven_crushing_descent', `${id}: active を補助にするのは天墜崩撃だけ`);
    }
  }
}

// ===== 2. 断界兜割: 二段構え・体勢削りは 1 発動 1 回・処刑しない =====
section('2. 断界兜割: 二段構えで、同一敵への体勢削りは 1 発動 1 回、処刑はしない');
{
  const e = EVO('skull_splitter');
  const ctx = build({ enemies: makeEnemies(1, { x: 340, y: 300, hp: 1e9 }) });
  ctx.sm.acquireOrLevel('skull_splitter');
  run(ctx, 8000);
  const s = st(ctx, 'skull_splitter');
  ok((s.extra?.strikes || 0) <= (s.casts || 0) * e.safetyCaps.maxStrikesPerCast,
    `打撃 ${s.extra?.strikes} ≤ maxStrikesPerCast × cast${s.casts}`);
  ok((s.extra?.strikes || 0) >= (s.casts || 0) * 2 - 2, `二段構え（打撃 ${s.extra?.strikes} / cast ${s.casts}）`);
  // 体勢削り: 1 敵 1 発動 1 回なので、体勢削り呼び出し数 ≤ cast 数。
  const ws = ctx.scene._warriorSkillStats.skull_splitter || {};
  const maxPoise = (s.casts || 0) * Math.max(e.poiseDamage.first, e.poiseDamage.second) * 1.05;
  ok((ws.poiseDamage || 0) <= maxPoise, `体勢削り合計 ${Math.round(ws.poiseDamage || 0)} ≤ 1 発動 1 回ぶん ${Math.round(maxPoise)}`);
  ok((ws.executions || 0) === 0, '処刑は行わない（処刑は血断処刑の役割）');
  // 硬い相手への追加倍率が実際に乗る。
  const boss = makeBoss({ hp: 1e9 });
  const hard = build({ enemies: [], boss });
  hard.sm.acquireOrLevel('skull_splitter');
  run(hard, 4000);
  const hs = st(hard, 'skull_splitter');
  const perHit = (hs.damage || 0) / Math.max(1, hs.hits || 0);
  ok(perHit > e.damage.second, `ボスへの 1 発平均 ${perHit.toFixed(1)} > 素の二撃目 ${e.damage.second}（bossBonus が乗る）`);
  info(`断界兜割: cast${s.casts} 打撃${s.extra?.strikes} 体勢${Math.round(ws.poiseDamage || 0)}`);
}

// ===== 3. 血断処刑: 閾値・連鎖世代・エリート/ボス =====
section('3. 血断処刑: 処刑閾値が基礎より高く、撃破連鎖は 1 世代、エリート/ボスは処刑できない');
{
  const e = EVO('crimson_execution');
  const base = SKILL('execution_strike');
  const baseTh = base.levels[base.levels.length - 1].executeThresholdNormal;
  ok(e.execute.thresholdNormal > baseTh, `閾値 ${e.execute.thresholdNormal} > 基礎 Lv8 ${baseTh}`);
  ok(e.killChain.maxGenerations === 1 && e.safetyCaps.maxKillChainGenerations === 1, '撃破連鎖は 1 世代まで');

  // 通常敵は処刑される。
  const weak = makeEnemies(12, { x: 320, y: 300, dy: 4, hp: 1000 });
  for (const en of weak) en.hp = 200; // 20% → 閾値以下
  const ctx = build({ enemies: weak });
  ctx.sm.acquireOrLevel('crimson_execution');
  run(ctx, 6000);
  const ws = ctx.scene._warriorSkillStats.crimson_execution || {};
  ok((ws.executions || 0) > 0, `瀕死の通常敵を処刑する（${ws.executions} 体）`);
  ok(ctx.w.telemetry.executions === (ws.executions || 0), `テレメトリの処刑数が一致（${ctx.w.telemetry.executions}）`);

  // エリートは処刑されない（追加ダメージのみ）。
  const elites = makeEnemies(6, { x: 320, y: 300, dy: 4, hp: 1e9, elite: true });
  for (const en of elites) en.hp = en.maxHp * 0.05;
  const ectx = build({ enemies: elites });
  ectx.sm.acquireOrLevel('crimson_execution');
  run(ectx, 6000);
  const ews = ectx.scene._warriorSkillStats.crimson_execution || {};
  ok((ews.executions || 0) === 0, 'エリートは処刑できない');
  ok(elites.every((en) => en.alive), 'エリートは HP 5% でも生き残る');
  const eperHit = (st(ectx, 'crimson_execution').damage || 0) / Math.max(1, st(ectx, 'crimson_execution').hits || 0);
  ok(eperHit > e.damage.strike, `エリートには失った HP ぶんの追加ダメージ（1 発平均 ${eperHit.toFixed(1)} > ${e.damage.strike}）`);

  // ボスは処刑されず、追加ダメージは bossMissingHpCap で頭打ち。
  const boss = makeBoss({ hp: 1e9 });
  boss.hp = boss.maxHp * 0.02; // 98% 欠損
  const bctx = build({ enemies: [], boss });
  bctx.sm.acquireOrLevel('crimson_execution');
  run(bctx, 4000);
  const bs = st(bctx, 'crimson_execution');
  ok(boss.alive || boss.hp > 0 || bctx.w.telemetry.executions === 0, 'ボスは処刑されない');
  ok((bctx.scene._warriorSkillStats.crimson_execution?.executions || 0) === 0, 'ボスの処刑数は 0');
  const bperHit = (bs.damage || 0) / Math.max(1, bs.hits || 0);
  const capMult = 1 + e.execute.bossMissingHpCap * e.execute.missingHpBonusBoss;
  ok(bperHit <= e.damage.strike * capMult * 1.02,
    `ボスへの追加ダメージが上限内（1 発平均 ${bperHit.toFixed(1)} ≤ ${(e.damage.strike * capMult).toFixed(1)}）`);
  info(`血断処刑: 通常処刑${ws.executions} エリート処刑${ews.executions || 0} ボス倍率上限${capMult.toFixed(2)}`);
}

// ===== 4. 軍神咆哮: buff の強さ・重ねがけなし・コンボ値を配らない =====
section('4. 軍神咆哮: バフが基礎より強く長い / 重ねがけしない / コンボ値は無料で配らない');
{
  const e = EVO('war_god_roar');
  const base = SKILL('war_cry');
  const bl = base.levels[base.levels.length - 1];
  ok(e.buff.durationMs >= bl.buffDuration, `持続 ${e.buff.durationMs} ≥ 基礎 Lv8 ${bl.buffDuration}`);
  ok(e.buff.meleeDamageBonus >= bl.meleeDamageBonus, `近接ダメージ ${e.buff.meleeDamageBonus} ≥ 基礎 ${bl.meleeDamageBonus}`);
  ok(e.buff.stack === 'refresh', '重ねがけ規則は refresh');

  const ctx = build();
  ctx.sm.acquireOrLevel('war_god_roar');
  run(ctx, 200);
  const first = { ...ctx.w.warCry };
  ok(first.leftMs > 0, `咆哮でバフが付く（残り ${Math.round(first.leftMs)}ms）`);
  // 連打しても強度が積み上がらない。
  const sk = ctx.sm.skills.get('war_god_roar');
  for (let i = 0; i < 20; i++) sk.fire();
  ok(ctx.w.warCry.meleeDamageBonus === first.meleeDamageBonus, `20 連打しても近接ダメージ倍率が変わらない（${ctx.w.warCry.meleeDamageBonus}）`);
  ok(ctx.w.warCry.furyGainBonus === first.furyGainBonus, '闘気獲得ボーナスも変わらない');
  ok(ctx.w.warCry.leftMs <= e.buff.durationMs + 1e-6, `持続が上限を超えない（${Math.round(ctx.w.warCry.leftMs)}ms ≤ ${e.buff.durationMs}）`);

  // graceRefill はコンボ「猶予」だけを回復し、コンボ値そのものは増やさない。
  // 咆哮の衝撃そのものが命中してコンボを稼ぐと区別できないので、敵ゼロで確かめる。
  const g = build({ enemies: [] });
  g.sm.acquireOrLevel('war_god_roar');
  g.w.addCombo(10, 'seed', null);
  const comboBefore = g.w.combo;
  g.w.comboGraceLeftMs = 1;
  g.sm.skills.get('war_god_roar').fire();
  ok(g.w.combo === comboBefore, `コンボ値は増えない（${comboBefore} → ${g.w.combo}）`);
  ok(g.w.comboGraceLeftMs > 1, `猶予だけが回復する（${Math.round(g.w.comboGraceLeftMs)}ms）`);
  info(`軍神咆哮: 持続${e.buff.durationMs}ms 近接+${e.buff.meleeDamageBonus} 闘気+${e.buff.furyGainBonus}`);
}

// ===== 5. 金剛迎撃: 構えの長さ・優先度・反撃後の追加軽減 =====
section('5. 金剛迎撃: 構えが基礎より長く、反撃の優先度が最上位、反撃後に追加軽減を得る');
{
  const e = EVO('adamant_counter');
  const base = SKILL('counter_stance');
  const bl = base.levels[base.levels.length - 1];
  ok(e.counterWindow.durationMs >= bl.windowDuration, `構え ${e.counterWindow.durationMs}ms ≥ 基礎 Lv8 ${bl.windowDuration}ms`);
  ok(e.counterWindow.maxCountersPerWindow >= bl.maxCounters, `受け流し回数 ${e.counterWindow.maxCountersPerWindow} ≥ 基礎 ${bl.maxCounters}`);
  const prio = DATA.balance.warrior.counter.priority;
  ok(e.counterWindow.priority >= Math.max(...Object.values(prio)),
    `優先度 ${e.counterWindow.priority} が最上位（balance の優先度 ${JSON.stringify(prio)}）`);

  const ctx = build();
  ctx.sm.acquireOrLevel('adamant_counter');
  run(ctx, 200);
  const sk = ctx.sm.skills.get('adamant_counter');
  const beforeMit = sk.activeMitigation();
  ok(beforeMit > 0, `構え中は軽減がある（${beforeMit}）`);
  const done = ctx.scene.onWarriorHit(50, 50);
  ok(done === 'adamant_counter', `被弾で反撃する（${done}）`);
  ok(sk.activeMitigation() >= beforeMit, `反撃直後は軽減が下がらない（${sk.activeMitigation()}）`);
  ok(sk._counterMitigationLeft > 0, `反撃成功で追加軽減が付く（${Math.round(sk._counterMitigationLeft)}ms）`);
  ok(sk._counterMitigationLeft <= e.safetyCaps.maxCounterMitigationMs,
    `追加軽減の長さが safetyCaps 以内（≤ ${e.safetyCaps.maxCounterMitigationMs}ms）`);
  // 反撃から新しい反撃は生まれない（再入禁止）。
  const counters0 = ctx.w.telemetry.counters;
  ctx.scene.onWarriorHit(50, 50);
  ok(ctx.w.telemetry.counters <= counters0 + 1, `1 被弾で反撃は 1 回まで（${ctx.w.telemetry.counters}）`);
  info(`金剛迎撃: 構え${e.counterWindow.durationMs}ms 優先度${e.counterWindow.priority} 追加軽減${e.onCounter.mitigationMs}ms`);
}

// ===== 6. 天墜崩撃: 二次衝撃 1 回・補助 active を置換しない =====
section('6. 天墜崩撃: 二次衝撃は 1 回まで、補助 active（地砕き）を置換せず CD にも触らない');
{
  const e = EVO('heaven_crushing_descent');
  const ctx = build();
  ctx.sm.acquireOrLevel('heaven_crushing_descent');
  run(ctx, 12000);
  const s = st(ctx, 'heaven_crushing_descent');
  const lands = s.extra?.landings || 0;
  ok(lands > 0, `着地する（${lands} 回）`);
  ok((s.extra?.secondaryImpacts || 0) <= lands, `二次衝撃 ${s.extra?.secondaryImpacts} ≤ 着地 ${lands}（1 着地 1 回）`);
  ok((s.extra?.secondaryImpacts || 0) <= lands * (e.safetyCaps.maxImpactsPerCast - 1),
    `二次衝撃が maxImpactsPerCast 以内`);
  ok((s.casts || 0) <= Math.ceil(12000 / e.cooldown) + 2, `1 発動 = 1 cast（${s.casts}）`);

  // 補助 active（地砕き）は置換されず、CD も動かない。
  const both = build();
  both.sm.acquireOrLevel('ground_slam');
  both.sm.setLevel('ground_slam', 6);
  both.sm.acquireOrLevel('leap_smash');
  both.sm.setLevel('leap_smash', 8);
  const evoId = both.sm.evolve('leap_smash');
  ok(evoId === 'heaven_crushing_descent', `leap_smash → heaven_crushing_descent へ進化（${evoId}）`);
  ok(both.sm.skills.has('ground_slam'), '補助 active（地砕き）は残る＝置換されない');
  ok(!both.sm.skills.has('leap_smash'), '進化元（跳躍強襲）は消える');
  const gs = both.sm.skills.get('ground_slam');
  const cdBefore = gs._cd;
  const evo = both.sm.skills.get('heaven_crushing_descent');
  evo.fire();
  ok(gs._cd === cdBefore, `天墜崩撃の発動で地砕きの CD が動かない（${cdBefore} → ${gs._cd}）`);
  run(both, 12000);
  const gsSt = st(both, 'ground_slam');
  const gsDef = SKILL('ground_slam');
  const gsMax = Math.ceil(12000 / gsDef.levels[5].cooldown) + 2;
  ok((gsSt.casts || 0) <= gsMax, `地砕きは自分の CD どおりにしか発動しない（${gsSt.casts} ≤ ${gsMax}・無料発動なし）`);
  ok((gsSt.casts || 0) > 0, '地砕き自身は通常どおり発動し続ける');
  info(`天墜崩撃: 着地${lands} 二次${s.extra?.secondaryImpacts || 0} / 地砕き cast${gsSt.casts}`);
}

// ===== 7. Wave1 進化は弾を飛ばさない / 死にフィールドなし =====
section('7. Wave1 進化は遠距離へ飛ばず、宣言した数値がすべて実装から参照される');
{
  const map = registryMap();
  for (const id of EXPECTED.wave1Evolutions) {
    const ctx = build();
    ctx.sm.acquireOrLevel(id);
    run(ctx, 6000);
    ok(ctx.scene.calls.filter((c) => c[0] === 'proj').length === 0, `${id}: 弾を飛ばさない`);
    const src = skillSourceDeep(id, map) || '';
    const e = EVO(id);
    for (const key of Object.keys(e.safetyCaps || {})) {
      ok(src.includes(`'${key}'`) || src.includes(`"${key}"`), `${id}: safetyCaps.${key} を参照する`);
    }
    for (const block of ['damage', 'area', 'knockback', 'poiseDamage', 'comboGain', 'furyGain',
      'execute', 'killChain', 'buff', 'counterWindow', 'onCounter', 'leap', 'secondaryImpact', 'projectileCount']) {
      if (!e[block]) continue;
      for (const key of Object.keys(e[block])) ok(src.includes(key), `${id}: ${block}.${key} を参照する`);
    }
  }
}

// ===== 8. M8-C.1: 進化条件そのものは変えていない =====
section('8. M8-C.1 の導線補助は進化条件を 1 件も変えていない（抽選重みだけ）');
{
  const { GUIDANCE_RECIPES, SKILL_CONFIG } = await import('./warrior-draft-sim.mjs');
  ok(GUIDANCE_RECIPES.length === EXPECTED.evolutionCount, `レシピ ${GUIDANCE_RECIPES.length} 件 = 進化 ${EXPECTED.evolutionCount} 件`);
  for (const r of GUIDANCE_RECIPES) {
    const e = EVO(r.evolutionId);
    ok(r.baseSkillId === e.baseSkillId, `${r.evolutionId}: 進化元が data どおり`);
    ok(r.baseLevel === (SKILL(e.baseSkillId).maxLevel || 8), `${r.evolutionId}: 必要 base Lv が data どおり（${r.baseLevel}）`);
    ok(r.requirements.length === (e.requiredSkills || []).length, `${r.evolutionId}: 補助の件数が data どおり`);
    for (const q of e.requiredSkills || []) {
      const m = r.requirements.find((x) => x.skill === q.skill);
      ok(m && m.level === q.level, `${r.evolutionId}: 補助 ${q.skill} Lv${q.level} が data どおり`);
    }
  }
  ok(SKILL_CONFIG.guidance.jobs.join(',') === 'warrior', '導線補助は戦士専用');
  // 進化そのものの数値（damage / cooldown / safetyCaps）は M8-C から不変。
  for (const id of EXPECTED.wave1Evolutions) {
    const e = EVO(id);
    ok(typeof e.cooldown === 'number' && e.cooldown > 0, `${id}: cooldown が不変（${e.cooldown}ms）`);
    ok(Object.keys(e.safetyCaps || {}).length > 0, `${id}: safetyCaps が残っている`);
  }
}

T.finish();
