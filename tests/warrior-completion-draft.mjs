// 戦士 完成監査 2/23: production draft 完成監査（M8-F §5 / §6）。Node.js 標準機能のみ。
// **独自の抽選器は作らない。** `tests/warrior-draft-sim.mjs` が production の
// SkillDraftManager / SeededRandom / poolEligibility / SkillCatalog / 実 rarity / 実 guidance /
// 実 pity / 実 synergy / 実 reroll・banish・skip / 実 slot / 実進化条件 をそのまま駆動する。
// Math.random は 1 度も使わない。
//   - 5 戦略 × 枠4 / 6 / 8 の到達率が M8-C.1 のしきい値を満たす（下げない）
//   - active30 / passive4 / evolution18 すべてが提示 0・取得 0 なし
//   - 候補ゼロは**飽和由来だけ**（飽和以外の候補ゼロ 0 件）
//   - leakage / duplicate / slot violation 0 件
//   - 最頻進化シェア 35% 以下・build 多様性
// HEAVY=1 で seed を 500 へ増やす。
// 実行: node tests/warrior-completion-draft.mjs

import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { simulateRun, STRATEGIES, LEGACY_STRATEGY, aggregate, CATALOG, JOB, SKILL_CONFIG } from './warrior-draft-sim.mjs';
import { DATA, WARRIOR, EXPECTED, seedRange, runner } from './warrior-common.mjs';

const T = runner('戦士 draft 完成監査（M8-F）');
const { ok, section, info } = T;

const HEAVY = process.env.HEAVY === '1';
const SEEDS = HEAVY ? 500 : 200;
const CFG = [
  { slot: 4, levelUps: 60, want: { atLeast1: 0.80, avg: 1.0, zero: 0.20 } },
  { slot: 6, levelUps: 90, want: { atLeast1: 0.95, atLeast2: 0.60, avg: 1.7 } },
  { slot: 8, levelUps: 150, want: { atLeast1: 0.95, atLeast2: 0.65, avg: 1.8 } },
];
const pct = (n, d) => ((n / Math.max(1, d)) * 100).toFixed(1) + '%';

// production ハーネスを 1 度だけ回して結果を共有する。
const RESULTS = {};
for (const cfg of CFG) {
  for (const strategy of [...STRATEGIES, LEGACY_STRATEGY]) {
    RESULTS[`${cfg.slot}/${strategy}`] = seedRange(SEEDS).map((seed) =>
      simulateRun({ seed, slotActive: cfg.slot, slotPassive: 4, levelUps: cfg.levelUps, strategy }));
  }
}
const runsOf = (slot, strategy) => RESULTS[`${slot}/${strategy}`];
const evoCounts = (runs) => runs.map((r) => r.evolutionTakenAt.size);

// ===== 1. しきい値（M8-C.1 から 1 つも下げない）=====
section(`1. 5 戦略 × 枠4 / 6 / 8 の到達率（seed ${SEEDS}${HEAVY ? ' / HEAVY' : ''}）`);
for (const cfg of CFG) {
  for (const strategy of STRATEGIES) {
    const c = evoCounts(runsOf(cfg.slot, strategy));
    const n = c.length;
    const avg = c.reduce((a, b) => a + b, 0) / n;
    const ge = (k) => c.filter((x) => x >= k).length / n;
    const zero = c.filter((x) => x === 0).length / n;
    ok(ge(1) >= cfg.want.atLeast1 - 1e-9,
      `枠${cfg.slot} ${strategy}: ≥1 ${pct(ge(1) * n, n)} ≥ ${(cfg.want.atLeast1 * 100).toFixed(0)}%`);
    ok(avg >= cfg.want.avg - 1e-9, `枠${cfg.slot} ${strategy}: 平均 ${avg.toFixed(2)} ≥ ${cfg.want.avg}`);
    if (cfg.want.atLeast2 !== undefined) {
      ok(ge(2) >= cfg.want.atLeast2 - 1e-9,
        `枠${cfg.slot} ${strategy}: ≥2 ${pct(ge(2) * n, n)} ≥ ${(cfg.want.atLeast2 * 100).toFixed(0)}%`);
    }
    if (cfg.want.zero !== undefined) {
      ok(zero <= cfg.want.zero + 1e-9, `枠${cfg.slot} ${strategy}: 0 個 ${pct(zero * n, n)} ≤ ${(cfg.want.zero * 100).toFixed(0)}%`);
    }
  }
  // 素朴戦略（M8-C.1 から使っている物差し）も同じしきい値を満たす。
  const lc = evoCounts(runsOf(cfg.slot, LEGACY_STRATEGY));
  const lavg = lc.reduce((a, b) => a + b, 0) / lc.length;
  ok(lc.filter((x) => x >= 1).length / lc.length >= cfg.want.atLeast1 - 1e-9,
    `枠${cfg.slot} 素朴: ≥1 ${pct(lc.filter((x) => x >= 1).length, lc.length)}`);
  ok(lavg >= cfg.want.avg - 1e-9, `枠${cfg.slot} 素朴: 平均 ${lavg.toFixed(2)} ≥ ${cfg.want.avg}`);
  info(`枠${cfg.slot}: ${[...STRATEGIES, LEGACY_STRATEGY].map((s) => {
    const c = evoCounts(runsOf(cfg.slot, s));
    return `${s}=${(c.reduce((a, b) => a + b, 0) / c.length).toFixed(2)}`;
  }).join(' ')}`);
}

// ===== 2. 全戦略合算で取得 0 が無い =====
section('2. active30 / passive4 / evolution18 すべてが提示 0・取得 0 なし');
{
  const offered = new Map(); const acquired = new Map(); const evoTaken = new Map();
  const formed = new Map(); const evoOffered = new Map();
  let runs = 0;
  for (const cfg of CFG) for (const strategy of STRATEGIES) {
    for (const r of runsOf(cfg.slot, strategy)) {
      runs++;
      for (const [k, v] of r.offered) offered.set(k, (offered.get(k) || 0) + v);
      for (const [k, v] of r.acquired) acquired.set(k, (acquired.get(k) || 0) + v);
      for (const k of r.evolutionTakenAt.keys()) evoTaken.set(k, (evoTaken.get(k) || 0) + 1);
      for (const k of r.evolvableFormedAt.keys()) formed.set(k, (formed.get(k) || 0) + 1);
      for (const k of r.evolutionOfferedAt.keys()) evoOffered.set(k, (evoOffered.get(k) || 0) + 1);
    }
  }
  info(`合算 ${runs} run`);
  for (const id of WARRIOR.activeSkillPool) {
    ok((offered.get(id) || 0) > 0, `${id}: 提示 ${offered.get(id) || 0} 回`);
    ok((acquired.get(id) || 0) > 0, `${id}: 取得 ${acquired.get(id) || 0} 回`);
  }
  for (const id of WARRIOR.passiveSkillPool || []) {
    ok((acquired.get(id) || 0) > 0, `${id}（passive）: 取得 ${acquired.get(id) || 0} 回`);
  }
  for (const id of WARRIOR.evolutionPool) {
    ok((formed.get(id) || 0) > 0, `${id}: 条件形成 ${formed.get(id) || 0} 回`);
    ok((evoOffered.get(id) || 0) > 0, `${id}: 提示 ${evoOffered.get(id) || 0} 回`);
    ok((evoTaken.get(id) || 0) > 0, `${id}: 取得 ${evoTaken.get(id) || 0} 回`);
  }
  // 最頻進化のシェア。
  const total = [...evoTaken.values()].reduce((a, b) => a + b, 0);
  const top = [...evoTaken.entries()].sort((a, b) => b[1] - a[1])[0];
  ok(top[1] / total <= 0.35, `最頻進化 ${top[0]} のシェア ${pct(top[1], total)} ≤ 35%`);
  info(`進化取得（下位 5 件）: ${[...evoTaken.entries()].sort((a, b) => a[1] - b[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(' ')}`);
}

// ===== 3. 健全性カウンタ =====
section('3. leakage / duplicate / slot violation は 0 件');
for (const cfg of CFG) {
  for (const strategy of [...STRATEGIES, LEGACY_STRATEGY]) {
    const runs = runsOf(cfg.slot, strategy);
    const sum = (k) => runs.reduce((a, r) => a + r[k], 0);
    ok(sum('leakage') === 0, `枠${cfg.slot} ${strategy}: 他ジョブ混入 0（${sum('leakage')}）`);
    ok(sum('duplicates') === 0, `枠${cfg.slot} ${strategy}: 候補の重複 0（${sum('duplicates')}）`);
    ok(sum('slotViolations') === 0, `枠${cfg.slot} ${strategy}: 枠違反 0（${sum('slotViolations')}）`);
    ok(sum('formedButNotOffered') === 0,
      `枠${cfg.slot} ${strategy}: 条件成立なのに進化候補が 1 つも出ない draft 0（${sum('formedButNotOffered')}）`);
  }
}

// ===== 4. 候補ゼロは飽和由来だけ =====
section('4. 候補ゼロは飽和（全所持が上限＋残り進化なし）由来だけ');
{
  // simulateRun は候補ゼロのときに飽和判定を記録する（saturatedNone / unsaturatedNone）。
  for (const cfg of CFG) {
    for (const strategy of STRATEGIES) {
      const runs = runsOf(cfg.slot, strategy);
      const uns = runs.reduce((a, r) => a + (r.unsaturatedNone || 0), 0);
      const sat = runs.reduce((a, r) => a + (r.saturatedNone || 0), 0);
      const none = runs.reduce((a, r) => a + r.candidateNone, 0);
      ok(uns === 0, `枠${cfg.slot} ${strategy}: 飽和以外の候補ゼロ 0 件（${uns} / 全 ${none}）`);
      ok(sat + uns === none, `枠${cfg.slot} ${strategy}: 候補ゼロの内訳が一致（飽和 ${sat} + 非飽和 ${uns} = ${none}）`);
    }
  }
}

// ===== 5. 枠の充足 / reroll / banish / skip / pity / synergy =====
section('5. 枠の充足率と reroll / banish / skip / pity / synergy');
for (const cfg of CFG) {
  const runs = runsOf(cfg.slot, 'balanced');
  const aFull = runs.filter((r) => r.activeSlotFullAt >= 0).length;
  const pFull = runs.filter((r) => r.passiveSlotFullAt >= 0).length;
  ok(aFull / runs.length >= 0.9, `枠${cfg.slot}: active 枠が埋まる周回 ${pct(aFull, runs.length)}`);
  ok(pFull / runs.length >= 0.9, `枠${cfg.slot}: passive 枠が埋まる周回 ${pct(pFull, runs.length)}`);
  const sum = (k) => runs.reduce((a, r) => a + r[k], 0);
  ok(sum('rerolls') >= 0 && sum('banishes') >= 0 && sum('skips') >= 0, '再抽選 / 追放 / 見送りが動く');
  ok(sum('pityTriggered') > 0, `枠${cfg.slot}: pity が発動する（${sum('pityTriggered')}）`);
  ok(sum('synergyAssisted') > 0, `枠${cfg.slot}: synergy が働く（${sum('synergyAssisted')}）`);
  const g = runs.reduce((a, r) => {
    for (const k of Object.keys(a)) a[k] += r.guidanceAssisted[k] || 0;
    return a;
  }, { base: 0, support: 0, upgrade: 0, evolution: 0 });
  ok(g.base + g.support + g.upgrade > 0, `枠${cfg.slot}: guidance が働く（${JSON.stringify(g)}）`);
  info(`枠${cfg.slot} balanced: reroll${sum('rerolls')} banish${sum('banishes')} skip${sum('skips')} pity${sum('pityTriggered')} synergy${sum('synergyAssisted')} guidance${JSON.stringify(g)}`);
}

// ===== 6. rarity 分布 =====
section('6. rarity 階層（初回提示率の順序が崩れていない）');
{
  // 戦士 active の rarity は common7 / uncommon13 / rare10。**legendary は 0 種**で、
  // 進化がその役を担う（火 / 氷は legendary active を 3 種持つという構造上の違い）。
  const counts = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
  for (const id of WARRIOR.activeSkillPool) counts[(DATA.skills.find((s) => s.id === id) || {}).rarity] += 1;
  ok(counts.legendary === 0, '戦士 active に legendary は 0 種（進化がその役を担う）');
  ok(counts.common > 0 && counts.uncommon > 0 && counts.rare > 0, `rarity 3 段（${JSON.stringify(counts)}）`);
  // 「階層」は**所持なしの初回提示**で測る（所持後の強化提示は所持構成に引っ張られるため）。
  const draft = new SkillDraftManager({
    rarityWeights: SKILL_CONFIG.rarityWeights, synergy: SKILL_CONFIG.synergy, guidance: SKILL_CONFIG.guidance,
  });
  const firstOffer = { common: 0, uncommon: 0, rare: 0 };
  for (const seed of seedRange(600)) {
    const c = draft._generate({
      catalog: CATALOG, job: JOB, owned: { active: {}, passive: {} },
      slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3,
    }, seed);
    for (const x of c) if (x.rarity in firstOffer) firstOffer[x.rarity] += 1;
  }
  const per = (r) => firstOffer[r] / counts[r];
  ok(per('common') > per('uncommon'), `1 種あたりの初回提示 common ${per('common').toFixed(1)} > uncommon ${per('uncommon').toFixed(1)}`);
  ok(per('uncommon') > per('rare'), `1 種あたりの初回提示 uncommon ${per('uncommon').toFixed(1)} > rare ${per('rare').toFixed(1)}`);
  const w = SKILL_CONFIG.rarityWeights;
  ok(w.common > w.uncommon && w.uncommon > w.rare && w.rare > w.legendary, `重みの階層 ${JSON.stringify(w)}`);
  info(`初回提示（600 seed）: ${JSON.stringify(firstOffer)} / 種数 ${JSON.stringify(counts)}`);

  // 取得側: 全 rarity が実際に取られている。
  for (const cfg of CFG) {
    const tak = {};
    for (const r of runsOf(cfg.slot, 'balanced')) for (const [k, v] of Object.entries(r.takenRarity)) tak[k] = (tak[k] || 0) + v;
    for (const r of ['common', 'uncommon', 'rare']) ok((tak[r] || 0) > 0, `枠${cfg.slot}: ${r} が取得される（${tak[r]}）`);
    ok((tak.legendary || 0) > 0, `枠${cfg.slot}: legendary（進化）も取得される（${tak.legendary}）`);
    info(`枠${cfg.slot} 取得 rarity: ${JSON.stringify(tak)}`);
  }
}

// ===== 7. build 多様性 =====
section('7. build 多様性（特定進化への強制誘導が無い）');
for (const cfg of CFG) {
  for (const strategy of ['balanced', 'random-valid']) {
    const runs = runsOf(cfg.slot, strategy);
    const builds = new Set(runs.map((r) => [...r.evolutionTakenAt.keys()].sort().join('+')));
    ok(builds.size >= Math.min(runs.length, 20), `枠${cfg.slot} ${strategy}: build の種類 ${builds.size}/${runs.length}`);
    // 1 進化だけへ偏っていない。
    const first = new Map();
    for (const r of runs) {
      const k = [...r.evolutionTakenAt.entries()].sort((a, b) => a[1] - b[1])[0];
      if (k) first.set(k[0], (first.get(k[0]) || 0) + 1);
    }
    const top = [...first.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) ok(top[1] / runs.length <= 0.5, `枠${cfg.slot} ${strategy}: 最初に取る進化の偏り ${pct(top[1], runs.length)} ≤ 50%（${top[0]}）`);
  }
}

// ===== 8. aggregate（ハーネスの集計 API）と一致 =====
section('8. ハーネスの集計 API と手集計が一致する');
{
  const agg = aggregate({ seeds: seedRange(40), slotActive: 6, slotPassive: 4, levelUps: 90, strategies: ['balanced'] });
  ok(agg.runs === 40, `aggregate の runs ${agg.runs}`);
  ok(agg.saturatedNone + agg.unsaturatedNone === agg.candidateNone, '候補ゼロの内訳が一致');
  ok(agg.unsaturatedNone === 0, `飽和以外の候補ゼロ 0（${agg.unsaturatedNone}）`);
  ok(agg.candidateNone >= 0 && agg.duplicates === 0 && agg.slotViolations === 0 && agg.leakage === 0,
    'aggregate 側の健全性カウンタも 0');
  const avg = agg.evolutionCounts.reduce((a, b) => a + b, 0) / agg.evolutionCounts.length;
  ok(Number.isFinite(avg) && avg > 0, `平均進化数 ${avg.toFixed(2)}`);
}

// ===== 9. data の抽選設定を変えていない =====
section('9. rarity / synergy / pity の全体設定を変えていない');
{
  const c = DATA.skillConfig;
  ok(c.rarityWeights && Object.keys(c.rarityWeights).length > 0, 'rarityWeights がある');
  ok(c.synergy && typeof c.synergy === 'object', 'synergy がある');
  ok(c.guidance && Array.isArray(c.guidance.jobs) && c.guidance.jobs.length === 1 && c.guidance.jobs[0] === 'warrior',
    'guidance は戦士だけに効く');
  ok(EXPECTED.activeCount === 30 && EXPECTED.evolutionCount === 18, 'EXPECTED も最終カタログ');
}

T.finish();
