// 霜輪飛刃（frost_mage・M7-C・common）: 敵密集方向へ氷輪を投げる。往路で直進し、一定距離で折り返してプレイヤーへ戻る。
// 往路と復路は別 hit leg（それぞれ独立の hitSet）で、同じ leg では同一敵へ1回だけ命中。復路は威力が高く、凍結中の敵を粉砕する。
// cooldown・projectile（Job Lv80 発射数対象）。recordCast は投擲開始時に1回（各氷輪/命中/折返しでは記録しない）。runtimeState: cdLeft のみ。

import { SkillBase } from './SkillBase.js';

export class RimeBoomerangSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.blades = []; } // { x, y, dx, dy, traveled, maxTravel, leg, hitSet, gfx, spin }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxRimeBoomerangs', 16);
    const spot = this.scene.combat.densestPoint(120, 0) || this.scene.combat.nearestEnemy(p.x, p.y, 100000) || { x: p.x + 100, y: p.y };
    const baseAng = Math.atan2(spot.y - p.y, spot.x - p.x);
    const spread = this.def?.config?.spreadAngle ?? 0.28;
    // Lv80: 発射数+1。品質別上限で総数をクランプ。複数枚は決定論的な扇状角度。
    const n = Math.min(this.fireProjectileCount(s.projectileCount || 1), Math.max(1, cap - this.blades.length));
    for (let i = 0; i < n; i++) {
      const ang = baseAng + (n > 1 ? (i - (n - 1) / 2) * spread : 0);
      const gfx = this.scene.add.image(p.x, p.y, 'icon_rime_boomerang').setDepth(45).setScale((s.size || 0.8) * (this.visualScale() || 1)).setAlpha(0.9).setTint(0xbde8ff);
      this.blades.push({ x: p.x, y: p.y, dx: Math.cos(ang), dy: Math.sin(ang), traveled: 0, maxTravel: s.range || 160, leg: 'out', hitSet: new Set(), gfx, spin: 0 });
    }
    this.scene.skills.recordExtra(this.id, 'bladesLaunched', n, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（投擲）
    if (!this.blades.length) return;
    const s = this.stats; const p = this.scene.player;
    const step = (s.projectileSpeed || 340) * dt / 1000;
    let hits = 0; const hitCap = this.scene.combat.skillCap('maxRimeBoomerangHitsPerFrame', 48);
    for (let b = this.blades.length - 1; b >= 0; b--) {
      const bl = this.blades[b]; bl.spin += dt * 0.02;
      if (bl.leg === 'out') {
        bl.x += bl.dx * step; bl.y += bl.dy * step; bl.traveled += step;
        if (bl.traveled >= bl.maxTravel) { bl.leg = 'return'; bl.hitSet = new Set(); } // 復路は別 leg（hitSet を分離）
      } else {
        const rx = p.x - bl.x, ry = p.y - bl.y; const d = Math.hypot(rx, ry) || 1;
        bl.x += rx / d * step; bl.y += ry / d * step;
        if (d <= step + 10) { if (bl.gfx) bl.gfx.destroy(); this.blades.splice(b, 1); continue; } // 帰還で消滅
      }
      if (bl.gfx) bl.gfx.setPosition(bl.x, bl.y).setRotation(bl.spin);
      const isReturn = bl.leg === 'return';
      const proc = isReturn ? (this.def?.config?.returnProc ?? 0.50) : (this.def?.procCoefficient ?? 0.38);
      const dmgMul = isReturn ? (s.returnDamageMult || 1.2) : 1;
      const hg = this.scene.nextHitGroupId();
      for (const e of this.scene.combat.enemiesInRadius(bl.x, bl.y, 14)) {
        if (!e.alive || bl.hitSet.has(e)) continue;
        if (hits >= hitCap) { if (this.scene._m) this.scene._m.suppressed++; break; }
        hits++; bl.hitSet.add(e);
        const wasFrozen = this.scene.combat.isFrozen(e);
        // 復路のみ粉砕（ボスは氷砕ゲージへ・1対象1回・再帰なし）。
        if (isReturn && wasFrozen) this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: this.def?.config?.shatterMultiplier || 1.3, skillPower: s.damage * dmgMul });
        this.scene.combat.dealDamage(e, s.damage * dmgMul, this.id, {
          element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: 0,
          procCoefficient: proc, hitGroupId: hg, quiet: true, color: 0xbde8ff,
        });
        this.scene.skills.recordExtra(this.id, isReturn ? 'returnHits' : 'outboundHits', 1, 'add');
        if (isReturn && wasFrozen) this.scene.skills.recordExtra(this.id, 'returnShatters', 1, 'add');
      }
    }
  }

  // 残響/複製（standard 既定）: fire() を再実行（追加の氷輪を投擲・上限で保護）。

  // 途中再開でクールダウンのみ維持（飛行中の氷輪は保存せず＝無料再発動しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { for (const b of this.blades) if (b.gfx) b.gfx.destroy(); this.blades = []; }
}
