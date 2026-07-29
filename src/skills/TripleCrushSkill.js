// 三段砕き（M8-D・戦士 Wave2）: 前方打ち → 横薙ぎ → 小範囲の叩きつけ。
// - 1 発動 = 1 castKey = 1 recordCast（各段では recordCast しない）。
// - コンボが閾値を超えていると最終段が重くなる（コンボ値そのものは配らない）。
// - 途中で保存 → 再開しても二重に再生しない（段の進行は保存しない）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class TripleCrushSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._combo = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._combo; }

  crushParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      damage: s.damage || 0, interval: s.interval || 140,
      stage2: s.stage2 || 1, stage3: s.stage3 || 1, finalRadius: s.finalRadius || 0,
      knockback: s.knockback || 0, poiseDamage: s.poiseDamage || 0, comboBonus: s.comboBonus || 0,
      comboGain: s.comboGain, furyGain: s.furyGain,
      stages: cfg.stages ?? 3, comboThreshold: cfg.comboThreshold ?? 25,
      poiseOnce: cfg.poiseOncePerTargetPerCast !== false,
      range: this.def?.meleeRange || 72,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const P = this.crushParams();
    const stages = Math.min(P.stages, this.scene.combat.skillCap('maxCrushStages', 3));
    this._combo = {
      castKey: this.newCastKey(), stage: 0, stages, tickLeft: 0,
      angle: this.facing(this.meleeRadius(P.range)),
      poised: P.poiseOnce ? new Set() : null,
    };
    this.scene.skills.recordExtra(this.id, 'crushes', 1, 'add');
  }

  // 破棄後は発動も進行中処理も一切動かさない（遅延処理のリーク防止）。
  update(dt, ctx) { if (this._dead) return; super.update(dt, ctx); this._updateCombo(dt); }

  _updateCombo(dt) {
    const C = this._combo; if (!C) return;
    const P = this.crushParams();
    C.tickLeft -= dt;
    if (C.tickLeft > 0) return;
    C.tickLeft += Math.max(40, P.interval);
    this._stage(C, P, C.stage);
    C.stage += 1;
    if (this.warrior) this.warrior.noteComboStage();
    this.scene.skills.recordExtra(this.id, 'stages', 1, 'add');
    if (C.stage >= C.stages) { this._combo = null; this.scene.skills.recordExtra(this.id, 'completed', 1, 'add'); }
  }

  // 0 = 前方の短い打ち / 1 = 横薙ぎ（広い） / 2 = 小範囲の叩きつけ（全周・最終段）。
  _stage(C, P, index) {
    const p = this.scene.player;
    const last = index >= C.stages - 1;
    const w = this.warrior;
    // コンボ閾値を超えていれば最終段が重くなる。
    const comboMult = (last && w && w.combo >= P.comboThreshold) ? (1 + P.comboBonus) : 1;
    const mult = index === 0 ? 1 : (index === 1 ? P.stage2 : P.stage3);
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y,
      radius: this.meleeRadius(last ? P.finalRadius : P.range),
      arc: last ? Math.PI * 2 : (index === 1 ? 2.2 : 1.1),
      facing: C.angle,
      damage: P.damage * mult * comboMult, skillId: this.id, castKey: C.castKey,
      knockback: P.knockback * (last ? 1.4 : 1), poiseDamage: P.poiseDamage, poiseOnceSet: C.poised,
      comboGain: P.comboGain, furyGain: P.furyGain,
      tags: ['melee', 'blunt', 'combo'], color: last ? 0xffab91 : 0xffcc80, visualIndex: index,
      debris: last, visualCap: 'maxCrushShockVisuals',
    });
  }

  get crushing() { return !!this._combo; }

  serializeState() {
    // 段の進行は保存しない（再開時に途中の段から二重再生しない）。CD だけを戻す。
    return { cdLeft: this._cd, crushStage: this._combo ? this._combo.stage : 0 };
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    this._combo = null;
  }
  destroy() { this._dead = true; this._combo = null; }
}
