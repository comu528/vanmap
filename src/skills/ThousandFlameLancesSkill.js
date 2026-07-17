// 千条炎槍（炎槍の進化・M6-B）: 一度に複数方向へ炎槍を連射（敵の多い方向を優先しつつ全方位）。
// 連続命中で威力上昇(ramp)、貫通を使い切ると小型炎槍へ分裂(splitGen で世代制限＝無限増殖なし)。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class ThousandFlameLancesSkill extends EvolvedSkillBase {
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const d = this.evoDef; const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxEvolutionProjectiles', 140);
    if (this.scene.projPool.activeCount >= cap) return;
    const target = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
    const baseAng = target ? Math.atan2(target.y - p.y, target.x - p.x) : 0;
    const focus = Math.min(this.cap('maxProjectilesPerCast', 22), (d.projectileCount?.base || 10) + this.chainBonus);
    const spread = 0.7;
    for (let i = 0; i < focus; i++) { const off = focus > 1 ? (i / (focus - 1) - 0.5) * spread : 0; this._lance(p.x, p.y, baseAng + off, d); }
    const all = d.projectileCount?.allDirections || 4;
    for (let i = 0; i < all; i++) this._lance(p.x, p.y, (i / all) * Math.PI * 2, d);
  }

  _lance(x, y, ang, d) {
    if (this.scene.projPool.activeCount >= this.scene.projPool.maxSize) return;
    this.scene.combat.spawnPlayerProjectile(x, y, ang, d.projectileCount?.speed || 600, {
      skillId: this.id, damage: d.damage?.base || 60, pierce: Math.min(this.cap('maxPierce', 10), d.projectileCount?.pierce || 8),
      behavior: 'split_lance', splitGen: this.cap('maxSplitGenerations', 2), splitCount: d.chain?.splitCount || 2, splitFactor: d.damage?.splitFactor || 0.55,
      ramp: d.damage?.rampPerHit || 0.06, scale: 0.85, lifeMs: 1300, tint: 0xffd54f, element: 'fire',
    });
  }
}
