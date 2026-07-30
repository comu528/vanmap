// M9-A: 3 ジョブ横断監査の共通ハーネス（Node.js 標準機能のみ）。
// **独自抽選器・Math.random は使わない。** production の
// SkillManager / SkillDraftManager / SeededRandom / SkillCatalog / poolEligibility /
// WarriorCombatSystem を、各ジョブの既存ハーネス（flame-audit-common / frost-audit-common /
// warrior-common）の Scene モック上でそのまま駆動する。
//
// gameplay trace（M9-A §4）: cast / hit / damage / kill / 対象 / runtimeState / 戦士資源を
// 決定論的に直列化したもの。品質 4 段階で byte-identical であることを検査する。
// visual trace（粒子・trail など）はこのハーネスには存在しない（Scene モックは演出を生成しない）ため、
// visual 側の減少は cap 値と production の visualCap 経路で別途検査する。

import { createHash } from 'node:crypto';
import * as W from './warrior-common.mjs';
import * as FL from './flame-audit-common.mjs';
import * as FR from './frost-audit-common.mjs';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { SeededRandom } from '../src/systems/SeededRandom.js';
import { buildCatalog, evolutionRecipes, evolutionPartnerIds } from '../src/systems/SkillCatalog.js';

export const DATA = W.DATA;
export const JOB_IDS = ['flame_witch', 'frost_mage', 'warrior'];
export const HEAVY = process.env.HEAVY === '1';
export const QUALITIES = ['low', 'medium', 'high', 'ultra'];
export const jobOf = (id) => DATA.jobs.find((j) => j.id === id);
export const poolsOf = (id) => {
  const j = jobOf(id);
  return { active: j.activeSkillPool || [], passive: j.passiveSkillPool || [], evolution: j.evolutionPool || [] };
};
export const { runner, seedRange, registryMap, readSrc, allSrc } = W;

let _rt = null;
export async function bootAll() {
  if (_rt) return _rt;
  _rt = await W.bootRuntime(); // DataManager 単一ロード（3 ジョブぶんの data はすべて同じファイル群）
  return _rt;
}

// ---- gameplay trace ----

// JSON 化できる形へ落とす（関数 / undefined / 非有限数を除去。深い参照は打ち切る）。
function clean(v, d = 0) {
  if (v === null) return null;
  const t = typeof v;
  if (t === 'function' || t === 'undefined' || t === 'symbol') return null;
  if (t === 'number') return Number.isFinite(v) ? v : `#${String(v)}`;
  if (t !== 'object') return v;
  if (d > 3) return '[deep]';
  if (Array.isArray(v)) return v.map((x) => clean(x, d + 1));
  const o = {};
  for (const k of Object.keys(v).sort()) { if (!k.startsWith('_')) o[k] = clean(v[k], d + 1); }
  return o;
}
export const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

// 1 run。ids を Lv 最大で所持し、固定 dt で回して gameplay trace を返す。
// 同 jobId / ids / steps / seed 配置で quality だけを変えたとき、返り値全体が一致しなければならない。
export async function runJob(jobId, { quality = 'high', ids, steps = 900, dt = 32, maxLevel = true } = {}) {
  const { SkillManager, WarriorCombatSystem } = await bootAll();
  let scene, warrior = null;
  if (jobId === 'warrior') {
    const enemies = [...W.makeEnemies(24, { x: 340, y: 300, dx: 8, dy: 3, hp: 1e9 }), ...W.makeEnemies(4, { x: 360, y: 300, hp: 1e9, elite: true })];
    scene = W.makeScene({ enemies, boss: W.makeBoss({ x: 500, y: 300, hp: 1e9 }), now: 10000, quality, enemyBullets: [] });
    warrior = W.makeWarrior(WarriorCombatSystem, scene, {});
  } else if (jobId === 'flame_witch') {
    scene = FL.makeScene({ enemies: FL.makeEnemies(24, { x: 340, y: 300, hp: 1e9 }), now: 10000, quality });
  } else {
    scene = FR.makeScene({ enemies: FR.makeEnemies(24, { x: 340, y: 300, hp: 1e9 }), now: 10000, quality });
  }
  const sm = new SkillManager(scene); scene.skills = sm;
  for (const id of ids) {
    sm.acquireOrLevel(id);
    if (maxLevel) { try { sm.setLevel(id, 8); } catch (e) { void e; } }
  }
  for (let i = 0; i < steps; i++) {
    sm.update(dt, { hasEnemies: true });
    if (warrior) {
      warrior.setHp(scene.player.maxHp * (i % 300 < 150 ? 1 : 0.25), scene.player.maxHp);
      warrior.update(dt);
      if (i % 40 === 20) scene.onWarriorHit(30, 20);
    }
    scene.advance(dt);
  }
  const stats = {};
  for (const id of ids) {
    const s = sm.stats.get(id) || {};
    stats[id] = { casts: s.casts || 0, hits: s.hits || 0, kills: s.kills || 0, damage: Math.round((s.damage || 0) * 1000) / 1000, extra: clean(s.extra || {}) };
  }
  const trace = {
    jobId, ids: [...ids], steps, dt,
    stats,
    runtime: clean(sm.serializeRuntime()),
    calls: { count: scene.calls.length, hash: sha(clean(scene.calls)) },
    warrior: warrior ? clean({ fury: warrior.fury, combo: warrior.combo, summary: warrior.summary() }) : null,
  };
  return { trace, hash: sha(trace), sm, scene, warrior };
}

// ---- 汎用 draft simulation（production の SkillDraftManager を 3 ジョブで駆動） ----

const catalogCache = new Map();
export function jobDraftBundle(jobId) {
  if (catalogCache.has(jobId)) return catalogCache.get(jobId);
  const job = jobOf(jobId);
  const full = buildCatalog({
    skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs,
    jobId, registeredIds: [], runtimeStateIds: [],
  });
  const recipes = evolutionRecipes(full).filter((r) => (job.evolutionPool || []).includes(r.evolutionId));
  const reqs = Object.fromEntries(recipes.map((r) => [r.evolutionId, {
    base: r.baseSkillId, baseLevel: r.baseMaxLevel,
    aux: [...r.auxActive.map((a) => ({ id: a.skill, level: a.level, kind: 'active' })),
      ...r.auxPassive.map((p) => ({ id: p.skill, level: p.level, kind: 'passive' }))],
  }]));
  const guidanceRecipes = recipes.map((r) => ({
    evolutionId: r.evolutionId, baseSkillId: r.baseSkillId, baseLevel: r.baseMaxLevel,
    requirements: [...r.auxActive, ...r.auxPassive].map((a) => ({ skill: a.skill, level: a.level })),
  }));
  const activeMax = Object.fromEntries((job.activeSkillPool || []).map((id) => [id, (DATA.skills.find((s) => s.id === id) || {}).maxLevel || 8]));
  const passiveMax = Object.fromEntries((job.passiveSkillPool || []).map((id) => [id, (DATA.passives.find((p) => p.id === id) || {}).maxLevel || 4]));
  const catalog = W.draftCatalog();
  const pools = { activeSkillPool: job.activeSkillPool || [], passiveSkillPool: job.passiveSkillPool || [] };
  const bundle = { job, catalog, pools, recipes, reqs, guidanceRecipes, activeMax, passiveMax };
  catalogCache.set(jobId, bundle);
  return bundle;
}

const levelOf = (owned, id) => (owned.active[id] || 0) || (owned.passive[id] || 0) || 0;

export function computeEvolvables(bundle, owned, evolved) {
  const out = [];
  for (const [evoId, r] of Object.entries(bundle.reqs)) {
    if (evolved.has(evoId)) continue;
    if ((owned.active[r.base] || 0) < r.baseLevel) continue;
    if (r.aux.some((a) => levelOf(owned, a.id) < a.level)) continue;
    out.push({ evolutionId: evoId, baseId: r.base, rarity: 'legendary', order: (DATA.skills.find((s) => s.id === r.base) || {}).displayOrder || 0 });
  }
  return out;
}

function buildCtx(bundle, jobId, owned, slotMax, battleLevel, evolvables, evolved, need = 3) {
  return {
    catalog: bundle.catalog,
    job: bundle.pools,
    owned,
    slots: {
      active: { used: Object.keys(owned.active).length, max: slotMax.active },
      passive: { used: Object.keys(owned.passive).length, max: slotMax.passive },
    },
    evolvables,
    evolvedBaseIds: [...evolved].map((id) => (bundle.reqs[id] ? bundle.reqs[id].base : id)),
    need,
    unlock: { highestClearedDifficulty: 0 },
    synergy: { partnerIds: evolutionPartnerIds(bundle.recipes, owned), battleLevel },
    jobId,
    evolutionRecipes: bundle.guidanceRecipes,
  };
}

function evolutionGap(bundle, owned, evoId) {
  const r = bundle.reqs[evoId];
  let gap = Math.max(0, r.baseLevel - (owned.active[r.base] || 0));
  for (const a of r.aux) gap += Math.max(0, a.level - levelOf(owned, a.id));
  return gap;
}

function advancesEvolution(bundle, owned, c) {
  if (c.kind === 'evolution') return true;
  for (const [, r] of Object.entries(bundle.reqs)) {
    if (c.id === r.base && (owned.active[r.base] || 0) < r.baseLevel) return true;
    if (r.aux.some((a) => a.id === c.id && levelOf(owned, a.id) < a.level)) {
      if ((owned.active[r.base] || 0) >= 1) return true;
    }
  }
  return false;
}

function bestGapAfter(bundle, owned, c) {
  const next = { active: { ...owned.active }, passive: { ...owned.passive } };
  if (c.kind === 'evolution') return -1;
  if (c.category === 'passive') next.passive[c.id] = Math.min(bundle.passiveMax[c.id] || 4, (next.passive[c.id] || 0) + 1);
  else next.active[c.id] = Math.min(bundle.activeMax[c.id] || 8, (next.active[c.id] || 0) + 1);
  let best = Infinity;
  for (const evoId of Object.keys(bundle.reqs)) best = Math.min(best, evolutionGap(bundle, next, evoId));
  return best;
}

// 1 周回。strategy: 'evolution-first'（進化軸優先）/ 'first-candidate'（素朴）。
export function simDraft(jobId, { seed, slotActive = 4, slotPassive = 4, levelUps = 60, strategy = 'evolution-first', need = 3 } = {}) {
  const bundle = jobDraftBundle(jobId);
  const draft = new SkillDraftManager({
    rarityWeights: DATA.skillConfig.rarityWeights,
    synergy: DATA.skillConfig.synergy,
    guidance: DATA.skillConfig.guidance,
  });
  draft.reset(seed, {});
  const rng = new SeededRandom(SeededRandom.derive(seed, 991, 17));
  const owned = { active: {}, passive: {} };
  const evolved = new Set();
  const allowed = new Set([...bundle.pools.activeSkillPool, ...bundle.pools.passiveSkillPool, ...(bundle.job.evolutionPool || [])]);
  const st = {
    seed, evolutions: 0, leakage: 0, duplicates: 0, slotViolations: 0,
    candidateNone: 0, saturatedNone: 0, unsaturatedNone: 0,
    offered: new Set(), taken: new Set(), candidateSeq: [],
    formedNotOffered: 0,
  };
  for (let i = 0; i < levelUps; i++) {
    const evolvables = computeEvolvables(bundle, owned, evolved);
    const ctx = buildCtx(bundle, jobId, owned, { active: slotActive, passive: slotPassive }, i + 1, evolvables, evolved, need);
    const cands = draft.open(ctx);
    st.candidateSeq.push(cands.map((c) => `${c.kind}:${c.id}`).join(','));
    if (!cands.length) {
      st.candidateNone++;
      const aIds = Object.keys(owned.active), pIds = Object.keys(owned.passive);
      const maxOf = (id) => (evolved.has(id) ? 1 : (bundle.activeMax[id] || 8));
      const aFull = aIds.length >= slotActive && aIds.every((id) => (owned.active[id] || 0) >= maxOf(id));
      const pFull = pIds.length >= slotPassive && pIds.every((id) => (owned.passive[id] || 0) >= (bundle.passiveMax[id] || 4));
      if (aFull && pFull && evolvables.length === 0) st.saturatedNone++; else st.unsaturatedNone++;
      continue;
    }
    const seen = new Set();
    for (const c of cands) {
      st.offered.add(c.id);
      if (!allowed.has(c.id)) st.leakage++;
      if (seen.has(c.id)) st.duplicates++; else seen.add(c.id);
      if (c.kind === 'new_active' && Object.keys(owned.active).length >= slotActive) st.slotViolations++;
      if (c.kind === 'new_passive' && Object.keys(owned.passive).length >= slotPassive) st.slotViolations++;
    }
    if (evolvables.length > 0 && !cands.some((c) => c.kind === 'evolution')) st.formedNotOffered++;
    // 選択
    let pick = cands.find((c) => c.kind === 'evolution');
    if (!pick && strategy === 'evolution-first') {
      const adv = cands.filter((c) => advancesEvolution(bundle, owned, c));
      if (adv.length) { adv.sort((a, b) => bestGapAfter(bundle, owned, a) - bestGapAfter(bundle, owned, b)); pick = adv[0]; }
    }
    if (!pick) pick = strategy === 'first-candidate' ? cands[0] : cands[rng.int(cands.length)];
    st.taken.add(pick.id);
    if (pick.kind === 'evolution') {
      const base = bundle.reqs[pick.id] ? bundle.reqs[pick.id].base : null;
      if (base) delete owned.active[base];
      owned.active[pick.id] = 1;
      evolved.add(pick.id);
      st.evolutions++;
    } else if (pick.category === 'passive') {
      owned.passive[pick.id] = Math.min(bundle.passiveMax[pick.id] || 4, (owned.passive[pick.id] || 0) + 1);
    } else {
      owned.active[pick.id] = Math.min(bundle.activeMax[pick.id] || 8, (owned.active[pick.id] || 0) + 1);
    }
    if (draft.markGuidanceProgress) {
      const tag = (pick.guidance || []).find((g) => g === 'base' || g === 'support' || g === 'upgrade');
      if (tag) draft.markGuidanceProgress(tag);
    }
  }
  st.buildKey = [...Object.keys(owned.active)].sort().join('+');
  st.owned = owned; st.evolved = evolved;
  return st;
}
