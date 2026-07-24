// M7-C: 氷術師 新進化5種の登録・進化条件・到達可能性・置換・枠不増加・Lv80対象外・既存非回帰の検証。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registeredSkillIds, skillsWithRuntimeState } from '../src/systems/SkillManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = (f) => JSON.parse(readFileSync(join(dir, 'data', f), 'utf8'));
const skills = L('skills.json').skills, evolutions = L('skill-evolutions.json').evolutions, jobs = L('jobs.json').jobs, passives = L('passives.json').passives;
const registered = new Set(registeredSkillIds());
const runtime = new Set(skillsWithRuntimeState());
const skillIds = new Set(skills.map((s) => s.id));
const passiveIds = new Set(passives.map((p) => p.id));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

// 新進化5種: base / aux（進化条件の補助スキル・passive）/ Lv / castMode / echo。
const EVO = {
  rime_execution_wheel: { base: 'rime_boomerang', aux: 'frost_amplification', auxLv: 4, castMode: 'cooldown', echo: 'standard' },
  eternal_frost_chain: { base: 'frost_chain', aux: 'rapid_freezing', auxLv: 4, castMode: 'cooldown', echo: 'custom' },
  crystal_world_tree: { base: 'crystal_bloom', aux: 'frozen_expansion', auxLv: 4, castMode: 'periodic', echo: 'custom' },
  everlasting_white_mist: { base: 'snowblind_mist', aux: 'lingering_cold', auxLv: 4, castMode: 'continuous', echo: 'custom' },
  zero_hour_world: { base: 'frozen_clock', aux: 'ice_prison', auxLv: 4, castMode: 'periodic', echo: 'forbidden' },
};

const fm = jobs.find((j) => j.id === 'frost_mage');
const frostActiveIds = new Set(fm.activeSkillPool);
const frostEvos = evolutions.filter((e) => frostActiveIds.has(e.baseSkillId));

section('1. 新進化5種: 登録・base 置換・element ice・Lv80対象外・単一形態・進化条件・補助が氷術師 pool から取得可能');
{
  ok(Object.keys(EVO).length === 5, '新進化は5種');
  for (const [id, meta] of Object.entries(EVO)) {
    const e = evolutions.find((x) => x.id === id);
    if (!e) { ok(false, `${id} が存在`); continue; }
    ok(registered.has(id), `${id} に実装クラスが登録`);
    ok(e.baseSkillId === meta.base, `${id} の baseSkillId が ${meta.base} (${e.baseSkillId})`);
    ok(e.replacementSkillId === id, `${id} は base を置換する`);
    ok(e.element === 'ice', `${id} の element が ice`);
    ok(e.lv80ProjectileTarget === false, `${id} は Lv80発射数対象外`);
    ok(e.castMode === meta.castMode, `${id} の castMode が ${meta.castMode} (${e.castMode})`);
    ok(e.echoPolicy === meta.echo, `${id} の echoPolicy が ${meta.echo} (${e.echoPolicy})`);
    const reqs = e.requiredSkills || [];
    ok(reqs.length === 1 && reqs[0].skill === meta.aux && reqs[0].level === meta.auxLv, `${id} の進化条件が ${meta.aux} Lv${meta.auxLv}`);
    // 進化条件到達可能性: base は氷術師 active、aux は氷術師 active か frost_mage passive。
    ok(frostActiveIds.has(meta.base), `${id} の base ${meta.base} が氷術師 active pool にある`);
    const auxIsFrostActive = frostActiveIds.has(meta.aux);
    const auxIsFrostPassive = passiveIds.has(meta.aux) && (passives.find((p) => p.id === meta.aux)?.jobs || []).includes('frost_mage');
    ok(auxIsFrostActive || auxIsFrostPassive, `${id} の補助 ${meta.aux} が氷術師 pool（active/passive）から取得可能`);
    // 進化後は元 base の evolutionBranches に含まれる。
    const base = skills.find((s) => s.id === meta.base);
    ok(base && (base.evolutionBranches || []).includes(id), `${meta.base} の evolutionBranches に ${id}`);
    ok(fm.evolutionPool.includes(id), `${id} が frost_mage evolutionPool にある`);
    // 進化は単一形態（追加レベルアップ候補にならない＝skills.json に active として存在しない）。
    ok(!skillIds.has(id), `${id} は通常スキル（追加Lv）として登録されない`);
    ok(runtime.has(id), `${id} は runtimeState を保存する`);
  }
}

section('2. 氷術師 進化総数13・火の魔女進化18の非回帰・進化ID一意');
{
  ok(frostEvos.length === 13, `氷術師 進化13種 (${frostEvos.length})`);
  ok(fm.evolutionPool.length === 13, `frost_mage evolutionPool 13種 (${fm.evolutionPool.length})`);
  const fwj = jobs.find((j) => j.id === 'flame_witch');
  const fwActiveIds = new Set(fwj.activeSkillPool);
  const fwEvos = evolutions.filter((e) => fwActiveIds.has(e.baseSkillId));
  ok(fwEvos.length === 18, `火の魔女 進化18種の非回帰 (${fwEvos.length})`);
  const ids = evolutions.map((e) => e.id);
  ok(new Set(ids).size === ids.length, '進化IDが一意（重複なし）');
  // 既存氷術師 進化8種の非回帰（base 置換・element）。
  for (const id of ['diamond_blizzard', 'absolute_zero_domain', 'heaven_piercing_glacier', 'crystal_tempest', 'absolute_zero_ray', 'whiteout_cataclysm', 'frost_queen_court', 'world_end_avalanche']) {
    const e = evolutions.find((x) => x.id === id);
    ok(e && e.element === 'ice' && e.replacementSkillId === id, `既存進化 ${id} の非回帰`);
  }
}

section('3. 元 active と進化後スキルが同時に pool に存在しない衝突がない（進化は base を置換）');
{
  for (const [id, meta] of Object.entries(EVO)) {
    // base は active pool、進化は evolution pool（別枠）。進化後は base を置換するため active 枠を追加消費しない。
    ok(fm.activeSkillPool.includes(meta.base) && !fm.activeSkillPool.includes(id), `${id}: base は active、進化は active 枠を追加しない`);
  }
}

console.log(fail ? `\n✗ 氷術師 新進化(wave3)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師 新進化(wave3)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
