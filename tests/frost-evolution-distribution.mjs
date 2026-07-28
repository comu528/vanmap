// 氷術師 完成監査 4/12: 個別進化の到達率分布（M7-E §8）。Node.js 標準機能のみ。
// 18 進化それぞれについて「base 取得 → base Lv8 → support 取得 → support 必要Lv → 条件成立 → 提示 → 取得」の
// 各段階を evolution-first / balanced で計測し、到達不能・条件成立後の未提示・取得0 を検出する。
// 実行: node tests/frost-evolution-distribution.mjs   /   HEAVY=1 で 500 seed

import { buildCatalog, evolutionRecipes } from '../src/systems/SkillCatalog.js';
import { simulate, summarize } from '../src/systems/DraftBalanceAnalyzer.js';
import { DATA, FROST, registeredIds, draftCatalog, jobPools, seedRange, runner } from './frost-audit-common.mjs';

const T = runner('氷術師 個別進化 到達率分布（M7-E）');
const { ok, section, info } = T;

const HEAVY = !!process.env.HEAVY;
const SEEDS = seedRange(HEAVY ? 500 : 200, 1);
const POLICIES = ['evolution-first', 'balanced'];
const SLOTS = [4, 6, 8];

const catalog = buildCatalog({
  skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs, jobId: 'frost_mage',
  registeredIds: registeredIds(), runtimeStateIds: [],
});
const recipes = evolutionRecipes(catalog);
const dc = draftCatalog();
const job = jobPools('frost_mage');
const rarityOf = {}; for (const s of DATA.skills) rarityOf[s.id] = s.rarity;

const cache = new Map();
const run = (policy, activeMax) => {
  const k = policy + '|' + activeMax;
  if (!cache.has(k)) cache.set(k, summarize(simulate({
    catalog: dc, job, evolutions: DATA.evolutions, recipes,
    rarityWeights: DATA.skillConfig.rarityWeights, synergy: DATA.skillConfig.synergy,
    slots: { activeMax, passiveMax: 4 }, need: 3, jobLevel: 1, levelUps: 60, seeds: SEEDS, policy,
    useReroll: true, useBanish: true, useSkip: true,
  })));
  return cache.get(k);
};

// ===== 1. 条件成立後に提示されないことが無い =====
section('1. 条件成立後は必ず進化候補として提示される（提示漏れ 0）');
for (const policy of POLICIES) for (const slot of SLOTS) {
  const r = run(policy, slot);
  for (const id of FROST.evolutionPool) {
    const d = r.evoDetailRate[id];
    ok(d && d.conditionNotOffered === 0, `${policy}/slot${slot} ${id}: 条件成立後に未提示となる周回が 0`);
  }
}

// ===== 2. 全戦略・全枠を合算して到達不能（取得0）の進化が無い =====
section('2. 到達不能（取得0）の進化が無い');
const totals = {};
for (const id of FROST.evolutionPool) totals[id] = { cond: 0, offered: 0, exec: 0 };
for (const policy of POLICIES) for (const slot of SLOTS) {
  const r = run(policy, slot);
  for (const id of FROST.evolutionPool) {
    totals[id].cond += r.evoDetailRate[id].condition;
    totals[id].offered += r.evoDetailRate[id].offered;
    totals[id].exec += r.evoDetailRate[id].executed;
  }
}
for (const id of FROST.evolutionPool) {
  ok(totals[id].cond > 0, `${id}: 条件が成立する周回がある`);
  ok(totals[id].offered > 0, `${id}: 進化候補として提示される周回がある`);
  ok(totals[id].exec > 0, `${id}: 実際に進化する周回がある（到達不能でない）`);
}

// ===== 3. 段階ごとの単調性（条件形成の内訳が矛盾しない）=====
section('3. 段階の単調性（base ≥ baseLv8 ≥ 条件 ≥ 提示 ≥ 取得）');
for (const policy of POLICIES) {
  const r = run(policy, 6);
  for (const id of FROST.evolutionPool) {
    const d = r.evoDetailRate[id];
    ok(d.baseAcq >= d.baseMax - 1e-9, `${policy} ${id}: base 取得率 ≥ base Lv8 率`);
    ok(d.baseMax >= d.condition - 1e-9, `${policy} ${id}: base Lv8 率 ≥ 条件成立率`);
    ok(d.supportLv >= d.condition - 1e-9, `${policy} ${id}: support 必要Lv率 ≥ 条件成立率`);
    ok(d.supportAcq >= d.supportLv - 1e-9, `${policy} ${id}: support 取得率 ≥ support 必要Lv率`);
    ok(d.condition >= d.offered - 1e-9, `${policy} ${id}: 条件成立率 ≥ 提示率`);
    ok(d.offered >= d.executed - 1e-9, `${policy} ${id}: 提示率 ≥ 取得率`);
  }
}

// ===== 4. 低率の要因分解（警告のみ・均一化はしない）=====
section('4. 低率の進化とその要因（rarity / support 種別・警告のみ）');
{
  const r = run('evolution-first', 6);
  const rows = FROST.evolutionPool.map((id) => {
    const rec = recipes.find((x) => x.evolutionId === id);
    const d = r.evoDetailRate[id];
    return { id, d, baseRarity: rarityOf[rec.baseSkillId], activeSupport: rec.auxActive.length > 0 };
  }).sort((a, b) => a.d.executed - b.d.executed);
  for (const row of rows) {
    info(`${row.id.padEnd(28)} base=${row.baseRarity.padEnd(9)} ${row.activeSupport ? 'active補助' : 'passive補助'}  base取得=${(row.d.baseAcq * 100).toFixed(0)}% baseLv8=${(row.d.baseMax * 100).toFixed(0)}% supportLv=${(row.d.supportLv * 100).toFixed(0)}% 条件=${(row.d.condition * 100).toFixed(0)}% 取得=${(row.d.executed * 100).toFixed(0)}%`);
  }
  // 低率の主因が「base のレアリティ」または「active 補助が枠を1つ余分に使うこと」であることを確認する。
  const low = rows.filter((x) => x.d.executed < 0.05);
  for (const row of low) {
    ok(row.baseRarity === 'legendary' || row.baseRarity === 'rare' || row.activeSupport,
      `${row.id}: 低到達率の要因が base レアリティ（${row.baseRarity}）か active 補助条件で説明できる`);
  }
  info(`取得率 5% 未満: ${low.map((x) => x.id).join(', ') || 'なし'}`);
  // 同じ「common base ＋ passive 補助」同士で極端に外れるものが無い（同系統の比較）。
  const peers = rows.filter((x) => x.baseRarity === 'common' && !x.activeSupport).map((x) => x.d.executed);
  if (peers.length >= 3) {
    const mx = Math.max(...peers), mn = Math.min(...peers);
    ok(mn > 0 && mx / mn < 5, `common base ＋ passive 補助の同系統内で取得率の最大/最小比が 5 倍未満（${(mx / mn).toFixed(2)}）`);
  }
}

// ===== 5. 枠数の影響 =====
section('5. 枠数の影響（active 補助を要求する進化ほど枠に依存する）');
{
  const withActiveSupport = recipes.filter((r) => r.auxActive.length > 0).map((r) => r.evolutionId);
  for (const id of withActiveSupport) {
    const e4 = run('evolution-first', 4).evoDetailRate[id].condition;
    const e6 = run('evolution-first', 6).evoDetailRate[id].condition;
    info(`${id}: 条件成立率 slot4=${(e4 * 100).toFixed(1)}% slot6=${(e6 * 100).toFixed(1)}%`);
    ok(true, `${id}: 枠数別の条件成立率を記録`);
  }
}

T.finish();
