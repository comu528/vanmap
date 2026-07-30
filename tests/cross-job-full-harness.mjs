// M9-A.1 1/15: 完全 balance ハーネスの成立確認。Node.js 標準機能のみ。
// production の BattleScene.prototype をそのまま駆動していること・
// 全 damage 経路が解決されていること・144 スキルすべてに utility があることを確認する。
// 実行: node tests/cross-job-full-harness.mjs
import { JOB_IDS, PROFILES, poolsOf, makeBattle, runProfile, instrument, collectMetrics, stepFrame, applyStimulus, runner, readSrc } from './cross-job-harness.mjs';
import { resetPhysics } from './phaser-stub.mjs';

const T = runner('完全 balance ハーネス（M9-A.1）');
const { ok, section, info } = T;

section('1. production の BattleScene.prototype を直接駆動している');
{
  const h = await makeBattle({ jobId: 'warrior', profile: 'normal' });
  const { BattleScene } = await import('../src/scenes/BattleScene.js');
  for (const m of ['dealDamage', 'damageArea', 'aoe', 'meleeStrike', 'checkCollisions', 'updateProjectiles',
    'updateEnemies', 'updateGems', 'targetsInRadius', 'nearestTarget', 'densestPoint', 'shatterEnemy',
    'onEnemyKilled', 'onBossKilled', 'grantXp', 'executeTarget', 'launchTarget', 'grabTarget',
    'tryDeflectProjectile', 'update', 'handleInput', 'computeAutoMove', 'computeWarriorAutoMove']) {
    ok(h.scene[m] === BattleScene.prototype[m], `${m}: production の実装（差し替えていない）`);
  }
  // 差し替えたのは表示 / 保存 / spawn timeline だけ。
  for (const m of ['updateHud', 'autoSave', 'showBanner', 'checkBossTime', 'finishRun']) {
    ok(h.scene[m] !== BattleScene.prototype[m], `${m}: 表示 / 保存 / timeline のみ差し替え`);
  }
  ok(h.scene.spawn.constructor.name === 'SpawnManager', 'spawn は production の SpawnManager');
  ok(h.scene.projPool.constructor.name === 'Pool', 'projPool は production の Pool');
  ok(h.scene.enemyGrid.constructor.name === 'SpatialGrid', 'enemyGrid は production の SpatialGrid');
  ok(h.scene.statusFx.constructor.name === 'StatusEffectManager', 'statusFx は production');
  ok(h.scene.warrior.constructor.name === 'WarriorCombatSystem', 'warrior は production');
  ok(h.scene.telemetry.constructor.name === 'CombatTelemetry', 'telemetry は production');
}

section('2. ハーネスに独自 damage 式 / Math.random / quality 分岐が無い');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const src = strip(readSrc('tests/cross-job-harness.mjs')) + strip(readSrc('tests/phaser-stub.mjs'));
  ok(!/Math\.random/.test(src), 'Math.random を使わない（コメント除去後）');
  // ダメージを自前で計算していない（damage 値の算術は production にしかない）。
  ok(!/hp\s*-=/.test(src), 'HP を直接減算しない（takeDamage 経由）');
  ok(!/quality === '(low|medium|ultra)'/.test(src.replace(/\/\/[^\n]*/g, '')), 'quality による gameplay 分岐が無い');
}

section('3. profile が 4 つ以上あり、固定条件が 3 ジョブで同一');
{
  ok(Object.keys(PROFILES).length >= 4, `profile ${Object.keys(PROFILES).length} 件（A normal / B elite / C boss / D survival / E stimulus）`);
  for (const [id, p] of Object.entries(PROFILES)) {
    ok(p.durationMs > 0 && p.dt > 0, `${id}: duration / dt が固定`);
    ok(!!p.spawn, `${id}: spawn timeline がある`);
  }
  const hs = {};
  for (const j of JOB_IDS) {
    const h = await makeBattle({ jobId: j, profile: 'elite', seed: 99 });
    hs[j] = {
      dt: h.profile.dt, duration: h.profile.durationMs, difficulty: JSON.stringify(h.scene.difficulty),
      // base stats は固定。ジョブの passive / Job Lv による差（例: 重装の maxHp +20%）は
      // 「job 固有の defense は異なってよい」に該当するので、比較は base 値で行う。
      baseMaxHp: h.scene._baseMaxHp, baseMoveSpeed: h.scene.bonus.moveMult,
      slots: [h.scene.activeSlotsMax, h.scene.passiveSlotsMax],
      caps: [h.scene.effSettings.maxEnemies, h.scene.effSettings.maxProjectiles],
      bonus: JSON.stringify(h.scene.bonus), world: [h.scene.worldW, h.scene.worldH],
      seed: h.scene.rngSeed,
    };
  }
  const base = JSON.stringify(hs.flame_witch);
  for (const j of JOB_IDS) ok(JSON.stringify(hs[j]) === base, `${j}: 固定条件（難易度 / base stats / slot / cap / seed / world）が同一`);
  // ジョブ固有の差（意図した個性）は記録する。
  for (const j of JOB_IDS) {
    const h = await makeBattle({ jobId: j, profile: 'elite', seed: 99 });
    info(`${j}: 実効 maxHp ${h.scene.player.maxHp}（base ${h.scene._baseMaxHp}・job passive / Lv 由来の差は個性）`);
  }
}

section('4. 全 144 スキルに utility がある（unresolved damage path 0）');
{
  const PROFS = ['elite', 'boss', 'survival', 'stimulus'];
  for (const j of JOB_IDS) {
    const util = new Set();
    for (const build of ['full', 'evolved']) {
      for (const prof of PROFS) {
        resetPhysics();
        const h = instrument(await makeBattle({ jobId: j, profile: prof, build, seed: 5005 }));
        if (prof === 'stimulus') { while (h.scene._elapsedMs < PROFILES.stimulus.durationMs) { applyStimulus(h, h.scene._elapsedMs); stepFrame(h); if (h.scene.gameOver) break; } }
        else runProfile(h);
        for (const id of h.scene.skills.skills.keys()) {
          const x = h.scene.skills.stats.get(id);
          if (!x) continue;
          const ex = Object.values(x.extra || {}).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
          if ((x.damage || 0) > 0 || (x.hits || 0) > 0 || ex > 0) util.add(id);
        }
      }
    }
    const pool = [...poolsOf(j).active, ...poolsOf(j).evolution];
    const missing = pool.filter((id) => !util.has(id));
    ok(missing.length === 0, `${j}: 48 スキルすべてに damage / hit / utility がある（未解決 ${missing.join(',') || '0 件'}）`);
    info(`${j}: utility 確認 ${util.size} / ${pool.length}`);
  }
}

section('5. metrics が §7 の全カテゴリを返す');
{
  resetPhysics();
  const h = instrument(await makeBattle({ jobId: 'warrior', profile: 'boss', build: 'slot8', seed: 606 }));
  runProfile(h);
  const m = collectMetrics(h);
  for (const k of ['offense', 'defense', 'utility', 'resource', 'progression', 'pools', 'paths']) ok(k in m, `metrics.${k} がある`);
  for (const k of ['totalDamage', 'dps', 'kills', 'topShare', 'zeroHitCasts', 'zeroUtility', 'bossKillMs']) ok(k in m.offense, `offense.${k}`);
  for (const k of ['hp', 'died', 'survivedMs', 'mitigated', 'healing']) ok(k in m.defense, `defense.${k}`);
  for (const k of ['chillApplied', 'freezes', 'bossFrostbreaks', 'poise', 'counters', 'executions']) ok(k in m.utility, `utility.${k}`);
  ok(m.resource && 'furyGained' in m.resource, 'resource.furyGained（戦士固有）');
  ok(m.offense.bossKillMs != null || m.offense.bossHpRemain != null, 'boss kill time または残 HP が取れる');
}

T.finish();
