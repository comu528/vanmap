// 戦士 14/17: 品質別上限（M8-B §20・§28）。Node.js 標準機能のみ。
// - M8-B で追加した skillCaps がすべて low ≤ medium ≤ high ≤ ultra・正の値であること
// - 追加した cap がすべて実装から参照されること（未参照 cap の禁止）
// - low 品質でも戦闘ロジック（ダメージ・闘気・コンボ）が止まらないこと
// - 演出上限とダメージ上限が別物であること
// 実行: node tests/warrior-quality-cap.mjs

import { DATA, EXPECTED, makeScene, makeEnemies, makeWarrior, bootRuntime, runner, allSrc, capFor } from './warrior-common.mjs';
import { capTiers } from './cap-shape.mjs';

const T = runner('戦士 品質別上限（M8-B）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const QUALITIES = ['low', 'medium', 'high', 'ultra'];

// M8-B で追加した cap（ダメージ/イベント系と演出系）。
const DAMAGE_CAPS = ['maxMeleeTargetsPerHit', 'maxSpinTicksPerFrame', 'maxChargeHits', 'maxCounterHits', 'maxBladeDanceStrikes', 'maxWarriorSlams'];
const VISUAL_CAPS = ['maxMeleeArcVisuals', 'maxSlashTrails', 'maxSpinVisuals', 'maxDashTrails', 'maxGroundDebris', 'maxWarriorHitSparks', 'maxPoiseIndicators'];
const NEW_CAPS = [...DAMAGE_CAPS, ...VISUAL_CAPS];

// ===== 1. 定義の健全性 =====
section('1. 追加した cap が 4 品質すべてで定義され、単調・正である');
for (const name of NEW_CAPS) {
  const c = DATA.balance.skillCaps[name];
  ok(!!c, `${name}: balance.json に定義がある`);
  if (!c) continue;
  const t4 = capTiers(c);  // M9-A: gameplay / safety は単一値、visual は 4 段階
  for (const q of QUALITIES) {
    ok(Number.isFinite(t4[q]), `${name}.${q} が数値`);
    ok(t4[q] > 0, `${name}.${q} = ${t4[q]} > 0`);
    ok(Number.isInteger(t4[q]), `${name}.${q} が整数`);
  }
  ok(t4.low <= t4.medium && t4.medium <= t4.high && t4.high <= t4.ultra,
    `${name}: low(${t4.low}) ≤ medium(${t4.medium}) ≤ high(${t4.high}) ≤ ultra(${t4.ultra})`);
}

// ===== 2. 未参照 cap の禁止 =====
section('2. 追加した cap がすべて実装から参照される（未参照 cap なし）');
{
  const src = allSrc();
  for (const name of NEW_CAPS) {
    ok(src.includes(`'${name}'`) || src.includes(`"${name}"`), `${name}: 実装から参照されている`);
  }
}

// ===== 3. 既存 cap の非回帰 =====
section('3. 既存（火/氷）の cap 定義を壊していない');
{
  const names = Object.keys(DATA.balance.skillCaps);
  ok(names.length >= 165, `skillCaps 総数 ${names.length}`);
  let bad = 0;
  for (const name of names) {
    const t = capTiers(DATA.balance.skillCaps[name]);
    if (!(t.low <= t.medium && t.medium <= t.high && t.high <= t.ultra)) { bad++; }
  }
  ok(bad === 0, `全 ${names.length} cap が単調（違反 ${bad} 件）`);
  info(`M8-B 追加 ${NEW_CAPS.length} 件 / 全体 ${names.length} 件`);
}

// ===== 4. 品質を下げてもロジックが止まらない =====
section('4. low 品質でもダメージ・闘気・コンボが発生する');
for (const q of QUALITIES) {
  const enemies = makeEnemies(60, { x: 300, y: 300, dy: 0, hp: 1e9 });
  const scene = makeScene({ enemies, quality: q, now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  for (const id of EXPECTED.actives) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  for (let i = 0; i < 400; i++) { sm.update(16, { hasEnemies: true }); w.setHp(100, 100); w.update(16); scene.advance(16); }
  const total = sm.statsList().reduce((n, s) => n + (s.damage || 0), 0);
  ok(total > 0, `${q}: 総ダメージ ${Math.round(total)} > 0`);
  ok(w.telemetry.meleeHits > 0, `${q}: 近接命中が発生する`);
  ok(w.telemetry.furyGained > 0, `${q}: 闘気が溜まる`);
  ok(w.telemetry.comboPeak > 0, `${q}: コンボが立つ`);
  info(`${q}: ダメージ ${Math.round(total)} / 命中 ${w.telemetry.meleeHits} / 闘気 ${w.telemetry.furyGained.toFixed(1)}`);
}

// ===== 5. 対象数の上限が品質で効く =====
section('5. 1 打撃あたりの対象数が maxMeleeTargetsPerHit を超えない');
for (const q of QUALITIES) {
  const cap = capFor('maxMeleeTargetsPerHit', q, 24);
  const enemies = makeEnemies(200, { x: 300, y: 300, dy: 0, hp: 1e9 });
  const scene = makeScene({ enemies, quality: q, now: 10000 });
  const w = makeWarrior(WarriorCombatSystem, scene);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  sm.acquireOrLevel('ground_slam'); sm.setLevel('ground_slam', 8);
  // 1 発動ぶんだけ進める。
  sm.update(16, { hasEnemies: true });
  const st = sm.statsList().find((s) => s.id === 'ground_slam') || {};
  ok((st.hits || 0) <= cap, `${q}: 1 打撃の命中 ${st.hits} ≤ ${cap}`);
  ok(scene._m.suppressed > 0, `${q}: 上限到達が計測される（抑制 ${scene._m.suppressed}）`);
}

// ===== 6. 演出上限とダメージ上限の分離 =====
section('6. 演出上限（visual）はダメージ判定件数へ影響しない');
{
  const src = allSrc();
  // _meleeVisual は演出だけを扱い、dealDamage を呼ばない。
  const start = src.indexOf('_meleeVisual(o, radius, hits)');
  ok(start > 0, 'BattleScene に _meleeVisual がある');
  const body = src.slice(start, start + 1400);
  ok(!/dealDamage/.test(body), '_meleeVisual は dealDamage を呼ばない');
  ok(!/applyPoiseDamage|noteMeleeHit|addFury|addCombo/.test(body), '_meleeVisual は闘気/コンボ/体勢へ触らない');
  for (const name of VISUAL_CAPS) ok(src.includes(name), `${name}: 演出側で参照されている`);
}

// ===== 7. cap の欠落時フォールバック =====
section('7. cap 名が未定義でもフォールバックで動く');
{
  ok(capFor('nonexistent_cap_xyz', 'high', 7) === 7, '未定義 cap はフォールバック値を返す');
  // M9-A: visual cap は品質キーで引くのでフォールバックが効く。
  ok(capFor('maxSlashTrails', 'nonexistent_quality', 5) === 5, 'visual cap は未定義品質でフォールバック値を返す');
  // gameplay cap は単一値なので、どんな品質名でも同じ値を返す（フォールバックへ落ちない）。
  ok(capFor('maxMeleeTargetsPerHit', 'nonexistent_quality', 5) === capFor('maxMeleeTargetsPerHit', 'high', 5),
    'gameplay cap は品質名に依存しない（未定義品質でも high と同じ）');
}

T.finish();
