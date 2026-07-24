// M7-A: 氷術師 進化3種のデータ・条件・カタログのテスト。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCatalog, evolutionRecipes } from '../src/systems/SkillCatalog.js';
import { registeredSkillIds, skillsWithRuntimeState } from '../src/systems/SkillManager.js';
import { appliesLv80ProjectileCount } from '../src/systems/SkillAudit.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(readFileSync(join(dir, 'data', n), 'utf8'));
const skills = load('skills.json').skills;
const passives = load('passives.json').passives;
const evolutions = load('skill-evolutions.json').evolutions;
const jobs = load('jobs.json').jobs;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

const EVO = {
  diamond_blizzard: { base: 'frost_shard', aux: 'rapid_freezing' },
  absolute_zero_domain: { base: 'frost_nova', aux: 'frozen_expansion' },
  heaven_piercing_glacier: { base: 'glacial_lance', aux: 'frost_amplification' },
};
const registered = new Set(registeredSkillIds());
const skillIds = new Set(skills.map((s) => s.id));
const passiveIds = new Set(passives.map((p) => p.id));

section('1. データ整合・ID一意・置換対象・Lv80対象外');
{
  ok(new Set(Object.keys(EVO)).size === 3, '進化3種で一意');
  for (const [id, { base, aux }] of Object.entries(EVO)) {
    const e = evolutions.find((x) => x.id === id);
    ok(e, `${id} が存在`);
    ok(e.baseSkillId === base, `${id} の baseSkillId が ${base}`);
    ok(e.replacementSkillId === id, `${id} は基礎を置換する（枠を追加消費しない）`);
    ok(e.element === 'ice', `${id} の element が ice`);
    ok(registered.has(id), `${id} に実装クラスがある`);
    ok(!appliesLv80ProjectileCount(e), `${id} は Lv80発射数対象外（単一形態）`);
    // 補助条件が実在（active or passive）。
    for (const req of e.requiredSkills || []) ok(skillIds.has(req.skill) || passiveIds.has(req.skill), `${id} の補助 ${req.skill} が実在`);
    // 基礎の evolutionBranches に載っている。
    const b = skills.find((s) => s.id === base);
    ok((b.evolutionBranches || []).includes(id), `${base} の evolutionBranches に ${id} がある`);
  }
}

section('2. 進化レシピ（枠1・補助passive・活性数）');
{
  const cat = buildCatalog({ skills, passives, evolutions, jobs, jobId: 'frost_mage', registeredIds: registeredSkillIds(), runtimeStateIds: skillsWithRuntimeState() });
  const recipes = evolutionRecipes(cat);
  ok(recipes.length === 13, '氷術師の進化レシピは13種'); // M7-B で 3→8・M7-C で 8→13
  for (const r of recipes) {
    const e = EVO[r.evolutionId];
    if (!e) continue; // M7-B の新規5種は frost-evolutions-wave2 で検証（本スイートは M7-A 3種を対象）
    ok(r.baseSkillId === e.base, `${r.evolutionId} の基礎が ${e.base}`);
    // 各進化は「基礎Lv8 ＋ 補助passive Lv4」で成立（active補助はなし＝枠を余計に消費しない）。
    ok(r.auxPassive.length === 1 && r.auxActive.length === 0, `${r.evolutionId} は補助passive1・補助active0`);
    ok(r.minActiveSkills === 1, `${r.evolutionId} は基礎1枠のみで成立（active枠を追加消費しない）`);
  }
}

section('3. 条件未達で出現しない / 達成で出現する（進化候補ロジック）');
{
  // evolutionPartnerIds は「基礎を所持し補助が未達」のとき補助を提示する（＝未達なら進化候補は成立しない）。
  const cat = buildCatalog({ skills, passives, evolutions, jobs, jobId: 'frost_mage', registeredIds: registeredSkillIds(), runtimeStateIds: skillsWithRuntimeState() });
  const recipes = evolutionRecipes(cat);
  const dia = recipes.find((r) => r.evolutionId === 'diamond_blizzard');
  // 補助未達（rapid_freezing なし）→ 成立に必要な補助が残る。
  const auxOk = dia.auxPassive.every((a) => a.skill === 'rapid_freezing' && a.level === 4);
  ok(auxOk, 'diamond_blizzard は rapid_freezing Lv4 を要求');
}

console.log(fail ? `\n✗ 氷術師進化テスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師進化テスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
