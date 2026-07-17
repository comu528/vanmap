// 炎月斬（M6-D）: プレイヤー周囲を扇状に薙ぎ払う近接斬撃。飛翔体なし。
// 一振りで同じ敵へ1回命中（sweepごとに命中Set）。通常敵を軽くノックバック（ボスは無効）。
// 演出は短命な三日月画像（tweenで自動破棄）。クールダウンで発動。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class FlameCrescentSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.visuals = new Set(); this._side = 1; this._dead = false; }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats;
    const sweeps = s.sweeps || 1;
    for (let k = 0; k < sweeps; k++) {
      this.scene.time.delayedCall(k * 90, () => {
        if (this._dead || this.scene.gameOver) return;
        this._sweep(s);
      });
    }
  }

  _sweep(s) {
    const p = this.scene.player;
    const radius = s.radius || 46;
    let dir;
    const t = this.scene.combat.nearestEnemy(p.x, p.y, radius + 60);
    if (t) dir = Math.atan2(t.y - p.y, t.x - p.x);
    else { this._side = -this._side; dir = this._side > 0 ? 0 : Math.PI; }
    const half = (s.arc || 1.6) / 2;
    const enemies = this.scene.combat.enemiesInRadius(p.x, p.y, radius);
    const seen = new Set();
    let hit = 0;
    for (const e of enemies) {
      if (!e.alive || seen.has(e)) continue;
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      let d = a - dir;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > half) continue;
      seen.add(e); hit++;
      this.scene.combat.dealDamage(e, s.damage, this.id, { from: { x: p.x, y: p.y }, knockback: e.isBoss ? 0 : (s.knockback || 30) });
    }
    if (hit) this.scene.skills.recordExtra(this.id, 'maxEnemiesHitOneWave', hit, 'max');
    this._spawnArc(p, dir, radius);
  }

  _spawnArc(p, dir, radius) {
    const img = this.scene.add.image(p.x + Math.cos(dir) * radius * 0.5, p.y + Math.sin(dir) * radius * 0.5, TEX.PARTICLE)
      .setTint(0xffab40).setBlendMode(Phaser.BlendModes.ADD).setDepth(47).setRotation(dir)
      .setScale(radius / 6, radius / 12).setAlpha(0.7);
    this.visuals.add(img);
    this.scene.tweens.add({ targets: img, alpha: 0, duration: 200, onComplete: () => { this.visuals.delete(img); img.destroy(); } });
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
  destroy() { this._dead = true; for (const v of this.visuals) if (v) v.destroy(); this.visuals.clear(); }
}
