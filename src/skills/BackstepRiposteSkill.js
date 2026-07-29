// 燕返し（M8-D・戦士 Wave2）: 短く後退してから踏み込み、斬り返す。
// - 後退中は身をかわして軽減するが、**無敵にはならない**（合計は 70% でクランプ）。
// - 反撃の調停（M8-C）とは別系統。被弾に反応するのではなく、自分から仕掛ける。
// - 対象が消えたら現在方向へ短く踏み込んで安全に終わる。壁外・NaN・テレポートを作らない。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class BackstepRiposteSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._move = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._move; }

  // 進化（無影燕返）が上書きするパラメータ。
  riposteParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      damage: s.damage || 0, backstep: s.backstep || 0, lunge: s.lunge || 0,
      mitigation: s.mitigationValue || 0, arc: s.arc || 0,
      poiseDamage: s.poiseDamage || 0, knockback: s.knockback || 0,
      comboGain: s.comboGain, furyGain: s.furyGain,
      radius: this.def?.meleeRange || 84, retargetRange: 0, ripostes: 1,
      backstepMs: cfg.backstepMs ?? 140, lungeSpeed: cfg.lungeSpeed ?? 560,
      maxRiposteMs: cfg.maxRiposteMs ?? 700, worldMargin: cfg.worldMargin ?? 24,
      graceRefill: 0, maxRetargets: 0, maxTargets: 0,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const P = this.riposteParams();
    if (!(P.lunge > 0)) return;
    const p = this.scene.player;
    const radius = this.meleeRadius(P.radius);
    const t = this.scene.combat.nearestEnemy(p.x, p.y, radius * 2.2);
    const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : this.facing(radius);
    const maxStrikes = Math.min(P.ripostes, this.scene.combat.skillCap('maxRiposteStrikes', 2));
    this._move = {
      castKey: this.newCastKey(), phase: 'back', leftMs: P.backstepMs,
      angle: ang, moved: 0, want: P.backstep, strikes: 0, maxStrikes,
      retargets: 0, maxRetargets: Math.max(0, P.maxRetargets), totalMs: 0,
    };
    this.scene.skills.recordExtra(this.id, 'ripostes', 1, 'add');
  }

  // 破棄後は発動も進行中処理も一切動かさない（遅延処理のリーク防止）。
  update(dt, ctx) { if (this._dead) return; super.update(dt, ctx); this._updateMove(dt); }

  _updateMove(dt) {
    const M = this._move; if (!M) return;
    const P = this.riposteParams(); if (!P.lunge) { this._move = null; return; }
    const p = this.scene.player;
    const wb = this.scene.combat.worldBounds ? this.scene.combat.worldBounds() : { w: 1600, h: 1200 };
    M.totalMs += dt;
    if (M.totalMs > P.maxRiposteMs * (M.maxStrikes + 1)) { this._move = null; return; } // 必ず終わる

    if (M.phase === 'back') {
      M.leftMs -= dt;
      const step = Math.min(P.backstep * (dt / Math.max(1, P.backstepMs)), Math.max(0, M.want - M.moved));
      this._step(p, wb, M.angle + Math.PI, step, P.worldMargin);
      M.moved += step;
      if (M.leftMs <= 0 || M.moved >= M.want - 1e-6) { M.phase = 'lunge'; M.moved = 0; M.want = this._lungeWant(P, M); }
      return;
    }
    // 踏み込み（対象が消えていても現在方向へ短く進む＝安全 fallback）。
    const step = Math.min(P.lungeSpeed * (dt / 1000), Math.max(0, M.want - M.moved));
    this._step(p, wb, M.angle, step, P.worldMargin);
    M.moved += step;
    if (M.moved >= M.want - 1e-6) {
      this._strike(M, P);
      M.strikes += 1;
      if (M.strikes >= M.maxStrikes) { this._finish(M, P); return; }
      // 2 段目（進化のみ）。近距離だけを見て向き直る。
      const next = P.retargetRange > 0
        ? this.scene.combat.nearestEnemy(p.x, p.y, this.meleeRadius(P.retargetRange)) : null;
      if (next && M.retargets < M.maxRetargets) {
        M.angle = Math.atan2(next.y - p.y, next.x - p.x);
        M.retargets += 1;
        this.scene.skills.recordExtra(this.id, 'retargets', 1, 'add');
      }
      M.moved = 0; M.want = Math.max(1, Math.min(this._lungeWant(P, M), P.lunge * 0.4));
    }
  }

  // 踏み込む距離。**相手を追い越さない**ように、間合いのぶんだけで止める。
  // 相手が見えないときは宣言どおりの距離を進む（安全 fallback・壁内クランプは _step が行う）。
  _lungeWant(P, M) {
    const p = this.scene.player;
    const t = this.scene.combat.nearestEnemy(p.x, p.y, this.meleeRadius(P.radius) + P.lunge);
    if (!t) return P.lunge;
    M.angle = Math.atan2(t.y - p.y, t.x - p.x);
    const gap = Math.hypot(t.x - p.x, t.y - p.y) - this.meleeRadius(P.radius) * 0.5;
    return Math.max(0, Math.min(P.lunge, gap));
  }

  _step(p, wb, ang, step, margin) {
    if (!(step > 0)) return;
    const nx = p.x + Math.cos(ang) * step;
    const ny = p.y + Math.sin(ang) * step;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    p.x = Math.max(margin, Math.min(wb.w - margin, nx));
    p.y = Math.max(margin, Math.min(wb.h - margin, ny));
  }

  // 段ごとの数値（進化が上書きする）。base は 2 段目を 1.2 倍にするだけ。
  strikeValues(index, P) {
    const m = index >= 1 ? 1.2 : 1;
    return { damage: P.damage * m, knockback: P.knockback, poiseDamage: P.poiseDamage };
  }

  _strike(M, P) {
    const p = this.scene.player;
    const V = this.strikeValues(M.strikes, P);
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(P.radius), arc: P.arc, facing: M.angle,
      damage: V.damage, skillId: this.id, castKey: M.castKey,
      knockback: V.knockback, poiseDamage: V.poiseDamage, poiseOnceSet: new Set(),
      comboGain: P.comboGain, furyGain: P.furyGain,
      maxTargets: P.maxTargets > 0 ? P.maxTargets : undefined,
      tags: ['melee', 'slash', 'riposte'], color: 0xb2ebf2, visualIndex: M.strikes,
      visualCap: 'maxRiposteTrails',
    });
    this.scene.skills.recordExtra(this.id, 'strikes', 1, 'add');
  }

  _finish(M, P) {
    if (this._move !== M) return;
    this._move = null;
    // 進化のみ: コンボの猶予だけを戻す（コンボ値そのものは無料で配らない）。
    if (P.graceRefill > 0 && this.warrior) this.warrior.refillComboGrace(P.graceRefill);
  }

  // 後退中の軽減（Player.takeDamage → onWarriorDamage が読む）。無敵にはならない。
  get retreating() { return !!this._move && this._move.phase === 'back'; }
  activeMitigation() { return this.retreating ? (this.riposteParams().mitigation || 0) : 0; }

  serializeState() {
    // 踏み込みの途中状態は保存しない（再開時の二重踏み込み・座標の飛びを防ぐ）。
    return { cdLeft: this._cd, ripostePhase: this._move ? this._move.phase : 'none' };
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    this._move = null;
  }
  destroy() { this._dead = true; this._move = null; }
}
