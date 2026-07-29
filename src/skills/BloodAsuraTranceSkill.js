// 血染修羅（M8-E・修羅の構えの進化 / 補助: 血気 Lv4）:
// 攻めの構えをさらに鋭くし、**この構えの最中に討ち取った相手からだけ**血気の巡りを小幅に強める。
// - 既存 bloodlust の毎秒上限は共有したまま（永久機関にならない）。
// - ライフスティールではない（撃破時にだけ効く）。自傷もしない。
// - 軽減ペナルティは合計から差し引くだけで、不屈 / 重装 / 闘気解放を無効化しない。
// - 構えは常に 1 つ。重ねがけせず、reload でもバフ / 回復窓が二重にならない。
import { BattleTranceSkill } from './BattleTranceSkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class BloodAsuraTranceSkill extends BattleTranceSkill {
  tranceParams() {
    const d = this.evoDef;
    const st = d.stance || {};
    return {
      duration: Math.min(st.durationMs || 0, this.cap('maxStanceMs', 10000)),
      meleeDamageBonus: st.meleeDamageBonus || 0, attackSpeedBonus: st.attackSpeedBonus || 0,
      comboGraceBonus: st.comboGraceBonus || 0, furyGainBonus: st.furyGainBonus || 0,
      mitigationPenalty: st.mitigationPenalty || 0,
      initialShock: d.damage?.initialShock || 0, poiseDamage: d.poiseDamage?.initialShock || 0,
      knockback: d.knockback?.initialShock || 0,
      comboGain: d.comboGain?.perShock,
      maxTranceMs: this.cap('maxStanceMs', 10000), stack: 'refresh',
      // 血の誓い（構え中の撃破だけ・上限は safetyCaps と balance の両方で頭打ち）。
      killHealBonus: Math.min(d.bloodOath?.killHealBonus || 0, this.cap('maxKillHealBonus', 0.5)),
      perSecondCapBonus: Math.min(d.bloodOath?.perSecondCapBonus || 0, this.cap('maxKillHealBonus', 0.5)),
    };
  }

  newCastKey() {
    const key = super.newCastKey();
    const d = this.evoDef;
    if (this.warrior) {
      this.warrior.setCastLimits(key, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    }
    return key;
  }

  fire() {
    // 構えは常に 1 つ（maxStances が 0 なら構えない）。
    if (this.cap('maxStances', 1) < 1) return;
    super.fire();
  }
}
applyEvolvedSemantics(BloodAsuraTranceSkill);
