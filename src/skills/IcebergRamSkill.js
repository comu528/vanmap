// 氷山奔衝（frost_mage・M7-D・rare）: 敵密度の高い方向へ巨大な氷山を低速滑走させる（cooldown・同時1つ・cap厳格）。
// 接触した敵へダメージと冷気を与え通常敵を押し流す（エリート軽減・ボス無効）。凍結中の敵は最初の接触で粉砕（1氷山1体1回・berg固有 Set）。終端/duration で崩壊し範囲ダメージ＋決定論的な氷片。
// echo=standard（追加氷山）/ clone=custom（縮小氷山）。recordCast は主氷山生成時に1回。runtimeState: cdLeft＋滑走中の氷山（1つだけ再構築・二重崩壊しない）。

import { SkillBase } from './SkillBase.js';

export class IcebergRamSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.berg = null; this._nextId = 1; }
  canFire(ctx) { return ctx.hasEnemies && !this.berg; }

  fire() {
    const s = this.stats; const p = this.scene.player;
    if (this.berg) return;
    const spot = this.scene.combat.densestPoint(120, 0) || this.scene.combat.nearestEnemy(p.x, p.y, 100000) || { x: p.x + 100, y: p.y };
    const ang = Math.atan2(spot.y - p.y, spot.x - p.x);
    this._spawnBerg(p.x, p.y, Math.cos(ang), Math.sin(ang), s, this._nextId++, 1);
    this.scene.skills.recordExtra(this.id, 'ramsCast', 1, 'add');
  }

  _spawnBerg(x, y, dx, dy, s, id, scale) {
    const gfx = this.scene.add.rectangle(x, y, (s.length || 110) * scale, (s.width || 75) * scale, 0xb3e5fc, 0.4).setDepth(7).setRotation(Math.atan2(dy, dx)).setStrokeStyle(1, 0xe1f5fe, 0.6);
    this.berg = { x, y, dx, dy, activeLeft: (s.duration || 1700) * scale, travel: 0, maxTravel: (s.speed || 100) * (s.duration || 1700) / 1000 * scale, rehit: new Map(), shattered: new Set(), collapsePending: true, instanceId: id, scale, gfx };
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()
    const b = this.berg; if (!b) return;
    const s = this.stats;
    const step = (s.speed || 100) * dt / 1000;
    b.x += b.dx * step; b.y += b.dy * step; b.travel += step; b.activeLeft -= dt;
    if (b.gfx) b.gfx.setPosition(b.x, b.y);
    this._contact(b, s);
    if (b.travel >= b.maxTravel || b.activeLeft <= 0) { this._collapse(b, s); if (b.gfx) b.gfx.destroy(); this.berg = null; }
  }

  _contact(b, s) {
    const now = this.scene.time.now;
    let checks = 0; const cap = this.scene.combat.skillCap('maxIcebergContactChecks', 60);
    const halfW = (s.width || 75) / 2 + 8, halfL = (s.length || 110) / 2 + 8;
    const hg = this.scene.nextHitGroupId();
    for (const e of this.scene.combat.enemiesInRadius(b.x, b.y, Math.max(halfW, halfL) + 10)) {
      if (!e.alive) continue;
      if (checks >= cap) { if (this.scene._m) this.scene._m.suppressed++; break; }
      const rx = e.x - b.x, ry = e.y - b.y; const along = rx * b.dx + ry * b.dy; const perp = -rx * b.dy + ry * b.dx;
      if (Math.abs(along) > halfL || Math.abs(perp) > halfW) continue;
      checks++;
      const last = b.rehit.get(e); if (last != null && now - last < (s.rehitInterval || 300)) continue;
      b.rehit.set(e, now);
      // 凍結中の敵は最初の接触だけ粉砕（berg 固有 Set・pool再利用の残留なし）。
      if (this.scene.combat.isFrozen(e) && !b.shattered.has(e)) { b.shattered.add(e); this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: this.def?.config?.shatterMultiplier || 1.5, skillPower: s.contactDamage }); this.scene.skills.recordExtra(this.id, 'shatters', 1, 'add'); }
      let kb = s.pushForce || 60; if (e.isBoss) kb = 0; else if (e.isElite) kb *= (s.elitePushMult || 0.4);
      this.scene.combat.dealDamage(e, s.contactDamage, this.id, {
        element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.55,
        hitGroupId: hg, knockback: kb, from: { x: b.x, y: b.y }, quiet: true, color: 0x9fe8ff,
      });
      if (!e.isBoss && kb > 0) this.scene.skills.recordExtra(this.id, 'enemiesPushed', 1, 'add');
      this.scene.skills.recordExtra(this.id, 'contactHits', 1, 'add');
    }
  }

  _collapse(b, s) {
    if (!b.collapsePending) return; b.collapsePending = false; // 二重崩壊防止
    this.scene.effects.explosion(b.x, b.y, s.collapseRadius || 90, 0x9fe8ff);
    const hg = this.scene.nextHitGroupId();
    for (const e of this.scene.combat.enemiesInRadius(b.x, b.y, s.collapseRadius || 90)) { if (this.scene.combat.isFrozen(e)) this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: this.def?.config?.shatterMultiplier || 1.5, skillPower: s.collapseDamage }); }
    this.scene.combat.damageArea(b.x, b.y, s.collapseRadius || 90, s.collapseDamage, this.id, {
      element: 'ice', chillAmount: s.collapseChill, baseFreezeChance: 0, procCoefficient: this.def?.config?.collapseProc ?? 0.75,
      hitGroupId: hg, isExplosion: true, color: 0x9fe8ff,
    });
    const nShards = Math.min(s.shardCount || 6, this.scene.combat.skillCap('maxIcebergShards', 20));
    const hg2 = this.scene.nextHitGroupId();
    for (let i = 0; i < nShards; i++) {
      const a = (Math.PI * 2 * i) / nShards;
      this.scene.combat.spawnPlayerProjectile(b.x, b.y, a, 280, {
        skillId: this.id, element: 'ice', damage: s.contactDamage * 0.4, pierce: 0, chillAmount: (s.chillAmount || 0) * 0.3,
        baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.55, hitGroupId: hg2, scale: 0.5, lifeMs: 700, tint: 0xbde8ff,
      });
    }
    this.scene.skills.recordExtra(this.id, 'collapses', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'shardsSpawned', nShards, 'add');
  }

  // 残響（standard）: fire() を再実行（!this.berg ガードで滑走中は追加しない）。複製（custom）: 縮小・低威力・短命の氷山。
  cloneCast() { if (this.berg) return; const s = this.stats; const p = this.scene.player; const spot = this.scene.combat.densestPoint(120, 0) || { x: p.x + 100, y: p.y }; const ang = Math.atan2(spot.y - p.y, spot.x - p.x); this._spawnBerg(p.x, p.y, Math.cos(ang), Math.sin(ang), s, this._nextId++, 0.6); }

  serializeState() {
    const st = { cdLeft: this._cd };
    if (this.berg) { st.active = true; st.x = this.berg.x; st.y = this.berg.y; st.directionX = this.berg.dx; st.directionY = this.berg.dy; st.activeLeft = this.berg.activeLeft; st.travel = this.berg.travel; st.collapsePending = this.berg.collapsePending; st.instanceId = this.berg.instanceId; st.scale = this.berg.scale; }
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    if (st.active && st.activeLeft > 0) {
      const s = this.stats;
      this._spawnBerg(st.x != null ? st.x : this.scene.player.x, st.y != null ? st.y : this.scene.player.y, st.directionX != null ? st.directionX : 1, st.directionY != null ? st.directionY : 0, s, st.instanceId || this._nextId++, st.scale || 1);
      this.berg.activeLeft = st.activeLeft; this.berg.travel = st.travel || 0; this.berg.collapsePending = st.collapsePending !== false;
    }
  }

  destroy() { if (this.berg && this.berg.gfx) this.berg.gfx.destroy(); this.berg = null; }
}
