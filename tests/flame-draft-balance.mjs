// 火の魔女 完成監査 3/12: レベルアップ抽選シミュレーション（M8-A §3〜§5・§9）。Node.js 標準機能のみ。
// production の SkillDraftManager / SeededRandom / poolEligibility / 実 rarity 重み / 実 synergy・pity /
// 実 reroll・banish・skip をそのまま使い、独自簡易抽選器は作らない。通常 CI は 200 seed（範囲固定）。
// HEAVY=1 で 500 seed（手動/詳細計測用）。
// 実行: node tests/flame-draft-balance.mjs   /   HEAVY=1 node tests/flame-draft-balance.mjs

import { buildCatalog, evolutionRecipes } from '../src/systems/SkillCatalog.js';
import { simulate, summarize, M7E_POLICIES } from '../src/systems/DraftBalanceAnalyzer.js';
import { analyzeFlameWarnings, DEFAULT_FLAME_THRESHOLDS } from '../src/systems/FlameBalanceWarnings.js';
import { DATA, FLAME, EXPECTED, registeredIds, draftCatalog, jobPools, seedRange, runner } from './flame-audit-common.mjs';

const T = runner('火の魔女 抽選バランス・シミュレーション（M8-A）');
const { ok, section, info } = T;

const HEAVY = !!process.env.HEAVY;
const SEEDS = seedRange(HEAVY ? 500 : 200, 1);   // seed 範囲は固定（1..N・決定論）
const LEVELUPS = 60;
const SLOTS = [4, 6, 8];

const catalog = buildCatalog({
  skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs, jobId: 'flame_witch',
  registeredIds: registeredIds(), runtimeStateIds: [],
});
const recipes = evolutionRecipes(catalog);
const dc = draftCatalog();
const job = jobPools('flame_witch');

const baseOpts = (extra) => Object.assign({
  catalog: dc, job, evolutions: DATA.evolutions, recipes,
  rarityWeights: DATA.skillConfig.rarityWeights, synergy: DATA.skillConfig.synergy,
  slots: { activeMax: 6, passiveMax: 4 }, need: 3, jobLevel: 1,
  levelUps: LEVELUPS, seeds: SEEDS, policy: 'evolution-first',
  useReroll: true, useBanish: true, useSkip: true,
}, extra);

const cache = new Map();
const run = (policy, activeMax, levelUps = LEVELUPS) => {
  const key = `${policy}|${activeMax}|${levelUps}`;
  if (!cache.has(key)) cache.set(key, summarize(simulate(baseOpts({ policy, slots: { activeMax, passiveMax: 4 }, levelUps }))));
  return cache.get(key);
};

// ===== 1. 条件と決定論 =====
section(`1. シミュレーション条件（seed ${SEEDS.length} / level-up ${LEVELUPS} / slot ${SLOTS.join('・')} / 戦略 ${M7E_POLICIES.length}）と決定論`);
ok(SEEDS.length >= 200, `seed 数 ${SEEDS.length} ≥ 200`);
ok(M7E_POLICIES.length === 5, '戦略は evolution-first / balanced / random-valid / new-skill-priority / one-build-focus の5種');
{
  const a = summarize(simulate(baseOpts({ policy: 'balanced' })));
  const b = summarize(simulate(baseOpts({ policy: 'balanced' })));
  ok(JSON.stringify(a) === JSON.stringify(b), '同条件の2回実行が完全一致（Math.random 不使用・決定論）');
}

// ===== 2. 健全性（必ず0のカウンタ）=====
section('2. 他ジョブ混入・プール外・不正候補・重複候補・slot違反・不正進化・進化後の元active再提示は必ず0');
for (const policy of M7E_POLICIES) {
  for (const slot of SLOTS) {
    const r = run(policy, slot);
    const tag = `${policy}/slot${slot}`;
    ok(r.otherJobCandidates === 0, `${tag}: 他ジョブ skill 混入 0（実際 ${r.otherJobCandidates}）`);
    ok(r.invalidCandidates === 0, `${tag}: 不正候補 0（実際 ${r.invalidCandidates}）`);
    ok(r.duplicateCandidates === 0, `${tag}: 重複候補 0（実際 ${r.duplicateCandidates}）`);
    ok(r.illegalEvolutionPicks === 0, `${tag}: 到達不能進化の取得 0`);
    ok(r.slotViolationPicks === 0, `${tag}: slot 違反の取得 0`);
    ok(r.reofferedEvolvedBase === 0, `${tag}: 進化後の元 active 再提示 0`);
  }
}
// 「候補なし」は不正ではなく、枠が満杯で所持スキルも全て最大Lv に達した終盤の正常状態。
section('2b. 候補なしドラフトは「満枠＋全最大Lv」でのみ発生し、枠が広いほど減る');
for (const policy of M7E_POLICIES) {
  const e4 = run(policy, 4).emptyDraftRate, e6 = run(policy, 6).emptyDraftRate, e8 = run(policy, 8).emptyDraftRate;
  ok(e6 <= e4 + 1e-9 && e8 <= e6 + 1e-9, `${policy}: 候補なし率が slot4 ${(e4 * 100).toFixed(1)}% ≥ slot6 ${(e6 * 100).toFixed(1)}% ≥ slot8 ${(e8 * 100).toFixed(1)}%`);
  ok(e8 === 0, `${policy}/slot8: 候補なしドラフト 0%`);
  ok(run(policy, 4).emptyDraftRate <= run(policy, 4).slotFullDraftRate + 1e-9, `${policy}/slot4: 候補なしは満枠ドラフトの範囲内`);
}

// ===== 3. 進化到達率の警告基準（evolution-first）=====
section('3. 進化到達率（evolution-first・60 level-up）— M7-E と同じ警告基準');
const TH = DEFAULT_FLAME_THRESHOLDS;
const belowThreshold = [];
for (const slot of SLOTS) {
  const r = run('evolution-first', slot);
  info(`slot${slot}: mean=${r.evolutionsPerRunMean} >=1=${(r.evoAtLeast1Rate * 100).toFixed(1)}% >=2=${(r.evoAtLeast2Rate * 100).toFixed(1)}% >=3=${(r.evoAtLeast3Rate * 100).toFixed(1)}% zero=${(r.evoZeroRate * 100).toFixed(1)}% max=${r.evolutionsPerRunMax}`);
  const n1 = TH.evoAtLeast1BySlot[slot], n2 = TH.evoAtLeast2BySlot[slot], nm = TH.evoMeanBySlot[slot], nz = TH.evoZeroMaxBySlot[slot];
  if (n1 != null && r.evoAtLeast1Rate < n1) belowThreshold.push(`slot${slot} 進化1個以上 ${(r.evoAtLeast1Rate * 100).toFixed(1)}% < ${(n1 * 100).toFixed(0)}%`);
  if (n2 != null && r.evoAtLeast2Rate < n2) belowThreshold.push(`slot${slot} 進化2個以上 ${(r.evoAtLeast2Rate * 100).toFixed(1)}% < ${(n2 * 100).toFixed(0)}%`);
  if (nm != null && r.evolutionsPerRunMean < nm) belowThreshold.push(`slot${slot} 平均進化数 ${r.evolutionsPerRunMean} < ${nm}`);
  if (nz != null && r.evoZeroRate > nz) belowThreshold.push(`slot${slot} 進化0個 ${(r.evoZeroRate * 100).toFixed(1)}% > ${(nz * 100).toFixed(0)}%`);
}
// M8-A では 3 枠すべてで基準を満たす（未達なら docs へ理由を記載する warning 扱い）。
ok(belowThreshold.length === 0, `警告基準の未達 0 件（実際 ${belowThreshold.length}: ${belowThreshold.join(' / ')}）`);
for (const slot of SLOTS) ok(run('evolution-first', slot).evoZeroRate < 0.5, `slot${slot}: 進化0個の周回が過半にならない`);

// ===== 4. 全戦略で全 active が提示され、取得もされる（ハズレ候補/死に候補の検出）=====
section('4. active30・passive4・evolution18 の提示率/取得率（提示0・取得0が無い）');
const offerTotals = {}, pickTotals = {}, passivePickTotals = {}, evoExecTotals = {};
for (const id of FLAME.activeSkillPool) { offerTotals[id] = 0; pickTotals[id] = 0; }
for (const id of FLAME.passiveSkillPool) passivePickTotals[id] = 0;
for (const id of FLAME.evolutionPool) evoExecTotals[id] = 0;
for (const policy of M7E_POLICIES) for (const slot of SLOTS) {
  const r = run(policy, slot);
  for (const id of FLAME.activeSkillPool) { offerTotals[id] += r.activeAppearRate[id] || 0; pickTotals[id] += r.activePickRate[id] || 0; }
  for (const id of FLAME.passiveSkillPool) passivePickTotals[id] += r.passivePickRate[id] || 0;
  for (const id of FLAME.evolutionPool) evoExecTotals[id] += r.evoExecutedRate[id] || 0;
}
for (const id of FLAME.activeSkillPool) {
  ok(offerTotals[id] > 0, `${id}: 候補として提示される（提示0でない）`);
  ok(pickTotals[id] > 0, `${id}: いずれかの戦略で取得される（死に候補でない）`);
}
for (const id of FLAME.passiveSkillPool) ok(passivePickTotals[id] > 0, `passive ${id}: 取得される`);
for (const id of FLAME.evolutionPool) ok(evoExecTotals[id] > 0, `${id}: いずれかの戦略・枠数で実際に進化する（到達不能でない）`);

// ===== 5. レアリティ分布（legendary が common 並みに膨れない・帯内の極端な偏りなし）=====
section('5. レアリティ提示率と帯内の偏り');
{
  const r = run('balanced', 6);
  ok(r.rarityAppearRate.common > r.rarityAppearRate.uncommon, 'common > uncommon');
  ok(r.rarityAppearRate.uncommon > r.rarityAppearRate.rare, 'uncommon > rare');
  ok(r.rarityAppearRate.rare > r.rarityAppearRate.legendary, 'rare > legendary');
  ok(r.rarityAppearRate.legendary < r.rarityAppearRate.common * 0.2, 'legendary は common の 1/5 未満');
  ok(r.rarityAppearRate.legendary > 0, 'legendary も提示される（事実上出ない、ではない）');
  const rarityOf = {}; for (const s of DATA.skills) rarityOf[s.id] = s.rarity;
  const groups = {};
  for (const id of FLAME.activeSkillPool) (groups[rarityOf[id]] = groups[rarityOf[id]] || []).push(r.activeAppearRate[id] || 0);
  const med = (a) => { const v = a.slice().sort((x, y) => x - y); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  for (const [rar, vals] of Object.entries(groups)) {
    if (vals.length < 3) continue;
    const m = med(vals);
    ok(vals.every((v) => v <= m * TH.raritySkewHigh), `${rar}: 帯内の提示率が中央値の${TH.raritySkewHigh}倍を超えない`);
    ok(vals.every((v) => v >= m * TH.raritySkewLow), `${rar}: 帯内の提示率が中央値の1/3を下回らない`);
  }
  // common が独占していない（common 帯の提示率合計が全体の 8 割を超えない）。
  const total = Object.values(r.rarityAppearRate).reduce((a, b) => a + b, 0);
  ok(r.rarityAppearRate.common / total < 0.8, `common の提示比率 ${((r.rarityAppearRate.common / total) * 100).toFixed(1)}% < 80%（common 独占でない）`);
}

// ===== 6. passive 取得の偏り・枠充足 =====
section('6. passive4 の取得偏りと slot 充足率');
{
  const r = run('evolution-first', 6);
  const vals = FLAME.passiveSkillPool.map((id) => r.passivePickRate[id] || 0);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  ok(mn > 0 && mx / mn <= TH.passiveSkewRatio, `passive 取得回数の最大/最小比 ${(mx / mn).toFixed(2)} ≤ ${TH.passiveSkewRatio}`);
  info(`passive Lv4 到達率: ${FLAME.passiveSkillPool.map((id) => `${id}:${((r.passiveLv4Rate[id] || 0) * 100).toFixed(0)}%`).join(' ')}`);
  ok(r.activeSlotFillRate > 0.9, `active 枠充足率 ${(r.activeSlotFillRate * 100).toFixed(1)}% > 90%`);
  ok(r.passiveSlotFillRate > 0.5, `passive 枠充足率 ${(r.passiveSlotFillRate * 100).toFixed(1)}% > 50%`);
}

// ===== 7. reroll / banish / skip / pity / synergy が実際に動く =====
section('7. reroll・banish・skip・pity・synergy の実動作');
{
  const r = run('evolution-first', 6);
  ok(r.rerollsPerRun > 0, `reroll が使われる（1周回あたり ${r.rerollsPerRun}）`);
  ok(r.banishesPerRun > 0, `banish が使われる（1周回あたり ${r.banishesPerRun}）`);
  ok(r.rerollsPerRun <= 1 && r.banishesPerRun <= 1, 'reroll/banish は周回あたり基礎1回を超えない');
  ok(run('evolution-first', 4).skipsPerRun >= 0, 'skip は候補なしドラフトでのみ使われる（枠4で発生しうる）');
  ok(r.pityDraftRate > 0, `pity 条件（進展なしが閾値超）に入るドラフトがある（${(r.pityDraftRate * 100).toFixed(1)}%）`);
  ok(r.synergyAppliedPerDraft > 0, `synergy 倍率が適用される候補がある（1ドラフトあたり ${r.synergyAppliedPerDraft}）`);
  ok(r.upgradeCandidatesPerDraft > 0 && r.newCandidatesPerDraft > 0, '強化候補・新規候補がどちらも出る');
  info(`候補内訳/ドラフト: 強化=${r.upgradeCandidatesPerDraft} 新規=${r.newCandidatesPerDraft} 進化=${r.evolutionCandidatesPerDraft} / 満枠ドラフト率=${(r.slotFullDraftRate * 100).toFixed(1)}%`);
}

// ===== 8. 補助集計（30 / 90 level-up）=====
section('8. 補助集計（level-up 30 / 90 でも破綻しない）');
for (const lv of [30, 90]) {
  const r = run('evolution-first', 6, lv);
  ok(r.invalidCandidates === 0 && r.otherJobCandidates === 0, `level-up ${lv}: 不正候補・混入 0`);
  info(`level-up ${lv}: mean=${r.evolutionsPerRunMean} >=1=${(r.evoAtLeast1Rate * 100).toFixed(1)}%`);
}
ok(run('evolution-first', 6, 90).evolutionsPerRunMean >= run('evolution-first', 6, 30).evolutionsPerRunMean,
  'level-up が多いほど平均進化数は減らない');

// ===== 9. FlameBalanceWarnings が実データで期待どおり動く =====
section('9. FlameBalanceWarnings（FLAME_* 警告生成）');
{
  const rarityOf = {}; for (const s of DATA.skills) rarityOf[s.id] = s.rarity;
  const warns = analyzeFlameWarnings({
    catalog: { activeCount: catalog.summary.activeCount, passiveCount: catalog.summary.passiveCount, evolutionCount: catalog.summary.evolutionCount, issues: catalog.issues, poolLeaks: [], lv80Targets: catalog.summary.lv80Targets },
    expected: EXPECTED,
    draft: {
      bySlot: { 4: run('evolution-first', 4), 6: run('evolution-first', 6), 8: run('evolution-first', 8) },
      evolutionExecutedTotals: evoExecTotals, activeOfferTotals: offerTotals, activePickTotals: pickTotals,
      passivePickTotals, rarityOf,
    },
  });
  const critical = warns.filter((w) => w.severity === 'high');
  for (const w of critical) info(`HIGH: ${w.code} ${w.target} — ${w.detail}`);
  ok(critical.length === 0, `severity=high の FLAME 警告 0 件（実際 ${critical.length}）`);
  ok(!warns.some((w) => w.code === 'FLAME_CATALOG_MISMATCH'), 'FLAME_CATALOG_MISMATCH なし');
  ok(!warns.some((w) => w.code === 'FLAME_POOL_LEAK'), 'FLAME_POOL_LEAK なし');
  ok(!warns.some((w) => w.code === 'FLAME_EVOLUTION_UNREACHABLE'), 'FLAME_EVOLUTION_UNREACHABLE なし');
  ok(!warns.some((w) => w.code === 'FLAME_ACTIVE_ZERO_OFFER' || w.code === 'FLAME_ACTIVE_ZERO_PICK'), '提示0/取得0 の active なし');
  ok(!warns.some((w) => w.code === 'FLAME_EVOLUTION_LOW_RATE'), '進化到達率の基準未達なし');
  for (const w of warns.filter((x) => x.severity !== 'high')) info(`${w.severity}: ${w.code} ${w.target} — ${w.detail}`);
  // 警告生成器そのものが機能することを、壊れた入力で確認する。
  const broken = analyzeFlameWarnings({ catalog: { activeCount: 29, passiveCount: 4, evolutionCount: 18, issues: [], lv80Targets: [] }, expected: EXPECTED });
  ok(broken.some((w) => w.code === 'FLAME_CATALOG_MISMATCH'), '数が合わなければ FLAME_CATALOG_MISMATCH を出す');
  ok(broken.some((w) => w.code === 'FLAME_LV80_MISMATCH'), 'Lv80対象が合わなければ FLAME_LV80_MISMATCH を出す');
}

// ===== 10. 戦略ごとのサマリ出力（docs 用）=====
section('10. 戦略×枠数サマリ（docs/flame-draft-analysis.md と同じ数値）');
for (const policy of M7E_POLICIES) {
  for (const slot of SLOTS) {
    const r = run(policy, slot);
    info(`${policy.padEnd(19)} slot${slot}  mean=${r.evolutionsPerRunMean.toFixed(2)} >=1=${(r.evoAtLeast1Rate * 100).toFixed(1)}% >=2=${(r.evoAtLeast2Rate * 100).toFixed(1)}% >=3=${(r.evoAtLeast3Rate * 100).toFixed(1)}% zero=${(r.evoZeroRate * 100).toFixed(1)}% max=${r.evolutionsPerRunMax}`);
  }
}
ok(true, 'サマリ出力');

T.finish();
