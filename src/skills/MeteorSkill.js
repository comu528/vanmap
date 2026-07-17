// 隕石: 一定時間ごとに敵が多い場所へ落下。大範囲ダメージ＋強い画面揺れ。長いクールダウン。
// レベルで ダメージ/範囲/落下数(count)/予告時間/揺れ/クールダウン/見た目 が変化。

import { SkillBase } from './SkillBase.js';

export class MeteorSkill extends SkillBase {
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats;
    const count = s.count || 1;
    for (let i = 0; i < count; i++) {
      const spot = this.scene.combat.densestPoint(s.radius, i);
      if (!spot) continue;
      const { x, y } = spot;
      this.scene.effects.telegraph(x, y, s.radius, s.telegraph, 0xd84315);
      this.scene.time.delayedCall(s.telegraph, () => {
        if (this.scene.gameOver) return;
        this.scene.effects.meteorImpact(x, y, s.radius);
        this.scene.effects.screenShake(200, 0.004 + s.shake * 0.0004);
        this.scene.effects.hitStop(45); // 強攻撃のみヒットストップ
        this.scene.combat.damageArea(x, y, s.radius, s.damage, this.id, { crit: true, isExplosion: true });
      });
    }
  }
}
