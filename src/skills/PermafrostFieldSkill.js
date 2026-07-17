// 永久凍土（frost_mage）: 敵密集地点かプレイヤー周辺へ凍土領域を設置。領域内の敵へ低威力DoT＋少量の冷気、
// 通常の冷気減速に加えて軽い領域減速を与える。多段のため procCoefficient は低い（永久凍結を防ぐ）。凍土自体は粉砕を発生させない。
// 同時存在数（simultaneousFields / maxPermafrostFields）と tick 数（maxPermafrostTicksPerFrame）に品質別上限を設ける。

import { SkillBase } from './SkillBase.js';

export class PermafrostFieldSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.fields = []; // { x, y, until, tickAt, radius, gfx, hitGroupId }
  }

  fire(ctx) {
    const s = this.stats;
    const cap = Math.min(s.simultaneousFields || 1, this.scene.combat.skillCap('maxPermafrostFields', 4));
    // 上限に達していれば最古を破棄して置き換える（無制限に増やさない）。
    while (this.fields.length >= cap) this._removeField(0);
    const spot = this.scene.combat.densestPoint(s.radius, 0) || { x: this.scene.player.x, y: this.scene.player.y };
    const gfx = this.scene.add.circle(spot.x, spot.y, s.radius, 0x4fc3f7, 0.13).setDepth(6);
    gfx.setStrokeStyle(1, 0x9fe8ff, 0.4);
    this.fields.push({ x: spot.x, y: spot.y, until: this.scene.time.now + s.duration, tickAt: 0, radius: s.radius, gfx, hitGroupId: this.scene.nextHitGroupId() });
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()
    const now = this.scene.time.now;
    const s = this.stats;
    let ticks = 0;
    const tickCap = this.scene.combat.skillCap('maxPermafrostTicksPerFrame', 8);
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      if (now >= f.until) { this._removeField(i); continue; }
      if (now < f.tickAt) continue;
      if (ticks >= tickCap) { if (this.scene._m) this.scene._m.suppressed++; continue; } // 毎フレームtick上限
      ticks++;
      f.tickAt = now + (s.tickRate || 500);
      const proc = this.def?.config?.procCoefficient ?? this.def?.procCoefficient ?? 0.18;
      // 領域内の敵へ低威力DoT＋冷気＋軽い領域減速（既存 applySlow を再利用・冷気減速と乗算）。
      this.scene.combat.forEachEnemyInRadius(f.x, f.y, f.radius, (e) => {
        if (e.applySlow) e.applySlow(s.fieldSlow || 0.1, (s.tickRate || 500) + 120);
        this.scene.combat.dealDamage(e, s.damage, this.id, {
          element: 'ice', isDoT: true, tag: 'dot', quiet: true, color: 0x9fe8ff,
          chillAmount: s.chillPerTick, baseFreezeChance: 0, procCoefficient: proc, hitGroupId: f.hitGroupId,
        });
      });
    }
  }

  // 残響/複製（custom）: 追加の凍土tickを1回ぶん（周囲へDoT＋冷気）。凍土そのものは多重生成しない。
  echoCast() {
    const s = this.stats; const p = this.scene.player;
    this.scene.combat.damageArea(p.x, p.y, s.radius, s.damage, this.id, {
      element: 'ice', isDoT: true, tag: 'dot', quiet: true, color: 0x9fe8ff,
      chillAmount: s.chillPerTick, procCoefficient: this.def?.procCoefficient ?? 0.18, hitGroupId: this.scene.nextHitGroupId(),
    });
  }
  cloneCast() { this.echoCast(); }

  _removeField(i) { const f = this.fields[i]; if (f && f.gfx) f.gfx.destroy(); this.fields.splice(i, 1); }
  destroy() { for (const f of this.fields) if (f.gfx) f.gfx.destroy(); this.fields = []; }
}
