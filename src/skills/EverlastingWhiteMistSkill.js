// 永久白霧（snowblind_mist の進化・M7-C）: より広い白霧が長時間追従し、通常 tick に加えて一定間隔で大きな冷気の whiteout パルスを放つ。
// 直接凍結はせず FreezeSystem を使う。frozen 対象へダメージボーナスを与えるが粉砕しない。ボスは氷砕ゲージへ接続。particle 密度は品質別。DoT tick では recordCast しない。
// continuous・custom echo/clone。main cast（主霧生成）時のみ recordCast。Job Lv80 対象外。runtimeState: cdLeft/activeLeft/centerX/centerY/tickLeft/whiteoutLeft。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class EverlastingWhiteMistSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._mist = null; }
  canFire(ctx) { return ctx.hasEnemies && !this._mist; }

  fire() {
    const spot = this.scene.combat.densestPoint(this.evoDef.radius || 130, 0) || { x: this.scene.player.x, y: this.scene.player.y };
    this._mist = { activeLeft: this.evoDef.activeDuration || 5200, cx: spot.x, cy: spot.y, tickLeft: 0, whiteoutLeft: this.evoDef.whiteoutIntervalMs || 1400, gfx: this._mkGfx(spot.x, spot.y) };
    this.scene.skills.recordExtra(this.id, 'mistsCast', 1, 'add');
  }

  _mkGfx(x, y) { return this.scene.add.circle(x, y, this.evoDef.radius || 130, 0xe1f5fe, 0.12).setDepth(4).setStrokeStyle(1, 0xb3e5fc, 0.4); }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()
    const m = this._mist; if (!m) return;
    const r = this.evoDef.radius || 130;
    m.activeLeft -= dt; m.tickLeft -= dt; m.whiteoutLeft -= dt;
    const spot = this.scene.combat.densestPoint(r, 0);
    if (spot) { const sp = (this.evoDef.followSpeed || 110) * dt / 1000; const dx = spot.x - m.cx, dy = spot.y - m.cy; const d = Math.hypot(dx, dy); if (d > 0.001) { const mv = Math.min(sp, d); m.cx += dx / d * mv; m.cy += dy / d * mv; } }
    if (m.gfx) m.gfx.setPosition(m.cx, m.cy).setAlpha(0.10 + 0.05 * Math.sin(this.scene.time.now * 0.004));
    if (m.tickLeft <= 0 && m.activeLeft > 0) { m.tickLeft = this.evoDef.interval || 300; this._tick(m.cx, m.cy, false); }
    if (m.whiteoutLeft <= 0 && m.activeLeft > 0) { m.whiteoutLeft = this.evoDef.whiteoutIntervalMs || 1400; this._tick(m.cx, m.cy, true); }
    this.scene.skills.recordExtra(this.id, 'mistActiveTime', dt, 'add');
    if (m.activeLeft <= 0) { if (m.gfx) m.gfx.destroy(); this._mist = null; }
  }

  _tick(cx, cy, whiteout) {
    const r = this.evoDef.radius || 130; const hg = this.scene.nextHitGroupId();
    const capName = whiteout ? 'maxWhiteoutPulsesPerFrame' : 'maxTicksPerFrame';
    let hit = 0; const cap = this.scene.combat.skillCap('maxEverlastingMistTicksPerFrame', 22);
    const chill = whiteout ? ((this.evoDef.chill || {}).whiteout || 26) : ((this.evoDef.chill || {}).tick || 10);
    const dmg = whiteout ? (this.evoDef.tickDamage || 9) * 1.4 : (this.evoDef.tickDamage || 9);
    for (const e of this.scene.combat.enemiesInRadius(cx, cy, r)) {
      if (!e.alive) continue;
      if (hit >= cap) { if (this.scene._m) this.scene._m.suppressed++; break; }
      hit++;
      let dd = dmg; if (this.scene.combat.isChilled(e)) dd *= (1 + (this.evoDef.chilledDamageBonus || 0));
      this.scene.combat.dealDamage(e, dd, this.id, {
        element: 'ice', tag: 'dot', chillAmount: chill, baseFreezeChance: 0, procCoefficient: this.evoDef.procCoefficient ?? 0.14,
        hitGroupId: hg, quiet: true, color: 0xe1f5fe,
      });
    }
    if (hit) this.scene.skills.recordExtra(this.id, whiteout ? 'whiteoutPulses' : 'mistTicks', 1, 'add');
    void capName;
  }

  // 残響/複製（custom）: 単発の whiteout パルス（主霧を重複生成しない）。
  echoCast() { const spot = this.scene.combat.densestPoint(this.evoDef.radius || 130, 0); if (spot) this._tick(spot.x, spot.y, true); }
  cloneCast() { this.echoCast(); }

  serializeState() {
    const st = { cdLeft: this._cd };
    if (this._mist) { st.activeLeft = this._mist.activeLeft; st.centerX = this._mist.cx; st.centerY = this._mist.cy; st.tickLeft = this._mist.tickLeft; st.whiteoutLeft = this._mist.whiteoutLeft; }
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    if (this._mist) { if (this._mist.gfx) this._mist.gfx.destroy(); this._mist = null; }
    if (typeof st.activeLeft === 'number' && st.activeLeft > 0) {
      const cx = st.centerX != null ? st.centerX : this.scene.player.x, cy = st.centerY != null ? st.centerY : this.scene.player.y;
      this._mist = { activeLeft: st.activeLeft, cx, cy, tickLeft: st.tickLeft || 0, whiteoutLeft: st.whiteoutLeft || 0, gfx: this._mkGfx(cx, cy) };
    }
  }

  destroy() { if (this._mist && this._mist.gfx) this._mist.gfx.destroy(); this._mist = null; }
}
