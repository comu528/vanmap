// 怒涛連撃（M8-C・戦士 Wave1）: 連続近接攻撃。
// 最寄りの近距離対象へ手数で押し切る。対象を倒したら**近距離の次の相手へ残りの手数を引き継ぐ**。
// - 遠距離へ瞬間移動しない（retargetRange 内だけを探す）。
// - strike 数が多くても 1 発動 = 1 recordCast。
// - 闘気/コンボの獲得は cast 単位の上限（castKey）と hitGroup で守られる。
// - ボス単体でも全 strike が有効（対象が居る限り手数は消化される）。
// - 対象オブジェクトは保存しない（安定 runtime id のみ）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class RelentlessComboSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._combo = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._combo; }

  // 進化が上書きするためのパラメータ束。
  comboParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      damage: s.damage || 0,
      strikes: s.strikes || 1,
      interval: s.interval || 100,
      radius: s.radius || 0,
      arc: s.arc || 1.4,
      retargetRange: s.retargetRange || 0,
      finalStrikeMultiplier: s.finalStrikeMultiplier || 1,
      knockback: s.knockback || 0,
      poiseDamage: s.poiseDamage || 0,
      comboGain: s.comboGain,
      furyGain: s.furyGain,
      maxRetargets: cfg.maxRetargets ?? 3,
      poiseOnce: cfg.poiseOncePerTargetPerCast === true,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const P = this.comboParams();
    const p = this.scene.player;
    const target = this.scene.combat.nearestEnemy(p.x, p.y, this.meleeRadius(P.radius) * 1.4);
    if (!target) return;
    const total = Math.min(
      this.strikeCount(P.strikes),
      this.scene.combat.skillCap('maxRelentlessStrikes', 12),
    );
    this._combo = {
      castKey: this.newCastKey(),
      left: total, total, tickLeft: 0, index: 0,
      seq: target._seq, isBoss: !!target.isBoss,
      retargets: 0,
      poised: P.poiseOnce ? new Set() : null,
    };
    this.scene.skills.recordExtra(this.id, 'combos', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'plannedStrikes', total, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    this._updateCombo(dt);
  }

  _updateCombo(dt) {
    const C = this._combo; if (!C) return;
    const P = this.comboParams();
    C.tickLeft -= dt;
    if (C.tickLeft > 0) return;
    C.tickLeft += Math.max(40, P.interval);

    let target = this._resolveTarget(C, P);
    if (!target) {
      // 近距離に次の相手が居なければ、その時点で連撃は終わる（遠距離へ飛ばない）。
      this._finish(C);
      return;
    }
    C.index += 1;
    C.left -= 1;
    const isFinal = C.left <= 0;
    const p = this.scene.player;
    const ang = Math.atan2(target.y - p.y, target.x - p.x);
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(P.radius), arc: P.arc, facing: ang,
      damage: P.damage * (isFinal ? P.finalStrikeMultiplier : 1),
      skillId: this.id, castKey: C.castKey,
      knockback: P.knockback, poiseDamage: P.poiseDamage, poiseOnceSet: C.poised,
      comboGain: P.comboGain, furyGain: P.furyGain,
      tags: ['melee', 'slash', 'combo'], color: 0xffd54f, visualIndex: C.index,
      visualCap: 'maxRelentlessSparks',
    });
    this.scene.skills.recordExtra(this.id, 'strikes', 1, 'add');
    if (isFinal) this._finish(C, true);
  }

  _finish(C, completed) {
    if (this._combo !== C) return;
    this._combo = null;
    if (completed && this.warrior) this.warrior.noteMovement('relentlessChain', 0);
    if (completed) this.scene.skills.recordExtra(this.id, 'completedChains', 1, 'add');
  }

  // 現在の対象を解決し、倒れていれば近距離の次の相手へ引き継ぐ（retarget）。
  _resolveTarget(C, P) {
    const p = this.scene.player;
    if (C.isBoss) {
      const b = this.scene.boss;
      if (b && b.alive) return b;
    } else {
      for (const e of this.scene.combat.enemiesInRadius(p.x, p.y, this.meleeRadius(P.radius) * 1.6)) {
        if (e && e.alive && e._seq === C.seq) return e;
      }
    }
    // 引き継ぎ（近距離のみ・回数上限つき）。
    const cap = Math.min(P.maxRetargets, this.scene.combat.skillCap('maxRelentlessRetargets', 3));
    if (C.retargets >= cap) return null;
    const next = this.scene.combat.nearestEnemy(p.x, p.y, this.meleeRadius(P.retargetRange));
    if (!next) return null;
    C.retargets += 1;
    C.seq = next._seq;
    C.isBoss = !!next.isBoss;
    if (this.warrior) this.warrior.noteMovement('relentlessRetarget', 0);
    this.scene.skills.recordExtra(this.id, 'retargets', 1, 'add');
    return next;
  }

  get comboing() { return !!this._combo; }

  serializeState() {
    // 対象オブジェクトは保存しない（安定 runtime id と残り手数だけ）。
    return {
      cdLeft: this._cd,
      remainStrikes: this._combo ? this._combo.left : 0,
      strikeIndex: this._combo ? this._combo.index : 0,
      intervalLeft: this._combo ? this._combo.tickLeft : 0,
      retargets: this._combo ? this._combo.retargets : 0,
    };
  }
  restoreState(st) {
    if (!st) return;
    this.restoreCd(st.cdLeft);
    // 連撃の途中状態は復元しない（再開時の二重 strike を防ぐ）。CD だけ戻す。
    this._combo = null;
  }
  destroy() { this._dead = true; this._combo = null; }
}
