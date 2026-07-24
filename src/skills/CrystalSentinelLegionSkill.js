// 六花氷衛軍（snowflake_sentry の進化・M7-D）: 複数の上位砲台を陣形配置し高冷気の敵へ高速射撃、一定射撃ごとに砲台間へ氷線を走らせる。
// 氷線は同一敵へ1回・主命中で凍結中の敵を1回粉砕する（砲台弾は粉砕なし）。ボスは氷砕ゲージへ接続。砲台数上限を厳格化。
// continuous・custom echo/clone（一時砲台1基/単発氷線）。主砲台設置時のみ recordCast。Job Lv80 対象外。runtimeState: 各砲台の instanceId/x/y/activeLeft/shotLeft/linkCounter。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class CrystalSentinelLegionSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.sentries = []; this._deployLeft = 0; this._nextId = 1; }
  canFire() { return false; }

  _cap() { return Math.min(this.evoDef.maxSentries || 5, this.scene.combat.skillCap('maxSentinelLegionLinksPerFrame', 8) + 2, this.cap('maxSentries', 6)); }

  update(dt, ctx) {
    const e = this.evoDef;
    this._deployLeft -= dt;
    const cap = Math.min(e.maxSentries || 5, this.cap('maxSentries', 6));
    if (this._deployLeft <= 0) { this._deployLeft = e.deployInterval || 1100; if ((!ctx || ctx.hasEnemies) && this.sentries.length < cap) this._deploy(e); }
    while (this.sentries.length > cap) { const old = this.sentries.shift(); if (old && old.gfx) old.gfx.destroy(); }
    for (let i = this.sentries.length - 1; i >= 0; i--) {
      const t = this.sentries[i]; t.activeLeft -= dt; t.shotLeft -= dt;
      if (t.gfx) t.gfx.setAlpha(0.55 + 0.3 * Math.abs(Math.sin(this.scene.time.now * 0.005)));
      if (t.activeLeft <= 0) { if (t.gfx) t.gfx.destroy(); this.sentries.splice(i, 1); continue; }
      if (t.shotLeft <= 0) { t.shotLeft = e.attackInterval || 460; this._shoot(t, e); }
    }
  }

  _deploy(e) {
    const p = this.scene.player; const idx = this.sentries.length;
    const a = (Math.PI * 2 * idx) / Math.max(1, e.maxSentries || 5); const rad = 44; // 陣形（決定論的な円形配置）
    const x = p.x + Math.cos(a) * rad, y = p.y + Math.sin(a) * rad;
    const gfx = this.scene.add.image(x, y, 'icon_crystal_sentinel_legion').setDepth(42).setScale(0.65).setAlpha(0.75).setTint(0xbde8ff);
    this.sentries.push({ instanceId: this._nextId++, x, y, activeLeft: e.activeDuration || 5200, shotLeft: 0, linkCounter: (e.link || {}).everyShots || 5, gfx });
    this.scene.skills.recordCast(this.id); // 主砲台設置時だけ
    this.scene.skills.recordExtra(this.id, 'sentriesPlaced', 1, 'add');
  }

  _shoot(t, e) {
    const target = this._pick(t, e.seekRange || 240);
    if (!target) return;
    const ang = Math.atan2(target.y - t.y, target.x - t.x);
    this.scene.combat.spawnPlayerProjectile(t.x, t.y, ang, e.projectileSpeed || 380, {
      skillId: this.id, element: 'ice', damage: e.shotDamage || 16, pierce: 0, chillAmount: (e.chill || {}).shot || 10,
      baseFreezeChance: 0, procCoefficient: this.evoDef.procCoefficient ?? 0.35, hitGroupId: this.scene.nextHitGroupId(), scale: 0.55, lifeMs: 1000, tint: 0xbde8ff,
    });
    this.scene.skills.recordExtra(this.id, 'shotsFired', 1, 'add');
    t.linkCounter--;
    if (t.linkCounter <= 0) { t.linkCounter = (e.link || {}).everyShots || 5; this._link(t, e); }
  }

  _pick(t, range) {
    const cand = [];
    for (const en of this.scene.combat.enemiesInRadius(t.x, t.y, range)) { if (!en.alive) continue; const chill = this.scene.combat.chillOf(en); const frozen = this.scene.combat.isFrozen(en); cand.push({ e: en, score: (frozen ? 1e9 : 0) - chill * 1000 + ((en.x - t.x) ** 2 + (en.y - t.y) ** 2) * 0.001 }); }
    cand.sort((a, b) => a.score - b.score || (a.e._seq ?? 0) - (b.e._seq ?? 0) || a.e.x - b.e.x || a.e.y - b.e.y);
    return cand.length ? cand[0].e : null;
  }

  // 砲台間の氷線: 帯上の敵へ damage＋chill、主命中（最も近い凍結中の敵）で1回粉砕。
  _link(t, e) {
    if (this.sentries.length < 2) return;
    if (!this.scene.combat.frameBudget('sentinelLink', 'maxSentinelLegionLinksPerFrame')) return;
    const other = this.sentries.find((o) => o !== t) || t;
    const hg = this.scene.nextHitGroupId();
    const mx = (t.x + other.x) / 2, my = (t.y + other.y) / 2;
    const dx = other.x - t.x, dy = other.y - t.y; const len = Math.hypot(dx, dy) || 1; const ux = dx / len, uy = dy / len;
    const g = this.scene.add.graphics().setDepth(8); g.lineStyle(2, 0xbde8ff, 0.8); g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(other.x, other.y); g.strokePath();
    this.scene.tweens ? this.scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() }) : g.destroy();
    const seen = new Set(); let shattered = false;
    for (const en of this.scene.combat.enemiesInRadius(mx, my, len / 2 + 14)) {
      if (!en.alive || seen.has(en)) continue;
      const rx = en.x - t.x, ry = en.y - t.y; const along = rx * ux + ry * uy; const perp = Math.abs(-rx * uy + ry * ux);
      if (along < -8 || along > len + 8 || perp > 14) continue;
      seen.add(en);
      if (!shattered && this.scene.combat.isFrozen(en)) { shattered = true; this.scene.combat.shatterEnemy(en, { skillId: this.id, multiplier: (this.evoDef.shatter || {}).multiplier || 1.5, skillPower: e.shotDamage || 16 }); this.scene.skills.recordExtra(this.id, 'shatters', 1, 'add'); }
      this.scene.combat.dealDamage(en, (e.link || {}).damage || 22, this.id, { element: 'ice', chillAmount: (e.chill || {}).line || 14, baseFreezeChance: 0, procCoefficient: (e.link || {}).proc || 0.4, hitGroupId: hg, quiet: true, color: 0xbde8ff });
    }
    this.scene.skills.recordExtra(this.id, 'iceLinks', 1, 'add');
  }

  echoCast() { const e = this.evoDef; const p = this.scene.player; const spot = this.scene.combat.densestPoint(e.seekRange || 240, 0) || { x: p.x, y: p.y }; this.scene.combat.damageArea(spot.x, spot.y, 40, (e.link || {}).damage || 22, this.id, { element: 'ice', chillAmount: (e.chill || {}).line || 14, procCoefficient: (e.link || {}).proc || 0.4, hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0xbde8ff }); }
  cloneCast() { this.echoCast(); }

  serializeState() { return { deployLeft: this._deployLeft, nextInstanceId: this._nextId, sentries: this.sentries.map((t) => ({ instanceId: t.instanceId, x: t.x, y: t.y, activeLeft: t.activeLeft, shotLeft: t.shotLeft, linkCounter: t.linkCounter })) }; }
  restoreState(st) {
    if (!st) return;
    if (typeof st.deployLeft === 'number') this._deployLeft = st.deployLeft;
    if (typeof st.nextInstanceId === 'number') this._nextId = st.nextInstanceId;
    if (Array.isArray(st.sentries)) {
      const every = (this.evoDef.link || {}).everyShots || 5;
      for (const t of this.sentries) if (t.gfx) t.gfx.destroy();
      this.sentries = [];
      for (const t of st.sentries) { if (t.activeLeft > 0) { const gfx = this.scene.add.image(t.x, t.y, 'icon_crystal_sentinel_legion').setDepth(42).setScale(0.65).setAlpha(0.75).setTint(0xbde8ff); this.sentries.push({ instanceId: t.instanceId, x: t.x, y: t.y, activeLeft: t.activeLeft, shotLeft: t.shotLeft || 0, linkCounter: t.linkCounter != null ? t.linkCounter : every, gfx }); } }
    }
  }

  destroy() { for (const t of this.sentries) if (t.gfx) t.gfx.destroy(); this.sentries = []; }
}
