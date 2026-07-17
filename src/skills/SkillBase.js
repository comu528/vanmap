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
    // ジョブレベル（M6-C）: 火属性範囲は stats の radius/explosionRadius へ乗算（火ダメージは dealDamage 側で適用）。
    // 周回開始時に凍結された jobMods を使うため周回中は不変（キャッシュは熟練度＋パッシブ version で無効化）。
    const jm = this.scene.jobMods;
    const jArea = jm ? jm.fireAreaMult() : 1;
    const jExpArea = jm ? jm.explosionAreaMult() : 1;
    const noMastery = !b || (b.damageMult === 1 && b.cooldownMult === 1 && b.radiusMult === 1);
    if (noMastery && areaMul === 1 && durMul === 1 && jArea === 1 && jExpArea === 1) return raw; // 恒等（Lv1/未取得＝M6-B と一致）
    const mLevel = b ? b.level : 0;
    if (this._cacheLevel === this.level && this._cacheVer === mLevel && this._cachePVer === pVer && this._cache) return this._cache;
    const dmul = b ? b.damageMult : 1;
    const cmul = b ? b.cooldownMult : 1;
    const rmul = b ? b.radiusMult : 1;
    const adj = { ...raw };
    if (adj.damage != null) adj.damage = raw.damage * dmul;
    if (adj.cooldown != null) adj.cooldown = raw.cooldown * cmul;
    if (adj.radius != null) adj.radius = raw.radius * rmul * areaMul * jArea;
    if (adj.explosionRadius != null) adj.explosionRadius = raw.explosionRadius * rmul * areaMul * jArea * jExpArea;
    if (adj.duration != null) adj.duration = raw.duration * durMul;
    this._cache = adj; this._cacheLevel = this.level; this._cacheVer = mLevel; this._cachePVer = pVer;
    return adj;
  }

  setLevel(level) { this.level = Math.max(1, Math.min(this.maxLevel, level)); this.onLevelChanged(); }
  onLevelChanged() {}

  visualScale() { return EffectManager.scaleForVisual(this.stats?.visual); }

  // クールダウン倍率（未取得なら 1）。パッシブ「高速詠唱」＋ジョブレベル（Lv20/Lv90）を合成し、
  // 既存の安全下限（PassiveManager._cooldownMin）でクランプする（下限を超えて短縮しない）。
  // 名前は互換のため passiveCooldownMult のままだが、ジョブCDも含む共通経路（M6-C）。
  passiveCooldownMult() {
    const pm = this.scene.passives;
    const passiveMult = pm ? pm.getMult('cooldown') : 1; // クランプ前の生値
    const jobMult = this.scene.jobMods ? this.scene.jobMods.cooldownMult() : 1;
    const floor = pm ? pm._cooldownMin : 0.5;
    return Math.max(floor, passiveMult * jobMult);
  }
  // 範囲倍率（未取得なら 1）。パッシブ「焦熱拡張」＋ジョブレベルの火属性範囲（+0.10%/Lv）を合成。
  passiveAreaMult() {
    const p = this.scene.passives ? this.scene.passives.getAreaMultiplier() : 1;
    const j = this.scene.jobMods ? this.scene.jobMods.fireAreaMult() : 1;
    return p * j;
  }
  passiveDurationMult() { return this.scene.passives ? this.scene.passives.getDurationMultiplier() : 1; }
  // 爆発範囲の追加倍率（Lv40）。爆発を生成するスキルが radius へ乗算する（fireArea とは別枠の追加）。
  explosionAreaMult() { return this.scene.jobMods ? this.scene.jobMods.explosionAreaMult() : 1; }

  // 火属性 projectile スキルの発射数（M6-C Lv80 の発射数+1＋パッシブ projectileCount 加算）。
  // 発射数を持つスキルのみが呼ぶ（防御・召喚物数・分裂世代には適用しない）。呼び出し側で skillCaps を守る。
  fireProjectileCount(base) {
    const j = this.scene.jobMods ? this.scene.jobMods.projectileCountBonus() : 0;
    const p = this.scene.passives ? this.scene.passives.getProjectileCountBonus() : 0;
    return Math.max(1, (base || 1) + j + p);
  }

  // 残響詠唱（M6-C）: このスキルの「攻撃挙動」を威力倍率つきで安全に再実行する。
  // 既定は fire(ctx) の再実行（弾/設置/召喚などの攻撃挙動を再発動）。カウンターは進めない（scene 側で保証）。
  echoCast(ctx) { this.fire(ctx); }
  get isDefensive() { return false; }
  get isReactive() { return false; }

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
