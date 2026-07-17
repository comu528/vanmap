// ProgressionManager: 恒久成長（残り火・恒久強化・スキル熟練度・難易度解放・統計）を統括する。
// profile（SaveManager）を唯一の真実として読み書きし、戦闘（BattleScene）と拠点（BaseScene）から使う。
// 計算式・倍率はすべて data/*.json（balance.emberReward / permanent-upgrades / skill-mastery）由来。

import { DataManager } from './DataManager.js';
import { SaveManager } from './SaveManager.js';

function emptyMastery() {
  return { casts: 0, hits: 0, kills: 0, damage: 0, maxLevel: 0, runsUsed: 0, evolutions: 0 };
}

class ProgressionManagerClass {
  // ---------------- 恒久強化 ----------------
  upgradeDefs() {
    return DataManager.upgrades.slice().sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }
  getUpgradeDef(id) { return DataManager.upgrades.find((u) => u.id === id) || null; }

  upgradeLevel(profile, id) { return profile.permanentUpgrades?.[id] || 0; }

  // 現在レベル level から次レベルへ上げる費用。
  upgradeCost(def, level) {
    return Math.floor(def.baseCost * Math.pow(def.costGrowth, level));
  }

  // 指定レベル時点の累積効果値（effectPerLevel * level）。
  effectValue(def, level) {
    return (def.effectPerLevel || 0) * level;
  }

  isUpgradeUnlocked(profile, def) {
    const c = def.unlockCondition;
    if (!c) return true;
    if (c.type === 'highestCleared') return (profile.highestClearedDifficulty || 0) >= c.value;
    return true;
  }

  // 魂炎強化「恒久強化上限」による最大レベル拡張（ReincarnationManager を import せず算出）。
  _reincPermCapAdd(profile) {
    let add = 0;
    for (const node of DataManager.reincarnationNodes) {
      if (node.effectType === 'permCap') add += (node.effectPerLevel || 0) * (profile.reincarnationUpgrades?.[node.id] || 0);
    }
    return add;
  }
  effectiveMaxLevel(def, profile) { return def.maxLevel + this._reincPermCapAdd(profile); }

  // 魂炎強化「敵密度拡張」による残り火報酬倍率。
  _reincRewardMult(profile) {
    let mult = 1;
    for (const node of DataManager.reincarnationNodes) {
      if (node.effectType === 'enemyDensity') mult += 0.03 * (profile.reincarnationUpgrades?.[node.id] || 0);
    }
    return mult;
  }

  canBuy(profile, id) {
    const def = this.getUpgradeDef(id);
    if (!def) return { ok: false, reason: 'not_found' };
    if (!this.isUpgradeUnlocked(profile, def)) return { ok: false, reason: 'locked' };
    const level = this.upgradeLevel(profile, id);
    if (level >= this.effectiveMaxLevel(def, profile)) return { ok: false, reason: 'max' };
    const cost = this.upgradeCost(def, level);
    if ((profile.embers || 0) < cost) return { ok: false, reason: 'insufficient', cost };
    return { ok: true, cost };
  }

  // 購入して profile を保存。成功可否を返す。連打二重購入は呼び出し側でロックする想定だが、
  // ここでも最新 profile を読み直して原子的に検証・加算する。
  buy(id) {
    const profile = SaveManager.loadProfile();
    const check = this.canBuy(profile, id);
    if (!check.ok) return { ok: false, reason: check.reason, profile };
    profile.permanentUpgrades[id] = (profile.permanentUpgrades[id] || 0) + 1;
    profile.embers = Math.max(0, (profile.embers || 0) - check.cost);
    SaveManager.saveProfile(profile, 'upgrade_buy');
    return { ok: true, profile, spent: check.cost };
  }

  // 恒久強化の集計値（戦闘開始時にプレイヤーへ適用）。
  getUpgradeStats(profile) {
    const s = {
      maxHpAdd: 0, damageMult: 1, moveSpeedMult: 1, xpMult: 1, pickupMult: 1,
      dashRechargeMult: 1, invulnMult: 1, emberMult: 1, autoMoveSkill: 0, startSkillLevel: 0,
    };
    for (const def of DataManager.upgrades) {
      const lvl = this.upgradeLevel(profile, def.id);
      if (lvl <= 0) continue;
      const v = this.effectValue(def, lvl);
      switch (def.effectType) {
        case 'maxHpAdd': s.maxHpAdd += v; break;
        case 'damageMult': s.damageMult += v; break;
        case 'moveSpeedMult': s.moveSpeedMult += v; break;
        case 'xpMult': s.xpMult += v; break;
        case 'pickupMult': s.pickupMult += v; break;
        case 'dashRechargeMult': s.dashRechargeMult -= v; break; // 回復“時間”を短縮
        case 'invulnMult': s.invulnMult += v; break;
        case 'emberMult': s.emberMult += v; break;
        case 'autoMoveSkill': s.autoMoveSkill += v; break;
        case 'startSkillLevel': s.startSkillLevel += v; break;
        default: break;
      }
    }
    s.dashRechargeMult = Math.max(0.4, s.dashRechargeMult);
    return s;
  }

  // ---------------- 難易度 ----------------
  difficulties() { return DataManager.balance.difficulties || []; }
  hasDifficulty(id) { return !!DataManager.getDifficulty(id); }
  isDifficultyUnlocked(profile, id) { return (profile.unlockedDifficulties || [1]).includes(id); }

  selectDifficulty(id) {
    const profile = SaveManager.loadProfile();
    if (!this.isDifficultyUnlocked(profile, id)) return false;
    profile.selectedDifficulty = id;
    SaveManager.saveProfile(profile);
    return true;
  }

  // ---------------- 残り火 ----------------
  computeEmberBreakdown(result, profile) {
    const c = DataManager.emberReward;
    const survival = (result.timeSec || 0) * (c.perSecond || 0);
    const kills = (result.kills || 0) * (c.perKill || 0);
    const boss = (result.bossKills || 0) * (c.perBossKill || 0);
    const winBonus = result.win ? (c.winBonus || 0) : 0;
    const base = survival + kills + boss + winBonus;
    const diff = DataManager.getDifficulty(result.difficultyId);
    const difficultyMult = diff?.currency ?? 1;
    const winLoseMult = result.win ? (c.winMultiplier ?? 1) : (c.defeatMultiplier ?? 0.5);
    const upgradeMult = this.getUpgradeStats(profile).emberMult;
    const reincMult = this._reincRewardMult(profile);
    const total = Math.max(0, Math.floor(base * difficultyMult * winLoseMult * upgradeMult * reincMult));
    return {
      survival: Math.floor(survival), kills: Math.floor(kills), boss: Math.floor(boss),
      winBonus, base, difficultyMult, winLoseMult, upgradeMult, reincMult, total, win: !!result.win,
    };
  }

  // ---------------- 周回終了処理 ----------------
  // result: { win, timeSec, kills, bossKills, maxHit, difficultyId, skills:[{id,casts,hits,kills,damage,level}], resultId }
  // 同一 resultId の二重加算を lastResultId で防止する。
  completeRun(result) {
    const profile = SaveManager.loadProfile();
    const breakdown = this.computeEmberBreakdown(result, profile);
    const awarded = profile.lastResultId !== result.resultId;
    let newlyUnlocked = null;

    if (awarded) {
      profile.embers = (profile.embers || 0) + breakdown.total;
      profile.lifetimeEmbers = (profile.lifetimeEmbers || 0) + breakdown.total;
      profile.lastResultId = result.resultId;

      const st = profile.statistics;
      st.totalPlayTime += result.timeSec || 0;
      st.totalRuns += 1;
      if (result.win) st.totalWins += 1; else st.totalDefeats += 1;
      st.totalKills += result.kills || 0;
      st.totalBossKills += result.bossKills || 0;
      st.highestDamage = Math.max(st.highestDamage || 0, result.maxHit || 0);

      // 現在の周回（cycle）進捗。転生条件は周回単位で判定して farming を防ぐ。
      const cc = profile.currentCycle || (profile.currentCycle = { cycleNumber: profile.reincarnationCount || 0, cycleEmbers: 0, cycleHighestDifficulty: 0, cycleBossKills: 0 });
      cc.cycleEmbers = (cc.cycleEmbers || 0) + breakdown.total;
      cc.cycleBossKills = (cc.cycleBossKills || 0) + (result.bossKills || 0);
      if (result.win) cc.cycleHighestDifficulty = Math.max(cc.cycleHighestDifficulty || 0, result.difficultyId);

      // スキル統計を熟練度へ加算。進化後スキルは基礎スキルの熟練度へ寄せる（M4）。
      profile.evolutionStatistics = profile.evolutionStatistics || {};
      const runsCounted = new Set();
      for (const s of result.skills || []) {
        const evo = DataManager.getEvolution(s.id);
        const masteryId = evo ? evo.baseSkillId : s.id;
        const m = profile.skillMastery[masteryId] || (profile.skillMastery[masteryId] = emptyMastery());
        m.casts += s.casts || 0;
        m.hits += s.hits || 0;
        m.kills += s.kills || 0;
        m.damage += s.damage || 0;
        m.maxLevel = Math.max(m.maxLevel || 0, s.level || 0);
        if (!runsCounted.has(masteryId)) { m.runsUsed = (m.runsUsed || 0) + 1; runsCounted.add(masteryId); }
        // スキル固有統計（M6-B: 最高同時存在数・最大連鎖・防御スキル統計 等）を最大値で蓄積。
        if (s.extra && typeof s.extra === 'object') {
          m.extra = m.extra || {};
          for (const [k, v] of Object.entries(s.extra)) if (typeof v === 'number') m.extra[k] = Math.max(m.extra[k] || 0, v);
        }
        if (evo) {
          const es = profile.evolutionStatistics[s.id] || (profile.evolutionStatistics[s.id] = { casts: 0, hits: 0, kills: 0, damage: 0, times: 0 });
          es.casts += s.casts || 0; es.hits += s.hits || 0; es.kills += s.kills || 0; es.damage += s.damage || 0;
        }
      }
      // 当該周回で進化した基礎スキルの evolutions を加算。
      for (const baseId of result.evolvedBaseIds || []) {
        const m = profile.skillMastery[baseId] || (profile.skillMastery[baseId] = emptyMastery());
        m.evolutions = (m.evolutions || 0) + 1;
        const evo = DataManager.getEvolutionForBase(baseId);
        if (evo) {
          const es = profile.evolutionStatistics[evo.id] || (profile.evolutionStatistics[evo.id] = { casts: 0, hits: 0, kills: 0, damage: 0, times: 0 });
          es.times += 1;
        }
      }

      // パッシブ統計（M6-A: active とは別体系。ダメージ統計は持たせない）。
      profile.passiveMastery = profile.passiveMastery || {};
      for (const p of result.passives || []) {
        const pm = profile.passiveMastery[p.id] || (profile.passiveMastery[p.id] = { runsUsed: 0, maxLevel: 0, picks: 0, appliedTimeMs: 0 });
        pm.runsUsed = (pm.runsUsed || 0) + 1;
        pm.maxLevel = Math.max(pm.maxLevel || 0, p.level || 0);
        pm.picks = (pm.picks || 0) + (p.picks || 0);
      }

      if (result.win) {
        profile.highestClearedDifficulty = Math.max(profile.highestClearedDifficulty || 0, result.difficultyId);
        const next = result.difficultyId + 1;
        if (this.hasDifficulty(next) && !profile.unlockedDifficulties.includes(next)) {
          profile.unlockedDifficulties.push(next);
          profile.unlockedDifficulties.sort((a, b) => a - b);
          newlyUnlocked = next;
        }
      }
      SaveManager.saveProfile(profile);
    }
    return { profile, breakdown, awarded, newlyUnlocked };
  }

  // ---------------- スキル熟練度 ----------------
  masteryCfg() { return DataManager.masteryConfig; }

  masteryExpFor(entry) {
    const e = this.masteryCfg().exp || {};
    if (!entry) return 0;
    return (entry.damage || 0) * (e.perDamage || 0)
      + (entry.hits || 0) * (e.perHit || 0)
      + (entry.kills || 0) * (e.perKill || 0)
      + (entry.runsUsed || 0) * (e.perRun || 0);
  }

  masteryLevelFor(totalExp) {
    const cfg = this.masteryCfg();
    const e = cfg.exp || {};
    const maxLevel = cfg.maxLevel || 20;
    let level = 1, cum = 0;
    for (let L = 1; L < maxLevel; L++) {
      const need = (e.curveBase || 100) * Math.pow(e.curveGrowth || 1.2, L - 1);
      if (totalExp >= cum + need) { cum += need; level = L + 1; } else break;
    }
    return level;
  }

  masteryProgress(entry) {
    const cfg = this.masteryCfg();
    const e = cfg.exp || {};
    const total = this.masteryExpFor(entry);
    const level = this.masteryLevelFor(total);
    let cum = 0;
    for (let L = 1; L < level; L++) cum += (e.curveBase || 100) * Math.pow(e.curveGrowth || 1.2, L - 1);
    const need = level >= (cfg.maxLevel || 20) ? 0 : (e.curveBase || 100) * Math.pow(e.curveGrowth || 1.2, level - 1);
    const cur = total - cum;
    return { level, curExp: cur, needExp: need, ratio: need ? Math.min(1, cur / need) : 1, totalExp: total };
  }

  // 各スキルの熟練度ボーナス（戦闘開始時に SkillManager へ渡す）。
  // レベル1では恒等（M2 の威力を変えない）。上げても小さな補正に留める。
  masteryBonuses(profile) {
    const r = this.masteryCfg().rewards || {};
    const out = {};
    let ver = 0;
    for (const skill of DataManager.skills) {
      const entry = profile.skillMastery?.[skill.id];
      const level = this.masteryLevelFor(this.masteryExpFor(entry));
      ver += level;
      out[skill.id] = {
        level,
        damageMult: 1 + (r.damagePerLevel || 0) * (level - 1),
        cooldownMult: Math.max(r.cooldownMinMult || 0.7, 1 - (r.cooldownPerLevel || 0) * (level - 1)),
        radiusMult: 1 + (r.radiusPerLevel || 0) * (level - 1),
        startLevel: (r.startLevelThresholds || []).filter((t) => level >= t).length,
      };
    }
    out._ver = ver;
    return out;
  }

  // 拠点表示用: スキルごとの熟練度サマリ。
  masterySummary(profile) {
    return DataManager.skills.map((skill) => {
      const entry = profile.skillMastery?.[skill.id] || emptyMastery();
      const prog = this.masteryProgress(entry);
      const bonus = this.masteryBonuses(profile)[skill.id];
      return { id: skill.id, name: skill.name, entry, ...prog, bonus };
    });
  }
}

export const ProgressionManager = new ProgressionManagerClass();
