// 震天踏破（M8-E・戦士 最終Wave）: 前へ歩きながら足元を数回踏み砕く。
// - 大地砕き（その場）・震脚（短距離制圧）との違いは「**移動しながら複数地点へ**」であること。
//   1 回ぶんの範囲は小さく、最後の一歩だけが重い。
// - 通常敵はノックバック、エリート / ボスは体勢削り（共通経路 resolveKnockback の規則）。
// - 1 発動 = 1 castKey = 1 recordCast。踏みごとに recordCast しない。
// - 対象が消えても現在の方向へ安全に進み続け、距離と時間の両方で必ず終わる。
// - ボスの予兆中は踏み込みを止める（完全に無視はしない）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class EarthshakerMarchSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._march = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._march; }

  // 進化（大陸震砕踏破）が上書きするパラメータ。
  marchParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      damage: s.damage || 0, stompCount: s.stompCount || 1, interval: s.interval || 160,
      stepDistance: s.stepDistance || 0, radius: s.radius || 0,
      knockback: s.knockback || 0, poiseDamage: s.poiseDamage || 0,
      finalStompMultiplier: s.finalStompMultiplier || 1,
      comboGain: s.comboGain, furyGain: s.furyGain,
      maxMarchMs: cfg.maxMarchMs ?? 2000, worldMargin: cfg.worldMargin ?? 24,
      avoidBossTelegraph: cfg.avoidBossTelegraph !== false,
      // 進化のみ。
      finalRadius: 0, finalDamage: 0, finalKnockback: 0, finalPoise: 0, mitigation: 0,
      maxTargets: 0,
    };
  }

  fire() {
    if (this._dead || this.scene.gameOver) return;
    const P = this.marchParams();
    const w = this.warrior;
    const plan = w ? w.beginEarthshakerMarch({
      stompCount: P.stompCount, intervalMs: P.interval, stepDistance: P.stepDistance,
      radius: this.meleeRadius(P.radius), maxMs: P.maxMarchMs, mitigation: P.mitigation,
    }) : null;
    if (!plan) return;
    const p = this.scene.player;
    const total = Math.min(plan.stomps, this.scene.combat.skillCap('maxMarchStomps', 7));
    this._march = {
      castKey: this.newCastKey(), index: 0, total, tickLeft: 0,
      angle: this.facing(this.meleeRadius(P.radius)), totalMs: 0, moved: 0, plan,
    };
    this.scene.skills.recordExtra(this.id, 'marches', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'plannedStomps', total, 'add');
    void p;
  }

  update(dt, ctx) { if (this._dead) return; super.update(dt, ctx); this._updateMarch(dt); }

  _updateMarch(dt) {
    const M = this._march; if (!M) return;
    const P = this.marchParams();
    M.totalMs += dt;
    if (M.totalMs > M.plan.maxMs) { this._finish(M); return; } // 必ず終わる（無限歩行しない）
    M.tickLeft -= dt;
    if (M.tickLeft > 0) return;
    M.tickLeft += Math.max(40, M.plan.intervalMs);

    const p = this.scene.player;
    // 進む向きは「近くの敵」を見て更新するが、いなければ現在方向のまま進む（安全 fallback）。
    const t = this.scene.combat.nearestEnemy(p.x, p.y, this.meleeRadius(P.radius) * 3);
    if (t) M.angle = Math.atan2(t.y - p.y, t.x - p.x);
    // ボスの予兆中は前進を止める（その場で踏む）。完全に無視はしない。
    const telegraph = P.avoidBossTelegraph && this.scene.combat.bossTelegraphing && this.scene.combat.bossTelegraphing();
    if (!telegraph && M.plan.stepDistance > 0) {
      const wb = this.scene.combat.worldBounds ? this.scene.combat.worldBounds() : { w: 1600, h: 1200 };
      const nx = p.x + Math.cos(M.angle) * M.plan.stepDistance;
      const ny = p.y + Math.sin(M.angle) * M.plan.stepDistance;
      if (Number.isFinite(nx) && Number.isFinite(ny)) {
        const m = M.plan.worldMargin;
        const cx = Math.max(m, Math.min(wb.w - m, nx));
        const cy = Math.max(m, Math.min(wb.h - m, ny));
        const moved = Math.hypot(cx - p.x, cy - p.y);
        p.x = cx; p.y = cy;
        M.moved += moved;
        this.scene.skills.recordExtra(this.id, 'marchDistance', moved, 'add');
      }
    }
    const r = this.warrior ? this.warrior.resolveMarchStomp(M.index, M.total, M.plan.stepDistance) : { final: false };
    this._stomp(M, P, M.index, r.final);
    M.index += 1;
    this.scene.skills.recordExtra(this.id, 'stomps', 1, 'add');
    if (M.index >= M.total) this._finish(M, true);
  }

  _stomp(M, P, index, final) {
    const p = this.scene.player;
    const radius = final && P.finalRadius > 0 ? P.finalRadius : P.radius;
    const dmg = final
      ? (P.finalDamage > 0 ? P.finalDamage : P.damage * P.finalStompMultiplier)
      : P.damage;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(radius), arc: Math.PI * 2, facing: 0,
      damage: dmg, skillId: this.id, castKey: M.castKey,
      knockback: final && P.finalKnockback > 0 ? P.finalKnockback : P.knockback,
      poiseDamage: final && P.finalPoise > 0 ? P.finalPoise : P.poiseDamage,
      poiseOnceSet: new Set(),
      comboGain: P.comboGain, furyGain: P.furyGain,
      maxTargets: P.maxTargets > 0 ? P.maxTargets : undefined,
      tags: ['melee', 'blunt', 'area'], color: final ? 0x8d6e63 : 0xa1887f,
      visualIndex: index, debris: true, visualCap: 'maxMarchDustVisuals',
    });
  }

  _finish(M, completed) {
    if (this._march !== M) return;
    this._march = null;
    if (completed) this.scene.skills.recordExtra(this.id, 'completedMarches', 1, 'add');
  }

  get marching() { return !!this._march; }
  // 進化のみ: 前進中の小幅な軽減（完全無敵にはならない・合計は 70% クランプ）。
  activeMitigation() { return this._march ? (this._march.plan.mitigation || 0) : 0; }

  serializeState() {
    // 残りの踏みは保存しない（再開時の二重再生を防ぐ）。
    return { cdLeft: this._cd, remainStomps: this._march ? Math.max(0, this._march.total - this._march.index) : 0 };
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    this._march = null;
  }
  destroy() { this._dead = true; this._march = null; }
}
