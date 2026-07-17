// 雪崩奔流（frost_mage・M7-B）: プレイヤー前方（密集方向）から幅広い雪崩を流す。接触した敵へ氷ダメージと冷気、通常敵をわずかに押し流す。
// エリートは軽減、ボスは移動させない。frozen 敵を粉砕（同じ波が同じ敵を複数回粉砕しない＝hitSet）。波は地形として残らない。
// periodic: recordCast は雪崩生成時に1回。接触ごとには記録しない。同時波数・毎フレーム接触数に上限。

import { SkillBase } from './SkillBase.js';

export class AvalancheSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.waves = []; } // { x, y, dx, dy, traveled, maxTravel, hitSet, gfx }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxAvalancheWaves', 4);
    const spot = this.scene.combat.densestPoint(120, 0) || this.scene.combat.nearestEnemy(p.x, p.y, 100000) || { x: p.x + 100, y: p.y };
    const baseAng = Math.atan2(spot.y - p.y, spot.x - p.x);
    const n = Math.min(s.waveCount || 1, Math.max(1, cap - this.waves.length));
    for (let i = 0; i < n; i++) {
      // 複数波は角度を決定論的に少しずらす。
      const ang = baseAng + (i - (n - 1) / 2) * 0.22;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      // 波はプレイヤーの少し後方から前方へ流れる。
      const sx = p.x - dx * 30, sy = p.y - dy * 30;
      const gfx = this.scene.add.rectangle(sx, sy, 14, s.waveWidth || 90, 0xb3e5fc, 0.35).setDepth(7).setRotation(ang);
      gfx.setStrokeStyle(1, 0xe1f5fe, 0.6);
      this.waves.push({ x: sx, y: sy, dx, dy, traveled: 0, maxTravel: (s.waveSpeed || 200) * (s.duration || 1500) / 1000, hitSet: new Set(), gfx });
    }
    this.scene.skills.recordExtra(this.id, 'wavesCreated', n, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    if (!this.waves.length) return;
    const s = this.stats;
    let contacts = 0;
    const contactCap = this.scene.combat.skillCap('maxAvalancheHitsPerFrame', 60);
    const halfW = (s.waveWidth || 90) / 2 + 8;
    const step = (s.waveSpeed || 200) * dt / 1000;
    for (let w = this.waves.length - 1; w >= 0; w--) {
      const wave = this.waves[w];
      wave.x += wave.dx * step; wave.y += wave.dy * step; wave.traveled += step;
      if (wave.gfx) wave.gfx.setPosition(wave.x, wave.y);
      const hg = this.scene.nextHitGroupId();
      // 波前面の帯（進行方向厚み ~ step+18・垂直 halfW）内の敵へ接触判定。
      for (const e of this.scene.combat.enemiesInRadius(wave.x, wave.y, halfW + 20)) {
        if (!e.alive || wave.hitSet.has(e)) continue;
        if (contacts >= contactCap) { if (this.scene._m) this.scene._m.suppressed++; break; }
        const rx = e.x - wave.x, ry = e.y - wave.y;
        const along = rx * wave.dx + ry * wave.dy;
        if (along < -18 || along > step + 20) continue;
        const perp = Math.abs(-rx * wave.dy + ry * wave.dx);
        if (perp > halfW) continue;
        contacts++; wave.hitSet.add(e);
        // 凍結中なら粉砕（1波1体1回）。
        if (this.scene.combat.isFrozen(e)) this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: s.shatterMultiplier || 1, skillPower: s.damage });
        let dmg = s.damage;
        if (this.scene.combat.isFrozen(e)) dmg *= (1 + (s.frozenBonus || 0));
        // 通常敵は押し流す・エリートは軽減・ボスは移動させない。
        let kb = s.knockback || 40;
        if (e.isBoss) kb = 0; else if (e.isElite) kb *= 0.4;
        this.scene.combat.dealDamage(e, dmg, this.id, {
          element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.55,
          hitGroupId: hg, knockback: kb, from: { x: wave.x - wave.dx * 20, y: wave.y - wave.dy * 20 }, quiet: true, color: 0x9fe8ff,
        });
        this.scene.skills.recordExtra(this.id, 'enemiesPushed', 1, 'add');
      }
      if (wave.traveled >= wave.maxTravel) { if (wave.gfx) wave.gfx.destroy(); this.waves.splice(w, 1); }
    }
  }

  // 残響/複製（custom は使わず standard 既定）: fire() を再実行（追加の雪崩を1本流す・上限で保護）。

  // 途中再開でクールダウンのみ維持（波の位置は保存せず＝地形として残さない・無料再発動しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }

  destroy() { for (const wv of this.waves) if (wv.gfx) wv.gfx.destroy(); this.waves = []; }
}
