// 戦斧投擲（M8-D・戦士 Wave2）: 短距離の物理投擲。
// - 斧は射程で必ず折り返し、手元へ戻る。**画面端まで飛ばない**。
// - 同一敵へは行き / 帰りで最大 2 回まで（data の maxAxeHitsPerTarget が上限）。
// - 近接ではないので近接ダメージ倍率を掛けない（combat.thrownStrike が isThrown を立てる）。
//   タグは physical / thrown / slash を明示する。
// - 斧の位置はスキルが決定論的に進めるだけで、Phaser のオブジェクトや Tween は保持しない。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class WarAxeThrowSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._axe = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._axe; }

  axeParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      damage: s.damage || 0, range: s.range || 0, speed: s.speed || 400, width: s.width || 0,
      returnMultiplier: s.returnMultiplier || 0.5, maxTargets: s.maxTargets || 3,
      poiseDamage: s.poiseDamage || 0, knockback: s.knockback || 0,
      comboGain: s.comboGain, furyGain: s.furyGain,
      maxFlightMs: cfg.maxFlightMs ?? 1200, worldMargin: cfg.worldMargin ?? 24,
      // 投擲は近接ではない（近接ダメージ倍率を掛けない）。data で明示する。
      meleeBonusApplies: cfg.meleeBonusApplies === true,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const P = this.axeParams();
    if (!(P.range > 0)) return;
    const p = this.scene.player;
    const ang = this.facing(P.range);
    this._axe = {
      castKey: this.newCastKey(), x: p.x, y: p.y, angle: ang,
      traveled: 0, returning: false, leftMs: P.maxFlightMs,
      // 同一敵への命中回数。行きと帰りで別々に数える（行き 1 回・帰り 1 回＝合計で cap 回）。
      // 敵オブジェクトを保持しないため _seq をキーにする。
      hitsOut: new Map(), hitsBack: new Map(),
    };
    this.scene.skills.recordExtra(this.id, 'throws', 1, 'add');
  }

  // 破棄後は発動も進行中処理も一切動かさない（遅延処理のリーク防止）。
  update(dt, ctx) { if (this._dead) return; super.update(dt, ctx); this._updateAxe(dt); }

  _updateAxe(dt) {
    const A = this._axe; if (!A) return;
    const P = this.axeParams();
    A.leftMs -= dt;
    const step = P.speed * (dt / 1000);
    if (!A.returning) {
      A.traveled += step;
      A.x += Math.cos(A.angle) * step;
      A.y += Math.sin(A.angle) * step;
      const wb = this.scene.combat.worldBounds ? this.scene.combat.worldBounds() : { w: 1600, h: 1200 };
      const m = P.worldMargin;
      const outside = A.x < m || A.y < m || A.x > wb.w - m || A.y > wb.h - m;
      // 射程で折り返す。壁へ当たった場合もそこで折り返す（画面端まで飛ばない）。
      if (A.traveled >= P.range || outside) { A.returning = true; this.scene.skills.recordExtra(this.id, 'returns', 1, 'add'); }
    } else {
      // 帰りはプレイヤーの現在地へ向かう（プレイヤーが動いても取り逃さない）。
      const p = this.scene.player;
      const dx = p.x - A.x, dy = p.y - A.y;
      const d = Math.hypot(dx, dy);
      if (d <= step || d < 1e-3) { this._finish(A); return; }
      A.x += (dx / d) * step;
      A.y += (dy / d) * step;
    }
    if (!Number.isFinite(A.x) || !Number.isFinite(A.y)) { this._finish(A); return; }
    this._strike(A, P);
    if (A.leftMs <= 0) this._finish(A);
  }

  _strike(A, P) {
    const cap = this.scene.combat.skillCap('maxAxeHitsPerTarget', 2);
    // 行きで 1 回・帰りで 1 回。cap が 1 なら帰りは当たらない（合計は必ず cap 以下）。
    if (A.returning && cap < 2) return;
    const counts = A.returning ? A.hitsBack : A.hitsOut;
    const strike = P.meleeBonusApplies ? this.scene.combat.meleeStrike : this.scene.combat.thrownStrike;
    const res = strike({
      x: A.x, y: A.y, radius: Math.max(8, P.width / 2), arc: Math.PI * 2, facing: 0,
      damage: P.damage * (A.returning ? P.returnMultiplier : 1),
      skillId: this.id, castKey: A.castKey,
      knockback: P.knockback, poiseDamage: P.poiseDamage,
      comboGain: P.comboGain, furyGain: P.furyGain,
      maxTargets: P.maxTargets,
      seqHitCounts: counts, seqHitCap: 1,
      tags: ['thrown', 'slash', 'physical'], color: 0xbcaaa4, visualIndex: A.returning ? 1 : 0,
      visualCap: 'maxAxeSpinVisuals',
    });
    if (res && res.hits > 0) {
      if (this.warrior) for (let i = 0; i < res.hits; i++) this.warrior.noteAxeHit(A.returning);
      this.scene.skills.recordExtra(this.id, A.returning ? 'returnHits' : 'outboundHits', res.hits, 'add');
    }
  }

  _finish(A) { if (this._axe === A) this._axe = null; }

  get flying() { return !!this._axe; }

  serializeState() {
    // 飛行中の斧は保存しない（再開時に無料の往復を作らない）。
    return { cdLeft: this._cd, axeReturning: this._axe ? this._axe.returning : false };
  }
  restoreState(st) {
    if (!st) return;
    this.restoreCd(st.cdLeft);
    this._axe = null;
  }
  destroy() { this._dead = true; this._axe = null; }
}
