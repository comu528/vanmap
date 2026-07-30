// 旋風斬り（M8-B・戦士）: 自分中心の連続回転斬り。明確な active duration を持つ（常設型ではない）。
// 闘気解放中は tick 間隔が短くなる。1 tick あたりのコンボ/闘気獲得は上限つきで、
// multi-hit で無限に増えない（WarriorCombatSystem の castKey 予算＋tick ごとの上限）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class WhirlwindSlashSkill extends WarriorSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._spin = null; // { leftMs, tickLeft, castKey, ticks }
  }
  canFire(ctx) { return !!ctx.hasEnemies && !this._spin; }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    this._spin = { leftMs: s.duration, tickLeft: 0, castKey: this.newCastKey(), ticks: 0 };
    this.scene.skills.recordExtra(this.id, 'spins', 1, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    this._updateSpin(dt);
  }

  _updateSpin(dt) {
    const sp = this._spin; if (!sp) return;
    const s = this.stats; if (!s) { this._spin = null; return; }
    sp.leftMs -= dt;
    sp.tickLeft -= dt;
    this.scene.skills.recordExtra(this.id, 'activeMs', dt, 'add');
    const budget = this.scene.combat.skillCap('maxSpinTicksPerFrame', 2);
    let ticksThisFrame = 0;
    let interval = s.tickInterval;
    if (this.warrior && this.warrior.releaseActive) interval *= (this.def?.config?.releaseTickMult ?? 0.75);
    while (sp.tickLeft <= 0 && ticksThisFrame < budget && sp.leftMs > -interval) {
      sp.tickLeft += Math.max(40, interval);
      ticksThisFrame += 1;
      sp.ticks += 1;
      this._tick(sp);
    }
    if (sp.leftMs <= 0) { this._spin = null; }
  }

  _tick(sp) {
    const s = this.stats; const p = this.scene.player;
    // spin は全周（arc = 2π）。tick ごとに新しい castKey を配らず、1 発動 = 1 castKey を維持する。
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(s.radius), arc: Math.PI * 2, facing: 0,
      damage: s.damage, skillId: this.id, castKey: sp.castKey,
      knockback: s.knockback, poiseDamage: s.poiseDamage,
      comboGain: Math.min(s.comboGain || 1, this.def?.config?.maxComboGainPerTick ?? 1), furyGain: s.furyGain,
      tags: ['melee', 'slash', 'spin'], color: 0xffab40, visualIndex: sp.ticks,
    });
  }

  get spinning() { return !!this._spin; }

  serializeState() {
    return { cdLeft: this._cd, spinLeftMs: this._spin ? this._spin.leftMs : 0, spinTickLeft: this._spin ? this._spin.tickLeft : 0 };
  }
  restoreState(st) {
    if (!st) return;
    this.restoreCd(st.cdLeft);
    const s = this.stats;
    // M8-F: 保存値は data の duration で必ず頭打ちにする（改ざんで永久回転を作らせない）。
    const maxMs = Math.max(0, (s && s.duration) || 0);
    const left = Math.min(Math.max(0, st.spinLeftMs || 0), maxMs);
    // 復元では回転を「再開」するだけで、新しい発動としてカウントしない（duration の二重化を防ぐ）。
    this._spin = left > 0
      ? { leftMs: left, tickLeft: Math.max(0, Math.min(st.spinTickLeft || 0, maxMs)), castKey: this.nextCastKey(), ticks: 0 }
      : null;
  }
  destroy() { this._dead = true; this._spin = null; }
}
