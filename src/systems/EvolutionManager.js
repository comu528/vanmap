// EvolutionManager: スキル進化の「条件判定」と「熟練度連携」を担う（データ駆動、ハードコードしない）。
// 進化の実行（スキル置換・統計）は SkillManager、演出は EvolutionScene が担当（判定/演出の分離）。

import { DataManager } from './DataManager.js';
import { ProgressionManager } from './ProgressionManager.js';

class EvolutionManagerClass {
  evolutions() { return DataManager.evolutions; }
  forBase(baseId) { return DataManager.getEvolutionForBase(baseId); }
  byId(id) { return DataManager.getEvolution(id); }

  _evoCfg() { return DataManager.masteryConfig.evolution || {}; }

  // 基礎スキルの熟練度レベル（profile 由来）。
  masteryLevel(profile, skillId) {
    const entry = profile?.skillMastery?.[skillId];
    return ProgressionManager.masteryLevelFor(ProgressionManager.masteryExpFor(entry));
  }

  // 熟練度Lv15 による補助スキル必要レベルの軽減量。
  relaxAmount(profile, baseSkillId) {
    const c = this._evoCfg();
    return this.masteryLevel(profile, baseSkillId) >= (c.relaxLevel || 999) ? (c.relaxAmount || 0) : 0;
  }

  // 熟練度Lv5 による進化候補の出現確率。
  candidateChance(profile, baseSkillId) {
    const c = this._evoCfg();
    let chance = c.baseCandidateChance ?? 0.5;
    if (this.masteryLevel(profile, baseSkillId) >= (c.candidateRateLevel || 999)) chance += (c.candidateRateBonus || 0);
    return Math.min(1, chance);
  }

  // 熟練度Lv20 による進化後スキルの小さな追加効果。
  evolvedBonus(profile, evoId) {
    const c = this._evoCfg();
    const ev = this.byId(evoId);
    if (!ev) return {};
    if (this.masteryLevel(profile, ev.baseSkillId) < (c.bonusLevel || 999)) return {};
    return (c.bonus && c.bonus[evoId]) || {};
  }

  // skills(SkillManager) と profile から、指定基礎スキルが進化可能かを判定する。
  // 基礎スキルが最大Lv、補助スキルが必要レベル以上（熟練度で軽減可）、当該周回で未進化。
  canEvolve(skills, profile, baseSkillId) {
    const ev = this.forBase(baseSkillId);
    if (!ev) return false;
    if (skills.hasEvolved(baseSkillId)) return false;
    if (!skills.has(baseSkillId)) return false;
    if (skills.getLevel(baseSkillId) < (DataManager.getSkill(baseSkillId)?.maxLevel || 8)) return false;
    if (this.masteryLevel(profile, baseSkillId) < (ev.requiredMasteryLevel || 0)) return false;
    const relax = this.relaxAmount(profile, baseSkillId);
    for (const req of ev.requiredSkills || []) {
      const need = Math.max(1, (req.level || 1) - relax);
      if (skills.getLevel(req.skill) < need) return false;
    }
    return true;
  }

  // 現在レベルアップ時に提示可能な進化候補（出現確率を rng で判定）。
  candidates(skills, profile, rng) {
    const out = [];
    for (const s of skills.ownedList()) {
      if (this.canEvolve(skills, profile, s.id)) {
        const ev = this.forBase(s.id);
        const chance = this.candidateChance(profile, s.id);
        if ((rng ? rng() : Math.random()) <= chance) out.push(ev);
      }
    }
    return out;
  }
}

export const EvolutionManager = new EvolutionManagerClass();
