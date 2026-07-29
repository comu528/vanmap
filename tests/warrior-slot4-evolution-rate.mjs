// 戦士 M8-C.1 2/9: slot 別の進化到達率（M8-C.1 §目標・§8）。Node.js 標準機能のみ。
// HEAVY=1 で seed 数を増やせる。
// production の SkillDraftManager をそのまま駆動し、5 戦略＋M8-B/M8-C 互換の素朴戦略で
// active 枠 4 / 6 / 8 の進化到達率が M8-C.1 の目標を満たすことを検証する。
//
// 目標（M8-C で一時的に下げた基準を復元したもの）:
//   slot4: 進化1個以上 80% 以上 / 平均 1.0 以上 / 進化0個 20% 以下
//   slot6: 進化1個以上 95% 以上 / 2個以上 60% 以上 / 平均 1.7 以上
//   slot8: 進化1個以上 95% 以上 / 2個以上 65% 以上 / 平均 1.8 以上
// 実行: node tests/warrior-slot4-evolution-rate.mjs   /   HEAVY=1 node tests/warrior-slot4-evolution-rate.mjs

import { runner, WARRIOR } from './warrior-common.mjs';
import { simulateRun, aggregate, seedsOf, summarize, STRATEGIES, LEGACY_STRATEGY, SEED_COUNT, HEAVY } from './warrior-draft-sim.mjs';

const T = runner('戦士 slot 別 進化到達率（M8-C.1）');
const { ok, section, info } = T;

const SEEDS = seedsOf(SEED_COUNT);
// [枠, レベルアップ回数, ≥1%, ≥2%, 平均, 0%]
const TARGETS = [
  [4, 40, 80, null, 1.0, 20],
  [6, 60, 95, 60, 1.7, null],
  [8, 80, 95, 65, 1.8, null],
];

info(`seed ${SEED_COUNT} 件（HEAVY=${HEAVY ? 'あり' : 'なし'}）`);

// ===== 1. 素朴戦略（M8-B / M8-C と同じ物差し）=====
section('1. 素朴戦略（進化があれば取る・無ければ候補列の先頭）で目標を満たす');
const legacy = {};
for (const [slot, levelUps, min1, min2, minMean, maxZero] of TARGETS) {
  const counts = SEEDS.map((seed) => simulateRun({ seed, slotActive: slot, levelUps, strategy: LEGACY_STRATEGY }).evolutionCount);
  const s = summarize(counts);
  legacy[slot] = s;
  info(`枠${slot} / ${levelUps}回: 平均${s.mean.toFixed(2)} 0:${s.zero.toFixed(1)}% ≥1:${s.atLeast1.toFixed(1)}% ≥2:${s.atLeast2.toFixed(1)}% ≥3:${s.atLeast3.toFixed(1)}% 最大${s.max}`);
  ok(s.atLeast1 >= min1, `枠${slot}: 進化1個以上 ${s.atLeast1.toFixed(1)}% ≥ ${min1}%`);
  ok(s.mean >= minMean, `枠${slot}: 平均進化数 ${s.mean.toFixed(2)} ≥ ${minMean}`);
  if (min2 != null) ok(s.atLeast2 >= min2, `枠${slot}: 進化2個以上 ${s.atLeast2.toFixed(1)}% ≥ ${min2}%`);
  if (maxZero != null) ok(s.zero <= maxZero, `枠${slot}: 進化0個 ${s.zero.toFixed(1)}% ≤ ${maxZero}%`);
}

// ===== 2. 5 戦略の合算でも目標を満たす =====
section('2. 5 戦略（evolution-first / balanced / random-valid / new-skill-priority / one-build-focus）合算でも満たす');
for (const [slot, levelUps, min1, min2, minMean, maxZero] of TARGETS) {
  const a = aggregate({ seeds: SEEDS, slotActive: slot, levelUps });
  const s = a.summary;
  info(`枠${slot} / ${levelUps}回 × 5戦略 (${s.runs} run): 平均${s.mean.toFixed(2)} 0:${s.zero.toFixed(1)}% ≥1:${s.atLeast1.toFixed(1)}% ≥2:${s.atLeast2.toFixed(1)}% ≥3:${s.atLeast3.toFixed(1)}%`);
  ok(s.atLeast1 >= min1, `枠${slot}: 進化1個以上 ${s.atLeast1.toFixed(1)}% ≥ ${min1}%`);
  ok(s.mean >= minMean, `枠${slot}: 平均進化数 ${s.mean.toFixed(2)} ≥ ${minMean}`);
  if (min2 != null) ok(s.atLeast2 >= min2, `枠${slot}: 進化2個以上 ${s.atLeast2.toFixed(1)}% ≥ ${min2}%`);
  if (maxZero != null) ok(s.zero <= maxZero, `枠${slot}: 進化0個 ${s.zero.toFixed(1)}% ≤ ${maxZero}%`);
  for (const st of STRATEGIES) {
    const b = a.byStrategy[st];
    info(`   ${st.padEnd(20)} 平均${b.mean.toFixed(2)} 0:${b.zero.toFixed(1)}% ≥1:${b.atLeast1.toFixed(1)}% ≥2:${b.atLeast2.toFixed(1)}%`);
  }
}

// ===== 3. 標準構成（レベルアップ 60 / 補助 30・90）=====
section('3. レベルアップ 60（標準）と 30 / 90（補助）でも枠 4 が破綻しない');
for (const levelUps of [30, 60, 90]) {
  const a = aggregate({ seeds: SEEDS, slotActive: 4, levelUps });
  const s = a.summary;
  info(`枠4 / ${levelUps}回 × 5戦略: 平均${s.mean.toFixed(2)} 0:${s.zero.toFixed(1)}% ≥1:${s.atLeast1.toFixed(1)}% ≥2:${s.atLeast2.toFixed(1)}%`);
  // レベルアップ 60 以上では目標を確実に上回る。30 回は進化が間に合わない周回が残る（設計どおり）。
  if (levelUps >= 60) {
    ok(s.atLeast1 >= 80, `枠4 / ${levelUps}回: 進化1個以上 ${s.atLeast1.toFixed(1)}% ≥ 80%`);
    ok(s.mean >= 1.0, `枠4 / ${levelUps}回: 平均 ${s.mean.toFixed(2)} ≥ 1.0`);
    ok(s.zero <= 20, `枠4 / ${levelUps}回: 進化0個 ${s.zero.toFixed(1)}% ≤ 20%`);
  } else {
    ok(s.atLeast1 > 0, `枠4 / ${levelUps}回: 進化到達は可能（${s.atLeast1.toFixed(1)}%）`);
  }
}

// ===== 4. 枠が広いほど不利にならない =====
section('4. 枠を広げても到達率が悪化しない（slot6 / slot8 の非悪化）');
{
  const at = (slot, levelUps) => summarize(SEEDS.map((seed) => simulateRun({ seed, slotActive: slot, levelUps, strategy: LEGACY_STRATEGY }).evolutionCount));
  const s4 = at(4, 60), s6 = at(6, 60), s8 = at(8, 60);
  info(`同一 60 回: 枠4 平均${s4.mean.toFixed(2)} / 枠6 ${s6.mean.toFixed(2)} / 枠8 ${s8.mean.toFixed(2)}`);
  ok(s6.atLeast1 >= 90, `枠6 / 60回: 進化1個以上 ${s6.atLeast1.toFixed(1)}% ≥ 90%`);
  ok(s8.atLeast1 >= 90, `枠8 / 60回: 進化1個以上 ${s8.atLeast1.toFixed(1)}% ≥ 90%`);
  ok(legacy[8].mean >= legacy[6].mean, `十分なレベルアップ回数では枠が広いほど平均が高い（枠6 ${legacy[6].mean.toFixed(2)} ≤ 枠8 ${legacy[8].mean.toFixed(2)}）`);
}

// ===== 5. 8 進化すべてが取得され得る =====
section('5. 8 進化すべてが取得され、15 active / 4 passive すべてが提示・取得される');
{
  const takenEvo = new Set(), takenAct = new Set(), takenPas = new Set(), offered = new Set();
  for (const [slot, levelUps] of [[4, 40], [6, 60], [8, 80]]) {
    const a = aggregate({ seeds: SEEDS, slotActive: slot, levelUps });
    for (const k of a.evoTaken.keys()) takenEvo.add(k);
    for (const k of a.offered.keys()) offered.add(k);
    for (const k of a.taken.keys()) { if (WARRIOR.activeSkillPool.includes(k)) takenAct.add(k); if (WARRIOR.passiveSkillPool.includes(k)) takenPas.add(k); }
  }
  for (const id of WARRIOR.evolutionPool) ok(takenEvo.has(id), `${id}: 取得される（取得0なし）`);
  for (const id of WARRIOR.activeSkillPool) { ok(offered.has(id), `${id}: 提示される`); ok(takenAct.has(id), `${id}: 取得される`); }
  for (const id of WARRIOR.passiveSkillPool) { ok(offered.has(id), `${id}: 提示される`); ok(takenPas.has(id), `${id}: 取得される`); }
}

T.finish();
