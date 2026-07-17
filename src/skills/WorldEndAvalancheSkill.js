// 終末氷河奔流（avalanche の進化・M7-B）: 複数方向から巨大な氷河波を時間差で流す。通常敵を大きく押し流し、エリートは軽減、ボスは移動させない。
// frozen 敵を粉砕し、粉砕地点へ短命の氷片／冷気領域を残す（完全には閉じ込めない・ice_wall 実体を無料複製しない）。
// 波数・幅・判定・粉砕数・残留物に上限。波接触ごとに recordCast しない。periodic。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class WorldEndAvalancheSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.waves = []; this._pending = []; this.residues = []; }

  fire() {
    const wv = this.evoDef.wave || {};
    const p = this.scene.player;
    const spot = this.scene.combat.densestPoint(120, 0) || this.scene.combat.nearestEnemy(p.x, p.y, 100000) || { x: p.x + 100, y: p.y };
    const baseAng = Math.atan2(spot.y - p.y, spot.x - p.x);
    const count = Math.min(wv.count || 3, this.cap('maxWaves', 4));
    const now = this.scene.time.now;
    for (let i = 0; i < count; i++) {
      // 複数方向へ時間差（波同士は delayMs だけずらす）。
      const ang = baseAng + (i - (count - 1) / 2) * 0.5;
      this._pending.push({ at: now + i * (wv.delayMs || 260), ang });
    }
    this.scene.skills.recordExtra(this.id, 'wavesCreated', count, 'add');
  }

  _spawnWave(ang) {
    const wv = this.evoDef.wave || {}; const p = this.scene.player;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const sx = p.x - dx * 30, sy = p.y - dy * 30;
    const gfx = this.scene.add.rectangle(sx, sy, 16, wv.width || 120, 0xb3e5fc, 0.4).setDepth(7).setRotation(ang).setStrokeStyle(1, 0xe1f5fe, 0.7);
    this.waves.push({ x: sx, y: sy, dx, dy, traveled: 0, maxTravel: (wv.speed || 240) * (wv.duration || 1900) / 1000, hitSet: new Set(), gfx });
  }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()
    const now = this.scene.time.now;
    const ev = this.evoDef; const wv = ev.wave || {};
    // 時間差スポーン。
    for (let i = this._pending.length - 1; i >= 0; i--) { if (now >= this._pending[i].at) { const q = this._pending.splice(i, 1)[0]; this._spawnWave(q.ang); } }
    // 波の前進と接触。
    let contacts = 0, shatters = 0;
    const contactCap = this.scene.combat.skillCap('maxAvalancheHitsPerFrame', 60);
    const shCap = this.scene.combat.skillCap('maxWorldEndAvalancheShattersPerFrame', 5);
    const halfW = (wv.width || 120) / 2 + 8;
    const step = (wv.speed || 240) * dt / 1000;
    for (let w = this.waves.length - 1; w >= 0; w--) {
      const wave = this.waves[w];
      wave.x += wave.dx * step; wave.y += wave.dy * step; wave.traveled += step;
      if (wave.gfx) wave.gfx.setPosition(wave.x, wave.y);
      const hg = this.scene.nextHitGroupId();
      for (const e of this.scene.combat.enemiesInRadius(wave.x, wave.y, halfW + 20)) {
        if (!e.alive || wave.hitSet.has(e)) continue;
        if (contacts >= contactCap) { if (this.scene._m) this.scene._m.suppressed++; break; }
        const rx = e.x - wave.x, ry = e.y - wave.y;
        const along = rx * wave.dx + ry * wave.dy; if (along < -18 || along > step + 20) continue;
        const perp = Math.abs(-rx * wave.dy + ry * wave.dx); if (perp > halfW) continue;
        contacts++; wave.hitSet.add(e);
        if (shatters < shCap && this.scene.combat.isFrozen(e)) {
          if (this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: (ev.shatter || {}).multiplier || 1.5, skillPower: (ev.damage || {}).base })) { shatters++; this._spawnResidue(e.x, e.y); }
        }
        let dmg = (ev.damage || {}).base || 20;
        if (this.scene.combat.isFrozen(e)) dmg *= (1 + ((ev.damage || {}).frozenBonus || 0.35));
        let kb = ev.knockback || 70; if (e.isBoss) kb = 0; else if (e.isElite) kb *= 0.4;
        this.scene.combat.dealDamage(e, dmg, this.id, {
          element: 'ice', chillAmount: (ev.chill || {}).amount || 13, procCoefficient: ev.procCoefficient ?? 0.55,
          hitGroupId: hg, knockback: kb, from: { x: wave.x - wave.dx * 20, y: wave.y - wave.dy * 20 }, quiet: true, color: 0x9fe8ff,
        });
      }
      if (wave.traveled >= wave.maxTravel) { if (wave.gfx) wave.gfx.destroy(); this.waves.splice(w, 1); }
    }
    // 残留（冷気領域・低ダメージ・短命・閉じ込めない）。
    const res = ev.residue || {};
    for (let i = this.residues.length - 1; i >= 0; i--) {
      const r = this.residues[i];
      r.until -= dt; r.tickLeft -= dt;
      if (r.gfx) r.gfx.setAlpha(0.14 * Math.max(0, r.until) / (res.durationMs || 1200) + 0.03);
      if (r.tickLeft <= 0 && r.until > 0) {
        r.tickLeft = 320;
        this.scene.combat.damageArea(r.x, r.y, res.radius || 34, res.damage || 4, this.id, {
          element: 'ice', tag: 'dot', chillAmount: (ev.chill || {}).amount * 0.2 || 3, procCoefficient: res.proc ?? 0.15,
          hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x80deea,
        });
      }
      if (r.until <= 0) { if (r.gfx) r.gfx.destroy(); this.residues.splice(i, 1); }
    }
  }

  _spawnResidue(x, y) {
    const res = this.evoDef.residue || {};
    if (this.residues.length >= this.cap('maxResidues', 6)) { const old = this.residues.shift(); if (old.gfx) old.gfx.destroy(); }
    const gfx = this.scene.add.circle(x, y, res.radius || 34, 0x4fc3f7, 0.14).setDepth(5).setStrokeStyle(1, 0x80deea, 0.4);
    this.residues.push({ x, y, until: res.durationMs || 1200, tickLeft: 0, gfx });
  }

  // 途中再開でクールダウンのみ維持（波・残留の位置は保存せず＝地形として残さない・無料再発動しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
  destroy() { for (const w of this.waves) if (w.gfx) w.gfx.destroy(); for (const r of this.residues) if (r.gfx) r.gfx.destroy(); this.waves = []; this.residues = []; this._pending = []; }
}
