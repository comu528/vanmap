// 零刻世界（frozen_clock の進化・M7-C）: プレイヤー中心から複数の巨大時計波を放ち、各波でダメージと冷気を与える。
// 最終波のみ高冷気の敵へ追加の凍結判定を行う（既存 guaranteed threshold と FreezeSystem を使用・直接状態を書き換えない）。
// frozen 中の通常敵へ時間延長しない。ボスは frozen にせず大きめの氷砕ゲージへ接続し、ボスAI は直接停止しない。最終波で frostbreak が起きても既存 cooldown/threshold/vulnerability 仕様を維持。
// periodic・echo/clone forbidden（全画面制圧を無料複製しない）。main cast 時のみ recordCast。Job Lv80 対象外。runtimeState: cdLeft/remaining/nextWaveLeft/currentWaveIndex/origin（未発生波のみ再開）。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class ZeroHourWorldSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.waves = []; this._pending = null; }

  fire() {
    const p = this.scene.player;
    const total = this.evoDef.waveCount || 6;
    this._pending = { remaining: total, total, nextWaveLeft: 0, waveIndex: 0, ox: p.x, oy: p.y };
    this.scene.skills.recordExtra(this.id, 'clocksCast', 1, 'add');
  }

  _spawnWave(ox, oy, isFinal) {
    const cap = Math.min(this.cap('maxWaves', 8), this.scene.combat.skillCap('maxZeroHourWorldWaves', 8));
    if (this.waves.length >= cap) return;
    const base = 8;
    const gfx = this.scene.add.circle(ox, oy, base, 0x80d8ff, 0).setDepth(3).setStrokeStyle(4, 0xe1f5fe, 0.75);
    this.waves.push({ ox, oy, radius: base, base, maxRadius: this.evoDef.maxRadius || 340, hitSet: new Set(), isFinal, gfx });
    this.scene.skills.recordExtra(this.id, 'wavesEmitted', 1, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()
    if (this._pending) {
      this._pending.nextWaveLeft -= dt;
      if (this._pending.nextWaveLeft <= 0 && this._pending.remaining > 0) {
        const isFinal = this._pending.remaining === 1;
        this._spawnWave(this._pending.ox, this._pending.oy, isFinal);
        this._pending.remaining--; this._pending.waveIndex++; this._pending.nextWaveLeft = this.evoDef.waveInterval || 280;
        if (this._pending.remaining <= 0) this._pending = null;
      }
    }
    const step = (this.evoDef.waveSpeed || 340) * dt / 1000;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.radius += step;
      if (w.gfx) w.gfx.setScale(w.radius / w.base);
      this._waveHit(w);
      if (w.radius >= w.maxRadius) { if (w.gfx) w.gfx.destroy(); this.waves.splice(i, 1); }
    }
  }

  _waveHit(w) {
    const band = 30; const hg = this.scene.nextHitGroupId();
    let hits = 0; const cap = this.scene.combat.skillCap('maxFrozenClockHitsPerFrame', 72);
    const chill = (this.evoDef.chill || {}).amount || 40;
    const finalBonus = (this.evoDef.chill || {}).finalWaveBonus || 20;
    // 最終波のみ高冷気の敵へ追加の凍結判定（既存 FreezeSystem 経由・直接凍結しない）。
    const finalChance = w.isFinal ? ((this.evoDef.freeze || {}).baseChance || 0.12) : 0;
    for (const e of this.scene.combat.enemiesInRadius(w.ox, w.oy, w.radius + band)) {
      if (!e.alive || w.hitSet.has(e)) continue;
      const d = Math.hypot(e.x - w.ox, e.y - w.oy);
      if (d < w.radius - band || d > w.radius + band) continue;
      if (hits >= cap) { if (this.scene._m) this.scene._m.suppressed++; break; }
      hits++; w.hitSet.add(e);
      // 最終波は高冷気対象のみ凍結判定（それ以外は baseFreezeChance:0＝guaranteed threshold のみ）。
      const highChill = this.scene.combat.chillRatio(e) >= 0.6;
      const chance = (w.isFinal && highChill) ? finalChance : 0;
      this.scene.combat.dealDamage(e, this.evoDef.damage || 44, this.id, {
        element: 'ice', chillAmount: chill + (w.isFinal ? finalBonus : 0), baseFreezeChance: chance,
        procCoefficient: this.evoDef.procCoefficient ?? 0.65, hitGroupId: hg, quiet: true, color: 0xe1f5fe,
      });
      this.scene.skills.recordExtra(this.id, 'enemiesHit', 1, 'add');
    }
  }

  // echo/clone forbidden（全画面制圧を無料複製しない）。

  serializeState() {
    const st = { cdLeft: this._cd };
    if (this._pending) { st.remainingWaves = this._pending.remaining; st.totalWaves = this._pending.total; st.nextWaveLeft = this._pending.nextWaveLeft; st.waveIndex = this._pending.waveIndex; st.castOriginX = this._pending.ox; st.castOriginY = this._pending.oy; }
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    if (typeof st.remainingWaves === 'number' && st.remainingWaves > 0) {
      this._pending = { remaining: st.remainingWaves, total: st.totalWaves || (this.evoDef.waveCount || 6), nextWaveLeft: st.nextWaveLeft || 0, waveIndex: st.waveIndex || 0, ox: st.castOriginX != null ? st.castOriginX : this.scene.player.x, oy: st.castOriginY != null ? st.castOriginY : this.scene.player.y };
    }
  }

  destroy() { for (const w of this.waves) if (w.gfx) w.gfx.destroy(); this.waves = []; this._pending = null; }
}
