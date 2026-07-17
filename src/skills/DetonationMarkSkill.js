// 起爆刻印（M6-B）: 一定間隔で複数の敵へ刻印を付与。火属性攻撃/炎上が規定回数命中すると起爆
// （BattleScene.dealDamage → detonateMark）。刻印敵の死亡でも小起爆。同一対象へはスタックせず再付与は残り時間更新。
// 起爆ダメージ自体は刻印カウントを進めない（isMarkDetonation）＝無限再起爆を防止。コンボ用スキル。
import { SkillBase } from './SkillBase.js';

export class DetonationMarkSkill extends SkillBase {
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats;
    const cap = this.scene.combat.skillCap('maxMarks', 30);
    let budget = Math.min(s.markCount || 2, Math.max(0, cap - this.scene.combat.markedCount()));
    if (budget <= 0) return;
    const areaMul = this.passiveAreaMult(), durMul = this.passiveDurationMult();
    const now = this.scene.time.now;
    for (const e of this.scene.combat.randomEnemies(budget * 3)) {
      if (budget <= 0) break;
      if (e.isBoss) continue;
      if (e._mark && now < e._mark.until) { e._mark.until = now + (s.markDuration || 4000) * durMul; continue; } // 再付与は残り時間更新（スタックしない）
      e._mark = {
        skillId: this.id, hits: 0, hitsNeeded: s.hitsNeeded || 3, until: now + (s.markDuration || 4000) * durMul,
        detonateDamage: s.detonateDamage, detonateRadius: (s.detonateRadius || 40) * areaMul, deathDamage: s.deathDamage,
        chain: false,
      };
      budget--;
    }
  }
}
