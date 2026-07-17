// 新 active 10種（M6-D）のデータ整合・抽選出現・cast メタ・性能上限のテスト。Node.js 標準機能のみ。
// 戦闘ランタイム（光線/地雷/反射/複製/吸収/鎖/ダッシュ）は Phaser 依存のため実ブラウザで確認する。
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

const NEW = ['scorching_ray', 'ember_minefield', 'flame_crescent', 'ricochet_ember', 'ash_doppelganger', 'bloodfire_pact', 'bullet_furnace', 'four_sided_inferno', 'molten_chains', 'blazing_step'];
const EXPECT_RARITY = {
  ember_minefield: 'common', flame_crescent: 'common', ricochet_ember: 'common',
  scorching_ray: 'uncommon', molten_chains: 'uncommon', blazing_step: 'uncommon',
  ash_doppelganger: 'rare', bloodfire_pact: 'rare', four_sided_inferno: 'rare',
  bullet_furnace: 'legendary',
};
const byId = (id) => skills.find((s) => s.id === id);
const job = jobs.find((j) => j.id === 'flame_witch');
const evoIds = new Set(evolutions.map((e) => e.id));

// ===== 1. データ整合 =====
section('1. 新 active 10種のデータ整合');
{
  ok(new Set(NEW).size === 10, '新 active は10種で一意');
  for (const id of NEW) {
    const s = byId(id);
    ok(!!s, `${id} が存在`);
    if (!s) continue;
    ok(s.category === 'active' && s.maxLevel === 8, `${id} は active・maxLevel8`);
    ok(Array.isArray(s.levels) && s.levels.length === 8 && s.levels.every((lv, i) => lv.level === i + 1), `${id} は Lv1〜8 連番`);
    ok(s.rarity === EXPECT_RARITY[id], `${id} の rarity が ${EXPECT_RARITY[id]}`);
    ok(Array.isArray(s.jobs) && s.jobs.length === 1 && s.jobs[0] === 'flame_witch' && s.isCommon === false, `${id} は火の魔女専用`);
    ok(Array.isArray(s.tags) && s.tags.length > 0, `${id} にタグ`);
    ok(job.activeSkillPool.includes(id), `${id} がプールにある`);
    ok(['standard', 'custom', 'forbidden'].includes(s.echoPolicy) && ['standard', 'custom', 'forbidden'].includes(s.clonePolicy), `${id} の echo/clonePolicy が妥当`);
    ok((s.evolutionBranches || []).every((eb) => evoIds.has(eb)), `${id} の evolutionBranches が実在の進化のみ`);
    // 隣接レベルで最低1項目は成長
    let changed = true;
    for (let i = 1; i < 8; i++) if (JSON.stringify(s.levels[i]) === JSON.stringify(s.levels[i - 1])) changed = false;
    ok(changed, `${id} は各レベルで成長`);
    // 負のダメージ/CDなし
    ok(s.levels.every((lv) => Object.entries(lv).every(([k, v]) => typeof v !== 'number' || v >= 0 || !/damage|cooldown/i.test(k))), `${id} に負のダメージ/CDなし`);
  }
  ok(job.activeSkillPool.length === 25, 'flame_witch の active プールは25種');
  // 危険スキルの policy
  ok(byId('ash_doppelganger').echoPolicy === 'forbidden' && byId('ash_doppelganger').clonePolicy === 'forbidden', '灰燼分身は forbidden/forbidden');
  ok(byId('blazing_step').echoPolicy === 'forbidden' && byId('blazing_step').clonePolicy === 'forbidden', '爆炎歩法は forbidden/forbidden');
  ok(byId('bloodfire_pact').echoPolicy === 'custom' && byId('bloodfire_pact').usesResourceCost === true, '血炎契約は custom・資源消費');
  ok(byId('bullet_furnace').echoPolicy === 'custom' && byId('bullet_furnace').isDefensive === true && byId('bullet_furnace').isReactive === true, '弾喰い炉は custom・防御・反応');
}

// ===== 2. 性能上限（skillCaps） =====
section('2. 新 skillCaps（品質順で逆転しない・非負整数）');
{
  const need = ['maxActiveBeams', 'maxBeamTicksPerFrame', 'maxMines', 'maxMineExplosionsPerFrame', 'maxRicochetProjectiles', 'maxRicochetChecksPerFrame', 'maxClones', 'maxCloneCastsPerFrame', 'maxBloodfireProjectiles', 'maxAbsorbedBulletsPerSecond', 'maxFurnaceCharge', 'maxFurnaceProjectiles', 'maxScreenEdgeWaves', 'maxTethers', 'maxTetherRetargetsPerFrame', 'maxBlazingTrails', 'maxSolarMirrors', 'maxMineNetworkDepth', 'maxMineNetworkExplosions', 'maxInfernoBlades', 'maxAshLegionUnits', 'maxAshLegionCastsPerFrame', 'maxStarFurnaceCores', 'maxStarFurnaceProjectiles', 'maxCopyGeneration', 'maxEchoCloneGeneration'];
  const caps = balance.skillCaps || {};
  for (const n of need) {
    const c = caps[n];
    ok(c && c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra, `${n} が品質順で非減少`);
    ok(c && [c.low, c.medium, c.high, c.ultra].every((v) => Number.isInteger(v) && v >= 0), `${n} が非負整数`);
  }
  ok(caps.maxCopyGeneration.ultra === 1 && caps.maxEchoCloneGeneration.ultra === 1, '複製世代上限は1（無限複製防止）');
}

// ===== 3. 抽選出現 =====
section('3. 抽選（新 active が候補に出る・ジョブ限定・満枠/最大Lv除外・決定論・Lv70重み）');
{
  const catalog = [
    ...skills.map((s) => ({ id: s.id, category: s.category, rarity: s.rarity, weight: s.weight, maxLevel: s.maxLevel, enabled: s.enabled, jobs: s.jobs, isCommon: s.isCommon, prerequisites: s.prerequisites, conflicts: s.conflicts, unlockCondition: s.unlockCondition })),
    ...passives.map((p) => ({ id: p.id, category: 'passive', rarity: p.rarity, weight: p.weight, maxLevel: p.maxLevel, enabled: p.enabled, jobs: p.jobs, isCommon: p.isCommon, prerequisites: p.prerequisites, conflicts: p.conflicts, unlockCondition: p.unlockCondition })),
  ];
  const ctx = (o = {}) => ({ catalog, job: { activeSkillPool: job.activeSkillPool, passiveSkillPool: [] }, owned: o.owned || { active: { fireball: 1 }, passive: {} }, slots: o.slots || { active: { used: 1, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: o.need || 4, unlock: { highestClearedDifficulty: 0 } });

  const seen = new Set();
  for (let s = 0; s < 500; s++) { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(s + 1, {}); for (const c of d.open(ctx({ need: 4 }))) if (c.kind === 'new_active') seen.add(c.id); }
  for (const id of NEW) ok(seen.has(id), `${id} が抽選候補に出現しうる`);
  ok(seen.has('bullet_furnace'), '弾喰い炉(legendary)も低確率で出現しうる');

  // ジョブ外では出ない
  const fakeJob = { activeSkillPool: ['fireball'], passiveSkillPool: [] };
  let leaked = false;
  for (let s = 0; s < 50; s++) { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(s + 1, {}); for (const c of d.open({ catalog, job: fakeJob, owned: { active: { fireball: 1 }, passive: {} }, slots: { active: { used: 1, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 4, unlock: {} })) if (NEW.includes(c.id)) leaked = true; }
  ok(!leaked, 'ジョブプール外では新 active が出ない');

  // 満枠時は新 active を出さない・所持強化は出る
  const full = (() => { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(1, {}); return d.open(ctx({ owned: { active: { fireball: 2, scorching_ray: 1, molten_chains: 1, blazing_step: 1 }, passive: {} }, slots: { active: { used: 4, max: 4 }, passive: { used: 0, max: 4 } } })); })();
  ok(full.every((c) => c.kind !== 'new_active'), '満枠時は新 active を出さない');

  // 最大Lv除外
  const maxed = (() => { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(1, {}); return d.open(ctx({ owned: { active: { fireball: 1, scorching_ray: 8 }, passive: {} } })); })();
  ok(!maxed.some((c) => c.id === 'scorching_ray'), '最大Lv の scorching_ray は通常候補に出ない');

  // 決定論
  const mk = () => { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(77, {}); return d.open(ctx()); };
  ok(JSON.stringify(mk()) === JSON.stringify(mk()), '同 seed・同状態で同一候補');

  // 追放後に再出現しない
  const d2 = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d2.reset(5, {}); d2.open(ctx({ need: 4 })); d2.banish('ricochet_ember', ctx({ need: 4 }));
  let reappear = false;
  for (let i = 0; i < 10; i++) if (d2.open(ctx({ need: 4 })).some((c) => c.id === 'ricochet_ember')) reappear = true;
  ok(!reappear, '追放した ricochet_ember は再出現しない');

  // Lv70 抽選重み倍率が共通経路で反映（決定論維持）
  const mult = { rare: 1.15, legendary: 1.25 };
  const withMult = () => { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights, rarityWeightMult: mult }); d.reset(9, {}); return d.open(ctx()); };
  ok(JSON.stringify(withMult()) === JSON.stringify(withMult()), 'Lv70重み倍率つきでも同 seed で決定論');
  const noMult = () => { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights, rarityWeightMult: { rare: 1, legendary: 1 } }); d.reset(9, {}); return d.open(ctx()); };
  ok(JSON.stringify(noMult()) === JSON.stringify((() => { const d = new SkillDraftManager({ rarityWeights: cfg.rarityWeights }); d.reset(9, {}); return d.open(ctx()); })()), 'Lv1(倍率1)は倍率なしと同一（非回帰）');
}

console.log('');
if (fail) { console.error(`✗ 新スキル(データ/抽選)テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ 新スキル(データ/抽選)テスト成功: ${pass} 件すべて通過`); process.exit(0); }
