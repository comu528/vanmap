// 戦士 最終Wave 3/16: 抽選シミュレーション（M8-E §10 / §11）。Node.js 標準機能のみ。
// **独自の抽選器は作らない。** tests/warrior-draft-sim.mjs（production の SkillDraftManager /
// SeededRandom / poolEligibility / SkillCatalog をそのまま使うハーネス）で回す。
//   - active30 すべてが提示・取得される（死にスキルなし）
//   - evolution18 すべてが条件形成・取得される（到達不能な進化なし）
//   - passive4 すべてが取得される
//   - 候補ゼロ / 他ジョブ混入 / 重複 / 枠違反 0 件・条件成立後に候補が 1 つも出ない 0 件
//   - 最頻進化のシェアが 35% 以下・build 多様性が M8-D から大幅悪化していない
//   - 素朴戦略の到達率が M8-C.1 のしきい値を満たす（**しきい値は下げていない**）
// 実行: node tests/warrior-final-draft.mjs（HEAVY=1 で seed 数を増やす）

import { WARRIOR, EXPECTED, runner } from './warrior-common.mjs';
import { aggregate, summarize, seedsOf, SEED_COUNT, STRATEGIES, LEGACY_STRATEGY, simulateRun } from './warrior-draft-sim.mjs';

const T = runner('戦士 最終Wave 抽選シミュレーション（M8-E）');
const { ok, section, info } = T;

const seeds = seedsOf(SEED_COUNT);
const AGG = {};
for (const [slot, levelUps] of [[4, 40], [6, 60], [8, 80]]) {
  AGG[slot] = aggregate({ seeds, slotActive: slot, levelUps, strategies: STRATEGIES });
}

section('1. 他ジョブ混入 / 重複 / 枠違反 / 候補ゼロが 0 件');
for (const [slot, a] of Object.entries(AGG)) {
  ok(a.leakage === 0, `枠${slot}: 他ジョブ混入 0（${a.leakage}）`);
  ok(a.duplicates === 0, `枠${slot}: 候補内の重複 0（${a.duplicates}）`);
  ok(a.slotViolations === 0, `枠${slot}: 枠違反 0（${a.slotViolations}）`);
  ok(a.candidateNone === 0, `枠${slot}: 候補ゼロ 0（${a.candidateNone}）`);
  ok(a.formedButNotOffered === 0, `枠${slot}: 条件成立後に進化候補が 1 つも出ない 0（${a.formedButNotOffered}）`);
  info(`枠${slot}: 候補 3 枠に収まらなかった draft ${a.formedPartiallyOffered}（進化 18 種では正常）`);
}

section('2. active30 すべてが提示され、取得もされる（死にスキルなし）');
for (const id of EXPECTED.actives) {
  const offered = Object.values(AGG).some((a) => (a.offered.get(id) || 0) > 0);
  const taken = Object.values(AGG).some((a) => (a.taken.get(id) || 0) > 0);
  ok(offered, `${id}: 提示される`);
  ok(taken, `${id}: 取得される`);
}
{
  const a = AGG[6];
  const rows = EXPECTED.finalActives.map((id) => `${id}:${Math.round((a.taken.get(id) || 0) / a.runs * 100)}%`);
  info(`枠6 取得率（最終Wave の 5 種）: ${rows.join(' ')}`);
}

section('3. evolution18 すべてが条件形成・取得される（到達不能な進化なし）');
for (const id of EXPECTED.evolutions) {
  const formed = Object.values(AGG).some((a) => (a.evoFormed.get(id) || 0) > 0);
  const taken = Object.values(AGG).some((a) => (a.evoTaken.get(id) || 0) > 0);
  ok(formed, `${id}: 進化条件が形成される`);
  ok(taken, `${id}: 取得される`);
}
for (const [slot, a] of Object.entries(AGG)) {
  const rows = EXPECTED.evolutions.map((id) => `${id}:${a.evoTaken.get(id) || 0}`);
  info(`枠${slot} 進化取得数: ${rows.join(' ')}`);
}

section('4. 最頻進化のシェアが 35% 以下・build 多様性が保たれている');
for (const [slot, a] of Object.entries(AGG)) {
  const counts = EXPECTED.evolutions.map((id) => a.evoTaken.get(id) || 0);
  const total = counts.reduce((x, y) => x + y, 0);
  const share = total > 0 ? Math.max(...counts) / total * 100 : 0;
  ok(share <= 35, `枠${slot}: 最頻進化のシェア ${share.toFixed(1)}% ≤ 35%`);
  const kinds = new Set(a.perRun.map((r) => Object.keys(r.owned.active).sort().join(','))).size;
  const ratio = kinds / a.runs * 100;
  // M8-D 実測（枠4 66.5% 前後）から大幅に悪化していないこと。
  ok(ratio > 60, `枠${slot}: build の種類 ${kinds}/${a.runs}（${ratio.toFixed(1)}%）`);
}

section('5. 既存 25 active が最終Wave 追加でハズレになっていない');
{
  const a = AGG[6];
  for (const id of [...EXPECTED.baseActives, ...EXPECTED.wave1Actives, ...EXPECTED.wave2Actives]) {
    const rate = (a.taken.get(id) || 0) / a.runs * 100;
    ok(rate > 0, `${id}: 枠6 取得率 ${rate.toFixed(1)}% > 0`);
  }
}

section('6. 素朴戦略の到達率が M8-C.1 のしきい値を満たす（しきい値は下げていない）');
{
  const legacy = (slot, lv) => summarize(seeds.map((s) => simulateRun({ seed: s, slotActive: slot, levelUps: lv, strategy: LEGACY_STRATEGY }).evolutionCount));
  const s4 = legacy(4, 40), s6 = legacy(6, 60), s8 = legacy(8, 80);
  ok(s4.atLeast1 >= 80, `枠4/40lv: 進化 1 個以上 ${s4.atLeast1.toFixed(1)}% ≥ 80%`);
  ok(s4.mean >= 1.0, `枠4/40lv: 平均 ${s4.mean.toFixed(2)} ≥ 1.0`);
  ok(s4.zero <= 20, `枠4/40lv: 進化 0 個 ${s4.zero.toFixed(1)}% ≤ 20%`);
  ok(s6.atLeast1 >= 95, `枠6/60lv: 1 個以上 ${s6.atLeast1.toFixed(1)}% ≥ 95%`);
  ok(s6.atLeast2 >= 60, `枠6/60lv: 2 個以上 ${s6.atLeast2.toFixed(1)}% ≥ 60%`);
  ok(s6.mean >= 1.7, `枠6/60lv: 平均 ${s6.mean.toFixed(2)} ≥ 1.7`);
  ok(s8.atLeast1 >= 95, `枠8/80lv: 1 個以上 ${s8.atLeast1.toFixed(1)}% ≥ 95%`);
  ok(s8.atLeast2 >= 65, `枠8/80lv: 2 個以上 ${s8.atLeast2.toFixed(1)}% ≥ 65%`);
  ok(s8.mean >= 1.8, `枠8/80lv: 平均 ${s8.mean.toFixed(2)} ≥ 1.8`);
  info(`素朴戦略: 枠4 ${s4.atLeast1.toFixed(1)}%/${s4.mean.toFixed(2)} 枠6 ${s6.atLeast1.toFixed(1)}%/${s6.mean.toFixed(2)} 枠8 ${s8.atLeast1.toFixed(1)}%/${s8.mean.toFixed(2)}`);
}

section('7. passive4 も引き続き取得される');
{
  const a = AGG[6];
  for (const id of WARRIOR.passiveSkillPool) ok((a.taken.get(id) || 0) > 0, `${id}: 取得される（${a.taken.get(id) || 0}）`);
}

section('8. 補助 active を使う進化を個別に集計する');
{
  const AUX = ['heaven_crushing_descent', 'mountain_hurl', 'heaven_mirror_reversal'];
  for (const [slot, a] of Object.entries(AGG)) {
    for (const id of AUX) ok((a.evoTaken.get(id) || 0) > 0, `枠${slot}: ${id}（active 補助）が取得される（${a.evoTaken.get(id) || 0}）`);
    info(`枠${slot} active 補助進化: ${AUX.map((id) => `${id}:${a.evoTaken.get(id) || 0}`).join(' ')}`);
  }
}

T.finish();
