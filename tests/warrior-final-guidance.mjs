// 戦士 最終Wave 4/16: 進化導線の再監査（M8-E §10）。Node.js 標準機能のみ。
// active30 / evolution18 の最終カタログでも、M8-C.1 の導線が壊れていないことを固定する。
//   - **しきい値を 1 つも下げていない**（M8-C.1 / M8-D の値がそのまま）
//   - 追加キーは data 駆動で 1 以上・実装から参照される（予約フィールドなし）
//   - 特定 skill ID / 特定進化 ID のハードコードが無い
//   - 同じ補助を複数レシピが共有しても倍率が掛け算にならない
//   - guidance を切ると倍率が全部 1 に戻る・火 / 氷では常に 1
//   - 過剰誘導していない（新規取得率が同 rarity 中央値の 3 倍以下）
// 実行: node tests/warrior-final-guidance.mjs

import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, WARRIOR, EXPECTED, draftCatalog, jobPools, runner, readSrc } from './warrior-common.mjs';
import { GUIDANCE_RECIPES, SKILL_CONFIG, aggregate, seedsOf, SEED_COUNT } from './warrior-draft-sim.mjs';

const T = runner('戦士 最終Wave 導線監査（M8-E）');
const { ok, section, info } = T;

const G = DATA.skillConfig.guidance;
const catalog = draftCatalog();
const mk = () => new SkillDraftManager({
  rarityWeights: SKILL_CONFIG.rarityWeights, synergy: SKILL_CONFIG.synergy, guidance: SKILL_CONFIG.guidance,
});
const ctxOf = (jobId, owned, slotMax = 8) => ({
  catalog, job: jobPools(jobId), owned,
  slots: { active: { used: Object.keys(owned.active).length, max: slotMax }, passive: { used: Object.keys(owned.passive).length, max: 4 } },
  evolvables: [], need: 3, jobId, evolutionRecipes: GUIDANCE_RECIPES,
  synergy: { partnerIds: new Set(), battleLevel: 20 },
});
const poolOf = (d, ctx) => d._eligible(ctx, d._index(catalog), new Set());
const find = (pool, id) => pool.find((c) => c.id === id);

const ACTIVE_SUPPORT = GUIDANCE_RECIPES.filter((r) => r.requirements.some((q) => WARRIOR.activeSkillPool.includes(q.skill)));

// ===== 1. しきい値を下げていない =====
section('1. M8-C.1 / M8-D のしきい値が 1 つも下がっていない');
{
  const KEEP = {
    minBattleLevel: 3, maxMultiplier: 6,
    readyBaseAcquireWeightMultiplier: 1.3, ownedBaseUpgradeWeightMultiplier: 1.8,
    nearMaxRemainingLevels: 3, baseNearMaxBonusMultiplier: 1.7, supportReadyBaseMultiplier: 1.5,
    requiredSupportWeightMultiplier: 1.3, nearRequiredRemainingLevels: 1, supportNearRequiredMultiplier: 1.2,
    activeSupportWeightMultiplier: 1.6,
  };
  for (const [k, v] of Object.entries(KEEP)) ok(G[k] === v, `guidance.${k} = ${v}（変更なし・実際 ${G[k]}）`);
  ok(G.pity.threshold === 3, `pity.threshold = 3（実際 ${G.pity.threshold}）`);
  ok(G.pity.bonusPerStep === 0.12, `pity.bonusPerStep = 0.12（実際 ${G.pity.bonusPerStep}）`);
  ok(G.pity.maxMultiplier === 1.8, `pity.maxMultiplier = 1.8（実際 ${G.pity.maxMultiplier}）`);
  ok((G.jobs || []).join(',') === 'warrior', 'guidance.jobs は ["warrior"] のまま（global 変更なし）');
  ok(G.enabled === true, 'guidance は有効のまま');
}

// ===== 2. 追加キー（必要 Lv が高い補助）=====
section('2. 追加キーが健全（1 以上・data 駆動・実装から参照）');
{
  ok(typeof G.highRequirementSupportLevel === 'number' && G.highRequirementSupportLevel >= 1,
    `highRequirementSupportLevel が正の数（${G.highRequirementSupportLevel}）`);
  ok(typeof G.highRequirementSupportMultiplier === 'number' && G.highRequirementSupportMultiplier >= 1,
    `highRequirementSupportMultiplier が 1 以上（${G.highRequirementSupportMultiplier}）— 重みを下げる補正は作らない`);
  ok(G.highRequirementSupportMultiplier <= G.maxMultiplier, '合成上限を単体で超えない');
  const src = readSrc('src/systems/SkillDraftManager.js');
  for (const k of ['highRequirementSupportLevel', 'highRequirementSupportMultiplier']) {
    ok(src.includes(k), `SkillDraftManager が ${k} を参照している（予約フィールドでない）`);
  }
  // data のすべての guidance キーが実装から参照される（逆方向も）。
  for (const k of Object.keys(G)) {
    if (k === '_comment' || k === 'pity' || k === 'jobs' || k === 'enabled') continue;
    ok(src.includes(`cfg.${k}`), `guidance.${k} が実装から参照されている`);
  }
}

// ===== 3. skill ID / 進化 ID をハードコードしていない =====
section('3. 特定 skill / 進化 ID をハードコードしていない');
{
  const src = readSrc('src/systems/SkillDraftManager.js');
  for (const id of [...EXPECTED.actives, ...EXPECTED.evolutions, ...EXPECTED.passives]) {
    ok(!src.includes(`'${id}'`) && !src.includes(`"${id}"`), `SkillDraftManager が ${id} をハードコードしていない`);
  }
}

// ===== 4. 必要 Lv が高い補助にだけ追加補正が乗る =====
section('4. 必要 Lv が高い補助（Lv6 以上）にだけ追加補正が乗る');
{
  const high = GUIDANCE_RECIPES.filter((r) => r.requirements.some((q) => (q.level || 1) >= G.highRequirementSupportLevel));
  ok(high.length > 0, `必要 Lv ${G.highRequirementSupportLevel} 以上の補助を持つレシピがある（${high.length} 件）`);
  for (const r of high) {
    const q = r.requirements.find((x) => (x.level || 1) >= G.highRequirementSupportLevel);
    const owned = { active: { [r.baseSkillId]: 3 }, passive: {} };
    const c = find(poolOf(mk(), ctxOf('warrior', owned, 8)), q.skill);
    if (!c || c.guidanceMult === undefined) continue;
    const base = G.requiredSupportWeightMultiplier * (WARRIOR.activeSkillPool.includes(q.skill) ? G.activeSupportWeightMultiplier : 1);
    ok(c.guidanceMult >= base * G.highRequirementSupportMultiplier - 1e-9,
      `${q.skill}（Lv${q.level} 必要）: 追加補正が乗る（×${c.guidanceMult.toFixed(3)}）`);
  }
  // 必要 Lv が低い補助には乗らない。
  const low = GUIDANCE_RECIPES.filter((r) => r.requirements.every((q) => (q.level || 1) < G.highRequirementSupportLevel));
  for (const r of low.slice(0, 5)) {
    const q = r.requirements[0];
    const owned = { active: { [r.baseSkillId]: 3 }, passive: {} };
    const c = find(poolOf(mk(), ctxOf('warrior', owned, 8)), q.skill);
    if (!c || c.guidanceMult === undefined) continue;
    const cap = G.requiredSupportWeightMultiplier * G.supportNearRequiredMultiplier
      * (WARRIOR.activeSkillPool.includes(q.skill) ? G.activeSupportWeightMultiplier : 1);
    ok(c.guidanceMult <= cap + 1e-9, `${q.skill}（Lv${q.level} 必要）: 追加補正は乗らない（×${c.guidanceMult.toFixed(3)}）`);
  }
}

// ===== 5. 共有補助でも掛け算にならない =====
section('5. 同じ補助を複数レシピが要求しても倍率が積み上がらない');
{
  const count = {};
  for (const r of GUIDANCE_RECIPES) for (const q of r.requirements) count[q.skill] = (count[q.skill] || 0) + 1;
  const shared = Object.entries(count).filter(([, n]) => n >= 2).map(([k]) => k);
  ok(shared.length > 0, `複数レシピが共有する補助がある（${shared.join(',')}）`);
  const maxReqLevel = (sid) => Math.max(0, ...GUIDANCE_RECIPES
    .flatMap((r) => r.requirements.filter((q) => q.skill === sid).map((q) => q.level || 1)));
  for (const sid of shared) {
    const bases = GUIDANCE_RECIPES.filter((r) => r.requirements.some((q) => q.skill === sid)).map((r) => r.baseSkillId);
    const owned = { active: {}, passive: {} };
    for (const b of bases) owned.active[b] = 3;
    const c = find(poolOf(mk(), ctxOf('warrior', owned, 8)), sid);
    if (!c || c.guidanceMult === undefined) continue;
    const single = G.requiredSupportWeightMultiplier * G.supportNearRequiredMultiplier
      * (WARRIOR.activeSkillPool.includes(sid) ? G.activeSupportWeightMultiplier : 1)
      * (maxReqLevel(sid) >= G.highRequirementSupportLevel ? G.highRequirementSupportMultiplier : 1);
    ok(c.guidanceMult <= single + 1e-9,
      `${sid}（${bases.length} レシピ共有）: ×${c.guidanceMult.toFixed(3)} ≤ 単体上限 ×${single.toFixed(3)}`);
  }
}

// ===== 6. 合成上限 =====
section('6. どんな所持状態でも maxMultiplier を超えない');
{
  const owned = { active: {}, passive: {} };
  for (const id of EXPECTED.actives.slice(0, 8)) owned.active[id] = 7;
  for (const id of EXPECTED.passives) owned.passive[id] = 3;
  const d = mk();
  d.guidanceStall = 99;
  for (const c of poolOf(d, ctxOf('warrior', owned, 8))) {
    ok((c.guidanceMult || 1) <= G.maxMultiplier + 1e-9, `${c.id}: ×${(c.guidanceMult || 1).toFixed(3)} ≤ ${G.maxMultiplier}`);
  }
}

// ===== 7. 無効化・他ジョブ =====
section('7. guidance を切ると倍率が 1 に戻り、火 / 氷では常に 1');
{
  SKILL_CONFIG.guidance.enabled = false;
  const owned = { active: { [EXPECTED.finalActives[0]]: 5 }, passive: {} };
  const pool = poolOf(mk(), ctxOf('warrior', owned, 8));
  ok(pool.every((c) => c.guidanceMult === undefined), 'guidanceMult フィールドが 1 件も付かない');
  SKILL_CONFIG.guidance.enabled = true;
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    const o = { active: { [j.activeSkillPool[0]]: 5 }, passive: {} };
    const p2 = poolOf(mk(), ctxOf(jid, o, 8));
    ok(p2.every((c) => c.guidanceMult === undefined), `${jid}: guidanceMult が付かない（非回帰）`);
    ok(p2.length > 0, `${jid}: 候補は普通に出る（${p2.length} 件）`);
  }
}

// ===== 8. 過剰誘導していない =====
section('8. 過剰誘導していない（新規取得率が同 rarity 中央値の 3 倍以下）');
{
  const seeds = seedsOf(Math.min(SEED_COUNT, 200));
  const a = aggregate({ seeds, slotActive: 6, levelUps: 60 });
  const byRarity = {};
  for (const id of EXPECTED.actives) {
    const r = DATA.skills.find((x) => x.id === id).rarity;
    (byRarity[r] = byRarity[r] || []).push({ id, n: a.acquired.get(id) || 0 });
  }
  let over = 0;
  for (const [r, arr] of Object.entries(byRarity)) {
    const sorted = arr.map((x) => x.n).sort((x, y) => x - y);
    const med = sorted[Math.floor(sorted.length / 2)] || 1;
    for (const x of arr) if (x.n > med * 3) { over++; info(`過剰: ${x.id}(${r}) ${x.n} > 中央値 ${med} × 3`); }
  }
  ok(over === 0, `同 rarity 中央値の 3 倍を超える新規取得率が 0 件（${over}）`);
}

// ===== 9. active 補助の進化を個別に集計 =====
section('9. active 補助の進化が最終カタログでも到達可能');
{
  const seeds = seedsOf(Math.min(SEED_COUNT, 200));
  for (const [slot, levelUps] of [[6, 60], [8, 80]]) {
    const a = aggregate({ seeds, slotActive: slot, levelUps });
    for (const r of ACTIVE_SUPPORT) {
      ok((a.evoTaken.get(r.evolutionId) || 0) > 0,
        `枠${slot}: ${r.evolutionId}（active 補助）が取得される（${a.evoTaken.get(r.evolutionId) || 0}）`);
    }
    info(`枠${slot}: active 補助進化 ${ACTIVE_SUPPORT.map((r) => `${r.evolutionId}:${a.evoTaken.get(r.evolutionId) || 0}`).join(' ')}`);
  }
}

T.finish();
