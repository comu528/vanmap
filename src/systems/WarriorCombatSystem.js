// WarriorCombatSystem（Milestone 8-B: 戦士）: 戦士固有のランタイム状態を 1 か所へ集約する純ロジック。
// 闘気（fury）/ 闘気解放 / 回復 / コンボ / 被ダメージ軽減 / 不屈 / 撃破回復 / 体勢崩し（poise）を扱う。
//
// 設計方針:
//   - Phaser / DOM 非依存。時間は now() コールバック、回復は heal() コールバック経由（Node からテスト可能）。
//   - スキルクラスは profile や Scene の内部状態へ直接触らず、必ずこのクラスの API を通す。
//   - 数値はすべて data（balance.json の warrior ブロック）から受け取り、ここにハードコードしない。
//   - 決定論: 乱数を一切使わない（すべて命中・撃破・時間で決まる）。
//   - 二重加算の防止: 闘気/コンボの獲得は「cast（hitGroup）単位の上限」を持つ。
//     DoT・他ジョブのダメージ・残響/分身由来の派生は castKey を持たないため加算されない。
//
// 用語:
//   fury        闘気。近接命中・撃破・コンボ・軽減で溜まり、100 で自動的に「闘気解放」する。
//   release     闘気解放。一定時間の攻防バフ＋時間経過回復。終了で fury は 0 へ戻る。
//   combo       近接を当て続けると増え、grace 経過後は毎秒減衰する。閾値でボーナス。
//   unyielding  不屈。瀕死で 1 回だけ発動する戦士の基礎能力（passive ではない）。重装で強化。
//   poise       体勢。エリートは stagger、ボスは stance break → exposed。氷の frostbreak とは独立。

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
const isFiniteNum = (v) => (typeof v === 'number' && Number.isFinite(v));

// balance.json の warrior ブロックが欠けていても壊れない既定値（テスト・旧データ用の安全側）。
export const WARRIOR_DEFAULTS = {
  fury: {
    max: 100, gainPerMeleeHit: 1.0, gainPerKill: 2.5, gainPerComboStep: 0.3,
    gainPerMitigatedDamage: 0.06, gainPerDamageTaken: 0.02,
    maxGainPerCast: 6, maxGainPerSecond: 16, releaseGainMult: 0.15,
  },
  furyRelease: {
    durationMs: 5000, meleeDamageMult: 1.2, attackSpeedMult: 1.25, damageReduction: 0.25,
    knockbackMult: 1.2, poiseDamageMult: 1.2,
    recovery: { maxHpPercent: 0.02, missingHpPercent: 0.08, durationMs: 5000 },
  },
  combo: {
    maxValue: 999, gainPerHit: 1, maxGainPerCast: 3, sameTargetWindowMs: 250,
    graceMs: 2500, decayPerSec: 8,
    thresholds: [
      { at: 10, attackSpeedMult: 0.05 },
      { at: 25, meleeAreaMult: 0.08 },
      { at: 50, meleeDamageMult: 0.10 },
      { at: 100, poiseDamageMult: 0.15, furyGainMult: 0.10 },
    ],
  },
  mitigation: {
    engagedRadius: 96, engagedReduction: 0.08, meleeCastWindowMs: 600, meleeCastReduction: 0.05,
    chargeReduction: 0.30, maxTotalReduction: 0.70,
  },
  unyielding: {
    hpThreshold: 0.25, cooldownMs: 45000, durationMs: 3000, damageReduction: 0.50,
    healMaxHpPercent: 0.08, minRunTimeMs: 5000,
  },
  killHeal: { maxHpPercent: 0.0015, perSecondCapPercent: 0.015, releaseMult: 1.35, eliteMult: 3, bossMult: 8 },
  poise: {
    decayPerSec: 6,
    elite: { threshold: 120, staggerMs: 600, immunityMs: 1500, slowFactor: 0.85, knockbackToPoise: 0.7, knockbackReduction: 0.75 },
    boss: {
      threshold: 300, reactionMs: 300, exposedMs: 4000, thresholdGrowth: 1.25, thresholdMaxMult: 3,
      breakCooldownMs: 1500, exposedMeleeDamageMult: 0.15, exposedFuryGainMult: 0.25,
    },
  },
  autoMove: {
    clusterRadius: 110, approachWeight: 1.2, engageRange: 70, lowHpFraction: 0.35,
    retreatWeight: 0.9, bossTelegraphWeight: 1.3, maxClusterSamples: 24,
  },
  // M8-C: 戦吼の一時バフ（formal status ではなく本クラス上の timed buff）。
  warCry: { maxDurationMs: 12000, maxMeleeDamageBonus: 0.5, maxFuryGainBonus: 0.6, maxComboGraceBonus: 1.0, stack: 'refresh' },
  // M8-C: 反撃の調停（1 被弾イベントにつき最大 1 系統）。
  counter: {
    maxPerDamageEvent: 1, globalCooldownMs: 200,
    priority: { adamant_counter: 3, unyielding_fortress: 2, counter_stance: 1 },
  },
  // M8-C: 処刑（通常敵のみ即死可能）。
  execute: { allowElite: false, allowBoss: false, bossMissingHpCapDefault: 0.5, maxExecutesPerSecond: 6 },
  // M8-C: 鎖鉤の引き寄せ（ボスは動かさない）。
  pull: { bossPullDistance: 0, worldMargin: 24, maxPullPerCast: 1 },
};

// 闘気の獲得源（telemetry のキーと 1:1）。
export const FURY_SOURCES = ['meleeHit', 'kill', 'combo', 'mitigated', 'damageTaken', 'exposed'];

function mergeDefaults(cfg) {
  const src = cfg || {};
  const out = {};
  for (const k of Object.keys(WARRIOR_DEFAULTS)) {
    const d = WARRIOR_DEFAULTS[k];
    const s = src[k];
    if (!s || typeof s !== 'object') { out[k] = JSON.parse(JSON.stringify(d)); continue; }
    out[k] = { ...JSON.parse(JSON.stringify(d)), ...s };
    // 1 段だけネストを持つブロック（recovery / elite / boss）はさらにマージする。
    for (const nk of ['recovery', 'elite', 'boss', 'priority']) {
      if (d[nk] && typeof d[nk] === 'object') out[k][nk] = { ...d[nk], ...(s[nk] || {}) };
    }
    if (k === 'combo' && Array.isArray(s.thresholds)) out[k].thresholds = s.thresholds;
  }
  return out;
}

export class WarriorCombatSystem {
  // opts: { config, now(), heal(amount) -> 実際に回復した量, emit(type, payload), telemetry }
  constructor(opts = {}) {
    this.cfg = mergeDefaults(opts.config);
    this._now = typeof opts.now === 'function' ? opts.now : (() => 0);
    this._heal = typeof opts.heal === 'function' ? opts.heal : (() => 0);
    this._emit = typeof opts.emit === 'function' ? opts.emit : (() => {});
    this.enabled = opts.enabled !== false;
    // 外部から与える倍率（Job Lv / passive）。すべて既定 1（＝恒等）。
    this.mods = {
      furyGainMult: 1, releaseDurationBonusMs: 0, recoveryMult: 1,
      comboGraceMult: 1, comboDecayMult: 1, comboThresholdBonusMult: 1,
      damageReductionBonus: 0,
      unyieldingPowerMult: 1, killHealMult: 0, killHealCapMult: 1, killHealReleaseMult: 1,
      poiseDamageMult: 1, knockbackMult: 1, meleeDamageMult: 1, attackSpeedMult: 1,
      exposedDamageBonus: 0,
    };
    this.reset();
  }

  // ---- 生涯状態のリセット（周回開始 / Scene 終了）----
  reset() {
    this.fury = 0;
    this.releaseLeftMs = 0;
    this.recovery = { leftMs: 0, totalMs: 0, remainAmount: 0 };
    this.combo = 0;
    this.comboGraceLeftMs = 0;
    this.unyielding = { cooldownLeftMs: 0, activeLeftMs: 0, healLeftMs: 0, healRemain: 0, triggers: 0 };
    this.bossPoise = { gauge: 0, thresholdMult: 1, breaks: 0, cooldownLeftMs: 0, exposedLeftMs: 0, reactionLeftMs: 0 };
    this._castBudgets = new Map();   // castKey -> { fury, combo }
    this._targetHitAt = new Map();   // target -> 最後にコンボを与えた時刻（同一敵の多段水増し防止）
    this._furySecondWindow = { startMs: -Infinity, gained: 0 };
    this._killHealWindow = { startMs: -Infinity, healed: 0 };
    this._lastMeleeCastAt = -Infinity;
    this._chargeUntilMs = 0;
    // M8-C: 戦吼の一時バフ（重ねがけせず上書き更新する）。
    this.warCry = { leftMs: 0, meleeDamageBonus: 0, furyGainBonus: 0, comboGraceBonus: 0 };
    // M8-C: 反撃の構え（source ごとに 1 つ。1 被弾イベントで反撃するのは優先度が最も高い 1 系統だけ）。
    this.counterWindows = new Map(); // source -> { leftMs, used, max, priority, mitigation, gapLeftMs, gapMs }
    this._counterGlobalCdLeftMs = 0;
    this._executeSecondWindow = { startMs: -Infinity, count: 0 };
    this._runStartMs = this._now();
    this.telemetry = this._emptyTelemetry();
  }

  _emptyTelemetry() {
    const bySource = {};
    for (const s of FURY_SOURCES) bySource[s] = 0;
    return {
      meleeCasts: 0, meleeHits: 0, physicalDamage: 0,
      comboPeak: 0, comboSum: 0, comboSamples: 0, comboBreaks: 0,
      comboThresholdCounts: {}, comboActiveMs: 0,
      furyGained: 0, furyBySource: bySource, furyOvercap: 0,
      furyReleases: 0, furyReleaseUptimeMs: 0, furyReleaseIntervalSumMs: 0, _lastReleaseAt: -1,
      recoveryAmount: 0, overhealPrevented: 0,
      mitigationAmount: 0,
      unyieldingTriggers: 0, unyieldingHealing: 0, unyieldingMitigated: 0, deathsAfterUnyielding: 0,
      killHeal: 0, killHealCapped: 0,
      knockbacks: 0, poiseDamage: 0, eliteStaggers: 0, bossStanceBreaks: 0,
      exposedUptimeMs: 0, exposedBonusDamage: 0, exposedBonusFury: 0,
      // M8-C: 処刑 / 反撃 / 戦吼 / 引き寄せ。
      executions: 0, executeFailures: 0, executeOverkill: 0,
      counters: 0, counterBySource: {},
      warCryApplications: 0, warCryUptimeMs: 0,
      chainPulls: 0, chainPullDistance: 0, bossApproaches: 0,
      leapLandings: 0, sweepDistance: 0, relentlessChains: 0, relentlessRetargets: 0,
    };
  }

  // ---- 外部倍率の設定（Job Lv / passive。run 開始時と passive 取得時に呼ぶ）----
  setMods(m) { if (m) for (const k of Object.keys(this.mods)) if (typeof m[k] === 'number' && Number.isFinite(m[k])) this.mods[k] = m[k]; }

  // ---- 状態の問い合わせ ----
  get releaseActive() { return this.releaseLeftMs > 0; }
  get furyRatio() { return clamp(this.fury / Math.max(1, num(this.cfg.fury.max, 100)), 0, 1); }
  get unyieldingActive() { return this.unyielding.activeLeftMs > 0; }
  get unyieldingReady() { return this.unyielding.cooldownLeftMs <= 0; }
  get exposedActive() { return this.bossPoise.exposedLeftMs > 0; }
  bossPoiseThreshold() { return num(this.cfg.poise.boss.threshold, 300) * this.bossPoise.thresholdMult; }

  // ---- コンボ閾値のボーナス（現在のコンボ値で有効なものを合成）----
  comboBonuses() {
    const out = { attackSpeedMult: 0, meleeAreaMult: 0, meleeDamageMult: 0, poiseDamageMult: 0, furyGainMult: 0, reached: [] };
    const bonusMult = Math.max(0, this.mods.comboThresholdBonusMult);
    for (const t of this.cfg.combo.thresholds || []) {
      if (this.combo < num(t.at, Infinity)) continue;
      out.reached.push(num(t.at, 0));
      for (const k of ['attackSpeedMult', 'meleeAreaMult', 'meleeDamageMult', 'poiseDamageMult', 'furyGainMult']) {
        if (typeof t[k] === 'number') out[k] += t[k] * bonusMult;
      }
    }
    return out;
  }

  // 近接ダメージ倍率（コンボ閾値 × 闘気解放 × passive/JobLv × exposed）。
  meleeDamageMultiplier(target) {
    const c = this.comboBonuses();
    let m = (1 + c.meleeDamageMult) * this.mods.meleeDamageMult;
    if (this.warCry.leftMs > 0) m *= (1 + this.warCry.meleeDamageBonus); // M8-C: 戦吼
    if (this.releaseActive) m *= num(this.cfg.furyRelease.meleeDamageMult, 1);
    if (target && target.isBoss && this.exposedActive) {
      m *= (1 + num(this.cfg.poise.boss.exposedMeleeDamageMult, 0) + this.mods.exposedDamageBonus);
    }
    return m;
  }
  // 近接範囲倍率（コンボ閾値のみ。パッシブ area は既存 PassiveManager 経路が担当）。
  meleeAreaMultiplier() { return 1 + this.comboBonuses().meleeAreaMult; }
  // 攻撃/詠唱速度倍率 → クールダウン倍率（1/speed）。
  attackSpeedMultiplier() {
    const c = this.comboBonuses();
    let s = (1 + c.attackSpeedMult) * this.mods.attackSpeedMult;
    if (this.releaseActive) s *= num(this.cfg.furyRelease.attackSpeedMult, 1);
    return Math.max(0.1, s);
  }
  cooldownMultiplier() { return 1 / this.attackSpeedMultiplier(); }
  // ノックバック倍率・体勢削り倍率。
  knockbackMultiplier() {
    let m = this.mods.knockbackMult;
    if (this.releaseActive) m *= num(this.cfg.furyRelease.knockbackMult, 1);
    return m;
  }
  poiseDamageMultiplier() {
    const c = this.comboBonuses();
    let m = (1 + c.poiseDamageMult) * this.mods.poiseDamageMult;
    if (this.releaseActive) m *= num(this.cfg.furyRelease.poiseDamageMult, 1);
    return m;
  }

  // 1 cast あたりの上限を、進化の safetyCaps（より厳しい側）で上書きする。
  // 進化が maxComboGainPerCast / maxFuryGainPerCast を宣言していれば、その cast だけ狭い上限になる。
  setCastLimits(castKey, limits) {
    if (!this.enabled || castKey == null || !limits) return;
    const b = this._budget(castKey);
    if (isFiniteNum(limits.fury)) b.furyMax = Math.min(num(b.furyMax, Infinity), limits.fury);
    if (isFiniteNum(limits.combo)) b.comboMax = Math.min(num(b.comboMax, Infinity), limits.combo);
  }

  // ---- 闘気 ----
  // castKey: 同一 cast（hitGroup）内での加算上限をかけるキー。null なら上限なし（撃破など単発イベント）。
  addFury(amount, source, castKey) {
    if (!this.enabled) return 0;
    let amt = num(amount, 0);
    if (amt <= 0) return 0;
    // 闘気解放中は獲得を大幅減衰（わざと解放中に稼ぐ最適化を防ぐ）。
    if (this.releaseActive) amt *= num(this.cfg.fury.releaseGainMult, 0.15);
    // コンボ閾値 / Job Lv / passive の獲得倍率。
    amt *= this.mods.furyGainMult * (1 + this.comboBonuses().furyGainMult);
    if (this.warCry.leftMs > 0) amt *= (1 + this.warCry.furyGainBonus); // M8-C: 戦吼
    // ボス体勢崩し中（exposed）は獲得増加。
    if (this.exposedActive) amt *= (1 + num(this.cfg.poise.boss.exposedFuryGainMult, 0));
    if (amt <= 0) return 0;

    // 1 cast（hitGroup）あたりの上限（multi-hit の無制限蓄積を防ぐ）。
    if (castKey != null) {
      const b = this._budget(castKey);
      const capPerCast = Math.min(num(this.cfg.fury.maxGainPerCast, 6), num(b.furyMax, Infinity));
      const room = Math.max(0, capPerCast - b.fury);
      if (room <= 0) return 0;
      if (amt > room) amt = room;
      b.fury += amt;
    }
    // 1 秒あたりの上限（雑魚 100 体で一瞬満タンを繰り返さない）。
    const now = this._now();
    const w = this._furySecondWindow;
    if (now - w.startMs >= 1000) { w.startMs = now; w.gained = 0; }
    const secRoom = Math.max(0, num(this.cfg.fury.maxGainPerSecond, 16) - w.gained);
    if (secRoom <= 0) return 0;
    if (amt > secRoom) amt = secRoom;
    w.gained += amt;

    const max = num(this.cfg.fury.max, 100);
    const before = this.fury;
    this.fury = clamp(this.fury + amt, 0, max);
    const applied = this.fury - before;
    const overcap = amt - applied;
    this.telemetry.furyGained += applied;
    if (overcap > 0) this.telemetry.furyOvercap += overcap;
    if (source && Object.prototype.hasOwnProperty.call(this.telemetry.furyBySource, source)) {
      this.telemetry.furyBySource[source] += applied;
    }
    if (this.exposedActive) this.telemetry.exposedBonusFury += applied;
    if (this.fury >= max) this.startRelease();
    return applied;
  }

  _budget(castKey) {
    let b = this._castBudgets.get(castKey);
    if (!b) {
      b = { fury: 0, combo: 0, furyMax: Infinity, comboMax: Infinity, at: this._now() };
      // 上限管理の Map が無制限に伸びないよう、古いエントリを間引く（60 件を超えたら最古を捨てる）。
      if (this._castBudgets.size >= 60) {
        const oldest = this._castBudgets.keys().next().value;
        this._castBudgets.delete(oldest);
      }
      this._castBudgets.set(castKey, b);
    }
    return b;
  }

  // 闘気解放（100 到達で自動・再帰しない）。
  startRelease() {
    if (!this.enabled || this.releaseActive) return false;
    const cfg = this.cfg.furyRelease;
    const dur = Math.max(0, num(cfg.durationMs, 5000) + this.mods.releaseDurationBonusMs);
    this.releaseLeftMs = dur;
    this.fury = 0;
    // 回復: 「最大HPの a% ＋ 失ったHPの b%」を recovery 時間で徐々に返す（一括全快しない）。
    const amount = this._plannedRecovery();
    this.recovery = { leftMs: Math.max(1, num(cfg.recovery.durationMs, dur)), totalMs: Math.max(1, num(cfg.recovery.durationMs, dur)), remainAmount: amount };
    this.telemetry.furyReleases += 1;
    const now = this._now();
    if (this.telemetry._lastReleaseAt >= 0) this.telemetry.furyReleaseIntervalSumMs += (now - this.telemetry._lastReleaseAt);
    this.telemetry._lastReleaseAt = now;
    this._emit('furyRelease', { durationMs: dur, recovery: amount });
    return true;
  }

  _plannedRecovery() {
    const rc = this.cfg.furyRelease.recovery || {};
    const maxHp = num(this._maxHp, 0);
    const curHp = num(this._curHp, 0);
    const missing = Math.max(0, maxHp - curHp);
    const raw = maxHp * num(rc.maxHpPercent, 0) + missing * num(rc.missingHpPercent, 0);
    return Math.max(0, raw * Math.max(0, this.mods.recoveryMult));
  }

  // HP の現在値を毎フレーム渡す（回復量の算出と不屈の判定に使う）。
  setHp(cur, max) { this._curHp = num(cur, 0); this._maxHp = num(max, 0); }

  // ---- コンボ ----
  // target: 同一敵への多段水増しを抑えるためのキー（省略可）。
  addCombo(hits, castKey, target) {
    if (!this.enabled) return 0;
    let n = Math.max(0, Math.floor(num(hits, 0)));
    if (n <= 0) return 0;
    const cfg = this.cfg.combo;
    const now = this._now();
    // 同一敵への短時間の多段はコンボを増やさない。
    if (target != null) {
      const last = this._targetHitAt.get(target);
      if (last != null && now - last < num(cfg.sameTargetWindowMs, 250)) return 0;
      if (this._targetHitAt.size >= 200) this._targetHitAt.clear();
      this._targetHitAt.set(target, now);
    }
    if (castKey != null) {
      const b = this._budget(castKey);
      const capPerCast = Math.min(num(cfg.maxGainPerCast, 3), num(b.comboMax, Infinity));
      const room = Math.max(0, capPerCast - b.combo);
      if (room <= 0) return 0;
      if (n > room) n = room;
      b.combo += n;
    }
    const before = this.combo;
    this.combo = clamp(this.combo + n * num(cfg.gainPerHit, 1), 0, num(cfg.maxValue, 999));
    this.comboGraceLeftMs = num(cfg.graceMs, 2500) * Math.max(0.1, this.mods.comboGraceMult)
      * (this.warCry.leftMs > 0 ? (1 + this.warCry.comboGraceBonus) : 1); // M8-C: 戦吼
    const gained = this.combo - before;
    if (this.combo > this.telemetry.comboPeak) this.telemetry.comboPeak = this.combo;
    // 閾値の到達（またぐたびに 1 回）。
    for (const t of cfg.thresholds || []) {
      const at = num(t.at, Infinity);
      if (before < at && this.combo >= at) {
        const key = String(at);
        this.telemetry.comboThresholdCounts[key] = (this.telemetry.comboThresholdCounts[key] || 0) + 1;
        this._emit('comboThreshold', { at, combo: this.combo });
      }
    }
    // コンボ由来の闘気（コンボそのものが闘気を生む＝殴り続ける報酬）。
    if (gained > 0) this.addFury(num(this.cfg.fury.gainPerComboStep, 0) * gained, 'combo', castKey);
    return gained;
  }

  breakCombo() {
    if (this.combo <= 0) return;
    this.combo = 0;
    this.comboGraceLeftMs = 0;
    this.telemetry.comboBreaks += 1;
    this._emit('comboBreak', {});
  }

  // ---- 近接命中の共通入口（スキルはここだけを呼ぶ）----
  // opts: { castKey, target, damage, isMelee, knockback, poiseDamage, comboGain, furyGain }
  noteMeleeHit(opts = {}) {
    if (!this.enabled) return { combo: 0, fury: 0 };
    this.telemetry.meleeHits += 1;
    this.telemetry.physicalDamage += num(opts.damage, 0);
    if (this.exposedActive && opts.target && opts.target.isBoss) this.telemetry.exposedBonusDamage += num(opts.damage, 0);
    const castKey = opts.castKey != null ? opts.castKey : null;
    const combo = this.addCombo(num(opts.comboGain, 1), castKey, opts.target);
    const fury = this.addFury(num(opts.furyGain, this.cfg.fury.gainPerMeleeHit), 'meleeHit', castKey);
    return { combo, fury }; // スキル別テレメトリ用（実際に加算された量）
  }

  noteMeleeCast(skillId) {
    if (!this.enabled) return;
    this.telemetry.meleeCasts += 1;
    this._lastMeleeCastAt = this._now();
    void skillId;
  }

  // ---- 撃破 ----
  // 撃破回復は passive「血気」（killHealMult>0）を取得しているときだけ発生する。
  noteKill(enemy) {
    if (!this.enabled) return 0;
    this.addFury(num(this.cfg.fury.gainPerKill, 0), 'kill', null);
    return this._killHeal(enemy);
  }

  // M8-C: 進化「血断処刑」が撃破時の回復を強めるための追加口。
  // 通常の撃破回復と同じ毎秒上限を共有するので、永久機関にはならない。
  noteKillHealBonus(enemy, bonus) {
    if (!this.enabled) return 0;
    const b = Math.max(0, num(bonus, 0));
    if (b <= 0) return 0;
    return this._killHeal(enemy, b);
  }

  _killHeal(enemy, extraMult = 1) {
    const mult = this.mods.killHealMult;
    if (!(mult > 0)) return 0;
    const cfg = this.cfg.killHeal;
    const maxHp = num(this._maxHp, 0);
    if (maxHp <= 0) return 0;
    let amount = maxHp * num(cfg.maxHpPercent, 0) * mult * Math.max(0, num(extraMult, 1));
    if (enemy && enemy.isBoss) amount *= num(cfg.bossMult, 1);
    else if (enemy && enemy.isElite) amount *= num(cfg.eliteMult, 1);
    if (this.releaseActive) amount *= num(cfg.releaseMult, 1) * this.mods.killHealReleaseMult;
    if (amount <= 0) return 0;
    // 毎秒上限（永久機関の防止）。
    const now = this._now();
    const w = this._killHealWindow;
    if (now - w.startMs >= 1000) { w.startMs = now; w.healed = 0; }
    const capPerSec = maxHp * num(cfg.perSecondCapPercent, 0) * Math.max(0, this.mods.killHealCapMult);
    const room = Math.max(0, capPerSec - w.healed);
    if (room <= 0) { this.telemetry.killHealCapped += 1; return 0; }
    if (amount > room) { amount = room; this.telemetry.killHealCapped += 1; }
    const healed = num(this._heal(amount), 0);
    w.healed += healed;
    this.telemetry.killHeal += healed;
    if (amount - healed > 0) this.telemetry.overhealPrevented += (amount - healed);
    return healed;
  }

  // ---- 被ダメージ軽減 ----
  // ctx: { engaged, charging, extra }
  //   extra = skill 由来の一時軽減（盾撃・突進斬り・不屈の城塞）。合計は maxTotalReduction でクランプする。
  damageReduction(ctx = {}) {
    if (!this.enabled) return 0;
    const cfg = this.cfg.mitigation;
    let r = Math.max(0, num(ctx.extra, 0));
    if (ctx.engaged) r += num(cfg.engagedReduction, 0);
    if (this._now() - this._lastMeleeCastAt <= num(cfg.meleeCastWindowMs, 0)) r += num(cfg.meleeCastReduction, 0);
    if (ctx.charging || this._now() < this._chargeUntilMs) r += num(cfg.chargeReduction, 0);
    if (this.releaseActive) r += num(this.cfg.furyRelease.damageReduction, 0);
    if (this.unyieldingActive) r += num(this.cfg.unyielding.damageReduction, 0) * Math.max(0, this.mods.unyieldingPowerMult);
    r += this.mods.damageReductionBonus;                 // Job Lv20 / 重装
    return clamp(r, 0, num(cfg.maxTotalReduction, 0.7)); // 0 ダメージの永久無敵は作らない
  }

  // 被弾処理の入口。軽減後のダメージを返し、軽減量ぶんの闘気を与える。
  // 実際の HP 減算は Player 側が行う（このクラスは HP を持たない）。
  applyIncomingDamage(amount, ctx = {}) {
    const raw = Math.max(0, num(amount, 0));
    if (!this.enabled || raw <= 0) return raw;
    const red = this.damageReduction(ctx);
    const mitigated = raw * red;
    const out = raw - mitigated;
    if (mitigated > 0) {
      this.telemetry.mitigationAmount += mitigated;
      if (this.unyieldingActive) this.telemetry.unyieldingMitigated += mitigated;
      this.addFury(mitigated * num(this.cfg.fury.gainPerMitigatedDamage, 0), 'mitigated', null);
    }
    if (out > 0) this.addFury(out * num(this.cfg.fury.gainPerDamageTaken, 0), 'damageTaken', null);
    return out;
  }

  // 突進中の軽減ウィンドウ（charge_slash が dash 開始時に登録する）。
  setChargeWindow(ms) { this._chargeUntilMs = this._now() + Math.max(0, num(ms, 0)); }

  // ================= M8-C: 戦吼の一時バフ =================
  // formal status を増やさず、本クラス上の timed buff として持つ。**重ねがけしない**（refresh / 上書き）。
  // 同じ skill を連打しても持続と強度は「新しい値で上書き」され、無限 stack にならない。
  applyWarCryBuff(o = {}) {
    if (!this.enabled) return null;
    const cfg = this.cfg.warCry;
    const dur = clamp(num(o.durationMs, 0), 0, num(cfg.maxDurationMs, 12000));
    if (dur <= 0) return null;
    // 重ねがけ規則。'refresh'（既定）= 上書き更新。それ以外は「既にバフ中なら何もしない」。
    // どちらの場合も stack して強くなることはない。
    const mode = o.stack || cfg.stack || 'refresh';
    if (mode !== 'refresh' && this.warCry.leftMs > 0) return null;
    this.warCry = {
      leftMs: dur, // 上書き（加算しない）
      meleeDamageBonus: clamp(num(o.meleeDamageBonus, 0), 0, num(cfg.maxMeleeDamageBonus, 0.5)),
      furyGainBonus: clamp(num(o.furyGainBonus, 0), 0, num(cfg.maxFuryGainBonus, 0.6)),
      comboGraceBonus: clamp(num(o.comboGraceBonus, 0), 0, num(cfg.maxComboGraceBonus, 1)),
    };
    // 進化「軍神咆哮」の grace 回復（コンボ値そのものは増やさない＝無料コンボを配らない）。
    const refill = clamp(num(o.graceRefill, 0), 0, 1);
    if (refill > 0 && this.combo > 0) {
      const full = num(this.cfg.combo.graceMs, 2500) * Math.max(0.1, this.mods.comboGraceMult)
        * (1 + this.warCry.comboGraceBonus);
      this.comboGraceLeftMs = Math.max(this.comboGraceLeftMs, full * refill);
    }
    this.telemetry.warCryApplications += 1;
    this._emit('warCry', { durationMs: dur, ...this.warCry });
    return { ...this.warCry };
  }
  get warCryActive() { return this.warCry.leftMs > 0; }

  // ================= M8-C: 反撃の調停 =================
  // 反撃を持つ skill は「構え（counter window）」をここへ登録し、被弾時は consumeCounterEvent() が
  // **優先度の最も高い 1 系統だけ**を選ぶ。1 被弾イベントで複数系統が同時に反撃することはない。
  // 同じ source の再登録は refresh（上書き）で、重ねがけにならない。
  beginCounterWindow(source, o = {}) {
    if (!this.enabled || !source) return null;
    const pr = this.cfg.counter.priority || {};
    const w = {
      leftMs: Math.max(0, num(o.durationMs, 0)),
      used: 0,
      max: Math.max(1, Math.round(num(o.maxCounters, 1))),
      priority: num(o.priority, num(pr[source], 0)),
      mitigation: clamp(num(o.mitigation, 0), 0, 1),
      gapMs: Math.max(0, num(o.counterCooldownMs, 0)),
      gapLeftMs: 0,
    };
    if (w.leftMs <= 0) return null;
    this.counterWindows.set(source, w); // refresh（重ねない）
    return { ...w };
  }
  endCounterWindow(source) { this.counterWindows.delete(source); }
  counterWindowOf(source) { const w = this.counterWindows.get(source); return w ? { ...w } : null; }
  // 現在開いている構えの軽減量（最大値。合算しない）。damageReduction の ctx.extra へ渡す。
  counterMitigation() {
    if (!this.enabled) return 0;
    let m = 0;
    for (const w of this.counterWindows.values()) if (w.leftMs > 0) m = Math.max(m, w.mitigation);
    return m;
  }
  // 反撃可能な系統の中から優先度が最も高い 1 つを選び、その使用回数を進めて source 名を返す。
  // 反撃できるものが無ければ null。**反撃の中からこれを再度呼んでも新しい反撃は起きない**
  // （globalCooldownMs があり、かつ呼び出し側が反撃中は consume しないため）。
  consumeCounterEvent() {
    if (!this.enabled) return null;
    if (this._counterGlobalCdLeftMs > 0) return null;
    let best = null, bestSource = null;
    for (const [src, w] of this.counterWindows) {
      if (w.leftMs <= 0 || w.used >= w.max || w.gapLeftMs > 0) continue;
      if (!best || w.priority > best.priority) { best = w; bestSource = src; }
    }
    if (!best) return null;
    best.used += 1;
    best.gapLeftMs = best.gapMs;
    this._counterGlobalCdLeftMs = num(this.cfg.counter.globalCooldownMs, 0);
    this.telemetry.counters += 1;
    this.telemetry.counterBySource[bestSource] = (this.telemetry.counterBySource[bestSource] || 0) + 1;
    this._emit('counter', { source: bestSource, used: best.used, max: best.max });
    return { source: bestSource, used: best.used, max: best.max, priority: best.priority };
  }

  // ================= M8-C: 処刑の可否 =================
  // 通常敵だけが即死可能。エリート/ボスは失った HP に応じた追加ダメージ倍率のみを返す。
  // o: { thresholdNormal, missingHpBonusElite, missingHpBonusBoss, bossMissingHpCap }
  executePolicy(target, o = {}) {
    const out = { canExecute: false, damageMult: 1, reason: 'none' };
    if (!this.enabled || !target || !target.alive) { out.reason = 'invalid'; return out; }
    const maxHp = num(target.maxHp, 0);
    const hp = num(target.hp, 0);
    if (maxHp <= 0) { out.reason = 'invalid'; return out; }
    const missing = clamp(1 - hp / maxHp, 0, 1);
    const cfg = this.cfg.execute;
    if (target.isBoss) {
      if (cfg.allowBoss !== true) {
        const cap = clamp(num(o.bossMissingHpCap, num(cfg.bossMissingHpCapDefault, 0.5)), 0, 1);
        out.damageMult = 1 + Math.min(missing, cap) * Math.max(0, num(o.missingHpBonusBoss, 0));
        out.reason = 'bossNoExecute';
        return out;
      }
    } else if (target.isElite) {
      if (cfg.allowElite !== true) {
        out.damageMult = 1 + missing * Math.max(0, num(o.missingHpBonusElite, 0));
        out.reason = 'eliteNoExecute';
        return out;
      }
    } else {
      const th = clamp(num(o.thresholdNormal, 0), 0, 1);
      if (hp / maxHp <= th) {
        // 1 秒あたりの処刑回数に上限を置く（無限処刑の防止）。
        const now = this._now();
        const w = this._executeSecondWindow;
        if (now - w.startMs >= 1000) { w.startMs = now; w.count = 0; }
        if (w.count >= num(cfg.maxExecutesPerSecond, 6)) { out.reason = 'rateLimited'; return out; }
        w.count += 1;
        out.canExecute = true;
        out.reason = 'execute';
        return out;
      }
      out.reason = 'aboveThreshold';
    }
    return out;
  }
  // 処刑の結果を統計へ記録する（実際の kill は Scene 側の dealDamage 経路が行う）。
  noteExecute(ok, overkill) {
    if (!this.enabled) return;
    if (ok) { this.telemetry.executions += 1; this.telemetry.executeOverkill += Math.max(0, num(overkill, 0)); }
    else this.telemetry.executeFailures += 1;
  }
  // 鎖鉤 / 跳躍 / 進軍の移動系の統計（judgement には影響しない）。
  noteMovement(kind, amount) {
    if (!this.enabled) return;
    const v = Math.max(0, num(amount, 0));
    if (kind === 'chainPull') { this.telemetry.chainPulls += 1; this.telemetry.chainPullDistance += v; }
    else if (kind === 'bossApproach') { this.telemetry.bossApproaches += 1; this.telemetry.chainPullDistance += v; }
    else if (kind === 'leapLanding') this.telemetry.leapLandings += 1;
    else if (kind === 'sweep') this.telemetry.sweepDistance += v;
    else if (kind === 'relentlessChain') this.telemetry.relentlessChains += 1;
    else if (kind === 'relentlessRetarget') this.telemetry.relentlessRetargets += 1;
  }

  // ---- 不屈（瀕死時の基礎能力）----
  // 毎フレーム setHp のあとに呼ぶ。発動したら true。
  checkUnyielding() {
    if (!this.enabled) return false;
    const cfg = this.cfg.unyielding;
    if (this.unyielding.activeLeftMs > 0 || this.unyielding.cooldownLeftMs > 0) return false;
    if (this._now() - this._runStartMs < num(cfg.minRunTimeMs, 0)) return false; // 周回開始直後は発動しない
    const maxHp = num(this._maxHp, 0);
    if (maxHp <= 0) return false;
    if (this._curHp <= 0) return false;                                          // 死亡後には発動しない
    if (this._curHp / maxHp >= num(cfg.hpThreshold, 0.25)) return false;
    this.unyielding.activeLeftMs = num(cfg.durationMs, 3000);
    this.unyielding.cooldownLeftMs = num(cfg.cooldownMs, 45000);
    const heal = maxHp * num(cfg.healMaxHpPercent, 0) * Math.max(0, this.mods.unyieldingPowerMult);
    this.unyielding.healRemain = heal;
    this.unyielding.healLeftMs = num(cfg.durationMs, 3000);
    this.unyielding.triggers += 1;
    this.telemetry.unyieldingTriggers += 1;
    this._emit('unyielding', { durationMs: this.unyielding.activeLeftMs, heal });
    return true;
  }

  noteDeath() { if (this.unyieldingActive) this.telemetry.deathsAfterUnyielding += 1; }

  // ---- 体勢崩し（poise）----
  // 通常敵は持続ゲージを持たない（skill 側の knockback で処理する）。
  // エリート: しきい値で stagger。ボス: しきい値で stance break → exposed。
  applyPoiseDamage(target, amount) {
    if (!this.enabled || !target || !target.alive) return null;
    const amt = Math.max(0, num(amount, 0)) * this.poiseDamageMultiplier();
    if (amt <= 0) return null;
    this.telemetry.poiseDamage += amt;
    if (target.isBoss) return this._bossPoise(target, amt);
    if (target.isElite) return this._elitePoise(target, amt);
    return null; // 通常敵はゲージを持たない
  }

  _elitePoise(e, amt) {
    const cfg = this.cfg.poise.elite;
    const now = this._now();
    if (num(e._poiseImmuneUntil, 0) > now) return null;
    e._poise = num(e._poise, 0) + amt;
    const th = num(cfg.threshold, 120);
    if (e._poise < th) return null;
    e._poise = 0;
    e._poiseImmuneUntil = now + num(cfg.immunityMs, 1500);
    e._staggerUntil = now + num(cfg.staggerMs, 600);
    e._staggerSlow = clamp(num(cfg.slowFactor, 0.85), 0, 1); // Enemy.effectiveSpeed が読む減速率
    this.telemetry.eliteStaggers += 1;
    this._emit('eliteStagger', { target: e, durationMs: num(cfg.staggerMs, 600) });
    return { type: 'eliteStagger', durationMs: num(cfg.staggerMs, 600) };
  }

  _bossPoise(boss, amt) {
    const cfg = this.cfg.poise.boss;
    const st = this.bossPoise;
    if (st.cooldownLeftMs > 0) return null;
    st.gauge += amt;
    const th = this.bossPoiseThreshold();
    if (st.gauge < th) return null;
    st.gauge = 0;
    st.breaks += 1;
    st.thresholdMult = Math.min(num(cfg.thresholdMaxMult, 3), st.thresholdMult * num(cfg.thresholdGrowth, 1.25));
    st.cooldownLeftMs = num(cfg.breakCooldownMs, 1500);
    st.reactionLeftMs = num(cfg.reactionMs, 300);
    st.exposedLeftMs = num(cfg.exposedMs, 4000);
    // 反応時間はボス側の行動（予告/突進を含む）を中断する。氷砕硬直（chase 中のみ）との差別化点。
    if (typeof boss.applyPoiseStagger === 'function') boss.applyPoiseStagger(st.reactionLeftMs);
    this.telemetry.bossStanceBreaks += 1;
    this._emit('bossStanceBreak', { target: boss, reactionMs: st.reactionLeftMs, exposedMs: st.exposedLeftMs, breaks: st.breaks });
    return { type: 'bossStanceBreak', reactionMs: st.reactionLeftMs, exposedMs: st.exposedLeftMs };
  }

  // 通常敵/エリートへのノックバック量を解決する（エリートは大幅軽減し主に poise へ変換）。
  resolveKnockback(target, force) {
    if (!this.enabled || !target) return { knockback: 0, poiseBonus: 0 };
    const f = Math.max(0, num(force, 0)) * this.knockbackMultiplier();
    if (f <= 0) return { knockback: 0, poiseBonus: 0 };
    if (target.isBoss) return { knockback: 0, poiseBonus: 0 };   // ボスは通常ノックバックしない
    if (target.isElite) {
      const cfg = this.cfg.poise.elite;
      return { knockback: f * (1 - num(cfg.knockbackReduction, 0.75)), poiseBonus: f * num(cfg.knockbackToPoise, 0.7) };
    }
    this.telemetry.knockbacks += 1;
    return { knockback: f, poiseBonus: 0 };
  }

  // ---- 毎フレーム更新（一時停止中は呼ばない）----
  update(dt) {
    if (!this.enabled) return;
    const d = Math.max(0, num(dt, 0));
    if (d <= 0) return;

    // 闘気解放。
    if (this.releaseLeftMs > 0) {
      this.releaseLeftMs = Math.max(0, this.releaseLeftMs - d);
      this.telemetry.furyReleaseUptimeMs += d;
      if (this.releaseLeftMs === 0) { this.fury = 0; this._emit('furyReleaseEnd', {}); }
    }
    // 闘気解放の回復（時間経過で徐々に・一括全快しない・overheal しない）。
    if (this.recovery.leftMs > 0 && this.recovery.remainAmount > 0) {
      const step = Math.min(this.recovery.leftMs, d);
      const portion = this.recovery.remainAmount * (step / this.recovery.leftMs);
      const healed = num(this._heal(portion), 0);
      this.telemetry.recoveryAmount += healed;
      if (portion - healed > 0) this.telemetry.overhealPrevented += (portion - healed);
      this.recovery.remainAmount -= portion;
      this.recovery.leftMs -= step;
      if (this.recovery.leftMs <= 0) { this.recovery.leftMs = 0; this.recovery.remainAmount = 0; }
    }
    // コンボ（grace → 毎秒減衰）。
    if (this.combo > 0) {
      this.telemetry.comboActiveMs += d;
      this.telemetry.comboSum += this.combo; this.telemetry.comboSamples += 1;
      if (this.comboGraceLeftMs > 0) this.comboGraceLeftMs = Math.max(0, this.comboGraceLeftMs - d);
      else {
        const dec = num(this.cfg.combo.decayPerSec, 8) * Math.max(0, this.mods.comboDecayMult) * (d / 1000);
        const before = this.combo;
        this.combo = Math.max(0, this.combo - dec);
        if (before > 0 && this.combo <= 0) { this.telemetry.comboBreaks += 1; this._emit('comboBreak', {}); }
      }
    }
    // 不屈。
    const u = this.unyielding;
    if (u.activeLeftMs > 0) u.activeLeftMs = Math.max(0, u.activeLeftMs - d);
    if (u.cooldownLeftMs > 0) u.cooldownLeftMs = Math.max(0, u.cooldownLeftMs - d);
    if (u.healLeftMs > 0 && u.healRemain > 0) {
      const step = Math.min(u.healLeftMs, d);
      const portion = u.healRemain * (step / u.healLeftMs);
      const healed = num(this._heal(portion), 0);
      this.telemetry.unyieldingHealing += healed;
      if (portion - healed > 0) this.telemetry.overhealPrevented += (portion - healed);
      u.healRemain -= portion;
      u.healLeftMs -= step;
      if (u.healLeftMs <= 0) { u.healLeftMs = 0; u.healRemain = 0; }
    }
    // ボス体勢。
    const bp = this.bossPoise;
    if (bp.cooldownLeftMs > 0) bp.cooldownLeftMs = Math.max(0, bp.cooldownLeftMs - d);
    if (bp.reactionLeftMs > 0) bp.reactionLeftMs = Math.max(0, bp.reactionLeftMs - d);
    if (bp.exposedLeftMs > 0) {
      bp.exposedLeftMs = Math.max(0, bp.exposedLeftMs - d);
      this.telemetry.exposedUptimeMs += d;
      if (bp.exposedLeftMs === 0) this._emit('bossExposedEnd', {});
    } else if (bp.gauge > 0) {
      bp.gauge = Math.max(0, bp.gauge - num(this.cfg.poise.decayPerSec, 6) * (d / 1000));
    }
    // M8-C: 戦吼の一時バフ（時間で必ず切れる。重ねがけしていないので単純減算でよい）。
    if (this.warCry.leftMs > 0) {
      this.warCry.leftMs = Math.max(0, this.warCry.leftMs - d);
      this.telemetry.warCryUptimeMs += d;
      if (this.warCry.leftMs === 0) {
        this.warCry = { leftMs: 0, meleeDamageBonus: 0, furyGainBonus: 0, comboGraceBonus: 0 };
        this._emit('warCryEnd', {});
      }
    }
    // M8-C: 反撃の構え（時間切れで閉じる。使い切った構えも時間で消える）。
    if (this._counterGlobalCdLeftMs > 0) this._counterGlobalCdLeftMs = Math.max(0, this._counterGlobalCdLeftMs - d);
    if (this.counterWindows.size > 0) {
      for (const [src, w] of this.counterWindows) {
        w.leftMs = Math.max(0, w.leftMs - d);
        if (w.gapLeftMs > 0) w.gapLeftMs = Math.max(0, w.gapLeftMs - d);
        if (w.leftMs === 0) this.counterWindows.delete(src);
      }
    }
    // 不屈の判定（HP は setHp で毎フレーム更新済み）。
    this.checkUnyielding();
  }

  // ---- 保存 / 復元（active_run）----
  serialize() {
    return {
      fury: this.fury,
      releaseLeftMs: this.releaseLeftMs,
      recovery: { leftMs: this.recovery.leftMs, totalMs: this.recovery.totalMs, remainAmount: this.recovery.remainAmount },
      combo: this.combo,
      comboGraceLeftMs: this.comboGraceLeftMs,
      unyielding: { ...this.unyielding },
      bossPoise: { ...this.bossPoise },
      chargeLeftMs: Math.max(0, this._chargeUntilMs - this._now()),
      // M8-C: 一時バフ・反撃の構え（対象オブジェクトは保存しない＝残り時間と回数だけ）。
      timedBuffs: this.serializeTimedBuffs(),
      telemetry: this._serializeTelemetry(),
    };
  }

  // M8-C: 時間つき状態（戦吼バフ・反撃の構え）の保存 / 復元。
  // enemy / boss / Timer / Tween / Graphics / callback は一切保存しない（残り時間と使用回数のみ）。
  serializeTimedBuffs() {
    const windows = {};
    for (const [src, w] of this.counterWindows) {
      if (w.leftMs <= 0) continue;
      windows[src] = { leftMs: w.leftMs, used: w.used, max: w.max, priority: w.priority, mitigation: w.mitigation, gapMs: w.gapMs, gapLeftMs: w.gapLeftMs };
    }
    return {
      warCry: { ...this.warCry },
      counterWindows: windows,
      counterGlobalCdLeftMs: this._counterGlobalCdLeftMs,
    };
  }
  restoreTimedBuffs(s) {
    this.warCry = { leftMs: 0, meleeDamageBonus: 0, furyGainBonus: 0, comboGraceBonus: 0 };
    this.counterWindows = new Map();
    this._counterGlobalCdLeftMs = 0;
    if (!s || typeof s !== 'object') return;
    const cfg = this.cfg.warCry;
    const wc = s.warCry;
    if (wc && typeof wc === 'object' && num(wc.leftMs, 0) > 0) {
      // 復元でも上限クランプを通す（壊れた保存で無限バフにならない）。
      this.warCry = {
        leftMs: clamp(num(wc.leftMs, 0), 0, num(cfg.maxDurationMs, 12000)),
        meleeDamageBonus: clamp(num(wc.meleeDamageBonus, 0), 0, num(cfg.maxMeleeDamageBonus, 0.5)),
        furyGainBonus: clamp(num(wc.furyGainBonus, 0), 0, num(cfg.maxFuryGainBonus, 0.6)),
        comboGraceBonus: clamp(num(wc.comboGraceBonus, 0), 0, num(cfg.maxComboGraceBonus, 1)),
      };
    }
    const ws = s.counterWindows;
    if (ws && typeof ws === 'object') {
      for (const [src, w] of Object.entries(ws)) {
        if (!w || typeof w !== 'object') continue;
        const leftMs = num(w.leftMs, 0);
        if (leftMs <= 0) continue;
        const max = Math.max(1, Math.round(num(w.max, 1)));
        // used も復元する＝再読込で構えを使い直せない。
        this.counterWindows.set(src, {
          leftMs, used: clamp(Math.round(num(w.used, 0)), 0, max), max,
          priority: num(w.priority, 0), mitigation: clamp(num(w.mitigation, 0), 0, 1),
          gapMs: Math.max(0, num(w.gapMs, 0)), gapLeftMs: Math.max(0, num(w.gapLeftMs, 0)),
        });
      }
    }
    this._counterGlobalCdLeftMs = Math.max(0, num(s.counterGlobalCdLeftMs, 0));
  }

  _serializeTelemetry() {
    const t = this.telemetry;
    return {
      meleeCasts: t.meleeCasts, meleeHits: t.meleeHits, physicalDamage: t.physicalDamage,
      comboPeak: t.comboPeak, comboSum: t.comboSum, comboSamples: t.comboSamples, comboBreaks: t.comboBreaks,
      comboThresholdCounts: { ...t.comboThresholdCounts }, comboActiveMs: t.comboActiveMs,
      furyGained: t.furyGained, furyBySource: { ...t.furyBySource }, furyOvercap: t.furyOvercap,
      furyReleases: t.furyReleases, furyReleaseUptimeMs: t.furyReleaseUptimeMs,
      furyReleaseIntervalSumMs: t.furyReleaseIntervalSumMs,
      recoveryAmount: t.recoveryAmount, overhealPrevented: t.overhealPrevented,
      mitigationAmount: t.mitigationAmount,
      unyieldingTriggers: t.unyieldingTriggers, unyieldingHealing: t.unyieldingHealing,
      unyieldingMitigated: t.unyieldingMitigated, deathsAfterUnyielding: t.deathsAfterUnyielding,
      killHeal: t.killHeal, killHealCapped: t.killHealCapped,
      knockbacks: t.knockbacks, poiseDamage: t.poiseDamage,
      eliteStaggers: t.eliteStaggers, bossStanceBreaks: t.bossStanceBreaks,
      exposedUptimeMs: t.exposedUptimeMs, exposedBonusDamage: t.exposedBonusDamage, exposedBonusFury: t.exposedBonusFury,
      executions: t.executions, executeFailures: t.executeFailures, executeOverkill: t.executeOverkill,
      counters: t.counters, counterBySource: { ...t.counterBySource },
      warCryApplications: t.warCryApplications, warCryUptimeMs: t.warCryUptimeMs,
      chainPulls: t.chainPulls, chainPullDistance: t.chainPullDistance, bossApproaches: t.bossApproaches,
      leapLandings: t.leapLandings, sweepDistance: t.sweepDistance,
      relentlessChains: t.relentlessChains, relentlessRetargets: t.relentlessRetargets,
    };
  }

  restore(s) {
    if (!s) return;
    const max = num(this.cfg.fury.max, 100);
    this.fury = clamp(num(s.fury, 0), 0, max);
    this.releaseLeftMs = Math.max(0, num(s.releaseLeftMs, 0));
    const rc = s.recovery || {};
    this.recovery = {
      leftMs: Math.max(0, num(rc.leftMs, 0)),
      totalMs: Math.max(0, num(rc.totalMs, 0)),
      remainAmount: Math.max(0, num(rc.remainAmount, 0)),
    };
    this.combo = Math.max(0, num(s.combo, 0));
    this.comboGraceLeftMs = Math.max(0, num(s.comboGraceLeftMs, 0));
    const u = s.unyielding || {};
    this.unyielding = {
      cooldownLeftMs: Math.max(0, num(u.cooldownLeftMs, 0)),
      activeLeftMs: Math.max(0, num(u.activeLeftMs, 0)),
      healLeftMs: Math.max(0, num(u.healLeftMs, 0)),
      healRemain: Math.max(0, num(u.healRemain, 0)),
      triggers: Math.max(0, num(u.triggers, 0)),
    };
    const bp = s.bossPoise || {};
    this.bossPoise = {
      gauge: Math.max(0, num(bp.gauge, 0)),
      thresholdMult: clamp(num(bp.thresholdMult, 1), 1, num(this.cfg.poise.boss.thresholdMaxMult, 3)),
      breaks: Math.max(0, num(bp.breaks, 0)),
      cooldownLeftMs: Math.max(0, num(bp.cooldownLeftMs, 0)),
      exposedLeftMs: Math.max(0, num(bp.exposedLeftMs, 0)),
      reactionLeftMs: Math.max(0, num(bp.reactionLeftMs, 0)),
    };
    this._chargeUntilMs = this._now() + Math.max(0, num(s.chargeLeftMs, 0));
    // 再開直後に「無料の 1 秒ぶん」を作らないよう、獲得ウィンドウを現在時刻で開き直す。
    const now = this._now();
    this._furySecondWindow = { startMs: now, gained: 0 };
    this._killHealWindow = { startMs: now, healed: 0 };
    this._castBudgets.clear();
    this._targetHitAt.clear();
    this._runStartMs = now - num(this.cfg.unyielding.minRunTimeMs, 0); // 再開直後の猶予は保存前に消化済みとみなす
    if (s.telemetry) {
      const t = this.telemetry;
      for (const k of Object.keys(t)) {
        if (k === 'furyBySource' || k === 'comboThresholdCounts' || k === '_lastReleaseAt') continue;
        if (typeof s.telemetry[k] === 'number' && Number.isFinite(s.telemetry[k])) t[k] = s.telemetry[k];
      }
      if (s.telemetry.furyBySource) for (const k of FURY_SOURCES) {
        if (typeof s.telemetry.furyBySource[k] === 'number') t.furyBySource[k] = s.telemetry.furyBySource[k];
      }
      if (s.telemetry.comboThresholdCounts) t.comboThresholdCounts = { ...s.telemetry.comboThresholdCounts };
      if (s.telemetry.counterBySource) t.counterBySource = { ...s.telemetry.counterBySource };
    }
    // M8-C: 一時バフ・反撃の構え（残り時間と使用回数を引き継ぐ＝再読込で撃ち直せない）。
    this.restoreTimedBuffs(s.timedBuffs);
  }

  // ---- 後始末（Scene 終了 / 周回終了 / ジョブ切替）----
  destroy() {
    this._castBudgets.clear();
    this._targetHitAt.clear();
    this.releaseLeftMs = 0;
    this.recovery = { leftMs: 0, totalMs: 0, remainAmount: 0 };
    this.unyielding.activeLeftMs = 0;
    this.unyielding.healLeftMs = 0;
    this.unyielding.healRemain = 0;
    this.bossPoise.exposedLeftMs = 0;
    this.bossPoise.reactionLeftMs = 0;
    // M8-C: 一時バフ・反撃の構えも破棄する（Scene 終了で持ち越さない）。
    this.warCry = { leftMs: 0, meleeDamageBonus: 0, furyGainBonus: 0, comboGraceBonus: 0 };
    this.counterWindows.clear();
    this._counterGlobalCdLeftMs = 0;
    this._emit = () => {};
    this._heal = () => 0;
  }

  // 敵が死亡/プール返却されたときに戦士側のマーカーを落とす。
  onEnemyRemoved(e) {
    if (!e) return;
    e._poise = 0;
    e._poiseImmuneUntil = 0;
    e._staggerUntil = 0;
    e._staggerSlow = 0;
    this._targetHitAt.delete(e);
  }

  // ボス死亡でボス体勢の状態を落とす（次のボスへ持ち越さない）。
  onBossRemoved() {
    this.bossPoise = { gauge: 0, thresholdMult: 1, breaks: 0, cooldownLeftMs: 0, exposedLeftMs: 0, reactionLeftMs: 0 };
  }

  // ---- テレメトリの要約（F8 / CombatTelemetry.noteWarriorSummary へ渡す）----
  // キー名は CombatTelemetry.warrior と 1:1 に対応させる（時間は秒へ換算）。
  summary() {
    const t = this.telemetry;
    return {
      meleeCasts: t.meleeCasts, meleeHits: t.meleeHits, physicalDamage: t.physicalDamage,
      comboPeak: t.comboPeak,
      comboAvg: t.comboSamples > 0 ? t.comboSum / t.comboSamples : 0,
      comboBreaks: t.comboBreaks,
      comboActiveSeconds: t.comboActiveMs / 1000,
      comboThresholdCounts: { ...t.comboThresholdCounts },
      furyGained: t.furyGained, furyBySource: { ...t.furyBySource }, furyOvercap: t.furyOvercap,
      furyReleases: t.furyReleases,
      furyReleaseUptimeSeconds: t.furyReleaseUptimeMs / 1000,
      furyReleaseAvgIntervalSeconds: t.furyReleases > 1 ? (t.furyReleaseIntervalSumMs / (t.furyReleases - 1)) / 1000 : 0,
      recoveryAmount: t.recoveryAmount, overhealPrevented: t.overhealPrevented,
      mitigationAmount: t.mitigationAmount,
      unyieldingTriggers: t.unyieldingTriggers, unyieldingHealing: t.unyieldingHealing,
      unyieldingMitigated: t.unyieldingMitigated, deathsAfterUnyielding: t.deathsAfterUnyielding,
      killHeal: t.killHeal, killHealCapped: t.killHealCapped,
      knockbacks: t.knockbacks, poiseDamage: t.poiseDamage,
      eliteStaggers: t.eliteStaggers, bossStanceBreaks: t.bossStanceBreaks,
      exposedUptimeSeconds: t.exposedUptimeMs / 1000,
      exposedBonusDamage: t.exposedBonusDamage, exposedBonusFury: t.exposedBonusFury,
      // M8-C
      executions: t.executions, executeFailures: t.executeFailures, executeOverkill: t.executeOverkill,
      counters: t.counters, counterBySource: { ...t.counterBySource },
      warCryApplications: t.warCryApplications, warCryUptimeSeconds: t.warCryUptimeMs / 1000,
      chainPulls: t.chainPulls, chainPullDistance: t.chainPullDistance, bossApproaches: t.bossApproaches,
      leapLandings: t.leapLandings, sweepDistance: t.sweepDistance,
      relentlessChains: t.relentlessChains, relentlessRetargets: t.relentlessRetargets,
      // 現在値（F8/F9 のライブ表示用。CombatTelemetry へは取り込まれない）。
      fury: this.fury, combo: this.combo, bossPoiseGauge: this.bossPoise.gauge,
    };
  }
}
