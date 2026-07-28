// 氷術師 完成監査 1/12: カタログ整合性とプール分離（M7-E §2）。Node.js 標準機能のみ。
// SkillCatalog（production）を唯一の正として active30 / passive4 / evolution18・合計52 を検証し、
// 重複 id/name・未登録クラス・孤立クラス・プール不一致・他ジョブ混入・暗黙共通扱いが無いことを確認する。
// 実行: node tests/frost-completion-catalog.mjs

import { buildCatalog } from '../src/systems/SkillCatalog.js';
import { memberAllowedForJob } from '../src/systems/poolEligibility.js';
import { DATA, FROST, FLAME, EXPECTED, registryMap, registeredIds, runner, readSrc } from './frost-audit-common.mjs';

const T = runner('氷術師 完成カタログ監査（M7-E）');
const { ok, section, info } = T;

const regIds = registeredIds();
const catFor = (jobId) => buildCatalog({
  skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions, jobs: DATA.jobs, jobId,
  registeredIds: regIds, runtimeStateIds: [],
});
const frost = catFor('frost_mage');
const flame = catFor('flame_witch');

// ===== 1. 総数 =====
section('1. active30 / passive4 / evolution18 / 合計52');
ok(frost.summary.activeCount === EXPECTED.activeCount, `active ${frost.summary.activeCount} = 30`);
ok(frost.summary.passiveCount === EXPECTED.passiveCount, `passive ${frost.summary.passiveCount} = 4`);
ok(frost.summary.evolutionCount === EXPECTED.evolutionCount, `evolution ${frost.summary.evolutionCount} = 18`);
ok(frost.summary.activeCount + frost.summary.passiveCount + frost.summary.evolutionCount === 52, '合計 52');
ok(FROST.activeSkillPool.length === 30 && FROST.passiveSkillPool.length === 4 && FROST.evolutionPool.length === 18, 'jobs.json のプール数も 30/4/18');
section('1b. 火の魔女も active30 / passive4 / evolution18（非回帰）');
ok(flame.summary.activeCount === 30, `flame active ${flame.summary.activeCount} = 30`);
ok(flame.summary.passiveCount === 4, `flame passive ${flame.summary.passiveCount} = 4`);
ok(flame.summary.evolutionCount === 18, `flame evolution ${flame.summary.evolutionCount} = 18`);

// ===== 2. issues 0 =====
section('2. SkillCatalog の不整合検出（issues）が 0 件');
ok(frost.issues.length === 0, `frost issues 0（実際 ${frost.issues.length}: ${frost.issues.map((i) => i.type + ':' + i.id).join(', ')}）`);
ok(flame.issues.length === 0, `flame issues 0（実際 ${flame.issues.length}）`);

// ===== 3. 重複 id / name =====
section('3. duplicate id / duplicate name が無い');
const dup = (arr) => { const s = new Set(), d = []; for (const x of arr) { if (s.has(x)) d.push(x); s.add(x); } return d; };
ok(dup(frost.actives.map((a) => a.id)).length === 0, 'active id 重複なし');
ok(dup(frost.evolutions.map((e) => e.id)).length === 0, 'evolution id 重複なし');
ok(dup(frost.passives.map((p) => p.id)).length === 0, 'passive id 重複なし');
ok(dup(frost.actives.map((a) => a.displayName)).length === 0, 'active 表示名 重複なし');
ok(dup(frost.evolutions.map((e) => e.displayName)).length === 0, 'evolution 表示名 重複なし');
const allIds = [...DATA.skills.map((s) => s.id), ...DATA.evolutions.map((e) => e.id), ...DATA.passives.map((p) => p.id)];
ok(dup(allIds).length === 0, `全 id がグローバルに一意（重複 ${dup(allIds).join(',') || 'なし'}）`);

// ===== 4. クラス登録 =====
section('4. JSON とファクトリ登録の双方向一致（未登録クラス / 孤立クラスなし）');
const map = registryMap();
for (const id of [...FROST.activeSkillPool, ...FROST.evolutionPool]) {
  ok(!!map[id], `${id}: REGISTRY に実装クラスが登録されている`);
  ok(regIds.includes(id), `${id}: registeredIds に含まれる`);
}
const smSrc = readSrc('src/systems/SkillManager.js');
for (const id of regIds) {
  const known = DATA.skills.some((s) => s.id === id) || DATA.evolutions.some((e) => e.id === id);
  ok(known, `REGISTRY の ${id} は skills.json / skill-evolutions.json に実在する（孤立クラスなし）`);
}
ok(/REGISTRY/.test(smSrc), 'SkillManager に REGISTRY がある');

// ===== 5. プール分離（他ジョブ混入なし・暗黙共通なし）=====
section('5. プール分離（jobs 指定 / isCommon / 暗黙共通の禁止）');
const frostJob = { activeSkillPool: FROST.activeSkillPool, passiveSkillPool: FROST.passiveSkillPool };
const flameJob = { activeSkillPool: FLAME.activeSkillPool, passiveSkillPool: FLAME.passiveSkillPool };
for (const s of DATA.skills) {
  const m = { ...s, category: 'active' };
  const inFrost = memberAllowedForJob(m, frostJob), inFlame = memberAllowedForJob(m, flameJob);
  if (FROST.activeSkillPool.includes(s.id)) {
    ok(inFrost && !inFlame, `${s.id}: 氷術師専用（火の魔女へ出ない）`);
    ok(Array.isArray(s.jobs) && s.jobs.includes('frost_mage') && !s.jobs.includes('*'), `${s.id}: jobs=["frost_mage"]・共通指定なし`);
    ok(s.isCommon === false, `${s.id}: isCommon=false`);
  }
  if (FLAME.activeSkillPool.includes(s.id)) ok(inFlame && !inFrost, `${s.id}: 火の魔女専用（氷術師へ出ない）`);
}
for (const p of DATA.passives) {
  const m = { ...p, category: 'passive' };
  const inFrost = memberAllowedForJob(m, frostJob), inFlame = memberAllowedForJob(m, flameJob);
  // M8-B: ジョブが3種になったため「氷 XOR 火」ではなく「氷と火の両方へ同時に適格でない」を検証する
  //（戦士専用 passive は氷にも火にも適格でないのが正しい）。
  ok(!(inFrost && inFlame), `${p.id}: passive は氷術師と火の魔女へ同時に適格でない（混入なし）`);
  ok(p.isCommon !== true && !(Array.isArray(p.jobs) && p.jobs.includes('*')), `${p.id}: 明示共通（isCommon/"*"）ではない`);
}
// jobs 未指定を暗黙共通にしない: jobs が空でプール外なら、どのジョブでも不適格。
const orphan = [...DATA.skills, ...DATA.passives].filter((m) => (!Array.isArray(m.jobs) || m.jobs.length === 0) && m.isCommon !== true);
for (const m of orphan) {
  const cat = { ...m, category: m.category === 'passive' ? 'passive' : 'active' };
  ok(!memberAllowedForJob(cat, frostJob) || FROST.activeSkillPool.includes(m.id) || FROST.passiveSkillPool.includes(m.id),
    `${m.id}: jobs 未指定を暗黙共通として氷術師へ出さない`);
}

// ===== 6. SkillCatalog と SkillDraftManager の適格集合が一致 =====
section('6. SkillCatalog の一覧 = poolEligibility の適格集合（表示と抽選が一致）');
const catalogActiveIds = new Set(frost.actives.map((a) => a.id));
const eligibleActiveIds = new Set(DATA.skills.filter((s) => memberAllowedForJob({ ...s, category: 'active' }, frostJob)).map((s) => s.id));
ok(catalogActiveIds.size === eligibleActiveIds.size && [...catalogActiveIds].every((id) => eligibleActiveIds.has(id)),
  `active: カタログ ${catalogActiveIds.size} = 適格 ${eligibleActiveIds.size}`);
const catalogPassiveIds = new Set(frost.passives.map((p) => p.id));
const eligiblePassiveIds = new Set(DATA.passives.filter((p) => memberAllowedForJob({ ...p, category: 'passive' }, frostJob)).map((p) => p.id));
ok(catalogPassiveIds.size === 4 && [...catalogPassiveIds].every((id) => eligiblePassiveIds.has(id)), 'passive: カタログ = 適格（4種）');

// ===== 7. Lv80 対象 =====
section('7. Job Lv80 発射数対象は明示 flag の6種のみ（進化は対象外）');
const lv80 = frost.summary.lv80Targets.slice().sort();
ok(lv80.join(',') === EXPECTED.lv80Targets.slice().sort().join(','), `Lv80対象 ${lv80.join(',')}`);
for (const e of frost.evolutions) ok(!e.lv80, `${e.id}: 進化は Lv80 対象外`);

// ===== 8. F9 一覧 / docs との一致 =====
section('8. F9 デバッグ一覧・docs/skill-catalog.md とカタログ数が一致');
const bs = readSrc('src/scenes/BattleScene.js');
ok(/ACT\s*30|active\s*30|30\s*種/.test(bs) || /activeSkillPool/.test(bs), 'BattleScene が active プールを参照している');
const catalogMd = readSrc('docs/skill-catalog.md');
ok(/active\s*30|active30/.test(catalogMd), 'docs/skill-catalog.md に active30 の記載がある');
ok(/進化\s*18|evolution\s*18|evolution18/.test(catalogMd), 'docs/skill-catalog.md に進化18 の記載がある');
for (const id of FROST.activeSkillPool) ok(catalogMd.includes(id), `docs/skill-catalog.md に ${id} が載っている`);
for (const id of FROST.evolutionPool) ok(catalogMd.includes(id), `docs/skill-catalog.md に ${id} が載っている`);

info(`rarity(active): ${JSON.stringify(frost.summary.rarityActives)}`);
info(`進化なし active ${frost.summary.withoutEvolution.length} 種 / 分岐進化 ${frost.summary.multiBranch.length} 種`);
T.finish();
