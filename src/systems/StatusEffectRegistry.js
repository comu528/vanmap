// StatusEffectRegistry（Milestone 7-A）: data/status-effects.json の状態定義・設定を保持し、
// 種別(kind)・索引可否・対象エンティティ・ボス方針などの照会を提供する純ロジック。
// Phaser/DOM 非依存で Node からテスト可能。数値・方針はデータの正（コードへ散在させない）。
//
// 将来 burning/chill/frozen/poison/bleed/shock/curse/stun/slow/vulnerability を追加できる構造。
// M7-A では burning/chill/frozen/freeze_immunity/frostbreak_vulnerability を正式に扱う。

const KINDS = ['timed', 'scalar', 'damageOverTime', 'control', 'immunity', 'vulnerability'];
const ENTITY_TYPES = ['normal', 'elite', 'boss'];

function asArr(v) { return Array.isArray(v) ? v : []; }
function num(v, d = 0) { return (typeof v === 'number' && Number.isFinite(v)) ? v : d; }

export class StatusEffectRegistry {
  // data: data/status-effects.json 全体（{ statusEffects, freeze, bossFrostbreak, shatter }）。
  constructor(data) {
    this._data = data || {};
    this._byId = new Map();
    for (const def of asArr(this._data.statusEffects)) {
      if (def && def.id) this._byId.set(def.id, def);
    }
  }

  static get KINDS() { return KINDS.slice(); }
  static get ENTITY_TYPES() { return ENTITY_TYPES.slice(); }

  has(id) { return this._byId.has(id); }
  get(id) { return this._byId.get(id) || null; }
  ids() { return Array.from(this._byId.keys()); }
  all() { return Array.from(this._byId.values()); }
  enabledIds() { return this.all().filter((d) => d.enabled !== false).map((d) => d.id); }

  kindOf(id) { const d = this.get(id); return d ? d.kind : null; }
  isKindValid(id) { const k = this.kindOf(id); return k != null && KINDS.includes(k); }
  isIndexable(id) { const d = this.get(id); return !!(d && d.indexable); }
  elementOf(id) { const d = this.get(id); return d ? (d.element || null) : null; }
  bossPolicy(id) { const d = this.get(id); return d ? (d.bossPolicy || 'normal') : 'normal'; }
  refreshPolicy(id) { const d = this.get(id); return d ? (d.refreshPolicy || 'refresh') : 'refresh'; }
  stackMode(id) { const d = this.get(id); return d ? (d.stackMode || 'refresh') : 'refresh'; }
  durationOf(id) { const d = this.get(id); return d ? num(d.duration, 0) : 0; }
  maxDurationOf(id) { const d = this.get(id); return d ? num(d.maxDuration, 0) : 0; }
  decayRateOf(id) { const d = this.get(id); return d ? num(d.decayRate, 0) : 0; }

  // 対象エンティティ種別に適用可能か（affectedEntityTypes 未指定は全種別）。
  affects(id, entityType) {
    const d = this.get(id);
    if (!d) return false;
    const types = asArr(d.affectedEntityTypes);
    if (types.length === 0) return true;
    return types.includes(entityType);
  }

  // ---- 設定（数値の正） ----
  freezeConfig() { return this._data.freeze || {}; }
  bossFrostbreakConfig() { return this._data.bossFrostbreak || {}; }
  shatterConfig() { return this._data.shatter || {}; }

  // 通常敵/エリートの冷気プロファイル（entityType: 'normal' | 'elite'）。
  freezeProfile(entityType) {
    const f = this.freezeConfig();
    return (entityType === 'elite' ? f.elite : f.normal) || {};
  }
}
