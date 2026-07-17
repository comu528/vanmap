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

  // JSON のレベル別値に、スキル熟練度ボーナス（M3）とパッシブ（M6-A: area/duration）を掛けた実効値を返す。
  // パッシブ未取得かつ熟練度Lv1 では恒等（M5-B 以前の威力と一致）。
  // 適用順: 基礎値 → 熟練度(damage/cooldown/radius) → パッシブ(area/duration)。
  //   ※ ダメージのパッシブは dealDamage、クールダウンのパッシブは update で適用する（二重適用しない）。
  get stats() {
    const raw = this.rawStats;
    if (!raw) return raw;
    const b = this.scene.skills?.masteryBonusFor?.(this.id);
    const pm = this.scene.passives;
    const areaMul = pm ? pm.getAreaMultiplier() : 1;
    const durMul = pm ? pm.getDurationMultiplier() : 1;
    const pVer = pm ? pm.version : 0;
    const noMastery = !b || (b.damageMult === 1 && b.cooldownMult === 1 && b.radiusMult === 1);
    if (noMastery && areaMul === 1 && durMul === 1) return raw; // 恒等
    const mLevel = b ? b.level : 0;
    if (this._cacheLevel === this.level && this._cacheVer === mLevel && this._cachePVer === pVer && this._cache) return this._cache;
    const dmul = b ? b.damageMult : 1;
    const cmul = b ? b.cooldownMult : 1;
    const rmul = b ? b.radiusMult : 1;
    const adj = { ...raw };
    if (adj.damage != null) adj.damage = raw.damage * dmul;
    if (adj.cooldown != null) adj.cooldown = raw.cooldown * cmul;
    if (adj.radius != null) adj.radius = raw.radius * rmul * areaMul;
    if (adj.explosionRadius != null) adj.explosionRadius = raw.explosionRadius * rmul * areaMul;
    if (adj.duration != null) adj.duration = raw.duration * durMul;
    this._cache = adj; this._cacheLevel = this.level; this._cacheVer = mLevel; this._cachePVer = pVer;
    return adj;
  }

  setLevel(level) { this.level = Math.max(1, Math.min(this.maxLevel, level)); this.onLevelChanged(); }
  onLevelChanged() {}

  visualScale() { return EffectManager.scaleForVisual(this.stats?.visual); }

  // パッシブのクールダウン倍率（未取得なら 1）。安全下限は PassiveManager 側でクランプ。
  passiveCooldownMult() { return this.scene.passives ? this.scene.passives.getCooldownMultiplier() : 1; }
  passiveAreaMult() { return this.scene.passives ? this.scene.passives.getAreaMultiplier() : 1; }
  passiveDurationMult() { return this.scene.passives ? this.scene.passives.getDurationMultiplier() : 1; }

  update(dt, ctx) {
    this._cd -= dt;
    if (this._cd > 0) return;
    if (!this.canFire(ctx)) return;
    this._cd = (this.stats?.cooldown ?? 1000) * this.passiveCooldownMult();
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
