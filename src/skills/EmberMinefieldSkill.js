// 火種地雷（M6-D）: プレイヤー周辺へ火種地雷を設置。敵が接近すると短い警告後に起爆し、
// 反応が無ければ寿命で自動起爆。地雷は1つにつき一度だけ起爆。スプライトは配列で使い回す。
// 同時設置数（skillCap）と毎フレーム起爆数（frameBudget）に上限。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class EmberMinefieldSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.mines = []; }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxMines', 40);
    const want = s.mineCount || 2;
    const spacing = (s.explosionRadius || 38) * 0.6; // 重ならない最小間隔の目安
    let placed = 0;
    for (let i = 0; i < want; i++) {
      if (this.mines.length >= cap) break;
      const ang = (Math.PI * 2 * i) / want + this.scene.rng() * 0.6;
      const dist = 24 + spacing + this.scene.rng() * 26;
      const x = p.x + Math.cos(ang) * dist, y = p.y + Math.sin(ang) * dist;
      const sprite = this.scene.add.image(x, y, TEX.PARTICLE).setTint(0xff7043)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(42).setScale(0.5).setAlpha(0.55);
      this.mines.push({
        x, y, senseRadius: s.senseRadius || 34, explosionRadius: s.explosionRadius || 38,
        damage: s.damage, lifetime: s.lifetime || 5000, warnMs: s.warnMs || 360,
        warned: false, warnLeft: 0, triggered: false, sprite,
      });
      placed++;
    }
    if (placed) this.scene.skills.recordExtra(this.id, 'minesPlaced', placed, 'add');
    this.scene.skills.recordExtra(this.id, 'highestConcurrentObjects', this.mines.length, 'max');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    const now = this.scene.time.now;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.lifetime -= dt;
      if (m.sprite) m.sprite.setAlpha(0.35 + 0.3 * Math.abs(Math.sin(now * 0.006)));
      if (m.warned) {
        m.warnLeft -= dt;
        if (m.sprite) m.sprite.setTint(0xffee58);
        if (m.warnLeft <= 0) {
          if (!this.scene.combat.frameBudget('mineExpl', 'maxMineExplosionsPerFrame')) continue; // 今フレームは繰り越し
          this._explode(m);
          this.scene.skills.recordExtra(this.id, 'triggeredMines', 1, 'add');
          this.mines.splice(i, 1);
        }
      } else {
        const e = this.scene.combat.nearestEnemy(m.x, m.y, m.senseRadius);
        if (e) { m.warned = true; m.warnLeft = m.warnMs; }
        else if (m.lifetime <= 0) {
          if (!this.scene.combat.frameBudget('mineExpl', 'maxMineExplosionsPerFrame')) { m.lifetime = 1; continue; }
          this._explode(m);
          this.scene.skills.recordExtra(this.id, 'expiredMines', 1, 'add');
          this.mines.splice(i, 1);
        }
      }
    }
  }

  _explode(m) {
    if (m.triggered) return; m.triggered = true;
    const r = m.explosionRadius;
    this.scene.effects.explosion(m.x, m.y, r, 0xff7043);
    this.scene.combat.damageArea(m.x, m.y, r, m.damage, this.id, { from: { x: m.x, y: m.y }, knockback: 30, isExplosion: true });
    if (m.sprite) { m.sprite.destroy(); m.sprite = null; }
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
  destroy() { for (const m of this.mines) if (m.sprite) m.sprite.destroy(); this.mines = []; }
}
