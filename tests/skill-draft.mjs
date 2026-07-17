// スキル抽選基盤（Milestone 6-A）のテスト。Node.js 標準機能のみ。
// 実データ（data/*.json）からカタログを組み、SkillDraftManager / SeededRandom / PassiveManager を検証する。
// 実行: node tests/skill-draft.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { SeededRandom } from '../src/systems/SeededRandom.js';
import { PassiveManager } from '../src/systems/PassiveManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (n) => JSON.parse(readFileSync(join(dir, n), 'utf8'));

const skills = load('skills.json').skills;
const passives = load('passives.json').passives;
const jobs = load('jobs.json').jobs;
const cfg = load('skill-config.json');
const reinc = load('reincarnation.json');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

// 実データからカタログ（メタ配列）を構築。
const catalog = [
  ...skills.map((s) => ({ id: s.id, category: s.category, rarity: s.rarity, weight: s.weight, maxLevel: s.maxLevel, enabled: s.enabled, jobs: s.jobs, isCommon: s.isCommon, prerequisites: s.prerequisites, conflicts: s.conflicts, unlockCondition: s.unlockCondition })),
  ...passives.map((p) => ({ id: p.id, category: p.category, rarity: p.rarity, weight: p.weight, maxLevel: p.maxLevel, enabled: p.enabled, jobs: p.jobs, isCommon: p.isCommon, prerequisites: p.prerequisites, conflicts: p.conflicts, unlockCondition: p.unlockCondition })),
];
const job = jobs.find((j) => j.id === 'flame_witch');

function mkCtx(o = {}) {
  return {
    catalog, job, extraAllowedIds: o.extraAllowedIds || [],
    owned: o.owned || { active: { fireball: 1 }, passive: {} },
    slots: o.slots || { active: { used: 1, max: 4 }, passive: { used: 0, max: 4 } },
    evolvables: o.evolvables || [],
    need: o.need || 3,
    unlock: o.unlock || { highestClearedDifficulty: 0 },
  };
}
function mkDraft(seed = 12345) { return new SkillDraftManager({ rarityWeights: cfg.rarityWeights, baseRerolls: cfg.draft.baseRerolls, baseBanishes: cfg.draft.baseBanishes, baseSkips: cfg.draft.baseSkips }, seed); }
function newDraft(seed = 12345) { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(seed, { rerolls: 1, banishes: 1, skips: 1 }); return d; }

// ===== 1. スロット / 枠 =====
section('1. 所持枠（active 4 / 初期火球1枠）');
{
  ok(cfg.slots.baseActiveSlots === 4 && cfg.slots.basePassiveSlots === 4, '初期枠が active4 / passive4');
  // 初期状態: fireball L1 所持・active 1/4 → 新規 active を最大3種取得可能
  const d = newDraft();
  const cand = d.open(mkCtx());
  const newActives = cand.filter((c) => c.kind === 'new_active');
  ok(newActives.length > 0, '空きがあれば新規 active 候補が出る');
}

section('2. active 枠満杯 → 新規 active は出ない / 強化は出る');
{
  const d = newDraft();
  const owned = { active: { fireball: 2, flame_pillar: 3, burning_trail: 1, orbiting_flame: 1 }, passive: {} };
  const cand = d.open(mkCtx({ owned, slots: { active: { used: 4, max: 4 }, passive: { used: 0, max: 4 } } }));
  ok(cand.every((c) => c.kind !== 'new_active'), '満杯時は新規 active を出さない');
  ok(cand.some((c) => c.kind === 'up_active') || cand.some((c) => c.kind === 'new_passive'), '所持強化 or passive は出る');
}

section('3. passive 枠満杯 → 新規 passive は出ない / 強化は出る');
{
  const d = newDraft();
  const owned = { active: { fireball: 1 }, passive: { power_amp: 1, swift_cast: 1, scorch_expand: 1, ember_persist: 1 } };
  const cand = d.open(mkCtx({ owned, slots: { active: { used: 1, max: 4 }, passive: { used: 4, max: 4 } }, need: 4 }));
  ok(cand.every((c) => c.kind !== 'new_passive'), '満杯時は新規 passive を出さない');
}

section('4. 進化は枠を消費せず高優先度・最低1枠');
{
  const d = newDraft();
  const owned = { active: { fireball: 8, orbiting_flame: 4, flame_pillar: 2 }, passive: {} };
  const evolvables = [{ evolutionId: 'infernal_barrage', baseId: 'fireball', order: 1 }];
  const cand = d.open(mkCtx({ owned, slots: { active: { used: 3, max: 4 }, passive: { used: 0, max: 4 } }, evolvables }));
  ok(cand[0] && cand[0].kind === 'evolution' && cand[0].id === 'infernal_barrage', '進化候補が先頭に出る');
  ok(!cand.some((c) => c.kind !== 'evolution' && c.id === 'fireball'), '進化元 active(fireball, 最大Lv) は通常候補に出ない');
}

section('5. 最大Lv の通常候補は除外');
{
  const d = newDraft();
  const owned = { active: { fireball: 8 }, passive: {} }; // 進化不可（補助なし）
  const cand = d.open(mkCtx({ owned }));
  ok(!cand.some((c) => c.id === 'fireball'), '最大Lv かつ進化不可の fireball は候補に出ない');
}

// ===== 決定論 =====
section('6. 決定論（同 seed・同状態で同一候補）');
{
  const a = newDraft(999).open(mkCtx());
  const b = newDraft(999).open(mkCtx());
  ok(JSON.stringify(a) === JSON.stringify(b), '同 seed・同状態で同一候補列');
  const c = newDraft(1000).open(mkCtx());
  ok(JSON.stringify(a) !== JSON.stringify(c) || a.length <= 1, '異なる seed では基本的に異なる（候補数十分な場合）');
}

section('7. 再読込（serialize/restore）で currentCandidates 不変');
{
  const d = newDraft(777); d.open(mkCtx());
  const saved = JSON.parse(JSON.stringify(d.serialize()));
  const d2 = newDraft(1); d2.restore(saved);
  ok(JSON.stringify(d2.currentCandidates) === JSON.stringify(d.currentCandidates), '復元後も候補が変化しない');
  ok(d2.currentDraftId === d.currentDraftId, 'draftId も一致');
}

// ===== リロール =====
section('8. リロール（残数消費・同操作列で同結果・可能なら別候補）');
{
  const d1 = newDraft(555); d1.open(mkCtx()); const r1 = d1.reroll(mkCtx());
  const d2 = newDraft(555); d2.open(mkCtx()); const r2 = d2.reroll(mkCtx());
  ok(r1.ok && d1.rerollsRemaining === 0, 'リロールで残数が減る');
  ok(JSON.stringify(r1.candidates) === JSON.stringify(r2.candidates), '同 seed・同操作列でリロール後も同一');
  const d3 = newDraft(555); const before = d3.open(mkCtx());
  const after = d3.reroll(mkCtx()).candidates;
  ok(JSON.stringify(before) !== JSON.stringify(after) || before.length <= 1, 'プールが十分ならリロールで候補が変わる');
  ok(!d3.reroll(mkCtx()).ok, '残数0でリロール不可');
}

// ===== 追放 =====
section('9. 追放（除外・二重不可・残数消費・再生成）');
{
  const d = newDraft(321);
  const owned = { active: { fireball: 1 }, passive: {} };
  d.open(mkCtx({ owned, need: 4 }));
  const r = d.banish('meteor', mkCtx({ owned, need: 4 }));
  ok(r.ok && d.banishesRemaining === 0, '追放で残数が減る');
  // 以後 meteor は出ない（何度か引いても）
  let seen = false;
  for (let i = 0; i < 8; i++) { const c = d.open(mkCtx({ owned, need: 4 })); if (c.some((x) => x.id === 'meteor')) seen = true; }
  ok(!seen, '追放した meteor は以後の候補に出ない');
  ok(!d.banish('meteor', mkCtx({ owned })).ok, '同じスキルは二重追放できない（残数も理由も不可）');
}

// ===== スキップ =====
section('10. スキップ（残数消費・0で不可・救済）');
{
  const d = newDraft(1); d.open(mkCtx());
  ok(d.skip() === true && d.skipsRemaining === 0, 'スキップで残数が減る');
  ok(d.skip() === false, '残数0でスキップ不可');
  ok(d.currentCandidates.length === 0, 'スキップで候補が破棄される');
}

section('11. 候補0件で進行不能にならない（救済）');
{
  const d = newDraft(1);
  // 全 active 満杯・全 passive 満杯・全て最大Lv → 候補なし
  const owned = { active: { fireball: 8, flame_pillar: 8, burning_trail: 8, orbiting_flame: 8 }, passive: { power_amp: 5, swift_cast: 5, scorch_expand: 5, ember_persist: 5 } };
  const cand = d.open(mkCtx({ owned, slots: { active: { used: 4, max: 4 }, passive: { used: 4, max: 4 } }, need: 4 }));
  ok(cand.length === 0, '条件を満たす候補が無ければ空配列（水増ししない）');
  d.forceClear();
  ok(d.currentCandidates.length === 0, '救済で戦闘へ戻れる（回数非消費は呼び出し側）');
}

// ===== ジョブ / 前提 / conflict / 重複 =====
section('12. ジョブ対象外・前提未達・conflict・重複なし');
{
  const d = newDraft(42);
  // extraAllowed で外部スキルを許可しない限り、ジョブ外 id は出ない（存在しない id を試す）
  const cand = d.open(mkCtx());
  ok(cand.every((c) => job.activeSkillPool.includes(c.id) || passives.some((p) => p.id === c.id) || c.kind === 'evolution'), 'ジョブプール/共通passive/進化のみ');
  // 前提: 合成カタログに前提付きスキルを足して検証
  const withPrereq = catalog.concat([{ id: 'test_locked', category: 'active', rarity: 'common', weight: 1, maxLevel: 3, enabled: true, jobs: ['flame_witch'], isCommon: false, prerequisites: [{ skill: 'meteor', level: 3 }], conflicts: [], unlockCondition: null }]);
  const job2 = { ...job, activeSkillPool: job.activeSkillPool.concat(['test_locked']) };
  const d2 = newDraft(42);
  const ctx2 = { catalog: withPrereq, job: job2, owned: { active: { fireball: 1 }, passive: {} }, slots: { active: { used: 1, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 8, unlock: { highestClearedDifficulty: 0 } };
  const c2 = d2.open(ctx2);
  ok(!c2.some((c) => c.id === 'test_locked'), '前提未達スキルは出ない');
  // 重複なし
  const ids = c2.map((c) => c.id);
  ok(new Set(ids).size === ids.length, '候補内に重複 id なし');
  // conflict: 相互排他の2スキルは同時に出ない
  const withConf = catalog.concat([
    { id: 'conf_a', category: 'active', rarity: 'common', weight: 1000, maxLevel: 3, enabled: true, jobs: ['flame_witch'], isCommon: false, prerequisites: [], conflicts: ['conf_b'], unlockCondition: null },
    { id: 'conf_b', category: 'active', rarity: 'common', weight: 1000, maxLevel: 3, enabled: true, jobs: ['flame_witch'], isCommon: false, prerequisites: [], conflicts: ['conf_a'], unlockCondition: null },
  ]);
  const job3 = { ...job, activeSkillPool: job.activeSkillPool.concat(['conf_a', 'conf_b']) };
  let bothSeen = false;
  for (let s = 0; s < 30; s++) {
    const d3 = newDraft(s + 1);
    const c3 = d3.open({ catalog: withConf, job: job3, owned: { active: {}, passive: {} }, slots: { active: { used: 0, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 8, unlock: {} });
    if (c3.some((x) => x.id === 'conf_a') && c3.some((x) => x.id === 'conf_b')) bothSeen = true;
  }
  ok(!bothSeen, 'conflict する2スキルは同一候補に同時表示されない');
}

// ===== 枠拡張ノード（4→6→8） =====
section('13. 魂炎強化ノードで active 4→6→8');
{
  const node = reinc.nodes.find((n) => n.id === 'active_skill_slots');
  ok(node && node.effectType === 'activeSlots' && node.maxLevel === 2 && node.effectPerLevel === 2, 'active_skill_slots ノードが 4→6→8 相当（base4 + 2/level）');
  const base = cfg.slots.baseActiveSlots;
  ok(base + node.effectPerLevel * 1 === 6 && base + node.effectPerLevel * 2 === 8, 'Lv1=6・Lv2=8');
  // 枠が 6 のとき、新規 active を最大 5 種まで（初期火球1枠を除く）出せる状況を確認
  const d = newDraft(7);
  const cand = d.open(mkCtx({ owned: { active: { fireball: 1 }, passive: {} }, slots: { active: { used: 1, max: 6 }, passive: { used: 0, max: 4 } }, need: 4 }));
  ok(cand.some((c) => c.kind === 'new_active'), '枠6でも空きがあれば新規 active が出る');
}

// ===== 旧 active_run の超過（枠を owned 数に合わせると新規 active が出ない） =====
section('14. 旧途中セーブ超過（所持維持・新規禁止）');
{
  const d = newDraft(1);
  // 旧セーブで active を5種所持（新枠4を超過）→ slots.max を owned 数(5)に合わせる → 新規は出ない・強化は出る
  const owned = { active: { fireball: 2, flame_pillar: 2, burning_trail: 2, orbiting_flame: 2, meteor: 2 }, passive: {} };
  const cand = d.open(mkCtx({ owned, slots: { active: { used: 5, max: 5 }, passive: { used: 0, max: 4 } }, need: 4 }));
  ok(cand.every((c) => c.kind !== 'new_active'), '超過周回では新規 active を出さない');
  ok(cand.some((c) => c.kind === 'up_active'), '所持スキルの強化は出る（既存スキルは削除しない）');
}

// ===== パッシブ modifier =====
section('15. パッシブ modifier（未取得=恒等・取得で反映）');
{
  const pm = new PassiveManager({});
  pm.setDefs(passives, cfg);
  // 未取得 → すべて恒等
  ok(pm.getDamageMultiplier() === 1 && pm.getCooldownMultiplier() === 1 && pm.getAreaMultiplier() === 1 && pm.getDurationMultiplier() === 1, 'パッシブ未取得は全 modifier が恒等（M5-B 以前と同じ性能）');
  // 魔力増幅 Lv3 → damage +18%
  pm.setLevel('power_amp', 3);
  ok(Math.abs(pm.getDamageMultiplier() - 1.18) < 1e-9, '魔力増幅Lv3で damage ×1.18');
  ok(pm.getCooldownMultiplier() === 1, 'ダメージ強化はクールダウンに影響しない（二重適用なし）');
  // 高速詠唱 Lv5 → cooldown ×(1-0.20)=0.80
  pm.setLevel('swift_cast', 5);
  ok(Math.abs(pm.getCooldownMultiplier() - 0.8) < 1e-9, '高速詠唱Lv5で cooldown ×0.80');
  // 下限クランプ
  pm.setLevel('swift_cast', 5); pm._agg.subMult.cooldown = 0.9;
  ok(pm.getCooldownMultiplier() === 0.5, 'クールダウン倍率は安全下限(0.5)を下回らない');
  // 焦熱拡張 Lv2 area +10%, 残火持続 Lv4 duration +32%
  const pm2 = new PassiveManager({}); pm2.setDefs(passives, cfg);
  pm2.setLevel('scorch_expand', 2); pm2.setLevel('ember_persist', 4);
  ok(Math.abs(pm2.getAreaMultiplier() - 1.10) < 1e-9 && Math.abs(pm2.getDurationMultiplier() - 1.32) < 1e-9, '焦熱拡張/残火持続が area/duration に反映');
}

// ===== 結果 =====
console.log('');
if (fail) { console.error(`✗ スキル抽選テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ スキル抽選テスト成功: ${pass} 件すべて通過`); process.exit(0); }
