// M7-A: 氷術師 active5種のデータ・カタログ・監査のテスト。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { echoStatus, cloneStatus, appliesLv80ProjectileCount } from '../src/systems/SkillAudit.js';
import { registeredSkillIds, skillsWithRuntimeState } from '../src/systems/SkillManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(readFileSync(join(dir, 'data', n), 'utf8'));
const skills = load('skills.json').skills;
const passives = load('passives.json').passives;
const evolutions = load('skill-evolutions.json').evolutions;
const jobs = load('jobs.json').jobs;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

const ACT = { frost_shard: 'common', frost_nova: 'common', glacial_lance: 'uncommon', permafrost_field: 'uncommon', ice_wall: 'rare' };
const LV80 = new Set(['frost_shard', 'glacial_lance']);
const registered = new Set(registeredSkillIds());

section('1. ID一意・プール登録・maxLevel8・element ice');
{
  const ids = Object.keys(ACT);
  ok(new Set(ids).size === 5, 'active5種で一意');
  const fm = jobs.find((j) => j.id === 'frost_mage');
  for (const id of ids) ok(fm.activeSkillPool.includes(id), `${id} が frost_mage プールにある`);
  for (const [id, rar] of Object.entries(ACT)) {
    const s = skills.find((x) => x.id === id);
    ok(s, `${id} が存在`);
    ok((s.jobs || []).includes('frost_mage') && !(s.jobs || []).includes('flame_witch'), `${id} は frost_mage 専用`);
    ok(s.element === 'ice', `${id} の element が ice`);
    ok(s.rarity === rar, `${id} の rarity が ${rar}`);
    ok(s.maxLevel === 8, `${id} の maxLevel が8`);
    ok(registered.has(id), `${id} に実装クラスがある`);
  }
}

section('2. 全レベルデータ・隣接レベルで成長・procCoefficient');
for (const id of Object.keys(ACT)) {
  const s = skills.find((x) => x.id === id);
  ok(Array.isArray(s.levels) && s.levels.length === 8 && s.levels.every((lv, i) => lv.level === i + 1), `${id} は Lv1..8 連番`);
  let grew = true;
  for (let i = 1; i < s.levels.length; i++) if (JSON.stringify(s.levels[i]) === JSON.stringify(s.levels[i - 1])) grew = false;
  ok(grew, `${id} は隣接レベルで最低1項目成長`);
  ok(typeof s.procCoefficient === 'number' && s.procCoefficient > 0 && s.procCoefficient <= 1.5, `${id} に妥当な procCoefficient (${s.procCoefficient})`);
  for (const lv of s.levels) if (typeof lv.baseFreezeChance === 'number') ok(lv.baseFreezeChance <= 1, `${id} Lv${lv.level} の baseFreezeChance <=100%`);
}

section('3. echo/clonePolicy・Lv80対象・冷気/凍結の宣言');
for (const id of Object.keys(ACT)) {
  const s = skills.find((x) => x.id === id);
  ok(s.echoPolicy != null && s.clonePolicy != null, `${id} に echo/clonePolicy がある`);
  ok(typeof echoStatus(s) === 'string' && typeof cloneStatus(s) === 'string', `${id} の残響/分身状況が解決できる`);
  ok(appliesLv80ProjectileCount(s) === LV80.has(id), `${id} の Lv80対象が想定どおり`);
}
// permafrost_field は多段のため低 procCoefficient（永久凍結防止の設計）。
ok(skills.find((x) => x.id === 'permafrost_field').procCoefficient <= 0.3, 'permafrost_field は低 procCoefficient（多段対策）');
// frost_shard は初期スキルで比較的高い procCoefficient。
ok(skills.find((x) => x.id === 'frost_shard').procCoefficient >= 0.8, 'frost_shard は高めの procCoefficient');

section('4. カタログ（氷術師）: active5/passive/進化3・不整合0');
{
  const cat = buildCatalog({ skills, passives, evolutions, jobs, jobId: 'frost_mage', registeredIds: registeredSkillIds(), runtimeStateIds: skillsWithRuntimeState() });
  ok(cat.summary.activeCount === 5, `active5種 (${cat.summary.activeCount})`);
  ok(cat.summary.evolutionCount === 3, `進化3種 (${cat.summary.evolutionCount})`);
  ok(cat.element === 'ice', 'カタログの element が ice');
  ok(cat.issues.length === 0, `不整合0 (${cat.issues.map((i) => i.type).join(',')})`);
  for (const a of cat.actives) ok(a.element === 'ice', `${a.id} の element が ice`);
  // 火の魔女スキルが氷カタログに混ざらない。
  ok(!cat.actives.some((a) => a.id === 'fireball'), '氷カタログに火スキルが混ざらない');
}

console.log(fail ? `\n✗ 氷術師スキルテスト失敗: ${fail} 件（成功 ${pass}）` : `\n✓ 氷術師スキルテスト成功: ${pass} 件すべて通過`);
process.exit(fail ? 1 : 0);
