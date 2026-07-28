// 絶対零光（freezing_ray の進化・M7-B）: 主光線に加え近隣の敵へ分岐光線を伸ばす。主対象の冷気量が高いほど分岐数と威力が上がる。
// tick ごとの procCoefficient は低い。frozen 敵へ高い追加ダメージ。指定間隔でのみ粉砕判定。ボスへ高い氷砕ゲージ。
// 光線数・分岐数・tick 数に上限。各tickで recordCast しない（照射開始時のみ主発動）。continuous(cd)。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

export class AbsoluteZeroRaySkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._beam = null; this._branchImgs = []; this._seen = new Set(); }
  canFire(ctx) { return ctx.hasEnemies && !this._beam; }

  fire() {
    const p = this.scene.player;
    const t = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
    if (!t) return;
    const img = this.scene.add.image(0, 0, TEX.PARTICLE).setOrigin(0, 0.5).setTint(0x80d8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(46).setAlpha(0.6);
    this._beam = { angle: Math.atan2(t.y - p.y, t.x - p.x), timeLeft: this.evoDef.duration || 2000, tickLeft: 0, shatterLeft: 0, img };
  }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()
    const beam = this._beam; if (!beam) return;
    const p = this.scene.player;
    const range = (p.cfg && p.cfg.attackRange) ? p.cfg.attackRange : 220;
    beam.timeLeft -= dt; beam.tickLeft -= dt; beam.shatterLeft -= dt;
    const tgt = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
    if (tgt) beam.angle = this._rot(beam.angle, Math.atan2(tgt.y - p.y, tgt.x - p.x), 3.0 * dt / 1000);
    if (beam.tickLeft <= 0 && beam.timeLeft > 0) { beam.tickLeft = this.evoDef.tickRate || 150; this._tick(p, beam, range); }
    this._draw(p, beam, range);
    if (beam.timeLeft <= 0) { this._clear(); }
  }

  _rot(a, b, step) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d) <= step ? b : a + Math.sign(d) * step; }

  _tick(p, beam, range) {
    const ev = this.evoDef; const br = ev.branch || {};
    const doShatter = beam.shatterLeft <= 0;
    if (doShatter) beam.shatterLeft = (ev.shatter || {}).intervalMs || 480;
    // 主対象の冷気量で分岐数を決める。
    const mainT = this.scene.combat.nearestEnemy(p.x, p.y, range + 20);
    const chill = mainT ? this.scene.combat.chillOf(mainT) : 0;
    // M7-E: safetyCaps に加えて品質別上限 maxAbsoluteZeroRayBranches でもクランプ（値は branch.maxBranches 以上＝通常は恒等）。
    const branches = Math.min(Math.floor(chill / (br.chillDivisor || 40)), br.maxBranches || 4, this.cap('maxBranches', 6), this.scene.combat.skillCap('maxAbsoluteZeroRayBranches', 6));
    const damageBoost = 1 + Math.min(0.5, chill * (br.damageBoostPerChill || 0.004));
    const angles = [beam.angle];
    for (let b = 0; b < branches; b++) angles.push(beam.angle + (b + 1) * 0.4 * (b % 2 === 0 ? 1 : -1));
    let ticks = 0; const tickCap = this.scene.combat.skillCap('maxFreezingRayTicksPerFrame', 16);
    for (const ang of angles) this._beamLine(p, ang, range, damageBoost, doShatter, () => (ticks++ < tickCap));
    this._drawBranches(p, angles.slice(1), range);
  }

  _beamLine(p, angle, range, boost, doShatter, budget) {
    const ev = this.evoDef; const halfW = (ev.beamWidth || 14) / 2 + 6;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const seen = this._seen; seen.clear();
    const hg = this.scene.nextHitGroupId();
    // M7-E: bossGauge.multiplier はボス氷砕ゲージのみへ（以前は chillAmount へ乗算し通常敵の冷気まで増えていた）。
    const bossMult = (ev.bossGauge || {}).multiplier || 1;
    for (const e of this.scene.combat.enemiesInRadius(p.x, p.y, range + halfW)) {
      if (!e.alive || seen.has(e)) continue;
      const rx = e.x - p.x, ry = e.y - p.y;
      const proj = rx * dx + ry * dy; if (proj < 0 || proj > range) continue;
      const perp = Math.abs(-rx * dy + ry * dx); if (perp > halfW) continue;
      if (!budget()) break;
      seen.add(e);
      if (doShatter && this.scene.combat.isFrozen(e)) this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: (ev.shatter || {}).multiplier || 1.4, skillPower: (ev.damage || {}).perTick });
      let dmg = ((ev.damage || {}).perTick || 13) * boost;
      if (this.scene.combat.isFrozen(e)) dmg *= (1 + ((ev.damage || {}).frozenBonus || 0.6));
      this.scene.combat.dealDamage(e, dmg, this.id, {
        element: 'ice', tag: 'dot', quiet: true, color: 0x80d8ff,
        chillAmount: (ev.chill || {}).perTick || 8, bossGaugeMult: bossMult, baseFreezeChance: 0,
        procCoefficient: ev.procCoefficient ?? 0.12, hitGroupId: hg,
      });
    }
  }

  // 残響（custom・M7-E）: 照射セッションを再生成せず「追加照射を1回」だけ行う（常設光線を無料で延長/二重生成しない）。
  echoCast() {
    const p = this.scene.player;
    const range = (p.cfg && p.cfg.attackRange) ? p.cfg.attackRange : 220;
    const t = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
    if (!t) return;
    const angle = this._beam ? this._beam.angle : Math.atan2(t.y - p.y, t.x - p.x);
    let ticks = 0; const cap = this.scene.combat.skillCap('maxFreezingRayTicksPerFrame', 16);
    this._beamLine(p, angle, range, 1, false, () => (ticks++ < cap)); // 追加照射は粉砕しない
    this.scene.skills.recordExtra(this.id, 'echoBeams', 1, 'add');
  }
  // 分身（custom・M7-E）: 短い追加光線のみ（射程 60%・粉砕なし・分岐なし）。
  cloneCast() {
    const p = this.scene.player;
    const range = ((p.cfg && p.cfg.attackRange) ? p.cfg.attackRange : 220) * 0.6;
    const t = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
    if (!t) return;
    let ticks = 0; const cap = this.scene.combat.skillCap('maxFreezingRayTicksPerFrame', 16);
    this._beamLine(p, Math.atan2(t.y - p.y, t.x - p.x), range, 1, false, () => (ticks++ < cap));
    this.scene.skills.recordExtra(this.id, 'cloneBeams', 1, 'add');
  }

  _draw(p, beam, range) { const img = beam.img; if (!img) return; img.setPosition(p.x, p.y).setRotation(beam.angle).setDisplaySize(range, Math.max(3, this.evoDef.beamWidth || 14)).setAlpha(0.25 + 0.35 * Math.min(1, beam.timeLeft / 200)); }
  _drawBranches(p, angles, range) {
    while (this._branchImgs.length < angles.length) this._branchImgs.push(this.scene.add.image(0, 0, TEX.PARTICLE).setOrigin(0, 0.5).setTint(0xb3e5fc).setBlendMode(Phaser.BlendModes.ADD).setDepth(45).setAlpha(0.4));
    while (this._branchImgs.length > angles.length) { const im = this._branchImgs.pop(); im.destroy(); }
    for (let i = 0; i < angles.length; i++) this._branchImgs[i].setPosition(p.x, p.y).setRotation(angles[i]).setDisplaySize(range * 0.8, Math.max(2, (this.evoDef.beamWidth || 14) * 0.7)).setAlpha(0.3);
  }
  _clear() { if (this._beam && this._beam.img) this._beam.img.destroy(); this._beam = null; for (const im of this._branchImgs) im.destroy(); this._branchImgs = []; }

  // 途中再開でクールダウンのみ維持（照射中の光線は保存せず＝無料再開しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
  destroy() { this._clear(); this._seen.clear(); }
}
