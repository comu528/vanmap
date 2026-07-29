// 天鏡返し（M8-E・刃返しの進化 / 補助: active 迎撃の構え Lv6）:
// 弾には弾き返しで、斬りかかってくる相手には**既存の反撃調停**で応じる。
// - 迎撃の構えは**置換されず CD にも触らない**（別スキルとして併存する）。
// - 1 つの被弾 / 弾イベントに応じるのは最大 1 系統（弾＝弾き返し・近接＝反撃）。
//   調停は WarriorCombatSystem.arbitrateDeflectionAndCounter() に一元化してある。
// - 反射弾を再び弾くことはない（deflectGeneration の上限）。
// - reload 後も window の残り時間・弾いた回数・反撃の使用状況を引き継ぐ。
import { WeaponDeflectionSkill } from './WeaponDeflectionSkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class HeavenMirrorReversalSkill extends WeaponDeflectionSkill {
  deflectParams() {
    const d = this.evoDef;
    const df = d.deflection || {};
    return {
      windowDuration: df.windowMs || 0,
      maxDeflections: Math.min(df.maxDeflections || 1, this.cap('maxDeflectionsPerWindow', 8)),
      deflectRadius: d.area?.deflectRadius || 0,
      reflectedDamage: Math.min(d.damage?.reflected || 0, this.cap('maxReflectDamage', 96)),
      reflectedSpeed: df.reflectedSpeed || 0,
      poiseDamage: d.poiseDamage?.reflected || 0,
      visualIntensity: 1,
      comboGain: d.comboGain?.perDeflect, furyGain: d.furyGain?.perDeflect,
      maxWindowMs: 3000, reflectEnabled: true,
      reflectLifeMs: df.reflectLifeMs || 900,
      mirrorCounter: true,
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

  // 近接被弾は既存の反撃調停へそのまま渡す（弾き返しの残数を消費しない）。
  // 1 被弾につき反応は最大 1 系統で、counter_stance の CD も無料発動も作らない。
  performMirrorCounter(raw, applied) {
    const w = this.warrior;
    if (this._dead || !w || !w.deflectionState(this.id)) return null;
    const maxPer = this.cap('maxCounterPerEvent', 1);
    if (maxPer < 1) return null;
    const pick = w.arbitrateDeflectionAndCounter('melee');
    if (!pick || pick.kind !== 'counter') return null;
    w.noteMirrorCounter();
    this.scene.skills.recordExtra(this.id, 'mirrorCounters', 1, 'add');
    void raw; void applied;
    return pick.source;
  }
}
applyEvolvedSemantics(HeavenMirrorReversalSkill);
