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
import { EffectManager } from '../systems/EffectManager.js';
import { SpawnManager } from '../systems/SpawnManager.js';
import { BattleManager } from '../systems/BattleManager.js';
import { HUD } from '../ui/HUD.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { distance, dist2, createRng } from '../utils/math.js';

const WORLD_W = 1600;
const WORLD_H = 1200;
const AUTOSAVE_MS = 20000;

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

    // プール
    this.enemyPool = new Pool(this, () => new Enemy(this), (e, def, x, y, m) => e.reset(def, x, y, m), this.effSettings.maxEnemies);
    this.projPool = new Pool(this, () => new Projectile(this), (p, x, y, a, s, o) => p.reset(x, y, a, s, o), this.effSettings.maxProjectiles);
    this.bossBulletPool = new Pool(this, () => new Projectile(this), (p, x, y, a, s, o) => p.reset(x, y, a, s, o), 300);
    this.gemPool = new Pool(this, () => new ExperienceGem(this), (g, x, y, v) => g.reset(x, y, v), 500);

    // マネージャ
    this.effects = new EffectManager(this);
    this.effects.setSettings(this.effSettings);
    this.skills = new SkillManager(this);
    this.skills.setMasteryBonuses(this.masteryBonus);
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

    // 途中再開 or 新規
    if (this.resumeData) {
      this.restoreFromRun(this.resumeData, bal);
    } else {
      this.skills.acquireOrLevel('fireball');
      const startAdd = (up.startSkillLevel || 0) + (reinc.startSkillLevel || 0);
      if (startAdd > 0) this.skills.setLevel('fireball', this.skills.getLevel('fireball') + startAdd);
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
    if (window.RFS_DEBUG) this.input.keyboard.on('keydown-F1', () => this.toggleDebug());

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
  }

  cleanup() {
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.game.events.off('blur', this._onBlur);
    if (this.skills) this.skills.destroy();
  }

  // ---------------- combat API（判定のみ） ----------------
  buildCombatApi() {
    this.combat = {
      nearestEnemy: (x, y, range) => this.nearestTarget(x, y, range),
      randomEnemies: (n) => this.randomTargets(n),
      forEachEnemyInRadius: (x, y, r, fn) => { for (const t of this.targetsInRadius(x, y, r)) fn(t); },
      densestPoint: (radius, idx) => this.densestPoint(radius, idx),
      dealDamage: (t, amt, id, opts) => this.dealDamage(t, amt, id, opts),
      damageArea: (x, y, r, amt, id, opts) => this.damageArea(x, y, r, amt, id, opts),
      spawnPlayerProjectile: (x, y, a, sp, o) => this.projPool.spawn(x, y, a, sp, o),
    };
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
    if (this.effects) this.effects.beginFrame(caps.maxDamageNumbersPerFrame ?? 24, this.particleBudget ?? 200);
  }

  // 安全上限付き AoE（進化スキルが使用）。上限に達しても戦闘を止めない。
  aoe(x, y, radius, amount, skillId, opts = {}) {
    if (this._aoeBudget <= 0) return;
    this._aoeBudget--;
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

  targetsInRadius(x, y, r) {
    const out = [];
    const r2 = r * r;
    this.enemyPool.forEachActive((e) => { if (e.alive && dist2(x, y, e.x, e.y) <= r2) out.push(e); });
    if (this.boss && this.boss.alive) {
      const br = r + this.boss.displayWidth * 0.4;
      if (dist2(x, y, this.boss.x, this.boss.y) <= br * br) out.push(this.boss);
    }
    return out;
  }

  nearestTarget(x, y, range) {
    let best = null, bestD = Infinity;
    this.enemyPool.forEachActive((e) => {
      if (!e.alive) return;
      const d = distance(x, y, e.x, e.y);
      if (d < bestD && d <= range) { bestD = d; best = e; }
    });
    if (this.boss && this.boss.alive) {
      const d = distance(x, y, this.boss.x, this.boss.y);
      if (d < bestD && d <= range) { best = this.boss; }
    }
    return best;
  }

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

  densestPoint(radius, idx = 0) {
    const pts = [];
    this.enemyPool.forEachActive((e) => { if (e.alive) pts.push(e); });
    if (pts.length === 0) return this.boss && this.boss.alive ? { x: this.boss.x, y: this.boss.y } : null;
    const r2 = radius * radius;
    const scored = pts.map((c) => {
      let count = 0;
      for (const o of pts) if (dist2(c.x, c.y, o.x, o.y) <= r2) count++;
      return { x: c.x, y: c.y, count };
    });
    scored.sort((a, b) => b.count - a.count);
    return scored[Math.min(idx, scored.length - 1)];
  }

  dealDamage(target, amount, skillId, opts = {}) {
    if (!target || !target.alive) return false;
    // 基礎ダメージ恒久強化（damageMult）を全プレイヤーダメージへ適用。
    amount = amount * (this.bonus.damageMult || 1);
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
    }
    return died;
  }

  damageArea(x, y, radius, amount, skillId, opts = {}) {
    for (const t of this.targetsInRadius(x, y, radius)) {
      if (t === opts.exclude) continue;
      this.dealDamage(t, amount, skillId, {
        knockback: opts.knockback || 0, from: { x, y },
        crit: opts.crit, quiet: opts.quiet, color: opts.color,
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
    let best = null, bestD = 200 * 200;
    this.gemPool.forEachActive((g) => {
      if (!g.alive) return;
      const d = dist2(this.player.x, this.player.y, g.x, g.y);
      if (d < bestD) { bestD = d; best = g; }
    });
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
    this.enemyPool.forEachActive((e) => e.update(this.player.x, this.player.y, dt));
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
    this.gemPool.forEachActive((g) => { if (g.update(this.player.x, this.player.y, pickup, magnet)) collected.push(g); });
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
          this.dealDamage(e, proj.damage, proj.skillId, { knockback: proj.knockback, from: { x: this.player.x, y: this.player.y } });
          if (proj.explosionRadius > 0) {
            this.effects.explosion(proj.x, proj.y, proj.explosionRadius);
            this.aoe(proj.x, proj.y, proj.explosionRadius, proj.damage * 0.5, proj.skillId, { exclude: e, quiet: true });
          }
          proj.consumePierce();
          // 貫通後の威力減衰（進化弾は減衰が緩い）。
          if (proj.alive && proj.pierceFalloff < 1) proj.damage *= proj.pierceFalloff;
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
    }
    this.effects.deathBurst(e.x, e.y);
    this.gemPool.spawn(e.x, e.y, e.xpValue);
    // 業火弾幕: 撃破で近くの別の敵へ追撃火球（安全上限内）。
    if (skillId === 'infernal_barrage' && this._extraFbBudget > 0) {
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
    this.enemyPool.release(e);
  }

  grantXp(value) {
    const gained = Math.max(1, Math.round(value * this.bonus.xpMult));
    const ups = this.player.gainXp(gained, DataManager.balance.leveling.xpGrowth);
    if (ups > 0) this.openLevelUp();
  }

  // ---------------- レベルアップ（新規取得 + 既存強化） ----------------
  openLevelUp() {
    this.forcePause(false);
    const choices = this.rollChoices();
    this.scene.launch('LevelUpScene', {
      choices,
      onPick: (choice) => {
        const evoBase = choice.evolution ? choice.baseSkillId : null;
        choice.apply();               // 進化の場合はここでスキル置換が完了（演出とは分離）
        this.updateHudSkills();
        this.autoSave();
        if (evoBase) {
          const ev = DataManager.getEvolutionForBase(evoBase);
          const baseName = DataManager.getSkill(evoBase)?.name || evoBase;
          this.scene.launch('EvolutionScene', {
            evo: ev, baseName, lowFx: this.settings.effectQuality === 'low',
            onDone: () => this.resumeFromMenu(),   // 演出終了で戦闘再開（演出中は停止したまま）
          });
        } else {
          this.resumeFromMenu();
        }
      },
    });
  }

  rollChoices() {
    const need = this.choicesPerLevel || (DataManager.balance.leveling.choicesPerLevel || 3);
    // 進化候補（条件成立 + 出現率）。通常強化と区別して優先的に提示する。
    const evoChoices = EvolutionManager.candidates(this.skills, this.profile, this.rng).map((ev) => ({
      id: `evo_${ev.id}`, evolution: true, baseSkillId: ev.baseSkillId,
      title: ev.displayName, icon: ev.icon, description: ev.description,
      apply: () => this.skills.evolve(ev.baseSkillId),
    }));

    const pool = [];
    // 既存スキルの強化
    for (const s of this.skills.ownedList()) {
      if (this.skills.isMaxed(s.id)) continue;
      const next = DataManager.getSkillLevel(s.id, s.level + 1);
      pool.push({
        id: `up_${s.id}`, title: `${s.name} Lv.${s.level + 1}`, icon: DataManager.getSkill(s.id)?.icon,
        description: this.describeSkillLevel(s.id, next),
        apply: () => this.skills.acquireOrLevel(s.id),
      });
    }
    // 未取得スキルの新規取得（重複取得しない）
    for (const def of DataManager.skills) {
      if (this.skills.has(def.id)) continue;
      pool.push({
        id: `new_${def.id}`, title: `【新】${def.name}`, icon: def.icon,
        description: def.description || '新しいスキルを取得',
        apply: () => this.skills.acquireOrLevel(def.id),
      });
    }
    // 補填（スキルが出揃った場合の基礎強化）
    const fillers = [
      { id: 'max_hp', title: '最大HP +20', icon: 'icon_flame_pillar', description: 'HPを20回復し最大値を増加', apply: () => { this.player.maxHp += 20; this.player.heal(20); } },
      { id: 'move', title: '移動速度 +8%', icon: 'icon_burning_trail', description: '移動が速くなる', apply: () => { this.bonus.moveMult *= 1.08; this.player.moveSpeed *= 1.08; } },
      { id: 'pickup', title: '吸収範囲 +25%', icon: 'icon_orbiting_flame', description: '経験値を集めやすくなる', apply: () => { this.bonus.pickupMult *= 1.25; } },
      { id: 'xp', title: '経験値獲得 +15%', icon: 'icon_meteor', description: '得られる経験値が増える', apply: () => { this.bonus.xpMult *= 1.15; } },
    ];

    this.shuffleInPlace(pool);
    // 進化候補を先頭に、残りを通常強化→補填で埋める。
    const chosen = evoChoices.slice(0, need);
    for (const c of pool) { if (chosen.length >= need) break; chosen.push(c); }
    let fi = 0;
    while (chosen.length < need && fi < fillers.length) chosen.push(fillers[fi++]);
    return chosen;
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

  updateHudSkills() { this.hud.setSkills(this.skills.ownedList().map((s) => ({ name: s.name, level: s.level }))); }

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
    ui.add(this.add.rectangle(cx, GAME_HEIGHT / 2, 300, 200, 0x101820, 0.96).setScrollFactor(0).setStrokeStyle(1, 0x80deea));
    ui.add(this.add.text(cx, GAME_HEIGHT / 2 - 88, 'DEBUG（戦闘）', { fontSize: '11px', color: '#80deea' }).setScrollFactor(0).setOrigin(0.5));
    const acts = [
      ['この周回を勝利', () => this.finishRun(true)],
      ['全スキル取得＆Lv8', () => { for (const d of DataManager.skills) { this.skills.acquireOrLevel(d.id); this.skills.setLevel(d.id, 8); } this.updateHudSkills(); }],
      ['火球の進化条件を満たす', () => { this.skills.acquireOrLevel('fireball'); this.skills.setLevel('fireball', 8); this.skills.acquireOrLevel('orbiting_flame'); this.skills.setLevel('orbiting_flame', 4); this.updateHudSkills(); }],
      ['レベルアップ候補を表示', () => { this.toggleDebug(); this.openLevelUp(); }],
      ['経験値 +大量（Lv+）', () => this.grantXp(9999)],
      ['敵を全滅', () => this.enemyPool.releaseAll()],
    ];
    let yy = GAME_HEIGHT / 2 - 64;
    for (const [label, fn] of acts) {
      const b = this.add.text(cx, yy, label, { fontSize: '10px', color: '#fff', backgroundColor: '#1a3a3e', padding: { x: 6, y: 2 } }).setScrollFactor(0).setOrigin(0.5).setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => { fn(); if (this._dbg) this.toggleDebug(); });
      ui.add(b); yy += 22;
    }
    const close = this.add.text(cx, yy + 4, '閉じる (F1)', { fontSize: '9px', color: '#bcaaa4' }).setScrollFactor(0).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.toggleDebug());
    ui.add(close);
    this._dbg = ui;
  }
}
