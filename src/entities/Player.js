// プレイヤー（火属性の魔女）。移動・ダッシュ・HP・被弾無敵・レベル/経験値を持つ。
// 自動攻撃（火球）の発射判定は BattleScene 側の SkillManager が扱う。

import { TEX } from '../config/game-config.js';
import { clamp } from '../utils/math.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, cfg) {
    super(scene, x, y, TEX.PLAYER);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.body.setSize(this.width * 0.5, this.height * 0.6, true);

    this.cfg = cfg;
    this.maxHp = cfg.maxHp;
    this.hp = cfg.maxHp;
    this.moveSpeed = cfg.moveSpeed;

    // ダッシュ
    this.dashMax = cfg.dashCount;
    this.dashCharges = cfg.dashCount;
    this.dashSpeed = cfg.dashSpeed;
    this.dashDurationMs = cfg.dashDurationMs;
    this.dashInvulnMs = cfg.dashInvulnMs;
    this.dashRechargeMs = cfg.dashRechargeMs;
    this._dashTimer = 0;
    this._dashCooldownAccum = 0;
    this._dashDir = new Phaser.Math.Vector2();

    // 無敵
    this.invulnMs = cfg.invulnMs;
    this._invulnUntil = 0;

    // 進行
    this.level = 1;
    this.xp = 0;
    this.xpToNext = cfg.baseXpToLevel || 5;

    this.alive = true;
  }

  get isDashing() { return this._dashTimer > 0; }
  get isInvulnerable() { return this.scene.time.now < this._invulnUntil || this.isDashing; }

  tryDash(dirX, dirY) {
    if (this.isDashing || this.dashCharges <= 0) return false;
    if (dirX === 0 && dirY === 0) return false;
    this._dashDir.set(dirX, dirY).normalize();
    this._dashTimer = this.dashDurationMs;
    this.dashCharges--;
    this._invulnUntil = Math.max(this._invulnUntil, this.scene.time.now + this.dashInvulnMs);
    return true;
  }

  // 移動処理。入力ベクトルは -1..1。
  handleMovement(dt, inputX, inputY) {
    if (!this.alive) { this.setVelocity(0, 0); return; }

    if (this.isDashing) {
      this._dashTimer -= dt;
      this.setVelocity(this._dashDir.x * this.dashSpeed, this._dashDir.y * this.dashSpeed);
    } else {
      const len = Math.hypot(inputX, inputY) || 1;
      this.setVelocity((inputX / len) * this.moveSpeed, (inputY / len) * this.moveSpeed);
      if (inputX < 0) this.setFlipX(true);
      else if (inputX > 0) this.setFlipX(false);
    }

    // ダッシュ回復
    if (this.dashCharges < this.dashMax) {
      this._dashCooldownAccum += dt;
      if (this._dashCooldownAccum >= this.dashRechargeMs) {
        this._dashCooldownAccum = 0;
        this.dashCharges++;
      }
    }

    // 被弾無敵中の点滅
    this.setAlpha(this.isInvulnerable && !this.isDashing ? 0.5 : 1);
  }

  takeDamage(amount) {
    if (!this.alive || this.isInvulnerable) return false;
    this.hp = clamp(this.hp - amount, 0, this.maxHp);
    this._invulnUntil = this.scene.time.now + this.invulnMs;
    if (this.hp <= 0) {
      this.alive = false;
      this.setVelocity(0, 0);
    }
    return true;
  }

  heal(amount) {
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
  }

  // 経験値を加算し、レベルアップしたら回数を返す。
  gainXp(amount, xpGrowth = 1.35) {
    this.xp += amount;
    let levelUps = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      levelUps++;
      this.xpToNext = Math.round(this.xpToNext * xpGrowth);
    }
    return levelUps;
  }
}
