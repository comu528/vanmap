// 業火弾幕（火球の進化）: 多数の火球を扇状に連射。撃破で追撃火球（BattleScene の on-kill 予算）、
// 着弾で連鎖爆発（explosionRadius）。貫通後も威力が落ちにくい（pierceFalloff を高めに）。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class InfernalBarrageSkill extends EvolvedSkillBase {
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const d = this.evoDef;
    const p = this.scene.player;
    const target = this.scene.combat.nearestEnemy(p.x, p.y, p.cfg.attackRange);
    if (!target) return;

    const baseAng = Math.atan2(target.y - p.y, target.x - p.x);
    // 連鎖拡張ぶんも発射数へ反映（安全上限内）。
    const count = Math.min(this.cap('maxProjectilesPerCast', 14), (d.projectileCount?.base || 6) + this.chainBonus);
    const spread = d.projectileCount?.spread ?? 0.5;
    const pierce = Math.min(this.cap('maxPierce', 6), 4);
    for (let i = 0; i < count; i++) {
      const offset = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
      this.scene.combat.spawnPlayerProjectile(p.x, p.y, baseAng + offset, 280, {
        skillId: this.id,
        damage: d.damage?.base || 46,
        pierce,
        pierceFalloff: d.damage?.pierceFalloff ?? 0.92,
        knockback: 30,
        explosionRadius: d.area?.explosionRadius || 30,
        scale: 1.4, lifeMs: 1600, tint: 0xffca28,
      });
    }
  }
}
