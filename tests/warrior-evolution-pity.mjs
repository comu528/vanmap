// 戦士 M8-C.1 3/9: 進化導線 pity（M8-C.1 §3）。Node.js 標準機能のみ。
// 既存 pity（M6-F の draftsSinceProgress・進化成立でしかリセットされない）だけでは
// 「基礎 Lv8 まで伸びない」戦士の詰まりを救えないため、進化導線用の stall を追加した。
//   - 進展（進化元の取得/強化・必要補助の取得/強化・進化取得）でリセットされる
//   - 一定ドラフト進まなければ段階的に補正が強まり、合成上限で必ず頭打ちになる
//   - save / reload で pity をリセットして稼げない（stall を保存する）
//   - RNG 消費は 1 も増えない（重みだけを変える）
// 実行: node tests/warrior-evolution-pity.mjs

import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { WARRIOR, draftCatalog, jobPools, runner, readSrc } from './warrior-common.mjs';
import { GUIDANCE_RECIPES, SKILL_CONFIG, simulateRun, seedsOf, LEGACY_STRATEGY } from './warrior-draft-sim.mjs';

const T = runner('戦士 進化導線 pity（M8-C.1）');
const { ok, section, info } = T;

const G = SKILL_CONFIG.guidance;
const P = G.pity;
const catalog = draftCatalog();
const mk = () => new SkillDraftManager({ rarityWeights: SKILL_CONFIG.rarityWeights, synergy: SKILL_CONFIG.synergy, guidance: G });
const ctxOf = (jobId, owned, slotMax = 4) => ({
  catalog, job: jobPools(jobId), owned,
  slots: { active: { used: Object.keys(owned.active).length, max: slotMax }, passive: { used: Object.keys(owned.passive).length, max: 4 } },
  evolvables: [], need: 3, unlock: { highestClearedDifficulty: 0 },
  synergy: { partnerIds: new Set(), battleLevel: 20 },
  jobId, evolutionRecipes: GUIDANCE_RECIPES,
});
const R = GUIDANCE_RECIPES[0];
const ownedBase = () => ({ active: { [R.baseSkillId]: 4 }, passive: {} });
const multOf = (d, owned) => {
  const pool = d._eligible(ctxOf('warrior', owned), d._index(catalog), new Set());
  return pool.find((c) => c.id === R.baseSkillId && c.kind === 'up_active')?.guidanceMult || 1;
};

// ===== 1. 既存 pity を壊していない =====
section('1. 既存 pity（M6-F の draftsSinceProgress）はそのまま残っている');
{
  const src = readSrc('src/systems/SkillDraftManager.js');
  ok(/draftsSinceProgress/.test(src), 'draftsSinceProgress が残っている');
  ok(/noProgressDraftThreshold/.test(src), '既存 synergy の pity 条件が残っている');
  const d = mk();
  d.open(ctxOf('warrior', ownedBase()));
  ok(d.draftsSinceProgress === 1, `既存 pity も従来どおり進む（${d.draftsSinceProgress}）`);
  d.markProgress();
  ok(d.draftsSinceProgress === 0 && d.guidanceStall === 0, '進化成立で両方リセットされる');
}

// ===== 2. stall が進み、閾値を超えたら段階的に強まる =====
section('2. 進展が無いと stall が進み、閾値を超えてから段階的に補正が強まる');
{
  const d = mk();
  const owned = ownedBase();
  ok(d.guidanceStall === 0 && d.guidancePityStep() === 0, '初期状態では pity 段 0');
  const seq = [];
  for (let i = 0; i < P.threshold + 6; i++) {
    d.open(ctxOf('warrior', owned));
    seq.push({ stall: d.guidanceStall, step: d.guidancePityStep(), mult: multOf(d, owned) });
    d.resolvePick();
  }
  const atStall = (n) => seq.find((x) => x.stall === n);
  ok(atStall(P.threshold).step === 0, `閾値ちょうど（stall=${P.threshold}）ではまだ発動しない`);
  ok(atStall(P.threshold + 1).step === 1, `閾値を 1 超えたら段 1（stall=${P.threshold + 1}）`);
  ok(atStall(P.threshold + 2).step === 2, `さらに 1 進めば段 2`);
  for (let i = 1; i < seq.length; i++) {
    ok(seq[i].mult >= seq[i - 1].mult - 1e-9, `段が進むほど補正は下がらない（${seq[i - 1].mult.toFixed(3)} → ${seq[i].mult.toFixed(3)}）`);
  }
  ok(seq[seq.length - 1].mult > atStall(P.threshold).mult, `pity で補正が強まる（×${atStall(P.threshold).mult.toFixed(3)} → ×${seq[seq.length - 1].mult.toFixed(3)}）`);
  info(`stall ${seq.map((x) => `${x.stall}:${x.mult.toFixed(2)}`).join(' ')}`);
}

// ===== 3. 上限で必ず頭打ち =====
section('3. pity は上限で必ず頭打ちになる（無限に強くならない）');
{
  const d = mk();
  const owned = ownedBase();
  const base = multOf(d, owned);
  d.guidanceStall = 1e6;
  const huge = multOf(d, owned);
  ok(huge <= G.maxMultiplier + 1e-9, `合成上限 ×${G.maxMultiplier} を超えない（×${huge.toFixed(3)}）`);
  ok(huge <= base * P.maxMultiplier + 1e-9, `pity 単体の上限 ×${P.maxMultiplier} も超えない（×${(huge / base).toFixed(3)}）`);
  info(`基準 ×${base.toFixed(3)} → pity 最大 ×${huge.toFixed(3)}`);
}

// ===== 4. 進展でリセットされる（5 種の進展）=====
section('4. 進化導線の進展 5 種でリセットされる');
{
  for (const kind of ['base', 'support', 'upgrade', 'evolution']) {
    const d = mk();
    d.guidanceStall = 10;
    ok(d.markGuidanceProgress(kind) === true, `${kind}: 進展として受理される`);
    ok(d.guidanceStall === 0, `${kind}: stall がリセットされる`);
    ok(d.guidanceTelemetry().assisted[kind] === 1, `${kind}: 補助回数が記録される`);
    ok(d.guidanceTelemetry().resets === 1, `${kind}: リセット回数が記録される`);
  }
  // 進展でないものではリセットしない。
  const d = mk();
  d.guidanceStall = 10;
  ok(d.markGuidanceProgress(null) === false, '進展なしでは受理しない');
  ok(d.guidanceStall === 10, '進展なしでは stall が残る');
  // 進化取得でもリセットされる（markProgress 経由）。
  d.markProgress();
  ok(d.guidanceStall === 0, '進化取得（markProgress）でもリセットされる');
}

// ===== 5. 他ジョブでは進まない =====
section('5. 火 / 氷では stall が 1 も進まない');
for (const jid of ['flame_witch', 'frost_mage']) {
  const d = mk();
  const job = jobPools(jid);
  const owned = { active: { [job.activeSkillPool[0]]: 4 }, passive: {} };
  for (let i = 0; i < 20; i++) { d.open(ctxOf(jid, owned, 6)); d.resolvePick(); }
  ok(d.guidanceStall === 0, `${jid}: stall が 0 のまま`);
  ok(d.guidancePityStep() === 0, `${jid}: pity 段も 0`);
  ok(d.guidancePityTriggers === 0, `${jid}: 発動回数も 0`);
  ok(d.draftsSinceProgress === 20, `${jid}: 既存 pity は従来どおり進む（${d.draftsSinceProgress}）`);
}

// ===== 6. save / reload で稼げない =====
section('6. save → reload で pity をリセットして稼げない');
{
  const d = mk();
  const owned = ownedBase();
  for (let i = 0; i < P.threshold + 5; i++) { d.open(ctxOf('warrior', owned)); d.resolvePick(); }
  const snap = JSON.parse(JSON.stringify(d.serialize()));
  ok(typeof snap.guidanceStall === 'number', `stall が保存される（${snap.guidanceStall}）`);
  ok(snap.guidanceStall === d.guidanceStall, '保存値が現在値と一致');
  const d2 = mk();
  d2.restore(snap);
  ok(d2.guidanceStall === d.guidanceStall, `復元後も stall が同じ（${d2.guidanceStall}）`);
  ok(d2.guidancePityStep() === d.guidancePityStep(), 'pity 段も同じ');
  // 何度 save/reload を繰り返しても stall は増えも減りもしない。
  let s = snap;
  for (let i = 0; i < 20; i++) { const x = mk(); x.restore(s); s = JSON.parse(JSON.stringify(x.serialize())); }
  ok(s.guidanceStall === snap.guidanceStall, `20 回の再読込で stall が変わらない（${s.guidanceStall}）`);
  // 旧セーブ（guidanceStall なし）でも壊れない。
  for (const bad of [{}, { guidanceStall: undefined }, { guidanceStall: null }, { guidanceStall: 'x' }, { guidanceStall: NaN }, { guidanceStall: -5 }, { guidanceStall: Infinity }]) {
    const x = mk();
    let threw = null;
    try { x.restore(bad); } catch (e) { threw = e; }
    ok(!threw, `壊れた保存 ${JSON.stringify(bad)} で例外なし`);
    ok(Number.isFinite(x.guidanceStall) && x.guidanceStall >= 0, `stall が有効値（${x.guidanceStall}）`);
  }
}

// ===== 7. RNG 消費を増やさない =====
section('7. pity は重みだけを変え、RNG 消費を 1 も増やさない');
{
  const owned = ownedBase();
  const a = mk(), b = mk();
  b.guidanceStall = 1000; // 片方だけ pity を最大に
  for (let i = 0; i < 12; i++) {
    a.open(ctxOf('warrior', owned)); a.resolvePick();
    b.open(ctxOf('warrior', owned)); b.resolvePick();
  }
  ok(a.cursor === b.cursor, `cursor が同じ（${a.cursor}）＝RNG の呼び出し回数が同じ`);
  ok(a.levelUpSequence === b.levelUpSequence, 'levelUpSequence も同じ');
  const src = readSrc('src/systems/SkillDraftManager.js');
  const gi = src.indexOf('_guidanceMult(');
  const body = src.slice(gi, src.indexOf('\n  _unlockOk', gi));
  ok(!/rng\.|SeededRandom|Math\.random/.test(body), '_guidanceMult が乱数へ触れていない');
}

// ===== 8. 実周回で pity が「ほぼ毎ドラフト発動」にならない =====
section('8. 実周回で pity が毎ドラフト発動していない（過剰誘導の防止）');
{
  const seeds = seedsOf(100);
  let totalDrafts = 0, totalTriggers = 0, runsWithPity = 0;
  for (const seed of seeds) {
    const r = simulateRun({ seed, slotActive: 4, levelUps: 40, strategy: LEGACY_STRATEGY });
    totalDrafts += r.levelUpsUsed;
    totalTriggers += r.pityTriggered;
    if (r.pityTriggered > 0) runsWithPity += 1;
  }
  const rate = totalTriggers / totalDrafts * 100;
  info(`pity 発動 ${totalTriggers}/${totalDrafts} ドラフト（${rate.toFixed(1)}%）・発動した run ${runsWithPity}/${seeds.length}`);
  ok(rate < 60, `pity 発動率 ${rate.toFixed(1)}% < 60%（毎ドラフト発動していない）`);
  ok(rate > 0, `pity は実際に発動している（${rate.toFixed(1)}%）`);
}

void WARRIOR;
T.finish();
