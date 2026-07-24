// 氷刻停止（frost_mage・M7-C・legendary）: プレイヤー中心から複数の円形冷気波を時間差で広げる高レア制圧スキル。
// 各波は各敵へ1回だけ命中し、ダメージと大きめの冷気を与える。直接 frozen を強制せず既存 FreezeSystem（guaranteed threshold）に従う。
// ボスは frozen にせず氷砕ゲージへ接続（ボスAI/攻撃タイマーは停止しない）。echo/clone forbidden（全画面制圧を無料複製しない）。
// periodic。recordCast は主発動時に1回（各波では記録しない）。runtimeState: cdLeft/remainingWaves/nextWaveLeft/waveIndex/origin（未発生の波のみ再開）。

import { SkillBase } from './SkillBase.js';

export class FrozenClockSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.waves = []; this._pending = null; } // waves: 発生済みの拡大波（保存しない）
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const p = this.scene.player;
    this._pending = { remaining: s.waveCount || 3, nextWaveLeft: 0, waveIndex: 0, ox: p.x, oy: p.y };
    this.scene.skills.recordExtra(this.id, 'clocksCast', 1, 'add');
  }

  _spawnWave(ox, oy, s) {
    const cap = this.scene.combat.skillCap('maxFrozenClockWaves', 6);
    if (this.waves.length >= cap) return;
    const base = 8;
    const gfx = this.scene.add.circle(ox, oy, base, 0x80d8ff, 0).setDepth(3).setStrokeStyle(3, 0xbde8ff, 0.7);
    this.waves.push({ ox, oy, radius: base, base, maxRadius: s.maxRadius || 280, hitSet: new Set(), gfx });
    this.scene.skills.recordExtra(this.id, 'wavesEmitted', 1, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（波の予約）
    const s = this.stats;
    if (this._pending) {
      this._pending.nextWaveLeft -= dt;
      if (this._pending.nextWaveLeft <= 0 && this._pending.remaining > 0) {
        this._spawnWave(this._pending.ox, this._pending.oy, s);
        this._pending.remaining--; this._pending.waveIndex++; this._pending.nextWaveLeft = s.waveInterval || 300;
        if (this._pending.remaining <= 0) this._pending = null;
      }
    }
    const step = (s.waveSpeed || 300) * dt / 1000;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.radius += step;
      if (w.gfx) w.gfx.setScale(w.radius / w.base);
      this._waveHit(w, s);
      if (w.radius >= w.maxRadius) { if (w.gfx) w.gfx.destroy(); this.waves.splice(i, 1); }
    }
  }

  _waveHit(w, s) {
    const band = 26;
    const hg = this.scene.nextHitGroupId();
    let hits = 0; const cap = this.scene.combat.skillCap('maxFrozenClockHitsPerFrame', 72);
    for (const e of this.scene.combat.enemiesInRadius(w.ox, w.oy, w.radius + band)) {
      if (!e.alive || w.hitSet.has(e)) continue;
      const d = Math.hypot(e.x - w.ox, e.y - w.oy);
      if (d < w.radius - band || d > w.radius + band) continue;
      if (hits >= cap) { if (this.scene._m) this.scene._m.suppressed++; break; }
      hits++; w.hitSet.add(e);
      // 直接 frozen を強制せず、冷気付与→FreezeSystem に委譲（baseFreezeChance:0＝guaranteed threshold のみ）。
      // ボスへは Lv別 bossGaugeMult ぶん氷砕ゲージを増やす（冷気/damage/proc には掛からない・dealDamage 側でボス分岐のみ適用）。
      this.scene.combat.dealDamage(e, s.damage, this.id, {
        element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.65,
        hitGroupId: hg, quiet: true, color: 0xbde8ff, bossGaugeMult: s.bossGaugeMult || 1,
      });
      this.scene.skills.recordExtra(this.id, 'enemiesHit', 1, 'add');
    }
  }

  // echo/clone forbidden（全画面制圧を無料複製しない）。

  // 途中再開: 未発生の波のみ再開（発生済みの波は再発生しない・二重発生しない）。
  serializeState() {
    const st = { cdLeft: this._cd };
    if (this._pending) { st.remainingWaves = this._pending.remaining; st.nextWaveLeft = this._pending.nextWaveLeft; st.waveIndex = this._pending.waveIndex; st.castOriginX = this._pending.ox; st.castOriginY = this._pending.oy; }
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    if (typeof st.remainingWaves === 'number' && st.remainingWaves > 0) {
      this._pending = { remaining: st.remainingWaves, nextWaveLeft: st.nextWaveLeft || 0, waveIndex: st.waveIndex || 0, ox: st.castOriginX != null ? st.castOriginX : this.scene.player.x, oy: st.castOriginY != null ? st.castOriginY : this.scene.player.y };
    }
  }

  destroy() { for (const w of this.waves) if (w.gfx) w.gfx.destroy(); this.waves = []; this._pending = null; }
}
