// 戦士 Wave2 3/21: 抽選シミュレーション（M8-D §カタログ / 抽選）。Node.js 標準機能のみ。
// **独自の抽選器は作らない。** tests/warrior-draft-sim.mjs（production の SkillDraftManager /
// SeededRandom / poolEligibility / SkillCatalog をそのまま使うハーネス）で回す。
//   - active25 すべてが提示・取得される（死にスキルなし）
//   - evolution13 すべてが条件形成・取得される（到達不能な進化なし）
//   - 候補ゼロ / 他ジョブ混入 / 重複 / 枠違反が 0 件
//   - 最頻進化のシェアが 35% を超えない（1 択に寄っていない）
//   - Wave1 / 既存の active が Wave2 追加でハズレ化していない
// 実行: node tests/warrior-wave2-draft.mjs（HEAVY=1 で seed 数を増やす）

import { WARRIOR, EXPECTED, runner } from './warrior-common.mjs';
import { aggregate, summarize, seedsOf, SEED_COUNT, STRATEGIES, LEGACY_STRATEGY, simulateRun } from './warrior-draft-sim.mjs';

const T = runner('戦士 Wave2 抽選シミュレーション（M8-D）');
const { ok, section, info } = T;

const seeds = seedsOf(SEED_COUNT);
const AGG = {};
for (const [slot, levelUps] of [[4, 40], [6, 60], [8, 80]]) {
  AGG[slot] = aggregate({ seeds, slotActive: slot, levelUps, strategies: STRATEGIES });
}

// ===== 1. 監査（混入 / 重複 / 枠違反 / 候補ゼロ）=====
section('1. 他ジョブ混入 / 重複 / 枠違反 / 候補ゼロが 0 件');
for (const [slot, a] of Object.entries(AGG)) {
  ok(a.leakage === 0, `枠${slot}: 他ジョブ混入 0（${a.leakage}）`);
  ok(a.duplicates === 0, `枠${slot}: 候補内の重複 0（${a.duplicates}）`);
  ok(a.slotViolations === 0, `枠${slot}: 枠違反 0（${a.slotViolations}）`);
  ok(a.candidateNone === 0, `枠${slot}: 候補ゼロ 0（${a.candidateNone}）`);
  ok(a.formedButNotOffered === 0, `枠${slot}: 条件成立後の未提示 0（${a.formedButNotOffered}）`);
}

// ===== 2. active25 すべてが提示・取得される =====
section('2. active25 すべてが提示され、取得もされる（死にスキルなし）');
for (const id of EXPECTED.actives) {
  const offered = Object.values(AGG).some((a) => (a.offered.get(id) || 0) > 0);
  const taken = Object.values(AGG).some((a) => (a.taken.get(id) || 0) > 0);
  ok(offered, `${id}: 提示される`);
  ok(taken, `${id}: 取得される`);
}
{
  const a = AGG[6];
  const rows = EXPECTED.wave2Actives.map((id) => `${id}:${Math.round((a.taken.get(id) || 0) / a.runs * 100)}%`);
  info(`枠6 取得率（Wave2 の 10 種）: ${rows.join(' ')}`);
}

// ===== 3. evolution13 すべてが条件形成・取得される =====
section('3. evolution13 すべてが条件形成・取得される（到達不能な進化なし）');
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

// ===== 4. 集中していない（build 多様性）=====
section('4. 最頻進化のシェアが 35% を超えない');
for (const [slot, a] of Object.entries(AGG)) {
  const counts = EXPECTED.evolutions.map((id) => a.evoTaken.get(id) || 0);
  const total = counts.reduce((x, y) => x + y, 0);
  const share = total > 0 ? Math.max(...counts) / total * 100 : 0;
  ok(share <= 35, `枠${slot}: 最頻進化のシェア ${share.toFixed(1)}% ≤ 35%`);
  // build の多様性は「所持 active の組み合わせ」で測る（warrior-build-diversity.mjs と同じ物差し）。
  const kinds = new Set(a.perRun.map((r) => Object.keys(r.owned.active).sort().join(','))).size;
  ok(kinds > a.runs * 0.3, `枠${slot}: build の種類 ${kinds}/${a.runs}（1 通りに固定されていない）`);
}

// ===== 5. 既存 / Wave1 の active がハズレ化していない =====
section('5. 既存 5 / Wave1 10 の active が Wave2 追加でハズレになっていない');
{
  const a = AGG[6];
  for (const id of [...EXPECTED.baseActives, ...EXPECTED.wave1Actives]) {
    const rate = (a.taken.get(id) || 0) / a.runs * 100;
    ok(rate > 0, `${id}: 枠6 取得率 ${rate.toFixed(1)}% > 0`);
  }
}

// ===== 6. 素朴戦略でも進化に届く（M8-C.1 のしきい値をそのまま使う）=====
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

// ===== 7. passive4 も取られる =====
section('7. passive4 も引き続き取得される');
{
  const a = AGG[6];
  for (const id of WARRIOR.passiveSkillPool) ok((a.taken.get(id) || 0) > 0, `${id}: 取得される（${a.taken.get(id) || 0}）`);
}

T.finish();
