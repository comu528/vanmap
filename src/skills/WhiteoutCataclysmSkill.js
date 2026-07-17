// 白魔大氷災（hailstorm の進化・M7-B）: 大型の吹雪領域を展開し、領域内へ継続的な冷気、一定間隔で巨大な雹を落とす。
// 吹雪 tick は低 procCoefficient、巨大雹は高 procCoefficient。巨大雹が frozen 敵へ命中すると粉砕（短時間の連続粉砕はしない）。
// ボスは氷砕ゲージ。画面を白くしない。領域数・雹数・tick 数・粉砕数に上限。periodic。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

const GOLDEN = 2.399963229728653;

export class WhiteoutCataclysmSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.domains = []; }

  fire() {
    const area = this.evoDef.area || {};
    const cap = this.scene.combat.skillCap('maxWhiteoutCataclysms', 2);
    while (this.domains.length >= cap) this._remove(0);
    const p = this.scene.player;
    const spot = this.scene.combat.densestPoint(area.radius || 140, 0) || { x: p.x, y: p.y };
    const gfx = this.scene.add.circle(spot.x, spot.y, area.radius || 140, 0x4fc3f7, 0.09).setDepth(5).setStrokeStyle(1, 0x9fe8ff, 0.3);
    const now = this.scene.time.now;
    this.domains.push({ x: spot.x, y: spot.y, until: now + (area.duration || 4200), tickAt: now, hailAt: now + (area.giantHailIntervalMs || 700), seq: 0, gfx });
  }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()
    const now = this.scene.time.now;
    const ev = this.evoDef; const area = ev.area || {};
    let ticks = 0, hails = 0;
    const tickCap = this.scene.combat.skillCap('maxWhiteoutHailImpactsPerFrame', 8);
    const hailCap = this.scene.combat.skillCap('maxWhiteoutHailImpactsPerFrame', 8);
    for (let i = this.domains.length - 1; i >= 0; i--) {
      const d = this.domains[i];
      if (now >= d.until) { this._remove(i); continue; }
      // 吹雪 tick（低 proc・継続冷気）。
      if (now >= d.tickAt && ticks < tickCap) {
        ticks++; d.tickAt = now + (area.tickRate || 520);
        const hg = this.scene.nextHitGroupId();
        this.scene.combat.forEachEnemyInRadius(d.x, d.y, area.radius || 140, (e) => {
          this.scene.combat.dealDamage(e, (ev.damage || {}).blizzardTick || 8, this.id, {
            element: 'ice', tag: 'dot', quiet: true, color: 0x80deea,
            chillAmount: (ev.chill || {}).perTick || 10, baseFreezeChance: (ev.freeze || {}).baseChance || 0.08,
            procCoefficient: ev.procCoefficient ?? 0.22, hitGroupId: hg,
          });
        });
      }
      // 巨大雹（高 proc・凍結中は粉砕）。
      if (now >= d.hailAt && hails < hailCap) {
        hails++; d.hailAt = now + (area.giantHailIntervalMs || 700);
        const k = d.seq++;
        const ang = k * GOLDEN, dist = (area.radius || 140) * Math.sqrt((k % 5) / 5);
        const hx = d.x + Math.cos(ang) * dist, hy = d.y + Math.sin(ang) * dist;
        this.scene.effects.explosion(hx, hy, 40, 0x9fe8ff);
        for (const e of this.scene.combat.enemiesInRadius(hx, hy, 40)) {
          if (this.scene.combat.isFrozen(e)) this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: (ev.shatter || {}).multiplier || 1.5, skillPower: (ev.damage || {}).giantHail });
        }
        this.scene.combat.damageArea(hx, hy, 40, (ev.damage || {}).giantHail || 30, this.id, {
          element: 'ice', chillAmount: (ev.chill || {}).perHail || 16, baseFreezeChance: (ev.freeze || {}).baseChance || 0.08,
          procCoefficient: ev.giantHailProc ?? 0.6, hitGroupId: this.scene.nextHitGroupId(), isExplosion: true, quiet: true, color: 0x9fe8ff,
        });
      }
    }
  }

  // 残響/複製（custom）: 吹雪パルスを1回ぶん（領域は多重生成しない）。
  echoCast() {
    const ev = this.evoDef; const p = this.scene.player;
    this.scene.combat.damageArea(p.x, p.y, (ev.area || {}).radius || 140, (ev.damage || {}).blizzardTick || 8, this.id, {
      element: 'ice', tag: 'dot', chillAmount: (ev.chill || {}).perTick || 10, procCoefficient: ev.procCoefficient ?? 0.22,
      hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x80deea,
    });
  }
  cloneCast() { this.echoCast(); }

  _remove(i) { const d = this.domains[i]; if (d && d.gfx) d.gfx.destroy(); this.domains.splice(i, 1); }

  // 途中再開でクールダウンのみ維持（領域の位置は保存せず＝二重生成しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
  destroy() { for (const d of this.domains) if (d.gfx) d.gfx.destroy(); this.domains = []; }
}
