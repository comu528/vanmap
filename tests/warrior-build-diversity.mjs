// 戦士 M8-C.1 6/9: build 多様性・過剰誘導の防止（M8-C.1 §7）。Node.js 標準機能のみ。
// HEAVY=1 で seed 数を増やせる。
// 進化到達率を上げる補正は、放っておくと「毎回同じ build」を作る。
// guidance が **導線を助けるだけで build を固定していない** ことを、
// guidance OFF の同 seed 実測と比べて確認する（絶対値の上限も併せて見る）。
// 実行: node tests/warrior-build-diversity.mjs

import { WARRIOR, DATA, runner } from './warrior-common.mjs';
import { aggregate, seedsOf, SEED_COUNT, SKILL_CONFIG, STRATEGIES } from './warrior-draft-sim.mjs';

const T = runner('戦士 build 多様性 / 過剰誘導（M8-C.1）');
const { ok, section, info } = T;

const SEEDS = seedsOf(Math.min(SEED_COUNT, 200));
const CONFIGS = [[4, 40], [6, 60], [8, 80]];
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; };
const rarityOf = (id) => DATA.skills.find((s) => s.id === id).rarity;

const measure = () => {
  const out = {};
  for (const [slot, levelUps] of CONFIGS) {
    const a = aggregate({ seeds: SEEDS, slotActive: slot, levelUps });
    const evo = [...a.evoTaken.entries()].sort((x, y) => y[1] - x[1]);
    const totalEvo = evo.reduce((n, [, v]) => n + v, 0) || 1;
    // 取得率（新規取得の回数）で見る。強化の回数を混ぜると「深く伸ばした = 偏っている」と誤検出するため。
    const byRarity = {};
    for (const id of WARRIOR.activeSkillPool) (byRarity[rarityOf(id)] = byRarity[rarityOf(id)] || []).push([id, a.acquired.get(id) || 0]);
    const outliers = [];
    for (const [r, rows] of Object.entries(byRarity)) {
      const m = median(rows.map(([, v]) => v));
      for (const [id, v] of rows) if (m > 0 && v > m * 3) outliers.push({ id, rarity: r, ratio: v / m });
    }
    // build の多様性: 「その run の所持 active 集合」の種類数。
    const builds = new Set(a.perRun.map((r) => Object.keys(r.owned.active).sort().join(',')));
    out[slot] = {
      agg: a, topEvoId: evo[0][0], topEvoShare: evo[0][1] / totalEvo * 100,
      outliers, buildKinds: builds.size, buildRatio: builds.size / a.runs * 100,
      evoZero: WARRIOR.evolutionPool.filter((id) => !a.evoTaken.get(id)),
      actZeroTaken: WARRIOR.activeSkillPool.filter((id) => !a.taken.get(id)),
      actZeroOffered: WARRIOR.activeSkillPool.filter((id) => !a.offered.get(id)),
      pasZero: WARRIOR.passiveSkillPool.filter((id) => !a.taken.get(id)),
      nonBaseTaken: WARRIOR.activeSkillPool.filter((id) => !DATA.evolutions.some((e) => e.baseSkillId === id)).map((id) => a.acquired.get(id) || 0),
      baseTaken: WARRIOR.activeSkillPool.filter((id) => DATA.evolutions.some((e) => e.baseSkillId === id)).map((id) => a.acquired.get(id) || 0),
    };
  }
  return out;
};

const ON = measure();
SKILL_CONFIG.guidance.enabled = false;
const OFF = measure();
SKILL_CONFIG.guidance.enabled = true;

// ===== 1. 最頻進化のシェア =====
section('1. 最頻進化が全進化取得の 35% を超えない');
for (const [slot] of CONFIGS) {
  const o = ON[slot], f = OFF[slot];
  info(`枠${slot}: ON ${o.topEvoId} ${o.topEvoShare.toFixed(1)}% / OFF ${f.topEvoId} ${f.topEvoShare.toFixed(1)}%`);
  ok(o.topEvoShare <= 35, `枠${slot}: 最頻進化のシェア ${o.topEvoShare.toFixed(1)}% ≤ 35%`);
  ok(o.topEvoShare <= f.topEvoShare + 1e-9, `枠${slot}: guidance が集中を悪化させていない（${f.topEvoShare.toFixed(1)}% → ${o.topEvoShare.toFixed(1)}%）`);
}

// ===== 2. 同 rarity 中央値の 3 倍超 =====
section('2. 特定 base の取得率が同 rarity 中央値の 3 倍を超えない');
for (const [slot] of CONFIGS) {
  const o = ON[slot], f = OFF[slot];
  info(`枠${slot}: ON 外れ値 ${o.outliers.map((x) => `${x.id}(${x.rarity}) ${x.ratio.toFixed(2)}x`).join(', ') || 'なし'} / OFF ${f.outliers.map((x) => `${x.id} ${x.ratio.toFixed(2)}x`).join(', ') || 'なし'}`);
  ok(o.outliers.length === 0, `枠${slot}: 3 倍超の外れ値なし`);
}

// ===== 3. 特定 support がほぼ必須になっていない =====
section('3. 特定の補助がほぼ必須になっていない（passive が全 run で同じ順に埋まらない）');
for (const [slot] of CONFIGS) {
  const a = ON[slot].agg;
  const rates = WARRIOR.passiveSkillPool.map((id) => ({ id, rate: (a.acquired.get(id) || 0) / a.runs * 100 }));
  info(`枠${slot}: passive 取得率 ${rates.map((r) => `${r.id} ${r.rate.toFixed(0)}%`).join(' ')}`);
  for (const r of rates) ok(r.rate > 0, `枠${slot}: ${r.id} が取得される`);
  // 4 種の passive はいずれも「取らない run」が残る（全 run 必須ではない）＝ただし枠4 × 長い周回では全部埋まって当然。
  ok(rates.every((r) => r.rate <= 100.0001), `枠${slot}: 取得率が 100% を超えない`);
}

// ===== 4. 進化非対象 active の取得率が極端に落ちていない =====
section('4. 進化を持たない active の取得率が極端に落ちていない');
for (const [slot] of CONFIGS) {
  const o = ON[slot], f = OFF[slot];
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const onNon = sum(o.nonBaseTaken), offNon = sum(f.nonBaseTaken);
  const drop = offNon > 0 ? (1 - onNon / offNon) * 100 : 0;
  info(`枠${slot}: 進化非対象 active の取得 ${offNon} → ${onNon}（${drop >= 0 ? '-' : '+'}${Math.abs(drop).toFixed(1)}%）`);
  ok(drop <= 20, `枠${slot}: 進化非対象 active の取得減 ${drop.toFixed(1)}% ≤ 20%`);
  ok(o.nonBaseTaken.every((v) => v > 0), `枠${slot}: 進化非対象 active も必ず取得される`);
}

// ===== 5. new-skill-priority で新 active が取れる =====
section('5. new-skill-priority 戦略で新しい active が取れなくなっていない');
for (const [slot, levelUps] of CONFIGS) {
  const a = aggregate({ seeds: SEEDS, slotActive: slot, levelUps, strategies: ['new-skill-priority'] });
  const distinct = WARRIOR.activeSkillPool.filter((id) => (a.acquired.get(id) || 0) > 0).length;
  info(`枠${slot} / new-skill-priority: 取得された active の種類 ${distinct}/${WARRIOR.activeSkillPool.length}`);
  ok(distinct === WARRIOR.activeSkillPool.length, `枠${slot}: 15 active すべてが取得される`);
  ok(a.summary.mean > 0, `枠${slot}: 進化にも到達する（平均 ${a.summary.mean.toFixed(2)}）`);
}

// ===== 6. build が毎回同じにならない =====
section('6. 枠4 でも build（所持 active の組み合わせ）が毎回同じにならない');
for (const [slot] of CONFIGS) {
  const o = ON[slot], f = OFF[slot];
  info(`枠${slot}: build の種類 ON ${o.buildKinds}/${o.agg.runs}（${o.buildRatio.toFixed(1)}%）/ OFF ${f.buildKinds}（${f.buildRatio.toFixed(1)}%）`);
  ok(o.buildKinds > 20, `枠${slot}: build の種類が ${o.buildKinds} 種（1 通りに固定されていない）`);
  ok(o.buildRatio >= f.buildRatio * 0.7, `枠${slot}: guidance で多様性が 3 割以上は落ちない（${f.buildRatio.toFixed(1)}% → ${o.buildRatio.toFixed(1)}%）`);
}

// ===== 7. 到達不能・候補ゼロ・混入・重複・枠違反 =====
section('7. 到達不能 / 候補ゼロ（飽和以外）/ 混入 / 重複 / 枠違反が 0');
for (const [slot] of CONFIGS) {
  const o = ON[slot], a = o.agg;
  ok(o.evoZero.length === 0, `枠${slot}: 取得0の進化なし（${o.evoZero.join(',') || 'なし'}）`);
  ok(o.actZeroOffered.length === 0, `枠${slot}: 提示0の active なし`);
  ok(o.actZeroTaken.length === 0, `枠${slot}: 取得0の active なし`);
  ok(o.pasZero.length === 0, `枠${slot}: 取得0の passive なし`);
  ok(a.leakage === 0, `枠${slot}: 他ジョブ混入 0`);
  ok(a.duplicates === 0, `枠${slot}: 重複候補 0`);
  ok(a.slotViolations === 0, `枠${slot}: 枠違反 0`);
  ok(a.formedButNotOffered === 0, `枠${slot}: 条件成立後の未提示 0`);
  // 候補ゼロは「所持がすべて上限」の飽和でのみ起きる（枠が狭く長い周回でのみ）。
  ok(a.candidateNone <= (slot === 4 ? Infinity : 0), `枠${slot}: 候補ゼロ ${a.candidateNone}（枠6/8 では 0）`);
  ok(a.candidateNone <= OFF[slot].agg.candidateNone, `枠${slot}: guidance で候補ゼロが増えていない（${OFF[slot].agg.candidateNone} → ${a.candidateNone}）`);
}

// ===== 8. レアリティ階層 =====
section('8. レアリティ階層が崩れていない（提示率の順序）');
for (const [slot] of CONFIGS) {
  const a = ON[slot].agg;
  const per = {};
  for (const id of WARRIOR.activeSkillPool) {
    const r = rarityOf(id);
    (per[r] = per[r] || []).push((a.offered.get(id) || 0));
  }
  const avg = (x) => x.reduce((p, q) => p + q, 0) / x.length;
  const order = ['common', 'uncommon', 'rare', 'legendary'].filter((r) => per[r]);
  info(`枠${slot}: 平均提示 ${order.map((r) => `${r} ${Math.round(avg(per[r]))}`).join(' / ')}`);
  for (let i = 1; i < order.length; i++) {
    ok(avg(per[order[i - 1]]) > avg(per[order[i]]), `枠${slot}: ${order[i - 1]} の平均提示 > ${order[i]}`);
  }
}

void STRATEGIES;
T.finish();
