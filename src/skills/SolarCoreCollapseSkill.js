// 太陽核崩壊（溶岩爆弾の進化・M6-B）: 巨大な太陽核を密集地点へ投下。爆発前に周囲を引き寄せ、明確な予告後に大爆発。
// 跡地に大型溶岩地帯（継続ダメージ＋炎上）を残す。低頻度・画面を埋める巨大攻撃。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

export class SolarCoreCollapseSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.patches = []; }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const d = this.evoDef;
    const spot = this.scene.combat.densestPoint(d.area?.finalRadius || 130, 0);
    if (!spot) return;
    const x = spot.x, y = spot.y;
    const areaMul = this.passiveAreaMult(), durMul = this.passiveDurationMult();
    const finalR = (d.area?.finalRadius || 130) * areaMul;
    const tg = d.telegraph || 1200;
    // 明確な予告＋カウント演出
    this.scene.effects.telegraph(x, y, finalR, tg, 0xffab00);
    const core = this.scene.add.image(x, y, TEX.FIREBALL).setTint(0xffe082).setBlendMode(Phaser.BlendModes.ADD).setDepth(60).setScale(1);
    this.scene.tweens.add({ targets: core, scale: finalR / 8, alpha: 0.9, duration: tg, onComplete: () => core.destroy() });
    // 引き寄せ（予告中に数回・ボス除外）
    for (let k = 1; k <= 3; k++) {
      this.scene.time.delayedCall((tg * k) / 4, () => {
        if (this.scene.gameOver) return;
        this.scene.combat.forEachEnemyInRadius(x, y, (d.area?.pullRadius || 150) * areaMul, (e) => {
          if (e.isBoss) return;
          if (e.applyKnockback) e.applyKnockback(2 * x - e.x, 2 * y - e.y, (this.evoDef.pull?.strength || 90) * 0.4);
        });
      });
    }
    this.scene.time.delayedCall(tg, () => {
      if (this.scene.gameOver) return;
      this.scene.effects.meteorImpact(x, y, finalR);
      this.scene.effects.screenShake(280, 0.01);
      this.scene.effects.whiteFlash();
      this.scene.aoe(x, y, finalR, d.damage?.blast || 260, this.id, { crit: true });
      this._spawnLava(x, y, (d.area?.lavaRadius || 96) * areaMul, d.damage?.lavaTick || 14, (d.area?.lavaDuration || 3200) * durMul);
    });
  }

  _spawnLava(x, y, radius, dmg, dur) {
    const sprite = this.scene.add.image(x, y, TEX.PARTICLE).setTint(0xff5722).setBlendMode(Phaser.BlendModes.ADD).setDepth(44).setScale(radius / 4).setAlpha(0.5);
    this.patches.push({ x, y, radius, damage: dmg, expire: dur, maxDuration: dur, tick: 0, sprite });
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    const tickMs = this.cap('lavaTickMs', 300);
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const patch = this.patches[i];
      patch.expire -= dt; patch.tick -= dt;
      if (patch.sprite) patch.sprite.setAlpha(0.5 * Math.max(0, patch.expire) / (patch.maxDuration || 1));
      if (patch.tick <= 0) {
        patch.tick = tickMs;
        this.scene.combat.forEachEnemyInRadius(patch.x, patch.y, patch.radius, (e) => {
          this.scene.combat.dealDamage(e, patch.damage, this.id, { quiet: true, color: 0xff5722, tag: 'dot' });
          if (!e.isBoss && e.ignite && !e.ignited) e.ignite(900, 0);
        });
      }
      if (patch.expire <= 0) { if (patch.sprite) patch.sprite.destroy(); this.patches.splice(i, 1); }
    }
  }

  destroy() { for (const p of this.patches) if (p.sprite) p.sprite.destroy(); this.patches = []; }
}
