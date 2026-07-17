// 雹嵐（frost_mage・M7-B）: 敵密集地点へ一定時間、雹を降らせる。落下地点で小範囲ダメージと冷気、frozen 敵へ追加ダメージ。
// 雹1個ごとの凍結確率は低め。落下位置は決定論的（黄金角による分布・RNG不使用）。同一フレーム凍結判定数に上限。
// periodic: クールダウンで嵐を設置（fire）。recordCast は嵐設置時に1回。雹落下ごとには記録しない。

import { SkillBase } from './SkillBase.js';

const GOLDEN = 2.399963229728653; // 黄金角（決定論的な均等分布）

export class HailstormSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.storms = []; }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats;
    const cap = this.scene.combat.skillCap('maxHailstorms', 4);
    const want = Math.min(s.simultaneousStorms || 1, Math.max(1, cap - this.storms.length));
    const now = this.scene.time.now;
    let created = 0;
    for (let i = 0; i < want; i++) {
      if (this.storms.length >= cap) break;
      const spot = this.scene.combat.densestPoint(s.stormRadius || 100, i) || { x: this.scene.player.x, y: this.scene.player.y };
      const gfx = this.scene.add.circle(spot.x, spot.y, s.stormRadius || 100, 0x4fc3f7, 0.08).setDepth(5);
      gfx.setStrokeStyle(1, 0x9fe8ff, 0.3);
      this.storms.push({ x: spot.x, y: spot.y, until: now + (s.duration || 3000), dropAt: now, seq: 0, gfx });
      created++;
    }
    if (created) this.scene.skills.recordExtra(this.id, 'stormsCreated', created, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    const now = this.scene.time.now;
    const s = this.stats;
    let impacts = 0;
    const impactCap = this.scene.combat.skillCap('maxHailImpactsPerFrame', 20);
    for (let i = this.storms.length - 1; i >= 0; i--) {
      const st = this.storms[i];
      if (now >= st.until) { if (st.gfx) st.gfx.destroy(); this.storms.splice(i, 1); continue; }
      if (now < st.dropAt) continue;
      if (impacts >= impactCap) { if (this.scene._m) this.scene._m.suppressed++; continue; }
      impacts++;
      st.dropAt = now + (s.impactIntervalMs || 150);
      // 決定論的な落下位置（黄金角で嵐半径内へ均等分布）。
      const k = st.seq++;
      const ang = k * GOLDEN;
      const dist = (s.stormRadius || 100) * Math.sqrt((k % 7) / 7);
      const hx = st.x + Math.cos(ang) * dist, hy = st.y + Math.sin(ang) * dist;
      this._impact(hx, hy, s);
    }
  }

  _impact(x, y, s) {
    this.scene.effects.explosion(x, y, s.impactRadius || 30, 0x9fe8ff);
    const hg = this.scene.nextHitGroupId();
    this.scene.combat.forEachEnemyInRadius(x, y, s.impactRadius || 30, (e) => {
      let dmg = s.damage;
      if (this.scene.combat.isFrozen(e)) dmg *= (1 + (s.frozenBonus || 0));
      this.scene.combat.dealDamage(e, dmg, this.id, {
        element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: s.baseFreezeChance,
        procCoefficient: this.def?.procCoefficient ?? 0.22, hitGroupId: hg, quiet: true, color: 0x9fe8ff,
      });
    });
    this.scene.skills.recordExtra(this.id, 'hailImpacts', 1, 'add');
  }

  // 残響/複製（custom）: 追加の雹を1回だけ落とす（嵐そのものは多重生成しない）。
  echoCast() {
    const s = this.stats; const p = this.scene.player;
    const spot = this.scene.combat.densestPoint(s.impactRadius || 30, 0) || { x: p.x, y: p.y };
    this._impact(spot.x, spot.y, s);
  }
  cloneCast() { this.echoCast(); }

  // 途中再開でクールダウンのみ維持（嵐/雹の位置は保存せず＝再開後に安全再構築・無料再設置しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }

  destroy() { for (const st of this.storms) if (st.gfx) st.gfx.destroy(); this.storms = []; }
}
