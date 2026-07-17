// 戦闘シーン（Milestone 2）。
// M1: プレイヤー移動/ダッシュ、敵出現、自動攻撃、経験値、レベルアップ3択、一時停止。
// M2 追加: 5種スキルと強化、ボス戦、リザルト遷移、EffectManager、オート移動改善、途中再開。
//
// 設計方針: ダメージ判定は combat.* が数値計算で行い、演出は effects.* が担当する。
// エフェクトを無効化しても戦闘結果は変わらない（判定と演出の分離）。

import { GAME_WIDTH, GAME_HEIGHT, TEX } from '../config/game-config.js';
import { DataManager } from '../systems/DataManager.js';
import { SaveManager } from '../systems/SaveManager.js';
import { ProgressionManager } from '../systems/ProgressionManager.js';
import { ReincarnationManager } from '../systems/ReincarnationManager.js';
import { EvolutionManager } from '../systems/EvolutionManager.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Boss } from '../entities/Boss.js';
import { Projectile } from '../entities/Projectile.js';
import { ExperienceGem } from '../entities/ExperienceGem.js';
import { Pool } from '../systems/PoolManager.js';
import { SkillManager } from '../systems/SkillManager.js';
import { PassiveManager } from '../systems/PassiveManager.js';
import { SkillDraftManager } from '../systems/SkillDraftManager.js';
import { EffectManager } from '../systems/EffectManager.js';
import { SpawnManager } from '../systems/SpawnManager.js';
import { BattleManager } from '../systems/BattleManager.js';
import { JobProgressionManager } from '../systems/JobProgressionManager.js';
import { JobModifierManager } from '../systems/JobModifierManager.js';
import { defaultCastContext, replayContext, canCastTriggerEcho, canCloneCopy } from '../systems/CastPolicy.js';
import { echoStatus, cloneStatus, appliesLv80ProjectileCount, castSummary } from '../systems/SkillAudit.js';
import { registeredSkillIds, skillsWithRuntimeState } from '../systems/SkillManager.js';
import { buildCatalog, evolutionRecipes, evolutionPartnerIds } from '../systems/SkillCatalog.js';
import { CombatTelemetry } from '../systems/CombatTelemetry.js';
import { defaultPlaytestConfig, resolveOverrides } from '../systems/BalancePlaytest.js';
import { StatusEffectRegistry } from '../systems/StatusEffectRegistry.js';
import { FreezeSystem } from '../systems/FreezeSystem.js';
import { StatusEffectManager } from '../systems/StatusEffectManager.js';
import { HUD } from '../ui/HUD.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { distance, dist2, createRng } from '../utils/math.js';
import { SpatialGrid } from '../systems/SpatialGrid.js';

const WORLD_W = 1600;
const WORLD_H = 1200;
const AUTOSAVE_MS = 20000;
const DEFAULT_CELL_SIZE = 64;
// 空間グリッド候補を出現順(_seq)＝プールSet順に整列するための比較関数。
// これにより空間検索の結果順が総当たり方式と一致し、貫通/連鎖などの結果が変わらない。
const SEQ_CMP = (a, b) => (a._seq || 0) - (b._seq || 0);

// 品質名 + ユーザートグルから、EffectManager 用の設定を解決する。
function resolveEffectSettings(bal, settings) {
  const q = (bal.effectQuality && bal.effectQuality[settings.effectQuality]) || (bal.effectQuality && bal.effectQuality.high) || {};
  return {
    quality: settings.effectQuality,
    particleScale: q.particleScale ?? 1,
    damageNumbers: (q.damageNumbers ?? true) && (settings.damageNumbers ?? true),
    screenShake: (q.screenShake ?? true) && (settings.screenShake ?? true),
    whiteFlash: (q.whiteFlash ?? true) && (settings.whiteFlash ?? true),
    hitStop: settings.effectQuality === 'high' || settings.effectQuality === 'ultra',
    maxEnemies: q.maxEnemies ?? 200,
    maxProjectiles: q.maxProjectiles ?? 400,
    maxSparksPerBurst: q.maxSparksPerBurst ?? 12,
  };
}

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  init(data) {
    this.difficultyId = data.difficulty || 1;
    this.resumeData = data.resume || null;
  }

  create() {
    const bal = DataManager.balance;
    this.saveVersion = bal.saveVersion;
    this.gameVersion = bal.gameVersion;
    this.difficulty = DataManager.getDifficulty(this.difficultyId) || bal.difficulties[0];

    // 設定・エフェクト品質
    this.settings = SaveManager.loadSettings();
    this.effSettings = resolveEffectSettings(bal, this.settings);

    this.worldW = WORLD_W;
    this.worldH = WORLD_H;
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, TEX.GROUND).setOrigin(0, 0).setDepth(-10);

    // 恒久成長（残り火強化・スキル熟練度・転生/魂炎）を profile から取得して適用する。
    this.profile = SaveManager.loadProfile();
    this.upgradeStats = ProgressionManager.getUpgradeStats(this.profile);
    this.masteryBonus = ProgressionManager.masteryBonuses(this.profile);
    this.reincStats = ReincarnationManager.getReincarnationStats(this.profile);
    this.cycleNumber = this.profile.reincarnationCount || 0;
    this.chainBonus = this.reincStats.chainCount || 0;         // 進化スキルの連鎖拡張
    this._evolvedBonuses = this.computeEvolvedBonuses();       // 熟練度Lv20 の進化後追加効果
    this.autoDashEnabled = !!this.reincStats.autoDash;
    this.speedMax = this.reincStats.speedMax || 1;
    const up = this.upgradeStats;
    const reinc = this.reincStats;

    // 魂炎「敵密度/エフェクト限界突破」を上限へ反映（低設定では抑制）。
    const quality = this.settings.effectQuality;
    const enemyCapAdd = quality === 'low' ? 0 : (reinc.enemyCapAdd || 0);
    const effectCapAdd = (quality === 'high' || quality === 'ultra') ? (reinc.effectCapAdd || 0) : 0;
    this.enemyCapAdd = enemyCapAdd;
    this.effSettings.maxEnemies += enemyCapAdd;
    this.effSettings.maxProjectiles += effectCapAdd;
    this.particleBudget = (DataManager.combatCaps.particleBudget?.[quality] || 200) + effectCapAdd;

    // プレイヤー（恒久強化を反映）
    const pcfg = { ...bal.player, baseXpToLevel: bal.leveling.baseXpToLevel };
    pcfg.maxHp = bal.player.maxHp + up.maxHpAdd;
    this.player = new Player(this, WORLD_W / 2, WORLD_H / 2, pcfg);
    this.player.dashRechargeMs = bal.player.dashRechargeMs * up.dashRechargeMult;
    this.player.invulnMs = bal.player.invulnMs * up.invulnMult;
    this.player.setDepth(50);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    // 空間グリッド（M5-A）: 敵と経験値ジェムの近傍検索を高速化する。
    // ボスは単一の大型オブジェクトのため、グリッドには入れず各検索で個別に扱う（挙動同一・O(1)）。
    const gridCfg = bal.spatialGrid || {};
    this._cellSize = gridCfg.cellSize || DEFAULT_CELL_SIZE;
    this._gridMax = gridCfg.maxRegistered || 4000;
    this._useSpatial = gridCfg.enabledByDefault !== false; // 既定 ON（?debug=1 で切替可）
    this.enemyGrid = new SpatialGrid(this._cellSize, WORLD_W, WORLD_H);
    this.gemGrid = new SpatialGrid(this._cellSize, WORLD_W, WORLD_H);
    this._enemySeq = 0;   // 出現順の連番（総当たり=Set順との一致を保つための安定キー）
    this._gemSeq = 0;
    this._resetMetrics();
    this._perf = { frames: 0, dtSum: 0, dtMax: 0, fpsMin: Infinity };

    // プール（onSpawn/onRelease でグリッド登録・解除を共通化する）
    this.enemyPool = new Pool(this, () => new Enemy(this), (e, def, x, y, m) => e.reset(def, x, y, m), this.effSettings.maxEnemies, {
      onSpawn: (e) => { e._seq = this._enemySeq++; if (this._useSpatial) this.enemyGrid.insert(e); },
      onRelease: (e) => { this.enemyGrid.remove(e); if (this.statusFx) this.statusFx.onRelease(e); else this.unregisterBurning(e); }, // M6-E/M7-A: 状態異常索引の残留防止（プール返却）

    });
    this.projPool = new Pool(this, () => new Projectile(this), (p, x, y, a, s, o) => p.reset(x, y, a, s, o), this.effSettings.maxProjectiles);
    this.bossBulletPool = new Pool(this, () => new Projectile(this), (p, x, y, a, s, o) => p.reset(x, y, a, s, o), 300);
    this.gemPool = new Pool(this, () => new ExperienceGem(this), (g, x, y, v) => g.reset(x, y, v), 500, {
      onSpawn: (g) => { g._seq = this._gemSeq++; if (this._useSpatial) this.gemGrid.insert(g); },
      onRelease: (g) => this.gemGrid.remove(g),
    });

    // ジョブ・所持枠（M6-A / M7-A: 複数ジョブ）。途中再開時は active_run.jobId を優先し、
    // profile.selectedJobId の途中変更を進行中周回へ持ち込まない（周回ジョブは固定）。
    const runJobId = this.resumeData?.jobId;
    this.job = DataManager.getJob(runJobId) || DataManager.getJob(this.profile.selectedJobId) || DataManager.getJob('flame_witch') || DataManager.jobs[0] || { id: 'flame_witch', initialActiveSkills: ['fireball'], initialPassiveSkills: [], activeSkillPool: DataManager.skills.map((s) => s.id), passiveSkillPool: [], baseActiveSlots: 4, basePassiveSlots: 4 };
    const slotCfg = DataManager.skillConfig.slots || {};
    this.activeSlotsMax = (this.job.baseActiveSlots ?? slotCfg.baseActiveSlots ?? 4) + (this.reincStats.activeSlotBonus || 0);
    this.passiveSlotsMax = (this.job.basePassiveSlots ?? slotCfg.basePassiveSlots ?? 4);

    // ジョブ育成（M6-C）: 周回開始時のジョブレベルを解決し、補正を「凍結」する（周回中は不変）。
    // 効果は「そのジョブを使用中の周回のみ」有効。途中再開時は restoreFromRun で保存済み凍結値を使う。
    this.jobId = this.job.id || 'flame_witch';
    // ジョブの主属性（火の魔女=fire / 氷術師=ice）。全 active ダメージの既定属性としてタグ解決に使う。
    this.jobElement = this.job.element || (this.jobId === 'flame_witch' ? 'fire' : (this.jobId === 'frost_mage' ? 'ice' : null));
    this._defaultElement = this.jobElement;
    this._echoScale = 1;
    this._inEcho = false;
    // M6-D: 発動文脈（残響/分身の再帰防止）・複製元・毎フレーム予算。
    this._castCtx = null;
    this._lastClonableCast = null;
    this._frameBudgets = {};
    // M6-E: 敵死亡イベント履歴（火葬の墓標・冥炎大霊廟）と炎上中敵の索引（灼熱共鳴・万象炎鳴）。
    // 履歴は「墓標系スキルを所持している間のみ」記録する軽量リングバッファ（未取得時は追記しない）。
    this._deathEvents = [];      // { id, x, y, enemyType, isElite, isBoss, killedBySkillId, timestamp, frameId, consumed }
    this._deathEventSeq = 0;
    this._deathEmitsThisFrame = 0;
    this._frameId = 0;
    this._deathTrackers = 0;     // 死亡履歴を必要とするスキルの参照カウント（>0 のときだけ記録）
    // M7-A: 汎用状態異常基盤（burning/chill/frozen/freeze_immunity/frostbreak_vulnerability）。
    // 炎上の索引は StatusEffectManager と同じ Set を共有し（後段で alias）、M6-E 挙動を維持する。
    this.statusReg = new StatusEffectRegistry(DataManager.statusEffectsData);
    this.freezeSys = new FreezeSystem(this.statusReg);
    this.jobMods = new JobModifierManager();
    this._resolveJobModsFromProfile();

    // マネージャ
    this.effects = new EffectManager(this);
    this.effects.setSettings(this.effSettings);
    this.skills = new SkillManager(this);
    this.skills.setMasteryBonuses(this.masteryBonus);
    // パッシブ（共通 modifier 集計）とスキル抽選（決定論ドラフト）。
    this.passives = new PassiveManager(this);
    this.passives.setDefs(DataManager.passives, DataManager.skillConfig);
    const dcfg = DataManager.skillConfig.draft || {};
    this._baseRerolls = dcfg.baseRerolls ?? 1;
    // ジョブ Lv70「高位魔法適性」: rare/legendary の実効抽選重み倍率（周回開始時に凍結）。common/uncommon は不変。
    this.draft = new SkillDraftManager({
      rarityWeights: DataManager.rarityWeights, baseRerolls: dcfg.baseRerolls, baseBanishes: dcfg.baseBanishes, baseSkips: dcfg.baseSkips,
      rarityWeightMult: { rare: this.jobMods.rarityWeightMult('rare'), legendary: this.jobMods.rarityWeightMult('legendary') },
      synergy: DataManager.skillConfig.synergy || null, // M6-F: 進化相手の軽い抽選補助（data で無効化可能）
    });
    // 進化レシピ（進化相手の抽選補助・成立性判定に使用）。周回開始時に一度だけ構築する。
    this._catalog = buildCatalog({ skills: DataManager.skills, passives: DataManager.passives, evolutions: DataManager.evolutions, jobs: DataManager.jobs, jobId: this.jobId, registeredIds: registeredSkillIds(), runtimeStateIds: skillsWithRuntimeState() });
    this._evoRecipes = evolutionRecipes(this._catalog);
    this.spawn = new SpawnManager(this);
    this.battle = new BattleManager(this);
    this.pauseMenu = new PauseMenu(this);
    this.buildCombatApi();

    // M6-F: ローカル戦闘テレメトリ（外部送信なし）。デバッグ補正（F4〜F8）を使った周回は debugRun とし通常統計へ混ぜない。
    this._debugRun = false;
    this._acquireOrder = 0;
    this._skillAcquiredAt = {}; // skillId -> 取得時 timeSec（activeSeconds ≒ DPS 分母の算出用）
    this.telemetry = new CombatTelemetry({
      seed: this.rngSeed || 0, difficulty: this.difficultyId, quality: this.settings.effectQuality,
      speed: this.settings.speed || 1, jobId: this.jobId, jobLevelAtStart: this.jobMods.jobLevel, debugRun: false,
    });

    // 進行状態
    this.timeSec = 0;
    this.kills = 0;
    this.eliteKills = 0; // M6-C: エリート撃破数（ジョブXP計算に使用）
    this.bossKills = 0;
    this.maxHit = 0;
    this.autoMove = !!this.settings.autoMove;
    this.paused = false;
    this.gameOver = false;
    this.boss = null;
    this.bossSpawned = false;
    this._recalc = 0;
    this._nearestEnemy = null;
    this._nearestGem = null;
    this._autoSaveAccum = 0;
    this._hitStopMs = 0;
    // 恒久強化倍率＋転生倍率を初期ボーナスへ反映（damageMult は dealDamage で使用）。
    this.bonus = {
      moveMult: up.moveSpeedMult, pickupMult: up.pickupMult, xpMult: up.xpMult,
      damageMult: up.damageMult * (reinc.startDamageMult || 1),
    };
    // レベルアップ候補数（魂炎「選択肢拡張」で 3→4）。
    this.choicesPerLevel = (DataManager.balance.leveling.choicesPerLevel || 3) + (reinc.levelUpChoices || 0);
    // 倍速（設定値を speedMax でクランプ）。
    this._perFrameReset();

    // 乱数シード（途中再開時は復元）
    this.rngSeed = (this.resumeData?.rngSeed) || ((Date.now() % 2147483647) >>> 0) || 12345;
    this.rng = createRng(this.rngSeed);

    // ドラフト用シード（周回内で決定論。途中再開時は restoreFromRun で上書き）。
    this._draftSeed = ((this.rngSeed >>> 0) ^ 0x5ca1ab1e) >>> 0 || 1;

    // M7-A: 状態異常マネージャ（状態異常専用の決定論 RNG を持つ）。炎上索引は同じ Set を共有する。
    const statusSeed = ((this.rngSeed >>> 0) ^ 0x51ce9e11) >>> 0 || 1;
    this.statusFx = new StatusEffectManager({
      registry: this.statusReg, freezeSystem: this.freezeSys,
      now: () => this.time.now, seed: statusSeed,
      cap: (name, fb) => DataManager.skillCap(name, this.settings?.effectQuality || 'high', fb),
    });
    this._burningIndex = this.statusFx.indexOf('burning'); // M6-E 炎上索引と共有（挙動不変）
    this._pendingBossFrost = null; // 途中再開時のボス氷砕状態（spawnBoss 後に適用）

    // 途中再開 or 新規
    if (this.resumeData) {
      this.restoreFromRun(this.resumeData, bal);
    } else {
      // ジョブ Lv30「選択の余地」: 周回開始時のリロール+1（初期1回に加算＝Lv30以上で基本2回）。追放・スキップは不変。
      this.draft.reset(this._draftSeed, { rerolls: this._baseRerolls + this.jobMods.extraRerolls() });
      // ジョブの初期スキル（active/passive）。
      for (const id of (this.job.initialActiveSkills && this.job.initialActiveSkills.length ? this.job.initialActiveSkills : ['fireball'])) this.skills.acquireOrLevel(id);
      for (const id of (this.job.initialPassiveSkills || [])) this.passives.acquireOrLevel(id);
      // 初期スキルレベル強化（恒久＋魂炎）を初期 active（火球）へ。
      const startAdd = (up.startSkillLevel || 0) + (reinc.startSkillLevel || 0);
      if (startAdd > 0 && this.skills.has('fireball')) this.skills.setLevel('fireball', this.skills.getLevel('fireball') + startAdd);
    }
    this._refreshStatusPassives(); // 氷系パッシブの乗率（再開時は復元済みパッシブから・新規は初期値）
    this.player.moveSpeed = bal.player.moveSpeed * this.bonus.moveMult;

    // 倍速モードの初期適用（設定値を speedMax でクランプ）。
    this.applySpeed(Math.min(this.settings.speed || 1, this.speedMax));

    // 入力
    this.keys = this.input.keyboard.addKeys({
      up: 'W', down: 'S', right: 'D',
      upA: 'UP', downA: 'DOWN', leftA: 'LEFT', rightA: 'RIGHT',
      moveLeft: 'A', dash: 'SPACE',
    });
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard.on('keydown-Q', () => this.toggleAuto());
    if (window.RFS_DEBUG) {
      this.input.keyboard.on('keydown-F1', () => this.toggleDebug());
      this.input.keyboard.on('keydown-F2', () => this.togglePerfOverlay()); // 性能パネル（M5-A）
      this.input.keyboard.on('keydown-F3', () => this.toggleGridViz());      // グリッド可視化（M5-A）
      this.input.keyboard.on('keydown-F4', () => this.toggleSkillDebug());   // 新スキル確認（M6-B）
      this.input.keyboard.on('keydown-F5', () => this.toggleSkillTuner());    // 個別スキル検証（M6-C）
      this.input.keyboard.on('keydown-F6', () => this.toggleWave2Debug());    // 新スキル検証（M6-D）
      this.input.keyboard.on('keydown-F7', () => this.toggleWave3Debug());    // 新スキル検証（M6-E）
      this.input.keyboard.on('keydown-F8', () => this.toggleBalancePlaytest()); // 通常プレイ検証（M6-F）
      this.input.keyboard.on('keydown-F9', () => this.toggleFrostDebug());       // 状態異常・氷術師検証（M7-A）
      // ヘッドレス/実ブラウザからの検査・比較用に戦闘シーンを公開する。
      window.RFS_BATTLE = this;
      this.togglePerfOverlay(); // debug 時は性能パネルを既定表示
    }

    // HUD
    this.hud = new HUD(this);
    this.hud.onPause(() => this.togglePause());
    this.hud.onToggleAuto(() => this.toggleAuto());
    this.hud.setJob(this.job.displayName || this.jobId, this.jobLevelAtStart); // M6-C: ジョブ名＋適用中ジョブLv
    this.updateHudSkills();

    // 中断対応
    this._onVisibility = () => { if (document.hidden) this.forcePause(); };
    document.addEventListener('visibilitychange', this._onVisibility);
    this._onBlur = () => this.forcePause();
    this.game.events.on('blur', this._onBlur);
    this.events.once('shutdown', () => this.cleanup());

    // ボス即時復元
    if (this.resumeData && this.resumeData.bossActive) {
      this.spawnBoss();
      if (this.boss && this.resumeData.bossHp > 0) this.boss.hp = Math.min(this.boss.maxHp, this.resumeData.bossHp);
      this.bossSpawned = true;
    }

    this.showBanner(this.resumeData ? '途中から再開' : `${this.difficulty.name} 開始 — 5分生存を目指せ`);
    this.autoSave();

    // 途中再開時、レベルアップ選択中に閉じていた場合は同じ候補を再表示する（決定論・巻き戻しなし）。
    if (this.resumeData && this.draft.hasPendingDraft()) {
      this.forcePause(false);
      this._launchDraft();
    }
  }

  restoreFromRun(r, bal) {
    this.timeSec = r.elapsedSec || 0;
    this.kills = r.kills || 0;
    this.eliteKills = r.eliteKills || 0;
    // 現在の恒久強化ボーナスを土台に、保存済みボーナスを上書きする。
    this.bonus = { ...this.bonus, ...(r.bonus || {}) };
    if (r.maxHp) this.player.maxHp = r.maxHp;
    this.player.hp = (typeof r.playerHp === 'number') ? r.playerHp : this.player.maxHp;
    this.player.level = r.playerLevel || 1;
    this.player.xp = r.xp || 0;
    if (r.xpToNext) this.player.xpToNext = r.xpToNext;
    this.skills.loadFrom(r.skills);
    this.skills.restoreEvolved(r.evolvedBase); // 進化済み基礎スキルを復元
    if (this.skills.count() === 0) this.skills.acquireOrLevel('fireball');
    // M6-A: パッシブ・ドラフト状態の復元。
    if (r.passiveSkills) this.passives.loadFrom(r.passiveSkills);
    // 旧途中セーブ（v5 以前）で active が新枠を超過している場合は、その周回に限り所持を維持し
    // 新規 active の取得だけ禁止する（activeSlotsMax を所持数まで引き上げる＝新規枠なし）。
    const ownedActive = this.skills.activeSlotCount();
    if (ownedActive > this.activeSlotsMax) this.activeSlotsMax = ownedActive;
    // ドラフト状態: v6 の active_run なら復元、無ければ現在シードで初期化。
    if (r.draftState) this.draft.restore(r.draftState);
    else this.draft.reset(this._draftSeed, {});
    // M6-B: スキル固有 runtimeState（不死鳥CD・障壁再使用 等）を復元（再読込での不正回復を防ぐ）。
    if (r.skillRuntime) this.skills.restoreRuntime(r.skillRuntime);
    // M6-C: ジョブ補正の凍結値・残響カウンターを復元（周回途中に profile 側レベルが変わっても反映しない）。
    this._restoreJobMods(r);
    // M7-A: 状態異常専用 RNG の cursor を復元（再読込で凍結判定を引き直せないようにする）。
    if (r.statusRng) this.statusFx.restore({ rng: r.statusRng });
    // ボス氷砕状態は spawnBoss 後に適用（個々の敵の冷気/凍結は保存せず安全に再構築）。
    if (r.bossFrost) this._pendingBossFrost = r.bossFrost;
  }

  // 現在の profile からジョブレベル補正を解決して凍結する（新規周回）。
  _resolveJobModsFromProfile() {
    const jp = DataManager.getJobProgression(this.jobId);
    const entry = JobProgressionManager.entry(this.profile, this.jobId);
    this.jobTotalXpAtStart = entry.totalXp;
    this.jobLevelAtStart = JobProgressionManager.levelForTotalXp(this.jobId, entry.totalXp);
    this.resolvedJobModifiers = JobModifierManager.resolve(jp, this.jobLevelAtStart);
    this.jobProgressionVersion = DataManager.jobProgression.version || 1;
    this.jobMods.setResolved(this.resolvedJobModifiers);
    this._applyFreezeThresholdMods();
  }

  // 絶対零度（氷術師 Lv100）の閾値低下・凍結延長を FreezeSystem へ反映する（周回開始時に凍結）。
  _applyFreezeThresholdMods() {
    const az = this.jobMods.absoluteZero();
    this.freezeSys.setThresholdMods(az || { normalThresholdReduction: 0, bossThresholdReduction: 0, frozenDurationMult: 0 });
  }

  // 余寒残留など氷系パッシブの乗率を StatusEffectManager へ反映する（パッシブ取得のたびに呼ぶ）。
  _refreshStatusPassives() {
    if (!this.statusFx || !this.passives) return;
    this.statusFx.setPassiveMods({
      chillDecayMult: this.passives.getChillDecayMultiplier(),
      iceStatusDurationMult: this.passives.getIceStatusDurationMultiplier(),
    });
  }

  // 途中再開: active_run に凍結された補正・残響カウンターを使う（profile 側の変更を持ち込まない）。
  _restoreJobMods(r) {
    if (r.resolvedJobModifiers) {
      this.jobId = r.jobId || this.jobId;
      this.resolvedJobModifiers = r.resolvedJobModifiers;
      this.jobLevelAtStart = (typeof r.jobLevelAtStart === 'number') ? r.jobLevelAtStart : (this.resolvedJobModifiers.jobLevel || 1);
      if (typeof r.jobTotalXpAtStart === 'number') this.jobTotalXpAtStart = r.jobTotalXpAtStart;
      this.jobProgressionVersion = r.jobProgressionVersion || this.jobProgressionVersion;
      this.jobMods.setResolved(this.resolvedJobModifiers);
    }
    if (r.jobRuntime) this.jobMods.restore(r.jobRuntime); // 残響カウンター
    this.draft.setRarityWeightMult({ rare: this.jobMods.rarityWeightMult('rare'), legendary: this.jobMods.rarityWeightMult('legendary') });
    this._applyFreezeThresholdMods();
  }

  // ---------------- 残響詠唱（M6-C）・灰燼分身の複製（M6-D）: castContext 統合 ----------------
  // recordCast（本発動の共通シグナル）から呼ばれる。攻撃用 fire active のみ残響カウントし、
  // 直近の複製可能な発動を記録する。防御/反応/DoT/召喚射撃/連鎖/分裂/複製発は対象外（CastPolicy で判定）。
  _onSkillCast(id) {
    const sk = this.skills.skills.get(id);
    if (!sk) return;
    const ctx = this._castCtx || defaultCastContext(id);
    // 灰燼分身の複製元: 「直近の normal 由来 かつ 複製可能」な発動を記録（echo/clone 発は上書きしない）。
    if (ctx.origin === 'normal' && canCloneCopy(sk.castMeta)) this._lastClonableCast = { skillId: id, at: this.time.now };
    // Job残響カウンター。
    if (!this.jobMods || !this.jobMods.echoEnabled()) return;
    if (!canCastTriggerEcho(sk.castMeta, ctx) || !sk.canTriggerEcho) return;
    if (this.jobMods.registerCast()) this._triggerEcho(sk, ctx);
  }

  copyGenCap() { return DataManager.skillCap('maxEchoCloneGeneration', this.settings?.effectQuality || 'high', 1); }

  _triggerEcho(sk, parentCtx) {
    if (this._echoBudget <= 0) { this._m.suppressed++; return; } // 1フレーム上限（無限発動防止）
    if (sk.castMeta.echoPolicy === 'forbidden') return;
    const child = replayContext(parentCtx, 'echo', this.jobMods.echoPower(), this.copyGenCap());
    if (!child) return;
    this._echoBudget--;
    this._runReplay(child, () => this.skills.requestEchoCast(sk.id));
    this.skills.recordExtra(sk.id, 'echoCasts', 1, 'add');
  }

  // 灰燼分身が「直近の複製可能な攻撃」を低威力で再実行する（分身/軍勢から呼ぶ）。
  performClone(powerMult) {
    const last = this._lastClonableCast;
    if (!last) return false;
    const sk = this.skills.skills.get(last.skillId);
    if (!sk || !canCloneCopy(sk.castMeta) || sk.castMeta.clonePolicy === 'forbidden') return false;
    if (!this._spendFrameBudget('cloneCast', 'maxCloneCastsPerFrame')) return false;
    const child = replayContext(defaultCastContext(last.skillId), 'clone', powerMult || 0.4, this.copyGenCap());
    if (!child) return false;
    this._runReplay(child, () => this.skills.requestCloneCast(sk.id));
    this.skills.recordExtra(last.skillId, 'cloneDamageCasts', 1, 'add');
    return true;
  }

  // echo/clone 再実行を castContext・威力倍率つきで安全に呼ぶ（発動中は自己複製を抑制）。
  _runReplay(ctx, fn) {
    const prevCtx = this._castCtx, prevScale = this._echoScale, prevInEcho = this._inEcho;
    this._castCtx = ctx; this._echoScale = ctx.powerMultiplier || 1; this._inEcho = true;
    try { fn(); } finally { this._castCtx = prevCtx; this._echoScale = prevScale; this._inEcho = prevInEcho; }
  }

  // 直近の複製可能な発動（灰燼分身の複製対象表示・F6デバッグ用）。
  lastClonableCast() { return this._lastClonableCast || null; }

  // ダッシュフック（M6-D 爆炎歩法）。Player から phase 通知を受け、所持スキルへ分配する。
  onPlayerDash(phase, player) { if (this.skills) this.skills.dispatchDash(phase, player); }

  // 品質別の毎フレーム予算（ビームtick/地雷爆発/反射判定/鎖再接続/複製/軍勢 等）。
  _spendFrameBudget(name, capName) {
    const cap = DataManager.skillCap(capName, this.settings?.effectQuality || 'high', 9999);
    const used = (this._frameBudgets && this._frameBudgets[name]) || 0;
    if (used >= cap) { this._m.suppressed++; return false; }
    (this._frameBudgets || (this._frameBudgets = {}))[name] = used + 1;
    return true;
  }

  // 敵弾吸収（M6-D 弾喰い炉/星喰い炉）。範囲内の吸収可能なボス弾を最大数まで吸収し、プール返却する。
  // 予告/ビーム/接触/吸収不能弾/消費済み弾は吸収しない。同じ弾を二重吸収しない（consumedByAbility＋release）。
  absorbBossBullets(x, y, r, maxCount) {
    let absorbed = 0, value = 0; const r2 = r * r;
    this.bossBulletPool.forEachActive((b) => {
      if (absorbed >= maxCount || !b.alive || b.consumedByAbility) return;
      if (!b.absorbable || b.isTelegraph || b.isBeam) return;
      const dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy > r2) return;
      b.consumedByAbility = true;
      value += b.absorbValue || 1; absorbed++;
      this.bossBulletPool.release(b);
    });
    return { absorbed, value };
  }

  // ---------------- 敵死亡イベント履歴（M6-E 火葬の墓標・冥炎大霊廟） ----------------
  // 墓標系スキルが retainDeathEvents() で参照を取っている間だけ履歴を記録する（未取得時は無処理）。
  retainDeathEvents() { this._deathTrackers++; }
  releaseDeathEvents() { this._deathTrackers = Math.max(0, this._deathTrackers - 1); if (this._deathTrackers === 0) this._deathEvents.length = 0; }

  // 敵/ボス撃破時に共通で呼ぶ（onEnemyKilled/onBossKilled）。上限件数・毎フレーム件数を厳守。
  _recordDeathEvent(e, skillId) {
    if (this._deathTrackers <= 0) return;
    const cap = DataManager.skillCap('maxDeathEventsTracked', this.settings?.effectQuality || 'high', 40);
    const perFrame = DataManager.skillCap('maxDeathEventsPerFrame', this.settings?.effectQuality || 'high', 8);
    if (this._deathEmitsThisFrame >= perFrame) { this._m.suppressed++; return; }
    this._deathEmitsThisFrame++;
    this._deathEvents.push({
      id: ++this._deathEventSeq, x: e.x, y: e.y,
      enemyType: (e.def && e.def.id) || (e.isBoss ? 'boss' : 'enemy'),
      isElite: !!e.isElite, isBoss: !!e.isBoss,
      killedBySkillId: skillId || null, timestamp: this.time.now, frameId: this._frameId, consumed: false,
    });
    while (this._deathEvents.length > cap) this._deathEvents.shift(); // 古い順に破棄（無制限保持しない）
  }

  // 未消費かつ maxAgeMs 以内の死亡イベントを新しい順で返す（画面内座標のみ）。読み取り専用。
  recentDeathEvents(maxAgeMs = 4000, limit = 8) {
    const now = this.time.now;
    const out = [];
    for (let i = this._deathEvents.length - 1; i >= 0 && out.length < limit; i--) {
      const d = this._deathEvents[i];
      if (d.consumed) continue;
      if (now - d.timestamp > maxAgeMs) continue;
      if (!this._inWorld(d.x, d.y)) continue;
      out.push(d);
    }
    return out;
  }

  // 死亡イベントを1回だけ消費する（同一イベントの複数利用を防ぐ）。成功なら true。
  consumeDeathEvent(id) {
    const d = this._deathEvents.find((v) => v.id === id);
    if (!d || d.consumed) return false;
    d.consumed = true;
    return true;
  }

  _inWorld(x, y) { return x >= 0 && y >= 0 && x <= this.worldW && y <= this.worldH; }

  // ---------------- 炎上中敵の索引（M6-E 灼熱共鳴・万象炎鳴） ----------------
  // Enemy.ignite / 敵死亡 / プール返却 で登録・解除する軽量インデックス（毎フレーム全走査を避ける）。
  registerBurning(e) { if (e && e.alive) this._burningIndex.add(e); }
  unregisterBurning(e) { if (e) this._burningIndex.delete(e); }

  // 炎上中の敵数（消火済み・死亡済みは索引から取り除きつつ数える）。ボスも炎上中なら 1 として数える。
  burningCount() {
    let n = 0;
    for (const e of this._burningIndex) {
      if (e.alive && e.ignited) n++; else this._burningIndex.delete(e);
    }
    if (this.boss && this.boss.alive && this.boss.ignited) n++;
    return n;
  }

  // 炎上中の敵一覧（上限つき・共鳴の連鎖起点用）。索引の掃除も兼ねる。
  burningEnemies(limit = 60) {
    const out = [];
    for (const e of this._burningIndex) {
      if (e.alive && e.ignited) { if (out.length < limit) out.push(e); }
      else this._burningIndex.delete(e);
    }
    if (this.boss && this.boss.alive && this.boss.ignited && out.length < limit) out.push(this.boss);
    return out;
  }

  // 敵へ炎上を付与し索引へ登録する共通経路（灼熱共鳴等が炎上を撒く/延長する手段）。gen は感染世代。
  // 「延長」の意味を守り、既存の炎上が長ければ短縮しない（永劫火界の直接 ignite 呼び出しには影響しない）。
  igniteEnemy(e, ms, gen) {
    if (!e || !e.alive || !e.ignite) return;
    const target = this.time.now + (ms || 0);
    if (!(e._igniteUntil && e._igniteUntil > target)) e.ignite(ms, gen);
    this.registerBurning(e);
  }

  cleanup() {
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.game.events.off('blur', this._onBlur);
    if (this.skills) this.skills.destroy();
    // M6-E/M7-A: 死亡履歴・状態異常索引を破棄（Scene終了で古い参照を残さない）。
    this._deathEvents.length = 0; this._deathTrackers = 0;
    if (this.statusFx) this.statusFx.clearAll();
    // 空間グリッドを破棄（古い参照を残さない）。
    if (this.enemyGrid) this.enemyGrid.clear();
    if (this.gemGrid) this.gemGrid.clear();
    if (this._perfText) { this._perfText.destroy(); this._perfText = null; }
    if (this._gridGfx) { this._gridGfx.destroy(); this._gridGfx = null; }
    if (this._skdbg) { this._skdbg.destroy(true); this._skdbg = null; }
    if (this._sktuner) { this._sktuner.destroy(true); this._sktuner = null; }
    if (this._w2dbg) { this._w2dbg.destroy(true); this._w2dbg = null; }
    if (this._w3dbg) { this._w3dbg.destroy(true); this._w3dbg = null; }
    if (this._bpdbg) { this._bpdbg.destroy(true); this._bpdbg = null; }
    if (this._bpBanner) { this._bpBanner.destroy(); this._bpBanner = null; }
    if (this._frostdbg) { this._frostdbg.destroy(true); this._frostdbg = null; }
    if (window.RFS_BATTLE === this) window.RFS_BATTLE = null;
  }

  // ---------------- combat API（判定のみ） ----------------
  buildCombatApi() {
    this.combat = {
      nearestEnemy: (x, y, range) => this.nearestTarget(x, y, range),
      nearestEnemyExcept: (x, y, range, exclude) => this.nearestTargetExcept(x, y, range, exclude),
      randomEnemies: (n) => this.randomTargets(n),
      enemiesInRadius: (x, y, r) => this.targetsInRadius(x, y, r),
      forEachEnemyInRadius: (x, y, r, fn) => { for (const t of this.targetsInRadius(x, y, r)) fn(t); },
      densestPoint: (radius, idx) => this.densestPoint(radius, idx),
      dealDamage: (t, amt, id, opts) => this.dealDamage(t, amt, id, opts),
      damageArea: (x, y, r, amt, id, opts) => this.damageArea(x, y, r, amt, id, opts),
      spawnPlayerProjectile: (x, y, a, sp, o) => this.projPool.spawn(x, y, a, sp, o),
      // M6-B: スキル上限（品質別）・起爆刻印の付与。
      skillCap: (name, fallback) => DataManager.skillCap(name, this.settings?.effectQuality || 'high', fallback),
      markEnemy: (e, mark) => { e._mark = mark; },
      markedCount: () => this.markedEnemyCount(),
      // M6-D: 毎フレーム予算・敵弾吸収・分身複製・HP消費コスト。
      frameBudget: (name, capName) => this._spendFrameBudget(name, capName),
      absorbBossBullets: (x, y, r, max) => this.absorbBossBullets(x, y, r, max),
      performClone: (power) => this.performClone(power),
      lastClonableCast: () => this.lastClonableCast(),
      spendHealthCost: (amount) => this.player.spendHealthCost(amount),
      castContext: () => this._castCtx,
      // M6-E: 敵死亡イベント履歴・炎上索引・炎上付与。
      retainDeathEvents: () => this.retainDeathEvents(),
      releaseDeathEvents: () => this.releaseDeathEvents(),
      recentDeathEvents: (ageMs, limit) => this.recentDeathEvents(ageMs, limit),
      consumeDeathEvent: (id) => this.consumeDeathEvent(id),
      burningCount: () => this.burningCount(),
      burningEnemies: (limit) => this.burningEnemies(limit),
      ignite: (e, ms, gen) => this.igniteEnemy(e, ms, gen),
      registerBurning: (e) => this.registerBurning(e),
      worldBounds: () => ({ w: this.worldW, h: this.worldH }),
      // M7-A: 汎用状態異常 / 冷気・凍結・粉砕（スキルは個別タイマーを持たず共通経路を使う）。
      statusFx: () => this.statusFx,
      applyChill: (e, amount) => this.statusFx.addChill(e, amount * this.jobMods.statusPowerMult()),
      isFrozen: (e) => this.statusFx.isFrozen(e),
      isChilled: (e) => this.statusFx.isChilled(e),
      chillOf: (e) => this.statusFx.chillOf(e),
      chillRatio: (e) => this.statusFx.chillRatio(e),
      shatterEnemy: (e, ctx) => this.shatterEnemy(e, ctx),
      // 氷牢封印などの制御スキル用: 凍結耐性/凍結中/ボスでなければ強制凍結する（共通経路・独自タイマーを作らない）。
      freezeEnemy: (e) => this.freezeEnemy(e),
      addBossGauge: (amount) => { const ev = this.boss && this.boss.alive ? this.statusFx.addBossGauge(this.boss, amount * this.jobMods.statusPowerMult()) : null; if (ev) this._onBossFrostbreak(ev, null); return ev; },
      // 指定エンティティ（氷牢の対象がボスの場合）へ氷砕ゲージを付与する。
      addBossGaugeTo: (e, amount) => { if (!e || !e.alive || !e.isBoss) return null; const ev = this.statusFx.addBossGauge(e, amount * this.jobMods.statusPowerMult()); if (ev) this._onBossFrostbreak(ev, null); return ev; },
      entitiesWithStatus: (id, limit) => this.statusFx.entitiesWithStatus(id, limit),
      countStatus: (id) => this.statusFx.countStatus(id),
      jobElement: () => this._defaultElement,
      // 同一発動を識別する ID（凍結判定回数の上限に使う。多段攻撃で同じ敵を毎tick凍結しない）。
      nextHitGroupId: () => this.nextHitGroupId(),
    };
  }

  nextHitGroupId() { this._hitGroupSeq = (this._hitGroupSeq || 0) + 1; return this._hitGroupSeq; }

  // 天穿氷河槍: 粉砕地点から小型氷片を飛散させる（氷片は粉砕を再発生させない＝shatterOnFrozen:false・fragmentCount:0）。
  _spawnIceFragments(x, y, proj) {
    const cap = this.combat.skillCap('maxHeavenGlacierFragments', 8);
    const n = Math.min(proj.fragmentCount || 0, cap);
    const hg = this.nextHitGroupId();
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + 0.3;
      this.projPool.spawn(x, y, a, 220, {
        skillId: proj.skillId, element: 'ice', damage: (proj.damage || 0) * (proj.fragmentDamageFactor || 0.35),
        pierce: 0, chillAmount: (proj.chillAmount || 0) * 0.4, procCoefficient: 0.3, hitGroupId: hg,
        scale: 0.7, lifeMs: 700, tint: 0xe1f5fe,
      });
    }
  }

  // 凍結中の敵を粉砕する共通経路（スキル/Job Lv報酬から呼ぶ）。ボスは対象外・粉砕から粉砕を再帰しない。
  // ctx: { skillPower, powerMult, multiplier, quiet, color }。
  shatterEnemy(target, ctx = {}) {
    if (this._shatterBudget <= 0) { this._m.suppressed++; return false; }
    const res = this.statusFx.shatter(target, { skillPower: ctx.skillPower || 0, powerMult: ctx.powerMult || 1, multiplier: ctx.multiplier || 1 });
    if (!res) return false;
    this._shatterBudget--;
    const x = target.x, y = target.y;
    this.effects.explosion(x, y, res.radius, ctx.color || 0x9fe8ff);
    // isShatter:true で粉砕から粉砕を再帰させない。氷属性ダメージとして計上。
    this.damageArea(x, y, res.radius, res.damage, ctx.skillId || 'frost_shatter', { quiet: true, isShatter: true, element: 'ice', exclude: null });
    if (this.telemetry) { this.telemetry.noteStatusEvent('shatters', 1); this.telemetry.noteStatusEvent('shatterDamage', res.damage); if (ctx.skillId) { this.skills.recordExtra(ctx.skillId, 'shatters', 1, 'add'); this.skills.recordExtra(ctx.skillId, 'shatterDamage', res.damage, 'add'); } }
    return true;
  }

  // 除外集合を考慮した最寄り対象（連鎖炎などで使用・空間グリッド利用）。
  nearestTargetExcept(x, y, range, exclude) {
    let best = null, bestD = Infinity;
    const brute = this.enemyPool.activeCount;
    const scan = (e) => {
      if (!e.alive || (exclude && exclude.has(e))) return;
      const d = distance(x, y, e.x, e.y);
      if (d < bestD && d <= range) { bestD = d; best = e; }
    };
    if (this._useSpatial) {
      const cand = this.enemyGrid.queryCircle(x, y, range);
      cand.sort(SEQ_CMP);
      for (const e of cand) scan(e);
      this._recordQuery(brute, cand.length, best ? 1 : 0);
    } else {
      this.enemyPool.forEachActive(scan);
      this._recordQuery(brute, brute, best ? 1 : 0);
    }
    if (this.boss && this.boss.alive && !(exclude && exclude.has(this.boss))) {
      const d = distance(x, y, this.boss.x, this.boss.y);
      if (d < bestD && d <= range) best = this.boss;
    }
    return best;
  }

  markedEnemyCount() {
    let n = 0;
    const now = this.time.now;
    this.enemyPool.forEachActive((e) => { if (e._mark && now < e._mark.until) n++; });
    return n;
  }

  // 指定スキル由来の生存弾数（M6-B: 同時存在数の上限判定に使用）。
  countProjBySkill(id) {
    let n = 0;
    this.projPool.forEachActive((p) => { if (p.alive && p.skillId === id) n++; });
    return n;
  }

  // ---- 起爆刻印（M6-B） ----
  detonateMark(e) {
    const m = e._mark; if (!m) return;
    e._mark = null;
    this._doMarkExplosion(e.x, e.y, m.detonateRadius, m.detonateDamage, m.skillId, 0xff5722);
    if (m.chain) this.chainDetonate(e.x, e.y, m, { visited: new Set([e]), spread: 0, depth: 0, finalDone: false });
  }

  markDeathDetonate(e) {
    const m = e._mark; if (!m || !m.deathDamage) return;
    e._mark = null;
    this._doMarkExplosion(e.x, e.y, (m.detonateRadius || 40) * 0.7, m.deathDamage, m.skillId, 0xff7043);
    if (m.chain) this.chainDetonate(e.x, e.y, m, { visited: new Set([e]), spread: 0, depth: 0, finalDone: false });
  }

  _doMarkExplosion(x, y, radius, dmg, skillId, color) {
    if (this._explosionBudget <= 0) { this._m.suppressed++; return; }
    this._explosionBudget--;
    this.effects.explosion(x, y, radius || 40, color);
    // isMarkDetonation:true で刻印カウントを進めない（無限再起爆の防止）。
    this.aoe(x, y, radius || 40, dmg || 0, skillId, { quiet: true, isMarkDetonation: true });
  }

  // 連鎖起爆（終焉連鎖）。visited集合・最大連鎖深度・最大拡散でループを明示的に制限する。
  chainDetonate(x, y, m, ctx) {
    if (ctx.depth >= (m.maxDepth || 8)) return;
    ctx.depth++;
    for (const o of this.targetsInRadius(x, y, m.chainRadius || 90)) {
      if (o.isBoss || ctx.visited.has(o)) continue;
      if (o._mark && this.time.now < o._mark.until) {
        ctx.visited.add(o);
        const om = o._mark; o._mark = null;
        this._doMarkExplosion(o.x, o.y, om.detonateRadius || m.detonateRadius, om.detonateDamage || m.detonateDamage, m.skillId, 0xff8a65);
        if (ctx.spread < (m.maxSpread || 6)) this._spreadMark(o.x, o.y, m, ctx);
        this.chainDetonate(o.x, o.y, m, ctx);
      }
    }
    // 最終爆発は1連鎖につき1回だけ。
    if (!ctx.finalDone && m.finalBlast && ctx.visited.size >= 5) {
      ctx.finalDone = true;
      const spot = this.densestPoint(m.finalRadius || 120, 0) || { x, y };
      this.effects.meteorImpact(spot.x, spot.y, m.finalRadius || 120);
      this.aoe(spot.x, spot.y, m.finalRadius || 120, m.finalBlast, m.skillId, { crit: true, isMarkDetonation: true });
    }
  }

  _spreadMark(x, y, m, ctx) {
    for (const o of this.targetsInRadius(x, y, m.chainRadius || 90)) {
      if (ctx.spread >= (m.maxSpread || 6)) break;
      if (o.isBoss || o._mark || ctx.visited.has(o)) continue;
      o._mark = { skillId: m.skillId, hits: 0, hitsNeeded: m.hitsNeeded || 2, until: this.time.now + (m.markDuration || 6000), detonateDamage: m.detonateDamage, detonateRadius: m.detonateRadius, deathDamage: m.deathDamage, chain: m.chain, chainRadius: m.chainRadius, maxDepth: m.maxDepth, maxSpread: m.maxSpread, finalBlast: m.finalBlast, finalRadius: m.finalRadius, markDuration: m.markDuration };
      ctx.spread++;
    }
  }

  // ---- 防御スキルの scene フック（Player.takeDamage から呼ばれる） ----
  onBarrierBlock(b) {
    this.effects.explosion(this.player.x, this.player.y, b.retaliateRadius || 40, 0xff9800);
    this.aoe(this.player.x, this.player.y, b.retaliateRadius || 40, b.retaliateDamage || 0, 'flame_barrier', { quiet: true });
    b.retaliations = (b.retaliations || 0) + 1;
    b.retaliateTotal = (b.retaliateTotal || 0) + (b.retaliateDamage || 0);
  }

  onPhoenixRevive(ph) {
    const q = this.settings?.effectQuality || 'high';
    if (DataManager.skillCap('maxPhoenixEffects', q, 2) > 0) {
      this.effects.explosion(this.player.x, this.player.y, ph.explosionRadius || 100, 0xffd54f);
      this.effects.whiteFlash();
      this.effects.screenShake(300, 0.012);
    }
    this.aoe(this.player.x, this.player.y, ph.explosionRadius || 100, ph.explosionDamage || 0, 'phoenix_feather', { crit: true, isExplosion: true });
    this.showBanner('不死鳥の羽が発動！');
  }

  // 跳炎弾（M6-D）: 対象ごとの短時間再命中待機。true=命中を受け付けた。
  _ricochetTryHit(proj, e) {
    if (!this.combat.frameBudget('ricochetCheck', 'maxRicochetChecksPerFrame')) return false;
    const now = this.time.now;
    const m = proj._recentHits || (proj._recentHits = new Map());
    const until = m.get(e);
    if (until && now < until) return false;
    m.set(e, now + (proj._retriggerMs || 300));
    return true;
  }

  // 跳炎弾（M6-D）: 命中後に別の敵を優先して進行方向を補正。反射回数を使い切ったら消滅。
  _ricochetBounce(proj, e) {
    if (proj.bounceCount <= 0) { proj.alive = false; return; }
    proj.bounceCount -= 1;
    proj.damage *= (proj.bounceDamageFactor || 1);
    const t = this.nearestTargetExcept(e.x, e.y, 320, new Set([e]));
    let ang;
    if (t && t.alive) ang = Math.atan2(t.y - e.y, t.x - e.x);
    else { const v = proj.body.velocity; ang = Math.atan2(-v.y, -v.x); } // 敵がいなければ反転
    const sp = proj.speed || 300;
    proj.setVelocity(Math.cos(ang) * sp, Math.sin(ang) * sp);
    proj.setRotation(ang);
  }

  // 連鎖炎: 命中後に visited を共有しつつ次の敵へ。generation と品質別上限で無限往復を防止。
  _chainHit(proj, e) {
    const cap = Math.min(proj.chainCount || 0, this.combat.skillCap('maxChainDepth', 8));
    if (proj.generation >= cap) return;
    const visited = proj.chainVisited || (proj.chainVisited = new Set());
    visited.add(e);
    const t = this.nearestTargetExcept(e.x, e.y, proj.chainRange || 140, visited);
    if (!t || !t.alive) return;
    const ang = Math.atan2(t.y - e.y, t.x - e.x);
    this.projPool.spawn(e.x, e.y, ang, proj.speed || 340, {
      skillId: proj.skillId, damage: proj.damage * (proj.chainFalloff || 0.85), pierce: 0,
      behavior: 'chain', chainCount: proj.chainCount, chainRange: proj.chainRange, chainFalloff: proj.chainFalloff,
      generation: proj.generation + 1, chainVisited: visited, scale: Math.max(0.6, (proj.scaleX || 1) * 0.94),
      lifeMs: 1000, tint: 0xff7043, element: 'fire',
    });
  }

  // 千条炎槍: 貫通を使い切ったら小型炎槍へ分裂（splitGen で世代を明示制限＝無限増殖なし）。
  _splitLance(proj) {
    if (this.projPool.activeCount >= this.projPool.maxSize) return;
    const n = Math.max(1, proj.splitCount || 2);
    for (let i = 0; i < n; i++) {
      const ang = (this.rng() * Math.PI * 2);
      this.projPool.spawn(proj.x, proj.y, ang, (proj.speed || 500) * 0.85, {
        skillId: proj.skillId, damage: proj.damage * (proj.splitFactor || 0.55), pierce: Math.max(1, Math.floor((proj.pierce || 0) / 2)),
        behavior: 'split_lance', splitGen: proj.splitGen - 1, splitCount: proj.splitCount, splitFactor: proj.splitFactor,
        scale: Math.max(0.5, (proj.scaleX || 1) * 0.7), lifeMs: 900, tint: 0xffca28, element: 'fire',
      });
    }
  }

  // 進化後スキルの熟練度Lv20 追加効果を集める。
  computeEvolvedBonuses() {
    const out = {};
    for (const ev of DataManager.evolutions) out[ev.id] = EvolutionManager.evolvedBonus(this.profile, ev.id);
    return out;
  }

  // 各フレーム開始時に安全上限の予算をリセットする。
  _perFrameReset() {
    const caps = DataManager.combatCaps;
    this._aoeBudget = caps.maxAoePerFrame ?? 8;
    this._extraFbBudget = caps.maxExtraFireballs ?? 40;
    this._deathExpBudget = caps.maxDeathExplosionChain ?? 3;
    // M6-B: 同時起爆の毎フレーム予算（品質別）。上限到達でも戦闘ロジックは停止しない。
    this._explosionBudget = DataManager.skillCap('maxSimultaneousExplosions', this.settings?.effectQuality || 'high', 8);
    // M6-C: 残響詠唱の1フレーム内発動上限（無限発動・処理停止の防止）。
    this._echoBudget = caps.maxEchoPerFrame ?? 4;
    // M6-D: 品質別の毎フレーム予算（ビームtick/地雷爆発/反射判定/鎖再接続/複製/軍勢 等）を初期化。
    this._frameBudgets = {};
    // M6-E: 死亡イベントの毎フレーム発行数リセット＋フレームID更新。
    this._deathEmitsThisFrame = 0;
    this._frameId++;
    // M7-A: 氷砕・粉砕の毎フレーム予算（品質別・上限到達でも戦闘ロジックは停止しない）。
    const q = this.settings?.effectQuality || 'high';
    this._frostbreakBudget = DataManager.skillCap('maxBossFrostbreaksPerFrame', q, 1);
    this._shatterBudget = DataManager.skillCap('maxShattersPerFrame', q, 8);
    if (this.effects) this.effects.beginFrame(caps.maxDamageNumbersPerFrame ?? 24, this.particleBudget ?? 200);
    this._resetMetrics();
  }

  // 計測カウンタ（?debug=1 の性能パネル用。計測自体は加算のみで軽量）。
  _resetMetrics() {
    this._m = {
      queries: 0,           // 空間検索の呼び出し回数
      bruteComparisons: 0,  // 総当たり方式なら走査したはずの比較回数（= 各検索時の敵数）
      spatialCandidates: 0, // 空間グリッドが返した候補数（周辺セル内）
      exactTests: 0,        // 実際に行った厳密距離判定の回数
      finalHits: 0,         // 検索が返した最終該当数
      aoe: 0,               // このフレームの AoE 適用数
      suppressed: 0,        // safetyCaps により抑制した処理数
    };
  }

  // 空間検索1回ぶんの計測を記録する。
  _recordQuery(bruteN, candN, finalN) {
    const m = this._m;
    m.queries++;
    m.bruteComparisons += bruteN;
    m.spatialCandidates += candN;
    m.exactTests += candN;
    m.finalHits += finalN;
  }

  // 安全上限付き AoE（進化スキルが使用）。上限に達しても戦闘を止めない。
  // M6-C: 爆発タグ付き AoE は Lv40「爆炎強化」の爆発範囲+10% を判定半径へ反映する。
  aoe(x, y, radius, amount, skillId, opts = {}) {
    if (this._aoeBudget <= 0) { this._m.suppressed++; return; }
    this._aoeBudget--;
    this._m.aoe++;
    const r = (opts.isExplosion || opts.isMarkDetonation) ? radius * this.jobMods.explosionAreaMult() : radius;
    this.damageArea(x, y, r, amount, skillId, opts);
  }

  ignitedCount() {
    let n = 0;
    this.enemyPool.forEachActive((e) => { if (e.ignited) n++; });
    return n;
  }

  // 倍速の反映（物理/タイマー/Tween/ロジックdtを一貫してスケール）。
  applySpeed(mult) {
    const m = Math.max(1, Math.min(mult || 1, this.speedMax || 1));
    this.speedMult = m;
    this.time.timeScale = m;
    this.tweens.timeScale = m;
    this.physics.world.timeScale = 1 / m; // Arcade: 0.5 = 2倍速
  }

  // 円範囲内の対象（敵＋ボス）。空間グリッドで候補を絞り、厳密な距離で判定する。
  // 空間モードでは候補を出現順(_seq)＝プールSet順に整列し、総当たり方式と結果順を一致させる。
  targetsInRadius(x, y, r) {
    const out = [];
    const r2 = r * r;
    const brute = this.enemyPool.activeCount;
    if (this._useSpatial) {
      const cand = this.enemyGrid.queryCircle(x, y, r);
      for (const e of cand) { if (e.alive && dist2(x, y, e.x, e.y) <= r2) out.push(e); }
      out.sort(SEQ_CMP);
      this._recordQuery(brute, cand.length, out.length);
    } else {
      this.enemyPool.forEachActive((e) => { if (e.alive && dist2(x, y, e.x, e.y) <= r2) out.push(e); });
      this._recordQuery(brute, brute, out.length);
    }
    // ボスは単一の大型オブジェクトのため個別に扱う（両方式で同一）。
    if (this.boss && this.boss.alive) {
      const br = r + this.boss.displayWidth * 0.4;
      if (dist2(x, y, this.boss.x, this.boss.y) <= br * br) out.push(this.boss);
    }
    return out;
  }

  nearestTarget(x, y, range) {
    let best = null, bestD = Infinity;
    const brute = this.enemyPool.activeCount;
    if (this._useSpatial) {
      const cand = this.enemyGrid.queryCircle(x, y, range);
      cand.sort(SEQ_CMP); // 同距離時の優先順位を総当たり(Set順)と一致させる
      for (const e of cand) {
        if (!e.alive) continue;
        const d = distance(x, y, e.x, e.y);
        if (d < bestD && d <= range) { bestD = d; best = e; }
      }
      this._recordQuery(brute, cand.length, best ? 1 : 0);
    } else {
      this.enemyPool.forEachActive((e) => {
        if (!e.alive) return;
        const d = distance(x, y, e.x, e.y);
        if (d < bestD && d <= range) { bestD = d; best = e; }
      });
      this._recordQuery(brute, brute, best ? 1 : 0);
    }
    if (this.boss && this.boss.alive) {
      const d = distance(x, y, this.boss.x, this.boss.y);
      if (d < bestD && d <= range) { best = this.boss; }
    }
    return best;
  }

  // 全対象からの無作為抽出。空間的絞り込みではなく全体が必要なため総当たり（Set順）を維持する。
  randomTargets(n) {
    const arr = [];
    this.enemyPool.forEachActive((e) => { if (e.alive) arr.push(e); });
    if (this.boss && this.boss.alive) arr.push(this.boss);
    // Fisher-Yates（rng）
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, n);
  }

  // 敵の密集地点。各点の近傍数を空間グリッドで数える（総当たりは O(敵数²)）。
  // 走査順は Set 順を維持し、同数時の安定ソートで総当たりと同一結果を返す。
  densestPoint(radius, idx = 0) {
    const pts = [];
    this.enemyPool.forEachActive((e) => { if (e.alive) pts.push(e); });
    if (pts.length === 0) return this.boss && this.boss.alive ? { x: this.boss.x, y: this.boss.y } : null;
    const r2 = radius * radius;
    const n = pts.length;
    let scored;
    if (this._useSpatial) {
      scored = pts.map((c) => {
        const cand = this.enemyGrid.queryCircle(c.x, c.y, radius);
        let count = 0;
        for (const o of cand) if (o.alive && dist2(c.x, c.y, o.x, o.y) <= r2) count++;
        this._recordQuery(n, cand.length, count);
        return { x: c.x, y: c.y, count };
      });
    } else {
      scored = pts.map((c) => {
        let count = 0;
        for (const o of pts) if (dist2(c.x, c.y, o.x, o.y) <= r2) count++;
        this._recordQuery(n, n, count);
        return { x: c.x, y: c.y, count };
      });
    }
    scored.sort((a, b) => b.count - a.count);
    return scored[Math.min(idx, scored.length - 1)];
  }

  dealDamage(target, amount, skillId, opts = {}) {
    if (!target || !target.alive) return false;
    // 基礎ダメージ恒久強化（damageMult）＋パッシブ「魔力増幅」を全プレイヤーダメージへ適用。
    // パッシブ未取得なら getDamageMultiplier()=1（＝M5-B 以前と同じ）。
    amount = amount * (this.bonus.damageMult || 1) * (this.passives ? this.passives.getDamageMultiplier() : 1);
    // ジョブレベル: 主属性ダメージ補正（基本成長＋到達報酬）をタグに応じて適用（属性一致時のみ）。
    // fire 以外・Lv1・非対象ジョブでは 1（恒等＝M6-B と一致）。適用順は最後（カテゴリ間の乗算）。
    const element = opts.element || this._defaultElement || null;
    const sfx = this.statusFx;
    // M7-A: 氷術師 Lv40「凍結狩り」用に対象の状態を解決（frozen/氷砕脆弱を優先し chilled と二重適用しない）。
    const frozenT = !!(sfx && sfx.isFrozen(target));
    const frostbreakT = !!(target.isBoss && sfx && sfx.bossVulnActive(target));
    const chilledT = !!(sfx && sfx.isChilled(target));
    const wasFrozen = frozenT; // Lv50 死亡粉砕の判定用（takeDamage 前の状態）
    const _tags = this._damageTags(skillId, opts, element, { chilledT, frozenT: frozenT || frostbreakT });
    amount *= this.jobMods.damageMultiplier(_tags);
    // M7-A: 氷ダメージへは氷パッシブ（氷晶増幅）とボス氷砕脆弱の被ダメージ増加を追加適用（火へは適用しない）。
    if (element === 'ice') {
      if (this.passives) amount *= this.passives.getIceDamageMultiplier();
      if (target.isBoss && sfx) amount *= sfx.bossIceVulnMultiplier(target);
    }
    if (window.RFS_DEBUG) this._lastDamageInfo = { skillId: skillId || '(none)', tags: _tags, echo: this._echoScale }; // F7 表示用
    // 残響の追加発動ぶんの威力（同期ダメージ用・弾は spawn 時に反映済み）。
    if (this._echoScale && this._echoScale !== 1) amount *= this._echoScale;
    const dx = target.x, dy = target.y; // 死亡・返却前に座標を確保（死亡粉砕/演出用）
    const died = target.takeDamage(amount);
    const dealt = target.lastDamage || amount;
    if (skillId) { this.skills.recordDamage(skillId, dealt); this.skills.recordHit(skillId); }
    if (dealt > this.maxHit) this.maxHit = dealt;
    if (element === 'ice' && this.telemetry) this.telemetry.noteStatusEvent('iceDamage', dealt);

    if (!opts.quiet) this.effects.damageNumber(target.x, target.y - (target.isBoss ? 20 : 6), Math.round(dealt), !!opts.crit);
    if (!target.isBoss) this.effects.enemyFlash(target);
    if (!opts.quiet) this.effects.hitBurst(target.x, target.y, opts.color || (element === 'ice' ? 0x9fe8ff : 0xffe082));

    if (opts.knockback && target.applyKnockback) {
      target.applyKnockback(opts.from?.x ?? this.player.x, opts.from?.y ?? this.player.y, opts.knockback);
    }
    // M7-A: 氷属性命中の状態異常（冷気付与→凍結判定 or ボス氷砕ゲージ）。粉砕/刻印起爆自身は状態を発生させない。
    if (!died && element === 'ice' && sfx && !opts.isShatter && !opts.isMarkDetonation && (opts.chillAmount || opts.applyStatus)) {
      const spMult = this.jobMods.statusPowerMult();
      const res = sfx.applyIceHit(target, {
        chillAmount: opts.chillAmount || 0, baseFreezeChance: opts.baseFreezeChance || 0,
        procCoefficient: opts.procCoefficient != null ? opts.procCoefficient : 1,
        hitGroupId: opts.hitGroupId, canFreeze: opts.canFreeze !== false,
        statusPowerMult: spMult,
      });
      const appliedChill = (opts.chillAmount || 0) * spMult;
      if (this.telemetry) {
        this.telemetry.noteStatusEvent('chillApplied', appliedChill);
        if (skillId) this.skills.recordExtra(skillId, 'chillApplied', appliedChill, 'add');
        if (res.boss) { if (skillId) this.skills.recordExtra(skillId, 'bossFrostGaugeApplied', appliedChill, 'add'); }
        else {
          this.telemetry.noteStatusEvent('freezeAttempts', 1);
          if (skillId) this.skills.recordExtra(skillId, 'freezeAttempts', 1, 'add');
          if (res.froze) {
            this.telemetry.noteStatusEvent('freezes', 1);
            this.telemetry.noteStatusEvent('frozenSecondsApplied', this.freezeSys.freezeDuration(sfx.entityType(target)) / 1000);
            if (skillId) this.skills.recordExtra(skillId, 'freezesCaused', 1, 'add');
          }
        }
      }
      if (res.frostbreak) this._onBossFrostbreak(res.frostbreak, skillId);
    }
    if (died) {
      if (skillId) this.skills.recordKill(skillId);
      if (target.isBoss) this.onBossKilled(target);
      else {
        this.onEnemyKilled(target, skillId);
        // 氷術師 Lv50「氷砕連鎖」: 凍結中の通常敵・エリートが氷ダメージで死亡したら小規模な粉砕爆発（1体1回・再帰なし）。
        if (element === 'ice' && wasFrozen && !opts.isShatter) {
          const cfg = this.jobMods.shatterOnFrozenKill();
          if (cfg) this._deathShatter(dx, dy, skillId, cfg);
        }
      }
    } else if (!opts.isMarkDetonation && skillId && !target.isBoss && target._mark && this.time.now < target._mark.until) {
      // 起爆刻印（M6-B）: 火属性攻撃/炎上が命中したら刻印を進め、規定回数で起爆。
      // 起爆自身のダメージ(isMarkDetonation)ではカウントしない＝無限再起爆を防止。
      target._mark.hits += 1;
      if (target._mark.hits >= target._mark.hitsNeeded) this.detonateMark(target);
    }
    return died;
  }

  // 強制凍結（制御スキル用・通常敵/エリートのみ・freeze_immunity/凍結中は不可・noExtend）。
  // 独自の凍結タイマーは持たず StatusEffectManager.freeze を使う。凍結できたら統計/テレメトリへ記録して true。
  freezeEnemy(e) {
    const sfx = this.statusFx;
    if (!e || !e.alive || e.isBoss || !sfx) return false;
    if (sfx.isFrozen(e) || sfx.isFreezeImmune(e)) return false;
    const ok = sfx.freeze(e);
    if (ok && this.telemetry) {
      this.telemetry.noteStatusEvent('freezes', 1);
      this.telemetry.noteStatusEvent('frozenSecondsApplied', this.freezeSys.freezeDuration(sfx.entityType(e)) / 1000);
    }
    return ok;
  }

  // ボス氷砕の発生（短い硬直＋脆弱表示＋演出）。同一フレーム複数回は予算で抑制。
  _onBossFrostbreak(ev, skillId) {
    if (!this.boss || !this.boss.alive) return;
    if (this._frostbreakBudget <= 0) { this._m.suppressed++; return; }
    this._frostbreakBudget--;
    this.boss.applyFrostStagger(ev.staggerMs); // chase 中のみ硬直（中断不可能な行動は壊さない）
    this.effects.explosion(this.boss.x, this.boss.y, 48, 0x9fe8ff);
    this.effects.whiteFlash?.();
    this.showBanner('氷砕！ボスが硬直し氷属性ダメージが増加');
    if (this.telemetry) this.telemetry.noteStatusEvent('bossFrostbreaks', 1);
  }

  // 氷術師 Lv50 の死亡粉砕（固定/威力/最大HP係数の安全構造・再帰なし・ボス対象外）。
  _deathShatter(x, y, skillId, cfg) {
    if (this._shatterBudget <= 0) { this._m.suppressed++; return; }
    this._shatterBudget--;
    const s = DataManager.shatterConfig;
    const radius = (s.explosionRadius || 44) * (cfg.radiusFactor || 1);
    const dmg = this.freezeSys.shatterDamage({ skillPower: 0, maxHp: 0, powerMult: cfg.powerFactor || 0.6 });
    this.effects.explosion(x, y, radius, 0x9fe8ff);
    // isShatter:true で粉砕から粉砕を再帰させない。属性 ice で氷ダメージとして計上。
    this.damageArea(x, y, radius, dmg, skillId || 'frost_shatter', { quiet: true, isShatter: true, element: 'ice' });
    if (this.telemetry) { this.telemetry.noteStatusEvent('shatters', 1); this.telemetry.noteStatusEvent('shatterDamage', dmg); }
  }

  damageArea(x, y, radius, amount, skillId, opts = {}) {
    for (const t of this.targetsInRadius(x, y, radius)) {
      if (t === opts.exclude) continue;
      this.dealDamage(t, amount, skillId, {
        knockback: opts.knockback || 0, from: { x, y },
        crit: opts.crit, quiet: opts.quiet, color: opts.color,
        isMarkDetonation: opts.isMarkDetonation, element: opts.element, tag: opts.tag,
        isDoT: opts.isDoT, isExplosion: opts.isExplosion,
        // M7-A: 氷属性の状態異常（冷気/凍結判定）を範囲攻撃へも伝播する。
        chillAmount: opts.chillAmount, baseFreezeChance: opts.baseFreezeChance,
        procCoefficient: opts.procCoefficient, hitGroupId: opts.hitGroupId,
        canFreeze: opts.canFreeze, applyStatus: opts.applyStatus, isShatter: opts.isShatter,
      });
    }
  }

  // ダメージタグを解決する（ジョブ属性補正の適用判定）。
  // 各ジョブの主属性（火の魔女=fire / 氷術師=ice）を既定とし、opts.element で明示可能。
  // status: { chilledT, frozenT }（氷術師 Lv40「凍結狩り」の対象ボーナス。frozen/氷砕脆弱を frozenT に集約済み）。
  _damageTags(skillId, opts, element, status = {}) {
    return {
      element: element !== undefined ? element : (opts.element || this._defaultElement || null),
      isDoT: !!(opts.isDoT || opts.tag === 'dot' || opts.tag === 'burn'),
      isExplosion: !!(opts.isExplosion || opts.tag === 'explosion' || opts.isMarkDetonation),
      isEvolved: !!(skillId && DataManager.getEvolution(skillId)),
      isChilledTarget: !!status.chilledT,
      isFrozenTarget: !!status.frozenT,
    };
  }

  // ---------------- メインループ ----------------
  update(time, delta) {
    if (this.paused || this.gameOver) return;
    if (this._hitStopMs > 0) {
      this._hitStopMs -= delta;
      if (this._hitStopMs <= 0 && !this.paused && !this.gameOver) this.physics.world.resume();
      return;
    }
    const dt = delta * (this.speedMult || 1); // 倍速はロジックdtへ反映（物理/タイマーは timeScale）
    this._perFrameReset();                     // 安全上限の予算を毎フレーム初期化
    this.timeSec += dt / 1000;
    if (this.telemetry) this.telemetry.noteFrame(delta); // M6-F: FPS/フレーム時間の計測（実フレームms）

    this.handleInput(dt);
    this.statusFx.update(dt); // M7-A: 冷気減衰・凍結/耐性/氷砕脆弱の期限切れ
    this.updateEnemies(dt);
    if (this.boss && this.boss.alive) this.boss.update(dt, this.player);
    this.updateProjectiles(dt);
    this.updateGems(dt);
    this.updateRecalc(dt);
    this.skills.update(dt, { hasEnemies: this.hasTargets() });
    this.handleSpawning(dt);
    this.checkCollisions();
    this.checkBossTime();
    this.updateHud();

    this._autoSaveAccum += dt;
    if (this._autoSaveAccum >= AUTOSAVE_MS) { this._autoSaveAccum = 0; this.autoSave(); }

    this._mLast = this._m;                 // 直近フレームの計測を保持
    if (this.telemetry && this._m && this._m.suppressed > 0) this.telemetry.noteCapReached('perfCap'); // M6-F: 性能上限到達
    if (window.RFS_DEBUG) this._accumulatePerf(delta); // 性能パネル（0.25〜1秒毎に更新）
  }

  hasTargets() {
    return this.enemyPool.activeCount > 0 || !!(this.boss && this.boss.alive);
  }

  updateRecalc(dt) {
    this._recalc -= dt;
    if (this._recalc > 0) return;
    this._recalc = 120;
    this._nearestEnemy = this.nearestTarget(this.player.x, this.player.y, 100000);
    this._nearestGem = this.findNearestGem();
  }

  findNearestGem() {
    const px = this.player.x, py = this.player.y;
    let best = null, bestD = 200 * 200;
    if (this._useSpatial) {
      const cand = this.gemGrid.queryCircle(px, py, 200);
      cand.sort(SEQ_CMP);
      for (const g of cand) {
        if (!g.alive) continue;
        const d = dist2(px, py, g.x, g.y);
        if (d < bestD) { bestD = d; best = g; }
      }
    } else {
      this.gemPool.forEachActive((g) => {
        if (!g.alive) return;
        const d = dist2(px, py, g.x, g.y);
        if (d < bestD) { bestD = d; best = g; }
      });
    }
    return best;
  }

  handleInput(dt) {
    let ix = 0, iy = 0;
    const k = this.keys;
    if (k.leftA.isDown || k.moveLeft.isDown) ix -= 1;
    if (k.rightA.isDown || k.right.isDown) ix += 1;
    if (k.upA.isDown || k.up.isDown) iy -= 1;
    if (k.downA.isDown || k.down.isDown) iy += 1;

    const manual = ix !== 0 || iy !== 0;
    if (this.autoMove && !manual) {
      const v = this.computeAutoMove(); ix = v.x; iy = v.y;
      if (this.autoDashEnabled) this.tryAutoDash(dt, ix, iy); // 魂炎「オートダッシュ」
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.dash)) this.player.tryDash(ix, iy);
    this.player.handleMovement(dt, ix, iy);
  }

  // オートダッシュ: 危険が近いとき自動でダッシュ回避（回数・無敵を正しく消費）。
  tryAutoDash(dt, ix, iy) {
    this._autoDashCd = (this._autoDashCd || 0) - dt;
    if (this._autoDashCd > 0) return;
    const d = this._nearestEnemy;
    if (d && d.alive && this.player.dashCharges > 0 && distance(this.player.x, this.player.y, d.x, d.y) < 64) {
      if (this.player.tryDash(ix, iy)) this._autoDashCd = 900;
    }
  }

  // オート移動改善（M2）: 危険から離れる / ジェム回収 / 端回避 / ボス突進回避。
  // 完璧にはせず手動操作の価値を残す。手動入力時は handleInput が手動優先。
  computeAutoMove() {
    const p = this.player;
    let vx = 0, vy = 0;
    const danger = this._nearestEnemy;
    if (danger && danger.alive) {
      const d = distance(p.x, p.y, danger.x, danger.y);
      const w = Phaser.Math.Clamp((170 - d) / 170, 0, 1);
      const ang = Math.atan2(p.y - danger.y, p.x - danger.x);
      vx += Math.cos(ang) * (0.4 + w); vy += Math.sin(ang) * (0.4 + w);
    }
    if (this.boss && this.boss.alive && (this.boss.state === 'telegraph' || this.boss.state === 'charge')) {
      const ang = Math.atan2(p.y - this.boss.y, p.x - this.boss.x);
      vx += Math.cos(ang) * 1.3; vy += Math.sin(ang) * 1.3;
    }
    const gem = this._nearestGem;
    if (gem && gem.alive) { const ang = Math.atan2(gem.y - p.y, gem.x - p.x); vx += Math.cos(ang) * 0.5; vy += Math.sin(ang) * 0.5; }
    const m = 140;
    if (p.x < m) vx += 0.8; if (p.x > WORLD_W - m) vx -= 0.8;
    if (p.y < m) vy += 0.8; if (p.y > WORLD_H - m) vy -= 0.8;
    const len = Math.hypot(vx, vy) || 1;
    return { x: vx / len, y: vy / len };
  }

  updateEnemies(dt) {
    const px = this.player.x, py = this.player.y;
    if (this._useSpatial) {
      this.enemyPool.forEachActive((e) => { e.update(px, py, dt); this.enemyGrid.update(e); });
    } else {
      this.enemyPool.forEachActive((e) => e.update(px, py, dt));
    }
  }

  updateProjectiles(dt) {
    const rel = [];
    const check = (pool) => pool.forEachActive((p) => {
      p.update(dt);
      if (!p.alive || p.x < -60 || p.y < -60 || p.x > WORLD_W + 60 || p.y > WORLD_H + 60) rel.push([pool, p]);
    });
    check(this.projPool);
    check(this.bossBulletPool);
    for (const [pool, p] of rel) pool.release(p);
  }

  updateGems(dt) {
    const magnet = 90 * this.bonus.pickupMult;
    const pickup = this.player.cfg.pickupRadius * this.bonus.pickupMult;
    const collected = [];
    const px = this.player.x, py = this.player.y;
    this.gemPool.forEachActive((g) => {
      if (g.update(px, py, pickup, magnet)) collected.push(g);
      else if (this._useSpatial) this.gemGrid.update(g); // 吸引で移動したジェムのセルを更新
    });
    for (const g of collected) { this.grantXp(g.value); this.gemPool.release(g); }
  }

  // ---------------- 出現（SpawnManager へ委譲） ----------------
  handleSpawning(dt) { this.spawn.update(dt); }
  // Boss.js から呼ばれるフック（互換のため薄いラッパを維持）
  spawnZakoNear(bx, by) { this.spawn.spawnZakoNear(bx, by); }
  spawnBossBullet(x, y, angle, speed) { this.spawn.spawnBossBullet(x, y, angle, speed); }

  // ---------------- ボス ----------------
  checkBossTime() {
    if (this.bossSpawned) return;
    // M6-F: Balance Playtest の検証時間（1分/10分）を優先（通常は 5 分）。
    const bossAt = this._playtestDurationSec || DataManager.balance.run.bossAtSec;
    if (this.timeSec >= bossAt) {
      this.bossSpawned = true;
      this.spawnBoss();
      this.showBanner('ボス出現！撃破で勝利');
      this.effects.whiteFlash();
    }
  }

  spawnBoss() {
    const def = DataManager.bosses[0];
    if (!def) return;
    const bx = Phaser.Math.Clamp(this.player.x + 160, 60, WORLD_W - 60);
    const by = Phaser.Math.Clamp(this.player.y, 60, WORLD_H - 60);
    this.boss = new Boss(this, bx, by, def, this.difficulty.bossHp);
    // M7-A: 途中再開時のボス氷砕状態を適用（ゲージ初期化や脆弱延長の悪用を防ぐ）。
    if (this._pendingBossFrost) {
      const bf = this._pendingBossFrost; this._pendingBossFrost = null;
      this.boss._frostGauge = Math.max(0, +bf.gauge || 0);
      this.boss._frostBreaks = Math.max(0, Math.floor(+bf.breaks || 0));
      if (bf.vulnRemainMs > 0) { this.boss._frostbreakVulnUntil = this.time.now + bf.vulnRemainMs; this.statusFx.register('frostbreak_vulnerability', this.boss, 'maxStatusIndexEntries'); }
    }
    this.hud.showBoss(def.name);
    if (this._defaultElement === 'ice') this.hud.showBossFrost(); // 氷術師のみ氷砕ゲージを表示
  }

  onBossKilled(boss) {
    this.bossKills++;
    this._recordDeathEvent(boss, 'boss'); // M6-E: ボス死亡も墓標の死亡位置として扱える
    this.statusFx.onDeath(boss); // M7-A: 炎上/氷砕脆弱の索引から除去
    this.effects.deathBurst(boss.x, boss.y, 0xff5722);
    this.effects.screenShake(300, 0.01);
    this.effects.whiteFlash();
    boss.destroy();
    this.boss = null;
    this.hud.hideBoss();
    this.finishRun(true);
  }

  // ---------------- 当たり判定 ----------------
  checkCollisions() {
    const p = this.player;
    const pr = 8;

    // プレイヤー弾 vs 敵/ボス
    this.projPool.forEachActive((proj) => {
      if (!proj.alive || proj.hostile) return;
      const rr = 8 * proj.scaleX;
      for (const e of this.targetsInRadius(proj.x, proj.y, rr + 16)) {
        if (!proj.alive) break;
        const rad = rr + e.displayWidth * 0.4;
        if (distance(proj.x, proj.y, e.x, e.y) <= rad) {
          // M6-D 跳炎弾: 恒久 hitSet ではなく対象ごとの再命中待機で判定し、貫通ではなく反射する。
          if (proj.behavior === 'ricochet') {
            if (!this._ricochetTryHit(proj, e)) continue;
            this.dealDamage(e, proj.damage, proj.skillId, { knockback: proj.knockback, from: { x: this.player.x, y: this.player.y }, element: proj.element });
            this._ricochetBounce(proj, e);
            continue;
          }
          if (!proj.registerHit(e)) continue;
          // M7-A: 氷弾は「冷気高蓄積ボーナス＋凍結中の粉砕」を処理してから通常ダメージ＆冷気/凍結判定を行う。
          // registerHit により同じ弾が同じ敵を複数回粉砕しない。粉砕は氷弾のダメージ命中前（凍結状態のうち）に行う。
          let projDmg = proj.damage;
          if (proj.element === 'ice') {
            if (proj.bonusPerChill > 0) projDmg = proj.damage * (1 + proj.bonusPerChill * this.statusFx.chillOf(e));
            if (proj.frozenBonus > 0 && this.statusFx.isFrozen(e)) projDmg *= (1 + proj.frozenBonus);
            if (proj.shatterOnFrozen && this.statusFx.isFrozen(e)) {
              const px = e.x, py = e.y;
              if (this.shatterEnemy(e, { skillId: proj.skillId, multiplier: proj.shatterMultiplier, skillPower: proj.damage }) && proj.fragmentCount > 0) {
                this._spawnIceFragments(px, py, proj);
              }
            }
          }
          this.dealDamage(e, projDmg, proj.skillId, {
            knockback: proj.knockback, from: { x: this.player.x, y: this.player.y }, element: proj.element,
            chillAmount: proj.chillAmount, baseFreezeChance: proj.baseFreezeChance,
            procCoefficient: proj.procCoefficient, hitGroupId: proj.hitGroupId,
          });
          if (proj.explosionRadius > 0) {
            this.effects.explosion(proj.x, proj.y, proj.explosionRadius);
            this.aoe(proj.x, proj.y, proj.explosionRadius, proj.damage * 0.5, proj.skillId, { exclude: e, quiet: true, isExplosion: true, element: proj.element });
          }
          // M6-B: ラム威力上昇（千条炎槍）・連鎖（連鎖炎）。
          if (proj.ramp > 0) proj.damage = Math.min(proj.damage * (1 + proj.ramp), (proj._rampBase || proj.damage) * 1.6);
          if (proj.behavior === 'chain') this._chainHit(proj, e);
          proj.consumePierce();
          // 貫通後の威力減衰（進化弾は減衰が緩い）。
          if (proj.alive && proj.pierceFalloff < 1) proj.damage *= proj.pierceFalloff;
          // 貫通を使い切ったら分裂（千条炎槍・世代上限あり）。
          if (!proj.alive && proj.behavior === 'split_lance' && proj.splitGen > 0) this._splitLance(proj);
        }
      }
    });

    // ボス弾 vs プレイヤー
    if (p.alive) {
      this.bossBulletPool.forEachActive((b) => {
        if (!b.alive) return;
        if (distance(b.x, b.y, p.x, p.y) <= pr + 6 * b.scaleX) {
          if (p.takeDamage(b.damage)) { this.effects.screenShake(120, 0.006); if (!p.alive) this.onPlayerDeath(); }
          b.alive = false;
        }
      });
    }

    // 敵接触 vs プレイヤー
    if (p.alive) {
      this.enemyPool.forEachActive((e) => {
        if (!e.alive) return;
        if (distance(p.x, p.y, e.x, e.y) <= pr + e.displayWidth * 0.4) {
          if (p.takeDamage(e.damage)) { this.effects.screenShake(120, 0.006); if (!p.alive) this.onPlayerDeath(); }
        }
      });
      // ボス接触
      if (this.boss && this.boss.alive && distance(p.x, p.y, this.boss.x, this.boss.y) <= pr + this.boss.displayWidth * 0.4) {
        if (p.takeDamage(this.boss.damage)) { this.effects.screenShake(160, 0.008); if (!p.alive) this.onPlayerDeath(); }
      }
    }
  }

  onEnemyKilled(e, skillId) {
    this.kills++;
    if (e.isElite) this.eliteKills++; // M6-C: エリート撃破数（ジョブXP）
    this._recordDeathEvent(e, skillId); // M6-E: 死亡位置履歴（墓標系スキル所持時のみ）
    this.statusFx.onDeath(e);           // M6-E/M7-A: 状態異常索引から除去（死亡・凍結解除tintも）
    // 永劫火界: 炎上中の敵の死亡で小爆発（安全上限内・連鎖暴走防止）。
    // 死亡直後は alive=false のため .ignited ではなく点火タイマーで判定する。
    const wasIgnited = e._igniteUntil && this.time.now < e._igniteUntil;
    if (wasIgnited && this._deathExpBudget > 0) {
      this._deathExpBudget--;
      const evo = DataManager.getEvolution('eternal_pyre');
      const r = evo?.area?.deathExplosionRadius || 46;
      this.effects.explosion(e.x, e.y, r, 0xff7043);
      this.aoe(e.x, e.y, r, evo?.damage?.deathExplosion || 34, 'eternal_pyre', { exclude: e, quiet: true, isExplosion: true });
    } else if (wasIgnited) {
      this._m.suppressed++; // 死亡爆発連鎖の安全上限で抑制
    }
    this.effects.deathBurst(e.x, e.y);
    this.gemPool.spawn(e.x, e.y, e.xpValue);
    // 業火弾幕: 撃破で近くの別の敵へ追撃火球（安全上限内）。
    if (skillId === 'infernal_barrage' && this._extraFbBudget <= 0) {
      this._m.suppressed++; // 追撃火球の安全上限で抑制
    } else if (skillId === 'infernal_barrage') {
      const t = this.nearestTarget(e.x, e.y, 240);
      if (t && t !== e && t.alive) {
        this._extraFbBudget--;
        const evo = DataManager.getEvolution('infernal_barrage');
        const ang = Math.atan2(t.y - e.y, t.x - e.x);
        this.projPool.spawn(e.x, e.y, ang, 300, {
          skillId: 'infernal_barrage', damage: (evo?.damage?.base || 46) * 0.7,
          pierce: 1, pierceFalloff: 0.9, explosionRadius: (evo?.area?.explosionRadius || 30) * 0.7,
          scale: 1.1, lifeMs: 1200, tint: 0xffca28,
        });
      }
    }
    // 起爆刻印: 刻印されたまま死亡した場合は小規模な死亡時起爆（M6-B）。
    if (e._mark) this.markDeathDetonate(e);
    // スキルの撃破フック（百鬼燎乱の分裂 等）。e はまだ有効（release 前）。
    this.skills.dispatchKill(e, skillId);
    this.enemyPool.release(e);
  }

  grantXp(value) {
    const gained = Math.max(1, Math.round(value * this.bonus.xpMult));
    const ups = this.player.gainXp(gained, DataManager.balance.leveling.xpGrowth);
    if (ups > 0) this.openLevelUp();
  }

  // ---------------- レベルアップ（M6-A: SkillDraftManager による決定論ドラフト） ----------------
  openLevelUp() {
    this.forcePause(false);
    this.draft.open(this.buildDraftCtx());  // 候補を抽選し active_run へ保存（再読込で不変）
    this.autoSave();
    this._launchDraft();
  }

  _launchDraft() {
    this.scene.launch('LevelUpScene', { provider: {
      getView: () => this.draftView(),
      pick: (i) => this.draftPick(i),
      reroll: () => this.draftReroll(),
      banish: (i) => this.draftBanish(i),
      skip: () => this.draftSkip(),
      rescue: () => this.draftRescue(),
    } });
  }

  // 抽選コンテキスト（所持枠・所持スキル・進化候補・ジョブプール）。
  buildDraftCtx() {
    const activeUsed = this.skills.activeSlotCount();
    const owned = { active: this.skills.activeLevels(), passive: this.passives.serialize() };
    return {
      catalog: DataManager.draftCatalog(),
      job: { activeSkillPool: this.job.activeSkillPool || [], passiveSkillPool: this.job.passiveSkillPool || [] },
      extraAllowedIds: (this.job.futureInheritanceSettings && this.job.futureInheritanceSettings.enabled) ? (this._inheritedIds || []) : [],
      owned,
      slots: {
        active: { used: activeUsed, max: Math.max(this.activeSlotsMax, activeUsed) },
        passive: { used: this.passives.count(), max: this.passiveSlotsMax },
      },
      evolvables: this.computeEvolvables(),
      need: this.choicesPerLevel,
      unlock: { highestClearedDifficulty: this.profile.highestClearedDifficulty || 0 },
      // M6-F: 進化相手の抽選補助（所持基礎の未達補助スキル）＋現在の battleLevel（決定論を壊さない付随情報）。
      synergy: { partnerIds: evolutionPartnerIds(this._evoRecipes || [], owned), battleLevel: this.player.level || 1 },
    };
  }

  computeEvolvables() {
    const out = [];
    const seen = new Set();
    // 補助条件は active(SkillManager) と passive(PassiveManager) の両方から解決する（M6-B の進化はパッシブも要求）。
    const levelOf = (id) => (this.skills.getLevel(id) || this.passives.getLevel(id) || 0);
    for (const base of this.skills.baseActiveIds()) {
      if (seen.has(base)) continue; seen.add(base);
      if (EvolutionManager.canEvolve(this.skills, this.profile, base, levelOf)) {
        const ev = EvolutionManager.forBase(base);
        if (ev) out.push({ evolutionId: ev.id, baseId: base, rarity: 'legendary', order: DataManager.getSkill(base)?.displayOrder || 0 });
      }
    }
    return out;
  }

  // 抽選結果を LevelUpScene 用の表示データへ変換する。
  draftView() {
    return {
      candidates: this.draft.currentCandidates.map((c) => this.describeCandidate(c)),
      slots: {
        activeUsed: this.skills.activeSlotCount(), activeMax: Math.max(this.activeSlotsMax, this.skills.activeSlotCount()),
        passiveUsed: this.passives.count(), passiveMax: this.passiveSlotsMax,
      },
      counts: { rerolls: this.draft.rerollsRemaining, banishes: this.draft.banishesRemaining, skips: this.draft.skipsRemaining },
    };
  }

  describeCandidate(c) {
    const RARITY = { common: '#bcaaa4', uncommon: '#80deea', rare: '#ce93d8', legendary: '#ffd54f' };
    const rarityColor = RARITY[c.rarity] || '#bcaaa4';
    if (c.kind === 'evolution') {
      const ev = DataManager.getEvolution(c.id);
      return { id: c.id, kind: 'evolution', category: 'active', rarity: c.rarity, rarityColor, badge: '★進化', icon: ev?.icon || DataManager.getSkill(c.baseId)?.iconKey, title: ev?.displayName || c.id, description: ev?.description || '', level: '→ 進化' };
    }
    if (c.category === 'passive') {
      const p = DataManager.getPassive(c.id);
      const isNew = c.kind === 'new_passive';
      return { id: c.id, kind: c.kind, category: 'passive', rarity: c.rarity, rarityColor, badge: isNew ? 'passive 新規' : 'passive 強化', icon: p?.iconKey, title: p?.displayName || c.id, description: p?.description || '', level: `Lv ${c.fromLevel}→${c.toLevel}/${c.maxLevel}` };
    }
    const s = DataManager.getSkill(c.id);
    const isNew = c.kind === 'new_active';
    const nextStats = isNew ? DataManager.getSkillLevel(c.id, 1) : DataManager.getSkillLevel(c.id, c.toLevel);
    return { id: c.id, kind: c.kind, category: 'active', rarity: c.rarity, rarityColor, badge: isNew ? 'active 新規' : 'active 強化', icon: s?.iconKey || s?.icon, title: s?.name || c.id, description: isNew ? (s?.description || '') : this.describeSkillLevel(c.id, nextStats), level: `Lv ${c.fromLevel}→${c.toLevel}/${c.maxLevel}` };
  }

  applyCandidate(c) {
    if (c.kind === 'evolution') {
      const evoId = this.skills.evolve(c.baseId);
      if (this.draft.markProgress) this.draft.markProgress(); // M6-F: 進化成立で pity リセット
      if (this.telemetry) this.telemetry.noteSkillEvolved(c.baseId, evoId || DataManager.getEvolutionForBase(c.baseId)?.id);
    } else if (c.category === 'passive') {
      this.passives.acquireOrLevel(c.id);
    } else {
      const isNew = c.kind === 'new_active';
      this.skills.acquireOrLevel(c.id);
      if (isNew && this.telemetry) { // 新規取得のみ取得時刻/順を記録（DPS 分母・取得順の統計）
        this._skillAcquiredAt[c.id] = this.timeSec;
        this.telemetry.noteSkillAcquired(c.id, this.player.level, ++this._acquireOrder);
      }
    }
  }

  // M6-F: この周回をデバッグ周回として扱う（F4〜F8 のデバッグ補正使用時）。通常バランス統計へ混ぜない。
  markDebugRun() { this._debugRun = true; if (this.telemetry) this.telemetry.run.debugRun = true; }

  // M6-F: 周回終了時にテレメトリを確定する（スキル別統計・DPS・防御値・FPS）。BattleManager から呼ぶ。
  finalizeTelemetry(result) {
    if (!this.telemetry) return null;
    const t = this.telemetry;
    // 防御系の extra キー → 防御統計へ写像（無い項目は 0 のまま）。
    const mapDefensive = (id, ex) => {
      const d = {};
      if (ex.blockedDamageTotal != null || ex.blockedDamage != null) d.blockedDamage = ex.blockedDamageTotal || ex.blockedDamage;
      if (ex.barrierBlockedTotal != null) d.blockedDamage = (d.blockedDamage || 0) + ex.barrierBlockedTotal;
      if (ex.phoenixTriggers != null || ex.lethalAvoided != null) d.lethalAvoided = ex.phoenixTriggers || ex.lethalAvoided;
      if (ex.bulletsAbsorbed != null) d.absorbedBullets = ex.bulletsAbsorbed;
      if (ex.healedTotal != null || ex.healed != null) d.healed = ex.healedTotal || ex.healed;
      if (ex.dashTrails != null || ex.dashBoosts != null) d.dashBoosts = ex.dashTrails || ex.dashBoosts;
      if (ex.healthSpent != null) d.hpSpent = ex.healthSpent;
      if (Object.keys(d).length) t.addDefensiveStat(id, d);
    };
    for (const st of result.skills || []) {
      const ex = st.extra || {};
      t.addSkillStat(st.id, {
        casts: st.casts, hits: st.hits, kills: st.kills, damage: st.damage,
        echoCasts: ex.echoCasts, cloneCasts: ex.cloneDamageCasts,
        highestConcurrentObjects: ex.highestConcurrentObjects || ex.maxConcurrent,
        // M7-A: 状態異常（スキル別）
        chillApplied: ex.chillApplied, freezeAttempts: ex.freezeAttempts, freezesCaused: ex.freezesCaused,
        shatters: ex.shatters, shatterDamage: ex.shatterDamage, bossFrostGaugeApplied: ex.bossFrostGaugeApplied,
      });
      t.setSkillLevel(st.id, st.level, !!DataManager.getEvolution(st.id));
      // activeSeconds: 取得〜周回終了（DPS 分母）。取得時刻不明（初期スキル等）は 0 から。
      const acq = this._skillAcquiredAt[st.id] != null ? this._skillAcquiredAt[st.id] : 0;
      t.addActiveTime(st.id, Math.max(0, (result.timeSec - acq)) * 1000);
      mapDefensive(st.id, ex);
    }
    t.noteRunResult({
      survivalSeconds: result.timeSec, victory: result.win, battleLevel: result.battleLevel,
      totalKills: result.kills, eliteKills: result.eliteKills, bossKills: result.bossKills,
      totalDamage: (result.skills || []).reduce((a, s) => a + (s.damage || 0), 0),
      damageTaken: this._damageTakenTotal || 0,
      activeSlots: this.skills.activeSlotCount(), passiveSlots: this.passives.count(),
      rerolls: (this._baseRerolls || 1) - (this.draft.rerollsRemaining || 0),
      banishes: 0, skips: 0, evolutions: (result.evolvedBaseIds || []).length,
    });
    if (this._debugRun) t.run.debugRun = true;
    return t.finalize();
  }

  draftPick(i) {
    const c = this.draft.currentCandidates[i];
    if (!c) return;
    const isEvo = c.kind === 'evolution';
    const evoBase = isEvo ? c.baseId : null;
    this.applyCandidate(c);
    this.draft.resolvePick();
    this.updateHudSkills();
    this.autoSave();
    this.scene.stop('LevelUpScene');
    if (isEvo) {
      const ev = DataManager.getEvolutionForBase(evoBase);
      const baseName = DataManager.getSkill(evoBase)?.name || evoBase;
      this.scene.launch('EvolutionScene', { evo: ev, baseName, lowFx: this.settings.effectQuality === 'low', onDone: () => this.resumeFromMenu() });
    } else {
      this.resumeFromMenu();
    }
  }

  draftReroll() {
    const r = this.draft.reroll(this.buildDraftCtx());
    if (r.ok) this.autoSave();
    return r.ok;
  }

  draftBanish(i) {
    const c = this.draft.currentCandidates[i];
    if (!c) return false;
    const r = this.draft.banish(c.id, this.buildDraftCtx());
    if (r.ok) this.autoSave();
    return r.ok;
  }

  draftSkip() {
    if (!this.draft.skip()) return false;
    this.autoSave();
    this.scene.stop('LevelUpScene');
    this.resumeFromMenu();
    return true;
  }

  // 候補0件時の救済（回数を消費せず戦闘へ戻る）。
  draftRescue() {
    this.draft.forceClear();
    this.autoSave();
    this.scene.stop('LevelUpScene');
    this.resumeFromMenu();
  }

  describeSkillLevel(id, lv) {
    if (!lv) return '';
    const parts = [];
    if (lv.damage != null) parts.push(`ダメージ${lv.damage}`);
    if (lv.count != null) parts.push(`数${lv.count}`);
    if (lv.pierce) parts.push(`貫通${lv.pierce}`);
    if (lv.radius != null) parts.push(`範囲${lv.radius}`);
    if (lv.duration != null) parts.push(`持続${lv.duration}`);
    if (lv.cooldown != null) parts.push(`CD${lv.cooldown}`);
    return parts.join(' / ');
  }

  shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  updateHudSkills() {
    const list = this.skills.ownedList().map((s) => ({ name: s.name, level: s.level }));
    for (const p of this.passives.ownedList()) list.push({ name: p.name, level: p.level });
    this.hud.setSkills(list);
  }

  updateHud() {
    this.hud.update({ player: this.player, timeSec: this.timeSec, kills: this.kills, difficultyName: this.difficulty.name, autoMove: this.autoMove });
    if (this.boss && this.boss.alive) {
      this.hud.updateBoss(this.boss.hpRatio());
      // M7-A: 氷術師のボス氷砕ゲージ（現在値/必要値・脆弱・break回数）。
      if (this._defaultElement === 'ice') this.hud.updateBossFrost(this.boss._frostGauge || 0, this.statusFx.bossThreshold(this.boss), this.boss._frostBreaks || 0, this.statusFx.bossVulnActive(this.boss));
    }
  }

  showBanner(text) {
    const t = this.add.text(GAME_WIDTH / 2, 96, text, { fontSize: '11px', color: '#fff', backgroundColor: '#3e2723', padding: { x: 6, y: 3 } })
      .setOrigin(0.5).setScrollFactor(0).setDepth(1100);
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 600, onComplete: () => t.destroy() });
  }

  requestHitStop(ms) {
    if (this.paused || this.gameOver || this._hitStopMs > 0) return;
    this._hitStopMs = ms;
    this.physics.world.pause();
  }

  // ---------------- 一時停止 / 中断 ----------------
  togglePause() {
    if (this.gameOver) return;
    if (this.paused) this.resumeFromMenu();
    else this.forcePause(true);
  }

  forcePause(showMenu = true) {
    if (this.paused || this.gameOver) return;
    this.paused = true;
    this.physics.world.pause();
    this.time.paused = true;      // タイマー停止
    this.tweens.pauseAll();       // 演出停止
    this.autoSave();              // 一時停止時に保存
    if (showMenu) this.pauseMenu.open({ onResume: () => this.resumeFromMenu(), onTitle: () => this.returnToBase() });
  }

  // 一時停止メニューから設定を反映する（PauseMenu から呼ばれる）。
  applyEffectSettings() {
    this.effSettings = resolveEffectSettings(DataManager.balance, this.settings);
    this.effects.setSettings(this.effSettings);
  }

  resumeFromMenu() {
    if (!this.paused) return;
    this.paused = false;
    this.physics.world.resume();
    this.time.paused = false;
    this.tweens.resumeAll();
    this.pauseMenu.close();
  }

  // ---------------- 終了（BattleManager へ委譲） ----------------
  autoSave() { this.battle.autoSave(); }

  finishRun(win) { this.battle.finishRun(win); }

  onPlayerDeath() {
    if (this.gameOver) return;
    this.effects.screenShake(300, 0.012);
    this.finishRun(false);
  }

  _resetTimeScales() {
    this.time.timeScale = 1; this.tweens.timeScale = 1; this.physics.world.timeScale = 1;
  }

  returnToTitle() {
    this.physics.world.resume();
    this.time.paused = false;
    this._resetTimeScales();
    this.scene.start('TitleScene');
  }

  returnToBase() {
    this.physics.world.resume();
    this.time.paused = false;
    this._resetTimeScales();
    this.scene.start('BaseScene');
  }

  toggleAuto() {
    this.autoMove = !this.autoMove;
    this.settings.autoMove = this.autoMove;
    SaveManager.saveSettings(this.settings);
  }

  // ---------------- デバッグ確認（?debug=1 のみ・F1） ----------------
  toggleDebug() {
    if (this._dbg) { this._dbg.destroy(true); this._dbg = null; return; }
    const cx = GAME_WIDTH / 2;
    const ui = this.add.container(0, 0).setScrollFactor(0).setDepth(4000);
    ui.add(this.add.rectangle(cx, GAME_HEIGHT / 2, 320, 300, 0x101820, 0.96).setScrollFactor(0).setStrokeStyle(1, 0x80deea));
    ui.add(this.add.text(cx, GAME_HEIGHT / 2 - 134, 'DEBUG（戦闘 / M5-A 性能）', { fontSize: '11px', color: '#80deea' }).setScrollFactor(0).setOrigin(0.5));
    const acts = [
      ['この周回を勝利', () => this.finishRun(true)],
      ['全スキル取得＆Lv8', () => { for (const d of DataManager.skills) { this.skills.acquireOrLevel(d.id); this.skills.setLevel(d.id, 8); } this.updateHudSkills(); }],
      ['火球の進化条件を満たす', () => { this.skills.acquireOrLevel('fireball'); this.skills.setLevel('fireball', 8); this.skills.acquireOrLevel('orbiting_flame'); this.skills.setLevel('orbiting_flame', 4); this.updateHudSkills(); }],
      ['レベルアップ候補を表示', () => { this.toggleDebug(); this.openLevelUp(); }],
      ['経験値 +大量（Lv+）', () => this.grantXp(9999)],
      ['敵を全滅', () => this.enemyPool.releaseAll()],
      // --- M5-A: 空間グリッド/性能 ---
      [() => `空間グリッド: ${this._useSpatial ? 'ON' : 'OFF'}（切替）`, () => this.setSpatialEnabled(!this._useSpatial)],
      [() => `性能パネル(F2): ${this._perfText ? 'ON' : 'OFF'}`, () => this.togglePerfOverlay()],
      [() => `グリッド可視化(F3): ${this._gridGfx ? 'ON' : 'OFF'}`, () => this.toggleGridViz()],
      ['負荷テスト: 敵+100体生成', () => this.debugSpawnEnemies(100)],
    ];
    let yy = GAME_HEIGHT / 2 - 110;
    for (const [label, fn] of acts) {
      const text = typeof label === 'function' ? label() : label;
      const b = this.add.text(cx, yy, text, { fontSize: '10px', color: '#fff', backgroundColor: '#1a3a3e', padding: { x: 6, y: 2 } }).setScrollFactor(0).setOrigin(0.5).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => { fn(); if (this._dbg) this.toggleDebug(); });
      ui.add(b); yy += 20;
    }
    const close = this.add.text(cx, yy + 4, '閉じる (F1)', { fontSize: '9px', color: '#bcaaa4' }).setScrollFactor(0).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleDebug());
    ui.add(close);
    this._dbg = ui;
  }

  // ---------------- M5-A: 空間グリッド ON/OFF と性能計測 ----------------
  // 空間グリッドを切り替える。ON へ戻すときは現在の全対象で再構築する（旧方式は比較用のみ）。
  setSpatialEnabled(on) {
    this._useSpatial = !!on;
    if (this._useSpatial) {
      this.enemyGrid.clear();
      this.gemGrid.clear();
      this.enemyPool.forEachActive((e) => this.enemyGrid.insert(e));
      this.gemPool.forEachActive((g) => this.gemGrid.insert(g));
    }
  }

  // 負荷テスト用: 画面外の各方向に敵をまとめて生成する（?debug=1 のみ）。
  debugSpawnEnemies(n) {
    for (let i = 0; i < n; i++) this.spawn.spawnEnemy();
  }

  // 敵をプレイヤー周囲へ密集配置する（?debug=1）。
  debugClusterEnemies(n) {
    const p = this.player;
    for (let i = 0; i < n; i++) {
      const ang = this.rng() * Math.PI * 2, r = 40 + this.rng() * 60;
      const x = Phaser.Math.Clamp(p.x + Math.cos(ang) * r, 20, WORLD_W - 20);
      const y = Phaser.Math.Clamp(p.y + Math.sin(ang) * r, 20, WORLD_H - 20);
      this.enemyPool.spawn(DataManager.getEnemy('slime'), x, y, this.spawn.enemyMult());
    }
  }

  // ---------------- 新スキル確認（M6-B・?debug=1・F4） ----------------
  toggleSkillDebug() {
    this.markDebugRun(); // M6-F: デバッグ補正の使用でこの周回を通常統計から除外
    if (this._skdbg) { this._skdbg.destroy(true); this._skdbg = null; return; }
    const cx = GAME_WIDTH / 2;
    const ui = this.add.container(0, 0).setScrollFactor(0).setDepth(4000);
    ui.add(this.add.rectangle(cx, GAME_HEIGHT / 2, 340, 300, 0x101820, 0.96).setScrollFactor(0).setStrokeStyle(1, 0x80deea));
    ui.add(this.add.text(cx, GAME_HEIGHT / 2 - 134, 'DEBUG（M6-B 新スキル）', { fontSize: '11px', color: '#80deea' }).setScrollFactor(0).setOrigin(0.5));
    const newIds = ['flame_lance', 'scatter_flame', 'homing_wisp', 'chain_flame', 'lava_bomb', 'flame_vortex', 'fire_spirit', 'phoenix_feather', 'flame_barrier', 'detonation_mark'];
    const acts = [
      ['新10種を全取得(Lv1)', () => { for (const id of newIds) this.skills.acquireOrLevel(id); this.updateHudSkills(); }],
      ['新10種を全Lv8', () => { for (const id of newIds) { this.skills.acquireOrLevel(id); this.skills.setLevel(id, 8); } this.updateHudSkills(); }],
      ['進化条件を全達成(補助passive含む)', () => this.debugSetupEvolutions()],
      ['不死鳥を使用可能に', () => { if (this.player._phoenix) { this.player._phoenix.ready = true; this.player._phoenix.cdLeft = 0; } }],
      ['不死鳥の致死テスト', () => { this.player.hp = 1; this.player._invulnUntil = 0; this.player.takeDamage(9999); }],
      ['障壁を即展開', () => { const s = this.skills.skills.get('flame_barrier'); if (s) { s._state.active = true; s._state.durLeft = 3000; s._state.hitsLeft = 5; s._state.cdLeft = 0; } }],
      ['敵+100体', () => this.debugSpawnEnemies(100)],
      ['敵を密集配置+40', () => this.debugClusterEnemies(40)],
      [() => `状態: 刻印${this.markedEnemyCount()} 弾${this.projPool.activeCount} 抑制/f${(this._mLast || this._m).suppressed}`, () => {}],
    ];
    let yy = GAME_HEIGHT / 2 - 110;
    for (const [label, fn] of acts) {
      const text = typeof label === 'function' ? label() : label;
      const b = this.add.text(cx, yy, text, { fontSize: '10px', color: '#fff', backgroundColor: '#1a3a3e', padding: { x: 6, y: 2 } }).setScrollFactor(0).setOrigin(0.5).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => { fn(); if (this._skdbg) this.toggleSkillDebug(); });
      ui.add(b); yy += 22;
    }
    const close = this.add.text(cx, yy + 4, '閉じる (F4)', { fontSize: '9px', color: '#bcaaa4' }).setScrollFactor(0).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleSkillDebug());
    ui.add(close);
    this._skdbg = ui;
  }

  // ---------------- 個別スキル検証ツール（M6-C・?debug=1・F5） ----------------
  // 複数スキルが同時強化されると挙動が見づらいため、1スキルを単独化し、各補正を一時無効化して検証する。
  // すべてデバッグ中のランタイムにのみ適用し、profile の購入済み強化・熟練度は削除・保存しない。
  toggleSkillTuner() {
    this.markDebugRun(); // M6-F: デバッグ補正の使用でこの周回を通常統計から除外
    if (this._sktuner) { this._sktuner.destroy(true); this._sktuner = null; return; }
    this._tuner = this._tuner || { skill: 'fireball', jobLevel: null, noPassive: false, noPerm: false, noMastery: false, noJob: false };
    const JOB_LEVELS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const cx = GAME_WIDTH / 2;
    const ui = this.add.container(0, 0).setScrollFactor(0).setDepth(4000);
    ui.add(this.add.rectangle(cx, GAME_HEIGHT / 2, 460, 350, 0x0d1017, 0.97).setScrollFactor(0).setStrokeStyle(1, 0x80deea));
    ui.add(this.add.text(cx, 8, 'DEBUG（M6-C 個別スキル検証・F5）', { fontSize: '11px', color: '#80deea' }).setScrollFactor(0).setOrigin(0.5, 0));

    const cycleSkill = () => {
      const ids = DataManager.skills.map((s) => s.id);
      const i = ids.indexOf(this._tuner.skill);
      this._tuner.skill = ids[(i + 1) % ids.length];
    };
    const acts = [
      [() => `検証スキル: ${this._tuner.skill}（切替）`, () => { cycleSkill(); }],
      ['このスキルだけ残す(他active削除)', () => this._tunerIsolate()],
      ['このスキルを取得', () => { this.skills.acquireOrLevel(this._tuner.skill); this.updateHudSkills(); }],
      ['Lv +1', () => { const s = this.skills.skills.get(this._tuner.skill); if (s) this.skills.setLevel(this._tuner.skill, Math.min(8, s.level + 1)); this.updateHudSkills(); }],
      ['Lv -1', () => { const s = this.skills.skills.get(this._tuner.skill); if (s) this.skills.setLevel(this._tuner.skill, Math.max(1, s.level - 1)); this.updateHudSkills(); }],
      ['Lv8にする', () => { this.skills.acquireOrLevel(this._tuner.skill); this.skills.setLevel(this._tuner.skill, 8); this.updateHudSkills(); }],
      ['このスキルを単独進化', () => this._tunerEvolve()],
      [() => `Job Lv一時適用: ${this._tuner.jobLevel ?? '実際'}（切替）`, () => { const i = JOB_LEVELS.indexOf(this._tuner.jobLevel); this._tuner.jobLevel = JOB_LEVELS[(i + 1) % JOB_LEVELS.length]; this._tuner.noJob = false; this._applyTuner(); }],
      [() => `ジョブ補正: ${this._tuner.noJob ? '無効' : '有効'}`, () => { this._tuner.noJob = !this._tuner.noJob; this._applyTuner(); }],
      [() => `熟練度補正: ${this._tuner.noMastery ? '無効' : '有効'}`, () => { this._tuner.noMastery = !this._tuner.noMastery; this._applyTuner(); }],
      [() => `パッシブ: ${this._tuner.noPassive ? '無効' : '有効'}`, () => { this._tuner.noPassive = !this._tuner.noPassive; this._applyTuner(); }],
      [() => `残り火/魂炎の火力: ${this._tuner.noPerm ? '無効' : '有効'}`, () => { this._tuner.noPerm = !this._tuner.noPerm; this._applyTuner(); }],
      ['敵をHP弱体化(即確認)', () => this.enemyPool.forEachActive((e) => { if (e.alive) e.hp = Math.max(1, e.hp * 0.1); })],
      ['敵+40密集 / 敵全滅', () => { this.debugClusterEnemies(40); }],
      ['残響を次発動で強制', () => this._tunerForceEcho()],
      ['通常状態へ戻す', () => { this._tuner = { skill: this._tuner.skill, jobLevel: null, noPassive: false, noPerm: false, noMastery: false, noJob: false }; this._applyTuner(); }],
    ];
    let yy = 26;
    for (const [label, fn] of acts) {
      const text = typeof label === 'function' ? label() : label;
      const b = this.add.text(cx - 218, yy, text, { fontSize: '9px', color: '#fff', backgroundColor: '#1a3a3e', padding: { x: 5, y: 1 } }).setScrollFactor(0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => { fn(); this.toggleSkillTuner(); this.toggleSkillTuner(); }); // 再描画
      ui.add(b); yy += 15;
    }
    // 最終 modifier / 計算内訳の表示
    ui.add(this.add.text(cx + 6, 26, this._tunerReport(), { fontSize: '8px', color: '#b2ff59', lineSpacing: 2, wordWrap: { width: 214 } }).setScrollFactor(0).setOrigin(0, 0));
    const close = this.add.text(cx, GAME_HEIGHT - 12, '閉じる (F5)', { fontSize: '9px', color: '#bcaaa4' }).setScrollFactor(0).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleSkillTuner());
    ui.add(close);
    this._sktuner = ui;
  }

  _tunerIsolate() {
    const keep = this._tuner.skill;
    for (const id of Array.from(this.skills.skills.keys())) if (id !== keep) { const sk = this.skills.skills.get(id); if (sk && sk.destroy) sk.destroy(); this.skills.skills.delete(id); }
    this.skills.acquireOrLevel(keep);
    this.updateHudSkills();
  }

  _tunerEvolve() {
    const base = this.skills.baseActiveIds().find((b) => b === this._tuner.skill) || this._tuner.skill;
    this.skills.acquireOrLevel(base); this.skills.setLevel(base, 8);
    const evoId = this.skills.evolve(base);
    if (evoId) this._tuner.skill = evoId;
    this.updateHudSkills();
  }

  _tunerForceEcho() {
    if (!this.jobMods.echoEnabled()) return;
    const sk = this.skills.skills.get(this._tuner.skill) || this.skills.skills.values().next().value;
    if (sk) this._triggerEcho(sk);
  }

  // デバッグ用の一時無効化/一時ジョブLvを適用する（profile は変更しない）。
  _applyTuner() {
    const t = this._tuner;
    // ジョブ補正: 無効 or 一時Lv or 実際の凍結値。
    if (t.noJob) this.jobMods.setResolved(JobModifierManager.identity());
    else if (t.jobLevel != null) this.jobMods.setResolved(JobModifierManager.resolve(DataManager.getJobProgression(this.jobId), t.jobLevel));
    else this.jobMods.setResolved(this.resolvedJobModifiers);
    this.draft.setRarityWeightMult({ rare: this.jobMods.rarityWeightMult('rare'), legendary: this.jobMods.rarityWeightMult('legendary') });
    // 熟練度補正。
    this.skills.setMasteryBonuses(t.noMastery ? null : this.masteryBonus);
    // 残り火/魂炎の火力（bonus.damageMult）。
    if (this._realDamageMult == null) this._realDamageMult = this.bonus.damageMult;
    this.bonus.damageMult = t.noPerm ? 1 : this._realDamageMult;
    // パッシブ（レベルを退避/復元。profile は不変）。
    if (t.noPassive) {
      if (!this._passiveBackup) { this._passiveBackup = this.passives.serialize(); for (const id of Object.keys(this._passiveBackup)) this.passives.setLevel(id, 0); }
    } else if (this._passiveBackup) {
      this.passives.loadFrom(this._passiveBackup); this._passiveBackup = null;
    }
    // スキルの stats キャッシュを破棄（補正変更を即反映）。
    for (const sk of this.skills.skills.values()) sk._cache = null;
  }

  _tunerReport() {
    const t = this._tuner;
    const id = t.skill;
    const sk = this.skills.skills.get(id);
    const jm = this.jobMods.resolved;
    const L = [`Job Lv(適用): ${this.jobMods.jobLevel}`];
    L.push(`火Dmg×${jm.fireDamageMult.toFixed(3)} DoT×${jm.dotDamageMult.toFixed(3)}`);
    L.push(`爆発Dmg×${jm.explosionDamageMult.toFixed(2)} 進化×${jm.evolvedDamageMult.toFixed(2)}`);
    L.push(`範囲×${jm.fireAreaMult.toFixed(3)} 爆範×${jm.explosionAreaMult.toFixed(2)}`);
    L.push(`CD×${jm.cooldownMult.toFixed(3)} 弾速×${jm.projectileSpeedMult.toFixed(2)}`);
    L.push(`発射数+${jm.projectileCountBonus} rare×${jm.rareWeightMult} leg×${jm.legendaryWeightMult}`);
    L.push(`残響: ${this.jobMods.echoEnabled() ? `${this.jobMods.echoInterval()}回/威力${this.jobMods.echoPower()}` : '無効'} 現${this.jobMods.echoCount()}`);
    L.push(`—— ${id} ——`);
    if (sk && sk.stats) {
      const s = sk.stats;
      const dtags = { element: 'fire', isEvolved: !!DataManager.getEvolution(id) };
      const jmul = this.jobMods.damageMultiplier(dtags);
      const pmul = this.passives ? this.passives.getDamageMultiplier() : 1;
      if (s.damage != null) L.push(`Dmg 基礎${(sk.rawStats?.damage ?? s.damage).toFixed?.(0) || s.damage}→実効${(s.damage * (this.bonus.damageMult || 1) * pmul * jmul).toFixed(1)}`);
      if (s.cooldown != null) L.push(`CD ${Math.round(s.cooldown * sk.passiveCooldownMult())}ms`);
      if (s.radius != null) L.push(`範囲 ${Math.round(s.radius)}`);
      if (s.explosionRadius != null) L.push(`爆発範囲 ${Math.round(s.explosionRadius)}`);
    } else if (sk) {
      L.push('(進化/常時型: 内訳は挙動で確認)');
    } else L.push('(未取得)');
    L.push(`無効: ${[t.noJob && 'ジョブ', t.noMastery && '熟練', t.noPassive && 'passive', t.noPerm && '恒久火力'].filter(Boolean).join('/') || 'なし'}`);
    return L.join('\n');
  }

  // ---------------- 新スキル検証（M6-D・?debug=1・F6） ----------------
  // F1〜F5 と競合しない。新 active10種・新進化5種・複製/吸収/ダッシュ・上限到達を確認する。
  // すべてランタイムのみ。profile は破壊・保存しない。
  toggleWave2Debug() {
    this.markDebugRun(); // M6-F: デバッグ補正の使用でこの周回を通常統計から除外
    if (this._w2dbg) { this._w2dbg.destroy(true); this._w2dbg = null; return; }
    this._w2 = this._w2 || { skill: 'scorching_ray', jobLevel: null };
    const NEW = ['scorching_ray', 'ember_minefield', 'flame_crescent', 'ricochet_ember', 'ash_doppelganger', 'bloodfire_pact', 'bullet_furnace', 'four_sided_inferno', 'molten_chains', 'blazing_step'];
    const JOBLV = [1, 50, 80, 100];
    const cx = GAME_WIDTH / 2;
    const ui = this.add.container(0, 0).setScrollFactor(0).setDepth(4000);
    ui.add(this.add.rectangle(cx, GAME_HEIGHT / 2, 470, 350, 0x0d1017, 0.97).setScrollFactor(0).setStrokeStyle(1, 0x80deea));
    ui.add(this.add.text(cx, 6, 'DEBUG（M6-D 新スキル・F6）', { fontSize: '11px', color: '#80deea' }).setScrollFactor(0).setOrigin(0.5, 0));
    const acts = [
      [() => `検証スキル: ${this._w2.skill}（切替）`, () => { const i = NEW.indexOf(this._w2.skill); this._w2.skill = NEW[(i + 1) % NEW.length]; }],
      ['取得 / Lv+1 / Lv8', () => { const s = this.skills.skills.get(this._w2.skill); if (!s) this.skills.acquireOrLevel(this._w2.skill); else this.skills.setLevel(this._w2.skill, Math.min(8, s.level + 1)); this.updateHudSkills(); }],
      ['このスキルをLv8で単独化', () => { for (const id of Array.from(this.skills.skills.keys())) if (id !== this._w2.skill) { const k = this.skills.skills.get(id); if (k && k.destroy) k.destroy(); this.skills.skills.delete(id); } this.skills.acquireOrLevel(this._w2.skill); this.skills.setLevel(this._w2.skill, 8); this.updateHudSkills(); }],
      ['進化条件を全達成(補助含む)', () => this.debugSetupWave2Evolutions()],
      [() => `Job Lv一時適用: ${this._w2.jobLevel ?? '実際'}（切替）`, () => { const i = JOBLV.indexOf(this._w2.jobLevel); this._w2.jobLevel = JOBLV[(i + 1) % JOBLV.length]; this.jobMods.setResolved(JobModifierManager.resolve(DataManager.getJobProgression(this.jobId), this._w2.jobLevel)); }],
      ['吸収可能なボス弾を8発生成', () => { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; this.bossBulletPool.spawn(this.player.x + Math.cos(a) * 90, this.player.y + Math.sin(a) * 90, a + Math.PI, 60, { hostile: true, damage: 5, absorbable: true, absorbValue: 1, projectileKind: 'bossBullet' }); } }],
      ['吸収不能なボス弾を4発生成', () => { for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; this.bossBulletPool.spawn(this.player.x + Math.cos(a) * 90, this.player.y + Math.sin(a) * 90, a + Math.PI, 60, { hostile: true, damage: 8, absorbable: false, isBeam: true, projectileKind: 'beam' }); } }],
      ['分身の複製を次発動で強制', () => this.performClone(0.5)],
      ['チャージ系を最大化(炉/歩法)', () => this.debugMaxCharges()],
      ['敵+40密集 / 敵HP弱体化', () => { this.debugClusterEnemies(40); this.enemyPool.forEachActive((e) => { if (e.alive) e.hp = Math.max(1, e.hp * 0.1); }); }],
      ['通常状態へ戻す', () => { this._w2.jobLevel = null; this.jobMods.setResolved(this.resolvedJobModifiers); }],
    ];
    let yy = 24;
    for (const [label, fn] of acts) {
      const text = typeof label === 'function' ? label() : label;
      const b = this.add.text(cx - 224, yy, text, { fontSize: '9px', color: '#fff', backgroundColor: '#1a3a3e', padding: { x: 5, y: 1 } }).setScrollFactor(0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => { fn(); this.toggleWave2Debug(); this.toggleWave2Debug(); });
      ui.add(b); yy += 15;
    }
    ui.add(this.add.text(cx + 8, 24, this._wave2Report(), { fontSize: '8px', color: '#b2ff59', lineSpacing: 2, wordWrap: { width: 214 } }).setScrollFactor(0).setOrigin(0, 0));
    const close = this.add.text(cx, GAME_HEIGHT - 12, '閉じる (F6)', { fontSize: '9px', color: '#bcaaa4' }).setScrollFactor(0).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleWave2Debug());
    ui.add(close);
    this._w2dbg = ui;
  }

  debugSetupWave2Evolutions() {
    const setup = [['scorching_ray', 'swift_cast'], ['ember_minefield', 'detonation_mark'], ['flame_crescent', 'flame_barrier'], ['ash_doppelganger', 'fire_spirit'], ['bullet_furnace', 'phoenix_feather']];
    for (const [base, aux] of setup) {
      this.skills.acquireOrLevel(base); this.skills.setLevel(base, 8);
      if (DataManager.getPassive(aux)) { this.passives.acquireOrLevel(aux); this.passives.setLevel(aux, 4); }
      else { this.skills.acquireOrLevel(aux); this.skills.setLevel(aux, 4); }
    }
    this.updateHudSkills();
  }

  // チャージ系スキルの runtimeState を最大化する（field名に依存せず charge を含むキーを増やす）。
  debugMaxCharges() {
    for (const sk of this.skills.skills.values()) {
      if (!sk.serializeState || !sk.restoreState) continue;
      const st = sk.serializeState(); if (!st || typeof st !== 'object') continue;
      let changed = false;
      for (const k of Object.keys(st)) if (/charge/i.test(k) && typeof st[k] === 'number') { st[k] = 99; changed = true; }
      if (changed) sk.restoreState(st);
    }
  }

  _wave2Report() {
    const L = [];
    const last = this.lastClonableCast();
    L.push(`複製元: ${last ? last.skillId : 'なし'}`);
    L.push(`castCtx: ${this._castCtx ? `${this._castCtx.origin}/g${this._castCtx.generation}` : 'normal'}`);
    L.push(`残響: ${this.jobMods.echoEnabled() ? `${this.jobMods.echoInterval()}回` : '無効'} 現${this.jobMods.echoCount()}`);
    L.push(`刻印${this.markedEnemyCount()} 味方弾${this.projPool.activeCount} 敵弾${this.bossBulletPool.activeCount}`);
    L.push(`抑制/f ${(this._mLast || this._m).suppressed}`);
    L.push('— 所持新スキル runtime —');
    for (const id of ['scorching_ray', 'ember_minefield', 'ash_doppelganger', 'bloodfire_pact', 'bullet_furnace', 'blazing_step', 'molten_chains']) {
      const sk = this.skills.skills.get(id);
      if (sk && sk.serializeState) { const st = sk.serializeState(); if (st) L.push(`${id}: ${JSON.stringify(st).slice(0, 40)}`); }
    }
    return L.join('\n');
  }

  // ---------------- 新スキル検証（M6-E・?debug=1・F7） ----------------
  // F1〜F6 と競合しない。新 active5種・新進化5種・死亡位置/墓標/共鳴/炉心熱量・監査一覧を確認する。
  // すべてランタイムのみ。profile は破壊・保存しない。
  toggleWave3Debug() {
    this.markDebugRun(); // M6-F: デバッグ補正の使用でこの周回を通常統計から除外
    if (this._w3dbg) { this._w3dbg.destroy(true); this._w3dbg = null; return; }
    this._w3 = this._w3 || { skill: 'funeral_pyres', view: 'policy' };
    const NEW = ['funeral_pyres', 'magma_vein', 'tri_flame_array', 'scorching_resonance', 'core_overdrive'];
    const EVO = [['funeral_pyres', 'phoenix_feather'], ['magma_vein', 'burning_trail'], ['tri_flame_array', 'flame_vortex'], ['scorching_resonance', 'chain_flame'], ['core_overdrive', 'bloodfire_pact']];
    const cx = GAME_WIDTH / 2;
    const ui = this.add.container(0, 0).setScrollFactor(0).setDepth(4000);
    ui.add(this.add.rectangle(cx, GAME_HEIGHT / 2, 500, 356, 0x0d1017, 0.97).setScrollFactor(0).setStrokeStyle(1, 0x80deea));
    ui.add(this.add.text(cx, 4, 'DEBUG（M6-E 新スキル・監査・F7）', { fontSize: '11px', color: '#80deea' }).setScrollFactor(0).setOrigin(0.5, 0));
    const redraw = () => { this.toggleWave3Debug(); this.toggleWave3Debug(); };
    const acts = [
      [() => `検証スキル: ${this._w3.skill}（切替）`, () => { const i = NEW.indexOf(this._w3.skill); this._w3.skill = NEW[(i + 1) % NEW.length]; }],
      ['取得 / Lv+1 / Lv8', () => { const s = this.skills.skills.get(this._w3.skill); if (!s) this.skills.acquireOrLevel(this._w3.skill); else this.skills.setLevel(this._w3.skill, Math.min(8, s.level + 1)); this.updateHudSkills(); }],
      ['このスキルをLv8で単独化', () => { for (const id of Array.from(this.skills.skills.keys())) if (id !== this._w3.skill) { const k = this.skills.skills.get(id); if (k && k.destroy) k.destroy(); this.skills.skills.delete(id); } this.skills.acquireOrLevel(this._w3.skill); this.skills.setLevel(this._w3.skill, 8); this.updateHudSkills(); }],
      ['選択スキルの進化条件を達成', () => this.debugSetupWave3Evolution(this._w3.skill)],
      ['死亡イベントを指定位置に5生成', () => this.debugSpawnDeaths(5)],
      ['敵+30密集 / 弱体化', () => { this.debugClusterEnemies(30); this.enemyPool.forEachActive((e) => { if (e.alive) e.hp = Math.max(1, e.hp * 0.1); }); }],
      ['敵へ炎上を一括付与', () => { let n = 0; this.enemyPool.forEachActive((e) => { if (e.alive) { this.igniteEnemy(e, 3000, 0); n++; } }); if (this.boss && this.boss.alive) this.boss.ignite(3000, 0); }],
      ['炎上を一括解除', () => { this.enemyPool.forEachActive((e) => { e._igniteUntil = 0; this.unregisterBurning(e); }); if (this.boss) this.boss._igniteUntil = 0; }],
      [() => `炉心熱量: ${this._w3.heat ?? 0}% 設定（切替）`, () => { const seq = [0, 25, 50, 75, 100]; this._w3.heat = seq[((seq.indexOf(this._w3.heat ?? 0) + 1) % seq.length)]; this.debugSetHeat(this._w3.heat / 100); }],
      ['オーバーヒート開始 / 解除', () => this.debugToggleOverheat()],
      ['終末状態を開始(終末炉心)', () => this.debugStartDoom()],
      [() => `監査表示: ${this._w3.view}（切替）`, () => { const v = ['policy', 'clone', 'lv80', 'tag']; this._w3.view = v[(v.indexOf(this._w3.view) + 1) % v.length]; }],
      ['通常状態へ戻す', () => { this._w3.heat = 0; this.jobMods.setResolved(this.resolvedJobModifiers); }],
    ];
    let yy = 22;
    for (const [label, fn] of acts) {
      const text = typeof label === 'function' ? label() : label;
      const b = this.add.text(cx - 244, yy, text, { fontSize: '9px', color: '#fff', backgroundColor: '#1a3a3e', padding: { x: 5, y: 1 } }).setScrollFactor(0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => { fn(); redraw(); });
      ui.add(b); yy += 15;
    }
    ui.add(this.add.text(cx + 4, 22, this._wave3Report(), { fontSize: '8px', color: '#b2ff59', lineSpacing: 2, wordWrap: { width: 240 } }).setScrollFactor(0).setOrigin(0, 0));
    const close = this.add.text(cx, GAME_HEIGHT - 10, '閉じる (F7)', { fontSize: '9px', color: '#bcaaa4' }).setScrollFactor(0).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleWave3Debug());
    ui.add(close);
    this._w3dbg = ui;
  }

  // 選択した新 active の進化条件（基礎Lv8＋補助スキル/パッシブLv4）を満たす。
  debugSetupWave3Evolution(baseId) {
    const map = { funeral_pyres: 'phoenix_feather', magma_vein: 'burning_trail', tri_flame_array: 'flame_vortex', scorching_resonance: 'chain_flame', core_overdrive: 'bloodfire_pact' };
    const aux = map[baseId]; if (!aux) return;
    this.skills.acquireOrLevel(baseId); this.skills.setLevel(baseId, 8);
    if (DataManager.getPassive(aux)) { this.passives.acquireOrLevel(aux); this.passives.setLevel(aux, 4); }
    else { this.skills.acquireOrLevel(aux); this.skills.setLevel(aux, 4); }
    this.updateHudSkills();
  }

  // 死亡イベントをプレイヤー周囲へ生成する（墓標系の確認用）。死亡履歴を要求していないスキルには影響しない。
  debugSpawnDeaths(n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const fake = { x: this.player.x + Math.cos(a) * 70, y: this.player.y + Math.sin(a) * 70, def: { id: 'slime' }, isElite: false, isBoss: false };
      const prevTrackers = this._deathTrackers;
      if (prevTrackers <= 0) this._deathTrackers = 1; // 一時的に記録を許可（墓標未所持でも確認できる）
      this._recordDeathEvent(fake, 'debug');
      this._deathTrackers = prevTrackers;
    }
  }

  // 炉心暴走/終末炉心の熱量を割合で設定（serializeState/restoreState 経由・状態を破壊しない）。
  debugSetHeat(frac) {
    for (const id of ['core_overdrive', 'doomsday_core']) {
      const sk = this.skills.skills.get(id);
      if (!sk || !sk.serializeState || !sk.restoreState) continue;
      const st = sk.serializeState(); if (!st || typeof st.heat !== 'number') continue;
      const maxH = (sk.stats?.maxHeat) || (sk.evoDef?.overheat?.maxHeat) || 150;
      st.heat = Math.round(maxH * frac); st.overheatLeft = 0;
      sk.restoreState(st);
    }
  }

  debugToggleOverheat() {
    for (const id of ['core_overdrive', 'doomsday_core']) {
      const sk = this.skills.skills.get(id);
      if (!sk || !sk.serializeState || !sk.restoreState) continue;
      const st = sk.serializeState(); if (!st || typeof st.overheatLeft !== 'number') continue;
      st.overheatLeft = st.overheatLeft > 0 ? 0 : 1800;
      sk.restoreState(st);
    }
  }

  debugStartDoom() {
    const sk = this.skills.skills.get('doomsday_core');
    if (!sk || !sk.serializeState || !sk.restoreState) return;
    const st = sk.serializeState(); if (!st) return;
    if ('doomLeft' in st) { st.doomLeft = 2000; sk.restoreState(st); }
  }

  _wave3Report() {
    const L = [];
    const v = this._w3.view;
    if (v === 'policy' || v === 'clone') {
      L.push(v === 'policy' ? '— echoPolicy 一覧(active30) —' : '— clonePolicy 一覧(active30) —');
      const acts = DataManager.skills.filter((s) => s.category === 'active').sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
      for (const s of acts) L.push(`${(s.displayOrder || 0)}.${s.id}: ${v === 'policy' ? echoStatus(s) : cloneStatus(s)}`);
    } else if (v === 'lv80') {
      L.push('— Job Lv80 発射数+1 対象 —');
      for (const s of DataManager.skills) if (s.category === 'active' && appliesLv80ProjectileCount(s)) L.push(`+ ${s.id}`);
      L.push('（上記以外の active/進化は対象外）');
    } else {
      L.push('— 最後のダメージタグ —');
      const di = this._lastDamageInfo;
      if (di) { L.push(`skill: ${di.skillId}`); L.push(`elem:${di.tags.element} DoT:${di.tags.isDoT} 爆:${di.tags.isExplosion} 進:${di.tags.isEvolved}`); L.push(`echo×${(di.echo || 1)}`); }
      else L.push('(まだダメージなし)');
    }
    L.push('———');
    L.push(`複製元:${(this.lastClonableCast() || {}).skillId || 'なし'} 炎上:${this.burningCount()}`);
    L.push(`死亡履歴:${this._deathEvents.length} castCtx:${this._castCtx ? this._castCtx.origin + '/g' + this._castCtx.generation : 'normal'}`);
    L.push(`残響:${this.jobMods.echoEnabled() ? this.jobMods.echoInterval() + '回' : '無効'}現${this.jobMods.echoCount()} 抑制/f:${(this._mLast || this._m).suppressed}`);
    const heat = this.skills.skills.get('core_overdrive') || this.skills.skills.get('doomsday_core');
    if (heat && heat.serializeState) { const st = heat.serializeState(); if (st && 'heat' in st) L.push(`炉心:${JSON.stringify(st).slice(0, 46)}`); }
    return L.join('\n');
  }

  // ---------------- 状態異常・氷術師検証（M7-A・?debug=1・F9） ----------------
  // 既存 F1〜F8 と競合しない。冷気/凍結/耐性/粉砕/ボス氷砕・氷術師 Job Lv/スキル/進化を確認する。
  // すべてランタイムのみ。profile は破壊・保存しない（デバッグ操作でこの周回は debugRun）。
  _debugNearestEnemy() {
    let best = null, bd = Infinity;
    this.enemyPool.forEachActive((e) => { if (!e.alive) return; const d = distance(this.player.x, this.player.y, e.x, e.y); if (d < bd) { bd = d; best = e; } });
    return best;
  }

  toggleFrostDebug() {
    this.markDebugRun();
    if (this._frostdbg) { this._frostdbg.destroy(true); this._frostdbg = null; return; }
    this._fd = this._fd || { skill: 'frost_shard', passive: 'frost_amplification', lv: 8, chill: 100, jobLv: 100 };
    // M7-B: 氷術師 active15種・進化8種すべてを F9 で検証できる（新10active・新5進化を含む）。
    const ACT = ['frost_shard', 'frost_nova', 'glacial_lance', 'permafrost_field', 'ice_wall',
      'icicle_volley', 'frost_orbit', 'freezing_ray', 'hailstorm', 'cryo_mine', 'frost_spirit', 'ice_prison', 'avalanche', 'mirror_ice', 'glacier_drop'];
    const PAS = ['frost_amplification', 'rapid_freezing', 'frozen_expansion', 'lingering_cold'];
    const EVO = {
      frost_shard: ['diamond_blizzard', 'rapid_freezing'], frost_nova: ['absolute_zero_domain', 'frozen_expansion'], glacial_lance: ['heaven_piercing_glacier', 'frost_amplification'],
      icicle_volley: ['crystal_tempest', 'frost_amplification'], freezing_ray: ['absolute_zero_ray', 'rapid_freezing'], hailstorm: ['whiteout_cataclysm', 'lingering_cold'],
      frost_spirit: ['frost_queen_court', 'frozen_expansion'], avalanche: ['world_end_avalanche', 'ice_wall'],
    };
    const cx = GAME_WIDTH / 2;
    const ui = this.add.container(0, 0).setScrollFactor(0).setDepth(4000);
    ui.add(this.add.rectangle(cx, GAME_HEIGHT / 2, 512, 356, 0x08131a, 0.97).setScrollFactor(0).setStrokeStyle(1, 0x4fc3f7));
    ui.add(this.add.text(cx, 4, 'DEBUG（M7-A/B 状態異常・氷術師 active15/進化8・F9）', { fontSize: '11px', color: '#4fc3f7' }).setScrollFactor(0).setOrigin(0.5, 0));
    const redraw = () => { this.toggleFrostDebug(); this.toggleFrostDebug(); };
    const applyFrostJob = (lv) => { this.jobMods.setResolved(JobModifierManager.resolve(DataManager.getJobProgression('frost_mage'), lv)); this._applyFreezeThresholdMods(); this._refreshStatusPassives(); };
    const acts = [
      [() => `氷術師 Job Lv: ${this._fd.jobLv}（切替・補正適用）`, () => { const seq = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]; this._fd.jobLv = seq[(seq.indexOf(this._fd.jobLv) + 1) % seq.length]; applyFrostJob(this._fd.jobLv); }],
      [() => `検証active: ${this._fd.skill}（切替）`, () => { const i = ACT.indexOf(this._fd.skill); this._fd.skill = ACT[(i + 1) % ACT.length]; }],
      [() => `Lv: ${this._fd.lv}（切替）`, () => { this._fd.lv = this._fd.lv >= 8 ? 1 : this._fd.lv + 1; }],
      ['選択activeを取得/そのLvへ', () => { this.skills.acquireOrLevel(this._fd.skill); this.skills.setLevel(this._fd.skill, this._fd.lv); this.updateHudSkills(); }],
      ['選択activeの進化条件を達成', () => { const e = EVO[this._fd.skill]; if (!e) return; this.skills.acquireOrLevel(this._fd.skill); this.skills.setLevel(this._fd.skill, 8); const aux = e[1]; if (DataManager.getSkill(aux)) { this.skills.acquireOrLevel(aux); this.skills.setLevel(aux, 4); } else { this.passives.acquireOrLevel(aux); this.passives.setLevel(aux, 4); } this._refreshStatusPassives(); this.updateHudSkills(); }],
      [() => `検証passive: ${this._fd.passive}（切替）`, () => { const i = PAS.indexOf(this._fd.passive); this._fd.passive = PAS[(i + 1) % PAS.length]; }],
      ['選択passive Lv+1', () => { this.passives.acquireOrLevel(this._fd.passive); this._refreshStatusPassives(); this.updateHudSkills(); }],
      [() => `最寄り敵へ冷気 ${this._fd.chill}（切替付与）`, () => { const seq = [0, 25, 50, 75, 100]; this._fd.chill = seq[(seq.indexOf(this._fd.chill) + 1) % seq.length]; const e = this._debugNearestEnemy(); if (e) { e._chill = this._fd.chill; e._chillSlow = this.freezeSys.slowFactor(this.statusFx.entityType(e), e._chill); if (e._chill > 0) this.statusFx.register('chill', e); } }],
      ['最寄り敵を確定凍結', () => { const e = this._debugNearestEnemy(); if (e) { e._freezeImmuneUntil = 0; this.statusFx.freeze(e); } }],
      ['最寄り敵へ凍結耐性 / 解除', () => { const e = this._debugNearestEnemy(); if (e) { if (this.statusFx.isFreezeImmune(e)) { e._freezeImmuneUntil = 0; this.statusFx.unregister('freeze_immunity', e); } else { e._freezeImmuneUntil = this.time.now + 1500; this.statusFx.register('freeze_immunity', e); } } }],
      ['最寄り敵を凍結解除', () => { const e = this._debugNearestEnemy(); if (e) this.statusFx.unfreeze(e, { immunity: false }); }],
      ['最寄り敵を粉砕', () => { const e = this._debugNearestEnemy(); if (e) { if (!this.statusFx.isFrozen(e)) this.statusFx.freeze(e); this.shatterEnemy(e, { skillId: 'frost_shard', multiplier: 1 }); } }],
      ['エリート×3を密集生成', () => { this.debugClusterEnemies(3); this.enemyPool.forEachActive((e) => { if (e.alive) { e.isElite = true; e.maxHp = e.maxHp * 4; e.hp = e.maxHp; e.setScale(1.15); } }); }],
      ['ボス出現 / 氷砕ゲージ50% / 100%', () => { if (!this.boss || !this.boss.alive) { this.spawnBoss(); this.bossSpawned = true; } if (this.boss) { const th = this.statusFx.bossThreshold(this.boss); this.boss._frostGauge = this.boss._frostGauge < th * 0.5 ? th * 0.5 : (this.boss._frostGauge < th ? th : 0); } }],
      ['ボス氷砕を強制発生', () => { if (this.boss && this.boss.alive) { const ev = this.statusFx.frostbreak(this.boss); if (ev) this._onBossFrostbreak(ev, null); } }],
      ['全状態異常を解除', () => { this.enemyPool.forEachActive((e) => { if (e.alive) this.statusFx.clearEntity(e); }); if (this.boss) this.statusFx.clearEntity(this.boss); }],
      ['通常状態へ戻す（補正リセット）', () => { this.jobMods.setResolved(this.resolvedJobModifiers); this._applyFreezeThresholdMods(); }],
    ];
    let yy = 20;
    for (const [label, fn] of acts) {
      const text = typeof label === 'function' ? label() : label;
      const b = this.add.text(cx - 252, yy, text, { fontSize: '8px', color: '#fff', backgroundColor: '#123642', padding: { x: 4, y: 1 } }).setScrollFactor(0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => { fn(); redraw(); });
      ui.add(b); yy += 14.5;
    }
    ui.add(this.add.text(cx + 8, 20, this._frostReport(), { fontSize: '8px', color: '#b2ebf2', lineSpacing: 2, wordWrap: { width: 236 } }).setScrollFactor(0).setOrigin(0, 0));
    const close = this.add.text(cx, GAME_HEIGHT - 10, '閉じる (F9)', { fontSize: '9px', color: '#bcaaa4' }).setScrollFactor(0).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleFrostDebug());
    ui.add(close);
    this._frostdbg = ui;
  }

  _frostReport() {
    const L = [];
    const sfx = this.statusFx, jm = this.jobMods;
    L.push(`ジョブ: ${this.jobId} 属性: ${this._defaultElement || 'なし'}`);
    L.push('— Job補正 —');
    L.push(`属性Dmg×${(jm.damageMultiplier({ element: this._defaultElement })).toFixed(3)} 冷気×${jm.statusPowerMult().toFixed(3)} 粉砕×${jm.shatterDamageMult().toFixed(3)}`);
    L.push(`進化×${jm.resolved.evolvedDamageMult.toFixed(2)} CD×${jm.cooldownMult().toFixed(3)} 発射+${jm.projectileCountBonus()}`);
    const az = jm.absoluteZero();
    L.push(`Lv40狩り chilled×${jm.resolved.chilledDamageMult.toFixed(2)}/frozen×${jm.resolved.frozenDamageMult.toFixed(2)}  Lv50連鎖:${jm.shatterOnFrozenKill() ? '有' : '無'} Lv100絶対零度:${az ? '有' : '無'}`);
    L.push('— 状態異常索引 —');
    L.push(`炎上${sfx.countStatus('burning')} 冷気${sfx.countStatus('chill')} 凍結${sfx.countStatus('frozen')} 耐性${sfx.countStatus('freeze_immunity')} 脆弱${sfx.countStatus('frostbreak_vulnerability')}`);
    const rng = sfx.rng.serialize();
    L.push(`状態RNG seed:${rng.seed} cursor:${rng.cursor}`);
    L.push('— 最寄り敵 —');
    const e = this._debugNearestEnemy();
    if (e) {
      const t = sfx.entityType(e);
      const def = DataManager.getSkill(this._fd.skill) || {};
      const proc = def.procCoefficient != null ? def.procCoefficient : 1;
      const base = (def.levels && def.levels[this._fd.lv - 1] && def.levels[this._fd.lv - 1].baseFreezeChance) || 0;
      const fc = this.freezeSys.computeFreezeChance(t, { baseFreezeChance: base, procCoefficient: proc, chill: sfx.chillOf(e) });
      L.push(`種別:${t} 冷気:${Math.round(sfx.chillOf(e))} 減速:${Math.round((e._chillSlow || 0) * 100)}%`);
      L.push(`凍結:${sfx.isFrozen(e) ? '中' : '×'} 耐性:${sfx.isFreezeImmune(e) ? '中' : '×'}`);
      L.push(`freezeChance(${this._fd.skill}L${this._fd.lv}): ${fc.guaranteed ? '確定' : (fc.chance * 100).toFixed(1) + '%'} proc:${proc}`);
    } else L.push('(敵なし)');
    if (this.boss && this.boss.alive) L.push(`ボス氷砕: ${Math.round(this.boss._frostGauge || 0)}/${Math.round(sfx.bossThreshold(this.boss))} break${this.boss._frostBreaks || 0} 脆弱:${sfx.bossVulnActive(this.boss) ? '中' : '×'}`);
    L.push(`抑制/f:${(this._mLast || this._m).suppressed} 索引上限:${JSON.stringify(sfx.capReached())}`);
    return L.join('\n');
  }

  // ---------------- 通常プレイ検証モード（M6-F・?debug=1・F8） ----------------
  // F5〜F7 のスキル付与/Job Lv変更で強くなりすぎる問題を避け、通常プレイに近い条件でバランスを検証する。
  // スキルは自動付与せず、通常のレベルアップ候補からプレイヤーが選ぶ。ゴッドモードは初期状態で無効。
  // profile の通貨・進行・Job XP・クリア状態は一切変更しない（この周回は debugRun として通常統計へ混ぜない）。
  toggleBalancePlaytest() {
    if (this._bpdbg) { this._bpdbg.destroy(true); this._bpdbg = null; return; }
    this._bp = this._bp || defaultPlaytestConfig();
    const cx = GAME_WIDTH / 2;
    const ui = this.add.container(0, 0).setScrollFactor(0).setDepth(4000);
    ui.add(this.add.rectangle(cx, GAME_HEIGHT / 2, 480, 340, 0x0d1017, 0.97).setScrollFactor(0).setStrokeStyle(1, 0x80cbc4));
    ui.add(this.add.text(cx, 4, 'Balance Playtest（通常プレイ検証・F8）', { fontSize: '11px', color: '#80cbc4' }).setScrollFactor(0).setOrigin(0.5, 0));
    const redraw = () => { this.toggleBalancePlaytest(); this.toggleBalancePlaytest(); };
    const cyc = (key, list) => { const i = list.indexOf(this._bp[key]); this._bp[key] = list[(i + 1) % list.length]; };
    const rows = [
      [() => `seed: ${this._bp.seed}`, () => { this._bp.seed = (this._bp.seed % 9999) + 1; }],
      [() => `難易度: ${this._bp.difficulty}`, () => cyc('difficulty', [1, 2, 3, 4, 5])],
      [() => `品質: ${this._bp.quality}`, () => cyc('quality', ['low', 'medium', 'high', 'ultra'])],
      [() => `速度: ${this._bp.speed}`, () => cyc('speed', [1, 1.5, 2])],
      [() => `Job Lv: ${this._bp.jobLevel ?? '通常'}`, () => cyc('jobLevel', [null, 1, 50, 70, 80, 100])],
      [() => `active枠: ${this._bp.activeSlots ?? '通常'}`, () => cyc('activeSlots', [null, 4, 6, 8])],
      [() => `候補数: ${this._bp.choices ?? '通常'}`, () => cyc('choices', [null, 3, 4])],
      [() => `恒久強化: ${this._bp.permUpgrades}`, () => cyc('permUpgrades', ['profile', 'none'])],
      [() => `熟練度: ${this._bp.mastery}`, () => cyc('mastery', ['profile', 'none'])],
      [() => `Job補正: ${this._bp.jobMods}`, () => cyc('jobMods', ['normal', 'off'])],
      [() => `戦闘時間: ${this._bp.durationSec ? this._bp.durationSec + '秒' : '通常5分'}`, () => cyc('durationSec', [null, 60, 600])],
    ];
    let yy = 22;
    for (const [label, fn] of rows) {
      const b = this.add.text(cx - 228, yy, label(), { fontSize: '9px', color: '#fff', backgroundColor: '#12343a', padding: { x: 5, y: 1 } }).setScrollFactor(0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => { fn(); redraw(); });
      ui.add(b); yy += 16;
    }
    const info = this.add.text(cx + 10, 22, 'スキルは自動付与しません。\n通常のレベルアップから選択します。\nゴッドモードは無効。\nprofile（通貨/進行/JobXP/クリア）は\n変更しません。\nこの周回は通常統計へ記録されず、\ndebugRuns へ保存されます。', { fontSize: '8px', color: '#a5d6a7', lineSpacing: 3, wordWrap: { width: 200 } }).setScrollFactor(0).setOrigin(0, 0);
    ui.add(info);
    const start = this.add.text(cx, GAME_HEIGHT - 30, '▶ 検証開始（周回をリセット）', { fontSize: '10px', color: '#0d1017', backgroundColor: '#80cbc4', padding: { x: 8, y: 3 } }).setScrollFactor(0).setOrigin(0.5).setInteractive({ useHandCursor: true });
    start.on('pointerdown', () => { this.startBalancePlaytest(this._bp); });
    ui.add(start);
    const close = this.add.text(cx, GAME_HEIGHT - 10, '閉じる (F8)', { fontSize: '9px', color: '#bcaaa4' }).setScrollFactor(0).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleBalancePlaytest());
    ui.add(close);
    this._bpdbg = ui;
  }

  // 検証開始: 一時状態のみを初期化して新しい検証周回を始める（profile は不変・debugRun）。
  startBalancePlaytest(cfg) {
    const ov = resolveOverrides(cfg, this.profile);
    this.markDebugRun();
    if (this._bpdbg) { this._bpdbg.destroy(true); this._bpdbg = null; }

    // 進行中のエンティティを一掃（新しい周回のため）。
    this.enemyPool.forEachActive((e) => this.enemyPool.release(e));
    this.projPool.forEachActive((p) => this.projPool.release(p));
    this.bossBulletPool.forEachActive((p) => this.bossBulletPool.release(p));
    this.gemPool.forEachActive((g) => this.gemPool.release(g));
    if (this.boss) { this.boss.destroy(); this.boss = null; }
    this.bossSpawned = false;

    // スキル/パッシブを初期状態へ（自動付与しない・以後プレイヤーが選ぶ）。
    this.skills.destroy();
    this.skills = new SkillManager(this);
    this.skills.setMasteryBonuses(ov.disableMastery ? null : this.masteryBonus);
    for (const id of (this.job.initialActiveSkills && this.job.initialActiveSkills.length ? this.job.initialActiveSkills : ['fireball'])) this.skills.acquireOrLevel(id);
    this.passives = new PassiveManager(this);
    this.passives.setDefs(DataManager.passives, DataManager.skillConfig);
    for (const id of (this.job.initialPassiveSkills || [])) this.passives.acquireOrLevel(id);
    this._skillAcquiredAt = {}; this._acquireOrder = 0;

    // プレイヤー進行リセット（HP/レベル/XP）。位置はそのまま。
    this.player.hp = this.player.maxHp; this.player.level = 1; this.player.xp = 0;
    this.player.xpToNext = DataManager.balance.leveling.baseXpToLevel || 5;
    this.timeSec = 0; this.kills = 0; this.eliteKills = 0; this.bossKills = 0; this.maxHit = 0;

    // 枠・候補・難易度・速度・seed・戦闘時間の上書き。
    if (ov.activeSlots) this.activeSlotsMax = ov.activeSlots;
    if (ov.choices) this.choicesPerLevel = ov.choices;
    if (ov.difficulty) { this.difficultyId = ov.difficulty; this.difficulty = DataManager.getDifficulty(ov.difficulty) || this.difficulty; }
    this.applySpeed(Math.min(ov.speed || 1, this.speedMax || 2));
    this.rngSeed = ov.seed; this.rng = createRng(this.rngSeed);
    this.draft.reset(this.rngSeed, {
      rerolls: ov.rerolls != null ? ov.rerolls : undefined,
      banishes: ov.banishes != null ? ov.banishes : undefined,
      skips: ov.skips != null ? ov.skips : undefined,
    });
    this._playtestDurationSec = ov.durationSec || null;

    // 恒久強化・Job補正の一時上書き（profile は不変）。恒久強化は none で火力倍率を素の1へ戻す。
    if (this._realDamageMult == null) this._realDamageMult = this.bonus.damageMult;
    this.bonus.damageMult = ov.permUpgrades && Object.keys(ov.permUpgrades).length === 0 ? 1 : this._realDamageMult;
    if (ov.disableJobMods) this.jobMods.setResolved(JobModifierManager.identity());
    else if (ov.jobLevel != null) this.jobMods.setResolved(JobModifierManager.resolve(DataManager.getJobProgression(this.jobId), ov.jobLevel));
    else this.jobMods.setResolved(this.resolvedJobModifiers);
    this.draft.setRarityWeightMult({ rare: this.jobMods.rarityWeightMult('rare'), legendary: this.jobMods.rarityWeightMult('legendary') });
    for (const sk of this.skills.skills.values()) sk._cache = null;

    // 新しいテレメトリ（debugRun）。通常統計へ混ぜない。
    this.telemetry = new CombatTelemetry({ seed: this.rngSeed, difficulty: this.difficultyId, quality: this.settings.effectQuality, speed: ov.speed || 1, jobId: this.jobId, jobLevelAtStart: this.jobMods.jobLevel, debugRun: true });

    // 小さな常時表示（Balance Playtest 中・seed・通常統計へ記録しない旨）。
    if (this._bpBanner) this._bpBanner.destroy();
    this._bpBanner = this.add.text(4, GAME_HEIGHT - 8, `● Balance Playtest  seed:${this.rngSeed}  debug補正:${this._debugRun ? 'あり' : 'なし'}  通常統計へ記録しません`, { fontSize: '8px', color: '#80cbc4', backgroundColor: '#0d1017' }).setScrollFactor(0).setDepth(3500).setOrigin(0, 1);
    this.updateHudSkills();
    this.showBanner('Balance Playtest 開始（通常のレベルアップから選択してください）');
  }

  // 進化条件（基礎Lv8＋補助スキル/パッシブLv4）を満たす状態を作る（?debug=1）。
  debugSetupEvolutions() {
    const setup = [
      ['flame_lance', 'swift_cast'], ['homing_wisp', 'fire_spirit'], ['lava_bomb', 'scorch_expand'],
      ['flame_vortex', 'burning_trail'], ['detonation_mark', 'power_amp'],
    ];
    for (const [base, aux] of setup) {
      this.skills.acquireOrLevel(base); this.skills.setLevel(base, 8);
      if (DataManager.getPassive(aux)) this.passives.acquireOrLevel(aux), this.passives.setLevel(aux, 4);
      else { this.skills.acquireOrLevel(aux); this.skills.setLevel(aux, 4); }
    }
    this.updateHudSkills();
  }

  // 実ブラウザでの非回帰確認フック（?debug=1）: 現在の生存敵に対し、空間グリッド経由と
  // 総当たりの円検索結果（集合＋順序）が一致するかをその場で検証し、削減率を返す。
  // 例: window.RFS_BATTLE.spatialSelfCheck(300)
  spatialSelfCheck(samples = 200) {
    const list = [];
    this.enemyPool.forEachActive((e) => { if (e.alive) list.push(e); });
    const inR = (arr, x, y, r) => {
      const r2 = r * r, out = [];
      for (const e of arr) { const dx = e.x - x, dy = e.y - y; if (dx * dx + dy * dy <= r2) out.push(e); }
      out.sort(SEQ_CMP);
      return out;
    };
    const rng = createRng(((this.rngSeed || 1) ^ 0x9e3779b1) >>> 0);
    let mism = 0, bruteCmp = 0, gridCmp = 0;
    for (let i = 0; i < samples; i++) {
      const x = rng() * this.worldW, y = rng() * this.worldH, r = 20 + rng() * 160;
      const brute = inR(list, x, y, r);
      const cand = this.enemyGrid.queryCircle(x, y, r);
      const grid = inR(cand.filter((e) => e.alive !== false), x, y, r);
      if (brute.map((e) => e._seq).join(',') !== grid.map((e) => e._seq).join(',')) mism++;
      bruteCmp += list.length; gridCmp += cand.length;
    }
    const report = { samples, enemies: list.length, mismatches: mism, bruteComparisons: bruteCmp, spatialComparisons: gridCmp, reductionPct: bruteCmp ? Math.round((1 - gridCmp / bruteCmp) * 100) : 0 };
    console.log('[spatialSelfCheck]', report);
    return report;
  }

  // 性能計測を一定間隔で集計し、必要ならパネル/可視化を更新する。
  _accumulatePerf(delta) {
    const p = this._perf;
    p.frames++;
    p.dtSum += delta;
    if (delta > p.dtMax) p.dtMax = delta;
    const fps = delta > 0 ? 1000 / delta : 0;
    if (fps < p.fpsMin) p.fpsMin = fps;
    p.acc = (p.acc || 0) + delta;
    if (p.acc >= 500) { // 0.5秒毎に更新（毎フレーム更新はしない）
      if (this._perfText) this._refreshPerfOverlay();
      if (this._gridGfx) this._drawGridViz();
      p.acc = 0; p.frames = 0; p.dtSum = 0; p.dtMax = 0; p.fpsMin = Infinity;
    }
  }

  togglePerfOverlay() {
    if (this._perfText) { this._perfText.destroy(); this._perfText = null; return; }
    this._perfText = this.add.text(4, 4, '', {
      fontSize: '8px', color: '#b2ff59', backgroundColor: '#000a', padding: { x: 4, y: 3 },
      lineSpacing: 1,
    }).setScrollFactor(0).setDepth(5000);
    this._refreshPerfOverlay();
  }

  _refreshPerfOverlay() {
    if (!this._perfText) return;
    const p = this._perf;
    const m = this._mLast || this._m;
    const avgDt = p.frames > 0 ? p.dtSum / p.frames : 0;
    const avgFps = avgDt > 0 ? 1000 / avgDt : 0;
    const minFps = isFinite(p.fpsMin) ? p.fpsMin : 0;
    const curFps = this.game.loop.actualFps;
    const brute = m.bruteComparisons || 0;
    const spat = m.spatialCandidates || 0;
    const reduction = brute > 0 ? Math.round((1 - spat / brute) * 100) : 0;
    const eg = this.enemyGrid, gg = this.gemGrid;
    const ep = this.enemyPool, pp = this.projPool, bp = this.bossBulletPool, gp = this.gemPool;
    const tweens = this.tweens.getTweens().length;
    const lines = [
      `FPS ${curFps.toFixed(0)}  平均 ${avgFps.toFixed(0)}  最低 ${minFps.toFixed(0)}`,
      `frame ${avgDt.toFixed(1)}ms (最大 ${p.dtMax.toFixed(1)})`,
      `敵 ${ep.activeCount}  ボス ${this.boss && this.boss.alive ? 1 : 0}  味方弾 ${pp.activeCount}  敵弾 ${bp.activeCount}  ジェム ${gp.activeCount}`,
      `AoE/f ${m.aoe}  演出tween ${tweens}  抑制/f ${m.suppressed}`,
      `プール 敵(使${ep.activeCount}/待${ep.freeCount} 新${ep.createdCount}/再${ep.reusedCount}/返${ep.releasedCount})`,
      `プール 弾(使${pp.activeCount}/待${pp.freeCount})  ジェム(使${gp.activeCount}/待${gp.freeCount})`,
      `空間: ${this._useSpatial ? 'ON' : 'OFF(旧総当り)'}  cell ${this._cellSize}px  使用セル 敵${eg.usedCells}/ジェム${gg.usedCells}  登録 敵${eg.size}`,
      `検索/f ${m.queries}  候補 ${spat}  厳密判定 ${m.exactTests}  該当 ${m.finalHits}`,
      `比較回数/f  旧総当り ${brute}  空間 ${spat}  削減 ${reduction}%`,
    ];
    this._perfText.setText(lines.join('\n'));
  }

  toggleGridViz() {
    if (this._gridGfx) { this._gridGfx.destroy(); this._gridGfx = null; return; }
    this._gridGfx = this.add.graphics().setDepth(30); // ワールド座標（scrollFactor 1）
    this._drawGridViz();
  }

  _drawGridViz() {
    const g = this._gridGfx;
    if (!g) return;
    g.clear();
    const cs = this._cellSize;
    const cols = this.enemyGrid.cols;
    // 使用中セルのみ塗り、密度で色を変える（軽量化のため使用セルだけ描画）。
    g.lineStyle(1, 0x80deea, 0.18);
    for (const [idx, set] of this.enemyGrid.cells) {
      const cx = (idx % cols) * cs, cy = Math.floor(idx / cols) * cs;
      const dens = Math.min(1, set.size / 8);
      g.fillStyle(0xff5722, 0.08 + dens * 0.28);
      g.fillRect(cx, cy, cs, cs);
      g.strokeRect(cx, cy, cs, cs);
    }
  }
}
