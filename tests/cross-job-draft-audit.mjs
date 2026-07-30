// M9-A 横断監査 7/25: 3 ジョブの抽選監査。Node.js 標準機能のみ。
// production の SkillDraftManager / SeededRandom / SkillCatalog / poolEligibility /
// 実 rarity / 実 guidance / 実 pity / 実 synergy をそのまま駆動する（Math.random 不使用・profile 不変）。
//
// しきい値について:
//   - 戦士は M8-C.1 完成しきい値（本文どおり）をそのまま適用する（下げない）。
//   - 火 / 氷の完成しきい値は各 completion スイート（M8-A / M7-E）が 5 戦略合算で保持している。
//     ここは**単一戦略（evolution-first）での横断回帰フロア**で、completion しきい値の代替ではない
//     （フロア値は 2026-07 の実測から余裕を持って下に置いた回帰検知線。docs/cross-job-system-audit.md 参照）。
// 実行: node tests/cross-job-draft-audit.mjs（HEAVY=1 で 500 seed）
import { JOB_IDS, HEAVY, runner, simDraft, poolsOf } from './cross-job-common.mjs';

const T = runner('3 ジョブ抽選監査（M9-A）');
const { ok, section, info } = T;
const SEEDS = HEAVY ? 500 : 200;

// [job][slot] → { avg, atLeast1(%), zero(%) } の下限 / 上限。
const FLOOR = {
  warrior: { 4: { avg: 1.0, ge1: 80, zeroMax: 20 }, 6: { avg: 1.7, ge1: 95, ge2: 60 }, 8: { avg: 1.8, ge1: 95, ge2: 65 } },
  flame_witch: { 4: { avg: 1.0, ge1: 80, zeroMax: 20 }, 6: { avg: 1.6, ge1: 90 }, 8: { avg: 1.8, ge1: 92 } },
  frost_mage: { 4: { avg: 2.0, ge1: 95, zeroMax: 5 }, 6: { avg: 2.5, ge1: 95 }, 8: { avg: 2.0, ge1: 95 } },
};

for (const jobId of JOB_IDS) {
  for (const slot of [4, 6, 8]) {
    section(`${jobId} / active 枠 ${slot}（${SEEDS} seed × level-up 60・evolution-first）`);
    const evos = []; let bad = 0, unsat = 0; const builds = new Set();
    const offered = new Set(); const taken = new Set(); let formedNotOffered = 0;
    const evoTaken = new Map();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = simDraft(jobId, { seed, slotActive: slot, levelUps: 60 });
      evos.push(r.evolutions);
      bad += r.leakage + r.duplicates + r.slotViolations;
      unsat += r.unsaturatedNone;
      builds.add(r.buildKey);
      for (const id of r.offered) offered.add(id);
      for (const id of r.taken) taken.add(id);
      for (const id of r.evolved) evoTaken.set(id, (evoTaken.get(id) || 0) + 1);
      formedNotOffered += r.formedNotOffered;
    }
    const pct = (n) => (n / SEEDS) * 100;
    const avg = evos.reduce((a, b) => a + b, 0) / SEEDS;
    const ge = (n) => pct(evos.filter((x) => x >= n).length);
    const zero = pct(evos.filter((x) => x === 0).length);
    info(`平均 ${avg.toFixed(2)} / 0個 ${zero.toFixed(1)}% / ≥1 ${ge(1).toFixed(1)}% / ≥2 ${ge(2).toFixed(1)}% / ≥3 ${ge(3).toFixed(1)}% / build ${builds.size}/${SEEDS}`);
    ok(bad === 0, `leakage / duplicate / slot violation = 0（${bad}）`);
    ok(unsat === 0, `飽和以外の候補ゼロ = 0（${unsat}）`);
    const f = FLOOR[jobId][slot];
    ok(avg >= f.avg, `平均進化数 ${avg.toFixed(2)} ≥ ${f.avg}`);
    ok(ge(1) >= f.ge1, `進化 1 個以上 ${ge(1).toFixed(1)}% ≥ ${f.ge1}%`);
    if (f.ge2 != null) ok(ge(2) >= f.ge2, `進化 2 個以上 ${ge(2).toFixed(1)}% ≥ ${f.ge2}%`);
    if (f.zeroMax != null) ok(zero <= f.zeroMax, `進化 0 個 ${zero.toFixed(1)}% ≤ ${f.zeroMax}%`);
    ok(builds.size >= SEEDS * 0.8, `build 多様性 ${builds.size}/${SEEDS} ≥ 80%（均一化していない）`);
    // 最頻進化シェア（過剰誘導なし）。
    if (evoTaken.size > 0) {
      const total = [...evoTaken.values()].reduce((a, b) => a + b, 0);
      const top = [...evoTaken.entries()].sort((a, b) => b[1] - a[1])[0];
      ok(top[1] / total <= 0.35, `最頻進化シェア ${(top[1] / total * 100).toFixed(1)}% ≤ 35%（${top[0]}）`);
    }
  }
  // 枠 8 全体で: 提示 0 の active / passive が無い（プール全体が抽選に出る）。
  section(`${jobId}: 提示 / 取得の網羅（枠 8・${SEEDS} seed 合算）`);
  {
    const p = poolsOf(jobId);
    const offered = new Set(); const taken = new Set();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = simDraft(jobId, { seed, slotActive: 8, levelUps: 60 });
      for (const id of r.offered) offered.add(id);
      for (const id of r.taken) taken.add(id);
    }
    const noOffer = [...p.active, ...p.passive].filter((id) => !offered.has(id));
    ok(noOffer.length === 0, `提示 0 の active / passive が 0 件（${noOffer.join(',') || 'なし'}）`);
    info(`提示 ${offered.size} 種 / 取得 ${taken.size} 種`);
  }
}

T.finish();
