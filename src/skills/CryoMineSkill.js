// 氷結地雷（frost_mage・M7-B）: 敵の進行先/密集地点へ地雷を設置。敵接近で短い警告後に起爆し、氷範囲ダメージ＋高い冷気＋中確率凍結。
// frozen 敵へ命中した場合は粉砕する（同じ地雷で同じ敵を複数回粉砕しない＝1爆発1回）。ボスは通常粉砕せず氷砕ゲージ。
// reactive: recordCast は設置時に1回。地雷ごとの起爆では記録しない。同時地雷数・毎フレーム起爆数に上限。

import { SkillBase } from './SkillBase.js';

export class CryoMineSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.mines = []; }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxCryoMines', 48);
    const want = s.mineCount || 2;
    const spacing = (s.explosionRadius || 40) * 0.7;
    let placed = 0;
    for (let i = 0; i < want; i++) {
      if (this.mines.length >= cap) break;
      // 決定論的なリング配置（RNG不使用）。敵密集方向を優先。
      const dense = this.scene.combat.densestPoint(s.explosionRadius || 40, i);
      const ang = (Math.PI * 2 * i) / want;
      const base = dense || { x: p.x + Math.cos(ang) * (24 + spacing), y: p.y + Math.sin(ang) * (24 + spacing) };
      const jitter = ((i % 3) - 1) * 12;
      const x = base.x + Math.cos(ang) * jitter, y = base.y + Math.sin(ang) * jitter;
      const spr = this.scene.add.image(x, y, 'icon_frost_nova').setDepth(42).setScale(0.5).setAlpha(0.6).setTint(0x80d8ff);
      this.mines.push({
        x, y, triggerRadius: s.triggerRadius || 34, explosionRadius: s.explosionRadius || 40,
        lifetime: s.duration || 5000, warnMs: s.warnMs || 300, warned: false, warnLeft: 0, triggered: false, sprite: spr,
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
      if (m.sprite) m.sprite.setAlpha(0.4 + 0.3 * Math.abs(Math.sin(now * 0.006)));
      if (m.warned) {
        m.warnLeft -= dt;
        if (m.sprite) m.sprite.setTint(0xe1f5fe);
        if (m.warnLeft <= 0) {
          if (!this.scene.combat.frameBudget('cryoMineExpl', 'maxCryoMineExplosionsPerFrame')) continue;
          this._explode(m); this.mines.splice(i, 1);
        }
      } else {
        const e = this.scene.combat.nearestEnemy(m.x, m.y, m.triggerRadius);
        if (e) { m.warned = true; m.warnLeft = m.warnMs; }
        else if (m.lifetime <= 0) {
          if (!this.scene.combat.frameBudget('cryoMineExpl', 'maxCryoMineExplosionsPerFrame')) { m.lifetime = 1; continue; }
          this._explode(m); this.mines.splice(i, 1);
        }
      }
    }
  }

  _explode(m) {
    if (m.triggered) return; m.triggered = true;
    const s = this.stats; const r = m.explosionRadius;
    this.scene.effects.explosion(m.x, m.y, r, 0x9fe8ff);
    const hg = this.scene.nextHitGroupId();
    // 凍結中の敵を先に粉砕（1爆発1体1回・ボス対象外・再帰なし）。
    for (const e of this.scene.combat.enemiesInRadius(m.x, m.y, r)) {
      if (this.scene.combat.isFrozen(e)) this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: s.shatterMultiplier || 1, skillPower: s.damage });
    }
    this.scene.combat.damageArea(m.x, m.y, r, s.damage, this.id, {
      element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: s.baseFreezeChance,
      procCoefficient: this.def?.procCoefficient ?? 0.75, hitGroupId: hg, isExplosion: true, knockback: 16, color: 0x9fe8ff,
    });
    if (m.sprite) { m.sprite.destroy(); m.sprite = null; }
    this.scene.skills.recordExtra(this.id, 'minesTriggered', 1, 'add');
  }

  // 途中再開でクールダウンのみ維持（地雷の位置は保存せず＝再開後に安全再構築・無料設置しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }

  destroy() { for (const m of this.mines) if (m.sprite) m.sprite.destroy(); this.mines = []; }
}
