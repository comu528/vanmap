// 狂戦猛進（M8-D・戦士 Wave2）: 近距離の敵の間を短く踏み込みながら連続攻撃する。
// - 体力が減っているほど 1 撃が重くなるが、**自傷せず・処刑もせず・倍率には上限がある**
//   （倍率の計算と上限は WarriorCombatSystem.lowHpDamageMultiplier() に一元化）。
// - 踏み込みは数フレームに分けて行う（テレポートしない）。近距離だけを見て向き直る。
// - 1 発動 = 1 recordCast。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class BerserkerRushSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._rush = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._rush; }

  rushParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      damage: s.damage || 0, rushCount: s.rushCount || 1, interval: s.interval || 140,
      stepDistance: s.stepDistance || 0, retargetRange: s.retargetRange || 0,
      missingHpBonus: s.missingHpBonus || 0, poiseDamage: s.poiseDamage || 0,
      knockback: s.knockback || 0, comboGain: s.comboGain, furyGain: s.furyGain,
      // 低 HP 倍率の上限（balance 側の上限と小さい方を採る＝data だけで緩められない）。
      maxMissingHpMultiplier: cfg.maxMissingHpMultiplier ?? 1.6,
      maxRushMs: cfg.maxRushMs ?? 1400, worldMargin: cfg.worldMargin ?? 24,
      radius: this.def?.meleeRange || 62,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const P = this.rushParams();
    const p = this.scene.player;
    const t = this.scene.combat.nearestEnemy(p.x, p.y, this.meleeRadius(P.retargetRange));
    if (!t) { this.scene.skills.recordExtra(this.id, 'misses', 1, 'add'); return; }
    const total = Math.min(P.rushCount, this.scene.combat.skillCap('maxRushSteps', 8));
    this._rush = {
      castKey: this.newCastKey(), left: total, total, tickLeft: 0, index: 0,
      angle: Math.atan2(t.y - p.y, t.x - p.x), totalMs: 0, moved: 0,
    };
    this.scene.skills.recordExtra(this.id, 'rushes', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'plannedSteps', total, 'add');
  }

  // 破棄後は発動も進行中処理も一切動かさない（遅延処理のリーク防止）。
  update(dt, ctx) { if (this._dead) return; super.update(dt, ctx); this._updateRush(dt); }

  _updateRush(dt) {
    const R = this._rush; if (!R) return;
    const P = this.rushParams();
    R.totalMs += dt;
    if (R.totalMs > P.maxRushMs) { this._finish(R); return; } // 必ず終わる
    R.tickLeft -= dt;
    if (R.tickLeft > 0) return;
    R.tickLeft += Math.max(40, P.interval);
    const p = this.scene.player;
    // 近距離だけを見て向き直る（遠距離へは飛ばない）。
    const t = this.scene.combat.nearestEnemy(p.x, p.y, this.meleeRadius(P.retargetRange));
    if (!t) { this._finish(R); return; }
    R.angle = Math.atan2(t.y - p.y, t.x - p.x);
    // 短い踏み込み（壁内へクランプ・NaN を作らない）。
    const wb = this.scene.combat.worldBounds ? this.scene.combat.worldBounds() : { w: 1600, h: 1200 };
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    const step = Math.max(0, Math.min(P.stepDistance, d - this.meleeRadius(P.radius) * 0.6));
    if (step > 0) {
      const nx = p.x + Math.cos(R.angle) * step;
      const ny = p.y + Math.sin(R.angle) * step;
      if (Number.isFinite(nx) && Number.isFinite(ny)) {
        p.x = Math.max(P.worldMargin, Math.min(wb.w - P.worldMargin, nx));
        p.y = Math.max(P.worldMargin, Math.min(wb.h - P.worldMargin, ny));
        R.moved += step;
        this.scene.skills.recordExtra(this.id, 'rushDistance', step, 'add');
      }
    }
    R.index += 1; R.left -= 1;
    this._strike(R, P);
    if (R.left <= 0) this._finish(R, true);
  }

  _strike(R, P) {
    const p = this.scene.player;
    const w = this.warrior;
    // 低 HP 補正（上限は data・自傷なし・処刑なし）。
    const mult = Math.min(w ? w.lowHpDamageMultiplier(P.missingHpBonus) : 1, P.maxMissingHpMultiplier);
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(P.radius), arc: 1.6, facing: R.angle,
      damage: P.damage * mult, skillId: this.id, castKey: R.castKey,
      knockback: P.knockback, poiseDamage: P.poiseDamage,
      comboGain: P.comboGain, furyGain: P.furyGain,
      tags: ['melee', 'slash', 'movement'], color: 0xef9a9a, visualIndex: R.index,
      visualCap: 'maxRushSparks',
    });
    this.scene.skills.recordExtra(this.id, 'steps', 1, 'add');
  }

  _finish(R, completed) {
    if (this._rush !== R) return;
    this._rush = null;
    if (completed) this.scene.skills.recordExtra(this.id, 'completedRushes', 1, 'add');
  }

  get rushing() { return !!this._rush; }

  serializeState() {
    // 途中状態は保存しない（再開時の二重踏み込みを防ぐ）。
    return { cdLeft: this._cd, remainSteps: this._rush ? this._rush.left : 0 };
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    this._rush = null;
  }
  destroy() { this._dead = true; this._rush = null; }
}
