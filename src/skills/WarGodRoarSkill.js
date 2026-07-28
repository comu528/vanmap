// 軍神咆哮（M8-C・戦吼の進化 / 補助: 戦闘本能 Lv4）:
// 押し返しの範囲が広がり、自身の高揚がより強く長く続く。途切れかけたコンボの猶予も立て直す。
// - バフは**重ねがけしない**（refresh / 上書き）。連打しても持続と強度は上書きされるだけ。
// - コンボ値そのものは無料で配らない（回復するのは grace＝猶予時間だけ）。
// - 1 発動 = 1 recordCast。
import { WarCrySkill } from './WarCrySkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class WarGodRoarSkill extends WarCrySkill {
  // 進化の evoDef を読む（WarCrySkill は def.levels を読むため、ここで完全に上書きする）。
  cryParams() {
    const d = this.evoDef;
    const b = d.buff || {};
    return {
      radius: d.area?.radius || 0,
      damage: d.damage?.shock || 0,
      knockback: d.knockback?.shock || 0,
      poiseDamage: d.poiseDamage?.shock || 0,
      comboGain: d.comboGain?.perShock,
      furyGain: d.furyGain?.perShock,
      buff: {
        durationMs: Math.min(b.durationMs || 0, this.cap('maxBuffDurationMs', 12000)),
        meleeDamageBonus: b.meleeDamageBonus || 0,
        furyGainBonus: b.furyGainBonus || 0,
        comboGraceBonus: b.comboGraceBonus || 0,
        // 猶予の回復（コンボ値は増やさない）。
        graceRefill: b.graceRefill || 0,
        stack: b.stack,
      },
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const d = this.evoDef;
    const P = this.cryParams();
    const castKey = this.newCastKey();
    const p = this.scene.player;
    if (this.warrior) {
      this.warrior.setCastLimits(castKey, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    }
    const shocks = Math.max(1, this.cap('maxShocksPerCast', 1));
    for (let i = 0; i < shocks; i++) {
      this.scene.combat.meleeStrike({
        x: p.x, y: p.y, radius: this.meleeRadius(P.radius), arc: Math.PI * 2, facing: 0,
        damage: P.damage, skillId: this.id, castKey,
        knockback: P.knockback, poiseDamage: P.poiseDamage, poiseOnceSet: new Set(),
        comboGain: P.comboGain, furyGain: P.furyGain,
        maxTargets: this.cap('maxTargetsPerShock', 24),
        tags: ['melee', 'blunt', 'area'], color: 0xffb74d, visualIndex: i,
        visualCap: 'maxWarCryRings',
      });
    }
    if (this.warrior) this.warrior.applyWarCryBuff(P.buff);
    this.scene.skills.recordExtra(this.id, 'roars', 1, 'add');
  }
}

// 基礎クラスのロジックを再利用しつつ、data の読み先を進化定義（evoDef）へ差し替える。
applyEvolvedSemantics(WarGodRoarSkill);
