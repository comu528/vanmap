// 大陸氷河奔流（iceberg_ram の進化・M7-D）: 幅広い巨大氷河が画面を横断し通常敵を大きく押し流す（エリート軽減・ボス無効）。
// 凍結中の敵は最初の接触で強化粉砕（氷河固有 Set・pool再利用の残留なし）。終端で大規模崩壊し低procの氷河裂片を残す（粉砕なし）。ボスは氷砕ゲージへ接続。同時氷河数を厳しく制限。
// cooldown・custom echo/clone（縮小氷河）。main cast 時のみ recordCast。Job Lv80 対象外。runtimeState: cdLeft＋滑走中の氷河（1つだけ再構築・二重崩壊しない）。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class ContinentalGlacierRushSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.rush = null; this.residues = []; this._nextId = 1; }
  canFire(ctx) { return ctx.hasEnemies && !this.rush; }

  fire() {
    const e = this.evoDef; const p = this.scene.player;
    if (this.rush) return;
    const spot = this.scene.combat.densestPoint(150, 0) || this.scene.combat.nearestEnemy(p.x, p.y, 100000) || { x: p.x + 120, y: p.y };
    const ang = Math.atan2(spot.y - p.y, spot.x - p.x);
    this._spawn(p.x, p.y, Math.cos(ang), Math.sin(ang), e, this._nextId++, 1);
    this.scene.skills.recordExtra(this.id, 'rushesCast', 1, 'add');
  }

  _spawn(x, y, dx, dy, e, id, scale) {
    const gfx = this.scene.add.rectangle(x, y, (e.length || 160) * scale, (e.width || 120) * scale, 0xb3e5fc, 0.4).setDepth(7).setRotation(Math.atan2(dy, dx)).setStrokeStyle(1, 0xe1f5fe, 0.6);
    this.rush = { x, y, dx, dy, activeLeft: (e.duration || 2000) * scale, travel: 0, maxTravel: (e.speed || 110) * (e.duration || 2000) / 1000 * scale, rehit: new Map(), shattered: new Set(), collapsePending: true, instanceId: id, scale, gfx };
  }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()
    const b = this.rush; const e = this.evoDef;
    if (b) {
      const step = (e.speed || 110) * dt / 1000;
      b.x += b.dx * step; b.y += b.dy * step; b.travel += step; b.activeLeft -= dt;
      if (b.gfx) b.gfx.setPosition(b.x, b.y);
      this._contact(b, e);
      if (b.travel >= b.maxTravel || b.activeLeft <= 0) { this._collapse(b, e); if (b.gfx) b.gfx.destroy(); this.rush = null; }
    }
    for (let i = this.residues.length - 1; i >= 0; i--) {
      const r = this.residues[i]; r.until -= dt; r.tickLeft -= dt;
      if (r.gfx) r.gfx.setAlpha(0.3 * Math.max(0, r.until) / (r.max || 1) + 0.05);
      if (r.tickLeft <= 0 && r.until > 0) { r.tickLeft = 360; this.scene.combat.damageArea(r.x, r.y, r.radius, r.damage, this.id, { element: 'ice', tag: 'dot', chillAmount: 3, procCoefficient: r.proc, hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x80deea }); }
      if (r.until <= 0) { if (r.gfx) r.gfx.destroy(); this.residues.splice(i, 1); }
    }
  }

  _contact(b, e) {
    const now = this.scene.time.now;
    let checks = 0; const cap = this.scene.combat.skillCap('maxIcebergContactChecks', 60);
    const halfW = (e.width || 120) / 2 + 8, halfL = (e.length || 160) / 2 + 8; const hg = this.scene.nextHitGroupId();
    for (const en of this.scene.combat.enemiesInRadius(b.x, b.y, Math.max(halfW, halfL) + 10)) {
      if (!en.alive) continue; if (checks >= cap) { if (this.scene._m) this.scene._m.suppressed++; break; }
      const rx = en.x - b.x, ry = en.y - b.y; const along = rx * b.dx + ry * b.dy; const perp = -rx * b.dy + ry * b.dx;
      if (Math.abs(along) > halfL || Math.abs(perp) > halfW) continue;
      checks++;
      const last = b.rehit.get(en); if (last != null && now - last < (e.rehitInterval || 280)) continue;
      b.rehit.set(en, now);
      if (this.scene.combat.isFrozen(en) && !b.shattered.has(en)) { b.shattered.add(en); this.scene.combat.shatterEnemy(en, { skillId: this.id, multiplier: (this.evoDef.shatter || {}).multiplier || 1.7, skillPower: e.contactDamage || 26 }); this.scene.skills.recordExtra(this.id, 'shatters', 1, 'add'); }
      let kb = e.pushForce || 110; if (en.isBoss) kb = 0; else if (en.isElite) kb *= (e.elitePushMult || 0.4);
      this.scene.combat.dealDamage(en, e.contactDamage || 26, this.id, { element: 'ice', chillAmount: (e.chill || {}).contact || 14, baseFreezeChance: 0, procCoefficient: this.evoDef.procCoefficient ?? 0.55, hitGroupId: hg, knockback: kb, from: { x: b.x, y: b.y }, quiet: true, color: 0x9fe8ff });
      if (!en.isBoss && kb > 0) this.scene.skills.recordExtra(this.id, 'enemiesPushed', 1, 'add');
      this.scene.skills.recordExtra(this.id, 'contactHits', 1, 'add');
    }
  }

  _collapse(b, e) {
    if (!b.collapsePending) return; b.collapsePending = false;
    this.scene.effects.explosion(b.x, b.y, e.collapseRadius || 130, 0x9fe8ff);
    const hg = this.scene.nextHitGroupId();
    for (const en of this.scene.combat.enemiesInRadius(b.x, b.y, e.collapseRadius || 130)) { if (this.scene.combat.isFrozen(en)) this.scene.combat.shatterEnemy(en, { skillId: this.id, multiplier: (this.evoDef.shatter || {}).multiplier || 1.7, skillPower: e.collapseDamage || 90 }); }
    this.scene.combat.damageArea(b.x, b.y, e.collapseRadius || 130, e.collapseDamage || 90, this.id, { element: 'ice', chillAmount: (e.chill || {}).collapse || 30, baseFreezeChance: 0, procCoefficient: this.evoDef.collapseProc ?? 0.75, hitGroupId: hg, isExplosion: true, color: 0x9fe8ff });
    const nShards = Math.min(e.shardCount || 10, this.scene.combat.skillCap('maxIcebergShards', 20));
    const hg2 = this.scene.nextHitGroupId();
    for (let i = 0; i < nShards; i++) { const a = (Math.PI * 2 * i) / nShards; this.scene.combat.spawnPlayerProjectile(b.x, b.y, a, 300, { skillId: this.id, element: 'ice', damage: (e.contactDamage || 26) * 0.4, pierce: 0, chillAmount: ((e.chill || {}).contact || 14) * 0.3, baseFreezeChance: 0, procCoefficient: this.evoDef.procCoefficient ?? 0.55, hitGroupId: hg2, scale: 0.5, lifeMs: 700, tint: 0xbde8ff }); }
    this._spawnResidues(b.x, b.y, e);
    this.scene.skills.recordExtra(this.id, 'collapses', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'shardsSpawned', nShards, 'add');
  }

  _spawnResidues(x, y, e) {
    const rd = e.residue || {}; const n = Math.min(rd.count || 4, this.cap('maxResidues', 8) - this.residues.length);
    for (let i = 0; i < n; i++) { const a = (Math.PI * 2 * i) / Math.max(1, rd.count || 4); const rr = (e.collapseRadius || 130) * 0.5; const rx = x + Math.cos(a) * rr, ry = y + Math.sin(a) * rr; const gfx = this.scene.add.circle(rx, ry, rd.radius || 34, 0x80deea, 0.2).setDepth(5).setStrokeStyle(1, 0xbde8ff, 0.3); this.residues.push({ x: rx, y: ry, radius: rd.radius || 34, damage: rd.damage || 4, proc: rd.proc || 0.12, until: rd.durationMs || 1200, max: rd.durationMs || 1200, tickLeft: 0, gfx }); }
  }

  cloneCast() { if (this.rush) return; const e = this.evoDef; const p = this.scene.player; const spot = this.scene.combat.densestPoint(150, 0) || { x: p.x + 120, y: p.y }; const ang = Math.atan2(spot.y - p.y, spot.x - p.x); this._spawn(p.x, p.y, Math.cos(ang), Math.sin(ang), e, this._nextId++, 0.6); }

  serializeState() {
    const st = { cdLeft: this._cd };
    if (this.rush) { st.active = true; st.x = this.rush.x; st.y = this.rush.y; st.directionX = this.rush.dx; st.directionY = this.rush.dy; st.activeLeft = this.rush.activeLeft; st.travel = this.rush.travel; st.collapsePending = this.rush.collapsePending; st.instanceId = this.rush.instanceId; st.scale = this.rush.scale; }
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    if (st.active && st.activeLeft > 0) { const e = this.evoDef; this._spawn(st.x != null ? st.x : this.scene.player.x, st.y != null ? st.y : this.scene.player.y, st.directionX != null ? st.directionX : 1, st.directionY != null ? st.directionY : 0, e, st.instanceId || this._nextId++, st.scale || 1); this.rush.activeLeft = st.activeLeft; this.rush.travel = st.travel || 0; this.rush.collapsePending = st.collapsePending !== false; }
  }

  destroy() { if (this.rush && this.rush.gfx) this.rush.gfx.destroy(); this.rush = null; for (const r of this.residues) if (r.gfx) r.gfx.destroy(); this.residues = []; }
}
