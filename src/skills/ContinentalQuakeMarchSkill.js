// 大陸震砕踏破（M8-E・震天踏破の進化 / 補助: 重装 Lv4）:
// 踏みの回数と最終衝撃を強化し、進んでいる間だけ小幅に打たれ強くなる。
// - **完全無敵にはならない**（合計軽減は従来どおり 70% でクランプされる）。
// - 最終衝撃は広いが、あくまで近距離の物理。画面を横断しない。
// - 通常敵を画面外へ押し出さない（ノックバックは共通経路の上限内）。
// - 1 発動 = 1 castKey = 1 recordCast。踏みごとに recordCast しない。
import { EarthshakerMarchSkill } from './EarthshakerMarchSkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class ContinentalQuakeMarchSkill extends EarthshakerMarchSkill {
  marchParams() {
    const d = this.evoDef;
    const m = d.march || {};
    return {
      damage: d.damage?.stomp || 0,
      stompCount: Math.min(m.stompCount || 1, this.cap('maxStompsPerCast', 7)),
      interval: m.intervalMs || 160, stepDistance: m.stepDistance || 0,
      radius: d.area?.radius || 0,
      knockback: d.knockback?.stomp || 0, poiseDamage: d.poiseDamage?.stomp || 0,
      finalStompMultiplier: 1,
      comboGain: d.comboGain?.perStomp, furyGain: d.furyGain?.perStomp,
      maxMarchMs: 2600, worldMargin: 24, avoidBossTelegraph: true,
      // 最終衝撃（広いが近距離のまま）と、前進中の小幅な軽減。
      finalRadius: d.area?.finalRadius || 0,
      finalDamage: d.damage?.finalStomp || 0,
      finalKnockback: d.knockback?.finalStomp || 0,
      finalPoise: d.poiseDamage?.finalStomp || 0,
      mitigation: Math.min(m.mitigationValue || 0, this.cap('maxMitigation', 0.2)),
      maxTargets: this.cap('maxTargetsPerStomp', 22),
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
applyEvolvedSemantics(ContinentalQuakeMarchSkill);
