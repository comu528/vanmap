// 新 active 10種（M6-B）のデータ整合と抽選出現のテスト。Node.js 標準機能のみ。
// 戦闘ランタイム（追尾/連鎖/刻印/防御）は Phaser 依存のため、ここではデータ整合・抽選・上限を検証し、
// 実挙動は docs/test-guide.md の実ブラウザ項目で確認する（実行していない項目は成功と報告しない方針）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (n) => JSON.parse(readFileSync(join(dir, n), 'utf8'));
const skills = load('skills.json').skills;
const passives = load('passives.json').passives;
const jobs = load('jobs.json').jobs;
const cfg = load('skill-config.json');
const balance = load('balance.json');
const evolutions = load('skill-evolutions.json').evolutions;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

const NEW_ACTIVES = ['flame_lance', 'scatter_flame', 'homing_wisp', 'chain_flame', 'lava_bomb', 'flame_vortex', 'fire_spirit', 'phoenix_feather', 'flame_barrier', 'detonation_mark'];
const EXPECT_RARITY = {
  flame_lance: 'common', scatter_flame: 'common', homing_wisp: 'uncommon', lava_bomb: 'uncommon',
  fire_spirit: 'uncommon', flame_barrier: 'uncommon', chain_flame: 'rare', flame_vortex: 'rare',
  detonation_mark: 'rare', phoenix_feather: 'legendary',
};
const byId = (id) => skills.find((s) => s.id === id);
const job = jobs.find((j) => j.id === 'flame_witch');
const evoIds = new Set(evolutions.map((e) => e.id));

// ===== 1. データ整合 =====
section('1. 新 active 10種のデータ整合');
{
  ok(new Set(NEW_ACTIVES).size === 10, '新 active は10種で一意');
  for (const id of NEW_ACTIVES) {
    const s = byId(id);
    ok(!!s, `${id} が存在`);
    if (!s) continue;
    ok(s.category === 'active', `${id} は active`);
    ok(s.maxLevel === 8, `${id} は maxLevel 8`);
    ok(Array.isArray(s.levels) && s.levels.length === 8 && s.levels.every((lv, i) => lv.level === i + 1), `${id} は Lv1〜8 が連番で存在`);
    ok(s.rarity === EXPECT_RARITY[id], `${id} の rarity が ${EXPECT_RARITY[id]}`);
    ok(Array.isArray(s.jobs) && s.jobs.length === 1 && s.jobs[0] === 'flame_witch' && s.isCommon === false, `${id} は火の魔女専用(isCommon:false)`);
    ok(Array.isArray(s.tags) && s.tags.length > 0, `${id} にタグがある`);
    ok(job.activeSkillPool.includes(id), `${id} が flame_witch の activeSkillPool にある`);
    // 負のダメージ/クールダウンがない
    ok(s.levels.every((lv) => (lv.damage == null || lv.damage >= 0) && (lv.cooldown == null || lv.cooldown >= 0) && (lv.shotDamage == null || lv.shotDamage >= 0)), `${id} に負のダメージ/CDがない`);
    // evolutionBranches は既存進化を参照 or 空
    ok((s.evolutionBranches || []).every((eb) => evoIds.has(eb)), `${id} の evolutionBranches が実在の進化のみ`);
  }
  // プールは 15種
  ok(job.activeSkillPool.length === 15, 'flame_witch の active プールは15種');
  // 各レベルで必ず変化がある（隣接レベルが完全一致しない）
  for (const id of NEW_ACTIVES) {
    const s = byId(id); let changed = true;
    for (let i = 1; i < s.levels.length; i++) if (JSON.stringify(s.levels[i]) === JSON.stringify(s.levels[i - 1])) changed = false;
    ok(changed, `${id} は各レベルで成長がある`);
  }
}

// ===== 2. 性能上限（skillCaps） =====
section('2. 性能上限 skillCaps（品質順で逆転しない）');
{
  const need = ['maxHomingWisps', 'maxSplitWisps', 'maxFlameLances', 'maxSummons', 'maxSummonProjectiles', 'maxActiveVortices', 'maxMarks', 'maxChainTargets', 'maxChainDepth', 'maxSimultaneousExplosions', 'maxEvolutionProjectiles', 'maxPhoenixEffects', 'maxBarrierEffects'];
  const caps = balance.skillCaps || {};
  for (const n of need) {
    const c = caps[n];
    ok(c && c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra, `${n} が品質順で非減少`);
  }
}

// ===== 3. 抽選出現 =====
section('3. 抽選（新 active が候補に出る・ジョブ限定・満枠/最大Lv除外・決定論）');
{
  const catalog = [
    ...skills.map((s) => ({ id: s.id, category: s.category, rarity: s.rarity, weight: s.weight, maxLevel: s.maxLevel, enabled: s.enabled, jobs: s.jobs, isCommon: s.isCommon, prerequisites: s.prerequisites, conflicts: s.conflicts, unlockCondition: s.unlockCondition })),
    ...passives.map((p) => ({ id: p.id, category: 'passive', rarity: p.rarity, weight: p.weight, maxLevel: p.maxLevel, enabled: p.enabled, jobs: p.jobs, isCommon: p.isCommon, prerequisites: p.prerequisites, conflicts: p.conflicts, unlockCondition: p.unlockCondition })),
  ];
  const mkDraft = () => { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(1, { rerolls: 1, banishes: 1, skips: 1 }); return d; };
  const ctx = (o = {}) => ({ catalog, job: { activeSkillPool: job.activeSkillPool, passiveSkillPool: [] }, owned: o.owned || { active: { fireball: 1 }, passive: {} }, slots: o.slots || { active: { used: 1, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: o.need || 4, unlock: { highestClearedDifficulty: 0 } });

  // 多数の seed で新 active が候補に出うる
  const seen = new Set();
  for (let s = 0; s < 400; s++) { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(s + 1, {}); for (const c of d.open(ctx({ need: 4 }))) if (c.kind === 'new_active') seen.add(c.id); }
  for (const id of NEW_ACTIVES) ok(seen.has(id), `${id} が抽選候補に出現しうる`);
  ok(seen.has('phoenix_feather'), '不死鳥の羽(legendary)も低確率で出現しうる（出現不能でない）');

  // 架空ジョブ（新 active を含まないプール・非共通）では出ない
  const fakeJob = { activeSkillPool: ['fireball'], passiveSkillPool: [] };
  let leaked = false;
  for (let s = 0; s < 50; s++) { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(s + 1, {}); for (const c of d.open({ catalog, job: fakeJob, owned: { active: { fireball: 1 }, passive: {} }, slots: { active: { used: 1, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 4, unlock: {} })) if (NEW_ACTIVES.includes(c.id)) leaked = true; }
  ok(!leaked, 'ジョブプール外では新 active が出ない');

  // active 枠満杯 → 新 active は出ない
  const full = mkDraft().open(ctx({ owned: { active: { fireball: 2, flame_lance: 1, scatter_flame: 1, meteor: 1 }, passive: {} }, slots: { active: { used: 4, max: 4 }, passive: { used: 0, max: 4 } } }));
  ok(full.every((c) => c.kind !== 'new_active'), '満枠時は新 active を出さない');
  ok(full.some((c) => c.kind === 'up_active') || full.length === 0, '所持済み active の強化は出る');

  // 最大Lv の新 active は通常候補から除外
  const maxed = mkDraft().open(ctx({ owned: { active: { fireball: 1, flame_lance: 8 }, passive: {} } }));
  ok(!maxed.some((c) => c.id === 'flame_lance'), '最大Lv の flame_lance は通常候補に出ない');

  // 決定論
  const a = (() => { const d = mkDraft(); return d.open(ctx()); })();
  const b = (() => { const d = mkDraft(); return d.open(ctx()); })();
  ok(JSON.stringify(a) === JSON.stringify(b), '同 seed・同状態で同一候補');

  // 追放後に再出現しない
  const d = mkDraft(); d.open(ctx({ need: 4 })); d.banish('flame_lance', ctx({ need: 4 }));
  let reappear = false;
  for (let i = 0; i < 10; i++) if (d.open(ctx({ need: 4 })).some((c) => c.id === 'flame_lance')) reappear = true;
  ok(!reappear, '追放した flame_lance は再出現しない');
}

console.log('');
if (fail) { console.error(`✗ 新スキル(データ/抽選)テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ 新スキル(データ/抽選)テスト成功: ${pass} 件すべて通過`); process.exit(0); }
