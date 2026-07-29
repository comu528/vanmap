// 戦士 M8-C.1 5/9: active 補助を使う進化（M8-C.1 §4）。Node.js 標準機能のみ。
// 戦士で唯一 active を補助に使う進化（天墜崩撃 = 跳躍強襲 + 地砕き Lv6）は
// 「active 枠を 2 つ使う」ぶん passive 補助の進化より不利になる。
// その不利を実測し、導線が両方向（base ⇄ active 補助）で効くこと、
// 進化後も補助 active が残ること、slot 制限を無視しないことを検証する。
// 実行: node tests/warrior-active-support-evolution.mjs

import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, WARRIOR, draftCatalog, jobPools, runner } from './warrior-common.mjs';
import { GUIDANCE_RECIPES, SKILL_CONFIG, aggregate, seedsOf, SEED_COUNT } from './warrior-draft-sim.mjs';

const T = runner('戦士 active 補助の進化（M8-C.1）');
const { ok, section, info } = T;

const G = SKILL_CONFIG.guidance;
const catalog = draftCatalog();
const mk = () => new SkillDraftManager({ rarityWeights: SKILL_CONFIG.rarityWeights, synergy: SKILL_CONFIG.synergy, guidance: G });
const ctxOf = (owned, slotMax = 4) => ({
  catalog, job: jobPools('warrior'), owned,
  slots: { active: { used: Object.keys(owned.active).length, max: slotMax }, passive: { used: Object.keys(owned.passive).length, max: 4 } },
  evolvables: [], need: 3, unlock: { highestClearedDifficulty: 0 },
  synergy: { partnerIds: new Set(), battleLevel: 20 },
  jobId: 'warrior', evolutionRecipes: GUIDANCE_RECIPES,
});
const poolOf = (d, ctx) => d._eligible(ctx, d._index(catalog), new Set());
const find = (pool, id, kind) => pool.find((c) => c.id === id && (!kind || c.kind === kind));

// data から「active を補助に使う進化」を集計する（id をハードコードしない）。
const ACTIVE_SUPPORT = GUIDANCE_RECIPES.filter((r) => r.requirements.some((q) => WARRIOR.activeSkillPool.includes(q.skill)));
const PASSIVE_SUPPORT = GUIDANCE_RECIPES.filter((r) => r.requirements.every((q) => WARRIOR.passiveSkillPool.includes(q.skill)));

// ===== 1. 実データの集計 =====
section('1. active 補助を使う進化を data から個別集計する');
{
  ok(ACTIVE_SUPPORT.length >= 1, `active 補助の進化が ${ACTIVE_SUPPORT.length} 件ある`);
  ok(PASSIVE_SUPPORT.length >= 1, `passive 補助の進化が ${PASSIVE_SUPPORT.length} 件ある`);
  ok(ACTIVE_SUPPORT.length + PASSIVE_SUPPORT.length === GUIDANCE_RECIPES.length, '全 8 進化がどちらかに分類される');
  for (const r of ACTIVE_SUPPORT) {
    const sup = r.requirements.filter((q) => WARRIOR.activeSkillPool.includes(q.skill));
    info(`${r.evolutionId}: base ${r.baseSkillId} Lv${r.baseLevel} + active 補助 ${sup.map((q) => `${q.skill} Lv${q.level}`).join(',')}`);
    ok(sup.every((q) => q.skill !== r.baseSkillId), `${r.evolutionId}: 補助 active が進化元と別スキル`);
    const evo = DATA.evolutions.find((e) => e.id === r.evolutionId);
    ok(sup.every((q) => q.skill !== evo.replacementSkillId), `${r.evolutionId}: 補助 active が置換先と別スキル`);
    // 必要 Lv は補助 active の maxLevel 以内。
    for (const q of sup) {
      const m = DATA.skills.find((s) => s.id === q.skill).maxLevel || 8;
      ok(q.level <= m, `${r.evolutionId}: 補助 ${q.skill} の必要 Lv${q.level} ≤ maxLevel ${m}`);
    }
  }
}

// ===== 2. 補助 active は置換されない =====
section('2. 補助 active は進化で置換されず、進化後も使い続けられる');
for (const r of ACTIVE_SUPPORT) {
  const evo = DATA.evolutions.find((e) => e.id === r.evolutionId);
  const sup = r.requirements.filter((q) => WARRIOR.activeSkillPool.includes(q.skill));
  ok(evo.baseSkillId === r.baseSkillId, `${r.evolutionId}: 置換されるのは進化元だけ`);
  for (const q of sup) {
    ok(evo.baseSkillId !== q.skill, `${r.evolutionId}: 補助 ${q.skill} は進化元ではない＝置換されない`);
    ok(WARRIOR.activeSkillPool.includes(q.skill), `${r.evolutionId}: 補助 ${q.skill} は戦士のプールに残る`);
    // 補助 active 自身は別の進化を持たない（進化して消えることがない）。
    const own = GUIDANCE_RECIPES.find((x) => x.baseSkillId === q.skill);
    ok(!own, `${r.evolutionId}: 補助 ${q.skill} は自身の進化を持たない（進化して消えない）`);
  }
}

// ===== 3. 両方向の補正 =====
section('3. base ⇄ active 補助の両方向で補正が効く');
for (const r of ACTIVE_SUPPORT) {
  const sup = r.requirements.find((q) => WARRIOR.activeSkillPool.includes(q.skill));
  // (a) base を持っていれば補助 active が優遇される。
  const a = find(poolOf(mk(), ctxOf({ active: { [r.baseSkillId]: 3 }, passive: {} }, 6)), sup.skill);
  ok(!!a, `${sup.skill} が候補に出る`);
  ok(a.guidanceMult > 1, `base 所持で補助 active が優遇される（×${a.guidanceMult.toFixed(3)}）`);
  // (b) 補助 active が必要 Lv に達していれば base の新規取得が優遇される。
  const b = find(poolOf(mk(), ctxOf({ active: { [sup.skill]: sup.level }, passive: {} }, 6)), r.baseSkillId, 'new_active');
  ok(!!b, `${r.baseSkillId} が新規候補に出る`);
  ok(b.guidanceMult > 1, `補助 active が揃うと base の新規取得が優遇される（×${b.guidanceMult.toFixed(3)}）`);
  // (c) 補助 active の強化も、必要 Lv 手前でさらに優遇される。
  const near = find(poolOf(mk(), ctxOf({ active: { [r.baseSkillId]: 3, [sup.skill]: sup.level - 1 }, passive: {} }, 6)), sup.skill, 'up_active');
  const far = find(poolOf(mk(), ctxOf({ active: { [r.baseSkillId]: 3, [sup.skill]: 1 }, passive: {} }, 6)), sup.skill, 'up_active');
  ok(near.guidanceMult >= far.guidanceMult, `必要 Lv 手前で強く優遇（×${far.guidanceMult.toFixed(3)} → ×${near.guidanceMult.toFixed(3)}）`);
}

// ===== 4. slot 制限を無視しない =====
section('4. 枠が満杯なら補助 active も新規候補として出さない');
for (const r of ACTIVE_SUPPORT) {
  const sup = r.requirements.find((q) => WARRIOR.activeSkillPool.includes(q.skill));
  const owned = { active: {}, passive: {} };
  // base を含めて 4 枠を埋める（補助 active は入れない）。
  owned.active[r.baseSkillId] = 5;
  for (const id of WARRIOR.activeSkillPool.filter((x) => x !== r.baseSkillId && x !== sup.skill).slice(0, 3)) owned.active[id] = 2;
  const pool = poolOf(mk(), ctxOf(owned, 4));
  ok(Object.keys(owned.active).length === 4, 'active 枠が満杯');
  ok(!find(pool, sup.skill), `${sup.skill}: 満枠では新規候補に出ない（slot 制限を無視しない）`);
  // 枠が空けば出る。
  const pool6 = poolOf(mk(), ctxOf(owned, 6));
  ok(!!find(pool6, sup.skill, 'new_active'), `${sup.skill}: 枠6 なら出る`);
}

// ===== 5. slot4 で 2 枠使う不利の実測 =====
section('5. slot4 では active 補助の進化が passive 補助より不利（実測）');
{
  const seeds = seedsOf(Math.min(SEED_COUNT, 200));
  const rates = {};
  for (const [slot, levelUps] of [[4, 40], [6, 60], [8, 80]]) {
    const a = aggregate({ seeds, slotActive: slot, levelUps });
    const act = ACTIVE_SUPPORT.reduce((n, r) => n + (a.evoTaken.get(r.evolutionId) || 0), 0) / a.runs * 100;
    const pas = PASSIVE_SUPPORT.reduce((n, r) => n + (a.evoTaken.get(r.evolutionId) || 0), 0) / a.runs * 100 / PASSIVE_SUPPORT.length * ACTIVE_SUPPORT.length;
    rates[slot] = { act, pas };
    info(`枠${slot}: active 補助進化 ${act.toFixed(1)}% / passive 補助進化（同数換算）${pas.toFixed(1)}%`);
    for (const r of ACTIVE_SUPPORT) ok((a.evoTaken.get(r.evolutionId) || 0) > 0, `枠${slot}: ${r.evolutionId} が取得される（到達不能ではない）`);
  }
  ok(rates[4].act < rates[4].pas, `枠4 では active 補助が不利（${rates[4].act.toFixed(1)}% < ${rates[4].pas.toFixed(1)}%）— 2 枠使う設計上の帰結`);
  ok(rates[8].act >= rates[4].act, `枠が広がるほど不利が緩む（枠4 ${rates[4].act.toFixed(1)}% → 枠8 ${rates[8].act.toFixed(1)}%）`);
}

// ===== 6. 同じ補助を共有する進化の重複上限 =====
section('6. 同じ補助を複数の進化が要求しても倍率が積み上がらない');
{
  const count = {};
  for (const r of GUIDANCE_RECIPES) for (const q of r.requirements) count[q.skill] = (count[q.skill] || 0) + 1;
  // 1 レシピぶんの上限。M8-D で「補助が active」のときだけ追加倍率が乗るので、種別で分ける。
  const singleFor = (sid) => G.requiredSupportWeightMultiplier * G.supportNearRequiredMultiplier
    * (WARRIOR.activeSkillPool.includes(sid) ? (G.activeSupportWeightMultiplier || 1) : 1);
  for (const [sid, n] of Object.entries(count)) {
    const bases = GUIDANCE_RECIPES.filter((r) => r.requirements.some((q) => q.skill === sid)).map((r) => r.baseSkillId);
    const owned = { active: {}, passive: {} };
    for (const b of bases) owned.active[b] = 3;
    const c = find(poolOf(mk(), ctxOf(owned, 8)), sid);
    if (!c || c.guidanceMult === undefined) continue;
    const single = singleFor(sid);
    ok(c.guidanceMult <= single + 1e-9, `${sid}（${n} レシピが共有）: ×${c.guidanceMult.toFixed(3)} ≤ 単体上限 ×${single.toFixed(3)}`);
  }
}

T.finish();
