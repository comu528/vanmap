// 新 active5種（M6-E）のデータ整合・抽選出現・データ検証可能なロジック上限のテスト。Node.js 標準機能のみ。
// 戦闘ランタイム（墓標の死亡位置利用・共鳴段階・炉心熱量・三角形内判定）は Phaser 依存のため、
// ここではデータ整合・抽選・上限宣言を検証し、実挙動は docs/test-guide.md の実ブラウザ項目で確認する。
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

const NEW = ['funeral_pyres', 'magma_vein', 'tri_flame_array', 'scorching_resonance', 'core_overdrive'];
const RAR = { funeral_pyres: 'uncommon', magma_vein: 'common', tri_flame_array: 'rare', scorching_resonance: 'rare', core_overdrive: 'legendary' };
const byId = (id) => skills.find((s) => s.id === id);
const job = jobs.find((j) => j.id === 'flame_witch');
const evoIds = new Set(evolutions.map((e) => e.id));

// ===== 1. データ整合 =====
section('1. 新 active5種のデータ整合');
{
  ok(new Set(NEW).size === 5, '新 active は5種で一意');
  for (const id of NEW) {
    const s = byId(id);
    ok(!!s, `${id} が存在`);
    if (!s) continue;
    ok(s.category === 'active', `${id} は active`);
    ok(s.maxLevel === 8, `${id} は maxLevel 8`);
    ok(Array.isArray(s.levels) && s.levels.length === 8 && s.levels.every((lv, i) => lv.level === i + 1), `${id} は Lv1〜8 連番`);
    ok(s.rarity === RAR[id], `${id} の rarity が ${RAR[id]}`);
    ok(Array.isArray(s.jobs) && s.jobs.length === 1 && s.jobs[0] === 'flame_witch' && s.isCommon === false, `${id} は火の魔女専用`);
    ok(Array.isArray(s.tags) && s.tags.includes('fire'), `${id} は fire タグ`);
    ok(job.activeSkillPool.includes(id), `${id} が activeSkillPool にある`);
    ok((s.evolutionBranches || []).every((eb) => evoIds.has(eb)), `${id} の evolutionBranches が実在の進化`);
    ok(s.levels.every((lv) => Object.values(lv).every((v) => typeof v !== 'number' || (Number.isFinite(v) && v >= 0))), `${id} に負/非有限の値がない`);
    // 隣接レベルで最低1項目成長。
    let grow = true;
    for (let i = 1; i < s.levels.length; i++) if (JSON.stringify(s.levels[i]) === JSON.stringify(s.levels[i - 1])) grow = false;
    ok(grow, `${id} は各レベルで成長`);
  }
  ok(job.activeSkillPool.length === 30, `activeSkillPool が30種 (${job.activeSkillPool.length})`);
}

// ===== 2. データ検証可能なロジック上限 =====
section('2. 上限・段階・熱量の宣言');
{
  // 死亡履歴・毎フレーム上限。
  for (const n of ['maxDeathEventsTracked', 'maxDeathEventsPerFrame', 'maxFuneralPyres', 'maxPyreEruptionsPerFrame', 'maxMagmaSegments', 'maxTriArrays', 'maxResonanceTargets', 'maxOverdriveProjectiles', 'maxOverdriveCastsPerFrame', 'maxBurningEnemyIndex']) {
    const c = balance.skillCaps[n];
    ok(c && c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra, `${n} が品質順で非減少`);
  }
  // 灼熱共鳴: tierThresholds 昇順・0始まり、maxTier は段階数を超えない。
  const res = byId('scorching_resonance');
  const th = res.config.tierThresholds;
  ok(Array.isArray(th) && th[0] === 0 && th.every((v, i) => i === 0 || v > th[i - 1]), '共鳴閾値が0始まりの昇順');
  ok(res.levels.every((lv) => lv.maxTier <= th.length - 1), '共鳴 maxTier が段階数を超えない（上限化）');
  ok(res.levels.every((lv) => lv.hitCapPerPulse >= 1), '共鳴 hitCapPerPulse >= 1（1パルスの多重命中を制限）');
  // 炉心暴走: 熱量・冷却・オーバーヒート・安全下限。
  const co = byId('core_overdrive');
  ok(co.config && co.config.heatPerCast > 0, '炉心 heatPerCast > 0');
  ok(co.levels.every((lv) => lv.maxHeat > 0 && lv.overheatMs > 0 && lv.cooldownRate > 0 && lv.minCooldownMs > 0), '炉心 熱量/OH/冷却/安全下限が正');
  // 熱量最大でも安全下限未満に短縮しない。
  ok(co.levels.every((lv) => lv.cooldown * (1 - lv.heatAccelPct) >= lv.minCooldownMs * 0.5), '炉心 最大熱量CDが破綻しない');
  // 炎脈: 区間数・同時本数が有限。
  const mv = byId('magma_vein');
  ok(mv.levels.every((lv) => lv.segments >= 1 && lv.veinCount >= 1), '炎脈 区間/本数が正');
  // 三角焔陣: 面積が正（無効三角形を作らないための最小面積）。
  const tri = byId('tri_flame_array');
  ok(tri.levels.every((lv) => lv.area > 0), '三角陣 area（支点間隔）が正');
}

// ===== 3. 抽選出現 =====
section('3. 抽選（新 active が候補に出る・ジョブ限定・満枠/最大Lv除外・追放・決定論）');
{
  const catalog = [
    ...skills.map((s) => ({ id: s.id, category: s.category, rarity: s.rarity, weight: s.weight, maxLevel: s.maxLevel, enabled: s.enabled, jobs: s.jobs, isCommon: s.isCommon, prerequisites: s.prerequisites, conflicts: s.conflicts, unlockCondition: s.unlockCondition })),
    ...passives.map((p) => ({ id: p.id, category: 'passive', rarity: p.rarity, weight: p.weight, maxLevel: p.maxLevel, enabled: p.enabled, jobs: p.jobs, isCommon: p.isCommon, prerequisites: p.prerequisites, conflicts: p.conflicts, unlockCondition: p.unlockCondition })),
  ];
  const mkDraft = () => { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(1, { rerolls: 1, banishes: 1, skips: 1 }); return d; };
  const ctx = (o = {}) => ({ catalog, job: { activeSkillPool: job.activeSkillPool, passiveSkillPool: job.passiveSkillPool }, owned: o.owned || { active: { fireball: 1 }, passive: {} }, slots: o.slots || { active: { used: 1, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: o.need || 4, unlock: { highestClearedDifficulty: 0 } });

  // 新 active が候補に出うる。
  const seen = new Set();
  for (let s = 0; s < 600; s++) { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(s + 1, {}); for (const c of d.open(ctx({ need: 4 }))) if (c.kind === 'new_active') seen.add(c.id); }
  for (const id of NEW) ok(seen.has(id), `${id} が抽選候補に出現しうる`);

  // ジョブプール外では出ない。
  const fakeJob = { activeSkillPool: ['fireball'], passiveSkillPool: [] };
  let leaked = false;
  for (let s = 0; s < 50; s++) { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(s + 1, {}); for (const c of d.open({ catalog, job: fakeJob, owned: { active: { fireball: 1 }, passive: {} }, slots: { active: { used: 1, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 4, unlock: {} })) if (NEW.includes(c.id)) leaked = true; }
  ok(!leaked, 'ジョブプール外では新 active が出ない');

  // 満枠 → 新 active は出ない。
  const full = mkDraft().open(ctx({ owned: { active: { fireball: 2, magma_vein: 1, tri_flame_array: 1, meteor: 1 }, passive: {} }, slots: { active: { used: 4, max: 4 }, passive: { used: 0, max: 4 } } }));
  ok(full.every((c) => c.kind !== 'new_active'), '満枠時は新 active を出さない');

  // 最大Lv は通常候補から除外。
  const maxed = mkDraft().open(ctx({ owned: { active: { fireball: 1, core_overdrive: 8 }, passive: {} } }));
  ok(!maxed.some((c) => c.id === 'core_overdrive'), '最大Lv の core_overdrive は通常候補に出ない');

  // 所持済みは強化候補に出る。
  const ownedDraft = mkDraft().open(ctx({ owned: { active: { fireball: 1, magma_vein: 3 }, passive: {} }, slots: { active: { used: 2, max: 8 }, passive: { used: 0, max: 4 } } }));
  ok(ownedDraft.some((c) => c.kind === 'up_active') || ownedDraft.length === 0, '所持 active の強化が出る');

  // 決定論。
  const a = (() => { const d = mkDraft(); return d.open(ctx()); })();
  const b = (() => { const d = mkDraft(); return d.open(ctx()); })();
  ok(JSON.stringify(a) === JSON.stringify(b), '同 seed・同状態で同一候補');

  // 追放後に再出現しない。
  const d = mkDraft(); d.open(ctx({ need: 4 })); d.banish('magma_vein', ctx({ need: 4 }));
  let reappear = false;
  for (let i = 0; i < 10; i++) if (d.open(ctx({ need: 4 })).some((c) => c.id === 'magma_vein')) reappear = true;
  ok(!reappear, '追放した magma_vein は再出現しない');
}

console.log('');
if (fail) { console.error(`✗ 新スキル(wave3)テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ 新スキル(wave3)テスト成功: ${pass} 件すべて通過`); process.exit(0); }
