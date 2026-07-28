// 氷術師 完成監査 2/12: 進化対応表と到達可能性（M7-E §3）。Node.js 標準機能のみ。
// 18 進化それぞれの base / support / 必要Lv を production の SkillCatalog から自動生成し、
// プール実在・条件到達可能・自己参照/循環参照なし・枠不増加・進化後は通常抽選へ出ない、を検証する。
// 実行: node tests/frost-evolution-reachability.mjs

import { buildCatalog, evolutionRecipes } from '../src/systems/SkillCatalog.js';
import { memberAllowedForJob } from '../src/systems/poolEligibility.js';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, FROST, EXPECTED, registeredIds, draftCatalog, jobPools, runner, readSrc } from './frost-audit-common.mjs';

const T = runner('氷術師 進化到達可能性監査（M7-E）');
const { ok, section, info } = T;

const catalog = buildCatalog({
  skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs, jobId: 'frost_mage',
  registeredIds: registeredIds(), runtimeStateIds: [],
});
const recipes = evolutionRecipes(catalog);
const skillById = new Map(DATA.skills.map((s) => [s.id, s]));
const passiveById = new Map(DATA.passives.map((p) => [p.id, p]));
const job = jobPools('frost_mage');
const activePool = new Set(FROST.activeSkillPool);
const passivePool = new Set(FROST.passiveSkillPool);

// ===== 1. 対応表（18件・自動生成）=====
section('1. 進化対応表（evolution / base / support / 必要Lv）');
ok(recipes.length === EXPECTED.evolutionCount, `進化レシピ ${recipes.length} = 18`);
const table = [];
for (const r of recipes) {
  const base = skillById.get(r.baseSkillId);
  ok(!!base, `${r.evolutionId}: base ${r.baseSkillId} が実在`);
  ok(activePool.has(r.baseSkillId), `${r.evolutionId}: base が frost_mage の activeSkillPool にある`);
  ok((base && base.maxLevel) === 8, `${r.evolutionId}: base の maxLevel が 8`);
  const sup = [...r.auxActive.map((a) => ({ ...a, type: 'active' })), ...r.auxPassive.map((a) => ({ ...a, type: 'passive' }))];
  ok(sup.length >= 1, `${r.evolutionId}: 補助条件が1件以上ある`);
  for (const a of sup) {
    if (a.type === 'active') {
      ok(skillById.has(a.skill), `${r.evolutionId}: active 補助 ${a.skill} が実在`);
      ok(activePool.has(a.skill), `${r.evolutionId}: active 補助 ${a.skill} が frost_mage プールにある（抽選到達可能）`);
      ok(a.level >= 1 && a.level <= (skillById.get(a.skill) || {}).maxLevel, `${r.evolutionId}: active 補助の必要Lv ${a.level} が上限内`);
      ok(memberAllowedForJob({ ...skillById.get(a.skill), category: 'active' }, job), `${r.evolutionId}: active 補助 ${a.skill} が適格判定を通る`);
    } else {
      ok(passiveById.has(a.skill), `${r.evolutionId}: passive 補助 ${a.skill} が実在`);
      ok(passivePool.has(a.skill), `${r.evolutionId}: passive 補助 ${a.skill} が frost_mage の passiveSkillPool にある`);
      ok(a.level >= 1 && a.level <= (passiveById.get(a.skill) || {}).maxLevel, `${r.evolutionId}: passive 補助の必要Lv ${a.level} が上限内`);
    }
  }
  table.push({ id: r.evolutionId, base: r.baseSkillId, sup });
}

// ===== 2. 自己参照 / 循環参照 / 分岐 =====
section('2. 自己参照・循環参照なし / 分岐と共有の集計');
const evoIds = new Set(recipes.map((r) => r.evolutionId));
for (const r of recipes) {
  ok(r.baseSkillId !== r.evolutionId, `${r.evolutionId}: base が自分自身でない`);
  ok(!evoIds.has(r.baseSkillId), `${r.evolutionId}: base が別の進化ではない（進化の進化なし）`);
  for (const a of [...r.auxActive, ...r.auxPassive]) {
    ok(a.skill !== r.evolutionId && a.skill !== r.baseSkillId, `${r.evolutionId}: 補助が自分自身/自分の base でない`);
    ok(!evoIds.has(a.skill), `${r.evolutionId}: 補助が進化スキルでない`);
  }
}
const byBase = {}; for (const r of recipes) (byBase[r.baseSkillId] = byBase[r.baseSkillId] || []).push(r.evolutionId);
const branching = Object.entries(byBase).filter(([, v]) => v.length > 1);
ok(branching.length === 0, `1つの base から複数進化へ分岐するものは無い（${branching.map(([k, v]) => k + '→' + v.join('/')).join(', ') || 'なし'}）`);
const bySupport = {};
for (const r of recipes) for (const a of [...r.auxActive, ...r.auxPassive]) (bySupport[a.skill] = bySupport[a.skill] || []).push(r.evolutionId);
for (const [sk, list] of Object.entries(bySupport)) ok(list.length >= 1, `補助 ${sk} は ${list.length} 進化が要求`);

// ===== 3. 集計 =====
section('3. 集計（進化対象/非対象 active・support 共有数）');
const withEvo = new Set(recipes.map((r) => r.baseSkillId));
const without = FROST.activeSkillPool.filter((id) => !withEvo.has(id));
ok(withEvo.size === 18, `進化対象 active ${withEvo.size} 種`);
ok(without.length === 12, `進化非対象 active ${without.length} 種`);
ok(withEvo.size + without.length === 30, '進化対象＋非対象 = active30');
const passiveDemand = {}; for (const p of FROST.passiveSkillPool) passiveDemand[p] = (bySupport[p] || []).length;
for (const p of FROST.passiveSkillPool) ok(passiveDemand[p] >= 1, `passive ${p} は ${passiveDemand[p]} 進化から要求される（死に passive なし）`);
const activeSupports = Object.keys(bySupport).filter((s) => activePool.has(s));
info(`active 補助: ${activeSupports.map((s) => `${s}×${bySupport[s].length}`).join(', ') || 'なし'}`);
info(`passive 要求数: ${Object.entries(passiveDemand).map(([k, v]) => `${k}:${v}`).join(', ')}`);
info(`進化非対象 active: ${without.join(', ')}`);

// ===== 4. 最小必要枠（枠不増加・置換）=====
section('4. 進化は base を置換し active 枠を増やさない');
for (const r of recipes) {
  ok(r.minActiveSkills === 1 + r.auxActive.length, `${r.evolutionId}: 最小 active 数 = base1 + active補助${r.auxActive.length}`);
  ok(r.minPassiveSkills === r.auxPassive.length, `${r.evolutionId}: 最小 passive 数 = ${r.auxPassive.length}`);
  ok(r.minActiveSkills <= 4, `${r.evolutionId}: 4枠でも成立可能（最小 ${r.minActiveSkills}）`);
  ok(r.minPassiveSkills <= 4, `${r.evolutionId}: passive 4枠でも成立可能`);
}
const em = readSrc('src/systems/EvolutionManager.js');
ok(/replace|置換/.test(em), 'EvolutionManager が「置換」を実装している（枠を増やさない）');

// ===== 5. 進化後は通常抽選へ出ない =====
section('5. 進化スキルは通常ドラフト候補（catalog）に含まれない');
const dc = draftCatalog();
for (const eid of FROST.evolutionPool) ok(!dc.some((m) => m.id === eid), `${eid}: draftCatalog に進化スキルが混ざっていない`);
{
  // 進化元 active を Lv8 所持し進化が成立している状態では、進化候補は出るが進化元の通常候補は予約除外される。
  const r = recipes[0];
  const d = new SkillDraftManager({ rarityWeights: DATA.skillConfig.rarityWeights, synergy: DATA.skillConfig.synergy });
  d.reset(12345, {});
  const owned = { active: { [r.baseSkillId]: 8 }, passive: {} };
  for (const a of r.auxActive) owned.active[a.skill] = a.level;
  for (const a of r.auxPassive) owned.passive[a.skill] = a.level;
  const cands = d.open({
    catalog: dc, job, owned,
    slots: { active: { used: Object.keys(owned.active).length, max: 6 }, passive: { used: Object.keys(owned.passive).length, max: 4 } },
    evolvables: [{ evolutionId: r.evolutionId, baseId: r.baseSkillId, order: 0 }], need: 3, unlock: {},
    synergy: { partnerIds: new Set(), battleLevel: 12 },
  });
  ok(cands.some((c) => c.kind === 'evolution' && c.id === r.evolutionId), `${r.evolutionId}: 条件成立時に進化候補として提示される`);
  ok(!cands.some((c) => c.kind !== 'evolution' && c.id === r.baseSkillId), `${r.evolutionId}: 同じドラフトに進化元 ${r.baseSkillId} の通常候補が出ない`);
  ok(cands.filter((c) => c.kind === 'evolution').length >= 1, '進化候補は最低1枠を確保する');
}

// ===== 6. 対応表の出力（docs 用）=====
section('6. 対応表（人間可読・docs/frost-completion-audit.md と同じ内容）');
for (const t of table) info(`${t.id.padEnd(28)} ← ${t.base} Lv8 ＋ ${t.sup.map((s) => `${s.skill}(${s.type}) Lv${s.level}`).join(' ＋ ')}`);

T.finish();
