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

// ===== 5. 進化到達率（実抽選シミュレーション）=====
section('5. 実抽選シミュレーション: active枠4/6 での進化到達率');
{
  const simulate = (seed, slotMax, levelUps) => {
    const owned = emptyOwned();
    const evolved = new Set();
    for (let i = 0; i < levelUps; i++) {
      const slots = slotsOf(slotMax, 4);
      slots.active.used = Object.keys(owned.active).length;
      slots.passive.used = Object.keys(owned.passive).length;
      // 進化可能な組み合わせを都度算出する（production と同じ条件判定）。
      const evolvables = [];
      for (const evoId of WARRIOR.evolutionPool) {
        const e = DATA.evolutions.find((x) => x.id === evoId);
        const aux = e.requiredSkills[0];
        if (evolved.has(evoId)) continue;
        if ((owned.active[e.baseSkillId] || 0) >= 8 && (owned.passive[aux.skill] || 0) >= aux.level) {
          evolvables.push({ baseId: e.baseSkillId, evolutionId: evoId });
        }
      }
      const cands = gen(seed * 1000 + i, owned, slots, evolvables);
      if (!cands.length) continue;
      // 方針: 進化 > 未取得（枠が空いていれば） > 既存強化 の順で選ぶ。
      const evo = cands.find((c) => c.kind === 'evolution');
      const pick = evo || cands[0];
      if (pick.kind === 'evolution') {
        const e = DATA.evolutions.find((x) => x.baseSkillId === pick.baseId && WARRIOR.evolutionPool.includes(x.id));
        if (e) { evolved.add(e.id); delete owned.active[e.baseSkillId]; owned.active[e.id] = 8; }
      } else if (pick.category === 'passive') {
        owned.passive[pick.id] = Math.min(4, (owned.passive[pick.id] || 0) + 1);
      } else {
        owned.active[pick.id] = Math.min(8, (owned.active[pick.id] || 0) + 1);
      }
    }
    return evolved.size;
  };
  for (const [slotMax, levelUps] of [[4, 40], [6, 60]]) {
    let atLeast1 = 0;
    const runs = 200;
    for (let s = 1; s <= runs; s++) if (simulate(s, slotMax, levelUps) >= 1) atLeast1++;
    const rate = atLeast1 / runs * 100;
    info(`active枠${slotMax} / ${levelUps}回レベルアップ: 進化1種以上 ${rate.toFixed(1)}%`);
    ok(rate >= 50, `active枠${slotMax}: 進化1種以上の到達率 ${rate.toFixed(1)}% ≥ 50%`);
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
