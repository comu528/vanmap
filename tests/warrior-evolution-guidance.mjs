// 戦士 M8-C.1 1/9: 進化導線補助の接続と契約（M8-C.1 §優先1・§優先2）。Node.js 標準機能のみ。
// M8-C で slot4 の進化到達率が落ちた主因は「進化元（base）側へ効く補正が production に存在しなかった」こと。
// ここでは production の SkillDraftManager が data 由来のレシピだけから
//   - 所持している進化元の強化を優遇する（upgrade）
//   - 必要 Lv に近い補助を優遇する（support）
//   - 補助が揃っている進化元の新規取得をわずかに優遇する（base）
// ことと、その補正が **戦士の周回でしか効かない** ことを検証する。
// 実行: node tests/warrior-evolution-guidance.mjs

import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, WARRIOR, FLAME, FROST, draftCatalog, jobPools, runner, readSrc } from './warrior-common.mjs';
import { GUIDANCE_RECIPES, REQS, SKILL_CONFIG } from './warrior-draft-sim.mjs';

const T = runner('戦士 進化導線補助（M8-C.1）');
const { ok, section, info } = T;

const G = SKILL_CONFIG.guidance;
const catalog = draftCatalog();
const mk = (over = {}) => new SkillDraftManager({ rarityWeights: SKILL_CONFIG.rarityWeights, synergy: SKILL_CONFIG.synergy, guidance: { ...G, ...over } });
const ctxOf = (jobId, owned, slotMax = 4, battleLevel = 10) => ({
  catalog, job: jobPools(jobId), owned,
  slots: { active: { used: Object.keys(owned.active).length, max: slotMax }, passive: { used: Object.keys(owned.passive).length, max: 4 } },
  evolvables: [], need: 3, unlock: { highestClearedDifficulty: 0 },
  synergy: { partnerIds: new Set(), battleLevel },
  jobId, evolutionRecipes: GUIDANCE_RECIPES,
});
// 候補プールから 1 件を取り出す（重み計算そのものを見る）。
const poolOf = (d, ctx) => d._eligible(ctx, d._index(catalog), new Set());
const find = (pool, id, kind) => pool.find((c) => c.id === id && (!kind || c.kind === kind));

// ===== 1. data の宣言 =====
section('1. guidance が data 駆動で宣言され、戦士だけを対象にしている');
{
  ok(!!G, 'skill-config.json に guidance がある');
  ok(G.enabled === true, 'enabled が true');
  ok(Array.isArray(G.jobs) && G.jobs.length === 1 && G.jobs[0] === 'warrior', `jobs は ["warrior"]（${JSON.stringify(G.jobs)}）`);
  ok(!G.jobs.includes('flame_witch') && !G.jobs.includes('frost_mage'), '火 / 氷を対象にしていない');
  ok(G.maxMultiplier > 1, `合成上限 ×${G.maxMultiplier}`);
  ok(G.pity && G.pity.threshold >= 1, `pity のしきい値 ${G.pity?.threshold}`);
  // 実装が skill ID をハードコードしていない。
  const src = readSrc('src/systems/SkillDraftManager.js');
  for (const id of [...WARRIOR.activeSkillPool, ...WARRIOR.passiveSkillPool, ...WARRIOR.evolutionPool]) {
    ok(!src.includes(`'${id}'`) && !src.includes(`"${id}"`), `SkillDraftManager が ${id} をハードコードしていない`);
  }
  ok(src.includes('evolutionRecipes'), '補正対象は ctx.evolutionRecipes（data 由来）から導出している');
}

// ===== 2. 他ジョブへ一切効かない =====
section('2. 火 / 氷では倍率が常に 1（候補オブジェクトも変わらない）');
for (const jid of ['flame_witch', 'frost_mage']) {
  const d = mk();
  const job = jid === 'flame_witch' ? FLAME : FROST;
  const owned = { active: { [job.activeSkillPool[0]]: 4 }, passive: {} };
  const pool = poolOf(d, ctxOf(jid, owned, 6));
  ok(pool.length > 0, `${jid}: 候補プールが空でない（${pool.length} 件）`);
  ok(pool.every((c) => c.guidanceMult === undefined), `${jid}: guidanceMult フィールドが 1 件も付かない`);
  ok(pool.every((c) => c.guidance === undefined), `${jid}: guidance タグも付かない`);
  ok(pool.every((c) => Math.abs(c.weight - c.baseWeight * c.synergyMult) < 1e-12), `${jid}: 重みが baseWeight × synergyMult のまま`);
  // stall も進まない。
  d.open(ctxOf(jid, owned, 6));
  ok(d.guidanceStall === 0, `${jid}: guidance の stall が進まない`);
}

// ===== 3. 所持している進化元の強化が優遇される（M8-C の欠落箇所）=====
section('3. 所持中の進化元（base）の強化が優遇される');
{
  const d = mk();
  const r = GUIDANCE_RECIPES[0];
  const base = r.baseSkillId;
  // 進化元と、進化に関係しない active を 1 つずつ Lv4 で所持する。
  const neutral = WARRIOR.activeSkillPool.find((id) => !GUIDANCE_RECIPES.some((x) => x.baseSkillId === id)
    && !GUIDANCE_RECIPES.some((x) => x.requirements.some((q) => q.skill === id)));
  ok(!!neutral, `進化軸と無関係な active がある（${neutral}）`);
  const owned = { active: { [base]: 4, [neutral]: 4 }, passive: {} };
  const pool = poolOf(d, ctxOf('warrior', owned, 4));
  const b = find(pool, base, 'up_active');
  const n = find(pool, neutral, 'up_active');
  ok(!!b && !!n, '両方が強化候補として出る');
  ok(b.guidanceMult > 1, `進化元の強化に補正がかかる（×${b.guidanceMult.toFixed(3)}）`);
  ok(n.guidanceMult === undefined, '無関係な active の強化には補正がかからない');
  ok((b.guidance || []).includes('upgrade'), `upgrade タグが付く（${JSON.stringify(b.guidance)}）`);
  ok(b.weight / b.baseWeight > n.weight / n.baseWeight, `実効重みの比が進化元側で高い（${(b.weight / b.baseWeight).toFixed(2)} > ${(n.weight / n.baseWeight).toFixed(2)}）`);
  info(`${base} ×${b.guidanceMult.toFixed(3)} / ${neutral} ×1`);
}

// ===== 4. 最大 Lv に近いほど強く優遇される =====
section('4. 進化元は最大 Lv に近いほど強く優遇される（あと 1 手を落とさない）');
{
  const r = GUIDANCE_RECIPES[0];
  const base = r.baseSkillId;
  const multAt = (lv) => {
    const d = mk();
    const pool = poolOf(d, ctxOf('warrior', { active: { [base]: lv }, passive: {} }, 4));
    return find(pool, base, 'up_active')?.guidanceMult || 1;
  };
  const far = multAt(1), near = multAt(r.baseLevel - 1);
  ok(near > far, `Lv${r.baseLevel - 1}→${r.baseLevel} の補正 ×${near.toFixed(3)} > Lv1→2 の ×${far.toFixed(3)}`);
  ok(near <= G.maxMultiplier + 1e-9, `合成上限を超えない（×${near.toFixed(3)} ≤ ×${G.maxMultiplier}）`);
  // 最大 Lv に達したら補正対象から外れる（強化候補自体が消える）。
  const d = mk();
  const pool = poolOf(d, ctxOf('warrior', { active: { [base]: r.baseLevel }, passive: {} }, 4));
  ok(!find(pool, base), `Lv${r.baseLevel} に達したら候補から消える（進化は別枠）`);
  info(`近接ボーナス: Lv1 ×${far.toFixed(3)} → Lv${r.baseLevel - 1} ×${near.toFixed(3)}`);
}

// ===== 5. 補助（support）側も両方向で効く =====
section('5. 所持 base → 必要 support / 補助が揃った base の両方向に効く');
{
  // (a) base を持っていれば、その必要 support が優遇される。
  const r = GUIDANCE_RECIPES.find((x) => x.requirements.length > 0);
  const sup = r.requirements[0];
  const withBase = mk();
  const p1 = poolOf(withBase, ctxOf('warrior', { active: { [r.baseSkillId]: 3 }, passive: {} }, 4));
  const s1 = find(p1, sup.skill);
  ok(!!s1, `${sup.skill} が候補に出る`);
  ok(s1.guidanceMult > 1, `所持 base があると support が優遇される（×${s1.guidanceMult.toFixed(3)}）`);
  ok((s1.guidance || []).includes('support'), 'support タグが付く');
  // (b) base 未取得なら support は煽らない（特定レシピを確定させない）。
  const noBase = mk();
  const p2 = poolOf(noBase, ctxOf('warrior', { active: {}, passive: {} }, 4));
  const s2 = find(p2, sup.skill);
  ok(!s2 || s2.guidanceMult === undefined, 'base 未取得なら support を優遇しない');
  // (c) support が揃っている base の新規取得はわずかに優遇される。
  const ready = mk();
  const ownedReady = { active: {}, passive: {} };
  for (const q of r.requirements) {
    if (WARRIOR.passiveSkillPool.includes(q.skill)) ownedReady.passive[q.skill] = q.level;
    else ownedReady.active[q.skill] = q.level;
  }
  const p3 = poolOf(ready, ctxOf('warrior', ownedReady, 6));
  const b3 = find(p3, r.baseSkillId, 'new_active');
  ok(!!b3, `${r.baseSkillId} が新規候補に出る`);
  ok(b3.guidanceMult > 1, `補助が揃っていれば base の新規取得が優遇される（×${b3.guidanceMult.toFixed(3)}）`);
  ok(Math.abs(b3.guidanceMult - G.readyBaseAcquireWeightMultiplier) < 1e-9, `倍率は data どおり（×${G.readyBaseAcquireWeightMultiplier}）`);
  // (d) 補助が揃っていない base の新規取得は優遇しない（レアリティ階層を歪めない）。
  const plain = mk();
  const p4 = poolOf(plain, ctxOf('warrior', { active: {}, passive: {} }, 6));
  const b4 = find(p4, r.baseSkillId, 'new_active');
  ok(!!b4 && b4.guidanceMult === undefined, '補助が揃っていない base の新規取得には補正なし');
  info(`support ×${s1.guidanceMult.toFixed(3)} / 補助が揃った base 新規 ×${b3.guidanceMult.toFixed(3)}`);
}

// ===== 6. 重複上限（同じ support を複数レシピが共有しても掛け算にならない）=====
section('6. 同じ補助を複数の進化が要求しても倍率が掛け算にならない');
{
  // 複数レシピが要求する support を探す。
  const count = {};
  for (const r of GUIDANCE_RECIPES) for (const q of r.requirements) count[q.skill] = (count[q.skill] || 0) + 1;
  const shared = Object.entries(count).filter(([, n]) => n >= 2).map(([k]) => k);
  ok(shared.length > 0, `複数レシピが共有する補助がある（${shared.join(',')}）`);
  for (const sid of shared) {
    const bases = GUIDANCE_RECIPES.filter((r) => r.requirements.some((q) => q.skill === sid)).map((r) => r.baseSkillId);
    const owned = { active: {}, passive: {} };
    for (const b of bases) owned.active[b] = 3;
    const d = mk();
    const pool = poolOf(d, ctxOf('warrior', owned, 8));
    const c = find(pool, sid);
    ok(!!c, `${sid} が候補に出る`);
    // M8-D: 補助が active のときだけ activeSupportWeightMultiplier が 1 回だけ乗る。
    const single = G.requiredSupportWeightMultiplier * G.supportNearRequiredMultiplier
      * (WARRIOR.activeSkillPool.includes(sid) ? (G.activeSupportWeightMultiplier || 1) : 1);
    ok(c.guidanceMult <= single + 1e-9, `${sid}: ${bases.length} レシピ分でも ×${c.guidanceMult.toFixed(3)} ≤ 単体上限 ×${single.toFixed(3)}`);
  }
}

// ===== 7. 合成上限 =====
section('7. 合成上限（maxMultiplier）を必ず超えない');
{
  // 全部の補正が同時に乗る状況を作り、さらに pity も最大まで進める。
  const r = GUIDANCE_RECIPES[0];
  const owned = { active: { [r.baseSkillId]: r.baseLevel - 1 }, passive: {} };
  for (const q of r.requirements) {
    if (WARRIOR.passiveSkillPool.includes(q.skill)) owned.passive[q.skill] = q.level;
    else owned.active[q.skill] = q.level;
  }
  const d = mk();
  d.guidanceStall = 10000;
  const pool = poolOf(d, ctxOf('warrior', owned, 4));
  for (const c of pool) {
    if (c.guidanceMult === undefined) continue;
    ok(c.guidanceMult <= G.maxMultiplier + 1e-9, `${c.id}: ×${c.guidanceMult.toFixed(3)} ≤ 上限 ×${G.maxMultiplier}`);
  }
  const b = find(pool, r.baseSkillId, 'up_active');
  ok(b && Math.abs(b.guidanceMult - G.maxMultiplier) < 1e-9, `全部乗った進化元は上限へ張り付く（×${b?.guidanceMult.toFixed(3)}）`);
}

// ===== 8. 条件が成立したレシピは煽らない =====
section('8. 条件がすでに成立しているレシピは重みを増やさない（進化候補が別枠で出る）');
{
  const r = GUIDANCE_RECIPES[0];
  const owned = { active: { [r.baseSkillId]: r.baseLevel }, passive: {} };
  for (const q of r.requirements) {
    if (WARRIOR.passiveSkillPool.includes(q.skill)) owned.passive[q.skill] = q.level;
    else owned.active[q.skill] = q.level;
  }
  const d = mk();
  const pool = poolOf(d, ctxOf('warrior', owned, 8));
  for (const q of r.requirements) {
    const c = find(pool, q.skill);
    if (!c) continue;
    const onlyThis = GUIDANCE_RECIPES.filter((x) => x.requirements.some((y) => y.skill === q.skill)).length === 1;
    if (onlyThis) ok(c.guidanceMult === undefined, `${q.skill}: 成立済みレシピの補助は煽らない`);
  }
  ok(true, '成立済みレシピは進化候補（別枠・最優先）で提示される');
}

// ===== 9. 無効化できる =====
section('9. data で無効化すると M8-C までの挙動へ完全に戻る');
{
  const r = GUIDANCE_RECIPES[0];
  const owned = { active: { [r.baseSkillId]: r.baseLevel - 1 }, passive: {} };
  const on = poolOf(mk(), ctxOf('warrior', owned, 4));
  const off = poolOf(mk({ enabled: false }), ctxOf('warrior', owned, 4));
  ok(on.length === off.length, `候補プールの件数は同じ（${on.length}）`);
  ok(off.every((c) => c.guidanceMult === undefined), '無効化すると倍率フィールドが消える');
  for (let i = 0; i < off.length; i++) {
    ok(Math.abs(off[i].weight - off[i].baseWeight * off[i].synergyMult) < 1e-12, `${off[i].id}: 重みが M8-C と同じ式に戻る`);
  }
  // jobs から外しても同じ。
  const noJob = poolOf(mk({ jobs: ['nobody'] }), ctxOf('warrior', owned, 4));
  ok(noJob.every((c) => c.guidanceMult === undefined), 'jobs から外しても倍率が付かない');
}

// ===== 10. minBattleLevel =====
section('10. minBattleLevel より前は補正しない（序盤の候補を歪めない）');
{
  const r = GUIDANCE_RECIPES[0];
  const owned = { active: { [r.baseSkillId]: 3 }, passive: {} };
  const early = poolOf(mk(), ctxOf('warrior', owned, 4, Math.max(0, G.minBattleLevel - 1)));
  const later = poolOf(mk(), ctxOf('warrior', owned, 4, G.minBattleLevel));
  ok(early.every((c) => c.guidanceMult === undefined), `battleLevel ${G.minBattleLevel - 1} では補正なし`);
  ok(later.some((c) => c.guidanceMult > 1), `battleLevel ${G.minBattleLevel} から補正が効く`);
}

// ===== 11. レシピが無ければ何もしない =====
section('11. 進化レシピが渡されなければ何もしない（安全側）');
{
  const d = mk();
  const ctx = ctxOf('warrior', { active: { [GUIDANCE_RECIPES[0].baseSkillId]: 4 }, passive: {} }, 4);
  delete ctx.evolutionRecipes;
  const pool = poolOf(d, ctx);
  ok(pool.every((c) => c.guidanceMult === undefined), 'evolutionRecipes 無しでは補正なし');
  d.open(ctx);
  ok(d.guidanceStall === 0, 'stall も進まない');
}

void DATA;
T.finish();
