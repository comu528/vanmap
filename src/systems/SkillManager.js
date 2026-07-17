// SkillManager: 所持スキルの取得・強化・更新・統計記録を統括する。
// 各スキルの与ダメージ/討伐数/発動回数/命中回数を記録し、リザルトと熟練度(将来)へ渡す。

import { DataManager } from './DataManager.js';
import { FireballSkill } from '../skills/FireballSkill.js';
import { FlamePillarSkill } from '../skills/FlamePillarSkill.js';
import { BurningTrailSkill } from '../skills/BurningTrailSkill.js';
import { OrbitingFlameSkill } from '../skills/OrbitingFlameSkill.js';
import { MeteorSkill } from '../skills/MeteorSkill.js';
import { InfernalBarrageSkill } from '../skills/InfernalBarrageSkill.js';
import { PurgatoryEruptionSkill } from '../skills/PurgatoryEruptionSkill.js';
import { EternalPyreSkill } from '../skills/EternalPyreSkill.js';
// M6-B: 新 active 10種
import { FlameLanceSkill } from '../skills/FlameLanceSkill.js';
import { ScatterFlameSkill } from '../skills/ScatterFlameSkill.js';
import { HomingWispSkill } from '../skills/HomingWispSkill.js';
import { ChainFlameSkill } from '../skills/ChainFlameSkill.js';
import { LavaBombSkill } from '../skills/LavaBombSkill.js';
import { FlameVortexSkill } from '../skills/FlameVortexSkill.js';
import { FireSpiritSkill } from '../skills/FireSpiritSkill.js';
import { PhoenixFeatherSkill } from '../skills/PhoenixFeatherSkill.js';
import { FlameBarrierSkill } from '../skills/FlameBarrierSkill.js';
import { DetonationMarkSkill } from '../skills/DetonationMarkSkill.js';
// M6-B: 新進化5種
import { ThousandFlameLancesSkill } from '../skills/ThousandFlameLancesSkill.js';
import { HundredWispParadeSkill } from '../skills/HundredWispParadeSkill.js';
import { SolarCoreCollapseSkill } from '../skills/SolarCoreCollapseSkill.js';
import { InfernalVortexWheelSkill } from '../skills/InfernalVortexWheelSkill.js';
import { ApocalypseChainSkill } from '../skills/ApocalypseChainSkill.js';

const REGISTRY = {
  fireball: FireballSkill,
  flame_pillar: FlamePillarSkill,
  burning_trail: BurningTrailSkill,
  orbiting_flame: OrbitingFlameSkill,
  meteor: MeteorSkill,
  // 進化スキル
  infernal_barrage: InfernalBarrageSkill,
  purgatory_eruption: PurgatoryEruptionSkill,
  eternal_pyre: EternalPyreSkill,
  // M6-B: 新 active
  flame_lance: FlameLanceSkill,
  scatter_flame: ScatterFlameSkill,
  homing_wisp: HomingWispSkill,
  chain_flame: ChainFlameSkill,
  lava_bomb: LavaBombSkill,
  flame_vortex: FlameVortexSkill,
  fire_spirit: FireSpiritSkill,
  phoenix_feather: PhoenixFeatherSkill,
  flame_barrier: FlameBarrierSkill,
  detonation_mark: DetonationMarkSkill,
  // M6-B: 新進化
  thousand_flame_lances: ThousandFlameLancesSkill,
  hundred_wisp_parade: HundredWispParadeSkill,
  solar_core_collapse: SolarCoreCollapseSkill,
  infernal_vortex_wheel: InfernalVortexWheelSkill,
  apocalypse_chain: ApocalypseChainSkill,
};

export class SkillManager {
  constructor(scene) {
    this.scene = scene;
    this.skills = new Map();   // id -> instance
    this.stats = new Map();    // id -> { casts, hits, kills, damage, maxLevel }
    this._masteryBonus = null; // ProgressionManager.masteryBonuses(profile)
    this._evolvedBase = new Set(); // 当該周回で進化済みの基礎スキルID
  }

  // ---- 進化 ----
  // 基礎スキルを進化スキルへ置換する（枠を消費しない）。当該周回で一度のみ。
  evolve(baseId) {
    const ev = DataManager.getEvolutionForBase(baseId);
    if (!ev) return null;
    if (this._evolvedBase.has(baseId)) return null;
    const evoId = ev.replacementSkillId;
    const Cls = REGISTRY[evoId];
    if (!Cls) return null;
    const old = this.skills.get(baseId);
    if (old && old.destroy) old.destroy();
    this.skills.delete(baseId);
    const sk = new Cls(this.scene, evoId, 1);
    this.skills.set(evoId, sk);
    this._evolvedBase.add(baseId);
    this._ensureStats(evoId);
    return evoId;
  }
  hasEvolved(baseId) { return this._evolvedBase.has(baseId); }
  get evolvedBaseIds() { return Array.from(this._evolvedBase); }
  restoreEvolved(list) { for (const b of list || []) this._evolvedBase.add(b); }

  // スキル熟練度ボーナス（戦闘開始時に一度セット）。
  setMasteryBonuses(bonusMap) { this._masteryBonus = bonusMap || null; }
  masteryBonusFor(id) { return this._masteryBonus ? this._masteryBonus[id] : null; }

  _ensureStats(id) {
    if (!this.stats.has(id)) this.stats.set(id, { casts: 0, hits: 0, kills: 0, damage: 0, maxLevel: 0 });
    return this.stats.get(id);
  }

  has(id) { return this.skills.has(id); }
  getLevel(id) { return this.skills.get(id)?.level || 0; }
  count() { return this.skills.size; }

  // アクティブ所持枠の使用数（進化は基礎スキルと同じ枠＝size は不変）。
  activeSlotCount() { return this.skills.size; }
  // ドラフト文脈用: 所持アクティブの id -> level（進化スキルも含む）。
  activeLevels() { const o = {}; for (const [id, sk] of this.skills) o[id] = sk.level; return o; }
  // 進化元となる基礎スキル id の集合（進化済みは基礎 id を返す）。
  baseActiveIds() {
    const ids = [];
    for (const id of this.skills.keys()) {
      const evo = DataManager.getEvolution(id);
      ids.push(evo ? evo.baseSkillId : id);
    }
    return ids;
  }

  // 取得（新規）または強化（+1）。最大レベルで頭打ち。
  // 新規取得時は熟練度の初期レベルボーナス（startLevel）を上乗せする。
  acquireOrLevel(id) {
    if (this.skills.has(id)) {
      const sk = this.skills.get(id);
      if (sk.level < sk.maxLevel) sk.setLevel(sk.level + 1);
      this._ensureStats(id).maxLevel = Math.max(this._ensureStats(id).maxLevel, sk.level);
      return sk.level;
    }
    const Cls = REGISTRY[id];
    if (!Cls) return 0;
    const startBonus = this.masteryBonusFor(id)?.startLevel || 0;
    const sk = new Cls(this.scene, id, 1);
    if (startBonus > 0) sk.setLevel(1 + startBonus);
    this.skills.set(id, sk);
    this._ensureStats(id).maxLevel = Math.max(this._ensureStats(id).maxLevel, sk.level);
    return sk.level;
  }

  setLevel(id, level) {
    if (!this.skills.has(id)) { this.acquireOrLevel(id); }
    const sk = this.skills.get(id);
    if (sk) { sk.setLevel(level); this._ensureStats(id).maxLevel = Math.max(this._ensureStats(id).maxLevel, sk.level); }
  }

  isMaxed(id) {
    const sk = this.skills.get(id);
    return sk ? sk.level >= sk.maxLevel : false;
  }

  ownedList() {
    return Array.from(this.skills.values()).map((s) => ({ id: s.id, name: s.name, level: s.level }));
  }

  update(dt, ctx) {
    for (const sk of this.skills.values()) sk.update(dt, ctx);
  }

  // 撃破フック（M6-B: 百鬼燎乱の分裂など）。スキルが onEnemyKilled を実装していれば呼ぶ。
  dispatchKill(enemy, skillId) {
    for (const sk of this.skills.values()) { if (sk.onEnemyKilled) sk.onEnemyKilled(enemy, skillId); }
  }

  // スキル固有 runtimeState の直列化/復元（M6-B: 不死鳥CD・障壁再使用 等）。
  serializeRuntime() {
    const out = {};
    for (const [id, sk] of this.skills) { if (sk.serializeState) { const s = sk.serializeState(); if (s) out[id] = s; } }
    return out;
  }
  restoreRuntime(obj) {
    if (!obj) return;
    for (const [id, state] of Object.entries(obj)) { const sk = this.skills.get(id); if (sk && sk.restoreState) sk.restoreState(state); }
  }

  // スキル固有統計（M6-B: 最高同時存在数・防御スキル統計 等）。
  recordExtra(id, key, value, mode = 'max') {
    const st = this._ensureStats(id);
    st.extra = st.extra || {};
    if (mode === 'max') st.extra[key] = Math.max(st.extra[key] || 0, value);
    else st.extra[key] = (st.extra[key] || 0) + value;
  }

  // ---- 統計 ----
  recordCast(id) { this._ensureStats(id).casts++; }
  recordHit(id) { this._ensureStats(id).hits++; }
  recordDamage(id, amount) { this._ensureStats(id).damage += amount; }
  recordKill(id) { this._ensureStats(id).kills++; }

  // 統計は進化前後の両方を含める（進化で置換された基礎スキルの記録も残す）。
  statsList() {
    return Array.from(this.stats.entries())
      .filter(([, st]) => (st.casts || st.damage || st.kills))
      .map(([id, st]) => ({
        id,
        name: DataManager.getSkill(id)?.name || DataManager.getEvolution(id)?.displayName || id,
        level: this.getLevel(id), ...st,
      }));
  }

  // ---- セーブ/復元 ----
  serialize() {
    const obj = {};
    for (const [id, sk] of this.skills) obj[id] = sk.level;
    return obj;
  }

  loadFrom(obj) {
    if (!obj) return;
    for (const [id, level] of Object.entries(obj)) {
      if (!REGISTRY[id]) continue;
      this.acquireOrLevel(id);
      this.setLevel(id, level);
    }
  }

  destroy() {
    for (const sk of this.skills.values()) if (sk.destroy) sk.destroy();
    this.skills.clear();
  }
}
