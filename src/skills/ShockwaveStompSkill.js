// 震脚（M8-C・戦士 Wave1）: 短距離制圧。
// 自分中心のごく短い blunt AoE。地砕きより狭く回転が速く、群れを押し返してコンボを維持する。
// 演出の衝撃波は大きく描いてよいが、**ダメージ範囲は radius のまま**（visual と damage を分離する）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class ShockwaveStompSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies; }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const castKey = this.newCastKey();
    const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(s.radius), arc: Math.PI * 2, facing: 0,
      damage: s.damage, skillId: this.id, castKey,
      knockback: s.knockback, poiseDamage: s.poiseDamage,
      comboGain: s.comboGain, furyGain: s.furyGain,
      tags: ['melee', 'blunt', 'area', 'knockback'], color: 0xa1887f, visualIndex: 0, debris: true,
      visualCap: 'maxStompDebris',
      // 演出だけを大きく見せる（判定半径は上の radius のまま）。
      visualScale: this.def?.config?.shockwaveVisualScale,
    });
    this.scene.skills.recordExtra(this.id, 'stomps', 1, 'add');
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { this._dead = true; }
}
