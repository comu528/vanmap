// 戦士 Wave2 4/21: 進化導線補助の追調整（M8-D §guidance）。Node.js 標準機能のみ。
// M8-C.1 の guidance を active25 / evolution13 のカタログへ合わせた回。
// **しきい値は 1 つも下げていない**ことと、追加キーが健全であることを固定する。
//   - guidance の全キーが 1 以上・実装から参照される（予約フィールドなし）
//   - 追加した activeSupportWeightMultiplier は「補助が active」のときだけ乗る
//   - 同じ補助を複数レシピが共有しても倍率が掛け算にならない（役割ごとの最大のみ）
//   - guidance を切ると倍率が全部 1 に戻る（M8-C までの挙動）
//   - 火 / 氷では倍率が 1・guidance フィールドが付かない
//   - active 補助の 2 進化が「到達不能」になっていない
// 実行: node tests/warrior-wave2-guidance.mjs

import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, WARRIOR, EXPECTED, draftCatalog, jobPools, runner, readSrc } from './warrior-common.mjs';
import { GUIDANCE_RECIPES, SKILL_CONFIG, aggregate, seedsOf, SEED_COUNT } from './warrior-draft-sim.mjs';

const T = runner('戦士 Wave2 導線補助（M8-D）');
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
const PASSIVE_SUPPORT = GUIDANCE_RECIPES.filter((r) => r.requirements.every((q) => WARRIOR.passiveSkillPool.includes(q.skill)));

// ===== 1. 追加キーの健全性 =====
section('1. guidance の追加キーが健全（1 以上・data 駆動・実装から参照）');
{
  ok(typeof G.activeSupportWeightMultiplier === 'number', 'activeSupportWeightMultiplier が数値');
  ok(G.activeSupportWeightMultiplier >= 1, `1 以上（${G.activeSupportWeightMultiplier}）— 重みを下げる補正は作らない`);
  ok(G.activeSupportWeightMultiplier <= G.maxMultiplier, '合成上限を単体で超えない');
  const src = readSrc('src/systems/SkillDraftManager.js');
  ok(src.includes('activeSupportWeightMultiplier'), 'SkillDraftManager が参照している（予約フィールドでない）');
  // しきい値は M8-C.1 のまま（下げていない）。
  ok(G.minBattleLevel === 3, `minBattleLevel が 3 のまま（${G.minBattleLevel}）`);
  ok(G.pity.threshold === 3, `pity.threshold が 3 のまま（${G.pity.threshold}）`);
  ok(G.readyBaseAcquireWeightMultiplier === 1.3, 'readyBaseAcquireWeightMultiplier が不変');
  ok(G.ownedBaseUpgradeWeightMultiplier === 1.8, 'ownedBaseUpgradeWeightMultiplier が不変');
  ok(G.requiredSupportWeightMultiplier === 1.3, 'requiredSupportWeightMultiplier が不変');
  // 特定 skill ID をハードコードしていない。
  for (const id of [...EXPECTED.actives, ...EXPECTED.evolutions]) {
    ok(!src.includes(`'${id}'`), `SkillDraftManager が ${id} をハードコードしていない`);
  }
}

// ===== 2. 補助が active のときだけ追加補正が乗る =====
section('2. activeSupportWeightMultiplier は「補助が active」のときだけ乗る');
{
  const single = G.requiredSupportWeightMultiplier;
  for (const r of ACTIVE_SUPPORT) {
    const q = r.requirements.find((x) => WARRIOR.activeSkillPool.includes(x.skill));
    const owned = { active: { [r.baseSkillId]: 3 }, passive: {} };
    const c = find(poolOf(mk(), ctxOf('warrior', owned, 8)), q.skill);
    ok(!!c, `${q.skill}（${r.evolutionId} の補助）が候補に出る`);
    if (!c) continue;
    ok((c.guidanceMult || 1) >= single * G.activeSupportWeightMultiplier - 1e-9,
      `${q.skill}: active 補助の追加補正が乗る（×${(c.guidanceMult || 1).toFixed(3)}）`);
  }
  for (const r of PASSIVE_SUPPORT) {
    const q = r.requirements[0];
    const owned = { active: { [r.baseSkillId]: 3 }, passive: {} };
    const c = find(poolOf(mk(), ctxOf('warrior', owned, 8)), q.skill);
    if (!c || c.guidanceMult === undefined) continue;
    ok(c.guidanceMult < single * G.activeSupportWeightMultiplier - 1e-9,
      `${q.skill}（passive 補助）: 追加補正は乗らない（×${c.guidanceMult.toFixed(3)}）`);
  }
}

// ===== 3. 共有補助でも掛け算にならない =====
section('3. 同じ補助を複数レシピが要求しても倍率が積み上がらない');
{
  const count = {};
  for (const r of GUIDANCE_RECIPES) for (const q of r.requirements) count[q.skill] = (count[q.skill] || 0) + 1;
  const shared = Object.entries(count).filter(([, n]) => n >= 2).map(([k]) => k);
  ok(shared.length > 0, `複数レシピが共有する補助がある（${shared.join(',')}）`);
  for (const sid of shared) {
    const bases = GUIDANCE_RECIPES.filter((r) => r.requirements.some((q) => q.skill === sid)).map((r) => r.baseSkillId);
    const owned = { active: {}, passive: {} };
    for (const b of bases) owned.active[b] = 3;
    const c = find(poolOf(mk(), ctxOf('warrior', owned, 8)), sid);
    if (!c || c.guidanceMult === undefined) continue;
    const single = G.requiredSupportWeightMultiplier * G.supportNearRequiredMultiplier
      * (WARRIOR.activeSkillPool.includes(sid) ? G.activeSupportWeightMultiplier : 1);
    ok(c.guidanceMult <= single + 1e-9,
      `${sid}（${bases.length} レシピ共有）: ×${c.guidanceMult.toFixed(3)} ≤ 単体上限 ×${single.toFixed(3)}`);
  }
}

// ===== 4. 合成上限 =====
section('4. どんな所持状態でも maxMultiplier を超えない');
{
  const owned = { active: {}, passive: {} };
  for (const id of EXPECTED.actives.slice(0, 6)) owned.active[id] = 7;
  for (const id of EXPECTED.passives) owned.passive[id] = 3;
  const d = mk();
  d.guidanceStall = 99;
  for (const c of poolOf(d, ctxOf('warrior', owned, 8))) {
    ok((c.guidanceMult || 1) <= G.maxMultiplier + 1e-9, `${c.id}: ×${(c.guidanceMult || 1).toFixed(3)} ≤ ${G.maxMultiplier}`);
  }
}

// ===== 5. guidance を切ると全部 1 に戻る =====
section('5. guidance を切ると Wave2 でも倍率が全部 1 に戻る');
{
  SKILL_CONFIG.guidance.enabled = false;
  const owned = { active: { [EXPECTED.wave2Actives[0]]: 5 }, passive: {} };
  const pool = poolOf(mk(), ctxOf('warrior', owned, 8));
  ok(pool.every((c) => c.guidanceMult === undefined), 'guidanceMult フィールドが 1 件も付かない');
  ok(pool.every((c) => c.guidance === undefined), 'guidance タグが 1 件も付かない');
  SKILL_CONFIG.guidance.enabled = true;
}

// ===== 6. 火 / 氷では効かない =====
section('6. 火 / 氷では倍率 1・フィールドも付かない');
for (const jid of ['flame_witch', 'frost_mage']) {
  const j = DATA.jobs.find((x) => x.id === jid);
  const owned = { active: { [j.activeSkillPool[0]]: 5 }, passive: {} };
  const pool = poolOf(mk(), ctxOf(jid, owned, 8));
  ok(pool.every((c) => c.guidanceMult === undefined), `${jid}: guidanceMult が付かない`);
  ok(pool.length > 0, `${jid}: 候補は普通に出る（${pool.length} 件）`);
}

// ===== 7. active 補助の 2 進化が到達不能になっていない =====
section('7. active 補助の進化が Wave2 でも到達不能になっていない');
{
  const seeds = seedsOf(Math.min(SEED_COUNT, 200));
  for (const [slot, levelUps] of [[6, 60], [8, 80]]) {
    const a = aggregate({ seeds, slotActive: slot, levelUps });
    for (const r of ACTIVE_SUPPORT) {
      ok((a.evoTaken.get(r.evolutionId) || 0) > 0,
        `枠${slot}: ${r.evolutionId}（active 補助）が取得される（${a.evoTaken.get(r.evolutionId) || 0}）`);
    }
    const act = ACTIVE_SUPPORT.reduce((n, r) => n + (a.evoTaken.get(r.evolutionId) || 0), 0);
    info(`枠${slot}: active 補助進化の取得 ${act} 件 / ${a.runs} run（対象 ${ACTIVE_SUPPORT.map((r) => r.evolutionId).join(',')}）`);
  }
}

// ===== 8. 過剰誘導していない =====
section('8. 過剰誘導していない（新規取得率が同 rarity 中央値の 3 倍を超えない）');
{
  const seeds = seedsOf(Math.min(SEED_COUNT, 200));
  const a = aggregate({ seeds, slotActive: 6, levelUps: 60 });
  const byRarity = {};
  for (const id of EXPECTED.actives) {
    const r = DATA.skills.find((x) => x.id === id).rarity;
    // 「新規取得（枠を 1 つ埋めた回数）」で測る。taken はレベルアップ回数なので過剰誘導の指標にならない。
    (byRarity[r] = byRarity[r] || []).push({ id, n: a.acquired.get(id) || 0 });
  }
  let over = 0;
  for (const [r, arr] of Object.entries(byRarity)) {
    const sorted = arr.map((x) => x.n).sort((x, y) => x - y);
    const med = sorted[Math.floor(sorted.length / 2)] || 1;
    for (const x of arr) if (x.n > med * 3) { over++; info(`過剰: ${x.id}(${r}) ${x.n} > 中央値 ${med} × 3`); }
  }
  ok(over === 0, `同 rarity 中央値の 3 倍を超える取得率が 0 件（${over}）`);
}

T.finish();
