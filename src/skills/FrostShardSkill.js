// 氷晶弾（frost_mage 初期スキル）: 最も近い敵へ氷弾を発射。命中で氷ダメージと冷気を付与し、低確率で凍結。
// 通常の projectile スキル（Job Lv80 発射数+1 対象）。冷気/凍結判定は弾の命中時に共通経路（StatusEffectManager）で処理する。

import { SkillBase } from './SkillBase.js';

export class FrostShardSkill extends SkillBase {
  fire(ctx) {
    const s = this.stats;
    const p = this.scene.player;
    const target = this.scene.combat.nearestEnemy(p.x, p.y, p.cfg.attackRange);
    if (!target) return;

    const baseAng = Math.atan2(target.y - p.y, target.x - p.x);
    // Lv80: 発射数+1（未解放/Lv1 では恒等）。M7-E: 品質別の安全上限 maxFrostShards でクランプ（通常値では恒等）。
    const count = Math.min(this.fireProjectileCount(s.count || 1), this.scene.combat.skillCap('maxFrostShards', 72));
    const proc = this.def?.procCoefficient ?? 0.9;
    const hg = this.scene.nextHitGroupId();
    const scale = this.visualScale();
    const spread = 0.15;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spread;
      this.scene.combat.spawnPlayerProjectile(p.x, p.y, baseAng + offset, s.projectileSpeed || 300, {
        skillId: this.id, element: 'ice',
        damage: s.damage, pierce: s.pierce || 0,
        chillAmount: s.chillAmount, baseFreezeChance: s.baseFreezeChance,
        procCoefficient: proc, hitGroupId: hg,
        scale, lifeMs: 1500, tint: 0x9fe8ff,
      });
    }
  }

  // 途中再開でクールダウンを維持（再読込での CD 全回復・即時再発動を防ぐ）。弾の位置は保存しない。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
}
