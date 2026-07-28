// 盾撃（M8-B・戦士）: 短い前方 blunt。ダメージは中程度で、ノックバックと体勢削りが大きい。
// 発動直後に短い被ダメージ軽減を得る（WarriorCombatSystem の mitigation ウィンドウ）。
// 同一敵への体勢削りは 1 発動につき 1 回だけ（多段で二重に削らない）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class ShieldBashSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._mitigationLeft = 0; }
  canFire(ctx) { return !!ctx.hasEnemies; }

  update(dt, ctx) {
    if (this._mitigationLeft > 0) this._mitigationLeft = Math.max(0, this._mitigationLeft - dt);
    super.update(dt, ctx);
  }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const castKey = this.newCastKey();
    const strikes = this.strikeCount(s.strikes || 1);
    const gap = (this.def?.config?.strikeIntervalMs ?? 130);
    const ang = this.facing(this.meleeRadius(s.radius));
    const poiseOnce = this.def?.config?.poiseOncePerTargetPerCast !== false;
    const poised = poiseOnce ? new Set() : null;
    this._strike(ang, castKey, poised, 0);
    for (let k = 1; k < strikes; k++) {
      this.scene.time.delayedCall(k * gap, () => {
        if (this._dead || this.scene.gameOver) return;
        this._strike(ang, castKey, poised, k);
      });
    }
    // 発動直後の短い軽減（WarriorCombatSystem が合計上限内で合成する）。
    this._mitigationLeft = s.mitigationMs || 0;
    this.scene.skills.recordExtra(this.id, 'mitigationWindows', 1, 'add');
  }

  // Player.takeDamage が参照する軽減値（0..1）。窓が閉じていれば 0。
  activeMitigation() {
    const s = this.stats;
    return this._mitigationLeft > 0 ? (s?.mitigationValue || 0) : 0;
  }

  _strike(ang, castKey, poised, index) {
    const s = this.stats; const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(s.radius), arc: s.arc, facing: ang,
      damage: s.damage, skillId: this.id, castKey,
      knockback: s.knockback, poiseDamage: s.poiseDamage, poiseOnceSet: poised,
      comboGain: s.comboGain, furyGain: s.furyGain,
      tags: ['melee', 'blunt'], color: 0xb0bec5, visualIndex: index,
    });
  }

  serializeState() { return { cdLeft: this._cd, mitigationLeft: this._mitigationLeft }; }
  restoreState(st) { if (!st) return; if (typeof st.cdLeft === 'number') this._cd = st.cdLeft; this._mitigationLeft = Math.max(0, st.mitigationLeft || 0); }
  destroy() { this._dead = true; this._mitigationLeft = 0; }
}
