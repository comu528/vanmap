// 周回する炎: プレイヤーの周囲を火球が回転し、接触した敵へダメージ。
// レベルで 個数/回転速度/半径/ダメージ/見た目 が変化。
// 各火球は「角度・半径」で位置を決め、距離判定でダメージを与える（見た目非依存）。

import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

const HIT_INTERVAL = 400; // 同じ敵への連続ヒット間隔

export class OrbitingFlameSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.angle = 0;
    this.orbs = [];
    this._hitCooldown = new Map(); // enemy -> 残り時間
    this._rebuild();
  }

  onLevelChanged() { this._rebuild(); }

  _rebuild() {
    for (const o of this.orbs) o.destroy();
    this.orbs = [];
    const s = this.stats;
    const count = s.count || 1;
    const scale = this.visualScale();
    for (let i = 0; i < count; i++) {
      const spr = this.scene.add.image(0, 0, TEX.FIREBALL)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(52).setScale(0.8 * scale);
      this.orbs.push(spr);
    }
  }

  canFire() { return false; } // クールダウン発火は使わず、常時 update で処理

  update(dt, ctx) {
    const s = this.stats;
    if (this.orbs.length !== (s.count || 1)) this._rebuild();
    this.angle += (s.rotationSpeed || 2) * dt / 1000;

    const p = this.scene.player;
    const radius = s.radius;
    const n = this.orbs.length;

    // ヒットクールダウン減衰
    for (const [e, t] of this._hitCooldown) {
      const nt = t - dt;
      if (nt <= 0 || !e.alive) this._hitCooldown.delete(e);
      else this._hitCooldown.set(e, nt);
    }

    for (let i = 0; i < n; i++) {
      const a = this.angle + (Math.PI * 2 * i) / n;
      const ox = p.x + Math.cos(a) * radius;
      const oy = p.y + Math.sin(a) * radius;
      const orb = this.orbs[i];
      orb.setPosition(ox, oy);
      // 接触判定
      this.scene.combat.forEachEnemyInRadius(ox, oy, 10, (e) => {
        if (this._hitCooldown.has(e)) return;
        this._hitCooldown.set(e, HIT_INTERVAL);
        this.scene.skills.recordCast(this.id);
        this.scene.combat.dealDamage(e, s.damage, this.id, { color: 0xff9800 });
      });
    }
  }

  destroy() {
    for (const o of this.orbs) o.destroy();
    this.orbs = [];
    this._hitCooldown.clear();
  }
}
