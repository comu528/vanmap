// 刃防陣（M8-D・戦士 Wave2）: 短時間の能動防御 ＋ ごく近距離への周期斬り。
// - 反撃（counter）ではない。被弾に反応せず、構えている間ずっと効果が続く。
// - 弾を完全無効化しない（軽減のみ。合計は 70% でクランプ）。
// - tick では recordCast しない（1 発動 = 1 recordCast）。
// - 旋風斬より狭く・低火力・防御寄り。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class BladeGuardSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._guard = null; this._dead = false; }
  canFire() { return !this._guard; } // 防御なので敵がいなくても構えられる

  guardParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      damage: s.damage || 0, duration: s.duration || 0, tickInterval: s.tickInterval || 300,
      radius: s.radius || 0, mitigation: s.mitigationValue || 0,
      poiseDamage: s.poiseDamage || 0, maxTargets: s.maxTargets || 4,
      comboGain: s.comboGain, furyGain: s.furyGain,
      maxGuardMs: cfg.maxGuardMs ?? 4000,
      // true なら 1 発動につき同一敵へ体勢削りは 1 回だけ。false なら tick ごとに削る。
      poiseOncePerCast: cfg.poiseOncePerCast === true,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const P = this.guardParams();
    if (!(P.duration > 0)) return;
    this._guard = {
      castKey: this.newCastKey(), leftMs: Math.min(P.duration, P.maxGuardMs), tickLeft: 0, ticks: 0,
      poised: P.poiseOncePerCast ? new Set() : null,
    };
    this.scene.skills.recordExtra(this.id, 'guards', 1, 'add');
  }

  // 破棄後は発動も進行中処理も一切動かさない（遅延処理のリーク防止）。
  update(dt, ctx) { if (this._dead) return; super.update(dt, ctx); this._updateGuard(dt); }

  _updateGuard(dt) {
    const G = this._guard; if (!G) return;
    const P = this.guardParams();
    G.leftMs -= dt;
    G.tickLeft -= dt;
    this.scene.skills.recordExtra(this.id, 'guardMs', dt, 'add');
    if (this.warrior) this.warrior.telemetry.guardUptimeMs += dt;
    const budget = this.scene.combat.skillCap('maxGuardTicksPerFrame', 2);
    let n = 0;
    while (G.tickLeft <= 0 && n < budget && G.leftMs > -P.tickInterval) {
      G.tickLeft += Math.max(60, P.tickInterval);
      G.ticks += 1; n += 1;
      this._tick(G, P);
    }
    if (G.leftMs <= 0) { this._guard = null; }
  }

  _tick(G, P) {
    const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(P.radius), arc: Math.PI * 2, facing: 0,
      damage: P.damage, skillId: this.id, castKey: G.castKey,
      knockback: 0, poiseDamage: P.poiseDamage, poiseOnceSet: G.poised || undefined,
      comboGain: P.comboGain, furyGain: P.furyGain,
      maxTargets: P.maxTargets,
      tags: ['melee', 'slash', 'defense'], color: 0xb0bec5, visualIndex: G.ticks,
      visualCap: 'maxGuardBladeVisuals',
    });
    if (this.warrior) this.warrior.noteGuardTick();
    this.scene.skills.recordExtra(this.id, 'ticks', 1, 'add');
  }

  get guarding() { return !!this._guard; }
  // 構え中の軽減（Player.takeDamage → onWarriorDamage が読む）。無効化ではない。
  activeMitigation() { return this._guard ? (this.guardParams().mitigation || 0) : 0; }

  serializeState() {
    return { cdLeft: this._cd, guardLeftMs: this._guard ? this._guard.leftMs : 0, guardTicks: this._guard ? this._guard.ticks : 0 };
  }
  restoreState(st) {
    if (!st) return;
    this.restoreCd(st.cdLeft);
    const left = Math.max(0, st.guardLeftMs || 0);
    const P = this.guardParams();
    // 「再開」であり「二重化」ではない: 残り時間と消化済み tick 数を引き継ぐ。
    this._guard = left > 0
      ? { castKey: this.nextCastKey(), leftMs: Math.min(left, P.maxGuardMs), tickLeft: 0, ticks: Math.max(0, st.guardTicks || 0), poised: P.poiseOncePerCast ? new Set() : null }
      : null;
  }
  destroy() { this._dead = true; this._guard = null; }
}
