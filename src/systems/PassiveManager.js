// PassiveManager（Milestone 6-A）: 所持パッシブの level 管理と、modifier の共通集計を担う。
// パッシブ効果を各スキルへハードコードせず、ここで集計した倍率/加算を active スキルが取得する。
// 将来 damage/cooldown/area/duration/projectileCount/projectileSpeed/pierce/critical/
// movementSpeed/summonCount/statusEffect 等の modifier を足しやすい構造。
//
// 適用順（設計）: 基礎値(JSON levels) → 熟練度(SkillBase.stats) → パッシブ(area/duration は stats、
//   damage は dealDamage、cooldown は update) → 恒久強化/魂炎(dealDamage の bonus)。同じ倍率は二重適用しない。

export class PassiveManager {
  constructor(scene) {
    this.scene = scene;
    this.levels = new Map();   // id -> level
    this.picks = new Map();    // id -> このドラフトで選択された回数（統計用）
    this._defs = {};           // id -> passive def
    this._names = {};
    this._cooldownMin = 0.5;
    this._agg = this._empty();
    this.version = 0; // 集計更新のたびに増加（SkillBase.stats のキャッシュ無効化に使用）
  }

  _empty() { return { addMult: {}, subMult: {}, flat: {} }; }

  // パッシブ定義と設定を注入する（DataManager から）。
  setDefs(passiveDefs, cfg = {}) {
    this._defs = {};
    this._names = {};
    for (const p of passiveDefs || []) { this._defs[p.id] = p; this._names[p.id] = p.displayName || p.id; }
    this._cooldownMin = (cfg.passiveModifierDefaults && cfg.passiveModifierDefaults.cooldownMinMult) ?? 0.5;
    this._recompute();
  }

  has(id) { return this.levels.has(id); }
  getLevel(id) { return this.levels.get(id) || 0; }
  count() { return this.levels.size; }
  maxLevelOf(id) { return this._defs[id]?.maxLevel || 1; }
  isMaxed(id) { return this.getLevel(id) >= this.maxLevelOf(id); }

  acquireOrLevel(id) {
    if (!this._defs[id]) return 0;
    const cur = this.getLevel(id);
    const max = this.maxLevelOf(id);
    const next = Math.min(max, cur + 1);
    this.levels.set(id, next);
    this.picks.set(id, (this.picks.get(id) || 0) + 1);
    this._recompute();
    return next;
  }

  setLevel(id, level) {
    if (!this._defs[id]) return;
    this.levels.set(id, Math.max(0, Math.min(this.maxLevelOf(id), level)));
    this._recompute();
  }

  ownedList() {
    return Array.from(this.levels.entries()).map(([id, level]) => ({ id, level, name: this._names[id] || id }));
  }

  // 集計をやり直す（level 変更のたび）。
  _recompute() {
    const agg = this._empty();
    for (const [id, level] of this.levels) {
      const def = this._defs[id];
      if (!def || level <= 0) continue;
      for (const mod of def.modifiers || []) {
        const key = mod.key;
        const amount = (mod.perLevel || 0) * level;
        if (mod.op === 'subMult') agg.subMult[key] = (agg.subMult[key] || 0) + amount;
        else if (mod.op === 'add') agg.flat[key] = (agg.flat[key] || 0) + amount;
        else agg.addMult[key] = (agg.addMult[key] || 0) + amount; // addMult（既定）
      }
    }
    this._agg = agg;
    this.version += 1;
  }

  // 汎用: 倍率（1 + add - sub）。key ごとに使う。
  getMult(key) {
    const a = this._agg.addMult[key] || 0;
    const s = this._agg.subMult[key] || 0;
    return 1 + a - s;
  }
  getFlat(key) { return this._agg.flat[key] || 0; }

  // 共通経路（active スキルが最終値を取得する）。
  getDamageMultiplier() { return this.getMult('damage'); }
  getCooldownMultiplier() { return Math.max(this._cooldownMin, this.getMult('cooldown')); }
  getAreaMultiplier() { return this.getMult('area'); }
  getDurationMultiplier() { return this.getMult('duration'); }
  getProjectileCountBonus() { return Math.round(this.getFlat('projectileCount')); }
  getProjectileSpeedMultiplier() { return this.getMult('projectileSpeed'); }
  getMovementSpeedMultiplier() { return this.getMult('movementSpeed'); }

  // ---- セーブ/復元 ----
  serialize() { const o = {}; for (const [id, level] of this.levels) o[id] = level; return o; }
  loadFrom(obj) {
    if (!obj) return;
    for (const [id, level] of Object.entries(obj)) if (this._defs[id]) this.setLevel(id, level);
  }

  // 統計（active とは別体系。ダメージ統計は持たせない）。
  statsList() {
    return this.ownedList().map((p) => ({ id: p.id, level: p.level, picks: this.picks.get(p.id) || 0 }));
  }
}
