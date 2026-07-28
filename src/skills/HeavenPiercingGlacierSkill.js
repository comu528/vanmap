// 天穿氷河槍（glacial_lance の進化）: 巨大な氷河槍が敵群を貫通し、高い冷気を付与。冷気の高い敵へ追加ダメージ。
// 凍結中の敵を粉砕し、粉砕地点から小型氷片が飛散する（氷片は粉砕を再発生させない）。ボス氷砕ゲージを高く蓄積。
// 同時槍数・貫通数・小型氷片数・粉砕爆発数へ上限。進化のため Job Lv80 発射数対象外（fireProjectileCount を呼ばない・docs 記載）。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class HeavenPiercingGlacierSkill extends EvolvedSkillBase {
  fire(ctx) {
    const p = this.scene.player;
    const target = this.scene.combat.nearestEnemy(p.x, p.y, p.cfg.attackRange + 80);
    if (!target) return;
    const dmg = this.evoDef.damage || {};
    const pc = this.evoDef.projectileCount || {};
    const frag = this.evoDef.fragments || {};
    const lances = Math.min(1, this.cap('maxLances', 3)); // 単一の大型槍（同時槍数の上限内）
    const pierce = Math.min(pc.pierce || 10, this.cap('maxPierce', 14));
    // M7-E: bossGauge.multiplier は「ボスの氷砕ゲージ」だけへ掛ける（M7-C で確立した共通経路 opts.bossGaugeMult）。
    // 以前は chillAmount へ乗算していたため通常敵/エリートの冷気まで増えていた（状態異常経路の誤接続）。
    const bossMult = (this.evoDef.bossGauge || {}).multiplier || 1;
    const baseAng = Math.atan2(target.y - p.y, target.x - p.x);
    const hg = this.scene.nextHitGroupId();
    for (let i = 0; i < lances; i++) {
      this.scene.combat.spawnPlayerProjectile(p.x, p.y, baseAng, 380, {
        skillId: this.id, element: 'ice', damage: dmg.base || 70,
        pierce, pierceFalloff: dmg.pierceFalloff || 0.95,
        chillAmount: (this.evoDef.chill || {}).amount || 30, bossGaugeMult: bossMult,
        baseFreezeChance: (this.evoDef.freeze || {}).baseChance || 0, // M7-E: 宣言済みの凍結確率を実適用（進化前 glacial_lance より凍結が弱くならない）
        procCoefficient: this.evoDef.procCoefficient ?? 1.0,
        hitGroupId: hg, bonusPerChill: dmg.bonusPerChill || 0.006,
        shatterOnFrozen: true, shatterMultiplier: (this.evoDef.shatter || {}).multiplier || 1.5,
        fragmentCount: Math.min(frag.count || 4, this.cap('maxFragments', 6)), fragmentDamageFactor: frag.damageFactor || 0.35,
        scale: 1.8, lifeMs: 1600, tint: 0x80d8ff,
      });
    }
  }

  // 途中再開でクールダウンを維持（再読込での CD 全回復・即時再発動を防ぐ）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
}
