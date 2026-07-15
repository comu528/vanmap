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
  get speedModes() { return asArray(this.balance.speedModes).length ? this.balance.speedModes : [1]; }

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
