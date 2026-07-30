// 豪腕投げ（M8-D・戦士 Wave2）: 掴んで投げる。
// - 掴めるのは**通常敵だけ**。エリートはその場で叩きつけ、ボスは掴まず重い体勢打撃へ置換する。
//   可否は WarriorCombatSystem.grabPolicy() に一元化してある（スキル側で isBoss を見ない）。
// - 敵オブジェクトは保持しない（安定 runtime id は WarriorCombatSystem が持つ）。
// - 対象が死亡・プール返却されたら掴みは必ず解除される（onEnemyRemoved 経由）。
// - 投げから投げが連鎖しない。着地衝撃は 1 発動 1 回で、死亡イベントは共通経路が 1 回だけ出す。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class BattlefieldThrowSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._throw = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._throw; }

  // 進化（山岳投擲）が上書きするパラメータ。
  throwParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      damage: s.damage || 0, grabRange: s.grabRange || 0, throwDistance: s.throwDistance || 0,
      impactRadius: s.impactRadius || 0, impactDamage: s.impactDamage || 0,
      eliteSlam: s.eliteSlam || 0, bossPoise: s.bossPoise || 0,
      knockback: s.knockback || 0, poiseDamage: s.poiseDamage || 0,
      comboGain: s.comboGain, furyGain: s.furyGain,
      secondaryRadius: 0, secondaryDamage: 0, bossStrike: 0,
      grabDurationMs: cfg.grabDurationMs ?? 220, throwSpeed: cfg.throwSpeed ?? 620,
      maxThrowMs: cfg.maxThrowMs ?? 600, worldMargin: cfg.worldMargin ?? 24,
      // ボスは掴めない（可否そのものは balance.warrior.grab が持つ。data 側の明示宣言）。
      bossGrabForbidden: cfg.bossGrabForbidden !== false,
    };
  }

  // 1 発動で掴める回数の上限（進化が safetyCaps で上書きする）。
  maxGrabPerCast() { return this.warrior ? this.warrior.maxGrabPerCast() : 1; }

  fire() {
    if (this.scene.gameOver) return;
    const P = this.throwParams();
    if (!(P.grabRange > 0)) return;
    const p = this.scene.player;
    const castKey = this.newCastKey();
    const target = this.scene.combat.nearestEnemy(p.x, p.y, this.meleeRadius(P.grabRange));
    if (!target) { this.scene.skills.recordExtra(this.id, 'misses', 1, 'add'); return; }
    const canGrab = this.maxGrabPerCast() >= 1 && !(P.bossGrabForbidden && target.isBoss);
    const res = canGrab
      ? this.scene.combat.grabTarget(target, { source: this.id, skillId: this.id })
      : { mode: target.isBoss ? 'bossStrike' : 'eliteSlam', reason: 'grabForbidden' };
    if (res.mode === 'throw') {
      // 投げ先は敵の密集地点（無ければ現在地の少し先）。座標だけを持ち、敵は保持しない。
      const spot = this.scene.combat.densestPoint(P.throwDistance * 0.8, 0)
        || { x: p.x + Math.cos(this.facing(P.throwDistance)) * P.throwDistance, y: p.y + Math.sin(this.facing(P.throwDistance)) * P.throwDistance };
      this._throw = {
        castKey, phase: 'hold', leftMs: P.grabDurationMs, tx: spot.x, ty: spot.y,
        moved: 0, want: P.throwDistance,
      };
      this.scene.skills.recordExtra(this.id, 'grabs', 1, 'add');
      return;
    }
    // 掴めない相手（エリート / ボス）への代替。掴み状態は作らない。
    if (res.mode === 'eliteSlam') this._eliteSlam(target, castKey, P);
    else if (res.mode === 'bossStrike') this._bossStrike(target, castKey, P, res.poiseMultiplier);
    this.scene.skills.recordExtra(this.id, 'alternates', 1, 'add');
  }

  // 破棄後は発動も進行中処理も一切動かさない（遅延処理のリーク防止）。
  update(dt, ctx) { if (this._dead) return; super.update(dt, ctx); this._updateThrow(dt); }

  _updateThrow(dt) {
    const T = this._throw; if (!T) return;
    const P = this.throwParams();
    const w = this.warrior;
    // 掴んでいた相手が消えたら安全に終わる（掴み解除は共通経路が行う）。
    if (!w || !w.grabbing) { this._throw = null; return; }
    const e = this.scene.combat.grabbedTarget();
    if (!e || !e.alive) { this.scene.combat.releaseGrab(true); this._throw = null; return; }
    if (T.phase === 'hold') {
      T.leftMs -= dt;
      if (T.leftMs <= 0) { T.phase = 'fly'; T.leftMs = P.maxThrowMs; }
      return;
    }
    // 投げ（数フレームに分けて運ぶ＝テレポートしない。壁内クランプは共通経路が行う）。
    T.leftMs -= dt;
    const step = Math.min(P.throwSpeed * (dt / 1000), Math.max(0, T.want - T.moved));
    const moved = step > 0 ? this.scene.combat.throwGrabbed({ x: T.tx, y: T.ty, distance: step }) : 0;
    T.moved += moved;
    if (moved <= 1e-6 || T.moved >= T.want - 1e-3 || T.leftMs <= 0) this._land(T, P, e);
  }

  // 着地。投げられた敵と着地点の双方へ 1 回だけ衝撃を与える（連鎖しない）。
  _land(T, P, e) {
    if (this._throw !== T) return;
    this._throw = null;
    const lx = e.x, ly = e.y;
    this.scene.combat.releaseGrab(false);
    if (this.warrior) this.warrior.noteThrowImpact(T.moved);
    this.scene.combat.meleeStrike({
      x: lx, y: ly, radius: this.meleeRadius(P.impactRadius), arc: Math.PI * 2, facing: 0,
      damage: P.impactDamage, skillId: this.id, castKey: T.castKey,
      knockback: P.knockback, poiseDamage: P.poiseDamage, poiseOnceSet: new Set(),
      comboGain: P.comboGain, furyGain: P.furyGain,
      maxTargets: this.scene.combat.skillCap('maxThrowImpacts', 2) * 12,
      tags: ['melee', 'blunt', 'area', 'throw'], color: 0xa1887f, visualIndex: 0, debris: true,
      visualCap: 'maxThrowArcs',
    });
    this.scene.skills.recordExtra(this.id, 'throws', 1, 'add');
  }

  // 追撃（進化「山岳投擲」のエリート叩きつけ 2 回目）。base では発生しない。
  _secondary() {}

  _eliteSlam(target, castKey, P) {
    this.scene.combat.meleeStrike({
      x: target.x, y: target.y, radius: this.meleeRadius(P.impactRadius * 0.7), arc: Math.PI * 2, facing: 0,
      damage: P.eliteSlam, skillId: this.id, castKey,
      knockback: P.knockback, poiseDamage: P.poiseDamage * 1.5, poiseOnceSet: new Set(),
      comboGain: P.comboGain, furyGain: P.furyGain,
      maxTargets: 8,
      tags: ['melee', 'blunt', 'area'], color: 0x8d6e63, visualIndex: 1, debris: true,
      visualCap: 'maxThrowArcs',
    });
    this.scene.skills.recordExtra(this.id, 'eliteSlams', 1, 'add');
    if (P.secondaryDamage > 0) this._secondary(castKey, P, target.x, target.y);
  }

  _bossStrike(target, castKey, P, poiseMult) {
    const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(P.grabRange), arc: 1.4,
      facing: Math.atan2(target.y - p.y, target.x - p.x),
      damage: P.bossStrike > 0 ? P.bossStrike : P.impactDamage, skillId: this.id, castKey,
      knockback: 0, poiseDamage: P.bossPoise * (poiseMult > 0 ? poiseMult : 1), poiseOnceSet: new Set(),
      comboGain: P.comboGain, furyGain: P.furyGain,
      maxTargets: 1,
      tags: ['melee', 'blunt', 'stance_break'], color: 0x6d4c41, visualIndex: 2,
      visualCap: 'maxThrowArcs',
    });
    this.scene.skills.recordExtra(this.id, 'bossStrikes', 1, 'add');
  }

  get throwing() { return !!this._throw; }

  serializeState() {
    // 掴み / 投げの途中状態は保存しない（再開時の無料着地衝撃・敵参照の持ち越しを防ぐ）。
    return { cdLeft: this._cd, throwPhase: this._throw ? this._throw.phase : 'none' };
  }
  restoreState(st) {
    if (!st) return;
    this.restoreCd(st.cdLeft);
    this._throw = null;
    if (this.scene.combat.releaseGrab) this.scene.combat.releaseGrab(true);
  }
  destroy() {
    this._dead = true; this._throw = null;
    if (this.scene.combat && this.scene.combat.releaseGrab) this.scene.combat.releaseGrab(true);
  }
}
