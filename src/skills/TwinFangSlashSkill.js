// 双牙斬（M8-C・戦士 Wave1）: 高速コンボ builder。
// 左右から交差する 2 連斬り。1 発動 = 1 recordCast で、2 撃目だけ少し広く振る。
// Job Lv80 で打撃数 +1。追加打撃で recordCast は増えず、闘気/コンボは cast 単位の上限で守られる。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class TwinFangSlashSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies; }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const cfg = this.def?.config || {};
    const castKey = this.newCastKey();
    const ang = this.facing(this.meleeRadius(s.radius));
    const strikes = Math.min(
      this.strikeCount(s.strikes || 2),
      this.scene.combat.skillCap('maxTwinFangStrikes', 3),
    );
    for (let k = 0; k < strikes; k++) {
      if (k === 0) this._strike(ang, castKey, 0);
      else {
        const gap = cfg.strikeIntervalMs ?? 90;
        this.scene.time.delayedCall(k * gap, () => {
          if (this._dead || this.scene.gameOver) return;
          this._strike(ang, castKey, k);
        });
      }
    }
    this.scene.skills.recordExtra(this.id, 'strikes', strikes, 'add');
  }

  // index 0 = 1 撃目（狭い）。index >= 1 = 2 撃目以降（広く・倍率つき）。
  _strike(ang, castKey, index) {
    const s = this.stats; if (!s) return;
    const cfg = this.def?.config || {};
    const p = this.scene.player;
    const second = index >= 1;
    // 左右から交差させる（1 撃目は左寄り・2 撃目は右寄り）。
    const offset = (index % 2 === 0 ? -1 : 1) * (s.arc * 0.18);
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y,
      radius: this.meleeRadius(s.radius),
      arc: s.arc + (second ? (cfg.secondArcBonus ?? 0.35) : 0),
      facing: ang + offset,
      damage: s.damage * (second ? (s.secondStrikeMultiplier || 1) : 1),
      skillId: this.id, castKey,
      knockback: s.knockback, poiseDamage: s.poiseDamage,
      comboGain: s.comboGain, furyGain: s.furyGain,
      tags: ['melee', 'slash', 'combo'], color: 0xfff176, visualIndex: index,
      visualCap: 'maxTwinSlashVisuals',
    });
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { this._dead = true; }
}
