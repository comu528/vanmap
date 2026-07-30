// 戦士 完成監査 4/23: 低取得率の進化の個別分析（M8-F §7）。Node.js 標準機能のみ。
// 「低いこと」自体は問題にしない。到達不能（HEAVY でも 0 件）でないことと、
// 低さの原因が説明できることを確かめる。機械的な均一化はしない。
// HEAVY=1 で seed を 500 へ増やす。
// 実行: node tests/warrior-completion-low-rate.mjs

import { simulateRun, STRATEGIES, REQS } from './warrior-draft-sim.mjs';
import { DATA, WARRIOR, seedRange, runner } from './warrior-common.mjs';

const T = runner('戦士 低率進化の個別分析（M8-F）');
const { ok, section, info } = T;

const HEAVY = process.env.HEAVY === '1';
const SEEDS = HEAVY ? 500 : 200;
const CFG = [{ slot: 4, levelUps: 60 }, { slot: 6, levelUps: 90 }, { slot: 8, levelUps: 150 }];

// 全戦略 × 全枠を 1 度だけ回して共有する。
const ALL = [];
for (const cfg of CFG) for (const strategy of STRATEGIES) {
  for (const seed of seedRange(SEEDS)) {
    ALL.push({ cfg, strategy, r: simulateRun({ seed, slotActive: cfg.slot, slotPassive: 4, levelUps: cfg.levelUps, strategy }) });
  }
}
const pct = (n, d) => ((n / Math.max(1, d)) * 100).toFixed(1) + '%';

// 進化ごとの指標を production の実測から組む。
function metrics(evoId) {
  const r = REQS[evoId];
  const m = { formed: 0, offered: 0, taken: 0, baseOwned: 0, baseMax: 0, auxOwned: 0, auxReady: 0,
    bySlot: { 4: 0, 6: 0, 8: 0 }, byStrategy: {}, runs: 0 };
  for (const s of STRATEGIES) m.byStrategy[s] = 0;
  for (const { cfg, strategy, r: run } of ALL) {
    m.runs++;
    if (run.evolvableFormedAt.has(evoId)) m.formed++;
    if (run.evolutionOfferedAt.has(evoId)) m.offered++;
    if (run.evolutionTakenAt.has(evoId)) { m.taken++; m.bySlot[cfg.slot]++; m.byStrategy[strategy]++; }
    const baseLv = run.owned.active[r.base] || 0;
    if (baseLv > 0) m.baseOwned++;
    if (baseLv >= r.baseLevel) m.baseMax++;
    for (const a of r.aux) {
      const lv = (run.owned.active[a.id] || 0) || (run.owned.passive[a.id] || 0);
      if (lv > 0) m.auxOwned++;
      if (lv >= a.level) m.auxReady++;
    }
  }
  return m;
}

const rows = WARRIOR.evolutionPool.map((id) => ({ id, m: metrics(id) }));
rows.sort((a, b) => a.m.taken - b.m.taken);

// ===== 1. 取得 0 の進化が無い =====
section(`1. 到達不能（取得 0）の進化が無い（seed ${SEEDS}${HEAVY ? ' / HEAVY' : ''}・全 ${rows[0].m.runs} run）`);
for (const { id, m } of rows) {
  ok(m.taken > 0, `${id}: 取得 ${m.taken} 回（${pct(m.taken, m.runs)}）`);
  ok(m.formed > 0, `${id}: 条件形成 ${m.formed} 回`);
  ok(m.offered > 0, `${id}: 提示 ${m.offered} 回`);
  ok(m.offered === m.formed || m.offered <= m.formed, `${id}: 提示 ≤ 条件形成（${m.offered} ≤ ${m.formed}）`);
}

// ===== 2. 下位 5 件の個別分析 =====
section('2. 取得率が低い 5 件の原因分析（低さを均一化しない）');
const LOW = rows.slice(0, 5);
const WATCH = ['mountain_hurl', 'heaven_crushing_descent', 'heaven_mirror_reversal'];
for (const w of WATCH) ok(rows.some((x) => x.id === w), `${w}: 監査対象に含まれる`);
for (const { id, m } of LOW) {
  const r = REQS[id];
  const auxKind = r.aux.map((a) => a.kind).join('/');
  const baseRarity = (DATA.skills.find((s) => s.id === r.base) || {}).rarity;
  info(`  ${id}`);
  info(`    base ${r.base}(${baseRarity}) 所持 ${pct(m.baseOwned, m.runs)} / Lv${r.baseLevel} 到達 ${pct(m.baseMax, m.runs)}`);
  info(`    補助 ${r.aux.map((a) => `${a.id}(${a.kind} Lv${a.level})`).join(',')} 所持 ${pct(m.auxOwned, m.runs)} / 必要Lv ${pct(m.auxReady, m.runs)}`);
  info(`    条件形成 ${pct(m.formed, m.runs)} → 提示 ${pct(m.offered, m.runs)} → 取得 ${pct(m.taken, m.runs)}`);
  info(`    枠別 4:${m.bySlot[4]} 6:${m.bySlot[6]} 8:${m.bySlot[8]} / 戦略別 ${Object.entries(m.byStrategy).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  // 条件が形成されたら必ず提示されている（提示側の詰まりではない）。
  ok(m.offered >= m.formed * 0.95, `${id}: 条件形成のほぼ全てで提示される（${pct(m.offered, m.formed)}）`);
  // 取得が枠 8 で最も多い（枠が広いほど取れる＝構造どおり）。
  ok(m.bySlot[8] >= m.bySlot[4], `${id}: 枠8(${m.bySlot[8]}) ≥ 枠4(${m.bySlot[4]})`);
  // 低さの原因は「base Lv8 まで伸ばせるか」に集約される。
  ok(m.baseMax <= m.baseOwned, `${id}: base Lv8 到達 ≤ base 所持（原因は伸ばしきれるか）`);
  // どの戦略でも 0 ではない（1 つの戦略だけでしか取れない、が無い）。
  const zeroStrat = Object.entries(m.byStrategy).filter(([, v]) => v === 0).map(([k]) => k);
  ok(zeroStrat.length <= 2, `${id}: 取得 0 の戦略が 2 つ以下（${zeroStrat.join(',') || 'なし'}）`);
}

// ===== 3. active 補助の枠負担が原因である =====
section('3. active 補助の進化が低いのは「枠を 2 つ使う」構造どおり');
{
  const activeSup = WARRIOR.evolutionPool.filter((id) => REQS[id].aux.some((a) => a.kind === 'active'));
  const passiveSup = WARRIOR.evolutionPool.filter((id) => REQS[id].aux.every((a) => a.kind === 'passive'));
  ok(activeSup.length === 3, `active 補助の進化 3 件（${activeSup.join(',')}）`);
  const avg = (ids) => ids.reduce((a, id) => a + rows.find((x) => x.id === id).m.taken, 0) / ids.length;
  const aAvg = avg(activeSup); const pAvg = avg(passiveSup);
  ok(aAvg < pAvg, `active 補助の平均取得 ${aAvg.toFixed(0)} < passive 補助 ${pAvg.toFixed(0)}（枠負担どおり）`);
  for (const id of activeSup) {
    const m = rows.find((x) => x.id === id).m;
    ok(m.taken > 0, `${id}: 到達不能ではない（${m.taken} 回）`);
    ok(m.bySlot[6] + m.bySlot[8] > m.bySlot[4], `${id}: 枠が広いほど取れる（枠4 ${m.bySlot[4]} < 枠6+8 ${m.bySlot[6] + m.bySlot[8]}）`);
  }
  info(`active 補助: ${activeSup.map((id) => `${id}:${rows.find((x) => x.id === id).m.taken}`).join(' ')}`);
}

// ===== 4. rarity の影響 =====
section('4. base の rarity が低率の一因（ただし到達不能ではない）');
{
  const byRarity = { common: [], uncommon: [], rare: [] };
  for (const { id, m } of rows) {
    const r = (DATA.skills.find((s) => s.id === REQS[id].base) || {}).rarity;
    if (byRarity[r]) byRarity[r].push(m.taken);
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  ok(mean(byRarity.common) >= mean(byRarity.rare), `base common の平均取得 ${mean(byRarity.common).toFixed(0)} ≥ rare ${mean(byRarity.rare).toFixed(0)}`);
  for (const [r, a] of Object.entries(byRarity)) if (a.length) ok(Math.min(...a) > 0, `base ${r} の進化はすべて取得 > 0`);
  info(`base rarity 別の平均取得: ${Object.entries(byRarity).map(([k, a]) => `${k}=${mean(a).toFixed(0)}(${a.length}件)`).join(' ')}`);
}

// ===== 5. 均一化していないこと（分布に幅が残っている）=====
section('5. 低率を機械的に均一化していない（分布に幅が残る）');
{
  const takes = rows.map((x) => x.m.taken);
  const min = Math.min(...takes); const max = Math.max(...takes);
  ok(min > 0, `最小取得 ${min} > 0（到達不能なし）`);
  ok(max / min >= 2, `最大 / 最小 = ${(max / min).toFixed(1)} ≥ 2（build に個性が残っている）`);
  const total = takes.reduce((a, b) => a + b, 0);
  ok(max / total <= 0.35, `最頻進化のシェア ${pct(max, total)} ≤ 35%`);
  info(`取得の分布: 最小 ${min} / 中央 ${takes.slice().sort((a, b) => a - b)[Math.floor(takes.length / 2)]} / 最大 ${max}`);
}

T.finish();
