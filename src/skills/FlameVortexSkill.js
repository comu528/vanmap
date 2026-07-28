// 火炎渦（M6-B）: 密集地点に一定時間残る渦。範囲内へ継続ダメージ＋中心へ緩く吸引（ボスは弱め）。終了時に小爆発。
// 吸引は速度補正（applyKnockback を中心の反対点から＝中心へ牽引）で、ワープさせない。同時存在数に上限。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

const BOSS_PULL = 0.15; // ボスへの吸引は弱める

export class FlameVortexSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.vortices = []; }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats;
    const cap = Math.min(s.maxActive || 1, this.scene.combat.skillCap('maxActiveVortices', 4));
    if (this.vortices.length >= cap) return;
    const spot = this.scene.combat.densestPoint(s.radius || 48, 0);
    if (!spot) return;
    const sprite = this.scene.add.image(spot.x, spot.y, TEX.PARTICLE).setTint(0xff9800)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(43).setAlpha(0.32).setScale((s.radius || 48) / 2);
    this.vortices.push({ x: spot.x, y: spot.y, radius: s.radius || 48, damage: s.damage, pull: s.pull || 40, tick: 0, tickRate: s.tickRate || 300, expire: s.duration || 2000, endBurst: s.endBurst || 20, sprite });
    this.scene.skills.recordExtra(this.id, 'maxConcurrent', this.vortices.length, 'max');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i];
      v.expire -= dt; v.tick -= dt;
      if (v.sprite) v.sprite.setRotation((v.sprite.rotation || 0) + dt * 0.01);
      if (v.tick <= 0) {
        v.tick = v.tickRate;
        this.scene.combat.forEachEnemyInRadius(v.x, v.y, v.radius, (e) => {
          this.scene.combat.dealDamage(e, v.damage, this.id, { quiet: true, color: 0xff9800, tag: 'dot' });
          if (e.applyKnockback) e.applyKnockback(2 * v.x - e.x, 2 * v.y - e.y, e.isBoss ? v.pull * BOSS_PULL : v.pull * 0.3);
        });
      }
      if (v.expire <= 0) {
        this.scene.effects.explosion(v.x, v.y, v.radius, 0xff7043);
        this.scene.aoe(v.x, v.y, v.radius, v.endBurst, this.id, {});
        if (v.sprite) v.sprite.destroy();
        this.vortices.splice(i, 1);
      }
    }
  }

  destroy() { for (const v of this.vortices) if (v.sprite) v.sprite.destroy(); this.vortices = []; }

  // M8-A: クールダウンを保存（渦本体は寿命つきの設置物のため保存せず二重生成しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
}
