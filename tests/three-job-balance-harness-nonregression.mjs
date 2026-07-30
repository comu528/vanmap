// M9-A.1 15/15: 横断 balance ハーネスの非回帰（SHA-256 固定）。Node.js 標準機能のみ。
// M9-A.1 完了時点の以下を固定する。以後の変更でここが落ちたら「意図した変更か」を必ず確認すること。
//   - 3 ジョブ × {normal, boss} の gameplay trace（production 全経路・quality=high・seed 1234）
//   - 3 ジョブの経路カバレッジ集合（どの production メソッド / 弾種が呼ばれたか）
//   - profile 定義・stimulus timeline・観測メソッド一覧（ハーネスの測定条件そのもの）
//   - gameplayLimits / save_version / カタログ規模
// 実行: node tests/three-job-balance-harness-nonregression.mjs
import { JOB_IDS, RAW, PROFILES, STIMULUS, makeBattle, runProfile, instrument, gameplayTrace, sha, runner } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const T = runner('3 ジョブ balance ハーネス非回帰（M9-A.1）');
const { ok, section, info } = T;
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// M9-A.1 完了時点（コミット時）の固定ハッシュ。
const FROZEN = {
  flame_witch: { normal: '0c93eacbbd506807c6bbd8609d5a70807054126af5f8b92dd931d734835ffdaf', boss: '260491b67f7ef84a425722e21b2506af0752ee2117fea0f842aedce63edc6c67' },
  frost_mage: { normal: '9cb06e37dddbe45b3776d9809c832443009176f17d35881c609451d3e885715b', boss: 'cd837c5de3f547290300a71e834986a90e9a25fbb5982b490a5a5d211280dea9' },
  warrior: { normal: '793e7a38b9df925496e15532c13f8e18e7053de230cba1c9baceaa0634383cbd', boss: '1bb6d3f1f93fa8baf04e4152ecbc20bd07590c7dca251104eb3687f64f38cfcd' },
  pathSets: '9e36c65301cbb16afbccde6b516968e26a4d4592f2f4ec7aa859be1b13ba75b7',
  conditions: 'ed3c1f5e59ac5affb451cc3f1f587c71fec1ff617333dd81fdb028f5363ddfda',
};

section('1. gameplay trace ハッシュ（production 全経路・seed 1234・quality high）');
const pathSets = {};
for (const j of JOB_IDS) {
  for (const p of ['normal', 'boss']) {
    resetPhysics();
    const h = instrument(await makeBattle({ jobId: j, profile: p, seed: 1234, build: 'slot8' }));
    runProfile(h, { maxMs: 60000 });
    const hash = sha(gameplayTrace(h));
    ok(hash === FROZEN[j][p], `${j} / ${p}: trace 一致（${hash.slice(0, 12)}…）`);
    if (hash !== FROZEN[j][p]) info(`  実測: '${hash}'`);
    if (p === 'boss') pathSets[j] = Object.keys(h.paths).sort();
  }
}

section('2. 経路カバレッジ集合（どの production 経路が生きているか）');
{
  const hash = sha(pathSets);
  ok(hash === FROZEN.pathSets, `3 ジョブの経路集合 一致（${hash.slice(0, 12)}…）`);
  if (hash !== FROZEN.pathSets) {
    info(`  実測: '${hash}'`);
    for (const j of JOB_IDS) info(`  ${j}: ${pathSets[j].join(' ')}`);
  }
}

section('3. 測定条件の固定（profile / stimulus / 上限 / save_version / カタログ）');
{
  const catalog = {};
  for (const j of RAW.jobs.jobs) catalog[j.id] = [(j.activeSkillPool || []).length, (j.passiveSkillPool || []).length, (j.evolutionPool || []).length];
  const cond = {
    profiles: PROFILES,
    stimulus: STIMULUS,
    gameplayLimits: RAW.balance.gameplayLimits,
    saveVersion: RAW.balance.saveVersion,
    catalog,
  };
  const hash = sha(cond);
  ok(hash === FROZEN.conditions, `測定条件 一致（${hash.slice(0, 12)}…）`);
  if (hash !== FROZEN.conditions) info(`  実測: '${hash}'`);
  ok(RAW.balance.saveVersion === 6, 'save_version = 6');
  ok(RAW.balance.gameplayLimits.maxEnemies === 200 && RAW.balance.gameplayLimits.maxProjectiles === 400,
    'gameplayLimits 200 / 400');
  for (const j of JOB_IDS) ok(catalog[j].join('-') === '30-4-18', `${j}: カタログ 30-4-18`);
}

section('4. ハーネス自身の変更検知（測定器を静かに変えない）');
{
  // ハーネスと stub のソースをハッシュ固定はしない（コメント修正まで縛るのは過剰）が、
  // gameplay に効く定数（dt / 世界サイズ / OBSERVED 数）は固定する。
  const src = readFileSync(join(REPO, 'tests/cross-job-harness.mjs'), 'utf8');
  ok(/WORLD_W = 1600, WORLD_H = 1200/.test(src), '世界サイズ 1600×1200');
  ok([...src.matchAll(/dt: 32/g)].length >= 4, '全 profile の dt = 32ms');
  ok(Object.values(PROFILES).every((p) => p.dt === 32), 'dt が実際に 32 で読める');
  ok(STIMULUS.length === 17, `stimulus timeline 17 イベント（${STIMULUS.length}）`);
}

T.finish();
