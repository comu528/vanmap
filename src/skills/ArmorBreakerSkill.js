// 兜割り（M8-C・戦士 Wave1）: 単体高体勢ダメージ。
// 最寄りのエリート/ボスを優先し、いなければ最寄りの通常敵へ重い上段斬りを叩き込む。
// 範囲は狭く発動は遅いが、1 発あたりのダメージと体勢削りが大きい。
// Job Lv80 で打撃数 +1。追加打撃では recordCast を増やさず、同一敵への体勢削りは 1 発動 1 回に制限する。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class ArmorBreakerSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies; }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const cfg = this.def?.config || {};
    const castKey = this.newCastKey();
    const range = this.meleeRadius(s.range);
    // 硬い相手（エリート/ボス）を優先して狙う。共通経路なので全敵総当たりはしない。
    const target = this.scene.combat.preferredMeleeTarget(
      this.scene.player.x, this.scene.player.y, range * 1.6, cfg.preferTough ? 'tough' : null,
    );
    const ang = target
      ? Math.atan2(target.y - this.scene.player.y, target.x - this.scene.player.x)
      : this.facing(range);
    const strikes = Math.min(
      this.strikeCount(s.strikes || 1),
      this.scene.combat.skillCap('maxOverheadStrikes', 3),
    );
    // 体勢削りは 1 発動につき同一敵 1 回だけ（追加打撃で体勢が二重に削れない）。
    const poised = cfg.poiseOncePerTargetPerCast !== false ? new Set() : null;
    this._strike(ang, castKey, poised, 0);
    const gap = cfg.strikeIntervalMs ?? 150;
    for (let k = 1; k < strikes; k++) {
      this.scene.time.delayedCall(k * gap, () => {
        if (this._dead || this.scene.gameOver) return;
        this._strike(ang, castKey, poised, k);
      });
    }
    this.scene.skills.recordExtra(this.id, 'strikes', strikes, 'add');
  }

  _strike(ang, castKey, poised, index) {
    const s = this.stats; if (!s) return;
    const p = this.scene.player;
    // ボスへの追加ダメージ（硬い相手を崩す役割の裏付け）。対象ごとに掛かるのではなく
    // 「ボスが含まれていれば」ではなく meleeStrike 内の 1 体ごとの判定で乗せるため係数として渡す。
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(s.range), arc: s.width, facing: ang,
      damage: s.damage, skillId: this.id, castKey,
      knockback: s.knockback, poiseDamage: s.poiseDamage, poiseOnceSet: poised,
      comboGain: s.comboGain, furyGain: s.furyGain,
      toughBonus: s.bossBonus,
      tags: ['melee', 'slash', 'stance_break'], color: 0xffab91, visualIndex: index,
      visualCap: 'maxOverheadSlashVisuals',
    });
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st) this.restoreCd(st.cdLeft); }
  destroy() { this._dead = true; }
}
