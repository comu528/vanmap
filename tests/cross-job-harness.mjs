// M9-A.1: 3 ジョブ横断 **完全 balance ハーネス**。Node.js 標準機能のみ。
//
// M9-A のハーネスは Scene モックで dealDamage を差し替えていたため、
//   - 火 / 氷の projectile ダメージが未解決（弾は生成されるだけで当たらない）
//   - delayed impact / DoT / field tick / secondary spawn が解決されない
//   - reactive / defensive スキルへ刺激が来ない
//   - よって DPS / boss kill time / survival を絶対比較できない
// という制約があった（docs/cross-job-balance.md の documented note）。
//
// M9-A.1 のハーネスは **BattleScene.prototype をそのまま使う**。
//   scene = Object.create(BattleScene.prototype)
// とし、create() が組み立てるフィールドを production のコンストラクタで用意する。
// 差し替えるのは Phaser 依存の表示層（effects / add / tweens / cameras / input / HUD / save）だけ。
//
// したがって以下は**すべて production の実装が動く**:
//   dealDamage / damageArea / aoe / meleeStrike / checkCollisions / updateProjectiles /
//   updateEnemies / updateGems / updateRecalc / targetsInRadius / nearestTarget /
//   densestPoint / shatterEnemy / detonateMark / chainDetonate / _chainHit / _splitLance /
//   _ricochetBounce / _spawnIceFragments / onEnemyKilled / onBossKilled / grantXp /
//   _recordDeathEvent / executeTarget / launchTarget / grabTarget / throwGrabbed /
//   pullTarget / tryDeflectProjectile / createReflectedPhysicalProjectile /
//   Projectile.update / Projectile.registerHit / Enemy.update / Player.takeDamage /
//   Pool / SpatialGrid / StatusEffectManager / FreezeSystem / WarriorCombatSystem /
//   SkillManager / PassiveManager / CombatTelemetry
//
// 禁止事項（この file は 1 つも行っていない）:
//   data damage の単純加算 / 弾の即着弾扱い / DoT の一括化 / boss gauge の damage 化 /
//   echo・clone・chain 回数の推測 / reactive の無条件 cast / job 別簡易ハーネス /
//   Math.random / quality 別ロジック / production に無い補正

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPhaser, stepPhysics, resetPhysics, makeAddApi, makePhysicsApi, bodyCount } from './phaser-stub.mjs';

installPhaser();

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const loadData = (n) => JSON.parse(readFileSync(join(REPO, 'data', n), 'utf8'));
export const readSrc = (rel) => readFileSync(join(REPO, rel), 'utf8');

export const RAW = {
  balance: loadData('balance.json'), skills: loadData('skills.json'), passives: loadData('passives.json'),
  evolutions: loadData('skill-evolutions.json'), jobs: loadData('jobs.json'), enemies: loadData('enemies.json'),
  bosses: loadData('bosses.json'), skillConfig: loadData('skill-config.json'), statusEffects: loadData('status-effects.json'),
  jobProgression: loadData('job-progression.json'), skillMastery: loadData('skill-mastery.json'),
  permanentUpgrades: loadData('permanent-upgrades.json'), reincarnation: loadData('reincarnation.json'),
  balanceThresholds: loadData('balance-thresholds.json'),
};

export const JOB_IDS = ['flame_witch', 'frost_mage', 'warrior'];
export const QUALITIES = ['low', 'medium', 'high', 'ultra'];
export const HEAVY = process.env.HEAVY === '1';
export const jobOf = (id) => RAW.jobs.jobs.find((j) => j.id === id);
export const poolsOf = (id) => {
  const j = jobOf(id);
  return { active: j.activeSkillPool || [], passive: j.passiveSkillPool || [], evolution: j.evolutionPool || [] };
};
export const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

// ---- production モジュールの読み込み（DataManager へ data を注入してから）----
let MOD = null;
export async function bootProduction() {
  if (MOD) return MOD;
  const { DataManager } = await import('../src/systems/DataManager.js');
  Object.assign(DataManager.data, {
    balance: RAW.balance, skills: RAW.skills, passives: RAW.passives, skillEvolutions: RAW.evolutions,
    jobs: RAW.jobs, enemies: RAW.enemies, bosses: RAW.bosses, skillConfig: RAW.skillConfig,
    statusEffects: RAW.statusEffects, jobProgression: RAW.jobProgression, skillMastery: RAW.skillMastery,
    permanentUpgrades: RAW.permanentUpgrades, reincarnation: RAW.reincarnation, balanceThresholds: RAW.balanceThresholds,
  });
  // loadAll() が作る索引を同じ内容で用意する（fetch を使わずに production の getter を有効化）。
  for (const s of RAW.skills.skills) DataManager._skillMap.set(s.id, s);
  for (const e of RAW.enemies.enemies) DataManager._enemyMap.set(e.id, e);
  DataManager._passiveMap = new Map(RAW.passives.passives.map((p) => [p.id, p]));
  DataManager._jobMap = new Map(RAW.jobs.jobs.map((j) => [j.id, j]));
  DataManager.loaded = true;

  const [bs, sm, pm, pool, grid, ser, sfs, fzs, jmm, wcs, tel, plr, enm, prj, gem] = await Promise.all([
    import('../src/scenes/BattleScene.js'), import('../src/systems/SkillManager.js'),
    import('../src/systems/PassiveManager.js'), import('../src/systems/PoolManager.js'),
    import('../src/systems/SpatialGrid.js'), import('../src/systems/StatusEffectRegistry.js'),
    import('../src/systems/StatusEffectManager.js'), import('../src/systems/FreezeSystem.js'),
    import('../src/systems/JobModifierManager.js'), import('../src/systems/WarriorCombatSystem.js'),
    import('../src/systems/CombatTelemetry.js'), import('../src/entities/Player.js'),
    import('../src/entities/Enemy.js'), import('../src/entities/Projectile.js'),
    import('../src/entities/ExperienceGem.js'),
  ]);
  const [bss, spm] = await Promise.all([
    import('../src/entities/Boss.js'), import('../src/systems/SpawnManager.js'),
  ]);
  MOD = {
    DataManager, BattleScene: bs.BattleScene, SkillManager: sm.SkillManager, PassiveManager: pm.PassiveManager,
    Pool: pool.Pool, SpatialGrid: grid.SpatialGrid, StatusEffectRegistry: ser.StatusEffectRegistry,
    StatusEffectManager: sfs.StatusEffectManager, FreezeSystem: fzs.FreezeSystem,
    JobModifierManager: jmm.JobModifierManager, WarriorCombatSystem: wcs.WarriorCombatSystem,
    CombatTelemetry: tel.CombatTelemetry, Player: plr.Player, Enemy: enm.Enemy,
    Projectile: prj.Projectile, ExperienceGem: gem.ExperienceGem,
    Boss: bss.Boss, SpawnManager: spm.SpawnManager,
  };
  return MOD;
}

const WORLD_W = 1600, WORLD_H = 1200;

// 演出 API（EffectManager 相当）。**visual オブジェクト数を数えるだけ**でロジックへ影響しない。
function makeEffects(counters, quality, scene) {
  // ★ 品質は**毎回** scene.settings.effectQuality から解決する（周回中の切替を production と同じに反映）。
  const qOf = () => RAW.balance.effectQuality[(scene && scene.settings && scene.settings.effectQuality) || quality]
    || RAW.balance.effectQuality.high;
  const bump = (k, n = 1) => { counters[k] = (counters[k] || 0) + n; counters.visualTotal += n; };
  return {
    settings: { quality },
    setSettings() {},
    beginFrame() { counters.frames = (counters.frames || 0) + 1; },
    // 品質で「作る量」だけが変わる（gameplay へは一切影響しない）。
    damageNumber() { if (qOf().damageNumbers) bump('damageNumbers'); },
    hitBurst() { const q = qOf(); bump('particles', Math.max(1, Math.round((q.maxSparksPerBurst ?? 12) * (q.particleScale ?? 1)))); },
    hitSpark() { bump('particles', Math.max(1, Math.round(2 * (qOf().particleScale ?? 1)))); },
    sparks(_x, _y, n) { const q = qOf(); bump('particles', Math.max(1, Math.round(Math.min(n || 4, q.maxSparksPerBurst ?? 12) * (q.particleScale ?? 1)))); },
    enemyFlash() { bump('flash'); },
    deathBurst() { bump('particles', Math.max(1, Math.round(4 * (qOf().particleScale ?? 1)))); },
    explosion() { bump('particles', Math.max(1, Math.round(8 * (qOf().particleScale ?? 1)))); },
    meteorImpact() { bump('particles', Math.max(1, Math.round(10 * (qOf().particleScale ?? 1)))); },
    pillarBurst() { bump('particles', Math.max(1, Math.round(6 * (qOf().particleScale ?? 1)))); },
    telegraph() { bump('rings'); },
    whiteFlash() { if (qOf().whiteFlash) bump('whiteFlash'); },
    screenShake() { if (qOf().screenShake) bump('shake'); },
    hitStop() { /* frame は止めない（比較の等時性を保つ・回数だけ数える） */ bump('hitStopFx', 0); counters.hitStopFx = (counters.hitStopFx || 0) + 1; },
    json() { return {}; },
  };
}

// scene.time / tweens / cameras / input / HUD / save の最小代替。
function makeSceneShell(scene, counters) {
  let nowMs = 10000;
  const timers = [];
  scene.time = {
    get now() { return nowMs; },
    delayedCall: (delay, fn) => { const t = { left: delay, fn, remove() { t.dead = true; } }; timers.push(t); return t; },
    addEvent: (cfg) => ({ remove() {} , destroy() {} }),
  };
  scene._advanceTime = (ms) => {
    nowMs += ms;
    for (let i = timers.length - 1; i >= 0; i--) {
      const t = timers[i];
      if (t.dead) { timers.splice(i, 1); continue; }
      t.left -= ms;
      if (t.left <= 0) { timers.splice(i, 1); try { t.fn(); } catch (e) { counters.timerErrors = (counters.timerErrors || 0) + 1; } }
    }
  };
  scene._pendingTimers = () => timers.length;
  scene.tweens = { add: (cfg) => { if (cfg && cfg.onComplete) cfg.onComplete(); return { remove() {}, stop() {} }; }, killTweensOf() {} };
  scene.cameras = { main: { setBounds() {}, startFollow() {}, shake() {}, flash() {}, scrollX: 0, scrollY: 0, width: 800, height: 600 } };
  scene.input = { keyboard: { on() {}, addKeys: () => ({}), createCursorKeys: () => ({}) }, on() {} };
  scene.scene = { launch() {}, pause() {}, resume() {}, start() {}, stop() {}, isActive: () => false };
  scene.sound = { play() {} };
  scene.add = makeAddApi(scene);
  scene.physics = makePhysicsApi();
  scene.textures = { exists: () => true, get: () => ({}) };
  scene.load = {};
  scene.events = { on() {}, off() {}, emit() {} };
  return scene;
}

// ---- battle profile ----
// 固定：seed / difficulty / duration / dt / player base / Job Lv / 恒久強化 / slot /
// enemy timeline / boss timeline / 敵弾 timeline / world / gameplay cap / 開始 save。
// ジョブごとに変わるのは draft / resource / status / movement / defense / evolution だけ。
export const PROFILES = {
  // A. normal wave: 通常敵中心・密度高め・3 分相当
  normal: {
    id: 'normal', label: 'A normal wave', durationMs: 180000, dt: 32,
    spawn: { normalEvery: 900, normalPer: 3, eliteEvery: 0, cap: 90 },
    boss: false, bulletEvery: 0, playerHit: null,
  },
  // B. elite pressure: 通常＋エリート・敵弾あり・3 分相当
  elite: {
    id: 'elite', label: 'B elite pressure', durationMs: 180000, dt: 32,
    spawn: { normalEvery: 1200, normalPer: 2, eliteEvery: 6000, cap: 70 },
    boss: false, bulletEvery: 1500, playerHit: null, closeSpawnEvery: 2500, closeSpawnDist: 60,
  },
  // C. boss: ボス＋add・telegraph / charge あり・5 分または撃破まで
  boss: {
    id: 'boss', label: 'C boss', durationMs: 300000, dt: 32,
    spawn: { normalEvery: 2000, normalPer: 2, eliteEvery: 15000, cap: 40 },
    boss: true, bossAtMs: 3000, bulletEvery: 1100, playerHit: null,
  },
  // E. stimulus: reactive / defensive の刺激専用（§6）。3 ジョブへ同一 timeline を適用する。
  //    ボスは撃破されない HP（比較対象は「反応したか」だけで、火力ではない）。
  stimulus: {
    id: 'stimulus', label: 'E reactive stimulus', durationMs: 26000, dt: 32,
    spawn: { normalEvery: 0, normalPer: 0, eliteEvery: 0, cap: 40 },
    boss: true, bossAtMs: 500, bossHpMult: 6000, bulletEvery: 2500, playerHit: null, playerHpMult: 24, closeSpawnEvery: 2000, closeSpawnDist: 55, closeSpawnHpMult: 60,
    noWinBreak: true,
  },
  // D. survival: 高密度・強い被弾・回避不能ダメージあり
  survival: {
    id: 'survival', label: 'D survival', durationMs: 180000, dt: 32,
    spawn: { normalEvery: 700, normalPer: 4, eliteEvery: 9000, cap: 110 },
    boss: false, bulletEvery: 900, playerHit: { every: 1500, amount: 12, dir: 'mixed' }, closeSpawnEvery: 1200, closeSpawnDist: 55,
  },
};

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ---- scene の組み立て（create() の必要部分を production 部品で再現）----
// build: 'slot8'（各ジョブのプール先頭 8 active Lv8 ＋ passive 4 Lv4・枠の条件を 3 ジョブで揃える）
//        'full'（active 30 Lv8・性能 / 品質不変性の最大負荷）
//        'evolved'（進化 18 Lv1・進化経路の解決確認）
//        'initial'（初期スキルのみ）
export async function makeBattle({ jobId, quality = 'high', seed = 1234, profile = 'normal', speed = 1, build = 'slot8' } = {}) {
  const M = await bootProduction();
  const P = PROFILES[profile];
  const bal = RAW.balance;
  const counters = { visualTotal: 0 };
  const scene = Object.create(M.BattleScene.prototype);
  makeSceneShell(scene, counters);

  scene.settings = { effectQuality: quality, autoMove: true, damageNumbers: true, screenShake: true, whiteFlash: true, speed };
  scene.effSettings = {
    quality, particleScale: 1, damageNumbers: true, screenShake: true, whiteFlash: true, hitStop: true,
    maxEnemies: num(bal.gameplayLimits.maxEnemies, 200), maxProjectiles: num(bal.gameplayLimits.maxProjectiles, 400),
    maxSparksPerBurst: 12,
  };
  scene.worldW = WORLD_W; scene.worldH = WORLD_H;
  scene.saveVersion = bal.saveVersion; scene.gameVersion = bal.gameVersion;
  scene.difficultyId = 1;
  // 難易度は 3 ジョブ共通（difficulty 1）。profile がボス HP 倍率だけを上書きできる（stimulus 用）。
  scene.difficulty = { ...bal.difficulties[0], bossHp: (bal.difficulties[0].bossHp || 1) * (P.bossHpMult || 1) };
  scene.resumeData = null;
  // 恒久強化 / 熟練度 / 転生は **3 ジョブで同一の素の状態**に固定（profile の一部）。
  scene.profile = { save_version: 6, selectedJobId: jobId, permanentUpgrades: {}, skillMastery: {}, reincarnationUpgrades: {}, reincarnationCount: 0 };
  scene.upgradeStats = { moveSpeedMult: 1, pickupMult: 1, xpMult: 1, damageMult: 1, startSkillLevel: 0, maxHpAdd: 0 };
  scene.masteryBonus = {};
  scene.reincStats = { chainCount: 0, autoDash: false, speedMax: 1, activeSlotBonus: 0, levelUpChoices: 0, startDamageMult: 1, startSkillLevel: 0, enemyCapAdd: 0, effectCapAdd: 0 };
  scene.cycleNumber = 0; scene.chainBonus = 0; scene._evolvedBonuses = {};
  scene.autoDashEnabled = false; scene.speedMax = 1;
  scene.enemyCapAdd = 0;
  scene.particleBudget = num((bal.combatCaps.particleBudget || {})[quality], 200);
  scene.bonus = { moveMult: 1, pickupMult: 1, xpMult: 1, damageMult: 1 };
  scene.choicesPerLevel = num(bal.leveling.choicesPerLevel, 3);

  scene.effects = makeEffects(counters, quality, scene);
  scene._visualCounters = counters;

  // ジョブ
  scene.job = M.DataManager.getJob(jobId);
  scene.jobId = jobId;
  scene.jobElement = scene.job.element || (jobId === 'flame_witch' ? 'fire' : (jobId === 'frost_mage' ? 'ice' : null));
  scene.isWarrior = jobId === 'warrior';
  scene._defaultElement = scene.jobElement;
  scene.activeSlotsMax = num(scene.job.baseActiveSlots, 4);
  scene.passiveSlotsMax = num(scene.job.basePassiveSlots, 4);

  // プレイヤー（3 ジョブ共通の base stats）
  const pcfg = { ...bal.player, baseXpToLevel: bal.leveling.baseXpToLevel };
  // profile が HP 倍率を指定できる（stimulus profile 用・3 ジョブへ同一に適用）。
  if (P.playerHpMult) pcfg.maxHp = Math.round(pcfg.maxHp * P.playerHpMult);
  scene._baseMaxHp = pcfg.maxHp;
  scene.player = new M.Player(scene, WORLD_W / 2, WORLD_H / 2, pcfg);

  // 空間グリッド / プール（gameplayLimits 由来 = 品質非依存）
  const gridCfg = bal.spatialGrid || {};
  scene._cellSize = gridCfg.cellSize || 64;
  scene._gridMax = gridCfg.maxRegistered || 4000;
  scene._useSpatial = gridCfg.enabledByDefault !== false;
  scene.enemyGrid = new M.SpatialGrid(scene._cellSize, WORLD_W, WORLD_H);
  scene.gemGrid = new M.SpatialGrid(scene._cellSize, WORLD_W, WORLD_H);
  scene._enemySeq = 0; scene._gemSeq = 0;
  scene._perf = { frames: 0, dtSum: 0, dtMax: 0, fpsMin: Infinity };
  // ★ hook は production の create() と 1 文字も違わない内容を使う。
  scene.enemyPool = new M.Pool(scene, () => new M.Enemy(scene), (e, def, x, y, m) => e.reset(def, x, y, m), scene.effSettings.maxEnemies, {
    onSpawn: (e) => { e._seq = scene._enemySeq++; if (scene._useSpatial) scene.enemyGrid.insert(e); },
    onRelease: (e) => { scene.enemyGrid.remove(e); if (scene.statusFx) scene.statusFx.onRelease(e); else scene.unregisterBurning(e); if (scene.warrior) scene.warrior.onEnemyRemoved(e); },
  });
  scene.projPool = new M.Pool(scene, () => new M.Projectile(scene), (p, x, y, a, s, o) => p.reset(x, y, a, s, o), scene.effSettings.maxProjectiles);
  scene.bossBulletPool = new M.Pool(scene, () => new M.Projectile(scene), (p, x, y, a, s, o) => p.reset(x, y, a, s, o), 300);
  scene.gemPool = new M.Pool(scene, () => new M.ExperienceGem(scene), (g, x, y, v) => g.reset(x, y, v), 500, {
    onSpawn: (g) => { g._seq = scene._gemSeq++; if (scene._useSpatial) scene.gemGrid.insert(g); },
    onRelease: (g) => scene.gemGrid.remove(g),
  });

  // 状態異常 / ジョブ補正 / 戦士
  scene.statusReg = new M.StatusEffectRegistry(M.DataManager.statusEffectsData);
  scene.freezeSys = new M.FreezeSystem(scene.statusReg);
  scene.jobMods = new M.JobModifierManager();
  scene.warrior = new M.WarriorCombatSystem({
    config: bal.warrior || null, enabled: scene.isWarrior,
    now: () => scene.time.now,
    heal: (amount) => scene._warriorHeal(amount),
    emit: (type, payload) => scene._onWarriorEvent(type, payload),
  });
  scene._warriorHitGroup = 0;

  scene._echoScale = 1; scene._inEcho = false; scene._castCtx = null; scene._lastClonableCast = null;
  scene._frameBudgets = {};
  scene._deathEvents = []; scene._deathEventSeq = 0; scene._deathEmitsThisFrame = 0; scene._frameId = 0; scene._deathTrackers = 0;
  scene._hitGroupSeq = 0;

  scene.skills = new M.SkillManager(scene);
  scene.skills.setMasteryBonuses({});
  scene.passives = new M.PassiveManager(scene);
  scene.passives.setDefs(M.DataManager.passives, M.DataManager.skillConfig);

  scene.rngSeed = seed >>> 0 || 1;
  scene.rng = (() => { let s = scene.rngSeed; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
  const statusSeed = ((scene.rngSeed >>> 0) ^ 0x51ce9e11) >>> 0 || 1;
  scene.statusFx = new M.StatusEffectManager({
    registry: scene.statusReg, freezeSystem: scene.freezeSys,
    now: () => scene.time.now, seed: statusSeed,
    cap: (name, fb) => M.DataManager.skillCap(name, quality, fb),
  });
  scene._burningIndex = scene.statusFx.indexOf('burning');
  scene._pendingBossFrost = null;

  scene.telemetry = new M.CombatTelemetry({
    runId: `harness-${jobId}-${profile}-${seed}`, seed: scene.rngSeed, difficulty: 1, quality,
    speed, jobId, jobLevelAtStart: 1, debugRun: true, // ★ ハーネスは常に debugRun（通常統計へ混ぜない）
  });
  scene._debugRun = true;
  scene._acquireOrder = 0; scene._skillAcquiredAt = {};

  scene.timeSec = 0; scene.kills = 0; scene.eliteKills = 0; scene.bossKills = 0; scene.maxHit = 0;
  scene._damageTakenTotal = 0;
  scene.autoMove = true; scene.paused = false; scene.gameOver = false;
  scene.boss = null; scene.bossSpawned = false;
  scene._recalc = 0; scene._nearestEnemy = null; scene._nearestGem = null;
  scene._autoSaveAccum = 0; scene._hitStopMs = 0;
  scene.speedMult = speed;
  scene._svEnemies = [];
  scene.statusVisuals = null; scene.statusDebug = null;
  // キー入力（すべて未押下 = autoMove 経路を通る）。production の handleInput をそのまま使う。
  const upKey = { isDown: false };
  scene.keys = { up: upKey, down: upKey, right: upKey, upA: upKey, downA: upKey, leftA: upKey, rightA: upKey, moveLeft: upKey, dash: upKey };
  scene._m = { aoe: 0, suppressed: 0, brute: 0, cand: 0, final: 0, queries: 0 };
  scene._mLast = scene._m;

  scene.buildCombatApi();
  scene._perFrameReset();

  // ---- 表示 / 保存 / 入力の置き換え（gameplay へ影響しない）----
  scene.updateHud = () => {};
  scene.updateHudSkills = () => {};
  scene.showBanner = () => {};
  scene.autoSave = () => { counters.autoSaveCalls = (counters.autoSaveCalls || 0) + 1; };
  scene.saveRun = () => { counters.saveRunCalls = (counters.saveRunCalls || 0) + 1; };
  scene.requestHitStop = () => { counters.hitStop = (counters.hitStop || 0) + 1; }; // frame を止めない（比較の等時性を保つ）
  scene.openLevelUp = () => { counters.levelUpsOffered = (counters.levelUpsOffered || 0) + 1; scene._harnessLevelUp(); };
  scene.hud = { showBoss() {}, hideBoss() {}, showBossFrost() {}, update() {}, setSkills() {} };
  scene.finishRun = (win) => { scene.gameOver = true; scene._win = !!win; scene._finishedAtMs = scene._elapsedMs; };
  scene.spawnBoss = () => M.BattleScene.prototype.spawnBoss.call(scene);
  // spawn は production の SpawnManager（data の run.phases / difficulty をそのまま使う＝3 ジョブ同一）。
  scene.spawn = new M.SpawnManager(scene);
  scene.spawnZakoNear = (bx, by) => scene.spawn.spawnZakoNear(bx, by);
  scene.checkBossTime = () => {};        // boss 出現時刻は profile が決める（下の _spawnWave）
  // handleInput は production をそのまま使う（キー入力は全て未押下 → autoMove 経路）。
  scene.onPlayerDeath = () => { scene.gameOver = true; counters.deaths = (counters.deaths || 0) + 1; scene._deathAtMs = scene._elapsedMs; };
  scene.onResult = () => {};
  scene.battle = { update() {} };
  scene.pauseMenu = { open() {}, close() {} };

  // 所持 build（抽選そのものは cross-job-draft-audit が担当。ここでは 3 ジョブで枠条件を揃えた build を直接与える）。
  scene.draft = null;
  for (const id of (scene.job.initialActiveSkills || [])) scene.skills.acquireOrLevel(id);
  for (const id of (scene.job.initialPassiveSkills || [])) scene.passives.acquireOrLevel(id);
  const pools = { active: scene.job.activeSkillPool || [], passive: scene.job.passiveSkillPool || [], evolution: scene.job.evolutionPool || [] };
  const grant = (ids, lv) => { for (const id of ids) { scene.skills.acquireOrLevel(id); try { scene.skills.setLevel(id, lv); } catch (e) { void e; } } };
  const grantPassives = (lv) => { for (const id of pools.passive) for (let i = 0; i < lv; i++) scene.passives.acquireOrLevel(id); };
  if (build === 'slot8') { grant(pools.active.slice(0, 8), 8); grantPassives(4); }
  else if (build === 'full') { grant(pools.active, 8); grantPassives(4); }
  else if (build === 'evolved') { grant(pools.evolution, 1); grantPassives(4); }
  scene._buildKind = build;
  scene._refreshStatusPassivesIfNeeded(true);
  scene._refreshWarriorMods(true);
  scene.player.moveSpeed = bal.player.moveSpeed * scene.bonus.moveMult;

  // ---- ハーネス側の driver ----
  scene._elapsedMs = 0;
  scene._profile = P;

  scene._harnessLevelUp = () => {
    // レベルアップは「所持スキルを 1 段上げる」だけ（抽選そのものは cross-job-draft 系が担当）。
    // 3 ジョブで同じ規則（決定論・profile の一部）。
    const ids = [...scene.skills.skills.keys()];
    if (!ids.length) return;
    const id = ids[counters.levelUpsOffered % ids.length];
    scene.skills.acquireOrLevel(id);
  };

  scene._spawnWave = () => {
    const P2 = scene._profile;
    const t = scene._elapsedMs;
    // 通常 / エリートの湧きは production の SpawnManager（data 由来・3 ジョブ同一）。
    scene.spawn.update(P2.dt);
    // 接敵 timeline: プレイヤーの至近へ湧かせる（オート移動が完全に kite できてしまう
    // ヘッドレス条件を補正する profile パラメータ。3 ジョブへ同一に適用する）。
    if (P2.closeSpawnEvery && t % P2.closeSpawnEvery < P2.dt && scene.enemyPool.activeCount < P2.spawn.cap) {
      const defs = RAW.enemies.enemies.filter((e) => !e.elite);
      const def = defs[(t / P2.closeSpawnEvery | 0) % defs.length];
      const a = ((t / P2.closeSpawnEvery | 0) % 8) * (Math.PI / 4);
      const d = P2.closeSpawnDist || 60;
      const mult = scene.spawn.enemyMult();
      // profile が至近湧きの HP 倍率を指定できる（coverage profile 用・3 ジョブへ同一）。
      // 硬い敵は接敵距離帯を通過しながら生き残るので、近接 / 接触判定の経路が確実に走る。
      const m2 = P2.closeSpawnHpMult ? { ...mult, hp: mult.hp * P2.closeSpawnHpMult } : mult;
      scene.enemyPool.spawn(def, scene.player.x + Math.cos(a) * d, scene.player.y + Math.sin(a) * d, m2);
    }
    // 敵弾 timeline（3 ジョブ同一の刺激）。production の Projectile を hostile で生成する。
    if (P2.bulletEvery && t % P2.bulletEvery < P2.dt) {
      const a = ((t / P2.bulletEvery) % 8) * (Math.PI / 4);
      scene.bossBulletPool.spawn(
        scene.player.x - Math.cos(a) * 300, scene.player.y - Math.sin(a) * 300, a, 190,
        { hostile: true, damage: 12, projectileKind: 'bossBullet', lifeMs: 4000 },
      );
    }
    if (P2.boss && !scene.bossSpawned && t >= P2.bossAtMs) {
      scene.bossSpawned = true;
      scene.spawnBoss();
      counters.bossSpawnedAt = t;
    }
  };
  return { scene, M, counters, profile: P };
}

// 1 フレーム進める（production の update をそのまま呼ぶ）。
export function stepFrame(h) {
  const { scene, profile } = h;
  const dt = profile.dt;
  scene._spawnWave();
  // 被弾 timeline（3 ジョブ共通の刺激）
  const ph = profile.playerHit;
  if (ph && ph.every && scene._elapsedMs % ph.every < dt && scene.player.alive) {
    const dirs = { front: { x: scene.player.x + 40, y: scene.player.y }, side: { x: scene.player.x, y: scene.player.y + 40 }, back: { x: scene.player.x - 40, y: scene.player.y } };
    const key = ph.dir === 'mixed' ? ['front', 'side', 'back'][Math.floor(scene._elapsedMs / ph.every) % 3] : ph.dir;
    scene.onWarriorDamage ? scene.onWarriorDamage(ph.amount, dirs[key]) : null;
    if (scene.player.takeDamage(ph.amount, dirs[key]) && !scene.player.alive) scene.onPlayerDeath();
  }
  // production のメインループ
  scene.update(scene._elapsedMs, dt);
  // Arcade Physics の位置積分（Phaser 側の処理）
  stepPhysics(dt, WORLD_W, WORLD_H);
  scene._advanceTime(dt);
  scene._elapsedMs += dt;
}

// profile を最後まで回す。
export function runProfile(h, { maxMs = null } = {}) {
  const limit = maxMs != null ? maxMs : h.profile.durationMs;
  while (h.scene._elapsedMs < limit) {
    stepFrame(h);
    if (h.scene.gameOver) break;
    if (!h.profile.noWinBreak && h.profile.boss && h.scene.boss && !h.scene.boss.alive) break;
  }
  return h;
}

// ---- 経路カバレッジの観測（production のメソッドへ委譲するだけのラッパ）----
// ロジックは 1 行も変えない。呼ばれた回数を数えてから元の実装を呼ぶ。
const OBSERVED = [
  'dealDamage', 'damageArea', 'aoe', 'meleeStrike', 'shatterEnemy', 'detonateMark', 'chainDetonate',
  '_chainHit', '_splitLance', '_ricochetBounce', '_spawnIceFragments', '_deathShatter', '_doMarkExplosion',
  'executeTarget', 'launchTarget', 'grabTarget', 'throwGrabbed', 'pullTarget', 'tryDeflectProjectile',
  'createReflectedPhysicalProjectile', 'freezeEnemy', '_onBossFrostbreak', 'igniteEnemy', 'onEnemyKilled',
  'onBossKilled', 'grantXp', '_recordDeathEvent', 'performClone', 'absorbBossBullets', '_warriorHeal',
  'movePlayerTowards', 'onWarriorHit', 'onWarriorDamage', 'onBarrierBlock', 'onPhoenixRevive', 'checkCollisions',
];
export function instrument(h) {
  const { scene } = h;
  const paths = Object.create(null);
  for (const name of OBSERVED) {
    const orig = scene[name];
    if (typeof orig !== 'function') continue;
    scene[name] = function wrapped(...args) {
      paths[name] = (paths[name] || 0) + 1;
      return orig.apply(this, args);
    };
  }
  // 弾の生成種別（gameplay projectile のみ・visual-only は projPool を通らない）。
  const spawnOrig = scene.projPool.spawn.bind(scene.projPool);
  scene.projPool.spawn = (x, y, a, s, o = {}) => {
    paths.projectileSpawn = (paths.projectileSpawn || 0) + 1;
    if (o.behavior) paths[`proj:${o.behavior}`] = (paths[`proj:${o.behavior}`] || 0) + 1;
    if ((o.generation || 0) > 0) paths.projSecondaryGen = (paths.projSecondaryGen || 0) + 1;
    if (o.homingRate > 0) paths.projHoming = (paths.projHoming || 0) + 1;
    if (o.explosionRadius > 0) paths.projExplosive = (paths.projExplosive || 0) + 1;
    if (o.pierce > 0) paths.projPierce = (paths.projPierce || 0) + 1;
    if (o.tag === 'reflected') paths.projReflected = (paths.projReflected || 0) + 1;
    return spawnOrig(x, y, a, s, o);
  };
  const bbOrig = scene.bossBulletPool.spawn.bind(scene.bossBulletPool);
  scene.bossBulletPool.spawn = (...args) => { paths.enemyProjectileSpawn = (paths.enemyProjectileSpawn || 0) + 1; return bbOrig(...args); };
  h.paths = paths;
  return h;
}

// ---- 比較指標（§7）----
export function collectMetrics(h) {
  const s = h.scene;
  const fin = s.telemetry.finalize();
  // ★ statsList() は casts/damage/kills が全て 0 の行を落とすため、reactive スキルが消える。
  //   横断監査では所持スキル全件を見る必要があるので stats Map を直接使う。
  const stats = [...s.skills.stats.entries()].map(([id, st]) => ({ id, ...st }));
  const totalDamage = stats.reduce((a, x) => a + (x.damage || 0), 0);
  const sec = Math.max(0.001, s._elapsedMs / 1000);
  const share = {};
  for (const x of stats) share[x.id] = totalDamage > 0 ? (x.damage || 0) / totalDamage : 0;
  const top = Object.entries(share).sort((a, b) => b[1] - a[1])[0] || ['-', 0];
  const w = s.warrior.enabled ? s.warrior.summary() : null;
  const sc = s.statusFx.counters();
  const owned = [...s.skills.skills.keys()];
  const zeroHit = owned.filter((id) => { const x = stats.find((y) => y.id === id); return x && (x.casts || 0) > 0 && (x.hits || 0) === 0; });
  const zeroUtility = owned.filter((id) => {
    const x = stats.find((y) => y.id === id);
    if (!x) return true;
    const extras = Object.values(x.extra || {}).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
    return (x.damage || 0) === 0 && (x.hits || 0) === 0 && extras === 0;
  });
  return {
    jobId: s.jobId, profile: h.profile.id, seed: s.rngSeed, quality: s.settings.effectQuality,
    durationMs: s._elapsedMs,
    offense: {
      totalDamage: Math.round(totalDamage), dps: Math.round(totalDamage / sec),
      kills: s.kills, eliteKills: s.eliteKills, bossKills: s.bossKills,
      maxHit: Math.round(s.maxHit),
      casts: stats.reduce((a, x) => a + (x.casts || 0), 0),
      hits: stats.reduce((a, x) => a + (x.hits || 0), 0),
      zeroHitCasts: zeroHit, zeroUtility,
      topSkill: top[0], topShare: Math.round(top[1] * 1000) / 1000,
      bossKillMs: s.bossKills > 0 ? s._elapsedMs : null,
      bossHpRemain: s.boss && s.boss.alive ? Math.round(s.boss.hp) : (s.bossKills > 0 ? 0 : null),
      bossHpMax: s.boss ? Math.round(s.boss.maxHp) : null,
    },
    defense: {
      hp: Math.round(s.player.hp), maxHp: s.player.maxHp,
      died: !!s.gameOver && !s._win, survivedMs: s.gameOver && !s._win ? (s._deathAtMs || s._elapsedMs) : s._elapsedMs,
      damageTaken: Math.round(s._damageTakenTotal || 0),
      mitigated: w ? Math.round(w.mitigationAmount) : 0,
      healing: w ? Math.round(w.recoveryAmount + w.killHeal) : 0,
      unyielding: w ? w.unyieldingTriggers : 0,
    },
    utility: {
      chillApplied: Math.round(sc.chillAmountTotal), freezes: sc.freezeSuccesses,
      freezeAttempts: sc.freezeAttempts, immunitySkips: sc.immunitySkips,
      bossGauge: sc.bossGaugeApplications,
      bossFrostbreaks: fin.run.status.bossFrostbreaks, shatters: fin.run.status.shatters,
      burningDamage: Math.round(fin.run.status.burningDamage), iceDamage: Math.round(fin.run.status.iceDamage),
      knockbacks: w ? w.knockbacks : 0, poise: w ? Math.round(w.poiseDamage) : 0,
      eliteStaggers: w ? w.eliteStaggers : 0, bossStanceBreaks: w ? w.bossStanceBreaks : 0,
      counters: w ? w.counters : 0, executions: w ? w.executions : 0,
      launches: w ? (w.launches || 0) : 0, grabs: w ? (w.grabs || 0) : 0,
      movement: w ? Math.round(w.sweepDistance || 0) : 0,
    },
    resource: w ? {
      furyGained: Math.round(w.furyGained), furyReleases: w.furyReleases,
      furyOvercap: Math.round(w.furyOvercap), furyUptimeSec: Math.round(w.furyReleaseUptimeSeconds * 10) / 10,
      comboPeak: w.comboPeak, comboBreaks: w.comboBreaks,
    } : null,
    progression: { level: s.player.level, xp: s.player.xp, levelUps: h.counters.levelUpsOffered || 0 },
    pools: {
      projCreated: s.projPool.createdCount, projReused: s.projPool.reusedCount, projReleased: s.projPool.releasedCount,
      projActive: s.projPool.activeCount, enemyCreated: s.enemyPool.createdCount, enemyActive: s.enemyPool.activeCount,
      bossBullets: s.bossBulletPool.createdCount, gemCreated: s.gemPool.createdCount,
    },
    visual: h.counters.visualTotal,
    paths: h.paths ? { ...h.paths } : null,
    deathEvents: s._deathEventSeq,
  };
}

// gameplay trace（品質不変性の比較対象・visual を含めない）。
export function gameplayTrace(h) {
  const s = h.scene;
  const st = {};
  for (const [id, v] of s.skills.stats) {
    const x = { id, ...v };
    st[id] = {
      casts: x.casts, hits: x.hits, kills: x.kills, damage: Math.round((x.damage || 0) * 1000) / 1000,
      extra: JSON.parse(JSON.stringify(x.extra || {})),
    };
  }
  const run = JSON.parse(JSON.stringify(s.telemetry.finalize().run));
  // 品質で変わってよいのは「表示の記録」だけ: quality ラベルと FPS 計測。
  delete run.quality; delete run.avgFps; delete run.minFps; delete run.frameP95Ms;
  return {
    skills: st, kills: s.kills, eliteKills: s.eliteKills, bossKills: s.bossKills,
    level: s.player.level, xp: s.player.xp, hp: Math.round(s.player.hp * 1000) / 1000, maxHp: s.player.maxHp,
    dead: !!s.gameOver, elapsedMs: s._elapsedMs, maxHit: Math.round(s.maxHit * 1000) / 1000,
    damageTaken: Math.round((s._damageTakenTotal || 0) * 1000) / 1000,
    bossHp: s.boss ? Math.round(s.boss.hp * 1000) / 1000 : null,
    statusRngCursor: s.statusFx.rng.cursor,
    statusCounters: s.statusFx.counters(),
    warrior: s.warrior.enabled ? s.warrior.summary() : null,
    runtime: JSON.parse(JSON.stringify(s.skills.serializeRuntime())),
    pools: {
      projCreated: s.projPool.createdCount, projReleased: s.projPool.releasedCount, projActive: s.projPool.activeCount,
      enemyCreated: s.enemyPool.createdCount, enemyReleased: s.enemyPool.releasedCount, enemyActive: s.enemyPool.activeCount,
      bossBullets: s.bossBulletPool.createdCount, gems: s.gemPool.createdCount,
    },
    deathEvents: s._deathEventSeq,
    telemetry: run,
  };
}

// ---- reactive / defensive 刺激 timeline（§6・3 ジョブへ同一適用）----
export const STIMULUS = [
  { at: 1000, kind: 'playerDamage', dir: 'front', amount: 10 },
  { at: 2500, kind: 'playerDamage', dir: 'side', amount: 10 },
  { at: 4000, kind: 'playerDamage', dir: 'back', amount: 10 },
  { at: 5500, kind: 'enemyProjectile', deflectable: true },
  { at: 7000, kind: 'enemyProjectile', deflectable: false },  // beam（弾けない）
  { at: 8500, kind: 'bossTelegraph' },
  { at: 10000, kind: 'hazardDot', amount: 6 },
  { at: 11500, kind: 'eliteAttack', amount: 16 },
  { at: 13000, kind: 'lowHp' },
  { at: 14500, kind: 'killEvent' },
  { at: 16000, kind: 'counterableMelee', amount: 12 },
  { at: 17500, kind: 'nonCounterable', amount: 12 },
  { at: 19000, kind: 'mitigatedHit', amount: 20 },
  { at: 20500, kind: 'enemyProjectile', deflectable: true },
  { at: 22000, kind: 'dash' },                       // 移動反応（爆炎歩法 等）
  { at: 23500, kind: 'lethalHit' },                  // 致死（障壁が受け止める側の経路）
  { at: 25000, kind: 'lethalHit' },                  // 2 度目の致死（障壁が CD 中 → 不死鳥の復活経路）
];

export function applyStimulus(h, ms) {
  const { scene } = h;
  const dt = h.profile.dt;
  const fired = [];
  for (const st of STIMULUS) {
    if (ms <= st.at && st.at < ms + dt) {
      fired.push(st.kind);
      const p = scene.player;
      const from = { front: { x: p.x + 40, y: p.y }, side: { x: p.x, y: p.y + 40 }, back: { x: p.x - 40, y: p.y } };
      switch (st.kind) {
        case 'playerDamage':
        case 'eliteAttack':
        case 'counterableMelee':
        case 'mitigatedHit': {
          // 戦士の反撃 / 前面防御へ届く production の入口。
          if (scene.warrior.enabled) scene.onWarriorDamage(st.amount, from[st.dir || 'front']);
          if (p.takeDamage(st.amount, from[st.dir || 'front']) && !p.alive) scene.onPlayerDeath();
          break;
        }
        case 'nonCounterable':
        case 'hazardDot': {
          if (p.takeDamage(st.amount, null) && !p.alive) scene.onPlayerDeath(); // 方向不明＝前面防御も反撃も乗らない
          break;
        }
        case 'enemyProjectile': {
          scene.bossBulletPool.spawn(p.x - 200, p.y, 0, 220, {
            hostile: true, damage: 12, lifeMs: 3000,
            projectileKind: st.deflectable ? 'bossBullet' : 'beam', isBeam: !st.deflectable,
          });
          break;
        }
        case 'bossTelegraph': {
          if (scene.boss && scene.boss.alive) scene.boss.state = 'telegraph';
          scene.bossBulletPool.spawn(p.x - 150, p.y - 60, 0.3, 200, { hostile: true, damage: 14, isTelegraph: true, projectileKind: 'telegraph', lifeMs: 2500 });
          break;
        }
        case 'lowHp': { p.hp = Math.max(1, Math.round(p.maxHp * 0.2)); break; }
        case 'dash': { p.tryDash(1, 0); if (scene.onPlayerDash) scene.onPlayerDash('start', p); break; }
        case 'lethalHit': {
          // production の takeDamage 経路（不死鳥の羽の復活はこの中で判定される）。
          if (p.takeDamage(p.maxHp * 3, from.front) && !p.alive) scene.onPlayerDeath();
          break;
        }
        case 'killEvent': {
          // 撃破イベントは**通常敵**で発生させる（ボスを即死させない）。
          let t = null;
          for (const e of scene.targetsInRadius(p.x, p.y, 100000)) { if (!e.isBoss) { t = e; break; } }
          if (!t) {
            const def = RAW.enemies.enemies.find((e) => !e.elite);
            t = scene.enemyPool.spawn(def, p.x + 60, p.y, { hp: 1, speed: 1, damage: 1 });
          }
          if (t) scene.dealDamage(t, 1e9, null, { quiet: true });
          break;
        }
        default: break;
      }
    }
  }
  return fired;
}

// ---- テストランナー（既存スイートと同じ体裁）----
export function runner(title) {
  let pass = 0; const fails = [];
  return {
    ok(cond, msg) { if (cond) pass++; else { fails.push(msg); console.log(`  ✗ ${msg}`); } },
    section(t) { console.log(t); },
    info(t) { console.log(`  ${t}`); },
    finish() {
      if (fails.length) { console.log(`\n✗ ${title} 失敗: ${fails.length} 件（成功 ${pass}）`); process.exit(1); }
      console.log(`\n✓ ${title} 成功: ${pass} 件すべて通過`);
    },
  };
}
