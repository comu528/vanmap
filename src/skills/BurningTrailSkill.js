// 燃える軌跡: プレイヤーの移動経路に炎を残す。継続ダメージ＋敵の減速。
// レベルで ダメージ/持続/範囲/減速/クールダウン/見た目 が変化。
// 炎パッチは「データ（位置・半径・寿命）」で判定し、見た目は別スプライトで表現する。

import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

const TICK_MS = 260;

export class BurningTrailSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.patches = [];
  }

  canFire() { return true; } // 敵がいなくても軌跡は残す

  fire() {
    const s = this.stats;
    const p = this.scene.player;
    const sprite = this.scene.add.image(p.x, p.y, TEX.PARTICLE)
      .setTint(0xff7043).setBlendMode(Phaser.BlendModes.ADD).setDepth(45)
      .setScale(s.radius / 4 * this.visualScale());
    sprite.setAlpha(0.7);
    this.patches.push({
      x: p.x, y: p.y, radius: s.radius, damage: s.damage, slow: s.slow || 0,
      expire: s.duration, tick: 0, sprite,
    });
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで新パッチ生成
    // 既存パッチの継続ダメージと寿命管理
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const patch = this.patches[i];
      patch.expire -= dt;
      patch.tick -= dt;
      if (patch.sprite) patch.sprite.setAlpha(0.7 * Math.max(0, patch.expire) / this.stats.duration);
      if (patch.tick <= 0) {
        patch.tick = TICK_MS;
        this.scene.combat.forEachEnemyInRadius(patch.x, patch.y, patch.radius, (e) => {
          this.scene.combat.dealDamage(e, patch.damage, this.id, { quiet: true, color: 0xff7043 });
          if (patch.slow > 0 && e.applySlow) e.applySlow(patch.slow, TICK_MS + 60);
        });
      }
      if (patch.expire <= 0) {
        if (patch.sprite) patch.sprite.destroy();
        this.patches.splice(i, 1);
      }
    }
  }

  destroy() {
    for (const p of this.patches) if (p.sprite) p.sprite.destroy();
    this.patches = [];
  }
}
