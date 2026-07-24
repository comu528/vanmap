// M7-D: 氷術師 新進化5種の登録・進化条件・到達可能性・置換・枠不増加・Lv80対象外・ice_prison維持・既存非回帰の検証。Node.js 標準機能のみ。
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

const EVO = {
  heavenfall_glacier_lances: { base: 'glacial_spear_rain', aux: 'frost_amplification', auxLv: 4, castMode: 'periodic', echo: 'custom' },
  crystal_sentinel_legion: { base: 'snowflake_sentry', aux: 'rapid_freezing', auxLv: 4, castMode: 'continuous', echo: 'custom' },
  continental_glacier_rush: { base: 'iceberg_ram', aux: 'frozen_expansion', auxLv: 4, castMode: 'cooldown', echo: 'custom' },
  eternal_sealed_coffin: { base: 'absolute_ice_seal', aux: 'ice_prison', auxLv: 4, castMode: 'reactive', echo: 'forbidden' },
  polar_night_aurora: { base: 'aurora_veil', aux: 'lingering_cold', auxLv: 4, castMode: 'continuous', echo: 'forbidden' },
};

const fm = jobs.find((j) => j.id === 'frost_mage');
const frostActiveIds = new Set(fm.activeSkillPool);
const frostEvos = evolutions.filter((e) => frostActiveIds.has(e.baseSkillId));

section('1. 新進化5種: 登録・base置換・element ice・Lv80対象外・単一形態・進化条件・補助が氷術師 pool から取得可能');
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
    ok(frostActiveIds.has(meta.base), `${id} の base ${meta.base} が氷術師 active pool にある`);
    const auxIsActive = frostActiveIds.has(meta.aux);
    const auxIsFrostPassive = passiveIds.has(meta.aux) && (passives.find((p) => p.id === meta.aux)?.jobs || []).includes('frost_mage');
    ok(auxIsActive || auxIsFrostPassive, `${id} の補助 ${meta.aux} が氷術師 pool（active/passive）から取得可能`);
    const base = skills.find((s) => s.id === meta.base);
    ok(base && (base.evolutionBranches || []).includes(id), `${meta.base} の evolutionBranches に ${id}`);
    ok(fm.evolutionPool.includes(id), `${id} が frost_mage evolutionPool にある`);
    ok(!skillIds.has(id), `${id} は通常スキル（追加Lv）として登録されない`);
    ok(runtime.has(id), `${id} は runtimeState を保存する`);
  }
}

section('2. ice_prison は補助条件だが置換されず active pool に残る（eternal_sealed_coffin）');
{
  ok(frostActiveIds.has('ice_prison'), 'ice_prison は氷術師 active pool に残る');
  ok(!evolutions.some((e) => e.replacementSkillId === 'ice_prison'), 'ice_prison を置換する進化が無い');
  const esc = evolutions.find((e) => e.id === 'eternal_sealed_coffin');
  ok(esc && esc.baseSkillId === 'absolute_ice_seal', 'eternal_sealed_coffin は absolute_ice_seal を置換（ice_prison は補助）');
  ok(esc && (esc.propagation || {}).generations === 1, 'eternal_sealed_coffin の伝播世代は1');
}

section('3. 氷術師 進化総数18・火の魔女進化18の非回帰・進化ID一意・既存13非回帰');
{
  ok(frostEvos.length === 18, `氷術師 進化18種 (${frostEvos.length})`);
  ok(fm.evolutionPool.length === 18, `frost_mage evolutionPool 18種 (${fm.evolutionPool.length})`);
  const fwj = jobs.find((j) => j.id === 'flame_witch');
  const fwActiveIds = new Set(fwj.activeSkillPool);
  ok(evolutions.filter((e) => fwActiveIds.has(e.baseSkillId)).length === 18, '火の魔女 進化18種の非回帰');
  const ids = evolutions.map((e) => e.id);
  ok(new Set(ids).size === ids.length, '進化IDが一意');
  for (const id of ['diamond_blizzard', 'crystal_tempest', 'rime_execution_wheel', 'zero_hour_world', 'everlasting_white_mist', 'world_end_avalanche']) {
    const e = evolutions.find((x) => x.id === id); ok(e && e.element === 'ice' && e.replacementSkillId === id, `既存進化 ${id} の非回帰`);
  }
}

section('4. 進化は base を active 枠追加なしで置換する');
{
  for (const [id, meta] of Object.entries(EVO)) ok(fm.activeSkillPool.includes(meta.base) && !fm.activeSkillPool.includes(id), `${id}: base は active、進化は active 枠を追加しない`);
}

console.log(fail ? `\n✗ 氷術師 新進化(wave4)テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師 新進化(wave4)テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
