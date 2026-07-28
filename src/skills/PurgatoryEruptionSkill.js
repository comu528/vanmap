// 煉獄噴火（火柱の進化）: 敵の密集地点で複数の火柱が連続噴火し、最後に大爆発。
// 跡地に燃焼地帯を残し、通常敵を軽く引き寄せる（ボスは対象外）。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

export class PurgatoryEruptionSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.burnPatches = [];
  }

  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const d = this.evoDef;
    const spot = this.scene.combat.densestPoint(d.area?.pillarRadius || 58, 0);
    if (!spot) return;
    const cx = spot.x, cy = spot.y;

    // 通常敵を軽く引き寄せる（ボス除外）。
    const pull = d.pull;
    if (pull) {
      this.scene.combat.forEachEnemyInRadius(cx, cy, pull.radius, (e) => {
        if (e.isBoss && pull.excludeBoss !== false) return; // pull.excludeBoss（data）でボス除外を制御
        if (e.applyKnockback) e.applyKnockback(2 * cx - e.x, 2 * cy - e.y, pull.strength); // 反対点からのノックバック＝中心へ牽引
      });
    }

    const pillars = Math.min(this.cap('maxPillars', 8), d.projectileCount?.pillars || 5);
    const seqDelay = d.projectileCount?.sequenceDelay || 130;
    const bonusFinal = this.evolvedBonus().finalRadiusMult || 0;
    const areaMul = this.passiveAreaMult(); // パッシブ「焦熱拡張」（未取得なら 1）
    const pillarR = (d.area?.pillarRadius || 58) * areaMul;

    for (let i = 0; i < pillars; i++) {
      const jx = cx + (this.scene.rng() - 0.5) * 40;
      const jy = cy + (this.scene.rng() - 0.5) * 40;
      this.scene.effects.telegraph(jx, jy, pillarR, 260, 0xff7043);
      this.scene.time.delayedCall(i * seqDelay + 260, () => {
        if (this.scene.gameOver) return;
        this.scene.effects.pillarBurst(jx, jy, pillarR);
        this.scene.effects.sparks(jx, jy, 6, 0xffca28);
        this.scene.aoe(jx, jy, pillarR, d.damage?.pillar || 70, this.id, { knockback: 20 });
      });
    }
    // 最後に大爆発 + 燃焼地帯
    this.scene.time.delayedCall(pillars * seqDelay + 320, () => {
      if (this.scene.gameOver) return;
      const finalR = (d.area?.finalRadius || 104) * (1 + bonusFinal) * areaMul;
      this.scene.effects.meteorImpact(cx, cy, finalR);
      this.scene.effects.screenShake(220, 0.008);
      this.scene.effects.hitStop(45);
      this.scene.aoe(cx, cy, finalR, d.damage?.finalBlast || 170, this.id, { crit: true });
      this.spawnBurnGround(cx, cy);
    });
  }

  spawnBurnGround(x, y) {
    const d = this.evoDef;
    const radius = (d.area?.burnGroundRadius || 44) * this.passiveAreaMult();
    const dur = (d.area?.burnGroundDuration || 1600) * this.passiveDurationMult();
    const sprite = this.scene.add.image(x, y, TEX.PARTICLE)
      .setTint(0xd84315).setBlendMode(Phaser.BlendModes.ADD).setDepth(44)
      .setScale(radius / 4).setAlpha(0.5);
    this.burnPatches.push({
      x, y, radius, damage: d.damage?.burnGround || 8,
      expire: dur, maxDuration: dur, tick: 0, sprite,
    });
  }

  // クールダウン発火に加え、燃焼地帯の継続ダメージを毎フレーム処理する。
  update(dt, ctx) {
    super.update(dt, ctx);
    const tickMs = this.cap('burnTickMs', 300);
    for (let i = this.burnPatches.length - 1; i >= 0; i--) {
      const patch = this.burnPatches[i];
      patch.expire -= dt; patch.tick -= dt;
      if (patch.sprite) patch.sprite.setAlpha(0.5 * Math.max(0, patch.expire) / (patch.maxDuration || this.evoDef.area?.burnGroundDuration || 1600));
      if (patch.tick <= 0) {
        patch.tick = tickMs;
        this.scene.combat.forEachEnemyInRadius(patch.x, patch.y, patch.radius, (e) => {
          this.scene.combat.dealDamage(e, patch.damage, this.id, { quiet: true, color: 0xd84315, tag: 'dot' });
        });
      }
      if (patch.expire <= 0) { if (patch.sprite) patch.sprite.destroy(); this.burnPatches.splice(i, 1); }
    }
  }

  destroy() {
    for (const p of this.burnPatches) if (p.sprite) p.sprite.destroy();
    this.burnPatches = [];
  }

  // M8-A: クールダウンを保存（燃焼地帯は寿命つきのため保存しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
}
