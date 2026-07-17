// 炎槍（M6-B）: 最寄りの敵方向へ細く高速な貫通槍を発射。1本は同じ敵へ一度だけ命中（Projectile._hitSet）。
// 火球より細い・高威力・高速・貫通型。Lvで威力/貫通/発射数/速度/発射間隔が成長。
import { SkillBase } from './SkillBase.js';

export class FlameLanceSkill extends SkillBase {
  fire() {
    const s = this.stats; const p = this.scene.player;
    const t = this.scene.combat.nearestEnemy(p.x, p.y, p.cfg.attackRange * 1.3);
    if (!t) return;
    if (this.scene.projPool.activeCount >= this.scene.projPool.maxSize) return;
    const cap = this.scene.combat.skillCap('maxFlameLances', 80);
    if (this.scene.countProjBySkill(this.id) >= cap) return; // 上限で新規発射のみ抑制
    const base = Math.atan2(t.y - p.y, t.x - p.x);
    const count = s.count || 1; const spread = s.spread || 0;
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i - (count - 1) / 2) * spread : 0;
      this.scene.combat.spawnPlayerProjectile(p.x, p.y, base + off, s.speed || 460, {
        skillId: this.id, damage: s.damage, pierce: s.pierce || 0, knockback: 18, scale: 0.7, lifeMs: 1200, tint: 0xffab40, element: 'fire',
      });
    }
  }
}
