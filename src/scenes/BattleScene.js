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
      onRelease: (e) => this.enemyGrid.remove(e),
    });
    this.projPool = new Pool(this, () => new Projectile(this), (p, x, y, a, s, o) => p.reset(x, y, a, s, o), this.effSettings.maxProjectiles);
    this.bossBulletPool = new Pool(this, () => new Projectile(this), (p, x, y, a, s, o) => p.reset(x, y, a, s, o), 300);
    this.gemPool = new Pool(this, () => new ExperienceGem(this), (g, x, y, v) => g.reset(x, y, v), 500, {
      onSpawn: (g) => { g._seq = this._gemSeq++; if (this._useSpatial) this.gemGrid.insert(g); },
      onRelease: (g) => this.gemGrid.remove(g),
    });

    // ジョブ・所持枠（M6-A）
    this.job = DataManager.getJob(this.profile.selectedJobId) || DataManager.getJob('flame_witch') || DataManager.jobs[0] || { id: 'flame_witch', initialActiveSkills: ['fireball'], initialPassiveSkills: [], activeSkillPool: DataManager.skills.map((s) => s.id), passiveSkillPool: [], baseActiveSlots: 4, basePassiveSlots: 4 };
    const slotCfg = DataManager.skillConfig.slots || {};
    this.activeSlotsMax = (this.job.baseActiveSlots ?? slotCfg.baseActiveSlots ?? 4) + (this.reincStats.activeSlotBonus || 0);
    this.passiveSlotsMax = (this.job.basePassiveSlots ?? slotCfg.basePassiveSlots ?? 4);

    // マネージャ
    this.effects = new EffectManager(this);
    this.effects.setSettings(this.effSettings);
    this.skills = new SkillManager(this);
    this.skills.setMasteryBonuses(this.masteryBonus);
    // パッシブ（共通 modifier 集計）とスキル抽選（決定論ドラフト）。
    this.passives = new PassiveManager(this);
    this.passives.setDefs(DataManager.passives, DataManager.skillConfig);
    const dcfg = DataManager.skillConfig.draft || {};
    this.draft = new SkillDraftManager({ rarityWeights: DataManager.rarityWeights, baseRerolls: dcfg.baseRerolls, baseBanishes: dcfg.baseBanishes, baseSkips: dcfg.baseSkips });
    this.spawn = new SpawnManager(this);
    this.battle = new BattleManager(this);
    this.pauseMenu = new PauseMenu(this);
    this.buildCombatApi();

    // 進行状態
    this.timeSec = 0;
    this.kills = 0;
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

    // 途中再開 or 新規
    if (this.resumeData) {
      this.restoreFromRun(this.resumeData, bal);
    } else {
      this.draft.reset(this._draftSeed, {});
      // ジョブの初期スキル（active/passive）。
      for (const id of (this.job.initialActiveSkills && this.job.initialActiveSkills.length ? this.job.initialActiveSkills : ['fireball'])) this.skills.acquireOrLevel(id);
      for (const id of (this.job.initialPassiveSkills || [])) this.passives.acquireOrLevel(id);
      // 初期スキルレベル強化（恒久＋魂炎）を初期 active（火球）へ。
      const startAdd = (up.startSkillLevel || 0) + (reinc.startSkillLevel || 0);
      if (startAdd > 0 && this.skills.has('fireball')) this.skills.setLevel('fireball', this.skills.getLevel('fireball') + startAdd);
    }
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
      // ヘッドレス/実ブラウザからの検査・比較用に戦闘シーンを公開する。
      window.RFS_BATTLE = this;
      this.togglePerfOverlay(); // debug 時は性能パネルを既定表示
    }

    // HUD
    this.hud = new HUD(this);
    this.hud.onPause(() => this.togglePause());
    this.hud.onToggleAuto(() => this.toggleAuto());
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
  }

  cleanup() {
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.game.events.off('blur', this._onBlur);
    if (this.skills) this.skills.destroy();
    // 空間グリッドを破棄（古い参照を残さない）。
    if (this.enemyGrid) this.enemyGrid.clear();
    if (this.gemGrid) this.gemGrid.clear();
    if (this._perfText) { this._perfText.destroy(); this._perfText = null; }
    if (this._gridGfx) { this._gridGfx.destroy(); this._gridGfx = null; }
    if (this._skdbg) { this._skdbg.destroy(true); this._skdbg = null; }
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
    };
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
    this.aoe(this.player.x, this.player.y, ph.explosionRadius || 100, ph.explosionDamage || 0, 'phoenix_feather', { crit: true });
    this.showBanner('不死鳥の羽が発動！');
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
  aoe(x, y, radius, amount, skillId, opts = {}) {
    if (this._aoeBudget <= 0) { this._m.suppressed++; return; }
    this._aoeBudget--;
    this._m.aoe++;
    this.damageArea(x, y, radius, amount, skillId, opts);
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
    const died = target.takeDamage(amount);
    const dealt = target.lastDamage || amount;
    if (skillId) { this.skills.recordDamage(skillId, dealt); this.skills.recordHit(skillId); }
    if (dealt > this.maxHit) this.maxHit = dealt;

    if (!opts.quiet) this.effects.damageNumber(target.x, target.y - (target.isBoss ? 20 : 6), Math.round(dealt), !!opts.crit);
    if (!target.isBoss) this.effects.enemyFlash(target);
    if (!opts.quiet) this.effects.hitBurst(target.x, target.y, opts.color || 0xffe082);

    if (opts.knockback && target.applyKnockback) {
      target.applyKnockback(opts.from?.x ?? this.player.x, opts.from?.y ?? this.player.y, opts.knockback);
    }
    if (died) {
      if (skillId) this.skills.recordKill(skillId);
      if (target.isBoss) this.onBossKilled(target);
      else this.onEnemyKilled(target, skillId);
    } else if (!opts.isMarkDetonation && skillId && !target.isBoss && target._mark && this.time.now < target._mark.until) {
      // 起爆刻印（M6-B）: 火属性攻撃/炎上が命中したら刻印を進め、規定回数で起爆。
      // 起爆自身のダメージ(isMarkDetonation)ではカウントしない＝無限再起爆を防止。
      target._mark.hits += 1;
      if (target._mark.hits >= target._mark.hitsNeeded) this.detonateMark(target);
    }
    return died;
  }

  damageArea(x, y, radius, amount, skillId, opts = {}) {
    for (const t of this.targetsInRadius(x, y, radius)) {
      if (t === opts.exclude) continue;
      this.dealDamage(t, amount, skillId, {
        knockback: opts.knockback || 0, from: { x, y },
        crit: opts.crit, quiet: opts.quiet, color: opts.color,
        isMarkDetonation: opts.isMarkDetonation, element: opts.element, tag: opts.tag,
      });
    }
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

    this.handleInput(dt);
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
    if (this.timeSec >= DataManager.balance.run.bossAtSec) {
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
    this.hud.showBoss(def.name);
  }

  onBossKilled(boss) {
    this.bossKills++;
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
          if (!proj.registerHit(e)) continue;
          this.dealDamage(e, proj.damage, proj.skillId, { knockback: proj.knockback, from: { x: this.player.x, y: this.player.y }, element: proj.element });
          if (proj.explosionRadius > 0) {
            this.effects.explosion(proj.x, proj.y, proj.explosionRadius);
            this.aoe(proj.x, proj.y, proj.explosionRadius, proj.damage * 0.5, proj.skillId, { exclude: e, quiet: true });
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
    // 永劫火界: 炎上中の敵の死亡で小爆発（安全上限内・連鎖暴走防止）。
    // 死亡直後は alive=false のため .ignited ではなく点火タイマーで判定する。
    const wasIgnited = e._igniteUntil && this.time.now < e._igniteUntil;
    if (wasIgnited && this._deathExpBudget > 0) {
      this._deathExpBudget--;
      const evo = DataManager.getEvolution('eternal_pyre');
      const r = evo?.area?.deathExplosionRadius || 46;
      this.effects.explosion(e.x, e.y, r, 0xff7043);
      this.aoe(e.x, e.y, r, evo?.damage?.deathExplosion || 34, 'eternal_pyre', { exclude: e, quiet: true });
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
    return {
      catalog: DataManager.draftCatalog(),
      job: { activeSkillPool: this.job.activeSkillPool || [], passiveSkillPool: this.job.passiveSkillPool || [] },
      extraAllowedIds: (this.job.futureInheritanceSettings && this.job.futureInheritanceSettings.enabled) ? (this._inheritedIds || []) : [],
      owned: { active: this.skills.activeLevels(), passive: this.passives.serialize() },
      slots: {
        active: { used: activeUsed, max: Math.max(this.activeSlotsMax, activeUsed) },
        passive: { used: this.passives.count(), max: this.passiveSlotsMax },
      },
      evolvables: this.computeEvolvables(),
      need: this.choicesPerLevel,
      unlock: { highestClearedDifficulty: this.profile.highestClearedDifficulty || 0 },
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
      return { kind: 'evolution', category: 'active', rarity: c.rarity, rarityColor, badge: '★進化', icon: ev?.icon || DataManager.getSkill(c.baseId)?.iconKey, title: ev?.displayName || c.id, description: ev?.description || '', level: '→ 進化' };
    }
    if (c.category === 'passive') {
      const p = DataManager.getPassive(c.id);
      const isNew = c.kind === 'new_passive';
      return { kind: c.kind, category: 'passive', rarity: c.rarity, rarityColor, badge: isNew ? 'passive 新規' : 'passive 強化', icon: p?.iconKey, title: p?.displayName || c.id, description: p?.description || '', level: `Lv ${c.fromLevel}→${c.toLevel}/${c.maxLevel}` };
    }
    const s = DataManager.getSkill(c.id);
    const isNew = c.kind === 'new_active';
    const nextStats = isNew ? DataManager.getSkillLevel(c.id, 1) : DataManager.getSkillLevel(c.id, c.toLevel);
    return { kind: c.kind, category: 'active', rarity: c.rarity, rarityColor, badge: isNew ? 'active 新規' : 'active 強化', icon: s?.iconKey || s?.icon, title: s?.name || c.id, description: isNew ? (s?.description || '') : this.describeSkillLevel(c.id, nextStats), level: `Lv ${c.fromLevel}→${c.toLevel}/${c.maxLevel}` };
  }

  applyCandidate(c) {
    if (c.kind === 'evolution') this.skills.evolve(c.baseId);
    else if (c.category === 'passive') this.passives.acquireOrLevel(c.id);
    else this.skills.acquireOrLevel(c.id);
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
    if (this.boss && this.boss.alive) this.hud.updateBoss(this.boss.hpRatio());
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
