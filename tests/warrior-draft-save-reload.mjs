// 戦士 M8-C.1 7/9: ドラフトの保存 / 復元（M8-C.1 §9）。Node.js 標準機能のみ。
// M8-C.1 は SkillDraftManager の保存へ guidanceStall を 1 キー追加した（save_version は v6 のまま）。
//   - 保存 → 復元 → 続行の候補列が、途中保存しない場合と完全一致する
//   - guidance の pity を save/reload でリセットして稼げない
//   - 旧セーブ（guidanceStall なし）で壊れない
//   - 火 / 氷の保存キーが 1 件も変わらない（追加キーは値 0 のまま）
// 実行: node tests/warrior-draft-save-reload.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, WARRIOR, draftCatalog, jobPools, runner, readSrc } from './warrior-common.mjs';
import { GUIDANCE_RECIPES, SKILL_CONFIG, ACTIVE_MAX, PASSIVE_MAX, computeEvolvables, seedsOf } from './warrior-draft-sim.mjs';

const T = runner('戦士 ドラフト保存 / 復元（M8-C.1）');
const { ok, section, info } = T;

const catalog = draftCatalog();
const sha = (s) => createHash('sha256').update(s).digest('hex');
const mk = (jobId) => new SkillDraftManager({
  rarityWeights: SKILL_CONFIG.rarityWeights, synergy: SKILL_CONFIG.synergy,
  guidance: SKILL_CONFIG.guidance, baseRerolls: 1, baseBanishes: 1, baseSkips: 1,
});
const ctxOf = (jobId, owned, slotMax, evolvables, battleLevel) => ({
  catalog, job: jobPools(jobId), owned,
  slots: { active: { used: Object.keys(owned.active).length, max: slotMax }, passive: { used: Object.keys(owned.passive).length, max: 4 } },
  evolvables, need: 3, unlock: { highestClearedDifficulty: 0 },
  synergy: { partnerIds: new Set(), battleLevel },
  jobId, evolutionRecipes: jobId === 'warrior' ? GUIDANCE_RECIPES : undefined,
});
const key = (cands) => cands.map((c) => `${c.kind}:${c.id}:${c.fromLevel}->${c.toLevel}`).join('|');

// 途中で保存・復元を挟めるドラフト進行。saveAt >= 0 でその回のあとに保存 → 新実体へ復元する。
function play(seed, slotMax, levelUps, saveAt) {
  let d = mk('warrior');
  d.reset(seed, {});
  const owned = { active: {}, passive: {} };
  const evolved = new Set();
  const lines = [];
  for (let i = 0; i < levelUps; i++) {
    const ctx = ctxOf('warrior', owned, slotMax, computeEvolvables(owned, evolved), i + 1);
    const cands = d.open(ctx);
    lines.push(key(cands));
    if (cands.length) {
      const pick = cands.find((c) => c.kind === 'evolution') || cands[0];
      if (pick.kind === 'evolution') { evolved.add(pick.id); delete owned.active[pick.baseId]; owned.active[pick.id] = 1; d.markProgress(); }
      else if (pick.category === 'passive') owned.passive[pick.id] = Math.min(PASSIVE_MAX[pick.id] || 4, (owned.passive[pick.id] || 0) + 1);
      else owned.active[pick.id] = Math.min(ACTIVE_MAX[pick.id] || 8, (owned.active[pick.id] || 0) + 1);
      if (pick.kind !== 'evolution') {
        const tag = (pick.guidance || []).find((g) => g === 'base' || g === 'support' || g === 'upgrade');
        if (tag) d.markGuidanceProgress(tag);
      }
      d.resolvePick();
    } else d.forceClear();
    if (i === saveAt) {
      const snap = JSON.parse(JSON.stringify(d.serialize()));
      d = mk('warrior');
      d.restore(snap);
    }
  }
  return { hash: sha(lines.join('\n')), stall: d.guidanceStall, evolved: [...evolved].sort(), owned };
}

// ===== 1. 保存キーの追加は 1 件だけ =====
section('1. 保存キーの追加は guidanceStall の 1 件だけ（save_version は v6 のまま）');
{
  const d = mk('warrior');
  const s = d.serialize();
  const M8C_KEYS = ['seed', 'cursor', 'levelUpSequence', 'currentDraftId', 'currentCandidates',
    'rerollsRemaining', 'banishesRemaining', 'skipsRemaining', 'banishedSkillIds', 'draftsSinceProgress'];
  for (const k of M8C_KEYS) ok(Object.prototype.hasOwnProperty.call(s, k), `既存キー ${k} が残っている`);
  const added = Object.keys(s).filter((k) => !M8C_KEYS.includes(k));
  ok(added.length === 1 && added[0] === 'guidanceStall', `追加キーは guidanceStall のみ（${added.join(',')}）`);
  ok(DATA.balance.saveVersion === 6, `save_version は 6 のまま（${DATA.balance.saveVersion}）`);
  const bm = readSrc('src/systems/BattleManager.js');
  ok(!/saveVersion\s*[:=]\s*7/.test(bm), 'save_version を 7 へ上げていない');
}

// ===== 2. 保存 → 復元 → 続行が通し実行と完全一致 =====
section('2. 保存 → 復元 → 続行の候補列が、途中保存しない場合と完全一致');
for (const slotMax of [4, 6, 8]) {
  for (const seed of seedsOf(20)) {
    const straight = play(seed, slotMax, 30, -1);
    for (const at of [3, 11, 24]) {
      const saved = play(seed, slotMax, 30, at);
      ok(saved.hash === straight.hash, `枠${slotMax} seed${seed}: ${at} 回目で保存/復元しても候補列が一致`);
    }
  }
  info(`枠${slotMax}: 20 seed × 3 保存地点で候補列一致`);
}

// ===== 3. pity 境界でも一致 =====
section('3. pity のしきい値をまたぐ地点で保存/復元しても一致');
{
  const th = SKILL_CONFIG.guidance.pity.threshold;
  for (const seed of seedsOf(15)) {
    const straight = play(seed, 4, 30, -1);
    for (const at of [th - 1, th, th + 1, th + 2]) {
      const saved = play(seed, 4, 30, at);
      ok(saved.hash === straight.hash, `seed${seed}: pity 境界 ${at} で保存/復元しても一致`);
      ok(saved.stall === straight.stall, `seed${seed}: 境界 ${at} で最終 stall も一致（${straight.stall}）`);
    }
  }
}

// ===== 4. 再読込で pity を稼げない =====
section('4. 再読込を繰り返しても pity / 進化数が増えない');
{
  for (const seed of seedsOf(10)) {
    const once = play(seed, 4, 40, -1);
    // 5 回保存/復元を挟んでも進化数と所持が一致する。
    let d = mk('warrior');
    d.reset(seed, {});
    const owned = { active: {}, passive: {} };
    const evolved = new Set();
    for (let i = 0; i < 40; i++) {
      const cands = d.open(ctxOf('warrior', owned, 4, computeEvolvables(owned, evolved), i + 1));
      if (cands.length) {
        const pick = cands.find((c) => c.kind === 'evolution') || cands[0];
        if (pick.kind === 'evolution') { evolved.add(pick.id); delete owned.active[pick.baseId]; owned.active[pick.id] = 1; d.markProgress(); }
        else if (pick.category === 'passive') owned.passive[pick.id] = Math.min(PASSIVE_MAX[pick.id] || 4, (owned.passive[pick.id] || 0) + 1);
        else owned.active[pick.id] = Math.min(ACTIVE_MAX[pick.id] || 8, (owned.active[pick.id] || 0) + 1);
        if (pick.kind !== 'evolution') {
          const tag = (pick.guidance || []).find((g) => g === 'base' || g === 'support' || g === 'upgrade');
          if (tag) d.markGuidanceProgress(tag);
        }
        d.resolvePick();
      } else d.forceClear();
      if (i % 8 === 7) { const snap = JSON.parse(JSON.stringify(d.serialize())); d = mk('warrior'); d.restore(snap); }
    }
    ok([...evolved].sort().join(',') === once.evolved.join(','), `seed${seed}: 5 回の再読込でも進化結果が同じ（${once.evolved.length} 件）`);
  }
}

// ===== 5. 旧セーブ / 壊れたセーブ =====
section('5. 旧セーブ（guidanceStall なし）・壊れたセーブで壊れない');
{
  const legacy = {
    seed: 1234, cursor: 7, levelUpSequence: 5, currentDraftId: '5:7', currentCandidates: [],
    rerollsRemaining: 1, banishesRemaining: 1, skipsRemaining: 1, banishedSkillIds: [], draftsSinceProgress: 2,
  };
  const d = mk('warrior');
  d.restore(legacy);
  ok(d.guidanceStall === 0, '旧セーブでは stall が 0 から始まる');
  ok(d.draftsSinceProgress === 2, '既存の pity カウンタはそのまま復元される');
  ok(d.seed === 1234 && d.cursor === 7, '既存フィールドが正しく復元される');
  for (const bad of [null, undefined, {}, 'x', 42, { guidanceStall: {} }, { guidanceStall: [] }, { guidanceStall: -1 }, { guidanceStall: NaN }, { guidanceStall: 1e300 }]) {
    const x = mk('warrior');
    let threw = null;
    try { x.restore(bad); } catch (e) { threw = e; }
    ok(!threw, `壊れた保存 ${JSON.stringify(bad)} で例外なし`);
    ok(Number.isFinite(x.guidanceStall) && x.guidanceStall >= 0 && x.guidanceStall <= 1e6, `stall が有効値（${x.guidanceStall}）`);
  }
}

// ===== 6. 火 / 氷の保存が実質的に変わらない =====
section('6. 火 / 氷では追加キーが常に 0 のまま（保存内容が実質不変）');
for (const jid of ['flame_witch', 'frost_mage']) {
  const d = mk(jid);
  d.reset(99, {});
  const job = jobPools(jid);
  const owned = { active: { [job.activeSkillPool[0]]: 3 }, passive: {} };
  for (let i = 0; i < 25; i++) { d.open(ctxOf(jid, owned, 6, [], i + 1)); d.resolvePick(); }
  const s = d.serialize();
  ok(s.guidanceStall === 0, `${jid}: guidanceStall が 0 のまま`);
  const without = { ...s }; delete without.guidanceStall;
  const d2 = mk(jid); d2.restore(without);
  const d3 = mk(jid); d3.restore(s);
  ok(JSON.stringify(d2.serialize()) === JSON.stringify(d3.serialize()), `${jid}: 追加キーの有無で復元結果が変わらない`);
}

// ===== 7. reroll / banish / skip をまたいでも一致 =====
section('7. reroll / banish / skip を挟んでも保存 / 復元で一致する');
{
  const playOps = (seed, saveAfterOps) => {
    let d = mk('warrior');
    d.reset(seed, {});
    const owned = { active: {}, passive: {} };
    const lines = [];
    const ctx = () => ctxOf('warrior', owned, 6, [], 10);
    lines.push(key(d.open(ctx())));
    lines.push(key(d.reroll(ctx()).candidates || []));
    const first = d.currentCandidates[0];
    if (first) lines.push(key(d.banish(first.id, ctx()).candidates || []));
    if (saveAfterOps) { const snap = JSON.parse(JSON.stringify(d.serialize())); d = mk('warrior'); d.restore(snap); }
    d.skip();
    lines.push(key(d.open(ctx())));
    return { hash: sha(lines.join('\n')), banished: d.banishedSkillIds.slice(), left: [d.rerollsRemaining, d.banishesRemaining, d.skipsRemaining] };
  };
  for (const seed of seedsOf(15)) {
    const a = playOps(seed, false), b = playOps(seed, true);
    ok(a.hash === b.hash, `seed${seed}: reroll/banish/skip を挟んでも候補列が一致`);
    ok(a.banished.join(',') === b.banished.join(','), `seed${seed}: 追放リストが一致`);
    ok(a.left.join(',') === b.left.join(','), `seed${seed}: 残回数が一致（${a.left.join('/')}）`);
  }
}

void WARRIOR;
T.finish();
