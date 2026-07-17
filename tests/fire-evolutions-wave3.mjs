// 新進化5種（M6-E）のデータ整合と進化条件判定（EvolutionManager.canEvolve）のテスト。Node標準のみ。
// 戦闘ランタイム（六芒星ポリゴン・万象炎鳴連鎖・終末状態遷移）は Phaser 依存のため、
// ここではデータ整合・進化条件・上限宣言を検証し、実挙動は docs/test-guide.md の実ブラウザ項目で確認する。
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
// M7-A: 火の魔女の進化のみを対象にする（氷術師の進化3種は別ジョブ・frost-evolutions.mjs で検証）。
const fireBaseIds = new Set(skills.filter((s) => (s.jobs || []).includes('flame_witch')).map((s) => s.id));
const evolutions = DataManager.data.skillEvolutions.evolutions.filter((e) => fireBaseIds.has(e.baseSkillId));
const passiveIds = new Set(DataManager.data.passives.passives.map((p) => p.id));
const skillIds = new Set(skills.map((s) => s.id));

const NEW_EVOS = ['necroflame_mausoleum', 'world_scorching_rift', 'hexagram_inferno_array', 'universal_flame_resonance', 'doomsday_core'];
const COND = {
  necroflame_mausoleum: ['funeral_pyres', 'phoenix_feather', false],
  world_scorching_rift: ['magma_vein', 'burning_trail', false],
  hexagram_inferno_array: ['tri_flame_array', 'flame_vortex', false],
  universal_flame_resonance: ['scorching_resonance', 'chain_flame', false],
  doomsday_core: ['core_overdrive', 'bloodfire_pact', false],
};

// ===== 1. データ整合 =====
section('1. 新進化5種のデータ整合');
{
  ok(new Set(NEW_EVOS).size === 5, '新進化は5種で一意');
  ok(evolutions.length === 18, `進化総数が18種 (${evolutions.length})`);
  const ids = new Set();
  for (const id of NEW_EVOS) {
    const ev = evolutions.find((e) => e.id === id);
    ok(!!ev, `${id} が存在`);
    if (!ev) continue;
    ok(!ids.has(ev.id), `${id} の ID が一意`); ids.add(ev.id);
    ok(ev.replacementSkillId === id, `${id} の replacementSkillId が自身`);
    ok(ev.baseSkillId === COND[id][0] && skillIds.has(ev.baseSkillId), `${id} の baseSkillId が対応する新 active`);
    ok(!skillIds.has(ev.replacementSkillId), `${id} は基礎スキルと ID 衝突しない`);
    for (const req of ev.requiredSkills || []) {
      ok(skillIds.has(req.skill) || passiveIds.has(req.skill), `${id} の補助 "${req.skill}" が実在`);
      ok(req.level >= 1 && req.level <= 8, `${id} の補助要求Lvが1〜8`);
    }
    ok(ev.safetyCaps && Object.values(ev.safetyCaps).every((v) => typeof v !== 'number' || v >= 0), `${id} の safetyCaps が非負`);
    ok(typeof ev.castMode === 'string', `${id} に castMode がある`);
    ok(ev.lv80ProjectileTarget !== true, `${id} は Lv80発射数対象外（単一形態）`);
  }
  // 参照実在チェックは全ジョブの進化ID（火18＋氷3）で行う（火の魔女以外の進化も未実装参照でないこと）。
  const allEvoIds = new Set(DataManager.data.skillEvolutions.evolutions.map((e) => e.id));
  for (const s of skills) for (const eb of s.evolutionBranches || []) ok(allEvoIds.has(eb), `${s.id} の evolutionBranches "${eb}" が実在（未実装参照なし）`);
}

// ===== 2. 進化条件（実ロジック） =====
section('2. 進化条件（EvolutionManager.canEvolve）');
{
  const profile = { skillMastery: {} };
  const mkSkills = (owned) => ({ hasEvolved: () => false, has: (id) => owned.active[id] != null, getLevel: (id) => owned.active[id] || 0 });
  const levelOf = (owned) => (id) => (owned.active[id] || owned.passive[id] || 0);
  for (const id of NEW_EVOS) {
    const [base, aux, auxPassive] = COND[id];
    const owned = { active: { [base]: 8 }, passive: {} };
    if (auxPassive) owned.passive[aux] = 4; else owned.active[aux] = 4;
    ok(EvolutionManager.canEvolve(mkSkills(owned), profile, base, levelOf(owned)) === true, `${id}: 基礎Lv8＋補助Lv4 で進化可能`);
    // 補助未達
    const owned2 = { active: { [base]: 8 }, passive: {} };
    ok(EvolutionManager.canEvolve(mkSkills(owned2), profile, base, levelOf(owned2)) === false, `${id}: 補助未取得では進化不可`);
    // 基礎未達
    const owned3 = { active: { [base]: 7 }, passive: {} };
    if (auxPassive) owned3.passive[aux] = 4; else owned3.active[aux] = 4;
    ok(EvolutionManager.canEvolve(mkSkills(owned3), profile, base, levelOf(owned3)) === false, `${id}: 基礎Lv8未満では進化不可`);
    // 補助はあくまで条件（消費されない＝基礎スキルのみが置換対象）。
    const ev = evolutions.find((e) => e.id === id);
    ok(ev.baseSkillId === base && !(ev.requiredSkills || []).some((r) => r.skill === base), `${id}: 補助スキルは基礎と別（枠を追加消費しない設計）`);
  }
}

// ===== 3. 既存13進化の非回帰 =====
section('3. 既存13進化が引き続き機能する');
{
  const OLD = ['infernal_barrage', 'purgatory_eruption', 'eternal_pyre', 'thousand_flame_lances', 'hundred_wisp_parade', 'solar_core_collapse', 'infernal_vortex_wheel', 'apocalypse_chain', 'solar_annihilation_array', 'hellfire_mine_network', 'inferno_blade_domain', 'ash_legion', 'star_devouring_furnace'];
  for (const id of OLD) ok(evolutions.some((e) => e.id === id), `既存進化 ${id} が存在`);
  ok(OLD.length === 13, '既存進化は13種');
  // 代表3種の条件判定が引き続き成立。
  const profile = { skillMastery: {} };
  const mkSkills = (owned) => ({ hasEvolved: () => false, has: (id) => owned.active[id] != null, getLevel: (id) => owned.active[id] || 0 });
  const levelOf = (owned) => (id) => (owned.active[id] || 0);
  const cases = [['fireball', { fireball: 8, orbiting_flame: 4 }], ['flame_pillar', { flame_pillar: 8, meteor: 4 }]];
  for (const [base, act] of cases) {
    const owned = { active: act, passive: {} };
    ok(EvolutionManager.canEvolve(mkSkills(owned), profile, base, levelOf(owned)) === true, `既存進化 ${base} が条件達成で可能`);
  }
}

console.log('');
if (fail) { console.error(`✗ 新進化(wave3)テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ 新進化(wave3)テスト成功: ${pass} 件すべて通過`); process.exit(0); }
