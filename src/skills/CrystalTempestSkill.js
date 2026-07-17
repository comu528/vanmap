// 天晶氷嵐（icicle_volley の進化・M7-B）: 敵密集地点を複数選び、時間差で大量の氷晶を発射する。一部は最寄り敵を追尾（homing）。
// chilled 敵を優先し、frozen 敵へ追加ダメージ。1発ごとの procCoefficient は低め。粉砕はしない（凍結ボーナスのみ）。
// projectileCount・freeze check 数・弾数に品質別上限。進化のため Job Lv80 発射数対象外（fireProjectileCount を呼ばない）。残響/分身は非再帰。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class CrystalTempestSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._waves = []; }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()（波を予約）
    if (!this._waves.length) return;
    const now = this.scene.time.now;
    for (let i = this._waves.length - 1; i >= 0; i--) {
      if (now >= this._waves[i].at) { const w = this._waves.splice(i, 1)[0]; this._emit(w.count); }
    }
  }

  fire() {
    const pc = this.evoDef.projectileCount || {};
    const waves = Math.min(pc.waves || 3, this.cap('maxWaves', 3));
    const delay = pc.waveDelayMs || 100;
    const now = this.scene.time.now;
    for (let w = 0; w < waves; w++) this._waves.push({ at: now + w * delay, count: pc.perWaveMax || pc.base || 7 });
  }

  _emit(count) {
    const projCap = this.scene.combat.skillCap('maxCrystalTempestProjectiles', 90);
    const live = this.scene.countProjBySkill(this.id);
    const n = Math.max(0, Math.min(count, this.cap('maxProjectilesPerCast', 28), projCap - live));
    if (n <= 0) { if (this.scene._m) this.scene._m.suppressed++; return; }
    const p = this.scene.player;
    const pc = this.evoDef.projectileCount || {};
    const dmg = this.evoDef.damage || {};
    // chilled 敵を優先して密集地点を選ぶ。
    const spot = this.scene.combat.densestPoint(120, 0) || this.scene.combat.nearestEnemy(p.x, p.y, 100000) || { x: p.x, y: p.y - 100 };
    const baseAng = Math.atan2(spot.y - p.y, spot.x - p.x);
    const hg = this.scene.nextHitGroupId();
    const homingN = Math.floor(n * (pc.homingFraction || 0));
    for (let i = 0; i < n; i++) {
      const ang = baseAng + (i - (n - 1) / 2) * 0.14;
      const homing = i < homingN;
      const t = homing ? this.scene.combat.nearestEnemy(p.x, p.y, 100000) : null;
      this.scene.combat.spawnPlayerProjectile(p.x, p.y, ang, 330, {
        skillId: this.id, element: 'ice', damage: dmg.base || 22, pierce: 0,
        chillAmount: (this.evoDef.chill || {}).amount || 9, baseFreezeChance: (this.evoDef.freeze || {}).baseChance || 0.05,
        procCoefficient: this.evoDef.procCoefficient ?? 0.28, hitGroupId: hg, frozenBonus: dmg.frozenBonus || 0.45,
        homingRate: homing ? 0.006 : 0, homingTarget: t, homingSpeed: 330,
        scale: 0.85, lifeMs: 1400, tint: 0xbde8ff,
      });
    }
  }

  // 途中再開でクールダウンのみ維持（予約中の波・弾は保存せず＝二重生成しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
  destroy() { this._waves = []; }
}
