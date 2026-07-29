// 戦士 3/17: 抽選の決定論と到達性（M8-B §2）。Node.js 標準機能のみ。
// production の SkillDraftManager + SeededRandom で 200 seed を回し、
//   - 同 seed で候補列が完全一致（Math.random / Date.now 非依存）
//   - 全 active5 が Lv8 まで、全 passive4 が Lv4 まで到達可能
//   - 進化3種が現実的な取得回数で成立する
// を検証する。
// 実行: node tests/warrior-draft-determinism.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, WARRIOR, draftCatalog, jobPools, seedRange, runner, allSrc } from './warrior-common.mjs';

const T = runner('戦士 抽選決定論・到達性（M8-B）');
const { ok, section, info } = T;

const catalog = draftCatalog();
const job = jobPools('warrior');
const SEEDS = Number(process.env.HEAVY) ? 500 : 200;

const gen = (seed, owned, slots, evolvables, need = 3) => {
  const d = new SkillDraftManager({});
  return d._generate({ catalog, job, owned, slots, evolvables, need }, seed);
};
const emptyOwned = () => ({ active: {}, passive: {} });
const slotsOf = (a, p) => ({ active: { used: 0, max: a }, passive: { used: 0, max: p } });

// ===== 1. 同 seed で候補列が完全一致 =====
section('1. 同 seed の候補列が完全一致（決定論）');
{
  const hash = (run) => {
    const lines = [];
    for (const s of seedRange(SEEDS)) {
      lines.push(gen(s, emptyOwned(), slotsOf(4, 4), []).map((c) => `${c.id}:${c.kind}:${c.rarity}`).join('|'));
    }
    return createHash('sha256').update(lines.join('\n')).digest('hex');
  };
  const h1 = hash(1), h2 = hash(2);
  ok(h1 === h2, `${SEEDS} seed の候補列が 2 回とも同一（${h1.slice(0, 16)}…）`);
  info(`候補列 hash: ${h1}`);
}

// ===== 2. 乱数源の禁止（戦士系ソースに Math.random / Date.now / performance.now が無い）=====
section('2. 戦士のロジックが Math.random / Date.now / performance.now を使わない');
{
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const files = [
    'src/systems/WarriorCombatSystem.js', 'src/skills/WarriorSkillBase.js', 'src/ui/WarriorHud.js',
    ...WARRIOR.activeSkillPool, ...WARRIOR.evolutionPool,
  ];
  const { readSrc, registryMap, skillSource } = await import('./warrior-common.mjs');
  const map = registryMap();
  for (const f of files) {
    const src = stripComments(f.startsWith('src/') ? readSrc(f) : (skillSource(f, map) || ''));
    ok(!/Math\.random\s*\(/.test(src), `${f}: Math.random を使わない`);
    ok(!/Date\.now\s*\(/.test(src), `${f}: Date.now を使わない`);
    ok(!/performance\.now\s*\(/.test(src), `${f}: performance.now を使わない`);
  }
}

// ===== 3. Lv8 / Lv4 到達性 =====
section('3. 全 active が Lv8・全 passive が Lv4 へ到達できる');
{
  // 単純シミュレーション: 毎回 1 候補を選び、目標スキルがあれば必ず選ぶ。
  const reach = (targetId, isPassive, maxPicks = 400) => {
    const owned = emptyOwned();
    const key = isPassive ? 'passive' : 'active';
    const maxLv = isPassive ? 4 : 8;
    for (let s = 1; s <= maxPicks; s++) {
      const slots = slotsOf(8, 4);
      slots.active.used = Object.keys(owned.active).length;
      slots.passive.used = Object.keys(owned.passive).length;
      const cands = gen(s, owned, slots, []);
      const hit = cands.find((c) => c.id === targetId);
      if (hit) owned[key][targetId] = Math.min(maxLv, (owned[key][targetId] || 0) + 1);
      if ((owned[key][targetId] || 0) >= maxLv) return s;
    }
    return -1;
  };
  for (const id of WARRIOR.activeSkillPool) {
    const n = reach(id, false);
    ok(n > 0, `${id}: Lv8 到達可能（${n} 回のレベルアップ）`);
  }
  for (const id of WARRIOR.passiveSkillPool) {
    const n = reach(id, true);
    ok(n > 0, `${id}: Lv4 到達可能（${n} 回のレベルアップ）`);
  }
}

// ===== 4. 進化3種の成立 =====
section('4. 進化3種が候補として提示される（基礎Lv8 + 補助Lv4 を満たすと evolution が出る）');
for (const evoId of WARRIOR.evolutionPool) {
  const e = DATA.evolutions.find((x) => x.id === evoId);
  const aux = e.requiredSkills[0];
  const owned = { active: { [e.baseSkillId]: 8 }, passive: { [aux.skill]: aux.level } };
  const slots = slotsOf(4, 4);
  slots.active.used = 1; slots.passive.used = 1;
  let found = false;
  for (const s of seedRange(50)) {
    const cands = gen(s, owned, slots, [{ baseId: e.baseSkillId, evolutionId: evoId }]);
    if (cands.some((c) => c.kind === 'evolution' && c.baseId === e.baseSkillId)) { found = true; break; }
  }
  ok(found, `${evoId}: 条件成立後 50 seed 以内に進化候補が提示される`);
}

// ===== 5. 進化到達率（production 経路の実抽選シミュレーション）=====
// M8-C.1: 素朴な方針（進化があれば取る・無ければ候補列の先頭）のまま、
// 経路だけを production と同じ open() / synergy / guidance / reroll / banish / skip へ揃えた。
// 抽選器・戦略は変えていないので、M8-B / M8-C の測定と同じ物差しで比べられる。
section('5. 実抽選シミュレーション: active枠4/6/8 での進化到達率（production 経路）');
{
  const { simulateRun } = await import('./warrior-draft-sim.mjs');
  const runs = Number(process.env.HEAVY) ? 500 : 200;
  // M8-C で一時的に下げた基準を M8-C.1 で復元する（[枠, レベルアップ回数, ≥1%, 平均, 0%]）。
  for (const [slotMax, levelUps, minRate, minMean, maxZero] of [[4, 40, 80, 1.0, 20], [6, 60, 95, 1.7, 5], [8, 80, 95, 1.8, 5]]) {
    const counts = [];
    for (let s = 1; s <= runs; s++) {
      counts.push(simulateRun({ seed: s, slotActive: slotMax, levelUps, strategy: 'first-candidate' }).evolutionCount);
    }
    const n = counts.length;
    const rate = counts.filter((c) => c >= 1).length / n * 100;
    const rate2 = counts.filter((c) => c >= 2).length / n * 100;
    const zero = counts.filter((c) => c === 0).length / n * 100;
    const mean = counts.reduce((a, b) => a + b, 0) / n;
    info(`active枠${slotMax} / ${levelUps}回レベルアップ: 進化1種以上 ${rate.toFixed(1)}% / 2種以上 ${rate2.toFixed(1)}% / 平均 ${mean.toFixed(2)} / 0種 ${zero.toFixed(1)}%`);
    ok(rate >= minRate, `active枠${slotMax}: 進化1種以上の到達率 ${rate.toFixed(1)}% ≥ ${minRate}%`);
    ok(mean >= minMean, `active枠${slotMax}: 平均進化数 ${mean.toFixed(2)} ≥ ${minMean}`);
    ok(zero <= maxZero, `active枠${slotMax}: 進化0種の割合 ${zero.toFixed(1)}% ≤ ${maxZero}%`);
  }
  // 枠6 / 枠8 は「2種以上」の基準も持つ。
  for (const [slotMax, levelUps, min2] of [[6, 60, 60], [8, 80, 65]]) {
    const counts = [];
    for (let s = 1; s <= runs; s++) counts.push(simulateRun({ seed: s, slotActive: slotMax, levelUps, strategy: 'first-candidate' }).evolutionCount);
    const rate2 = counts.filter((c) => c >= 2).length / counts.length * 100;
    ok(rate2 >= min2, `active枠${slotMax}: 進化2種以上の到達率 ${rate2.toFixed(1)}% ≥ ${min2}%`);
  }
}

// ===== 6. 戦士系ソースが scene 内部状態へ直接触らない =====
section('6. 戦士スキルは profile / localStorage / DOM へ直接触らない');
{
  const { registryMap, skillSource } = await import('./warrior-common.mjs');
  const map = registryMap();
  for (const id of [...WARRIOR.activeSkillPool, ...WARRIOR.evolutionPool]) {
    const src = skillSource(id, map) || '';
    // `_window`（反撃構え）のようなローカル名を誤検知しないよう、識別子の先頭を境界で縛る。
    ok(!/(^|[^\w.$])(localStorage|document|window)\s*\./.test(src), `${id}: localStorage / DOM / window へ触らない`);
    ok(!/scene\.profile/.test(src), `${id}: scene.profile へ直接触らない`);
    ok(!/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(src), `${id}: 外部通信をしない`);
  }
}
void allSrc;

T.finish();
