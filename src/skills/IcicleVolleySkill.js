// 氷柱斉射（frost_mage・M7-B）: 最寄り/密集方向へ細い氷柱を短い間隔で連射する。1回の主発動で複数弾を時間差発射。
// projectile（Job Lv80 発射数+1 対象）。冷気/凍結判定は弾の命中時に共通経路（StatusEffectManager）で処理する。
// 連射開始時に recordCast を1回だけ行い、各弾・各命中では記録しない（残響カウンタを乱発しない）。

import { SkillBase } from './SkillBase.js';

export class IcicleVolleySkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._queue = []; // { at, ang } 予約された各氷柱（位置は保存しない・再開後は消費済み）
  }

  fire(ctx) {
    const s = this.stats;
    const p = this.scene.player;
    const target = this.scene.combat.nearestEnemy(p.x, p.y, p.cfg.attackRange + 40);
    if (!target) return;
    const baseAng = Math.atan2(target.y - p.y, target.x - p.x);
    // Lv80: 発射数+1。品質別上限（1斉射あたりの弾数）でクランプ。
    const capN = this.scene.combat.skillCap('maxIcicleVolleyProjectiles', 84);
    const count = Math.min(this.fireProjectileCount(s.projectileCount || 3), capN);
    const spread = s.spreadAngle || 0.45;
    const interval = s.burstIntervalMs || 60;
    const now = this.scene.time.now;
    for (let i = 0; i < count; i++) {
      // 狭い扇状に等間隔（決定論的・RNG不使用）。
      const offset = count > 1 ? (i - (count - 1) / 2) * (spread / (count - 1)) : 0;
      this._queue.push({ at: now + i * interval, ang: baseAng + offset });
    }
    this.scene.skills.recordExtra(this.id, 'volleys', 1, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（斉射を予約）
    if (!this._queue.length) return;
    const s = this.stats;
    const now = this.scene.time.now;
    let bursts = 0;
    const burstCap = this.scene.combat.skillCap('maxIcicleVolleyBurstsPerFrame', 8);
    // 予約された氷柱のうち発射時刻に達したものを発射（最寄り敵方向へ再照準しない＝決定論的）。
    for (let i = this._queue.length - 1; i >= 0; i--) {
      const q = this._queue[i];
      if (now < q.at) continue;
      if (bursts >= burstCap) { if (this.scene._m) this.scene._m.suppressed++; continue; }
      bursts++;
      this._queue.splice(i, 1);
      this.scene.combat.spawnPlayerProjectile(this.scene.player.x, this.scene.player.y, q.ang, s.projectileSpeed || 340, {
        skillId: this.id, element: 'ice', damage: s.damage, pierce: s.pierce || 0,
        chillAmount: s.chillAmount, baseFreezeChance: s.baseFreezeChance,
        procCoefficient: this.def?.procCoefficient ?? 0.38, hitGroupId: this.scene.nextHitGroupId(),
        scale: (this.visualScale() || 1) * 0.85, lifeMs: 1300, tint: 0xbde8ff,
      });
      this.scene.skills.recordExtra(this.id, 'iciclesFired', 1, 'add');
    }
  }

  // 途中再開でクールダウンのみ維持（予約中の氷柱は保存せず＝消費済み扱い・無料再発動しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }

  destroy() { this._queue = []; }
}
