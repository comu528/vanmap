// 無影燕返（M8-D・燕返しの進化 / 補助: 戦闘本能 Lv4）:
// 後退してから二度斬り返す。二段目だけは近距離の別の敵へ向き直れる。
// - 向き直りは「角度を変える」だけで、座標を飛ばさない（テレポート禁止）。
// - コンボは猶予（grace）を戻すだけ。コンボ値そのものを無料で配らない。
// - 1 発動 = 1 castKey = 1 recordCast（二段目では recordCast しない）。
import { BackstepRiposteSkill } from './BackstepRiposteSkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class ShadowSwallowRiposteSkill extends BackstepRiposteSkill {
  riposteParams() {
    const d = this.evoDef;
    return {
      damage: d.damage?.first || 0,
      backstep: d.movement?.backstep || 0, lunge: d.movement?.lunge || 0,
      mitigation: d.mitigation?.value || 0, arc: d.area?.arc || 0,
      poiseDamage: d.poiseDamage?.first || 0, knockback: d.knockback?.first || 0,
      comboGain: d.comboGain?.perRiposte, furyGain: d.furyGain?.perRiposte,
      radius: d.area?.radius || d.meleeRange || 104,
      retargetRange: d.area?.retargetRange || 0,
      ripostes: this.cap('maxRipostesPerCast', 2),
      maxRetargets: this.cap('maxRetargetsPerCast', 1),
      maxTargets: this.cap('maxTargetsPerRiposte', 8),
      backstepMs: d.mitigation?.durationMs ?? 320,
      lungeSpeed: d.movement?.lungeSpeed ?? 620,
      maxRiposteMs: 700, worldMargin: 24,
      graceRefill: d.graceRefill?.ratio || 0,
    };
  }

  // 段ごとの数値（二段目が本命）。
  strikeValues(index, P) {
    const d = this.evoDef;
    const second = index >= 1;
    return {
      damage: (second ? d.damage?.second : d.damage?.first) || P.damage,
      knockback: (second ? d.knockback?.second : d.knockback?.first) || 0,
      poiseDamage: (second ? d.poiseDamage?.second : d.poiseDamage?.first) || 0,
    };
  }

  // 1 発動 = 1 castKey。闘気 / コンボの加算上限をその場で結び付ける（二段目でも増えない）。
  newCastKey() {
    const key = super.newCastKey();
    const d = this.evoDef;
    if (this.warrior) {
      this.warrior.setCastLimits(key, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    }
    return key;
  }
}
applyEvolvedSemantics(ShadowSwallowRiposteSkill);
