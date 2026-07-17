// 新進化5種（M6-D）のデータ整合と進化条件判定（EvolutionManager.canEvolve・パッシブ/active補助対応）のテスト。
// 既存8進化の非回帰も確認する。Node標準のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DataManager } from '../src/systems/DataManager.js';
import { EvolutionManager } from '../src/systems/EvolutionManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (n) => JSON.parse(readFileSync(join(dir, n), 'utf8'));

DataManager.data.skills = load('skills.json');
DataManager.data.skillEvolutions = load('skill-evolutions.json');
DataManager.data.skillMastery = load('skill-mastery.json');
DataManager.data.balance = load('balance.json');
DataManager.data.reincarnation = load('reincarnation.json');
DataManager.data.passives = load('passives.json');
for (const s of DataManager.data.skills.skills) DataManager._skillMap.set(s.id, s);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

const skills = DataManager.data.skills.skills;
const evolutions = DataManager.data.skillEvolutions.evolutions;
const passiveIds = new Set(DataManager.data.passives.passives.map((p) => p.id));
const skillIds = new Set(skills.map((s) => s.id));

const NEW_EVOS = ['solar_annihilation_array', 'hellfire_mine_network', 'inferno_blade_domain', 'ash_legion', 'star_devouring_furnace'];
// base, aux, auxIsPassive
const COND = {
  solar_annihilation_array: ['scorching_ray', 'swift_cast', true],
  hellfire_mine_network: ['ember_minefield', 'detonation_mark', false],
  inferno_blade_domain: ['flame_crescent', 'flame_barrier', false],
  ash_legion: ['ash_doppelganger', 'fire_spirit', false],
  star_devouring_furnace: ['bullet_furnace', 'phoenix_feather', false],
};

// ===== 1. データ整合 =====
section('1. 新進化5種のデータ整合');
{
  ok(new Set(NEW_EVOS).size === 5, '新進化は5種で一意');
  ok(evolutions.length === 13, '進化は合計13種（既存8＋新5）');
  const ids = new Set();
  for (const id of NEW_EVOS) {
    const ev = evolutions.find((e) => e.id === id);
    ok(!!ev, `${id} が存在`);
    if (!ev) continue;
    ok(!ids.has(ev.id), `${id} の ID が一意`); ids.add(ev.id);
    ok(ev.replacementSkillId === id, `${id} の replacementSkillId が自身`);
    ok(skillIds.has(ev.baseSkillId), `${id} の baseSkillId が実在の active`);
    ok(!skillIds.has(ev.replacementSkillId), `${id} の replacementSkillId は基礎スキルと衝突しない`);
    for (const req of ev.requiredSkills || []) {
      ok(skillIds.has(req.skill) || passiveIds.has(req.skill), `${id} の補助 "${req.skill}" が active/passive に実在`);
      ok(req.level >= 1 && req.level <= 8, `${id} の補助要求Lvが1〜8`);
    }
    ok(ev.safetyCaps && Object.values(ev.safetyCaps).every((v) => typeof v !== 'number' || v >= 0), `${id} の safetyCaps が非負`);
    ok(['standard', 'custom', 'forbidden'].includes(ev.echoPolicy) && ['standard', 'custom', 'forbidden'].includes(ev.clonePolicy), `${id} の echo/clonePolicy が妥当`);
  }
  // evolutionBranches が全て実在（新スキル→新進化の対応）
  const allEvoIds = new Set(evolutions.map((e) => e.id));
  for (const s of skills) for (const eb of s.evolutionBranches || []) ok(allEvoIds.has(eb), `${s.id} の evolutionBranches "${eb}" が実在`);
  // 進化を追加しない新スキルは evolutionBranches 空
  for (const id of ['ricochet_ember', 'bloodfire_pact', 'four_sided_inferno', 'molten_chains', 'blazing_step']) {
    const s = skills.find((x) => x.id === id);
    ok((s.evolutionBranches || []).length === 0, `${id} は evolutionBranches が空`);
  }
  // ash_legion / star_devouring_furnace は forbidden/custom（危険な複製再帰を防止）
  ok(evolutions.find((e) => e.id === 'ash_legion').echoPolicy === 'forbidden', '灰燼軍勢は echo forbidden');
  ok(evolutions.find((e) => e.id === 'star_devouring_furnace').echoPolicy === 'custom', '星喰い炉は echo custom');
}

// ===== 2. 進化条件（実ロジック） =====
section('2. 進化条件（EvolutionManager.canEvolve・パッシブ/active補助対応）');
{
  const profile = { skillMastery: {} };
  const mkSkills = (owned) => ({ hasEvolved: () => false, has: (id) => owned.active[id] != null, getLevel: (id) => owned.active[id] || 0 });
  const levelOf = (owned) => (id) => (owned.active[id] || owned.passive[id] || 0);

  for (const id of NEW_EVOS) {
    const [base, aux, auxPassive] = COND[id];
    const owned = { active: { [base]: 8 }, passive: {} };
    if (auxPassive) owned.passive[aux] = 4; else owned.active[aux] = 4;
    ok(EvolutionManager.canEvolve(mkSkills(owned), profile, base, levelOf(owned)) === true, `${id}: 基礎Lv8＋補助Lv4 で進化可能`);
    const owned2 = { active: { [base]: 8 }, passive: {} };
    ok(EvolutionManager.canEvolve(mkSkills(owned2), profile, base, levelOf(owned2)) === false, `${id}: 補助未取得では不可`);
    const owned3 = { active: { [base]: 7 }, passive: {} };
    if (auxPassive) owned3.passive[aux] = 4; else owned3.active[aux] = 4;
    ok(EvolutionManager.canEvolve(mkSkills(owned3), profile, base, levelOf(owned3)) === false, `${id}: 基礎Lv8未満では不可`);
  }
}

// ===== 3. 既存8進化の非回帰 =====
section('3. 既存8進化が引き続き機能する');
{
  const profile = { skillMastery: {} };
  const mkSkills = (owned) => ({ hasEvolved: () => false, has: (id) => owned.active[id] != null, getLevel: (id) => owned.active[id] || 0 });
  const levelOf = (owned) => (id) => (owned.active[id] || owned.passive[id] || 0);
  const cases = [
    ['fireball', { fireball: 8, orbiting_flame: 4 }, {}],
    ['flame_pillar', { flame_pillar: 8, meteor: 4 }, {}],
    ['burning_trail', { burning_trail: 8, orbiting_flame: 4 }, {}],
    ['flame_lance', { flame_lance: 8 }, { swift_cast: 4 }],
    ['homing_wisp', { homing_wisp: 8, fire_spirit: 4 }, {}],
    ['lava_bomb', { lava_bomb: 8 }, { scorch_expand: 4 }],
    ['flame_vortex', { flame_vortex: 8, burning_trail: 4 }, {}],
    ['detonation_mark', { detonation_mark: 8 }, { power_amp: 4 }],
  ];
  for (const [base, act, pas] of cases) {
    const owned = { active: act, passive: pas };
    ok(EvolutionManager.canEvolve(mkSkills(owned), profile, base, levelOf(owned)) === true, `既存進化 ${base} が条件達成で可能`);
    const owned2 = { active: { [base]: 8 }, passive: {} };
    ok(EvolutionManager.canEvolve(mkSkills(owned2), profile, base, levelOf(owned2)) === false, `既存進化 ${base} は補助未達で不可`);
  }
}

console.log('');
if (fail) { console.error(`✗ 新進化テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ 新進化テスト成功: ${pass} 件すべて通過`); process.exit(0); }
