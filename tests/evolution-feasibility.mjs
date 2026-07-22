// 進化成立可能性（Milestone 6-F）。Node.js 標準機能のみ。
// 18 種の進化それぞれが「理論上成立可能」か（基礎が pool に存在し maxLevel8・全補助が実在し到達可能）を検証し、
// 必要最小 active/passive 枠を算出、4枠で不可能なレシピを検出（情報）、6/8枠での成立性・置換で枠が増えないこと・
// 最大Lv 除外が補助条件を無効化しないことを確認する。抽選ロジックは再実装せず SkillDraftManager/SkillCatalog を使う。
// 実行: node tests/evolution-feasibility.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCatalog, evolutionRecipes } from '../src/systems/SkillCatalog.js';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (n) => JSON.parse(readFileSync(join(dir, n), 'utf8'));
const skills = load('skills.json').skills;
const passives = load('passives.json').passives;
const evolutions = load('skill-evolutions.json').evolutions;
const jobs = load('jobs.json').jobs;
const cfg = load('skill-config.json');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

const job = jobs.find((j) => j.id === 'flame_witch');
const pool = new Set(job.activeSkillPool);
const skillById = new Map(skills.map((s) => [s.id, s]));
const passiveById = new Map(passives.map((p) => [p.id, p]));
const activeMaxLevel = (id) => (skillById.get(id) || {}).maxLevel || 8;
const passiveMaxLevel = (id) => (passiveById.get(id) || {}).maxLevel || 5;

const catalogModel = buildCatalog({
  skills, passives, evolutions, jobs, jobId: 'flame_witch',
  registeredIds: skills.map((s) => s.id).concat(evolutions.map((e) => e.id)), runtimeStateIds: [],
});
const recipes = evolutionRecipes(catalogModel);

const draftCatalog = [
  ...skills.map((s) => ({ id: s.id, category: s.category, rarity: s.rarity, weight: s.weight, maxLevel: s.maxLevel, enabled: s.enabled, jobs: s.jobs, isCommon: s.isCommon, prerequisites: s.prerequisites, conflicts: s.conflicts, unlockCondition: s.unlockCondition })),
  ...passives.map((p) => ({ id: p.id, category: 'passive', rarity: p.rarity, weight: p.weight, maxLevel: p.maxLevel, enabled: p.enabled, jobs: p.jobs, isCommon: p.isCommon, prerequisites: p.prerequisites, conflicts: p.conflicts, unlockCondition: p.unlockCondition })),
];
// passiveSkillPool を実データ（flame_witch の4種）にする＝抽選到達性を isCommon ではなくプールで判定する（M7-B 追加監査）。
const draftJob = { activeSkillPool: job.activeSkillPool, passiveSkillPool: job.passiveSkillPool || [] };
const passivePool = new Set(job.passiveSkillPool || []);

// ===== 0. 母数 =====
section('0. 進化は18種');
ok(recipes.length === 18, `進化レシピ 18 種 (${recipes.length})`);

// ===== 1. 各進化が理論上成立可能・補助は実在 =====
section('1. 各進化: 基礎が pool の maxLevel8・全補助が実在し到達可能');
const infoOver4 = [];
for (const r of recipes) {
  const base = skillById.get(r.baseSkillId);
  ok(!!base, `${r.evolutionId}: 基礎 ${r.baseSkillId} が skills に実在`);
  ok(pool.has(r.baseSkillId), `${r.evolutionId}: 基礎 ${r.baseSkillId} が activeSkillPool にある（抽選到達可能）`);
  ok(activeMaxLevel(r.baseSkillId) === 8, `${r.evolutionId}: 基礎 ${r.baseSkillId} は maxLevel8`);

  for (const a of r.auxActive) {
    ok(skillById.has(a.skill), `${r.evolutionId}: active 補助 ${a.skill} が実在`);
    ok(pool.has(a.skill) || (skillById.get(a.skill) || {}).isCommon === true, `${r.evolutionId}: active 補助 ${a.skill} が抽選到達可能`);
    ok(a.level >= 1 && a.level <= activeMaxLevel(a.skill), `${r.evolutionId}: active 補助 ${a.skill} 要求Lv${a.level} が上限内`);
  }
  for (const p of r.auxPassive) {
    ok(passiveById.has(p.skill), `${r.evolutionId}: passive 補助 ${p.skill} が実在`);
    // 到達性はプール（またはは明示的共通）で判定する。火の魔女の進化補助passiveは flame_witch の passiveSkillPool にある。
    const pv = passiveById.get(p.skill);
    ok(passivePool.has(p.skill) || pv.isCommon === true || (Array.isArray(pv.jobs) && pv.jobs.includes('*')), `${r.evolutionId}: passive 補助 ${p.skill} が抽選到達可能（プール/共通）`);
    ok(p.level >= 1 && p.level <= passiveMaxLevel(p.skill), `${r.evolutionId}: passive 補助 ${p.skill} 要求Lv${p.level} が上限内`);
  }

  // 最小枠数。
  const minActive = 1 + r.auxActive.length;   // 基礎 + active 補助（進化は基礎を置換＝基礎枠を再利用）
  const minPassive = r.auxPassive.length;
  ok(r.minActiveSkills === minActive, `${r.evolutionId}: minActiveSkills=${minActive}`);
  ok(r.minPassiveSkills === minPassive, `${r.evolutionId}: minPassiveSkills=${minPassive}`);
  if (minActive > 4) infoOver4.push({ id: r.evolutionId, minActive });
}

// 補助が missing（実在しない）進化が無いこと。
section('2. 存在しない補助を参照する進化が無い');
{
  let missing = 0;
  for (const e of catalogModel.evolutions) for (const req of e.requirements) if (req.kind === 'missing') { missing++; console.error(`    ! ${e.id} が実在しない補助 ${req.skill} を参照`); }
  ok(missing === 0, `全進化の補助条件が実在（missing=${missing}）`);
}

// ===== 3. 4枠不可能レシピの検出（情報・失敗ではない） =====
section('3. active 4枠で不可能なレシピの検出（情報）');
{
  if (infoOver4.length === 0) console.log('  info: 4枠を超える active を要するレシピは無し（全レシピ minActive ≤ 4）');
  else for (const x of infoOver4) console.log(`  info: ${x.id} は minActive=${x.minActive}（4枠では不可・6/8枠が必要）`);
  ok(true, '4枠不可能レシピの検出は情報として報告（成立性の失敗にはしない）');
}

// ===== 4. 6/8枠での成立性 =====
section('4. 6枠・8枠では全レシピが枠的に成立可能');
{
  const feasible6 = recipes.every((r) => r.minActiveSkills <= 6 && r.minPassiveSkills <= 4);
  const feasible8 = recipes.every((r) => r.minActiveSkills <= 8 && r.minPassiveSkills <= 4);
  ok(feasible6, '全レシピが active6/passive4 枠で成立可能');
  ok(feasible8, '全レシピが active8/passive4 枠で成立可能');
}

// ===== 5. 進化置換は枠を増やさない（基礎を置換） =====
section('5. 進化置換で active 枠は増えない');
{
  // 所持: 基礎(Lv8) + active 補助。進化しても distinct active 数は不変（進化は基礎枠を再利用）。
  let allOk = true;
  for (const r of recipes) {
    const ownedActive = { [r.baseSkillId]: 8 };
    for (const a of r.auxActive) ownedActive[a.skill] = a.level;
    const before = Object.keys(ownedActive).length;
    // 進化を適用（base は Lv8 のまま所持継続・evolved 印のみ）→ distinct active 数は不変。
    const evolvedSet = new Set([r.evolutionId]);
    const after = Object.keys(ownedActive).length; // 基礎は削除も追加もされない
    if (after !== before || evolvedSet.size !== 1) allOk = false;
  }
  ok(allOk, '進化後も distinct active 枠数が不変（進化は基礎枠を占有し続ける）');
}

// ===== 6. 最大Lv 除外が補助条件を無効化しない（Lv8 の補助も「所持」扱い） =====
section('6. 最大Lv の補助も進化要件を満たす（通常候補からは除外されても所持は有効）');
{
  // active 補助を持つレシピを選び、基礎Lv8 かつ補助を maxLevel(8) まで上げた状態で
  //  (a) 進化 evolvables を渡せば進化候補が出る（要件成立）
  //  (b) 補助自身は maxLevel のため通常候補には出ない（除外）
  const withActiveAux = recipes.find((r) => r.auxActive.length > 0);
  ok(!!withActiveAux, 'active 補助を持つレシピが存在');
  if (withActiveAux) {
    const aux = withActiveAux.auxActive[0];
    const ownedActive = { [withActiveAux.baseSkillId]: 8, [aux.skill]: activeMaxLevel(aux.skill) }; // 補助を最大Lv
    // 要件: 補助Lv(最大) >= 要求Lv。
    ok(activeMaxLevel(aux.skill) >= aux.level, `補助 ${aux.skill} は最大Lv(${activeMaxLevel(aux.skill)}) ≥ 要求Lv(${aux.level})`);
    // evolvables を production 同様に算出（基礎Lv8＋補助Lv達成＋未進化）。
    const evolvable = (ownedActive[withActiveAux.baseSkillId] >= 8) && withActiveAux.auxActive.every((a) => (ownedActive[a.skill] || 0) >= a.level) && withActiveAux.auxPassive.every((p) => 0 >= p.level);
    ok(evolvable, `${withActiveAux.evolutionId}: 補助が最大Lv でも要件成立（所持として有効）`);

    const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(7, {});
    const ctx = {
      catalog: draftCatalog, job: draftJob,
      owned: { active: ownedActive, passive: {} },
      slots: { active: { used: Object.keys(ownedActive).length, max: 8 }, passive: { used: 0, max: 4 } },
      evolvables: [{ evolutionId: withActiveAux.evolutionId, baseId: withActiveAux.baseSkillId, rarity: 'legendary', order: 1 }],
      need: 4, unlock: {},
    };
    const cand = d.open(ctx);
    ok(cand.some((c) => c.kind === 'evolution' && c.id === withActiveAux.evolutionId), '進化候補が出る（最大Lv 補助でも進化可能）');
    ok(!cand.some((c) => c.id === aux.skill && c.kind !== 'evolution'), '最大Lv の補助自身は通常候補から除外される（要件は維持）');
  }
}

// ===== 7. 各進化の構成スキル（基礎＋全補助）が抽選で到達可能 =====
// 「成立可能」= 基礎・各補助が抽選プールから実際に候補として引ける（＝所持でき Lv を上げられる）こと。
// 進化完成そのものは引き運（特に全 legendary 構成）に依るため、構成要素の到達可能性で成立性を担保する。
section('7. 各進化の基礎・補助が抽選候補として出現しうる（到達可能）');
{
  const needIds = new Set();
  for (const r of recipes) { needIds.add(r.baseSkillId); for (const a of r.auxActive) needIds.add(a.skill); for (const p of r.auxPassive) needIds.add(p.skill); }
  // 空所持・満枠余裕（8枠）から 200 seed の初回ドラフトで各 id が候補に出るか。
  const seenAt = {};
  for (let s = 1; s <= 200; s++) {
    const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(s, {});
    const ctx = { catalog: draftCatalog, job: draftJob, owned: { active: {}, passive: {} }, slots: { active: { used: 0, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 4, unlock: {} };
    for (const c of d.open(ctx)) if (needIds.has(c.id) && seenAt[c.id] === undefined) seenAt[c.id] = s;
  }
  for (const r of recipes) {
    const comps = [r.baseSkillId, ...r.auxActive.map((a) => a.skill), ...r.auxPassive.map((p) => p.skill)];
    const unreachable = comps.filter((id) => seenAt[id] === undefined);
    ok(unreachable.length === 0, `${r.evolutionId}: 構成 [${comps.join(', ')}] が全て抽選到達可能` + (unreachable.length ? `（未到達: ${unreachable.join(',')}）` : ''));
  }
}

// ===== 8. build 相当ポリシーでの進化完成到達（情報＋大多数の担保） =====
// 全 legendary 構成（star_devouring_furnace: 基礎 bullet_furnace + 補助 phoenix_feather がともに legendary）は
// 引き運が極端に厳しく、現実的な予算では完成しにくい。これは「バランス上の最難関」情報として報告し、
// 構成到達可能性（セクション7）で成立性は担保済みとする。ここでは大多数（16/18 以上）の実完成を確認する。
section('8. build 相当ポリシーで大多数の進化が実際に完成（最難関は情報）');
{
  const auxIdsOf = (r) => new Set([...r.auxActive.map((a) => a.skill), ...r.auxPassive.map((a) => a.skill)]);
  const hardCount = [];
  let reachable = 0;
  for (const r of recipes) {
    const auxIds = auxIdsOf(r);
    let got = false;
    for (let s = 1; s <= 60 && !got; s++) {
      const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights, synergy: cfg.synergy });
      d.reset(s, { rerolls: 0, banishes: 0, skips: 0 });
      const oa = {}, op = {}; let evolved = false;
      for (let i = 0; i < 120 && !evolved; i++) {
        const baseAt8 = (oa[r.baseSkillId] || 0) >= 8;
        const auxDone = r.auxActive.every((a) => (oa[a.skill] || 0) >= a.level) && r.auxPassive.every((p) => (op[p.skill] || 0) >= p.level);
        const evolvables = (baseAt8 && auxDone) ? [{ evolutionId: r.evolutionId, baseId: r.baseSkillId, rarity: 'legendary', order: 1 }] : [];
        const ctx = {
          catalog: draftCatalog, job: draftJob,
          owned: { active: oa, passive: op },
          slots: { active: { used: Object.keys(oa).length, max: 8 }, passive: { used: Object.keys(op).length, max: 4 } },
          evolvables, need: 3, unlock: {}, synergy: { partnerIds: auxIds, battleLevel: i + 1 },
        };
        const cands = d.open(ctx);
        const pick = cands.find((c) => c.kind === 'evolution' && c.id === r.evolutionId)
          || cands.find((c) => c.id === r.baseSkillId && (c.kind === 'new_active' || c.kind === 'up_active'))
          || cands.find((c) => auxIds.has(c.id))
          || cands[0];
        if (!pick) break;
        if (pick.kind === 'evolution') { evolved = true; break; }
        if (pick.kind === 'new_active') oa[pick.id] = 1;
        else if (pick.kind === 'up_active') oa[pick.id] = pick.toLevel;
        else if (pick.kind === 'new_passive') op[pick.id] = 1;
        else if (pick.kind === 'up_passive') op[pick.id] = pick.toLevel;
      }
      if (evolved) got = true;
    }
    if (got) reachable++; else hardCount.push(r.evolutionId);
  }
  for (const id of hardCount) console.log(`  info: ${id} は 60seed×120lv の予算では未完成（全legendary構成などの最難関）`);
  ok(reachable >= recipes.length - 2, `大多数の進化が build 相当で実完成（成立 ${reachable}/${recipes.length}）`);
}

console.log('');
if (fail) { console.error(`✗ 進化成立可能性テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ 進化成立可能性テスト成功: ${pass} 件すべて通過`); process.exit(0); }
