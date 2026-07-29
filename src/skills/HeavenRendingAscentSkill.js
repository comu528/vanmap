// 天衝断空（M8-D・昇竜斬の進化 / 補助: 剛力 Lv4）:
// 二段の斬り上げ。一段目で通常敵を集めて打ち上げ、二段目の短い衝撃で叩き落とす。
// - エリート / ボスは打ち上げず、その分が体勢削りへ変換される（共通経路の launchPolicy）。
// - 1 発動 = 1 castKey = 1 recordCast（二段目では recordCast しない）。
// - 同一敵の打ち上げは 1 発動につき 1 回だけ。
import { RisingSlashSkill } from './RisingSlashSkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class HeavenRendingAscentSkill extends RisingSlashSkill {
  risingParams() {
    const d = this.evoDef;
    return {
      damage: d.damage?.first || 0, range: d.area?.range || 0, width: d.area?.width || 0,
      launchDuration: d.launch?.durationMs || 0, launchHeight: d.launch?.height || 0,
      poiseDamage: d.poiseDamage?.first || 0, knockback: d.knockback?.first || 0,
      maxTargets: this.cap('maxTargetsPerStage', 10),
      comboGain: d.comboGain?.perFirst, furyGain: d.furyGain?.perFirst,
      launchPerTarget: this.cap('maxLaunchPerTargetPerCast', 1),
      launchImmuneMs: d.launch?.immuneMs ?? 0,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const d = this.evoDef;
    const P = this.risingParams();
    const castKey = this.newCastKey();
    if (this.warrior) {
      this.warrior.setCastLimits(castKey, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    }
    const ang = this.facing(this.meleeRadius(P.range));
    // 打ち上げは 1 発動につき同一敵 maxLaunchPerTargetPerCast 回まで（一段目・二段目で二重に浮かせない）。
    const launched = new Map();
    this._stage(ang, castKey, P, 0, launched);
    const stages = Math.min(this.cap('maxStagesPerCast', 2), this.scene.combat.skillCap('maxCrushStages', 3));
    if (stages > 1) {
      const delay = d.secondaryImpact?.delayMs || 240;
      this.scene.time.delayedCall(delay, () => {
        if (this._dead || this.scene.gameOver) return;
        this._stage(ang, castKey, P, 1, launched);
      });
    }
    this.scene.skills.recordExtra(this.id, 'slashes', stages, 'add');
  }

  _stage(ang, castKey, P, index, launched) {
    const d = this.evoDef;
    const p = this.scene.player;
    const second = index >= 1;
    if (second && this.warrior) this.warrior.noteComboStage();
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y,
      radius: this.meleeRadius(second ? d.area?.secondRadius : d.area?.range),
      arc: second ? Math.PI * 2 : (d.area?.width || 1),
      facing: ang,
      damage: second ? d.damage?.second : d.damage?.first,
      skillId: this.id, castKey,
      knockback: second ? d.knockback?.second : d.knockback?.first,
      poiseDamage: second ? d.poiseDamage?.second : d.poiseDamage?.first,
      poiseOnceSet: new Set(),
      comboGain: second ? d.comboGain?.perSecond : d.comboGain?.perFirst,
      furyGain: second ? d.furyGain?.perSecond : d.furyGain?.perFirst,
      maxTargets: this.cap('maxTargetsPerStage', 10),
      // 打ち上げは一段目だけ（二段目は叩き落とし）。
      launch: second ? null : {
        durationMs: d.launch?.durationMs, height: d.launch?.height,
        counts: launched, maxPerTarget: P.launchPerTarget, immuneMs: P.launchImmuneMs,
      },
      tags: ['melee', 'slash', 'launch'], color: 0xfff176, visualIndex: index,
      visualCap: 'maxLaunchVisuals',
    });
  }
}
applyEvolvedSemantics(HeavenRendingAscentSkill);
