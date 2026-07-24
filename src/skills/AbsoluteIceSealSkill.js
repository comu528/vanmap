// 絶対氷封（frost_mage・M7-D・rare・reactive）: 高冷気の敵へ氷印（skill-local マーカー・正式状態ではない）を刻み（markInterval ごと・maxMarks まで）、
// 一定時間経過（markDuration）か氷属性ダメージの一定命中数（requiredHits）で起爆する。起爆で範囲ダメージ＋冷気、凍結中の敵を1回粉砕。ボスは氷砕ゲージ＋ bossGaugeMult。
// 印付与時は freeze roll を行わない。印は StatusEffectRegistry へ登録せず、死亡/pool再利用/Scene終了で解除する。echo/clone forbidden。runtimeState: markLeft/nextInstanceId＋安全なボス印のみ。

import { SkillBase } from './SkillBase.js';

export class AbsoluteIceSealSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.marks = []; this._markLeft = 0; this._nextId = 1; this._markedSet = new Set(); }
  canFire() { return false; }
  get isReactive() { return true; }

  _capMarks() { return Math.min(this.stats.maxMarks || 2, this.scene.combat.skillCap('maxIceSealMarks', 22)); }

  update(dt, ctx) {
    const s = this.stats;
    this._markLeft -= dt;
    if (this._markLeft <= 0) { this._markLeft = s.markInterval || 2200; if ((!ctx || ctx.hasEnemies) && this.marks.length < this._capMarks()) this._applyMarks(s); }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i]; const e = m.enemy;
      if (!e || !e.alive || e._iceSeal !== m) { this._dropMark(i); continue; } // 死亡/pool再利用/上書きで解除（無料起爆しない）
      m.remaining -= dt;
      if (m.overlay) m.overlay.setPosition(e.x, e.y);
      const hits = (e._iceHitCount || 0) - m.startHits;
      if (m.remaining <= 0 || hits >= m.requiredHits) { this._detonate(m, s, m.remaining <= 0); this._dropMark(i); }
    }
  }

  _applyMarks(s) {
    const p = this.scene.player;
    const cand = [];
    for (const e of this.scene.combat.enemiesInRadius(p.x, p.y, 100000)) { if (!e.alive || this._markedSet.has(e) || e._iceSeal) continue; cand.push(e); }
    // 高chill対象を優先（同点は entity 順）。印付与自体は冷気/凍結を発生させない。
    cand.sort((a, b) => this.scene.combat.chillOf(b) - this.scene.combat.chillOf(a) || (a._seq ?? 0) - (b._seq ?? 0) || a.x - b.x || a.y - b.y);
    const want = Math.min(this._capMarks() - this.marks.length, cand.length);
    let applied = 0;
    for (let i = 0; i < want; i++) { this._mark(cand[i], s); applied++; }
    if (applied) { this.scene.skills.recordCast(this.id); this.scene.skills.recordExtra(this.id, 'marksApplied', applied, 'add'); } // 印付与開始時だけ（forbidden のため残響しない）
  }

  _mark(e, s) {
    const overlay = this.scene.add.image(e.x, e.y, 'icon_absolute_ice_seal').setDepth(48).setScale(0.5).setAlpha(0.7).setTint(0xbde8ff).setBlendMode(Phaser.BlendModes.ADD);
    const m = { enemy: e, instanceId: this._nextId++, remaining: s.markDuration || 2800, requiredHits: s.requiredHits || 4, startHits: (e._iceHitCount || 0), isBoss: !!e.isBoss, x: e.x, y: e.y, overlay };
    e._iceSeal = m; this._markedSet.add(e); this.marks.push(m);
  }

  _detonate(m, s, natural) {
    if (!this.scene.combat.frameBudget('iceSealExpl', 'maxIceSealExplosionsPerFrame')) return;
    const e = m.enemy; const x = e && e.alive ? e.x : m.x, y = e && e.alive ? e.y : m.y;
    this.scene.effects.explosion(x, y, s.detonationRadius || 60, 0x9fe8ff);
    const hg = this.scene.nextHitGroupId();
    for (const en of this.scene.combat.enemiesInRadius(x, y, s.detonationRadius || 60)) { if (this.scene.combat.isFrozen(en)) this.scene.combat.shatterEnemy(en, { skillId: this.id, multiplier: 1.5, skillPower: s.detonationDamage }); }
    this.scene.combat.damageArea(x, y, s.detonationRadius || 60, s.detonationDamage, this.id, {
      element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.85,
      hitGroupId: hg, isExplosion: true, color: 0x9fe8ff, bossGaugeMult: s.bossGaugeMult || 1,
    });
    this.scene.skills.recordExtra(this.id, natural ? 'naturalDetonations' : 'earlyDetonations', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'shatters', 0, 'add');
  }

  _dropMark(i) { const m = this.marks[i]; if (!m) return; if (m.overlay) m.overlay.destroy(); if (m.enemy && m.enemy._iceSeal === m) m.enemy._iceSeal = null; this._markedSet.delete(m.enemy); this.marks.splice(i, 1); }

  // echo/clone forbidden（氷印を無料複製しない）。

  serializeState() {
    // CD（markLeft）は必ず保存。通常敵の印は pool 再利用で再特定できないため捨て、ボス印のみ安全に再関連付ける。
    const st = { markLeft: this._markLeft, nextInstanceId: this._nextId };
    const bm = this.marks.find((m) => m.isBoss && m.enemy === this.scene.boss);
    if (bm) st.bossMark = { instanceId: bm.instanceId, remaining: bm.remaining, requiredHits: bm.requiredHits };
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.markLeft === 'number') this._markLeft = st.markLeft;
    if (typeof st.nextInstanceId === 'number') this._nextId = st.nextInstanceId;
    if (st.bossMark && this.scene.boss && this.scene.boss.alive && !this.scene.boss._iceSeal) {
      const s = this.stats; const e = this.scene.boss;
      const overlay = this.scene.add.image(e.x, e.y, 'icon_absolute_ice_seal').setDepth(48).setScale(0.5).setAlpha(0.7).setTint(0xbde8ff).setBlendMode(Phaser.BlendModes.ADD);
      // hitCount はエンティティ側（保存しない）が再生成されるため、requiredHits は復元後の命中から数え直す（無料起爆しない）。
      const m = { enemy: e, instanceId: st.bossMark.instanceId, remaining: st.bossMark.remaining || (s.markDuration || 2800), requiredHits: st.bossMark.requiredHits || (s.requiredHits || 4), startHits: (e._iceHitCount || 0), isBoss: true, x: e.x, y: e.y, overlay };
      e._iceSeal = m; this._markedSet.add(e); this.marks.push(m);
    }
  }

  destroy() { for (const m of this.marks) { if (m.overlay) m.overlay.destroy(); if (m.enemy && m.enemy._iceSeal === m) m.enemy._iceSeal = null; } this.marks = []; this._markedSet.clear(); }
}
