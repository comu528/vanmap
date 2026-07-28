// 血戦旋風（M8-B・旋風斬りの進化 / 補助: 血気 Lv4）:
// 回転中の撃破で active duration がわずかに延びる（1 発動あたり上限つき・無限 duration なし）。
// 撃破回復そのものは血気（WarriorCombatSystem.killHeal）が担い、毎秒上限を超えない。
// 敵がいない間は延長しない（撃破が起きないため自然に延びない）。
// save/reload では残り duration のみを引き継ぎ、延長回数はリセットする（二重化しない）。
import { WarriorEvolvedBase } from './WarriorSkillBase.js';

export class BloodstormWhirlwindSkill extends WarriorEvolvedBase {
  constructor(scene, id, level) { super(scene, id, level); this._spin = null; this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._spin; }

  fire() {
    if (this.scene.gameOver) return;
    const d = this.evoDef;
    this._spin = {
      leftMs: d.projectileCount?.duration || 2800, tickLeft: 0,
      castKey: this.newCastKey(), ticks: 0, extendedMs: 0, extendCount: 0,
    };
    // 進化 data の「1 発動あたりコンボ/闘気の上限」をこの cast へ適用する（tick 数で無制限に稼がない）。
    if (this.warrior) this.warrior.setCastLimits(this._spin.castKey, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    this.scene.skills.recordExtra(this.id, 'spins', 1, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    const sp = this._spin; if (!sp) return;
    const d = this.evoDef;
    sp.leftMs -= dt;
    sp.tickLeft -= dt;
    this.scene.skills.recordExtra(this.id, 'activeMs', dt, 'add');
    let interval = d.projectileCount?.tickInterval || 150;
    if (this.warrior && this.warrior.releaseActive) interval *= 0.75;
    const budget = Math.min(this.cap('maxTicksPerFrame', 2), this.scene.combat.skillCap('maxSpinTicksPerFrame', 2));
    let n = 0;
    while (sp.tickLeft <= 0 && n < budget && sp.leftMs > -interval) {
      sp.tickLeft += Math.max(40, interval);
      n += 1; sp.ticks += 1;
      this._tick(sp);
    }
    if (sp.leftMs <= 0) this._spin = null;
  }

  _tick(sp) {
    const d = this.evoDef; const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(d.area?.radius || 84), arc: Math.PI * 2, facing: 0,
      damage: d.damage?.tick || 24, skillId: this.id, castKey: sp.castKey,
      knockback: d.knockback?.tick, poiseDamage: d.poiseDamage?.tick,
      comboGain: d.comboGain?.perTick, furyGain: d.furyGain?.perTick,
      maxTargets: this.cap('maxTargetsPerTick', 24),
      tags: ['melee', 'slash', 'spin'], color: 0xe57373, visualIndex: sp.ticks,
    });
  }

  // 撃破フック（SkillManager.dispatchKill）。回転中に自分の攻撃で倒したときだけ延長する。
  onEnemyKilled(enemy, skillId) {
    const sp = this._spin; if (!sp) return;
    if (skillId !== this.id) return;
    const d = this.evoDef;
    const per = d.killExtend?.perKillMs || 180;
    const maxPerCast = d.killExtend?.maxPerCastMs || 1600;
    const maxCount = this.cap('maxKillExtendPerCast', 9);
    if (sp.extendedMs >= maxPerCast || sp.extendCount >= maxCount) return;
    const add = Math.min(per, maxPerCast - sp.extendedMs);
    sp.leftMs = Math.min(sp.leftMs + add, this.cap('maxSpinDurationMs', 5200));
    sp.extendedMs += add;
    sp.extendCount += 1;
    this.scene.skills.recordExtra(this.id, 'killExtensions', 1, 'add');
    void enemy;
  }

  get spinning() { return !!this._spin; }

  serializeState() { return { cdLeft: this._cd, spinLeftMs: this._spin ? this._spin.leftMs : 0, spinTickLeft: this._spin ? this._spin.tickLeft : 0 }; }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    const left = Math.max(0, st.spinLeftMs || 0);
    this._spin = left > 0
      ? { leftMs: Math.min(left, this.cap('maxSpinDurationMs', 5200)), tickLeft: Math.max(0, st.spinTickLeft || 0), castKey: this.nextCastKey(), ticks: 0, extendedMs: 0, extendCount: 0 }
      : null;
  }
  destroy() { this._dead = true; this._spin = null; }
}
