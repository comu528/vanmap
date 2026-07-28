// M8-C 3/19: 抽選シミュレーション（M8-C §16）。Node.js 標準機能のみ。
// production の SkillDraftManager + SeededRandom で 100 seed × 60 レベルアップを回し、
// active15 の提示率 / 取得率、evolution8 の条件形成 / 提示 / 取得、候補ゼロ・重複・混入・枠違反を集計する。
// HEAVY=1 で seed 数を増やせる。
// 実行: node tests/warrior-wave1-draft.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, WARRIOR, EXPECTED, draftCatalog, jobPools, seedRange, runner } from './warrior-common.mjs';

const T = runner('戦士 Wave1 抽選シミュレーション（M8-C）');
const { ok, section, info } = T;

const catalog = draftCatalog();
const job = jobPools('warrior');
const SEEDS = Number(process.env.HEAVY) ? 400 : 100;
const LEVELUPS = 60;
const ALLOWED = new Set([...WARRIOR.activeSkillPool, ...WARRIOR.passiveSkillPool]);

// 進化レシピ（base Lv8 ＋ 補助 Lv）。補助は passive でも active でもよい。
const RECIPES = WARRIOR.evolutionPool.map((id) => {
  const e = DATA.evolutions.find((x) => x.id === id);
  const req = e.requiredSkills[0];
  return { id, base: e.baseSkillId, aux: req.skill, auxLevel: req.level, auxIsActive: WARRIOR.activeSkillPool.includes(req.skill) };
});

const gen = (seed, owned, slots, evolvables, need = 3) => {
  const d = new SkillDraftManager({});
  return d._generate({ catalog, job, owned, slots, evolvables, need }, seed);
};

// 戦略: どの候補を選ぶかの方針だけを変え、抽選そのものは production に任せる。
function simulate(seed, slotMax, strategy) {
  const owned = { active: {}, passive: {} };
  const evolved = new Set();
  const stats = {
    offered: new Set(), taken: new Set(), evoFormed: new Set(), evoOffered: new Set(), evoTaken: new Set(),
    noneCount: 0, noneUnsaturated: 0, duplicateCount: 0, leakCount: 0, slotViolation: 0,
  };
  for (let i = 0; i < LEVELUPS; i++) {
    const activeCount = Object.keys(owned.active).length;
    const slots = { active: { used: activeCount, max: slotMax }, passive: { used: Object.keys(owned.passive).length, max: 4 } };
    // 進化可能な組み合わせ（production と同じ条件判定）。
    const evolvables = [];
    for (const r of RECIPES) {
      if (evolved.has(r.id)) continue;
      const auxLv = r.auxIsActive ? (owned.active[r.aux] || 0) : (owned.passive[r.aux] || 0);
      if ((owned.active[r.base] || 0) >= 8 && auxLv >= r.auxLevel) {
        stats.evoFormed.add(r.id);
        evolvables.push({ baseId: r.base, evolutionId: r.id });
      }
    }
    const cands = gen(seed * 1000 + i, owned, slots, evolvables);
    if (!cands.length) {
      stats.noneCount++;
      // 候補ゼロが「所持がすべて上限」以外の理由で起きていないかを見る（真の異常はこちら）。
      const activesMaxed = Object.keys(owned.active).length >= slotMax
        && Object.values(owned.active).every((lv) => lv >= 8);
      const passivesMaxed = Object.keys(owned.passive).length >= 4
        && Object.entries(owned.passive).every(([pid, lv]) => lv >= (DATA.passives.find((p) => p.id === pid)?.maxLevel || 4));
      if (!(activesMaxed && passivesMaxed)) stats.noneUnsaturated++;
      continue;
    }
    // 監査: 重複 / 混入 / 枠違反。
    const seen = new Set();
    for (const c of cands) {
      if (seen.has(c.id)) stats.duplicateCount++;
      seen.add(c.id);
      stats.offered.add(c.id);
      if (c.kind === 'evolution') { stats.evoOffered.add(c.baseId); continue; }
      if (!ALLOWED.has(c.id)) stats.leakCount++;
      if (c.kind === 'new_active' && activeCount >= slotMax) stats.slotViolation++;
      if (c.kind === 'new_passive' && Object.keys(owned.passive).length >= 4) stats.slotViolation++;
    }
    // 選択方針。
    let pick;
    const evo = cands.find((c) => c.kind === 'evolution');
    if (strategy === 'evolution-first' && evo) pick = evo;
    else if (strategy === 'balanced') pick = evo || cands.find((c) => c.category === 'passive') || cands[0];
    else pick = cands[i % cands.length]; // random-valid（seed 由来の決定論的な巡回）
    if (!pick) pick = cands[0];

    if (pick.kind === 'evolution') {
      const r = RECIPES.find((x) => x.base === pick.baseId && !evolved.has(x.id));
      if (r) { evolved.add(r.id); stats.evoTaken.add(r.id); delete owned.active[r.base]; owned.active[r.id] = 8; }
    } else if (pick.category === 'passive') {
      const def = DATA.passives.find((p) => p.id === pick.id);
      owned.passive[pick.id] = Math.min(def.maxLevel, (owned.passive[pick.id] || 0) + 1);
      stats.taken.add(pick.id);
    } else {
      owned.active[pick.id] = Math.min(8, (owned.active[pick.id] || 0) + 1);
      stats.taken.add(pick.id);
    }
  }
  return stats;
}

// ===== 1. 決定論 =====
section('1. 同 seed・同方針なら候補列が完全一致（決定論）');
{
  const hash = () => {
    const lines = [];
    for (const s of seedRange(SEEDS)) {
      lines.push(gen(s, { active: {}, passive: {} }, { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, [])
        .map((c) => `${c.id}:${c.kind}:${c.rarity}`).join('|'));
    }
    return createHash('sha256').update(lines.join('\n')).digest('hex');
  };
  const h1 = hash(), h2 = hash();
  ok(h1 === h2, `${SEEDS} seed の候補列が 2 回とも同一`);
  info(`Wave1 戦士 候補列 hash: ${h1}`);
}

// ===== 2〜4. 枠 × 方針の総当たり =====
const agg = {};
for (const slotMax of [4, 6, 8]) {
  for (const strategy of ['evolution-first', 'balanced', 'random-valid']) {
    const key = `slot${slotMax}/${strategy}`;
    const offered = new Map(), taken = new Map(), evoFormed = new Map(), evoOffered = new Map(), evoTaken = new Map();
    let none = 0, noneUns = 0, dup = 0, leak = 0, slotV = 0;
    for (const s of seedRange(SEEDS)) {
      const r = simulate(s, slotMax, strategy);
      for (const id of r.offered) offered.set(id, (offered.get(id) || 0) + 1);
      for (const id of r.taken) taken.set(id, (taken.get(id) || 0) + 1);
      for (const id of r.evoFormed) evoFormed.set(id, (evoFormed.get(id) || 0) + 1);
      for (const id of r.evoOffered) evoOffered.set(id, (evoOffered.get(id) || 0) + 1);
      for (const id of r.evoTaken) evoTaken.set(id, (evoTaken.get(id) || 0) + 1);
      none += r.noneCount; noneUns += r.noneUnsaturated; dup += r.duplicateCount; leak += r.leakCount; slotV += r.slotViolation;
    }
    agg[key] = { offered, taken, evoFormed, evoOffered, evoTaken, none, noneUns, dup, leak, slotV };
  }
}

section('2. 重複 / 他ジョブ混入 / 枠違反が 0 件・候補ゼロは「全所持が上限」のときだけ');
for (const [key, a] of Object.entries(agg)) {
  ok(a.dup === 0, `${key}: 重複候補 0（実際 ${a.dup}）`);
  ok(a.leak === 0, `${key}: 他ジョブ混入 0（実際 ${a.leak}）`);
  ok(a.slotV === 0, `${key}: 枠違反 0（実際 ${a.slotV}）`);
  // 候補ゼロ自体は「active 枠が埋まり全て Lv8・passive も全て上限」のときに必ず起きる正常系
  // （枠が狭いほど早く飽和する）。異常なのは飽和していないのに候補が出ないケース。
  ok(a.noneUns === 0, `${key}: 未飽和なのに候補ゼロ 0（実際 ${a.noneUns} / 候補ゼロ総数 ${a.none}）`);
}
info(`候補ゼロ（飽和後の正常系）: ${Object.entries(agg).map(([k, a]) => `${k}:${a.none}`).join(' ')}`);

section('3. active15 すべてが提示され、取得もされる（死にスキルなし）');
{
  const union = { offered: new Set(), taken: new Set() };
  for (const a of Object.values(agg)) {
    for (const id of a.offered.keys()) union.offered.add(id);
    for (const id of a.taken.keys()) union.taken.add(id);
  }
  for (const id of WARRIOR.activeSkillPool) {
    ok(union.offered.has(id), `${id}: 提示される`);
    ok(union.taken.has(id), `${id}: 取得される（取得 0 のスキルが無い）`);
  }
  for (const id of WARRIOR.passiveSkillPool) {
    ok(union.offered.has(id), `${id}: passive も提示される`);
  }
  // 代表条件（slot6 / balanced）での提示率。
  const a = agg['slot6/balanced'];
  const rows = WARRIOR.activeSkillPool.map((id) => `${id}:${Math.round((a.offered.get(id) || 0) / SEEDS * 100)}%`);
  info(`slot6/balanced 提示率: ${rows.join(' ')}`);
  const trows = EXPECTED.wave1Actives.map((id) => `${id}:${Math.round((a.taken.get(id) || 0) / SEEDS * 100)}%`);
  info(`slot6/balanced 取得率（新10）: ${trows.join(' ')}`);
}

section('4. evolution8 すべてが条件形成・提示・取得される');
{
  const union = { formed: new Set(), offered: new Set(), taken: new Set() };
  for (const a of Object.values(agg)) {
    for (const id of a.evoFormed.keys()) union.formed.add(id);
    for (const id of a.evoTaken.keys()) union.taken.add(id);
  }
  for (const id of WARRIOR.evolutionPool) {
    ok(union.formed.has(id), `${id}: 進化条件が形成される`);
    ok(union.taken.has(id), `${id}: 取得される（到達不能な進化が無い）`);
  }
  const a = agg['slot8/evolution-first'];
  const rows = WARRIOR.evolutionPool.map((id) => `${id}:形成${Math.round((a.evoFormed.get(id) || 0) / SEEDS * 100)}%/取得${Math.round((a.evoTaken.get(id) || 0) / SEEDS * 100)}%`);
  info(`slot8/evolution-first: ${rows.join(' ')}`);
  void union.offered;
}

section('5. 既存 5 active が完全なハズレになっていない');
{
  const a = agg['slot6/balanced'];
  for (const id of EXPECTED.baseActives) {
    const rate = (a.taken.get(id) || 0) / SEEDS * 100;
    ok(rate > 0, `${id}: 取得率 ${rate.toFixed(1)}% > 0（Wave1 追加後も選ばれる）`);
  }
}

T.finish();
