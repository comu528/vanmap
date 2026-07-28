// 火の魔女 完成監査 1/12: カタログ整合性とプール分離（M8-A §1）。Node.js 標準機能のみ。
// SkillCatalog（production）を唯一の正として active30 / passive4 / evolution18・合計52 を検証し、
// 重複 id/name・未登録クラス・孤立クラス・プール不一致・他ジョブ混入・暗黙共通扱いが無いことを確認する。
// 実行: node tests/flame-completion-catalog.mjs

import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { memberAllowedForJob } from '../src/systems/poolEligibility.js';
import { DATA, FROST, FLAME, EXPECTED, registryMap, registeredIds, runner, readSrc } from './flame-audit-common.mjs';

const T = runner('火の魔女 完成カタログ監査（M8-A）');
const { ok, section, info } = T;

const regIds = registeredIds();
const catFor = (jobId) => buildCatalog({
  skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs, jobId,
  registeredIds: regIds, runtimeStateIds: [],
});
const flame = catFor('flame_witch');
const frost = catFor('frost_mage');

// ===== 1. 総数 =====
section('1. active30 / passive4 / evolution18 / 合計52');
ok(flame.summary.activeCount === EXPECTED.activeCount, `active ${flame.summary.activeCount} = 30`);
ok(flame.summary.passiveCount === EXPECTED.passiveCount, `passive ${flame.summary.passiveCount} = 4`);
ok(flame.summary.evolutionCount === EXPECTED.evolutionCount, `evolution ${flame.summary.evolutionCount} = 18`);
ok(flame.summary.activeCount + flame.summary.passiveCount + flame.summary.evolutionCount === 52, '合計 52');
ok(FLAME.activeSkillPool.length === 30 && FLAME.passiveSkillPool.length === 4 && FLAME.evolutionPool.length === 18,
  'jobs.json のプール数も 30/4/18');
section('1b. 氷術師も active30 / passive4 / evolution18（非回帰）');
ok(frost.summary.activeCount === 30, `frost active ${frost.summary.activeCount} = 30`);
ok(frost.summary.passiveCount === 4, `frost passive ${frost.summary.passiveCount} = 4`);
ok(frost.summary.evolutionCount === 18, `frost evolution ${frost.summary.evolutionCount} = 18`);

// ===== 2. issues 0 =====
section('2. SkillCatalog の不整合検出（issues）が 0 件');
ok(flame.issues.length === 0, `flame issues 0（実際 ${flame.issues.length}: ${flame.issues.map((i) => i.type + ':' + i.id).join(', ')}）`);
ok(frost.issues.length === 0, `frost issues 0（実際 ${frost.issues.length}）`);

// ===== 3. 重複 id / name =====
section('3. duplicate id / duplicate name が無い');
const dup = (arr) => { const s = new Set(), d = []; for (const x of arr) { if (s.has(x)) d.push(x); s.add(x); } return d; };
ok(dup(flame.actives.map((a) => a.id)).length === 0, 'active id 重複なし');
ok(dup(flame.evolutions.map((e) => e.id)).length === 0, 'evolution id 重複なし');
ok(dup(flame.passives.map((p) => p.id)).length === 0, 'passive id 重複なし');
ok(dup(flame.actives.map((a) => a.displayName)).length === 0, 'active 表示名 重複なし');
ok(dup(flame.evolutions.map((e) => e.displayName)).length === 0, 'evolution 表示名 重複なし');
const allIds = [...DATA.skills.map((s) => s.id), ...DATA.evolutions.map((e) => e.id), ...DATA.passives.map((p) => p.id)];
ok(dup(allIds).length === 0, `全 id がグローバルに一意（重複 ${dup(allIds).join(',') || 'なし'}）`);
const allNames = [...DATA.skills.map((s) => s.name), ...DATA.evolutions.map((e) => e.displayName)];
ok(dup(allNames).length === 0, `全 表示名 がグローバルに一意（重複 ${dup(allNames).join(',') || 'なし'}）`);

// ===== 4. クラス登録（JSON だけ / クラスだけ が無い）=====
section('4. JSON とファクトリ登録の双方向一致（未登録クラス / 孤立クラスなし）');
const map = registryMap();
for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
  ok(!!map[id], `${id}: REGISTRY に実装クラスが登録されている`);
  ok(regIds.includes(id), `${id}: registeredIds に含まれる`);
}
for (const id of regIds) {
  const known = DATA.skills.some((s) => s.id === id) || DATA.evolutions.some((e) => e.id === id);
  ok(known, `REGISTRY の ${id} は skills.json / skill-evolutions.json に実在する（孤立クラスなし）`);
}
ok(/REGISTRY/.test(readSrc('src/systems/SkillManager.js')), 'SkillManager に REGISTRY がある');

// ===== 5. プール分離（他ジョブ混入なし・暗黙共通なし）=====
section('5. プール分離（jobs 指定 / isCommon / 暗黙共通の禁止）');
const flameJob = { activeSkillPool: FLAME.activeSkillPool, passiveSkillPool: FLAME.passiveSkillPool };
const frostJob = { activeSkillPool: FROST.activeSkillPool, passiveSkillPool: FROST.passiveSkillPool };
for (const s of DATA.skills) {
  const m = { ...s, category: 'active' };
  const inFlame = memberAllowedForJob(m, flameJob), inFrost = memberAllowedForJob(m, frostJob);
  if (FLAME.activeSkillPool.includes(s.id)) {
    ok(inFlame && !inFrost, `${s.id}: 火の魔女専用（氷術師へ出ない）`);
    ok(Array.isArray(s.jobs) && s.jobs.includes('flame_witch') && !s.jobs.includes('*'), `${s.id}: jobs=["flame_witch"]・共通指定なし`);
    ok(s.isCommon === false, `${s.id}: isCommon=false`);
  }
  if (FROST.activeSkillPool.includes(s.id)) ok(inFrost && !inFlame, `${s.id}: 氷術師専用（火の魔女へ出ない）`);
}
for (const p of DATA.passives) {
  const m = { ...p, category: 'passive' };
  const inFlame = memberAllowedForJob(m, flameJob), inFrost = memberAllowedForJob(m, frostJob);
  // M8-B: ジョブが3種になったため「火 XOR 氷」ではなく「火と氷の両方へ同時に適格でない」を検証する
  //（戦士専用 passive は火にも氷にも適格でないのが正しい）。
  ok(!(inFlame && inFrost), `${p.id}: passive は火の魔女と氷術師へ同時に適格でない（混入なし）`);
  ok(p.isCommon !== true && !(Array.isArray(p.jobs) && p.jobs.includes('*')), `${p.id}: 明示共通（isCommon/"*"）ではない`);
}
// isCommon:false を共通扱いしない／jobs 未指定を暗黙共通にしない。
const orphan = [...DATA.skills, ...DATA.passives].filter((m) => (!Array.isArray(m.jobs) || m.jobs.length === 0) && m.isCommon !== true);
for (const m of orphan) {
  const cat = { ...m, category: m.category === 'passive' ? 'passive' : 'active' };
  ok(!memberAllowedForJob(cat, flameJob) || FLAME.activeSkillPool.includes(m.id) || FLAME.passiveSkillPool.includes(m.id),
    `${m.id}: jobs 未指定を暗黙共通として火の魔女へ出さない`);
}
// 明示共通は isCommon:true か jobs:["*"] のみ（現状はどちらも存在しない）。
const explicitCommon = [...DATA.skills, ...DATA.passives].filter((m) => m.isCommon === true || (Array.isArray(m.jobs) && m.jobs.includes('*')));
ok(explicitCommon.length === 0, `明示共通スキルは 0 件（${explicitCommon.map((m) => m.id).join(',') || 'なし'}）`);

// ===== 6. SkillCatalog と poolEligibility の適格集合が一致 =====
section('6. SkillCatalog の一覧 = poolEligibility の適格集合（表示と抽選が一致）');
const catalogActiveIds = new Set(flame.actives.map((a) => a.id));
const eligibleActiveIds = new Set(DATA.skills.filter((s) => memberAllowedForJob({ ...s, category: 'active' }, flameJob)).map((s) => s.id));
ok(catalogActiveIds.size === eligibleActiveIds.size && [...catalogActiveIds].every((id) => eligibleActiveIds.has(id)),
  `active: カタログ ${catalogActiveIds.size} = 適格 ${eligibleActiveIds.size}`);
const catalogPassiveIds = new Set(flame.passives.map((p) => p.id));
const eligiblePassiveIds = new Set(DATA.passives.filter((p) => memberAllowedForJob({ ...p, category: 'passive' }, flameJob)).map((p) => p.id));
ok(catalogPassiveIds.size === 4 && [...catalogPassiveIds].every((id) => eligiblePassiveIds.has(id)), 'passive: カタログ = 適格（4種）');
// active プール = カタログ id 集合（JSON だけ / クラスだけ の取りこぼしが無い）。
ok(FLAME.activeSkillPool.every((id) => catalogActiveIds.has(id)), 'activeSkillPool の全 id がカタログにある');
ok([...catalogActiveIds].every((id) => FLAME.activeSkillPool.includes(id)), 'カタログの全 active が activeSkillPool にある');

// ===== 7. Lv80 対象 =====
section('7. Job Lv80 発射数対象は明示 flag の6種のみ（進化は対象外）');
const lv80 = flame.summary.lv80Targets.slice().sort();
ok(lv80.join(',') === EXPECTED.lv80Targets.slice().sort().join(','), `Lv80対象 ${lv80.join(',')}`);
for (const e of flame.evolutions) ok(!e.lv80, `${e.id}: 進化は Lv80 対象外`);

// ===== 8. F9 一覧 / docs との一致 =====
section('8. F9 デバッグ一覧・docs/skill-catalog.md とカタログ数が一致');
const bs = readSrc('src/scenes/BattleScene.js');
ok(/activeSkillPool/.test(bs), 'BattleScene が active プールを参照している');
const catalogMd = readSrc('docs/skill-catalog.md');
ok(/active\s*30|active30/.test(catalogMd), 'docs/skill-catalog.md に active30 の記載がある');
ok(/進化\s*18|evolution\s*18|evolution18/.test(catalogMd), 'docs/skill-catalog.md に進化18 の記載がある');
for (const id of FLAME.activeSkillPool) ok(catalogMd.includes(id), `docs/skill-catalog.md に ${id} が載っている`);
for (const id of FLAME.evolutionPool) ok(catalogMd.includes(id), `docs/skill-catalog.md に ${id} が載っている`);
for (const id of FLAME.passiveSkillPool) ok(catalogMd.includes(id), `docs/skill-catalog.md に passive ${id} が載っている`);

info(`rarity(active): ${JSON.stringify(flame.summary.rarityActives)}`);
info(`進化なし active ${flame.summary.withoutEvolution.length} 種 / 分岐進化 ${flame.summary.multiBranch.length} 種`);
T.finish();
