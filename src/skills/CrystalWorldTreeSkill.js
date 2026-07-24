// 世界氷晶樹（crystal_bloom の進化・M7-C）: 敵密集地点に巨大な氷晶樹を成長させ、成長中に複数の枝パルス、最終開花で広範囲ダメージと冷気を与えて
// 凍結中の敵を強化粉砕する。開花後に短命の小氷晶を周囲へ残す（低 proc・粉砕なし）。同時樹数は厳しい上限で、画面を完全には覆わない。位置選択は決定論的。
// periodic・custom echo/clone。main cast 時のみ recordCast。Job Lv80 対象外。runtimeState: cdLeft ＋樹（x/y/growLeft/pulseLeft/phase）。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class CrystalWorldTreeSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.trees = []; this.residues = []; this._seq = 0; }

  fire() {
    const cap = Math.min(this.cap('maxTrees', 2), this.scene.combat.skillCap('maxCrystalWorldTrees', 2));
    if (this.trees.length >= cap) this._bloom(this.trees[0], true);
    const spot = this.scene.combat.densestPoint(this.evoDef.bloomRadius || 130, this._seq % 3) || { x: this.scene.player.x, y: this.scene.player.y };
    this._plant(spot.x, spot.y, this.evoDef.growTime || 1600);
    this.scene.skills.recordExtra(this.id, 'treesGrown', 1, 'add');
  }

  _plant(x, y, growLeft, id) {
    const gfx = this.scene.add.image(x, y, 'icon_crystal_world_tree').setDepth(6).setScale(0.5).setAlpha(0.5).setTint(0xbde8ff);
    this.trees.push({ x, y, growLeft, pulseLeft: 0, phase: 'growing', gfx, id: id != null ? id : (this._seq++) });
  }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()
    const grow = this.evoDef.growTime || 1600;
    for (let i = this.trees.length - 1; i >= 0; i--) {
      const t = this.trees[i]; t.growLeft -= dt; t.pulseLeft -= dt;
      if (t.gfx) t.gfx.setScale(0.5 + 0.6 * (1 - Math.max(0, t.growLeft) / grow));
      if (t.growLeft > 0) {
        if (t.pulseLeft <= 0) {
          t.pulseLeft = this.evoDef.branchPulseInterval || 320;
          this.scene.combat.damageArea(t.x, t.y, this.evoDef.radius || 70, this.evoDef.pulseDamage || 6, this.id, {
            element: 'ice', tag: 'dot', chillAmount: (this.evoDef.chill || {}).pulse || 6, procCoefficient: this.evoDef.pulseProc ?? 0.16,
            hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x80d8ff,
          });
          this.scene.skills.recordExtra(this.id, 'branchPulses', 1, 'add');
        }
      } else { this._bloom(t, false); this.trees.splice(i, 1); }
    }
    // 残留する小氷晶の tick。
    for (let i = this.residues.length - 1; i >= 0; i--) {
      const r = this.residues[i]; r.until -= dt; r.tickLeft -= dt;
      if (r.gfx) r.gfx.setAlpha(0.3 * Math.max(0, r.until) / (r.max || 1) + 0.05);
      if (r.tickLeft <= 0 && r.until > 0) {
        r.tickLeft = 360;
        this.scene.combat.damageArea(r.x, r.y, r.radius, r.damage, this.id, {
          element: 'ice', tag: 'dot', chillAmount: 3, procCoefficient: r.proc, hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x80deea,
        });
      }
      if (r.until <= 0) { if (r.gfx) r.gfx.destroy(); this.residues.splice(i, 1); }
    }
  }

  _bloom(t, removeFromList) {
    const hg = this.scene.nextHitGroupId(); const br = this.evoDef.bloomRadius || 130;
    this.scene.effects.explosion(t.x, t.y, br, 0x9fe8ff);
    for (const e of this.scene.combat.enemiesInRadius(t.x, t.y, br)) {
      if (this.scene.combat.isFrozen(e)) { this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: (this.evoDef.shatter || {}).multiplier || 1.7, skillPower: this.evoDef.bloomDamage || 60 }); this.scene.skills.recordExtra(this.id, 'treeShatters', 1, 'add'); }
    }
    this.scene.combat.damageArea(t.x, t.y, br, this.evoDef.bloomDamage || 60, this.id, {
      element: 'ice', chillAmount: (this.evoDef.chill || {}).bloom || 24, baseFreezeChance: 0, procCoefficient: this.evoDef.procCoefficient ?? 0.80,
      hitGroupId: hg, isExplosion: true, color: 0x9fe8ff,
    });
    this._spawnResidues(t.x, t.y);
    if (t.gfx) { t.gfx.destroy(); t.gfx = null; }
    this.scene.skills.recordExtra(this.id, 'treesBloomed', 1, 'add');
    if (removeFromList) { const idx = this.trees.indexOf(t); if (idx >= 0) this.trees.splice(idx, 1); }
  }

  _spawnResidues(x, y) {
    const rd = this.evoDef.residue || {};
    const n = Math.min(rd.count || 4, this.cap('maxResidues', 8) - this.residues.length);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / Math.max(1, rd.count || 4); const rr = (this.evoDef.bloomRadius || 130) * 0.5;
      const rx = x + Math.cos(a) * rr, ry = y + Math.sin(a) * rr;
      const gfx = this.scene.add.circle(rx, ry, rd.radius || 30, 0x80deea, 0.2).setDepth(5).setStrokeStyle(1, 0xbde8ff, 0.3);
      this.residues.push({ x: rx, y: ry, radius: rd.radius || 30, damage: rd.damage || 4, proc: rd.proc || 0.12, until: rd.durationMs || 1200, max: rd.durationMs || 1200, tickLeft: 0, gfx });
    }
  }

  // 残響/複製（custom）: 即時の小型開花（樹を常設で増やさない）。
  echoCast() { const spot = this.scene.combat.densestPoint(this.evoDef.bloomRadius || 130, 0) || { x: this.scene.player.x, y: this.scene.player.y }; this._bloom({ x: spot.x, y: spot.y, gfx: null }, false); }
  cloneCast() { this.echoCast(); }

  // 途中再開: cdLeft ＋成長中の樹（growLeft>0）を1回だけ再構築（開花済みは復活しない・二重生成しない）。残留小氷晶は短命のため保存しない。
  serializeState() {
    return { cdLeft: this._cd, trees: this.trees.map((t) => ({ x: t.x, y: t.y, growLeft: t.growLeft, pulseLeft: t.pulseLeft, phase: t.phase, id: t.id })) };
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    if (Array.isArray(st.trees)) {
      for (const t of this.trees) if (t.gfx) t.gfx.destroy();
      this.trees = [];
      for (const t of st.trees) { if (t.growLeft > 0) { this._plant(t.x, t.y, t.growLeft, t.id); this.trees[this.trees.length - 1].pulseLeft = t.pulseLeft || 0; } }
    }
  }

  destroy() { for (const t of this.trees) if (t.gfx) t.gfx.destroy(); for (const r of this.residues) if (r.gfx) r.gfx.destroy(); this.trees = []; this.residues = []; }
}
