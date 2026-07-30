// 修羅の構え（M8-E・戦士 最終Wave）: 攻めへ全てを傾ける短時間の構え。
// - **formal status を作らない**。WarriorCombatSystem 上の timed stance として持つ。
// - 同時に 1 つだけ。重ねがけせず、再発動は上書き（refresh）。
// - 攻撃補正は闘気解放との合成上限（combinedOffenseCap）で必ず頭打ちになる。
// - リスクは軽減の実効値の小幅低下だけ。**重装 / 闘気解放 / 不屈を無効化せず**、
//   合計軽減が 0 未満にもならない（下限は data の minMitigationAfterPenalty）。
// - 自傷もライフスティールもしない。構え中に打撃数 / 発動数が無料で増えることもない。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class BattleTranceSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; }
  canFire() { return true; } // 自己バフなので敵がいなくても構えられる

  // 進化（血染修羅）が上書きするパラメータ。
  tranceParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      duration: s.duration || 0,
      meleeDamageBonus: s.meleeDamageBonus || 0, attackSpeedBonus: s.attackSpeedBonus || 0,
      comboGraceBonus: s.comboGraceBonus || 0, furyGainBonus: s.furyGainBonus || 0,
      mitigationPenalty: s.mitigationPenalty || 0,
      initialShock: s.initialShock || 0, poiseDamage: s.poiseDamage || 0,
      knockback: s.initialShock ? Math.round(s.initialShock * 1.1) : 0,
      comboGain: s.comboGain,
      maxTranceMs: cfg.maxTranceMs ?? 10000, stack: cfg.stack || 'refresh',
      // 進化のみ: 構え中の撃破回復の小幅強化（既存の毎秒 cap は共有したまま）。
      killHealBonus: 0, perSecondCapBonus: 0,
    };
  }

  fire() {
    if (this._dead || this.scene.gameOver) return;
    const P = this.tranceParams();
    if (!(P.duration > 0)) return;
    const w = this.warrior;
    // 構えの本数上限（品質と data の小さい方）。0 なら構えない。
    if (this.scene.combat.skillCap('maxTranceStances', 1) < 1) return;
    // 重ねがけしない。'refresh' 以外なら構え中は構え直さない。
    if (P.stack !== 'refresh' && w && w.tranceActive) return;
    const castKey = this.newCastKey();
    const p = this.scene.player;
    // 構えに入る衝撃（1 発動 1 回）。
    if (P.initialShock > 0) {
      this.scene.combat.meleeStrike({
        x: p.x, y: p.y, radius: this.meleeRadius(this.def?.meleeRange || 40), arc: Math.PI * 2, facing: 0,
        damage: P.initialShock, skillId: this.id, castKey,
        knockback: P.knockback, poiseDamage: P.poiseDamage, poiseOnceSet: new Set(),
        comboGain: P.comboGain, furyGain: 0,
        tags: ['melee', 'blunt', 'area'], color: 0xff8a65, visualIndex: 0,
        visualCap: 'maxTranceAuras',
      });
    }
    if (w) {
      w.beginBattleTrance(this.id, {
        durationMs: Math.min(P.duration, P.maxTranceMs),
        meleeDamageBonus: P.meleeDamageBonus, attackSpeedBonus: P.attackSpeedBonus,
        comboGraceBonus: P.comboGraceBonus, furyGainBonus: P.furyGainBonus,
        mitigationPenalty: P.mitigationPenalty,
        killHealBonus: P.killHealBonus, perSecondCapBonus: P.perSecondCapBonus,
      });
    }
    this.scene.skills.recordExtra(this.id, 'trances', 1, 'add');
  }

  update(dt, ctx) {
    if (this._dead) return;
    super.update(dt, ctx);
    if (this.warrior && this.warrior.tranceActive) this.scene.skills.recordExtra(this.id, 'tranceMs', dt, 'add');
  }

  get tranceActive() { return !!(this.warrior && this.warrior.tranceActive); }

  // 構えそのものは WarriorCombatSystem.serializeTimedBuffs() が保存する（二重に保存しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st) this.restoreCd(st.cdLeft); }
  destroy() {
    this._dead = true;
    if (this.warrior) this.warrior.endBattleTrance(this.id);
  }
}
