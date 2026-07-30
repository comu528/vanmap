// 戦旗招集（M8-D・戦士 Wave2）: その場へ短時間の陣（field）を張る。
// - 陣は**常に 1 つだけ**。再設置は置換（refresh）で、重ねがけしない。
// - 効果が乗るのは**戦士本人が陣の内側にいるときだけ**。外へ出れば即座に解除される。
// - 効果値の上限・内外判定・保存 / 復元は WarriorCombatSystem.placeRallyField() へ一元化してある。
// - 他ジョブでは WarriorCombatSystem が無効なので、そもそも陣が張れない。
// - 演出の品質を落としてもバフの値は変わらない（陣は data で決まる）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class RallyingBannerSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; }
  canFire() { return true; } // 自陣なので敵がいなくても立てられる

  // 進化（血盟戦旗）が上書きするパラメータ。
  bannerParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      duration: Math.min(s.duration || 0, cfg.maxFieldMs ?? 12000), radius: s.radius || 0,
      stack: cfg.stack || 'refresh', worldMargin: cfg.worldMargin ?? 24,
      comboGrace: s.comboGrace || 0, furyGain: s.furyGain || 0,
      mitigation: s.mitigationValue || 0, meleeArea: s.meleeArea || 0,
      initialShock: s.initialShock || 0, initialPoise: s.initialPoise || 0,
      knockback: s.initialShock ? Math.round(s.initialShock * 1.2) : 0,
      comboGain: s.comboGain,
      killHealBonus: 0, perSecondCapBonus: 0,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const P = this.bannerParams();
    if (!(P.duration > 0) || !(P.radius > 0)) return;
    // 重ねがけ規則。'refresh' 以外なら、陣が生きている間は立て直さない（stack して強くならない）。
    if (P.stack !== 'refresh' && this.warrior && this.warrior.rallyActive) return;
    const castKey = this.newCastKey();
    const p = this.scene.player;
    // 陣の中心は必ず壁内へ収める（外周で立てても陣が世界の外へはみ出さない）。
    const wb = this.scene.combat.worldBounds ? this.scene.combat.worldBounds() : { w: 1600, h: 1200 };
    const m = Number.isFinite(P.worldMargin) ? P.worldMargin : 24;
    const fx = Math.max(m, Math.min(wb.w - m, p.x));
    const fy = Math.max(m, Math.min(wb.h - m, p.y));
    // 設置の衝撃（1 発動 1 回）。
    if (P.initialShock > 0) {
      this.scene.combat.meleeStrike({
        x: p.x, y: p.y, radius: this.meleeRadius(P.radius * 0.5), arc: Math.PI * 2, facing: 0,
        damage: P.initialShock, skillId: this.id, castKey,
        knockback: P.knockback, poiseDamage: P.initialPoise, poiseOnceSet: new Set(),
        comboGain: P.comboGain, furyGain: 0,
        tags: ['melee', 'blunt', 'area'], color: 0xffd54f, visualIndex: 0,
        visualCap: 'maxBannerRings',
      });
    }
    // 陣そのもの（1 つだけ・上限クランプは WarriorCombatSystem 側）。
    if (this.warrior) {
      this.warrior.placeRallyField(this.id, {
        x: fx, y: fy, durationMs: P.duration, radius: this.meleeRadius(P.radius),
        comboGrace: P.comboGrace, furyGain: P.furyGain, mitigation: P.mitigation,
        meleeArea: P.meleeArea, killHealBonus: P.killHealBonus, perSecondCapBonus: P.perSecondCapBonus,
      });
    }
    this.scene.skills.recordExtra(this.id, 'banners', 1, 'add');
  }

  update(dt, ctx) {
    if (this._dead) return;
    super.update(dt, ctx);
    // 内外判定は毎フレーム更新する（外に出た瞬間にバフが切れる）。
    const w = this.warrior;
    if (w && w.rallyActive) {
      const p = this.scene.player;
      const inside = w.updateRallyPosition(p.x, p.y);
      if (inside) this.scene.skills.recordExtra(this.id, 'insideMs', dt, 'add');
      this.scene.skills.recordExtra(this.id, 'rallyMs', dt, 'add');
    }
  }

  get fieldActive() { return !!(this.warrior && this.warrior.rallyActive); }
  get inField() { return !!(this.warrior && this.warrior.rallyInside); }

  // 陣そのものは WarriorCombatSystem.serializeTimedBuffs() が保存する（二重に保存しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st) this.restoreCd(st.cdLeft); }
  destroy() {
    this._dead = true;
    if (this.warrior) this.warrior.clearRallyField(this.id);
  }
}
