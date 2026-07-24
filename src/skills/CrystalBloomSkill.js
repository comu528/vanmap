// 氷晶開花（frost_mage・M7-C・common）: 敵密集地点へ氷晶の芽を設置する。発芽中は小範囲へ低ダメージ・低冷気のパルス、
// 一定時間後に開花して大範囲へダメージ・冷気を与える。開花時のみ凍結中の敵を粉砕する。同時設置数は品質別上限（超過時は最古を開花）。
// periodic。recordCast は設置開始時に1回（各 pulse/開花では記録しない）。runtimeState: cdLeft ＋生存中の芽（x/y/growLeft/pulseLeft）。

import { SkillBase } from './SkillBase.js';

export class CrystalBloomSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.blooms = []; this._seq = 0; } // { x, y, growLeft, pulseLeft, radius, bloomRadius, gfx, id }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats;
    const cap = Math.min(s.maxBlooms || 2, this.scene.combat.skillCap('maxCrystalBlooms', 10));
    if (this.blooms.length >= cap) this._bloom(this.blooms[0], true); // 上限到達で最古を開花
    const spot = this.scene.combat.densestPoint(s.bloomRadius || 70, this._seq % 3) || { x: this.scene.player.x, y: this.scene.player.y };
    this._plant(spot.x, spot.y, s.growTime || 1200, s.radius || 36, s.bloomRadius || 70);
    this.scene.skills.recordExtra(this.id, 'bloomsPlaced', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'highestConcurrentObjects', this.blooms.length, 'max');
  }

  _plant(x, y, growLeft, radius, bloomRadius, id) {
    const gfx = this.scene.add.circle(x, y, radius, 0x80d8ff, 0.22).setDepth(6).setStrokeStyle(1, 0xe1f5fe, 0.5);
    this.blooms.push({ x, y, growLeft, pulseLeft: 0, radius, bloomRadius, gfx, id: id != null ? id : (this._seq++) });
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（設置）
    const s = this.stats;
    for (let i = this.blooms.length - 1; i >= 0; i--) {
      const bl = this.blooms[i];
      bl.growLeft -= dt; bl.pulseLeft -= dt;
      if (bl.gfx) bl.gfx.setScale(1 + 0.12 * Math.sin(this.scene.time.now * 0.005));
      if (bl.growLeft > 0) {
        if (bl.pulseLeft <= 0) {
          bl.pulseLeft = this.def?.config?.pulseHitInterval || 320;
          if (this.scene.combat.frameBudget('crystalBloomPulse', 'maxCrystalBloomPulsesPerFrame')) {
            this.scene.combat.damageArea(bl.x, bl.y, bl.radius, s.pulseDamage, this.id, {
              element: 'ice', tag: 'dot', chillAmount: s.chillAmount, procCoefficient: this.def?.config?.pulseProc ?? 0.16,
              hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x80d8ff,
            });
            this.scene.skills.recordExtra(this.id, 'bloomPulses', 1, 'add');
          }
        }
      } else { this._bloom(bl, false); this.blooms.splice(i, 1); }
    }
  }

  _bloom(bl, removeFromList) {
    const s = this.stats;
    this._detonate(bl.x, bl.y, bl.bloomRadius, s.bloomDamage, s.bloomChill, this.def?.procCoefficient ?? 0.75, true);
    if (bl.gfx) { bl.gfx.destroy(); bl.gfx = null; }
    this.scene.skills.recordExtra(this.id, 'bloomsTriggered', 1, 'add');
    if (removeFromList) { const idx = this.blooms.indexOf(bl); if (idx >= 0) this.blooms.splice(idx, 1); }
  }

  _detonate(x, y, radius, dmg, chill, proc, canShatter) {
    const s = this.stats; const hg = this.scene.nextHitGroupId();
    this.scene.effects.explosion(x, y, radius, 0x9fe8ff);
    if (canShatter) for (const e of this.scene.combat.enemiesInRadius(x, y, radius)) {
      if (this.scene.combat.isFrozen(e)) { this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: this.def?.config?.shatterMultiplier || 1.4, skillPower: dmg }); this.scene.skills.recordExtra(this.id, 'bloomShatters', 1, 'add'); }
    }
    this.scene.combat.damageArea(x, y, radius, dmg, this.id, {
      element: 'ice', chillAmount: chill, baseFreezeChance: 0, procCoefficient: proc,
      hitGroupId: hg, isExplosion: true, color: 0x9fe8ff,
    });
  }

  // 残響/複製（custom）: 即時の小型開花（上限内・永続設置を増やさない）。
  echoCast() { const s = this.stats; const spot = this.scene.combat.densestPoint(s.bloomRadius || 70, 0) || { x: this.scene.player.x, y: this.scene.player.y }; this._detonate(spot.x, spot.y, (s.bloomRadius || 70) * 0.6, s.bloomDamage * 0.6, s.bloomChill * 0.6, this.def?.procCoefficient ?? 0.75, true); }
  cloneCast() { this.echoCast(); }

  // 途中再開: クールダウン＋生存中の芽（growLeft>0 のみ）を1回だけ再構築（開花済みを復活させない・二重生成しない）。
  serializeState() {
    return { cdLeft: this._cd, blooms: this.blooms.map((b) => ({ x: b.x, y: b.y, growLeft: b.growLeft, pulseLeft: b.pulseLeft, radius: b.radius, bloomRadius: b.bloomRadius, id: b.id })) };
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    if (Array.isArray(st.blooms)) {
      for (const b of this.blooms) if (b.gfx) b.gfx.destroy();
      this.blooms = [];
      for (const b of st.blooms) { if (b.growLeft > 0) { this._plant(b.x, b.y, b.growLeft, b.radius, b.bloomRadius, b.id); this.blooms[this.blooms.length - 1].pulseLeft = b.pulseLeft || 0; } }
    }
  }

  destroy() { for (const b of this.blooms) if (b.gfx) b.gfx.destroy(); this.blooms = []; }
}
