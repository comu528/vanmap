// SkillDraftManager（Milestone 6-A）: レベルアップ候補の抽選を一手に担う。
// 巨大な LevelUpScene / SkillManager に抽選ロジックを集約せず、ここへ分離する。
// 決定論: seed と cursor（乱数進行状態）から候補を生成し、active_run に保存する。
// 同じ状態・同じ操作列なら常に同じ候補列になる（Math.random は使わない）。
//
// カタログ（スキルメタ配列）や所持状況は「コンテキスト」として都度渡す（DOM/DataManager 非依存＝Node テスト可能）。
//
// 候補の種類(kind): new_active / up_active / new_passive / up_passive / evolution
//  - evolution は所持枠を消費せず、基礎 active を置き換える（高優先度・最低1枠）。
//  - 満枠時: 未取得の新規は出さない。所持済みのレベルアップは出す。

import { SeededRandom } from './SeededRandom.js';

export class SkillDraftManager {
  // config: { rarityWeights, baseRerolls, baseBanishes, baseSkips }
  constructor(config = {}) {
    this.config = {
      rarityWeights: config.rarityWeights || { common: 100, uncommon: 55, rare: 20, legendary: 5 },
      baseRerolls: config.baseRerolls ?? 1,
      baseBanishes: config.baseBanishes ?? 1,
      baseSkips: config.baseSkips ?? 1,
      // レアリティ別の実効抽選重み倍率（M6-C: 火の魔女 Lv70 で rare×1.15 / legendary×1.25）。
      // 周回開始時に凍結し周回中は不変＝同 seed・同状態で同一候補（決定論を壊さない）。
      rarityWeightMult: config.rarityWeightMult || null,
    };
    this.reset(1, {});
  }

  // レアリティ別の実効重み倍率を設定する（ジョブ補正など・周回開始時に一度だけ）。
  setRarityWeightMult(map) { this.config.rarityWeightMult = map || null; }

  reset(seed, counts = {}) {
    this.seed = (seed >>> 0) || 1;
    this.cursor = 0;
    this.levelUpSequence = 0;
    this.rerollsRemaining = counts.rerolls ?? this.config.baseRerolls;
    this.banishesRemaining = counts.banishes ?? this.config.baseBanishes;
    this.skipsRemaining = counts.skips ?? this.config.baseSkips;
    this.banishedSkillIds = [];
    this.currentDraftId = null;
    this.currentCandidates = [];
  }

  serialize() {
    return {
      seed: this.seed, cursor: this.cursor, levelUpSequence: this.levelUpSequence,
      currentDraftId: this.currentDraftId, currentCandidates: this.currentCandidates,
      rerollsRemaining: this.rerollsRemaining, banishesRemaining: this.banishesRemaining,
      skipsRemaining: this.skipsRemaining, banishedSkillIds: this.banishedSkillIds.slice(),
    };
  }

  restore(s) {
    if (!s || typeof s !== 'object') return;
    this.seed = (s.seed >>> 0) || this.seed;
    this.cursor = (s.cursor >>> 0) || 0;
    this.levelUpSequence = s.levelUpSequence || 0;
    this.currentDraftId = s.currentDraftId || null;
    this.currentCandidates = Array.isArray(s.currentCandidates) ? s.currentCandidates : [];
    this.rerollsRemaining = typeof s.rerollsRemaining === 'number' ? s.rerollsRemaining : this.config.baseRerolls;
    this.banishesRemaining = typeof s.banishesRemaining === 'number' ? s.banishesRemaining : this.config.baseBanishes;
    this.skipsRemaining = typeof s.skipsRemaining === 'number' ? s.skipsRemaining : this.config.baseSkips;
    this.banishedSkillIds = Array.isArray(s.banishedSkillIds) ? s.banishedSkillIds.slice() : [];
  }

  _banishedSet() { return new Set(this.banishedSkillIds); }
  hasPendingDraft() { return !!this.currentDraftId && this.currentCandidates.length > 0; }

  // 新しいレベルアップのドラフトを開く。
  open(ctx) {
    this.levelUpSequence += 1;
    this.cursor += 1;
    this.currentCandidates = this._generate(ctx, SeededRandom.derive(this.seed, this.levelUpSequence, this.cursor));
    this.currentDraftId = `${this.levelUpSequence}:${this.cursor}`;
    return this.currentCandidates;
  }

  // リロール（残回数消費）。可能なら直前と完全一致を避ける。
  reroll(ctx) {
    if (this.rerollsRemaining <= 0) return { ok: false, reason: 'none' };
    const prevKey = this._key(this.currentCandidates);
    let cand = this.currentCandidates, tries = 0;
    do {
      this.cursor += 1;
      cand = this._generate(ctx, SeededRandom.derive(this.seed, this.levelUpSequence, this.cursor));
      tries += 1;
    } while (tries < 6 && cand.length > 0 && this._key(cand) === prevKey);
    this.currentCandidates = cand;
    this.currentDraftId = `${this.levelUpSequence}:${this.cursor}`;
    this.rerollsRemaining -= 1;
    return { ok: true, candidates: cand };
  }

  // 追放（残回数消費）。以後この周回の通常候補から除外し、現在候補を決定論的に再生成する。
  banish(skillId, ctx) {
    if (this.banishesRemaining <= 0) return { ok: false, reason: 'none' };
    if (this._banishedSet().has(skillId)) return { ok: false, reason: 'duplicate' };
    this.banishedSkillIds.push(skillId);
    this.banishesRemaining -= 1;
    this.cursor += 1;
    this.currentCandidates = this._generate(ctx, SeededRandom.derive(this.seed, this.levelUpSequence, this.cursor));
    this.currentDraftId = `${this.levelUpSequence}:${this.cursor}`;
    return { ok: true, candidates: this.currentCandidates };
  }

  // スキップ（残回数消費）。候補を破棄して戦闘へ戻る。
  skip() {
    if (this.skipsRemaining <= 0) return false;
    this.skipsRemaining -= 1;
    this._clearDraft();
    return true;
  }

  // 候補0件時の救済（回数を消費せず戦闘へ戻る）。
  forceClear() { this._clearDraft(); }
  resolvePick() { this._clearDraft(); }
  _clearDraft() { this.currentCandidates = []; this.currentDraftId = null; }

  _key(list) { return (list || []).map((c) => `${c.kind}:${c.id}`).join('|'); }

  // ---- 抽選本体 ----
  _generate(ctx, genSeed) {
    const rng = new SeededRandom(genSeed);
    const need = Math.max(1, ctx.need || 3);
    const banned = this._banishedSet();
    const cat = this._index(ctx.catalog);
    const out = [];
    const reserved = new Set(); // "category:id"

    // 1. 進化候補（高優先度・枠を消費しない・最低1枠）
    const evos = (ctx.evolvables || [])
      .filter((e) => !banned.has(e.evolutionId))
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0) || (String(a.evolutionId) < String(b.evolutionId) ? -1 : 1));
    for (const e of evos) {
      if (out.length >= need) break;
      out.push({ kind: 'evolution', id: e.evolutionId, baseId: e.baseId, category: 'active', rarity: e.rarity || 'rare', fromLevel: 0, toLevel: 1, maxLevel: 1 });
      reserved.add('active:' + e.baseId); // 進化元 active を通常候補から予約除外
    }

    // 2. 適格な通常候補プール
    const pool = this._eligible(ctx, cat, banned).filter((c) => !reserved.has(c.category + ':' + c.id));

    // 3. 重み付き非復元抽選（重複なし・conflict 回避）
    while (out.length < need && pool.length > 0) {
      const idx = this._weightedPick(pool, rng);
      const c = pool.splice(idx, 1)[0];
      if (this._conflictsWithChosen(c, out, cat)) continue;
      out.push(c);
    }
    return out;
  }

  _index(catalog) {
    const m = {};
    for (const s of catalog || []) m[s.id] = s;
    return m;
  }

  _eligible(ctx, cat, banned) {
    const out = [];
    const job = ctx.job || {};
    const extra = ctx.extraAllowedIds || [];
    const ownedActive = (ctx.owned && ctx.owned.active) || {};
    const ownedPassive = (ctx.owned && ctx.owned.passive) || {};
    const slotA = (ctx.slots && ctx.slots.active) || { used: 0, max: 0 };
    const slotP = (ctx.slots && ctx.slots.passive) || { used: 0, max: 0 };

    for (const m of ctx.catalog || []) {
      if (m.enabled === false) continue;
      const isActive = m.category === 'active';
      const isPassive = m.category === 'passive';
      if (!isActive && !isPassive) continue;
      const pool = isActive ? (job.activeSkillPool || []) : (job.passiveSkillPool || []);
      const allowed = pool.includes(m.id) || m.isCommon === true || extra.includes(m.id);
      if (!allowed) continue;
      if (banned.has(m.id)) continue;
      if (!this._unlockOk(m, ctx)) continue;
      if (!this._prereqOk(m, ctx, ownedActive, ownedPassive)) continue;
      if (this._conflictsOwned(m, cat, ownedActive, ownedPassive)) continue;

      const owned = isActive ? ownedActive : ownedPassive;
      const lvl = owned[m.id] || 0;
      const maxLevel = m.maxLevel || 1;
      if (lvl > 0) {
        if (lvl < maxLevel) out.push(this._desc(isActive ? 'up_active' : 'up_passive', m, lvl, lvl + 1));
        // 最大Lv到達は候補から除外（進化は別経路）
      } else {
        const slot = isActive ? slotA : slotP;
        if ((slot.used || 0) < (slot.max || 0)) out.push(this._desc(isActive ? 'new_active' : 'new_passive', m, 0, 1));
      }
    }
    return out;
  }

  _desc(kind, m, from, to) {
    return {
      kind, id: m.id, category: m.category, rarity: m.rarity || 'common',
      fromLevel: from, toLevel: to, maxLevel: m.maxLevel || 1,
      weight: (this.config.rarityWeights[m.rarity] || 1) * ((this.config.rarityWeightMult && this.config.rarityWeightMult[m.rarity]) || 1) * (m.weight || 1),
      conflicts: m.conflicts || [],
    };
  }

  _unlockOk(m, ctx) {
    const c = m.unlockCondition;
    if (!c) return true;
    if (c.type === 'highestCleared') return ((ctx.unlock && ctx.unlock.highestClearedDifficulty) || 0) >= c.value;
    return true;
  }

  _prereqOk(m, ctx, ownedActive, ownedPassive) {
    for (const req of m.prerequisites || []) {
      const lvl = (ownedActive[req.skill] || 0) || (ownedPassive[req.skill] || 0);
      if (lvl < (req.level || 1)) return false;
    }
    return true;
  }

  _conflictsOwned(m, cat, ownedActive, ownedPassive) {
    const ownedIds = [...Object.keys(ownedActive), ...Object.keys(ownedPassive)].filter((id) => (ownedActive[id] || ownedPassive[id]) > 0);
    for (const oid of ownedIds) {
      if ((m.conflicts || []).includes(oid)) return true;
      if ((cat[oid]?.conflicts || []).includes(m.id)) return true;
    }
    return false;
  }

  _conflictsWithChosen(c, chosen, cat) {
    for (const ch of chosen) {
      if (ch.kind === 'evolution') continue;
      if ((c.conflicts || []).includes(ch.id)) return true;
      if ((cat[ch.id]?.conflicts || []).includes(c.id)) return true;
    }
    return false;
  }

  _weightedPick(pool, rng) {
    let total = 0;
    for (const c of pool) total += Math.max(0, c.weight || 1);
    if (total <= 0) return rng.int(pool.length);
    let r = rng.next() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(0, pool[i].weight || 1);
      if (r <= 0) return i;
    }
    return pool.length - 1;
  }
}
