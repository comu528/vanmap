// 千刃乱舞（M8-B・大薙ぎの進化 / 補助: 戦闘本能 Lv4）:
// 前方へ連続斬撃を叩き込み、最後に短い全周斬りで締める。
// 1 発動 = 1 castKey = 1 recordCast（派生 slash では recordCast しない）。
// コンボ/闘気の獲得は cast 単位の上限で制御する（多段で無制限に増えない）。
// 戦士は残響/分身の対象外（data で forbidden）。great_cleave とは置換関係のため同時稼働しない。
import { WarriorEvolvedBase } from './WarriorSkillBase.js';

export class ThousandBladeDanceSkill extends WarriorEvolvedBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies; }

  fire() {
    if (this.scene.gameOver) return;
    const d = this.evoDef;
    const castKey = this.newCastKey();
    const cap = this.scene.combat.skillCap('maxBladeDanceStrikes', 8);
    const strikes = Math.min(this.cap('maxStrikesPerCast', 8), cap, d.projectileCount?.strikes || 5);
    const gap = d.projectileCount?.strikeIntervalMs || 90;
    const ang = this.facing(this.meleeRadius(d.area?.radius || 88));
    // 進化 safetyCaps の「1 発動あたりコンボ/闘気の上限」をこの cast だけへ適用する
    //（多段 slash + 締めの全周斬りで無制限に稼がない）。
    if (this.warrior) {
      this.warrior.setCastLimits(castKey, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    }
    this._strike(ang, castKey, 0);
    for (let k = 1; k < strikes; k++) {
      this.scene.time.delayedCall(k * gap, () => {
        if (this._dead || this.scene.gameOver) return;
        this._strike(ang, castKey, k);
      });
    }
    // 締めの全周斬り（派生であり主発動ではない）。
    this.scene.time.delayedCall(strikes * gap, () => {
      if (this._dead || this.scene.gameOver) return;
      this._finale(castKey);
    });
    this.scene.skills.recordExtra(this.id, 'strikes', strikes, 'add');
  }

  _strike(ang, castKey, index) {
    const d = this.evoDef; const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(d.area?.radius || 88), arc: d.area?.arc || 2.4, facing: ang,
      damage: d.damage?.strike || 34, skillId: this.id, castKey,
      knockback: d.knockback?.strike, poiseDamage: d.poiseDamage?.strike,
      comboGain: d.comboGain?.perStrike, furyGain: d.furyGain?.perStrike,
      maxTargets: this.cap('maxTargetsPerStrike', 24),
      tags: ['melee', 'slash'], color: 0xfff59d, visualIndex: index,
    });
  }

  _finale(castKey) {
    const d = this.evoDef; const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(d.area?.finaleRadius || 96), arc: Math.PI * 2, facing: 0,
      damage: d.damage?.finale || 62, skillId: this.id, castKey,
      knockback: d.knockback?.finale, poiseDamage: d.poiseDamage?.finale,
      comboGain: d.comboGain?.perFinale, furyGain: d.furyGain?.perFinale,
      maxTargets: this.cap('maxTargetsPerStrike', 24),
      tags: ['melee', 'slash'], color: 0xffe082, visualIndex: 99,
    });
    this.scene.skills.recordExtra(this.id, 'finales', 1, 'add');
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st) this.restoreCd(st.cdLeft); }
  destroy() { this._dead = true; }
}
