// 破城膝撃（M8-D・戦士 Wave2）: 超近距離の単体 blunt。
// - エリート / ボスの体勢削りに特化する（兜割りより CD が短く、射程が短く、体勢削りが高い）。
// - 通常敵には短いノックバックだけ。
// - 少しだけ射程外なら、安全に踏み込んでから当てる（テレポートしない・壁外へ出ない）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class BreakerKneeSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._step = null; this._strikes = 0; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._step; }

  kneeParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      damage: s.damage || 0, range: s.range || 0, stepIn: s.stepIn || 0,
      poiseDamage: s.poiseDamage || 0, eliteBonus: s.eliteBonus || 0, bossBonus: s.bossBonus || 0,
      knockback: s.knockback || 0, comboGain: s.comboGain, furyGain: s.furyGain,
      maxStepInMs: cfg.maxStepInMs ?? 180, worldMargin: cfg.worldMargin ?? 24,
      poiseOnce: cfg.poiseOncePerTargetPerCast !== false,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const P = this.kneeParams();
    const p = this.scene.player;
    const radius = this.meleeRadius(P.range);
    // 硬い相手を優先して狙う（共通経路・全敵総当たりなし）。
    const t = this.scene.combat.preferredMeleeTarget(p.x, p.y, radius + P.stepIn, 'tough');
    if (!t) { this.scene.skills.recordExtra(this.id, 'misses', 1, 'add'); return; }
    const castKey = this.newCastKey();
    this._strikes = 0; // 1 発動あたりの膝撃回数（踏み込み経由でも二重に出さない）
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    const ang = Math.atan2(t.y - p.y, t.x - p.x);
    if (d <= radius) { this._knee(ang, castKey, P); return; }
    // 少しだけ届かない → 安全に踏み込んでから当てる。
    this._step = { castKey, angle: ang, leftMs: P.maxStepInMs, want: Math.min(P.stepIn, d - radius * 0.8), moved: 0 };
  }

  // 破棄後は発動も進行中処理も一切動かさない（遅延処理のリーク防止）。
  update(dt, ctx) { if (this._dead) return; super.update(dt, ctx); this._updateStep(dt); }

  _updateStep(dt) {
    const S = this._step; if (!S) return;
    const P = this.kneeParams();
    S.leftMs -= dt;
    const p = this.scene.player;
    const step = Math.min((P.stepIn / Math.max(1, P.maxStepInMs)) * dt * 1000 / 1000 * 6, Math.max(0, S.want - S.moved));
    const moved = step > 0 ? this.scene.combat.movePlayerTowards(
      p.x + Math.cos(S.angle) * step, p.y + Math.sin(S.angle) * step, step) : 0;
    S.moved += moved;
    this.scene.skills.recordExtra(this.id, 'stepInDistance', moved, 'add');
    if (S.moved >= S.want - 1e-3 || S.leftMs <= 0 || moved <= 1e-6) {
      if (this.warrior) this.warrior.noteStepIn(S.moved);
      this.scene.skills.recordExtra(this.id, 'stepIns', 1, 'add');
      this._knee(S.angle, S.castKey, P);
      this._step = null;
    }
  }

  _knee(ang, castKey, P) {
    // 1 発動につき膝撃は maxKneeStrikes 回まで。単体技なので通常は 1 回で終わる。
    if (this._strikes >= this.scene.combat.skillCap('maxKneeStrikes', 2)) return;
    this._strikes += 1;
    const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(P.range), arc: 1.0, facing: ang,
      damage: P.damage, skillId: this.id, castKey,
      knockback: P.knockback, poiseDamage: P.poiseDamage,
      poiseOnceSet: P.poiseOnce ? new Set() : null,
      comboGain: P.comboGain, furyGain: P.furyGain,
      // エリート / ボスへの体勢特化（追加倍率は硬い相手にだけ乗る）。
      toughBonus: P.eliteBonus, toughPoiseBonus: P.bossBonus,
      maxTargets: 1, // 単体技（周囲を巻き込まない）
      tags: ['melee', 'blunt', 'stance_break'], color: 0xffe082, visualIndex: 0,
      visualCap: 'maxKneeImpactVisuals',
    });
    this.scene.skills.recordExtra(this.id, 'knees', 1, 'add');
  }

  serializeState() { return { cdLeft: this._cd, stepPending: !!this._step }; }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    this._step = null; // 踏み込みの途中状態は復元しない（無料の追加打撃を作らない）
  }
  destroy() { this._dead = true; this._step = null; }
}
