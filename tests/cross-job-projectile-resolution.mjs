// M9-A.1 2/15: gameplay projectile の解決。Node.js 標準機能のみ。
// production の Projectile / Pool / checkCollisions を駆動し、
// 弾が「生成されるだけ」でなく **実際に当たってダメージになる** ことを確認する。
// M9-A のハーネスへ戻すとこのスイートは落ちる（当時は弾のダメージが 0 だった）。
// 実行: node tests/cross-job-projectile-resolution.mjs
import { JOB_IDS, QUALITIES, makeBattle, runProfile, instrument, collectMetrics, gameplayTrace, sha, runner } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = runner('projectile 解決（M9-A.1）');
const { ok, section, info } = T;

section('1. 火 / 氷: 弾が生成され、当たり、ダメージになる');
for (const j of ['flame_witch', 'frost_mage']) {
  resetPhysics();
  const h = instrument(await makeBattle({ jobId: j, profile: 'elite', build: 'full', seed: 1212 }));
  runProfile(h);
  const m = collectMetrics(h);
  ok(m.paths.projectileSpawn > 0, `${j}: gameplay projectile が生成される（${m.paths.projectileSpawn}）`);
  ok(m.pools.projReleased > 0, `${j}: 弾がプールへ返却される（${m.pools.projReleased}）`);
  // 弾のダメージが解決されている: 弾スキルの damage が 0 でない。
  const projSkills = [...h.scene.skills.stats.entries()].filter(([, x]) => (x.damage || 0) > 0);
  ok(projSkills.length > 0, `${j}: ダメージを出したスキルがある（${projSkills.length} 種）`);
  ok(m.offense.hits > 0, `${j}: 命中が記録される（${m.offense.hits}）`);
  ok(m.offense.kills > 0, `${j}: 撃破が発生する（${m.offense.kills}）`);
  info(`${j}: 弾 ${m.paths.projectileSpawn} 発 / 命中 ${m.offense.hits} / 撃破 ${m.offense.kills} / 総ダメージ ${m.offense.totalDamage}`);
}

section('2. 弾の種別カバレッジ（homing / pierce / explosive / chain / ricochet / split / 二次世代 / 反射）');
{
  const seen = new Set();
  for (const j of JOB_IDS) {
    for (const build of ['full', 'evolved']) {
      for (const prof of ['normal', 'elite', 'boss']) {
        resetPhysics();
        const h = instrument(await makeBattle({ jobId: j, profile: prof, build, seed: 1313 }));
        runProfile(h);
        for (const k of Object.keys(h.paths)) if (/^proj|^_chainHit$|^_splitLance$|^_spawnIceFragments$/.test(k)) seen.add(k);
      }
    }
  }
  for (const kind of ['projectileSpawn', 'projHoming', 'projPierce', 'projExplosive', 'proj:chain', 'proj:ricochet', 'proj:split_lance']) {
    ok(seen.has(kind), `弾種 ${kind} が解決される`);
  }
  // 二次生成（連鎖の子弾 / 分裂 / 氷片）。production は連鎖は generation で、分裂は splitGen で数える。
  ok(seen.has('_chainHit') || seen.has('_splitLance') || seen.has('projSecondaryGen'),
    `二次生成の経路が走る（${['_chainHit', '_splitLance', 'projSecondaryGen'].filter((k) => seen.has(k)).join(',')}）`);
  info(`観測した弾種: ${[...seen].sort().join(' ')}`);
}

section('3. 反射弾（戦士）は production の経路で生成され当たる');
{
  resetPhysics();
  const h = instrument(await makeBattle({ jobId: 'warrior', profile: 'stimulus', build: 'full', seed: 1414 }));
  const { stepFrame, applyStimulus, PROFILES } = await import('./cross-job-harness.mjs');
  while (h.scene._elapsedMs < PROFILES.stimulus.durationMs) { applyStimulus(h, h.scene._elapsedMs); stepFrame(h); if (h.scene.gameOver) break; }
  ok(h.paths.tryDeflectProjectile > 0, `弾き返し判定が走る（${h.paths.tryDeflectProjectile}）`);
  ok(h.paths.createReflectedPhysicalProjectile > 0, `反射弾が生成される（${h.paths.createReflectedPhysicalProjectile}）`);
  ok(h.paths.projReflected > 0, `反射弾が projPool を通る（${h.paths.projReflected}）`);
}

section('4. 敵弾（hostile）も production の Projectile で解決される');
{
  resetPhysics();
  const h = instrument(await makeBattle({ jobId: 'frost_mage', profile: 'elite', build: 'slot8', seed: 1515 }));
  runProfile(h);
  ok(h.paths.enemyProjectileSpawn > 0, `敵弾が生成される（${h.paths.enemyProjectileSpawn}）`);
  ok(h.scene.bossBulletPool.createdCount > 0, '敵弾プールが使われる');
}

section('5. 弾の解決が品質 4 段階で一致（gameplay projectile 数 / 命中 / ダメージ / RNG）');
for (const j of ['flame_witch', 'frost_mage']) {
  const hashes = {}; const counts = {};
  for (const q of QUALITIES) {
    resetPhysics();
    const h = instrument(await makeBattle({ jobId: j, profile: 'elite', build: 'slot8', seed: 1616, quality: q }));
    runProfile(h);
    hashes[q] = sha(gameplayTrace(h));
    counts[q] = h.paths.projectileSpawn;
  }
  ok(new Set(Object.values(hashes)).size === 1, `${j}: 4 品質で gameplay trace 一致`);
  ok(new Set(Object.values(counts)).size === 1, `${j}: 4 品質で弾の生成数が一致（${counts.high}）`);
}

section('6. visual-only オブジェクトは damage 経路へ入らない');
{
  resetPhysics();
  const h = instrument(await makeBattle({ jobId: 'flame_witch', profile: 'elite', build: 'full', seed: 1717 }));
  runProfile(h);
  // 演出は counters にだけ積まれ、projPool（gameplay 実体）とは別勘定。
  ok(h.counters.visualTotal > h.paths.projectileSpawn, `演出数 ${h.counters.visualTotal} > gameplay 弾数 ${h.paths.projectileSpawn}（別勘定）`);
  ok(h.scene.projPool.activeCount <= h.scene.effSettings.maxProjectiles, 'gameplay 弾はプール上限内');
}

T.finish();
