// 天墜崩撃（M8-C・跳躍強襲の進化 / 補助 active: 地砕き Lv6）:
// 天へ跳び上がり全体重を乗せて墜ちる。着地の直後にもう一度だけ巨大な衝撃が走る。
// - 補助 active（地砕き）は**置換されない**。地砕きの CD にも一切触らず、無料発動もしない。
// - 二次衝撃は着地から 1 回だけ。二次衝撃から recordCast はしない（main cast は fire の 1 回）。
// - 演出は派手でよいが、ダメージ範囲はあくまで自分の周囲（近距離）。
// - ボスへの体勢削りは 1 発動につき同一敵 1 回まで。
import { LeapSmashSkill } from './LeapSmashSkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class HeavenCrushingDescentSkill extends LeapSmashSkill {
  // 進化の evoDef で跳躍パラメータを完全に置き換える。
  leapParams() {
    const d = this.evoDef;
    const L = d.leap || {};
    return {
      distance: Math.min(L.distance || 0, this.cap('maxLeapDistance', 360)),
      speed: L.speed || 700,
      minDistance: L.minDistance || 48,
      maxLeapMs: L.maxLeapMs || 760,
      mitigation: L.mitigationValue || 0,
      landingDelayMs: 0,
    };
  }

  // 着地の主衝撃 → 遅延して二次衝撃を 1 回だけ。
  _land(L) {
    const d = this.evoDef;
    const p = this.scene.player;
    if (this.warrior) {
      this.warrior.setCastLimits(L.castKey, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    }
    // 体勢削りは 1 発動につき同一敵 1 回（主衝撃と二次衝撃で二重に削らない）。
    const poised = new Set();
    const impacts = Math.min(this.cap('maxImpactsPerCast', 2), this.scene.combat.skillCap('maxLeapImpacts', 2));
    this._impact(L, poised, false);
    if (impacts > 1) {
      const delay = d.secondaryImpact?.delayMs || 280;
      this.scene.time.delayedCall(delay, () => {
        if (this._dead || this.scene.gameOver) return;
        this._impact(L, poised, true);
      });
    }
    if (this.warrior) this.warrior.noteMovement('leapLanding', 0);
    this.scene.skills.recordExtra(this.id, 'landings', 1, 'add');
  }

  _impact(L, poised, secondary) {
    const d = this.evoDef;
    const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y,
      radius: this.meleeRadius(secondary ? d.area?.secondaryRadius : d.area?.radius),
      arc: Math.PI * 2, facing: 0,
      damage: secondary ? d.damage?.secondary : d.damage?.impact,
      skillId: this.id, castKey: L.castKey,
      knockback: secondary ? d.knockback?.secondary : d.knockback?.impact,
      poiseDamage: secondary ? d.poiseDamage?.secondary : d.poiseDamage?.impact,
      poiseOnceSet: poised,
      comboGain: secondary ? d.comboGain?.perSecondary : d.comboGain?.perImpact,
      furyGain: secondary ? d.furyGain?.perSecondary : d.furyGain?.perImpact,
      maxTargets: this.cap('maxTargetsPerImpact', 28),
      tags: ['melee', 'blunt', 'area', 'stance_break'], color: 0x8d6e63,
      visualIndex: secondary ? 1 : 0, debris: true,
      visualCap: 'maxLandingDebris',
    });
    if (secondary) this.scene.skills.recordExtra(this.id, 'secondaryImpacts', 1, 'add');
  }
}

// 基礎クラスのロジックを再利用しつつ、data の読み先を進化定義（evoDef）へ差し替える。
applyEvolvedSemantics(HeavenCrushingDescentSkill);
