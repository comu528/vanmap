// 雪精霊（frost_mage・M7-B）: プレイヤー付近を追従する雪精霊を召喚し、最寄りの敵へ氷弾を放つ。冷気を帯びた敵を優先。
// frozen 敵へは追加ダメージ。精霊弾は粉砕を発生させない。取得中は常時存在し、レベルで精霊数/射撃性能が成長。
// continuous(召喚): クールダウン発火は使わず update で管理。召喚一斉射撃サイクルを主発動として記録（各精霊/各弾では増殖記録しない）。
// 再開時は現在レベルに応じて一度だけ再構築する（二重召喚しない）。

import { SkillBase } from './SkillBase.js';

export class FrostSpiritSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.spirits = []; this._angle = 0; this._castPulse = 0; }
  canFire() { return false; }

  _targetCount() {
    const s = this.stats;
    return Math.min(s.spiritCount || 1, this.scene.combat.skillCap('maxFrostSpirits', 6));
  }

  _ensure() {
    const want = this._targetCount();
    while (this.spirits.length < want) {
      const spr = this.scene.add.image(0, 0, 'icon_frost_shard').setBlendMode(Phaser.BlendModes.ADD).setDepth(51).setScale(0.7).setTint(0xbde8ff);
      // 決定論的な初期スタッガ（RNG不使用）: 精霊番号で射撃位相をずらす。
      this.spirits.push({ sprite: spr, shotTimer: (this.spirits.length * 137) % 400 });
    }
    while (this.spirits.length > want) { const sp = this.spirits.pop(); if (sp.sprite) sp.sprite.destroy(); }
    if (this.spirits.length) this.scene.skills.recordExtra(this.id, 'maxConcurrent', this.spirits.length, 'max');
  }

  _preferredTarget(ox, oy, range) {
    // 冷気を帯びた敵を優先し、いなければ最寄り。
    let best = null, bestD = Infinity, bestChilled = false;
    for (const e of this.scene.combat.enemiesInRadius(ox, oy, range)) {
      if (!e.alive) continue;
      const chilled = this.scene.combat.isChilled(e);
      const d = (e.x - ox) ** 2 + (e.y - oy) ** 2;
      if ((chilled && !bestChilled) || ((chilled === bestChilled) && d < bestD)) { best = e; bestD = d; bestChilled = chilled; }
    }
    return best;
  }

  update(dt) {
    const s = this.stats; const p = this.scene.player;
    this._ensure();
    this._angle += dt * 0.0016;
    if (this._castPulse > 0) this._castPulse -= dt;
    const n = this.spirits.length;
    let fired = false;
    for (let i = 0; i < n; i++) {
      const sp = this.spirits[i];
      const a = this._angle + (Math.PI * 2 * i) / n;
      const ox = p.x + Math.cos(a) * 28, oy = p.y + Math.sin(a) * 28;
      if (sp.sprite) sp.sprite.setPosition(ox, oy);
      sp.shotTimer -= dt;
      if (sp.shotTimer <= 0) {
        const t = this._preferredTarget(ox, oy, s.targetRange || 200);
        if (t && t.alive) { sp.shotTimer = s.shotCooldownMs || 800; if (this._shoot(ox, oy, t, s)) fired = true; }
        else sp.shotTimer = 120;
      }
    }
    if (fired && this._castPulse <= 0) { this.scene.skills.recordCast(this.id); this._castPulse = (this.def?.config?.summonPulseMs ?? 900); }
  }

  _shoot(ox, oy, t, s) {
    if (this.scene.countProjBySkill(this.id) >= this.scene.combat.skillCap('maxFrostSpiritProjectiles', 72)) return false;
    const baseAng = Math.atan2(t.y - oy, t.x - ox);
    const count = Math.max(1, s.projectileCount || 1);
    const hg = this.scene.nextHitGroupId();
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (i - (count - 1) / 2) * 0.12 : 0;
      this.scene.combat.spawnPlayerProjectile(ox, oy, baseAng + off, s.projectileSpeed || 340, {
        skillId: this.id, element: 'ice', damage: s.shotDamage, pierce: 0,
        chillAmount: s.chillAmount, baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.42,
        hitGroupId: hg, frozenBonus: s.frozenBonus || 0, scale: 0.55, lifeMs: 1000, tint: 0xbde8ff,
      });
    }
    this.scene.skills.recordExtra(this.id, 'spiritShots', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'spiritsSummoned', this.spirits.length, 'max');
    return true;
  }

  // 残響/複製（custom）: 召喚済みの各精霊が最寄り敵へ追加の一斉射撃（精霊を増やさない）。
  echoCast() {
    const s = this.stats; const p = this.scene.player; const n = this.spirits.length;
    for (let i = 0; i < n; i++) {
      const a = this._angle + (Math.PI * 2 * i) / n;
      const ox = p.x + Math.cos(a) * 28, oy = p.y + Math.sin(a) * 28;
      const t = this._preferredTarget(ox, oy, s.targetRange || 200);
      if (t && t.alive) this._shoot(ox, oy, t, s);
    }
  }
  cloneCast() { this.echoCast(); }

  destroy() { for (const sp of this.spirits) if (sp.sprite) sp.sprite.destroy(); this.spirits = []; }
}
