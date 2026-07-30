// 鉄壁突進（M8-D・戦士 Wave2）: 前面防御つきの中距離突進。
// - 突進中は**前方から来た攻撃だけ**を強く受け流す。側面は弱く、背面はほぼ守れない。
//   方向の分からない被弾（DoT・全体攻撃）は前面扱いにしない。判定は WarriorCombatSystem 側。
// - 通常敵は押し分けるが、エリート / ボスは位置を動かさず体勢を削る（resolveKnockback の既存規則）。
// - 距離と時間の両方で必ず終わる。壁外・NaN を作らない。終点で 1 回だけ衝撃を出す。
// - 1 発動 = 1 recordCast（接触・終点衝撃では増やさない）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class ShieldChargeSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._charge = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._charge; }

  // 進化（城塞蹂躙）が上書きするパラメータ。
  chargeParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      damage: s.damage || 0, duration: s.duration || 0, speed: s.speed || 0,
      frontArc: s.frontArc || 0, frontalMitigation: s.frontalMitigation || 0,
      impactDamage: s.impactDamage || 0, width: s.width || 0,
      poiseDamage: s.poiseDamage || 0, knockback: s.knockback || 0,
      comboGain: s.comboGain, furyGain: s.furyGain,
      maxChargeMs: cfg.maxChargeMs ?? 900, worldMargin: cfg.worldMargin ?? 24,
      impactRadiusFactor: cfg.impactRadiusFactor ?? 1.4,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const P = this.chargeParams();
    if (!(P.duration > 0)) return;
    const p = this.scene.player;
    const ang = this.facing(this.meleeRadius(P.width));
    const durMs = Math.min(P.duration, P.maxChargeMs);
    this._charge = {
      castKey: this.newCastKey(), leftMs: durMs, angle: ang, moved: 0,
      hitSet: new Set(), poised: new Set(),
    };
    // 前面防御を WarriorCombatSystem へ登録する（軽減の合成と 70% クランプは向こうが行う）。
    if (this.warrior) {
      this.warrior.beginFrontGuard(this.id, {
        durationMs: durMs, mitigation: P.frontalMitigation, frontArc: P.frontArc, facing: ang,
      });
    }
    this.scene.skills.recordExtra(this.id, 'charges', 1, 'add');
  }

  // 破棄後は発動も進行中処理も一切動かさない（遅延処理のリーク防止）。
  update(dt, ctx) { if (this._dead) return; super.update(dt, ctx); this._updateCharge(dt); }

  _updateCharge(dt) {
    const C = this._charge; if (!C) return;
    const P = this.chargeParams(); if (!P.duration) { this._endCharge(C, false); return; }
    const p = this.scene.player;
    C.leftMs -= dt;
    const wb = this.scene.combat.worldBounds ? this.scene.combat.worldBounds() : { w: 1600, h: 1200 };
    const step = P.speed * (dt / 1000);
    const nx = p.x + Math.cos(C.angle) * step;
    const ny = p.y + Math.sin(C.angle) * step;
    if (Number.isFinite(nx) && Number.isFinite(ny)) {
      p.x = Math.max(P.worldMargin, Math.min(wb.w - P.worldMargin, nx));
      p.y = Math.max(P.worldMargin, Math.min(wb.h - P.worldMargin, ny));
      C.moved += step;
      this.scene.skills.recordExtra(this.id, 'chargeDistance', step, 'add');
    }
    if (this.warrior) this.warrior.updateFrontGuardFacing(this.id, C.angle);
    // 通過中の接触ダメージ（同一敵へは 1 発動 1 回）。
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(P.width), arc: Math.PI, facing: C.angle,
      damage: P.damage, skillId: this.id, castKey: C.castKey,
      knockback: P.knockback, poiseDamage: P.poiseDamage, poiseOnceSet: C.poised, hitSet: C.hitSet,
      comboGain: P.comboGain, furyGain: P.furyGain,
      maxTargets: this.scene.combat.skillCap('maxChargeContacts', 16),
      tags: ['melee', 'blunt', 'charge'], color: 0x90caf9, visualIndex: 0,
      visualCap: 'maxChargeTrails',
    });
    if (C.leftMs <= 0) this._endCharge(C, true);
  }

  // 終点の衝撃は 1 発動 1 回だけ（recordCast はしない）。
  _endCharge(C, impact) {
    if (this._charge !== C) return;
    this._charge = null;
    if (this.warrior) this.warrior.endFrontGuard(this.id);
    if (!impact) return;
    const P = this.chargeParams();
    const p = this.scene.player;
    this._impact(C, P, p);
    this.scene.skills.recordExtra(this.id, 'impacts', 1, 'add');
  }

  _impact(C, P, p) {
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(P.width * P.impactRadiusFactor), arc: Math.PI * 2, facing: 0,
      damage: P.impactDamage, skillId: this.id, castKey: C.castKey,
      knockback: P.knockback, poiseDamage: P.poiseDamage, poiseOnceSet: new Set(),
      comboGain: P.comboGain, furyGain: P.furyGain,
      tags: ['melee', 'blunt', 'area'], color: 0x64b5f6, visualIndex: 1, debris: true,
      visualCap: 'maxChargeTrails',
    });
  }

  get charging() { return !!this._charge; }
  // 前面防御は WarriorCombatSystem が方向つきで判定するので、ここでは方向なしの軽減を返さない。
  activeMitigation() { return 0; }

  serializeState() {
    // 突進の途中状態は保存しない（再開時の無料再突進・座標の飛びを防ぐ）。
    return { cdLeft: this._cd, chargeLeftMs: this._charge ? this._charge.leftMs : 0 };
  }
  restoreState(st) {
    if (!st) return;
    this.restoreCd(st.cdLeft);
    this._charge = null;
    if (this.warrior) this.warrior.endFrontGuard(this.id);
  }
  destroy() {
    this._dead = true; this._charge = null;
    if (this.warrior) this.warrior.endFrontGuard(this.id);
  }
}
