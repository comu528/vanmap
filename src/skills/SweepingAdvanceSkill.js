// 薙ぎ進軍（M8-C・戦士 Wave1）: 移動しながら薙ぎ払い。
// 突進斬り（一点への dash）とは違い、短い距離を「歩きながら」左右交互に薙ぐ。
// - 1 発動 = 1 recordCast。strike ごとには recordCast しない。
// - 通過した敵へ複数回当たりうるが、strike 数と 1 フレームあたりの strike 数に上限がある。
// - 押し出しすぎて攻撃できなくならないよう、knockback は data 側で弱め＋maxKnockbackPush で抑える。
// - 対象を見失っても現在の方向へそのまま短距離だけ進み続ける（安全 fallback）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class SweepingAdvanceSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._sweep = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._sweep; }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const cfg = this.def?.config || {};
    this._sweep = {
      castKey: this.newCastKey(),
      leftMs: s.duration, tickLeft: 0, strikes: 0, index: 0,
      angle: this.facing(this.meleeRadius(s.width)),
      retargetLeft: cfg.retargetIntervalMs ?? 300,
      moved: 0,
    };
    this.scene.skills.recordExtra(this.id, 'advances', 1, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    this._updateSweep(dt);
  }

  _updateSweep(dt) {
    const S = this._sweep; if (!S) return;
    const s = this.stats; if (!s) { this._sweep = null; return; }
    const cfg = this.def?.config || {};
    const p = this.scene.player;
    S.leftMs -= dt;
    S.tickLeft -= dt;
    S.retargetLeft -= dt;
    this.scene.skills.recordExtra(this.id, 'activeMs', dt, 'add');

    // 進行方向の更新（対象が居れば向き直す。居なければ現在方向を維持＝安全 fallback）。
    if (S.retargetLeft <= 0) {
      S.retargetLeft = cfg.retargetIntervalMs ?? 300;
      const t = this.scene.combat.nearestEnemy(p.x, p.y, this.meleeRadius(s.width) * 4);
      if (t) S.angle = Math.atan2(t.y - p.y, t.x - p.x);
    }
    // 前進（壁外・NaN を作らない）。
    const wb = this.scene.combat.worldBounds ? this.scene.combat.worldBounds() : { w: 1600, h: 1200 };
    const margin = 24;
    const step = s.speed * (dt / 1000);
    const nx = p.x + Math.cos(S.angle) * step;
    const ny = p.y + Math.sin(S.angle) * step;
    if (Number.isFinite(nx) && Number.isFinite(ny)) {
      p.x = Math.max(margin, Math.min(wb.w - margin, nx));
      p.y = Math.max(margin, Math.min(wb.h - margin, ny));
      S.moved += step;
      this.scene.skills.recordExtra(this.id, 'advanceDistance', step, 'add');
    }
    // 左右交互の薙ぎ（1 フレームあたりの strike 数にも上限）。
    const budget = this.scene.combat.skillCap('maxSweepStrikesPerFrame', 2);
    let n = 0;
    while (S.tickLeft <= 0 && n < budget && S.strikes < s.maxStrikes && S.leftMs > -s.interval) {
      S.tickLeft += Math.max(40, s.interval);
      S.strikes += 1; S.index += 1; n += 1;
      this._strike(S);
    }
    if (S.leftMs <= 0 || S.strikes >= s.maxStrikes) {
      if (this.warrior) this.warrior.noteMovement('sweep', S.moved);
      this._sweep = null;
    }
  }

  _strike(S) {
    const s = this.stats; if (!s) return;
    const cfg = this.def?.config || {};
    const p = this.scene.player;
    // 左右交互（進行方向を軸に振る）。
    const side = (S.index % 2 === 0 ? 1 : -1) * (cfg.arc ?? 2.0) * 0.22;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(s.width), arc: cfg.arc ?? 2.0, facing: S.angle + side,
      damage: s.damage, skillId: this.id, castKey: S.castKey,
      // 押し出しすぎない（前進しながら殴り続けられるようにする）。
      knockback: s.knockback * (cfg.maxKnockbackPush ?? 0.6),
      poiseDamage: s.poiseDamage,
      comboGain: s.comboGain, furyGain: s.furyGain,
      tags: ['melee', 'slash', 'movement'], color: 0xffe0b2, visualIndex: S.index,
      visualCap: 'maxSweepTrails',
    });
  }

  get sweeping() { return !!this._sweep; }

  serializeState() {
    return {
      cdLeft: this._cd,
      sweepLeftMs: this._sweep ? this._sweep.leftMs : 0,
      sweepStrikes: this._sweep ? this._sweep.strikes : 0,
    };
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    const left = Math.max(0, st.sweepLeftMs || 0);
    const s = this.stats;
    // 「再開」であり「二重化」ではない: 残り時間と消化済み strike 数を引き継ぐ。
    this._sweep = left > 0 && s
      ? {
        castKey: this.nextCastKey(), leftMs: Math.min(left, s.duration), tickLeft: 0,
        strikes: Math.max(0, Math.min(s.maxStrikes, st.sweepStrikes || 0)), index: 0,
        angle: this.facing(this.meleeRadius(s.width)),
        retargetLeft: 0, moved: 0,
      }
      : null;
  }
  destroy() { this._dead = true; this._sweep = null; }
}
