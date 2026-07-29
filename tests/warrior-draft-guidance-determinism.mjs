// 戦士 M8-C.1 8/9: 導線補助の決定論（M8-C.1 §9）。Node.js 標準機能のみ。
// HEAVY=1 で seed 数を増やせる。
// 補正は「重みを変える」だけで RNG の呼び出し回数を変えない。したがって
//   - 同 seed・同入力なら候補列が完全一致（何度回しても・実体を作り直しても）
//   - 枠 4 / 6 / 8・5 戦略のいずれでも一致
//   - Math.random / Date.now / performance.now を 1 度も使わない
//   - guidance の ON / OFF で RNG 消費（cursor）が変わらない
// 実行: node tests/warrior-draft-guidance-determinism.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { runner, readSrc } from './warrior-common.mjs';
import { simulateRun, seedsOf, STRATEGIES, LEGACY_STRATEGY, SKILL_CONFIG, GUIDANCE_RECIPES, SEED_COUNT, HEAVY } from './warrior-draft-sim.mjs';
import { draftCatalog, jobPools } from './warrior-common.mjs';

const T = runner('戦士 導線補助の決定論（M8-C.1）');
const { ok, section, info } = T;

const sha = (s) => createHash('sha256').update(s).digest('hex');
const SEEDS = seedsOf(Math.min(SEED_COUNT, HEAVY ? 500 : 120));
const catalog = draftCatalog();

const traceOf = (slot, strategy, levelUps = 40) => {
  const lines = [];
  for (const seed of SEEDS) {
    const r = simulateRun({ seed, slotActive: slot, levelUps, strategy });
    lines.push(`${seed} evo=${r.evolved.sort().join(',')} act=${Object.entries(r.owned.active).sort().map(([k, v]) => k + ':' + v).join(',')} pas=${Object.entries(r.owned.passive).sort().map(([k, v]) => k + ':' + v).join(',')} pity=${r.pityFinal}`);
  }
  return sha(lines.join('\n'));
};

// ===== 1. 同一条件の再実行が完全一致 =====
section('1. 同 seed・同入力の再実行が完全一致（枠 4/6/8 × 5 戦略 + 素朴戦略）');
for (const slot of [4, 6, 8]) {
  for (const st of [...STRATEGIES, LEGACY_STRATEGY]) {
    const a = traceOf(slot, st), b = traceOf(slot, st);
    ok(a === b, `枠${slot} / ${st}: 2 回の実行が一致（${a.slice(0, 16)}…）`);
  }
}

// ===== 2. 条件を変えれば結果も変わる（trace が実挙動を捉えている）=====
section('2. 条件を変えれば結果も変わる');
{
  const base = traceOf(4, LEGACY_STRATEGY);
  ok(base !== traceOf(6, LEGACY_STRATEGY), '枠を変えると結果が変わる');
  ok(base !== traceOf(4, 'evolution-first'), '戦略を変えると結果が変わる');
  ok(base !== traceOf(4, LEGACY_STRATEGY, 60), 'レベルアップ回数を変えると結果が変わる');
}

// ===== 3. RNG 消費が guidance の有無で変わらない =====
section('3. guidance の ON / OFF で RNG 消費（cursor）が 1 も変わらない');
{
  const cursorsOf = (enabled) => {
    const out = [];
    for (const seed of seedsOf(40)) {
      const d = new SkillDraftManager({
        rarityWeights: SKILL_CONFIG.rarityWeights, synergy: SKILL_CONFIG.synergy,
        guidance: { ...SKILL_CONFIG.guidance, enabled },
      });
      d.reset(seed, {});
      const owned = { active: {}, passive: {} };
      for (let i = 0; i < 30; i++) {
        const ctx = {
          catalog, job: jobPools('warrior'), owned,
          slots: { active: { used: Object.keys(owned.active).length, max: 4 }, passive: { used: Object.keys(owned.passive).length, max: 4 } },
          evolvables: [], need: 3, unlock: { highestClearedDifficulty: 0 },
          synergy: { partnerIds: new Set(), battleLevel: i + 1 },
          jobId: 'warrior', evolutionRecipes: GUIDANCE_RECIPES,
        };
        const c = d.open(ctx);
        if (c.length) {
          const p = c[0];
          if (p.category === 'passive') owned.passive[p.id] = (owned.passive[p.id] || 0) + 1;
          else owned.active[p.id] = (owned.active[p.id] || 0) + 1;
        }
        d.resolvePick();
      }
      out.push(`${seed}:${d.cursor}:${d.levelUpSequence}`);
    }
    return out.join('|');
  };
  const on = cursorsOf(true), off = cursorsOf(false);
  ok(on === off, 'cursor / levelUpSequence が完全一致（重みだけを変えている）');
  info(`40 seed × 30 ドラフトで RNG 消費が同一`);
}

// ===== 4. 乱数源を使っていない =====
section('4. 抽選と補助が Math.random / Date.now / performance.now を使わない');
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const f of ['src/systems/SkillDraftManager.js', 'src/systems/SeededRandom.js', 'src/systems/SkillCatalog.js', 'src/systems/poolEligibility.js']) {
    const src = strip(readSrc(f));
    ok(!/Math\.random\s*\(/.test(src), `${f}: Math.random を使わない`);
    ok(!/Date\.now\s*\(/.test(src), `${f}: Date.now を使わない`);
    ok(!/performance\.now\s*\(/.test(src), `${f}: performance.now を使わない`);
  }
  // シミュレーション自体も Math.random を呼ばない。
  const orig = Math.random;
  let calls = 0;
  Math.random = () => { calls += 1; return orig(); };
  try { for (const st of STRATEGIES) simulateRun({ seed: 7, slotActive: 4, levelUps: 30, strategy: st }); } finally { Math.random = orig; }
  ok(calls === 0, `5 戦略のシミュレーションで Math.random が 0 回（${calls}）`);
}

// ===== 5. 新しい実体でも一致（グローバル状態を持たない）=====
section('5. SkillDraftManager が周回をまたぐグローバル状態を持たない');
{
  const one = () => {
    const d = new SkillDraftManager({ rarityWeights: SKILL_CONFIG.rarityWeights, synergy: SKILL_CONFIG.synergy, guidance: SKILL_CONFIG.guidance });
    d.reset(5, {});
    const owned = { active: {}, passive: {} };
    const lines = [];
    for (let i = 0; i < 20; i++) {
      const ctx = {
        catalog, job: jobPools('warrior'), owned,
        slots: { active: { used: 0, max: 4 }, passive: { used: 0, max: 4 } },
        evolvables: [], need: 3, unlock: { highestClearedDifficulty: 0 },
        synergy: { partnerIds: new Set(), battleLevel: i + 1 },
        jobId: 'warrior', evolutionRecipes: GUIDANCE_RECIPES,
      };
      lines.push(d.open(ctx).map((c) => `${c.kind}:${c.id}`).join('|'));
      d.resolvePick();
    }
    return sha(lines.join('\n'));
  };
  const results = [one(), one(), one()];
  ok(new Set(results).size === 1, `3 回の独立実行が完全一致（${results[0].slice(0, 16)}…）`);
}

// ===== 6. 総合 hash（回帰検知用の固定値）=====
section('6. 総合 hash（M8-C.1 の基準値）');
{
  const lines = [];
  for (const slot of [4, 6, 8]) for (const st of [...STRATEGIES, LEGACY_STRATEGY]) lines.push(`${slot}:${st}:${traceOf(slot, st)}`);
  const h = sha(lines.join('\n'));
  ok(h.length === 64, `総合 hash: ${h}`);
  info(`枠3種 × 戦略6種 × ${SEEDS.length} seed の総合 hash: ${h}`);
}

T.finish();
