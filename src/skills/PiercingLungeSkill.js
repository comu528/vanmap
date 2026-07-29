// 貫穿突き（M8-E・戦士 最終Wave）: 前方の狭い直線を短く貫く物理の突き。
// - **弾ではない**。プレイヤーの踏み込み＋近接の直線判定（combat.lineStrike）で表現する。
// - 通常敵は複数体を貫けるが、エリート / ボスが射線上にいると単体寄りへ威力が集まる。
//   その振り分けは WarriorCombatSystem.resolveLineMeleeTargets() に一元化してある。
// - 射程は data の lineLength で頭打ち。**画面端までは絶対に届かない**。
// - 少しだけ届かないときだけ安全に踏み込む。ボスの予兆へ無謀に飛び込まない。
// - 1 発動 = 1 castKey = 1 recordCast。同一敵への多重命中にも上限がある。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class PiercingLungeSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._lunge = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._lunge; }

  // 進化（神速貫陣）が上書きするパラメータ。
  lungeParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      damage: s.damage || 0, stepInDistance: s.stepInDistance || 0,
      lineLength: s.lineLength || 0, width: s.width || 0, maxTargets: s.maxTargets || 1,
      eliteBonus: s.eliteBonus || 0, bossBonus: s.bossBonus || 0,
      poiseDamage: s.poiseDamage || 0, knockbackNormal: s.knockbackNormal || 0,
      comboGain: s.comboGain, furyGain: s.furyGain,
      maxLungeMs: cfg.maxLungeMs ?? 220, worldMargin: cfg.worldMargin ?? 24,
      maxHitsPerTarget: cfg.maxHitsPerTargetPerCast ?? 1,
      avoidBossTelegraph: cfg.avoidBossTelegraph !== false,
      thrusts: 1, secondWidth: 0, chainRange: 0, secondDelayMs: 0,
      secondDamage: 0, secondPoise: 0, secondKnockback: 0,
    };
  }

  fire() {
    if (this._dead || this.scene.gameOver) return;
    const P = this.lungeParams();
    if (!(P.lineLength > 0)) return;
    const p = this.scene.player;
    const castKey = this.newCastKey();
    const reach = this.meleeRadius(P.lineLength);
    const t = this.scene.combat.nearestEnemy(p.x, p.y, reach + P.stepInDistance);
    const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : this.facing(reach);
    // 少しだけ届かないときだけ踏み込む。ボスが予兆中なら踏み込まない（無謀に飛び込まない）。
    let step = 0;
    if (t) {
      const gap = Math.hypot(t.x - p.x, t.y - p.y) - reach;
      const telegraph = P.avoidBossTelegraph && this.scene.combat.bossTelegraphing && this.scene.combat.bossTelegraphing();
      if (gap > 0 && !telegraph) step = Math.min(P.stepInDistance, gap);
    }
    this._lunge = {
      castKey, angle: ang, want: step, moved: 0, leftMs: P.maxLungeMs,
      thrusts: 0, seqHits: new Map(),
    };
    this.scene.skills.recordExtra(this.id, 'lunges', 1, 'add');
  }

  // 破棄後は発動も進行中処理も一切動かさない。
  update(dt, ctx) { if (this._dead) return; super.update(dt, ctx); this._updateLunge(dt); }

  _updateLunge(dt) {
    const L = this._lunge; if (!L) return;
    const P = this.lungeParams();
    L.leftMs -= dt;
    // 踏み込み（数フレームに分けて進む＝テレポートしない。壁内クランプは共通経路が行う）。
    const remain = Math.max(0, L.want - L.moved);
    if (remain > 0) {
      const step = Math.min(P.stepInDistance * (dt / Math.max(1, P.maxLungeMs)) * 4, remain);
      const moved = this.scene.combat.movePlayerTowards(
        this.scene.player.x + Math.cos(L.angle) * step,
        this.scene.player.y + Math.sin(L.angle) * step, step);
      L.moved += moved;
      if (moved > 0 && this.warrior) this.warrior.noteLineStepIn(moved);
      if (L.moved < L.want - 1e-6 && L.leftMs > 0) return;
    }
    this._thrust(L, P, 0);
    L.thrusts = 1;
    const total = Math.min(P.thrusts, this.scene.combat.skillCap('maxLineThrusts', 2));
    if (total > 1) {
      // 2 段目（進化のみ）。同じ castKey なので recordCast は増えない。
      const delay = P.secondDelayMs || 160;
      this.scene.time.delayedCall(delay, () => {
        if (this._dead || this.scene.gameOver) return;
        this._thrust(L, P, 1);
      });
    }
    this.scene.skills.recordExtra(this.id, 'thrusts', total, 'add');
    this._lunge = null;
  }

  _thrust(L, P, index) {
    const p = this.scene.player;
    const second = index >= 1;
    // 2 段目は少し広いが、長さは同じ（画面端まで伸ばさない）。
    const width = second && P.secondWidth > 0 ? P.secondWidth : P.width;
    const lineCfg = this.warrior ? this.warrior.beginPiercingLunge({
      lineLength: this.meleeRadius(P.lineLength), width: this.meleeRadius(width),
      maxTargets: Math.min(P.maxTargets, this.scene.combat.skillCap('maxLineTargets', 12)),
      maxHitsPerTarget: P.maxHitsPerTarget, stepIn: P.stepInDistance,
    }) : null;
    if (!lineCfg) return;
    const res = this.scene.combat.lineStrike({
      x: p.x, y: p.y, radius: lineCfg.length, arc: Math.PI * 2, facing: L.angle,
      line: { length: lineCfg.length, width: lineCfg.width, facing: L.angle, maxTargets: lineCfg.maxTargets },
      damage: second && P.secondDamage > 0 ? P.secondDamage : P.damage,
      skillId: this.id, castKey: L.castKey,
      knockback: second && P.secondKnockback > 0 ? P.secondKnockback : P.knockbackNormal,
      poiseDamage: second && P.secondPoise > 0 ? P.secondPoise : P.poiseDamage,
      poiseOnceSet: new Set(),
      comboGain: P.comboGain, furyGain: P.furyGain,
      maxTargets: lineCfg.maxTargets,
      // 同一敵への多重命中上限（安定 runtime id で数える）。
      seqHitCounts: L.seqHits, seqHitCap: lineCfg.maxHitsPerTarget,
      // エリート / ボスへの追加倍率（硬い相手ほど 1 点へ集まる設計）。
      toughBonus: P.eliteBonus, toughPoiseBonus: P.bossBonus,
      tags: ['melee', 'thrust', 'line'], color: 0xe0f7fa, visualIndex: index,
      visualCap: 'maxThrustTrails',
    });
    if (res && res.hits > 1) this.scene.skills.recordExtra(this.id, 'penetrations', res.hits - 1, 'add');
    if (res && res.hits > 0) this.scene.skills.recordExtra(this.id, 'hitsTotal', res.hits, 'add');
  }

  get lunging() { return !!this._lunge; }

  serializeState() {
    // 踏み込みの途中状態は保存しない（再開時の無料再発動・座標の飛びを防ぐ）。
    return { cdLeft: this._cd, lungePending: !!this._lunge };
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    this._lunge = null;
  }
  destroy() { this._dead = true; this._lunge = null; }
}
