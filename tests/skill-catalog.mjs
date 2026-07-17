// スキルカタログのテスト（Milestone 6-F）: 実データから active30/passive4/進化18 の正確なカタログを生成し、
// 孤立・未登録・参照不整合が無いことを検証する。Node.js 標準機能のみ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCatalog, evolutionRecipes } from '../src/systems/SkillCatalog.js';
import { registeredSkillIds, skillsWithRuntimeState } from '../src/systems/SkillManager.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(readFileSync(join(dir, 'data', n), 'utf8'));
const skills = load('skills.json').skills;
const passives = load('passives.json').passives;
const evolutions = load('skill-evolutions.json').evolutions;
const jobs = load('jobs.json').jobs;

const cat = buildCatalog({ skills, passives, evolutions, jobs, jobId: 'flame_witch', registeredIds: registeredSkillIds(), runtimeStateIds: skillsWithRuntimeState() });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

// ===== 1. 件数 =====
section('1. カタログ件数');
ok(cat.summary.activeCount === 30, `active30種 (${cat.summary.activeCount})`);
ok(cat.summary.passiveCount === 4, `passive4種 (${cat.summary.passiveCount})`);
ok(cat.summary.evolutionCount === 18, `進化18種 (${cat.summary.evolutionCount})`);

// ===== 2. 実装クラス登録・プール登録 =====
section('2. 実装クラス / プール登録');
for (const a of cat.actives) ok(a.hasClass, `active ${a.id} に実装クラスがある`);
for (const e of cat.evolutions) ok(e.hasClass, `進化 ${e.id} に実装クラスがある`);
for (const a of cat.actives) ok(a.inPool, `active ${a.id} が activeSkillPool にある`);

// ===== 3. 不整合の検出（0件であること） =====
section('3. 不整合検出');
const blocking = cat.issues.filter((i) => i.type !== 'unlinked-evolution'); // unlinked は下で個別確認
ok(cat.issues.length === 0, `検出された不整合: ${cat.issues.length}件 ${cat.issues.slice(0, 5).map((i) => i.type + ':' + i.id).join(', ')}`);

// ===== 4. 進化あり/なしの分類（実データ由来・文章推測しない） =====
section('4. 進化あり/なし');
ok(cat.summary.withEvolution.length + cat.summary.withoutEvolution.length === 30, '進化あり+なし=30');
// 進化ありは18の baseSkillId 集合と一致（各進化は基礎1対1）。
const evoBases = new Set(evolutions.map((e) => e.baseSkillId));
ok(cat.summary.withEvolution.length === evoBases.size, `進化あり active数 = 進化の基礎数 (${cat.summary.withEvolution.length}/${evoBases.size})`);
for (const id of cat.summary.withEvolution) ok(evoBases.has(id), `${id} は実際に進化を持つ`);
for (const id of cat.summary.withoutEvolution) ok(!evoBases.has(id), `${id} は進化を持たない`);

// ===== 5. policy / mainCastEvent / Lv80 / runtimeState =====
section('5. メタ整合');
for (const a of cat.actives) {
  ok(!!a.castMode, `${a.id} に castMode`);
  ok(['standard', 'custom', 'forbidden'].includes(a.echoPolicy) && ['standard', 'custom', 'forbidden'].includes(a.clonePolicy), `${a.id} の policy が有効`);
}
for (const e of cat.evolutions) ok(!e.lv80, `進化 ${e.id} は Lv80対象外`);
// runtimeState を持つと宣言されたスキルは serializeState 実装がある（skillsWithRuntimeState と一致）。
const rtSet = new Set(skillsWithRuntimeState());
for (const x of [...cat.actives, ...cat.evolutions]) ok(x.hasRuntimeState === rtSet.has(x.id), `${x.id} の runtimeState 宣言が実装と一致`);

// ===== 6. 進化レシピの補助条件分類 =====
section('6. 進化レシピ');
const recipes = evolutionRecipes(cat);
ok(recipes.length === 18, '進化レシピ18種');
for (const r of recipes) {
  ok(r.auxActive.every((a) => a.kind === 'active') && r.auxPassive.every((p) => p.kind === 'passive'), `${r.evolutionId} の補助条件が active/passive に正しく分類`);
  ok(r.minActiveSkills >= 1, `${r.evolutionId} の最小 active 取得数 >= 1`);
}

// ===== 7. アイコン監査（BootScene.js のソースから生成キーを抽出して照合） =====
section('7. アイコン参照');
const boot = readFileSync(join(dir, 'src/scenes/BootScene.js'), 'utf8');
const genIcons = new Set([...boot.matchAll(/'(icon_[a-z0-9_]+)'/g)].map((m) => m[1]));
for (const a of cat.actives) if (a.iconKey) ok(genIcons.has(a.iconKey), `active ${a.id} のアイコン ${a.iconKey} が BootScene で生成される`);
for (const e of cat.evolutions) if (e.iconKey) ok(genIcons.has(e.iconKey), `進化 ${e.id} のアイコン ${e.iconKey} が BootScene で生成される`);
// 未使用アイコン（生成したが誰も参照しない）は警告扱い（失敗にしない）。
const usedIcons = new Set([...cat.actives, ...cat.passives, ...cat.evolutions].map((x) => x.iconKey).filter(Boolean));
const unused = [...genIcons].filter((k) => !usedIcons.has(k));
if (unused.length) console.log(`  （参考）未参照アイコン: ${unused.join(', ')}`);

console.log('');
console.log('--- 進化あり active (' + cat.summary.withEvolution.length + '): ' + cat.summary.withEvolution.join(', '));
console.log('--- 進化なし active (' + cat.summary.withoutEvolution.length + '): ' + cat.summary.withoutEvolution.join(', '));
console.log('--- 複数進化 active: ' + (cat.summary.multiBranch.join(', ') || 'なし'));
console.log('--- レアリティ(active): ' + JSON.stringify(cat.summary.rarityActives));
console.log('--- レアリティ(passive): ' + JSON.stringify(cat.summary.rarityPassives));
console.log('--- 役割分布: ' + JSON.stringify(cat.summary.roleDist));
console.log('--- Lv80対象: ' + cat.summary.lv80Targets.join(', '));

console.log('');
if (fail) { console.error(`✗ スキルカタログテスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ スキルカタログテスト成功: ${pass} 件すべて通過`); process.exit(0); }
