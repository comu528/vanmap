// 一騎討ち（M8-E・戦士 最終Wave）: 一体を選んで決闘を挑む。
// - 対象の優先度は ボス > エリート > 高 HP の通常敵。判断は BattleScene.pickDuelTarget() へ一元化。
// - **formal status を作らない**。相手へ debuff を貼らず、戦士本人の補正としてだけ効く。
// - 決闘対象は常に 1 体。再発動は置換（refresh / 再選択）で、重ねがけしない。
// - 敵オブジェクトは保持しない（WarriorCombatSystem が安定 runtime id だけを持つ）。
// - 対象の死亡 / プール返却 / Scene 終了で必ず解除される。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class DuelChallengeSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies; }

  // 進化（覇王討ち）が上書きするパラメータ。
  duelParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      duration: s.duration || 0, range: s.range || 0,
      meleeDamageBonus: s.meleeDamageBonus || 0, poiseDamageBonus: s.poiseDamageBonus || 0,
      furyGainBonus: s.furyGainBonus || 0,
      normalTargetHpPriority: s.normalTargetHpPriority || 0,
      initialStrike: s.initialStrike || 0, poiseDamage: s.poiseDamage || 0,
      knockback: s.initialStrike ? Math.round(s.initialStrike * 0.8) : 0,
      comboGain: s.comboGain, furyGain: s.furyGain,
      maxDuelMs: cfg.maxDuelMs ?? 12000, stack: cfg.stack || 'refresh',
      // 進化のみ: 再選択と体勢崩しによる延長。
      maxRetargets: 0, retargetRange: 0, extendPerBreakMs: 0, maxExtensionMs: 0,
    };
  }

  fire() {
    if (this._dead || this.scene.gameOver) return;
    const P = this.duelParams();
    if (!(P.duration > 0) || !(P.range > 0)) return;
    // 重ねがけしない。'refresh' 以外なら決闘中は挑み直さない。
    if (P.stack !== 'refresh' && this.warrior && this.warrior.duelActive) return;
    const p = this.scene.player;
    const castKey = this.newCastKey();
    const r = this.scene.combat.beginDuel(this.id, p.x, p.y, {
      range: this.meleeRadius(P.range),
      durationMs: Math.min(P.duration, P.maxDuelMs),
      meleeDamageBonus: P.meleeDamageBonus, poiseDamageBonus: P.poiseDamageBonus,
      furyGainBonus: P.furyGainBonus, normalTargetHpPriority: P.normalTargetHpPriority,
      maxRetargets: P.maxRetargets, retargetRange: this.meleeRadius(P.retargetRange),
      extendPerBreakMs: P.extendPerBreakMs, maxExtensionMs: P.maxExtensionMs,
      skillId: this.id,
    });
    if (!r) { this.scene.skills.recordExtra(this.id, 'misses', 1, 'add'); return; }
    this.scene.skills.recordExtra(this.id, 'duels', 1, 'add');
    this.scene.skills.recordExtra(this.id, `duel_${r.kind}`, 1, 'add');
    // 挑みかかる一撃（1 発動 1 回）。決闘対象へだけ当てる。
    if (P.initialStrike > 0 && r.target) {
      this.scene.combat.meleeStrike({
        x: p.x, y: p.y, radius: this.meleeRadius(P.range), arc: 1.0,
        facing: Math.atan2(r.target.y - p.y, r.target.x - p.x),
        damage: P.initialStrike, skillId: this.id, castKey,
        knockback: P.knockback, poiseDamage: P.poiseDamage, poiseOnceSet: new Set(),
        comboGain: P.comboGain, furyGain: P.furyGain,
        maxTargets: this.scene.combat.skillCap('maxDuelTargets', 1),
        tags: ['melee', 'duel'], color: 0xffab91, visualIndex: 0,
        visualCap: 'maxDuelMarkers',
      });
    }
  }

  update(dt, ctx) {
    if (this._dead) return;
    super.update(dt, ctx);
    const w = this.warrior;
    if (!w || !w.duelActive) return;
    // 対象が消えていれば解除（進化のみ 1 回だけ近距離の格上へ挑み直せる）。
    const P = this.duelParams();
    this.scene.combat.refreshDuel({
      retargetRange: this.meleeRadius(P.retargetRange),
      normalTargetHpPriority: P.normalTargetHpPriority,
    });
    if (w.duelActive) this.scene.skills.recordExtra(this.id, 'duelMs', dt, 'add');
  }

  get duelActive() { return !!(this.warrior && this.warrior.duelActive); }

  // 決闘そのものは WarriorCombatSystem.serializeTimedBuffs() が保存する（二重に保存しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() {
    this._dead = true;
    if (this.warrior) this.warrior.clearDuelTarget(this.id, 'destroy');
  }
}
