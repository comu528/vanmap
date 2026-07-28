// 断界兜割（M8-C・兜割りの進化 / 補助: 剛力 Lv4）:
// 二段構えの上段斬り。一撃目で装甲を割り、二撃目の狭い衝撃で体勢を完全に崩す。
// - 1 発動 = 1 castKey = 1 recordCast（strike ごとには recordCast しない）。
// - 同一敵への体勢削りは 1 発動 1 回（maxPoisePerTargetPerCast）。
// - 通常敵の処刑は行わない（処刑は血断処刑の役割）。
import { WarriorEvolvedBase } from './WarriorSkillBase.js';

export class SkullSplitterSkill extends WarriorEvolvedBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies; }

  fire() {
    if (this.scene.gameOver) return;
    const d = this.evoDef;
    const castKey = this.newCastKey();
    const p = this.scene.player;
    const range = this.meleeRadius(d.area?.range);
    const target = this.scene.combat.preferredMeleeTarget(p.x, p.y, range * 1.6, 'tough');
    const ang = target ? Math.atan2(target.y - p.y, target.x - p.x) : this.facing(range);
    // 1 発動あたりのコンボ/闘気の上限を data から適用する。
    if (this.warrior) {
      this.warrior.setCastLimits(castKey, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    }
    // 体勢削りは 1 発動につき同一敵 1 回だけ（cap は 1）。
    const poised = this.cap('maxPoisePerTargetPerCast', 1) >= 1 ? new Set() : null;
    const strikes = Math.min(this.cap('maxStrikesPerCast', 2), d.projectileCount?.strikes || 2,
      this.scene.combat.skillCap('maxOverheadStrikes', 3));
    this._strike(ang, castKey, poised, 0);
    const gap = d.projectileCount?.strikeIntervalMs || 180;
    for (let k = 1; k < strikes; k++) {
      this.scene.time.delayedCall(k * gap, () => {
        if (this._dead || this.scene.gameOver) return;
        this._strike(ang, castKey, poised, k);
      });
    }
    this.scene.skills.recordExtra(this.id, 'strikes', strikes, 'add');
  }

  // index 0 = 一撃目（広め・装甲割り）。index >= 1 = 二撃目（狭い衝撃・体勢重視）。
  _strike(ang, castKey, poised, index) {
    const d = this.evoDef;
    const p = this.scene.player;
    const second = index >= 1;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y,
      radius: this.meleeRadius(second ? d.area?.secondRange : d.area?.range),
      arc: second ? d.area?.secondWidth : d.area?.width,
      facing: ang,
      damage: second ? d.damage?.second : d.damage?.first,
      skillId: this.id, castKey,
      knockback: second ? d.knockback?.second : d.knockback?.first,
      poiseDamage: second ? d.poiseDamage?.second : d.poiseDamage?.first,
      poiseOnceSet: poised,
      comboGain: second ? d.comboGain?.perSecond : d.comboGain?.perFirst,
      furyGain: second ? d.furyGain?.perSecond : d.furyGain?.perFirst,
      toughBonus: d.bossBonus,
      maxTargets: this.cap('maxTargetsPerStrike', 12),
      tags: ['melee', 'slash', 'stance_break'], color: 0xffab91, visualIndex: index,
      visualCap: 'maxOverheadSlashVisuals',
    });
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { this._dead = true; }
}
