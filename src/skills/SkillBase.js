// スキルの基底クラス。クールダウン管理と、JSON からのレベル別パラメータ取得を共通化する。
// 各スキルは fire(ctx) を実装する。ダメージは scene.combat 経由で数値計算し、
// 見た目は scene.effects 経由で描画する（判定と演出を分離）。

import { DataManager } from '../systems/DataManager.js';
import { EffectManager } from '../systems/EffectManager.js';

export class SkillBase {
  constructor(scene, id, level = 1) {
    this.scene = scene;
    this.id = id;
    this.level = level;
    this._cd = 0;
    this._initCd = true; // 初回は少し撃てるように 0 開始
  }

  get def() { return DataManager.getSkill(this.id); }
  get name() { return this.def?.name || this.id; }
  get maxLevel() { return this.def?.maxLevel || 8; }

  get rawStats() { return DataManager.getSkillLevel(this.id, this.level); }

  // JSON のレベル別値に、スキル熟練度ボーナス（M3）を掛けた実効値を返す。
  // 熟練度レベル1では恒等（M2 の威力と一致）。結果はレベル/版数でキャッシュする。
  get stats() {
    const raw = this.rawStats;
    if (!raw) return raw;
    const b = this.scene.skills?.masteryBonusFor?.(this.id);
    if (!b || (b.damageMult === 1 && b.cooldownMult === 1 && b.radiusMult === 1)) return raw;
    if (this._cacheLevel === this.level && this._cacheVer === b.level && this._cache) return this._cache;
    const adj = { ...raw };
    if (adj.damage != null) adj.damage = raw.damage * b.damageMult;
    if (adj.cooldown != null) adj.cooldown = raw.cooldown * b.cooldownMult;
    if (adj.radius != null) adj.radius = raw.radius * b.radiusMult;
    if (adj.explosionRadius != null) adj.explosionRadius = raw.explosionRadius * b.radiusMult;
    this._cache = adj; this._cacheLevel = this.level; this._cacheVer = b.level;
    return adj;
  }

  setLevel(level) { this.level = Math.max(1, Math.min(this.maxLevel, level)); this.onLevelChanged(); }
  onLevelChanged() {}

  visualScale() { return EffectManager.scaleForVisual(this.stats?.visual); }

  update(dt, ctx) {
    this._cd -= dt;
    if (this._cd > 0) return;
    if (!this.canFire(ctx)) return;
    this._cd = this.stats?.cooldown ?? 1000;
    this.scene.skills.recordCast(this.id);
    this.fire(ctx);
  }

  // 既定では画面内に敵がいるときだけ発動。常時発動系は override する。
  canFire(ctx) { return ctx.hasEnemies; }

  // 各スキルで実装
  fire(ctx) {}

  // 永続的な見た目（周回する炎など）の破棄フック
  destroy() {}
}
