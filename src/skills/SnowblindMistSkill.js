// 白霧氷界（frost_mage・M7-C・uncommon）: 一定時間、敵密集地点へ白い冷気の霧を生成し、滑らかに敵集団を追従する。
// tick ごとに範囲ダメージと冷気を与え、高冷気の敵へ追加ダメージ。新しい状態異常は追加せず、既存の冷気/減速経路のみ使う。frozen 対象への粉砕は行わない。
// continuous。recordCast は主霧生成時に1回（各 tick では記録しない）。runtimeState: cdLeft/activeLeft/centerX/centerY/tickLeft。

import { SkillBase } from './SkillBase.js';

export class SnowblindMistSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._mist = null; } // { activeLeft, cx, cy, tickLeft, gfx }
  canFire(ctx) { return ctx.hasEnemies && !this._mist; } // 主霧が生存中は新規生成しない（重複しない）

  fire() {
    const s = this.stats;
    const spot = this.scene.combat.densestPoint(s.radius || 90, 0) || { x: this.scene.player.x, y: this.scene.player.y };
    this._mist = { activeLeft: s.activeDuration || 3000, cx: spot.x, cy: spot.y, tickLeft: 0, gfx: this._mkGfx(spot.x, spot.y, s.radius || 90) };
    this.scene.skills.recordExtra(this.id, 'mistsCast', 1, 'add');
  }

  _mkGfx(x, y, r) { return this.scene.add.circle(x, y, r, 0xe1f5fe, 0.12).setDepth(4).setStrokeStyle(1, 0xb3e5fc, 0.4); }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（主霧生成）
    const m = this._mist; if (!m) return;
    const s = this.stats;
    m.activeLeft -= dt; m.tickLeft -= dt;
    // 追従: 密集地点へ滑らかに移動（瞬間移動しない）。
    const spot = this.scene.combat.densestPoint(s.radius || 90, 0);
    if (spot) {
      const sp = (s.followSpeed || 80) * dt / 1000;
      const dx = spot.x - m.cx, dy = spot.y - m.cy; const d = Math.hypot(dx, dy);
      if (d > 0.001) { const mv = Math.min(sp, d); m.cx += dx / d * mv; m.cy += dy / d * mv; }
    }
    if (m.gfx) m.gfx.setPosition(m.cx, m.cy).setAlpha(0.10 + 0.05 * Math.sin(this.scene.time.now * 0.004));
    if (m.tickLeft <= 0 && m.activeLeft > 0) { m.tickLeft = s.interval || 360; this._tick(m.cx, m.cy, s); }
    this.scene.skills.recordExtra(this.id, 'mistActiveTime', dt, 'add');
    if (m.activeLeft <= 0) { if (m.gfx) m.gfx.destroy(); this._mist = null; }
  }

  _tick(cx, cy, s) {
    const hg = this.scene.nextHitGroupId(); const r = s.radius || 90;
    let hit = 0; const cap = this.scene.combat.skillCap('maxSnowblindMistTicksPerFrame', 16);
    for (const e of this.scene.combat.enemiesInRadius(cx, cy, r)) {
      if (!e.alive) continue;
      if (hit >= cap) { if (this.scene._m) this.scene._m.suppressed++; break; }
      hit++;
      let dmg = s.tickDamage;
      if (this.scene.combat.isChilled(e)) dmg *= (1 + (s.chilledDamageBonus || 0));
      this.scene.combat.dealDamage(e, dmg, this.id, {
        element: 'ice', tag: 'dot', chillAmount: s.chillAmount, baseFreezeChance: 0,
        procCoefficient: this.def?.procCoefficient ?? 0.14, hitGroupId: hg, quiet: true, color: 0xe1f5fe,
      });
      this.scene.skills.recordExtra(this.id, 'targetsChilled', 1, 'add');
    }
    if (hit) this.scene.skills.recordExtra(this.id, 'mistTicks', 1, 'add');
  }

  // 残響/複製（custom）: 単発の冷気パルス（主霧を重複生成しない）。
  echoCast() { const s = this.stats; const spot = this.scene.combat.densestPoint(s.radius || 90, 0); if (spot) this._tick(spot.x, spot.y, s); }
  cloneCast() { this.echoCast(); }

  // 途中再開: cdLeft と、activeLeft>0 なら主霧を1つだけ再構築（二重生成しない・particle は再生成）。
  serializeState() {
    const st = { cdLeft: this._cd };
    if (this._mist) { st.activeLeft = this._mist.activeLeft; st.centerX = this._mist.cx; st.centerY = this._mist.cy; st.tickLeft = this._mist.tickLeft; }
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    if (this._mist) { if (this._mist.gfx) this._mist.gfx.destroy(); this._mist = null; }
    if (typeof st.activeLeft === 'number' && st.activeLeft > 0) {
      const s = this.stats; const cx = st.centerX != null ? st.centerX : this.scene.player.x, cy = st.centerY != null ? st.centerY : this.scene.player.y;
      this._mist = { activeLeft: st.activeLeft, cx, cy, tickLeft: st.tickLeft || 0, gfx: this._mkGfx(cx, cy, s.radius || 90) };
    }
  }

  destroy() { if (this._mist && this._mist.gfx) this._mist.gfx.destroy(); this._mist = null; }
}
