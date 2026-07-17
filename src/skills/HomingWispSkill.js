// 追尾鬼火（M6-B）: 鬼火を生成し、短く漂った後に敵を追尾。対象死亡時は残り時間内で別の敵を再捕捉。
// 敵がいなければプレイヤー周辺で待機。生存時間(duration=passive)と同時存在数(cap)に上限。
import { SkillBase } from './SkillBase.js';

export class HomingWispSkill extends SkillBase {
  canFire() { return true; } // 敵がいなくても生成し待機する

  fire() {
    const s = this.stats; const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxHomingWisps', 50);
    const room = Math.max(0, cap - this.scene.countProjBySkill(this.id));
    const count = Math.min(this.fireProjectileCount(s.count || 2), room); // M6-C Lv80: 発射数+1（skillCaps=room を超えない）
    for (let i = 0; i < count; i++) {
      const ang = this.scene.rng() * Math.PI * 2;
      const target = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
      this.scene.combat.spawnPlayerProjectile(p.x + Math.cos(ang) * 12, p.y + Math.sin(ang) * 12, ang, 110, {
        skillId: this.id, damage: s.damage, pierce: 0,
        homingRate: 0.004, homingSpeed: s.homingSpeed || 200, homingTarget: target, wanderMs: s.wanderMs || 400,
        retargets: s.retargets || 1, lifeMs: s.duration || 3000, scale: 0.8, tint: 0xffd54f, element: 'fire',
      });
    }
  }
}
