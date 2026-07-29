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
import { memberAllowedForJob } from './poolEligibility.js';

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
      // シナジー補助設定（M6-F: skill-config.json の synergy）。null で完全無効（＝旧挙動と一致）。
      synergy: config.synergy || null,
      // M8-C.1: ジョブ限定の進化導線補助（skill-config.json の guidance）。
      // guidance.jobs に載っているジョブの周回でだけ重みへ乗算する。
      // それ以外のジョブでは倍率 1（＝候補列も RNG 消費もまったく変わらない）。
      guidance: config.guidance || null,
    };
    this.reset(1, {});
  }

  // シナジー補助設定を差し替える（周回開始時・data で無効化可能）。
  setSynergyConfig(cfg) { this.config.synergy = cfg || null; }
  // 進化導線補助の設定を差し替える（周回開始時・data で無効化可能）。
  setGuidanceConfig(cfg) { this.config.guidance = cfg || null; }
  // 進化成立など「進展」があったら pity カウンタをリセットする（BattleScene が進化時に呼ぶ）。
  markProgress() { this.draftsSinceProgress = 0; this.guidanceStall = 0; }
  // M8-C.1: 進化導線が 1 歩でも進んだら stall をリセットする。
  // kind: 'base' | 'support' | 'upgrade' | 'evolution'（null なら進展なし＝リセットしない）。
  markGuidanceProgress(kind) {
    if (!kind) return false;
    if (this.guidanceStall > 0) this.guidanceResets += 1;
    this.guidanceStall = 0;
    this.guidanceProgress[kind] = (this.guidanceProgress[kind] || 0) + 1;
    return true;
  }
  // 現在の pity 段（0 = 未発動）。閾値を超えた分だけ段階的に上がる。
  guidancePityStep() {
    const cfg = this.config.guidance;
    if (!cfg || cfg.enabled === false) return 0;
    const p = cfg.pity || {};
    const th = p.threshold;
    if (!(th > 0)) return 0;
    return Math.max(0, this.guidanceStall - th);
  }
  guidancePityActive() { return this.guidancePityStep() > 0; }
  // 表示・テレメトリ用（外部送信はしない）。
  guidanceTelemetry() {
    const cfg = this.config.guidance || {};
    const p = cfg.pity || {};
    return {
      stall: this.guidanceStall,
      step: this.guidancePityStep(),
      threshold: p.threshold || 0,
      maxMultiplier: p.maxMultiplier || 1,
      triggers: this.guidancePityTriggers,
      resets: this.guidanceResets,
      assisted: { ...this.guidanceProgress },
    };
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
    this.draftsSinceProgress = 0; // M6-F: 進化などの進展が無いまま重ねたドラフト数（pity 補助・決定論的に保存）
    // M8-C.1: 進化導線が進まないまま重ねたドラフト数（guidance pity）。
    // 進展（進化元の取得/強化・必要補助の取得/強化・進化取得）でリセットする。
    this.guidanceStall = 0;
    this.guidancePityTriggers = 0;
    this.guidanceResets = 0;
    this.guidanceProgress = { base: 0, support: 0, upgrade: 0, evolution: 0 };
  }

  serialize() {
    return {
      seed: this.seed, cursor: this.cursor, levelUpSequence: this.levelUpSequence,
      currentDraftId: this.currentDraftId, currentCandidates: this.currentCandidates,
      rerollsRemaining: this.rerollsRemaining, banishesRemaining: this.banishesRemaining,
      skipsRemaining: this.skipsRemaining, banishedSkillIds: this.banishedSkillIds.slice(),
      draftsSinceProgress: this.draftsSinceProgress,
      // M8-C.1: 追加フィールド（save_version は据え置き。旧セーブでは 0 から始まる）。
      // 保存するので「再読込で pity をリセットして稼ぐ」ことはできない。
      guidanceStall: this.guidanceStall,
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
    this.draftsSinceProgress = typeof s.draftsSinceProgress === 'number' ? s.draftsSinceProgress : 0;
    // 旧セーブ（guidanceStall なし）・壊れた値は 0 から始める（無限 pity を作らない）。
    const gs = Number(s.guidanceStall);
    this.guidanceStall = Number.isFinite(gs) && gs > 0 ? Math.min(gs, 1e6) : 0;
  }

  _banishedSet() { return new Set(this.banishedSkillIds); }
  hasPendingDraft() { return !!this.currentDraftId && this.currentCandidates.length > 0; }

  // 新しいレベルアップのドラフトを開く。
  open(ctx) {
    this.levelUpSequence += 1;
    this.cursor += 1;
    this.draftsSinceProgress += 1; // M6-F: 進展なしで重ねたドラフト数（pity 補助）。進化時は markProgress() でリセット。
    // M8-C.1: guidance が有効なジョブのときだけ stall を進める（他ジョブでは常に 0 のまま＝挙動不変）。
    if (this._guidanceActive(ctx)) {
      this.guidanceStall += 1;
      if (this.guidancePityStep() > 0) this.guidancePityTriggers += 1;
    }
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
      // 適格判定は poolEligibility（SkillCatalog / シミュレーター / テストと同一の正）へ集約。
      if (!memberAllowedForJob(m, job, extra)) continue;
      if (banned.has(m.id)) continue;
      if (!this._unlockOk(m, ctx)) continue;
      if (!this._prereqOk(m, ctx, ownedActive, ownedPassive)) continue;
      if (this._conflictsOwned(m, cat, ownedActive, ownedPassive)) continue;

      const owned = isActive ? ownedActive : ownedPassive;
      const lvl = owned[m.id] || 0;
      const maxLevel = m.maxLevel || 1;
      if (lvl > 0) {
        if (lvl < maxLevel) out.push(this._desc(isActive ? 'up_active' : 'up_passive', m, lvl, lvl + 1, ctx));
        // 最大Lv到達は候補から除外（進化は別経路）
      } else {
        const slot = isActive ? slotA : slotP;
        if ((slot.used || 0) < (slot.max || 0)) out.push(this._desc(isActive ? 'new_active' : 'new_passive', m, 0, 1, ctx));
      }
    }
    return out;
  }

  _desc(kind, m, from, to, ctx) {
    const rarityW = (this.config.rarityWeights[m.rarity] || 1) * ((this.config.rarityWeightMult && this.config.rarityWeightMult[m.rarity]) || 1) * (m.weight || 1);
    const syn = this._synergyMult(kind, m, from, to, ctx);
    const g = this._guidanceMult(kind, m, from, to, ctx);
    const out = {
      kind, id: m.id, category: m.category, rarity: m.rarity || 'common',
      fromLevel: from, toLevel: to, maxLevel: m.maxLevel || 1,
      weight: rarityW * syn * g.mult, baseWeight: rarityW, synergyMult: syn,
      conflicts: m.conflicts || [],
    };
    // 倍率 1（＝補助なし）のときはフィールド自体を作らない。他ジョブの候補オブジェクトを 1 バイトも変えないため。
    if (g.mult !== 1) { out.guidanceMult = g.mult; out.guidance = g.tags; }
    return out;
  }

  // ================= M8-C.1: 進化導線補助（ジョブ限定・data 駆動）=================
  // guidance.jobs に載っているジョブの周回でだけ効く。それ以外では常に倍率 1 を返すので、
  // 火の魔女 / 氷術師の候補列・RNG 消費・候補オブジェクトはまったく変わらない。
  //
  // 既存 synergy（M6-F）は「所持している基礎 → その補助スキル」の一方向しか補正しない。
  // 戦士は補助のほとんどが passive（早期に最大化される）で、詰まるのは**基礎 active の Lv8**側なので、
  // その方向の補正が存在しないことが M8-C で slot4 の進化到達率が落ちた主因だった。
  // ここでは基礎側・補助側の両方向を、data の進化レシピからのみ導出して補正する（skill ID のハードコードなし）。
  _guidanceActive(ctx) {
    const cfg = this.config.guidance;
    if (!cfg || cfg.enabled === false) return false;
    const jobId = ctx && ctx.jobId;
    if (!jobId || !Array.isArray(cfg.jobs) || !cfg.jobs.includes(jobId)) return false;
    return Array.isArray(ctx.evolutionRecipes) && ctx.evolutionRecipes.length > 0;
  }

  _guidanceMult(kind, m, from, to, ctx) {
    const none = { mult: 1, tags: null };
    if (!this._guidanceActive(ctx)) return none;
    const cfg = this.config.guidance;
    const syn = (ctx && ctx.synergy) || {};
    if ((syn.battleLevel || 0) < (cfg.minBattleLevel || 0)) return none;

    const oa = (ctx.owned && ctx.owned.active) || {};
    const op = (ctx.owned && ctx.owned.passive) || {};
    const lvOf = (id) => (oa[id] || 0) || (op[id] || 0) || 0;
    const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

    // 同じスキルが複数レシピに関わる場合も倍率を掛け合わせない（役割ごとに最大値だけを採る＝重複上限）。
    let baseMult = 1, supportMult = 1;
    const tags = [];
    for (const r of ctx.evolutionRecipes || []) {
      const baseId = r.baseSkillId;
      const needBase = num(r.baseLevel, 0) || (m.id === baseId ? (m.maxLevel || 1) : 0);
      const baseLv = oa[baseId] || 0;
      const reqs = Array.isArray(r.requirements) ? r.requirements : [];
      const supportReady = reqs.every((q) => lvOf(q.skill) >= (q.level || 1));
      // すでに条件が成立しているレシピは進化候補として別枠で出るので、ここでは煽らない。
      if (baseLv >= needBase && supportReady) continue;

      if (m.id === baseId) {
        let mult = 1;
        if (baseLv <= 0) {
          // 未取得の進化元: **補助がすでに揃っているときだけ**わずかに優遇する（所持 support → 到達可能な base）。
          // 無条件に優遇するとレアリティ階層を歪めるので、条件付きに留める。
          if (kind === 'new_active' && supportReady) { mult *= num(cfg.readyBaseAcquireWeightMultiplier, 1); tags.push('base'); }
        } else if (to <= needBase) {
          mult *= num(cfg.ownedBaseUpgradeWeightMultiplier, 1); tags.push('upgrade');
          const remain = needBase - from;
          if (remain > 0 && remain <= num(cfg.nearMaxRemainingLevels, 0)) mult *= num(cfg.baseNearMaxBonusMultiplier, 1);
          if (supportReady) mult *= num(cfg.supportReadyBaseMultiplier, 1);
        }
        baseMult = Math.max(baseMult, mult);
      } else {
        const q = reqs.find((x) => x.skill === m.id);
        if (!q) continue;
        if (lvOf(m.id) >= (q.level || 1)) continue;          // すでに必要 Lv に達している
        if (baseLv < 1) continue;                             // 基礎未取得なら補助を煽らない（M6-F と同じ考え方）
        let mult = num(cfg.requiredSupportWeightMultiplier, 1);
        if ((q.level || 1) - from <= num(cfg.nearRequiredRemainingLevels, 0)) mult *= num(cfg.supportNearRequiredMultiplier, 1);
        // M8-D: 補助が **active** のレシピは、補助自身が枠を 1 つ占め、必要 Lv も高い（passive 補助は
        // 最大 Lv が低く早期に埋まる）。カタログが増えるほど不利になるので、その分だけ追加で補正する。
        // 判定は候補のカテゴリだけを見る（特定の skill ID を実装に書かない）。
        if (m.category === 'active') mult *= num(cfg.activeSupportWeightMultiplier, 1);
        // M8-E: 必要 Lv が高い補助（Lv6 以上）は、そこへ到達するまでの手数が単純に多い。
        // カタログが大きくなるほど不利になるので、**必要 Lv の高さだけ**を見て追加補正する。
        // 判定はレシピの requirement.level だけ（特定の skill ID を実装に書かない）。
        if ((q.level || 1) >= num(cfg.highRequirementSupportLevel, Infinity)) {
          mult *= num(cfg.highRequirementSupportMultiplier, 1);
        }
        supportMult = Math.max(supportMult, mult);
        tags.push('support');
      }
    }

    let mult = baseMult * supportMult;
    // pity: 進化導線が一定ドラフト進まなければ、基礎/補助側の補正を段階的に強める（上限あり）。
    if (mult > 1) {
      const p = cfg.pity || {};
      const step = this.guidancePityStep();
      if (step > 0) {
        const bonus = Math.min(num(p.maxMultiplier, 1), 1 + num(p.bonusPerStep, 0) * step);
        mult *= bonus;
        tags.push('pity');
      }
    }
    const cap = num(cfg.maxMultiplier, Infinity);
    return { mult: Math.min(mult, cap), tags: tags.length ? tags : null };
  }

  // シナジー補助の重み倍率（M6-F）。レアリティ重みへ乗算する（無視しない）。決定論を壊さない（ctx と draft 状態のみに依存）。
  // ctx.synergy = { partnerIds:(Set|Array), battleLevel }。partnerIds は所持基礎の進化補助スキル（SkillCatalog.evolutionPartnerIds）。
  _synergyMult(kind, m, from, to, ctx) {
    const cfg = this.config.synergy;
    if (!cfg || cfg.synergyAssistEnabled === false) return 1;
    const syn = (ctx && ctx.synergy) || {};
    const battleLevel = syn.battleLevel || 0;
    if (battleLevel < (cfg.synergyAssistMinBattleLevel || 0)) return 1;
    const partners = syn.partnerIds instanceof Set ? syn.partnerIds : new Set(syn.partnerIds || []);
    const isPartner = partners.has(m.id);
    let mult = 1;
    if (isPartner) mult *= (cfg.evolutionPartnerWeightMultiplier || 1);
    if (kind === 'up_active' || kind === 'up_passive') {
      mult *= (cfg.ownedSkillUpgradeWeightMultiplier || 1);
      if (from === (m.maxLevel || 1) - 1) mult *= (cfg.nearlyMaxedSkillWeightMultiplier || 1); // Lv7→8 等
    } else if (!isPartner) {
      mult *= (cfg.unrelatedNewSkillWeightMultiplier || 1); // 既定 ×1.0（無関係な未取得は素通り）
    }
    // pity: 進展が無いまま閾値を超えたら、進化相手候補へ段階的な追加ボーナス（上限あり）。
    if (isPartner) {
      const th = cfg.noProgressDraftThreshold || Infinity;
      if (this.draftsSinceProgress > th) {
        const steps = this.draftsSinceProgress - th;
        const bonus = Math.min((cfg.noProgressMaxMultiplier || 1.5), 1 + (cfg.noProgressWeightBonus || 0) * steps);
        mult *= bonus;
      }
    }
    const cap = cfg.synergyAssistMaxMultiplier || Infinity;
    return Math.min(mult, cap);
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
