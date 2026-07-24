// 極光氷幕（frost_mage・M7-D・legendary・continuous）: 画面を横断する複数のオーロラ帯が揺らぎながら移動し、tick ごとに帯範囲へダメージと冷気を与える広域スキル。
// 一定間隔の aurora burst のみ凍結中の敵を1回粉砕する。ボスは氷砕ゲージ＋ bossGaugeMult。帯は複数の SpatialGrid query へ分割し、毎frame全敵総当たりしない。配置は castIndex/bandIndex から決定論。
// echo/clone forbidden。recordCast は主発動時に1回（tick/burst/粉砕では記録しない）。runtimeState: recastLeft/activeLeft/tickLeft/burstLeft/phase/castIndex/layoutIndex。

import { SkillBase } from './SkillBase.js';

export class AuroraVeilSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._session = null; this._recastLeft = 0; this._castIndex = 0; }
  canFire() { return false; }

  update(dt, ctx) {
    const s = this.stats;
    if (this._session) {
      const ss = this._session; ss.activeLeft -= dt; ss.tickLeft -= dt; ss.burstLeft -= dt; ss.phase += dt * 0.001;
      this._moveBands(ss, s);
      if (ss.tickLeft <= 0) { ss.tickLeft = s.tickInterval || 360; this._tick(ss, s); }
      if (ss.burstLeft <= 0) { ss.burstLeft = s.burstInterval || 1200; this._burst(ss, s); }
      if (ss.activeLeft <= 0) { this._endSession(); this._recastLeft = s.recastInterval || 7000; }
      this.scene.skills.recordExtra(this.id, 'activeTime', dt, 'add');
    } else {
      this._recastLeft -= dt;
      if (this._recastLeft <= 0 && (!ctx || ctx.hasEnemies)) this._startSession(s);
    }
  }

  _bandCount(s) { return Math.min(s.bandCount || 2, this.scene.combat.skillCap('maxAuroraBands', 6)); }

  _buildBands(count, layoutIndex, s) {
    const wb = this.scene.combat.worldBounds(); const arr = [];
    for (let i = 0; i < count; i++) {
      const y = wb.h * ((i + 1) / (count + 1)) + layoutIndex * 20;
      const gfx = this.scene.add.rectangle(wb.w / 2, y, wb.w, s.bandWidth || 50, 0x80d8ff, 0.14).setDepth(3).setStrokeStyle(1, 0xbde8ff, 0.3);
      arr.push({ y, baseY: y, gfx });
    }
    return arr;
  }

  _startSession(s) {
    const layoutIndex = this._castIndex % 3;
    this._session = { bands: this._buildBands(this._bandCount(s), layoutIndex, s), activeLeft: s.activeDuration || 3800, tickLeft: 0, burstLeft: s.burstInterval || 1200, phase: 0, castIndex: this._castIndex, layoutIndex };
    this._castIndex++;
    this.scene.skills.recordCast(this.id); // 主発動だけ（forbidden のため残響しない）
    this.scene.skills.recordExtra(this.id, 'veilsCast', 1, 'add');
  }

  _moveBands(ss, s) { for (const b of ss.bands) { b.y = b.baseY + Math.sin(ss.phase + b.baseY * 0.01) * (s.moveSpeed || 60) * 0.3; if (b.gfx) b.gfx.setY(b.y); } }

  _tick(ss, s) {
    const wb = this.scene.combat.worldBounds(); const hg = this.scene.nextHitGroupId();
    let queries = 0; const qcap = this.scene.combat.skillCap('maxAuroraQueriesPerTick', 22);
    const half = (s.bandWidth || 50) / 2 + 8;
    for (const b of ss.bands) {
      if (queries >= qcap) break; queries++;
      for (const e of this.scene.combat.enemiesInRadius(wb.w / 2, b.y, wb.w)) {
        if (!e.alive || Math.abs(e.y - b.y) > half) continue;
        this.scene.combat.dealDamage(e, s.tickDamage, this.id, {
          element: 'ice', tag: 'dot', chillAmount: s.chillAmount, baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.14,
          hitGroupId: hg, quiet: true, color: 0x80d8ff, bossGaugeMult: s.bossGaugeMult || 1,
        });
      }
    }
    this.scene.skills.recordExtra(this.id, 'bandTicks', 1, 'add');
  }

  _burst(ss, s) {
    if (!this.scene.combat.frameBudget('auroraBurst', 'maxAuroraBurstsPerFrame')) return;
    const wb = this.scene.combat.worldBounds(); const hg = this.scene.nextHitGroupId();
    const half = (s.bandWidth || 50) / 2 + 16;
    for (const b of ss.bands) {
      for (const e of this.scene.combat.enemiesInRadius(wb.w / 2, b.y, wb.w)) {
        if (!e.alive || Math.abs(e.y - b.y) > half) continue;
        // burst のみ凍結中の敵を粉砕（1 burst 1体1回）。
        if (this.scene.combat.isFrozen(e)) { this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: this.def?.config?.shatterMultiplier || 1.5, skillPower: s.burstDamage }); this.scene.skills.recordExtra(this.id, 'shatters', 1, 'add'); }
        this.scene.combat.dealDamage(e, s.burstDamage, this.id, {
          element: 'ice', chillAmount: s.burstChill, baseFreezeChance: 0, procCoefficient: this.def?.config?.burstProc ?? 0.75,
          hitGroupId: hg, quiet: true, color: 0x9fe8ff, bossGaugeMult: s.bossGaugeMult || 1,
        });
      }
    }
    this.scene.skills.recordExtra(this.id, 'burstCount', 1, 'add');
  }

  _endSession() { if (this._session) for (const b of this._session.bands) if (b.gfx) b.gfx.destroy(); this._session = null; }

  // echo/clone forbidden（全画面制圧を無料複製しない）。

  serializeState() {
    const st = { recastLeft: this._recastLeft, castIndex: this._castIndex };
    if (this._session) { const ss = this._session; st.activeLeft = ss.activeLeft; st.tickLeft = ss.tickLeft; st.burstLeft = ss.burstLeft; st.phase = ss.phase; st.layoutIndex = ss.layoutIndex; st.sessionCastIndex = ss.castIndex; }
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.recastLeft === 'number') this._recastLeft = st.recastLeft;
    if (typeof st.castIndex === 'number') this._castIndex = st.castIndex;
    if (typeof st.activeLeft === 'number' && st.activeLeft > 0) {
      const s = this.stats;
      this._session = { bands: this._buildBands(this._bandCount(s), st.layoutIndex || 0, s), activeLeft: st.activeLeft, tickLeft: st.tickLeft || 0, burstLeft: st.burstLeft || 0, phase: st.phase || 0, castIndex: st.sessionCastIndex || 0, layoutIndex: st.layoutIndex || 0 };
    }
  }

  destroy() { this._endSession(); }
}
