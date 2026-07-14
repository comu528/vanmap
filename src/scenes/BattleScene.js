// 戦闘シーン（Milestone 1）。
// プレイヤー移動/ダッシュ、敵出現、自動火球、敵撃破、経験値、レベルアップ3択を実装。
// ボス・リザルト・5種スキル・オート移動の本格実装は Milestone 2 以降（TODO 参照）。

import { GAME_WIDTH, GAME_HEIGHT, TEX } from '../config/game-config.js';
import { DataManager } from '../systems/DataManager.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { Projectile } from '../entities/Projectile.js';
import { ExperienceGem } from '../entities/ExperienceGem.js';
import { Pool } from '../systems/PoolManager.js';
import { HUD } from '../ui/HUD.js';
import { distance } from '../utils/math.js';

const WORLD_W = 1600;
const WORLD_H = 1200;

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
    this.difficulty = DataManager.getDifficulty(this.difficultyId) || DataManager.balance.difficulties[0];

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    // 地面（タイル）
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, TEX.GROUND).setOrigin(0, 0).setDepth(-10);

    // プレイヤー
    const pcfg = { ...bal.player, baseXpToLevel: bal.leveling.baseXpToLevel };
    this.player = new Player(this, WORLD_W / 2, WORLD_H / 2, pcfg);
    this.player.setDepth(50);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    // プール
    this.enemyPool = new Pool(this, () => new Enemy(this), (e, def, x, y, m) => e.reset(def, x, y, m), 200);
    this.projPool = new Pool(this, () => new Projectile(this), (p, x, y, a, s, o) => p.reset(x, y, a, s, o), 400);
    this.gemPool = new Pool(this, () => new ExperienceGem(this), (g, x, y, v) => g.reset(x, y, v), 400);

    // 進行状態
    this.timeSec = 0;
    this.kills = 0;
    this.autoMove = false;
    this.paused = false;
    this.gameOver = false;
    this.reachedBossTime = false;

    // スキル/強化状態（M1）
    this.fireballLevel = 1;
    this._fireCooldown = 0;
    this._spawnAccum = 0;
    this._nearestRecalc = 0;
    this._nearestEnemy = null;

    // 経験値/移動などのボーナス（恒久強化は M3 で本接続）
    this.bonus = { moveMult: 1, pickupMult: 1, xpMult: 1 };
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

    // タブ非表示 / フォーカス喪失で自動停止（中断対応）
    this._onVisibility = () => { if (document.hidden) this.forcePause(); };
    document.addEventListener('visibilitychange', this._onVisibility);
    this._onBlur = () => this.forcePause();
    this.game.events.on('blur', this._onBlur);

    this.events.once('shutdown', () => this.cleanup());

    this.showBanner(`${this.difficulty.name} 開始 — 5分生存を目指せ`);
  }

  cleanup() {
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.game.events.off('blur', this._onBlur);
  }

  // ---------------- メインループ ----------------
  update(time, delta) {
    if (this.paused || this.gameOver) return;
    const dt = delta; // ms

    this.timeSec += dt / 1000;

    this.handleInput(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateGems(dt);
    this.autoFire(dt);
    this.handleSpawning(dt);
    this.checkCollisions();
    this.checkBossTime();

    this.hud.update({
      player: this.player,
      timeSec: this.timeSec,
      kills: this.kills,
      difficultyName: this.difficulty.name,
      autoMove: this.autoMove,
    });
  }

  handleInput(dt) {
    let ix = 0, iy = 0;
    const k = this.keys;
    // 手動入力（矢印 + WSD、左は A / 矢印左）
    if (k.leftA.isDown || k.moveLeft.isDown) ix -= 1;
    if (k.rightA.isDown || k.right.isDown) ix += 1;
    if (k.upA.isDown || k.up.isDown) iy -= 1;
    if (k.downA.isDown || k.down.isDown) iy += 1;

    const manual = ix !== 0 || iy !== 0;

    if (this.autoMove && !manual) {
      const v = this.computeAutoMove();
      ix = v.x; iy = v.y;
    }

    // ダッシュ
    if (Phaser.Input.Keyboard.JustDown(this.keys.dash)) {
      this.player.tryDash(ix, iy);
    }

    this.player.handleMovement(dt, ix, iy);
  }

  // 簡易オート移動（M1）：最寄り敵の反対方向へ + 近くのジェムへ寄る。
  // 完璧ではない挙動にして手動操作の価値を残す。本格版は M2。
  computeAutoMove() {
    let vx = 0, vy = 0;
    const p = this.player;
    if (this._nearestEnemy && this._nearestEnemy.alive) {
      const ang = Math.atan2(p.y - this._nearestEnemy.y, p.x - this._nearestEnemy.x);
      vx += Math.cos(ang); vy += Math.sin(ang);
    }
    // 画面端に追い込まれない補正
    const margin = 120;
    if (p.x < margin) vx += 0.6;
    if (p.x > WORLD_W - margin) vx -= 0.6;
    if (p.y < margin) vy += 0.6;
    if (p.y > WORLD_H - margin) vy -= 0.6;
    const len = Math.hypot(vx, vy) || 1;
    return { x: vx / len, y: vy / len };
  }

  updateEnemies(dt) {
    this.enemyPool.forEachActive((e) => e.update(this.player.x, this.player.y, dt));
  }

  updateProjectiles(dt) {
    const toRelease = [];
    this.projPool.forEachActive((p) => {
      p.update(dt);
      if (!p.alive || p.x < -50 || p.y < -50 || p.x > WORLD_W + 50 || p.y > WORLD_H + 50) toRelease.push(p);
    });
    toRelease.forEach((p) => this.projPool.release(p));
  }

  updateGems(dt) {
    const magnet = 90 * this.bonus.pickupMult;
    const pickup = this.player.cfg.pickupRadius * this.bonus.pickupMult;
    const collected = [];
    this.gemPool.forEachActive((g) => {
      if (g.update(this.player.x, this.player.y, pickup, magnet)) collected.push(g);
    });
    for (const g of collected) {
      this.grantXp(g.value);
      this.gemPool.release(g);
    }
  }

  // ---------------- 自動火球 ----------------
  autoFire(dt) {
    this._fireCooldown -= dt;
    this._nearestRecalc -= dt;
    if (this._nearestRecalc <= 0) {
      this._nearestRecalc = 120; // 最寄り敵検索は一定間隔ごと
      this._nearestEnemy = this.findNearestEnemy();
    }
    if (this._fireCooldown > 0) return;
    const target = this._nearestEnemy;
    if (!target || !target.alive) return;

    const lv = DataManager.getSkillLevel('fireball', this.fireballLevel);
    if (!lv) return;
    this._fireCooldown = lv.cooldown;

    const baseAng = Math.atan2(target.y - this.player.y, target.x - this.player.x);
    const count = lv.count || 1;
    const spread = 0.18;
    const scale = ({ small: 0.9, medium: 1.1, large: 1.4, huge: 1.7 }[lv.visual]) || 1;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spread;
      this.projPool.spawn(this.player.x, this.player.y, baseAng + offset, 260, {
        damage: lv.damage, pierce: lv.pierce, knockback: lv.knockback,
        explosionRadius: lv.explosionRadius, scale, lifeMs: 1500,
      });
    }
  }

  findNearestEnemy() {
    let best = null, bestD = Infinity;
    const px = this.player.x, py = this.player.y, range = this.player.cfg.attackRange;
    this.enemyPool.forEachActive((e) => {
      if (!e.alive) return;
      const d = distance(px, py, e.x, e.y);
      if (d < bestD && d <= range) { bestD = d; best = e; }
    });
    return best;
  }

  // ---------------- 出現 ----------------
  handleSpawning(dt) {
    const phase = this.currentPhase();
    if (this.enemyPool.activeCount >= this.effectiveMaxAlive(phase)) return;
    this._spawnAccum += dt;
    const interval = phase.spawnIntervalMs / (this.difficulty.spawnRate || 1);
    while (this._spawnAccum >= interval) {
      this._spawnAccum -= interval;
      this.spawnEnemy();
    }
  }

  currentPhase() {
    const phases = DataManager.balance.run.phases;
    for (const ph of phases) {
      if (this.timeSec >= ph.fromSec && this.timeSec < ph.toSec) return ph;
    }
    return phases[phases.length - 1];
  }

  effectiveMaxAlive(phase) {
    return Math.min(phase.maxAlive, this.enemyPool.maxSize);
  }

  spawnEnemy() {
    const def = this.pickEnemyType();
    if (!def) return;
    // カメラ外周にスポーン
    const cam = this.cameras.main;
    const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const r = Math.max(cam.width, cam.height) * 0.62;
    let x = this.player.x + Math.cos(ang) * r;
    let y = this.player.y + Math.sin(ang) * r;
    x = Phaser.Math.Clamp(x, 20, WORLD_W - 20);
    y = Phaser.Math.Clamp(y, 20, WORLD_H - 20);
    const mult = {
      hp: this.difficulty.enemyHp, speed: this.difficulty.enemySpeed, damage: this.difficulty.enemyDamage,
    };
    this.enemyPool.spawn(def, x, y, mult);
  }

  pickEnemyType() {
    const pool = DataManager.enemies.filter((e) => this.timeSec >= (e.spawnFromSec || 0) && !e.elite);
    if (pool.length === 0) return DataManager.getEnemy('slime');
    // エリート出現
    if (Math.random() < (this.difficulty.eliteRate || 0)) {
      const elites = DataManager.enemies.filter((e) => e.elite && this.timeSec >= (e.spawnFromSec || 0));
      if (elites.length) return Phaser.Utils.Array.GetRandom(elites);
    }
    return Phaser.Utils.Array.GetRandom(pool);
  }

  // ---------------- 当たり判定（手動、プール対応） ----------------
  checkCollisions() {
    const p = this.player;
    const pr = 8;

    // 弾 vs 敵
    this.projPool.forEachActive((proj) => {
      if (!proj.alive) return;
      const rr = 8 * proj.scaleX;
      this.enemyPool.forEachActive((e) => {
        if (!e.alive || !proj.alive) return;
        const rad = rr + e.displayWidth * 0.4;
        if (distance(proj.x, proj.y, e.x, e.y) <= rad) {
          if (!proj.registerHit(e)) return;
          this.damageEnemy(e, proj.damage, proj);
          if (proj.explosionRadius > 0) this.explode(proj.x, proj.y, proj.explosionRadius, proj.damage * 0.5, e);
          proj.consumePierce();
        }
      });
    });

    // 敵 vs プレイヤー
    if (p.alive) {
      this.enemyPool.forEachActive((e) => {
        if (!e.alive) return;
        const rad = pr + e.displayWidth * 0.4;
        if (distance(p.x, p.y, e.x, e.y) <= rad) {
          if (p.takeDamage(e.damage)) {
            this.cameras.main.shake(120, 0.006);
            if (!p.alive) this.onPlayerDeath();
          }
        }
      });
    }
  }

  explode(x, y, radius, dmg, source) {
    this.spawnHitBurst(x, y, 0xff9800);
    this.enemyPool.forEachActive((e) => {
      if (!e.alive || e === source) return;
      if (distance(x, y, e.x, e.y) <= radius) this.damageEnemy(e, dmg, null);
    });
  }

  damageEnemy(e, dmg, proj) {
    const died = e.takeDamage(dmg);
    if (proj && proj.knockback) e.applyKnockback(this.player.x, this.player.y, proj.knockback);
    this.spawnHitBurst(e.x, e.y, 0xffe082);
    if (died) this.onEnemyKilled(e);
  }

  onEnemyKilled(e) {
    this.kills++;
    this.spawnDeathBurst(e.x, e.y);
    this.gemPool.spawn(e.x, e.y, e.xpValue);
    this.enemyPool.release(e);
  }

  grantXp(value) {
    const gained = Math.max(1, Math.round(value * this.bonus.xpMult));
    const ups = this.player.gainXp(gained, DataManager.balance.leveling.xpGrowth);
    if (ups > 0) this.openLevelUp();
  }

  // ---------------- レベルアップ ----------------
  openLevelUp() {
    this.forcePause(false);
    const choices = this.rollChoices();
    this.scene.launch('LevelUpScene', {
      choices,
      onPick: (choice) => {
        choice.apply();
        this.updateHudSkills();
        this.resumeFromMenu();
      },
    });
  }

  rollChoices() {
    const opts = [];
    if (this.fireballLevel < 8) {
      const next = DataManager.getSkillLevel('fireball', this.fireballLevel + 1);
      opts.push({
        id: 'fireball_up', title: `火球 Lv.${this.fireballLevel + 1}`, icon: 'icon_fireball',
        description: `ダメージ ${next.damage} / 発射 ${next.count} / 貫通 ${next.pierce}`,
        apply: () => { this.fireballLevel++; },
      });
    }
    opts.push({
      id: 'max_hp', title: '最大HP +20', icon: 'icon_flame_pillar',
      description: 'HPを20回復し最大値を増加', apply: () => { this.player.maxHp += 20; this.player.heal(20); },
    });
    opts.push({
      id: 'move', title: '移動速度 +10%', icon: 'icon_burning_trail',
      description: '移動が速くなる', apply: () => { this.bonus.moveMult *= 1.1; this.player.moveSpeed *= 1.1; },
    });
    opts.push({
      id: 'pickup', title: '吸収範囲 +30%', icon: 'icon_orbiting_flame',
      description: '経験値を集めやすくなる', apply: () => { this.bonus.pickupMult *= 1.3; },
    });
    opts.push({
      id: 'xp', title: '経験値獲得 +20%', icon: 'icon_meteor',
      description: '得られる経験値が増える', apply: () => { this.bonus.xpMult *= 1.2; },
    });

    // 3つをランダム抽出（火球強化は優先的に含める）
    const shuffled = Phaser.Utils.Array.Shuffle(opts.slice());
    return shuffled.slice(0, DataManager.balance.leveling.choicesPerLevel || 3);
  }

  updateHudSkills() {
    this.hud.setSkills([{ name: '火球', level: this.fireballLevel }]);
  }

  // ---------------- エフェクト（簡易） ----------------
  spawnHitBurst(x, y, color) {
    const g = this.add.image(x, y, TEX.PARTICLE).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(60);
    this.tweens.add({ targets: g, scale: 3, alpha: 0, duration: 180, onComplete: () => g.destroy() });
  }

  spawnDeathBurst(x, y) {
    for (let i = 0; i < 5; i++) {
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const g = this.add.image(x, y, TEX.PARTICLE).setTint(0xff7043).setBlendMode(Phaser.BlendModes.ADD).setDepth(60);
      this.tweens.add({
        targets: g, x: x + Math.cos(ang) * 20, y: y + Math.sin(ang) * 20, alpha: 0, scale: 0.5,
        duration: 260, onComplete: () => g.destroy(),
      });
    }
  }

  showBanner(text) {
    const t = this.add.text(GAME_WIDTH / 2, 90, text, {
      fontSize: '11px', color: '#fff', backgroundColor: '#3e2723', padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1100);
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 600, onComplete: () => t.destroy() });
  }

  // ---------------- ボス時間（M2 で本実装） ----------------
  checkBossTime() {
    if (!this.reachedBossTime && this.timeSec >= DataManager.balance.run.bossAtSec) {
      this.reachedBossTime = true;
      this.showBanner('5分到達！ボス・リザルトは Milestone 2 で実装予定');
    }
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
    if (showMenu) {
      this._pauseUi = this.add.container(0, 0).setScrollFactor(0).setDepth(1200);
      const bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setScrollFactor(0);
      const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, '一時停止', { fontSize: '18px', color: '#ffab40' }).setOrigin(0.5).setScrollFactor(0);
      const resume = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 14, '▶ 再開', { fontSize: '13px', color: '#ffe0b2' }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
      const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 'タイトルへ戻る', { fontSize: '11px', color: '#bcaaa4' }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
      resume.on('pointerdown', () => this.resumeFromMenu());
      title.on('pointerdown', () => this.returnToTitle());
      this._pauseUi.add([bg, t, resume, title]);
    }
  }

  resumeFromMenu() {
    if (!this.paused) return;
    this.paused = false;
    this.physics.world.resume();
    if (this._pauseUi) { this._pauseUi.destroy(); this._pauseUi = null; }
  }

  // ---------------- 終了 ----------------
  onPlayerDeath() {
    this.gameOver = true;
    this.physics.world.pause();
    const bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setScrollFactor(0).setDepth(1200);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, 'ゲームオーバー', { fontSize: '20px', color: '#ff5252' }).setOrigin(0.5).setScrollFactor(0).setDepth(1201);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, `生存 ${Math.floor(this.timeSec)}秒 / 討伐 ${this.kills}`, { fontSize: '11px', color: '#ffe0b2' }).setOrigin(0.5).setScrollFactor(0).setDepth(1201);
    const retry = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, '再挑戦', { fontSize: '13px', color: '#ffab40' }).setOrigin(0.5).setScrollFactor(0).setDepth(1201).setInteractive({ useHandCursor: true });
    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 54, 'タイトルへ', { fontSize: '11px', color: '#bcaaa4' }).setOrigin(0.5).setScrollFactor(0).setDepth(1201).setInteractive({ useHandCursor: true });
    retry.on('pointerdown', () => this.scene.restart({ difficulty: this.difficultyId, resume: null }));
    title.on('pointerdown', () => this.returnToTitle());
    // リザルト画面は Milestone 2 で実装（TODO 参照）。
  }

  returnToTitle() {
    this.physics.world.resume();
    this.scene.start('TitleScene');
  }

  toggleAuto() {
    this.autoMove = !this.autoMove;
  }
}
