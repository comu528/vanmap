// 不落の城壁（M8-B・盾撃の進化 / 補助: 重装 Lv4）:
// 打撃のあと短い「反撃構え（counter window）」を取る。構え中に被弾すると 1 回だけ反撃する。
// 反撃は 1 構えにつき 1 回（maxCountersPerWindow）で、反撃から recordCast も新しい構えも生まれない。
// 戦士の基礎能力「不屈（unyielding）」とは別処理（名称と役割は docs/warrior-design.md で区別）。
import { WarriorEvolvedBase } from './WarriorSkillBase.js';

export class UnyieldingFortressSkill extends WarriorEvolvedBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._window = { leftMs: 0, used: 0 };
    this._mitigationLeft = 0;
    this._dead = false;
  }
  canFire(ctx) { return !!ctx.hasEnemies; }

  update(dt, ctx) {
    if (this._window.leftMs > 0) {
      this._window.leftMs = Math.max(0, this._window.leftMs - dt);
      // M8-C: 構えが閉じたら調停側の登録も外す（古い構えが残らない）。
      if (this._window.leftMs === 0) { this._window.used = 0; if (this.warrior) this.warrior.endCounterWindow(this.counterSource); }
    }
    if (this._mitigationLeft > 0) this._mitigationLeft = Math.max(0, this._mitigationLeft - dt);
    super.update(dt, ctx);
  }

  fire() {
    if (this.scene.gameOver) return;
    const d = this.evoDef;
    const castKey = this.newCastKey();
    const strikes = Math.min(this.cap('maxStrikesPerCast', 3), d.projectileCount?.strikes || 2);
    const gap = d.projectileCount?.strikeIntervalMs || 120;
    const ang = this.facing(this.meleeRadius(d.area?.radius || 66));
    const poised = new Set();
    // 進化 data の「1 発動あたりコンボ/闘気の上限」をこの cast へ適用する。
    if (this.warrior) this.warrior.setCastLimits(castKey, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    this._strike(ang, castKey, poised, 0);
    for (let k = 1; k < strikes; k++) {
      this.scene.time.delayedCall(k * gap, () => {
        if (this._dead || this.scene.gameOver) return;
        this._strike(ang, castKey, poised, k);
      });
    }
    this._mitigationLeft = d.mitigation?.durationMs || 1500;
    this._window = { leftMs: d.counterWindow?.durationMs || 1600, used: 0 };
    // M8-C: 反撃の調停へ構えを登録する（1 被弾イベントで反撃するのは優先度最上位の 1 系統だけ）。
    // 実際に反撃できるかの最終判断は本スキルの _window が持ち、warrior 側は「誰が反撃するか」を決める。
    if (this.warrior) {
      this.warrior.beginCounterWindow(this.counterSource, {
        durationMs: this._window.leftMs,
        maxCounters: this._maxCounters(),
        priority: d.counterWindow?.priority,
        mitigation: d.mitigation?.value || 0,
        counterCooldownMs: d.counterWindow?.counterCooldownMs,
      });
    }
    this.scene.skills.recordExtra(this.id, 'counterWindows', 1, 'add');
  }

  _strike(ang, castKey, poised, index) {
    const d = this.evoDef; const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(d.area?.radius || 66), arc: d.area?.arc || 1.5, facing: ang,
      damage: d.damage?.bash || 34, skillId: this.id, castKey,
      knockback: d.knockback?.bash, poiseDamage: d.poiseDamage?.bash, poiseOnceSet: poised,
      comboGain: d.comboGain?.perBash, furyGain: d.furyGain?.perBash,
      maxTargets: this.cap('maxTargetsPerStrike', 24),
      tags: ['melee', 'blunt'], color: 0x90a4ae, visualIndex: index,
    });
  }

  activeMitigation() { return this._mitigationLeft > 0 ? (this.evoDef.mitigation?.value || 0) : 0; }
  // M8-C: 反撃の調停で使う識別子。BattleScene.onWarriorHit がこの値で反撃担当を探す。
  get counterSource() { return 'unyielding_fortress'; }
  performCounter(raw, applied) { return this.onPlayerHit(raw, applied); }
  get counterReady() { return this._window.leftMs > 0 && this._window.used < this._maxCounters(); }
  _maxCounters() {
    const d = this.evoDef;
    return Math.min(this.cap('maxCounterPerWindow', 1), d.counterWindow?.maxCountersPerWindow ?? 1,
      this.scene.combat.skillCap('maxCounterHits', 1));
  }

  // 被弾フック（Player.takeDamage → scene.onWarriorHit）。1 構えにつき 1 回だけ反撃する。
  // 反撃は recordCast せず、新しい counter window も作らない（無限 counter を作らない）。
  onPlayerHit() {
    if (!this.counterReady) return false;
    this._window.used += 1;
    const d = this.evoDef; const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(d.area?.counterRadius || 84), arc: Math.PI * 2, facing: 0,
      damage: d.damage?.counter || 70, skillId: this.id, castKey: `${this.id}#counter${this._window.used}`,
      knockback: d.knockback?.counter, poiseDamage: d.poiseDamage?.counter,
      comboGain: d.comboGain?.perCounter, furyGain: d.furyGain?.perCounter,   // 反撃で闘気/コンボを過剰獲得しない（data で 0）
      maxTargets: this.cap('maxTargetsPerStrike', 24),
      tags: ['melee', 'blunt', 'counter'], color: 0xffcc80, visualIndex: 50,
    });
    this.scene.skills.recordExtra(this.id, 'counters', 1, 'add');
    return true;
  }

  serializeState() {
    return { cdLeft: this._cd, windowLeftMs: this._window.leftMs, counterUsed: this._window.used, mitigationLeft: this._mitigationLeft };
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    this._window = { leftMs: Math.max(0, st.windowLeftMs || 0), used: Math.max(0, st.counterUsed || 0) };
    this._mitigationLeft = Math.max(0, st.mitigationLeft || 0);
  }
  destroy() {
    this._dead = true;
    this._window = { leftMs: 0, used: 0 };
    this._mitigationLeft = 0;
    if (this.warrior) this.warrior.endCounterWindow(this.counterSource);
  }
}
