// 処刑斬（M8-C・戦士 Wave1）: 瀕死狙い。
// - 通常敵は HP 割合が executeThresholdNormal 以下なら確実に仕留める（＝残り HP ぶんのダメージを与える）。
//   即死用の別 API を作らず共通の dealDamage 経路を通すため、死亡イベント・撃破統計・撃破回復が二重に走らない。
// - エリートは処刑できず、失った HP に応じた追加ダメージのみ。
// - ボスも処刑できず、追加ダメージは bossMissingHpCap で頭打ちにする。
// 可否の判断は WarriorCombatSystem.executePolicy() に一元化してある（スキル側で isBoss を判定しない）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class ExecutionStrikeSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies; }

  // 進化（血断処刑）が上書きするパラメータ。基礎はスキルの levels から取る。
  executeParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      thresholdNormal: s.executeThresholdNormal || 0,
      missingHpBonusElite: s.missingHpBonusElite || 0,
      missingHpBonusBoss: s.missingHpBonusBoss || 0,
      bossMissingHpCap: cfg.bossMissingHpCap,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const castKey = this.newCastKey();
    const range = this.meleeRadius(s.range);
    const p = this.scene.player;
    // HP 割合が最も低い相手を狙う（共通経路・全敵総当たりなし）。
    const cfg = this.def?.config || {};
    const target = this.scene.combat.preferredMeleeTarget(p.x, p.y, range, cfg.preferLowHp ? 'lowHp' : null);
    const ang = target ? Math.atan2(target.y - p.y, target.x - p.x) : this.facing(range);
    this._swing(ang, castKey);
    this.scene.skills.recordExtra(this.id, 'swings', 1, 'add');
  }

  _swing(ang, castKey) {
    const s = this.stats; if (!s) return;
    const cfg = this.def?.config || {};
    const p = this.scene.player;
    const params = this.executeParams();
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(s.range), arc: s.arc, facing: ang,
      damage: s.damage, skillId: this.id, castKey,
      knockback: s.knockback, poiseDamage: s.poiseDamage,
      poiseOnceSet: cfg.poiseOncePerTargetPerCast !== false ? new Set() : null,
      comboGain: s.comboGain, furyGain: s.furyGain,
      execute: params,
      maxExecutes: this.scene.combat.skillCap('maxExecutesPerCast', 3),
      tags: ['melee', 'slash', 'execute'], color: 0xe57373, visualIndex: 0,
      visualCap: 'maxExecuteMarkers',
    });
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { this._dead = true; }
}
