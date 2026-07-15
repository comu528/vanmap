// 経験値ジェム。敵撃破時に落ち、プレイヤーが近づくと吸い寄せられる。

import { TEX } from '../config/game-config.js';

export class ExperienceGem extends Phaser.Physics.Arcade.Sprite {
  constructor(scene) {
    super(scene, 0, 0, TEX.GEM);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.alive = false;
    this.value = 1;
    this._attracting = false;
  }

  reset(x, y, value) {
    this.setPosition(x, y);
    this.value = value;
    this.alive = true;
    this._attracting = false;
    this._gridCell = null;             // 空間グリッド登録の残留防止
    this.setActive(true).setVisible(true).setAlpha(1);
    this.body.enable = true;
    this.setVelocity(0, 0);
  }

  update(px, py, pickupRadius, magnetRadius) {
    if (!this.alive) return false;
    const dx = px - this.x;
    const dy = py - this.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= pickupRadius * pickupRadius) return true; // 回収
    if (this._attracting || d2 <= magnetRadius * magnetRadius) {
      this._attracting = true;
      const ang = Math.atan2(dy, dx);
      this.setVelocity(Math.cos(ang) * 240, Math.sin(ang) * 240);
    } else {
      this.setVelocity(0, 0);
    }
    return false;
  }
}
