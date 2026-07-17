// 進化スキルの基底。data/skill-evolutions.json の定義（evoDef）を使い、通常スキルとは別体系で動く。
// 進化スキルは単一形態（レベル固定・これ以上強化されない）。安全上限は evoDef.safetyCaps から読む。

import { SkillBase } from './SkillBase.js';
import { DataManager } from '../systems/DataManager.js';

export class EvolvedSkillBase extends SkillBase {
  constructor(scene, id, level = 1) {
    super(scene, id, level);
    this.evoDef = DataManager.getEvolution(id) || {};
    this.baseSkillId = this.evoDef.baseSkillId;
    this.isEvolved = true;
  }

  get name() { return this.evoDef.displayName || this.id; }
  get maxLevel() { return 1; }
  get rawStats() { return null; }
  get stats() { return null; }

  cap(key, fallback) {
    const v = this.evoDef.safetyCaps?.[key];
    return (typeof v === 'number') ? v : fallback;
  }

  // 熟練度Lv20 由来の追加効果（BattleScene 開始時に scene._evolvedBonuses へ格納）。
  evolvedBonus() { return this.scene._evolvedBonuses?.[this.id] || {}; }

  // 転生「連鎖拡張」ぶんの追加連鎖（安全上限内でクランプするのは呼び出し側）。
  get chainBonus() { return this.scene.chainBonus || 0; }

  // クールダウン発火（evoDef.cooldown を使用）。連続系スキルは update を上書きする。
  // パッシブのクールダウン倍率を適用（未取得なら 1＝進化前後の挙動は不変）。
  update(dt, ctx) {
    this._cd -= dt;
    if (this._cd > 0) return;
    if (!this.canFire(ctx)) return;
    this._cd = (this.evoDef.cooldown ?? 1000) * this.passiveCooldownMult();
    this.scene.skills.recordCast(this.id);
    this.fire(ctx);
  }
}
