// 覇王討ち（M8-E・一騎討ちの進化 / 補助: 剛力 Lv4）:
// 格上だけを狙う決闘。相手の構えを崩すたびに決闘の時間がわずかに延び、
// 相手を倒したときだけ、近くのエリート / ボスへ **1 回だけ** 挑み直せる。
// - 延長にも再選択にも上限がある（通常敵の間を無限に渡り歩かない）。
// - formal な被ダメージ増加 debuff は作らない（戦士本人の補正としてだけ効く）。
// - reload 後に対象が存在しなければ、共通経路が安全に解除する。
import { DuelChallengeSkill } from './DuelChallengeSkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class KingSlayerDuelSkill extends DuelChallengeSkill {
  duelParams() {
    const d = this.evoDef;
    const du = d.duel || {};
    return {
      duration: du.durationMs || 0, range: d.area?.range || 0,
      meleeDamageBonus: du.meleeDamageBonus || 0, poiseDamageBonus: du.poiseDamageBonus || 0,
      furyGainBonus: du.furyGainBonus || 0,
      normalTargetHpPriority: du.normalTargetHpPriority || 0,
      initialStrike: d.damage?.initialStrike || 0, poiseDamage: d.poiseDamage?.initialStrike || 0,
      knockback: d.knockback?.initialStrike || 0,
      comboGain: d.comboGain?.perStrike, furyGain: d.furyGain?.perStrike,
      maxDuelMs: 12000, stack: 'refresh',
      // 進化のみ: 再選択（1 回まで・近距離の格上だけ）と体勢崩しによる延長（合計上限つき）。
      maxRetargets: this.cap('maxRetargetsPerCast', 1),
      retargetRange: d.area?.retargetRange || 0,
      extendPerBreakMs: d.extension?.perBreakMs || 0,
      maxExtensionMs: Math.min(d.extension?.maxTotalMs || 0,
        (d.extension?.perBreakMs || 0) * this.cap('maxExtensionsPerCast', 3)),
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
}
applyEvolvedSemantics(KingSlayerDuelSkill);
