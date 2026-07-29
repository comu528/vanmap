// 城塞蹂躙（M8-D・鉄壁突進の進化 / 補助: 重装 Lv4）:
// 突進が長く続き、前面の受け流しが厚くなり、終点の衝撃も大きくなる。
// - 完全無敵にはならない。前面軽減は data の上限でクランプされ、合計軽減も 70% で必ず頭打ちになる。
// - 再読込で二重に突進しない（途中状態は保存しない）。
import { ShieldChargeSkill } from './ShieldChargeSkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class FortressRampageSkill extends ShieldChargeSkill {
  chargeParams() {
    const d = this.evoDef;
    return {
      damage: d.damage?.contact || 0,
      duration: Math.min(d.charge?.durationMs || 0, this.cap('maxChargeMs', 1200)),
      speed: d.charge?.speed || 0,
      frontArc: d.charge?.frontArc || 0,
      frontalMitigation: d.mitigation?.frontalValue || 0,
      impactDamage: d.damage?.impact || 0,
      width: d.area?.width || 0,
      poiseDamage: d.poiseDamage?.contact || 0,
      knockback: d.knockback?.contact || 0,
      comboGain: d.comboGain?.perContact, furyGain: d.furyGain?.perContact,
      maxChargeMs: this.cap('maxChargeMs', 1200),
      worldMargin: 24,
      impactRadiusFactor: (d.area?.impactRadius || 1) / Math.max(1, d.area?.width || 1),
    };
  }

  fire() {
    super.fire();
    const d = this.evoDef;
    if (this._charge && this.warrior) {
      this.warrior.setCastLimits(this._charge.castKey, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    }
  }

  // 終点の衝撃（1 発動 1 回・maxImpactsPerCast でも守る）。
  _impact(C, P, p) {
    const d = this.evoDef;
    const impacts = Math.min(this.cap('maxImpactsPerCast', 1), 1);
    if (impacts < 1) return;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(d.area?.impactRadius), arc: Math.PI * 2, facing: 0,
      damage: d.damage?.impact, skillId: this.id, castKey: C.castKey,
      knockback: d.knockback?.impact, poiseDamage: d.poiseDamage?.impact, poiseOnceSet: new Set(),
      comboGain: d.comboGain?.perImpact, furyGain: d.furyGain?.perImpact,
      maxTargets: this.cap('maxTargetsPerImpact', 20),
      tags: ['melee', 'blunt', 'area'], color: 0x42a5f5, visualIndex: 1, debris: true,
      visualCap: 'maxChargeTrails',
    });
  }
}
applyEvolvedSemantics(FortressRampageSkill);
