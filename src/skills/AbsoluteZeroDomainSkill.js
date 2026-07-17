// 絶対零度領域（frost_nova の進化）: プレイヤー中心か敵密集地点へ大型氷結領域を展開し、周期的にNovaを発生。
// 冷気が高い敵ほど freezeChance 上昇（chillFreezeBoost）。frozen 敵には毎tick粉砕せず、指定間隔で安全に粉砕（連続粉砕しない）。
// 領域内の通常敵を強く制圧。ボスには冷気ゲージを付与（dealDamage の共通経路で自動変換）。
// tick数・同時領域数・粉砕数へ品質別上限。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class AbsoluteZeroDomainSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.domains = []; // { x, y, until, novaAt, shatterAt, gfx }
  }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()（領域を設置）
    const now = this.scene.time.now;
    const area = this.evoDef.area || {};
    const dmg = this.evoDef.damage || {};
    let novaTicks = 0, shatters = 0;
    const novaCap = this.scene.combat.skillCap('maxAbsoluteZeroShattersPerFrame', 3); // Nova tick も共通の上限で緩やかに抑制
    const shCap = this.scene.combat.skillCap('maxAbsoluteZeroShattersPerFrame', 3);
    for (let i = this.domains.length - 1; i >= 0; i--) {
      const d = this.domains[i];
      if (now >= d.until) { this._remove(i); continue; }
      // 周期 Nova（範囲へ氷ダメージ＋冷気。冷気が高い敵ほど freeze しやすい＝baseFreezeChance に加算）。
      if (now >= d.novaAt && novaTicks < novaCap) {
        novaTicks++;
        d.novaAt = now + (area.novaIntervalMs || 620);
        const hg = this.scene.nextHitGroupId();
        this.scene.effects.explosion(d.x, d.y, area.radius || 120, 0x80deea);
        this.scene.combat.forEachEnemyInRadius(d.x, d.y, area.radius || 120, (e) => {
          const boost = (this.evoDef.freeze || {}).chillFreezeBoost || 0;
          const chillR = this.scene.combat.chillRatio ? this.scene.combat.chillRatio(e) : 0;
          const bfc = ((this.evoDef.freeze || {}).baseChance || 0.1) + boost * chillR;
          this.scene.combat.dealDamage(e, dmg.novaDamage || 16, this.id, {
            element: 'ice', chillAmount: (this.evoDef.chill || {}).perNova || 22, baseFreezeChance: bfc,
            procCoefficient: this.evoDef.procCoefficient ?? 0.5, hitGroupId: hg, quiet: true, color: 0x80deea,
          });
        });
      }
      // 周期粉砕（frozen 敵を安全な間隔で・同時上限つき・同じ敵を短時間に連続粉砕しない）。
      if (now >= d.shatterAt) {
        d.shatterAt = now + ((this.evoDef.shatter || {}).intervalMs || 900);
        const perTick = Math.min((this.evoDef.shatter || {}).perTickMax || 3, shCap - shatters);
        let done = 0;
        for (const e of this.scene.combat.enemiesInRadius(d.x, d.y, area.radius || 120)) {
          if (done >= perTick) break;
          if (this.scene.combat.isFrozen(e)) { if (this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: 1 })) { done++; shatters++; } }
        }
      }
    }
  }

  fire(ctx) {
    const cap = this.scene.combat.skillCap('maxAbsoluteZeroDomains', 2);
    while (this.domains.length >= cap) this._remove(0);
    const area = this.evoDef.area || {};
    const p = this.scene.player;
    const spot = this.scene.combat.densestPoint(area.radius || 120, 0) || { x: p.x, y: p.y };
    const gfx = this.scene.add.circle(spot.x, spot.y, area.radius || 120, 0x4fc3f7, 0.10).setDepth(6);
    gfx.setStrokeStyle(1, 0x80deea, 0.4);
    const now = this.scene.time.now;
    this.domains.push({ x: spot.x, y: spot.y, until: now + (area.duration || 4200), novaAt: now, shatterAt: now + ((this.evoDef.shatter || {}).intervalMs || 900), gfx });
  }

  // 残響/複製（custom）: Nova パルスを1回ぶん（周囲へ）。領域は多重生成しない。
  echoCast() {
    const p = this.scene.player; const dmg = this.evoDef.damage || {};
    this.scene.combat.damageArea(p.x, p.y, (this.evoDef.area || {}).radius || 120, dmg.novaDamage || 16, this.id, {
      element: 'ice', chillAmount: (this.evoDef.chill || {}).perNova || 22, baseFreezeChance: (this.evoDef.freeze || {}).baseChance || 0.1,
      procCoefficient: this.evoDef.procCoefficient ?? 0.5, hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x80deea,
    });
  }
  cloneCast() { this.echoCast(); }

  _remove(i) { const d = this.domains[i]; if (d && d.gfx) d.gfx.destroy(); this.domains.splice(i, 1); }
  destroy() { for (const d of this.domains) if (d.gfx) d.gfx.destroy(); this.domains = []; }
}
