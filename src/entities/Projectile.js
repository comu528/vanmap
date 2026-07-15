// 弾（火球）。オブジェクトプールで再利用する。

import { TEX } from '../config/game-config.js';

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  constructor(scene) {
    super(scene, 0, 0, TEX.FIREBALL);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setBlendMode(Phaser.BlendModes.ADD);
    this.alive = false;
    this.damage = 0;
    this.pierce = 0;
    this.knockback = 0;
    this.explosionRadius = 0;
    this.hostile = false;       // true = 敵（ボス）弾。プレイヤーへ命中判定する
    this.skillId = null;        // 与ダメージ集計用（プレイヤー弾）
    this._hitSet = new Set();
    this._lifeTimer = 0;
  }

  reset(x, y, angle, speed, opts) {
    this.setPosition(x, y);
    this.damage = opts.damage;
    this.pierce = opts.pierce || 0;
    this.knockback = opts.knockback || 0;
    this.explosionRadius = opts.explosionRadius || 0;
    this.hostile = !!opts.hostile;
    this.skillId = opts.skillId || null;
    this.pierceFalloff = opts.pierceFalloff || 1; // 貫通ごとの威力減衰（1=減衰なし）
    this._hitSet.clear();
    this._lifeTimer = opts.lifeMs || 1600;
    this.alive = true;
    this.setActive(true).setVisible(true).setAlpha(1);
    this.setScale(opts.scale || 1);
    this.setTint(opts.tint || 0xffffff);
    this.setRotation(angle);
    this.body.enable = true;
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  update(dt) {
    if (!this.alive) return;
    this._lifeTimer -= dt;
    if (this._lifeTimer <= 0) this.alive = false;
  }

  // 一つの敵に一度だけ命中させる。true = 命中を受け付けた。
  registerHit(enemy) {
    if (this._hitSet.has(enemy)) return false;
    this._hitSet.add(enemy);
    return true;
  }

  consumePierce() {
    if (this.pierce > 0) { this.pierce--; return true; }
    this.alive = false;
    return false;
  }
}
