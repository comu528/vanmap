// 戦闘シーン（Milestone 2）。
// M1: プレイヤー移動/ダッシュ、敵出現、自動攻撃、経験値、レベルアップ3択、一時停止。
// M2 追加: 5種スキルと強化、ボス戦、リザルト遷移、EffectManager、オート移動改善、途中再開。
//
// 設計方針: ダメージ判定は combat.* が数値計算で行い、演出は effects.* が担当する。
// エフェクトを無効化しても戦闘結果は変わらない（判定と演出の分離）。

import { GAME_WIDTH, GAME_HEIGHT, TEX } from '../config/game-config.js';
import { DataManager } from '../systems/DataManager.js';
import { SaveManager } from '../systems/SaveManager.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Boss } from '../entities/Boss.js';
import { Projectile } from '../entities/Projectile.js';
import { ExperienceGem } from '../entities/ExperienceGem.js';
import { Pool } from '../systems/PoolManager.js';
import { SkillManager } from '../systems/SkillManager.js';
import { EffectManager } from '../systems/EffectManager.js';
import { HUD } from '../ui/HUD.js';
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

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, TEX.GROUND).setOrigin(0, 0).setDepth(-10);

    // プレイヤー
    const pcfg = { ...bal.player, baseXpToLevel: bal.leveling.baseXpToLevel };
    this.player = new Player(this, WORLD_W / 2, WORLD_H / 2, pcfg);
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
    this._spawnAccum = 0;
    this._recalc = 0;
    this._nearestEnemy = null;
    this._nearestGem = null;
    this._autoSaveAccum = 0;
    this._hitStopMs = 0;
    this.bonus = { moveMult: 1, pickupMult: 1, xpMult: 1 };

    // 乱数シード（途中再開時は復元）
    this.rngSeed = (this.resumeData?.rngSeed) || ((Date.now() % 2147483647) >>> 0) || 12345;
    this.rng = createRng(this.rngSeed);

    // 途中再開 or 新規
    if (this.resumeData) this.restoreFromRun(this.resumeData, bal);
    else this.skills.acquireOrLevel('fireball');
    this.player.moveSpeed = bal.player.moveSpeed * this.bonus.moveMult;

    // 入力
    this.keys = this.input.keyboard.addKeys({
      up: 'W', down: 'S', right: 'D',
      upA: 'UP', downA: 'DOWN', leftA: 'LEFT', rightA: 'RIGHT',
      moveLeft: 'A', dash: 'SPACE',
    });
    this.input.keyboard.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard.on('keydown-Q', () => this.toggleAuto());

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
    this.bonus = { moveMult: 1, pickupMult: 1, xpMult: 1, ...(r.bonus || {}) };
    if (r.maxHp) this.player.maxHp = r.maxHp;
    this.player.hp = (typeof r.playerHp === 'number') ? r.playerHp : this.player.maxHp;
    this.player.level = r.playerLevel || 1;
    this.player.xp = r.xp || 0;
    if (r.xpToNext) this.player.xpToNext = r.xpToNext;
    this.skills.loadFrom(r.skills);
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
      else this.onEnemyKilled(target);
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
    const dt = delta;
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
    if (this.autoMove && !manual) { const v = this.computeAutoMove(); ix = v.x; iy = v.y; }

    if (Phaser.Input.Keyboard.JustDown(this.keys.dash)) this.player.tryDash(ix, iy);
    this.player.handleMovement(dt, ix, iy);
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

  // ---------------- 出現 ----------------
  handleSpawning(dt) {
    if (this.boss && this.boss.alive) return; // ボス戦中は通常湧きを止める
    const phase = this.currentPhase();
    if (this.enemyPool.activeCount >= Math.min(phase.maxAlive, this.enemyPool.maxSize)) return;
    this._spawnAccum += dt;
    const interval = phase.spawnIntervalMs / (this.difficulty.spawnRate || 1);
    while (this._spawnAccum >= interval) { this._spawnAccum -= interval; this.spawnEnemy(); }
  }

  currentPhase() {
    const phases = DataManager.balance.run.phases;
    for (const ph of phases) if (this.timeSec >= ph.fromSec && this.timeSec < ph.toSec) return ph;
    return phases[phases.length - 1];
  }

  _rngPick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  spawnEnemy() {
    const def = this.pickEnemyType();
    if (!def) return;
    const cam = this.cameras.main;
    const ang = this.rng() * Math.PI * 2;
    const r = Math.max(cam.width, cam.height) * 0.62;
    let x = Phaser.Math.Clamp(this.player.x + Math.cos(ang) * r, 20, WORLD_W - 20);
    let y = Phaser.Math.Clamp(this.player.y + Math.sin(ang) * r, 20, WORLD_H - 20);
    this.enemyPool.spawn(def, x, y, {
      hp: this.difficulty.enemyHp, speed: this.difficulty.enemySpeed, damage: this.difficulty.enemyDamage,
    });
  }

  pickEnemyType() {
    const pool = DataManager.enemies.filter((e) => this.timeSec >= (e.spawnFromSec || 0) && !e.elite);
    if (pool.length === 0) return DataManager.getEnemy('slime');
    if (this.rng() < (this.difficulty.eliteRate || 0)) {
      const elites = DataManager.enemies.filter((e) => e.elite && this.timeSec >= (e.spawnFromSec || 0));
      if (elites.length) return this._rngPick(elites);
    }
    return this._rngPick(pool);
  }

  spawnZakoNear(bx, by) {
    const def = this._rngPick(DataManager.enemies.filter((e) => !e.elite)) || DataManager.getEnemy('slime');
    const ang = this.rng() * Math.PI * 2;
    const x = Phaser.Math.Clamp(bx + Math.cos(ang) * 60, 20, WORLD_W - 20);
    const y = Phaser.Math.Clamp(by + Math.sin(ang) * 60, 20, WORLD_H - 20);
    this.enemyPool.spawn(def, x, y, {
      hp: this.difficulty.enemyHp, speed: this.difficulty.enemySpeed, damage: this.difficulty.enemyDamage,
    });
  }

  spawnBossBullet(x, y, angle, speed) {
    this.bossBulletPool.spawn(x, y, angle, speed, {
      damage: (this.boss?.damage || 20) * 0.6, hostile: true, tint: 0xff5252, scale: 0.9, lifeMs: 5000,
    });
  }

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
            this.damageArea(proj.x, proj.y, proj.explosionRadius, proj.damage * 0.5, proj.skillId, { exclude: e, quiet: true });
          }
          proj.consumePierce();
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

  onEnemyKilled(e) {
    this.kills++;
    this.effects.deathBurst(e.x, e.y);
    this.gemPool.spawn(e.x, e.y, e.xpValue);
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
        choice.apply();
        this.updateHudSkills();
        this.autoSave();
        this.resumeFromMenu();
      },
    });
  }

  rollChoices() {
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

    const need = DataManager.balance.leveling.choicesPerLevel || 3;
    this.shuffleInPlace(pool);
    const chosen = pool.slice(0, need);
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
    if (showMenu) this.showPauseMenu();
  }

  showPauseMenu() {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    const ui = this.add.container(0, 0).setScrollFactor(0).setDepth(1200);
    const bg = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72).setScrollFactor(0);
    const t = this.add.text(cx, cy - 60, '一時停止', { fontSize: '18px', color: '#ffab40' }).setOrigin(0.5).setScrollFactor(0);
    const resume = this.add.text(cx, cy - 26, '▶ 再開', { fontSize: '13px', color: '#ffe0b2' }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const qLabel = this.add.text(cx, cy + 2, '', { fontSize: '11px', color: '#80deea' }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const dLabel = this.add.text(cx, cy + 22, '', { fontSize: '11px', color: '#80deea' }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const sLabel = this.add.text(cx, cy + 42, '', { fontSize: '11px', color: '#80deea' }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const title = this.add.text(cx, cy + 66, 'タイトルへ戻る', { fontSize: '11px', color: '#bcaaa4' }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });

    const quals = ['low', 'medium', 'high', 'ultra'];
    const refresh = () => {
      qLabel.setText(`エフェクト品質: ${this.settings.effectQuality}（クリックで変更）`);
      dLabel.setText(`ダメージ数字: ${this.settings.damageNumbers ? 'ON' : 'OFF'}`);
      sLabel.setText(`画面揺れ: ${this.settings.screenShake ? 'ON' : 'OFF'}`);
    };
    refresh();
    const applySettings = () => {
      this.effSettings = resolveEffectSettings(DataManager.balance, this.settings);
      this.effects.setSettings(this.effSettings);
      SaveManager.saveSettings(this.settings);
      refresh();
    };
    qLabel.on('pointerdown', () => { const i = quals.indexOf(this.settings.effectQuality); this.settings.effectQuality = quals[(i + 1) % quals.length]; applySettings(); });
    dLabel.on('pointerdown', () => { this.settings.damageNumbers = !this.settings.damageNumbers; applySettings(); });
    sLabel.on('pointerdown', () => { this.settings.screenShake = !this.settings.screenShake; applySettings(); });
    resume.on('pointerdown', () => this.resumeFromMenu());
    title.on('pointerdown', () => this.returnToTitle());
    ui.add([bg, t, resume, qLabel, dLabel, sLabel, title]);
    this._pauseUi = ui;
  }

  resumeFromMenu() {
    if (!this.paused) return;
    this.paused = false;
    this.physics.world.resume();
    this.time.paused = false;
    this.tweens.resumeAll();
    if (this._pauseUi) { this._pauseUi.destroy(); this._pauseUi = null; }
  }

  // ---------------- 終了 ----------------
  computeEmber() {
    return Math.floor((this.kills * 0.5 + this.bossKills * 50) * (this.difficulty.currency || 1));
  }

  buildRunSnapshot() {
    return {
      inProgress: true, save_version: this.saveVersion, game_version: this.gameVersion,
      difficulty: this.difficultyId, elapsedSec: this.timeSec,
      playerHp: this.player.hp, maxHp: this.player.maxHp,
      playerLevel: this.player.level, xp: this.player.xp, xpToNext: this.player.xpToNext,
      skills: this.skills.serialize(), kills: this.kills,
      bossActive: !!(this.boss && this.boss.alive), bossHp: this.boss?.alive ? this.boss.hp : 0,
      rngSeed: this.rngSeed, pendingCurrency: this.computeEmber(), bonus: this.bonus,
      updated_at: new Date().toISOString(),
    };
  }

  autoSave() {
    if (this.gameOver) return;
    SaveManager.saveActiveRun(this.buildRunSnapshot());
  }

  buildResult(win) {
    return {
      win, timeSec: this.timeSec, kills: this.kills, bossKills: this.bossKills,
      maxHit: this.maxHit, ember: this.computeEmber(), difficultyId: this.difficultyId,
      skills: this.skills.statsList(),
    };
  }

  finishRun(win) {
    if (this.gameOver) return;
    this.gameOver = true;
    SaveManager.clearActiveRun(); // 勝敗確定で途中セーブ削除
    this.physics.world.resume();
    this.time.paused = false;
    this.tweens.resumeAll();
    const result = this.buildResult(win);
    this.time.delayedCall(600, () => this.scene.start('ResultScene', result));
  }

  onPlayerDeath() {
    if (this.gameOver) return;
    this.effects.screenShake(300, 0.012);
    this.finishRun(false);
  }

  returnToTitle() {
    this.physics.world.resume();
    this.time.paused = false;
    this.scene.start('TitleScene');
  }

  toggleAuto() {
    this.autoMove = !this.autoMove;
    this.settings.autoMove = this.autoMove;
    SaveManager.saveSettings(this.settings);
  }
}
