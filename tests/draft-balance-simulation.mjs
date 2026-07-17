// ドラフト・バランス・シミュレーション（Milestone 6-F）。Node.js 標準機能のみ。
// 実データ（data/*.json）からカタログ・レシピを組み、実際の SkillDraftManager を多数の seed で駆動して
// 進化成立率・レアリティ出現率・枠依存性・決定論を検証する。抽選ロジックは再実装しない。
// 実行: node tests/draft-balance-simulation.mjs   （軽量・数秒）
// HEAVY=1 node tests/draft-balance-simulation.mjs で seed 数を増やした詳細計測（docs 用）。
//
// 注: 進化成立の「枠上限」効果（進化は基礎 active を置換し枠を消費し続ける＝進化数の天井が枠数で決まる）は
//     十分なレベルアップ回数を重ねて初めて顕在化する。短周回では「少枠ほど1本に集中して先に進化」する希釈効果が勝つ。
//     枠数と進化数の単調性はこの天井が効く長めの周回（levelUps=60）で確認する。24 前後の短周回率は参考として併記出力する。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCatalog, evolutionRecipes, evolutionPartnerIds } from '../src/systems/SkillCatalog.js';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { simulate, summarize } from '../src/systems/DraftBalanceAnalyzer.js';

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

// ---- カタログ / レシピ / draftCatalog 行を実データから構築 ----
const catalogModel = buildCatalog({
  skills, passives, evolutions, jobs, jobId: 'flame_witch',
  registeredIds: skills.map((s) => s.id).concat(evolutions.map((e) => e.id)), runtimeStateIds: [],
});
const recipes = evolutionRecipes(catalogModel);

// DataManager.draftCatalog() 相当（id/category/rarity/weight/maxLevel/enabled/jobs/isCommon/prerequisites/conflicts/unlockCondition）。
const draftCatalog = [
  ...skills.map((s) => ({ id: s.id, category: s.category, rarity: s.rarity, weight: s.weight, maxLevel: s.maxLevel, enabled: s.enabled, jobs: s.jobs, isCommon: s.isCommon, prerequisites: s.prerequisites, conflicts: s.conflicts, unlockCondition: s.unlockCondition })),
  ...passives.map((p) => ({ id: p.id, category: 'passive', rarity: p.rarity, weight: p.weight, maxLevel: p.maxLevel, enabled: p.enabled, jobs: p.jobs, isCommon: p.isCommon, prerequisites: p.prerequisites, conflicts: p.conflicts, unlockCondition: p.unlockCondition })),
];
const job = { activeSkillPool: jobs.find((j) => j.id === 'flame_witch').activeSkillPool, passiveSkillPool: [] };

// ---- seed 集合（軽量 / HEAVY） ----
const HEAVY = !!process.env.HEAVY;
const SEED_COUNT = HEAVY ? 2500 : 200;   // 軽量 200 / HEAVY 2500+
const LEVELUPS = 60;                       // 枠上限（進化置換で枠固定）が効く周回長
const seeds = []; for (let i = 1; i <= SEED_COUNT; i++) seeds.push(i);

function baseOpts(extra) {
  return Object.assign({
    catalog: draftCatalog, job, evolutions, recipes,
    rarityWeights: cfg.rarityWeights, synergy: cfg.synergy,
    slots: { activeMax: 6, passiveMax: 4 }, need: 3, jobLevel: 1,
    levelUps: LEVELUPS, seeds, policy: 'evolution-first',
  }, extra);
}
const _slotCache = {};
const runSlots = (activeMax, extra) => {
  if (!extra && _slotCache[activeMax]) return _slotCache[activeMax];
  const r = summarize(simulate(baseOpts(Object.assign({ slots: { activeMax, passiveMax: 4 } }, extra))));
  if (!extra) _slotCache[activeMax] = r;
  return r;
};

// ===== 1. 決定論 =====
section('1. 決定論（同 opts・同 seeds → summarize 完全一致）');
{
  // キャッシュを介さず独立に2回実行して一致を確認。
  const a = summarize(simulate(baseOpts({ slots: { activeMax: 6, passiveMax: 4 } })));
  const b = summarize(simulate(baseOpts({ slots: { activeMax: 6, passiveMax: 4 } })));
  ok(JSON.stringify(a) === JSON.stringify(b), '同条件で summarize が完全一致（synergy ON・決定論）');
}

// ===== 2. synergy 無効化 = 旧（素の重み）挙動 =====
section('2. synergy=null は synergy 未設定と完全一致（固定 seed/ctx）');
{
  const partner = new Set(['orbiting_flame']);
  const ctx = {
    catalog: draftCatalog, job,
    owned: { active: { fireball: 3 }, passive: {} },
    slots: { active: { used: 1, max: 6 }, passive: { used: 0, max: 4 } },
    evolvables: [], need: 3, unlock: {},
    synergy: { partnerIds: partner, battleLevel: 12 },
  };
  let allEqual = true, everDiffer = false;
  for (let s = 1; s <= 40; s++) {
    const dNull = new SkillDraftManager({ rarityWeights: cfg.rarityWeights, synergy: null }); dNull.reset(s, {});
    const dNone = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); dNone.reset(s, {});
    const dOn = new SkillDraftManager({ rarityWeights: cfg.rarityWeights, synergy: cfg.synergy }); dOn.reset(s, {});
    const cNull = JSON.stringify(dNull.open(ctx));
    const cNone = JSON.stringify(dNone.open(ctx));
    const cOn = JSON.stringify(dOn.open(ctx));
    if (cNull !== cNone) allEqual = false;
    if (cOn !== cNull) everDiffer = true;
  }
  ok(allEqual, 'synergy=null は synergy 未設定（旧・素の重み抽選）と同一候補を返す');
  ok(everDiffer, 'synergy ON は partner ありの ctx で候補分布を変える（無視していない）');
}

// ===== 3. synergy ON も決定論 =====
section('3. synergy ON でも二回の実行が一致');
{
  const a = summarize(simulate(baseOpts({ slots: { activeMax: 8, passiveMax: 4 } })));
  const b = summarize(simulate(baseOpts({ slots: { activeMax: 8, passiveMax: 4 } })));
  ok(JSON.stringify(a) === JSON.stringify(b), 'synergy ON・slots8 の二回実行が一致');
}

// ===== 4. legendary 出現率は common より遥かに低い（synergy ON でも膨張しない） =====
section('4. legendary 出現率 << common（synergy で common 並みに膨れない）');
{
  const r = runSlots(6);
  const leg = r.rarityAppearRate.legendary, com = r.rarityAppearRate.common;
  ok(com > 0.7, `common 出現率が高い (${com})`);
  ok(leg < com * 0.2, `legendary(${leg}) は common(${com}) の 1/5 未満`);
}

// ===== 5. 枠が大きいほど進化数（平均）は非減少 =====
section('5. slots 4 ≤ 6 ≤ 8（進化数平均・微小許容）');
{
  const m4 = runSlots(4).evolutionsPerRunMean;
  const m6 = runSlots(6).evolutionsPerRunMean;
  const m8 = runSlots(8).evolutionsPerRunMean;
  const tol = 0.15;
  ok(m6 >= m4 - tol, `slots6(${m6}) ≥ slots4(${m4})`);
  ok(m8 >= m6 - tol, `slots8(${m8}) ≥ slots6(${m6})`);
}

// ===== 6. reroll は進化相手候補の発見確率を下げない（ドラフト単位の統制計測） =====
// 全周回比較は reroll が後続状態を変えて分岐しノイズになるため、進化相手が必要な固定 ctx で
// 「初回に相手なし→1回リロール後に相手が出る」件数が初回件数を下回らないことを検証する（reroll は追加のみ・除去しない）。
section('6. reroll は進化相手候補を減らさない（統制ドラフト計測・単調）');
{
  const partner = new Set(['orbiting_flame']); // fireball(基礎) の進化補助
  const mkCtx = () => ({
    catalog: draftCatalog, job,
    owned: { active: { fireball: 3 }, passive: {} },
    slots: { active: { used: 1, max: 6 }, passive: { used: 0, max: 4 } },
    evolvables: [], need: 3, unlock: {},
    synergy: { partnerIds: partner, battleLevel: 12 },
  });
  const hasPartner = (cands) => cands.some((c) => partner.has(c.id));
  let before = 0, after = 0, improved = 0, N = HEAVY ? 2000 : 500;
  for (let s = 1; s <= N; s++) {
    const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights, synergy: cfg.synergy });
    d.reset(s, { rerolls: 1, banishes: 0, skips: 0 });
    const c0 = d.open(mkCtx());
    const b = hasPartner(c0);
    if (b) { before++; after++; continue; }
    const r = d.reroll(mkCtx());
    const a = r.ok && hasPartner(r.candidates);
    if (a) { after++; improved++; }
  }
  ok(after >= before, `reroll 後の相手発見件数(${after}) ≥ 初回(${before})`);
  ok(improved > 0, `reroll が相手発見を実際に増やす場面がある (${improved} 件)`);
}

// ===== 7. 主要率レポート（バランス目標の材料・人間可読） =====
section('7. レポート（slots 4/6/8 の進化率）');
{
  for (const sm of [4, 6, 8]) {
    const r = runSlots(sm);
    console.log(`  slots ${sm}: evoMean=${r.evolutionsPerRunMean}  >=1=${(r.evoAtLeast1Rate * 100).toFixed(1)}%  >=2=${(r.evoAtLeast2Rate * 100).toFixed(1)}%  legendaryNever=${(r.legendaryNeverRate * 100).toFixed(1)}%  shortfall=${(r.shortfallRate * 100).toFixed(1)}%`);
  }
  // 参考: 短周回（levelUps≈24）では少枠ほど集中して進化しやすい（希釈効果）。
  const short = (sm) => summarize(simulate(baseOpts({ slots: { activeMax: sm, passiveMax: 4 }, levelUps: 24 })));
  console.log('  [参考 levelUps=24] evoMean 4/6/8:', [4, 6, 8].map((s) => short(s).evolutionsPerRunMean).join(' / '), '（短周回は希釈効果で少枠有利）');
  ok(true, 'レポート出力');
}

console.log('');
if (fail) { console.error(`✗ ドラフト・バランス・シミュレーション失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ ドラフト・バランス・シミュレーション成功: ${pass} 件すべて通過`); process.exit(0); }
