// 百鬼燎乱（追尾鬼火の進化・M6-B）: 大量の鬼火を継続生成。撃破時に上限付きで小型鬼火へ分裂。
// 一部は突撃せずプレイヤー周囲を防衛（近づいた敵を自動攻撃）。同時存在数/分裂数/生成に品質別上限。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class HundredWispParadeSkill extends EvolvedSkillBase {
  canFire() { return true; } // 敵がいなくても防衛鬼火を維持

  fire() {
    const d = this.evoDef; const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxHomingWisps', 50);
    const perFrameCap = this.cap('spawnPerFrame', 6);
    const want = Math.min(d.projectileCount?.perCast || 4, perFrameCap, Math.max(0, cap - this.scene.countProjBySkill(this.id)));
    const defRatio = d.projectileCount?.defenderRatio || 0.34;
    const durMul = this.passiveDurationMult();
    for (let i = 0; i < want; i++) {
      const defender = this.scene.rng() < defRatio;
      const ang = this.scene.rng() * Math.PI * 2;
      if (defender) {
        const near = this.scene.combat.nearestEnemy(p.x, p.y, d.area?.defenderRadius || 70);
        this.scene.combat.spawnPlayerProjectile(p.x + Math.cos(ang) * 20, p.y + Math.sin(ang) * 20, ang, 90, {
          skillId: this.id, damage: d.damage?.base || 22, pierce: 0,
          homingRate: 0.003, homingSpeed: 150, homingTarget: near, wanderMs: 200, retargets: 0,
          lifeMs: (d.projectileCount?.duration || 4200) * durMul, scale: 0.75, tint: 0x80d8ff, element: 'fire',
        });
      } else {
        const t = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
        this.scene.combat.spawnPlayerProjectile(p.x, p.y, ang, 120, {
          skillId: this.id, damage: d.damage?.base || 22, pierce: 0,
          homingRate: 0.005, homingSpeed: d.projectileCount?.homingSpeed || 260, homingTarget: t, wanderMs: 200,
          retargets: d.projectileCount?.retargets || 3, lifeMs: (d.projectileCount?.duration || 4200) * durMul, scale: 0.8, tint: 0xffd54f, element: 'fire',
        });
      }
    }
    this.scene.skills.recordExtra(this.id, 'maxConcurrent', this.scene.countProjBySkill(this.id), 'max');
  }

  // 撃破時分裂（上限付き・世代なしの単発分裂で無限増殖を防止）。
  onEnemyKilled(e, skillId) {
    if (skillId !== this.id) return;
    const d = this.evoDef;
    if (this.scene.rng() >= (d.projectileCount?.splitChance || 0.35)) return;
    if (this.scene.countProjBySkill(this.id) >= this.scene.combat.skillCap('maxSplitWisps', 40) + this.scene.combat.skillCap('maxHomingWisps', 50)) return;
    const t = this.scene.combat.nearestEnemy(e.x, e.y, 100000);
    const ang = this.scene.rng() * Math.PI * 2;
    this.scene.combat.spawnPlayerProjectile(e.x, e.y, ang, 120, {
      skillId: this.id, damage: (d.damage?.base || 22) * (d.damage?.splitFactor || 0.6), pierce: 0,
      homingRate: 0.005, homingSpeed: 240, homingTarget: t, wanderMs: 120, retargets: 2, lifeMs: 2600, scale: 0.6, tint: 0xff8a65, element: 'fire',
    });
  }
}
