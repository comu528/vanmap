// 氷晶屈折（frost_mage・M7-C・rare）: 氷晶弾を発射し、命中するたびに近傍の未命中の敵へ新しい角度で屈折する。
// 同一 cast で同じ敵へ再命中しない（visited）。chain と異なり projectile の移動と見た目を持つ。最大屈折回数で消滅し、候補が無ければ短距離進んで消える。
// 最終屈折のみ凍結中の敵を粉砕する。cooldown。recordCast は最初の弾発射時に1回（各屈折/命中では記録しない）。runtimeState: cdLeft のみ。

import { SkillBase } from './SkillBase.js';

export class CrystalRefractionSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.shards = []; } // { x, y, dx, dy, refractLeft, visited, damage, gfx, dieIn }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxRefractionProjectiles', 40);
    if (this.shards.length >= cap) { if (this.scene._m) this.scene._m.suppressed++; return; }
    const t = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
    const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : 0;
    const gfx = this.scene.add.image(p.x, p.y, 'icon_crystal_refraction').setDepth(45).setScale((s.size || 0.9) * (this.visualScale() || 1)).setAlpha(0.9).setTint(0xbde8ff);
    this.shards.push({ x: p.x, y: p.y, dx: Math.cos(ang), dy: Math.sin(ang), refractLeft: s.refractionCount || 3, visited: new Set(), damage: s.damage, gfx, dieIn: 900, spin: 0 });
    this.scene.skills.recordExtra(this.id, 'projectilesLaunched', 1, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（弾発射）
    if (!this.shards.length) return;
    const s = this.stats;
    const step = (s.speed || 320) * dt / 1000;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i]; sh.spin += dt * 0.02; sh.dieIn -= dt;
      sh.x += sh.dx * step; sh.y += sh.dy * step;
      if (sh.gfx) sh.gfx.setPosition(sh.x, sh.y).setRotation(sh.spin);
      // 近傍の未命中の敵へ命中判定。
      const e = this._hitTarget(sh);
      if (e) {
        sh.visited.add(e);
        const isFinal = sh.refractLeft <= 1;
        const wasFrozen = this.scene.combat.isFrozen(e);
        if (isFinal && wasFrozen) this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: this.def?.config?.shatterMultiplier || 1.4, skillPower: sh.damage });
        this.scene.combat.dealDamage(e, sh.damage, this.id, {
          element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.38,
          hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0xbde8ff,
        });
        sh.damage *= (s.damageRamp || 1.0);
        sh.refractLeft--;
        if (sh.refractLeft <= 0) { this._retire(i); continue; }
        // 屈折: 近傍の未命中の敵へ新しい角度（無ければ現方向を維持して短距離で消滅）。
        const next = this._nextTarget(sh, s.seekRange || 120);
        if (next) { const a = Math.atan2(next.y - sh.y, next.x - sh.x); sh.dx = Math.cos(a); sh.dy = Math.sin(a); this.scene.skills.recordExtra(this.id, 'refractions', 1, 'add'); }
        else { sh.dieIn = Math.min(sh.dieIn, 240); }
      }
      if (sh.dieIn <= 0) this._retire(i);
    }
    this.scene.skills.recordExtra(this.id, 'uniqueTargets', this.shards.reduce((m, s2) => Math.max(m, s2.visited.size), 0), 'max');
  }

  _hitTarget(sh) {
    for (const e of this.scene.combat.enemiesInRadius(sh.x, sh.y, 14)) { if (e.alive && !sh.visited.has(e)) return e; }
    return null;
  }
  // 未命中の最寄り敵を決定論的に選ぶ（同点は _seq→x→y）。
  _nextTarget(sh, range) {
    const cand = [];
    for (const e of this.scene.combat.enemiesInRadius(sh.x, sh.y, range)) { if (e.alive && !sh.visited.has(e)) cand.push(e); }
    cand.sort((a, b) => ((a.x - sh.x) ** 2 + (a.y - sh.y) ** 2) - ((b.x - sh.x) ** 2 + (b.y - sh.y) ** 2) || (a._seq ?? 0) - (b._seq ?? 0) || a.x - b.x || a.y - b.y);
    return cand.length ? cand[0] : null;
  }
  _retire(i) { const sh = this.shards[i]; if (sh && sh.gfx) sh.gfx.destroy(); this.shards.splice(i, 1); }

  // 残響/複製（standard 既定）: fire() を再実行（追加の氷晶弾・屈折履歴は共有しない・再帰なし）。

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { for (const sh of this.shards) if (sh.gfx) sh.gfx.destroy(); this.shards = []; }
}
