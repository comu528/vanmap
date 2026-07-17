// 氷晶環（frost_mage・M7-B）: プレイヤー周囲を複数の氷晶が回転し、接触した敵へ氷ダメージと冷気を与える。
// 凍結中の敵への接触で小さな追加ダメージ（frozenBonus）。接触ごとに粉砕はしない。ボスには氷砕ゲージ。
// continuous: クールダウン発火は使わず常時 update で処理。主発動(recordCast)は castPulse でスロットルし、接触tick毎に進めない。
// 再開時は現在レベルに応じて一度だけ再構築する（位置は保存しない＝二重生成しない）。

import { SkillBase } from './SkillBase.js';

export class FrostOrbitSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.angle = 0;
    this.orbs = [];
    this._hitCd = new Map(); // enemy -> 残り時間
    this._castPulse = 0;
    this._rebuild();
  }

  onLevelChanged() { this._rebuild(); }
  canFire() { return false; }

  _crystalCount() {
    const s = this.stats;
    return Math.min(s.crystalCount || 2, this.scene.combat.skillCap('maxFrostOrbitCrystals', 6));
  }

  _rebuild() {
    for (const o of this.orbs) o.destroy();
    this.orbs = [];
    const n = this._crystalCount();
    const scale = this.visualScale();
    for (let i = 0; i < n; i++) {
      const spr = this.scene.add.image(0, 0, 'icon_frost_shard')
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(52).setScale(0.7 * (this.stats.crystalSize || 0.8) * scale).setTint(0x9fe8ff);
      this.orbs.push(spr);
    }
  }

  update(dt) {
    const s = this.stats;
    if (this.orbs.length !== this._crystalCount()) this._rebuild();
    this.angle += (s.rotationSpeed || 2.4) * dt / 1000;
    const p = this.scene.player;
    const radius = s.radius || 50;
    const n = this.orbs.length;
    if (this._castPulse > 0) this._castPulse -= dt;
    for (const [e, t] of this._hitCd) { const nt = t - dt; if (nt <= 0 || !e.alive) this._hitCd.delete(e); else this._hitCd.set(e, nt); }

    let hits = 0;
    const hitCap = this.scene.combat.skillCap('maxFrostOrbitHitsPerFrame', 40);
    for (let i = 0; i < n; i++) {
      const a = this.angle + (Math.PI * 2 * i) / n;
      const ox = p.x + Math.cos(a) * radius, oy = p.y + Math.sin(a) * radius;
      const orb = this.orbs[i]; orb.setPosition(ox, oy).setRotation(a);
      this.scene.combat.forEachEnemyInRadius(ox, oy, 11, (e) => {
        if (this._hitCd.has(e)) return;
        if (hits >= hitCap) { if (this.scene._m) this.scene._m.suppressed++; return; }
        hits++;
        this._hitCd.set(e, s.hitCooldownMs || 360);
        let dmg = s.damage;
        if (this.scene.combat.isFrozen(e)) dmg *= (1 + (s.frozenBonus || 0));
        if (this._castPulse <= 0) { this.scene.skills.recordCast(this.id); this._castPulse = (this.def?.config?.castPulseMs ?? 500); }
        this.scene.combat.dealDamage(e, dmg, this.id, {
          element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: 0,
          procCoefficient: this.def?.procCoefficient ?? 0.2, hitGroupId: this.scene.nextHitGroupId(), color: 0x9fe8ff,
        });
        this.scene.skills.recordExtra(this.id, 'contactHits', 1, 'add');
      });
    }
    if (this.orbs.length) this.scene.skills.recordExtra(this.id, 'maxOrbitCrystals', this.orbs.length, 'max');
  }

  // 残響/複製（custom）: 周囲へ氷晶パルスを1回（氷晶を増やさない・回転状態を変えない）。
  echoCast() {
    const s = this.stats; const p = this.scene.player;
    this.scene.combat.damageArea(p.x, p.y, (s.radius || 50) + 12, s.damage, this.id, {
      element: 'ice', chillAmount: s.chillAmount, procCoefficient: this.def?.procCoefficient ?? 0.2,
      hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x9fe8ff,
    });
  }
  cloneCast() { this.echoCast(); }

  destroy() { for (const o of this.orbs) o.destroy(); this.orbs = []; this._hitCd.clear(); }
}
