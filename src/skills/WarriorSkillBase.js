// WarriorSkillBase / WarriorEvolvedBase（Milestone 8-B）: 戦士スキルの共通土台。
// 各スキルが Scene の内部状態や profile へ直接触れず、必ず WarriorCombatSystem（scene.warrior）と
// combat API（scene.combat.meleeStrike）を経由するようにするための薄い基底。
//
// 共通の責務:
//   - 攻撃/詠唱速度（コンボ閾値・闘気解放・戦闘本能）をクールダウンへ反映する
//   - 近接範囲（コンボ閾値の meleeArea）を半径へ反映する
//   - 向き（facing）の決定を 1 か所にまとめる（敵密集方向 → 最寄り敵 → 移動方向 の順）
//   - Job Lv80「打撃数+1」を明示 flag のスキルだけへ適用する
//   - 1 発動 = 1 castKey（闘気・コンボの加算上限キー）を配る
//
// 戦士は残響/分身の対象外（data で echoPolicy/clonePolicy = forbidden）。
// そのため echoCast/cloneCast は実装せず、火の残響経路から無料の近接攻撃が増えることはない。

import { SkillBase } from './SkillBase.js';
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { appliesLv80ProjectileCount } from '../systems/SkillAudit.js';

function facingFor(scene, range) {
  const p = scene.player;
  const combat = scene.combat;
  // 1) 敵の密集地点（SpatialGrid 経由）。
  const spot = combat.densestPoint ? combat.densestPoint(range, 0) : null;
  if (spot) {
    const dx = spot.x - p.x, dy = spot.y - p.y;
    if (dx * dx + dy * dy > 1) return Math.atan2(dy, dx);
  }
  // 2) 最寄りの敵。
  const t = combat.nearestEnemy ? combat.nearestEnemy(p.x, p.y, range * 3) : null;
  if (t) return Math.atan2(t.y - p.y, t.x - p.x);
  // 3) 移動方向（停止中は右向き）。
  const v = p.body && p.body.velocity;
  if (v && (v.x !== 0 || v.y !== 0)) return Math.atan2(v.y, v.x);
  return p.flipX ? Math.PI : 0;
}

// 共通ミックスイン（クラス継承が 2 系統あるため関数で共有する）。
const warriorMixin = {
  get warrior() { return this.scene.warrior || null; },

  // 攻撃/詠唱速度をクールダウンへ反映（パッシブ「高速詠唱」相当の共通経路と乗算合成）。
  warriorCooldownMult(base) {
    const w = this.warrior;
    return base * (w ? w.cooldownMultiplier() : 1);
  },

  // 近接範囲（コンボ閾値 meleeArea × 既存パッシブ area × Job Lv 範囲成長）。
  meleeRadius(raw) {
    const w = this.warrior;
    return (raw || 0) * this.passiveAreaMult() * (w ? w.meleeAreaMultiplier() : 1);
  },

  facing(range) { return facingFor(this.scene, range || 80); },

  // Job Lv80「打撃数+1」。明示 flag（lv80ProjectileTarget:true）のスキルのみ。
  strikeCount(base) {
    const def = this.def || (this.evoDef || null);
    let n = Math.max(1, Math.round(base || 1));
    if (def && appliesLv80ProjectileCount(def)) {
      n += (this.scene.jobMods ? this.scene.jobMods.projectileCountBonus() : 0);
    }
    return Math.max(1, n);
  },

  // 1 発動ごとの一意キー（闘気・コンボの加算上限に使う）。hitGroup と同じ意味論。
  newCastKey() {
    const key = this.nextCastKey();
    this.noteCast();
    return key;
  },

  // 発動通知を伴わない castKey（保存復元で回転などを「再開」するときに使う）。
  nextCastKey() {
    this._castSeq = (this._castSeq || 0) + 1;
    return `${this.id}#${this._castSeq}`;
  },

  // 近接発動の通知（強靱の「近接発動直後」ウィンドウと meleeCasts 統計）。
  // newCastKey() を通す発動＝1 回の近接発動として数える（追加打撃・反撃では増えない）。
  noteCast() {
    const w = this.warrior;
    if (w) w.noteMeleeCast(this.id);
  },
};

export class WarriorSkillBase extends SkillBase {
  passiveCooldownMult() { return this.warriorCooldownMult(super.passiveCooldownMult()); }
}
export class WarriorEvolvedBase extends EvolvedSkillBase {
  passiveCooldownMult() { return this.warriorCooldownMult(super.passiveCooldownMult()); }
}
for (const proto of [WarriorSkillBase.prototype, WarriorEvolvedBase.prototype]) {
  for (const [k, v] of Object.entries(Object.getOwnPropertyDescriptors(warriorMixin))) {
    if (!(k in proto)) Object.defineProperty(proto, k, v);
  }
}

export { facingFor };
