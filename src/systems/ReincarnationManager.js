// ReincarnationManager: 転生条件・魂炎計算・転生実行（リセット/維持）・魂炎強化を担う。
// 計算式・倍率は data/reincarnation.json 由来。profile を唯一の真実として読み書きする。

import { DataManager } from './DataManager.js';
import { SaveManager } from './SaveManager.js';
import { ProgressionManager } from './ProgressionManager.js';

class ReincarnationManagerClass {
  cfg() { return DataManager.reincarnation; }
  nodes() { return DataManager.reincarnationNodes.slice().sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)); }
  getNode(id) { return DataManager.reincarnationNodes.find((n) => n.id === id) || null; }

  // ---------------- 転生条件 ----------------
  // 「難易度Nクリア」も「累計残り火」も、転生でリセットされる “今周回(cycle)” の進捗で判定する。
  // これにより、累計値が閾値を超えたまま転生を無限に繰り返して魂炎を稼ぐ farming を防ぐ。
  unlock() { return this.cfg().unlock || { clearDifficulty: 3, totalEmber: 5000 }; }
  _cycleEmbers(profile) { return profile.currentCycle?.cycleEmbers || 0; }
  canReincarnate(profile) {
    const u = this.unlock();
    return (profile.highestClearedDifficulty || 0) >= u.clearDifficulty
      || this._cycleEmbers(profile) >= u.totalEmber;
  }
  // 進捗（拠点のロック表示用）。
  unlockProgress(profile) {
    const u = this.unlock();
    return {
      clearDifficulty: u.clearDifficulty,
      totalEmber: u.totalEmber,
      curDifficulty: profile.highestClearedDifficulty || 0,
      curEmber: this._cycleEmbers(profile),
      byDifficulty: (profile.highestClearedDifficulty || 0) >= u.clearDifficulty,
      byEmber: this._cycleEmbers(profile) >= u.totalEmber,
    };
  }

  // ---------------- 魂炎計算 ----------------
  _masterySum(profile) {
    let sum = 0;
    for (const skill of DataManager.skills) {
      const entry = profile.skillMastery?.[skill.id];
      sum += ProgressionManager.masteryLevelFor(ProgressionManager.masteryExpFor(entry));
    }
    return sum;
  }

  computeSoulflame(profile) {
    const c = this.cfg().soulflame || {};
    const emberTerm = (c.emberLogBase || 0) * Math.log2(1 + (profile.lifetimeEmbers || 0) / (c.emberLogDiv || 1));
    const highestEver = Math.max(profile.highestEverDifficulty || 0, profile.highestClearedDifficulty || 0);
    const diffTerm = highestEver * (c.difficultyPerLevel || 0);
    const bossTerm = Math.sqrt(profile.statistics?.totalBossKills || 0) * (c.bossSqrt || 0);
    const reincTerm = (profile.reincarnationCount || 0) * (c.reincarnationBonus || 0);
    const masteryTerm = Math.sqrt(this._masterySum(profile)) * (c.masterySqrt || 0);
    let total = Math.floor(emberTerm + diffTerm + bossTerm + reincTerm + masteryTerm);
    if (this.canReincarnate(profile) && total < (c.minFirst || 1)) total = (c.minFirst || 1);
    return {
      total,
      emberTerm: Math.floor(emberTerm), diffTerm: Math.floor(diffTerm), bossTerm: Math.floor(bossTerm),
      reincTerm: Math.floor(reincTerm), masteryTerm: Math.floor(masteryTerm),
    };
  }

  _reincId(profile) {
    return `${(profile.reincarnationCount || 0) + 1}-${Math.floor(profile.lifetimeEmbers || 0)}-${profile.highestClearedDifficulty || 0}-${profile.statistics?.totalBossKills || 0}`;
  }

  // 転生プレビュー（確認画面用）: リセット/維持/獲得魂炎。
  preview(profile) {
    return {
      canReincarnate: this.canReincarnate(profile),
      soulflame: this.computeSoulflame(profile),
      reincarnationCount: profile.reincarnationCount || 0,
      reset: this.cfg().reset || [],
      keep: this.cfg().keep || [],
      hasActiveRun: SaveManager.hasActiveRun(),
    };
  }

  // ---------------- 転生実行 ----------------
  // 同一 reincId の二重取得を lastReincarnationId で防止。途中戦闘データは破棄する。
  reincarnate() {
    const profile = SaveManager.loadProfile();
    if (!this.canReincarnate(profile)) return { ok: false, reason: 'locked' };
    const reincId = this._reincId(profile);
    if (profile.lastReincarnationId === reincId) return { ok: false, reason: 'duplicate' };

    const sf = this.computeSoulflame(profile);
    const gained = sf.total;
    const startDifficulty = this.cfg().startDifficulty || 1;

    // 維持: highestEver を更新
    profile.highestEverDifficulty = Math.max(profile.highestEverDifficulty || 0, profile.highestClearedDifficulty || 0);
    // 履歴
    profile.reincarnationHistory = profile.reincarnationHistory || [];
    profile.reincarnationHistory.push({
      id: reincId, count: (profile.reincarnationCount || 0) + 1, soulflame: gained,
      at: new Date().toISOString(), lifetimeEmbers: profile.lifetimeEmbers || 0,
      highestCleared: profile.highestClearedDifficulty || 0,
    });
    if (profile.reincarnationHistory.length > 50) profile.reincarnationHistory.shift();

    // 加算（維持通貨）
    profile.reincarnationCount = (profile.reincarnationCount || 0) + 1;
    profile.soulflame = (profile.soulflame || 0) + gained;
    profile.lifetimeSoulflame = (profile.lifetimeSoulflame || 0) + gained;
    profile.lastReincarnationId = reincId;

    // リセット（魂炎強化は維持されるので start ボーナスは反映後に適用）
    const startEmber = this.getReincarnationStats(profile).startEmber;
    profile.permanentUpgrades = {};
    profile.embers = startEmber;
    profile.selectedDifficulty = startDifficulty;
    profile.unlockedDifficulties = [startDifficulty];
    profile.highestClearedDifficulty = 0;
    profile.lastResultId = null;
    // 新しい周回
    profile.currentCycle = {
      cycleNumber: profile.reincarnationCount, cycleEmbers: startEmber,
      cycleHighestDifficulty: 0, cycleBossKills: 0, cycleStartTime: new Date().toISOString(),
    };

    // 途中戦闘データ破棄（転生前へ戻れないように）
    SaveManager.clearActiveRun();
    SaveManager.saveProfile(profile, 'reincarnate');
    return { ok: true, gained, breakdown: sf, profile, reincId, startEmber };
  }

  // ---------------- 魂炎強化 ----------------
  upgradeLevel(profile, id) { return profile.reincarnationUpgrades?.[id] || 0; }
  cost(node, level) { return Math.floor(node.baseCost * Math.pow(node.costGrowth || 1, level)); }
  effectValue(node, level) { return (node.effectPerLevel || 0) * level; }

  prereqMet(profile, node) {
    if (!node.prerequisite) return true;
    return this.upgradeLevel(profile, node.prerequisite) >= 1;
  }

  canBuy(profile, id) {
    const node = this.getNode(id);
    if (!node) return { ok: false, reason: 'not_found' };
    if (!this.prereqMet(profile, node)) return { ok: false, reason: 'prereq' };
    const level = this.upgradeLevel(profile, id);
    if (level >= node.maxLevel) return { ok: false, reason: 'max' };
    const cost = this.cost(node, level);
    if ((profile.soulflame || 0) < cost) return { ok: false, reason: 'insufficient', cost };
    return { ok: true, cost };
  }

  buy(id) {
    const profile = SaveManager.loadProfile();
    const check = this.canBuy(profile, id);
    if (!check.ok) return { ok: false, reason: check.reason, profile };
    profile.reincarnationUpgrades[id] = (profile.reincarnationUpgrades[id] || 0) + 1;
    profile.soulflame = Math.max(0, (profile.soulflame || 0) - check.cost);
    SaveManager.saveProfile(profile, 'soulflame_buy');
    return { ok: true, profile, spent: check.cost };
  }

  // 戦闘・拠点へ適用する集計値。
  getReincarnationStats(profile) {
    const perReincDmg = this.cfg().perReincarnationDamage || 0;
    const speedModes = DataManager.speedModes;
    const s = {
      levelUpChoices: 0, startDamageMult: 1 + perReincDmg * (profile.reincarnationCount || 0),
      startSkillLevel: 0, chainCount: 0, enemyCapAdd: 0, rewardMult: 1,
      effectCapAdd: 0, permCapAdd: 0, speedLevel: 0, autoDash: false, startEmber: 0,
      activeSlotBonus: 0,
      reincarnationCount: profile.reincarnationCount || 0,
    };
    for (const node of DataManager.reincarnationNodes) {
      const lvl = this.upgradeLevel(profile, node.id);
      if (lvl <= 0) continue;
      const v = this.effectValue(node, lvl);
      switch (node.effectType) {
        case 'levelUpChoices': s.levelUpChoices += v; break;
        case 'startDamageMult': s.startDamageMult += v; break;
        case 'startSkillLevel': s.startSkillLevel += v; break;
        case 'chainCount': s.chainCount += v; break;
        case 'enemyDensity': s.enemyCapAdd += v; s.rewardMult += 0.03 * lvl; break;
        case 'effectCap': s.effectCapAdd += v; break;
        case 'permCap': s.permCapAdd += v; break;
        case 'speedMode': s.speedLevel = Math.max(s.speedLevel, lvl); break;
        case 'autoDash': s.autoDash = true; break;
        case 'startEmber': s.startEmber += v; break;
        case 'activeSlots': s.activeSlotBonus += v; break; // アクティブ枠拡張（+2/Lv）
        default: break;
      }
    }
    s.speedMax = speedModes[Math.min(s.speedLevel, speedModes.length - 1)] || 1;
    return s;
  }
}

export const ReincarnationManager = new ReincarnationManagerClass();
