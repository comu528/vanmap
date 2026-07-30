// 鎖鉤（M8-C・戦士 Wave1）: 引き寄せ / 接近補助。
// 近接の届かない相手へ鉤を打ち込む。
// - 通常敵はプレイヤー側へ引き寄せる。
// - エリートは引き寄せ距離が大幅に小さい。
// - ボスは動かせないので、代わりに**プレイヤーが安全距離だけ踏み込む**。
// - 対象が消えたら安全に終了する（敵オブジェクトは保存せず、_seq の runtime id だけ持つ）。
// - 壁外・NaN・テレポートを作らない。引き寄せは共通経路（combat.pullTarget）が SpatialGrid を更新する。
// - ボスが予告/突進中は踏み込まない（完全無視しない）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class ChainHookSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._hook = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._hook; }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const cfg = this.def?.config || {};
    const p = this.scene.player;
    const castKey = this.newCastKey();
    // 近接範囲の外にいる相手を狙う（近すぎる相手を引いても意味がない）。
    const target = this.scene.combat.nearestEnemy(p.x, p.y, s.range);
    if (!target) { this.scene.skills.recordExtra(this.id, 'misses', 1, 'add'); return; }
    // ボスの予告/突進中は踏み込まない（ボス相手はこちらが近づく挙動のため）。
    if (target.isBoss && this.scene.combat.bossTelegraphing && this.scene.combat.bossTelegraphing()) {
      this.scene.skills.recordExtra(this.id, 'misses', 1, 'add');
      return;
    }
    // 1 発動あたりの引き寄せ回数（品質別 cap と data の maxPullPerCast の小さい方）。
    const pullCfg = this.scene.combat.warriorPullConfig ? this.scene.combat.warriorPullConfig() : {};
    const maxPulls = Math.min(
      this.scene.combat.skillCap('maxChainPullsPerCast', 1),
      pullCfg.maxPullPerCast != null ? pullCfg.maxPullPerCast : 1,
    );
    if (maxPulls <= 0) { this.scene.skills.recordExtra(this.id, 'misses', 1, 'add'); return; }
    // 敵オブジェクトそのものは持たない。安定 runtime id（_seq）と座標だけを持つ。
    this._hook = {
      castKey, seq: target._seq, isBoss: !!target.isBoss, isElite: !!target.isElite,
      leftMs: cfg.maxPullMs ?? 600, pulled: 0, pulls: 0, maxPulls,
      x: target.x, y: target.y,
    };
    // 打ち込みのダメージ・体勢削り（引き寄せそのものは下の update で行う）。
    this.scene.combat.meleeStrike({
      x: target.x, y: target.y, radius: Math.max(18, this.meleeRadius(28)), arc: Math.PI * 2, facing: 0,
      damage: s.damage, skillId: this.id, castKey,
      knockback: 0, poiseDamage: s.poiseDamage,
      comboGain: s.comboGain, furyGain: s.furyGain,
      maxTargets: 1,
      tags: ['melee', 'blunt', 'pull'], color: 0x90a4ae, visualIndex: 0,
      visualCap: 'maxChainHookLines',
    });
    this.scene.skills.recordExtra(this.id, 'hooks', 1, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    this._updateHook(dt);
  }

  // 引き寄せ / 接近を数フレームに分けて行う（テレポートしない）。
  _updateHook(dt) {
    const H = this._hook; if (!H) return;
    const s = this.stats; if (!s) { this._hook = null; return; }
    const cfg = this.def?.config || {};
    H.leftMs -= dt;
    // 対象を runtime id で引き直す（消えていたら安全に終了）。
    const target = this._resolveTarget(H);
    if (!target || !target.alive) { this._hook = null; return; }
    if (H.isBoss) {
      // ボスは動かさない。こちらが安全距離だけ近づく。
      const want = s.playerApproachBoss;
      const step = Math.min((cfg.bossApproachSpeed ?? 380) * (dt / 1000), Math.max(0, want - H.pulled));
      if (step > 0) {
        const moved = this.scene.combat.movePlayerTowards(target.x, target.y, step);
        H.pulled += moved;
        this.scene.skills.recordExtra(this.id, 'approachDistance', moved, 'add');
      }
      if (H.pulled >= want - 1e-3 || H.leftMs <= 0) {
        if (this.warrior) this.warrior.noteMovement('bossApproach', H.pulled);
        this._hook = null;
      }
      return;
    }
    // 通常敵 / エリートは引き寄せる（エリートは data 側で距離が小さい）。
    if (H.pulls >= H.maxPulls) { this._hook = null; return; }
    const want = H.isElite ? s.pullDistanceElite : s.pullDistanceNormal;
    const step = Math.min((cfg.pullSpeed ?? 520) * (dt / 1000), Math.max(0, want - H.pulled));
    if (step > 0) {
      const moved = this.scene.combat.pullTarget(target, { distance: step, stopAt: cfg.safeMargin ?? 24 });
      H.pulled += moved;
      this.scene.skills.recordExtra(this.id, 'pullDistance', moved, 'add');
      if (moved <= 1e-6) { this._hook = null; return; } // これ以上引けない（密着済み）
    }
    if (H.pulled >= want - 1e-3 || H.leftMs <= 0) { H.pulls += 1; this._hook = null; }
  }

  // 敵オブジェクト参照を保持しないための解決（_seq は出現順の安定 runtime id）。
  _resolveTarget(H) {
    const p = this.scene.player;
    if (H.isBoss) return this.scene.boss && this.scene.boss.alive ? this.scene.boss : null;
    const s = this.stats;
    for (const e of this.scene.combat.enemiesInRadius(p.x, p.y, (s?.range || 200) * 1.5)) {
      if (e && e.alive && e._seq === H.seq) return e;
    }
    return null;
  }

  get hooking() { return !!this._hook; }

  serializeState() {
    // 敵オブジェクトは保存しない。安定 runtime id と進捗だけを保存する。
    return {
      cdLeft: this._cd,
      hookLeftMs: this._hook ? this._hook.leftMs : 0,
      hookSeq: this._hook ? this._hook.seq : -1,
      hookPulled: this._hook ? this._hook.pulled : 0,
      hookIsBoss: this._hook ? this._hook.isBoss : false,
    };
  }
  restoreState(st) {
    if (!st) return;
    this.restoreCd(st.cdLeft);
    // 引き寄せの途中状態は復元しない（再開時の二重移動・座標の飛びを防ぐ）。CD だけ戻す。
    this._hook = null;
  }
  destroy() { this._dead = true; this._hook = null; }
}
