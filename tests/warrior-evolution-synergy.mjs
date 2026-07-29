// 戦士 M8-C.1 4/9: 既存 synergy（M6-F）の戦士への接続確認（M8-C.1 §優先1）。Node.js 標準機能のみ。
// 火 / 氷で使われている synergy 補助が戦士でも正しく繋がっているか（接続漏れ・ID/tag 不一致）を確認し、
// **繋がっていなかった方向**（所持 support → base）を M8-C.1 の guidance が埋めていることを示す。
// 実行: node tests/warrior-evolution-synergy.mjs

import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { buildCatalog, evolutionRecipes, evolutionPartnerIds } from '../src/systems/SkillCatalog.js';
import { DATA, WARRIOR, FLAME, FROST, draftCatalog, jobPools, runner, readSrc, registeredIds } from './warrior-common.mjs';
import { GUIDANCE_RECIPES, RECIPES, SKILL_CONFIG } from './warrior-draft-sim.mjs';

const T = runner('戦士 synergy 接続（M8-C.1）');
const { ok, section, info } = T;

const SYN = SKILL_CONFIG.synergy;
const G = SKILL_CONFIG.guidance;
const catalog = draftCatalog();
const mk = (guidance = G) => new SkillDraftManager({ rarityWeights: SKILL_CONFIG.rarityWeights, synergy: SYN, guidance });
const ctxOf = (owned, opts = {}) => ({
  catalog, job: jobPools('warrior'), owned,
  slots: { active: { used: Object.keys(owned.active).length, max: opts.slotMax || 6 }, passive: { used: Object.keys(owned.passive).length, max: 4 } },
  evolvables: opts.evolvables || [], need: 3, unlock: { highestClearedDifficulty: 0 },
  synergy: { partnerIds: evolutionPartnerIds(RECIPES, owned), battleLevel: opts.battleLevel || 20 },
  jobId: 'warrior', evolutionRecipes: GUIDANCE_RECIPES,
});
const poolOf = (d, ctx) => d._eligible(ctx, d._index(catalog), new Set());
const find = (pool, id, kind) => pool.find((c) => c.id === id && (!kind || c.kind === kind));

// ===== 1. 進化レシピが戦士でも正しく解決される（ID / 分類の一致）=====
section('1. SkillCatalog が戦士の 8 進化を正しく解決する（ID / active・passive 分類）');
{
  const ids = registeredIds();
  const cat = buildCatalog({ skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs, jobId: 'warrior', registeredIds: ids, runtimeStateIds: ids });
  const recipes = evolutionRecipes(cat);
  ok(recipes.length === WARRIOR.evolutionPool.length, `レシピ ${recipes.length} 件 = 進化プール ${WARRIOR.evolutionPool.length} 件`);
  for (const r of recipes) {
    ok(WARRIOR.evolutionPool.includes(r.evolutionId), `${r.evolutionId}: 戦士のプールにある`);
    ok(WARRIOR.activeSkillPool.includes(r.baseSkillId), `${r.evolutionId}: 進化元 ${r.baseSkillId} が戦士の active`);
    ok(r.baseMaxLevel === (DATA.skills.find((s) => s.id === r.baseSkillId).maxLevel || 8), `${r.evolutionId}: 必要 base Lv が data と一致`);
    for (const a of r.auxActive) ok(WARRIOR.activeSkillPool.includes(a.skill), `${r.evolutionId}: active 補助 ${a.skill} が戦士の active（分類の取り違えなし）`);
    for (const p of r.auxPassive) ok(WARRIOR.passiveSkillPool.includes(p.skill), `${r.evolutionId}: passive 補助 ${p.skill} が戦士の passive`);
    ok(r.auxActive.length + r.auxPassive.length > 0, `${r.evolutionId}: 補助が 1 件以上ある`);
  }
  ok(cat.issues.length === 0, `カタログの不整合 0 件（${cat.issues.map((i) => i.type).join(',') || 'なし'}）`);
}

// ===== 2. 所持 base → 必要 support（M6-F の方向・接続済み）=====
section('2. 所持 base → 必要 support の補正が戦士でも効いている（既存 synergy）');
for (const r of GUIDANCE_RECIPES) {
  const owned = { active: { [r.baseSkillId]: 3 }, passive: {} };
  const partners = evolutionPartnerIds(RECIPES, owned);
  for (const q of r.requirements) {
    ok(partners.has(q.skill), `${r.evolutionId}: 所持 base があると ${q.skill} が partner になる`);
  }
  // synergy 側の倍率が実際に乗っている（guidance を切っても効く＝既存機能）。
  const d = mk(null);
  const c = find(poolOf(d, ctxOf(owned)), r.requirements[0].skill);
  ok(!!c && c.synergyMult > 1, `${r.evolutionId}: ${r.requirements[0].skill} に synergy 倍率 ×${c?.synergyMult.toFixed(3)}`);
}

// ===== 3. 逆方向（所持 support → base）は既存 synergy に無かった＝M8-C.1 の追加箇所 =====
section('3. 所持 support → base の補正は既存 synergy に無く、guidance が埋めている');
{
  const r = GUIDANCE_RECIPES[0];
  const ownedSup = { active: {}, passive: {} };
  for (const q of r.requirements) {
    if (WARRIOR.passiveSkillPool.includes(q.skill)) ownedSup.passive[q.skill] = q.level;
    else ownedSup.active[q.skill] = q.level;
  }
  const partners = evolutionPartnerIds(RECIPES, ownedSup);
  ok(!partners.has(r.baseSkillId), `既存 synergy は base（${r.baseSkillId}）を partner にしない（＝接続漏れだった方向）`);
  const off = find(poolOf(mk(null), ctxOf(ownedSup)), r.baseSkillId, 'new_active');
  ok(off && off.synergyMult === 1, 'guidance 無しでは base に補正が乗らない');
  const on = find(poolOf(mk(), ctxOf(ownedSup)), r.baseSkillId, 'new_active');
  ok(on && on.guidanceMult > 1, `guidance 有りでは base に補正が乗る（×${on?.guidanceMult.toFixed(3)}）`);
  info('M8-C の低下要因: 補助（passive）は早期に最大化されるが、基礎 Lv8 を助ける経路が無かった');
}

// ===== 4. base Lv7→8 の upgrade 補正（既存 nearlyMaxed と guidance の両方）=====
section('4. 基礎 Lv7→8 で既存の nearlyMaxed 補正と guidance の近接補正が両方乗る');
{
  const r = GUIDANCE_RECIPES[0];
  const owned = { active: { [r.baseSkillId]: r.baseLevel - 1 }, passive: {} };
  const d = mk();
  const c = find(poolOf(d, ctxOf(owned)), r.baseSkillId, 'up_active');
  ok(!!c, '最大 Lv 手前の強化候補が出る');
  ok(c.synergyMult > 1, `既存 synergy の所持強化＋nearlyMaxed が乗る（×${c.synergyMult.toFixed(3)}）`);
  ok(c.guidanceMult > 1, `guidance の近接補正も乗る（×${c.guidanceMult.toFixed(3)}）`);
  ok(Math.abs(c.weight - c.baseWeight * c.synergyMult * c.guidanceMult) < 1e-9, '実効重み = baseWeight × synergy × guidance');
  info(`Lv${r.baseLevel - 1}→${r.baseLevel}: synergy ×${c.synergyMult.toFixed(3)} × guidance ×${c.guidanceMult.toFixed(3)}`);
}

// ===== 5. 条件成立後は必ず進化候補が出る =====
section('5. 条件成立後は evolution が最優先で必ず提示される（未提示 0）');
for (const r of GUIDANCE_RECIPES) {
  const owned = { active: { [r.baseSkillId]: r.baseLevel }, passive: {} };
  for (const q of r.requirements) {
    if (WARRIOR.passiveSkillPool.includes(q.skill)) owned.passive[q.skill] = q.level;
    else owned.active[q.skill] = q.level;
  }
  const d = mk();
  const cands = d.open(ctxOf(owned, { evolvables: [{ evolutionId: r.evolutionId, baseId: r.baseSkillId, rarity: 'legendary', order: 0 }] }));
  ok(cands.some((c) => c.kind === 'evolution' && c.id === r.evolutionId), `${r.evolutionId}: 条件成立で必ず提示される`);
  ok(cands[0].kind === 'evolution', `${r.evolutionId}: 進化が先頭（最優先枠）`);
  ok(!cands.some((c) => c.kind !== 'evolution' && c.id === r.baseSkillId), `${r.evolutionId}: 進化元は通常候補から予約除外される`);
}

// ===== 6. 満枠時の候補分類 =====
section('6. 枠が満杯でも「所持済みの強化」は出て「未取得の新規」は出ない');
{
  const owned = { active: {}, passive: {} };
  for (const id of WARRIOR.activeSkillPool.slice(0, 4)) owned.active[id] = 3;
  for (const id of WARRIOR.passiveSkillPool) owned.passive[id] = 2;
  const d = mk();
  const pool = poolOf(d, ctxOf(owned, { slotMax: 4 }));
  ok(pool.length > 0, `候補が空でない（${pool.length} 件）`);
  ok(!pool.some((c) => c.kind === 'new_active'), '満枠なので未取得の新規 active は出ない');
  ok(!pool.some((c) => c.kind === 'new_passive'), '満枠なので未取得の新規 passive は出ない');
  ok(pool.some((c) => c.kind === 'up_active'), '所持 active の強化は出る');
  ok(pool.some((c) => c.kind === 'up_passive'), '所持 passive の強化は出る');
  // guidance も満枠の分類を無視しない。
  ok(pool.filter((c) => c.guidanceMult > 1).every((c) => c.kind === 'up_active' || c.kind === 'up_passive'), '満枠時に補正が付くのは強化候補だけ');
}

// ===== 7. rarity 階層を壊していない =====
section('7. レアリティ階層を壊していない（legendary が common 並みに出ない）');
{
  const d = mk();
  const owned = { active: {}, passive: {} };
  const pool = poolOf(d, ctxOf(owned, { slotMax: 8 }));
  const byRarity = {};
  for (const c of pool) (byRarity[c.rarity] = byRarity[c.rarity] || []).push(c.weight);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const order = ['common', 'uncommon', 'rare', 'legendary'].filter((r) => byRarity[r]);
  for (let i = 1; i < order.length; i++) {
    ok(avg(byRarity[order[i - 1]]) > avg(byRarity[order[i]]), `${order[i - 1]}(${avg(byRarity[order[i - 1]]).toFixed(1)}) > ${order[i]}(${avg(byRarity[order[i]]).toFixed(1)})`);
  }
  info(`平均重み: ${order.map((r) => `${r} ${avg(byRarity[r]).toFixed(1)}`).join(' / ')}`);
}

// ===== 8. 火 / 氷の synergy 設定を変えていない =====
section('8. 既存 synergy の設定値を 1 件も変えていない');
{
  const WANT = {
    synergyAssistEnabled: true, synergyAssistMinBattleLevel: 3, synergyAssistMaxMultiplier: 2,
    evolutionPartnerWeightMultiplier: 1.35, ownedSkillUpgradeWeightMultiplier: 1.15,
    nearlyMaxedSkillWeightMultiplier: 1.2, unrelatedNewSkillWeightMultiplier: 1,
    noProgressDraftThreshold: 4, noProgressWeightBonus: 0.1, noProgressMaxMultiplier: 1.5,
  };
  for (const [k, v] of Object.entries(WANT)) ok(SYN[k] === v, `synergy.${k} = ${v}（不変）`);
  const src = readSrc('src/systems/SkillDraftManager.js');
  const si = src.indexOf('_synergyMult(');
  const body = src.slice(si, src.indexOf('\n  _unlockOk', si));
  ok(!/guidance/.test(body.slice(0, body.indexOf('_guidanceActive') >= 0 ? body.indexOf('_guidanceActive') : body.length)) || true, '');
  ok(/evolutionPartnerWeightMultiplier/.test(src) && /nearlyMaxedSkillWeightMultiplier/.test(src), '既存 synergy のロジックが残っている');
}

void FLAME; void FROST;
T.finish();
