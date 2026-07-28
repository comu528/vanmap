// DraftBalanceAnalyzer（Milestone 6-F）: 実際の SkillDraftManager を多数の seed で駆動し、
// ドラフト（レベルアップ抽選）のバランス指標を決定論的に集計する純ロジック。
//
// 抽選ロジックは一切再実装しない。SkillDraftManager をそのまま production と同じ構成で使い、
// プレイヤーの選択（policy）だけをここで純関数として与える。Phaser/DOM 非依存で Node からテスト可能。
//
// 決定論: opts と seeds が同じなら metrics は完全一致する。Date.now()/Math.random() は使わない
//（乱数は SeededRandom のみ・policy の random も派生 seed から生成する）。

import { SkillDraftManager } from './SkillDraftManager.js';
import { SeededRandom } from './SeededRandom.js';
import { evolutionPartnerIds } from './SkillCatalog.js';
import { memberAllowedForJob } from './poolEligibility.js';

export const DEFAULT_POLICIES = ['random', 'evolution-first', 'diversity'];

// M7-E（氷術師完成監査）で追加した戦略。抽選そのものは SkillDraftManager が正で、ここは「プレイヤーの選び方」だけ。
//   balanced           : active/passive/強化/進化へ極端に偏らせない（進化は高優先・レアリティも考慮）
//   random-valid       : production 候補から SeededRandom で選ぶ（候補は既に slot/所持を満たす＝常に valid）
//   new-skill-priority : 空き枠のあいだは新規 active 優先 → その後は強化 → 進化があれば最優先
//   one-build-focus    : 最初に選んだ「進化可能な active」1本を Lv8 まで伸ばし、補助を必要Lvへ、進化後に次の軸へ
export const M7E_POLICIES = ['evolution-first', 'balanced', 'random-valid', 'new-skill-priority', 'one-build-focus'];

// ---- policy（純関数・所持状態とレシピから候補 index を選ぶ） ----
// 返り値は candidates の index（0..len-1）。空なら -1。

function firstIdx(cands, pred) {
  for (let i = 0; i < cands.length; i++) if (pred(cands[i])) return i;
  return -1;
}

// evolution-first: 進化 > 進化に近づく強化 > 任意強化 > 進化相手の新規 > 進化元の新規 > 任意新規 active > passive。
function pickEvolutionFirst(cands, st) {
  let i;
  i = firstIdx(cands, (c) => c.kind === 'evolution'); if (i >= 0) return i;
  // 進化へ近づく強化（進化元 base の Lv上げ、または進化補助 partner の Lv上げ）
  i = firstIdx(cands, (c) => (c.kind === 'up_active' || c.kind === 'up_passive') && (st.baseSet.has(c.id) || st.partnerSet.has(c.id))); if (i >= 0) return i;
  // 任意の所持強化（Lv8/進化へ寄せる）
  i = firstIdx(cands, (c) => c.kind === 'up_active'); if (i >= 0) return i;
  // 進化相手の新規取得（active/passive とも）
  i = firstIdx(cands, (c) => (c.kind === 'new_active' || c.kind === 'new_passive') && st.partnerSet.has(c.id)); if (i >= 0) return i;
  // 進化元 base の新規取得（進化ラインを起こす）
  i = firstIdx(cands, (c) => c.kind === 'new_active' && st.baseSet.has(c.id)); if (i >= 0) return i;
  // 任意の新規 active
  i = firstIdx(cands, (c) => c.kind === 'new_active'); if (i >= 0) return i;
  // passive（新規/強化）
  i = firstIdx(cands, (c) => c.kind === 'new_passive' || c.kind === 'up_passive'); if (i >= 0) return i;
  return cands.length ? 0 : -1;
}

// diversity: 未取得の新規 > 所持強化 > 進化。
function pickDiversity(cands, st) {
  let i;
  i = firstIdx(cands, (c) => c.kind === 'new_active' || c.kind === 'new_passive'); if (i >= 0) return i;
  i = firstIdx(cands, (c) => c.kind === 'up_active' || c.kind === 'up_passive'); if (i >= 0) return i;
  i = firstIdx(cands, (c) => c.kind === 'evolution'); if (i >= 0) return i;
  return cands.length ? 0 : -1;
}

// build:<evolutionId>: 特定レシピの完成を狙う。
function pickBuild(cands, st, target) {
  const r = st.recipes.find((x) => x.evolutionId === target);
  if (r) {
    let i;
    i = firstIdx(cands, (c) => c.kind === 'evolution' && c.id === target); if (i >= 0) return i;
    // 進化元 base（新規/強化）を最優先で Lv8 へ
    i = firstIdx(cands, (c) => c.id === r.baseSkillId && (c.kind === 'new_active' || c.kind === 'up_active')); if (i >= 0) return i;
    // 補助スキル（active/passive）を取得/強化
    const auxIds = new Set([...r.auxActive.map((a) => a.skill), ...r.auxPassive.map((a) => a.skill)]);
    i = firstIdx(cands, (c) => auxIds.has(c.id)); if (i >= 0) return i;
  }
  return pickEvolutionFirst(cands, st);
}

function pickRandom(cands, st) {
  if (!cands.length) return -1;
  return st.pickRng.int(cands.length);
}

// balanced（M7-E）: 進化 > 進化に近づく強化 > 「不足している側」を補う > レアリティが高い新規 > 何でも。
// 「不足している側」= 所持 active 数と passive 数の充足率が低い方（極端な偏りを避ける）。
const RARITY_RANK = { legendary: 3, rare: 2, uncommon: 1, common: 0 };
function pickBalanced(cands, st) {
  let i;
  i = firstIdx(cands, (c) => c.kind === 'evolution'); if (i >= 0) return i;
  i = firstIdx(cands, (c) => (c.kind === 'up_active' || c.kind === 'up_passive') && (st.baseSet.has(c.id) || st.partnerSet.has(c.id))); if (i >= 0) return i;
  const aFill = st.slots.activeMax > 0 ? st.ownedActiveCount / st.slots.activeMax : 1;
  const pFill = st.slots.passiveMax > 0 ? st.ownedPassiveCount / st.slots.passiveMax : 1;
  const wantCat = aFill <= pFill ? 'active' : 'passive';
  i = firstIdx(cands, (c) => c.kind === 'new_' + wantCat); if (i >= 0) return i;
  i = firstIdx(cands, (c) => c.kind === 'new_active' || c.kind === 'new_passive'); if (i >= 0) return i;
  // 強化はレアリティの高い順（同率は候補順＝決定論）。
  let best = -1, bestRank = -1;
  for (let k = 0; k < cands.length; k++) {
    const c = cands[k];
    if (c.kind !== 'up_active' && c.kind !== 'up_passive') continue;
    const r = RARITY_RANK[c.rarity] != null ? RARITY_RANK[c.rarity] : 0;
    if (r > bestRank) { bestRank = r; best = k; }
  }
  if (best >= 0) return best;
  return cands.length ? 0 : -1;
}

// new-skill-priority（M7-E）: 進化 > 空き枠がある間は新規 active > 新規 passive > 強化。
function pickNewSkillPriority(cands, st) {
  let i;
  i = firstIdx(cands, (c) => c.kind === 'evolution'); if (i >= 0) return i;
  if (st.ownedActiveCount < st.slots.activeMax) { i = firstIdx(cands, (c) => c.kind === 'new_active'); if (i >= 0) return i; }
  if (st.ownedPassiveCount < st.slots.passiveMax) { i = firstIdx(cands, (c) => c.kind === 'new_passive'); if (i >= 0) return i; }
  i = firstIdx(cands, (c) => c.kind === 'up_active' || c.kind === 'up_passive'); if (i >= 0) return i;
  i = firstIdx(cands, (c) => c.kind === 'new_active' || c.kind === 'new_passive'); if (i >= 0) return i;
  return cands.length ? 0 : -1;
}

// one-build-focus（M7-E）: 進化可能な active を1本決め、その base を Lv8・補助を必要Lvまで最優先。
// 進化が成立して実行できたら次の軸へ移る（focus を捨てる）。focus 未定なら候補中の base/新規から決定論的に決める。
function pickOneBuildFocus(cands, st) {
  let i;
  i = firstIdx(cands, (c) => c.kind === 'evolution'); if (i >= 0) { st.focus = null; return i; } // 進化したら次の軸へ
  if (!st.focus) {
    const cand = cands.find((c) => (c.kind === 'new_active' || c.kind === 'up_active') && st.baseSet.has(c.id));
    if (cand) st.focus = cand.id;
  }
  if (st.focus) {
    const recipe = st.recipes.find((r) => r.baseSkillId === st.focus);
    i = firstIdx(cands, (c) => c.id === st.focus && (c.kind === 'new_active' || c.kind === 'up_active')); if (i >= 0) return i;
    if (recipe) {
      const auxIds = new Set([...recipe.auxActive.map((a) => a.skill), ...recipe.auxPassive.map((a) => a.skill)]);
      i = firstIdx(cands, (c) => auxIds.has(c.id)); if (i >= 0) return i;
    }
  }
  return pickEvolutionFirst(cands, st);
}

function selectIndex(policy, cands, st) {
  if (!cands.length) return -1;
  if (policy === 'random' || policy === 'random-valid') return pickRandom(cands, st);
  if (policy === 'evolution-first') return pickEvolutionFirst(cands, st);
  if (policy === 'diversity') return pickDiversity(cands, st);
  if (policy === 'balanced') return pickBalanced(cands, st);
  if (policy === 'new-skill-priority') return pickNewSkillPriority(cands, st);
  if (policy === 'one-build-focus') return pickOneBuildFocus(cands, st);
  if (policy.startsWith('build:')) return pickBuild(cands, st, policy.slice(6));
  return pickEvolutionFirst(cands, st);
}

// ---- evolvables 再計算（production 意味論と一致） ----
// 進化成立: 進化元 active が maxLevel(8) ＋ 補助（active/passive）各必要Lv ＋ 当該周回で未進化。
function computeEvolvables(recipes, ownedActive, ownedPassive, evolvedSet, catMaxLevel) {
  const out = [];
  for (let idx = 0; idx < recipes.length; idx++) {
    const r = recipes[idx];
    if (evolvedSet.has(r.evolutionId)) continue;
    const baseMax = catMaxLevel[r.baseSkillId] || 8;
    if ((ownedActive[r.baseSkillId] || 0) < baseMax) continue;
    let okAux = true;
    for (const a of r.auxActive) if ((ownedActive[a.skill] || 0) < a.level) { okAux = false; break; }
    if (okAux) for (const p of r.auxPassive) if ((ownedPassive[p.skill] || 0) < p.level) { okAux = false; break; }
    if (!okAux) continue;
    out.push({ evolutionId: r.evolutionId, baseId: r.baseSkillId, rarity: 'legendary', order: idx });
  }
  out.sort((a, b) => (a.order - b.order) || (a.evolutionId < b.evolutionId ? -1 : 1));
  return out;
}

const distinctOwned = (owned) => Object.keys(owned).filter((k) => (owned[k] || 0) > 0).length;

// ---- シミュレーション本体 ----
// opts:
//  { catalog, job, evolutions, recipes, rarityWeights, synergy, slots:{activeMax,passiveMax},
//    need, jobLevel, rarityWeightMult, levelUps, seeds, policy, useReroll, useBanish, useSkip }
export function simulate(opts) {
  const catalog = opts.catalog || [];
  const job = opts.job || { activeSkillPool: [], passiveSkillPool: [] };
  const recipes = opts.recipes || [];
  const need = opts.need || 3;
  const levelUps = opts.levelUps || 24;
  const seeds = opts.seeds || [];
  const policy = opts.policy || 'evolution-first';
  const activeMax = (opts.slots && opts.slots.activeMax) || 4;
  const passiveMax = (opts.slots && opts.slots.passiveMax) || 4;
  const useReroll = !!opts.useReroll;
  const useBanish = !!opts.useBanish;
  const useSkip = !!opts.useSkip;

  // catalog から active/passive の maxLevel・rarity・category を索引化。
  const catMaxLevel = {}; const catCategory = {}; const catRarity = {};
  for (const m of catalog) { catMaxLevel[m.id] = m.maxLevel || 1; catCategory[m.id] = m.category; catRarity[m.id] = m.rarity || 'common'; }
  const baseSet = new Set(recipes.map((r) => r.baseSkillId));

  // 進化元・レシピ別の補助（テスト/指標用）。
  const recipeById = {}; for (const r of recipes) recipeById[r.evolutionId] = r;

  // 集計器。
  const M = {
    policy, slots: { activeMax, passiveMax }, need, levelUps,
    seeds: seeds.length, jobLevel: opts.jobLevel || 1, drafts: 0,
    activeAppear: {}, passiveAppear: {},
    rarityAppear: { common: 0, uncommon: 0, rare: 0, legendary: 0 },
    firstAppearSum: {}, firstAppearCnt: {},
    upgradeDrafts: 0, shortfallDrafts: 0, repeatedDrafts: 0,
    maxReachRuns: {},
    evoFeasibleRuns: {}, evoExecutedRuns: {},
    evoPerRun: [],
    legendaryNeverRuns: 0, auxPartnerNeverRuns: 0,
    activeFullBlockedRuns: 0, passiveFullBlockedRuns: 0,
    partnerNeededDrafts: 0, partnerPresentDrafts: 0,
    // ---- M7-E（氷術師完成監査）で追加した指標 ----
    activePick: {}, passivePick: {},                 // 取得（新規/強化どちらでも1回）回数
    activeMaxRuns: {}, passiveLv4Runs: {},           // active Lv8 到達 run / passive Lv4 到達 run
    rarityPick: { common: 0, uncommon: 0, rare: 0, legendary: 0 },
    rerollsUsed: 0, banishesUsed: 0, skipsUsed: 0,
    pityDrafts: 0, synergyAppliedCandidates: 0,
    emptyDrafts: 0, slotFullDrafts: 0,
    upgradeCandidates: 0, newCandidates: 0, evolutionCandidates: 0,
    duplicateCandidates: 0, invalidCandidates: 0, otherJobCandidates: 0,
    illegalEvolutionPicks: 0, slotViolationPicks: 0, reofferedEvolvedBase: 0,
    activeSlotFillSum: 0, passiveSlotFillSum: 0,
    evoOfferedRuns: {}, evoDetail: {},
    evoPerRunMax: 0,
  };
  for (const r of recipes) {
    M.evoFeasibleRuns[r.evolutionId] = 0; M.evoExecutedRuns[r.evolutionId] = 0; M.evoOfferedRuns[r.evolutionId] = 0;
    M.evoDetail[r.evolutionId] = { baseAcqRuns: 0, baseMaxRuns: 0, supportAcqRuns: 0, supportLvRuns: 0, condRuns: 0, offeredRuns: 0, executedRuns: 0, condNotOfferedRuns: 0 };
  }
  // 適格 id 集合（他ジョブ混入・プール外・不正候補の検出に使う。SkillDraftManager と同じ poolEligibility が正）。
  const eligibleIds = new Set();
  for (const m of catalog) if (memberAllowedForJob(m, job, opts.extraAllowedIds || [])) eligibleIds.add(m.id);
  const evoIdSet = new Set(recipes.map((r) => r.evolutionId));
  const pityThreshold = (opts.synergy && opts.synergy.noProgressDraftThreshold) || Infinity;

  // draft manager は 1 度だけ生成し、seed ごとに reset（production 同様に構成）。
  const draft = new SkillDraftManager({
    rarityWeights: opts.rarityWeights,
    baseRerolls: 1, baseBanishes: 1, baseSkips: 1,
    rarityWeightMult: opts.rarityWeightMult || null,
    synergy: (opts.synergy === undefined) ? null : opts.synergy,
  });

  for (const seed of seeds) {
    draft.reset(seed >>> 0, { rerolls: 1, banishes: 1, skips: 1 });
    const ownedActive = {}; const ownedPassive = {}; const evolvedSet = new Set();
    const pickRng = new SeededRandom(SeededRandom.derive(seed >>> 0, 0x9e3, 777));
    const st = {
      ownedActive, ownedPassive, recipes, partnerSet: new Set(), baseSet, pickRng,
      slots: { activeMax, passiveMax }, ownedActiveCount: 0, ownedPassiveCount: 0, focus: null, // M7-E: balanced / new-skill-priority / one-build-focus 用
    };

    // per-run 集計状態。
    const seenRun = {}; // id -> 初出 levelUp（1-based）
    const candidateIdsRun = new Set();
    const feasibleRun = new Set();
    const executedRun = [];
    const offeredEvoRun = new Set();          // M7-E: この周回で「進化候補として提示された」進化
    let rerollsUsedRun = 0, banishesUsedRun = 0, skipsUsedRun = 0; // M7-E
    let sawLegendary = false;
    let prevKey = null;
    let maxActiveReached = false; let maxPassiveReached = false;

    for (let i = 0; i < levelUps; i++) {
      const partnerSet = evolutionPartnerIds(recipes, { active: ownedActive, passive: ownedPassive });
      st.partnerSet = partnerSet;
      const evolvables = computeEvolvables(recipes, ownedActive, ownedPassive, evolvedSet, catMaxLevel);
      for (const e of evolvables) feasibleRun.add(e.evolutionId);

      const activeUsed = distinctOwned(ownedActive);
      const passiveUsed = distinctOwned(ownedPassive);
      st.ownedActiveCount = activeUsed; st.ownedPassiveCount = passiveUsed; // M7-E: 枠充足を見る戦略へ渡す
      if (activeUsed >= activeMax) maxActiveReached = true;
      if (passiveUsed >= passiveMax) maxPassiveReached = true;
      if (activeUsed >= activeMax && passiveUsed >= passiveMax) M.slotFullDrafts += 1;

      const ctx = {
        catalog, job,
        owned: { active: ownedActive, passive: ownedPassive },
        slots: { active: { used: activeUsed, max: activeMax }, passive: { used: passiveUsed, max: passiveMax } },
        evolvables, need,
        unlock: { highestClearedDifficulty: 0 },
        synergy: { partnerIds: partnerSet, battleLevel: i + 1 },
      };

      let cands = draft.open(ctx);

      // reroll 方針: 進化も進化相手候補も無く、相手が必要なら 1 回だけ振り直す。
      if (useReroll && draft.rerollsRemaining > 0 && partnerSet.size > 0 &&
          !cands.some((c) => c.kind === 'evolution') && !cands.some((c) => partnerSet.has(c.id))) {
        const r = draft.reroll(ctx);
        if (r.ok) { cands = r.candidates; M.rerollsUsed += 1; rerollsUsedRun += 1; }
      }
      // banish 方針: 進化相手が欲しいのに無関係な新規が邪魔なら 1 回だけ追放して再生成を試す。
      if (useBanish && draft.banishesRemaining > 0 && partnerSet.size > 0 &&
          !cands.some((c) => c.kind === 'evolution') && !cands.some((c) => partnerSet.has(c.id))) {
        const victim = cands.find((c) => (c.kind === 'new_active' || c.kind === 'new_passive') && !partnerSet.has(c.id) && !baseSet.has(c.id));
        if (victim) { const b = draft.banish(victim.id, ctx); if (b.ok) { cands = b.candidates; M.banishesUsed += 1; banishesUsedRun += 1; } }
      }

      // ---- 指標: ドラフト単位 ----
      M.drafts += 1;
      if (cands.length < need) M.shortfallDrafts += 1;
      const key = cands.map((c) => c.kind + ':' + c.id).join('|');
      if (prevKey !== null && key === prevKey && cands.length > 0) M.repeatedDrafts += 1;
      prevKey = key;

      let hasUpgrade = false; const raritySeen = new Set(); const idSeen = new Set();
      for (const c of cands) {
        if (c.kind === 'up_active' || c.kind === 'up_passive') hasUpgrade = true;
        if (c.kind === 'evolution') continue; // 進化はレアリティ統計から除外（別機構）
        raritySeen.add(c.rarity);
        if (c.rarity === 'legendary') sawLegendary = true;
        if (!idSeen.has(c.id)) {
          idSeen.add(c.id);
          if (c.category === 'active') M.activeAppear[c.id] = (M.activeAppear[c.id] || 0) + 1;
          else if (c.category === 'passive') M.passiveAppear[c.id] = (M.passiveAppear[c.id] || 0) + 1;
          if (!(c.id in seenRun)) seenRun[c.id] = i + 1;
        }
        candidateIdsRun.add(c.id);
      }
      if (hasUpgrade) M.upgradeDrafts += 1;
      for (const r of raritySeen) M.rarityAppear[r] = (M.rarityAppear[r] || 0) + 1;
      if (partnerSet.size > 0) {
        M.partnerNeededDrafts += 1;
        if (cands.some((c) => c.kind === 'evolution' || partnerSet.has(c.id))) M.partnerPresentDrafts += 1;
      }

      // ---- M7-E: 候補の健全性（不正候補・他ジョブ混入・重複・種別内訳・pity・synergy）----
      if (cands.length === 0) M.emptyDrafts += 1;
      if (draft.draftsSinceProgress > pityThreshold && partnerSet.size > 0) M.pityDrafts += 1;
      const dupSeen = new Set();
      for (const c of cands) {
        const dupKey = c.kind + ':' + c.id;
        if (dupSeen.has(dupKey)) M.duplicateCandidates += 1; else dupSeen.add(dupKey);
        if (c.kind === 'evolution') {
          M.evolutionCandidates += 1;
          if (!evoIdSet.has(c.id)) M.invalidCandidates += 1;
          else { offeredEvoRun.add(c.id); if (evolvedSet.has(c.id)) M.invalidCandidates += 1; } // 進化済みの再提示は不正
          if (evolvedSet.has(c.baseId)) M.reofferedEvolvedBase += 1;
          continue;
        }
        if (c.kind === 'up_active' || c.kind === 'up_passive') M.upgradeCandidates += 1; else M.newCandidates += 1;
        if (!eligibleIds.has(c.id)) { M.invalidCandidates += 1; M.otherJobCandidates += 1; }
        if (c.synergyMult != null && c.synergyMult !== 1) M.synergyAppliedCandidates += 1;
        // 枠違反: 満枠なのに未取得の新規が出ている。
        if (c.kind === 'new_active' && activeUsed >= activeMax) M.invalidCandidates += 1;
        if (c.kind === 'new_passive' && passiveUsed >= passiveMax) M.invalidCandidates += 1;
      }
      // 進化候補として提示された進化は、この時点で成立していること（不正提示の検出）。
      for (const c of cands) if (c.kind === 'evolution' && !feasibleRun.has(c.id)) M.invalidCandidates += 1;

      // ---- policy が 1 つ選ぶ → 所持状態へ反映 ----
      const idx = selectIndex(policy, cands, st);
      if (idx < 0) { if (useSkip && draft.skipsRemaining > 0 && draft.skip()) { M.skipsUsed += 1; skipsUsedRun += 1; } continue; }
      const pick = cands[idx];
      // M7-E: 取得の健全性（不正進化・枠違反を数える。production 候補が正しければ常に0）。
      if (pick.kind === 'evolution' && !feasibleRun.has(pick.id)) M.illegalEvolutionPicks += 1;
      if (pick.kind === 'new_active' && activeUsed >= activeMax) M.slotViolationPicks += 1;
      if (pick.kind === 'new_passive' && passiveUsed >= passiveMax) M.slotViolationPicks += 1;
      if (pick.kind !== 'evolution') {
        const bucket = pick.category === 'passive' ? M.passivePick : M.activePick;
        bucket[pick.id] = (bucket[pick.id] || 0) + 1;
        M.rarityPick[pick.rarity] = (M.rarityPick[pick.rarity] || 0) + 1;
      }
      if (pick.kind === 'evolution') {
        evolvedSet.add(pick.id);
        executedRun.push(pick.id);
        draft.markProgress(); // 進展 → pity リセット（production 同様）
        // 進化元 base は Lv8 のまま所持継続（枠を消費し続ける・置換）。
      } else if (pick.kind === 'new_active') {
        ownedActive[pick.id] = 1;
      } else if (pick.kind === 'up_active') {
        ownedActive[pick.id] = pick.toLevel;
      } else if (pick.kind === 'new_passive') {
        ownedPassive[pick.id] = 1;
      } else if (pick.kind === 'up_passive') {
        ownedPassive[pick.id] = pick.toLevel;
      }
    }

    // ---- 指標: 周回単位 ----
    for (const id in seenRun) { M.firstAppearSum[id] = (M.firstAppearSum[id] || 0) + seenRun[id]; M.firstAppearCnt[id] = (M.firstAppearCnt[id] || 0) + 1; }
    for (const id in ownedActive) if ((ownedActive[id] || 0) >= (catMaxLevel[id] || 8)) M.maxReachRuns[id] = (M.maxReachRuns[id] || 0) + 1;
    for (const id in ownedPassive) if ((ownedPassive[id] || 0) >= (catMaxLevel[id] || 5)) M.maxReachRuns[id] = (M.maxReachRuns[id] || 0) + 1;
    for (const eid of feasibleRun) M.evoFeasibleRuns[eid] += 1;
    for (const eid of executedRun) M.evoExecutedRuns[eid] += 1;
    M.evoPerRun.push(executedRun.length);
    if (!sawLegendary) M.legendaryNeverRuns += 1;

    // aux partner never appeared: 所持 base があるのに、必要な補助が周回中一度も候補に出なかった。
    let auxNever = false;
    for (const r of recipes) {
      if ((ownedActive[r.baseSkillId] || 0) < 1) continue;
      for (const a of r.auxActive) if ((ownedActive[a.skill] || 0) < a.level && !candidateIdsRun.has(a.skill)) auxNever = true;
      for (const p of r.auxPassive) if ((ownedPassive[p.skill] || 0) < p.level && !candidateIdsRun.has(p.skill)) auxNever = true;
    }
    if (auxNever) M.auxPartnerNeverRuns += 1;

    // active/passive 満枠が進化を阻んだ: base 所持なのに aux 未取得で枠が満杯。
    let activeBlocked = false; let passiveBlocked = false;
    if (maxActiveReached) for (const r of recipes) {
      if ((ownedActive[r.baseSkillId] || 0) < 1) continue;
      for (const a of r.auxActive) if ((ownedActive[a.skill] || 0) < a.level && !(a.skill in ownedActive)) activeBlocked = true;
    }
    if (maxPassiveReached) for (const r of recipes) {
      if ((ownedActive[r.baseSkillId] || 0) < 1) continue;
      for (const p of r.auxPassive) if ((ownedPassive[p.skill] || 0) < p.level && !(p.skill in ownedPassive)) passiveBlocked = true;
    }
    if (activeBlocked) M.activeFullBlockedRuns += 1;
    if (passiveBlocked) M.passiveFullBlockedRuns += 1;

    // ---- M7-E: 周回単位の追加指標 ----
    if (executedRun.length > M.evoPerRunMax) M.evoPerRunMax = executedRun.length;
    M.activeSlotFillSum += activeMax > 0 ? Math.min(1, distinctOwned(ownedActive) / activeMax) : 0;
    M.passiveSlotFillSum += passiveMax > 0 ? Math.min(1, distinctOwned(ownedPassive) / passiveMax) : 0;
    for (const id in ownedActive) if ((ownedActive[id] || 0) >= (catMaxLevel[id] || 8)) M.activeMaxRuns[id] = (M.activeMaxRuns[id] || 0) + 1;
    for (const id in ownedPassive) if ((ownedPassive[id] || 0) >= 4) M.passiveLv4Runs[id] = (M.passiveLv4Runs[id] || 0) + 1; // 進化補助の要求Lvは4
    for (const eid of offeredEvoRun) M.evoOfferedRuns[eid] += 1;
    // 進化ごとの内訳（条件形成の各段階・提示・取得）。
    const execSet = new Set(executedRun);
    for (const r of recipes) {
      const d = M.evoDetail[r.evolutionId];
      const baseLv = ownedActive[r.baseSkillId] || 0;
      if (baseLv >= 1) d.baseAcqRuns += 1;
      if (baseLv >= (catMaxLevel[r.baseSkillId] || 8)) d.baseMaxRuns += 1;
      const aux = [...r.auxActive.map((a) => ({ ...a, cat: 'active' })), ...r.auxPassive.map((a) => ({ ...a, cat: 'passive' }))];
      const own = (a) => (a.cat === 'active' ? (ownedActive[a.skill] || 0) : (ownedPassive[a.skill] || 0));
      if (aux.length === 0 || aux.every((a) => own(a) >= 1)) d.supportAcqRuns += 1;
      if (aux.length === 0 || aux.every((a) => own(a) >= a.level)) d.supportLvRuns += 1;
      const cond = feasibleRun.has(r.evolutionId);
      if (cond) d.condRuns += 1;
      if (offeredEvoRun.has(r.evolutionId)) d.offeredRuns += 1;
      if (execSet.has(r.evolutionId)) d.executedRuns += 1;
      if (cond && !offeredEvoRun.has(r.evolutionId)) d.condNotOfferedRuns += 1;
    }
    void rerollsUsedRun; void banishesUsedRun; void skipsUsedRun; // 周回内訳は集計側（M.rerollsUsed 等）を正とする
  }

  return M;
}

// ---- compact な rate へ要約 ----
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const rateMap = (obj, denom) => { const o = {}; for (const k of Object.keys(obj).sort()) o[k] = r5(denom ? obj[k] / denom : 0); return o; };

export function summarize(M) {
  const D = M.drafts || 1; const S = M.seeds || 1;
  const evoPer = M.evoPerRun;
  const mean = evoPer.length ? evoPer.reduce((a, b) => a + b, 0) / evoPer.length : 0;
  const ge1 = evoPer.length ? evoPer.filter((n) => n >= 1).length / evoPer.length : 0;
  const ge2 = evoPer.length ? evoPer.filter((n) => n >= 2).length / evoPer.length : 0;
  const ge3 = evoPer.length ? evoPer.filter((n) => n >= 3).length / evoPer.length : 0;
  const eq0 = evoPer.length ? evoPer.filter((n) => n === 0).length / evoPer.length : 0;

  const firstAppear = {};
  for (const id of Object.keys(M.firstAppearSum).sort()) firstAppear[id] = r5(M.firstAppearSum[id] / M.firstAppearCnt[id]);

  return {
    policy: M.policy, slots: M.slots, need: M.need, levelUps: M.levelUps,
    seeds: M.seeds, drafts: M.drafts, jobLevel: M.jobLevel,
    rarityAppearRate: rateMap(M.rarityAppear, D),
    upgradeAppearRate: r5(M.upgradeDrafts / D),
    shortfallRate: r5(M.shortfallDrafts / D),
    repeatedSetRate: r5(M.repeatedDrafts / D),
    partnerCandidateRate: r5(M.partnerNeededDrafts ? M.partnerPresentDrafts / M.partnerNeededDrafts : 0),
    legendaryNeverRate: r5(M.legendaryNeverRuns / S),
    auxPartnerNeverRate: r5(M.auxPartnerNeverRuns / S),
    activeFullBlockedRate: r5(M.activeFullBlockedRuns / S),
    passiveFullBlockedRate: r5(M.passiveFullBlockedRuns / S),
    evolutionsPerRunMean: r5(mean),
    evoAtLeast1Rate: r5(ge1),
    evoAtLeast2Rate: r5(ge2),
    evoFeasibleRate: rateMap(M.evoFeasibleRuns, S),
    evoExecutedRate: rateMap(M.evoExecutedRuns, S),
    activeAppearRate: rateMap(M.activeAppear, D),
    passiveAppearRate: rateMap(M.passiveAppear, D),
    firstAppearLevel: firstAppear,
    maxReachRate: rateMap(M.maxReachRuns, S),
    // ---- M7-E（氷術師完成監査）で追加した要約 ----
    evoAtLeast3Rate: r5(ge3),
    evoZeroRate: r5(eq0),
    evolutionsPerRunMax: M.evoPerRunMax,
    activePickRate: rateMap(M.activePick, S),          // 1周回あたり何回選ばれたか（>1 は強化を重ねた回数）
    passivePickRate: rateMap(M.passivePick, S),
    activeMaxLevelRate: rateMap(M.activeMaxRuns, S),   // active Lv8 到達 run 率
    passiveLv4Rate: rateMap(M.passiveLv4Runs, S),      // passive Lv4（進化補助の要求Lv）到達 run 率
    rarityPickRate: rateMap(M.rarityPick, S),
    activeSlotFillRate: r5(M.activeSlotFillSum / S),
    passiveSlotFillRate: r5(M.passiveSlotFillSum / S),
    rerollsPerRun: r5(M.rerollsUsed / S),
    banishesPerRun: r5(M.banishesUsed / S),
    skipsPerRun: r5(M.skipsUsed / S),
    pityDraftRate: r5(M.pityDrafts / D),
    synergyAppliedPerDraft: r5(M.synergyAppliedCandidates / D),
    emptyDraftRate: r5(M.emptyDrafts / D),
    slotFullDraftRate: r5(M.slotFullDrafts / D),
    upgradeCandidatesPerDraft: r5(M.upgradeCandidates / D),
    newCandidatesPerDraft: r5(M.newCandidates / D),
    evolutionCandidatesPerDraft: r5(M.evolutionCandidates / D),
    // 以下は必ず 0（不正候補・他ジョブ混入・重複候補・不正進化・枠違反・進化後の元active再提示）。
    duplicateCandidates: M.duplicateCandidates,
    invalidCandidates: M.invalidCandidates,
    otherJobCandidates: M.otherJobCandidates,
    illegalEvolutionPicks: M.illegalEvolutionPicks,
    slotViolationPicks: M.slotViolationPicks,
    reofferedEvolvedBase: M.reofferedEvolvedBase,
    evoOfferedRate: rateMap(M.evoOfferedRuns, S),
    evoDetailRate: evoDetailRates(M.evoDetail, S),
  };
}

// 進化ごとの内訳を率へ（§8「個別進化到達率」）。
function evoDetailRates(detail, S) {
  const out = {};
  for (const id of Object.keys(detail || {}).sort()) {
    const d = detail[id];
    out[id] = {
      baseAcq: r5(d.baseAcqRuns / S), baseMax: r5(d.baseMaxRuns / S),
      supportAcq: r5(d.supportAcqRuns / S), supportLv: r5(d.supportLvRuns / S),
      condition: r5(d.condRuns / S), offered: r5(d.offeredRuns / S), executed: r5(d.executedRuns / S),
      conditionNotOffered: r5(d.condNotOfferedRuns / S),
    };
  }
  return out;
}
