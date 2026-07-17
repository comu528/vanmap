// 灼熱光線（M6-D）: 最寄りの敵へ継続する炎の光線を照射。照射中もゆるやかに追従し、
// 対象死亡時は別の敵へ照準を移す。光線上の敵へ一定間隔でダメージ（DoT扱い）。
// 光線はビームごとに1枚の画像を使い回し（毎フレーム再生成しない）。同時本数と毎フレームtick数に上限。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class ScorchingRaySkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.beams = []; this._tickSet = new Set(); }
  canFire(ctx) { return ctx.hasEnemies; } // 敵がいるときだけ新規ビームを開始

  fire() {
    const s = this.stats; const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxActiveBeams', 5);
    const want = s.beams || 1;
    for (let b = 0; b < want; b++) {
      if (this.beams.length >= cap) break;
      const t = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
      if (!t) break;
      const base = Math.atan2(t.y - p.y, t.x - p.x);
      const angle = base + (b === 0 ? 0 : 0.35); // Lv>=5 の2本目は少し角度をずらす
      const img = this.scene.add.image(0, 0, TEX.PARTICLE).setOrigin(0, 0.5)
        .setTint(0xff7043).setBlendMode(Phaser.BlendModes.ADD).setDepth(46).setAlpha(0.5);
      this.beams.push({ target: t, angle, timeLeft: s.duration || 1400, tickLeft: 0, img });
    }
    this.scene.skills.recordExtra(this.id, 'maxConcurrentBeams', this.beams.length, 'max');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（新規ビーム開始）を駆動
    if (!this.beams.length) return;
    const s = this.stats; const p = this.scene.player;
    const range = (p.cfg && p.cfg.attackRange) ? p.cfg.attackRange : 220;
    const step = (s.followSpeed || 2.2) * dt / 1000; // 追従角速度（rad/秒相当）
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const beam = this.beams[i];
      beam.timeLeft -= dt;
      if (!beam.target || !beam.target.alive) beam.target = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
      if (beam.target && beam.target.alive) {
        const desired = Math.atan2(beam.target.y - p.y, beam.target.x - p.x);
        beam.angle = this._rotToward(beam.angle, desired, step);
      }
      beam.tickLeft -= dt;
      if (beam.tickLeft <= 0 && beam.timeLeft > 0) { beam.tickLeft = s.tickRate || 180; this._beamTick(p, beam, range, s); }
      this._draw(p, beam, range, s);
      if (beam.timeLeft <= 0) { if (beam.img) beam.img.destroy(); this.beams.splice(i, 1); }
    }
    this.scene.skills.recordExtra(this.id, 'totalBeamSeconds', dt / 1000, 'add');
  }

  _rotToward(a, b, step) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= step) return b;
    return a + Math.sign(d) * step;
  }

  _beamTick(p, beam, range, s) {
    const halfW = (s.width || 10) / 2 + 6; // 敵半径ぶんの余裕
    const dx = Math.cos(beam.angle), dy = Math.sin(beam.angle);
    const cand = this.scene.combat.enemiesInRadius(p.x, p.y, range + halfW);
    const seen = this._tickSet; seen.clear();
    let hit = 0;
    for (const e of cand) {
      if (!e.alive || seen.has(e)) continue;
      const rx = e.x - p.x, ry = e.y - p.y;
      const proj = rx * dx + ry * dy;           // 線分方向の投影（前方判定）
      if (proj < 0 || proj > range) continue;
      const perp = Math.abs(-rx * dy + ry * dx); // 線分への垂直距離
      if (perp > halfW) continue;
      if (!this.scene.combat.frameBudget('beamTick', 'maxBeamTicksPerFrame')) break;
      seen.add(e); hit++;
      this.scene.combat.dealDamage(e, s.damage, this.id, { color: 0xff7043, tag: 'dot' });
    }
    if (hit) this.scene.skills.recordExtra(this.id, 'maxEnemiesHitInOneTick', hit, 'max');
  }

  _draw(p, beam, range, s) {
    const img = beam.img; if (!img) return;
    img.setPosition(p.x, p.y);
    img.setRotation(beam.angle);
    img.setDisplaySize(range, Math.max(3, s.width || 10));
    const fade = Math.min(1, beam.timeLeft / 200);
    img.setAlpha(0.25 + 0.4 * fade);
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
  destroy() { for (const b of this.beams) if (b.img) b.img.destroy(); this.beams = []; }
}
