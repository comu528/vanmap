// 拡散火弾（M6-B）: 最寄りの敵方向を中心に扇状へ複数の火弾。近距離集中・遠距離拡散。1発は火球より低威力。
import { SkillBase } from './SkillBase.js';

export class ScatterFlameSkill extends SkillBase {
  fire() {
    const s = this.stats; const p = this.scene.player;
    const t = this.scene.combat.nearestEnemy(p.x, p.y, p.cfg.attackRange);
    if (!t) return;
    if (this.scene.projPool.activeCount >= this.scene.projPool.maxSize) return;
    const base = Math.atan2(t.y - p.y, t.x - p.x);
    const count = this.fireProjectileCount(s.count || 3); const spread = Math.min(s.spread || 0.5, 1.4); // M6-C Lv80: 発射数+1・後方まで撃たない
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
      this.scene.combat.spawnPlayerProjectile(p.x, p.y, base + off, s.speed || 300, {
        skillId: this.id, damage: s.damage, pierce: s.pierce || 0, scale: 0.9, lifeMs: 1000, tint: 0xff7043, element: 'fire',
      });
    }
  }
}
