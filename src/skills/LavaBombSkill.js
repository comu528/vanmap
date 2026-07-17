// 溶岩爆弾（M6-B）: 密集地点へ投下。予告後に遅延起爆（中心ほど高威力）。跡地に短い燃焼地帯。
// 隕石より小型・高頻度・遅延起爆型。予告は省略しない。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class LavaBombSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.patches = []; }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const count = s.count || 1;
    const durMul = this.passiveDurationMult();
    for (let i = 0; i < count; i++) {
      const spot = this.scene.combat.densestPoint(s.radius || 36, i);
      if (!spot) continue;
      const x = spot.x, y = spot.y, r = s.radius || 36; // s.radius は stats で passive area 反映済み
      this.scene.effects.telegraph(x, y, r, s.telegraph || 500, 0xff5722);
      this.scene.time.delayedCall(s.telegraph || 500, () => {
        if (this.scene.gameOver) return;
        this.scene.effects.explosion(x, y, r, 0xff5722);
        this.scene.effects.sparks(x, y, 6, 0xffca28);
        // 中心ほど高ダメージ（近接1.0倍・外周0.6倍）。damageArea を距離加重で。
        this.scene.combat.forEachEnemyInRadius(x, y, r, (e) => {
          const d = Math.hypot(e.x - x, e.y - y);
          const f = 1 - 0.4 * Math.min(1, d / r);
          this.scene.combat.dealDamage(e, s.damage * f, this.id, { from: { x, y }, knockback: 20 });
        });
        this._spawnBurn(x, y, r * 0.7, s.burnDamage || 4, (s.burnDuration || 1000) * durMul);
      });
    }
  }

  _spawnBurn(x, y, radius, dmg, dur) {
    const sprite = this.scene.add.image(x, y, TEX.PARTICLE).setTint(0xff5722)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(44).setScale(radius / 4).setAlpha(0.45);
    this.patches.push({ x, y, radius, damage: dmg, expire: dur, maxDuration: dur, tick: 0, sprite });
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const patch = this.patches[i];
      patch.expire -= dt; patch.tick -= dt;
      if (patch.sprite) patch.sprite.setAlpha(0.45 * Math.max(0, patch.expire) / (patch.maxDuration || 1));
      if (patch.tick <= 0) {
        patch.tick = 260;
        this.scene.combat.forEachEnemyInRadius(patch.x, patch.y, patch.radius, (e) => {
          this.scene.combat.dealDamage(e, patch.damage, this.id, { quiet: true, color: 0xff5722 });
        });
      }
      if (patch.expire <= 0) { if (patch.sprite) patch.sprite.destroy(); this.patches.splice(i, 1); }
    }
  }

  destroy() { for (const p of this.patches) if (p.sprite) p.sprite.destroy(); this.patches = []; }
}
