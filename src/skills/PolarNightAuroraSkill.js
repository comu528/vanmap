// 極夜天光（aurora_veil の進化・M7-D）: 複数の極光帯が画面を横断し通常 tick でダメージ＋冷気、一定間隔の極夜 burst のみ凍結中の敵を1回粉砕する。
// 一定回数ごとの burst で極光柱が広範囲へダメージ＋冷気を与える。ボスは氷砕ゲージ＋ bossGaugeMult。画面を白くせず status表示/敵弾/boss予告を優先。帯は複数 query へ分割し毎frame全敵走査しない。
// continuous・echo/clone forbidden。主発動時のみ recordCast。Job Lv80 対象外。runtimeState: recastLeft/activeLeft/tickLeft/burstLeft/pillarCounter/phase/layoutIndex（帯/burst/柱を二重生成しない）。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class PolarNightAuroraSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._session = null; this._recastLeft = 0; this._castIndex = 0; }
  canFire() { return false; }

  _bandCount() { return Math.min(this.evoDef.bandCount || 4, this.scene.combat.skillCap('maxPolarNightBands', 6)); }

  _buildBands(count, layoutIndex) {
    const wb = this.scene.combat.worldBounds(); const arr = [];
    for (let i = 0; i < count; i++) { const y = wb.h * ((i + 1) / (count + 1)) + layoutIndex * 20; const gfx = this.scene.add.rectangle(wb.w / 2, y, wb.w, this.evoDef.bandWidth || 64, 0x80d8ff, 0.14).setDepth(3).setStrokeStyle(1, 0xbde8ff, 0.3); arr.push({ y, baseY: y, gfx }); }
    return arr;
  }

  update(dt, ctx) {
    const e = this.evoDef;
    if (this._session) {
      const ss = this._session; ss.activeLeft -= dt; ss.tickLeft -= dt; ss.burstLeft -= dt; ss.phase += dt * 0.001;
      for (const b of ss.bands) { b.y = b.baseY + Math.sin(ss.phase + b.baseY * 0.01) * (e.moveSpeed || 80) * 0.3; if (b.gfx) b.gfx.setY(b.y); }
      if (ss.tickLeft <= 0) { ss.tickLeft = e.tickInterval || 300; this._tick(ss, e); }
      if (ss.burstLeft <= 0) { ss.burstLeft = e.burstInterval || 1000; this._burst(ss, e); }
      if (ss.activeLeft <= 0) { this._endSession(); this._recastLeft = e.recastInterval || 6400; }
      this.scene.skills.recordExtra(this.id, 'activeTime', dt, 'add');
    } else {
      this._recastLeft -= dt;
      if (this._recastLeft <= 0 && (!ctx || ctx.hasEnemies)) this._start(e);
    }
  }

  _start(e) {
    const layoutIndex = this._castIndex % 3;
    this._session = { bands: this._buildBands(this._bandCount(), layoutIndex), activeLeft: e.activeDuration || 5200, tickLeft: 0, burstLeft: e.burstInterval || 1000, pillarCounter: (e.pillar || {}).everyBursts || 3, phase: 0, layoutIndex };
    this._castIndex++;
    this.scene.skills.recordCast(this.id); // 主発動だけ（forbidden のため残響しない）
    this.scene.skills.recordExtra(this.id, 'veilsCast', 1, 'add');
  }

  _tick(ss, e) {
    const wb = this.scene.combat.worldBounds(); const hg = this.scene.nextHitGroupId();
    let queries = 0; const qcap = this.scene.combat.skillCap('maxAuroraQueriesPerTick', 22); const half = (e.bandWidth || 64) / 2 + 8;
    for (const b of ss.bands) {
      if (queries >= qcap) break; queries++;
      for (const en of this.scene.combat.enemiesInRadius(wb.w / 2, b.y, wb.w)) {
        if (!en.alive || Math.abs(en.y - b.y) > half) continue;
        this.scene.combat.dealDamage(en, e.tickDamage || 9, this.id, { element: 'ice', tag: 'dot', chillAmount: (e.chill || {}).tick || 10, baseFreezeChance: 0, procCoefficient: this.evoDef.procCoefficient ?? 0.14, hitGroupId: hg, quiet: true, color: 0x80d8ff, bossGaugeMult: e.bossGaugeMult || 1 });
      }
    }
    this.scene.skills.recordExtra(this.id, 'bandTicks', 1, 'add');
  }

  _burst(ss, e) {
    if (!this.scene.combat.frameBudget('polarBurst', 'maxAuroraBurstsPerFrame')) return;
    const wb = this.scene.combat.worldBounds(); const hg = this.scene.nextHitGroupId(); const half = (e.bandWidth || 64) / 2 + 16;
    for (const b of ss.bands) {
      for (const en of this.scene.combat.enemiesInRadius(wb.w / 2, b.y, wb.w)) {
        if (!en.alive || Math.abs(en.y - b.y) > half) continue;
        if (this.scene.combat.isFrozen(en)) { this.scene.combat.shatterEnemy(en, { skillId: this.id, multiplier: (this.evoDef.shatter || {}).multiplier || 1.6, skillPower: e.burstDamage || 44 }); this.scene.skills.recordExtra(this.id, 'shatters', 1, 'add'); }
        this.scene.combat.dealDamage(en, e.burstDamage || 44, this.id, { element: 'ice', chillAmount: e.burstChill || 28, baseFreezeChance: 0, procCoefficient: this.evoDef.burstProc ?? 0.75, hitGroupId: hg, quiet: true, color: 0x9fe8ff, bossGaugeMult: e.bossGaugeMult || 1 });
      }
    }
    this.scene.skills.recordExtra(this.id, 'burstCount', 1, 'add');
    ss.pillarCounter--;
    if (ss.pillarCounter <= 0) { ss.pillarCounter = (e.pillar || {}).everyBursts || 3; this._pillar(ss, e); }
  }

  // 極光柱: 帯の中央付近へ広範囲ダメージ＋冷気（決定論的に密集地点を選ぶ）。
  _pillar(ss, e) {
    const p = this.evoDef.pillar || {};
    const spot = this.scene.combat.densestPoint(p.radius || 120, 0) || { x: this.scene.player.x, y: this.scene.player.y };
    this.scene.effects.explosion(spot.x, spot.y, p.radius || 120, 0x9fe8ff);
    const hg = this.scene.nextHitGroupId();
    for (const en of this.scene.combat.enemiesInRadius(spot.x, spot.y, p.radius || 120)) { if (this.scene.combat.isFrozen(en)) this.scene.combat.shatterEnemy(en, { skillId: this.id, multiplier: (this.evoDef.shatter || {}).multiplier || 1.6, skillPower: p.damage || 60 }); }
    this.scene.combat.damageArea(spot.x, spot.y, p.radius || 120, p.damage || 60, this.id, { element: 'ice', chillAmount: p.chill || 34, baseFreezeChance: 0, procCoefficient: p.proc || 0.7, hitGroupId: hg, isExplosion: true, color: 0x9fe8ff, bossGaugeMult: e.bossGaugeMult || 1 });
    this.scene.skills.recordExtra(this.id, 'pillarCount', 1, 'add');
  }

  _endSession() { if (this._session) for (const b of this._session.bands) if (b.gfx) b.gfx.destroy(); this._session = null; }

  serializeState() {
    const st = { recastLeft: this._recastLeft, castIndex: this._castIndex };
    if (this._session) { const ss = this._session; st.activeLeft = ss.activeLeft; st.tickLeft = ss.tickLeft; st.burstLeft = ss.burstLeft; st.pillarCounter = ss.pillarCounter; st.phase = ss.phase; st.layoutIndex = ss.layoutIndex; }
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.recastLeft === 'number') this._recastLeft = st.recastLeft;
    if (typeof st.castIndex === 'number') this._castIndex = st.castIndex;
    if (typeof st.activeLeft === 'number' && st.activeLeft > 0) { const e = this.evoDef; this._session = { bands: this._buildBands(this._bandCount(), st.layoutIndex || 0), activeLeft: st.activeLeft, tickLeft: st.tickLeft || 0, burstLeft: st.burstLeft || 0, pillarCounter: st.pillarCounter != null ? st.pillarCounter : ((e.pillar || {}).everyBursts || 3), phase: st.phase || 0, layoutIndex: st.layoutIndex || 0 }; }
  }

  destroy() { this._endSession(); }
}
