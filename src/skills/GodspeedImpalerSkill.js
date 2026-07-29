// 神速貫陣（M8-E・貫穿突きの進化 / 補助: 戦闘本能 Lv4）:
// 踏み込みざま、短い間隔で二度突き通す。二段目はわずかに広いが、長さは変わらない。
// - 1 発動 = 1 castKey = 1 recordCast（二段目では recordCast しない）。
// - コンボ / 闘気 / 体勢は 1 発動あたりの上限を共有する（多重適用しない）。
// - テレポートしない。踏み込みは共通経路（movePlayerTowards）だけを通る。
import { PiercingLungeSkill } from './PiercingLungeSkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class GodspeedImpalerSkill extends PiercingLungeSkill {
  lungeParams() {
    const d = this.evoDef;
    return {
      damage: d.damage?.first || 0,
      stepInDistance: d.movement?.stepInDistance || 0,
      lineLength: d.area?.lineLength || 0, width: d.area?.width || 0,
      maxTargets: this.cap('maxTargetsPerThrust', 10),
      eliteBonus: d.eliteBonus?.value || 0, bossBonus: d.bossBonus?.value || 0,
      poiseDamage: d.poiseDamage?.first || 0, knockbackNormal: d.knockback?.first || 0,
      comboGain: d.comboGain?.perThrust, furyGain: d.furyGain?.perThrust,
      maxLungeMs: 220, worldMargin: 24,
      maxHitsPerTarget: 1, avoidBossTelegraph: true,
      // 二段目（少し広い・長さは同じ）。
      thrusts: this.cap('maxThrustsPerCast', 2),
      secondWidth: d.area?.secondWidth || 0,
      chainRange: d.area?.chainRange || 0,
      secondDelayMs: d.secondaryImpact?.delayMs || 170,
      secondDamage: d.damage?.second || 0,
      secondPoise: d.poiseDamage?.second || 0,
      secondKnockback: d.knockback?.second || 0,
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

  // 二段目の直前に、射線上の次の相手を見て向きだけを直す（座標は動かさない＝テレポートしない）。
  _thrust(L, P, index) {
    if (index >= 1 && P.chainRange > 0) {
      const p = this.scene.player;
      const maxChain = this.cap('maxChainTargets', 2);
      if ((L.chained || 0) < maxChain) {
        const next = this.scene.combat.nearestEnemy(p.x, p.y, this.meleeRadius(P.chainRange));
        if (next) {
          L.angle = Math.atan2(next.y - p.y, next.x - p.x);
          L.chained = (L.chained || 0) + 1;
          this.scene.skills.recordExtra(this.id, 'chained', 1, 'add');
        }
      }
    }
    super._thrust(L, P, index);
  }
}
applyEvolvedSemantics(GodspeedImpalerSkill);
