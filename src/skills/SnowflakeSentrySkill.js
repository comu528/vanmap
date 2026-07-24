// 六花砲台（frost_mage・M7-D・uncommon）: 地面へ氷晶砲台を設置し（continuous・deployInterval ごとに1基・maxSentries まで）、
// 凍結していない高冷気の敵を優先して氷弾で射撃する。一定射撃ごとに低procの六花パルス。砲台弾は粉砕しない。ボスへも射撃し氷砕ゲージへ接続。
// recordCast は主砲台設置時に1回（射撃/パルス/命中では記録しない）。runtimeState: deployLeft/nextInstanceId＋生存砲台（instanceId/x/y/activeLeft/shotLeft/pulseカウンタ）。

import { SkillBase } from './SkillBase.js';

export class SnowflakeSentrySkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.sentries = []; this._deployLeft = 0; this._nextId = 1; }
  canFire() { return false; } // deploy は update 内で自前管理（SkillBase クールダウンを使わない）

  update(dt, ctx) {
    const s = this.stats;
    const cap = Math.min(s.maxSentries || 2, this.scene.combat.skillCap('maxSnowflakeSentries', 4));
    this._deployLeft -= dt;
    if (this._deployLeft <= 0) {
      this._deployLeft = s.deployInterval || 1400;
      if ((!ctx || ctx.hasEnemies) && this.sentries.length < cap) this._deploy(s);
    }
    while (this.sentries.length > cap) { const old = this.sentries.shift(); if (old && old.gfx) old.gfx.destroy(); } // 上限超過（quality変更）で最古を安全置換
    let active = 0;
    for (let i = this.sentries.length - 1; i >= 0; i--) {
      const t = this.sentries[i]; t.activeLeft -= dt; t.shotLeft -= dt;
      if (t.gfx) t.gfx.setAlpha(0.5 + 0.3 * Math.abs(Math.sin(this.scene.time.now * 0.005)));
      if (t.activeLeft <= 0) { if (t.gfx) t.gfx.destroy(); this.sentries.splice(i, 1); continue; }
      active++;
      if (t.shotLeft <= 0) { t.shotLeft = s.attackInterval || 600; this._shoot(t, s); }
    }
    this.scene.skills.recordExtra(this.id, 'activeTime', dt * active, 'add');
  }

  _deploy(s) {
    const p = this.scene.player;
    const spot = this.scene.combat.densestPoint(s.seekRange || 200, this.sentries.length % 3) || { x: p.x + 20, y: p.y };
    const gfx = this.scene.add.image(spot.x, spot.y, 'icon_snowflake_sentry').setDepth(42).setScale(0.6).setAlpha(0.7).setTint(0xbde8ff);
    this.sentries.push({ instanceId: this._nextId++, x: spot.x, y: spot.y, activeLeft: s.activeDuration || 3000, shotLeft: 0, shotsUntilPulse: s.pulseEvery || 4, deployIndex: this.sentries.length, gfx });
    this.scene.skills.recordCast(this.id); // 主砲台設置時だけ（custom echo/clone のみ）
    this.scene.skills.recordExtra(this.id, 'sentriesPlaced', 1, 'add');
  }

  _shoot(t, s) {
    const target = this._pickTarget(t, s.seekRange || 200);
    if (!target) return;
    const ang = Math.atan2(target.y - t.y, target.x - t.x);
    this.scene.combat.spawnPlayerProjectile(t.x, t.y, ang, s.projectileSpeed || 340, {
      skillId: this.id, element: 'ice', damage: s.projectileDamage, pierce: 0,
      chillAmount: s.chillAmount, baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.35,
      hitGroupId: this.scene.nextHitGroupId(), scale: 0.5, lifeMs: 1000, tint: 0xbde8ff,
    });
    this.scene.skills.recordExtra(this.id, 'shotsFired', 1, 'add');
    t.shotsUntilPulse--;
    if (t.shotsUntilPulse <= 0) { t.shotsUntilPulse = s.pulseEvery || 4; this._pulse(t, s); }
  }

  // target 優先: 1) 非frozen高chill 2) 高chill 3) 近い。同点は entity 順（_seq→x→y）。
  _pickTarget(t, range) {
    const cand = [];
    for (const e of this.scene.combat.enemiesInRadius(t.x, t.y, range)) {
      if (!e.alive) continue;
      const chill = this.scene.combat.chillOf(e); const frozen = this.scene.combat.isFrozen(e);
      const d2 = (e.x - t.x) * (e.x - t.x) + (e.y - t.y) * (e.y - t.y);
      cand.push({ e, score: (frozen ? 1e9 : 0) - chill * 1000 + d2 * 0.001 });
    }
    cand.sort((a, b) => a.score - b.score || (a.e._seq ?? 0) - (b.e._seq ?? 0) || a.e.x - b.e.x || a.e.y - b.e.y);
    return cand.length ? cand[0].e : null;
  }

  _pulse(t, s) {
    this.scene.combat.damageArea(t.x, t.y, s.pulseRadius || 50, s.pulseDamage, this.id, {
      element: 'ice', tag: 'dot', chillAmount: s.pulseChill, procCoefficient: this.def?.config?.pulseProc ?? 0.18,
      hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x80d8ff,
    });
    this.scene.skills.recordExtra(this.id, 'pulseCount', 1, 'add');
  }

  // 残響/複製（custom）: 単発の六花パルス（常設砲台を無料増殖しない）。
  echoCast() { const s = this.stats; const p = this.scene.player; const spot = this.scene.combat.densestPoint(s.seekRange || 200, 0) || { x: p.x, y: p.y }; this._pulse({ x: spot.x, y: spot.y }, s); }
  cloneCast() { this.echoCast(); }

  serializeState() {
    return { deployLeft: this._deployLeft, nextInstanceId: this._nextId, sentries: this.sentries.map((t) => ({ instanceId: t.instanceId, x: t.x, y: t.y, activeLeft: t.activeLeft, shotLeft: t.shotLeft, shotsUntilPulse: t.shotsUntilPulse, deployIndex: t.deployIndex })) };
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.deployLeft === 'number') this._deployLeft = st.deployLeft;
    if (typeof st.nextInstanceId === 'number') this._nextId = st.nextInstanceId;
    if (Array.isArray(st.sentries)) {
      const pulseEvery = this.stats?.pulseEvery || 4;
      for (const t of this.sentries) if (t.gfx) t.gfx.destroy();
      this.sentries = [];
      for (const t of st.sentries) {
        if (t.activeLeft > 0) {
          const gfx = this.scene.add.image(t.x, t.y, 'icon_snowflake_sentry').setDepth(42).setScale(0.6).setAlpha(0.7).setTint(0xbde8ff);
          this.sentries.push({ instanceId: t.instanceId, x: t.x, y: t.y, activeLeft: t.activeLeft, shotLeft: t.shotLeft || 0, shotsUntilPulse: t.shotsUntilPulse != null ? t.shotsUntilPulse : pulseEvery, deployIndex: t.deployIndex || 0, gfx });
        }
      }
    }
  }

  destroy() { for (const t of this.sentries) if (t.gfx) t.gfx.destroy(); this.sentries = []; }
}
