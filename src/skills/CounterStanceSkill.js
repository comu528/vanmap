// 迎撃の構え（M8-C・戦士 Wave1）: 能動 counter。
// 短い時間だけ「構え」を取り、その間に被弾すると軽減しつつ 1 回だけ反撃する。
// - 完全無効化はしない（軽減 + 反撃）。軽減の合計は WarriorCombatSystem 側で 70% にクランプされる。
// - 1 構えあたりの反撃回数に上限がある（maxCounters）。
// - 反撃から recordCast しない／反撃から新しい構えを作らない（counter → counter の再帰なし）。
// - 誰が反撃するかは WarriorCombatSystem.consumeCounterEvent() が決める（1 被弾 = 最大 1 系統）。
// - 被弾が無ければ空振りとして時間切れで終わる。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class CounterStanceSkill extends WarriorSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._window = { leftMs: 0, used: 0 };
    this._dead = false;
  }
  // 攻撃スキルではないので敵の有無を問わず構えられる。ただし CD は通常どおり。
  canFire() { return true; }

  // 進化（金剛迎撃）が上書きする構えのパラメータ。
  stanceParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      durationMs: s.windowDuration || 0,
      maxCounters: s.maxCounters || 1,
      mitigation: s.mitigationValue || 0,
      priority: cfg.counterPriority,
      counterCooldownMs: cfg.counterCooldownMs,
      counterDamage: s.counterDamage || 0,
      counterArea: s.counterArea || 0,
      knockback: s.knockback || 0,
      poiseDamage: s.poiseDamage || 0,
      comboGain: s.comboGain,
      furyGain: s.furyGain,
    };
  }

  update(dt, ctx) {
    if (this._window.leftMs > 0) {
      this._window.leftMs = Math.max(0, this._window.leftMs - dt);
      if (this._window.leftMs === 0) {
        // 空振り / 使い切りのどちらでも、時間切れで必ず閉じる。
        if (this._window.used === 0) this.scene.skills.recordExtra(this.id, 'whiffs', 1, 'add');
        this._window.used = 0;
        if (this.warrior) this.warrior.endCounterWindow(this.counterSource);
      }
    }
    super.update(dt, ctx);
  }

  fire() {
    if (this.scene.gameOver) return;
    const P = this.stanceParams();
    if (!(P.durationMs > 0)) return;
    this._window = { leftMs: P.durationMs, used: 0 };
    // 調停側へ登録（refresh。重ねがけしない）。
    if (this.warrior) {
      this.warrior.beginCounterWindow(this.counterSource, {
        durationMs: P.durationMs, maxCounters: P.maxCounters,
        priority: P.priority, mitigation: P.mitigation, counterCooldownMs: P.counterCooldownMs,
      });
    }
    this.scene.skills.recordExtra(this.id, 'stances', 1, 'add');
  }

  // 構え中の軽減（Player.takeDamage → onWarriorDamage が読む）。
  activeMitigation() { return this._window.leftMs > 0 ? (this.stanceParams().mitigation || 0) : 0; }
  get counterSource() { return this.id; }
  get counterReady() { return this._window.leftMs > 0 && this._window.used < this.stanceParams().maxCounters; }

  // 調停で選ばれたときだけ呼ばれる。反撃は 1 回で終わり、ここから recordCast も新しい構えも作らない。
  performCounter() {
    if (!this.counterReady) return false;
    this._window.used += 1;
    const P = this.stanceParams();
    const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(P.counterArea), arc: Math.PI * 2, facing: 0,
      damage: P.counterDamage, skillId: this.id,
      castKey: `${this.id}#counter${this._window.used}`,
      knockback: P.knockback, poiseDamage: P.poiseDamage,
      comboGain: P.comboGain, furyGain: P.furyGain,
      maxTargets: this.counterMaxTargets(),
      tags: ['melee', 'blunt', 'counter'], color: 0xb0bec5, visualIndex: 0,
      visualCap: 'maxCounterFlashes',
    });
    this.scene.skills.recordExtra(this.id, 'counters', 1, 'add');
    this.onCounterPerformed();
    return true;
  }
  // 進化（金剛迎撃）が反撃成功時の追加効果を差し込むためのフック。基礎では何もしない。
  onCounterPerformed() {}
  // 反撃の対象数上限（進化が safetyCaps で上書きする）。
  counterMaxTargets() { return this.scene.combat.skillCap('maxCounterWindows', 3) * 8; }

  serializeState() { return { cdLeft: this._cd, windowLeftMs: this._window.leftMs, counterUsed: this._window.used }; }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    // 使用回数も復元する＝再読込で構えを使い直せない。
    this._window = { leftMs: Math.max(0, st.windowLeftMs || 0), used: Math.max(0, st.counterUsed || 0) };
    if (this._window.leftMs > 0 && this.warrior) {
      const P = this.stanceParams();
      this.warrior.beginCounterWindow(this.counterSource, {
        durationMs: this._window.leftMs, maxCounters: P.maxCounters,
        priority: P.priority, mitigation: P.mitigation, counterCooldownMs: P.counterCooldownMs,
      });
      const w = this.warrior.counterWindows.get(this.counterSource);
      if (w) w.used = this._window.used;
    }
  }
  destroy() {
    this._dead = true;
    this._window = { leftMs: 0, used: 0 };
    if (this.warrior) this.warrior.endCounterWindow(this.counterSource);
  }
}
