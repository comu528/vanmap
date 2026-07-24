// 永劫封氷棺（absolute_ice_seal の進化・M7-D）: 高冷気の敵複数へ氷棺印（skill-local マーカー）を刻み、時間か氷属性命中数で起爆する。
// 起爆で大範囲ダメージ＋冷気、凍結中の敵を強化粉砕。起爆対象から近傍の未印対象へ副棺を最大1世代だけ伝播する（副棺から再伝播しない）。ボスは氷砕ゲージ＋高めの bossGaugeMult。
// reactive・echo/clone forbidden。主印付与時のみ recordCast。Job Lv80 対象外。runtimeState: markLeft/nextInstanceId＋安全なボス印のみ（無料棺・無料起爆しない）。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class EternalSealedCoffinSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.marks = []; this._markLeft = 0; this._nextId = 1; this._markedSet = new Set(); }
  canFire() { return false; }
  get isReactive() { return true; }

  _cap() { return Math.min(this.evoDef.maxMarks || 5, this.scene.combat.skillCap('maxSealedCoffinMarks', 22), this.cap('maxMarks', 6)); }

  update(dt, ctx) {
    const e = this.evoDef;
    this._markLeft -= dt;
    if (this._markLeft <= 0) { this._markLeft = e.markInterval || 2200; if ((!ctx || ctx.hasEnemies) && this.marks.length < this._cap()) this._applyMarks(e); }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i]; const en = m.enemy;
      if (!en || !en.alive || en._iceSeal !== m) { this._dropMark(i); continue; }
      m.remaining -= dt;
      if (m.overlay) m.overlay.setPosition(en.x, en.y);
      const hits = (en._iceHitCount || 0) - m.startHits;
      if (m.remaining <= 0 || hits >= m.requiredHits) { this._detonate(m, e, m.remaining <= 0); this._dropMark(i); }
    }
  }

  _applyMarks(e) {
    const p = this.scene.player; const cand = [];
    for (const en of this.scene.combat.enemiesInRadius(p.x, p.y, 100000)) { if (!en.alive || this._markedSet.has(en) || en._iceSeal) continue; cand.push(en); }
    cand.sort((a, b) => this.scene.combat.chillOf(b) - this.scene.combat.chillOf(a) || (a._seq ?? 0) - (b._seq ?? 0) || a.x - b.x || a.y - b.y);
    const want = Math.min(this._cap() - this.marks.length, cand.length); let applied = 0;
    for (let i = 0; i < want; i++) { this._mark(cand[i], e, 0); applied++; }
    if (applied) { this.scene.skills.recordCast(this.id); this.scene.skills.recordExtra(this.id, 'marksApplied', applied, 'add'); }
  }

  _mark(en, e, generation) {
    if (!en || !en.alive || en._iceSeal || this._markedSet.has(en)) return;
    const overlay = this.scene.add.image(en.x, en.y, 'icon_eternal_sealed_coffin').setDepth(48).setScale(0.55).setAlpha(0.75).setTint(0xbde8ff).setBlendMode(Phaser.BlendModes.ADD);
    const m = { enemy: en, instanceId: this._nextId++, remaining: e.markDuration || 3000, requiredHits: e.requiredHits || 3, startHits: (en._iceHitCount || 0), isBoss: !!en.isBoss, generation, x: en.x, y: en.y, overlay };
    en._iceSeal = m; this._markedSet.add(en); this.marks.push(m);
  }

  _detonate(m, e, natural) {
    if (!this.scene.combat.frameBudget('sealedCoffinExpl', 'maxIceSealExplosionsPerFrame')) return;
    const en = m.enemy; const x = en && en.alive ? en.x : m.x, y = en && en.alive ? en.y : m.y;
    this.scene.effects.explosion(x, y, e.detonationRadius || 80, 0x9fe8ff);
    const hg = this.scene.nextHitGroupId();
    for (const t of this.scene.combat.enemiesInRadius(x, y, e.detonationRadius || 80)) { if (this.scene.combat.isFrozen(t)) this.scene.combat.shatterEnemy(t, { skillId: this.id, multiplier: (this.evoDef.shatter || {}).multiplier || 1.8, skillPower: e.detonationDamage || 70 }); }
    this.scene.combat.damageArea(x, y, e.detonationRadius || 80, e.detonationDamage || 70, this.id, { element: 'ice', chillAmount: (e.chill || {}).amount || 30, baseFreezeChance: 0, procCoefficient: this.evoDef.procCoefficient ?? 0.90, hitGroupId: hg, isExplosion: true, color: 0x9fe8ff, bossGaugeMult: e.bossGaugeMult || 1 });
    this.scene.skills.recordExtra(this.id, natural ? 'naturalDetonations' : 'earlyDetonations', 1, 'add');
    // 伝播（最大1世代・副棺は再伝播しない）。
    const prop = e.propagation || {};
    if (m.generation < (prop.generations || 1)) {
      const cand = [];
      for (const t of this.scene.combat.enemiesInRadius(x, y, prop.radius || 120)) { if (!t.alive || t._iceSeal || this._markedSet.has(t) || t === en) continue; cand.push(t); }
      cand.sort((a, b) => this.scene.combat.chillOf(b) - this.scene.combat.chillOf(a) || (a._seq ?? 0) - (b._seq ?? 0) || a.x - b.x || a.y - b.y);
      if (cand.length && this.marks.length < this._cap()) { this._mark(cand[0], e, m.generation + 1); this.scene.skills.recordExtra(this.id, 'propagations', 1, 'add'); }
    }
  }

  _dropMark(i) { const m = this.marks[i]; if (!m) return; if (m.overlay) m.overlay.destroy(); if (m.enemy && m.enemy._iceSeal === m) m.enemy._iceSeal = null; this._markedSet.delete(m.enemy); this.marks.splice(i, 1); }

  serializeState() {
    const st = { markLeft: this._markLeft, nextInstanceId: this._nextId };
    const bm = this.marks.find((m) => m.isBoss && m.enemy === this.scene.boss);
    if (bm) st.bossMark = { instanceId: bm.instanceId, remaining: bm.remaining, requiredHits: bm.requiredHits, generation: bm.generation };
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.markLeft === 'number') this._markLeft = st.markLeft;
    if (typeof st.nextInstanceId === 'number') this._nextId = st.nextInstanceId;
    if (st.bossMark && this.scene.boss && this.scene.boss.alive && !this.scene.boss._iceSeal) {
      const e = this.evoDef; const en = this.scene.boss;
      const overlay = this.scene.add.image(en.x, en.y, 'icon_eternal_sealed_coffin').setDepth(48).setScale(0.55).setAlpha(0.75).setTint(0xbde8ff).setBlendMode(Phaser.BlendModes.ADD);
      const m = { enemy: en, instanceId: st.bossMark.instanceId, remaining: st.bossMark.remaining || (e.markDuration || 3000), requiredHits: st.bossMark.requiredHits || (e.requiredHits || 3), startHits: (en._iceHitCount || 0), isBoss: true, generation: st.bossMark.generation || 0, x: en.x, y: en.y, overlay };
      en._iceSeal = m; this._markedSet.add(en); this.marks.push(m);
    }
  }

  destroy() { for (const m of this.marks) { if (m.overlay) m.overlay.destroy(); if (m.enemy && m.enemy._iceSeal === m) m.enemy._iceSeal = null; } this.marks = []; this._markedSet.clear(); }
}
