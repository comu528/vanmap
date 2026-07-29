// 血盟戦旗（M8-D・戦旗招集の進化 / 補助: 血気 Lv4）:
// 陣の内側で敵を倒したときだけ、血気（bloodlust）の回復がわずかに強まる。
// - 旗は**常に 1 本だけ**。重ねて立てても置き換わる（stack しない）。
// - 強化されるのは「陣の内側にいるとき」だけ。外へ出れば即座に元の血気へ戻る。
// - 既存の血気 policy（発生条件・秒間 cap の存在）は変えない。cap を少し上げるだけで、
//   cap そのものを外さない＝永久機関にならない。
// - 陣は WarriorCombatSystem.serializeTimedBuffs() が保存する。reload で二重回復しない。
import { RallyingBannerSkill } from './RallyingBannerSkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class BloodOathStandardSkill extends RallyingBannerSkill {
  bannerParams() {
    const d = this.evoDef;
    const f = d.field || {};
    return {
      duration: Math.min(f.durationMs || 0, this.cap('maxFieldMs', 12000)),
      radius: d.area?.radius || 0,
      comboGrace: f.comboGrace || 0, furyGain: f.furyGain || 0,
      mitigation: f.mitigationValue || 0, meleeArea: f.meleeArea || 0,
      initialShock: d.damage?.initialShock || 0,
      initialPoise: d.poiseDamage?.initialShock || 0,
      knockback: d.knockback?.initialShock || 0,
      comboGain: d.comboGain?.perShock,
      // 重ねがけ規則と壁内マージンは基礎と同じ（進化でも旗は 1 本・置換）。
      stack: 'refresh', worldMargin: 24,
      // 血の誓い（陣の内側でのみ効く）。上限は safetyCaps と balance の両方で頭打ちになる。
      killHealBonus: Math.min(d.bloodOath?.killHealBonus || 0, this.cap('maxKillHealBonus', 0.5)),
      perSecondCapBonus: Math.min(d.bloodOath?.perSecondCapBonus || 0, this.cap('maxKillHealBonus', 0.5)),
    };
  }

  // 1 発動 = 1 castKey。闘気 / コンボの加算上限をその場で結び付ける。
  newCastKey() {
    const key = super.newCastKey();
    const d = this.evoDef;
    if (this.warrior) {
      this.warrior.setCastLimits(key, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    }
    return key;
  }

  fire() {
    // 旗の本数上限（0 なら陣を張らない）。data と balance の小さい方を採る。
    const fields = Math.min(this.cap('maxFields', 1), this.scene.combat.skillCap('maxRallyFields', 1));
    if (fields < 1) return;
    super.fire();
  }
}
applyEvolvedSemantics(BloodOathStandardSkill);
