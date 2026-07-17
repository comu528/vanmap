// ダイヤモンドブリザード（frost_shard の進化）: 大量の氷晶弾を時間差で連射。敵密集地点を優先。
// 1発ごとの procCoefficient を低くして冷気蓄積と凍結を狙う。凍結中の敵へは追加ダメージ。
// projectileCount・同時弾数・凍結判定数に品質別上限。進化のため Job Lv80 発射数補正の対象外（fireProjectileCount を呼ばない）。
// 残響・分身で再帰しない（castContext ガード＋標準ポリシー）。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class DiamondBlizzardSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._waves = []; // { at, count }
  }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()（波を予約）
    if (!this._waves.length) return;
    const now = this.scene.time.now;
    for (let i = this._waves.length - 1; i >= 0; i--) {
      if (now >= this._waves[i].at) { const w = this._waves.splice(i, 1)[0]; this._emitWave(w.count); }
    }
  }

  fire(ctx) {
    const pc = this.evoDef.projectileCount || {};
    const waves = Math.min(pc.waves || 3, this.cap('maxWaves', 3));
    const delay = pc.waveDelayMs || 90;
    const now = this.scene.time.now;
    for (let w = 0; w < waves; w++) this._waves.push({ at: now + w * delay, count: pc.perWaveMax || pc.base || 5 });
  }

  _emitWave(count) {
    const projCap = this.scene.combat.skillCap('maxDiamondBlizzardProjectiles', 90);
    const live = this.scene.countProjBySkill(this.id);
    const n = Math.max(0, Math.min(count, this.cap('maxProjectilesPerCast', 24), projCap - live));
    if (n <= 0) { if (this.scene._m) this.scene._m.suppressed++; return; }
    const p = this.scene.player;
    const spot = this.scene.combat.densestPoint(120, 0) || this.scene.combat.nearestEnemy(p.x, p.y, 100000) || { x: p.x, y: p.y - 100 };
    const baseAng = Math.atan2(spot.y - p.y, spot.x - p.x);
    const dmg = this.evoDef.damage || {};
    const hg = this.scene.nextHitGroupId();
    for (let i = 0; i < n; i++) {
      const ang = baseAng + (i - (n - 1) / 2) * 0.14; // 扇状の等間隔（凍結判定は procCoefficient と hitGroup 上限で抑制）
      this.scene.combat.spawnPlayerProjectile(p.x, p.y, ang, 320, {
        skillId: this.id, element: 'ice', damage: dmg.base || 26, pierce: 0,
        chillAmount: (this.evoDef.chill || {}).amount || 10, baseFreezeChance: (this.evoDef.freeze || {}).baseChance || 0.05,
        procCoefficient: this.evoDef.procCoefficient ?? 0.35, hitGroupId: hg, frozenBonus: dmg.frozenBonus || 0.4,
        scale: 0.9, lifeMs: 1300, tint: 0x9fe8ff,
      });
    }
  }

  // 途中再開でクールダウンのみ維持（予約中の波・弾は保存せず再開後に安全再構築＝二重生成しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }

  destroy() { this._waves = []; }
}
