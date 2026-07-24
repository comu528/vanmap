// 砕氷衝波（frost_mage・M7-C・common）: 敵密集方向へ扇状の氷衝波を放つ。非凍結の敵へダメージと冷気を与えて通常敵を押し出し
//（エリートは軽減・ボスは押さない）、凍結中の敵を1回だけ粉砕する。当たり判定は SpatialGrid 候補から扇形判定。画面外までは伸びない。
// cooldown。recordCast は衝波開始時に1回（各命中/粉砕では記録しない）。runtimeState: cdLeft のみ（一瞬の衝波位置は保存しない）。

import { SkillBase } from './SkillBase.js';

export class IcebreakerWaveSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._cones = []; } // 短命の扇形表示
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const p = this.scene.player;
    const range = s.range || 120;
    const spot = this.scene.combat.densestPoint(range, 0) || this.scene.combat.nearestEnemy(p.x, p.y, 100000) || { x: p.x + 100, y: p.y };
    const baseAng = Math.atan2(spot.y - p.y, spot.x - p.x);
    const halfAngle = (s.angle || 1.2) / 2;
    this._drawCone(p.x, p.y, baseAng, halfAngle, range);
    const hg = this.scene.nextHitGroupId();
    let hits = 0; const cap = this.scene.combat.skillCap('maxIcebreakerHitsPerFrame', 60);
    for (const e of this.scene.combat.enemiesInRadius(p.x, p.y, range)) {
      if (!e.alive) continue;
      if (hits >= cap) { if (this.scene._m) this.scene._m.suppressed++; break; }
      let da = Math.atan2(e.y - p.y, e.x - p.x) - baseAng;
      while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > halfAngle) continue;
      hits++;
      const wasFrozen = this.scene.combat.isFrozen(e);
      if (wasFrozen) { this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: s.shatterDamageMult || 1.5, skillPower: s.damage }); this.scene.skills.recordExtra(this.id, 'shatters', 1, 'add'); }
      let kb = s.pushForce || 50;
      if (e.isBoss) kb = 0; else if (e.isElite) kb *= (s.elitePushMult || 0.4);
      this.scene.combat.dealDamage(e, s.damage, this.id, {
        element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.60,
        hitGroupId: hg, knockback: kb, from: { x: p.x, y: p.y }, quiet: true, color: 0x9fe8ff,
      });
      if (!e.isBoss && kb > 0) this.scene.skills.recordExtra(this.id, 'enemiesPushed', 1, 'add');
    }
    this.scene.skills.recordExtra(this.id, 'wavesCast', 1, 'add');
  }

  _drawCone(x, y, ang, half, range) {
    if (this._cones.length >= this.scene.combat.skillCap('maxIcebreakerEffects', 6)) return;
    const g = this.scene.add.graphics().setDepth(7);
    g.fillStyle(0xb3e5fc, 0.28); g.slice(x, y, range, ang - half, ang + half, false); g.fillPath();
    this._cones.push({ gfx: g, life: 180, max: 180 });
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（衝波）
    for (let i = this._cones.length - 1; i >= 0; i--) {
      const c = this._cones[i]; c.life -= dt;
      if (c.gfx) c.gfx.setAlpha(Math.max(0, c.life / c.max));
      if (c.life <= 0) { if (c.gfx) c.gfx.destroy(); this._cones.splice(i, 1); }
    }
  }

  // 残響/複製（standard 既定）: fire() を再実行（追加の衝波・再帰なし）。

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { for (const c of this._cones) if (c.gfx) c.gfx.destroy(); this._cones = []; }
}
