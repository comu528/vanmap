// 極星氷弾（frost_mage・M7-C・rare）: 敵密集地点へ大型の氷星をゆっくり発射する。移動中は周囲へ低ダメージ・低冷気の pulse を放ち、
// 敵か射程終端で爆発（大ダメージ・冷気・凍結中の敵を粉砕）し、決定論的な角度へ小型氷片を射出する。星本体と爆発は別 hitGroup。
// cooldown・projectile（Job Lv80 発射数対象＝大型星の追加数）。recordCast は星発射時に1回。runtimeState: cdLeft のみ（飛行中の星は保存しない）。

import { SkillBase } from './SkillBase.js';

export class PolarStarSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.stars = []; } // { x, y, dx, dy, traveled, maxTravel, pulseLeft, gfx }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxPolarStars', 4);
    const spot = this.scene.combat.densestPoint(s.radius || 70, 0) || this.scene.combat.nearestEnemy(p.x, p.y, 100000) || { x: p.x, y: p.y - 100 };
    const baseAng = Math.atan2(spot.y - p.y, spot.x - p.x);
    // Lv80: 大型星の追加数。決定論的な角度差で射出。
    const n = Math.min(this.fireProjectileCount(1), Math.max(1, cap - this.stars.length));
    for (let i = 0; i < n; i++) {
      const ang = baseAng + (n > 1 ? (i - (n - 1) / 2) * 0.32 : 0);
      const gfx = this.scene.add.circle(p.x, p.y, 10, 0x9fe8ff, 0.85).setDepth(45).setStrokeStyle(2, 0xe1f5fe, 0.8);
      this.stars.push({ x: p.x, y: p.y, dx: Math.cos(ang), dy: Math.sin(ang), traveled: 0, maxTravel: (p.cfg?.attackRange || 220) + 120, pulseLeft: 0, gfx });
    }
    this.scene.skills.recordExtra(this.id, 'starsLaunched', n, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（星発射）
    if (!this.stars.length) return;
    const s = this.stats;
    const step = (s.speed || 110) * dt / 1000;
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const st = this.stars[i];
      st.x += st.dx * step; st.y += st.dy * step; st.traveled += step; st.pulseLeft -= dt;
      if (st.gfx) st.gfx.setPosition(st.x, st.y);
      if (st.pulseLeft <= 0) {
        st.pulseLeft = s.pulseInterval || 200;
        // 移動中の pulse（粉砕しない・低 proc）。
        this.scene.combat.damageArea(st.x, st.y, (s.radius || 70) * 0.5, s.pulseDamage, this.id, {
          element: 'ice', tag: 'dot', chillAmount: (s.chillAmount || 0) * 0.3, procCoefficient: this.def?.config?.pulseProc ?? 0.12,
          hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x80d8ff,
        });
        this.scene.skills.recordExtra(this.id, 'pulseHits', 1, 'add');
      }
      const hit = this.scene.combat.nearestEnemy(st.x, st.y, (s.radius || 70) * 0.4);
      if (hit || st.traveled >= st.maxTravel) { this._burst(st.x, st.y, s); if (st.gfx) st.gfx.destroy(); this.stars.splice(i, 1); }
    }
  }

  _burst(x, y, s) {
    this.scene.effects.explosion(x, y, s.radius || 70, 0x9fe8ff);
    const hg = this.scene.nextHitGroupId();
    // 爆発は凍結中の敵を粉砕（ボスは氷砕ゲージ・1対象1回・再帰なし）。
    for (const e of this.scene.combat.enemiesInRadius(x, y, s.radius || 70)) {
      if (this.scene.combat.isFrozen(e)) this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: this.def?.config?.shatterMultiplier || 1.5, skillPower: s.burstDamage });
    }
    this.scene.combat.damageArea(x, y, s.radius || 70, s.burstDamage, this.id, {
      element: 'ice', chillAmount: s.burstChill, baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.70,
      hitGroupId: hg, isExplosion: true, color: 0x9fe8ff,
    });
    // 小型氷片: 決定論的な角度（通常の ice hit・粉砕しない）。
    const nShards = Math.min(s.shardCount || 6, this.scene.combat.skillCap('maxPolarStarShards', 20));
    const hg2 = this.scene.nextHitGroupId();
    for (let i = 0; i < nShards; i++) {
      const a = (Math.PI * 2 * i) / nShards;
      this.scene.combat.spawnPlayerProjectile(x, y, a, 300, {
        skillId: this.id, element: 'ice', damage: s.pulseDamage * 2, pierce: 0,
        chillAmount: (s.chillAmount || 0) * 0.2, baseFreezeChance: 0, procCoefficient: this.def?.config?.shardProc ?? 0.30,
        hitGroupId: hg2, scale: 0.5, lifeMs: 700, tint: 0xbde8ff,
      });
    }
    this.scene.skills.recordExtra(this.id, 'burstHits', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'shardsSpawned', nShards, 'add');
  }

  // 残響/複製（standard 既定）: fire() を再実行（追加の大型星を発射・上限で保護）。

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { for (const st of this.stars) if (st.gfx) st.gfx.destroy(); this.stars = []; }
}
