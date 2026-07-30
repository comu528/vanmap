// 地砕き（M8-B・戦士）: プレイヤー中心の blunt AoE。高い体勢削りと強いノックバックを持つ。
// 闘気解放中（または Job Lv80 の打撃数 +1）で二撃目を追加する。
// 二撃目は「追加 impact」であり、そこからさらに impact を生まない（再帰・無限発動なし）。
// 遠距離へ波を飛ばさない（自分中心の円判定のみ）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class GroundSlamSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); }
  canFire(ctx) { return !!ctx.hasEnemies; }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const cfg = this.def?.config || {};
    const castKey = this.newCastKey();
    // 打撃数: data の strikes ＋ Job Lv80（明示 flag）。闘気解放中は data の許可があれば +1。
    let impacts = this.strikeCount(s.strikes || 1);
    if (cfg.releaseSecondImpact !== false && this.warrior && this.warrior.releaseActive) impacts += 1;
    impacts = Math.min(impacts, this.scene.combat.skillCap('maxWarriorSlams', 2) + 1);
    this._impact(castKey, 0, 1);
    for (let k = 1; k < impacts; k++) {
      this.scene.time.delayedCall(k * (cfg.secondImpactDelayMs ?? 260), () => {
        if (this._dead || this.scene.gameOver) return;
        this._impact(castKey, k, s.secondImpactFactor || 0.5);
      });
    }
    this.scene.skills.recordExtra(this.id, 'impacts', impacts, 'add');
  }

  _impact(castKey, index, factor) {
    const s = this.stats; const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(s.radius), arc: Math.PI * 2, facing: 0,
      damage: s.damage * factor, skillId: this.id, castKey,
      knockback: s.knockback, poiseDamage: s.poiseDamage,
      comboGain: s.comboGain, furyGain: s.furyGain,
      tags: ['melee', 'blunt', 'stance_break'], color: 0xa1887f, visualIndex: index, debris: true,
    });
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st) this.restoreCd(st.cdLeft); }
  destroy() { this._dead = true; }
}
