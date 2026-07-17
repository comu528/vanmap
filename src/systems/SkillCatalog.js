// SkillCatalog（Milestone 6-F）: data/*.json（skills / passives / skill-evolutions / jobs）から
// active30種・passive4種・進化18種の「正確なカタログ」を生成し、孤立・未登録・参照不整合を検出する純ロジック。
// 会話や手書き一覧ではなく実データを唯一の正とする。Phaser/DOM 非依存で Node からテスト可能。
//
// 依存注入: 実装クラスの有無は registeredIds、runtimeState 保存の有無は runtimeStateIds を外部から渡す
//   （ブラウザは SkillManager.registeredSkillIds()/skillsWithRuntimeState()、Node テストは同関数を import）。
// SkillAudit と共有: 残響/分身/Lv80/タグの対応状況は SkillAudit を再利用し UI 専用の別判定を作らない。

import { echoStatus, cloneStatus, appliesLv80ProjectileCount, primaryTags } from './SkillAudit.js';

const asArr = (v) => (Array.isArray(v) ? v : []);

// 進化の補助条件（requiredSkills）を active/passive に分類する。
function classifyRequirements(ev, skillIds, passiveIds) {
  const reqs = asArr(ev.requiredSkills).map((r) => ({
    skill: r.skill, level: r.level || 1,
    kind: passiveIds.has(r.skill) ? 'passive' : (skillIds.has(r.skill) ? 'active' : 'missing'),
  }));
  return reqs;
}

// 単一 active のカタログ行を作る。
function activeEntry(s, ctx) {
  const { registered, runtimeState, evosByBase, evoIds, passiveIds, skillIds, pool } = ctx;
  const branches = asArr(s.evolutionBranches).filter((b) => evoIds.has(b));
  const evolutions = asArr(evosByBase[s.id]).map((e) => e.id);
  const lv1 = (Array.isArray(s.levels) && s.levels[0]) || {};
  return {
    id: s.id, displayName: s.name || s.id, rarity: s.rarity || 'common', category: 'active',
    element: s.element || (asArr(s.tags).includes('ice') ? 'ice' : (asArr(s.tags).includes('fire') ? 'fire' : null)),
    procCoefficient: s.procCoefficient != null ? s.procCoefficient : null,
    appliesChill: lv1.chillAmount != null, appliesFreeze: lv1.baseFreezeChance != null,
    tags: asArr(s.tags), primaryTags: primaryTags(s), maxLevel: s.maxLevel || 1, jobs: asArr(s.jobs),
    evolutionBranches: branches, hasClass: registered.has(s.id), inPool: pool.has(s.id),
    hasEvolution: evolutions.length > 0, evolutions,
    evolutionRequirements: asArr(evosByBase[s.id]).map((e) => ({
      evolutionId: e.id, baseLevel: s.maxLevel || 8, requirements: classifyRequirements(e, skillIds, passiveIds),
    })),
    castMode: s.castMode || null, mainCastEvent: s.mainCastEvent || null,
    echoPolicy: s.echoPolicy || 'standard', clonePolicy: s.clonePolicy || 'standard',
    echoStatus: echoStatus(s), cloneStatus: cloneStatus(s),
    lv80: appliesLv80ProjectileCount(s),
    isDefensive: !!s.isDefensive, isReactive: !!s.isReactive, usesResourceCost: !!s.usesResourceCost,
    hasRuntimeState: runtimeState.has(s.id), iconKey: s.iconKey || s.icon || null, enabled: s.enabled !== false,
  };
}

function passiveEntry(p, ctx) {
  return {
    id: p.id, displayName: p.displayName || p.id, rarity: p.rarity || 'common', category: 'passive',
    tags: asArr(p.tags), maxLevel: p.maxLevel || 1, jobs: asArr(p.jobs), isCommon: p.isCommon !== false,
    iconKey: p.iconKey || null, enabled: p.enabled !== false,
  };
}

function evolutionEntry(ev, ctx) {
  const { registered, runtimeState, skillIds, passiveIds } = ctx;
  return {
    id: ev.id, displayName: ev.displayName || ev.id, baseSkillId: ev.baseSkillId,
    element: ev.element || null, procCoefficient: ev.procCoefficient != null ? ev.procCoefficient : null,
    requirements: classifyRequirements(ev, skillIds, passiveIds),
    hasClass: registered.has(ev.id), evolvedTag: ev.visualTier === 'evolved',
    castMode: ev.castMode || null, echoPolicy: ev.echoPolicy || 'standard', clonePolicy: ev.clonePolicy || 'standard',
    echoStatus: echoStatus(ev), cloneStatus: cloneStatus(ev), lv80: appliesLv80ProjectileCount(ev),
    hasRuntimeState: runtimeState.has(ev.id), iconKey: ev.icon || null,
    baseExists: skillIds.has(ev.baseSkillId),
  };
}

// カタログを構築する。入力: { skills, passives, evolutions, jobId?, jobs, registeredIds, runtimeStateIds }。
export function buildCatalog(input) {
  const skills = asArr(input.skills);
  const passives = asArr(input.passives);
  const evolutions = asArr(input.evolutions);
  const jobs = asArr(input.jobs);
  const jobId = input.jobId || 'flame_witch';
  const job = jobs.find((j) => j.id === jobId) || jobs[0] || { activeSkillPool: [] };

  const registered = new Set(asArr(input.registeredIds));
  const runtimeState = new Set(asArr(input.runtimeStateIds));
  const skillIds = new Set(skills.map((s) => s.id));
  const passiveIds = new Set(passives.map((p) => p.id));
  const evoIds = new Set(evolutions.map((e) => e.id));
  const pool = new Set(asArr(job.activeSkillPool));
  const evosByBase = {};
  for (const e of evolutions) { (evosByBase[e.baseSkillId] = evosByBase[e.baseSkillId] || []).push(e); }

  const ctx = { registered, runtimeState, evosByBase, evoIds, passiveIds, skillIds, pool };
  // M7-A: ジョブごとにプールを分離する。active はそのジョブに属する（jobs に jobId を含む）ものだけ、
  // passive は共通（isCommon）＋ジョブ専用、進化はそのジョブの active を基礎とするものだけを対象にする。
  const activesAll = skills.filter((s) => (s.category || 'active') === 'active' && (asArr(s.jobs).includes(jobId) || pool.has(s.id)));
  const jobActiveIds = new Set(activesAll.map((s) => s.id));
  const actives = activesAll.map((s) => activeEntry(s, ctx)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const passiveRows = passives.filter((p) => p.isCommon === true || asArr(p.jobs).includes(jobId)).map((p) => passiveEntry(p, ctx));
  const evolutionsForJob = evolutions.filter((e) => jobActiveIds.has(e.baseSkillId));
  const evoRows = evolutionsForJob.map((e) => evolutionEntry(e, ctx)).sort((a, b) => (a.id < b.id ? -1 : 1));

  return {
    jobId, element: (jobs.find((j) => j.id === jobId) || {}).element || null,
    actives, passives: passiveRows, evolutions: evoRows,
    summary: buildSummary(actives, passiveRows, evoRows),
    issues: detectIssues({ actives, passives: passiveRows, evolutions: evoRows, skills: activesAll, evolutions_raw: evolutionsForJob, skillIds, evoIds, pool, registered }),
  };
}

function buildSummary(actives, passives, evolutions) {
  const withEvolution = actives.filter((a) => a.hasEvolution).map((a) => a.id);
  const withoutEvolution = actives.filter((a) => !a.hasEvolution).map((a) => a.id);
  const multiBranch = actives.filter((a) => a.evolutions.length > 1).map((a) => a.id);
  const rarityDist = (rows) => { const d = { common: 0, uncommon: 0, rare: 0, legendary: 0 }; for (const r of rows) d[r.rarity] = (d[r.rarity] || 0) + 1; return d; };
  // 役割別（castMode/フラグから）。
  const roleOf = (a) => a.isDefensive ? 'defensive' : (a.usesResourceCost ? 'resource' : (a.castMode === 'movement' ? 'movement' : 'offense'));
  const roleDist = {}; for (const a of actives) { const r = roleOf(a); roleDist[r] = (roleDist[r] || 0) + 1; }
  return {
    activeCount: actives.length, passiveCount: passives.length, evolutionCount: evolutions.length,
    withEvolution, withoutEvolution, multiBranch,
    rarityActives: rarityDist(actives), rarityPassives: rarityDist(passives),
    rarityByCategory: { active: rarityDist(actives), passive: rarityDist(passives) },
    roleDist,
    lv80Targets: actives.filter((a) => a.lv80).map((a) => a.id),
    withRuntimeState: [...actives, ...evolutions].filter((x) => x.hasRuntimeState).map((x) => x.id),
  };
}

// 不整合の検出（開発・監査用）。
function detectIssues(x) {
  const issues = [];
  const add = (type, id, detail) => issues.push({ type, id, detail });

  // 進化なし active / 複数進化。
  for (const a of x.actives) {
    if (!a.hasClass) add('unregistered-class', a.id, `active ${a.id} に実装クラスがない`);
    if (!a.inPool && a.enabled) add('missing-from-pool', a.id, `active ${a.id} が activeSkillPool に無い`);
    if (!a.castMode) add('missing-castMode', a.id, `active ${a.id} に castMode が無い`);
    if (!a.mainCastEvent && ['periodic', 'cooldown', 'continuous', 'resource'].includes(a.castMode)) add('missing-mainCastEvent', a.id, `攻撃 active ${a.id} に mainCastEvent が無い`);
    if (!a.echoPolicy || !a.clonePolicy) add('missing-policy', a.id, `active ${a.id} に echo/clonePolicy が無い`);
    // 存在しない進化参照。
    for (const b of a.evolutionBranches) if (!x.evoIds.has(b)) add('dangling-evolution', a.id, `active ${a.id} が存在しない進化 ${b} を参照`);
  }
  // passive: プール外でも isCommon なら可。実装は不要（passive はクラス化しない）。
  // 進化: baseSkillId 実在・実装クラス・補助条件実在。
  for (const e of x.evolutions) {
    if (!e.hasClass) add('unregistered-class', e.id, `進化 ${e.id} に実装クラスがない`);
    if (!e.baseExists) add('dangling-base', e.id, `進化 ${e.id} の baseSkillId ${e.baseSkillId} が実在しない`);
    for (const r of e.requirements) if (r.kind === 'missing') add('missing-requirement', e.id, `進化 ${e.id} の補助条件 ${r.skill} が実在しない`);
  }
  // 進化側から参照されていない（baseSkillId が evolutionBranches に載っていない）ズレ。
  for (const e of x.evolutions_raw) {
    const base = x.skills.find((s) => s.id === e.baseSkillId);
    if (base && !asArr(base.evolutionBranches).includes(e.id)) add('unlinked-evolution', e.id, `進化 ${e.id} が基礎 ${e.baseSkillId} の evolutionBranches に無い`);
  }
  // 重複 ID。
  const seen = new Set();
  for (const a of x.actives) { if (seen.has(a.id)) add('duplicate-id', a.id, `active ID 重複`); seen.add(a.id); }
  const eseen = new Set();
  for (const e of x.evolutions) { if (eseen.has(e.id)) add('duplicate-id', e.id, `進化 ID 重複`); eseen.add(e.id); }
  // Lv80対象の矛盾（進化は対象外・召喚/地雷/墓標などは対象外）: 進化なのに lv80 true。
  for (const e of x.evolutions) if (e.lv80) add('lv80-conflict', e.id, `進化 ${e.id} が Lv80対象になっている（単一形態は対象外）`);
  // enabled なのにプール外かつ非共通で出現不能な active。
  for (const a of x.actives) {
    if (a.enabled && !a.inPool && a.jobs.length > 0) add('unreachable', a.id, `active ${a.id} は enabled だがプール外で出現不能`);
  }
  return issues;
}

// 「進化相手」= 所持済みの基礎 active が持つ進化の補助スキルのうち、まだ必要レベルに達していないもの（M6-F シナジー補助）。
// 基礎を取得済み（committed）のときのみ相手を提示し、特定レシピを確定させない軽い補助に使う。
// owned: { active:{id:lvl}, passive:{id:lvl} } → 補助スキルID の Set。
export function evolutionPartnerIds(recipes, owned) {
  const oa = (owned && owned.active) || {};
  const op = (owned && owned.passive) || {};
  const set = new Set();
  for (const r of recipes) {
    if ((oa[r.baseSkillId] || 0) < 1) continue; // 基礎未取得なら相手を煽らない
    for (const a of r.auxActive) if ((oa[a.skill] || 0) < a.level) set.add(a.skill);
    for (const p of r.auxPassive) if ((op[p.skill] || 0) < p.level) set.add(p.skill);
  }
  return set;
}

// 進化レシピ一覧（分類つき・UI/テスト用）。
export function evolutionRecipes(catalog) {
  return catalog.evolutions.map((e) => {
    const auxActive = e.requirements.filter((r) => r.kind === 'active');
    const auxPassive = e.requirements.filter((r) => r.kind === 'passive');
    const base = catalog.actives.find((a) => a.id === e.baseSkillId);
    const legendaryCond = e.requirements.some((r) => {
      const a = catalog.actives.find((x) => x.id === r.skill);
      return a && a.rarity === 'legendary';
    });
    const defensiveCond = e.requirements.some((r) => {
      const a = catalog.actives.find((x) => x.id === r.skill);
      return a && a.isDefensive;
    });
    return {
      evolutionId: e.id, displayName: e.displayName, baseSkillId: e.baseSkillId,
      baseMaxLevel: base ? base.maxLevel : 8,
      auxActive, auxPassive, needsLegendaryCondition: legendaryCond, needsDefensiveCondition: defensiveCond,
      // 進化置換で active 枠は増えない（基礎を置換）。成立に必要な最小 active 取得数 = 基礎1＋active補助数。
      minActiveSkills: 1 + auxActive.length, minPassiveSkills: auxPassive.length,
    };
  });
}
