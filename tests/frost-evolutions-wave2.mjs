// M7-B: 氷術師 新進化5種のデータ・条件・登録・上限の検証。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registeredSkillIds, skillsWithRuntimeState } from '../src/systems/SkillManager.js';
import { buildCatalog, evolutionRecipes } from '../src/systems/SkillCatalog.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = (f) => JSON.parse(readFileSync(join(dir, 'data', f), 'utf8'));
const skills = L('skills.json').skills, passives = L('passives.json').passives, evolutions = L('skill-evolutions.json').evolutions, jobs = L('jobs.json').jobs;
const registered = new Set(registeredSkillIds());
const runtime = new Set(skillsWithRuntimeState());
const skillIds = new Set(skills.map((s) => s.id));
const passiveIds = new Set(passives.map((p) => p.id));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

// 新進化5種の期待（基礎 / 補助 / continuous 型は runtimeState なし）。
const NEW = {
  crystal_tempest: { base: 'icicle_volley', aux: 'frost_amplification', castMode: 'cooldown', runtime: true },
  absolute_zero_ray: { base: 'freezing_ray', aux: 'rapid_freezing', castMode: 'continuous', runtime: true },
  whiteout_cataclysm: { base: 'hailstorm', aux: 'lingering_cold', castMode: 'periodic', runtime: true },
  frost_queen_court: { base: 'frost_spirit', aux: 'frozen_expansion', castMode: 'continuous', runtime: false },
  world_end_avalanche: { base: 'avalanche', aux: 'ice_wall', castMode: 'periodic', runtime: true },
};

section('1. 新進化5種: 基礎・補助条件・置換・element ice・Lv80対象外・進化タグ・実装クラス');
{
  const fm = jobs.find((j) => j.id === 'frost_mage');
  ok(Object.keys(NEW).length === 5, '新進化は5種');
  for (const [id, meta] of Object.entries(NEW)) {
    const e = evolutions.find((x) => x.id === id);
    if (!e) { ok(false, `${id} が存在`); continue; }
    ok(e.baseSkillId === meta.base, `${id} の baseSkillId が ${meta.base} (${e.baseSkillId})`);
    ok(skillIds.has(e.baseSkillId), `${id} の基礎 ${e.baseSkillId} が実在`);
    ok(e.replacementSkillId === id, `${id} の replacementSkillId が id と一致`);
    ok(e.element === 'ice', `${id} の element が ice`);
    ok(e.lv80ProjectileTarget === false, `${id} は Lv80発射数対象外`);
    ok(e.visualTier === 'evolved', `${id} は evolved タグ`);
    ok(registered.has(id), `${id} に実装クラスが登録`);
    ok(runtime.has(id) === meta.runtime, `${id} の runtimeState 保持=${meta.runtime}`);
    // 補助条件（1件・実在・Lv1..8）。
    const reqs = e.requiredSkills || [];
    ok(reqs.length === 1 && reqs[0].skill === meta.aux, `${id} の補助条件が ${meta.aux}`);
    ok(skillIds.has(meta.aux) || passiveIds.has(meta.aux), `${id} の補助 ${meta.aux} が実在`);
    ok(reqs.every((r) => r.level >= 1 && r.level <= 8), `${id} の補助レベルが1..8`);
    // safetyCaps 非負。
    for (const [k, v] of Object.entries(e.safetyCaps || {})) ok(typeof v === 'number' && v >= 0, `${id} safetyCaps.${k} 非負`);
    // 基礎の evolutionBranches に載る・evolutionPool に含まれる。
    const b = skills.find((s) => s.id === meta.base);
    ok((b.evolutionBranches || []).includes(id), `${meta.base} の evolutionBranches に ${id}`);
    ok(fm.evolutionPool.includes(id), `frost_mage evolutionPool に ${id}`);
  }
}

section('2. カタログ: 氷術師の進化は合計13種・不整合0・進化は枠を追加消費しない');
{
  const cat = buildCatalog({ skills, passives, evolutions, jobs, jobId: 'frost_mage', registeredIds: registeredSkillIds(), runtimeStateIds: skillsWithRuntimeState() });
  ok(cat.summary.evolutionCount === 13, `氷術師 進化13種 (${cat.summary.evolutionCount})`);
  ok(cat.issues.length === 0, `不整合0 (${JSON.stringify(cat.issues)})`);
  const recipes = evolutionRecipes(cat);
  for (const id of Object.keys(NEW)) {
    const r = recipes.find((x) => x.evolutionId === id);
    // 進化は基礎を置換し active 枠を追加消費しない。成立に必要な active 取得数=基礎1＋active補助数
    // （world_end_avalanche のみ補助が ice_wall= active のため 2、他は passive 補助で 1）。
    ok(r && r.minActiveSkills === 1 + r.auxActive.length, `${id} は基礎＋active補助のみで成立（枠を追加消費しない）`);
    ok(r && r.auxActive.length + r.auxPassive.length === 1, `${id} の補助は1件`);
  }
}

section('3. 火の魔女進化18種・氷術師既存3種の非回帰（進化ID一意）');
{
  const fw = buildCatalog({ skills, passives, evolutions, jobs, jobId: 'flame_witch', registeredIds: registeredSkillIds(), runtimeStateIds: skillsWithRuntimeState() });
  ok(fw.summary.evolutionCount === 18, `flame_witch 進化18種 (${fw.summary.evolutionCount})`);
  const ids = evolutions.map((e) => e.id);
  ok(new Set(ids).size === ids.length, '進化ID全体で一意');
  for (const id of ['diamond_blizzard', 'absolute_zero_domain', 'heaven_piercing_glacier']) ok(registered.has(id), `既存氷進化 ${id} 維持`);
}

console.log(fail ? `\n✗ 氷術師 新進化(wave2)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師 新進化(wave2)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
