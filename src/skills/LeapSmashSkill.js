// 跳躍強襲（M8-C・戦士 Wave1）: 跳躍接近。
// 敵の密集地点へ短く跳び込み、着地の衝撃で周囲を打ち据える。
// - 跳躍中は被ダメージ軽減がかかるが**無敵にはならない**。
// - 対象が死亡・消失しても、記録した着地座標へそのまま跳ぶ（安全 fallback）。
// - 距離と時間の両方で必ず終わる。壁外・NaN・無限跳躍を作らない。
// - ボスが予告/突進中なら、その方向へは踏み込まない（完全無視しない）。
// - 着地は 1 回だけ main impact（recordCast は fire の 1 回のみ）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class LeapSmashSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._leap = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._leap; }

  // 進化（天墜崩撃）が上書きする跳躍パラメータ。
  leapParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      distance: s.leapDistance || 0,
      speed: cfg.leapSpeed ?? 620,
      minDistance: cfg.minLeapDistance ?? 48,
      maxLeapMs: cfg.maxLeapMs ?? 700,
      mitigation: s.mitigationValue || 0,
      landingDelayMs: cfg.landingDelayMs ?? 60,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const lp = this.leapParams();
    const p = this.scene.player;
    const castKey = this.newCastKey();
    // 着地地点は「敵の密集地点」。無ければ最寄り敵、それも無ければ向いている方向。
    const spot = this.scene.combat.densestPoint(lp.distance * 0.6, 0)
      || this.scene.combat.nearestEnemy(p.x, p.y, lp.distance * 1.5);
    let ang;
    if (spot) ang = Math.atan2(spot.y - p.y, spot.x - p.x);
    else ang = this.facing(lp.distance);
    // ボスの予告/突進方向へは踏み込まない（真正面なら 70 度ずらす）。
    ang = this._avoidBoss(ang);
    const wb = this.scene.combat.worldBounds ? this.scene.combat.worldBounds() : { w: 1600, h: 1200 };
    const margin = 24;
    // 目標距離は「密集地点までの距離」と data の跳躍距離の小さい方（跳び越しすぎない）。
    let want = lp.distance;
    if (spot) want = Math.min(want, Math.max(lp.minDistance, Math.hypot(spot.x - p.x, spot.y - p.y)));
    want = Math.max(lp.minDistance, want);
    let tx = p.x + Math.cos(ang) * want;
    let ty = p.y + Math.sin(ang) * want;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) { tx = p.x; ty = p.y; }
    tx = Math.max(margin, Math.min(wb.w - margin, tx));
    ty = Math.max(margin, Math.min(wb.h - margin, ty));
    const travel = Math.hypot(tx - p.x, ty - p.y);
    const speed = Math.max(60, lp.speed);
    const durMs = Math.min(lp.maxLeapMs, (travel / speed) * 1000);
    // 対象オブジェクトは保持しない（着地座標だけ持つ＝target 消失でも安全）。
    this._leap = {
      castKey, phase: 'air', leftMs: durMs, angle: ang, speed,
      traveled: 0, maxTravel: travel, landDelayLeft: lp.landingDelayMs, mitigation: lp.mitigation,
    };
    this.scene.skills.recordExtra(this.id, 'leaps', 1, 'add');
  }

  _avoidBoss(ang) {
    const boss = this.scene.boss;
    if (!boss || !boss.alive) return ang;
    if (boss.state !== 'telegraph' && boss.state !== 'charge') return ang;
    const p = this.scene.player;
    const toBoss = Math.atan2(boss.y - p.y, boss.x - p.x);
    let diff = ang - toBoss;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 0.8) return toBoss + (diff >= 0 ? 1.2 : -1.2);
    return ang;
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    this._updateLeap(dt);
  }

  _updateLeap(dt) {
    const L = this._leap; if (!L) return;
    const s = this.stats; if (!s) { this._leap = null; return; }
    const p = this.scene.player;
    if (L.phase === 'air') {
      L.leftMs -= dt;
      const step = Math.min(L.speed * (dt / 1000), Math.max(0, L.maxTravel - L.traveled));
      if (step > 0) {
        const nx = p.x + Math.cos(L.angle) * step;
        const ny = p.y + Math.sin(L.angle) * step;
        if (Number.isFinite(nx) && Number.isFinite(ny)) { p.x = nx; p.y = ny; }
        L.traveled += step;
        this.scene.skills.recordExtra(this.id, 'leapDistance', step, 'add');
        this._trail(L);
      }
      // 距離・時間のどちらかで必ず着地へ移る（無限跳躍しない）。
      if (L.leftMs <= 0 || L.traveled >= L.maxTravel) L.phase = 'landing';
      return;
    }
    if (L.phase === 'landing') {
      L.landDelayLeft -= dt;
      if (L.landDelayLeft > 0) return;
      this._land(L);
      // 着地したらこの発動は終わり（進化は _land を上書きして二次衝撃を出す）。
      if (this._leap === L) this._leap = null;
    }
  }

  // 滞空中の軌跡（演出のみ・品質別上限で打ち切る。判定・ダメージには一切影響しない）。
  _trail(L) {
    const cap = this.scene.combat.skillCap('maxLeapTrails', 8);
    L.trails = (L.trails || 0);
    if (L.trails >= cap) return;
    L.trails += 1;
    const p = this.scene.player;
    if (this.scene.effects && this.scene.effects.hitBurst) this.scene.effects.hitBurst(p.x, p.y, 0xd7ccc8);
  }

  // 着地の衝撃。1 発動につき 1 回だけ（recordCast はしない＝main cast は fire の 1 回）。
  _land(L) {
    const s = this.stats; if (!s) return;
    const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxLeapImpacts', 2);
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(s.radius), arc: Math.PI * 2, facing: 0,
      damage: s.damage, skillId: this.id, castKey: L.castKey,
      knockback: s.knockback, poiseDamage: s.poiseDamage,
      comboGain: s.comboGain, furyGain: s.furyGain,
      maxTargets: cap * 24,
      tags: ['melee', 'blunt', 'area'], color: 0xbcaaa4, visualIndex: 0, debris: true,
      visualCap: 'maxLandingDebris',
    });
    if (this.warrior) this.warrior.noteMovement('leapLanding', 0);
    this.scene.skills.recordExtra(this.id, 'landings', 1, 'add');
  }

  // 跳躍中の軽減（Player.takeDamage → BattleScene.onWarriorDamage が読む）。無敵にはならない。
  get leaping() { return !!this._leap && this._leap.phase === 'air'; }
  chargeMitigation() { return this.leaping ? (this._leap.mitigation || 0) : 0; }

  serializeState() {
    // 跳躍の途中状態は保存しない（無料の再跳躍・座標の飛びを防ぐ）。phase だけ記録して復元時に破棄する。
    return { cdLeft: this._cd, leapPhase: this._leap ? this._leap.phase : 'none' };
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    this._leap = null; // 再開時に無料の着地衝撃を発生させない
  }
  destroy() { this._dead = true; this._leap = null; }
}
