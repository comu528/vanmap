// JSON データの読み込みと保持。すべて相対パスで fetch する
// （GitHub Pages のリポジトリ名付き URL でも壊れないように）。

import { asArray, isObject } from '../utils/validation.js';

const FILES = {
  balance: './data/balance.json',
  skills: './data/skills.json',
  enemies: './data/enemies.json',
  bosses: './data/bosses.json',
  permanentUpgrades: './data/permanent-upgrades.json',
  skillMastery: './data/skill-mastery.json',
  skillEvolutions: './data/skill-evolutions.json',
  reincarnation: './data/reincarnation.json',
  jobs: './data/jobs.json',
  passives: './data/passives.json',
  skillConfig: './data/skill-config.json',
  jobProgression: './data/job-progression.json',
  statusEffects: './data/status-effects.json',
};

class DataManagerClass {
  constructor() {
    this.loaded = false;
    this.data = {};
    this._skillMap = new Map();
    this._enemyMap = new Map();
  }

  async loadAll() {
    if (this.loaded) return this.data;
    const entries = await Promise.all(
      Object.entries(FILES).map(async ([key, path]) => {
        const res = await fetch(path, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`${path} の読み込みに失敗しました (${res.status})`);
        const json = await res.json();
        return [key, json];
      })
    );
    for (const [key, json] of entries) this.data[key] = json;

    for (const s of asArray(this.data.skills?.skills)) this._skillMap.set(s.id, s);
    for (const e of asArray(this.data.enemies?.enemies)) this._enemyMap.set(e.id, e);
    this._passiveMap = new Map();
    for (const p of asArray(this.data.passives?.passives)) this._passiveMap.set(p.id, p);
    this._jobMap = new Map();
    for (const j of asArray(this.data.jobs?.jobs)) this._jobMap.set(j.id, j);

    this.loaded = true;
    return this.data;
  }

  get balance() { return this.data.balance || {}; }
  get skills() { return asArray(this.data.skills?.skills); }
  get enemies() { return asArray(this.data.enemies?.enemies); }
  get bosses() { return asArray(this.data.bosses?.bosses); }
  get upgrades() { return asArray(this.data.permanentUpgrades?.upgrades); }
  get masteryConfig() { return this.data.skillMastery || {}; }
  get emberReward() { return this.balance.emberReward || {}; }
  get evolutions() { return asArray(this.data.skillEvolutions?.evolutions); }
  get reincarnation() { return this.data.reincarnation || {}; }
  get reincarnationNodes() { return asArray(this.data.reincarnation?.nodes); }
  get combatCaps() { return this.balance.combatCaps || {}; }
  get saveConfig() { return this.balance.save || {}; }
  get skillCaps() { return this.balance.skillCaps || {}; }
  get skillCapClasses() { return this.balance.skillCapClasses || {}; }
  get gameplayLimits() { return this.balance.gameplayLimits || {}; }
  skillCapClass(name) { return this.skillCapClasses[name] || null; }
  // スキル上限（M6-B / M9-A）。
  //   { value }                     … gameplay / safety 上限。**品質に依存しない単一値**。
  //   { low, medium, high, ultra }  … visual 上限のみ。品質で減らしてよい。
  // 単一値の形が「品質で戦闘結果が変わらない」ことを構造的に保証する（quality を見る余地が無い）。
  skillCap(name, quality = 'high', fallback = 9999) {
    const c = this.skillCaps[name];
    if (!c) return fallback;
    if (typeof c.value === 'number') return c.value;
    return c[quality] ?? c.high ?? fallback;
  }

  // ---- Milestone 6-A: ジョブ / パッシブ / スキル抽選 ----
  get jobs() { return asArray(this.data.jobs?.jobs); }
  getJob(id) { return this._jobMap?.get(id) || null; }
  get passives() { return asArray(this.data.passives?.passives); }
  getPassive(id) { return this._passiveMap?.get(id) || null; }
  get skillConfig() { return this.data.skillConfig || {}; }
  get rarityWeights() { return this.skillConfig.rarityWeights || { common: 100, uncommon: 55, rare: 20, legendary: 5 }; }

  // active(skills) と passive を統合したドラフト用メタ配列（抽選カタログ）。
  draftCatalog() {
    const out = [];
    for (const s of this.skills) {
      out.push({
        id: s.id, category: s.category || 'active', rarity: s.rarity || 'common', weight: s.weight ?? 1,
        maxLevel: s.maxLevel || 1, enabled: s.enabled !== false, jobs: s.jobs || [], isCommon: !!s.isCommon,
        prerequisites: s.prerequisites || [], conflicts: s.conflicts || [], unlockCondition: s.unlockCondition || null,
        displayName: s.name, description: s.description, iconKey: s.iconKey || s.icon,
      });
    }
    for (const p of this.passives) {
      out.push({
        id: p.id, category: 'passive', rarity: p.rarity || 'common', weight: p.weight ?? 1,
        maxLevel: p.maxLevel || 1, enabled: p.enabled !== false, jobs: p.jobs || [], isCommon: p.isCommon !== false,
        prerequisites: p.prerequisites || [], conflicts: p.conflicts || [], unlockCondition: p.unlockCondition || null,
        displayName: p.displayName, description: p.description, iconKey: p.iconKey,
      });
    }
    return out;
  }
  get speedModes() { return asArray(this.balance.speedModes).length ? this.balance.speedModes : [1]; }

  // ---- Milestone 6-C: ジョブ育成（ジョブレベル・経験値・到達報酬） ----
  get jobProgression() { return this.data.jobProgression || {}; }
  getJobProgression(id) { return (this.jobProgression.jobs && this.jobProgression.jobs[id]) || null; }

  // ---- Milestone 7-A: 汎用状態異常基盤 ----
  get statusEffectsData() { return this.data.statusEffects || {}; }
  get statusEffectDefs() { return asArray(this.data.statusEffects?.statusEffects); }
  get freezeConfig() { return this.statusEffectsData.freeze || {}; }
  get bossFrostbreakConfig() { return this.statusEffectsData.bossFrostbreak || {}; }
  get shatterConfig() { return this.statusEffectsData.shatter || {}; }
  // M7-B.1: 状態表示（アイコン優先度・既知 visual type・frostbreak/vulnerability 表示設定）。
  get statusVisualsConfig() { return this.balance.statusVisuals || {}; }

  getEvolution(id) { return this.evolutions.find((e) => e.id === id) || null; }
  getEvolutionForBase(baseId) { return this.evolutions.find((e) => e.baseSkillId === baseId) || null; }

  getSkill(id) { return this._skillMap.get(id) || null; }
  getEnemy(id) { return this._enemyMap.get(id) || null; }

  getDifficulty(id) {
    return asArray(this.balance.difficulties).find((d) => d.id === id) || null;
  }

  // スキルの指定レベルのパラメータを返す（範囲外は端に丸める）。
  getSkillLevel(id, level) {
    const skill = this.getSkill(id);
    if (!skill || !Array.isArray(skill.levels)) return null;
    const idx = Math.max(0, Math.min(skill.levels.length - 1, level - 1));
    return skill.levels[idx];
  }

  isValid() {
    return isObject(this.balance) && this.skills.length > 0 && this.enemies.length > 0;
  }
}

export const DataManager = new DataManagerClass();
