// 氷槍貫通（frost_mage）: 高威力の貫通氷槍。冷気が高い敵ほど追加ダメージ（bonusPerChill）。
// 凍結中の敵へ命中すると粉砕し、その先の敵へ進行する（同じ槍が同じ敵を複数回粉砕しない＝registerHit で保証）。
// projectile（Job Lv80 発射数+1 対象）。冷気/凍結判定・粉砕は checkCollisions の共通経路で処理する。

import { SkillBase } from './SkillBase.js';

export class GlacialLanceSkill extends SkillBase {
  fire(ctx) {
    const s = this.stats;
    const p = this.scene.player;
    const target = this.scene.combat.nearestEnemy(p.x, p.y, p.cfg.attackRange);
    if (!target) return;

    const baseAng = Math.atan2(target.y - p.y, target.x - p.x);
    const count = this.fireProjectileCount(s.count || 1); // Lv80: 発射数+1
    const proc = this.def?.procCoefficient ?? 1.0;
    const hg = this.scene.nextHitGroupId();
    const scale = this.visualScale();
    const spread = 0.08;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spread;
      this.scene.combat.spawnPlayerProjectile(p.x, p.y, baseAng + offset, s.projectileSpeed || 340, {
        skillId: this.id, element: 'ice',
        damage: s.damage, pierce: s.pierce || 3, pierceFalloff: 1,
        chillAmount: s.chillAmount, procCoefficient: proc, hitGroupId: hg,
        bonusPerChill: s.bonusPerChill || 0, shatterOnFrozen: true, shatterMultiplier: s.shatterMultiplier || 1.2,
        scale: (scale || 1) * 1.2, lifeMs: 1400, tint: 0x80d8ff,
      });
    }
  }

  // 途中再開でクールダウンを維持（再読込での CD 全回復・即時再発動を防ぐ）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
}
