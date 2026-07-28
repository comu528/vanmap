// 戦吼（M8-C・戦士 Wave1）: 短時間 buff ＋ 自分中心の短距離 physical shock。
// - 新しい formal status を追加しない。バフは WarriorCombatSystem の timed buff として持つ。
// - **重ねがけしない**（refresh / 上書き）。連打しても持続と強度は上書きされるだけで無限 stack にならない。
// - 他ジョブへは効かない（WarriorCombatSystem 自体が戦士周回でしか enabled にならない）。
// - 通常敵を軽く押し返し、エリート/ボスへは少量の体勢削り。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class WarCrySkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; }
  canFire() { return true; } // 自己バフなので敵がいなくても吼えられる

  // 進化（軍神咆哮）が上書きするパラメータ。
  cryParams() {
    const s = this.stats || {};
    return {
      radius: s.radius || 0,
      damage: s.damage || 0,
      knockback: s.knockback || 0,
      poiseDamage: s.poiseDamage || 0,
      comboGain: s.comboGain,
      furyGain: s.furyGain,
      buff: {
        durationMs: s.buffDuration || 0,
        meleeDamageBonus: s.meleeDamageBonus || 0,
        furyGainBonus: s.furyGainBonus || 0,
        comboGraceBonus: s.comboGraceBonus || 0,
        graceRefill: 0,
        // 重ねがけ規則（data 由来）。'refresh' = 上書き更新。stack して強くなることはない。
        stack: this.def?.config?.buffStack,
      },
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const P = this.cryParams();
    const cfg = this.def?.config || {};
    const castKey = this.newCastKey();
    const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(P.radius), arc: Math.PI * 2, facing: 0,
      damage: P.damage, skillId: this.id, castKey,
      knockback: P.knockback, poiseDamage: P.poiseDamage,
      poiseOnceSet: cfg.poiseOncePerTargetPerCast !== false ? new Set() : null,
      comboGain: P.comboGain, furyGain: P.furyGain,
      tags: ['melee', 'blunt', 'area'], color: 0xffcc80, visualIndex: 0,
      visualCap: 'maxWarCryRings',
    });
    // バフは上書き（stack しない）。上限は balance.json の warrior.warCry でクランプされる。
    if (this.warrior) this.warrior.applyWarCryBuff(P.buff);
    this.scene.skills.recordExtra(this.id, 'cries', 1, 'add');
  }

  serializeState() { return { cdLeft: this._cd }; }
  // バフ本体は WarriorCombatSystem.serializeTimedBuffs() が持つ（スキル側では二重に保存しない）。
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { this._dead = true; }
}
