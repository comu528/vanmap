// 雪后氷霊陣（frost_spirit の進化・M7-B）: 複数の上位氷霊を従え、各霊が異なる敵を狙う。chilled 敵を優先し、一定間隔で小型 Nova を放つ。
// 通常射撃は粉砕しない。Nova のみ限定的に粉砕（同じ発動で同じ敵を複数粉砕しない）。summon 数・弾数・Nova 対象数に上限。
// continuous(召喚): update で管理。召喚一斉射撃サイクルを主発動として記録。再開時は一度だけ再構築（二重召喚禁止）。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class FrostQueenCourtSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.spirits = []; this._angle = 0; this._castPulse = 0; this._novaTimer = 0; }
  canFire() { return false; }

  _targetCount() { return Math.min((this.evoDef.summon || {}).count || 4, this.scene.combat.skillCap('maxFrostQueenSpirits', 6)); }

  _ensure() {
    const want = this._targetCount();
    while (this.spirits.length < want) {
      const spr = this.scene.add.image(0, 0, 'icon_frost_nova').setBlendMode(Phaser.BlendModes.ADD).setDepth(51).setScale(0.85).setTint(0xe1f5fe);
      this.spirits.push({ sprite: spr, shotTimer: (this.spirits.length * 149) % 400 });
    }
    while (this.spirits.length > want) { const sp = this.spirits.pop(); if (sp.sprite) sp.sprite.destroy(); }
    if (this.spirits.length) this.scene.skills.recordExtra(this.id, 'spiritsSummoned', this.spirits.length, 'max');
  }

  update(dt) {
    const ev = this.evoDef; const p = this.scene.player;
    this._ensure();
    this._angle += dt * 0.0015;
    if (this._castPulse > 0) this._castPulse -= dt;
    this._novaTimer -= dt;
    const n = this.spirits.length;
    const used = new Set();
    let fired = false;
    for (let i = 0; i < n; i++) {
      const sp = this.spirits[i];
      const a = this._angle + (Math.PI * 2 * i) / n;
      const ox = p.x + Math.cos(a) * 32, oy = p.y + Math.sin(a) * 32;
      if (sp.sprite) sp.sprite.setPosition(ox, oy).setRotation(a);
      sp.shotTimer -= dt;
      if (sp.shotTimer <= 0) {
        const t = this._distinctTarget(ox, oy, used);
        if (t) { sp.shotTimer = ev.shotCooldownMs || 620; used.add(t); if (this._shoot(ox, oy, t)) fired = true; }
        else sp.shotTimer = 120;
      }
    }
    if (fired && this._castPulse <= 0) { this.scene.skills.recordCast(this.id); this._castPulse = 900; }
    // 周期 Nova（各霊位置で小型 Nova・粉砕は限定）。
    if (this._novaTimer <= 0 && n > 0) {
      this._novaTimer = (ev.nova || {}).intervalMs || 1400;
      this._emitNova();
    }
  }

  _distinctTarget(ox, oy, used) {
    let best = null, bestD = Infinity, bestChilled = false;
    for (const e of this.scene.combat.enemiesInRadius(ox, oy, 240)) {
      if (!e.alive || used.has(e)) continue;
      const chilled = this.scene.combat.isChilled(e);
      const d = (e.x - ox) ** 2 + (e.y - oy) ** 2;
      if ((chilled && !bestChilled) || ((chilled === bestChilled) && d < bestD)) { best = e; bestD = d; bestChilled = chilled; }
    }
    return best;
  }

  _shoot(ox, oy, t) {
    const ev = this.evoDef;
    if (this.scene.countProjBySkill(this.id) >= this.scene.combat.skillCap('maxFrostQueenProjectiles', 72)) return false;
    const ang = Math.atan2(t.y - oy, t.x - ox);
    this.scene.combat.spawnPlayerProjectile(ox, oy, ang, ev.projectileSpeed || 370, {
      skillId: this.id, element: 'ice', damage: ev.shotDamage || 16, pierce: 0,
      chillAmount: (ev.chill || {}).amount || 9, baseFreezeChance: 0, procCoefficient: ev.procCoefficient ?? 0.42,
      hitGroupId: this.scene.nextHitGroupId(), frozenBonus: ev.frozenBonus || 0.5, scale: 0.6, lifeMs: 1000, tint: 0xe1f5fe,
    });
    this.scene.skills.recordExtra(this.id, 'spiritShots', 1, 'add');
    return true;
  }

  _emitNova() {
    const ev = this.evoDef; const nv = ev.nova || {}; const p = this.scene.player; const n = this.spirits.length;
    let shatters = 0; const shCap = this.scene.combat.skillCap('maxFrostQueenSpirits', 6);
    const novaTargetCap = this.scene.combat.skillCap('maxFrostQueenProjectiles', 72);
    let novaHits = 0;
    for (let i = 0; i < n; i++) {
      const a = this._angle + (Math.PI * 2 * i) / n;
      const ox = p.x + Math.cos(a) * 32, oy = p.y + Math.sin(a) * 32;
      this.scene.effects.explosion(ox, oy, nv.radius || 70, 0x80deea);
      const hg = this.scene.nextHitGroupId();
      for (const e of this.scene.combat.enemiesInRadius(ox, oy, nv.radius || 70)) {
        if (novaHits >= novaTargetCap) break;
        novaHits++;
        if (shatters < shCap && this.scene.combat.isFrozen(e)) { if (this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: nv.multiplier || 1.3, skillPower: nv.damage })) shatters++; }
        this.scene.combat.dealDamage(e, nv.damage || 18, this.id, {
          element: 'ice', chillAmount: (ev.chill || {}).perNova || 18, baseFreezeChance: nv.baseChance || 0.1,
          procCoefficient: ev.procCoefficient ?? 0.42, hitGroupId: hg, quiet: true, color: 0x80deea,
        });
      }
    }
  }

  // 残響/複製（custom）: 召喚済みの各霊が追加の一斉射撃（霊を増やさない）。
  echoCast() {
    const p = this.scene.player; const n = this.spirits.length; const used = new Set();
    for (let i = 0; i < n; i++) {
      const a = this._angle + (Math.PI * 2 * i) / n;
      const ox = p.x + Math.cos(a) * 32, oy = p.y + Math.sin(a) * 32;
      const t = this._distinctTarget(ox, oy, used);
      if (t) { used.add(t); this._shoot(ox, oy, t); }
    }
  }
  cloneCast() { this.echoCast(); }

  destroy() { for (const sp of this.spirits) if (sp.sprite) sp.sprite.destroy(); this.spirits = []; }
}
