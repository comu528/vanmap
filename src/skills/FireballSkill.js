// 火球: 最も近い敵へ自動発射。命中で小爆発、軽いノックバック。
// レベルで ダメージ/発射数/貫通/爆発範囲/クールダウン/見た目 が変化。

import { SkillBase } from './SkillBase.js';

export class FireballSkill extends SkillBase {
  fire(ctx) {
    const s = this.stats;
    const p = this.scene.player;
    const target = this.scene.combat.nearestEnemy(p.x, p.y, p.cfg.attackRange);
    if (!target) return;

    const baseAng = Math.atan2(target.y - p.y, target.x - p.x);
    const count = this.fireProjectileCount(s.count || 1); // M6-C Lv80: 発射数+1（未解放/Lv1 では恒等）
    const spread = 0.16;
    const scale = this.visualScale();
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spread;
      this.scene.combat.spawnPlayerProjectile(p.x, p.y, baseAng + offset, 260, {
        skillId: this.id,
        damage: s.damage, pierce: s.pierce || 0, knockback: s.knockback || 0,
        explosionRadius: s.explosionRadius || 0, scale, lifeMs: 1500, tint: 0xffffff,
      });
    }
  }

  // M8-A: クールダウンを保存し、再開直後の無料発動を防ぐ（自動火球）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
}
