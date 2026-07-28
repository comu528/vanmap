// 火の魔女 完成監査 2/12: 進化対応表と到達可能性（M8-A §2）。Node.js 標準機能のみ。
// 18 進化それぞれの base / support / 必要Lv を production の SkillCatalog から自動生成し、
// プール実在・条件到達可能・自己参照/循環参照なし・枠不増加・進化後は通常抽選へ出ない、を検証する。
// 実行: node tests/flame-evolution-reachability.mjs

import { buildCatalog, evolutionRecipes } from '../src/systems/SkillCatalog.js';
import { memberAllowedForJob } from '../src/systems/poolEligibility.js';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, FLAME, EXPECTED, registeredIds, draftCatalog, jobPools, runner, readSrc } from './flame-audit-common.mjs';

const T = runner('火の魔女 進化到達可能性監査（M8-A）');
const { ok, section, info } = T;

const catalog = buildCatalog({
  skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs, jobId: 'flame_witch',
  registeredIds: registeredIds(), runtimeStateIds: [],
});
const recipes = evolutionRecipes(catalog);
const skillById = new Map(DATA.skills.map((s) => [s.id, s]));
const passiveById = new Map(DATA.passives.map((p) => [p.id, p]));
const job = jobPools('flame_witch');
const activePool = new Set(FLAME.activeSkillPool);
const passivePool = new Set(FLAME.passiveSkillPool);

// ===== 1. 対応表（18件・自動生成）=====
section('1. 進化対応表（evolution / base / support / 必要Lv）');
ok(recipes.length === EXPECTED.evolutionCount, `進化レシピ ${recipes.length} = 18`);
const table = [];
for (const r of recipes) {
  const base = skillById.get(r.baseSkillId);
  ok(!!base, `${r.evolutionId}: base ${r.baseSkillId} が実在`);
  ok(activePool.has(r.baseSkillId), `${r.evolutionId}: base が flame_witch の activeSkillPool にある`);
  ok((base && base.maxLevel) === 8, `${r.evolutionId}: base の maxLevel が 8`);
  const sup = [...r.auxActive.map((a) => ({ ...a, type: 'active' })), ...r.auxPassive.map((a) => ({ ...a, type: 'passive' }))];
  ok(sup.length >= 1, `${r.evolutionId}: 補助条件が1件以上ある`);
  for (const a of sup) {
    if (a.type === 'active') {
      ok(skillById.has(a.skill), `${r.evolutionId}: active 補助 ${a.skill} が実在`);
      ok(activePool.has(a.skill), `${r.evolutionId}: active 補助 ${a.skill} が flame_witch プールにある（抽選到達可能）`);
      ok(a.level >= 1 && a.level <= (skillById.get(a.skill) || {}).maxLevel, `${r.evolutionId}: active 補助の必要Lv ${a.level} が上限内`);
      ok(memberAllowedForJob({ ...skillById.get(a.skill), category: 'active' }, job), `${r.evolutionId}: active 補助 ${a.skill} が適格判定を通る`);
    } else {
      ok(passiveById.has(a.skill), `${r.evolutionId}: passive 補助 ${a.skill} が実在`);
      ok(passivePool.has(a.skill), `${r.evolutionId}: passive 補助 ${a.skill} が flame_witch の passiveSkillPool にある`);
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
section('3. 集計（進化対象/非対象 active・support 共有数・passive 要求数）');
const withEvo = new Set(recipes.map((r) => r.baseSkillId));
const without = FLAME.activeSkillPool.filter((id) => !withEvo.has(id));
ok(withEvo.size === 18, `進化対象 active ${withEvo.size} 種`);
ok(without.length === 12, `進化非対象 active ${without.length} 種`);
ok(withEvo.size + without.length === 30, '進化対象＋非対象 = active30');
const passiveDemand = {}; for (const p of FLAME.passiveSkillPool) passiveDemand[p] = (bySupport[p] || []).length;
// 火の魔女は 18 進化のうち 4 件だけが passive 補助（残り 14 件は active 補助）。
// そのため「進化補助として要求されない passive」が存在しうる。死に passive の判定は
// 「進化補助である」か「modifier が実装から実際に参照される」かのどちらかで行う（氷側より緩い基準ではなく、別の基準）。
const PASSIVE_MOD_GETTER = {
  damage: 'getDamageMultiplier', cooldown: 'getCooldownMultiplier', area: 'getAreaMultiplier',
  duration: 'getDurationMultiplier', projectileCount: 'getProjectileCountBonus',
  projectileSpeed: 'getProjectileSpeedMultiplier', movementSpeed: 'getMovementSpeedMultiplier',
};
const pmSrc = readSrc('src/systems/PassiveManager.js');
for (const p of FLAME.passiveSkillPool) {
  const def = passiveById.get(p);
  const mods = (def && def.modifiers) || [];
  ok(mods.length > 0, `passive ${p}: modifier を1件以上持つ`);
  const live = mods.every((m) => {
    const g = PASSIVE_MOD_GETTER[m.key];
    return !!g && new RegExp(g).test(pmSrc);
  });
  ok(passiveDemand[p] >= 1 || live,
    `passive ${p}: 進化補助（${passiveDemand[p]} 件）か、実装が参照する modifier（${mods.map((m) => m.key).join('/')}）のどちらかを持つ（死に passive でない）`);
}
const activeSupports = Object.keys(bySupport).filter((s) => activePool.has(s));
info(`active 補助: ${activeSupports.map((s) => `${s}×${bySupport[s].length}`).join(', ') || 'なし'}`);
info(`passive 要求数: ${Object.entries(passiveDemand).map(([k, v]) => `${k}:${v}`).join(', ')}`);
info(`進化非対象 active(${without.length}): ${without.join(', ')}`);

// ===== 4. 最小必要枠（枠不増加・置換・進化後追加Lvなし）=====
section('4. 進化は base を置換し active 枠を増やさない / 進化後は単一形態');
for (const r of recipes) {
  ok(r.minActiveSkills === 1 + r.auxActive.length, `${r.evolutionId}: 最小 active 数 = base1 + active補助${r.auxActive.length}`);
  ok(r.minPassiveSkills === r.auxPassive.length, `${r.evolutionId}: 最小 passive 数 = ${r.auxPassive.length}`);
  ok(r.minActiveSkills <= 4, `${r.evolutionId}: 4枠でも成立可能（最小 ${r.minActiveSkills}）`);
  ok(r.minPassiveSkills <= 4, `${r.evolutionId}: passive 4枠でも成立可能`);
  const ev = DATA.evolutions.find((e) => e.id === r.evolutionId);
  ok(ev.replacementSkillId === r.evolutionId, `${r.evolutionId}: replacementSkillId が自分自身（元 active を置換）`);
  ok(!Array.isArray(ev.levels) || ev.levels.length <= 1, `${r.evolutionId}: 進化後に追加 Lv を持たない（単一形態）`);
  // support に active を使う進化でも、support 自体は置換しない（base だけが置換対象）。
  for (const a of r.auxActive) ok(a.skill !== r.baseSkillId, `${r.evolutionId}: active 補助 ${a.skill} は置換対象ではない`);
}
const em = readSrc('src/systems/EvolutionManager.js');
ok(/replace|置換/.test(em), 'EvolutionManager が「置換」を実装している（枠を増やさない）');
const smSrc = readSrc('src/systems/SkillManager.js');
ok(/this\.skills\.delete\(baseId\)/.test(smSrc), 'SkillManager.evolve が基礎スキルのインスタンスを削除する（同時稼働しない）');
ok(/_evolvedBase\.has\(baseId\)/.test(smSrc), '同一周回で同じ基礎から2度進化しない');

// ===== 5. 進化後は通常抽選へ出ない =====
section('5. 進化スキルは通常ドラフト候補（catalog）に含まれない');
const dc = draftCatalog();
for (const eid of FLAME.evolutionPool) ok(!dc.some((m) => m.id === eid), `${eid}: draftCatalog に進化スキルが混ざっていない`);
for (const r of recipes) {
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
}

// ===== 6. 対応表の出力（docs 用）=====
section('6. 対応表（人間可読・docs/flame-completion-audit.md と同じ内容）');
for (const t of table) info(`${t.id.padEnd(28)} ← ${t.base} Lv8 ＋ ${t.sup.map((s) => `${s.skill}(${s.type}) Lv${s.level}`).join(' ＋ ')}`);

T.finish();
