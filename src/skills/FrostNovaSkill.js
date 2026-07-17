// 氷輪爆（frost_mage）: プレイヤー周囲へ氷の衝撃波。範囲内の敵へ氷ダメージ＋高めの冷気。
// 凍結中の敵へ命中したら粉砕する（同じ発動で1対象1回・粉砕から粉砕は再帰しない）。projectile ではなく area。

import { SkillBase } from './SkillBase.js';

export class FrostNovaSkill extends SkillBase {
  fire(ctx) {
    const s = this.stats;
    const p = this.scene.player;
    const proc = this.def?.procCoefficient ?? 0.7;
    const hg = this.scene.nextHitGroupId();
    this.scene.effects.explosion(p.x, p.y, s.radius, 0x9fe8ff);
    // 同じ発動で同じ敵へ1回だけ命中（enemiesInRadius は一意集合）。
    for (const e of this.scene.combat.enemiesInRadius(p.x, p.y, s.radius)) {
      // 凍結中なら先に粉砕（凍結状態のうちに）。粉砕は氷ダメージとして計上し isShatter で再帰しない。
      if (this.scene.combat.isFrozen(e)) {
        this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: s.shatterDamageMultiplier || 1, skillPower: s.damage });
      }
      this.scene.combat.dealDamage(e, s.damage, this.id, {
        element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: s.baseFreezeChance,
        procCoefficient: proc, hitGroupId: hg, color: 0x9fe8ff,
      });
    }
  }

  // 残響/複製（custom）: 攻撃サイクルの再現＝周囲へ1回ぶんの氷輪パルス（粉砕は行わず冷気/ダメージのみ）。
  echoCast() {
    const s = this.stats; const p = this.scene.player;
    this.scene.combat.damageArea(p.x, p.y, s.radius, s.damage, this.id, {
      element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: s.baseFreezeChance,
      procCoefficient: this.def?.procCoefficient ?? 0.7, hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x9fe8ff,
    });
  }
  cloneCast() { this.echoCast(); }

  // 途中再開でクールダウンを維持（再読込での CD 全回復・即時再発動を防ぐ）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
}
