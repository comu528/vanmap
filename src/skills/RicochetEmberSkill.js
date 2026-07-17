// 跳炎弾（M6-D）: 敵や画面端で反射する火弾を発射。反射のたびに別の敵を優先して狙い、
// 同じ敵への連続再命中には待機（retriggerMs）を設ける。反射処理は Scene（behavior:'ricochet'）が担当。
// 発射数は fireProjectileCount、同時弾数は skillCap で上限。
import { SkillBase } from './SkillBase.js';

export class RicochetEmberSkill extends SkillBase {
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxRicochetProjectiles', 44);
    const room = Math.max(0, cap - this.scene.countProjBySkill(this.id));
    const count = Math.min(this.fireProjectileCount(s.count || 1), room);
    if (count <= 0) return;
    const t = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
    const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : this.scene.rng() * Math.PI * 2;
    const spread = 0.22;
    for (let i = 0; i < count; i++) {
      if (this.scene.projPool.activeCount >= this.scene.projPool.maxSize) break;
      const off = count > 1 ? (i - (count - 1) / 2) * spread : 0;
      this.scene.combat.spawnPlayerProjectile(p.x, p.y, base + off, s.speed || 300, {
        skillId: this.id, damage: s.damage, behavior: 'ricochet',
        bounceCount: s.bounces || 2, bounceDamageFactor: s.bounceDamageFactor || 1,
        retriggerMs: s.retriggerMs || 300, scale: 0.6, lifeMs: 2000, tint: 0xffab40, element: 'fire',
      });
    }
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
}
