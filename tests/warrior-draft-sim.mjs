// 戦士 ドラフト simulation の共通ハーネス（M8-C.1）。Node.js 標準機能のみ。
// **独自抽選器は作らない。** production の実装だけを使う:
//   - SkillDraftManager（open / reroll / banish / skip・pity・synergy・weight）
//   - SeededRandom（SkillDraftManager の内部で使用）
//   - poolEligibility.memberAllowedForJob（SkillDraftManager の内部で使用）
//   - SkillCatalog.buildCatalog / evolutionRecipes / evolutionPartnerIds（synergy.partnerIds の生成）
//   - data/skill-config.json の rarityWeights / synergy
//   - data/skill-evolutions.json の進化条件
// Math.random は 1 度も使わない（run ごとの分岐はすべて seed 由来）。
//
// BattleScene.buildDraftCtx() と同じ形のコンテキストを組み、BattleScene.applyCandidate() と
// 同じ順序で所持状態を更新する（進化は基礎 active を置換し、枠を増やさない）。

import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { SeededRandom } from '../src/systems/SeededRandom.js';
import { buildCatalog, evolutionRecipes, evolutionPartnerIds } from '../src/systems/SkillCatalog.js';
import { DATA, WARRIOR, draftCatalog, jobPools } from './warrior-common.mjs';

export const CATALOG = draftCatalog();
export const JOB = jobPools('warrior');
export const SKILL_CONFIG = DATA.skillConfig;

// 進化レシピ（production と同じ SkillCatalog 経由）。
const fullCatalog = buildCatalog({
  skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs,
  jobId: 'warrior', registeredIds: [], runtimeStateIds: [],
});
export const RECIPES = evolutionRecipes(fullCatalog).filter((r) => WARRIOR.evolutionPool.includes(r.evolutionId));

export const ACTIVE_MAX = Object.fromEntries(WARRIOR.activeSkillPool.map((id) => [id, DATA.skills.find((s) => s.id === id).maxLevel || 8]));
export const PASSIVE_MAX = Object.fromEntries(WARRIOR.passiveSkillPool.map((id) => [id, DATA.passives.find((p) => p.id === id).maxLevel || 4]));
export const EVO_BY_ID = Object.fromEntries(DATA.evolutions.map((e) => [e.id, e]));

// 進化に必要な補助（active / passive の両方）。
export const REQS = Object.fromEntries(RECIPES.map((r) => [r.evolutionId, {
  base: r.baseSkillId,
  baseLevel: r.baseMaxLevel,
  aux: [...r.auxActive.map((a) => ({ id: a.skill, level: a.level, kind: 'active' })),
    ...r.auxPassive.map((p) => ({ id: p.skill, level: p.level, kind: 'passive' }))],
}]));

// BattleScene._guidanceRecipes() と同じ形。
export const GUIDANCE_RECIPES = RECIPES.map((r) => ({
  evolutionId: r.evolutionId,
  baseSkillId: r.baseSkillId,
  baseLevel: r.baseMaxLevel,
  requirements: [...r.auxActive, ...r.auxPassive].map((a) => ({ skill: a.skill, level: a.level })),
}));

export const STRATEGIES = ['evolution-first', 'balanced', 'random-valid', 'new-skill-priority', 'one-build-focus'];
// M8-B / M8-C の到達率テストが使っていた素朴な方針（進化があれば取る・無ければ候補列の先頭）。
// 変更前後を同じ物差しで比べるためだけに残す。STRATEGIES には含めない。
export const LEGACY_STRATEGY = 'first-candidate';

const levelOf = (owned, id) => (owned.active[id] || 0) || (owned.passive[id] || 0) || 0;

// production の BattleScene.computeEvolvables() と同じ判定（基礎 Lv 最大 ＋ 補助が必要 Lv）。
export function computeEvolvables(owned, evolved) {
  const out = [];
  for (const [evoId, r] of Object.entries(REQS)) {
    if (evolved.has(evoId)) continue;
    if ((owned.active[r.base] || 0) < r.baseLevel) continue;
    if (r.aux.some((a) => levelOf(owned, a.id) < a.level)) continue;
    out.push({ evolutionId: evoId, baseId: r.base, rarity: 'legendary', order: DATA.skills.find((s) => s.id === r.base)?.displayOrder || 0 });
  }
  return out;
}

// BattleScene.buildDraftCtx() と同じ形。
export function buildCtx(owned, slotMax, battleLevel, evolvables, need = 3) {
  return {
    catalog: CATALOG,
    job: JOB,
    owned,
    slots: {
      active: { used: Object.keys(owned.active).length, max: slotMax.active },
      passive: { used: Object.keys(owned.passive).length, max: slotMax.passive },
    },
    evolvables,
    need,
    unlock: { highestClearedDifficulty: 0 },
    synergy: { partnerIds: evolutionPartnerIds(RECIPES, owned), battleLevel },
    // M8-C.1: 戦士の進化導線補助（production が読む）。ジョブ id と data 由来のレシピを渡すだけで、
    // 補正値そのものは data/skill-config.json の guidance に置く。
    jobId: 'warrior',
    evolutionRecipes: GUIDANCE_RECIPES,
  };
}

// 進化条件のうち「あと何段階足りないか」（少ないほど成立が近い）。
export function evolutionGap(owned, evoId) {
  const r = REQS[evoId];
  let gap = Math.max(0, r.baseLevel - (owned.active[r.base] || 0));
  for (const a of r.aux) gap += Math.max(0, a.level - levelOf(owned, a.id));
  return gap;
}

// 「その候補が進化軸を前へ進めるか」（strategy の判断にのみ使う。production の重みには影響しない）。
function advancesEvolution(owned, c) {
  if (c.kind === 'evolution') return true;
  for (const [evoId, r] of Object.entries(REQS)) {
    if (c.id === r.base && (owned.active[r.base] || 0) < r.baseLevel) return true;
    if (r.aux.some((a) => a.id === c.id && levelOf(owned, a.id) < a.level)) {
      // 補助は基礎を持っているときだけ「進展」とみなす（production の partnerIds と同じ考え方）。
      if ((owned.active[r.base] || 0) >= 1) return true;
    }
  }
  return false;
}

// 5 戦略。いずれも「候補列のなかから 1 つ選ぶ」だけで、抽選そのものには介入しない。
// rng は seed 由来（Math.random 不使用）。
function choose(strategy, cands, owned, rng, focus) {
  const evo = cands.find((c) => c.kind === 'evolution');
  if (strategy === 'first-candidate') return evo || cands[0];
  if (strategy === 'evolution-first') {
    if (evo) return evo;
    const adv = cands.filter((c) => advancesEvolution(owned, c));
    if (adv.length) {
      // 成立に最も近い進化へ効く候補を優先する。
      adv.sort((a, b) => bestGapAfter(owned, a) - bestGapAfter(owned, b));
      return adv[0];
    }
    return cands[0];
  }
  if (strategy === 'balanced') {
    if (evo) return evo;
    // 進化を進める候補を 2/3 の確率で、それ以外は素直に先頭を選ぶ。
    const adv = cands.filter((c) => advancesEvolution(owned, c));
    if (adv.length && rng.next() < 0.667) return adv[rng.int(adv.length)];
    return cands[rng.int(cands.length)];
  }
  if (strategy === 'random-valid') {
    return cands[rng.int(cands.length)];
  }
  if (strategy === 'new-skill-priority') {
    if (evo) return evo;
    const fresh = cands.filter((c) => c.kind === 'new_active' || c.kind === 'new_passive');
    if (fresh.length) return fresh[rng.int(fresh.length)];
    return cands[rng.int(cands.length)];
  }
  // one-build-focus: 最初に決めた 1 本の進化軸だけを追う。
  if (evo) return evo;
  const r = REQS[focus.evoId];
  const wanted = cands.filter((c) => c.id === r.base || r.aux.some((a) => a.id === c.id));
  if (wanted.length) {
    wanted.sort((a, b) => bestGapAfter(owned, a) - bestGapAfter(owned, b));
    return wanted[0];
  }
  const adv = cands.filter((c) => advancesEvolution(owned, c));
  if (adv.length) return adv[rng.int(adv.length)];
  return cands[rng.int(cands.length)];
}

// その候補を取ったあとに残る「最小の進化ギャップ」。
function bestGapAfter(owned, c) {
  const next = { active: { ...owned.active }, passive: { ...owned.passive } };
  if (c.kind === 'evolution') return -1;
  if (c.category === 'passive') next.passive[c.id] = Math.min(PASSIVE_MAX[c.id] || 4, (next.passive[c.id] || 0) + 1);
  else next.active[c.id] = Math.min(ACTIVE_MAX[c.id] || 8, (next.active[c.id] || 0) + 1);
  let best = Infinity;
  for (const evoId of Object.keys(REQS)) best = Math.min(best, evolutionGap(next, evoId));
  return best;
}

// BattleScene.applyCandidate() と同じ手順で guidance pity をリセットする（候補のタグだけを見る）。
function markGuidance(draft, pick) {
  if (!draft.markGuidanceProgress) return;
  const tag = (pick.guidance || []).find((g) => g === 'base' || g === 'support' || g === 'upgrade');
  if (tag) draft.markGuidanceProgress(tag);
}

// 1 周回のシミュレーション。production の SkillDraftManager をそのまま駆動する。
// opts: { seed, slotActive, slotPassive, levelUps, strategy, need, useReroll, useBanish, useSkip }
export function simulateRun(opts) {
  const {
    seed, slotActive = 4, slotPassive = 4, levelUps = 60, strategy = 'balanced',
    need = 3, useReroll = true, useBanish = true, useSkip = true,
  } = opts;

  const draft = new SkillDraftManager({
    rarityWeights: SKILL_CONFIG.rarityWeights,
    synergy: SKILL_CONFIG.synergy,
    guidance: SKILL_CONFIG.guidance,
  });
  draft.reset(seed, {});
  const rng = new SeededRandom(SeededRandom.derive(seed, 777, 13)); // 戦略の分岐用（抽選とは別系統）
  const owned = { active: {}, passive: {} };
  const evolved = new Set();
  const slotMax = { active: slotActive, passive: slotPassive };
  // one-build-focus の対象は seed から決める（特定進化へ寄せない）。
  const focus = { evoId: Object.keys(REQS)[rng.int(Object.keys(REQS).length)] };

  const stats = {
    seed, strategy, slotActive,
    offered: new Map(), taken: new Map(), acquired: new Map(),
    offeredKind: { new_active: 0, up_active: 0, new_passive: 0, up_passive: 0, evolution: 0 },
    takenKind: { new_active: 0, up_active: 0, new_passive: 0, up_passive: 0, evolution: 0 },
    offeredRarity: {}, takenRarity: {},
    firstActive: null, firstEvolutionAt: -1,
    evolvableFormedAt: new Map(),      // evoId -> level-up index（条件成立）
    evolutionOfferedAt: new Map(),     // evoId -> level-up index（候補として提示）
    evolutionTakenAt: new Map(),       // evoId -> level-up index（取得）
    // 条件成立しているのに**進化候補が 1 つも出なかった** draft 数（＝プレイヤーが詰まる状態）。
    // 候補は 3 枠しか無いので、同時に 4 件以上成立していれば一部が出ないのは正常。
    // 「全部は出ない」ほうは formedPartiallyOffered として別に数える。
    formedButNotOffered: 0,
    formedPartiallyOffered: 0,
    activeSlotFullAt: -1, passiveSlotFullAt: -1,
    candidateNone: 0, duplicates: 0, slotViolations: 0, leakage: 0,
    rerolls: 0, banishes: 0, skips: 0,
    pityTriggered: 0, pityMax: 0,
    synergyAssisted: 0, guidanceAssisted: { base: 0, support: 0, upgrade: 0, evolution: 0 },
    levelUpsUsed: 0,
  };
  const allowed = new Set([...JOB.activeSkillPool, ...JOB.passiveSkillPool, ...WARRIOR.evolutionPool]);
  const bump = (map, k) => map.set(k, (map.get(k) || 0) + 1);

  for (let i = 0; i < levelUps; i++) {
    const evolvables = computeEvolvables(owned, evolved);
    for (const e of evolvables) if (!stats.evolvableFormedAt.has(e.evolutionId)) stats.evolvableFormedAt.set(e.evolutionId, i);
    const battleLevel = i + 1;
    const ctx = buildCtx(owned, slotMax, battleLevel, evolvables, need);
    let cands = draft.open(ctx);
    stats.levelUpsUsed += 1;

    // reroll: 進化候補がなく、進化軸を進める候補も 1 つも無いときだけ 1 回だけ使う。
    if (useReroll && draft.rerollsRemaining > 0 && cands.length > 0
      && !cands.some((c) => c.kind === 'evolution') && !cands.some((c) => advancesEvolution(owned, c))) {
      const r = draft.reroll(ctx);
      if (r.ok) { stats.rerolls += 1; cands = r.candidates; }
    }
    // banish: 残り 1 枠のときに、進化軸と無関係な新規 active を 1 度だけ追放する
    //（最後の枠を「伸ばせない active」で埋めてしまうのを避ける、という現実的な使い方）。
    if (useBanish && draft.banishesRemaining > 0 && cands.length > 0
      && Object.keys(owned.active).length === slotMax.active - 1) {
      const junk = cands.find((c) => c.kind === 'new_active' && !advancesEvolution(owned, c));
      if (junk) {
        const b = draft.banish(junk.id, ctx);
        if (b.ok) { stats.banishes += 1; cands = b.candidates; }
      }
    }

    // 検査（候補列そのものの健全性）。
    if (!cands.length) {
      stats.candidateNone += 1;
      if (useSkip && draft.skipsRemaining > 0) { draft.skip(); stats.skips += 1; }
      else draft.forceClear();
      continue;
    }
    const keys = new Set();
    for (const c of cands) {
      const k = `${c.kind}:${c.id}`;
      if (keys.has(k)) stats.duplicates += 1;
      keys.add(k);
      if (!allowed.has(c.id)) stats.leakage += 1;
      if (c.kind === 'new_active' && Object.keys(owned.active).length >= slotMax.active) stats.slotViolations += 1;
      if (c.kind === 'new_passive' && Object.keys(owned.passive).length >= slotMax.passive) stats.slotViolations += 1;
      bump(stats.offered, c.id);
      stats.offeredKind[c.kind] = (stats.offeredKind[c.kind] || 0) + 1;
      stats.offeredRarity[c.rarity] = (stats.offeredRarity[c.rarity] || 0) + 1;
      if ((c.synergyMult || 1) > 1) stats.synergyAssisted += 1;
      if (c.guidance) {
        for (const g of c.guidance) stats.guidanceAssisted[g] = (stats.guidanceAssisted[g] || 0) + 1;
      }
    }
    stats.pityMax = Math.max(stats.pityMax, draft.draftsSinceProgress);
    if (draft.guidancePityActive && draft.guidancePityActive()) stats.pityTriggered += 1;
    let offeredAny = false, missedSome = false;
    for (const e of evolvables) {
      if (cands.some((c) => c.kind === 'evolution' && c.id === e.evolutionId)) {
        offeredAny = true;
        if (!stats.evolutionOfferedAt.has(e.evolutionId)) stats.evolutionOfferedAt.set(e.evolutionId, i);
      } else missedSome = true;
    }
    if (evolvables.length > 0) {
      if (!offeredAny) stats.formedButNotOffered += 1;   // 1 つも出ない＝異常
      else if (missedSome) stats.formedPartiallyOffered += 1; // 候補 3 枠に収まらなかっただけ＝正常
    }

    const pick = choose(strategy, cands, owned, rng, focus);
    bump(stats.taken, pick.id);
    if (pick.kind === 'new_active' || pick.kind === 'new_passive') bump(stats.acquired, pick.id);
    stats.takenKind[pick.kind] = (stats.takenKind[pick.kind] || 0) + 1;
    stats.takenRarity[pick.rarity] = (stats.takenRarity[pick.rarity] || 0) + 1;

    // BattleScene.applyCandidate() と同じ更新。
    if (pick.kind === 'evolution') {
      evolved.add(pick.id);
      delete owned.active[pick.baseId];
      owned.active[pick.id] = 1;
      stats.evolutionTakenAt.set(pick.id, i);
      if (stats.firstEvolutionAt < 0) stats.firstEvolutionAt = i;
      draft.markProgress();
    } else if (pick.category === 'passive') {
      const before = owned.passive[pick.id] || 0;
      owned.passive[pick.id] = Math.min(PASSIVE_MAX[pick.id] || 4, before + 1);
      markGuidance(draft, pick);
    } else {
      if (!stats.firstActive) stats.firstActive = pick.id;
      const before = owned.active[pick.id] || 0;
      owned.active[pick.id] = Math.min(ACTIVE_MAX[pick.id] || 8, before + 1);
      markGuidance(draft, pick);
    }
    if (stats.activeSlotFullAt < 0 && Object.keys(owned.active).length >= slotMax.active) stats.activeSlotFullAt = i;
    if (stats.passiveSlotFullAt < 0 && Object.keys(owned.passive).length >= slotMax.passive) stats.passiveSlotFullAt = i;
    draft.resolvePick();
  }

  stats.owned = { active: { ...owned.active }, passive: { ...owned.passive } };
  stats.evolved = [...evolved];
  stats.evolutionCount = evolved.size;
  stats.pityFinal = draft.draftsSinceProgress;
  return stats;
}

// 複数 seed × 戦略 × 枠の集計。
export function aggregate(opts) {
  const { seeds, slotActive = 4, slotPassive = 4, levelUps = 60, strategies = STRATEGIES } = opts;
  const agg = {
    runs: 0, evolutionCounts: [], offered: new Map(), taken: new Map(), acquired: new Map(),
    offeredRarity: {}, takenRarity: {},
    evoFormed: new Map(), evoOffered: new Map(), evoTaken: new Map(),
    formedButNotOffered: 0, formedPartiallyOffered: 0, candidateNone: 0, duplicates: 0, slotViolations: 0, leakage: 0,
    rerolls: 0, banishes: 0, skips: 0, pityTriggered: 0, synergyAssisted: 0,
    guidanceAssisted: { base: 0, support: 0, upgrade: 0, evolution: 0 },
    firstActive: new Map(), byStrategy: {}, activeSlotFull: 0, passiveSlotFull: 0,
    maxLevels: new Map(), passiveMaxLevels: new Map(),
    perRun: [],
  };
  const bump = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
  for (const strategy of strategies) {
    const sAgg = { runs: 0, evolutionCounts: [] };
    for (const seed of seeds) {
      const r = simulateRun({ seed, slotActive, slotPassive, levelUps, strategy });
      agg.runs += 1; sAgg.runs += 1;
      agg.evolutionCounts.push(r.evolutionCount);
      sAgg.evolutionCounts.push(r.evolutionCount);
      agg.perRun.push({ seed, strategy, evolutionCount: r.evolutionCount, evolved: r.evolved, owned: r.owned });
      for (const [k, v] of r.offered) bump(agg.offered, k, v);
      for (const [k, v] of r.taken) bump(agg.taken, k, v);
      for (const [k, v] of r.acquired) bump(agg.acquired, k, v);
      for (const k of Object.keys(r.offeredRarity)) agg.offeredRarity[k] = (agg.offeredRarity[k] || 0) + r.offeredRarity[k];
      for (const k of Object.keys(r.takenRarity)) agg.takenRarity[k] = (agg.takenRarity[k] || 0) + r.takenRarity[k];
      for (const k of r.evolvableFormedAt.keys()) bump(agg.evoFormed, k);
      for (const k of r.evolutionOfferedAt.keys()) bump(agg.evoOffered, k);
      for (const k of r.evolutionTakenAt.keys()) bump(agg.evoTaken, k);
      agg.formedButNotOffered += r.formedButNotOffered;
      agg.formedPartiallyOffered += r.formedPartiallyOffered;
      agg.candidateNone += r.candidateNone;
      agg.duplicates += r.duplicates;
      agg.slotViolations += r.slotViolations;
      agg.leakage += r.leakage;
      agg.rerolls += r.rerolls; agg.banishes += r.banishes; agg.skips += r.skips;
      agg.pityTriggered += r.pityTriggered; agg.synergyAssisted += r.synergyAssisted;
      for (const k of Object.keys(r.guidanceAssisted)) agg.guidanceAssisted[k] = (agg.guidanceAssisted[k] || 0) + r.guidanceAssisted[k];
      if (r.firstActive) bump(agg.firstActive, r.firstActive);
      if (r.activeSlotFullAt >= 0) agg.activeSlotFull += 1;
      if (r.passiveSlotFullAt >= 0) agg.passiveSlotFull += 1;
      for (const [id, lv] of Object.entries(r.owned.active)) if (lv >= (ACTIVE_MAX[id] || 8)) bump(agg.maxLevels, id);
      for (const [id, lv] of Object.entries(r.owned.passive)) if (lv >= (PASSIVE_MAX[id] || 4)) bump(agg.passiveMaxLevels, id);
    }
    agg.byStrategy[strategy] = summarize(sAgg.evolutionCounts);
  }
  agg.summary = summarize(agg.evolutionCounts);
  return agg;
}

export function summarize(counts) {
  const n = counts.length || 1;
  const at = (k) => counts.filter((c) => c >= k).length / n * 100;
  return {
    runs: counts.length,
    mean: counts.reduce((a, b) => a + b, 0) / n,
    zero: counts.filter((c) => c === 0).length / n * 100,
    atLeast1: at(1), atLeast2: at(2), atLeast3: at(3),
    max: counts.length ? Math.max(...counts) : 0,
  };
}

export function seedsOf(n, from = 1) { const a = []; for (let i = from; i < from + n; i++) a.push(i); return a; }
export const HEAVY = !!Number(process.env.HEAVY);
export const SEED_COUNT = HEAVY ? Math.min(2000, Number(process.env.HEAVY) > 1 ? Number(process.env.HEAVY) : 500) : 200;
