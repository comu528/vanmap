// 戦士 最終Wave 7/16: 一騎討ち（M8-E §duel_challenge）。Node.js 標準機能のみ。
//   - 対象の優先度は ボス > エリート > 高 HP の通常敵
//   - **正式な状態異常を作らない**。相手へ debuff を貼らず、戦士本人の補正としてだけ効く
//   - 決闘対象は常に 1 体。再発動は置換であり重ねがけしない
//   - 対象へだけ近接ダメージ / 体勢 / 闘気が伸び、対象以外へは 1 も乗らない
//   - 敵オブジェクトを保存しない（安定 runtime id だけを持つ）
//   - 死亡 / プール返却 / destroy / reset で必ず解除される
// 実行: node tests/warrior-duel-challenge.mjs

import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc, skillSourceDeep, registryMap } from './warrior-common.mjs';

const T = runner('戦士 一騎討ち（M8-E）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ID = 'duel_challenge';
const SKILL = DATA.skills.find((x) => x.id === ID);
const DUEL = DATA.balance.warrior.duel;

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(10, { x: 340, y: 300, dy: 3, hp: opts.hp || 1e9 });
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

// ===== 1. 対象優先度 =====
section('1. 優先度は ボス > エリート > 高 HP の通常敵');
{
  ok(DUEL.bossPriority > DUEL.elitePriority && DUEL.elitePriority > DUEL.normalPriority,
    `balance の優先度 ボス${DUEL.bossPriority} > エリート${DUEL.elitePriority} > 通常${DUEL.normalPriority}`);
  // ボスがいればボス。
  const b = makeBoss({ x: 420, y: 300, hp: 1e9 });
  const bctx = build({ enemies: makeEnemies(6, { x: 380, y: 300, dx: 5, hp: 1e9, elite: true }), boss: b });
  bctx.sm.acquireOrLevel(ID); bctx.sm.setLevel(ID, 8);
  run(bctx, 4000);
  ok(bctx.w.duelActive && bctx.w.duelKind === 'boss', `ボスが最優先（kind=${bctx.w.duelKind}）`);
  ok(bctx.w.telemetry.duelBoss > 0, 'ボス決闘が記録される');

  // ボスがいなければエリート。
  const ectx = build({ enemies: [...makeEnemies(6, { x: 380, y: 300, dx: 5, hp: 1e9 }), ...makeEnemies(1, { x: 420, y: 300, hp: 1e9, elite: true })] });
  ectx.sm.acquireOrLevel(ID); ectx.sm.setLevel(ID, 8);
  run(ectx, 4000);
  ok(ectx.w.duelKind === 'elite', `エリートが次点（kind=${ectx.w.duelKind}）`);

  // 通常敵しかいなければ HP の高い通常敵。
  const normals = makeEnemies(6, { x: 380, y: 300, dx: 5, hp: 1000 });
  normals.forEach((e, i) => { e.maxHp = 1000; e.hp = 100 + i * 150; });
  const nctx = build({ enemies: normals });
  nctx.sm.acquireOrLevel(ID); nctx.sm.setLevel(ID, 8);
  const target = nctx.scene.pickDuelTarget(400, 300, 400, { normalTargetHpPriority: SKILL.levels[7].normalTargetHpPriority });
  ok(target === normals[normals.length - 1], `HP の高い通常敵が選ばれる（hp ${target.hp}）`);
  ok(DUEL.allowNormalTarget === true, 'balance で通常敵も対象にできる');
}

// ===== 2. 正式な状態異常を作らない =====
section('2. 正式な状態異常を作らない（相手へ debuff を貼らない）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 6000);
  const t = ctx.scene.duelTarget();
  ok(!!t, '決闘対象がいる');
  // 状態異常の入口（冷気 / 凍結 / 発火 / 標的）に 1 つも触れていない。
  for (const k of ['_chill', '_frozenUntil', '_igniteUntil', '_mark', '_iceSeal']) {
    const v = t[k];
    ok(v === 0 || v === null || v === undefined, `対象の ${k} を変更しない（${JSON.stringify(v)}）`);
  }
  ok(t._duelMark === true, 'skill-local マーカーだけが立つ（正式状態ではない）');
  ok(!/statusManager|applyStatus|addStatus/.test(skillSourceDeep(ID, registryMap()) || ''), '実装が状態異常 API を呼ばない');
  // data 側も status を宣言していない。
  ok(!SKILL.status && !SKILL.statusEffect, 'data に status 宣言が無い');
}

// ===== 3. 同時 1 体・重ねがけしない =====
section('3. 決闘対象は常に 1 体（再発動は置換であり重ねがけしない）');
{
  ok(DUEL.maxTargets === 1, `balance の maxTargets が 1（${DUEL.maxTargets}）`);
  ok(SKILL.config.stack === 'refresh', `data の stack が refresh（${SKILL.config.stack}）`);
  const ctx = build();
  const w = ctx.w;
  const a = ctx.enemies[0], b = ctx.enemies[1];
  w.beginDuelChallenge('x', a, { durationMs: 5000, meleeDamageBonus: 0.2 });
  ok(w.duelSeq === a._seq, '1 体目が対象');
  w.beginDuelChallenge('x', b, { durationMs: 5000, meleeDamageBonus: 0.2 });
  ok(w.duelSeq === b._seq, '再発動で 2 体目へ置換される');
  ok(w.isDuelTarget(a) === false, '1 体目はもう対象ではない');
  // 持続は上限へクランプ（重ねがけで伸びない）。
  w.beginDuelChallenge('x', b, { durationMs: 1e9, meleeDamageBonus: 9 });
  ok(w.duelLeftMs <= DUEL.maxDurationMs + 1e-9, `持続が上限 ${DUEL.maxDurationMs}ms 以下（${w.duelLeftMs}）`);
  ok(w.duelBonus('meleeDamage') <= DUEL.maxMeleeDamageBonus + 1e-9, `Dmg 補正が上限 ${DUEL.maxMeleeDamageBonus} 以下`);
  ok(w.duelBonus('poiseDamage') <= DUEL.maxPoiseDamageBonus + 1e-9, `体勢補正が上限 ${DUEL.maxPoiseDamageBonus} 以下`);
  ok(w.duelBonus('furyGain') <= DUEL.maxFuryGainBonus + 1e-9, `闘気補正が上限 ${DUEL.maxFuryGainBonus} 以下`);
}

// ===== 4. 補正は対象へだけ =====
section('4. 補正は決闘対象へだけ乗る（対象以外へは 1 も乗らない）');
{
  const ctx = build();
  const w = ctx.w;
  const a = ctx.enemies[0], b = ctx.enemies[1];
  w.beginDuelChallenge('x', a, { durationMs: 5000, meleeDamageBonus: 0.3, poiseDamageBonus: 0.4, furyGainBonus: 0.2 });
  const onT = w.meleeDamageMultiplier(a);
  const offT = w.meleeDamageMultiplier(b);
  ok(onT > offT, `対象への Dmg 倍率 ${onT.toFixed(3)} > 対象外 ${offT.toFixed(3)}`);
  ok(Math.abs(onT / offT - 1.3) < 1e-6, `対象への倍率がちょうど +30%（×${(onT / offT).toFixed(3)}）`);
  ok(w.duelPoiseMultiplier(a) > 1 && w.duelPoiseMultiplier(b) === 1, '体勢倍率も対象へだけ乗る');
  // 対象外には getDuelModifiers が 0 を返す。
  const m = w.getDuelModifiers(b);
  ok(m.meleeDamage === 0 && m.poiseDamage === 0 && m.furyGain === 0, '対象外の補正はすべて 0');
}

// ===== 5. 敵オブジェクトを保存しない =====
section('5. 敵オブジェクトを保存しない（安定 runtime id だけ）');
{
  const ctx = build();
  ctx.sm.acquireOrLevel(ID); ctx.sm.setLevel(ID, 8);
  run(ctx, 6000);
  const buffs = ctx.w.serializeTimedBuffs();
  ok(!!buffs.duel, '決闘は timedBuffs へ保存される');
  const json = JSON.stringify(buffs.duel);
  ok(!/"hp"|"maxHp"|"def"|"alive"/.test(json), `敵オブジェクトを含まない（${json.slice(0, 120)}）`);
  ok(typeof buffs.duel.seq === 'number', 'seq（安定 runtime id）だけを持つ');
  const sk = ctx.sm.skills.get(ID);
  const s = sk.serializeState() || {};
  for (const k of ['target', 'enemy', 'seq']) ok(!(k in s), `スキル側も ${k} を保存しない`);
}

// ===== 6. 解除条件 =====
section('6. 死亡 / プール返却 / destroy / reset で必ず解除される');
{
  // 対象の死亡（onEnemyRemoved）。
  const ctx = build();
  const w = ctx.w;
  const a = ctx.enemies[0];
  w.beginDuelChallenge('x', a, { durationMs: 8000, meleeDamageBonus: 0.2 });
  a.alive = false;
  w.onEnemyRemoved(a);
  ok(!w.duelActive, 'onEnemyRemoved で解除される');
  ok(a._duelMark === false, 'マーカーも落ちる');

  // ボスの除去。
  const bctx = build({ enemies: [], boss: makeBoss({ x: 420, y: 300, hp: 1e9 }) });
  bctx.w.beginDuelChallenge('x', bctx.scene.boss, { durationMs: 8000, meleeDamageBonus: 0.2 });
  bctx.w.onBossRemoved();
  ok(!bctx.w.duelActive, 'onBossRemoved で解除される');

  // Scene 終了（destroy）と reset。
  const dctx = build();
  dctx.sm.acquireOrLevel(ID); dctx.sm.setLevel(ID, 8);
  run(dctx, 4000);
  ok(dctx.w.duelActive, '決闘中の状態を作れる');
  dctx.sm.skills.get(ID).destroy();
  ok(!dctx.w.duelActive, 'スキルの destroy で解除される');

  const rctx = build();
  rctx.w.beginDuelChallenge('x', rctx.enemies[0], { durationMs: 8000, meleeDamageBonus: 0.2 });
  rctx.w.destroy();
  ok(!rctx.w.duelActive, 'WarriorCombatSystem.destroy で解除される');
  const w2 = makeWarrior(WarriorCombatSystem, rctx.scene, {});
  w2.beginDuelChallenge('x', rctx.enemies[1], { durationMs: 8000, meleeDamageBonus: 0.2 });
  w2.reset();
  ok(!w2.duelActive && w2.telemetry.duelStarts === 0, 'reset で状態もテレメトリも消える');

  // production の Enemy.reset() もマーカーを戻す。
  const esrc = readSrc('src/entities/Enemy.js');
  ok(esrc.slice(esrc.indexOf('reset(')).includes('_duelMark'), 'Enemy.reset() が _duelMark を戻す');
}

// ===== 7. 時間切れ =====
section('7. 時間切れで解除される（永続ロックにならない）');
{
  const ctx = build();
  const w = ctx.w;
  w.beginDuelChallenge('x', ctx.enemies[0], { durationMs: 1200, meleeDamageBonus: 0.2 });
  for (let i = 0; i < 200; i++) { w.update(16); ctx.scene.advance(16); }
  ok(!w.duelActive, '1.2s の決闘は 3.2s 後には終わっている');
  ok(w.telemetry.duelUptimeMs > 0 && w.telemetry.duelUptimeMs <= 1300, `稼働時間が持続の範囲内（${Math.round(w.telemetry.duelUptimeMs)}ms）`);
  ok(SKILL.levels[7].duration <= DUEL.maxDurationMs, `Lv8 の duration ${SKILL.levels[7].duration} ≤ 上限 ${DUEL.maxDurationMs}`);
}

// ===== 8. 成長 =====
section('8. Lv1 → Lv8 で宣言した成長軸がすべて伸びる');
{
  const a = SKILL.levels[0], b = SKILL.levels[7];
  for (const k of ['duration', 'range', 'meleeDamageBonus', 'poiseDamageBonus', 'furyGainBonus', 'normalTargetHpPriority']) {
    ok(b[k] > a[k], `${k}: ${a[k]} → ${b[k]}`);
  }
  ok(b.cooldown < a.cooldown, `cooldown: ${a.cooldown} → ${b.cooldown}`);
  const lo = build(); lo.sm.acquireOrLevel(ID); run(lo, 16000);
  const hi = build(); hi.sm.acquireOrLevel(ID); hi.sm.setLevel(ID, 8); run(hi, 16000);
  ok(hi.w.telemetry.duelUptimeMs > lo.w.telemetry.duelUptimeMs,
    `Lv8 の決闘時間 ${Math.round(hi.w.telemetry.duelUptimeMs)}ms > Lv1 ${Math.round(lo.w.telemetry.duelUptimeMs)}ms`);
  info(`一騎討ち Lv8: cast${st(hi, ID).casts} 決闘${hi.w.telemetry.duelStarts} 命中${hi.w.telemetry.duelHits}`);
}

T.finish();
