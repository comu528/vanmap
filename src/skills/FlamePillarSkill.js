// 火柱: 敵の位置へ予告表示 → 短時間後に火柱発生。範囲ダメージ＋軽い打ち上げ（ノックバック）。
// レベルで ダメージ/発射数(count)/範囲/持続/予告時間/クールダウン/見た目 が変化。

import { SkillBase } from './SkillBase.js';

export class FlamePillarSkill extends SkillBase {
  fire(ctx) {
    const s = this.stats;
    const targets = this.scene.combat.randomEnemies(s.count || 1);
    if (targets.length === 0) return;

    for (const t of targets) {
      const x = t.x, y = t.y;
      // 予告（演出のみ）
      this.scene.effects.telegraph(x, y, s.radius, s.telegraph, 0xff9800);
      // 予告後に判定＋演出
      this.scene.time.delayedCall(s.telegraph, () => {
        if (this.scene.gameOver) return;
        this.scene.effects.pillarBurst(x, y, s.radius);
        this.scene.combat.damageArea(x, y, s.radius, s.damage, this.id, {
          knockback: s.knockback || 0, from: { x, y },
        });
      });
    }
  }
}
