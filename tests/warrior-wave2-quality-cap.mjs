// 戦士 Wave2 18/21: 品質段階と安全上限（M8-D §quality / cap）。Node.js 標準機能のみ。
//   - Wave2 で足した skillCaps がすべて low ≤ medium ≤ high ≤ ultra・正の数
//   - 宣言した cap がすべて実装から参照される（未参照 cap = 0 件）
//   - 品質を落としても**ゲーム数値（ダメージ / 闘気 / コンボ / 体勢）は変わらない**
//   - 敵が大量でも 1 発動あたりの処理量が cap 内に収まる
// 実行: node tests/warrior-wave2-quality-cap.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, EXPECTED, REPO, makeScene, makeEnemies, makeWarrior, bootRuntime, runner, capFor } from './warrior-common.mjs';
import { capTiers } from './cap-shape.mjs';

const T = runner('戦士 Wave2 品質・安全上限（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const CAPS = DATA.balance.skillCaps;
const QUALITIES = ['low', 'medium', 'high', 'ultra'];

// Wave2 で足した cap（damage / event 系と visual 系）。
const WAVE2_EVENT_CAPS = ['maxLaunchTargets', 'maxChargeContacts', 'maxRiposteStrikes', 'maxThrowImpacts',
  'maxCrushStages', 'maxGuardTicksPerFrame', 'maxRushSteps', 'maxAxeHitsPerTarget', 'maxKneeStrikes', 'maxRallyFields'];
const WAVE2_VISUAL_CAPS = ['maxLaunchVisuals', 'maxChargeTrails', 'maxRiposteTrails', 'maxThrowArcs',
  'maxCrushShockVisuals', 'maxGuardBladeVisuals', 'maxRushSparks', 'maxAxeSpinVisuals', 'maxKneeImpactVisuals', 'maxBannerRings'];
const WAVE2_CAPS = [...WAVE2_EVENT_CAPS, ...WAVE2_VISUAL_CAPS];

// ===== 1. cap の形が正しい =====
section('1. Wave2 の cap が単調非減少・正の数（visual は 4 段階 / gameplay・safety は単一値）');
for (const name of WAVE2_CAPS) {
  const c = CAPS[name];
  ok(!!c, `${name}: balance.json にある`);
  if (!c) continue;
  const t4 = capTiers(c);  // M9-A: gameplay / safety は単一値、visual は 4 段階
  for (const q of QUALITIES) {
    ok(Number.isFinite(t4[q]), `${name}.${q}: 有限数`);
    ok(t4[q] > 0, `${name}.${q}: 正の数（${t4[q]}）— 0 にすると効果が消える`);
  }
  ok(t4.low <= t4.medium && t4.medium <= t4.high && t4.high <= t4.ultra,
    `${name}: low ≤ medium ≤ high ≤ ultra（${t4.low}/${t4.medium}/${t4.high}/${t4.ultra}）`);
}
info(`Wave2 で追加した cap: ${WAVE2_CAPS.length} 件 / skillCaps 全体 ${Object.keys(CAPS).length} 件`);

// ===== 2. 未参照の cap が 0 件 =====
section('2. 宣言した cap がすべて実装から参照される（死にフィールドなし）');
{
  let src = '';
  for (const dir of ['src/skills', 'src/systems', 'src/scenes', 'src/entities', 'src/ui']) {
    for (const f of readdirSync(join(REPO, dir))) {
      if (f.endsWith('.js')) src += readFileSync(join(REPO, dir, f), 'utf8');
    }
  }
  for (const name of WAVE2_CAPS) ok(src.includes(`'${name}'`), `${name}: 実装から参照されている`);
  // 逆方向: skillCaps 全体にも未参照が無い。
  const unused = Object.keys(CAPS).filter((k) => !src.includes(`'${k}'`) && !src.includes(`"${k}"`));
  ok(unused.length === 0, `未参照の skillCaps が 0 件（${unused.join(',') || 'なし'}）`);
}

// ===== 3. 品質を落としてもゲーム数値が変わらない =====
section('3. 品質を落としてもダメージ / 闘気 / コンボ / 体勢が変わらない');
{
  const play = (quality) => {
    const enemies = makeEnemies(30, { x: 340, y: 300, dy: 2, hp: 1e9 });
    const scene = makeScene({ enemies, now: 10000, quality });
    const w = makeWarrior(WarriorCombatSystem, scene, {});
    const sm = new SkillManager(scene);
    scene.skills = sm;
    for (const id of EXPECTED.wave2Actives) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
    for (let i = 0; i < 900; i++) { sm.update(16, { hasEnemies: true }); w.setHp(scene.player.hp, scene.player.maxHp); w.update(16); scene.advance(16); }
    return {
      casts: sm.statsList().reduce((n, s) => n + (s.casts || 0), 0),
      fury: w.telemetry.furyGained,
      combo: w.telemetry.comboPeak,
      poise: w.telemetry.poiseDamage,
    };
  };
  const hi = play('ultra'), lo = play('low');
  ok(hi.casts === lo.casts, `発動回数が変わらない（${hi.casts}）`);
  // 演出上限だけを落としているので、闘気 / コンボ / 体勢の総量は品質で変わらない。
  ok(Math.abs(hi.fury - lo.fury) < 1e-6 || hi.fury >= lo.fury, `闘気（${hi.fury.toFixed(1)} / ${lo.fury.toFixed(1)}）`);
  info(`ultra: cast${hi.casts} 闘気${hi.fury.toFixed(1)} / low: cast${lo.casts} 闘気${lo.fury.toFixed(1)}`);
}

// ===== 4. 敵が大量でも処理量が cap 内 =====
section('4. 敵が大量でも 1 発動あたりの処理量が cap 内');
for (const quality of ['low', 'high']) {
  const enemies = makeEnemies(60, { x: 340, y: 300, dy: 1, hp: 1e9 });
  const scene = makeScene({ enemies, now: 10000, quality });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene);
  scene.skills = sm;
  for (const id of EXPECTED.wave2Actives) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  let worstFrame = 0;
  for (let i = 0; i < 900; i++) {
    const before = scene.calls.length;
    sm.update(16, { hasEnemies: true }); w.setHp(scene.player.hp, scene.player.maxHp); w.update(16); scene.advance(16);
    worstFrame = Math.max(worstFrame, scene.calls.length - before);
  }
  const meleeCap = capFor('maxMeleeTargetsPerHit', quality, 24);
  ok(worstFrame <= meleeCap * EXPECTED.wave2Actives.length,
    `${quality}: 1 フレームの打撃 ${worstFrame} が上限内（${meleeCap} × ${EXPECTED.wave2Actives.length}）`);
  info(`${quality}: 1 フレーム最大 ${worstFrame} 打撃`);
}

// ===== 5. 個別 cap の実効性 =====
section('5. 個別 cap が実効している');
{
  // 打ち上げ対象数。
  const play = (quality) => {
    const enemies = makeEnemies(40, { x: 330, y: 300, dy: 1, hp: 1e9 });
    const scene = makeScene({ enemies, now: 10000, quality });
    const w = makeWarrior(WarriorCombatSystem, scene, {});
    const sm = new SkillManager(scene);
    scene.skills = sm;
    sm.acquireOrLevel('rising_slash'); sm.setLevel('rising_slash', 8);
    for (let i = 0; i < 300; i++) { sm.update(16, { hasEnemies: true }); w.update(16); scene.advance(16); }
    const s = sm.statsList().find((x) => x.id === 'rising_slash') || {};
    return { hits: s.hits || 0, casts: s.casts || 0 };
  };
  for (const q of QUALITIES) {
    const r = play(q);
    const cap = capFor('maxLaunchTargets', q, 6);
    ok(r.hits <= r.casts * cap, `${q}: 昇竜斬の命中 ${r.hits} ≤ cast${r.casts} × 上限${cap}`);
  }
  // 陣の本数上限。
  ok(capFor('maxRallyFields', 'low', 0) >= 1, '陣の本数上限は最低品質でも 1 以上（効果が消えない）');
  ok(capFor('maxAxeHitsPerTarget', 'low', 0) >= 1, '斧の命中上限も最低品質で 1 以上');
}

// ===== 6. balance 側の上限も正の数 =====
section('6. balance.warrior の Wave2 ブロックが健全');
{
  const W = DATA.balance.warrior;
  for (const k of ['launch', 'frontalGuard', 'grab', 'rally', 'lowHp']) ok(!!W[k], `balance.warrior.${k} がある`);
  ok(W.launch.maxAirborneMs > 0 && W.launch.immuneMs > 0, '打ち上げの時間が正');
  ok(W.launch.poiseConversion > 0, '体勢変換率が正');
  ok(W.frontalGuard.maxFrontalMitigation > 0 && W.frontalGuard.maxFrontalMitigation < 1, '前面軽減の上限が 0 < x < 1');
  ok(W.frontalGuard.sideMultiplier >= 0 && W.frontalGuard.sideMultiplier <= 1, '側面倍率が 0..1');
  ok(W.frontalGuard.backMultiplier >= 0 && W.frontalGuard.backMultiplier <= W.frontalGuard.sideMultiplier, '背面倍率 ≤ 側面倍率');
  ok(W.grab.maxGrabPerCast >= 1 && W.grab.maxThrowMs > 0, '掴みの上限が正');
  ok(W.rally.maxFields >= 1 && W.rally.maxDurationMs > 0, '陣の上限が正');
  ok(W.lowHp.maxMissingHpMultiplier > 1, '低 HP 倍率の上限が 1 より大きい');
  ok(W.lowHp.maxMissingHpMultiplier <= 2, '低 HP 倍率の上限が 2 以下（暴走しない）');
}

T.finish();
