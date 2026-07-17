// 連鎖炎（M6-B）: 最寄りの敵へ炎を飛ばし、命中後に近くの別の敵へ連鎖（BattleScene._chainHit）。
// 同一発動で同じ敵へ二重連鎖しない（chainVisited 共有）。連鎖は generation と品質別 maxChainDepth で明示制限。
import { SkillBase } from './SkillBase.js';

export class ChainFlameSkill extends SkillBase {
  fire() {
    const s = this.stats; const p = this.scene.player;
    const t = this.scene.combat.nearestEnemy(p.x, p.y, p.cfg.attackRange * 1.4);
    if (!t) return;
    const ang = Math.atan2(t.y - p.y, t.x - p.x);
    this.scene.combat.spawnPlayerProjectile(p.x, p.y, ang, s.speed || 340, {
      skillId: this.id, damage: s.damage, pierce: 0,
      behavior: 'chain', chainCount: s.chainCount || 2, chainRange: (s.chainRange || 120) * this.passiveAreaMult(),
      chainFalloff: s.falloff || 0.85, chainVisited: new Set(), generation: 0,
      scale: 0.9, lifeMs: 1200, tint: 0xffee58, element: 'fire',
    });
  }
}
