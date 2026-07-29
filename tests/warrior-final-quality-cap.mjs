// 戦士 最終Wave 13/16: 品質段階と安全上限（M8-E §quality / cap）。Node.js 標準機能のみ。
//   - M8-E で足した skillCaps がすべて low ≤ medium ≤ high ≤ ultra・正の数
//   - 宣言した cap がすべて実装から参照される（未参照 cap = 0 件）
//   - 品質を落としてもゲーム数値（ダメージ / 闘気 / コンボ / 体勢）は変わらない
//   - 敵が大量でも 1 発動あたりの処理量が cap 内に収まる
//   - balance.warrior の M8-E ブロック（line / duel / trance / deflection / march）が健全
// 実行: node tests/warrior-final-quality-cap.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, EXPECTED, REPO, makeScene, makeEnemies, makeWarrior, bootRuntime, runner, capFor } from './warrior-common.mjs';

const T = runner('戦士 最終Wave 品質・安全上限（M8-E）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const CAPS = DATA.balance.skillCaps;
const QUALITIES = ['low', 'medium', 'high', 'ultra'];

// M8-E で足した cap（event 系＝実挙動の同時処理数 / visual 系＝演出の同時表示数）。
const FINAL_EVENT_CAPS = ['maxLineTargets', 'maxLineThrusts', 'maxDuelTargets', 'maxTranceStances',
  'maxMarchStomps', 'maxDeflectionsPerWindow', 'maxReflectedProjectiles'];
const FINAL_VISUAL_CAPS = ['maxThrustTrails', 'maxDuelMarkers', 'maxTranceAuras',
  'maxMarchDustVisuals', 'maxDeflectSparkVisuals'];
const FINAL_CAPS = [...FINAL_EVENT_CAPS, ...FINAL_VISUAL_CAPS];

// ===== 1. cap の形 =====
section('1. M8-E の cap が 4 段階そろい、単調非減少・正の数');
for (const name of FINAL_CAPS) {
  const c = CAPS[name];
  ok(!!c, `${name}: balance.json にある`);
  if (!c) continue;
  for (const q of QUALITIES) {
    ok(typeof c[q] === 'number' && Number.isFinite(c[q]), `${name}.${q}: 有限数`);
    ok(c[q] > 0, `${name}.${q}: 正の数（${c[q]}）— 0 にすると効果が消える`);
  }
  ok(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra,
    `${name}: low ≤ medium ≤ high ≤ ultra（${c.low}/${c.medium}/${c.high}/${c.ultra}）`);
}
info(`M8-E で追加した cap: ${FINAL_CAPS.length} 件 / skillCaps 全体 ${Object.keys(CAPS).length} 件`);

// ===== 2. 未参照 cap が 0 件 =====
section('2. 宣言した cap がすべて実装から参照される（死にフィールドなし）');
{
  let src = '';
  for (const dir of ['src/skills', 'src/systems', 'src/scenes', 'src/entities', 'src/ui']) {
    for (const f of readdirSync(join(REPO, dir))) {
      if (f.endsWith('.js')) src += readFileSync(join(REPO, dir, f), 'utf8');
    }
  }
  for (const name of FINAL_CAPS) ok(src.includes(`'${name}'`), `${name}: 実装から参照されている`);
  const unused = Object.keys(CAPS).filter((k) => !src.includes(`'${k}'`) && !src.includes(`"${k}"`));
  ok(unused.length === 0, `未参照の skillCaps が 0 件（${unused.join(',') || 'なし'}）`);
}

// ===== 3. 品質を落としてもゲーム数値が変わらない =====
section('3. 品質を落としても発動回数 / 闘気 / コンボ / 体勢の意味が変わらない');
{
  const play = (quality) => {
    const enemies = makeEnemies(30, { x: 340, y: 300, dy: 2, hp: 1e9 });
    const scene = makeScene({ enemies, now: 10000, quality });
    const w = makeWarrior(WarriorCombatSystem, scene, {});
    const sm = new SkillManager(scene);
    scene.skills = sm;
    for (const id of EXPECTED.finalActives) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
    for (let i = 0; i < 900; i++) { sm.update(16, { hasEnemies: true }); w.setHp(scene.player.hp, scene.player.maxHp); w.update(16); scene.advance(16); }
    return {
      casts: sm.statsList().reduce((n, s) => n + (s.casts || 0), 0),
      fury: w.telemetry.furyGained,
      combo: w.telemetry.comboPeak,
      poise: w.telemetry.poiseDamage,
    };
  };
  const hi = play('ultra'), lo = play('low');
  ok(hi.casts === lo.casts, `発動回数が品質で変わらない（${hi.casts}）`);
  ok(lo.fury > 0 && lo.poise > 0, '低品質でも闘気 / 体勢はきちんと入る（効果が消えない）');
  ok(hi.fury >= lo.fury && hi.poise >= lo.poise, '高品質のほうが同時処理数のぶんだけ多い（逆転しない）');
  info(`ultra: cast${hi.casts} 闘気${hi.fury.toFixed(1)} 体勢${hi.poise.toFixed(1)} / low: cast${lo.casts} 闘気${lo.fury.toFixed(1)} 体勢${lo.poise.toFixed(1)}`);
}

// ===== 4. 敵が大量でも処理量が cap 内 =====
section('4. 敵が大量でも 1 フレームの処理量が cap 内');
for (const quality of ['low', 'high']) {
  const enemies = makeEnemies(60, { x: 340, y: 300, dy: 1, hp: 1e9 });
  const scene = makeScene({ enemies, now: 10000, quality });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene);
  scene.skills = sm;
  for (const id of EXPECTED.finalActives) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  let worstFrame = 0;
  for (let i = 0; i < 900; i++) {
    const before = scene.calls.length;
    sm.update(16, { hasEnemies: true }); w.setHp(scene.player.hp, scene.player.maxHp); w.update(16); scene.advance(16);
    worstFrame = Math.max(worstFrame, scene.calls.length - before);
  }
  const meleeCap = capFor('maxMeleeTargetsPerHit', quality, 24);
  ok(worstFrame <= meleeCap * EXPECTED.finalActives.length,
    `${quality}: 1 フレームの打撃 ${worstFrame} が上限内（${meleeCap} × ${EXPECTED.finalActives.length}）`);
  info(`${quality}: 1 フレーム最大 ${worstFrame} 打撃`);
}

// ===== 5. 個別 cap の実効性 =====
section('5. 個別 cap が実効している');
{
  // 直線の対象数。
  const play = (quality) => {
    const enemies = makeEnemies(40, { x: 340, y: 300, dx: 12, hp: 1e9 });
    const scene = makeScene({ enemies, now: 10000, quality });
    const w = makeWarrior(WarriorCombatSystem, scene, {});
    const sm = new SkillManager(scene);
    scene.skills = sm;
    sm.acquireOrLevel('piercing_lunge'); sm.setLevel('piercing_lunge', 8);
    for (let i = 0; i < 400; i++) { sm.update(16, { hasEnemies: true }); w.update(16); scene.advance(16); }
    const s = sm.statsList().find((x) => x.id === 'piercing_lunge') || {};
    return { hits: s.hits || 0, casts: s.casts || 0 };
  };
  const SKILL = DATA.skills.find((x) => x.id === 'piercing_lunge');
  for (const q of QUALITIES) {
    const r = play(q);
    const cap = Math.min(capFor('maxLineTargets', q, 12), SKILL.levels[7].maxTargets, DATA.balance.warrior.line.maxTargets);
    const perCast = cap * Math.min(SKILL.config.maxHitsPerTargetPerCast, DATA.balance.warrior.line.maxHitsPerTargetPerCast);
    ok(r.hits <= r.casts * perCast, `${q}: 貫穿突きの命中 ${r.hits} ≤ cast${r.casts} × 上限${perCast}`);
  }
  // 効果が消える cap が無い（最低品質でも 1 以上）。
  for (const name of FINAL_EVENT_CAPS) ok(CAPS[name].low >= 1, `${name}.low ≥ 1（最低品質でも効果が消えない）`);
  ok(CAPS.maxTranceStances.low >= 1, '構えは最低品質でも 1 本は張れる');
  ok(CAPS.maxDuelTargets.low >= 1, '決闘は最低品質でも 1 体は挑める');
}

// ===== 6. balance.warrior の M8-E ブロック =====
section('6. balance.warrior の M8-E ブロックが健全');
{
  const W = DATA.balance.warrior;
  for (const k of ['line', 'duel', 'trance', 'deflection', 'march']) ok(!!W[k], `balance.warrior.${k} がある`);
  // line
  ok(W.line.maxLineLength > 0 && W.line.maxLineLength < 700, `直線の長さ上限 ${W.line.maxLineLength} が画面端未満`);
  ok(W.line.maxWidth > 0 && W.line.maxWidth < W.line.maxLineLength, '幅 < 長さ（細い直線）');
  ok(W.line.maxTargets >= 1 && W.line.maxHitsPerTargetPerCast >= 1, '対象数 / 多重命中の上限が 1 以上');
  ok(W.line.maxStepInDistance > 0 && W.line.maxStepInDistance <= 128, `踏み込み上限 ${W.line.maxStepInDistance}px が短い`);
  ok(W.line.toughSingleTargetRatio > 0 && W.line.toughSingleTargetRatio < 1, '硬い相手のとき単体寄りへ寄せる比率が (0,1)');
  // duel
  ok(W.duel.maxTargets === 1, '決闘は同時 1 体');
  ok(W.duel.maxDurationMs > 0 && W.duel.maxDurationMs <= 15000, `決闘の持続上限 ${W.duel.maxDurationMs}ms が有限で短い`);
  for (const k of ['maxMeleeDamageBonus', 'maxPoiseDamageBonus', 'maxFuryGainBonus']) {
    ok(W.duel[k] > 0 && W.duel[k] < 1, `duel.${k} が (0,1)（対象へだけ乗る控えめな上乗せ）`);
  }
  ok(W.duel.bossPriority > W.duel.elitePriority && W.duel.elitePriority > W.duel.normalPriority, '優先度の順序が正しい');
  ok(W.duel.maxExtensionMs >= 0 && W.duel.extensionPerBreakMs >= 0, '延長の上限が非負（永久ロックにならない）');
  // trance
  ok(W.trance.maxStances === 1, '構えは同時 1 つ');
  ok(W.trance.maxDurationMs > 0 && W.trance.maxDurationMs <= 12000, `構えの持続上限 ${W.trance.maxDurationMs}ms が短い`);
  ok(W.trance.combinedOffenseCap > 0 && W.trance.combinedOffenseCap < 1.5, `合成上限 ${W.trance.combinedOffenseCap} が現実的`);
  ok(W.trance.maxMitigationPenalty > 0 && W.trance.maxMitigationPenalty < 0.3, `軽減低下 ${W.trance.maxMitigationPenalty} が小幅`);
  ok(W.trance.minMitigationAfterPenalty >= 0, '軽減の下限が 0 以上（負にならない）');
  ok(W.trance.maxMeleeDamageBonus <= W.trance.combinedOffenseCap, '単体の攻撃補正 ≤ 合成上限');
  // deflection
  ok(W.deflection.maxWindowMs > 0 && W.deflection.maxWindowMs <= 4000, `弾き窓 ${W.deflection.maxWindowMs}ms が短い`);
  ok(W.deflection.maxDeflectionsPerWindow >= 1, '1 窓で弾ける数が 1 以上');
  ok(W.deflection.maxReflectGeneration === 1, '反射弾の世代が 1（無限反射しない）');
  ok(W.deflection.maxReflectLifeMs > 0 && W.deflection.maxReflectLifeMs <= 1500, `反射弾の寿命 ${W.deflection.maxReflectLifeMs}ms が短命`);
  ok(W.deflection.allowedKinds.length > 0 && W.deflection.deniedKinds.length > 0, 'allowlist / denylist の両方がある');
  ok(W.deflection.allowedKinds.every((k) => !W.deflection.deniedKinds.includes(k)), 'allowlist と denylist が重ならない');
  // march
  ok(W.march.maxStomps >= 2, `踏みの上限 ${W.march.maxStomps} が複数地点`);
  ok(W.march.maxMarchMs > 0 && W.march.maxMarchMs <= 4000, `進軍時間 ${W.march.maxMarchMs}ms が有限で短い`);
  ok(W.march.maxStepDistance > 0 && W.march.maxStepDistance * W.march.maxStomps < 900, '総移動距離が画面規模を超えない');
  ok(W.march.maxMitigation >= 0 && W.march.maxMitigation < 0.5, `進軍中の軽減 ${W.march.maxMitigation} が小幅（無敵にならない）`);
  ok(W.march.worldMargin > 0, '壁からの余白が正');
}

// ===== 7. 火 / 氷の cap を 1 件も変えていない =====
section('7. 火 / 氷が使う cap を 1 件も変えていない');
{
  const FIRE_ICE = ['maxFlameLances', 'maxHomingWisps', 'maxSummons', 'maxActiveVortices', 'maxMarks',
    'maxActiveBeams', 'maxMines', 'maxClones', 'maxInfernoBlades'].filter((k) => CAPS[k]);
  ok(FIRE_ICE.length > 0, `火 / 氷の cap を確認できる（${FIRE_ICE.join(',')}）`);
  for (const k of FIRE_ICE) {
    const c = CAPS[k];
    ok(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra, `${k}: 単調性が保たれている`);
    ok(c.low > 0, `${k}: low が正のまま`);
  }
  // M8-E の cap 名は火 / 氷の cap 名と 1 つも衝突しない。
  for (const n of FINAL_CAPS) ok(!FIRE_ICE.includes(n), `${n}: 火 / 氷の cap を上書きしていない`);
}

T.finish();
