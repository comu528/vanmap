// 戦闘テレメトリ / バランス集計 / 警告生成の自動テスト（Milestone 6-F）。
// Node.js 標準機能のみ。純ロジックのみ（Phaser 非依存）。実行: node tests/combat-telemetry.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CombatTelemetry, TELEMETRY_CONSTANTS } from '../src/systems/CombatTelemetry.js';
import {
  emptyTelemetry, applyRun, mergeRunIntoSummary, pushRecentRun, pushDebugRun,
  exportJson, estimateBytes,
} from '../src/systems/RunBalanceSummary.js';
import { analyzeWarnings } from '../src/systems/BalanceWarnings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } }
function section(t) { console.log(t); }

// ---- ヘルパ: 決定論的な finalized run を作る ----
function makeRun({ runId = 'r1', debugRun = false, totalDamage = 1000, seed = 1 } = {}) {
  const t = new CombatTelemetry({ runId, seed, difficulty: 3, quality: 'high', speed: 1, jobId: 'flame_witch', jobLevelAtStart: 10, debugRun });
  return t;
}

// ===== 1. 通常 run と debugRun の分離 =====
section('1. 通常 run と debugRun の分離');
{
  const normal = makeRun({ runId: 'n1' });
  normal.noteSkillAcquired('fireball', 1, 0);
  normal.addSkillStat('fireball', { casts: 10, hits: 8, kills: 3, damage: 800 });
  normal.addActiveTime('fireball', 60000);
  normal.noteRunResult({ survivalSeconds: 300, victory: true, totalDamage: 800, battleLevel: 20 });
  const nFin = normal.finalize();

  const dbg = makeRun({ runId: 'd1', debugRun: true });
  dbg.noteSkillAcquired('meteor', 1, 0);
  dbg.addSkillStat('meteor', { casts: 5, damage: 5000 });
  dbg.addActiveTime('meteor', 60000);
  dbg.noteRunResult({ survivalSeconds: 300, totalDamage: 5000 });
  const dFin = dbg.finalize();

  let bt = emptyTelemetry();
  bt = applyRun(bt, nFin);
  bt = applyRun(bt, dFin);

  ok(bt.summaryBySkill.fireball && bt.summaryBySkill.fireball.runs === 1, '通常 run は summaryBySkill に入る');
  ok(!bt.summaryBySkill.meteor, 'debugRun のスキルは summaryBySkill に入らない');
  ok(bt.recentRuns.length === 1 && bt.recentRuns[0].run.runId === 'n1', 'debugRun は recentRuns に入らない');
  ok(bt.debugRuns.length === 1 && bt.debugRuns[0].run.runId === 'd1', 'debugRun は debugRuns に入る');
}

// ===== 2. recentRuns は 10 でキャップ（11本目で最古を落とす） =====
section('2. recentRuns のキャップ（最大10）');
{
  let bt = emptyTelemetry();
  for (let i = 0; i < 11; i++) {
    const r = makeRun({ runId: 'run' + i });
    r.noteRunResult({ totalDamage: 100 });
    bt = applyRun(bt, r.finalize());
  }
  ok(bt.recentRuns.length === 10, `recentRuns が 10 に制限される（実際 ${bt.recentRuns.length}）`);
  ok(bt.recentRuns[0].run.runId === 'run10', '最新が先頭');
  ok(!bt.recentRuns.some((r) => r.run.runId === 'run0'), '最古(run0)が落ちている');
}

// ===== 3. summaryBySkill の畳み込み（DPS = damage/activeSeconds、echo/clone 加算） =====
section('3. summaryBySkill の畳み込み');
{
  const r1 = makeRun({ runId: 'a' });
  r1.noteSkillAcquired('fireball', 1, 0);
  r1.addSkillStat('fireball', { casts: 4, damage: 600, kills: 2, echoCasts: 3, cloneCasts: 1 });
  r1.addActiveTime('fireball', 60000); // 60s -> DPS 10
  r1.noteRunResult({ totalDamage: 600 });
  const f1 = r1.finalize();
  ok(Math.abs(f1.skills.fireball.estimatedDps - 10) < 1e-9, 'DPS = damage/activeSeconds（600/60=10）');
  ok(f1.skills.fireball.echoCasts === 3 && f1.skills.fireball.cloneCasts === 1, 'echo/clone がスキル集計に入る');

  const r2 = makeRun({ runId: 'b' });
  r2.noteSkillAcquired('fireball', 1, 0);
  r2.addSkillStat('fireball', { casts: 2, damage: 1200, kills: 4, echoCasts: 1 });
  r2.addActiveTime('fireball', 60000); // DPS 20
  r2.noteRunResult({ totalDamage: 1200 });
  const f2 = r2.finalize();

  let bt = emptyTelemetry();
  bt = applyRun(bt, f1);
  bt = applyRun(bt, f2);
  const agg = bt.summaryBySkill.fireball;
  ok(agg.runs === 2 && agg.samples === 2, '2 run 分が畳み込まれる');
  ok(agg.totalDamage === 1800, 'totalDamage は和（600+1200=1800）');
  ok(agg.totalKills === 6, 'totalKills は和');
  ok(Math.abs(agg.totalDps - 15) < 1e-9, 'totalDps は走査平均（(10+20)/2=15）');
}

// ===== 4. defensiveValue（防御スキルで > 0・式どおり） =====
section('4. defensiveValue の算出');
{
  const r = makeRun({ runId: 'def' });
  r.noteSkillAcquired('flame_barrier', 1, 0);
  r.addDefensiveStat('flame_barrier', { blockedDamage: 500, healed: 100, absorbedBullets: 4, lethalAvoided: 2 });
  r.addActiveTime('flame_barrier', 60000);
  r.noteRunResult({ totalDamage: 0 });
  const f = r.finalize();
  const s = f.skills.flame_barrier;
  const expected = 500 + 100 + 4 * TELEMETRY_CONSTANTS.BULLET_DMG_EST + 2 * TELEMETRY_CONSTANTS.LETHAL_AVOID_EST;
  ok(s.defensiveValue === expected, `defensiveValue が式どおり（${s.defensiveValue}===${expected}）`);
  ok(s.defensiveValue > 0, 'defensiveValue > 0');
  ok(s.damageShare === 0, 'totalDamage=0 のとき damageShare は 0（NaN でない）');
}

// ===== 5. NaN/Infinity 入力は落とす =====
section('5. NaN/Infinity の除外');
{
  const r = makeRun({ runId: 'nan' });
  r.noteSkillAcquired('fireball', 1, 0);
  r.addSkillStat('fireball', { casts: NaN, damage: Infinity, kills: 3 });
  r.addSkillStat('fireball', { damage: 100 });
  r.addActiveTime('fireball', NaN);   // 無視
  r.addActiveTime('fireball', 10000); // 10s
  r.noteFrame(NaN); r.noteFrame(Infinity); r.noteFrame(16);
  r.noteRunResult({ totalDamage: 100 });
  const f = r.finalize();
  ok(f.skills.fireball.casts === 0, 'NaN の casts は無視される');
  ok(f.skills.fireball.damage === 100, 'Infinity の damage は無視され有効値のみ加算');
  ok(f.skills.fireball.kills === 3, '有効値は加算される');
  ok(Number.isFinite(f.skills.fireball.estimatedDps), 'estimatedDps は有限');
  ok(Number.isFinite(f.run.avgFps) && f.run.avgFps > 0, 'avgFps は有限（無効フレームを除外）');

  // applyRun 後も NaN/Infinity が保存されない
  let bt = applyRun(emptyTelemetry(), f);
  const json = exportJson(bt);
  ok(!/NaN|Infinity/.test(json), 'エクスポート JSON に NaN/Infinity を含まない');
}

// ===== 6. exportJson ラウンドトリップ =====
section('6. exportJson ラウンドトリップ');
{
  const r = makeRun({ runId: 'rt' });
  r.noteSkillAcquired('fireball', 1, 0);
  r.addSkillStat('fireball', { casts: 3, damage: 300 });
  r.addActiveTime('fireball', 30000);
  r.noteRunResult({ totalDamage: 300 });
  let bt = applyRun(emptyTelemetry(), r.finalize());
  const parsed = JSON.parse(exportJson(bt));
  ok(parsed.summaryBySkill.fireball.totalDamage === 300, 'JSON ラウンドトリップで集計を保持');
  ok(estimateBytes(bt) > 0 && Number.isFinite(estimateBytes(bt)), 'estimateBytes が正の有限値');
}

// ===== 7. applyRun は空/欠損 telemetry を許容 =====
section('7. 空/欠損 telemetry の許容');
{
  const r = makeRun({ runId: 'empty' });
  r.noteRunResult({ totalDamage: 50 });
  const f = r.finalize();
  const a = applyRun(undefined, f);
  const b = applyRun(null, f);
  const c = applyRun({}, f);
  ok(a && a.recentRuns.length === 1, 'undefined telemetry を許容');
  ok(b && b.recentRuns.length === 1, 'null telemetry を許容');
  ok(c && c.recentRuns.length === 1, '空オブジェクト telemetry を許容');
  // イミュータブル: 元は変わらない
  const orig = emptyTelemetry();
  const next = applyRun(orig, f);
  ok(orig.recentRuns.length === 0 && next.recentRuns.length === 1, 'applyRun はイミュータブル（元を変更しない）');
}

// ===== 8. 内部で throw する状況でも壊れない（ガベージ入力） =====
section('8. ガベージ入力でも corrupt しない');
{
  const good = applyRun(emptyTelemetry(), (() => { const r = makeRun({ runId: 'g' }); r.noteRunResult({ totalDamage: 1 }); return r.finalize(); })());
  // finalizedRun に循環参照を含めて exportJson/estimateBytes を throw させる
  const circular = { run: { runId: 'c', debugRun: false }, skills: {} };
  circular.self = circular; // JSON.stringify で throw
  const after = applyRun(good, circular);
  ok(after && typeof after === 'object' && Array.isArray(after.recentRuns), 'garbage 入力でもオブジェクトを返す');
  // 完全なガベージ
  const g2 = applyRun(good, 12345);
  ok(g2 && Array.isArray(g2.recentRuns), '数値 finalizedRun でも throw しない');
  const g3 = applyRun('not-an-object', null);
  ok(g3 && Array.isArray(g3.recentRuns), '文字列 telemetry でも throw しない');
}

// ===== 9. BalanceWarnings（代表ケース） =====
section('9. バランス警告');
{
  // summaryBySkill を直接組む（samples>=minSamples を満たすように）
  const summary = {
    strong: { runs: 6, samples: 6, totalDps: 1000, totalCasts: 30, totalKills: 20, meanDamageShare: 0.4, defensiveValue: 0, capReachedCount: 0, maxFinalLevel: 8 },
    mid1: { runs: 6, samples: 6, totalDps: 800, totalCasts: 30, totalKills: 15, meanDamageShare: 0.3, defensiveValue: 0, capReachedCount: 0, maxFinalLevel: 8 },
    mid2: { runs: 6, samples: 6, totalDps: 600, totalCasts: 30, totalKills: 12, meanDamageShare: 0.25, defensiveValue: 0, capReachedCount: 0, maxFinalLevel: 8 },
    weak: { runs: 6, samples: 6, totalDps: 5, totalCasts: 30, totalKills: 1, meanDamageShare: 0.001, defensiveValue: 0, capReachedCount: 0, maxFinalLevel: 8 },
    never: { runs: 6, samples: 6, totalDps: 600, totalCasts: 0, totalKills: 0, meanDamageShare: 0, defensiveValue: 0, capReachedCount: 0, maxFinalLevel: 0 },
    shield: { runs: 6, samples: 6, totalDps: 0, totalCasts: 30, totalKills: 0, meanDamageShare: 0, defensiveValue: 0, capReachedCount: 0, maxFinalLevel: 8 },
    lowsample: { runs: 2, samples: 2, totalDps: 0, totalCasts: 0, totalKills: 0, meanDamageShare: 0, defensiveValue: 0, capReachedCount: 0, maxFinalLevel: 0 },
  };
  const catalogInfo = {
    strong: { rarity: 'common', role: 'dps', maxLevel: 8 },
    mid1: { rarity: 'common', role: 'dps', maxLevel: 8 },
    mid2: { rarity: 'common', role: 'dps', maxLevel: 8 },
    weak: { rarity: 'common', role: 'dps', maxLevel: 8 },
    never: { rarity: 'common', role: 'dps', maxLevel: 8 },
    shield: { rarity: 'uncommon', role: 'defense', isDefensive: true, maxLevel: 8 },
    lowsample: { rarity: 'common', role: 'dps', maxLevel: 8 },
  };
  const thresholds = JSON.parse(readFileSync(join(DATA, 'balance-thresholds.json'), 'utf8')).warnings;
  const warns = analyzeWarnings(summary, thresholds, catalogInfo);
  const codesFor = (id) => warns.filter((w) => w.skillId === id).map((w) => w.code);

  ok(codesFor('never').includes('acquired-but-never-cast'), 'never-cast を検出');
  ok(codesFor('weak').includes('dps-below-median'), 'dps-below-median を検出');
  ok(codesFor('weak').includes('low-usage-at-max'), 'low-usage-at-max を検出');
  ok(codesFor('shield').includes('defensive-value-zero'), 'defensive-value-zero を検出');
  ok(!warns.some((w) => w.skillId === 'lowsample'), 'サンプル不足のスキルは警告しない');
  // 決定論的順序: severity(high→) 昇順
  const rank = { high: 0, medium: 1, low: 2, info: 3 };
  let sorted = true;
  for (let i = 1; i < warns.length; i++) {
    if (rank[warns[i - 1].severity] > rank[warns[i].severity]) sorted = false;
  }
  ok(sorted, '警告が severity 昇順にソートされている');

  // evolved-dps-drop: 進化後 < 進化前
  const s2 = {
    base_x: { runs: 6, samples: 6, totalDps: 500, totalCasts: 30, meanDamageShare: 0.2, defensiveValue: 0, capReachedCount: 0, maxFinalLevel: 8, totalKills: 5 },
    evo_x: { runs: 6, samples: 6, totalDps: 300, totalCasts: 30, meanDamageShare: 0.2, defensiveValue: 0, capReachedCount: 0, maxFinalLevel: 1, totalKills: 5 },
  };
  const ci2 = { base_x: { rarity: 'rare', role: 'dps', maxLevel: 8 }, evo_x: { rarity: 'legendary', role: 'dps', baseId: 'base_x', maxLevel: 1 } };
  const w2 = analyzeWarnings(s2, thresholds, ci2);
  ok(w2.some((w) => w.skillId === 'evo_x' && w.code === 'evolved-dps-drop'), 'evolved-dps-drop を検出');
}

// ===== 10. thresholds データファイルの検証 =====
section('10. balance-thresholds.json の検証');
{
  const raw = readFileSync(join(DATA, 'balance-thresholds.json'), 'utf8');
  const j = JSON.parse(raw);
  ok(j.version >= 1, 'version が 1 以上');
  const w = j.warnings, tel = j.telemetry;
  const posFinite = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;
  ok(posFinite(w.minSamples) && posFinite(w.dpsLowPct) && posFinite(w.dpsHighPct)
    && posFinite(w.lowUsageDamageShare) && posFinite(w.capReachedPerRun) && posFinite(w.defensiveValueEpsilon),
    'warnings の各閾値が正の有限値');
  ok(posFinite(tel.maxRecentRuns) && posFinite(tel.maxDebugRuns) && posFinite(tel.maxSummarySkills) && posFinite(tel.softMaxBytes),
    'telemetry の各上限が正の有限値');
  ok(w.dpsHighPct > w.dpsLowPct, 'dpsHighPct > dpsLowPct');
}

// ===== 結果 =====
console.log('');
if (fail) { console.error(`✗ 戦闘テレメトリテスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ 戦闘テレメトリテスト成功: ${pass} 件すべて通過`); process.exit(0); }
