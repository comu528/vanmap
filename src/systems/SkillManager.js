// SkillManager: 所持スキルの取得・強化・更新・統計記録を統括する。
// 各スキルの与ダメージ/討伐数/発動回数/命中回数を記録し、リザルトと熟練度(将来)へ渡す。

import { DataManager } from './DataManager.js';
import { FireballSkill } from '../skills/FireballSkill.js';
import { FlamePillarSkill } from '../skills/FlamePillarSkill.js';
import { BurningTrailSkill } from '../skills/BurningTrailSkill.js';
import { OrbitingFlameSkill } from '../skills/OrbitingFlameSkill.js';
import { MeteorSkill } from '../skills/MeteorSkill.js';

const REGISTRY = {
  fireball: FireballSkill,
  flame_pillar: FlamePillarSkill,
  burning_trail: BurningTrailSkill,
  orbiting_flame: OrbitingFlameSkill,
  meteor: MeteorSkill,
};

export class SkillManager {
  constructor(scene) {
    this.scene = scene;
    this.skills = new Map();   // id -> instance
    this.stats = new Map();    // id -> { casts, hits, kills, damage, maxLevel }
    this._masteryBonus = null; // ProgressionManager.masteryBonuses(profile)
  }

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

  // ---- 統計 ----
  recordCast(id) { this._ensureStats(id).casts++; }
  recordHit(id) { this._ensureStats(id).hits++; }
  recordDamage(id, amount) { this._ensureStats(id).damage += amount; }
  recordKill(id) { this._ensureStats(id).kills++; }

  statsList() {
    return Array.from(this.stats.entries()).map(([id, st]) => ({
      id, name: DataManager.getSkill(id)?.name || id,
      level: this.getLevel(id), ...st,
    })).filter((s) => this.has(s.id));
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
