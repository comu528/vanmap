// 凍結光線（frost_mage・M7-B）: 一定時間、最寄り/密集方向へ氷光線を照射する。光線上の敵へ周期ダメージと低い冷気を高速蓄積。
// 照射継続で冷気効率が上限（maxRampMultiplier）まで上昇する。frozen 敵へ追加ダメージ。各tickでは粉砕せず、指定間隔でのみ粉砕判定。
// continuous: クールダウンで新規照射を開始（fire）。recordCast は照射開始時に1回。各tickでは記録しない。太すぎる光線にしない。

import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class FreezingRaySkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._beam = null; // { angle, timeLeft, tickLeft, shatterLeft, ramp, img }
    this._seen = new Set();
  }
  canFire(ctx) { return ctx.hasEnemies && !this._beam; } // 照射中は新規開始しない

  fire() {
    const s = this.stats; const p = this.scene.player;
    const t = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
    if (!t) return;
    const img = this.scene.add.image(0, 0, TEX.PARTICLE).setOrigin(0, 0.5)
      .setTint(0x80d8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(46).setAlpha(0.5);
    this._beam = { angle: Math.atan2(t.y - p.y, t.x - p.x), timeLeft: s.duration || 1400, tickLeft: 0, shatterLeft: 0, ramp: 0, img };
    this.scene.skills.recordExtra(this.id, 'channelSeconds', 0, 'max');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（新規照射開始）
    const beam = this._beam; if (!beam) return;
    const s = this.stats; const p = this.scene.player;
    const range = (p.cfg && p.cfg.attackRange) ? p.cfg.attackRange : 220;
    beam.timeLeft -= dt;
    beam.ramp = Math.min((s.maxRampMultiplier || 1.6) - 1, beam.ramp + (s.rampUpRate || 0.06) * dt / 1000);
    const rampMul = 1 + beam.ramp;
    // 追従（対象死亡時は最寄りへ再照準）。
    const tgt = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
    if (tgt) beam.angle = this._rotToward(beam.angle, Math.atan2(tgt.y - p.y, tgt.x - p.x), 3.0 * dt / 1000);
    beam.tickLeft -= dt; beam.shatterLeft -= dt;
    if (beam.tickLeft <= 0 && beam.timeLeft > 0) { beam.tickLeft = s.tickRate || 180; this._tick(p, beam, range, s, rampMul); }
    this._draw(p, beam, range, s);
    this.scene.skills.recordExtra(this.id, 'channelSeconds', dt / 1000, 'add');
    this.scene.skills.recordExtra(this.id, 'maxRampReached', rampMul, 'max');
    if (beam.timeLeft <= 0) { if (beam.img) beam.img.destroy(); this._beam = null; }
  }

  _rotToward(a, b, step) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d) <= step ? b : a + Math.sign(d) * step; }

  _tick(p, beam, range, s, rampMul) {
    const halfW = (s.beamWidth || 12) / 2 + 6;
    const dx = Math.cos(beam.angle), dy = Math.sin(beam.angle);
    const seen = this._seen; seen.clear();
    const doShatter = beam.shatterLeft <= 0;
    if (doShatter) beam.shatterLeft = this.def?.config?.shatterIntervalMs ?? 420;
    let ticks = 0; const tickCap = this.scene.combat.skillCap('maxFreezingRayTicksPerFrame', 16);
    const targCap = this.scene.combat.skillCap('maxFreezingRayTargets', 28);
    let hit = 0;
    const hg = this.scene.nextHitGroupId();
    for (const e of this.scene.combat.enemiesInRadius(p.x, p.y, range + halfW)) {
      if (!e.alive || seen.has(e) || hit >= targCap) continue;
      const rx = e.x - p.x, ry = e.y - p.y;
      const proj = rx * dx + ry * dy; if (proj < 0 || proj > range) continue;
      const perp = Math.abs(-rx * dy + ry * dx); if (perp > halfW) continue;
      if (ticks >= tickCap) { if (this.scene._m) this.scene._m.suppressed++; break; }
      seen.add(e); hit++; ticks++;
      // 指定間隔でのみ粉砕（各tickでは粉砕しない）。
      if (doShatter && this.scene.combat.isFrozen(e)) this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: 1, skillPower: s.damagePerTick });
      let dmg = s.damagePerTick;
      if (this.scene.combat.isFrozen(e)) dmg *= (1 + (s.frozenBonus || 0));
      this.scene.combat.dealDamage(e, dmg, this.id, {
        element: 'ice', tag: 'dot', quiet: true, color: 0x80d8ff,
        chillAmount: (s.chillPerTick || 0) * rampMul, baseFreezeChance: 0,
        procCoefficient: this.def?.procCoefficient ?? 0.12, hitGroupId: hg,
      });
    }
    if (hit) this.scene.skills.recordExtra(this.id, 'beamTicks', 1, 'add');
  }

  _draw(p, beam, range, s) {
    const img = beam.img; if (!img) return;
    img.setPosition(p.x, p.y).setRotation(beam.angle);
    img.setDisplaySize(range, Math.max(3, s.beamWidth || 12));
    img.setAlpha(0.25 + 0.35 * Math.min(1, beam.timeLeft / 200));
  }

  // 残響/複製（custom）: 追加照射を1回ぶん（短命の光線tick）。二重に常設照射しない。
  echoCast() {
    const s = this.stats; const p = this.scene.player;
    const range = (p.cfg && p.cfg.attackRange) ? p.cfg.attackRange : 220;
    this._tick(p, { angle: (this._beam ? this._beam.angle : 0) }, range, s, 1);
  }
  cloneCast() { this.echoCast(); }

  // 途中再開でクールダウンのみ維持（照射中の光線は保存せず＝再開後は消費済み・無料再開しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }

  destroy() { if (this._beam && this._beam.img) this._beam.img.destroy(); this._beam = null; this._seen.clear(); }
}
